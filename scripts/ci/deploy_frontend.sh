#!/usr/bin/env bash
# CI/CD 前端部署脚本 —— 在生产服务器上执行（由 GitHub Actions 通过 SSH 调用，也可手动跑）。
#
# 用法: bash scripts/ci/deploy_frontend.sh
#
# 流程: fetch+reset → 服务器上 npm ci + build（代码即真相，不经产物上传，
#       彻底避开"上传没生效/md5 对不上"这类坑）→ 原子替换 dist
#       → 保留 uploads/data/.well-known/live2d（线上内容，不在仓库里）
#       → 新 chunk 落盘校验 + 公网冒烟 → 失败自动恢复旧目录
#
# 前提: 宿主 node >= 20（服务器实测 v22.23.1）
set -euo pipefail

REPO=/data/blog/repo-tmp
LIVE=/var/www/blog/dist

command -v node >/dev/null || { echo "!! 服务器没有 node，先装 node >= 20"; exit 1; }
node -e 'process.exit(process.version<"v20" ? 1 : 0)' || { echo "!! node 版本过低: $(node --version)"; exit 1; }

cd "$REPO"
export GIT_SSH_COMMAND="ssh -i /root/.ssh/github_my_blog_deploy_repo -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
git fetch origin master
git reset --hard origin/master
echo "  代码: $(git rev-parse --short HEAD) ($(git log -1 --format=%s | head -c 60))"

echo "=== 1/4 构建（服务器本地，代码即产物）==="
cd frontend
npm ci --no-audit --no-fund 2>&1 | tail -2
npm run build 2>&1 | grep -E 'built in|error' | tail -2
[ -d dist ] && [ -f dist/index.html ] || { echo "!! 构建产物缺失"; exit 1; }

echo "=== 2/4 组装新 dist（保留线上内容目录）==="
TS=$(date +%Y%m%d-%H%M%S)
T=$(mktemp -d /tmp/ci_fe.XXXXXX)
NEW="$T/dist"
cp -a dist "$NEW"
mkdir -p "/data/My_Blog/_backup/ci-fe-$TS"
cp -a "$LIVE"/. "/data/My_Blog/_backup/ci-fe-$TS"/ 2>/dev/null || true
for d in uploads data .well-known live2d; do
  if [ -d "$LIVE/$d" ]; then
    rm -rf "$NEW/$d"
    cp -a "$LIVE/$d" "$NEW/$d"
    echo "  保留 $d ($(/usr/bin/find "$LIVE/$d" -type f 2>/dev/null | wc -l) 文件)"
  fi
done

echo "=== 3/4 原子替换 ==="
mv "$LIVE" "/var/www/blog/dist.old-fe-$TS"
mv "$NEW" "$LIVE"
chown -R www-data:www-data "$LIVE"

echo "=== 4/4 验证 ==="
M=$(grep -o '/assets/index-[A-Za-z0-9_-]*\.js' "$LIVE/index.html" | head -1)
if [ ! -f "$LIVE$M" ]; then
  echo "!! 新 chunk $M 不在磁盘上，恢复旧目录"
  rm -rf "$LIVE"; mv "/var/www/blog/dist.old-fe-$TS" "$LIVE"
  exit 1
fi
HOME=$(curl -s -o /dev/null -w '%{http_code}' https://blog.qianxi7988.me/)
CHUNK=$(curl -s -o /dev/null -w '%{http_code}' "https://blog.qianxi7988.me$M")
[ "$HOME" = "200" ] && [ "$CHUNK" = "200" ] || { echo "!! 公网冒烟失败 home=$HOME chunk=$CHUNK，恢复旧目录"; rm -rf "$LIVE"; mv "/var/www/blog/dist.old-fe-$TS" "$LIVE"; exit 1; }
echo "  生效 chunk: $M (home=$HOME chunk=$CHUNK)"
echo "DEPLOY_FRONTEND_OK $M"

# 清理旧备份，保留最近 2 份
ls -d /var/www/blog/dist.old-fe-* 2>/dev/null | sort | head -n -2 | xargs -r rm -rf
