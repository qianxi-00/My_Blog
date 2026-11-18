import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Textarea } from '../components/Shared';
import { DetailSkeleton } from '../components/Skeleton';
import { Icons } from '../components/Icons';
import Avatar from '../components/Avatar';
import { getPrompt, likePrompt, Prompt, recordPromptUsage } from '../api/prompts';
import { getBookmarkStatus, toggleBookmark } from '../api/users';
import { PromptLabResponse, runPromptLab } from '../api/chat';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { copyToClipboard } from '../utils/helpers';
import { errorText } from '../utils/errors';

const categoryLabels: Record<string, string> = {
  Dev: '开发',
  Writing: '写作',
  Business: '商业',
  Academic: '学术',
  Thinking: '思维',
  Growth: '成长',
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
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();

  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [loading, setLoading] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [liked, setLiked] = useState(false);
  const [labInput, setLabInput] = useState('');
  const [labResult, setLabResult] = useState<PromptLabResponse | null>(null);
  const [labLoading, setLabLoading] = useState(false);

  useEffect(() => {
    const fetchPrompt = async () => {
      if (!Number.isFinite(promptId)) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await getPrompt(promptId);
        setPrompt(data);
        setLiked(localStorage.getItem(`liked_prompt_${data.id}`) === 'true');
      } catch (e: any) {
        showToast(errorText(e, 'Prompt 加载失败'), 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchPrompt();
  }, [promptId, showToast]);

  useEffect(() => {
    let alive = true;
    if (!Number.isFinite(promptId) || !isAuthenticated) {
      setBookmarked(false);
      return;
    }
    getBookmarkStatus('prompt', promptId)
      .then((res) => {
        if (alive) setBookmarked(Boolean(res.bookmarked));
      })
      .catch(() => {
        // ignore
      });
    return () => {
      alive = false;
    };
  }, [promptId, isAuthenticated]);

  const handleToggleBookmark = async () => {
    if (!prompt) return;
    if (!isAuthenticated) {
      showToast('收藏需要先登录', 'info');
      navigate(`/login?redirect=${encodeURIComponent(`/prompts/${prompt.id}`)}`);
      return;
    }
    if (bookmarkLoading) return;
    setBookmarkLoading(true);
    try {
      const res = await toggleBookmark('prompt', prompt.id);
      setBookmarked(res.bookmarked);
      showToast(res.bookmarked ? '已加入收藏' : '已取消收藏', 'success');
    } catch (e: any) {
      showToast(errorText(e, '收藏操作失败'), 'error');
    } finally {
      setBookmarkLoading(false);
    }
  };

  const handleCopyPrompt = async () => {
    if (!prompt) return;
    const ok = await copyToClipboard(prompt.content);
    if (!ok) {
      showToast('复制失败，请手动复制', 'error');
      return;
    }
    setCopySuccess(true);
    showToast('Prompt 已复制到剪贴板', 'success');
    window.setTimeout(() => setCopySuccess(false), 1800);
    try {
      await recordPromptUsage(prompt.id);
      setPrompt((prev) => (prev ? { ...prev, use_count: prev.use_count + 1 } : prev));
    } catch {
      // ignore usage record
    }
  };

  const handleLike = async () => {
    if (!prompt) return;
    const key = `liked_prompt_${prompt.id}`;
    if (localStorage.getItem(key) === 'true') {
      showToast('已经点过赞了', 'info');
      return;
    }
    try {
      const res = await likePrompt(prompt.id);
      localStorage.setItem(key, 'true');
      setLiked(true);
      setPrompt((prev) => (prev ? { ...prev, like_count: res.like_count } : prev));
      showToast('已点赞', 'success');
    } catch (e: any) {
      showToast(errorText(e, '点赞失败'), 'error');
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
      showToast(errorText(e, '运行失败'), 'error');
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
      <div className="max-w-3xl mx-auto px-4 py-16">
        <EmptyState
          icon={<Icons.Terminal className="w-5 h-5" />}
          title="无效的 Prompt ID"
          description="请返回提示词工程库重新选择指令。"
          action={
            <Link to="/prompts">
              <Button size="sm" variant="secondary">
                返回提示词库
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (loading) {
    return <DetailSkeleton />;
  }

  if (!prompt) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <EmptyState
          icon={<Icons.Terminal className="w-5 h-5" />}
          title="Prompt 不存在或尚未审核"
          description="该指令可能仍在审核中或已被原作者撤回。"
          action={
            <Link to="/prompts">
              <Button size="sm" variant="secondary">
                返回提示词库
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const authorName = prompt.author?.display_name || prompt.author?.username || prompt.submitted_by || '匿名贡献者';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/prompts'))}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 group transition-colors mb-6 cursor-pointer"
      >
        <Icons.ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" /> 返回提示词库
      </button>

      {/* 极简页头卡片 */}
      <section className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-6 md:p-8 mb-6 fade-up">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color="primary">{categoryLabels[prompt.category] || prompt.category}</Badge>
              {qualityTips.map((tip) => (
                <Badge key={tip} color="slate">
                  {tip}
                </Badge>
              ))}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-snug">
              {prompt.title}
            </h1>

            {prompt.description && (
              <p className="max-w-3xl text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                {prompt.description}
              </p>
            )}

            <div className="pt-1 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {prompt.author?.username ? (
                <Link
                  to={`/user/${encodeURIComponent(prompt.author.username)}`}
                  className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200 hover:text-primary-600 dark:hover:text-primary-400 font-medium transition-colors"
                >
                  <Avatar name={authorName} className="w-5 h-5 text-[10px]" />
                  <span>{authorName}</span>
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <Avatar name={authorName} className="w-5 h-5 text-[10px]" />
                  <span>{authorName}</span>
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Icons.Copy className="w-3.5 h-3.5" /> 使用 {prompt.use_count || 0}
              </span>
              <span className="inline-flex items-center gap-1">
                <Icons.Heart className={`w-3.5 h-3.5 ${liked ? 'fill-red-500 text-red-500' : ''}`} /> 点赞 {prompt.like_count || 0}
              </span>
              <span className="inline-flex items-center gap-1">
                <Icons.Calendar className="w-3.5 h-3.5" /> 创建于 {formatDate(prompt.created_at)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap lg:flex-col gap-2 shrink-0">
            <Button onClick={handleCopyPrompt} variant={copySuccess ? 'primary' : 'secondary'}>
              {copySuccess ? <Icons.Check className="w-3.5 h-3.5" /> : <Icons.Copy className="w-3.5 h-3.5" />}
              {copySuccess ? '已复制' : '复制 Prompt'}
            </Button>
            <Button
              variant="outline"
              onClick={handleToggleBookmark}
              disabled={bookmarkLoading}
              className={
                bookmarked
                  ? 'border-primary-300 dark:border-primary-700 bg-primary-50/70 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300'
                  : ''
              }
            >
              <Icons.Bookmark className={`w-3.5 h-3.5 ${bookmarked ? 'fill-current' : ''}`} />
              {bookmarked ? '已收藏' : '收藏'}
            </Button>
            <Button
              variant="outline"
              onClick={handleLike}
              className={liked ? 'text-red-500 border-red-200 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/30' : ''}
            >
              <Icons.Heart className={`w-3.5 h-3.5 ${liked ? 'fill-current like-pop' : ''}`} />
              {liked ? '已赞' : '点赞'}
            </Button>
          </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        <Card className="p-6 md:p-7">
          <div className="flex items-center justify-between gap-4 pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Prompt 正文模板
            </h2>
            <button
              type="button"
              onClick={handleCopyPrompt}
              className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <Icons.Copy className="w-3.5 h-3.5" /> 复制全部
            </button>
          </div>
          <pre className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 p-4 text-sm leading-7 text-slate-800 dark:text-slate-200 font-mono">
            {prompt.content}
          </pre>
        </Card>

        <div className="space-y-4 sticky top-24">
          <Card className="overflow-hidden">
            <div className="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 px-4 py-3 flex items-center gap-2">
              <Icons.Terminal className="w-4 h-4 text-primary-500" />
              <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">详情页实验室</span>
            </div>
            <div className="p-4 space-y-3">
              <Textarea
                value={labInput}
                onChange={(e) => setLabInput(e.target.value.slice(0, 2000))}
                className="h-32 resize-none"
                placeholder="输入测试变量或上下文，直接用此 Prompt 试跑..."
              />
              <Button className="w-full" onClick={runLab} disabled={labLoading}>
                <Icons.Send className="w-3.5 h-3.5" />
                {labLoading ? '运行中...' : '开始运行'}
              </Button>
              {labResult && (
                <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 rounded-lg p-3.5">
                  <div className="flex items-center justify-between mb-2">
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
                  <div className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap max-h-72 overflow-y-auto leading-relaxed">
                    {labResult.result}
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 tabular-nums">
                    Tokens: {labResult.total_tokens}
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 mb-2">
              <Icons.CheckCircle2 className="w-3.5 h-3.5 text-primary-500" /> 使用建议
            </div>
            <ul className="space-y-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              <li>&bull; 先复制模板，再替换变量位与业务上下文</li>
              <li>&bull; 复杂推理任务建议补充 1–2 个输入/输出示例</li>
              <li>&bull; 需要结构化结果时明确指定 JSON 或 Markdown 表格</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PromptDetail;
