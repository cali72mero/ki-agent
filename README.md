# 🤖 KI-Agent – Persönlicher AI-Agent

> Wie OpenClaw – nur einfacher zu installieren. Ein autonomer KI-Agent mit Web-Interface der direkt auf deinem Linux-Server läuft.

## Features

- 🌐 **Web-Interface** auf Port 8460 (aus dem Internet erreichbar)
- 🔐 **Login-Schutz** mit Benutzername + Passwort
- 🤖 **Mehrere KI-Anbieter**: OpenAI, Groq, Claude (Anthropic), OpenRouter
- 💻 **Root-Zugriff** auf den Server (Dateien erstellen, Programme installieren etc.)
- ⏰ **Deadline-Funktion**: Arbeitet z.B. bis 15:00 Uhr automatisch
- 🟢 **Live-Logs** im Browser via WebSocket
- 🔄 **Autonome Fehlerkorrektur**: Erkennt Fehler, repariert sich selbst
- 📂 **Verzeichnisauswahl**: `/var/www/html`, `/home`, `/opt`, oder alles (`/`)

## Installation (Ubuntu / Debian)

```bash
# 1. Repository clonen
git clone https://github.com/cali72mero/ki-agent.git
cd ki-agent

# 2. Installer ausführen (als Root)
sudo bash install.sh
```

Der Installer fragt dich nach:
- **Benutzername** (Standard: `admin`)
- **Passwort** (selbst wählen)
- **Port** (Standard: `8460`)

Danach ist der Agent als **systemd-Dienst** eingerichtet und startet automatisch bei jedem Server-Neustart.

## Benutzung

1. Gehe zu `http://DEINE-SERVER-IP:8460`
2. Logge dich mit deinen Zugangsdaten ein
3. Wähle deinen KI-Anbieter und gib deinen API Key ein
4. Gib das Zielverzeichnis an (z.B. `/var/www/html/meinprojekt`)
5. Schreibe deine Aufgabe: *"Erstelle eine vollständige Website mit HTML, CSS..."*
6. Setze eine Deadline (z.B. 15:00 Uhr)
7. Klicke **Agent starten** – und schau zu wie die KI arbeitet!

## API Keys bekommen

| Anbieter | Link | Kosten |
|----------|------|--------|
| Groq | https://console.groq.com | Kostenlos |
| OpenAI | https://platform.openai.com | Bezahlt |
| Claude | https://console.anthropic.com | Bezahlt |
| OpenRouter | https://openrouter.ai | Beides |

## Systemd-Befehle

```bash
sudo systemctl start ki-agent     # Starten
sudo systemctl stop ki-agent      # Stoppen
sudo systemctl restart ki-agent   # Neu starten
sudo journalctl -u ki-agent -f    # Live-Logs
```

## Firewall

```bash
# Port freigeben
sudo ufw allow 8460
```

## Projektstruktur

```
ki-agent/
├── agent.js              # Haupt-Einstiegspunkt
├── package.json          # Node.js Abhängigkeiten
├── install.sh            # Automatischer Installer
├── config.json           # Erstellt beim Install
├── src/
│   ├── server.js         # Express + WebSocket Server
│   ├── agent-loop.js     # Autonome KI-Schleife
│   ├── api-providers.js  # OpenAI, Groq, Claude, OpenRouter
│   ├── shell-executor.js # Bash-Befehlsausführung
│   └── config.js         # Konfigurationsverwaltung
└── public/
    └── index.html        # Web-Interface
```

---

Inspiriert von [OpenClaw](https://openclaw.ai) – gebaut für einfaches Self-Hosting auf Linux.
