/**
 * 用户与权限（2026-09-26 二期）：侧栏独立页
 * 两个 tab：「普通用户」（列表增强 + 详情抽屉）/「管理员与权限」（管理员 CRUD，仅超管可见）
 */
import React, { useState } from 'react';
import { Icons } from '../components/Icons';
import { AdminUserPanel, AdminAccountsPanel } from '../components/UserAdminPanels';

type AccountsTab = 'users' | 'admins';

const AdminAccounts: React.FC = () => {
    const [activeTab, setActiveTab] = useState<AccountsTab>('users');

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-3">
                    <Icons.User className="w-6 h-6 text-cyan-500" />
                    用户与权限
                </h1>
                <p className="text-slate-500 dark:text-slate-400">
                    站点用户管理：普通用户 / 管理员 / 超级管理员三级权限。普通用户管理自己的内容；管理员可删评论、管理内容；超管拥有全部权限。
                </p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
                {([
                    { key: 'users', label: '普通用户' },
                    { key: 'admins', label: '管理员与权限' },
                ] as { key: AccountsTab; label: string }[]).map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-2 font-medium transition-all border-b-2 -mb-[2px] ${activeTab === tab.key
                            ? 'text-cyan-600 dark:text-cyan-400 border-cyan-600 dark:border-cyan-400'
                            : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
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
