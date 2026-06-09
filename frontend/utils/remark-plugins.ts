/**
 * 自定义 remark 插件：在解析阶段禁用缩进代码块（indented code block）
 *
 * 原因：CommonMark 标准中，行首 tab 或 4 个空格会触发缩进代码块解析，
 * 导致列表项中带缩进的普通文本被错误渲染为 <code> 元素。
 * 现代 Markdown 均使用围栏代码块（```），缩进代码块几乎不被使用。
 *
 * 实现方式：通过 micromark 扩展机制在 parser 阶段完全禁用 codeIndented 构造，
 * 这样缩进内容会被正常解析为 Markdown 语法（加粗、换行等均被保留）。
 *
 * 此插件被 MarkdownContent（文章详情）和 ArticleEditor（编辑器预览）共享。
 */
export function remarkDisableIndentedCodeBlock(this: any) {
    const data = this.data();
    // 向 micromark 添加扩展，禁用 codeIndented 构造
    const micromarkExtensions = data.micromarkExtensions || (data.micromarkExtensions = []);
    micromarkExtensions.push({ disable: { null: ['codeIndented'] } });
}
