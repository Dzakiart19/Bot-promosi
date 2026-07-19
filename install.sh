#!/usr/bin/env bash
# ============================================================
#  Multi-Platform Chat Bot — Install Script
#  Jalankan sekali setelah clone/import: bash install.sh
# ============================================================

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   Multi-Platform Bot — Installer         ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. Cek Node.js ─────────────────────────────────────────
echo -e "${CYAN}[1/4] Cek Node.js...${NC}"
if ! command -v node &> /dev/null; then
  echo -e "${RED}✗ Node.js tidak ditemukan. Install Node.js >= 18 terlebih dahulu.${NC}"
  echo "    https://nodejs.org"
  exit 1
fi
NODE_VER=$(node -v)
echo -e "${GREEN}✓ Node.js ${NODE_VER}${NC}"

# ── 2. Cek npm ─────────────────────────────────────────────
echo -e "${CYAN}[2/4] Cek npm...${NC}"
if ! command -v npm &> /dev/null; then
  echo -e "${RED}✗ npm tidak ditemukan.${NC}"
  exit 1
fi
NPM_VER=$(npm -v)
echo -e "${GREEN}✓ npm ${NPM_VER}${NC}"

# ── 3. Install dependencies ────────────────────────────────
echo -e "${CYAN}[3/4] Install dependencies (npm install)...${NC}"
npm install
echo -e "${GREEN}✓ node_modules terinstall${NC}"

# ── 4. Verifikasi file bot ─────────────────────────────────
echo -e "${CYAN}[4/4] Verifikasi file bot...${NC}"
BOT_FILES=(
  "bot/opentalk-bot.js"
  "bot/yapping-bot.js"
  "bot/silly-bot.js"
  "bot/chatib-bot.js"
  "bot/duckchat-bot.js"
  "bot/x-bot.js"
  "bot/telegram-bot.js"
  "bot/temanid-bot.js"
  "bot/randompacar-bot.js"
  "bot/gettr-bot.js"
  "bot/start-all.js"
  "public/monitor.html"
)
MISSING=0
for f in "${BOT_FILES[@]}"; do
  if [ -f "$f" ]; then
    echo -e "  ${GREEN}✓ $f${NC}"
  else
    echo -e "  ${RED}✗ $f TIDAK DITEMUKAN!${NC}"
    MISSING=$((MISSING + 1))
  fi
done

if [ "$MISSING" -gt 0 ]; then
  echo -e "${RED}✗ $MISSING file hilang — clone ulang repo dan coba lagi.${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✓ Instalasi selesai!                   ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Jalankan di Replit: start semua workflow dari tab kiri.${NC}"
echo -e "  ${CYAN}Atau via shell (deployment):${NC}"
echo ""
echo -e "    ${YELLOW}node bot/start-all.js${NC}               (semua bot sekaligus)"
echo -e "    ${YELLOW}PORT=8000 node bot/opentalk-bot.js${NC}  (OpenTalk, port 8000)"
echo -e "    ${YELLOW}PORT=3002 node bot/yapping-bot.js${NC}   (Yapping,  port 3002)"
echo -e "    ${YELLOW}PORT=3001 node bot/silly-bot.js${NC}     (SillyChat, port 3001)"
echo -e "    ${YELLOW}PORT=3003 node bot/chatib-bot.js${NC}    (Chatib,   port 3003)"
echo -e "    ${YELLOW}PORT=3004 node bot/duckchat-bot.js${NC}  (DuckChat, port 3004)"
echo -e "    ${YELLOW}PORT=3005 node bot/x-bot.js${NC}         (X Bot,    port 3005)"
echo -e "    ${YELLOW}PORT=4000 node bot/telegram-bot.js${NC}  (Telegram, port 4000)"
echo -e "    ${YELLOW}PORT=3006 node bot/temanid-bot.js${NC}   (TemanID,  port 3006)"
echo -e "    ${YELLOW}PORT=3007 node bot/randompacar-bot.js${NC}(RandomPacar, port 3007)"
echo -e "    ${YELLOW}PORT=3008 node bot/gettr-bot.js${NC}     (GETTR,    port 3008)"
echo ""
echo -e "  ${CYAN}Health check: ${YELLOW}http://localhost:<port>/health${NC}"
echo ""
echo -e "  ${CYAN}Catatan Telegram Bot:${NC}"
echo -e "    Set secrets TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_PHONE"
echo -e "    lalu buka monitor port 4000 → klik Kirim OTP untuk login pertama kali."
echo ""
