/**
 * 评论管理页面
 */
import React, { useState, useEffect } from 'react';
import { getPendingComments, getApprovedComments, getReportedComments, approveComment, rejectComment, deleteComment, adminReply, dismissReport, confirmReport, Comment, ReportedComment } from '../api/comments';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { errorText } from '../utils/errors';

type TabType = 'pending' | 'approved' | 'reported';

// 举报原因映射
const REPORT_REASON_MAP: Record<string, string> = {
    'spam': '垃圾广告',
    'abuse': '辱骂攻击',
    'illegal': '违法信息',
    'porn': '色情低俗',
    'misleading': '虚假信息',
    'other': '其他原因',
};

// 三个列表共用的行主体：文章内联行 + 昵称/时间一行 + 点击展开的正文
const CommentBody: React.FC<{ comment: Comment; expanded: boolean; onToggle: () => void }> = ({ comment, expanded, onToggle }) => (
    <div className="min-w-0">
        {comment.article_title && (
            <div className="text-xs text-slate-400 dark:text-slate-500 truncate">文章：{comment.article_title}</div>
        )}
        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-200">{comment.nickname}</span>
            {comment.is_admin_reply && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-full border border-indigo-200 dark:border-indigo-800">
                    管理员
                </span>
            )}
            <span className="ml-2">
                {new Date(comment.created_at).toLocaleString('zh-CN')}
                {comment.email && ` · ${comment.email}`}
            </span>
        </div>
        <p
            onClick={onToggle}
            title="点击展开/收起"
            className={`mt-1 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap cursor-pointer ${expanded ? '' : 'line-clamp-2'}`}
        >
            {comment.content}
        </p>
        {comment.parent_id && (
            <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">回复评论 #{comment.parent_id}</div>
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
    // pending 队列总量（pending 页拉取时更新，审核/删除后递减；未访问过 pending 页则不显示徽标）
    const [pendingCount, setPendingCount] = useState(0);
    // 正文展开状态：默认 line-clamp-2，点击看全文
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
                // API 可能直接返回数组或带分页结构
                const data = Array.isArray(response) ? response : (response.data || []);
                setComments(data);
                setReportedComments([]);
                setTotalPages(Array.isArray(response) ? 1 : (response.total_pages || 1));
                if (activeTab === 'pending') {
                    setPendingCount(Array.isArray(response) ? data.length : (response.total ?? data.length));
                }
            }
        } catch (error) {
            console.error('获取评论失败:', error);
            setComments([]);
            setReportedComments([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchComments();
    }, [page, activeTab]);

    // 切换标签时重置页码
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
        } catch (error) {
            console.error('删除评论失败:', error);
            showToast(errorText(error, '删除失败'), 'error');
        }
    };

    // 驳回举报（保留评论）
    const handleDismissReport = async (id: number) => {
        try {
            await dismissReport(id);
            setReportedComments((prev) => prev.filter((rc) => rc.comment.id !== id));
        } catch (error) {
            console.error('驳回举报失败:', error);
            showToast(errorText(error, '驳回举报失败'), 'error');
        }
    };

    // 确认举报（删除评论）
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
        } catch (error) {
            console.error('确认举报失败:', error);
            showToast(errorText(error, '确认举报失败'), 'error');
        }
    };

    // 打开回复模态框
    const openReplyModal = (comment: Comment) => {
        setReplyingTo(comment);
        setReplyContent('');
        setShowReplyModal(true);
    };

    // 关闭回复模态框
    const closeReplyModal = () => {
        setShowReplyModal(false);
        setReplyingTo(null);
        setReplyContent('');
    };

    // 提交回复
    const handleSubmitReply = async () => {
        if (!replyingTo || !replyContent.trim()) return;

        setSubmitting(true);
        try {
            await adminReply(replyingTo.id, { content: replyContent.trim() });
            closeReplyModal();
            // 刷新评论列表
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
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">评论管理</h1>
                <span className="text-slate-500 dark:text-slate-400">
                    当前：{activeTab === 'reported' ? reportedComments.length : comments.length} 条
                </span>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
                <button
                    onClick={() => handleTabChange('reported')}
                    className={`px-4 py-2 font-medium transition-all border-b-2 -mb-[2px] flex items-center gap-2 ${activeTab === 'reported'
                            ? 'text-red-600 dark:text-red-400 border-red-600 dark:border-red-400'
                            : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                >
                    🚩 被举报
                    {reportedComments.length > 0 && activeTab === 'reported' && (
                        <span className="px-2 py-0.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full">
                            {reportedComments.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => handleTabChange('pending')}
                    className={`px-4 py-2 font-medium transition-all border-b-2 -mb-[2px] flex items-center gap-1.5 ${activeTab === 'pending'
                            ? 'text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-400'
                            : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                >
                    待审核
                    {pendingCount > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                            {pendingCount}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => handleTabChange('approved')}
                    className={`px-4 py-2 font-medium transition-all border-b-2 -mb-[2px] ${activeTab === 'approved'
                            ? 'text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-400'
                            : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                >
                    已通过
                </button>
            </div>

            {/* Comments List */}
            <div>
                {loading ? (
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-10 text-center text-slate-500 dark:text-slate-400">
                        加载中...
                    </div>
                ) : activeTab === 'reported' ? (
                    // 被举报评论列表
                    reportedComments.length === 0 ? (
                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-10 text-center text-slate-500 dark:text-slate-400">
                            ✅ 没有被举报的评论
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                            {reportedComments.map((item) => (
                                <div
                                    key={item.comment.id}
                                    className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/40"
                                >
                                    <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3">
                                        <img
                                            src={item.comment.avatar_url || item.comment.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.comment.nickname}`}
                                            alt={item.comment.nickname}
                                            className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700"
                                        />
                                        <div className="min-w-0">
                                            {/* 举报明细（决策依据，紧凑逐行） */}
                                            <div className="text-xs font-medium text-red-600 dark:text-red-400">
                                                🚩 收到 {item.reports.length} 次举报
                                            </div>
                                            <div className="mt-1 mb-1.5 space-y-1">
                                                {item.reports.map((report, idx) => (
                                                    <div key={report.id || idx} className="flex items-center gap-1.5 flex-wrap text-xs">
                                                        <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 rounded text-[10px] font-medium">
                                                            {REPORT_REASON_MAP[report.reason] || report.reason}
                                                        </span>
                                                        <span className="text-slate-400 dark:text-slate-500">
                                                            {new Date(report.created_at).toLocaleString('zh-CN')}
                                                        </span>
                                                        {report.description && (
                                                            <span className="text-slate-500 dark:text-slate-400">· {report.description}</span>
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

                                        {/* Actions：sm 以下竖排 */}
                                        <div className="flex flex-col items-stretch sm:flex-row sm:items-center gap-1.5 shrink-0">
                                            <button
                                                onClick={() => handleDismissReport(item.comment.id)}
                                                className="px-2.5 py-1 text-xs font-medium text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                                                title="驳回举报，保留评论"
                                            >
                                                驳回举报
                                            </button>
                                            <button
                                                onClick={() => handleConfirmReport(item.comment.id)}
                                                className="px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                title="确认举报，删除评论"
                                            >
                                                删除评论
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                ) : comments.length === 0 ? (
                    activeTab === 'pending' ? (
                        // 待审队列清空：emerald 正向反馈
                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-10 text-center">
                            <div className="text-emerald-600 dark:text-emerald-400 font-semibold">队列已清空 ✓</div>
                            <div className="mt-1 text-sm text-slate-400 dark:text-slate-500">新的待审评论会出现在这里</div>
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-10 text-center text-slate-500 dark:text-slate-400">
                            暂无已通过的评论
                        </div>
                    )
                ) : (
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                        {comments.map((comment) => (
                            <div
                                key={comment.id}
                                className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/40"
                            >
                                <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3">
                                    <img
                                        src={comment.avatar_url || comment.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.nickname}`}
                                        alt={comment.nickname}
                                        className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700"
                                    />
                                    <CommentBody
                                        comment={comment}
                                        expanded={expandedIds.has(comment.id)}
                                        onToggle={() => toggleExpand(comment.id)}
                                    />

                                    {/* Actions：sm 以下竖排 */}
                                    <div className="flex flex-col items-stretch sm:flex-row sm:items-center gap-1.5 shrink-0">
                                        {/* 已通过评论可以回复 */}
                                        {activeTab === 'approved' && !comment.is_admin_reply && (
                                            <button
                                                onClick={() => openReplyModal(comment)}
                                                className="px-2.5 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                                            >
                                                回复
                                            </button>
                                        )}
                                        {/* 待审核评论可以通过/拒绝 */}
                                        {activeTab === 'pending' && (
                                            <>
                                                <button
                                                    onClick={() => handleApprove(comment.id)}
                                                    className="px-2.5 py-1 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                                                >
                                                    通过
                                                </button>
                                                <button
                                                    onClick={() => handleReject(comment.id)}
                                                    className="px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                                                >
                                                    拒绝
                                                </button>
                                            </>
                                        )}
                                        <button
                                            onClick={() => handleDelete(comment.id)}
                                            className="px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                        >
                                            删除
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-center gap-2">
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                    >
                        上一页
                    </button>
                    <span className="px-4 py-2 text-slate-500 dark:text-slate-400 font-medium">
                        {page} / {totalPages}
                    </span>
                    <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                    >
                        下一页
                    </button>
                </div>
            )}

            {/* Reply Modal */}
            {showReplyModal && replyingTo && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-lg mx-4 shadow-xl border border-slate-200 dark:border-slate-700">
                        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">回复评论</h2>

                        {/* 原评论预览 */}
                        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 mb-4 border border-slate-100 dark:border-slate-700">
                            <div className="flex items-center gap-2 mb-2">
                                <img
                                    src={replyingTo.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${replyingTo.nickname}`}
                                    alt={replyingTo.nickname}
                                    className="w-6 h-6 rounded-full"
                                />
                                <span className="font-medium text-slate-700 dark:text-slate-200">{replyingTo.nickname}</span>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-3">{replyingTo.content}</p>
                        </div>

                        {/* 回复输入框 */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                回复内容 *
                            </label>
                            <textarea
                                value={replyContent}
                                onChange={(e) => setReplyContent(e.target.value)}
                                placeholder="输入您的回复..."
                                rows={4}
                                className="w-full px-4 py-3 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
                            />
                        </div>

                        {/* 按钮 */}
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={closeReplyModal}
                                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSubmitReply}
                                disabled={!replyContent.trim() || submitting}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-500/20"
                            >
                                {submitting ? '提交中...' : '发送回复'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {confirmDialog}
        </div>
    );
};


export default CommentManager;
