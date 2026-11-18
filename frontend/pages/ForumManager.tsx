import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';
import Avatar from '../components/Avatar';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  StatusPill,
  Textarea,
} from '../components/Shared';
import { ListSkeleton } from '../components/Skeleton';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { TH, TD } from '../constants';
import { errorText } from '../utils/errors';
import {
  ForumCategory,
  ForumReportedTarget,
  ForumThreadListItem,
  confirmForumReport,
  createForumCategory,
  deleteForumCategory,
  deleteForumThread,
  dismissForumReport,
  getAdminForumThreads,
  getForumCategories,
  getForumReports,
  toggleThreadHidden,
  updateForumCategory,
  updateForumThread,
} from '../api/forum';

type ForumTab = 'reports' | 'threads' | 'categories';

const COLOR_OPTIONS: { value: string; label: string }[] = [
  { value: 'sky', label: '天蓝 (sky)' },
  { value: 'indigo', label: '靛蓝 (indigo)' },
  { value: 'emerald', label: '翠绿 (emerald)' },
  { value: 'amber', label: '琥珀 (amber)' },
  { value: 'rose', label: '玫瑰 (rose)' },
  { value: 'slate', label: '石板灰 (slate)' },
];

const REASON_LABELS: Record<string, string> = {
  spam: '垃圾广告',
  harassment: '人身攻击 / 引战',
  inappropriate: '不当或违规内容',
  off_topic: '严重偏题',
  copyright: '侵权 / 抄袭',
  other: '其他问题',
};

const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('zh-CN');
};

interface CategoryFormState {
  id: number | null;
  name: string;
  slug: string;
  description: string;
  sort_order: number;
  color: string;
  is_default: boolean;
  is_active: boolean;
}

const EMPTY_CATEGORY_FORM: CategoryFormState = {
  id: null,
  name: '',
  slug: '',
  description: '',
  sort_order: 10,
  color: 'sky',
  is_default: false,
  is_active: true,
};

const ForumManager: React.FC = () => {
  const { showToast } = useToast();
  const { confirm, confirmDialog } = useConfirm();

  const [activeTab, setActiveTab] = useState<ForumTab>('reports');

  // 版块列表（三页共用）
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  // 举报队列
  const [reports, setReports] = useState<ForumReportedTarget[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [actingReportKey, setActingReportKey] = useState<string | null>(null);

  // 全站主题列表
  const [threads, setThreads] = useState<ForumThreadListItem[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [threadPage, setThreadPage] = useState(1);
  const [threadTotalPages, setThreadTotalPages] = useState(1);
  const [threadTotal, setThreadTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [queryKeyword, setQueryKeyword] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState<string>('');
  const [filterVisibility, setFilterVisibility] = useState<'all' | 'visible' | 'hidden'>('all');
  const [filterReported, setFilterReported] = useState<'all' | 'reported'>('all');
  const [actingThreadId, setActingThreadId] = useState<number | null>(null);

  // 版块编辑弹窗
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catForm, setCatForm] = useState<CategoryFormState>(EMPTY_CATEGORY_FORM);
  const [savingCat, setSavingCat] = useState(false);
  const [actingCatId, setActingCatId] = useState<number | null>(null);

  const loadCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const data = await getForumCategories(true);
      setCategories(Array.isArray(data) ? data : []);
    } catch (error) {
      showToast(errorText(error, '获取版块列表失败'), 'error');
    } finally {
      setLoadingCategories(false);
    }
  }, [showToast]);

  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    try {
      const data = await getForumReports();
      setReports(Array.isArray(data) ? data : []);
    } catch (error) {
      showToast(errorText(error, '获取举报队列失败'), 'error');
    } finally {
      setLoadingReports(false);
    }
  }, [showToast]);

  const loadThreads = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const res = await getAdminForumThreads({
        page: threadPage,
        page_size: 20,
        category_id: filterCategoryId ? Number(filterCategoryId) : undefined,
        q: queryKeyword || undefined,
        is_hidden:
          filterVisibility === 'visible'
            ? false
            : filterVisibility === 'hidden'
              ? true
              : undefined,
        is_reported: filterReported === 'reported' ? true : undefined,
      });
      const items = res.data || [];
      if (items.length === 0 && threadPage > 1) {
        setThreadPage((p) => Math.max(1, p - 1));
        return;
      }
      setThreads(items);
      setThreadTotal(res.total || 0);
      setThreadTotalPages(Math.max(1, res.total_pages || 1));
    } catch (error) {
      showToast(errorText(error, '获取主题列表失败'), 'error');
    } finally {
      setLoadingThreads(false);
    }
  }, [
    threadPage,
    filterCategoryId,
    queryKeyword,
    filterVisibility,
    filterReported,
    showToast,
  ]);

  useEffect(() => {
    void loadCategories();
    void loadReports();
  }, [loadCategories, loadReports]);

  useEffect(() => {
    if (activeTab === 'threads') {
      void loadThreads();
    }
  }, [activeTab, loadThreads]);

  /* ------------------------------ 举报处理 ------------------------------ */

  const handleDismissReport = async (item: ForumReportedTarget) => {
    const key = `${item.target_type}-${item.target_id}`;
    setActingReportKey(key);
    try {
      await dismissForumReport(item.target_type, item.target_id);
      showToast('已驳回该举报', 'success');
      await loadReports();
      if (activeTab === 'threads') await loadThreads();
    } catch (error) {
      showToast(errorText(error, '驳回举报失败'), 'error');
    } finally {
      setActingReportKey(null);
    }
  };

  const handleConfirmReport = async (
    item: ForumReportedTarget,
    action: 'hide' | 'delete'
  ) => {
    if (action === 'delete') {
      const ok = await confirm({
        title: item.target_type === 'thread' ? '删除被举报主题' : '删除被举报楼层',
        message:
          item.target_type === 'thread'
            ? `确定删除主题「${item.thread_title}」吗？删除后前台不再可见。`
            : `确定删除主题「${item.thread_title}」中的 #${item.floor ?? '?'} 楼回复吗？`,
        confirmText: '确认删除',
        danger: true,
      });
      if (!ok) return;
    }

    const key = `${item.target_type}-${item.target_id}`;
    setActingReportKey(key);
    try {
      await confirmForumReport(item.target_type, item.target_id, action);
      showToast(action === 'delete' ? '已删除违规内容并结案' : '已隐藏内容并结案', 'success');
      await loadReports();
      if (activeTab === 'threads') await loadThreads();
    } catch (error) {
      showToast(errorText(error, '处理举报失败'), 'error');
    } finally {
      setActingReportKey(null);
    }
  };

  /* ------------------------------ 主题管理 ------------------------------ */

  const handleThreadToggleField = async (
    thread: ForumThreadListItem,
    field: 'is_pinned' | 'is_featured' | 'is_locked'
  ) => {
    const nextVal = !thread[field];
    setActingThreadId(thread.id);
    try {
      await updateForumThread(thread.id, { [field]: nextVal });
      const labels: Record<typeof field, [string, string]> = {
        is_pinned: ['已置顶主题', '已取消置顶'],
        is_featured: ['已设为精选', '已取消精选'],
        is_locked: ['已锁定主题', '已解锁主题'],
      };
      showToast(nextVal ? labels[field][0] : labels[field][1], 'success');
      await loadThreads();
    } catch (error) {
      showToast(errorText(error, '更新状态失败'), 'error');
    } finally {
      setActingThreadId(null);
    }
  };

  const handleThreadToggleHidden = async (thread: ForumThreadListItem) => {
    const nextHidden = !thread.is_hidden;
    setActingThreadId(thread.id);
    try {
      await toggleThreadHidden(thread.id, nextHidden);
      showToast(nextHidden ? '主题已隐藏' : '主题已恢复显示', 'success');
      await loadThreads();
      await loadCategories();
    } catch (error) {
      showToast(errorText(error, '切换可见状态失败'), 'error');
    } finally {
      setActingThreadId(null);
    }
  };

  const handleDeleteThread = async (thread: ForumThreadListItem) => {
    const ok = await confirm({
      title: '删除主题',
      message: `确定要删除主题「${thread.title}」吗？该主题下的回复也将一并下线。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;

    setActingThreadId(thread.id);
    try {
      await deleteForumThread(thread.id);
      showToast('主题已删除', 'success');
      await loadThreads();
      await loadCategories();
      await loadReports();
    } catch (error) {
      showToast(errorText(error, '删除主题失败'), 'error');
    } finally {
      setActingThreadId(null);
    }
  };

  /* ------------------------------ 版块管理 ------------------------------ */

  const openCreateCategory = () => {
    setCatForm({
      ...EMPTY_CATEGORY_FORM,
      sort_order: categories.length + 1,
    });
    setCatModalOpen(true);
  };

  const openEditCategory = (cat: ForumCategory) => {
    setCatForm({
      id: cat.id,
      name: cat.name,
      slug: cat.slug || '',
      description: cat.description || '',
      sort_order: cat.sort_order ?? 0,
      color: cat.color || 'sky',
      is_default: Boolean(cat.is_default),
      is_active: cat.is_active !== false,
    });
    setCatModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = catForm.name.trim();
    if (!name) {
      showToast('版块名称不能为空', 'error');
      return;
    }

    setSavingCat(true);
    try {
      if (catForm.id === null) {
        await createForumCategory({
          name,
          slug: catForm.slug.trim() || undefined,
          description: catForm.description.trim() || undefined,
          sort_order: Number.isFinite(catForm.sort_order) ? catForm.sort_order : 0,
          color: catForm.color || 'sky',
          is_default: catForm.is_default,
        });
        showToast('版块已创建', 'success');
      } else {
        await updateForumCategory(catForm.id, {
          name,
          slug: catForm.slug.trim() || undefined,
          description: catForm.description.trim(),
          sort_order: Number.isFinite(catForm.sort_order) ? catForm.sort_order : 0,
          color: catForm.color || 'sky',
          is_default: catForm.is_default,
          is_active: catForm.is_active,
        });
        showToast('版块已更新', 'success');
      }
      setCatModalOpen(false);
      await loadCategories();
    } catch (error) {
      showToast(errorText(error, '保存版块失败'), 'error');
    } finally {
      setSavingCat(false);
    }
  };

  const handleToggleCategoryActive = async (cat: ForumCategory) => {
    const nextActive = cat.is_active === false;
    setActingCatId(cat.id);
    try {
      await updateForumCategory(cat.id, { is_active: nextActive });
      showToast(nextActive ? '已启用版块' : '已停用版块', 'success');
      await loadCategories();
    } catch (error) {
      showToast(errorText(error, '切换版块状态失败'), 'error');
    } finally {
      setActingCatId(null);
    }
  };

  const handleSetDefaultCategory = async (cat: ForumCategory) => {
    setActingCatId(cat.id);
    try {
      await updateForumCategory(cat.id, { is_default: true });
      showToast(`已将「${cat.name}」设为默认发帖版块`, 'success');
      await loadCategories();
    } catch (error) {
      showToast(errorText(error, '设置默认版块失败'), 'error');
    } finally {
      setActingCatId(null);
    }
  };

  const handleDeleteCategory = async (cat: ForumCategory) => {
    const ok = await confirm({
      title: '删除版块',
      message: `确定要删除版块「${cat.name}」吗？若该版块下仍有主题需先清空后再删除。`,
      confirmText: '确认删除',
      danger: true,
    });
    if (!ok) return;

    setActingCatId(cat.id);
    try {
      await deleteForumCategory(cat.id);
      showToast('版块已删除', 'success');
      await loadCategories();
    } catch (error) {
      showToast(errorText(error, '删除版块失败'), 'error');
    } finally {
      setActingCatId(null);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setThreadPage(1);
    setQueryKeyword(searchInput.trim());
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
            社区管理
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            处理社区举报队列、维护主题可见性与置顶加精、管理讨论版块
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void loadCategories();
              void loadReports();
              if (activeTab === 'threads') void loadThreads();
            }}
          >
            <Icons.RefreshCw className="w-3.5 h-3.5" />
            刷新
          </Button>
          {activeTab === 'categories' && (
            <Button size="sm" onClick={openCreateCategory}>
              <Icons.Plus className="w-3.5 h-3.5" />
              新建版块
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200/80 dark:border-slate-800">
        {(
          [
            {
              key: 'reports',
              label: '举报队列',
              count: reports.length,
              highlight: reports.length > 0,
            },
            {
              key: 'threads',
              label: '全站主题',
              count: threadTotal > 0 ? threadTotal : undefined,
            },
            {
              key: 'categories',
              label: '版块管理',
              count: categories.length,
            },
          ] as { key: ForumTab; label: string; count?: number; highlight?: boolean }[]
        ).map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-primary-500 text-slate-900 dark:text-white'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ${
                    tab.highlight
                      ? 'bg-rose-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab 1: 举报队列 */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          {loadingReports ? (
            <ListSkeleton rows={3} />
          ) : reports.length === 0 ? (
            <EmptyState
              icon={<Icons.CheckCircle2 className="w-5 h-5 text-emerald-500" />}
              title="暂无待处理举报"
              description="社区目前运行良好，所有举报都已审结。"
            />
          ) : (
            <div className="space-y-3">
              {reports.map((item) => {
                const key = `${item.target_type}-${item.target_id}`;
                const busy = actingReportKey === key;
                return (
                  <Card key={key} className="p-5">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-2.5">
                        <div className="flex items-center flex-wrap gap-2">
                          <StatusPill tone="red" dot>
                            被举报 {item.report_count} 次
                          </StatusPill>
                          <Badge color={item.target_type === 'thread' ? 'primary' : 'slate'}>
                            {item.target_type === 'thread'
                              ? '主题帖'
                              : `回帖 #${item.floor ?? '?'}`}
                          </Badge>
                          {item.is_hidden && <StatusPill tone="amber">已隐藏</StatusPill>}
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            作者：{item.author_name || '未知用户'}
                          </span>
                        </div>

                        <div>
                          <Link
                            to={`/forum/threads/${item.thread_id}`}
                            className="text-sm font-semibold text-slate-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                          >
                            {item.thread_title}
                          </Link>
                          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 rounded-lg px-3.5 py-2.5 whitespace-pre-wrap break-words">
                            {item.content_preview}
                          </p>
                        </div>

                        {item.reports.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                              举报详情：
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {item.reports.map((rep) => (
                                <div
                                  key={rep.id}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300"
                                >
                                  <Icons.Flag className="w-3 h-3 shrink-0" />
                                  <span className="font-medium">
                                    {REASON_LABELS[rep.reason] || rep.reason}
                                  </span>
                                  {rep.description && (
                                    <span className="text-rose-600/80 dark:text-rose-300/80">
                                      · {rep.description}
                                    </span>
                                  )}
                                  <span className="text-[11px] opacity-65">
                                    ({fmtDateTime(rep.created_at)})
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap lg:flex-col items-stretch lg:items-end gap-2 shrink-0">
                        <Link
                          to={`/forum/threads/${item.thread_id}`}
                          className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Icons.ExternalLink className="w-3.5 h-3.5" />
                          查看原帖
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleDismissReport(item)}
                        >
                          <Icons.Check className="w-3.5 h-3.5" />
                          驳回举报
                        </Button>
                        {!item.is_hidden && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => void handleConfirmReport(item, 'hide')}
                            className="text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/70 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                          >
                            <Icons.EyeOff className="w-3.5 h-3.5" />
                            隐藏内容
                          </Button>
                        )}
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleConfirmReport(item, 'delete')}
                        >
                          <Icons.Trash2 className="w-3.5 h-3.5" />
                          删除内容
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: 全站主题 */}
      {activeTab === 'threads' && (
        <div className="space-y-4">
          <Card className="p-4">
            <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Icons.Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="搜索主题标题关键字..."
                  className="pl-9"
                />
              </div>
              <Select
                value={filterCategoryId}
                onChange={(e) => {
                  setFilterCategoryId(e.target.value);
                  setThreadPage(1);
                }}
              >
                <option value="">全部版块</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={String(cat.id)}>
                    {cat.name}
                  </option>
                ))}
              </Select>
              <Select
                value={filterVisibility}
                onChange={(e) => {
                  setFilterVisibility(e.target.value as 'all' | 'visible' | 'hidden');
                  setThreadPage(1);
                }}
              >
                <option value="all">全部可见度</option>
                <option value="visible">仅公开可见</option>
                <option value="hidden">仅已隐藏</option>
              </Select>
              <Select
                value={filterReported}
                onChange={(e) => {
                  setFilterReported(e.target.value as 'all' | 'reported');
                  setThreadPage(1);
                }}
              >
                <option value="all">全部举报状态</option>
                <option value="reported">仅被举报主题</option>
              </Select>
              <Button type="submit" variant="secondary">
                搜索
              </Button>
            </form>
          </Card>

          <Card className="overflow-hidden">
            {loadingThreads ? (
              <div className="p-5">
                <ListSkeleton rows={5} />
              </div>
            ) : threads.length === 0 ? (
              <EmptyState
                icon={<Icons.MessagesSquare className="w-5 h-5" />}
                title="没有匹配的社区主题"
                description="尝试调整筛选条件或清空关键词。"
                className="border-0 rounded-none"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px]">
                  <thead>
                    <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
                      <th className={TH}>主题</th>
                      <th className={TH}>作者</th>
                      <th className={TH}>互动</th>
                      <th className={TH}>状态</th>
                      <th className={TH}>发布时间</th>
                      <th className={`${TH} text-right`}>操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                    {threads.map((t) => {
                      const busy = actingThreadId === t.id;
                      const authorName = t.author_display_name || t.author_nickname || '匿名';
                      return (
                        <tr
                          key={t.id}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className={`${TD} max-w-[360px]`}>
                            <div className="space-y-1">
                              <Link
                                to={`/forum/threads/${t.id}`}
                                className="font-medium text-slate-900 dark:text-slate-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors line-clamp-1"
                                title={t.title}
                              >
                                {t.title}
                              </Link>
                              <div className="flex items-center flex-wrap gap-1.5">
                                {t.category_name && (
                                  <Badge color="slate">{t.category_name}</Badge>
                                )}
                                {t.is_pinned && <Badge color="primary">置顶</Badge>}
                                {t.is_featured && <Badge color="amber">精选</Badge>}
                                {t.is_solved && <Badge color="emerald">已解决</Badge>}
                                {t.is_locked && <Badge color="slate">已锁定</Badge>}
                              </div>
                            </div>
                          </td>
                          <td className={TD}>
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar
                                name={authorName}
                                avatarUrl={t.author_avatar || undefined}
                                className="w-7 h-7 text-xs"
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                                  {authorName}
                                </div>
                                {t.username && (
                                  <div className="text-[11px] text-slate-400 truncate">
                                    @{t.username}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className={`${TD} text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap`}>
                            {t.reply_count} 回复 · {t.view_count} 浏览 · {t.like_count ?? 0} 赞
                          </td>
                          <td className={TD}>
                            {t.is_hidden ? (
                              <StatusPill tone="amber" dot>
                                已隐藏
                              </StatusPill>
                            ) : (
                              <StatusPill tone="emerald" dot>
                                正常显示
                              </StatusPill>
                            )}
                          </td>
                          <td className={`${TD} text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums`}>
                            {fmtDateTime(t.created_at)}
                          </td>
                          <td className={`${TD} text-right`}>
                            <div className="inline-flex items-center justify-end gap-1">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleThreadToggleField(t, 'is_pinned')}
                                title={t.is_pinned ? '取消置顶' : '置顶'}
                                className={`p-1.5 rounded-md border text-xs transition-colors ${
                                  t.is_pinned
                                    ? 'bg-primary-50 dark:bg-primary-950/60 border-primary-200 dark:border-primary-800 text-primary-600 dark:text-primary-400'
                                    : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                              >
                                <Icons.Pin className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleThreadToggleField(t, 'is_featured')}
                                title={t.is_featured ? '取消精选' : '设为精选'}
                                className={`p-1.5 rounded-md border text-xs transition-colors ${
                                  t.is_featured
                                    ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400'
                                    : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                              >
                                <Icons.Star className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleThreadToggleField(t, 'is_locked')}
                                title={t.is_locked ? '解除锁定' : '锁定禁止回复'}
                                className={`p-1.5 rounded-md border text-xs transition-colors ${
                                  t.is_locked
                                    ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                                    : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                              >
                                {t.is_locked ? (
                                  <Icons.Lock className="w-3.5 h-3.5" />
                                ) : (
                                  <Icons.Unlock className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleThreadToggleHidden(t)}
                                title={t.is_hidden ? '恢复显示' : '隐藏该主题'}
                                className={`p-1.5 rounded-md border text-xs transition-colors ${
                                  t.is_hidden
                                    ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400'
                                    : 'border-transparent text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                              >
                                {t.is_hidden ? (
                                  <Icons.Eye className="w-3.5 h-3.5" />
                                ) : (
                                  <Icons.EyeOff className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleDeleteThread(t)}
                                title="删除主题"
                                className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                              >
                                <Icons.Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!loadingThreads && threadTotalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200/80 dark:border-slate-800">
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  共 {threadTotal} 个主题 · 第 {threadPage} / {threadTotalPages} 页
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={threadPage <= 1}
                    onClick={() => setThreadPage((p) => Math.max(1, p - 1))}
                  >
                    上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={threadPage >= threadTotalPages}
                    onClick={() => setThreadPage((p) => Math.min(threadTotalPages, p + 1))}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Tab 3: 版块管理 */}
      {activeTab === 'categories' && (
        <Card className="overflow-hidden">
          {loadingCategories ? (
            <div className="p-5">
              <ListSkeleton rows={4} />
            </div>
          ) : categories.length === 0 ? (
            <EmptyState
              icon={<Icons.Folder className="w-5 h-5" />}
              title="还没有社区版块"
              description="点击右上角「新建版块」添加第一个讨论区。"
              action={
                <Button size="sm" onClick={openCreateCategory}>
                  <Icons.Plus className="w-3.5 h-3.5" />
                  新建版块
                </Button>
              }
              className="border-0 rounded-none"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px]">
                <thead>
                  <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
                    <th className={TH}>排序</th>
                    <th className={TH}>版块名称</th>
                    <th className={TH}>简介</th>
                    <th className={TH}>主题数</th>
                    <th className={TH}>状态</th>
                    <th className={`${TH} text-right`}>操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                  {categories.map((cat) => {
                    const active = cat.is_active !== false;
                    const busy = actingCatId === cat.id;
                    return (
                      <tr
                        key={cat.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className={`${TD} font-mono text-xs text-slate-500 tabular-nums`}>
                          {cat.sort_order ?? 0}
                        </td>
                        <td className={TD}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {cat.name}
                            </span>
                            {cat.slug && (
                              <span className="text-[11px] font-mono text-slate-400">
                                #{cat.slug}
                              </span>
                            )}
                            {cat.is_default && <Badge color="primary">默认发帖区</Badge>}
                          </div>
                        </td>
                        <td className={`${TD} text-xs text-slate-500 dark:text-slate-400 max-w-xs`}>
                          <p className="line-clamp-2">{cat.description || '—'}</p>
                        </td>
                        <td className={`${TD} text-xs font-medium text-slate-700 dark:text-slate-300 tabular-nums`}>
                          {cat.thread_count ?? 0}
                        </td>
                        <td className={TD}>
                          {active ? (
                            <StatusPill tone="emerald" dot>
                              启用
                            </StatusPill>
                          ) : (
                            <StatusPill tone="slate" dot>
                              已停用
                            </StatusPill>
                          )}
                        </td>
                        <td className={`${TD} text-right`}>
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {!cat.is_default && active && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() => void handleSetDefaultCategory(cat)}
                              >
                                设为默认
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => openEditCategory(cat)}
                            >
                              编辑
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => void handleToggleCategoryActive(cat)}
                            >
                              {active ? '停用' : '启用'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => void handleDeleteCategory(cat)}
                              className="text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                            >
                              删除
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* 版块新增/编辑弹窗 */}
      {catModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4"
          onClick={() => !savingCat && setCatModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={catForm.id === null ? '新建版块' : '编辑版块'}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {catForm.id === null ? '新建社区版块' : '编辑社区版块'}
              </h3>
              <button
                type="button"
                onClick={() => setCatModalOpen(false)}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="关闭弹窗"
              >
                <Icons.X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  版块名称 *
                </label>
                <Input
                  value={catForm.name}
                  onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="例如：技术讨论"
                  maxLength={50}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    标识 Slug
                  </label>
                  <Input
                    value={catForm.slug}
                    onChange={(e) => setCatForm((f) => ({ ...f, slug: e.target.value }))}
                    placeholder="tech-talk"
                    maxLength={50}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    排序权重
                  </label>
                  <Input
                    type="number"
                    value={catForm.sort_order}
                    onChange={(e) =>
                      setCatForm((f) => ({
                        ...f,
                        sort_order: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  主题色标
                </label>
                <Select
                  value={catForm.color}
                  onChange={(e) => setCatForm((f) => ({ ...f, color: e.target.value }))}
                  className="w-full"
                >
                  {COLOR_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  版块描述
                </label>
                <Textarea
                  value={catForm.description}
                  onChange={(e) => setCatForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  maxLength={200}
                  placeholder="简短介绍该版块适合发布什么话题..."
                />
              </div>

              <div className="flex flex-wrap items-center gap-5 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={catForm.is_default}
                    onChange={(e) =>
                      setCatForm((f) => ({ ...f, is_default: e.target.checked }))
                    }
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span>设为默认发帖版块</span>
                </label>
                {catForm.id !== null && (
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={catForm.is_active}
                      onChange={(e) =>
                        setCatForm((f) => ({ ...f, is_active: e.target.checked }))
                      }
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span>启用该版块</span>
                  </label>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingCat}
                  onClick={() => setCatModalOpen(false)}
                >
                  取消
                </Button>
                <Button type="submit" disabled={savingCat}>
                  {savingCat ? '保存中...' : '保存'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDialog}
    </div>
  );
};

export default ForumManager;
