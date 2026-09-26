/**
 * 公开作者页 /user/:username
 * 作者卡片（头像/昵称/简介）+ TA 的已发布文章列表
 */
import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import Avatar from '../components/Avatar';
import { getPublicUser, PublicUserProfile } from '../api/users';
import { getFileUrl } from '../api/config';

const AuthorPage: React.FC = () => {
    const { username } = useParams();
    const [profile, setProfile] = useState<PublicUserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchProfile = async () => {
            if (!username) return;
            setLoading(true);
            setError('');
            try {
                const data = await getPublicUser(username);
                setProfile(data);
            } catch (err: any) {
                setError(err.response?.data?.detail || '作者不存在或已注销');
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
        window.scrollTo(0, 0);
    }, [username]);

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-20 text-center text-slate-400 dark:text-slate-500">
                <div className="animate-pulse">加载中...</div>
            </div>
        );
    }

    if (error || !profile) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-20 text-center">
                <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-4 transition-colors">{error || '作者不存在'}</h1>
                <Link to="/articles" className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors">返回文章列表</Link>
            </div>
        );
    }

    const author = profile.user;
    const articles = profile.articles || [];
    const authorName = author.display_name || author.username;

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
            {/* 作者卡片 */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                    <Avatar name={authorName} avatarUrl={author.avatar_url} className="w-20 h-20 text-3xl" />
                    <div className="flex-1 text-center sm:text-left min-w-0">
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white transition-colors">{authorName}</h1>
                        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">@{author.username}</p>
                        {author.bio && (
                            <p className="text-slate-600 dark:text-slate-400 leading-relaxed mt-3">{author.bio}</p>
                        )}
                        {author.created_at && (
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-3 flex items-center gap-1 justify-center sm:justify-start">
                                <Icons.Calendar className="w-3.5 h-3.5" />
                                于 {new Date(author.created_at).toLocaleDateString('zh-CN')} 加入
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* 文章列表 */}
            <div>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3 transition-colors">
                        <span className="w-2 h-7 bg-primary-500 rounded-full"></span>
                        TA 的文章
                    </h2>
                    <span className="text-slate-500 dark:text-slate-400 font-medium text-sm transition-colors">共 {articles.length} 篇</span>
                </div>

                {articles.length === 0 ? (
                    <div className="text-center text-slate-400 dark:text-slate-500 py-16 bg-slate-50/50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 transition-colors">
                        <div className="text-4xl mb-3 opacity-50">📄</div>
                        <p>TA 还没有发布文章</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {articles.map((article) => (
                            <article key={article.id} className="group relative pl-8 border-l-2 border-slate-100 dark:border-slate-800 hover:border-primary-200 dark:hover:border-primary-800 transition-colors">
                                <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 ring-4 ring-white dark:ring-slate-900 group-hover:bg-primary-500 transition-colors"></div>

                                <div className="flex flex-col md:flex-row gap-6">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400 mb-2 font-medium transition-colors">
                                            {article.published_at && (
                                                <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300 transition-colors">
                                                    {new Date(article.published_at).toLocaleDateString('zh-CN')}
                                                </span>
                                            )}
                                            {article.category && (
                                                <>
                                                    <span className="w-1 h-1 bg-slate-300 dark:bg-slate-600 rounded-full"></span>
                                                    <span>{article.category}</span>
                                                </>
                                            )}
                                        </div>
                                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors leading-tight">
                                            <Link to={`/articles/${article.id}`}>
                                                {article.title}
                                            </Link>
                                        </h3>
                                        {article.summary && (
                                            <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-3 line-clamp-2 transition-colors">
                                                {article.summary}
                                            </p>
                                        )}
                                    </div>
                                    {article.cover_image && (
                                        <div className="w-full md:w-52 aspect-[16/9] rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0 transition-colors">
                                            <img
                                                src={getFileUrl(article.cover_image)}
                                                alt={article.title}
                                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                                            />
                                        </div>
                                    )}
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuthorPage;
