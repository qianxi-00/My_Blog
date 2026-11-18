import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { Button, Badge, StatusPill, EmptyState } from '../components/Shared';
import { Skeleton, CardSkeleton } from '../components/Skeleton';
import Avatar from '../components/Avatar';
import { getArticles, ArticleListItem, getTags, Tag } from '../api/articles';
import { getHotspots, HotTopicListItem } from '../api/hotspots';
import { getForumThreads, ForumThreadListItem } from '../api/forum';
import {
  getPublicSettings,
  getPublicSiteOverview,
  PublicSettings,
  PublicSiteOverview,
} from '../api/stats';
import { getFileUrl } from '../api/config';
import { subscribe } from '../api/subscribe';
import { errorText } from '../utils/errors';
import { buildBilibiliUrl, buildGithubUrl, safeExternalUrl } from '../utils/urls';
import { formatRelativeTimeZh } from '../utils/helpers';

const formatRelativeTime = formatRelativeTimeZh;

const Home: React.FC = () => {
  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [latestHotspots, setLatestHotspots] = useState<HotTopicListItem[]>([]);
  const [recentThreads, setRecentThreads] = useState<ForumThreadListItem[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [overview, setOverview] = useState<PublicSiteOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const [subscribeEmail, setSubscribeEmail] = useState('');
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeStatus, setSubscribeStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [subscribeMessage, setSubscribeMessage] = useState('');

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      try {
        const [articlesRes, hotspotsRes, threadsRes, settingsRes, tagsRes, overviewRes] =
          await Promise.allSettled([
            getArticles({ page: 1, page_size: 4, status: 'published' }),
            getHotspots({ page: 1, page_size: 6, status: 'published', sort: 'latest', admin: false }),
            getForumThreads({ page: 1, page_size: 5, sort: 'latest_activity' }),
            getPublicSettings(),
            getTags(),
            getPublicSiteOverview(),
          ]);

        if (!active) return;

        if (articlesRes.status === 'fulfilled') {
          setArticles(articlesRes.value.data || []);
        }
        if (hotspotsRes.status === 'fulfilled') {
          setLatestHotspots((hotspotsRes.value.data || []).slice(0, 6));
        }
        if (threadsRes.status === 'fulfilled') {
          setRecentThreads((threadsRes.value.data || []).slice(0, 5));
        }
        if (settingsRes.status === 'fulfilled') {
          setSettings(settingsRes.value);
        }
        if (tagsRes.status === 'fulfilled') {
          setTags((tagsRes.value || []).slice(0, 14));
        }
        if (overviewRes.status === 'fulfilled') {
          setOverview(overviewRes.value);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchData();
    return () => {
      active = false;
    };
  }, []);

  const githubUrl = buildGithubUrl(settings?.contact?.github);
  const bilibiliUrl = buildBilibiliUrl(settings?.contact?.bilibili);
  const twitterUrl = safeExternalUrl(settings?.contact?.twitter);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subscribeEmail.trim()) return;
    setSubscribing(true);
    setSubscribeStatus('idle');
    setSubscribeMessage('');
    try {
      const result = await subscribe(subscribeEmail.trim());
      if (result.success) {
        setSubscribeStatus('success');
        setSubscribeMessage(result.message || '订阅成功，感谢关注！');
        setSubscribeEmail('');
      } else {
        setSubscribeStatus('error');
        setSubscribeMessage(result.message || '订阅失败，请稍后重试');
      }
    } catch (error: any) {
      setSubscribeStatus('error');
      setSubscribeMessage(errorText(error, '订阅失败'));
    } finally {
      setSubscribing(false);
    }
  };

  const metrics = [
    {
      label: '技术文章',
      value: overview?.articles_count,
      to: '/articles',
      icon: Icons.FileText,
      hint: '工程笔记与长文归档',
    },
    {
      label: 'AI 热点',
      value: overview?.hotspots_count,
      to: '/hotspots',
      icon: Icons.TrendingUp,
      hint: '论文精读与前沿动态',
    },
    {
      label: 'Prompt 库',
      value: overview?.prompts_count,
      to: '/prompts',
      icon: Icons.Sparkles,
      hint: '可复用的提示词模板',
    },
    {
      label: '社区讨论',
      value: overview?.threads_count,
      to: '/forum',
      icon: Icons.MessagesSquare,
      hint: '开放问答与技术交流',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-16">
      {/* Editorial Hero */}
      <section className="border-b border-slate-200/80 dark:border-slate-800 pb-12">
        <div className="max-w-3xl space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill tone="emerald" dot>
              持续更新 · AI 工程与开放讨论
            </StatusPill>
            <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
              {settings?.site_title || 'DevLog'}
            </span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.15]">
            记录工程实践、AI 论文精读与技术社区的日常沉淀
          </h1>

          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
            {settings?.site_description ||
              '你好，我是千禧。这里聚焦大模型应用架构、全栈工程细节、每日 AI 情报追踪，以及面向所有开发者的创作与问答社区。'}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link to="/articles">
              <Button size="lg">
                <span>阅读技术文章</span>
                <Icons.ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to="/forum">
              <Button size="lg" variant="outline">
                <Icons.MessagesSquare className="w-4 h-4" />
                <span>进入技术社区</span>
              </Button>
            </Link>
            <Link to="/write">
              <Button size="lg" variant="ghost">
                <Icons.Pencil className="w-4 h-4" />
                <span>我要投稿</span>
              </Button>
            </Link>

            {(githubUrl || bilibiliUrl || twitterUrl) && (
              <div className="flex items-center gap-2 ml-auto sm:ml-2 pl-3 border-l border-slate-200 dark:border-slate-800">
                {githubUrl && (
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="GitHub"
                    aria-label="GitHub"
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Icons.Github className="w-4 h-4" />
                  </a>
                )}
                {bilibiliUrl && (
                  <a
                    href={bilibiliUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Bilibili"
                    aria-label="Bilibili"
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Icons.Globe className="w-4 h-4" />
                  </a>
                )}
                {twitterUrl && (
                  <a
                    href={twitterUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Twitter / X"
                    aria-label="Twitter"
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Icons.Twitter className="w-4 h-4" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Live Metrics Strip */}
        <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {metrics.map((m) => {
            const Icon = m.icon;
            return (
              <Link
                key={m.to}
                to={m.to}
                className="group rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between text-slate-400 dark:text-slate-500">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {m.label}
                  </span>
                  <Icon className="w-4 h-4 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors" />
                </div>
                <div className="mt-2">
                  {loading && m.value === undefined ? (
                    <Skeleton className="h-7 w-14" />
                  ) : (
                    <span className="text-2xl font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">
                      {m.value ?? 0}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">
                  {m.hint}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Latest Articles */}
      <section className="space-y-6">
        <div className="flex items-end justify-between border-b border-slate-200/80 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
              最新文章
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              来自站长与社区创作者的精选长文
            </p>
          </div>
          <Link
            to="/articles"
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            <span>全部文章</span>
            <Icons.ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : articles.length === 0 ? (
          <EmptyState
            icon={<Icons.FileText className="w-5 h-5" />}
            title="暂无已发布文章"
            description="第一篇精选文章正在撰写中"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 stagger-in">
            {articles.map((article, idx) => (
              <Link
                key={article.id}
                to={`/articles/${article.id}`}
                className="group flex flex-col rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 overflow-hidden hover:border-slate-300 dark:hover:border-slate-700 transition-colors card-lift"
              >
                <div className="aspect-[16/9] bg-slate-100 dark:bg-slate-800/80 relative overflow-hidden border-b border-slate-200/60 dark:border-slate-800">
                  {article.cover_image ? (
                    <img
                      src={getFileUrl(article.cover_image)}
                      alt={article.title}
                      loading={idx === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100/80 dark:bg-slate-900 text-slate-400 dark:text-slate-600">
                      <span className="text-3xl font-semibold tracking-tight text-slate-300 dark:text-slate-700 select-none">
                        {(article.category || 'Dev').slice(0, 6)}
                      </span>
                    </div>
                  )}
                  <div className="absolute top-3 left-3">
                    <Badge color="slate" className="bg-white/90 dark:bg-slate-950/85 backdrop-blur-sm">
                      {article.category || '技术'}
                    </Badge>
                  </div>
                </div>

                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
                    <span>
                      {article.published_at
                        ? new Date(article.published_at).toLocaleDateString('zh-CN')
                        : ''}
                    </span>
                    <span>·</span>
                    <span>{article.read_time_minutes || 5} 分钟阅读</span>
                    <span className="inline-flex items-center gap-1 ml-auto tabular-nums">
                      <Icons.Eye className="w-3.5 h-3.5" />
                      {article.view_count}
                    </span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Icons.Heart className="w-3.5 h-3.5" />
                      {article.like_count}
                    </span>
                  </div>

                  <h3 className="mt-2.5 text-base font-semibold text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-2 leading-snug">
                    {article.title}
                  </h3>

                  {article.summary && (
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {article.summary}
                    </p>
                  )}

                  {article.tags?.length > 0 && (
                    <div className="mt-auto pt-4 flex flex-wrap gap-1.5">
                      {article.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag.id}
                          className="text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/70 px-2 py-0.5 rounded border border-slate-200/70 dark:border-slate-700/70"
                        >
                          #{tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* AI Hotspots */}
      <section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
              AI 热点追踪
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              自动化研读管线精选的前沿模型与系统论文拆解
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link
              to="/ai-daily"
              className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              AI 日报
            </Link>
            <Link
              to="/leaderboard"
              className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              模型榜
            </Link>
            <Link
              to="/hotspots"
              className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              <span>热点频道</span>
              <Icons.ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : latestHotspots.length === 0 ? (
          <EmptyState
            icon={<Icons.TrendingUp className="w-5 h-5" />}
            title="暂无已发布热点"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {latestHotspots.map((item, idx) => (
              <Link
                key={item.id}
                to={`/hotspots/${item.id}`}
                className="group rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors card-lift"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {idx < 3 && (
                        <Badge color="primary" className="font-mono text-[10px]">
                          TOP {idx + 1}
                        </Badge>
                      )}
                      <Badge color="slate" className="truncate">
                        {item.primary_category || '未分类'}
                      </Badge>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500 shrink-0">
                      {item.published_at
                        ? new Date(item.published_at).toLocaleDateString('zh-CN')
                        : item.topic_date}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors leading-snug">
                    {item.title}
                  </h3>

                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-3 leading-relaxed">
                    {item.summary || '点击查看深度解析与结构化梳理'}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
                  <span>{item.source_count || 0} 条信息源</span>
                  <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 group-hover:text-primary-600 dark:group-hover:text-primary-400 font-medium">
                    深读 <Icons.ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Latest Community Discussions */}
      <section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
              最新社区讨论
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              技术提问、经验交流、Bug 探讨与精选回答
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/forum/new">
              <Button size="sm" variant="outline">
                <Icons.Plus className="w-3.5 h-3.5" />
                <span>发起讨论</span>
              </Button>
            </Link>
            <Link
              to="/forum"
              className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              <span>进入社区</span>
              <Icons.ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {loading ? (
          <CardSkeleton />
        ) : recentThreads.length === 0 ? (
          <EmptyState
            icon={<Icons.MessagesSquare className="w-5 h-5" />}
            title="社区讨论区暂无主题"
            description="成为第一个发起技术讨论的开发者"
            action={
              <Link to="/forum/new">
                <Button size="sm">发起第一个主题</Button>
              </Link>
            }
          />
        ) : (
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 divide-y divide-slate-200/70 dark:divide-slate-800 overflow-hidden">
            {recentThreads.map((t) => {
              const displayAuthor = t.author_display_name || t.author_nickname;
              return (
                <div
                  key={t.id}
                  className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {t.username ? (
                      <Link
                        to={`/user/${encodeURIComponent(t.username)}`}
                        className="shrink-0 mt-0.5"
                        title={displayAuthor}
                      >
                        <Avatar
                          name={displayAuthor}
                          avatarUrl={t.author_avatar || undefined}
                          className="w-8 h-8 text-xs"
                        />
                      </Link>
                    ) : (
                      <Avatar
                        name={displayAuthor}
                        avatarUrl={t.author_avatar || undefined}
                        className="w-8 h-8 text-xs mt-0.5 shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {t.is_pinned && (
                          <Badge color="amber" className="text-[10px] py-0">
                            <Icons.Pin className="w-2.5 h-2.5" /> 置顶
                          </Badge>
                        )}
                        {t.is_solved && (
                          <Badge color="emerald" className="text-[10px] py-0">
                            <Icons.CheckCircle2 className="w-2.5 h-2.5" /> 已解决
                          </Badge>
                        )}
                        {t.is_featured && (
                          <Badge color="primary" className="text-[10px] py-0">
                            精华
                          </Badge>
                        )}
                        {t.category_name && (
                          <Badge color="slate" className="text-[10px] py-0">
                            {t.category_name}
                          </Badge>
                        )}
                        <Link
                          to={`/forum/threads/${t.id}`}
                          className="text-sm font-medium text-slate-900 dark:text-slate-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors truncate"
                        >
                          {t.title}
                        </Link>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                        <span>{displayAuthor}</span>
                        <span>·</span>
                        <span>{formatRelativeTime(t.last_post_at || t.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500 shrink-0 tabular-nums">
                    <span className="inline-flex items-center gap-1" title="点赞">
                      <Icons.ThumbsUp className="w-3.5 h-3.5" />
                      {t.like_count || 0}
                    </span>
                    <span className="inline-flex items-center gap-1" title="回复">
                      <Icons.MessageSquare className="w-3.5 h-3.5" />
                      {t.reply_count}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Bottom: Newsletter + Tags & Navigation */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-6 sm:p-8 flex flex-col justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-400">
              <Icons.Mail className="w-3.5 h-3.5" />
              <span>周刊订阅</span>
            </div>
            <h3 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
              获取精选文章与 AI 深度动态推送
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-lg">
              每周精选 AI 工程实践、开源工具评测与系统架构笔记直达收件箱，无广告、支持随时一键退订。
            </p>
          </div>

          <form onSubmit={handleSubscribe} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Icons.Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={subscribeEmail}
                  onChange={(e) => setSubscribeEmail(e.target.value)}
                  placeholder="输入你的邮箱地址..."
                  className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
              <Button
                type="submit"
                size="lg"
                disabled={subscribing || subscribeStatus === 'success'}
                className="sm:w-auto w-full shrink-0"
              >
                {subscribing
                  ? '提交中...'
                  : subscribeStatus === 'success'
                  ? '已订阅'
                  : '订阅更新'}
              </Button>
            </div>
            {subscribeStatus !== 'idle' && subscribeMessage && (
              <p
                className={`text-xs ${
                  subscribeStatus === 'success'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {subscribeMessage}
              </p>
            )}
          </form>
        </div>

        <div className="lg:col-span-2 flex flex-col gap-5">
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5 flex-1">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-1.5">
              <Icons.Tags className="w-3.5 h-3.5" />
              <span>热门标签</span>
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {tags.length > 0 ? (
                tags.map((tag) => (
                  <Link
                    key={tag.id}
                    to={`/articles?tag=${encodeURIComponent(tag.name)}`}
                    className="px-2.5 py-1 rounded-md text-xs font-mono bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/70 hover:border-primary-400 dark:hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                  >
                    #{tag.name}
                  </Link>
                ))
              ) : (
                <span className="text-xs text-slate-400">暂无标签</span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-1.5">
              <Icons.Compass className="w-3.5 h-3.5" />
              <span>快速直达</span>
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {[
                { to: '/articles', icon: Icons.FileText, label: '文章目录' },
                { to: '/archives', icon: Icons.Archive, label: '时间归档' },
                { to: '/ai-daily', icon: Icons.Activity, label: 'AI 日报' },
                { to: '/prompts', icon: Icons.Bot, label: 'Prompt 库' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200/70 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    <Icon className="w-3.5 h-3.5 text-slate-400" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;