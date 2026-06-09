import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import {
  getHotspots,
  HotTopicListItem,
  HotspotSort,
} from '../api/hotspots';

type TimeRange = 'today' | 'week' | 'month';

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

const PRIMARY_CATEGORY_GROUPS: Record<string, string[]> = {
  'Agent工程': ['Agent工程', '代码Agent', 'LLM工程'],
  'AI基础设施': ['AI基础设施'],
  'AI多模态': ['AI多模态'],
  'AI应用落地': ['AI应用落地'],
  'AI编程': ['AI编程'],
  'AI安全与对齐': ['AI安全与对齐'],
  'AI测试评估': ['AI测试评估', 'AI评测'],
  '具身智能': ['具身智能'],
  'AI模型': ['AI模型'],
  '前沿论文': ['前沿论文'],
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
const MAX_ARCHIVE_MONTHS = 12;
const ARCHIVE_MIN_MONTH = '2026-03';
const STACK_COLLAPSED_LIMIT = 8;

const parsePositiveInt = (value: string | null, fallback = 1) => {
  const parsed = Number(value || fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const isSortMode = (value: string | null): value is HotspotSort => value === 'latest' || value === 'hottest';
const isTimeRange = (value: string | null): value is TimeRange => value === 'today' || value === 'week' || value === 'month';

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

const getPublishedDate = (item: HotTopicListItem) => normalizeDate(item.published_at || item.topic_date || item.created_at);

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
    <section className="rounded-[28px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
      <div className="border-b border-slate-100 dark:border-slate-700 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <Icons.TrendingUp className="w-4 h-4 text-cyan-500" />
            本周焦点
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            精选 3 条高关注热点，快速进入重点内容。
          </p>
        </div>

        <div className="flex items-center gap-2">
          {slides.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setDirection(index > activeIndex ? 'next' : 'prev');
                setActiveIndex(index);
              }}
              className={`h-2.5 rounded-full transition-all ${activeIndex === index ? 'w-8 bg-cyan-500' : 'w-2.5 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500'}`}
              aria-label={`切换到第 ${index + 1} 条焦点`}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-0">
        <div className="relative overflow-hidden p-6 md:p-7 bg-gradient-to-br from-slate-50 via-white to-cyan-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.10),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.08),transparent_26%)]" />
          <div className={`pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-white/55 to-transparent dark:from-slate-900/55 ${direction === 'next' ? 'animate-[fade-in_420ms_ease]' : 'opacity-0'}`} />
          <div className={`pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-white/55 to-transparent dark:from-slate-900/55 ${direction === 'prev' ? 'animate-[fade-in_420ms_ease]' : 'opacity-0'}`} />

          <div key={`${activeItem.id}-${direction}`} className={`relative space-y-5 ${direction === 'next' ? 'animate-[slide-in-right_420ms_ease]' : 'animate-[slide-in-left_420ms_ease]'}`}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300 px-2.5 py-1 font-medium">
                焦点 {activeIndex + 1}
              </span>
              <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2.5 py-1 font-medium">
                {activeItem.primary_category || '未分类'}
              </span>
              <span className="inline-flex items-center rounded-full bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 px-2.5 py-1 font-medium">
                热度 {getHeatScore(activeItem)}
              </span>
            </div>

            <div className="space-y-3">
              <Link
                to={`/hotspots/${activeItem.id}`}
                className="block text-2xl md:text-3xl font-black tracking-tight text-slate-900 dark:text-white hover:text-cyan-600 transition-colors"
              >
                {activeItem.title}
              </Link>
              <p className="text-sm md:text-[15px] leading-7 text-slate-600 dark:text-slate-300 max-w-3xl">
                {activeItem.summary || '这条热点暂无摘要，点击进入详情页查看完整内容。'}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {(activeItem.tags || []).slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 px-3 py-1 text-xs text-slate-600 dark:text-slate-300"
                >
                  #{tag}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Icons.Calendar className="w-4 h-4" />
                {formatDisplayDate(activeItem.published_at || activeItem.topic_date)}
              </span>
              <Link
                to={`/hotspots/${activeItem.id}`}
                className="inline-flex items-center gap-1.5 font-semibold text-cyan-600 dark:text-cyan-300 hover:text-cyan-700 dark:hover:text-cyan-200"
              >
                查看详情
                <Icons.ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="border-t xl:border-t-0 xl:border-l border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 md:p-5 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">焦点导航</div>
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
                className={`w-full text-left rounded-2xl border px-4 py-3 transition-all ${isActive
                  ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-500/10 dark:border-cyan-500 shadow-sm'
                  : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-400 mb-1">第 {index + 1} 条</div>
                    <div className={`text-sm font-semibold line-clamp-2 ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                      {item.title}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs text-slate-400">热度</div>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{getHeatScore(item)}</div>
                  </div>
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
    <section id="hotspot-filters" className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-4 md:p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">筛选条件</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">可按关键词、分类、来源、时间与排序方式快速缩小范围。</p>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
        >
          清空筛选
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500 dark:text-slate-400">时间：</span>
        {([
          { value: 'today', label: '今天' },
          { value: 'week', label: '近 7 天' },
          { value: 'month', label: '近 30 天' },
        ] as Array<{ value: TimeRange; label: string }>).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onTimeRangeChange(option.value)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition ${timeRange === option.value
              ? 'bg-primary-500 border-primary-500 text-white'
              : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {option.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-slate-500 dark:text-slate-400">排序：</span>
          <button
            type="button"
            onClick={() => onSortChange(sort === 'latest' ? 'hottest' : 'latest')}
            className="px-3 py-1.5 rounded-lg text-sm border bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 inline-flex items-center gap-1"
          >
            <Icons.ArrowUpDown className="w-4 h-4" />
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
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          />
        </form>

        <select
          value={selectedCategory}
          onChange={(event) => onCategoryChange(event.target.value)}
          className="xl:col-span-3 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
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
          className="xl:col-span-3 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
        >
          <option value="all">全部来源</option>
          {sourceStats.map((item) => (
            <option key={item.value} value={item.value}>
              {item.value}（{item.count}）
            </option>
          ))}
        </select>

        <div className="xl:col-span-1 flex items-center justify-end">
          <button
            type="submit"
            className="w-full xl:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            <Icons.Search className="w-4 h-4" />
            搜索
          </button>
        </div>
      </div>

      {(categoryStats.length > 0 || sourceStats.length > 0) && (
        <div className="space-y-3 pt-1">
          {categoryStats.length > 0 && (
            <div className="flex flex-wrap items-start gap-2">
              <span className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 min-w-fit py-1">
                <Icons.Folder className="w-4 h-4" /> 分类：
              </span>
              <button
                type="button"
                onClick={() => onCategoryChange('all')}
                className={`px-3 py-1.5 rounded-full text-sm border transition ${selectedCategory === 'all'
                  ? 'bg-primary-500 border-primary-500 text-white'
                  : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                全部
              </button>
              {categoryStats.slice(0, 8).map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => onCategoryChange(item.value)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition ${selectedCategory === item.value
                    ? 'bg-primary-500 border-primary-500 text-white'
                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-200'
                  }`}
                >
                  {item.value} <span className="opacity-70">{item.count}</span>
                </button>
              ))}
            </div>
          )}

          {sourceStats.length > 0 && (
            <div className="flex flex-wrap items-start gap-2">
              <span className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 min-w-fit py-1">
                <Icons.Link className="w-4 h-4" /> 来源：
              </span>
              <button
                type="button"
                onClick={() => onSourceChange('all')}
                className={`px-3 py-1.5 rounded-full text-sm border transition ${selectedSource === 'all'
                  ? 'bg-primary-500 border-primary-500 text-white'
                  : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                全部
              </button>
              {sourceStats.slice(0, 8).map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => onSourceChange(item.value)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition ${selectedSource === item.value
                    ? 'bg-primary-500 border-primary-500 text-white'
                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-200'
                  }`}
                >
                  {item.value} <span className="opacity-70">{item.count}</span>
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
    <div id="hotspot-archive" className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-4 shadow-sm sticky top-24 space-y-5">
      <div>
        <h3 className="font-bold text-slate-900 dark:text-white mb-1 inline-flex items-center gap-2">
          <Icons.Archive className="w-4 h-4" />
          时间归档
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          按月份快速回看历史热点。
        </p>
      </div>

      <div className="space-y-1">
        <button
          type="button"
          onClick={() => onArchiveChange('all')}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm ${selectedArchive === 'all'
            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
            : 'hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300'
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
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between ${selectedArchive === month.value
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                : 'hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300'
              }`}
            >
              <span>{month.label}</span>
              <span className="text-xs opacity-70">{count > 0 ? count : '—'}</span>
            </button>
          );
        })}
      </div>

      <div className="pt-1">
        <h3 className="font-bold text-slate-900 dark:text-white mb-1 inline-flex items-center gap-2">
          <Icons.Folder className="w-4 h-4" />
          技术栈分类
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-6">
          这里仅保留一级技术方向，避免目录过长、层级过深。您可以先按大方向筛选，再回到左侧主列表逐条挑选真正想看的文章。
        </p>

        <div className="space-y-1">
          <button
            type="button"
            onClick={() => onStackChange('all')}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm ${selectedStack === 'all'
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
              : 'hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300'
            }`}
          >
            全部技术栈
          </button>

          {stackOptions.length > 0 ? visibleStackOptions.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onStackChange(item.value)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between ${selectedStack === item.value
                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                : 'hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300'
              }`}
            >
              <span>{item.label}</span>
              <span className="text-xs opacity-70">{item.count}</span>
            </button>
          )) : (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
              当前暂无可识别的技术栈标签
            </div>
          )}

          {hasMoreStacks && (
            <button
              type="button"
              onClick={() => setStackExpanded((prev) => !prev)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
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
  const timeRange = isTimeRange(searchParams.get('range')) ? (searchParams.get('range') as TimeRange) : 'week';
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
        let currentPage = 1;
        let totalPages = 1;
        const merged: HotTopicListItem[] = [];

        while (currentPage <= totalPages) {
          const response = await getHotspots({
            page: currentPage,
            page_size: 100,
            status: 'published',
            admin: false,
          });

          merged.push(...(response.data || []).filter((item) => item.status === 'published'));
          totalPages = Math.max(1, Number(response.total_pages || 1));
          currentPage += 1;
        }

        const deduped = Array.from(new Map(merged.map((item) => [item.id, item])).values());
        if (alive) {
          setAllItems(deduped);
        }
      } catch (error) {
        console.error('获取热点列表失败', error);
        if (alive) {
          setAllItems([]);
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

    const now = new Date();
    return allItems.filter((item) => {
      const date = getPublishedDate(item);
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
    return [...dateScopedItems]
      .sort((a, b) => {
        const heatDiff = getHeatScore(b) - getHeatScore(a);
        if (heatDiff !== 0) return heatDiff;
        const aTime = getPublishedDate(a)?.getTime() || 0;
        const bTime = getPublishedDate(b)?.getTime() || 0;
        return bTime - aTime;
      })
      .slice(0, 3);
  }, [dateScopedItems]);

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

        const aTime = getPublishedDate(a)?.getTime() || 0;
        const bTime = getPublishedDate(b)?.getTime() || 0;
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
  }, [dateScopedItems.length, filteredItems, allItems.length]);

  const dateRangeLabel = useMemo(() => {
    if (selectedArchive !== 'all') {
      const month = monthOptions.find((item) => item.value === selectedArchive);
      return month?.label || formatMonthLabel(selectedArchive);
    }

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
    timeRange !== 'week' ||
    sort !== 'latest'
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
      <section className="relative overflow-hidden rounded-3xl border border-slate-100 dark:border-slate-700 bg-gradient-to-br from-sky-50 via-cyan-50 to-indigo-50 text-slate-900 p-6 md:p-8 mb-6 shadow-lg">
        <div className="absolute -top-20 -right-16 w-64 h-64 bg-cyan-200/40 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 left-10 w-72 h-72 bg-indigo-200/40 rounded-full blur-3xl" />

        <div className="relative max-w-5xl mx-auto">
          <div className="rounded-[28px] border border-white/60 bg-white/78 backdrop-blur-sm shadow-sm px-5 md:px-6 py-4 md:py-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 text-xs font-semibold tracking-wide text-slate-700 border border-white/70">
                <Icons.TrendingUp className="w-3.5 h-3.5" /> 热点频道
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 text-xs font-semibold tracking-wide text-slate-700 border border-white/70">
                <Icons.Calendar className="w-3.5 h-3.5" /> {dateRangeLabel}
              </div>
            </div>

            <div className="space-y-3 max-w-4xl">
              <h1 className="text-3xl md:text-5xl font-black leading-tight tracking-tight">每日精选技术热点</h1>
              <p className="text-sm md:text-base text-slate-600 leading-7">
                聚合优质博客、社区讨论与技术动态，提供结构化摘要与更顺手的阅读入口。
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl">
              <div className="rounded-xl bg-white/80 border border-slate-200 px-3 py-2.5">
                <div className="text-xs text-slate-500">已发布总数</div>
                <div className="text-xl font-black">{allItems.length}</div>
              </div>
              <div className="rounded-xl bg-white/80 border border-slate-200 px-3 py-2.5">
                <div className="text-xs text-slate-500">当前结果</div>
                <div className="text-xl font-black">{stats.visibleCount}</div>
              </div>
              <div className="rounded-xl bg-white/80 border border-slate-200 px-3 py-2.5">
                <div className="text-xs text-slate-500">平均热度</div>
                <div className="text-xl font-black">{stats.avgHeat}</div>
              </div>
              <div className="rounded-xl bg-white/80 border border-slate-200 px-3 py-2.5">
                <div className="text-xs text-slate-500">累计来源</div>
                <div className="text-xl font-black">{stats.totalSources}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white/75 px-4 py-3 max-w-4xl">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 border border-slate-200 text-slate-600">
                    <Icons.Calendar className="w-3.5 h-3.5" /> 当前范围：{dateRangeLabel}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 border border-slate-200 text-slate-600">
                    <Icons.Folder className="w-3.5 h-3.5" /> 分类数 {categoryStats.length}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 border border-slate-200 text-slate-600">
                    <Icons.Link className="w-3.5 h-3.5" /> 来源类型 {sourceStats.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => document.getElementById('hotspot-filters')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
                  >
                    <Icons.Search className="w-4 h-4" /> 快速筛选
                  </button>
                  <button
                    type="button"
                    onClick={() => document.getElementById('hotspot-archive')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                  >
                    <Icons.Archive className="w-4 h-4" /> 查看归档
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      <div className="space-y-6">
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
          onSourceChange={(value) => updateQuery({ source: value === 'all' ? null : value, source_type: value === 'all' ? null : value, page: null })}
          categoryStats={categoryStats}
          sourceStats={sourceStats}
          onReset={handleReset}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mt-6 items-start">
        <section className="lg:col-span-3 space-y-4">
          {loading ? (
            <div className="text-center py-16 text-slate-400">加载中...</div>
          ) : paginatedItems.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
              当前筛选条件下暂无热点
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  当前页展示 <span className="font-semibold text-slate-900 dark:text-white">{paginatedItems.length}</span> 条，本次筛选共 <span className="font-semibold text-slate-900 dark:text-white">{stats.visibleCount}</span> 条，范围：{dateRangeLabel}
                </div>
                {hasActiveFilters && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {selectedArchive !== 'all' && (
                      <span className="px-2.5 py-1 rounded-full bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                        归档：{formatMonthLabel(selectedArchive)}
                      </span>
                    )}
                    {selectedCategory !== 'all' && (
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        分类：{selectedCategory}
                      </span>
                    )}
                    {selectedSource !== 'all' && (
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        来源：{selectedSource}
                      </span>
                    )}
                    {selectedStack !== 'all' && (
                      <span className="px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                        技术栈：{selectedStack}
                      </span>
                    )}
                    {search.trim() && (
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        搜索：{search.trim()}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {paginatedItems.map((item, index) => {
                  const sourceBadges = getSourceValues(item).slice(0, 3);
                  return (
                    <article key={item.id} className="group bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm hover:shadow-lg transition-all">
                      <div className="h-2 bg-gradient-to-r from-indigo-500 via-primary-500 to-cyan-400" />
                      <div className="p-5 space-y-3">
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <div className="flex gap-2 flex-wrap">
                            {index < 3 && (
                              <span className="px-2 py-1 rounded-md bg-rose-50 text-rose-600 border border-rose-200">
                                NO.{index + 1}
                              </span>
                            )}
                            <span className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                              {item.primary_category || '未分类'}
                            </span>
                            <span className="px-2 py-1 rounded-md bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-300">
                              热度 {getHeatScore(item)}
                            </span>
                          </div>
                          <span className="text-slate-400 shrink-0">{formatDisplayDate(item.published_at || item.topic_date)}</span>
                        </div>

                        <h2 className="text-lg font-bold text-slate-900 dark:text-white line-clamp-2">{item.title}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-3 min-h-[60px]">
                          {item.summary || '暂无摘要'}
                        </p>

                        <div className="flex flex-wrap gap-2 min-h-[26px]">
                          {(item.tags || []).slice(0, 5).map((tag) => (
                            <span key={tag} className="text-xs px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300">
                              #{tag}
                            </span>
                          ))}
                        </div>

                        <div className="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                          {sourceBadges.length > 0 ? sourceBadges.map((source) => (
                            <span key={source} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                              <Icons.Link className="w-3.5 h-3.5" /> {source}
                            </span>
                          )) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                              <Icons.Link className="w-3.5 h-3.5" /> 暂无来源信息
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                          <span>来源 {Number(item.source_count || 0)}</span>
                          <Link to={`/hotspots/${item.id}`} className="font-bold text-primary-600 dark:text-primary-400 group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-1">
                            查看详情 <Icons.ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}

          {totalPages > 1 && (
            <div className="flex flex-wrap justify-center items-center gap-2 mt-6">
              <button
                disabled={page <= 1}
                onClick={() => updateQuery({ page: String(Math.max(1, page - 1)) })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm disabled:opacity-40"
              >
                上一页
              </button>
              <span className="text-sm text-slate-500 dark:text-slate-400 px-2">第 {page} / {totalPages} 页</span>
              <button
                disabled={page >= totalPages}
                onClick={() => updateQuery({ page: String(Math.min(totalPages, page + 1)) })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          )}
        </section>

        <aside className="space-y-4">
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
