#!/usr/bin/env python3
"""
Agent 技能自检（零依赖，只用标准库）

为什么需要这个：
skill 是对 HTTP 路由的薄封装，**参数名/路径名写错不会抛异常**，只会让后端静默忽略、
返回错误的结果，AI 拿着错数据继续编答案。2026-09-30 就这样出过三个静默 bug：
  - search_articles 传 keyword=，后端其实叫 search   → 搜索永远返回全量
  - manage_article 传 content=，后端其实叫 content_md → 建文 422 / 改文静默丢失
所以这里把「路径存在吗」「参数名对吗」固化成可重复执行的检查。

跑法：
    python3 backend/scripts/selfcheck_skills.py
只读，不写任何数据；不需要连数据库（不触发 lifespan）。
"""

from __future__ import annotations

import asyncio
import inspect
import re
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple
from unittest.mock import patch
from urllib.parse import urlparse

# 让 `app.` 开头的导入可用。
# 脚本可能在 backend/ 下（本地跑），也可能被 docker cp 到 /tmp 再执行（服务器上跑），
# 所以不能只靠 __file__ 推——先按 __file__ 推，推不出来再退回容器里的 /app。
BACKEND = Path(__file__).resolve().parent.parent
if not (BACKEND / "app" / "main.py").exists():
    for candidate in (Path("/app"), Path.cwd()):
        if (candidate / "app" / "main.py").exists():
            BACKEND = candidate
            break
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
print(f"后端根目录: {BACKEND}")

import app.main  # noqa: F401,E402  导入全部路由 -> 全部模型，mapper 才能配好
from fastapi.routing import APIRoute  # noqa: E402
from app.services.agent import registry  # noqa: E402
from app.services.agent.skills import (  # noqa: E402
    admins, articles, batch, comments, forum, hotspots,
    prompts, settings, stats, subscribers, users,
)

SKILL_MODULES = [
    stats, articles, comments, hotspots, prompts,
    subscribers, settings, admins, users, forum, batch,
]


# ------------------------------------------------------------------ #
#  采集 FastAPI 路由表
# ------------------------------------------------------------------ #

def _collect_routes() -> Tuple[Dict[Tuple[str, str], APIRoute], Set[str]]:
    """返回 ({(method, path): route}, 所有 path 集合)。

    路径里的 {param} 归一化成 {}，方便和 skill 里的 f-string 拼出来的具体路径比对。
    """
    table: Dict[Tuple[str, str], APIRoute] = {}
    paths: Set[str] = set()

    def normalize(path: str) -> str:
        return re.sub(r"\{[^}]+\}", "{}", path)

    for route in app.main.app.routes:
        if not isinstance(route, APIRoute):
            continue
        norm = normalize(route.path)
        paths.add(norm)
        for method in route.methods:
            table[(method, norm)] = route
    return table, paths


ROUTES, ROUTE_PATHS = _collect_routes()


def _path_matcher(template: str):
    """把 '/api/v1/articles/{article_id}' 编成正则，用来 fullmatch 一个具体路径。

    直接拿具体路径去和模板字符串比是不行的：skill 里 f-string 拼出来的是
    '/articles/1'，而路由表里是 '/articles/{article_id}'。
    """
    pattern = re.sub(r"\{[^}]*\}", r"[^/]+", re.escape(template).replace(r"\{", "{").replace(r"\}", "}"))
    # re.escape 会把 {} 也转义了，上面再换回来
    return re.compile(f"^{pattern}$")


MATCHERS = [(method, tpl, _path_matcher(tpl)) for (method, tpl) in ROUTES]


def resolve_route(method: str, final_path: str):
    """返回匹配该 (method, path) 的路由模板，找不到返回 None。"""
    for m, tpl, rx in MATCHERS:
        if m == method and rx.match(final_path):
            return tpl
    return None


def route_query_params(template: str):
    """取某路由模板声明的 query 参数名。"""
    route = ROUTES.get(("GET", template)) or next(
        (r for (m, t), r in ROUTES.items() if t == template), None
    )
    if route is None:
        return set()
    names: Set[str] = set()
    for p in inspect.signature(route.endpoint).parameters.values():
        default = p.default
        if default is not inspect.Parameter.empty:
            names.add(p.name)
            alias = getattr(default, "alias", None)
            if alias:
                names.add(alias)
    return names


def skill_final_url(path: str) -> str:
    """复用 call_api 的真实拼接逻辑，把 skill 里的相对路径变成最终 URL 的 path 部分。

    直接自己拼前缀会漏掉 normalize_path 的行为（去尾斜杠、拼 /api/v1），那样测的就不是
    线上真实发生的事了。
    """
    from app.services.agent.tools.call_api import normalize_path
    return urlparse(normalize_path(path)).path


# ------------------------------------------------------------------ #
#  捕获 skill 发出的 HTTP 调用
# ------------------------------------------------------------------ #

class CallRecorder:
    """替换 call_api，记录调用并返回可控结果。"""

    def __init__(self) -> None:
        self.calls: List[Dict[str, Any]] = []
        self.next_result: Dict[str, Any] = {"ok": True, "status_code": 200, "data": {}}

    async def __call__(self, token: str, method: str, path: str,
                       body: Any = None, query_params: Any = None, **kw: Any) -> Dict[str, Any]:
        self.calls.append({
            "method": method, "path": path,
            "body": body, "query_params": query_params or {},
        })
        return dict(self.next_result)

    @property
    def last(self) -> Dict[str, Any]:
        if not self.calls:
            raise AssertionError(
                "skill 没有发起任何 HTTP 调用（多数情况是参数校验把它拦下了，"
                "这种用例请改用 TestRequiredArgs）"
            )
        return self.calls[-1]


async def run_skill(module, name: str, args: Dict[str, Any]) -> Tuple[Any, CallRecorder]:
    """在 mock 掉 call_api 的情况下跑一次 skill，返回 (结果, 调用记录器)。"""
    rec = CallRecorder()
    with patch.object(module, "call_api", rec):
        result = await module.execute(name, args, "TEST_TOKEN", None)
    return result, rec


def normalize_path_literal(p: str) -> str:
    """把 '/articles/{id}/publish' 里的 {id} 之类换成 {}；f-string 拼出来的保持原样。"""
    return re.sub(r"\{[^}]*\}", "{}", p)


# ------------------------------------------------------------------ #
#  1. schema 与 handler 必须一一对应
# ------------------------------------------------------------------ #

class TestSchemaHandlerParity(unittest.TestCase):
    def test_every_skill_has_a_handler(self):
        """每个 SKILL_SCHEMAS 里声明的技能，都必须能在 execute 里被分派到。"""
        for module in SKILL_MODULES:
            declared = {s["function"]["name"] for s in module.SKILL_SCHEMAS}
            names = getattr(module, "SKILL_NAMES", None)
            self.assertIsNotNone(
                names, f"{module.__name__} 有 schema 但没有 SKILL_NAMES"
            )
            missing = declared - set(names)
            self.assertFalse(
                missing, f"{module.__name__} 这些技能没进 SKILL_NAMES: {missing}"
            )
            # 反向：声明了名字却没有 schema，模型看不到，等于没加
            orphan = set(names) - declared
            self.assertFalse(
                orphan, f"{module.__name__} 这些技能在 SKILL_NAMES 里但没有 schema: {orphan}"
            )

    def test_registry_knows_all_modules(self):
        """registry 必须能构建出全部技能，且没有重名。"""
        tools = registry.build_all_tools("super_admin")
        names = [t["function"]["name"] for t in tools]
        dupes = {n for n in names if names.count(n) > 1}
        self.assertFalse(dupes, f"工具有重名（模型会挑不清）: {dupes}")
        self.assertEqual(
            len(names), len(set(names)), "build_all_tools 产生了重复工具名"
        )
        # 每个模块声明的技能都应该在 super_admin 的工具表里
        expected = {n for m in SKILL_MODULES for n in m.SKILL_NAMES}
        self.assertTrue(
            expected <= set(names),
            f"这些技能没进工具表: {sorted(expected - set(names))}",
        )

    def test_execute_sql_not_exposed_to_normal_admin(self):
        """execute_sql 只对 super_admin 可见。"""
        admin_names = {t["function"]["name"] for t in registry.build_all_tools("admin")}
        super_names = {t["function"]["name"] for t in registry.build_all_tools("super_admin")}
        self.assertNotIn("execute_sql", admin_names)
        self.assertIn("execute_sql", super_names)

    def test_execute_sql_blocked_at_dispatch(self):
        """即使模型硬传 execute_sql，普通 admin 也要在分派层被拦住（双保险）。"""
        from unittest.mock import AsyncMock
        from app.services.agent.tools import execute_sql as es

        async def run():
            boom = AsyncMock(side_effect=AssertionError("execute_sql 不该被执行到"))
            with patch.object(es, "execute", boom):
                return await registry.dispatch(
                    "execute_sql", {"sql": "SELECT 1"}, "t", None, role="admin"
                )

        result, kind = asyncio.run(run())
        self.assertFalse(result.get("ok"), "普通 admin 不该能执行 execute_sql")
        self.assertIn("execute_sql", str(result.get("error")))
        self.assertEqual(kind, "tool")


# ------------------------------------------------------------------ #
#  2. skill 里用到的路径必须真实存在
# ------------------------------------------------------------------ #

# 逐个技能手工列出「会打到的路由」，用于验证路径没写错。
# 格式：(模块, 技能名, 参数, 期望 method, 期望 path)
PATH_CASES: List[Tuple[Any, str, Dict[str, Any], str, str]] = [
    # articles
    (articles, "search_articles", {"page": 1}, "GET", "/api/v1/articles/"),
    (articles, "get_article_detail", {"article_id": 1}, "GET", "/api/v1/articles/{article_id}"),
    (articles, "list_pending_articles", {}, "GET", "/api/v1/articles/review/pending"),
    (articles, "review_article", {"article_id": 1, "action": "approve"},
     "PUT", "/api/v1/articles/{article_id}/review"),
    (articles, "generate_article_summary", {"content_md": "x"},
     "POST", "/api/v1/articles/generate-summary"),
    (articles, "fix_article_read_time", {}, "POST", "/api/v1/articles/fix-read-time"),
    (articles, "get_categories", {}, "GET", "/api/v1/articles/categories"),
    (articles, "get_tags", {}, "GET", "/api/v1/articles/tags"),
    (articles, "get_archives", {}, "GET", "/api/v1/articles/archives"),
    # hotspots
    (hotspots, "list_hotspots", {}, "GET", "/api/v1/hotspots"),
    (hotspots, "get_hotspot_meta", {}, "GET", "/api/v1/hotspots/meta"),
    (hotspots, "get_featured_hotspots", {}, "GET", "/api/v1/hotspots/featured"),
    (hotspots, "get_hotspot_detail", {"hotspot_id": 1}, "GET", "/api/v1/hotspots/{hotspot_id}"),
    (hotspots, "get_hotspot_sources", {"hotspot_id": 1}, "GET", "/api/v1/hotspots/{hotspot_id}/sources"),
    (hotspots, "list_fetch_jobs", {}, "GET", "/api/v1/hotspots/tasks/list"),
    (hotspots, "run_hotspot_fetch", {}, "POST", "/api/v1/hotspots/tasks/run"),
    # forum
    (forum, "get_forum_categories", {}, "GET", "/api/v1/forum/categories"),
    (forum, "list_forum_threads", {}, "GET", "/api/v1/forum/threads"),
    (forum, "get_forum_thread", {"thread_id": 1}, "GET", "/api/v1/forum/threads/{thread_id}"),
    (forum, "list_forum_posts", {"thread_id": 1}, "GET", "/api/v1/forum/threads/{thread_id}/posts"),
    (forum, "manage_forum_post", {"action": "delete", "post_id": 1}, "DELETE", "/api/v1/forum/posts/{post_id}"),
    # users / admins（注意 subscribe.py 是无 prefix 的 router）
    (users, "get_user_stats", {}, "GET", "/api/v1/admins/users/stats"),
    (users, "list_users", {}, "GET", "/api/v1/admins/users"),
    (users, "get_user_detail", {"user_id": 1}, "GET", "/api/v1/admins/users/{user_id}"),
    (users, "manage_user", {"action": "ban", "user_id": 1}, "PUT", "/api/v1/admins/users/{user_id}/ban"),
    (users, "manage_user", {"action": "set_email", "user_id": 1, "email": "a@b.c"},
     "PUT", "/api/v1/admins/users/{user_id}/email"),
    (subscribers, "get_subscriber_stats", {}, "GET", "/api/v1/subscribers/count"),
    (subscribers, "list_subscribers", {}, "GET", "/api/v1/subscribers"),
    (subscribers, "manage_subscriber", {"action": "freeze", "subscriber_id": 1},
     "PUT", "/api/v1/subscribers/{subscriber_id}/freeze"),
    (subscribers, "freeze_subscribers", {"frozen": True}, "PUT", "/api/v1/subscribers/freeze-all"),
    # 十期 B3 导读卡
    (articles, "generate_article_intro", {"article_id": 1},
     "POST", "/api/v1/articles/{article_id}/generate-intro"),
]


class TestRoutesExist(unittest.TestCase):
    def test_paths_exist(self):
        """skill 打的路径必须在 FastAPI 路由表里真实存在。

        路径要过一遍 call_api 真实的 normalize_path（拼 /api/v1、去尾斜杠），
        否则测的不是线上真实发生的事。
        """
        missing = []
        for module, name, args, _method, _expected in PATH_CASES:
            _, rec = asyncio.run(run_skill(module, name, args))
            if not rec.calls:
                continue  # 参数校验拦下了，另有测试覆盖
            call = rec.last
            final = skill_final_url(call["path"])
            if resolve_route(call["method"], final) is None:
                missing.append(
                    f"{module.__name__.split('.')[-1]}.{name}: "
                    f"{call['method']} {final} 在路由表里找不到"
                )
        self.assertFalse(
            missing, "以下 skill 路径在后端不存在:\n  " + "\n  ".join(missing)
        )

    def test_query_params_are_declared(self):
        """skill 传的 query 参数名必须被该路由声明，否则会被 FastAPI 静默忽略。

        这就是 search_articles 那个 bug 的自动化检测点。
        """
        problems = []
        cases = [
            (articles, "search_articles", {"keyword": "x", "category": "y",
                                           "tag": "z", "sort_by": "views", "page": 1}),
            (hotspots, "list_hotspots", {"keyword": "x", "tag": "t", "category": "c",
                                         "source": "s", "date_from": "2026-01-01", "sort": "latest"}),
            (forum, "list_forum_threads", {"keyword": "x", "category_id": 1}),
            (users, "list_users", {"keyword": "x", "role": "user", "status": "active",
                                   "sort": "created_at"}),
        ]
        for module, name, args in cases:
            _, rec = asyncio.run(run_skill(module, name, args))
            if not rec.calls:
                continue
            call = rec.last
            template = resolve_route(call["method"], skill_final_url(call["path"]))
            if template is None:
                continue
            declared = route_query_params(template)
            for key in call["query_params"]:
                if key not in declared:
                    problems.append(
                        f"{name}: query 参数 '{key}' 不在 {template} 的声明里"
                        f"（会被静默忽略）"
                    )
        self.assertFalse(problems, "以下 query 参数名对不上:\n  " + "\n  ".join(problems))


# ------------------------------------------------------------------ #
#  3. 关键字段映射（这次修的 bug 逐条锁死）
# ------------------------------------------------------------------ #

class TestFieldMapping(unittest.TestCase):
    def test_search_articles_uses_search_not_keyword(self):
        """回归：后端参数叫 search，skill 对外叫 keyword，落地必须是 search。"""
        _, rec = asyncio.run(run_skill(articles, "search_articles", {"keyword": "RAG"}))
        self.assertEqual(rec.last["query_params"].get("search"), "RAG")
        self.assertNotIn("keyword", rec.last["query_params"])

    def test_create_article_uses_content_md(self):
        """回归：正文字段是 content_md，用 content 会被 Pydantic 丢掉。"""
        _, rec = asyncio.run(run_skill(articles, "manage_article", {
            "action": "create", "title": "T", "content_md": "# 正文",
        }))
        body = rec.last["body"]
        self.assertEqual(body.get("content_md"), "# 正文")
        self.assertNotIn("content", body)

    def test_update_article_uses_content_md(self):
        _, rec = asyncio.run(run_skill(articles, "manage_article", {
            "action": "update", "article_id": 1, "content_md": "新正文",
        }))
        self.assertEqual(rec.last["body"].get("content_md"), "新正文")

    def test_article_body_whitelist_covers_backend_fields(self):
        """建文/改文的白名单要带上后端支持、但很容易漏的字段。

        skill 的白名单是「有值才往 body 里放」，所以每个字段都得真的传值再断言。
        create 要求 title/content_md/slug 齐全。
        """
        payload = {
            "title": "T", "slug": "s", "content_md": "C",
            "summary": "S", "cover_image": "http://x/y.png",
            "is_pinned": True, "scheduled_at": "2026-01-01T00:00:00",
            "ai_intro_adopted": True,
        }
        optional_fields = ("summary", "cover_image", "is_pinned", "scheduled_at", "slug", "ai_intro_adopted")
        for action in ("create", "update"):
            args = dict(payload)
            args["action"] = action
            if action == "update":
                args["article_id"] = 1
            _, rec = asyncio.run(run_skill(articles, "manage_article", args))
            body = rec.last["body"]
            for field in optional_fields:
                self.assertIn(field, body, f"{action} 的白名单漏了 {field}（传了值却没进 body）")

    def test_hotspot_fields_match_backend_schema(self):
        """回归：热点的字段名是 topic_date / analysis_md / primary_category / tag_names。"""
        _, rec = asyncio.run(run_skill(hotspots, "manage_hotspot", {
            "action": "create", "title": "T", "slug": "s", "date": "2026-01-01",
            "analysis_md": "正文", "category": "AI", "tags": ["x"],
        }))
        body = rec.last["body"]
        self.assertEqual(body.get("topic_date"), "2026-01-01")
        self.assertEqual(body.get("analysis_md"), "正文")
        self.assertEqual(body.get("primary_category"), "AI")
        self.assertEqual(body.get("tag_names"), ["x"])
        for wrong in ("date", "analysis", "category", "tags"):
            self.assertNotIn(wrong, body, f"不该出现后端不认识的字段 {wrong}")

    def test_hotspot_query_uses_backend_names(self):
        _, rec = asyncio.run(run_skill(hotspots, "list_hotspots", {
            "keyword": "AI", "date_from": "2026-01-01", "category": "c",
        }))
        q = rec.last["query_params"]
        self.assertEqual(q.get("search"), "AI")
        self.assertEqual(q.get("topic_date_from"), "2026-01-01")
        self.assertEqual(q.get("primary_category"), "c")

    def test_forum_keyword_maps_to_q(self):
        _, rec = asyncio.run(run_skill(forum, "list_forum_threads", {"keyword": "x"}))
        self.assertEqual(rec.last["query_params"].get("q"), "x")

    def test_users_keyword_maps_to_search(self):
        _, rec = asyncio.run(run_skill(users, "list_users", {"keyword": "x"}))
        self.assertEqual(rec.last["query_params"].get("search"), "x")


# ------------------------------------------------------------------ #
#  4. 必填参数必须在发请求前就被拦下
# ------------------------------------------------------------------ #

class TestRequiredArgs(unittest.TestCase):
    def _expect_rejected(self, module, name, args, must_mention: str = ""):
        result, rec = asyncio.run(run_skill(module, name, args))
        self.assertFalse(
            rec.calls,
            f"{module.__name__}.{name} 缺必填参数时仍然发了请求（会变成 422）",
        )
        self.assertFalse(result.get("ok", False), f"{name} 应该返回 ok=False")
        if must_mention:
            self.assertIn(must_mention, str(result.get("error", "")), "报错要说清缺什么")

    def test_article_create_requires_title_and_content(self):
        """两个必填项要分开测：一次只缺一个，才能定位到底是哪个校验生效。"""
        self._expect_rejected(articles, "manage_article",
                              {"action": "create"}, "title")
        self._expect_rejected(articles, "manage_article",
                              {"action": "create", "title": "T"}, "content_md")

    def test_article_update_requires_id(self):
        self._expect_rejected(articles, "manage_article",
                              {"action": "update", "title": "x"}, "article_id")

    def test_hotspot_create_requires_all_three(self):
        self._expect_rejected(hotspots, "manage_hotspot", {"action": "create", "title": "t"}, "slug")

    def test_batch_requires_ids(self):
        self._expect_rejected(batch, "batch_review_comments", {}, "comment_ids")
        self._expect_rejected(batch, "batch_update_articles", {}, "文章 ID")

    def test_user_actions_require_their_own_field(self):
        self._expect_rejected(users, "manage_user",
                              {"action": "set_role", "user_id": 1}, "role")
        self._expect_rejected(users, "manage_user",
                              {"action": "set_email", "user_id": 1}, "email")

    def test_forum_move_requires_category(self):
        self._expect_rejected(forum, "manage_forum_thread",
                              {"action": "move", "thread_id": 1}, "category_id")

    def test_unknown_action_is_rejected(self):
        self._expect_rejected(articles, "manage_article",
                              {"action": "炸掉站点", "article_id": 1}, "未知")
        self._expect_rejected(users, "manage_user",
                              {"action": "变成超管", "user_id": 1}, "未知")


# ------------------------------------------------------------------ #
#  5. 安全底线
# ------------------------------------------------------------------ #

class TestSafety(unittest.TestCase):
    def test_token_never_in_body(self):
        """token 只能走 Authorization 头，绝不能出现在 body / query 里。"""
        for module, name, args in [
            (articles, "manage_article", {"action": "delete", "article_id": 1}),
            (comments, "manage_comment", {"action": "delete", "comment_id": 1}),
            (users, "manage_user", {"action": "ban", "user_id": 1}),
        ]:
            _, rec = asyncio.run(run_skill(module, name, args))
            blob = f"{rec.last['body']}{rec.last['query_params']}{rec.last['path']}"
            self.assertNotIn("TEST_TOKEN", blob, f"{name} 把 token 泄进了请求体")

    def test_delete_batches_flagged_in_schema(self):
        """批量删除是不可逆操作，schema 里必须有明确警告。"""
        batch_schemas = {s["function"]["name"]: s["function"] for s in batch.SKILL_SCHEMAS}
        desc = batch_schemas["batch_update_articles"]["description"]
        self.assertIn("delete_ids", desc)
        self.assertTrue("不可逆" in desc or "确认" in desc, "批量删除要有不可逆提示")

    def test_find_inactive_is_read_only(self):
        """「查找不活跃订阅者」只能看，不能顺手改。"""
        _, rec = asyncio.run(run_skill(
            subscribers, "find_inactive_subscribers", {"older_than_days": 9999}
        ))
        for call in rec.calls:
            self.assertEqual(call["method"], "GET", "这个技能不允许写操作")


# ------------------------------------------------------------------ #
#  6. 看板娘工具
# ------------------------------------------------------------------ #

class TestAragTools(unittest.TestCase):
    def test_nav_tools_registered(self):
        from app.services.arag_agent import _build_tools
        names = {t.name for t in _build_tools()}
        for expected in ("list_blog_topics", "list_latest_articles",
                         "list_popular_articles", "get_site_facts"):
            self.assertIn(expected, names, f"看板娘缺少导航工具 {expected}")

    def test_arag_tools_are_read_only(self):
        """看板娘面向访客，工具不能有写能力。

        用读文件源码而不是 inspect.getsource：工具是被 @tool 装饰过的，
        反射拿到的 func 是包装对象，getsource 会抛 TypeError。
        """
        import app.services.arag_agent as mod
        src = Path(mod.__file__).read_text(encoding="utf-8")
        body = src.split("def _build_tools")[1]
        for hit in ("db.add(", "db.delete(", "await db.commit"):
            self.assertNotIn(
                hit, body,
                f"_build_tools 里出现 {hit} —— 看板娘的工具必须只读",
            )
        # 确认写操作确实只出现在别处（比如旧的 chat 接口），不是混进来的
        from app.services.arag_agent import _build_tools
        names = {t.name for t in _build_tools()}
        self.assertNotIn("delete_article", names)
        self.assertNotIn("update_settings", names)


if __name__ == "__main__":
    print(f"已加载路由 {len(ROUTE_PATHS)} 条，技能 {len(registry.build_all_tools('super_admin'))} 个\n")
    unittest.main(verbosity=2, exit=False)