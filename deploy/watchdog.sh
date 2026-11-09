#!/usr/bin/env bash
# ==============================================================================
# XMessenger Production Watchdog Daemon
# Continuously monitors Docker daemon, shared Nginx gateway, all backend instances,
# and Certbot renewer. Automatically restarts any stopped, crashed, or hung services.
# Output is strictly in English for terminal / systemd logs.
# ==============================================================================

set -o pipefail

BASE_DIR="/opt/xmessenger"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -d "${BASE_DIR}" ]; then
  cd "${BASE_DIR}"
else
  cd "${PROJECT_ROOT}"
  BASE_DIR="${PROJECT_ROOT}"
fi

SHARED_DIR="${BASE_DIR}/shared"
INSTANCES_DIR="${BASE_DIR}/instances"
LOG_FILE="/var/log/xmessenger-watchdog.log"
POLL_INTERVAL=15

# Ensure log file exists with restricted permissions
touch "${LOG_FILE}" 2>/dev/null || true
chmod 640 "${LOG_FILE}" 2>/dev/null || true

log() {
  local MSG="[$(date '+%Y-%m-%d %H:%M:%S')] [Watchdog] $1"
  echo "$MSG"
  echo "$MSG" >> "${LOG_FILE}" 2>/dev/null || true
}

# Rotate log file if larger than 5 MB
rotate_log() {
  if [ -f "${LOG_FILE}" ]; then
    local SIZE
    SIZE=$(wc -c < "${LOG_FILE}" 2>/dev/null || echo 0)
    if [ "$SIZE" -gt 5242880 ]; then
      mv "${LOG_FILE}" "${LOG_FILE}.1" 2>/dev/null || true
      touch "${LOG_FILE}" 2>/dev/null || true
    fi
  fi
}

# Track failure counts to avoid infinite rapid restart loops
declare -A FAIL_COUNTS

check_docker_daemon() {
  if ! docker info >/dev/null 2>&1; then
    log "[CRITICAL] Docker daemon is not responding! Attempting restart..."
    systemctl restart docker 2>/dev/null || service docker restart 2>/dev/null || true
    sleep 5
    if ! docker info >/dev/null 2>&1; then
      log "[ERROR] Failed to recover Docker daemon."
      return 1
    fi
    log "[INFO] Docker daemon recovered successfully."
  fi

  # Ensure internal bridge network exists
  if ! docker network ls --format '{{.Name}}' | grep -q '^xmessenger-net$'; then
    log "[INFO] Creating missing Docker network xmessenger-net..."
    docker network create xmessenger-net >/dev/null 2>&1 || true
  fi
  return 0
}

check_nginx_gateway() {
  local NGINX_NAME="xmessenger-nginx"
  local RUNNING
  RUNNING=$(docker ps --filter "name=^/${NGINX_NAME}$" --format '{{.Names}}')

  if [ -z "$RUNNING" ]; then
    local EXISTS
    EXISTS=$(docker ps -a --filter "name=^/${NGINX_NAME}$" --format '{{.Names}}')
    if [ -n "$EXISTS" ]; then
      log "[WARNING] Nginx gateway is stopped. Restarting container..."
      docker start "${NGINX_NAME}" >/dev/null 2>&1 || docker restart "${NGINX_NAME}" >/dev/null 2>&1 || true
    else
      log "[WARNING] Nginx gateway container missing. Re-launching..."
      mkdir -p "${SHARED_DIR}/nginx/conf.d" "${SHARED_DIR}/certbot/conf" "${SHARED_DIR}/certbot/www"
      docker run -d \
        --name "${NGINX_NAME}" \
        --restart always \
        --network xmessenger-net \
        -p 80:80 \
        -p 443:443 \
        -v "${SHARED_DIR}/nginx/conf.d:/etc/nginx/conf.d" \
        -v "${SHARED_DIR}/certbot/conf:/etc/letsencrypt" \
        -v "${SHARED_DIR}/certbot/www:/var/www/certbot" \
        nginx:alpine >/dev/null 2>&1 || true
    fi
  else
    # Check if Nginx configuration test passes
    if ! docker exec "${NGINX_NAME}" nginx -t >/dev/null 2>&1; then
      log "[ERROR] Nginx configuration test failed! Checking syntax..."
    fi
  fi
}

check_certbot() {
  local CERTBOT_NAME="xmessenger-certbot"
  local RUNNING
  RUNNING=$(docker ps --filter "name=^/${CERTBOT_NAME}$" --format '{{.Names}}')

  if [ -z "$RUNNING" ]; then
    local EXISTS
    EXISTS=$(docker ps -a --filter "name=^/${CERTBOT_NAME}$" --format '{{.Names}}')
    if [ -n "$EXISTS" ]; then
      docker start "${CERTBOT_NAME}" >/dev/null 2>&1 || true
    else
      docker run -d \
        --name "${CERTBOT_NAME}" \
        --restart unless-stopped \
        --network xmessenger-net \
        -v "${SHARED_DIR}/certbot/conf:/etc/letsencrypt" \
        -v "${SHARED_DIR}/certbot/www:/var/www/certbot" \
        certbot/certbot \
        sh -c 'trap exit TERM; while :; do certbot renew --webroot -w /var/www/certbot; sleep 12h & wait $${!}; done;' >/dev/null 2>&1 || true
    fi
  fi
}

check_instance_container() {
  local DOMAIN="$1"
  local SLUG="$2"
  local CONTAINER_NAME="xmessenger-${SLUG}"

  local STATUS
  STATUS=$(docker inspect --format '{{.State.Status}}' "${CONTAINER_NAME}" 2>/dev/null || echo "missing")

  if [ "$STATUS" = "missing" ]; then
    # Container was completely removed; re-create from .env if available
    local ENV_FILE="${INSTANCES_DIR}/${DOMAIN}/.env"
    if [ -f "$ENV_FILE" ]; then
      log "[WARNING] Container ${CONTAINER_NAME} for ${DOMAIN} is missing. Re-launching..."
      docker run -d \
        --name "${CONTAINER_NAME}" \
        --restart always \
        --network xmessenger-net \
        --env-file "${ENV_FILE}" \
        -v "xmessenger-data-${SLUG}:/app/data" \
        xmessenger-core:latest >/dev/null 2>&1 || true
      FAIL_COUNTS["${CONTAINER_NAME}"]=0
    fi
    return
  fi

  if [ "$STATUS" != "running" ]; then
    log "[WARNING] Container ${CONTAINER_NAME} (${DOMAIN}) is in state '${STATUS}'. Restarting..."
    docker start "${CONTAINER_NAME}" >/dev/null 2>&1 || docker restart "${CONTAINER_NAME}" >/dev/null 2>&1 || true
    FAIL_COUNTS["${CONTAINER_NAME}"]=0
    return
  fi

  # Check Docker healthcheck status or HTTP responsiveness
  local HEALTH
  HEALTH=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${CONTAINER_NAME}" 2>/dev/null || echo "none")

  local IS_UNHEALTHY=0
  if [ "$HEALTH" = "unhealthy" ]; then
    IS_UNHEALTHY=1
  else
    # Query internal health endpoint directly inside container
    local RES
    RES=$(docker exec "${CONTAINER_NAME}" node -e "
      const http = require('http');
      const req = http.get('http://127.0.0.1:3001/api/health', { timeout: 4000 }, (r) => {
        process.exit(r.statusCode === 200 ? 0 : 1);
      });
      req.on('error', () => process.exit(1));
      req.on('timeout', () => { req.destroy(); process.exit(1); });
    " 2>/dev/null && echo "ok" || echo "fail")

    if [ "$RES" != "ok" ]; then
      IS_UNHEALTHY=1
    fi
  fi

  if [ "$IS_UNHEALTHY" -eq 1 ]; then
    local CURRENT_FAILS=${FAIL_COUNTS["${CONTAINER_NAME}"]:-0}
    CURRENT_FAILS=$((CURRENT_FAILS + 1))
    FAIL_COUNTS["${CONTAINER_NAME}"]=$CURRENT_FAILS

    if [ "$CURRENT_FAILS" -ge 3 ]; then
      log "[ALERT] Container ${CONTAINER_NAME} (${DOMAIN}) failed 3 health checks! Performing recovery restart..."
      docker restart -t 10 "${CONTAINER_NAME}" >/dev/null 2>&1 || true
      FAIL_COUNTS["${CONTAINER_NAME}"]=0
    else
      log "[NOTICE] Container ${CONTAINER_NAME} missed health check (${CURRENT_FAILS}/3)."
    fi
  else
    FAIL_COUNTS["${CONTAINER_NAME}"]=0
  fi
}

run_watchdog_cycle() {
  rotate_log

  if ! check_docker_daemon; then
    return 1
  fi

  check_nginx_gateway
  check_certbot

  # Scan and check all configured domain instances
  if [ -d "${INSTANCES_DIR}" ]; then
    for d in $(find "${INSTANCES_DIR}" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; 2>/dev/null | sort || true); do
      [ -z "$d" ] && continue
      local s
      s=$(echo "$d" | tr '.' '-' | tr -cd 'a-zA-Z0-9-')
      check_instance_container "$d" "$s"
    done
  fi
}

# If run with --once argument, execute single check and exit
if [ "$1" = "--once" ]; then
  log "[INFO] Running single watchdog health verification cycle..."
  run_watchdog_cycle
  log "[INFO] Verification cycle completed."
  exit 0
fi

# Daemon Mode
log "[INFO] XMessenger Watchdog Daemon started. Monitoring services every ${POLL_INTERVAL}s."

trap 'log "[INFO] Watchdog Daemon shutting down."; exit 0' SIGTERM SIGINT

while true; do
  run_watchdog_cycle
  sleep "${POLL_INTERVAL}" &
  wait $!
done
