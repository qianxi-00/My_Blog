/**
 * 论坛相关 API
 */
import api, { PaginatedResponse } from './config';

export interface ForumCategory {
  id: number;
  name: string;
  slug?: string | null;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  is_default?: boolean;
  sort_order?: number;
  is_active?: boolean;
  thread_count?: number;
}

export interface ForumCategoryCreateBody {
  name: string;
  slug?: string;
  description?: string;
  icon?: string;
  color?: string;
  is_default?: boolean;
  sort_order?: number;
}

export interface ForumCategoryUpdateBody extends Partial<ForumCategoryCreateBody> {
  is_active?: boolean;
}

export interface ForumThreadListItem {
  id: number;
  category_id: number;
  category_name?: string | null;
  category_slug?: string | null;

  title: string;

  reply_count: number;
  view_count: number;
  like_count?: number;
  viewer_liked?: boolean;

  is_pinned?: boolean;
  is_locked?: boolean;
  is_featured?: boolean;
  is_solved?: boolean;
  is_hidden?: boolean;
  accepted_post_id?: number | null;

  last_post_at?: string | null;

  user_id?: number | null;
  username?: string | null;
  author_nickname: string;
  author_display_name?: string | null;
  author_avatar?: string | null;
  author_role?: string | null;

  edited_at?: string | null;
  created_at: string;
}

export interface ForumThreadDetail {
  id: number;
  category_id: number;
  category_name?: string | null;
  category_slug?: string | null;

  title: string;

  reply_count: number;
  view_count: number;
  like_count: number;
  viewer_liked?: boolean;

  is_pinned: boolean;
  is_locked: boolean;
  is_featured?: boolean;
  is_solved?: boolean;
  is_hidden?: boolean;
  accepted_post_id?: number | null;
  is_reported?: boolean;
  report_count?: number;

  last_post_at?: string | null;

  user_id?: number | null;
  username?: string | null;
  author_nickname: string;
  author_display_name?: string | null;
  author_avatar?: string | null;
  author_role?: string | null;

  edited_at?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface ForumPost {
  id: number;
  thread_id: number;
  parent_id?: number | null;
  floor: number;

  user_id?: number | null;
  username?: string | null;
  nickname: string;
  author_display_name?: string | null;
  author_avatar?: string | null;
  author_role?: string | null;
  content: string;

  is_admin_post: boolean;
  admin_display_name?: string | null;
  like_count?: number;
  viewer_liked?: boolean;
  is_hidden?: boolean;
  is_reported?: boolean;
  report_count?: number;

  edited_at?: string | null;
  created_at: string;
}

export interface ForumCreateThreadBody {
  category_id: number;
  title: string;
  content: string;
  nickname?: string;
  email?: string;
  honeypot?: string;
}

export interface ForumReplyThreadBody {
  content: string;
  nickname?: string;
  email?: string;
  parent_id?: number;
  honeypot?: string;
}

export interface ForumThreadUpdateBody {
  title?: string;
  category_id?: number;
  content?: string;
  is_pinned?: boolean;
  is_locked?: boolean;
  is_featured?: boolean;
  is_hidden?: boolean;
}

export interface ForumReportItem {
  id: number;
  target_type: string;
  target_id: number;
  user_id?: number | null;
  reason: string;
  description?: string | null;
  status: string;
  created_at: string;
}

export interface ForumReportedTarget {
  target_type: 'thread' | 'post';
  target_id: number;
  thread_id: number;
  thread_title: string;
  floor?: number | null;
  author_name: string;
  content_preview: string;
  is_hidden: boolean;
  report_count: number;
  reports: ForumReportItem[];
}

export type ForumSortMode = 'latest_activity' | 'latest' | 'hottest' | 'most_replies';
export type ForumSolvedFilter = 'all' | 'solved' | 'unsolved';

export const getForumCategories = async (includeInactive = false): Promise<ForumCategory[]> => {
  const res = await api.get('/forum/categories', {
    params: includeInactive ? { include_inactive: true } : undefined,
  });
  return res.data;
};

export const createForumCategory = async (body: ForumCategoryCreateBody): Promise<ForumCategory> => {
  const res = await api.post('/forum/categories', body);
  return res.data;
};

export const updateForumCategory = async (categoryId: number, body: ForumCategoryUpdateBody): Promise<ForumCategory> => {
  const res = await api.put(`/forum/categories/${categoryId}`, body);
  return res.data;
};

export const deleteForumCategory = async (categoryId: number): Promise<{ message: string }> => {
  const res = await api.delete(`/forum/categories/${categoryId}`);
  return res.data;
};

export const getForumThreads = async (params?: {
  page?: number;
  page_size?: number;
  category_id?: number;
  q?: string;
  sort?: ForumSortMode;
  solved?: ForumSolvedFilter;
  featured?: boolean;
}): Promise<PaginatedResponse<ForumThreadListItem>> => {
  const res = await api.get('/forum/threads', { params });
  return res.data;
};

export const createForumThread = async (body: ForumCreateThreadBody): Promise<ForumThreadDetail> => {
  const res = await api.post('/forum/threads', body);
  return res.data;
};

export const getForumThread = async (threadId: number): Promise<ForumThreadDetail> => {
  const res = await api.get(`/forum/threads/${threadId}`);
  return res.data;
};

export const updateForumThread = async (
  threadId: number,
  body: ForumThreadUpdateBody
): Promise<ForumThreadDetail> => {
  const res = await api.put(`/forum/threads/${threadId}`, body);
  return res.data;
};

export const deleteForumThread = async (threadId: number): Promise<{ message: string }> => {
  const res = await api.delete(`/forum/threads/${threadId}`);
  return res.data;
};

export const toggleThreadHidden = async (
  threadId: number,
  isHidden: boolean
): Promise<{ message: string; is_hidden: boolean }> => {
  const res = await api.put(`/forum/threads/${threadId}/hide`, { is_hidden: isHidden });
  return res.data;
};

export const toggleThreadLike = async (
  threadId: number
): Promise<{ liked: boolean; like_count: number }> => {
  const res = await api.post(`/forum/threads/${threadId}/like`);
  return res.data;
};

export const acceptBestAnswer = async (
  threadId: number,
  postId: number | null
): Promise<{ thread_id: number; is_solved: boolean; accepted_post_id: number | null }> => {
  const res = await api.post(`/forum/threads/${threadId}/accept-post`, { post_id: postId });
  return res.data;
};

export const reportForumThread = async (
  threadId: number,
  body: { reason: string; description?: string }
): Promise<{ message: string }> => {
  const res = await api.post(`/forum/threads/${threadId}/report`, body);
  return res.data;
};

export const getForumThreadPosts = async (
  threadId: number,
  params?: { page?: number; page_size?: number }
): Promise<PaginatedResponse<ForumPost>> => {
  const res = await api.get(`/forum/threads/${threadId}/posts`, { params });
  return res.data;
};

export const replyForumThread = async (threadId: number, body: ForumReplyThreadBody): Promise<ForumPost> => {
  const res = await api.post(`/forum/threads/${threadId}/posts`, body);
  return res.data;
};

export const updateForumPost = async (postId: number, content: string): Promise<ForumPost> => {
  const res = await api.put(`/forum/posts/${postId}`, { content });
  return res.data;
};

export const deleteForumPost = async (postId: number): Promise<{ message: string }> => {
  const res = await api.delete(`/forum/posts/${postId}`);
  return res.data;
};

export const togglePostHidden = async (
  postId: number,
  isHidden: boolean
): Promise<{ message: string; is_hidden: boolean }> => {
  const res = await api.put(`/forum/posts/${postId}/hide`, { is_hidden: isHidden });
  return res.data;
};

export const togglePostLike = async (
  postId: number
): Promise<{ liked: boolean; like_count: number }> => {
  const res = await api.post(`/forum/posts/${postId}/like`);
  return res.data;
};

export const reportForumPost = async (
  postId: number,
  body: { reason: string; description?: string }
): Promise<{ message: string }> => {
  const res = await api.post(`/forum/posts/${postId}/report`, body);
  return res.data;
};

export const getAdminForumThreads = async (params?: {
  page?: number;
  page_size?: number;
  category_id?: number;
  q?: string;
  is_hidden?: boolean;
  is_reported?: boolean;
}): Promise<PaginatedResponse<ForumThreadListItem>> => {
  const res = await api.get('/forum/admin/threads', { params });
  return res.data;
};

export const getForumReports = async (): Promise<ForumReportedTarget[]> => {
  const res = await api.get('/forum/reports');
  return res.data;
};

export const dismissForumReport = async (
  targetType: 'thread' | 'post',
  targetId: number
): Promise<{ message: string }> => {
  const res = await api.put(`/forum/reports/${targetType}/${targetId}/dismiss`);
  return res.data;
};

export const confirmForumReport = async (
  targetType: 'thread' | 'post',
  targetId: number,
  action: 'delete' | 'hide' = 'delete'
): Promise<{ message: string }> => {
  const res = await api.put(`/forum/reports/${targetType}/${targetId}/confirm`, { action });
  return res.data;
};
