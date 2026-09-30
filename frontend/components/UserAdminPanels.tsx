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
    getAdminUsersStats,
    getPendingReviewArticles,
    reviewArticle,
    unbanUser,
    getAdmins,
    createAdmin,
    updateAdmin,
    resetAdminPassword,
    deleteAdmin,
} from '../api/users';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './Shared';
import { UserDetailDrawer } from './UserDetailDrawer';
import { errorText } from '../utils/errors';

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
            showToast(errorText(error, '获取待审核投稿失败'), 'error');
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
            showToast(errorText(error, '审核失败'), 'error');
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
            showToast(errorText(error, '驳回失败'), 'error');
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
 * 用户管理（2026-09-26 二期）：统计卡 + 筛选/排序 + 11 列表格 + 详情抽屉
 */
type ManagedUser = AdminUserItem & { status?: 'active' | 'banned' };

const isBanned = (user: ManagedUser) => user.is_active === false || user.status === 'banned';

const roleLabel = (role?: string) =>
    role === 'super_admin' ? '超级管理员' : role === 'admin' ? '管理员' : '普通用户';

const fmtDateTime = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

interface UsersStats {
    total: number;
    regular: number;
    admins: number;
    banned: number;
    today_new: number;
    pending_articles: number;
}

export const AdminUserPanel: React.FC = () => {
    const { showToast } = useToast();
    const { admin: me } = useAuth();
    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [stats, setStats] = useState<UsersStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [sort, setSort] = useState('created_at');
    const [order, setOrder] = useState<'asc' | 'desc'>('desc');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [actingId, setActingId] = useState<number | null>(null);
    const [detailId, setDetailId] = useState<number | null>(null);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const response = await getAdminUsers({
                search: search || undefined,
                status: statusFilter || undefined,
                sort,
                order,
                page,
                page_size: PAGE_SIZE,
            });
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
            showToast(errorText(error, '获取用户列表失败'), 'error');
            setUsers([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            setStats(await getAdminUsersStats());
        } catch {
            // 统计失败不打断列表
        }
    };

    useEffect(() => {
        fetchUsers();
    }, [page, search, statusFilter, sort, order]);

    useEffect(() => {
        fetchStats();
    }, []);

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
            fetchStats();
        } catch (error) {
            showToast(errorText(error, `${action}失败`), 'error');
        } finally {
            setActingId(null);
        }
    };

    const th = "text-left p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap";
    const thBtn = (key: string, label: string) => (
        <th className={`${th} cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200`}
            onClick={() => {
                if (sort === key) { setOrder(order === 'desc' ? 'asc' : 'desc'); }
                else { setSort(key); setOrder('desc'); }
                setPage(1);
            }}>
            {label}{sort === key ? (order === 'desc' ? ' ↓' : ' ↑') : ''}
        </th>
    );

    return (
        <div className="space-y-6">
            {/* 统计卡 */}
            {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {[
                        { label: '总用户', value: stats.total },
                        { label: '普通用户', value: stats.regular },
                        { label: '管理员', value: stats.admins },
                        { label: '已封禁', value: stats.banned },
                        { label: '24h 新增', value: stats.today_new },
                        { label: '待审投稿', value: stats.pending_articles },
                    ].map((c) => (
                        <Card key={c.label} className="p-4 text-center">
                            <div className="text-2xl font-black text-slate-800 dark:text-slate-100">{c.value}</div>
                            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{c.label}</div>
                        </Card>
                    ))}
                </div>
            )}

            {/* 搜索 + 筛选 */}
            <Card className="p-4">
                <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                        <input
                            type="text"
                            placeholder="搜索用户名 / 昵称 / 邮箱..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                        className="px-3 py-2 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                    >
                        <option value="">全部状态</option>
                        <option value="active">正常</option>
                        <option value="banned">已封禁</option>
                    </select>
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
                        <table className="w-full min-w-[920px]">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
                                    <th className={th}>ID</th>
                                    {thBtn('created_at', '用户名')}
                                    <th className={th}>昵称</th>
                                    <th className={th}>邮箱</th>
                                    <th className={th}>角色</th>
                                    {thBtn('article_count', '文章')}
                                    <th className={th}>评论</th>
                                    {thBtn('last_login_at', '最后登录')}
                                    <th className={th}>状态</th>
                                    <th className="text-right p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                                {users.map((user) => {
                                    const banned = isBanned(user);
                                    return (
                                        <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer" onClick={() => setDetailId(user.id)}>
                                            <td className="p-4 text-sm text-slate-400 dark:text-slate-500">{user.id}</td>
                                            <td className="p-4 font-medium text-slate-700 dark:text-slate-200">{user.username}</td>
                                            <td className="p-4 text-sm text-slate-600 dark:text-slate-300">
                                                <div className="max-w-[140px] truncate" title={user.display_name || user.username}>
                                                    {user.display_name || '-'}
                                                </div>
                                            </td>
                                            <td className="p-4 text-sm text-slate-500 dark:text-slate-400">
                                                {user.email || <span className="text-slate-300 dark:text-slate-600">未绑定</span>}
                                            </td>
                                            <td className="p-4 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">{roleLabel(user.role)}</td>
                                            <td className="p-4 text-sm text-slate-600 dark:text-slate-300">{(user as any).article_count ?? 0}</td>
                                            <td className="p-4 text-sm text-slate-600 dark:text-slate-300">{(user as any).comment_count ?? 0}</td>
                                            <td className="p-4 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtDateTime((user as any).last_login_at)}</td>
                                            <td className="p-4">
                                                {banned ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-full text-xs font-medium border border-red-200 dark:border-red-800 whitespace-nowrap">
                                                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                                                        已封禁
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 rounded-full text-xs font-medium border border-green-200 dark:border-green-800 whitespace-nowrap">
                                                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                                        正常
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex gap-2 justify-end">
                                                    <button
                                                        onClick={() => setDetailId(user.id)}
                                                        className="px-3 py-1.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-all whitespace-nowrap"
                                                    >
                                                        详情
                                                    </button>
                                                    {user.role !== 'super_admin' && (
                                                        <button
                                                            onClick={() => handleToggleBan(user)}
                                                            disabled={actingId === user.id}
                                                            title={banned ? '解封该用户' : '封禁该用户'}
                                                            className={`px-3 py-1.5 border rounded-lg text-sm font-medium transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${banned
                                                                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                                                                : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40'
                                                                }`}
                                                        >
                                                            {banned ? '解封' : '封禁'}
                                                        </button>
                                                    )}
                                                </div>
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

            {/* 详情抽屉 */}
            <UserDetailDrawer
                userId={detailId}
                onClose={() => setDetailId(null)}
                onChanged={() => { fetchUsers(); fetchStats(); }}
            />
        </div>
    );
};

/**
 * 管理员与权限（2026-09-26 二期，仅超管）：管理员列表 + 新增 / 停用 / 改密 / 删除
 */
export const AdminAccountsPanel: React.FC = () => {
    const { showToast } = useToast();
    const { admin: me } = useAuth();
    const [admins, setAdmins] = useState<AdminUserItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [actingId, setActingId] = useState<number | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [tempPassword, setTempPassword] = useState<string | null>(null);
    const [pwdTarget, setPwdTarget] = useState<AdminUserItem | null>(null);
    const [newPwd, setNewPwd] = useState('');
    const [form, setForm] = useState({ username: '', password: '', display_name: '', email: '', role: 'admin' as 'admin' | 'super_admin' });

    const isSuper = me?.role === 'super_admin';

    const fetchAdmins = async () => {
        setLoading(true);
        try {
            setAdmins(await getAdmins());
        } catch (error) {
            showToast(errorText(error, '获取管理员列表失败'), 'error');
            setAdmins([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAdmins();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!isSuper) {
        return (
            <Card className="p-10 text-center">
                <div className="text-slate-400 dark:text-slate-500">管理员账号管理仅超级管理员可用</div>
            </Card>
        );
    }

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const created = await createAdmin({
                username: form.username.trim(),
                password: form.password,
                display_name: form.display_name.trim() || undefined,
                email: form.email.trim() || undefined,
                role: form.role,
            });
            showToast(`管理员 ${created.username} 已创建`, 'success');
            setShowCreate(false);
            setForm({ username: '', password: '', display_name: '', email: '', role: 'admin' });
            fetchAdmins();
        } catch (error) {
            showToast(errorText(error, '创建失败'), 'error');
        }
    };

    const handleToggleActive = async (admin: AdminUserItem) => {
        const active = admin.is_active !== false;
        const action = active ? '停用' : '启用';
        if (!window.confirm(`确定要${action}管理员 ${admin.display_name || admin.username} 吗？${active ? '其所有登录会话将立即失效。' : ''}`)) return;
        setActingId(admin.id);
        try {
            await updateAdmin(admin.id, { is_active: !active });
            showToast(`${action}成功`, 'success');
            fetchAdmins();
        } catch (error) {
            showToast(errorText(error, `${action}失败`), 'error');
        } finally {
            setActingId(null);
        }
    };

    const handleResetPwd = async (admin: AdminUserItem) => {
        if (!newPwd || newPwd.length < 6) {
            showToast('新密码至少 6 位', 'error');
            return;
        }
        if (!window.confirm(`确定重置 ${admin.display_name || admin.username} 的密码吗？其所有登录会话将立即失效。`)) return;
        setActingId(admin.id);
        try {
            await resetAdminPassword(admin.id, { new_password: newPwd });
            setTempPassword(newPwd);
            setPwdTarget(null);
            setNewPwd('');
            fetchAdmins();
        } catch (error) {
            showToast(errorText(error, '重置失败'), 'error');
        } finally {
            setActingId(null);
        }
    };

    const handleDelete = async (admin: AdminUserItem) => {
        if (!window.confirm(`确定删除管理员 ${admin.display_name || admin.username} 吗？此操作不可逆。`)) return;
        setActingId(admin.id);
        try {
            await deleteAdmin(admin.id);
            showToast('已删除', 'success');
            fetchAdmins();
        } catch (error) {
            showToast(errorText(error, '删除失败'), 'error');
        } finally {
            setActingId(null);
        }
    };

    const th = "text-left p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap";

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <button
                    onClick={() => setShowCreate((v) => !v)}
                    className="px-5 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors text-sm font-medium shadow-md shadow-cyan-500/20"
                >
                    {showCreate ? '收起' : '+ 新增管理员'}
                </button>
            </div>

            {/* 新增表单 */}
            {showCreate && (
                <Card className="p-6">
                    <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">用户名 *</label>
                            <input type="text" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                                className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-cyan-500 outline-none" required minLength={3} maxLength={30} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">密码 *（≥6 位，创建后请转告）</label>
                            <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                                className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-cyan-500 outline-none font-mono" required minLength={6} maxLength={100} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">昵称（选填）</label>
                            <input type="text" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                                className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-cyan-500 outline-none" maxLength={50} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">邮箱（选填，用于找回密码）</label>
                            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                                className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-cyan-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">角色</label>
                            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'super_admin' })}
                                className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-cyan-500 outline-none">
                                <option value="admin">管理员</option>
                                <option value="super_admin">超级管理员</option>
                            </select>
                        </div>
                        <div className="flex items-end">
                            <button type="submit" className="w-full py-2.5 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors text-sm font-medium">
                                创建
                            </button>
                        </div>
                    </form>
                </Card>
            )}

            {/* 管理员列表 */}
            <Card className="overflow-hidden">
                {loading ? (
                    <div className="p-10 text-center text-slate-400 dark:text-slate-500">加载中...</div>
                ) : admins.length === 0 ? (
                    <div className="p-10 text-center text-slate-400 dark:text-slate-500">还没有管理员</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
                                    <th className={th}>ID</th>
                                    <th className={th}>用户名</th>
                                    <th className={th}>昵称</th>
                                    <th className={th}>邮箱</th>
                                    <th className={th}>角色</th>
                                    <th className={th}>注册时间</th>
                                    <th className={th}>状态</th>
                                    <th className="text-right p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                                {admins.map((admin) => {
                                    const active = admin.is_active !== false;
                                    const isSelf = admin.id === me?.id;
                                    return (
                                        <tr key={admin.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                            <td className="p-4 text-sm text-slate-400 dark:text-slate-500">{admin.id}</td>
                                            <td className="p-4 font-medium text-slate-700 dark:text-slate-200">
                                                {admin.username}{isSelf && <span className="ml-2 text-xs text-cyan-600 dark:text-cyan-400">(我)</span>}
                                            </td>
                                            <td className="p-4 text-sm text-slate-600 dark:text-slate-300">{admin.display_name || '-'}</td>
                                            <td className="p-4 text-sm text-slate-500 dark:text-slate-400">{admin.email || <span className="text-slate-300 dark:text-slate-600">未绑定</span>}</td>
                                            <td className="p-4 text-sm text-slate-600 dark:text-slate-300">{roleLabel(admin.role)}</td>
                                            <td className="p-4 text-sm text-slate-500 dark:text-slate-400">{fmtDateTime(admin.created_at)}</td>
                                            <td className="p-4">
                                                {active ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 rounded-full text-xs font-medium border border-green-200 dark:border-green-800">
                                                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                                        启用
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-full text-xs font-medium border border-red-200 dark:border-red-800">
                                                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                                                        停用
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex gap-2 justify-end">
                                                    {!isSelf && admin.role !== 'super_admin' && (
                                                        <button
                                                            onClick={() => { setPwdTarget(admin); setNewPwd(''); }}
                                                            className="px-3 py-1.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
                                                        >
                                                            改密
                                                        </button>
                                                    )}
                                                    {!isSelf && (
                                                        <button
                                                            onClick={() => handleToggleActive(admin)}
                                                            disabled={actingId === admin.id}
                                                            className={`px-3 py-1.5 border rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${active
                                                                ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40'
                                                                : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                                                                }`}
                                                        >
                                                            {active ? '停用' : '启用'}
                                                        </button>
                                                    )}
                                                    {!isSelf && admin.role !== 'super_admin' && (
                                                        <button
                                                            onClick={() => handleDelete(admin)}
                                                            disabled={actingId === admin.id}
                                                            className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                                                        >
                                                            删除
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* 改密弹层 */}
            {pwdTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setPwdTarget(null)} />
                    <div className="relative bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
                        <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-1">重置密码</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                            为 {pwdTarget.display_name || pwdTarget.username} 设置新密码（≥6 位），其所有登录会话将立即失效。
                        </p>
                        <input
                            type="text"
                            value={newPwd}
                            onChange={(e) => setNewPwd(e.target.value)}
                            placeholder="新密码"
                            className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-cyan-500 outline-none font-mono mb-4"
                        />
                        <div className="flex gap-2 justify-end">
                            <Button variant="outline" onClick={() => setPwdTarget(null)}>取消</Button>
                            <Button onClick={() => handleResetPwd(pwdTarget)} disabled={actingId === pwdTarget.id}>
                                {actingId === pwdTarget.id ? '重置中...' : '确定重置'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* 创建后的临时密码提示 */}
            {tempPassword && (
                <div className="fixed inset-0 z-60 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setTempPassword(null)} />
                    <div className="relative bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
                        <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-2">密码已重置（只显示这一次）</h4>
                        <div className="font-mono text-2xl font-bold text-cyan-600 dark:text-cyan-400 bg-slate-50 dark:bg-slate-900 rounded-lg px-4 py-3 mb-3 tracking-wider select-all">
                            {tempPassword}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">请立即转告该管理员，关闭后无法再次查看。</p>
                        <div className="flex gap-2 justify-end">
                            <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(tempPassword); showToast('已复制', 'success'); }}>复制</Button>
                            <Button onClick={() => setTempPassword(null)}>我已保存</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
