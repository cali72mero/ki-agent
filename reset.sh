#!/bin/bash
# Passwort zurücksetzen & alle Daten löschen

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}Bitte als Root ausführen (sudo bash reset.sh)${NC}"
  exit 1
fi

echo -e "${RED}"
echo "  ┌──────────────────────────────────────┐"
echo "  │  ⚠️  WARNUNG: Alle Daten löschen!    │"
echo "  └──────────────────────────────────────┘"
echo -e "${NC}"
echo -e "${YELLOW}Dieses Script löscht:${NC}"
echo "  - Benutzername & Passwort"
echo "  - Alle API Keys (verschlüsselte Daten)"
echo "  - Gesamten Chat-Verlauf"
echo "  - Alle aktiven Sessions"
echo "  - Domain-Einstellungen"
echo ""
read -p "Möchtest du wirklich ALLES zurücksetzen? (yes/NEIN): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo -e "${GREEN}Abgebrochen. Keine Daten wurden gelöscht.${NC}"
  exit 0
fi

echo -e "${RED}Lösche alle Daten...${NC}"

# Stoppe den Service
systemctl stop ki-agent

# Lösche alle User-Daten
rm -rf /opt/ki-agent/data
rm -f /opt/ki-agent/config.json

echo -e "${GREEN}✔ Alle Daten gelöscht.${NC}\n"
echo -e "${YELLOW}Bitte richte das System neu ein:${NC}"
read -p "  Neuer Benutzername [admin]: " USERNAME
USERNAME=${USERNAME:-admin}
read -s -p "  Neues Passwort: " PASSWORD
echo ''
if [ -z "$PASSWORD" ]; then 
  echo -e "${RED}Passwort darf nicht leer sein!${NC}"
  exit 1
fi
read -p "  Port [80]: " PORT
PORT=${PORT:-80}

cat > /opt/ki-agent/config.json <<EOF
{ "username": "${USERNAME}", "password": "${PASSWORD}", "port": ${PORT} }
EOF

mkdir -p /opt/ki-agent/data

systemctl start ki-agent

echo -e "\n${GREEN}✔ System zurückgesetzt und neu konfiguriert!${NC}"
echo -e "${GREEN}Du kannst dich jetzt mit den neuen Zugangsdaten anmelden.${NC}\n"