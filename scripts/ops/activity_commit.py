#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""自动化运行台账：把博客的定时任务状态写成 ops/activity/YYYY-MM-DD.md 并提交到 GitHub。

设计见 AGENTS.md 四十九期 / ops/README.md。

用法：
  activity_commit.py --slot snapshot            # 站点快照（每天 10 个固定槽）
  activity_commit.py --slot pipeline            # 流水线归档检查（有新归档才提交）
  activity_commit.py --slot snapshot --dry-run  # 只打印，不写不提交
  activity_commit.py --slot snapshot --force    # 同一槽位重复运行也提交

约束：
  - 只写 ops/activity/*.md，绝不碰 docs/ backend/ frontend/（避免触发 CI / Pages）
  - 作者固定 Qian Xi <1964055097@qq.com>，与 GitHub 账号关联，贡献才会被计入
  - 推送失败不阻塞其它 cron：条目落到 state/pending/，下次补发
"""
from __future__ import annotations

import argparse
import json
import os
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
    ap.add_argument("--slot", choices=["snapshot", "pipeline"], required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    now = datetime.now()
    slot_key = now.strftime("%Y-%m-%dT%H:%M")
    state = load_state()

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
