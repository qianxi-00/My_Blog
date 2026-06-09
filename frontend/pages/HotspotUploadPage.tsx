import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MDEditor from '@uiw/react-md-editor';
import remarkGfm from 'remark-gfm';
import { Button } from '../components/Shared';
import { Icons } from '../components/Icons';
import { createHotspot, HotspotCreatePayload } from '../api/hotspots';

const nowLocalInput = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const HotspotUploadPage: React.FC = () => {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [summary, setSummary] = useState('');
  const [analysisMd, setAnalysisMd] = useState('');
  const [topicDate, setTopicDate] = useState(new Date().toISOString().slice(0, 10));
  const [primaryCategory, setPrimaryCategory] = useState('AI基础设施');
  const [heatScore, setHeatScore] = useState('95');
  const [status, setStatus] = useState<'draft' | 'published' | 'hidden'>('draft');
  const [autoPublish, setAutoPublish] = useState(false);
  const [publishedAt, setPublishedAt] = useState(nowLocalInput());
  const [upsertStrategy, setUpsertStrategy] = useState<'error' | 'update'>('error');
  const [tagsInput, setTagsInput] = useState('AI, 热点');
  const [sourcesJson, setSourcesJson] = useState(JSON.stringify([
    {
      source_type: 'manual',
      source_name: 'manual',
      source_url: 'https://example.com',
      source_domain: 'example.com',
      original_title: '',
      content_snippet: '',
      quality_score: 90,
    },
  ], null, 2));
  const [keyPointsJson, setKeyPointsJson] = useState(JSON.stringify({
    queue_slot: 'manual',
    generated_at: new Date().toISOString(),
    word_count_estimate: 0,
    has_image: false,
    has_table: false,
    publish_pending: true,
    pipeline_state: 'draft_ready',
  }, null, 2));

  const tags = useMemo(() => tagsInput.split(/[，,]/).map((item) => item.trim()).filter(Boolean), [tagsInput]);

  const handleSubmit = async () => {
    if (!title.trim() || !slug.trim() || !analysisMd.trim()) {
      alert('请至少填写标题、slug 和正文 Markdown');
      return;
    }

    let parsedSources: HotspotCreatePayload['sources'] = [];
    let parsedKeyPoints: Record<string, unknown> | undefined = undefined;

    try {
      parsedSources = JSON.parse(sourcesJson || '[]');
    } catch {
      alert('来源 JSON 格式不合法');
      return;
    }

    try {
      parsedKeyPoints = keyPointsJson.trim() ? JSON.parse(keyPointsJson) : undefined;
    } catch {
      alert('key_points_json 格式不合法');
      return;
    }

    const payload: HotspotCreatePayload = {
      topic_date: topicDate,
      title: title.trim(),
      slug: slug.trim(),
      summary: summary.trim() || undefined,
      analysis_md: analysisMd,
      key_points_json: parsedKeyPoints,
      heat_score: Number(heatScore) || 0,
      primary_category: primaryCategory.trim() || undefined,
      tag_names: tags,
      sources: parsedSources,
      status,
      published_at: publishedAt ? new Date(publishedAt).toISOString() : undefined,
      auto_publish: autoPublish,
      upsert_strategy: upsertStrategy,
    };

    setSubmitting(true);
    try {
      const created = await createHotspot(payload);
      alert(created.status === 'published' ? '热点已创建并发布' : '热点草稿已创建');
      navigate(`/admin/hotspots/${created.id}/edit`);
    } catch (error: any) {
      alert(error?.response?.data?.detail || '创建热点失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">上传热点文章</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">直接创建热点草稿或正式发布，发布对象仅进入 hot_topics，不会进入普通文章表。</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Button variant="outline" onClick={() => navigate('/admin/hotspots')}>返回热点管理</Button>
          <Button onClick={handleSubmit} disabled={submitting}>{submitting ? '提交中...' : '提交热点'}</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3 space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="热点标题"
              className="w-full text-2xl font-bold bg-transparent border-none text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-0"
            />
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="唯一 slug，例如 bizgeneval-commercial-visual-generation-benchmark"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 text-sm"
            />
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              placeholder="热点摘要"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 text-sm resize-none"
            />
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden" data-color-mode="light">
            <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40">
              <span className="text-sm text-slate-600 dark:text-slate-300 font-medium">热点正文 Markdown</span>
              <div className="text-xs text-slate-400">支持实时预览</div>
            </div>
            <MDEditor value={analysisMd} onChange={(val) => setAnalysisMd(val || '')} height={560} preview="live" previewOptions={{ remarkPlugins: [remarkGfm] }} />
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-700 pb-2">发布参数</h3>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">主题日期</label>
              <input type="date" value={topicDate} onChange={(e) => setTopicDate(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">主分类</label>
              <input type="text" value={primaryCategory} onChange={(e) => setPrimaryCategory(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">标签</label>
              <input type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="多个标签用逗号分隔" className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">热度</label>
                <input type="number" value={heatScore} onChange={(e) => setHeatScore(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">状态</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as 'draft' | 'published' | 'hidden')} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm">
                  <option value="draft">草稿</option>
                  <option value="published">已发布</option>
                  <option value="hidden">已隐藏</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={autoPublish} onChange={(e) => setAutoPublish(e.target.checked)} />
              自动发布（提交后直接 published）
            </label>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">发布时间</label>
              <input type="datetime-local" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">幂等策略</label>
              <select value={upsertStrategy} onChange={(e) => setUpsertStrategy(e.target.value as 'error' | 'update')} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm">
                <option value="error">slug 冲突时报错</option>
                <option value="update">slug 冲突时更新</option>
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-700 pb-2">来源 JSON</h3>
            <textarea value={sourcesJson} onChange={(e) => setSourcesJson(e.target.value)} rows={10} className="w-full font-mono text-xs px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 resize-none" />
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-700 pb-2">key_points_json</h3>
            <textarea value={keyPointsJson} onChange={(e) => setKeyPointsJson(e.target.value)} rows={10} className="w-full font-mono text-xs px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 resize-none" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default HotspotUploadPage;
