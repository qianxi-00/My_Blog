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
  bookmarked?: boolean;
  onBookmark?: () => void;
  onBackToList: () => void;
  onScrollToTop: () => void;
  onScrollToComments: () => void;
  onCopyLink: () => Promise<void> | void;
  previousItem?: HotspotFloatingToolbarNavItem | null;
  nextItem?: HotspotFloatingToolbarNavItem | null;
}

const PANEL_WIDTH = 56;
const PANEL_HEIGHT = 380;
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
  const boxWidth = hidden ? 48 : PANEL_WIDTH;
  const boxHeight = hidden ? 48 : PANEL_HEIGHT;

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
  bookmarked,
  onBookmark,
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
  const [desktopPosition, setDesktopPosition] = useState<ToolbarPosition>(() =>
    clampPosition({
      x: Math.max(12, getViewportPosition().width - PANEL_WIDTH - 24),
      y: Math.max(12, Math.round(getViewportPosition().height * 0.34)),
    }),
  );
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const latestPosRef = useRef<ToolbarPosition>(desktopPosition);

  useEffect(() => {
    latestPosRef.current = desktopPosition;
  }, [desktopPosition]);

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
      const next = clampPosition({ x: stored.x, y: stored.y }, hidden);
      setDesktopPosition(next);
      latestPosRef.current = next;
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
    if ((event.target as HTMLElement).closest('button')) return;
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
      const next = clampPosition(
        {
          x: dragStateRef.current.originX + (moveEvent.clientX - dragStateRef.current.startX),
          y: dragStateRef.current.originY + (moveEvent.clientY - dragStateRef.current.startY),
        },
        desktopHidden,
      );
      latestPosRef.current = next;
      setDesktopPosition(next);
    };

    const handleUp = () => {
      setDragging(false);
      dragStateRef.current = null;
      persistState(desktopHidden, latestPosRef.current);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
  };

  const actionClass =
    'w-9 h-9 rounded-full border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 hover:border-primary-300 dark:hover:border-primary-700 transition-colors cursor-pointer';

  return (
    <>
      {/* 移动端底部工具条 */}
      <div className="lg:hidden fixed inset-x-4 bottom-4 z-40">
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-lg px-2 py-2">
          <div className="flex items-center justify-around gap-1">
            <button
              type="button"
              onClick={onBackToList}
              className="flex-1 inline-flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Icons.ArrowLeft className="w-4 h-4" />
              列表
            </button>
            {onBookmark && (
              <button
                type="button"
                onClick={onBookmark}
                className={`flex-1 inline-flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800 ${
                  bookmarked ? 'text-primary-600 dark:text-primary-400' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <Icons.Bookmark className={`w-4 h-4 ${bookmarked ? 'fill-current' : ''}`} />
                {bookmarked ? '已藏' : '收藏'}
              </button>
            )}
            <button
              type="button"
              onClick={onScrollToComments}
              className="flex-1 inline-flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Icons.MessageSquare className="w-4 h-4" />
              评论
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 inline-flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {copied ? <Icons.Check className="w-4 h-4 text-emerald-500" /> : <Icons.Link className="w-4 h-4" />}
              {copied ? '已复制' : '链接'}
            </button>
            <button
              type="button"
              onClick={previousItem?.onClick}
              disabled={!previousItem}
              className="flex-1 inline-flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed"
            >
              <Icons.ChevronLeft className="w-4 h-4" />
              上一篇
            </button>
            <button
              type="button"
              onClick={nextItem?.onClick}
              disabled={!nextItem}
              className="flex-1 inline-flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed"
            >
              <Icons.ChevronRight className="w-4 h-4" />
              下一篇
            </button>
            <button
              type="button"
              onClick={onScrollToTop}
              className="flex-1 inline-flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Icons.ChevronUp className="w-4 h-4" />
              顶部
            </button>
          </div>
        </div>
      </div>

      {/* 桌面端可拖拽悬浮工具条 */}
      <div className="hidden lg:block fixed z-40" style={{ left: desktopPosition.x, top: desktopPosition.y }}>
        {desktopHidden ? (
          <div
            onPointerDown={startDrag}
            className="rounded-full border border-slate-200/90 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-sm p-1 cursor-grab select-none"
            title="拖动或打开阅读工具"
          >
            <button
              type="button"
              onClick={handleShowDesktop}
              className="w-9 h-9 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer"
              title="显示阅读工具"
            >
              <Icons.PanelRightOpen className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div
            onPointerDown={startDrag}
            className={`rounded-2xl border border-slate-200/90 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-md p-2 cursor-grab select-none ${
              dragging ? 'cursor-grabbing' : ''
            }`}
            title="空白处可拖动阅读工具"
          >
            <div className="flex flex-col gap-1.5 items-center">
              <button type="button" onClick={handleHideDesktop} className={actionClass} title="收起阅读工具">
                <Icons.PanelRightClose className="w-4 h-4" />
              </button>

              <button type="button" onClick={onBackToList} className={actionClass} title="返回热点列表">
                <Icons.ArrowLeft className="w-4 h-4" />
              </button>

              {onBookmark && (
                <button
                  type="button"
                  onClick={onBookmark}
                  className={`${actionClass} ${
                    bookmarked
                      ? 'border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400'
                      : ''
                  }`}
                  title={bookmarked ? '取消收藏' : '收藏热点'}
                >
                  <Icons.Bookmark className={`w-4 h-4 ${bookmarked ? 'fill-current' : ''}`} />
                </button>
              )}

              <button
                type="button"
                onClick={previousItem?.onClick}
                disabled={!previousItem}
                className={`${actionClass} ${previousItem ? '' : 'opacity-35 cursor-not-allowed'}`}
                title={previousItem?.title || '没有上一篇'}
              >
                <Icons.ChevronLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={nextItem?.onClick}
                disabled={!nextItem}
                className={`${actionClass} ${nextItem ? '' : 'opacity-35 cursor-not-allowed'}`}
                title={nextItem?.title || '没有下一篇'}
              >
                <Icons.ChevronRight className="w-4 h-4" />
              </button>

              <button type="button" onClick={onScrollToComments} className={actionClass} title="跳转到评论区">
                <Icons.MessageSquare className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleCopy}
                className={`${actionClass} ${copied ? 'border-emerald-300 text-emerald-600 dark:text-emerald-400' : ''}`}
                title={copied ? '链接已复制' : '复制当前链接'}
              >
                {copied ? <Icons.Check className="w-4 h-4" /> : <Icons.Copy className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={onScrollToTop}
                className={`${actionClass} ${showScrollTop ? 'opacity-100' : 'opacity-45'}`}
                title="回到顶部"
              >
                <Icons.ChevronUp className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default HotspotFloatingToolbar;
