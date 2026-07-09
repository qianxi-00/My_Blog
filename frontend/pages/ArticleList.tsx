import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { getArticles, getTags, ArticleListItem, Tag } from '../api/articles';
import { getFileUrl } from '../api/config';

const ArticleList: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState<'time' | 'views' | 'likes'>('time');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 直接从 URL 参数获取 tag 和 search
  const selectedTag = searchParams.get('tag') || '';
  const searchQuery = searchParams.get('search') || '';

  // 当筛选参数变化时重置页码
  useEffect(() => {
    setPage(1);
  }, [selectedTag, searchQuery, sortBy, sortOrder]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const params: any = {
          page,
          page_size: 10,
          status: 'published',
          sort_by: sortBy,
          sort_order: sortOrder
        };

        if (selectedTag) {
          params.tag = selectedTag;
        }
        if (searchQuery) {
          params.search = searchQuery;
        }

        const [articlesRes, tagsRes] = await Promise.all([
          getArticles(params),
          page === 1 ? getTags() : Promise.resolve(tags),
        ]);

        setArticles(articlesRes.data);
        setTotalPages(articlesRes.total_pages);
        setTotal(articlesRes.total);
        if (page === 1 && Array.isArray(tagsRes)) {
          setTags(tagsRes);
        }
      } catch (error) {
        console.error('获取文章列表失败:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [page, selectedTag, searchQuery, sortBy, sortOrder]);

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return { day: '--', monthYear: '' };
    const date = new Date(dateStr);
    return {
      day: date.getDate().toString().padStart(2, '0'),
      monthYear: `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}`,
    };
  };

  const clearFilter = () => {
    setSearchParams({});
  };

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  // 判断是否有任何筛选条件
  const hasFilter = selectedTag || searchQuery;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col xl:flex-row gap-12">
        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3 transition-colors">
              <span className="w-2 h-8 bg-primary-500 rounded-full"></span>
              {searchQuery ? `搜索: "${searchQuery}"` : selectedTag ? `标签: #${selectedTag}` : '所有文章'}
            </h1>
            <span className="text-slate-500 dark:text-slate-400 font-medium transition-colors">共 {total} 篇</span>
          </div>

          {/* 排序选项 */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400 dark:text-slate-500 font-medium">排序：</span>
              <div className="flex p-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl">
                {[
                  { label: '时间', value: 'time' as const, icon: Icons.Clock },
                  { label: '阅读', value: 'views' as const, icon: Icons.Eye },
                  { label: '点赞', value: 'likes' as const, icon: Icons.Heart },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSortBy(opt.value)}
                    className={`px-4 py-1.5 text-sm rounded-lg font-bold transition-all flex items-center gap-1.5 ${sortBy === opt.value
                      ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                  >
                    <opt.icon className="w-3.5 h-3.5" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={toggleSortOrder}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 transition-all shadow-sm active:scale-95"
            >
              <Icons.ArrowUpDown className={`w-4 h-4 transition-transform ${sortOrder === 'asc' ? 'rotate-180' : ''}`} />
              {sortOrder === 'desc' ? '正在降序' : '正在升序'}
            </button>
          </div>

          {hasFilter && (
            <div className="mb-8">
              <button onClick={clearFilter} className="flex items-center gap-2 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-bold bg-primary-50 dark:bg-primary-900/20 px-4 py-2 rounded-xl transition-all hover:shadow-sm">
                <Icons.X className="w-4 h-4" /> 清除所有筛选
              </button>
            </div>
          )}

          {loading ? (
            <div className="space-y-8 animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i} className="relative pl-8 border-l-2 border-slate-100 dark:border-slate-800">
                  <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 ring-4 ring-white dark:ring-slate-900"></div>
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="h-5 w-20 bg-slate-200 dark:bg-slate-700 rounded"></div>
                        <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded"></div>
                        <div className="h-4 w-12 bg-slate-200 dark:bg-slate-700 rounded"></div>
                      </div>
                      <div className="h-7 w-3/4 bg-slate-200 dark:bg-slate-700 rounded"></div>
                      <div className="space-y-2">
                        <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded"></div>
                        <div className="h-4 w-5/6 bg-slate-100 dark:bg-slate-800 rounded"></div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <div className="h-6 w-14 bg-slate-100 dark:bg-slate-800 rounded-lg"></div>
                        <div className="h-6 w-16 bg-slate-100 dark:bg-slate-800 rounded-lg"></div>
                        <div className="h-6 w-12 bg-slate-100 dark:bg-slate-800 rounded-lg"></div>
                      </div>
                    </div>
                    {i <= 2 && (
                      <div className="w-full md:w-56 lg:w-64 aspect-[16/9] rounded-xl bg-slate-200 dark:bg-slate-700 flex-shrink-0"></div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : articles.length > 0 ? (
            <div className="space-y-8">
              {articles.map((article) => {
                const date = formatDate(article.published_at);
                return (
                  <article key={article.id} className="group relative pl-8 border-l-2 border-slate-100 dark:border-slate-800 hover:border-primary-200 dark:hover:border-primary-800 transition-colors">
                    <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 ring-4 ring-white dark:ring-slate-900 group-hover:bg-primary-500 transition-colors"></div>

                    <div className="flex flex-col md:flex-row gap-6">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400 mb-2 font-medium transition-colors">
                          <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300 transition-colors">{date.monthYear}/{date.day}</span>
                          <span className="w-1 h-1 bg-slate-300 dark:bg-slate-600 rounded-full"></span>
                          <span className="flex items-center gap-1"><Icons.Clock className="w-3.5 h-3.5" /> {article.read_time_minutes} min</span>
                          <span className="w-1 h-1 bg-slate-300 dark:bg-slate-600 rounded-full"></span>
                          <span className="flex items-center gap-1"><Icons.Eye className="w-3.5 h-3.5" /> {article.view_count}</span>
                          <span className="flex items-center gap-1"><Icons.Heart className="w-3.5 h-3.5" /> {article.like_count}</span>
                          <span className="flex items-center gap-1"><Icons.MessageSquare className="w-3.5 h-3.5" /> {article.comment_count || 0}</span>
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors leading-tight">
                          <Link to={`/articles/${article.id}`}>
                            {article.title}
                          </Link>
                          {article.is_pinned && <span className="ml-2 inline-block px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-xs rounded-full align-middle">置顶</span>}
                        </h2>
                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-4 line-clamp-2 transition-colors">
                          {article.summary}
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                          {article.tags.map(tag => (
                            <Link
                              key={tag.id}
                              to={`/articles?tag=${tag.name}`}
                              className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-all ${selectedTag === tag.name
                                ? 'bg-primary-500 text-white border-primary-500 shadow-md'
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-primary-600 dark:hover:text-primary-400 hover:shadow-sm border-slate-100 dark:border-slate-700'
                                }`}
                            >
                              #{tag.name}
                            </Link>
                          ))}
                        </div>
                      </div>
                      {article.cover_image && (
                        <div className="w-full md:w-56 lg:w-64 aspect-[16/9] rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0 transition-colors">
                          <img
                            src={getFileUrl(article.cover_image)}
                            alt={article.title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                          />
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-20 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 transition-colors">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 mb-4 transition-colors">
                <Icons.Search className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 transition-colors">未找到相关文章</h3>
              <p className="text-slate-500 dark:text-slate-400 transition-colors">换个关键词或标签试试吧</p>
              {hasFilter && (
                <button onClick={clearFilter} className="mt-6 text-primary-600 dark:text-primary-400 hover:underline font-bold">
                  查看所有文章
                </button>
              )}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-16">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                <Icons.ArrowLeft className="w-5 h-5" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-11 h-11 rounded-xl font-bold transition-all ${page === p
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xl scale-110'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm'
                    }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                <Icons.ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="w-full xl:w-56 flex-shrink-0 space-y-8 hidden xl:block">
          <div className="sticky top-24 space-y-8">
            {/* Tags (New Categorization) */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm transition-all">
              <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2 transition-colors">
                <Icons.Tag className="w-4 h-4" /> 标签分类
              </h3>
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/articles"
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${!selectedTag
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                >
                  全部
                </Link>
                {tags.map(tag => (
                  <Link
                    key={tag.id}
                    to={`/articles?tag=${tag.name}`}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedTag === tag.name
                      ? 'bg-primary-500 text-white shadow-md'
                      : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-800'
                      }`}
                  >
                    #{tag.name}
                  </Link>
                ))}
              </div>
            </div>

            {/* Archives Shortcut */}
            <div className="bg-gradient-to-br from-slate-50 to-purple-50 dark:from-slate-800 dark:to-purple-950/30 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm relative overflow-hidden group">
              <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-purple-200/30 dark:bg-purple-600/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
              <h3 className="font-bold text-lg mb-2 flex items-center gap-2 relative z-10 text-slate-700 dark:text-slate-200">
                <Icons.Sparkles className="w-5 h-5 text-purple-400" /> 往期内容
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs mb-4 relative z-10">
                按技术栈分类浏览全部文章，寻找曾经的足迹。
              </p>
              <Link to="/archives" className="inline-block px-4 py-2 bg-purple-100 dark:bg-purple-900/40 hover:bg-purple-200 dark:hover:bg-purple-900/60 text-purple-600 dark:text-purple-300 rounded-lg text-xs font-bold transition-all hover:translate-x-1 relative z-10">
                查看文章归档 &rarr;
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default ArticleList;