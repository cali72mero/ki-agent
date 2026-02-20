# 🤖 KI-Agent v0.1 Beta

**Automatischer Coding-Agent mit Chat-Interface** - Wie OpenClaw/Cursor, aber selbst-gehostet!

🚀 Arbeitet **vollautomatisch** an deinen Aufgaben und stoppt wenn fertig!  
💾 Erstellt Dateien, läuft Code aus, behebt Fehler **ohne manuelles Eingreifen**  
💬 ChatGPT-Style Interface mit **persistentem Chat-Verlauf**  
⚡ Unterstützt **10+ AI-Provider** (Groq, OpenAI, Claude, Gemini, etc.)

---

## ✨ Features

### 💬 Chat-Verwaltung (wie ChatGPT)
- ✅ **Mehrere Chats parallel** - Speichere unbegrenzt viele Konversationen
- ✅ **Auto-Save** - Jede Nachricht wird automatisch gespeichert
- ✅ **Chat-Historie** - Bleibt nach Reload/Neustart erhalten
- ✅ **Chat-Wechsel** - Klick auf Chat lädt komplette Historie
- ✅ **Löschen** - Einzelne Chats oder alle auf einmal
- ✅ **SQLite Datenbank** - Lokal gespeichert, keine Cloud

### 🤖 Autonomer Agent
- ✅ **Vollautomatisch** - Arbeitet bis Aufgabe erledigt ist
- ✅ **OpenClaw-Style** - Stoppt sofort nach Datei-Erstellung
- ✅ **Selbst-korrigierend** - Behebt Fehler automatisch
- ✅ **Smart Retry** - Probiert Alternative bei Fehlern
- ✅ **Step-by-Step Log** - Echtzeit-Terminal zeigt jeden Schritt
- ✅ **WebSocket** - Live-Updates ohne Reload

### 🔒 Sicherheit
- ✅ **Normal-Modus** - Nur Dateien erstellen/lesen/schreiben
- ✅ **Root-Modus** - Volle System-Kontrolle (opt-in mit Warnung)
- ✅ **Command-Filter** - Blockiert gefährliche Befehle im Normal-Modus
- ✅ **API-Key Verschlüsselung** - AES-256-CBC verschlüsselt
- ✅ **Session-Management** - Sicheres Login-System

### 🌐 Multi-Provider Support
- ✅ **Groq** (Kostenlos! llama-3.3-70b)
- ✅ **OpenAI** (GPT-4, GPT-4o-mini)
- ✅ **Claude** (Claude 3.5 Sonnet)
- ✅ **Gemini** (Gemini 1.5 Pro)
- ✅ **Mistral AI**
- ✅ **xAI** (Grok)
- ✅ **DeepSeek**
- ✅ **Cohere**
- ✅ **OpenRouter**
- ✅ **Auto-Model-Detection** - Lädt verfügbare Modelle automatisch

### 🛠️ Entwickler-Features
- ✅ **Kontext-Dateien** - Sende Dateien/Ordner als Kontext
- ✅ **Arbeitsverzeichnis** - Wählbar (/var/www/html, /root, etc.)
- ✅ **Terminal-Overlay** - Live-Logs im Browser
- ✅ **Auto-Update** - Ein Klick System-Update
- ✅ **Systemd Service** - Läuft im Hintergrund

---

## 💻 Installation

### Voraussetzungen
- **Linux Server** (Ubuntu/Debian empfohlen)
- **Node.js 16+**
- **npm**
- **Root-Zugriff** (für Systemd-Service)

### Quick Install

```bash
# 1. Repository klonen
git clone https://github.com/cali72mero/ki-agent.git
cd ki-agent

# 2. Abhängigkeiten installieren
npm install

# 3. Konfiguration erstellen
cp config.example.json config.json
nano config.json  # Username & Passwort setzen

# 4. Als Systemd-Service installieren
sudo bash install.sh

# 5. Service starten
sudo systemctl start ki-agent
sudo systemctl enable ki-agent
```

### Manuelle Installation

```bash
# Dependencies
npm install express body-parser ws uuid node-fetch sqlite3

# Config erstellen
echo '{
  "username": "admin",
  "password": "dein-sicheres-passwort",
  "port": 80
}' > config.json

# Starten
sudo node agent.js
```

### Zugriff

```
http://DEINE-SERVER-IP
Login: admin / dein-passwort
```

---

## 🚀 Nutzung

### 1️⃣ Ersten Chat erstellen

1. **➕ Neuer Chat** klicken
2. **Provider & API-Key** eingeben (rechts)
3. **Einstellungen speichern**
4. **Prompt eingeben** und senden!

### 2️⃣ Beispiel-Prompts

**Webseite erstellen:**
```
Erstelle 3 HTML-Seiten über Anime:
1. index.html - Übersicht
2. about.html - Über die Seite
3. contact.html - Kontaktformular

Mit modernem CSS und Navigation.
```

**Python-Script:**
```
Erstelle Python-Script das:
1. Alle .txt Dateien im Ordner liest
2. Nach "error" durchsucht
3. Ergebnisse in error-report.txt speichert
```

**Server konfigurieren (Root-Modus):**
```
Installiere Nginx, konfiguriere für Port 8080,
erstelle SSL-Zertifikat und starte Service.
```

### 3️⃣ Kontext-Dateien senden

**Einzelne Datei:**
```
Kontext-Feld: /var/www/html/index.html
Prompt: Verbessere das Design und füge Responsive Layout hinzu
```

**Ganzer Ordner:**
```
Kontext-Feld: /var/www/html
Prompt: Analysiere alle HTML-Dateien und erstelle Sitemap
```

### 4️⃣ Chat-Verwaltung

- **Neuer Chat**: ➕ Button oben links
- **Chat laden**: Klick auf Chat in Liste
- **Chat löschen**: Hover über Chat → × klicken
- **Alle löschen**: 🗑️ Button unten links

---

## ✅ Was der Agent KANN

### 🟢 Normal-Modus (Standard)
- ✅ **Dateien erstellen** (HTML, CSS, JS, Python, etc.)
- ✅ **Dateien lesen** (cat, grep, find)
- ✅ **Dateien löschen** (rm, rm -rf im Arbeitsverzeichnis)
- ✅ **Ordner erstellen** (mkdir)
- ✅ **Programme ausführen** (python, node, bash-scripts)
- ✅ **Code schreiben** (komplette Projekte)
- ✅ **Fehler beheben** (automatische Korrektur)
- ✅ **Dateien bearbeiten** (sed, awk)
- ✅ **Suchen & Ersetzen** (grep, find, sed)

### 🔴 Root-Modus (Erweitert)
**Zusätzlich zu allem oben:**
- ✅ **Pakete installieren** (apt install, npm install -g)
- ✅ **System updaten** (apt update && apt upgrade)
- ✅ **Services steuern** (systemctl restart/stop/start)
- ✅ **Firewall konfigurieren** (ufw, iptables)
- ✅ **User verwalten** (useradd, passwd)
- ✅ **System neustarten** (reboot)
- ✅ **Cron-Jobs** (crontab -e)
- ✅ **Nginx/Apache konfigurieren**

---

## ❌ Was der Agent NICHT KANN

### Im Normal-Modus:
- ❌ System-Updates (apt update/upgrade)
- ❌ Software installieren (apt install)
- ❌ Services steuern (systemctl)
- ❌ System neustarten (reboot)
- ❌ Kritische System-Dateien löschen (/etc, /var, /usr)
- ❌ Firewall ändern
- ❌ User-Verwaltung

### Generell:
- ❌ **Keine GUI-Anwendungen** (nur Terminal-basiert)
- ❌ **Keine Interaktion** (keine stdin-Inputs möglich)
- ❌ **Keine Netzwerk-Scans** (aus Sicherheitsgründen)
- ❌ **Keine Kernel-Modifikationen**
- ❌ **Keine Docker-Container** (noch nicht implementiert)

---

## 🔒 Sicherheit

### 🟢 Normal-Modus (Empfohlen)
**Sicher für:**
- Web-Entwicklung
- Script-Erstellung
- Datei-Management
- Code-Generierung

**Blockiert:**
- apt install/update/upgrade
- systemctl Befehle
- reboot/shutdown
- Löschen von /etc, /var, /usr, /boot
- Kernel-Modifikationen

### 🔴 Root-Modus (Vorsicht!)
**⚠️ WARNUNG:** Gibt dem Agent **VOLLE System-Kontrolle**!

**Nur nutzen wenn:**
- Du dem Agent vertraust
- Du weißt was du tust
- Du den Server kontrollierst
- Backups vorhanden sind

**Risiken:**
- Agent kann System beschädigen
- Daten können gelöscht werden
- Services können gestoppt werden
- System kann neugestartet werden

---

## 🛠️ Konfiguration

### config.json

```json
{
  "username": "admin",
  "password": "sicheres-passwort",
  "port": 80,
  "domain": "ki-agent.example.com"
}
```

### User-Settings (im Browser)
- **Provider**: AI-Anbieter wählen
- **API-Key**: Verschlüsselt gespeichert
- **Modell**: Auto-geladen oder manuell wählen
- **Arbeitsverzeichnis**: Standard-Ordner
- **Root-Modus**: Ein/Aus schalten

---

## 🐞 Troubleshooting

### Chat-Liste zeigt 400 Error
```bash
cd /opt/ki-agent
npm install sqlite3
sudo systemctl restart ki-agent
```

### Root-Modus funktioniert nicht
1. Checkbox **🔴 Root-Modus aktivieren**
2. Seite neu laden (STRG+SHIFT+R)
3. Terminal Log prüfen: `journalctl -u ki-agent -f`
4. Muss zeigen: `🔴 ROOT-MODUS AKTIV`

### Agent stoppt nicht nach Datei-Erstellung
```bash
cd /opt/ki-agent
git pull
sudo systemctl restart ki-agent
```

### API-Key wird nicht gespeichert
- Browser-Console öffnen (F12)
- Fehler-Meldungen prüfen
- Server-Logs: `journalctl -u ki-agent -n 50`

### Port 80 bereits belegt
```bash
# config.json ändern:
nano /opt/ki-agent/config.json
# "port": 8080

sudo systemctl restart ki-agent
```

---

## 🔄 Updates

### Automatisch (im Browser)
1. **♻️ System updaten** Button klicken
2. Wartet auf Bestätigung
3. Service wird automatisch neugestartet

### Manuell
```bash
cd /opt/ki-agent
sudo bash update.sh
```

### Von GitHub
```bash
cd /opt/ki-agent
git pull
npm install
sudo systemctl restart ki-agent
```

---

## 📊 Roadmap / TODO

- [ ] **Docker-Support** - Container erstellen/verwalten
- [ ] **Multi-User** - Mehrere Accounts
- [ ] **Rollen-System** - Admin/User/Read-Only
- [ ] **Chat-Export** - Markdown/JSON Download
- [ ] **Datei-Upload** - Direkt im Chat
- [ ] **Code-Preview** - Syntax-Highlighting
- [ ] **Git-Integration** - Commits/Push direkt
- [ ] **Webhook-Support** - GitHub Actions
- [ ] **Plugins** - Erweiterbare Funktionen
- [ ] **Mobile-App** - iOS/Android

---

## 📝 Lizenz

MIT License - Siehe [LICENSE](LICENSE) Datei

---

## 👤 Autor

**cali72mero**  
GitHub: [@cali72mero](https://github.com/cali72mero)

---

## ⭐ Support

Wenn dir das Projekt gefällt:
- ⭐ **Star** auf GitHub
- 🐛 **Issues** melden
- 🔧 **Pull Requests** willkommen!

---

## 📚 Links

- [GitHub Repository](https://github.com/cali72mero/ki-agent)
- [Issues](https://github.com/cali72mero/ki-agent/issues)
- [Releases](https://github.com/cali72mero/ki-agent/releases)

---

**Version:** 0.1.0-beta  
**Letztes Update:** Februar 2026  
**Status:** 🟡 Beta - Aktiv in Entwicklung