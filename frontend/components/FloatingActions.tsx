import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icons } from './Icons';

interface FloatingActionsProps {
    likeCount: number;
    liked: boolean;
    commentCount: number;
    onLike: () => void;
    onScrollToComments: () => void;
}

const FloatingActions: React.FC<FloatingActionsProps> = ({
    likeCount,
    liked,
    commentCount,
    onLike,
    onScrollToComments
}) => {
    const [showScrollTop, setShowScrollTop] = useState(false);
    const [showMobileTop, setShowMobileTop] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ x: 32, y: 50 }); // 默认右侧居中 (x 是距右边距离, y 是百分比)
    const containerRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

    // 滚动监听（passive：只读 scrollY，不阻滚动）
    useEffect(() => {
        const handleScroll = () => {
            setShowScrollTop(window.scrollY > 300);
            setShowMobileTop(window.scrollY > 600);
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // 拖动功能
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        // 如果点击的是按钮，不启动拖动
        if ((e.target as HTMLElement).closest('button')) return;

        setIsDragging(true);
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            posX: position.x,
            posY: position.y
        };
        e.preventDefault();
    }, [position]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;

            const deltaX = dragStartRef.current.x - e.clientX;
            const deltaY = e.clientY - dragStartRef.current.y;

            // 计算新的位置
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

    // 基础按钮样式
    const buttonClass = `w-10 h-10 rounded-full bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm shadow-md border border-slate-100 dark:border-slate-700 
        flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:border-cyan-200 dark:hover:border-cyan-800 
        hover:shadow-lg transition-all cursor-pointer relative group hover:bg-white dark:hover:bg-slate-800`;

    return (
        <>
        <div
            ref={containerRef}
            className={`fixed z-40 hidden xl:flex flex-col gap-3 transition-all duration-300 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{
                right: `${position.x}px`,
                top: `${position.y}%`,
                transform: 'translateY(-50%)',
                opacity: isHovered || isDragging ? 1 : 0.4,
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onMouseDown={handleMouseDown}
        >
            {/* 拖动提示区域 */}
            <div className="w-10 h-2 mx-auto rounded-full bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors mb-1"
                title="拖动调整位置" />

            {/* 点赞 */}
            <button
                onClick={onLike}
                className={`${buttonClass} ${liked ? '!text-red-500 !border-red-200 dark:!border-red-900 !bg-red-50 dark:!bg-red-900/30' : ''}`}
                title={liked ? "取消点赞" : "点赞文章"}
            >
                <Icons.ThumbsUp className={`w-5 h-5 ${liked ? 'fill-current' : ''}`} />
                <span className="absolute right-full top-1/2 -translate-y-1/2 mr-3 px-2 py-1 bg-slate-800 dark:bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    {likeCount > 0 ? `${likeCount} 赞` : '点赞'}
                </span>
            </button>

            {/* 评论 */}
            <button
                onClick={onScrollToComments}
                className={buttonClass}
                title="查看评论"
            >
                <Icons.MessageSquare className="w-5 h-5" />
                {commentCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-cyan-500 text-white text-[10px] flex items-center justify-center rounded-full">
                        {commentCount > 99 ? '99+' : commentCount}
                    </span>
                )}
                <span className="absolute right-full top-1/2 -translate-y-1/2 mr-3 px-2 py-1 bg-slate-800 dark:bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    评论区
                </span>
            </button>

            {/* 顶部 */}
            <button
                onClick={scrollToTop}
                className={`${buttonClass} ${showScrollTop ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                title="返回顶部"
            >
                <Icons.ChevronUp className="w-5 h-5" />
            </button>

            {/* 底部 */}
            <button
                onClick={scrollToBottom}
                className={buttonClass}
                title="直达底部"
            >
                <Icons.ArrowDown className="w-5 h-5" />
            </button>
        </div>

        {/* 十三期 D2：移动/窄屏救活——xl 以下整条悬浮栏消失，连返回顶部都没有，
            读长文想回顶只能干滚。渲染最小版：只有返回顶部，44px 触控目标，
            滚动 >600px 才出现，右下角毛玻璃圆钮（避让桌宠的左侧区域）。 */}
        {showMobileTop && (
            <button
                onClick={scrollToTop}
                aria-label="返回顶部"
                className="fixed bottom-6 right-4 z-40 xl:hidden w-11 h-11 rounded-full
                    bg-white/80 dark:bg-slate-800/80 backdrop-blur-md shadow-lg
                    border border-slate-200 dark:border-slate-700
                    flex items-center justify-center text-slate-600 dark:text-slate-300
                    hover:text-cyan-600 dark:hover:text-cyan-400 active:scale-95
                    transition-all animate-fade-in-down"
            >
                <Icons.ChevronUp className="w-5 h-5" />
            </button>
        )}
        </>
    );
};

export default FloatingActions;
