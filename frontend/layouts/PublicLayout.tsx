import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { Button } from '../components/Shared';
import { useTheme } from '../contexts/ThemeContext';
import DesktopPet from '../components/DesktopPet';

import { getPublicSettings, PublicSettings } from '../api/stats';

const PublicLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    getPublicSettings()
      .then(s => {
        setSettings(s);
        if (s.site_title) {
          document.title = `${s.site_title} - ${s.site_description || '个人技术博客'}`;
        }
      })
      .catch(console.error);

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: '首页', path: '/' },
    { label: '文章', path: '/articles' },
    { label: '热点', path: '/hotspots' },
    { label: 'AI日报', path: '/ai-daily' },
    { label: '归档', path: '/archives' },
    { label: '提示词', path: '/prompts' },
    { label: '论坛', path: '/forum' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900 relative transition-colors duration-300">
      <header className={`fixed top-0 w-full z-50 transition-all duration-300 ${isScrolled
        ? 'bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 shadow-sm'
        : 'bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 cursor-pointer group">
              <div className="bg-slate-900 dark:bg-white p-2 rounded-xl group-hover:scale-105 transition-transform duration-300">
                <Icons.Bot className="w-5 h-5 text-white dark:text-slate-900" />
              </div>
              <span className="text-xl font-black tracking-tight text-slate-900 dark:text-white">{settings?.site_title || '千禧的个人博客'}<span className="text-primary-500">.</span></span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`text-sm font-medium transition-colors relative py-1 ${location.pathname === link.path
                    ? 'text-slate-900 dark:text-white font-bold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                >
                  {link.label}
                  {location.pathname === link.path && (
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary-500 rounded-full"></span>
                  )}
                </Link>
              ))}
            </nav>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              {/* Desktop Search */}
              <form
                className="hidden sm:flex relative group"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (searchQuery.trim()) {
                    navigate(`/articles?search=${encodeURIComponent(searchQuery.trim())}`);
                    setSearchQuery('');
                  }
                }}
              >
                <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
                <input
                  type="text"
                  placeholder="搜索文章..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-1.5 text-sm bg-slate-100/50 dark:bg-slate-700/50 border border-transparent rounded-full w-40 focus:w-56 focus:bg-white dark:focus:bg-slate-700 focus:border-primary-100 dark:focus:border-primary-600 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900 outline-none transition-all duration-300 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500"
                />
              </form>

              {/* Mobile Search Icon */}
              <button
                className="sm:hidden p-2 text-slate-500 dark:text-slate-400 hover:text-primary-500 transition-colors"
                onClick={() => navigate('/articles?search=')}
                title="搜索文章"
              >
                <Icons.Search className="w-5 h-5" />
              </button>

              {/* Theme Toggle - 月亮/太阳 */}
              <button
                onClick={toggleTheme}
                className="flex items-center justify-center w-9 h-9 rounded-xl text-slate-500 dark:text-slate-400 bg-slate-100/50 dark:bg-slate-800/50 hover:bg-amber-100 dark:hover:bg-amber-900/30 hover:text-amber-600 dark:hover:text-amber-400 transition-all duration-300"
                title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
              >
                {theme === 'dark' ? (
                  <Icons.Sun className="w-5 h-5 animate-pulse-slow" />
                ) : (
                  <Icons.Moon className="w-5 h-5" />
                )}
              </button>

              <Link to="/admin">
                <Button size="sm" variant="ghost" className="hidden sm:flex text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <Icons.User className="w-4 h-4" />
                </Button>
              </Link>
              <button
                className="md:hidden p-2 text-slate-600 dark:text-slate-400"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                {isMobileMenuOpen ? <Icons.X /> : <Icons.Menu />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-4 space-y-2 shadow-lg">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className="block py-3 px-4 text-base font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-primary-600 rounded-xl transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </header>

      <main className="flex-grow pt-16">
        <Outlet />
      </main>

      <footer className="bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 mt-auto transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 dark:text-slate-200">{settings?.site_title || '千禧的个人博客'}.</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">v2.0</span>
              </div>
              <span className="text-sm text-slate-500 dark:text-slate-400">{settings?.site_description || '记录技术与生活的点滴'}</span>
            </div>
            <div className="flex gap-8 text-sm text-slate-500 dark:text-slate-400 font-medium">
              {settings?.contact?.github && (
                <a href={settings.contact.github} className="hover:text-slate-900 dark:hover:text-white transition-colors" target="_blank" rel="noreferrer">GitHub</a>
              )}
              {settings?.contact?.bilibili && (
                <a href={settings.contact.bilibili} className="hover:text-slate-900 dark:hover:text-white transition-colors" target="_blank" rel="noreferrer">Bilibili</a>
              )}
            </div>
          </div>
        </div>
      </footer>

      <DesktopPet />
    </div>
  );
};

export default PublicLayout;
