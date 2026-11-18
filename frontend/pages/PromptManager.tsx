/**
 * Prompt 管理页面
 */
import React, { useState, useEffect } from 'react';
import {
  getPrompts,
  getPendingPrompts,
  approvePrompt,
  rejectPrompt,
  deletePrompt,
  createPrompt,
  updatePrompt,
  Prompt,
  PromptCategory,
} from '../api/prompts';
import { Icons } from '../components/Icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  Textarea,
} from '../components/Shared';
import { ListSkeleton } from '../components/Skeleton';
import { errorText } from '../utils/errors';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';

type TabType = 'approved' | 'pending';

interface PromptFormData {
  title: string;
  description: string;
  content: string;
  category: PromptCategory;
  use_count: number;
  like_count: number;
}

const emptyForm: PromptFormData = {
  title: '',
  description: '',
  content: '',
  category: 'Dev',
  use_count: 0,
  like_count: 0,
};

const CATEGORY_COLOR: Record<
  PromptCategory,
  'blue' | 'primary' | 'emerald' | 'amber' | 'red' | 'slate'
> = {
  Dev: 'blue',
  Writing: 'primary',
  Business: 'emerald',
  Academic: 'amber',
  Thinking: 'primary',
  Growth: 'red',
  Other: 'slate',
};

const CATEGORIES: PromptCategory[] = [
  'Dev',
  'Writing',
  'Business',
  'Academic',
  'Thinking',
  'Growth',
  'Other',
];

const PromptManager: React.FC = () => {
  const { confirm, confirmDialog } = useConfirm();
  const { showToast } = useToast();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabType>('approved');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [formData, setFormData] = useState<PromptFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchPrompts = async () => {
    setLoading(true);
    try {
      const response =
        tab === 'approved'
          ? await getPrompts({ page, page_size: 20 })
          : await getPendingPrompts({ page, page_size: 20 });
      setPrompts(response.data);
      setTotalPages(response.total_pages);
    } catch (error) {
      console.error('获取 Prompt 列表失败:', error);
      showToast(errorText(error, '获取 Prompt 列表失败'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrompts();
  }, [tab, page]);

  const handleApprove = async (id: number) => {
    try {
      await approvePrompt(id);
      setPrompts((prev) => prev.filter((p) => p.id !== id));
      showToast('已通过审核', 'success');
    } catch (error) {
      console.error('审核 Prompt 失败:', error);
      showToast(errorText(error, '审核 Prompt 失败'), 'error');
    }
  };

  const handleReject = async (id: number) => {
    try {
      await rejectPrompt(id);
      setPrompts((prev) => prev.filter((p) => p.id !== id));
      showToast('已拒绝投稿', 'success');
    } catch (error) {
      console.error('拒绝 Prompt 失败:', error);
      showToast(errorText(error, '拒绝 Prompt 失败'), 'error');
    }
  };

  const handleDelete = async (id: number, title: string) => {
    const ok = await confirm({
      title: '删除 Prompt',
      message: `确定要删除 Prompt "${title}" 吗？删除后不可恢复。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await deletePrompt(id);
      setPrompts((prev) => prev.filter((p) => p.id !== id));
      showToast('已删除', 'success');
    } catch (error) {
      console.error('删除 Prompt 失败:', error);
      showToast(errorText(error, '删除 Prompt 失败'), 'error');
    }
  };

  const openCreateModal = () => {
    setEditingPrompt(null);
    setFormData(emptyForm);
    setShowModal(true);
  };

  const openEditModal = (prompt: Prompt) => {
    setEditingPrompt(prompt);
    setFormData({
      title: prompt.title,
      description: prompt.description || '',
      content: prompt.content,
      category: prompt.category,
      use_count: prompt.use_count,
      like_count: prompt.like_count || 0,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingPrompt(null);
    setFormData(emptyForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.content.trim()) {
      showToast('请填写标题和内容', 'error');
      return;
    }

    setSaving(true);
    try {
      const data: any = {
        title: formData.title,
        description: formData.description || undefined,
        content: formData.content,
        category: formData.category,
      };

      if (editingPrompt) {
        data.use_count = formData.use_count;
        data.like_count = formData.like_count;
        await updatePrompt(editingPrompt.id, data);
        showToast('Prompt 已更新', 'success');
      } else {
        await createPrompt(data);
        showToast('Prompt 已创建', 'success');
      }
      closeModal();
      fetchPrompts();
    } catch (error: any) {
      showToast(errorText(error, '操作失败'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
            Prompt 管理
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            维护精选提示词库并审核用户投稿
          </p>
        </div>
        <Button size="sm" onClick={openCreateModal}>
          <Icons.Plus className="w-3.5 h-3.5" />
          新建 Prompt
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200/80 dark:border-slate-800">
        <button
          type="button"
          onClick={() => {
            setTab('approved');
            setPage(1);
          }}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'approved'
              ? 'text-slate-900 dark:text-white border-primary-500'
              : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          已审核
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('pending');
            setPage(1);
          }}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'pending'
              ? 'text-slate-900 dark:text-white border-primary-500'
              : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          待审核
        </button>
      </div>

      {/* Prompt List */}
      <div className="space-y-4">
        {loading ? (
          <ListSkeleton rows={4} />
        ) : prompts.length === 0 ? (
          <EmptyState
            icon={
              tab === 'pending' ? (
                <Icons.CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ) : (
                <Icons.Bot className="w-5 h-5" />
              )
            }
            title={tab === 'pending' ? '没有待审核的 Prompt' : '暂无 Prompt'}
            description={
              tab === 'pending'
                ? '用户提交的新提示词将出现在这里等待审核。'
                : '点击右上角“新建 Prompt”添加提示词卡片。'
            }
            action={
              tab === 'approved' ? (
                <Button size="sm" onClick={openCreateModal}>
                  <Icons.Plus className="w-3.5 h-3.5" />
                  新建 Prompt
                </Button>
              ) : undefined
            }
          />
        ) : (
          prompts.map((prompt) => (
            <Card key={prompt.id} className="p-5 hover:border-slate-300 dark:hover:border-slate-700">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                      {prompt.title}
                    </h3>
                    <Badge color={CATEGORY_COLOR[prompt.category] || 'slate'}>
                      {prompt.category}
                    </Badge>
                  </div>
                  {prompt.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">
                      {prompt.description}
                    </p>
                  )}
                  <div className="bg-slate-50 dark:bg-slate-950/60 rounded-lg p-3.5 font-mono text-xs text-slate-700 dark:text-slate-300 max-h-32 overflow-y-auto border border-slate-200/70 dark:border-slate-800 whitespace-pre-wrap">
                    {prompt.content}
                  </div>
                  <div className="mt-3 text-xs text-slate-400 dark:text-slate-500 flex flex-wrap gap-4 tabular-nums">
                    <span>使用次数：{prompt.use_count}</span>
                    <span>点赞数：{prompt.like_count || 0}</span>
                    {prompt.submitted_by && <span>提交者：{prompt.submitted_by}</span>}
                    <span>{new Date(prompt.created_at).toLocaleDateString('zh-CN')}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {tab === 'pending' ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(prompt.id)}
                        className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700"
                      >
                        通过
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(prompt.id)}
                        className="h-7 px-2.5 text-xs text-amber-600 dark:text-amber-400 border-amber-200/80 dark:border-amber-800/60"
                      >
                        拒绝
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditModal(prompt)}
                      className="h-7 px-2.5 text-xs"
                    >
                      编辑
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(prompt.id, prompt.title)}
                    className="h-7 px-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    删除
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            上一页
          </Button>
          <span className="px-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            第 {page} / {totalPages} 页
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            下一页
          </Button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center z-50 p-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Card className="max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {editingPrompt ? '编辑 Prompt' : '新建 Prompt'}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                aria-label="关闭弹窗"
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                <Icons.X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  标题 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="例如：代码审查助手"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  分类
                </label>
                <Select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value as PromptCategory })
                  }
                  className="w-full"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  描述
                </label>
                <Input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="简短描述这个 Prompt 的用途"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Prompt 内容 <span className="text-red-500">*</span>
                </label>
                <Textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={8}
                  className="font-mono text-xs resize-none"
                  placeholder="输入 Prompt 内容..."
                />
              </div>

              {editingPrompt && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      使用次数
                    </label>
                    <Input
                      type="number"
                      value={formData.use_count}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          use_count: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      点赞量
                    </label>
                    <Input
                      type="number"
                      value={formData.like_count}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          like_count: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      min="0"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200/70 dark:border-slate-800">
                <Button type="button" size="sm" variant="outline" onClick={closeModal}>
                  取消
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? '保存中...' : editingPrompt ? '保存修改' : '创建'}
                </Button>
              </div>
            </form>
            </Card>
          </div>
        </div>
      )}

      {confirmDialog}
    </div>
  );
};

export default PromptManager;
