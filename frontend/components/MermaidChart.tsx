import React, { useEffect, useRef, useState } from 'react';

interface MermaidChartProps {
    chart: string;
}

// mermaid 本身约 800KB，不在模块顶层 import —— 只有真的渲染图表时才拉。
// 用 Promise 缓存保证 initialize 全局只跑一次（并发组件也只初始化一次），
// 配置与原先模块顶层的 initialize 完全一致。
let mermaidPromise: Promise<any> | null = null;
const loadMermaid = (): Promise<any> => {
    if (!mermaidPromise) {
        mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
            mermaid.initialize({
                startOnLoad: false,
                theme: 'neutral',
                securityLevel: 'loose',
            });
            return mermaid;
        });
    }
    return mermaidPromise;
};

const MermaidChart: React.FC<MermaidChartProps> = ({ chart }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [svgCode, setSvgCode] = useState<string>('');
    const [error, setError] = useState<boolean>(false);

    useEffect(() => {
        let isMounted = true;

        const renderChart = async () => {
            try {
                const mermaid = await loadMermaid();
                if (!isMounted) return;

                // Generate a unique ID to avoid Mermaid caching conflicts during re-renders
                const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

                // Await rendering process
                const { svg } = await mermaid.render(id, chart);

                if (isMounted) {
                    setSvgCode(svg);
                    setError(false);
                }
            } catch (err) {
                console.warn('Failed to parse mermaid diagram:', err);
                if (isMounted) {
                    setError(true);
                }
            }
        };

        if (chart) {
            renderChart();
        }

        return () => {
            isMounted = false;
        };
    }, [chart]);

    if (error) {
        return (
            <div className="bg-red-50 text-red-500 p-4 rounded border border-red-200 text-sm overflow-x-auto my-6 font-mono">
                {chart}
            </div>
        );
    }

    if (!svgCode) {
        // Loading placeholder
        return (
            <div className="flex justify-center items-center py-8 my-6 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 animate-pulse">
                <span className="text-slate-400 dark:text-slate-500">Renderizing chart...</span>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="flex justify-center my-8 p-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-x-auto mermaid-chart-container"
            dangerouslySetInnerHTML={{ __html: svgCode }}
        />
    );
};

export default MermaidChart;
