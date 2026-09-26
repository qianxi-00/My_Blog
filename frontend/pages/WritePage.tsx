/**
 * 用户投稿编辑器（需登录）
 * 表单：title/category/summary/tags/cover_image/content_md
 * 通过 /write?article_id= 编辑已有草稿/被驳回文章；管理员仍用 /admin/posts/new
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import MDEditor from '@uiw/react-md-editor';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Icons } from '../components/Icons';
import { Button } from '../components/Shared';
import { useAuth } from '../contexts/AuthContext';
import {
    UserArticle,
    createMyArticle,
    updateMyArticle,
    submitMyArticle,
    getMyArticles,
} from '../api/users';
import { uploadImage } from '../api/upload';
import { getFileUrl } from '../api/config';
import { remarkDisableIndentedCodeBlock } from '../utils/remark-plugins';
import CoverCropper from '../components/CoverCropper';

const WritePage: React.FC = () => {
    const { isAuthenticated, isLoading } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const articleIdParam = searchParams.get('article_id');
    const isEdit = !!articleIdParam;

    // 登录守卫
    if (isLoading) {
        return (
            <div className="max-w-6xl mx-auto px-4 py-20 text-center text-slate-400 dark:text-slate-500">
                <div className="animate-pulse">加载中...</div>
            </div>
        );
    }
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return <WriteForm navigate={navigate} articleId={isEdit ? parseInt(articleIdParam!) : null} />;
};

const WriteForm: React.FC<{ navigate: (to: string) => void; articleId: number | null }> = ({ navigate, articleId }) => {
    const [loading, setLoading] = useState(!!articleId);
    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Form state
    const [title, setTitle] = useState('');
    const [summary, setSummary] = useState('');
    const [content, setContent] = useState('');
    const [category, setCategory] = useState('');
    const [coverImage, setCoverImage] = useState('');
    const [selectedTagNames, setSelectedTagNames] = useState<string[]>([]);
    const [newTagInput, setNewTagInput] = useState('');

    // 封面裁剪相关状态
    const [cropperImageSrc, setCropperImageSrc] = useState<string>('');
    const coverFileRef = useRef<HTMLInputElement>(null);

    // 401/403 时跳登录页
    const handleAuthError = (error: any): boolean => {
        const status = error?.response?.status;
        if (status === 401 || status === 403) {
            navigate('/login');
            return true;
        }
        return false;
    };

    // 编辑模式：从「我的文章」列表中加载指定草稿（status 为空返回全部状态）
    useEffect(() => {
        if (!articleId) return;
        const fetchArticle = async () => {
            setLoading(true);
            try {
                const response = await getMyArticles({ page: 1, page_size: 100 });
                const list = Array.isArray(response) ? response : (response.data || []);
                const article: UserArticle | undefined = list.find((a) => a.id === articleId);
                if (!article) {
                    alert('未找到这篇文章，或它不属于你');
                    navigate('/user');
                    return;
                }
                if (article.status !== 'draft' && article.status !== 'rejected') {
                    alert('仅草稿/已驳回的文章可以编辑');
                    navigate('/user');
                    return;
                }
                setTitle(article.title);
                setSummary(article.summary || '');
                setContent(article.content_md || '');
                setCategory(article.category || '');
                setCoverImage(article.cover_image || '');
                setSelectedTagNames(article.tags || []);
            } catch (error: any) {
                if (!handleAuthError(error)) {
                    alert('加载文章失败');
                    navigate('/user');
                }
            } finally {
                setLoading(false);
            }
        };
        fetchArticle();
    }, [articleId]);

    const handleContentChange = useCallback((val?: string) => {
        setContent(val || '');
    }, []);

    const buildPayload = () => ({
        title,
        content_md: content,
        summary: summary || undefined,
        category: category || undefined,
        cover_image: coverImage || undefined,
        tags: selectedTagNames,
    });

    // 保存草稿
    const handleSaveDraft = async () => {
        if (!title.trim() || !content.trim()) {
            alert('请填写标题和内容');
            return;
        }
        setSaving(true);
        try {
            if (articleId) {
                await updateMyArticle(articleId, buildPayload());
            } else {
                await createMyArticle(buildPayload());
            }
            alert('草稿已保存');
            navigate('/user');
        } catch (error: any) {
            if (!handleAuthError(error)) {
                const detail = error.response?.data?.detail;
                const message = typeof detail === 'string' ? detail : (detail?.msg || JSON.stringify(detail) || '保存失败');
                alert(message);
            }
        } finally {
            setSaving(false);
        }
    };

    // 提交审核（先保存当前内容，再进入待审核）
    const handleSubmitReview = async () => {
        if (!title.trim() || !content.trim()) {
            alert('请填写标题和内容');
            return;
        }
        setSubmitting(true);
        try {
            const payload = buildPayload();
            const article: UserArticle = articleId
                ? await updateMyArticle(articleId, payload)
                : await createMyArticle(payload);
            await submitMyArticle(article.id);
            alert('已提交审核，请耐心等待管理员处理');
            navigate('/user');
        } catch (error: any) {
            if (!handleAuthError(error)) {
                const detail = error.response?.data?.detail;
                const message = typeof detail === 'string' ? detail : (detail?.msg || JSON.stringify(detail) || '提交失败');
                alert(message);
            }
        } finally {
            setSubmitting(false);
        }
    };

    // 选择封面图片后，先读取为 data URL 再打开裁剪器
    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            setCropperImageSrc(reader.result as string);
        };
        reader.readAsDataURL(file);
        if (coverFileRef.current) coverFileRef.current.value = '';
    };

    // 裁剪完成后上传到后端
    const handleCropComplete = async (croppedBlob: Blob) => {
        setCropperImageSrc('');
        try {
            const file = new File([croppedBlob], 'cover.jpg', { type: 'image/jpeg' });
            const result = await uploadImage(file);
            setCoverImage(result.url);
        } catch (error: any) {
            if (!handleAuthError(error)) {
                alert('封面上传失败');
            }
        }
    };

    if (loading) {
        return (
            <div className="max-w-6xl mx-auto px-4 py-20 text-center text-slate-400 dark:text-slate-500">
                <div className="animate-pulse">加载中...</div>
            </div>
        );
    }

    return (
        <>
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6" data-color-mode="light">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                        {articleId ? '编辑投稿' : '写新文章'}
                    </h1>
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={() => navigate('/user')}>
                            取消
                        </Button>
                        <Button variant="secondary" onClick={handleSaveDraft} disabled={saving || submitting}>
                            {saving ? '保存中...' : '保存草稿'}
                        </Button>
                        <Button onClick={handleSubmitReview} disabled={saving || submitting}>
                            {submitting ? '提交中...' : '提交审核'}
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Main Editor */}
                    <div className="lg:col-span-3 space-y-6">
                        {/* Title */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="文章标题"
                                className="w-full text-2xl font-bold bg-transparent border-none text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-0"
                            />
                        </div>

                        {/* Content Editor */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                            <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                                <span className="text-sm text-slate-600 dark:text-slate-300 font-medium">Markdown 编辑器</span>
                            </div>
                            {uploading && (
                                <div className="px-4 py-2 bg-blue-50 text-blue-600 text-sm">
                                    正在上传封面，请稍后...
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
                        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
                            <h3 className="font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-700 pb-2">文章设置</h3>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">分类</label>
                                <input
                                    type="text"
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    placeholder="如：Frontend, AI, System"
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-200 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">摘要</label>
                                <textarea
                                    value={summary}
                                    onChange={(e) => setSummary(e.target.value)}
                                    placeholder="文章简短描述（最多150字）"
                                    rows={3}
                                    maxLength={150}
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-200 text-sm resize-none focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-all"
                                />
                            </div>
                        </div>

                        {/* Cover Image */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
                            <h3 className="font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-700 pb-2">封面图片</h3>

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
                                    <div className="border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-xl p-8 text-center hover:border-cyan-500 hover:bg-cyan-50/50 dark:hover:bg-cyan-900/10 transition-all group">
                                        <Icons.Image className="w-10 h-10 text-slate-300 dark:text-slate-500 mx-auto mb-3 group-hover:text-cyan-500 transition-colors" />
                                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">点击上传封面</span>
                                        <span className="block text-xs text-slate-400 dark:text-slate-500 mt-1">支持缩放与裁剪</span>
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
                        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
                            <h3 className="font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-700 pb-2">标签</h3>

                            {selectedTagNames.length > 0 && (
                                <div className="flex flex-wrap gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
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
                                    className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-200 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
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

export default WritePage;
