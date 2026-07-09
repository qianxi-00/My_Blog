import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { getArticles, getTags, ArticleListItem, Tag } from '../api/articles';

// 为每个标签分配一套柔和配色
const TAG_COLORS: Record<string, { bg: string; border: string; icon: string; badge: string; hoverBg: string }> = {};
const COLOR_PALETTE = [
  { bg: 'bg-amber-50 dark:bg-amber-950/20', border: 'border-amber-200/60 dark:border-amber-800/40', icon: 'text-amber-500', badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300', hoverBg: 'hover:border-amber-300 dark:hover:border-amber-700' },
  { bg: 'bg-sky-50 dark:bg-sky-950/20', border: 'border-sky-200/60 dark:border-sky-800/40', icon: 'text-sky-500', badge: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300', hoverBg: 'hover:border-sky-300 dark:hover:border-sky-700' },
  { bg: 'bg-violet-50 dark:bg-violet-950/20', border: 'border-violet-200/60 dark:border-violet-800/40', icon: 'text-violet-500', badge: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300', hoverBg: 'hover:border-violet-300 dark:hover:border-violet-700' },
  { bg: 'bg-emerald-50 dark:bg-emerald-950/20', border: 'border-emerald-200/60 dark:border-emerald-800/40', icon: 'text-emerald-500', badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300', hoverBg: 'hover:border-emerald-300 dark:hover:border-emerald-700' },
  { bg: 'bg-rose-50 dark:bg-rose-950/20', border: 'border-rose-200/60 dark:border-rose-800/40', icon: 'text-rose-500', badge: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300', hoverBg: 'hover:border-rose-300 dark:hover:border-rose-700' },
  { bg: 'bg-teal-50 dark:bg-teal-950/20', border: 'border-teal-200/60 dark:border-teal-800/40', icon: 'text-teal-500', badge: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300', hoverBg: 'hover:border-teal-300 dark:hover:border-teal-700' },
];

/**
 * 获取标签对应的配色方案
 * 基于标签名称做哈希映射，保证同一标签始终分配相同颜色
 */
function getTagColor(tagName: string) {
  if (!TAG_COLORS[tagName]) {
    const index = Object.keys(TAG_COLORS).length % COLOR_PALETTE.length;
    TAG_COLORS[tagName] = COLOR_PALETTE[index];
  }
  return TAG_COLORS[tagName];
}

/** 每个文件夹最多展示的文章数 */
const MAX_PREVIEW = 4;

const Archives: React.FC = () => {
  const navigate = useNavigate();
  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  // 展开状态：展开的标签名 → 显示全部文章
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 并行获取标签列表和全部文章
        const [tagsData, articlesData] = await Promise.all([
          getTags(),
          (async () => {
            const allArticles: ArticleListItem[] = [];
            let currentPage = 1;
            let totalPages = 1;
            do {
              const res = await getArticles({ page: currentPage, page_size: 100, status: 'published' });
              allArticles.push(...res.data);
              totalPages = res.total_pages;
              currentPage++;
            } while (currentPage <= totalPages);
            return allArticles;
          })()
        ]);

        // 按发布时间降序
        articlesData.sort((a, b) => new Date(b.published_at!).getTime() - new Date(a.published_at!).getTime());
        setArticles(articlesData);
        setTags(tagsData);
      } catch (error) {
        console.error('获取归档数据失败:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 按标签分组文章（一篇文章可能属于多个标签）
  const groupedByTag = tags.reduce((acc, tag) => {
    acc[tag.name] = articles.filter(a => a.tags.some(t => t.name === tag.name));
    return acc;
  }, {} as Record<string, ArticleListItem[]>);

  const toggleExpand = (tagName: string) => {
    setExpandedTags(prev => {
      const next = new Set(prev);
      if (next.has(tagName)) {
        next.delete(tagName);
      } else {
        next.add(tagName);
      }
      return next;
    });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-20">
      {/* 页面标题 */}
      <header className="mb-16 text-center">
        <div className="inline-flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <Icons.Archive className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white tracking-tight transition-colors">
            技术栈归档
          </h1>
        </div>
        <p className="text-slate-400 dark:text-slate-500 text-sm transition-colors">
          共 {articles.length} 篇文章 · 按技术栈分类整理
        </p>
      </header>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-10 h-10 border-3 border-slate-200 dark:border-slate-700 border-t-slate-500 rounded-full animate-spin"></div>
          <p className="text-slate-400 text-sm">加载中...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {tags.map((tag) => {
            const tagArticles = groupedByTag[tag.name] || [];
            if (tagArticles.length === 0) return null;

            const color = getTagColor(tag.name);
            const isExpanded = expandedTags.has(tag.name);
            const displayArticles = isExpanded ? tagArticles : tagArticles.slice(0, MAX_PREVIEW);
            const hasMore = tagArticles.length > MAX_PREVIEW;

            return (
              <div
                key={tag.id}
                className={`rounded-2xl border ${color.border} ${color.bg} ${color.hoverBg} p-5 transition-all duration-300 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50`}
              >
                {/* 文件夹头部 */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <Icons.Folder className={`w-5 h-5 ${color.icon}`} />
                    <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200">{tag.name}</h2>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color.badge}`}>
                    {tagArticles.length} 篇
                  </span>
                </div>

                {/* 文章列表 */}
                <div className="space-y-1">
                  {displayArticles.map((article) => (
                    <div
                      key={article.id}
                      onClick={() => navigate(`/articles/${article.id}`)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/60 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800 cursor-pointer transition-all duration-200 group/item"
                    >
                      <Icons.FileText className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 flex-shrink-0 group-hover/item:text-slate-500 dark:group-hover/item:text-slate-400 transition-colors" />
                      <span className="flex-1 text-sm text-slate-600 dark:text-slate-300 truncate group-hover/item:text-slate-800 dark:group-hover/item:text-slate-100 transition-colors">
                        {article.title}
                      </span>
                      <div className="flex items-center gap-2.5 text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity">
                        <span className="flex items-center gap-0.5">
                          <Icons.Eye className="w-3 h-3" /> {article.view_count}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Icons.Heart className="w-3 h-3" /> {article.like_count}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 展开/收起按钮 */}
                {hasMore && (
                  <button
                    onClick={() => toggleExpand(tag.name)}
                    className={`mt-3 w-full text-center py-2 rounded-xl text-xs font-medium transition-all ${color.badge} hover:opacity-80`}
                  >
                    {isExpanded
                      ? `收起 ↑`
                      : `查看全部 ${tagArticles.length} 篇 →`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <footer className="mt-20 pt-8 border-t border-slate-100 dark:border-slate-800 text-center">
        <p className="text-slate-400 dark:text-slate-500 text-xs transition-colors">
          坚持写作是一种生活方式 · {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
};

export default Archives;