import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    const fetchPrompts = async () => {
      setLoading(true);
      try {
        const params: any = { page, page_size: 20 };
        if (filter !== 'All') {
          params.category = filter;
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
  }, [page, filter]);

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
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 dark:text-white mb-2 transition-colors">Prompt Library</h1>
          <p className="text-slate-500 dark:text-slate-400 transition-colors">发现、复制并测试高效的 AI 指令，让工作流更智能。</p>
        </div>
        <Button onClick={() => setShowSubmitModal(true)}>
          <Icons.Sparkles className="w-4 h-4 mr-2" />
          提交新提示词
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-6 scrollbar-hide">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => { setFilter(cat); setPage(1); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${filter === cat
              ? 'bg-primary-500 text-white shadow-md'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-600'
              }`}
          >
            {cat === 'All' ? '全部' : cat}
          </button>
        ))}
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
              {prompts.map(prompt => (
                <Card key={prompt.id} className={`flex flex-col p-6 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-lg transition-all group ${selectedPrompt?.id === prompt.id ? 'border-primary-500 ring-2 ring-primary-200 dark:ring-primary-900/40' : 'dark:bg-slate-800 dark:border-slate-700'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-2 bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-lg group-hover:bg-primary-500 group-hover:text-white transition-colors">
                      <Icons.MessageSquare className="w-5 h-5" />
                    </div>
                    <Badge>{prompt.category}</Badge>
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2 transition-colors">{prompt.title}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-2 line-clamp-2 flex-grow transition-colors">{prompt.description}</p>
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
        <div className="lg:col-span-4">
          <div className="sticky top-24">
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