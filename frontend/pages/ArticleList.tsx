import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { EmptyState, StatusPill } from '../components/Shared';
import { ListSkeleton } from '../components/Skeleton';
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

  const selectedTag = searchParams.get('tag') || '';
  const searchQuery = searchParams.get('search') || '';

  useEffect(() => {
    setPage(1);
  }, [selectedTag, searchQuery, sortBy, sortOrder]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const params: Record<string, any> = {
          page,
          page_size: 10,
          status: 'published',
          sort_by: sortBy,
          sort_order: sortOrder,
        };

        if (selectedTag) params.tag = selectedTag;
        if (searchQuery) params.search = searchQuery;

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

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '未知日期';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '未知日期';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const clearFilter = () => {
    setSearchParams({});
  };

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  const hasFilter = Boolean(selectedTag || searchQuery);

  const pageStats = useMemo(() => {
    const views = articles.reduce((sum, article) => sum + Number(article.view_count || 0), 0);
    const likes = articles.reduce((sum, article) => sum + Number(article.like_count || 0), 0);
    const comments = articles.reduce((sum, article) => sum + Number(article.comment_count || 0), 0);
    return { views, likes, comments };
  }, [articles]);

  const popularArticles = useMemo(
    () =>
      [...articles]
        .sort(
          (a, b) =>
            Number(b.view_count || 0) +
            Number(b.like_count || 0) * 3 -
            (Number(a.view_count || 0) + Number(a.like_count || 0) * 3),
        )
        .slice(0, 5),
    [articles],
  );

  // 分页页码窗口（避免页数多时溢出）
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: Array<number | 'ellipsis'> = [1];
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    if (start > 2) pages.push('ellipsis');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push('ellipsis');
    pages.push(totalPages);
    return pages;
  }, [page, totalPages]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
      {/* 极简编辑部 页头 */}
      <header className="pb-8 mb-8 border-b border-slate-200/80 dark:border-slate-800 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-medium tracking-wider uppercase text-primary-600 dark:text-primary-400 mb-3">
            <Icons.BookOpen className="w-3.5 h-3.5" />
            <span>Articles / 技术沉淀</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight mb-2">
            {searchQuery ? `搜索: "${searchQuery}"` : selectedTag ? `#${selectedTag}` : '全部文章'}
          </h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
            收录 {total} 篇 AI 与全栈工程实战记录，可按标签、关键词与多维排序快速检索。
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
          {[
            { label: '命中文章', value: total, icon: Icons.FileText },
            { label: '本页阅读', value: pageStats.views, icon: Icons.Eye },
            { label: '本页点赞', value: pageStats.likes, icon: Icons.Heart },
            { label: '本页评论', value: pageStats.comments, icon: Icons.MessageSquare },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-3 min-w-[104px]"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <item.icon className="w-3.5 h-3.5 text-primary-500" />
                {item.label}
              </div>
              <div className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </header>

      <div className="flex flex-col xl:flex-row gap-10">
        {/* 主列表 */}
        <div className="flex-1 min-w-0">
          {/* 排序与筛选栏 */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex p-1 bg-slate-100/90 dark:bg-slate-800/80 rounded-lg border border-slate-200/70 dark:border-slate-700/70">
                {[
                  { label: '最新', value: 'time' as const, icon: Icons.Clock },
                  { label: '阅读', value: 'views' as const, icon: Icons.Eye },
                  { label: '点赞', value: 'likes' as const, icon: Icons.Heart },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSortBy(opt.value)}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                      sortBy === opt.value
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <opt.icon className="w-3.5 h-3.5" />
                    {opt.label}
                  </button>
                ))}
              </div>

              {hasFilter && (
                <button
                  type="button"
                  onClick={clearFilter}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-950/60 border border-primary-200/70 dark:border-primary-800/60 px-3 py-1.5 rounded-lg hover:bg-primary-100/70 dark:hover:bg-primary-900/50 transition-colors cursor-pointer"
                >
                  <Icons.X className="w-3.5 h-3.5" /> 清除筛选
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={toggleSortOrder}
              className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Icons.ArrowUpDown className={`w-3.5 h-3.5 transition-transform ${sortOrder === 'asc' ? 'rotate-180' : ''}`} />
              {sortOrder === 'desc' ? '降序' : '升序'}
            </button>
          </div>

          {loading ? (
            <ListSkeleton rows={4} />
          ) : articles.length > 0 ? (
            <div className="space-y-4">
              {articles.map((article) => (
                <article
                  key={article.id}
                  className="group rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5 sm:p-6 hover:border-slate-300 dark:hover:border-slate-700 transition-colors card-lift"
                >
                  <div className="flex flex-col md:flex-row gap-5">
                    <div className="flex-1 min-w-0 flex flex-col">
                      {/* 元信息 */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 dark:text-slate-500 mb-2 tabular-nums">
                        <span className="font-medium text-slate-600 dark:text-slate-300">{formatDate(article.published_at)}</span>
                        {article.category && (
                          <>
                            <span>&middot;</span>
                            <span className="text-primary-600 dark:text-primary-400 font-medium">{article.category}</span>
                          </>
                        )}
                        <span>&middot;</span>
                        <span className="inline-flex items-center gap-1">
                          <Icons.Clock className="w-3 h-3" /> {article.read_time_minutes || 5} min
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Icons.Eye className="w-3 h-3" /> {article.view_count}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Icons.Heart className="w-3 h-3" /> {article.like_count}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Icons.MessageSquare className="w-3 h-3" /> {article.comment_count || 0}
                        </span>
                      </div>

                      {/* 标题 */}
                      <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 mb-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors leading-snug">
                        <Link to={`/articles/${article.id}`} className="inline">
                          {article.title}
                        </Link>
                        {article.is_pinned && (
                          <StatusPill tone="amber" dot className="ml-2 align-middle">
                            置顶
                          </StatusPill>
                        )}
                      </h2>

                      {/* 摘要 */}
                      {article.summary && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-4 line-clamp-2">
                          {article.summary}
                        </p>
                      )}

                      {/* 标签与作者 */}
                      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {article.tags.map((tag) => (
                            <Link
                              key={tag.id}
                              to={`/articles?tag=${encodeURIComponent(tag.name)}`}
                              className={`text-xs font-medium px-2 py-0.5 rounded-md border transition-colors ${
                                selectedTag === tag.name
                                  ? 'bg-primary-600 text-white border-primary-600'
                                  : 'bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-700 hover:text-primary-600 dark:hover:text-primary-400'
                              }`}
                            >
                              #{tag.name}
                            </Link>
                          ))}
                        </div>

                        {article.author?.username && (
                          <Link
                            to={`/user/${encodeURIComponent(article.author.username)}`}
                            className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                          >
                            @{article.author.display_name || article.author.username}
                          </Link>
                        )}
                      </div>
                    </div>

                    {article.cover_image && (
                      <Link
                        to={`/articles/${article.id}`}
                        className="w-full md:w-52 lg:w-56 aspect-[16/10] rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-800 flex-shrink-0"
                      >
                        <img
                          src={getFileUrl(article.cover_image)}
                          alt={article.title}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Icons.Search className="w-5 h-5" />}
              title="未找到相关文章"
              description="试试更换关键词、切换排序或清空标签筛选。"
              action={
                hasFilter ? (
                  <button
                    type="button"
                    onClick={clearFilter}
                    className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline cursor-pointer"
                  >
                    查看所有文章 &rarr;
                  </button>
                ) : undefined
              }
            />
          )}

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-1.5 mt-10">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="上一页"
                className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
              >
                <Icons.ChevronLeft className="w-4 h-4" />
              </button>
              {pageNumbers.map((item, idx) =>
                item === 'ellipsis' ? (
                  <span key={`e-${idx}`} className="px-2 text-slate-400 text-xs select-none">
                    ...
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPage(item)}
                    className={`min-w-9 h-9 px-2.5 rounded-lg text-xs font-medium transition-colors tabular-nums cursor-pointer ${
                      page === item
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border border-transparent'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {item}
                  </button>
                ),
              )}
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                aria-label="下一页"
                className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
              >
                <Icons.ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* 右侧边栏 */}
        <aside className="w-full xl:w-64 flex-shrink-0 hidden xl:block">
          <div className="sticky top-20 space-y-5">
            {/* 标签分类 */}
            <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                <Icons.Tag className="w-3.5 h-3.5 text-primary-500" />
                标签分类
              </h3>
              <div className="flex flex-wrap gap-1.5">
                <Link
                  to="/articles"
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                    !selectedTag
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-transparent'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  全部
                </Link>
                {tags.map((tag) => (
                  <Link
                    key={tag.id}
                    to={`/articles?tag=${encodeURIComponent(tag.name)}`}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                      selectedTag === tag.name
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-700 hover:text-primary-600 dark:hover:text-primary-400'
                    }`}
                  >
                    #{tag.name}
                  </Link>
                ))}
              </div>
            </div>

            {/* 本页热读 */}
            {popularArticles.length > 0 && (
              <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                  <Icons.TrendingUp className="w-3.5 h-3.5 text-primary-500" />
                  本页热读
                </h3>
                <div className="space-y-2">
                  {popularArticles.map((article, index) => (
                    <Link
                      key={article.id}
                      to={`/articles/${article.id}`}
                      className="group flex items-start gap-2.5 rounded-lg p-1.5 -mx-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <span className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-semibold flex items-center justify-center flex-shrink-0 tabular-nums mt-0.5">
                        {index + 1}
                      </span>
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300 group-hover:text-primary-600 dark:group-hover:text-primary-400 line-clamp-2 leading-snug">
                        {article.title}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* 归档与投稿快捷入口 */}
            <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 p-5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <Icons.Archive className="w-3.5 h-3.5 text-primary-500" />
                全站归档与时间线
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                按主题文件夹或月度写作曲线回顾全部文章、热点研究与 AI 日报。
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link
                  to="/archives"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-primary-300 dark:hover:border-primary-700 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                >
                  查看归档 &rarr;
                </Link>
                <Link
                  to="/write"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium transition-colors"
                >
                  写文章
                </Link>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default ArticleList;
