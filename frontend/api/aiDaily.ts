import api from './config';

export interface AiDailyItem {
  title: string;
  summary?: string;
  sourceUrl?: string;
  sourceName?: string;
}

export interface AiSelectedItem {
  id?: string;
  title: string;
  titleEn?: string | null;
  url: string;
  source?: string;
  publishedAt?: string;
  summary?: string | null;
  category?: string;
  score?: number;
  selected?: boolean;
}

export interface AiSelectedCategory {
  key: string;
  label: string;
  apiCategory?: string | null;
  count: number;
  hasNext?: boolean;
  nextCursor?: string | null;
  items: AiSelectedItem[];
}

export interface AiSelectedPayload {
  fetchedAt?: string;
  source?: string;
  sourceUrl?: string;
  mode?: string;
  categories: AiSelectedCategory[];
  items: AiSelectedItem[];
  total: number;
}

export interface AiDailySection {
  label: string;
  items: AiDailyItem[];
}

export interface AiDailyFlash {
  title?: string;
  summary?: string;
  sourceName?: string;
  sourceUrl?: string;
  publishedAt?: string;
}

export interface AiDailyPayload {
  date: string;
  generatedAt?: string;
  windowStart?: string;
  windowEnd?: string;
  fetchedAt?: string;
  lead?: {
    title?: string;
    leadParagraph?: string;
  } | null;
  sections: AiDailySection[];
  flashes?: AiDailyFlash[];
}

export interface AiDailyArchiveDay {
  date: string;
  label: string;
  path: string;
}

export interface AiDailyArchiveMonth {
  month: string;
  label: string;
  count: number;
  days?: AiDailyArchiveDay[];
}

export interface AiDailyIndex {
  updatedAt?: string;
  total: number;
  months: AiDailyArchiveMonth[];
}

/** 十六期：滚动 30 天内按 section.label 聚合的主题索引（fetch_ai_daily.py 每次抓取重建） */
export interface AiDailyTopicItem {
  date: string;
  title: string;
  summary?: string;
  sourceName?: string;
  sourceUrl?: string;
}

export interface AiDailyTopicGroup {
  label: string;
  count: number;
  items: AiDailyTopicItem[];
}

export interface AiDailyTopics {
  updatedAt?: string;
  total: number;
  topics: AiDailyTopicGroup[];
}

export const getAiDaily = async (path = '/data/ai-daily.json'): Promise<AiDailyPayload> => {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('AI日报数据加载失败');
  }
  return response.json();
};

export const getAiDailyIndex = async (): Promise<AiDailyIndex | null> => {
  try {
    const response = await fetch('/data/ai-daily-index.json', { cache: 'no-store' });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
};

/** 十六期：主题聚合索引（30 天滚动窗口） */
export const getAiDailyTopics = async (): Promise<AiDailyTopics | null> => {
  try {
    const response = await fetch('/data/ai-daily-topics.json', { cache: 'no-store' });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
};

export const getAiSelected = async (): Promise<AiSelectedPayload> => {
  const response = await fetch('/data/ai-selected.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('AI精选内容加载失败');
  }
  return response.json();
};

export const refreshAiDaily = async (): Promise<AiDailyPayload> => {
  const response = await api.post('/ai-daily/refresh');
  return response.data;
};
