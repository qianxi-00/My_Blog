/**
 * 忘记密码（2026-09-26 二期：邮箱验证码自助重置，两步）
 * 第一步：邮箱 + 发送验证码（后端对不存在的邮箱也返回成功，防枚举）
 * 第二步：验证码 + 新密码/确认密码，成功后跳登录页
 */
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sendResetCode, resetPassword } from '../api/auth';

const ForgotPassword: React.FC = () => {
    const [step, setStep] = useState<1 | 2>(1);
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const navigate = useNavigate();
    const timerRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (timerRef.current) window.clearInterval(timerRef.current);
        };
    }, []);

    const startCooldown = (seconds: number) => {
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
            setInfo(res.message || '验证码已发送，请查收邮件');
            setStep(2);
            startCooldown(60);
        } catch (err: any) {
            const detail = err.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : (detail?.msg || JSON.stringify(detail) || '验证码发送失败，请稍后再试'));
        } finally {
            setSending(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

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
            // 成功后跳登录页用新密码登录
            navigate('/login');
        } catch (err: any) {
            const detail = err.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : (detail?.msg || JSON.stringify(detail) || '重置失败，请稍后再试'));
        } finally {
            setLoading(false);
        }
    };

    const inputCls = "w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all focus:bg-white dark:focus:bg-slate-700";

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4 transition-colors">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-500 to-purple-600 bg-clip-text text-transparent">
                        千禧的博客
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-2">
                        {step === 1 ? '通过注册邮箱找回密码' : `第 2 步：为 ${email} 设置新密码`}
                    </p>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-200/50 dark:shadow-none">
                    {/* Step indicator */}
                    <div className="flex items-center gap-2 mb-6">
                        <span className={`flex-1 h-1.5 rounded-full ${step >= 1 ? 'bg-cyan-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                        <span className={`flex-1 h-1.5 rounded-full ${step >= 2 ? 'bg-cyan-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                    </div>

                    {step === 1 ? (
                        <form
                            onSubmit={(e) => { e.preventDefault(); handleSendCode(); }}
                            className="space-y-6"
                        >
                            {error && (
                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            <div>
                                <label htmlFor="fp-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    注册邮箱 <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="email"
                                    id="fp-email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className={inputCls}
                                    placeholder="你注册时使用的邮箱"
                                    required
                                    autoFocus
                                />
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                                    我们会向该邮箱发送 6 位验证码；为保护隐私，无论邮箱是否注册都返回相同提示。
                                </p>
                            </div>

                            <button
                                type="submit"
                                disabled={sending}
                                className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-medium rounded-lg hover:from-cyan-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-800 shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-lg"
                            >
                                {sending ? '发送中...' : '发送验证码'}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {error && (
                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}
                            {info && !error && (
                                <div className="bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 text-cyan-600 dark:text-cyan-400 px-4 py-3 rounded-lg text-sm">
                                    {info}
                                </div>
                            )}

                            {/* Code + resend */}
                            <div>
                                <label htmlFor="fp-code" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    邮箱验证码 <span className="text-red-500">*</span>
                                </label>
                                <div className="flex gap-3">
                                    <input
                                        type="text"
                                        id="fp-code"
                                        value={code}
                                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                                        className={`${inputCls} font-mono tracking-[0.3em]`}
                                        placeholder="6 位数字"
                                        required
                                        maxLength={6}
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        onClick={handleSendCode}
                                        disabled={sending || cooldown > 0}
                                        className="shrink-0 px-4 py-3 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 text-sm transition-colors"
                                    >
                                        {cooldown > 0 ? `${cooldown}s` : (sending ? '...' : '重新发送')}
                                    </button>
                                </div>
                            </div>

                            {/* New Password */}
                            <div>
                                <label htmlFor="fp-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    新密码 <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="password"
                                    id="fp-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className={inputCls}
                                    placeholder="至少 8 位字符"
                                    required
                                    minLength={8}
                                />
                            </div>

                            {/* Confirm */}
                            <div>
                                <label htmlFor="fp-confirm" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    确认新密码 <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="password"
                                    id="fp-confirm"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className={inputCls}
                                    placeholder="再次输入新密码"
                                    required
                                    minLength={8}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-medium rounded-lg hover:from-cyan-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-800 shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-lg"
                            >
                                {loading ? '重置中...' : '重置密码'}
                            </button>

                            <button
                                type="button"
                                onClick={() => { setStep(1); setError(''); }}
                                className="w-full text-center text-sm text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                            >
                                ← 换一个邮箱
                            </button>
                        </form>
                    )}

                    {/* Login Link */}
                    <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                        想起密码了？
                        <Link to="/login" className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-medium transition-colors">
                            去登录
                        </Link>
                    </div>

                    {/* Back Link */}
                    <div className="mt-4 text-center">
                        <Link to="/" className="text-sm text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">
                            ← 返回首页
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ForgotPassword;
