import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, Input, Select } from '../components/Shared';
import { ListSkeleton } from '../components/Skeleton';
import { Icons } from '../components/Icons';
import Avatar from '../components/Avatar';
import MarkdownContent from '../components/MarkdownContent';
import { createForumThread, ForumCategory, getForumCategories } from '../api/forum';
import { uploadImage } from '../api/upload';
import { getFileUrl } from '../api/config';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { errorText } from '../utils/errors';

const PET_DRAFT_KEY = 'pet_forum_draft';

const ForumNewThread: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { showToast } = useToast();

  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);

  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [honeypot, setHoneypot] = useState('');

  const [draftSlug, setDraftSlug] = useState<string | null>(null);
  const [fromPet, setFromPet] = useState(false);

  const [preview, setPreview] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Restore DesktopPet conversation draft when arriving via ?from=pet
  useEffect(() => {
    if (searchParams.get('from') !== 'pet') return;
    try {
      const raw = sessionStorage.getItem(PET_DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        title?: string;
        content?: string;
        categorySlug?: string;
      };
      if (parsed.title && !title) setTitle(parsed.title);
      if (parsed.content && !content) setContent(parsed.content);
      if (parsed.categorySlug) setDraftSlug(parsed.categorySlug);
      setFromPet(true);
    } catch {
      // Ignore invalid draft JSON
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    const fetchCats = async () => {
      setLoadingCats(true);
      try {
        const res = await getForumCategories();
        if (!active) return;
        setCategories(res);
        if (res.length > 0) {
          setCategoryId((prev) => {
            if (prev !== '') return prev;
            const bySlug = draftSlug
              ? res.find((c) => c.slug === draftSlug)
              : undefined;
            const askQianxi = res.find((c) => c.slug === 'ask-qianxi');
            const def = res.find((c) => c.is_default);
            return (bySlug || (fromPet ? askQianxi : undefined) || def || res[0]).id;
          });
        }
      } catch (e: any) {
        if (active) showToast(errorText(e, '获取版块列表失败'), 'error');
      } finally {
        if (active) setLoadingCats(false);
      }
    };
    fetchCats();
    return () => {
      active = false;
    };
  }, [draftSlug, fromPet, showToast]);

  const selectedCategory = useMemo(
    () => (categoryId ? categories.find((c) => c.id === categoryId) || null : null),
    [categories, categoryId]
  );

  const insertAtCursor = (snippet: string) => {
    const el = textareaRef.current;
    if (!el) {
      setContent((prev) => `${prev}${snippet}`);
      return;
    }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const next = content.slice(0, start) + snippet + content.slice(end);
    setContent(next);
    window.requestAnimationFrame(() => {
      el.focus();
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('图片大小不能超过 10MB', 'error');
      return;
    }
    setUploadingImage(true);
    try {
      const uploaded = await uploadImage(file, undefined, 'forum');
      const altName = file.name.replace(/\.[^/.]+$/, '') || 'image';
      insertAtCursor(`\n![${altName}](${getFileUrl(uploaded.url)})\n`);
      showToast('图片已上传并插入', 'success');
    } catch (err: any) {
      showToast(errorText(err, '图片上传失败'), 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  const canSubmit =
    Boolean(categoryId) &&
    title.trim().length > 0 &&
    content.trim().length > 0 &&
    !submitting &&
    !uploadingImage;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const thread = await createForumThread({
        category_id: categoryId as number,
        title: title.trim(),
        content: content.trim(),
        honeypot: honeypot.trim() || undefined,
      });
      try {
        sessionStorage.removeItem(PET_DRAFT_KEY);
      } catch {
        // ignore storage error
      }
      showToast('讨论已发布', 'success');
      navigate(`/forum/threads/${thread.id}`);
    } catch (err: any) {
      showToast(errorText(err, '发布失败'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <ListSkeleton rows={3} />
      </div>
    );
  }

  if (!isAuthenticated) {
    const redirectTarget = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(redirectTarget)}`}
        replace
      />
    );
  }

  const displayName = user?.display_name || user?.username || '用户';
  const avatarUrl =
    user?.avatar_url && !user.avatar_url.includes('dicebear.com')
      ? user.avatar_url
      : undefined;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6">
        <Link
          to="/forum"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <Icons.ArrowLeft className="w-4 h-4" />
          返回社区讨论
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 mb-6 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-600 dark:text-primary-400 mb-1.5">
            NEW DISCUSSION
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            发起新讨论
          </h1>
        </div>

        {/* Authenticated poster chip */}
        <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
          <Avatar name={displayName} avatarUrl={avatarUrl} className="w-6 h-6 text-xs" />
          <div className="text-xs leading-tight">
            <div className="font-medium text-slate-800 dark:text-slate-200">{displayName}</div>
            {user?.username && (
              <div className="text-slate-400 dark:text-slate-500">@{user.username}</div>
            )}
          </div>
        </div>
      </div>

      {fromPet && (
        <div className="mb-5 rounded-xl border border-primary-200/80 dark:border-primary-800/60 bg-primary-50/70 dark:bg-primary-950/30 px-4 py-3 text-xs text-primary-800 dark:text-primary-200 flex items-center gap-2">
          <Icons.Sparkles className="w-4 h-4 shrink-0 text-primary-600 dark:text-primary-400" />
          <span>已为你自动填入与小魄罗的对话草稿，可补充细节或上传截图后发布。</span>
        </div>
      )}

      <Card className="p-5 sm:p-7">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Hidden honeypot */}
          <div className="hidden" aria-hidden="true">
            <Input
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                选择版块
              </label>
              <Select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}
                disabled={loadingCats}
                className="w-full"
              >
                <option value="">请选择版块</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              {selectedCategory?.description && (
                <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
                  {selectedCategory.description}
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  讨论标题
                </label>
                <span className="text-[11px] text-slate-400 tabular-nums">{title.length}/200</span>
              </div>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="用一句话清晰概括你的问题或观点..."
                maxLength={200}
                required
              />
            </div>
          </div>

          {/* Markdown Editor */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setPreview(false)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    !preview
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  编写
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(true)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    preview
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  预览
                </button>
              </div>

              {!preview && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => insertAtCursor('\n```text\n\n```\n')}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="插入代码块"
                  >
                    <Icons.Code className="w-3.5 h-3.5" />
                    代码块
                  </button>
                  <button
                    type="button"
                    onClick={() => insertAtCursor('\n> ')}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="插入引用"
                  >
                    引用
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUploadImage}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="h-7 px-2.5 text-xs"
                  >
                    <Icons.Image className="w-3.5 h-3.5" />
                    {uploadingImage ? '上传中...' : '插入图片'}
                  </Button>
                </div>
              )}
            </div>

            {preview ? (
              <div className="min-h-[260px] rounded-xl border border-slate-200 dark:border-slate-800 p-5 bg-slate-50/50 dark:bg-slate-950/40">
                {content.trim() ? (
                  <article className="prose prose-slate dark:prose-invert max-w-none">
                    <MarkdownContent allowHtml={false} className="!max-w-none">
                      {content}
                    </MarkdownContent>
                  </article>
                ) : (
                  <div className="text-sm text-slate-400 dark:text-slate-500 py-10 text-center">
                    暂无可预览的内容
                  </div>
                )}
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={12}
                maxLength={20000}
                placeholder={'详细描述你的问题背景、报错信息或讨论要点...\n\n支持 Markdown 语法、代码块及图片上传（默认禁用原始 HTML）。'}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-y min-h-[260px] leading-relaxed"
              />
            )}

            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
              <span>支持 Markdown 与附件图片，禁止原始 HTML</span>
              <span className="tabular-nums">{content.length}/20000</span>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            {selectedCategory ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>将发布到</span>
                <Badge color="slate">{selectedCategory.name}</Badge>
              </div>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2.5">
              <Link to="/forum">
                <Button type="button" variant="ghost">
                  取消
                </Button>
              </Link>
              <Button type="submit" disabled={!canSubmit}>
                <Icons.Send className="w-4 h-4" />
                {submitting ? '发布中...' : '发布讨论'}
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default ForumNewThread;
