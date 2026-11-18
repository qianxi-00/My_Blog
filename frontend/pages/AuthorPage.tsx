/**
 * 公开作者页 /user/:username
 * 展示头像/昵称/角色/简介/安全外链/统计，以及 TA 发布的文章、Prompt 与社区主题
 */
import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { Badge, Button, EmptyState } from '../components/Shared';
import { ProfileSkeleton } from '../components/Skeleton';
import Avatar from '../components/Avatar';
import { getPublicUser, PublicUserProfile } from '../api/users';
import { getFileUrl } from '../api/config';
import { errorText } from '../utils/errors';
import { buildBilibiliUrl, buildGithubUrl, safeExternalUrl } from '../utils/urls';

type AuthorTab = 'articles' | 'prompts' | 'threads';

const AuthorPage: React.FC = () => {
  const { username } = useParams();
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<AuthorTab>('articles');

  useEffect(() => {
    const fetchProfile = async () => {
      if (!username) return;
      setLoading(true);
      setError('');
      try {
        const data = await getPublicUser(username);
        setProfile(data);
      } catch (err: any) {
        setError(errorText(err, '用户不存在或已注销'));
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
    window.scrollTo(0, 0);
  }, [username]);

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (error || !profile) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20">
        <EmptyState
          icon={<Icons.User className="w-5 h-5" />}
          title={error || '作者不存在'}
          action={
            <Link to="/articles">
              <Button size="sm" variant="outline">
                返回文章目录
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const articles = profile.articles || [];
  const prompts = profile.prompts || [];
  const threads = profile.threads || [];
  const stats = profile.stats || {
    articles: articles.length,
    prompts: prompts.length,
    threads: threads.length,
  };

  const authorName = profile.display_name || profile.username;
  const roleLabel =
    profile.role === 'super_admin'
      ? '站长'
      : profile.role === 'admin'
      ? '管理员'
      : '创作者';

  const githubUrl = buildGithubUrl(profile.github);
  const bilibiliUrl = buildBilibiliUrl(profile.bilibili);
  const websiteUrl = safeExternalUrl(profile.website);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-12 space-y-8">
      {/* Author Header */}
      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <Avatar
            name={authorName}
            avatarUrl={profile.avatar_url}
            className="w-20 h-20 text-2xl"
          />
          <div className="flex-1 text-center sm:text-left min-w-0 space-y-2">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                {authorName}
              </h1>
              <Badge color={profile.role === 'user' ? 'primary' : 'emerald'}>
                {roleLabel}
              </Badge>
            </div>

            <p className="text-xs font-mono text-slate-400 dark:text-slate-500">
              @{profile.username}
              {profile.created_at && (
                <span className="ml-3">
                  加入于 {new Date(profile.created_at).toLocaleDateString('zh-CN')}
                </span>
              )}
            </p>

            {profile.bio && (
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed pt-1">
                {profile.bio}
              </p>
            )}

            {(githubUrl || bilibiliUrl || websiteUrl) && (
              <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                {githubUrl && (
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors"
                  >
                    <Icons.Github className="w-3.5 h-3.5" />
                    <span>GitHub</span>
                  </a>
                )}
                {bilibiliUrl && (
                  <a
                    href={bilibiliUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors"
                  >
                    <Icons.Link2 className="w-3.5 h-3.5" />
                    <span>Bilibili</span>
                  </a>
                )}
                {websiteUrl && (
                  <a
                    href={websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors"
                  >
                    <Icons.Globe className="w-3.5 h-3.5" />
                    <span>个人网站</span>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Counters */}
        <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 text-center sm:text-left">
          <div>
            <div className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
              {stats.articles ?? articles.length}
            </div>
            <div className="text-xs text-slate-400">已发布文章</div>
          </div>
          <div>
            <div className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
              {stats.prompts ?? prompts.length}
            </div>
            <div className="text-xs text-slate-400">公开提示词</div>
          </div>
          <div>
            <div className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
              {stats.threads ?? threads.length}
            </div>
            <div className="text-xs text-slate-400">社区主题</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="space-y-5">
        <div className="flex gap-1 border-b border-slate-200/80 dark:border-slate-800">
          {(
            [
              { key: 'articles', label: '文章', count: articles.length },
              { key: 'prompts', label: '提示词', count: prompts.length },
              { key: 'threads', label: '社区讨论', count: threads.length },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
                tab === item.key
                  ? 'border-primary-600 text-slate-900 dark:text-white'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span>{item.label}</span>
              <span className="text-xs font-mono text-slate-400">{item.count}</span>
            </button>
          ))}
        </div>

        {tab === 'articles' &&
          (articles.length === 0 ? (
            <EmptyState icon={<Icons.FileText className="w-5 h-5" />} title="暂无已发布文章" />
          ) : (
            <div className="space-y-4">
              {articles.map((article) => (
                <Link
                  key={article.id}
                  to={`/articles/${article.id}`}
                  className="group flex flex-col sm:flex-row gap-5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                >
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      {article.category && <Badge color="slate">{article.category}</Badge>}
                      {article.published_at && (
                        <span className="font-mono">
                          {new Date(article.published_at).toLocaleDateString('zh-CN')}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-2">
                      {article.title}
                    </h3>
                    {article.summary && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
                        {article.summary}
                      </p>
                    )}
                  </div>
                  {article.cover_image && (
                    <div className="w-full sm:w-44 aspect-[16/9] rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                      <img
                        src={getFileUrl(article.cover_image)}
                        alt={article.title}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </Link>
              ))}
            </div>
          ))}

        {tab === 'prompts' &&
          (prompts.length === 0 ? (
            <EmptyState icon={<Icons.Sparkles className="w-5 h-5" />} title="暂无公开提示词" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {prompts.map((p) => (
                <Link
                  key={p.id}
                  to={`/prompts/${p.id}`}
                  className="group rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <Badge color="slate">{p.category}</Badge>
                    <span className="text-slate-400 tabular-nums">
                      复制 {p.copy_count || 0} 次
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-primary-600">
                    {p.title}
                  </h3>
                  {p.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                      {p.description}
                    </p>
                  )}
                  <pre className="text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 rounded-lg p-2.5 line-clamp-2 overflow-hidden">
                    {p.content}
                  </pre>
                </Link>
              ))}
            </div>
          ))}

        {tab === 'threads' &&
          (threads.length === 0 ? (
            <EmptyState icon={<Icons.MessagesSquare className="w-5 h-5" />} title="暂无社区主题" />
          ) : (
            <div className="divide-y divide-slate-200/70 dark:divide-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 overflow-hidden">
              {threads.map((t) => (
                <Link
                  key={t.id}
                  to={`/forum/threads/${t.id}`}
                  className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {t.is_solved && <Badge color="emerald">已解决</Badge>}
                      {t.category_name && <Badge color="slate">{t.category_name}</Badge>}
                    </div>
                    <h4 className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {t.title}
                    </h4>
                    <p className="text-xs text-slate-400 font-mono">
                      {new Date(t.created_at).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400 shrink-0 tabular-nums">
                    <span>{t.like_count} 赞</span>
                    <span>{t.reply_count} 回复</span>
                  </div>
                </Link>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
};

export default AuthorPage;
