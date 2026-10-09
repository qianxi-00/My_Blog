#!/usr/bin/env bash
# CI/CD 前端部署脚本 —— 在生产服务器上执行（由 GitHub Actions 通过 SSH 调用，也可手动跑）。
#
# 用法: bash scripts/ci/deploy_frontend.sh <runner构建产物tar.gz的绝对路径>
#
# ⚠️ 红线：本脚本不在服务器上构建。前端构建在 GitHub runner 上完成（frontend-checks
#   job → upload-artifact → deploy job 下载打包 → scp 上传到本机），服务器只做：
#   解包 → 结构校验（挡"传了旧包/坏包/半包"——md5 校验只防"包不同"，结构校验
#   防"包本身不对"）→ 原子替换 dist → 保留线上内容目录 → 公网验证 → 失败回滚。
#
#   （2026-10-08 之前此脚本在服务器上 npm ci + build——宿主机 1G 内存被构建挤爆
#    会伤线上服务，按千禧拍板改为 runner 构建、服务器零构建。）
set -euo pipefail

PKG="${1:-}"
LIVE=/var/www/blog/dist

[ -n "$PKG" ] && [ -f "$PKG" ] || { echo "!! 用法: deploy_frontend.sh <产物tar.gz路径>"; exit 1; }
PKG_SIZE=$(stat -c%s "$PKG")
echo "  产物包: $PKG ($PKG_SIZE B)"

echo "=== 1/4 解包 + 结构校验 ==="
T=$(mktemp -d /tmp/ci_fe.XXXXXX)
NEW="$T/dist"
mkdir -p "$NEW"
tar -xzf "$PKG" -C "$NEW"

# 校验一：必备文件
[ -f "$NEW/index.html" ] || { echo "!! 产物缺 index.html（上传失败或坏包），中止"; exit 1; }
# 校验二：index.html 引用的主 chunk 必须真实存在（挡"半包"）
M=$(grep -o '/assets/index-[A-Za-z0-9_-]*\.js' "$NEW/index.html" | head -1)
[ -n "$M" ] && [ -f "$NEW$M" ] || { echo "!! index.html 引用的主 chunk $M 不在包里（半包），中止"; exit 1; }
# 校验三：产物文件数下限（一个正常 vite build ≥ 50 个文件；显著少于它说明包不完整）
FILE_COUNT=$(find "$NEW" -type f | wc -l)
[ "$FILE_COUNT" -ge 50 ] || { echo "!! 产物仅 $FILE_COUNT 个文件（正常应 ≥50），疑似半包，中止"; exit 1; }
echo "  结构 OK：$FILE_COUNT 个文件，主 chunk $M"

echo "=== 2/4 组装新 dist（保留线上内容目录）==="
TS=$(date +%Y%m%d-%H%M%S)
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
# 换的是刚校验过的同一份 index.html，chunk 必然在盘上；重点验公网生效
HOME_CODE=$(curl -s -o /dev/null -w '%{http_code}' https://blog.qianxi7988.me/)
CHUNK_CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://blog.qianxi7988.me$M")
if [ "$HOME_CODE" != "200" ] || [ "$CHUNK_CODE" != "200" ]; then
  echo "!! 公网冒烟失败 home=$HOME_CODE chunk=$CHUNK_CODE，恢复旧目录"
  rm -rf "$LIVE"; mv "/var/www/blog/dist.old-fe-$TS" "$LIVE"
  exit 1
fi
echo "  生效 chunk: $M (home=$HOME_CODE chunk=$CHUNK_CODE)"
echo "DEPLOY_FRONTEND_OK $M"

rm -rf "$T"
# 清理旧备份，保留最近 2 份
ls -d /var/www/blog/dist.old-fe-* 2>/dev/null | sort | head -n -2 | xargs -r rm -rf
