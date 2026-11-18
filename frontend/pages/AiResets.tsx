import { useEffect, useMemo, useState } from 'react';
import { Button, Card, EmptyState, StatusPill } from '../components/Shared';
import { ListSkeleton } from '../components/Skeleton';
import { Icons } from '../components/Icons';
import { AiResetsPayload, getAiResets } from '../api/aiExtras';
import { safeExternalUrl } from '../utils/urls';

const STATUS_LABELS: Record<string, { text: string; tone: 'primary' | 'amber' | 'emerald' | 'slate' }> = {
  announced: { text: '已预告', tone: 'primary' },
  in_progress: { text: '进行中', tone: 'amber' },
  confirmed: { text: '已确认', tone: 'emerald' },
  expired_unconfirmed: { text: '过期未确认', tone: 'slate' },
  likely_completed: { text: '可能已完成', tone: 'primary' },
};

const statusOf = (event: { presentationStatus?: string | null; status?: string | null }) => {
  const key = event.presentationStatus || event.status || '';
  return STATUS_LABELS[key] || { text: key || '未知', tone: 'slate' as const };
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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header className="pb-8 mb-8 border-b border-slate-200/80 dark:border-slate-800 space-y-3">
        <div className="inline-flex items-center gap-2 text-xs font-medium tracking-wider uppercase text-primary-600 dark:text-primary-400">
          <Icons.RefreshCw className="w-3.5 h-3.5" /> AIHOT &middot; 额度重置监控
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          额度重置监控
        </h1>
        <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
          跟踪 Codex / Claude / Antigravity / Grok Bot 的额度重置与重置卡发放动态，数据同步自 AIHOT 公开监控。
        </p>
      </header>

      {loading && (
        <div className="py-6">
          <ListSkeleton rows={3} />
        </div>
      )}

      {!loading && error && (
        <EmptyState
          icon={<Icons.RefreshCw className="w-5 h-5" />}
          title="数据暂时不可用"
          description={error}
          action={
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              重新加载
            </Button>
          }
        />
      )}

      {!loading && !error && payload && source && (
        <>
          <div className="flex flex-wrap items-center gap-1.5 mb-6">
            {payload.sources.map((item) => {
              const selected = item.key === source.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActive(item.key)}
                  className={`rounded-full px-3.5 py-1.5 text-xs border transition-colors cursor-pointer ${
                    selected
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100 font-semibold'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 font-medium'
                  }`}
                >
                  {item.label}
                  <span className="ml-1.5 text-[11px] opacity-65 tabular-nums">{item.count ?? item.events.length}</span>
                </button>
              );
            })}
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 tabular-nums">
              <Icons.Clock className="w-3.5 h-3.5" /> 检查于 {formatTime(source.checkedAt) || '—'}
            </span>
          </div>

          {source.events.length === 0 ? (
            <EmptyState icon={<Icons.Clock className="w-5 h-5" />} title="最近没有新的重置动态" description="稍后将随监控任务自动刷新。" />
          ) : (
            <ol className="relative space-y-3 border-l border-slate-200 dark:border-slate-800 ml-2 pl-5">
              {source.events.map((event, index) => {
                const status = statusOf(event);
                const post = event.posts?.[0];
                const eventHref = safeExternalUrl(event.url);
                return (
                  <li key={event.id || index} className="relative">
                    <span className="absolute -left-[25px] top-5 h-2.5 w-2.5 rounded-full bg-primary-500 ring-4 ring-white dark:ring-slate-950" />
                    <Card className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={status.tone} dot>
                          {status.text}
                        </StatusPill>
                        {event.displayLabel && (
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{event.displayLabel}</span>
                        )}
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                          {formatTime(event.occurredOn || event.confirmedAt || event.updatedAt)}
                        </span>
                      </div>
                      <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {event.title || '额度重置动态'}
                      </h3>
                      {post?.text && (
                        <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 leading-6 line-clamp-3">{post.text}</p>
                      )}
                      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs">
                        {post?.author && <span className="text-slate-400 dark:text-slate-500">@{post.author}</span>}
                        {eventHref && (
                          <a
                            href={eventHref}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:underline font-medium"
                          >
                            查看详情 <Icons.ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ol>
          )}

          <p className="mt-6 text-xs text-slate-400 dark:text-slate-500">
            数据来源：
            <a
              className="text-primary-600 dark:text-primary-400 hover:underline"
              href="https://aihot.news/codex-reset"
              target="_blank"
              rel="noreferrer noopener"
            >
              AIHOT 额度重置监控
            </a>
            ；状态为 AIHOT 的公开判定，仅供参考。
          </p>
        </>
      )}
    </div>
  );
}
