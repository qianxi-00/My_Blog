/**
 * 管理员登录页面
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { errorText } from '../utils/errors';
import { Icons } from '../components/Icons';
import { Button, Card, Input } from '../components/Shared';

const AdminLogin: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // 本次登录被判为"非管理员"后，就不要再被已登录重定向带走（否则提示会被冲掉）
  const denied = React.useRef(false);
  const { login, logout, isAuthenticated, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-center items-center p-4 transition-colors">
      <div className="fixed top-4 right-4 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
          className="w-9 h-9 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors"
        >
          {theme === 'dark' ? <Icons.Sun className="w-4 h-4" /> : <Icons.Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-11 h-11 rounded-xl bg-slate-900 dark:bg-slate-100 flex items-center justify-center shadow-sm">
            <Icons.Terminal className="w-5 h-5 text-white dark:text-slate-900" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            DevLog Console
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            管理后台登录 · 仅限管理员与超级管理员
          </p>
        </div>

        <Card className="p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-start gap-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 px-3.5 py-2.5 rounded-lg text-xs leading-relaxed">
                <Icons.AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="username"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                管理员用户名
              </label>
              <Input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                required
                autoFocus
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                登录密码
              </label>
              <Input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                required
              />
            </div>

            <Button type="submit" size="lg" disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Icons.RefreshCw className="w-4 h-4 animate-spin" />
                  登录中...
                </>
              ) : (
                '进入控制台'
              )}
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <Link to="/" className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors">
              <Icons.ArrowLeft className="w-3.5 h-3.5" />
              返回前台首页
            </Link>
            <Link to="/login" className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
              普通用户登录
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AdminLogin;
