#!/usr/bin/env bash
# ==============================================================================
# XMessenger Multi-Domain CLI Management Tool
# Manage all XMessenger instances installed on the server
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

show_banner() {
  clear
  echo -e "${CYAN}${BOLD}"
  echo "=================================================================="
  echo "    __  ____  ___                                              "
  echo "    \ \/ /  \/  /___  ____________  ____  ____ ____  _____     "
  echo "     \  / /\_/ / _ \/ ___/ ___/ _ \/ __ \/ __ \/ _ \/ ___/    "
  echo "     / / /  / /  __(__  |__  )  __/ / / / /_/ /  __/ /        "
  echo "    /_/_/  /_/\___/____/____/\___/_/ /_/\__, /\___/_/         "
  echo "                                       /____/                 "
  echo "     XMessenger Multi-Instance Console (Version 2.0.0)         "
  echo "=================================================================="
  echo -e "${NC}"
}

# Get list of configured domains
get_domains() {
  if [ -d "${INSTANCES_DIR}" ]; then
    find "${INSTANCES_DIR}" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; 2>/dev/null || true
  fi
}

manage_instance() {
  local DOMAIN="$1"
  local SLUG=$(echo "$DOMAIN" | tr '.' '-' | tr -cd 'a-zA-Z0-9-')
  local INSTANCE_DIR="${INSTANCES_DIR}/${DOMAIN}"
  local CONTAINER="xmessenger-${SLUG}"

  while true; do
    show_banner
    echo -e "${BOLD}🎯 در حال مدیریت پیام‌رسان دامنه:${NC} ${CYAN}${BOLD}https://${DOMAIN}${NC}\n"

    # Load instance env
    if [ -f "${INSTANCE_DIR}/.env" ]; then
      export $(cat "${INSTANCE_DIR}/.env" | grep -v '^#' | xargs)
    fi

    # Container status
    local STATUS="نامشخص"
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
      STATUS="${GREEN}آنلاین (Running)${NC}"
    else
      STATUS="${RED}متوقف شده (Stopped)${NC}"
    fi

    echo -e "  ${CYAN}🌐 دامنه:${NC}              https://${DOMAIN}"
    echo -e "  ${CYAN}📦 وضعیت کانتینر:${NC}      ${STATUS}"
    echo -e "  ${CYAN}👤 نام کاربری ادمین:${NC}    ${ADMIN_USERNAME:-admin}"
    echo -e "  ${CYAN}🔑 رمز عبور ادمین:${NC}      ${ADMIN_PASSWORD:-محفوظ در دیتابیس}"
    echo -e "  ${CYAN}💾 حجم دیتابیس:${NC}       xmessenger-data-${SLUG}"
    echo ""
    echo -e " ${BOLD}گزینه‌های مدیریت این دامنه:${NC}"
    echo -e "  ${GREEN}1)${NC} 📜 مشاهده لاگ‌های زنده کانتینر (Live Logs)"
    echo -e "  ${GREEN}2)${NC} 🔄 ری‌استارت پیام‌رسان (Restart)"
    echo -e "  ${GREEN}3)${NC} ▶️  روشن کردن کانتینر (Start)"
    echo -e "  ${GREEN}4)${NC} ⏹️  خاموش کردن کانتینر (Stop)"
    echo -e "  ${GREEN}5)${NC} 🔑 تغییر رمز عبور ادمین"
    echo -e "  ${GREEN}6)${NC} 🔒 تمدید مجدد گواهی SSL این دامنه"
    echo -e "  ${RED}7)${NC} 🚨 پاکسازی اضطراری دیتابیس (Panic Wipe)"
    echo -e "  ${RED}8)${NC} 🗑️  حذف کامل این پیام‌رسان و دامنه (Uninstall Domain)"
    echo -e "  ${YELLOW}0)${NC} ↩️  بازگشت به لیست دامنه‌ها"
    echo ""
    read -p "یک گزینه را انتخاب کنید [0-8]: " subchoice

    case "$subchoice" in
      1)
        show_banner
        echo -e "${YELLOW}مشاهده لاگ‌های زنده ${CONTAINER} (برای خروج Ctrl+C بزنید)...${NC}\n"
        docker logs -f --tail=100 "${CONTAINER}" || true
        ;;
      2)
        echo -e "\n${YELLOW}در حال ری‌استارت ${CONTAINER}...${NC}"
        docker restart "${CONTAINER}"
        sleep 2
        ;;
      3)
        echo -e "\n${YELLOW}در حال راه‌اندازی ${CONTAINER}...${NC}"
        docker start "${CONTAINER}"
        sleep 2
        ;;
      4)
        echo -e "\n${YELLOW}در حال متوقف کردن ${CONTAINER}...${NC}"
        docker stop "${CONTAINER}"
        sleep 2
        ;;
      5)
        show_banner
        read -p "رمز عبور جدید ادمین برای ${DOMAIN} را وارد کنید: " NEW_PASS
        if [ -n "$NEW_PASS" ] && [ ${#NEW_PASS} -ge 6 ]; then
          sed -i "s|ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${NEW_PASS}|g" "${INSTANCE_DIR}/.env"
          docker restart "${CONTAINER}"
          echo -e "\n${GREEN}رمز عبور با موفقیت به‌روزرسانی شد.${NC}"
          sleep 2
        else
          echo -e "${RED}رمز عبور باید حداقل ۶ کاراکتر باشد.${NC}"
          sleep 2
        fi
        ;;
      6)
        show_banner
        echo -e "${YELLOW}در حال تمدید گواهینامه SSL برای ${DOMAIN}...${NC}"
        docker run --rm \
          --network xmessenger-net \
          -v "${SHARED_DIR}/certbot/conf:/etc/letsencrypt" \
          -v "${SHARED_DIR}/certbot/www:/var/www/certbot" \
          certbot/certbot certonly --webroot -w /var/www/certbot -d "${DOMAIN}" --force-renewal
        docker exec xmessenger-nginx nginx -s reload 2>/dev/null || true
        echo -e "\n${GREEN}گواهی SSL مجدداً صادر و بارگذاری شد.${NC}"
        sleep 2
        ;;
      7)
        show_banner
        echo -e "${RED}${BOLD}⚠️ اخطار: تمام پیام‌ها و دیتابیس ${DOMAIN} به طور کامل نابود خواهد شد!${NC}"
        read -p "برای تایید قطعی عبارت DELETE را تایپ کنید: " CONFIRM
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
          echo -e "\n${GREEN}دیتابیس امحا و پیام‌رسان با دیتابیس خام بازسازی شد.${NC}"
          sleep 2
        fi
        ;;
      8)
        show_banner
        echo -e "${RED}${BOLD}⚠️ آیا مطمئنید می‌خواهید دامنه ${DOMAIN} را به طور کامل از این سرور حذف کنید؟${NC}"
        read -p "عبارت UNINSTALL را تایپ کنید: " CONFIRM
        if [ "$CONFIRM" == "UNINSTALL" ]; then
          docker rm -f "${CONTAINER}" 2>/dev/null || true
          docker volume rm -f "xmessenger-data-${SLUG}" 2>/dev/null || true
          rm -rf "${INSTANCE_DIR}"
          rm -f "${SHARED_DIR}/nginx/conf.d/${DOMAIN}.conf"
          docker exec xmessenger-nginx nginx -s reload 2>/dev/null || true
          echo -e "\n${GREEN}پیام‌رسان ${DOMAIN} با موفقیت حذف شد.${NC}"
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

  echo -e " ${BOLD}لیست پیام‌رسان‌های فعال روی این سرور:${NC}\n"

  if [ ${#DOMAINS[@]} -eq 0 ]; then
    echo -e "  ${YELLOW}هیچ پیام‌رسانی هنوز ثبت نشده است.${NC}\n"
  else
    for i in "${!DOMAINS[@]}"; do
      D="${DOMAINS[$i]}"
      S=$(echo "$D" | tr '.' '-' | tr -cd 'a-zA-Z0-9-')
      C="xmessenger-${S}"
      if docker ps --format '{{.Names}}' | grep -q "^${C}$"; then
        STATE="${GREEN}● آنلاین${NC}"
      else
        STATE="${RED}○ متوقف${NC}"
      fi
      echo -e "  ${GREEN}$((i+1)))${NC} ${BOLD}https://${D}${NC}  [${STATE}]"
    done
    echo ""
  fi

  echo -e " ${BOLD}عملیات‌های سراسری سرور:${NC}"
  echo -e "  ${CYAN}A)${NC} ➕ افزودن دامنه جدید و نصب پیام‌رسان تازه"
  echo -e "  ${CYAN}R)${NC} 🔄 ری‌استارت گیت‌وی Nginx سراسری"
  echo -e "  ${CYAN}U)${NC} 🚀 آپدیت تمام پیام‌رسان‌ها به آخرین نسخه گیت‌هاب"
  echo -e "  ${RED}0)${NC} 🚪 خروج"
  echo ""
  read -p "لطفاً شماره دامنه یا گزینه مورد نظر را وارد کنید: " choice

  case "$choice" in
    [0-9]*)
      if [ "$choice" -eq 0 ]; then
        echo -e "\nخداحافظ!"
        exit 0
      fi
      IDX=$((choice - 1))
      if [ $IDX -ge 0 ] && [ $IDX -lt ${#DOMAINS[@]} ]; then
        manage_instance "${DOMAINS[$IDX]}"
      else
        echo -e "${RED}شماره نامعتبر است!${NC}"
        sleep 1
      fi
      ;;
    [aA])
      show_banner
      echo -e "${YELLOW}در حال اجرای اسکریپت نصب برای دامنه جدید...${NC}\n"
      bash "${BASE_DIR}/deploy/install.sh"
      read -p "برای ادامه اینتر بزنید..." dummy
      ;;
    [rR])
      echo -e "\n${YELLOW}در حال ری‌استارت وب‌سرور Nginx سراسری...${NC}"
      docker restart xmessenger-nginx 2>/dev/null || true
      echo -e "${GREEN}Nginx ری‌استارت شد.${NC}"
      sleep 2
      ;;
    [uU])
      show_banner
      echo -e "${BLUE}در حال دریافت آخرین نسخه از گیت‌هاب و بیلد سراسری...${NC}\n"
      cd "${BASE_DIR}"
      git pull origin main || true
      docker build -t xmessenger-core:latest -f Dockerfile .
      # Restart all existing instance containers
      for D in "${DOMAINS[@]}"; do
        S=$(echo "$D" | tr '.' '-' | tr -cd 'a-zA-Z0-9-')
        docker restart "xmessenger-${S}" 2>/dev/null || true
      done
      echo -e "\n${GREEN}تمام پیام‌رسان‌ها با موفقیت آپدیت شدند!${NC}"
      sleep 2
      ;;
    *)
      echo -e "${RED}گزینه نامعتبر است!${NC}"
      sleep 1
      ;;
  esac
done
