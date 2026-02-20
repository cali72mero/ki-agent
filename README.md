# 🤖 KI-Agent – Dein persönlicher Server-Agent

Ein autonomer KI-Agent mit echtem Chat-Interface, der direkt auf deinem Linux-Server läuft und Aufgaben selbstständig erledigt. Er kann programmieren, Fehler beheben und auf Rückfragen im Chat reagieren.

## Neue Features in dieser Version
- 💬 **Echtes Chat-Interface**: Kommuniziere mit der KI wie in einem Messenger. Gib ihr während der Arbeit neue Anweisungen.
- ⏸️ **Intelligente Pause**: Wenn die KI fertig ist (z.B. "Ich habe alle Fehler behoben"), stoppt sie API-Anfragen komplett und spart dir Geld. Sie wartet dann auf deine nächste Chat-Nachricht.
- 📁 **Dateien direkt senden (Context)**: Wähle Ordner oder Dateien aus, die der Server direkt einliest und an die API schickt. So sparst du Tokens, weil die KI den Code nicht erst mit Bash-Befehlen auslesen muss.
- ⚠️ **Root-Warnung**: Ein integrierter Warnhinweis, falls du der KI Vollzugriff (`/`) auf den Server gibst (sie kann dann wie ein Root-Nutzer *alles* machen, inkl. Neustart oder Löschen).
- 🌐 **Web-Interface** auf Port 8460 (aus dem Internet erreichbar)

## Installation (Ubuntu / Debian)

```bash
git clone https://github.com/cali72mero/ki-agent.git
cd ki-agent
sudo bash install.sh
```

## Benutzung
1. Öffne `http://DEINE-IP:8460`
2. Wähle z.B. **Groq** (Kostenlos) oder **OpenAI**.
3. Stelle dein Arbeitsverzeichnis ein (z.B. `/var/www/html`).
4. Schreibe in den Chat: *"Erstelle mir eine Webseite. Behebe alle Fehler. Wenn du fertig bist, melde dich und warte auf Antwort."*
5. Beobachte, wie die KI den Code schreibt, Fehler analysiert und repariert. Wenn sie fertig ist, fragt sie dich im Chat nach der nächsten Aufgabe!

---
Gebaut für einfaches Self-Hosting auf Linux-Servern.