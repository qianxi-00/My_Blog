import { useEffect, useMemo, useState } from 'react';
import { Icons } from '../components/Icons';
import { AiResetsPayload, getAiResets } from '../api/aiExtras';

const STATUS_LABELS: Record<string, { text: string; tone: string }> = {
  announced: { text: '已预告', tone: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  in_progress: { text: '进行中', tone: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  confirmed: { text: '已确认', tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  expired_unconfirmed: { text: '过期未确认', tone: 'bg-slate-100 text-slate-600 dark:bg-slate-600/30 dark:text-slate-300' },
  likely_completed: { text: '可能已完成', tone: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
};

const statusOf = (event: { presentationStatus?: string | null; status?: string | null }) => {
  const key = event.presentationStatus || event.status || '';
  return STATUS_LABELS[key] || { text: key || '未知', tone: 'bg-slate-100 text-slate-600 dark:bg-slate-600/30 dark:text-slate-300' };
};

const formatTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export default function AiResets() {
  const [payload, setPayload] = useState<AiResetsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState('codex');

  useEffect(() => {
    let alive = true;
    getAiResets()
      .then((data) => {
        if (!alive) return;
        setPayload(data);
        setError('');
        if (data.sources?.length && !data.sources.some((source) => source.key === active)) {
          setActive(data.sources[0].key);
        }
      })
      .catch((err) => alive && setError(err?.message || '额度重置数据加载失败'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const source = useMemo(() => {
    if (!payload?.sources?.length) return null;
    return payload.sources.find((item) => item.key === active) || payload.sources[0];
  }, [payload, active]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
      <section className="relative overflow-hidden rounded-3xl border border-slate-100 dark:border-slate-700 bg-gradient-to-br from-amber-50 via-white to-rose-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 p-6 md:p-8 mb-6 shadow-sm">
        <div className="absolute -top-24 right-0 w-72 h-72 rounded-full bg-amber-200/30 blur-3xl" />
        <div className="relative max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/80 dark:bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <Icons.RefreshCw className="w-3.5 h-3.5" /> AIHOT · 额度重置监控
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight text-slate-900 dark:text-white">
            额度重置<span className="text-primary-500">监控</span>
          </h1>
          <p className="text-sm md:text-base text-slate-600 dark:text-slate-300 leading-7">
            跟踪 Codex / Claude / Antigravity / Grok Bot 的额度重置与重置卡发放动态，数据来自 AIHOT 的公开监控。
          </p>
        </div>
      </section>

      {loading && (
        <div className="py-20 text-center text-slate-500 dark:text-slate-400">
          <Icons.RefreshCw className="w-7 h-7 mx-auto mb-3 animate-spin text-primary-500" /> 正在加载...
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 py-16 text-center">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">数据暂时不可用</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
        </div>
      )}

      {!loading && !error && payload && source && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {payload.sources.map((item) => {
              const selected = item.key === source.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActive(item.key)}
                  className={`rounded-full px-4 py-1.5 text-sm border transition-all ${
                    selected
                      ? 'bg-cyan-50 text-cyan-700 border-cyan-200 font-bold dark:bg-cyan-900/30 dark:text-cyan-200 dark:border-cyan-700'
                      : 'bg-white/70 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-cyan-200'
                  }`}
                >
                  {item.label}
                  <span className="ml-1.5 text-xs opacity-60">{item.count ?? item.events.length}</span>
                </button>
              );
            })}
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
              <Icons.Clock className="w-3.5 h-3.5" /> 检查于 {formatTime(source.checkedAt) || '—'}
            </span>
          </div>

          {source.events.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 py-16 text-center text-sm text-slate-500 dark:text-slate-400">
              最近没有新的重置动态。
            </div>
          ) : (
            <ol className="relative space-y-3 border-l border-slate-200 dark:border-slate-700 ml-2 pl-5">
              {source.events.map((event, index) => {
                const status = statusOf(event);
                const post = event.posts?.[0];
                return (
                  <li key={event.id || index} className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4">
                    <span className="absolute -left-[27px] top-6 h-2.5 w-2.5 rounded-full bg-primary-500 ring-4 ring-white dark:ring-slate-900" />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${status.tone}`}>{status.text}</span>
                      {event.displayLabel && <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{event.displayLabel}</span>}
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">{formatTime(event.occurredOn || event.confirmedAt || event.updatedAt)}</span>
                    </div>
                    <h3 className="mt-1.5 font-semibold text-slate-900 dark:text-white">{event.title || '额度重置动态'}</h3>
                    {post?.text && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-6 line-clamp-3">{post.text}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                      {post?.author && <span className="text-slate-400 dark:text-slate-500">@{post.author}</span>}
                      {event.url && (
                        <a href={event.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:underline">
                          查看详情 <Icons.ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <p className="mt-6 text-xs text-slate-400 dark:text-slate-500">
            数据来源：<a className="text-primary-600 dark:text-primary-400 hover:underline" href="https://aihot.news/codex-reset" target="_blank" rel="noreferrer noopener">AIHOT 额度重置监控</a>
            ；状态为 AIHOT 的公开判定，仅供参考。
          </p>
        </>
      )}
    </div>
  );
}
