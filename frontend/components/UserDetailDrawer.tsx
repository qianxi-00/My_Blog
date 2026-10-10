/**
 * 用户详情抽屉（2026-09-26 二期）
 * 资料 + 统计 + 最近文章 + 最近评论 + 操作区（封禁/解封、重置密码、改角色、改邮箱、删除）
 * 超管专属操作仅 super_admin 可见（隐藏而非置灰）。
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from './Icons';
import { Button } from './Shared';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import {
    AdminUserDetail,
    getAdminUserDetail,
    banUser, unbanUser, resetUserPassword, setUserRole, setUserEmail, deleteUser,
} from '../api/users';
import { errorText } from '../utils/errors';

const getDetail = getAdminUserDetail;

interface UserDetailDrawerProps {
    userId: number | null;
    onClose: () => void;
    onChanged: () => void; // 任一操作成功后回调（刷新列表）
}

const fmtTime = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
    active: { label: '正常', cls: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800' },
    banned: { label: '已封禁', cls: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800' },
    published: { label: '已发布', cls: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800' },
    pending_review: { label: '待审核', cls: 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800' },
    rejected: { label: '已驳回', cls: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800' },
    draft: { label: '草稿', cls: 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700' },
    pending: { label: '待审核', cls: 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800' },
    approved: { label: '已通过', cls: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800' },
};

const Badge: React.FC<{ status?: string }> = ({ status }) => {
    const b = (status && STATUS_BADGE[status]) || { label: status || '—', cls: 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700' };
    return <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${b.cls}`}>{b.label}</span>;
};

export const UserDetailDrawer: React.FC<UserDetailDrawerProps> = ({ userId, onClose, onChanged }) => {
    const { showToast } = useToast();
    const { admin: me } = useAuth();
    // 检修补丁：抽屉内 4 处危险操作确认换统一 ConfirmDialog（原 window.confirm）
    const { confirm, confirmDialog } = useConfirm();
    const [detail, setDetail] = useState<AdminUserDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [acting, setActing] = useState('');
    const [tempPassword, setTempPassword] = useState<string | null>(null);
    const [emailInput, setEmailInput] = useState('');
    const [showEmailInput, setShowEmailInput] = useState(false);
    const [showDelete, setShowDelete] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState('');
    const [contentConflict, setContentConflict] = useState<string | null>(null);

    const isSuper = me?.role === 'super_admin';

    useEffect(() => {
        if (userId == null) { setDetail(null); return; }
        setLoading(true);
        setTempPassword(null);
        setShowEmailInput(false);
        setShowDelete(false);
        setDeleteConfirm('');
        getDetail(userId).then(setDetail).catch((e) => {
            showToast(errorText(e, '获取用户详情失败'), 'error');
            onClose();
        }).finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    if (userId == null) return null;

    const run = async (key: string, fn: () => Promise<unknown>, after?: () => void) => {
        setActing(key);
        try {
            await fn();
            after?.();
        } catch (e: any) {
            showToast(errorText(e, '操作失败'), 'error');
        } finally {
            setActing('');
        }
    };

    const handleToggleBan = async () => {
        if (!detail) return;
        const banned = detail.is_active === false;
        const action = banned ? '解封' : '封禁';
        const ok = await confirm({
            title: `${action}用户`,
            message: `确定要${action}用户「${detail.display_name || detail.username}」吗？`,
            confirmText: action,
            danger: !banned,
        });
        if (!ok) return;
        run('ban', () => (banned ? unbanUser(detail.id) : banUser(detail.id)), () => {
            showToast(`${action}成功`, 'success');
            getDetail(detail.id).then(setDetail);
            onChanged();
        });
    };

    const handleResetPassword = async () => {
        if (!detail) return;
        const ok = await confirm({
            title: '重置密码',
            message: `确定重置「${detail.display_name || detail.username}」的密码吗？其所有登录会话将立即失效。`,
            confirmText: '重置',
            danger: true,
        });
        if (!ok) return;
        run('resetpwd', async () => {
            const res = await resetUserPassword(detail.id);
            setTempPassword(res.temp_password);
        }, () => onChanged());
    };

    const handleRole = async (role: 'user' | 'admin') => {
        if (!detail) return;
        const ok = await confirm({
            title: '修改角色',
            message: `确定把「${detail.display_name || detail.username}」的角色改为「${role === 'admin' ? '管理员' : '普通用户'}」吗？`,
            confirmText: '修改',
        });
        if (!ok) return;
        run('role', () => setUserRole(detail.id, role), () => {
            showToast('角色已更新', 'success');
            getDetail(detail.id).then(setDetail);
            onChanged();
        });
    };

    const handleEmail = () => {
        if (!detail) return;
        const email = emailInput.trim();
        run('email', () => setUserEmail(detail.id, email), () => {
            showToast(email ? '邮箱已更新' : '已解除绑定', 'success');
            setShowEmailInput(false);
            getDetail(detail.id).then(setDetail);
            onChanged();
        });
    };

    const handleDelete = () => {
        if (!detail) return;
        if (deleteConfirm !== detail.username) return;
        doDelete(false);
    };

    // 删除用户：该用户还有文章时后端返回 409（文章作者不能为空），
    // 这里不弹通用错误，而是显示后端给的数量说明 + 二次确认「连同文章删除」。
    const doDelete = async (withContent: boolean) => {
        if (!detail) return;
        setActing('delete');
        setContentConflict(null);
        try {
            await deleteUser(detail.id, withContent);
            showToast(withContent ? '用户与其文章已删除' : '用户已删除（内容归属已置空保留）', 'success');
            onClose();
            onChanged();
        } catch (e: any) {
            const msg = errorText(e, '删除失败');
            if (e.response?.status === 409) setContentConflict(msg);
            else showToast(msg, 'error');
        } finally {
            setActing('');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative w-full max-w-lg h-full bg-white dark:bg-slate-900 shadow-2xl overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">用户详情</h3>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <Icons.X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                {loading || !detail ? (
                    <div className="py-16 text-center text-slate-400 dark:text-slate-500">加载中...</div>
                ) : (
                    <div className="p-6 space-y-6">
                        {/* 资料 */}
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-xl font-bold shrink-0">
                                {(detail.display_name || detail.username || '?').slice(0, 1)}
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-slate-800 dark:text-slate-100">{detail.display_name || detail.username}</span>
                                    <Badge status={detail.is_active === false ? 'banned' : 'active'} />
                                    <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                        {detail.role === 'super_admin' ? '超级管理员' : detail.role === 'admin' ? '管理员' : '普通用户'}
                                    </span>
                                </div>
                                <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                    @{detail.username} · ID {detail.id}
                                </div>
                                <div className="text-sm text-slate-500 dark:text-slate-400">
                                    {detail.email || '未绑定邮箱'}{detail.email ? (detail.email_verified ? ' · 已验证' : ' · 未验证') : ''}
                                </div>
                            </div>
                        </div>

                        {/* 统计 */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
                                <div className="text-xl font-black text-slate-800 dark:text-slate-100">{detail.stats?.articles_total ?? 0}</div>
                                <div className="text-xs text-slate-400 dark:text-slate-500">文章</div>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
                                <div className="text-xl font-black text-slate-800 dark:text-slate-100">{detail.stats?.comments_total ?? 0}</div>
                                <div className="text-xs text-slate-400 dark:text-slate-500">评论</div>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
                                <div className="text-xl font-black text-slate-800 dark:text-slate-100">{detail.stats?.articles_pending ?? 0}</div>
                                <div className="text-xs text-slate-400 dark:text-slate-500">待审</div>
                            </div>
                        </div>

                        {/* 时间 */}
                        <div className="text-sm text-slate-500 dark:text-slate-400 space-y-1">
                            <div>注册时间：{fmtTime(detail.created_at)}</div>
                            <div>最后登录：{fmtTime(detail.last_login_at)}</div>
                        </div>

                        {/* 操作区 */}
                        <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">操作</div>
                            <div className="flex flex-wrap gap-2">
                                {detail.role !== 'super_admin' && (
                                    <Button variant="outline" onClick={handleToggleBan} disabled={!!acting}>
                                        {detail.is_active === false ? '解封' : '封禁'}
                                    </Button>
                                )}
                                {detail.role !== 'super_admin' && (
                                    <Button variant="outline" onClick={handleResetPassword} disabled={!!acting}>
                                        重置密码
                                    </Button>
                                )}
                                {isSuper && detail.role !== 'super_admin' && (
                                    <Button variant="outline" onClick={() => handleRole(detail.role === 'admin' ? 'user' : 'admin')} disabled={!!acting}>
                                        {detail.role === 'admin' ? '降为普通用户' : '提为管理员'}
                                    </Button>
                                )}
                                {isSuper && (
                                    <Button variant="outline" onClick={() => { setShowEmailInput((v) => !v); setEmailInput(detail.email || ''); }} disabled={!!acting}>
                                        {detail.email ? '更换邮箱' : '绑定邮箱'}
                                    </Button>
                                )}
                                {isSuper && (
                                    <Button
                                        variant="outline"
                                        className="!text-red-600 dark:!text-red-400 !border-red-200 dark:!border-red-800"
                                        onClick={() => setShowDelete(true)}
                                        disabled={!!acting}
                                    >
                                        删除用户
                                    </Button>
                                )}
                            </div>

                            {/* 改邮箱输入 */}
                            {showEmailInput && (
                                <div className="flex gap-2">
                                    <input
                                        type="email"
                                        value={emailInput}
                                        onChange={(e) => setEmailInput(e.target.value)}
                                        placeholder="user@example.com（留空解除绑定）"
                                        className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    />
                                    <Button onClick={handleEmail} disabled={!!acting}>确定</Button>
                                </div>
                            )}

                            {/* 删除确认输入 */}
                            {isSuper && showDelete && (
                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 space-y-2">
                                    <div className="text-xs text-red-600 dark:text-red-400">
                                        高危操作：输入用户名 <span className="font-mono font-bold">{detail.username}</span> 以确认删除（评论/提示词保留但归属置空，不可逆）：
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={deleteConfirm}
                                            onChange={(e) => setDeleteConfirm(e.target.value)}
                                            placeholder={detail.username}
                                            className="flex-1 px-3 py-2 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 rounded-lg text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                                        />
                                        <button
                                            onClick={handleDelete}
                                            disabled={deleteConfirm !== detail.username || !!acting}
                                            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            {acting === 'delete' ? '删除中...' : '永久删除'}
                                        </button>
                                    </div>

                                    {/* 该用户还有文章：后端 409 说明 + 二次确认一并删除 */}
                                    {contentConflict && (
                                        <div className="space-y-2 pt-2 border-t border-red-200 dark:border-red-800">
                                            <div className="text-xs text-red-700 dark:text-red-300">{contentConflict}</div>
                                            <button
                                                onClick={() => doDelete(true)}
                                                disabled={!!acting}
                                                className="w-full px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-800 disabled:opacity-40 transition-colors"
                                            >
                                                {acting === 'delete' ? '删除中...' : '连同其文章一起删除（不可逆）'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* 临时密码弹窗 */}
                        {tempPassword && (
                            <div className="fixed inset-0 z-60 flex items-center justify-center">
                                <div className="absolute inset-0 bg-black/50" onClick={() => setTempPassword(null)} />
                                <div className="relative bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
                                    <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-2">临时密码（只显示这一次）</h4>
                                    <div className="font-mono text-2xl font-bold text-cyan-600 dark:text-cyan-400 bg-slate-50 dark:bg-slate-900 rounded-lg px-4 py-3 mb-3 tracking-wider select-all">
                                        {tempPassword}
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                                        请立即转告用户，关闭后无法再次查看。该用户的所有旧登录会话已失效。
                                    </p>
                                    <div className="flex gap-2 justify-end">
                                        <Button
                                            variant="outline"
                                            onClick={() => { navigator.clipboard?.writeText(tempPassword); showToast('已复制', 'success'); }}
                                        >
                                            复制
                                        </Button>
                                        <Button onClick={() => setTempPassword(null)}>我已保存</Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 最近文章 */}
                        {(detail.recent_articles?.length ?? 0) > 0 && (
                            <div>
                                <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">最近文章</div>
                                <div className="space-y-2">
                                    {detail.recent_articles!.map((a) => (
                                        <div key={a.id} className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">
                                            <Link to={`/admin/posts`} className="text-sm text-slate-700 dark:text-slate-300 truncate hover:text-cyan-600 dark:hover:text-cyan-400">
                                                {a.title}
                                            </Link>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <Badge status={a.status} />
                                                <span className="text-xs text-slate-400 dark:text-slate-500">{fmtTime(a.created_at)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 最近评论 */}
                        {(detail.recent_comments?.length ?? 0) > 0 && (
                            <div>
                                <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">最近评论</div>
                                <div className="space-y-2">
                                    {detail.recent_comments!.map((c) => (
                                        <div key={c.id} className="bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">
                                            <div className="text-sm text-slate-700 dark:text-slate-300">{c.content || '（无内容）'}</div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <Badge status={c.status} />
                                                <span className="text-xs text-slate-400 dark:text-slate-500">
                                                    {c.target_type === 'article' ? '文章' : c.target_type === 'hotspot' ? '热点' : c.target_type || ''} · {fmtTime(c.created_at)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {(detail.recent_articles?.length ?? 0) === 0 && (detail.recent_comments?.length ?? 0) === 0 && (
                            <div className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">该用户暂无文章与评论</div>
                        )}
                    </div>
                )}

                {/* 检修补丁：统一确认弹窗 */}
                {confirmDialog}
            </div>
        </div>
    );
};
