/**
 * 认证上下文 - 全局管理用户登录状态
 * 管理员与注册用户共用一套会话：token 存 localStorage 'access_token'（沿用现有 key，管理面板零改动）
 *
 * 注意端点差异（2026-09-24 用户系统改造）：
 * - /auth/me 是管理员端点（普通用户拿 403）
 * - /users/me 是普通用户端点
 * 刷新时按本地会话的 role 选择正确的端点，否则普通用户一刷新就被判定失效并登出。
 */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AdminInfo, getCurrentAdmin, getStoredAdmin, isLoggedIn, login as apiLogin, logout as apiLogout, LoginRequest, LoginResponse } from '../api/auth';
import { Role, UserProfile, register as apiRegister, RegisterRequest, getCurrentUser } from '../api/users';

// 会话用户：在原有 AdminInfo 基础上放宽 role（注册用户为 'user'），is_active 对普通用户可缺省
export type UserSession = Omit<AdminInfo, 'role' | 'is_active'> & { role: Role; is_active?: boolean };

interface AuthContextType {
    admin: UserSession | null;
    user: UserSession | null;
    isAdmin: boolean;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (data: LoginRequest) => Promise<UserSession | null>;
    register: (data: RegisterRequest) => Promise<UserSession | null>;
    logout: () => Promise<void>;
    refreshAdmin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 保存会话（key 与现有管理面板保持一致）
const persistSession = (token: string, user: UserSession) => {
    localStorage.setItem('access_token', token);
    localStorage.setItem('admin', JSON.stringify(user));
};

// 按角色拉取当前用户：普通用户走 /users/me，管理员走 /auth/me
const fetchSession = async (role?: Role): Promise<UserSession> => {
    if (role === 'user') {
        return (await getCurrentUser()) as UserSession;
    }
    return (await getCurrentAdmin()) as UserSession;
};

const isAdminRole = (role?: Role) => role === 'admin' || role === 'super_admin';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [admin, setAdmin] = useState<UserSession | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // 初始化：检查本地存储的登录状态
    useEffect(() => {
        const initAuth = async () => {
            if (isLoggedIn()) {
                // 先用本地缓存的会话渲染，再回源校验
                const storedAdmin = getStoredAdmin() as UserSession | null;
                if (storedAdmin) {
                    setAdmin(storedAdmin);
                }

                try {
                    const currentUser = await fetchSession(storedAdmin?.role);
                    setAdmin(currentUser);
                    persistSession(localStorage.getItem('access_token')!, currentUser);
                } catch (error) {
                    // Token 无效（或账号被封禁），清除状态
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('admin');
                    setAdmin(null);
                }
            }
            setIsLoading(false);
        };

        initAuth();

        // 监听登出事件
        const handleLogout = () => {
            setAdmin(null);
        };
        window.addEventListener('auth:logout', handleLogout);

        return () => {
            window.removeEventListener('auth:logout', handleLogout);
        };
    }, []);

    const login = async (data: LoginRequest): Promise<UserSession | null> => {
        const response = await apiLogin(data);
        localStorage.setItem('access_token', response.access_token);
        // 登录响应已带用户对象（admin 字段）；缺失才回源（管理员走的 /auth/me）
        let user: UserSession | null = (response as LoginResponse).admin as UserSession | undefined ?? null;
        if (!user) {
            user = await fetchSession((response as LoginResponse).admin?.role);
        }
        persistSession(response.access_token, user);
        setAdmin(user);
        return user;
    };

    const register = async (data: RegisterRequest): Promise<UserSession | null> => {
        const response = await apiRegister(data);
        const user = response.user as UserSession;
        persistSession(response.access_token, user);
        setAdmin(user);
        return user;
    };

    const logout = async () => {
        try {
            await apiLogout();
        } finally {
            localStorage.removeItem('access_token');
            localStorage.removeItem('admin');
            setAdmin(null);
        }
    };

    const refreshAdmin = async () => {
        if (isLoggedIn()) {
            const stored = getStoredAdmin() as UserSession | null;
            const currentUser = await fetchSession(stored?.role ?? admin?.role);
            setAdmin(currentUser);
            persistSession(localStorage.getItem('access_token')!, currentUser);
        }
    };

    return (
        <AuthContext.Provider
            value={{
                admin,
                user: admin,
                isAdmin: isAdminRole(admin?.role),
                isAuthenticated: !!admin,
                isLoading,
                login,
                register,
                logout,
                refreshAdmin,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export default AuthContext;
