import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Icons } from '../components/Icons';
import { Card, Button } from '../components/Shared';
import { StatCardProps } from '../types';
import { getStatsOverview, getDailyStats, getPopularArticles, StatsOverview, DailyStat, PopularArticle } from '../api/stats';
import { getFileUrl } from '../api/config';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

const StatCard: React.FC<StatCardProps> = ({ label, value, trend, trendUp, icon }) => (
  <Card className="p-6">
    <div className="flex items-center justify-between mb-4">
      <div className="p-3 rounded-xl bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400">
        {icon}
      </div>
      {trend && (
        <span className="text-xs font-bold px-2 py-1 rounded-full bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 border border-cyan-100 dark:border-cyan-800">
          {trend}
        </span>
      )}
    </div>
    <div className="text-3xl font-black text-slate-800 dark:text-slate-100 mb-1">{value}</div>
    <div className="text-sm text-slate-400 dark:text-slate-500 font-medium">{label}</div>
  </Card>
);

const AdminDashboard: React.FC = () => {
  const { admin } = useAuth();
  const { theme } = useTheme();
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [popularArticles, setPopularArticles] = useState<PopularArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartDays, setChartDays] = useState<7 | 30>(7);

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
    name: chartDays <= 7
      ? new Date(stat.date).toLocaleDateString('zh-CN', { weekday: 'short' })
      : new Date(stat.date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
    visits: stat.total_views,
    visitors: stat.unique_visitors,
    api: stat.ai_api_calls,
  }));

  // NOTE: 图表颜色根据主题动态切换
  const isDark = theme === 'dark';
  const chartColors = {
    grid: isDark ? '#334155' : '#e2e8f0',
    tick: isDark ? '#94a3b8' : '#64748b',
    tooltipBg: isDark ? '#1e293b' : '#fff',
    tooltipBorder: isDark ? '#334155' : '#e2e8f0',
    tooltipText: isDark ? '#e2e8f0' : '#1e293b',
  };

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
            欢迎回来，{admin?.display_name || admin?.username || '管理员'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400">这里是您的个人信息与站点核心指标汇聚地。</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={fetchData}>
            <Icons.LayoutDashboard className="w-4 h-4 mr-2" /> 刷新数据
          </Button>
          <Link to="/admin/settings">
            <Button variant="outline"><Icons.Settings className="w-4 h-4 mr-2" /> 站点设置</Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      {loading ? (
        <div className="text-center py-10 text-slate-400 dark:text-slate-500">加载中...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            label="今日访问量"
            value={overview?.today_views?.toLocaleString() || '0'}
            trend="+实时"
            trendUp={true}
            icon={<Icons.Eye className="w-6 h-6" />}
          />
          <StatCard
            label="发布文章"
            value={overview?.total_articles?.toString() || '0'}
            trend="总计"
            trendUp={false}
            icon={<Icons.FileText className="w-6 h-6" />}
          />
          <StatCard
            label="总评论数"
            value={overview?.total_comments?.toString() || '0'}
            trend={`${overview?.pending_comments || 0} 待审核`}
            trendUp={(overview?.pending_comments || 0) > 0}
            icon={<Icons.MessageCircle className="w-6 h-6" />}
          />
          <StatCard
            label="AI 模型调用"
            value={overview?.total_ai_calls?.toLocaleString() || '0'}
            trend={`今日 ${overview?.today_ai_calls || 0}`}
            trendUp={true}
            icon={<Icons.Bot className="w-6 h-6" />}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Card */}
        <Card className="p-8 flex flex-col items-center text-center border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="w-24 h-24 rounded-full bg-gradient-to-r from-cyan-500 to-purple-600 mb-4 flex items-center justify-center shadow-lg shadow-cyan-500/20 overflow-hidden">
            {admin?.avatar_url ? (
              <img src={getFileUrl(admin.avatar_url)} alt="头像" className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-white">
                {admin?.display_name?.[0] || admin?.username?.[0]?.toUpperCase() || 'A'}
              </span>
            )}
          </div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{admin?.display_name || admin?.username}</h3>
          <div className="flex items-center gap-2 mt-1 mb-6">
            <span className="bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 text-[10px] font-bold px-2 py-0.5 rounded uppercase border border-cyan-100 dark:border-cyan-800">
              {admin?.role === 'super_admin' ? 'Super Admin' : 'Admin'}
            </span>
            <span className="text-slate-500 dark:text-slate-400 text-sm">{admin?.email || ''}</span>
          </div>
          <div className="grid grid-cols-2 gap-4 w-full mb-8 text-left bg-slate-50 dark:bg-slate-700/50 p-4 rounded-xl border border-slate-100 dark:border-slate-600">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">用户名</span>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{admin?.username}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">注册日期</span>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {admin?.created_at ? new Date(admin.created_at).toLocaleDateString('zh-CN') : '-'}
              </span>
            </div>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-700/50 p-4 rounded-xl w-full text-left border border-slate-100 dark:border-slate-600">
            {admin?.bio || '专注技术分享与博客系统维护。热爱开源文化，致力于构建更智能的内容管理体验。'}
          </p>
        </Card>

        {/* Chart Section */}
        <Card className="lg:col-span-2 p-6 flex flex-col border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-slate-800 dark:text-slate-100">流量趋势监控</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setChartDays(7)}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${chartDays === 7 ? 'bg-cyan-500 text-white' : 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
              >
                最近 7 天
              </button>
              <button
                onClick={() => setChartDays(30)}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${chartDays === 30 ? 'bg-cyan-500 text-white' : 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
              >
                最近 30 天
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4 mb-4 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-cyan-500 inline-block" /> 访问次数</span>
            <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-purple-500 inline-block" /> 访客人数</span>
            <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-amber-500 inline-block" /> 模型调用</span>
          </div>
          <div className="flex-1 min-h-[300px]">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorVisitors" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorApi" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: chartColors.tick, fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: chartColors.tick, fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: `1px solid ${chartColors.tooltipBorder}`, backgroundColor: chartColors.tooltipBg, color: chartColors.tooltipText, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Area type="monotone" dataKey="visits" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#colorVisits)" name="访问次数" />
                  <Area type="monotone" dataKey="visitors" stroke="#a855f7" strokeWidth={2} fillOpacity={1} fill="url(#colorVisitors)" name="访客人数" />
                  <Area type="monotone" dataKey="api" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorApi)" name="模型调用" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-500">暂无数据</div>
            )}
          </div>
        </Card>
      </div>

      {/* Popular Articles */}
      <Card className="p-6 border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
          <Icons.TrendingUp className="w-5 h-5 text-cyan-500" />
          热门文章
        </h3>
        {popularArticles.length === 0 ? (
          <div className="text-slate-400 dark:text-slate-500 text-center py-6">暂无数据</div>
        ) : (
          <div className="space-y-4">
            {popularArticles.map((article, idx) => (
              <div key={article.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-700">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${idx === 0 ? 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800' :
                  idx === 1 ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600' :
                    idx === 2 ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800' :
                      'bg-slate-50 dark:bg-slate-700/50 text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-slate-700'
                  }`}>
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <Link to={`/articles/${article.id}`} className="text-slate-700 dark:text-slate-200 hover:text-cyan-600 dark:hover:text-cyan-400 font-medium transition-colors">
                    {article.title}
                  </Link>
                </div>
                <span className="text-slate-400 dark:text-slate-500 text-sm">{article.view_count} 阅读</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default AdminDashboard;