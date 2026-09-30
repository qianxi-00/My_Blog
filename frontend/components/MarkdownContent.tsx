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
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
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
    /**
     * 是否允许 Markdown 中的原始 HTML。
     *
     * 默认 false —— 这是安全默认，不要改。历史上这里默认 true 且挂了 rehypeRaw 却没有消毒，
     * 导致匿名评论里的 `<img onerror=...>` 能在管理员浏览文章时执行、偷走 localStorage 里的
     * JWT（2026-09-30 修复）。任何用户可提交的内容（评论、论坛、提示词、聊天）都必须显式
     * 传 false；只有自己写的文章正文才可以传 true，且此时仍会经过 rehypeSanitize 消毒。
     */
    allowHtml?: boolean;
}

/**
 * rehype-sanitize 的 schema：在 GitHub 默认白名单基础上放开文章正文真正需要的标签/属性。
 * - className：katex、highlight.js、mermaid 生成的 class 必须保留
 * - img 的 srcset/sizes/loading/decoding：文章配图与懒加载属性
 * - video/audio/source：文章内嵌多媒体
 * - target/rel：外链新窗口打开（target 由组件侧强制 rel="noopener noreferrer"）
 */
const sanitizeSchema = {
    ...defaultSchema,
    attributes: {
        ...defaultSchema.attributes,
        '*': [
            ...(defaultSchema.attributes?.['*'] ?? []),
            'className',
            'style',
            'id',
        ],
        img: [
            ...(defaultSchema.attributes?.img ?? []),
            'srcSet',
            'sizes',
            'loading',
            'decoding',
            'width',
            'height',
        ],
        a: [...(defaultSchema.attributes?.a ?? []), 'target', 'rel'],
        video: ['src', 'controls', 'poster', 'width', 'height', 'className', 'preload'],
        audio: ['src', 'controls', 'className', 'preload'],
        source: ['src', 'type', 'srcSet', 'media', 'sizes'],
    },
    tagNames: [
        ...(defaultSchema.tagNames ?? []),
        'video',
        'audio',
        'source',
        'iframe',
    ],
    // 只允许 http/https/mailto/data:image，挡掉 javascript: 这类协议
    protocols: {
        ...defaultSchema.protocols,
        href: ['http', 'https', 'mailto'],
        src: ['http', 'https', 'data'],
    },
};

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
    allowHtml = false, // 安全默认：必须显式开启（见上方注释）
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    // 根据 compact 模式选择样式 - 紧凑模式不使用 prose 类，让外部控制
    const proseClass = compact
        ? 'leading-relaxed [&_p]:mb-2 [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:mb-1 [&_li]:pl-1 [&_pre]:my-2 [&_blockquote]:my-2'
        : '';

    // 插件顺序：raw 解析原始 HTML -> sanitize 消毒 -> katex/highlight 加工。
    // sanitize 必须排在 katex/highlight 之前：它们自己生成的 class 与标签才不会被剥掉。
    const rehypePlugins = allowHtml
        ? [rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeKatex, rehypeHighlight]
        : [rehypeKatex, rehypeHighlight];

    return (
        <div ref={containerRef} className={`${proseClass} ${className}`.trim()}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath, remarkDisableIndentedCodeBlock]}
                rehypePlugins={rehypePlugins as any}
                components={useCustomComponents && (!compact || allowCompactComponents) ? markdownComponents : undefined}
            >
                {children}
            </ReactMarkdown>
        </div>
    );
};

export default MarkdownContent;
