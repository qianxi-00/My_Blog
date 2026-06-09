/**
 * 认证上下文 - 全局管理用户登录状态
 */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AdminInfo, getCurrentAdmin, getStoredAdmin, isLoggedIn, login as apiLogin, logout as apiLogout, saveLoginState, LoginRequest } from '../api/auth';

interface AuthContextType {
    admin: AdminInfo | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (data: LoginRequest) => Promise<void>;
    logout: () => Promise<void>;
    refreshAdmin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [admin, setAdmin] = useState<AdminInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // 初始化：检查本地存储的登录状态
    useEffect(() => {
        const initAuth = async () => {
            if (isLoggedIn()) {
                // 尝试从本地存储获取
                const storedAdmin = getStoredAdmin();
                if (storedAdmin) {
                    setAdmin(storedAdmin);
                }

                // 验证 token 有效性
                try {
                    const currentAdmin = await getCurrentAdmin();
                    setAdmin(currentAdmin);
                    saveLoginState(localStorage.getItem('access_token')!, currentAdmin);
                } catch (error) {
                    // Token 无效，清除状态
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

    const login = async (data: LoginRequest) => {
        const response = await apiLogin(data);
        localStorage.setItem('access_token', response.access_token);
        const adminInfo = await getCurrentAdmin();
        saveLoginState(response.access_token, adminInfo);
        setAdmin(adminInfo);
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
            const adminInfo = await getCurrentAdmin();
            setAdmin(adminInfo);
            saveLoginState(localStorage.getItem('access_token')!, adminInfo);
        }
    };

    return (
        <AuthContext.Provider
            value={{
                admin,
                isAuthenticated: !!admin,
                isLoading,
                login,
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
