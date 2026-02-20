#!/bin/bash
# Deinstallations-Script für den KI-Agent

if [ "$EUID" -ne 0 ]; then 
  echo "Bitte als Root ausführen (sudo bash uninstall.sh)"
  exit 1
fi

echo "Stoppe und deaktiviere den KI-Agent Service..."
systemctl stop ki-agent 2>/dev/null || true
systemctl disable ki-agent 2>/dev/null || true
rm -f /etc/systemd/system/ki-agent.service
systemctl daemon-reload

echo "Lösche alle Programmdateien, Logs und Konfigurationen..."
rm -rf /opt/ki-agent

echo "✅ KI-Agent wurde erfolgreich und restlos vom Server gelöscht."