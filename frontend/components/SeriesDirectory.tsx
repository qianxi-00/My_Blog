import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArticleSeriesItem, getSeriesArticles } from '../api/articles';

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
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm transition-colors">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2 transition-colors">
                <span className="text-base">📚</span>
                系列文章
                <span className="text-xs text-slate-400 dark:text-slate-500 font-normal ml-auto">{series.length} 篇</span>
            </h3>
            <nav className="space-y-1 text-sm max-h-[40vh] overflow-y-auto pr-1 custom-scrollbar">
                {series.map((item) => (
                    <Link
                        key={item.id}
                        to={item.slug ? `/article/${item.slug}` : `/articles/${item.id}`}
                        className={`block py-2 px-3 rounded-lg transition-all text-sm ${currentArticleId === item.id
                            ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 font-semibold border-l-2 border-cyan-500'
                            : 'text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                            }`}
                    >
                        <span className="line-clamp-2">{item.title}</span>
                    </Link>
                ))}
            </nav>
        </div>
    );
};

export default SeriesDirectory;
