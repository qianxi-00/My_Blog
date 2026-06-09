import React from 'react';
import { Outlet, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { Icons, IconName } from '../components/Icons';
import { SIDEBAR_ITEMS } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { getFileUrl } from '../api/config';

const AdminLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { admin, isAuthenticated, isLoading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // 加载中显示
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center transition-colors">
        <div className="text-cyan-600 dark:text-cyan-400 font-medium animate-pulse">加载中...</div>
      </div>
    );
  }

  // 未登录重定向到登录页
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transition-all -translate-x-full sm:translate-x-0">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="h-20 flex items-center px-6 border-b border-slate-100 dark:border-slate-700">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-200 dark:shadow-cyan-900/30 mr-3">
              <Icons.Bot className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-black text-slate-800 dark:text-white tracking-tight">DevLog</span>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-4 py-8 space-y-2 overflow-y-auto">
            {SIDEBAR_ITEMS.map((item) => {
              const Icon = Icons[item.icon as IconName];
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center px-4 py-3.5 text-sm font-semibold rounded-2xl transition-all duration-200 group ${isActive
                    ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 shadow-sm shadow-cyan-100/50 dark:shadow-none'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
                    }`}
                >
                  <Icon className={`w-5 h-5 mr-3.5 transition-colors ${isActive ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Footer User */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-700">
            <div
              className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer group"
              onClick={() => navigate('/admin/profile')}
              title="编辑个人资料"
            >
              <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-600 flex-shrink-0 overflow-hidden border border-slate-200 dark:border-slate-600 shadow-sm group-hover:shadow-md transition-shadow">
                {admin?.avatar_url ? (
                  <img src={getFileUrl(admin.avatar_url)} alt="Av" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-r from-cyan-500 to-purple-600 flex items-center justify-center text-white font-bold">
                    {admin?.display_name?.[0] || admin?.username?.[0]?.toUpperCase() || 'A'}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                  {admin?.display_name || admin?.username}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {admin?.role === 'super_admin' ? '超级管理员' : '管理员'}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleLogout();
                }}
                title="退出登录"
                className="p-2 text-slate-400 hover:text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
              >
                <Icons.LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 sm:ml-64 flex flex-col min-h-screen">
        <header className="h-16 bg-white/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-8 sticky top-0 z-40 backdrop-blur-sm transition-colors">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">
            {SIDEBAR_ITEMS.find(i => i.path === location.pathname)?.label || '概览'}
          </h2>
          <div className="flex items-center gap-4">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-amber-500 dark:hover:text-amber-400 transition-all duration-200"
              title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
            >
              {theme === 'dark' ? (
                <Icons.Sun className="w-5 h-5" />
              ) : (
                <Icons.Moon className="w-5 h-5" />
              )}
            </button>
            <Link to="/" className="text-sm text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">
              访问网站 →
            </Link>
          </div>
        </header>
        <main className="p-8 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;