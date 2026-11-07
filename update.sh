#!/usr/bin/env bash
# ==============================================================================
# XMessenger Fast Update Script
# Updates repository, builds new core image, and recreates containers with zero data loss
# Output is strictly in English for terminal compatibility
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

echo -e "${CYAN}${BOLD}"
echo "=================================================================="
echo "    XMessenger Fast Update & Deployment Engine                    "
echo "=================================================================="
echo -e "${NC}"

cd "${PROJECT_ROOT}"

# 1. Pull latest code from GitHub
echo -e "${BLUE}[1/4] Pulling latest updates from GitHub...${NC}"
git pull origin main

# 2. Build updated Docker image
echo -e "\n${BLUE}[2/4] Building optimized container image...${NC}"
export DOCKER_BUILDKIT=1
docker build -t xmessenger-core:latest -f Dockerfile .

# 3. Recreate active messenger containers
echo -e "\n${BLUE}[3/4] Recreating instance containers with latest image...${NC}"

if [ -d "${INSTANCES_DIR}" ]; then
  for instance_path in "${INSTANCES_DIR}"/*; do
    if [ -d "${instance_path}" ]; then
      DOMAIN="$(basename "${instance_path}")"
      SLUG="$(echo "${DOMAIN}" | tr '.' '-' | tr -cd 'a-zA-Z0-9-')"
      CONTAINER="xmessenger-${SLUG}"
      ENV_FILE="${instance_path}/.env"

      if [ -f "${ENV_FILE}" ]; then
        echo -e "${YELLOW}Updating instance: ${DOMAIN} (${CONTAINER})...${NC}"
        docker rm -f "${CONTAINER}" 2>/dev/null || true
        docker run -d \
          --name "${CONTAINER}" \
          --restart always \
          --network xmessenger-net \
          --env-file "${ENV_FILE}" \
          -v "xmessenger-data-${SLUG}:/app/data" \
          xmessenger-core:latest
        echo -e "${GREEN}✓ ${DOMAIN} successfully updated and running!${NC}"
      fi
    fi
  done
else
  # Fallback: check if single container xmessenger-xchat-iranistream-com exists
  echo -e "${YELLOW}Checking running containers...${NC}"
  for container_name in $(docker ps -a --format '{{.Names}}' | grep '^xmessenger-xchat'); do
    echo -e "${YELLOW}Recreating ${container_name}...${NC}"
    docker restart "${container_name}" || true
  done
fi

# 4. Restart Nginx Gateway
echo -e "\n${BLUE}[4/4] Reloading Nginx reverse proxy...${NC}"
docker restart xmessenger-nginx 2>/dev/null || true

echo -e "\n${GREEN}${BOLD}==================================================================${NC}"
echo -e "${GREEN}${BOLD}✓ XMessenger update completed successfully in seconds!${NC}"
echo -e "${GREEN}${BOLD}==================================================================${NC}\n"
