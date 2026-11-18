import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { Button } from '../components/Shared';
import Avatar from '../components/Avatar';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { lazyOptional } from '../utils/lazyWithRetry';
import { getPublicSettings, PublicSettings } from '../api/stats';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationItem,
} from '../api/users';
import { buildBilibiliUrl, buildGithubUrl, safeRedirectPath } from '../utils/urls';
import { formatRelativeTimeZh } from '../utils/helpers';

// 桌宠会连带 MarkdownContent -> katex/highlight.js 整条链（约 1MB），
// 所以既做懒加载、又在空闲时才挂载，不占首屏带宽。
const DesktopPet = lazyOptional(() => import('../components/DesktopPet'));

const AI_INTEL_ITEMS = [
  { label: 'AI 热点', desc: '全网前沿 AI 资讯与深读', path: '/hotspots' },
  { label: 'AI 日报', desc: '每日精选动态与要闻汇总', path: '/ai-daily' },
  { label: '周报月报', desc: '阶段性趋势回顾与观察', path: '/ai-weekly' },
  { label: '模型榜', desc: '主流大模型能力与口碑排行', path: '/leaderboard' },
  { label: '额度重置', desc: 'AI 工具配额重置时间速查', path: '/ai-resets' },
];

const ARTICLE_DROPDOWN_ITEMS = [
  { label: '全部文章', desc: '技术教程与深度工程实践', path: '/articles' },
  { label: '文章归档', desc: '按时间线浏览历史文章', path: '/archives' },
  { label: '我要投稿', desc: '分享你的技术洞察与笔记', path: '/write' },
];

const PublicLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const {
    user,
    isAuthenticated,
    isLoading,
    isAdmin,
    unreadCount,
    refreshUnreadCount,
    logout,
  } = useAuth();

  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<'articles' | 'ai' | 'user' | 'notif' | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDesktopPet, setShowDesktopPet] = useState(false);

  // 通知下拉数据
  const [recentNotifs, setRecentNotifs] = useState<NotificationItem[]>([]);
  const [notifsLoading, setNotifsLoading] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const navContainerRef = useRef<HTMLDivElement>(null);

  // 浏览器空闲后再挂载桌宠
  useEffect(() => {
    const ric = (window as any).requestIdleCallback;
    if (typeof ric === 'function') {
      const handle = ric(() => setShowDesktopPet(true));
      return () => (window as any).cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(() => setShowDesktopPet(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    getPublicSettings()
      .then((s) => {
        setSettings(s);
        if (s.site_title) {
          document.title = `${s.site_title} - ${s.site_description || '个人技术博客'}`;
        }
      })
      .catch(console.error);

    const handleScroll = () => setIsScrolled(window.scrollY > 12);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 路由变化时收起所有弹层
  useEffect(() => {
    setOpenDropdown(null);
    setIsMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  // 点击页面外部或 ESC 关闭下拉菜单
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (navContainerRef.current && !navContainerRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenDropdown(null);
        setIsMobileMenuOpen(false);
        return;
      }
      // Cmd/Ctrl + K 或非输入态下按 / 聚焦搜索框
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (!inEditable && e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleToggleNotifDropdown = async () => {
    const next = openDropdown === 'notif' ? null : 'notif';
    setOpenDropdown(next);
    if (next === 'notif' && isAuthenticated) {
      setNotifsLoading(true);
      try {
        const res = await getNotifications({ page: 1, page_size: 5 });
        setRecentNotifs(res.data || []);
      } catch {
        setRecentNotifs([]);
      } finally {
        setNotifsLoading(false);
      }
    }
  };

  const handleNotifClick = async (item: NotificationItem) => {
    setOpenDropdown(null);
    if (!item.is_read) {
      try {
        await markNotificationRead(item.id);
        setRecentNotifs((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
        );
        refreshUnreadCount();
      } catch {
        // 忽略单条标记失败
      }
    }
    const target = safeRedirectPath(item.link, '/user?tab=notifications');
    navigate(target);
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setRecentNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
      refreshUnreadCount();
    } catch {
      // ignore
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    navigate(`/articles?search=${encodeURIComponent(q)}`);
    setSearchQuery('');
    setIsMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    setOpenDropdown(null);
    setIsMobileMenuOpen(false);
    await logout();
  };

  const isArticlesActive =
    location.pathname.startsWith('/articles') ||
    location.pathname.startsWith('/article/') ||
    location.pathname === '/archives' ||
    location.pathname === '/write';

  const isAiActive = AI_INTEL_ITEMS.some(
    (item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
  );

  const isForumActive = location.pathname.startsWith('/forum');
  const isPromptsActive = location.pathname.startsWith('/prompts');

  const githubUrl = buildGithubUrl(settings?.contact?.github);
  const bilibiliUrl = buildBilibiliUrl(settings?.contact?.bilibili);
  const needsOnboarding =
    Boolean(user && (user.username_customized === false || user.has_password === false));

  const formatNotifTime = (ts: string) => formatRelativeTimeZh(ts);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 relative transition-colors duration-200">
      {/* 极简顶部导航 */}
      <header
        ref={navContainerRef}
        className={`fixed top-0 w-full z-50 transition-all duration-200 border-b ${
          isScrolled
            ? 'bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-slate-200/80 dark:border-slate-800 shadow-[0_1px_0_0_rgba(15,23,42,0.03)]'
            : 'bg-white/75 dark:bg-slate-950/75 backdrop-blur-md border-slate-200/60 dark:border-slate-800/60'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* Logo */}
            <Link
              to="/"
              className="flex items-center gap-2.5 shrink-0 group focus:outline-none"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-slate-100 flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                <Icons.Terminal className="w-4 h-4 text-white dark:text-slate-900" />
              </div>
              <span className="text-base sm:text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {settings?.site_title || 'DevLog'}
                <span className="text-primary-500">.</span>
              </span>
            </Link>

            {/* Desktop Nav（统一使用 lg 断点，与下方移动菜单按钮完全对齐，避免 768px-1023px 断层） */}
            <nav className="hidden lg:flex items-center gap-1" aria-label="主导航">
              <Link
                to="/"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === '/'
                    ? 'text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800/80'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                }`}
              >
                首页
              </Link>

              {/* 文章 Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setOpenDropdown(openDropdown === 'articles' ? null : 'articles')
                  }
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isArticlesActive
                      ? 'text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800/80'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                  }`}
                  aria-expanded={openDropdown === 'articles'}
                >
                  <span>文章</span>
                  <Icons.ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-150 ${
                      openDropdown === 'articles' ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {openDropdown === 'articles' && (
                  <div className="absolute left-0 top-full mt-2 w-60 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-lg p-1.5 z-50">
                    {ARTICLE_DROPDOWN_ITEMS.map((item) => (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setOpenDropdown(null)}
                        className={`block px-3 py-2 rounded-lg transition-colors ${
                          location.pathname === item.path
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="text-sm font-medium">{item.label}</div>
                        <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                          {item.desc}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* AI 情报 Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenDropdown(openDropdown === 'ai' ? null : 'ai')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isAiActive
                      ? 'text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800/80'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                  }`}
                  aria-expanded={openDropdown === 'ai'}
                >
                  <span>AI 情报</span>
                  <Icons.ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-150 ${
                      openDropdown === 'ai' ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {openDropdown === 'ai' && (
                  <div className="absolute left-0 top-full mt-2 w-64 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-lg p-1.5 z-50">
                    {AI_INTEL_ITEMS.map((item) => (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setOpenDropdown(null)}
                        className={`block px-3 py-2 rounded-lg transition-colors ${
                          location.pathname === item.path
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="text-sm font-medium">{item.label}</div>
                        <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                          {item.desc}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <Link
                to="/prompts"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isPromptsActive
                    ? 'text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800/80'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                }`}
              >
                提示词
              </Link>

              <Link
                to="/forum"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isForumActive
                    ? 'text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800/80'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                }`}
              >
                社区
              </Link>
            </nav>

            {/* Right Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Desktop Search */}
              <form className="hidden sm:flex relative" onSubmit={handleSearchSubmit}>
                <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="搜索文章..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-12 py-1.5 text-sm bg-slate-100/80 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-lg w-40 md:w-48 focus:w-60 focus:bg-white dark:focus:bg-slate-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/15 outline-none transition-all duration-200 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500"
                />
                {!searchQuery && (
                  <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                    /
                  </kbd>
                )}
              </form>

              {/* Mobile Search Trigger */}
              <button
                type="button"
                className="sm:hidden p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                onClick={() => navigate('/articles')}
                title="搜索文章"
                aria-label="搜索文章"
              >
                <Icons.Search className="w-4 h-4" />
              </button>

              {/* Theme Toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                className="flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
                aria-label={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
              >
                {theme === 'dark' ? (
                  <Icons.Sun className="w-4 h-4" />
                ) : (
                  <Icons.Moon className="w-4 h-4" />
                )}
              </button>

              {/* Authenticated Actions: Bell + User Avatar */}
              {isLoading ? (
                <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
              ) : isAuthenticated && user ? (
                <div className="flex items-center gap-1.5">
                  {/* Notification Bell */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={handleToggleNotifDropdown}
                      className="relative flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                      title="站内通知"
                      aria-label="站内通知"
                    >
                      {unreadCount > 0 ? (
                        <Icons.BellRing className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                      ) : (
                        <Icons.Bell className="w-4 h-4" />
                      )}
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold flex items-center justify-center leading-none ring-2 ring-white dark:ring-slate-950">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </button>

                    {openDropdown === 'notif' && (
                      <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-lg overflow-hidden z-50">
                        <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                            站内通知
                            {unreadCount > 0 && (
                              <span className="ml-1.5 text-primary-600 dark:text-primary-400">
                                ({unreadCount} 条未读)
                              </span>
                            )}
                          </span>
                          {unreadCount > 0 && (
                            <button
                              type="button"
                              onClick={handleMarkAllRead}
                              className="text-xs text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                            >
                              全部已读
                            </button>
                          )}
                        </div>
                        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
                          {notifsLoading ? (
                            <div className="p-4 text-center text-xs text-slate-400">
                              加载通知中...
                            </div>
                          ) : recentNotifs.length === 0 ? (
                            <div className="p-6 text-center text-xs text-slate-400">
                              暂无新通知
                            </div>
                          ) : (
                            recentNotifs.map((n) => (
                              <button
                                key={n.id}
                                type="button"
                                onClick={() => handleNotifClick(n)}
                                className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-start gap-2.5 ${
                                  !n.is_read ? 'bg-primary-50/40 dark:bg-primary-950/20' : ''
                                }`}
                              >
                                <span
                                  className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                                    n.is_read ? 'bg-transparent' : 'bg-primary-500'
                                  }`}
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200 line-clamp-2">
                                    {n.title}
                                  </p>
                                  {n.snippet && (
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                      {n.snippet}
                                    </p>
                                  )}
                                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                                    {formatNotifTime(n.created_at)}
                                  </p>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                        <Link
                          to="/user?tab=notifications"
                          onClick={() => setOpenDropdown(null)}
                          className="block px-4 py-2 text-center text-xs font-medium text-primary-600 dark:text-primary-400 bg-slate-50/70 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          查看全部通知 →
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* User Avatar Menu */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenDropdown(openDropdown === 'user' ? null : 'user')
                      }
                      className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 transition-colors relative"
                      title="账号菜单"
                    >
                      <Avatar
                        name={user.display_name || user.username}
                        avatarUrl={user.avatar_url}
                        className="w-7 h-7 text-xs"
                      />
                      <Icons.ChevronDown
                        className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                          openDropdown === 'user' ? 'rotate-180' : ''
                        }`}
                      />
                      {needsOnboarding && (
                        <span
                          className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-950"
                          title="建议完善用户名或密码"
                        />
                      )}
                    </button>

                    {openDropdown === 'user' && (
                      <div className="absolute right-0 top-full mt-2 w-52 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-lg py-1.5 z-50">
                        <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {user.display_name || user.username}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                            @{user.username}
                          </p>
                        </div>
                        {needsOnboarding && (
                          <Link
                            to="/user?tab=security"
                            onClick={() => setOpenDropdown(null)}
                            className="mx-1.5 mb-1 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/60 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-100/70 transition-colors"
                          >
                            <Icons.Shield className="w-3.5 h-3.5 shrink-0" />
                            <span>完善用户名 / 登录密码</span>
                          </Link>
                        )}
                        <Link
                          to="/user"
                          onClick={() => setOpenDropdown(null)}
                          className="flex items-center gap-2 px-3.5 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors"
                        >
                          <Icons.User className="w-4 h-4 text-slate-400" />
                          <span>个人中心</span>
                        </Link>
                        <Link
                          to={`/user/${encodeURIComponent(user.username)}`}
                          onClick={() => setOpenDropdown(null)}
                          className="flex items-center gap-2 px-3.5 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors"
                        >
                          <Icons.Globe className="w-4 h-4 text-slate-400" />
                          <span>我的公开主页</span>
                        </Link>
                        <Link
                          to="/write"
                          onClick={() => setOpenDropdown(null)}
                          className="flex items-center gap-2 px-3.5 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors"
                        >
                          <Icons.Pencil className="w-4 h-4 text-slate-400" />
                          <span>撰写文章</span>
                        </Link>
                        <Link
                          to="/user?tab=collections"
                          onClick={() => setOpenDropdown(null)}
                          className="flex items-center gap-2 px-3.5 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors"
                        >
                          <Icons.Bookmark className="w-4 h-4 text-slate-400" />
                          <span>收藏与点赞</span>
                        </Link>
                        {isAdmin && (
                          <Link
                            to="/admin"
                            onClick={() => setOpenDropdown(null)}
                            className="flex items-center gap-2 px-3.5 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors"
                          >
                            <Icons.Sliders className="w-4 h-4 text-slate-400" />
                            <span>管理后台</span>
                          </Link>
                        )}
                        <div className="border-t border-slate-100 dark:border-slate-800 my-1"></div>
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="flex items-center gap-2 w-full text-left px-3.5 py-2 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        >
                          <Icons.LogOut className="w-4 h-4" />
                          <span>退出登录</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="hidden sm:flex items-center gap-1.5">
                  <Link to="/login">
                    <Button size="sm" variant="ghost">
                      登录
                    </Button>
                  </Link>
                  <Link to="/register">
                    <Button size="sm">注册</Button>
                  </Link>
                </div>
              )}

              {/* Mobile Hamburger（与 desktop lg:flex 对齐） */}
              <button
                type="button"
                className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                aria-label="切换导航菜单"
                aria-expanded={isMobileMenuOpen}
              >
                {isMobileMenuOpen ? (
                  <Icons.X className="w-4 h-4" />
                ) : (
                  <Icons.Menu className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Drawer */}
        {isMobileMenuOpen && (
          <div className="lg:hidden bg-white dark:bg-slate-950 border-t border-slate-200/80 dark:border-slate-800 px-4 py-4 space-y-4 max-h-[calc(100vh-4rem)] overflow-y-auto shadow-lg">
            {/* Mobile Search */}
            <form onSubmit={handleSearchSubmit} className="relative">
              <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="搜索文章或关键词..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 outline-none focus:border-primary-500"
              />
            </form>

            <div className="space-y-1">
              <Link
                to="/"
                className="block py-2 px-3 text-sm font-medium rounded-lg text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                首页
              </Link>
              <Link
                to="/prompts"
                className="block py-2 px-3 text-sm font-medium rounded-lg text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                提示词库
              </Link>
              <Link
                to="/forum"
                className="block py-2 px-3 text-sm font-medium rounded-lg text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                技术社区
              </Link>
            </div>

            <div>
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                文章专栏
              </p>
              <div className="grid grid-cols-2 gap-1">
                {ARTICLE_DROPDOWN_ITEMS.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className="py-2 px-3 text-sm rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                AI 情报
              </p>
              <div className="grid grid-cols-2 gap-1">
                {AI_INTEL_ITEMS.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className="py-2 px-3 text-sm rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
              {isAuthenticated && user ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-3 px-3 py-1.5">
                    <Avatar
                      name={user.display_name || user.username}
                      avatarUrl={user.avatar_url}
                      className="w-8 h-8 text-sm"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {user.display_name || user.username}
                      </p>
                      <p className="text-xs text-slate-400 truncate">@{user.username}</p>
                    </div>
                  </div>
                  <Link
                    to="/user"
                    className="block py-2 px-3 text-sm rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    个人中心
                  </Link>
                  <Link
                    to="/user?tab=notifications"
                    className="flex items-center justify-between py-2 px-3 text-sm rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <span>站内通知</span>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-rose-500 text-white">
                        {unreadCount}
                      </span>
                    )}
                  </Link>
                  {isAdmin && (
                    <Link
                      to="/admin"
                      className="block py-2 px-3 text-sm rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      管理后台
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="block w-full text-left py-2 px-3 text-sm rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    退出登录
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Link to="/login" className="flex-1">
                    <Button variant="outline" className="w-full">
                      登录
                    </Button>
                  </Link>
                  <Link to="/register" className="flex-1">
                    <Button className="w-full">注册</Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-grow pt-16">
        <div key={location.pathname} className="page-enter">
          <Outlet />
        </div>
      </main>

      <footer className="bg-white dark:bg-slate-950 border-t border-slate-200/80 dark:border-slate-800 mt-auto transition-colors">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {settings?.site_title || 'DevLog'}
                  <span className="text-primary-500">.</span>
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  v2.0
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {settings?.site_description || '记录技术、AI 工程实践与社区讨论'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
              <Link
                to="/articles"
                className="hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                技术文章
              </Link>
              <Link
                to="/hotspots"
                className="hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                AI 热点
              </Link>
              <Link
                to="/prompts"
                className="hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                提示词
              </Link>
              <Link
                to="/forum"
                className="hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                技术社区
              </Link>
              {githubUrl && (
                <a
                  href={githubUrl}
                  className="hover:text-slate-900 dark:hover:text-white transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>
              )}
              {bilibiliUrl && (
                <a
                  href={bilibiliUrl}
                  className="hover:text-slate-900 dark:hover:text-white transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Bilibili
                </a>
              )}
            </div>
          </div>
        </div>
      </footer>

      {showDesktopPet && (
        <Suspense fallback={null}>
          <DesktopPet />
        </Suspense>
      )}
    </div>
  );
};

export default PublicLayout;
