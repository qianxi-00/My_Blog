/**
 * 忘记密码页面：邮箱验证码自助重置（两步）
 */
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { Button, Input } from '../components/Shared';
import { useToast } from '../components/Toast';
import { sendResetCode, resetPassword } from '../api/auth';
import { errorText } from '../utils/errors';

const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

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
    if (!email.trim() || !email.includes('@')) {
      setError('请输入正确的邮箱地址');
      return;
    }
    setSending(true);
    try {
      const res = await sendResetCode(email.trim());
      setInfo(res.message || '若该邮箱已注册，验证码已发送，请查收邮件');
      setStep(2);
      startCooldown(60);
    } catch (err: any) {
      setError(errorText(err, '验证码发送失败，请稍后重试'));
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('新密码至少需要 8 位字符');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      await resetPassword({
        email: email.trim(),
        code: code.trim(),
        new_password: password,
      });
      showToast('密码已重置，请使用新密码登录', 'success');
      navigate('/login', { replace: true });
    } catch (err: any) {
      setError(errorText(err, '密码重置失败，请核对验证码后重试'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center px-4 py-12 transition-colors">
      <div className="w-full max-w-[420px] space-y-6">
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
            找回登录密码
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {step === 1 ? '通过账号绑定的邮箱接收验证码重置密码' : `正在为 ${email} 设置新密码`}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-[0_1px_3px_rgba(15,23,42,0.04)] space-y-5">
          {/* Progress indicator */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div
                className={`h-1 rounded-full ${
                  step >= 1 ? 'bg-primary-500' : 'bg-slate-200 dark:bg-slate-800'
                }`}
              />
              <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                1. 验证邮箱
              </p>
            </div>
            <div className="space-y-1">
              <div
                className={`h-1 rounded-full transition-colors ${
                  step >= 2 ? 'bg-primary-500' : 'bg-slate-200 dark:bg-slate-800'
                }`}
              />
              <p
                className={`text-[11px] font-medium ${
                  step >= 2 ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                2. 重置密码
              </p>
            </div>
          </div>

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

          {step === 1 ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendCode();
              }}
              className="space-y-4"
            >
              <div>
                <label
                  htmlFor="fp-email"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  注册邮箱 <span className="text-rose-500">*</span>
                </label>
                <Input
                  id="fp-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  autoFocus
                  autoComplete="email"
                />
                <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
                  为保护隐私，无论邮箱是否存在都会返回一致提示。
                </p>
              </div>

              <Button type="submit" disabled={sending} className="w-full" size="lg">
                {sending ? '发送中...' : '发送验证码'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="fp-code"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  邮箱验证码 <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-2">
                  <Input
                    id="fp-code"
                    type="text"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="6 位数字"
                    maxLength={6}
                    required
                    autoFocus
                    className="font-mono tracking-[0.25em]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSendCode}
                    disabled={sending || cooldown > 0}
                    className="shrink-0 min-w-[104px]"
                  >
                    {cooldown > 0 ? `${cooldown}s 后重发` : sending ? '发送中...' : '重新发送'}
                  </Button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="fp-password"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  新密码 <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Input
                    id="fp-password"
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
              </div>

              <div>
                <label
                  htmlFor="fp-confirm"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  确认新密码 <span className="text-rose-500">*</span>
                </label>
                <Input
                  id="fp-confirm"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码"
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </div>

              <Button type="submit" disabled={loading} className="w-full" size="lg">
                {loading ? '重置中...' : '确认重置密码'}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setError('');
                  setInfo('');
                }}
                className="w-full text-center text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                ← 更换其他邮箱
              </button>
            </form>
          )}

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              想起密码了？{' '}
              <Link
                to="/login"
                className="font-medium text-primary-600 dark:text-primary-400 hover:underline"
              >
                去登录
              </Link>
            </span>
            <Link to="/" className="hover:text-slate-900 dark:hover:text-white transition-colors">
              ← 返回首页
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
