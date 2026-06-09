import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { Card, Button } from '../components/Shared';
import api from '../api/config';

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
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number, email: string) => {
    if (!confirm(`确定要删除订阅者 ${email} 吗？`)) return;

    try {
      await api.delete(`/subscribers/${id}`);
      setSubscribers(prev => prev.filter(s => s.id !== id));
    } catch (error: any) {
      alert(error.response?.data?.detail || '删除失败');
    }
  };

  const handleFreeze = async (subscriber: Subscriber) => {
    const action = subscriber.is_frozen ? '解冻' : '冻结';
    if (!confirm(`确定要${action}订阅者 ${subscriber.email} 吗？`)) return;

    try {
      const response = await api.put(`/subscribers/${subscriber.id}/freeze?frozen=${!subscriber.is_frozen}`);
      setSubscribers(prev => prev.map(s => s.id === subscriber.id ? response.data : s));
    } catch (error: any) {
      alert(error.response?.data?.detail || `${action}失败`);
    }
  };

  // 批量冻结/解冻所有订阅者
  const handleFreezeAll = async (frozen: boolean) => {
    const action = frozen ? '冻结' : '解冻';
    const target = frozen ? '所有活跃订阅者' : '所有已冻结订阅者';
    if (!confirm(`确定要${action}${target}吗？`)) return;

    try {
      const response = await api.put(`/subscribers/freeze-all?frozen=${frozen}`);
      alert(response.data.message);
      fetchSubscribers(); // 重新加载列表
    } catch (error: any) {
      alert(error.response?.data?.detail || `${action}失败`);
    }
  };

  const filteredSubscribers = subscribers.filter(s => {
    // 状态筛选
    if (filter === 'active' && !s.is_active) return false;
    if (filter === 'inactive' && s.is_active) return false;

    // 搜索筛选
    if (searchTerm && !s.email.toLowerCase().includes(searchTerm.toLowerCase())) return false;

    return true;
  });

  const activeCount = subscribers.filter(s => s.is_active && !s.is_frozen).length;
  const frozenCount = subscribers.filter(s => s.is_frozen).length;
  const inactiveCount = subscribers.filter(s => !s.is_active).length;

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">订阅管理</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">管理邮件订阅用户</p>
        </div>
        <div className="flex items-center gap-4">
          {/* 批量操作按钮 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleFreezeAll(true)}
              disabled={activeCount === 0}
              className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/60 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
              title="冻结所有活跃订阅者"
            >
              ❄️ 一键冻结
            </button>
            <button
              onClick={() => handleFreezeAll(false)}
              disabled={frozenCount === 0}
              className="px-3 py-1.5 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/60 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
              title="解冻所有已冻结订阅者"
            >
              ☀️ 一键解冻
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="px-3 py-1 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 rounded-full font-medium">
              活跃: {activeCount}
            </span>
            <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-full font-medium">
              已冻结: {frozenCount}
            </span>
            <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full font-medium">
              已退订: {inactiveCount}
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6 p-4 dark:bg-slate-800 dark:border-slate-700 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="搜索邮箱..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all"
            />
          </div>

          {/* Status Filter */}
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'all'
                ? 'bg-cyan-500 text-white shadow-md'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
            >
              全部
            </button>
            <button
              onClick={() => setFilter('active')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'active'
                ? 'bg-green-500 text-white shadow-md'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
            >
              活跃
            </button>
            <button
              onClick={() => setFilter('inactive')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'inactive'
                ? 'bg-slate-500 text-white shadow-md'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
            >
              已退订
            </button>
          </div>
        </div>
      </Card>

      {/* Subscriber List */}
      <Card className="dark:bg-slate-800 dark:border-slate-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400 dark:text-slate-500">加载中...</div>
        ) : filteredSubscribers.length === 0 ? (
          <div className="p-10 text-center text-slate-400 dark:text-slate-500">
            {searchTerm ? '没有找到匹配的订阅者' : '暂无订阅者'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
                  <th className="text-left p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">邮箱</th>
                  <th className="text-left p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">状态</th>
                  <th className="text-left p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">订阅时间</th>
                  <th className="text-left p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">退订时间</th>
                  <th className="text-right p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                {filteredSubscribers.map((subscriber) => (
                  <tr key={subscriber.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white font-bold text-sm shadow-sm ring-2 ring-white dark:ring-slate-700">
                          {subscriber.email[0].toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-700 dark:text-slate-200">{subscriber.email}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      {!subscriber.is_active ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-full text-xs font-medium">
                          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full"></span>
                          已退订
                        </span>
                      ) : subscriber.is_frozen ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-full text-xs font-medium border border-blue-200 dark:border-blue-800">
                          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                          已冻结
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 rounded-full text-xs font-medium border border-green-200 dark:border-green-800">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                          活跃
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-slate-500 dark:text-slate-400">
                      {new Date(subscriber.subscribed_at).toLocaleString('zh-CN')}
                    </td>
                    <td className="p-4 text-sm text-slate-500 dark:text-slate-400">
                      {subscriber.unsubscribed_at
                        ? new Date(subscriber.unsubscribed_at).toLocaleString('zh-CN')
                        : '-'
                      }
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {subscriber.is_active && (
                          <button
                            onClick={() => handleFreeze(subscriber)}
                            className={`p-2 rounded-lg transition-colors ${subscriber.is_frozen
                              ? 'text-green-500 dark:text-green-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30'
                              : 'text-blue-500 dark:text-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                              }`}
                            title={subscriber.is_frozen ? '解冻订阅者' : '冻结订阅者'}
                          >
                            {subscriber.is_frozen ? '☀️' : '❄️'}
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(subscriber.id, subscriber.email)}
                          className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                          title="删除订阅者"
                        >
                          <Icons.X className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Stats Summary */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-6 text-center dark:bg-slate-800 dark:border-slate-700 shadow-sm">
          <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">{subscribers.length}</div>
          <div className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">总订阅数</div>
        </Card>
        <Card className="p-6 text-center dark:bg-slate-800 dark:border-slate-700 shadow-sm border-t-4 border-t-green-500">
          <div className="text-3xl font-bold text-green-600 dark:text-green-400">{activeCount}</div>
          <div className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">活跃订阅</div>
        </Card>
        <Card className="p-6 text-center dark:bg-slate-800 dark:border-slate-700 shadow-sm">
          <div className="text-3xl font-bold text-slate-400 dark:text-slate-500">{inactiveCount}</div>
          <div className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">已退订</div>
        </Card>
      </div>
    </div>
  );
};

export default SubscriberManager;
