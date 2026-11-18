/**
 * 管理员登录页面
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { errorText } from '../utils/errors';

const AdminLogin: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    // 本次登录被判为"非管理员"后，就不要再被已登录重定向带走（否则提示会被冲掉）
    const denied = React.useRef(false);
    const { login, logout, isAuthenticated, isAdmin } = useAuth();
    const navigate = useNavigate();

    // 已登录且是管理员 -> 进后台；已登录但不是管理员 -> 回用户中心
    React.useEffect(() => {
        if (isAuthenticated && !denied.current) {
            navigate(isAdmin ? '/admin' : '/user');
        }
    }, [isAuthenticated, isAdmin, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const session = await login({ username, password });
            // 这个入口只给 admin/super_admin。用一个"本次提交标记"挡住上面的重定向，
            // 否则 logout() 期间 isAuthenticated 由 true 变 false 会先 navigate 走，把提示冲掉。
            denied.current = true;
            if (!session || (session.role !== 'admin' && session.role !== 'super_admin')) {
                await logout();
                setError('该账号不是管理员账号，请从普通登录入口登录');
                return;
            }
            navigate('/admin');
        } catch (err: any) {
            setError(errorText(err, '登录失败，请检查用户名和密码'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-500 to-purple-600 bg-clip-text text-transparent">
                        千禧的博客 - 管理后台
                    </h1>
                    <p className="text-slate-500 mt-2">管理后台登录</p>
                </div>

                {/* Login Form */}
                <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-xl shadow-slate-200/50">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Error Message */}
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                                {error}
                            </div>
                        )}

                        {/* Username */}
                        <div>
                            <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-2">
                                用户名
                            </label>
                            <input
                                type="text"
                                id="username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all focus:bg-white"
                                placeholder="请输入用户名"
                                required
                                autoFocus
                            />
                        </div>

                        {/* Password */}
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                                密码
                            </label>
                            <input
                                type="password"
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all focus:bg-white"
                                placeholder="请输入密码"
                                required
                            />
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-medium rounded-lg hover:from-cyan-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-lg"
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

                    {/* Back Link */}
                    <div className="mt-6 text-center">
                        <a href="#/" className="text-sm text-slate-500 hover:text-cyan-600 transition-colors">
                            ← 返回首页
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminLogin;
