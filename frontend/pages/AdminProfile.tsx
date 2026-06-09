import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AdminInfo, updateProfile, updatePassword } from '../api/auth';
import { uploadImage } from '../api/upload';
import { getFileUrl } from '../api/config';

const AdminProfile: React.FC = () => {
    const { admin, refreshAdmin } = useAuth();
    const [profileData, setProfileData] = useState<Partial<AdminInfo>>({});
    const [passwordData, setPasswordData] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState({ type: '', text: '' });

    useEffect(() => {
        if (admin) {
            setProfileData({
                display_name: admin.display_name,
                email: admin.email,
                avatar_url: admin.avatar_url,
                bio: admin.bio,
                qq: admin.qq,
                wechat: admin.wechat,
                github: admin.github,
                bilibili: admin.bilibili
            });
        }
    }, [admin]);

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        try {
            const result = await uploadImage(file);
            setProfileData(prev => ({ ...prev, avatar_url: result.url }));
            setMsg({ type: 'success', text: '头像上传成功，请点击下方保存按钮' });
        } catch (error: any) {
            setMsg({ type: 'error', text: '上传失败: ' + (error.response?.data?.detail || '未知错误') });
        } finally {
            setLoading(false);
        }
    };

    const handleProfileUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMsg({ type: '', text: '' });
        try {
            await updateProfile(profileData);
            await refreshAdmin();
            setMsg({ type: 'success', text: '个人资料已更新' });
        } catch (error: any) {
            setMsg({ type: 'error', text: error.response?.data?.detail || '更新失败' });
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setMsg({ type: '', text: '' });
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setMsg({ type: 'error', text: '两次输入的密码不一致' });
            return;
        }
        setLoading(true);
        try {
            await updatePassword({
                old_password: passwordData.oldPassword,
                new_password: passwordData.newPassword
            });
            setMsg({ type: 'success', text: '密码已修改' });
            setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
        } catch (error: any) {
            setMsg({ type: 'error', text: error.response?.data?.detail || '修改失败' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-10">
            <h1 className="text-2xl font-bold text-slate-800">个人设置</h1>

            {msg.text && (
                <div className={`p-4 rounded-lg flex items-center justify-between ${msg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    <span>{msg.text}</span>
                    <button onClick={() => setMsg({ type: '', text: '' })} className="hover:opacity-75">✕</button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Basic Info */}
                <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
                    <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-4">基本信息</h2>
                    <form onSubmit={handleProfileUpdate} className="space-y-4">

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">头像</label>
                            <div className="flex gap-4 items-start sm:items-center flex-col sm:flex-row">
                                <div className="w-20 h-20 rounded-full bg-slate-100 flex-shrink-0 overflow-hidden border border-slate-200 shadow-inner group relative">
                                    {profileData.avatar_url ? (
                                        <img src={getFileUrl(profileData.avatar_url)} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-400 text-3xl font-bold bg-slate-50">
                                            {admin?.username?.[0]?.toUpperCase()}
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 w-full">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={profileData.avatar_url || ''}
                                            readOnly
                                            className="flex-1 px-4 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 focus:outline-none text-sm"
                                            placeholder="头像地址"
                                        />
                                        <label className="cursor-pointer px-4 py-2 bg-cyan-50 text-cyan-600 border border-cyan-100 rounded-lg hover:bg-cyan-100 transition-colors font-medium text-sm flex items-center whitespace-nowrap">
                                            上传图片
                                            <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                                        </label>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-400">支持上传本地图片 (JPG, PNG, WebP)</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">显示名称</label>
                                <input type="text" value={profileData.display_name || ''} onChange={(e) => setProfileData({ ...profileData, display_name: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all" placeholder="例如: Admin" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">邮箱</label>
                                <input type="email" value={profileData.email || ''} onChange={(e) => setProfileData({ ...profileData, email: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all" placeholder="example@email.com" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">个人简介</label>
                            <textarea rows={4} value={profileData.bio || ''} onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all resize-none" placeholder="写一句简短的自我介绍..." />
                        </div>

                        <div className="pt-4 border-t border-slate-100">
                            <h3 className="text-sm font-medium text-slate-700 mb-4">社交账号</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-slate-500 mb-1 block">QQ</label>
                                    <input type="text" value={profileData.qq || ''} onChange={(e) => setProfileData({ ...profileData, qq: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none transition-all" placeholder="QQ 号码" />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500 mb-1 block">微信</label>
                                    <input type="text" value={profileData.wechat || ''} onChange={(e) => setProfileData({ ...profileData, wechat: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none transition-all" placeholder="微信号" />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500 mb-1 block">GitHub</label>
                                    <input type="text" value={profileData.github || ''} onChange={(e) => setProfileData({ ...profileData, github: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none transition-all" placeholder="GitHub 用户名或链接" />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500 mb-1 block">Bilibili</label>
                                    <input type="text" value={profileData.bilibili || ''} onChange={(e) => setProfileData({ ...profileData, bilibili: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none transition-all" placeholder="B站链接或 UID" />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4">
                            <button type="submit" disabled={loading} className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-lg hover:shadow-lg hover:opacity-90 transition-all shadow-sm disabled:opacity-50 font-medium">
                                保存所有修改
                            </button>
                        </div>
                    </form>
                </div>

                {/* Security */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6 h-fit">
                    <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-4">安全设置</h2>
                    <form onSubmit={handlePasswordUpdate} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">当前密码</label>
                            <input type="password" required value={passwordData.oldPassword} onChange={(e) => setPasswordData({ ...passwordData, oldPassword: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none" placeholder="验证当前密码" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">新密码</label>
                            <input type="password" required minLength={6} value={passwordData.newPassword} onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none" placeholder="至少 6 位字符" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">确认新密码</label>
                            <input type="password" required minLength={6} value={passwordData.confirmPassword} onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none" placeholder="再次输入新密码" />
                        </div>
                        <div className="flex justify-end pt-4">
                            <button type="submit" disabled={loading} className="w-full px-6 py-2.5 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50 font-medium">
                                修改密码
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default AdminProfile;
