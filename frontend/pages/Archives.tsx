import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { EmptyState } from '../components/Shared';
import { ListSkeleton } from '../components/Skeleton';
import { getArticles, getTags, ArticleListItem, Tag } from '../api/articles';
import { getHotspots, HotTopicListItem } from '../api/hotspots';
import { getAiDailyIndex, getAiDailyTopics, AiDailyIndex, AiDailyTopics } from '../api/aiDaily';
import { formatCompactNumber } from '../utils/helpers';
import { safeExternalUrl } from '../utils/urls';

/** 每个文件夹最多展示的文章数 */
const MAX_PREVIEW = 4;

/** 热点每组（主题/月份）默认展示条数 */
const HOTSPOT_PREVIEW = 8;

const ARCHIVE_TABS = [
  { key: 'articles', label: '文章', hint: '标签知识文件夹' },
  { key: 'hotspots', label: '热点', hint: 'LLM 归一主题归档' },
  { key: 'ai-daily', label: 'AI 日报', hint: '滚动 30 天 · 按主题' },
] as const;

type ArchiveTab = typeof ARCHIVE_TABS[number]['key'];

const monthKeyOf = (value?: string) => {
  if (!value) return '未知时间';
  return value.slice(0, 7);
};

const Archives: React.FC = () => {
  const navigate = useNavigate();
  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState<ArchiveTab>('articles');
  const [hotspots, setHotspots] = useState<HotTopicListItem[] | null>(null);
  const [hotspotsLoading, setHotspotsLoading] = useState(false);
  const [hotspotView, setHotspotView] = useState<'theme' | 'time'>('theme');
  const [expandedHotspotGroups, setExpandedHotspotGroups] = useState<Set<string>>(new Set());
  const [openHotspotMonths, setOpenHotspotMonths] = useState<Record<string, boolean>>({});
  const [openHotspotThemes, setOpenHotspotThemes] = useState<Set<string>>(new Set());

  const [dailyView, setDailyView] = useState<'theme' | 'date'>('theme');
  const [dailyTopics, setDailyTopics] = useState<AiDailyTopics | null>(null);
  const [dailyIndex, setDailyIndex] = useState<AiDailyIndex | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [expandedDailyTopics, setExpandedDailyTopics] = useState<Set<string>>(new Set());
  const [openDailyTopicGroups, setOpenDailyTopicGroups] = useState<Set<string>>(new Set());
  const [openDailyMonths, setOpenDailyMonths] = useState<Record<string, boolean>>({});

  const [hotspotTotal, setHotspotTotal] = useState<number | null>(null);
  const [dailyTotal, setDailyTotal] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    getAiDailyIndex()
      .then((index) => {
        if (!mounted || !index) return;
        setDailyTotal(index.total);
        setDailyIndex(index);
        if (index.months?.length) {
          setOpenDailyMonths({ [index.months[0].month]: true });
        }
      })
      .catch(() => {});

    getHotspots({ page: 1, page_size: 1, status: 'published' })
      .then((res) => {
        if (mounted) setHotspotTotal(res.total);
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'hotspots' || hotspots) return;
    let mounted = true;
    setHotspotsLoading(true);
    (async () => {
      try {
        const all: HotTopicListItem[] = [];
        let page = 1;
        let totalPages = 1;
        do {
          const res = await getHotspots({ page, page_size: 100, status: 'published' });
          all.push(...res.data);
          totalPages = res.total_pages;
          page++;
        } while (page <= totalPages);
        if (mounted) {
          setHotspots(all);
          if (all.length) {
            const byMonth: Record<string, boolean> = {};
            byMonth[monthKeyOf(all[0].topic_date)] = true;
            setOpenHotspotMonths(byMonth);
          }
        }
      } catch (error) {
        console.error('获取热点归档失败:', error);
        if (mounted) setHotspots([]);
      } finally {
        if (mounted) setHotspotsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeTab, hotspots]);

  useEffect(() => {
    if (activeTab !== 'ai-daily' || dailyTopics) return;
    let mounted = true;
    setDailyLoading(true);
    getAiDailyTopics()
      .then((topics) => {
        if (!mounted) return;
        setDailyTopics(topics);
      })
      .catch((error) => {
        console.error('获取 AI 日报主题索引失败:', error);
        if (mounted) setDailyTopics(null);
      })
      .finally(() => mounted && setDailyLoading(false));
    return () => {
      mounted = false;
    };
  }, [activeTab, dailyTopics]);

  const hotspotsByTheme = useMemo(() => {
    if (!hotspots) return [];
    const map = new Map<string, HotTopicListItem[]>();
    hotspots.forEach((h) => {
      const key = h.topic_tag || '未分类';
      const list = map.get(key) || [];
      list.push(h);
      map.set(key, list);
    });
    return Array.from(map.entries())
      .map(([theme, items]) => ({
        theme,
        items: items.sort(
          (a, b) =>
            (b.heat_score || 0) - (a.heat_score || 0) ||
            (b.topic_date || '').localeCompare(a.topic_date || ''),
        ),
      }))
      .sort((a, b) =>
        a.theme === '未分类' ? 1 : b.theme === '未分类' ? -1 : b.items.length - a.items.length,
      );
  }, [hotspots]);

  const hotspotsByMonth = useMemo(() => {
    if (!hotspots) return [];
    const map = new Map<string, HotTopicListItem[]>();
    hotspots.forEach((h) => {
      const key = monthKeyOf(h.topic_date || h.published_at || h.created_at);
      const list = map.get(key) || [];
      list.push(h);
      map.set(key, list);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, items]) => ({
        month,
        items: items.sort((a, b) => (b.topic_date || '').localeCompare(a.topic_date || '')),
      }));
  }, [hotspots]);

  const toggleHotspotGroup = (key: string) => {
    setExpandedHotspotGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleDailyTopic = (label: string) => {
    setExpandedDailyTopics((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const toggleSetKey = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (key: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleHotspotTheme = toggleSetKey(setOpenHotspotThemes);
  const toggleDailyTopicGroup = toggleSetKey(setOpenDailyTopicGroups);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tagsData, articlesData] = await Promise.all([
          getTags(),
          (async () => {
            const allArticles: ArticleListItem[] = [];
            let currentPage = 1;
            let totalPages = 1;
            do {
              const res = await getArticles({ page: currentPage, page_size: 100, status: 'published' });
              allArticles.push(...res.data);
              totalPages = res.total_pages;
              currentPage++;
            } while (currentPage <= totalPages);
            return allArticles;
          })(),
        ]);

        articlesData.sort(
          (a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime(),
        );
        setArticles(articlesData);
        setTags(tagsData);
      } catch (error) {
        console.error('获取归档数据失败:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const groupedByTag = useMemo(
    () =>
      tags.reduce((acc, tag) => {
        acc[tag.name] = articles.filter((a) => a.tags.some((t) => t.name === tag.name));
        return acc;
      }, {} as Record<string, ArticleListItem[]>),
    [tags, articles],
  );

  const toggleExpand = (tagName: string) => {
    setExpandedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tagName)) next.delete(tagName);
      else next.add(tagName);
      return next;
    });
  };

  const archiveStats = useMemo(() => {
    const totalViews = articles.reduce((sum, article) => sum + Number(article.view_count || 0), 0);
    const totalLikes = articles.reduce((sum, article) => sum + Number(article.like_count || 0), 0);
    const activeTags = tags.filter((tag) => (groupedByTag[tag.name] || []).length > 0);
    const latest = articles.slice(0, 5);
    const monthMap = new Map<string, number>();

    articles.forEach((article) => {
      if (!article.published_at) return;
      const date = new Date(article.published_at);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthMap.set(key, (monthMap.get(key) || 0) + 1);
    });

    const months = Array.from(monthMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 12)
      .reverse();
    const maxMonthCount = Math.max(1, ...months.map(([, count]) => count));

    return { totalViews, totalLikes, activeTags, latest, months, maxMonthCount };
  }, [articles, tags, groupedByTag]);

  const headerStats = useMemo(() => {
    if (activeTab === 'hotspots') {
      const list = hotspots;
      if (!list) {
        return [
          { label: '热点', value: hotspotTotal ?? '…', icon: Icons.Flame },
          { label: '主题', value: '…', icon: Icons.Tags },
          { label: '热度', value: '…', icon: Icons.TrendingUp },
        ];
      }
      const themes = new Set(list.map((h) => h.topic_tag || '未分类'));
      const heat = list.reduce((sum, h) => sum + Number(h.heat_score || 0), 0);
      return [
        { label: '热点', value: list.length, icon: Icons.Flame },
        { label: '主题', value: themes.size, icon: Icons.Tags },
        { label: '热度', value: formatCompactNumber(heat), icon: Icons.TrendingUp },
      ];
    }
    if (activeTab === 'ai-daily') {
      const topics = dailyTopics;
      if (!topics) {
        return [
          { label: '日报', value: dailyTotal ?? '…', icon: Icons.BookOpen },
          { label: '主题', value: '…', icon: Icons.Tags },
          { label: '覆盖月数', value: '…', icon: Icons.Calendar },
        ];
      }
      return [
        { label: '日报', value: topics.total, icon: Icons.BookOpen },
        { label: '主题', value: topics.topics.length, icon: Icons.Tags },
        { label: '覆盖月数', value: dailyIndex?.months?.length ?? '…', icon: Icons.Calendar },
      ];
    }
    return [
      { label: '文章', value: articles.length, icon: Icons.FileText },
      { label: '标签', value: archiveStats.activeTags.length, icon: Icons.Tags },
      { label: '阅读', value: formatCompactNumber(archiveStats.totalViews), icon: Icons.Eye },
    ];
  }, [activeTab, articles.length, archiveStats, hotspots, hotspotTotal, dailyTopics, dailyTotal, dailyIndex]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
      {/* 极简编辑部页头 */}
      <header className="pb-8 mb-8 border-b border-slate-200/80 dark:border-slate-800 grid grid-cols-1 lg:grid-cols-[1.35fr_0.65fr] gap-6 items-end">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-medium tracking-wider uppercase text-primary-600 dark:text-primary-400 mb-3">
            <Icons.Archive className="w-3.5 h-3.5" />
            <span>Site Archive / 知识目录</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight mb-2">
            全站归档
          </h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
            技术文章按标签整理为知识文件夹，热点追踪与 AI 日报按主题与月度结构沉淀，一站回溯全站内容。
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {headerStats.map((item) => (
            <div
              key={item.label}
              className="min-w-0 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-4 text-center"
            >
              <item.icon className="w-4 h-4 mx-auto mb-1.5 text-primary-500" />
              <div
                className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums truncate"
                title={String(item.value)}
              >
                {item.value}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{item.label}</div>
            </div>
          ))}
        </div>
      </header>

      {loading ? (
        <ListSkeleton rows={4} />
      ) : (
        <>
          {/* 三合一分段切换 */}
          <div className="mb-8 flex items-center gap-2 overflow-x-auto pb-1">
            {ARCHIVE_TABS.map((tab) => {
              const active = activeTab === tab.key;
              const count =
                tab.key === 'articles'
                  ? articles.length
                  : tab.key === 'hotspots'
                    ? (hotspotTotal ?? '…')
                    : (dailyTotal ?? '…');
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`shrink-0 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm border transition-colors cursor-pointer ${
                    active
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-transparent font-semibold'
                      : 'bg-white dark:bg-slate-900/90 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 font-medium'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-xs tabular-nums ${
                      active ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ===== 热点归档 ===== */}
          {activeTab === 'hotspots' && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {([
                  ['theme', '按主题'],
                  ['time', '按时间'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setHotspotView(key)}
                    className={`rounded-lg px-3 py-1.5 text-xs border transition-colors cursor-pointer ${
                      hotspotView === key
                        ? 'bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-800 font-semibold'
                        : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-200 font-medium'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">
                  {hotspotView === 'theme' ? '主题由站内流水线统一归一打标' : '按专题日期归月'}
                </span>
              </div>

              {hotspotsLoading && <ListSkeleton rows={3} />}

              {!hotspotsLoading && hotspots && hotspots.length === 0 && (
                <EmptyState icon={<Icons.Flame className="w-5 h-5" />} title="暂无已发布热点" />
              )}

              {!hotspotsLoading &&
                hotspotView === 'theme' &&
                hotspotsByTheme.map(({ theme, items }) => {
                  const groupOpen = openHotspotThemes.has(theme);
                  const expanded = expandedHotspotGroups.has(theme);
                  const display = expanded ? items : items.slice(0, HOTSPOT_PREVIEW);
                  const hasMore = items.length > HOTSPOT_PREVIEW;
                  return (
                    <div
                      key={theme}
                      className="rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => toggleHotspotTheme(theme)}
                        aria-expanded={groupOpen}
                        className={`w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer ${
                          groupOpen ? 'border-b border-slate-100 dark:border-slate-800' : ''
                        }`}
                      >
                        <span className="flex items-center gap-2.5 text-base font-semibold text-slate-900 dark:text-slate-100">
                          <Icons.ChevronDown
                            className={`w-4 h-4 text-slate-400 transition-transform ${groupOpen ? 'rotate-0' : '-rotate-90'}`}
                          />
                          <Icons.Folder className="w-4 h-4 text-primary-500" />
                          {theme}
                        </span>
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 tabular-nums">
                          {items.length} 篇
                        </span>
                      </button>

                      {groupOpen && (
                        <div className="px-5 py-3">
                          <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {display.map((h) => (
                              <button
                                key={h.id}
                                type="button"
                                onClick={() => navigate(`/hotspots/${h.id}`)}
                                className="w-full flex items-start gap-3 py-3 px-2 -mx-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left group cursor-pointer"
                              >
                                <span className="shrink-0 mt-0.5 text-xs font-medium text-slate-400 tabular-nums">
                                  {(h.topic_date || '').slice(5) || '——'}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-1">
                                    {h.title}
                                  </div>
                                  {h.summary && (
                                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                                      {h.summary}
                                    </p>
                                  )}
                                </div>
                                <span className="shrink-0 inline-flex items-center gap-1 text-xs text-slate-400 tabular-nums">
                                  <Icons.Flame className="w-3 h-3" /> {formatCompactNumber(h.heat_score)}
                                </span>
                              </button>
                            ))}
                          </div>
                          {hasMore && (
                            <button
                              type="button"
                              onClick={() => toggleHotspotGroup(theme)}
                              className="mt-2 w-full text-center py-2 rounded-lg text-xs font-medium bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                            >
                              {expanded ? '收起 ↑' : `展开全部 ${items.length} 个 →`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

              {!hotspotsLoading &&
                hotspotView === 'time' &&
                hotspotsByMonth.map(({ month, items }) => {
                  const open = !!openHotspotMonths[month];
                  const monthKey = `hs-${month}`;
                  const expanded = expandedHotspotGroups.has(monthKey);
                  const display = expanded ? items : items.slice(0, HOTSPOT_PREVIEW);
                  const hasMore = items.length > HOTSPOT_PREVIEW;
                  return (
                    <div
                      key={month}
                      className="rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenHotspotMonths((prev) => ({ ...prev, [month]: !prev[month] }))}
                        aria-expanded={open}
                        className={`w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer ${
                          open ? 'border-b border-slate-100 dark:border-slate-800' : ''
                        }`}
                      >
                        <span className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                          <Icons.ChevronDown
                            className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
                          />
                          <Icons.Calendar className="w-4 h-4 text-primary-500" />
                          {month} 月
                        </span>
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 tabular-nums">
                          {items.length} 篇
                        </span>
                      </button>
                      {open && (
                        <div className="px-5 py-3">
                          <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {display.map((h) => (
                              <button
                                key={h.id}
                                type="button"
                                onClick={() => navigate(`/hotspots/${h.id}`)}
                                className="w-full flex items-start gap-3 py-3 px-2 -mx-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left group cursor-pointer"
                              >
                                <span className="shrink-0 mt-0.5 text-xs font-medium text-slate-400 tabular-nums">
                                  {(h.topic_date || '').slice(5) || '——'}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-1">
                                    {h.title}
                                  </div>
                                  {h.summary && (
                                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                                      {h.summary}
                                    </p>
                                  )}
                                </div>
                                <span className="shrink-0 inline-flex items-center gap-1 text-xs text-slate-400 tabular-nums">
                                  <Icons.Flame className="w-3 h-3" /> {formatCompactNumber(h.heat_score)}
                                </span>
                              </button>
                            ))}
                          </div>
                          {hasMore && (
                            <button
                              type="button"
                              onClick={() => toggleHotspotGroup(monthKey)}
                              className="mt-2 w-full text-center py-2 rounded-lg text-xs font-medium bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                            >
                              {expanded ? '收起 ↑' : `查看本月全部 ${items.length} 个 →`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </section>
          )}

          {/* ===== AI 日报归档 ===== */}
          {activeTab === 'ai-daily' && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {([
                  ['theme', '按主题'],
                  ['date', '按日期'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDailyView(key)}
                    className={`rounded-lg px-3 py-1.5 text-xs border transition-colors cursor-pointer ${
                      dailyView === key
                        ? 'bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-800 font-semibold'
                        : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-200 font-medium'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">
                  保留近 30 天 AI 日报成稿，同步滚动更新
                </span>
              </div>

              {dailyLoading && <ListSkeleton rows={3} />}

              {!dailyLoading &&
                dailyView === 'theme' &&
                (!dailyTopics ? (
                  <EmptyState icon={<Icons.BookOpen className="w-5 h-5" />} title="日报主题索引暂时不可用" />
                ) : (
                  dailyTopics.topics.map((topic) => {
                    const groupOpen = openDailyTopicGroups.has(topic.label);
                    const expanded = expandedDailyTopics.has(topic.label);
                    const display = expanded ? topic.items : topic.items.slice(0, HOTSPOT_PREVIEW);
                    const hasMore = topic.items.length > HOTSPOT_PREVIEW;
                    return (
                      <div
                        key={topic.label}
                        className="rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => toggleDailyTopicGroup(topic.label)}
                          aria-expanded={groupOpen}
                          className={`w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer ${
                            groupOpen ? 'border-b border-slate-100 dark:border-slate-800' : ''
                          }`}
                        >
                          <span className="flex items-center gap-2.5 text-base font-semibold text-slate-900 dark:text-slate-100">
                            <Icons.ChevronDown
                              className={`w-4 h-4 text-slate-400 transition-transform ${groupOpen ? 'rotate-0' : '-rotate-90'}`}
                            />
                            <Icons.Folder className="w-4 h-4 text-primary-500" />
                            {topic.label}
                          </span>
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 tabular-nums">
                            近 30 天 {topic.count} 条
                          </span>
                        </button>
                        {groupOpen && (
                          <div className="px-5 py-3">
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                              {display.map((item, idx) => {
                                const safeHref = safeExternalUrl(item.sourceUrl);
                                return safeHref ? (
                                  <a
                                    key={`${topic.label}-${item.date}-${idx}`}
                                    href={safeHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-start gap-3 py-3 px-2 -mx-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left group"
                                  >
                                    <span className="shrink-0 mt-0.5 text-xs font-medium text-slate-400 tabular-nums">
                                      {item.date.slice(5)}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-1">
                                        {item.title}
                                      </div>
                                      {item.summary && (
                                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                                          {item.summary}
                                        </p>
                                      )}
                                    </div>
                                    <Icons.ExternalLink className="shrink-0 w-3.5 h-3.5 mt-1 text-slate-300 group-hover:text-primary-500" />
                                  </a>
                                ) : (
                                  <div
                                    key={`${topic.label}-${item.date}-${idx}`}
                                    className="flex items-start gap-3 py-3 px-2 -mx-2 text-left"
                                  >
                                    <span className="shrink-0 mt-0.5 text-xs font-medium text-slate-400 tabular-nums">
                                      {item.date.slice(5)}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 line-clamp-1">
                                        {item.title}
                                      </div>
                                      {item.summary && (
                                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                                          {item.summary}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {hasMore && (
                              <button
                                type="button"
                                onClick={() => toggleDailyTopic(topic.label)}
                                className="mt-2 w-full text-center py-2 rounded-lg text-xs font-medium bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                              >
                                {expanded ? '收起 ↑' : `查看该主题全部 ${topic.count} 条 →`}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                ))}

              {!dailyLoading &&
                dailyView === 'date' &&
                (!dailyIndex ? (
                  <EmptyState icon={<Icons.Calendar className="w-5 h-5" />} title="日报索引暂时不可用" />
                ) : (
                  dailyIndex.months.map((month) => {
                    const open = !!openDailyMonths[month.month];
                    return (
                      <div
                        key={month.month}
                        className="rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => setOpenDailyMonths((prev) => ({ ...prev, [month.month]: !prev[month.month] }))}
                          aria-expanded={open}
                          className={`w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer ${
                            open ? 'border-b border-slate-100 dark:border-slate-800' : ''
                          }`}
                        >
                          <span className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                            <Icons.ChevronDown
                              className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
                            />
                            {month.label}
                          </span>
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 tabular-nums">
                            {month.count} 期
                          </span>
                        </button>
                        {open && (
                          <div className="p-5 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                            {(month.days || []).map((day) => (
                              <a
                                key={day.path}
                                href={`#/ai-daily?p=${encodeURIComponent(day.path)}`}
                                className="text-center rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-primary-300 dark:hover:border-primary-700 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50/50 dark:hover:bg-primary-950/30 transition-colors tabular-nums"
                              >
                                {day.label}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                ))}
            </section>
          )}

          {/* ===== 文章归档 ===== */}
          {activeTab === 'articles' && (
            <>
              <section className="mb-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
                <div className="rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      <Icons.Calendar className="w-3.5 h-3.5 text-primary-500" />
                      近 12 个月写作热力
                    </h2>
                    <span className="text-xs text-slate-400">月度产出分布</span>
                  </div>
                  <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
                    {archiveStats.months.map(([month, count]) => (
                      <div key={month} className="group">
                        <div
                          className="h-16 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 overflow-hidden flex items-end"
                          title={`${month}: ${count} 篇`}
                        >
                          <div
                            className="w-full bg-primary-500/80 dark:bg-primary-500/70 group-hover:bg-primary-600 transition-all"
                            style={{ height: `${Math.max(14, (count / archiveStats.maxMonthCount) * 100)}%` }}
                          />
                        </div>
                        <div className="mt-1.5 text-[10px] text-center text-slate-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors tabular-nums">
                          {month.slice(5)}月
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 p-5">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2 mb-4">
                    <Icons.Clock className="w-3.5 h-3.5 text-primary-500" />
                    最近更新
                  </h2>
                  <div className="space-y-3">
                    {archiveStats.latest.map((article) => (
                      <button
                        key={article.id}
                        type="button"
                        onClick={() => navigate(`/articles/${article.id}`)}
                        className="w-full text-left group cursor-pointer"
                      >
                        <div className="text-xs font-medium text-slate-700 dark:text-slate-200 group-hover:text-primary-600 dark:group-hover:text-primary-400 line-clamp-1 transition-colors">
                          {article.title}
                        </div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 tabular-nums">
                          {article.published_at ? new Date(article.published_at).toLocaleDateString('zh-CN') : '暂无日期'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {tags.map((tag) => {
                  const tagArticles = groupedByTag[tag.name] || [];
                  if (tagArticles.length === 0) return null;

                  const isExpanded = expandedTags.has(tag.name);
                  const displayArticles = isExpanded ? tagArticles : tagArticles.slice(0, MAX_PREVIEW);
                  const hasMore = tagArticles.length > MAX_PREVIEW;

                  return (
                    <div
                      key={tag.id}
                      className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-3.5">
                        <div className="flex items-center gap-2">
                          <Icons.Folder className="w-4 h-4 text-primary-500" />
                          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{tag.name}</h2>
                        </div>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 tabular-nums">
                          {tagArticles.length} 篇
                        </span>
                      </div>

                      <div className="space-y-1">
                        {displayArticles.map((article) => (
                          <div
                            key={article.id}
                            onClick={() => navigate(`/articles/${article.id}`)}
                            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors group/item"
                          >
                            <Icons.FileText className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 flex-shrink-0 group-hover/item:text-primary-500 transition-colors" />
                            <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate group-hover/item:text-slate-900 dark:group-hover/item:text-white transition-colors">
                              {article.title}
                            </span>
                            <div className="flex items-center gap-2.5 text-[11px] text-slate-400 dark:text-slate-500 flex-shrink-0 tabular-nums">
                              <span className="flex items-center gap-0.5">
                                <Icons.Eye className="w-3 h-3" /> {article.view_count}
                              </span>
                              <span className="flex items-center gap-0.5">
                                <Icons.Heart className="w-3 h-3" /> {article.like_count}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {hasMore && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(tag.name)}
                          className="mt-3 w-full text-center py-2 rounded-lg text-xs font-medium bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                        >
                          {isExpanded ? '收起 ↑' : `查看全部 ${tagArticles.length} 篇 →`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      <footer className="mt-16 pt-8 border-t border-slate-200/80 dark:border-slate-800 text-center">
        <p className="text-slate-400 dark:text-slate-500 text-xs">
          坚持写作与持续记录 · {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
};

export default Archives;
