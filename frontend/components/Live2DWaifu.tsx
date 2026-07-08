import React, { useEffect, useMemo, useRef, useState } from 'react';
import MarkdownContent from './MarkdownContent';
import { createChatSession, getChatHistory, sendMessageStream, ChatSession } from '../api/chat';
import { ChatMessage } from '../types';

const LIVE2D_ASSETS = {
  css: '/live2d/waifu.css',
  tipsJson: '/live2d/waifu-tips.json',
  tipsJs: '/live2d/waifu-tips.js',
  coreJs: '/live2d/live2dcubismcore.js',
  sdkJs: '/live2d/live2d-sdk.js',
  modelRoot: '/live2d/models/'
};

const STORAGE_KEYS = {
  session: 'chat_session_id',
  live2dHiddenAt: 'waifu-display',
  chatOpen: 'live2d_chat_open'
} as const;

const TOOLBAR_LABELS: Record<string, string> = {
  chat: '聊天',
  hitokoto: '一言',
  asteroids: '小游戏',
  express: '表情',
  'switch-model': '换模型',
  'switch-texture': '换装',
  photo: '拍照',
  info: '信息',
  quit: '隐藏'
};

const CHAT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 32C114.6 32 0 125.1 0 240c0 49.9 21.6 95.7 57.5 131.6C45.3 398.2 34 423 34 448c0 17.7 14.3 32 32 32c29.1 0 75.5-11.9 112.7-38.7c24.7 4.5 50.9 6.7 77.3 6.7c141.4 0 256-93.1 256-208S397.4 32 256 32zm64 248h-56v56c0 13.3-10.7 24-24 24s-24-10.7-24-24v-56h-56c-13.3 0-24-10.7-24-24s10.7-24 24-24h56v-56c0-13.3 10.7-24 24-24s24 10.7 24 24v56h56c13.3 0 24 10.7 24 24s-10.7 24-24 24z"/></svg>`;

const MOBILE_BREAKPOINT = 768;

const Live2DWaifu: React.FC = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [chatSize, setChatSize] = useState({ width: window.innerWidth >= 640 ? 520 : 420, height: window.innerWidth >= 640 ? 480 : 420 });
  const [chatPosition, setChatPosition] = useState<{ x: number; y: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const ignoreNextClickRef = useRef(false);
  const lastOpenAtRef = useRef(0);
  const dragStateRef = useRef<{
    type: 'move' | 'resize';
    dir?: string;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  const canRender = useMemo(() => !isMobile, [isMobile]);

  const openChatSafely = (event?: Event) => {
    event?.stopPropagation();
    event?.preventDefault();
    ignoreNextClickRef.current = true;
    lastOpenAtRef.current = Date.now();
    setChatOpen(true);
    window.setTimeout(() => setChatOpen(true), 0);
    window.setTimeout(() => setChatOpen(true), 50);
    window.setTimeout(() => setChatOpen(true), 150);
    window.setTimeout(() => setChatOpen(true), 350);
    window.setTimeout(() => setChatOpen(true), 650);
    window.setTimeout(() => {
      ignoreNextClickRef.current = false;
    }, 800);
  };

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!canRender) return;
    const stored = localStorage.getItem(STORAGE_KEYS.chatOpen);
    if (stored === 'true') {
      openChatSafely();
    }
  }, [canRender]);

  useEffect(() => {
    if (!canRender) return;
    if (chatOpen) {
      localStorage.setItem(STORAGE_KEYS.chatOpen, 'true');
      return;
    }
    localStorage.removeItem(STORAGE_KEYS.chatOpen);
  }, [canRender, chatOpen]);

  useEffect(() => {
    if (!canRender || initRef.current) return;
    initRef.current = true;

    const loadExternalResource = (url: string, type: 'css' | 'js') => new Promise<void>((resolve, reject) => {
      let tag: HTMLLinkElement | HTMLScriptElement | null = null;
      if (type === 'css') {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        tag = link;
      } else {
        const script = document.createElement('script');
        script.src = url;
        script.async = false;
        tag = script;
      }
      if (!tag) return reject();
      tag.onload = () => resolve();
      tag.onerror = () => reject();
      document.head.appendChild(tag);
    });

    const initWidget = async () => {
      try {
        await loadExternalResource(LIVE2D_ASSETS.css, 'css');
        await loadExternalResource(LIVE2D_ASSETS.coreJs, 'js');
        await loadExternalResource(LIVE2D_ASSETS.sdkJs, 'js');
        await loadExternalResource(LIVE2D_ASSETS.tipsJs, 'js');

        const tools = ['hitokoto', 'express', 'switch-model', 'switch-texture', 'photo', 'info', 'quit'];

        const init = (window as any).initWidget as ((options: any) => void) | undefined;
        if (!init) {
          setError('Live2D 初始化函数未加载');
          return;
        }

        // NOTE: 模型列表更新后，旧的 localStorage 索引可能越界导致报错，重置为默认值
        localStorage.removeItem('modelId');
        localStorage.removeItem('modelTexturesId');

        init({
          homePath: '/#/',
          waifuPath: LIVE2D_ASSETS.tipsJson,
          cdnPath: LIVE2D_ASSETS.modelRoot,
          tools,
          dragEnable: true,
          dragDirection: ['x', 'y'],
          switchType: 'order'
        });

        const toolContainer = document.getElementById('waifu-tool');
        if (toolContainer) {
          const chatTool = document.createElement('span');
          chatTool.id = 'waifu-tool-chat';
          chatTool.innerHTML = CHAT_ICON;
          chatTool.title = TOOLBAR_LABELS.chat;
          chatTool.addEventListener('pointerdown', openChatSafely, true);
          chatTool.addEventListener('click', openChatSafely, true);
          toolContainer.prepend(chatTool);
        }

        const widget = document.getElementById('waifu');
        if (widget) {
          widget.addEventListener(
            'click',
            (event) => {
              const target = event.target as HTMLElement;
              if (target && target.closest('#waifu-tool')) {
                event.stopPropagation();
                event.preventDefault();
                return;
              }
              if (ignoreNextClickRef.current || Date.now() - lastOpenAtRef.current < 800) {
                event.stopPropagation();
                event.preventDefault();
              }
            },
            true
          );
        }

        setWidgetReady(true);

        if (typeof (window as any).showWelcomeMessage === 'function') {
          (window as any).showWelcomeMessage();
        }
      } catch (err) {
        setError('Live2D 资源加载失败');
      }
    };

    initWidget();
  }, [canRender]);

  useEffect(() => {
    if (!canRender || !chatOpen) return;
    const initSession = async () => {
      const storedSession = localStorage.getItem(STORAGE_KEYS.session);
      if (storedSession) {
        try {
          const history = await getChatHistory(storedSession);
          const mapped = history.messages.map((msg) => ({
            id: msg.id.toString(),
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.created_at)
          }));
          setMessages(mapped);
          setSession({ id: storedSession, title: history.title, created_at: history.created_at, updated_at: history.updated_at });
          return;
        } catch (err) {
          localStorage.removeItem(STORAGE_KEYS.session);
        }
      }
      setSession(null);
    };
    initSession();
  }, [canRender, chatOpen]);

  useEffect(() => {
    if (!canRender || !chatOpen) return;

    const keepOpenOnClick = (event: MouseEvent) => {
      if (ignoreNextClickRef.current) {
        event.stopImmediatePropagation();
        event.stopPropagation();
        return;
      }
      const now = Date.now();
      if (now - lastOpenAtRef.current < 800) {
        event.stopImmediatePropagation();
        event.stopPropagation();
      }
    };

    window.addEventListener('click', keepOpenOnClick, { capture: true });
    return () => {
      window.removeEventListener('click', keepOpenOnClick, { capture: true });
    };
  }, [canRender, chatOpen]);

  useEffect(() => {
    if (!canRender || !chatOpen) return;

    const clampPosition = (prev: { x: number; y: number } | null) => {
      const maxX = Math.max(12, window.innerWidth - chatSize.width - 12);
      const maxY = Math.max(12, window.innerHeight - chatSize.height - 12);
      const nextX = prev?.x ?? maxX;
      const nextY = prev?.y ?? Math.max(12, window.innerHeight - chatSize.height - 120);
      const clamped = {
        x: Math.max(12, Math.min(maxX, nextX)),
        y: Math.max(12, Math.min(maxY, nextY))
      };
      if (prev && prev.x === clamped.x && prev.y === clamped.y) {
        return prev;
      }
      return clamped;
    };

    setChatPosition((prev) => clampPosition(prev));

    const handlePointerMove = (event: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) return;

      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;
      const minWidth = 320;
      const minHeight = 260;
      const maxWidth = Math.min(window.innerWidth - 40, 900);
      const maxHeight = Math.min(window.innerHeight - 40, 700);

      if (state.type === 'move') {
        setChatPosition({
          x: Math.max(12, Math.min(window.innerWidth - state.startWidth - 12, state.startLeft + deltaX)),
          y: Math.max(12, Math.min(window.innerHeight - state.startHeight - 12, state.startTop + deltaY))
        });
        return;
      }

      if (!state.dir) return;

      let nextWidth = state.startWidth;
      let nextHeight = state.startHeight;
      let nextLeft = state.startLeft;
      let nextTop = state.startTop;

      if (state.dir.includes('e')) {
        nextWidth = Math.min(maxWidth, Math.max(minWidth, state.startWidth + deltaX));
      }
      if (state.dir.includes('s')) {
        nextHeight = Math.min(maxHeight, Math.max(minHeight, state.startHeight + deltaY));
      }
      if (state.dir.includes('w')) {
        const width = Math.min(maxWidth, Math.max(minWidth, state.startWidth - deltaX));
        nextLeft = state.startLeft + (state.startWidth - width);
        nextWidth = width;
      }
      if (state.dir.includes('n')) {
        const height = Math.min(maxHeight, Math.max(minHeight, state.startHeight - deltaY));
        nextTop = state.startTop + (state.startHeight - height);
        nextHeight = height;
      }

      setChatSize({ width: nextWidth, height: nextHeight });
      setChatPosition({
        x: Math.max(12, Math.min(window.innerWidth - nextWidth - 12, nextLeft)),
        y: Math.max(12, Math.min(window.innerHeight - nextHeight - 12, nextTop))
      });
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    const handleResize = () => {
      setChatPosition((prev) => clampPosition(prev));
    };

    window.addEventListener('pointermove', handlePointerMove, { capture: true });
    window.addEventListener('pointerup', handlePointerUp, { capture: true });
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, { capture: true });
      window.removeEventListener('pointerup', handlePointerUp, { capture: true });
      window.removeEventListener('resize', handleResize);
    };
  }, [canRender, chatOpen, chatPosition, chatSize.height, chatSize.width]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatOpen]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    setError(null);
    const content = input.trim();
    setInput('');

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date()
    };
    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setLoading(true);

    try {
      let sessionId = session?.id;
      if (!sessionId) {
        const newSession = await createChatSession('与小魄罗的对话');
        sessionId = newSession.id;
        setSession(newSession);
        localStorage.setItem(STORAGE_KEYS.session, newSession.id);
      }

      let buffer = '';
      await sendMessageStream(sessionId, content, (chunk) => {
        buffer += chunk;
        setMessages((prev) => {
          const next = [...prev];
          const lastIndex = next.length - 1;
          if (lastIndex >= 0 && next[lastIndex].role === 'assistant') {
            next[lastIndex] = { ...next[lastIndex], content: buffer };
          }
          return next;
        });
      });
    } catch (err) {
      setError('发送失败，请稍后重试');
      setMessages((prev) => {
        const next = [...prev];
        const lastIndex = next.length - 1;
        if (lastIndex >= 0 && next[lastIndex].role === 'assistant') {
          next[lastIndex] = { ...next[lastIndex], content: '抱歉，消息发送失败了。' };
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  if (!canRender) return null;

  return (
    <div className={`fixed bottom-6 right-6 z-[70] flex flex-col items-end gap-3 text-sm text-slate-700 ${widgetReady ? '' : 'pointer-events-none'}`}>
      {error && (
        <div className="rounded-lg bg-rose-50/90 px-3 py-2 text-xs text-rose-600 shadow">
          {error}
        </div>
      )}

      {chatOpen && (
        <div
          ref={chatRef}
          className="rounded-2xl bg-white/90 shadow-2xl border border-white/70 backdrop-blur-xl flex flex-col fixed z-[75]"
          style={{
            width: chatSize.width,
            height: chatSize.height,
            left: chatPosition?.x ?? 12,
            top: chatPosition?.y ?? 12
          }}
        >
          <div
            className="px-4 py-3 bg-gradient-to-r from-slate-700 to-slate-900 text-white text-sm font-semibold flex items-center justify-between cursor-move select-none"
            onPointerDown={(event) => {
              if ((event.target as HTMLElement).closest('button')) return;
              const rect = chatRef.current?.getBoundingClientRect();
              if (!rect) return;
              dragStateRef.current = {
                type: 'move',
                startX: event.clientX,
                startY: event.clientY,
                startLeft: rect.left,
                startTop: rect.top,
                startWidth: rect.width,
                startHeight: rect.height
              };
              document.body.style.userSelect = 'none';
              document.body.style.cursor = 'move';
            }}
          >
            <span>小魄罗 · Live2D</span>
            <button onClick={() => setChatOpen(false)} className="text-xs opacity-80 hover:opacity-100">关闭</button>
          </div>
          <div className="flex-1 min-h-[240px] overflow-y-auto px-4 py-3 space-y-3 bg-gradient-to-b from-white/80 to-slate-50/80">
            {['n','e','s','w','ne','nw','se','sw'].map((dir) => (
              <div
                key={dir}
                onPointerDown={(event) => {
                  const rect = chatRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  dragStateRef.current = {
                    type: 'resize',
                    dir,
                    startX: event.clientX,
                    startY: event.clientY,
                    startLeft: rect.left,
                    startTop: rect.top,
                    startWidth: rect.width,
                    startHeight: rect.height
                  };
                  document.body.style.userSelect = 'none';
                  document.body.style.cursor = `${dir}-resize`;
                  event.stopPropagation();
                }}
                className={`absolute z-[80] ${dir === 'n' ? 'top-0 left-3 right-3 h-2 cursor-n-resize' : ''}${dir === 's' ? 'bottom-0 left-3 right-3 h-2 cursor-s-resize' : ''}${dir === 'e' ? 'right-0 top-3 bottom-3 w-2 cursor-e-resize' : ''}${dir === 'w' ? 'left-0 top-3 bottom-3 w-2 cursor-w-resize' : ''}${dir === 'ne' ? 'right-0 top-0 w-3 h-3 cursor-ne-resize' : ''}${dir === 'nw' ? 'left-0 top-0 w-3 h-3 cursor-nw-resize' : ''}${dir === 'se' ? 'right-0 bottom-0 w-3 h-3 cursor-se-resize' : ''}${dir === 'sw' ? 'left-0 bottom-0 w-3 h-3 cursor-sw-resize' : ''}`}
              />
            ))}
            {messages.length === 0 && (
              <div className="text-xs text-slate-400">开始和小魄罗聊聊吧～</div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${msg.role === 'user'
                  ? 'bg-slate-700 text-white'
                  : 'bg-white/90 text-slate-700 border border-slate-200/70'}`}
                >
                  {msg.role === 'assistant' ? (
                    <MarkdownContent compact allowCompactComponents allowHtml={false} className="text-xs [&_ol]:ml-4 [&_ul]:ml-4">
                      {msg.content}
                    </MarkdownContent>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-3 bg-white/80 border-t border-slate-200/60">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="说点什么..."
                className="flex-1 rounded-lg border border-slate-200/70 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-300/60"
                disabled={loading}
              />
              <button
                onClick={handleSend}
                disabled={loading}
                className="rounded-lg bg-slate-800 text-white px-3 py-2 text-xs hover:bg-slate-700 disabled:opacity-50"
              >
                发送
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Live2DWaifu;
