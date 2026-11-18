/**
 * 统一登录页面：支持密码登录（用户名/邮箱）与邮箱验证码免密登录（未注册且开放注册时自动建号）
 */
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { Button, Input } from '../components/Shared';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { sendLoginCode } from '../api/auth';
import { getPublicSettings } from '../api/stats';
import { errorText } from '../utils/errors';
import { safeRedirectPath } from '../utils/urls';

type LoginTab = 'password' | 'code';

const Login: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, loginWithCode, isAuthenticated, isAdmin } = useAuth();
  const { showToast } = useToast();

  const rawRedirect = searchParams.get('redirect');
  const safeRedirect = safeRedirectPath(rawRedirect, '');
  const validCustomRedirect =
    safeRedirect &&
    safeRedirect !== '/login' &&
    safeRedirect !== '/register' &&
    safeRedirect !== '/forgot-password'
      ? safeRedirect
      : '';

  const [tab, setTab] = useState<LoginTab>('password');
  const [registrationEnabled, setRegistrationEnabled] = useState(true);

  // 密码登录表单
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 验证码登录表单
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [suggestOtpSwitch, setSuggestOtpSwitch] = useState(false);

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    getPublicSettings()
      .then((s) => {
        if (typeof s.registration_enabled === 'boolean') {
          setRegistrationEnabled(s.registration_enabled);
        }
      })
      .catch(() => {});

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      if (validCustomRedirect) {
        navigate(validCustomRedirect, { replace: true });
      } else {
        navigate(isAdmin ? '/admin' : '/user', { replace: true });
      }
    }
  }, [isAuthenticated, isAdmin, validCustomRedirect, navigate]);

  const startCooldown = (seconds = 60) => {
    setCooldown(seconds);
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

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setSuggestOtpSwitch(false);
    setLoading(true);
    try {
      const loggedUser = await login({ username: identifier.trim(), password });
      showToast('登录成功', 'success');
      if (validCustomRedirect) {
        navigate(validCustomRedirect, { replace: true });
      } else {
        const adminRole = loggedUser?.role === 'admin' || loggedUser?.role === 'super_admin';
        navigate(adminRole ? '/admin' : '/user', { replace: true });
      }
    } catch (err: any) {
      const msg = errorText(err, '登录失败，请检查账号和密码');
      setError(msg);
      if (msg.includes('验证码') || msg.includes('密码')) {
        setSuggestOtpSwitch(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    setError('');
    setInfo('');
    const targetEmail = email.trim();
    if (!targetEmail || !targetEmail.includes('@')) {
      setError('请输入有效的邮箱地址');
      return;
    }
    setSendingCode(true);
    try {
      const res = await sendLoginCode(targetEmail);
      setInfo(res.message || '验证码已发送，请查收邮件');
      startCooldown(res.expires_in ? Math.min(res.expires_in, 60) : 60);
    } catch (err: any) {
      setError(errorText(err, '验证码发送失败，请稍后重试'));
    } finally {
      setSendingCode(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const { user: loggedUser, isNewUser } = await loginWithCode(email.trim(), code.trim());
      if (isNewUser) {
        showToast('欢迎加入！已自动为你创建账号并登录', 'success');
      } else {
        showToast('登录成功', 'success');
      }
      if (validCustomRedirect) {
        navigate(validCustomRedirect, { replace: true });
      } else if (isNewUser) {
        navigate('/user?tab=security', { replace: true });
      } else {
        const adminRole = loggedUser?.role === 'admin' || loggedUser?.role === 'super_admin';
        navigate(adminRole ? '/admin' : '/user', { replace: true });
      }
    } catch (err: any) {
      setError(errorText(err, '验证码校验失败，请重试'));
    } finally {
      setLoading(false);
    }
  };

  const switchToOtp = () => {
    setTab('code');
    setError('');
    setInfo('');
    setSuggestOtpSwitch(false);
    if (identifier.includes('@') && !email) {
      setEmail(identifier.trim());
    }
  };

  const registerLink = validCustomRedirect
    ? `/register?redirect=${encodeURIComponent(validCustomRedirect)}`
    : '/register';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center px-4 py-12 transition-colors">
      <div className="w-full max-w-[420px] space-y-6">
        {/* Brand */}
        <div className="text-center space-y-2">
          <Link to="/" className="inline-flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-slate-100 flex items-center justify-center">
              <Icons.Terminal className="w-4 h-4 text-white dark:text-slate-900" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
              DevLog<span className="text-primary-500">.</span>
            </span>
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white pt-2">
            登录你的账号
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            参与社区讨论、文章投稿、Prompt 收藏与站内通知同步
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-[0_1px_3px_rgba(15,23,42,0.04)] space-y-5">
          {/* Segmented Tabs */}
          <div
            className="grid grid-cols-2 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80"
            role="tablist"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'password'}
              onClick={() => {
                setTab('password');
                setError('');
                setInfo('');
                setSuggestOtpSwitch(false);
              }}
              className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === 'password'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              密码登录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'code'}
              onClick={switchToOtp}
              className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === 'code'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              邮箱验证码登录
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 px-3.5 py-2.5 text-xs text-rose-600 dark:text-rose-400 space-y-1.5">
              <p>{error}</p>
              {suggestOtpSwitch && tab === 'password' && (
                <button
                  type="button"
                  onClick={switchToOtp}
                  className="font-medium underline hover:opacity-80"
                >
                  切换到邮箱验证码登录 →
                </button>
              )}
            </div>
          )}

          {info && !error && (
            <div className="rounded-lg border border-primary-200 dark:border-primary-900/60 bg-primary-50/70 dark:bg-primary-950/30 px-3.5 py-2.5 text-xs text-primary-700 dark:text-primary-300">
              {info}
            </div>
          )}

          {tab === 'password' ? (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="login-identifier"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  用户名或邮箱
                </label>
                <Input
                  id="login-identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="username 或 name@example.com"
                  required
                  autoFocus
                  autoComplete="username"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    密码
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-xs text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                  >
                    忘记密码？
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="输入登录密码"
                    required
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showPassword ? (
                      <Icons.EyeOff className="w-4 h-4" />
                    ) : (
                      <Icons.Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full" size="lg">
                {loading ? '正在登录...' : '登录'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="otp-email"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  邮箱地址
                </label>
                <Input
                  id="otp-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  autoFocus
                  autoComplete="email"
                />
              </div>

              <div>
                <label
                  htmlFor="otp-code"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  6 位邮箱验证码
                </label>
                <div className="flex gap-2">
                  <Input
                    id="otp-code"
                    type="text"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="6 位数字"
                    maxLength={6}
                    required
                    className="font-mono tracking-[0.25em]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSendOtp}
                    disabled={sendingCode || cooldown > 0}
                    className="shrink-0 min-w-[104px]"
                  >
                    {cooldown > 0
                      ? `${cooldown}s 后重试`
                      : sendingCode
                      ? '发送中...'
                      : '获取验证码'}
                  </Button>
                </div>
                <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
                  {registrationEnabled
                    ? '未注册邮箱在验证后将自动创建新账号并直接登录。'
                    : '请输入已绑定该站点的注册邮箱以获取登录验证码。'}
                </p>
              </div>

              <Button type="submit" disabled={loading || code.length < 6} className="w-full" size="lg">
                {loading ? '正在验证...' : '验证并登录'}
              </Button>
            </form>
          )}

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              还没有账号？{' '}
              <Link
                to={registerLink}
                className="font-medium text-primary-600 dark:text-primary-400 hover:underline"
              >
                立即注册
              </Link>
            </span>
            <Link
              to="/"
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              ← 返回首页
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
