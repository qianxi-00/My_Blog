import { useEffect, useMemo, useState } from 'react';
import { Icons } from '../components/Icons';
import { getLeaderboard, LeaderboardPayload } from '../api/aiLeaderboard';

const fmtScore = (value?: number | null) => (typeof value === 'number' ? value.toFixed(1) : '—');

const fmtContext = (value?: number | null) => {
  if (!value) return '—';
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
  }
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
};

const fmtPrice = (value?: number | null) => {
  if (typeof value !== 'number') return '—';
  if (value === 0) return '免费';
  return `¥${value >= 10 ? value.toFixed(0) : value.toFixed(2)}`;
};

const fmtDate = (value?: string | null) => (value ? value.slice(0, 10) : '—');

const rankTone = (rank: number) => {
  if (rank === 1) return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300';
  if (rank === 2) return 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200';
  if (rank === 3) return 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300';
  return 'bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-300';
};

const ProviderMark = ({ provider }: { provider?: string | null }) => (
  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900/5 text-xs font-black text-slate-600 dark:bg-white/10 dark:text-slate-200">
    {(provider || '?').slice(0, 1).toUpperCase()}
  </span>
);

export default function Leaderboard() {
  const [payload, setPayload] = useState<LeaderboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeBoard, setActiveBoard] = useState('overall');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getLeaderboard()
      .then((data) => {
        if (!alive) return;
        setPayload(data);
        setError('');
        if (data.boards?.length && !data.boards.some((board) => board.key === activeBoard)) {
          setActiveBoard(data.boards[0].key);
        }
      })
      .catch((err) => alive && setError(err?.message || '模型榜单加载失败'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const board = useMemo(() => {
    if (!payload?.boards?.length) return null;
    return payload.boards.find((item) => item.key === activeBoard) || payload.boards[0];
  }, [payload, activeBoard]);

  const rows = useMemo(() => {
    if (!board || !payload) return [];
    return board.entries.map((entry) => ({
      ...entry,
      model: payload.models?.[entry.slug],
    }));
  }, [board, payload]);

  const generatedAt = payload?.run?.generatedAt;
  const fx = payload?.run?.fx;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
      <section className="relative overflow-hidden rounded-3xl border border-slate-100 dark:border-slate-700 bg-gradient-to-br from-slate-50 via-white to-cyan-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 p-6 md:p-8 mb-6 shadow-sm">
        <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-cyan-200/30 blur-3xl" />
        <div className="relative max-w-4xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/80 dark:bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <Icons.TrendingUp className="w-3.5 h-3.5" /> AIHOT · 大模型排行榜
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight text-slate-900 dark:text-white">
            大模型<span className="text-primary-500">实测榜单</span>
          </h1>
          <p className="text-sm md:text-base text-slate-600 dark:text-slate-300 leading-7">
            汇总公开实测成绩，按能力维度分榜排名；价格为每百万 token 的人民币参考价，随汇率浮动。
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Icons.Clock className="w-3.5 h-3.5" /> 生成于 {fmtDate(generatedAt)}
            </span>
            {payload?.run?.methodologyVersion && <span>方法学 {payload.run.methodologyVersion}</span>}
            {fx?.rate && <span>汇率 1 USD ≈ {fx.rate} CNY（{fx.asOf || '—'}）</span>}
            <a
              className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:underline"
              href={payload?.sourceUrl || 'https://aihot.news/leaderboard'}
              target="_blank"
              rel="noreferrer noopener"
            >
              数据来源：AIHOT <Icons.ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </section>

      {loading && (
        <div className="py-20 text-center text-slate-500 dark:text-slate-400">
          <Icons.RefreshCw className="w-7 h-7 mx-auto mb-3 animate-spin text-primary-500" /> 正在加载榜单...
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 py-16 text-center">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">榜单暂时不可用</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{error}，请稍后再试。</p>
        </div>
      )}

      {!loading && !error && payload && board && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {payload.boards.map((item) => {
              const active = item.key === board.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveBoard(item.key)}
                  className={`rounded-full px-4 py-1.5 text-sm border transition-all ${
                    active
                      ? 'bg-cyan-50 text-cyan-700 border-cyan-200 font-bold dark:bg-cyan-900/30 dark:text-cyan-200 dark:border-cyan-700'
                      : 'bg-white/70 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-cyan-200 dark:hover:border-cyan-700'
                  }`}
                >
                  {item.name}
                  <span className="ml-1.5 text-xs opacity-60">{item.entries.length}</span>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 overflow-hidden">
            <div className="px-4 md:px-6 py-4 border-b border-slate-100 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{board.title || board.name}</h2>
              <p className="mt-1 text-xs md:text-sm text-slate-500 dark:text-slate-400 leading-6">{board.focus || board.description}</p>
            </div>

            {/* 桌面表格 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                    <th className="px-4 py-3 font-medium w-16">排名</th>
                    <th className="px-4 py-3 font-medium">模型</th>
                    <th className="px-4 py-3 font-medium w-24 text-right">得分</th>
                    <th className="px-4 py-3 font-medium w-28 text-right">上下文</th>
                    <th className="px-4 py-3 font-medium w-40 text-right">价格（¥/百万 token）</th>
                    <th className="px-4 py-3 font-medium w-32">发布</th>
                    <th className="px-4 py-3 font-medium w-24 text-right">链接</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.slug} className="border-b border-slate-50 dark:border-slate-700/60 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/30">
                      <td className="px-4 py-3">
                        <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 text-xs font-black ${rankTone(row.rank)}`}>
                          {row.rank}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <ProviderMark provider={row.model?.provider} />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white truncate">{row.model?.name || row.slug}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">{row.model?.provider || '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 dark:text-white">{fmtScore(row.score)}</td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{fmtContext(row.model?.contextWindowTokens)}</td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                        {fmtPrice(row.model?.price?.inputCny)} / {fmtPrice(row.model?.price?.outputCny)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{fmtDate(row.model?.releasedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          {row.model?.url && (
                            <a href={row.model.url} target="_blank" rel="noreferrer noopener" className="text-slate-400 hover:text-primary-600 dark:hover:text-primary-400" title="AIHOT 模型页">
                              <Icons.ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                          {row.model?.price?.officialUrl && (
                            <a href={row.model.price.officialUrl} target="_blank" rel="noreferrer noopener" className="text-slate-400 hover:text-primary-600 dark:hover:text-primary-400" title="官方文档">
                              <Icons.Link className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 移动端卡片 */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700">
              {rows.map((row) => (
                <div key={row.slug} className="p-4 flex items-start gap-3">
                  <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 text-xs font-black ${rankTone(row.rank)}`}>
                    {row.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-slate-900 dark:text-white truncate">{row.model?.name || row.slug}</div>
                      <div className="font-mono font-bold text-slate-900 dark:text-white">{fmtScore(row.score)}</div>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {row.model?.provider || '—'} · {fmtDate(row.model?.releasedAt)} · 上下文 {fmtContext(row.model?.contextWindowTokens)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      价格 {fmtPrice(row.model?.price?.inputCny)} / {fmtPrice(row.model?.price?.outputCny)}（¥/百万 token）
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs">
                      {row.model?.url && (
                        <a href={row.model.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400">
                          AIHOT <Icons.ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {row.model?.price?.officialUrl && (
                        <a href={row.model.price.officialUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                          官方文档 <Icons.Link className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-4 text-xs text-slate-400 dark:text-slate-500 leading-6">
            数据来源：AIHOT 大模型排行榜（{payload.boards.reduce((sum, item) => sum + item.entries.length, 0)} 条分榜记录、{Object.keys(payload.models || {}).length} 个模型）。
            排名与得分由 AIHOT 依据公开实测成绩计算，本站仅展示并外链原始页面；价格随汇率浮动，仅供参考。
          </p>
        </>
      )}
    </div>
  );
}
