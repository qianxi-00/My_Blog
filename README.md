<p align="center">
  <img src="https://img.shields.io/badge/Version-1.0.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/Status-Active-success" alt="Status">
</p>

<h1 align="center">🚀 DevLog - 个人技术博客系统</h1>

<p align="center">
  <strong>一个现代化的全栈个人博客系统，基于 FastAPI + React + TypeScript 构建</strong>
</p>

<p align="center">
  <a href="#-功能特性">功能特性</a> •
  <a href="#-技术栈">技术栈</a> •
  <a href="#-项目结构">项目结构</a> •
  <a href="#-快速开始">快速开始</a> •
  <a href="#-api-文档">API 文档</a> •
  <a href="#-部署指南">部署指南</a>
</p>

---

## 📸 项目预览

> 💡 **提示**：运行项目后访问 `http://localhost:5173` 查看完整效果

| 首页 | 文章详情 | 管理后台 |
|:---:|:---:|:---:|
| 个人介绍 + 最新文章 | Markdown 渲染 + 评论 | 数据仪表盘 |

---

## ✨ 功能特性

### 📝 博客核心功能

| 功能 | 描述 |
|-----|------|
| **Markdown 编辑器** | 支持实时预览的 Markdown 编辑，集成 `@uiw/react-md-editor` |
| **代码高亮** | 基于 `rehype-highlight` 的多语言代码高亮 |
| **文章管理** | 支持草稿/发布状态、分类、标签、封面图、摘要 |
| **Markdown 导入** | 支持直接上传 `.md` 文件创建文章，自动解析 Frontmatter |
| **归档页面** | 按年月时间线展示所有文章 |
| **文章点赞** | 基于 IP + User-Agent 的匿名点赞系统 |

### 💬 评论系统

| 功能 | 描述 |
|-----|------|
| **嵌套回复** | 支持多级嵌套评论与回复 |
| **评论审核** | 管理员可审核、批准、隐藏评论 |
| **访客评论** | 无需登录，填写昵称和邮箱即可评论 |
| **邮件通知** | 有新回复时通过邮件通知原评论者 |

### 🤖 AI 集成

| 功能 | 描述 |
|-----|------|
| **AI 对话** | 集成 OpenAI / 火山引擎大模型 API |
| **Prompt 库** | 创建、管理、分享 AI 提示词模板 |
| **智能摘要** | 自动为文章生成摘要（可选功能） |

### 📊 管理后台

| 功能 | 描述 |
|-----|------|
| **数据仪表盘** | 文章数、评论数、订阅者数、访问统计图表 |
| **文章管理** | 文章 CRUD、批量操作、状态切换 |
| **评论管理** | 评论审核、回复、删除 |
| **Prompt 管理** | Prompt 模板的增删改查 |
| **订阅者管理** | 查看订阅者列表、发送邮件通知 |
| **个人资料** | 管理员信息、头像、密码修改 |

### � 邮件订阅

| 功能 | 描述 |
|-----|------|
| **邮件订阅** | 访客可订阅博客，接收新文章通知 |
| **一键退订** | 通过邮件中的链接一键退订 |
| **新文章通知** | 发布文章时自动向订阅者发送通知邮件 |

### 🔐 认证与安全

| 功能 | 描述 |
|-----|------|
| **JWT 认证** | 基于 JWT 的管理员身份认证 |
| **密码加密** | 使用 bcrypt 加密存储密码 |
| **权限控制** | 区分超级管理员和普通管理员权限 |

### 🎨 前端特性

| 功能 | 描述 |
|-----|------|
| **响应式设计** | 完美适配桌面端和移动端 |
| **深浅主题** | 浅色主题设计，可扩展深色模式 |
| **平滑动画** | 丰富的过渡动画和微交互效果 |
| **SEO 友好** | 语义化 HTML + 合理的 meta 标签 |

---

## 🛠️ 技术栈

### 后端技术

| 技术 | 版本 | 说明 |
|------|------|------|
| **Python** | 3.11+ | 编程语言 |
| **FastAPI** | 0.115.6 | 高性能异步 Web 框架 |
| **Uvicorn** | 0.34.0 | ASGI 服务器 |
| **SQLAlchemy** | 2.0.36 | ORM 数据库操作 |
| **Alembic** | 1.14.0 | 数据库迁移工具 |
| **MySQL** | 8.0+ | 关系型数据库 (使用 asyncmy 异步驱动) |
| **Pydantic** | 2.10.5 | 数据验证与序列化 |
| **python-jose** | 3.3.0 | JWT 令牌生成与验证 |
| **passlib** | 1.7.4 | 密码哈希处理 |
| **OpenAI SDK** | 1.60.0 | AI 模型 API 集成 |
| **APScheduler** | 3.10.4 | 定时任务调度 |
| **Markdown** | 3.7 | Markdown 解析 |
| **Pygments** | 2.18.0 | 代码语法高亮 |
| **aiofiles** | 24.1.0 | 异步文件操作 |

### 前端技术

| 技术 | 版本 | 说明 |
|------|------|------|
| **React** | 19.2.4 | UI 组件库 |
| **TypeScript** | 5.8 | 类型安全的 JavaScript |
| **Vite** | 6.2.0 | 下一代前端构建工具 |
| **React Router** | 7.13.0 | 客户端路由管理 |
| **Axios** | 1.13.4 | HTTP 请求客户端 |
| **TailwindCSS** | CDN | 原子化 CSS 框架 |
| **React Markdown** | 10.1.0 | Markdown 渲染组件 |
| **rehype-highlight** | 7.0.2 | 代码块语法高亮 |
| **rehype-raw** | 7.0.0 | 支持 Markdown 中的原始 HTML |
| **@uiw/react-md-editor** | 4.0.11 | Markdown 编辑器组件 |
| **Lucide React** | 0.563.0 | 精美图标库 |
| **Recharts** | 3.7.0 | 数据可视化图表库 |

---

## 📂 项目结构

```
My_Blog/
├── 📁 backend/                      # 后端服务 (FastAPI)
│   ├── 📁 alembic/                  # 数据库迁移脚本
│   │   ├── versions/                # 迁移版本文件
│   │   └── env.py                   # Alembic 环境配置
│   ├── 📁 app/                      # 应用主目录
│   │   ├── 📁 api/                  # API 路由层
│   │   │   └── 📁 v1/               # v1 版本 API
│   │   │       ├── router.py        # 路由聚合
│   │   │       ├── auth.py          # 🔐 认证接口 (登录/登出)
│   │   │       ├── admins.py        # 👤 管理员接口
│   │   │       ├── articles.py      # 📝 文章接口 (CRUD/发布/归档)
│   │   │       ├── comments.py      # 💬 评论接口 (发表/审核/回复)
│   │   │       ├── prompts.py       # 🤖 Prompt 接口
│   │   │       ├── chat.py          # 💡 AI 聊天接口
│   │   │       ├── upload.py        # 📤 文件上传接口
│   │   │       ├── stats.py         # 📊 统计接口
│   │   │       ├── settings.py      # ⚙️ 站点配置接口
│   │   │       └── subscribe.py     # 📧 邮件订阅接口
│   │   ├── 📁 core/                 # 核心模块
│   │   │   ├── config.py            # 配置管理 (Pydantic Settings)
│   │   │   ├── database.py          # 数据库连接与会话
│   │   │   ├── security.py          # 安全相关 (JWT/密码)
│   │   │   └── deps.py              # 依赖注入
│   │   ├── 📁 models/               # SQLAlchemy 数据模型
│   │   │   ├── admin.py             # 管理员模型
│   │   │   ├── article.py           # 文章/分类/标签模型
│   │   │   ├── comment.py           # 评论模型
│   │   │   ├── prompt.py            # Prompt 模型
│   │   │   ├── chat.py              # 聊天会话模型
│   │   │   ├── subscriber.py        # 订阅者模型
│   │   │   ├── settings.py          # 站点配置模型
│   │   │   ├── stats.py             # 访问统计模型
│   │   │   └── image.py             # 图片管理模型
│   │   ├── 📁 schemas/              # Pydantic 数据模式
│   │   │   ├── article.py           # 文章请求/响应模式
│   │   │   ├── comment.py           # 评论请求/响应模式
│   │   │   ├── admin.py             # 管理员请求/响应模式
│   │   │   └── ...                  # 其他模式定义
│   │   ├── 📁 services/             # 业务逻辑层
│   │   │   ├── email_service.py     # 邮件发送服务
│   │   │   ├── markdown_service.py  # Markdown 解析服务
│   │   │   ├── init_data.py         # 初始化数据服务
│   │   │   └── ...                  # 其他服务
│   │   └── main.py                  # 🚀 应用入口
│   ├── 📁 uploads/                  # 上传文件存储目录
│   │   └── images/                  # 图片文件
│   ├── .env                         # 环境变量配置
│   ├── alembic.ini                  # Alembic 配置
│   ├── requirements.txt             # Python 依赖
│   └── seed.py                      # 数据填充脚本
│
├── 📁 frontend/                     # 前端服务 (React + Vite)
│   ├── 📁 api/                      # API 请求封装
│   │   ├── config.ts                # API 基础配置
│   │   ├── articles.ts              # 文章相关 API
│   │   ├── comments.ts              # 评论相关 API
│   │   ├── auth.ts                  # 认证相关 API
│   │   └── ...                      # 其他 API 模块
│   ├── 📁 components/               # 公共组件
│   │   ├── Icons.tsx                # 图标组件封装
│   │   ├── Shared.tsx               # 共享 UI 组件
│   │   └── ...                      # 其他组件
│   ├── 📁 contexts/                 # React Context
│   │   └── AuthContext.tsx          # 认证上下文
│   ├── 📁 layouts/                  # 布局组件
│   │   ├── PublicLayout.tsx         # 公共页面布局 (导航栏/页脚)
│   │   └── AdminLayout.tsx          # 管理后台布局 (侧边栏)
│   ├── 📁 pages/                    # 页面组件
│   │   ├── Home.tsx                 # 🏠 首页 (个人介绍+最新文章)
│   │   ├── ArticleList.tsx          # 📋 文章列表页
│   │   ├── ArticleDetail.tsx        # 📖 文章详情页
│   │   ├── Archives.tsx             # 📅 归档页
│   │   ├── PromptLibrary.tsx        # 🤖 Prompt 库页
│   │   ├── Unsubscribe.tsx          # 📧 退订页面
│   │   ├── AdminLogin.tsx           # 🔐 管理员登录
│   │   ├── AdminDashboard.tsx       # 📊 管理仪表盘
│   │   ├── AdminProfile.tsx         # 👤 管理员资料
│   │   ├── ArticleManager.tsx       # 📝 文章管理
│   │   ├── ArticleEditor.tsx        # ✏️ 文章编辑器
│   │   ├── CommentManager.tsx       # 💬 评论管理
│   │   ├── PromptManager.tsx        # 🤖 Prompt 管理
│   │   ├── SubscriberManager.tsx    # 📧 订阅者管理
│   │   └── ChatInterface.tsx        # 💡 AI 聊天界面
│   ├── 📁 public/                   # 静态资源
│   ├── App.tsx                      # 应用根组件 + 路由配置
│   ├── index.tsx                    # 入口文件
│   ├── index.html                   # HTML 模板
│   ├── index.css                    # 全局样式
│   ├── types.ts                     # TypeScript 类型定义
│   ├── constants.ts                 # 常量定义
│   ├── vite.config.ts               # Vite 构建配置
│   ├── tsconfig.json                # TypeScript 配置
│   ├── package.json                 # Node.js 依赖
│   ├── .env.local                   # 本地环境变量
│   └── .env.production              # 生产环境变量
│
├── DEPLOY.md                        # 📚 生产部署文档
├── enrich_db.py                     # 数据库内容填充脚本
├── check_db_status.py               # 数据库状态检查脚本
└── README.md                        # 📖 项目说明文档
```

---

## 🚀 快速开始

### 环境要求

| 依赖 | 版本要求 | 说明 |
|-----|---------|------|
| Python | 3.11+ | 后端运行环境 |
| Node.js | 18+ | 前端构建环境 |
| MySQL | 8.0+ | 数据库 |

### 1️⃣ 克隆项目

```bash
git clone <your_repo_url>
cd My_Blog
```

### 2️⃣ 数据库准备

```sql
-- 登录 MySQL 创建数据库
CREATE DATABASE my_blog CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 创建用户并授权 (可选)
CREATE USER 'blog_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON my_blog.* TO 'blog_user'@'localhost';
FLUSH PRIVILEGES;
```

### 3️⃣ 后端配置

```bash
# 进入后端目录
cd backend

# 创建 Python 虚拟环境
python -m venv .venv

# 激活虚拟环境
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# 安装 Python 依赖
pip install -r requirements.txt

# 配置环境变量 (复制并编辑 .env 文件)
# 参考下方 "环境变量配置" 章节填写配置

# 运行数据库迁移
alembic upgrade head

# 启动开发服务器
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

启动后，后端服务将在以下地址可用：
- **API 服务**: http://localhost:8000
- **Swagger 文档**: http://localhost:8000/docs
- **ReDoc 文档**: http://localhost:8000/redoc

### 4️⃣ 前端配置

```bash
# 进入前端目录
cd frontend

# 安装 Node 依赖
npm install

# 配置 API 地址 (开发环境)
echo "VITE_API_BASE_URL=http://localhost:8000" > .env.local

# 启动开发服务器
npm run dev
```

启动后，前端服务将在以下地址可用：
- **前端应用**: http://localhost:5173
- **管理后台**: http://localhost:5173/#/admin

### 5️⃣ 首次登录

启动后端时，系统会自动创建超级管理员账号（根据 `.env` 中的配置）：
- **登录地址**: http://localhost:5173/#/admin/login
- **用户名**: `.env` 中的 `SUPER_ADMIN_USERNAME`
- **密码**: `.env` 中的 `SUPER_ADMIN_PASSWORD`

---

## ⚙️ 环境变量配置

### 后端 `.env` 完整配置

```ini
# ====================================
# 数据库配置 (MySQL)
# ====================================
DB_HOST=localhost                    # 数据库主机
DB_PORT=3306                         # 数据库端口
DB_USER=your_user                    # 数据库用户名
DB_PASSWORD=your_password            # 数据库密码
DB_NAME=my_blog                      # 数据库名称

# ====================================
# 初始超级管理员账号
# ====================================
SUPER_ADMIN_USERNAME=admin           # 管理员用户名
SUPER_ADMIN_PASSWORD=your_password   # 管理员密码 (建议使用强密码)

# ====================================
# JWT 配置
# ====================================
JWT_SECRET_KEY=your-super-secret-jwt-key-change-in-production
JWT_ALGORITHM=HS256                  # 加密算法
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=1440 # Token 过期时间 (分钟)

# ====================================
# OpenAI / 火山引擎 API 配置
# ====================================
OPENAI_API_KEY=your_api_key          # API 密钥
OPENAI_API_BASE=https://api.openai.com/v1  # API 基础 URL
OPENAI_MODEL=gpt-3.5-turbo           # 模型名称

# 火山引擎豆包模型示例:
# OPENAI_API_BASE=https://ark.cn-beijing.volces.com/api/v3
# OPENAI_MODEL=doubao-seed-1-8-251228

# ====================================
# 文件上传配置
# ====================================
UPLOAD_DIR=uploads                   # 上传目录
MAX_UPLOAD_SIZE_MB=10                # 最大上传大小 (MB)

# ====================================
# 应用配置
# ====================================
APP_HOST=0.0.0.0                     # 监听地址
APP_PORT=8000                        # 监听端口
DEBUG=true                           # 调试模式 (生产环境设为 false)

# ====================================
# SMTP 邮件配置
# ====================================
SMTP_HOST=smtp.qq.com                # SMTP 服务器
SMTP_PORT=465                        # SMTP 端口
SMTP_USER=your_email@qq.com          # 发件邮箱
SMTP_PASSWORD=your_smtp_auth_code    # SMTP 授权码 (非登录密码)
SMTP_FROM_EMAIL=your_email@qq.com    # 发件人邮箱
SMTP_FROM_NAME=DevLog                # 发件人名称
SMTP_USE_SSL=true                    # 是否使用 SSL

# ====================================
# 站点配置
# ====================================
SITE_URL=http://localhost:5173       # 站点 URL (用于邮件中的链接)
```

### 前端 `.env.local` 配置

```ini
# 开发环境 API 地址
VITE_API_BASE_URL=http://localhost:8000
```

### 前端 `.env.production` 配置

```ini
# 生产环境 API 地址 (相对路径，通过 Nginx 代理)
VITE_API_BASE_URL=
```

---

## 📖 API 文档

### 接口概览

| 模块 | 路径前缀 | 主要功能 |
|------|---------|---------|
| 🔐 认证 | `/api/v1/auth` | 管理员登录、登出、Token 刷新 |
| 👤 管理员 | `/api/v1/admins` | 管理员信息查询、资料修改 |
| 📝 文章 | `/api/v1/articles` | 文章 CRUD、发布、归档、点赞 |
| 💬 评论 | `/api/v1/comments` | 评论发表、审核、回复、删除 |
| 🤖 Prompt | `/api/v1/prompts` | Prompt 模板 CRUD |
| 💡 AI 聊天 | `/api/v1/chat` | AI 对话、会话管理 |
| 📤 文件上传 | `/api/v1/upload` | 图片上传、文件管理 |
| 📊 统计 | `/api/v1/stats` | 访问统计、数据概览 |
| ⚙️ 站点配置 | `/api/v1/settings` | 站点信息、联系方式 |
| 📧 订阅 | `/api/v1/subscribe` | 邮件订阅、退订 |

### 文章接口详情

| 方法 | 路径 | 描述 | 权限 |
|-----|------|-----|------|
| GET | `/articles` | 获取文章列表 (分页/筛选) | 公开 |
| GET | `/articles/{id}` | 获取文章详情 | 公开 |
| GET | `/articles/tags` | 获取所有标签 | 公开 |
| GET | `/articles/categories` | 获取所有分类 | 公开 |
| GET | `/articles/archives` | 获取归档数据 | 公开 |
| POST | `/articles/{id}/like` | 点赞文章 | 公开 |
| GET | `/articles/{id}/like/status` | 获取点赞状态 | 公开 |
| POST | `/articles` | 创建文章 | 🔒 管理员 |
| PUT | `/articles/{id}` | 更新文章 | 🔒 管理员 |
| DELETE | `/articles/{id}` | 删除文章 | 🔒 管理员 |
| POST | `/articles/{id}/publish` | 发布文章 | 🔒 管理员 |
| POST | `/articles/upload-markdown` | 上传 Markdown 创建文章 | 🔒 管理员 |

### 在线文档

启动后端服务后，可通过以下地址访问交互式 API 文档：

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

---

## 🌐 生产部署

详细的生产环境部署指南请参考 [DEPLOY.md](./DEPLOY.md)。

### 快速部署清单

- [ ] 配置生产环境 `.env` (关闭 DEBUG、设置强密码)
- [ ] 配置 MySQL 数据库
- [ ] 运行数据库迁移 `alembic upgrade head`
- [ ] 使用 Gunicorn + Uvicorn Worker 部署后端
- [ ] 构建前端 `npm run build`
- [ ] 配置 Nginx 反向代理
- [ ] 配置 HTTPS (Let's Encrypt)
- [ ] 配置 systemd 服务

### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    root /data/my_blog/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 反向代理
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 上传文件
    location /uploads {
        proxy_pass http://127.0.0.1:8000;
    }
}
```

---

## 🔧 开发指南

### 数据库迁移

```bash
cd backend

# 创建新的迁移
alembic revision --autogenerate -m "add new table"

# 应用迁移
alembic upgrade head

# 回滚迁移
alembic downgrade -1
```

### 数据填充

```bash
# 填充示例数据
cd backend
python ../enrich_db.py
```

### 前端构建

```bash
cd frontend

# 开发模式 (热重载)
npm run dev

# 生产构建
npm run build

# 预览生产构建
npm run preview
```

---

## 📋 常见问题

### 1. 数据库连接失败

- 检查 `.env` 中数据库配置是否正确
- 确认 MySQL 服务已启动
- 确认用户有访问数据库的权限

### 2. API 返回 401/403

- 检查 JWT Token 是否过期
- 清除浏览器缓存重新登录
- 确认请求头携带了正确的 Authorization

### 3. 上传文件失败

- 检查 `uploads` 目录权限
- 确认文件大小未超过 `MAX_UPLOAD_SIZE_MB`
- 检查 Nginx 配置是否正确代理 `/uploads`

### 4. 邮件发送失败

- 确认使用的是 SMTP 授权码而非登录密码
- 检查 SMTP 端口和 SSL 配置
- 确认邮箱开启了 SMTP 服务

---

## 📄 开源协议

本项目采用 [MIT License](./LICENSE) 开源协议。

---

## 🙏 致谢

感谢以下开源项目：

- [FastAPI](https://fastapi.tiangolo.com/) - 现代 Python Web 框架
- [React](https://react.dev/) - 用户界面库
- [Vite](https://vitejs.dev/) - 前端构建工具
- [TailwindCSS](https://tailwindcss.com/) - CSS 框架
- [Lucide Icons](https://lucide.dev/) - 图标库

---

<p align="center">
  <strong>Made with ❤️ by 千禧</strong>
</p>

<p align="center">
  <a href="https://github.com/your-username">GitHub</a> •
  <a href="mailto:your-email@example.com">Email</a>
</p>
