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
import { Badge, Button, Card, Input, Textarea } from '../components/Shared';
import { DetailSkeleton } from '../components/Skeleton';
import {
  getArticle,
  createArticle,
  updateArticle,
  publishArticle,
  getTags,
  Tag,
  Article,
  generateSummary,
} from '../api/articles';
import { uploadImage } from '../api/upload';
import { remarkDisableIndentedCodeBlock } from '../utils/remark-plugins';
import { getFileUrl } from '../api/config';
import CoverCropper from '../components/CoverCropper';
import { errorText } from '../utils/errors';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useTheme } from '../contexts/ThemeContext';

const ArticleEditor: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const { confirm, confirmDialog } = useConfirm();
  const { showToast } = useToast();
  const { theme } = useTheme();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [existingTags, setExistingTags] = useState<Tag[]>([]);

  // 文件上传引用
  const mdFileRef = useRef<HTMLInputElement>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [selectedTagNames, setSelectedTagNames] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
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
          const article = await getArticle(parseInt(id, 10));
          setTitle(article.title);
          setSlug(article.slug || '');
          setSummary(article.summary || '');
          setContent(article.content_md || '');
          setCategory(article.category || '');
          setCoverImage(article.cover_image || '');
          setSelectedTagNames(article.tags.map((t) => t.name));
          setIsPinned(article.is_pinned);
        }
      } catch (error) {
        console.error('加载失败:', error);
        showToast(errorText(error, '加载文章失败'), 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, isEdit, showToast]);

  // 优化编辑器性能，避免频繁重渲染导致卡顿
  const handleContentChange = useCallback((val?: string) => {
    setContent(val || '');
  }, []);

  const handleSave = async (publish: boolean = false) => {
    if (!title.trim() || !content.trim()) {
      showToast('请填写标题和内容', 'error');
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
        // 发布状态不在这里传：后端 articles.py 用 is_first_publish = status != 'published'
        // 判断首次发布并触发邮件通知，先把状态改成 published 会让首次通知被跳过。
        // 发布走下面的 publishArticle()；这里只负责"保存草稿 = 下架"。
        status: publish ? undefined : 'draft',
      };

      let article: Article;
      if (isEdit && id) {
        article = await updateArticle(parseInt(id, 10), data);
      } else {
        article = await createArticle(data);
      }

      if (publish) {
        await publishArticle(article.id);
        showToast('文章已保存并发布', 'success');
      } else {
        showToast(isEdit ? '文章已保存为草稿（已下架）' : '草稿已保存', 'success');
      }

      navigate('/admin/posts');
    } catch (error: any) {
      showToast(errorText(error, '保存失败'), 'error');
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
    if (coverFileRef.current) coverFileRef.current.value = '';
  };

  /**
   * 裁剪完成后，将 Blob 包装为 File 上传到后端
   */
  const handleCropComplete = async (croppedBlob: Blob) => {
    setCropperImageSrc('');
    try {
      const file = new File([croppedBlob], 'cover.jpg', { type: 'image/jpeg' });
      const result = await uploadImage(file);
      setCoverImage(result.url);
      showToast('封面上传成功', 'success');
    } catch (error) {
      showToast(errorText(error, '封面上传失败'), 'error');
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
    reader.onload = async (event) => {
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

      if (!content.trim()) {
        setContent(body);
        showToast('Markdown 文件已导入', 'success');
      } else {
        const replace = await confirm({
          title: '导入内容冲突',
          message: '当前已有内容。点「替换」覆盖现有内容，点「取消」把新内容追加到末尾。',
          confirmText: '替换',
          danger: true,
        });
        if (replace) {
          setContent(body);
          showToast('已覆盖当前文章内容', 'success');
        } else {
          setContent((prev) => prev + '\n\n---\n\n' + body);
          showToast('已追加到文章末尾', 'success');
        }
      }

      setUploading(false);
      if (mdFileRef.current) {
        mdFileRef.current.value = '';
      }
    };
    reader.onerror = () => {
      showToast('文件读取失败', 'error');
      setUploading(false);
    };
    reader.readAsText(file, 'UTF-8');
  };

  // 使用 AI 生成摘要
  const handleGenerateSummary = async () => {
    if (!content.trim()) {
      showToast('请先输入文章内容', 'error');
      return;
    }

    setGeneratingSummary(true);
    try {
      const result = await generateSummary(content);
      setSummary(result.summary);
      showToast('已生成摘要', 'success');
    } catch (error: any) {
      showToast(errorText(error, '摘要生成失败'), 'error');
    } finally {
      setGeneratingSummary(false);
    }
  };

  const addTag = () => {
    const tag = newTagInput.trim();
    if (!tag) return;
    if (!selectedTagNames.includes(tag)) {
      setSelectedTagNames((prev) => [...prev, tag]);
    }
    setNewTagInput('');
  };

  if (loading) {
    return <DetailSkeleton />;
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
              {isEdit ? '编辑文章' : '新建文章'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              支持 Markdown 实时预览、LaTeX 公式与 AI 摘要生成
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/posts')}>
              取消
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleSave(false)}
              disabled={saving}
            >
              {saving ? '保存中...' : '保存草稿'}
            </Button>
            <Button size="sm" onClick={() => handleSave(true)} disabled={saving}>
              {saving ? '发布中...' : '保存并发布'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Editor */}
          <div className="lg:col-span-3 space-y-6">
            {/* Title */}
            <Card className="p-5">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="输入文章标题..."
                className="w-full text-xl sm:text-2xl font-semibold bg-transparent border-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-0"
              />
            </Card>

            {/* Content Editor */}
            <Card className="overflow-hidden">
              <div data-color-mode={theme === 'dark' ? 'dark' : 'light'}>
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
                  <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                    Markdown 编辑器
                  </span>
                  <label className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1.5 font-medium cursor-pointer transition-colors">
                    <Icons.Upload className="w-3.5 h-3.5" />
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
                {uploading && (
                  <div className="px-4 py-2 bg-primary-50 dark:bg-primary-950/50 text-primary-700 dark:text-primary-300 text-xs border-b border-primary-100 dark:border-primary-900/50">
                    正在导入文件，请稍候...
                  </div>
                )}
                <MDEditor
                  value={content}
                  onChange={handleContentChange}
                  height={520}
                  preview="live"
                  previewOptions={{
                    remarkPlugins: [remarkGfm, remarkMath, remarkDisableIndentedCodeBlock],
                    rehypePlugins: [rehypeKatex],
                  }}
                />
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Meta */}
            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200/70 dark:border-slate-800 pb-2.5">
                文章设置
              </h3>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  Slug (URL)
                </label>
                <Input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="auto-generated"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  分类
                </label>
                <Input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="如：Frontend, AI, System"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                    摘要
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateSummary}
                    disabled={generatingSummary || !content.trim()}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
                    title="根据文章内容自动生成摘要"
                  >
                    <Icons.Sparkles className={`w-3.5 h-3.5 ${generatingSummary ? 'animate-spin' : ''}`} />
                    {generatingSummary ? '生成中...' : 'AI 生成'}
                  </button>
                </div>
                <Textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="文章简短描述（最多150字）"
                  rows={3}
                  maxLength={150}
                  className="resize-none"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  id="isPinned"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700 text-primary-600 focus:ring-primary-500 h-4 w-4"
                />
                置顶文章
              </label>
            </Card>

            {/* Cover Image */}
            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200/70 dark:border-slate-800 pb-2.5">
                封面图片
              </h3>

              {coverImage ? (
                <div className="relative group">
                  <img
                    src={getFileUrl(coverImage)}
                    alt="Cover"
                    className="w-full rounded-lg border border-slate-200/80 dark:border-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => setCoverImage('')}
                    aria-label="移除封面"
                    className="absolute top-2 right-2 p-1.5 bg-slate-900/75 hover:bg-red-600 text-white rounded-full transition-colors"
                  >
                    <Icons.X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="block cursor-pointer">
                  <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 text-center hover:border-primary-500 dark:hover:border-primary-500 hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors group">
                    <Icons.Image className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2 group-hover:text-primary-500 transition-colors" />
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors block">
                      点击上传封面
                    </span>
                    <span className="block text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                      支持缩放与裁剪
                    </span>
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
            </Card>

            {/* Tags */}
            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200/70 dark:border-slate-800 pb-2.5">
                标签
              </h3>

              {selectedTagNames.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pb-2.5 border-b border-slate-200/70 dark:border-slate-800">
                  {selectedTagNames.map((tagName) => (
                    <Badge key={tagName} color="primary" className="pr-1">
                      <span>{tagName}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedTagNames((prev) => prev.filter((t) => t !== tagName))
                        }
                        aria-label={`移除标签 ${tagName}`}
                        className="hover:bg-primary-200/60 dark:hover:bg-primary-900 rounded p-0.5 transition-colors"
                      >
                        <Icons.X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTagInput.trim()) {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="输入标签，回车添加"
                />
                <Button size="sm" variant="outline" onClick={addTag} type="button" className="shrink-0">
                  添加
                </Button>
              </div>

              {existingTags.length > 0 && (
                <div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">
                    快捷选择
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {existingTags
                      .filter((t) => !selectedTagNames.includes(t.name))
                      .map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() =>
                            setSelectedTagNames((prev) => [...prev, tag.name])
                          }
                          className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                        >
                          + {tag.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* 封面裁剪弹窗 */}
      {cropperImageSrc && (
        <CoverCropper
          imageSrc={cropperImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={() => setCropperImageSrc('')}
        />
      )}

      {confirmDialog}
    </>
  );
};

export default ArticleEditor;
