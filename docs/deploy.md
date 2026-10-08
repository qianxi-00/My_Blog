# 部署指南

本项目按「容器跑后端、Nginx 供静态」的常规形态部署，文档站（本站）与博客主体相互独立：博客部署在你自己的服务器，文档站由 GitHub Pages 托管。

## 博客主体

### 前置条件

- Docker（后端以容器方式交付）
- Nginx（HTTPS 终止 + 静态资源 + API 反代）
- 一个 OpenAI 兼容的模型接口（看板娘与后台 AI 助手依赖）
- SMTP 账号（订阅邮件、验证码邮件依赖）

### 后端

```bash
# 构建镜像（后端 Dockerfile 在 backend/ 下）
docker build -t my-blog:<tag> backend/

# 运行：SQLite 单文件随数据卷持久化，环境变量注入配置
docker run -d --name my-blog --restart unless-stopped \
  -v /your/data:/data \
  -p 127.0.0.1:8000:7860 \
  --env-file .env \
  my-blog:<tag> \
  uvicorn app.main:app --host 0.0.0.0 --port 7860 --workers 2 \
  --proxy-headers --forwarded-allow-ips='*'
```

数据库文件在数据卷内自建，首次启动自动建表；SQLite 开启 WAL，多 worker 并发下不需要额外调优。

### 前端

```bash
cd frontend
npm install
npm run build          # 产物在 dist/
# 将 dist/ 交给 Nginx 供出；SPA 路由需要 history fallback
```

### Nginx 要点

- `location /` 供静态文件 + SPA fallback
- `location /api/` 与 `location /uploads/` 反代/映射到后端容器
- 开启 gzip（JS/CSS/Markdown 效果显著）
- HTTPS 证书按你的方式配（acme.sh / certbot 均可）

### 回滚

镜像按 tag 交付（`my-blog:<tag>`），回滚即切回上一个 tag 重新 `docker run`，数据卷不动，秒级完成。

> 完整的部署脚本与运维细节在仓库的 [DEPLOY.md](https://github.com/qianxi-00/My_Blog/blob/master/DEPLOY.md) 与 `scripts/` 目录。

## 本文档站

本站使用 **VitePress** 构建，**GitHub Actions** 自动部署到 **GitHub Pages**：

1. 文档源文件在仓库 `docs/` 目录，Markdown 撰写
2. 推送 `master` 分支后，[deploy-docs.yml](https://github.com/qianxi-00/My_Blog/blob/master/.github/workflows/deploy-docs.yml) 工作流自动触发
3. Actions 在云端 `npm ci` + `vitepress build`，产物直接发布到 Pages

访问地址：<https://qianxi-00.github.io/My_Blog/>

本地写作：

```bash
cd docs
npm install
npm run docs:dev      # 本地预览 http://localhost:5173
npm run docs:build    # 本地构建验证
```

新增页面只需在 `docs/` 下加 `.md` 文件，并在 `.vitepress/config.ts` 的 `sidebar` 里登记。
