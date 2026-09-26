import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './components/Toast';
import PublicLayout from './layouts/PublicLayout';
import AdminLayout from './layouts/AdminLayout';
import Home from './pages/Home';
import ArticleList from './pages/ArticleList';
import ArticleDetail from './pages/ArticleDetail';
import Archives from './pages/Archives';
import PromptLibrary from './pages/PromptLibrary';
import PromptDetail from './pages/PromptDetail';
import Unsubscribe from './pages/Unsubscribe';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import ArticleManager from './pages/ArticleManager';
import ArticleEditor from './pages/ArticleEditor';
import CommentManager from './pages/CommentManager';
import PromptManager from './pages/PromptManager';
import SubscriberManager from './pages/SubscriberManager';
import Settings from './pages/Settings';
import AdminProfile from './pages/AdminProfile';
import AgentChat from './pages/AgentChat';
import ForumHome from './pages/ForumHome';
import ForumNewThread from './pages/ForumNewThread';
import ForumThreadDetail from './pages/ForumThreadDetail';
import HotspotsList from './pages/HotspotsList';
import HotspotDetail from './pages/HotspotDetail';
import HotspotManager from './pages/HotspotManager';
import HotspotEditor from './pages/HotspotEditor';
import HotspotUploadPage from './pages/HotspotUploadPage';
import AiDaily from './pages/AiDaily';
import Login from './pages/Login';
import Register from './pages/Register';
import UserCenter from './pages/UserCenter';
import AuthorPage from './pages/AuthorPage';
import WritePage from './pages/WritePage';

const App: React.FC = () => {
// ... existing imports
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <HashRouter>
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
          </HashRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
};

export default App;