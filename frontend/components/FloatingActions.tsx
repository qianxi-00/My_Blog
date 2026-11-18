import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icons } from './Icons';

interface FloatingActionsProps {
    likeCount: number;
    liked: boolean;
    bookmarked?: boolean;
    commentCount: number;
    onLike: () => void;
    onBookmark?: () => void;
    onScrollToComments: () => void;
}

const FloatingActions: React.FC<FloatingActionsProps> = ({
    likeCount,
    liked,
    bookmarked = false,
    commentCount,
    onLike,
    onBookmark,
    onScrollToComments,
}) => {
    const [showScrollTop, setShowScrollTop] = useState(false);
    const [showMobileTop, setShowMobileTop] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ x: 32, y: 50 });
    const containerRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

    useEffect(() => {
        const handleScroll = () => {
            setShowScrollTop(window.scrollY > 300);
            setShowMobileTop(window.scrollY > 600);
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button')) return;

        setIsDragging(true);
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            posX: position.x,
            posY: position.y,
        };
        e.preventDefault();
    }, [position]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const deltaX = dragStartRef.current.x - e.clientX;
            const deltaY = e.clientY - dragStartRef.current.y;
            const newX = Math.max(10, Math.min(window.innerWidth - 80, dragStartRef.current.posX + deltaX));
            const newYPercent = dragStartRef.current.posY + (deltaY / window.innerHeight) * 100;
            const clampedY = Math.max(10, Math.min(90, newYPercent));
            setPosition({ x: newX, y: clampedY });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const scrollToBottom = () => {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    };

    const buttonClass =
        'w-10 h-10 rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-700 ' +
        'flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 ' +
        'hover:border-primary-300 dark:hover:border-primary-700 shadow-sm transition-all cursor-pointer relative group';

    return (
        <>
            <div
                ref={containerRef}
                className={`fixed z-40 hidden xl:flex flex-col gap-2.5 transition-opacity duration-200 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                style={{
                    right: `${position.x}px`,
                    top: `${position.y}%`,
                    transform: 'translateY(-50%)',
                    opacity: isHovered || isDragging ? 1 : 0.55,
                }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onMouseDown={handleMouseDown}
            >
                <div
                    className="w-8 h-1.5 mx-auto rounded-full bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors mb-0.5"
                    title="拖动调整位置"
                />

                {/* 点赞 */}
                <button
                    type="button"
                    onClick={onLike}
                    className={`${buttonClass} ${liked ? '!text-red-500 !border-red-200 dark:!border-red-900/60 !bg-red-50 dark:!bg-red-950/50' : ''}`}
                    title={liked ? '取消点赞' : '点赞文章'}
                >
                    <Icons.ThumbsUp className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
                    <span className="absolute right-full top-1/2 -translate-y-1/2 mr-3 px-2 py-1 bg-slate-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        {likeCount > 0 ? `${likeCount} 赞` : '点赞'}
                    </span>
                </button>

                {/* 收藏 */}
                {onBookmark && (
                    <button
                        type="button"
                        onClick={onBookmark}
                        className={`${buttonClass} ${bookmarked ? '!text-amber-600 dark:!text-amber-400 !border-amber-200 dark:!border-amber-800 !bg-amber-50 dark:!bg-amber-950/50' : ''}`}
                        title={bookmarked ? '取消收藏' : '收藏文章'}
                    >
                        <Icons.Bookmark className={`w-4 h-4 ${bookmarked ? 'fill-current' : ''}`} />
                        <span className="absolute right-full top-1/2 -translate-y-1/2 mr-3 px-2 py-1 bg-slate-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                            {bookmarked ? '已收藏' : '收藏'}
                        </span>
                    </button>
                )}

                {/* 评论 */}
                <button
                    type="button"
                    onClick={onScrollToComments}
                    className={buttonClass}
                    title="查看评论"
                >
                    <Icons.MessageSquare className="w-4 h-4" />
                    {commentCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-primary-600 text-white text-[10px] font-medium flex items-center justify-center rounded-full tabular-nums">
                            {commentCount > 99 ? '99+' : commentCount}
                        </span>
                    )}
                    <span className="absolute right-full top-1/2 -translate-y-1/2 mr-3 px-2 py-1 bg-slate-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        评论区
                    </span>
                </button>

                {/* 顶部 */}
                <button
                    type="button"
                    onClick={scrollToTop}
                    className={`${buttonClass} ${showScrollTop ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                    title="返回顶部"
                >
                    <Icons.ChevronUp className="w-4 h-4" />
                </button>

                {/* 底部 */}
                <button
                    type="button"
                    onClick={scrollToBottom}
                    className={buttonClass}
                    title="直达底部"
                >
                    <Icons.ArrowDown className="w-4 h-4" />
                </button>
            </div>

            {showMobileTop && (
                <button
                    type="button"
                    onClick={scrollToTop}
                    aria-label="返回顶部"
                    className="fixed bottom-6 right-4 z-40 xl:hidden w-11 h-11 rounded-full
                        bg-white/90 dark:bg-slate-900/90 backdrop-blur-md shadow-sm
                        border border-slate-200 dark:border-slate-700
                        flex items-center justify-center text-slate-600 dark:text-slate-300
                        hover:text-primary-600 dark:hover:text-primary-400 active:scale-95
                        transition-all animate-fade-in-down"
                >
                    <Icons.ChevronUp className="w-5 h-5" />
                </button>
            )}
        </>
    );
};

export default FloatingActions;
