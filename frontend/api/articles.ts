/**
 * 文章相关 API
 */
import api, { PaginatedResponse } from './config';

export interface Tag {
    id: number;
    name: string;
    slug: string;
    color?: string;
}

export interface Author {
    id: number;
    username: string;
    display_name?: string;
    avatar_url?: string;
    description?: string;
    qq?: string;
    wechat?: string;
    github?: string;
    bilibili?: string;
    email?: string;
}

export interface Article {
    id: number;
    title: string;
    slug: string;
    summary?: string;
    content_md?: string;  // 后端字段名
    content_html?: string;
    toc_html?: string;
    cover_image?: string;
    category?: string;
    author?: Author;
    status: 'draft' | 'published' | 'scheduled';
    is_pinned: boolean;
    is_published?: boolean;
    scheduled_at?: string;
    published_at?: string;
    read_time_minutes?: number;  // 修正字段名
    read_time?: number;
    view_count: number;
    like_count: number;
    comment_count?: number;
    tags: Tag[];
    created_at: string;
    updated_at?: string;
}

export interface ArticleListItem {
    id: number;
    title: string;
    slug: string;
    summary?: string;
    cover_image?: string;
    category?: string;
    author?: Author;
    status: 'draft' | 'published' | 'scheduled';
    is_pinned: boolean;
    published_at?: string;
    read_time_minutes?: number;
    view_count: number;
    like_count: number;
    comment_count?: number;
    tags: Tag[];
}

export interface ArticleCreate {
    title: string;
    slug?: string;
    summary?: string;
    content_markdown: string;  // 前端字段名，发送时转换为 content_md
    cover_image?: string;
    category?: string;
    is_pinned?: boolean;
    tags?: string[];  // 标签名数组（后端期望的格式）
}

export interface ArticleUpdate extends Partial<ArticleCreate> { }

export interface ArticlePublish {
    scheduled_at?: string;  // ISO 格式时间，如果为空则立即发布
}

export interface CategoryCount {
    category: string;
    count: number;
}

export interface ArchiveItem {
    id: number;
    title: string;
    slug: string;
    published_at: string;
}

export interface ArchiveGroup {
    year: number;
    month: number;
    articles: ArchiveItem[];
}

export interface ArticleSeriesItem {
    id: number;
    title: string;
    slug: string;
    published_at: string;
    category?: string;
}

// 获取文章列表
export const getArticles = async (params?: {
    page?: number;
    page_size?: number;
    category?: string;
    tag?: string;
    status?: string;
    search?: string;
    sort_by?: string;
    sort_order?: string;
}): Promise<PaginatedResponse<ArticleListItem>> => {
    const response = await api.get('/articles', { params });
    return response.data;
};

// 获取标签列表（仅返回有已发布文章的标签）
export const getTags = async (): Promise<Tag[]> => {
    const response = await api.get('/articles/tags');
    return response.data;
};

// 获取所有文章（不分页）
export const getAllArticles = async (): Promise<ArticleListItem[]> => {
    try {
        // 后端限制 page_size 最大为 100
        const response = await api.get('/articles', { params: { page_size: 100 } });
        // API 返回的是 PaginatedResponse，数据在 data 字段中
        return response.data.data || response.data.items || [];
    } catch {
        return [];
    }
};

// 获取单篇文章
export const getArticle = async (id: number): Promise<Article> => {
    const response = await api.get(`/articles/${id}`);
    return response.data;
};

// 获取文章（通过 slug）
export const getArticleBySlug = async (slug: string): Promise<Article> => {
    const response = await api.get(`/articles/slug/${slug}`);
    return response.data;
};

// 创建文章
export const createArticle = async (data: ArticleCreate): Promise<Article> => {
    // 转换字段名以匹配后端 API
    const payload: any = {
        title: data.title,
        summary: data.summary,
        content_md: data.content_markdown,
        cover_image: data.cover_image,
        category: data.category,
        is_pinned: data.is_pinned,
        tags: data.tags || [],  // 标签名数组
        status: 'draft',  // 默认保存为草稿
    };
    const response = await api.post('/articles', payload);
    return response.data;
};

// 更新文章
export const updateArticle = async (id: number, data: ArticleUpdate): Promise<Article> => {
    // 转换字段名以匹配后端 API
    const payload: any = {};
    if (data.title !== undefined) payload.title = data.title;
    if (data.summary !== undefined) payload.summary = data.summary;
    if (data.content_markdown !== undefined) payload.content_md = data.content_markdown;
    if (data.cover_image !== undefined) payload.cover_image = data.cover_image;
    if (data.category !== undefined) payload.category = data.category;
    if (data.is_pinned !== undefined) payload.is_pinned = data.is_pinned;
    if (data.tags !== undefined) payload.tags = data.tags;  // 标签名数组

    const response = await api.put(`/articles/${id}`, payload);
    return response.data;
};

// 更新文章发布时间
export const updateArticlePublishedAt = async (id: number, publishedAt: string): Promise<Article> => {
    const response = await api.put(`/articles/${id}`, { published_at: publishedAt });
    return response.data;
};

// 删除文章
export const deleteArticle = async (id: number): Promise<void> => {
    await api.delete(`/articles/${id}`);
};

// 发布文章
export const publishArticle = async (id: number, data?: ArticlePublish): Promise<Article> => {
    const response = await api.post(`/articles/${id}/publish`, data || {});
    return response.data;
};



// 获取分类统计
export const getCategories = async (): Promise<CategoryCount[]> => {
    const response = await api.get('/articles/categories');
    return response.data;
};

// 获取归档数据
export const getArchives = async (): Promise<ArchiveGroup[]> => {
    const response = await api.get('/articles/archives');
    return response.data;
};

// 获取同分类系列文章
export const getSeriesArticles = async (category: string): Promise<ArticleSeriesItem[]> => {
    const response = await api.get(`/articles/series/${encodeURIComponent(category)}`);
    return response.data;
};


// 点赞文章
export const likeArticle = async (articleId: number): Promise<{ message: string; like_count: number; liked: boolean }> => {
    const response = await api.post(`/articles/${articleId}/like`);
    return response.data;
};

// 获取文章点赞状态
export const getArticleLikeStatus = async (articleId: number): Promise<{ liked: boolean; like_count: number }> => {
    const response = await api.get(`/articles/${articleId}/like-status`);
    return response.data;
};

// 生成文章摘要
export const generateSummary = async (contentMd: string): Promise<{ summary: string }> => {
    const response = await api.post('/articles/generate-summary', { content_md: contentMd });
    return response.data;
};

