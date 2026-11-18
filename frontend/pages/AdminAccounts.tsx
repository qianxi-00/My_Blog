/**
 * 用户与权限：侧栏独立页
 * 两个 tab：「普通用户」（列表增强 + 详情抽屉）/「管理员与权限」（管理员 CRUD，仅超管可见）
 */
import React, { useState } from 'react';
import { AdminUserPanel, AdminAccountsPanel } from '../components/UserAdminPanels';

type AccountsTab = 'users' | 'admins';

const AdminAccounts: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AccountsTab>('users');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
          用户与权限
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          普通用户管理自己的内容；管理员可管理评论、社区与投稿；超级管理员拥有全部权限
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200/80 dark:border-slate-800">
        {(
          [
            { key: 'users', label: '普通用户' },
            { key: 'admins', label: '管理员与权限' },
          ] as { key: AccountsTab; label: string }[]
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'text-slate-900 dark:text-white border-primary-500'
                : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'users' && <AdminUserPanel />}
      {activeTab === 'admins' && <AdminAccountsPanel />}
    </div>
  );
};

export default AdminAccounts;
