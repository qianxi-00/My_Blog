/**
 * AIHOT 大模型排行榜（静态数据，服务器 cron 生成 /data/ai-leaderboard.json）。
 * AIHOT 没有公开的榜单 API，字段来自页面内嵌数据，缺失时按可选处理。
 */

export interface LeaderboardEntry {
  slug: string;
  rank: number;
  score: number;
  sourceCount?: number | null;
  coverage?: number | null;
}

export interface LeaderboardBoard {
  key: string;
  name: string;
  title?: string | null;
  focus?: string | null;
  description?: string | null;
  howToRead?: string | null;
  sourceCount?: number | null;
  operatorCount?: number | null;
  entries: LeaderboardEntry[];
}

export interface LeaderboardPrice {
  currency?: string;
  input?: number | null;
  output?: number | null;
  cached?: number | null;
  inputCny?: number | null;
  outputCny?: number | null;
  cachedCny?: number | null;
  officialUrl?: string | null;
  note?: string | null;
}

export interface LeaderboardModel {
  name: string;
  provider?: string | null;
  releasedAt?: string | null;
  contextWindowTokens?: number | null;
  price?: LeaderboardPrice;
  access?: { domestic?: boolean | null; weightsUrl?: string | null };
  url?: string | null;
}

export interface LeaderboardPayload {
  updatedAt?: string;
  source?: string;
  sourceUrl?: string;
  expiresAt?: number | null;
  run?: {
    id?: string | null;
    methodologyVersion?: string | null;
    generatedAt?: string | null;
    fx?: { rate?: number | null; asOf?: string | null; sourceName?: string | null };
  };
  boards: LeaderboardBoard[];
  models: Record<string, LeaderboardModel>;
}

export const getLeaderboard = async (): Promise<LeaderboardPayload> => {
  const response = await fetch('/data/ai-leaderboard.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('模型榜单数据加载失败');
  }
  return response.json();
};
