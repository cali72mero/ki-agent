#!/bin/bash
# Chat & Context Update - Initialisiert den KI-Agent
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}  ┌──────────────────────────────────────┐"
echo -e "  │  🤖  KI-Agent Installer             │"
echo -e "  └──────────────────────────────────────┘${NC}\n"

if [ "$EUID" -ne 0 ]; then echo -e "${RED}Bitte als Root ausführen (sudo bash install.sh)${NC}"; exit 1; fi

if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

read -p "  Benutzername [admin]: " USERNAME
USERNAME=${USERNAME:-admin}
read -s -p "  Passwort: " PASSWORD
echo ''
if [ -z "$PASSWORD" ]; then exit 1; fi
read -p "  Port [8460]: " PORT
PORT=${PORT:-8460}

INSTALL_DIR="/opt/ki-agent"
mkdir -p "$INSTALL_DIR"
cp -r "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/." "$INSTALL_DIR/"
cd "$INSTALL_DIR"

cat > config.json <<EOF
{ "username": "${USERNAME}", "password": "${PASSWORD}", "port": ${PORT} }
EOF

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

PUBLIC_IP=$(curl -s ifconfig.me || echo "DEINE-IP")
echo -e "\n${GREEN}✔ Installiert! Web-Interface: http://${PUBLIC_IP}:${PORT}${NC}\n"