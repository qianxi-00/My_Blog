# DevLog 博客系统完整部署文档（生产环境）

本文档面向 Linux 服务器（Ubuntu 22.04 / Debian 12 / CentOS 9 均可）。

---

## ✅ 1. 服务器准备

### 1.1 依赖
- Python 3.11+
- Node.js 18+
- MySQL 8.0+
- Nginx

### 1.2 系统更新（示例：Ubuntu）
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential git curl nginx python3-venv python3-dev
```

---

## ✅ 2. 获取项目代码

```bash
cd /data
git clone <your_repo_url> my_blog
cd /data/my_blog
```

---

## ✅ 3. 后端部署（FastAPI）

### 3.1 创建虚拟环境
```bash
cd /data/my_blog/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3.2 配置环境变量
在 [backend/.env](backend/.env) 填写生产配置（请勿使用测试配置）：

```ini
# DB
DB_HOST=<your_db_host>
DB_PORT=3306
DB_USER=<your_db_user>
DB_PASSWORD=<your_db_password>
DB_NAME=<your_db_name>

# Admin
SUPER_ADMIN_USERNAME=<admin_user>
SUPER_ADMIN_PASSWORD=<admin_password>

# JWT
JWT_SECRET_KEY=<random_secret>
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=1440

# OpenAI/Volcengine
OPENAI_API_KEY=<your_api_key>
OPENAI_API_BASE=<your_api_base>
OPENAI_MODEL=<your_model>

# Upload
UPLOAD_DIR=uploads
MAX_UPLOAD_SIZE_MB=10

# App
APP_HOST=0.0.0.0
APP_PORT=8000
DEBUG=false

# SMTP
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=<your_email>
SMTP_PASSWORD=<smtp_auth_code>
SMTP_FROM_EMAIL=<your_email>
SMTP_FROM_NAME=<site_name>
SMTP_USE_SSL=true

# Site
SITE_URL=https://<your-domain>
```

### 3.3 数据库初始化
```bash
alembic upgrade head
```

### 3.4 初始化内容（可选）
```bash
python ../enrich_db.py
```

---

## ✅ 4. 后端服务托管（systemd）

创建服务文件 `/etc/systemd/system/devlog-api.service`：

```ini
[Unit]
Description=DevLog API
After=network.target

[Service]
User=www-data
WorkingDirectory=/data/my_blog/backend
Environment="PATH=/data/my_blog/backend/.venv/bin"
ExecStart=/data/my_blog/backend/.venv/bin/gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker -b 127.0.0.1:8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启动服务：
```bash
sudo systemctl daemon-reload
sudo systemctl enable devlog-api
sudo systemctl start devlog-api
sudo systemctl status devlog-api
```

---

## ✅ 5. 前端部署（Vite）

### 5.1 配置 API 地址
在前端生产环境下使用 `VITE_API_BASE_URL`：

创建 [frontend/.env.production](frontend/.env.production)：

```ini
VITE_API_BASE_URL=https://<your-domain>
```

### 5.2 构建前端
```bash
cd /data/my_blog/frontend
npm install
npm run build
```

---

## ✅ 6. Nginx 反向代理

创建配置 `/etc/nginx/sites-available/devlog`：

```nginx
server {
    listen 80;
    server_name <your-domain>;

    root /data/my_blog/frontend/dist;
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

启用并重载：
```bash
sudo ln -s /etc/nginx/sites-available/devlog /etc/nginx/sites-enabled/devlog
sudo nginx -t
sudo systemctl reload nginx
```

---

## ✅ 7. HTTPS（推荐）

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <your-domain>
```

---

## ✅ 8. 常用运维命令

```bash
# 查看日志
journalctl -u devlog-api -f

# 重启后端
sudo systemctl restart devlog-api

# 重新加载 nginx
sudo systemctl reload nginx
```

---

## ✅ 9. 关键检查清单

- [ ] 后端服务 `systemctl status devlog-api` 正常
- [ ] 访问 `https://<your-domain>/` 正常
- [ ] 访问 `https://<your-domain>/api/v1/health` 返回 200
- [ ] 上传图片与访问 `/uploads` 正常
- [ ] 发布文章后邮件通知正常（SMTP 配置正确）

---

## ⚠️ 常见问题

### 1) API 403 / 401
- 检查 JWT 配置
- 清理浏览器缓存的旧 Token

### 2) 上传失败
- 检查 `UPLOAD_DIR` 权限
- 确认 Nginx 已代理 `/uploads`

### 3) 邮件发送失败
- 确认 SMTP 授权码正确（非登录密码）
- `SITE_URL` 应为线上域名

---

部署完成后，默认管理后台入口：
`https://<your-domain>/#/admin`
