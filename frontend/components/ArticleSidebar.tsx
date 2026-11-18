import React from 'react';
import { Link } from 'react-router-dom';
import { Icons } from './Icons';
import { useToast } from './Toast';
import Avatar from './Avatar';
import { Article, ArticleListItem } from '../api/articles';
import { copyToClipboard } from '../utils/helpers';
import { buildBilibiliUrl, buildGithubUrl } from '../utils/urls';
import SeriesDirectory from './SeriesDirectory';

interface ArticleSidebarProps {
    article: Article;
    relatedArticles?: ArticleListItem[];
}

const ArticleSidebar: React.FC<ArticleSidebarProps> = ({ article, relatedArticles = [] }) => {
    const { showToast } = useToast();

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    const calculateReadTime = (content?: string): number => {
        if (!content) return 5;
        const plainText = content
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`[^`]*`/g, '')
            .replace(/!\[.*?\]\(.*?\)/g, '')
            .replace(/\[.*?\]\(.*?\)/g, '')
            .replace(/[#*_~>\-|]/g, '')
            .replace(/\s+/g, '');
        const wordCount = plainText.length;
        if (wordCount < 1000) return 2;
        if (wordCount < 3000) return 5;
        if (wordCount < 6000) return 8;
        if (wordCount < 10000) return 12;
        if (wordCount < 15000) return 18;
        return 25;
    };

    const readTime = article.read_time_minutes || calculateReadTime(article.content_md);
    const [activeContact, setActiveContact] = React.useState<'email' | 'qq' | 'wechat' | null>(null);

    const toggleContact = (type: 'email' | 'qq' | 'wechat') => {
        setActiveContact((prev) => (prev === type ? null : type));
    };

    const authorName = article.author?.display_name || article.author?.username || '千禧';
    const authorUsername = article.author?.username;
    const githubHref = buildGithubUrl(article.author?.github);
    const bilibiliHref = buildBilibiliUrl(article.author?.bilibili);
    const hasContact =
        Boolean(article.author?.email) ||
        Boolean(article.author?.qq) ||
        Boolean(article.author?.wechat) ||
        Boolean(githubHref) ||
        Boolean(bilibiliHref);

    return (
        <aside className="hidden lg:block w-72 flex-shrink-0 pl-8 pt-0">
            <div className="sticky top-20 space-y-4">
                {/* 作者卡片 */}
                <div className="bg-white dark:bg-slate-900/90 rounded-xl border border-slate-200/80 dark:border-slate-800 p-5 transition-colors">
                    <div className="flex items-center gap-3">
                        {authorUsername ? (
                            <Link to={`/user/${encodeURIComponent(authorUsername)}`} className="shrink-0">
                                <Avatar name={authorName} avatarUrl={article.author?.avatar_url} className="w-11 h-11 text-base ring-1 ring-slate-200 dark:ring-slate-700" />
                            </Link>
                        ) : (
                            <Avatar name={authorName} avatarUrl={article.author?.avatar_url} className="w-11 h-11 text-base ring-1 ring-slate-200 dark:ring-slate-700" />
                        )}
                        <div className="min-w-0 flex-1">
                            {authorUsername ? (
                                <Link
                                    to={`/user/${encodeURIComponent(authorUsername)}`}
                                    className="font-semibold text-sm text-slate-900 dark:text-slate-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors truncate block"
                                >
                                    {authorName}
                                </Link>
                            ) : (
                                <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">{authorName}</div>
                            )}
                            <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                                {authorUsername ? `@${authorUsername}` : '文章作者'}
                            </div>
                        </div>
                    </div>

                    {article.author?.description && (
                        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">
                            {article.author.description}
                        </p>
                    )}

                    {/* 联系方式 */}
                    {hasContact && (
                        <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-2 mb-2">
                                {article.author?.email && (
                                    <button
                                        type="button"
                                        onClick={() => toggleContact('email')}
                                        className={`p-2 rounded-lg transition-colors ${activeContact === 'email' ? 'bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                        title="查看邮箱"
                                    >
                                        <Icons.Mail className="w-4 h-4" />
                                    </button>
                                )}
                                {article.author?.qq && (
                                    <button
                                        type="button"
                                        onClick={() => toggleContact('qq')}
                                        className={`p-2 rounded-lg transition-colors ${activeContact === 'qq' ? 'bg-[#12B7F5]/10 text-[#12B7F5]' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                        title="查看 QQ"
                                    >
                                        <Icons.QQ className="w-4 h-4" />
                                    </button>
                                )}
                                {article.author?.wechat && (
                                    <button
                                        type="button"
                                        onClick={() => toggleContact('wechat')}
                                        className={`p-2 rounded-lg transition-colors ${activeContact === 'wechat' ? 'bg-[#07C160]/10 text-[#07C160]' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                        title="查看微信"
                                    >
                                        <Icons.WeChat className="w-4 h-4" />
                                    </button>
                                )}
                                {githubHref && (
                                    <a
                                        href={githubHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 rounded-lg transition-colors text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                                        title="GitHub"
                                    >
                                        <Icons.Github className="w-4 h-4" />
                                    </a>
                                )}
                                {bilibiliHref && (
                                    <a
                                        href={bilibiliHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 rounded-lg transition-colors text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-[#FB7299]"
                                        title="Bilibili"
                                    >
                                        <div className="w-4 h-4 flex items-center justify-center text-[10px] font-bold border border-current rounded-sm select-none">B</div>
                                    </a>
                                )}
                            </div>

                            {activeContact && (
                                <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 rounded-lg p-2.5 animate-fade-in-down">
                                    {activeContact === 'email' && (
                                        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                            <span className="font-semibold text-primary-600 dark:text-primary-400 shrink-0">Email</span>
                                            <a href={`mailto:${article.author?.email}`} className="truncate hover:underline select-all">
                                                {article.author?.email}
                                            </a>
                                        </div>
                                    )}
                                    {activeContact === 'qq' && (
                                        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                            <span className="font-semibold text-[#12B7F5] shrink-0">QQ</span>
                                            <span className="select-all">{article.author?.qq}</span>
                                        </div>
                                    )}
                                    {activeContact === 'wechat' && (
                                        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                            <span className="font-semibold text-[#07C160] shrink-0">微信</span>
                                            <span className="select-all">{article.author?.wechat}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* 文章信息 */}
                <div className="bg-white dark:bg-slate-900/90 rounded-xl border border-slate-200/80 dark:border-slate-800 p-5 transition-colors">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                        <Icons.Calendar className="w-3.5 h-3.5 text-primary-500" />
                        文章信息
                    </h3>
                    <div className="space-y-2 text-[13px] text-slate-500 dark:text-slate-400">
                        <div className="flex justify-between gap-2">
                            <span>发布日期</span>
                            <span className="text-slate-800 dark:text-slate-200 tabular-nums">{formatDate(article.published_at || article.created_at)}</span>
                        </div>
                        {article.updated_at && article.updated_at !== article.created_at && (
                            <div className="flex justify-between gap-2">
                                <span>最后更新</span>
                                <span className="text-slate-800 dark:text-slate-200 tabular-nums">{formatDate(article.updated_at)}</span>
                            </div>
                        )}
                        <div className="flex justify-between gap-2">
                            <span>阅读量</span>
                            <span className="text-slate-800 dark:text-slate-200 tabular-nums">{article.view_count}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span>点赞数</span>
                            <span className="text-slate-800 dark:text-slate-200 tabular-nums">{article.like_count}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span>预计阅读</span>
                            <span className="text-slate-800 dark:text-slate-200 tabular-nums">{readTime} 分钟</span>
                        </div>
                    </div>
                </div>

                {/* 分享 */}
                <div className="bg-white dark:bg-slate-900/90 rounded-xl border border-slate-200/80 dark:border-slate-800 p-5 transition-colors">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                        <Icons.Share2 className="w-3.5 h-3.5 text-primary-500" />
                        分享文章
                    </h3>
                    <button
                        type="button"
                        onClick={async () => {
                            const success = await copyToClipboard(window.location.href);
                            if (success) {
                                showToast('链接已复制到剪贴板', 'success');
                            } else {
                                showToast('复制失败，请手动复制', 'error');
                            }
                        }}
                        className="w-full py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 transition-colors flex items-center justify-center gap-1.5"
                    >
                        <Icons.Copy className="w-3.5 h-3.5" />
                        复制当前链接
                    </button>
                </div>

                {/* 文章标签 */}
                {article.tags && article.tags.length > 0 && (
                    <div className="bg-white dark:bg-slate-900/90 rounded-xl border border-slate-200/80 dark:border-slate-800 p-5 transition-colors">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                            <Icons.Tags className="w-3.5 h-3.5 text-primary-500" />
                            文章标签
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                            {article.tags.map((tag) => (
                                <Link
                                    key={tag.id}
                                    to={`/articles?tag=${encodeURIComponent(tag.name)}`}
                                    className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs rounded-md hover:bg-primary-50 dark:hover:bg-primary-950/60 hover:text-primary-600 dark:hover:text-primary-400 transition-colors font-medium border border-slate-200/80 dark:border-slate-700"
                                >
                                    #{tag.name}
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* 系列文章目录 */}
                {article.category && (
                    <SeriesDirectory currentArticleId={article.id} category={article.category} />
                )}

                {/* 相关推荐 */}
                {relatedArticles.length > 0 && (
                    <div className="bg-white dark:bg-slate-900/90 rounded-xl border border-slate-200/80 dark:border-slate-800 p-5 transition-colors">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                            <Icons.ChevronRight className="w-3.5 h-3.5 text-primary-500" />
                            相关推荐
                        </h3>
                        <div className="space-y-3">
                            {relatedArticles.slice(0, 5).map((item) => (
                                <Link
                                    key={item.id}
                                    to={`/articles/${item.id}`}
                                    className="block group"
                                >
                                    <div className="text-[13px] font-medium text-slate-700 dark:text-slate-300 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-2 leading-snug">
                                        {item.title}
                                    </div>
                                    {item.published_at && (
                                        <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 tabular-nums">
                                            {formatDate(item.published_at)}
                                        </div>
                                    )}
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
};

export default ArticleSidebar;
