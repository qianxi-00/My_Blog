import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Input, StatusPill } from '../components/Shared';
import { ListSkeleton } from '../components/Skeleton';
import { Icons } from '../components/Icons';
import Avatar from '../components/Avatar';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { errorText } from '../utils/errors';
import {
  ForumCategory,
  ForumSolvedFilter,
  ForumSortMode,
  ForumThreadListItem,
  getForumCategories,
  getForumThreads,
  toggleThreadLike,
} from '../api/forum';

const PAGE_SIZE = 12;

const SORT_OPTIONS: Array<{ value: ForumSortMode; label: string }> = [
  { value: 'latest_activity', label: '最新活跃' },
  { value: 'latest', label: '最新发布' },
  { value: 'hottest', label: '最多点赞' },
  { value: 'most_replies', label: '最多回复' },
];

const SOLVED_OPTIONS: Array<{ value: ForumSolvedFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'unsolved', label: '待解决' },
  { value: 'solved', label: '已解决' },
];

const formatRelativeTime = (v?: string | null) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 14) return `${diffDay} 天前`;
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const cleanAvatar = (url?: string | null) => {
  if (!url || url.includes('dicebear.com')) return undefined;
  return url;
};

const ForumHome: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();

  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [threads, setThreads] = useState<ForumThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const categoryIdParam = searchParams.get('category_id');
  const selectedCategoryId = categoryIdParam && Number.isFinite(Number(categoryIdParam))
    ? Number(categoryIdParam)
    : undefined;
  const qParam = searchParams.get('q') || '';
  const sortParam = (searchParams.get('sort') as ForumSortMode) || 'latest_activity';
  const validSort: ForumSortMode = SORT_OPTIONS.some((o) => o.value === sortParam)
    ? sortParam
    : 'latest_activity';
  const solvedParam = (searchParams.get('solved') as ForumSolvedFilter) || 'all';
  const validSolved: ForumSolvedFilter = SOLVED_OPTIONS.some((o) => o.value === solvedParam)
    ? solvedParam
    : 'all';
  const featuredOnly = searchParams.get('featured') === '1';
  const pageParam = Math.max(1, Number(searchParams.get('page') || '1') || 1);

  const [qInput, setQInput] = useState(qParam);
  const [poppedThreadId, setPoppedThreadId] = useState<number | null>(null);

  useEffect(() => {
    setQInput(qParam);
  }, [qParam]);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [cats, threadRes] = await Promise.all([
          getForumCategories(),
          getForumThreads({
            page: pageParam,
            page_size: PAGE_SIZE,
            category_id: selectedCategoryId,
            q: qParam || undefined,
            sort: validSort,
            solved: validSolved,
            featured: featuredOnly ? true : undefined,
          }),
        ]);
        if (!active) return;
        setCategories(cats);
        setThreads(threadRes.data);
        setTotal(threadRes.total);
        setTotalPages(Math.max(1, threadRes.total_pages || 1));
      } catch (e: any) {
        if (!active) return;
        showToast(errorText(e, '获取社区讨论失败'), 'error');
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchData();
    return () => {
      active = false;
    };
  }, [pageParam, selectedCategoryId, qParam, validSort, validSolved, featuredOnly, showToast]);

  const selectedCategory = useMemo(
    () => (selectedCategoryId ? categories.find((c) => c.id === selectedCategoryId) || null : null),
    [categories, selectedCategoryId]
  );

  const totalCategoryThreads = useMemo(
    () => categories.reduce((sum, cat) => sum + (cat.thread_count || 0), 0),
    [categories]
  );

  const updateParams = (patch: Record<string, string | undefined>, resetPage = true) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([k, v]) => {
      if (!v) next.delete(k);
      else next.set(k, v);
    });
    if (resetPage) next.delete('page');
    setSearchParams(next);
  };

  const onSubmitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams({ q: qInput.trim() || undefined }, true);
  };

  const handleResetFilters = () => {
    setQInput('');
    setSearchParams(new URLSearchParams());
  };

  const handleQuickLike = async (thread: ForumThreadListItem) => {
    if (!isAuthenticated) {
      showToast('登录后可为讨论点赞', 'info');
      navigate(`/login?redirect=${encodeURIComponent('/forum')}`);
      return;
    }
    const prevLiked = Boolean(thread.viewer_liked);
    const prevCount = thread.like_count ?? 0;
    setThreads((curr) =>
      curr.map((item) =>
        item.id === thread.id
          ? {
              ...item,
              viewer_liked: !prevLiked,
              like_count: Math.max(0, prevCount + (prevLiked ? -1 : 1)),
            }
          : item
      )
    );
    if (!prevLiked) {
      setPoppedThreadId(thread.id);
      window.setTimeout(() => setPoppedThreadId((id) => (id === thread.id ? null : id)), 280);
    }
    try {
      const res = await toggleThreadLike(thread.id);
      setThreads((curr) =>
        curr.map((item) =>
          item.id === thread.id
            ? { ...item, viewer_liked: res.liked, like_count: res.like_count }
            : item
        )
      );
    } catch (e: any) {
      setThreads((curr) =>
        curr.map((item) =>
          item.id === thread.id
            ? { ...item, viewer_liked: prevLiked, like_count: prevCount }
            : item
        )
      );
      showToast(errorText(e, '点赞失败'), 'error');
    }
  };

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const set = new Set<number>([1, totalPages, pageParam - 1, pageParam, pageParam + 1]);
    const sorted = Array.from(set).filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
    const out: Array<number | 'ellipsis'> = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('ellipsis');
      out.push(sorted[i]);
    }
    return out;
  }, [totalPages, pageParam]);

  const hasActiveFilters = Boolean(selectedCategoryId || qParam || validSolved !== 'all' || featuredOnly);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header Band */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 mb-8 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-600 dark:text-primary-400 mb-2">
            <Icons.MessagesSquare className="w-3.5 h-3.5" />
            <span>COMMUNITY DISCUSSIONS</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5 flex-wrap">
            <span>社区讨论</span>
            {selectedCategory && (
              <span className="text-base sm:text-lg font-medium text-slate-400 dark:text-slate-500">
                / {selectedCategory.name}
              </span>
            )}
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
            {selectedCategory?.description || '工程实践交流、文章疑问与「问千禧」直达提问区。登录即可发起讨论、点赞或采纳最佳回答。'}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
            共 {total} 篇讨论
          </span>
          <Link to="/forum/new">
            <Button size="md" className="gap-1.5">
              <Icons.Plus className="w-4 h-4" />
              发起讨论
            </Button>
          </Link>
        </div>
      </div>

      {/* Main 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-8 items-start">
        {/* Left Sidebar */}
        <aside className="space-y-5 lg:sticky lg:top-24">
          <Card className="p-3">
            <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              版块导航
            </div>
            <nav className="mt-1 space-y-0.5" aria-label="社区版块">
              <button
                type="button"
                onClick={() => updateParams({ category_id: undefined })}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                  !selectedCategoryId
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/70'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <Icons.Compass className="w-4 h-4 shrink-0 opacity-80" />
                  <span className="truncate">全部讨论</span>
                </span>
                <span
                  className={`text-xs tabular-nums px-1.5 py-0.5 rounded-md ${
                    !selectedCategoryId
                      ? 'bg-white/15 dark:bg-slate-900/15 text-current'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {totalCategoryThreads || total}
                </span>
              </button>

              {categories.map((cat) => {
                const active = selectedCategoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => updateParams({ category_id: String(cat.id) })}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                      active
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Icons.Hash className="w-3.5 h-3.5 shrink-0 opacity-70" />
                      <span className="truncate">{cat.name}</span>
                    </span>
                    <span
                      className={`text-xs tabular-nums px-1.5 py-0.5 rounded-md ${
                        active
                          ? 'bg-white/15 dark:bg-slate-900/15 text-current'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {cat.thread_count ?? 0}
                    </span>
                  </button>
                );
              })}
            </nav>
          </Card>

          <Card className="p-4 bg-slate-50/70 dark:bg-slate-900/60">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
              <Icons.Sparkles className="w-3.5 h-3.5 text-primary-500" />
              <span>社区公约与指南</span>
            </div>
            <ul className="mt-2.5 space-y-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              <li>• 公开可读，登录后可发起主题、回复、点赞与举报</li>
              <li>• 支持标准 Markdown 与图片上传（默认禁用原始 HTML）</li>
              <li>• 提问帖解决后可由楼主或管理员标记「最佳回答」</li>
            </ul>
            <div className="mt-3 pt-3 border-t border-slate-200/70 dark:border-slate-800">
              <Link
                to="/forum/new"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline"
              >
                新建一篇讨论 <Icons.ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </Card>
        </aside>

        {/* Right Main Column */}
        <div className="min-w-0 space-y-4">
          {/* Toolbar */}
          <Card className="p-3 sm:p-4 space-y-3">
            <form onSubmit={onSubmitSearch} className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Icons.Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="搜索讨论标题关键词..."
                  className="pl-9 pr-8"
                />
                {qInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setQInput('');
                      if (qParam) updateParams({ q: undefined });
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    aria-label="清空搜索"
                  >
                    <Icons.X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <Button type="submit" variant="outline" size="md" className="shrink-0">
                搜索
              </Button>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
              {/* Sort tabs */}
              <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="排序方式">
                {SORT_OPTIONS.map((opt) => {
                  const active = validSort === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => updateParams({ sort: opt.value === 'latest_activity' ? undefined : opt.value })}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                        active
                          ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* Solved + Featured filters */}
              <div className="flex flex-wrap items-center gap-1.5">
                {SOLVED_OPTIONS.map((opt) => {
                  const active = validSolved === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateParams({ solved: opt.value === 'all' ? undefined : opt.value })}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                        active
                          ? 'border-primary-500/40 bg-primary-50 dark:bg-primary-950/50 text-primary-700 dark:text-primary-300'
                          : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => updateParams({ featured: featuredOnly ? undefined : '1' })}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                    featuredOnly
                      ? 'border-amber-500/40 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <Icons.Star className="w-3 h-3" />
                  精选
                </button>
              </div>
            </div>
          </Card>

          {/* Threads List */}
          {loading ? (
            <ListSkeleton rows={5} />
          ) : threads.length > 0 ? (
            <Card className="overflow-hidden divide-y divide-slate-200/70 dark:divide-slate-800 stagger-in">
              {threads.map((t) => {
                const displayName = t.author_display_name || t.author_nickname || '用户';
                const isAuthorAdmin = t.author_role === 'admin' || t.author_role === 'super_admin';
                const avatar = cleanAvatar(t.author_avatar);
                const timeLabel = formatRelativeTime(t.last_post_at || t.created_at);

                return (
                  <article
                    key={t.id}
                    className="p-4 sm:px-5 sm:py-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/35 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      {/* Badges line */}
                      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                        {t.is_pinned && (
                          <StatusPill tone="amber">
                            <Icons.Pin className="w-3 h-3" />
                            置顶
                          </StatusPill>
                        )}
                        {t.is_featured && (
                          <StatusPill tone="primary">
                            <Icons.Star className="w-3 h-3" />
                            精选
                          </StatusPill>
                        )}
                        {t.is_solved && (
                          <StatusPill tone="emerald">
                            <Icons.CheckCircle2 className="w-3 h-3" />
                            已解决
                          </StatusPill>
                        )}
                        {t.is_locked && (
                          <StatusPill tone="slate">
                            <Icons.Lock className="w-3 h-3" />
                            已锁定
                          </StatusPill>
                        )}
                        <Badge color="slate">{t.category_name || '未分类'}</Badge>
                      </div>

                      {/* Title */}
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                        <Link
                          to={`/forum/threads/${t.id}`}
                          className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors line-clamp-2"
                        >
                          {t.title}
                        </Link>
                      </h2>

                      {/* Author & Meta */}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <div className="inline-flex items-center gap-1.5">
                          <Avatar name={displayName} avatarUrl={avatar} className="w-5 h-5 text-[10px]" />
                          {t.username ? (
                            <Link
                              to={`/user/${encodeURIComponent(t.username)}`}
                              className="font-medium text-slate-700 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                            >
                              {displayName}
                            </Link>
                          ) : (
                            <span className="font-medium text-slate-700 dark:text-slate-300">{displayName}</span>
                          )}
                          {isAuthorAdmin && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 text-[10px] font-semibold">
                              <Icons.Shield className="w-2.5 h-2.5" />
                              站长
                            </span>
                          )}
                        </div>
                        {timeLabel && <span>活跃于 {timeLabel}</span>}
                        {t.edited_at && <span className="text-slate-400 dark:text-slate-500">(已编辑)</span>}
                      </div>
                    </div>

                    {/* Right Stats */}
                    <div className="flex items-center gap-2 shrink-0 sm:pl-3">
                      <button
                        type="button"
                        onClick={() => handleQuickLike(t)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium tabular-nums transition-colors cursor-pointer ${
                          t.viewer_liked
                            ? 'border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-950/50 text-primary-700 dark:text-primary-300'
                            : 'border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                        title={t.viewer_liked ? '取消点赞' : '点赞讨论'}
                      >
                        <Icons.ThumbsUp
                          className={`w-3.5 h-3.5 ${poppedThreadId === t.id ? 'like-pop' : ''}`}
                        />
                        <span>{t.like_count ?? 0}</span>
                      </button>

                      <Link
                        to={`/forum/threads/${t.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200/80 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-700 dark:hover:text-slate-200 tabular-nums transition-colors"
                        title="回复数"
                      >
                        <Icons.MessageCircle className="w-3.5 h-3.5" />
                        <span>{t.reply_count}</span>
                      </Link>

                      <span
                        className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-400 dark:text-slate-500 tabular-nums"
                        title="浏览数"
                      >
                        <Icons.Eye className="w-3.5 h-3.5" />
                        <span>{t.view_count}</span>
                      </span>
                    </div>
                  </article>
                );
              })}
            </Card>
          ) : (
            <EmptyState
              icon={<Icons.MessagesSquare className="w-5 h-5" />}
              title={hasActiveFilters ? '没有匹配的讨论' : '还没有任何讨论'}
              description={
                hasActiveFilters
                  ? '试试调整筛选条件或清空关键词，或者直接发起一个新的讨论。'
                  : '社区刚开张，欢迎提出你的第一个问题或技术想法。'
              }
              action={
                <div className="flex items-center gap-2">
                  {hasActiveFilters && (
                    <Button variant="outline" size="sm" onClick={handleResetFilters}>
                      清空筛选
                    </Button>
                  )}
                  <Link to="/forum/new">
                    <Button size="sm">发起讨论</Button>
                  </Link>
                </div>
              }
            />
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-4">
              <button
                type="button"
                onClick={() => updateParams({ page: pageParam - 1 <= 1 ? undefined : String(pageParam - 1) }, false)}
                disabled={pageParam <= 1}
                className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                aria-label="上一页"
              >
                <Icons.ChevronLeft className="w-4 h-4" />
              </button>

              {pageNumbers.map((item, idx) =>
                item === 'ellipsis' ? (
                  <span key={`e-${idx}`} className="px-2 text-xs text-slate-400">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => updateParams({ page: item <= 1 ? undefined : String(item) }, false)}
                    className={`h-9 min-w-[36px] px-2.5 rounded-lg text-xs font-medium tabular-nums transition-colors cursor-pointer ${
                      pageParam === item
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                        : 'border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {item}
                  </button>
                )
              )}

              <button
                type="button"
                onClick={() => updateParams({ page: String(Math.min(totalPages, pageParam + 1)) }, false)}
                disabled={pageParam >= totalPages}
                className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                aria-label="下一页"
              >
                <Icons.ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForumHome;
