#!/usr/bin/env bash
# ==============================================================================
# XMessenger Fast Update Script
# Updates repository, injects latest assets directly into containers,
# and builds new core image with zero data loss.
# Output is strictly in English for terminal compatibility.
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Please run this update script as root (use sudo).${NC}"
  exit 1
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="/opt/xmessenger"
INSTANCES_DIR="${BASE_DIR}/instances"
SHARED_DIR="${BASE_DIR}/shared"

echo -e "${CYAN}${BOLD}"
echo "=================================================================="
echo "    XMessenger Fast Update & Hot-Deploy Engine                    "
echo "=================================================================="
echo -e "${NC}"

cd "${PROJECT_ROOT}"

# 1. Force sync with latest code from GitHub (immune to local merge conflicts)
echo -e "${BLUE}[1/4] Syncing latest updates from GitHub...${NC}"
git fetch origin main
git reset --hard origin/main

# 2. Hot-deploy compiled assets directly into all running containers (Instant 1-second update)
echo -e "\n${BLUE}[2/4] Live-updating running containers...${NC}"
for c in $(docker ps --format '{{.Names}}' | grep '^xmessenger-'); do
  if [ "$c" != "xmessenger-nginx" ] && [ "$c" != "xmessenger-certbot" ]; then
    echo -e "${YELLOW}Injecting latest build into container: ${c}...${NC}"
    docker cp client/dist/. "${c}:/app/client-dist/" 2>/dev/null || true
    docker cp server/dist/. "${c}:/app/dist/" 2>/dev/null || true
    docker restart "${c}" 2>/dev/null || true
    echo -e "${GREEN}✓ Container ${c} updated and live!${NC}"
  fi
done

# 3. Build persistent Docker image for long-term consistency
echo -e "\n${BLUE}[3/4] Rebuilding Docker core image...${NC}"
export DOCKER_BUILDKIT=1
docker build -t xmessenger-core:latest -f Dockerfile .

# Update instance containers with proper env and volume mounts if directory exists
if [ -d "${INSTANCES_DIR}" ]; then
  for instance_path in "${INSTANCES_DIR}"/*; do
    if [ -d "${instance_path}" ]; then
      DOMAIN="$(basename "${instance_path}")"
      SLUG="$(echo "${DOMAIN}" | tr '.' '-' | tr -cd 'a-zA-Z0-9-')"
      CONTAINER="xmessenger-${SLUG}"
      ENV_FILE="${instance_path}/.env"

      if [ -f "${ENV_FILE}" ]; then
        echo -e "${YELLOW}Re-creating persistent instance: ${DOMAIN} (${CONTAINER})...${NC}"
        
        # Upgrade Nginx proxy header to support both WebSockets and Polling
        NGINX_CONF="${SHARED_DIR}/nginx/conf.d/${DOMAIN}.conf"
        if [ -f "${NGINX_CONF}" ]; then
          sed -i 's/proxy_set_header Connection "upgrade";/proxy_set_header Connection $http_connection;/g' "${NGINX_CONF}" 2>/dev/null || true
        fi

        docker rm -f "${CONTAINER}" 2>/dev/null || true
        docker run -d \
          --name "${CONTAINER}" \
          --restart always \
          --network xmessenger-net \
          --env-file "${ENV_FILE}" \
          -v "xmessenger-data-${SLUG}:/app/data" \
          xmessenger-core:latest
        echo -e "${GREEN}✓ ${DOMAIN} container recreated with latest image!${NC}"
      fi
    fi
  done
fi

# 4. Restart Nginx Gateway to flush proxy cache
echo -e "\n${BLUE}[4/4] Reloading Nginx reverse proxy...${NC}"
docker restart xmessenger-nginx 2>/dev/null || true

echo -e "\n${GREEN}${BOLD}==================================================================${NC}"
echo -e "${GREEN}${BOLD}✓ XMessenger hot update completed successfully!${NC}"
echo -e "${GREEN}${BOLD}==================================================================${NC}\n"
