import React from 'react';

interface Props {
    children: React.ReactNode;
}

interface State {
    error: Error | null;
}

/**
 * 全局错误边界（2026-09-28）
 *
 * 此前 App 的 Provider 树里没有任何 ErrorBoundary：任何一处渲染异常都会把整站
 * 打成白屏（典型触发是后端 422 的 detail 数组被当成 React 子节点渲染）。
 * 现在至少给出一屏可读的错误与"刷新 / 回首页"两个出口。
 */
class ErrorBoundary extends React.Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('页面渲染异常', error, info);
    }

    render() {
        const { error } = this.state;
        if (!error) {
            return this.props.children;
        }

        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
                <div className="max-w-lg w-full bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900 rounded-2xl p-6 space-y-4 shadow-sm">
                    <h1 className="text-lg font-bold text-red-600 dark:text-red-400">页面出错了</h1>
                    <p className="text-sm text-slate-600 dark:text-slate-300 break-words">
                        {error.message || String(error)}
                    </p>
                    <div className="flex gap-3">
                        <button
                            onClick={() => window.location.reload()}
                            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium transition-colors"
                        >
                            刷新页面
                        </button>
                        <a
                            href="/"
                            className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                        >
                            回到首页
                        </a>
                    </div>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
