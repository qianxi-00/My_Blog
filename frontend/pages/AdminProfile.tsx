import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AdminInfo, updateProfile, updatePassword } from '../api/auth';
import { uploadImage } from '../api/upload';
import { errorText } from '../utils/errors';
import { useToast } from '../components/Toast';
import Avatar from '../components/Avatar';
import { Icons } from '../components/Icons';
import { Button, Card, Input, Textarea } from '../components/Shared';

const AdminProfile: React.FC = () => {
  const { admin, refreshAdmin } = useAuth();
  const { showToast } = useToast();
  const [profileData, setProfileData] = useState<Partial<AdminInfo>>({});
  const [passwordData, setPasswordData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

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
        bilibili: admin.bilibili,
      });
    }
  }, [admin]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    try {
      const result = await uploadImage(file);
      setProfileData((prev) => ({ ...prev, avatar_url: result.url }));
      showToast('头像上传成功，请点击下方保存修改', 'success');
    } catch (error: any) {
      showToast('上传失败: ' + errorText(error, '未知错误'), 'error');
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateProfile(profileData);
      await refreshAdmin();
      showToast('个人资料已更新', 'success');
    } catch (error: any) {
      showToast(errorText(error, '更新失败'), 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showToast('两次输入的新密码不一致', 'error');
      return;
    }
    setSavingPwd(true);
    try {
      await updatePassword({
        old_password: passwordData.oldPassword,
        new_password: passwordData.newPassword,
      });
      showToast('密码已修改', 'success');
      setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error: any) {
      showToast(errorText(error, '修改失败'), 'error');
    } finally {
      setSavingPwd(false);
    }
  };

  const displayName = profileData.display_name || admin?.display_name || admin?.username || 'A';

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
          个人设置
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          管理您的公开作者名片、联系方式及后台登录密码
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Basic Info */}
        <Card className="lg:col-span-2 p-6 space-y-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white border-b border-slate-200/80 dark:border-slate-800 pb-3.5">
            基本资料
          </h2>

          <form onSubmit={handleProfileUpdate} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                头像
              </label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <Avatar
                  name={displayName}
                  avatarUrl={profileData.avatar_url || undefined}
                  className="w-16 h-16 text-xl ring-1 ring-slate-200 dark:ring-slate-800"
                />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={profileData.avatar_url || ''}
                      readOnly
                      placeholder="头像地址"
                      className="flex-1 font-mono text-xs"
                    />
                    <label className="cursor-pointer inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium transition-colors whitespace-nowrap">
                      <Icons.Upload className="w-3.5 h-3.5" />
                      {uploadingAvatar ? '上传中...' : '上传图片'}
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        disabled={uploadingAvatar}
                        onChange={handleAvatarUpload}
                      />
                    </label>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    支持 JPG、PNG、WebP 格式图片，上传后记得保存修改
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  显示名称
                </label>
                <Input
                  type="text"
                  value={profileData.display_name || ''}
                  onChange={(e) =>
                    setProfileData({ ...profileData, display_name: e.target.value })
                  }
                  placeholder="例如: 千禧"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  联系邮箱
                </label>
                <Input
                  type="email"
                  value={profileData.email || ''}
                  onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                  placeholder="example@email.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                个人简介
              </label>
              <Textarea
                rows={4}
                value={profileData.bio || ''}
                onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })}
                placeholder="写一句简短的自我介绍..."
                className="resize-none"
              />
            </div>

            <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800">
              <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
                社交账号
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    QQ
                  </label>
                  <Input
                    type="text"
                    value={profileData.qq || ''}
                    onChange={(e) => setProfileData({ ...profileData, qq: e.target.value })}
                    placeholder="QQ 号码"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    微信
                  </label>
                  <Input
                    type="text"
                    value={profileData.wechat || ''}
                    onChange={(e) => setProfileData({ ...profileData, wechat: e.target.value })}
                    placeholder="微信号"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    GitHub
                  </label>
                  <Input
                    type="text"
                    value={profileData.github || ''}
                    onChange={(e) => setProfileData({ ...profileData, github: e.target.value })}
                    placeholder="GitHub 用户名或链接"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Bilibili
                  </label>
                  <Input
                    type="text"
                    value={profileData.bilibili || ''}
                    onChange={(e) => setProfileData({ ...profileData, bilibili: e.target.value })}
                    placeholder="B站链接或 UID"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={savingProfile || uploadingAvatar}>
                {savingProfile ? '保存中...' : '保存资料修改'}
              </Button>
            </div>
          </form>
        </Card>

        {/* Security */}
        <Card className="p-6 space-y-5 h-fit">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white border-b border-slate-200/80 dark:border-slate-800 pb-3.5">
            安全设置
          </h2>
          <form onSubmit={handlePasswordUpdate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                当前密码
              </label>
              <Input
                type="password"
                required
                value={passwordData.oldPassword}
                onChange={(e) =>
                  setPasswordData({ ...passwordData, oldPassword: e.target.value })
                }
                placeholder="验证当前密码"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                新密码
              </label>
              <Input
                type="password"
                required
                minLength={8}
                value={passwordData.newPassword}
                onChange={(e) =>
                  setPasswordData({ ...passwordData, newPassword: e.target.value })
                }
                placeholder="至少 8 位字符"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                确认新密码
              </label>
              <Input
                type="password"
                required
                minLength={8}
                value={passwordData.confirmPassword}
                onChange={(e) =>
                  setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                }
                placeholder="再次输入新密码"
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              disabled={savingPwd}
              className="w-full"
            >
              {savingPwd ? '修改中...' : '修改密码'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default AdminProfile;
