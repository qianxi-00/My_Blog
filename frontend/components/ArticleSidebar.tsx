import React from 'react';
import { Link } from 'react-router-dom';
import { Icons } from './Icons';
import { useToast } from './Toast';
import { Article, ArticleListItem } from '../api/articles';
import { getFileUrl } from '../api/config';
import { copyToClipboard } from '../utils/helpers';
import SeriesDirectory from './SeriesDirectory';

interface ArticleSidebarProps {
    article: Article;
    relatedArticles?: ArticleListItem[];
}

const ArticleSidebar: React.FC<ArticleSidebarProps> = ({ article, relatedArticles = [] }) => {
    const { showToast } = useToast();
    // 格式化日期
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    // 根据文章字数计算阅读时间（梯队设置）
    const calculateReadTime = (content?: string): number => {
        if (!content) return 5; // 默认 5 分钟

        // 去除 Markdown 标记，计算纯文字数
        const plainText = content
            .replace(/```[\s\S]*?```/g, '') // 移除代码块
            .replace(/`[^`]*`/g, '') // 移除行内代码
            .replace(/!\[.*?\]\(.*?\)/g, '') // 移除图片
            .replace(/\[.*?\]\(.*?\)/g, '') // 移除链接
            .replace(/[#*_~>\-|]/g, '') // 移除 Markdown 符号
            .replace(/\s+/g, ''); // 移除空格

        const wordCount = plainText.length;

        // 阅读时间梯队（假设中文阅读速度约 400-600 字/分钟）
        if (wordCount < 1000) return 2;        // < 1000 字：2 分钟
        if (wordCount < 3000) return 5;        // 1000-3000 字：5 分钟
        if (wordCount < 6000) return 8;        // 3000-6000 字：8 分钟
        if (wordCount < 10000) return 12;      // 6000-10000 字：12 分钟
        if (wordCount < 15000) return 18;      // 10000-15000 字：18 分钟
        return 25;                              // > 15000 字：25 分钟
    };

    const readTime = article.read_time_minutes || calculateReadTime(article.content_md);


    const [activeContact, setActiveContact] = React.useState<'email' | 'qq' | 'wechat' | null>(null);

    const toggleContact = (type: 'email' | 'qq' | 'wechat') => {
        setActiveContact(prev => prev === type ? null : type);
    };

    return (
        <aside className="hidden xl:block w-72 flex-shrink-0 pl-8 pt-0">
            <div className="sticky top-16 space-y-4">
                {/* 作者卡片 */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm transition-colors">
                    <div className="flex items-center gap-3 mb-4">
                        <img
                            src={article.author?.avatar_url ? getFileUrl(article.author.avatar_url) : '/default-avatar.png'}
                            alt={article.author?.display_name || '作者'}
                            className="w-12 h-12 rounded-full object-cover border-2 border-slate-100 dark:border-slate-700"
                        />
                        <div>
                            <div className="font-medium text-slate-800 dark:text-slate-200 transition-colors">{article.author?.display_name || '千禧'}</div>
                            <div className="text-xs text-slate-400 dark:text-slate-500 font-medium transition-colors">博主</div>
                        </div>
                    </div>

                    {/* 联系方式 - 图标横排交互 */}
                    <div className="mt-4 pt-4 border-t border-slate-50 dark:border-slate-700 transition-colors">
                        <div className="flex items-center gap-4 mb-3">
                            {article.author?.email && (
                                <button
                                    onClick={() => toggleContact('email')}
                                    className={`p-2 rounded-lg transition-all ${activeContact === 'email' ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-500 shadow-sm' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300'}`}
                                    title="查看邮箱"
                                >
                                    <Icons.Mail className="w-5 h-5" />
                                </button>
                            )}
                            {article.author?.qq && (
                                <button
                                    onClick={() => toggleContact('qq')}
                                    className={`p-2 rounded-lg transition-all ${activeContact === 'qq' ? 'bg-[#12B7F5]/10 text-[#12B7F5] shadow-sm' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300'}`}
                                    title="查看 QQ"
                                >
                                    <Icons.QQ className="w-5 h-5" />
                                </button>
                            )}
                            {article.author?.wechat && (
                                <button
                                    onClick={() => toggleContact('wechat')}
                                    className={`p-2 rounded-lg transition-all ${activeContact === 'wechat' ? 'bg-[#07C160]/10 text-[#07C160] shadow-sm' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300'}`}
                                    title="查看微信"
                                >
                                    <Icons.WeChat className="w-5 h-5" />
                                </button>
                            )}
                            {article.author?.github && (
                                <a
                                    href={article.author.github.startsWith('http') ? article.author.github : `https://github.com/${article.author.github}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 rounded-lg transition-all text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-300"
                                    title="GitHub"
                                >
                                    <Icons.Github className="w-5 h-5" />
                                </a>
                            )}
                            {article.author?.bilibili && (
                                <a
                                    href={article.author.bilibili.startsWith('http') ? article.author.bilibili : `https://space.bilibili.com/${article.author.bilibili}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 rounded-lg transition-all text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-[#FB7299]"
                                    title="Bilibili"
                                >
                                    <div className="w-5 h-5 flex items-center justify-center text-[10px] font-bold border-2 border-current rounded-sm select-none">B</div>
                                </a>
                            )}
                        </div>

                        {/* 动态显示的信息框 */}
                        {activeContact && (
                            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 animate-in fade-in slide-in-from-top-1 duration-200 transition-colors">
                                {activeContact === 'email' && (
                                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                        <span className="font-bold text-cyan-500 min-w-[32px]">Email</span>
                                        <a href={`mailto:${article.author?.email}`} className="truncate hover:underline select-all">
                                            {article.author?.email}
                                        </a>
                                    </div>
                                )}
                                {activeContact === 'qq' && (
                                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                        <span className="font-bold text-[#12B7F5] min-w-[32px]">QQ</span>
                                        <span className="select-all">{article.author?.qq}</span>
                                    </div>
                                )}
                                {activeContact === 'wechat' && (
                                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                        <span className="font-bold text-[#07C160] min-w-[32px]">微</span>
                                        <span className="select-all">{article.author?.wechat}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* 文章信息 */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm transition-colors">
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2 transition-colors">
                        <Icons.Calendar className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
                        文章信息
                    </h3>
                    <div className="space-y-2 text-sm text-slate-500 dark:text-slate-400 transition-colors">
                        <div className="flex justify-between">
                            <span>发布日期</span>
                            <span className="text-slate-700 dark:text-slate-200">{formatDate(article.created_at)}</span>
                        </div>
                        {article.updated_at && article.updated_at !== article.created_at && (
                            <div className="flex justify-between">
                                <span>最后更新</span>
                                <span className="text-slate-700 dark:text-slate-200">{formatDate(article.updated_at)}</span>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <span>阅读量</span>
                            <span className="text-slate-700 dark:text-slate-200">{article.view_count}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>点赞数</span>
                            <span className="text-slate-700 dark:text-slate-200">{article.like_count}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>预计阅读</span>
                            <span className="text-slate-700 dark:text-slate-200">{readTime} 分钟</span>
                        </div>
                    </div>
                </div>

                {/* 分享 (移到此处) */}
                <div className="bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/10 dark:to-blue-900/10 rounded-xl border border-cyan-100 dark:border-cyan-900/30 p-5 shadow-sm transition-colors">
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                        <Icons.Share2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                        分享文章
                    </h3>
                    <button
                        onClick={async () => {
                            const success = await copyToClipboard(window.location.href);
                            if (success) {
                                showToast('链接已复制到剪贴板！', 'success');
                            } else {
                                showToast('复制失败，请手动复制', 'error');
                            }
                        }}
                        className="w-full py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm rounded-lg border border-slate-200 dark:border-slate-700 transition-all flex items-center justify-center gap-2 shadow-sm font-medium"
                    >
                        复制链接
                    </button>
                </div>

                {/* 文章标签 */}
                {article.tags && article.tags.length > 0 && (
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm transition-colors">
                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                            <Icons.Tags className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
                            文章标签
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {article.tags.map((tag: any) => (
                                <Link
                                    key={tag.id}
                                    to={`/articles?tag=${tag.name}`}
                                    className="px-2.5 py-1 bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[11px] rounded-md hover:bg-cyan-50 dark:hover:bg-cyan-900/30 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors font-medium border border-slate-100 dark:border-slate-600"
                                >
                                    # {tag.name}
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* 系列文章目录 */}
                {article.category && (
                    <SeriesDirectory currentArticleId={article.id} category={article.category} />
                )}

                {/* 相关文章 (移到最后) */}
                {relatedArticles.length > 0 && (
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm transition-colors">
                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                            <Icons.ChevronRight className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
                            相关推荐
                        </h3>
                        <div className="space-y-3">
                            {relatedArticles.slice(0, 5).map((item) => (
                                <Link
                                    key={item.id}
                                    to={`/article/${item.slug || item.id}`}
                                    className="block group"
                                >
                                    <div className="text-sm text-slate-700 dark:text-slate-300 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors line-clamp-2">
                                        {item.title}
                                    </div>
                                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                        {item.published_at ? formatDate(item.published_at) : ''}
                                    </div>
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
