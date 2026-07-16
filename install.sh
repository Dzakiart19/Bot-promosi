#!/usr/bin/env bash
# ============================================================
#  StrangerLine Bot — Install Script
#  Jalankan sekali: bash install.sh
# ============================================================

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   StrangerLine Bot — Installer           ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. Cek Node.js ─────────────────────────────────────────
echo -e "${CYAN}[1/4] Cek Node.js...${NC}"
if ! command -v node &> /dev/null; then
  echo -e "${RED}✗ Node.js tidak ditemukan. Install Node.js >= 18 terlebih dahulu.${NC}"
  echo "    https://nodejs.org atau: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
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
echo -e "${CYAN}[3/4] Install dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Dependencies terinstall:${NC}"
echo "    - socket.io-client  (WebSocket client)"
echo "    - node-fetch         (HTTP requests)"
echo "    - uuid               (Random guest ID)"
echo "    - express            (Web server monitoring)"

# ── 4. Cek file bot ────────────────────────────────────────
echo -e "${CYAN}[4/4] Verifikasi file...${NC}"
FILES=("bot/strangerline-bot.js" "bot/opentalk-bot.js" "bot/yapping-bot.js" "bot/silly-bot.js" "bot/chatib-bot.js" "bot/duckchat-bot.js" "bot/joingy-bot.js" "bot/x-bot.js" "public/monitor.html")
for f in "${FILES[@]}"; do
  if [ -f "$f" ]; then
    echo -e "${GREEN}✓ $f${NC}"
  else
    echo -e "${RED}✗ $f tidak ditemukan!${NC}"
    exit 1
  fi
done

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✓ Instalasi selesai!                   ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  StrangerLine  : ${YELLOW}node bot/strangerline-bot.js${NC}           (port 5000)"
echo -e "  OpenTalk      : ${YELLOW}PORT=8000 node bot/opentalk-bot.js${NC}    (port 8000)"
echo -e "  Yapping       : ${YELLOW}PORT=3002 node bot/yapping-bot.js${NC}     (port 3002)"
echo -e "  SillyChat     : ${YELLOW}PORT=3001 node bot/silly-bot.js${NC}       (port 3001)"
echo -e "  Chatib        : ${YELLOW}PORT=3003 node bot/chatib-bot.js${NC}      (port 3003)"
echo -e "  DuckChat      : ${YELLOW}PORT=3004 node bot/duckchat-bot.js${NC}    (port 3004)"
echo -e "  Joingy        : ${YELLOW}PORT=4200 node bot/joingy-bot.js${NC}     (port 4200)"
echo -e "  X (auto-reply): ${YELLOW}PORT=6000 node bot/x-bot.js${NC}          (port 6000)"
echo -e "  Semua sekaligus: ${YELLOW}node bot/start-all.js${NC}"
echo -e "  Health check  : ${YELLOW}http://localhost:<port>/health${NC}"
echo ""
