/**
 * 管理后台「用户文章审核」「用户管理」两个面板
 * 由 pages/AdminDashboard.tsx 的 tab 直接渲染
 */
import React, { useEffect, useState } from 'react';
import { Icons } from './Icons';
import { Card } from './Shared';
import { useToast } from './Toast';
import {
    AdminUserItem,
    ReviewArticle,
    UserArticleStatus,
    banUser,
    getAdminUsers,
    getPendingReviewArticles,
    reviewArticle,
    unbanUser,
} from '../api/users';

const PAGE_SIZE = 20;

// 投稿状态徽章（与 UserCenter 保持一致）
const STATUS_BADGES: Record<UserArticleStatus, { label: string; className: string }> = {
    draft: { label: '草稿', className: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600' },
    pending_review: { label: '待审核', className: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800' },
    published: { label: '已发布', className: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' },
    rejected: { label: '已驳回', className: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800' },
};

const FALLBACK_BADGE = 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600';

const statusBadge = (status: string) =>
    STATUS_BADGES[status as UserArticleStatus] || { label: status, className: FALLBACK_BADGE };

// 兼容分页响应结构差异：{data,total_pages}（PaginatedResponse）/ {items,...} / 裸数组
const normalizePage = <T,>(response: unknown): { items: T[]; totalPages: number } => {
    if (Array.isArray(response)) {
        return { items: response as T[], totalPages: 1 };
    }
    const res = response as { data?: T[]; items?: T[]; total_pages?: number } | null | undefined;
    return { items: res?.data || res?.items || [], totalPages: res?.total_pages || 1 };
};

const errText = (error: any, fallback: string) => error?.response?.data?.detail || fallback;

/**
 * 用户文章审核：待审核投稿列表 + 通过 / 驳回（驳回理由必填）
 */
export const UserArticleReviewPanel: React.FC = () => {
    const { showToast } = useToast();
    const [articles, setArticles] = useState<ReviewArticle[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [rejectingId, setRejectingId] = useState<number | null>(null);
    const [rejectNote, setRejectNote] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const fetchPending = async () => {
        setLoading(true);
        try {
            const response = await getPendingReviewArticles({ page, page_size: PAGE_SIZE });
            const { items, totalPages: pages } = normalizePage<ReviewArticle>(response);
            setTotalPages(pages);
            // 当前页已审完时回退一页，避免停在空页
            if (items.length === 0 && page > 1) {
                setPage(page - 1);
                return;
            }
            setArticles(items);
        } catch (error) {
            console.error('获取待审核投稿失败:', error);
            showToast(errText(error, '获取待审核投稿失败'), 'error');
            setArticles([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPending();
    }, [page]);

    const closeReject = () => {
        setRejectingId(null);
        setRejectNote('');
    };

    const handleApprove = async (article: ReviewArticle) => {
        setSubmitting(true);
        try {
            await reviewArticle(article.id, { action: 'approve' });
            showToast('已通过审核', 'success');
            closeReject();
            fetchPending();
        } catch (error) {
            showToast(errText(error, '审核失败'), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleReject = async (article: ReviewArticle) => {
        const note = rejectNote.trim();
        if (!note) {
            showToast('请填写驳回理由', 'error');
            return;
        }
        setSubmitting(true);
        try {
            await reviewArticle(article.id, { action: 'reject', review_note: note });
            showToast('已驳回该投稿', 'success');
            closeReject();
            fetchPending();
        } catch (error) {
            showToast(errText(error, '驳回失败'), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Card className="overflow-hidden">
            {loading ? (
                <div className="p-10 text-center text-slate-400 dark:text-slate-500">加载中...</div>
            ) : articles.length === 0 ? (
                <div className="p-10 text-center text-slate-400 dark:text-slate-500">没有待审核的投稿</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
                                <th className="text-left p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">标题</th>
                                <th className="text-left p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">作者</th>
                                <th className="text-left p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">提交时间</th>
                                <th className="text-left p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">状态</th>
                                <th className="text-right p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                            {articles.map((article) => {
                                const badge = statusBadge(article.status);
                                return (
                                    <React.Fragment key={article.id}>
                                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                            <td className="p-4">
                                                <span className="font-medium text-slate-700 dark:text-slate-200">{article.title}</span>
                                                {article.category && (
                                                    <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">{article.category}</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-sm text-slate-600 dark:text-slate-300">
                                                {article.author?.display_name || article.author?.username || '-'}
                                            </td>
                                            <td className="p-4 text-sm text-slate-500 dark:text-slate-400">
                                                {new Date(article.created_at).toLocaleString('zh-CN')}
                                            </td>
                                            <td className="p-4">
                                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${badge.className}`}>
                                                    {badge.label}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => handleApprove(article)}
                                                        disabled={submitting}
                                                        title="通过审核并发布"
                                                        className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-medium"
                                                    >
                                                        通过
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setRejectingId(rejectingId === article.id ? null : article.id);
                                                            setRejectNote('');
                                                        }}
                                                        disabled={submitting}
                                                        title="驳回并填写理由"
                                                        className="px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-medium"
                                                    >
                                                        驳回
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        {rejectingId === article.id && (
                                            <tr className="bg-slate-50 dark:bg-slate-900/30">
                                                <td colSpan={5} className="p-4">
                                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                                        驳回理由 *
                                                    </label>
                                                    <textarea
                                                        value={rejectNote}
                                                        onChange={(e) => setRejectNote(e.target.value)}
                                                        placeholder="请说明驳回原因，将同步给作者..."
                                                        rows={3}
                                                        className="w-full px-4 py-3 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none resize-none"
                                                    />
                                                    <div className="flex justify-end gap-3 mt-3">
                                                        <button
                                                            onClick={closeReject}
                                                            className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all"
                                                        >
                                                            取消
                                                        </button>
                                                        <button
                                                            onClick={() => handleReject(article)}
                                                            disabled={!rejectNote.trim() || submitting}
                                                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-red-500/20"
                                                        >
                                                            {submitting ? '提交中...' : '确认驳回'}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* 分页 */}
            {!loading && totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 p-4 border-t border-slate-100 dark:border-slate-700">
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
        </Card>
    );
};

/**
 * 用户管理：搜索 + 用户列表 + 封禁 / 解封
 */
type ManagedUser = AdminUserItem & { status?: 'active' | 'banned' };

const isBanned = (user: ManagedUser) => user.is_active === false || user.status === 'banned';

export const AdminUserPanel: React.FC = () => {
    const { showToast } = useToast();
    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [actingId, setActingId] = useState<number | null>(null);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const response = await getAdminUsers({ search: search || undefined, page, page_size: PAGE_SIZE });
            const { items, totalPages: pages } = normalizePage<ManagedUser>(response);
            setTotalPages(pages);
            // 当前页用户被清空时回退一页，避免停在空页
            if (items.length === 0 && page > 1) {
                setPage(page - 1);
                return;
            }
            setUsers(items);
        } catch (error) {
            console.error('获取用户列表失败:', error);
            showToast(errText(error, '获取用户列表失败'), 'error');
            setUsers([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, [page, search]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        setSearch(searchInput.trim());
    };

    const handleToggleBan = async (user: ManagedUser) => {
        const banned = isBanned(user);
        const action = banned ? '解封' : '封禁';
        if (!window.confirm(`确定要${action}用户 ${user.display_name || user.username} 吗？`)) return;

        setActingId(user.id);
        try {
            if (banned) {
                await unbanUser(user.id);
            } else {
                await banUser(user.id);
            }
            showToast(`${action}成功`, 'success');
            fetchUsers();
        } catch (error) {
            showToast(errText(error, `${action}失败`), 'error');
        } finally {
            setActingId(null);
        }
    };

    return (
        <div className="space-y-6">
            {/* 搜索 */}
            <Card className="p-4">
                <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                        <input
                            type="text"
                            placeholder="搜索用户名 / 昵称..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all"
                        />
                    </div>
                    <button
                        type="submit"
                        className="px-5 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors text-sm font-medium shadow-md shadow-cyan-500/20"
                    >
                        搜索
                    </button>
                </form>
            </Card>

            {/* 用户列表 */}
            <Card className="overflow-hidden">
                {loading ? (
                    <div className="p-10 text-center text-slate-400 dark:text-slate-500">加载中...</div>
                ) : users.length === 0 ? (
                    <div className="p-10 text-center text-slate-400 dark:text-slate-500">没有匹配的用户</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
                                    <th className="text-left p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">用户名</th>
                                    <th className="text-left p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">昵称</th>
                                    <th className="text-left p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">注册时间</th>
                                    <th className="text-left p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">状态</th>
                                    <th className="text-right p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                                {users.map((user) => {
                                    const banned = isBanned(user);
                                    return (
                                        <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                            <td className="p-4 font-medium text-slate-700 dark:text-slate-200">{user.username}</td>
                                            <td className="p-4 text-sm text-slate-600 dark:text-slate-300">{user.display_name || '-'}</td>
                                            <td className="p-4 text-sm text-slate-500 dark:text-slate-400">
                                                {user.created_at ? new Date(user.created_at).toLocaleString('zh-CN') : '-'}
                                            </td>
                                            <td className="p-4">
                                                {banned ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-full text-xs font-medium border border-red-200 dark:border-red-800">
                                                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                                                        已封禁
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 rounded-full text-xs font-medium border border-green-200 dark:border-green-800">
                                                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                                        正常
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4 text-right">
                                                <button
                                                    onClick={() => handleToggleBan(user)}
                                                    disabled={actingId === user.id}
                                                    title={banned ? '解封该用户' : '封禁该用户'}
                                                    className={`px-3 py-1.5 border rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${banned
                                                        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                                                        : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40'
                                                        }`}
                                                >
                                                    {banned ? '解封' : '封禁'}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* 分页 */}
                {!loading && totalPages > 1 && (
                    <div className="flex justify-center items-center gap-2 p-4 border-t border-slate-100 dark:border-slate-700">
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
            </Card>
        </div>
    );
};
