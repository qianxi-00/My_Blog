/**
 * Prompt 管理页面
 */
import React, { useState, useEffect } from 'react';
import { getPrompts, getPendingPrompts, approvePrompt, rejectPrompt, deletePrompt, createPrompt, updatePrompt, Prompt, PromptCategory, PromptCreate } from '../api/prompts';
import { Icons } from '../components/Icons';

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

const PromptManager: React.FC = () => {
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
            const response = tab === 'approved'
                ? await getPrompts({ page, page_size: 20 })
                : await getPendingPrompts({ page, page_size: 20 });
            setPrompts(response.data);
            setTotalPages(response.total_pages);
        } catch (error) {
            console.error('获取 Prompt 列表失败:', error);
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
        } catch (error) {
            console.error('审核 Prompt 失败:', error);
        }
    };

    const handleReject = async (id: number) => {
        try {
            await rejectPrompt(id);
            setPrompts((prev) => prev.filter((p) => p.id !== id));
        } catch (error) {
            console.error('拒绝 Prompt 失败:', error);
        }
    };

    const handleDelete = async (id: number, title: string) => {
        if (window.confirm(`确定要删除 Prompt "${title}" 吗？`)) {
            try {
                await deletePrompt(id);
                setPrompts((prev) => prev.filter((p) => p.id !== id));
            } catch (error) {
                console.error('删除 Prompt 失败:', error);
            }
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
            alert('请填写标题和内容');
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
                // 编辑模式时额外提交使用次数和点赞量
                data.use_count = formData.use_count;
                data.like_count = formData.like_count;
                await updatePrompt(editingPrompt.id, data);
                alert('更新成功');
            } else {
                await createPrompt(data);
                alert('创建成功');
            }
            closeModal();
            fetchPrompts();
        } catch (error: any) {
            alert(error.response?.data?.detail || '操作失败');
        } finally {
            setSaving(false);
        }
    };

    const getCategoryBadge = (category: PromptCategory) => {
        const colors: Record<PromptCategory, string> = {
            Dev: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
            Writing: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800',
            Business: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800',
            Academic: 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
            Other: 'bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600',
        };
        return (
            <span className={`px-2 py-1 text-xs rounded-full border ${colors[category]}`}>
                {category}
            </span>
        );
    };

    const categories: PromptCategory[] = ['Dev', 'Writing', 'Business', 'Academic', 'Other'];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Prompt 管理</h1>
                <button
                    onClick={openCreateModal}
                    className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-lg hover:from-cyan-600 hover:to-purple-700 transition-all shadow-md shadow-cyan-500/20"
                >
                    + 新建 Prompt
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
                <button
                    onClick={() => { setTab('approved'); setPage(1); }}
                    className={`px-4 py-2 rounded-lg text-sm transition-all font-medium ${tab === 'approved'
                        ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                        }`}
                >
                    已审核
                </button>
                <button
                    onClick={() => { setTab('pending'); setPage(1); }}
                    className={`px-4 py-2 rounded-lg text-sm transition-all font-medium ${tab === 'pending'
                        ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                        }`}
                >
                    待审核
                </button>
            </div>

            {/* Prompt List */}
            <div className="space-y-4">
                {loading ? (
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-10 text-center text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 shadow-sm">
                        加载中...
                    </div>
                ) : prompts.length === 0 ? (
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-10 text-center text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 shadow-sm">
                        {tab === 'pending' ? '🎉 没有待审核的 Prompt' : '暂无 Prompt'}
                    </div>
                ) : (
                    prompts.map((prompt) => (
                        <div
                            key={prompt.id}
                            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm hover:shadow-md transition-shadow"
                        >
                            <div className="flex justify-between items-start gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{prompt.title}</h3>
                                        {getCategoryBadge(prompt.category)}
                                    </div>
                                    {prompt.description && (
                                        <p className="text-slate-600 dark:text-slate-400 text-sm mb-3 leading-relaxed">{prompt.description}</p>
                                    )}
                                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 font-mono text-sm text-slate-700 dark:text-slate-300 max-h-32 overflow-y-auto border border-slate-100 dark:border-slate-700">
                                        {prompt.content}
                                    </div>
                                    <div className="mt-3 text-xs text-slate-500 dark:text-slate-400 flex gap-4">
                                        <span>使用次数: {prompt.use_count}</span>
                                        {prompt.submitted_by && <span>提交者: {prompt.submitted_by}</span>}
                                        <span>{new Date(prompt.created_at).toLocaleDateString('zh-CN')}</span>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-2 shrink-0">
                                    {tab === 'pending' ? (
                                        <>
                                            <button
                                                onClick={() => handleApprove(prompt.id)}
                                                className="px-4 py-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-all font-medium"
                                            >
                                                通过
                                            </button>
                                            <button
                                                onClick={() => handleReject(prompt.id)}
                                                className="px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-all font-medium"
                                            >
                                                拒绝
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            onClick={() => openEditModal(prompt)}
                                            className="px-4 py-2 text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-medium hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded-lg transition-colors"
                                        >
                                            编辑
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleDelete(prompt.id, prompt.title)}
                                        className="px-4 py-2 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                    >
                                        删除
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-center gap-2">
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-lg disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                        上一页
                    </button>
                    <span className="px-4 py-2 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                        {page} / {totalPages}
                    </span>
                    <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-lg disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                        下一页
                    </button>
                </div>
            )}

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-700 transition-all scale-100">
                        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-800 z-10">
                            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                                {editingPrompt ? '编辑 Prompt' : '新建 Prompt'}
                            </h2>
                            <button
                                onClick={closeModal}
                                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                <Icons.X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    标题 <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    className="w-full px-4 py-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all"
                                    placeholder="例如：代码审查助手"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    分类
                                </label>
                                <select
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value as PromptCategory })}
                                    className="w-full px-4 py-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all"
                                >
                                    {categories.map((cat) => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    描述
                                </label>
                                <input
                                    type="text"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full px-4 py-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all"
                                    placeholder="简短描述这个 Prompt 的用途"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Prompt 内容 <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    value={formData.content}
                                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                                    rows={8}
                                    className="w-full px-4 py-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none resize-none font-mono text-sm transition-all"
                                    placeholder="输入 Prompt 内容..."
                                />
                            </div>

                            {/* 编辑模式下显示使用次数和点赞量 */}
                            {editingPrompt && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            使用次数
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.use_count}
                                            onChange={(e) => setFormData({ ...formData, use_count: parseInt(e.target.value) || 0 })}
                                            className="w-full px-4 py-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all"
                                            min="0"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            点赞量
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.like_count}
                                            onChange={(e) => setFormData({ ...formData, like_count: parseInt(e.target.value) || 0 })}
                                            className="w-full px-4 py-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all"
                                            min="0"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-lg hover:from-cyan-600 hover:to-purple-700 transition-all disabled:opacity-50 shadow-md shadow-cyan-500/20"
                                >
                                    {saving ? '保存中...' : (editingPrompt ? '保存修改' : '创建')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PromptManager;
