#!/usr/bin/env bash
# ==============================================================================
# XMessenger - Automated 1-Line Installer for Linux
# Hub-and-Spoke Secure Web Messenger with Automated Docker, Nginx & SSL
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
echo "       Secure Hub-and-Spoke Messenger - Linux Installer       "
echo "=================================================================="
echo -e "${NC}"

# 1. Check Root Privileges
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Please run this script as root (use sudo).${NC}"
  exit 1
fi

# Detect execution context (piped curl vs cloned repo)
if [ -f "deploy/docker-compose.yml" ]; then
  SCRIPT_DIR="$(pwd)/deploy"
  PROJECT_ROOT="$(pwd)"
elif [ -f "docker-compose.yml" ]; then
  SCRIPT_DIR="$(pwd)"
  PROJECT_ROOT="$(cd .. && pwd)"
else
  # Running directly via curl -sSL ... | sudo bash
  echo -e "${BLUE}Detected one-line remote execution. Setting up /opt/xmessenger...${NC}"
  INSTALL_DIR="/opt/xmessenger"
  if ! command -v git &> /dev/null; then
    apt-get update -y && apt-get install -y git curl openssl
  fi
  if [ -d "$INSTALL_DIR/.git" ]; then
    echo -e "${YELLOW}Existing repository found in $INSTALL_DIR. Pulling latest changes...${NC}"
    cd "$INSTALL_DIR"
    git pull origin main || true
  else
    rm -rf "$INSTALL_DIR"
    if [ -n "$GITHUB_TOKEN" ]; then
      git clone "https://${GITHUB_TOKEN}@github.com/PouryaDe/XMessenger.git" "$INSTALL_DIR"
    else
      git clone "https://github.com/PouryaDe/XMessenger.git" "$INSTALL_DIR"
    fi
    cd "$INSTALL_DIR"
  fi
  SCRIPT_DIR="$INSTALL_DIR/deploy"
  PROJECT_ROOT="$INSTALL_DIR"
fi

# 2. Check & Install Dependencies (curl, openssl, git, docker)
echo -e "${BLUE}[1/6] Checking system packages & dependencies...${NC}"

if ! command -v curl &> /dev/null || ! command -v openssl &> /dev/null; then
  echo -e "${YELLOW}Installing curl and openssl...${NC}"
  apt-get update -y && apt-get install -y curl openssl git
fi

# Install Docker if not present (Handles sanction/403 blocks on download.docker.com)
if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}Docker not found. Installing Docker engine...${NC}"
  # Try official script first; if it fails (e.g. 403 Forbidden on IR IP), fallback to native docker.io
  if ! (curl -fsSL https://get.docker.com | sh); then
    echo -e "${YELLOW}[Notice] Official docker repository returned error (sanction/403 block).${NC}"
    echo -e "${YELLOW}Switching to native system packages (docker.io & docker-compose)...${NC}"
    rm -f /etc/apt/sources.list.d/docker.list 2>/dev/null || true
    apt-get update -y
    apt-get install -y docker.io docker-compose
  fi
  systemctl enable --now docker || true
  echo -e "${GREEN}Docker installed successfully.${NC}"
else
  echo -e "${GREEN}Docker is already installed.${NC}"
fi

# Ensure Docker Compose works (v2 plugin or standalone v1)
if ! docker compose version &> /dev/null; then
  if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}Installing docker-compose...${NC}"
    apt-get update -y && apt-get install -y docker-compose-plugin 2>/dev/null || apt-get install -y docker-compose || true
  fi
fi

# Define helper to seamlessly support both 'docker compose' and 'docker-compose'
docker_compose_cmd() {
  if docker compose version &> /dev/null; then
    docker compose "$@"
  elif command -v docker-compose &> /dev/null; then
    docker-compose "$@"
  else
    docker compose "$@"
  fi
}

# 3. Interactive Configuration (Supports piped curl with /dev/tty fallback)
echo -e "\n${BLUE}[2/6] Configuring Domain and Security...${NC}"

if [ -z "$DOMAIN" ]; then
  if [ -t 0 ]; then
    read -p "Enter your domain or subdomain (e.g., chat.example.com): " DOMAIN
  elif [ -e /dev/tty ]; then
    read -p "Enter your domain or subdomain (e.g., chat.example.com): " DOMAIN < /dev/tty
  fi
fi

if [ -z "$DOMAIN" ]; then
  echo -e "${RED}[ERROR] Domain name cannot be empty. Please set DOMAIN=yourdomain.com before running.${NC}"
  exit 1
fi

if [ -z "$EMAIL" ]; then
  if [ -t 0 ]; then
    read -p "Enter your email for Let's Encrypt SSL certificate (e.g., admin@${DOMAIN}): " EMAIL
  elif [ -e /dev/tty ]; then
    read -p "Enter your email for Let's Encrypt SSL certificate (e.g., admin@${DOMAIN}): " EMAIL < /dev/tty
  fi
fi

if [ -z "$EMAIL" ]; then
  EMAIL="admin@${DOMAIN}"
fi

if [ -z "$ADMIN_PASSWORD" ]; then
  # Generate a 16-character secure random password
  ADMIN_PASSWORD=$(openssl rand -base64 12)
  echo -e "${YELLOW}Generated secure Admin password:${NC} ${BOLD}${ADMIN_PASSWORD}${NC}"
fi

# 4. Generate Secrets & Environment Configuration
echo -e "\n${BLUE}[3/6] Generating cryptographic keys (AES-256 & JWT)...${NC}"
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

mkdir -p "${SCRIPT_DIR}/nginx/conf.d"
mkdir -p "${SCRIPT_DIR}/certbot/conf"
mkdir -p "${SCRIPT_DIR}/certbot/www"

# Create .env file for docker compose
cat <<EOF > "${SCRIPT_DIR}/.env"
DOMAIN=${DOMAIN}
EMAIL=${EMAIL}
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${ADMIN_PASSWORD}
DEFAULT_TTL_SECONDS=86400
EOF

echo -e "${GREEN}Secrets generated and written to deploy/.env${NC}"

# 5. Acquire Let's Encrypt SSL Certificate
echo -e "\n${BLUE}[4/6] Setting up Let's Encrypt SSL Certificate for ${DOMAIN}...${NC}"

# Write temporary ACME-only Nginx configuration
cat <<EOF > "${SCRIPT_DIR}/nginx/conf.d/default.conf"
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 200 "XMessenger SSL bootstrapping in progress...";
    }
}
EOF

# Start temporary Nginx to serve ACME challenge
echo -e "${YELLOW}Starting temporary web server for ACME verification...${NC}"
docker run --rm -d \
  --name xmessenger-ssl-helper \
  -p 80:80 \
  -v "${SCRIPT_DIR}/nginx/conf.d:/etc/nginx/conf.d:ro" \
  -v "${SCRIPT_DIR}/certbot/www:/var/www/certbot:ro" \
  nginx:alpine

# Run Certbot to acquire certificate
echo -e "${YELLOW}Requesting SSL certificate from Let's Encrypt...${NC}"
docker run --rm \
  -v "${SCRIPT_DIR}/certbot/conf:/etc/letsencrypt" \
  -v "${SCRIPT_DIR}/certbot/www:/var/www/certbot" \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  --email "${EMAIL}" \
  -d "${DOMAIN}" \
  --agree-tos \
  --non-interactive \
  --keep-until-expiring || {
    echo -e "${YELLOW}[WARNING] Automated Let's Encrypt verification failed or timed out.${NC}"
    echo -e "${YELLOW}Creating fallback self-signed SSL certificate so the service can boot safely...${NC}"
    mkdir -p "${SCRIPT_DIR}/certbot/conf/live/${DOMAIN}"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout "${SCRIPT_DIR}/certbot/conf/live/${DOMAIN}/privkey.pem" \
      -out "${SCRIPT_DIR}/certbot/conf/live/${DOMAIN}/fullchain.pem" \
      -subj "/CN=${DOMAIN}"
}

# Stop temporary helper
docker stop xmessenger-ssl-helper 2>/dev/null || true

# 6. Apply Full HTTPS + WebSocket Nginx Configuration
echo -e "\n${BLUE}[5/6] Applying Production Nginx Reverse Proxy with WebSockets...${NC}"
sed "s|\${DOMAIN}|${DOMAIN}|g" "${SCRIPT_DIR}/nginx/nginx.conf.template" > "${SCRIPT_DIR}/nginx/conf.d/default.conf"

# 7. Build and Launch Containers
echo -e "\n${BLUE}[6/6] Building and starting XMessenger containers...${NC}"
cd "${SCRIPT_DIR}"
docker_compose_cmd down 2>/dev/null || true
docker_compose_cmd up -d --build

# 8. Setup Global CLI Command (xmessenger)
chmod +x "${SCRIPT_DIR}/xmessenger.sh" 2>/dev/null || true
cp -f "${SCRIPT_DIR}/xmessenger.sh" /usr/local/bin/xmessenger 2>/dev/null || true
chmod +x /usr/local/bin/xmessenger 2>/dev/null || true

echo -e "\n${GREEN}${BOLD}==================================================================${NC}"
echo -e "${GREEN}${BOLD}🎉 XMessenger successfully deployed!${NC}"
echo -e "${GREEN}${BOLD}==================================================================${NC}"
echo -e "${CYAN}🌐 Web Address:${NC}       https://${DOMAIN}"
echo -e "${CYAN}👤 Admin Username:${NC}   admin"
echo -e "${CYAN}🔑 Admin Password:${NC}   ${ADMIN_PASSWORD}"
echo -e "${CYAN}🔒 Storage Encryption:${NC} AES-256-GCM (Active)"
echo -e "${CYAN}⏱️ Ephemeral TTL:${NC}     24 Hours (Configurable in Admin Panel)"
echo -e "${GREEN}${BOLD}==================================================================${NC}"
echo -e "${YELLOW}${BOLD}💡 دستور پنل مدیریت سرور:${NC}"
echo -e "   کافیست در هر زمان در ترمینال سرور دستور ${CYAN}${BOLD}xmessenger${NC} را تایپ کنید تا وارد منوی مدیریت شوید."
echo -e "${GREEN}${BOLD}==================================================================${NC}"
echo -e "مدیریت دستی از طریق پوشه: ${SCRIPT_DIR}"
echo -e "  - View logs:        docker compose logs -f"
echo -e "  - Stop messenger:   docker compose down"
echo -e "  - Restart:          docker compose restart"
echo -e "${GREEN}Installation complete!${NC}\n"
