# 🤖 KI-Agent v0.0.1 Beta

**Dein persönlicher autonomer KI-Agent für Linux-Server**

Ein vollautomatischer KI-Agent mit echtem Chat-Interface, der direkt auf deinem Linux-Server läuft und komplexe Programmier- und Verwaltungsaufgaben selbstständig erledigt. Die KI kann Bash-Befehle ausführen, Code schreiben, Fehler beheben und mit dir im Chat kommunizieren.

---

## 🌟 Was kann der KI-Agent?

Der KI-Agent ist wie ein virtueller Entwickler und Systemadministrator, der rund um die Uhr für dich arbeitet:

### 💻 Programmierung & Entwicklung
- **Webseiten erstellen**: Komplette HTML/CSS/JavaScript-Websites von Grund auf
- **Backend-Entwicklung**: APIs, Datenbanken, Server-Logik in PHP, Python, Node.js
- **Code debuggen**: Findet und behebt Fehler automatisch in bestehendem Code
- **Code refactoren**: Verbessert vorhandenen Code (Performance, Lesbarkeit, Best Practices)
- **Dokumentation schreiben**: Erstellt README-Dateien, Code-Kommentare, API-Docs
- **Git-Verwaltung**: Commits, Branches, Merge-Konflikte lösen

### 🖥️ Server-Administration
- **Services installieren**: Nginx, Apache, MySQL, PostgreSQL, Redis, etc.
- **System-Updates**: `apt update && apt upgrade` mit Fehlerbehandlung
- **Log-Analyse**: Durchsucht und analysiert Server-Logs nach Fehlern
- **Cron-Jobs einrichten**: Automatisierte Backups, Monitoring, Cleanup-Tasks
- **Firewall konfigurieren**: UFW, iptables, Fail2Ban einrichten
- **SSL/HTTPS einrichten**: Let's Encrypt Zertifikate mit Nginx/Apache
- **Performance-Optimierung**: RAM, CPU, Disk-Usage analysieren und optimieren

### 🛠️ DevOps & Automatisierung
- **Docker-Container**: Dockerfiles schreiben, Images bauen, Container orchestrieren
- **CI/CD-Pipelines**: GitHub Actions, GitLab CI konfigurieren
- **Monitoring**: Prometheus, Grafana, Uptime-Checks einrichten
- **Backup-Strategien**: Automatische Backups zu AWS S3, Hetzner Storage Box, etc.
- **Deployment-Scripts**: Automatisierte Deployments mit Zero-Downtime

### 🔒 Sicherheit & Wartung
- **Security-Audits**: Prüft dein System auf bekannte Schwachstellen
- **Dependency-Updates**: Aktualisiert npm, pip, composer Packages
- **Permission-Management**: Korrigiert falsche Datei-Rechte (chmod, chown)
- **Malware-Scan**: ClamAV Installation und automatische Scans

### 📊 Datenverarbeitung
- **Datenbank-Migration**: MySQL zu PostgreSQL, Schema-Änderungen
- **CSV/JSON-Parsing**: Verarbeitet große Datensätze, konvertiert Formate
- **Web-Scraping**: Extrahiert Daten von Websites (BeautifulSoup, Puppeteer)
- **API-Integration**: Verbindet externe APIs (Stripe, Twilio, SendGrid, etc.)

---

## ✨ Features

### 🔐 Sicherheit & Datenschutz
- **Session-basiertes Login**: Persistente Login-Sessions mit HttpOnly-Cookies
- **Verschlüsselte API-Keys**: AES-256-Verschlüsselung für gespeicherte API-Keys
- **Multi-User-Support**: Jeder Nutzer kann eigene API-Keys & Modell-Präferenzen speichern
- **Root-Warnung**: Visueller Warnhinweis bei Vollzugriff auf Server

### 💬 Chat & Kommunikation
- **Echtes Chat-Interface**: Wie ChatGPT/WhatsApp - schreibe Anweisungen im Klartext
- **Live-Feedback**: Sieh in Echtzeit, was die KI gerade macht (WebSocket-Logs)
- **Context-Upload**: Sende ganze Dateien/Ordner an die KI (spart API-Tokens)
- **Persistenter Chat-Verlauf**: Alle Konversationen werden gespeichert

### 🧠 Intelligentes Verhalten
- **Autonome Fehlerkorrektur**: Wenn ein Befehl fehlschlägt, analysiert die KI den Fehler und probiert es erneut
- **Intelligente Pause**: Stoppt API-Anfragen automatisch wenn fertig (spart Geld)
- **Deadline-System**: Setze Zeitlimits (z.B. "Arbeite bis 15:00 Uhr")
- **Kontext-Bewusstsein**: KI merkt sich vorherige Befehle und deren Ausgaben

### 🔧 Technische Features
- **9 API-Provider**: Groq, OpenAI, Claude, Gemini, Mistral, xAI, DeepSeek, Cohere, OpenRouter
- **Web-basiertes Update-System**: Ein Klick genügt für Updates
- **Persistente Datenspeicherung**: Einstellungen überleben Server-Neustarts
- **IPv4 & IPv6 Support**: Funktioniert auf modernen VPS-Hostern

---

## 📦 Installation (Ubuntu / Debian)

```bash
git clone https://github.com/cali72mero/ki-agent.git
cd ki-agent
sudo bash install.sh
```

Das Installations-Script fragt nach:
1. **Benutzername** (Standard: `admin`)
2. **Passwort** (frei wählbar)
3. **Port** (Standard: `80`)

Nach der Installation läuft der Agent als systemd-Service und startet automatisch bei Server-Neustarts.

---

## 🚀 Erste Schritte

### 1. Web-Interface öffnen
Öffne deinen Browser und gib ein:
```
http://DEINE-SERVER-IP
```
*(Falls Port 80 belegt ist, nutze `http://DEINE-IP:8460` oder einen anderen Port)*

### 2. Einloggen
Verwende die Zugangsdaten, die du beim `install.sh` eingegeben hast.

### 3. API-Key hinterlegen
1. Wähle einen **Provider** (z.B. **Groq** - kostenlos & schnell)
2. Gib deinen **API-Key** ein
3. Optional: Wähle ein **spezifisches Modell** (z.B. `gpt-4o`, `llama-3.3-70b-versatile`)
4. Klicke auf **"Einstellungen speichern"**

Dein API-Key wird verschlüsselt gespeichert und automatisch bei jedem Login geladen.

### 4. Erste Anweisung geben
Stelle dein **Arbeitsverzeichnis** ein (z.B. `/var/www/html` für Webprojekte).

Schreibe in den Chat:
```
Erstelle mir eine moderne Landing-Page mit HTML, CSS und JavaScript.
Die Seite soll ein Hero-Banner, drei Feature-Boxen und ein Kontaktformular haben.
Behebe alle Fehler und melde dich wenn du fertig bist.
```

Die KI:
1. Erstellt alle Dateien (`index.html`, `style.css`, `script.js`)
2. Testet den Code im Browser
3. Behebt automatisch auftretende Fehler
4. Meldet sich im Chat: *"✅ Ich habe die Webseite fertiggestellt. Was soll ich als Nächstes tun?"*

---

## 📋 Beispiel-Anweisungen

### Webentwicklung
```
Erstelle eine vollständige Blog-Website mit PHP und MySQL.
Die Datenbank soll Posts, Kategorien und Kommentare speichern.
Implementiere ein Admin-Panel zum Erstellen neuer Blog-Posts.
```

### Server-Verwaltung
```
Installiere Nginx als Reverse Proxy für Port 3000.
Richte SSL mit Let's Encrypt ein für die Domain example.com.
Konfiguriere automatische Zertifikat-Erneuerung.
```

### Debugging
```
Analysiere die Datei /var/log/nginx/error.log.
Finde alle 502 Bad Gateway Fehler der letzten 24 Stunden.
Behebe die Ursache und dokumentiere die Lösung.
```

### Backup & Automatisierung
```
Erstelle ein Bash-Script, das täglich um 3 Uhr nachts
alle MySQL-Datenbanken sichert und zu /backup/ hochlädt.
Richte einen Cron-Job dafür ein.
```

---

## 🔧 Verfügbare Befehle

### Installation & Setup
```bash
# System installieren
sudo bash install.sh

# System aktualisieren (Terminal)
sudo bash /opt/ki-agent/update.sh

# Passwort zurücksetzen & alle Daten löschen
sudo bash /opt/ki-agent/reset.sh

# System komplett deinstallieren
sudo bash /opt/ki-agent/uninstall.sh
```

### Service-Verwaltung
```bash
# Status prüfen
sudo systemctl status ki-agent

# Neustarten
sudo systemctl restart ki-agent

# Stoppen
sudo systemctl stop ki-agent

# Starten
sudo systemctl start ki-agent

# Logs anzeigen
journalctl -u ki-agent -f
```

### Manuelle Updates (falls Web-Interface nicht funktioniert)
```bash
cd /opt/ki-agent
git pull
sudo systemctl restart ki-agent
```

---

## 💾 Daten-Persistenz

Alle wichtigen Daten werden im `/opt/ki-agent/data/` Ordner gespeichert:

| Datei | Inhalt | Wird bei Updates gelöscht? |
|-------|--------|---------------------------|
| `config.json` | Benutzername, Passwort, Port | ❌ Nein |
| `data/sessions.json` | Aktive Login-Sessions | ❌ Nein |
| `data/user-settings.json` | API-Keys (verschlüsselt), Modell-Präferenzen | ❌ Nein |
| `data/chat-history.json` | Kompletter Chat-Verlauf | ❌ Nein |

Der `/opt/ki-agent/data/` Ordner ist in `.gitignore` und wird niemals durch `git pull` überschrieben!

---

## 🛡️ Sicherheitshinweise

### ⚠️ Root-Zugriff
Wenn du das Arbeitsverzeichnis auf `/` setzt, erhält die KI **vollen Root-Zugriff** auf deinen Server. Sie kann dann:
- System-Updates durchführen
- Services installieren/deinstallieren
- Den Server neu starten oder herunterfahren
- Beliebige Dateien löschen oder ändern

**Empfehlung**: Beschränke das Arbeitsverzeichnis auf `/var/www/html` oder `/home/dein-projekt`.

### 🔐 API-Key-Sicherheit
- API-Keys werden mit AES-256-CBC verschlüsselt
- Encryption-Key basiert auf deinem Server-Passwort
- Keys werden nie im Klartext in Logs/Dateien gespeichert
- Bei Passwort-Reset werden alle verschlüsselten Daten gelöscht

### 🌐 Kein SSL/HTTPS
Das System läuft standardmäßig auf **unverschlüsseltem HTTP**. Für Produktionsumgebungen:
1. Installiere **Nginx** als Reverse Proxy
2. Hole ein **Let's Encrypt SSL-Zertifikat**
3. Leite HTTPS-Traffic zu `http://localhost:80` weiter

Anleitung: [Nginx Reverse Proxy mit SSL](https://www.digitalocean.com/community/tutorials/how-to-secure-nginx-with-let-s-encrypt-on-ubuntu-22-04)

---

## 🐛 Bekannte Einschränkungen (v0.0.1 Beta)

- ❌ **Kein natives SSL/HTTPS**: Nutze Nginx/Apache als Reverse Proxy
- ⚠️ **IPv6-Priorität**: Manche günstige VPS-Hoster (z.B. 24fire) haben fehlerhafte IPv4-Routing-Konfiguration. Dann ist der Server nur via IPv6 erreichbar: `http://[2a12:de40:21:4143::]`
- 🔄 **Sessions überleben keinen RAM-Verlust**: Bei Server-Absturz (nicht bei normalem Neustart) gehen aktive Sessions verloren
- 📝 **Große Dateien**: Context-Upload ist auf ~15KB pro Datei begrenzt (API-Token-Limit)

---

## 🆘 Hilfe & Problemlösung

### Login funktioniert nicht
```bash
# Logs prüfen
journalctl -u ki-agent -n 50

# Service neu starten
sudo systemctl restart ki-agent

# Passwort zurücksetzen
sudo bash /opt/ki-agent/reset.sh
```

### Webseite lädt nicht ("lädt sich tot")
**Ursache**: Firewall blockiert den Port.

**Lösung 1** (Software-Firewall):
```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
```

**Lösung 2** (Hoster-Firewall):
Logge dich in das Kunden-Dashboard deines VPS-Anbieters ein und öffne Port 80 in der Firewall/Security Group.

**Lösung 3** (IPv6 nutzen):
```bash
# IPv6-Adresse herausfinden
ip -6 addr | grep inet6 | grep -v fe80 | grep -v ::1

# Im Browser öffnen (Achtung: eckige Klammern!)
http://[DEINE-IPV6-ADRESSE]
```

### KI macht Fehler / arbeitet nicht korrekt
- **Andere API-Provider testen**: Groq, Claude, Gemini haben unterschiedliche Stärken
- **Spezifischeres Modell wählen**: `gpt-4o` statt Auto-Auswahl
- **Kleinere Aufgaben**: Statt "Erstelle eine komplette App" → "Erstelle erst die Login-Seite"

---

## 🤝 Support & Community

- **GitHub Issues**: [github.com/cali72mero/ki-agent/issues](https://github.com/cali72mero/ki-agent/issues)
- **Dokumentation**: Diese README-Datei

---

## 📜 Lizenz

MIT License - Du darfst das Projekt frei nutzen, modifizieren und weitergeben.

---

**Gebaut für einfaches Self-Hosting auf Linux-Servern.**  
*Version 0.0.1 Beta - Made with ❤️ by cali72mero*