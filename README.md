<p align="center">
  <img src="https://img.shields.io/badge/Version-1.0.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/Status-Active-success" alt="Status">
  <img src="https://img.shields.io/badge/Backend-FastAPI-009688" alt="FastAPI">
  <img src="https://img.shields.io/badge/Frontend-React%20%2B%20Vite-646CFF" alt="React + Vite">
</p>

<h1 align="center">🚀 DevLog / My_Blog - 千禧的个人技术博客系统</h1>

<p align="center">
  <strong>一个面向 AI 技术内容创作、热点归档、文章管理和个人展示的现代化全栈博客系统。</strong>
</p>

<p align="center">
  <a href="#-项目简介">项目简介</a> •
  <a href="#-功能特性">功能特性</a> •
  <a href="#-技术栈">技术栈</a> •
  <a href="#-项目结构">项目结构</a> •
  <a href="#-快速开始">快速开始</a> •
  <a href="#-部署指南">部署指南</a> •
  <a href="#-维护说明">维护说明</a>
</p>

---

## 📌 项目简介

`My_Blog` 是一个全栈个人博客系统，后端基于 **FastAPI + SQLAlchemy + MySQL**，前端基于 **React + TypeScript + Vite**。

项目最初定位是个人技术博客，后续扩展了更多面向 AI 内容运营的能力，包括：

- 技术文章发布与管理
- Markdown / 数学公式 / Mermaid 图表渲染
- AI 热点内容管理与详情页展示
- 评论、点赞、订阅、后台统计
- Prompt 管理与 AI 助手能力
- 论坛/主题讨论模块
- 管理后台的一站式内容运维

生产环境中，本项目采用：

- **Nginx** 托管前端静态文件，并反向代理 `/api`
- **FastAPI + Gunicorn/Uvicorn** 提供后端 API
- **MySQL** 存储业务数据
- **Redis** 支撑部分 Agent/缓存能力

> 当前仓库只管理可维护源码、配置模板和轻量静态资源。构建产物、运行日志、上传文件、虚拟环境、大型媒体资源不进入 Git。

---

## 🌐 线上部署概览

当前生产部署约定如下：

| 项目 | 配置 |
|---|---|
| 线上域名 | `blog.qianxi7988.me` |
| 服务器目录 | `/data/My_Blog` |
| 前端目录 | `/data/My_Blog/frontend` |
| 前端构建产物 | `/data/My_Blog/frontend/dist` |
| 后端目录 | `/data/My_Blog/backend` |
| 后端服务 | FastAPI + Gunicorn/Uvicorn，监听 `127.0.0.1:8000` |
| Nginx API 代理 | `/api` → `http://127.0.0.1:8000` |
| MySQL | 默认生产端口 `3308` |
| Redis | 默认生产端口 `63791` |

> ⚠️ 重要：生产服务器上不要执行前端构建。前端应在本地或 CI 环境构建完成后，只把 `dist` 产物同步到服务器。

---

## ✨ 功能特性

### 📝 博客与内容管理

| 功能 | 说明 |
|---|---|
| 文章 CRUD | 支持文章创建、编辑、删除、发布/草稿状态管理 |
| Markdown 编辑 | 支持 Markdown 内容编辑、预览与上传导入 |
| Frontmatter 解析 | 支持从 Markdown 文件中解析标题、标签、分类等元数据 |
| 分类与标签 | 支持按分类、标签组织内容 |
| 归档页 | 支持按时间线归档文章 |
| 封面图 | 支持文章封面上传与裁剪 |
| 文章点赞 | 支持匿名点赞和点赞状态查询 |
| SEO 友好 | 语义化页面结构，便于搜索引擎索引 |

### 🔥 AI 热点与专题内容

| 功能 | 说明 |
|---|---|
| 热点列表 | 展示 AI 热点内容列表 |
| 热点详情 | 支持专门的 AI 热点详情页 |
| 热点评论 | 支持热点内容评论与互动 |
| 热点管理 | 后台可维护热点内容 |
| Markdown 增强渲染 | 支持表格、代码块、公式、Mermaid 等技术内容展示 |
| 图文内容支持 | 可展示技术架构图、插图等资源 |

### 💬 评论与互动

| 功能 | 说明 |
|---|---|
| 访客评论 | 无需登录即可发表评论 |
| 嵌套回复 | 支持多级回复关系 |
| 评论审核 | 管理后台可审核、隐藏、删除评论 |
| 评论点赞/举报 | 支持互动与内容治理能力 |
| 邮件通知 | 可配置 SMTP，对回复/订阅进行邮件通知 |

### 🤖 AI 与 Prompt 能力

| 功能 | 说明 |
|---|---|
| AI 对话 | 后端兼容 OpenAI SDK 风格接口，可接入 OpenAI / 兼容服务 |
| Prompt 库 | 支持 Prompt 模板的创建、管理和展示 |
| 管理后台 AI 助手 | 后台提供 Agent 能力入口 |
| RAG/检索扩展 | 后端包含 RAG Retriever 与 Agent Service 相关模块，便于扩展知识库能力 |
| Redis 支持 | Agent/缓存能力可接入 Redis |

### 🧑‍💻 管理后台

| 功能 | 说明 |
|---|---|
| 管理员登录 | JWT 鉴权，管理员后台入口 |
| 数据仪表盘 | 展示文章、评论、订阅、统计等数据 |
| 文章管理 | 后台文章列表、编辑、发布、删除 |
| 热点管理 | AI 热点内容维护 |
| 评论管理 | 评论审核与治理 |
| Prompt 管理 | Prompt 模板维护 |
| 订阅者管理 | 查看订阅用户和邮件订阅状态 |
| 站点设置 | 维护站点基础信息 |

### 🧵 论坛模块

| 功能 | 说明 |
|---|---|
| 论坛首页 | 展示主题帖列表 |
| 发帖 | 支持创建新主题 |
| 主题详情 | 支持查看主题内容与回复 |
| 后续扩展 | 可继续扩展为技术问答、留言板或讨论区 |

### 🎨 前端体验

| 功能 | 说明 |
|---|---|
| 响应式布局 | 支持桌面端和移动端访问 |
| React Router | 前端单页应用路由 |
| KaTeX 数学公式 | 支持数学公式渲染 |
| Mermaid 图表 | 支持流程图、架构图等文本图表渲染 |
| XMind 预览 | 支持 XMind 嵌入查看能力 |
| Live2D 组件 | 支持桌面宠物/Live2D 展示能力 |
| Recharts | 支持后台统计图表 |

---

## 🛠️ 技术栈

### 后端

| 技术 | 版本/说明 |
|---|---|
| Python | 建议 3.11+ |
| FastAPI | `0.115.6`，后端 Web 框架 |
| Uvicorn | ASGI Server，开发/生产均可使用 |
| SQLAlchemy | `2.0.36`，ORM 层 |
| Alembic | `1.14.0`，数据库迁移 |
| MySQL | 业务数据库 |
| aiomysql / pymysql | 异步/同步 MySQL 驱动 |
| Pydantic Settings | 环境变量配置管理 |
| python-jose | JWT 认证 |
| passlib + bcrypt | 密码哈希 |
| OpenAI SDK | 兼容 OpenAI 风格模型接口 |
| APScheduler | 定时任务能力 |
| Redis | 缓存/Agent 相关能力 |
| Markdown / BeautifulSoup / Pygments | Markdown 解析、HTML 处理、代码高亮 |

### 前端

| 技术 | 版本/说明 |
|---|---|
| React | `19.2.4` |
| TypeScript | `5.8.x` |
| Vite | `6.x` |
| React Router | `7.x` |
| Axios | API 请求 |
| React Markdown | Markdown 渲染 |
| remark-gfm / remark-math | GFM 与数学公式支持 |
| rehype-katex / rehype-highlight / rehype-raw | 公式、代码高亮、HTML 支持 |
| Mermaid | 技术图表渲染 |
| @uiw/react-md-editor | Markdown 编辑器 |
| Lucide React | 图标库 |
| Recharts | 数据可视化 |
| xmind-embed-viewer | XMind 文件预览 |
| naiHe Live2D Widget | Live2D 桌面宠物能力 |

---

## 📂 项目结构

```text
My_Blog/
├── backend/                         # 后端服务
│   ├── alembic/                     # 数据库迁移
│   │   ├── versions/                # 迁移版本文件
│   │   ├── env.py                   # Alembic 环境配置
│   │   └── script.py.mako           # 迁移模板
│   ├── api/                         # API 文档/接口说明补充
│   ├── app/
│   │   ├── api/v1/                  # REST API 路由
│   │   │   ├── admins.py            # 管理员接口
│   │   │   ├── agent.py             # Agent/后台助手接口
│   │   │   ├── articles.py          # 文章接口
│   │   │   ├── auth.py              # 登录认证接口
│   │   │   ├── chat.py              # AI 对话接口
│   │   │   ├── comments.py          # 评论接口
│   │   │   ├── forum.py             # 论坛接口
│   │   │   ├── hotspots.py          # AI 热点接口
│   │   │   ├── prompts.py           # Prompt 接口
│   │   │   ├── settings.py          # 站点设置接口
│   │   │   ├── stats.py             # 统计接口
│   │   │   ├── subscribe.py         # 邮件订阅接口
│   │   │   ├── upload.py            # 上传接口
│   │   │   └── router.py            # API 路由聚合
│   │   ├── core/                    # 配置、数据库、安全、依赖注入
│   │   ├── models/                  # SQLAlchemy 数据模型
│   │   ├── schemas/                 # Pydantic 请求/响应模型
│   │   ├── services/                # 业务服务层
│   │   │   ├── agent/               # 后台 AI Agent 能力
│   │   │   ├── email_service.py     # 邮件服务
│   │   │   ├── hot_topic_service.py # AI 热点业务逻辑
│   │   │   ├── markdown_service.py  # Markdown 解析
│   │   │   ├── openai_service.py    # 模型调用封装
│   │   │   ├── poro_rag_agent.py    # RAG/Agent 扩展
│   │   │   └── rag_retriever.py     # 检索器
│   │   ├── utils/                   # 工具函数
│   │   └── main.py                  # FastAPI 应用入口
│   ├── requirements.txt             # Python 依赖
│   └── alembic.ini                  # Alembic 配置
│
├── frontend/                        # 前端应用
│   ├── api/                         # API 请求封装
│   ├── components/                  # 通用组件
│   ├── contexts/                    # React Context
│   ├── layouts/                     # 前台/后台布局
│   ├── pages/                       # 页面组件
│   │   ├── Home.tsx                 # 首页
│   │   ├── ArticleList.tsx          # 文章列表
│   │   ├── ArticleDetail.tsx        # 文章详情
│   │   ├── HotspotsList.tsx         # AI 热点列表
│   │   ├── HotspotDetail.tsx        # AI 热点详情
│   │   ├── HotspotManager.tsx       # 热点管理
│   │   ├── ForumHome.tsx            # 论坛首页
│   │   ├── ForumNewThread.tsx       # 新建主题
│   │   ├── ForumThreadDetail.tsx    # 主题详情
│   │   ├── AgentChat.tsx            # AI 助手页
│   │   └── ...                      # 其他后台页面
│   ├── utils/                       # 前端工具函数
│   ├── App.tsx                      # 路由入口
│   ├── index.tsx                    # React 入口
│   ├── index.css                    # 全局样式
│   ├── package.json                 # Node 依赖和脚本
│   ├── vite.config.ts               # Vite 配置
│   └── tsconfig.json                # TypeScript 配置
│
├── scripts/                         # 运维/内容抓取脚本
├── static/                          # 轻量静态资源
├── API_INVENTORY.md                 # API 清单补充
├── DEPLOY.md                        # 部署说明
├── REPOSITORY_NOTES.md              # 仓库维护说明
├── deploy_frontend_dist.sh          # 前端产物部署脚本
├── check_db_status.py               # 数据库状态检查脚本
├── enrich_db.py                     # 数据填充/修复脚本
└── README.md                        # 项目说明
```

---

## 🚀 快速开始

### 1. 环境要求

| 依赖 | 建议版本 |
|---|---|
| Python | 3.11+ |
| Node.js | 18+，建议 20+ |
| npm | 9+ |
| MySQL | 8.0+ |
| Redis | 可选；启用 Agent/缓存能力时需要 |

### 2. 克隆项目

```bash
git clone https://github.com/qianxi-00/My_Blog.git
cd My_Blog
```

### 3. 初始化数据库

```sql
CREATE DATABASE my_blog CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'blog_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON my_blog.* TO 'blog_user'@'localhost';
FLUSH PRIVILEGES;
```

### 4. 配置后端环境变量

在 `backend/.env` 中填写配置。仓库不会提交真实 `.env` 文件。

```ini
# MySQL
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=blog_user
DB_PASSWORD=your_password
DB_NAME=my_blog
DB_CHARSET=utf8mb4

# 初始管理员
SUPER_ADMIN_USERNAME=admin
SUPER_ADMIN_PASSWORD=change_me_to_a_strong_password

# JWT
JWT_SECRET_KEY=change_me_to_a_long_random_secret
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=1440

# OpenAI-compatible API
OPENAI_API_KEY=
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
ZHAIYAO_MODEL=gpt-4o-mini

# 管理后台 Agent
AGENT_API_KEY=
AGENT_API_BASE=https://api.openai.com/v1
AGENT_MODEL=gpt-4o-mini
AGENT_MAX_TOKENS=16000
AGENT_TEMPERATURE=0.7

# Redis，可按需关闭
REDIS_ENABLED=false
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# 上传
UPLOAD_DIR=uploads
MAX_UPLOAD_SIZE_MB=10

# App
APP_HOST=0.0.0.0
APP_PORT=8000
DEBUG=true

# SMTP，可选
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
SMTP_FROM_NAME=千禧的个人博客
SMTP_USE_SSL=true

# 站点地址，用于邮件链接等
SITE_URL=http://localhost:5173
```

### 5. 启动后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 执行数据库迁移
alembic upgrade head

# 开发模式启动
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

后端启动后：

- API 根地址：`http://localhost:8000`
- Swagger：`http://localhost:8000/docs`
- ReDoc：`http://localhost:8000/redoc`

### 6. 启动前端

```bash
cd frontend
npm ci

# 开发环境 API 地址
cat > .env.local <<'EOF'
VITE_API_BASE_URL=http://localhost:8000
EOF

npm run dev
```

前端启动后：

- 前台：`http://localhost:5173`
- 管理后台：`http://localhost:5173/admin` 或按前端路由实际配置访问

---

## 🔗 API 路由概览

后端 API 统一挂载在 `/api/v1` 下，生产环境由 Nginx 将 `/api` 反向代理到后端。

| 模块 | 路径前缀 | 说明 |
|---|---|---|
| 认证 | `/api/v1/auth` | 登录、Token、当前用户 |
| 管理员 | `/api/v1/admins` | 管理员资料、权限相关 |
| 文章 | `/api/v1/articles` | 文章 CRUD、归档、点赞、Markdown 上传 |
| 评论 | `/api/v1/comments` | 评论、回复、审核、举报 |
| 热点 | `/api/v1/hotspots` | AI 热点内容展示与管理 |
| 论坛 | `/api/v1/forum` | 论坛主题与回复 |
| Prompt | `/api/v1/prompts` | Prompt 模板管理 |
| AI 聊天 | `/api/v1/chat` | AI 对话接口 |
| Agent | `/api/v1/agent` | 管理后台 Agent 能力 |
| 上传 | `/api/v1/upload` | 图片/文件上传 |
| 统计 | `/api/v1/stats` | 访问统计与后台仪表盘 |
| 设置 | `/api/v1/settings` | 站点设置 |
| 订阅 | `/api/v1/subscribe` | 邮件订阅与退订 |

---

## 🧪 常用开发命令

### 后端

```bash
cd backend

# 启动开发服务
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 生成迁移
alembic revision --autogenerate -m "describe change"

# 应用迁移
alembic upgrade head

# 回滚一个迁移
alembic downgrade -1
```

### 前端

```bash
cd frontend

# 安装依赖
npm ci

# 开发服务
npm run dev

# 测试
npm test

# 生产构建
npm run build

# 本地预览构建结果
npm run preview
```

---

## 🌐 部署指南

更完整的生产部署说明见 [DEPLOY.md](./DEPLOY.md)。

### 1. 前端构建

生产环境前端建议使用相对 API 地址，让浏览器请求当前域名下的 `/api`，再由 Nginx 转发到后端。

```bash
cd frontend
npm ci

cat > .env.production <<'EOF'
VITE_API_BASE_URL=
EOF

npm run build
```

构建后产物在：

```text
frontend/dist/
```

> ⚠️ 注意：不要把 `frontend/dist` 提交到 Git；也不要在生产服务器上执行构建。构建应在本地或 CI 完成，再同步产物。

### 2. 后端生产启动示例

```bash
cd /data/My_Blog/backend
source .venv/bin/activate
alembic upgrade head

gunicorn app.main:app \
  -k uvicorn.workers.UvicornWorker \
  -b 127.0.0.1:8000 \
  --workers 2
```

### 3. Nginx 示例

```nginx
server {
    listen 80;
    server_name blog.example.com;

    root /data/My_Blog/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads {
        proxy_pass http://127.0.0.1:8000;
    }
}
```

### 4. 线上部署注意事项

- `.env` 必须只放在线上服务器，不要提交到 Git。
- `JWT_SECRET_KEY`、数据库密码、SMTP 授权码、模型 API Key 必须使用强随机值。
- 生产环境建议 `DEBUG=false`。
- 生产环境建议使用 systemd 管理后端服务。
- Nginx 修改后执行 `nginx -t` 再 reload。
- 前端构建产物如出现 `http://127.0.0.1:8000`，说明生产环境 API 地址配置有误，应确保 `VITE_API_BASE_URL=` 为空字符串。

---

## 🗃️ 仓库管理说明

本仓库追踪：

- 后端源码
- 前端源码
- 数据库迁移脚本
- 轻量静态资源
- 文档和部署脚本

本仓库不追踪：

- `frontend/dist*` 构建产物
- `node_modules/`
- Python `.venv/`、`venv/`
- `.env`、密钥、证书、Token
- 日志文件
- 上传文件、运行时临时目录
- 大型 Live2D 模型资源、文章媒体资源

如果未来需要管理大型媒体资源，建议使用：

1. 对象存储/CDN，例如 OSS、COS、S3、R2；或
2. Git LFS；或
3. 单独资源仓库。

---

## 🔐 安全建议

- 管理员密码不要使用默认值。
- JWT Secret 每个环境独立生成。
- 数据库账号只授予当前库所需权限。
- 上传目录应限制可执行权限，避免脚本上传后被执行。
- OpenAI-compatible API Key 不应暴露到前端。
- SMTP 使用授权码，不要使用邮箱登录密码。
- 对外公开部署时建议开启 HTTPS。
- 定期执行依赖审计，例如 `npm audit`。

---

## 🧯 常见问题

### 1. 前端请求到了 `127.0.0.1:8000`

生产构建时 `VITE_API_BASE_URL` 配置不正确。生产环境应使用：

```ini
VITE_API_BASE_URL=
```

然后重新构建前端并部署 `dist`。

### 2. 数据库连接失败

检查：

- MySQL 是否启动
- `DB_HOST` / `DB_PORT` 是否正确
- 用户名密码是否正确
- 数据库是否已创建
- 线上端口是否与 `.env` 一致

### 3. Alembic 迁移失败

检查：

- `backend/.env` 是否存在
- 数据库连接 URL 是否正确
- 当前数据库是否已有手工改动导致 schema 不一致

### 4. 登录失败或 Token 异常

检查：

- 管理员账号是否初始化成功
- `JWT_SECRET_KEY` 是否变更导致旧 Token 失效
- 浏览器 localStorage 是否残留旧 Token

### 5. 上传失败

检查：

- `UPLOAD_DIR` 是否存在
- 后端进程是否有写权限
- Nginx 是否正确代理 `/uploads`
- 文件大小是否超过 `MAX_UPLOAD_SIZE_MB`

### 6. 邮件发送失败

检查：

- SMTP 服务是否开启
- 是否使用授权码而不是登录密码
- SSL/端口配置是否匹配
- 发件邮箱是否被服务商限制

### 7. Vite 构建出现大 chunk 警告

这通常不影响构建成功。后续可以通过动态导入或 `manualChunks` 拆分 Mermaid、XMind、Markdown 编辑器等较重依赖。

---

## ✅ 当前验证状态

最近一次整理仓库时已验证：

```bash
cd frontend
npm ci
npm run build
```

结果：前端生产构建通过。

已知非阻塞项：

- `npm audit` 有依赖漏洞提示，需要后续评估升级。
- Vite 有大 chunk 警告，需要后续按需拆包优化。

---

## 🗺️ 后续优化方向

- [ ] 补充 `.env.example`
- [ ] 补充后端 pytest 测试
- [ ] 为前端增加更多 Vitest/组件测试
- [ ] 优化前端 chunk 拆分，降低首屏包体
- [ ] 将文章媒体资源迁移到对象存储/CDN
- [ ] 增加 CI：lint、test、build、依赖审计
- [ ] 补充 OpenAPI 导出文档
- [ ] 增强后台操作审计日志

---

## 📄 License

本项目当前 README 保留 MIT License 标识。如需正式开源，请补充 `LICENSE` 文件并确认授权范围。

---

## 🙏 致谢

感谢以下开源项目：

- [FastAPI](https://fastapi.tiangolo.com/)
- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [SQLAlchemy](https://www.sqlalchemy.org/)
- [Alembic](https://alembic.sqlalchemy.org/)
- [React Markdown](https://github.com/remarkjs/react-markdown)
- [Mermaid](https://mermaid.js.org/)
- [Lucide Icons](https://lucide.dev/)

---

<p align="center">
  <strong>Made with ❤️ by 千禧</strong>
</p>
