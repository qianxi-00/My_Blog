/**
 * 评论相关 API
 */
import api, { PaginatedResponse } from './config';

export interface Comment {
    id: number;
    article_id?: number;
    article_title?: string;  // 文章标题（兼容后台管理旧字段）
    target_type?: 'article' | 'hotspot';
    target_id?: number;
    target_title?: string;
    parent_id?: number;
    nickname: string;
    email?: string;
    avatar?: string;
    avatar_url?: string;
    content: string;
    is_admin_reply: boolean;
    admin_id?: number;
    admin_display_name?: string;
    ip_address?: string;
    status: 'pending' | 'approved' | 'rejected';
    like_count: number;
    is_reported: boolean;
    created_at: string;
    replies?: Comment[];
}

export interface CommentCreate {
    nickname?: string;
    email?: string;
    content: string;
    parent_id?: number;
}

export interface AdminReply {
    content: string;
}

export interface CommentReport {
    id: number;
    comment_id: number;
    reason: string;
    description?: string;
    status: string;
    created_at: string;
}

export interface ReportedComment {
    comment: Comment;
    reports: CommentReport[];
}

// 获取文章评论（已审核的）
export const getArticleComments = async (articleId: number): Promise<Comment[]> => {
    const response = await api.get(`/comments/article/${articleId}`);
    return response.data.comments;
};

// 提交评论
export const submitComment = async (articleId: number, data: CommentCreate): Promise<Comment> => {
    const response = await api.post(`/comments/article/${articleId}`, data);
    return response.data;
};

// 通用评论目标接口
export const getTargetComments = async (targetType: 'article' | 'hotspot', targetId: number): Promise<Comment[]> => {
    const response = await api.get(`/comments/target/${targetType}/${targetId}`);
    return response.data.comments;
};

export const submitTargetComment = async (targetType: 'article' | 'hotspot', targetId: number, data: CommentCreate): Promise<Comment> => {
    const response = await api.post(`/comments/target/${targetType}/${targetId}`, data);
    return response.data;
};

// 热点评论（真实接入热点评论链路）
export const getHotspotComments = async (targetId: number): Promise<Comment[]> => {
    const response = await api.get(`/comments/hotspot/${targetId}`);
    return response.data.comments;
};

export const submitHotspotComment = async (targetId: number, data: CommentCreate): Promise<Comment> => {
    const response = await api.post(`/comments/hotspot/${targetId}`, data);
    return response.data;
};

// 点赞评论
export const likeComment = async (commentId: number): Promise<{ message: string; like_count: number; liked: boolean }> => {
    const response = await api.post(`/comments/${commentId}/like`);
    return response.data;
};

// 获取点赞状态
export const getLikeStatus = async (commentId: number): Promise<{ liked: boolean }> => {
    const response = await api.get(`/comments/${commentId}/like-status`);
    return response.data;
};

// 举报评论
export const reportComment = async (commentId: number, data: { reason: string; description?: string }): Promise<{ message: string }> => {
    const response = await api.post(`/comments/${commentId}/report`, data);
    return response.data;
};

// 获取待审核评论
export const getPendingComments = async (params?: {
    page?: number;
    page_size?: number;
}): Promise<PaginatedResponse<Comment>> => {
    const response = await api.get('/comments/pending', { params });
    return response.data;
};

// 获取已通过评论
export const getApprovedComments = async (params?: {
    page?: number;
    page_size?: number;
}): Promise<PaginatedResponse<Comment>> => {
    const response = await api.get('/comments/approved', { params });
    return response.data;
};

// 获取被举报的评论
export const getReportedComments = async (): Promise<ReportedComment[]> => {
    const response = await api.get('/comments/reported');
    return response.data;
};

// 审核通过
export const approveComment = async (id: number): Promise<Comment> => {
    const response = await api.put(`/comments/${id}/approve`);
    return response.data;
};

// 拒绝评论
export const rejectComment = async (id: number): Promise<Comment> => {
    const response = await api.put(`/comments/${id}/reject`);
    return response.data;
};

// 驳回举报（保留评论）
export const dismissReport = async (id: number): Promise<{ message: string }> => {
    const response = await api.put(`/comments/${id}/dismiss-report`);
    return response.data;
};

// 确认举报（删除评论）
export const confirmReport = async (id: number): Promise<{ message: string }> => {
    const response = await api.put(`/comments/${id}/confirm-report`);
    return response.data;
};

// 删除评论
export const deleteComment = async (id: number): Promise<void> => {
    await api.delete(`/comments/${id}`);
};

// 管理员回复
export const adminReply = async (id: number, data: AdminReply): Promise<Comment> => {
    const response = await api.post(`/comments/${id}/reply`, data);
    return response.data;
};
