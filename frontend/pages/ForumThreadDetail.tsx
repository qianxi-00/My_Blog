import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, Input } from '../components/Shared';
import { Icons } from '../components/Icons';
import MarkdownContent from '../components/MarkdownContent';
import {
  ForumPost,
  ForumThreadDetail,
  getForumThread,
  getForumThreadPosts,
  replyForumThread,
} from '../api/forum';
import { useToast } from '../components/Toast';

const formatDateTime = (v?: string | null) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const ForumThreadDetailPage: React.FC = () => {
  const { id } = useParams();
  const threadId = id ? Number(id) : NaN;

  const navigate = useNavigate();
  const { showToast } = useToast();

  const [thread, setThread] = useState<ForumThreadDetail | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [replyNickname, setReplyNickname] = useState('');
  const [replyEmail, setReplyEmail] = useState('');
  const [replyContent, setReplyContent] = useState('');
  const [replyHoneypot, setReplyHoneypot] = useState('');

  const [replyToFloor, setReplyToFloor] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const threadLocked = thread?.is_locked;

  const firstPost = posts.find(p => p.floor === 1);
  const replies = posts.filter(p => p.floor !== 1);

  const replyToPost = useMemo(() => {
    if (!replyToFloor) return null;
    return posts.find(p => p.floor === replyToFloor) || null;
  }, [posts, replyToFloor]);

  const fetchAll = async (targetPage: number) => {
    if (!Number.isFinite(threadId)) return;

    setLoading(true);
    try {
      const [t, p] = await Promise.all([
        getForumThread(threadId),
        getForumThreadPosts(threadId, { page: targetPage, page_size: 30 }),
      ]);

      setThread(t);
      setPosts(p.data);
      setTotal(p.total);
      setTotalPages(p.total_pages || 1);
      setPage(targetPage);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || '加载失败';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll(1);
    window.scrollTo(0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  const handleSubmitReply = async () => {
    if (!thread || threadLocked) return;
    const v = replyContent.trim();
    if (!v) {
      showToast('请输入回复内容', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await replyForumThread(thread.id, {
        content: v,
        nickname: replyNickname.trim() || undefined,
        email: replyEmail.trim() || undefined,
        parent_id: replyToPost?.id || undefined,
        honeypot: replyHoneypot.trim() || undefined,
      });

      showToast('回复成功', 'success');
      setReplyContent('');
      setReplyToFloor(null);
      await fetchAll(1);

      // 滚动到底部（延迟等渲染）
      setTimeout(() => {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      }, 150);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || '回复失败';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!Number.isFinite(threadId)) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="text-slate-500 dark:text-slate-400">无效的主题 ID</div>
        <div className="mt-6">
          <Link to="/forum"><Button>返回论坛</Button></Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center text-slate-400 dark:text-slate-500">
        <div className="animate-pulse">加载中...</div>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="text-slate-500 dark:text-slate-400">主题不存在或已删除</div>
        <div className="mt-6">
          <Link to="/forum"><Button>返回论坛</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col xl:flex-row gap-12">
        {/* Main */}
        <div className="flex-1 min-w-0">
          <div className="mb-6">
            <button
              onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/forum')}
              className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 group transition-colors"
            >
              <Icons.ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              返回
            </button>
          </div>

          <Card className="p-6 sm:p-8 mb-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Badge>{thread.category_name || '未分类'}</Badge>
                  {thread.is_locked && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-800">
                      已锁定
                    </span>
                  )}
                  {thread.is_pinned && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                      置顶
                    </span>
                  )}
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white leading-tight">
                  {thread.title}
                </h1>
                <div className="mt-3 text-sm text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-4">
                  <span className="flex items-center gap-1"><Icons.User className="w-4 h-4" /> {thread.author_nickname}</span>
                  <span className="flex items-center gap-1"><Icons.Clock className="w-4 h-4" /> {formatDateTime(thread.created_at)}</span>
                  <span className="flex items-center gap-1"><Icons.MessageCircle className="w-4 h-4" /> {thread.reply_count}</span>
                  <span className="flex items-center gap-1"><Icons.Eye className="w-4 h-4" /> {thread.view_count}</span>
                </div>
              </div>
              <div className="flex-shrink-0">
                <Link to="/forum/new"><Button size="sm" variant="outline" className="gap-1.5"><Icons.Send className="w-4 h-4" /> 发主题</Button></Link>
              </div>
            </div>
          </Card>

          {/* First post */}
          {firstPost && (
            <Card className="p-6 sm:p-8 mb-8">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="text-sm font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200">1</span>
                  楼主 · {firstPost.nickname}
                  {firstPost.is_admin_post && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">管理员</span>
                  )}
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500">{formatDateTime(firstPost.created_at)}</div>
              </div>
              <article className="prose prose-slate dark:prose-invert max-w-none">
                <MarkdownContent allowHtml={false} className="!max-w-none">{firstPost.content}</MarkdownContent>
              </article>
            </Card>
          )}

          {/* Replies */}
          <div className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <div className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Icons.MessageSquare className="w-5 h-5 text-primary-500" />
                回复
                <span className="text-sm font-medium text-slate-400 dark:text-slate-500">({total})</span>
              </div>
            </div>

            {replies.length === 0 ? (
              <Card className="p-8">
                <div className="text-center text-slate-500 dark:text-slate-400">
                  <div className="text-3xl opacity-60 mb-3">💬</div>
                  还没有回复，来抢个沙发吧。
                </div>
              </Card>
            ) : (
              <div className="space-y-4">
                {replies.map(p => (
                  <Card key={p.id} className="p-5">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200">
                          {p.floor}
                        </span>
                        {p.nickname}
                        {p.is_admin_post && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">管理员</span>
                        )}
                        {p.parent_id && (
                          <span className="text-xs text-slate-400 dark:text-slate-500">（回复某楼）</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-xs text-slate-400 dark:text-slate-500">{formatDateTime(p.created_at)}</div>
                        {!threadLocked && (
                          <button
                            onClick={() => {
                              setReplyToFloor(p.floor);
                              setTimeout(() => {
                                document.getElementById('reply-box')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }, 50);
                            }}
                            className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline"
                          >
                            回复
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="text-sm text-slate-700 dark:text-slate-200">
                      <MarkdownContent allowHtml={false} compact className="dark:text-slate-200">{p.content}</MarkdownContent>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-10">
                <button
                  onClick={() => fetchAll(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  <Icons.ArrowLeft className="w-5 h-5" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => fetchAll(p)}
                    className={`w-11 h-11 rounded-xl font-bold transition-all ${page === p
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xl scale-110'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm'
                      }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => fetchAll(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  <Icons.ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>

          {/* Reply box */}
          <div id="reply-box">
            <Card className="p-6 sm:p-8">
            <div className="flex items-center justify-between mb-4">
              <div className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Icons.Send className="w-5 h-5 text-primary-500" />
                发表回复
              </div>
              {threadLocked ? (
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">该主题已锁定</span>
              ) : replyToFloor ? (
                <button
                  onClick={() => setReplyToFloor(null)}
                  className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline"
                >
                  取消引用 #{replyToFloor}
                </button>
              ) : null}
            </div>

            {replyToFloor && (
              <div className="mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4">
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">引用楼层 #{replyToFloor}</div>
                <div className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3">
                  {replyToPost?.content || ''}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <div className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">昵称（选填）</div>
                <Input value={replyNickname} onChange={(e) => setReplyNickname(e.target.value)} placeholder="不填将生成 游客xxxx" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">邮箱（选填）</div>
                <Input value={replyEmail} onChange={(e) => setReplyEmail(e.target.value)} placeholder="name@example.com" />
              </div>
            </div>

            {/* Honeypot */}
            <div className="hidden">
              <Input value={replyHoneypot} onChange={(e) => setReplyHoneypot(e.target.value)} />
            </div>

            <textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl p-4 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-y min-h-[140px] dark:text-white transition-colors"
              placeholder={threadLocked ? '该主题已锁定，无法回复' : '写下你的回复（支持 Markdown，默认禁用 HTML）...'}
              disabled={threadLocked}
              maxLength={20000}
            />

            <div className="flex items-center justify-end gap-3 mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setReplyContent('');
                  setReplyToFloor(null);
                }}
                disabled={threadLocked}
              >
                清空
              </Button>
              <Button
                onClick={handleSubmitReply}
                disabled={threadLocked || submitting || !replyContent.trim()}
                className="gap-2"
              >
                <Icons.Send className="w-4 h-4" />
                {submitting ? '发送中...' : '发送回复'}
              </Button>
            </div>
            </Card>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="w-full xl:w-72 flex-shrink-0 space-y-6">
          <div className="sticky top-24 space-y-6">
            <Card className="p-5">
              <div className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Icons.TrendingUp className="w-4 h-4" /> 主题信息
              </div>
              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 dark:text-slate-500">分类</span>
                  <span className="font-bold">{thread.category_name || '未分类'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 dark:text-slate-500">回复</span>
                  <span className="font-bold">{thread.reply_count}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 dark:text-slate-500">浏览</span>
                  <span className="font-bold">{thread.view_count}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 dark:text-slate-500">最后回复</span>
                  <span className="font-bold">{formatDateTime(thread.last_post_at) || '—'}</span>
                </div>
              </div>
            </Card>

            <Card className="p-5 bg-gradient-to-br from-slate-50 to-primary-50 dark:from-slate-800 dark:to-primary-950/30">
              <div className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <Icons.Sparkles className="w-4 h-4 text-primary-500" /> 小提示
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-3 leading-relaxed">
                发帖/回帖会做最小限频（Redis 可用时生效），并使用蜜罐字段拦截机器人。
                Markdown 默认禁用 HTML。
              </div>
            </Card>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default ForumThreadDetailPage;
