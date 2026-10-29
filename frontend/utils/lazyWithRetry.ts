import React from 'react';

type Loader = () => Promise<{ default: React.ComponentType<any> }>;

/**
 * 带一次重试的 React.lazy（2026-10-29）
 *
 * 背景：路由页和若干组件都是 React.lazy，Vite 会为每个页面切出独立 chunk。chunk 请求
 * 一旦失败——瞬时网络抖动、连接被中间设备掐断、部署换版本后旧 chunk 已删——React 就把
 * 错误抛给最近的 ErrorBoundary。而全局只有一个 ErrorBoundary，结果是**整页**变成
 * 「页面出错了」，用户除了手动刷新没有别的出路。
 *
 * 2026-10-29 就撞上了：右下角那个纯装饰的桌宠 DesktopPet-*.js 拉取失败，整站打不开。
 * 服务端日志里那次请求根本没到 nginx（该 IP 全量日志 404 数为 0），是链路层丢包——
 * 这种失败重试一次基本就过去了。
 *
 * 这里只做一件事：失败后隔 retryDelay 毫秒重试一次。仍然失败才抛给 ErrorBoundary。
 */
export const lazyWithRetry = (factory: Loader, retryDelay = 1000) =>
    React.lazy(() =>
        factory().catch(
            () =>
                new Promise<{ default: React.ComponentType<any> }>((resolve, reject) => {
                    window.setTimeout(() => factory().then(resolve, reject), retryDelay);
                })
        )
    );

/**
 * 装饰性组件专用：加载失败就当它不存在，绝不连累整页。
 *
 * 只给「没有也不影响阅读」的东西用（桌宠这类）。正文、导航、路由页不要用这个——
 * 那些加载不出来时，用户需要看到明确的「刷新页面」出口，而不是一片空白。
 */
export const lazyOptional = (factory: Loader) =>
    React.lazy(() => factory().catch(() => ({ default: () => null })));
