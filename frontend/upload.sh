#!/bin/bash

# 上传前端 dist 文件到服务器

REMOTE_USER="root"
REMOTE_HOST="YOUR_SERVER_IP"
REMOTE_PATH="/data/My_Blog/frontend"

echo "正在上传前端文件到服务器..."

# 使用 rsync 上传（需要安装 rsync）
# rsync -avz --delete ./dist/ ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/dist/

# 或使用 scp
scp -r ./dist/* ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/dist/

echo "上传完成！"
echo ""
echo "请在服务器上执行以下命令："
echo "  cd /data/My_Blog/frontend"
echo "  sudo systemctl reload nginx"
echo "  sudo systemctl restart devlog-api"
