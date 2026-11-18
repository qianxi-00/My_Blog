/**
 * 注册页面（2026-09-26 二期：邮箱验证码强制，两步）
 * 第一步：邮箱 + 发送验证码（60 秒冷却）
 * 第二步：用户名/密码/确认密码/昵称(选填) + 验证码，成功后自动登录并跳 /user
 */
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { sendRegisterCode } from '../api/auth';

const Register: React.FC = () => {
    const [step, setStep] = useState<1 | 2>(1);
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const { register } = useAuth();
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
            const res = await sendRegisterCode(email.trim());
            setInfo(res.message || '验证码已发送，请查收邮件');
            setStep(2);
            startCooldown(res.expires_in ? Math.min(res.expires_in, 60) : 60);
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
            await register({
                username,
                password,
                display_name: displayName.trim() || undefined,
                email: email.trim(),
                code: code.trim(),
            });
            // 注册成功即自动登录，普通用户跳用户中心
            navigate('/user');
        } catch (err: any) {
            const detail = err.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : (detail?.msg || JSON.stringify(detail) || '注册失败，请稍后再试'));
        } finally {
            setLoading(false);
        }
    };

    const inputCls = "w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/70 focus:border-transparent focus:shadow-[0_0_0_4px_rgba(6,182,212,0.12)] focus:bg-white dark:focus:bg-slate-700 transition-all";

    return (
        <div className="min-h-screen relative flex items-center justify-center p-4 transition-colors overflow-hidden
            bg-slate-50 dark:bg-slate-950">
            {/* 十一期美化：与 Login 同一套径向渐变夜空 */}
            <div aria-hidden className="pointer-events-none absolute inset-0
                bg-[radial-gradient(ellipse_60%_50%_at_50%_38%,rgba(6,182,212,0.10),transparent_70%)]
                dark:bg-[radial-gradient(ellipse_60%_50%_at_50%_38%,rgba(6,182,212,0.16),transparent_70%)]" />
            <div aria-hidden className="pointer-events-none absolute inset-0
                bg-[radial-gradient(ellipse_45%_40%_at_65%_75%,rgba(147,51,234,0.08),transparent_70%)]
                dark:bg-[radial-gradient(ellipse_45%_40%_at_65%_75%,rgba(147,51,234,0.14),transparent_70%)]" />

            <div className="w-full max-w-md relative">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-purple-600 shadow-lg shadow-cyan-500/25 dark:shadow-cyan-500/40 mb-4">
                        <span className="text-3xl">🚀</span>
                    </div>
                    <h1 className="text-4xl font-black bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600 bg-clip-text text-transparent tracking-tight">
                        千禧的博客
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">
                        {step === 1 ? '创建账号，开始你的创作之旅' : `第 2 步：完成 ${email} 的验证`}
                    </p>
                </div>

                {/* Register Form —— 毛玻璃卡片（与 Login 同体系） */}
                <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-2xl p-8 border border-white/60 dark:border-slate-700/60 shadow-xl shadow-slate-200/50 dark:shadow-black/40">
                    {/* Step indicator —— 编号节点点亮式：节点圆 + 连接线，当前步放大 */}
                    <div className="flex items-center mb-8">
                        {[1, 2].map((n, idx) => (
                            <React.Fragment key={n}>
                                <div className="flex flex-col items-center">
                                    <span className={`flex items-center justify-center rounded-full font-bold text-xs transition-all duration-300
                                        ${step >= n
                                            ? 'w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/40 scale-110'
                                            : 'w-7 h-7 bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                                        {n}
                                    </span>
                                    <span className={`mt-1.5 text-[10px] font-medium whitespace-nowrap ${step >= n ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                        {n === 1 ? '填写信息' : '邮箱验证'}
                                    </span>
                                </div>
                                {idx === 0 && (
                                    <div className={`flex-1 h-0.5 mx-3 mb-5 rounded-full transition-colors duration-300 ${step >= 2 ? 'bg-gradient-to-r from-cyan-400 to-blue-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                                )}
                            </React.Fragment>
                        ))}
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
                                <label htmlFor="reg-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    邮箱 <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="email"
                                    id="reg-email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className={inputCls}
                                    placeholder="用于接收验证码（QQ / 163 / Gmail 等）"
                                    required
                                    autoFocus
                                />
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                                    注册需要邮箱验证：我们会向该邮箱发送 6 位验证码，10 分钟内有效。
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
                            {/* Error / Info Message */}
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
                                <label htmlFor="reg-code" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    邮箱验证码 <span className="text-red-500">*</span>
                                </label>
                                <div className="flex gap-3">
                                    <input
                                        type="text"
                                        id="reg-code"
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

                            {/* Username */}
                            <div>
                                <label htmlFor="reg-username" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    用户名 <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    id="reg-username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className={inputCls}
                                    placeholder="字母 / 数字 / 下划线 / 连字符，3-30 位"
                                    required
                                    minLength={3}
                                    maxLength={30}
                                />
                            </div>

                            {/* Password */}
                            <div>
                                <label htmlFor="reg-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    密码 <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="password"
                                    id="reg-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className={inputCls}
                                    placeholder="至少 8 位字符"
                                    required
                                    minLength={8}
                                />
                            </div>

                            {/* Confirm Password */}
                            <div>
                                <label htmlFor="reg-confirm" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    确认密码 <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="password"
                                    id="reg-confirm"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className={inputCls}
                                    placeholder="再次输入密码"
                                    required
                                    minLength={8}
                                />
                            </div>

                            {/* Display Name */}
                            <div>
                                <label htmlFor="reg-display-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    昵称 <span className="text-slate-400 dark:text-slate-500 text-xs">(选填)</span>
                                </label>
                                <input
                                    type="text"
                                    id="reg-display-name"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    className={inputCls}
                                    placeholder="对外展示的昵称"
                                    maxLength={32}
                                />
                            </div>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-medium rounded-lg hover:from-cyan-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-800 shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-lg"
                            >
                                {loading ? (
                                    <span className="flex items-center justify-center">
                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        注册中...
                                    </span>
                                ) : '注 册'}
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
                        已有账号？
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

export default Register;
