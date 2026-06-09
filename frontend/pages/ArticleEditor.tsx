/**
 * 文章编辑器页面 - 创建/编辑文章
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MDEditor from '@uiw/react-md-editor';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Icons } from '../components/Icons';
import { Button } from '../components/Shared';
import { getArticle, createArticle, updateArticle, publishArticle, getTags, Tag, Article, generateSummary } from '../api/articles';
import { uploadImage } from '../api/upload';
import { remarkDisableIndentedCodeBlock } from '../utils/remark-plugins';
import { getFileUrl } from '../api/config';
import CoverCropper from '../components/CoverCropper';

const ArticleEditor: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const isEdit = !!id;

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [generatingSummary, setGeneratingSummary] = useState(false);
    const [existingTags, setExistingTags] = useState<Tag[]>([]);  // 已有标签列表

    // 文件上传引用
    const mdFileRef = useRef<HTMLInputElement>(null);

    // Form state
    const [title, setTitle] = useState('');
    const [slug, setSlug] = useState('');
    const [summary, setSummary] = useState('');
    const [content, setContent] = useState('');
    const [category, setCategory] = useState('');
    const [coverImage, setCoverImage] = useState('');
    const [selectedTagNames, setSelectedTagNames] = useState<string[]>([]);  // 使用标签名
    const [newTagInput, setNewTagInput] = useState('');  // 新标签输入
    const [isPinned, setIsPinned] = useState(false);
    // 封面裁剪相关状态
    const [cropperImageSrc, setCropperImageSrc] = useState<string>('');
    const coverFileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const tagsRes = await getTags();
                setExistingTags(tagsRes);

                if (isEdit && id) {
                    const article = await getArticle(parseInt(id));
                    setTitle(article.title);
                    setSlug(article.slug || '');
                    setSummary(article.summary || '');
                    setContent(article.content_md || '');  // 使用正确的字段名
                    setCategory(article.category || '');
                    setCoverImage(article.cover_image || '');
                    setSelectedTagNames(article.tags.map(t => t.name));  // 使用标签名
                    setIsPinned(article.is_pinned);
                }
            } catch (error) {
                console.error('加载失败:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [id, isEdit]);

    // 优化编辑器性能，避免频繁重渲染导致卡顿
    const handleContentChange = useCallback((val?: string) => {
        setContent(val || '');
    }, []);

    const handleSave = async (publish: boolean = false) => {
        if (!title.trim() || !content.trim()) {
            alert('请填写标题和内容');
            return;
        }

        setSaving(true);
        try {
            // 如果是发布且摘要为空，自动生成摘要
            let finalSummary = summary;
            if (publish && !summary.trim()) {
                try {
                    setGeneratingSummary(true);
                    const result = await generateSummary(content);
                    finalSummary = result.summary;
                    setSummary(finalSummary);
                } catch (error) {
                    console.warn('自动生成摘要失败，继续发布:', error);
                } finally {
                    setGeneratingSummary(false);
                }
            }

            const data = {
                title,
                slug: slug || undefined,
                summary: finalSummary || undefined,
                content_markdown: content,
                category: category || undefined,
                cover_image: coverImage || undefined,
                tags: selectedTagNames,
                is_pinned: isPinned,
                // 如果不是发布，则设置为草稿状态（已发布文章会下架）
                status: publish ? 'published' : 'draft',
            };

            let article: Article;
            if (isEdit && id) {
                article = await updateArticle(parseInt(id), data);
            } else {
                article = await createArticle(data);
            }

            if (publish) {
                await publishArticle(article.id);
                alert('文章已保存并发布');
            } else {
                alert(isEdit ? '文章已保存为草稿（已下架）' : '草稿已保存');
            }

            navigate('/admin/posts');
        } catch (error: any) {
            const detail = error.response?.data?.detail;
            const message = typeof detail === 'string' ? detail : (detail?.msg || JSON.stringify(detail) || '保存失败');
            alert(message);
        } finally {
            setSaving(false);
        }
    };

    /**
     * 选择封面图片后，先读取为 data URL 再打开裁剪器
     */
    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            setCropperImageSrc(reader.result as string);
        };
        reader.readAsDataURL(file);
        // 清空 input 以便重复选择同一文件
        if (coverFileRef.current) coverFileRef.current.value = '';
    };

    /**
     * 裁剪完成后，将 Blob 包装为 File 上传到后端
     */
    const handleCropComplete = async (croppedBlob: Blob) => {
        setCropperImageSrc(''); // 关闭裁剪器
        try {
            const file = new File([croppedBlob], 'cover.jpg', { type: 'image/jpeg' });
            const result = await uploadImage(file);
            setCoverImage(result.url);
        } catch (error) {
            alert('封面上传失败');
        }
    };

    /**
     * 导入 Markdown 文件
     * 在客户端用 FileReader 直接读取文件原始内容，
     * 不经过后端解析，保留原始 tab/缩进/格式。
     */
    const handleMarkdownUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const reader = new FileReader();
        reader.onload = (event) => {
            const rawContent = event.target?.result as string;
            if (!rawContent) {
                setUploading(false);
                return;
            }

            // 简单提取 frontmatter 中的 title（如果有）
            let body = rawContent;
            if (rawContent.startsWith('---')) {
                const endIndex = rawContent.indexOf('---', 3);
                if (endIndex !== -1) {
                    const frontmatter = rawContent.substring(3, endIndex);
                    body = rawContent.substring(endIndex + 3).trim();
                    // 提取 title
                    const titleMatch = frontmatter.match(/title:\s*["']?(.+?)["']?\s*$/m);
                    if (titleMatch && !title.trim()) {
                        setTitle(titleMatch[1].trim());
                    }
                }
            }

            // 如果没有标题，用文件名作为标题
            if (!title.trim()) {
                setTitle(file.name.replace(/\.md$/, ''));
            }

            // 设置内容
            if (!content.trim()) {
                setContent(body);
            } else {
                if (window.confirm('当前已有内容，是否替换？选择"取消"将追加到末尾。')) {
                    setContent(body);
                } else {
                    setContent(prev => prev + '\n\n---\n\n' + body);
                }
            }

            setUploading(false);
            // 清空文件输入
            if (mdFileRef.current) {
                mdFileRef.current.value = '';
            }
        };
        reader.onerror = () => {
            alert('文件读取失败');
            setUploading(false);
        };
        reader.readAsText(file, 'UTF-8');
    };

    // 使用 AI 生成摘要
    const handleGenerateSummary = async () => {
        if (!content.trim()) {
            alert('请先输入文章内容');
            return;
        }

        setGeneratingSummary(true);
        try {
            const result = await generateSummary(content);
            setSummary(result.summary);
        } catch (error: any) {
            alert(error.response?.data?.detail || '摘要生成失败');
        } finally {
            setGeneratingSummary(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 text-slate-400">
                加载中...
            </div>
        );
    }

    return (
        <>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-slate-800">
                        {isEdit ? '编辑文章' : '新建文章'}
                    </h1>
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={() => navigate('/admin/posts')}>
                            取消
                        </Button>
                        <Button variant="secondary" onClick={() => handleSave(false)} disabled={saving}>
                            {saving ? '保存中...' : '保存草稿'}
                        </Button>
                        <Button onClick={() => handleSave(true)} disabled={saving}>
                            {saving ? '发布中...' : '保存并发布'}
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Main Editor */}
                    <div className="lg:col-span-3 space-y-6">
                        {/* Title */}
                        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="文章标题"
                                className="w-full text-2xl font-bold bg-transparent border-none text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-0"
                            />
                        </div>

                        {/* Content Editor */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" data-color-mode="light">
                            <div className="flex items-center justify-between p-3 border-b border-slate-200 bg-slate-50/50">
                                <span className="text-sm text-slate-600 font-medium">Markdown 编辑器</span>
                                <div className="flex items-center gap-3">
                                    {/* 导入 Markdown 文件 */}
                                    <label className="text-sm text-emerald-600 hover:text-emerald-700 flex items-center gap-1 font-medium cursor-pointer">
                                        <Icons.FileText className="w-4 h-4" />
                                        导入 .md
                                        <input
                                            ref={mdFileRef}
                                            type="file"
                                            accept=".md"
                                            onChange={handleMarkdownUpload}
                                            className="hidden"
                                            disabled={uploading}
                                        />
                                    </label>
                                </div>
                            </div>
                            {uploading && (
                                <div className="px-4 py-2 bg-blue-50 text-blue-600 text-sm">
                                    正在导入文件，请稍候...
                                </div>
                            )}
                            <MDEditor
                                value={content}
                                onChange={handleContentChange}
                                height={500}
                                preview="live"
                                previewOptions={{
                                    remarkPlugins: [remarkGfm, remarkMath, remarkDisableIndentedCodeBlock],
                                    rehypePlugins: [rehypeKatex],
                                }}
                            />
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        {/* Meta */}
                        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm space-y-4">
                            <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2">文章设置</h3>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Slug (URL)</label>
                                <input
                                    type="text"
                                    value={slug}
                                    onChange={(e) => setSlug(e.target.value)}
                                    placeholder="auto-generated"
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">分类</label>
                                <input
                                    type="text"
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    placeholder="如：Frontend, AI, System"
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-all"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-sm font-medium text-slate-700">摘要</label>
                                    <button
                                        onClick={handleGenerateSummary}
                                        disabled={generatingSummary || !content.trim()}
                                        className="group relative flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-700 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                                        title="点击 AI 生成摘要"
                                    >
                                        {generatingSummary ? (
                                            <>
                                                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                生成中...
                                            </>
                                        ) : (
                                            <>
                                                <span className="text-lg">🤖</span>
                                                AI 生成
                                            </>
                                        )}
                                        {/* Tooltip */}
                                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                            根据文章内容自动生成摘要
                                        </span>
                                    </button>
                                </div>
                                <textarea
                                    value={summary}
                                    onChange={(e) => setSummary(e.target.value)}
                                    placeholder="文章简短描述（最多150字）"
                                    rows={3}
                                    maxLength={150}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-sm resize-none focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-all"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="isPinned"
                                    checked={isPinned}
                                    onChange={(e) => setIsPinned(e.target.checked)}
                                    className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 h-4 w-4"
                                />
                                <label htmlFor="isPinned" className="text-sm font-medium text-slate-700">置顶文章</label>
                            </div>
                        </div>

                        {/* Cover Image */}
                        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm space-y-4">
                            <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2">封面图片</h3>

                            {coverImage ? (
                                <div className="relative">
                                    <img src={getFileUrl(coverImage)} alt="Cover" className="w-full rounded-lg" />
                                    <button
                                        onClick={() => setCoverImage('')}
                                        className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full"
                                    >
                                        <Icons.X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <label className="block cursor-pointer">
                                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-cyan-500 hover:bg-cyan-50/50 transition-all group">
                                        <Icons.Image className="w-10 h-10 text-slate-300 mx-auto mb-3 group-hover:text-cyan-500 transition-colors" />
                                        <span className="text-sm font-medium text-slate-500 group-hover:text-cyan-600 transition-colors">点击上传封面</span>
                                        <span className="block text-xs text-slate-400 mt-1">支持缩放与裁剪</span>
                                    </div>
                                    <input
                                        ref={coverFileRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageSelect}
                                        className="hidden"
                                    />
                                </label>
                            )}
                        </div>

                        {/* Tags */}
                        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm space-y-4">
                            <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2">标签</h3>

                            {/* 已选标签 */}
                            {selectedTagNames.length > 0 && (
                                <div className="flex flex-wrap gap-2 pb-2 border-b border-slate-100">
                                    {selectedTagNames.map((tagName) => (
                                        <span
                                            key={tagName}
                                            className="px-3 py-1.5 rounded-full text-xs font-semibold bg-cyan-500 text-white flex items-center gap-1"
                                        >
                                            {tagName}
                                            <button
                                                onClick={() => setSelectedTagNames(prev => prev.filter(t => t !== tagName))}
                                                className="hover:bg-cyan-600 rounded-full p-0.5"
                                            >
                                                <Icons.X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* 添加新标签 */}
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newTagInput}
                                    onChange={(e) => setNewTagInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && newTagInput.trim()) {
                                            e.preventDefault();
                                            const tag = newTagInput.trim();
                                            if (!selectedTagNames.includes(tag)) {
                                                setSelectedTagNames(prev => [...prev, tag]);
                                            }
                                            setNewTagInput('');
                                        }
                                    }}
                                    placeholder="输入标签名，回车添加"
                                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                                />
                                <button
                                    onClick={() => {
                                        if (newTagInput.trim() && !selectedTagNames.includes(newTagInput.trim())) {
                                            setSelectedTagNames(prev => [...prev, newTagInput.trim()]);
                                            setNewTagInput('');
                                        }
                                    }}
                                    className="px-3 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 text-sm font-medium"
                                >
                                    添加
                                </button>
                            </div>

                            {/* 已有标签快捷选择 */}
                            {existingTags.length > 0 && (
                                <div>
                                    <p className="text-xs text-slate-500 mb-2">快捷选择：</p>
                                    <div className="flex flex-wrap gap-2">
                                        {existingTags.filter(t => !selectedTagNames.includes(t.name)).map((tag) => (
                                            <button
                                                key={tag.id}
                                                onClick={() => setSelectedTagNames(prev => [...prev, tag.name])}
                                                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition-all"
                                            >
                                                + {tag.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 封面裁剪弹窗 */}
            {
                cropperImageSrc && (
                    <CoverCropper
                        imageSrc={cropperImageSrc}
                        onCropComplete={handleCropComplete}
                        onCancel={() => setCropperImageSrc('')}
                    />
                )
            }
        </>
    );
};

export default ArticleEditor;
