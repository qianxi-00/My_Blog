/**
 * 用户中心页面（需登录）
 * 三个区块：我的资料 / 修改密码 / 我的文章（草稿/待审核/已发布/已驳回）
 */
import React, { useState, useEffect } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { Button } from '../components/Shared';
import Avatar from '../components/Avatar';
import { useAuth } from '../contexts/AuthContext';
import {
    ProfileUpdate,
    UserArticle,
    UserArticleStatus,
    getMyArticles,
    submitMyArticle,
    deleteMyArticle,
    updateCurrentUser,
    updateCurrentUserPassword,
} from '../api/users';

type ArticleTab = 'all' | UserArticleStatus;

// 状态徽章配置
const STATUS_BADGES: Record<UserArticleStatus, { label: string; className: string }> = {
    draft: { label: '草稿', className: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600' },
    pending_review: { label: '待审核', className: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800' },
    published: { label: '已发布', className: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' },
    rejected: { label: '已驳回', className: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800' },
};

const ARTICLE_TABS: { key: ArticleTab; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'draft', label: '草稿' },
    { key: 'pending_review', label: '待审核' },
    { key: 'published', label: '已发布' },
    { key: 'rejected', label: '已驳回' },
];

const UserCenter: React.FC = () => {
    const { user, isAuthenticated, isLoading, refreshAdmin } = useAuth();
    const navigate = useNavigate();

    // 登录守卫
    if (isLoading) {
        return (
            <div className="max-w-5xl mx-auto px-4 py-20 text-center text-slate-400 dark:text-slate-500">
                <div className="animate-pulse">加载中...</div>
            </div>
        );
    }
    if (!isAuthenticated || !user) {
        return <Navigate to="/login" replace />;
    }

    // 401/403 时跳登录页
    const handleAuthError = (error: any): boolean => {
        const status = error?.response?.status;
        if (status === 401 || status === 403) {
            navigate('/login', { replace: true });
            return true;
        }
        return false;
    };

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
            {/* 头部欢迎区 */}
            <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
                <Avatar name={user.display_name || user.username} avatarUrl={user.avatar_url} className="w-16 h-16 text-2xl" />
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{user.display_name || user.username}</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        @{user.username}
                        {user.role === 'user' && <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 border border-cyan-100 dark:border-cyan-800">用户</span>}
                        {(user.role === 'admin' || user.role === 'super_admin') && <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300">管理员</span>}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* 我的资料 */}
                <ProfileSection user={user} onAuthError={handleAuthError} onSaved={refreshAdmin} />

                {/* 修改密码 */}
                <PasswordSection onAuthError={handleAuthError} />
            </div>

            {/* 我的文章 */}
            <ArticleSection onAuthError={handleAuthError} />
        </div>
    );
};

// ===== 我的资料 =====
const ProfileSection: React.FC<{
    user: { username: string; display_name?: string; email?: string; bio?: string; avatar_url?: string };
    onAuthError: (error: any) => boolean;
    onSaved: () => Promise<void>;
}> = ({ user, onAuthError, onSaved }) => {
    const [profileData, setProfileData] = useState<ProfileUpdate>({});
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState({ type: '', text: '' });

    useEffect(() => {
        setProfileData({
            display_name: user.display_name,
            email: user.email,
            bio: user.bio,
        });
    }, [user]);

    const handleProfileUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMsg({ type: '', text: '' });
        try {
            await updateCurrentUser(profileData);
            await onSaved();
            setMsg({ type: 'success', text: '个人资料已更新' });
        } catch (error: any) {
            if (!onAuthError(error)) {
                setMsg({ type: 'error', text: error.response?.data?.detail || '更新失败' });
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-700 pb-4">我的资料</h2>

            {msg.text && (
                <div className={`p-4 rounded-lg flex items-center justify-between ${msg.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
                    <span>{msg.text}</span>
                    <button onClick={() => setMsg({ type: '', text: '' })} className="hover:opacity-75">✕</button>
                </div>
            )}

            <form onSubmit={handleProfileUpdate} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">昵称</label>
                        <input
                            type="text"
                            value={profileData.display_name || ''}
                            onChange={(e) => setProfileData({ ...profileData, display_name: e.target.value })}
                            className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all dark:text-slate-100"
                            placeholder="对外展示的昵称"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">邮箱</label>
                        <input
                            type="email"
                            value={profileData.email || ''}
                            onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                            className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all dark:text-slate-100"
                            placeholder="example@email.com"
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">个人简介</label>
                    <textarea
                        rows={4}
                        value={profileData.bio || ''}
                        onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all resize-none dark:text-slate-100"
                        placeholder="写一句简短的自我介绍..."
                    />
                </div>
                <div className="flex justify-end pt-2">
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-lg hover:shadow-lg hover:opacity-90 transition-all shadow-sm disabled:opacity-50 font-medium"
                    >
                        {loading ? '保存中...' : '保存'}
                    </button>
                </div>
            </form>
        </div>
    );
};

// ===== 修改密码 =====
const PasswordSection: React.FC<{ onAuthError: (error: any) => boolean }> = ({ onAuthError }) => {
    const [passwordData, setPasswordData] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState({ type: '', text: '' });

    const handlePasswordUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setMsg({ type: '', text: '' });
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setMsg({ type: 'error', text: '两次输入的密码不一致' });
            return;
        }
        setLoading(true);
        try {
            await updateCurrentUserPassword({
                old_password: passwordData.oldPassword,
                new_password: passwordData.newPassword,
            });
            setMsg({ type: 'success', text: '密码已修改' });
            setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
        } catch (error: any) {
            if (!onAuthError(error)) {
                setMsg({ type: 'error', text: error.response?.data?.detail || '修改失败' });
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6 h-fit">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-700 pb-4">修改密码</h2>

            {msg.text && (
                <div className={`p-4 rounded-lg flex items-center justify-between ${msg.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
                    <span>{msg.text}</span>
                    <button onClick={() => setMsg({ type: '', text: '' })} className="hover:opacity-75">✕</button>
                </div>
            )}

            <form onSubmit={handlePasswordUpdate} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">当前密码</label>
                    <input
                        type="password"
                        required
                        value={passwordData.oldPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, oldPassword: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none dark:text-slate-100"
                        placeholder="验证当前密码"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">新密码</label>
                    <input
                        type="password"
                        required
                        minLength={6}
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none dark:text-slate-100"
                        placeholder="至少 6 位字符"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">确认新密码</label>
                    <input
                        type="password"
                        required
                        minLength={6}
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none dark:text-slate-100"
                        placeholder="再次输入新密码"
                    />
                </div>
                <button
                    type="submit"
                    disabled={loading}
                    className="w-full px-6 py-2.5 bg-slate-800 dark:bg-slate-600 text-white rounded-lg hover:bg-slate-700 dark:hover:bg-slate-500 transition-colors disabled:opacity-50 font-medium"
                >
                    {loading ? '提交中...' : '修改密码'}
                </button>
            </form>
        </div>
    );
};

// ===== 我的文章 =====
const ArticleSection: React.FC<{ onAuthError: (error: any) => boolean }> = ({ onAuthError }) => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<ArticleTab>('all');
    const [articles, setArticles] = useState<UserArticle[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [actingId, setActingId] = useState<number | null>(null);

    const fetchArticles = async () => {
        setLoading(true);
        try {
            const response = await getMyArticles({
                status: activeTab === 'all' ? undefined : activeTab,
                page,
                page_size: 10,
            });
            // 兼容直接返回数组或分页结构
            const data = Array.isArray(response) ? response : (response.data || []);
            setArticles(data);
            setTotalPages(Array.isArray(response) ? 1 : (response.total_pages || 1));
        } catch (error: any) {
            if (!onAuthError(error)) {
                console.error('获取我的文章失败:', error);
                setArticles([]);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchArticles();
    }, [page, activeTab]);

    const handleTabChange = (tab: ArticleTab) => {
        setActiveTab(tab);
        setPage(1);
    };

    const handleSubmitReview = async (id: number) => {
        setActingId(id);
        try {
            await submitMyArticle(id);
            await fetchArticles();
        } catch (error: any) {
            if (!onAuthError(error)) {
                alert(error.response?.data?.detail || '提交审核失败');
            }
        } finally {
            setActingId(null);
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('确定要删除这篇文章吗？')) return;
        setActingId(id);
        try {
            await deleteMyArticle(id);
            await fetchArticles();
        } catch (error: any) {
            if (!onAuthError(error)) {
                alert(error.response?.data?.detail || '删除失败');
            }
        } finally {
            setActingId(null);
        }
    };

    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 sm:p-8">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">我的文章</h2>
                <Link to="/write">
                    <Button size="sm">
                        <Icons.FileText className="w-4 h-4 mr-1" /> 写新文章
                    </Button>
                </Link>
            </div>

            {/* 状态 Tabs */}
            <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700 mb-6">
                {ARTICLE_TABS.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => handleTabChange(tab.key)}
                        className={`px-4 py-2 font-medium transition-all border-b-2 -mb-[2px] ${activeTab === tab.key
                            ? 'text-cyan-600 dark:text-cyan-400 border-cyan-600 dark:border-cyan-400'
                            : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* 文章列表 */}
            {loading ? (
                <div className="py-10 text-center text-slate-400 dark:text-slate-500">加载中...</div>
            ) : articles.length === 0 ? (
                <div className="text-center text-slate-400 dark:text-slate-500 py-12 bg-slate-50/50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                    <div className="text-4xl mb-3 opacity-50">📝</div>
                    <p>还没有相关文章，点击「写新文章」开始创作吧</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {articles.map((article) => {
                        const badge = STATUS_BADGES[article.status] || STATUS_BADGES.draft;
                        const editable = article.status === 'draft' || article.status === 'rejected';
                        return (
                            <div key={article.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm transition-colors">
                                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${badge.className}`}>{badge.label}</span>
                                            {article.category && (
                                                <span className="text-xs text-slate-500 dark:text-slate-400">{article.category}</span>
                                            )}
                                            <span className="text-xs text-slate-400 dark:text-slate-500">
                                                {new Date(article.created_at).toLocaleDateString('zh-CN')}
                                            </span>
                                        </div>
                                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1 line-clamp-1">{article.title}</h3>
                                        {article.summary && (
                                            <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-2">{article.summary}</p>
                                        )}
                                        {article.status === 'rejected' && article.review_note && (
                                            <div className="text-sm bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30 rounded-lg px-3 py-2">
                                                驳回原因：{article.review_note}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        {article.status === 'published' && (
                                            <Link to={`/articles/${article.id}`}>
                                                <Button size="sm" variant="outline">查看</Button>
                                            </Link>
                                        )}
                                        {editable && (
                                            <>
                                                <Link to={`/write?article_id=${article.id}`}>
                                                    <Button size="sm" variant="outline">编辑</Button>
                                                </Link>
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    disabled={actingId === article.id}
                                                    onClick={() => handleSubmitReview(article.id)}
                                                >
                                                    {actingId === article.id ? '提交中...' : '提交审核'}
                                                </Button>
                                            </>
                                        )}
                                        {article.status !== 'published' && (
                                            <button
                                                onClick={() => handleDelete(article.id)}
                                                disabled={actingId === article.id}
                                                className="h-8 px-3 text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-all disabled:opacity-50"
                                            >
                                                删除
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-6">
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
        </div>
    );
};

export default UserCenter;
