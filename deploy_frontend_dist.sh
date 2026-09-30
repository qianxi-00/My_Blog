#!/usr/bin/env bash
set -Eeuo pipefail

PKG_PATH="${1:-}"
# 部署目标必须与 nginx root（/etc/nginx/sites-enabled/blog 的 root）一致，
# 否则会把产物写进没人读的目录（2026-09-30 实测踩过）。
NGINX_ROOT="/var/www/blog"
APP_ROOT="$NGINX_ROOT"
DIST_DIR="$APP_ROOT/dist"
TMP_ROOT="$(mktemp -d /tmp/deploy-frontend-dist.XXXXXX)"
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="/data/My_Blog/_backup/live-dist-before-deploy-$TS"

cleanup(){ rm -rf "$TMP_ROOT"; }
trap cleanup EXIT

rollback(){
  if [[ -d "${DIST_DIR}.old" ]]; then
    rm -rf "$DIST_DIR" || true
    mv "${DIST_DIR}.old" "$DIST_DIR"
  fi
}
trap 'echo "[ERROR] deploy failed, rolling back"; rollback' ERR

[[ -n "$PKG_PATH" ]] || { echo "usage: $0 /path/to/frontend-dist.tar.gz"; exit 1; }
[[ -f "$PKG_PATH" ]] || { echo "package not found: $PKG_PATH"; exit 1; }

tar -tzf "$PKG_PATH" >/dev/null
mkdir -p "$TMP_ROOT/extract"
tar -xzf "$PKG_PATH" -C "$TMP_ROOT/extract"

if [[ -d "$TMP_ROOT/extract/frontend/dist" ]]; then
  NEW_DIST="$TMP_ROOT/extract/frontend/dist"
elif [[ -d "$TMP_ROOT/extract/dist" ]]; then
  NEW_DIST="$TMP_ROOT/extract/dist"
else
  echo "invalid package: dist dir missing"; exit 1
fi

[[ -s "$NEW_DIST/index.html" ]] || { echo "invalid package: index.html missing"; exit 1; }
find "$NEW_DIST/assets" -type f -name '*.js' | grep -q . || { echo "invalid package: no js bundle"; exit 1; }
grep -q '/assets/' "$NEW_DIST/index.html" || { echo "invalid package: index.html no /assets/ refs"; exit 1; }

mkdir -p "$BACKUP_DIR"
if [[ -d "$DIST_DIR" ]]; then
  cp -a "$DIST_DIR"/. "$BACKUP_DIR"/
fi

rm -rf "${DIST_DIR}.old"
if [[ -d "$DIST_DIR" ]]; then mv "$DIST_DIR" "${DIST_DIR}.old"; fi
mkdir -p "$DIST_DIR"
cp -a "$NEW_DIST"/. "$DIST_DIR"/

# 2029-09-30：这三样不是前端构建产物，每次部署都必须从上一版原样带过来。
# 之前整目录 mv 掉再只搬 live2d，导致：
#   - uploads/（用户上传图）被清空，实测一次部署就丢了 5 张
#   - .well-known/（ACME 证书续期）整目录消失
#   - data/（AI 日更 cron 每 30 分钟写入）被清空
PRESERVE_DIRS=(uploads .well-known data live2d)
for d in "${PRESERVE_DIRS[@]}"; do
  OLD_DIR="${DIST_DIR}.old/$d"
  [[ -d "$OLD_DIR" ]] || continue
  mkdir -p "$DIST_DIR/$d"
  # union 合并：只补"线上有、新包里没有"的文件，绝不覆盖新包内容。
  # （第一版写成"目录不存在才整目录搬"，结果前端包自带 dist/uploads 时条件不成立，
  #   把线上原有的 52 张图换成新包的 47 张，又丢 5 张 —— 2026-09-30 实测踩到）
  while IFS= read -r f; do
    [[ -e "$DIST_DIR/$d/$f" ]] || cp -a "$OLD_DIR/$f" "$DIST_DIR/$d/$f"
  done < <(cd "$OLD_DIR" && find . -type f -print0 | xargs -0 -I{} echo {})
  echo "[preserve] $d/ 合并完成（$(find "$DIST_DIR/$d" -type f | wc -l) 个文件）"
done

if [[ -n "$LIVE2D_SRC" ]]; then
  rm -rf "$DIST_DIR/live2d"
  cp -a "$LIVE2D_SRC" "$DIST_DIR/live2d"
  find "$DIST_DIR/live2d" -type d -exec chmod 755 {} +
  find "$DIST_DIR/live2d" -type f -exec chmod 644 {} +
fi

chown -R www-data:www-data "$DIST_DIR" || true

[[ -s "$DIST_DIR/index.html" ]]
find "$DIST_DIR/assets" -type f -name '*.js' | grep -q .
grep -n 'index-.*\.js' "$DIST_DIR/index.html" | head -n 1 || true

echo "DEPLOY_OK backup=$BACKUP_DIR"
