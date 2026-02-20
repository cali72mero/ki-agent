# 🤖 KI-Agent – Dein persönlicher Server-Agent Beta bitte noch nicht benutzen

Ein autonomer KI-Agent mit echtem Chat-Interface, der direkt auf deinem Linux-Server läuft und Aufgaben selbstständig erledigt. Er kann programmieren, Fehler beheben und auf Rückfragen im Chat reagieren.

## Neue Features in dieser Version
- 💬 **Echtes Chat-Interface**: Kommuniziere mit der KI wie in einem Messenger. Gib ihr während der Arbeit neue Anweisungen.
- ⏸️ **Intelligente Pause**: Wenn die KI fertig ist, stoppt sie API-Anfragen komplett und spart dir Geld. Sie wartet auf deine nächste Nachricht.
- 📁 **Dateien direkt senden (Context)**: Wähle Ordner oder Dateien aus, die der Server direkt einliest und an die API schickt.
- ⚠️ **Root-Warnung**: Ein Warnhinweis, falls du der KI Vollzugriff (`/`) auf den Server gibst.
- 🔄 **Integrierter Updater**: Lade neue Updates direkt per Knopfdruck über das Web-Interface herunter.

## Installation (Ubuntu / Debian)

```bash
git clone https://github.com/cali72mero/ki-agent.git
cd ki-agent
sudo bash install.sh
```

## Update & Deinstallation

### 🔄 Updates installieren
Du kannst das System jederzeit updaten. Dabei wird überprüft, ob es Neuerungen auf GitHub gibt. **Deine Konfigurationen (Passwörter, Ports) bleiben unangetastet!**

**Möglichkeit 1 (Empfohlen):**
Klicke im Web-Interface unten links auf den Button **"System auf Updates prüfen"**.

**Möglichkeit 2 (Terminal):**
```bash
sudo bash /opt/ki-agent/update.sh
```

### 🗑️ System restlos löschen (Uninstall)
Wenn du den Agenten und alle dazugehörigen Dateien löschen möchtest:
```bash
sudo bash /opt/ki-agent/uninstall.sh
```
Dies entfernt den systemd-Dienst, stoppt laufende Prozesse und löscht das Programmverzeichnis vollständig.

## Benutzung
1. Öffne `http://DEINE-IP:8460`
2. Wähle **Groq** (Kostenlos) oder **OpenAI**.
3. Stelle dein Arbeitsverzeichnis ein (z.B. `/var/www/html`).
4. Schreibe in den Chat: *"Erstelle mir eine Webseite. Behebe alle Fehler. Wenn du fertig bist, melde dich."*

---
Gebaut für einfaches Self-Hosting auf Linux-Servern.
