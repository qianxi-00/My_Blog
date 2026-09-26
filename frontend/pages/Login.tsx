/**
 * 统一登录页面
 * 管理员（admin/super_admin）登录后跳 /admin，普通用户跳 /user
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Login: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, isAuthenticated, isAdmin } = useAuth();
    const navigate = useNavigate();

    // 如果已登录，重定向到对应面板
    React.useEffect(() => {
        if (isAuthenticated) {
            navigate(isAdmin ? '/admin' : '/user');
        }
    }, [isAuthenticated, isAdmin, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const user = await login({ username, password });
            navigate(user && (user.role === 'admin' || user.role === 'super_admin') ? '/admin' : '/user');
        } catch (err: any) {
            setError(err.response?.data?.detail || '登录失败，请检查用户名和密码');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4 transition-colors">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-500 to-purple-600 bg-clip-text text-transparent">
                        千禧的博客
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-2">登录账号，评论投稿更方便</p>
                </div>

                {/* Login Form */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-200/50 dark:shadow-none">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Error Message */}
                        {error && (
                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                                {error}
                            </div>
                        )}

                        {/* Username */}
                        <div>
                            <label htmlFor="login-username" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                用户名
                            </label>
                            <input
                                type="text"
                                id="login-username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all focus:bg-white dark:focus:bg-slate-700"
                                placeholder="请输入用户名"
                                required
                                autoFocus
                            />
                        </div>

                        {/* Password */}
                        <div>
                            <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                密码
                            </label>
                            <input
                                type="password"
                                id="login-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all focus:bg-white dark:focus:bg-slate-700"
                                placeholder="请输入密码"
                                required
                            />
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-medium rounded-lg hover:from-cyan-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-800 shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-lg"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center">
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    登录中...
                                </span>
                            ) : '登 录'}
                        </button>
                    </form>

                    {/* Register Link */}
                    <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                        没有账号？
                        <Link to="/register" className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-medium transition-colors">
                            去注册
                        </Link>
                    </div>

                    {/* Back Link */}
                    <div className="mt-4 text-center">
                        <Link to="/" className="text-sm text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">
                            ← 返回首页
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
