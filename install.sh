#!/bin/bash
# KI-Agent Installer v0.0.1 Beta
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}  \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510"
echo -e "  \u2502  \ud83e\udd16  KI-Agent v0.0.1 Beta           \u2502"
echo -e "  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518${NC}\n"

if [ "$EUID" -ne 0 ]; then echo -e "${RED}Bitte als Root ausf\u00fchren (sudo bash install.sh)${NC}"; exit 1; fi

if ! command -v node &> /dev/null; then
  echo -e "${BLUE}Installiere Node.js 22...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

read -p "  Benutzername [admin]: " USERNAME
USERNAME=${USERNAME:-admin}
read -s -p "  Passwort: " PASSWORD
echo ''
if [ -z "$PASSWORD" ]; then echo -e "${RED}Passwort darf nicht leer sein!${NC}"; exit 1; fi
read -p "  Port [80]: " PORT
PORT=${PORT:-80}

INSTALL_DIR="/opt/ki-agent"
mkdir -p "$INSTALL_DIR"
cp -r "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/." "$INSTALL_DIR/"
cd "$INSTALL_DIR"

cat > config.json <<EOF
{ "username": "${USERNAME}", "password": "${PASSWORD}", "port": ${PORT} }
EOF

echo -e "${BLUE}Installiere Abh\u00e4ngigkeiten...${NC}"
npm install --production --silent

cat > /etc/systemd/system/ki-agent.service <<EOF
[Unit]
Description=KI-Agent Chat Server
After=network.target

[Service]
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/node agent.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ki-agent
systemctl start ki-agent

# IPv4 priorisieren
PUBLIC_IP=$(curl -4 -s ifconfig.me 2>/dev/null || echo "DEINE-IP")
echo -e "\n${GREEN}\u2714 Installiert! Web-Interface (IPv4): http://${PUBLIC_IP}:${PORT}${NC}"

# Auch IPv6 anzeigen falls verf\u00fcgbar
PUBLIC_IPV6=$(ip -6 addr | grep 'inet6 2' | grep -v 'fe80' | head -1 | awk '{print $2}' | cut -d/ -f1)
if [ ! -z "$PUBLIC_IPV6" ]; then
  echo -e "${GREEN}\u2714 Auch via IPv6 erreichbar: http://[${PUBLIC_IPV6}]:${PORT}${NC}"
fi

echo -e "\n${YELLOW}Hinweis: SSL/HTTPS wird derzeit nicht unterst\u00fctzt (kommt in sp\u00e4teren Versionen).${NC}\n"