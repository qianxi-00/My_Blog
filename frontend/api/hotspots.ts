import api, { PaginatedResponse } from './config';

export type HotspotStatus = 'draft' | 'published' | 'hidden';
export type HotspotSort = 'latest' | 'hottest';

export interface HotTopicListItem {
  id: number;
  topic_date: string;
  title: string;
  slug: string;
  summary?: string;
  heat_score: number;
  status: HotspotStatus;
  primary_category?: string;
  published_at?: string;
  article_id?: number;
  source_count: number;
  comment_count?: number;
  tags: string[];
  source_type?: string;
  source_types?: string[];
  source_domains?: string[];
  created_at?: string;
}

export interface HotTopicDetail extends HotTopicListItem {
  analysis_md?: string;
  key_points_json?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface HotspotUpsertPayload {
  title?: string;
  summary?: string;
  analysis_md?: string;
  status?: HotspotStatus;
  tags?: string[];
  heat_score?: number;
  primary_category?: string;
  published_at?: string;
}

export interface HotspotSourceCreateInput {
  source_type?: 'rss' | 'api' | 'manual';
  source_name: string;
  source_url: string;
  source_domain?: string;
  original_title?: string;
  published_at?: string;
  content_snippet?: string;
  quality_score?: number;
}

export interface HotspotCreatePayload {
  topic_date: string;
  title: string;
  slug: string;
  summary?: string;
  analysis_md?: string;
  key_points_json?: Record<string, unknown>;
  heat_score?: number;
  primary_category?: string;
  tag_names?: string[];
  sources?: HotspotSourceCreateInput[];
  status?: HotspotStatus;
  published_at?: string;
  auto_publish?: boolean;
  upsert_strategy?: 'error' | 'update';
}

export interface HotspotListParams {
  page?: number;
  page_size?: number;
  status?: HotspotStatus;
  search?: string;
  tag?: string;
  source?: string;
  source_type?: string;
  topic_date?: string;
  topic_date_from?: string;
  topic_date_to?: string;
  primary_category?: string;
  sort?: HotspotSort;
  admin?: boolean;
}

export const getHotspots = async (params: HotspotListParams = {}): Promise<PaginatedResponse<HotTopicListItem>> => {
  const query: Record<string, unknown> = { ...params };

  if (!params.admin && !params.status) {
    query.status = 'published';
  }

  if (params.source_type && !params.source) {
    query.source = params.source_type;
  }

  if (params.topic_date_from && !(query as any).from) {
    (query as any).from = params.topic_date_from;
  }

  if (params.topic_date_to && !(query as any).to) {
    (query as any).to = params.topic_date_to;
  }

  const response = await api.get('/hotspots', { params: query });
  return response.data;
};

export const getFeaturedHotspots = async (limit = 3): Promise<HotTopicListItem[]> => {
  try {
    const response = await api.get('/hotspots/featured', {
      params: { limit },
    });

    const payload = response.data;
    const data = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];

    return data
      .filter((item: HotTopicListItem) => item?.status === 'published')
      .slice(0, limit);
  } catch (error: any) {
    const status = error?.response?.status;
    if (status && status !== 404 && status !== 405) {
      throw error;
    }

    const fallback = await getHotspots({
      page: 1,
      page_size: Math.max(limit, 3),
      status: 'published',
      sort: 'hottest',
      admin: false,
    });

    return (fallback.data || [])
      .filter((item) => item.status === 'published')
      .sort((a, b) => Number(b.heat_score || 0) - Number(a.heat_score || 0))
      .slice(0, limit);
  }
};

export const getAdjacentPublishedHotspots = async (id: number): Promise<{ newer: HotTopicListItem | null; older: HotTopicListItem | null; orderedItems: HotTopicListItem[] }> => {
  const response = await api.get('/hotspots', {
    params: {
      page: 1,
      page_size: 100,
      status: 'published',
      admin: false,
      sort: 'latest',
    },
  });

  const payload = response.data;
  const items: HotTopicListItem[] = (Array.isArray(payload) ? payload : payload?.data || [])
    .filter((item: HotTopicListItem) => item?.status === 'published')
    .sort((a: HotTopicListItem, b: HotTopicListItem) => {
      const at = new Date(a.published_at || a.topic_date || a.created_at || 0).getTime();
      const bt = new Date(b.published_at || b.topic_date || b.created_at || 0).getTime();
      return bt - at;
    });

  const index = items.findIndex((item) => item.id === id);

  return {
    newer: index > 0 ? items[index - 1] : null,
    older: index >= 0 && index < items.length - 1 ? items[index + 1] : null,
    orderedItems: items,
  };
};

const normalizeMarkdownPayload = (value?: string) => {
  if (!value) return value;

  const hasRealLineBreaks = /\r|\n/.test(value);
  const hasEscapedLineBreaks = /\\r|\\n/.test(value);

  if (!hasRealLineBreaks && hasEscapedLineBreaks) {
    return value
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n');
  }

  return value;
};

export const getHotspotDetail = async (id: number): Promise<HotTopicDetail> => {
  const response = await api.get(`/hotspots/${id}`);
  const data = response.data as HotTopicDetail;
  return {
    ...data,
    analysis_md: normalizeMarkdownPayload(data.analysis_md),
  };
};

export const createHotspot = async (data: HotspotCreatePayload): Promise<HotTopicDetail> => {
  const payload = {
    ...data,
    tag_names: data.tag_names || [],
  };
  const response = await api.post('/hotspots', payload);
  return response.data;
};

export const updateHotspot = async (id: number, data: HotspotUpsertPayload): Promise<HotTopicDetail> => {
  const payload: Record<string, unknown> = { ...data };
  if ('tags' in payload) {
    payload.tag_names = payload.tags;
    delete payload.tags;
  }
  const response = await api.put(`/hotspots/${id}`, payload);
  return response.data;
};

export const publishHotspot = async (id: number): Promise<HotTopicDetail> => {
  const response = await api.post(`/hotspots/${id}/publish`, {});
  return response.data;
};

export const hideHotspot = async (id: number): Promise<HotTopicDetail> => {
  const response = await api.post(`/hotspots/${id}/hide`, {});
  return response.data;
};

export const deleteHotspot = async (id: number): Promise<{ message: string }> => {
  const response = await api.delete(`/hotspots/${id}`);
  return response.data;
};

export interface HotTopicSource {
  id: number;
  source_type: string;
  source_name: string;
  source_domain?: string;
  source_url: string;
  original_title?: string;
  published_at?: string;
  content_snippet?: string;
}

export const getHotspotSources = async (id: number): Promise<HotTopicSource[]> => {
  const response = await api.get(`/hotspots/${id}/sources`);
  return response.data;
};
