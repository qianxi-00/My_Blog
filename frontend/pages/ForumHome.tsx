import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, Input } from '../components/Shared';
import { Icons } from '../components/Icons';
import { getForumCategories, getForumThreads, ForumCategory, ForumThreadListItem } from '../api/forum';

const formatDateTime = (v?: string | null) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const ForumHome: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [threads, setThreads] = useState<ForumThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const categoryIdParam = searchParams.get('category_id');
  const selectedCategoryId = categoryIdParam ? Number(categoryIdParam) : undefined;

  const qParam = searchParams.get('q') || '';
  const [qInput, setQInput] = useState(qParam);

  useEffect(() => {
    setQInput(qParam);
  }, [qParam]);

  useEffect(() => {
    setPage(1);
  }, [categoryIdParam, qParam]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [cats, threadRes] = await Promise.all([
          getForumCategories(),
          getForumThreads({
            page,
            page_size: 10,
            category_id: selectedCategoryId,
            q: qParam || undefined,
          }),
        ]);

        setCategories(cats);
        setThreads(threadRes.data);
        setTotal(threadRes.total);
        setTotalPages(threadRes.total_pages || 1);
      } catch (e) {
        console.error('获取论坛数据失败:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [page, selectedCategoryId, qParam]);

  const selectedCategoryName = useMemo(() => {
    if (!selectedCategoryId) return '全部';
    return categories.find(c => c.id === selectedCategoryId)?.name || '全部';
  }, [categories, selectedCategoryId]);

  const setCategory = (id?: number) => {
    const next = new URLSearchParams(searchParams);
    if (!id) next.delete('category_id');
    else next.set('category_id', String(id));
    // 分类变化时回到第一页
    next.delete('page');
    setSearchParams(next);
  };

  const onSubmitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    const v = qInput.trim();
    if (!v) next.delete('q');
    else next.set('q', v);
    next.delete('page');
    setSearchParams(next);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col xl:flex-row gap-12">
        {/* Main */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3 transition-colors">
              <span className="w-2 h-8 bg-primary-500 rounded-full"></span>
              论坛
              <span className="text-sm font-medium text-slate-400 dark:text-slate-500">/ {selectedCategoryName}</span>
            </h1>
            <div className="flex items-center gap-3">
              <span className="text-slate-500 dark:text-slate-400 font-medium transition-colors">共 {total} 条主题</span>
              <Link to="/forum/new">
                <Button size="sm" className="gap-1.5">
                  <Icons.MessageSquare className="w-4 h-4" /> 发主题
                </Button>
              </Link>
            </div>
          </div>

          {loading ? (
            <div className="space-y-4 animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 rounded-2xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50"></div>
              ))}
            </div>
          ) : threads.length > 0 ? (
            <div className="space-y-4">
              {threads.map(t => (
                <Link key={t.id} to={`/forum/threads/${t.id}`} className="block group">
                  <Card className="p-5 hover:shadow-md transition-all">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Badge>{t.category_name || '未分类'}</Badge>
                          <span className="text-xs text-slate-400 dark:text-slate-500">{formatDateTime(t.last_post_at) || formatDateTime(t.created_at)}</span>
                        </div>
                        <div className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-2">
                          {t.title}
                        </div>
                        <div className="mt-2 text-sm text-slate-500 dark:text-slate-400 flex items-center gap-4">
                          <span className="flex items-center gap-1"><Icons.User className="w-4 h-4" /> {t.author_nickname}</span>
                          <span className="flex items-center gap-1"><Icons.MessageCircle className="w-4 h-4" /> {t.reply_count}</span>
                          <span className="flex items-center gap-1"><Icons.Eye className="w-4 h-4" /> {t.view_count}</span>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-slate-300 dark:text-slate-600 group-hover:text-primary-400 transition-colors">
                        <Icons.ChevronRight className="w-6 h-6" />
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card className="p-10">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 mb-4">
                  <Icons.MessageSquare className="w-8 h-8" />
                </div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">还没有主题</div>
                <div className="text-sm text-slate-500 dark:text-slate-400 mt-2">来发布第一个主题吧</div>
                <div className="mt-6">
                  <Link to="/forum/new"><Button>去发主题</Button></Link>
                </div>
              </div>
            </Card>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-12">
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
        <aside className="w-full xl:w-72 flex-shrink-0 space-y-6">
          <div className="sticky top-24 space-y-6">
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Icons.Tag className="w-4 h-4" /> 分类
                </div>
                <button
                  onClick={() => setCategory(undefined)}
                  className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                >
                  全部
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setCategory(undefined)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${!selectedCategoryId
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-800'
                    }`}
                >
                  全部
                </button>
                {categories.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setCategory(c.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedCategoryId === c.id
                      ? 'bg-primary-500 text-white shadow-md'
                      : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-800'
                      }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <div className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Icons.Search className="w-4 h-4" /> 搜索
              </div>
              <form onSubmit={onSubmitSearch} className="space-y-3">
                <Input
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="搜标题关键词..."
                />
                <div className="flex items-center gap-2">
                  <Button type="submit" size="sm" className="flex-1">搜索</Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="px-3"
                    onClick={() => {
                      setQInput('');
                      const next = new URLSearchParams(searchParams);
                      next.delete('q');
                      setSearchParams(next);
                    }}
                    title="清空"
                  >
                    <Icons.X className="w-4 h-4" />
                  </Button>
                </div>
              </form>
            </Card>

            <Card className="p-5 bg-gradient-to-br from-slate-50 to-primary-50 dark:from-slate-800 dark:to-primary-950/30">
              <div className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <Icons.Sparkles className="w-4 h-4 text-primary-500" /> 论坛小提示
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-3 leading-relaxed">
                这里是匿名讨论区：昵称可不填，系统会自动生成「游客xxxx」。
                内容支持 Markdown（默认禁用 HTML）。
              </div>
              <div className="mt-4">
                <Link to="/forum/new" className="inline-flex items-center gap-2 text-xs font-bold text-primary-700 dark:text-primary-300 hover:underline">
                  去发布主题 <Icons.ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </Card>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default ForumHome;
