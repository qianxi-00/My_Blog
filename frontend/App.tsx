import React, { Suspense, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './components/Toast';
import PublicLayout from './layouts/PublicLayout';
import ErrorBoundary from './components/ErrorBoundary';

// 路由级代码分割：33 个页面全部按需加载，避免首屏就下载整个 3MB 主包。
// AdminLayout 属后台壳，同样只在进后台时才拉取。
const AdminLayout = React.lazy(() => import('./layouts/AdminLayout'));

// 公共页面
const Home = React.lazy(() => import('./pages/Home'));
const ArticleList = React.lazy(() => import('./pages/ArticleList'));
const ArticleDetail = React.lazy(() => import('./pages/ArticleDetail'));
const Archives = React.lazy(() => import('./pages/Archives'));
const PromptLibrary = React.lazy(() => import('./pages/PromptLibrary'));
const PromptDetail = React.lazy(() => import('./pages/PromptDetail'));
const Unsubscribe = React.lazy(() => import('./pages/Unsubscribe'));
const ForumHome = React.lazy(() => import('./pages/ForumHome'));
const ForumNewThread = React.lazy(() => import('./pages/ForumNewThread'));
const ForumThreadDetail = React.lazy(() => import('./pages/ForumThreadDetail'));
const HotspotsList = React.lazy(() => import('./pages/HotspotsList'));
const HotspotDetail = React.lazy(() => import('./pages/HotspotDetail'));
const AiDaily = React.lazy(() => import('./pages/AiDaily'));
const Login = React.lazy(() => import('./pages/Login'));
const Register = React.lazy(() => import('./pages/Register'));
const ForgotPassword = React.lazy(() => import('./pages/ForgotPassword'));
const UserCenter = React.lazy(() => import('./pages/UserCenter'));
const AuthorPage = React.lazy(() => import('./pages/AuthorPage'));
const WritePage = React.lazy(() => import('./pages/WritePage'));

// 后台页面
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'));
const AdminLogin = React.lazy(() => import('./pages/AdminLogin'));
const ArticleManager = React.lazy(() => import('./pages/ArticleManager'));
const ArticleEditor = React.lazy(() => import('./pages/ArticleEditor'));
const CommentManager = React.lazy(() => import('./pages/CommentManager'));
const PromptManager = React.lazy(() => import('./pages/PromptManager'));
const SubscriberManager = React.lazy(() => import('./pages/SubscriberManager'));
const Settings = React.lazy(() => import('./pages/Settings'));
const AdminProfile = React.lazy(() => import('./pages/AdminProfile'));
const AgentChat = React.lazy(() => import('./pages/AgentChat'));
const HotspotManager = React.lazy(() => import('./pages/HotspotManager'));
const HotspotEditor = React.lazy(() => import('./pages/HotspotEditor'));
const HotspotUploadPage = React.lazy(() => import('./pages/HotspotUploadPage'));
const AdminAccounts = React.lazy(() => import('./pages/AdminAccounts'));

// 路由切换 / 首次进入页面时的轻量占位：整页文字"加载中..."闪白难看，
// 十三期改成居中 mini spinner（不占满屏，和 page-enter 淡入衔接）
const RouteFallback: React.FC = () => (
  <div className="min-h-[60vh] flex items-center justify-center transition-colors">
    <svg className="w-7 h-7 text-primary-500 animate-spin" viewBox="0 0 24 24" fill="none" aria-label="加载中">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  </div>
);

/**
 * 十三期 B2：路由级切页归顶。全站原本没有 ScrollToTop（切页滚动位置保留），
 * 且 index.css 开着 scroll-behavior:smooth——必须用 'instant' 覆盖，
 * 否则归顶会被 smooth 拖成一段滑行动画。
 */
const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <HashRouter>
            <ScrollToTop />
            <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<PublicLayout />}>
                <Route index element={<Home />} />
                <Route path="articles" element={<ArticleList />} />
                <Route path="articles/:id" element={<ArticleDetail />} />
                <Route path="article/:slug" element={<ArticleDetail />} />
                <Route path="archives" element={<Archives />} />
                <Route path="prompts" element={<PromptLibrary />} />
                <Route path="prompts/:id" element={<PromptDetail />} />
                <Route path="forum" element={<ForumHome />} />
                <Route path="forum/new" element={<ForumNewThread />} />
                <Route path="forum/threads/:id" element={<ForumThreadDetail />} />
                <Route path="hotspots" element={<HotspotsList />} />
                <Route path="ai-daily" element={<AiDaily />} />
                <Route path="hotspots/:id" element={<HotspotDetail />} />
                {/* 用户系统路由 */}
                <Route path="user" element={<UserCenter />} />
                <Route path="user/:username" element={<AuthorPage />} />
                <Route path="write" element={<WritePage />} />
              </Route>

              {/* Unsubscribe (独立页面，不使用 PublicLayout) */}
              <Route path="/unsubscribe/:token" element={<Unsubscribe />} />

              {/* Login / Register（独立全屏页面） */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />

              {/* Admin Login */}
              <Route path="/admin/login" element={<AdminLogin />} />

              {/* Admin Routes */}
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="profile" element={<AdminProfile />} />
                <Route path="posts" element={<ArticleManager />} />
                <Route path="posts/new" element={<ArticleEditor />} />
                <Route path="posts/:id/edit" element={<ArticleEditor />} />
                <Route path="comments" element={<CommentManager />} />
                <Route path="users" element={<AdminAccounts />} />
                <Route path="prompts" element={<PromptManager />} />
                <Route path="subscribers" element={<SubscriberManager />} />
                <Route path="ai-agent" element={<AgentChat />} />
                <Route path="settings" element={<Settings />} />
                <Route path="hotspots" element={<HotspotManager />} />
                <Route path="hotspots/upload" element={<HotspotUploadPage />} />
                <Route path="hotspots/:id/edit" element={<HotspotEditor />} />
                <Route path="hotspots/:id" element={<HotspotEditor />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
          </HashRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
