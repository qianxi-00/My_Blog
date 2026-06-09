"""
Markdown 解析服务
"""

import re
from typing import Tuple, Dict, Any

import markdown
from markdown.extensions.toc import TocExtension
from markdown.extensions.codehilite import CodeHiliteExtension
from markdown.extensions.fenced_code import FencedCodeExtension
from markdown.extensions.tables import TableExtension
from bs4 import BeautifulSoup
import yaml


def parse_markdown(content: str) -> Tuple[str, str]:
    """
    解析 Markdown 内容
    
    Args:
        content: Markdown 原文
    
    Returns:
        (html_content, toc_html): 转换后的 HTML 和目录 HTML
    """
    # 配置 Markdown 扩展
    md = markdown.Markdown(
        extensions=[
            TocExtension(
                permalink=True,
                permalink_class="anchor-link",
                permalink_title="链接到此标题",
                toc_depth="2-4"
            ),
            CodeHiliteExtension(
                css_class="highlight",
                linenums=False,
                guess_lang=True
            ),
            FencedCodeExtension(),
            TableExtension(),
            "nl2br",  # 换行转 <br>
            "sane_lists",  # 更好的列表处理
        ]
    )
    
    # 转换 HTML
    html_content = md.convert(content)
    
    # 获取目录
    toc_html = getattr(md, "toc", "")
    
    # 美化目录
    if toc_html:
        soup = BeautifulSoup(toc_html, "html.parser")
        # 添加样式类
        for ul in soup.find_all("ul"):
            ul["class"] = ul.get("class", []) + ["toc-list"]
        for li in soup.find_all("li"):
            li["class"] = li.get("class", []) + ["toc-item"]
        for a in soup.find_all("a"):
            a["class"] = a.get("class", []) + ["toc-link"]
        toc_html = str(soup)
    
    return html_content, toc_html


def extract_frontmatter(content: str) -> Tuple[Dict[str, Any], str]:
    """
    从 Markdown 内容中提取 frontmatter
    
    支持格式：
    ---
    title: 文章标题
    tags: [tag1, tag2]
    ---
    
    Args:
        content: 完整的 Markdown 内容
    
    Returns:
        (frontmatter_dict, body): frontmatter 字典和正文内容
    """
    # 匹配 YAML frontmatter
    pattern = r"^---\s*\n(.*?)\n---\s*\n(.*)$"
    match = re.match(pattern, content, re.DOTALL)
    
    if match:
        frontmatter_str = match.group(1)
        body = match.group(2)
        
        try:
            frontmatter = yaml.safe_load(frontmatter_str) or {}
        except yaml.YAMLError:
            frontmatter = {}
        
        return frontmatter, body
    
    return {}, content


def estimate_read_time(content: str, words_per_minute: int = 500) -> int:
    """
    估算阅读时间（梯队式计算）
    
    Args:
        content: 文章内容（Markdown 格式）
        words_per_minute: 每分钟阅读字数（中文约 400-600 字/分钟）
    
    Returns:
        阅读分钟数
    """
    # 移除代码块
    text = re.sub(r"```[\s\S]*?```", "", content)
    text = re.sub(r"`[^`]*`", "", text)
    # 移除图片和链接
    text = re.sub(r"!\[.*?\]\(.*?\)", "", text)
    text = re.sub(r"\[.*?\]\(.*?\)", "", text)
    # 移除 HTML 标签和 Markdown 语法
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"[#*`\[\]()_~>\-|]", "", text)
    # 移除空白
    text = re.sub(r"\s+", "", text)
    
    # 统计总字数（中文字符 + 英文单词）
    chinese_chars = len(re.findall(r"[\u4e00-\u9fff]", text))
    english_words = len(re.findall(r"\b[a-zA-Z]+\b", content))  # 从原始内容统计英文
    
    total_words = chinese_chars + english_words
    
    # 梯队式阅读时间
    if total_words < 1000:
        return 2        # < 1000 字：2 分钟
    elif total_words < 3000:
        return 5        # 1000-3000 字：5 分钟
    elif total_words < 6000:
        return 8        # 3000-6000 字：8 分钟
    elif total_words < 10000:
        return 12       # 6000-10000 字：12 分钟
    elif total_words < 15000:
        return 18       # 10000-15000 字：18 分钟
    else:
        return 25       # > 15000 字：25 分钟
