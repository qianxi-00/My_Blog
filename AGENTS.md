# 博客维护约定

维护对象：千禧的个人博客 DevLog / My_Blog，域名 `https://blog.qianxi7988.me`。
本文件写的是 2026-09-24 只读核对 + 当日迁移 + **2026-09-26 用户系统上线**后的真实状态。每条线上结论都有当次命令输出；没打过的接口不要写成"已验证"。

仓库：`qianxi-00/My_Blog`，默认分支 `master`。本地克隆 `C:\Users\QianXi\.dsh-ops\blog\My_Blog`。
当前生产镜像 **`qianxi-blog:users3`**（构建源 = 仓库提交 `c508593` 的 `git archive HEAD backend` 导出树，产物与推送代码逐文件 sha256 对齐；前端产物 `assets/index-C5lckPql.js`）。上一个可用版本 `users2`（提交 `47102c5`）保留作回退。

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
| 后端容器 | `qianxi-blog`，镜像 **`qianxi-blog:users3`**（2026-09-28 三级权限 + 邮箱认证版；构建源 = 仓库提交 `c508593` 的 `git archive HEAD backend` 导出树，产物与推送代码已逐文件 sha256 对齐）。768MB/**2CPU**，uvicorn **`--workers 2 --proxy-headers --forwarded-allow-ips='*'`**（GIL 决定单进程最多 1 核，多核必须多 worker；docker run 时用 CMD 覆盖参数，镜像 CMD 仍是单 worker 供 HF 兼容；**proxy-headers 不能漏，限流靠它拿真实访客 IP**）。`--restart unless-stopped`，`blog-net`，只绑 `127.0.0.1:8000`。**回退镜像**：`qianxi-blog:users2`（用户系统一期）→ `qianxi-blog:users1` → `qianxi-blog:arag2`（并发优化版）→ `qianxi-blog:20260924`（Poro 版） |
| 并发优化（2026-09-24 实测） | SQLite 已切 **WAL**（`app/core/database.py` 连接事件监听自动 PRAGMA：journal_mode=WAL + synchronous=NORMAL + busy_timeout=5000；写不再锁全库）；aiosqlite 方言默认 NullPool，已显式 `AsyncAdaptedQueuePool`（pool_size=20/max_overflow=30）；bcrypt 登录验证改 `asyncio.to_thread`（原先同步 100-300ms 阻塞事件循环）；A-RAG SSE 有并发护栏 `asyncio.Semaphore(8)`/worker（双 worker 合计 16 路，超限回友好提示）。压测（ab，同机 2 核）：1worker/1CPU=42.7rps/750ms → 2worker/2CPU=70.6rps/453ms（直连）、62.6rps/0 错误（公网 HTTPS 全路径）。单请求 ~15ms；剩余上限是宿主机 2 核本身，再要翻倍只能升配或加只读副本 |
| A-RAG 聊天 | 公开问答已从 PoroRagAgent 伪流式升级为 **LangChain create_agent**（2026-09-24）。新端点 `POST /api/v1/chat/message/agentic`（SSE，事件 `reasoning`/`tool_start`/`tool_result`/`text`/`done`/`error`）。实现：`backend/app/services/arag_agent.py`（5 个检索工具：文章/证据块/读窗口/读全文/热点；工具**各自开独立 DB 会话**，因为 ToolNode 并行调用工具）；`ReasoningChatOpenAI` 子类负责把网关 `delta.reasoning_content` 透传进事件流（langgraph v3 messages 通道不透传，靠子类回调直推 SSE 队列）。旧端点 `/chat/message/stream`（Poro 伪流式）保留给桌宠主动气泡。前端 `DesktopPet` 聊天面板 + `AgentProcessStrip` 渲染思考/工具芯片。**nginx /api/ 已加 `proxy_buffering off`（SSE 依赖，别删）**。注意 `openai` SDK 已升 `3.19.2`（langchain-openai 1.6.6 要求 >=2.45） |
| 数据库 | 容器挂载 `/data/blog/data:/data`，库文件 `/data/blog/data/blog.db`。2026-09-24 从 HF 导出（integrity ok：23 文 / 567 热点 / 558 published） |
| 前端 | `/var/www/blog/dist`，本地构建后分批上传；uploads 53 个文件齐全。当前产物 `assets/index-C5lckPql.js`（3,018,521 B，2026-09-28 含用户与权限独立页 + 忘记密码 + 邮箱绑定 + 我的提示词）。旧主包仍留在 dist（避免强缓存用户白屏）。Live2D 是死代码未上传（见已知缺口 1），站点宠物为静态 DesktopPet |
| nginx | `/etc/nginx/sites-available/blog`（独立文件，别动 `new-api` 那份）。80 端口有 `^~ /.well-known/acme-challenge/` 例外 + 301，**别删这个例外，删了证书续不了** |
| 证书 | Let's Encrypt `blog.qianxi7988.me`，2026-12-23 到期，certbot 自动续期（webroot=`/var/www/blog/dist`） |
| 运行配置 | `/data/blog/runtime.env`（600 root-only）：JWT_SECRET_KEY（强随机，2026-09-24 轮换）、`LLM_MODEL_CHAIN=grok-4.7`、`REDIS_ENABLED=false`、NewAPI 地址 `http://new-api:3000/v1` |
| 备份 | `/data/blog/backup-db.sh`，cron 每天 04:30 热备份到 `/data/blog/backups/`，保留 14 天 |
| AI 日报 | `/data/blog/scripts/fetch_ai_daily.py` + `/etc/cron.d/blog-ai-daily`：每 30 分钟拉 `aihot.virxact.com` 公共 API，直写 `/var/www/blog/dist/data/`（2026-09-24 恢复；此前新旧站都冻结在 2026-07-09，因为旧机制随 openclaw/旧服务器消亡）。日志 `/data/blog/logs/ai-daily-fetch.log` |
| 提示词同步 | `/data/blog/scripts/sync_coze_prompts.py` + `/etc/cron.d/blog-coze-sync`：每天 05:10 拉扣子（api.coze.cn）机器人人设提示词 → 公开投稿接口入库 `pending`，后台审核后上架。PAT 在 `/data/blog/coze.env`（600 root-only，**最长 30 天过期**，过期后日志记 401，去扣子后台重新生成覆盖该文件即恢复）。状态 `/data/blog/coze-sync-state.json`（title+sha256 去重），日志 `/data/blog/logs/coze-prompt-sync.log` |
| AI 网络桥 | docker 网络 `blog-net`：`qianxi-blog` 与 `new-api` 都挂在上面。**拆掉这个网络 AI 就断**（new-api 只发布在宿主机 `127.0.0.1:3001`，容器从 `172.17.0.1` 够不到，2026-09-24 实测 Connection refused） |

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
- **回退**：`bash /data/blog/rollback_users.sh /data/blog/backups/pre-user-system-20260926-204453`（停容器 → 还原迁移前库 → 起 `qianxi-blog:arag2`）。
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

## AI 链路（2026-09-24 实测通过）

- 模型：`grok-4.7`，单模型，**没有配置 fallback**（`LLM_MODEL_CHAIN=grok-4.7`，`CPA_API_KEY` 未设）。
- 凭据：NewAPI token `blog-devlog`（id 383，分组 `svip`，`model_limits='grok-4.7'`）。**分组必须是 svip/vip**——grok-4.7 只在 CPA 渠道 3/16 上，渠道分组是 `svip,vip`，token 在 `default` 分组会 503 `model_not_found`（实测踩过）。
- 验证记录：公网 `POST /api/v1/chat/prompt-lab` 与 `POST /api/v1/chat/message` 均 200 真实补全；NewAPI logs 表确认记账（token_name=blog-devlog）。A-RAG 公网 SSE 实测：142 reasoning + 3 tool_start/result + 45 text + 1 done，引用带真实站内链接。
- admin 独享的 agent SSE 与文章摘要接口没有管理员口令未实测；agent 与摘要共用 `llm_router`（openai SDK 3.x 接口兼容，prompt-lab 已验证同 SDK）。
- 不要改 NewAPI 渠道/超时；不要动 `43.128.75.66` 与 `43.160.202.101` 上的 CPA、Grok 注册机、openclaw。

## 源码与仓库（2026-09-26 对齐后）

- GitHub `qianxi-00/My_Blog` master `47102c5` = 官方唯一维护源，**已与生产一致**（后端镜像是从该提交 `git archive HEAD backend` 导出树构建的，逐文件 sha256 核过）。
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

## 已知缺口（截至 2026-09-26）

1. **Live2D 是死代码**：`Live2DWaifu` 未被任何组件 import（2026-09-24 核实，主 bundle 无 live2d 引用），站点宠物是静态 `DesktopPet`（codex-pets 海报，已上传生效）。`frontend/public/live2d/` 144MB 不需要上传，可择机从源码里删。
2. **141 个内联图已排查定案（2026-09-24）**：5 个从图床 My_image 找回并安装（字节级验证 200）；**136 个永久丢失**——仓库 public、本地 dist、旧 Worker 部署包、COS 桶（545 对象）、My_image（1370 文件）、过期旧服务器 8.148.252.27 全部查尽，原件只存在于已消亡的 HF 容器层与旧服务器。是否清除 analysis_md 里的死引用，等千禧拍板。
3. 管理端新上传的图片会写进容器层（`/app/uploads`），nginx 不服务它——与旧架构行为一致（旧站上传也只活在 HF 容器里）， durable 副本仍要靠 `frontend/public/uploads` 进 Git。
4. `chat.py` 的 `get_session_history` 没有路由装饰器，`GET /chat/session/{id}/history` 不是现行接口。
5. APScheduler 在依赖里但无调度器；热点抓取 `trigger_mode` 写死 manual。
6. **提示词同步已恢复（2026-09-24）**：扣子 → 投稿接口 cron 每日同步（见现行生产表）。当前扣子账号只有 2 个机器人：AI面试知识库（1879 字人设，已投递待审核）、海龟汤主理人（人设为空，逻辑在工作流里、API 不暴露工作流节点提示词，同步不了）。6 月那批 14 条电商提示词的源机器人已不在账号里。
7. **旧数据遗留（非本次引入）**：`chat_messages` 有 5 行指向已删除的 `chat_sessions`（198 条消息中），`PRAGMA foreign_key_check` 会报出来（前几行就是它，不是用户系统的锅——那部分 0 悬空）。外键未强制，线上无影响，清理与否等拍板。

## 验证（改完必跑）

```powershell
Invoke-WebRequest https://blog.qianxi7988.me/api/v1/articles?page=1&page_size=1 -UseBasicParsing
Invoke-WebRequest https://blog.qianxi7988.me/api/v1/hotspots?page=1&page_size=1 -UseBasicParsing
ssh root@101.32.163.17 "curl -fsS http://127.0.0.1:8000/health"
# AI 冒烟（烧少量 quota）：
Invoke-WebRequest https://blog.qianxi7988.me/api/v1/chat/prompt-lab -Method Post -ContentType 'application/json' -Body '{"prompt":"回复OK","max_tokens":16}'
```

预期：文章 23、热点 558、health `{"status":"healthy"}`、prompt-lab 返回 200 带 result。

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
6. 择机删除前端死代码 live2d 目录（144MB，无引用）。
