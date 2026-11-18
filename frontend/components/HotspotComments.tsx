import React, { useEffect, useMemo, useState } from 'react';
import { Icons } from './Icons';
import MarkdownContent from './MarkdownContent';
import {
  Comment,
  getHotspotComments,
  likeComment,
  reportComment,
  submitHotspotComment,
} from '../api/comments';

interface HotspotCommentsProps {
  hotspotId: number;
  hotspotTitle: string;
}

const countAllComments = (items: Comment[]): number => items.reduce((total, item) => total + 1 + countAllComments(item.replies || []), 0);

const updateCommentTree = (
  items: Comment[],
  commentId: number,
  updater: (comment: Comment) => Comment,
): Comment[] => items.map((item) => {
  if (item.id === commentId) return updater(item);
  if (item.replies?.length) {
    return { ...item, replies: updateCommentTree(item.replies, commentId, updater) };
  }
  return item;
});

const getDisplayName = (comment: Comment) => {
  if (comment.is_admin_reply) return '作者';
  return comment.nickname?.trim() || '匿名读者';
};

const avatarFallback = (comment: Comment) => `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(getDisplayName(comment))}`;

const HotspotComments: React.FC<HotspotCommentsProps> = ({ hotspotId, hotspotTitle }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [content, setContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyNickname, setReplyNickname] = useState('');
  const [replyEmail, setReplyEmail] = useState('');
  const [replyContent, setReplyContent] = useState('');
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
      alert('请填写评论内容');
      return;
    }

    setSubmitting(true);
    try {
      await submitHotspotComment(hotspotId, {
        nickname: nickname.trim() || undefined,
        email: email.trim() || undefined,
        content: content.trim(),
      });
      setContent('');
      await loadComments();
    } catch (submitError) {
      console.error('提交热点评论失败:', submitError);
      alert('提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReply = async (parentId: number) => {
    if (!replyContent.trim()) {
      alert('请填写回复内容');
      return;
    }

    setSubmitting(true);
    try {
      await submitHotspotComment(hotspotId, {
        nickname: replyNickname.trim() || undefined,
        email: replyEmail.trim() || undefined,
        content: replyContent.trim(),
        parent_id: parentId,
      });
      setReplyingTo(null);
      setReplyContent('');
      setReplyNickname('');
      setReplyEmail('');
      await loadComments();
    } catch (submitError) {
      console.error('提交热点回复失败:', submitError);
      alert('回复失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async (commentId: number) => {
    try {
      const response = await likeComment(commentId);
      setComments((prev) => updateCommentTree(prev, commentId, (comment) => ({
        ...comment,
        like_count: response.like_count,
      })));
      setLikedComments((prev) => {
        const next = new Set(prev);
        if (response.liked) next.add(commentId);
        else next.delete(commentId);
        return next;
      });
    } catch (likeError) {
      console.error('点赞热点评论失败:', likeError);
      alert('点赞失败，请稍后重试');
    }
  };

  const handleReport = async (commentId: number) => {
    if (!reportReason.trim()) {
      alert('请填写举报原因');
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
      alert('举报已提交');
    } catch (reportError) {
      console.error('举报热点评论失败:', reportError);
      alert('举报失败，请稍后重试');
    }
  };

  const renderComment = (comment: Comment, depth = 0): React.ReactNode => {
    const isReplying = replyingTo === comment.id;
    const isReporting = reportingComment === comment.id;
    const replies = comment.replies || [];
    const displayName = getDisplayName(comment);

    return (
      <div
        key={comment.id}
        className={`rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm ${depth > 0 ? 'ml-4 md:ml-8 mt-4' : ''}`}
      >
        <div className="p-4 md:p-5">
          <div className="flex items-start gap-3">
            <img
              src={comment.avatar_url || avatarFallback(comment)}
              alt={displayName}
              className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 object-cover"
            />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className={`font-semibold ${comment.is_admin_reply ? 'text-primary-600 dark:text-primary-400' : 'text-slate-900 dark:text-white'}`}>
                  {displayName}
                </span>
                {comment.is_admin_reply && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300 px-2 py-0.5 text-[11px] border border-primary-200 dark:border-primary-800">
                    作者回复
                  </span>
                )}
                <span className="text-xs text-slate-400 dark:text-slate-500">{new Date(comment.created_at).toLocaleString('zh-CN')}</span>
              </div>

              <div className="mt-3 text-sm text-slate-700 dark:text-slate-300 leading-7">
                <MarkdownContent compact enableMermaid={false} allowHtml={false} className="!max-w-none dark:text-slate-300">
                  {comment.content}
                </MarkdownContent>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <button
                  type="button"
                  onClick={() => handleLike(comment.id)}
                  className={`inline-flex items-center gap-1.5 hover:text-red-500 transition-colors ${likedComments.has(comment.id) ? 'text-red-500' : ''}`}
                >
                  <span>{likedComments.has(comment.id) ? '❤️' : '🤍'}</span>
                  <span>{comment.like_count || 0}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setReplyingTo(isReplying ? null : comment.id);
                    setReportingComment(null);
                  }}
                  className="inline-flex items-center gap-1.5 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                >
                  <Icons.MessageSquare className="w-3.5 h-3.5" /> 回复
                </button>

                {!comment.is_admin_reply && (
                  <button
                    type="button"
                    onClick={() => {
                      setReportingComment(isReporting ? null : comment.id);
                      setReplyingTo(null);
                    }}
                    className="inline-flex items-center gap-1.5 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                  >
                    <Icons.Bell className="w-3.5 h-3.5" /> 举报
                  </button>
                )}
              </div>

              {isReplying && (
                <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="你的昵称（可选）"
                      value={replyNickname}
                      onChange={(event) => setReplyNickname(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <input
                      type="email"
                      placeholder="邮箱（可选）"
                      value={replyEmail}
                      onChange={(event) => setReplyEmail(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <textarea
                    value={replyContent}
                    onChange={(event) => setReplyContent(event.target.value)}
                    placeholder={`回复 @${displayName} ...`}
                    className="w-full h-24 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setReplyingTo(null)}
                      className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSubmitReply(comment.id)}
                      className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-500 transition-colors"
                    >
                      发送回复
                    </button>
                  </div>
                </div>
              )}

              {isReporting && (
                <div className="mt-4 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-500/10 p-4 space-y-3">
                  <input
                    type="text"
                    value={reportReason}
                    onChange={(event) => setReportReason(event.target.value)}
                    placeholder="举报原因（如垃圾广告 / 恶意攻击）"
                    className="w-full rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <textarea
                    value={reportDescription}
                    onChange={(event) => setReportDescription(event.target.value)}
                    placeholder="补充说明（可选）"
                    className="w-full h-20 rounded-2xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setReportingComment(null)}
                      className="px-4 py-2 rounded-xl border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/10 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReport(comment.id)}
                      className="px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors"
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
          <div className="px-4 md:px-5 pb-4 md:pb-5">
            <div className="border-l border-dashed border-slate-200 dark:border-slate-700 pl-1">
              {replies.map((reply) => renderComment(reply, depth + 1))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <section id="hotspot-comments" className="rounded-[28px] border border-slate-200/80 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 shadow-sm overflow-hidden">
      <div className="px-6 md:px-7 py-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/75 dark:bg-slate-900/40">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-6 rounded-full bg-primary-500" />
              <h2 className="text-xl font-black text-slate-900 dark:text-white">读者讨论</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              欢迎补充来源、提出不同判断，或指出文中遗漏。
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200 px-3 py-1.5 text-xs font-semibold border border-slate-200 dark:border-slate-600">
            <Icons.MessageCircle className="w-3.5 h-3.5" /> {totalComments} 条讨论
          </div>
        </div>
      </div>

      <div className="p-6 md:p-7 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] gap-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 p-4">
            <div className="text-xs text-slate-400 dark:text-slate-500 mb-2">当前话题</div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2">{hotspotTitle}</div>
            <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">欢迎围绕这条热点分享你的看法与补充信息。</div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 p-4">
            <div className="text-xs text-slate-400 dark:text-slate-500 mb-2">参与情况</div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{totalComments}</div>
            <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">包含主评论与全部回复。</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="你的昵称（可选）"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="邮箱（可选）"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="留下你对这个热点的判断、质疑或补充资料……"
            className="w-full h-28 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
          />

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-slate-400 dark:text-slate-500">
              理性讨论、友善表达，会让这条热点更有价值。
            </div>
            <button
              type="button"
              onClick={handleSubmitRoot}
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-500 transition-colors disabled:opacity-60"
            >
              <Icons.Send className="w-4 h-4" />
              {submitting ? '提交中...' : '发布评论'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-8 text-center text-slate-500 dark:text-slate-400">
            正在加载评论...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-500/10 p-5 text-sm text-red-600 dark:text-red-300">
            {error}
          </div>
        ) : comments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/70 dark:bg-slate-900/40 p-8 text-center text-slate-500 dark:text-slate-400">
            <div className="text-4xl mb-3 opacity-60">💬</div>
            还没有评论，欢迎来聊聊你的看法。
          </div>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => renderComment(comment))}
          </div>
        )}
      </div>
    </section>
  );
};

export default HotspotComments;
