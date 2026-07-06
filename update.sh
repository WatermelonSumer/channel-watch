#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BRANCH="${DEPLOY_BRANCH:-feat/hero}"

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

echo "==> [1/4] 拉取最新代码 (branch: $BRANCH)..."
git fetch origin
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "==> [2/4] 构建 Docker 镜像..."
compose build --no-cache

echo "==> [3/4] 停止旧容器..."
compose down

echo "==> [4/4] 启动新容器..."
compose up -d

echo ""
echo "✅ 更新完成。查看日志: docker compose logs -f"
