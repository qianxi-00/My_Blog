/**
 * 后台 AI 助手（Cherry Studio 风格）
 *
 * 与旧版的关键差异：思考过程与工具调用**绑定到消息轮次（Turn）**，
 * 而不是放在全局 state 里 —— 否则多轮对话时新一轮的思考会覆盖上一轮，
 * 且无法像聊天软件那样内联显示在回答上方。
 *
 * 2026-09-30 重写：会话搜索/重命名/时间分组、空状态引导、Enter 发送、
 * 停止生成、流式光标、工具卡片内联。
 * 2026-09-30 二次美化：消息排版（标题/列表/表格/代码/引用）改为助手专用样式，
 * 工具结果不再直出裸 JSON，而是「关键指标 + 条数」摘要、原始数据收进折叠区。
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
  update_daily_stats: '更新统计',
  search_articles: '搜索文章',
  get_article_detail: '文章详情',
  manage_article: '文章管理',
  list_pending_articles: '待审投稿',
  review_article: '投稿审核',
  generate_article_summary: '生成摘要',
  generate_article_intro: '生成导读卡',
  fix_article_read_time: '重算阅读时长',
  get_categories: '分类列表',
  get_tags: '标签列表',
  get_archives: '归档列表',
  list_pending_comments: '待审评论',
  manage_comment: '评论管理',
  list_reported_comments: '被举报评论',
  reply_comment: '回复评论',
  manage_report: '举报处理',
  list_prompts: '提示词列表',
  manage_prompt: '提示词管理',
  list_subscribers: '订阅者列表',
  get_subscriber_stats: '订阅者统计',
  find_inactive_subscribers: '查找不活跃订阅者',
  manage_subscriber: '订阅者管理',
  freeze_subscribers: '批量冻结订阅',
  get_settings: '站点设置',
  update_settings: '修改设置',
  list_admins: '管理员列表',
  manage_admin: '管理员管理',
  get_user_stats: '用户统计',
  list_users: '用户列表',
  get_user_detail: '用户详情',
  manage_user: '用户管理',
  // 热点 / AI 日报
  list_hotspots: '日报列表',
  get_hotspot_meta: '日报统计',
  get_featured_hotspots: '精选日报',
  get_hotspot_detail: '日报详情',
  get_hotspot_sources: '日报来源',
  manage_hotspot: '日报管理',
  run_hotspot_fetch: '触发抓取日报',
  list_fetch_jobs: '抓取任务',
  // 论坛
  get_forum_categories: '论坛版块',
  list_forum_threads: '论坛主题',
  get_forum_thread: '主题详情',
  list_forum_posts: '论坛回帖',
  manage_forum_thread: '主题管理',
  manage_forum_post: '回帖管理',
  // 批量
  batch_review_comments: '批量审评论',
  batch_handle_reports: '批量处理举报',
  batch_update_articles: '批量改文章',
  batch_review_prompts: '批量审提示词',
};

const SKILL_NAME_SET = new Set(Object.keys(SKILL_LABELS));

/** 工具入参 / 统计指标的可读名（别把 article_id、today_views 这类内部字段直接甩给用户看） */
const ARG_LABELS: Record<string, string> = {
  // 入参
  article_id: '文章 ID',
  comment_id: '评论 ID',
  prompt_id: '提示词 ID',
  subscriber_id: '订阅者 ID',
  admin_id: '管理员 ID',
  keyword: '关键词',
  days: '天数',
  limit: '条数',
  page: '页码',
  page_size: '每页条数',
  status: '状态',
  title: '标题',
  slug: '别名',
  name: '名称',
  email: '邮箱',
  tags: '标签',
  category: '分类',
  summary: '摘要',
  reason: '原因',
  action: '操作',
  // 站点统计
  today_views: '今日访问',
  today_visitors: '今日访客',
  total_articles: '文章总数',
  total_comments: '评论总数',
  pending_comments: '待审评论',
  today_ai_calls: '今日 AI 调用',
  total_ai_calls: 'AI 调用累计',
  total_views: '访问总量',
  total_visitors: '访客总量',
  total_subscribers: '订阅总数',
  active_subscribers: '活跃订阅',
  total_users: '用户总数',
  pending_articles: '待发文章',
  published_articles: '已发文章',
  total_comments_pending: '待审评论',
  // 每日统计
  date: '日期',
  total_views_daily: '访问量',
  unique_visitors: '独立访客',
  article_views: '文章浏览',
  new_comments: '新增评论',
  ai_api_calls: 'AI 调用',
};

/** snake_case → 可读中文（找不到映射时的兜底，别直接把字段名甩给用户） */
const humanizeKey = (key: string): string => {
  if (ARG_LABELS[key]) return ARG_LABELS[key];
  const spaced = key.replace(/_/g, ' ').trim();
  // 纯数字/日期类字段名翻成人话
  if (/^\d+$/.test(key)) return '序号';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/**
 * 助手专用排版：不动通用 MarkdownContent（它服务全站文章页，改了会波及全站），
 * 这里只给消息区注入聊天场景的规则。
 * 关键取舍：代码块在亮色模式下也用深色底（Cherry Studio 就是这样，代码就该像代码），
 * 表格加斑马纹和横向滚动。
 */
const PROSE: string = [
  '[&>*]:first:mt-0 [&>*]:last:mb-0',
  'text-[14.5px] leading-[1.75] text-slate-700 dark:text-slate-200',
  '[&_p]:my-3',
  '[&_ul]:my-3 [&_ul]:pl-1 [&_li]:my-1.5 [&_li]:pl-1 [&_li]:list-disc',
  '[&_ol]:my-3 [&_ol]:pl-1 [&_ol]:list-decimal',
  '[&_ul>li::marker]:text-slate-400',
  '[&_li>p]:my-1',
  '[&_h1]:mt-6 [&_h1]:mb-2.5 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:text-slate-900 [&_h1]:dark:text-white',
  '[&_h2]:mt-6 [&_h2]:mb-2.5 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:dark:text-white',
  '[&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:text-slate-900 [&_h3]:dark:text-white',
  '[&_h4]:mt-4 [&_h4]:mb-1.5 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:text-slate-800 [&_h4]:dark:text-slate-100',
  '[&_code]:rounded-md [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px]',
  '[&_code]:font-mono [&_code]:text-rose-600 [&_code]:dark:text-rose-300',
  '[&_code]:before:content-none [&_code]:after:content-none',
  '[&_pre]:my-4 [&_pre]:rounded-xl [&_pre]:bg-[#0f172a] [&_pre]:p-4 [&_pre]:overflow-x-auto',
  '[&_pre]:text-[12.5px] [&_pre]:leading-relaxed [&_pre]:shadow-sm',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-slate-100 [&_pre_code]:text-[12.5px]',
  '[&_table]:my-4 [&_table]:w-full [&_table]:text-[13px] [&_table]:block [&_table]:overflow-x-auto',
  '[&_th]:px-3 [&_th]:py-2 [&_th]:bg-slate-100 [&_th]:dark:bg-slate-800',
  '[&_th]:font-semibold [&_th]:text-slate-700 [&_th]:dark:text-slate-200 [&_th]:text-left [&_th]:whitespace-nowrap',
  '[&_td]:px-3 [&_td]:py-2 [&_td]:border-t [&_td]:border-slate-100 [&_td]:dark:border-slate-800 [&_td]:whitespace-nowrap',
  '[&_tr:nth-child(even)]:bg-slate-50/70 [&_tr:nth-child(even)]:dark:bg-slate-800/40',
  '[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-cyan-400',
  '[&_blockquote]:pl-4 [&_blockquote]:text-slate-600 [&_blockquote]:dark:text-slate-400 [&_blockquote]:italic',
  '[&_blockquote_p]:my-1',
  '[&_hr]:my-5 [&_hr]:border-slate-200 [&_hr]:dark:border-slate-700',
  '[&_a]:text-cyan-600 [&_a]:dark:text-cyan-400 [&_a]:underline [&_a]:underline-offset-2',
  '[&_strong]:font-semibold [&_strong]:text-slate-900 [&_strong]:dark:text-slate-100',
  '[&_img]:my-4 [&_img]:rounded-xl',
].join(' ');

/** 统计对象里的记录条数 */
const countRows = (data: any): number | null => {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') {
    for (const key of ['items', 'list', 'records', 'results', 'rows', 'data']) {
      if (Array.isArray((data as any)[key])) return (data as any)[key].length;
    }
  }
  return null;
};

/** 挑出值得直接展示的标量指标（只展示数字/布尔，文字和 id 交给展开看） */
const pickHighlights = (data: any): { key: string; label: string; value: string }[] => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const out: { key: string; label: string; value: string }[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (out.length >= 6) break;
    if (typeof value === 'number' || typeof value === 'boolean') {
      out.push({ key, label: humanizeKey(key), value: String(value) });
    }
  }
  return out;
};

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

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label}已复制`, 'success');
    } catch {
      showToast('复制失败，请手动选中', 'error');
    }
  };

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

  /** 解析入参，失败就原样展示（不让坏 JSON 把卡片搞崩）；无参数的技能返回空对象不显示 */
  const parseArgs = (raw?: string): [Record<string, any>, string] => {
    if (!raw) return [{}, ''];
    try {
      const parsed = JSON.parse(raw);
      const obj = parsed && typeof parsed === 'object' ? parsed : { value: parsed };
      // `{}` 等于没传参，直接当作无参，别显示一个空花括号
      const empty = Object.keys(obj).length === 0;
      return [empty ? {} : obj, empty ? '' : raw];
    } catch {
      return [{}, raw];
    }
  };

  /**
   * 工具结果：成功时给人话摘要（关键指标 + 条数），原始 JSON 收进「原始数据」折叠区；
   * 失败时才把后端错误摊开，并把 127.0.0.1:7860 这类内部地址显示成「本机」。
   */
  const renderResult = (tool: ToolEvent) => {
    const result = tool.result;
    if (result === undefined) return null;

    if (typeof result === 'string') {
      return (
        <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words">
          {result}
        </p>
      );
    }

    const failed = result?.ok === false;
    const payload = !failed && result?.data !== undefined ? result.data : result;
    const rows = failed ? null : countRows(payload);
    const highlights = failed ? [] : pickHighlights(payload);

    if (failed) {
      const msg = result.message || result.detail || `HTTP ${result.status_code ?? '?'}`;
      return (
        <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3 py-2">
          <div className="text-xs font-medium text-red-700 dark:text-red-300">调用失败</div>
          <div className="mt-1 text-xs text-red-600/90 dark:text-red-400/90 break-words">
            {String(msg)}
          </div>
          {result.url && (
            <div className="mt-1 font-mono text-[11px] text-red-500/70 dark:text-red-400/60 break-all">
              {result.method} {String(result.url).replace(/^https?:\/\/127\.0\.0\.1:\d+/, '本机')}
            </div>
          )}
        </div>
      );
    }

    if (rows === null && !highlights.length) return null;

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {rows !== null && (
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-semibold text-slate-900 dark:text-white tabular-nums leading-none">
                {rows}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">条记录</span>
            </div>
          )}
          {highlights.map((h) => (
            <div key={h.key} className="flex items-baseline gap-1.5">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                {h.value}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">{h.label}</span>
            </div>
          ))}
        </div>
        <details className="group/raw">
          <summary className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer select-none list-none transition-colors">
            <Icons.ChevronRight className="w-3 h-3 transition-transform group-open/raw:rotate-90" />
            原始数据
          </summary>
          <pre className="mt-1.5 max-h-64 overflow-auto rounded-lg bg-slate-50 dark:bg-slate-900/70 p-3 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-all">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </details>
      </div>
    );
  };

  const renderToolCard = (tool: ToolEvent) => {
    const isSkill = tool.kind === 'skill';
    const label = isSkill ? SKILL_LABELS[tool.name] || tool.name : tool.name;
    const running = tool.result === undefined;
    const [args, rawArgs] = parseArgs(tool.arguments);
    const argEntries = Object.entries(args);
    const failed = !!tool.result && typeof tool.result === 'object' && tool.result.ok === false;

    const tone = failed
      ? 'border-red-200 dark:border-red-900/60'
      : isSkill
        ? 'border-cyan-200/70 dark:border-cyan-900/50'
        : 'border-violet-200/70 dark:border-violet-900/50';
    const chip = failed
      ? 'bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-300'
      : isSkill
        ? 'bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300'
        : 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300';

    return (
      <details
        key={tool.id}
        className={`group rounded-xl border ${tone} bg-white/60 dark:bg-slate-900/40 overflow-hidden`}
      >
        <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none list-none hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
          <Icons.ChevronRight className="w-3.5 h-3.5 text-slate-400 transition-transform group-open:rotate-90 shrink-0" />
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide ${chip}`}>
            {failed ? '失败' : isSkill ? '技能' : '工具'}
          </span>
          <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200 truncate">
            {label}
          </span>
          <span className="ml-auto shrink-0">
            {running ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                执行中
              </span>
            ) : failed ? (
              <span className="text-[11px] text-red-500">查看原因</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                <Icons.Check className="w-3.5 h-3.5" />
                完成
              </span>
            )}
          </span>
        </summary>
        <div className="px-3 pb-3 space-y-2.5 border-t border-slate-100 dark:border-slate-800">
          {argEntries.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2.5">
              {argEntries.map(([k, v]) => (
                <div key={k} className="flex items-baseline gap-1.5 text-[11px]">
                  <span className="text-slate-400 dark:text-slate-500">{humanizeKey(k)}</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300 break-all">
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {rawArgs && !argEntries.length && (
            <pre className="pt-2.5 text-[11px] text-slate-500 dark:text-slate-400 whitespace-pre-wrap break-all">
              {rawArgs}
            </pre>
          )}
          {renderResult(tool)}
        </div>
      </details>
    );
  };

  const renderTurn = (turn: Turn) => (
    <div key={turn.key} className="group/turn space-y-5">
      {/* 用户消息：中性浅底气泡（原来青底白字太刺眼），右对齐 */}
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-slate-100 dark:bg-slate-800 px-4 py-2.5">
          <div className="text-[14px] leading-relaxed text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-words">
            {turn.user}
          </div>
        </div>
      </div>

      {/* 助手消息：头像 + 内容流（无气泡，让内容自己说话） */}
      <div className="flex gap-3">
        <div className="shrink-0 w-7 h-7 mt-0.5 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center shadow-sm">
          <Icons.Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          {turn.tools.length > 0 && (
            <div className="space-y-1.5">{turn.tools.map(renderToolCard)}</div>
          )}

          {turn.thinking && (
            <details className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
              <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none list-none text-xs text-slate-500 dark:text-slate-400 hover:brightness-95 transition">
                <Icons.ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                <span>思考过程</span>
                <span className="ml-auto text-[11px] text-slate-400">{turn.thinking.length} 字</span>
              </summary>
              <div className="px-3 pb-2.5 pt-1 text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-400 whitespace-pre-wrap border-t border-slate-200/60 dark:border-slate-800">
                {turn.thinking}
              </div>
            </details>
          )}

          {turn.answer ? (
            <div className="relative">
              <MarkdownContent allowHtml={false} className={`!max-w-none ${PROSE}`}>
                {turn.answer}
              </MarkdownContent>
              {turn.streaming ? (
                <span className="inline-block w-[2px] h-4 bg-cyan-500 animate-pulse align-middle ml-0.5" />
              ) : (
                <div className="mt-3 flex items-center gap-1 opacity-0 group-hover/turn:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button
                    onClick={() => void copy(turn.answer, '回答')}
                    title="复制回答"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Icons.Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            turn.streaming && (
              <div className="flex items-center gap-1.5 py-1">
                <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce [animation-delay:300ms]" />
                <span className="ml-1.5 text-[13px] text-slate-400">正在思考</span>
              </div>
            )
          )}

          {turn.error && (
            <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-600 dark:text-red-300">
              {turn.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  /* ------------------------------ 主渲染 ------------------------------ */

  return (
    <div className="h-[calc(100vh-80px)] bg-white dark:bg-slate-900 overflow-hidden flex">
      {/* ---------------- 左侧会话栏 ---------------- */}
      <aside className="w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 flex flex-col">
        <div className="p-3 space-y-2.5 border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={startNew}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-medium transition-all hover:opacity-90 active:scale-[.99] shadow-sm"
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
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[13px] outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/15 transition-all"
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
                          ? 'bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700'
                          : 'hover:bg-slate-100/80 dark:hover:bg-slate-800/50'
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
                            className="w-full text-left px-2.5 py-2 block"
                          >
                            <div
                              className={`text-[13px] truncate pr-12 ${
                                isActive
                                  ? 'font-medium text-slate-900 dark:text-white'
                                  : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
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
      <main className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900">
        {/* 顶栏 */}
        <header className="h-14 px-5 flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
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
              className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
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
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center mb-5 shadow-lg shadow-cyan-500/20">
                <Icons.Sparkles className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1.5">
                今天想对站点做什么？
              </h2>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-7 max-w-md leading-relaxed">
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
                    className="text-left px-3.5 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-cyan-300 dark:hover:border-cyan-800 hover:bg-cyan-50/50 dark:hover:bg-slate-800 transition-all text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* 收窄正文宽度：太长的一行读起来很累 */
            <div className="px-6 py-6 space-y-7 max-w-4xl mx-auto">{turns.map(renderTurn)}</div>
          )}
        </div>

        {/* 输入区 */}
        <div className="border-t border-slate-200 dark:border-slate-800 px-6 py-4 shrink-0">
          <div className="max-w-4xl mx-auto">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 focus-within:border-cyan-400 focus-within:ring-2 focus-within:ring-cyan-400/15 transition-all">
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
                className="w-full px-4 pt-3.5 pb-1 bg-transparent text-sm leading-relaxed text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none resize-none max-h-[200px]"
              />
              <div className="flex items-center justify-between px-2.5 pb-2.5 pl-4">
                <span className="text-[11px] text-slate-400">
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
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-all active:scale-[.98]"
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
