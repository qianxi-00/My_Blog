import React, { useEffect, useRef, useState } from 'react';
import { XMindEmbedViewer } from 'xmind-embed-viewer';

interface XmindViewerProps {
    fileUrl: string;
    title?: string;
}

const XmindViewer: React.FC<XmindViewerProps> = ({ fileUrl, title }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<XMindEmbedViewer | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!containerRef.current || !fileUrl) return;

        let isMounted = true;

        const loadXmind = async () => {
            try {
                // Initialize the viewer inside the container
                const viewer = new XMindEmbedViewer({
                    el: containerRef.current as HTMLElement,
                    region: 'cn', // Use CN region for better loading
                });

                viewerRef.current = viewer;

                // Fetch the xmind file. 
                // XmindEmbedViewer requires an ArrayBuffer
                const response = await fetch(fileUrl);
                if (!response.ok) {
                    throw new Error(`Failed to fetch file: ${response.statusText}`);
                }
                const arrayBuffer = await response.arrayBuffer();

                if (isMounted) {
                    await viewer.load(arrayBuffer);
                    // Standard properties to make viewing more comfortable inline
                    viewer.setZoomScale(100);
                    setLoading(false);
                }
            } catch (err) {
                console.error("Error loading Xmind file:", err);
                if (isMounted) {
                    setError(true);
                    setLoading(false);
                }
            }
        };

        loadXmind();

        return () => {
            isMounted = false;
        };
    }, [fileUrl]);

    return (
        <div className="my-8 relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-lg bg-white dark:bg-slate-800 group">
            {/* Header bar */}
            <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center text-sm">
                <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <span className="text-red-500">🧠</span> {title || 'Xmind 思维导图'}
                </span>
                <a
                    href={fileUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200 font-medium"
                >
                    下载原文件
                </a>
            </div>

            {/* Viewer area */}
            <div
                ref={containerRef}
                className="w-full relative bg-slate-50 dark:bg-slate-800"
                style={{ height: '500px' }} // Give a fixed height for embedded maps
            >
                {loading && !error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-800/80 z-10 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-2 text-slate-500">
                            <svg className="animate-spin h-8 w-8 text-primary-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span>加载思维导图中...</span>
                        </div>
                    </div>
                )}
                {error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10">
                        <span className="text-4xl mb-4">🥲</span>
                        <h4 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">思维导图加载失败</h4>
                        <p className="text-slate-500 dark:text-slate-400 mb-4 max-w-sm">
                            可能是文件链接不可访问。您可以尝试直接下载文件。
                        </p>
                        <a
                            href={fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
                        >
                            下载文件
                        </a>
                    </div>
                )}
            </div>
            {/* Instruction overlay - fades out on hover */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/50 text-white/80 text-xs rounded-full pointer-events-none opacity-100 group-hover:opacity-0 transition-opacity duration-300">
                可使用滑轮缩放、拖拽移动
            </div>
        </div>
    );
};

export default XmindViewer;
