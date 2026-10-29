import React, { Suspense, act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeAll } from 'vitest';
import { lazyWithRetry, lazyOptional } from '../utils/lazyWithRetry';

// React 19 的 act 需要这个全局开关，否则会打 "not wrapped in act(...)" 警告。
beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 把懒加载组件挂到容器里（外面不套 ErrorBoundary，异常会直接冒出来） */
const mount = async (Comp: React.ComponentType<any>, container: HTMLElement): Promise<Root> => {
    const root = createRoot(container);
    await act(async () => {
        root.render(
            React.createElement(
                Suspense,
                { fallback: React.createElement('span', null, 'loading') },
                React.createElement(Comp)
            )
        );
    });
    return root;
};

describe('lazyWithRetry', () => {
    it('第一次加载失败会重试，第二次成功后正常渲染', async () => {
        let calls = 0;
        const Comp = lazyWithRetry(() => {
            calls += 1;
            if (calls === 1) {
                return Promise.reject(new Error('Failed to fetch dynamically imported module'));
            }
            return Promise.resolve({ default: () => React.createElement('div', null, '桌宠') });
        }, 10);

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = await mount(Comp, container);

        // 等重试窗口过去
        await act(async () => {
            await wait(80);
        });

        expect(calls).toBe(2);
        expect(container.textContent).toContain('桌宠');

        await act(async () => root.unmount());
        container.remove();
    });
});

describe('lazyOptional', () => {
    it('加载失败时当组件不存在，绝不把异常抛给页面', async () => {
        const Comp = lazyOptional(() => Promise.reject(new Error('装饰组件加载失败')));

        const container = document.createElement('div');
        document.body.appendChild(container);

        // 外面没有 ErrorBoundary。如果 lazyOptional 把异常抛出去，mount 会直接抛。
        const root = await mount(Comp, container);
        await act(async () => {
            await wait(80);
        });

        expect(container.textContent).toBe('');

        await act(async () => root.unmount());
        container.remove();
    });
});
