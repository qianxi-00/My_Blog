import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { Button } from '../components/Shared';
import MarkdownContent from '../components/MarkdownContent';
import { getArticle, getArticleBySlug, Article, getAllArticles, likeArticle, getArticleLikeStatus, ArticleListItem } from '../api/articles';
import { getArticleComments, submitComment, likeComment, reportComment, Comment } from '../api/comments';
import { recordPageView } from '../api/stats';
import { getFileUrl } from '../api/config';
import FloatingActions from '../components/FloatingActions';
import ArticleSidebar from '../components/ArticleSidebar';

// 提取 Markdown 中的标题，生成目录
const extractHeadings = (markdown: string) => {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const headings: { level: number; text: string; id: string }[] = [];
  let match;

  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length;
    // 清理 markdown 标记，需与 MarkdownRenderer 中的 flatten 逻辑保持一致
    const rawText = match[2];
    const text = rawText
      .replace(/\*\*/g, '') // bold
      .replace(/__/g, '') // bold
      .replace(/\*/g, '') // italic
      .replace(/_/g, '') // italic
      .replace(/`([^`]+)`/g, '$1') // code
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // link
      .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1') // image
      .trim();

    const id = text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, '')
      .replace(/\s+/g, '-');

    headings.push({ level, text, id });
  }

  return headings;
};

// 举报理由选项
const REPORT_REASONS = [
  { value: 'spam', label: '垃圾广告' },
  { value: 'abuse', label: '辱骂攻击' },
  { value: 'illegal', label: '违法信息' },
  { value: 'porn', label: '色情低俗' },
  { value: 'misleading', label: '虚假信息' },
  { value: 'other', label: '其他原因' },
];

const ArticleDetail: React.FC = () => {
  const { id, slug } = useParams();
  const navigate = useNavigate();
  const [article, setArticle] = useState<Article | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [nickname, setNickname] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeHeading, setActiveHeading] = useState<string>('');
  const [prevArticle, setPrevArticle] = useState<ArticleListItem | null>(null);
  const [nextArticle, setNextArticle] = useState<ArticleListItem | null>(null);
  const [relatedArticles, setRelatedArticles] = useState<ArticleListItem[]>([]);

  // 回复相关状态
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyNickname, setReplyNickname] = useState('');

  // 举报相关状态
  const [reportingComment, setReportingComment] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');

  // 点赞状态缓存
  const [likedComments, setLikedComments] = useState<Set<number>>(new Set());

  // 长评论展开状态
  const [expandedTexts, setExpandedTexts] = useState<Set<number>>(new Set());
  // 深层回复展开状态（每条回复的嵌套子回复折叠）
  const [expandedNested, setExpandedNested] = useState<Set<number>>(new Set());

  const COMMENT_MAX_LEN = 200; // 超过此长度折叠
  const NESTED_REPLY_LIMIT = 2; // 默认显示的子回复数量

  const toggleText = (id: number) => setExpandedTexts(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // 递归收集所有后代回复的 id
  const collectAllDescendantIds = (comment: Comment): number[] => {
    const ids: number[] = [];
    for (const reply of (comment.replies || [])) {
      ids.push(reply.id);
      ids.push(...collectAllDescendantIds(reply));
    }
    return ids;
  };

  // 从 comments 树中查找指定 id 的评论
  const findCommentById = (list: Comment[], id: number): Comment | null => {
    for (const c of list) {
      if (c.id === id) return c;
      const found = findCommentById(c.replies || [], id);
      if (found) return found;
    }
    return null;
  };

  // 展开：递归将自己及所有后代加入 set；收起：递归移除
  const toggleNested = (id: number) => setExpandedNested(prev => {
    const next = new Set(prev);
    const target = findCommentById(comments, id);
    const descendantIds = target ? collectAllDescendantIds(target) : [];
    if (next.has(id)) {
      // 收起：移除自己和所有后代
      next.delete(id);
      descendantIds.forEach(did => next.delete(did));
    } else {
      // 展开：添加自己和所有后代
      next.add(id);
      descendantIds.forEach(did => next.add(did));
    }
    return next;
  });

  // 文章点赞状态
  const [articleLiked, setArticleLiked] = useState(false);
  const [articleLikeCount, setArticleLikeCount] = useState(0);

  // 评论回复展开状态
  const [expandedReplies, setExpandedReplies] = useState<Record<number, boolean>>({});

  // 生成目录
  const headings = useMemo(() => {
    if (!article?.content_md) return [];
    return extractHeadings(article.content_md);
  }, [article?.content_md]);

  // 监听滚动，更新当前活跃的标题
  useEffect(() => {
    if (headings.length === 0) return;

    const handleScroll = () => {
      const headingElements = headings.map(h => ({
        id: h.id,
        element: document.getElementById(h.id)
      })).filter(h => h.element);

      // 如果滚动到底部，高亮最后一个
      if ((window.innerHeight + window.scrollY) >= document.documentElement.scrollHeight - 150) {
        if (headings.length > 0) {
          setActiveHeading(headings[headings.length - 1].id);
          return;
        }
      }

      let current = '';
      for (const { id, element } of headingElements) {
        if (element) {
          const rect = element.getBoundingClientRect();
          // 如果标题上方距离视口顶部小于 100px (header 高度 + 缓冲)，则激活
          if (rect.top < 120) {
            current = id;
          }
        }
      }
      setActiveHeading(current);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [headings]);

  useEffect(() => {
    const fetchData = async () => {
      if (!id && !slug) return;
      setLoading(true);
      try {
        let articleRes: Article;

        if (id && !isNaN(parseInt(id))) {
          articleRes = await getArticle(parseInt(id));
        } else if (slug) {
          articleRes = await getArticleBySlug(slug);
        } else {
          throw new Error('无效的文章标识');
        }

        setArticle(articleRes);
        setArticleLikeCount(articleRes.like_count || 0);

        // 获取文章点赞状态
        try {
          const likeStatus = await getArticleLikeStatus(articleRes.id);
          setArticleLiked(likeStatus.liked);
        } catch (err) {
          console.error('获取点赞状态失败:', err);
        }

        // 获取评论
        const commentsRes = await getArticleComments(articleRes.id);
        setComments(commentsRes);

        // 获取所有文章用于找前一篇和后一篇
        try {
          const allArticlesRes = await getAllArticles();
          const allArticles = Array.isArray(allArticlesRes) ? allArticlesRes : (allArticlesRes as any).data || [];
          const publishedArticles = allArticles
            .filter((a: any) => a.published_at && a.status === 'published')
            .sort((a: any, b: any) => new Date(b.published_at!).getTime() - new Date(a.published_at!).getTime());

          const currentIndex = publishedArticles.findIndex((a: any) => a.id === articleRes.id);

          if (currentIndex > 0) {
            setPrevArticle(publishedArticles[currentIndex - 1]);
          }
          if (currentIndex >= 0 && currentIndex < publishedArticles.length - 1) {
            setNextArticle(publishedArticles[currentIndex + 1]);
          }
        } catch (err) {
          console.error('获取文章列表失败:', err);
        }

        recordPageView({ page_path: `/articles/${articleRes.id}`, article_id: articleRes.id }).catch(() => { });
      } catch (error) {
        console.error('获取文章失败:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    window.scrollTo(0, 0);
  }, [id, slug]);

  const refreshComments = async () => {
    if (!article) return;
    const commentsRes = await getArticleComments(article.id);
    setComments(commentsRes);
  };

  const handleSubmitComment = async () => {
    if (!article || !commentText.trim()) {
      alert('请填写评论内容');
      return;
    }
    setSubmitting(true);
    try {
      await submitComment(article.id, { nickname: nickname.trim() || undefined, content: commentText });
      setCommentText('');
      await refreshComments();
    } catch (error: any) {
      alert(error.response?.data?.detail || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReply = async (parentId: number) => {
    if (!article || !replyText.trim() || !replyNickname.trim()) {
      alert('请填写昵称和回复内容');
      return;
    }
    try {
      await submitComment(article.id, {
        nickname: replyNickname,
        content: replyText,
        parent_id: parentId
      });
      setReplyText('');
      setReplyingTo(null);
      setExpandedReplies(prev => ({ ...prev, [parentId]: true }));
      await refreshComments();
    } catch (error: any) {
      alert(error.response?.data?.detail || '回复失败');
    }
  };

  const handleLike = async (commentId: number) => {
    try {
      const result = await likeComment(commentId);
      if (result.liked) {
        setLikedComments(prev => new Set([...prev, commentId]));
      } else {
        setLikedComments(prev => {
          const newSet = new Set(prev);
          newSet.delete(commentId);
          return newSet;
        });
      }
      await refreshComments();
    } catch (error: any) {
      console.error('点赞失败:', error);
    }
  };

  const handleReport = async (commentId: number) => {
    if (!reportReason) {
      alert('请选择举报原因');
      return;
    }
    try {
      await reportComment(commentId, { reason: reportReason, description: reportDescription });
      alert('举报成功，我们会尽快处理');
      setReportingComment(null);
      setReportReason('');
      setReportDescription('');
    } catch (error: any) {
      alert(error.response?.data?.detail || '举报失败');
    }
  };

  const handleArticleLike = async () => {
    if (!article) return;
    try {
      const result = await likeArticle(article.id);
      setArticleLiked(result.liked);
      setArticleLikeCount(result.like_count);
    } catch (error: any) {
      console.error('文章点赞失败:', error);
    }
  };

  const toggleReplies = (commentId: number) => {
    setExpandedReplies(prev => {
      const willExpand = !prev[commentId];
      if (willExpand) {
        // 展开顶级回复的同时，递归展开所有嵌套层
        const comment = comments.find(c => c.id === commentId);
        if (comment) {
          const allIds = collectAllDescendantIds(comment);
          setExpandedNested(prevNested => {
            const next = new Set(prevNested);
            allIds.forEach(id => next.add(id));
            return next;
          });
        }
      } else {
        // 收起顶级回复的同时，清除所有嵌套层的展开状态
        const comment = comments.find(c => c.id === commentId);
        if (comment) {
          const allIds = collectAllDescendantIds(comment);
          setExpandedNested(prevNested => {
            const next = new Set(prevNested);
            allIds.forEach(id => next.delete(id));
            return next;
          });
        }
      }
      return { ...prev, [commentId]: willExpand };
    });
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20 text-center text-slate-400 dark:text-slate-500">
        <div className="animate-pulse transition-colors">加载中...</div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-4 transition-colors">文章不存在</h1>
        <Link to="/articles" className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors">返回文章列表</Link>
      </div>
    );
  }

  const getCommentDisplayName = (comment: Comment) => comment.is_admin_reply ? '作者' : (comment.nickname || '匿名读者');

  // 渲染单条回复
  const countAllComments = (list: Comment[]): number =>
    list.reduce((acc, c) => acc + 1 + countAllComments(c.replies || []), 0);

  const MAX_REPLY_DEPTH = 2; // 默认最多展示 2 层回复，更深的折叠

  const renderReply = (reply: Comment, depth: number = 1) => {
    const isLong = reply.content.length > COMMENT_MAX_LEN;
    const isTextExpanded = expandedTexts.has(reply.id);
    const nestedReplies = reply.replies || [];
    const isNestedExpanded = expandedNested.has(reply.id);

    // 深度>=MAX_REPLY_DEPTH 时，默认完全折叠子回复（基于深度的折叠）
    const foldedByDepth = depth >= MAX_REPLY_DEPTH && nestedReplies.length > 0;
    const visibleNested = isNestedExpanded
      ? nestedReplies
      : (foldedByDepth ? [] : nestedReplies.slice(0, NESTED_REPLY_LIMIT));
    // 是否需要显示折叠/展开按钮
    const showToggle = foldedByDepth || nestedReplies.length > NESTED_REPLY_LIMIT;

    return (
      <div key={reply.id} className="py-3 transition-colors">
        <div className="flex gap-3">
          <img
            src={getFileUrl(reply.avatar_url) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${getCommentDisplayName(reply)}`}
            alt={getCommentDisplayName(reply)}
            className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex-shrink-0 transition-colors"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-sm font-medium transition-colors ${reply.is_admin_reply ? 'text-primary-600 dark:text-primary-400' : 'text-slate-700 dark:text-slate-300'}`}>
                {getCommentDisplayName(reply)}
              </span>
              {reply.is_admin_reply && (
                <span className="px-1.5 py-0.5 text-[10px] bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300 rounded transition-colors">作者</span>
              )}
              <span className="text-xs text-slate-400 dark:text-slate-500 transition-colors">{new Date(reply.created_at).toLocaleDateString('zh-CN')}</span>
            </div>
            {isLong && !isTextExpanded ? (
              <div>
                <MarkdownContent compact enableMermaid={false} className="dark:text-slate-300">{reply.content.slice(0, COMMENT_MAX_LEN) + '...'}</MarkdownContent>
                <button onClick={() => toggleText(reply.id)} className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 mt-1">展开全文</button>
              </div>
            ) : (
              <div>
                <MarkdownContent compact enableMermaid={false} className="dark:text-slate-300">{reply.content}</MarkdownContent>
                {isLong && <button onClick={() => toggleText(reply.id)} className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 mt-1">收起</button>}
              </div>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-slate-400 dark:text-slate-500">
              <button
                onClick={() => handleLike(reply.id)}
                className={`flex items-center gap-1 hover:text-red-500 transition-colors ${likedComments.has(reply.id) ? 'text-red-500' : ''}`}
              >
                <span>{likedComments.has(reply.id) ? '❤️' : '🤍'}</span>
                <span>{reply.like_count || 0}</span>
              </button>
            </div>
            {/* 嵌套回复，带深度折叠 */}
            {nestedReplies.length > 0 && (
              <div className={`mt-2 pl-3 border-l-2 border-slate-200 dark:border-slate-700 transition-colors ${foldedByDepth && !isNestedExpanded ? '' : ''}`}>
                {visibleNested.length > 0 && (
                  <div className="space-y-0 divide-y divide-slate-100 dark:divide-slate-800 transition-colors">
                    {visibleNested.map(nested => renderReply(nested, depth + 1))}
                  </div>
                )}
                {showToggle && (
                  <button
                    onClick={() => toggleNested(reply.id)}
                    className="mt-1 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium flex items-center gap-1"
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

  // 渲染评论
  const renderComment = (comment: Comment) => {
    const replies = comment.replies || [];
    const isExpanded = expandedReplies[comment.id];
    const visibleReplies = isExpanded ? replies : replies.slice(0, 2);
    const hasMoreReplies = replies.length > 2;

    return (
      <div key={comment.id} className="py-5 border-b border-slate-100 dark:border-slate-800 last:border-b-0 transition-colors">
        <div className="flex gap-3">
          <img
            src={getFileUrl(comment.avatar_url) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${getCommentDisplayName(comment)}`}
            alt={getCommentDisplayName(comment)}
            className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex-shrink-0 transition-colors"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`font-medium transition-colors ${comment.is_admin_reply ? 'text-primary-600 dark:text-primary-400' : 'text-slate-800 dark:text-slate-200'}`}>
                {getCommentDisplayName(comment)}
              </span>
              {comment.is_admin_reply && (
                <span className="px-2 py-0.5 text-[10px] bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300 rounded-full font-medium transition-colors">作者</span>
              )}
              <span className="text-xs text-slate-400 dark:text-slate-500 transition-colors">{new Date(comment.created_at).toLocaleDateString('zh-CN')}</span>
            </div>
            {comment.content.length > COMMENT_MAX_LEN && !expandedTexts.has(comment.id) ? (
              <div>
                <MarkdownContent compact enableMermaid={false} className="dark:text-slate-300 transition-colors">{comment.content.slice(0, COMMENT_MAX_LEN) + '...'}</MarkdownContent>
                <button onClick={() => toggleText(comment.id)} className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 mt-1">展开全文</button>
              </div>
            ) : (
              <div>
                <MarkdownContent compact enableMermaid={false} className="dark:text-slate-300 transition-colors">{comment.content}</MarkdownContent>
                {comment.content.length > COMMENT_MAX_LEN && <button onClick={() => toggleText(comment.id)} className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 mt-1">收起</button>}
              </div>
            )}

            <div className="flex items-center gap-5 text-sm text-slate-400 dark:text-slate-500 transition-colors">
              <button
                onClick={() => handleLike(comment.id)}
                className={`flex items-center gap-1.5 hover:text-red-500 transition-colors ${likedComments.has(comment.id) ? 'text-red-500' : ''}`}
              >
                <span>{likedComments.has(comment.id) ? '❤️' : '🤍'}</span>
                <span>{comment.like_count || 0}</span>
              </button>
              <button
                onClick={() => {
                  setReplyingTo(replyingTo === comment.id ? null : comment.id);
                  setReplyNickname(nickname);
                }}
                className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                回复
              </button>
              {!comment.is_admin_reply && (
                <button
                  onClick={() => setReportingComment(reportingComment === comment.id ? null : comment.id)}
                  className="hover:text-red-500 dark:hover:text-red-400 transition-colors ml-auto"
                >
                  举报
                </button>
              )}
            </div>

            {/* 回复输入框 */}
            {replyingTo === comment.id && (
              <div className="mt-4 bg-slate-50 dark:bg-slate-800 rounded-xl p-4 transition-colors">
                <input
                  type="text"
                  placeholder="你的昵称"
                  value={replyNickname}
                  onChange={(e) => setReplyNickname(e.target.value)}
                  className="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none mb-3 dark:text-white transition-colors"
                />
                <textarea
                  placeholder={`回复 @${getCommentDisplayName(comment)}...`}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none h-20 dark:text-white transition-colors"
                ></textarea>
                <div className="flex justify-end gap-2 mt-2">
                  <button onClick={() => setReplyingTo(null)} className="px-3 py-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">取消</button>
                  <Button size="sm" onClick={() => handleSubmitReply(comment.id)}>发送</Button>
                </div>
              </div>
            )}

            {/* 举报表单 */}
            {reportingComment === comment.id && (
              <div className="mt-4 bg-red-50 dark:bg-red-900/10 rounded-xl p-4 border border-red-100 dark:border-red-900/30 transition-colors">
                <div className="text-sm font-medium text-red-700 dark:text-red-400 mb-3 transition-colors">举报原因</div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {REPORT_REASONS.map(r => (
                    <button
                      key={r.value}
                      onClick={() => setReportReason(r.value)}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-all ${reportReason === r.value
                        ? 'bg-red-500 text-white'
                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-red-300 dark:hover:border-red-700'
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
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm focus:outline-none resize-none h-16 dark:text-white transition-colors"
                ></textarea>
                <div className="flex justify-end gap-2 mt-2">
                  <button onClick={() => { setReportingComment(null); setReportReason(''); }} className="px-3 py-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">取消</button>
                  <button onClick={() => handleReport(comment.id)} className="px-4 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">提交</button>
                </div>
              </div>
            )}

            {/* 回复列表 */}
            {replies.length > 0 && (
              <div className="mt-4 pl-3 border-l-2 border-slate-200 dark:border-slate-700 transition-colors">
                <div className="space-y-0 divide-y divide-slate-100 dark:divide-slate-800 transition-colors">
                  {visibleReplies.map(reply => renderReply(reply))}
                </div>
                {hasMoreReplies && (
                  <button
                    onClick={() => toggleReplies(comment.id)}
                    className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium transition-colors"
                  >
                    {isExpanded ? `收起 ↑` : `查看更多回复 (${replies.length - 2}条)`}
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
    const commentsSection = document.getElementById('comments-section');
    if (commentsSection) {
      commentsSection.scrollIntoView({ behavior: 'smooth' });
    }
  };


  return (
    <div className="relative min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-900 transition-colors duration-300">
      <div className="max-w-screen-2xl mx-auto flex gap-0">
        {/* 侧边栏目录 */}
        {headings.length > 2 && (
          <aside className="hidden xl:block w-64 flex-shrink-0 pt-12 ml-8">
            <div className="sticky top-28 pl-4 border-l border-slate-200 dark:border-slate-800 transition-colors">
              <div className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 pl-2 flex items-center gap-2 transition-colors">
                <span className="text-xl">📑</span> 大纲
              </div>
              <nav className="space-y-1 text-sm max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                {headings.map((heading, idx) => (
                  <a
                    key={`${heading.id}-${idx}`}
                    href={`#${heading.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={`block py-1.5 px-3 rounded-lg transition-all border-l-2 -ml-[1px] text-sm ${activeHeading === heading.id
                      ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 font-semibold'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    style={{ paddingLeft: `${12 + (heading.level - 1) * 12}px` }}
                  >
                    {heading.text}
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        )}

        {/* 主要内容 */}
        <main className="flex-1 min-w-0">
          <div className="max-w-4xl mx-auto lg:mx-0 lg:ml-12 px-4 sm:px-6 py-10 sm:py-16 relative">

            {/* 面包屑 */}
            <div className="mb-8">
              <button
                onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/articles')}
                className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 mb-6 group transition-colors"
              >
                <Icons.ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                返回
              </button>

              <h1 className="text-3xl sm:text-4xl sm:leading-tight font-bold text-slate-900 dark:text-white mb-6 transition-colors">
                {article.is_pinned && <span className="text-amber-500 mr-2" title="置顶文章">📌</span>}
                {article.title}
              </h1>

              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 dark:text-slate-400 transition-colors">
                <div className="flex items-center gap-2">
                  <img
                    src={getFileUrl(article.author?.avatar_url) || `https://api.dicebear.com/7.x/notionists/svg?seed=${article.author?.username || 'admin'}`}
                    className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 transition-colors"
                    alt="Author"
                  />
                  <span className="font-medium text-slate-700 dark:text-slate-200">{article.author?.display_name || article.author?.username || '管理员'}</span>
                </div>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <span className="flex items-center gap-1">
                  <Icons.Calendar className="w-3.5 h-3.5" />
                  {article.published_at ? new Date(article.published_at).toLocaleDateString('zh-CN') : '未发布'}
                </span>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <span className="flex items-center gap-1">
                  <Icons.Clock className="w-3.5 h-3.5" />
                  {article.read_time_minutes || 5} 分钟阅读
                </span>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <span className="flex items-center gap-1" title="阅读量">
                  <Icons.Eye className="w-3.5 h-3.5" />
                  {article.view_count}
                </span>
              </div>
            </div>

            {/* 文章内容 */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm p-6 sm:p-10 mb-8 transition-all hover:shadow-md">
              {article.summary && (
                <div className="bg-slate-50 dark:bg-slate-900/50 border-l-4 border-cyan-500 rounded-r-lg p-5 mb-8 transition-colors">
                  <div className="flex gap-3">
                    <span className="text-2xl">💡</span>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed italic text-[15px] transition-colors">{article.summary}</p>
                  </div>
                </div>
              )}

              <article className="prose prose-slate dark:prose-invert prose-lg max-w-none prose-headings:scroll-mt-24 prose-a:text-cyan-600 dark:prose-a:text-cyan-400 prose-a:no-underline hover:prose-a:underline prose-img:rounded-xl prose-img:shadow-md transition-colors">
                {article.content_md ? (
                  <MarkdownContent className="!max-w-none">{article.content_md}</MarkdownContent>
                ) : (
                  <p className="text-slate-400 dark:text-slate-500 text-center py-8 transition-colors">暂无内容</p>
                )}
              </article>
            </div>

            {/* 文章底部标签与分享 */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-8 mb-10 transition-colors">
              <div className="flex flex-wrap items-center justify-between gap-4">
                {article.tags && article.tags.length > 0 ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Icons.Tags className="w-4 h-4 text-slate-400 dark:text-slate-500 transition-colors" />
                    {article.tags.map(tag => (
                      <Link key={tag.id} to={`/articles?tag=${encodeURIComponent(tag.name)}`}
                        className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full text-sm hover:bg-cyan-50 dark:hover:bg-cyan-900/30 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">
                        #{tag.name}
                      </Link>
                    ))}
                  </div>
                ) : <div></div>}

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleArticleLike}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all text-sm border ${articleLiked
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/30'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-800 hover:text-red-500 dark:hover:text-red-400'
                      }`}
                  >
                    <Icons.ThumbsUp className={`w-4 h-4 ${articleLiked ? 'fill-current' : ''}`} />
                    <span>{articleLiked ? '已赞' : '点赞'}</span>
                    <span className="bg-black/5 dark:bg-white/5 px-1.5 rounded text-xs transition-colors">{articleLikeCount}</span>
                  </button>
                  <button
                    onClick={() => { navigator.clipboard.writeText(window.location.href); alert('链接已复制'); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 hover:text-cyan-600 dark:hover:text-cyan-400 hover:border-cyan-200 dark:hover:border-cyan-800 transition-all text-sm"
                  >
                    <Icons.Share2 className="w-4 h-4" />
                    <span>分享</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 上一篇/下一篇导航 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
              {prevArticle ? (
                <Link to={`/articles/${prevArticle.id}`} className="group p-5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-cyan-300 dark:hover:border-cyan-700 hover:shadow-sm transition-all bg-white dark:bg-slate-800 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-slate-200 dark:bg-slate-700 group-hover:bg-cyan-400 transition-colors"></div>
                  <div className="text-xs text-slate-400 dark:text-slate-500 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 mb-1 flex items-center gap-1 transition-colors">
                    <Icons.ArrowLeft className="w-3 h-3" /> 上一篇
                  </div>
                  <div className="text-base font-medium text-slate-800 dark:text-slate-200 group-hover:text-cyan-700 dark:group-hover:text-cyan-300 line-clamp-1 transition-colors">{prevArticle.title}</div>
                </Link>
              ) : (
                <div className="p-5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-500 flex items-center justify-center text-sm transition-colors">已是第一篇</div>
              )}

              {nextArticle ? (
                <Link to={`/articles/${nextArticle.id}`} className="group p-5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-cyan-300 dark:hover:border-cyan-700 hover:shadow-sm transition-all bg-white dark:bg-slate-800 relative overflow-hidden text-right">
                  <div className="absolute top-0 right-0 w-1 h-full bg-slate-200 dark:bg-slate-700 group-hover:bg-cyan-400 transition-colors"></div>
                  <div className="text-xs text-slate-400 dark:text-slate-500 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 mb-1 flex items-center gap-1 justify-end transition-colors">
                    下一篇 <Icons.ChevronRight className="w-3 h-3" />
                  </div>
                  <div className="text-base font-medium text-slate-800 dark:text-slate-200 group-hover:text-cyan-700 dark:group-hover:text-cyan-300 line-clamp-1 transition-colors">{nextArticle.title}</div>
                </Link>
              ) : (
                <div className="p-5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-500 flex items-center justify-center text-sm transition-colors">已是最后一篇</div>
              )}
            </div>

            {/* 评论区 */}
            <div id="comments-section" className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm p-6 sm:p-8 transition-all">
              <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2 transition-colors">
                <Icons.MessageCircle className="w-6 h-6 text-cyan-500 dark:text-cyan-400" />
                评论 <span className="text-slate-400 dark:text-slate-500 text-base font-normal transition-colors">({countAllComments(comments)})</span>
              </h3>

              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-5 mb-8 border border-slate-100 dark:border-slate-800 transition-colors">
                <div className="flex gap-4 mb-4">
                  <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xl flex-shrink-0 dark:text-white transition-colors">
                    {nickname ? nickname[0].toUpperCase() : '👤'}
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input type="text" placeholder="你的昵称（可选）" value={nickname} onChange={(e) => setNickname(e.target.value)}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-cyan-500 dark:focus:ring-cyan-400 focus:outline-none dark:text-white transition-all shadow-sm" />
                      <input type="email" placeholder="邮箱（可选）"
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-cyan-500 dark:focus:ring-cyan-400 focus:outline-none dark:text-white transition-all shadow-sm" />
                    </div>
                    <textarea
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-sm focus:ring-2 focus:ring-cyan-500 dark:focus:ring-cyan-400 focus:outline-none resize-none h-28 dark:text-white transition-all shadow-sm"
                      placeholder="写下你的想法..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                    ></textarea>
                    <div className="flex justify-end">
                      <Button onClick={handleSubmitComment} disabled={submitting} className="bg-cyan-600 dark:bg-cyan-500 hover:bg-cyan-700 dark:hover:bg-cyan-600 text-white px-6">
                        {submitting ? '发布中...' : (
                          <span className="flex items-center gap-2"><Icons.Send className="w-4 h-4" /> 发布评论</span>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {comments.length === 0 ? (
                <div className="text-center text-slate-400 dark:text-slate-500 py-12 bg-slate-50/50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 transition-colors">
                  <div className="text-4xl mb-3 opacity-50">💭</div>
                  <p>还没有评论，来抢沙发吧！</p>
                </div>
              ) : (
                <div className="space-y-6">{comments.map(comment => renderComment(comment))}</div>
              )}
            </div>
          </div>
        </main>

        {/* 右侧边栏 */}
        <div className="pt-12">
          <ArticleSidebar article={article} relatedArticles={relatedArticles} />
        </div>
      </div>

      {/* 悬浮操作栏 */}
      <FloatingActions
        likeCount={articleLikeCount}
        liked={articleLiked}
        commentCount={comments.length}
        onLike={handleArticleLike}
        onScrollToComments={handleScrollToComments}
      />
    </div>
  );
};

export default ArticleDetail;
