import { useEffect, useMemo, useState } from 'react';
import { ListSkeleton } from '../components/Skeleton';
import { Icons } from '../components/Icons';
import { getLeaderboard, LeaderboardPayload } from '../api/aiLeaderboard';

const PAGE_SIZE = 20;

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

const PODIUM = [
  {
    label: '冠军',
    card: 'border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-white dark:border-amber-700/50 dark:from-amber-900/20 dark:via-slate-900 dark:to-slate-900',
    badge: 'bg-gradient-to-br from-amber-400 to-amber-500 text-white',
    accent: 'text-amber-600 dark:text-amber-300',
  },
  {
    label: '亚军',
    card: 'border-slate-200 bg-gradient-to-br from-slate-100 via-white to-white dark:border-slate-600 dark:from-slate-800 dark:via-slate-900 dark:to-slate-900',
    badge: 'bg-gradient-to-br from-slate-300 to-slate-400 text-white',
    accent: 'text-slate-500 dark:text-slate-300',
  },
  {
    label: '季军',
    card: 'border-orange-200/80 bg-gradient-to-br from-orange-50 via-white to-white dark:border-orange-700/50 dark:from-orange-900/20 dark:via-slate-900 dark:to-slate-900',
    badge: 'bg-gradient-to-br from-orange-300 to-orange-400 text-white',
    accent: 'text-orange-500 dark:text-orange-300',
  },
];

const ProviderMark = ({ provider }: { provider?: string | null }) => (
  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900/5 text-xs font-black text-slate-600 dark:bg-white/10 dark:text-slate-200">
    {(provider || '?').slice(0, 1).toUpperCase()}
  </span>
);

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-xl border border-white/80 bg-white/75 px-3 py-1.5 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-800/70">
    <div className="text-sm font-black leading-5 text-slate-900 dark:text-white">{value}</div>
    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</div>
  </div>
);

export default function Leaderboard() {
  const [payload, setPayload] = useState<LeaderboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeBoard, setActiveBoard] = useState('overall');
  const [page, setPage] = useState(1);

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

  const maxScore = useMemo(() => (rows.length ? Math.max(...rows.map((row) => row.score || 0)) : 0), [rows]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const podium = rows.slice(0, 3);

  useEffect(() => {
    setPage(1);
  }, [activeBoard]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const generatedAt = payload?.run?.generatedAt;
  const fx = payload?.run?.fx;
  const modelCount = Object.keys(payload?.models || {}).length;

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
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Stat label="覆盖模型" value={modelCount || '—'} />
            <Stat label="能力榜单" value={payload?.boards?.length || '—'} />
            <Stat label="生成时间" value={fmtDate(generatedAt)} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
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
        <div className="py-10">
          <ListSkeleton rows={3} />
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
                  className={`rounded-full border px-4 py-1.5 text-sm transition-all ${
                    active
                      ? 'border-cyan-300 bg-cyan-50 font-bold text-cyan-700 ring-1 ring-cyan-200 dark:border-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-200 dark:ring-cyan-900'
                      : 'border-slate-200 bg-white/70 text-slate-600 hover:border-cyan-200 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:border-cyan-700'
                  }`}
                >
                  {item.name}
                  <span className="ml-1.5 text-xs opacity-60">{item.entries.length}</span>
                </button>
              );
            })}
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
              <Icons.Clock className="w-3.5 h-3.5" /> 更新于 {fmtDate(payload.updatedAt || generatedAt)}
            </span>
          </div>

          <div className="mb-5 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60 md:px-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{board.title || board.name}</h2>
            <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400 md:text-sm">{board.focus || board.description}</p>
          </div>

          {podium.length === 3 && (
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[1, 0, 2].map((idx, order) => {
                const row = podium[idx];
                const tone = PODIUM[idx];
                if (!row) return null;
                return (
                  <div
                    key={row.slug}
                    className={`relative overflow-hidden rounded-2xl border p-5 shadow-sm transition-transform hover:-translate-y-0.5 ${tone.card} ${order === 1 ? 'sm:-mt-2 sm:mb-2' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ${tone.badge}`}>
                        <Icons.TrendingUp className="h-3.5 w-3.5" /> TOP {row.rank}
                      </span>
                      <span className={`text-[11px] font-bold ${tone.accent}`}>{tone.label}</span>
                    </div>

                    <div className="mt-4 flex items-baseline gap-1.5">
                      <span className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">{fmtScore(row.score)}</span>
                      <span className="text-xs font-bold text-slate-400">分</span>
                    </div>

                    <div className="mt-2 truncate text-lg font-black text-slate-900 dark:text-white">{row.model?.name || row.slug}</div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{row.model?.provider || '—'}</div>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg bg-white/70 px-2.5 py-1.5 dark:bg-slate-900/50">
                        <div className="text-slate-400">输入 / 百万</div>
                        <div className="mt-0.5 font-bold text-slate-700 dark:text-slate-200">{fmtPrice(row.model?.price?.inputCny)}</div>
                      </div>
                      <div className="rounded-lg bg-white/70 px-2.5 py-1.5 dark:bg-slate-900/50">
                        <div className="text-slate-400">输出 / 百万</div>
                        <div className="mt-0.5 font-bold text-slate-700 dark:text-slate-200">{fmtPrice(row.model?.price?.outputCny)}</div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                      <span>上下文 {fmtContext(row.model?.contextWindowTokens)}</span>
                      <span>{fmtDate(row.model?.releasedAt)}</span>
                    </div>

                    <div className="mt-3 flex items-center gap-3 text-[11px]">
                      {row.model?.url && (
                        <a href={row.model.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-semibold text-primary-600 hover:underline dark:text-primary-400">
                          AIHOT <Icons.ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {row.model?.price?.officialUrl && (
                        <a href={row.model.price.officialUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-slate-500 hover:underline dark:text-slate-400">
                          官方文档 <Icons.Link className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-700 md:px-6">
              <div className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                第 {rows.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, rows.length)} 条 · 共 {rows.length} 条
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500">按得分从高到低</div>
            </div>

            {/* 桌面表格 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                    <th className="w-16 px-4 py-3 font-medium">排名</th>
                    <th className="px-4 py-3 font-medium">模型</th>
                    <th className="w-40 px-4 py-3 text-right font-medium">得分</th>
                    <th className="w-24 px-4 py-3 text-right font-medium">上下文</th>
                    <th className="w-44 px-4 py-3 text-right font-medium">价格（¥/百万 token）</th>
                    <th className="w-28 px-4 py-3 font-medium">发布</th>
                    <th className="w-24 px-4 py-3 text-right font-medium">链接</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr
                      key={row.slug}
                      className="border-b border-slate-50 transition-colors last:border-0 odd:bg-white even:bg-slate-50/40 hover:bg-cyan-50/40 dark:border-slate-700/60 dark:odd:bg-slate-800/40 dark:even:bg-slate-800/20 dark:hover:bg-slate-700/30"
                    >
                      <td className="px-4 py-3">
                        <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 text-xs font-black ${rankTone(row.rank)}`}>
                          {row.rank}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <ProviderMark provider={row.model?.provider} />
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-900 dark:text-white">{row.model?.name || row.slug}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">{row.model?.provider || '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700 xl:block">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-primary-500"
                              style={{ width: `${maxScore ? Math.max(4, (row.score / maxScore) * 100) : 0}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold text-slate-900 dark:text-white">{fmtScore(row.score)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{fmtContext(row.model?.contextWindowTokens)}</td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{fmtPrice(row.model?.price?.inputCny)}</span>
                        <span className="mx-1 text-slate-300 dark:text-slate-600">/</span>
                        <span>{fmtPrice(row.model?.price?.outputCny)}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{fmtDate(row.model?.releasedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          {row.model?.url && (
                            <a href={row.model.url} target="_blank" rel="noreferrer noopener" className="text-slate-400 hover:text-primary-600 dark:hover:text-primary-400" title="AIHOT 模型页">
                              <Icons.ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                          {row.model?.price?.officialUrl && (
                            <a href={row.model.price.officialUrl} target="_blank" rel="noreferrer noopener" className="text-slate-400 hover:text-primary-600 dark:hover:text-primary-400" title="官方文档">
                              <Icons.Link className="h-4 w-4" />
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
            <div className="divide-y divide-slate-100 dark:divide-slate-700 md:hidden">
              {pageRows.map((row) => (
                <div key={row.slug} className="flex items-start gap-3 p-4">
                  <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 text-xs font-black ${rankTone(row.rank)}`}>
                    {row.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate font-semibold text-slate-900 dark:text-white">{row.model?.name || row.slug}</div>
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
                          AIHOT <Icons.ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {row.model?.price?.officialUrl && (
                        <a href={row.model.price.officialUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                          官方文档 <Icons.Link className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 dark:border-slate-700 md:px-6">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                >
                  <Icons.ChevronLeft className="h-3.5 w-3.5" /> 上一页
                </button>
                <div className="flex items-center gap-1.5">
                  {Array.from({ length: totalPages }).map((_, index) => {
                    const pageNumber = index + 1;
                    return (
                      <button
                        key={pageNumber}
                        type="button"
                        onClick={() => setPage(pageNumber)}
                        className={`h-7 min-w-7 rounded-lg px-2 text-xs font-bold transition-colors ${
                          pageNumber === page
                            ? 'bg-cyan-600 text-white'
                            : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
                        }`}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                >
                  下一页 <Icons.ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          <p className="mt-4 text-xs leading-6 text-slate-400 dark:text-slate-500">
            数据来源：AIHOT 大模型排行榜（{payload.boards.reduce((sum, item) => sum + item.entries.length, 0)} 条分榜记录、{modelCount} 个模型）。
            排名与得分由 AIHOT 依据公开实测成绩计算，本站仅展示并外链原始页面；价格随汇率浮动，仅供参考。
          </p>
        </>
      )}
    </div>
  );
}
