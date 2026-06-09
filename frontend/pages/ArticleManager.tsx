/**
 * 文章管理页面
 * 支持排序切换（时间/浏览量）和发布时间编辑
 */
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getArticles, deleteArticle, publishArticle, updateArticlePublishedAt, ArticleListItem } from '../api/articles';
import api from '../api/config';

const ArticleManager: React.FC = () => {
    const [articles, setArticles] = useState<ArticleListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
    const [sortBy, setSortBy] = useState<'time' | 'views'>('time');
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

    // 发布时间编辑状态
    const [editingTimeId, setEditingTimeId] = useState<number | null>(null);
    const [editingTimeValue, setEditingTimeValue] = useState('');
    const [savingTime, setSavingTime] = useState(false);

    // 浏览量/点赞量编辑状态
    const [editingStatsId, setEditingStatsId] = useState<number | null>(null);
    const [editingViews, setEditingViews] = useState('');
    const [editingLikes, setEditingLikes] = useState('');
    const [savingStats, setSavingStats] = useState(false);

    const fetchArticles = async () => {
        setLoading(true);
        try {
            const params: any = { page, page_size: 10, sort_by: sortBy, sort_order: sortOrder };
            if (filter !== 'all') {
                params.status = filter;
            }
            const response = await getArticles(params);
            setArticles(response.data || []);
            setTotalPages(response.total_pages || 1);
        } catch (error) {
            console.error('获取文章列表失败:', error);
            setArticles([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchArticles();
    }, [page, filter, sortBy, sortOrder]);

    const handleDelete = async (id: number, title: string) => {
        if (window.confirm(`确定要删除文章 "${title}" 吗？`)) {
            try {
                await deleteArticle(id);
                fetchArticles();
            } catch (error) {
                console.error('删除文章失败:', error);
            }
        }
    };

    const handlePublish = async (id: number, title: string) => {
        if (window.confirm(`确定要发布文章 "${title}" 吗？`)) {
            try {
                await publishArticle(id);
                fetchArticles();
            } catch (error: any) {
                alert(error.response?.data?.detail || '发布失败');
            }
        }
    };

    /**
     * 开始编辑发布时间
     * 将 ISO 时间字符串转为 datetime-local 输入框所需的格式
     */
    const handleStartEditTime = (article: ArticleListItem) => {
        setEditingTimeId(article.id);
        if (article.published_at) {
            // 转为本地时间格式 YYYY-MM-DDTHH:mm
            const date = new Date(article.published_at);
            const localIso = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
                .toISOString()
                .slice(0, 16);
            setEditingTimeValue(localIso);
        } else {
            // 默认当前时间
            const now = new Date();
            const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
                .toISOString()
                .slice(0, 16);
            setEditingTimeValue(localIso);
        }
    };

    /** 保存修改后的发布时间 */
    const handleSaveTime = async () => {
        if (!editingTimeId || !editingTimeValue) return;
        setSavingTime(true);
        try {
            const isoTime = new Date(editingTimeValue).toISOString();
            await updateArticlePublishedAt(editingTimeId, isoTime);
            setEditingTimeId(null);
            setEditingTimeValue('');
            fetchArticles();
        } catch (error: any) {
            alert(error.response?.data?.detail || '修改发布时间失败');
        } finally {
            setSavingTime(false);
        }
    };

    /** 开始编辑浏览量/点赞量 */
    const handleStartEditStats = (article: ArticleListItem) => {
        setEditingStatsId(article.id);
        setEditingViews(String(article.view_count));
        setEditingLikes(String(article.like_count));
    };

    /** 保存浏览量/点赞量 */
    const handleSaveStats = async () => {
        if (!editingStatsId) return;
        setSavingStats(true);
        try {
            await api.put(`/articles/${editingStatsId}`, {
                view_count: parseInt(editingViews) || 0,
                like_count: parseInt(editingLikes) || 0,
            });
            setEditingStatsId(null);
            fetchArticles();
        } catch (error: any) {
            alert(error.response?.data?.detail || '修改失败');
        } finally {
            setSavingStats(false);
        }
    };

    /** 下架文章（转为草稿） */
    const handleUnpublish = async (id: number, title: string) => {
        if (window.confirm(`确定要下架文章 "${title}" 吗？文章将转为草稿状态。`)) {
            try {
                await api.put(`/articles/${id}`, { status: 'draft' });
                fetchArticles();
            } catch (error: any) {
                alert(error.response?.data?.detail || '下架失败');
            }
        }
    };

    const getStatusBadge = (status: string) => {
        const styles = {
            published: 'bg-green-50 text-green-600 border-green-200',
            draft: 'bg-yellow-50 text-yellow-600 border-yellow-200',
            scheduled: 'bg-blue-50 text-blue-600 border-blue-200',
        };
        const labels = {
            published: '已发布',
            draft: '草稿',
            scheduled: '定时发布',
        };
        return (
            <span className={`px-2 py-1 text-xs rounded-full border ${styles[status as keyof typeof styles] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                {labels[status as keyof typeof labels] || status}
            </span>
        );
    };

    /** 格式化发布时间显示 */
    const formatPublishedAt = (dateStr?: string) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hour = String(d.getHours()).padStart(2, '0');
        const minute = String(d.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hour}:${minute}`;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">文章管理</h1>
                <Link
                    to="/admin/posts/new"
                    className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-lg hover:from-cyan-600 hover:to-purple-700 transition-all shadow-sm"
                >
                    + 新建文章
                </Link>
            </div>

            {/* Filters + Sort */}
            <div className="flex justify-between items-center flex-wrap gap-3">
                {/* 状态过滤 */}
                <div className="flex gap-2">
                    {(['all', 'published', 'draft'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => { setFilter(f); setPage(1); }}
                            className={`px-4 py-2 rounded-lg text-sm transition-all ${filter === f
                                ? 'bg-cyan-500 text-white shadow-sm'
                                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                                }`}
                        >
                            {f === 'all' ? '全部' : f === 'published' ? '已发布' : '草稿'}
                        </button>
                    ))}
                </div>

                {/* 排序选择 */}
                <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500 dark:text-slate-400">排序：</span>
                    <button
                        onClick={() => {
                            if (sortBy === 'time') {
                                setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
                            } else {
                                setSortBy('time');
                                setSortOrder('desc');
                            }
                            setPage(1);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-all flex items-center gap-1 ${sortBy === 'time'
                            ? 'bg-purple-500 text-white shadow-sm'
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                            }`}
                    >
                        {sortBy === 'time' && (sortOrder === 'asc' ? '↑' : '↓')} 时间
                    </button>
                    <button
                        onClick={() => {
                            if (sortBy === 'views') {
                                setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
                            } else {
                                setSortBy('views');
                                setSortOrder('desc');
                            }
                            setPage(1);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-all flex items-center gap-1 ${sortBy === 'views'
                            ? 'bg-purple-500 text-white shadow-sm'
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                            }`}
                    >
                        {sortBy === 'views' && (sortOrder === 'asc' ? '↑' : '↓')} 浏览量
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                {loading ? (
                    <div className="p-10 text-center text-slate-500 dark:text-slate-400">加载中...</div>
                ) : articles.length === 0 ? (
                    <div className="p-10 text-center text-slate-500 dark:text-slate-400">暂无文章</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                                <tr>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">标题</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">分类/标签</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">状态</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">浏览</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">点赞</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">发布时间</th>
                                    <th className="px-3 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                {articles.map((article) => (
                                    <tr key={article.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                        <td className="px-3 py-3">
                                            <div className="flex items-center gap-2">
                                                {article.is_pinned && (
                                                    <span className="text-yellow-500" title="置顶">📌</span>
                                                )}
                                                <span className="text-slate-800 dark:text-slate-200 font-medium max-w-[180px] truncate block text-sm" title={article.title}>{article.title}</span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-slate-600 dark:text-slate-300 text-sm">{article.category || '-'}</span>
                                                {article.tags && article.tags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1">
                                                        {article.tags.slice(0, 3).map(tag => (
                                                            <span key={tag.id} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-xs rounded-full">
                                                                {tag.name}
                                                            </span>
                                                        ))}
                                                        {article.tags.length > 3 && (
                                                            <span className="text-xs text-slate-400 dark:text-slate-500">+{article.tags.length - 3}</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap">{getStatusBadge(article.status)}</td>
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            {editingStatsId === article.id ? (
                                                <input
                                                    type="number"
                                                    value={editingViews}
                                                    onChange={(e) => setEditingViews(e.target.value)}
                                                    className="w-20 px-2 py-1 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                                                    min="0"
                                                />
                                            ) : (
                                                <button
                                                    onClick={() => handleStartEditStats(article)}
                                                    className="text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:underline cursor-pointer text-sm transition-colors"
                                                    title="点击编辑浏览量和点赞量"
                                                >
                                                    {article.view_count}
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            {editingStatsId === article.id ? (
                                                <div className="flex items-center gap-1.5">
                                                    <input
                                                        type="number"
                                                        value={editingLikes}
                                                        onChange={(e) => setEditingLikes(e.target.value)}
                                                        className="w-20 px-2 py-1 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                                                        min="0"
                                                    />
                                                    <button
                                                        onClick={handleSaveStats}
                                                        disabled={savingStats}
                                                        className="px-2 py-1 text-xs text-white bg-green-500 hover:bg-green-600 rounded disabled:opacity-50 transition-colors"
                                                    >
                                                        {savingStats ? '...' : '✓'}
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingStatsId(null)}
                                                        className="px-2 py-1 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-slate-600 dark:text-slate-400 text-sm cursor-pointer hover:text-cyan-600 dark:hover:text-cyan-400 hover:underline transition-colors" onClick={() => handleStartEditStats(article)} title="点击编辑浏览量和点赞量">{article.like_count}</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            {editingTimeId === article.id ? (
                                                /* 编辑发布时间模式 */
                                                <div className="flex items-center gap-1.5">
                                                    <input
                                                        type="datetime-local"
                                                        value={editingTimeValue}
                                                        onChange={(e) => setEditingTimeValue(e.target.value)}
                                                        className="px-2 py-1 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                                                    />
                                                    <button
                                                        onClick={handleSaveTime}
                                                        disabled={savingTime}
                                                        className="px-2 py-1 text-xs text-white bg-green-500 hover:bg-green-600 rounded disabled:opacity-50 transition-colors"
                                                    >
                                                        {savingTime ? '...' : '✓'}
                                                    </button>
                                                    <button
                                                        onClick={() => { setEditingTimeId(null); setEditingTimeValue(''); }}
                                                        className="px-2 py-1 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ) : (
                                                /* 显示发布时间，点击可编辑 */
                                                <button
                                                    onClick={() => handleStartEditTime(article)}
                                                    className="text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:underline cursor-pointer text-sm transition-colors"
                                                    title="点击编辑发布时间"
                                                >
                                                    {formatPublishedAt(article.published_at)}
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 text-right whitespace-nowrap">
                                            <div className="flex justify-end gap-2">
                                                {article.status === 'draft' && (
                                                    <button
                                                        onClick={() => handlePublish(article.id, article.title)}
                                                        className="px-2 py-1 text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 rounded flex items-center justify-center transition-colors border border-green-100 dark:border-green-800/50"
                                                    >
                                                        发布
                                                    </button>
                                                )}
                                                {article.status === 'published' && (
                                                    <button
                                                        onClick={() => handleUnpublish(article.id, article.title)}
                                                        className="px-2 py-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded flex items-center justify-center transition-colors border border-amber-100 dark:border-amber-800/50"
                                                    >
                                                        下架
                                                    </button>
                                                )}
                                                <Link
                                                    to={`/articles/${article.id}`}
                                                    target="_blank"
                                                    className="px-2 py-1 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded flex items-center justify-center transition-colors border border-purple-100 dark:border-purple-800/50"
                                                >
                                                    预览
                                                </Link>
                                                <Link
                                                    to={`/admin/posts/${article.id}/edit`}
                                                    className="px-2 py-1 text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 bg-cyan-50 dark:bg-cyan-900/20 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 rounded flex items-center justify-center transition-colors border border-cyan-100 dark:border-cyan-800/50"
                                                >
                                                    编辑
                                                </Link>
                                                <button
                                                    onClick={() => handleDelete(article.id, article.title)}
                                                    className="px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded flex items-center justify-center transition-colors border border-red-100 dark:border-red-800/50"
                                                >
                                                    删除
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-center gap-2">
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:bg-slate-50 dark:disabled:bg-slate-900 transition-colors"
                    >
                        上一页
                    </button>
                    <span className="px-4 py-2 text-slate-500 dark:text-slate-400 font-medium">
                        {page} / {totalPages}
                    </span>
                    <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:bg-slate-50 dark:disabled:bg-slate-900 transition-colors"
                    >
                        下一页
                    </button>
                </div>
            )}
        </div>
    );
};



export default ArticleManager;
