import React, { useEffect, useMemo, useRef, useState } from 'react';
import MarkdownContent from '../components/MarkdownContent';
import { Icons } from '../components/Icons';
import { useToast } from '../components/Toast';
import {
  AgentMessage,
  AgentSession,
  deleteAgentSession,
  getAgentSession,
  getAgentSessions,
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

/** Skill 友好名称映射 */
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

const AgentChat: React.FC = () => {
  const { showToast } = useToast();
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  const [thinkingContent, setThinkingContent] = useState('');
  const [skillEvents, setSkillEvents] = useState<ToolEvent[]>([]);
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [finalContent, setFinalContent] = useState('');

  const [isThinkingOpen, setIsThinkingOpen] = useState(false);
  const [isSkillOpen, setIsSkillOpen] = useState(false);
  const [isToolOpen, setIsToolOpen] = useState(false);
  const [isFinalOpen, setIsFinalOpen] = useState(true);

  const listRef = useRef<HTMLDivElement | null>(null);

  const activeSession = useMemo(
    () => sessions.find((item) => item.id === activeSessionId) || null,
    [sessions, activeSessionId]
  );

  const scrollToBottom = () => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  };

  const refreshSessions = async () => {
    const data = await getAgentSessions();
    setSessions(data);
    return data;
  };

  /** 已知 Skill 名称集合，用于区分 skill / tool */
  const SKILL_NAME_SET = new Set([
    'get_site_overview', 'get_daily_stats', 'get_popular_articles',
    'search_articles', 'get_article_detail', 'manage_article',
    'list_pending_comments', 'manage_comment', 'list_subscribers',
  ]);

  const loadSession = async (sessionId: string) => {
    const detail = await getAgentSession(sessionId);
    setActiveSessionId(detail.id);
    setMessages(detail.messages);

    // ---------- 从保存的消息中重建 thinking / skill / tool / final ----------
    let restoredThinking = '';
    const restoredSkills: ToolEvent[] = [];
    const restoredTools: ToolEvent[] = [];
    let restoredFinal = '';

    // 建一个 tool_call_id → tool result content 的映射
    const toolResultMap: Record<string, { content: string; name: string }> = {};
    for (const msg of detail.messages) {
      if (msg.role === 'tool' && msg.tool_call_id) {
        toolResultMap[msg.tool_call_id] = {
          content: msg.content || '',
          name: msg.tool_name || '',
        };
      }
    }

    for (const msg of detail.messages) {
      if (msg.role === 'assistant') {
        if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
          // 这是一个工具调用轮的 assistant 消息，content 就是 thinking
          if (msg.content) {
            restoredThinking += msg.content;
          }
          // 从 tool_calls 重建 ToolEvent
          for (const tc of msg.tool_calls) {
            const fnName = tc.function?.name || '';
            const isSkill = SKILL_NAME_SET.has(fnName);
            const callId = tc.id || '';
            const resultInfo = toolResultMap[callId];
            let parsedResult: any = undefined;
            if (resultInfo) {
              try { parsedResult = JSON.parse(resultInfo.content); } catch { parsedResult = resultInfo.content; }
            }
            const ev: ToolEvent = {
              id: callId,
              name: fnName,
              arguments: tc.function?.arguments,
              result: parsedResult,
              kind: isSkill ? 'skill' : 'tool',
            };
            if (isSkill) {
              restoredSkills.push(ev);
            } else {
              restoredTools.push(ev);
            }
          }
        } else if (msg.content) {
          // 没有 tool_calls 的 assistant 消息 = 最终回复
          restoredFinal = msg.content;
        }
      }
    }

    setThinkingContent(restoredThinking);
    setSkillEvents(restoredSkills);
    setToolEvents(restoredTools);
    setFinalContent(restoredFinal);

    setIsThinkingOpen(false);
    setIsSkillOpen(false);
    setIsToolOpen(false);
    setIsFinalOpen(true);

    setTimeout(scrollToBottom, 0);
  };

  useEffect(() => {
    const init = async () => {
      try {
        const data = await refreshSessions();
        if (data.length > 0) {
          await loadSession(data[0].id);
        }
      } catch (error: any) {
        showToast(error?.message || '加载会话失败', 'error');
      }
    };
    init();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, thinkingContent, skillEvents, toolEvents, finalContent]);

  const createNewSession = () => {
    setActiveSessionId(null);
    setMessages([]);
    setInput('');

    setThinkingContent('');
    setSkillEvents([]);
    setToolEvents([]);
    setFinalContent('');

    setIsThinkingOpen(false);
    setIsSkillOpen(false);
    setIsToolOpen(false);
    setIsFinalOpen(true);
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteAgentSession(sessionId);
      const data = await refreshSessions();
      if (activeSessionId === sessionId) {
        if (data.length > 0) {
          await loadSession(data[0].id);
        } else {
          createNewSession();
        }
      }
      showToast('会话已删除', 'success');
    } catch (error: any) {
      showToast(error?.message || '删除失败', 'error');
    }
  };

  const updateByStreamEvent = async (event: AgentStreamEvent, tempAssistantId: number) => {
    if (event.type === 'ready') {
      return;
    }

    if (event.type === 'thinking') {
      const chunk = event.data?.content || '';
      setThinkingContent((prev) => prev + chunk);
      return;
    }

    if (event.type === 'text') {
      const chunk = event.data?.content || '';
      setFinalContent((prev) => prev + chunk);
      setMessages((prev) =>
        prev.map((msg) => (msg.id === tempAssistantId ? { ...msg, content: (msg.content || '') + chunk } : msg))
      );

      setIsThinkingOpen(false);
      setIsSkillOpen(false);
      setIsToolOpen(false);
      setIsFinalOpen(true);

      return;
    }

    if (event.type === 'tool_start') {
      const item: ToolEvent = {
        id: event.data?.tool_call_id,
        name: event.data?.name,
        arguments: event.data?.arguments,
        kind: event.data?.kind || 'tool',
      };

      if (item.kind === 'skill') {
        setSkillEvents((prev) => [...prev, item]);
      } else {
        setToolEvents((prev) => [...prev, item]);
      }

      return;
    }

    if (event.type === 'tool_result') {
      const updater = (list: ToolEvent[]) =>
        list.map((item) =>
          item.id === event.data?.tool_call_id
            ? {
                ...item,
                result: event.data?.result,
              }
            : item
        );

      if (event.data?.kind === 'skill') {
        setSkillEvents((prev) => updater(prev));
      } else {
        setToolEvents((prev) => updater(prev));
      }

      return;
    }

    if (event.type === 'error') {
      showToast(event.data?.message || 'Agent 调用失败', 'error');
      return;
    }

    if (event.type === 'done') {
      const sid = event.data?.session_id as string;
      await refreshSessions();
      if (sid) {
        await loadSession(sid);
      }
    }
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content || isSending) return;

    setIsSending(true);
    setInput('');

    setThinkingContent('');
    setSkillEvents([]);
    setToolEvents([]);
    setFinalContent('');

    setIsThinkingOpen(true);
    setIsSkillOpen(true);
    setIsToolOpen(true);
    setIsFinalOpen(false);

    const now = new Date().toISOString();
    const tempUserId = Date.now();
    const tempAssistantId = tempUserId + 1;

    const userMessage: AgentMessage = {
      id: tempUserId,
      session_id: activeSessionId || 'temp',
      role: 'user',
      content,
      created_at: now,
    };

    const assistantMessage: AgentMessage = {
      id: tempAssistantId,
      session_id: activeSessionId || 'temp',
      role: 'assistant',
      content: '',
      created_at: now,
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    try {
      await sendAgentMessageStream(activeSessionId, content, (event) => {
        void updateByStreamEvent(event, tempAssistantId);
      });
    } catch (error: any) {
      showToast(error?.message || '发送失败', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleSend();
    }
  };

  const renderToolBlock = (tool: ToolEvent) => {
    const isSkill = tool.kind === 'skill';
    const label = isSkill ? (SKILL_LABELS[tool.name] || tool.name) : tool.name;
    const borderClass = isSkill
      ? 'border-emerald-200 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-900/20'
      : 'border-indigo-200 dark:border-indigo-700 bg-indigo-50/60 dark:bg-indigo-900/20';
    const labelClass = isSkill
      ? 'text-emerald-700 dark:text-emerald-300'
      : 'text-indigo-700 dark:text-indigo-300';
    const tagClass = isSkill
      ? 'bg-emerald-100 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-200'
      : 'bg-indigo-100 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-200';

    return (
      <div key={tool.id} className={`rounded-xl border ${borderClass} p-3`}>
        <div className={`text-xs font-semibold ${labelClass} flex items-center gap-2 mb-2`}>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${tagClass}`}>
            {isSkill ? 'Skill' : 'Tool'}
          </span>
          {isSkill ? `执行技能：${label}` : `执行工具：${label}`}
          {!tool.result && <span className="ml-1 animate-pulse">⏳</span>}
          {tool.result && <span className="ml-1">✅</span>}
        </div>
        <div className="space-y-2">
          {tool.arguments && (
            <MarkdownContent
              compact
              allowCompactComponents
              allowHtml={false}
              className="text-xs text-slate-700 dark:text-slate-200 [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap"
            >
              {tool.arguments}
            </MarkdownContent>
          )}
          {tool.result && (
            <MarkdownContent
              compact
              allowCompactComponents
              allowHtml={false}
              className="text-xs text-slate-700 dark:text-slate-200 [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap"
            >
              {JSON.stringify(tool.result, null, 2)}
            </MarkdownContent>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-[calc(100vh-80px)] bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex">
      <aside className="w-64 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={createNewSession}
            className="w-full px-3 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-semibold transition-colors"
          >
            新对话
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`group rounded-xl p-2 cursor-pointer transition-colors ${
                activeSessionId === session.id
                  ? 'bg-cyan-50 dark:bg-cyan-900/30'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  onClick={() => void loadSession(session.id)}
                  className="flex-1 text-left"
                >
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    {session.title || '新对话'}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {new Date(session.updated_at || session.created_at).toLocaleString()}
                  </div>
                </button>
                <button
                  onClick={() => void handleDeleteSession(session.id)}
                  className="opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:text-red-600"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 px-4 flex items-center border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <Icons.Sparkles className="w-4 h-4 text-cyan-500 mr-2" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {activeSession?.title || 'AI 助手'}
          </span>
        </header>

        <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center text-slate-500 dark:text-slate-400 text-sm">
              开始一个新对话，让 AI 帮你管理博客。
            </div>
          )}

          {messages
            .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
            .map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-cyan-500 text-white'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2 text-xs opacity-80">
                    {msg.role === 'user' ? (
                      <>
                        <Icons.User className="w-3.5 h-3.5" />
                        <span>你</span>
                      </>
                    ) : (
                      <>
                        <Icons.Sparkles className="w-3.5 h-3.5" />
                        <span>AI 助手</span>
                      </>
                    )}
                  </div>
                  {msg.role === 'assistant' ? (
                      <MarkdownContent
                        compact
                        allowCompactComponents
                        allowHtml={false}
                        className="text-sm text-slate-700 dark:text-slate-200 [&_ol]:ml-4 [&_ul]:ml-4 [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap"
                      >
                        {msg.content || ''}
                      </MarkdownContent>
                  ) : (
                    <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                  )}
                </div>
              </div>
            ))}

          {(isSending || thinkingContent || skillEvents.length > 0 || toolEvents.length > 0 || finalContent) && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse"></span>
                <span>AI 回复中</span>
              </div>
              <details open={isThinkingOpen} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/20 p-3">
                <summary
                  className="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-between"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsThinkingOpen((v) => !v);
                  }}
                >
                  <span>模型思考</span>
                  <span className="text-slate-400">{isThinkingOpen ? '收起' : '展开'}</span>
                </summary>
                {isThinkingOpen && (
                  <div className="mt-2">
                    {thinkingContent ? (
                      <MarkdownContent
                        compact
                        allowCompactComponents
                        allowHtml={false}
                        className="text-xs text-slate-700 dark:text-slate-200"
                      >
                        {thinkingContent}
                      </MarkdownContent>
                    ) : (
                      <div className="text-xs text-slate-400">暂无思考内容</div>
                    )}
                  </div>
                )}
              </details>

              <details open={isSkillOpen} className="rounded-xl border border-emerald-200 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-900/20 p-3">
                <summary
                  className="cursor-pointer text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center justify-between"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsSkillOpen((v) => !v);
                  }}
                >
                  <span>Skill 调用（{skillEvents.length}）</span>
                  <span className="text-emerald-500">{isSkillOpen ? '收起' : '展开'}</span>
                </summary>
                {isSkillOpen && (
                  <div className="mt-2 space-y-2">
                    {skillEvents.length > 0 ? skillEvents.map(renderToolBlock) : <div className="text-xs text-emerald-500">暂无 Skill 调用</div>}
                  </div>
                )}
              </details>

              <details open={isToolOpen} className="rounded-xl border border-indigo-200 dark:border-indigo-700 bg-indigo-50/60 dark:bg-indigo-900/20 p-3">
                <summary
                  className="cursor-pointer text-xs font-semibold text-indigo-700 dark:text-indigo-300 flex items-center justify-between"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsToolOpen((v) => !v);
                  }}
                >
                  <span>工具调用（{toolEvents.length}）</span>
                  <span className="text-indigo-500">{isToolOpen ? '收起' : '展开'}</span>
                </summary>
                {isToolOpen && (
                  <div className="mt-2 space-y-2">
                    {toolEvents.length > 0 ? toolEvents.map(renderToolBlock) : <div className="text-xs text-indigo-500">暂无工具调用</div>}
                  </div>
                )}
              </details>

              <details open={isFinalOpen} className="rounded-xl border border-cyan-200 dark:border-cyan-700 bg-cyan-50/60 dark:bg-cyan-900/20 p-3">
                <summary
                  className="cursor-pointer text-xs font-semibold text-cyan-700 dark:text-cyan-300 flex items-center justify-between"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsFinalOpen((v) => !v);
                  }}
                >
                  <span>最终回复</span>
                  <span className="text-cyan-500">{isFinalOpen ? '收起' : '展开'}</span>
                </summary>
                {isFinalOpen && (
                  <div className="mt-2">
                    {finalContent ? (
                      <MarkdownContent
                        compact
                        allowCompactComponents
                        allowHtml={false}
                        className="text-sm text-slate-700 dark:text-slate-200 [&_ol]:ml-4 [&_ul]:ml-4 [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap"
                      >
                        {finalContent}
                      </MarkdownContent>
                    ) : (
                      <div className="text-xs text-cyan-500">最终回复生成中...</div>
                    )}
                  </div>
                )}

                <div className="mt-3 rounded-lg border border-cyan-100 dark:border-cyan-800 bg-cyan-50/40 dark:bg-cyan-900/30 px-3 py-2 text-xs text-cyan-700 dark:text-cyan-200">
                  <span className="font-semibold">提示：</span>
                  最终回复支持 Markdown 渲染，代码块/表格/链接会自动格式化显示。
                </div>
              </details>
            </div>
          )}
        </div>

        <footer className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="flex gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="输入你的管理需求，例如：帮我查最近 7 天访问量最高的 5 篇文章"
              rows={3}
              className="flex-1 resize-none rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              disabled={isSending}
            />
            <button
              onClick={() => void handleSend()}
              disabled={isSending || !input.trim()}
              className="self-end h-11 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white font-semibold text-sm transition-colors flex items-center gap-2"
            >
              <Icons.Send className="w-4 h-4" />
              {isSending ? '发送中...' : '发送'}
            </button>
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">Ctrl + Enter 发送</div>
        </footer>
      </main>
    </div>
  );
};

export default AgentChat;
