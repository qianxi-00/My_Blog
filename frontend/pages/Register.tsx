/**
 * 单页注册页面：动态感知站点的 registration_enabled 与 email_verification_required 开关
 */
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { Button, Input } from '../components/Shared';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { sendRegisterCode } from '../api/auth';
import { getPublicSettings } from '../api/stats';
import { errorText } from '../utils/errors';
import { safeRedirectPath } from '../utils/urls';

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,30}$/;

const computePasswordStrength = (pwd: string): { score: number; label: string; color: string } => {
  if (!pwd) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pwd.length >= 8) score += 1;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score += 1;
  if (/\d/.test(pwd)) score += 1;
  if (/[^a-zA-Z0-9]/.test(pwd) || pwd.length >= 12) score += 1;
  if (score <= 1) return { score: 1, label: '较弱', color: 'bg-rose-500' };
  if (score <= 2) return { score: 2, label: '中等', color: 'bg-amber-500' };
  return { score: 3, label: '安全', color: 'bg-emerald-500' };
};

const Register: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { register, isAuthenticated, isAdmin } = useAuth();
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

  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(true);
  const [checkingConfig, setCheckingConfig] = useState(true);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    getPublicSettings()
      .then((s) => {
        if (typeof s.registration_enabled === 'boolean') {
          setRegistrationEnabled(s.registration_enabled);
        }
        if (typeof s.email_verification_required === 'boolean') {
          setEmailVerificationRequired(s.email_verification_required);
        }
      })
      .catch(() => {})
      .finally(() => setCheckingConfig(false));

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      navigate(validCustomRedirect || (isAdmin ? '/admin' : '/user'), { replace: true });
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

  const handleSendCode = async () => {
    setError('');
    setInfo('');
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('请先填写有效的邮箱地址');
      return;
    }
    if (username.trim() && !USERNAME_RE.test(username.trim())) {
      setError('用户名仅支持 3-30 位字母、数字、下划线或连字符');
      return;
    }
    setSending(true);
    try {
      const res = await sendRegisterCode(cleanEmail, username.trim() || undefined);
      setInfo(res.message || '验证码已发送至邮箱，请注意查收');
      startCooldown(res.expires_in ? Math.min(res.expires_in, 60) : 60);
    } catch (err: any) {
      setError(errorText(err, '验证码发送失败，请稍后重试'));
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanUsername = username.trim();
    if (!USERNAME_RE.test(cleanUsername)) {
      setError('用户名格式需为 3-30 位字母、数字、下划线或连字符');
      return;
    }
    if (password.length < 8) {
      setError('密码长度不能少于 8 位');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    if (emailVerificationRequired && code.trim().length < 6) {
      setError('请输入 6 位邮箱验证码');
      return;
    }

    setLoading(true);
    try {
      await register({
        username: cleanUsername,
        password,
        display_name: displayName.trim() || undefined,
        email: email.trim(),
        code: emailVerificationRequired ? code.trim() : undefined,
      });
      showToast('注册成功，已自动登录', 'success');
      navigate(validCustomRedirect || '/user', { replace: true });
    } catch (err: any) {
      setError(errorText(err, '注册失败，请检查填写内容'));
    } finally {
      setLoading(false);
    }
  };

  const strength = computePasswordStrength(password);
  const usernameInvalid = username.trim().length > 0 && !USERNAME_RE.test(username.trim());
  const loginLink = validCustomRedirect
    ? `/login?redirect=${encodeURIComponent(validCustomRedirect)}`
    : '/login';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center px-4 py-12 transition-colors">
      <div className="w-full max-w-[440px] space-y-6">
        <div className="text-center space-y-2">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-slate-100 flex items-center justify-center">
              <Icons.Terminal className="w-4 h-4 text-white dark:text-slate-900" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
              DevLog<span className="text-primary-500">.</span>
            </span>
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white pt-2">
            创建新账号
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            一个账号即可发表文章、参与技术社区与管理个人主页
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-[0_1px_3px_rgba(15,23,42,0.04)] space-y-5">
          {!checkingConfig && !registrationEnabled ? (
            <div className="py-6 text-center space-y-4">
              <div className="mx-auto w-11 h-11 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                <Icons.Lock className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  站点暂未开放新用户注册
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  已有账号可直接使用用户名、邮箱或邮箱验证码登录。
                </p>
              </div>
              <div className="flex gap-2 justify-center pt-2">
                <Link to={loginLink}>
                  <Button size="md">前往登录</Button>
                </Link>
                <Link to="/">
                  <Button size="md" variant="outline">
                    返回首页
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 px-3.5 py-2.5 text-xs text-rose-600 dark:text-rose-400">
                  {error}
                </div>
              )}

              {info && !error && (
                <div className="rounded-lg border border-primary-200 dark:border-primary-900/60 bg-primary-50/70 dark:bg-primary-950/30 px-3.5 py-2.5 text-xs text-primary-700 dark:text-primary-300">
                  {info}
                </div>
              )}

              <div>
                <label
                  htmlFor="reg-email"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  邮箱地址 <span className="text-rose-500">*</span>
                </label>
                <Input
                  id="reg-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  autoFocus
                  autoComplete="email"
                />
              </div>

              {emailVerificationRequired && (
                <div>
                  <label
                    htmlFor="reg-code"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    邮箱验证码 <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="reg-code"
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
                      onClick={handleSendCode}
                      disabled={sending || cooldown > 0}
                      className="shrink-0 min-w-[104px]"
                    >
                      {cooldown > 0
                        ? `${cooldown}s 后重发`
                        : sending
                        ? '发送中...'
                        : '获取验证码'}
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="reg-username"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    用户名 <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    id="reg-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="3-30 位英文/数字"
                    minLength={3}
                    maxLength={30}
                    required
                    autoComplete="username"
                  />
                  {usernameInvalid && (
                    <p className="mt-1 text-[11px] text-rose-500">
                      仅限 3-30 位字母、数字、_ 或 -
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="reg-display-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    显示昵称{' '}
                    <span className="text-slate-400 dark:text-slate-500 font-normal">
                      （选填）
                    </span>
                  </label>
                  <Input
                    id="reg-display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="对外展示的名字"
                    maxLength={32}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="reg-password"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    设置密码 <span className="text-rose-500">*</span>
                  </label>
                  {strength.label && (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      强度：{strength.label}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="reg-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="至少 8 位字符"
                    minLength={8}
                    required
                    autoComplete="new-password"
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
                {password && (
                  <div className="grid grid-cols-3 gap-1.5 mt-2">
                    {[1, 2, 3].map((step) => (
                      <div
                        key={step}
                        className={`h-1 rounded-full transition-colors ${
                          strength.score >= step
                            ? strength.color
                            : 'bg-slate-200 dark:bg-slate-800'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="reg-confirm"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  确认密码 <span className="text-rose-500">*</span>
                </label>
                <Input
                  id="reg-confirm"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入密码"
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </div>

              <Button type="submit" disabled={loading} className="w-full" size="lg">
                {loading ? '正在创建账号...' : '完成注册并登录'}
              </Button>

              <p className="text-[11px] text-center text-slate-400 dark:text-slate-500">
                也可在登录页选择「邮箱验证码登录」，一步自动建号
              </p>
            </form>
          )}

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              已有账号？{' '}
              <Link
                to={loginLink}
                className="font-medium text-primary-600 dark:text-primary-400 hover:underline"
              >
                去登录
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

export default Register;
