/**
 * Prompt 相关 API
 */
import api, { PaginatedResponse } from './config';

export type PromptCategory = 'Dev' | 'Writing' | 'Business' | 'Academic' | 'Other';

export interface PromptAuthor {
    id: number;
    username: string;
    display_name?: string;
}

export interface Prompt {
    id: number;
    title: string;
    description?: string;
    content: string;
    category: PromptCategory;
    author?: PromptAuthor;
    submitted_by?: string;
    status: 'pending' | 'approved' | 'rejected';
    use_count: number;
    like_count: number;
    created_at: string;
    updated_at: string;
}

export interface PromptCreate {
    title: string;
    description?: string;
    content: string;
    category: PromptCategory;
}

export interface PromptUserSubmit {
    title: string;
    description?: string;
    content: string;
    category: PromptCategory;
    submitted_by?: string;
}

// 获取已审核的 Prompt 列表
export const getPrompts = async (params?: {
    page?: number;
    page_size?: number;
    category?: PromptCategory;
    search?: string;
}): Promise<PaginatedResponse<Prompt>> => {
    const response = await api.get('/prompts', { params });
    return response.data;
};

// 获取待审核的 Prompt
export const getPendingPrompts = async (params?: {
    page?: number;
    page_size?: number;
}): Promise<PaginatedResponse<Prompt>> => {
    const response = await api.get('/prompts/pending', { params });
    return response.data;
};

// 获取单个 Prompt
export const getPrompt = async (id: number): Promise<Prompt> => {
    const response = await api.get(`/prompts/${id}`);
    return response.data;
};

// 创建 Prompt（管理员）
export const createPrompt = async (data: PromptCreate): Promise<Prompt> => {
    const response = await api.post('/prompts', data);
    return response.data;
};

// 用户提交 Prompt
export const submitPrompt = async (data: PromptUserSubmit): Promise<Prompt> => {
    const response = await api.post('/prompts/submit', data);
    return response.data;
};

// 更新 Prompt
export const updatePrompt = async (id: number, data: Partial<PromptCreate>): Promise<Prompt> => {
    const response = await api.put(`/prompts/${id}`, data);
    return response.data;
};

// 删除 Prompt
export const deletePrompt = async (id: number): Promise<void> => {
    await api.delete(`/prompts/${id}`);
};

// 审核通过
export const approvePrompt = async (id: number): Promise<Prompt> => {
    const response = await api.put(`/prompts/${id}/approve`);
    return response.data;
};

// 拒绝 Prompt
export const rejectPrompt = async (id: number): Promise<Prompt> => {
    const response = await api.put(`/prompts/${id}/reject`);
    return response.data;
};

// 记录使用
export const recordPromptUsage = async (id: number): Promise<void> => {
    await api.post(`/prompts/${id}/use`);
};

// 点赞 Prompt
export const likePrompt = async (id: number): Promise<{ like_count: number }> => {
    const response = await api.post(`/prompts/${id}/like`);
    return response.data;
};

// 取消点赞 Prompt
export const unlikePrompt = async (id: number): Promise<{ like_count: number }> => {
    const response = await api.post(`/prompts/${id}/unlike`);
    return response.data;
};
