# 🤖 KI-Agent v0.0.1 Beta

Ein autonomer KI-Agent mit echtem Chat-Interface, der direkt auf deinem Linux-Server läuft und Aufgaben selbstständig erledigt.

## Features
- 💬 **Chat-Interface**: Kommuniziere mit der KI wie in einem Messenger
- 🔐 **Verschlüsselte API-Key-Speicherung**: API Keys werden AES-256-verschlüsselt gespeichert
- ⏸️ **Intelligente Pause**: KI stoppt API-Anfragen wenn fertig
- 📁 **Kontext-Upload**: Sende Dateien/Ordner direkt an die KI
- 💾 **Persistenter Chat-Verlauf**: Überlebt Updates und Neustarts
- ⚠️ **Root-Warnung**: Warnhinweis bei vollem Server-Zugriff
- 🔄 **Integrierter Updater**: Per Knopfdruck updaten
- 👥 **Multi-User-Support**: Jeder Nutzer kann eigene API Keys & Modelle speichern

## Installation (Ubuntu / Debian)

```bash
git clone https://github.com/cali72mero/ki-agent.git
cd ki-agent
sudo bash install.sh
```

**Standard-Port:** 80 (HTTP)

## Update & Verwaltung

### 🔄 Updates installieren

**Web-Interface (Empfohlen):**
Klicke unten links auf **"System updaten"**.

**Terminal:**
```bash
sudo bash /opt/ki-agent/update.sh
```

### 🔄 Passwort zurücksetzen & Daten löschen

Wenn du dein Passwort vergessen hast oder das System komplett zurücksetzen möchtest:

```bash
sudo bash /opt/ki-agent/reset.sh
```

**WARNUNG:** Dies löscht:
- Benutzername & Passwort
- Alle gespeicherten API Keys
- Kompletten Chat-Verlauf
- Alle Sessions
- Domain-Einstellungen

Danach musst du das System neu einrichten (neues Passwort setzen).

### 🗑️ System restlos löschen (Uninstall)

```bash
sudo bash /opt/ki-agent/uninstall.sh
```

Entfernt das Programm komplett vom Server.

## Benutzung

1. Öffne `http://DEINE-IP` im Browser
2. Logge dich mit deinen Zugangsdaten ein
3. Wähle einen Provider (z.B. **Groq** - kostenlos)
4. Gib deinen API Key ein
5. Optional: Wähle ein spezifisches Modell (z.B. `gpt-4o`)
6. Klicke auf **"Einstellungen speichern"**
7. Stelle dein Arbeitsverzeichnis ein (z.B. `/var/www/html`)
8. Schreibe in den Chat: *"Erstelle mir eine Webseite"*

## Daten-Persistenz

Alle wichtigen Daten werden im `/opt/ki-agent/data/` Ordner gespeichert:
- `sessions.json` - Aktive Login-Sessions
- `user-settings.json` - API Keys (verschlüsselt) & Modell-Präferenzen
- `chat-history.json` - Chat-Verlauf
- `config.json` (im Hauptordner) - Benutzername, Passwort, Port

Diese Dateien werden bei Updates **NICHT** gelöscht!

## Bekannte Einschränkungen (v0.0.1 Beta)

- ⚠️ **Keine SSL/HTTPS-Unterstützung**: Nur HTTP. Für Produktionsumgebungen Reverse Proxy (Nginx + Let's Encrypt) verwenden.
- **IPv6 bevorzugt**: Manche VPS-Anbieter haben fehlerhafte IPv4-Konfiguration. Dann nur via IPv6 erreichbar: `http://[deine-ipv6]`

---

Gebaut für einfaches Self-Hosting auf Linux-Servern. Version 0.0.1 Beta.