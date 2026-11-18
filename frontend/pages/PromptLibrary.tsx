import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { Badge, Button, Card, EmptyState, Input, Select, StatusPill, Textarea } from '../components/Shared';
import { ListSkeleton } from '../components/Skeleton';
import {
  getPrompts,
  likePrompt,
  Prompt,
  PromptCategory,
  recordPromptUsage,
  submitPrompt,
  unlikePrompt,
} from '../api/prompts';
import { getMyBookmarks, toggleBookmark } from '../api/users';
import { PromptLabResponse, runPromptLab } from '../api/chat';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { copyToClipboard } from '../utils/helpers';
import { errorText } from '../utils/errors';

const CATEGORIES: (PromptCategory | 'All')[] = ['All', 'Dev', 'Writing', 'Business', 'Academic', 'Thinking', 'Growth', 'Other'];

const CATEGORY_LABELS: Record<PromptCategory | 'All', string> = {
  All: '全部',
  Dev: '开发',
  Writing: '写作',
  Business: '商业',
  Academic: '学术',
  Thinking: '思维',
  Growth: '成长',
  Other: '其他',
};

const PromptLibrary: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PromptCategory | 'All'>('All');
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortMode, setSortMode] = useState<'latest' | 'popular' | 'liked'>('latest');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [likedIds, setLikedIds] = useState<Record<number, boolean>>({});
  const [totalPages, setTotalPages] = useState(1);

  // Prompt Lab state
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
  const [labInput, setLabInput] = useState('');
  const [labResult, setLabResult] = useState<PromptLabResponse | null>(null);
  const [labLoading, setLabLoading] = useState(false);

  // Submit modal state
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitForm, setSubmitForm] = useState({
    title: '',
    description: '',
    content: '',
    category: 'Dev' as PromptCategory,
  });
  const [submitting, setSubmitting] = useState(false);

  // Copy success state
  const [copySuccess, setCopySuccess] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    if (!isAuthenticated) {
      setFavoriteIds([]);
      return;
    }
    getMyBookmarks({ target_type: 'prompt', page: 1, page_size: 100 })
      .then((res) => {
        if (!alive) return;
        setFavoriteIds((res.data || []).map((item) => item.target_id));
      })
      .catch(() => {
        // ignore bookmark load errors
      });
    return () => {
      alive = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const fetchPrompts = async () => {
      setLoading(true);
      try {
        const params: Record<string, any> = { page, page_size: 20 };
        if (filter !== 'All') params.category = filter;
        if (searchTerm) params.search = searchTerm;
        const response = await getPrompts(params);
        const list = response.data || [];
        setPrompts(list);
        setTotalPages(response.total_pages || 1);

        const nextLiked: Record<number, boolean> = {};
        list.forEach((p) => {
          if (localStorage.getItem(`liked_prompt_${p.id}`) === 'true') {
            nextLiked[p.id] = true;
          }
        });
        setLikedIds((prev) => ({ ...prev, ...nextLiked }));
      } catch (error) {
        console.error('获取 Prompt 列表失败:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPrompts();
  }, [page, filter, searchTerm]);

  const visiblePrompts = useMemo(() => {
    const list = favoritesOnly ? prompts.filter((item) => favoriteIds.includes(item.id)) : [...prompts];
    if (sortMode === 'popular') return list.sort((a, b) => (b.use_count || 0) - (a.use_count || 0));
    if (sortMode === 'liked') return list.sort((a, b) => (b.like_count || 0) - (a.like_count || 0));
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [prompts, sortMode, favoritesOnly, favoriteIds]);

  const promptStats = useMemo(
    () => ({
      total: prompts.length,
      uses: prompts.reduce((sum, item) => sum + (item.use_count || 0), 0),
      likes: prompts.reduce((sum, item) => sum + (item.like_count || 0), 0),
    }),
    [prompts],
  );

  const topPrompts = useMemo(
    () =>
      [...prompts]
        .sort((a, b) => (b.use_count || 0) * 2 + (b.like_count || 0) - ((a.use_count || 0) * 2 + (a.like_count || 0)))
        .slice(0, 5),
    [prompts],
  );

  const activeCategoryLabel = CATEGORY_LABELS[filter];

  const applySearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchTerm(searchInput.trim());
    setPage(1);
  };

  const handleToggleFavorite = async (id: number) => {
    if (!isAuthenticated) {
      showToast('收藏需要先登录', 'info');
      navigate('/login?redirect=%2Fprompts');
      return;
    }
    try {
      const res = await toggleBookmark('prompt', id);
      setFavoriteIds((prev) => (res.bookmarked ? Array.from(new Set([...prev, id])) : prev.filter((item) => item !== id)));
      showToast(res.bookmarked ? '已加入收藏' : '已取消收藏', 'success');
    } catch (error: any) {
      showToast(errorText(error, '收藏操作失败'), 'error');
    }
  };

  const handleToggleFavoritesOnly = () => {
    if (!favoritesOnly && !isAuthenticated) {
      showToast('查看云端收藏请先登录', 'info');
      navigate('/login?redirect=%2Fprompts');
      return;
    }
    setFavoritesOnly((v) => !v);
    setPage(1);
  };

  const handleCopyPrompt = async (prompt: Prompt) => {
    const ok = await copyToClipboard(prompt.content);
    if (!ok) {
      showToast('复制失败，请手动复制', 'error');
      return;
    }
    try {
      await recordPromptUsage(prompt.id);
      setPrompts((prev) => prev.map((p) => (p.id === prompt.id ? { ...p, use_count: p.use_count + 1 } : p)));
    } catch {
      // ignore usage record error
    }
    setCopySuccess(prompt.id);
    showToast('指令已复制', 'success');
    window.setTimeout(() => setCopySuccess(null), 1800);
  };

  const handleToggleLike = async (prompt: Prompt) => {
    const isLiked = Boolean(likedIds[prompt.id]);
    try {
      if (isLiked) {
        const res = await unlikePrompt(prompt.id);
        localStorage.removeItem(`liked_prompt_${prompt.id}`);
        setLikedIds((prev) => ({ ...prev, [prompt.id]: false }));
        setPrompts((prev) =>
          prev.map((p) => (p.id === prompt.id ? { ...p, like_count: res.like_count ?? Math.max(0, p.like_count - 1) } : p)),
        );
      } else {
        const res = await likePrompt(prompt.id);
        localStorage.setItem(`liked_prompt_${prompt.id}`, 'true');
        setLikedIds((prev) => ({ ...prev, [prompt.id]: true }));
        setPrompts((prev) =>
          prev.map((p) => (p.id === prompt.id ? { ...p, like_count: res.like_count ?? p.like_count + 1 } : p)),
        );
      }
    } catch (error: any) {
      showToast(errorText(error, '操作失败'), 'error');
    }
  };

  const handleRunLab = async () => {
    if (!selectedPrompt) {
      showToast('请先从左侧选择一条 Prompt', 'info');
      return;
    }
    setLabLoading(true);
    setLabResult(null);
    try {
      const result = await runPromptLab({
        prompt: selectedPrompt.content,
        input_text: labInput || undefined,
        max_tokens: 1000,
        temperature: 0.7,
      });
      setLabResult(result);
    } catch (error: any) {
      showToast(errorText(error, '运行失败'), 'error');
    } finally {
      setLabLoading(false);
    }
  };

  const handleOpenSubmit = () => {
    if (!isAuthenticated) {
      showToast('投稿提示词需要先登录', 'info');
      navigate('/login?redirect=%2Fprompts');
      return;
    }
    setShowSubmitModal(true);
  };

  const handleSubmitPrompt = async () => {
    if (!isAuthenticated) {
      showToast('投稿需要先登录', 'info');
      navigate('/login?redirect=%2Fprompts');
      return;
    }
    if (!submitForm.title.trim() || !submitForm.content.trim()) {
      showToast('请填写标题和 Prompt 内容', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await submitPrompt({
        title: submitForm.title.trim(),
        description: submitForm.description.trim() || undefined,
        content: submitForm.content.trim(),
        category: submitForm.category,
      });
      showToast('提交成功，已进入待审核（可在用户中心查看进度）', 'success');
      setShowSubmitModal(false);
      setSubmitForm({ title: '', description: '', content: '', category: 'Dev' });
    } catch (error: any) {
      showToast(errorText(error, '提交失败'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* 极简编辑部页头 */}
      <header className="pb-8 mb-8 border-b border-slate-200/80 dark:border-slate-800 grid lg:grid-cols-[minmax(0,1fr)_auto] gap-6 items-end">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-medium tracking-wider uppercase text-primary-600 dark:text-primary-400">
            <Icons.Sparkles className="w-3.5 h-3.5" />
            <span>Prompt Library / 提示词工作台</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            AI 提示词工程库
          </h1>
          <p className="max-w-2xl text-sm sm:text-base text-slate-500 dark:text-slate-400 leading-relaxed">
            按场景检索、一键复制、云端收藏与在线试跑。选中任意指令即可直接在右侧实验室验证生成效果。
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={handleOpenSubmit}>
              <Icons.Plus className="w-3.5 h-3.5" /> 提交新提示词
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => document.getElementById('prompt-lab')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              <Icons.Play className="w-3.5 h-3.5" /> 前往实验室试跑
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
          {[
            { label: '当前结果', value: promptStats.total, icon: Icons.Terminal },
            { label: '累计使用', value: promptStats.uses, icon: Icons.Copy },
            { label: '获赞总数', value: promptStats.likes, icon: Icons.Heart },
            { label: '我的收藏', value: isAuthenticated ? favoriteIds.length : '—', icon: Icons.Bookmark },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-3 min-w-[100px]"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <stat.icon className="w-3.5 h-3.5 text-primary-500" />
                {stat.label}
              </div>
              <div className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{stat.value}</div>
            </div>
          ))}
        </div>
      </header>

      {/* 搜索与分类过滤栏 */}
      <div className="mb-6 rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
        <form onSubmit={applySearch} className="flex flex-col lg:flex-row gap-2.5">
          <div className="relative flex-1">
            <Icons.Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索标题、描述或提示词内容..."
              className="pl-10"
            />
          </div>
          <Select value={sortMode} onChange={(e) => setSortMode(e.target.value as any)}>
            <option value="latest">最新优先</option>
            <option value="popular">使用最多</option>
            <option value="liked">点赞最多</option>
          </Select>
          <Button
            type="button"
            variant={favoritesOnly ? 'primary' : 'outline'}
            onClick={handleToggleFavoritesOnly}
          >
            <Icons.Bookmark className={`w-3.5 h-3.5 ${favoritesOnly ? 'fill-current' : ''}`} />
            只看收藏
          </Button>
          <Button type="submit" variant="secondary">
            搜索
          </Button>
        </form>

        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setFilter(cat);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                filter === cat
                  ? 'bg-slate-900 dark:bg-slate-100 border-slate-900 dark:border-slate-100 text-white dark:text-slate-900'
                  : 'bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setSearchTerm('');
                setPage(1);
              }}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 inline-flex items-center gap-1 cursor-pointer"
            >
              清除：{searchTerm} <Icons.X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* 视图摘要条 */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
            {favoritesOnly ? '我的收藏' : activeCategoryLabel}
            {searchTerm ? ` · “${searchTerm}”` : ''}
          </span>
          <StatusPill tone="primary">{visiblePrompts.length} 条指令</StatusPill>
        </div>
        <span>排序：{sortMode === 'latest' ? '最新优先' : sortMode === 'popular' ? '使用最多' : '点赞最多'}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Prompt Cards */}
        <div className="lg:col-span-8">
          {loading ? (
            <ListSkeleton rows={4} />
          ) : visiblePrompts.length === 0 ? (
            <EmptyState
              icon={<Icons.Terminal className="w-5 h-5" />}
              title={favoritesOnly ? '暂无已收藏的 Prompt' : '暂无匹配的 Prompt'}
              description={
                favoritesOnly
                  ? '浏览提示词卡片并点击右上角收藏图标，即可把常用指令同步到个人中心。'
                  : '可以切换分类、清空搜索词，或点击右上角提交新的高质量 Prompt。'
              }
              action={
                favoritesOnly || searchTerm || filter !== 'All' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setFavoritesOnly(false);
                      setFilter('All');
                      setSearchInput('');
                      setSearchTerm('');
                    }}
                  >
                    显示全部提示词
                  </Button>
                ) : (
                  <Button size="sm" onClick={handleOpenSubmit}>
                    提交第一条 Prompt
                  </Button>
                )
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger-in">
              {visiblePrompts.map((prompt) => {
                const isFav = favoriteIds.includes(prompt.id);
                const isLiked = Boolean(likedIds[prompt.id]);
                const authorLabel = prompt.author?.display_name || prompt.author?.username || prompt.submitted_by;

                return (
                  <Card
                    key={prompt.id}
                    className={`flex flex-col p-5 card-lift transition-colors group ${
                      selectedPrompt?.id === prompt.id
                        ? 'border-primary-400 dark:border-primary-600 ring-1 ring-primary-500/30'
                        : 'hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <Badge color="primary">{CATEGORY_LABELS[prompt.category] || prompt.category}</Badge>
                      <button
                        type="button"
                        onClick={() => handleToggleFavorite(prompt.id)}
                        title={isFav ? '取消收藏' : '加入收藏'}
                        className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                          isFav
                            ? 'border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400'
                            : 'border-slate-200/80 dark:border-slate-700 text-slate-400 hover:text-primary-600 dark:hover:text-primary-400'
                        }`}
                      >
                        <Icons.Bookmark className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                      </button>
                    </div>

                    <Link to={`/prompts/${prompt.id}`} className="block mb-1.5">
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-1">
                        {prompt.title}
                      </h3>
                    </Link>

                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 line-clamp-2 min-h-[32px] leading-relaxed">
                      {prompt.description || '适用于通用 AI 对话与工作流场景的结构化指令模板'}
                    </p>

                    <div className="mb-3 rounded-lg bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 p-3 text-xs text-slate-600 dark:text-slate-300 font-mono line-clamp-3 leading-relaxed">
                      {prompt.content}
                    </div>

                    <div className="text-[11px] text-slate-400 dark:text-slate-500 mb-4 flex items-center justify-between gap-2 tabular-nums">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                          <Icons.Copy className="w-3 h-3" /> {prompt.use_count}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Icons.Heart className={`w-3 h-3 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                          {prompt.like_count || 0}
                        </span>
                      </div>
                      {authorLabel &&
                        (prompt.author?.username ? (
                          <Link
                            to={`/user/${encodeURIComponent(prompt.author.username)}`}
                            className="truncate max-w-[120px] hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                          >
                            @{authorLabel}
                          </Link>
                        ) : (
                          <span className="truncate max-w-[120px]">@{authorLabel}</span>
                        ))}
                    </div>

                    <div className="mt-auto flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={copySuccess === prompt.id ? 'primary' : 'secondary'}
                        className="flex-1"
                        onClick={() => handleCopyPrompt(prompt)}
                      >
                        {copySuccess === prompt.id ? (
                          <>
                            <Icons.Check className="w-3.5 h-3.5" /> 已复制
                          </>
                        ) : (
                          <>
                            <Icons.Copy className="w-3.5 h-3.5" /> 复制指令
                          </>
                        )}
                      </Button>
                      <Link to={`/prompts/${prompt.id}`}>
                        <Button size="sm" variant="outline" title="查看详情">
                          <Icons.ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant={selectedPrompt?.id === prompt.id ? 'primary' : 'outline'}
                        onClick={() => {
                          setSelectedPrompt(prompt);
                          setLabResult(null);
                        }}
                        title="在实验室中试跑"
                      >
                        <Icons.Play className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggleLike(prompt)}
                        title={isLiked ? '取消点赞' : '点赞'}
                        className={isLiked ? 'text-red-500 border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30' : ''}
                      >
                        <Icons.Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-current like-pop' : ''}`} />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-8">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <Icons.ChevronLeft className="w-3.5 h-3.5" /> 上一页
              </Button>
              <span className="px-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                下一页 <Icons.ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Right: Playground Sidebar */}
        <aside id="prompt-lab" className="lg:col-span-4 scroll-mt-24">
          <div className="sticky top-24 space-y-4">
            <Card className="overflow-hidden">
              <div className="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icons.Terminal className="w-4 h-4 text-primary-500" />
                  <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">Prompt 实验室</span>
                </div>
                <StatusPill tone="emerald" dot>
                  在线试跑
                </StatusPill>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">
                    当前选中指令
                  </label>
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg text-xs text-slate-600 dark:text-slate-300 font-mono border border-slate-200/70 dark:border-slate-700/70 max-h-24 overflow-y-auto">
                    {selectedPrompt ? selectedPrompt.content : '点击任意 Prompt 卡片上的 ▶ 图标载入模板...'}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 flex justify-between">
                    <span>输入变量 / 测试上下文</span>
                    <span className="font-normal tabular-nums">{labInput.length} / 2000</span>
                  </label>
                  <Textarea
                    className="h-28 resize-none"
                    placeholder="在此输入测试上下文..."
                    value={labInput}
                    onChange={(e) => setLabInput(e.target.value.slice(0, 2000))}
                  />
                </div>
                <Button className="w-full" onClick={handleRunLab} disabled={labLoading || !selectedPrompt}>
                  {labLoading ? (
                    <>运行中...</>
                  ) : (
                    <>
                      <Icons.Send className="w-3.5 h-3.5" /> 开始运行
                    </>
                  )}
                </Button>

                {labResult && (
                  <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 rounded-lg p-3.5">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">运行结果</span>
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await copyToClipboard(labResult.result);
                          showToast(ok ? '结果已复制' : '复制失败', ok ? 'success' : 'error');
                        }}
                        className="text-xs text-emerald-700 dark:text-emerald-300 hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Icons.Copy className="w-3 h-3" /> 复制
                      </button>
                    </div>
                    <div className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                      {labResult.result}
                    </div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 tabular-nums">
                      Tokens: {labResult.total_tokens} (P: {labResult.prompt_tokens}, C: {labResult.completion_tokens})
                    </div>
                  </div>
                )}

                {(selectedPrompt || labInput || labResult) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPrompt(null);
                      setLabInput('');
                      setLabResult(null);
                    }}
                    className="w-full text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 py-1 transition-colors cursor-pointer"
                  >
                    清空实验室
                  </button>
                )}
              </div>
            </Card>

            {!!topPrompts.length && (
              <Card className="p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                  <Icons.TrendingUp className="w-3.5 h-3.5 text-primary-500" /> 精选榜单
                </div>
                <div className="space-y-2">
                  {topPrompts.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedPrompt(item);
                        setLabResult(null);
                      }}
                      className="w-full text-left rounded-lg bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 p-2.5 hover:border-primary-300 dark:hover:border-primary-700 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="shrink-0 w-5 h-5 rounded-md bg-primary-50 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400 flex items-center justify-center text-[11px] font-bold tabular-nums">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 line-clamp-1">{item.title}</div>
                          <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
                            {item.use_count || 0} 使用 &middot; {item.like_count || 0} 赞
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </Card>
            )}

            <Card className="p-4">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 mb-2">
                <Icons.CheckCircle2 className="w-3.5 h-3.5 text-primary-500" /> 好 Prompt 检查清单
              </div>
              <ul className="space-y-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                <li>&bull; 明确角色定位、任务目标与输出结构</li>
                <li>&bull; 给出边界条件、约束说明与评估标准</li>
                <li>&bull; 可复用变量建议用 {'{variable}'} 占位</li>
              </ul>
            </Card>
          </div>
        </aside>
      </div>

      {/* Submit Modal */}
      {showSubmitModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowSubmitModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">提交新 Prompt</h2>
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <Icons.X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">标题 *</label>
                <Input
                  value={submitForm.title}
                  onChange={(e) => setSubmitForm({ ...submitForm, title: e.target.value })}
                  placeholder="例如：React 代码审查助手"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">分类</label>
                <Select
                  className="w-full"
                  value={submitForm.category}
                  onChange={(e) => setSubmitForm({ ...submitForm, category: e.target.value as PromptCategory })}
                >
                  {CATEGORIES.filter((c) => c !== 'All').map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]} ({cat})
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">简短描述</label>
                <Input
                  value={submitForm.description}
                  onChange={(e) => setSubmitForm({ ...submitForm, description: e.target.value })}
                  placeholder="说明适用场景与输出效果"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Prompt 正文 *</label>
                <Textarea
                  value={submitForm.content}
                  onChange={(e) => setSubmitForm({ ...submitForm, content: e.target.value })}
                  className="h-36 font-mono text-xs"
                  placeholder="输入完整的系统提示词或指令模板..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowSubmitModal(false)}>
                  取消
                </Button>
                <Button onClick={handleSubmitPrompt} disabled={submitting}>
                  {submitting ? '提交中...' : '提交审核'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PromptLibrary;