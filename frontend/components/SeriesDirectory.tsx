import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArticleSeriesItem, getSeriesArticles } from '../api/articles';
import { Icons } from './Icons';

interface SeriesDirectoryProps {
    currentArticleId: number;
    category: string;
}

/**
 * 系列文章目录组件
 * 展示同分类下的所有已发布文章，高亮当前文章
 */
const SeriesDirectory: React.FC<SeriesDirectoryProps> = ({ currentArticleId, category }) => {
    const [series, setSeries] = useState<ArticleSeriesItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSeries = async () => {
            if (!category) {
                setLoading(false);
                return;
            }
            try {
                const data = await getSeriesArticles(category);
                setSeries(data);
            } catch (error) {
                console.error('Failed to fetch series articles:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchSeries();
    }, [category]);

    // 仅当同分类下有多于一篇文章时才显示
    if (loading && series.length === 0) return null;
    if (series.length <= 1) return null;

    return (
        <div className="bg-white dark:bg-slate-900/90 rounded-xl border border-slate-200/80 dark:border-slate-800 p-5 transition-colors">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                <Icons.BookOpen className="w-3.5 h-3.5 text-primary-500" />
                系列文章
                <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 ml-auto tabular-nums">{series.length} 篇</span>
            </h3>
            <nav className="space-y-1 text-sm max-h-[40vh] overflow-y-auto pr-1 custom-scrollbar">
                {series.map((item) => {
                    const isCurrent = currentArticleId === item.id;
                    return (
                        <Link
                            key={item.id}
                            to={item.slug ? `/article/${item.slug}` : `/articles/${item.id}`}
                            className={`block py-2 px-3 rounded-lg transition-colors text-[13px] leading-snug ${
                                isCurrent
                                    ? 'bg-primary-50 dark:bg-primary-950/50 text-primary-700 dark:text-primary-300 font-semibold border-l-2 border-primary-500'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                            }`}
                        >
                            <span className="line-clamp-2">{item.title}</span>
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
};

export default SeriesDirectory;
