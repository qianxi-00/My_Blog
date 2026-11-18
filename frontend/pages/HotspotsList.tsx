import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { Badge, Button, EmptyState, StatusPill } from '../components/Shared';
import { ListSkeleton } from '../components/Skeleton';
import AiHotRankCard from '../components/AiHotRankCard';
import {
  getHotspots,
  HotTopicListItem,
  HotspotSort,
} from '../api/hotspots';

type TimeRange = 'all' | 'today' | 'week' | 'month';

type MonthOption = {
  value: string;
  label: string;
  fromDate: string;
  toDate: string;
};

type StackOption = {
  value: string;
  label: string;
  count: number;
};

// 三十六期：分类归一后只剩 5 个规范值（后端 writer._normalize_primary_category 白名单）
const PRIMARY_CATEGORY_GROUPS: Record<string, string[]> = {
  'AI模型': ['AI模型'],
  'AI基础设施': ['AI基础设施'],
  'AI应用': ['AI应用'],
  'AI产品': ['AI产品'],
  'AI安全': ['AI安全'],
  '其他': ['其他'],
};

type StatItem = {
  value: string;
  count: number;
};

interface HotspotTop3CarouselProps {
  items: HotTopicListItem[];
}

interface HotspotFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  sort: HotspotSort;
  onSortChange: (value: HotspotSort) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (value: TimeRange) => void;
  selectedCategory: string;
  onCategoryChange: (value: string) => void;
  selectedSource: string;
  onSourceChange: (value: string) => void;
  categoryStats: StatItem[];
  sourceStats: StatItem[];
  onReset: () => void;
}

interface HotspotArchiveSidebarProps {
  monthOptions: MonthOption[];
  archiveCounts: Map<string, number>;
  selectedArchive: string;
  onArchiveChange: (value: string) => void;
  stackOptions: StackOption[];
  selectedStack: string;
  onStackChange: (value: string) => void;
}

const PAGE_SIZE = 10;
const HOTSPOT_FETCH_PAGE_SIZE = 100;
const MAX_ARCHIVE_MONTHS = 12;
const ARCHIVE_MIN_MONTH = '2026-03';
const STACK_COLLAPSED_LIMIT = 8;

const parsePositiveInt = (value: string | null, fallback = 1) => {
  const parsed = Number(value || fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const isSortMode = (value: string | null): value is HotspotSort => value === 'latest' || value === 'hottest';
const isTimeRange = (value: string | null): value is TimeRange =>
  value === 'all' || value === 'today' || value === 'week' || value === 'month';

const formatMonthLabel = (month: string) => {
  const [year, mon] = month.split('-');
  return `${year} 年 ${mon} 月`;
};

const getMonthOptions = (): MonthOption[] => {
  const now = new Date();
  const options: MonthOption[] = [];

  for (let index = 0; index < MAX_ARCHIVE_MONTHS; index += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const year = date.getFullYear();
    const month = date.getMonth();
    const monthValue = `${year}-${String(month + 1).padStart(2, '0')}`;

    if (monthValue < ARCHIVE_MIN_MONTH) continue;

    options.push({
      value: monthValue,
      label: formatMonthLabel(monthValue),
      fromDate: new Date(year, month, 1).toISOString().slice(0, 10),
      toDate: new Date(year, month + 1, 0).toISOString().slice(0, 10),
    });
  }

  return options;
};

const normalizeDate = (value?: string) => {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getHeatScore = (item: HotTopicListItem) => Number(item.heat_score || 0);

const dedupeHotspots = (items: HotTopicListItem[]) => Array.from(new Map(items.map((item) => [item.id, item])).values());

const fetchHotspotsFromApi = async (): Promise<HotTopicListItem[]> => {
  let currentPage = 1;
  let totalPages = 1;
  const merged: HotTopicListItem[] = [];

  while (currentPage <= totalPages) {
    const response = await getHotspots({
      page: currentPage,
      page_size: HOTSPOT_FETCH_PAGE_SIZE,
      status: 'published',
      admin: false,
    });

    merged.push(...(response.data || []).filter((item) => item.status === 'published'));
    totalPages = Math.max(1, Number(response.total_pages || 1));
    currentPage += 1;
  }

  return dedupeHotspots(merged);
};

const getPublishedDate = (item: HotTopicListItem) => normalizeDate(item.published_at || item.topic_date || item.created_at);

// 三十四期：'最新优先' 与时间过滤均使用 created_at（真实写作时间），展示与月份归档仍用 published_at
const getCreatedDate = (item: HotTopicListItem) => normalizeDate(item.created_at || item.published_at || item.topic_date);

const getArchiveKey = (item: HotTopicListItem) => {
  const date = getPublishedDate(item);
  if (!date) return '未知';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const normalizeSourceFamily = (value?: string) => {
  const text = (value || '').trim().toLowerCase();
  if (!text || text === 'manual') return null;
  if (text.includes('arxiv') || text.includes('paper') || text.includes('论文')) return '论文';
  if (text.includes('github') || text.includes('gitlab')) return 'GitHub';
  if (text.includes('blog') || text.includes('substack') || text.includes('medium') || text.includes('csdn') || text.includes('infoq')) return '博客';
  if (text.includes('openai') || text.includes('anthropic') || text.includes('google') || text.includes('meta') || text.includes('official') || text.includes('官网') || text.includes('官方')) return '官方公告';
  if (text.includes('reddit') || text.includes('hacker news') || text.includes('x.com') || text.includes('twitter') || text.includes('社区') || text.includes('news')) return '社区媒体';
  if (text.includes('launch') || text.includes('product') || text.includes('release') || text.includes('发布')) return '产品发布';
  return '其他来源';
};

const getSourceValues = (item: HotTopicListItem) => {
  const values = new Set<string>();

  (item.source_domains || []).forEach((domain) => {
    const family = normalizeSourceFamily(domain);
    if (family) values.add(family);
  });

  const sourceTypeFamily = normalizeSourceFamily(item.source_type);
  if (sourceTypeFamily) values.add(sourceTypeFamily);

  (item.source_types || []).forEach((source) => {
    const family = normalizeSourceFamily(source);
    if (family) values.add(family);
  });

  return Array.from(values);
};

const getStackValues = (item: HotTopicListItem) => {
  const category = item.primary_category?.trim();
  if (!category) return [];

  for (const [groupName, members] of Object.entries(PRIMARY_CATEGORY_GROUPS)) {
    if (members.includes(category)) {
      return [groupName];
    }
  }

  return [category];
};

const formatDisplayDate = (value?: string) => {
  const date = normalizeDate(value);
  if (!date) return '暂无日期';
  return date.toLocaleDateString('zh-CN');
};

const HotspotTop3Carousel: React.FC<HotspotTop3CarouselProps> = ({ items }) => {
  const slides = useMemo(() => items.slice(0, 3), [items]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');

  useEffect(() => {
    setActiveIndex(0);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return undefined;

    const timer = window.setInterval(() => {
      setDirection('next');
      setActiveIndex((current) => (current + 1) % slides.length);
    }, 4500);

    return () => window.clearInterval(timer);
  }, [slides.length]);

  if (slides.length === 0) {
    return null;
  }

  const activeItem = slides[Math.min(activeIndex, slides.length - 1)];

  return (
    <section className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 overflow-hidden">
      <div className="border-b border-slate-100 dark:border-slate-800 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Icons.Flame className="w-4 h-4 text-primary-500" />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">本周焦点</span>
          <span className="hidden sm:inline text-xs text-slate-400 dark:text-slate-500">
            最近 7 天重点技术动态
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {slides.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setDirection(index > activeIndex ? 'next' : 'prev');
                setActiveIndex(index);
              }}
              className={`h-2 rounded-full transition-all cursor-pointer ${
                activeIndex === index
                  ? 'w-7 bg-primary-500'
                  : 'w-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600'
              }`}
              aria-label={`切换到第 ${index + 1} 条焦点`}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_290px]">
        <div className="p-6 md:p-7">
          <div
            key={`${activeItem.id}-${direction}`}
            className={`space-y-4 ${
              direction === 'next' ? 'animate-[slide-in-right_360ms_ease]' : 'animate-[slide-in-left_360ms_ease]'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusPill tone="amber" dot>
                焦点 {activeIndex + 1}
              </StatusPill>
              <Badge color="slate">{activeItem.primary_category || '未分类'}</Badge>
              <Badge color="primary">热度 {getHeatScore(activeItem)}</Badge>
            </div>

            <div className="space-y-2.5">
              <Link
                to={`/hotspots/${activeItem.id}`}
                className="block text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                {activeItem.title}
              </Link>
              <p className="text-sm leading-7 text-slate-600 dark:text-slate-300 max-w-3xl line-clamp-3">
                {activeItem.summary || '这条热点暂无摘要，点击进入详情页查看完整内容。'}
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(activeItem.tags || []).slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-slate-200/80 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 px-2.5 py-0.5 text-xs text-slate-600 dark:text-slate-300"
                >
                  #{tag}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Icons.Calendar className="w-3.5 h-3.5" />
                {formatDisplayDate(activeItem.published_at || activeItem.topic_date)}
              </span>
              <Link
                to={`/hotspots/${activeItem.id}`}
                className="inline-flex items-center gap-1 font-semibold text-primary-600 dark:text-primary-400 hover:underline"
              >
                阅读全文 <Icons.ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        <div className="border-t xl:border-t-0 xl:border-l border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-4 space-y-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">
            焦点切换
          </div>
          {slides.map((item, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setDirection(index > activeIndex ? 'next' : 'prev');
                  setActiveIndex(index);
                }}
                className={`w-full text-left rounded-lg border px-3.5 py-2.5 transition-colors cursor-pointer ${
                  isActive
                    ? 'border-primary-400/70 bg-white dark:bg-slate-800 dark:border-primary-600/70 shadow-xs'
                    : 'border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-400 mb-0.5 tabular-nums">0{index + 1}</div>
                    <div
                      className={`text-xs font-semibold line-clamp-2 ${
                        isActive ? 'text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {item.title}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-primary-600 dark:text-primary-400">
                    {getHeatScore(item)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

const HotspotFilters: React.FC<HotspotFiltersProps> = ({
  search,
  onSearchChange,
  onSubmit,
  sort,
  onSortChange,
  timeRange,
  onTimeRangeChange,
  selectedCategory,
  onCategoryChange,
  selectedSource,
  onSourceChange,
  categoryStats,
  sourceStats,
  onReset,
}) => {
  return (
    <section
      id="hotspot-filters"
      className="bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5 space-y-4 scroll-mt-24"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Icons.Sliders className="w-4 h-4 text-primary-500" />
            筛选条件
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            按关键词、分类、来源、时间范围与排序方式快速检索
          </p>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <Icons.RefreshCw className="w-3.5 h-3.5" />
          清空筛选
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">时段：</span>
        <div className="inline-flex p-1 bg-slate-100/90 dark:bg-slate-800/80 rounded-lg border border-slate-200/70 dark:border-slate-700/70">
          {([
            { value: 'all', label: '全部' },
            { value: 'today', label: '今天' },
            { value: 'week', label: '近 7 天' },
            { value: 'month', label: '近 30 天' },
          ] as Array<{ value: TimeRange; label: string }>).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onTimeRangeChange(option.value)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                timeRange === option.value
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">排序：</span>
          <button
            type="button"
            onClick={() => onSortChange(sort === 'latest' ? 'hottest' : 'latest')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Icons.ArrowUpDown className="w-3.5 h-3.5" />
            {sort === 'latest' ? '最新优先' : '热度优先'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        <form onSubmit={onSubmit} className="xl:col-span-5 relative">
          <Icons.Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索标题、摘要、标签..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </form>

        <select
          value={selectedCategory}
          onChange={(event) => onCategoryChange(event.target.value)}
          className="xl:col-span-3 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
        >
          <option value="all">全部分类</option>
          {categoryStats.map((item) => (
            <option key={item.value} value={item.value}>
              {item.value}（{item.count}）
            </option>
          ))}
        </select>

        <select
          value={selectedSource}
          onChange={(event) => onSourceChange(event.target.value)}
          className="xl:col-span-3 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
        >
          <option value="all">全部来源</option>
          {sourceStats.map((item) => (
            <option key={item.value} value={item.value}>
              {item.value}（{item.count}）
            </option>
          ))}
        </select>

        <div className="xl:col-span-1 flex items-center justify-end">
          <Button type="submit" variant="secondary" className="w-full xl:w-auto">
            <Icons.Search className="w-3.5 h-3.5" />
            搜索
          </Button>
        </div>
      </div>

      {(categoryStats.length > 0 || sourceStats.length > 0) && (
        <div className="space-y-2.5 pt-1 border-t border-slate-100 dark:border-slate-800">
          {categoryStats.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2">
              <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 mr-1">
                <Icons.Folder className="w-3.5 h-3.5" /> 分类
              </span>
              <button
                type="button"
                onClick={() => onCategoryChange('all')}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-slate-900 dark:bg-slate-100 border-slate-900 dark:border-slate-100 text-white dark:text-slate-900 font-medium'
                    : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                全部
              </button>
              {categoryStats.slice(0, 8).map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => onCategoryChange(item.value)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors cursor-pointer ${
                    selectedCategory === item.value
                      ? 'bg-primary-600 border-primary-600 text-white font-medium'
                      : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-300 dark:hover:border-primary-700'
                  }`}
                >
                  {item.value} <span className="opacity-70 tabular-nums">{item.count}</span>
                </button>
              ))}
            </div>
          )}

          {sourceStats.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 mr-1">
                <Icons.Link className="w-3.5 h-3.5" /> 来源
              </span>
              <button
                type="button"
                onClick={() => onSourceChange('all')}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors cursor-pointer ${
                  selectedSource === 'all'
                    ? 'bg-slate-900 dark:bg-slate-100 border-slate-900 dark:border-slate-100 text-white dark:text-slate-900 font-medium'
                    : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                全部
              </button>
              {sourceStats.slice(0, 8).map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => onSourceChange(item.value)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors cursor-pointer ${
                    selectedSource === item.value
                      ? 'bg-primary-600 border-primary-600 text-white font-medium'
                      : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-300 dark:hover:border-primary-700'
                  }`}
                >
                  {item.value} <span className="opacity-70 tabular-nums">{item.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

const HotspotArchiveSidebar: React.FC<HotspotArchiveSidebarProps> = ({
  monthOptions,
  archiveCounts,
  selectedArchive,
  onArchiveChange,
  stackOptions,
  selectedStack,
  onStackChange,
}) => {
  const filteredMonths = monthOptions.filter((month) => month.value >= ARCHIVE_MIN_MONTH);
  const [stackExpanded, setStackExpanded] = useState(false);

  const visibleStackOptions = stackExpanded ? stackOptions : stackOptions.slice(0, STACK_COLLAPSED_LIMIT);
  const hasMoreStacks = stackOptions.length > STACK_COLLAPSED_LIMIT;

  return (
    <div
      id="hotspot-archive"
      className="bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5 sticky top-24 space-y-6 scroll-mt-24"
    >
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1 inline-flex items-center gap-2">
          <Icons.Archive className="w-4 h-4 text-primary-500" />
          时间归档
        </h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">按月份快速回看历史热点</p>

        <div className="space-y-1">
          <button
            type="button"
            onClick={() => onArchiveChange('all')}
            className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              selectedArchive === 'all'
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            全部时段
          </button>

          {filteredMonths.map((month) => {
            const count = archiveCounts.get(month.value) || 0;
            return (
              <button
                key={month.value}
                type="button"
                onClick={() => onArchiveChange(month.value)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                  selectedArchive === month.value
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                <span>{month.label}</span>
                <span className="text-[11px] opacity-70 tabular-nums">{count > 0 ? count : '—'}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1 inline-flex items-center gap-2">
          <Icons.Folder className="w-4 h-4 text-primary-500" />
          技术方向
        </h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-3 leading-5">
          按一级技术方向快速过滤左侧热点列表
        </p>

        <div className="space-y-1">
          <button
            type="button"
            onClick={() => onStackChange('all')}
            className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              selectedStack === 'all'
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            全部方向
          </button>

          {stackOptions.length > 0 ? (
            visibleStackOptions.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => onStackChange(item.value)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                  selectedStack === item.value
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                <span>{item.label}</span>
                <span className="text-[11px] opacity-70 tabular-nums">{item.count}</span>
              </button>
            ))
          ) : (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700 px-3 py-2 text-xs text-slate-400">
              当前暂无可识别的技术方向
            </div>
          )}

          {hasMoreStacks && (
            <button
              type="button"
              onClick={() => setStackExpanded((prev) => !prev)}
              className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {stackExpanded ? '收起' : `展开更多（${stackOptions.length - STACK_COLLAPSED_LIMIT}）`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const HotspotsList: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [allItems, setAllItems] = useState<HotTopicListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');

  const page = parsePositiveInt(searchParams.get('page'), 1);
  const search = searchParams.get('search') || '';
  const sort = isSortMode(searchParams.get('sort')) ? (searchParams.get('sort') as HotspotSort) : 'latest';
  const timeRange = isTimeRange(searchParams.get('range')) ? (searchParams.get('range') as TimeRange) : 'all';
  const selectedCategory = searchParams.get('category') || 'all';
  const selectedSource = searchParams.get('source') || searchParams.get('source_type') || 'all';
  const selectedArchive = searchParams.get('archive') || 'all';
  const selectedStack = searchParams.get('stack') || 'all';

  const monthOptions = useMemo(() => getMonthOptions(), []);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    let alive = true;

    const fetchAllPublished = async () => {
      setLoading(true);
      try {
        const deduped = await fetchHotspotsFromApi();
        if (alive) {
          setAllItems(deduped);
        }
      } catch (error) {
        console.error('获取热点列表失败', error);
        if (alive) {
          setAllItems((current) => current);
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };

    fetchAllPublished();

    return () => {
      alive = false;
    };
  }, []);

  const updateQuery = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (!value || value === 'all') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });
    if (!Object.prototype.hasOwnProperty.call(updates, 'page')) {
      next.delete('page');
    }
    setSearchParams(next);
  };

  useEffect(() => {
    if (selectedSource.toLowerCase() === 'manual') {
      updateQuery({ source: null, source_type: null, page: null });
    }
  }, [selectedSource]);

  const dateScopedItems = useMemo(() => {
    if (selectedArchive !== 'all') {
      return allItems.filter((item) => getArchiveKey(item) === selectedArchive);
    }

    if (timeRange === 'all') {
      return allItems;
    }

    const now = new Date();
    return allItems.filter((item) => {
      const date = getCreatedDate(item);
      if (!date) return false;

      if (timeRange === 'today') {
        return date.toDateString() === now.toDateString();
      }

      const diffMs = now.getTime() - date.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays < 0) return false;
      return timeRange === 'week' ? diffDays <= 7 : diffDays <= 30;
    });
  }, [allItems, selectedArchive, timeRange]);

  const featuredItems = useMemo(() => {
    const now = new Date();
    const recent = allItems.filter((item) => {
      const date = getCreatedDate(item);
      if (!date) return false;
      const diffDays = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 7;
    });

    const pool = recent.length >= 3 ? recent : allItems;
    return [...pool]
      .sort((a, b) => {
        const heatDiff = getHeatScore(b) - getHeatScore(a);
        if (heatDiff !== 0) return heatDiff;
        const aTime = getCreatedDate(a)?.getTime() || 0;
        const bTime = getCreatedDate(b)?.getTime() || 0;
        return bTime - aTime;
      })
      .slice(0, 3);
  }, [allItems]);

  const categoryStats = useMemo(() => {
    const counter = new Map<string, number>();
    dateScopedItems.forEach((item) => {
      if (!item.primary_category) return;
      counter.set(item.primary_category, (counter.get(item.primary_category) || 0) + 1);
    });

    return Array.from(counter.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));
  }, [dateScopedItems]);

  const sourceStats = useMemo(() => {
    const counter = new Map<string, number>();
    dateScopedItems.forEach((item) => {
      getSourceValues(item).forEach((source) => {
        counter.set(source, (counter.get(source) || 0) + 1);
      });
    });

    return Array.from(counter.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));
  }, [dateScopedItems]);

  const stackOptions = useMemo<StackOption[]>(() => {
    const counter = new Map<string, number>();
    dateScopedItems.forEach((item) => {
      getStackValues(item).forEach((stack) => {
        counter.set(stack, (counter.get(stack) || 0) + 1);
      });
    });

    return Array.from(counter.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count, label: value }));
  }, [dateScopedItems]);

  const archiveCounts = useMemo(() => {
    const counter = new Map<string, number>();
    allItems.forEach((item) => {
      const key = getArchiveKey(item);
      if (key >= ARCHIVE_MIN_MONTH) {
        counter.set(key, (counter.get(key) || 0) + 1);
      }
    });
    return counter;
  }, [allItems]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return dateScopedItems
      .filter((item) => selectedCategory === 'all' || (item.primary_category || '') === selectedCategory)
      .filter((item) => selectedSource === 'all' || getSourceValues(item).includes(selectedSource))
      .filter((item) => selectedStack === 'all' || getStackValues(item).includes(selectedStack))
      .filter((item) => {
        if (!normalizedSearch) return true;

        const haystack = [
          item.title,
          item.summary || '',
          item.primary_category || '',
          ...(item.tags || []),
          ...getSourceValues(item),
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(normalizedSearch);
      })
      .sort((a, b) => {
        if (sort === 'hottest') {
          return getHeatScore(b) - getHeatScore(a);
        }

        const aTime = getCreatedDate(a)?.getTime() || 0;
        const bTime = getCreatedDate(b)?.getTime() || 0;
        return bTime - aTime;
      });
  }, [dateScopedItems, search, selectedCategory, selectedSource, selectedStack, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) {
      updateQuery({ page: totalPages > 1 ? String(totalPages) : null });
    }
  }, [page, totalPages]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, page]);

  const stats = useMemo(() => {
    const visibleHeat = filteredItems.reduce((sum, item) => sum + getHeatScore(item), 0);
    const avgHeat = filteredItems.length > 0 ? Math.round(visibleHeat / filteredItems.length) : 0;
    const sourceTotal = filteredItems.reduce((sum, item) => sum + Number(item.source_count || 0), 0);

    return {
      totalPublished: dateScopedItems.length,
      visibleCount: filteredItems.length,
      avgHeat,
      totalSources: sourceTotal,
    };
  }, [dateScopedItems.length, filteredItems]);

  const dateRangeLabel = useMemo(() => {
    if (selectedArchive !== 'all') {
      const month = monthOptions.find((item) => item.value === selectedArchive);
      return month?.label || formatMonthLabel(selectedArchive);
    }

    if (timeRange === 'all') return '全部时段热点';
    if (timeRange === 'today') return '今日热点';
    if (timeRange === 'week') return '近 7 天热点';
    return '近 30 天热点';
  }, [monthOptions, selectedArchive, timeRange]);

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    updateQuery({ search: searchInput.trim() || null, page: null });
  };

  const handleReset = () => {
    setSearchInput('');
    setSearchParams(new URLSearchParams());
  };

  const hasActiveFilters = Boolean(
    search.trim() ||
      selectedCategory !== 'all' ||
      selectedSource !== 'all' ||
      selectedArchive !== 'all' ||
      selectedStack !== 'all' ||
      timeRange !== 'all' ||
      sort !== 'latest',
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* 极简编辑部页头 */}
      <header className="pb-8 mb-8 border-b border-slate-200/80 dark:border-slate-800 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-medium tracking-wider uppercase text-primary-600 dark:text-primary-400">
            <Icons.TrendingUp className="w-3.5 h-3.5" />
            <span>AI Hotspots / {dateRangeLabel}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            每日精选技术热点
          </h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
            聚合多源技术论文、工程博客与行业动态，提供结构化深度解读与可追溯来源。
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => document.getElementById('hotspot-filters')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              <Icons.Search className="w-3.5 h-3.5" /> 快速筛选
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => document.getElementById('hotspot-archive')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              <Icons.Archive className="w-3.5 h-3.5" /> 查看归档
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
          {[
            { label: '已发布总数', value: allItems.length, icon: Icons.FileText },
            { label: '当前结果', value: stats.visibleCount, icon: Icons.Filter },
            { label: '平均热度', value: stats.avgHeat, icon: Icons.Flame },
            { label: '累计来源', value: stats.totalSources, icon: Icons.Link },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-3 min-w-[104px]"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <item.icon className="w-3.5 h-3.5 text-primary-500" />
                {item.label}
              </div>
              <div className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{item.value}</div>
            </div>
          ))}
        </div>
      </header>

      <div className="space-y-6">
        <AiHotRankCard />

        <HotspotTop3Carousel items={featuredItems} />

        <HotspotFilters
          search={searchInput}
          onSearchChange={setSearchInput}
          onSubmit={handleSearchSubmit}
          sort={sort}
          onSortChange={(value) => updateQuery({ sort: value, page: null })}
          timeRange={timeRange}
          onTimeRangeChange={(value) => updateQuery({ range: value, archive: null, page: null })}
          selectedCategory={selectedCategory}
          onCategoryChange={(value) => updateQuery({ category: value === 'all' ? null : value, page: null })}
          selectedSource={selectedSource}
          onSourceChange={(value) =>
            updateQuery({ source: value === 'all' ? null : value, source_type: value === 'all' ? null : value, page: null })
          }
          categoryStats={categoryStats}
          sourceStats={sourceStats}
          onReset={handleReset}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mt-8 items-start">
        <section className="lg:col-span-3 space-y-4">
          {loading ? (
            <ListSkeleton rows={4} />
          ) : paginatedItems.length === 0 ? (
            <EmptyState
              icon={<Icons.Search className="w-5 h-5" />}
              title="当前筛选条件下暂无热点"
              description="尝试放宽时间范围或清除部分筛选条件。"
              action={
                hasActiveFilters ? (
                  <Button size="sm" variant="outline" onClick={handleReset}>
                    重置全部筛选
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  本页展示 <span className="font-semibold text-slate-900 dark:text-slate-100">{paginatedItems.length}</span> 条 &middot; 共{' '}
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{stats.visibleCount}</span> 条 &middot; {dateRangeLabel}
                </div>
                {hasActiveFilters && (
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {selectedArchive !== 'all' && <Badge color="primary">归档：{formatMonthLabel(selectedArchive)}</Badge>}
                    {selectedCategory !== 'all' && <Badge color="slate">分类：{selectedCategory}</Badge>}
                    {selectedSource !== 'all' && <Badge color="slate">来源：{selectedSource}</Badge>}
                    {selectedStack !== 'all' && <Badge color="primary">方向：{selectedStack}</Badge>}
                    {search.trim() && <Badge color="slate">搜索：{search.trim()}</Badge>}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger-in">
                {paginatedItems.map((item, index) => {
                  const sourceBadges = getSourceValues(item).slice(0, 3);
                  return (
                    <article
                      key={item.id}
                      className="group card-lift bg-white dark:bg-slate-900/90 rounded-xl border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 p-5 flex flex-col justify-between transition-colors"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex gap-1.5 flex-wrap items-center">
                            {page === 1 && index < 3 && (
                              <StatusPill tone="amber">NO.{index + 1}</StatusPill>
                            )}
                            <Badge color="slate">{item.primary_category || '未分类'}</Badge>
                            <Badge color="primary">热度 {getHeatScore(item)}</Badge>
                          </div>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0 tabular-nums">
                            {formatDisplayDate(item.published_at || item.topic_date)}
                          </span>
                        </div>

                        <Link to={`/hotspots/${item.id}`} className="block">
                          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-2 leading-snug">
                            {item.title}
                          </h2>
                        </Link>

                        <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-3 min-h-[60px] leading-relaxed">
                          {item.summary || '暂无摘要'}
                        </p>

                        <div className="flex flex-wrap gap-1.5 min-h-[24px]">
                          {(item.tags || []).slice(0, 5).map((tag) => (
                            <span
                              key={tag}
                              className="text-[11px] px-2 py-0.5 rounded-md bg-slate-50 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/70 text-slate-500 dark:text-slate-400"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          {sourceBadges.length > 0 ? (
                            sourceBadges.map((source) => (
                              <span
                                key={source}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400"
                              >
                                <Icons.Link className="w-3 h-3" /> {source}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-slate-400 dark:text-slate-500">
                              来源 {Number(item.source_count || 0)}
                            </span>
                          )}
                        </div>
                        <Link
                          to={`/hotspots/${item.id}`}
                          className="shrink-0 font-semibold text-primary-600 dark:text-primary-400 inline-flex items-center gap-1 group-hover:translate-x-0.5 transition-transform"
                        >
                          查看详情 <Icons.ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}

          {totalPages > 1 && (
            <div className="flex flex-wrap justify-center items-center gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => updateQuery({ page: String(Math.max(1, page - 1)) })}
              >
                <Icons.ChevronLeft className="w-3.5 h-3.5" /> 上一页
              </Button>
              <span className="text-xs text-slate-500 dark:text-slate-400 px-3 tabular-nums">
                第 {page} / {totalPages} 页
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => updateQuery({ page: String(Math.min(totalPages, page + 1)) })}
              >
                下一页 <Icons.ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </section>

        <aside>
          <HotspotArchiveSidebar
            monthOptions={monthOptions}
            archiveCounts={archiveCounts}
            selectedArchive={selectedArchive}
            onArchiveChange={(value) => updateQuery({ archive: value === 'all' ? null : value, page: null })}
            stackOptions={stackOptions}
            selectedStack={selectedStack}
            onStackChange={(value) => updateQuery({ stack: value === 'all' ? null : value, page: null })}
          />
        </aside>
      </div>
    </div>
  );
};

export default HotspotsList;
