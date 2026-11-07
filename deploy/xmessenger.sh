#!/usr/bin/env bash
# ==============================================================================
# XMessenger CLI Management Tool
# Interactive Server Management Menu for XMessenger
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Detect Installation Directory
if [ -d "/opt/xmessenger/deploy" ]; then
  INSTALL_DIR="/opt/xmessenger"
elif [ -f "$(pwd)/deploy/docker-compose.yml" ]; then
  INSTALL_DIR="$(pwd)"
elif [ -f "$(pwd)/docker-compose.yml" ]; then
  INSTALL_DIR="$(cd .. && pwd)"
else
  INSTALL_DIR="/opt/xmessenger"
fi

DEPLOY_DIR="${INSTALL_DIR}/deploy"

docker_compose_cmd() {
  if docker compose version &> /dev/null; then
    docker compose "$@"
  elif command -v docker-compose &> /dev/null; then
    docker-compose "$@"
  else
    docker compose "$@"
  fi
}

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
  echo "        XMessenger CLI Management Console (v1.0.0)             "
  echo "=================================================================="
  echo -e "${NC}"
}

load_env() {
  if [ -f "${DEPLOY_DIR}/.env" ]; then
    export $(cat "${DEPLOY_DIR}/.env" | grep -v '^#' | xargs)
  fi
}

show_status() {
  show_banner
  load_env
  echo -e "${GREEN}${BOLD}📋 اطلاعات و وضعیت فعلی سیستم:${NC}\n"
  echo -e "  ${CYAN}🌐 آدرس وب (Domain):${NC}        https://${DOMAIN:-نامشخص}"
  echo -e "  ${CYAN}👤 نام کاربری ادمین:${NC}        ${ADMIN_USERNAME:-admin}"
  echo -e "  ${CYAN}🔑 رمز عبور ادمین:${NC}          ${ADMIN_PASSWORD:-تنظیم شده در دیتابیس}"
  echo -e "  ${CYAN}🔒 الگوریتم رمزنگاری:${NC}       AES-256-GCM (فعال)"
  echo -e "  ${CYAN}⏱️ زمان پیش‌فرض پیام‌ها:${NC}     ${DEFAULT_TTL_SECONDS:-86400} ثانیه"
  echo -e "  ${CYAN}📁 مسیر نصب سرور:${NC}           ${INSTALL_DIR}"
  echo ""
  echo -e "${BOLD}وضعیت کانتینرهای داکر:${NC}"
  cd "${DEPLOY_DIR}" && docker_compose_cmd ps
  echo ""
  read -p "برای بازگشت به منو اینتر بزنید..." dummy
}

show_logs() {
  show_banner
  echo -e "${YELLOW}مشاهده لاگ‌های زنده سرور (برای خروج Ctrl+C بزنید)...${NC}\n"
  cd "${DEPLOY_DIR}" && docker_compose_cmd logs -f --tail=100
}

restart_services() {
  show_banner
  echo -e "${YELLOW}در حال ری‌استارت سرویس‌های XMessenger...${NC}"
  cd "${DEPLOY_DIR}" && docker_compose_cmd restart
  echo -e "\n${GREEN}سرویس‌ها با موفقیت ری‌استارت شدند.${NC}"
  sleep 2
}

start_services() {
  show_banner
  echo -e "${YELLOW}در حال راه‌اندازی کانتینرهای XMessenger...${NC}"
  cd "${DEPLOY_DIR}" && docker_compose_cmd up -d
  echo -e "\n${GREEN}کانتینرها با موفقیت راه‌اندازی شدند.${NC}"
  sleep 2
}

stop_services() {
  show_banner
  echo -e "${RED}در حال متوقف کردن سرویس‌های XMessenger...${NC}"
  cd "${DEPLOY_DIR}" && docker_compose_cmd down
  echo -e "\n${YELLOW}سرویس‌ها متوقف شدند.${NC}"
  sleep 2
}

update_app() {
  show_banner
  echo -e "${BLUE}در حال دریافت آخرین نسخه از گیت‌هاب و بیلد مجدد...${NC}\n"
  cd "${INSTALL_DIR}"
  git pull origin main || true
  cd "${DEPLOY_DIR}"
  docker_compose_cmd down
  docker_compose_cmd up -d --build
  echo -e "\n${GREEN}به‌روزرسانی با موفقیت انجام شد!${NC}"
  sleep 2
}

change_admin_password() {
  show_banner
  echo -e "${YELLOW}تغییر رمز عبور ادمین:${NC}\n"
  read -p "رمز عبور جدید ادمین را وارد کنید: " NEW_PASS
  if [ -z "$NEW_PASS" ] || [ ${#NEW_PASS} -lt 6 ]; then
    echo -e "${RED}رمز عبور باید حداقل ۶ کاراکتر باشد.${NC}"
    sleep 2
    return
  fi

  # Update in .env
  sed -i "s|ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${NEW_PASS}|g" "${DEPLOY_DIR}/.env"

  echo -e "${YELLOW}در حال اعمال رمز عبور جدید در سرویس...${NC}"
  cd "${DEPLOY_DIR}" && docker_compose_cmd restart xmessenger
  echo -e "\n${GREEN}رمز عبور ادمین با موفقیت تغییر کرد!${NC}"
  sleep 2
}

reissue_ssl() {
  show_banner
  load_env
  echo -e "${YELLOW}تمدید یا صدور مجدد گواهینامه SSL برای ${DOMAIN}:${NC}\n"
  cd "${DEPLOY_DIR}"
  docker_compose_cmd run --rm certbot certonly --webroot -w /var/www/certbot -d "${DOMAIN}" --force-renewal
  docker_compose_cmd restart nginx
  echo -e "\n${GREEN}گواهی SSL با موفقیت بررسی و ری‌استارت شد.${NC}"
  sleep 2
}

panic_wipe() {
  show_banner
  echo -e "${RED}${BOLD}⚠️ هشدار امنیتی بسیار جدی: پاکسازی اضطراری (Panic Wipe)${NC}"
  echo -e "${RED}این عملیات تمام پیام‌ها، تاریخچه و دیتابیس را به طور قطعی پاک خواهد کرد!${NC}\n"
  read -p "آیا کاملاً مطمئن هستید؟ (عبارت DELETE را تایپ کنید): " CONFIRM
  if [ "$CONFIRM" == "DELETE" ]; then
    echo -e "${YELLOW}در حال پاکسازی قطعی دیتابیس...${NC}"
    cd "${DEPLOY_DIR}"
    docker_compose_cmd down
    docker volume rm -f deploy_xmessenger-data xmessenger_xmessenger-data xmessenger-data 2>/dev/null || true
    docker_compose_cmd up -d
    echo -e "\n${GREEN}تمام داده‌ها به طور کامل امحا و سیستم با دیتابیس نو راه‌اندازی شد.${NC}"
  else
    echo -e "\nعملیات لغو شد."
  fi
  sleep 3
}

# Main Interactive Menu Loop
while true; do
  show_banner
  echo -e " ${BOLD}لطفاً یک گزینه را انتخاب کنید:${NC}"
  echo ""
  echo -e "  ${GREEN}1)${NC} 📋 مشاهده وضعیت سرور و مشخصات ورود"
  echo -e "  ${GREEN}2)${NC} 🔑 تغییر رمز عبور ادمین"
  echo -e "  ${GREEN}3)${NC} 📜 مشاهده لاگ‌های زنده سرور"
  echo -e "  ${GREEN}4)${NC} 🔄 ری‌استارت سرویس‌ها (Restart)"
  echo -e "  ${GREEN}5)${NC} ▶️  شروع سرویس‌ها (Start)"
  echo -e "  ${GREEN}6)${NC} ⏹️  توقف سرویس‌ها (Stop)"
  echo -e "  ${GREEN}7)${NC} 🚀 آپدیت پیام‌رسان به آخرین نسخه گیت‌هاب"
  echo -e "  ${GREEN}8)${NC} 🔒 تمدید یا صدور مجدد گواهی SSL Let's Encrypt"
  echo -e "  ${GREEN}9)${NC} 🚨 پاکسازی کامل و اضطراری تمام پیام‌ها (Panic Wipe)"
  echo -e "  ${RED}0)${NC} 🚪 خروج"
  echo ""
  read -p "شماره گزینه را وارد کنید [0-9]: " choice

  case "$choice" in
    1) show_status ;;
    2) change_admin_password ;;
    3) show_logs ;;
    4) restart_services ;;
    5) start_services ;;
    6) stop_services ;;
    7) update_app ;;
    8) reissue_ssl ;;
    9) panic_wipe ;;
    0)
      echo -e "\nخداحافظ!"
      exit 0
      ;;
    *)
      echo -e "${RED}گزینه نامعتبر است!${NC}"
      sleep 1
      ;;
  esac
done
