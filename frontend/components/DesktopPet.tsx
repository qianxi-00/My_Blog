import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Icons } from './Icons';
import { ChatMessage } from '../types';
import MarkdownContent from './MarkdownContent';
import { createChatSession, sendMessageStream, getChatHistory, ChatSession } from '../api/chat';

type PetVariant = {
  id: string;
  label: string;
  src: string;
};

type PetThemeId = 'cute' | 'minimal';

type PanelSize = { width: number; height: number };

type PetTheme = {
  id: PetThemeId;
  label: string;
  panelBg: string;
  panelHeaderBg: string;
  panelBorder: string;
  panelShadow: string;
  messageUserBg: string;
  messageAssistantBg: string;
  messageAssistantText: string;
  messageAssistantBorder: string;
  bubbleBg: string;
  bubbleText: string;
  bubbleShadow: string;
  bubbleTail: string;
  avatarBg: string;
  avatarBorder: string;
  avatarShadow: string;
  avatarGlow: string;
  accent: string;
};

const FALLBACK_PET_SRC = '/images/poro/robot_poro.png';

const PET_VARIANTS: PetVariant[] = [
  { id: 'default', label: '默认', src: FALLBACK_PET_SRC },
  { id: 'witch', label: '女巫', src: FALLBACK_PET_SRC },
  { id: 'summer', label: '夏日', src: FALLBACK_PET_SRC },
  { id: 'christmas', label: '圣诞', src: FALLBACK_PET_SRC }
];

const PET_THEMES: Record<PetThemeId, PetTheme> = {
  cute: {
    id: 'cute',
    label: '软萌',
    panelBg: 'bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl',
    panelHeaderBg: 'bg-gradient-to-r from-pink-400/90 via-rose-400/90 to-amber-300/90 dark:from-rose-500/90 dark:via-pink-500/90 dark:to-amber-400/90',
    panelBorder: 'border border-white/60 dark:border-rose-100/10',
    panelShadow: 'shadow-[0_20px_60px_rgba(251,113,133,0.25)]',
    messageUserBg: 'bg-gradient-to-r from-pink-400 to-rose-400 text-white',
    messageAssistantBg: 'bg-white/90 dark:bg-slate-700/80',
    messageAssistantText: 'text-slate-700 dark:text-slate-100',
    messageAssistantBorder: 'border border-white/70 dark:border-rose-100/10',
    bubbleBg: 'bg-white/85 dark:bg-slate-700/85 backdrop-blur-xl',
    bubbleText: 'text-slate-700 dark:text-slate-100',
    bubbleShadow: 'shadow-[0_12px_36px_rgba(251,113,133,0.25)]',
    bubbleTail: 'bg-white/90 dark:bg-slate-700/90',
    avatarBg: 'bg-gradient-to-br from-rose-100/90 to-amber-100/90 dark:from-slate-700 dark:to-slate-600',
    avatarBorder: 'border border-white/70 dark:border-rose-100/10',
    avatarShadow: 'shadow-[0_16px_40px_rgba(251,113,133,0.35)]',
    avatarGlow: 'bg-rose-300/40 dark:bg-rose-400/15',
    accent: 'text-rose-500'
  },
  minimal: {
    id: 'minimal',
    label: '克制',
    panelBg: 'bg-white/85 dark:bg-slate-900/80 backdrop-blur-lg',
    panelHeaderBg: 'bg-gradient-to-r from-slate-700/90 via-slate-800/90 to-slate-900/90 dark:from-slate-900/90 dark:via-slate-800/90 dark:to-slate-700/90',
    panelBorder: 'border border-slate-200/70 dark:border-slate-700/60',
    panelShadow: 'shadow-[0_18px_48px_rgba(15,23,42,0.18)]',
    messageUserBg: 'bg-gradient-to-r from-slate-700 to-slate-800 text-white',
    messageAssistantBg: 'bg-white/90 dark:bg-slate-800/80',
    messageAssistantText: 'text-slate-700 dark:text-slate-200',
    messageAssistantBorder: 'border border-slate-200/80 dark:border-slate-600/60',
    bubbleBg: 'bg-white/90 dark:bg-slate-800/85 backdrop-blur-lg',
    bubbleText: 'text-slate-700 dark:text-slate-200',
    bubbleShadow: 'shadow-[0_10px_28px_rgba(15,23,42,0.18)]',
    bubbleTail: 'bg-white/90 dark:bg-slate-800/85',
    avatarBg: 'bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600',
    avatarBorder: 'border border-slate-200/80 dark:border-slate-600/60',
    avatarShadow: 'shadow-[0_14px_32px_rgba(15,23,42,0.2)]',
    avatarGlow: 'bg-slate-300/30 dark:bg-slate-500/15',
    accent: 'text-slate-500'
  }
};

const STORAGE_KEYS = {
  position: 'pet_position',
  variant: 'pet_variant',
  chatSession: 'chat_session_id',
  bubbleSession: 'pet_bubble_session_id',
  theme: 'pet_theme',
  panelSize: 'pet_panel_size'
} as const;

const BUBBLE_TEMPLATES = {
  welcome: '嗨，我在这里哦～点击立绘就能聊天！',
  idle: '在看什么内容呢？需要我帮忙总结吗？',
  scroll: '看得很认真！要不要我帮你提炼重点？',
  copy: '复制成功～需要我解释这段内容吗？',
  article: '这篇文章不错！有问题随时问我～',
  back: '欢迎回来～我还在这里等你～'
} as const;

const AI_PROMPT_TEMPLATES = {
  base: '你是博客前台的桌宠“小魄罗”，语气友好、简短、不打扰。请基于以下行为摘要，生成一句 20 字以内的中文提醒：',
  fallback: [
    '需要我帮你梳理重点吗？',
    '如果有疑问，随时叫我～',
    '要不要我总结一下当前内容？',
    '我可以帮你提炼关键结论～',
    '需要解释代码或概念吗？'
  ]
} as const;

const DEBUG_QUERY_KEY = 'petDebug';
const DEBUG_STORAGE_KEY = 'pet_debug';
const SAFE_TOP_DESKTOP = 72;
const SAFE_BOTTOM_DESKTOP = 64;
const SAFE_BOTTOM_MOBILE = 96;
const DEFAULT_PANEL_SIZE: PanelSize = { width: 520, height: 560 };
const MIN_PANEL_SIZE: PanelSize = { width: 360, height: 380 };
const MAX_PANEL_SIZE: PanelSize = { width: 760, height: 760 };

const splitReferences = (content: string) => {
  const match = content.match(/参考文章[:：]/);
  if (!match || match.index === undefined) {
    return { main: content, refs: '' };
  }
  const main = content.slice(0, match.index).trim();
  const refs = content.slice(match.index).replace(/^参考文章[:：]\s*/g, '').trim();
  return { main, refs };
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const clampPosition = (
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  size: number,
  safeTop: number,
  safeBottom: number
) => {
  const paddingX = 12;
  const minX = paddingX;
  const maxX = Math.max(paddingX, viewportWidth - size - paddingX);
  const minY = Math.max(safeTop, 12);
  const maxY = Math.max(minY, viewportHeight - size - safeBottom);
  return {
    x: clamp(x, minX, maxX),
    y: clamp(y, minY, maxY)
  };
};
;
};

const clampPanelSize = (size: PanelSize, viewportWidth: number, viewportHeight: number): PanelSize => {
  const maxWidth = Math.min(MAX_PANEL_SIZE.width, Math.max(MIN_PANEL_SIZE.width, viewportWidth - 48));
  const maxHeight = Math.min(MAX_PANEL_SIZE.height, Math.max(MIN_PANEL_SIZE.height, viewportHeight - SAFE_TOP_DESKTOP - 48));
  return {
    width: Math.round(clamp(size.width, MIN_PANEL_SIZE.width, maxWidth)),
    height: Math.round(clamp(size.height, MIN_PANEL_SIZE.height, maxHeight))
  };
};

const formatTime = (date: Date) => date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const getSafeSrc = (src: string, failedSet: Set<string>, fallback: string) => {
  if (!src) return fallback;
  if (failedSet.has(src)) return fallback;
  return src;
};

const DesktopPet: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: '嗨！我是小魄罗～🐾 有什么可以帮你的吗？(●\'◡\'●)',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [position, setPosition] = useState({ x: 24, y: 24 });
  const [isDragging, setIsDragging] = useState(false);
  const [variantId, setVariantId] = useState('default');
  const [petThemeId, setPetThemeId] = useState<PetThemeId>('cute');
  const latestPositionRef = useRef({ x: 24, y: 24 });
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [bubbleText, setBubbleText] = useState('');
  const [skinMenuSource, setSkinMenuSource] = useState<'top' | 'bottom' | null>(null);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugLogs, setDebugLogs] = useState<Array<{ time: string; reason: string }>>([]);
  const [debugBadge, setDebugBadge] = useState(0);
  const [imageErrorTick, setImageErrorTick] = useState(0);
  const [drawerMode, setDrawerMode] = useState<'partial' | 'full'>('partial');
  const [drawerDrag, setDrawerDrag] = useState(0);
  const [drawerDragging, setDrawerDragging] = useState(false);
  const [bubbleSessionId, setBubbleSessionId] = useState<string | null>(null);
  const [bubbleLoading, setBubbleLoading] = useState(false);
  const [panelSize, setPanelSize] = useState<PanelSize>(DEFAULT_PANEL_SIZE);
  const [panelResizing, setPanelResizing] = useState(false);
  const failedImageRef = useRef(new Set<string>());
  const drawerStartRef = useRef(0);
  const panelResizeRef = useRef({ active: false, startX: 0, startY: 0, startWidth: DEFAULT_PANEL_SIZE.width, startHeight: DEFAULT_PANEL_SIZE.height, direction: 'right' as 'left' | 'right' });

  const bubbleTimerRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const bubbleRequestRef = useRef(0);
  const dragStateRef = useRef({ active: false, startX: 0, startY: 0, originX: 0, originY: 0, moved: false, allowClick: true });
  const bubbleStatsRef = useRef({ count: 0, lastAt: 0 });
  const triggerFlagsRef = useRef({ welcome: false, scroll: false, copy: false, article: false, idle: false, back: false });
  const lastHashRef = useRef<string>('');
  const skinMenuRef = useRef<HTMLDivElement>(null);

  const isMobile = viewport.width > 0 && viewport.width < 640;
  const avatarSize = isMobile ? 64 : 88;

  const currentVariant = useMemo(
    () => PET_VARIANTS.find((item) => item.id === variantId) || PET_VARIANTS[0],
    [variantId]
  );

  const currentTheme = PET_THEMES[petThemeId] || PET_THEMES.cute;

  const safeTop = isMobile ? 12 : SAFE_TOP_DESKTOP;
  const safeBottom = isMobile ? SAFE_BOTTOM_MOBILE : SAFE_BOTTOM_DESKTOP;

  const fallbackSrc = FALLBACK_PET_SRC;
  const avatarSrc = useMemo(
    () => getSafeSrc(currentVariant.src, failedImageRef.current, fallbackSrc),
    [currentVariant.src, fallbackSrc, imageErrorTick]
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    latestPositionRef.current = position;
  }, [position]);

  const clearBubbleTimer = () => {
    if (bubbleTimerRef.current) {
      window.clearTimeout(bubbleTimerRef.current);
      bubbleTimerRef.current = null;
    }
  };

  const hideBubble = () => {
    clearBubbleTimer();
    setBubbleVisible(false);
  };

  const recordDebug = (reason: string) => {
    if (!debugEnabled) return;
    const time = formatTime(new Date());
    setDebugLogs((prev) => [{ time, reason }, ...prev].slice(0, 20));
    setDebugBadge((prev) => prev + 1);
  };

  const toggleSkinMenu = (source: 'top' | 'bottom') => {
    setSkinMenuSource((prev) => (prev === source ? null : source));
  };
  const closeSkinMenu = () => setSkinMenuSource(null);

  const showBubble = async (text: string, reason: string, useAi = false) => {
    if (isOpen || isDragging) return false;
    if (useAi && bubbleLoading) return false;
    const now = Date.now();
    if (bubbleStatsRef.current.count >= 5) return false;
    if (now - bubbleStatsRef.current.lastAt < 60000) return false;

    bubbleStatsRef.current.count += 1;
    bubbleStatsRef.current.lastAt = now;

    const nextText = useAi ? await generateBubbleText(reason) : text;
    setBubbleText(nextText);
    setBubbleVisible(true);
    recordDebug(`bubble:${reason}`);

    clearBubbleTimer();
    bubbleTimerRef.current = window.setTimeout(() => {
      setBubbleVisible(false);
    }, 6000);
    return true;
  };

  useEffect(() => {
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    if (!viewport.width || !viewport.height) return;

    const storedVariant = localStorage.getItem(STORAGE_KEYS.variant);
    if (storedVariant) {
      setVariantId(storedVariant);
    }

    const storedTheme = localStorage.getItem(STORAGE_KEYS.theme) as PetThemeId | null;
    if (storedTheme && PET_THEMES[storedTheme]) {
      setPetThemeId(storedTheme);
    }

    const storedPanelSize = localStorage.getItem(STORAGE_KEYS.panelSize);
    if (storedPanelSize) {
      try {
        const parsed = JSON.parse(storedPanelSize) as PanelSize;
        if (Number.isFinite(parsed.width) && Number.isFinite(parsed.height)) {
          setPanelSize(clampPanelSize(parsed, viewport.width, viewport.height));
        }
      } catch (_e) {
        localStorage.removeItem(STORAGE_KEYS.panelSize);
      }
    }

    const storedBubbleSession = localStorage.getItem(STORAGE_KEYS.bubbleSession);
    if (storedBubbleSession) {
      setBubbleSessionId(storedBubbleSession);
    }

    const storedPosition = localStorage.getItem(STORAGE_KEYS.position);
    if (storedPosition) {
      try {
        const parsed = JSON.parse(storedPosition) as { x: number; y: number };
        const clamped = clampPosition(parsed.x, parsed.y, viewport.width, viewport.height, avatarSize, safeTop, safeBottom);
        setPosition(clamped);
      } catch (error) {
        localStorage.removeItem(STORAGE_KEYS.position);
      }
    } else {
      const defaultX = 24;
      const defaultY = viewport.height - avatarSize - safeBottom;
      setPosition(clampPosition(defaultX, defaultY, viewport.width, viewport.height, avatarSize, safeTop, safeBottom));
    }

    const queryParams = new URLSearchParams(window.location.search);
    const queryDebug = queryParams.get(DEBUG_QUERY_KEY);
    const storedDebug = localStorage.getItem(DEBUG_STORAGE_KEY);
    const enabled = queryDebug === '1' || storedDebug === '1';
    if (queryDebug === '1') {
      localStorage.setItem(DEBUG_STORAGE_KEY, '1');
    }
    setDebugEnabled(enabled);
  }, [viewport.width, viewport.height, avatarSize, safeTop, safeBottom]);

  useEffect(() => {
    if (!viewport.width || !viewport.height || isMobile) return;
    setPanelSize((prev) => clampPanelSize(prev, viewport.width, viewport.height));
  }, [viewport.width, viewport.height, isMobile]);

  useEffect(() => {
    if (isMobile) return;
    localStorage.setItem(STORAGE_KEYS.panelSize, JSON.stringify(panelSize));
  }, [panelSize, isMobile]);

  useEffect(() => {
    if (!viewport.width || !viewport.height) return;
    setPosition((prev) => clampPosition(prev.x, prev.y, viewport.width, viewport.height, avatarSize, safeTop, safeBottom));
  }, [viewport.width, viewport.height, avatarSize, safeTop, safeBottom]);

  useEffect(() => {
    if (!viewport.width || !viewport.height || isMobile) return;
    setPanelSize((prev) => clampPanelSize(prev, viewport.width, viewport.height));
  }, [viewport.width, viewport.height, isMobile]);

  useEffect(() => {
    if (isMobile) return;
    localStorage.setItem(STORAGE_KEYS.panelSize, JSON.stringify(panelSize));
  }, [panelSize, isMobile]);

  useEffect(() => {
    PET_VARIANTS.forEach((variant) => {
      if (!variant.src) return;
      const img = new Image();
      img.onload = () => {
        if (failedImageRef.current.has(variant.src)) {
          failedImageRef.current.delete(variant.src);
          setImageErrorTick((tick) => tick + 1);
        }
      };
      img.onerror = () => {
        failedImageRef.current.add(variant.src);
        setImageErrorTick((tick) => tick + 1);
      };
      img.src = variant.src;
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  useEffect(() => {
    if (isOpen) {
      hideBubble();
      recordDebug('panel:open');
      closeSkinMenu();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!skinMenuSource) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (skinMenuRef.current && !skinMenuRef.current.contains(event.target as Node)) {
        closeSkinMenu();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [skinMenuSource]);

  useEffect(() => {
    if (triggerFlagsRef.current.welcome) return;
    if (isOpen || isDragging) return;
    const timer = window.setTimeout(() => {
      showBubble(BUBBLE_TEMPLATES.welcome, 'welcome', true).then((shown) => {
        if (shown) {
          triggerFlagsRef.current.welcome = true;
        }
      });
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [isOpen, isDragging]);

  useEffect(() => {
    const handleScroll = () => {
      if (isOpen || isDragging || triggerFlagsRef.current.scroll) return;
      const scrollHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const progress = (scrollTop + window.innerHeight) / Math.max(scrollHeight, 1);
      if (progress > 0.6) {
        showBubble(BUBBLE_TEMPLATES.scroll, 'scroll', true).then((shown) => {
          if (shown) {
            triggerFlagsRef.current.scroll = true;
          }
        });
      }
    };

    const handleCopy = () => {
      if (isOpen || isDragging || triggerFlagsRef.current.copy) return;
      showBubble(BUBBLE_TEMPLATES.copy, 'copy', true).then((shown) => {
        if (shown) {
          triggerFlagsRef.current.copy = true;
        }
      });
    };

    const handleHashChange = () => {
      if (isOpen || isDragging) return;
      const hash = window.location.hash || '';
      if (hash === lastHashRef.current) return;
      lastHashRef.current = hash;
      if (hash.includes('/article/')) {
        if (!triggerFlagsRef.current.article) {
          showBubble(BUBBLE_TEMPLATES.article, 'article', true).then((shown) => {
            if (shown) {
              triggerFlagsRef.current.article = true;
            }
          });
        }
      }
    };

    const handleVisibility = () => {
      if (isOpen || isDragging) return;
      if (document.visibilityState === 'visible' && !triggerFlagsRef.current.back) {
        showBubble(BUBBLE_TEMPLATES.back, 'back', true).then((shown) => {
          if (shown) {
            triggerFlagsRef.current.back = true;
          }
        });
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('copy', handleCopy);
    window.addEventListener('hashchange', handleHashChange);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('copy', handleCopy);
      window.removeEventListener('hashchange', handleHashChange);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isOpen, isDragging]);

  useEffect(() => {
    const resetIdleTimer = () => {
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
      if (isOpen || isDragging) return;
      idleTimerRef.current = window.setTimeout(() => {
        if (!triggerFlagsRef.current.idle) {
          showBubble(BUBBLE_TEMPLATES.idle, 'idle', true).then((shown) => {
            if (shown) {
              triggerFlagsRef.current.idle = true;
            }
          });
        }
      }, 20000);
    };

    const activityEvents: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach((event) => window.addEventListener(event, resetIdleTimer, { passive: true }));
    resetIdleTimer();

    return () => {
      activityEvents.forEach((event) => window.removeEventListener(event, resetIdleTimer));
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
    };
  }, [isOpen, isDragging]);

  const initSession = async () => {
    try {
      const storedSessionId = localStorage.getItem(STORAGE_KEYS.chatSession);
      if (storedSessionId) {
        const history = await getChatHistory(storedSessionId);
        setSession(history);
        if (history.messages && history.messages.length > 0) {
          setMessages(history.messages.map(m => ({
            id: m.id.toString(),
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: new Date(m.created_at)
          })));
        }
      }
    } catch (error) {
      localStorage.removeItem(STORAGE_KEYS.chatSession);
    }
  };

  useEffect(() => {
    if (isOpen && !session) {
      initSession();
    }
  }, [isOpen]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const contentToSend = input;
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: contentToSend,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      let currentSession = session;

      if (!currentSession) {
        currentSession = await createChatSession('与小魄罗的对话');
        setSession(currentSession);
        localStorage.setItem(STORAGE_KEYS.chatSession, currentSession.id);
      }

      const aiMessageId = (Date.now() + 1).toString();
      const aiMessage: ChatMessage = {
        id: aiMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMessage]);

      let fullContent = '';
      await sendMessageStream(currentSession.id, contentToSend, (chunk) => {
        fullContent += chunk;
        setMessages(prev => prev.map(msg =>
          msg.id === aiMessageId ? { ...msg, content: fullContent } : msg
        ));
      });
      recordDebug('chat:stream_done');

    } catch (error: any) {
      console.error(error);
      const errorMessage = error.message || '抱歉，我遇到了一些问��。请确保后端服务正常运行。';
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg.role === 'assistant' && lastMsg.content === '') {
          return prev.map(msg => msg.id === lastMsg.id ? { ...msg, content: errorMessage } : msg);
        }
        return [...prev, {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          content: errorMessage,
          timestamp: new Date()
        }];
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = () => {
    if (window.confirm('确定要清空聊天记录吗？')) {
      setMessages([{
        id: '1',
        role: 'assistant',
        content: '嗨！我是小魄罗～🐾 有什么可以帮你的吗？',
        timestamp: new Date()
      }]);
      setSession(null);
      localStorage.removeItem(STORAGE_KEYS.chatSession);
      recordDebug('chat:clear');
    }
  };

  const handlePointerDown = (event: React.PointerEvent, allowClick: boolean) => {
    if (event.button !== 0) return;
    if (isMobile) {
      if (allowClick) {
        setIsOpen((prev) => !prev);
      }
      return;
    }
    event.preventDefault();
    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
      allowClick
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!dragStateRef.current.active || !viewport.width || !viewport.height) return;
      const dx = moveEvent.clientX - dragStateRef.current.startX;
      const dy = moveEvent.clientY - dragStateRef.current.startY;
      if (!dragStateRef.current.moved && Math.hypot(dx, dy) > 3) {
        dragStateRef.current.moved = true;
        setIsDragging(true);
      }
      const next = clampPosition(
        dragStateRef.current.originX + dx,
        dragStateRef.current.originY + dy,
        viewport.width,
        viewport.height,
        avatarSize,
        safeTop,
        safeBottom
      );
      setPosition(next);
    };

    const handlePointerUp = () => {
      dragStateRef.current.active = false;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      if (dragStateRef.current.moved) {
        setIsDragging(false);
        localStorage.setItem(STORAGE_KEYS.position, JSON.stringify(latestPositionRef.current));
        return;
      }

      if (dragStateRef.current.allowClick) {
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  const handleBubbleClick = () => {
    hideBubble();
    setIsOpen(true);
    recordDebug('bubble:click');
  };

  const handleThemeSelect = (nextTheme: PetThemeId) => {
    setPetThemeId(nextTheme);
    localStorage.setItem(STORAGE_KEYS.theme, nextTheme);
    recordDebug(`theme:${nextTheme}`);
  };

  const handleVariantSelect = (variant: PetVariant) => {
    setVariantId(variant.id);
    localStorage.setItem(STORAGE_KEYS.variant, variant.id);
    closeSkinMenu();
    recordDebug(`variant:${variant.id}`);
  };

  const buildBehaviorSummary = (reason: string) => {
    const hash = window.location.hash || '';
    const pageType = hash.includes('/article/') ? '文章页' : hash.includes('/forum') ? '论坛页' : '列表页';
    const scrollHeight = document.documentElement.scrollHeight || 1;
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const progress = Math.min(1, (scrollTop + window.innerHeight) / scrollHeight);
    return {
      reason,
      pageType,
      progress: Math.round(progress * 100),
      isMobile,
      time: new Date().toISOString()
    };
  };

  const pickFallbackBubble = () => {
    const options = AI_PROMPT_TEMPLATES.fallback;
    return options[Math.floor(Math.random() * options.length)];
  };

  const generateBubbleText = async (reason: string) => {
    const summary = buildBehaviorSummary(reason);
    const prompt = `${AI_PROMPT_TEMPLATES.base}\n${JSON.stringify(summary)}`;

    if (!bubbleSessionId) {
      try {
        const newSession = await createChatSession('小魄罗主动气泡');
        setBubbleSessionId(newSession.id);
        localStorage.setItem(STORAGE_KEYS.bubbleSession, newSession.id);
      } catch (error) {
        recordDebug('bubble:session_failed');
        return pickFallbackBubble();
      }
    }

    const sessionId = bubbleSessionId || localStorage.getItem(STORAGE_KEYS.bubbleSession);
    if (!sessionId) {
      return pickFallbackBubble();
    }

    const requestId = bubbleRequestRef.current + 1;
    bubbleRequestRef.current = requestId;
    setBubbleLoading(true);

    try {
      let fullContent = '';
      await sendMessageStream(sessionId, prompt, (chunk) => {
        if (bubbleRequestRef.current !== requestId) return;
        fullContent += chunk;
      });
      if (bubbleRequestRef.current !== requestId) return pickFallbackBubble();
      const trimmed = fullContent.trim();
      return trimmed ? trimmed.slice(0, 60) : pickFallbackBubble();
    } catch (error) {
      recordDebug('bubble:ai_failed');
      return pickFallbackBubble();
    } finally {
      if (bubbleRequestRef.current === requestId) {
        setBubbleLoading(false);
      }
    }
  };

  const panelWidth = isMobile ? Math.min(viewport.width * 0.92, 420) : panelSize.width;
  const panelHeight = isMobile ? Math.min(viewport.height * 0.7, 560) : panelSize.height;

  const drawerHeight = drawerMode === 'full' ? viewport.height : panelHeight;

  useEffect(() => {
    if (isMobile && isOpen) {
      document.body.style.overflow = 'hidden';
      setDrawerMode('partial');
      setDrawerDrag(0);
      return () => {
        document.body.style.overflow = '';
        setDrawerDrag(0);
      };
    }
    return undefined;
  }, [isMobile, isOpen]);

  const panelDirection = useMemo(() => {
    if (!viewport.width || !viewport.height) return 'right';
    if (isMobile) return 'drawer';
    const centerX = position.x + avatarSize / 2;
    return centerX > viewport.width / 2 ? 'left' : 'right';
  }, [viewport.width, viewport.height, position.x, avatarSize, isMobile]);

  const bubbleDirection = useMemo(() => {
    if (!viewport.width || !viewport.height) return 'right';
    const centerX = position.x + avatarSize / 2;
    const centerY = position.y + avatarSize / 2;
    const isLeft = centerX <= viewport.width / 2;
    const isTop = centerY <= viewport.height / 2;
    if (isTop && isLeft) return 'right-bottom';
    if (isTop && !isLeft) return 'left-bottom';
    if (!isTop && isLeft) return 'right-top';
    return 'left-top';
  }, [viewport.width, viewport.height, position.x, position.y, avatarSize]);

  const handlePanelResizePointerDown = (event: React.PointerEvent, direction: 'left' | 'right') => {
    if (isMobile) return;
    event.preventDefault();
    event.stopPropagation();
    panelResizeRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: panelSize.width,
      startHeight: panelSize.height,
      direction
    };
    setPanelResizing(true);
    recordDebug('panel:resize-start');

    const handleMove = (moveEvent: PointerEvent) => {
      const state = panelResizeRef.current;
      if (!state.active) return;
      const deltaX = state.direction === 'right' ? moveEvent.clientX - state.startX : state.startX - moveEvent.clientX;
      const deltaY = moveEvent.clientY - state.startY;
      setPanelSize(clampPanelSize({
        width: state.startWidth + deltaX,
        height: state.startHeight + deltaY
      }, viewport.width, viewport.height));
    };

    const handleUp = () => {
      panelResizeRef.current.active = false;
      setPanelResizing(false);
      recordDebug('panel:resize-end');
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
  };

  const handleDrawerPointerDown = (event: React.PointerEvent) => {
    if (!isMobile) return;
    event.preventDefault();
    event.stopPropagation();
    drawerStartRef.current = event.clientY;
    setDrawerDragging(true);

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientY - drawerStartRef.current;
      setDrawerDrag(delta);
    };

    const handleUp = (upEvent: PointerEvent) => {
      const delta = upEvent.clientY - drawerStartRef.current;
      setDrawerDragging(false);
      setDrawerDrag(0);
      if (delta < -80) {
        setDrawerMode('full');
        recordDebug('drawer:full');
      } else if (delta > 80) {
        setIsOpen(false);
        recordDebug('drawer:close');
      }
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
  };

  return (
    <div
      className="fixed z-40 flex flex-col items-start gap-3 transition-colors duration-300"
      style={{ left: position.x, top: position.y, pointerEvents: isOpen && isMobile ? 'none' : 'auto', writingMode: 'horizontal-tb', textOrientation: 'mixed' }}
    >
      {isOpen && !isMobile && (
        <div
          className={`absolute bottom-full ${panelDirection === 'left' ? 'right-0' : 'left-0'} mb-3 ${currentTheme.panelBg} rounded-2xl ${currentTheme.panelShadow} ${currentTheme.panelBorder} flex flex-col overflow-hidden transition-all duration-200 ${isDragging || panelResizing ? 'opacity-90 scale-[0.99]' : 'opacity-100 scale-100'}`}
          style={{ width: panelWidth, height: panelHeight }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="拖拽缩放聊天框"
            title="拖拽缩放聊天框"
            className={`absolute bottom-2 ${panelDirection === 'left' ? 'left-2 cursor-nesw-resize' : 'right-2 cursor-nwse-resize'} z-20 h-5 w-5 rounded-md bg-white/70 dark:bg-slate-700/70 border border-slate-200/80 dark:border-slate-600/70 shadow-sm hover:bg-white dark:hover:bg-slate-600 transition-colors`}
            onPointerDown={(event) => handlePanelResizePointerDown(event, panelDirection === 'left' ? 'left' : 'right')}
          >
            <span className={`absolute bottom-1 ${panelDirection === 'left' ? 'left-1' : 'right-1'} h-2.5 w-2.5 border-b-2 ${panelDirection === 'left' ? 'border-l-2' : 'border-r-2'} border-slate-400 dark:border-slate-300`} />
          </button>
          <div
            className={`${currentTheme.panelHeaderBg} p-4 flex justify-between items-center text-white cursor-move transition-colors pet-drag-handle`}
            onPointerDown={(event) => handlePointerDown(event, false)}
          >
            <div className="flex items-center gap-2">
              <img src={avatarSrc} alt="小魄罗" className="w-7 h-7 rounded-full bg-white/80 p-0.5" onError={() => {
                if (!failedImageRef.current.has(currentVariant.src)) {
                  failedImageRef.current.add(currentVariant.src);
                  setImageErrorTick((tick) => tick + 1);
                }
              }} />
              <span className="font-bold">小魄罗</span>
              <span className="text-xs opacity-75">{currentVariant.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleThemeSelect(petThemeId === 'cute' ? 'minimal' : 'cute')}
                className="hover:bg-white/20 p-1.5 rounded transition-colors"
                title="切换风格"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {petThemeId === 'cute' ? <Icons.Moon className="w-4 h-4" /> : <Icons.Sun className="w-4 h-4" />}
              </button>
              <button
                onClick={() => toggleSkinMenu('top')}
                className="hover:bg-white/20 p-1.5 rounded transition-colors"
                title="变装"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <Icons.Sparkles className="w-4 h-4" />
              </button>
              <button
                onClick={handleClearChat}
                className="hover:bg-white/20 p-1.5 rounded transition-colors"
                title="清空聊天"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <Icons.RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="hover:bg-white/20 p-1.5 rounded transition-colors"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <Icons.ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {skinMenuSource === 'top' && (
            <div
              ref={skinMenuRef}
              className={`absolute top-14 right-3 z-20 w-52 rounded-xl ${currentTheme.panelBorder} ${currentTheme.panelBg} ${currentTheme.panelShadow} p-2`}
            >
              <div className="text-xs text-slate-500 dark:text-slate-300 px-2 py-1">风格与变装</div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                {(Object.values(PET_THEMES) as PetTheme[]).map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => handleThemeSelect(theme.id)}
                    className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors ${petThemeId === theme.id
                      ? 'border-rose-300 bg-rose-50/70 dark:bg-slate-700/70'
                      : 'border-slate-200/70 dark:border-slate-600/60 hover:border-rose-200'}
                    `}
                  >
                    <span className={theme.accent}>●</span>
                    <span className="text-slate-700 dark:text-slate-200">{theme.label}</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {PET_VARIANTS.map((variant) => (
                  <button
                    key={variant.id}
                    onClick={() => handleVariantSelect(variant)}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs transition-colors ${variant.id === currentVariant.id
                      ? 'border-rose-300 bg-rose-50/70 dark:bg-slate-700/70'
                      : 'border-slate-200/70 dark:border-slate-600/60 hover:border-rose-200'}
                    `}
                  >
                    <img src={getSafeSrc(variant.src, failedImageRef.current, fallbackSrc)} alt={variant.label} className="w-8 h-8 object-contain" onError={() => {
                      if (!failedImageRef.current.has(variant.src)) {
                        failedImageRef.current.add(variant.src);
                        setImageErrorTick((tick) => tick + 1);
                      }
                    }} />
                    <span className="text-slate-700 dark:text-slate-200">{variant.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-slate-50/40 to-white/80 dark:from-slate-900/40 dark:to-slate-800/70 transition-colors" style={{ writingMode: 'horizontal-tb', textOrientation: 'mixed' }}>
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className={`w-8 h-8 rounded-full ${currentTheme.messageAssistantBg} ${currentTheme.messageAssistantBorder} flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden p-1 transition-colors`}>
                    <img src={avatarSrc} alt="小魄罗" className="w-full h-full object-contain" onError={() => {
                      if (!failedImageRef.current.has(currentVariant.src)) {
                        failedImageRef.current.add(currentVariant.src);
                        setImageErrorTick((tick) => tick + 1);
                      }
                    }} />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm transition-all ${msg.role === 'user'
                  ? `${currentTheme.messageUserBg} rounded-tr-sm`
                  : `${currentTheme.messageAssistantBg} ${currentTheme.messageAssistantText} rounded-tl-sm ${currentTheme.messageAssistantBorder}`
                  }`}>
                  {msg.role === 'assistant' && !msg.content && (
                    <span className="animate-pulse text-slate-400 dark:text-slate-500 flex items-center gap-2">
                      <span>思考中</span>
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </span>
                    </span>
                  )}
                  {msg.role === 'assistant' ? (
                    (() => {
                      const { main, refs } = splitReferences(msg.content || '');
                      return (
                        <div className="space-y-2">
                          <MarkdownContent
                            compact
                            allowCompactComponents
                            allowHtml={false}
                            className="text-slate-700 dark:text-slate-200 [&_ol]:ml-4 [&_ul]:ml-4 [&_pre]:bg-slate-900 [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_code]:text-slate-100"
                          >
                            {main}
                          </MarkdownContent>
                          {refs && (
                            <div className={`rounded-lg ${currentTheme.messageAssistantBorder} bg-white/70 dark:bg-slate-800/60 px-3 py-2 text-xs ${currentTheme.messageAssistantText}`}>
                              <div className={`font-semibold ${currentTheme.messageAssistantText} mb-1`}>参考文章</div>
                              <MarkdownContent
                                compact
                                allowCompactComponents
                                allowHtml={false}
                                className="text-xs [&_ol]:ml-4 [&_ul]:ml-4"
                              >
                                {refs}
                              </MarkdownContent>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className={`p-3 ${currentTheme.panelBg} ${currentTheme.panelBorder} transition-colors`}>
            <div className="relative" style={{ writingMode: 'horizontal-tb', textOrientation: 'mixed' }}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="和小魄罗聊点什么..."
                disabled={loading}
                className="w-full pl-4 pr-12 py-2.5 bg-white/70 dark:bg-slate-900/70 border-transparent focus:bg-white dark:focus:bg-slate-700 focus:border-rose-300 focus:ring-2 focus:ring-rose-100/60 dark:focus:ring-rose-900/40 rounded-xl text-sm transition-all disabled:opacity-50 dark:text-white"
              />
              <button
                onClick={handleSend}
                disabled={loading}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-gradient-to-r from-rose-400 to-amber-300 dark:from-rose-500 dark:to-amber-400 text-white rounded-lg hover:shadow-lg hover:shadow-rose-200/50 dark:hover:shadow-rose-900/50 transition-all disabled:opacity-50"
              >
                <Icons.Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {isOpen && isMobile && (
        <div className="fixed inset-0 z-[60]">
          <button
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          ></button>
          <div
            className={`absolute bottom-0 left-0 w-full rounded-t-2xl ${currentTheme.panelBg} ${currentTheme.panelShadow} ${currentTheme.panelBorder} flex flex-col overflow-hidden ${drawerDragging ? 'transition-none' : 'transition-all'}`}
            style={{ height: drawerHeight, paddingBottom: 'env(safe-area-inset-bottom)', transform: `translateY(${Math.max(drawerDrag, 0)}px)` }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div
              className={`flex flex-col gap-2 px-4 pt-3 pb-2 text-white ${currentTheme.panelHeaderBg}`}
              onPointerDown={handleDrawerPointerDown}
            >
              <div className="flex justify-center">
                <div className="h-1.5 w-10 rounded-full bg-white/70"></div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img src={avatarSrc} alt="小魄罗" className="w-7 h-7 rounded-full bg-white/80 p-0.5" onError={() => {
                    if (!failedImageRef.current.has(currentVariant.src)) {
                      failedImageRef.current.add(currentVariant.src);
                      setImageErrorTick((tick) => tick + 1);
                    }
                  }} />
                  <span className="font-bold">小魄罗</span>
                  <span className="text-xs opacity-80">{currentVariant.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleThemeSelect(petThemeId === 'cute' ? 'minimal' : 'cute')}
                    className="hover:bg-white/20 p-1.5 rounded transition-colors"
                  >
                    {petThemeId === 'cute' ? <Icons.Moon className="w-4 h-4" /> : <Icons.Sun className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => toggleSkinMenu('top')}
                    className="hover:bg-white/20 p-1.5 rounded transition-colors"
                  >
                    <Icons.Sparkles className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleClearChat}
                    className="hover:bg-white/20 p-1.5 rounded transition-colors"
                  >
                    <Icons.RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="hover:bg-white/20 p-1.5 rounded transition-colors"
                  >
                    <Icons.ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {skinMenuSource === 'top' && (
              <div className={`px-4 py-3 ${currentTheme.panelBorder}`}>
                <div className="text-xs text-slate-500 dark:text-slate-300 mb-2">风格与变装</div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {(Object.values(PET_THEMES) as PetTheme[]).map((theme) => (
                    <button
                      key={theme.id}
                      onClick={() => handleThemeSelect(theme.id)}
                      className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors ${petThemeId === theme.id
                        ? 'border-rose-300 bg-rose-50/70 dark:bg-slate-700/70'
                        : 'border-slate-200/70 dark:border-slate-600/60 hover:border-rose-200'}
                      `}
                    >
                      <span className={theme.accent}>●</span>
                      <span className="text-slate-700 dark:text-slate-200">{theme.label}</span>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {PET_VARIANTS.map((variant) => (
                    <button
                      key={variant.id}
                      onClick={() => handleVariantSelect(variant)}
                      className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs transition-colors ${variant.id === currentVariant.id
                        ? 'border-rose-300 bg-rose-50/70 dark:bg-slate-700/70'
                        : 'border-slate-200/70 dark:border-slate-600/60 hover:border-rose-200'}
                      `}
                    >
                      <img src={getSafeSrc(variant.src, failedImageRef.current, fallbackSrc)} alt={variant.label} className="w-8 h-8 object-contain" onError={() => {
                        if (!failedImageRef.current.has(variant.src)) {
                          failedImageRef.current.add(variant.src);
                          setImageErrorTick((tick) => tick + 1);
                        }
                      }} />
                      <span className="text-slate-700 dark:text-slate-200">{variant.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 bg-gradient-to-b from-slate-50/40 to-white/80 dark:from-slate-900/40 dark:to-slate-800/70" style={{ writingMode: 'horizontal-tb', textOrientation: 'mixed' }}>
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className={`w-8 h-8 rounded-full ${currentTheme.messageAssistantBg} ${currentTheme.messageAssistantBorder} flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden p-1`}>
                      <img src={avatarSrc} alt="小魄罗" className="w-full h-full object-contain" onError={() => {
                        if (!failedImageRef.current.has(currentVariant.src)) {
                          failedImageRef.current.add(currentVariant.src);
                          setImageErrorTick((tick) => tick + 1);
                        }
                      }} />
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${msg.role === 'user'
                    ? `${currentTheme.messageUserBg} rounded-tr-sm`
                    : `${currentTheme.messageAssistantBg} ${currentTheme.messageAssistantText} rounded-tl-sm ${currentTheme.messageAssistantBorder}`
                    }`}>
                    {msg.role === 'assistant' && !msg.content && (
                      <span className="animate-pulse text-slate-400 dark:text-slate-500 flex items-center gap-2">
                        <span>思考中</span>
                        <span className="flex gap-1">
                          <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                          <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                          <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                        </span>
                      </span>
                    )}
                    {msg.role === 'assistant' ? (
                      (() => {
                        const { main, refs } = splitReferences(msg.content || '');
                        return (
                          <div className="space-y-2">
                            <MarkdownContent
                              compact
                              allowCompactComponents
                              allowHtml={false}
                              className="text-slate-700 dark:text-slate-200 [&_ol]:ml-4 [&_ul]:ml-4 [&_pre]:bg-slate-900 [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_code]:text-slate-100"
                            >
                              {main}
                            </MarkdownContent>
                            {refs && (
                              <div className={`rounded-lg ${currentTheme.messageAssistantBorder} bg-white/70 dark:bg-slate-800/60 px-3 py-2 text-xs ${currentTheme.messageAssistantText}`}>
                                <div className={`font-semibold ${currentTheme.messageAssistantText} mb-1`}>参考文章</div>
                                <MarkdownContent
                                  compact
                                  allowCompactComponents
                                  allowHtml={false}
                                  className="text-xs [&_ol]:ml-4 [&_ul]:ml-4"
                                >
                                  {refs}
                                </MarkdownContent>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className={`p-3 ${currentTheme.panelBg} ${currentTheme.panelBorder}`}>
              <div className="relative" style={{ writingMode: 'horizontal-tb', textOrientation: 'mixed' }}>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="和小魄罗聊点什么..."
                  disabled={loading}
                  className="w-full pl-4 pr-12 py-2.5 bg-white/70 dark:bg-slate-900/70 border-transparent focus:bg-white dark:focus:bg-slate-700 focus:border-rose-300 focus:ring-2 focus:ring-rose-100/60 dark:focus:ring-rose-900/40 rounded-xl text-sm transition-all disabled:opacity-50 dark:text-white"
                />
                <button
                  onClick={handleSend}
                  disabled={loading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-gradient-to-r from-rose-400 to-amber-300 dark:from-rose-500 dark:to-amber-400 text-white rounded-lg hover:shadow-lg hover:shadow-rose-200/50 dark:hover:shadow-rose-900/50 transition-all disabled:opacity-50"
                >
                  <Icons.Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        {bubbleVisible && !isOpen && !isDragging && (
          <button
            onClick={handleBubbleClick}
            className={`absolute text-sm font-medium transition-all duration-300 ${currentTheme.bubbleBg} ${currentTheme.bubbleText} ${currentTheme.bubbleShadow} ${bubbleDirection.startsWith('right') ? 'left-full ml-3' : 'right-full mr-3'} ${bubbleDirection.endsWith('top') ? 'bottom-6' : 'top-1/2 -translate-y-1/2'} px-4 py-2 rounded-2xl ${bubbleDirection.startsWith('right') ? 'rounded-bl-sm' : 'rounded-br-sm'}`}
            style={{ writingMode: 'horizontal-tb', textOrientation: 'mixed' }}
          >
            <MarkdownContent allowHtml={false} compact className="text-sm leading-relaxed">
              {bubbleText}
            </MarkdownContent>
            <span
              className={`absolute w-3 h-3 rotate-45 ${currentTheme.bubbleTail} ${bubbleDirection.startsWith('right') ? '-left-1' : '-right-1'} ${bubbleDirection.endsWith('top') ? 'bottom-4' : 'top-1/2 -translate-y-1/2'}`}
            ></span>
          </button>
        )}

        <div
          className="pet-avatar-container relative group cursor-pointer"
          onPointerDown={(event) => handlePointerDown(event, true)}
          style={{ cursor: isDragging ? 'grabbing' : isMobile ? 'pointer' : 'grab' }}
        >
          {debugEnabled && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                setDebugOpen((prev) => !prev);
                setDebugBadge(0);
              }}
              className="absolute -top-2 right-0 z-10 w-6 h-6 rounded-full bg-slate-900/80 text-white text-[10px] font-semibold flex items-center justify-center"
              title="调试面板"
            >
              {debugBadge > 9 ? '9+' : debugBadge}
            </button>
          )}

          {!isOpen && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                toggleSkinMenu('bottom');
              }}
              className={`absolute -top-2 -left-2 z-10 w-7 h-7 rounded-full ${currentTheme.panelBg} ${currentTheme.panelBorder} shadow-sm flex items-center justify-center ${currentTheme.messageAssistantText} hover:scale-105 transition-transform`}
              title="切换变装"
            >
              <Icons.Sparkles className="w-3.5 h-3.5" />
            </button>
          )}

          {debugOpen && debugEnabled && (
            <div className={`absolute bottom-full right-0 mb-3 w-56 rounded-xl ${currentTheme.panelBorder} ${currentTheme.panelBg} ${currentTheme.panelShadow} p-3 text-xs ${currentTheme.messageAssistantText}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold">触发调试</span>
                <button
                  onClick={() => setDebugOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  关闭
                </button>
              </div>
              <div className="mb-2">次数：{debugLogs.length}</div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {debugLogs.length === 0 && <div className="text-slate-400">暂无记录</div>}
                {debugLogs.map((item, index) => (
                  <div key={`${item.time}-${index}`} className="flex justify-between gap-2">
                    <span className="text-slate-400">{item.time}</span>
                    <span className="truncate">{item.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {skinMenuSource === 'bottom' && !isOpen && (
            <div
              ref={skinMenuRef}
              className={`absolute bottom-full left-0 mb-3 z-20 w-52 rounded-xl ${currentTheme.panelBorder} ${currentTheme.panelBg} ${currentTheme.panelShadow} p-2`}
            >
              <div className="text-xs text-slate-500 dark:text-slate-300 px-2 py-1">风格与变装</div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                {(Object.values(PET_THEMES) as PetTheme[]).map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => handleThemeSelect(theme.id)}
                    className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors ${petThemeId === theme.id
                      ? 'border-rose-300 bg-rose-50/70 dark:bg-slate-700/70'
                      : 'border-slate-200/70 dark:border-slate-600/60 hover:border-rose-200'}
                    `}
                  >
                    <span className={theme.accent}>●</span>
                    <span className="text-slate-700 dark:text-slate-200">{theme.label}</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {PET_VARIANTS.map((variant) => (
                  <button
                    key={variant.id}
                    onClick={() => handleVariantSelect(variant)}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs transition-colors ${variant.id === currentVariant.id
                      ? 'border-rose-300 bg-rose-50/70 dark:bg-slate-700/70'
                      : 'border-slate-200/70 dark:border-slate-600/60 hover:border-rose-200'}
                    `}
                  >
                    <img src={getSafeSrc(variant.src, failedImageRef.current, fallbackSrc)} alt={variant.label} className="w-8 h-8 object-contain" onError={() => {
                      if (!failedImageRef.current.has(variant.src)) {
                        failedImageRef.current.add(variant.src);
                        setImageErrorTick((tick) => tick + 1);
                      }
                    }} />
                    <span className="text-slate-700 dark:text-slate-200">{variant.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div
            className={`rounded-full ${currentTheme.avatarBg} flex items-center justify-center ${currentTheme.avatarShadow} transition-all duration-300 overflow-hidden ${currentTheme.avatarBorder} p-2 ${!isOpen ? 'hover:scale-110' : ''}`}
            style={{ width: avatarSize, height: avatarSize }}
          >
            <img
              src={avatarSrc}
              alt="小魄罗桌宠"
              className={`w-full h-full object-contain ${!isOpen && !isDragging ? 'animate-bounce' : ''}`}
              style={{ animationDuration: '3s' }}
              draggable={false}
              onError={() => {
                if (!failedImageRef.current.has(currentVariant.src)) {
                  failedImageRef.current.add(currentVariant.src);
                  setImageErrorTick((tick) => tick + 1);
                }
              }}
            />
          </div>

          <span className="absolute bottom-1 right-1 w-3.5 h-3.5 bg-green-500 border-2 border-white/70 dark:border-slate-700/70 rounded-full shadow-sm"></span>

          <div className={`absolute inset-0 rounded-full ${currentTheme.avatarGlow} blur-xl -z-10 transition-all`}></div>
        </div>
      </div>
    </div>
  );
};

export default DesktopPet;
