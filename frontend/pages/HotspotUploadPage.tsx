import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MDEditor from '@uiw/react-md-editor';
import remarkGfm from 'remark-gfm';
import { Button, Card, Input, Select, Textarea } from '../components/Shared';
import { Icons } from '../components/Icons';
import { createHotspot, HotspotCreatePayload } from '../api/hotspots';
import { errorText } from '../utils/errors';
import { useToast } from '../components/Toast';
import { useTheme } from '../contexts/ThemeContext';

const nowLocalInput = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const HotspotUploadPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { theme } = useTheme();
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
  const [sourcesJson, setSourcesJson] = useState(
    JSON.stringify(
      [
        {
          source_type: 'manual',
          source_name: 'manual',
          source_url: 'https://example.com',
          source_domain: 'example.com',
          original_title: '',
          content_snippet: '',
          quality_score: 90,
        },
      ],
      null,
      2
    )
  );
  const [keyPointsJson, setKeyPointsJson] = useState(
    JSON.stringify(
      {
        queue_slot: 'manual',
        generated_at: new Date().toISOString(),
        word_count_estimate: 0,
        has_image: false,
        has_table: false,
        publish_pending: true,
        pipeline_state: 'draft_ready',
      },
      null,
      2
    )
  );

  const tags = useMemo(
    () =>
      tagsInput
        .split(/[，,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    [tagsInput]
  );

  const handleSubmit = async () => {
    if (!title.trim() || !slug.trim() || !analysisMd.trim()) {
      showToast('请至少填写标题、slug 和正文 Markdown', 'error');
      return;
    }

    let parsedSources: HotspotCreatePayload['sources'] = [];
    let parsedKeyPoints: Record<string, unknown> | undefined = undefined;

    try {
      parsedSources = JSON.parse(sourcesJson || '[]');
    } catch {
      showToast('来源 JSON 格式不合法', 'error');
      return;
    }

    try {
      parsedKeyPoints = keyPointsJson.trim() ? JSON.parse(keyPointsJson) : undefined;
    } catch {
      showToast('key_points_json 格式不合法', 'error');
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
      showToast(
        created.status === 'published' ? '热点已创建并发布' : '热点草稿已创建',
        'success'
      );
      navigate(`/admin/hotspots/${created.id}/edit`);
    } catch (error: any) {
      showToast(errorText(error, '创建热点失败'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
            上传热点文章
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            直接创建热点草稿或正式发布，发布对象仅进入 hot_topics，不影响普通文章表
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => navigate('/admin/hotspots')}>
            返回热点管理
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting}>
            <Icons.Upload className="w-3.5 h-3.5" />
            {submitting ? '提交中...' : '提交热点'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3 space-y-6">
          <Card className="p-5 space-y-3.5">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="热点标题"
              className="w-full text-xl sm:text-2xl font-semibold bg-transparent border-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-0"
            />
            <Input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="唯一 slug，例如 bizgeneval-commercial-visual-generation-benchmark"
              className="font-mono text-xs"
            />
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              placeholder="热点摘要"
              className="resize-none"
            />
          </Card>

          <Card className="overflow-hidden">
            <div data-color-mode={theme === 'dark' ? 'dark' : 'light'}>
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
                <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                  热点正文 Markdown
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">支持实时预览</span>
              </div>
              <MDEditor
                value={analysisMd}
                onChange={(val) => setAnalysisMd(val || '')}
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
              发布参数
            </h3>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                主题日期
              </label>
              <Input
                type="date"
                value={topicDate}
                onChange={(e) => setTopicDate(e.target.value)}
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
              />
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  热度
                </label>
                <Input
                  type="number"
                  value={heatScore}
                  onChange={(e) => setHeatScore(e.target.value)}
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
                  <option value="draft">草稿</option>
                  <option value="published">已发布</option>
                  <option value="hidden">已隐藏</option>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoPublish}
                onChange={(e) => setAutoPublish(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-700 text-primary-600 focus:ring-primary-500 h-4 w-4"
              />
              自动发布（提交后直接 published）
            </label>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                发布时间
              </label>
              <Input
                type="datetime-local"
                value={publishedAt}
                onChange={(e) => setPublishedAt(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                幂等策略
              </label>
              <Select
                value={upsertStrategy}
                onChange={(e) => setUpsertStrategy(e.target.value as 'error' | 'update')}
                className="w-full"
              >
                <option value="error">slug 冲突时报错</option>
                <option value="update">slug 冲突时更新</option>
              </Select>
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200/70 dark:border-slate-800 pb-2">
              来源 JSON
            </h3>
            <Textarea
              value={sourcesJson}
              onChange={(e) => setSourcesJson(e.target.value)}
              rows={9}
              className="font-mono text-xs resize-none"
            />
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200/70 dark:border-slate-800 pb-2">
              key_points_json
            </h3>
            <Textarea
              value={keyPointsJson}
              onChange={(e) => setKeyPointsJson(e.target.value)}
              rows={9}
              className="font-mono text-xs resize-none"
            />
          </Card>
        </div>
      </div>
    </div>
  );
};

export default HotspotUploadPage;
