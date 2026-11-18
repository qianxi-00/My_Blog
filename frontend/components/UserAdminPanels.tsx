/**
 * 管理后台「用户文章审核」「用户管理」「管理员与权限」面板
 */
import React, { useEffect, useState } from 'react';
import { Icons } from './Icons';
import Avatar from './Avatar';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  StatusPill,
  Textarea,
} from './Shared';
import { ListSkeleton } from './Skeleton';
import { useToast } from './Toast';
import {
  AdminUserItem,
  ReviewArticle,
  UserArticleStatus,
  banUser,
  getAdminUsers,
  getAdminUsersStats,
  getPendingReviewArticles,
  reviewArticle,
  unbanUser,
  getAdmins,
  createAdmin,
  updateAdmin,
  resetAdminPassword,
  deleteAdmin,
} from '../api/users';
import { useAuth } from '../contexts/AuthContext';
import { UserDetailDrawer } from './UserDetailDrawer';
import { errorText } from '../utils/errors';
import { copyToClipboard } from '../utils/helpers';
import { useConfirm } from './ConfirmDialog';
import { TH, TD } from '../constants';

const PAGE_SIZE = 20;

const STATUS_META: Record<
  UserArticleStatus,
  { label: string; tone: 'slate' | 'amber' | 'emerald' | 'red' }
> = {
  draft: { label: '草稿', tone: 'slate' },
  pending_review: { label: '待审核', tone: 'amber' },
  published: { label: '已发布', tone: 'emerald' },
  rejected: { label: '已驳回', tone: 'red' },
};

const statusMeta = (status: string) =>
  STATUS_META[status as UserArticleStatus] || { label: status, tone: 'slate' as const };

// 兼容分页响应结构差异：{data,total_pages}（PaginatedResponse）/ {items,...} / 裸数组
const normalizePage = <T,>(response: unknown): { items: T[]; totalPages: number } => {
  if (Array.isArray(response)) {
    return { items: response as T[], totalPages: 1 };
  }
  const res = response as { data?: T[]; items?: T[]; total_pages?: number } | null | undefined;
  return { items: res?.data || res?.items || [], totalPages: res?.total_pages || 1 };
};

/**
 * 用户文章审核：待审核投稿列表 + 通过 / 驳回（驳回理由必填）
 */
export const UserArticleReviewPanel: React.FC = () => {
  const { showToast } = useToast();
  const [articles, setArticles] = useState<ReviewArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const response = await getPendingReviewArticles({ page, page_size: PAGE_SIZE });
      const { items, totalPages: pages } = normalizePage<ReviewArticle>(response);
      setTotalPages(pages);
      if (items.length === 0 && page > 1) {
        setPage(page - 1);
        return;
      }
      setArticles(items);
    } catch (error) {
      console.error('获取待审核投稿失败:', error);
      showToast(errorText(error, '获取待审核投稿失败'), 'error');
      setArticles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, [page]);

  const closeReject = () => {
    setRejectingId(null);
    setRejectNote('');
  };

  const handleApprove = async (article: ReviewArticle) => {
    setSubmitting(true);
    try {
      await reviewArticle(article.id, { action: 'approve' });
      showToast('已通过审核并发布', 'success');
      closeReject();
      fetchPending();
    } catch (error) {
      showToast(errorText(error, '审核失败'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (article: ReviewArticle) => {
    const note = rejectNote.trim();
    if (!note) {
      showToast('请填写驳回理由', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await reviewArticle(article.id, { action: 'reject', review_note: note });
      showToast('已驳回该投稿', 'success');
      closeReject();
      fetchPending();
    } catch (error) {
      showToast(errorText(error, '驳回失败'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      {loading ? (
        <div className="p-5">
          <ListSkeleton rows={4} />
        </div>
      ) : articles.length === 0 ? (
        <EmptyState
          icon={<Icons.CheckCircle2 className="w-5 h-5 text-emerald-500" />}
          title="没有待审核的投稿"
          description="用户提交的新投稿将会出现在这里等待审核。"
          className="border-0 rounded-none"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
                <th className={TH}>标题</th>
                <th className={TH}>作者</th>
                <th className={TH}>提交时间</th>
                <th className={TH}>状态</th>
                <th className={`${TH} text-right`}>操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
              {articles.map((article) => {
                const badge = statusMeta(article.status);
                return (
                  <React.Fragment key={article.id}>
                    <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className={TD}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {article.title}
                          </span>
                          {article.category && <Badge color="slate">{article.category}</Badge>}
                        </div>
                      </td>
                      <td className={`${TD} text-slate-600 dark:text-slate-300`}>
                        {article.author?.display_name || article.author?.username || '—'}
                      </td>
                      <td className={`${TD} text-xs text-slate-500 dark:text-slate-400 tabular-nums`}>
                        {new Date(article.created_at).toLocaleString('zh-CN')}
                      </td>
                      <td className={TD}>
                        <StatusPill tone={badge.tone} dot>
                          {badge.label}
                        </StatusPill>
                      </td>
                      <td className={`${TD} text-right`}>
                        <div className="inline-flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleApprove(article)}
                            disabled={submitting}
                            className="text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/70 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                          >
                            通过
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setRejectingId(rejectingId === article.id ? null : article.id);
                              setRejectNote('');
                            }}
                            disabled={submitting}
                            className="text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/70 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                          >
                            驳回
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {rejectingId === article.id && (
                      <tr className="bg-slate-50/80 dark:bg-slate-950/40">
                        <td colSpan={5} className={TD}>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                            驳回理由 *
                          </label>
                          <Textarea
                            value={rejectNote}
                            onChange={(e) => setRejectNote(e.target.value)}
                            placeholder="请说明驳回原因，将同步发送给作者..."
                            rows={3}
                            className="resize-none"
                          />
                          <div className="flex justify-end gap-2 mt-3">
                            <Button variant="outline" size="sm" onClick={closeReject}>
                              取消
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleReject(article)}
                              disabled={!rejectNote.trim() || submitting}
                            >
                              {submitting ? '提交中...' : '确认驳回'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 p-4 border-t border-slate-200/80 dark:border-slate-800">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            上一页
          </Button>
          <span className="px-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            下一页
          </Button>
        </div>
      )}
    </Card>
  );
};

/**
 * 用户管理：统计卡 + 筛选/排序 + 11 列表格 + 详情抽屉
 */
type ManagedUser = AdminUserItem & { status?: 'active' | 'banned' };

const isBanned = (user: ManagedUser) => user.is_active === false || user.status === 'banned';

const roleLabel = (role?: string) =>
  role === 'super_admin' ? '超级管理员' : role === 'admin' ? '管理员' : '普通用户';

const fmtDateTime = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '—');

interface UsersStats {
  total: number;
  regular: number;
  admins: number;
  banned: number;
  today_new: number;
  pending_articles: number;
}

export const AdminUserPanel: React.FC = () => {
  const { showToast } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [stats, setStats] = useState<UsersStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('created_at');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actingId, setActingId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await getAdminUsers({
        search: search || undefined,
        status: statusFilter || undefined,
        sort,
        order,
        page,
        page_size: PAGE_SIZE,
      });
      const { items, totalPages: pages } = normalizePage<ManagedUser>(response);
      setTotalPages(pages);
      if (items.length === 0 && page > 1) {
        setPage(page - 1);
        return;
      }
      setUsers(items);
    } catch (error) {
      console.error('获取用户列表失败:', error);
      showToast(errorText(error, '获取用户列表失败'), 'error');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      setStats(await getAdminUsersStats());
    } catch {
      // 统计失败不打断列表
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, search, statusFilter, sort, order]);

  useEffect(() => {
    fetchStats();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleToggleBan = async (user: ManagedUser) => {
    const banned = isBanned(user);
    const action = banned ? '解封' : '封禁';
    const ok = await confirm({
      title: `${action}用户`,
      message: `确定要${action}用户「${user.display_name || user.username}」吗？`,
      confirmText: action,
      danger: !banned,
    });
    if (!ok) return;

    setActingId(user.id);
    try {
      if (banned) {
        await unbanUser(user.id);
      } else {
        await banUser(user.id);
      }
      showToast(`${action}成功`, 'success');
      fetchUsers();
      fetchStats();
    } catch (error) {
      showToast(errorText(error, `${action}失败`), 'error');
    } finally {
      setActingId(null);
    }
  };

  const thBtn = (key: string, label: string) => (
    <th
      className={`${TH} cursor-pointer select-none hover:text-slate-900 dark:hover:text-white transition-colors`}
      onClick={() => {
        if (sort === key) {
          setOrder(order === 'desc' ? 'asc' : 'desc');
        } else {
          setSort(key);
          setOrder('desc');
        }
        setPage(1);
      }}
    >
      {label}
      {sort === key ? (order === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  );

  return (
    <div className="space-y-6">
      {/* 统计卡 */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: '总用户', value: stats.total },
            { label: '普通用户', value: stats.regular },
            { label: '管理员', value: stats.admins },
            { label: '已封禁', value: stats.banned },
            { label: '24h 新增', value: stats.today_new },
            { label: '待审投稿', value: stats.pending_articles },
          ].map((c) => (
            <Card key={c.label} className="p-4">
              <div className="text-xl font-semibold text-slate-900 dark:text-white tabular-nums">
                {c.value}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{c.label}</div>
            </Card>
          ))}
        </div>
      )}

      {/* 搜索 + 筛选 */}
      <Card className="p-4">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <Input
              type="text"
              placeholder="搜索用户名 / 昵称 / 邮箱..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部状态</option>
            <option value="active">正常</option>
            <option value="banned">已封禁</option>
          </Select>
          <Button type="submit" variant="secondary">
            搜索
          </Button>
        </form>
      </Card>

      {/* 用户列表 */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-5">
            <ListSkeleton rows={5} />
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            icon={<Icons.Users className="w-5 h-5" />}
            title="没有匹配的用户"
            description="请尝试调整搜索词或筛选状态。"
            className="border-0 rounded-none"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
                  <th className={TH}>ID</th>
                  {thBtn('created_at', '用户名')}
                  <th className={TH}>昵称</th>
                  <th className={TH}>邮箱</th>
                  <th className={TH}>角色</th>
                  {thBtn('article_count', '文章')}
                  <th className={TH}>评论</th>
                  {thBtn('last_login_at', '最后登录')}
                  <th className={TH}>状态</th>
                  <th className={`${TH} text-right`}>操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                {users.map((user) => {
                  const banned = isBanned(user);
                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                      onClick={() => setDetailId(user.id)}
                    >
                      <td className={`${TD} font-mono text-xs text-slate-400 tabular-nums`}>
                        {user.id}
                      </td>
                      <td className={`${TD} font-medium text-slate-900 dark:text-slate-100`}>
                        <div className="flex items-center gap-2">
                          <Avatar
                            name={user.display_name || user.username}
                            avatarUrl={user.avatar_url || undefined}
                            className="w-6 h-6 text-[11px]"
                          />
                          <span>{user.username}</span>
                        </div>
                      </td>
                      <td className={`${TD} text-slate-600 dark:text-slate-300`}>
                        <div className="max-w-[140px] truncate" title={user.display_name || user.username}>
                          {user.display_name || '—'}
                        </div>
                      </td>
                      <td className={`${TD} text-xs text-slate-500 dark:text-slate-400`}>
                        {user.email || (
                          <span className="text-slate-300 dark:text-slate-600">未绑定</span>
                        )}
                      </td>
                      <td className={`${TD} text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap`}>
                        <Badge color={user.role === 'super_admin' || user.role === 'admin' ? 'primary' : 'slate'}>
                          {roleLabel(user.role)}
                        </Badge>
                      </td>
                      <td className={`${TD} text-xs text-slate-600 dark:text-slate-300 tabular-nums`}>
                        {(user as any).article_count ?? 0}
                      </td>
                      <td className={`${TD} text-xs text-slate-600 dark:text-slate-300 tabular-nums`}>
                        {(user as any).comment_count ?? 0}
                      </td>
                      <td className={`${TD} text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums`}>
                        {fmtDateTime((user as any).last_login_at)}
                      </td>
                      <td className={TD}>
                        {banned ? (
                          <StatusPill tone="red" dot>
                            已封禁
                          </StatusPill>
                        ) : (
                          <StatusPill tone="emerald" dot>
                            正常
                          </StatusPill>
                        )}
                      </td>
                      <td className={`${TD} text-right`} onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex gap-1.5 justify-end">
                          <Button variant="outline" size="sm" onClick={() => setDetailId(user.id)}>
                            详情
                          </Button>
                          {user.role !== 'super_admin' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggleBan(user)}
                              disabled={actingId === user.id}
                              className={
                                banned
                                  ? 'text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/70'
                                  : 'text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/70'
                              }
                            >
                              {banned ? '解封' : '封禁'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 p-4 border-t border-slate-200/80 dark:border-slate-800">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              上一页
            </Button>
            <span className="px-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              下一页
            </Button>
          </div>
        )}
      </Card>

      <UserDetailDrawer
        userId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={() => {
          fetchUsers();
          fetchStats();
        }}
      />

      {confirmDialog}
    </div>
  );
};

/**
 * 管理员与权限（仅超管）：管理员列表 + 新增 / 停用 / 改密 / 删除
 */
export const AdminAccountsPanel: React.FC = () => {
  const { showToast } = useToast();
  const { admin: me } = useAuth();
  const { confirm, confirmDialog } = useConfirm();
  const [admins, setAdmins] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [pwdTarget, setPwdTarget] = useState<AdminUserItem | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [form, setForm] = useState({
    username: '',
    password: '',
    display_name: '',
    email: '',
    role: 'admin' as 'admin' | 'super_admin',
  });

  const isSuper = me?.role === 'super_admin';

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      setAdmins(await getAdmins());
    } catch (error) {
      showToast(errorText(error, '获取管理员列表失败'), 'error');
      setAdmins([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isSuper) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={<Icons.Shield className="w-5 h-5" />}
          title="仅超级管理员可用"
          description="当前登录账号为普通管理员，暂无权限查看或修改管理员账号列表。"
          className="border-0 py-8"
        />
      </Card>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await createAdmin({
        username: form.username.trim(),
        password: form.password,
        display_name: form.display_name.trim() || undefined,
        email: form.email.trim() || undefined,
        role: form.role,
      });
      showToast(`管理员 ${created.username} 已创建`, 'success');
      setShowCreate(false);
      setForm({ username: '', password: '', display_name: '', email: '', role: 'admin' });
      fetchAdmins();
    } catch (error) {
      showToast(errorText(error, '创建失败'), 'error');
    }
  };

  const handleToggleActive = async (admin: AdminUserItem) => {
    const active = admin.is_active !== false;
    const action = active ? '停用' : '启用';
    const ok = await confirm({
      title: `${action}管理员`,
      message: `确定要${action}管理员「${admin.display_name || admin.username}」吗？${
        active ? '其所有登录会话将立即失效。' : ''
      }`,
      confirmText: action,
      danger: active,
    });
    if (!ok) return;
    setActingId(admin.id);
    try {
      await updateAdmin(admin.id, { is_active: !active });
      showToast(`${action}成功`, 'success');
      fetchAdmins();
    } catch (error) {
      showToast(errorText(error, `${action}失败`), 'error');
    } finally {
      setActingId(null);
    }
  };

  const handleResetPwd = async (admin: AdminUserItem) => {
    if (!newPwd || newPwd.length < 6) {
      showToast('新密码至少 6 位', 'error');
      return;
    }
    const ok = await confirm({
      title: '重置密码',
      message: `确定重置「${admin.display_name || admin.username}」的密码吗？其所有登录会话将立即失效。`,
      confirmText: '重置',
      danger: true,
    });
    if (!ok) return;
    setActingId(admin.id);
    try {
      await resetAdminPassword(admin.id, { new_password: newPwd });
      setTempPassword(newPwd);
      setPwdTarget(null);
      setNewPwd('');
      fetchAdmins();
    } catch (error) {
      showToast(errorText(error, '重置失败'), 'error');
    } finally {
      setActingId(null);
    }
  };

  const handleDelete = async (admin: AdminUserItem) => {
    const ok = await confirm({
      title: '删除管理员',
      message: `确定删除管理员「${admin.display_name || admin.username}」吗？此操作不可逆。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    setActingId(admin.id);
    try {
      await deleteAdmin(admin.id);
      showToast('已删除', 'success');
      fetchAdmins();
    } catch (error) {
      showToast(errorText(error, '删除失败'), 'error');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? (
            '收起表单'
          ) : (
            <>
              <Icons.Plus className="w-3.5 h-3.5" />
              新增管理员
            </>
          )}
        </Button>
      </div>

      {/* 新增表单 */}
      {showCreate && (
        <Card className="p-6">
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                用户名 *
              </label>
              <Input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
                minLength={3}
                maxLength={30}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                密码 *（≥6 位，创建后请转告）
              </label>
              <Input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="font-mono"
                required
                minLength={6}
                maxLength={100}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                昵称（选填）
              </label>
              <Input
                type="text"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                maxLength={50}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                邮箱（选填，用于找回密码）
              </label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                角色
              </label>
              <Select
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as 'admin' | 'super_admin' })
                }
                className="w-full"
              >
                <option value="admin">管理员</option>
                <option value="super_admin">超级管理员</option>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                创建管理员
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* 管理员列表 */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-5">
            <ListSkeleton rows={3} />
          </div>
        ) : admins.length === 0 ? (
          <EmptyState title="还没有管理员" className="border-0 rounded-none" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px]">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
                  <th className={TH}>ID</th>
                  <th className={TH}>用户名</th>
                  <th className={TH}>昵称</th>
                  <th className={TH}>邮箱</th>
                  <th className={TH}>角色</th>
                  <th className={TH}>注册时间</th>
                  <th className={TH}>状态</th>
                  <th className={`${TH} text-right`}>操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                {admins.map((admin) => {
                  const active = admin.is_active !== false;
                  const isSelf = admin.id === me?.id;
                  return (
                    <tr
                      key={admin.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className={`${TD} font-mono text-xs text-slate-400 tabular-nums`}>
                        {admin.id}
                      </td>
                      <td className={`${TD} font-medium text-slate-900 dark:text-slate-100`}>
                        {admin.username}
                        {isSelf && (
                          <Badge color="primary" className="ml-2">
                            当前登录
                          </Badge>
                        )}
                      </td>
                      <td className={`${TD} text-slate-600 dark:text-slate-300`}>
                        {admin.display_name || '—'}
                      </td>
                      <td className={`${TD} text-xs text-slate-500 dark:text-slate-400`}>
                        {admin.email || (
                          <span className="text-slate-300 dark:text-slate-600">未绑定</span>
                        )}
                      </td>
                      <td className={TD}>
                        <Badge color={admin.role === 'super_admin' ? 'amber' : 'primary'}>
                          {roleLabel(admin.role)}
                        </Badge>
                      </td>
                      <td className={`${TD} text-xs text-slate-500 dark:text-slate-400 tabular-nums`}>
                        {fmtDateTime(admin.created_at)}
                      </td>
                      <td className={TD}>
                        {active ? (
                          <StatusPill tone="emerald" dot>
                            启用
                          </StatusPill>
                        ) : (
                          <StatusPill tone="red" dot>
                            停用
                          </StatusPill>
                        )}
                      </td>
                      <td className={`${TD} text-right`}>
                        <div className="inline-flex gap-1.5 justify-end">
                          {!isSelf && admin.role !== 'super_admin' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setPwdTarget(admin);
                                setNewPwd('');
                              }}
                            >
                              改密
                            </Button>
                          )}
                          {!isSelf && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggleActive(admin)}
                              disabled={actingId === admin.id}
                              className={
                                active
                                  ? 'text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/70'
                                  : 'text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/70'
                              }
                            >
                              {active ? '停用' : '启用'}
                            </Button>
                          )}
                          {!isSelf && admin.role !== 'super_admin' && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleDelete(admin)}
                              disabled={actingId === admin.id}
                            >
                              删除
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 改密弹层 */}
      {pwdTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setPwdTarget(null)} />
          <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 max-w-sm w-full shadow-2xl">
            <h4 className="font-semibold text-slate-900 dark:text-white mb-1">重置管理员密码</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              为 {pwdTarget.display_name || pwdTarget.username} 设置新密码（≥6 位），其所有登录会话将立即失效。
            </p>
            <Input
              type="text"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="输入新密码"
              className="font-mono mb-4"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setPwdTarget(null)}>
                取消
              </Button>
              <Button
                size="sm"
                onClick={() => handleResetPwd(pwdTarget)}
                disabled={actingId === pwdTarget.id}
              >
                {actingId === pwdTarget.id ? '重置中...' : '确定重置'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 创建后的临时密码提示 */}
      {tempPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setTempPassword(null)} />
          <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 max-w-sm w-full shadow-2xl">
            <h4 className="font-semibold text-slate-900 dark:text-white mb-2">
              密码已重置（仅展示这一次）
            </h4>
            <div className="font-mono text-xl font-semibold text-primary-600 dark:text-primary-400 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3 mb-3 tracking-wider select-all">
              {tempPassword}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              请立即转告该管理员，关闭后无法再次查看。
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void copyToClipboard(tempPassword);
                  showToast('已复制', 'success');
                }}
              >
                复制
              </Button>
              <Button size="sm" onClick={() => setTempPassword(null)}>
                我已保存
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog}
    </div>
  );
};
