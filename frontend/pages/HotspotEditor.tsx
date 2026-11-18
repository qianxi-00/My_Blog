import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MDEditor from '@uiw/react-md-editor';
import remarkGfm from 'remark-gfm';
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  StatusPill,
  Textarea,
} from '../components/Shared';
import { DetailSkeleton } from '../components/Skeleton';
import { Icons } from '../components/Icons';
import {
  getHotspotDetail,
  hideHotspot,
  HotTopicDetail,
  publishHotspot,
  updateHotspot,
} from '../api/hotspots';
import { errorText } from '../utils/errors';
import { useToast } from '../components/Toast';
import { useTheme } from '../contexts/ThemeContext';

const STATUS_OPTIONS: Array<{ label: string; value: 'draft' | 'published' | 'hidden' }> = [
  { label: '草稿', value: 'draft' },
  { label: '已发布', value: 'published' },
  { label: '已隐藏', value: 'hidden' },
];

const STATUS_META: Record<
  'draft' | 'published' | 'hidden',
  { label: string; tone: 'amber' | 'emerald' | 'slate' }
> = {
  draft: { label: '草稿', tone: 'amber' },
  published: { label: '已发布', tone: 'emerald' },
  hidden: { label: '已隐藏', tone: 'slate' },
};

const HotspotEditor: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { theme } = useTheme();
  const hotspotId = Number(id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [detail, setDetail] = useState<HotTopicDetail | null>(null);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [analysisMd, setAnalysisMd] = useState('');
  const [status, setStatus] = useState<'draft' | 'published' | 'hidden'>('draft');
  const [tagsInput, setTagsInput] = useState('');
  const [heatScore, setHeatScore] = useState('0');
  const [primaryCategory, setPrimaryCategory] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      if (!hotspotId || Number.isNaN(hotspotId)) {
        showToast('热点 ID 无效', 'error');
        navigate('/admin/hotspots');
        return;
      }

      setLoading(true);
      try {
        const res = await getHotspotDetail(hotspotId);
        setDetail(res);
        setTitle(res.title || '');
        setSummary(res.summary || '');
        setAnalysisMd(res.analysis_md || '');
        setStatus(res.status || 'draft');
        setTagsInput((res.tags || []).join(', '));
        setHeatScore(String(res.heat_score ?? 0));
        setPrimaryCategory(res.primary_category || '');
      } catch (error) {
        console.error('加载热点详情失败:', error);
        showToast(errorText(error, '加载热点详情失败'), 'error');
        navigate('/admin/hotspots');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [hotspotId, navigate, showToast]);

  const handleAnalysisChange = useCallback((val?: string) => {
    setAnalysisMd(val || '');
  }, []);

  const tags = useMemo(
    () =>
      tagsInput
        .split(/[，,]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    [tagsInput]
  );

  const sourceText = useMemo(() => {
    if (!detail) return '—';
    if (detail.source_types?.length) return detail.source_types.join(' / ');
    return detail.source_type || '—';
  }, [detail]);

  const getPayload = (nextStatus?: 'draft' | 'published' | 'hidden') => ({
    title: title.trim(),
    summary: summary.trim() || undefined,
    analysis_md: analysisMd,
    status: nextStatus || status,
    tags,
    heat_score: Number(heatScore) || 0,
    primary_category: primaryCategory.trim() || undefined,
  });

  const syncDetail = (updated: HotTopicDetail) => {
    setDetail(updated);
    setStatus(updated.status);
    setTagsInput((updated.tags || []).join(', '));
    setSummary(updated.summary || '');
    setAnalysisMd(updated.analysis_md || '');
    setHeatScore(String(updated.heat_score ?? 0));
    setPrimaryCategory(updated.primary_category || '');
    setTitle(updated.title || '');
  };

  const handleSave = async (nextStatus?: 'draft' | 'published' | 'hidden') => {
    if (!title.trim()) {
      showToast('请填写热点标题', 'error');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateHotspot(hotspotId, getPayload(nextStatus));
      syncDetail(updated);
      showToast(
        nextStatus === 'published'
          ? '热点已保存并发布'
          : nextStatus === 'hidden'
          ? '热点已保存并隐藏'
          : '热点已保存',
        'success'
      );
    } catch (error: any) {
      showToast(errorText(error, '保存失败'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      await updateHotspot(hotspotId, getPayload());
      const updated = await publishHotspot(hotspotId);
      syncDetail(updated);
      showToast('热点已发布', 'success');
    } catch (error: any) {
      showToast(errorText(error, '发布失败'), 'error');
    } finally {
      setPublishing(false);
    }
  };

  const handleHide = async () => {
    setHiding(true);
    try {
      await updateHotspot(hotspotId, getPayload());
      const updated = await hideHotspot(hotspotId);
      syncDetail(updated);
      showToast('热点已隐藏', 'success');
    } catch (error: any) {
      showToast(errorText(error, '隐藏失败'), 'error');
    } finally {
      setHiding(false);
    }
  };

  const formatDate = (value?: string) => (value ? new Date(value).toLocaleString('zh-CN') : '—');

  if (loading) {
    return <DetailSkeleton />;
  }

  const currentStatusMeta = STATUS_META[status];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
              编辑热点
            </h1>
            <StatusPill tone={currentStatusMeta.tone} dot>
              {currentStatusMeta.label}
            </StatusPill>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            ID #{detail?.id} · 创建 {formatDate(detail?.created_at)} · 更新{' '}
            {formatDate(detail?.updated_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate('/admin/hotspots')}>
            返回列表
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleSave()}
            disabled={saving || publishing || hiding}
          >
            {saving ? '保存中...' : '保存修改'}
          </Button>
          <Button
            size="sm"
            onClick={handlePublish}
            disabled={saving || publishing || hiding}
          >
            {publishing ? '发布中...' : '发布'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleHide}
            disabled={saving || publishing || hiding}
          >
            {hiding ? '隐藏中...' : '隐藏'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <Card className="p-5 space-y-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="热点标题"
              className="w-full text-xl sm:text-2xl font-semibold bg-transparent border-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-0"
            />
            <div className="flex flex-wrap gap-1.5">
              {tags.length > 0 ? (
                tags.map((tag) => (
                  <Badge key={tag} color="slate">
                    #{tag}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-slate-400 dark:text-slate-500">暂无标签</span>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div data-color-mode={theme === 'dark' ? 'dark' : 'light'}>
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
                <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                  热点分析 Markdown
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">支持实时预览</span>
              </div>
              <MDEditor
                value={analysisMd}
                onChange={handleAnalysisChange}
                height={560}
                preview="live"
                previewOptions={{ remarkPlugins: [remarkGfm] }}
              />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200/70 dark:border-slate-800 pb-2.5">
              基础信息
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 p-3">
                <div className="text-[11px] text-slate-400 dark:text-slate-500">热度分数</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
                  {heatScore || '0'}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 p-3">
                <div className="text-[11px] text-slate-400 dark:text-slate-500">来源数</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
                  {detail?.source_count ?? 0}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                摘要
              </label>
              <Textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={4}
                placeholder="热点摘要"
                className="resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                状态
              </label>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'draft' | 'published' | 'hidden')}
                className="w-full"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                标签
              </label>
              <Input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="多个标签用逗号分隔"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                热度分数
              </label>
              <Input
                type="number"
                value={heatScore}
                onChange={(e) => setHeatScore(e.target.value)}
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                主分类
              </label>
              <Input
                type="text"
                value={primaryCategory}
                onChange={(e) => setPrimaryCategory(e.target.value)}
                placeholder="如：AI模型 / AI产品 / AI基础设施"
              />
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200/70 dark:border-slate-800 pb-2.5">
              附加信息
            </h3>
            <div className="text-xs text-slate-500 dark:text-slate-400 space-y-2 break-all">
              <div className="flex items-center gap-1.5">
                <Icons.Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>主题日期：{detail?.topic_date || '—'}</span>
              </div>
              <div>Slug：{detail?.slug || '—'}</div>
              <div>来源类型：{sourceText}</div>
              <div>关联文章：{detail?.article_id || '—'}</div>
              <div>当前状态：{currentStatusMeta.label}</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default HotspotEditor;
