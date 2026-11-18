/**
 * 评论管理页面
 */
import React, { useState, useEffect } from 'react';
import {
  getPendingComments,
  getApprovedComments,
  getReportedComments,
  approveComment,
  rejectComment,
  deleteComment,
  adminReply,
  dismissReport,
  confirmReport,
  Comment,
  ReportedComment,
} from '../api/comments';
import Avatar from '../components/Avatar';
import { Icons } from '../components/Icons';
import { Badge, Button, Card, EmptyState, Textarea } from '../components/Shared';
import { ListSkeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { errorText } from '../utils/errors';

type TabType = 'pending' | 'approved' | 'reported';

// 举报原因映射
const REPORT_REASON_MAP: Record<string, string> = {
  spam: '垃圾广告',
  abuse: '辱骂攻击',
  illegal: '违法信息',
  porn: '色情低俗',
  misleading: '虚假信息',
  other: '其他原因',
};

// 三个列表共用的行主体：文章内联行 + 昵称/时间一行 + 点击展开的正文
const CommentBody: React.FC<{
  comment: Comment;
  expanded: boolean;
  onToggle: () => void;
}> = ({ comment, expanded, onToggle }) => (
  <div className="min-w-0">
    {comment.article_title && (
      <div className="text-xs text-slate-400 dark:text-slate-500 truncate">
        文章：{comment.article_title}
      </div>
    )}
    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
      <span className="font-medium text-slate-800 dark:text-slate-200">{comment.nickname}</span>
      {comment.is_admin_reply && (
        <Badge color="primary" className="text-[10px] py-0">
          管理员
        </Badge>
      )}
      <span className="tabular-nums">
        {new Date(comment.created_at).toLocaleString('zh-CN')}
        {comment.email && ` · ${comment.email}`}
      </span>
    </div>
    <p
      onClick={onToggle}
      title="点击展开/收起"
      className={`mt-1.5 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap cursor-pointer leading-relaxed ${
        expanded ? '' : 'line-clamp-2'
      }`}
    >
      {comment.content}
    </p>
    {comment.parent_id && (
      <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
        回复评论 #{comment.parent_id}
      </div>
    )}
  </div>
);

const CommentManager: React.FC = () => {
  const { showToast } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [activeTab, setActiveTab] = useState<TabType>('reported');
  const [comments, setComments] = useState<Comment[]>([]);
  const [reportedComments, setReportedComments] = useState<ReportedComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pendingCount, setPendingCount] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // 回复模态框状态
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = async () => {
    setLoading(true);
    try {
      if (activeTab === 'reported') {
        const data = await getReportedComments();
        setReportedComments(data);
        setComments([]);
        setTotalPages(1);
      } else {
        const fetchFn = activeTab === 'pending' ? getPendingComments : getApprovedComments;
        const response = await fetchFn({ page, page_size: 20 });
        const data = Array.isArray(response) ? response : response.data || [];
        setComments(data);
        setReportedComments([]);
        setTotalPages(Array.isArray(response) ? 1 : response.total_pages || 1);
        if (activeTab === 'pending') {
          setPendingCount(Array.isArray(response) ? data.length : response.total ?? data.length);
        }
      }
    } catch (error) {
      console.error('获取评论失败:', error);
      showToast(errorText(error, '获取评论列表失败'), 'error');
      setComments([]);
      setReportedComments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [page, activeTab]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setPage(1);
  };

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApprove = async (id: number) => {
    try {
      await approveComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
      setPendingCount((n) => Math.max(0, n - 1));
      showToast('已通过审核', 'success');
    } catch (error) {
      console.error('审核评论失败:', error);
      showToast(errorText(error, '审核失败'), 'error');
    }
  };

  const handleReject = async (id: number) => {
    try {
      await rejectComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
      setPendingCount((n) => Math.max(0, n - 1));
      showToast('已拒绝该评论', 'success');
    } catch (error) {
      console.error('拒绝评论失败:', error);
      showToast(errorText(error, '拒绝失败'), 'error');
    }
  };

  const handleDelete = async (id: number) => {
    const ok = await confirm({
      title: '删除评论',
      message: '确认删除这条评论吗？删除后不可恢复。',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
      setReportedComments((prev) => prev.filter((rc) => rc.comment.id !== id));
      if (activeTab === 'pending') setPendingCount((n) => Math.max(0, n - 1));
      showToast('评论已删除', 'success');
    } catch (error) {
      console.error('删除评论失败:', error);
      showToast(errorText(error, '删除失败'), 'error');
    }
  };

  const handleDismissReport = async (id: number) => {
    try {
      await dismissReport(id);
      setReportedComments((prev) => prev.filter((rc) => rc.comment.id !== id));
      showToast('已驳回举报并保留评论', 'success');
    } catch (error) {
      console.error('驳回举报失败:', error);
      showToast(errorText(error, '驳回举报失败'), 'error');
    }
  };

  const handleConfirmReport = async (id: number) => {
    const ok = await confirm({
      title: '确认举报',
      message: '确认举报将删除该评论，删除后不可恢复。',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await confirmReport(id);
      setReportedComments((prev) => prev.filter((rc) => rc.comment.id !== id));
      showToast('已删除违规评论', 'success');
    } catch (error) {
      console.error('确认举报失败:', error);
      showToast(errorText(error, '确认举报失败'), 'error');
    }
  };

  const openReplyModal = (comment: Comment) => {
    setReplyingTo(comment);
    setReplyContent('');
    setShowReplyModal(true);
  };

  const closeReplyModal = () => {
    setShowReplyModal(false);
    setReplyingTo(null);
    setReplyContent('');
  };

  const handleSubmitReply = async () => {
    if (!replyingTo || !replyContent.trim()) return;

    setSubmitting(true);
    try {
      await adminReply(replyingTo.id, { content: replyContent.trim() });
      closeReplyModal();
      showToast('回复已发送', 'success');
      fetchComments();
    } catch (error) {
      console.error('回复失败:', error);
      showToast(errorText(error, '回复失败'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
            评论审核
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            处理读者评论、被举报内容并支持管理员直接回复
          </p>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          当前队列：{activeTab === 'reported' ? reportedComments.length : comments.length} 条
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200/80 dark:border-slate-800">
        <button
          type="button"
          onClick={() => handleTabChange('reported')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'reported'
              ? 'text-red-600 dark:text-red-400 border-red-500'
              : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Icons.Flag className="w-3.5 h-3.5" />
          <span>被举报</span>
          {reportedComments.length > 0 && activeTab === 'reported' && (
            <span className="min-w-[18px] h-[18px] px-1.5 text-[10px] font-semibold bg-red-500 text-white rounded-full flex items-center justify-center tabular-nums">
              {reportedComments.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('pending')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'pending'
              ? 'text-slate-900 dark:text-white border-primary-500'
              : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <span>待审核</span>
          {pendingCount > 0 && (
            <span className="min-w-[18px] h-[18px] px-1.5 bg-red-500 text-white text-[10px] font-semibold rounded-full flex items-center justify-center tabular-nums">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('approved')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'approved'
              ? 'text-slate-900 dark:text-white border-primary-500'
              : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          已通过
        </button>
      </div>

      {/* Comments List */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-4">
            <ListSkeleton rows={4} />
          </div>
        ) : activeTab === 'reported' ? (
          reportedComments.length === 0 ? (
            <EmptyState
              icon={<Icons.CheckCircle2 className="w-5 h-5 text-emerald-500" />}
              title="没有被举报的评论"
              description="当前站点评论区秩序良好，无待处理举报。"
              className="border-0"
            />
          ) : (
            <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
              {reportedComments.map((item) => (
                <div
                  key={item.comment.id}
                  className="px-4 py-3.5 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3">
                    <Avatar
                      name={item.comment.nickname}
                      avatarUrl={item.comment.avatar_url || item.comment.avatar}
                      className="w-7 h-7 text-xs mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                        <Icons.Flag className="w-3.5 h-3.5" />
                        <span>收到 {item.reports.length} 次举报</span>
                      </div>
                      <div className="mt-1 mb-1.5 space-y-1">
                        {item.reports.map((report, idx) => (
                          <div
                            key={report.id || idx}
                            className="flex items-center gap-1.5 flex-wrap text-xs"
                          >
                            <Badge color="red" className="text-[10px]">
                              {REPORT_REASON_MAP[report.reason] || report.reason}
                            </Badge>
                            <span className="text-slate-400 dark:text-slate-500 tabular-nums">
                              {new Date(report.created_at).toLocaleString('zh-CN')}
                            </span>
                            {report.description && (
                              <span className="text-slate-500 dark:text-slate-400">
                                · {report.description}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                      <CommentBody
                        comment={item.comment}
                        expanded={expandedIds.has(item.comment.id)}
                        onToggle={() => toggleExpand(item.comment.id)}
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDismissReport(item.comment.id)}
                        className="h-7 px-2.5 text-xs text-emerald-600 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/60"
                        title="驳回举报，保留评论"
                      >
                        驳回举报
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleConfirmReport(item.comment.id)}
                        className="h-7 px-2.5 text-xs text-red-600 dark:text-red-400 border-red-200/80 dark:border-red-800/60"
                        title="确认举报，删除评论"
                      >
                        删除评论
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : comments.length === 0 ? (
          activeTab === 'pending' ? (
            <EmptyState
              icon={<Icons.CheckCircle2 className="w-5 h-5 text-emerald-500" />}
              title="待审队列已清空"
              description="新的待审评论会显示在这里。"
              className="border-0"
            />
          ) : (
            <EmptyState
              icon={<Icons.MessageCircle className="w-5 h-5" />}
              title="暂无已通过的评论"
              className="border-0"
            />
          )
        ) : (
          <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="px-4 py-3.5 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3">
                  <Avatar
                    name={comment.nickname}
                    avatarUrl={comment.avatar_url || comment.avatar}
                    className="w-7 h-7 text-xs mt-0.5"
                  />
                  <CommentBody
                    comment={comment}
                    expanded={expandedIds.has(comment.id)}
                    onToggle={() => toggleExpand(comment.id)}
                  />

                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 shrink-0">
                    {activeTab === 'approved' && !comment.is_admin_reply && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openReplyModal(comment)}
                        className="h-7 px-2.5 text-xs"
                      >
                        回复
                      </Button>
                    )}
                    {activeTab === 'pending' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleApprove(comment.id)}
                          className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700"
                        >
                          通过
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReject(comment.id)}
                          className="h-7 px-2.5 text-xs text-amber-600 dark:text-amber-400 border-amber-200/80 dark:border-amber-800/60"
                        >
                          拒绝
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(comment.id)}
                      className="h-7 px-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      删除
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            上一页
          </Button>
          <span className="px-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            第 {page} / {totalPages} 页
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            下一页
          </Button>
        </div>
      )}

      {/* Reply Modal */}
      {showReplyModal && replyingTo && (
        <div
          className="fixed inset-0 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center z-50 p-4"
          onClick={closeReplyModal}
        >
          <div
            className="w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <Card className="p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">回复评论</h2>
              <button
                type="button"
                onClick={closeReplyModal}
                aria-label="关闭弹窗"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Icons.X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/60 rounded-lg p-3.5 mb-4 border border-slate-200/70 dark:border-slate-800">
              <div className="flex items-center gap-2 mb-1.5">
                <Avatar
                  name={replyingTo.nickname}
                  avatarUrl={replyingTo.avatar_url || replyingTo.avatar}
                  className="w-6 h-6 text-[11px]"
                />
                <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                  {replyingTo.nickname}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed">
                {replyingTo.content}
              </p>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                回复内容 *
              </label>
              <Textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="输入您的回复..."
                rows={4}
                className="resize-none"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={closeReplyModal}>
                取消
              </Button>
              <Button
                size="sm"
                onClick={handleSubmitReply}
                disabled={!replyContent.trim() || submitting}
              >
                {submitting ? '提交中...' : '发送回复'}
              </Button>
            </div>
            </Card>
          </div>
        </div>
      )}

      {confirmDialog}
    </div>
  );
};

export default CommentManager;
