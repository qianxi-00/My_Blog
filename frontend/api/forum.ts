/**
 * 论坛相关 API
 */
import api, { PaginatedResponse } from './config';

export interface ForumCategory {
  id: number;
  name: string;
  slug?: string | null;
  sort_order?: number;
}

export interface ForumThreadListItem {
  id: number;
  category_id: number;
  category_name?: string | null;

  title: string;

  reply_count: number;
  view_count: number;

  last_post_at?: string | null;

  author_nickname: string;

  created_at: string;
}

export interface ForumThreadDetail {
  id: number;
  category_id: number;
  category_name?: string | null;

  title: string;

  reply_count: number;
  view_count: number;

  is_pinned: boolean;
  is_locked: boolean;

  last_post_at?: string | null;

  author_nickname: string;

  created_at: string;
  updated_at?: string | null;
}

export interface ForumPost {
  id: number;
  thread_id: number;
  parent_id?: number | null;
  floor: number;

  nickname: string;
  content: string;

  is_admin_post: boolean;
  admin_display_name?: string | null;

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

export const getForumCategories = async (): Promise<ForumCategory[]> => {
  const res = await api.get('/forum/categories');
  return res.data;
};

export const getForumThreads = async (params?: {
  page?: number;
  page_size?: number;
  category_id?: number;
  q?: string;
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
