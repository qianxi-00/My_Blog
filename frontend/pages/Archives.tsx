import React, { useState, useEffect, useMemo } from 'react';
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

  const archiveStats = useMemo(() => {
    const totalViews = articles.reduce((sum, article) => sum + Number(article.view_count || 0), 0);
    const totalLikes = articles.reduce((sum, article) => sum + Number(article.like_count || 0), 0);
    const activeTags = tags.filter(tag => (groupedByTag[tag.name] || []).length > 0);
    const latest = articles.slice(0, 5);
    const monthMap = new Map<string, number>();

    articles.forEach(article => {
      if (!article.published_at) return;
      const date = new Date(article.published_at);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthMap.set(key, (monthMap.get(key) || 0) + 1);
    });

    const months = Array.from(monthMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 12)
      .reverse();
    const maxMonthCount = Math.max(1, ...months.map(([, count]) => count));

    return { totalViews, totalLikes, activeTags, latest, months, maxMonthCount };
  }, [articles, tags, groupedByTag]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-16">
      {/* 页面标题 */}
      <header className="mb-10 overflow-hidden rounded-[2rem] border border-amber-100 dark:border-slate-700 bg-gradient-to-br from-amber-50 via-white to-sky-50 dark:from-slate-900 dark:via-slate-900 dark:to-amber-950/20 p-6 md:p-8 relative shadow-sm">
        <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-amber-200/40 dark:bg-amber-500/10 blur-3xl"></div>
        <div className="absolute -left-16 -bottom-16 w-56 h-56 rounded-full bg-sky-200/40 dark:bg-sky-500/10 blur-3xl"></div>
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1.3fr_0.7fr] gap-8 items-end">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 dark:bg-slate-800/70 border border-white dark:border-slate-700 text-xs font-black tracking-wide text-amber-600 dark:text-amber-300 mb-4">
              <Icons.Archive className="w-3.5 h-3.5" /> KNOWLEDGE ARCHIVE
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight mb-3">
              技术栈归档
            </h1>
            <p className="text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
              按标签把文章收纳成知识文件夹；顶部热力条展示最近 12 个月写作节奏，右侧数据辅助快速判断内容密度。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '文章', value: articles.length, icon: Icons.FileText },
              { label: '标签', value: archiveStats.activeTags.length, icon: Icons.Tags },
              { label: '阅读', value: archiveStats.totalViews, icon: Icons.Eye },
            ].map(item => (
              <div key={item.label} className="rounded-2xl bg-white/80 dark:bg-slate-800/80 border border-white dark:border-slate-700 p-4 shadow-sm text-center">
                <item.icon className="w-4 h-4 mx-auto mb-2 text-amber-500" />
                <div className="text-2xl font-black text-slate-900 dark:text-white">{item.value}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-10 h-10 border-3 border-slate-200 dark:border-slate-700 border-t-slate-500 rounded-full animate-spin"></div>
          <p className="text-slate-400 text-sm">加载中...</p>
        </div>
      ) : (
        <>
          <section className="mb-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            <div className="rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-black text-slate-700 dark:text-slate-200 flex items-center gap-2"><Icons.Calendar className="w-4 h-4 text-amber-500" /> 最近 12 个月写作热力</h2>
                <span className="text-xs text-slate-400">越高越亮</span>
              </div>
              <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
                {archiveStats.months.map(([month, count]) => (
                  <div key={month} className="group">
                    <div className="h-16 rounded-2xl border border-amber-100 dark:border-slate-700 bg-amber-50 dark:bg-slate-900 overflow-hidden flex items-end" title={`${month}: ${count} 篇`}>
                      <div className="w-full bg-gradient-to-t from-amber-400 to-orange-200 dark:from-amber-500 dark:to-orange-400 transition-all" style={{ height: `${Math.max(14, (count / archiveStats.maxMonthCount) * 100)}%` }}></div>
                    </div>
                    <div className="mt-1 text-[10px] text-center text-slate-400 group-hover:text-amber-600 transition-colors">{month.slice(5)}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl bg-slate-900 dark:bg-slate-950 border border-slate-800 p-5 shadow-sm overflow-hidden relative">
              <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-amber-400/20 blur-2xl"></div>
              <h2 className="relative z-10 text-sm font-black text-white flex items-center gap-2 mb-4"><Icons.Clock className="w-4 h-4 text-amber-300" /> 最近更新</h2>
              <div className="relative z-10 space-y-3">
                {archiveStats.latest.map(article => (
                  <button key={article.id} onClick={() => navigate(`/articles/${article.id}`)} className="w-full text-left group">
                    <div className="text-xs font-bold text-slate-200 group-hover:text-amber-200 line-clamp-1 transition-colors">{article.title}</div>
                    <div className="text-[10px] text-slate-500 mt-1">{article.published_at ? new Date(article.published_at).toLocaleDateString('zh-CN') : '暂无日期'}</div>
                  </button>
                ))}
              </div>
            </div>
          </section>

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
        </>
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
