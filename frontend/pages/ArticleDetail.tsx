import React, { useState, useEffect, useMemo } from 'react';
import { DetailSkeleton } from '../components/Skeleton';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { Badge, Button, EmptyState } from '../components/Shared';
import MarkdownContent from '../components/MarkdownContent';
import {
  getArticle,
  getArticleBySlug,
  Article,
  getAllArticles,
  likeArticle,
  getArticleLikeStatus,
  ArticleListItem,
} from '../api/articles';
import {
  getArticleComments,
  submitComment,
  likeComment,
  reportComment,
  updateComment,
  deleteComment,
  Comment,
} from '../api/comments';
import { getBookmarkStatus, toggleBookmark } from '../api/users';
import { recordPageView } from '../api/stats';
import FloatingActions from '../components/FloatingActions';
import ArticleSidebar from '../components/ArticleSidebar';
import Avatar from '../components/Avatar';
import { extractHeadingsFromMarkdown } from '../components/MarkdownRenderer';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { copyToClipboard } from '../utils/helpers';
import { errorText } from '../utils/errors';

const REPORT_REASONS = [
  { value: 'spam', label: '垃圾广告' },
  { value: 'abuse', label: '辱骂攻击' },
  { value: 'illegal', label: '违法信息' },
  { value: 'porn', label: '色情低俗' },
  { value: 'misleading', label: '虚假信息' },
  { value: 'other', label: '其他原因' },
];

const getCommentDisplayName = (comment: Comment): string => {
  if (comment.user_display_name) return comment.user_display_name;
  if (comment.is_admin_reply) return comment.admin_display_name || '作者';
  return comment.username || comment.nickname || '匿名读者';
};

const getCleanCommentAvatar = (comment: Comment): string | undefined => {
  if (!comment.user_id || !comment.avatar_url) return undefined;
  if (comment.avatar_url.includes('dicebear.com')) return undefined;
  return comment.avatar_url;
};

const ArticleDetail: React.FC = () => {
  const { id, slug } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, isAdmin } = useAuth();
  const { showToast } = useToast();
  const { confirm, confirmDialog } = useConfirm();

  const [article, setArticle] = useState<Article | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  // 根评论表单
  const [commentText, setCommentText] = useState('');
  const [nickname, setNickname] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [activeHeading, setActiveHeading] = useState<string>('');
  const [prevArticle, setPrevArticle] = useState<ArticleListItem | null>(null);
  const [nextArticle, setNextArticle] = useState<ArticleListItem | null>(null);
  const [relatedArticles, setRelatedArticles] = useState<ArticleListItem[]>([]);

  // 回复表单
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyNickname, setReplyNickname] = useState('');

  // 行内编辑
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // 举报
  const [reportingComment, setReportingComment] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');

  // 评论交互状态
  const [likedComments, setLikedComments] = useState<Set<number>>(new Set());
  const [expandedTexts, setExpandedTexts] = useState<Set<number>>(new Set());
  const [expandedNested, setExpandedNested] = useState<Set<number>>(new Set());

  const COMMENT_MAX_LEN = 200;
  const NESTED_REPLY_LIMIT = 2;

  // 文章点赞 & 收藏
  const [articleLiked, setArticleLiked] = useState(false);
  const [articleLikeCount, setArticleLikeCount] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);

  // 评论展开与移动端目录
  const [expandedReplies, setExpandedReplies] = useState<Record<number, boolean>>({});
  const [showMobileTOC, setShowMobileTOC] = useState(false);

  const toggleText = (cid: number) =>
    setExpandedTexts((prev) => {
      const next = new Set(prev);
      next.has(cid) ? next.delete(cid) : next.add(cid);
      return next;
    });

  const collectAllDescendantIds = (comment: Comment): number[] => {
    const ids: number[] = [];
    for (const reply of comment.replies || []) {
      ids.push(reply.id);
      ids.push(...collectAllDescendantIds(reply));
    }
    return ids;
  };

  const findCommentById = (list: Comment[], cid: number): Comment | null => {
    for (const c of list) {
      if (c.id === cid) return c;
      const found = findCommentById(c.replies || [], cid);
      if (found) return found;
    }
    return null;
  };

  const toggleNested = (cid: number) =>
    setExpandedNested((prev) => {
      const next = new Set(prev);
      const target = findCommentById(comments, cid);
      const descendantIds = target ? collectAllDescendantIds(target) : [];
      if (next.has(cid)) {
        next.delete(cid);
        descendantIds.forEach((did) => next.delete(did));
      } else {
        next.add(cid);
        descendantIds.forEach((did) => next.add(did));
      }
      return next;
    });

  const headings = useMemo(() => {
    if (!article?.content_md) return [];
    return extractHeadingsFromMarkdown(article.content_md);
  }, [article?.content_md]);

  useEffect(() => {
    if (headings.length === 0) return;

    const handleScroll = () => {
      const headingElements = headings
        .map((h) => ({ id: h.id, element: document.getElementById(h.id) }))
        .filter((h) => h.element);

      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 150) {
        if (headings.length > 0) {
          setActiveHeading(headings[headings.length - 1].id);
          return;
        }
      }

      let current = '';
      for (const { id: hid, element } of headingElements) {
        if (element) {
          const rect = element.getBoundingClientRect();
          if (rect.top < 120) {
            current = hid;
          }
        }
      }
      setActiveHeading(current);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [headings]);

  useEffect(() => {
    const fetchData = async () => {
      if (!id && !slug) return;
      setLoading(true);
      setPrevArticle(null);
      setNextArticle(null);
      setRelatedArticles([]);
      setBookmarked(false);
      try {
        let articleRes: Article;
        if (id && !isNaN(parseInt(id, 10))) {
          articleRes = await getArticle(parseInt(id, 10));
        } else if (slug) {
          articleRes = await getArticleBySlug(slug);
        } else {
          throw new Error('无效的文章标识');
        }

        setArticle(articleRes);
        setArticleLikeCount(articleRes.like_count || 0);

        const [likeRes, commentsRes] = await Promise.all([
          getArticleLikeStatus(articleRes.id).catch(() => null),
          getArticleComments(articleRes.id).catch(() => []),
        ]);
        if (likeRes) setArticleLiked(likeRes.liked);
        setComments(commentsRes);

        try {
          const allArticlesRes = await getAllArticles();
          const allArticles = Array.isArray(allArticlesRes) ? allArticlesRes : (allArticlesRes as any).data || [];
          const publishedArticles: ArticleListItem[] = allArticles
            .filter((a: any) => a.published_at && a.status === 'published')
            .sort((a: any, b: any) => new Date(b.published_at!).getTime() - new Date(a.published_at!).getTime());

          const currentIndex = publishedArticles.findIndex((a) => a.id === articleRes.id);
          if (currentIndex > 0) setPrevArticle(publishedArticles[currentIndex - 1]);
          if (currentIndex >= 0 && currentIndex < publishedArticles.length - 1) {
            setNextArticle(publishedArticles[currentIndex + 1]);
          }

          // 计算相关文章推荐（匹配同标签或同分类）
          const currentTagSet = new Set((articleRes.tags || []).map((t) => t.name));
          const scored = publishedArticles
            .filter((a) => a.id !== articleRes.id)
            .map((a) => {
              const tagOverlap = (a.tags || []).filter((t) => currentTagSet.has(t.name)).length;
              const sameCategory = articleRes.category && a.category === articleRes.category ? 2 : 0;
              return { item: a, score: tagOverlap * 3 + sameCategory };
            })
            .filter((s) => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map((s) => s.item);
          setRelatedArticles(scored.length > 0 ? scored : publishedArticles.filter((a) => a.id !== articleRes.id).slice(0, 5));
        } catch (err) {
          console.error('获取相关文章列表失败:', err);
        }

        recordPageView({ page_path: `/articles/${articleRes.id}`, article_id: articleRes.id }).catch(() => {});
      } catch (error) {
        console.error('获取文章失败:', error);
        setArticle(null);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    window.scrollTo(0, 0);
  }, [id, slug]);

  // 同步收藏状态（登录态变化时更新）
  useEffect(() => {
    if (!article?.id || !isAuthenticated) {
      setBookmarked(false);
      return;
    }
    let mounted = true;
    getBookmarkStatus('article', article.id)
      .then((res) => {
        if (mounted) setBookmarked(Boolean(res.bookmarked));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [article?.id, isAuthenticated]);

  const refreshComments = async () => {
    if (!article) return;
    const commentsRes = await getArticleComments(article.id);
    setComments(commentsRes);
  };

  const handleToggleBookmark = async () => {
    if (!article) return;
    if (!isAuthenticated) {
      showToast('请先登录后收藏文章', 'info');
      navigate(`/login?redirect=${encodeURIComponent(`/articles/${article.id}`)}`);
      return;
    }
    if (bookmarkLoading) return;
    setBookmarkLoading(true);
    try {
      const res = await toggleBookmark('article', article.id);
      setBookmarked(res.bookmarked);
      showToast(res.bookmarked ? '已加入收藏' : '已取消收藏', 'success');
    } catch (err: any) {
      showToast(errorText(err, '收藏操作失败'), 'error');
    } finally {
      setBookmarkLoading(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!article || !commentText.trim()) {
      showToast('请填写评论内容', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await submitComment(
        article.id,
        isAuthenticated
          ? { content: commentText.trim() }
          : {
              nickname: nickname.trim() || undefined,
              email: guestEmail.trim() || undefined,
              content: commentText.trim(),
            },
      );
      setCommentText('');
      showToast('评论已发布', 'success');
      await refreshComments();
    } catch (error: any) {
      showToast(errorText(error, '提交失败'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReply = async (parentId: number) => {
    if (!article || !replyText.trim()) {
      showToast('请填写回复内容', 'error');
      return;
    }
    try {
      await submitComment(
        article.id,
        isAuthenticated
          ? { content: replyText.trim(), parent_id: parentId }
          : {
              nickname: replyNickname.trim() || undefined,
              content: replyText.trim(),
              parent_id: parentId,
            },
      );
      setReplyText('');
      setReplyingTo(null);
      setExpandedReplies((prev) => ({ ...prev, [parentId]: true }));
      showToast('回复已发布', 'success');
      await refreshComments();
    } catch (error: any) {
      showToast(errorText(error, '回复失败'), 'error');
    }
  };

  const updateCommentInTree = (
    list: Comment[],
    cid: number,
    updater: (c: Comment) => Comment,
  ): Comment[] =>
    list.map((c) => {
      if (c.id === cid) return updater(c);
      if (c.replies?.length) return { ...c, replies: updateCommentInTree(c.replies, cid, updater) };
      return c;
    });

  const handleSaveEdit = async (commentId: number) => {
    if (!editingText.trim()) {
      showToast('评论内容不能为空', 'error');
      return;
    }
    setSavingEdit(true);
    try {
      const updated = await updateComment(commentId, editingText.trim());
      setComments((prev) =>
        updateCommentInTree(prev, commentId, (c) => ({
          ...c,
          content: updated.content,
          edited_at: updated.edited_at || new Date().toISOString(),
        })),
      );
      setEditingId(null);
      setEditingText('');
      showToast('评论已更新', 'success');
    } catch (err: any) {
      showToast(errorText(err, '编辑失败'), 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    const ok = await confirm({
      title: '删除评论',
      message: '确认删除这条评论吗？删除后将无法恢复。',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteComment(commentId);
      showToast('评论已删除', 'success');
      await refreshComments();
    } catch (err: any) {
      showToast(errorText(err, '删除失败'), 'error');
    }
  };

  const handleLike = async (commentId: number) => {
    const willLike = !likedComments.has(commentId);
    setLikedComments((prev) => {
      const next = new Set(prev);
      if (willLike) next.add(commentId);
      else next.delete(commentId);
      return next;
    });
    setComments((prev) =>
      updateCommentInTree(prev, commentId, (c) => ({
        ...c,
        like_count: Math.max(0, (c.like_count || 0) + (willLike ? 1 : -1)),
      })),
    );
    try {
      const result = await likeComment(commentId);
      setComments((prev) =>
        updateCommentInTree(prev, commentId, (c) => ({ ...c, like_count: result.like_count })),
      );
      if (result.liked !== willLike) {
        setLikedComments((prev) => {
          const next = new Set(prev);
          if (result.liked) next.add(commentId);
          else next.delete(commentId);
          return next;
        });
      }
    } catch (error: any) {
      setLikedComments((prev) => {
        const next = new Set(prev);
        if (willLike) next.delete(commentId);
        else next.add(commentId);
        return next;
      });
      setComments((prev) =>
        updateCommentInTree(prev, commentId, (c) => ({
          ...c,
          like_count: Math.max(0, (c.like_count || 0) + (willLike ? -1 : 1)),
        })),
      );
      console.error('点赞失败:', error);
    }
  };

  const handleReport = async (commentId: number) => {
    if (!reportReason) {
      showToast('请选择举报原因', 'error');
      return;
    }
    try {
      await reportComment(commentId, { reason: reportReason, description: reportDescription });
      showToast('举报成功，我们会尽快处理', 'success');
      setReportingComment(null);
      setReportReason('');
      setReportDescription('');
    } catch (error: any) {
      showToast(errorText(error, '举报失败'), 'error');
    }
  };

  const handleArticleLike = async () => {
    if (!article) return;
    try {
      const result = await likeArticle(article.id);
      setArticleLiked(result.liked);
      setArticleLikeCount(result.like_count);
    } catch (error: any) {
      showToast(errorText(error, '操作失败'), 'error');
    }
  };

  const toggleReplies = (commentId: number) => {
    setExpandedReplies((prev) => {
      const willExpand = !prev[commentId];
      const comment = comments.find((c) => c.id === commentId);
      if (comment) {
        const allIds = collectAllDescendantIds(comment);
        setExpandedNested((prevNested) => {
          const next = new Set(prevNested);
          if (willExpand) allIds.forEach((cid) => next.add(cid));
          else allIds.forEach((cid) => next.delete(cid));
          return next;
        });
      }
      return { ...prev, [commentId]: willExpand };
    });
  };

  if (loading) {
    return <DetailSkeleton />;
  }

  if (!article) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20">
        <EmptyState
          icon={<Icons.FileText className="w-6 h-6" />}
          title="文章不存在或已下架"
          description="请检查访问链接，或回到文章列表继续阅读其他内容。"
          action={
            <Link to="/articles">
              <Button size="sm">返回文章列表</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const countAllComments = (list: Comment[]): number =>
    list.reduce((acc, c) => acc + 1 + countAllComments(c.replies || []), 0);

  const MAX_REPLY_DEPTH = 2;

  const renderReplyForm = (targetId: number, displayName: string) => (
    <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40 p-3.5 transition-colors space-y-2.5">
      {!isAuthenticated && (
        <input
          type="text"
          placeholder="你的昵称（可选）"
          value={replyNickname}
          onChange={(e) => setReplyNickname(e.target.value)}
          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:outline-none dark:text-white transition-colors"
        />
      )}
      <textarea
        placeholder={`回复 @${displayName}...`}
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:outline-none resize-none h-20 dark:text-white transition-colors"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setReplyingTo(null)}
          className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
        >
          取消
        </button>
        <Button size="sm" onClick={() => handleSubmitReply(targetId)}>
          发送回复
        </Button>
      </div>
    </div>
  );

  const renderCommentHeader = (comment: Comment) => {
    const displayName = getCommentDisplayName(comment);
    const isAuthorBadge =
      comment.is_admin_reply || comment.user_role === 'admin' || comment.user_role === 'super_admin';

    return (
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        {comment.username ? (
          <Link
            to={`/user/${encodeURIComponent(comment.username)}`}
            className={`text-sm font-semibold hover:underline ${
              isAuthorBadge ? 'text-primary-600 dark:text-primary-400' : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {displayName}
          </Link>
        ) : (
          <span
            className={`text-sm font-semibold ${
              isAuthorBadge ? 'text-primary-600 dark:text-primary-400' : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {displayName}
          </span>
        )}

        {isAuthorBadge ? (
          <Badge color="primary" className="text-[10px] py-0">
            {comment.is_admin_reply ? '作者回复' : '站长'}
          </Badge>
        ) : comment.user_id ? (
          <Badge color="slate" className="text-[10px] py-0">
            成员
          </Badge>
        ) : null}

        <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
          {new Date(comment.created_at).toLocaleDateString('zh-CN')}
        </span>

        {comment.edited_at && (
          <span className="text-[11px] text-slate-400 dark:text-slate-500">(已编辑)</span>
        )}
      </div>
    );
  };

  const renderReply = (reply: Comment, depth: number = 1) => {
    const isLong = reply.content.length > COMMENT_MAX_LEN;
    const isTextExpanded = expandedTexts.has(reply.id);
    const nestedReplies = reply.replies || [];
    const isNestedExpanded = expandedNested.has(reply.id);
    const foldedByDepth = depth >= MAX_REPLY_DEPTH && nestedReplies.length > 0;
    const visibleNested = isNestedExpanded
      ? nestedReplies
      : foldedByDepth
        ? []
        : nestedReplies.slice(0, NESTED_REPLY_LIMIT);
    const showToggle = foldedByDepth || nestedReplies.length > NESTED_REPLY_LIMIT;
    const displayName = getCommentDisplayName(reply);
    const canManage = isAdmin || (!!user && reply.user_id === user.id);
    const isEditing = editingId === reply.id;

    return (
      <div
        key={reply.id}
        className={`py-3 transition-colors ${
          reply.is_admin_reply
            ? 'rounded-xl bg-primary-50/35 dark:bg-primary-950/20 border-l-2 border-primary-500 px-3 -mx-1 my-1'
            : ''
        }`}
      >
        <div className="flex gap-3">
          {reply.username ? (
            <Link to={`/user/${encodeURIComponent(reply.username)}`} className="shrink-0">
              <Avatar name={displayName} avatarUrl={getCleanCommentAvatar(reply)} className="w-7 h-7 text-xs ring-1 ring-slate-200 dark:ring-slate-700" />
            </Link>
          ) : (
            <Avatar name={displayName} avatarUrl={getCleanCommentAvatar(reply)} className="w-7 h-7 text-xs ring-1 ring-slate-200 dark:ring-slate-700" />
          )}

          <div className="flex-1 min-w-0">
            {renderCommentHeader(reply)}

            {isEditing ? (
              <div className="mt-2 space-y-2">
                <textarea
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setEditingText(''); }}>
                    取消
                  </Button>
                  <Button size="sm" disabled={savingEdit} onClick={() => handleSaveEdit(reply.id)}>
                    {savingEdit ? '保存中...' : '保存'}
                  </Button>
                </div>
              </div>
            ) : isLong && !isTextExpanded ? (
              <div>
                <MarkdownContent compact enableMermaid={false} allowHtml={false} className="dark:text-slate-300 text-sm">
                  {reply.content.slice(0, COMMENT_MAX_LEN) + '...'}
                </MarkdownContent>
                <button
                  type="button"
                  onClick={() => toggleText(reply.id)}
                  className="text-xs text-primary-600 dark:text-primary-400 hover:underline mt-1"
                >
                  展开全文
                </button>
              </div>
            ) : (
              <div>
                <MarkdownContent compact enableMermaid={false} allowHtml={false} className="dark:text-slate-300 text-sm">
                  {reply.content}
                </MarkdownContent>
                {isLong && (
                  <button
                    type="button"
                    onClick={() => toggleText(reply.id)}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline mt-1"
                  >
                    收起
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-400 dark:text-slate-500">
              <button
                type="button"
                onClick={() => handleLike(reply.id)}
                className={`flex items-center gap-1 hover:text-red-500 transition-colors cursor-pointer ${likedComments.has(reply.id) ? 'text-red-500' : ''}`}
              >
                <Icons.Heart
                  key={`${reply.id}-${likedComments.has(reply.id)}`}
                  className={`w-3.5 h-3.5 ${likedComments.has(reply.id) ? 'fill-red-500 like-pop' : ''}`}
                />
                <span className="tabular-nums">{reply.like_count || 0}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (replyingTo !== reply.id) setReplyText('');
                  setReplyingTo(replyingTo === reply.id ? null : reply.id);
                  setReplyNickname(nickname);
                }}
                className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer"
              >
                回复
              </button>
              {canManage && !isEditing && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(reply.id);
                      setEditingText(reply.content);
                      setReplyingTo(null);
                    }}
                    className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteComment(reply.id)}
                    className="hover:text-red-500 transition-colors cursor-pointer"
                  >
                    删除
                  </button>
                </>
              )}
            </div>

            {replyingTo === reply.id && renderReplyForm(reply.id, displayName)}

            {nestedReplies.length > 0 && (
              <div className="mt-2 pl-3 border-l border-slate-200 dark:border-slate-800">
                {visibleNested.length > 0 && (
                  <div className="space-y-0 divide-y divide-slate-100 dark:divide-slate-800/80">
                    {visibleNested.map((nested) => renderReply(nested, depth + 1))}
                  </div>
                )}
                {showToggle && (
                  <button
                    type="button"
                    onClick={() => toggleNested(reply.id)}
                    className="mt-1 text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium flex items-center gap-1 cursor-pointer"
                  >
                    {isNestedExpanded
                      ? '收起回复 ↑'
                      : foldedByDepth
                        ? `展开 ${countAllComments(nestedReplies)} 条回复 ↓`
                        : `展开更多回复 (${nestedReplies.length - NESTED_REPLY_LIMIT}条) ↓`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderComment = (comment: Comment) => {
    const replies = comment.replies || [];
    const isExpanded = expandedReplies[comment.id];
    const visibleReplies = isExpanded ? replies : replies.slice(0, 2);
    const hasMoreReplies = replies.length > 2;
    const displayName = getCommentDisplayName(comment);
    const canManage = isAdmin || (!!user && comment.user_id === user.id);
    const isOwn = !!user && comment.user_id === user.id;
    const isEditing = editingId === comment.id;

    return (
      <div
        key={comment.id}
        className={`py-5 border-b border-slate-100 dark:border-slate-800 last:border-b-0 transition-colors ${
          comment.is_admin_reply
            ? 'rounded-xl bg-primary-50/35 dark:bg-primary-950/20 border-l-2 border-primary-500 px-4 -mx-2 my-1'
            : ''
        }`}
      >
        <div className="flex gap-3">
          {comment.username ? (
            <Link to={`/user/${encodeURIComponent(comment.username)}`} className="shrink-0">
              <Avatar name={displayName} avatarUrl={getCleanCommentAvatar(comment)} className="w-9 h-9 text-sm ring-1 ring-slate-200 dark:ring-slate-700" />
            </Link>
          ) : (
            <Avatar name={displayName} avatarUrl={getCleanCommentAvatar(comment)} className="w-9 h-9 text-sm ring-1 ring-slate-200 dark:ring-slate-700" />
          )}

          <div className="flex-1 min-w-0">
            {renderCommentHeader(comment)}

            {isEditing ? (
              <div className="mt-2 space-y-2.5">
                <textarea
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setEditingText(''); }}>
                    取消
                  </Button>
                  <Button size="sm" disabled={savingEdit} onClick={() => handleSaveEdit(comment.id)}>
                    {savingEdit ? '保存中...' : '保存修改'}
                  </Button>
                </div>
              </div>
            ) : comment.content.length > COMMENT_MAX_LEN && !expandedTexts.has(comment.id) ? (
              <div>
                <MarkdownContent compact enableMermaid={false} allowHtml={false} className="dark:text-slate-300 text-sm">
                  {comment.content.slice(0, COMMENT_MAX_LEN) + '...'}
                </MarkdownContent>
                <button
                  type="button"
                  onClick={() => toggleText(comment.id)}
                  className="text-xs text-primary-600 dark:text-primary-400 hover:underline mt-1"
                >
                  展开全文
                </button>
              </div>
            ) : (
              <div>
                <MarkdownContent compact enableMermaid={false} allowHtml={false} className="dark:text-slate-300 text-sm">
                  {comment.content}
                </MarkdownContent>
                {comment.content.length > COMMENT_MAX_LEN && (
                  <button
                    type="button"
                    onClick={() => toggleText(comment.id)}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline mt-1"
                  >
                    收起
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4 mt-2.5 text-xs text-slate-400 dark:text-slate-500">
              <button
                type="button"
                onClick={() => handleLike(comment.id)}
                className={`flex items-center gap-1.5 hover:text-red-500 transition-colors cursor-pointer ${likedComments.has(comment.id) ? 'text-red-500' : ''}`}
              >
                <Icons.Heart
                  key={`${comment.id}-${likedComments.has(comment.id)}`}
                  className={`w-3.5 h-3.5 ${likedComments.has(comment.id) ? 'fill-red-500 like-pop' : ''}`}
                />
                <span className="tabular-nums">{comment.like_count || 0}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (replyingTo !== comment.id) setReplyText('');
                  setReplyingTo(replyingTo === comment.id ? null : comment.id);
                  setReplyNickname(nickname);
                }}
                className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer"
              >
                回复
              </button>

              {canManage && !isEditing && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(comment.id);
                      setEditingText(comment.content);
                      setReplyingTo(null);
                    }}
                    className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteComment(comment.id)}
                    className="hover:text-red-500 transition-colors cursor-pointer"
                  >
                    删除
                  </button>
                </>
              )}

              {!comment.is_admin_reply && !isOwn && (
                <button
                  type="button"
                  onClick={() => setReportingComment(reportingComment === comment.id ? null : comment.id)}
                  className="hover:text-red-500 dark:hover:text-red-400 transition-colors ml-auto cursor-pointer"
                >
                  举报
                </button>
              )}
            </div>

            {replyingTo === comment.id && renderReplyForm(comment.id, displayName)}

            {reportingComment === comment.id && (
              <div className="mt-4 bg-red-50/70 dark:bg-red-950/20 rounded-xl p-4 border border-red-200/70 dark:border-red-900/40">
                <div className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2.5">选择举报原因</div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {REPORT_REASONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setReportReason(r.value)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                        reportReason === r.value
                          ? 'bg-red-600 text-white'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-red-300'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <textarea
                  placeholder="补充说明（可选）"
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-xs focus:outline-none resize-none h-16 dark:text-white"
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setReportingComment(null);
                      setReportReason('');
                    }}
                    className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReport(comment.id)}
                    className="px-3.5 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors cursor-pointer"
                  >
                    提交举报
                  </button>
                </div>
              </div>
            )}

            {replies.length > 0 && (
              <div className="mt-4 pl-3 border-l border-slate-200 dark:border-slate-800">
                <div className="space-y-0 divide-y divide-slate-100 dark:divide-slate-800/80">
                  {visibleReplies.map((reply) => renderReply(reply))}
                </div>
                {hasMoreReplies && (
                  <button
                    type="button"
                    onClick={() => toggleReplies(comment.id)}
                    className="mt-2 text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium cursor-pointer"
                  >
                    {isExpanded ? '收起 ↑' : `查看更多回复 (${replies.length - 2}条)`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const handleScrollToComments = () => {
    document.getElementById('comments-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  const authorName = article.author?.display_name || article.author?.username || '千禧';
  const authorUsername = article.author?.username;

  return (
    <div className="relative min-h-screen bg-slate-50/40 dark:bg-slate-950 transition-colors">
      <div className="max-w-screen-2xl mx-auto flex gap-0">
        {/* 左侧粘性目录 */}
        {headings.length > 2 && (
          <aside className="hidden xl:block w-64 flex-shrink-0 pt-10 ml-8">
            <div className="sticky top-20 pl-4 border-l border-slate-200/80 dark:border-slate-800">
              <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 pl-2 flex items-center gap-1.5">
                <Icons.BookOpen className="w-3.5 h-3.5 text-primary-500" /> 大纲目录
              </div>
              <nav className="space-y-0.5 text-sm max-h-[72vh] overflow-y-auto pr-2 custom-scrollbar">
                {headings.map((heading, idx) => (
                  <a
                    key={`${heading.id}-${idx}`}
                    href={`#${heading.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={`block py-1.5 px-2.5 rounded-md transition-colors border-l-2 -ml-[1px] text-[13px] leading-snug ${
                      activeHeading === heading.id
                        ? 'border-primary-500 bg-primary-50/70 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 font-medium'
                        : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                    style={{ paddingLeft: `${10 + (heading.level - 1) * 12}px` }}
                  >
                    {heading.text}
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        )}

        {/* 主体内容 */}
        <main className="flex-1 min-w-0">
          <div className="max-w-4xl mx-auto lg:mx-0 lg:ml-10 px-4 sm:px-6 py-8 sm:py-12 relative">
            {/* 顶部导航与移动端目录按钮 */}
            <div className="mb-8">
              <div className="flex items-center justify-between gap-3 mb-6">
                <button
                  type="button"
                  onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/articles'))}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 group transition-colors cursor-pointer"
                >
                  <Icons.ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                  返回
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleBookmark}
                    disabled={bookmarkLoading}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      bookmarked
                        ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <Icons.Bookmark className={`w-3.5 h-3.5 ${bookmarked ? 'fill-current' : ''}`} />
                    {bookmarked ? '已收藏' : '收藏'}
                  </button>

                  {headings.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setShowMobileTOC(true)}
                      className="xl:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer"
                    >
                      <Icons.BookOpen className="w-3.5 h-3.5" /> 目录
                    </button>
                  )}
                </div>
              </div>

              {/* 分类标签与置顶标识 */}
              {(article.category || article.is_pinned) && (
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {article.category && <Badge color="primary">{article.category}</Badge>}
                  {article.is_pinned && <Badge color="amber">置顶推荐</Badge>}
                </div>
              )}

              <h1 className="text-2xl sm:text-4xl sm:leading-tight font-bold text-slate-900 dark:text-slate-100 tracking-tight mb-5">
                {article.title}
              </h1>

              {/* 作者与元数据行 */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  {authorUsername ? (
                    <Link to={`/user/${encodeURIComponent(authorUsername)}`} className="flex items-center gap-2 group">
                      <Avatar name={authorName} avatarUrl={article.author?.avatar_url} className="w-7 h-7 text-xs ring-1 ring-slate-200 dark:ring-slate-700" />
                      <span className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                        {authorName}
                      </span>
                    </Link>
                  ) : (
                    <>
                      <Avatar name={authorName} avatarUrl={article.author?.avatar_url} className="w-7 h-7 text-xs ring-1 ring-slate-200 dark:ring-slate-700" />
                      <span className="font-medium text-slate-800 dark:text-slate-200">{authorName}</span>
                    </>
                  )}
                </div>
                <span className="text-slate-300 dark:text-slate-700">/</span>
                <span className="flex items-center gap-1 tabular-nums">
                  <Icons.Calendar className="w-3.5 h-3.5" />
                  {article.published_at ? new Date(article.published_at).toLocaleDateString('zh-CN') : '未发布'}
                </span>
                <span className="text-slate-300 dark:text-slate-700">/</span>
                <span className="flex items-center gap-1 tabular-nums">
                  <Icons.Clock className="w-3.5 h-3.5" />
                  {article.read_time_minutes || 5} 分钟阅读
                </span>
                <span className="text-slate-300 dark:text-slate-700">/</span>
                <span className="flex items-center gap-1 tabular-nums" title="阅读量">
                  <Icons.Eye className="w-3.5 h-3.5" />
                  {article.view_count}
                </span>
              </div>
            </div>

            {/* 正文卡片 */}
            <div className="bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-10 mb-8 transition-colors">
              {article.summary && (
                <div className="bg-slate-50/80 dark:bg-slate-800/40 border-l-2 border-primary-500 rounded-r-lg px-5 py-4 mb-8">
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm sm:text-[15px]">{article.summary}</p>
                </div>
              )}

              {/* AI 可追问导读卡 */}
              {(() => {
                try {
                  const intro = article.ai_intro ? JSON.parse(article.ai_intro) : null;
                  if (!intro?.summary || !Array.isArray(intro.questions) || intro.questions.length === 0) return null;
                  const askPoro = (q: string) => {
                    window.dispatchEvent(
                      new CustomEvent('poro-ask', {
                        detail: { question: `关于《${article.title}》：${q}` },
                      }),
                    );
                  };
                  return (
                    <div className="mb-8 rounded-xl border border-primary-200/70 dark:border-primary-900/50 bg-primary-50/40 dark:bg-primary-950/20 p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <Icons.Sparkles className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">AI 核心导读 · 太长不看</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-3 text-sm">{intro.summary}</p>
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">点选下方问题，由小魄罗带读追问：</div>
                      <div className="flex flex-wrap gap-2">
                        {intro.questions.map((q: string, i: number) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => askPoro(q)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200/80 dark:border-primary-800/60 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-primary-700 dark:text-primary-300 hover:border-primary-400 dark:hover:border-primary-600 transition-colors cursor-pointer"
                          >
                            <Icons.MessageCircle className="w-3.5 h-3.5" />
                            <span>{q}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                } catch {
                  return null;
                }
              })()}

              <article className="prose prose-slate dark:prose-invert prose-lg max-w-none prose-headings:scroll-mt-24 prose-a:text-primary-600 dark:prose-a:text-primary-400 prose-a:no-underline hover:prose-a:underline prose-img:rounded-xl">
                {article.content_md ? (
                  <MarkdownContent allowHtml className="!max-w-none">
                    {article.content_md}
                  </MarkdownContent>
                ) : (
                  <p className="text-slate-400 dark:text-slate-500 text-center py-8">暂无内容</p>
                )}
              </article>
            </div>

            {/* 底部标签与互动操作 */}
            <div className="border-t border-slate-200/80 dark:border-slate-800 pt-6 mb-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                {article.tags && article.tags.length > 0 ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Icons.Tags className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                    {article.tags.map((tag) => (
                      <Link
                        key={tag.id}
                        to={`/articles?tag=${encodeURIComponent(tag.name)}`}
                        className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-md text-xs font-medium hover:border-primary-300 dark:hover:border-primary-700 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                      >
                        #{tag.name}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleArticleLike}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-medium transition-colors text-xs border cursor-pointer ${
                      articleLiked
                        ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/60'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-red-300 hover:text-red-500'
                    }`}
                  >
                    <Icons.ThumbsUp className={`w-3.5 h-3.5 ${articleLiked ? 'fill-current' : ''}`} />
                    <span>{articleLiked ? '已赞' : '点赞'}</span>
                    <span className="tabular-nums opacity-80">{articleLikeCount}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleBookmark}
                    disabled={bookmarkLoading}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-medium transition-colors text-xs border cursor-pointer ${
                      bookmarked
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-300 hover:text-amber-600'
                    }`}
                  >
                    <Icons.Bookmark className={`w-3.5 h-3.5 ${bookmarked ? 'fill-current' : ''}`} />
                    <span>{bookmarked ? '已收藏' : '收藏'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await copyToClipboard(window.location.href);
                      showToast(ok ? '链接已复制到剪贴板' : '复制失败，请手动复制', ok ? 'success' : 'error');
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-xs font-medium cursor-pointer"
                  >
                    <Icons.Share2 className="w-3.5 h-3.5" />
                    <span>分享</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 上一篇 / 下一篇 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
              {prevArticle ? (
                <Link
                  to={`/articles/${prevArticle.id}`}
                  className="group p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 hover:border-primary-300 dark:hover:border-primary-700 transition-colors bg-white dark:bg-slate-900/90"
                >
                  <div className="text-xs text-slate-400 dark:text-slate-500 group-hover:text-primary-600 dark:group-hover:text-primary-400 mb-1 flex items-center gap-1">
                    <Icons.ArrowLeft className="w-3 h-3" /> 上一篇
                  </div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-primary-600 dark:group-hover:text-primary-400 line-clamp-1">
                    {prevArticle.title}
                  </div>
                </Link>
              ) : (
                <div className="p-4 rounded-xl border border-slate-200/60 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500 flex items-center justify-center text-xs">
                  已是第一篇
                </div>
              )}

              {nextArticle ? (
                <Link
                  to={`/articles/${nextArticle.id}`}
                  className="group p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 hover:border-primary-300 dark:hover:border-primary-700 transition-colors bg-white dark:bg-slate-900/90 text-right"
                >
                  <div className="text-xs text-slate-400 dark:text-slate-500 group-hover:text-primary-600 dark:group-hover:text-primary-400 mb-1 flex items-center gap-1 justify-end">
                    下一篇 <Icons.ChevronRight className="w-3 h-3" />
                  </div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-primary-600 dark:group-hover:text-primary-400 line-clamp-1">
                    {nextArticle.title}
                  </div>
                </Link>
              ) : (
                <div className="p-4 rounded-xl border border-slate-200/60 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500 flex items-center justify-center text-xs">
                  已是最后一篇
                </div>
              )}
            </div>

            {/* 评论区 */}
            <section
              id="comments-section"
              className="bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8"
            >
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5 flex items-center gap-2">
                <Icons.MessageCircle className="w-4 h-4 text-primary-500" />
                <span>文章评论</span>
                <span className="text-xs font-normal text-slate-400 dark:text-slate-500 tabular-nums">
                  ({countAllComments(comments)})
                </span>
              </h3>

              {/* 评论输入区 */}
              <div className="bg-slate-50/80 dark:bg-slate-900/60 rounded-xl p-4 sm:p-5 mb-7 border border-slate-200/70 dark:border-slate-800 space-y-3">
                {isAuthenticated && user ? (
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <Avatar name={user.display_name || user.username} avatarUrl={user.avatar_url} className="w-6 h-6 text-xs" />
                      <span>
                        以 <strong className="text-slate-800 dark:text-slate-200">{user.display_name || user.username}</strong> 身份发表
                      </span>
                    </div>
                    <Link to={`/user/${encodeURIComponent(user.username)}`} className="text-primary-600 dark:text-primary-400 hover:underline">
                      我的主页
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>无需登录即可评论，登录后可管理历史评论与接收回复通知</span>
                      <Link
                        to={`/login?redirect=${encodeURIComponent(`/articles/${article.id}`)}`}
                        className="font-medium text-primary-600 dark:text-primary-400 hover:underline shrink-0"
                      >
                        登录 &rarr;
                      </Link>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="你的昵称（可选）"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:outline-none dark:text-white"
                      />
                      <input
                        type="email"
                        placeholder="邮箱（可选）"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:outline-none dark:text-white"
                      />
                    </div>
                  </div>
                )}

                <textarea
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3.5 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:outline-none resize-none h-24 dark:text-white"
                  placeholder="写下你的想法（支持基础 Markdown）..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />

                <div className="flex justify-end">
                  <Button size="sm" onClick={handleSubmitComment} disabled={submitting}>
                    <Icons.Send className="w-3.5 h-3.5" />
                    {submitting ? '发布中...' : '发布评论'}
                  </Button>
                </div>
              </div>

              {comments.length === 0 ? (
                <EmptyState
                  icon={<Icons.MessageCircle className="w-5 h-5" />}
                  title="还没有评论"
                  description="来分享你的阅读想法或补充问题吧。"
                />
              ) : (
                <div className="space-y-1">{comments.map((comment) => renderComment(comment))}</div>
              )}
            </section>
          </div>
        </main>

        {/* 右侧边栏 */}
        <div className="pt-10">
          <ArticleSidebar article={article} relatedArticles={relatedArticles} />
        </div>
      </div>

      {/* 悬浮操作栏 */}
      <FloatingActions
        likeCount={articleLikeCount}
        liked={articleLiked}
        bookmarked={bookmarked}
        commentCount={countAllComments(comments)}
        onLike={handleArticleLike}
        onBookmark={handleToggleBookmark}
        onScrollToComments={handleScrollToComments}
      />

      {/* 移动端目录抽屉 */}
      {showMobileTOC && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setShowMobileTOC(false)} />
          <div className="absolute bottom-0 inset-x-0 rounded-t-2xl bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-2xl max-h-[70vh] flex flex-col overflow-hidden animate-fade-in-down">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Icons.BookOpen className="w-4 h-4 text-primary-500" /> 目录大纲
              </span>
              <button
                type="button"
                onClick={() => setShowMobileTOC(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Icons.X className="w-4 h-4" />
              </button>
            </div>
            <nav className="overflow-y-auto px-3 py-3 space-y-0.5 flex-1">
              {headings.map((heading, idx) => (
                <button
                  key={`${heading.id}-${idx}`}
                  type="button"
                  onClick={() => {
                    document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    setShowMobileTOC(false);
                  }}
                  className={`w-full text-left py-2 px-3 rounded-lg text-sm transition-colors ${
                    activeHeading === heading.id
                      ? 'bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  style={{ paddingLeft: `${12 + (heading.level - 1) * 12}px` }}
                >
                  {heading.text}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {confirmDialog}
    </div>
  );
};

export default ArticleDetail;
