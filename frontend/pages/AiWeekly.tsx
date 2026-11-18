import { useEffect, useMemo, useState } from 'react';
import { ListSkeleton } from '../components/Skeleton';
import { Icons } from '../components/Icons';
import { AiPeriodPayload, AiPeriodReport, AiPeriodSection, getAiMonthly, getAiWeekly } from '../api/aiExtras';

type PeriodKind = 'weekly' | 'monthly';

const ITEMS_PER_PAGE = 6;

const KIND_META: Record<
  PeriodKind,
  {
    label: string;
    title: string;
    hint: string;
    empty: string;
    activeCard: string;
    idleCard: string;
    chipActive: string;
    badge: string;
    accent: string;
    bar: string;
  }
> = {
  weekly: {
    label: '周报',
    title: 'AI 周报',
    hint: '每周重点回顾',
    empty: '本周报暂未生成',
    activeCard:
      'border-cyan-300 ring-2 ring-cyan-100 bg-gradient-to-br from-cyan-50 to-white dark:border-cyan-700 dark:ring-cyan-900/40 dark:from-cyan-900/20 dark:to-slate-900',
    idleCard: 'border-slate-200 bg-white hover:border-cyan-200 dark:border-slate-700 dark:bg-slate-800/60',
    chipActive: 'bg-cyan-600 text-white border-cyan-600 shadow-sm shadow-cyan-200/60',
    badge: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-200',
    accent: 'text-cyan-600 dark:text-cyan-300',
    bar: 'bg-cyan-500',
  },
  monthly: {
    label: '月报',
    title: 'AI 月报',
    hint: '每月重点回顾',
    empty: '本月报暂未生成',
    activeCard:
      'border-violet-300 ring-2 ring-violet-100 bg-gradient-to-br from-violet-50 to-white dark:border-violet-700 dark:ring-violet-900/40 dark:from-violet-900/20 dark:to-slate-900',
    idleCard: 'border-slate-200 bg-white hover:border-violet-200 dark:border-slate-700 dark:bg-slate-800/60',
    chipActive: 'bg-violet-600 text-white border-violet-600 shadow-sm shadow-violet-200/60',
    badge: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-200',
    accent: 'text-violet-600 dark:text-violet-300',
    bar: 'bg-violet-500',
  },
};

interface PeriodPage {
  sectionIndex: number;
  label: string;
  summary?: string;
  items: AiPeriodSection['items'];
  part: number;
  parts: number;
}

const formatRange = (report?: AiPeriodReport | null) => {
  if (!report?.periodStart || !report?.periodEnd) return '';
  return `${report.periodStart} ~ ${report.periodEnd}`;
};

const formatTime = (value?: string | null) => (value ? value.slice(0, 16).replace('T', ' ') : '—');

const buildPages = (sections: AiPeriodSection[]): PeriodPage[] => {
  const pages: PeriodPage[] = [];
  sections.forEach((section, sectionIndex) => {
    const items = section.items || [];
    const parts = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
    for (let part = 0; part < parts; part += 1) {
      pages.push({
        sectionIndex,
        label: section.label,
        summary: section.summary,
        items: items.slice(part * ITEMS_PER_PAGE, (part + 1) * ITEMS_PER_PAGE),
        part: part + 1,
        parts,
      });
    }
  });
  return pages;
};

export default function AiWeekly() {
  const [kind, setKind] = useState<PeriodKind>('weekly');
  const [payloads, setPayloads] = useState<Partial<Record<PeriodKind, AiPeriodPayload>>>({});
  const [reports, setReports] = useState<Partial<Record<string, AiPeriodReport>>>({});
  const [selected, setSelected] = useState<Record<PeriodKind, string>>({ weekly: '', monthly: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([getAiWeekly(), getAiMonthly()])
      .then(([weekly, monthly]) => {
        if (!alive) return;
        setPayloads({ weekly, monthly });
        setReports({ [weekly.latest.key]: weekly.latest, [monthly.latest.key]: monthly.latest });
        setSelected({ weekly: weekly.latest.key, monthly: monthly.latest.key });
        setError('');
      })
      .catch((err) => alive && setError(err?.message || 'AI 周报/月报加载失败'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const payload = payloads[kind];
  const activeKey = selected[kind] || payload?.latest.key || '';
  const report = useMemo(() => {
    if (!payload) return null;
    return reports[activeKey] || payload.latest;
  }, [payload, reports, activeKey]);

  const issues = useMemo(() => {
    if (!payload) return [];
    const known = new Set(payload.issues.map((issue) => issue.key));
    return known.has(payload.latest.key)
      ? payload.issues
      : [
          {
            key: payload.latest.key,
            periodStart: payload.latest.periodStart,
            periodEnd: payload.latest.periodEnd,
            headline: payload.latest.headline,
          },
          ...payload.issues,
        ];
  }, [payload]);

  const sections = report?.sections || [];
  const pages = useMemo(() => buildPages(sections), [sections]);
  const safeIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const page = pages[safeIndex];
  const meta = KIND_META[kind];

  useEffect(() => {
    setPageIndex(0);
  }, [kind, activeKey]);

  const selectIssue = async (key: string) => {
    setSelected((prev) => ({ ...prev, [kind]: key }));
    if (reports[key] || !payload) return;
    try {
      const response = await fetch(`/data/ai-${kind}/${key}.json`, { cache: 'no-store' });
      if (response.ok) {
        const data: AiPeriodReport = await response.json();
        setReports((prev) => ({ ...prev, [key]: data }));
      }
    } catch {
      /* 归档读取失败时保持当前内容 */
    }
  };

  const jumpToSection = (sectionIndex: number) => {
    const target = pages.findIndex((item) => item.sectionIndex === sectionIndex);
    if (target >= 0) setPageIndex(target);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
      <section className="relative overflow-hidden rounded-3xl border border-slate-100 dark:border-slate-700 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 p-6 md:p-8 mb-6 shadow-sm">
        <div className="absolute -top-24 right-0 w-72 h-72 rounded-full bg-indigo-200/30 blur-3xl" />
        <div className="relative max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/80 dark:bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <Icons.BookOpen className="w-3.5 h-3.5" /> AIHOT · 周期回顾
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight text-slate-900 dark:text-white">
            AI 周报 <span className="text-slate-300 dark:text-slate-600">/</span> <span className="text-violet-500">月报</span>
          </h1>
          <p className="text-sm md:text-base text-slate-600 dark:text-slate-300 leading-7">
            按周与按月汇总 AIHOT 编辑精选，分节分页阅读；每类保留最近 12 期，点期次即可回看。
          </p>
        </div>
      </section>

      {loading && (
        <div className="py-10">
          <ListSkeleton rows={3} />
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 py-16 text-center">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">内容暂时不可用</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {(Object.keys(KIND_META) as PeriodKind[]).map((item) => {
              const itemMeta = KIND_META[item];
              const itemPayload = payloads[item];
              const active = item === kind;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setKind(item)}
                  className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition-all ${active ? itemMeta.activeCard : itemMeta.idleCard}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider ${active ? itemMeta.accent : 'text-slate-400'}`}>
                      <Icons.BookOpen className="w-4 h-4" /> {itemMeta.hint}
                    </span>
                    {active ? (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${itemMeta.badge}`}>当前</span>
                    ) : (
                      <Icons.ChevronRight className="w-4 h-4 text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-slate-600" />
                    )}
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-2xl font-black text-slate-900 dark:text-white">{itemMeta.label}</div>
                      <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                        {itemPayload ? `${itemPayload.latest.key} · ${formatRange(itemPayload.latest)}` : '暂无数据'}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[11px] text-slate-400 dark:text-slate-500">
                      <div className="font-bold text-slate-500 dark:text-slate-300">{itemPayload ? `${itemPayload.issues.length} 期` : '—'}</div>
                      <div>可回看</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {report && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
              <aside className="order-2 lg:order-1 lg:col-span-1">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-3">
                  <div className="flex items-center justify-between px-1 pb-2">
                    <span className="text-xs font-bold text-slate-400 dark:text-slate-500">最近 {issues.length} 期</span>
                    <span className={`text-[11px] font-bold ${meta.accent}`}>{meta.label}</span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 lg:block lg:max-h-[560px] lg:space-y-1 lg:overflow-y-auto lg:pb-0">
                    {issues.map((issue) => {
                      const active = issue.key === activeKey;
                      return (
                        <button
                          key={issue.key}
                          type="button"
                          onClick={() => selectIssue(issue.key)}
                          className={`w-40 shrink-0 rounded-xl px-3 py-2 text-left transition-colors lg:w-full ${
                            active
                              ? `${meta.badge} font-bold`
                              : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/50'
                          }`}
                        >
                          <div className="text-sm font-semibold">{issue.key}</div>
                          <div className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                            {issue.periodStart && issue.periodEnd ? `${issue.periodStart} ~ ${issue.periodEnd}` : '—'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </aside>

              <article className="order-1 lg:order-2 lg:col-span-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-5 md:p-7">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                  <span className={`rounded-full px-2.5 py-1 font-bold ${meta.badge}`}>{report.key}</span>
                  {formatRange(report) && <span>{formatRange(report)}</span>}
                  {report.generatedAt && <span className="hidden sm:inline">生成于 {formatTime(report.generatedAt)}</span>}
                  {report.links?.aihot && (
                    <a
                      href={report.links.aihot}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="ml-auto inline-flex items-center gap-1 font-semibold text-primary-600 hover:underline dark:text-primary-400"
                    >
                      在 AIHOT 查看 <Icons.ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                {report.headline && (
                  <h2 className="mt-3 text-2xl md:text-3xl font-black leading-tight text-slate-900 dark:text-white">{report.headline}</h2>
                )}
                {report.overview && (
                  <p className="mt-3 text-sm md:text-base text-slate-600 dark:text-slate-300 leading-7 whitespace-pre-line">{report.overview}</p>
                )}

                {pages.length > 0 && page ? (
                  <>
                    <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-5 dark:border-slate-700">
                      {sections.map((item, index) => (
                        <button
                          key={`${item.label}-${index}`}
                          type="button"
                          onClick={() => jumpToSection(index)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                            index === page.sectionIndex
                              ? meta.chipActive
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500'
                          }`}
                        >
                          <span className="mr-1 opacity-70">{index + 1}</span>
                          {item.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-5">
                      <div className="flex items-start gap-3">
                        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black ${meta.badge}`}>
                          {page.sectionIndex + 1}
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-xl font-black text-slate-900 dark:text-white">{page.label}</h3>
                          {page.summary && <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{page.summary}</p>}
                        </div>
                        <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                          {page.parts > 1 ? `${page.part}/${page.parts} 页` : `${page.items.length} 条`}
                        </span>
                      </div>

                      <ul className="mt-4 space-y-3">
                        {page.items.map((item, itemIndex) => (
                          <li
                            key={`${item.title}-${itemIndex}`}
                            className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 transition-colors hover:border-slate-200 hover:bg-white dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-slate-600"
                          >
                            <div className="flex items-start gap-2.5">
                              <Icons.Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
                              <div className="min-w-0">
                                <a
                                  href={item.sourceUrl || item.aihotUrl || '#'}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="font-semibold text-slate-900 hover:text-primary-600 dark:text-white dark:hover:text-primary-400"
                                >
                                  {item.title}
                                </a>
                                {item.summary && (
                                  <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.summary}</p>
                                )}
                                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                                  {item.sourceName && <span className="max-w-[22rem] truncate">{item.sourceName}</span>}
                                  {item.publishedAt && <span>{formatTime(item.publishedAt)}</span>}
                                </div>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-700">
                      <button
                        type="button"
                        disabled={safeIndex === 0}
                        onClick={() => setPageIndex(Math.max(0, safeIndex - 1))}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                      >
                        <Icons.ChevronLeft className="h-3.5 w-3.5" /> 上一页
                      </button>
                      <div className="flex items-center gap-1.5">
                        {pages.map((_, index) => (
                          <button
                            key={index}
                            type="button"
                            aria-label={`第 ${index + 1} 页`}
                            onClick={() => setPageIndex(index)}
                            className={`h-1.5 rounded-full transition-all ${
                              index === safeIndex ? `w-6 ${meta.bar}` : 'w-1.5 bg-slate-200 dark:bg-slate-600'
                            }`}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        disabled={safeIndex >= pages.length - 1}
                        onClick={() => setPageIndex(Math.min(pages.length - 1, safeIndex + 1))}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                      >
                        下一页 <Icons.ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
                      第 {safeIndex + 1} / {pages.length} 页 · 每页最多 {ITEMS_PER_PAGE} 条
                    </div>
                  </>
                ) : (
                  <p className="mt-8 text-sm text-slate-400 dark:text-slate-500">{meta.empty}</p>
                )}

                <p className="mt-6 text-xs text-slate-400 dark:text-slate-500">
                  数据来源：
                  <a
                    className="text-primary-600 hover:underline dark:text-primary-400"
                    href="https://aihot.news/weekly"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    AIHOT
                  </a>
                  {payload?.updatedAt && <span className="ml-2">· 更新于 {formatTime(payload.updatedAt)}</span>}
                </p>
              </article>
            </div>
          )}
        </>
      )}
    </div>
  );
}
