import { useEffect, useState } from 'react';
import { Icons } from './Icons';
import { AiHotItem, getAiHot } from '../api/aiExtras';

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
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
          <Icons.TrendingUp className="w-4 h-4 text-primary-500" /> AIHOT 热榜 · 实时 Top10
        </h2>
        <span className="text-xs text-slate-400 dark:text-slate-500">按多源信号聚合，非本站文章</span>
        <a
          href="https://aihot.news/hot"
          target="_blank"
          rel="noreferrer noopener"
          className="ml-auto inline-flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:underline"
        >
          查看 AIHOT <Icons.ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
        {items.map((item) => (
          <li key={item.id || item.rank} className="flex items-start gap-2.5 py-1.5 border-b border-slate-50 dark:border-slate-700/50 last:border-0">
            <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-black ${item.rank <= 3 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'}`}>
              {item.rank}
            </span>
            <div className="min-w-0">
              <a
                href={item.storyUrl || item.aihotUrl || item.originalUrl || '#'}
                target="_blank"
                rel="noreferrer noopener"
                className="text-sm font-medium text-slate-800 dark:text-slate-100 hover:text-primary-600 dark:hover:text-primary-400 line-clamp-2"
              >
                {item.title}
              </a>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                {item.sourceCount != null && <span>{item.sourceCount} 个来源</span>}
                {item.signalCount != null && <span>{item.signalCount} 条信号</span>}
                {item.latestAt && <span>{formatTime(item.latestAt)}</span>}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
