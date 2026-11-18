/**
 * 用户中心工作台（需登录）
 * 左侧导航栏（5 个分组）：
 * - profile: 个人资料（头像上传裁剪、昵称、简介、GitHub/B站/个人网站）
 * - security: 账号安全（首次设置正式用户名、设置/修改密码 + 刷新会话 Token、绑定/更换邮箱）
 * - content: 我的内容（我的文章 / 我的提示词 / 社区主题 / 评论记录）
 * - collections: 收藏与点赞（站内 DB 收藏 + 社区点赞记录）
 * - notifications: 消息通知（站内收件箱 + 标记已读/全部已读）
 */
import React, { useState, useEffect, useRef } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { Button, Badge, StatusPill, EmptyState, Input, Textarea, Select } from '../components/Shared';
import { ListSkeleton } from '../components/Skeleton';
import Avatar from '../components/Avatar';
import CoverCropper from '../components/CoverCropper';
import { useAuth, UserSession } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { uploadAvatar } from '../api/upload';
import { ForumThreadListItem } from '../api/forum';
import {
  ProfileUpdate,
  UserArticleListItem,
  UserArticleStatus,
  MyPrompt,
  MyCommentItem,
  BookmarkItem,
  BookmarkTargetType,
  MyLikesResponse,
  NotificationItem,
  getMyArticles,
  submitMyArticle,
  deleteMyArticle,
  updateCurrentUser,
  updateMyUsername,
  updateCurrentUserPassword,
  sendBindEmailCode,
  bindEmail,
  getMyPrompts,
  updateMyPrompt,
  deleteMyPrompt,
  getMyThreads,
  getMyComments,
  getMyBookmarks,
  toggleBookmark,
  getMyLikes,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../api/users';
import { errorText } from '../utils/errors';
import { buildBilibiliUrl, buildGithubUrl, safeExternalUrl, safeRedirectPath } from '../utils/urls';
import { formatRelativeTimeZh } from '../utils/helpers';

type WorkspaceTab = 'profile' | 'security' | 'content' | 'collections' | 'notifications';
type ContentSubTab = 'articles' | 'prompts' | 'threads' | 'comments';
type ArticleFilterTab = 'all' | UserArticleStatus;

const VALID_TABS: WorkspaceTab[] = ['profile', 'security', 'content', 'collections', 'notifications'];

const ARTICLE_STATUS_BADGES: Record<UserArticleStatus, { label: string; color: 'slate' | 'amber' | 'emerald' | 'red' }> = {
  draft: { label: '草稿', color: 'slate' },
  pending_review: { label: '待审核', color: 'amber' },
  published: { label: '已发布', color: 'emerald' },
  rejected: { label: '已驳回', color: 'red' },
};

const PROMPT_STATUS_BADGES: Record<string, { label: string; color: 'amber' | 'emerald' | 'red' | 'slate' }> = {
  pending: { label: '待审核', color: 'amber' },
  approved: { label: '已通过', color: 'emerald' },
  rejected: { label: '已驳回', color: 'red' },
};

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,30}$/;

const formatTimeAgo = formatRelativeTimeZh;

const UserCenter: React.FC = () => {
  const {
    user,
    isAuthenticated,
    isLoading,
    refreshAdmin,
    updateTokenAndRefresh,
    unreadCount,
    refreshUnreadCount,
  } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const paramTab = searchParams.get('tab') as WorkspaceTab | null;
  const activeTab: WorkspaceTab = paramTab && VALID_TABS.includes(paramTab) ? paramTab : 'profile';

  const setActiveTab = (tab: WorkspaceTab) => {
    setSearchParams({ tab }, { replace: true });
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <ListSkeleton rows={4} />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login?redirect=%2Fuser" replace />;
  }

  const handleAuthError = (error: any): boolean => {
    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      navigate('/login?redirect=%2Fuser', { replace: true });
      return true;
    }
    return false;
  };

  const needsOnboarding = user.username_customized === false || user.has_password === false;

  const navItems: Array<{ key: WorkspaceTab; label: string; icon: React.ComponentType<any>; badge?: number; dot?: boolean }> = [
    { key: 'profile', label: '个人资料', icon: Icons.User },
    { key: 'security', label: '账号安全', icon: Icons.Shield, dot: needsOnboarding },
    { key: 'content', label: '我的内容', icon: Icons.FileText },
    { key: 'collections', label: '收藏与点赞', icon: Icons.Bookmark },
    { key: 'notifications', label: '消息通知', icon: Icons.Bell, badge: unreadCount },
  ];

  const roleBadge =
    user.role === 'super_admin' ? '站长' : user.role === 'admin' ? '管理员' : '注册用户';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
      {/* Header Summary Card */}
      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Avatar
            name={user.display_name || user.username}
            avatarUrl={user.avatar_url}
            className="w-14 h-14 text-xl"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white truncate">
                {user.display_name || user.username}
              </h1>
              <Badge color={user.role === 'user' ? 'primary' : 'emerald'}>{roleBadge}</Badge>
              {user.email_verified && (
                <StatusPill tone="emerald" dot>
                  邮箱已验证
                </StatusPill>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
              <span className="font-mono">@{user.username}</span>
              {user.email && (
                <>
                  <span>·</span>
                  <span>{user.email}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link to={`/user/${encodeURIComponent(user.username)}`}>
            <Button size="sm" variant="outline">
              <Icons.Globe className="w-3.5 h-3.5" />
              <span>公开主页</span>
            </Button>
          </Link>
          <Link to="/write">
            <Button size="sm">
              <Icons.Pencil className="w-3.5 h-3.5" />
              <span>写文章</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Onboarding Banner */}
      {needsOnboarding && (
        <div className="rounded-xl border border-amber-200/90 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <Icons.Shield className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              当前账号为邮箱验证码快速创建：
              {user.username_customized === false && '可设置一次专属正式用户名'}
              {user.username_customized === false && user.has_password === false && '，'}
              {user.has_password === false && '建议设置登录密码以便后续使用密码登录'}。
            </span>
          </div>
          {activeTab !== 'security' && (
            <Button size="sm" variant="outline" onClick={() => setActiveTab('security')} className="shrink-0">
              前往完善 →
            </Button>
          )}
        </div>
      )}

      {/* Workspace Shell */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-6 items-start">
        {/* Sidebar Navigation */}
        <aside className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-2 lg:sticky lg:top-24">
          <nav className="flex lg:flex-col gap-1 overflow-x-auto" aria-label="用户中心菜单">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveTab(item.key)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  />
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="ml-auto px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-rose-500 text-white leading-none">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                  {item.dot && !item.badge && (
                    <span className="ml-auto w-2 h-2 rounded-full bg-amber-500" title="待完善" />
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Panel */}
        <div className="min-w-0 space-y-6">
          {activeTab === 'profile' && (
            <ProfileTab
              user={user}
              onAuthError={handleAuthError}
              onSaved={refreshAdmin}
              onGoSecurity={() => setActiveTab('security')}
              showToast={showToast}
            />
          )}

          {activeTab === 'security' && (
            <SecurityTab
              user={user}
              onAuthError={handleAuthError}
              onSaved={refreshAdmin}
              onUpdateToken={updateTokenAndRefresh}
              showToast={showToast}
            />
          )}

          {activeTab === 'content' && (
            <ContentTab onAuthError={handleAuthError} showToast={showToast} />
          )}

          {activeTab === 'collections' && (
            <CollectionsTab onAuthError={handleAuthError} showToast={showToast} />
          )}

          {activeTab === 'notifications' && (
            <NotificationsTab
              onAuthError={handleAuthError}
              refreshUnreadCount={refreshUnreadCount}
              showToast={showToast}
            />
          )}
        </div>
      </div>
    </div>
  );
};

/* ==================== Tab 1: 个人资料（含头像裁剪上传 + 社交主页链接） ==================== */
const ProfileTab: React.FC<{
  user: UserSession;
  onAuthError: (e: any) => boolean;
  onSaved: () => Promise<void>;
  onGoSecurity: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}> = ({ user, onAuthError, onSaved, onGoSecurity, showToast }) => {
  const [displayName, setDisplayName] = useState(user.display_name || '');
  const [bio, setBio] = useState(user.bio || '');
  const [github, setGithub] = useState(user.github || '');
  const [bilibili, setBilibili] = useState(user.bilibili || '');
  const [website, setWebsite] = useState(user.website || '');
  const [saving, setSaving] = useState(false);

  const [cropperSrc, setCropperSrc] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDisplayName(user.display_name || '');
    setBio(user.bio || '');
    setGithub(user.github || '');
    setBilibili(user.bilibili || '');
    setWebsite(user.website || '');
  }, [user]);

  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('头像图片大小不能超过 5MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCropperSrc(reader.result as string);
    reader.readAsDataURL(file);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const handleAvatarCropComplete = async (blob: Blob) => {
    setCropperSrc('');
    setUploadingAvatar(true);
    try {
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      const res = await uploadAvatar(file);
      await updateCurrentUser({ avatar_url: res.url });
      await onSaved();
      showToast('头像已更新', 'success');
    } catch (error: any) {
      if (!onAuthError(error)) {
        showToast(errorText(error, '头像上传失败'), 'error');
      }
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = displayName.trim();
    if (!cleanName) {
      showToast('显示昵称不能为空', 'error');
      return;
    }
    if (website.trim() && !safeExternalUrl(website.trim())) {
      showToast('个人网站需以 http:// 或 https:// 开头', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload: ProfileUpdate = {
        display_name: cleanName,
        bio: bio.trim(),
        github: github.trim(),
        bilibili: bilibili.trim(),
        website: website.trim(),
      };
      await updateCurrentUser(payload);
      await onSaved();
      showToast('个人资料已保存', 'success');
    } catch (error: any) {
      if (!onAuthError(error)) {
        showToast(errorText(error, '保存失败'), 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const previewGithub = buildGithubUrl(github);
  const previewBili = buildBilibiliUrl(bilibili);
  const previewWeb = safeExternalUrl(website);

  return (
    <>
      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-6 space-y-6">
        <div className="border-b border-slate-100 dark:border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">个人资料</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              对外公开展示在你的作者主页与社区讨论卡片上
            </p>
          </div>
          <Link
            to={`/user/${encodeURIComponent(user.username)}`}
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1"
          >
            <span>预览公开主页</span>
            <Icons.ExternalLink className="w-3 h-3" />
          </Link>
        </div>

        {/* Avatar Row */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
          <Avatar
            name={user.display_name || user.username}
            avatarUrl={user.avatar_url}
            className="w-16 h-16 text-2xl"
          />
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer transition-colors">
                <Icons.Upload className="w-3.5 h-3.5" />
                <span>{uploadingAvatar ? '上传中...' : '更换头像'}</span>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarFileSelect}
                  disabled={uploadingAvatar}
                  className="hidden"
                />
              </label>
              {user.avatar_url && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await updateCurrentUser({ avatar_url: '' });
                      await onSaved();
                      showToast('已恢复默认字符头像', 'info');
                    } catch (err: any) {
                      if (!onAuthError(err)) showToast(errorText(err, '操作失败'), 'error');
                    }
                  }}
                >
                  恢复默认
                </Button>
              )}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              支持 JPG / PNG / WebP（5MB 以内），上传后将裁剪为 1:1 圆形头像并持久化存储
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                显示昵称 <span className="text-rose-500">*</span>
              </label>
              <Input
                type="text"
                required
                maxLength={100}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="对外展示的名字"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                绑定邮箱
              </label>
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm">
                <span className="truncate text-slate-700 dark:text-slate-300">
                  {user.email || '尚未绑定邮箱'}
                </span>
                <button
                  type="button"
                  onClick={onGoSecurity}
                  className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline shrink-0"
                >
                  {user.email ? '更换' : '去绑定'}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              个人简介
            </label>
            <Textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="介绍一下你的技术方向、关注领域或开源项目..."
              maxLength={400}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                GitHub 用户名或链接
              </label>
              <Input
                type="text"
                value={github}
                onChange={(e) => setGithub(e.target.value)}
                placeholder="例如 octocat 或完整链接"
              />
              {github.trim() && !previewGithub && (
                <p className="mt-1 text-[11px] text-rose-500">格式无效，仅支持用户名或 https 链接</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                B站 UID 或空间链接
              </label>
              <Input
                type="text"
                value={bilibili}
                onChange={(e) => setBilibili(e.target.value)}
                placeholder="例如数字 UID 或空间 URL"
              />
              {bilibili.trim() && !previewBili && (
                <p className="mt-1 text-[11px] text-rose-500">请填写纯数字 UID 或 https 链接</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                个人网站 / 主页
              </label>
              <Input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.com"
              />
              {website.trim() && !previewWeb && (
                <p className="mt-1 text-[11px] text-rose-500">必须以 http:// 或 https:// 开头</p>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? '保存中...' : '保存个人资料'}
            </Button>
          </div>
        </form>
      </div>

      {cropperSrc && (
        <CoverCropper
          imageSrc={cropperSrc}
          aspect={1}
          title="裁剪个人头像"
          onCropComplete={handleAvatarCropComplete}
          onCancel={() => setCropperSrc('')}
        />
      )}
    </>
  );
};

/* ==================== Tab 2: 账号安全（用户名定制 + 首次设密/改密 + 绑定邮箱） ==================== */
const SecurityTab: React.FC<{
  user: UserSession;
  onAuthError: (e: any) => boolean;
  onSaved: () => Promise<void>;
  onUpdateToken: (token: string) => Promise<UserSession | null>;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}> = ({ user, onAuthError, onSaved, onUpdateToken, showToast }) => {
  // 1. 用户名设置
  const [newUsername, setNewUsername] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);

  // 2. 密码设置/修改
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // 3. 绑定邮箱
  const [emailInput, setEmailInput] = useState(user.email || '');
  const [emailCode, setEmailCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [bindingEmail, setBindingEmail] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const hasPassword = user.has_password !== false;
  const usernameCustomized = user.username_customized !== false;

  const handleSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newUsername.trim();
    if (!USERNAME_RE.test(clean)) {
      showToast('用户名需为 3-30 位字母、数字、下划线或连字符', 'error');
      return;
    }
    setSavingUsername(true);
    try {
      await updateMyUsername(clean);
      await onSaved();
      setNewUsername('');
      showToast('正式用户名设置成功', 'success');
    } catch (error: any) {
      if (!onAuthError(error)) {
        showToast(errorText(error, '用户名设置失败'), 'error');
      }
    } finally {
      setSavingUsername(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      showToast('新密码至少 8 位字符', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('两次输入的密码不一致', 'error');
      return;
    }
    setSavingPassword(true);
    try {
      const res = await updateCurrentUserPassword({
        ...(hasPassword ? { old_password: oldPassword } : {}),
        new_password: newPassword,
      });
      await onUpdateToken(res.access_token);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast(res.message || '密码已更新，当前会话已自动刷新', 'success');
    } catch (error: any) {
      if (!onAuthError(error)) {
        showToast(errorText(error, '密码更新失败'), 'error');
      }
    } finally {
      setSavingPassword(false);
    }
  };

  const startCooldown = () => {
    setCooldown(60);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setCooldown((c) => {
        if (c <= 1 && timerRef.current) {
          window.clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const handleSendEmailCode = async () => {
    const cleanEmail = emailInput.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      showToast('请输入有效的邮箱地址', 'error');
      return;
    }
    setSendingCode(true);
    try {
      const res = await sendBindEmailCode(cleanEmail);
      showToast(res.message || '验证码已发送，请查收邮件', 'info');
      startCooldown();
    } catch (error: any) {
      if (!onAuthError(error)) {
        showToast(errorText(error, '发送验证码失败'), 'error');
      }
    } finally {
      setSendingCode(false);
    }
  };

  const handleBindEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBindingEmail(true);
    try {
      await bindEmail({ email: emailInput.trim(), code: emailCode.trim() });
      await onSaved();
      setEmailCode('');
      showToast('邮箱绑定已更新', 'success');
    } catch (error: any) {
      if (!onAuthError(error)) {
        showToast(errorText(error, '邮箱绑定失败'), 'error');
      }
    } finally {
      setBindingEmail(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Username Card */}
      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">用户名与主页路径</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              用于个人公开主页 <code className="font-mono">/#/user/{user.username}</code> 与密码登录
            </p>
          </div>
          {usernameCustomized ? (
            <StatusPill tone="emerald" dot>
              已确认
            </StatusPill>
          ) : (
            <StatusPill tone="amber" dot>
              可修改一次
            </StatusPill>
          )}
        </div>

        {usernameCustomized ? (
          <div className="flex items-center justify-between text-sm bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 rounded-lg px-3.5 py-2.5">
            <span className="font-mono text-slate-800 dark:text-slate-200">@{user.username}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">正式用户名已锁定</span>
          </div>
        ) : (
          <form onSubmit={handleSaveUsername} className="space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              系统当前为你分配了临时用户名 <code className="font-mono px-1 bg-slate-100 dark:bg-slate-800 rounded">@{user.username}</code>。你可以在下方将其自定义为正式用户名（仅限设置一次）。
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="3-30 位字母、数字、_ 或 -"
                minLength={3}
                maxLength={30}
                required
              />
              <Button type="submit" disabled={savingUsername} className="shrink-0">
                {savingUsername ? '保存中...' : '确认设置用户名'}
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* 2. Password Card */}
      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {hasPassword ? '修改登录密码' : '设置初始登录密码'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {hasPassword
                ? '修改密码后将签发新凭证，其他旧设备会话将自动下线'
                : '设置密码后，你也可以使用用户名或邮箱 + 密码登录'}
            </p>
          </div>
          {!hasPassword && (
            <StatusPill tone="amber" dot>
              未设置密码
            </StatusPill>
          )}
        </div>

        <form onSubmit={handleSavePassword} className="space-y-4 max-w-md">
          {hasPassword && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                当前密码 <span className="text-rose-500">*</span>
              </label>
              <Input
                type={showPwd ? 'text' : 'password'}
                required
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="验证当前密码"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                {hasPassword ? '新密码' : '设置密码'} <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                {showPwd ? '隐藏密码' : '显示密码'}
              </button>
            </div>
            <Input
              type={showPwd ? 'text' : 'password'}
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="至少 8 位字符"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              确认密码 <span className="text-rose-500">*</span>
            </label>
            <Input
              type={showPwd ? 'text' : 'password'}
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入新密码"
            />
          </div>

          <Button type="submit" disabled={savingPassword}>
            {savingPassword ? '提交中...' : hasPassword ? '更新密码' : '保存密码'}
          </Button>
        </form>
      </div>

      {/* 3. Email Binding Card */}
      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">邮箱绑定与更换</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              当前邮箱：{user.email || '未绑定'}（用于免密登录、密码找回与审核通知）
            </p>
          </div>
          {user.email_verified ? (
            <StatusPill tone="emerald" dot>
              已验证
            </StatusPill>
          ) : (
            <StatusPill tone="slate">未验证</StatusPill>
          )}
        </div>

        <form onSubmit={handleBindEmail} className="space-y-4 max-w-md">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              邮箱地址
            </label>
            <Input
              type="email"
              required
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="name@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              6 位验证码
            </label>
            <div className="flex gap-2">
              <Input
                type="text"
                inputMode="numeric"
                required
                maxLength={6}
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
                placeholder="6 位数字"
                className="font-mono tracking-[0.25em]"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleSendEmailCode}
                disabled={sendingCode || cooldown > 0}
                className="shrink-0 min-w-[104px]"
              >
                {cooldown > 0 ? `${cooldown}s` : sendingCode ? '发送中...' : '发送验证码'}
              </Button>
            </div>
          </div>

          <Button type="submit" disabled={bindingEmail || emailCode.length < 6}>
            {bindingEmail ? '绑定中...' : user.email ? '确认更换邮箱' : '确认绑定邮箱'}
          </Button>
        </form>
      </div>
    </div>
  );
};

/* ==================== Tab 3: 我的内容（文章 / 提示词 / 社区主题 / 评论记录） ==================== */
const ContentTab: React.FC<{
  onAuthError: (e: any) => boolean;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}> = ({ onAuthError, showToast }) => {
  const { confirm, confirmDialog } = useConfirm();
  const [subTab, setSubTab] = useState<ContentSubTab>('articles');

  // Articles
  const [articleFilter, setArticleFilter] = useState<ArticleFilterTab>('all');
  const [articles, setArticles] = useState<UserArticleListItem[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(true);
  const [articlePage, setArticlePage] = useState(1);
  const [articleTotalPages, setArticleTotalPages] = useState(1);
  const [actingArticleId, setActingArticleId] = useState<number | null>(null);

  // Prompts
  const [prompts, setPrompts] = useState<MyPrompt[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<number | null>(null);
  const [promptEditData, setPromptEditData] = useState({
    title: '',
    description: '',
    content: '',
    category: 'Dev',
  });
  const [actingPromptId, setActingPromptId] = useState<number | null>(null);

  // Threads
  const [threads, setThreads] = useState<ForumThreadListItem[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadPage, setThreadPage] = useState(1);
  const [threadTotalPages, setThreadTotalPages] = useState(1);

  // Comments
  const [comments, setComments] = useState<MyCommentItem[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentPage, setCommentPage] = useState(1);
  const [commentTotalPages, setCommentTotalPages] = useState(1);

  const loadArticles = async () => {
    setArticlesLoading(true);
    try {
      const res = await getMyArticles({
        status: articleFilter === 'all' ? undefined : articleFilter,
        page: articlePage,
        page_size: 10,
      });
      setArticles(res.data || []);
      setArticleTotalPages(res.total_pages || 1);
    } catch (error: any) {
      if (!onAuthError(error)) setArticles([]);
    } finally {
      setArticlesLoading(false);
    }
  };

  const loadPrompts = async () => {
    setPromptsLoading(true);
    try {
      setPrompts(await getMyPrompts());
    } catch (error: any) {
      if (!onAuthError(error)) setPrompts([]);
    } finally {
      setPromptsLoading(false);
    }
  };

  const loadThreads = async () => {
    setThreadsLoading(true);
    try {
      const res = await getMyThreads({ page: threadPage, page_size: 10 });
      setThreads(res.data || []);
      setThreadTotalPages(res.total_pages || 1);
    } catch (error: any) {
      if (!onAuthError(error)) setThreads([]);
    } finally {
      setThreadsLoading(false);
    }
  };

  const loadComments = async () => {
    setCommentsLoading(true);
    try {
      const res = await getMyComments({ page: commentPage, page_size: 10 });
      setComments(res.data || []);
      setCommentTotalPages(res.total_pages || 1);
    } catch (error: any) {
      if (!onAuthError(error)) setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  };

  useEffect(() => {
    if (subTab === 'articles') loadArticles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, articleFilter, articlePage]);

  useEffect(() => {
    if (subTab === 'prompts') loadPrompts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab]);

  useEffect(() => {
    if (subTab === 'threads') loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, threadPage]);

  useEffect(() => {
    if (subTab === 'comments') loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, commentPage]);

  const handleArticleSubmitReview = async (id: number) => {
    setActingArticleId(id);
    try {
      await submitMyArticle(id);
      showToast('已提交审核', 'success');
      await loadArticles();
    } catch (error: any) {
      if (!onAuthError(error)) showToast(errorText(error, '提交失败'), 'error');
    } finally {
      setActingArticleId(null);
    }
  };

  const handleArticleDelete = async (id: number) => {
    const ok = await confirm({
      title: '删除文章',
      message: '确定要删除这篇文章吗？删除后不可恢复。',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    setActingArticleId(id);
    try {
      await deleteMyArticle(id);
      showToast('文章已删除', 'info');
      await loadArticles();
    } catch (error: any) {
      if (!onAuthError(error)) showToast(errorText(error, '删除失败'), 'error');
    } finally {
      setActingArticleId(null);
    }
  };

  const handlePromptSave = async (id: number) => {
    setActingPromptId(id);
    try {
      await updateMyPrompt(id, {
        title: promptEditData.title,
        description: promptEditData.description || undefined,
        content: promptEditData.content,
        category: promptEditData.category,
      });
      setEditingPromptId(null);
      showToast('已保存并重新提交审核', 'success');
      await loadPrompts();
    } catch (error: any) {
      if (!onAuthError(error)) showToast(errorText(error, '保存失败'), 'error');
    } finally {
      setActingPromptId(null);
    }
  };

  const handlePromptDelete = async (id: number) => {
    const ok = await confirm({
      title: '删除提示词',
      message: '确定删除这条提示词吗？删除后不可恢复。',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    setActingPromptId(id);
    try {
      await deleteMyPrompt(id);
      showToast('提示词已删除', 'info');
      await loadPrompts();
    } catch (error: any) {
      if (!onAuthError(error)) showToast(errorText(error, '删除失败'), 'error');
    } finally {
      setActingPromptId(null);
    }
  };

  const subTabs: Array<{ key: ContentSubTab; label: string }> = [
    { key: 'articles', label: '我的文章' },
    { key: 'prompts', label: '我的提示词' },
    { key: 'threads', label: '社区主题' },
    { key: 'comments', label: '评论记录' },
  ];

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex flex-wrap gap-1.5">
          {subTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setSubTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                subTab === t.key
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {subTab === 'articles' && (
          <Link to="/write">
            <Button size="sm">
              <Icons.FilePlus className="w-3.5 h-3.5" />
              <span>写新文章</span>
            </Button>
          </Link>
        )}
        {subTab === 'prompts' && (
          <Link to="/prompts">
            <Button size="sm" variant="outline">
              <Icons.Sparkles className="w-3.5 h-3.5" />
              <span>去 Prompt 库</span>
            </Button>
          </Link>
        )}
        {subTab === 'threads' && (
          <Link to="/forum/new">
            <Button size="sm">
              <Icons.Plus className="w-3.5 h-3.5" />
              <span>发起新讨论</span>
            </Button>
          </Link>
        )}
      </div>

      {/* SubTab: Articles */}
      {subTab === 'articles' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {([
              { key: 'all', label: '全部' },
              { key: 'draft', label: '草稿' },
              { key: 'pending_review', label: '待审核' },
              { key: 'published', label: '已发布' },
              { key: 'rejected', label: '已驳回' },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setArticleFilter(tab.key);
                  setArticlePage(1);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                  articleFilter === tab.key
                    ? 'border-primary-500/60 bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {articlesLoading ? (
            <ListSkeleton rows={3} />
          ) : articles.length === 0 ? (
            <EmptyState
              icon={<Icons.FileText className="w-5 h-5" />}
              title="还没有相关文章"
              description="把零散笔记整理成技术长文，审核通过后即在全站展示"
              action={
                <Link to="/write">
                  <Button size="sm">开始创作</Button>
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-slate-200/70 dark:divide-slate-800 border border-slate-200/70 dark:border-slate-800 rounded-xl overflow-hidden">
              {articles.map((article) => {
                const badge = ARTICLE_STATUS_BADGES[article.status] || ARTICLE_STATUS_BADGES.draft;
                const editable = article.status === 'draft' || article.status === 'rejected';
                return (
                  <div key={article.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge color={badge.color}>{badge.label}</Badge>
                        {article.category && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">{article.category}</span>
                        )}
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                          {new Date(article.created_at).toLocaleDateString('zh-CN')}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {article.title}
                      </h3>
                      {article.summary && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{article.summary}</p>
                      )}
                      {article.status === 'rejected' && article.review_note && (
                        <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-900/50 rounded-md px-2.5 py-1.5 mt-1">
                          驳回原因：{article.review_note}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {article.status === 'published' && (
                        <Link to={`/articles/${article.id}`}>
                          <Button size="sm" variant="outline">查看</Button>
                        </Link>
                      )}
                      {editable && (
                        <>
                          <Link to={`/write?article_id=${article.id}`}>
                            <Button size="sm" variant="outline">编辑</Button>
                          </Link>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={actingArticleId === article.id}
                            onClick={() => handleArticleSubmitReview(article.id)}
                          >
                            {actingArticleId === article.id ? '提交中...' : '提交审核'}
                          </Button>
                        </>
                      )}
                      {article.status !== 'published' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                          disabled={actingArticleId === article.id}
                          onClick={() => handleArticleDelete(article.id)}
                        >
                          删除
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {articleTotalPages > 1 && (
            <Pagination page={articlePage} totalPages={articleTotalPages} onChange={setArticlePage} />
          )}
        </div>
      )}

      {/* SubTab: Prompts */}
      {subTab === 'prompts' && (
        <div>
          {promptsLoading ? (
            <ListSkeleton rows={3} />
          ) : prompts.length === 0 ? (
            <EmptyState
              icon={<Icons.Sparkles className="w-5 h-5" />}
              title="还没有投稿过提示词"
              description="去 Prompt 库提交好用模板，每天最多提交 3 条"
              action={
                <Link to="/prompts">
                  <Button size="sm" variant="outline">前往 Prompt 库</Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {prompts.map((p) => {
                const badge = PROMPT_STATUS_BADGES[p.status] || PROMPT_STATUS_BADGES.pending;
                const manageable = p.status === 'pending' || p.status === 'rejected';
                return (
                  <div
                    key={p.id}
                    className="rounded-xl border border-slate-200/70 dark:border-slate-800 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge color={badge.color}>{badge.label}</Badge>
                          <Badge color="slate">{p.category}</Badge>
                          <span className="text-xs text-slate-400 font-mono">
                            {new Date(p.created_at).toLocaleDateString('zh-CN')}
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                          {p.status === 'approved' ? (
                            <Link to={`/prompts/${p.id}`} className="hover:text-primary-600">
                              {p.title}
                            </Link>
                          ) : (
                            p.title
                          )}
                        </h4>
                        <p className="text-xs font-mono text-slate-500 dark:text-slate-400 line-clamp-2">
                          {p.content}
                        </p>
                      </div>
                      {manageable && (
                        <div className="flex gap-1.5 shrink-0">
                          {editingPromptId !== p.id && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingPromptId(p.id);
                                setPromptEditData({
                                  title: p.title,
                                  description: p.description || '',
                                  content: p.content,
                                  category: p.category,
                                });
                              }}
                            >
                              编辑
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                            disabled={actingPromptId === p.id}
                            onClick={() => handlePromptDelete(p.id)}
                          >
                            删除
                          </Button>
                        </div>
                      )}
                    </div>

                    {editingPromptId === p.id && (
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                        <Input
                          value={promptEditData.title}
                          onChange={(e) => setPromptEditData({ ...promptEditData, title: e.target.value })}
                          placeholder="标题"
                        />
                        <Textarea
                          rows={3}
                          value={promptEditData.content}
                          onChange={(e) => setPromptEditData({ ...promptEditData, content: e.target.value })}
                          placeholder="Prompt 正文"
                          className="font-mono text-xs"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Select
                            value={promptEditData.category}
                            onChange={(e) => setPromptEditData({ ...promptEditData, category: e.target.value })}
                          >
                            {['Dev', 'Writing', 'Business', 'Academic', 'Thinking', 'Growth', 'Other'].map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </Select>
                          <Button
                            size="sm"
                            disabled={actingPromptId === p.id}
                            onClick={() => handlePromptSave(p.id)}
                          >
                            {actingPromptId === p.id ? '保存中...' : '保存并重审'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingPromptId(null)}>
                            取消
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SubTab: Threads */}
      {subTab === 'threads' && (
        <div className="space-y-4">
          {threadsLoading ? (
            <ListSkeleton rows={3} />
          ) : threads.length === 0 ? (
            <EmptyState
              icon={<Icons.MessagesSquare className="w-5 h-5" />}
              title="还没有发过社区主题"
              description="去社区发起技术讨论、反馈 Bug 或向千禧提问"
              action={
                <Link to="/forum/new">
                  <Button size="sm">发起主题</Button>
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-slate-200/70 dark:divide-slate-800 border border-slate-200/70 dark:border-slate-800 rounded-xl overflow-hidden">
              {threads.map((t) => (
                <Link
                  key={t.id}
                  to={`/forum/threads/${t.id}`}
                  className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {t.is_pinned && <Badge color="amber">置顶</Badge>}
                      {t.is_solved && <Badge color="emerald">已解决</Badge>}
                      {t.is_hidden && <Badge color="red">已隐藏</Badge>}
                      {t.category_name && <Badge color="slate">{t.category_name}</Badge>}
                    </div>
                    <h4 className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {t.title}
                    </h4>
                    <p className="text-xs text-slate-400">
                      创建于 {new Date(t.created_at).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400 shrink-0 tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <Icons.ThumbsUp className="w-3.5 h-3.5" /> {t.like_count || 0}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Icons.MessageSquare className="w-3.5 h-3.5" /> {t.reply_count}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Icons.Eye className="w-3.5 h-3.5" /> {t.view_count}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {threadTotalPages > 1 && (
            <Pagination page={threadPage} totalPages={threadTotalPages} onChange={setThreadPage} />
          )}
        </div>
      )}

      {/* SubTab: Comments */}
      {subTab === 'comments' && (
        <div className="space-y-4">
          {commentsLoading ? (
            <ListSkeleton rows={3} />
          ) : comments.length === 0 ? (
            <EmptyState
              icon={<Icons.MessageCircle className="w-5 h-5" />}
              title="还没有发表过文章或热点评论"
            />
          ) : (
            <div className="divide-y divide-slate-200/70 dark:divide-slate-800 border border-slate-200/70 dark:border-slate-800 rounded-xl overflow-hidden">
              {comments.map((c) => (
                <Link
                  key={c.id}
                  to={safeRedirectPath(c.link, '/')}
                  className="block p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge color="slate">{c.target_type === 'hotspot' ? 'AI 热点' : '文章'}</Badge>
                      <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                        {c.target_title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-slate-400">
                      {c.edited_at && <span className="text-[11px]">已编辑</span>}
                      <span>{formatTimeAgo(c.created_at)}</span>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">{c.content}</p>
                </Link>
              ))}
            </div>
          )}

          {commentTotalPages > 1 && (
            <Pagination page={commentPage} totalPages={commentTotalPages} onChange={setCommentPage} />
          )}
        </div>
      )}

      {confirmDialog}
    </div>
  );
};

/* ==================== Tab 4: 收藏与点赞 ==================== */
const CollectionsTab: React.FC<{
  onAuthError: (e: any) => boolean;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}> = ({ onAuthError, showToast }) => {
  const [subTab, setSubTab] = useState<'bookmarks' | 'likes'>('bookmarks');
  const [bookmarkFilter, setBookmarkFilter] = useState<'all' | BookmarkTargetType>('all');
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [likes, setLikes] = useState<MyLikesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const loadBookmarks = async () => {
    setLoading(true);
    try {
      const res = await getMyBookmarks({
        target_type: bookmarkFilter === 'all' ? undefined : bookmarkFilter,
        page,
        page_size: 10,
      });
      setBookmarks(res.data || []);
      setTotalPages(res.total_pages || 1);
    } catch (error: any) {
      if (!onAuthError(error)) setBookmarks([]);
    } finally {
      setLoading(false);
    }
  };

  const loadLikes = async () => {
    setLoading(true);
    try {
      setLikes(await getMyLikes({ page: 1, page_size: 20 }));
    } catch (error: any) {
      if (!onAuthError(error)) setLikes(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (subTab === 'bookmarks') loadBookmarks();
    else loadLikes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, bookmarkFilter, page]);

  const handleRemoveBookmark = async (item: BookmarkItem) => {
    try {
      await toggleBookmark(item.target_type, item.target_id);
      setBookmarks((prev) => prev.filter((b) => b.id !== item.id));
      showToast('已取消收藏', 'info');
    } catch (error: any) {
      if (!onAuthError(error)) showToast(errorText(error, '操作失败'), 'error');
    }
  };

  const TYPE_LABELS: Record<BookmarkTargetType, string> = {
    article: '文章',
    hotspot: 'AI 热点',
    prompt: 'Prompt',
    thread: '社区讨论',
  };

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setSubTab('bookmarks')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              subTab === 'bookmarks'
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            我的收藏
          </button>
          <button
            type="button"
            onClick={() => setSubTab('likes')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              subTab === 'likes'
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            社区点赞
          </button>
        </div>

        {subTab === 'bookmarks' && (
          <div className="flex flex-wrap gap-1.5">
            {([
              { key: 'all', label: '全部' },
              { key: 'article', label: '文章' },
              { key: 'hotspot', label: '热点' },
              { key: 'prompt', label: 'Prompt' },
              { key: 'thread', label: '讨论' },
            ] as const).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setBookmarkFilter(f.key);
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                  bookmarkFilter === f.key
                    ? 'border-primary-500/60 bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <ListSkeleton rows={3} />
      ) : subTab === 'bookmarks' ? (
        bookmarks.length === 0 ? (
          <EmptyState
            icon={<Icons.Bookmark className="w-5 h-5" />}
            title="暂无收藏内容"
            description="浏览文章、AI 热点、提示词或社区讨论时，点击收藏按钮即可永久保存到你的账号"
          />
        ) : (
          <div className="space-y-4">
            <div className="divide-y divide-slate-200/70 dark:divide-slate-800 border border-slate-200/70 dark:border-slate-800 rounded-xl overflow-hidden">
              {bookmarks.map((item) => (
                <div key={item.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge color="slate">{TYPE_LABELS[item.target_type] || item.target_type}</Badge>
                      {item.extra?.available === false && (
                        <Badge color="red">原内容已删除或隐藏</Badge>
                      )}
                      <span className="text-xs text-slate-400 font-mono">
                        {formatTimeAgo(item.created_at)}
                      </span>
                    </div>
                    <Link
                      to={safeRedirectPath(item.link, '/')}
                      className="block text-sm font-medium text-slate-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 truncate"
                    >
                      {item.title}
                    </Link>
                    {item.summary && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                        {item.summary}
                      </p>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => handleRemoveBookmark(item)}>
                    取消收藏
                  </Button>
                </div>
              ))}
            </div>
            {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
          </div>
        )
      ) : !likes || (likes.threads.length === 0 && likes.posts.length === 0) ? (
        <EmptyState
          icon={<Icons.ThumbsUp className="w-5 h-5" />}
          title="还没有点赞过社区内容"
        />
      ) : (
        <div className="space-y-6">
          {likes.threads.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                赞过的主题（{likes.total_threads}）
              </h3>
              <div className="divide-y divide-slate-200/70 dark:divide-slate-800 border border-slate-200/70 dark:border-slate-800 rounded-xl overflow-hidden">
                {likes.threads.map((t) => (
                  <Link
                    key={t.id}
                    to={safeRedirectPath(t.link, `/forum/threads/${t.id}`)}
                    className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {t.title}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {t.category_name || '社区'} · {formatTimeAgo(t.liked_at)}
                      </p>
                    </div>
                    <span className="text-xs text-slate-400 tabular-nums shrink-0">
                      {t.like_count} 赞
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {likes.posts.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                赞过的回复（{likes.total_posts}）
              </h3>
              <div className="divide-y divide-slate-200/70 dark:divide-slate-800 border border-slate-200/70 dark:border-slate-800 rounded-xl overflow-hidden">
                {likes.posts.map((p) => (
                  <Link
                    key={p.id}
                    to={safeRedirectPath(p.link, `/forum/threads/${p.thread_id}`)}
                    className="block p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                      <span className="truncate">
                        主题：{p.thread_title}（#{p.floor} 楼）
                      </span>
                      <span className="shrink-0">{formatTimeAgo(p.liked_at)}</span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
                      {p.content_preview}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ==================== Tab 5: 消息通知 ==================== */
const NotificationsTab: React.FC<{
  onAuthError: (e: any) => boolean;
  refreshUnreadCount: () => Promise<void>;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}> = ({ onAuthError, refreshUnreadCount, showToast }) => {
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const res = await getNotifications({ unread_only: unreadOnly, page, page_size: 15 });
      setItems(res.data || []);
      setTotalPages(res.total_pages || 1);
    } catch (error: any) {
      if (!onAuthError(error)) setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadOnly, page]);

  const handleMarkAll = async () => {
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      await refreshUnreadCount();
      showToast('全部通知已标记为已读', 'success');
    } catch (error: any) {
      if (!onAuthError(error)) showToast(errorText(error, '操作失败'), 'error');
    }
  };

  const handleOpen = async (item: NotificationItem) => {
    if (!item.is_read) {
      try {
        await markNotificationRead(item.id);
        setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
        refreshUnreadCount();
      } catch {
        // ignore
      }
    }
    const target = safeRedirectPath(item.link, '/user?tab=content');
    if (target === '/user') {
      navigate('/user?tab=content');
    } else {
      navigate(target);
    }
  };

  const NOTIF_LABELS: Record<string, string> = {
    comment_reply: '评论回复',
    forum_reply: '社区回复',
    forum_accepted: '最佳答案',
    article_review: '文章审核',
    prompt_review: 'Prompt 审核',
  };

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">站内通知</h2>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => {
                setUnreadOnly(e.target.checked);
                setPage(1);
              }}
              className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <span>仅看未读</span>
          </label>
          <Button size="sm" variant="outline" onClick={handleMarkAll}>
            <Icons.CheckCheck className="w-3.5 h-3.5" />
            <span>全部已读</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <ListSkeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Icons.Inbox className="w-5 h-5" />}
          title={unreadOnly ? '没有未读通知' : '收件箱为空'}
          description="评论被回复、主题收到新回复或投稿审核结果变化时将在这里提醒你"
        />
      ) : (
        <div className="space-y-4">
          <div className="divide-y divide-slate-200/70 dark:divide-slate-800 border border-slate-200/70 dark:border-slate-800 rounded-xl overflow-hidden">
            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleOpen(n)}
                className={`w-full text-left p-4 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                  !n.is_read ? 'bg-primary-50/35 dark:bg-primary-950/15' : ''
                }`}
              >
                <span
                  className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                    n.is_read ? 'bg-transparent' : 'bg-primary-500'
                  }`}
                />
                {n.actor_name && (
                  <Avatar
                    name={n.actor_name}
                    avatarUrl={n.actor_avatar || undefined}
                    className="w-8 h-8 text-xs shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge color="slate">{NOTIF_LABELS[n.type] || '通知'}</Badge>
                    <span className="text-xs font-medium text-slate-900 dark:text-white">
                      {n.title}
                    </span>
                    <span className="text-[11px] text-slate-400 ml-auto">
                      {formatTimeAgo(n.created_at)}
                    </span>
                  </div>
                  {n.snippet && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                      {n.snippet}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>

          {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
        </div>
      )}
    </div>
  );
};

const Pagination: React.FC<{ page: number; totalPages: number; onChange: (p: number) => void }> = ({
  page,
  totalPages,
  onChange,
}) => (
  <div className="flex items-center justify-center gap-2 pt-2">
    <Button
      size="sm"
      variant="outline"
      disabled={page <= 1}
      onClick={() => onChange(Math.max(1, page - 1))}
    >
      上一页
    </Button>
    <span className="text-xs font-mono text-slate-500 dark:text-slate-400 px-2">
      {page} / {totalPages}
    </span>
    <Button
      size="sm"
      variant="outline"
      disabled={page >= totalPages}
      onClick={() => onChange(Math.min(totalPages, page + 1))}
    >
      下一页
    </Button>
  </div>
);

export default UserCenter;
