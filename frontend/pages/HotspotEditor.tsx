import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MDEditor from '@uiw/react-md-editor';
import remarkGfm from 'remark-gfm';
import { Button } from '../components/Shared';
import { Icons } from '../components/Icons';
import { getHotspotDetail, hideHotspot, HotTopicDetail, publishHotspot, updateHotspot } from '../api/hotspots';

const STATUS_OPTIONS: Array<{ label: string; value: 'draft' | 'published' | 'hidden' }> = [
  { label: '草稿', value: 'draft' },
  { label: '已发布', value: 'published' },
  { label: '已隐藏', value: 'hidden' },
];

const STATUS_LABELS = {
  draft: '草稿',
  published: '已发布',
  hidden: '已隐藏',
} as const;

const STATUS_STYLES = {
  draft: 'bg-amber-50 text-amber-600 border-amber-200',
  published: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  hidden: 'bg-slate-100 text-slate-600 border-slate-200',
} as const;

const HotspotEditor: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
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
        alert('热点 ID 无效');
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
        alert('加载热点详情失败');
        navigate('/admin/hotspots');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [hotspotId, navigate]);

  const handleAnalysisChange = useCallback((val?: string) => {
    setAnalysisMd(val || '');
  }, []);

  const tags = useMemo(() => tagsInput
    .split(/[，,]/)
    .map((tag) => tag.trim())
    .filter(Boolean), [tagsInput]);

  const sourceText = useMemo(() => {
    if (!detail) return '-';
    if (detail.source_types?.length) return detail.source_types.join(' / ');
    return detail.source_type || '-';
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
      alert('请填写热点标题');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateHotspot(hotspotId, getPayload(nextStatus));
      syncDetail(updated);
      alert(nextStatus === 'published' ? '热点已保存并发布' : nextStatus === 'hidden' ? '热点已保存并隐藏' : '热点已保存');
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      alert(typeof detail === 'string' ? detail : '保存失败');
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
      alert('热点已发布');
    } catch (error: any) {
      alert(error?.response?.data?.detail || '发布失败');
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
      alert('热点已隐藏');
    } catch (error: any) {
      alert(error?.response?.data?.detail || '隐藏失败');
    } finally {
      setHiding(false);
    }
  };

  const formatDate = (value?: string) => value ? new Date(value).toLocaleString('zh-CN') : '-';

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-slate-400">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">编辑热点</h1>
            <span className={`px-2.5 py-1 text-xs rounded-full border ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">ID #{detail?.id} · 创建时间 {formatDate(detail?.created_at)} · 更新时间 {formatDate(detail?.updated_at)}</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Button variant="outline" onClick={() => navigate('/admin/hotspots')}>返回列表</Button>
          <Button variant="secondary" onClick={() => handleSave()} disabled={saving || publishing || hiding}>
            {saving ? '保存中...' : '保存修改'}
          </Button>
          <Button onClick={handlePublish} disabled={saving || publishing || hiding}>
            {publishing ? '发布中...' : '发布'}
          </Button>
          <Button variant="outline" onClick={handleHide} disabled={saving || publishing || hiding}>
            {hiding ? '隐藏中...' : '隐藏'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="热点标题"
              className="w-full text-2xl font-bold bg-transparent border-none text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-0"
            />
            <div className="flex flex-wrap gap-2">
              {tags.length > 0 ? tags.map((tag) => (
                <span key={tag} className="px-2 py-1 rounded-md text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">#{tag}</span>
              )) : <span className="text-xs text-slate-400">暂无标签</span>}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden" data-color-mode="light">
            <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40">
              <span className="text-sm text-slate-600 dark:text-slate-300 font-medium">热点分析 Markdown</span>
              <div className="text-xs text-slate-400">支持实时预览</div>
            </div>
            <MDEditor
              value={analysisMd}
              onChange={handleAnalysisChange}
              height={560}
              preview="live"
              previewOptions={{ remarkPlugins: [remarkGfm] }}
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-700 pb-2">基础信息</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
                <div className="text-xs text-slate-400">热度分数</div>
                <div className="mt-1 text-xl font-semibold text-slate-800 dark:text-slate-100">{heatScore || '0'}</div>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
                <div className="text-xs text-slate-400">来源数</div>
                <div className="mt-1 text-xl font-semibold text-slate-800 dark:text-slate-100">{detail?.source_count ?? 0}</div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">摘要</label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={4}
                placeholder="热点摘要"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 text-sm resize-none focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">状态</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'draft' | 'published' | 'hidden')}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">标签</label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="多个标签用逗号分隔"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">热度分数</label>
              <input
                type="number"
                value={heatScore}
                onChange={(e) => setHeatScore(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">主分类</label>
              <input
                type="text"
                value={primaryCategory}
                onChange={(e) => setPrimaryCategory(e.target.value)}
                placeholder="如：模型 / 产品 / 投融资"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-700 pb-2">附加信息</h3>
            <div className="text-sm text-slate-500 dark:text-slate-400 space-y-2">
              <div className="flex items-center gap-2"><Icons.Calendar className="w-4 h-4" /> 主题日期：{detail?.topic_date || '-'}</div>
              <div>Slug：{detail?.slug || '-'}</div>
              <div>来源类型：{sourceText}</div>
              <div>关联文章：{detail?.article_id || '-'}</div>
              <div>当前状态：{STATUS_LABELS[status]}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HotspotEditor;
