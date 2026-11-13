/**
 * AIHOT 扩展数据（周报 / 月报 / 热榜 / 额度重置），由服务器 cron 生成静态 JSON。
 */

export interface AiPeriodItem {
  title?: string;
  summary?: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
  aihotUrl?: string | null;
  publishedAt?: string | null;
}

export interface AiPeriodSection {
  label: string;
  summary?: string;
  items: AiPeriodItem[];
}

export interface AiPeriodReport {
  kind: 'weekly' | 'monthly';
  key: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  generatedAt?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  headline?: string | null;
  overview?: string | null;
  sections: AiPeriodSection[];
  links?: { aihot?: string | null; original?: string | null };
}

export interface AiPeriodIssue {
  key: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  generatedAt?: string | null;
  headline?: string | null;
  links?: { aihot?: string | null };
}

export interface AiPeriodPayload {
  updatedAt?: string;
  source?: string;
  sourceUrl?: string;
  latest: AiPeriodReport;
  issues: AiPeriodIssue[];
}

export interface AiHotItem {
  rank: number;
  id?: string;
  title: string;
  sourceName?: string | null;
  sourceCount?: number | null;
  signalCount?: number | null;
  participantCount?: number | null;
  latestAt?: string | null;
  aihotUrl?: string | null;
  originalUrl?: string | null;
  storyUrl?: string | null;
}

export interface AiHotPayload {
  updatedAt?: string;
  source?: string;
  sourceUrl?: string;
  count: number;
  items: AiHotItem[];
}

export interface AiResetPost {
  author?: string | null;
  publishedAt?: string | null;
  text?: string;
  url?: string | null;
}

export interface AiResetEvent {
  id?: string;
  type?: string | null;
  displayLabel?: string | null;
  status?: string | null;
  presentationStatus?: string | null;
  title?: string | null;
  scope?: string | null;
  occurredOn?: string | null;
  confirmedAt?: string | null;
  updatedAt?: string | null;
  url?: string | null;
  posts?: AiResetPost[];
}

export interface AiResetSource {
  key: string;
  label: string;
  checkedAt?: string | null;
  today?: string | null;
  count?: number | null;
  partial?: boolean;
  events: AiResetEvent[];
}

export interface AiResetsPayload {
  updatedAt?: string;
  source?: string;
  sourceUrl?: string;
  sources: AiResetSource[];
}

const getJson = async <T,>(path: string, errorMessage: string): Promise<T> => {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(errorMessage);
  }
  return response.json();
};

export const getAiWeekly = () => getJson<AiPeriodPayload>('/data/ai-weekly.json', 'AI 周报加载失败');
export const getAiMonthly = () => getJson<AiPeriodPayload>('/data/ai-monthly.json', 'AI 月报加载失败');
export const getAiHot = () => getJson<AiHotPayload>('/data/ai-hot.json', 'AIHOT 热榜加载失败');
export const getAiResets = () => getJson<AiResetsPayload>('/data/ai-resets.json', '额度重置数据加载失败');
