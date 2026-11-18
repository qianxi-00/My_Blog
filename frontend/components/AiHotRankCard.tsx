import { useEffect, useState } from 'react';
import { Icons } from './Icons';
import { AiHotItem, getAiHot } from '../api/aiExtras';
import { safeExternalUrl } from '../utils/urls';

const formatTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export default function AiHotRankCard() {
  const [items, setItems] = useState<AiHotItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getAiHot()
      .then((data) => alive && setItems(data.items || []))
      .catch(() => alive && setItems([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  if (loading || items.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5">
      <div className="flex flex-wrap items-center gap-2 pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <Icons.TrendingUp className="w-4 h-4 text-primary-500" />
          AIHOT 热榜 &middot; 实时 Top10
        </h2>
        <span className="text-xs text-slate-400 dark:text-slate-500">按多源信号聚合，非本站文章</span>
        <a
          href="https://aihot.news/hot"
          target="_blank"
          rel="noreferrer noopener"
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >
          查看 AIHOT <Icons.ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
        {items.map((item) => {
          const href = safeExternalUrl(item.storyUrl) || safeExternalUrl(item.aihotUrl) || safeExternalUrl(item.originalUrl);
          return (
            <li
              key={item.id || item.rank}
              className="flex items-start gap-2.5 py-2 border-b border-slate-100/80 dark:border-slate-800/70 last:border-b-0"
            >
              <span
                className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums ${
                  item.rank <= 3
                    ? 'bg-amber-50 text-amber-700 border border-amber-200/70 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {item.rank}
              </span>
              <div className="min-w-0 flex-1">
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-sm font-medium text-slate-800 dark:text-slate-100 hover:text-primary-600 dark:hover:text-primary-400 line-clamp-2 transition-colors"
                  >
                    {item.title}
                  </a>
                ) : (
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-2">
                    {item.title}
                  </span>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                  {item.sourceCount != null && <span>{item.sourceCount} 个来源</span>}
                  {item.signalCount != null && <span>{item.signalCount} 条信号</span>}
                  {item.latestAt && <span>{formatTime(item.latestAt)}</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
