/**
 * 通用工具函数
 */

/**
 * 根据文章字数计算阅读时间（梯队设置）
 * @param content Markdown 内容
 * @returns 阅读时间（分钟）
 */
export const calculateReadTime = (content?: string): number => {
    if (!content) return 5; // 默认 5 分钟

    // 去除 Markdown 标记，计算纯文字数
    const plainText = content
        .replace(/```[\s\S]*?```/g, '') // 移除代码块
        .replace(/`[^`]*`/g, '') // 移除行内代码
        .replace(/!\[.*?\]\(.*?\)/g, '') // 移除图片
        .replace(/\[.*?\]\(.*?\)/g, '') // 移除链接
        .replace(/[#*_~>\-|]/g, '') // 移除 Markdown 符号
        .replace(/\s+/g, ''); // 移除空格

    const wordCount = plainText.length;

    // 阅读时间梯队（假设中文阅读速度约 400-600 字/分钟）
    if (wordCount < 1000) return 2;        // < 1000 字：2 分钟
    if (wordCount < 3000) return 5;        // 1000-3000 字：5 分钟
    if (wordCount < 6000) return 8;        // 3000-6000 字：8 分钟
    if (wordCount < 10000) return 12;      // 6000-10000 字：12 分钟
    if (wordCount < 15000) return 18;      // 10000-15000 字：18 分钟
    return 25;                              // > 15000 字：25 分钟
};

/**
 * 复制文本到剪贴板
 * @param text 要复制的文本
 * @returns 是否成功
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
        // 优先使用 Clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }

        // 降级方案：使用 execCommand
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        return success;
    } catch (err) {
        console.error('复制失败:', err);
        return false;
    }
};
