# 博客维护约定

维护对象：千禧的个人博客 DevLog / My_Blog，域名 `https://blog.qianxi7988.me`。
本文件写的是 2026-09-24 只读核对 + 当日迁移后的真实状态。每条线上结论都有当次命令输出；没打过的接口不要写成"已验证"。

仓库：`qianxi-00/My_Blog`，默认分支 `master`。本地克隆 `C:\Users\QianXi\.dsh-ops\blog\My_Blog`。
核对时 HEAD 是 `0af3aa9`（2026-07-09，`fix: render hotspot markdown details`）。

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
| 后端容器 | `qianxi-blog`，镜像 `qianxi-blog:arag2`（2026-09-24 晚并发优化版，构建上下文 `/data/blog/arag-src`）。768MB/**2CPU**，uvicorn **`--workers 2`**（GIL 决定单进程最多 1 核，多核必须多 worker；docker run 时用 CMD 覆盖参数，镜像 CMD 仍是单 worker 供 HF 兼容）。`--restart unless-stopped`，`blog-net`，只绑 `127.0.0.1:8000`。**回退镜像**：`qianxi-blog:20260924`（Poro 版） |
| 并发优化（2026-09-24 实测） | SQLite 已切 **WAL**（`app/core/database.py` 连接事件监听自动 PRAGMA：journal_mode=WAL + synchronous=NORMAL + busy_timeout=5000；写不再锁全库）；aiosqlite 方言默认 NullPool，已显式 `AsyncAdaptedQueuePool`（pool_size=20/max_overflow=30）；bcrypt 登录验证改 `asyncio.to_thread`（原先同步 100-300ms 阻塞事件循环）；A-RAG SSE 有并发护栏 `asyncio.Semaphore(8)`/worker（双 worker 合计 16 路，超限回友好提示）。压测（ab，同机 2 核）：1worker/1CPU=42.7rps/750ms → 2worker/2CPU=70.6rps/453ms（直连）、62.6rps/0 错误（公网 HTTPS 全路径）。单请求 ~15ms；剩余上限是宿主机 2 核本身，再要翻倍只能升配或加只读副本 |
| A-RAG 聊天 | 公开问答已从 PoroRagAgent 伪流式升级为 **LangChain create_agent**（2026-09-24）。新端点 `POST /api/v1/chat/message/agentic`（SSE，事件 `reasoning`/`tool_start`/`tool_result`/`text`/`done`/`error`）。实现：`backend/app/services/arag_agent.py`（5 个检索工具：文章/证据块/读窗口/读全文/热点；工具**各自开独立 DB 会话**，因为 ToolNode 并行调用工具）；`ReasoningChatOpenAI` 子类负责把网关 `delta.reasoning_content` 透传进事件流（langgraph v3 messages 通道不透传，靠子类回调直推 SSE 队列）。旧端点 `/chat/message/stream`（Poro 伪流式）保留给桌宠主动气泡。前端 `DesktopPet` 聊天面板 + `AgentProcessStrip` 渲染思考/工具芯片。**nginx /api/ 已加 `proxy_buffering off`（SSE 依赖，别删）**。注意 `openai` SDK 已升 `3.19.2`（langchain-openai 1.6.6 要求 >=2.45） |
| 数据库 | 容器挂载 `/data/blog/data:/data`，库文件 `/data/blog/data/blog.db`。2026-09-24 从 HF 导出（integrity ok：23 文 / 567 热点 / 558 published） |
| 前端 | `/var/www/blog/dist`，本地构建后分批上传；uploads 53 个文件齐全。Live2D 是死代码未上传（见已知缺口 1），站点宠物为静态 DesktopPet |
| nginx | `/etc/nginx/sites-available/blog`（独立文件，别动 `new-api` 那份）。80 端口有 `^~ /.well-known/acme-challenge/` 例外 + 301，**别删这个例外，删了证书续不了** |
| 证书 | Let's Encrypt `blog.qianxi7988.me`，2026-12-23 到期，certbot 自动续期（webroot=`/var/www/blog/dist`） |
| 运行配置 | `/data/blog/runtime.env`（600 root-only）：JWT_SECRET_KEY（强随机，2026-09-24 轮换）、`LLM_MODEL_CHAIN=grok-4.7`、`REDIS_ENABLED=false`、NewAPI 地址 `http://new-api:3000/v1` |
| 备份 | `/data/blog/backup-db.sh`，cron 每天 04:30 热备份到 `/data/blog/backups/`，保留 14 天 |
| AI 日报 | `/data/blog/scripts/fetch_ai_daily.py` + `/etc/cron.d/blog-ai-daily`：每 30 分钟拉 `aihot.virxact.com` 公共 API，直写 `/var/www/blog/dist/data/`（2026-09-24 恢复；此前新旧站都冻结在 2026-07-09，因为旧机制随 openclaw/旧服务器消亡）。日志 `/data/blog/logs/ai-daily-fetch.log` |
| 提示词同步 | `/data/blog/scripts/sync_coze_prompts.py` + `/etc/cron.d/blog-coze-sync`：每天 05:10 拉扣子（api.coze.cn）机器人人设提示词 → 公开投稿接口入库 `pending`，后台审核后上架。PAT 在 `/data/blog/coze.env`（600 root-only，**最长 30 天过期**，过期后日志记 401，去扣子后台重新生成覆盖该文件即恢复）。状态 `/data/blog/coze-sync-state.json`（title+sha256 去重），日志 `/data/blog/logs/coze-prompt-sync.log` |
| AI 网络桥 | docker 网络 `blog-net`：`qianxi-blog` 与 `new-api` 都挂在上面。**拆掉这个网络 AI 就断**（new-api 只发布在宿主机 `127.0.0.1:3001`，容器从 `172.17.0.1` 够不到，2026-09-24 实测 Connection refused） |

**回退方式**：把 Cloudflare DNS 的 A 记录改回橙云代理（原 Worker 路由 `blog.qianxi7988.me/* → qianxi-blog-site` 仍在）。数据回退需注意：新站库从导出后一直在被写（浏览量、聊天），回退前先备份新库。

## AI 链路（2026-09-24 实测通过）

- 模型：`grok-4.7`，单模型，**没有配置 fallback**（`LLM_MODEL_CHAIN=grok-4.7`，`CPA_API_KEY` 未设）。
- 凭据：NewAPI token `blog-devlog`（id 383，分组 `svip`，`model_limits='grok-4.7'`）。**分组必须是 svip/vip**——grok-4.7 只在 CPA 渠道 3/16 上，渠道分组是 `svip,vip`，token 在 `default` 分组会 503 `model_not_found`（实测踩过）。
- 验证记录：公网 `POST /api/v1/chat/prompt-lab` 与 `POST /api/v1/chat/message` 均 200 真实补全；NewAPI logs 表确认记账（token_name=blog-devlog）。A-RAG 公网 SSE 实测：142 reasoning + 3 tool_start/result + 45 text + 1 done，引用带真实站内链接。
- admin 独享的 agent SSE 与文章摘要接口没有管理员口令未实测；agent 与摘要共用 `llm_router`（openai SDK 3.x 接口兼容，prompt-lab 已验证同 SDK）。
- 不要改 NewAPI 渠道/超时；不要动 `43.128.75.66` 与 `43.160.202.101` 上的 CPA、Grok 注册机、openclaw。

## 源码三份，不要混

- GitHub `qianxi-00/My_Blog`（master `0af3aa9`，2026-07-09）= 官方唯一维护源，**落后于线上**。
- HF 实际运行版（2026-07-19，`efd1ddef`）比仓库多：`app/services/llm_router.py`、`.dockerignore`，改了 `config.py`、`openai_service.py`、`agent/service.py`、`hot_topic_service.py`、`Dockerfile`；种子分片 12 片→13 片（全部哈希不同，多 `db_part_12.dat`）。**这些还没回仓库**（待办）。
- 新服务器跑的就是这份 7/19 版（`/data/blog/src` = 本地 `C:\Users\QianXi\.dsh-ops\blog\img-app\app` 同源）。
- 前端注意：新站 dist（1790B index）与旧 Worker assets（1955B index）**字节不同，未核对是否同源**——旧 assets 可能含未回仓的前端改动。

## 数据事实

| 副本 | 状态 |
|---|---|
| `/data/blog/data/blog.db`（新生产库） | 2026-09-24 从 HF 导出 ≈ 种子库（HF 免费层 `/data` 临时，重建即重置）。23 文 / 567 热点（558 published + 9 draft） |
| `/data/blog-live-20260924.db` | 同上的导出原件（留档） |
| `/data/blog.db` | 旧快照（2026-07-09，532 热点），不要拿来当生产 |
| 仓库 `backend/data/db_part_0..12.dat` | 13 片，种子完整集 |
| 文章 Markdown `/data/My_Blog/Articles` | 11 个 .md，与线上 23 篇文章**不是同一批**，别混 |

## 已知缺口（截至 2026-09-24）

1. **Live2D 是死代码**：`Live2DWaifu` 未被任何组件 import（2026-09-24 核实，主 bundle 无 live2d 引用），站点宠物是静态 `DesktopPet`（codex-pets 海报，已上传生效）。`frontend/public/live2d/` 144MB 不需要上传，可择机从源码里删。
2. **141 个内联图已排查定案（2026-09-24）**：5 个从图床 My_image 找回并安装（字节级验证 200）；**136 个永久丢失**——仓库 public、本地 dist、旧 Worker 部署包、COS 桶（545 对象）、My_image（1370 文件）、过期旧服务器 8.148.252.27 全部查尽，原件只存在于已消亡的 HF 容器层与旧服务器。是否清除 analysis_md 里的死引用，等千禧拍板。
3. 管理端新上传的图片会写进容器层（`/app/uploads`），nginx 不服务它——与旧架构行为一致（旧站上传也只活在 HF 容器里）， durable 副本仍要靠 `frontend/public/uploads` 进 Git。
4. `chat.py` 的 `get_session_history` 没有路由装饰器，`GET /chat/session/{id}/history` 不是现行接口。
5. APScheduler 在依赖里但无调度器；热点抓取 `trigger_mode` 写死 manual。
6. **提示词同步已恢复（2026-09-24）**：扣子 → 投稿接口 cron 每日同步（见现行生产表）。当前扣子账号只有 2 个机器人：AI面试知识库（1879 字人设，已投递待审核）、海龟汤主理人（人设为空，逻辑在工作流里、API 不暴露工作流节点提示词，同步不了）。6 月那批 14 条电商提示词的源机器人已不在账号里。

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
