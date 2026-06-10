import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { Button, Badge } from '../components/Shared';
import { getPrompt, getPrompts, recordPromptUsage, Prompt, PromptCategory } from '../api/prompts';
import { runPromptLab } from '../api/chat';

type LabRole = 'system' | 'user' | 'assistant';

interface LabMessage {
  id: string;
  role: LabRole;
  content: string;
  meta?: string;
}

const categoryLabels: Record<PromptCategory, string> = {
  Dev: '开发',
  Writing: '写作',
  Business: '商业',
  Academic: '学术',
  Other: '其他',
};

const quickInputs = [
  '请用这个 Prompt 帮我生成一个可直接发布的版本。',
  '先指出这段输入里最容易被模型误解的地方，再给出优化结果。',
  '请分别输出专业版、口语版、短视频口播版。',
];

const composePrompt = (systemPrompt: string, userInput: string) => {
  if (!userInput.trim()) return systemPrompt.trim();
  return `${systemPrompt.trim()}\n\n---\n用户输入：\n${userInput.trim()}`;
};

const PromptLab: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [promptList, setPromptList] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [systemPrompt, setSystemPrompt] = useState('');
  const [userInput, setUserInput] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1200);
  const [messages, setMessages] = useState<LabMessage[]>([]);
  const [copyTip, setCopyTip] = useState<string | null>(null);

  const fullPrompt = useMemo(() => composePrompt(systemPrompt, userInput), [systemPrompt, userInput]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await getPrompts({ page: 1, page_size: 12 });
        setPromptList(list.data || []);
        if (!id && list.data?.[0]) {
          navigate(`/prompts/lab/${list.data[0].id}`, { replace: true });
          return;
        }
        if (id) {
          const current = await getPrompt(Number(id));
          setPrompt(current);
          setSystemPrompt(current.content || '');
          setMessages([{ id: `system-${current.id}`, role: 'system', content: current.content || '', meta: '已载入系统提示词' }]);
          try { await recordPromptUsage(current.id); } catch { /* ignore */ }
        }
      } catch (e: any) {
        setError(e?.response?.data?.detail || e?.message || 'Prompt 实验室加载失败');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, navigate]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, running]);

  const copyText = async (text: string, tip: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyTip(tip);
      setTimeout(() => setCopyTip(null), 1600);
    } catch {
      alert('复制失败，请手动复制');
    }
  };

  const runExperiment = async () => {
    if (!systemPrompt.trim()) {
      alert('请先填写系统提示词');
      return;
    }
    if (!userInput.trim()) {
      alert('请输入实验内容');
      return;
    }

    const userMessage: LabMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userInput.trim(),
      meta: `temperature ${temperature.toFixed(1)} · max_tokens ${maxTokens}`,
    };
    setMessages(prev => [...prev, userMessage]);
    setRunning(true);
    setError(null);

    try {
      const result = await runPromptLab({
        prompt: systemPrompt,
        input_text: userInput,
        temperature,
        max_tokens: maxTokens,
      });
      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.result,
        meta: `Tokens ${result.total_tokens} · P ${result.prompt_tokens} · C ${result.completion_tokens}`,
      }]);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || '运行失败';
      const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
      setError(text);
      setMessages(prev => [...prev, { id: `error-${Date.now()}`, role: 'assistant', content: `运行失败：${text}`, meta: 'error' }]);
    } finally {
      setRunning(false);
    }
  };

  const resetChat = () => {
    setMessages(systemPrompt.trim() ? [{ id: `system-reset-${Date.now()}`, role: 'system', content: systemPrompt, meta: '当前系统提示词' }] : []);
    setUserInput('');
    setError(null);
  };

  if (loading) {
    return <div className="min-h-[70vh] flex items-center justify-center text-slate-500 dark:text-slate-400">Prompt 实验室启动中...</div>;
  }

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-slate-50 dark:bg-slate-950 transition-colors">
      {copyTip && <div className="fixed top-24 right-6 z-50 rounded-xl bg-emerald-500 text-white px-4 py-2 text-sm shadow-xl">{copyTip}</div>}
      <div className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-2">
              <Link to="/prompts" className="inline-flex items-center gap-1 hover:text-cyan-500"><Icons.ArrowLeft className="w-4 h-4" /> 返回提示词工作台</Link>
              <span>/</span>
              <span>Prompt 实验室</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 dark:text-white">Prompt 实验室</h1>
            <p className="mt-2 text-slate-500 dark:text-slate-400">全屏实验、连续对话、参数调试和 Prompt 预览都放在一个工作台里。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => copyText(fullPrompt, '完整 Prompt 已复制')}><Icons.Copy className="w-4 h-4 mr-2" />复制完整 Prompt</Button>
            <Button onClick={runExperiment} disabled={running || !systemPrompt.trim()} className="bg-cyan-500 hover:bg-cyan-600">
              {running ? <><Icons.RefreshCw className="w-4 h-4 mr-2 animate-spin" />运行中</> : <><Icons.Send className="w-4 h-4 mr-2" />运行实验</>}
            </Button>
          </div>
        </div>

        {error && <div className="mb-4 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 px-4 py-3 text-sm">{error}</div>}

        <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)_400px] gap-4">
          <aside className="rounded-[1.75rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden h-fit xl:sticky xl:top-24">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              <div className="font-black text-slate-900 dark:text-white flex items-center gap-2"><Icons.BookOpen className="w-4 h-4 text-cyan-500" />实验对象</div>
              <p className="mt-1 text-xs text-slate-400">点击切换不同提示词</p>
            </div>
            <div className="p-2 max-h-[690px] overflow-y-auto space-y-2">
              {promptList.map(item => (
                <button
                  key={item.id}
                  onClick={() => navigate(`/prompts/lab/${item.id}`)}
                  className={`w-full text-left rounded-2xl p-3 border transition-all ${prompt?.id === item.id ? 'bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/80'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100 line-clamp-2">{item.title}</div>
                    <Badge>{categoryLabels[item.category] || item.category}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{item.description || item.content}</p>
                  <div className="mt-2 flex gap-3 text-[11px] text-slate-400"><span>{item.use_count || 0} 使用</span><span>{item.like_count || 0} 赞</span></div>
                </button>
              ))}
            </div>
          </aside>

          <main className="rounded-[1.75rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden min-h-[740px] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white/80 dark:bg-slate-900/80 backdrop-blur">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-cyan-500 text-white flex items-center justify-center shadow-lg shadow-cyan-500/20"><Icons.Bot className="w-5 h-5" /></div>
                <div className="min-w-0">
                  <div className="font-black text-slate-900 dark:text-white truncate">{prompt?.title || '未选择提示词'}</div>
                  <div className="text-xs text-slate-400 truncate">{prompt?.description || '选择左侧提示词开始实验'}</div>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-emerald-500"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Lab Ready</div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-gradient-to-b from-slate-50/70 to-white dark:from-slate-950/40 dark:to-slate-900">
              {messages.length === 0 ? (
                <div className="h-full min-h-[430px] flex flex-col items-center justify-center text-center text-slate-400">
                  <Icons.Sparkles className="w-12 h-12 mb-4 text-cyan-400" />
                  <div className="text-lg font-bold text-slate-600 dark:text-slate-300">输入变量，开始第一轮实验</div>
                  <div className="mt-2 max-w-md text-sm">每次运行都会保留上下文和 token 数据，方便比较不同 Prompt 写法的稳定性。</div>
                </div>
              ) : messages.map(message => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] rounded-3xl px-4 py-3 shadow-sm border ${message.role === 'user'
                    ? 'bg-cyan-500 text-white border-cyan-400 rounded-br-lg'
                    : message.role === 'system'
                      ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-900/60 rounded-bl-lg'
                      : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700 rounded-bl-lg'}`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className={`text-xs font-black uppercase ${message.role === 'user' ? 'text-white/70' : 'text-slate-400'}`}>{message.role}</span>
                      {message.meta && <span className={`text-[11px] ${message.role === 'user' ? 'text-white/60' : 'text-slate-400'}`}>{message.meta}</span>}
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-6">{message.content}</div>
                    {message.role !== 'user' && <button onClick={() => copyText(message.content, '消息已复制')} className="mt-3 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-500"><Icons.Copy className="w-3 h-3" />复制</button>}
                  </div>
                </div>
              ))}
              {running && <div className="flex justify-start"><div className="rounded-3xl rounded-bl-lg px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-slate-500 dark:text-slate-300 text-sm"><Icons.RefreshCw className="w-4 h-4 inline mr-2 animate-spin" />模型正在生成结果...</div></div>}
              <div ref={bottomRef} />
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="mb-3 flex flex-wrap gap-2">
                {quickInputs.map(item => <button key={item} onClick={() => setUserInput(item)} className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-500 dark:text-slate-300 hover:bg-cyan-50 hover:text-cyan-600 dark:hover:bg-cyan-950/40">{item}</button>)}
              </div>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-2 focus-within:ring-2 focus-within:ring-cyan-500/40">
                <textarea value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder="输入这次实验要喂给 Prompt 的变量、素材或任务..." className="w-full min-h-[100px] resize-none bg-transparent p-3 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none" />
                <div className="flex items-center justify-between px-2 pb-1">
                  <button onClick={resetChat} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">清空会话</button>
                  <Button size="sm" onClick={runExperiment} disabled={running || !userInput.trim()} className="bg-cyan-500 hover:bg-cyan-600"><Icons.Send className="w-3 h-3 mr-2" />发送</Button>
                </div>
              </div>
            </div>
          </main>

          <aside className="space-y-4 xl:sticky xl:top-24 h-fit">
            <section className="rounded-[1.75rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="font-black text-slate-900 dark:text-white flex items-center gap-2"><Icons.Code className="w-4 h-4 text-cyan-500" />系统提示词</div>
                {prompt && <Badge>{categoryLabels[prompt.category] || prompt.category}</Badge>}
              </div>
              <div className="p-4 space-y-3">
                <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className="w-full h-64 resize-none rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-cyan-500/40" placeholder="在这里编辑系统提示词..." />
                <div className="grid grid-cols-2 gap-2"><Button variant="outline" size="sm" onClick={() => prompt && setSystemPrompt(prompt.content)} disabled={!prompt}>恢复原文</Button><Button variant="outline" size="sm" onClick={() => copyText(systemPrompt, '系统提示词已复制')}>复制</Button></div>
              </div>
            </section>

            <section className="rounded-[1.75rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 font-black text-slate-900 dark:text-white flex items-center gap-2"><Icons.Settings className="w-4 h-4 text-cyan-500" />运行参数</div>
              <div className="p-4 space-y-5">
                <label className="block"><div className="mb-2 flex justify-between text-sm text-slate-600 dark:text-slate-300"><span>Temperature</span><b>{temperature.toFixed(1)}</b></div><input type="range" min="0" max="1.5" step="0.1" value={temperature} onChange={e => setTemperature(Number(e.target.value))} className="w-full accent-cyan-500" /></label>
                <label className="block"><div className="mb-2 flex justify-between text-sm text-slate-600 dark:text-slate-300"><span>Max Tokens</span><b>{maxTokens}</b></div><input type="range" min="300" max="3000" step="100" value={maxTokens} onChange={e => setMaxTokens(Number(e.target.value))} className="w-full accent-cyan-500" /></label>
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3"><div className="mb-2 text-xs font-black uppercase text-slate-400">最终发送预览</div><div className="max-h-44 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-5 text-slate-500 dark:text-slate-300">{fullPrompt || '等待输入...'}</div></div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default PromptLab;
