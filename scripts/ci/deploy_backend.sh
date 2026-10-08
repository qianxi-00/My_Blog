#!/usr/bin/env bash
# CI/CD 后端部署脚本 —— 在生产服务器上执行（由 GitHub Actions 通过 SSH 调用，也可手动跑）。
#
# 用法: bash scripts/ci/deploy_backend.sh <镜像tag后缀>   # 例如 ci-123
#
# 流程: fetch+reset 到 origin/master → 容器内构建镜像 → 镜像自检（import + 技能构建）
#       → 切换生产容器 → health check（90s）→ 公网冒烟
#       → 任何一步失败：回滚到上一个容器，exit 1（Actions 标红）
#
# 设计约束:
# - 生产密钥（JWT/SMTP 等）只存在于现有容器的 env 里，用 docker inspect 抓取后经
#   临时 env-file（0600）注入新容器，绝不落仓库/日志
# - 所有部署产物用 tag 管理（qianxi-blog:ci-<run_number>），回滚 = 切回 prev 容器
set -euo pipefail

TAG_SUFFIX="${1:-manual-$(date +%Y%m%d%H%M%S)}"
IMAGE="qianxi-blog:${TAG_SUFFIX}"
REPO=/data/blog/repo-tmp
LIVE=qianxi-blog

cd "$REPO"
export GIT_SSH_COMMAND="ssh -i /root/.ssh/github_my_blog_deploy_repo -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
git fetch origin master
git reset --hard origin/master
echo "  代码: $(git rev-parse --short HEAD) ($(git log -1 --format=%s | head -c 60))"

echo "=== 1/5 构建镜像 $IMAGE ==="
B=$(mktemp -d)
git archive HEAD backend | tar -x -C "$B"
docker build -q -t "$IMAGE" -f "$B/backend/Dockerfile" "$B/backend" >/tmp/ci_build.log 2>&1 \
  || { echo "!! 镜像构建失败"; tail -20 /tmp/ci_build.log; exit 1; }
rm -rf "$B"

echo "=== 2/5 镜像自检（切换生产前挡住 import/技能构建错误）==="
docker run --rm --entrypoint python3 "$IMAGE" -c "
import sys; sys.path.insert(0,'/app')
import app.main
from app.services.agent.registry import build_all_tools
n = len(build_all_tools('super_admin'))
print('  技能可构建:', n)
assert n > 50, f'技能数异常: {n}'
" | sed 's/^/  /'

echo "=== 3/5 切换生产容器 ==="
ENVF=$(mktemp /tmp/ci_env.XXXXXX); chmod 600 "$ENVF"
docker inspect "$LIVE" --format '{{range .Config.Env}}{{println .}}{{end}}' > "$ENVF"
grep -q '^JWT_SECRET_KEY=' "$ENVF" || { echo "!! 从现容器抓 env 失败（缺 JWT_SECRET_KEY）"; rm -f "$ENVF"; exit 1; }

docker stop "$LIVE" >/dev/null
PREV="qianxi-blog-prev-$(date +%s)"
docker rename "$LIVE" "$PREV"
docker run -d --name "$LIVE" --restart unless-stopped --network blog-net \
  --memory 1g --cpus 2 --env-file "$ENVF" -v /data/blog/data:/data -p 127.0.0.1:8000:7860 \
  "$IMAGE" \
  uvicorn app.main:app --host 0.0.0.0 --port 7860 --workers 2 --proxy-headers --forwarded-allow-ips='*' >/dev/null
rm -f "$ENVF"

echo "=== 4/5 health check（最长 90s，失败自动回滚）==="
ok=0
for i in $(seq 1 90); do
  curl -fsS --max-time 2 http://127.0.0.1:8000/health >/dev/null 2>&1 && { ok=1; break; }
  sleep 1
done
if [ "$ok" != "1" ]; then
  echo "!! 新容器 90s 内未通过 health check，回滚到 $PREV"
  docker rm -f "$LIVE" >/dev/null
  docker rename "$PREV" "$LIVE"
  docker start "$LIVE" >/dev/null
  sleep 3
  curl -fsS --max-time 5 http://127.0.0.1:8000/health >/dev/null && echo "  回滚完成，线上已恢复" || echo "  !! 回滚后 health 仍异常，需要人工介入"
  exit 1
fi
echo "  health: $(curl -fsS --max-time 5 http://127.0.0.1:8000/health)"

echo "=== 5/5 公网冒烟 ==="
API=$(curl -s -o /dev/null -w '%{http_code}' 'https://blog.qianxi7988.me/api/v1/articles?page=1&page_size=1')
HOME=$(curl -s -o /dev/null -w '%{http_code}' https://blog.qianxi7988.me/)
[ "$API" = "200" ] && [ "$HOME" = "200" ] || { echo "!! 公网冒烟失败 api=$API home=$HOME（容器本地健康，可能是网络层问题）"; exit 1; }
echo "  公网 api=$API home=$HOME"

echo "DEPLOY_BACKEND_OK image=$IMAGE prev=$PREV"

# 清理：prev 容器与 ci-* 镜像各保留最近 2 份
docker ps -a --filter "name=^/qianxi-blog-prev-" --format '{{.Names}}' | sort | head -n -2 | xargs -r docker rm -f >/dev/null
docker images qianxi-blog --format '{{.Tag}} {{.ID}}' | grep -E '^(ci-|manual-)' | sort -r | head -n -2 | awk '{print $2}' | xargs -r docker rmi >/dev/null 2>&1 || true
