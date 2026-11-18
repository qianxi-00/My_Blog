import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  StatusPill,
} from '../components/Shared';
import { ListSkeleton } from '../components/Skeleton';
import {
  deleteHotspot,
  getHotspots,
  hideHotspot,
  HotTopicListItem,
  publishHotspot,
  updateHotspot,
} from '../api/hotspots';
import { errorText } from '../utils/errors';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { TH, TD } from '../constants';

type StatusFilter = 'all' | 'published' | 'draft' | 'hidden';
type SortField = 'published_at' | 'heat_score';
type SortDirection = 'asc' | 'desc';

const STATUS_OPTIONS: Array<{ label: string; value: StatusFilter }> = [
  { label: '全部', value: 'all' },
  { label: '已发布', value: 'published' },
  { label: '草稿', value: 'draft' },
  { label: '已隐藏', value: 'hidden' },
];

const STATUS_META: Record<
  HotTopicListItem['status'],
  { label: string; tone: 'emerald' | 'amber' | 'slate' }
> = {
  published: { label: '已发布', tone: 'emerald' },
  draft: { label: '草稿', tone: 'amber' },
  hidden: { label: '已隐藏', tone: 'slate' },
};

const HotspotManager: React.FC = () => {
  const { confirm, confirmDialog } = useConfirm();
  const { showToast } = useToast();
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
    const params: Record<string, unknown> = { page: nextPage, page_size: 10, admin: true };
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
      showToast(errorText(error, '获取热点列表失败'), 'error');
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
    if (!value) return '—';
    return new Date(value).toLocaleString('zh-CN');
  };

  const handleDelete = async (id: number, title: string) => {
    const ok = await confirm({
      title: '删除热点',
      message: `确定要删除热点“${title}”吗？此操作会同时删除热点记录及其热点评论，且不可恢复。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteHotspot(id);
      await loadData();
      setSelectedIds((prev) => prev.filter((itemId) => itemId !== id));
      showToast('热点已删除', 'success');
    } catch (error: any) {
      showToast(errorText(error, '删除失败'), 'error');
    }
  };

  const handleStartEditTime = (item: HotTopicListItem) => {
    setEditingTimeId(item.id);
    const base = item.published_at ? new Date(item.published_at) : new Date();
    const localIso = new Date(base.getTime() - base.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setEditingTimeValue(localIso);
  };

  const handleSaveTime = async (id: number) => {
    if (!editingTimeValue) return;
    setSavingTime(true);
    try {
      await updateHotspot(id, { published_at: new Date(editingTimeValue).toISOString() });
      setEditingTimeId(null);
      setEditingTimeValue('');
      showToast('发布时间已更新', 'success');
      await loadData();
    } catch (error: any) {
      showToast(errorText(error, '修改发布时间失败'), 'error');
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
      showToast('热度分数已更新', 'success');
      await loadData();
    } catch (error: any) {
      showToast(errorText(error, '修改热度失败'), 'error');
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
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'zh-CN')
    );
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

  const allCurrentPageSelected =
    sortedItems.length > 0 && sortedItems.every((item) => selectedIds.includes(item.id));

  const toggleSort = (field: SortField) => {
    const sameField = selectedSortField === field;
    const nextDirection: SortDirection =
      sameField && selectedSortDirection === 'desc' ? 'asc' : 'desc';
    updateParams({ sort_field: field, sort_direction: nextDirection, page: null });
  };

  const renderSortIcon = (field: SortField) => {
    if (selectedSortField !== field) {
      return <Icons.ArrowUpDown className="w-3 h-3 text-slate-300 dark:text-slate-600" />;
    }
    return selectedSortDirection === 'desc' ? (
      <Icons.ChevronDown className="w-3.5 h-3.5 text-primary-500" />
    ) : (
      <Icons.ChevronUp className="w-3.5 h-3.5 text-primary-500" />
    );
  };

  const handleToggleAll = () => {
    if (allCurrentPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !sortedItems.some((item) => item.id === id)));
      return;
    }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...sortedItems.map((item) => item.id)])));
  };

  const handleToggleOne = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  };

  const handleBatchAction = async (action: 'publish' | 'hide') => {
    if (selectedIds.length === 0) {
      showToast('请先选择要操作的热点', 'error');
      return;
    }

    const ok = await confirm({
      title: action === 'publish' ? '批量发布' : '批量隐藏',
      message: `确认批量${action === 'publish' ? '发布' : '隐藏'}已选中的 ${selectedIds.length} 条热点吗？`,
      confirmText: action === 'publish' ? '批量发布' : '批量隐藏',
      danger: action === 'hide',
    });
    if (!ok) return;

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
      if (failedIds.length > 0) {
        showToast(
          `已完成 ${successCount} 条，失败 ${failedIds.length} 条（ID: ${failedIds.join(', ')}）`,
          'error'
        );
      } else {
        showToast(
          `已成功${action === 'publish' ? '发布' : '隐藏'} ${successCount} 条热点`,
          'success'
        );
      }
    } finally {
      setBatchLoading(false);
    }
  };

  const statCards = [
    { label: '热点总数', value: stats.total, dot: 'bg-slate-400' },
    { label: '已发布', value: stats.published, dot: 'bg-emerald-500' },
    { label: '草稿箱', value: stats.draft, dot: 'bg-amber-500' },
    { label: '已隐藏', value: stats.hidden, dot: 'bg-slate-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
            热点管理
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            管理每日热点的标题、摘要、热度分数与发布状态
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => navigate('/hotspots')}>
            <Icons.ExternalLink className="w-3.5 h-3.5" />
            前台查看
          </Button>
          <Button size="sm" onClick={() => navigate('/admin/hotspots/upload')}>
            <Icons.Upload className="w-3.5 h-3.5" />
            上传热点
          </Button>
        </div>
      </div>

      {/* Stat Grid */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.label} className="p-5">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className={`w-2 h-2 rounded-full ${card.dot}`} aria-hidden />
              <span>{card.label}</span>
            </div>
            <div className="mt-2.5 text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
              {card.value}
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">状态筛选：</span>
          <div className="inline-flex rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-0.5">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setPage(1);
                  updateParams({ status: opt.value === 'all' ? null : opt.value, page: null });
                }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  selectedStatus === opt.value
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="relative xl:col-span-2">
            <Icons.Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索标题、摘要、标签..."
              className="pl-9"
            />
          </div>

          <Select
            value={selectedCategory}
            onChange={(e) =>
              updateParams({ category: e.target.value === 'all' ? null : e.target.value, page: null })
            }
          >
            <option value="all">全部分类</option>
            {categoryOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>

          <Select
            value={selectedSourceType}
            onChange={(e) =>
              updateParams({
                source_type: e.target.value === 'all' ? null : e.target.value,
                page: null,
              })
            }
          >
            <option value="all">全部来源类型</option>
            {sourceTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>

          <div className="flex gap-2">
            <Button type="submit" size="sm" className="flex-1 h-9">
              搜索
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9"
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
      </Card>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center flex-wrap gap-3 tabular-nums">
          <span>共 {total} 条热点</span>
          <span>第 {page} / {totalPages} 页</span>
          <span>已选择 {selectedIds.length} 条</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleBatchAction('publish')}
            disabled={batchLoading || selectedIds.length === 0}
          >
            {batchLoading ? '处理中...' : '批量发布'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleBatchAction('hide')}
            disabled={batchLoading || selectedIds.length === 0}
          >
            {batchLoading ? '处理中...' : '批量隐藏'}
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-4">
            <ListSkeleton rows={5} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Icons.TrendingUp className="w-5 h-5" />}
            title="暂无热点数据"
            description="可尝试清空筛选条件，或上传新的热点文章。"
            action={
              <Button size="sm" onClick={() => navigate('/admin/hotspots/upload')}>
                <Icons.Upload className="w-3.5 h-3.5" />
                上传热点
              </Button>
            }
            className="border-0"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] table-fixed">
              <thead className="bg-slate-50/80 dark:bg-slate-950/50 border-b border-slate-200/80 dark:border-slate-800">
                <tr>
                  <th className={`${TH} w-11`}>
                    <input
                      type="checkbox"
                      checked={allCurrentPageSelected}
                      onChange={handleToggleAll}
                      aria-label="全选本页"
                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-primary-600 focus:ring-primary-500"
                    />
                  </th>
                  <th className={`${TH} w-[35%]`}>热点</th>
                  <th className={`${TH} w-[22%]`}>分类 / 来源</th>
                  <th className={`${TH} w-[9%]`}>
                    <button
                      type="button"
                      onClick={() => toggleSort('heat_score')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                      热度 {renderSortIcon('heat_score')}
                    </button>
                  </th>
                  <th className={`${TH} w-[9%]`}>状态</th>
                  <th className={`${TH} w-[14%]`}>
                    <button
                      type="button"
                      onClick={() => toggleSort('published_at')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white whitespace-nowrap transition-colors"
                    >
                      发布时间 {renderSortIcon('published_at')}
                    </button>
                  </th>
                  <th className={`${TH} w-[11%] text-right`}>操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                {sortedItems.map((item) => {
                  const sourceText = item.source_types?.length
                    ? item.source_types.join(' / ')
                    : item.source_type || '—';
                  const statusMeta = STATUS_META[item.status] || {
                    label: item.status,
                    tone: 'slate' as const,
                  };

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 align-top transition-colors"
                    >
                      <td className={TD}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => handleToggleOne(item.id)}
                          aria-label={`选择 ${item.title}`}
                          className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      <td className={TD}>
                        <div className="space-y-1.5">
                          <div className="font-medium text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug">
                            {item.title}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500 whitespace-nowrap">
                            #{item.id} · 选题 {item.topic_date || '—'}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                            {item.summary || '暂无摘要'}
                          </div>
                        </div>
                      </td>
                      <td className={TD}>
                        <div className="space-y-1.5">
                          <div className="text-xs font-medium text-slate-800 dark:text-slate-200 break-words">
                            {item.primary_category || '未分类'}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 break-words">
                            来源：{sourceText}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {(item.tags || []).length > 0 ? (
                              item.tags.slice(0, 4).map((tag) => (
                                <Badge key={tag} color="slate" className="text-[11px]">
                                  #{tag}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-[11px] text-slate-400">无标签</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className={`${TD} tabular-nums`}>
                        {editingStatsId === item.id ? (
                          <div className="flex flex-col gap-1.5 max-w-[96px]">
                            <input
                              type="number"
                              value={editingHeatScore}
                              onChange={(e) => setEditingHeatScore(e.target.value)}
                              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs focus:ring-2 focus:ring-primary-500/30 focus:outline-none"
                              min="0"
                            />
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => handleSaveHeatScore(item.id)}
                                disabled={savingStats}
                                className="rounded bg-primary-600 px-2 py-0.5 text-[11px] text-white hover:bg-primary-700 disabled:opacity-50"
                              >
                                存
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingStatsId(null);
                                  setEditingHeatScore('');
                                }}
                                className="rounded border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[11px] text-slate-600 dark:text-slate-300"
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStartEditHeatScore(item)}
                            className="rounded-md bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-700 transition-colors"
                            title="点击修改热度分数"
                          >
                            {item.heat_score}
                          </button>
                        )}
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <StatusPill tone={statusMeta.tone} dot>
                          {statusMeta.label}
                        </StatusPill>
                      </td>
                      <td className={`${TD} text-xs text-slate-500 dark:text-slate-400 tabular-nums`}>
                        {editingTimeId === item.id ? (
                          <div className="flex flex-col gap-1.5 min-w-[176px]">
                            <input
                              type="datetime-local"
                              value={editingTimeValue}
                              onChange={(e) => setEditingTimeValue(e.target.value)}
                              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs focus:ring-2 focus:ring-primary-500/30 focus:outline-none"
                            />
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => handleSaveTime(item.id)}
                                disabled={savingTime}
                                className="rounded bg-primary-600 px-2 py-0.5 text-[11px] text-white hover:bg-primary-700 disabled:opacity-50"
                              >
                                存
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTimeId(null);
                                  setEditingTimeValue('');
                                }}
                                className="rounded border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[11px] text-slate-600 dark:text-slate-300"
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStartEditTime(item)}
                            className="text-left leading-5 hover:text-primary-600 dark:hover:text-primary-400 hover:underline transition-colors"
                            title="点击编辑发布时间"
                          >
                            {formatDate(item.published_at)}
                          </button>
                        )}
                      </td>
                      <td className={TD}>
                        <div className="flex flex-col items-end gap-1.5">
                          <Link
                            to={`/admin/hotspots/${item.id}/edit`}
                            className="inline-flex items-center justify-center h-7 px-2.5 rounded-lg text-xs font-medium border border-primary-200/80 dark:border-primary-800/60 bg-primary-50/70 dark:bg-primary-950/50 text-primary-700 dark:text-primary-300 hover:bg-primary-100/70 dark:hover:bg-primary-950 transition-colors"
                          >
                            编辑
                          </Link>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(item.id, item.title)}
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

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => {
              const nextPage = Math.max(1, page - 1);
              setPage(nextPage);
              updateParams({ page: String(nextPage) });
            }}
          >
            上一页
          </Button>
          <span className="px-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            第 {page} / {totalPages} 页
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => {
              const nextPage = Math.min(totalPages, page + 1);
              setPage(nextPage);
              updateParams({ page: String(nextPage) });
            }}
          >
            下一页
          </Button>
        </div>
      )}

      {confirmDialog}
    </div>
  );
};

const resTotalPages = (value?: number) => value || 1;

export default HotspotManager;
