#!/usr/bin/env bash
# ==============================================================================
# XMessenger Continuous Auto-Update Daemon
# Watches GitHub origin/main for new commits every 10 seconds.
# When a new commit is detected on GitHub, it automatically pulls,
# copies the compiled assets directly into containers, and flushes Nginx/Docker.
# Output is strictly in English for terminal / systemd logs.
# ==============================================================================

BASE_DIR="/opt/xmessenger"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -d "${BASE_DIR}" ]; then
  cd "${BASE_DIR}"
else
  cd "${PROJECT_ROOT}"
  BASE_DIR="${PROJECT_ROOT}"
fi

git config --global --add safe.directory "${BASE_DIR}" 2>/dev/null || true

check_and_update() {
  local LOCAL_HEAD
  local REMOTE_HEAD

  LOCAL_HEAD=$(git rev-parse HEAD 2>/dev/null || echo "none")

  # Fetch latest remote commits from origin/main (with 10s network connect timeout)
  rm -f "${BASE_DIR}/.git/index.lock" "${BASE_DIR}/.git/FETCH_HEAD.lock" 2>/dev/null || true
  export GIT_TERMINAL_PROMPT=0
  timeout 15 git -c http.connectTimeout=10 -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=10 fetch origin main >/dev/null 2>&1 || return 0
  REMOTE_HEAD=$(git rev-parse origin/main 2>/dev/null || echo "none")

  if [ "$LOCAL_HEAD" != "$REMOTE_HEAD" ] && [ "$REMOTE_HEAD" != "none" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [AutoUpdate] New commit detected (${LOCAL_HEAD:0:7} -> ${REMOTE_HEAD:0:7}). Executing auto-update..."

    # 1. Force reset to remote main
    git reset --hard origin/main >/dev/null 2>&1

    # Ensure executable permissions & symlinks
    chmod +x "${BASE_DIR}/deploy/xmessenger.sh" "${BASE_DIR}/update.sh" "${BASE_DIR}/deploy/autoupdate.sh" 2>/dev/null || true
    ln -sf "${BASE_DIR}/deploy/xmessenger.sh" /usr/local/bin/xmessenger 2>/dev/null || true
    ln -sf "${BASE_DIR}/update.sh" /usr/local/bin/xupdate 2>/dev/null || true

    # 2. Update all running xmessenger app containers across all domains
    CONTAINERS=$(docker ps -a --format '{{.Names}}' | grep '^xmessenger-' | grep -v 'nginx' | grep -v 'certbot' || true)
    for c in $CONTAINERS; do
      [ -z "$c" ] && continue
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] [AutoUpdate] Injecting dist into ${c}..."
      docker cp VERSION "${c}:/app/VERSION" 2>/dev/null || true
      docker cp client/dist/. "${c}:/app/client-dist/" 2>/dev/null || true
      docker cp server/dist/. "${c}:/app/dist/" 2>/dev/null || true
      docker restart "${c}" >/dev/null 2>&1 || true
    done

    # 3. Ensure Nginx Gateway is started and restarted to flush proxy cache
    docker start xmessenger-nginx >/dev/null 2>&1 || true
    docker restart xmessenger-nginx >/dev/null 2>&1 || true

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [AutoUpdate] Auto-update successfully completed! Running commit: ${REMOTE_HEAD:0:7}"
  fi
}

# Single run flag (for cron or manual trigger)
if [ "$1" == "--once" ]; then
  check_and_update
  exit 0
fi

# Daemon Mode (runs continuously every 10 seconds)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [AutoUpdate] Daemon started. Monitoring origin/main every 10 seconds..."
while true; do
  check_and_update
  sleep 10
done
