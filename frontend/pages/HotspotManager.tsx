import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { Button } from '../components/Shared';
import { deleteHotspot, getHotspots, hideHotspot, HotTopicListItem, publishHotspot, updateHotspot } from '../api/hotspots';

type StatusFilter = 'all' | 'published' | 'draft' | 'hidden';
type SortField = 'published_at' | 'heat_score';
type SortDirection = 'asc' | 'desc';

const STATUS_OPTIONS: Array<{ label: string; value: StatusFilter }> = [
  { label: '全部', value: 'all' },
  { label: '已发布', value: 'published' },
  { label: '草稿', value: 'draft' },
  { label: '已隐藏', value: 'hidden' },
];

const getStatusBadge = (status: HotTopicListItem['status']) => {
  const styles = {
    published: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    draft: 'bg-amber-50 text-amber-600 border-amber-200',
    hidden: 'bg-slate-100 text-slate-600 border-slate-200',
  } as const;

  const labels = {
    published: '已发布',
    draft: '草稿',
    hidden: '已隐藏',
  } as const;

  return (
    <span className={`inline-flex whitespace-nowrap px-2.5 py-1 text-xs rounded-full border ${styles[status]}`}>
      {labels[status]}
    </span>
  );
};

const HotspotManager: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<HotTopicListItem[]>([]);
  const [allItems, setAllItems] = useState<HotTopicListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchLoading, setBatchLoading] = useState(false);
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editingTimeId, setEditingTimeId] = useState<number | null>(null);
  const [editingTimeValue, setEditingTimeValue] = useState('');
  const [savingTime, setSavingTime] = useState(false);
  const [editingStatsId, setEditingStatsId] = useState<number | null>(null);
  const [editingHeatScore, setEditingHeatScore] = useState('');
  const [savingStats, setSavingStats] = useState(false);

  const selectedStatus = (searchParams.get('status') as StatusFilter) || 'all';
  const search = searchParams.get('search') || '';
  const selectedCategory = searchParams.get('category') || 'all';
  const selectedSourceType = searchParams.get('source_type') || 'all';
  const selectedSortField = (searchParams.get('sort_field') as SortField) || 'published_at';
  const selectedSortDirection = (searchParams.get('sort_direction') as SortDirection) || 'desc';
  const [keyword, setKeyword] = useState(search);

  useEffect(() => {
    setKeyword(search);
  }, [search]);

  useEffect(() => {
    setPage(Number(searchParams.get('page') || 1));
  }, [searchParams]);

  const buildParams = (nextPage: number) => {
    const params: any = { page: nextPage, page_size: 10, admin: true };
    if (selectedStatus !== 'all') params.status = selectedStatus;
    if (search.trim()) params.search = search.trim();
    if (selectedCategory !== 'all') params.primary_category = selectedCategory;
    if (selectedSourceType !== 'all') params.source_type = selectedSourceType;
    return params;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        getHotspots(buildParams(page)),
        getHotspots({ page: 1, page_size: 100, admin: true }),
      ]);
      setItems(listRes.data || []);
      setTotal(listRes.total || 0);
      setTotalPages(Math.max(1, resTotalPages(listRes.total_pages)));
      setAllItems(statsRes.data || []);
    } catch (error) {
      console.error('获取热点列表失败:', error);
      setItems([]);
      setAllItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    setSelectedIds([]);
  }, [page, selectedStatus, search, selectedCategory, selectedSourceType]);

  useEffect(() => {
    if (selectedSourceType.toLowerCase() === 'manual') {
      updateParams({ source_type: null, page: null });
    }
  }, [selectedSourceType]);

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    });
    if (!updates.page) next.delete('page');
    setSearchParams(next);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    updateParams({ search: keyword.trim() || null, page: null });
  };

  const formatDate = (value?: string) => {
    if (!value) return '-';
    return new Date(value).toLocaleString('zh-CN');
  };

  const handleDelete = async (id: number, title: string) => {
    if (!window.confirm(`确定要删除热点“${title}”吗？此操作会同时删除热点记录及其热点评论。`)) return;
    try {
      await deleteHotspot(id);
      await loadData();
      setSelectedIds((prev) => prev.filter((itemId) => itemId !== id));
    } catch (error: any) {
      alert(error?.response?.data?.detail || '删除失败');
    }
  };

  const handleStartEditTime = (item: HotTopicListItem) => {
    setEditingTimeId(item.id);
    const base = item.published_at ? new Date(item.published_at) : new Date();
    const localIso = new Date(base.getTime() - base.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setEditingTimeValue(localIso);
  };

  const handleSaveTime = async (id: number) => {
    if (!editingTimeValue) return;
    setSavingTime(true);
    try {
      await updateHotspot(id, { published_at: new Date(editingTimeValue).toISOString() });
      setEditingTimeId(null);
      setEditingTimeValue('');
      await loadData();
    } catch (error: any) {
      alert(error?.response?.data?.detail || '修改发布时间失败');
    } finally {
      setSavingTime(false);
    }
  };

  const handleStartEditHeatScore = (item: HotTopicListItem) => {
    setEditingStatsId(item.id);
    setEditingHeatScore(String(item.heat_score ?? 0));
  };

  const handleSaveHeatScore = async (id: number) => {
    setSavingStats(true);
    try {
      await updateHotspot(id, { heat_score: Number(editingHeatScore) || 0 });
      setEditingStatsId(null);
      setEditingHeatScore('');
      await loadData();
    } catch (error: any) {
      alert(error?.response?.data?.detail || '修改热度失败');
    } finally {
      setSavingStats(false);
    }
  };

  const stats = useMemo(() => {
    return allItems.reduce(
      (acc, item) => {
        acc.total += 1;
        acc[item.status] += 1;
        return acc;
      },
      { total: 0, published: 0, draft: 0, hidden: 0 }
    );
  }, [allItems]);

  const categoryOptions = useMemo(() => {
    return Array.from(
      new Set(allItems.map((item) => item.primary_category).filter(Boolean) as string[])
    ).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [allItems]);

  const sourceTypeOptions = useMemo(() => {
    const values = allItems.flatMap((item) => {
      const bucket = new Set<string>();
      (item.source_types || []).forEach((value) => value && bucket.add(value));
      if (item.source_type) bucket.add(item.source_type);
      (item.source_domains || []).forEach((value) => value && bucket.add(value));
      return Array.from(bucket);
    });
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [allItems]);

  const sortedItems = useMemo(() => {
    const next = [...items];
    next.sort((a, b) => {
      const factor = selectedSortDirection === 'asc' ? 1 : -1;
      if (selectedSortField === 'heat_score') {
        return ((a.heat_score || 0) - (b.heat_score || 0)) * factor;
      }
      const timeA = a.published_at ? new Date(a.published_at).getTime() : 0;
      const timeB = b.published_at ? new Date(b.published_at).getTime() : 0;
      return (timeA - timeB) * factor;
    });
    return next;
  }, [items, selectedSortField, selectedSortDirection]);

  const allCurrentPageSelected = sortedItems.length > 0 && sortedItems.every((item) => selectedIds.includes(item.id));

  const toggleSort = (field: SortField) => {
    const sameField = selectedSortField === field;
    const nextDirection: SortDirection = sameField && selectedSortDirection === 'desc' ? 'asc' : 'desc';
    updateParams({ sort_field: field, sort_direction: nextDirection, page: null });
  };

  const renderSortIcon = (field: SortField) => {
    if (selectedSortField !== field) {
      return <span className="text-slate-300 dark:text-slate-600">↕</span>;
    }
    return <span>{selectedSortDirection === 'desc' ? '↓' : '↑'}</span>;
  };

  const handleToggleAll = () => {
    if (allCurrentPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !sortedItems.some((item) => item.id === id)));
      return;
    }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...sortedItems.map((item) => item.id)])));
  };

  const handleToggleOne = (id: number) => {
    setSelectedIds((prev) => (
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    ));
  };

  const handleBatchAction = async (action: 'publish' | 'hide') => {
    if (selectedIds.length === 0) {
      alert('请先选择要操作的热点');
      return;
    }

    const confirmed = window.confirm(`确认批量${action === 'publish' ? '发布' : '隐藏'}已选中的 ${selectedIds.length} 条热点吗？`);
    if (!confirmed) return;

    setBatchLoading(true);
    let successCount = 0;
    const failedIds: number[] = [];

    try {
      for (const id of selectedIds) {
        try {
          if (action === 'publish') {
            await publishHotspot(id);
          } else {
            await hideHotspot(id);
          }
          successCount += 1;
        } catch (error) {
          console.error(`批量${action}失败:`, id, error);
          failedIds.push(id);
        }
      }

      await loadData();
      setSelectedIds([]);
      alert(
        failedIds.length > 0
          ? `已完成 ${successCount} 条，失败 ${failedIds.length} 条（ID: ${failedIds.join(', ')}）`
          : `已成功${action === 'publish' ? '发布' : '隐藏'} ${successCount} 条热点`
      );
    } finally {
      setBatchLoading(false);
    }
  };

  const statCards = [
    { label: '总数', value: stats.total, tone: 'from-slate-500 to-slate-700' },
    { label: '已发布', value: stats.published, tone: 'from-emerald-500 to-emerald-600' },
    { label: '草稿', value: stats.draft, tone: 'from-amber-400 to-orange-500' },
    { label: '隐藏', value: stats.hidden, tone: 'from-slate-400 to-slate-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">热点管理</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">管理每日热点的标题、摘要、热度与发布状态。</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Button onClick={() => navigate('/admin/hotspots/upload')}>
            上传热点
          </Button>
          <Button variant="outline" onClick={() => navigate('/hotspots')}>
            前台查看
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm overflow-hidden relative">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.tone}`} />
            <div className="text-sm text-slate-500 dark:text-slate-400">{card.label}</div>
            <div className="mt-3 text-3xl font-bold text-slate-800 dark:text-slate-100">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500 dark:text-slate-400">状态筛选：</span>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                setPage(1);
                updateParams({ status: opt.value === 'all' ? null : opt.value, page: null });
              }}
              className={`px-4 py-2 rounded-lg text-sm transition-all ${selectedStatus === opt.value
                ? 'bg-cyan-500 text-white shadow-sm'
                : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="relative xl:col-span-2">
            <Icons.Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索标题、摘要、标签..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-cyan-200"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => updateParams({ category: e.target.value === 'all' ? null : e.target.value, page: null })}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-cyan-200"
          >
            <option value="all">全部分类</option>
            {categoryOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <select
            value={selectedSourceType}
            onChange={(e) => updateParams({ source_type: e.target.value === 'all' ? null : e.target.value, page: null })}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-cyan-200"
          >
            <option value="all">全部来源类型</option>
            {sourceTypeOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <div className="flex gap-3">
            <Button type="submit" className="flex-1">搜索</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setKeyword('');
                setPage(1);
                setSearchParams(new URLSearchParams());
              }}
            >
              重置
            </Button>
          </div>
        </form>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 text-sm text-slate-500 dark:text-slate-400">
        <div className="flex items-center flex-wrap gap-3">
          <span>共 {total} 条热点</span>
          <span>第 {page} / {totalPages} 页</span>
          <span>已选择 {selectedIds.length} 条</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => handleBatchAction('publish')} disabled={batchLoading || selectedIds.length === 0}>
            {batchLoading ? '处理中...' : '批量发布'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleBatchAction('hide')} disabled={batchLoading || selectedIds.length === 0}>
            {batchLoading ? '处理中...' : '批量隐藏'}
          </Button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-500 dark:text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-slate-500 dark:text-slate-400">暂无热点数据</div>
        ) : (
          <div className="overflow-x-auto lg:overflow-visible">
            <table className="w-full min-w-[1040px] table-fixed">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="w-12 px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={allCurrentPageSelected}
                      onChange={handleToggleAll}
                      className="h-4 w-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-400"
                    />
                  </th>
                  <th className="w-[36%] text-left px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">热点</th>
                  <th className="w-[22%] text-left px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">分类 / 来源</th>
                  <th className="w-[8%] text-left px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    <button type="button" onClick={() => toggleSort('heat_score')} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200">
                      热度 {renderSortIcon('heat_score')}
                    </button>
                  </th>
                  <th className="w-[8%] text-left px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">状态</th>
                  <th className="w-[14%] text-left px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    <button type="button" onClick={() => toggleSort('published_at')} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 whitespace-nowrap">
                      发布时间 {renderSortIcon('published_at')}
                    </button>
                  </th>
                  <th className="w-[12%] text-right px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => {
                  const sourceText = item.source_types?.length
                    ? item.source_types.join(' / ')
                    : item.source_type || '-';

                  return (
                    <tr key={item.id} className="h-32 border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/30 align-top">
                      <td className="px-3 py-3 align-top">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => handleToggleOne(item.id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-400"
                        />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="space-y-2 min-h-[104px]">
                          <div className="font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 leading-6">{item.title}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">ID #{item.id} · 选题日期 {item.topic_date || '-'}</div>
                          <div className="text-sm text-slate-500 dark:text-slate-400 line-clamp-3 leading-6">{item.summary || '暂无摘要'}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="space-y-2 min-h-[104px]">
                          <div className="text-sm font-medium text-slate-700 dark:text-slate-200 break-words">{item.primary_category || '-'}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 break-words leading-5">来源：{sourceText}</div>
                          <div className="flex flex-wrap gap-1.5">
                            {(item.tags || []).length > 0 ? item.tags.slice(0, 4).map((tag) => (
                              <span key={tag} className="px-2 py-1 rounded-md text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                #{tag}
                              </span>
                            )) : <span className="text-xs text-slate-400">无标签</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top text-sm text-slate-700 dark:text-slate-200">
                        {editingStatsId === item.id ? (
                          <div className="flex flex-col gap-2 max-w-[96px]">
                            <input
                              type="number"
                              value={editingHeatScore}
                              onChange={(e) => setEditingHeatScore(e.target.value)}
                              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                              min="0"
                            />
                            <div className="flex gap-1">
                              <button type="button" onClick={() => handleSaveHeatScore(item.id)} disabled={savingStats} className="rounded-md bg-cyan-500 px-2 py-1 text-xs text-white hover:bg-cyan-600 disabled:opacity-50">存</button>
                              <button type="button" onClick={() => { setEditingStatsId(null); setEditingHeatScore(''); }} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 dark:text-slate-300">取消</button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" onClick={() => handleStartEditHeatScore(item)} className="rounded-lg bg-slate-50 px-3 py-1.5 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 whitespace-nowrap">
                            {item.heat_score}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-4 align-top whitespace-nowrap">{getStatusBadge(item.status)}</td>
                      <td className="px-4 py-4 align-top text-sm text-slate-500 dark:text-slate-400">
                        {editingTimeId === item.id ? (
                          <div className="flex flex-col gap-2 min-w-[180px]">
                            <input
                              type="datetime-local"
                              value={editingTimeValue}
                              onChange={(e) => setEditingTimeValue(e.target.value)}
                              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                            />
                            <div className="flex gap-1">
                              <button type="button" onClick={() => handleSaveTime(item.id)} disabled={savingTime} className="rounded-md bg-cyan-500 px-2 py-1 text-xs text-white hover:bg-cyan-600 disabled:opacity-50">存</button>
                              <button type="button" onClick={() => { setEditingTimeId(null); setEditingTimeValue(''); }} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 dark:text-slate-300">取消</button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" onClick={() => handleStartEditTime(item)} className="text-left leading-5 hover:text-cyan-600 dark:hover:text-cyan-400">
                            {formatDate(item.published_at)}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-col items-end gap-2">
                          <Link
                            to={`/admin/hotspots/${item.id}/edit`}
                            className="w-20 rounded-lg bg-cyan-500 px-3 py-1.5 text-center text-sm text-white hover:bg-cyan-600 transition-colors"
                          >
                            编辑
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id, item.title)}
                            className="w-20 rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-900/30"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => {
              const nextPage = Math.max(1, page - 1);
              setPage(nextPage);
              updateParams({ page: String(nextPage) });
            }}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm disabled:opacity-40"
          >
            上一页
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => {
              const nextPage = Math.min(totalPages, page + 1);
              setPage(nextPage);
              updateParams({ page: String(nextPage) });
            }}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
};

const resTotalPages = (value?: number) => value || 1;

export default HotspotManager;
