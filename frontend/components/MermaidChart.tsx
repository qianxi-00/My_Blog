import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface MermaidChartProps {
    chart: string;
}

mermaid.initialize({
    startOnLoad: false,
    theme: 'neutral',
    securityLevel: 'loose',
});

const MermaidChart: React.FC<MermaidChartProps> = ({ chart }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [svgCode, setSvgCode] = useState<string>('');
    const [error, setError] = useState<boolean>(false);

    useEffect(() => {
        let isMounted = true;

        const renderChart = async () => {
            try {
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
