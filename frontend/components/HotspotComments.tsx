import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from './Icons';
import Avatar from './Avatar';
import { EmptyState } from './Shared';
import { ListSkeleton } from './Skeleton';
import MarkdownContent from './MarkdownContent';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { errorText } from '../utils/errors';
import {
  Comment,
  deleteComment,
  getHotspotComments,
  likeComment,
  reportComment,
  submitHotspotComment,
  updateComment,
} from '../api/comments';

interface HotspotCommentsProps {
  hotspotId: number;
  hotspotTitle: string;
}

const countAllComments = (items: Comment[]): number =>
  items.reduce((total, item) => total + 1 + countAllComments(item.replies || []), 0);

const updateCommentTree = (
  items: Comment[],
  commentId: number,
  updater: (comment: Comment) => Comment,
): Comment[] =>
  items.map((item) => {
    if (item.id === commentId) return updater(item);
    if (item.replies?.length) {
      return { ...item, replies: updateCommentTree(item.replies, commentId, updater) };
    }
    return item;
  });

const getDisplayName = (comment: Comment) => {
  if (comment.user_display_name) return comment.user_display_name;
  if (comment.is_admin_reply) return comment.admin_display_name || '作者';
  return comment.username || comment.nickname?.trim() || '匿名读者';
};

const getCleanAvatarUrl = (comment: Comment) => {
  if (!comment.user_id || !comment.avatar_url) return undefined;
  if (comment.avatar_url.includes('dicebear.com')) return undefined;
  return comment.avatar_url;
};

const HotspotComments: React.FC<HotspotCommentsProps> = ({ hotspotId, hotspotTitle }) => {
  const { user, isAuthenticated, isAdmin } = useAuth();
  const { showToast } = useToast();
  const { confirm, confirmDialog } = useConfirm();

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 访客发评表单（登录用户直接用个人资料，不传 nickname/email）
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [content, setContent] = useState('');

  // 回复表单
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyNickname, setReplyNickname] = useState('');
  const [replyEmail, setReplyEmail] = useState('');
  const [replyContent, setReplyContent] = useState('');

  // 行内编辑
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // 点赞 & 举报
  const [likedComments, setLikedComments] = useState<Set<number>>(new Set());
  const [reportingComment, setReportingComment] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [error, setError] = useState('');

  const totalComments = useMemo(() => countAllComments(comments), [comments]);

  const loadComments = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getHotspotComments(hotspotId);
      setComments(response || []);
    } catch (loadError) {
      console.error('获取热点评论失败:', loadError);
      setComments([]);
      setError('评论加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComments();
  }, [hotspotId]);

  const handleSubmitRoot = async () => {
    if (!content.trim()) {
      showToast('请填写评论内容', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await submitHotspotComment(
        hotspotId,
        isAuthenticated
          ? { content: content.trim() }
          : {
              nickname: nickname.trim() || undefined,
              email: email.trim() || undefined,
              content: content.trim(),
            },
      );
      setContent('');
      showToast('评论已发布', 'success');
      await loadComments();
    } catch (submitError: any) {
      showToast(errorText(submitError, '提交失败，请稍后重试'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReply = async (parentId: number) => {
    if (!replyContent.trim()) {
      showToast('请填写回复内容', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await submitHotspotComment(
        hotspotId,
        isAuthenticated
          ? { content: replyContent.trim(), parent_id: parentId }
          : {
              nickname: replyNickname.trim() || undefined,
              email: replyEmail.trim() || undefined,
              content: replyContent.trim(),
              parent_id: parentId,
            },
      );
      setReplyingTo(null);
      setReplyContent('');
      setReplyNickname('');
      setReplyEmail('');
      showToast('回复已发布', 'success');
      await loadComments();
    } catch (submitError: any) {
      showToast(errorText(submitError, '回复失败，请稍后重试'), 'error');
    } finally {
      setSubmitting(false);
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
      updateCommentTree(prev, commentId, (c) => ({
        ...c,
        like_count: Math.max(0, (c.like_count || 0) + (willLike ? 1 : -1)),
      })),
    );
    try {
      const response = await likeComment(commentId);
      setComments((prev) =>
        updateCommentTree(prev, commentId, (comment) => ({
          ...comment,
          like_count: response.like_count,
        })),
      );
      setLikedComments((prev) => {
        const next = new Set(prev);
        if (response.liked) next.add(commentId);
        else next.delete(commentId);
        return next;
      });
    } catch (likeError: any) {
      // 回滚
      setLikedComments((prev) => {
        const next = new Set(prev);
        if (willLike) next.delete(commentId);
        else next.add(commentId);
        return next;
      });
      setComments((prev) =>
        updateCommentTree(prev, commentId, (c) => ({
          ...c,
          like_count: Math.max(0, (c.like_count || 0) + (willLike ? -1 : 1)),
        })),
      );
      showToast(errorText(likeError, '点赞失败，请稍后重试'), 'error');
    }
  };

  const handleSaveEdit = async (commentId: number) => {
    if (!editingContent.trim()) {
      showToast('评论内容不能为空', 'error');
      return;
    }
    setSavingEdit(true);
    try {
      const updated = await updateComment(commentId, editingContent.trim());
      setComments((prev) =>
        updateCommentTree(prev, commentId, (c) => ({
          ...c,
          content: updated.content,
          edited_at: updated.edited_at || new Date().toISOString(),
        })),
      );
      setEditingId(null);
      setEditingContent('');
      showToast('评论已更新', 'success');
    } catch (editError: any) {
      showToast(errorText(editError, '保存修改失败'), 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (commentId: number) => {
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
      await loadComments();
    } catch (delError: any) {
      showToast(errorText(delError, '删除失败'), 'error');
    }
  };

  const handleReport = async (commentId: number) => {
    if (!reportReason.trim()) {
      showToast('请填写举报原因', 'error');
      return;
    }

    try {
      await reportComment(commentId, {
        reason: reportReason.trim(),
        description: reportDescription.trim() || undefined,
      });
      setReportingComment(null);
      setReportReason('');
      setReportDescription('');
      showToast('举报已提交，感谢反馈', 'success');
    } catch (reportError: any) {
      showToast(errorText(reportError, '举报失败，请稍后重试'), 'error');
    }
  };

  const renderComment = (comment: Comment, depth = 0): React.ReactNode => {
    const isReplying = replyingTo === comment.id;
    const isReporting = reportingComment === comment.id;
    const isEditing = editingId === comment.id;
    const replies = comment.replies || [];
    const displayName = getDisplayName(comment);
    const isAuthorBadge = comment.is_admin_reply || comment.user_role === 'admin' || comment.user_role === 'super_admin';
    const canManage = isAdmin || (!!user && comment.user_id === user.id);
    const isOwn = !!user && comment.user_id === user.id;

    return (
      <div
        key={comment.id}
        className={`rounded-xl border transition-colors ${
          comment.is_admin_reply
            ? 'border-primary-200/80 dark:border-primary-800/60 bg-primary-50/30 dark:bg-primary-950/15'
            : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90'
        } ${depth > 0 ? 'ml-4 md:ml-7 mt-3' : ''}`}
      >
        <div className="p-4 md:p-5">
          <div className="flex items-start gap-3">
            {comment.username ? (
              <Link to={`/user/${encodeURIComponent(comment.username)}`} className="shrink-0">
                <Avatar name={displayName} avatarUrl={getCleanAvatarUrl(comment)} className="w-9 h-9 text-sm ring-1 ring-slate-200 dark:ring-slate-700" />
              </Link>
            ) : (
              <Avatar name={displayName} avatarUrl={getCleanAvatarUrl(comment)} className="w-9 h-9 text-sm ring-1 ring-slate-200 dark:ring-slate-700" />
            )}

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {comment.username ? (
                  <Link
                    to={`/user/${encodeURIComponent(comment.username)}`}
                    className={`font-semibold hover:underline ${
                      isAuthorBadge ? 'text-primary-600 dark:text-primary-400' : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {displayName}
                  </Link>
                ) : (
                  <span className={`font-semibold ${isAuthorBadge ? 'text-primary-600 dark:text-primary-400' : 'text-slate-900 dark:text-slate-100'}`}>
                    {displayName}
                  </span>
                )}

                {isAuthorBadge ? (
                  <span className="inline-flex items-center rounded-md bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 px-1.5 py-0.5 text-[11px] font-medium border border-primary-200/70 dark:border-primary-800/60">
                    {comment.is_admin_reply ? '作者回复' : '站长'}
                  </span>
                ) : comment.user_id ? (
                  <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 text-[11px] font-medium border border-slate-200/80 dark:border-slate-700">
                    成员
                  </span>
                ) : null}

                <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                  {new Date(comment.created_at).toLocaleString('zh-CN')}
                </span>

                {comment.edited_at && (
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">(已编辑)</span>
                )}
              </div>

              {isEditing ? (
                <div className="mt-3 space-y-2.5">
                  <textarea
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => { setEditingId(null); setEditingContent(''); }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      disabled={savingEdit}
                      onClick={() => handleSaveEdit(comment.id)}
                      className="px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium disabled:opacity-50"
                    >
                      {savingEdit ? '保存中...' : '保存修改'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2.5 text-sm text-slate-700 dark:text-slate-300 leading-7">
                  <MarkdownContent compact enableMermaid={false} allowHtml={false} className="!max-w-none dark:text-slate-300">
                    {comment.content}
                  </MarkdownContent>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                <button
                  type="button"
                  onClick={() => handleLike(comment.id)}
                  className={`inline-flex items-center gap-1 hover:text-red-500 transition-colors ${likedComments.has(comment.id) ? 'text-red-500' : ''}`}
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
                    if (!isReplying) setReplyContent('');
                    setReplyingTo(isReplying ? null : comment.id);
                    setReportingComment(null);
                  }}
                  className="inline-flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                >
                  <Icons.MessageSquare className="w-3.5 h-3.5" /> 回复
                </button>

                {canManage && !isEditing && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(comment.id);
                        setEditingContent(comment.content);
                        setReplyingTo(null);
                      }}
                      className="inline-flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                    >
                      <Icons.Pencil className="w-3.5 h-3.5" /> 编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(comment.id)}
                      className="inline-flex items-center gap-1 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    >
                      <Icons.Trash2 className="w-3.5 h-3.5" /> 删除
                    </button>
                  </>
                )}

                {!comment.is_admin_reply && !isOwn && (
                  <button
                    type="button"
                    onClick={() => {
                      setReportingComment(isReporting ? null : comment.id);
                      setReplyingTo(null);
                    }}
                    className="inline-flex items-center gap-1 hover:text-amber-600 dark:hover:text-amber-400 transition-colors ml-auto"
                  >
                    <Icons.Flag className="w-3.5 h-3.5" /> 举报
                  </button>
                )}
              </div>

              {isReplying && (
                <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 space-y-3">
                  {!isAuthenticated && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        placeholder="你的昵称（可选）"
                        value={replyNickname}
                        onChange={(event) => setReplyNickname(event.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                      />
                      <input
                        type="email"
                        placeholder="邮箱（可选）"
                        value={replyEmail}
                        onChange={(event) => setReplyEmail(event.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                      />
                    </div>
                  )}
                  <textarea
                    value={replyContent}
                    onChange={(event) => setReplyContent(event.target.value)}
                    placeholder={`回复 @${displayName}...`}
                    className="w-full h-22 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setReplyingTo(null)}
                      className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleSubmitReply(comment.id)}
                      className="px-3.5 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      发送回复
                    </button>
                  </div>
                </div>
              )}

              {isReporting && (
                <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/60 dark:bg-amber-950/20 p-3.5 space-y-2.5">
                  <input
                    type="text"
                    value={reportReason}
                    onChange={(event) => setReportReason(event.target.value)}
                    placeholder="举报原因（如垃圾广告 / 恶意攻击）"
                    className="w-full rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                  <textarea
                    value={reportDescription}
                    onChange={(event) => setReportDescription(event.target.value)}
                    placeholder="补充说明（可选）"
                    className="w-full h-18 rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setReportingComment(null)}
                      className="px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReport(comment.id)}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors"
                    >
                      提交举报
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {replies.length > 0 && (
          <div className="px-4 md:px-5 pb-4">
            <div className="border-l border-slate-200 dark:border-slate-800 pl-1">
              {replies.map((reply) => renderComment(reply, depth + 1))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <section
      id="hotspot-comments"
      className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 overflow-hidden transition-colors"
    >
      <div className="px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Icons.MessageCircle className="w-4 h-4 text-primary-500" />
            读者讨论
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            围绕「{hotspotTitle}」补充来源、提出质疑或分享观点。
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1 text-xs font-medium border border-slate-200/80 dark:border-slate-700 tabular-nums">
          {totalComments} 条讨论
        </span>
      </div>

      <div className="p-6 space-y-6">
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-4 space-y-3">
          {isAuthenticated && user ? (
            <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <Avatar
                  name={user.display_name || user.username}
                  avatarUrl={user.avatar_url}
                  className="w-6 h-6 text-xs"
                />
                <span>
                  将以 <strong className="text-slate-800 dark:text-slate-200">{user.display_name || user.username}</strong> 身份发表
                </span>
              </div>
              <Link to={`/user/${encodeURIComponent(user.username)}`} className="text-primary-600 dark:text-primary-400 hover:underline">
                个人主页
              </Link>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>以访客身份评论，或登录后绑定个人主页与消息通知</span>
                <Link
                  to={`/login?redirect=${encodeURIComponent(`/hotspots/${hotspotId}`)}`}
                  className="font-medium text-primary-600 dark:text-primary-400 hover:underline shrink-0"
                >
                  去登录 &rarr;
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="你的昵称（可选）"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="邮箱（可选）"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                />
              </div>
            </div>
          )}

          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="留下你对这个热点的判断、质疑或补充资料（支持基础 Markdown）..."
            className="w-full h-24 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs text-slate-400 dark:text-slate-500">
              理性讨论、友善表达，支持评论后编辑与回复通知。
            </span>
            <button
              type="button"
              onClick={handleSubmitRoot}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Icons.Send className="w-3.5 h-3.5" />
              {submitting ? '提交中...' : '发布评论'}
            </button>
          </div>
        </div>

        {loading ? (
          <ListSkeleton rows={2} />
        ) : error ? (
          <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 p-4 text-sm text-red-600 dark:text-red-300">
            {error}
          </div>
        ) : comments.length === 0 ? (
          <EmptyState
            icon={<Icons.MessageCircle className="w-5 h-5" />}
            title="还没有评论"
            description="欢迎补充一手资料或分享你的观点。"
          />
        ) : (
          <div className="space-y-3">
            {comments.map((comment) => renderComment(comment))}
          </div>
        )}
      </div>

      {confirmDialog}
    </section>
  );
};

export default HotspotComments;
