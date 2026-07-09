# 部署权威源说明

本仓库是博客服务唯一维护源。

## 当前生产拓扑

- 正式域名: `https://blog.qianxi7988.me`
- 前端与静态资源: Cloudflare Worker `qianxi-blog-site` + Workers Assets
- 后端 API: Hugging Face Space `Qian7988/qianxi-blog-backend`
- Worker API 代理: `/api/*` -> `https://qian7988-qianxi-blog-backend.hf.space/api/*`

## 目录职责

- `frontend/`: React + Vite 前端源码。
- `frontend/public/`: 前端静态源资源，包括 AI 日报 JSON、Live2D、魄罗图、桌面宠物资源、logo。构建时会复制到 `frontend/dist/`。
- `backend/`: 当前 HF Space 实际运行的 FastAPI 后端源码。
- `backend/data/db_part_*.dat`: HF 后端 SQLite 种子库分片，包含已迁移的文章、热点、Prompt、评论、论坛等数据。
- `backend/scripts/seed_db.py`: HF 构建时重建 `/data/blog.db`。
- `cloudflare-worker/`: Cloudflare Worker 入口和 `wrangler.toml`，Assets 指向 `../frontend/dist`。

## 部署流程

### 前端 / Worker

```bash
cd frontend
npm install
npm run build
cd ../cloudflare-worker
npx wrangler deploy
```

### 后端 / HF Space

`backend/` 目录内容对应 HF Space 根目录。推送到 HF Space 后会在构建阶段执行 `scripts/seed_db.py`，用 `backend/data/db_part_*.dat` 重建 SQLite 数据库。

## 版本规则

- 不再把 `My_Blog/`、`blog_migration/hf_deploy/`、`qianxi-blog-site/` 当作长期维护源。
- 后续所有博客服务相关代码修改先进入本仓库。
- 生产部署成功后，同步提交并推送本仓库，避免再次出现多套版本。
