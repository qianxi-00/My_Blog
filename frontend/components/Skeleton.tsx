import React from 'react';

/**
 * 五十三期：骨架屏原子组件。
 *
 * 之前各页面的加载态是「加载中...」纯文字或转圈，页面高度会在数据到达时突然跳变；
 * 骨架屏用与真实布局接近的灰块占位，数据到达后由 fade-up 淡入，感知等待更短、
 * 也不容易产生 CLS。全部用 CSS shimmer，无第三方依赖。
 */

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`skeleton ${className}`} aria-hidden="true" />
);

const TextLines: React.FC<{ lines?: number; className?: string }> = ({ lines = 4, className = '' }) => (
    <div className={`space-y-3 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
            <Skeleton key={i} className={`h-4 ${i === lines - 1 ? 'w-3/5' : i % 4 === 3 ? 'w-4/5' : 'w-full'}`} />
        ))}
    </div>
);

export const CardSkeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-3 ${className}`}>
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <div className="flex gap-2 pt-1">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
        </div>
    </div>
);

export const ListSkeleton: React.FC<{ rows?: number; className?: string }> = ({ rows = 4, className = '' }) => (
    <div className={`space-y-4 ${className}`} aria-busy="true" aria-label="内容加载中">
        {Array.from({ length: rows }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
);

/** 文章 / 热点 / 提示词 / 帖子详情页通用骨架：标题 + 元信息 + 正文块（右侧栏在宽屏下占位） */
export const DetailSkeleton: React.FC = () => (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12" aria-busy="true" aria-label="内容加载中">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_18rem] gap-10">
            <div className="max-w-3xl w-full mx-auto space-y-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-11/12" />
                <Skeleton className="h-9 w-3/5" />
                <div className="flex gap-3 pt-1">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-56 w-full rounded-2xl mt-6" />
                <TextLines lines={8} className="pt-4" />
            </div>
            <div className="hidden xl:block space-y-4">
                <Skeleton className="h-44 w-full rounded-2xl" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
            </div>
        </div>
    </div>
);

/** 作者主页骨架 */
export const ProfileSkeleton: React.FC = () => (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-6" aria-busy="true" aria-label="作者信息加载中">
        <div className="flex items-center gap-5">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="space-y-3 flex-1">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-64" />
            </div>
        </div>
        <ListSkeleton rows={3} />
    </div>
);

/** 整页骨架（AI 日报等全屏页面） */
export const PageSkeleton: React.FC = () => (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900" aria-busy="true" aria-label="页面加载中">
        <div className="max-w-5xl mx-auto px-4 py-16 space-y-6">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-4 w-80" />
            <Skeleton className="h-40 w-full rounded-3xl" />
            <ListSkeleton rows={3} />
        </div>
    </div>
);
