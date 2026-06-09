import React, { ReactNode } from 'react';
import MermaidChart from './MermaidChart';
import XmindViewer from './XmindViewer';

interface CustomComponentProps {
  children?: ReactNode;
  [key: string]: any;
}

export interface MarkdownHeadingItem {
  level: number;
  text: string;
  id: string;
}

// 常见视频后缀
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov', '.m4v'];

// 判断是否为视频链接
const isVideoUrl = (url: string = '') => {
  try {
    const pathname = new URL(url, window.location.origin).pathname.toLowerCase();
    return VIDEO_EXTENSIONS.some(ext => pathname.endsWith(ext));
  } catch {
    return false;
  }
};

// 递归获取 ReactNode 的文本内容
export const flattenMarkdownText = (node: ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (!node) return '';

  return React.Children.toArray(node).reduce<string>((acc, child: any) => {
    if (typeof child === 'string' || typeof child === 'number') {
      return acc + String(child);
    }
    if (child && child.props && child.props.children) {
      return acc + flattenMarkdownText(child.props.children);
    }
    return acc;
  }, '');
};

// 生成 ID 的通用函数
export const buildHeadingId = (input: ReactNode | string) => {
  const text = (typeof input === 'string' ? input : flattenMarkdownText(input)).trim();

  return text
    .toLowerCase()
    .replace(/[^\u0000-\u007F\w\s\u4e00-\u9fa5-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

// 从 Markdown 原文提取标题，供目录导航复用
export const extractHeadingsFromMarkdown = (markdown: string): MarkdownHeadingItem[] => {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const headings: MarkdownHeadingItem[] = [];
  let match;

  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length;
    const rawText = match[2]
      .replace(/\s+#+\s*$/, '')
      .trim();

    const text = rawText
      .replace(/\*\*/g, '')
      .replace(/__/g, '')
      .replace(/\*/g, '')
      .replace(/_/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .trim();

    if (!text) continue;

    headings.push({
      level,
      text,
      id: buildHeadingId(text),
    });
  }

  return headings;
};

const renderHeading = (Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', className: string) => ({ children, ...props }: CustomComponentProps) => {
  const id = buildHeadingId(children);
  return (
    <Tag id={id} className={className} {...props}>
      {children}
    </Tag>
  );
};

// 自定义 Markdown 组件渲染
export const markdownComponents = {
  // 标题 - 添加 ID 以支持目录导航
  h1: renderHeading('h1', 'text-4xl font-black text-slate-900 dark:text-white mt-10 mb-6 first:mt-0 scroll-mt-24'),
  h2: renderHeading('h2', 'text-3xl font-bold text-slate-900 dark:text-white mt-12 mb-4 border-b-2 border-primary-100 dark:border-slate-700 pb-3 scroll-mt-24'),
  h3: renderHeading('h3', 'text-2xl font-bold text-slate-800 dark:text-slate-100 mt-8 mb-3 scroll-mt-24'),
  h4: renderHeading('h4', 'text-xl font-bold text-slate-800 dark:text-slate-100 mt-6 mb-2 scroll-mt-24'),
  h5: renderHeading('h5', 'text-lg font-bold text-slate-800 dark:text-slate-100 mt-5 mb-2 scroll-mt-24'),
  h6: renderHeading('h6', 'text-base font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200 mt-4 mb-2 scroll-mt-24'),

  // 代码渲染
  // NOTE: react-markdown 中，围栏代码块（```）会被解析为 <pre><code>，
  // 且 code 元素上会带有 className="language-xxx"。
  // 行内代码（`code`）则直接是 <code>，没有 language 类名。
  // 由于我们覆盖了 pre 组件（直接透传 children），需要通过 className 判断。
  code: ({ className, children, node, ...props }: any) => {
    const hasLanguage = className && /language-/.test(className);
    const hasHljs = className && /hljs/.test(className);

    if (!hasLanguage && !hasHljs) {
      return (
        <code className="bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-200 px-1.5 py-0.5 rounded text-sm font-mono border border-slate-200 dark:border-slate-600" {...props}>
          {children}
        </code>
      );
    }

    const match = /language-([\w-]+)/.exec(className || '');
    const language = match ? match[1].toLowerCase() : 'text';
    const codeText = String(children ?? '').replace(/\n$/, '');

    if (language == 'mermaid') {
      return <MermaidChart chart={codeText} />;
    }

    return (
      <div className="my-6 rounded-xl overflow-hidden shadow-lg border border-slate-200 dark:border-slate-700 group hover:shadow-2xl transition-shadow duration-300">
        <div className="bg-slate-800 dark:bg-slate-900 text-slate-300 px-4 py-3 text-xs font-mono flex items-center justify-between hover:bg-slate-700 dark:hover:bg-slate-800 transition-colors">
          <div className="flex items-center gap-3">
            <span className="font-bold uppercase text-slate-400">{language}</span>
            {language && (
              <span className="text-[10px] px-2 py-1 bg-slate-700 dark:bg-slate-800 rounded text-slate-300">
                {language === 'python' ? '🐍' : language === 'javascript' || language === 'js' ? '📜' : language === 'bash' || language === 'shell' ? '🖥️' : '💻'}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(codeText);
            }}
            className="px-3 py-1.5 rounded bg-slate-700 dark:bg-slate-800 text-slate-300 hover:bg-slate-600 dark:hover:bg-slate-700 transition-all text-xs font-semibold hover:scale-105"
          >
            📋 复制
          </button>
        </div>
        <pre className="bg-slate-900 dark:bg-[#0a0e1a] text-slate-100 p-4 overflow-x-auto hover:bg-slate-950 transition-colors">
          <code className={`language-${language} text-sm leading-relaxed whitespace-pre`}>
            {codeText}
          </code>
        </pre>
      </div>
    );
  },

  // 代码块包装器
  pre: ({ children }: CustomComponentProps) => {
    return <>{children}</>;
  },

  // 图片/视频 - 添加圆角和阴影，拦截视频格式
  img: ({ src, alt, ...props }: any) => {
    if (isVideoUrl(src)) {
      return (
        <figure className="my-8">
          <div className="rounded-xl overflow-hidden shadow-lg border border-slate-200 dark:border-slate-700 bg-slate-900">
            <video
              src={src}
              controls
              className="w-full h-auto max-h-[70vh] object-contain"
              preload="metadata"
              {...props}
            />
          </div>
          {alt && <figcaption className="text-center text-sm text-slate-500 mt-2">{alt}</figcaption>}
        </figure>
      );
    }

    return (
      <figure className="my-8">
        <div className="rounded-xl overflow-hidden shadow-lg border border-slate-200 dark:border-slate-700 hover:shadow-2xl transition-shadow">
          <img
            src={src}
            alt={alt}
            loading={props.loading || 'lazy'}
            className="w-full h-auto bg-slate-100 dark:bg-slate-800"
            {...props}
          />
        </div>
        {alt && <figcaption className="text-center text-sm text-slate-500 mt-2">{alt}</figcaption>}
      </figure>
    );
  },

  video: ({ children, className = '', ...props }: any) => {
    return (
      <figure className="my-8">
        <div className="rounded-xl overflow-hidden shadow-lg border border-slate-200 dark:border-slate-700 bg-slate-900">
          <video
            controls
            preload="metadata"
            className={`w-full h-auto max-h-[70vh] object-contain ${className}`.trim()}
            {...props}
          >
            {children}
          </video>
        </div>
      </figure>
    );
  },

  source: (props: any) => <source {...props} />,

  table: ({ children }: CustomComponentProps) => {
    return (
      <div className="my-6 overflow-x-auto rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full border-collapse">
          {children}
        </table>
      </div>
    );
  },

  thead: ({ children }: CustomComponentProps) => {
    return (
      <thead className="bg-gradient-to-r from-primary-600 to-primary-700">
        {children}
      </thead>
    );
  },

  tbody: ({ children }: CustomComponentProps) => {
    return (
      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
        {children}
      </tbody>
    );
  },

  tr: ({ children, header }: any) => {
    return (
      <tr className={header ? 'bg-primary-600' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors'}>
        {children}
      </tr>
    );
  },

  th: ({ children }: CustomComponentProps) => {
    return (
      <th className="px-6 py-3 text-left font-semibold text-white">
        {children}
      </th>
    );
  },

  td: ({ children }: CustomComponentProps) => {
    return (
      <td className="px-6 py-4 text-slate-700 dark:text-slate-300">
        {children}
      </td>
    );
  },

  p: ({ children }: CustomComponentProps) => {
    return (
      <p className="text-slate-700 dark:text-slate-300 leading-relaxed mb-4 text-base">
        {children}
      </p>
    );
  },

  ul: ({ children }: CustomComponentProps) => {
    return (
      <ul className="list-disc list-outside ml-6 space-y-2 mb-4 text-slate-700 dark:text-slate-300">
        {children}
      </ul>
    );
  },

  ol: ({ children, start, ...props }: any) => {
    return (
      <ol start={start} className="list-decimal list-outside ml-6 space-y-2 mb-4 text-slate-700 dark:text-slate-300" {...props}>
        {children}
      </ol>
    );
  },

  li: ({ children }: CustomComponentProps) => {
    return (
      <li className="pl-2 text-slate-700 dark:text-slate-300">
        {children}
      </li>
    );
  },

  blockquote: ({ children }: CustomComponentProps) => {
    return (
      <blockquote className="my-6 pl-4 border-l-4 border-primary-500 dark:border-primary-400 bg-primary-50 dark:bg-slate-800/50 py-4 px-4 rounded-r-lg">
        <div className="text-slate-700 dark:text-slate-300 italic">
          {children}
        </div>
      </blockquote>
    );
  },

  hr: () => {
    return <hr className="my-8 border-t-2 border-slate-200 dark:border-slate-700" />;
  },

  a: ({ href, children, ...props }: CustomComponentProps) => {
    if (href && href.toLowerCase().endsWith('.xmind')) {
      return <XmindViewer fileUrl={href} title={flattenMarkdownText(children)} />;
    }

    if (isVideoUrl(href)) {
      return (
        <figure className="my-8">
          <div className="rounded-xl overflow-hidden shadow-lg border border-slate-200 dark:border-slate-700 bg-slate-900">
            <video
              src={href}
              controls
              className="w-full h-auto max-h-[70vh] object-contain"
              preload="metadata"
            />
          </div>
          {children && <figcaption className="text-center text-sm text-slate-500 mt-2">{children}</figcaption>}
        </figure>
      );
    }

    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 underline hover:underline-offset-2 transition-all"
        {...props}
      >
        {children}
      </a>
    );
  },

  strong: ({ children }: CustomComponentProps) => {
    return <strong className="font-bold text-slate-900 dark:text-white">{children}</strong>;
  },

  em: ({ children }: CustomComponentProps) => {
    return <em className="italic text-slate-800 dark:text-slate-300">{children}</em>;
  },
};
