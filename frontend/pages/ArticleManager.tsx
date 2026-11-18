/**
 * 文章管理页面
 * 支持排序切换（时间/浏览量）和发布时间、数据内联编辑
 */
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  getArticles,
  deleteArticle,
  publishArticle,
  updateArticlePublishedAt,
  ArticleListItem,
} from '../api/articles';
import api from '../api/config';
import { errorText } from '../utils/errors';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { Icons } from '../components/Icons';
import { Badge, Button, Card, EmptyState, StatusPill } from '../components/Shared';
import { ListSkeleton } from '../components/Skeleton';
import { TH, TD } from '../constants';

const STATUS_META: Record<
  string,
  { label: string; tone: 'emerald' | 'amber' | 'blue' | 'slate' }
> = {
  published: { label: '已发布', tone: 'emerald' },
  draft: { label: '草稿', tone: 'amber' },
  scheduled: { label: '定时发布', tone: 'blue' },
};

const ArticleManager: React.FC = () => {
  const { confirm, confirmDialog } = useConfirm();
  const { showToast } = useToast();
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
      const params: Record<string, unknown> = {
        page,
        page_size: 10,
        sort_by: sortBy,
        sort_order: sortOrder,
      };
      if (filter !== 'all') {
        params.status = filter;
      }
      const response = await getArticles(params);
      setArticles(response.data || []);
      setTotalPages(response.total_pages || 1);
    } catch (error) {
      console.error('获取文章列表失败:', error);
      showToast(errorText(error, '获取文章列表失败'), 'error');
      setArticles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArticles();
  }, [page, filter, sortBy, sortOrder]);

  const handleDelete = async (id: number, title: string) => {
    const ok = await confirm({
      title: '删除文章',
      message: `确定要删除文章 "${title}" 吗？删除后不可恢复。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteArticle(id);
      showToast('文章已删除', 'success');
      fetchArticles();
    } catch (error) {
      console.error('删除文章失败:', error);
      showToast(errorText(error, '删除文章失败'), 'error');
    }
  };

  // 发布为可逆操作：不弹确认，执行后 toast
  const handlePublish = async (id: number, title: string) => {
    try {
      await publishArticle(id);
      showToast(`文章 "${title}" 已发布`, 'success');
      fetchArticles();
    } catch (error: any) {
      showToast(errorText(error, '发布失败'), 'error');
    }
  };

  /**
   * 开始编辑发布时间
   * 将 ISO 时间字符串转为 datetime-local 输入框所需的格式
   */
  const handleStartEditTime = (article: ArticleListItem) => {
    setEditingTimeId(article.id);
    const date = article.published_at ? new Date(article.published_at) : new Date();
    const localIso = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setEditingTimeValue(localIso);
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
      showToast('发布时间已更新', 'success');
      fetchArticles();
    } catch (error: any) {
      showToast(errorText(error, '修改发布时间失败'), 'error');
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
        view_count: parseInt(editingViews, 10) || 0,
        like_count: parseInt(editingLikes, 10) || 0,
      });
      setEditingStatsId(null);
      showToast('数据统计已更新', 'success');
      fetchArticles();
    } catch (error: any) {
      showToast(errorText(error, '修改失败'), 'error');
    } finally {
      setSavingStats(false);
    }
  };

  /** 下架文章（转为草稿）——可逆操作：不弹确认，执行后 toast */
  const handleUnpublish = async (id: number, title: string) => {
    try {
      await api.put(`/articles/${id}`, { status: 'draft' });
      showToast(`文章 "${title}" 已下架为草稿`, 'success');
      fetchArticles();
    } catch (error: any) {
      showToast(errorText(error, '下架失败'), 'error');
    }
  };

  /** 格式化发布时间显示 */
  const formatPublishedAt = (dateStr?: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  };

  const toggleSort = (field: 'time' | 'views') => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
            文章管理
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            管理站内技术文章、发布状态与阅读数据
          </p>
        </div>
        <Link to="/admin/posts/new">
          <Button size="sm">
            <Icons.Plus className="w-3.5 h-3.5" />
            新建文章
          </Button>
        </Link>
      </div>

      {/* Filters + Sort */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-0.5">
          {(['all', 'published', 'draft'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFilter(f);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {f === 'all' ? '全部' : f === 'published' ? '已发布' : '草稿'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">排序：</span>
          <div className="inline-flex rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-0.5">
            {([
              { key: 'time', label: '发布时间' },
              { key: 'views', label: '浏览量' },
            ] as const).map((opt) => {
              const active = sortBy === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => toggleSort(opt.key)}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    active
                      ? 'bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                  {active && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-4">
            <ListSkeleton rows={4} />
          </div>
        ) : articles.length === 0 ? (
          <EmptyState
            icon={<Icons.FileText className="w-5 h-5" />}
            title="暂无文章"
            description="当前筛选条件下还没有文章记录。"
            action={
              <Link to="/admin/posts/new">
                <Button size="sm">
                  <Icons.Plus className="w-3.5 h-3.5" />
                  撰写第一篇文章
                </Button>
              </Link>
            }
            className="border-0"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/80 dark:bg-slate-950/50 border-b border-slate-200/80 dark:border-slate-800">
                <tr>
                  <th className={TH}>标题</th>
                  <th className={TH}>分类 / 标签</th>
                  <th className={TH}>状态</th>
                  <th className={TH}>浏览</th>
                  <th className={TH}>点赞</th>
                  <th className={TH}>发布时间</th>
                  <th className={`${TH} text-right`}>操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                {articles.map((article) => {
                  const statusMeta = STATUS_META[article.status] || {
                    label: article.status,
                    tone: 'slate' as const,
                  };
                  return (
                    <tr
                      key={article.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className={TD}>
                        <div className="flex items-center gap-2">
                          {article.is_pinned && (
                            <span title="置顶" className="shrink-0 text-amber-500">
                              <Icons.Pin className="w-3.5 h-3.5" />
                            </span>
                          )}
                          <span
                            className="text-slate-900 dark:text-slate-100 font-medium max-w-[220px] truncate block text-sm"
                            title={article.title}
                          >
                            {article.title}
                          </span>
                        </div>
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <div className="flex flex-col gap-1">
                          <span className="text-slate-600 dark:text-slate-300 text-xs font-medium">
                            {article.category || '未分类'}
                          </span>
                          {article.tags && article.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {article.tags.slice(0, 3).map((tag) => (
                                <Badge key={tag.id} color="slate" className="text-[11px]">
                                  {tag.name}
                                </Badge>
                              ))}
                              {article.tags.length > 3 && (
                                <span className="text-[11px] text-slate-400 dark:text-slate-500 self-center">
                                  +{article.tags.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <StatusPill tone={statusMeta.tone} dot>
                          {statusMeta.label}
                        </StatusPill>
                      </td>
                      <td className={`${TD} whitespace-nowrap tabular-nums`}>
                        {editingStatsId === article.id ? (
                          <input
                            type="number"
                            value={editingViews}
                            onChange={(e) => setEditingViews(e.target.value)}
                            className="w-20 px-2 py-1 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 focus:outline-none"
                            min="0"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStartEditStats(article)}
                            className="text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 hover:underline cursor-pointer text-xs transition-colors"
                            title="点击编辑浏览量和点赞量"
                          >
                            {article.view_count}
                          </button>
                        )}
                      </td>
                      <td className={`${TD} whitespace-nowrap tabular-nums`}>
                        {editingStatsId === article.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={editingLikes}
                              onChange={(e) => setEditingLikes(e.target.value)}
                              className="w-20 px-2 py-1 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 focus:outline-none"
                              min="0"
                            />
                            <button
                              type="button"
                              onClick={handleSaveStats}
                              disabled={savingStats}
                              aria-label="保存统计"
                              className="p-1 text-white bg-emerald-600 hover:bg-emerald-700 rounded-md disabled:opacity-50 transition-colors"
                            >
                              <Icons.Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingStatsId(null)}
                              aria-label="取消编辑统计"
                              className="p-1 text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors"
                            >
                              <Icons.X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStartEditStats(article)}
                            className="text-slate-600 dark:text-slate-300 text-xs cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 hover:underline transition-colors"
                            title="点击编辑浏览量和点赞量"
                          >
                            {article.like_count}
                          </button>
                        )}
                      </td>
                      <td className={`${TD} whitespace-nowrap tabular-nums`}>
                        {editingTimeId === article.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="datetime-local"
                              value={editingTimeValue}
                              onChange={(e) => setEditingTimeValue(e.target.value)}
                              className="px-2 py-1 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={handleSaveTime}
                              disabled={savingTime}
                              aria-label="保存发布时间"
                              className="p-1 text-white bg-emerald-600 hover:bg-emerald-700 rounded-md disabled:opacity-50 transition-colors"
                            >
                              <Icons.Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTimeId(null);
                                setEditingTimeValue('');
                              }}
                              aria-label="取消编辑时间"
                              className="p-1 text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors"
                            >
                              <Icons.X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStartEditTime(article)}
                            className="text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:underline cursor-pointer text-xs transition-colors"
                            title="点击编辑发布时间"
                          >
                            {formatPublishedAt(article.published_at)}
                          </button>
                        )}
                      </td>
                      <td className={`${TD} text-right whitespace-nowrap`}>
                        <div className="flex justify-end items-center gap-1.5">
                          {article.status === 'draft' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handlePublish(article.id, article.title)}
                              className="h-7 px-2.5 text-xs text-emerald-600 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/60"
                            >
                              发布
                            </Button>
                          )}
                          {article.status === 'published' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUnpublish(article.id, article.title)}
                              className="h-7 px-2.5 text-xs text-amber-600 dark:text-amber-400 border-amber-200/80 dark:border-amber-800/60"
                            >
                              下架
                            </Button>
                          )}
                          <Link
                            to={`/articles/${article.id}`}
                            target="_blank"
                            className="inline-flex items-center justify-center h-7 px-2.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                          >
                            预览
                          </Link>
                          <Link
                            to={`/admin/posts/${article.id}/edit`}
                            className="inline-flex items-center justify-center h-7 px-2.5 rounded-lg text-xs font-medium border border-primary-200/80 dark:border-primary-800/60 bg-primary-50/70 dark:bg-primary-950/50 text-primary-700 dark:text-primary-300 hover:bg-primary-100/70 dark:hover:bg-primary-950 transition-colors"
                          >
                            编辑
                          </Link>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(article.id, article.title)}
                            className="h-7 px-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                          >
                            删除
                          </Button>
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

      {confirmDialog}
    </div>
  );
};

export default ArticleManager;
