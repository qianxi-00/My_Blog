/**
 * 统一登录页面
 * 管理员（admin/super_admin）登录后跳 /admin，普通用户跳 /user
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { errorText } from '../utils/errors';

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
            setError(errorText(err, '登录失败，请检查用户名和密码'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen relative flex items-center justify-center p-4 transition-colors overflow-hidden
            bg-slate-50 dark:bg-slate-950">
            {/* 十一期美化：径向渐变夜空背景 —— 中心亮、四周暗，卡片像浮在光圈上 */}
            <div aria-hidden className="pointer-events-none absolute inset-0
                bg-[radial-gradient(ellipse_60%_50%_at_50%_38%,rgba(6,182,212,0.10),transparent_70%)]
                dark:bg-[radial-gradient(ellipse_60%_50%_at_50%_38%,rgba(6,182,212,0.16),transparent_70%)]" />
            <div aria-hidden className="pointer-events-none absolute inset-0
                bg-[radial-gradient(ellipse_45%_40%_at_65%_75%,rgba(147,51,234,0.08),transparent_70%)]
                dark:bg-[radial-gradient(ellipse_45%_40%_at_65%_75%,rgba(147,51,234,0.14),transparent_70%)]" />

            <div className="w-full max-w-md relative">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-purple-600 shadow-lg shadow-cyan-500/25 dark:shadow-cyan-500/40 mb-4">
                        <span className="text-3xl">🐾</span>
                    </div>
                    <h1 className="text-4xl font-black bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600 bg-clip-text text-transparent tracking-tight">
                        千禧的博客
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">
                        登录后：粘入笔记一键成稿投稿 · 你的评论可被站内 AI 引用为参考
                    </p>
                </div>

                {/* Login Form —— 毛玻璃卡片：半透明底 + backdrop-blur，浮在渐变上 */}
                <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-2xl p-8 border border-white/60 dark:border-slate-700/60 shadow-xl shadow-slate-200/50 dark:shadow-black/40">
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
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/70 focus:border-transparent focus:shadow-[0_0_0_4px_rgba(6,182,212,0.12)] focus:bg-white dark:focus:bg-slate-700 transition-all"
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
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/70 focus:border-transparent focus:shadow-[0_0_0_4px_rgba(6,182,212,0.12)] focus:bg-white dark:focus:bg-slate-700 transition-all"
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

                    {/* Register / Forgot Link */}
                    <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                        没有账号？
                        <Link to="/register" className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-medium transition-colors">
                            去注册
                        </Link>
                        <span className="mx-2 text-slate-300 dark:text-slate-600">|</span>
                        <Link to="/forgot-password" className="text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">
                            忘记密码？
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
