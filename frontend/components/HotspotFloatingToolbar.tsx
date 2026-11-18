import React, { useEffect, useRef, useState } from 'react';
import { Icons } from './Icons';

export interface HotspotFloatingToolbarNavItem {
  label: string;
  title?: string;
  onClick: () => void;
}

interface HotspotFloatingToolbarProps {
  title: string;
  category?: string;
  onBackToList: () => void;
  onScrollToTop: () => void;
  onScrollToComments: () => void;
  onCopyLink: () => Promise<void> | void;
  previousItem?: HotspotFloatingToolbarNavItem | null;
  nextItem?: HotspotFloatingToolbarNavItem | null;
}

const PANEL_WIDTH = 72;
const PANEL_HEIGHT = 360;
const STORAGE_KEY = 'hotspot_floating_toolbar_state_v2';

type ToolbarPosition = {
  x: number;
  y: number;
};

type ToolbarState = {
  hidden?: boolean;
  x?: number;
  y?: number;
};

const getViewportPosition = () => {
  if (typeof window === 'undefined') return { width: 1440, height: 900 };
  return { width: window.innerWidth, height: window.innerHeight };
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const clampPosition = (position: ToolbarPosition, hidden = false) => {
  const { width, height } = getViewportPosition();
  const boxWidth = hidden ? 56 : PANEL_WIDTH;
  const boxHeight = hidden ? 56 : PANEL_HEIGHT;

  return {
    x: clamp(position.x, 12, Math.max(12, width - boxWidth - 12)),
    y: clamp(position.y, 12, Math.max(12, height - boxHeight - 12)),
  };
};

const readStoredState = (): ToolbarState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ToolbarState;
  } catch {
    return null;
  }
};

const writeStoredState = (state: ToolbarState) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const HotspotFloatingToolbar: React.FC<HotspotFloatingToolbarProps> = ({
  onBackToList,
  onScrollToTop,
  onScrollToComments,
  onCopyLink,
  previousItem,
  nextItem,
}) => {
  const [copied, setCopied] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [desktopHidden, setDesktopHidden] = useState(false);
  const [desktopPosition, setDesktopPosition] = useState<ToolbarPosition>(() => clampPosition({
    x: Math.max(12, getViewportPosition().width - PANEL_WIDTH - 24),
    y: Math.max(12, Math.round(getViewportPosition().height * 0.34)),
  }));
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 280);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const stored = readStoredState();
    if (!stored) return;
    const hidden = Boolean(stored.hidden);
    setDesktopHidden(hidden);
    if (typeof stored.x === 'number' && typeof stored.y === 'number') {
      setDesktopPosition(clampPosition({ x: stored.x, y: stored.y }, hidden));
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setDesktopPosition((prev) => clampPosition(prev, desktopHidden));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [desktopHidden]);

  const persistState = (hidden: boolean, position: ToolbarPosition) => {
    const next = clampPosition(position, hidden);
    writeStoredState({ hidden, x: next.x, y: next.y });
  };

  const handleCopy = async () => {
    await onCopyLink();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const handleHideDesktop = () => {
    setDesktopHidden(true);
    setDesktopPosition((prev) => {
      const next = clampPosition(prev, true);
      persistState(true, next);
      return next;
    });
  };

  const handleShowDesktop = () => {
    setDesktopHidden(false);
    setDesktopPosition((prev) => {
      const next = clampPosition(prev, false);
      persistState(false, next);
      return next;
    });
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: desktopPosition.x,
      originY: desktopPosition.y,
    };
    setDragging(true);

    const handleMove = (moveEvent: PointerEvent) => {
      if (!dragStateRef.current) return;
      const next = clampPosition({
        x: dragStateRef.current.originX + (moveEvent.clientX - dragStateRef.current.startX),
        y: dragStateRef.current.originY + (moveEvent.clientY - dragStateRef.current.startY),
      }, desktopHidden);
      setDesktopPosition(next);
    };

    const handleUp = () => {
      setDragging(false);
      dragStateRef.current = null;
      persistState(desktopHidden, desktopPosition);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
  };

  const actionClass = 'w-11 h-11 rounded-full border border-white/55 bg-white/72 dark:bg-slate-800/72 dark:border-slate-700/80 backdrop-blur-xl shadow-md flex items-center justify-center text-slate-600 dark:text-slate-200 hover:text-cyan-600 dark:hover:text-cyan-300 hover:border-cyan-200 dark:hover:border-cyan-700 transition-all';

  return (
    <>
      <div className="lg:hidden fixed inset-x-4 bottom-5 z-40">
        <div className="rounded-2xl border border-white/60 dark:border-slate-700/80 bg-white/78 dark:bg-slate-800/82 backdrop-blur-2xl shadow-xl px-4 py-3">
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={onBackToList} className="inline-flex flex-col items-center justify-center gap-1 rounded-xl bg-slate-50 dark:bg-slate-900/50 px-2 py-2.5 text-xs text-slate-600 dark:text-slate-300">
              <Icons.ArrowLeft className="w-4 h-4" />
              列表
            </button>
            <button type="button" onClick={onScrollToComments} className="inline-flex flex-col items-center justify-center gap-1 rounded-xl bg-slate-50 dark:bg-slate-900/50 px-2 py-2.5 text-xs text-slate-600 dark:text-slate-300">
              <Icons.MessageSquare className="w-4 h-4" />
              评论
            </button>
            <button type="button" onClick={onScrollToTop} className="inline-flex flex-col items-center justify-center gap-1 rounded-xl bg-slate-50 dark:bg-slate-900/50 px-2 py-2.5 text-xs text-slate-600 dark:text-slate-300">
              <Icons.ChevronUp className="w-4 h-4" />
              顶部
            </button>
            <button type="button" onClick={handleCopy} className="inline-flex flex-col items-center justify-center gap-1 rounded-xl bg-slate-50 dark:bg-slate-900/50 px-2 py-2.5 text-xs text-slate-600 dark:text-slate-300">
              <Icons.Link className="w-4 h-4" />
              {copied ? '已复制' : '链接'}
            </button>
            <button type="button" onClick={previousItem?.onClick} disabled={!previousItem} className="inline-flex flex-col items-center justify-center gap-1 rounded-xl bg-slate-50 dark:bg-slate-900/50 px-2 py-2.5 text-xs text-slate-600 dark:text-slate-300 disabled:opacity-35 disabled:cursor-not-allowed">
              <Icons.ChevronLeft className="w-4 h-4" />
              上一篇
            </button>
            <button type="button" onClick={nextItem?.onClick} disabled={!nextItem} className="inline-flex flex-col items-center justify-center gap-1 rounded-xl bg-slate-50 dark:bg-slate-900/50 px-2 py-2.5 text-xs text-slate-600 dark:text-slate-300 disabled:opacity-35 disabled:cursor-not-allowed">
              <Icons.ChevronRight className="w-4 h-4" />
              下一篇
            </button>
          </div>
        </div>
      </div>

      <div className="hidden lg:block fixed z-40" style={{ left: desktopPosition.x, top: desktopPosition.y }}>
        {desktopHidden ? (
          <div
            onPointerDown={startDrag}
            className="rounded-full border border-white/60 dark:border-slate-700/80 bg-white/78 dark:bg-slate-800/82 backdrop-blur-2xl shadow-lg p-1.5 cursor-grab select-none"
            title="拖动或打开阅读工具"
          >
            <button
              type="button"
              onClick={handleShowDesktop}
              className="w-10 h-10 rounded-full border border-white/55 bg-white/72 dark:bg-slate-800/72 dark:border-slate-700/80 backdrop-blur-xl shadow-sm flex items-center justify-center text-slate-600 dark:text-slate-200 hover:text-cyan-600 dark:hover:text-cyan-300 hover:border-cyan-200 dark:hover:border-cyan-700 transition-all"
              title="显示阅读工具"
            >
              <Icons.PanelRightOpen className="w-4.5 h-4.5" />
            </button>
          </div>
        ) : (
          <div
            onPointerDown={startDrag}
            className={`rounded-[28px] border border-white/60 dark:border-slate-700/80 bg-white/78 dark:bg-slate-800/82 backdrop-blur-2xl shadow-xl p-3 cursor-grab select-none ${dragging ? 'cursor-grabbing' : ''}`}
            title="拖动阅读工具"
          >
            <div className="flex flex-col gap-2 items-center">
              <button
                type="button"
                onClick={handleHideDesktop}
                className={actionClass}
                title="关闭阅读工具"
              >
                <Icons.PanelRightClose className="w-4.5 h-4.5" />
              </button>

              <button type="button" onClick={onBackToList} className={actionClass} title="返回热点列表">
                <Icons.ArrowLeft className="w-4.5 h-4.5" />
              </button>

              <button
                type="button"
                onClick={previousItem?.onClick}
                disabled={!previousItem}
                className={`${actionClass} ${previousItem ? '' : 'opacity-35 cursor-not-allowed'}`}
                title={previousItem?.title || '没有上一篇'}
              >
                <Icons.ChevronLeft className="w-4.5 h-4.5" />
              </button>

              <button
                type="button"
                onClick={nextItem?.onClick}
                disabled={!nextItem}
                className={`${actionClass} ${nextItem ? '' : 'opacity-35 cursor-not-allowed'}`}
                title={nextItem?.title || '没有下一篇'}
              >
                <Icons.ChevronRight className="w-4.5 h-4.5" />
              </button>

              <button type="button" onClick={onScrollToComments} className={actionClass} title="跳转到评论区">
                <Icons.MessageSquare className="w-4.5 h-4.5" />
              </button>

              <button type="button" onClick={handleCopy} className={actionClass} title={copied ? '链接已复制' : '复制当前链接'}>
                <Icons.Copy className="w-4.5 h-4.5" />
              </button>

              <button
                type="button"
                onClick={onScrollToTop}
                className={`${actionClass} ${showScrollTop ? 'opacity-100' : 'opacity-45'}`}
                title="回到顶部"
              >
                <Icons.ChevronUp className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default HotspotFloatingToolbar;
