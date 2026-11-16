#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""自动化运行台账：把博客的定时任务状态写成 ops/activity/YYYY-MM-DD.md 并提交到 GitHub。

设计见 AGENTS.md 四十九期 / ops/README.md。

用法：
  activity_commit.py --slot auto                # 动态计划：每天 10–20 次，随机时刻（cron 每 10 分钟）
  activity_commit.py --slot auto --dry-run      # 只打印今日计划与下一条条目
  activity_commit.py --slot snapshot            # 手动补一次站点快照
  activity_commit.py --slot pipeline            # 手动检查流水线归档（有新归档才提交）

约束：
  - 只写 ops/activity/*.md，绝不碰 docs/ backend/ frontend/（避免触发 CI / Pages）
  - 作者固定 Qian Xi <1964055097@qq.com>，与 GitHub 账号关联，贡献才会被计入
  - 推送失败不阻塞其它 cron：条目落到 state/pending/，下次补发
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

REPO_DIR = Path("/data/blog/ops-repo")
DB_PATH = Path("/data/blog/data/blog.db")
AI_INDEX = Path("/var/www/blog/dist/data/ai-daily-index.json")
AI_DIR = Path("/var/www/blog/dist/data/ai-daily")
PIPELINE_LOG = Path("/data/blog/logs/hotspot-pipeline-cron.log")
QUEUE_DIR = Path("/data/blog/data/pipeline/hotspot_queue")
BACKUP_DIR = Path("/data/blog/backups")
NAS_STATUS = Path("/data/blog/nas-export/status.json")
STATE_DIR = Path("/data/blog/state")
STATE_FILE = STATE_DIR / "activity-state.json"
PENDING_DIR = STATE_DIR / "activity-pending"

# ---------- 动态计划（五十四期） ----------
# 每天随机 10–20 次提交，时刻落在 08:00–23:50 的 10 分钟网格上，相邻至少 20 分钟。
# 计划按日期生成并存进 state，全天稳定；服务器重启不会打乱当天节奏。
PLAN_START_MIN = 8 * 60          # 08:00
PLAN_END_MIN = 23 * 60 + 50      # 23:50
PLAN_GRID_MIN = 10
PLAN_MIN_GAP_MIN = 20
PLAN_MIN_COMMITS = 10
PLAN_MAX_COMMITS = 20
PLAN_STALE_MIN = 90              # 逾期超过 90 分钟不再补发，避免批量刷屏

GIT_REMOTE = "git@github.com:qianxi-00/My_Blog.git"
DEPLOY_KEY = "/root/.ssh/github_my_blog_deploy_repo"
AUTHOR_NAME = "Qian Xi"
AUTHOR_EMAIL = "1964055097@qq.com"


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)


def sh(cmd: list[str], cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env["GIT_SSH_COMMAND"] = (
        f"ssh -i {DEPLOY_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o ConnectTimeout=20"
    )
    p = subprocess.run(cmd, cwd=str(cwd) if cwd else None, env=env,
                       capture_output=True, text=True)
    if check and p.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)} -> {p.returncode}\n{p.stdout}\n{p.stderr}")
    return p


# ---------- 数据采集 ----------

def db_stats() -> dict:
    import sqlite3

    uri = f"file:{DB_PATH}?mode=ro"
    con = sqlite3.connect(uri, uri=True, timeout=10)
    try:
        cur = con.cursor()
        today = datetime.now().strftime("%Y-%m-%d")
        out = {}
        out["articles"] = cur.execute("select count(*) from articles where status='published'").fetchone()[0]
        out["articles_today"] = cur.execute(
            "select count(*) from articles where status='published' and date(published_at)=?", (today,)
        ).fetchone()[0]
        out["hot_topics"] = cur.execute("select count(*) from hot_topics").fetchone()[0]
        out["prompts"] = cur.execute("select count(*) from prompts where status='approved'").fetchone()[0]
        out["comments"] = cur.execute("select count(*) from comments").fetchone()[0]
        row = cur.execute(
            "select total_views, unique_visitors, article_views, new_comments, ai_api_calls from daily_stats where date=?",
            (today,),
        ).fetchone()
        out["views_today"] = row[0] if row else 0
        out["uv_today"] = row[1] if row else 0
        out["ai_calls_today"] = row[4] if row else 0
        return out
    finally:
        con.close()


def aihot_stats() -> dict:
    out = {"updated": "-", "total": 0, "files": 0}
    try:
        data = json.loads(AI_INDEX.read_text(encoding="utf-8"))
        out["updated"] = (data.get("updatedAt") or "-").replace("T", " ")[:19]
        out["total"] = int(data.get("total") or 0)
    except Exception as e:  # noqa: BLE001
        out["updated"] = f"读取失败({e.__class__.__name__})"
    try:
        out["files"] = len(list(AI_DIR.glob("*")))
    except Exception:  # noqa: BLE001
        pass
    return out


def pipeline_stats() -> dict:
    out = {"run_id": "-", "status": "-", "archive": 0, "failed": 0}
    for name in ("archive", "failed"):
        try:
            out[name] = len(list((QUEUE_DIR / name).glob("*")))
        except Exception:  # noqa: BLE001
            pass
    try:
        text = PIPELINE_LOG.read_text(encoding="utf-8", errors="ignore")
        hits = re.findall(r'\{"run_id".*?\}', text, flags=re.S)
        if hits:
            last = json.loads(hits[-1])
            out["run_id"] = last.get("run_id", "-")
            out["status"] = last.get("status", "-")
    except Exception:  # noqa: BLE001
        pass
    return out


def backup_stats() -> dict:
    out = {"db": "-", "db_mtime": "-", "nas": "-"}
    try:
        dbs = sorted(BACKUP_DIR.glob("*.db"), key=lambda p: p.stat().st_mtime, reverse=True)
        if dbs:
            out["db"] = dbs[0].name
            out["db_mtime"] = datetime.fromtimestamp(dbs[0].stat().st_mtime).strftime("%m-%d %H:%M")
    except Exception:  # noqa: BLE001
        pass
    try:
        st = json.loads(NAS_STATUS.read_text(encoding="utf-8"))
        out["nas"] = str(st.get("generated_at", "-"))[:16].replace("T", " ")
    except Exception:  # noqa: BLE001
        pass
    return out


def new_archives(last_count: int) -> list[str]:
    """返回比 last_count 新增的归档文件名。"""
    try:
        names = sorted(p.name for p in (QUEUE_DIR / "archive").glob("*"))
    except Exception:  # noqa: BLE001
        return []
    if last_count <= 0 or last_count > len(names):
        return []
    return names[last_count:]


def _hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _ceil_grid(minutes: int) -> int:
    return ((minutes + PLAN_GRID_MIN - 1) // PLAN_GRID_MIN) * PLAN_GRID_MIN


def committed_today(date: str) -> int:
    """数当天台账里已有的快照条目，用来扣掉已经提交的次数。"""
    f = REPO_DIR / "ops" / "activity" / f"{date}.md"
    if not f.exists():
        return 0
    try:
        text = f.read_text(encoding="utf-8")
    except OSError:
        return 0
    return len(re.findall(r"^## \d{2}:\d{2}", text, re.M))


def generate_plan(date: str, now: datetime, already: int = 0) -> dict:
    """按日期生成当天计划：全天 10–20 次，扣掉已提交的次数后安排剩余时刻。"""
    rng = random.Random(f"activity-plan-{date}")
    start = _ceil_grid(max(PLAN_START_MIN, now.hour * 60 + now.minute))
    slots = list(range(start, PLAN_END_MIN + 1, PLAN_GRID_MIN))
    day_target = rng.randint(PLAN_MIN_COMMITS, PLAN_MAX_COMMITS)
    remaining = max(0, min(day_target - already, len(slots)))
    if remaining == 0:
        return {"date": date, "target": day_target, "already": already, "times": [], "fired": []}
    picked: list[int] = []
    for _ in range(300):
        picked = sorted(rng.sample(slots, remaining))
        if all(b - a >= PLAN_MIN_GAP_MIN for a, b in zip(picked, picked[1:])):
            break
    else:
        step = max(PLAN_MIN_GAP_MIN, (PLAN_END_MIN - start) // max(remaining, 1))
        picked = sorted({min(start + i * step, PLAN_END_MIN) for i in range(remaining)})
    return {"date": date, "target": day_target, "already": already,
            "times": [_hhmm(m) for m in picked], "fired": []}


def _minutes_since(date: str, slot: str, now: datetime) -> int:
    due = datetime.strptime(f"{date} {slot}", "%Y-%m-%d %H:%M")
    return int((now - due).total_seconds() // 60)


def run_auto(dry_run: bool) -> int:
    """动态模式：每次 cron 触发时，若有到点未提交的槽位就提交一条。"""
    now = datetime.now()
    date = now.strftime("%Y-%m-%d")
    state = load_state()
    plan = state.get("plan") or {}

    if plan.get("date") != date:
        if not dry_run:
            ensure_repo()
            sync_repo()
        already = committed_today(date)
        plan = generate_plan(date, now, already)
        if not dry_run:
            state["plan"] = plan
            save_state(state)
        log(
            f"生成 {date} 计划：全天目标 {plan['target']} 次，已提交 {already} 次，"
            f"剩余 {len(plan['times'])} 个时刻：{', '.join(plan['times']) or '无'}"
        )

    fired = set(plan.get("fired") or [])
    now_hm = now.strftime("%H:%M")
    pending = [x for x in plan.get("times", []) if x not in fired and x <= now_hm]
    if not pending:
        return 0

    stale = [x for x in pending if _minutes_since(date, x, now) > PLAN_STALE_MIN]
    fresh = [x for x in pending if x not in stale]

    if dry_run:
        log(f"[dry-run] 已提交 {len(fired)}/{plan['target']}；到期 stale={stale} fresh={fresh}")
        if not fresh:
            return 0
        slot = fresh[-1]
        db = db_stats(); ai = aihot_stats(); pipe = pipeline_stats(); bk = backup_stats()
        log(f"[dry-run] 将补提交 {slot}：\n{render_entry('snapshot', db, ai, pipe, bk, [])}")
        return 0

    if stale:
        plan["fired"] = sorted(fired | set(stale))
        state["plan"] = plan
        save_state(state)
        log(f"跳过过期槽位 {len(stale)} 个：{', '.join(stale)}")
    if not fresh:
        return 0
    slot = fresh[-1]

    db = db_stats()
    ai = aihot_stats()
    pipe = pipeline_stats()
    bk = backup_stats()
    entry = render_entry("snapshot", db, ai, pipe, bk, [])
    msg = f"chore(activity): {now.strftime('%Y-%m-%d %H:%M')} 站点快照"

    ensure_repo()
    if not commit_and_push(entry, msg, dry_run=False):
        save_pending(entry, msg)
        return 1
    flush_pending()

    plan["fired"] = sorted(set(plan.get("fired") or []) | {slot})
    state["plan"] = plan
    state["last_snapshot"] = f"{date}T{slot}"
    state["archive_count"] = pipe["archive"]
    state["ai_updated"] = ai["updated"]
    save_state(state)
    log(f"完成（今日已提交 {plan.get('already', 0) + len(plan['fired'])}/{plan['target']}）")
    return 0


# ---------- 状态 ----------

def load_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}


def save_state(state: dict) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(STATE_FILE)


# ---------- 文本 ----------

def render_entry(slot: str, db: dict, ai: dict, pipe: dict, bk: dict, archived: list[str]) -> str:
    now = datetime.now()
    if slot == "snapshot":
        title = f"## {now.strftime('%H:%M')} 站点快照"
        lines = [
            f"- 内容：文章 {db['articles']}（今日 +{db['articles_today']}）｜热点 {db['hot_topics']}｜"
            f"提示词 {db['prompts']}｜评论 {db['comments']}",
            f"- AIHOT：索引更新于 {ai['updated']}，ai-daily {ai['files']} 个文件（索引 total={ai['total']}）",
            f"- 流水线：最近 run `{pipe['run_id']}` 状态 {pipe['status']}；队列 archive {pipe['archive']} 轮 / failed {pipe['failed']}",
            f"- 备份：{bk['db']}（{bk['db_mtime']}）；NAS 导出 {bk['nas']}",
            f"- 访问：今日 PV {db['views_today']} / UV {db['uv_today']}；AI 调用 {db['ai_calls_today']} 次",
        ]
    else:
        title = f"## {now.strftime('%H:%M')} 流水线归档"
        items = "、".join(archived[:6]) + ("…" if len(archived) > 6 else "")
        lines = [
            f"- 新增归档 {len(archived)} 篇：{items}",
            f"- 队列 archive {pipe['archive']} 轮 / failed {pipe['failed']}；最近 run `{pipe['run_id']}` 状态 {pipe['status']}",
            f"- 文章 {db['articles']}（今日 +{db['articles_today']}）｜热点 {db['hot_topics']}",
        ]
    return title + "\n" + "\n".join(lines) + "\n"


def append_to_day_file(path: Path, entry: str) -> None:
    today = datetime.now().strftime("%Y-%m-%d")
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            f"# {today} 自动化运行台账\n\n> 当日提交 0 次｜最后更新 -\n\n", encoding="utf-8"
        )
    text = path.read_text(encoding="utf-8")
    text = text.rstrip("\n") + "\n\n" + entry
    n = text.count("\n## ")
    text = re.sub(r"> 当日提交 \d+ 次｜最后更新 [^\n]*",
                  f"> 当日提交 {n} 次｜最后更新 {datetime.now().strftime('%H:%M')}",
                  text, count=1)
    path.write_text(text, encoding="utf-8")


# ---------- Git ----------

def ensure_repo() -> None:
    if (REPO_DIR / ".git").exists():
        return
    log(f"克隆 {GIT_REMOTE} → {REPO_DIR}")
    REPO_DIR.parent.mkdir(parents=True, exist_ok=True)
    sh(["git", "clone", "--quiet", GIT_REMOTE, str(REPO_DIR)])
    sh(["git", "-C", str(REPO_DIR), "config", "user.name", AUTHOR_NAME])
    sh(["git", "-C", str(REPO_DIR), "config", "user.email", AUTHOR_EMAIL])


def sync_repo() -> None:
    sh(["git", "-C", str(REPO_DIR), "fetch", "--quiet", "origin", "master"])
    sh(["git", "-C", str(REPO_DIR), "reset", "--hard", "origin/master"])


def commit_and_push(entry: str, msg: str, dry_run: bool) -> bool:
    today = datetime.now().strftime("%Y-%m-%d")
    rel = f"ops/activity/{today}.md"
    day_file = REPO_DIR / rel

    for attempt in range(1, 4):
        sync_repo()
        append_to_day_file(day_file, entry)
        if dry_run:
            log(f"[dry-run] 将写入 {rel}：\n{entry}")
            return True
        sh(["git", "-C", str(REPO_DIR), "add", rel])
        env_name = AUTHOR_NAME
        env_mail = AUTHOR_EMAIL
        now = datetime.now().astimezone().strftime("%Y-%m-%dT%H:%M:%S%z")
        e = os.environ.copy()
        e.update({
            "GIT_AUTHOR_NAME": env_name, "GIT_AUTHOR_EMAIL": env_mail,
            "GIT_COMMITTER_NAME": env_name, "GIT_COMMITTER_EMAIL": env_mail,
            "GIT_AUTHOR_DATE": now, "GIT_COMMITTER_DATE": now,
        })
        p = subprocess.run(["git", "-C", str(REPO_DIR), "commit", "-m", msg],
                           env=e, capture_output=True, text=True)
        if p.returncode != 0:
            log(f"commit 失败：{p.stderr.strip()[:300]}")
            return False
        push_env = e.copy()
        push_env["GIT_SSH_COMMAND"] = (
            f"ssh -i {DEPLOY_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o ConnectTimeout=20"
        )
        pp = subprocess.run(["git", "-C", str(REPO_DIR), "push", "origin", "HEAD:master"],
                            env=push_env, capture_output=True, text=True)
        if pp.returncode == 0:
            log(f"已推送：{msg}")
            return True
        log(f"push 失败（第 {attempt}/3 次）：{pp.stderr.strip()[:300]}")
        time.sleep(3 * attempt)
    return False


def save_pending(entry: str, msg: str) -> None:
    PENDING_DIR.mkdir(parents=True, exist_ok=True)
    p = PENDING_DIR / f"{datetime.now().strftime('%Y%m%d-%H%M%S')}.md"
    p.write_text(f"<!-- {msg} -->\n{entry}", encoding="utf-8")
    log(f"推送失败，条目已存 {p}")


def flush_pending() -> None:
    if not PENDING_DIR.exists():
        return
    files = sorted(PENDING_DIR.glob("*.md"))
    for f in files:
        text = f.read_text(encoding="utf-8")
        m = re.match(r"<!-- (.*?) -->\n", text)
        msg = m.group(1) if m else "chore(activity): 补发"
        entry = text[m.end():] if m else text
        if commit_and_push(entry, msg, dry_run=False):
            f.unlink()


# ---------- main ----------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slot", choices=["auto", "snapshot", "pipeline"], required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    now = datetime.now()
    slot_key = now.strftime("%Y-%m-%dT%H:%M")
    state = load_state()

    if args.slot == "auto":
        return run_auto(args.dry_run)

    if args.slot == "snapshot" and not args.force and state.get("last_snapshot") == slot_key:
        log(f"槽位 {slot_key} 已提交过，跳过")
        return 0

    db = db_stats()
    ai = aihot_stats()
    pipe = pipeline_stats()
    bk = backup_stats()

    if args.slot == "pipeline":
        archived = new_archives(int(state.get("archive_count", 0)))
        if not archived and not args.force:
            log("没有新的流水线归档，跳过")
            return 0
        entry = render_entry("pipeline", db, ai, pipe, bk, archived)
        msg = f"chore(activity): {now.strftime('%Y-%m-%d %H:%M')} 流水线归档 {len(archived)} 篇"
    else:
        entry = render_entry("snapshot", db, ai, pipe, bk, [])
        msg = f"chore(activity): {now.strftime('%Y-%m-%d %H:%M')} 站点快照"

    if args.dry_run:
        log(f"[dry-run] slot={args.slot}\n{entry}")
        return 0

    ensure_repo()
    ok = commit_and_push(entry, msg, dry_run=False)
    if not ok:
        save_pending(entry, msg)
        return 1

    flush_pending()
    state["last_snapshot" if args.slot == "snapshot" else "last_pipeline"] = slot_key
    state["archive_count"] = pipe["archive"]
    state["ai_updated"] = ai["updated"]
    save_state(state)
    log("完成")
    return 0


if __name__ == "__main__":
    sys.exit(main())
