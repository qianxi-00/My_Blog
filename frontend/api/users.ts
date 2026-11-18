/**
 * 用户系统相关 API
 * 注册 / 用户资料 / 用户投稿 / 管理端审核与用户管理
 */
import api, { PaginatedResponse } from './config';
import type { ForumThreadListItem } from './forum';

// 用户角色（token 中不携带，来自登录/注册响应或 /auth/me、/users/me）
export type Role = 'super_admin' | 'admin' | 'user';

export interface UserProfile {
    id: number;
    username: string;
    display_name?: string;
    email?: string;
    avatar_url?: string;
    bio?: string;
    github?: string;
    bilibili?: string;
    website?: string;
    role: Role;
    email_verified?: boolean;
    has_password?: boolean;
    username_customized?: boolean;
    created_at: string;
}

export interface RegisterRequest {
    username: string;
    password: string;
    display_name?: string;
    email: string;
    code?: string;
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
    github?: string;
    bilibili?: string;
    website?: string;
}

export interface PasswordUpdate {
    old_password?: string;
    new_password: string;
}

export interface PasswordUpdateResponse {
    message: string;
    access_token: string;
    has_password: boolean;
}

// 用户投稿状态
export type UserArticleStatus = 'draft' | 'pending_review' | 'rejected' | 'published';

// 列表接口（GET /users/me/articles）返回后端 ArticleListResponse：**没有 content_md**。
// 正文必须走 getMyArticle(id)。这里单列一个不含正文的类型，从类型层杜绝
// "从列表里读 content_md"——那正是编辑页正文恒空的根因（2026-09-28）。
export interface UserArticleListItem {
    id: number;
    title: string;
    summary?: string;
    category?: string;
    tags?: Array<string | { id?: number; name: string; slug?: string }>;
    cover_image?: string;
    status: UserArticleStatus;
    review_note?: string;
    created_at: string;
    updated_at?: string;
}

export interface UserArticle {
    id: number;
    title: string;
    summary?: string;
    content_md?: string;
    category?: string;
    /** 列表接口返回的是标签对象数组（ArticleListResponse.tags: TagResponse[]），单篇接口也是；写回后端时必须转成名字 */
    tags?: Array<string | { id?: number; name: string; slug?: string }>;
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
    role?: Role;
    github?: string;
    bilibili?: string;
    website?: string;
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

export interface PublicAuthorPrompt {
    id: number;
    title: string;
    description?: string;
    content: string;
    category: string;
    copy_count?: number;
    created_at: string;
}

export interface PublicAuthorThread {
    id: number;
    category_id: number;
    category_name?: string;
    title: string;
    reply_count: number;
    view_count: number;
    like_count: number;
    is_solved: boolean;
    created_at: string;
    last_post_at?: string;
}

/**
 * 公开作者页响应。
 * 2026-09-30 修正：后端 schemas/user.py 的 UserProfilePublic 是**扁平**结构
 * （UserPublicSafe 字段 + articles + prompts + threads + stats），没有 `user` 包装层。
 */
export interface PublicUserProfile extends PublicAuthor {
    articles: PublicAuthorArticle[];
    prompts?: PublicAuthorPrompt[];
    threads?: PublicAuthorThread[];
    stats?: {
        articles?: number;
        prompts?: number;
        threads?: number;
    };
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
    article_count?: number;
    comment_count?: number;
    last_login_at?: string;
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

// 一次性修改正式用户名（免密自动建号引导用）
export const updateMyUsername = async (username: string): Promise<UserProfile> => {
    const response = await api.put<UserProfile>('/users/me/username', { username });
    return response.data;
};

// 修改当前用户密码或首次设置密码（返回新 access_token 以保持当前会话在线）
export const updateCurrentUserPassword = async (data: PasswordUpdate): Promise<PasswordUpdateResponse> => {
    const response = await api.put<PasswordUpdateResponse>('/users/me/password', data);
    return response.data;
};

// 获取公开作者主页（作者信息 + 已发布文章/提示词/社区主题）
export const getPublicUser = async (username: string): Promise<PublicUserProfile> => {
    const response = await api.get<PublicUserProfile>(`/users/${encodeURIComponent(username)}`);
    return response.data;
};

// 我的文章列表（status 为空时返回全部状态）
export const getMyArticles = async (params?: {
    status?: string;
    page?: number;
    page_size?: number;
}): Promise<PaginatedResponse<UserArticleListItem>> => {
    const response = await api.get('/users/me/articles', { params });
    return response.data;
};

// 单篇完整内容（编辑页用；列表接口 ArticleListResponse 不含 content_md）
export const getMyArticle = async (id: number): Promise<UserArticle> => {
    const response = await api.get<UserArticle>(`/users/me/articles/${id}`);
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

// 用户管理列表（2026-09-26 二期：筛选/排序/统计）
export const getAdminUsers = async (params?: {
    search?: string;
    status?: string;
    role?: string;
    sort?: string;
    order?: string;
    page?: number;
    page_size?: number;
}): Promise<PaginatedResponse<AdminUserItem>> => {
    const response = await api.get('/admins/users', { params });
    return response.data;
};

// 用户管理卡片统计
export const getAdminUsersStats = async (): Promise<{
    total: number;
    regular: number;
    admins: number;
    banned: number;
    today_new: number;
    pending_articles: number;
}> => {
    const response = await api.get('/admins/users/stats');
    return response.data;
};

// 用户详情（资料 + 统计 + 最近文章 + 最近评论）
export interface AdminUserDetail extends AdminUserItem {
    email_verified?: boolean;
    last_login_at?: string;
    stats?: {
        articles_total: number;
        articles_published: number;
        articles_pending: number;
        articles_rejected: number;
        articles_draft: number;
        comments_total: number;
    };
    recent_articles?: Array<{
        id: number;
        title: string;
        status: string;
        category?: string;
        created_at: string;
        published_at?: string;
    }>;
    recent_comments?: Array<{
        id: number;
        content?: string;
        status?: string;
        target_type?: string;
        target_id?: number;
        created_at: string;
    }>;
}

export const getAdminUserDetail = async (id: number): Promise<AdminUserDetail> => {
    const response = await api.get<AdminUserDetail>(`/admins/users/${id}`);
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

// 重置用户密码（返回一次性临时密码）
export const resetUserPassword = async (id: number): Promise<{ message: string; temp_password: string }> => {
    const response = await api.put(`/admins/users/${id}/password`);
    return response.data;
};

// 改角色（仅超管）
export const setUserRole = async (id: number, role: 'user' | 'admin'): Promise<{ message: string; role: string }> => {
    const response = await api.put(`/admins/users/${id}/role`, { role });
    return response.data;
};

// 给用户绑定/更换邮箱（仅超管；空字符串解绑）
export const setUserEmail = async (id: number, email: string): Promise<{ message: string; email?: string }> => {
    const response = await api.put(`/admins/users/${id}/email`, { email });
    return response.data;
};

// 删除用户（仅超管）
// withContent=false：该用户还有文章时后端返回 409（文章作者不能为空），由抽屉二次确认；
// withContent=true：连同其文章一并删除（评论/提示词仍置空保留）。
export const deleteUser = async (
    id: number,
    withContent = false,
): Promise<{ message: string; deleted_articles?: number }> => {
    const response = await api.delete(`/admins/users/${id}`, {
        params: withContent ? { with_content: true } : undefined,
    });
    return response.data;
};

// ===== 管理员账号管理（仅超管；2026-09-26 二期接上前端） =====

export const getAdmins = async (): Promise<AdminUserItem[]> => {
    const response = await api.get('/admins');
    return response.data;
};

export const createAdmin = async (data: {
    username: string;
    password: string;
    display_name?: string;
    email?: string;
    role?: 'admin' | 'super_admin';
}): Promise<AdminUserItem> => {
    const response = await api.post<AdminUserItem>('/admins', data);
    return response.data;
};

export const updateAdmin = async (id: number, data: {
    display_name?: string;
    email?: string;
    bio?: string;
    is_active?: boolean;
}): Promise<AdminUserItem> => {
    const response = await api.put<AdminUserItem>(`/admins/${id}`, data);
    return response.data;
};

export const deleteAdmin = async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/admins/${id}`);
    return response.data;
};

export const resetAdminPassword = async (id: number, data: {
    old_password?: string;
    new_password: string;
}): Promise<{ message: string }> => {
    const response = await api.put(`/admins/${id}/password`, data);
    return response.data;
};

// ===== 绑定邮箱（登录用户） =====

export const sendBindEmailCode = async (email: string): Promise<{ message: string; expires_in: number }> => {
    const response = await api.post('/users/me/email/code', { email });
    return response.data;
};

export const bindEmail = async (data: { email: string; code: string }): Promise<UserProfile> => {
    const response = await api.put<UserProfile>('/users/me/email', data);
    return response.data;
};

// ===== 我的提示词（登录用户） =====

export interface MyPrompt {
    id: number;
    title: string;
    description?: string;
    content: string;
    category: string;
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
}

export const getMyPrompts = async (): Promise<MyPrompt[]> => {
    const response = await api.get<MyPrompt[]>('/users/me/prompts');
    return response.data;
};

export const updateMyPrompt = async (id: number, data: {
    title?: string;
    description?: string;
    content?: string;
    category?: string;
}): Promise<MyPrompt> => {
    const response = await api.put<MyPrompt>(`/users/me/prompts/${id}`, data);
    return response.data;
};

export const deleteMyPrompt = async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/users/me/prompts/${id}`);
    return response.data;
};

// ===== 我的社区主题与评论记录 =====

export const getMyThreads = async (params?: {
    page?: number;
    page_size?: number;
}): Promise<PaginatedResponse<ForumThreadListItem>> => {
    const response = await api.get('/users/me/threads', { params });
    return response.data;
};

export interface MyCommentItem {
    id: number;
    target_type: 'article' | 'hotspot';
    target_id: number;
    target_title: string;
    link: string;
    content: string;
    status: string;
    like_count: number;
    edited_at?: string;
    created_at: string;
}

export const getMyComments = async (params?: {
    page?: number;
    page_size?: number;
}): Promise<{
    data: MyCommentItem[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
}> => {
    const response = await api.get('/users/me/comments', { params });
    return response.data;
};

// ===== 收藏与点赞 =====

export type BookmarkTargetType = 'article' | 'hotspot' | 'prompt' | 'thread';

export interface BookmarkItem {
    id: number;
    target_type: BookmarkTargetType;
    target_id: number;
    title: string;
    summary?: string;
    link: string;
    extra?: {
        available?: boolean;
        category?: string;
        reply_count?: number;
    };
    created_at: string;
}

export const toggleBookmark = async (
    targetType: BookmarkTargetType,
    targetId: number
): Promise<{ bookmarked: boolean; target_type: BookmarkTargetType; target_id: number }> => {
    const response = await api.post('/users/me/bookmarks/toggle', {
        target_type: targetType,
        target_id: targetId,
    });
    return response.data;
};

export const getBookmarkStatus = async (
    targetType: BookmarkTargetType,
    targetId: number
): Promise<{ bookmarked: boolean }> => {
    const response = await api.get('/users/me/bookmarks/status', {
        params: { target_type: targetType, target_id: targetId },
    });
    return response.data;
};

export const getMyBookmarks = async (params?: {
    target_type?: BookmarkTargetType;
    page?: number;
    page_size?: number;
}): Promise<PaginatedResponse<BookmarkItem>> => {
    const response = await api.get('/users/me/bookmarks', { params });
    return response.data;
};

export interface LikedThreadItem {
    id: number;
    title: string;
    category_name?: string;
    like_count: number;
    reply_count: number;
    liked_at: string;
    link: string;
}

export interface LikedPostItem {
    id: number;
    thread_id: number;
    thread_title: string;
    floor: number;
    content_preview: string;
    like_count: number;
    liked_at: string;
    link: string;
}

export interface MyLikesResponse {
    threads: LikedThreadItem[];
    posts: LikedPostItem[];
    total_threads: number;
    total_posts: number;
}

export const getMyLikes = async (params?: {
    page?: number;
    page_size?: number;
}): Promise<MyLikesResponse> => {
    const response = await api.get('/users/me/likes', { params });
    return response.data;
};

// ===== 站内通知 =====

export interface NotificationItem {
    id: number;
    actor_id?: number;
    actor_name?: string;
    actor_avatar?: string;
    type: 'comment_reply' | 'forum_reply' | 'forum_accepted' | 'article_review' | 'prompt_review' | string;
    target_type?: string;
    target_id?: number;
    title: string;
    snippet?: string;
    link?: string;
    is_read: boolean;
    created_at: string;
}

export const getNotifications = async (params?: {
    unread_only?: boolean;
    page?: number;
    page_size?: number;
}): Promise<PaginatedResponse<NotificationItem>> => {
    const response = await api.get('/users/me/notifications', { params });
    return response.data;
};

export const getUnreadNotificationsCount = async (): Promise<{ unread_count: number }> => {
    const response = await api.get('/users/me/notifications/unread-count');
    return response.data;
};

export const markNotificationRead = async (notifId: number): Promise<{ message: string; id: number }> => {
    const response = await api.put(`/users/me/notifications/${notifId}/read`);
    return response.data;
};

export const markAllNotificationsRead = async (): Promise<{ message: string }> => {
    const response = await api.put('/users/me/notifications/read-all');
    return response.data;
};

