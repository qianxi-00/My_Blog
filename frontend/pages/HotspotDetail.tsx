import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { Button, EmptyState, StatusPill } from '../components/Shared';
import { DetailSkeleton } from '../components/Skeleton';
import MarkdownContent from '../components/MarkdownContent';
import { extractHeadingsFromMarkdown } from '../components/MarkdownRenderer';
import HotspotFloatingToolbar from '../components/HotspotFloatingToolbar';
import HotspotComments from '../components/HotspotComments';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { getBookmarkStatus, toggleBookmark } from '../api/users';
import { copyToClipboard, formatCompactNumber } from '../utils/helpers';
import { safeExternalUrl } from '../utils/urls';
import { errorText } from '../utils/errors';
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

// 三十七期：详情页头部日期只显示到「日」
const formatDateOnly = (value?: string) => {
  if (!value) return '';
  const datePart = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart.replace(/-/g, '/') : value;
};

const stripFrontmatter = (markdown?: string) => {
  if (!markdown) return '';
  return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim();
};

const HotspotDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();

  const [hotspot, setHotspot] = useState<HotTopicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sources, setSources] = useState<HotTopicSource[]>([]);
  const [copied, setCopied] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
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

  // 同步收藏状态
  useEffect(() => {
    let alive = true;
    if (!hotspot || !isAuthenticated) {
      setBookmarked(false);
      return;
    }
    getBookmarkStatus('hotspot', hotspot.id)
      .then((res) => {
        if (alive) setBookmarked(Boolean(res.bookmarked));
      })
      .catch(() => {
        // ignore
      });
    return () => {
      alive = false;
    };
  }, [hotspot?.id, isAuthenticated]);

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

    return Array.from(
      new Set([
        ...(hotspot.source_types || []),
        ...(hotspot.source_type ? [hotspot.source_type] : []),
        ...(sources.map((item) => item.source_type).filter(Boolean) as string[]),
      ]),
    ).filter((value) => value.toLowerCase() !== 'manual');
  }, [hotspot, sources]);

  const copyLink = async () => {
    const ok = await copyToClipboard(window.location.href);
    if (ok) {
      setCopied(true);
      showToast('链接已复制到剪贴板', 'success');
      window.setTimeout(() => setCopied(false), 1800);
    } else {
      showToast('复制失败，请手动复制地址栏链接', 'error');
    }
  };

  const handleToggleBookmark = async () => {
    if (!hotspot) return;
    if (!isAuthenticated) {
      showToast('收藏需要先登录', 'info');
      navigate(`/login?redirect=${encodeURIComponent(`/hotspots/${hotspot.id}`)}`);
      return;
    }
    if (bookmarkLoading) return;
    setBookmarkLoading(true);
    try {
      const res = await toggleBookmark('hotspot', hotspot.id);
      setBookmarked(res.bookmarked);
      showToast(res.bookmarked ? '已加入收藏' : '已取消收藏', 'success');
    } catch (err: any) {
      showToast(errorText(err, '收藏操作失败'), 'error');
    } finally {
      setBookmarkLoading(false);
    }
  };

  if (loading) {
    return <DetailSkeleton />;
  }

  if (error || !hotspot) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <EmptyState
          icon={<Icons.TrendingUp className="w-5 h-5" />}
          title={error || '未找到热点详情'}
          description="该热点可能已下线或链接有误，请返回热点列表继续浏览。"
          action={
            <Link to="/hotspots">
              <Button variant="secondary" size="sm">
                <Icons.ArrowLeft className="w-3.5 h-3.5" /> 返回热点列表
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const auxiliaryPanel = (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
          内容信息
        </div>
        <div className="space-y-3 text-sm">
          <div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mb-1.5">标签</div>
            <div className="flex flex-wrap gap-1.5">
              {(hotspot.tags || []).length > 0 ? (
                hotspot.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                  >
                    #{tag}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-400 dark:text-slate-500">暂无标签</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <div className="rounded-lg bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 px-3 py-2.5">
              <div className="text-[11px] text-slate-400 dark:text-slate-500 mb-0.5">状态</div>
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                已发布
              </div>
            </div>
            <div className="rounded-lg bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 px-3 py-2.5">
              <div className="text-[11px] text-slate-400 dark:text-slate-500 mb-0.5">更新时间</div>
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate" title={formatDateTime(hotspot.updated_at || hotspot.published_at)}>
                {formatDateOnly(hotspot.updated_at || hotspot.published_at) || '—'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {headingItems.length > 1 && (
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 overflow-hidden xl:hidden">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <Icons.BookOpen className="w-4 h-4 text-primary-500" />
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">目录导航</div>
          </div>
          <nav className="max-h-[45vh] overflow-y-auto p-3 space-y-1">
            {headingItems.map((heading, index) => (
              <a
                key={`${heading.id}-${index}`}
                href={`#${heading.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  window.history.replaceState(null, '', `#${heading.id}`);
                }}
                className={`block rounded-lg border-l-2 px-3 py-1.5 text-xs transition-colors ${
                  activeHeading === heading.id
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 font-semibold'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
                style={{ paddingLeft: `${10 + (heading.level - 2) * 12}px` }}
              >
                {heading.text}
              </a>
            ))}
          </nav>
        </div>
      )}

      <div id="hotspot-sources" className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
          参考来源
        </div>
        {sources.length > 0 ? (
          <div className="space-y-2">
            {sources.map((source) => {
              const safeUrl = safeExternalUrl(source.source_url);
              const content = (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{source.source_name}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 break-all line-clamp-2">
                      {source.original_title || source.source_url}
                    </div>
                  </div>
                  {safeUrl && <Icons.ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />}
                </div>
              );
              return safeUrl ? (
                <a
                  key={source.id}
                  href={safeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-slate-200/80 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 px-3.5 py-2.5 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
                >
                  {content}
                </a>
              ) : (
                <div
                  key={source.id}
                  className="block rounded-lg border border-slate-200/80 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 px-3.5 py-2.5"
                >
                  {content}
                </div>
              );
            })}
          </div>
        ) : sourceTypes.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {sourceTypes.map((source) => (
              <button
                key={source}
                type="button"
                onClick={() => navigate(`/hotspots?source_type=${encodeURIComponent(source)}`)}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-300 dark:hover:border-primary-700 transition-colors cursor-pointer"
              >
                <Icons.Link className="w-3 h-3" />
                {source}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-400 dark:text-slate-500">暂无来源信息</div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
          继续浏览
        </div>
        <div className="space-y-2">
          <Link
            to="/hotspots"
            className="w-full inline-flex items-center justify-between rounded-lg px-3.5 py-2.5 bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
          >
            <span className="inline-flex items-center gap-2">
              <Icons.ArrowLeft className="w-3.5 h-3.5" /> 返回热点列表
            </span>
            <Icons.ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          </Link>

          {hotspot.primary_category && (
            <button
              type="button"
              onClick={() => navigate(`/hotspots?category=${encodeURIComponent(hotspot.primary_category as string)}`)}
              className="w-full inline-flex items-center justify-between rounded-lg px-3.5 py-2.5 bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-primary-300 dark:hover:border-primary-700 transition-colors cursor-pointer"
            >
              <span className="inline-flex items-center gap-2">
                <Icons.Folder className="w-3.5 h-3.5" /> 查看同分类热点
              </span>
              <Icons.ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          )}

          {previousItem && (
            <button
              type="button"
              onClick={() => navigate(`/hotspots/${previousItem.id}`)}
              className="w-full text-left rounded-lg border border-slate-200/80 dark:border-slate-700 px-3.5 py-2.5 bg-slate-50/80 dark:bg-slate-800/60 hover:border-primary-300 dark:hover:border-primary-700 transition-colors cursor-pointer"
            >
              <div className="text-[11px] text-slate-400 mb-0.5">上一篇</div>
              <div className="text-xs font-medium text-slate-800 dark:text-slate-100 line-clamp-2">{previousItem.title}</div>
            </button>
          )}

          {nextItem && (
            <button
              type="button"
              onClick={() => navigate(`/hotspots/${nextItem.id}`)}
              className="w-full text-left rounded-lg border border-slate-200/80 dark:border-slate-700 px-3.5 py-2.5 bg-slate-50/80 dark:bg-slate-800/60 hover:border-primary-300 dark:hover:border-primary-700 transition-colors cursor-pointer"
            >
              <div className="text-[11px] text-slate-400 mb-0.5">下一篇</div>
              <div className="text-xs font-medium text-slate-800 dark:text-slate-100 line-clamp-2">{nextItem.title}</div>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen pb-24 lg:pb-12">
      <HotspotFloatingToolbar
        title={hotspot.title}
        category={hotspot.primary_category}
        bookmarked={bookmarked}
        onBookmark={handleToggleBookmark}
        onBackToList={() => navigate('/hotspots')}
        onScrollToTop={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        onScrollToComments={() => document.getElementById('hotspot-comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        onCopyLink={copyLink}
        previousItem={
          previousItem
            ? {
                label: previousItem.title,
                title: previousItem.title,
                onClick: () => navigate(`/hotspots/${previousItem.id}`),
              }
            : null
        }
        nextItem={
          nextItem
            ? {
                label: nextItem.title,
                title: nextItem.title,
                onClick: () => navigate(`/hotspots/${nextItem.id}`),
              }
            : null
        }
      />

      <div className="max-w-screen-2xl mx-auto flex gap-0">
        {headingItems.length > 1 && (
          <aside className="hidden xl:block w-64 flex-shrink-0 pt-10 ml-6">
            <div className="sticky top-24 pl-4 border-l border-slate-200/80 dark:border-slate-800">
              <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 pl-2 flex items-center gap-2">
                <Icons.BookOpen className="w-3.5 h-3.5" /> 大纲
              </div>
              <nav className="space-y-0.5 text-sm max-h-[70vh] overflow-y-auto pr-2">
                {headingItems.map((heading, idx) => (
                  <a
                    key={`${heading.id}-${idx}`}
                    href={`#${heading.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={`block py-1.5 px-3 rounded-lg transition-colors border-l-2 -ml-[1px] text-xs ${
                      activeHeading === heading.id
                        ? 'border-primary-500 bg-primary-50/70 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 font-semibold'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:border-slate-300 dark:hover:border-slate-700'
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
          <div className="max-w-4xl mx-auto xl:mx-0 xl:ml-8 px-4 sm:px-6 py-8 sm:py-10 relative">
            <div className="mb-5">
              <Link
                to="/hotspots"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 group transition-colors"
              >
                <Icons.ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                返回热点列表
              </Link>
            </div>

            <article className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 fade-up">
              <div className="px-5 sm:px-8 pt-7 pb-6 border-b border-slate-100 dark:border-slate-800">
                <h1
                  className={`font-bold leading-snug break-words text-slate-900 dark:text-slate-100 ${
                    hotspot.title.length > 22 ? 'text-2xl md:text-3xl' : 'text-3xl md:text-4xl'
                  }`}
                >
                  {hotspot.title}
                </h1>

                {hotspot.summary && (
                  <p className="mt-3.5 text-sm md:text-base text-slate-600 dark:text-slate-300 leading-7 max-w-3xl">
                    {hotspot.summary}
                  </p>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
                  {hotspot.primary_category && (
                    <button
                      type="button"
                      onClick={() => navigate(`/hotspots?category=${encodeURIComponent(hotspot.primary_category as string)}`)}
                      className="cursor-pointer"
                    >
                      <StatusPill tone="primary">
                        <Icons.Folder className="w-3 h-3" />
                        <span className="truncate max-w-[10rem]">{hotspot.primary_category}</span>
                      </StatusPill>
                    </button>
                  )}

                  {(hotspot.published_at || hotspot.topic_date || hotspot.created_at) && (
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Icons.Calendar className="w-3.5 h-3.5" />
                      <time
                        dateTime={hotspot.published_at || hotspot.topic_date || hotspot.created_at}
                        title={formatDateTime(hotspot.published_at || hotspot.topic_date || hotspot.created_at)}
                      >
                        {formatDateOnly(hotspot.published_at || hotspot.topic_date || hotspot.created_at)}
                      </time>
                    </span>
                  )}

                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Icons.TrendingUp className="w-3.5 h-3.5" />
                    热度 {formatCompactNumber(hotspot.heat_score)}
                  </span>

                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleToggleBookmark}
                      disabled={bookmarkLoading}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                        bookmarked
                          ? 'border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-950/50 text-primary-700 dark:text-primary-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <Icons.Bookmark className={`w-3.5 h-3.5 ${bookmarked ? 'fill-current' : ''}`} />
                      {bookmarked ? '已收藏' : '收藏'}
                    </button>

                    <button
                      type="button"
                      onClick={copyLink}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                        copied
                          ? 'border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      {copied ? <Icons.Check className="w-3.5 h-3.5" /> : <Icons.Copy className="w-3.5 h-3.5" />}
                      <span aria-live="polite">{copied ? '已复制' : '复制链接'}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="px-5 sm:px-8 py-7 space-y-8">
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-5 rounded-full bg-primary-500" />
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">深度解读</h2>
                  </div>

                  {articleMarkdown ? (
                    <div className="rounded-xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900/50 px-4 sm:px-6 py-5">
                      <MarkdownContent
                        className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-normal prose-h1:text-2xl prose-h1:md:text-3xl prose-h2:text-xl prose-h2:md:text-2xl prose-p:text-[15px] md:prose-p:text-base prose-p:leading-8 prose-li:leading-8 prose-ul:my-4 prose-ol:my-4 prose-pre:rounded-xl prose-img:rounded-xl"
                      >
                        {articleMarkdown}
                      </MarkdownContent>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-6 text-sm text-slate-500 dark:text-slate-400">
                      暂无 Markdown 正文内容。
                    </div>
                  )}
                </section>

                <div className="lg:hidden">{auxiliaryPanel}</div>

                <HotspotComments hotspotId={hotspot.id} hotspotTitle={hotspot.title} />
              </div>
            </article>
          </div>
        </main>

        <aside className="hidden lg:block w-80 flex-shrink-0 pt-10 pr-6">
          <div className="sticky top-24">{auxiliaryPanel}</div>
        </aside>
      </div>
    </div>
  );
};

export default HotspotDetail;
