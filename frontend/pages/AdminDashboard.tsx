import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Icons } from '../components/Icons';
import Avatar from '../components/Avatar';
import { Badge, Button, Card, EmptyState, StatusPill } from '../components/Shared';
import { Skeleton } from '../components/Skeleton';
import { StatCardProps } from '../types';
import {
  getStatsOverview,
  getDailyStats,
  getPopularArticles,
  StatsOverview,
  DailyStat,
  PopularArticle,
} from '../api/stats';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { UserArticleReviewPanel } from '../components/UserAdminPanels';

type DashboardTab = 'overview' | 'user-articles';

const DASHBOARD_TABS: { key: DashboardTab; label: string }[] = [
  { key: 'overview', label: '站点概览' },
  { key: 'user-articles', label: '用户文章审核' },
];

const StatCard: React.FC<StatCardProps & { actionText?: string; to?: string }> = ({
  label,
  value,
  trend,
  trendUp,
  icon,
  actionText,
  to,
}) => {
  const body = (
    <Card
      className={`p-5 h-full ${
        to
          ? 'relative group hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer'
          : ''
      }`}
    >
      {to && (
        <Icons.ExternalLink
          aria-hidden
          className="absolute bottom-4 right-4 w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-primary-500 transition-colors"
        />
      )}
      <div className="flex items-center justify-between mb-4">
        <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700/80 flex items-center justify-center text-slate-700 dark:text-slate-200">
          {icon}
        </div>
        {trend && (
          <div className="flex items-center gap-2">
            <StatusPill tone={trendUp ? 'amber' : 'emerald'} dot>
              {actionText && !trendUp ? '已清零' : trend}
            </StatusPill>
            {actionText && trendUp && (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                {actionText}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white tabular-nums">
        {value}
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{label}</div>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
};

const AdminDashboard: React.FC = () => {
  const { admin } = useAuth();
  const { theme } = useTheme();
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [popularArticles, setPopularArticles] = useState<PopularArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartDays, setChartDays] = useState<7 | 30>(7);
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [overviewRes, dailyRes, popularRes] = await Promise.all([
        getStatsOverview(),
        getDailyStats(chartDays),
        getPopularArticles(5),
      ]);
      setOverview(overviewRes);
      setDailyStats(dailyRes);
      setPopularArticles(popularRes);
    } catch (error) {
      console.error('获取统计数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [chartDays]);

  const chartData = dailyStats.map((stat) => ({
    name:
      chartDays <= 7
        ? new Date(stat.date).toLocaleDateString('zh-CN', { weekday: 'short' })
        : new Date(stat.date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
    visits: stat.total_views,
    visitors: stat.unique_visitors,
    api: stat.ai_api_calls,
  }));

  const isDark = theme === 'dark';
  const chartColors = {
    grid: isDark ? '#1e293b' : '#e2e8f0',
    tick: isDark ? '#94a3b8' : '#64748b',
    tooltipBg: isDark ? '#0f172a' : '#ffffff',
    tooltipBorder: isDark ? '#1e293b' : '#e2e8f0',
    tooltipText: isDark ? '#f1f5f9' : '#0f172a',
  };

  const displayName = admin?.display_name || admin?.username || '管理员';

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
            欢迎回来，{displayName}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {new Date().toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <Icons.RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新数据
          </Button>
          <Link to="/admin/posts/new">
            <Button size="sm">
              <Icons.Plus className="w-3.5 h-3.5" />
              写文章
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200/80 dark:border-slate-800">
        {DASHBOARD_TABS.map((tab) => (
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

      {activeTab === 'user-articles' && <UserArticleReviewPanel />}

      {activeTab === 'overview' && (
        <>
          {/* Stats Grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="p-5 space-y-3">
                  <div className="flex justify-between">
                    <Skeleton className="w-9 h-9 rounded-lg" />
                    <Skeleton className="w-16 h-5 rounded-full" />
                  </div>
                  <Skeleton className="h-7 w-20" />
                  <Skeleton className="h-3.5 w-24" />
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="今日访问量"
                value={overview?.today_views?.toLocaleString() || '0'}
                trend="实时"
                trendUp={false}
                icon={<Icons.Eye className="w-4 h-4" />}
              />
              <StatCard
                label="发布文章"
                value={overview?.total_articles?.toString() || '0'}
                trend="总计"
                trendUp={false}
                icon={<Icons.FileText className="w-4 h-4" />}
                to="/admin/posts"
              />
              <StatCard
                label="总评论数"
                value={overview?.total_comments?.toString() || '0'}
                trend={`${overview?.pending_comments || 0} 待审核`}
                trendUp={(overview?.pending_comments || 0) > 0}
                icon={<Icons.MessageCircle className="w-4 h-4" />}
                actionText="去处理 →"
                to="/admin/comments"
              />
              <StatCard
                label="AI 模型调用"
                value={overview?.total_ai_calls?.toLocaleString() || '0'}
                trend={`今日 ${overview?.today_ai_calls || 0}`}
                trendUp={false}
                icon={<Icons.Bot className="w-4 h-4" />}
                to="/admin/ai-agent"
              />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Profile Card */}
            <Card className="p-6 flex flex-col justify-between">
              <div className="flex flex-col items-center text-center">
                <Avatar
                  name={displayName}
                  avatarUrl={admin?.avatar_url || undefined}
                  className="w-20 h-20 text-2xl mb-4 ring-1 ring-slate-200 dark:ring-slate-800"
                />
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {displayName}
                </h3>
                <div className="flex items-center gap-2 mt-1.5 mb-5">
                  <Badge color="primary">
                    {admin?.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                  </Badge>
                  {admin?.email && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
                      {admin.email}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 w-full mb-4 text-left bg-slate-50 dark:bg-slate-950/60 p-3.5 rounded-lg border border-slate-200/70 dark:border-slate-800">
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-0.5">用户名</span>
                    <span className="text-xs font-mono font-medium text-slate-800 dark:text-slate-200">
                      @{admin?.username}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-0.5">注册日期</span>
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200 tabular-nums">
                      {admin?.created_at
                        ? new Date(admin.created_at).toLocaleDateString('zh-CN')
                        : '—'}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-950/60 p-3.5 rounded-lg w-full text-left border border-slate-200/70 dark:border-slate-800">
                  {admin?.bio ||
                    '专注技术分享与博客系统维护。热爱开源文化，致力于构建更智能的内容管理体验。'}
                </p>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200/70 dark:border-slate-800 flex justify-end">
                <Link
                  to="/admin/profile"
                  className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1"
                >
                  编辑个人资料
                  <Icons.ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </Card>

            {/* Chart Section */}
            <Card className="lg:col-span-2 p-6 flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    流量趋势监控
                  </h3>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-1 rounded bg-sky-500 inline-block" /> 访问次数
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-1 rounded bg-indigo-500 inline-block" /> 访客人数
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-1 rounded bg-amber-500 inline-block" /> 模型调用
                    </span>
                  </div>
                </div>
                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-50 dark:bg-slate-950/60">
                  <button
                    type="button"
                    onClick={() => setChartDays(7)}
                    className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${
                      chartDays === 7
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    近 7 天
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartDays(30)}
                    className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${
                      chartDays === 30
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    近 30 天
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-[280px]">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorVisitors" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorApi" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: chartColors.tick, fontSize: 12 }}
                        dy={10}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: chartColors.tick, fontSize: 12 }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '10px',
                          border: `1px solid ${chartColors.tooltipBorder}`,
                          backgroundColor: chartColors.tooltipBg,
                          color: chartColors.tooltipText,
                          fontSize: '12px',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="visits"
                        stroke="#0ea5e9"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorVisits)"
                        name="访问次数"
                      />
                      <Area
                        type="monotone"
                        dataKey="visitors"
                        stroke="#6366f1"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorVisitors)"
                        name="访客人数"
                      />
                      <Area
                        type="monotone"
                        dataKey="api"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorApi)"
                        name="模型调用"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-slate-400 dark:text-slate-500">
                    暂无流量数据
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Popular Articles */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Icons.TrendingUp className="w-4 h-4 text-primary-500" />
                热门文章
              </h3>
              <Link
                to="/admin/posts"
                className="text-xs font-medium text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                全部文章 →
              </Link>
            </div>
            {popularArticles.length === 0 ? (
              <EmptyState title="暂无阅读排行数据" className="border-0 py-8" />
            ) : (
              <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
                {popularArticles.map((article, idx) => (
                  <div
                    key={article.id}
                    className="flex items-center gap-4 py-3 first:pt-1 last:pb-1"
                  >
                    <span
                      className={`w-6 h-6 rounded-md flex items-center justify-center font-mono font-semibold text-xs shrink-0 ${
                        idx === 0
                          ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/60'
                          : idx === 1
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                            : idx === 2
                              ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border border-orange-200/70 dark:border-orange-800/60'
                              : 'bg-slate-50 dark:bg-slate-900 text-slate-400 border border-slate-200/60 dark:border-slate-800'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/articles/${article.id}`}
                        className="text-sm font-medium text-slate-800 dark:text-slate-200 hover:text-primary-600 dark:hover:text-primary-400 transition-colors truncate block"
                      >
                        {article.title}
                      </Link>
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                      {article.view_count} 阅读
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;