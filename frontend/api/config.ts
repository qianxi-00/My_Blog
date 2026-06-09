/**
 * API 配置和 axios 实例
 */
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const normalizeApiBaseUrl = (value?: string) => {
    const trimmed = value?.trim();
    if (!trimmed) return '';
    return trimmed.replace(/\/$/, '');
};

// API 基础配置：生产环境默认使用相对路径，通过 Nginx /api 反代到后端
export const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

// 创建 axios 实例
const api = axios.create({
    baseURL: `${API_BASE_URL}/api/v1`,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// 请求拦截器：添加 JWT Token
api.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        const token = localStorage.getItem('access_token');
        if (token && config.headers) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error: AxiosError) => {
        return Promise.reject(error);
    }
);

// 响应拦截器：处理错误
api.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
        if (error.response?.status === 401) {
            // Token 过期或无效，清除本地存储
            localStorage.removeItem('access_token');
            localStorage.removeItem('admin');
            // 可以在这里添加重定向到登录页的逻辑
            window.dispatchEvent(new CustomEvent('auth:logout'));
        }
        return Promise.reject(error);
    }
);

export default api;

// API 响应类型
export interface ApiResponse<T> {
    success: boolean;
    data: T;
    message?: string;
}

export interface PaginatedResponse<T> {
    success: boolean;
    data: T[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
}

/**
 * 处理文件 URL，如果是相对路径则拼接后端基础地址；相对 API 模式下保持原路径
 */
export const getFileUrl = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (!API_BASE_URL) return url;
    if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
    return `${API_BASE_URL}/${url}`;
};
