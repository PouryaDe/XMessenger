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

echo -e "${CYAN}${BOLD}"
echo "=================================================================="
echo "    __  ____  ___                                              "
echo "    \ \/ /  \/  /___  ____________  ____  ____ ____  _____     "
echo "     \  / /\_/ / _ \/ ___/ ___/ _ \/ __ \/ __ \/ _ \/ ___/    "
echo "     / / /  / /  __(__  |__  )  __/ / / / /_/ /  __/ /        "
echo "    /_/_/  /_/\___/____/____/\___/_/ /_/\__, /\___/_/         "
echo "                                       /____/                 "
echo "   XMessenger - Multi-Domain Secure Messenger Installer        "
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

# Detect if running from cloned repository or remote curl
if [ -f "Dockerfile" ]; then
  PROJECT_ROOT="$(pwd)"
elif [ -f "../Dockerfile" ]; then
  PROJECT_ROOT="$(cd .. && pwd)"
elif [ -f "${BASE_DIR}/Dockerfile" ]; then
  PROJECT_ROOT="${BASE_DIR}"
else
  # Remote curl execution: clone/update to /opt/xmessenger
  echo -e "${BLUE}Setting up repository at ${BASE_DIR}...${NC}"
  rm -f /etc/apt/sources.list.d/docker.list 2>/dev/null || true
  if ! command -v git &> /dev/null; then
    apt-get update -y && apt-get install -y git curl openssl
  fi

  if [ -d "${BASE_DIR}/.git" ]; then
    cd "${BASE_DIR}"
    git pull origin main || true
  else
    rm -rf "${BASE_DIR}"
    if [ -n "$GITHUB_TOKEN" ]; then
      git clone "https://${GITHUB_TOKEN}@github.com/PouryaDe/XMessenger.git" "${BASE_DIR}"
    else
      git clone "https://github.com/PouryaDe/XMessenger.git" "${BASE_DIR}"
    fi
    cd "${BASE_DIR}"
  fi
  PROJECT_ROOT="${BASE_DIR}"
fi

# 2. Check and Install Docker (Native docker.io avoids 403 sanction blocks on IR IPs)
echo -e "${BLUE}[1/6] Checking system packages and Docker engine...${NC}"

# Clean up broken repositories if any
rm -f /etc/apt/sources.list.d/docker.list 2>/dev/null || true

if ! command -v curl &> /dev/null || ! command -v openssl &> /dev/null; then
  echo -e "${YELLOW}Installing base system utilities...${NC}"
  apt-get update -y && apt-get install -y curl openssl git
fi

if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}Docker not found. Installing Docker engine from system repositories...${NC}"
  apt-get update -y
  apt-get install -y docker.io docker-compose
  systemctl enable --now docker || service docker start || true
  echo -e "${GREEN}Docker installed successfully.${NC}"
else
  echo -e "${GREEN}Docker is already installed.${NC}"
  systemctl enable --now docker 2>/dev/null || service docker start 2>/dev/null || true
fi

# Ensure docker daemon is alive
if ! docker info &> /dev/null; then
  systemctl start docker || service docker start || true
fi

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
sleep 3

# Helper function to pull images through Docker daemon mirrors with direct fallback
pull_docker_image() {
  local img="$1"
  echo -e "${CYAN}Checking / pulling image ${BOLD}${img}${NC}...${NC}"
  if docker pull "${img}"; then
    return 0
  fi

  echo -e "${YELLOW}Standard pull returned 403 or error. Retrying ${img} through direct Iranian mirror proxies...${NC}"
  local mirrors=("docker.arvancloud.ir" "docker.iranserver.com" "fdocker.ir" "docker.mcr.ir")
  for mirror in "${mirrors[@]}"; do
    echo -e "${YELLOW}Attempting to pull from ${mirror}/${img}...${NC}"
    if docker pull "${mirror}/${img}" 2>/dev/null; then
      docker tag "${mirror}/${img}" "${img}"
      echo -e "${GREEN}Successfully pulled and tagged ${img} from ${mirror}!${NC}"
      return 0
    fi
    # If official library image without slash (like nginx:alpine or node:22-alpine), try library/ prefix
    if [[ "${img}" != *"/"* ]]; then
      if docker pull "${mirror}/library/${img}" 2>/dev/null; then
        docker tag "${mirror}/library/${img}" "${img}"
        echo -e "${GREEN}Successfully pulled and tagged ${img} from ${mirror}/library!${NC}"
        return 0
      fi
    fi
  done

  echo -e "${RED}[WARNING] Could not pull ${img} through mirrors. Docker will try during run/build.${NC}"
  return 1
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

# 3. Interactive Configuration (Multi-Domain Aware)
echo -e "\n${BLUE}[2/6] Configuring Domain & Instance...${NC}"

if [ -z "$DOMAIN" ]; then
  if [ -t 0 ]; then
    read -p "Enter your domain for this messenger instance (e.g., chat.example.com): " DOMAIN
  elif [ -e /dev/tty ]; then
    read -p "Enter your domain for this messenger instance (e.g., chat.example.com): " DOMAIN < /dev/tty
  fi
fi

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

if [ -z "$EMAIL" ]; then
  EMAIL="admin@${DOMAIN}"
fi

if [ -z "$ADMIN_PASSWORD" ]; then
  ADMIN_PASSWORD=$(openssl rand -base64 12)
  echo -e "${YELLOW}Generated secure Admin password:${NC} ${BOLD}${ADMIN_PASSWORD}${NC}"
fi

# 4. Prepare Shared Network and Folders
echo -e "\n${BLUE}[3/6] Initializing shared multi-domain infrastructure...${NC}"

mkdir -p "${SHARED_DIR}/nginx/conf.d"
mkdir -p "${SHARED_DIR}/certbot/conf"
mkdir -p "${SHARED_DIR}/certbot/www"
mkdir -p "${INSTANCES_DIR}/${DOMAIN}"

# Setup default HTTP server for shared Nginx gateway (handles ACME challenges and fallback)
if [ ! -f "${SHARED_DIR}/nginx/conf.d/00-default.conf" ]; then
  cat <<'EOF' > "${SHARED_DIR}/nginx/conf.d/00-default.conf"
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
fi

# Create shared docker network if not exists
docker network create xmessenger-net 2>/dev/null || true

# Clean up any leftover temporary bootstrap containers
docker rm -f xmessenger-acme 2>/dev/null || true

# 5. Build or Update XMessenger Core Docker Image
echo -e "\n${BLUE}[4/6] Building / updating XMessenger core Docker image...${NC}"
cd "${PROJECT_ROOT}"
docker build -t xmessenger-core:latest -f Dockerfile .

# 6. Ensure Shared Nginx Gateway is Running on Ports 80 & 443
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

# 7. Obtain or Verify SSL Certificate for this Domain
echo -e "\n${BLUE}[5/6] Setting up Let's Encrypt SSL for ${DOMAIN}...${NC}"

if [ ! -f "${SHARED_DIR}/certbot/conf/live/${DOMAIN}/fullchain.pem" ]; then
  # Temporary challenge routing for this domain
  cat <<EOF > "${SHARED_DIR}/nginx/conf.d/${DOMAIN}.conf"
server {
    listen 80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 200 "XMessenger SSL bootstrapping for ${DOMAIN}...";
    }
}
EOF
  docker exec xmessenger-nginx nginx -s reload 2>/dev/null || true

  echo -e "${YELLOW}Requesting SSL certificate from Let's Encrypt...${NC}"
  docker run --rm \
    --network xmessenger-net \
    -v "${SHARED_DIR}/certbot/conf:/etc/letsencrypt" \
    -v "${SHARED_DIR}/certbot/www:/var/www/certbot" \
    certbot/certbot certonly --webroot -w /var/www/certbot \
    --email "${EMAIL}" \
    -d "${DOMAIN}" \
    --agree-tos \
    --non-interactive \
    --keep-until-expiring || {
      echo -e "${YELLOW}[Notice] Let's Encrypt verification timed out or DNS not propagated.${NC}"
      echo -e "${YELLOW}Creating fallback self-signed SSL certificate so ${DOMAIN} can start immediately...${NC}"
      mkdir -p "${SHARED_DIR}/certbot/conf/live/${DOMAIN}"
      openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "${SHARED_DIR}/certbot/conf/live/${DOMAIN}/privkey.pem" \
        -out "${SHARED_DIR}/certbot/conf/live/${DOMAIN}/fullchain.pem" \
        -subj "/CN=${DOMAIN}"
  }
fi

# 8. Deploy Production Nginx Reverse Proxy Route for this Domain
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
    listen 443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    location /socket.io/ {
        proxy_pass http://xmessenger-${SLUG}:3001/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
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

# Reload Nginx gateway to activate this domain route
docker exec xmessenger-nginx nginx -s reload 2>/dev/null || true

# 9. Launch Isolated Backend Container for this Domain
echo -e "\n${BLUE}[6/6] Launching isolated backend for ${DOMAIN}...${NC}"

JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

cat <<EOF > "${INSTANCES_DIR}/${DOMAIN}/.env"
DOMAIN=${DOMAIN}
EMAIL=${EMAIL}
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${ADMIN_PASSWORD}
DEFAULT_TTL_SECONDS=86400
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

# 10. Install Global Multi-Domain CLI Management Tool (xmessenger)
cp -f "${PROJECT_ROOT}/deploy/xmessenger.sh" /usr/local/bin/xmessenger 2>/dev/null || cp -f "deploy/xmessenger.sh" /usr/local/bin/xmessenger 2>/dev/null || true
chmod +x /usr/local/bin/xmessenger 2>/dev/null || true

echo -e "\n${GREEN}${BOLD}==================================================================${NC}"
echo -e "${GREEN}${BOLD}🎉 XMessenger for ${DOMAIN} successfully deployed!${NC}"
echo -e "${GREEN}${BOLD}==================================================================${NC}"
echo -e "${CYAN}🌐 Web Address:${NC}       https://${DOMAIN}"
echo -e "${CYAN}👤 Admin Username:${NC}   admin"
echo -e "${CYAN}🔑 Admin Password:${NC}   ${ADMIN_PASSWORD}"
echo -e "${CYAN}📦 Container Name:${NC}   xmessenger-${SLUG}"
echo -e "${CYAN}💾 Database Volume:${NC}  xmessenger-data-${SLUG} (Isolated)"
echo -e "${CYAN}🔒 Storage Encryption:${NC} AES-256-GCM (Active)"
echo -e "${CYAN}⏱️ Ephemeral TTL:${NC}     24 Hours (Configurable in Admin Panel)"
echo -e "${GREEN}${BOLD}==================================================================${NC}"
echo -e "${YELLOW}${BOLD}💡 پنل مدیریت چنددامنه‌ای سرور:${NC}"
echo -e "   کافیست در ترمینال سرور دستور ${CYAN}${BOLD}xmessenger${NC} را تایپ کنید تا لیست تمام مسنجرهای نصب‌شده را ببینید و مدیریت کنید."
echo -e "${GREEN}${BOLD}==================================================================${NC}\n"
