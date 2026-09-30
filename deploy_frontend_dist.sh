#!/usr/bin/env bash
set -Eeuo pipefail

PKG_PATH="${1:-}"
APP_ROOT="/data/My_Blog/frontend"
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

LIVE2D_SRC=""
if [[ -d "$APP_ROOT/public/live2d" ]]; then
  LIVE2D_SRC="$APP_ROOT/public/live2d"
elif [[ -d "$APP_ROOT/live2d" ]]; then
  LIVE2D_SRC="$APP_ROOT/live2d"
fi

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
