import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card } from '../components/Shared';
import { Icons } from '../components/Icons';
import { getPrompt, likePrompt, recordPromptUsage, Prompt } from '../api/prompts';
import { runPromptLab, PromptLabResponse } from '../api/chat';
import { useToast } from '../components/Toast';

const categoryLabels: Record<string, string> = {
  Dev: '开发',
  Writing: '写作',
  Business: '商业',
  Academic: '学术',
  Other: '其他',
};

const formatDate = (v?: string) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const PromptDetail: React.FC = () => {
  const { id } = useParams();
  const promptId = id ? Number(id) : NaN;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [loading, setLoading] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [labInput, setLabInput] = useState('');
  const [labResult, setLabResult] = useState<PromptLabResponse | null>(null);
  const [labLoading, setLabLoading] = useState(false);

  const isFavorite = prompt ? favoriteIds.includes(prompt.id) : false;

  useEffect(() => {
    try {
      const raw = localStorage.getItem('prompt_favorites');
      if (raw) setFavoriteIds(JSON.parse(raw));
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    const fetchPrompt = async () => {
      if (!Number.isFinite(promptId)) return;
      setLoading(true);
      try {
        const data = await getPrompt(promptId);
        setPrompt(data);
      } catch (e: any) {
        showToast(e?.response?.data?.detail || 'Prompt 加载失败', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchPrompt();
  }, [promptId, showToast]);

  const toggleFavorite = () => {
    if (!prompt) return;
    setFavoriteIds(prev => {
      const next = prev.includes(prompt.id) ? prev.filter(item => item !== prompt.id) : [...prev, prompt.id];
      localStorage.setItem('prompt_favorites', JSON.stringify(next));
      return next;
    });
  };

  const copyPrompt = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt.content);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 1800);
      try {
        await recordPromptUsage(prompt.id);
        setPrompt(prev => prev ? { ...prev, use_count: prev.use_count + 1 } : prev);
      } catch (e) {
        // ignore usage record
      }
    } catch (e) {
      showToast('复制失败，请手动复制', 'error');
    }
  };

  const like = async () => {
    if (!prompt) return;
    const key = `liked_prompt_${prompt.id}`;
    if (localStorage.getItem(key) === 'true') {
      showToast('已经点过赞了', 'info');
      return;
    }
    try {
      const res = await likePrompt(prompt.id);
      localStorage.setItem(key, 'true');
      setPrompt(prev => prev ? { ...prev, like_count: res.like_count } : prev);
      showToast('已点赞', 'success');
    } catch (e: any) {
      showToast(e?.response?.data?.detail || '点赞失败', 'error');
    }
  };

  const runLab = async () => {
    if (!prompt) return;
    setLabLoading(true);
    setLabResult(null);
    try {
      const result = await runPromptLab({
        prompt: prompt.content,
        input_text: labInput || undefined,
        max_tokens: 1000,
        temperature: 0.7,
      });
      setLabResult(result);
    } catch (e: any) {
      showToast(e?.response?.data?.detail || e?.message || '运行失败', 'error');
    } finally {
      setLabLoading(false);
    }
  };

  const qualityTips = useMemo(() => {
    if (!prompt) return [];
    const tips = ['可复制'];
    if ((prompt.use_count || 0) > 0) tips.push('已验证使用');
    if ((prompt.like_count || 0) > 0) tips.push('受欢迎');
    if (prompt.content.includes('{') || prompt.content.includes('[')) tips.push('含变量位');
    return tips;
  }, [prompt]);

  if (!Number.isFinite(promptId)) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="text-slate-500 dark:text-slate-400">无效的 Prompt ID</div>
        <div className="mt-6"><Link to="/prompts"><Button>返回提示词库</Button></Link></div>
      </div>
    );
  }

  if (loading) {
    return <div className="max-w-6xl mx-auto px-4 py-20 text-center text-slate-400 animate-pulse">加载 Prompt 中...</div>;
  }

  if (!prompt) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="text-slate-500 dark:text-slate-400">Prompt 不存在或尚未审核</div>
        <div className="mt-6"><Link to="/prompts"><Button>返回提示词库</Button></Link></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <button onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/prompts')} className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-300 group transition-colors mb-6">
        <Icons.ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> 返回
      </button>

      <section className="rounded-[2rem] bg-gradient-to-br from-cyan-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-cyan-950/30 border border-cyan-100 dark:border-slate-700 p-6 md:p-8 mb-8 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Badge>{categoryLabels[prompt.category] || prompt.category}</Badge>
              {qualityTips.map(tip => <span key={tip} className="rounded-full bg-white/80 dark:bg-slate-800/80 border border-cyan-100 dark:border-slate-700 px-3 py-1 text-xs font-bold text-cyan-700 dark:text-cyan-200">{tip}</span>)}
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight text-slate-900 dark:text-white leading-tight">{prompt.title}</h1>
            {prompt.description && <p className="mt-4 max-w-3xl text-slate-600 dark:text-slate-300 leading-7">{prompt.description}</p>}
            <div className="mt-5 flex flex-wrap gap-4 text-sm text-slate-500 dark:text-slate-400">
              <span>使用 {prompt.use_count || 0}</span>
              <span>点赞 {prompt.like_count || 0}</span>
              <span>创建 {formatDate(prompt.created_at)}</span>
              <span>作者 {prompt.author?.display_name || prompt.author?.username || prompt.submitted_by || '匿名'}</span>
            </div>
          </div>
          <div className="flex flex-wrap lg:flex-col gap-3 shrink-0">
            <Button onClick={copyPrompt} className="bg-cyan-500 hover:bg-cyan-600 gap-2"><Icons.Copy className="w-4 h-4" /> {copySuccess ? '已复制' : '复制 Prompt'}</Button>
            <Button variant="outline" onClick={toggleFavorite} className={`gap-2 ${isFavorite ? 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800' : ''}`}><Icons.Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} /> {isFavorite ? '已收藏' : '收藏'}</Button>
            <Button variant="outline" onClick={like} className="gap-2"><Icons.Heart className="w-4 h-4" /> 点赞</Button>
          </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-8 items-start">
        <Card className="p-6 md:p-8">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-xl font-black text-slate-900 dark:text-white">Prompt 内容</h2>
            <button onClick={copyPrompt} className="text-sm font-bold text-cyan-600 dark:text-cyan-300 hover:underline">复制</button>
          </div>
          <pre className="whitespace-pre-wrap break-words rounded-3xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 p-5 text-sm leading-7 text-slate-700 dark:text-slate-200 font-mono">{prompt.content}</pre>
        </Card>

        <div className="space-y-5 sticky top-24">
          <Card className="overflow-hidden border-slate-200 dark:border-slate-700 shadow-lg dark:bg-slate-800">
            <div className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700 p-4 flex items-center gap-2">
              <Icons.Bot className="w-4 h-4 text-cyan-500" />
              <span className="font-bold text-sm text-slate-700 dark:text-slate-200">详情页实验室</span>
            </div>
            <div className="p-4 space-y-4">
              <textarea value={labInput} onChange={(e) => setLabInput(e.target.value.slice(0, 2000))} className="w-full h-32 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm resize-none focus:ring-2 focus:ring-cyan-100 focus:outline-none dark:text-slate-200 transition-colors" placeholder="输入上下文，直接用此 Prompt 试跑..." />
              <Button className="w-full bg-cyan-500 hover:bg-cyan-600" onClick={runLab} disabled={labLoading}>{labLoading ? '运行中...' : '开始运行'}</Button>
              {labResult && (
                <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-900/30 rounded-xl p-3">
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mb-2">运行结果</div>
                  <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-h-72 overflow-y-auto">{labResult.result}</div>
                  <div className="text-xs text-slate-400 dark:text-slate-500 mt-2">Tokens: {labResult.total_tokens}</div>
                </div>
              )}
            </div>
          </Card>
          <Card className="p-5 bg-gradient-to-br from-cyan-50 to-white dark:from-cyan-950/20 dark:to-slate-800 border-cyan-100 dark:border-slate-700">
            <div className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2"><Icons.Check className="w-4 h-4 text-cyan-500" /> 使用建议</div>
            <ul className="mt-3 space-y-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
              <li>• 先复制模板，再替换变量和上下文</li>
              <li>• 复杂任务建议补充示例和反例</li>
              <li>• 输出格式要写得越具体越好</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PromptDetail;
