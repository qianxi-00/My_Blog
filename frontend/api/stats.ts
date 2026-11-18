/**
 * 统计和站点配置相关 API
 */
import api from './config';

export interface StatsOverview {
    today_views: number;
    today_visitors: number;
    total_articles: number;
    total_comments: number;
    pending_comments: number;
    today_ai_calls: number;
    total_ai_calls: number;
}

export interface DailyStat {
    date: string;
    total_views: number;
    unique_visitors: number;
    article_views: number;
    new_comments: number;
    ai_api_calls: number;
}

export interface PopularArticle {
    id: number;
    title: string;
    view_count: number;
}

export interface SiteSetting {
    id: number;
    key: string;
    value?: string;
    type: string;
    description?: string;
}

export interface ContactInfo {
    email?: string;
    github?: string;
    bilibili?: string;
    qq?: string;
    wechat?: string;
    twitter?: string;
}

export interface PublicSettings {
    site_title?: string;
    site_description?: string;
    admin_avatar?: string;
    admin_bio?: string;
    contact: ContactInfo;
}

// 记录页面访问
export const recordPageView = async (data: {
    page_path: string;
    article_id?: number;
    referer?: string;
}): Promise<void> => {
    await api.post('/stats/page-view', data);
};

// 获取统计概览（管理员）
export const getStatsOverview = async (): Promise<StatsOverview> => {
    const response = await api.get('/stats/overview');
    return response.data;
};

// 获取每日统计（管理员）
export const getDailyStats = async (days?: number): Promise<DailyStat[]> => {
    const response = await api.get('/stats/daily', { params: { days } });
    return response.data;
};

// 获取热门文章（管理员）
export const getPopularArticles = async (limit?: number): Promise<PopularArticle[]> => {
    const response = await api.get('/stats/popular-articles', { params: { limit } });
    return response.data;
};

// 获取公开站点设置
export const getPublicSettings = async (): Promise<PublicSettings> => {
    const response = await api.get('/settings/public');
    return response.data;
};

// 获取所有设置（管理员）
export const getAllSettings = async (): Promise<SiteSetting[]> => {
    const response = await api.get('/settings');
    return response.data;
};

// 更新单个设置
export const updateSetting = async (key: string, value: string): Promise<SiteSetting> => {
    const response = await api.put(`/settings/${key}`, { value });
    return response.data;
};

// 批量更新设置
export const batchUpdateSettings = async (settings: Record<string, string>): Promise<SiteSetting[]> => {
    const response = await api.put('/settings/batch', { settings });
    return response.data;
};
