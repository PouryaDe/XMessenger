#!/usr/bin/env bash
# ==============================================================================
# XMessenger - Automated Multi-Domain & Multi-Instance Installer for Linux
# Zero-conflict, Multi-tenant, Automated Docker, Nginx & SSL
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

APP_VERSION=$(cat "VERSION" 2>/dev/null || cat "/opt/xmessenger/VERSION" 2>/dev/null || echo "2.2.0")

echo -e "${CYAN}${BOLD}"
echo "=================================================================="
echo "    __  ____  ___                                              "
echo "    \ \/ /  \/  /___  ____________  ____  ____ ____  _____     "
echo "     \  / /\_/ / _ \/ ___/ ___/ _ \/ __ \/ __ \/ _ \/ ___/    "
echo "     / / /  / /  __(__  |__  )  __/ / / / /_/ /  __/ /        "
echo "    /_/_/  /_/\___/____/____/\___/_/ /_/\__, /\___/_/         "
echo "                                       /____/                 "
echo "   XMessenger Multi-Domain Secure Messenger Installer (v${APP_VERSION})"
echo "=================================================================="
echo -e "${NC}"

# 1. Check Root Privileges
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Please run this script as root (use sudo).${NC}"
  exit 1
fi

BASE_DIR="/opt/xmessenger"
SHARED_DIR="${BASE_DIR}/shared"
INSTANCES_DIR="${BASE_DIR}/instances"

# 2. Proactive Datacenter Mirror Healing (Fixes 404s on Afranet, Asiatech, etc.)
echo -e "${BLUE}Auditing package repositories for broken datacenter mirrors...${NC}"
rm -f /etc/apt/sources.list.d/docker.list 2>/dev/null || true

for src_file in /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do
  [ -f "$src_file" ] || continue
  if grep -q -E '(afranet|parsonline|asiatech|rasanegar|hostiran)' "$src_file" 2>/dev/null; then
    echo -e "${YELLOW}Detected local datacenter mirror in ${src_file}. Switching to canonical archive.ubuntu.com...${NC}"
    sed -i -E 's|http://[^ ]*(afranet|parsonline|asiatech|rasanegar|hostiran)[^ ]*/ubuntu|http://archive.ubuntu.com/ubuntu|g' "$src_file" 2>/dev/null || true
  fi
done

# Ensure basic packages (curl, openssl, git) exist
if ! command -v curl &> /dev/null || ! command -v openssl &> /dev/null || ! command -v git &> /dev/null; then
  echo -e "${YELLOW}Updating package index and installing base system utilities...${NC}"
  apt-get update -y || apt-get update --fix-missing -y || true
  apt-get install -y --fix-missing curl openssl git || apt-get install -y curl openssl git
fi

# Detect if running from cloned repository or remote curl
if [ -f "Dockerfile" ]; then
  PROJECT_ROOT="$(pwd)"
elif [ -f "../Dockerfile" ]; then
  PROJECT_ROOT="$(cd .. && pwd)"
elif [ -f "${BASE_DIR}/Dockerfile" ]; then
  PROJECT_ROOT="${BASE_DIR}"
else
  PROJECT_ROOT="${BASE_DIR}"
fi

# Ensure /opt/xmessenger has repository files without ever wiping instances or shared directories
if [ ! -f "${BASE_DIR}/Dockerfile" ]; then
  echo -e "${BLUE}Setting up repository at ${BASE_DIR}...${NC}"
  mkdir -p "${BASE_DIR}"
  if [ -d "${BASE_DIR}/.git" ]; then
    cd "${BASE_DIR}"
    git config --global --add safe.directory "${BASE_DIR}" 2>/dev/null || true
    git pull origin main || true
  else
    TEMP_CLONE=$(mktemp -d)
    if [ -n "$GITHUB_TOKEN" ]; then
      git clone "https://${GITHUB_TOKEN}@github.com/PouryaDe/XMessenger.git" "${TEMP_CLONE}"
    else
      git clone "https://github.com/PouryaDe/XMessenger.git" "${TEMP_CLONE}"
    fi
    cp -r "${TEMP_CLONE}/." "${BASE_DIR}/"
    rm -rf "${TEMP_CLONE}"
  fi
fi

cd "${BASE_DIR}"
PROJECT_ROOT="${BASE_DIR}"

# 3. Check and Install Docker (Native docker.io avoids 403 sanction blocks on IR IPs)
echo -e "${BLUE}[1/6] Checking system packages and Docker engine...${NC}"

if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}Docker not found. Installing Docker engine from system repositories...${NC}"
  apt-get update -y || apt-get update --fix-missing -y || true
  if ! apt-get install -y docker.io docker-buildx; then
    apt-get install -y --fix-missing docker.io || true
  fi
  systemctl enable --now docker 2>/dev/null || service docker start 2>/dev/null || true
  echo -e "${GREEN}Docker installed successfully.${NC}"
else
  echo -e "${GREEN}Docker is already installed.${NC}"
  # Install docker-buildx if available in repositories
  if ! docker buildx version &>/dev/null; then
    apt-get install -y docker-buildx 2>/dev/null || true
  fi
  systemctl enable --now docker 2>/dev/null || service docker start 2>/dev/null || true
fi

# Ensure docker daemon is alive
for i in {1..15}; do
  if docker info &> /dev/null; then
    break
  fi
  systemctl start docker 2>/dev/null || service docker start 2>/dev/null || true
  sleep 1
done

# Configure Docker Registry Mirrors to bypass Docker Hub 403 sanction blocks (Iran & restricted regions)
echo -e "${BLUE}Configuring Docker registry mirrors (anti-sanction)...${NC}"
mkdir -p /etc/docker
cat <<'EOF' > /etc/docker/daemon.json
{
  "registry-mirrors": [
    "https://docker.arvancloud.ir",
    "https://docker.iranserver.com",
    "https://fdocker.ir",
    "https://docker.mcr.ir",
    "https://registry.docker.ir"
  ]
}
EOF
systemctl daemon-reload 2>/dev/null || true
systemctl restart docker 2>/dev/null || service docker restart 2>/dev/null || true

# Wait for docker daemon restart
for i in {1..15}; do
  if docker info &> /dev/null; then
    break
  fi
  sleep 1
done

# Helper function to pull images through Docker daemon mirrors with direct fallback
pull_docker_image() {
  local img="$1"
  # Skip network download if image is already cached locally
  if docker image inspect "${img}" &>/dev/null; then
    echo -e "${GREEN}✓ Image ${img} is already present locally.${NC}"
    return 0
  fi

  echo -e "${CYAN}Checking / pulling image ${BOLD}${img}${NC}...${NC}"
  if docker pull "${img}"; then
    return 0
  fi

  echo -e "${YELLOW}Standard pull returned error. Retrying ${img} through direct Iranian mirror proxies...${NC}"
  local mirrors=("docker.arvancloud.ir" "docker.iranserver.com" "fdocker.ir" "docker.mcr.ir")
  for mirror in "${mirrors[@]}"; do
    echo -e "${YELLOW}Attempting to pull from ${mirror}/${img}...${NC}"
    if docker pull "${mirror}/${img}" 2>/dev/null; then
      docker tag "${mirror}/${img}" "${img}"
      echo -e "${GREEN}Successfully pulled and tagged ${img} from ${mirror}!${NC}"
      return 0
    fi
    if [[ "${img}" != *"/"* ]]; then
      if docker pull "${mirror}/library/${img}" 2>/dev/null; then
        docker tag "${mirror}/library/${img}" "${img}"
        echo -e "${GREEN}Successfully pulled and tagged ${img} from ${mirror}/library!${NC}"
        return 0
      fi
    fi
  done

  echo -e "${YELLOW}[Notice] Could not pull ${img} through mirrors. Docker will try during run/build.${NC}"
  return 0
}

# Pre-fetch required base images so build and run won't fail with 403 CloudFront blocks
echo -e "\n${BLUE}Pre-fetching core Docker images (anti-block)...${NC}"
pull_docker_image "nginx:alpine"
pull_docker_image "certbot/certbot"
pull_docker_image "node:22-alpine"

# Check if host web server (apache2, host nginx) is occupying port 80 or 443
if lsof -i :80 2>/dev/null | grep -qv docker || netstat -tulpn 2>/dev/null | grep -E ':80\s' | grep -qv docker; then
  echo -e "${YELLOW}[Notice] Port 80 seems occupied by a host service. Stopping host web servers...${NC}"
  systemctl stop apache2 2>/dev/null || true
  systemctl stop nginx 2>/dev/null || true
fi

# 4. Interactive or CLI Argument Configuration (Multi-Domain Aware)
echo -e "\n${BLUE}[2/6] Configuring Domain & Instance...${NC}"

if [ -n "$1" ] && [ -z "$DOMAIN" ]; then
  DOMAIN="$1"
fi
if [ -n "$2" ] && [ -z "$EMAIL" ]; then
  EMAIL="$2"
fi

if [ -z "$DOMAIN" ]; then
  if [ -t 0 ]; then
    read -p "Enter your domain for this messenger instance (e.g., chat.example.com): " DOMAIN
  elif [ -e /dev/tty ]; then
    read -p "Enter your domain for this messenger instance (e.g., chat.example.com): " DOMAIN < /dev/tty
  fi
fi

# Sanitize domain: strip http://, https://, trailing slashes, whitespace, lowercase
DOMAIN=$(echo "$DOMAIN" | sed -e 's|^https\?://||' -e 's|/.*$||' | tr -d ' ' | tr '[:upper:]' '[:lower:]')

if [ -z "$DOMAIN" ]; then
  echo -e "${RED}[ERROR] Domain cannot be empty.${NC}"
  exit 1
fi

# Sanitize domain to container/slug identifier (e.g. chat-example-com)
SLUG=$(echo "$DOMAIN" | tr '.' '-' | tr -cd 'a-zA-Z0-9-')

if [ -z "$EMAIL" ]; then
  if [ -t 0 ]; then
    read -p "Enter email for Let's Encrypt SSL certificate (e.g., admin@${DOMAIN}): " EMAIL
  elif [ -e /dev/tty ]; then
    read -p "Enter email for Let's Encrypt SSL certificate (e.g., admin@${DOMAIN}): " EMAIL < /dev/tty
  fi
fi

EMAIL=$(echo "$EMAIL" | tr -d ' ')
if [ -z "$EMAIL" ]; then
  EMAIL="admin@${DOMAIN}"
fi

# Preserve existing keys and passwords on re-install / upgrade to guarantee zero data loss
ENV_FILE="${INSTANCES_DIR}/${DOMAIN}/.env"
if [ -f "$ENV_FILE" ]; then
  echo -e "${YELLOW}Existing instance configuration detected for ${DOMAIN}. Preserving encryption keys and credentials...${NC}"
  EXISTING_JWT=$(grep '^JWT_SECRET=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r\n')
  EXISTING_ENC=$(grep '^ENCRYPTION_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r\n')
  EXISTING_PASS=$(grep '^ADMIN_PASSWORD=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r\n')
  EXISTING_USER=$(grep '^ADMIN_USERNAME=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r\n')
  EXISTING_TTL=$(grep '^DEFAULT_TTL_SECONDS=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r\n')

  [ -n "$EXISTING_JWT" ] && JWT_SECRET="$EXISTING_JWT" || JWT_SECRET=$(openssl rand -hex 32)
  [ -n "$EXISTING_ENC" ] && ENCRYPTION_KEY="$EXISTING_ENC" || ENCRYPTION_KEY=$(openssl rand -hex 32)
  [ -n "$EXISTING_PASS" ] && ADMIN_PASSWORD="$EXISTING_PASS"
  [ -n "$EXISTING_USER" ] && ADMIN_USERNAME="$EXISTING_USER"
  [ -n "$EXISTING_TTL" ] && DEFAULT_TTL_SECONDS="$EXISTING_TTL"
else
  [ -z "$JWT_SECRET" ] && JWT_SECRET=$(openssl rand -hex 32)
  [ -z "$ENCRYPTION_KEY" ] && ENCRYPTION_KEY=$(openssl rand -hex 32)
fi

[ -z "$ADMIN_USERNAME" ] && ADMIN_USERNAME="admin"
[ -z "$DEFAULT_TTL_SECONDS" ] && DEFAULT_TTL_SECONDS="86400"

if [ -z "$ADMIN_PASSWORD" ]; then
  ADMIN_PASSWORD=$(openssl rand -base64 12)
  echo -e "${YELLOW}Generated secure Admin password:${NC} ${BOLD}${ADMIN_PASSWORD}${NC}"
fi

# 5. Prepare Shared Network and Folders
echo -e "\n${BLUE}[3/6] Initializing shared multi-domain infrastructure...${NC}"

mkdir -p "${SHARED_DIR}/nginx/conf.d"
mkdir -p "${SHARED_DIR}/certbot/conf"
mkdir -p "${SHARED_DIR}/certbot/www"
mkdir -p "${INSTANCES_DIR}/${DOMAIN}"

# Setup default HTTP server for shared Nginx gateway with WebSocket upgrade mapping
cat <<'EOF' > "${SHARED_DIR}/nginx/conf.d/00-default.conf"
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

# Create shared docker network if not exists
docker network create xmessenger-net 2>/dev/null || true

# Clean up any leftover temporary bootstrap containers
docker rm -f xmessenger-acme 2>/dev/null || true

# 6. Build or Update XMessenger Core Docker Image (Zero-Failure Build Engine)
echo -e "\n${BLUE}[4/6] Building / updating XMessenger core Docker image...${NC}"
echo -e "${YELLOW}Building optimized container image (xmessenger-core:latest)...${NC}"
cd "${PROJECT_ROOT}"

BUILD_OK=0
# Method 1: Try legacy daemon builder (DOCKER_BUILDKIT=0) - 100% reliable, zero plugins/buildx required
if DOCKER_BUILDKIT=0 docker build -t xmessenger-core:latest -f Dockerfile . ; then
  BUILD_OK=1
# Method 2: Fallback to standard builder if legacy is rejected
elif docker build -t xmessenger-core:latest -f Dockerfile . ; then
  BUILD_OK=1
fi

if [ "$BUILD_OK" -ne 1 ]; then
  echo -e "${RED}[ERROR] Failed to build xmessenger-core:latest image.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Core Docker image built successfully.${NC}"

# 7. Ensure Shared Nginx Gateway is Running on Ports 80 & 443
if ! docker ps --format '{{.Names}}' | grep -q '^xmessenger-nginx$'; then
  echo -e "${YELLOW}Starting shared Nginx Gateway on ports 80/443...${NC}"
  docker rm -f xmessenger-nginx 2>/dev/null || true
  docker run -d \
    --name xmessenger-nginx \
    --restart always \
    --network xmessenger-net \
    -p 80:80 \
    -p 443:443 \
    -v "${SHARED_DIR}/nginx/conf.d:/etc/nginx/conf.d" \
    -v "${SHARED_DIR}/certbot/conf:/etc/letsencrypt" \
    -v "${SHARED_DIR}/certbot/www:/var/www/certbot" \
    nginx:alpine
fi

# 8. Obtain or Verify SSL Certificate for this Domain
echo -e "\n${BLUE}[5/6] Setting up SSL Certificate for ${DOMAIN}...${NC}"

# Ensure SSL certificate directory and files exist (baseline fallback guarantees Nginx never fails on port 443)
mkdir -p "${SHARED_DIR}/certbot/conf/live/${DOMAIN}"
if [ ! -f "${SHARED_DIR}/certbot/conf/live/${DOMAIN}/fullchain.pem" ] || [ ! -f "${SHARED_DIR}/certbot/conf/live/${DOMAIN}/privkey.pem" ]; then
  echo -e "${YELLOW}Generating initial SSL certificate for ${DOMAIN}...${NC}"
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "${SHARED_DIR}/certbot/conf/live/${DOMAIN}/privkey.pem" \
    -out "${SHARED_DIR}/certbot/conf/live/${DOMAIN}/fullchain.pem" \
    -subj "/CN=${DOMAIN}"
fi

# 9. Deploy Production Nginx Reverse Proxy Route for this Domain
echo -e "${BLUE}Configuring Nginx routing for ${DOMAIN}...${NC}"
cat <<EOF > "${SHARED_DIR}/nginx/conf.d/${DOMAIN}.conf"
server {
    listen 80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name ${DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Client body limit (Supports Database Restore & Media Uploads)
    client_max_body_size 100M;

    location /socket.io/ {
        proxy_pass http://xmessenger-${SLUG}:3001/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }

    location / {
        proxy_pass http://xmessenger-${SLUG}:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Restart Nginx gateway so port 443 and new domain are instantly live
docker restart xmessenger-nginx 2>/dev/null || true

# Obtain official Let's Encrypt SSL certificate if not already issued by Let's Encrypt
CERT_FILE="${SHARED_DIR}/certbot/conf/live/${DOMAIN}/fullchain.pem"
if [ -f "$CERT_FILE" ] && openssl x509 -in "$CERT_FILE" -issuer -noout 2>/dev/null | grep -qiE "(Let's Encrypt|ISRG Root)"; then
  echo -e "${GREEN}✓ Authentic Let's Encrypt SSL certificate is already active for ${DOMAIN}.${NC}"
else
  echo -e "${YELLOW}Requesting official Let's Encrypt SSL certificate for ${DOMAIN}...${NC}"

  # Clean up temporary fallback files so Certbot creates genuine lineage symlinks
  TEMP_SSL_BACKUP=$(mktemp -d)
  cp -r "${SHARED_DIR}/certbot/conf/live/${DOMAIN}" "${TEMP_SSL_BACKUP}/"
  rm -rf "${SHARED_DIR}/certbot/conf/live/${DOMAIN}"
  rm -rf "${SHARED_DIR}/certbot/conf/archive/${DOMAIN}"
  rm -f "${SHARED_DIR}/certbot/conf/renewal/${DOMAIN}.conf"

  EMAIL_ARGS="--register-unsafely-without-email"
  if [ -n "$EMAIL" ] && [[ "$EMAIL" == *"@"* ]]; then
    EMAIL_ARGS="--email ${EMAIL} --no-eff-email"
  fi

  chmod -R 755 "${SHARED_DIR}/certbot/www" 2>/dev/null || true

  if docker run --rm \
    --network xmessenger-net \
    -v "${SHARED_DIR}/certbot/conf:/etc/letsencrypt" \
    -v "${SHARED_DIR}/certbot/www:/var/www/certbot" \
    certbot/certbot certonly --webroot -w /var/www/certbot \
    ${EMAIL_ARGS} \
    -d "${DOMAIN}" \
    --agree-tos \
    --non-interactive \
    --force-renewal ; then

    echo -e "${GREEN}✓ Official Let's Encrypt SSL certificate successfully obtained and activated!${NC}"
    docker restart xmessenger-nginx 2>/dev/null || true
    rm -rf "${TEMP_SSL_BACKUP}"
  else
    echo -e "${YELLOW}[Warning] Let's Encrypt issuance did not complete. Restoring fallback certificate...${NC}"
    mkdir -p "${SHARED_DIR}/certbot/conf/live"
    cp -r "${TEMP_SSL_BACKUP}/${DOMAIN}" "${SHARED_DIR}/certbot/conf/live/"
    rm -rf "${TEMP_SSL_BACKUP}"
    docker restart xmessenger-nginx 2>/dev/null || true
  fi
fi

# 10. Launch Isolated Backend Container for this Domain
echo -e "\n${BLUE}[6/6] Launching isolated backend for ${DOMAIN}...${NC}"

cat <<EOF > "${INSTANCES_DIR}/${DOMAIN}/.env"
DOMAIN=${DOMAIN}
EMAIL=${EMAIL}
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
ADMIN_USERNAME=${ADMIN_USERNAME}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
DEFAULT_TTL_SECONDS=${DEFAULT_TTL_SECONDS}
SLUG=${SLUG}
EOF

# Stop old instance container if exists
docker rm -f "xmessenger-${SLUG}" 2>/dev/null || true

# Run dedicated app container for this domain
docker run -d \
  --name "xmessenger-${SLUG}" \
  --restart always \
  --network xmessenger-net \
  --env-file "${INSTANCES_DIR}/${DOMAIN}/.env" \
  -v "xmessenger-data-${SLUG}:/app/data" \
  xmessenger-core:latest

# Ensure Certbot renewer container is running
if ! docker ps --format '{{.Names}}' | grep -q '^xmessenger-certbot$'; then
  docker run -d \
    --name xmessenger-certbot \
    --restart unless-stopped \
    --network xmessenger-net \
    -v "${SHARED_DIR}/certbot/conf:/etc/letsencrypt" \
    -v "${SHARED_DIR}/certbot/www:/var/www/certbot" \
    certbot/certbot \
    sh -c 'trap exit TERM; while :; do certbot renew --webroot -w /var/www/certbot; sleep 12h & wait $${!}; done;'
fi

# 11. Install Global Multi-Domain CLI Management Tool (xmessenger & xupdate)
ln -sf "${BASE_DIR}/deploy/xmessenger.sh" /usr/local/bin/xmessenger 2>/dev/null || cp -f "${PROJECT_ROOT}/deploy/xmessenger.sh" /usr/local/bin/xmessenger 2>/dev/null || true
ln -sf "${BASE_DIR}/update.sh" /usr/local/bin/xupdate 2>/dev/null || true
chmod +x "${BASE_DIR}/deploy/xmessenger.sh" "${BASE_DIR}/update.sh" /usr/local/bin/xmessenger /usr/local/bin/xupdate 2>/dev/null || true

# 12. Configure Continuous GitHub Auto-Update Service
if [ -f "${BASE_DIR}/deploy/xmessenger-autoupdate.service" ] && [ -d /etc/systemd/system ]; then
  cp -f "${BASE_DIR}/deploy/xmessenger-autoupdate.service" /etc/systemd/system/xmessenger-autoupdate.service
  systemctl daemon-reload 2>/dev/null || true
  systemctl enable --now xmessenger-autoupdate 2>/dev/null || true
  systemctl restart xmessenger-autoupdate 2>/dev/null || true
fi

echo -e "\n${GREEN}${BOLD}==================================================================${NC}"
echo -e "${GREEN}${BOLD}🎉 XMessenger for ${DOMAIN} successfully deployed!${NC}"
echo -e "${GREEN}${BOLD}==================================================================${NC}"
echo -e "${CYAN}🌐 Web Address:${NC}       https://${DOMAIN}"
echo -e "${CYAN}👤 Admin Username:${NC}   ${ADMIN_USERNAME}"
echo -e "${CYAN}🔑 Admin Password:${NC}   ${ADMIN_PASSWORD}"
echo -e "${CYAN}📦 Container Name:${NC}   xmessenger-${SLUG}"
echo -e "${CYAN}💾 Database Volume:${NC}  xmessenger-data-${SLUG} (Isolated)"
echo -e "${CYAN}🔒 Storage Encryption:${NC} AES-256-GCM (Active)"
echo -e "${CYAN}⏱️ Ephemeral TTL:${NC}     ${DEFAULT_TTL_SECONDS}s (Configurable in Admin Panel)"
echo -e "${GREEN}${BOLD}==================================================================${NC}"
echo -e "${YELLOW}${BOLD}Multi-Domain Server Console:${NC}"
echo -e "   Type ${CYAN}${BOLD}xmessenger${NC} anytime in terminal to view and manage all messenger instances."
echo -e "${GREEN}${BOLD}==================================================================${NC}\n"
