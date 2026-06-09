import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Input } from '../components/Shared';
import { Icons } from '../components/Icons';
import MarkdownContent from '../components/MarkdownContent';
import { createForumThread, ForumCategory, getForumCategories } from '../api/forum';
import { useToast } from '../components/Toast';

const ForumNewThread: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);

  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');

  const [preview, setPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchCats = async () => {
      setLoadingCats(true);
      try {
        const res = await getForumCategories();
        setCategories(res);
      } catch (e) {
        console.error('获取分类失败:', e);
      } finally {
        setLoadingCats(false);
      }
    };
    fetchCats();
  }, []);

  const selectedCategory = useMemo(() => {
    if (!categoryId) return null;
    return categories.find(c => c.id === categoryId) || null;
  }, [categories, categoryId]);

  const canSubmit = Boolean(categoryId) && title.trim().length > 0 && content.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    try {
      const thread = await createForumThread({
        category_id: categoryId as number,
        title: title.trim(),
        content: content.trim(),
        nickname: nickname.trim() || undefined,
        email: email.trim() || undefined,
        honeypot: honeypot.trim() || undefined,
      });

      showToast('发布成功', 'success');
      navigate(`/forum/threads/${thread.id}`);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || '发布失败';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <Link
          to="/forum"
          className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 group transition-colors"
        >
          <Icons.ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          返回论坛
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3 transition-colors">
          <span className="w-2 h-8 bg-primary-500 rounded-full"></span>
          发布主题
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant={preview ? 'outline' : 'primary'}
            size="sm"
            onClick={() => setPreview(false)}
            className="gap-1.5"
          >
            <Icons.FileText className="w-4 h-4" /> 编辑
          </Button>
          <Button
            variant={preview ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setPreview(true)}
            className="gap-1.5"
          >
            <Icons.Eye className="w-4 h-4" /> 预览
          </Button>
        </div>
      </div>

      <Card className="p-6 sm:p-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div>
            <div className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">分类（必选）</div>
            <div className="relative">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}
                className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 text-sm rounded-xl focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition-colors"
                disabled={loadingCats}
              >
                <option value="">请选择分类</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {selectedCategory && (
              <div className="mt-2"><Badge>{selectedCategory.name}</Badge></div>
            )}
          </div>

          <div>
            <div className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">昵称（选填）</div>
            <Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="不填将生成 游客xxxx" />
            <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">匿名发帖；邮箱不会对外返回。</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div>
            <div className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">邮箱（选填）</div>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </div>

          {/* Honeypot：隐藏字段 */}
          <div className="hidden">
            <label className="text-sm">hp</label>
            <Input value={honeypot} onChange={(e) => setHoneypot(e.target.value)} placeholder="leave empty" />
          </div>
        </div>

        <div className="mb-5">
          <div className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">标题</div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="一句话概括你的问题/主题" maxLength={200} />
        </div>

        <div>
          <div className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">内容（Markdown）</div>
          {preview ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5 bg-white dark:bg-slate-800">
              {content.trim() ? (
                <article className="prose prose-slate dark:prose-invert max-w-none">
                  <MarkdownContent allowHtml={false} className="!max-w-none">{content}</MarkdownContent>
                </article>
              ) : (
                <div className="text-sm text-slate-400 dark:text-slate-500">预览区：请输入内容</div>
              )}
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl p-4 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-y min-h-[240px] dark:text-white transition-colors"
              placeholder="支持 Markdown：\n\n- 列表\n- 代码块\n- 链接\n\n（默认禁用 HTML）"
              maxLength={20000}
            />
          )}
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <Link to="/forum">
            <Button variant="ghost">取消</Button>
          </Link>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting} className="gap-2">
            <Icons.Send className="w-4 h-4" />
            {submitting ? '发布中...' : '发布主题'}
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default ForumNewThread;
