import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import MarkdownContent from '../components/MarkdownContent';
import { extractHeadingsFromMarkdown } from '../components/MarkdownRenderer';
import HotspotFloatingToolbar from '../components/HotspotFloatingToolbar';
import HotspotComments from '../components/HotspotComments';
import {
  getAdjacentPublishedHotspots,
  getHotspotDetail,
  getHotspotSources,
  HotTopicDetail,
  HotTopicListItem,
  HotTopicSource,
} from '../api/hotspots';

const formatDateTime = (value?: string) => {
  if (!value) return '暂无';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN');
};

const formatNumber = (value?: number) => Number(value || 0).toLocaleString('zh-CN');

const stripFrontmatter = (markdown?: string) => {
  if (!markdown) return '';
  return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim();
};

const HotspotDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [hotspot, setHotspot] = useState<HotTopicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sources, setSources] = useState<HotTopicSource[]>([]);
  const [copied, setCopied] = useState(false);
  const [activeHeading, setActiveHeading] = useState('');
  const [previousItem, setPreviousItem] = useState<HotTopicListItem | null>(null);
  const [nextItem, setNextItem] = useState<HotTopicListItem | null>(null);

  useEffect(() => {
    const fetchDetail = async () => {
      if (!id || Number.isNaN(Number(id))) {
        setError('无效的热点 ID');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const topicId = Number(id);
        const data = await getHotspotDetail(topicId);

        if (data.status !== 'published') {
          setHotspot(null);
          setError('该热点暂未公开');
          return;
        }

        setHotspot(data);

        const [sourceItems, adjacent] = await Promise.all([
          getHotspotSources(topicId).catch(() => []),
          getAdjacentPublishedHotspots(topicId).catch(() => ({ newer: null, older: null, orderedItems: [] })),
        ]);

        setSources(sourceItems || []);
        setPreviousItem(adjacent.newer || null);
        setNextItem(adjacent.older || null);
      } catch (fetchError) {
        console.error('获取热点详情失败:', fetchError);
        setError('热点详情加载失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
    window.scrollTo(0, 0);
  }, [id]);

  const articleMarkdown = useMemo(() => stripFrontmatter(hotspot?.analysis_md), [hotspot?.analysis_md]);

  const headingItems = useMemo(() => {
    const allHeadings = extractHeadingsFromMarkdown(articleMarkdown);
    return allHeadings.filter((item) => item.level >= 2 && item.level <= 4);
  }, [articleMarkdown]);

  useEffect(() => {
    if (headingItems.length === 0) {
      setActiveHeading('');
      return;
    }

    const handleScroll = () => {
      const candidates = headingItems
        .map((item) => ({ item, element: document.getElementById(item.id) }))
        .filter((entry) => entry.element);

      if (candidates.length === 0) return;

      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 180) {
        setActiveHeading(candidates[candidates.length - 1].item.id);
        return;
      }

      let currentId = candidates[0].item.id;
      for (const { item, element } of candidates) {
        if (element && element.getBoundingClientRect().top < 150) {
          currentId = item.id;
        }
      }
      setActiveHeading(currentId);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [headingItems]);

  const sourceTypes = useMemo(() => {
    if (!hotspot) return [] as string[];

    return Array.from(new Set([
      ...(hotspot.source_types || []),
      ...(hotspot.source_type ? [hotspot.source_type] : []),
      ...(sources.map((item) => item.source_type).filter(Boolean) as string[]),
    ])).filter((value) => value.toLowerCase() !== 'manual');
  }, [hotspot, sources]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (copyError) {
      console.error('复制链接失败', copyError);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm p-10 text-center text-slate-500 dark:text-slate-400">
          正在加载热点详情...
        </div>
      </div>
    );
  }

  if (error || !hotspot) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm p-10 text-center">
          <div className="text-lg font-bold text-slate-900 dark:text-white mb-2">{error || '未找到热点详情'}</div>
          <p className="text-slate-500 dark:text-slate-400 mb-6">请返回热点列表重新选择内容。</p>
          <Link
            to="/hotspots"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 dark:bg-primary-600 text-white text-sm font-bold hover:bg-slate-800 dark:hover:bg-primary-500 transition-colors"
          >
            <Icons.ArrowLeft className="w-4 h-4" />
            返回热点列表
          </Link>
        </div>
      </div>
    );
  }

  const auxiliaryPanel = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-900/70 p-5 shadow-sm">
        <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">内容信息</div>
        <div className="space-y-3 text-sm">
          <div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">标签</div>
            <div className="flex flex-wrap gap-2">
              {(hotspot.tags || []).length > 0 ? (
                hotspot.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                  >
                    #{tag}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500 dark:text-slate-400">暂无标签</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-3">
              <div className="text-[11px] text-slate-400 dark:text-slate-500 mb-1">状态</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">已发布</div>
            </div>
            <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-3">
              <div className="text-[11px] text-slate-400 dark:text-slate-500 mb-1">更新时间</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">{formatDateTime(hotspot.updated_at || hotspot.published_at)}</div>
            </div>
          </div>
        </div>
      </div>

      {headingItems.length > 1 && (
        <div className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/75 dark:bg-slate-900/35">
            <div className="flex items-center gap-2">
              <Icons.BookOpen className="w-4 h-4 text-primary-500" />
              <div className="text-sm font-black text-slate-900 dark:text-white">目录导航</div>
            </div>
          </div>
          <nav className="max-h-[52vh] overflow-y-auto p-3 space-y-1">
            {headingItems.map((heading, index) => (
              <a
                key={`${heading.id}-${index}`}
                href={`#${heading.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  window.history.replaceState(null, '', `#${heading.id}`);
                }}
                className={`block rounded-xl border-l-2 px-3 py-2 text-sm transition-all ${activeHeading === heading.id
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-semibold'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/40 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                style={{ paddingLeft: `${12 + (heading.level - 2) * 14}px` }}
              >
                {heading.text}
              </a>
            ))}
          </nav>
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-900/70 p-5 shadow-sm">
        <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">评论接入状态</div>
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300 leading-6">
          当前页面已真实接入热点评论接口，评论按热点维度独立读写，不再借道普通文章 <code>article_id</code>。
        </div>
      </div>

      <div id="hotspot-sources" className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-900/70 p-5 shadow-sm">
        <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">来源列表</div>
        {sources.length > 0 ? (
          <div className="space-y-2">
            {sources.map((source) => (
              <a
                key={source.id}
                href={source.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">{source.source_name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 break-all">{source.original_title || source.source_url}</div>
                  </div>
                  <Icons.ExternalLink className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                </div>
              </a>
            ))}
          </div>
        ) : sourceTypes.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {sourceTypes.map((source) => (
              <button
                key={source}
                type="button"
                onClick={() => navigate(`/hotspots?source_type=${encodeURIComponent(source)}`)}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
              >
                <Icons.Link className="w-3.5 h-3.5" />
                {source}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-500 dark:text-slate-400">暂无来源信息</div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm">
        <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">继续浏览</div>
        <div className="space-y-2">
          <Link
            to="/hotspots"
            className="w-full inline-flex items-center justify-between rounded-xl px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-primary-200 dark:hover:border-primary-700 transition-colors"
          >
            <span className="inline-flex items-center gap-2"><Icons.ArrowLeft className="w-4 h-4" /> 返回热点列表</span>
            <Icons.ArrowRight className="w-4 h-4" />
          </Link>

          {hotspot.primary_category && (
            <button
              type="button"
              onClick={() => navigate(`/hotspots?category=${encodeURIComponent(hotspot.primary_category as string)}`)}
              className="w-full inline-flex items-center justify-between rounded-xl px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-primary-200 dark:hover:border-primary-700 transition-colors"
            >
              <span className="inline-flex items-center gap-2"><Icons.Folder className="w-4 h-4" /> 查看同分类热点</span>
              <Icons.ArrowRight className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={copyLink}
            className="w-full inline-flex items-center justify-between rounded-xl px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-primary-200 dark:hover:border-primary-700 transition-colors"
          >
            <span className="inline-flex items-center gap-2"><Icons.Copy className="w-4 h-4" /> {copied ? '链接已复制' : '复制当前链接'}</span>
            <Icons.ArrowRight className="w-4 h-4" />
          </button>

          {previousItem && (
            <button
              type="button"
              onClick={() => navigate(`/hotspots/${previousItem.id}`)}
              className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 bg-slate-50 dark:bg-slate-900 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
            >
              <div className="text-[11px] text-slate-400 mb-1">上一篇</div>
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-2">{previousItem.title}</div>
            </button>
          )}

          {nextItem && (
            <button
              type="button"
              onClick={() => navigate(`/hotspots/${nextItem.id}`)}
              className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 bg-slate-50 dark:bg-slate-900 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
            >
              <div className="text-[11px] text-slate-400 mb-1">下一篇</div>
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-2">{nextItem.title}</div>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100/70 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 transition-colors duration-300 pb-24 xl:pb-0">
      <HotspotFloatingToolbar
        title={hotspot.title}
        category={hotspot.primary_category}
        onBackToList={() => navigate('/hotspots')}
        onScrollToTop={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        onScrollToComments={() => document.getElementById('hotspot-comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        onCopyLink={copyLink}
        previousItem={previousItem ? {
          label: previousItem.title,
          title: previousItem.title,
          onClick: () => navigate(`/hotspots/${previousItem.id}`),
        } : null}
        nextItem={nextItem ? {
          label: nextItem.title,
          title: nextItem.title,
          onClick: () => navigate(`/hotspots/${nextItem.id}`),
        } : null}
      />

      <div className="max-w-screen-2xl mx-auto flex gap-0">
        {headingItems.length > 1 && (
          <aside className="hidden lg:block w-64 flex-shrink-0 pt-12 ml-8">
            <div className="sticky top-28 pl-4 border-l border-slate-200 dark:border-slate-800 transition-colors">
              <div className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 pl-2 flex items-center gap-2 transition-colors">
                <Icons.BookOpen className="w-4 h-4" /> 大纲
              </div>
              <nav className="space-y-1 text-sm max-h-[70vh] overflow-y-auto pr-2">
                {headingItems.map((heading, idx) => (
                  <a
                    key={`${heading.id}-${idx}`}
                    href={`#${heading.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={`block py-1.5 px-3 rounded-lg transition-all border-l-2 -ml-[1px] text-sm ${activeHeading === heading.id
                      ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 font-semibold'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    style={{ paddingLeft: `${12 + (heading.level - 2) * 12}px` }}
                  >
                    {heading.text}
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        )}

        <main className="flex-1 min-w-0">
          <div className="max-w-4xl mx-auto xl:mx-0 xl:ml-12 px-4 sm:px-6 py-10 sm:py-14 relative">
            <div className="mb-8">
              <Link
                to="/hotspots"
                className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 mb-6 group transition-colors"
              >
                <Icons.ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                返回热点列表
              </Link>
            </div>

            <article className="relative overflow-hidden rounded-3xl border border-slate-100 dark:border-slate-700 bg-white/98 dark:bg-slate-800/96 shadow-sm">
              <div className="absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_38%),radial-gradient(circle_at_top_left,rgba(99,102,241,0.10),transparent_34%)] pointer-events-none" />

              <div className="relative px-6 md:px-10 pt-8 md:pt-10 pb-8 border-b border-slate-100 dark:border-slate-700">
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px] gap-6 items-start">
                  <div className="space-y-5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
                      <span className="px-3 py-1 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900">AI HOTSPOT</span>
                      <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">{hotspot.primary_category || '未分类'}</span>
                      <span className="px-3 py-1 rounded-full bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">热度 {formatNumber(hotspot.heat_score)}</span>
                      <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">来源 {formatNumber(hotspot.source_count)}</span>
                    </div>

                    <div className="space-y-4">
                      <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-tight text-slate-900 dark:text-white">{hotspot.title}</h1>
                      <p className="text-sm md:text-base text-slate-600 dark:text-slate-300 leading-8 max-w-4xl">
                        {hotspot.summary || '暂无摘要'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 dark:bg-slate-900/40 px-3 py-1.5 border border-slate-200 dark:border-slate-700">
                        <Icons.Calendar className="w-4 h-4" />
                        {formatDateTime(hotspot.published_at || hotspot.topic_date || hotspot.created_at)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 dark:bg-slate-900/40 px-3 py-1.5 border border-slate-200 dark:border-slate-700">
                        <Icons.Check className="w-4 h-4" />
                        已发布
                      </span>
                      <button
                        type="button"
                        onClick={copyLink}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white/80 dark:bg-slate-900/40 px-3 py-1.5 border border-slate-200 dark:border-slate-700 hover:border-cyan-300 dark:hover:border-cyan-700 transition-colors"
                      >
                        <Icons.Copy className="w-4 h-4" />
                        {copied ? '链接已复制' : '复制链接'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative px-6 md:px-10 py-8 md:py-10 space-y-8">
                <section className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/45 p-4 md:p-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">分类</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{hotspot.primary_category || '未分类'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">热度</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">{formatNumber(hotspot.heat_score)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">来源数</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">{formatNumber(hotspot.source_count)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">更新时间</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{formatDateTime(hotspot.updated_at || hotspot.published_at || hotspot.created_at)}</div>
                    </div>
                  </div>
                </section>

                <section className="space-y-5">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-6 rounded-full bg-primary-500" />
                    <h2 className="text-xl font-black text-slate-900 dark:text-white">深度解读</h2>
                  </div>

                  {articleMarkdown ? (
                    <div className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
                      <div className="px-4 sm:px-6 md:px-8 py-6 md:py-8">
                        <MarkdownContent
                          className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-normal prose-h1:text-3xl prose-h1:md:text-4xl prose-h2:text-2xl prose-h2:md:text-3xl prose-p:text-[15px] md:prose-p:text-base prose-p:leading-8 prose-li:leading-8 prose-ul:my-5 prose-ol:my-5 prose-blockquote:border-cyan-300 dark:prose-blockquote:border-cyan-700 prose-pre:rounded-2xl prose-img:rounded-2xl"
                        >
                          {articleMarkdown}
                        </MarkdownContent>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-6 text-sm text-slate-500 dark:text-slate-400">
                      暂无 Markdown 正文内容。
                    </div>
                  )}
                </section>

                <div className="lg:hidden">
                  {auxiliaryPanel}
                </div>

                <HotspotComments hotspotId={hotspot.id} hotspotTitle={hotspot.title} />
              </div>
            </article>
          </div>
        </main>

        <aside className="hidden lg:block w-80 flex-shrink-0 pt-12 pr-8">
          <div className="sticky top-24">
            {auxiliaryPanel}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default HotspotDetail;
