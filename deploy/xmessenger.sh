#!/usr/bin/env bash
# ==============================================================================
# XMessenger Multi-Domain CLI Management Tool
# Manage all XMessenger instances installed on the server
# Strictly English console output for universal terminal compatibility
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

BASE_DIR="/opt/xmessenger"
SHARED_DIR="${BASE_DIR}/shared"
INSTANCES_DIR="${BASE_DIR}/instances"

# Self-healing: ensure global shortcuts always point to latest repository files
if [ -d "${BASE_DIR}" ] && [ "$EUID" -eq 0 ]; then
  ln -sf "${BASE_DIR}/deploy/xmessenger.sh" /usr/local/bin/xmessenger 2>/dev/null || true
  ln -sf "${BASE_DIR}/update.sh" /usr/local/bin/xupdate 2>/dev/null || true
fi


# Get list of configured domains
get_domains() {
  if [ -d "${INSTANCES_DIR}" ]; then
    find "${INSTANCES_DIR}" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; 2>/dev/null || true
  fi
}

renew_or_obtain_ssl() {
  local TARGET_DOMAIN="$1"
  local TARGET_EMAIL="$2"

  if [ -z "$TARGET_EMAIL" ] && [ -f "${INSTANCES_DIR}/${TARGET_DOMAIN}/.env" ]; then
    TARGET_EMAIL=$(grep '^EMAIL=' "${INSTANCES_DIR}/${TARGET_DOMAIN}/.env" | cut -d= -f2- | tr -d '\r\n')
  fi

  echo -e "\n${BLUE}Requesting / Renewing official SSL certificate for ${TARGET_DOMAIN}...${NC}"

  # Ensure UFW allows 80 and 443 if active
  if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow 80/tcp 2>/dev/null || true
    ufw allow 443/tcp 2>/dev/null || true
  fi

  # Ensure Shared Nginx gateway is online
  if ! docker ps --format '{{.Names}}' | grep -q '^xmessenger-nginx$'; then
    docker start xmessenger-nginx 2>/dev/null || docker restart xmessenger-nginx 2>/dev/null || true
  fi

  # If certificate is self-signed fallback, temporarily back it up so Certbot has a clean slate
  local cert_file="${SHARED_DIR}/certbot/conf/live/${TARGET_DOMAIN}/fullchain.pem"
  local temp_backup=""
  if [ -f "$cert_file" ] && ! openssl x509 -in "$cert_file" -issuer -noout 2>/dev/null | grep -qiE "(Let's Encrypt|ISRG Root)"; then
    echo -e "${YELLOW}Detected self-signed fallback certificate. Clearing for clean Let's Encrypt lineage...${NC}"
    temp_backup=$(mktemp -d)
    cp -r "${SHARED_DIR}/certbot/conf/live/${TARGET_DOMAIN}" "${temp_backup}/"
    rm -rf "${SHARED_DIR}/certbot/conf/live/${TARGET_DOMAIN}"
    rm -rf "${SHARED_DIR}/certbot/conf/archive/${TARGET_DOMAIN}"
    rm -f "${SHARED_DIR}/certbot/conf/renewal/${TARGET_DOMAIN}.conf"
  fi

  local email_args="--register-unsafely-without-email"
  if [ -n "$TARGET_EMAIL" ] && [[ "$TARGET_EMAIL" == *"@"* ]]; then
    email_args="--email ${TARGET_EMAIL} --no-eff-email"
  fi

  chmod -R 755 "${SHARED_DIR}/certbot/www" 2>/dev/null || true

  local obtain_ok=0
  if docker run --rm \
    --network xmessenger-net \
    -v "${SHARED_DIR}/certbot/conf:/etc/letsencrypt" \
    -v "${SHARED_DIR}/certbot/www:/var/www/certbot" \
    certbot/certbot certonly --webroot -w /var/www/certbot \
    ${email_args} \
    --cert-name "${TARGET_DOMAIN}" \
    -d "${TARGET_DOMAIN}" \
    --agree-tos \
    --non-interactive \
    --force-renewal ; then
    obtain_ok=1
  elif [ "$email_args" != "--register-unsafely-without-email" ]; then
    echo -e "${YELLOW}Initial request returned an error. Retrying without email validation...${NC}"
    if docker run --rm \
      --network xmessenger-net \
      -v "${SHARED_DIR}/certbot/conf:/etc/letsencrypt" \
      -v "${SHARED_DIR}/certbot/www:/var/www/certbot" \
      certbot/certbot certonly --webroot -w /var/www/certbot \
      --register-unsafely-without-email \
      --cert-name "${TARGET_DOMAIN}" \
      -d "${TARGET_DOMAIN}" \
      --agree-tos \
      --non-interactive \
      --force-renewal ; then
      obtain_ok=1
    fi
  fi

  if [ "$obtain_ok" -eq 1 ]; then
    echo -e "${GREEN}✓ Official Let's Encrypt SSL certificate obtained and activated!${NC}"
    docker exec xmessenger-nginx nginx -s reload 2>/dev/null || docker restart xmessenger-nginx 2>/dev/null || true
    [ -n "$temp_backup" ] && rm -rf "$temp_backup"
    return 0
  else
    echo -e "${RED}[ERROR] Let's Encrypt issuance failed.${NC}"
    echo -e "${YELLOW}Common causes: DNS A-record not pointing to this server IP, or incoming port 80 blocked.${NC}"
    if [ -n "$temp_backup" ] && [ -d "${temp_backup}/${TARGET_DOMAIN}" ]; then
      mkdir -p "${SHARED_DIR}/certbot/conf/live"
      cp -r "${temp_backup}/${TARGET_DOMAIN}" "${SHARED_DIR}/certbot/conf/live/"
      rm -rf "$temp_backup"
      docker exec xmessenger-nginx nginx -s reload 2>/dev/null || docker restart xmessenger-nginx 2>/dev/null || true
    fi
    return 1
  fi
}

# Direct CLI commands (non-interactive shortcuts)
if [ "$1" == "update" ] || [ "$1" == "up" ] || [ "$1" == "-u" ]; then
  cd "${BASE_DIR}"
  git fetch origin main 2>/dev/null || true
  git reset --hard origin/main 2>/dev/null || true
  exec bash "${BASE_DIR}/update.sh"
fi

if [ "$1" == "ssl" ] || [ "$1" == "cert" ]; then
  TARGET_DOMAIN="$2"
  if [ -z "$TARGET_DOMAIN" ]; then
    TARGET_DOMAIN=$(get_domains | head -n 1)
  fi
  if [ -z "$TARGET_DOMAIN" ]; then
    echo "No domain found in ${INSTANCES_DIR}."
    exit 1
  fi
  renew_or_obtain_ssl "$TARGET_DOMAIN"
  exit 0
fi

if [ "$1" == "restart" ]; then
  docker restart xmessenger-nginx 2>/dev/null || true
  for c in $(docker ps --format '{{.Names}}' | grep '^xmessenger-'); do
    docker restart "$c" 2>/dev/null || true
  done
  echo "All XMessenger containers restarted."
  exit 0
fi

if [ "$1" == "status" ] || [ "$1" == "ps" ]; then
  docker ps --filter "name=xmessenger"
  exit 0
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

show_banner() {
  clear
  local VER=$(get_version)
  echo -e "${CYAN}${BOLD}"
  echo "=================================================================="
  echo "    __  ____  ___                                              "
  echo "    \ \/ /  \/  /___  ____________  ____  ____ ____  _____     "
  echo "     \  / /\_/ / _ \/ ___/ ___/ _ \/ __ \/ __ \/ _ \/ ___/    "
  echo "     / / /  / /  __(__  |__  )  __/ / / / /_/ /  __/ /        "
  echo "    /_/_/  /_/\___/____/____/\___/_/ /_/\__, /\___/_/         "
  echo "                                       /____/                 "
  echo "     XMessenger Multi-Instance Console (v${VER})              "
  echo "=================================================================="
  echo -e "${NC}"
}


manage_instance() {
  local DOMAIN="$1"
  local SLUG=$(echo "$DOMAIN" | tr '.' '-' | tr -cd 'a-zA-Z0-9-')
  local INSTANCE_DIR="${INSTANCES_DIR}/${DOMAIN}"
  local CONTAINER="xmessenger-${SLUG}"

  while true; do
    show_banner
    echo -e "${BOLD}Managing Messenger Instance:${NC} ${CYAN}${BOLD}https://${DOMAIN}${NC}\n"

    # Load instance env
    if [ -f "${INSTANCE_DIR}/.env" ]; then
      export $(cat "${INSTANCE_DIR}/.env" | grep -v '^#' | xargs)
    fi

    # Container status
    local STATUS="Unknown"
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
      STATUS="${GREEN}ONLINE (Running)${NC}"
    else
      STATUS="${RED}STOPPED${NC}"
    fi

    echo -e "  ${CYAN}Domain:${NC}              https://${DOMAIN}"
    echo -e "  ${CYAN}Container Status:${NC}    ${STATUS}"
    echo -e "  ${CYAN}Admin Username:${NC}      ${ADMIN_USERNAME:-admin}"
    echo -e "  ${CYAN}Admin Password:${NC}      ${ADMIN_PASSWORD:-Stored in database}"
    echo -e "  ${CYAN}Database Volume:${NC}     xmessenger-data-${SLUG}"
    echo ""
    echo -e " ${BOLD}Instance Management Options:${NC}"
    echo -e "  ${GREEN}1)${NC} View live container logs (Live Logs)"
    echo -e "  ${GREEN}2)${NC} Restart messenger instance (Restart)"
    echo -e "  ${GREEN}3)${NC} Start container (Start)"
    echo -e "  ${GREEN}4)${NC} Stop container (Stop)"
    echo -e "  ${GREEN}5)${NC} Change admin password"
    echo -e "  ${GREEN}6)${NC} Force renew SSL certificate"
    echo -e "  ${RED}7)${NC} Panic wipe database (Hard Reset)"
    echo -e "  ${RED}8)${NC} Uninstall domain & messenger completely"
    echo -e "  ${YELLOW}0)${NC} Back to domain list"
    echo ""
    read -p "Select an option [0-8]: " subchoice

    case "$subchoice" in
      1)
        show_banner
        echo -e "${YELLOW}Streaming live logs for ${CONTAINER} (Press Ctrl+C to exit)...${NC}\n"
        docker logs -f --tail=100 "${CONTAINER}" || true
        ;;
      2)
        echo -e "\n${YELLOW}Injecting latest build and restarting ${CONTAINER}...${NC}"
        cd "${BASE_DIR}"
        docker cp client/dist/. "${CONTAINER}:/app/client-dist/" 2>/dev/null || true
        docker cp server/dist/. "${CONTAINER}:/app/dist/" 2>/dev/null || true
        docker restart "${CONTAINER}"
        docker restart xmessenger-nginx 2>/dev/null || true
        echo -e "${GREEN}✓ ${CONTAINER} updated and restarted successfully!${NC}"
        sleep 2
        ;;
      3)
        echo -e "\n${YELLOW}Starting ${CONTAINER}...${NC}"
        docker start "${CONTAINER}"
        sleep 2
        ;;
      4)
        echo -e "\n${YELLOW}Stopping ${CONTAINER}...${NC}"
        docker stop "${CONTAINER}"
        sleep 2
        ;;
      5)
        show_banner
        read -p "Enter new admin password for ${DOMAIN}: " NEW_PASS
        if [ -n "$NEW_PASS" ] && [ ${#NEW_PASS} -ge 6 ]; then
          sed -i "s|ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${NEW_PASS}|g" "${INSTANCE_DIR}/.env"
          docker restart "${CONTAINER}"
          echo -e "\n${GREEN}Admin password updated successfully.${NC}"
          sleep 2
        else
          echo -e "${RED}Password must be at least 6 characters long.${NC}"
          sleep 2
        fi
        ;;
      6)
        show_banner
        renew_or_obtain_ssl "${DOMAIN}" "${EMAIL}"
        echo ""
        read -p "Press Enter to continue..."
        ;;
      7)
        show_banner
        echo -e "${RED}${BOLD}WARNING: All messages and database data for ${DOMAIN} will be PERMANENTLY DESTROYED!${NC}"
        read -p "Type DELETE to confirm: " CONFIRM
        if [ "$CONFIRM" == "DELETE" ]; then
          docker rm -f "${CONTAINER}" 2>/dev/null || true
          docker volume rm -f "xmessenger-data-${SLUG}" 2>/dev/null || true
          docker run -d \
            --name "${CONTAINER}" \
            --restart always \
            --network xmessenger-net \
            --env-file "${INSTANCE_DIR}/.env" \
            -v "xmessenger-data-${SLUG}:/app/data" \
            xmessenger-core:latest
          echo -e "\n${GREEN}Database wiped. Fresh instance recreated successfully.${NC}"
          sleep 2
        fi
        ;;
      8)
        show_banner
        echo -e "${RED}${BOLD}WARNING: Are you sure you want to completely remove ${DOMAIN} from this server?${NC}"
        read -p "Type UNINSTALL to confirm: " CONFIRM
        if [ "$CONFIRM" == "UNINSTALL" ]; then
          docker rm -f "${CONTAINER}" 2>/dev/null || true
          docker volume rm -f "xmessenger-data-${SLUG}" 2>/dev/null || true
          rm -rf "${INSTANCE_DIR}"
          rm -f "${SHARED_DIR}/nginx/conf.d/${DOMAIN}.conf"
          docker restart xmessenger-nginx 2>/dev/null || true
          echo -e "\n${GREEN}Instance for ${DOMAIN} uninstalled successfully.${NC}"
          sleep 2
          return
        fi
        ;;
      0)
        return
        ;;
    esac
  done
}

# Main Menu
while true; do
  show_banner
  DOMAINS=($(get_domains))

  echo -e " ${BOLD}Active Messenger Instances on this server:${NC}\n"

  if [ ${#DOMAINS[@]} -eq 0 ]; then
    echo -e "  ${YELLOW}No messenger instances configured yet.${NC}\n"
  else
    for i in "${!DOMAINS[@]}"; do
      D="${DOMAINS[$i]}"
      S=$(echo "$D" | tr '.' '-' | tr -cd 'a-zA-Z0-9-')
      C="xmessenger-${S}"
      if docker ps --format '{{.Names}}' | grep -q "^${C}$"; then
        STATE="${GREEN}[ONLINE]${NC}"
      else
        STATE="${RED}[STOPPED]${NC}"
      fi
      echo -e "  ${GREEN}$((i+1)))${NC} ${BOLD}https://${D}${NC}  ${STATE}"
    done
    echo ""
  fi

  echo -e " ${BOLD}Global Server Operations:${NC}"
  echo -e "  ${CYAN}A)${NC} Add new domain & install new messenger"
  echo -e "  ${CYAN}R)${NC} Reload / Restart shared Nginx Gateway"
  echo -e "  ${CYAN}U)${NC} Update all messenger instances to latest GitHub version"
  echo -e "  ${RED}0)${NC} Exit"
  echo ""
  read -p "Enter domain number or option: " choice

  case "$choice" in
    [0-9]*)
      if [ "$choice" -eq 0 ]; then
        echo -e "\nGoodbye!"
        exit 0
      fi
      IDX=$((choice - 1))
      if [ $IDX -ge 0 ] && [ $IDX -lt ${#DOMAINS[@]} ]; then
        manage_instance "${DOMAINS[$IDX]}"
      else
        echo -e "${RED}Invalid selection!${NC}"
        sleep 1
      fi
      ;;
    [aA])
      show_banner
      echo -e "${YELLOW}Running installation script for new domain...${NC}\n"
      bash "${BASE_DIR}/deploy/install.sh"
      read -p "Press Enter to continue..." dummy
      ;;
    [rR])
      echo -e "\n${YELLOW}Restarting shared Nginx Gateway...${NC}"
      docker restart xmessenger-nginx 2>/dev/null || true
      echo -e "${GREEN}Shared Nginx Gateway restarted successfully.${NC}"
      sleep 2
      ;;
    [uU])
      show_banner
      echo -e "${YELLOW}Syncing and updating XMessenger to latest version...${NC}\n"
      cd "${BASE_DIR}"
      git config --global --add safe.directory "${BASE_DIR}" 2>/dev/null || true
      rm -f "${BASE_DIR}/.git/index.lock" "${BASE_DIR}/.git/FETCH_HEAD.lock" "${BASE_DIR}/.git/refs/heads/main.lock" 2>/dev/null || true
      export GIT_TERMINAL_PROMPT=0

      echo -e "${BLUE}▶ Fetching latest changes from GitHub...${NC}"
      timeout 25 git fetch origin main 2>/dev/null || git fetch origin main 2>/dev/null || true
      git reset --hard origin/main 2>/dev/null || true

      chmod +x "${BASE_DIR}/deploy/xmessenger.sh" "${BASE_DIR}/update.sh" "${BASE_DIR}/deploy/autoupdate.sh" 2>/dev/null || true
      ln -sf "${BASE_DIR}/deploy/xmessenger.sh" /usr/local/bin/xmessenger 2>/dev/null || true
      ln -sf "${BASE_DIR}/update.sh" /usr/local/bin/xupdate 2>/dev/null || true

      bash "${BASE_DIR}/update.sh"
      read -p "Press Enter to continue..." dummy
      ;;
    *)
      echo -e "${RED}Invalid choice!${NC}"
      sleep 1
      ;;
  esac
done
