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
#
# 三十九期（2026-10-29）两处改动，起因是「页面出错了：Failed to fetch dynamically
# imported module」——见 AGENTS.md 三十八期。两个问题的共同点是「部署动作自己制造的
# 故障」：
#   1) 旧 chunk 保留：以前是整目录替换，本次构建没产出的 chunk 全部消失。已经打开的
#      标签页在下次切路由时 import() 拿 404 → 冒到唯一 ErrorBoundary → 整页报错。
#      现在把「新包没有、但仍在 KEEP_DAYS 天内」的 assets 文件带进新 dist，超期的自然
#      淘汰；再按 ASSETS_CAP_MB 兜一道体积上限，防止一天部署十几次时无限膨胀。
#   2) 备份目录裁剪：`_backup/ci-fe-*` 是全量副本，脚本从来没清理过，实测积到
#      45 份 / 5.3G。现在只保留最近 BACKUP_KEEP 份（回滚真正依赖的是 dist.old-fe-*）。
set -euo pipefail

PKG="${1:-}"
LIVE=/var/www/blog/dist

# 保留策略（可用环境变量覆盖）
KEEP_DAYS="${KEEP_DAYS:-3}"            # 旧 chunk 最多在 dist 里留几天
ASSETS_CAP_MB="${ASSETS_CAP_MB:-64}"   # dist/assets 体积上限，超了从最老的旧 chunk 删起
BACKUP_KEEP="${BACKUP_KEEP:-3}"        # /data/My_Blog/_backup/ci-fe-* 保留份数

[ -n "$PKG" ] && [ -f "$PKG" ] || { echo "!! 用法: deploy_frontend.sh <产物tar.gz路径>"; exit 1; }
PKG_SIZE=$(stat -c%s "$PKG")
echo "  产物包: $PKG ($PKG_SIZE B)"

echo "=== 1/5 解包 + 结构校验 ==="
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

echo "=== 2/5 组装新 dist（保留线上内容目录 + 未过期旧 chunk）==="
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p "/data/My_Blog/_backup/ci-fe-$TS"
cp -a "$LIVE"/. "/data/My_Blog/_backup/ci-fe-$TS"/ 2>/dev/null || true
for d in uploads data .well-known live2d; do
  if [ -d "$LIVE/$d" ]; then
    rm -rf "$NEW/$d"
    cp -a "$LIVE/$d" "$NEW/$d"
    echo "  保留 $d ($(find "$LIVE/$d" -type f 2>/dev/null | wc -l) 文件)"
  fi
done

# 本次构建自带的 chunk 名单——裁剪时绝不碰它们
FRESH="$T/fresh-assets.txt"
: > "$FRESH"
if [ -d "$NEW/assets" ]; then
  find "$NEW/assets" -maxdepth 1 -type f -printf '%f\n' | sort > "$FRESH"
fi

# 携带旧 chunk：本次构建已不再引用、但仍在保留期内的 assets 文件一并带进新 dist。
# 否则部署前就打开的标签页在下次切路由时 import() 会 404 → 整页「页面出错了」。
CARRIED=0
if [ -d "$LIVE/assets" ] && [ -d "$NEW/assets" ]; then
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    b="${f##*/}"
    if grep -qxF "$b" "$FRESH"; then continue; fi
    cp -a "$f" "$NEW/assets/$b"
    CARRIED=$((CARRIED + 1))
  done < <(find "$LIVE/assets" -maxdepth 1 -type f -mtime -"$KEEP_DAYS" 2>/dev/null || true)
fi
echo "  携带未过期旧 chunk $CARRIED 个（保留 ${KEEP_DAYS} 天）"

# 体积上限：携带多了就从最老的旧 chunk 删起（本次构建自带的永不删）
if [ -d "$NEW/assets" ]; then
  CUR_MB=$(( $(du -sk "$NEW/assets" | cut -f1) / 1024 ))
  if [ "$CUR_MB" -gt "$ASSETS_CAP_MB" ]; then
    OVER_KB=$(( (CUR_MB - ASSETS_CAP_MB) * 1024 ))
    find "$NEW/assets" -maxdepth 1 -type f -printf '%T@\t%s\t%p\n' | sort -n | \
    while IFS=$'\t' read -r _ sz p; do
      if [ "$OVER_KB" -le 0 ]; then break; fi
      b="${p##*/}"
      if grep -qxF "$b" "$FRESH"; then continue; fi
      rm -f "$p"
      OVER_KB=$(( OVER_KB - sz / 1024 ))
    done
    echo "  assets 超 ${ASSETS_CAP_MB}MB，已裁剪至 $(du -sh "$NEW/assets" | cut -f1)"
  fi
fi

echo "=== 3/5 原子替换 ==="
mv "$LIVE" "/var/www/blog/dist.old-fe-$TS"
mv "$NEW" "$LIVE"
chown -R www-data:www-data "$LIVE"

echo "=== 4/5 验证 ==="
# 换的是刚校验过的同一份 index.html，chunk 必然在盘上；重点验公网生效
HOME_CODE=$(curl -s -o /dev/null -w '%{http_code}' https://blog.qianxi7988.me/)
CHUNK_CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://blog.qianxi7988.me$M")
if [ "$HOME_CODE" != "200" ] || [ "$CHUNK_CODE" != "200" ]; then
  echo "!! 公网冒烟失败 home=$HOME_CODE chunk=$CHUNK_CODE，恢复旧目录"
  rm -rf "$LIVE"; mv "/var/www/blog/dist.old-fe-$TS" "$LIVE"
  exit 1
fi
echo "  生效 chunk: $M (home=$HOME_CODE chunk=$CHUNK_CODE)"

# 顺带抽查一个携带过来的旧 chunk —— 这正是本次改动的目的，验不到等于没做。
# 抽查失败不阻断发布（旧标签页本来就是尽力而为），只打警告。
if [ "$CARRIED" -gt 0 ] && [ -s "$FRESH" ]; then
  OLD_B=$(find "$LIVE/assets" -maxdepth 1 -type f -printf '%f\n' | sort \
          | grep -vxF -f "$FRESH" | head -1 || true)
  if [ -n "${OLD_B:-}" ]; then
    OLD_CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://blog.qianxi7988.me/assets/$OLD_B")
    echo "  旧 chunk 抽查: /assets/$OLD_B → $OLD_CODE"
    [ "$OLD_CODE" = "200" ] || echo "  ⚠️ 旧 chunk 抽查非 200（不影响本次发布，但保留机制可能没生效）"
  fi
fi
echo "DEPLOY_FRONTEND_OK $M"

echo "=== 5/5 清理 ==="
rm -rf "$T"
# 旧 dist 目录保留最近 2 份（回滚路径：mv dist.old-fe-<TS> dist）
ls -d /var/www/blog/dist.old-fe-* 2>/dev/null | sort | head -n -2 | xargs -r rm -rf || true
# _backup 全量副本保留最近 BACKUP_KEEP 份（三十九期加：此前无上限，实测积到 5.3G / 45 份）
ls -d /data/My_Blog/_backup/ci-fe-* 2>/dev/null | sort | head -n -"$BACKUP_KEEP" | xargs -r rm -rf || true
echo "  保留 dist.old-fe-* $(ls -d /var/www/blog/dist.old-fe-* 2>/dev/null | wc -l) 份 / _backup/ci-fe-* $(ls -d /data/My_Blog/_backup/ci-fe-* 2>/dev/null | wc -l) 份"
