/**
 * 注册页面
 * 用户名/密码/确认密码/昵称(选填)/邮箱(选填)，成功后自动登录并跳 /user
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Register: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { register } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('两次输入的密码不一致');
            return;
        }

        setLoading(true);
        try {
            await register({
                username,
                password,
                display_name: displayName.trim() || undefined,
                email: email.trim() || undefined,
            });
            // 注册成功即自动登录，普通用户跳用户中心
            navigate('/user');
        } catch (err: any) {
            const detail = err.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : (detail?.msg || JSON.stringify(detail) || '注册失败，请稍后再试'));
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
                    <p className="text-slate-500 dark:text-slate-400 mt-2">创建账号，开始你的创作之旅</p>
                </div>

                {/* Register Form */}
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
                            <label htmlFor="reg-username" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                用户名 <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                id="reg-username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all focus:bg-white dark:focus:bg-slate-700"
                                placeholder="登录用户名"
                                required
                                minLength={2}
                                maxLength={32}
                                autoFocus
                            />
                        </div>

                        {/* Password */}
                        <div>
                            <label htmlFor="reg-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                密码 <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="password"
                                id="reg-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all focus:bg-white dark:focus:bg-slate-700"
                                placeholder="至少 6 位字符"
                                required
                                minLength={6}
                            />
                        </div>

                        {/* Confirm Password */}
                        <div>
                            <label htmlFor="reg-confirm" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                确认密码 <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="password"
                                id="reg-confirm"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all focus:bg-white dark:focus:bg-slate-700"
                                placeholder="再次输入密码"
                                required
                                minLength={6}
                            />
                        </div>

                        {/* Display Name */}
                        <div>
                            <label htmlFor="reg-display-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                昵称 <span className="text-slate-400 dark:text-slate-500 text-xs">(选填)</span>
                            </label>
                            <input
                                type="text"
                                id="reg-display-name"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all focus:bg-white dark:focus:bg-slate-700"
                                placeholder="对外展示的昵称"
                                maxLength={32}
                            />
                        </div>

                        {/* Email */}
                        <div>
                            <label htmlFor="reg-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                邮箱 <span className="text-slate-400 dark:text-slate-500 text-xs">(选填)</span>
                            </label>
                            <input
                                type="email"
                                id="reg-email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all focus:bg-white dark:focus:bg-slate-700"
                                placeholder="example@email.com"
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
                                    注册中...
                                </span>
                            ) : '注 册'}
                        </button>
                    </form>

                    {/* Login Link */}
                    <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                        已有账号？
                        <Link to="/login" className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-medium transition-colors">
                            去登录
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

export default Register;
