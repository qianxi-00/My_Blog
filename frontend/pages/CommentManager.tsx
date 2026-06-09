/**
 * 评论管理页面
 */
import React, { useState, useEffect } from 'react';
import { getPendingComments, getApprovedComments, getReportedComments, approveComment, rejectComment, deleteComment, adminReply, dismissReport, confirmReport, Comment, ReportedComment } from '../api/comments';

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

const CommentManager: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabType>('reported');
    const [comments, setComments] = useState<Comment[]>([]);
    const [reportedComments, setReportedComments] = useState<ReportedComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

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
            } else {
                const fetchFn = activeTab === 'pending' ? getPendingComments : getApprovedComments;
                const response = await fetchFn({ page, page_size: 20 });
                // API 可能直接返回数组或带分页结构
                const data = Array.isArray(response) ? response : (response.data || []);
                setComments(data);
                setReportedComments([]);
                setTotalPages(Array.isArray(response) ? 1 : (response.total_pages || 1));
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

    const handleApprove = async (id: number) => {
        try {
            await approveComment(id);
            setComments((prev) => prev.filter((c) => c.id !== id));
        } catch (error) {
            console.error('审核评论失败:', error);
        }
    };

    const handleReject = async (id: number) => {
        try {
            await rejectComment(id);
            setComments((prev) => prev.filter((c) => c.id !== id));
        } catch (error) {
            console.error('拒绝评论失败:', error);
        }
    };

    const handleDelete = async (id: number) => {
        if (window.confirm('确定要删除这条评论吗？')) {
            try {
                await deleteComment(id);
                setComments((prev) => prev.filter((c) => c.id !== id));
                setReportedComments((prev) => prev.filter((rc) => rc.comment.id !== id));
            } catch (error) {
                console.error('删除评论失败:', error);
            }
        }
    };

    // 驳回举报（保留评论）
    const handleDismissReport = async (id: number) => {
        try {
            await dismissReport(id);
            setReportedComments((prev) => prev.filter((rc) => rc.comment.id !== id));
        } catch (error) {
            console.error('驳回举报失败:', error);
        }
    };

    // 确认举报（删除评论）
    const handleConfirmReport = async (id: number) => {
        if (window.confirm('确认举报将删除该评论，确定吗？')) {
            try {
                await confirmReport(id);
                setReportedComments((prev) => prev.filter((rc) => rc.comment.id !== id));
            } catch (error) {
                console.error('确认举报失败:', error);
            }
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
            alert('回复失败，请重试');
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
                    {comments.length} 条评论
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
                    className={`px-4 py-2 font-medium transition-all border-b-2 -mb-[2px] ${activeTab === 'pending'
                            ? 'text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-400'
                            : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                >
                    待审核
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
            <div className="space-y-4">
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
                        reportedComments.map((item) => (
                            <div
                                key={item.comment.id}
                                className="bg-white dark:bg-slate-800 rounded-xl border-2 border-red-200 dark:border-red-900/50 p-6 shadow-sm"
                            >
                                {/* 举报信息 */}
                                <div className="mb-4 pb-4 border-b border-red-100 dark:border-red-900/30">
                                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold mb-2">
                                        <span>🚩</span>
                                        <span>收到 {item.reports.length} 次举报</span>
                                    </div>
                                    <div className="space-y-2">
                                        {item.reports.map((report, idx) => (
                                            <div key={report.id || idx} className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-sm">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="px-2 py-0.5 bg-red-200 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded text-xs font-medium">
                                                        {REPORT_REASON_MAP[report.reason] || report.reason}
                                                    </span>
                                                    <span className="text-slate-400 dark:text-slate-500 text-xs">
                                                        {new Date(report.created_at).toLocaleString('zh-CN')}
                                                    </span>
                                                </div>
                                                {report.description && (
                                                    <p className="text-slate-600 dark:text-slate-400">{report.description}</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* 文章标题 */}
                                {item.comment.article_title && (
                                    <div className="mb-3 pb-3 border-b border-slate-100 dark:border-slate-700">
                                        <span className="text-xs text-slate-400 dark:text-slate-500">文章：</span>
                                        <span className="text-sm text-slate-600 dark:text-slate-300 font-medium ml-1">{item.comment.article_title}</span>
                                    </div>
                                )}

                                <div className="flex justify-between items-start gap-4">
                                    {/* Comment Content */}
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-3">
                                            <img
                                                src={item.comment.avatar_url || item.comment.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.comment.nickname}`}
                                                alt={item.comment.nickname}
                                                className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700"
                                            />
                                            <div>
                                                <div className="font-medium text-slate-800 dark:text-slate-200">
                                                    {item.comment.nickname}
                                                </div>
                                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                                    {new Date(item.comment.created_at).toLocaleString('zh-CN')}
                                                    {item.comment.email && ` · ${item.comment.email}`}
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{item.comment.content}</p>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-2 shrink-0">
                                        <button
                                            onClick={() => handleDismissReport(item.comment.id)}
                                            className="px-4 py-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-all font-medium"
                                            title="驳回举报，保留评论"
                                        >
                                            ✓ 驳回举报
                                        </button>
                                        <button
                                            onClick={() => handleConfirmReport(item.comment.id)}
                                            className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-all font-medium"
                                            title="确认举报，删除评论"
                                        >
                                            ✗ 删除评论
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )
                ) : comments.length === 0 ? (
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-10 text-center text-slate-500 dark:text-slate-400">
                        {activeTab === 'pending' ? '🎉 没有待审核的评论' : '暂无已通过的评论'}
                    </div>
                ) : (
                    comments.map((comment) => (
                        <div
                            key={comment.id}
                            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm"
                        >
                            {/* 文章标题 */}
                            {comment.article_title && (
                                <div className="mb-3 pb-3 border-b border-slate-100 dark:border-slate-700">
                                    <span className="text-xs text-slate-400 dark:text-slate-500">文章：</span>
                                    <span className="text-sm text-slate-600 dark:text-slate-300 font-medium ml-1">{comment.article_title}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-start gap-4">
                                {/* Comment Content */}
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-3">
                                        <img
                                            src={comment.avatar_url || comment.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.nickname}`}
                                            alt={comment.nickname}
                                            className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700"
                                        />
                                        <div>
                                            <div className="font-medium text-slate-800 dark:text-slate-200">
                                                {comment.nickname}
                                                {comment.is_admin_reply && (
                                                    <span className="ml-2 px-2 py-0.5 text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-full border border-indigo-200 dark:border-indigo-800">
                                                        管理员
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-500 dark:text-slate-400">
                                                {new Date(comment.created_at).toLocaleString('zh-CN')}
                                                {comment.email && ` · ${comment.email}`}
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{comment.content}</p>
                                    {comment.parent_id && (
                                        <div className="mt-2 text-sm text-slate-400 dark:text-slate-500">
                                            回复评论 #{comment.parent_id}
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex gap-2 shrink-0">
                                    {/* 已通过评论可以回复 */}
                                    {activeTab === 'approved' && !comment.is_admin_reply && (
                                        <button
                                            onClick={() => openReplyModal(comment)}
                                            className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-all font-medium"
                                        >
                                            回复
                                        </button>
                                    )}
                                    {/* 待审核评论可以通过/拒绝 */}
                                    {activeTab === 'pending' && (
                                        <>
                                            <button
                                                onClick={() => handleApprove(comment.id)}
                                                className="px-4 py-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-all font-medium"
                                            >
                                                通过
                                            </button>
                                            <button
                                                onClick={() => handleReject(comment.id)}
                                                className="px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-all font-medium"
                                            >
                                                拒绝
                                            </button>
                                        </>
                                    )}
                                    <button
                                        onClick={() => handleDelete(comment.id)}
                                        className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-all font-medium"
                                    >
                                        删除
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
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
        </div>
    );
};


export default CommentManager;
