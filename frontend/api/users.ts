/**
 * 用户系统相关 API
 * 注册 / 用户资料 / 用户投稿 / 管理端审核与用户管理
 */
import api, { PaginatedResponse } from './config';

// 用户角色（token 中不携带，来自登录/注册响应或 /auth/me、/users/me）
export type Role = 'super_admin' | 'admin' | 'user';

export interface UserProfile {
    id: number;
    username: string;
    display_name?: string;
    email?: string;
    avatar_url?: string;
    bio?: string;
    role: Role;
    created_at: string;
}

export interface RegisterRequest {
    username: string;
    password: string;
    display_name?: string;
    email?: string;
}

export interface RegisterResponse {
    access_token: string;
    user: UserProfile;
}

export interface ProfileUpdate {
    display_name?: string;
    bio?: string;
    email?: string;
    avatar_url?: string;
}

export interface PasswordUpdate {
    old_password: string;
    new_password: string;
}

// 用户投稿状态
export type UserArticleStatus = 'draft' | 'pending_review' | 'rejected' | 'published';

export interface UserArticle {
    id: number;
    title: string;
    summary?: string;
    content_md?: string;
    category?: string;
    tags?: string[];
    cover_image?: string;
    status: UserArticleStatus;
    review_note?: string;
    created_at: string;
    updated_at?: string;
}

export interface UserArticleCreate {
    title: string;
    content_md: string;
    summary?: string;
    category?: string;
    tags?: string[];
    cover_image?: string;
}

// 公开作者主页
export interface PublicAuthor {
    id: number;
    username: string;
    display_name?: string;
    avatar_url?: string;
    bio?: string;
    created_at?: string;
}

export interface PublicAuthorArticle {
    id: number;
    title: string;
    summary?: string;
    category?: string;
    published_at?: string;
    cover_image?: string;
}

export interface PublicUserProfile {
    user: PublicAuthor;
    articles: PublicAuthorArticle[];
}

// 待审核文章（含作者信息）
export interface ReviewArticle extends UserArticle {
    author?: {
        username?: string;
        display_name?: string;
        avatar_url?: string;
    };
}

// 管理端用户列表项
export interface AdminUserItem extends UserProfile {
    is_active?: boolean;
}

// 注册
export const register = async (data: RegisterRequest): Promise<RegisterResponse> => {
    const response = await api.post<RegisterResponse>('/auth/register', data);
    return response.data;
};

// 获取当前用户资料
export const getCurrentUser = async (): Promise<UserProfile> => {
    const response = await api.get<UserProfile>('/users/me');
    return response.data;
};

// 更新当前用户资料
export const updateCurrentUser = async (data: ProfileUpdate): Promise<UserProfile> => {
    const response = await api.put<UserProfile>('/users/me', data);
    return response.data;
};

// 修改当前用户密码
export const updateCurrentUserPassword = async (data: PasswordUpdate): Promise<void> => {
    await api.put('/users/me/password', data);
};

// 获取公开作者主页（作者信息 + 已发布文章）
export const getPublicUser = async (username: string): Promise<PublicUserProfile> => {
    const response = await api.get<PublicUserProfile>(`/users/${encodeURIComponent(username)}`);
    return response.data;
};

// 我的文章列表（status 为空时返回全部状态）
export const getMyArticles = async (params?: {
    status?: string;
    page?: number;
    page_size?: number;
}): Promise<PaginatedResponse<UserArticle>> => {
    const response = await api.get('/users/me/articles', { params });
    return response.data;
};

// 创建投稿草稿
export const createMyArticle = async (data: UserArticleCreate): Promise<UserArticle> => {
    const response = await api.post<UserArticle>('/users/me/articles', data);
    return response.data;
};

// 编辑投稿（仅 draft/rejected 状态可修改）
export const updateMyArticle = async (id: number, data: Partial<UserArticleCreate>): Promise<UserArticle> => {
    const response = await api.put<UserArticle>(`/users/me/articles/${id}`, data);
    return response.data;
};

// 提交投稿进入待审核
export const submitMyArticle = async (id: number): Promise<UserArticle> => {
    const response = await api.post<UserArticle>(`/users/me/articles/${id}/submit`);
    return response.data;
};

// 删除投稿（非 published 状态）
export const deleteMyArticle = async (id: number): Promise<void> => {
    await api.delete(`/users/me/articles/${id}`);
};

// ===== 管理端（role=admin/super_admin）=====

// 待审核用户文章列表
export const getPendingReviewArticles = async (params?: {
    page?: number;
    page_size?: number;
}): Promise<PaginatedResponse<ReviewArticle>> => {
    const response = await api.get('/articles/review/pending', { params });
    return response.data;
};

// 审核用户文章（通过/驳回）
export const reviewArticle = async (id: number, data: {
    action: 'approve' | 'reject';
    review_note?: string;
}): Promise<UserArticle> => {
    const response = await api.put<UserArticle>(`/articles/${id}/review`, data);
    return response.data;
};

// 用户管理列表
export const getAdminUsers = async (params?: {
    search?: string;
    page?: number;
    page_size?: number;
}): Promise<PaginatedResponse<AdminUserItem>> => {
    const response = await api.get('/admins/users', { params });
    return response.data;
};

// 封禁用户（后端返回 {"message": "已封禁"}，不返回用户对象）
export const banUser = async (id: number): Promise<{ message: string }> => {
    const response = await api.put(`/admins/users/${id}/ban`);
    return response.data;
};

// 解封用户（后端返回 {"message": "已解封"}）
export const unbanUser = async (id: number): Promise<{ message: string }> => {
    const response = await api.put(`/admins/users/${id}/unban`);
    return response.data;
};
