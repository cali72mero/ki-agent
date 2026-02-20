#!/bin/bash
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}"
echo '  ┌──────────────────────────────────────┐'
echo '  │  🤖  KI-Agent Installer             │'
echo '  │  Dein pers\u00f6nlicher AI-Agent        │'
echo '  └──────────────────────────────────────┘'
echo -e "${NC}"
echo ''

# Root-Check
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}\u274c Bitte als Root ausf\u00fchren: sudo bash install.sh${NC}"
  exit 1
fi

# Node.js installieren falls nicht vorhanden
if ! command -v node &> /dev/null; then
  echo -e "${BLUE}\ud83d\udce6 Installiere Node.js 22...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
else
  echo -e "${GREEN}\u2714 Node.js bereits installiert: $(node --version)${NC}"
fi

# Benutzerdaten abfragen
echo ''
echo -e "${YELLOW}\ud83d\udc64 Benutzername f\u00fcr das Web-Interface:${NC}"
read -p "  Benutzername [admin]: " USERNAME
USERNAME=${USERNAME:-admin}

echo -e "${YELLOW}\ud83d\udd10 Passwort (wird versteckt eingegeben):${NC}"
read -s -p "  Passwort: " PASSWORD
echo ''

if [ -z "$PASSWORD" ]; then
  echo -e "${RED}\u274c Passwort darf nicht leer sein!${NC}"
  exit 1
fi

echo -e "${YELLOW}\ud83d\udd0c Port [8460]:${NC}"
read -p "  Port: " PORT
PORT=${PORT:-8460}

# Installationsverzeichnis
INSTALL_DIR="/opt/ki-agent"
echo ''
echo -e "${BLUE}\ud83d\udcc2 Installiere in ${INSTALL_DIR}...${NC}"

mkdir -p "$INSTALL_DIR"

# Skript-Verzeichnis ermitteln (wo install.sh liegt)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp -r "$SCRIPT_DIR/." "$INSTALL_DIR/"
cd "$INSTALL_DIR"

# Config schreiben
cat > config.json <<EOF
{
  "username": "${USERNAME}",
  "password": "${PASSWORD}",
  "port": ${PORT}
}
EOF

echo -e "${BLUE}\ud83d\udce6 Installiere Node.js Abh\u00e4ngigkeiten...${NC}"
npm install --production --silent

# Systemd-Service erstellen
cat > /etc/systemd/system/ki-agent.service <<EOF
[Unit]
Description=KI-Agent Pers\u00f6nlicher AI-Server
After=network.target

[Service]
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/node agent.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ki-agent
systemctl start ki-agent

# \u00d6ffentliche IP ermitteln
PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "DEINE-SERVER-IP")

echo ''
echo -e "${GREEN}┌──────────────────────────────────────┐${NC}"
echo -e "${GREEN}\u2502 \u2714 KI-Agent erfolgreich installiert!  │${NC}"
echo -e "${GREEN}\u2514──────────────────────────────────────┘${NC}"
echo ''
echo -e "${BLUE}\ud83c\udf10 Web-Interface: ${GREEN}http://${PUBLIC_IP}:${PORT}${NC}"
echo -e "${BLUE}\ud83d\udc64 Benutzername:  ${GREEN}${USERNAME}${NC}"
echo -e "${BLUE}\ud83d\udd11 Passwort:      ${GREEN}[das von dir eingegebene]${NC}"
echo ''
echo -e "${YELLOW}Wichtige Befehle:${NC}"
echo "  sudo systemctl start ki-agent    # Starten"
echo "  sudo systemctl stop ki-agent     # Stoppen"
echo "  sudo systemctl restart ki-agent  # Neu starten"
echo "  sudo journalctl -u ki-agent -f   # Live-Logs"
echo ''
echo -e "${YELLOW}\u26a0\ufe0f  Stelle sicher, dass Port ${PORT} in deiner Firewall ge\u00f6ffnet ist:${NC}"
echo "  sudo ufw allow ${PORT}"
echo ''
