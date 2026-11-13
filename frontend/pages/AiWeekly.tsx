import { useEffect, useMemo, useState } from 'react';
import { Icons } from '../components/Icons';
import { AiPeriodPayload, AiPeriodReport, getAiMonthly, getAiWeekly } from '../api/aiExtras';

type PeriodKind = 'weekly' | 'monthly';

const KIND_META: Record<PeriodKind, { label: string; title: string; hint: string; empty: string }> = {
  weekly: { label: '周报', title: 'AI 周报', hint: '每周重点回顾', empty: '本周报暂未生成' },
  monthly: { label: '月报', title: 'AI 月报', hint: '每月重点回顾', empty: '本月报暂未生成' },
};

const formatRange = (report?: AiPeriodReport | null) => {
  if (!report?.periodStart || !report?.periodEnd) return '';
  return `${report.periodStart} ~ ${report.periodEnd}`;
};

export default function AiWeekly() {
  const [kind, setKind] = useState<PeriodKind>('weekly');
  const [payloads, setPayloads] = useState<Partial<Record<PeriodKind, AiPeriodPayload>>>({});
  const [reports, setReports] = useState<Partial<Record<string, AiPeriodReport>>>({});
  const [selected, setSelected] = useState<Record<PeriodKind, string>>({ weekly: '', monthly: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
  const report = useMemo(() => {
    if (!payload) return null;
    const key = selected[kind] || payload.latest.key;
    return reports[key] || payload.latest;
  }, [payload, reports, selected, kind]);

  const issues = useMemo(() => {
    if (!payload) return [];
    const known = new Set(payload.issues.map((issue) => issue.key));
    return known.has(payload.latest.key) ? payload.issues : [{ key: payload.latest.key, periodStart: payload.latest.periodStart, periodEnd: payload.latest.periodEnd, headline: payload.latest.headline }, ...payload.issues];
  }, [payload]);

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

  const meta = KIND_META[kind];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
      <section className="relative overflow-hidden rounded-3xl border border-slate-100 dark:border-slate-700 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 p-6 md:p-8 mb-6 shadow-sm">
        <div className="absolute -top-24 right-0 w-72 h-72 rounded-full bg-indigo-200/30 blur-3xl" />
        <div className="relative max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/80 dark:bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <Icons.BookOpen className="w-3.5 h-3.5" /> AIHOT · {meta.hint}
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight text-slate-900 dark:text-white">
            {meta.title}<span className="text-primary-500">· 每周/每月</span>
          </h1>
          <p className="text-sm md:text-base text-slate-600 dark:text-slate-300 leading-7">
            按周期汇总 AIHOT 编辑精选，按主题分节阅读；点击期次可回看最近 12 期。
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(Object.keys(KIND_META) as PeriodKind[]).map((item) => {
          const active = item === kind;
          return (
            <button
              key={item}
              type="button"
              onClick={() => setKind(item)}
              className={`rounded-full px-4 py-1.5 text-sm border transition-all ${
                active
                  ? 'bg-cyan-50 text-cyan-700 border-cyan-200 font-bold dark:bg-cyan-900/30 dark:text-cyan-200 dark:border-cyan-700'
                  : 'bg-white/70 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-cyan-200'
              }`}
            >
              {KIND_META[item].label}
            </button>
          );
        })}
        {payload && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            <Icons.Clock className="w-3.5 h-3.5" /> 更新于 {payload.updatedAt ? payload.updatedAt.slice(0, 16).replace('T', ' ') : '—'}
          </span>
        )}
      </div>

      {loading && (
        <div className="py-20 text-center text-slate-500 dark:text-slate-400">
          <Icons.RefreshCw className="w-7 h-7 mx-auto mb-3 animate-spin text-primary-500" /> 正在加载...
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 py-16 text-center">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">内容暂时不可用</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
        </div>
      )}

      {!loading && !error && report && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          <aside className="lg:col-span-1 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-3 order-2 lg:order-1">
            <div className="px-2 pb-2 text-xs font-semibold text-slate-400 dark:text-slate-500">最近 {issues.length} 期</div>
            <div className="max-h-[420px] overflow-y-auto space-y-1">
              {issues.map((issue) => {
                const active = issue.key === (selected[kind] || payload?.latest.key);
                return (
                  <button
                    key={issue.key}
                    type="button"
                    onClick={() => selectIssue(issue.key)}
                    className={`w-full text-left rounded-xl px-3 py-2 transition-colors ${
                      active
                        ? 'bg-cyan-50 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-200'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <div className="text-sm font-semibold">{issue.key}</div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500">{formatRange(issue as unknown as AiPeriodReport)}</div>
                  </button>
                );
              })}
            </div>
          </aside>

          <article className="lg:col-span-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-5 md:p-7 order-1 lg:order-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
              <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-1 font-semibold text-slate-600 dark:text-slate-300">{report.key}</span>
              {formatRange(report) && <span>{formatRange(report)}</span>}
              {report.links?.aihot && (
                <a href={report.links.aihot} target="_blank" rel="noreferrer noopener" className="ml-auto inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:underline">
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

            <div className="mt-6 space-y-7">
              {report.sections.map((section, index) => (
                <section key={`${section.label}-${index}`}>
                  <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-primary-50 text-xs font-black text-primary-600 dark:bg-primary-500/15 dark:text-primary-300">{index + 1}</span>
                    {section.label}
                  </h3>
                  {section.summary && <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 leading-6">{section.summary}</p>}
                  <ul className="mt-3 space-y-3">
                    {section.items.map((item, itemIndex) => (
                      <li key={`${item.title}-${itemIndex}`} className="rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 p-3.5">
                        <div className="flex items-start gap-2">
                          <Icons.Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-primary-500" />
                          <div className="min-w-0">
                            <a
                              href={item.sourceUrl || item.aihotUrl || '#'}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="font-semibold text-slate-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400"
                            >
                              {item.title}
                            </a>
                            {item.summary && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-6">{item.summary}</p>}
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                              {item.sourceName && <span className="truncate max-w-[22rem]">{item.sourceName}</span>}
                              {item.publishedAt && <span>{item.publishedAt.slice(0, 16).replace('T', ' ')}</span>}
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            {report.sections.length === 0 && (
              <p className="mt-8 text-sm text-slate-400 dark:text-slate-500">{meta.empty}</p>
            )}

            <p className="mt-8 text-xs text-slate-400 dark:text-slate-500">
              数据来源：<a className="text-primary-600 dark:text-primary-400 hover:underline" href="https://aihot.news/weekly" target="_blank" rel="noreferrer noopener">AIHOT</a>
            </p>
          </article>
        </div>
      )}
    </div>
  );
}
