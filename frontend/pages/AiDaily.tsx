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
        <span className={`px-2.5 py-1 rounded-full border text-xs font-black ${selectedCategoryBadge(item.category)}`}>{selectedCategoryName(item.category)}</span>
        <span className="text-xs font-bold text-slate-400">#{index + 1}</span>
      </div>
      <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">{formatRelativeTime(item.publishedAt)}</span>
    </div>
    <h3 className={`font-black text-slate-900 dark:text-white leading-snug group-hover:text-primary-600 dark:group-hover:text-primary-300 transition-colors ${featured ? 'text-2xl' : 'text-lg'}`}>{item.title}</h3>
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
  const topItems = selected?.items?.slice(0, 3) || [];

  useEffect(() => { setPage(1); }, [activeTab]);

  return (
    <section id="ai-selected" className="relative overflow-hidden bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
      <div className="absolute inset-0 pointer-events-none opacity-70 dark:opacity-25" style={{ backgroundImage: 'radial-gradient(circle at 12% 18%, rgba(14,165,233,.13), transparent 24%), radial-gradient(circle at 88% 30%, rgba(99,102,241,.12), transparent 28%), linear-gradient(180deg, rgba(255,255,255,.7), transparent)' }} />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm font-bold text-slate-600 dark:text-slate-300 shadow-sm">
              <Icons.Sparkles className="w-4 h-4 text-primary-500" /> 精选内容 · 对齐 AI HOT 实时流
            </div>
            <h2 className="mt-4 text-3xl md:text-5xl font-black tracking-tight text-slate-900 dark:text-white">实时精选内容</h2>
            <p className="mt-4 max-w-2xl text-slate-600 dark:text-slate-300 leading-7">默认先看这里：不等“日报成稿”，每 30 分钟同步 AI HOT selected 内容池，按全部、模型、产品、行业、论文、技巧实时切换。</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-[300px]">
            <div className="rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
              <div className="text-xs text-slate-500 dark:text-slate-400">精选条目</div>
              <div className="mt-1 text-3xl font-black text-slate-900 dark:text-white">{selected?.total || 0}</div>
            </div>
            <div className="rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
              <div className="text-xs text-slate-500 dark:text-slate-400">同步时间</div>
              <div className="mt-2 text-sm font-black text-slate-900 dark:text-white">{formatTime(selected?.fetchedAt)}</div>
            </div>
          </div>
        </div>

        {!!topItems.length && (
          <div className="grid lg:grid-cols-4 gap-4 mb-8">
            {topItems.map((item, index) => <SelectedItemCard key={item.id || item.url} item={item} index={index} featured={index === 0} />)}
          </div>
        )}

        <div className="rounded-[2rem] bg-white/80 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 p-3 md:p-4 shadow-sm backdrop-blur">
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
            {SELECTED_TABS.map((tab) => {
              const count = selected?.categories?.find((cat) => cat.key === tab.key)?.count || 0;
              const active = activeTab === tab.key;
              return (
                <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`shrink-0 rounded-2xl px-4 py-3 text-left border transition-all ${active ? 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-200 dark:border-cyan-700 shadow-sm' : 'bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 border-slate-100 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800'}`}>
                  <div className="text-sm font-black">{tab.label}</div>
                  <div className={`mt-0.5 text-xs ${active ? 'text-cyan-500 dark:text-cyan-300' : 'text-slate-400'}`}>{tab.hint} · {count}</div>
                </button>
              );
            })}
          </div>
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
              <span className="rounded-xl bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-700 px-4 py-2 text-sm font-black text-cyan-700 dark:text-cyan-200 shadow-sm">{page} / {totalPages}</span>
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
  const [selectedPath, setSelectedPath] = useState('/data/ai-daily.json');

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

  const featured = useMemo(() => {
    if (!daily) return [];
    return daily.sections.flatMap((section) => (section.items || []).slice(0, 2).map((item) => ({ ...item, label: section.label }))).slice(0, 5);
  }, [daily]);

  const totalPages = daily ? Math.max(1, Math.ceil(daily.sections.length / SECTIONS_PER_PAGE)) : 1;
  const pagedSections = useMemo(() => {
    if (!daily) return [];
    const start = (currentPage - 1) * SECTIONS_PER_PAGE;
    return daily.sections.slice(start, start + SECTIONS_PER_PAGE);
  }, [daily, currentPage]);

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
          <h1 className="text-xl font-black text-slate-900 dark:text-white mb-2">AI日报暂时不可用</h1>
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
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-18">
          <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(520px,1.05fr)] gap-7 xl:gap-10 items-stretch">
            <div className="flex flex-col justify-center">
              <div className="inline-flex w-fit items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                实时精选优先 · 每 30 分钟自动更新
              </div>
              <h1 className="mt-6 text-4xl md:text-6xl font-black tracking-tight text-slate-900 dark:text-white">
                AI日报
                <span className="block mt-2 text-primary-500">实时热点精选</span>
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-300">
                页面默认展示与 AI HOT 对齐的实时精选流；下方保留每日成稿简报和历史归档，兼顾“现在发生什么”和“今天总结了什么”。
              </p>

              <div className="mt-7 grid grid-cols-3 gap-3 max-w-xl">
                <div className="rounded-2xl bg-white/85 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-4 py-3 shadow-sm">
                  <div className="text-xs text-slate-500 dark:text-slate-400">实时精选</div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">{selected?.total || 0}</div>
                </div>
                <div className="rounded-2xl bg-white/85 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-4 py-3 shadow-sm">
                  <div className="text-xs text-slate-500 dark:text-slate-400">分类入口</div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">6</div>
                </div>
                <div className="rounded-2xl bg-white/85 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-4 py-3 shadow-sm">
                  <div className="text-xs text-slate-500 dark:text-slate-400">同步时间</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">{formatTime(selected?.fetchedAt || daily.fetchedAt)}</div>
                </div>
              </div>
              <div className="mt-7 flex flex-wrap gap-3">
                <a href="#ai-selected" className="inline-flex items-center gap-2 rounded-2xl bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-700 px-5 py-3 text-sm font-black text-cyan-700 dark:text-cyan-200 shadow-sm hover:-translate-y-0.5 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 transition-all">浏览实时精选 <Icons.ArrowRight className="w-4 h-4" /></a>
                <a href="#daily-brief" className="inline-flex items-center gap-2 rounded-2xl bg-white/85 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:border-primary-200 dark:hover:border-primary-700 transition-colors">查看今日简报</a>
              </div>
            </div>

            <div className="bg-white/90 dark:bg-slate-800/85 border border-slate-200 dark:border-slate-700 rounded-3xl p-5 md:p-6 shadow-xl shadow-slate-200/60 dark:shadow-black/20 backdrop-blur self-center">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">实时榜</div>
                  <div className="text-xl font-black text-slate-900 dark:text-white">现在值得先看</div>
                </div>
                <Icons.Sparkles className="w-6 h-6 text-primary-500" />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {(selected?.items?.slice(0, 5) || []).map((item, index) => (
                  <a key={`${item.id || item.url}-${index}`} href={item.url || '#'} target="_blank" rel="noreferrer" className={`block rounded-2xl border border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 p-4 hover:border-primary-200 dark:hover:border-primary-700 hover:bg-white dark:hover:bg-slate-800 transition-colors ${index === 0 ? 'sm:col-span-2' : ''}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${selectedCategoryBadge(item.category)}`}>{selectedCategoryName(item.category)}</span>
                      <span className="text-xs text-slate-400">#{index + 1}</span>
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white line-clamp-2">{item.title}</div>
                    {item.summary && <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400 line-clamp-2">{item.summary}</p>}
                  </a>
                ))}
                {!selected?.items?.length && featured.map((item, index) => (
                  <a key={`${item.title}-${index}`} href={item.sourceUrl || '#'} target="_blank" rel="noreferrer" className={`block rounded-2xl border border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 p-4 hover:border-primary-200 dark:hover:border-primary-700 hover:bg-white dark:hover:bg-slate-800 transition-colors ${index === 0 ? 'sm:col-span-2' : ''}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${categoryStyle(item.label)}`}>{item.label}</span>
                      <span className="text-xs text-slate-400">#{index + 1}</span>
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white line-clamp-2">{item.title}</div>
                    {item.summary && <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400 line-clamp-2">{item.summary}</p>}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <AiSelectedPanel selected={selected} loading={selectedLoading} error={selectedError} />

      <main id="daily-brief" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 scroll-mt-24">
        <div className="mb-8 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm font-bold text-slate-600 dark:text-slate-300 shadow-sm">
              <Icons.BookOpen className="w-4 h-4 text-primary-500" /> 今日简报 · Daily Digest
            </div>
            <h2 className="mt-4 text-3xl md:text-4xl font-black tracking-tight text-slate-900 dark:text-white">日报成稿与历史归档</h2>
            <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-300 leading-7">这里保留 AI HOT 的每日成稿摘要，适合收盘式回顾；若要追最新动态，请以上方实时精选流为主。</p>
          </div>
          <div className="rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-5 py-4 shadow-sm">
            <div className="text-xs text-slate-500 dark:text-slate-400">当前简报</div>
            <div className="mt-1 font-black text-slate-900 dark:text-white">{formatDate(daily.date)} · {totalItems(daily.sections)} 条</div>
          </div>
        </div>
        <div className="grid xl:grid-cols-[260px_minmax(0,1fr)_300px] lg:grid-cols-[220px_minmax(0,1fr)] gap-8 items-start">
          <aside className="hidden lg:block sticky top-24 space-y-5">
            <div className="rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white mb-5">
                <Icons.Clock className="w-4 h-4 text-primary-500" /> 日报时间轴
              </div>
              <div className="space-y-1">
                {months.slice(0, 8).map((month) => (
                  <div key={month.month} className="relative pl-5 py-3 border-l border-slate-200 dark:border-slate-700 last:border-transparent">
                    <span className="absolute -left-[5px] top-5 w-2.5 h-2.5 rounded-full bg-primary-400 ring-4 ring-primary-50 dark:ring-primary-900/30" />
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-black text-slate-800 dark:text-slate-100">{month.label}</div>
                      <div className="text-sm font-bold text-slate-400 dark:text-slate-500">{month.count}</div>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {(month.days || []).slice(0, 12).map((day) => (
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
                      <div className="w-10 h-10 rounded-2xl bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300 flex items-center justify-center font-black">{globalSectionIndex + 1}</div>
                      <div>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white">{section.label}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{visibleItems.length} 条精选动态{hiddenCount > 0 ? ` · 另有 ${hiddenCount} 条进入来源池` : ''}</p>
                      </div>
                    </div>
                    <span className={`hidden sm:inline-flex px-3 py-1 rounded-full border text-xs font-bold ${categoryStyle(section.label)}`}>AI Daily</span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {visibleItems.map((item, index) => (
                      <article key={`${section.label}-${item.title}-${index}`} className="py-5 first:pt-0 last:pb-0 group">
                        <div className="flex gap-4">
                          <div className="shrink-0 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 flex items-center justify-center text-sm font-black">{index + 1}</div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-lg font-black text-slate-900 dark:text-white leading-snug group-hover:text-primary-600 dark:group-hover:text-primary-300 transition-colors">{item.title}</h3>
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
                return <button key={page} type="button" onClick={() => goPage(page)} className={`w-10 h-10 rounded-xl text-sm font-black transition-colors ${page === currentPage ? 'bg-primary-500 text-white shadow-sm' : 'bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800'}`}>{page}</button>;
              })}
              <button type="button" onClick={() => goPage(currentPage + 1)} disabled={currentPage === totalPages} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">下一页</button>
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 space-y-5 lg:col-span-2 xl:col-span-1">
            <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white mb-4">
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
                <div className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white mb-4">
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
