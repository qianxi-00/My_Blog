import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { Card, Button, Badge } from '../components/Shared';
import { getArticles, ArticleListItem, getTags, Tag } from '../api/articles';
import { getHotspots, HotTopicListItem } from '../api/hotspots';
import { getPublicSettings, PublicSettings } from '../api/stats';
import { getFileUrl } from '../api/config';
import { subscribe } from '../api/subscribe';

const Home: React.FC = () => {
  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [latestHotspots, setLatestHotspots] = useState<HotTopicListItem[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // 订阅状态
  const [subscribeEmail, setSubscribeEmail] = useState('');
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeStatus, setSubscribeStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [subscribeMessage, setSubscribeMessage] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [articlesRes, hotspotsRes, settingsRes, tagsRes] = await Promise.all([
          getArticles({ page: 1, page_size: 5, status: 'published' }),
          getHotspots({ page: 1, page_size: 8, status: 'published', sort: 'latest', admin: false }),
          getPublicSettings(),
          getTags(),
        ]);
        setArticles(articlesRes.data);
        setLatestHotspots((hotspotsRes.data || []).slice(0, 8));
        setSettings(settingsRes);
        setTags(tagsRes.slice(0, 8)); // 最多显示8个标签
      } catch (error) {
        console.error('获取数据失败:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-20">

      {/* Personal Hero Section */}
      <section className="flex flex-col md:flex-row items-center gap-10 md:gap-16 mt-8">
        <div className="flex-1 text-center md:text-left space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold transition-colors">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            欢迎来到我的技术博客
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tight text-slate-900 dark:text-white leading-tight transition-colors">
            你好，我是 <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-500 to-indigo-600">
              千禧
            </span>
          </h1>
          <p className="text-lg text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl mx-auto md:mx-0 transition-colors">
            {settings?.site_description || '你好，我是千禧，一名专注于 AI 大模型研发与应用的从业者。'}
          </p>
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 pt-2">
            <Link to="/articles">
              <Button size="lg" className="rounded-full">
                阅读文章目录
                <Icons.BookOpen className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link to="/archives">
              <Button size="lg" variant="outline" className="rounded-full">
                技术栈归档
              </Button>
            </Link>
            <div className="flex gap-4 ml-4 border-l border-slate-200 dark:border-slate-700 pl-4 transition-colors">
              {settings?.contact?.github && (
                <a href={settings.contact.github} target="_blank" rel="noopener noreferrer" className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                  <Icons.Github className="w-5 h-5" />
                </a>
              )}
              {settings?.contact?.twitter && (
                <a href={settings.contact.twitter} target="_blank" rel="noopener noreferrer" className="text-slate-400 dark:text-slate-500 hover:text-primary-500 dark:hover:text-primary-400 transition-colors">
                  <Icons.Twitter className="w-5 h-5" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Abstract Avatar / Graphic */}
        <div className="relative w-64 h-64 md:w-80 md:h-80 flex-shrink-0">
          <div className="absolute inset-0 bg-gradient-to-tr from-primary-100 to-indigo-100 dark:from-primary-900/30 dark:to-indigo-900/30 rounded-full blur-3xl opacity-70 animate-pulse transition-all"></div>
          <div className="relative w-full h-full rounded-full bg-white dark:bg-slate-800 border-4 border-white dark:border-slate-700 shadow-2xl dark:shadow-slate-900/50 overflow-hidden flex items-center justify-center transition-all">
            {settings?.admin_avatar ? (
              <img
                src={getFileUrl(settings.admin_avatar)}
                alt="头像"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary-400 to-indigo-500 flex items-center justify-center">
                <span className="text-6xl font-bold text-white">千</span>
              </div>
            )}
          </div>
          {/* Floating badges */}
          <div className="absolute -bottom-4 -right-4 bg-white dark:bg-slate-800 p-3 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700 flex items-center gap-2 animate-bounce transition-all delay-100" style={{ animationDuration: '3s' }}>
            <div className="bg-blue-100 dark:bg-blue-900/30 p-1.5 rounded-lg text-blue-600 dark:text-blue-400"><Icons.Code className="w-4 h-4" /></div>
            <div className="text-xs font-bold text-slate-700 dark:text-slate-200">编程开发</div>
          </div>
          <div className="absolute top-0 -left-4 bg-white dark:bg-slate-800 p-3 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700 flex items-center gap-2 animate-bounce transition-all delay-100" style={{ animationDuration: '4s' }}>
            <div className="bg-purple-100 dark:bg-purple-900/30 p-1.5 rounded-lg text-purple-600 dark:text-purple-400"><Icons.Bot className="w-4 h-4" /></div>
            <div className="text-xs font-bold text-slate-700 dark:text-slate-200">AI 研究</div>
          </div>
        </div>
      </section>

      {/* Blog Post List */}
      <section>
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100 dark:border-slate-700 transition-colors">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2 transition-colors">
            <Icons.FileText className="w-5 h-5 text-slate-400 dark:text-slate-500" />
            最新发布
          </h2>
          <Link to="/articles" className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300">浏览目录 &rarr;</Link>
        </div>

        {loading ? (
          <div className="text-center py-10 text-slate-400 dark:text-slate-500">加载中...</div>
        ) : articles.length === 0 ? (
          <div className="text-center py-10 text-slate-400 dark:text-slate-500">暂无文章</div>
        ) : (
          <div className="space-y-8">
            {articles.map((article) => (
              <article key={article.id} className="flex flex-col md:flex-row gap-6 group cursor-pointer">
                <div className="md:w-1/3 aspect-video rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 relative transition-colors">
                  <img
                    src={getFileUrl(article.cover_image) || `https://picsum.photos/seed/${article.id}/800/400`}
                    alt={article.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute top-2 left-2">
                    <span className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 shadow-sm transition-colors">
                      {article.category || '其它'}
                    </span>
                  </div>
                </div>
                <div className="flex-1 py-2">
                  <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400 mb-2 font-medium transition-colors">
                    <span>{article.published_at ? new Date(article.published_at).toLocaleDateString('zh-CN') : ''}</span>
                    <span className="w-1 h-1 bg-slate-400 dark:bg-slate-600 rounded-full"></span>
                    <span>{article.read_time_minutes || 5} min 阅读</span>
                    <span className="w-1 h-1 bg-slate-400 dark:bg-slate-600 rounded-full"></span>
                    <span className="flex items-center gap-1"><Icons.Eye className="w-3 h-3" />{article.view_count}</span>
                    <span className="flex items-center gap-1"><Icons.Heart className="w-3 h-3" />{article.like_count}</span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors leading-tight">
                    <Link to={`/articles/${article.id}`}>{article.title}</Link>
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-4 line-clamp-2 transition-colors">
                    {article.summary}
                  </p>
                  <div className="flex items-center gap-2">
                    {article.tags.map(tag => (
                      <span key={tag.id} className="text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 px-2 py-1 rounded border border-slate-100 dark:border-slate-700 transition-colors">#{tag.name}</span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Latest Hotspots */}
      <section>
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100 dark:border-slate-700 transition-colors">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2 transition-colors">
            <Icons.TrendingUp className="w-5 h-5 text-rose-400 dark:text-rose-500" />
            最新热点
          </h2>
          <Link to="/hotspots" className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300">查看热点频道 &rarr;</Link>
        </div>

        {loading ? (
          <div className="text-center py-10 text-slate-400 dark:text-slate-500">加载中...</div>
        ) : latestHotspots.length === 0 ? (
          <div className="text-center py-10 text-slate-400 dark:text-slate-500">暂无热点</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            {latestHotspots.map((item, index) => (
              <Link
                key={item.id}
                to={`/hotspots/${item.id}`}
                className="group rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-lg transition-all overflow-hidden"
              >
                <div className="h-1.5 bg-gradient-to-r from-rose-400 via-primary-500 to-cyan-400" />
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap gap-2">
                      {index < 3 && (
                        <span className="px-2 py-1 rounded-md bg-rose-50 text-rose-600 border border-rose-200">TOP {index + 1}</span>
                      )}
                      <span className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{item.primary_category || '未分类'}</span>
                    </div>
                    <span className="text-slate-400 dark:text-slate-500">{item.published_at ? new Date(item.published_at).toLocaleDateString('zh-CN') : item.topic_date}</span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white line-clamp-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-3 min-h-[60px] transition-colors">
                    {item.summary || '暂无摘要'}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(item.tags || []).slice(0, 3).map((tag) => (
                      <span key={tag} className="px-2 py-1 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300">
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 pt-1">
                    <span>来源 {item.source_count || 0}</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-primary-600 dark:text-primary-400">
                      阅读详情 <Icons.ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Bottom Section: Compact but Balanced */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Newsletter Subscription */}
        <div className="lg:col-span-3">
          <div className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 p-6 md:p-8 h-full flex flex-col justify-center gap-6 transition-colors">
            <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.05] pointer-events-none bg-[radial-gradient(#0f172a_1px,transparent_1px)] dark:bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px]"></div>

            <div className="relative z-10 flex flex-col md:flex-row items-start gap-6">
              <div className="w-14 h-14 rounded-2xl bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center shadow-sm flex-shrink-0 ring-4 ring-primary-50 dark:ring-primary-900/20 transition-all">
                <Icons.Sparkles className="w-7 h-7" />
              </div>
              <div className="space-y-3">
                <h3 className="text-xl font-black text-slate-800 dark:text-white leading-none transition-colors">周刊订阅</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed max-w-md transition-colors">
                  每周一期，我会挑选最精华的 AI 动态、编程实战和深度思考，拒绝在信息洪流中迷失。
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1 font-medium italic">
                  {['AI 工具测评', '编程实战总结', '独家源码分享'].map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 transition-colors">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary-400"></div>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row gap-2 transition-all">
              <div className="relative flex-1">
                <input
                  type="email"
                  value={subscribeEmail}
                  onChange={(e) => setSubscribeEmail(e.target.value)}
                  placeholder="请输入您的邮箱地址..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border-none bg-transparent text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-0 text-sm font-medium transition-colors"
                />
                <Icons.Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400 dark:text-slate-500" />
              </div>
              <button
                onClick={async () => {
                  if (!subscribeEmail.trim()) return;
                  setSubscribing(true);
                  setSubscribeStatus('idle');
                  try {
                    const result = await subscribe(subscribeEmail);
                    if (result.success) {
                      setSubscribeStatus('success');
                      setSubscribeMessage(result.message);
                      setSubscribeEmail('');
                    } else {
                      setSubscribeStatus('error');
                      setSubscribeMessage(result.message);
                    }
                  } catch (error: any) {
                    setSubscribeStatus('error');
                    setSubscribeMessage(error.response?.data?.detail || '订阅失败');
                  } finally {
                    setSubscribing(false);
                  }
                }}
                disabled={subscribing || subscribeStatus === 'success'}
                className={`px-8 py-2.5 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-2 min-w-[120px] shadow-sm active:scale-95 ${subscribeStatus === 'success'
                  ? 'bg-emerald-500 text-white cursor-default'
                  : 'bg-slate-900 dark:bg-primary-600 hover:bg-slate-800 dark:hover:bg-primary-700 text-white'
                  }`}
              >
                {subscribing ? <Icons.RefreshCw className="w-4 h-4 animate-spin" /> : subscribeStatus === 'success' ? <Icons.Check className="w-4 h-4" /> : <Icons.Send className="w-4 h-4" />}
                {subscribing ? '提交中' : subscribeStatus === 'success' ? '已订阅' : '立即订阅'}
              </button>
            </div>

            {subscribeStatus === 'error' && (
              <p className="text-red-500 dark:text-red-400 text-xs text-center font-medium bg-red-50 dark:bg-red-900/20 py-1 rounded-lg">{subscribeMessage}</p>
            )}

            <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-200/40 dark:border-slate-700/40 transition-colors">
              <span className="font-medium">订阅后只接收精选更新</span>
              <div className="flex items-center gap-2 opacity-60">
                <Icons.Check className="w-3.5 h-3.5 text-emerald-500" />
                <span>随时一键取消</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Sidebar */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Popular Tags */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-6 shadow-sm flex-1 transition-all">
            <h4 className="text-[11px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2 transition-colors">
              <Icons.Tags className="w-4 h-4 text-rose-400 dark:text-rose-500" />
              热门标签
            </h4>
            <div className="flex flex-wrap gap-2">
              {tags.length > 0 ? tags.map(tag => (
                <Link
                  key={tag.id}
                  to={`/articles?tag=${tag.name}`}
                  className="px-3 py-1 rounded-lg text-xs font-bold bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-300 border border-slate-100 dark:border-slate-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-800 transition-all"
                >
                  #{tag.name}
                </Link>
              )) : <span className="text-slate-300 dark:text-slate-600 text-sm">暂无标签</span>}
            </div>
          </div>

          {/* Quick Links */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-6 shadow-sm transition-all">
            <h4 className="text-[11px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2 transition-colors">
              <Icons.Link className="w-4 h-4 text-indigo-400 dark:text-indigo-500" />
              导航入口
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {[
                { to: '/articles', icon: Icons.FileText, label: '全部文章', bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400' },
                { to: '/hotspots', icon: Icons.TrendingUp, label: 'AI 热点', bg: 'bg-rose-50 dark:bg-rose-900/30', text: 'text-rose-600 dark:text-rose-400' },
                { to: '/archives', icon: Icons.Archive, label: '技术栈归档', bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400' },
                { to: '/prompts', icon: Icons.Bot, label: '提示词库', bg: 'bg-purple-50 dark:bg-purple-900/30', text: 'text-purple-600 dark:text-purple-400' },
                { to: '/articles', icon: Icons.BookOpen, label: '精选文章', bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400' }
              ].map((item, idx) => (
                <Link
                  key={idx}
                  to={item.to}
                  className="flex items-center gap-3 p-2 rounded-xl border border-slate-50 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all group"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.bg} ${item.text} group-hover:scale-110 transition-transform flex-shrink-0`}>
                    <item.icon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate transition-colors">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;