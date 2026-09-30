/**
 * 后台 AI 助手（Cherry Studio 风格）
 *
 * 与旧版的关键差异：思考过程与工具调用**绑定到消息轮次（Turn）**，
 * 而不是放在全局 state 里 —— 否则多轮对话时新一轮的思考会覆盖上一轮，
 * 且无法像聊天软件那样内联显示在回答上方。
 *
 * 2026-09-30 重写：会话搜索/重命名/时间分组、空状态引导、Enter 发送、
 * 停止生成、流式光标、工具卡片内联。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MarkdownContent from '../components/MarkdownContent';
import { Icons } from '../components/Icons';
import { useToast } from '../components/Toast';
import { errorText } from '../utils/errors';
import {
  AgentMessage,
  AgentSession,
  deleteAgentSession,
  getAgentSession,
  getAgentSessions,
  renameAgentSession,
  sendAgentMessageStream,
  AgentStreamEvent,
} from '../api/agent';

interface ToolEvent {
  id: string;
  name: string;
  arguments?: string;
  result?: any;
  kind?: 'skill' | 'tool';
}

/** 一轮 = 用户提问 + 助手回答（含该轮的思考与工具调用） */
interface Turn {
  key: string;
  user: string;
  answer: string;
  thinking: string;
  tools: ToolEvent[];
  streaming: boolean;
  error?: string;
  at: number;
}

/** Skill 友好名称映射（与 registry 里的 schema 名对应） */
const SKILL_LABELS: Record<string, string> = {
  get_site_overview: '站点概览',
  get_daily_stats: '每日统计',
  get_popular_articles: '热门文章',
  search_articles: '搜索文章',
  get_article_detail: '文章详情',
  manage_article: '文章管理',
  list_pending_comments: '待审评论',
  manage_comment: '评论管理',
  list_subscribers: '订阅者列表',
};

const SKILL_NAME_SET = new Set(Object.keys(SKILL_LABELS));

const EMPTY_STARTERS = [
  '这个博客现在有多少篇文章、多少条评论？',
  '看看最近 7 天的访问量趋势',
  '帮我找出待审核的评论',
  '有哪些订阅者已经很久没收到推送了？',
];

/** 会话按时间分组（Cherry Studio 侧栏的分组方式） */
const groupSessions = (sessions: AgentSession[]) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOf7 = new Date(startOfToday);
  startOf7.setDate(startOf7.getDate() - 6);

  const groups: { label: string; items: AgentSession[] }[] = [
    { label: '今天', items: [] },
    { label: '昨天', items: [] },
    { label: '近 7 天', items: [] },
    { label: '更早', items: [] },
  ];

  for (const s of sessions) {
    const t = new Date(s.updated_at || s.created_at).getTime();
    if (t >= startOfToday.getTime()) groups[0].items.push(s);
    else if (t >= startOfYesterday.getTime()) groups[1].items.push(s);
    else if (t >= startOf7.getTime()) groups[2].items.push(s);
    else groups[3].items.push(s);
  }
  return groups.filter((g) => g.items.length > 0);
};

const relTime = (iso?: string) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return new Date(iso).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
};

const AgentChat: React.FC = () => {
  const { showToast } = useToast();

  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [keyword, setKeyword] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingText, setRenamingText] = useState('');

  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return sessions;
    return sessions.filter(
      (s) => (s.title || '').toLowerCase().includes(kw) || s.id.toLowerCase().includes(kw)
    );
  }, [sessions, keyword]);
  const groups = useMemo(() => groupSessions(filtered), [filtered]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) || null,
    [sessions, activeId]
  );

  const scrollToBottom = useCallback((smooth = true) => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 240;
    if (!smooth || nearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    }
  }, []);

  useEffect(() => {
    scrollToBottom(true);
  }, [turns, scrollToBottom]);

  const refreshSessions = useCallback(async () => {
    const data = await getAgentSessions();
    setSessions(data);
    return data;
  }, []);

  /** 把后端保存的消息还原成 turns（thinking / tools / answer 按轮次归位） */
  const buildTurns = useCallback((messages: AgentMessage[]): Turn[] => {
    const out: Turn[] = [];
    const toolResult = new Map<string, { content: string; name: string }>();
    for (const m of messages) {
      if (m.role === 'tool' && m.tool_call_id) {
        toolResult.set(m.tool_call_id, { content: m.content || '', name: m.tool_name || '' });
      }
    }

    let current: Turn | null = null;
    for (const m of messages) {
      if (m.role === 'user') {
        current = {
          key: `u-${m.id}`,
          user: m.content || '',
          answer: '',
          thinking: '',
          tools: [],
          streaming: false,
          at: new Date(m.created_at).getTime(),
        };
        out.push(current);
        continue;
      }
      if (!current) continue;

      if (m.role === 'assistant') {
        const calls = Array.isArray(m.tool_calls) ? m.tool_calls : [];
        if (calls.length > 0) {
          // 工具调用轮：content 是思考，正文留给最后一轮
          current.thinking += m.content || '';
          for (const tc of calls) {
            const name = tc.function?.name || '';
            const id = tc.id || '';
            const res = toolResult.get(id);
            let parsed: any;
            if (res) {
              try {
                parsed = JSON.parse(res.content);
              } catch {
                parsed = res.content;
              }
            }
            current.tools.push({
              id,
              name,
              arguments: tc.function?.arguments,
              result: parsed,
              kind: SKILL_NAME_SET.has(name) ? 'skill' : 'tool',
            });
          }
        } else {
          current.answer = (current.answer || '') + (m.content || '');
        }
      }
    }
    return out;
  }, []);

  const loadSession = useCallback(
    async (id: string) => {
      try {
        const detail = await getAgentSession(id);
        setActiveId(detail.id);
        setTurns(buildTurns(detail.messages));
        requestAnimationFrame(() => scrollToBottom(false));
      } catch (error) {
        showToast(errorText(error, '加载会话失败'), 'error');
      }
    },
    [buildTurns, scrollToBottom, showToast]
  );

  // 初始：拉会话列表并自动选中最近一条
  useEffect(() => {
    (async () => {
      try {
        const data = await refreshSessions();
        if (data.length > 0) await loadSession(data[0].id);
      } catch (error) {
        showToast(errorText(error, '加载会话列表失败'), 'error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startNew = () => {
    abortRef.current?.abort();
    setActiveId(null);
    setTurns([]);
    setInput('');
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const updateTurn = (key: string, patch: Partial<Turn>) =>
    setTurns((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;

    const sessionId = activeId;
    const key = `tmp-${Date.now()}`;
    setInput('');
    setSending(true);
    setTurns((prev) => [
      ...prev,
      { key, user: content, answer: '', thinking: '', tools: [], streaming: true, at: Date.now() },
    ]);
    requestAnimationFrame(() => scrollToBottom(true));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await sendAgentMessageStream(
        sessionId,
        content,
        (event: AgentStreamEvent) => {
          switch (event.type) {
            case 'ready':
              // 新会话的首个 ready 会带回真实 id，替换临时会话绑定
              if (!sessionId && event.data?.session_id) {
                setActiveId(event.data.session_id as string);
              }
              break;
            case 'thinking':
              setTurns((prev) =>
                prev.map((t) =>
                  t.key === key ? { ...t, thinking: t.thinking + (event.data?.content || '') } : t
                )
              );
              break;
            case 'text':
              setTurns((prev) =>
                prev.map((t) =>
                  t.key === key ? { ...t, answer: t.answer + (event.data?.content || '') } : t
                )
              );
              break;
            case 'tool_start': {
              const item: ToolEvent = {
                id: event.data?.tool_call_id || Math.random().toString(36).slice(2),
                name: event.data?.name || 'tool',
                arguments: event.data?.arguments,
                kind: event.data?.kind || 'tool',
              };
              setTurns((prev) =>
                prev.map((t) => (t.key === key ? { ...t, tools: [...t.tools, item] } : t))
              );
              break;
            }
            case 'tool_result':
              setTurns((prev) =>
                prev.map((t) =>
                  t.key === key
                        ? {
                            ...t,
                            tools: t.tools.map((item) =>
                              item.id === event.data?.tool_call_id
                                ? { ...item, result: event.data?.result }
                                : item
                            ),
                          }
                        : t
                )
              );
              break;
            case 'error':
              updateTurn(key, { error: event.data?.message || 'Agent 调用失败' });
              break;
            case 'done': {
              updateTurn(key, { streaming: false });
              const sid = event.data?.session_id as string;
              refreshSessions().then(() => {
                if (sid) setActiveId(sid);
              });
              break;
            }
            default:
              break;
          }
        },
        controller.signal
      );
    } catch (error: any) {
      const aborted = controller.signal.aborted;
      updateTurn(key, {
        streaming: false,
        error: aborted ? '已停止' : errorText(error, '发送失败'),
      });
      if (!aborted) showToast(errorText(error, '发送失败'), 'error');
    } finally {
      abortRef.current = null;
      setSending(false);
      setTurns((prev) => prev.map((t) => (t.key === key ? { ...t, streaming: false } : t)));
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 发送，Shift+Enter 换行（Cherry Studio 的习惯）
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSend();
    }
  };

  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAgentSession(id);
      const data = await refreshSessions();
      showToast('会话已删除', 'success');
      if (activeId === id) {
        if (data.length > 0) await loadSession(data[0].id);
        else startNew();
      }
    } catch (error) {
      showToast(errorText(error, '删除失败'), 'error');
    }
  };

  const commitRename = async (id: string) => {
    const title = renamingText.trim();
    setRenamingId(null);
    if (!title) return;
    try {
      const updated = await renameAgentSession(id, title);
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated } : s)));
    } catch (error) {
      showToast(errorText(error, '重命名失败'), 'error');
    }
  };

  /* ------------------------------ 渲染片段 ------------------------------ */

  const renderToolCard = (tool: ToolEvent) => {
    const isSkill = tool.kind === 'skill';
    const label = isSkill ? SKILL_LABELS[tool.name] || tool.name : tool.name;
    const running = tool.result === undefined;
    return (
      <details
        key={tool.id}
        className={`group rounded-lg border text-xs overflow-hidden ${
          isSkill
            ? 'border-cyan-200 dark:border-cyan-800 bg-cyan-50/60 dark:bg-cyan-950/30'
            : 'border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30'
        }`}
      >
        <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none list-none hover:brightness-95 transition">
          <Icons.ChevronDown className="w-3.5 h-3.5 text-slate-400 transition-transform group-open:rotate-180" />
          <span
            className={`px-1.5 py-0.5 rounded font-semibold text-[10px] uppercase tracking-wide ${
              isSkill
                ? 'bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-300'
                : 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300'
            }`}
          >
            {isSkill ? '技能' : '工具'}
          </span>
          <span className="font-medium text-slate-700 dark:text-slate-200 truncate">{label}</span>
          {running ? (
            <span className="ml-auto text-slate-400 animate-pulse">执行中…</span>
          ) : (
            <span className="ml-auto text-emerald-500 shrink-0">✓</span>
          )}
        </summary>
        <div className="px-3 pb-2.5 space-y-2 border-t border-slate-200/60 dark:border-slate-700/60 pt-2">
          {tool.arguments && (
            <div>
              <div className="text-[10px] text-slate-400 mb-1">入参</div>
              <pre className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-100/70 dark:bg-slate-900/60 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
                {tool.arguments}
              </pre>
            </div>
          )}
          {tool.result !== undefined && (
            <div>
              <div className="text-[10px] text-slate-400 mb-1">结果</div>
              <pre className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-100/70 dark:bg-slate-900/60 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all max-h-60">
                {typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </details>
    );
  };

  const renderTurn = (turn: Turn) => (
    <div key={turn.key} className="space-y-3">
      {/* 用户消息：右对齐气泡 */}
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-cyan-600 text-white px-4 py-2.5 shadow-sm">
          <MarkdownContent
            compact
            allowCompactComponents
            allowHtml={false}
            className="text-sm [&_p]:m-0 [&_ul]:my-1 [&_ol]:my-1"
          >
            {turn.user}
          </MarkdownContent>
        </div>
      </div>

      {/* 助手消息：左侧带头像 */}
      <div className="flex gap-3">
        <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center">
          <Icons.Sparkles className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          {turn.tools.length > 0 && (
            <div className="space-y-1.5">
              {turn.tools.map(renderToolCard)}
            </div>
          )}

          {turn.thinking && (
            <details className="group rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none list-none text-xs text-slate-500 dark:text-slate-400 hover:brightness-95 transition">
                <Icons.ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
                <span>思考过程</span>
                <span className="ml-auto text-slate-400">{turn.thinking.length} 字</span>
              </summary>
              <div className="px-3 pb-2.5 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap border-t border-slate-200/60 dark:border-slate-700/60 pt-2">
                {turn.thinking}
              </div>
            </details>
          )}

          {turn.answer ? (
            <div className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
              <MarkdownContent allowHtml={false} className="!max-w-none">
                {turn.answer}
              </MarkdownContent>
              {turn.streaming && (
                <span className="inline-block w-1.5 h-4 bg-cyan-500 animate-pulse align-middle ml-0.5" />
              )}
            </div>
          ) : (
            turn.streaming && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce [animation-delay:300ms]" />
                正在思考
              </div>
            )
          )}

          {turn.error && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-600 dark:text-red-300">
              {turn.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  /* ------------------------------ 主渲染 ------------------------------ */

  return (
    <div className="h-[calc(100vh-80px)] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex">
      {/* ---------------- 左侧会话栏 ---------------- */}
      <aside className="w-64 shrink-0 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex flex-col">
        <div className="p-3 space-y-2 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={startNew}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium transition-colors shadow-sm"
          >
            <Icons.Plus className="w-4 h-4" />
            新建对话
          </button>
          <div className="relative">
            <Icons.Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索会话…"
              className="w-full pl-8 pr-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm outline-none focus:border-cyan-400 transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {groups.length === 0 && (
            <div className="text-center text-xs text-slate-400 py-8 px-2">
              {keyword ? '没有匹配的会话' : '还没有对话记录'}
            </div>
          )}
          {groups.map((group) => (
            <div key={group.label} className="mb-3">
              <div className="px-2 py-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((session) => {
                  const isActive = session.id === activeId;
                  return (
                    <div
                      key={session.id}
                      className={`group relative rounded-lg transition-colors ${
                        isActive
                          ? 'bg-cyan-100 dark:bg-cyan-900/40'
                          : 'hover:bg-slate-200/60 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      {renamingId === session.id ? (
                        <input
                          autoFocus
                          value={renamingText}
                          onChange={(e) => setRenamingText(e.target.value)}
                          onBlur={() => void commitRename(session.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void commitRename(session.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          className="w-full px-2 py-2 text-sm bg-white dark:bg-slate-900 rounded-lg border border-cyan-400 outline-none"
                        />
                      ) : (
                        <>
                          <button
                            onClick={() => void loadSession(session.id)}
                            className="w-full text-left px-2 py-2 block"
                          >
                            <div className="text-sm text-slate-800 dark:text-slate-100 truncate pr-12">
                              {session.title || '新对话'}
                            </div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                              {relTime(session.updated_at || session.created_at)}
                              {session.message_count ? ` · ${session.message_count} 条` : ''}
                            </div>
                          </button>
                          {/* hover 操作 */}
                          <div className="absolute right-1.5 top-1.5 hidden group-hover:flex items-center gap-0.5">
                            <button
                              onClick={() => {
                                setRenamingId(session.id);
                                setRenamingText(session.title || '');
                              }}
                              title="重命名"
                              className="p-1 rounded text-slate-400 hover:text-cyan-600 hover:bg-white dark:hover:bg-slate-800 transition"
                            >
                              <Icons.Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => void handleDelete(session.id)}
                              title="删除"
                              className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-white dark:hover:bg-slate-800 transition"
                            >
                              <Icons.Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* ---------------- 右侧主区 ---------------- */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* 顶栏 */}
        <header className="h-14 px-4 flex items-center gap-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
          <Icons.Sparkles className="w-4 h-4 text-cyan-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
              {activeSession?.title || (turns.length ? '新对话' : 'AI 助手')}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500">
              {turns.length ? `${turns.length} 轮对话` : '站点管理助手'}
            </div>
          </div>
          {activeSession && (
            <button
              onClick={() => void handleDelete(activeSession.id)}
              title="删除当前会话"
              className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Icons.Trash2 className="w-4 h-4" />
            </button>
          )}
        </header>

        {/* 消息区 */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {turns.length === 0 ? (
            /* 空状态引导 */
            <div className="h-full flex flex-col items-center justify-center px-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg">
                <Icons.Sparkles className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1">
                今天想对站点做什么？
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md">
                我可以帮你查数据、审评论、管文章和订阅者。涉及写操作时我会先跟你确认。
              </p>
              <div className="grid sm:grid-cols-2 gap-2 max-w-xl w-full">
                {EMPTY_STARTERS.map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setInput(q);
                      requestAnimationFrame(() => textareaRef.current?.focus());
                    }}
                    className="text-left px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-cyan-400 hover:bg-cyan-50/50 dark:hover:bg-slate-700/50 transition-colors text-sm text-slate-600 dark:text-slate-300"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="px-4 py-5 space-y-6 max-w-4xl mx-auto">{turns.map(renderTurn)}</div>
          )}
        </div>

        {/* 输入区 */}
        <div className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 shrink-0">
          <div className="max-w-4xl mx-auto">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus-within:border-cyan-400 transition-colors">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  autoGrow(e.target);
                }}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="问点什么…（Enter 发送，Shift+Enter 换行）"
                className="w-full px-4 py-3 bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none resize-none max-h-[200px]"
              />
              <div className="flex items-center justify-between px-2 pb-2">
                <span className="text-[11px] text-slate-400 pl-2">
                  助手可能出错，删除/修改类操作请确认后再执行
                </span>
                {sending ? (
                  <button
                    onClick={stop}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors"
                  >
                    <span className="w-2 h-2 rounded-sm bg-current" />
                    停止生成
                  </button>
                ) : (
                  <button
                    onClick={() => void handleSend()}
                    disabled={!input.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
                  >
                    发送
                    <Icons.Send className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AgentChat;
