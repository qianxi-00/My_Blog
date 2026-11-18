import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Input, Select, StatusPill } from '../components/Shared';
import { DetailSkeleton } from '../components/Skeleton';
import { Icons } from '../components/Icons';
import Avatar from '../components/Avatar';
import MarkdownContent from '../components/MarkdownContent';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { copyToClipboard } from '../utils/helpers';
import { errorText } from '../utils/errors';
import { getFileUrl } from '../api/config';
import { uploadImage } from '../api/upload';
import { getBookmarkStatus, toggleBookmark } from '../api/users';
import {
  acceptBestAnswer,
  deleteForumPost,
  deleteForumThread,
  ForumCategory,
  ForumPost,
  ForumThreadDetail,
  getForumCategories,
  getForumThread,
  getForumThreadPosts,
  replyForumThread,
  reportForumPost,
  reportForumThread,
  togglePostHidden,
  togglePostLike,
  toggleThreadHidden,
  toggleThreadLike,
  updateForumPost,
  updateForumThread,
} from '../api/forum';

const PAGE_SIZE = 30;
const REPORT_REASONS = ['垃圾广告 / 推广', '不当言论 / 人身攻击', '信息误导 / 虚假内容', '内容侵权', '其他原因'];

const formatDateTime = (v?: string | null) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const cleanAvatar = (url?: string | null) => {
  if (!url || url.includes('dicebear.com')) return undefined;
  return url;
};

const ForumThreadDetailPage: React.FC = () => {
  const { id } = useParams();
  const threadId = id ? Number(id) : NaN;
  const navigate = useNavigate();
  const { user, isAuthenticated, isAdmin } = useAuth();
  const { showToast } = useToast();
  const { confirm, confirmDialog } = useConfirm();

  const [thread, setThread] = useState<ForumThreadDetail | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Bookmark & Like animation state
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [threadLikePop, setThreadLikePop] = useState(false);
  const [poppedPostId, setPoppedPostId] = useState<number | null>(null);

  // Thread inline edit
  const [editingThread, setEditingThread] = useState(false);
  const [editThreadTitle, setEditThreadTitle] = useState('');
  const [editThreadCategoryId, setEditThreadCategoryId] = useState<number | ''>('');
  const [editThreadContent, setEditThreadContent] = useState('');
  const [editThreadPreview, setEditThreadPreview] = useState(false);
  const [savingThread, setSavingThread] = useState(false);
  const [categories, setCategories] = useState<ForumCategory[]>([]);

  // Post inline edit
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editPostContent, setEditPostContent] = useState('');
  const [editPostPreview, setEditPostPreview] = useState(false);
  const [savingPostId, setSavingPostId] = useState<number | null>(null);

  // Reply composer
  const [replyContent, setReplyContent] = useState('');
  const [replyHoneypot, setReplyHoneypot] = useState('');
  const [replyToFloor, setReplyToFloor] = useState<number | null>(null);
  const [replyPreview, setReplyPreview] = useState(false);
  const [uploadingReplyImage, setUploadingReplyImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const replyFileRef = useRef<HTMLInputElement | null>(null);

  // Report modal
  const [reportTarget, setReportTarget] = useState<{ type: 'thread' | 'post'; id: number; label: string } | null>(null);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDesc, setReportDesc] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  const firstPost = useMemo(() => posts.find((p) => p.floor === 1) || null, [posts]);
  const replies = useMemo(() => posts.filter((p) => p.floor !== 1), [posts]);

  const postsById = useMemo(() => {
    const map = new Map<number, ForumPost>();
    posts.forEach((p) => map.set(p.id, p));
    return map;
  }, [posts]);

  const replyToPost = useMemo(
    () => (replyToFloor ? posts.find((p) => p.floor === replyToFloor) || null : null),
    [posts, replyToFloor]
  );

  const fetchAll = useCallback(
    async (targetPage: number) => {
      if (!Number.isFinite(threadId)) return;
      setLoading(true);
      try {
        const [t, p] = await Promise.all([
          getForumThread(threadId),
          getForumThreadPosts(threadId, { page: targetPage, page_size: PAGE_SIZE }),
        ]);
        setThread(t);
        setPosts(p.data);
        setTotal(p.total);
        setTotalPages(Math.max(1, p.total_pages || 1));
        setPage(targetPage);
      } catch (e: any) {
        setThread(null);
        showToast(errorText(e, '加载主题失败'), 'error');
      } finally {
        setLoading(false);
      }
    },
    [threadId, showToast]
  );

  useEffect(() => {
    fetchAll(1);
    window.scrollTo(0, 0);
  }, [fetchAll]);

  useEffect(() => {
    if (!isAuthenticated || !Number.isFinite(threadId)) {
      setBookmarked(false);
      return;
    }
    let active = true;
    getBookmarkStatus('thread', threadId)
      .then((res) => {
        if (active) setBookmarked(Boolean(res.bookmarked));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isAuthenticated, threadId]);

  const isThreadOwner = Boolean(user && thread?.user_id && thread.user_id === user.id);
  const canEditThread = Boolean(isAdmin || isThreadOwner);
  const canAcceptAnswer = Boolean(isAdmin || isThreadOwner);
  const threadLocked = Boolean(thread?.is_locked);

  const handleToggleBookmark = async () => {
    if (!thread) return;
    if (!isAuthenticated) {
      showToast('登录后可收藏该主题', 'info');
      navigate(`/login?redirect=${encodeURIComponent(`/forum/threads/${thread.id}`)}`);
      return;
    }
    if (bookmarkBusy) return;
    setBookmarkBusy(true);
    try {
      const res = await toggleBookmark('thread', thread.id);
      setBookmarked(res.bookmarked);
      showToast(res.bookmarked ? '已加入收藏' : '已取消收藏', 'success');
    } catch (e: any) {
      showToast(errorText(e, '收藏操作失败'), 'error');
    } finally {
      setBookmarkBusy(false);
    }
  };

  const handleThreadLike = async () => {
    if (!thread) return;
    if (!isAuthenticated) {
      showToast('登录后可点赞主题', 'info');
      navigate(`/login?redirect=${encodeURIComponent(`/forum/threads/${thread.id}`)}`);
      return;
    }
    const prevLiked = Boolean(thread.viewer_liked);
    const prevCount = thread.like_count ?? 0;
    setThread({
      ...thread,
      viewer_liked: !prevLiked,
      like_count: Math.max(0, prevCount + (prevLiked ? -1 : 1)),
    });
    if (!prevLiked) {
      setThreadLikePop(true);
      window.setTimeout(() => setThreadLikePop(false), 280);
    }
    try {
      const res = await toggleThreadLike(thread.id);
      setThread((curr) =>
        curr ? { ...curr, viewer_liked: res.liked, like_count: res.like_count } : curr
      );
    } catch (e: any) {
      setThread((curr) =>
        curr ? { ...curr, viewer_liked: prevLiked, like_count: prevCount } : curr
      );
      showToast(errorText(e, '点赞失败'), 'error');
    }
  };

  const handlePostLike = async (post: ForumPost) => {
    if (!thread) return;
    if (!isAuthenticated) {
      showToast('登录后可点赞楼层', 'info');
      navigate(`/login?redirect=${encodeURIComponent(`/forum/threads/${thread.id}`)}`);
      return;
    }
    const prevLiked = Boolean(post.viewer_liked);
    const prevCount = post.like_count ?? 0;
    setPosts((curr) =>
      curr.map((item) =>
        item.id === post.id
          ? {
              ...item,
              viewer_liked: !prevLiked,
              like_count: Math.max(0, prevCount + (prevLiked ? -1 : 1)),
            }
          : item
      )
    );
    if (!prevLiked) {
      setPoppedPostId(post.id);
      window.setTimeout(() => setPoppedPostId((curr) => (curr === post.id ? null : curr)), 280);
    }
    try {
      const res = await togglePostLike(post.id);
      setPosts((curr) =>
        curr.map((item) =>
          item.id === post.id
            ? { ...item, viewer_liked: res.liked, like_count: res.like_count }
            : item
        )
      );
    } catch (e: any) {
      setPosts((curr) =>
        curr.map((item) =>
          item.id === post.id ? { ...item, viewer_liked: prevLiked, like_count: prevCount } : item
        )
      );
      showToast(errorText(e, '点赞失败'), 'error');
    }
  };

  const handleShare = async () => {
    const ok = await copyToClipboard(window.location.href);
    showToast(ok ? '主题链接已复制到剪贴板' : '复制失败，请手动复制地址栏', ok ? 'success' : 'error');
  };

  const openEditThread = async () => {
    if (!thread) return;
    setEditThreadTitle(thread.title);
    setEditThreadCategoryId(thread.category_id);
    setEditThreadContent(firstPost?.content || '');
    setEditThreadPreview(false);
    setEditingThread(true);
    if (categories.length === 0) {
      try {
        const cats = await getForumCategories();
        setCategories(cats);
      } catch {
        // Ignore if categories fetch fails
      }
    }
  };

  const handleSaveThreadEdit = async () => {
    if (!thread || savingThread) return;
    if (!editThreadTitle.trim()) {
      showToast('标题不能为空', 'error');
      return;
    }
    if (firstPost && !editThreadContent.trim()) {
      showToast('正文不能为空', 'error');
      return;
    }
    setSavingThread(true);
    try {
      const updated = await updateForumThread(thread.id, {
        title: editThreadTitle.trim(),
        category_id: editThreadCategoryId ? Number(editThreadCategoryId) : undefined,
        content: firstPost ? editThreadContent.trim() : undefined,
      });
      setThread(updated);
      if (firstPost) {
        setPosts((curr) =>
          curr.map((p) =>
            p.floor === 1
              ? { ...p, content: editThreadContent.trim(), edited_at: updated.edited_at || new Date().toISOString() }
              : p
          )
        );
      }
      setEditingThread(false);
      showToast('主题已更新', 'success');
    } catch (e: any) {
      showToast(errorText(e, '保存修改失败'), 'error');
    } finally {
      setSavingThread(false);
    }
  };

  const handleDeleteThread = async () => {
    if (!thread) return;
    const ok = await confirm({
      title: '删除主题',
      message: `确定要删除「${thread.title}」吗？删除后主题及其回复将不再公开展示。`,
      confirmText: '确认删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteForumThread(thread.id);
      showToast('主题已删除', 'success');
      navigate('/forum');
    } catch (e: any) {
      showToast(errorText(e, '删除失败'), 'error');
    }
  };

  const handleAdminToggleFlag = async (
    field: 'is_pinned' | 'is_featured' | 'is_locked',
    nextVal: boolean
  ) => {
    if (!thread) return;
    try {
      const updated = await updateForumThread(thread.id, { [field]: nextVal });
      setThread(updated);
      const labelMap = {
        is_pinned: nextVal ? '已置顶' : '已取消置顶',
        is_featured: nextVal ? '已设为精选' : '已取消精选',
        is_locked: nextVal ? '已锁定回复' : '已解除锁定',
      };
      showToast(labelMap[field], 'success');
    } catch (e: any) {
      showToast(errorText(e, '操作失败'), 'error');
    }
  };

  const handleToggleThreadHidden = async () => {
    if (!thread) return;
    const nextHidden = !thread.is_hidden;
    try {
      const res = await toggleThreadHidden(thread.id, nextHidden);
      setThread((curr) => (curr ? { ...curr, is_hidden: res.is_hidden } : curr));
      showToast(res.is_hidden ? '已隐藏该主题' : '已恢复显示', 'success');
    } catch (e: any) {
      showToast(errorText(e, '切换可见性失败'), 'error');
    }
  };

  const handleAcceptAnswer = async (post: ForumPost) => {
    if (!thread) return;
    const alreadyAccepted = thread.accepted_post_id === post.id;
    try {
      const res = await acceptBestAnswer(thread.id, alreadyAccepted ? null : post.id);
      setThread((curr) =>
        curr
          ? {
              ...curr,
              is_solved: res.is_solved,
              accepted_post_id: res.accepted_post_id,
            }
          : curr
      );
      showToast(res.is_solved ? `已采纳 #${post.floor} 楼为最佳回答` : '已取消采纳', 'success');
    } catch (e: any) {
      showToast(errorText(e, '采纳操作失败'), 'error');
    }
  };

  const handleSavePostEdit = async (post: ForumPost) => {
    if (!editPostContent.trim() || savingPostId) {
      showToast('内容不能为空', 'error');
      return;
    }
    setSavingPostId(post.id);
    try {
      const updated = await updateForumPost(post.id, editPostContent.trim());
      setPosts((curr) => curr.map((item) => (item.id === post.id ? updated : item)));
      setEditingPostId(null);
      showToast('回复已更新', 'success');
    } catch (e: any) {
      showToast(errorText(e, '更新回复失败'), 'error');
    } finally {
      setSavingPostId(null);
    }
  };

  const handleDeletePost = async (post: ForumPost) => {
    const ok = await confirm({
      title: '删除回复',
      message: `确认删除 #${post.floor} 楼的回复吗？此操作不可恢复。`,
      confirmText: '确认删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteForumPost(post.id);
      showToast('回复已删除', 'success');
      await fetchAll(page);
    } catch (e: any) {
      showToast(errorText(e, '删除回复失败'), 'error');
    }
  };

  const handleTogglePostHidden = async (post: ForumPost) => {
    try {
      const res = await togglePostHidden(post.id, !post.is_hidden);
      setPosts((curr) =>
        curr.map((item) => (item.id === post.id ? { ...item, is_hidden: res.is_hidden } : item))
      );
      showToast(res.is_hidden ? '已隐藏该楼层' : '已恢复显示', 'success');
    } catch (e: any) {
      showToast(errorText(e, '操作失败'), 'error');
    }
  };

  const openReport = (type: 'thread' | 'post', idVal: number, label: string) => {
    if (!isAuthenticated) {
      showToast('登录后可提交举报', 'info');
      navigate(`/login?redirect=${encodeURIComponent(`/forum/threads/${threadId}`)}`);
      return;
    }
    setReportTarget({ type, id: idVal, label });
    setReportReason(REPORT_REASONS[0]);
    setReportDesc('');
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTarget || submittingReport) return;
    setSubmittingReport(true);
    try {
      const body = {
        reason: reportReason,
        description: reportDesc.trim() || undefined,
      };
      if (reportTarget.type === 'thread') {
        await reportForumThread(reportTarget.id, body);
      } else {
        await reportForumPost(reportTarget.id, body);
      }
      showToast('已提交举报，感谢共同维护社区秩序', 'success');
      setReportTarget(null);
    } catch (err: any) {
      showToast(errorText(err, '举报提交失败'), 'error');
    } finally {
      setSubmittingReport(false);
    }
  };

  const insertReplySnippet = (snippet: string) => {
    const el = replyTextareaRef.current;
    if (!el) {
      setReplyContent((prev) => `${prev}${snippet}`);
      return;
    }
    const start = el.selectionStart ?? replyContent.length;
    const end = el.selectionEnd ?? replyContent.length;
    const next = replyContent.slice(0, start) + snippet + replyContent.slice(end);
    setReplyContent(next);
    window.requestAnimationFrame(() => {
      el.focus();
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleUploadReplyImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('图片大小不能超过 10MB', 'error');
      return;
    }
    setUploadingReplyImage(true);
    try {
      const uploaded = await uploadImage(file, undefined, 'forum');
      const altName = file.name.replace(/\.[^/.]+$/, '') || 'image';
      insertReplySnippet(`\n![${altName}](${getFileUrl(uploaded.url)})\n`);
      showToast('图片已上传并插入', 'success');
    } catch (err: any) {
      showToast(errorText(err, '图片上传失败'), 'error');
    } finally {
      setUploadingReplyImage(false);
    }
  };

  const handleSubmitReply = async () => {
    if (!thread || threadLocked || submitting) return;
    const v = replyContent.trim();
    if (!v) {
      showToast('请输入回复内容', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const created = await replyForumThread(thread.id, {
        content: v,
        parent_id: replyToPost?.id || undefined,
        honeypot: replyHoneypot.trim() || undefined,
      });
      showToast('回复已发布', 'success');
      setReplyContent('');
      setReplyToFloor(null);
      setReplyPreview(false);
      const targetPage = Math.max(1, Math.ceil((total + 1) / PAGE_SIZE));
      await fetchAll(targetPage);
      window.setTimeout(() => {
        document.getElementById(`post-${created.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 160);
    } catch (e: any) {
      showToast(errorText(e, '回复失败'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!Number.isFinite(threadId)) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16">
        <EmptyState
          icon={<Icons.AlertTriangle className="w-5 h-5" />}
          title="无效的主题 ID"
          action={<Link to="/forum"><Button size="sm">返回社区</Button></Link>}
        />
      </div>
    );
  }

  if (loading && !thread) {
    return <DetailSkeleton />;
  }

  if (!thread) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16">
        <EmptyState
          icon={<Icons.MessagesSquare className="w-5 h-5" />}
          title="主题不存在或已被移除"
          description="可能已被作者删除，或由管理员隐藏。"
          action={<Link to="/forum"><Button size="sm">返回社区</Button></Link>}
        />
      </div>
    );
  }

  const threadAuthorName = thread.author_display_name || thread.author_nickname || '用户';
  const threadAuthorAvatar = cleanAvatar(thread.author_avatar);
  const threadAuthorIsAdmin = thread.author_role === 'admin' || thread.author_role === 'super_admin';
  const acceptedPostOnPage = thread.accepted_post_id ? postsById.get(thread.accepted_post_id) : undefined;
  const loginRedirectUrl = `/login?redirect=${encodeURIComponent(`/forum/threads/${thread.id}`)}`;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 fade-up">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <Link
          to="/forum"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <Icons.ArrowLeft className="w-4 h-4" />
          返回社区讨论
        </Link>
        <Link to="/forum/new">
          <Button size="sm" variant="outline">
            <Icons.Plus className="w-3.5 h-3.5" />
            发起讨论
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-8 items-start">
        {/* Main column */}
        <div className="min-w-0 space-y-6">
          {/* Thread Header Card */}
          <Card className="p-5 sm:p-7">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <Badge color="slate">{thread.category_name || '未分类'}</Badge>
              {thread.is_pinned && (
                <StatusPill tone="amber">
                  <Icons.Pin className="w-3 h-3" /> 置顶
                </StatusPill>
              )}
              {thread.is_featured && (
                <StatusPill tone="primary">
                  <Icons.Star className="w-3 h-3" /> 精选
                </StatusPill>
              )}
              {thread.is_solved && (
                <StatusPill tone="emerald">
                  <Icons.CheckCircle2 className="w-3 h-3" /> 已解决
                </StatusPill>
              )}
              {thread.is_locked && (
                <StatusPill tone="slate">
                  <Icons.Lock className="w-3 h-3" /> 已锁定
                </StatusPill>
              )}
              {thread.is_hidden && (
                <StatusPill tone="red">
                  <Icons.EyeOff className="w-3 h-3" /> 管理员可见（已隐藏）
                </StatusPill>
              )}
            </div>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white leading-snug">
              {thread.title}
            </h1>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                <div className="inline-flex items-center gap-2">
                  <Avatar name={threadAuthorName} avatarUrl={threadAuthorAvatar} className="w-6 h-6 text-xs" />
                  {thread.username ? (
                    <Link
                      to={`/user/${encodeURIComponent(thread.username)}`}
                      className="font-semibold text-slate-800 dark:text-slate-200 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                    >
                      {threadAuthorName}
                    </Link>
                  ) : (
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{threadAuthorName}</span>
                  )}
                  {threadAuthorIsAdmin && (
                    <Badge color="primary" className="text-[10px]">
                      <Icons.Shield className="w-2.5 h-2.5" /> 站长
                    </Badge>
                  )}
                </div>

                <span className="inline-flex items-center gap-1">
                  <Icons.Clock className="w-3.5 h-3.5" />
                  {formatDateTime(thread.created_at)}
                </span>
                {thread.edited_at && (
                  <span title={`最后编辑于 ${formatDateTime(thread.edited_at)}`} className="text-slate-400">
                    (已编辑)
                  </span>
                )}
              </div>

              {/* Primary interactive actions */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleThreadLike}
                  className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium tabular-nums transition-colors cursor-pointer ${
                    thread.viewer_liked
                      ? 'border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icons.ThumbsUp className={`w-3.5 h-3.5 ${threadLikePop ? 'like-pop' : ''}`} />
                  <span>{thread.like_count ?? 0}</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleBookmark}
                  disabled={bookmarkBusy}
                  className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                    bookmarked
                      ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icons.Bookmark className="w-3.5 h-3.5" />
                  <span>{bookmarked ? '已收藏' : '收藏'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleShare}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="复制分享链接"
                >
                  <Icons.Share2 className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => openReport('thread', thread.id, `主题「${thread.title}」`)}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="举报该主题"
                >
                  <Icons.Flag className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Accepted jump banner */}
            {thread.is_solved && acceptedPostOnPage && (
              <div className="mt-4 rounded-lg border border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/25 px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-emerald-800 dark:text-emerald-200">
                <div className="flex items-center gap-2">
                  <Icons.CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    该讨论已被标记为解决（采纳 #{acceptedPostOnPage.floor} 楼
                    {acceptedPostOnPage.author_display_name || acceptedPostOnPage.nickname} 的回答）
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    document
                      .getElementById(`post-${acceptedPostOnPage.id}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }
                  className="font-semibold text-emerald-700 dark:text-emerald-300 hover:underline shrink-0 cursor-pointer"
                >
                  直达最佳回答 →
                </button>
              </div>
            )}

            {/* Owner / Admin action strip */}
            {(canEditThread || isAdmin) && (
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-2 text-xs">
                {canEditThread && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={openEditThread}
                    className="h-7 px-2.5 text-xs"
                  >
                    <Icons.Pencil className="w-3 h-3" />
                    编辑主题
                  </Button>
                )}
                {canEditThread && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleDeleteThread}
                    className="h-7 px-2.5 text-xs text-red-600 dark:text-red-400 hover:border-red-300"
                  >
                    <Icons.Trash2 className="w-3 h-3" />
                    删除主题
                  </Button>
                )}

                {isAdmin && (
                  <>
                    <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">|</span>
                    <button
                      type="button"
                      onClick={() => handleAdminToggleFlag('is_pinned', !thread.is_pinned)}
                      className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-md border text-xs transition-colors cursor-pointer ${
                        thread.is_pinned
                          ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icons.Pin className="w-3 h-3" />
                      {thread.is_pinned ? '取消置顶' : '置顶'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAdminToggleFlag('is_featured', !thread.is_featured)}
                      className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-md border text-xs transition-colors cursor-pointer ${
                        thread.is_featured
                          ? 'border-primary-300 bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icons.Star className="w-3 h-3" />
                      {thread.is_featured ? '取消精选' : '加精'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAdminToggleFlag('is_locked', !thread.is_locked)}
                      className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-md border text-xs transition-colors cursor-pointer ${
                        thread.is_locked
                          ? 'border-slate-400 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {thread.is_locked ? <Icons.Unlock className="w-3 h-3" /> : <Icons.Lock className="w-3 h-3" />}
                      {thread.is_locked ? '解锁' : '锁定'}
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleThreadHidden}
                      className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-md border text-xs transition-colors cursor-pointer ${
                        thread.is_hidden
                          ? 'border-red-300 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icons.EyeOff className="w-3 h-3" />
                      {thread.is_hidden ? '取消隐藏' : '隐藏'}
                    </button>
                  </>
                )}
              </div>
            )}
          </Card>

          {/* Edit Thread Inline Card */}
          {editingThread && (
            <Card className="p-5 sm:p-6 border-primary-300/70 dark:border-primary-800/70">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">编辑主题信息与正文</h2>
                <button
                  type="button"
                  onClick={() => setEditingThread(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <Icons.X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">版块</label>
                    <Select
                      value={editThreadCategoryId}
                      onChange={(e) => setEditThreadCategoryId(e.target.value ? Number(e.target.value) : '')}
                      className="w-full"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">标题</label>
                    <Input
                      value={editThreadTitle}
                      onChange={(e) => setEditThreadTitle(e.target.value)}
                      maxLength={200}
                    />
                  </div>
                </div>

                {firstPost && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">主楼正文</label>
                      <div className="flex items-center gap-1 text-xs">
                        <button
                          type="button"
                          onClick={() => setEditThreadPreview(false)}
                          className={`px-2 py-0.5 rounded cursor-pointer ${!editThreadPreview ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900' : 'text-slate-500'}`}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditThreadPreview(true)}
                          className={`px-2 py-0.5 rounded cursor-pointer ${editThreadPreview ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900' : 'text-slate-500'}`}
                        >
                          预览
                        </button>
                      </div>
                    </div>
                    {editThreadPreview ? (
                      <div className="min-h-[160px] rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-950/40">
                        <MarkdownContent allowHtml={false} className="!max-w-none">{editThreadContent}</MarkdownContent>
                      </div>
                    ) : (
                      <textarea
                        value={editThreadContent}
                        onChange={(e) => setEditThreadContent(e.target.value)}
                        rows={8}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-y"
                      />
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditingThread(false)}>
                    取消
                  </Button>
                  <Button type="button" size="sm" onClick={handleSaveThreadEdit} disabled={savingThread}>
                    {savingThread ? '保存中...' : '保存修改'}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* First Post (OP) */}
          {firstPost && (
            <Card id={`post-${firstPost.id}`} className="p-5 sm:p-7">
              <div className="flex items-center justify-between gap-3 pb-3 mb-4 border-b border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    #1 楼主
                  </span>
                  <span>{firstPost.author_display_name || firstPost.nickname}</span>
                  {firstPost.edited_at && <span className="text-slate-400">(已编辑)</span>}
                </div>
                <span>{formatDateTime(firstPost.created_at)}</span>
              </div>

              <article className="prose prose-slate dark:prose-invert max-w-none">
                <MarkdownContent allowHtml={false} className="!max-w-none">
                  {firstPost.content}
                </MarkdownContent>
              </article>
            </Card>
          )}

          {/* Replies Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Icons.MessageSquare className="w-4 h-4 text-primary-500" />
                <span>讨论回复</span>
                <span className="text-xs font-medium text-slate-400 dark:text-slate-500 tabular-nums">
                  ({Math.max(0, thread.reply_count)})
                </span>
              </h2>
            </div>

            {replies.length === 0 ? (
              <EmptyState
                icon={<Icons.MessageCircle className="w-5 h-5" />}
                title="暂无回复"
                description="欢迎在下方补充观点、解答疑问或分享实践经验。"
              />
            ) : (
              <div className="space-y-3">
                {replies.map((p) => {
                  const isAccepted = thread.accepted_post_id === p.id;
                  const authorLabel = p.author_display_name || p.nickname;
                  const pAvatar = cleanAvatar(p.author_avatar);
                  const isReplyAdmin = p.is_admin_post || p.author_role === 'admin' || p.author_role === 'super_admin';
                  const isPostOwner = Boolean(user && p.user_id && p.user_id === user.id);
                  const canEditPost = isAdmin || isPostOwner;
                  const parentPost = p.parent_id ? postsById.get(p.parent_id) : undefined;
                  const isEditingThis = editingPostId === p.id;

                  return (
                    <Card
                      key={p.id}
                      id={`post-${p.id}`}
                      className={`p-5 transition-colors ${
                        isAccepted
                          ? 'border-emerald-300/90 dark:border-emerald-700/80 bg-emerald-50/35 dark:bg-emerald-950/15'
                          : p.is_hidden
                          ? 'opacity-65 border-red-200 dark:border-red-900/50'
                          : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                          <Avatar name={authorLabel} avatarUrl={pAvatar} className="w-7 h-7 text-xs" />
                          <div className="flex items-center gap-1.5 flex-wrap text-xs">
                            {p.username ? (
                              <Link
                                to={`/user/${encodeURIComponent(p.username)}`}
                                className="font-semibold text-slate-900 dark:text-slate-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                              >
                                {authorLabel}
                              </Link>
                            ) : (
                              <span className="font-semibold text-slate-900 dark:text-slate-100">{authorLabel}</span>
                            )}
                            {isReplyAdmin && (
                              <Badge color="primary" className="text-[10px]">
                                <Icons.Shield className="w-2.5 h-2.5" /> 站长
                              </Badge>
                            )}
                            {isAccepted && (
                              <StatusPill tone="emerald">
                                <Icons.CheckCircle2 className="w-3 h-3" /> 最佳回答
                              </StatusPill>
                            )}
                            {p.is_hidden && <StatusPill tone="red">已隐藏</StatusPill>}
                            <span className="font-mono text-slate-400 dark:text-slate-500">#{p.floor}</span>
                            <span className="text-slate-400 dark:text-slate-500">· {formatDateTime(p.created_at)}</span>
                            {p.edited_at && (
                              <span
                                title={`编辑于 ${formatDateTime(p.edited_at)}`}
                                className="text-slate-400 dark:text-slate-500"
                              >
                                (已编辑)
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handlePostLike(p)}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs tabular-nums transition-colors cursor-pointer ${
                              p.viewer_liked
                                ? 'border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300'
                                : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            <Icons.ThumbsUp
                              className={`w-3 h-3 ${poppedPostId === p.id ? 'like-pop' : ''}`}
                            />
                            <span>{p.like_count ?? 0}</span>
                          </button>

                          {!threadLocked && (
                            <button
                              type="button"
                              onClick={() => {
                                setReplyToFloor(p.floor);
                                window.setTimeout(() => {
                                  document.getElementById('reply-box')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }, 50);
                              }}
                              className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                              引用
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Parent Quote */}
                      {p.parent_id && (
                        <div className="mb-3 rounded-lg border-l-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                          {parentPost ? (
                            <button
                              type="button"
                              onClick={() =>
                                document
                                  .getElementById(`post-${parentPost.id}`)
                                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                              }
                              className="text-left w-full hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                            >
                              <span className="font-semibold">
                                引用 #{parentPost.floor} {parentPost.author_display_name || parentPost.nickname}：
                              </span>
                              <span className="line-clamp-1">{parentPost.content}</span>
                            </button>
                          ) : (
                            <span>（引用前楼回复）</span>
                          )}
                        </div>
                      )}

                      {/* Post Body or Inline Editor */}
                      {isEditingThis ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-1 text-xs">
                            <button
                              type="button"
                              onClick={() => setEditPostPreview(false)}
                              className={`px-2 py-0.5 rounded cursor-pointer ${!editPostPreview ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900' : 'text-slate-500'}`}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditPostPreview(true)}
                              className={`px-2 py-0.5 rounded cursor-pointer ${editPostPreview ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900' : 'text-slate-500'}`}
                            >
                              预览
                            </button>
                          </div>
                          {editPostPreview ? (
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-950/40">
                              <MarkdownContent allowHtml={false} compact>{editPostContent}</MarkdownContent>
                            </div>
                          ) : (
                            <textarea
                              value={editPostContent}
                              onChange={(e) => setEditPostContent(e.target.value)}
                              rows={5}
                              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                            />
                          )}
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingPostId(null)}
                            >
                              取消
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleSavePostEdit(p)}
                              disabled={savingPostId === p.id}
                            >
                              {savingPostId === p.id ? '保存中...' : '保存'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-slate-700 dark:text-slate-200">
                          <MarkdownContent allowHtml={false} compact className="dark:text-slate-200">
                            {p.content}
                          </MarkdownContent>
                        </div>
                      )}

                      {/* Post footer actions */}
                      {!isEditingThis && (
                        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/70 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            {canAcceptAnswer && (
                              <button
                                type="button"
                                onClick={() => handleAcceptAnswer(p)}
                                className={`inline-flex items-center gap-1 font-medium cursor-pointer transition-colors ${
                                  isAccepted
                                    ? 'text-emerald-700 dark:text-emerald-300 hover:underline'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400'
                                }`}
                              >
                                <Icons.CheckCircle2 className="w-3.5 h-3.5" />
                                {isAccepted ? '取消最佳回答' : '采纳为最佳回答'}
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500">
                            {canEditPost && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPostId(p.id);
                                  setEditPostContent(p.content);
                                  setEditPostPreview(false);
                                }}
                                className="hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                              >
                                编辑
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleTogglePostHidden(p)}
                                className="hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                              >
                                {p.is_hidden ? '恢复显示' : '隐藏'}
                              </button>
                            )}
                            {canEditPost && (
                              <button
                                type="button"
                                onClick={() => handleDeletePost(p)}
                                className="hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                              >
                                删除
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openReport('post', p.id, `#${p.floor} 楼回复`)}
                              className="hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                            >
                              举报
                            </button>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const prev = Math.max(1, page - 1);
                    fetchAll(prev);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  disabled={page === 1}
                  className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                >
                  <Icons.ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      fetchAll(p);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`h-9 min-w-[36px] px-2.5 rounded-lg text-xs font-medium tabular-nums cursor-pointer ${
                      page === p
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                        : 'border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.min(totalPages, page + 1);
                    fetchAll(next);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  disabled={page === totalPages}
                  className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                >
                  <Icons.ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Reply Composer */}
          <div id="reply-box">
            {threadLocked ? (
              <Card className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                <Icons.Lock className="w-5 h-5 mx-auto mb-2 text-slate-400" />
                该主题已被管理员锁定，当前无法添加新回复。
              </Card>
            ) : !isAuthenticated ? (
              <Card className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">参与社区讨论</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    登录后即可发表回复、上传截图、点赞或关注讨论动态。
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link to={`/register?redirect=${encodeURIComponent(`/forum/threads/${thread.id}`)}`}>
                    <Button variant="outline" size="sm">注册</Button>
                  </Link>
                  <Link to={loginRedirectUrl}>
                    <Button size="sm">登录并回复</Button>
                  </Link>
                </div>
              </Card>
            ) : (
              <Card className="p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Avatar
                      name={user?.display_name || user?.username || '我'}
                      avatarUrl={cleanAvatar(user?.avatar_url)}
                      className="w-6 h-6 text-xs"
                    />
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      发表回复
                    </span>
                  </div>

                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setReplyPreview(false)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                        !replyPreview
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      编写
                    </button>
                    <button
                      type="button"
                      onClick={() => setReplyPreview(true)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                        replyPreview
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      预览
                    </button>
                  </div>
                </div>

                {replyToFloor && (
                  <div className="mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-3.5 py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0 text-xs">
                      <div className="font-semibold text-slate-700 dark:text-slate-200">
                        引用 #{replyToFloor} {replyToPost?.author_display_name || replyToPost?.nickname}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                        {replyToPost?.content || ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyToFloor(null)}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer shrink-0"
                      aria-label="取消引用"
                    >
                      <Icons.X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="hidden" aria-hidden="true">
                  <Input value={replyHoneypot} onChange={(e) => setReplyHoneypot(e.target.value)} tabIndex={-1} />
                </div>

                {!replyPreview && (
                  <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => insertReplySnippet('\n```text\n\n```\n')}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Icons.Code className="w-3.5 h-3.5" /> 代码块
                    </button>
                    <input
                      ref={replyFileRef}
                      type="file"
                      accept="image/*"
                      onChange={handleUploadReplyImage}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => replyFileRef.current?.click()}
                      disabled={uploadingReplyImage}
                      className="h-7 px-2.5 text-xs"
                    >
                      <Icons.Image className="w-3.5 h-3.5" />
                      {uploadingReplyImage ? '上传中...' : '插入图片'}
                    </Button>
                  </div>
                )}

                {replyPreview ? (
                  <div className="min-h-[140px] rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-950/40">
                    {replyContent.trim() ? (
                      <MarkdownContent allowHtml={false} compact>
                        {replyContent}
                      </MarkdownContent>
                    ) : (
                      <div className="text-xs text-slate-400 text-center py-8">暂无可预览的内容</div>
                    )}
                  </div>
                ) : (
                  <textarea
                    ref={replyTextareaRef}
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    rows={5}
                    maxLength={20000}
                    placeholder="写下你的回复，支持 Markdown 与图片上传（默认禁用原始 HTML）..."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-y min-h-[140px]"
                  />
                )}

                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    Markdown 渲染 · 禁止原始 HTML
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setReplyContent('');
                        setReplyToFloor(null);
                      }}
                    >
                      清空
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSubmitReply}
                      disabled={submitting || uploadingReplyImage || !replyContent.trim()}
                    >
                      <Icons.Send className="w-3.5 h-3.5" />
                      {submitting ? '发送中...' : '发送回复'}
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <aside className="space-y-5 xl:sticky xl:top-24">
          <Card className="p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
              主题数据
            </div>
            <dl className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">所属版块</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-200">
                  {thread.category_name || '未分类'}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">解决状态</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-200">
                  {thread.is_solved ? '已解决' : '待解决'}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">点赞数</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                  {thread.like_count ?? 0}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">回复数</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                  {thread.reply_count}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">浏览数</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                  {thread.view_count}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">最近活跃</dt>
                <dd className="font-medium text-slate-700 dark:text-slate-300">
                  {formatDateTime(thread.last_post_at) || '—'}
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="p-4 bg-slate-50/70 dark:bg-slate-900/60">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
              <Icons.Sparkles className="w-3.5 h-3.5 text-primary-500" />
              <span>互动提示</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              遇到有帮助的解答可以点击点赞或收藏主题；楼主或管理员可将回复设为「最佳回答」。如发现违规内容可点击举报交由管理员核查。
            </p>
          </Card>
        </aside>
      </div>

      {/* Report Modal */}
      {reportTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={() => !submittingReport && setReportTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label="提交举报"
        >
          <div
            className="w-full max-w-md mx-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Icons.Flag className="w-4 h-4 text-red-500" />
                举报{reportTarget.label}
              </h3>
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <Icons.X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitReport} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
                  选择举报原因
                </label>
                <div className="space-y-1.5">
                  {REPORT_REASONS.map((r) => (
                    <label
                      key={r}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                        reportReason === r
                          ? 'border-primary-500 bg-primary-50/70 dark:bg-primary-950/40 text-slate-900 dark:text-white'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="report-reason"
                        checked={reportReason === r}
                        onChange={() => setReportReason(r)}
                        className="accent-primary-600"
                      />
                      <span>{r}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  补充说明（选填）
                </label>
                <textarea
                  value={reportDesc}
                  onChange={(e) => setReportDesc(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="可补充具体违规时间、原因等核查信息..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setReportTarget(null)}
                  disabled={submittingReport}
                >
                  取消
                </Button>
                <Button type="submit" variant="danger" size="sm" disabled={submittingReport}>
                  {submittingReport ? '提交中...' : '提交举报'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDialog}
    </div>
  );
};

export default ForumThreadDetailPage;
