/**
 * 认证相关 API
 */
import api from './config';

export interface LoginRequest {
    username: string;
    password: string;
}

export interface LoginResponse {
    access_token: string;
    token_type: string;
}

export interface AdminInfo {
    id: number;
    username: string;
    email?: string;
    display_name?: string;
    avatar_url?: string;
    bio?: string;
    role: 'super_admin' | 'admin';
    is_active: boolean;
    created_at: string;
    qq?: string;
    wechat?: string;
    github?: string;
    bilibili?: string;
}

// 登录
export const login = async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await api.post<LoginResponse>('/auth/login', data);
    return response.data;
};

// 登出
export const logout = async (): Promise<void> => {
    await api.post('/auth/logout');
    localStorage.removeItem('access_token');
    localStorage.removeItem('admin');
};

// 获取当前用户信息
export const getCurrentAdmin = async (): Promise<AdminInfo> => {
    const response = await api.get<AdminInfo>('/auth/me');
    return response.data;
};

// 更新个人资料
export const updateProfile = async (data: Partial<AdminInfo>): Promise<AdminInfo> => {
    const response = await api.put<AdminInfo>('/auth/me', data);
    return response.data;
};

// 修改密码
export const updatePassword = async (data: any): Promise<any> => {
    const response = await api.put('/auth/password', data);
    return response.data;
};

// 保存登录状态
export const saveLoginState = (token: string, admin: AdminInfo) => {
    localStorage.setItem('access_token', token);
    localStorage.setItem('admin', JSON.stringify(admin));
};

// 获取本地存储的管理员信息
export const getStoredAdmin = (): AdminInfo | null => {
    const adminStr = localStorage.getItem('admin');
    if (adminStr) {
        try {
            return JSON.parse(adminStr);
        } catch {
            return null;
        }
    }
    return null;
};

// 检查是否已登录
export const isLoggedIn = (): boolean => {
    return !!localStorage.getItem('access_token');
};
