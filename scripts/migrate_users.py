"""用户系统迁移脚本（一次性，2026-09-24）

把 admins 表的人员迁入新建的 users 表，文章作者外键改指 users，评论补 user_id。

用法：
    python3 migrate_users.py <db_path>

安全设计：
- users 表已存在 → 直接退出（防重复迁移）
- 整个迁移在单事务里，任何一步失败全回滚
- articles 表重建：建新表(改 FK/扩枚举/加 review_note) → 拷数据 → 删旧表 → 改名 → 重建索引
- comments 只做 ADD COLUMN + 回填（admin_id 指过的评论把 user_id 指到同 id 的 users 行）
- admins 表原样保留（休眠表，历史 FK 不断裂）
- 迁移前请先停掉后端容器并做完整备份（backup-db.sh）

脚本自身不做备份，调用方负责。
"""

from __future__ import annotations

import sqlite3
import sys

EXPECTED_ARTICLE_COLUMNS = {
    "id", "title", "slug", "summary", "content_md", "content_html", "toc_html",
    "cover_image", "category", "author_id", "status", "is_pinned", "scheduled_at",
    "published_at", "read_time_minutes", "view_count", "like_count", "comment_count",
    "created_at", "updated_at",
}

USERS_TABLE_SQL = """
CREATE TABLE users (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100),
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(500),
    bio TEXT,
    qq VARCHAR(20),
    wechat VARCHAR(50),
    github VARCHAR(100),
    bilibili VARCHAR(100),
    role VARCHAR(11) NOT NULL DEFAULT 'user',
    status VARCHAR(6) NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL,
    updated_at DATETIME,
    CHECK (role IN ('user', 'admin', 'super_admin')),
    CHECK (status IN ('active', 'banned'))
)
"""

USERS_INDEXES = [
    "CREATE UNIQUE INDEX ix_users_username ON users (username)",
    "CREATE UNIQUE INDEX ix_users_email ON users (email)",
    "CREATE INDEX ix_users_role ON users (role)",
]


def table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone()
    return row is not None


def get_create_sql(conn: sqlite3.Connection, table: str) -> str:
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    if not row or not row[0]:
        raise RuntimeError(f"拿不到 {table} 的建表语句")
    return row[0]


def get_indexes(conn: sqlite3.Connection, table: str) -> list[tuple[str, str]]:
    rows = conn.execute(
        "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL",
        (table,),
    ).fetchall()
    return [(name, sql) for name, sql in rows]


def column_names(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


def main() -> None:
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    db_path = sys.argv[1]

    conn = sqlite3.connect(db_path, isolation_level=None)  # 手动事务
    conn.execute("PRAGMA foreign_keys=OFF")

    if table_exists(conn, "users"):
        print("ABORT: users 表已存在，疑似已迁移过。若确认要重来，先人工处理 users 表。")
        sys.exit(1)

    actual_article_cols = column_names(conn, "articles")
    missing = EXPECTED_ARTICLE_COLUMNS - actual_article_cols
    if missing:
        print(f"ABORT: articles 表缺预期列 {sorted(missing)}，请先核对模型与库结构是否一致")
        sys.exit(1)

    admin_count = conn.execute("SELECT COUNT(*) FROM admins").fetchone()[0]
    article_count = conn.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
    comment_admin_bound = conn.execute(
        "SELECT COUNT(*) FROM comments WHERE admin_id IS NOT NULL"
    ).fetchone()[0]
    print(f"迁移前: admins={admin_count} articles={article_count} 管理员绑定评论={comment_admin_bound}")

    try:
        conn.execute("BEGIN")

        # 1) users 表
        conn.execute(USERS_TABLE_SQL)
        for sql in USERS_INDEXES:
            conn.execute(sql)

        # 2) admins -> users（保留 id；display_name 空的用 username 兜底；is_active 映射 status）
        conn.execute(
            """
            INSERT INTO users (
                id, username, email, password_hash, display_name, avatar_url, bio,
                qq, wechat, github, bilibili, role, status, created_at, updated_at
            )
            SELECT
                id, username, email, password_hash,
                COALESCE(display_name, username), avatar_url, bio,
                qq, wechat, github, bilibili, role,
                CASE WHEN is_active = 1 THEN 'active' ELSE 'banned' END,
                created_at, updated_at
            FROM admins
            """
        )
        copied = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if copied != admin_count:
            raise RuntimeError(f"users 拷贝数量不符: {copied} != {admin_count}")

        # 3) articles 重建：author_id FK 指向 users + status 枚举扩 5 值 + review_note
        original_sql = get_create_sql(conn, "articles")
        new_sql = original_sql.replace("articles_new", "articles")  # 防御性：先把可能的名字替换干净
        new_sql = new_sql.replace("CREATE TABLE articles ", "CREATE TABLE articles_new ", 1)
        if "CREATE TABLE articles_new" not in new_sql:
            # 兼容带引号/反引号的写法
            new_sql = original_sql.replace("CREATE TABLE `articles`", "CREATE TABLE `articles_new`", 1)
            if "articles_new" not in new_sql:
                raise RuntimeError("无法改写 articles 建表语句（表名写法不在预期内）")
        if "admins" not in new_sql:
            raise RuntimeError("articles 建表语句里没找到 admins 外键，结构超出预期")
        new_sql = new_sql.replace("admins", "users")
        # 活库的 status 列没有 CHECK 约束（老版建表），直接把列定义换成带 5 值 CHECK 的新写法
        old_col = "status VARCHAR(9) NOT NULL"
        new_col = (
            "status VARCHAR(14) NOT NULL CHECK (status IN "
            "('draft', 'pending_review', 'published', 'rejected', 'scheduled'))"
        )
        if old_col not in new_sql:
            raise RuntimeError(
                f"articles 建表语句里没找到预期的 status 列定义（找的是 {old_col!r}），请人工核对"
            )
        new_sql = new_sql.replace(old_col, new_col)
        # 追加 review_note 列：列定义必须在表约束段（PRIMARY KEY/FOREIGN KEY）之前
        if "PRIMARY KEY (id)" not in new_sql:
            raise RuntimeError("articles 建表语句里没找到 PRIMARY KEY (id) 约束段，结构超出预期")
        new_sql = new_sql.replace(
            "PRIMARY KEY (id)",
            "review_note VARCHAR(500), \n\tPRIMARY KEY (id)",
            1,
        )
        conn.execute(new_sql)

        copy_cols = sorted(EXPECTED_ARTICLE_COLUMNS)
        col_list = ", ".join(copy_cols)
        conn.execute(
            f"INSERT INTO articles_new ({col_list}) SELECT {col_list} FROM articles"
        )
        migrated = conn.execute("SELECT COUNT(*) FROM articles_new").fetchone()[0]
        if migrated != article_count:
            raise RuntimeError(f"articles 拷贝数量不符: {migrated} != {article_count}")

        conn.execute("DROP TABLE articles")
        conn.execute("ALTER TABLE articles_new RENAME TO articles")
        for name, sql in get_indexes(conn, "articles"):
            conn.execute(sql)

        # 4) comments 补 user_id 并回填管理员历史评论
        conn.execute("ALTER TABLE comments ADD COLUMN user_id INTEGER")
        conn.execute("UPDATE comments SET user_id = admin_id WHERE admin_id IS NOT NULL")
        conn.execute("CREATE INDEX IF NOT EXISTS ix_comments_user_id ON comments (user_id)")

        conn.execute("COMMIT")
    except Exception as e:
        conn.execute("ROLLBACK")
        print(f"MIGRATION FAILED, 已回滚: {e}")
        sys.exit(1)
    finally:
        conn.close()

    # 迁移后断言（重连只读校验）
    conn = sqlite3.connect(db_path)
    checks = {
        "users 行数": conn.execute("SELECT COUNT(*) FROM users").fetchone()[0],
        "users 角色分布": conn.execute(
            "SELECT role, COUNT(*) FROM users GROUP BY role"
        ).fetchall(),
        "articles 行数": conn.execute("SELECT COUNT(*) FROM articles").fetchone()[0],
        "articles 作者外键缺失数": conn.execute(
            "SELECT COUNT(*) FROM articles a LEFT JOIN users u ON a.author_id=u.id WHERE u.id IS NULL"
        ).fetchone()[0],
        "评论 user_id 回填数": conn.execute(
            "SELECT COUNT(*) FROM comments WHERE admin_id IS NOT NULL AND user_id = admin_id"
        ).fetchone()[0],
        "articles status 约束可用性": conn.execute(
            "SELECT COUNT(*) FROM articles WHERE status IN ('draft','pending_review','published','rejected','scheduled')"
        ).fetchone()[0],
        "sqlite_sequence(users)": conn.execute(
            "SELECT seq FROM sqlite_sequence WHERE name='users'"
        ).fetchone(),
    }
    conn.close()
    for key, value in checks.items():
        print(f"  {key}: {value}")
    if checks["articles 作者外键缺失数"] != 0:
        print("ABORT: 校验发现文章作者外键悬空，请人工介入（事务未回滚发生在 COMMIT 后）")
        sys.exit(1)
    print("MIGRATION OK")


if __name__ == "__main__":
    main()
