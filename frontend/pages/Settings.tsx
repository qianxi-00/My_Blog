import React, { useState, useEffect } from 'react';
import {
  getAllSettings,
  updateSettingsBatch,
  getEmailStatus,
  sendTestEmail,
  SiteSetting,
  EmailStatus,
} from '../api/settings';
import { Icons } from '../components/Icons';
import { Button, Card, Input, StatusPill, Textarea } from '../components/Shared';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { errorText } from '../utils/errors';

const DEFAULT_FALLBACKS: Record<string, { value: string; type: SiteSetting['type']; description: string }> = {
  site_title: { value: 'DevLog', type: 'string', description: '站点标题' },
  site_description: { value: '', type: 'string', description: '站点描述（用于首页介绍与 SEO）' },
  user_registration_enabled: { value: 'true', type: 'boolean', description: '开放用户注册' },
  email_verification_required: { value: 'true', type: 'boolean', description: '注册与找回密码需要邮箱验证码验证' },
  email_domain_whitelist: {
    value: '',
    type: 'string',
    description: '允许注册的邮箱域名白名单（逗号分隔；留空表示允许所有合法邮箱域名）',
  },
  email_domain_blacklist: {
    value: '',
    type: 'string',
    description: '禁止注册的邮箱域名黑名单（逗号分隔，优先级高于白名单）',
  },
  contact_email: { value: '', type: 'string', description: '公开联系邮箱（超级管理员资料为空时兜底）' },
  contact_github: { value: '', type: 'string', description: 'GitHub 用户名或链接' },
  contact_wechat: { value: '', type: 'string', description: '微信号' },
  contact_qq: { value: '', type: 'string', description: 'QQ 号' },
  contact_bilibili: { value: '', type: 'string', description: 'B站 UID 或主页链接' },
};

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<SiteSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ ok: boolean; text: string } | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const [data, smtp] = await Promise.all([
        getAllSettings(),
        getEmailStatus().catch(() => null),
      ]);
      setSettings(data);
      setEmailStatus(smtp);
      const fallbackEmail = data.find((s) => s.key === 'contact_email')?.value || '';
      setTestEmailTo((prev) => prev || fallbackEmail);
    } catch (error) {
      console.error('获取站点设置失败:', error);
      showToast(errorText(error, '获取站点设置失败'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSendTestEmail = async () => {
    const target = testEmailTo.trim();
    if (!target || !target.includes('@')) {
      showToast('请输入有效的收件邮箱地址', 'error');
      return;
    }
    setTestingEmail(true);
    setTestEmailResult(null);
    try {
      const res = await sendTestEmail(target);
      setTestEmailResult({ ok: true, text: res.message });
      showToast('测试邮件发送成功', 'success');
    } catch (error) {
      const msg = errorText(error, '测试邮件发送失败');
      setTestEmailResult({ ok: false, text: msg });
      showToast(msg, 'error');
    } finally {
      setTestingEmail(false);
    }
  };

  /** 更新设置值；若后端尚无该键记录则自动追加，确保提交时可一并写入 */
  const handleChange = (key: string, value: string) => {
    setSettings((prev) => {
      const exists = prev.some((s) => s.key === key);
      if (exists) {
        return prev.map((s) => (s.key === key ? { ...s, value } : s));
      }
      const meta = DEFAULT_FALLBACKS[key];
      return [
        ...prev,
        {
          key,
          value,
          type: meta?.type || 'string',
          description: meta?.description,
        },
      ];
    });
  };

  const getSettingValue = (key: string): string => {
    const found = settings.find((s) => s.key === key);
    if (found !== undefined) return found.value ?? '';
    return DEFAULT_FALLBACKS[key]?.value ?? '';
  };

  const getSettingDescription = (key: string): string => {
    return (
      settings.find((s) => s.key === key)?.description ||
      DEFAULT_FALLBACKS[key]?.description ||
      ''
    );
  };

  const getBoolValue = (key: string): boolean => {
    const raw = getSettingValue(key).trim().toLowerCase();
    return raw !== 'false' && raw !== '0' && raw !== 'no' && raw !== 'off';
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Record<string, string> = {};
      for (const s of settings) {
        updates[s.key] = s.value ?? '';
      }
      for (const key of Object.keys(DEFAULT_FALLBACKS)) {
        if (!(key in updates)) {
          updates[key] = getSettingValue(key);
        }
      }

      await updateSettingsBatch(updates);
      showToast('设置已保存', 'success');
      await fetchSettings();
    } catch (error) {
      console.error('保存设置失败:', error);
      showToast(errorText(error, '保存设置失败'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderField = (
    key: string,
    label: string,
    type: 'text' | 'textarea' | 'boolean' = 'text',
    placeholder?: string
  ) => {
    const value = getSettingValue(key);
    const description = getSettingDescription(key);
    const isOn = type === 'boolean' ? getBoolValue(key) : false;

    return (
      <div className="space-y-1.5">
        {type === 'boolean' ? (
          <div className="flex items-start justify-between gap-4 py-1">
            <div className="space-y-0.5">
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</div>
              {description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isOn}
              aria-label={label}
              onClick={() => handleChange(key, isOn ? 'false' : 'true')}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/30 ${
                isOn ? 'bg-primary-600' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                  isOn ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        ) : (
          <>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              {label}
            </label>
            {type === 'textarea' ? (
              <Textarea
                value={value}
                onChange={(e) => handleChange(key, e.target.value)}
                rows={3}
                className="resize-none"
                placeholder={placeholder || `请输入${label}`}
              />
            ) : (
              <Input
                type="text"
                value={value}
                onChange={(e) => handleChange(key, e.target.value)}
                placeholder={placeholder || `请输入${label}`}
              />
            )}
            {description && (
              <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
                {description}
              </p>
            )}
          </>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6 space-y-4">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </Card>
          <Card className="p-6 space-y-4">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
            站点设置
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            管理网站基本信息、用户注册与邮箱安全策略及联系方式兜底配置
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={fetchSettings} disabled={saving}>
            <Icons.RefreshCw className="w-3.5 h-3.5" />
            刷新
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Icons.RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Icons.Check className="w-3.5 h-3.5" />
            )}
            {saving ? '保存中...' : '保存修改'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-6">
          {/* 基本信息 */}
          <Card className="p-6 space-y-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white border-b border-slate-200/80 dark:border-slate-800 pb-3.5 flex items-center gap-2">
              <Icons.Globe className="w-4 h-4 text-primary-600 dark:text-primary-400" />
              基本信息
            </h2>
            {renderField('site_title', '站点标题')}
            {renderField('site_description', '站点描述', 'textarea')}
          </Card>

          {/* 注册与邮箱安全 */}
          <Card className="p-6 space-y-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white border-b border-slate-200/80 dark:border-slate-800 pb-3.5 flex items-center gap-2">
              <Icons.Shield className="w-4 h-4 text-primary-600 dark:text-primary-400" />
              注册与邮箱安全
            </h2>
            {renderField('user_registration_enabled', '开放用户注册', 'boolean')}
            <div className="border-t border-slate-200/60 dark:border-slate-800 pt-4">
              {renderField('email_verification_required', '注册与重置密码强制邮箱验证码', 'boolean')}
            </div>
            <div className="border-t border-slate-200/60 dark:border-slate-800 pt-4 space-y-4">
              {renderField(
                'email_domain_whitelist',
                '邮箱域名白名单',
                'textarea',
                '留空表示不限制，常见邮箱均允许；若填写如：company.com, edu.cn'
              )}
              {renderField(
                'email_domain_blacklist',
                '邮箱域名黑名单',
                'textarea',
                '可选：填拦截的临时邮箱或垃圾域名，如 tempmail.com, mailinator.com'
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          {/* 联系方式 */}
          <Card className="p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white border-b border-slate-200/80 dark:border-slate-800 pb-3.5 flex items-center gap-2">
                <Icons.MessageSquare className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                联系方式
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-3 leading-relaxed">
                前台侧栏与关于页优先展示超级管理员「个人设置」中的资料，未设置项将使用以下站点兜底配置。
              </p>
            </div>
            {renderField('contact_email', '联系邮箱', 'text', 'name@example.com')}
            {renderField('contact_github', 'GitHub 链接 / 用户名', 'text', 'https://github.com/username 或 username')}
            {renderField('contact_wechat', '微信号')}
            {renderField('contact_qq', 'QQ 号')}
            {renderField('contact_bilibili', 'B站主页 / UID', 'text', 'https://space.bilibili.com/... 或纯数字 UID')}
          </Card>

          {/* SMTP 邮件通道诊断 */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-3.5">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Icons.Mail className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                SMTP 发信状态与测试
              </h2>
              {emailStatus && (
                <StatusPill tone={emailStatus.configured ? 'emerald' : 'amber'}>
                  {emailStatus.configured ? '已加载配置' : '未配置凭据'}
                </StatusPill>
              )}
            </div>

            {emailStatus ? (
              emailStatus.configured ? (
                <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 text-xs text-slate-600 dark:text-slate-300 space-y-1.5 font-mono">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">SMTP 服务器</span>
                    <span className="truncate">
                      {emailStatus.host}:{emailStatus.port} ({emailStatus.mode})
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">发件地址</span>
                    <span className="truncate">{emailStatus.from_email || '-'}</span>
                  </div>
                  {emailStatus.user_masked && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400">认证账号</span>
                      <span className="truncate">{emailStatus.user_masked}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/50 rounded-lg p-3 leading-relaxed">
                  当前后端容器尚未读取到完整的 <code className="font-mono">SMTP_HOST / SMTP_USER / SMTP_PASSWORD</code> 环境变量（博客容器独立于 NewAPI 读取，需配置在生产机 <code className="font-mono">/data/blog/runtime.env</code>）。未配好前可在左侧暂时关闭「注册与重置密码强制邮箱验证码」。
                </p>
              )
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                暂无法读取容器 SMTP 状态，保存或刷新页面重试。
              </p>
            )}

            <div className="space-y-2 pt-1">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                发送测试邮件（验证登录与发信是否真实可用）
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="email"
                  value={testEmailTo}
                  onChange={(e) => setTestEmailTo(e.target.value)}
                  placeholder="输入接收测试邮件的邮箱..."
                  disabled={testingEmail}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSendTestEmail}
                  disabled={testingEmail}
                  className="shrink-0 h-9"
                >
                  {testingEmail ? (
                    <Icons.RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Icons.Send className="w-3.5 h-3.5" />
                  )}
                  {testingEmail ? '发送中...' : '发测试信'}
                </Button>
              </div>
              {testEmailResult && (
                <p
                  className={`text-xs leading-relaxed ${
                    testEmailResult.ok
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {testEmailResult.text}
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Settings;
