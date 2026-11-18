import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { Badge, Button, Card, EmptyState, Input, StatusPill } from '../components/Shared';
import { ListSkeleton, PageSkeleton } from '../components/Skeleton';
import {
  AiDailyIndex,
  AiDailyPayload,
  AiDailySection,
  AiSelectedItem,
  AiSelectedPayload,
  getAiDaily,
  getAiDailyIndex,
  getAiSelected,
} from '../api/aiDaily';
import { safeExternalUrl } from '../utils/urls';

const SECTIONS_PER_PAGE = 2;
const ITEMS_PER_SECTION = 5;
const SELECTED_PAGE_SIZE = 12;

const SELECTED_TABS = [
  { key: 'all', label: '全部', hint: '精选总览' },
  { key: 'ai-models', label: '模型', hint: '模型发布' },
  { key: 'ai-products', label: '产品', hint: '产品动态' },
  { key: 'industry', label: '行业', hint: '行业趋势' },
  { key: 'paper', label: '论文', hint: '研究论文' },
  { key: 'tip', label: '技巧', hint: '技巧观点' },
  { key: 'opinion', label: '观点', hint: '观点评论' },
];

const categoryTone = (label: string): 'primary' | 'emerald' | 'amber' | 'slate' => {
  if (label.includes('模型')) return 'primary';
  if (label.includes('行业')) return 'emerald';
  if (label.includes('论文') || label.includes('研究')) return 'amber';
  return 'slate';
};

const formatDate = (value?: string) => {
  if (!value) return '今日';
  const d = new Date(value.includes('T') ? value : `${value}T00:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
};

const formatTime = (value?: string) => {
  if (!value) return '刚刚更新';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const formatRelativeTime = (value?: string) => {
  if (!value) return '刚刚';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const diff = Date.now() - d.getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const selectedCategoryName = (category?: string) => {
  if (category === 'ai-models') return '模型';
  if (category === 'ai-products') return '产品';
  if (category === 'industry') return '行业';
  if (category === 'paper') return '论文';
  if (category === 'tip') return '技巧';
  if (category === 'opinion') return '观点';
  return '精选';
};

const selectedCategoryTone = (category?: string): 'primary' | 'emerald' | 'amber' | 'slate' => {
  if (category === 'ai-models' || category === 'ai-products') return 'primary';
  if (category === 'industry') return 'emerald';
  if (category === 'paper') return 'amber';
  return 'slate';
};

const totalItems = (sections: AiDailySection[]) => sections.reduce((sum, section) => sum + (section.items?.length || 0), 0);

const fallbackMonths = (daily: AiDailyPayload): AiDailyIndex => {
  const month = daily.date?.slice(0, 7) || new Date().toISOString().slice(0, 7);
  const [year, mon] = month.split('-');
  return {
    total: 1,
    months: [
      {
        month,
        label: `${year} 年 ${Number(mon)} 月`,
        count: 1,
        days: [{ date: daily.date, label: daily.date?.slice(5) || '今日', path: '/data/ai-daily.json' }],
      },
    ],
  };
};

const safeDailyJsonPath = (raw?: string | null): string => {
  if (!raw) return '/data/ai-daily.json';
  const trimmed = raw.trim();
  if (trimmed.startsWith('/data/') && !trimmed.includes('..') && trimmed.endsWith('.json')) {
    return trimmed;
  }
  return '/data/ai-daily.json';
};

const SelectedItemCard: React.FC<{ item: AiSelectedItem; index: number }> = ({ item, index }) => {
  const safeHref = safeExternalUrl(item.url);
  const body = (
    <>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Badge color={selectedCategoryTone(item.category)}>{selectedCategoryName(item.category)}</Badge>
          <span className="text-xs font-medium text-slate-400 tabular-nums">#{index + 1}</span>
        </div>
        <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500 tabular-nums">
          {formatRelativeTime(item.publishedAt)}
        </span>
      </div>
      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-snug group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-2">
        {item.title}
      </h3>
      {item.summary && (
        <p className="mt-2.5 text-sm text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">{item.summary}</p>
      )}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate text-slate-400 dark:text-slate-500">{item.source || 'AI HOT'}</span>
        {safeHref && (
          <span className="shrink-0 inline-flex items-center gap-1 font-semibold text-primary-600 dark:text-primary-400">
            查看来源 <Icons.ExternalLink className="w-3 h-3" />
          </span>
        )}
      </div>
    </>
  );

  if (safeHref) {
    return (
      <a
        href={safeHref}
        target="_blank"
        rel="noreferrer noopener"
        className="group card-lift flex flex-col justify-between h-full rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
      >
        {body}
      </a>
    );
  }

  return (
    <div className="flex flex-col justify-between h-full rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5">
      {body}
    </div>
  );
};

const AiSelectedPanel: React.FC<{ selected: AiSelectedPayload | null; loading: boolean; error: string | null }> = ({
  selected,
  loading,
  error,
}) => {
  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');

  const activeCategory = useMemo(() => selected?.categories?.find((cat) => cat.key === activeTab), [selected, activeTab]);
  const items = useMemo(() => {
    const base = activeCategory?.items || selected?.items || [];
    const keyword = query.trim().toLowerCase();
    if (!keyword) return base;
    return base.filter((item) => `${item.title} ${item.summary || ''} ${item.source || ''}`.toLowerCase().includes(keyword));
  }, [activeCategory, selected, query]);
  const totalPages = Math.max(1, Math.ceil(items.length / SELECTED_PAGE_SIZE));
  const pagedItems = items.slice((page - 1) * SELECTED_PAGE_SIZE, page * SELECTED_PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [activeTab, query]);

  return (
    <section id="ai-selected" className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
            <Icons.Sparkles className="w-4 h-4 text-primary-500" /> 实时精选
            <span className="text-xs font-medium text-slate-400 tabular-nums">{selected?.total || 0} 条在池</span>
          </h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Icons.Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题 / 摘要 / 来源"
                className="w-48 sm:w-60 pl-8 py-1.5 text-xs"
              />
            </div>
            <span className="hidden sm:inline text-xs text-slate-400 tabular-nums">{formatTime(selected?.fetchedAt)} 更新</span>
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {SELECTED_TABS.map((tab) => {
            const count = selected?.categories?.find((cat) => cat.key === tab.key)?.count || 0;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs border transition-colors cursor-pointer ${
                  active
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100 font-semibold'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 font-medium'
                }`}
              >
                {tab.label}
                <span className={`text-[11px] tabular-nums ${active ? 'opacity-80' : 'text-slate-400'}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {loading && (
          <div className="mt-6">
            <ListSkeleton rows={3} />
          </div>
        )}
        {error && !loading && (
          <div className="mt-6 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 p-4 text-sm text-amber-700 dark:text-amber-300">
            {error}
          </div>
        )}
        {!loading && !error && (
          <>
            {pagedItems.length === 0 ? (
              <div className="mt-6">
                <EmptyState
                  icon={<Icons.Search className="w-5 h-5" />}
                  title="暂无匹配的精选动态"
                  description="尝试清空搜索关键词或切换其他分类。"
                  action={
                    query ? (
                      <Button size="sm" variant="outline" onClick={() => setQuery('')}>
                        清空搜索
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mt-5 stagger-in">
                {pagedItems.map((item, index) => (
                  <SelectedItemCard
                    key={`${activeTab}-${item.id || item.url}`}
                    item={item}
                    index={(page - 1) * SELECTED_PAGE_SIZE + index}
                  />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  上一页
                </Button>
                <span className="px-3 text-xs font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                  {page} / {totalPages}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  下一页
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};

const AiDaily: React.FC = () => {
  const [daily, setDaily] = useState<AiDailyPayload | null>(null);
  const [archiveIndex, setArchiveIndex] = useState<AiDailyIndex | null>(null);
  const [selected, setSelected] = useState<AiSelectedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLoading, setSelectedLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedError, setSelectedError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const initialPath = useMemo(() => {
    const match = window.location.hash.match(/[?&]p=([^&]+)/);
    return match ? safeDailyJsonPath(decodeURIComponent(match[1])) : '/data/ai-daily.json';
  }, []);
  const [selectedPath, setSelectedPath] = useState(initialPath);
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let mounted = true;
    Promise.all([getAiDaily(selectedPath), getAiDailyIndex()])
      .then(([data, index]) => {
        if (!mounted) return;
        setDaily(data);
        setArchiveIndex(index || fallbackMonths(data));
        setCurrentPage(1);
        setError(null);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.message || 'AI日报暂时不可用');
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [selectedPath]);

  useEffect(() => {
    let mounted = true;
    setSelectedLoading(true);
    getAiSelected()
      .then((data) => {
        if (!mounted) return;
        setSelected(data);
        setSelectedError(null);
      })
      .catch((err) => {
        if (!mounted) return;
        setSelectedError(err?.message || 'AI精选内容暂时不可用');
      })
      .finally(() => mounted && setSelectedLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const totalPages = daily ? Math.max(1, Math.ceil(daily.sections.length / SECTIONS_PER_PAGE)) : 1;
  const pagedSections = useMemo(() => {
    if (!daily) return [];
    const start = (currentPage - 1) * SECTIONS_PER_PAGE;
    return daily.sections.slice(start, start + SECTIONS_PER_PAGE);
  }, [daily, currentPage]);

  useEffect(() => {
    if (archiveIndex?.months?.length) {
      setOpenMonths({ [archiveIndex.months[0].month]: true });
    }
  }, [archiveIndex]);

  const isDeepLinkRef = useRef(initialPath !== '/data/ai-daily.json');
  useEffect(() => {
    if (!loading && !error && isDeepLinkRef.current) {
      isDeepLinkRef.current = false;
      window.requestAnimationFrame(() => {
        document.getElementById('daily-brief')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [loading, error]);

  const goPage = (page: number) => {
    const next = Math.min(Math.max(page, 1), totalPages);
    setCurrentPage(next);
    window.requestAnimationFrame(() => {
      document.getElementById('ai-daily-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const jumpToDailySection = (sectionIndex: number, label: string) => {
    const targetPage = Math.floor(sectionIndex / SECTIONS_PER_PAGE) + 1;
    setCurrentPage(targetPage);
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        document.getElementById(`daily-sec-${label}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 40);
    });
  };

  if (loading) {
    return <PageSkeleton />;
  }

  if (error || !daily) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <EmptyState
          icon={<Icons.Bell className="w-5 h-5" />}
          title="AI日报暂时不可用"
          description={error || '请稍后刷新页面。'}
          action={
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              重新加载
            </Button>
          }
        />
      </div>
    );
  }

  const months = archiveIndex?.months?.length ? archiveIndex.months : fallbackMonths(daily).months;

  return (
    <div className="min-h-screen">
      {/* 极简编辑部页头 */}
      <header className="border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="space-y-3">
              <StatusPill tone="emerald" dot>
                每 30 分钟同步 &middot; {formatTime(selected?.fetchedAt || daily.fetchedAt)}
              </StatusPill>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                AI日报 <span className="text-primary-600 dark:text-primary-400">&middot; 实时热点精选</span>
              </h1>
              <p className="max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                同步 AI HOT 实时精选流（{selected?.total || 0} 条在池），下方保留每日成稿简报与按月时间轴归档。
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link
                  to="/leaderboard"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
                >
                  <Icons.TrendingUp className="w-3.5 h-3.5 text-primary-500" /> 大模型排行榜
                </Link>
                <Link
                  to="/ai-weekly"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
                >
                  <Icons.BookOpen className="w-3.5 h-3.5 text-primary-500" /> AI 周报 / 月报
                </Link>
                <Link
                  to="/ai-resets"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
                >
                  <Icons.RefreshCw className="w-3.5 h-3.5 text-primary-500" /> 额度重置监控
                </Link>
              </div>
            </div>

            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
              {formatDate(daily.date)} &middot; {totalItems(daily.sections)} 条简报
            </div>
          </div>
        </div>
      </header>

      <AiSelectedPanel selected={selected} loading={selectedLoading} error={selectedError} />

      <main id="daily-brief" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 scroll-mt-24">
        <div className="mb-7 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              <Icons.BookOpen className="w-5 h-5 text-primary-500" /> 今日简报与历史归档
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              收盘式回顾每日成稿简报；追踪实时动态可关注上方实时精选。
            </p>
          </div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
            {formatDate(daily.date)} &middot; {totalItems(daily.sections)} 条
          </div>
        </div>

        <div className="grid xl:grid-cols-[240px_minmax(0,1fr)_280px] lg:grid-cols-[220px_minmax(0,1fr)] gap-6 items-start">
          {/* 左侧时间轴 */}
          <aside className="hidden lg:block sticky top-24">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">
                <Icons.Clock className="w-3.5 h-3.5 text-primary-500" /> 日报时间轴
              </div>
              <div className="space-y-1">
                {months.map((month) => (
                  <div key={month.month} className="relative pl-4 border-l border-slate-200 dark:border-slate-700 last:border-transparent">
                    <span
                      className={`absolute -left-[4.5px] w-2 h-2 rounded-full top-3 ${
                        openMonths[month.month] ? 'bg-primary-500' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setOpenMonths((prev) => ({ ...prev, [month.month]: !prev[month.month] }))}
                      className="w-full flex items-center justify-between gap-2 py-2 rounded-lg px-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                        <Icons.ChevronDown
                          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                            openMonths[month.month] ? 'rotate-0' : '-rotate-90'
                          }`}
                        />
                        {month.label}
                      </div>
                      <span className="text-[11px] text-slate-400 tabular-nums">{month.count}</span>
                    </button>
                    {openMonths[month.month] && (
                      <div className="mt-1 mb-2 space-y-1">
                        {(month.days || []).map((day) => {
                          const targetPath = safeDailyJsonPath(day.path);
                          const active = selectedPath === targetPath;
                          return (
                            <button
                              key={day.path}
                              type="button"
                              onClick={() => setSelectedPath(targetPath)}
                              className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                                active
                                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300 font-semibold'
                                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                              }`}
                            >
                              <span>{day.label}</span>
                              {active && <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedPath('/data/ai-daily.json');
                  window.requestAnimationFrame(() => {
                    document.getElementById('daily-brief')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  });
                }}
                disabled={selectedPath === '/data/ai-daily.json'}
                className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                回到今天 <Icons.ArrowRight className="w-3.5 h-3.5" />
              </button>
            </Card>
          </aside>

          {/* 中央成稿简报 */}
          <div id="ai-daily-list" className="space-y-6 scroll-mt-24">
            {pagedSections.map((section, sectionIndex) => {
              const globalSectionIndex = (currentPage - 1) * SECTIONS_PER_PAGE + sectionIndex;
              const visibleItems = (section.items || []).slice(0, ITEMS_PER_SECTION);
              const hiddenCount = Math.max(0, (section.items?.length || 0) - ITEMS_PER_SECTION);
              return (
                <section id={`daily-sec-${section.label}`} key={section.label} className="scroll-mt-24">
                  <Card className="p-5 md:p-6">
                  <div className="flex items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400 flex items-center justify-center text-sm font-bold tabular-nums">
                        {globalSectionIndex + 1}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{section.label}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {visibleItems.length} 条精选动态{hiddenCount > 0 ? ` · 另有 ${hiddenCount} 条进入来源池` : ''}
                        </p>
                      </div>
                    </div>
                    <Badge color={categoryTone(section.label)}>AI Daily</Badge>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {visibleItems.map((item, index) => {
                      const safeUrl = safeExternalUrl(item.sourceUrl);
                      return (
                        <article key={`${section.label}-${item.title}-${index}`} className="py-4 first:pt-0 last:pb-0 group">
                          <div className="flex gap-3.5">
                            <div className="shrink-0 w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center text-xs font-semibold tabular-nums">
                              {index + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              {safeUrl ? (
                                <a href={safeUrl} target="_blank" rel="noreferrer noopener" className="block">
                                  <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-snug group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                                    {item.title}
                                  </h4>
                                </a>
                              ) : (
                                <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                                  {item.title}
                                </h4>
                              )}
                              {item.summary && (
                                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{item.summary}</p>
                              )}
                              <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                                {item.sourceName && (
                                  <span className="inline-flex items-center gap-1">
                                    <Icons.Link className="w-3.5 h-3.5" />
                                    {item.sourceName}
                                  </span>
                                )}
                                {safeUrl && (
                                  <a
                                    href={safeUrl}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 font-medium hover:underline"
                                  >
                                    查看来源 <Icons.ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  </Card>
                </section>
              );
            })}

            {pagedSections.length === 0 && (
              <EmptyState
                icon={<Icons.Inbox className="w-5 h-5" />}
                title="这一天的成稿没有内容"
                description="AIHOT 当日未生成日报内容。可从左侧时间轴选择其他日期，或回到今天。"
                action={
                  selectedPath !== '/data/ai-daily.json' ? (
                    <Button size="sm" variant="outline" onClick={() => setSelectedPath('/data/ai-daily.json')}>
                      回到今天
                    </Button>
                  ) : undefined
                }
              />
            )}

            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => goPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  上一页
                </Button>
                {Array.from({ length: totalPages }).map((_, index) => {
                  const p = index + 1;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => goPage(p)}
                      className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        p === currentPage
                          ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => goPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  下一页
                </Button>
              </div>
            )}
          </div>

          {/* 右侧目录与快讯 */}
          <aside className="lg:sticky lg:top-24 space-y-4 lg:col-span-2 xl:col-span-1">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                <Icons.Tags className="w-3.5 h-3.5 text-primary-500" /> 今日目录
              </div>
              <div className="space-y-1.5">
                {daily.sections.map((section, idx) => (
                  <button
                    key={section.label}
                    type="button"
                    onClick={() => jumpToDailySection(idx, section.label)}
                    className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs bg-slate-50/80 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer"
                  >
                    <span className="truncate">{section.label}</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {section.items?.length || 0}
                    </span>
                  </button>
                ))}
              </div>
            </Card>

            {!!daily.flashes?.length && (
              <Card className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                  <Icons.Bell className="w-3.5 h-3.5 text-amber-500" /> 快讯
                </div>
                <div className="space-y-3">
                  {daily.flashes.slice(0, 8).map((flash, index) => {
                    const safeFlashUrl = safeExternalUrl(flash.sourceUrl);
                    return safeFlashUrl ? (
                      <a
                        key={`${flash.title}-${index}`}
                        href={safeFlashUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="block text-xs leading-5 text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                      >
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{flash.title}</span>
                        {flash.sourceName && <span className="text-slate-400"> &middot; {flash.sourceName}</span>}
                      </a>
                    ) : (
                      <div key={`${flash.title}-${index}`} className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{flash.title}</span>
                        {flash.sourceName && <span className="text-slate-400"> &middot; {flash.sourceName}</span>}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
};

export default AiDaily;
