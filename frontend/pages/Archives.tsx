import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { getArticles, getTags, ArticleListItem, Tag } from '../api/articles';
import { getHotspots, HotTopicListItem } from '../api/hotspots';
import { getAiDailyIndex, AiDailyIndex } from '../api/aiDaily';

// 为每个标签分配一套柔和配色
const TAG_COLORS: Record<string, { bg: string; border: string; icon: string; badge: string; hoverBg: string }> = {};
const COLOR_PALETTE = [
  { bg: 'bg-amber-50 dark:bg-amber-950/20', border: 'border-amber-200/60 dark:border-amber-800/40', icon: 'text-amber-500', badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300', hoverBg: 'hover:border-amber-300 dark:hover:border-amber-700' },
  { bg: 'bg-sky-50 dark:bg-sky-950/20', border: 'border-sky-200/60 dark:border-sky-800/40', icon: 'text-sky-500', badge: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300', hoverBg: 'hover:border-sky-300 dark:hover:border-sky-700' },
  { bg: 'bg-violet-50 dark:bg-violet-950/20', border: 'border-violet-200/60 dark:border-violet-800/40', icon: 'text-violet-500', badge: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300', hoverBg: 'hover:border-violet-300 dark:hover:border-violet-700' },
  { bg: 'bg-emerald-50 dark:bg-emerald-950/20', border: 'border-emerald-200/60 dark:border-emerald-800/40', icon: 'text-emerald-500', badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300', hoverBg: 'hover:border-emerald-300 dark:hover:border-emerald-700' },
  { bg: 'bg-rose-50 dark:bg-rose-950/20', border: 'border-rose-200/60 dark:border-rose-800/40', icon: 'text-rose-500', badge: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300', hoverBg: 'hover:border-rose-300 dark:hover:border-rose-700' },
  { bg: 'bg-teal-50 dark:bg-teal-950/20', border: 'border-teal-200/60 dark:border-teal-800/40', icon: 'text-teal-500', badge: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300', hoverBg: 'hover:border-teal-300 dark:hover:border-teal-700' },
];

/**
 * 获取标签对应的配色方案
 * 基于标签名称做哈希映射，保证同一标签始终分配相同颜色
 */
function getTagColor(tagName: string) {
  if (!TAG_COLORS[tagName]) {
    const index = Object.keys(TAG_COLORS).length % COLOR_PALETTE.length;
    TAG_COLORS[tagName] = COLOR_PALETTE[index];
  }
  return TAG_COLORS[tagName];
}

/** 每个文件夹最多展示的文章数 */
const MAX_PREVIEW = 4;

/** 十五期：归档三合一 tab（文章沿用原标签文件夹视图；热点/AI日报懒加载） */
const ARCHIVE_TABS = [
  { key: 'articles', label: '文章', hint: '标签知识文件夹' },
  { key: 'hotspots', label: '热点', hint: 'AIHOT 专题归档' },
  { key: 'ai-daily', label: 'AI 日报', hint: '日报成稿索引' },
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
  // 展开状态：展开的标签名 → 显示全部文章
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());

  // 十五期：三合一归档
  const [activeTab, setActiveTab] = useState<ArchiveTab>('articles');
  const [hotspots, setHotspots] = useState<HotTopicListItem[] | null>(null);
  const [hotspotsLoading, setHotspotsLoading] = useState(false);
  const [dailyIndex, setDailyIndex] = useState<AiDailyIndex | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [openDailyMonths, setOpenDailyMonths] = useState<Record<string, boolean>>({});

  // 热点/日报数据按 tab 懒加载，不拖累文章归档首屏
  useEffect(() => {
    if (activeTab !== 'hotspots' || hotspots) return;
    let mounted = true;
    setHotspotsLoading(true);
    (async () => {
      try {
        const all: HotTopicListItem[] = [];
        let page = 1, totalPages = 1;
        do {
          const res = await getHotspots({ page, page_size: 100, status: 'published' });
          all.push(...res.data);
          totalPages = res.total_pages;
          page++;
        } while (page <= totalPages);
        if (mounted) setHotspots(all);
      } catch (error) {
        console.error('获取热点归档失败:', error);
        if (mounted) setHotspots([]);
      } finally {
        if (mounted) setHotspotsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [activeTab, hotspots]);

  useEffect(() => {
    if (activeTab !== 'ai-daily' || dailyIndex) return;
    let mounted = true;
    setDailyLoading(true);
    getAiDailyIndex()
      .then((index) => {
        if (!mounted) return;
        setDailyIndex(index);
        if (index?.months?.length) {
          setOpenDailyMonths({ [index.months[0].month]: true });
        }
      })
      .catch((error) => {
        console.error('获取 AI 日报索引失败:', error);
        if (mounted) setDailyIndex(null);
      })
      .finally(() => mounted && setDailyLoading(false));
    return () => { mounted = false; };
  }, [activeTab, dailyIndex]);

  // 热点按月分组（新 → 旧）
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 并行获取标签列表和全部文章
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
          })()
        ]);

        // 按发布时间降序
        articlesData.sort((a, b) => new Date(b.published_at!).getTime() - new Date(a.published_at!).getTime());
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

  // 按标签分组文章（一篇文章可能属于多个标签）
  const groupedByTag = tags.reduce((acc, tag) => {
    acc[tag.name] = articles.filter(a => a.tags.some(t => t.name === tag.name));
    return acc;
  }, {} as Record<string, ArticleListItem[]>);

  const toggleExpand = (tagName: string) => {
    setExpandedTags(prev => {
      const next = new Set(prev);
      if (next.has(tagName)) {
        next.delete(tagName);
      } else {
        next.add(tagName);
      }
      return next;
    });
  };

  const archiveStats = useMemo(() => {
    const totalViews = articles.reduce((sum, article) => sum + Number(article.view_count || 0), 0);
    const totalLikes = articles.reduce((sum, article) => sum + Number(article.like_count || 0), 0);
    const activeTags = tags.filter(tag => (groupedByTag[tag.name] || []).length > 0);
    const latest = articles.slice(0, 5);
    const monthMap = new Map<string, number>();

    articles.forEach(article => {
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-16">
      {/* 页面标题 */}
      <header className="mb-10 overflow-hidden rounded-[2rem] border border-amber-100 dark:border-slate-700 bg-gradient-to-br from-amber-50 via-white to-sky-50 dark:from-slate-900 dark:via-slate-900 dark:to-amber-950/20 p-6 md:p-8 relative shadow-sm">
        <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-amber-200/40 dark:bg-amber-500/10 blur-3xl"></div>
        <div className="absolute -left-16 -bottom-16 w-56 h-56 rounded-full bg-sky-200/40 dark:bg-sky-500/10 blur-3xl"></div>
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1.3fr_0.7fr] gap-8 items-end">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 dark:bg-slate-800/70 border border-white dark:border-slate-700 text-xs font-black tracking-wide text-amber-600 dark:text-amber-300 mb-4">
              <Icons.Archive className="w-3.5 h-3.5" /> SITE ARCHIVE
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight mb-3">
              全站归档
            </h1>
            <p className="text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
              文章按标签收纳成知识文件夹；热点与 AI 日报按时间归档。一处回看全站沉淀。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '文章', value: articles.length, icon: Icons.FileText },
              { label: '标签', value: archiveStats.activeTags.length, icon: Icons.Tags },
              { label: '阅读', value: archiveStats.totalViews, icon: Icons.Eye },
            ].map(item => (
              <div key={item.label} className="rounded-2xl bg-white/80 dark:bg-slate-800/80 border border-white dark:border-slate-700 p-4 shadow-sm text-center">
                <item.icon className="w-4 h-4 mx-auto mb-2 text-amber-500" />
                <div className="text-2xl font-black text-slate-900 dark:text-white">{item.value}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-10 h-10 border-3 border-slate-200 dark:border-slate-700 border-t-slate-500 rounded-full animate-spin"></div>
          <p className="text-slate-400 text-sm">加载中...</p>
        </div>
      ) : (
        <>
          {/* 十五期：三合一 tab——紧凑单行 chip（与 AI 日报精选面板同款语言） */}
          <div className="mb-8 flex gap-2 overflow-x-auto pb-1">
            {ARCHIVE_TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm border transition-all ${active ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700 font-bold shadow-sm' : 'bg-white/70 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-200 dark:hover:border-amber-700 font-medium'}`}
                >
                  {tab.label}
                  <span className={`text-xs ${active ? 'text-amber-500 dark:text-amber-300' : 'text-slate-400'}`}>
                    {tab.key === 'articles' ? articles.length : tab.key === 'hotspots' ? (hotspots?.length ?? '…') : (dailyIndex?.total ?? '…')}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ===== 热点归档：按月分组 ===== */}
          {activeTab === 'hotspots' && (
            <section className="space-y-6">
              {hotspotsLoading && (
                <div className="flex flex-col items-center justify-center py-16 space-y-3">
                  <div className="w-8 h-8 border-2 border-slate-200 dark:border-slate-700 border-t-amber-500 rounded-full animate-spin"></div>
                  <p className="text-slate-400 text-sm">正在拉取热点归档...</p>
                </div>
              )}
              {!hotspotsLoading && hotspotsByMonth.length === 0 && (
                <div className="rounded-3xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-12 text-center text-slate-400 text-sm">暂无已发布热点</div>
              )}
              {!hotspotsLoading && hotspotsByMonth.map(({ month, items }) => (
                <div key={month} className="rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
                      <Icons.Folder className="w-4 h-4 text-amber-500" /> {month} 月
                    </h2>
                    <span className="text-xs font-semibold text-slate-400 px-2 py-0.5 rounded-full bg-slate-50 dark:bg-slate-900/50">{items.length} 个专题</span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {items.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => navigate(`/hotspots/${h.id}`)}
                        className="w-full flex items-start gap-3 py-3 px-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors text-left group"
                      >
                        <span className="shrink-0 mt-0.5 text-xs font-bold text-slate-400 tabular-nums">{(h.topic_date || '').slice(5) || '——'}</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-800 dark:text-slate-100 group-hover:text-amber-600 dark:group-hover:text-amber-300 transition-colors line-clamp-1">{h.title}</div>
                          {h.summary && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 line-clamp-1">{h.summary}</p>}
                        </div>
                        <div className="shrink-0 flex items-center gap-3 text-xs text-slate-400">
                          {h.primary_category && <span className="hidden sm:inline px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-300">{h.primary_category}</span>}
                          <span className="inline-flex items-center gap-0.5"><Icons.Eye className="w-3 h-3" /> {h.heat_score}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* ===== AI 日报归档：月/日索引，点某天深链到当日简报 ===== */}
          {activeTab === 'ai-daily' && (
            <section className="space-y-6">
              {dailyLoading && (
                <div className="flex flex-col items-center justify-center py-16 space-y-3">
                  <div className="w-8 h-8 border-2 border-slate-200 dark:border-slate-700 border-t-amber-500 rounded-full animate-spin"></div>
                  <p className="text-slate-400 text-sm">正在拉取日报索引...</p>
                </div>
              )}
              {!dailyLoading && !dailyIndex && (
                <div className="rounded-3xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-12 text-center text-slate-400 text-sm">日报索引暂时不可用</div>
              )}
              {!dailyLoading && dailyIndex?.months?.map((month) => {
                const open = !!openDailyMonths[month.month];
                return (
                  <div key={month.month} className="rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-5 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setOpenDailyMonths((prev) => ({ ...prev, [month.month]: !prev[month.month] }))}
                      className="w-full flex items-center justify-between gap-3 group"
                    >
                      <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100 group-hover:text-amber-600 dark:group-hover:text-amber-300 transition-colors">
                        <Icons.ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`} />
                        {month.label}
                      </h2>
                      <span className="text-xs font-semibold text-slate-400 px-2 py-0.5 rounded-full bg-slate-50 dark:bg-slate-900/50">{month.count} 期</span>
                    </button>
                    {open && (
                      <div className="mt-4 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                        {(month.days || []).map((day) => (
                          <a
                            key={day.path}
                            href={`#/ai-daily?p=${encodeURIComponent(day.path)}`}
                            className="text-center rounded-xl border border-slate-200 dark:border-slate-700 px-2 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:border-amber-300 dark:hover:border-amber-700 hover:text-amber-600 dark:hover:text-amber-300 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-colors"
                          >
                            {day.label}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {activeTab === 'articles' && (
            <>
          <section className="mb-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            <div className="rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-black text-slate-700 dark:text-slate-200 flex items-center gap-2"><Icons.Calendar className="w-4 h-4 text-amber-500" /> 最近 12 个月写作热力</h2>
                <span className="text-xs text-slate-400">越高越亮</span>
              </div>
              <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
                {archiveStats.months.map(([month, count]) => (
                  <div key={month} className="group">
                    <div className="h-16 rounded-2xl border border-amber-100 dark:border-slate-700 bg-amber-50 dark:bg-slate-900 overflow-hidden flex items-end" title={`${month}: ${count} 篇`}>
                      <div className="w-full bg-gradient-to-t from-amber-400 to-orange-200 dark:from-amber-500 dark:to-orange-400 transition-all" style={{ height: `${Math.max(14, (count / archiveStats.maxMonthCount) * 100)}%` }}></div>
                    </div>
                    <div className="mt-1 text-[10px] text-center text-slate-400 group-hover:text-amber-600 transition-colors">{month.slice(5)}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl bg-slate-900 dark:bg-slate-950 border border-slate-800 p-5 shadow-sm overflow-hidden relative">
              <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-amber-400/20 blur-2xl"></div>
              <h2 className="relative z-10 text-sm font-black text-white flex items-center gap-2 mb-4"><Icons.Clock className="w-4 h-4 text-amber-300" /> 最近更新</h2>
              <div className="relative z-10 space-y-3">
                {archiveStats.latest.map(article => (
                  <button key={article.id} onClick={() => navigate(`/articles/${article.id}`)} className="w-full text-left group">
                    <div className="text-xs font-bold text-slate-200 group-hover:text-amber-200 line-clamp-1 transition-colors">{article.title}</div>
                    <div className="text-[10px] text-slate-500 mt-1">{article.published_at ? new Date(article.published_at).toLocaleDateString('zh-CN') : '暂无日期'}</div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tags.map((tag) => {
              const tagArticles = groupedByTag[tag.name] || [];
              if (tagArticles.length === 0) return null;

              const color = getTagColor(tag.name);
              const isExpanded = expandedTags.has(tag.name);
              const displayArticles = isExpanded ? tagArticles : tagArticles.slice(0, MAX_PREVIEW);
              const hasMore = tagArticles.length > MAX_PREVIEW;

              return (
                <div
                  key={tag.id}
                  className={`rounded-2xl border ${color.border} ${color.bg} ${color.hoverBg} p-5 transition-all duration-300 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50`}
                >
                {/* 文件夹头部 */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <Icons.Folder className={`w-5 h-5 ${color.icon}`} />
                    <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200">{tag.name}</h2>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color.badge}`}>
                    {tagArticles.length} 篇
                  </span>
                </div>

                {/* 文章列表 */}
                <div className="space-y-1">
                  {displayArticles.map((article) => (
                    <div
                      key={article.id}
                      onClick={() => navigate(`/articles/${article.id}`)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/60 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800 cursor-pointer transition-all duration-200 group/item"
                    >
                      <Icons.FileText className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 flex-shrink-0 group-hover/item:text-slate-500 dark:group-hover/item:text-slate-400 transition-colors" />
                      <span className="flex-1 text-sm text-slate-600 dark:text-slate-300 truncate group-hover/item:text-slate-800 dark:group-hover/item:text-slate-100 transition-colors">
                        {article.title}
                      </span>
                      <div className="flex items-center gap-2.5 text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity">
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

                {/* 展开/收起按钮 */}
                {hasMore && (
                  <button
                    onClick={() => toggleExpand(tag.name)}
                    className={`mt-3 w-full text-center py-2 rounded-xl text-xs font-medium transition-all ${color.badge} hover:opacity-80`}
                  >
                    {isExpanded
                      ? `收起 ↑`
                      : `查看全部 ${tagArticles.length} 篇 →`}
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

      {/* Footer */}
      <footer className="mt-20 pt-8 border-t border-slate-100 dark:border-slate-800 text-center">
        <p className="text-slate-400 dark:text-slate-500 text-xs transition-colors">
          坚持写作是一种生活方式 · {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
};

export default Archives;
