import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { Icons, IconName } from '../components/Icons';
import { SIDEBAR_ITEMS } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { getFileUrl } from '../api/config';
import { getStatsOverview } from '../api/stats';
import { getForumReports } from '../api/forum';

const resolveSectionTitle = (pathname: string): string => {
  const exact = SIDEBAR_ITEMS.find((i) => i.path === pathname);
  if (exact) return exact.label;
  if (pathname.startsWith('/admin/posts/new')) return '新建文章';
  if (pathname.startsWith('/admin/posts/') && pathname.endsWith('/edit')) return '编辑文章';
  if (pathname.startsWith('/admin/hotspots/upload')) return '上传热点';
  if (pathname.startsWith('/admin/hotspots/')) return '编辑热点';
  if (pathname.startsWith('/admin/profile')) return '个人资料';
  const prefix = SIDEBAR_ITEMS.slice()
    .reverse()
    .find((i) => i.path !== '/admin' && pathname.startsWith(i.path));
  return prefix?.label || '概览';
};

const AdminLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { admin, isAuthenticated, isAdmin, isLoading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingComments, setPendingComments] = useState(0);
  const [pendingForumReports, setPendingForumReports] = useState(0);

  // 路由变化时自动收起移动端侧栏
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // 侧栏待办徽标：评论审核 + 社区举报队列
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return;
    getStatsOverview()
      .then((res) => setPendingComments(res.pending_comments || 0))
      .catch(() => {});
    getForumReports()
      .then((res) => setPendingForumReports(Array.isArray(res) ? res.length : 0))
      .catch(() => {});
  }, [isAuthenticated, isAdmin, location.pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center transition-colors">
        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <span className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <span>正在加载管理后台...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/user" replace />;
  }

  const handleLogout = async () => {
    await logout();
  };

  const sectionTitle = resolveSectionTitle(location.pathname);

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-950/40 backdrop-blur-[1px] z-40 sm:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-950 border-r border-slate-200/80 dark:border-slate-800 transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } sm:translate-x-0`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="h-16 flex items-center justify-between px-5 border-b border-slate-200/80 dark:border-slate-800">
            <Link to="/admin" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-slate-100 flex items-center justify-center">
                <Icons.Terminal className="w-4 h-4 text-white dark:text-slate-900" />
              </div>
              <div className="leading-tight">
                <span className="text-base font-semibold tracking-tight text-slate-900 dark:text-white block">
                  DevLog
                </span>
                <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Console
                </span>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="sm:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label="关闭侧栏"
            >
              <Icons.X className="w-4 h-4" />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            {SIDEBAR_ITEMS.map((item) => {
              const Icon = Icons[item.icon as IconName];
              const isActive =
                item.path === '/admin'
                  ? location.pathname === '/admin'
                  : location.pathname === item.path ||
                    location.pathname.startsWith(`${item.path}/`);

              const badgeCount =
                item.path === '/admin/comments'
                  ? pendingComments
                  : item.path === '/admin/forum'
                  ? pendingForumReports
                  : 0;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`relative flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors group ${
                    isActive
                      ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r bg-primary-500"
                    />
                  )}
                  <Icon
                    className={`w-4 h-4 mr-3 shrink-0 transition-colors ${
                      isActive
                        ? 'text-primary-600 dark:text-primary-400'
                        : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                  {badgeCount > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1.5 bg-rose-500 text-white text-[10px] font-semibold rounded-full flex items-center justify-center ml-auto">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Footer User */}
          <div className="p-3 border-t border-slate-200/80 dark:border-slate-800">
            <div
              className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-100/80 dark:hover:bg-slate-900 transition-colors cursor-pointer group"
              onClick={() => navigate('/admin/profile')}
              title="编辑个人资料"
            >
              <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 shrink-0 overflow-hidden border border-slate-200 dark:border-slate-700">
                {admin?.avatar_url ? (
                  <img
                    src={getFileUrl(admin.avatar_url)}
                    alt="avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-900 dark:bg-slate-700 flex items-center justify-center text-white text-xs font-semibold">
                    {admin?.display_name?.[0] || admin?.username?.[0]?.toUpperCase() || 'A'}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                  {admin?.display_name || admin?.username}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                  {admin?.role === 'super_admin' ? '超级管理员' : '管理员'}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleLogout();
                }}
                title="退出登录"
                aria-label="退出登录"
                className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-md"
              >
                <Icons.LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 sm:ml-64 flex flex-col min-w-0 min-h-screen">
        <header className="h-16 bg-white/85 dark:bg-slate-950/85 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-30 backdrop-blur-md transition-colors">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="sm:hidden p-2 -ml-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="打开导航"
              aria-label="打开导航菜单"
            >
              <Icons.Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 dark:text-slate-500 hidden sm:inline">管理后台</span>
              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white truncate">
                {sectionTitle}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
              aria-label={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
            >
              {theme === 'dark' ? (
                <Icons.Sun className="w-4 h-4" />
              ) : (
                <Icons.Moon className="w-4 h-4" />
              )}
            </button>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
            >
              <span>返回前台</span>
              <Icons.ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </header>
        <main className="p-4 sm:p-8 flex-1 min-w-0">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;