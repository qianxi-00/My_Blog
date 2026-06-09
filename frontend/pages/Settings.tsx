import React, { useState, useEffect } from 'react';
import { getAllSettings, updateSettingsBatch, SiteSetting } from '../api/settings';
import { useToast } from '../components/Toast';
import { Save, RefreshCw, Settings as SettingsIcon, Globe, MessageSquare } from 'lucide-react';

const Settings: React.FC = () => {
    const [settings, setSettings] = useState<SiteSetting[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { showToast } = useToast();

    // Group settings for better UI organization
    const groups = {
        general: ['site_title', 'site_description', 'site_keywords'],
        social: ['contact_email', 'contact_github', 'contact_wechat', 'contact_qq', 'contact_bilibili'],
        feature: ['allow_comments', 'allow_register', 'show_admin_bio'],
        other: [] as string[]
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const data = await getAllSettings();
            setSettings(data);
        } catch (error) {
            console.error('Failed to fetch settings:', error);
            showToast('获取设置失败', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (key: string, value: string) => {
        setSettings(prev =>
            prev.map(s => s.key === key ? { ...s, value } : s)
        );
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const updates = settings.reduce((acc, curr) => ({
                ...acc,
                [curr.key]: curr.value
            }), {});

            await updateSettingsBatch(updates);
            showToast('设置已保存', 'success');
            // Refresh to ensure sync
            await fetchSettings();
        } catch (error) {
            console.error('Failed to save settings:', error);
            showToast('保存设置失败', 'error');
        } finally {
            setSaving(false);
        }
    };

    const getSettingValue = (key: string) => {
        return settings.find(s => s.key === key)?.value || '';
    };

    const getSettingDescription = (key: string) => {
        return settings.find(s => s.key === key)?.description || '';
    };

    const renderInput = (key: string, label: string, type: 'text' | 'textarea' | 'boolean' = 'text') => {
        const value = getSettingValue(key);
        const description = getSettingDescription(key);

        return (
            <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    {label}
                </label>
                {type === 'textarea' ? (
                    <textarea
                        value={value}
                        onChange={(e) => handleChange(key, e.target.value)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none transition-all resize-none"
                        rows={3}
                        placeholder={`请输入${label}`}
                    />
                ) : type === 'boolean' ? (
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={() => handleChange(key, value === 'true' ? 'false' : 'true')}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 ${
                                value === 'true' ? 'bg-cyan-600' : 'bg-slate-200'
                            }`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                    value === 'true' ? 'translate-x-6' : 'translate-x-1'
                                }`}
                            />
                        </button>
                        <span className="text-sm text-slate-500">{value === 'true' ? '已开启' : '已关闭'}</span>
                    </div>
                ) : (
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => handleChange(key, e.target.value)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none transition-all"
                        placeholder={`请输入${label}`}
                    />
                )}
                {description && <p className="mt-1 text-xs text-slate-400">{description}</p>}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-10">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <SettingsIcon className="w-6 h-6 text-slate-600" />
                        站点设置
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">管理网站的全局配置、SEO 信息及功能开关</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all shadow-sm disabled:opacity-50 font-medium"
                >
                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    保存修改
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* General Settings */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-4 mb-4 flex items-center gap-2">
                        <Globe className="w-5 h-5 text-cyan-600" />
                        基本信息
                    </h2>
                    {renderInput('site_title', '站点标题')}
                    {renderInput('site_description', '站点描述', 'textarea')}
                </div>

                {/* Feature Switches (Optional placeholders if keys exist) */}
                 {/* Social Links */}
                 <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm row-span-2">
                    <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-4 mb-4 flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-purple-600" />
                        联系方式
                    </h2>
                    {renderInput('contact_email', '联系邮箱')}
                    {renderInput('contact_github', 'GitHub 链接')}
                    {renderInput('contact_wechat', '微信号')}
                    {renderInput('contact_qq', 'QQ 号')}
                    {renderInput('contact_bilibili', 'B站主页')}
                </div>
            </div>
        </div>
    );
};

export default Settings;
