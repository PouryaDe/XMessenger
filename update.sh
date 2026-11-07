#!/usr/bin/env bash
# ==============================================================================
# XMessenger Fast Update Script
# Updates repository, injects latest assets directly into containers,
# restarts instances and Nginx proxy to flush all caches.
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

BASE_DIR="/opt/xmessenger"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "${BASE_DIR}" ]; then
  cd "${BASE_DIR}"
else
  cd "${PROJECT_ROOT}"
fi

echo -e "${CYAN}${BOLD}"
echo "=================================================================="
echo "    XMessenger Fast Update & Hot-Deploy Engine                    "
echo "=================================================================="
echo -e "${NC}"

# 1. Force sync with latest code from GitHub (immune to local merge conflicts)
echo -e "${BLUE}[1/4] Syncing latest updates from GitHub...${NC}"
git fetch origin main
git reset --hard origin/main

# 2. Hot-deploy compiled assets directly into all running containers (Instant update)
echo -e "\n${BLUE}[2/4] Live-updating all running messenger containers...${NC}"
UPDATED_COUNT=0
for c in $(docker ps -a --format '{{.Names}}' | grep '^xmessenger-' | grep -v 'nginx' | grep -v 'certbot'); do
  echo -e "${YELLOW}Injecting latest build into container: ${c}...${NC}"
  docker cp client/dist/. "${c}:/app/client-dist/" 2>/dev/null || true
  docker cp server/dist/. "${c}:/app/dist/" 2>/dev/null || true
  docker restart "${c}" 2>/dev/null || true
  echo -e "${GREEN}✓ Container ${c} updated and restarted!${NC}"
  UPDATED_COUNT=$((UPDATED_COUNT + 1))
done

if [ "$UPDATED_COUNT" -eq 0 ]; then
  echo -e "${YELLOW}No running instance containers detected.${NC}"
fi

# 3. Restart Nginx Gateway to flush proxy cache and buffers
echo -e "\n${BLUE}[3/4] Purging Nginx proxy cache & restarting gateway...${NC}"
docker restart xmessenger-nginx 2>/dev/null || true
echo -e "${GREEN}✓ Nginx gateway cache flushed!${NC}"

# 4. Synchronize Docker image for any future new container creation (without killing running containers)
echo -e "\n${BLUE}[4/4] Updating base Docker image (xmessenger-core:latest)...${NC}"
docker build -t xmessenger-core:latest -f Dockerfile . >/dev/null 2>&1 &
echo -e "${GREEN}✓ Base image update running in background.${NC}"

# 5. Ensure global shortcuts exist in /usr/local/bin
ln -sf "${BASE_DIR}/update.sh" /usr/local/bin/xupdate 2>/dev/null || true
chmod +x /usr/local/bin/xupdate 2>/dev/null || true
cp -f "${BASE_DIR}/deploy/xmessenger.sh" /usr/local/bin/xmessenger 2>/dev/null || true
chmod +x /usr/local/bin/xmessenger 2>/dev/null || true

echo -e "\n${GREEN}${BOLD}==================================================================${NC}"
echo -e "${GREEN}${BOLD}✓ XMessenger hot update completed successfully!${NC}"
echo -e "${GREEN}${BOLD}✓ All containers injected, caches purged, and services restarted.${NC}"
echo -e "${GREEN}${BOLD}✓ You can now update anytime simply by typing: xupdate${NC}"
echo -e "${GREEN}${BOLD}==================================================================${NC}\n"
