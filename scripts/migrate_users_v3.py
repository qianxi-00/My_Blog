"""二期迁移脚本（2026-09-26）：users 加三列 + email_codes 表 + prompts 外键改指 users

用法：
    python3 migrate_users_v3.py <db_path>

内容：
1. users 表 ADD COLUMN：email_verified BOOLEAN / last_login_at DATETIME / password_changed_at DATETIME（缺才加）
2. email_codes 表：缺才建（含索引）
3. 回填：email_verified = 1（有邮箱的存量账号视为已验证，否则其本人无法用自助重置）
4. prompts 表重建：author_id 的 FK 从休眠的 admins.id 改指 users.id
   （一期迁移 admins→users 保 id，历史 author_id 值一一对应，数据零改动）
   建新表 → 拷数据 → 删旧表 → 改名 → 重建索引

安全设计：
- 幂等：每步先 PRAGMA table_info / sqlite_master 判断，重复执行无害
- prompts 重建前先删残留的 prompts_new；rebuild 失败时保留原表不动
- 迁移前请先停掉后端容器并做完整备份；脚本自身不做备份，调用方负责
"""

from __future__ import annotations

import re
import sqlite3
import sys

USERS_NEW_COLUMNS = [
    ("email_verified", "BOOLEAN NOT NULL DEFAULT 0"),
    ("last_login_at", "DATETIME"),
    ("password_changed_at", "DATETIME"),
]

EMAIL_CODES_TABLE_SQL = """
CREATE TABLE email_codes (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    email VARCHAR(100) NOT NULL,
    purpose VARCHAR(20) NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    used_at DATETIME,
    created_at DATETIME NOT NULL,
    ip VARCHAR(64)
)
"""

EMAIL_CODES_INDEXES = [
    "CREATE INDEX ix_email_codes_email ON email_codes (email)",
    "CREATE INDEX ix_email_codes_purpose ON email_codes (purpose)",
]


def table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone()
    return row is not None


def get_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def get_indexes(conn: sqlite3.Connection, table: str) -> list[tuple[str, str]]:
    rows = conn.execute(
        "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL",
        (table,),
    ).fetchall()
    return [(r[0], r[1]) for r in rows]


def main() -> None:
    if len(sys.argv) != 2:
        print("用法: python3 migrate_users_v3.py <db_path>")
        sys.exit(1)
    db_path = sys.argv[1]

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys=OFF")

    try:
        # ---------- 1) users 加三列 ----------
        if not table_exists(conn, "users"):
            print("!! users 表不存在，这不是本脚本该处理的库")
            sys.exit(1)

        cols = get_columns(conn, "users")
        added = []
        for name, ddl in USERS_NEW_COLUMNS:
            if name not in cols:
                conn.execute(f"ALTER TABLE users ADD COLUMN {name} {ddl}")
                added.append(name)
        conn.commit()
        print(f"[1/4] users 加列: {added or '无（已存在）'}")

        # ---------- 2) email_codes 建表 ----------
        if not table_exists(conn, "email_codes"):
            conn.execute(EMAIL_CODES_TABLE_SQL)
            for idx in EMAIL_CODES_INDEXES:
                conn.execute(idx)
            conn.commit()
            print("[2/4] email_codes 表已建（含 2 索引）")
        else:
            print("[2/4] email_codes 已存在，跳过")

        # ---------- 3) 回填 email_verified ----------
        cur = conn.execute(
            "UPDATE users SET email_verified = 1 WHERE email IS NOT NULL AND email != '' AND email_verified = 0"
        )
        conn.commit()
        print(f"[3/4] 回填 email_verified=1: {cur.rowcount} 行（有邮箱的存量账号视为已验证）")

        # ---------- 4) prompts 重建：FK admins.id -> users.id ----------
        row = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='prompts'"
        ).fetchone()
        create_sql = (row[0] if row else "") or ""

        if "REFERENCES" not in create_sql.upper():
            print("[4/4] prompts 无外键（空壳或异常），跳过重建")
        elif re.search(r"REFERENCES\s+users\s*\(\s*id\s*\)", create_sql, re.IGNORECASE):
            print("[4/4] prompts 外键已指 users，跳过重建")
        else:
            new_sql, n = re.subn(
                r"REFERENCES\s+admins\s*\(\s*id\s*\)",
                "REFERENCES users (id)",
                create_sql,
                flags=re.IGNORECASE,
            )
            if n != 1:
                print(f"!! prompts 建表语句里 admins 外键出现 {n} 次（预期 1），放弃重建")
                sys.exit(1)
            new_sql = re.sub(r"CREATE TABLE\s+prompts\b", "CREATE TABLE prompts_new", new_sql, count=1, flags=re.IGNORECASE)

            # 清理上次可能的残留
            conn.execute("DROP TABLE IF EXISTS prompts_new")

            indexes = get_indexes(conn, "prompts")
            conn.execute(new_sql)
            conn.execute("INSERT INTO prompts_new SELECT * FROM prompts")
            copied = conn.execute("SELECT COUNT(*) FROM prompts_new").fetchone()[0]
            source_count = conn.execute("SELECT COUNT(*) FROM prompts").fetchone()[0]
            if copied != source_count:
                print(f"!! 拷贝行数不一致（源 {source_count} / 新 {copied}），回滚 prompts_new")
                conn.execute("DROP TABLE prompts_new")
                sys.exit(1)
            conn.execute("DROP TABLE prompts")
            conn.execute("ALTER TABLE prompts_new RENAME TO prompts")
            for _, idx_sql in indexes:
                conn.execute(idx_sql)
            conn.commit()
            print(f"[4/4] prompts 重建完成：{copied} 行数据零改动，FK 已指 users.id，索引 {len(indexes)} 个已重建")

        # ---------- 终态核验 ----------
        final_cols = get_columns(conn, "users")
        missing = [n for n, _ in USERS_NEW_COLUMNS if n not in final_cols]
        fk = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='prompts'").fetchone()
        fk_sql = (fk[0] if fk else "") or ""
        ok_users = not missing
        ok_codes = table_exists(conn, "email_codes")
        ok_fk = bool(re.search(r"REFERENCES\s+users\s*\(\s*id\s*\)", fk_sql, re.IGNORECASE)) or "REFERENCES" not in fk_sql.upper()
        print(f"终态: users 列齐全={ok_users}  email_codes={ok_codes}  prompts FK 指 users={ok_fk}")
        if not (ok_users and ok_codes and ok_fk):
            sys.exit(1)
        print("MIGRATION OK")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
