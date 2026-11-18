import React, { useState, useEffect } from 'react';
import Avatar from '../components/Avatar';
import { Icons } from '../components/Icons';
import { Button, Card, EmptyState, Input, StatusPill } from '../components/Shared';
import { ListSkeleton } from '../components/Skeleton';
import api from '../api/config';
import { errorText } from '../utils/errors';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { TH, TD } from '../constants';

interface Subscriber {
  id: number;
  email: string;
  is_active: boolean;
  is_frozen: boolean;
  subscribed_at: string;
  unsubscribed_at?: string;
  frozen_at?: string;
}

const SubscriberManager: React.FC = () => {
  const { confirm, confirmDialog } = useConfirm();
  const { showToast } = useToast();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchSubscribers();
  }, []);

  const fetchSubscribers = async () => {
    setLoading(true);
    try {
      const response = await api.get('/subscribers');
      setSubscribers(response.data);
    } catch (error) {
      console.error('获取订阅者列表失败:', error);
      showToast(errorText(error, '获取订阅者列表失败'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number, email: string) => {
    const ok = await confirm({
      title: '删除订阅者',
      message: `确定要删除订阅者 ${email} 吗？删除后不可恢复。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;

    try {
      await api.delete(`/subscribers/${id}`);
      setSubscribers((prev) => prev.filter((s) => s.id !== id));
      showToast('订阅者已删除', 'success');
    } catch (error: any) {
      showToast(errorText(error, '删除失败'), 'error');
    }
  };

  // 单条冻结/解冻为可逆操作：不弹确认，执行后 toast
  const handleFreeze = async (subscriber: Subscriber) => {
    const action = subscriber.is_frozen ? '解冻' : '冻结';

    try {
      const response = await api.put(
        `/subscribers/${subscriber.id}/freeze?frozen=${!subscriber.is_frozen}`
      );
      setSubscribers((prev) =>
        prev.map((s) => (s.id === subscriber.id ? response.data : s))
      );
      showToast(`${action}成功`, 'success');
    } catch (error: any) {
      showToast(errorText(error, `${action}失败`), 'error');
    }
  };

  // 批量冻结/解冻所有订阅者
  const handleFreezeAll = async (frozen: boolean) => {
    const action = frozen ? '冻结' : '解冻';
    const target = frozen ? '所有活跃订阅者' : '所有已冻结订阅者';
    if (frozen) {
      const ok = await confirm({
        title: '一键冻结全部',
        message: `确定要${action}${target}吗？冻结期间将停止对其发送邮件。`,
        confirmText: '全部冻结',
        danger: true,
      });
      if (!ok) return;
    }

    try {
      const response = await api.put(`/subscribers/freeze-all?frozen=${frozen}`);
      showToast(response.data.message || `${action}成功`, 'success');
      fetchSubscribers();
    } catch (error: any) {
      showToast(errorText(error, `${action}失败`), 'error');
    }
  };

  const filteredSubscribers = subscribers.filter((s) => {
    if (filter === 'active' && !s.is_active) return false;
    if (filter === 'inactive' && s.is_active) return false;
    if (searchTerm && !s.email.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const activeCount = subscribers.filter((s) => s.is_active && !s.is_frozen).length;
  const frozenCount = subscribers.filter((s) => s.is_frozen).length;
  const inactiveCount = subscribers.filter((s) => !s.is_active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
            订阅管理
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            管理邮件更新订阅用户及投递冻结状态
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleFreezeAll(true)}
            disabled={activeCount === 0}
            title="冻结所有活跃订阅者"
          >
            <Icons.Lock className="w-3.5 h-3.5" />
            一键冻结
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleFreezeAll(false)}
            disabled={frozenCount === 0}
            title="解冻所有已冻结订阅者"
          >
            <Icons.Unlock className="w-3.5 h-3.5" />
            一键解冻
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">总订阅数</div>
          <div className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
            {subscribers.length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>活跃接收</span>
          </div>
          <div className="mt-1.5 text-2xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {activeCount}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-primary-500" />
            <span>已冻结</span>
          </div>
          <div className="mt-1.5 text-2xl font-semibold text-primary-600 dark:text-primary-400 tabular-nums">
            {frozenCount}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span>已退订</span>
          </div>
          <div className="mt-1.5 text-2xl font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
            {inactiveCount}
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 relative">
            <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <Input
              type="text"
              placeholder="搜索邮箱..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="inline-flex rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-0.5 self-start sm:self-auto">
            {([
              { key: 'all', label: '全部' },
              { key: 'active', label: '活跃' },
              { key: 'inactive', label: '已退订' },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setFilter(opt.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  filter === opt.key
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Subscriber List */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-4">
            <ListSkeleton rows={4} />
          </div>
        ) : filteredSubscribers.length === 0 ? (
          <EmptyState
            icon={<Icons.Mail className="w-5 h-5" />}
            title={searchTerm ? '没有找到匹配的订阅者' : '暂无订阅者'}
            description={searchTerm ? '尝试调整搜索关键词或状态筛选条件。' : undefined}
            className="border-0"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/80 dark:bg-slate-950/50 border-b border-slate-200/80 dark:border-slate-800">
                <tr>
                  <th className={TH}>邮箱</th>
                  <th className={TH}>状态</th>
                  <th className={TH}>订阅时间</th>
                  <th className={TH}>退订时间</th>
                  <th className={`${TH} text-right`}>操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                {filteredSubscribers.map((subscriber) => (
                  <tr
                    key={subscriber.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className={TD}>
                      <div className="flex items-center gap-3">
                        <Avatar
                          name={subscriber.email}
                          className="w-8 h-8 text-xs"
                        />
                        <span className="font-medium text-slate-800 dark:text-slate-200 text-sm">
                          {subscriber.email}
                        </span>
                      </div>
                    </td>
                    <td className={TD}>
                      {!subscriber.is_active ? (
                        <StatusPill tone="slate" dot>
                          已退订
                        </StatusPill>
                      ) : subscriber.is_frozen ? (
                        <StatusPill tone="primary" dot>
                          已冻结
                        </StatusPill>
                      ) : (
                        <StatusPill tone="emerald" dot>
                          活跃
                        </StatusPill>
                      )}
                    </td>
                    <td className={`${TD} text-xs text-slate-500 dark:text-slate-400 tabular-nums`}>
                      {new Date(subscriber.subscribed_at).toLocaleString('zh-CN')}
                    </td>
                    <td className={`${TD} text-xs text-slate-500 dark:text-slate-400 tabular-nums`}>
                      {subscriber.unsubscribed_at
                        ? new Date(subscriber.unsubscribed_at).toLocaleString('zh-CN')
                        : '—'}
                    </td>
                    <td className={`${TD} text-right`}>
                      <div className="flex items-center justify-end gap-1.5">
                        {subscriber.is_active && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleFreeze(subscriber)}
                            className="h-7 px-2.5 text-xs"
                            title={subscriber.is_frozen ? '解冻订阅者' : '冻结订阅者'}
                          >
                            {subscriber.is_frozen ? (
                              <>
                                <Icons.Unlock className="w-3 h-3" />
                                解冻
                              </>
                            ) : (
                              <>
                                <Icons.Lock className="w-3 h-3" />
                                冻结
                              </>
                            )}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(subscriber.id, subscriber.email)}
                          className="h-7 px-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                          title="删除订阅者"
                        >
                          <Icons.Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {confirmDialog}
    </div>
  );
};

export default SubscriberManager;
