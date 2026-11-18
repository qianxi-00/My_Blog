import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, EmptyState, StatusPill } from '../components/Shared';
import { ListSkeleton } from '../components/Skeleton';
import { Icons } from '../components/Icons';
import { getLeaderboard, LeaderboardPayload } from '../api/aiLeaderboard';
import { safeExternalUrl } from '../utils/urls';

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
  if (rank === 1) return 'bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60';
  if (rank === 2) return 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700';
  if (rank === 3) return 'bg-orange-50 text-orange-700 border border-orange-200/80 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800/60';
  return 'bg-slate-50 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400';
};

const PODIUM_TONES: Array<{ label: string; pill: 'amber' | 'slate' | 'primary' }> = [
  { label: '冠军', pill: 'amber' },
  { label: '亚军', pill: 'slate' },
  { label: '季军', pill: 'primary' },
];

const ProviderMark = ({ provider }: { provider?: string | null }) => (
  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200">
    {(provider || '?').slice(0, 1).toUpperCase()}
  </span>
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
  const sourceHref = safeExternalUrl(payload?.sourceUrl) || 'https://aihot.news/leaderboard';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header className="pb-8 mb-8 border-b border-slate-200/80 dark:border-slate-800 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-medium tracking-wider uppercase text-primary-600 dark:text-primary-400">
            <Icons.TrendingUp className="w-3.5 h-3.5" /> AIHOT &middot; 大模型排行榜
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            大模型实测榜单
          </h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
            汇总公开实测成绩，按能力维度分榜排名；价格为每百万 token 的人民币参考价，随汇率浮动。
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {payload?.run?.methodologyVersion && <span>方法学 {payload.run.methodologyVersion}</span>}
            {fx?.rate && <span>汇率 1 USD &asymp; {fx.rate} CNY（{fx.asOf || '—'}）</span>}
            <a
              className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:underline font-medium"
              href={sourceHref}
              target="_blank"
              rel="noreferrer noopener"
            >
              数据来源：AIHOT <Icons.ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 shrink-0">
          {[
            { label: '覆盖模型', value: modelCount || '—' },
            { label: '能力榜单', value: payload?.boards?.length || '—' },
            { label: '生成时间', value: fmtDate(generatedAt) },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-3 min-w-[100px]"
            >
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{stat.label}</div>
              <div className="mt-1 text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </header>

      {loading && (
        <div className="py-6">
          <ListSkeleton rows={4} />
        </div>
      )}

      {!loading && error && (
        <EmptyState
          icon={<Icons.TrendingUp className="w-5 h-5" />}
          title="榜单暂时不可用"
          description={`${error}，请稍后刷新页面。`}
          action={
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              重新加载
            </Button>
          }
        />
      )}

      {!loading && !error && payload && board && (
        <>
          <div className="flex flex-wrap items-center gap-1.5 mb-5">
            {payload.boards.map((item) => {
              const active = item.key === board.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveBoard(item.key)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  {item.name}
                  <span className="ml-1.5 text-[11px] opacity-65 tabular-nums">{item.entries.length}</span>
                </button>
              );
            })}
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 tabular-nums">
              <Icons.Clock className="w-3.5 h-3.5" /> 更新于 {fmtDate(payload.updatedAt || generatedAt)}
            </span>
          </div>

          <Card className="mb-6 px-5 py-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{board.title || board.name}</h2>
            <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">{board.focus || board.description}</p>
          </Card>

          {podium.length === 3 && (
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((idx) => {
                const row = podium[idx];
                const tone = PODIUM_TONES[idx];
                if (!row) return null;
                const modelHref = safeExternalUrl(row.model?.url);
                const docHref = safeExternalUrl(row.model?.price?.officialUrl);
                return (
                  <Card key={row.slug} className="p-5 card-lift">
                    <div className="flex items-center justify-between">
                      <StatusPill tone={tone.pill} dot>
                        TOP {row.rank}
                      </StatusPill>
                      <Badge color="slate">{tone.label}</Badge>
                    </div>

                    <div className="mt-4 flex items-baseline gap-1.5 tabular-nums">
                      <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                        {fmtScore(row.score)}
                      </span>
                      <span className="text-xs font-medium text-slate-400">分</span>
                    </div>

                    <div className="mt-2 truncate text-base font-bold text-slate-900 dark:text-slate-100">
                      {row.model?.name || row.slug}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{row.model?.provider || '—'}</div>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs tabular-nums">
                      <div className="rounded-lg bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 px-3 py-2">
                        <div className="text-[11px] text-slate-400">输入 / 百万</div>
                        <div className="mt-0.5 font-semibold text-slate-800 dark:text-slate-100">
                          {fmtPrice(row.model?.price?.inputCny)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 px-3 py-2">
                        <div className="text-[11px] text-slate-400">输出 / 百万</div>
                        <div className="mt-0.5 font-semibold text-slate-800 dark:text-slate-100">
                          {fmtPrice(row.model?.price?.outputCny)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                      <span>上下文 {fmtContext(row.model?.contextWindowTokens)}</span>
                      <span>{fmtDate(row.model?.releasedAt)}</span>
                    </div>

                    {(modelHref || docHref) && (
                      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3 text-xs">
                        {modelHref && (
                          <a
                            href={modelHref}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-1 font-medium text-primary-600 hover:underline dark:text-primary-400"
                          >
                            AIHOT <Icons.ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {docHref && (
                          <a
                            href={docHref}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-1 text-slate-500 hover:underline dark:text-slate-400"
                          >
                            官方文档 <Icons.Link className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                第 {rows.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, rows.length)} 条 &middot; 共{' '}
                {rows.length} 条
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500">按得分从高到低</div>
            </div>

            {/* 桌面表格 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                    <th className="w-16 px-4 py-3 font-medium">排名</th>
                    <th className="px-4 py-3 font-medium">模型</th>
                    <th className="w-40 px-4 py-3 text-right font-medium">得分</th>
                    <th className="w-24 px-4 py-3 text-right font-medium">上下文</th>
                    <th className="w-44 px-4 py-3 text-right font-medium">价格（¥/百万 token）</th>
                    <th className="w-28 px-4 py-3 font-medium">发布</th>
                    <th className="w-20 px-4 py-3 text-right font-medium">链接</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pageRows.map((row) => {
                    const modelHref = safeExternalUrl(row.model?.url);
                    const docHref = safeExternalUrl(row.model?.price?.officialUrl);
                    return (
                      <tr
                        key={row.slug}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular-nums ${rankTone(
                              row.rank,
                            )}`}
                          >
                            {row.rank}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <ProviderMark provider={row.model?.provider} />
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-slate-900 dark:text-slate-100">
                                {row.model?.name || row.slug}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">{row.model?.provider || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          <div className="flex items-center justify-end gap-2.5">
                            <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 xl:block">
                              <div
                                className="h-full rounded-full bg-primary-500"
                                style={{ width: `${maxScore ? Math.max(4, (row.score / maxScore) * 100) : 0}%` }}
                              />
                            </div>
                            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                              {fmtScore(row.score)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300 tabular-nums">
                          {fmtContext(row.model?.contextWindowTokens)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300 tabular-nums">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {fmtPrice(row.model?.price?.inputCny)}
                          </span>
                          <span className="mx-1 text-slate-300 dark:text-slate-600">/</span>
                          <span>{fmtPrice(row.model?.price?.outputCny)}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 tabular-nums">
                          {fmtDate(row.model?.releasedAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            {modelHref && (
                              <a
                                href={modelHref}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-slate-400 hover:text-primary-600 dark:hover:text-primary-400"
                                title="AIHOT 模型页"
                              >
                                <Icons.ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                            {docHref && (
                              <a
                                href={docHref}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-slate-400 hover:text-primary-600 dark:hover:text-primary-400"
                                title="官方文档"
                              >
                                <Icons.Link className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 移动端卡片 */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
              {pageRows.map((row) => {
                const modelHref = safeExternalUrl(row.model?.url);
                const docHref = safeExternalUrl(row.model?.price?.officialUrl);
                return (
                  <div key={row.slug} className="flex items-start gap-3 p-4">
                    <span
                      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular-nums ${rankTone(
                        row.rank,
                      )}`}
                    >
                      {row.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate font-semibold text-sm text-slate-900 dark:text-slate-100">
                          {row.model?.name || row.slug}
                        </div>
                        <div className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100 tabular-nums">
                          {fmtScore(row.score)}
                        </div>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {row.model?.provider || '—'} &middot; {fmtDate(row.model?.releasedAt)} &middot; 上下文{' '}
                        {fmtContext(row.model?.contextWindowTokens)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        价格 {fmtPrice(row.model?.price?.inputCny)} / {fmtPrice(row.model?.price?.outputCny)}（¥/百万 token）
                      </div>
                      {(modelHref || docHref) && (
                        <div className="mt-2 flex items-center gap-3 text-xs">
                          {modelHref && (
                            <a
                              href={modelHref}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400"
                            >
                              AIHOT <Icons.ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {docHref && (
                            <a
                              href={docHref}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400"
                            >
                              官方文档 <Icons.Link className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 dark:border-slate-800">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  <Icons.ChevronLeft className="h-3.5 w-3.5" /> 上一页
                </Button>
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {page} / {totalPages}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  下一页 <Icons.ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </Card>

          <p className="mt-4 text-xs leading-6 text-slate-400 dark:text-slate-500">
            数据来源：AIHOT 大模型排行榜（{payload.boards.reduce((sum, item) => sum + item.entries.length, 0)} 条分榜记录、
            {modelCount} 个模型）。排名与得分由 AIHOT 依据公开实测成绩计算，价格随汇率浮动，仅供参考。
          </p>
        </>
      )}
    </div>
  );
}
