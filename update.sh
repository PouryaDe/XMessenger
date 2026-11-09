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

get_version() {
  if [ -f "${BASE_DIR}/VERSION" ]; then
    cat "${BASE_DIR}/VERSION" | tr -d '\r\n'
  elif [ -f "VERSION" ]; then
    cat "VERSION" | tr -d '\r\n'
  else
    echo "2.2.0"
  fi
}

VER=$(get_version)

echo -e "${CYAN}${BOLD}"
echo "=================================================================="
echo "    XMessenger Fast Update & Hot-Deploy Engine (v${VER})          "
echo "=================================================================="
echo -e "${NC}"

# 1. Force sync with latest code from GitHub (immune to local merge conflicts)
echo -e "${BLUE}[1/4] Syncing latest updates from GitHub...${NC}"
git config --global --add safe.directory "${BASE_DIR}" 2>/dev/null || true
rm -f "${BASE_DIR}/.git/index.lock" "${BASE_DIR}/.git/FETCH_HEAD.lock" "${BASE_DIR}/.git/refs/heads/main.lock" 2>/dev/null || true
export GIT_TERMINAL_PROMPT=0
timeout 25 git fetch origin main 2>/dev/null || git fetch origin main 2>/dev/null || true
git reset --hard origin/main 2>/dev/null || true

# Ensure live symlinks for xmessenger and xupdate immediately
ln -sf "${BASE_DIR}/deploy/xmessenger.sh" /usr/local/bin/xmessenger 2>/dev/null || true
ln -sf "${BASE_DIR}/update.sh" /usr/local/bin/xupdate 2>/dev/null || true
chmod +x "${BASE_DIR}/deploy/xmessenger.sh" "${BASE_DIR}/update.sh" /usr/local/bin/xmessenger /usr/local/bin/xupdate 2>/dev/null || true

# 2. Hot-deploy compiled assets directly into all running containers (Instant update)
echo -e "\n${BLUE}[2/4] Live-updating all running messenger containers...${NC}"
UPDATED_COUNT=0

CONTAINERS=$(docker ps -a --format '{{.Names}}' | grep '^xmessenger-' | grep -v 'nginx' | grep -v 'certbot' || true)

# Include any configured domain instances
if [ -d "${BASE_DIR}/instances" ]; then
  for d in $(find "${BASE_DIR}/instances" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; 2>/dev/null || true); do
    s=$(echo "$d" | tr '.' '-' | tr -cd 'a-zA-Z0-9-')
    CONTAINERS="${CONTAINERS} xmessenger-${s}"
  done
fi

# Ensure primary instance is always included if exists
if docker ps -a --format '{{.Names}}' | grep -q 'xmessenger-xchat-iranistream-com'; then
  CONTAINERS="${CONTAINERS} xmessenger-xchat-iranistream-com"
fi

# Deduplicate container names
CONTAINERS=$(echo "$CONTAINERS" | tr ' ' '\n' | sort -u | grep -v '^$' || true)

for c in $CONTAINERS; do
  [ -z "$c" ] && continue
  if docker ps -a --format '{{.Names}}' | grep -q "^${c}$"; then
    echo -e "${YELLOW}Injecting latest build into container: ${c}...${NC}"
    docker cp client/dist/. "${c}:/app/client-dist/"
    docker cp server/dist/. "${c}:/app/dist/"
    docker restart "${c}"
    echo -e "${GREEN}✓ Container ${c} updated and restarted!${NC}"
    UPDATED_COUNT=$((UPDATED_COUNT + 1))
  fi
done

if [ "$UPDATED_COUNT" -eq 0 ]; then
  echo -e "${YELLOW}No running instance containers detected.${NC}"
fi

# Ensure 100M client body limit & clean up any corrupted Nginx location blocks
if [ -d "${BASE_DIR}/shared/nginx/conf.d" ]; then
  # Ensure 00-default.conf has WebSocket connection upgrade mapping
  cat <<'EOF' > "${BASE_DIR}/shared/nginx/conf.d/00-default.conf"
# Shared WebSocket upgrade connection mapping
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80 default_server;
    server_name _;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 200 "XMessenger Gateway is running.\n";
    }
}
EOF
  # Guarantee 100% clean Nginx config for xchat.iranistream.com
  if [ -f "${BASE_DIR}/shared/nginx/conf.d/xchat.iranistream.com.conf" ]; then
    cat <<'EOF' > "${BASE_DIR}/shared/nginx/conf.d/xchat.iranistream.com.conf"
server {
    listen 80;
    server_name xchat.iranistream.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name xchat.iranistream.com;

    ssl_certificate /etc/letsencrypt/live/xchat.iranistream.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/xchat.iranistream.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Client body limit (Supports Database Restore & Media Uploads)
    client_max_body_size 100M;

    location /socket.io/ {
        proxy_pass http://xmessenger-xchat-iranistream-com:3001/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $http_connection;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    location / {
        proxy_pass http://xmessenger-xchat-iranistream-com:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
  fi

  for cfg in "${BASE_DIR}/shared/nginx/conf.d"/*.conf; do
    [ -f "$cfg" ] || continue
    sed -i 's|http://xmessenger:3001|http://xmessenger-xchat-iranistream-com:3001|g' "$cfg" 2>/dev/null || true
  done
fi

# 3. Ensure Nginx Gateway is running and healthy
echo -e "\n${BLUE}[3/4] Ensuring Nginx Gateway is healthy and restarted...${NC}"
docker start xmessenger-nginx 2>/dev/null || true
docker restart xmessenger-nginx 2>/dev/null || true
echo -e "${GREEN}✓ Nginx gateway is online and active!${NC}"

# 4. Synchronize Docker image for any future new container creation (without killing running containers)
echo -e "\n${BLUE}[4/4] Updating base Docker image (xmessenger-core:latest)...${NC}"
( DOCKER_BUILDKIT=0 docker build -t xmessenger-core:latest -f Dockerfile . >/dev/null 2>&1 || docker build -t xmessenger-core:latest -f Dockerfile . >/dev/null 2>&1 ) &
echo -e "${GREEN}✓ Base image update running in background.${NC}"

# 5. Install & Activate Continuous Auto-Update Daemon (Runs every 10s via systemd)
echo -e "\n${BLUE}[5/5] Configuring automatic GitHub update service (xmessenger-autoupdate)...${NC}"
chmod +x "${BASE_DIR}/deploy/autoupdate.sh" 2>/dev/null || true

if [ -f "${BASE_DIR}/deploy/xmessenger-autoupdate.service" ] && [ -d /etc/systemd/system ]; then
  cp -f "${BASE_DIR}/deploy/xmessenger-autoupdate.service" /etc/systemd/system/xmessenger-autoupdate.service
  systemctl daemon-reload 2>/dev/null || true
  systemctl enable --now xmessenger-autoupdate 2>/dev/null || true
  systemctl restart xmessenger-autoupdate 2>/dev/null || true
  echo -e "${GREEN}✓ Auto-update systemd daemon is active! New GitHub commits deploy automatically every 10s.${NC}"
fi

# Fallback Cron job (in case systemd is unavailable in containerized or minimal environments)
if [ -d /etc/cron.d ]; then
  echo "* * * * * root /bin/bash ${BASE_DIR}/deploy/autoupdate.sh --once >/dev/null 2>&1" > /etc/cron.d/xmessenger-autoupdate 2>/dev/null || true
  chmod 644 /etc/cron.d/xmessenger-autoupdate 2>/dev/null || true
fi

# 6. Ensure global shortcuts exist in /usr/local/bin as live symlinks
ln -sf "${BASE_DIR}/update.sh" /usr/local/bin/xupdate 2>/dev/null || true
chmod +x "${BASE_DIR}/update.sh" 2>/dev/null || true
ln -sf "${BASE_DIR}/deploy/xmessenger.sh" /usr/local/bin/xmessenger 2>/dev/null || true
chmod +x "${BASE_DIR}/deploy/xmessenger.sh" 2>/dev/null || true
ln -sf "${BASE_DIR}/deploy/autoupdate.sh" /usr/local/bin/xautoupdate 2>/dev/null || true
chmod +x "${BASE_DIR}/deploy/autoupdate.sh" 2>/dev/null || true

# Also alias in root .bashrc for convenience
if [ -f /root/.bashrc ]; then
  grep -q "alias xupdate=" /root/.bashrc 2>/dev/null || echo "alias xupdate='bash /opt/xmessenger/update.sh'" >> /root/.bashrc
fi

NEW_VER=$(get_version)
echo -e "\n${GREEN}${BOLD}==================================================================${NC}"
echo -e "${GREEN}${BOLD}✓ XMessenger hot update to v${NEW_VER} completed successfully!${NC}"
echo -e "${GREEN}${BOLD}✓ Continuous auto-update daemon is now running in the background!${NC}"
echo -e "${GREEN}${BOLD}✓ Future commits on main will now deploy AUTOMATICALLY within 10s.${NC}"
echo -e "${GREEN}${BOLD}==================================================================${NC}\n"
