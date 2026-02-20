#!/bin/bash
# Zwanghaftes Update-Script für den KI-Agent
set -e

if [ "$EUID" -ne 0 ]; then 
  echo "Bitte als Root ausführen (sudo bash update.sh)"
  exit 1
fi

echo "Lade Updates von GitHub herunter..."
cd /opt/ki-agent || exit

# Stellt sicher, dass das lokale Repo genau dem Remote-Repo entspricht
git fetch --all
git reset --hard origin/main
git clean -fd

echo "Abhängigkeiten aktualisieren falls nötig..."
npm install --production --silent

echo "Update erfolgreich! Starte Service neu..."
nohup bash -c "sleep 2; systemctl restart ki-agent" > /dev/null 2>&1 &

echo "Neustart eingeleitet. Der Agent ist in 3 Sekunden wieder erreichbar."