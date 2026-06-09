/**
 * 通用 Markdown 渲染组件
 * 支持 GFM 表格、LaTeX 数学公式、代码高亮、Mermaid 图表
 */
import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { markdownComponents } from './MarkdownRenderer';
import { remarkDisableIndentedCodeBlock } from '../utils/remark-plugins';

// 声明全局 mermaid 对象
declare global {
    interface Window {
        mermaid?: {
            init: (config?: object, nodes?: string | Element | NodeListOf<Element>) => void;
            initialize: (config: object) => void;
        };
    }
}

interface MarkdownContentProps {
    children: string;
    className?: string;
    /** 是否启用 Mermaid 图表渲染，默认 true */
    enableMermaid?: boolean;
    /** 是否使用紧凑样式（用于评论等小区域），默认 false */
    compact?: boolean;
    /** 是否使用自定义 markdown 组件（标题 ID、代码块样式等），默认 true */
    useCustomComponents?: boolean;
    /** 紧凑模式是否仍启用自定义组件（聊天气泡等场景） */
    allowCompactComponents?: boolean;
    /** 是否允许 Markdown 中的原始 HTML，默认 true */
    allowHtml?: boolean;
}

/**
 * 通用 Markdown 渲染组件
 * 
 * 特性：
 * - GFM 表格、删除线、自动链接
 * - LaTeX 数学公式（行内 $ 和块级 $$）
 * - 代码语法高亮
 * - Mermaid 图表（通过 MermaidChart 组件内部渲染）
 * - Xmind 思维导图嵌入
 * - 视频渲染
 * - 自定义标题渲染（带 ID，支持 TOC 导航）
 */
const MarkdownContent: React.FC<MarkdownContentProps> = ({
    children,
    className = '',
    enableMermaid = true, // 仍保留属性以兼容现有用法，但逻辑已移至 MarkdownRenderer
    compact = false,
    useCustomComponents = true,
    allowCompactComponents = false,
    allowHtml = true,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    // 根据 compact 模式选择样式 - 紧凑模式不使用 prose 类，让外部控制
    const proseClass = compact
        ? 'leading-relaxed [&_p]:mb-2 [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:mb-1 [&_li]:pl-1 [&_pre]:my-2 [&_blockquote]:my-2'
        : '';

    return (
        <div ref={containerRef} className={`${proseClass} ${className}`.trim()}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath, remarkDisableIndentedCodeBlock]}
                rehypePlugins={allowHtml ? [rehypeKatex, rehypeHighlight, rehypeRaw] : [rehypeKatex, rehypeHighlight]}
                components={useCustomComponents && (!compact || allowCompactComponents) ? markdownComponents : undefined}
            >
                {children}
            </ReactMarkdown>
        </div>
    );
};

export default MarkdownContent;
