import React, { useEffect, useMemo, useState } from 'react';
import { Icons } from '../components/Icons';
import { getAiDaily, getAiDailyIndex, getAiSelected, AiDailyPayload, AiDailySection, AiDailyIndex, AiSelectedPayload, AiSelectedItem } from '../api/aiDaily';

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
];

const categoryStyle = (label: string) => {
  if (label.includes('模型')) return 'bg-cyan-50 text-cyan-700 border-cyan-100 dark:bg-cyan-900/20 dark:text-cyan-300 dark:border-cyan-800';
  if (label.includes('产品')) return 'bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-800';
  if (label.includes('论文') || label.includes('研究')) return 'bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800';
  if (label.includes('行业')) return 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800';
  return 'bg-slate-50 text-slate-700 border-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
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
  return '精选';
};

const selectedCategoryBadge = (category?: string) => {
  if (category === 'ai-models') return categoryStyle('模型');
  if (category === 'ai-products') return categoryStyle('产品');
  if (category === 'industry') return categoryStyle('行业');
  if (category === 'paper') return categoryStyle('论文');
  if (category === 'tip') return categoryStyle('技巧');
  return categoryStyle('精选');
};

const totalItems = (sections: AiDailySection[]) => sections.reduce((sum, section) => sum + (section.items?.length || 0), 0);

const fallbackMonths = (daily: AiDailyPayload): AiDailyIndex => {
  const month = daily.date?.slice(0, 7) || new Date().toISOString().slice(0, 7);
  const [year, mon] = month.split('-');
  return {
    total: 1,
    months: [{ month, label: `${year} 年 ${Number(mon)} 月`, count: 1, days: [{ date: daily.date, label: daily.date?.slice(5) || '今日', path: '/data/ai-daily.json' }] }],
  };
};

const SelectedItemCard: React.FC<{ item: AiSelectedItem; index: number; featured?: boolean }> = ({ item, index, featured }) => (
  <a
    href={item.url}
    target="_blank"
    rel="noreferrer"
    className={`group block h-full rounded-3xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm hover:-translate-y-1 hover:border-primary-200 dark:hover:border-primary-700 hover:shadow-xl hover:shadow-slate-200/70 dark:hover:shadow-black/20 transition-all ${featured ? 'lg:col-span-2' : ''}`}
  >
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-center gap-2">
        <span className={`px-2.5 py-1 rounded-full border text-xs font-bold ${selectedCategoryBadge(item.category)}`}>{selectedCategoryName(item.category)}</span>
        <span className="text-xs font-bold text-slate-400">#{index + 1}</span>
      </div>
      <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">{formatRelativeTime(item.publishedAt)}</span>
    </div>
    <h3 className={`font-bold text-slate-900 dark:text-white leading-snug group-hover:text-primary-600 dark:group-hover:text-primary-300 transition-colors ${featured ? 'text-2xl' : 'text-lg'}`}>{item.title}</h3>
    {item.summary && <p className={`mt-3 text-slate-600 dark:text-slate-300 leading-7 ${featured ? 'line-clamp-4' : 'line-clamp-3'}`}>{item.summary}</p>}
    <div className="mt-5 flex items-center justify-between gap-3 text-sm">
      <span className="min-w-0 truncate text-slate-400 dark:text-slate-500">{item.source || 'AI HOT'}</span>
      <span className="shrink-0 inline-flex items-center gap-1 font-bold text-primary-600 dark:text-primary-400">查看来源 <Icons.ExternalLink className="w-3.5 h-3.5" /></span>
    </div>
  </a>
);

const AiSelectedPanel: React.FC<{ selected: AiSelectedPayload | null; loading: boolean; error: string | null }> = ({ selected, loading, error }) => {
  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);

  const activeCategory = useMemo(() => selected?.categories?.find((cat) => cat.key === activeTab), [selected, activeTab]);
  const items = activeCategory?.items || selected?.items || [];
  const totalPages = Math.max(1, Math.ceil(items.length / SELECTED_PAGE_SIZE));
  const pagedItems = items.slice((page - 1) * SELECTED_PAGE_SIZE, page * SELECTED_PAGE_SIZE);

  useEffect(() => { setPage(1); }, [activeTab]);

  return (
    <section id="ai-selected" className="relative overflow-hidden bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
      <div className="absolute inset-0 pointer-events-none opacity-70 dark:opacity-25" style={{ backgroundImage: 'radial-gradient(circle at 12% 18%, rgba(14,165,233,.13), transparent 24%), radial-gradient(circle at 88% 30%, rgba(99,102,241,.12), transparent 28%), linear-gradient(180deg, rgba(255,255,255,.7), transparent)' }} />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 十四期首屏瘦身：砍开场三连（徽章+5xl 大标题+介绍段——与 hero 自我重复）、
            2 张统计卡（数字 hero 已有）、featured 大卡区（与 hero 右栏实时榜同源重复）。
            面板头只剩一行标题 + 紧凑 tab，内容网格直入眼帘。 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
            <Icons.Sparkles className="w-4 h-4 text-primary-500" /> 实时精选
            <span className="text-sm font-semibold text-slate-400">{selected?.total || 0} 条在池</span>
          </h2>
          <span className="text-xs text-slate-400">{formatTime(selected?.fetchedAt)} 更新</span>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {SELECTED_TABS.map((tab) => {
            const count = selected?.categories?.find((cat) => cat.key === tab.key)?.count || 0;
            const active = activeTab === tab.key;
            return (
              <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm border transition-all ${active ? 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-200 dark:border-cyan-700 font-bold shadow-sm' : 'bg-white/70 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-cyan-200 dark:hover:border-cyan-700 font-medium'}`}>
                {tab.label}
                <span className={`text-xs ${active ? 'text-cyan-500 dark:text-cyan-300' : 'text-slate-400'}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {loading && <div className="py-12 text-center text-slate-500 dark:text-slate-400"><Icons.RefreshCw className="w-7 h-7 animate-spin mx-auto mb-3 text-primary-500" />正在加载精选内容...</div>}
        {error && !loading && <div className="mt-6 rounded-3xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 p-5 text-amber-700 dark:text-amber-300">{error}</div>}
        {!loading && !error && (
          <>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
              {pagedItems.map((item, index) => <SelectedItemCard key={`${activeTab}-${item.id || item.url}`} item={item} index={(page - 1) * SELECTED_PAGE_SIZE + index} />)}
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 disabled:opacity-40">上一页</button>
              <span className="rounded-xl bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-700 px-4 py-2 text-sm font-bold text-cyan-700 dark:text-cyan-200 shadow-sm">{page} / {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 disabled:opacity-40">下一页</button>
            </div>
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
  // 十五期：支持 ?p= 归档深链——归档页的日期按钮跳 #/ai-daily?p=<encoded path>
  const initialPath = useMemo(() => {
    const match = window.location.hash.match(/[?&]p=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : '/data/ai-daily.json';
  }, []);
  const [selectedPath, setSelectedPath] = useState(initialPath);
  // 十五期：时间轴按月折叠——默认只展开最新一个月，避免月份数增长后无限长
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
    return () => { mounted = false; };
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
    return () => { mounted = false; };
  }, []);

  const totalPages = daily ? Math.max(1, Math.ceil(daily.sections.length / SECTIONS_PER_PAGE)) : 1;
  const pagedSections = useMemo(() => {
    if (!daily) return [];
    const start = (currentPage - 1) * SECTIONS_PER_PAGE;
    return daily.sections.slice(start, start + SECTIONS_PER_PAGE);
  }, [daily, currentPage]);

  // 索引到达后默认展开最新一个月（只此一个，其余折叠）
  useEffect(() => {
    if (archiveIndex?.months?.length) {
      setOpenMonths({ [archiveIndex.months[0].month]: true });
    }
  }, [archiveIndex]);

  const goPage = (page: number) => {
    const next = Math.min(Math.max(page, 1), totalPages);
    setCurrentPage(next);
    window.requestAnimationFrame(() => {
      document.getElementById('ai-daily-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Icons.RefreshCw className="w-8 h-8 text-primary-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400">正在加载 AI 日报...</p>
        </div>
      </div>
    );
  }

  if (error || !daily) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-4">
        <div className="max-w-md bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl p-8 text-center shadow-sm">
          <Icons.Bell className="w-10 h-10 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">AI日报暂时不可用</h1>
          <p className="text-slate-500 dark:text-slate-400">{error || '请稍后刷新页面。'}</p>
        </div>
      </div>
    );
  }

  const months = archiveIndex?.months?.length ? archiveIndex.months : fallbackMonths(daily).months;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-cyan-50/70 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 border-b border-slate-100 dark:border-slate-800">
        <div className="absolute inset-0 opacity-60 dark:opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 15% 20%, rgba(14,165,233,.16), transparent 28%), radial-gradient(circle at 85% 10%, rgba(99,102,241,.14), transparent 24%)' }} />
        {/* 十五期：左右双栏砍成单列紧凑头——原左栏文字少显得空洞、右栏"实时榜"
            与下方精选网格是同一批数据的重复子集，整块删除。精选面板直接承接为首屏主体。 */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <div className="inline-flex w-fit items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                实时精选 · 每 30 分钟更新 · {formatTime(selected?.fetchedAt || daily.fetchedAt)}
              </div>
              <h1 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
                AI日报<span className="text-primary-500"> · 实时热点精选</span>
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                与 AI HOT 对齐的实时精选流（{selected?.total || 0} 条在池），下方保留每日成稿简报与历史归档。
              </p>
            </div>
            <div className="text-sm font-semibold text-slate-500 dark:text-slate-400 shrink-0">
              {formatDate(daily.date)} · {totalItems(daily.sections)} 条简报
            </div>
          </div>
        </div>
      </section>

      <AiSelectedPanel selected={selected} loading={selectedLoading} error={selectedError} />

      <main id="daily-brief" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 scroll-mt-24">
        {/* 十四期瘦身：开场三连砍成一行标题（介绍与 hero 重复）；"当前简报"卡并入副句 */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              <Icons.BookOpen className="w-5 h-5 text-primary-500" /> 今日简报与历史归档
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400 leading-6">收盘式回顾每日成稿；追最新动态以上方实时精选为主。</p>
          </div>
          <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">{formatDate(daily.date)} · {totalItems(daily.sections)} 条</div>
        </div>
        <div className="grid xl:grid-cols-[260px_minmax(0,1fr)_300px] lg:grid-cols-[220px_minmax(0,1fr)] gap-8 items-start">
          <aside className="hidden lg:block sticky top-24 space-y-5">
            <div className="rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white mb-5">
                <Icons.Clock className="w-4 h-4 text-primary-500" /> 日报时间轴
              </div>
              <div className="space-y-1">
                {months.map((month) => (
                  <div key={month.month} className="relative pl-5 border-l border-slate-200 dark:border-slate-700 last:border-transparent">
                    <span className={`absolute -left-[5px] w-2.5 h-2.5 rounded-full ring-4 top-3.5 ${openMonths[month.month] ? 'bg-primary-400 ring-primary-50 dark:ring-primary-900/30' : 'bg-slate-300 dark:bg-slate-600 ring-transparent dark:ring-transparent'}`} />
                    {/* 十五期：月份行可点折叠——月份数会一直增长，默认只展开最新一个月 */}
                    <button
                      type="button"
                      onClick={() => setOpenMonths((prev) => ({ ...prev, [month.month]: !prev[month.month] }))}
                      className="w-full flex items-center justify-between gap-3 py-3 rounded-xl px-2 -ml-1 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100">
                        <Icons.ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${openMonths[month.month] ? 'rotate-0' : '-rotate-90'}`} />
                        {month.label}
                      </div>
                      <div className="text-sm font-bold text-slate-400 dark:text-slate-500">{month.count}</div>
                    </button>
                    {openMonths[month.month] && (
                      <div className="mt-1 mb-3 space-y-1.5">
                        {(month.days || []).map((day) => (
                          <button
                            key={day.path}
                            type="button"
                            onClick={() => setSelectedPath(day.path)}
                            className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${selectedPath === day.path ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 font-bold' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/60'}`}
                          >
                            <span>{day.label}</span>
                            {selectedPath === day.path && <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setSelectedPath('/data/ai-daily.json')} className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-300">
                返回最新日报 <Icons.ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </aside>

          <div id="ai-daily-list" className="space-y-8 scroll-mt-24">
            {pagedSections.map((section, sectionIndex) => {
              const globalSectionIndex = (currentPage - 1) * SECTIONS_PER_PAGE + sectionIndex;
              const visibleItems = (section.items || []).slice(0, ITEMS_PER_SECTION);
              const hiddenCount = Math.max(0, (section.items?.length || 0) - ITEMS_PER_SECTION);
              return (
                <section id={section.label} key={section.label} className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl p-5 md:p-7 shadow-sm scroll-mt-24">
                  <div className="flex items-center justify-between gap-4 mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300 flex items-center justify-center font-bold">{globalSectionIndex + 1}</div>
                      <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{section.label}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{visibleItems.length} 条精选动态{hiddenCount > 0 ? ` · 另有 ${hiddenCount} 条进入来源池` : ''}</p>
                      </div>
                    </div>
                    <span className={`hidden sm:inline-flex px-3 py-1 rounded-full border text-xs font-bold ${categoryStyle(section.label)}`}>AI Daily</span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {visibleItems.map((item, index) => (
                      <article key={`${section.label}-${item.title}-${index}`} className="py-5 first:pt-0 last:pb-0 group">
                        <div className="flex gap-4">
                          <div className="shrink-0 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 flex items-center justify-center text-sm font-bold">{index + 1}</div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-snug group-hover:text-primary-600 dark:group-hover:text-primary-300 transition-colors">{item.title}</h3>
                            {item.summary && <p className="mt-2 text-slate-600 dark:text-slate-300 leading-7">{item.summary}</p>}
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-400 dark:text-slate-500">
                              {item.sourceName && <span className="inline-flex items-center gap-1"><Icons.Link className="w-4 h-4" />{item.sourceName}</span>}
                              {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 font-semibold hover:underline">查看来源 <Icons.ExternalLink className="w-3.5 h-3.5" /></a>}
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}

            <div className="flex flex-wrap items-center justify-center gap-2 rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
              <button type="button" onClick={() => goPage(currentPage - 1)} disabled={currentPage === 1} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">上一页</button>
              {Array.from({ length: totalPages }).map((_, index) => {
                const page = index + 1;
                return <button key={page} type="button" onClick={() => goPage(page)} className={`w-10 h-10 rounded-xl text-sm font-bold transition-colors ${page === currentPage ? 'bg-primary-500 text-white shadow-sm' : 'bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800'}`}>{page}</button>;
              })}
              <button type="button" onClick={() => goPage(currentPage + 1)} disabled={currentPage === totalPages} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">下一页</button>
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 space-y-5 lg:col-span-2 xl:col-span-1">
            <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white mb-4">
                <Icons.Tags className="w-4 h-4 text-primary-500" /> 今日目录
              </div>
              <div className="space-y-2">
                {daily.sections.map((section) => (
                  <a key={section.label} href={`#${section.label}`} className="flex items-center justify-between rounded-xl px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300">
                    <span>{section.label}</span>
                    <span className="font-bold text-slate-900 dark:text-white">{section.items?.length || 0}</span>
                  </a>
                ))}
              </div>
            </div>
            {!!daily.flashes?.length && (
              <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl p-5 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white mb-4">
                  <Icons.Bell className="w-4 h-4 text-amber-500" /> 快讯
                </div>
                <div className="space-y-3">
                  {daily.flashes.slice(0, 8).map((flash, index) => (
                    <a key={`${flash.title}-${index}`} href={flash.sourceUrl || '#'} target="_blank" rel="noreferrer" className="block text-sm leading-6 text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-300">
                      <span className="font-bold text-slate-900 dark:text-white">{flash.title}</span>
                      {flash.sourceName && <span className="text-slate-400"> · {flash.sourceName}</span>}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>

    </div>
  );
};

export default AiDaily;
