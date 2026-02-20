# \ud83e\udd16 KI-Agent v0.0.1 Beta

Ein autonomer KI-Agent mit echtem Chat-Interface, der direkt auf deinem Linux-Server l\u00e4uft und Aufgaben selbstst\u00e4ndig erledigt. Er kann programmieren, Fehler beheben und auf R\u00fcckfragen im Chat reagieren.

## Features
- \ud83d\udcac **Echtes Chat-Interface**: Kommuniziere mit der KI wie in einem Messenger. Gib ihr w\u00e4hrend der Arbeit neue Anweisungen.
- \u23f8\ufe0f **Intelligente Pause**: Wenn die KI fertig ist, stoppt sie API-Anfragen komplett und spart dir Geld.
- \ud83d\udcc1 **Dateien direkt senden (Context)**: W\u00e4hle Ordner oder Dateien aus, die der Server direkt einliest und an die API schickt.
- \u26a0\ufe0f **Root-Warnung**: Ein Warnhinweis, falls du der KI Vollzugriff (`/`) auf den Server gibst.
- \ud83d\udd04 **Integrierter Updater**: Lade neue Updates direkt per Knopfdruck \u00fcber das Web-Interface herunter.

## Installation (Ubuntu / Debian)

```bash
git clone https://github.com/cali72mero/ki-agent.git
cd ki-agent
sudo bash install.sh
```

**Standard-Port:** 80 (HTTP)  
**Empfehlung:** Nutze Port 80, da viele VPS-Anbieter nur Standard-Ports (80, 443, 22) durchlassen.

## Update & Deinstallation

### \ud83d\udd04 Updates installieren
Du kannst das System jederzeit updaten. Deine Konfigurationen (Passw\u00f6rter, Ports, Chat-Verlauf) bleiben unangetastet!

**M\u00f6glichkeit 1 (Empfohlen):**
Klicke im Web-Interface unten links auf den Button **\"System auf Updates pr\u00fcfen\"**.

**M\u00f6glichkeit 2 (Terminal):**
```bash
sudo bash /opt/ki-agent/update.sh
```

### \ud83d\uddd1\ufe0f System restlos l\u00f6schen (Uninstall)
Wenn du den Agenten und alle dazugeh\u00f6rigen Dateien l\u00f6schen m\u00f6chtest:
```bash
sudo bash /opt/ki-agent/uninstall.sh
```

## Benutzung
1. \u00d6ffne `http://DEINE-IP` (oder `http://DEINE-IP:80`)
2. W\u00e4hle **Groq** (Kostenlos & schnell) oder **OpenAI**.
3. Stelle dein Arbeitsverzeichnis ein (z.B. `/var/www/html`).
4. Schreibe in den Chat: *\"Erstelle mir eine Webseite. Behebe alle Fehler. Wenn du fertig bist, melde dich.\"*

## Bekannte Bugs & Einschr\u00e4nkungen (v0.0.1 Beta)

- **\u26a0\ufe0f Keine SSL/HTTPS-Unterst\u00fctzung**: Das System l\u00e4uft derzeit nur auf unverschl\u00fcsseltem HTTP. F\u00fcr Produktionsumgebungen wird dringend empfohlen, einen Reverse Proxy (z.B. Nginx mit Let's Encrypt) vorzuschalten.
- **IPv6 bevorzugt bei manchen Hostern**: Einige g\u00fcnstige VPS-Anbieter haben fehlerhafte IPv4-Routing-Konfigurationen. In diesem Fall ist der Server nur \u00fcber IPv6 erreichbar: `http://[deine-ipv6-adresse]`
- **API Keys werden nicht persistent gespeichert**: Du musst deinen API Key bei jedem Browser-Neustart erneut eingeben (absichtlich aus Sicherheitsgr\u00fcnden).

---

Gebaut f\u00fcr einfaches Self-Hosting auf Linux-Servern. Version 0.0.1 Beta.