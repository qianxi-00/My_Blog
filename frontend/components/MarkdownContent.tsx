/**
 * 通用 Markdown 渲染组件
 * 支持 GFM 表格、LaTeX 数学公式、代码高亮、Mermaid 图表
 */
import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { markdownComponents, flattenMarkdownText } from './MarkdownRenderer';
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
     * 气泡类排版：用于聊天窗口（看板娘小魄罗）等窄容器。
     * 与 compact 的区别：compact 只是收窄间距，chat 换成整套为窄容器设计的组件
     * （小字号、紧凑表格、显式区分行内/围栏 code、不撑破气泡）。
     */
    variant?: 'default' | 'chat';
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
    variant = 'default',
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

    // chat variant 自带一整套组件，不受 useCustomComponents / compact 影响
    const resolvedComponents =
        variant === 'chat'
            ? chatComponents
            : useCustomComponents && (!compact || allowCompactComponents)
                ? markdownComponents
                : undefined;

    return (
        <div ref={containerRef} className={`${variant === 'chat' ? '' : proseClass} ${className}`.trim()}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath, remarkDisableIndentedCodeBlock]}
                rehypePlugins={rehypePlugins as any}
                components={resolvedComponents as any}
            >
                {children}
            </ReactMarkdown>
        </div>
    );
};

/**
 * 聊天气泡专用的紧凑组件集（variant="chat"）。
 *
 * 为什么不用 markdownComponents：文章正文的排版是给整页宽度的内容设计的——
 * h1 text-4xl、段落 mb-4、表格单元格 px-6 py-4、引用块 my-6。塞进聊天里那种
 * max-w-[80%] 的小气泡后会非常松散，表格几乎撑破。而且原先是靠一串
 * `[&_code]:text-slate-100` 补丁把代码块文字改成亮色 —— 那条规则会连**行内
 * code** 一起染成浅色，在白色气泡上基本看不清（同为 0-1-0 优先级，谁赢取决于
 * CSS 加载顺序，属于碰运气）。这里显式分开处理，不再靠补丁。
 */
const chatComponents: Record<string, any> = {
    // 标题：AI 回答里很少出现大标题，压到最小可用字号，避免撑破气泡
    h1: ({ children }: any) => <h1 className="text-[15px] font-bold mt-2.5 mb-1 first:mt-0 break-words">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-[14px] font-bold mt-2.5 mb-1 first:mt-0 break-words">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-[13.5px] font-semibold mt-2 mb-1 first:mt-0 break-words">{children}</h3>,
    h4: ({ children }: any) => <h4 className="text-[13px] font-semibold mt-2 mb-1 first:mt-0 break-words">{children}</h4>,
    h5: ({ children }: any) => <h5 className="text-[13px] font-semibold mt-1.5 mb-0.5 first:mt-0">{children}</h5>,
    h6: ({ children }: any) => <h6 className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 mt-1.5 mb-0.5 first:mt-0">{children}</h6>,

    p: ({ children }: any) => (
        <p className="text-[13px] leading-[1.75] mb-1.5 last:mb-0 break-words">{children}</p>
    ),

    ul: ({ children }: any) => (
        <ul className="list-disc list-outside ml-3.5 space-y-0.5 mb-1.5 last:mb-0 text-[13px] leading-[1.7] marker:text-slate-400">{children}</ul>
    ),
    ol: ({ children, start, ...props }: any) => (
        <ol start={start} className="list-decimal list-outside ml-3.5 space-y-0.5 mb-1.5 last:mb-0 text-[13px] leading-[1.7] marker:text-slate-400" {...props}>{children}</ol>
    ),
    li: ({ children, ...props }: any) => (
        <li className="pl-0.5 break-words" {...props}>{children}</li>
    ),

    strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }: any) => <em className="italic">{children}</em>,
    del: ({ children }: any) => <del className="opacity-60">{children}</del>,

    a: ({ href, children, ...props }: any) => (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 dark:text-primary-400 underline decoration-primary-300 dark:decoration-primary-700 underline-offset-2 hover:decoration-primary-500 break-all transition-colors"
            {...props}
        >
            {children}
        </a>
    ),

    // 行内 code 与围栏 code 在这里显式分开：行内给浅底 + 强调色，围栏走下方 code 分支
    code: ({ className, children, ...props }: any) => {
        const isBlock = className && (/language-/.test(className) || /hljs/.test(className));
        if (!isBlock) {
            return (
                <code
                    className="bg-slate-100 dark:bg-slate-700/80 text-rose-600 dark:text-rose-300 px-1 py-0.5 rounded text-[12px] font-mono break-all"
                    {...props}
                >
                    {children}
                </code>
            );
        }

        const match = /language-([\w-]+)/.exec(className || '');
        const language = match ? match[1].toLowerCase() : 'text';
        // 十三期 P0 修复（同 MarkdownRenderer）：children 已是 hljs span 数组，
        // String() 压成 [object Object]。纯文本仅用于复制，渲染传 children 保高亮。
        const codeText = flattenMarkdownText(children).replace(/\n$/, '');
        return <CompactCodeBlock language={language} codeText={codeText}>{children}</CompactCodeBlock>;
    },

    pre: ({ children }: any) => <>{children}</>,

    blockquote: ({ children }: any) => (
        <blockquote className="my-1.5 pl-2.5 border-l-[3px] border-primary-400 dark:border-primary-600 text-slate-600 dark:text-slate-300">
            {children}
        </blockquote>
    ),

    table: ({ children }: any) => (
        <div className="my-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-600">
            <table className="w-full border-collapse text-[12px]">{children}</table>
        </div>
    ),
    thead: ({ children }: any) => <thead className="bg-slate-100 dark:bg-slate-700/60">{children}</thead>,
    tbody: ({ children }: any) => <tbody className="divide-y divide-slate-100 dark:divide-slate-700">{children}</tbody>,
    tr: ({ children, header }: any) => (
        <tr className={header ? '' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors'}>{children}</tr>
    ),
    th: ({ children, ...props }: any) => (
        <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap" {...props}>{children}</th>
    ),
    td: ({ children, ...props }: any) => (
        <td className="px-2 py-1.5 align-top" {...props}>{children}</td>
    ),

    hr: () => <hr className="my-2.5 border-t border-slate-200 dark:border-slate-600" />,

    img: ({ src, alt }: any) => (
        <img src={src} alt={alt || ''} loading="lazy" className="my-2 max-w-full rounded-lg shadow-sm" />
    ),
};

/** 气泡里的代码块：保留语言标签与复制按钮，但去掉文章版的大圆角/阴影/内边距。
 *  十三期：渲染用 children（保 hljs 高亮 span），复制用 codeText 纯文本。 */
const CompactCodeBlock: React.FC<{ language: string; codeText: string; children?: React.ReactNode }> = ({ language, codeText, children }) => {
    const [copied, setCopied] = useState(false);

    const copy = () => {
        navigator.clipboard.writeText(codeText).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        });
    };

    return (
        <div className="my-2 rounded-lg overflow-hidden border border-slate-700/60 bg-slate-900">
            <div className="flex items-center justify-between px-2.5 py-1 bg-slate-800/80 text-[11px] font-mono text-slate-400">
                <span className="uppercase tracking-wide">{language}</span>
                <button
                    type="button"
                    onClick={copy}
                    aria-label="复制代码"
                    className="px-1.5 py-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                    {copied ? '✓ 已复制' : '复制'}
                </button>
            </div>
            {/* 代码块要能横向滚动，不要 pre-wrap：语法高亮的换行会把缩进结构冲掉 */}
            <pre className="bg-slate-900 text-slate-100 p-2.5 overflow-x-auto text-[12px] leading-relaxed">
                <code className={`language-${language} font-mono`}>{children ?? codeText}</code>
            </pre>
        </div>
    );
};

// （十三期：本地 flattenMarkdownText 已删——它返回数组而非字符串，
//  正确实现在 MarkdownRenderer.tsx 导出，直接 import 使用。）


export default MarkdownContent;