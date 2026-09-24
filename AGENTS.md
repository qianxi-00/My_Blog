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
| 后端容器 | `qianxi-blog`，镜像 `qianxi-blog:20260924`（源码 `/data/blog/src`，来自 HF 镜像提取版，含 `llm_router`）。512MB/1CPU，`--restart unless-stopped`，只绑 `127.0.0.1:8000` |
| 数据库 | 容器挂载 `/data/blog/data:/data`，库文件 `/data/blog/data/blog.db`。2026-09-24 从 HF 导出（integrity ok：23 文 / 567 热点 / 558 published） |
| 前端 | `/var/www/blog/dist`，本地构建后分批上传。**Live2D 144MB 尚未上传，看板娘暂缺资源** |
| nginx | `/etc/nginx/sites-available/blog`（独立文件，别动 `new-api` 那份）。80 端口有 `^~ /.well-known/acme-challenge/` 例外 + 301，**别删这个例外，删了证书续不了** |
| 证书 | Let's Encrypt `blog.qianxi7988.me`，2026-12-23 到期，certbot 自动续期（webroot=`/var/www/blog/dist`） |
| 运行配置 | `/data/blog/runtime.env`（600 root-only）：JWT_SECRET_KEY（强随机，2026-09-24 轮换）、`LLM_MODEL_CHAIN=grok-4.7`、`REDIS_ENABLED=false`、NewAPI 地址 `http://new-api:3000/v1` |
| 备份 | `/data/blog/backup-db.sh`，cron 每天 04:30 热备份到 `/data/blog/backups/`，保留 14 天 |
| AI 网络桥 | docker 网络 `blog-net`：`qianxi-blog` 与 `new-api` 都挂在上面。**拆掉这个网络 AI 就断**（new-api 只发布在宿主机 `127.0.0.1:3001`，容器从 `172.17.0.1` 够不到，2026-09-24 实测 Connection refused） |

**回退方式**：把 Cloudflare DNS 的 A 记录改回橙云代理（原 Worker 路由 `blog.qianxi7988.me/* → qianxi-blog-site` 仍在）。数据回退需注意：新站库从导出后一直在被写（浏览量、聊天），回退前先备份新库。

## AI 链路（2026-09-24 实测通过）

- 模型：`grok-4.7`，单模型，**没有配置 fallback**（`LLM_MODEL_CHAIN=grok-4.7`，`CPA_API_KEY` 未设）。
- 凭据：NewAPI token `blog-devlog`（id 383，分组 `svip`，`model_limits='grok-4.7'`）。**分组必须是 svip/vip**——grok-4.7 只在 CPA 渠道 3/16 上，渠道分组是 `svip,vip`，token 在 `default` 分组会 503 `model_not_found`（实测踩过）。
- 验证记录：公网 `POST /api/v1/chat/prompt-lab` 与 `POST /api/v1/chat/message` 均 200 真实补全；NewAPI logs 表确认记账（token_name=blog-devlog）。
- admin 独享的 agent SSE 与文章摘要接口没有管理员口令未实测；两者与上面同一 `llm_router` 链路。
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
2. **141 个内联图（热点/文章正文里的 SVG/PNG）在旧站也不存在**（旧站对它们回退到 SPA HTML，一样是坏图）——预存问题，可能要查 COS 桶 `openclaw-1388341148`。
3. 管理端新上传的图片会写进容器层（`/app/uploads`），nginx 不服务它——与旧架构行为一致（旧站上传也只活在 HF 容器里）， durable 副本仍要靠 `frontend/public/uploads` 进 Git。
4. `chat.py` 的 `get_session_history` 没有路由装饰器，`GET /chat/session/{id}/history` 不是现行接口。
5. APScheduler 在依赖里但无调度器；热点抓取 `trigger_mode` 写死 manual。

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

1. 7/19 版差异回仓已完成（2026-09-24，`f05e117`）。
2. 旧栈处置：HF Space 与 Worker `qianxi-blog-site` 保留多久后删除；workers.dev 旧站仍公开可访问。
3. 前端 dist 与旧 Worker assets 的同源性核对。
4. 141 个内联图从 COS 找回。
5. 一键备份扩展（目前只有 DB：源码、nginx 配置、runtime.env 的备份策略）。
6. 择机删除前端死代码 live2d 目录（144MB）。
