#!/bin/bash
# Update-Script für den KI-Agent
set -e

if [ "$EUID" -ne 0 ]; then 
  echo "Bitte als Root ausführen (sudo bash update.sh)"
  exit 1
fi

echo "Suche nach Updates auf GitHub..."
cd /opt/ki-agent || exit

# Hole neueste Infos von GitHub
git fetch origin main

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
    echo "Das System ist bereits auf dem neuesten Stand!"
else
    echo "Updates gefunden. Installiere neue Version..."
    # Überschreibt die Code-Dateien mit der neuesten Version von GitHub.
    # WICHTIG: config.json (wo Passwort & Port liegen) ist nicht in Git getrackt
    # und bleibt daher automatisch unangetastet!
    git reset --hard origin/main
    
    # Abhängigkeiten aktualisieren falls nötig
    npm install --production --silent
    
    echo "Update erfolgreich! Starte Service neu..."
    # Wir starten den Dienst asynchron neu, damit API-Requests (wenn über Web-UI aufgerufen)
    # noch eine saubere Antwort an den Browser senden können.
    nohup bash -c "sleep 2; systemctl restart ki-agent" > /dev/null 2>&1 &
    
    echo "Neustart eingeleitet. Der Agent ist in 3 Sekunden wieder erreichbar."
fi