import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, EmptyState, StatusPill } from '../components/Shared';
import { ListSkeleton } from '../components/Skeleton';
import { Icons } from '../components/Icons';
import { AiPeriodPayload, AiPeriodReport, AiPeriodSection, getAiMonthly, getAiWeekly } from '../api/aiExtras';
import { safeExternalUrl } from '../utils/urls';

type PeriodKind = 'weekly' | 'monthly';

const ITEMS_PER_PAGE = 6;

const KIND_META: Record<
  PeriodKind,
  {
    label: string;
    title: string;
    hint: string;
    empty: string;
    tone: 'primary' | 'amber';
  }
> = {
  weekly: {
    label: '周报',
    title: 'AI 周报',
    hint: '每周重点回顾',
    empty: '本周报暂未生成',
    tone: 'primary',
  },
  monthly: {
    label: '月报',
    title: 'AI 月报',
    hint: '每月重点回顾',
    empty: '本月报暂未生成',
    tone: 'amber',
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
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) return;
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

  const aihotReportHref = safeExternalUrl(report?.links?.aihot);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header className="pb-8 mb-8 border-b border-slate-200/80 dark:border-slate-800 space-y-3">
        <div className="inline-flex items-center gap-2 text-xs font-medium tracking-wider uppercase text-primary-600 dark:text-primary-400">
          <Icons.BookOpen className="w-3.5 h-3.5" /> AIHOT &middot; 周期回顾
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          AI 周报 <span className="text-slate-300 dark:text-slate-600">/</span> 月报
        </h1>
        <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
          按周与按月汇总 AIHOT 编辑精选，分节分页阅读；每类保留最近 12 期，点期次即可回看历史回顾。
        </p>
      </header>

      {loading && (
        <div className="py-6">
          <ListSkeleton rows={3} />
        </div>
      )}

      {!loading && error && (
        <EmptyState
          icon={<Icons.BookOpen className="w-5 h-5" />}
          title="内容暂时不可用"
          description={error}
          action={
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              重新加载
            </Button>
          }
        />
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
                  className={`group rounded-xl border p-5 text-left transition-colors cursor-pointer ${
                    active
                      ? 'border-primary-400 dark:border-primary-600 bg-primary-50/40 dark:bg-primary-950/20'
                      : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <Icons.BookOpen className="w-3.5 h-3.5 text-primary-500" /> {itemMeta.hint}
                    </span>
                    {active ? (
                      <StatusPill tone={itemMeta.tone} dot>
                        当前浏览
                      </StatusPill>
                    ) : (
                      <Icons.ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:translate-x-0.5 transition-transform" />
                    )}
                  </div>
                  <div className="mt-2.5 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{itemMeta.label}</div>
                      <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {itemPayload ? `${itemPayload.latest.key} · ${formatRange(itemPayload.latest)}` : '暂无数据'}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-slate-400 tabular-nums">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {itemPayload ? `${itemPayload.issues.length} 期` : '—'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {report && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
              <aside className="order-2 lg:order-1 lg:col-span-1">
                <Card className="p-3">
                  <div className="flex items-center justify-between px-2 pb-2.5 mb-2 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500">最近 {issues.length} 期</span>
                    <Badge color={meta.tone}>{meta.label}</Badge>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 lg:block lg:max-h-[560px] lg:space-y-1 lg:overflow-y-auto lg:pb-0">
                    {issues.map((issue) => {
                      const active = issue.key === activeKey;
                      return (
                        <button
                          key={issue.key}
                          type="button"
                          onClick={() => selectIssue(issue.key)}
                          className={`w-40 shrink-0 rounded-lg px-3 py-2 text-left transition-colors lg:w-full cursor-pointer ${
                            active
                              ? 'bg-primary-50 dark:bg-primary-950/50 text-primary-700 dark:text-primary-300 font-semibold'
                              : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <div className="text-xs font-semibold">{issue.key}</div>
                          <div className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                            {issue.periodStart && issue.periodEnd ? `${issue.periodStart} ~ ${issue.periodEnd}` : '—'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </Card>
              </aside>

              <Card className="order-1 lg:order-2 lg:col-span-3 p-6 md:p-7">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                  <Badge color={meta.tone}>{report.key}</Badge>
                  {formatRange(report) && <span>{formatRange(report)}</span>}
                  {report.generatedAt && <span className="hidden sm:inline">生成于 {formatTime(report.generatedAt)}</span>}
                  {aihotReportHref && (
                    <a
                      href={aihotReportHref}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="ml-auto inline-flex items-center gap-1 font-medium text-primary-600 hover:underline dark:text-primary-400"
                    >
                      在 AIHOT 查看 <Icons.ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                {report.headline && (
                  <h2 className="mt-3 text-xl md:text-2xl font-bold leading-snug text-slate-900 dark:text-slate-100">
                    {report.headline}
                  </h2>
                )}
                {report.overview && (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-7 whitespace-pre-line">{report.overview}</p>
                )}

                {pages.length > 0 && page ? (
                  <>
                    <div className="mt-6 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-5 dark:border-slate-800">
                      {sections.map((item, index) => (
                        <button
                          key={`${item.label}-${index}`}
                          type="button"
                          onClick={() => jumpToSection(index)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                            index === page.sectionIndex
                              ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          <span className="mr-1 opacity-70 tabular-nums">{index + 1}</span>
                          {item.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-5">
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400 text-sm font-bold tabular-nums">
                          {page.sectionIndex + 1}
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{page.label}</h3>
                          {page.summary && (
                            <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">{page.summary}</p>
                          )}
                        </div>
                        <span className="ml-auto shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-300 tabular-nums">
                          {page.parts > 1 ? `${page.part}/${page.parts} 页` : `${page.items.length} 条`}
                        </span>
                      </div>

                      <ul className="mt-4 space-y-2.5">
                        {page.items.map((item, itemIndex) => {
                          const itemHref = safeExternalUrl(item.sourceUrl) || safeExternalUrl(item.aihotUrl);
                          return (
                            <li
                              key={`${item.title}-${itemIndex}`}
                              className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-4 transition-colors hover:border-slate-300 dark:hover:border-slate-700"
                            >
                              <div className="flex items-start gap-2.5">
                                <Icons.Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-500" />
                                <div className="min-w-0 flex-1">
                                  {itemHref ? (
                                    <a
                                      href={itemHref}
                                      target="_blank"
                                      rel="noreferrer noopener"
                                      className="text-sm font-semibold text-slate-900 hover:text-primary-600 dark:text-slate-100 dark:hover:text-primary-400 transition-colors"
                                    >
                                      {item.title}
                                    </a>
                                  ) : (
                                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</span>
                                  )}
                                  {item.summary && (
                                    <p className="mt-1 text-xs leading-6 text-slate-600 dark:text-slate-300">{item.summary}</p>
                                  )}
                                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                                    {item.sourceName && <span className="max-w-[22rem] truncate">{item.sourceName}</span>}
                                    {item.publishedAt && <span>{formatTime(item.publishedAt)}</span>}
                                  </div>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={safeIndex === 0}
                        onClick={() => setPageIndex(Math.max(0, safeIndex - 1))}
                      >
                        <Icons.ChevronLeft className="h-3.5 w-3.5" /> 上一页
                      </Button>
                      <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                        第 {safeIndex + 1} / {pages.length} 页 &middot; 每页最多 {ITEMS_PER_PAGE} 条
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={safeIndex >= pages.length - 1}
                        onClick={() => setPageIndex(Math.min(pages.length - 1, safeIndex + 1))}
                      >
                        下一页 <Icons.ChevronRight className="h-3.5 w-3.5" />
                      </Button>
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
                  {payload?.updatedAt && <span className="ml-2">&middot; 更新于 {formatTime(payload.updatedAt)}</span>}
                </p>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
