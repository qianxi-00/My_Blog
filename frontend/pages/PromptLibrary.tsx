import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { Card, Button, Badge } from '../components/Shared';
import { getPrompts, submitPrompt, recordPromptUsage, Prompt, PromptCategory } from '../api/prompts';
import { likePrompt, unlikePrompt } from '../api/prompts';
import { runPromptLab, PromptLabResponse } from '../api/chat';

const PromptLibrary: React.FC = () => {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PromptCategory | 'All'>('All');
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortMode, setSortMode] = useState<'latest' | 'popular' | 'liked'>('latest');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
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
    submitted_by: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Copy success state
  const [copySuccess, setCopySuccess] = useState<number | null>(null);

  const categories: (PromptCategory | 'All')[] = ['All', 'Dev', 'Writing', 'Business', 'Academic'];
  const categoryLabels: Record<PromptCategory | 'All', string> = {
    All: '全部',
    Dev: '开发',
    Writing: '写作',
    Business: '商业',
    Academic: '学术',
    Other: '其他',
  };

  const visiblePrompts = useMemo(() => {
    const list = favoritesOnly ? prompts.filter(item => favoriteIds.includes(item.id)) : [...prompts];
    if (sortMode === 'popular') return list.sort((a, b) => (b.use_count || 0) - (a.use_count || 0));
    if (sortMode === 'liked') return list.sort((a, b) => (b.like_count || 0) - (a.like_count || 0));
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [prompts, sortMode, favoritesOnly, favoriteIds]);

  const promptStats = useMemo(() => ({
    total: prompts.length,
    uses: prompts.reduce((sum, item) => sum + (item.use_count || 0), 0),
    likes: prompts.reduce((sum, item) => sum + (item.like_count || 0), 0),
  }), [prompts]);

  const topPrompts = useMemo(() => [...prompts]
    .sort((a, b) => ((b.use_count || 0) * 2 + (b.like_count || 0)) - ((a.use_count || 0) * 2 + (a.like_count || 0)))
    .slice(0, 5), [prompts]);

  const activeCategoryLabel = categoryLabels[filter];

  const applySearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchTerm(searchInput.trim());
    setPage(1);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem('prompt_favorites');
      if (raw) setFavoriteIds(JSON.parse(raw));
    } catch (e) {
      // ignore broken local cache
    }
  }, []);

  const toggleFavorite = (id: number) => {
    setFavoriteIds(prev => {
      const next = prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id];
      localStorage.setItem('prompt_favorites', JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    const fetchPrompts = async () => {
      setLoading(true);
      try {
        const params: any = { page, page_size: 20 };
        if (filter !== 'All') {
          params.category = filter;
        }
        if (searchTerm) {
          params.search = searchTerm;
        }
        const response = await getPrompts(params);
        setPrompts(response.data);
        setTotalPages(response.total_pages);
      } catch (error) {
        console.error('获取 Prompt 列表失败:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPrompts();
  }, [page, filter, searchTerm]);

  const copyToClipboard = async (prompt: Prompt) => {
    try {
      await navigator.clipboard.writeText(prompt.content);
      // 记录使用次数
      try {
        await recordPromptUsage(prompt.id);
        // 更新本地状态中的使用次数
        setPrompts(prev => prev.map(p =>
          p.id === prompt.id ? { ...p, use_count: p.use_count + 1 } : p
        ));
      } catch (e) {
        // ignore usage record error
      }
      setCopySuccess(prompt.id);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      // 回退方案：使用传统方法
      try {
        const textArea = document.createElement('textarea');
        textArea.value = prompt.content;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopySuccess(prompt.id);
        setTimeout(() => setCopySuccess(null), 2000);
      } catch (fallbackErr) {
        alert('复制失败，请手动复制');
      }
    }
  };

  const handleRunLab = async () => {
    if (!selectedPrompt) {
      alert('请先选择一个 Prompt');
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
      const errorMsg = error.response?.data?.detail || error.message || '运行失败';
      alert(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
    } finally {
      setLabLoading(false);
    }
  };

  const handleSubmitPrompt = async () => {
    if (!submitForm.title || !submitForm.content) {
      alert('请填写标题和内容');
      return;
    }
    setSubmitting(true);
    try {
      await submitPrompt(submitForm);
      alert('提交成功！等待审核');
      setShowSubmitModal(false);
      setSubmitForm({ title: '', description: '', content: '', category: 'Dev', submitted_by: '' });
    } catch (error: any) {
      alert(error.response?.data?.detail || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 transition-colors duration-300">
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-cyan-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-cyan-950/30 border border-cyan-100 dark:border-slate-700 p-6 md:p-8 mb-8 shadow-sm">
        <div className="absolute inset-0 opacity-70 dark:opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 12% 10%, rgba(14,165,233,.18), transparent 28%), radial-gradient(circle at 88% 20%, rgba(99,102,241,.12), transparent 24%)' }} />
        <div className="relative grid lg:grid-cols-[minmax(0,1fr)_360px] gap-8 items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 dark:bg-slate-800/80 border border-cyan-100 dark:border-slate-700 px-3 py-1.5 text-sm font-bold text-cyan-700 dark:text-cyan-200">
              <Icons.Sparkles className="w-4 h-4" /> Prompt Library
            </div>
            <h1 className="mt-5 text-4xl md:text-5xl font-black tracking-tight text-slate-900 dark:text-white">AI 提示词工作台</h1>
            <p className="mt-4 max-w-2xl text-slate-600 dark:text-slate-300 leading-7">按场景检索、复制、点赞和试跑提示词。这里更像一个轻量 Prompt marketplace：先找模板，再进实验室验证效果。</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => setShowSubmitModal(true)} className="bg-cyan-500 hover:bg-cyan-600">
                <Icons.Sparkles className="w-4 h-4 mr-2" /> 提交新提示词
              </Button>
              <Link to={prompts[0] ? `/prompts/lab/${prompts[0].id}` : '/prompts/lab'} className="inline-flex items-center justify-center rounded-xl border border-cyan-200 dark:border-cyan-700 bg-white/80 dark:bg-cyan-900/20 px-4 py-2 text-sm font-bold text-cyan-700 dark:text-cyan-200 hover:bg-cyan-50 dark:hover:bg-cyan-900/40 transition-colors">
                进入全屏实验室
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="rounded-3xl bg-white/85 dark:bg-slate-800/80 border border-cyan-100 dark:border-slate-700 p-4 text-center"><div className="text-2xl font-black text-slate-900 dark:text-white">{promptStats.total}</div><div className="text-xs text-slate-500 dark:text-slate-400 mt-1">当前结果</div></div>
            <div className="rounded-3xl bg-white/85 dark:bg-slate-800/80 border border-cyan-100 dark:border-slate-700 p-4 text-center"><div className="text-2xl font-black text-slate-900 dark:text-white">{promptStats.uses}</div><div className="text-xs text-slate-500 dark:text-slate-400 mt-1">使用次数</div></div>
            <div className="rounded-3xl bg-white/85 dark:bg-slate-800/80 border border-cyan-100 dark:border-slate-700 p-4 text-center"><div className="text-2xl font-black text-slate-900 dark:text-white">{promptStats.likes}</div><div className="text-xs text-slate-500 dark:text-slate-400 mt-1">点赞</div></div>
            <div className="rounded-3xl bg-white/85 dark:bg-slate-800/80 border border-cyan-100 dark:border-slate-700 p-4 text-center"><div className="text-2xl font-black text-slate-900 dark:text-white">{favoriteIds.length}</div><div className="text-xs text-slate-500 dark:text-slate-400 mt-1">本地收藏</div></div>
          </div>
        </div>
      </section>

      <div className="mb-6 rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
        <form onSubmit={applySearch} className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="搜索标题、描述或提示词内容..." className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 py-3 pl-11 pr-4 text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-cyan-100 dark:focus:ring-cyan-900/40 focus:border-cyan-200" />
          </div>
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value as any)} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-sm font-bold text-slate-600 dark:text-slate-300 outline-none">
            <option value="latest">最新优先</option>
            <option value="popular">使用最多</option>
            <option value="liked">点赞最多</option>
          </select>
          <button type="button" onClick={() => { setFavoritesOnly(v => !v); setPage(1); }} className={`rounded-2xl border px-4 py-3 text-sm font-bold transition-all ${favoritesOnly ? 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800' : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>只看收藏</button>
          <Button type="submit" className="bg-cyan-500 hover:bg-cyan-600">搜索</Button>
        </form>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {categories.map(cat => (
            <button key={cat} onClick={() => { setFilter(cat); setPage(1); }} className={`px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${filter === cat ? 'bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-200 dark:border-cyan-700 shadow-sm' : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-cyan-200 dark:hover:border-cyan-700'}`}>
              {categoryLabels[cat]}
            </button>
          ))}
          {searchTerm && <button onClick={() => { setSearchInput(''); setSearchTerm(''); setPage(1); }} className="px-4 py-2 rounded-full text-sm font-bold bg-amber-50 text-amber-700 border border-amber-100">清除搜索：{searchTerm}</button>}
        </div>
      </div>

      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-5 py-4 shadow-sm">
        <div>
          <div className="text-sm font-bold text-slate-400 dark:text-slate-500">当前视图</div>
          <div className="text-xl font-black text-slate-900 dark:text-white">{favoritesOnly ? '我的收藏' : activeCategoryLabel}{searchTerm ? ` · 搜索“${searchTerm}”` : ''}</div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-cyan-50 text-cyan-700 border border-cyan-100 dark:bg-cyan-900/30 dark:text-cyan-200 dark:border-cyan-700 px-3 py-1.5">{visiblePrompts.length} 条结果</span>
          <span className="rounded-full bg-slate-50 text-slate-500 border border-slate-100 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700 px-3 py-1.5">排序：{sortMode === 'latest' ? '最新优先' : sortMode === 'popular' ? '使用最多' : '点赞最多'}</span>
          {favoritesOnly && <span className="rounded-full bg-rose-50 text-rose-600 border border-rose-100 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800 px-3 py-1.5">收藏模式</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Library */}
        <div className="lg:col-span-8">
          {loading ? (
            <div className="text-center py-20 text-slate-400 dark:text-slate-500 transition-colors">加载中...</div>
          ) : prompts.length === 0 ? (
            <div className="text-center py-20 text-slate-400 dark:text-slate-500 transition-colors">暂无 Prompt</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {visiblePrompts.map(prompt => (
                <Card key={prompt.id} className={`flex flex-col p-6 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-lg transition-all group ${selectedPrompt?.id === prompt.id ? 'border-primary-500 ring-2 ring-primary-200 dark:ring-primary-900/40' : 'dark:bg-slate-800 dark:border-slate-700'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-2 bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-lg group-hover:bg-primary-500 group-hover:text-white transition-colors">
                      <Icons.MessageSquare className="w-5 h-5" />
                    </div>
                    <Badge>{prompt.category}</Badge>
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2 transition-colors">{prompt.title}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-3 line-clamp-2 transition-colors">{prompt.description}</p>
                  <div className="mb-3 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-700 p-3 text-xs text-slate-500 dark:text-slate-400 font-mono line-clamp-3">
                    {prompt.content}
                  </div>
                  <div className="mb-4 flex flex-wrap gap-2 text-[11px] font-bold">
                    <span className="rounded-full bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-200 px-2.5 py-1">可复制</span>
                    {prompt.use_count > 0 && <span className="rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 px-2.5 py-1">已验证使用</span>}
                    {(prompt.like_count || 0) > 0 && <span className="rounded-full bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-300 px-2.5 py-1">受欢迎</span>}
                  </div>
                  <div className="text-xs text-slate-400 dark:text-slate-500 mb-4 transition-colors flex items-center gap-3">
                    <span className="flex items-center gap-1"><Icons.Copy className="w-3 h-3" /> {prompt.use_count} 次使用</span>
                    <span className="flex items-center gap-1"><Icons.Heart className={`w-3 h-3 ${localStorage.getItem(`liked_prompt_${prompt.id}`) === 'true' ? 'fill-red-500 text-red-500' : ''}`} /> {prompt.like_count || 0} 点赞</span>
                  </div>

                  <div className="mt-auto flex gap-3">
                    <Button
                      size="sm"
                      variant={copySuccess === prompt.id ? "primary" : "secondary"}
                      className="flex-1"
                      onClick={() => copyToClipboard(prompt)}
                    >
                      {copySuccess === prompt.id ? (
                        <>
                          <Icons.Copy className="w-3 h-3 mr-2" />
                          已复制!
                        </>
                      ) : (
                        <>
                          <Icons.Copy className="w-3 h-3 mr-2" />
                          复制指令
                        </>
                      )}
                    </Button>
                    <Link to={`/prompts/lab/${prompt.id}`} className="flex-1">
                      <Button size="sm" variant="outline" title="进入全屏实验室" className="w-full dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-700">
                        <Icons.ExternalLink className="w-3 h-3 mr-2" />
                        实验室
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedPrompt(prompt);
                        setLabResult(null);
                      }}
                      title="在实验室中测试"
                      className="dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-700"
                    >
                      <Icons.Play className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const isLiked = localStorage.getItem(`liked_prompt_${prompt.id}`) === 'true';
                        try {
                          if (isLiked) {
                            await unlikePrompt(prompt.id);
                            localStorage.removeItem(`liked_prompt_${prompt.id}`);
                            setPrompts(prev => prev.map(p =>
                              p.id === prompt.id ? { ...p, like_count: Math.max(0, p.like_count - 1) } : p
                            ));
                          } else {
                            await likePrompt(prompt.id);
                            localStorage.setItem(`liked_prompt_${prompt.id}`, 'true');
                            setPrompts(prev => prev.map(p =>
                              p.id === prompt.id ? { ...p, like_count: p.like_count + 1 } : p
                            ));
                          }
                        } catch (error) {
                          console.error('操作失败:', error);
                        }
                      }}
                      title={localStorage.getItem(`liked_prompt_${prompt.id}`) === 'true' ? "取消点赞" : "点赞"}
                      className={`dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-700 transition-colors ${localStorage.getItem(`liked_prompt_${prompt.id}`) === 'true' ? 'text-red-500 dark:text-red-400 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/10' : ''
                        }`}
                    >
                      <Icons.Heart className={`w-3 h-3 ${localStorage.getItem(`liked_prompt_${prompt.id}`) === 'true' ? 'fill-current' : ''}`} />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg disabled:opacity-50 transition-colors"
              >
                上一页
              </button>
              <span className="px-4 py-2 text-slate-400 dark:text-slate-500 transition-colors">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg disabled:opacity-50 transition-colors"
              >
                下一页
              </button>
            </div>
          )}
        </div>

        {/* Right: Playground */}
        <div id="prompt-lab" className="lg:col-span-4 scroll-mt-24">
          <div className="sticky top-24 space-y-5">
            {!!topPrompts.length && (
              <Card className="p-5 border-cyan-100 dark:border-slate-700">
                <div className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white mb-4">
                  <Icons.TrendingUp className="w-4 h-4 text-cyan-500" /> 精选榜单
                </div>
                <div className="space-y-3">
                  {topPrompts.map((item, index) => (
                    <button key={item.id} type="button" onClick={() => { setSelectedPrompt(item); setLabResult(null); }} className="w-full text-left rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-700 p-3 hover:border-cyan-200 dark:hover:border-cyan-700 transition-colors">
                      <div className="flex gap-3">
                        <span className="shrink-0 w-6 h-6 rounded-full bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-200 flex items-center justify-center text-xs font-black">{index + 1}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-800 dark:text-slate-100 line-clamp-2">{item.title}</div>
                          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{item.use_count || 0} 使用 · {item.like_count || 0} 赞</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </Card>
            )}
            <Card className="p-5 bg-gradient-to-br from-cyan-50 to-white dark:from-cyan-950/20 dark:to-slate-800 border-cyan-100 dark:border-slate-700">
              <div className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2"><Icons.Check className="w-4 h-4 text-cyan-500" /> 好 Prompt 检查表</div>
              <ul className="mt-3 space-y-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
                <li>• 明确角色、目标和输出格式</li>
                <li>• 给出上下文、约束和评价标准</li>
                <li>• 可复用变量用括号或占位符标出</li>
              </ul>
            </Card>
            <Card className="overflow-hidden border-slate-200 dark:border-slate-700 shadow-lg dark:bg-slate-800">
              <div className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700 p-4 flex items-center justify-between transition-colors">
                <div className="flex items-center gap-2">
                  <Icons.Bot className="w-4 h-4 text-primary-500 dark:text-primary-400" />
                  <span className="font-bold text-sm text-slate-700 dark:text-slate-200">Prompt 实验室</span>
                </div>
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
                </div>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2 block">当前指令</label>
                  <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-xl text-xs text-slate-600 dark:text-slate-300 font-mono border border-slate-100 dark:border-slate-700 max-h-24 overflow-y-auto transition-colors">
                    {selectedPrompt ? selectedPrompt.content : '"请从列表中选择一条指令..."'}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2 block flex justify-between">
                    <span>输入变量</span>
                    <span className="font-normal lowercase">{labInput.length} / 2000</span>
                  </label>
                  <textarea
                    className="w-full h-32 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm resize-none focus:ring-2 focus:ring-primary-500 focus:outline-none dark:text-slate-200 transition-colors"
                    placeholder="在此输入上下文..."
                    value={labInput}
                    onChange={(e) => setLabInput(e.target.value.slice(0, 2000))}
                  ></textarea>
                </div>
                <Button className="w-full" onClick={handleRunLab} disabled={labLoading || !selectedPrompt}>
                  {labLoading ? (
                    <>运行中...</>
                  ) : (
                    <>
                      <Icons.Send className="w-4 h-4 mr-2" />
                      开始运行
                    </>
                  )}
                </Button>

                {/* Result */}
                {labResult && (
                  <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30 rounded-xl p-3 transition-colors">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">运行结果</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(labResult.result);
                          alert('结果已复制!');
                        }}
                        className="text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 flex items-center gap-1 transition-colors"
                      >
                        <Icons.Copy className="w-3 h-3" />
                        复制
                      </button>
                    </div>
                    <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto transition-colors">{labResult.result}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-2 transition-colors">
                      Tokens: {labResult.total_tokens} (P: {labResult.prompt_tokens}, C: {labResult.completion_tokens})
                    </div>
                  </div>
                )}

                {/* Clear Button */}
                {(selectedPrompt || labInput || labResult) && (
                  <button
                    onClick={() => {
                      setSelectedPrompt(null);
                      setLabInput('');
                      setLabResult(null);
                    }}
                    className="w-full text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 py-2 transition-colors"
                  >
                    清空实验室
                  </button>
                )}
              </div>
              <div className="bg-slate-50 dark:bg-slate-900 p-3 border-t border-slate-100 dark:border-slate-700 text-center transition-colors">
                <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1">
                  <Icons.Bot className="w-3 h-3" />
                  已连接至 AI 模型
                </span>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Submit Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto transition-all shadow-2xl border border-slate-100 dark:border-slate-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white transition-colors">提交新 Prompt</h2>
              <button onClick={() => setShowSubmitModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <Icons.X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">标题 *</label>
                <input
                  type="text"
                  value={submitForm.title}
                  onChange={(e) => setSubmitForm({ ...submitForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg dark:text-white transition-colors focus:ring-2 focus:ring-primary-500 outline-none"
                  placeholder="Prompt 标题"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">描述</label>
                <input
                  type="text"
                  value={submitForm.description}
                  onChange={(e) => setSubmitForm({ ...submitForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg dark:text-white transition-colors focus:ring-2 focus:ring-primary-500 outline-none"
                  placeholder="简短描述"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">内容 *</label>
                <textarea
                  value={submitForm.content}
                  onChange={(e) => setSubmitForm({ ...submitForm, content: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg h-32 dark:text-white transition-colors focus:ring-2 focus:ring-primary-500 outline-none resize-none"
                  placeholder="Prompt 内容"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">分类</label>
                <select
                  value={submitForm.category}
                  onChange={(e) => setSubmitForm({ ...submitForm, category: e.target.value as PromptCategory })}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg dark:text-white transition-colors focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  <option value="Dev">Dev</option>
                  <option value="Writing">Writing</option>
                  <option value="Business">Business</option>
                  <option value="Academic">Academic</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">你的昵称</label>
                <input
                  type="text"
                  value={submitForm.submitted_by}
                  onChange={(e) => setSubmitForm({ ...submitForm, submitted_by: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg dark:text-white transition-colors focus:ring-2 focus:ring-primary-500 outline-none"
                  placeholder="可选"
                />
              </div>
              <Button className="w-full" onClick={handleSubmitPrompt} disabled={submitting}>
                {submitting ? '提交中...' : '提交'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PromptLibrary;