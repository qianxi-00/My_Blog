/**
 * 用户投稿编辑器（需登录）
 * 保留 MDEditor（GFM + KaTeX + remarkDisableIndentedCodeBlock）、CoverCropper、草稿与提交审核工作流
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import MDEditor from '@uiw/react-md-editor';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Icons } from '../components/Icons';
import { Button, Input, Textarea } from '../components/Shared';
import { ListSkeleton } from '../components/Skeleton';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../components/Toast';
import {
  UserArticle,
  createMyArticle,
  updateMyArticle,
  submitMyArticle,
  getMyArticle,
} from '../api/users';
import { uploadImage } from '../api/upload';
import { getFileUrl } from '../api/config';
import { remarkDisableIndentedCodeBlock } from '../utils/remark-plugins';
import { errorText } from '../utils/errors';
import CoverCropper from '../components/CoverCropper';

const WritePage: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const articleIdParam = searchParams.get('article_id');
  const parsedId = articleIdParam ? parseInt(articleIdParam, 10) : NaN;
  const articleId = Number.isFinite(parsedId) ? parsedId : null;

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <ListSkeleton rows={4} />
      </div>
    );
  }
  if (!isAuthenticated) {
    const target = articleId
      ? `/login?redirect=${encodeURIComponent(`/write?article_id=${articleId}`)}`
      : '/login?redirect=%2Fwrite';
    return <Navigate to={target} replace />;
  }

  return <WriteForm navigate={navigate} articleId={articleId} />;
};

const WriteForm: React.FC<{ navigate: (to: string) => void; articleId: number | null }> = ({
  navigate,
  articleId,
}) => {
  const { theme } = useTheme();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(!!articleId);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [selectedTagNames, setSelectedTagNames] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');

  const [cropperImageSrc, setCropperImageSrc] = useState('');
  const coverFileRef = useRef<HTMLInputElement>(null);

  const handleAuthError = (error: any): boolean => {
    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      navigate('/login?redirect=%2Fwrite');
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (!articleId) return;
    const fetchArticle = async () => {
      setLoading(true);
      try {
        const article: UserArticle = await getMyArticle(articleId);
        if (article.status !== 'draft' && article.status !== 'rejected') {
          showToast('仅草稿或已驳回的文章可以编辑', 'info');
          navigate('/user?tab=content');
          return;
        }
        setTitle(article.title);
        setSummary(article.summary || '');
        setContent(article.content_md || '');
        setCategory(article.category || '');
        setCoverImage(article.cover_image || '');
        setSelectedTagNames(
          (article.tags || []).map((t) => (typeof t === 'string' ? t : t.name))
        );
      } catch (error: any) {
        if (!handleAuthError(error)) {
          showToast(errorText(error, '加载文章失败'), 'error');
          navigate('/user?tab=content');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchArticle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  const handleContentChange = useCallback((val?: string) => {
    setContent(val || '');
  }, []);

  const buildPayload = () => ({
    title: title.trim(),
    content_md: content,
    summary: summary.trim() || undefined,
    category: category.trim() || undefined,
    cover_image: coverImage || undefined,
    tags: selectedTagNames,
  });

  const handleSaveDraft = async () => {
    if (!title.trim() || !content.trim()) {
      showToast('请填写标题和正文内容', 'error');
      return;
    }
    setSaving(true);
    try {
      if (articleId) {
        await updateMyArticle(articleId, buildPayload());
      } else {
        await createMyArticle(buildPayload());
      }
      showToast('草稿已保存', 'success');
      navigate('/user?tab=content');
    } catch (error: any) {
      if (!handleAuthError(error)) {
        showToast(errorText(error, '保存草稿失败'), 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!title.trim() || !content.trim()) {
      showToast('请填写标题和正文内容', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const payload = buildPayload();
      const article: UserArticle = articleId
        ? await updateMyArticle(articleId, payload)
        : await createMyArticle(payload);
      await submitMyArticle(article.id);
      showToast('已提交审核，站长审核通过后将公开发布', 'success');
      navigate('/user?tab=content');
    } catch (error: any) {
      if (!handleAuthError(error)) {
        showToast(errorText(error, '提交审核失败'), 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropperImageSrc(reader.result as string);
    reader.readAsDataURL(file);
    if (coverFileRef.current) coverFileRef.current.value = '';
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setCropperImageSrc('');
    setUploadingCover(true);
    try {
      const file = new File([croppedBlob], 'cover.jpg', { type: 'image/jpeg' });
      const result = await uploadImage(file, articleId ?? undefined, 'images');
      setCoverImage(result.url);
      showToast('封面上传成功', 'success');
    } catch (error: any) {
      if (!handleAuthError(error)) {
        showToast(errorText(error, '封面上传失败'), 'error');
      }
    } finally {
      setUploadingCover(false);
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
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <ListSkeleton rows={4} />
      </div>
    );
  }

  return (
    <>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        {/* Top Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-4">
          <div className="space-y-0.5">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
              {articleId ? '编辑投稿' : '创作新文章'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              支持标准 Markdown、KaTeX 公式、Mermaid 图表与代码高亮
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/user?tab=content')}>
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

        {/* Compact Editorial Guide */}
        {!articleId && (
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-5 py-4 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
            <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Icons.Sparkles className="w-3.5 h-3.5 text-primary-500" />
              <span>三步成稿投稿流程</span>
            </p>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
              1. 粘入你的 Markdown 笔记（编辑器实时双栏预览） · 2. 设置分类与摘要 · 3. 提交审核，通过后将自动署你的名字并归档到你的公开主页{' '}
              <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">
                /#/user/你的用户名
              </code>
              。
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* Main Editor */}
          <div className="lg:col-span-3 space-y-4">
            <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-5 py-4">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="输入文章标题..."
                className="w-full text-xl sm:text-2xl font-semibold bg-transparent border-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-0"
              />
            </div>

            <div
              className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
              data-color-mode={theme}
            >
              <MDEditor
                value={content}
                onChange={handleContentChange}
                height={540}
                preview="live"
                previewOptions={{
                  remarkPlugins: [remarkGfm, remarkMath, remarkDisableIndentedCodeBlock],
                  rehypePlugins: [rehypeKatex],
                }}
              />
            </div>
          </div>

          {/* Sidebar Metadata */}
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5 space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-2">
                文章属性
              </h3>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  分类
                </label>
                <Input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="例如 AI、Frontend、System"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  摘要（最多 150 字）
                </label>
                <Textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="简要概括核心结论或阅读收获..."
                  rows={3}
                  maxLength={150}
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-2">
                封面图片
              </h3>

              {coverImage ? (
                <div className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800">
                  <img src={getFileUrl(coverImage)} alt="Cover" className="w-full aspect-video object-cover" />
                  <button
                    type="button"
                    onClick={() => setCoverImage('')}
                    title="移除封面"
                    className="absolute top-2 right-2 p-1 rounded-full bg-slate-900/80 text-white hover:bg-rose-600 transition-colors"
                  >
                    <Icons.X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="block cursor-pointer">
                  <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 text-center hover:border-primary-500 hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors">
                    <Icons.Image className="w-7 h-7 text-slate-400 mx-auto mb-2" />
                    <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      {uploadingCover ? '上传中...' : '点击上传并裁剪封面'}
                    </span>
                    <span className="block text-[11px] text-slate-400 mt-0.5">推荐 16:9 比例</span>
                  </div>
                  <input
                    ref={coverFileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    disabled={uploadingCover}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-2">
                标签
              </h3>

              {selectedTagNames.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedTagNames.map((tagName) => (
                    <span
                      key={tagName}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                    >
                      #{tagName}
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedTagNames((prev) => prev.filter((t) => t !== tagName))
                        }
                        className="text-slate-400 hover:text-rose-500"
                        aria-label={`移除标签 ${tagName}`}
                      >
                        <Icons.X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="输入标签回车"
                />
                <Button type="button" size="sm" variant="outline" onClick={addTag} className="shrink-0">
                  添加
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {cropperImageSrc && (
        <CoverCropper
          imageSrc={cropperImageSrc}
          title="裁剪文章封面"
          onCropComplete={handleCropComplete}
          onCancel={() => setCropperImageSrc('')}
        />
      )}
    </>
  );
};

export default WritePage;
