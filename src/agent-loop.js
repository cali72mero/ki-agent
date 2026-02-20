// Fix: Alle kritischen Bugs behoben
const { callLLM } = require('./api-providers');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const activeSessions = new Map();

function runAgent(sessionId, config, logCallback, chatCallback) {
    const { provider, apiKey, model, directory, initialPrompt, initialContextData } = config;
    
    let webDirectory = directory;
    if (directory === '/') {
        webDirectory = '/var/www/html';
    }
    
    const conversationHistory = [
        {
            role: 'system',
            content: `Du bist ein vollautomatischer Programmier-Agent.

ARBEITSVERZEICHNIS: ${directory}
WEBSEITEN-ORDNER: ${webDirectory}

DEINE AUFGABE:
- Führe Aufgaben SOFORT und VOLLSTÄNDIG aus
- Schreibe echten Code in Dateien
- Führe Bash-Befehle aus wenn nötig
- KEINE FRAGEN STELLEN - mach es einfach!
- Wenn fertig: Schreibe "✅ Fertig!" und STOPPE

SPEICHERORTE:
- HTML/CSS/JS/PHP → ${webDirectory}
- Python/Scripts → ${directory === '/' ? '/root/' : directory}
- Bei explizitem Pfad → nutze diesen

TOOLS:
<bash>command</bash> - Führt Befehl aus
<write_file path="...">content</write_file> - Erstellt Datei
<read_file path="..."/> - Liest Datei

BEISPIELE:

User: "Erstelle eine Webseite über Anime"
Du: <write_file path="${webDirectory === '/var/www/html' ? '/var/www/html/' : ''}anime.html"><!DOCTYPE html>
<html>
<head>
    <title>Anime</title>
    <style>
        body { font-family: Arial; background: #1a1a1a; color: #fff; }
        .container { max-width: 800px; margin: 50px auto; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Meine Lieblings-Anime</h1>
        <p>Hier findest du die besten Anime aller Zeiten!</p>
    </div>
</body>
</html></write_file>
✅ Fertig! Webseite wurde erstellt.

User: "Erstelle 3 HTML-Seiten über Naruto, One Piece und Dragon Ball"
Du: <write_file path="${webDirectory === '/var/www/html' ? '/var/www/html/' : ''}naruto.html"><!DOCTYPE html>...</write_file>
<write_file path="${webDirectory === '/var/www/html' ? '/var/www/html/' : ''}onepiece.html"><!DOCTYPE html>...</write_file>
<write_file path="${webDirectory === '/var/www/html' ? '/var/www/html/' : ''}dragonball.html"><!DOCTYPE html>...</write_file>
✅ Fertig! Alle 3 Seiten wurden erstellt.

REGELN:
1. KEINE Fragen stellen - mach es einfach!
2. Schreibe KOMPLETTEN Code (nicht nur "...") 
3. Nach "✅" STOPPT die Loop automatisch
4. Bei Fehlern: Korrigiere und versuche erneut`
        },
        { role: 'user', content: initialContextData + '\n\n' + initialPrompt }
    ];

    const session = {
        config,
        conversationHistory,
        isPaused: false,
        logCallback,
        chatCallback,
        stepCount: 0,
        maxSteps: 30,
        webDirectory,
        emptyResponseCount: 0
    };

    activeSessions.set(sessionId, session);
    logCallback(`🚀 Agent gestartet im Verzeichnis: ${directory}`);
    if (directory === '/') {
        logCallback(`🌐 Webseiten werden in ${webDirectory} gespeichert`);
    }
    
    agentLoop(sessionId);
}

async function agentLoop(sessionId) {
    const session = activeSessions.get(sessionId);
    if (!session || session.isPaused) return;

    const { config, conversationHistory, logCallback, chatCallback } = session;
    session.stepCount++;

    if (session.stepCount > session.maxSteps) {
        session.isPaused = true;
        chatCallback('ai', `⚠️ Limit von ${session.maxSteps} Schritten erreicht. Bitte neue Anweisung geben.`);
        logCallback(`⚠️ Limit erreicht, Agent pausiert`);
        return;
    }

    try {
        logCallback(`⚒️ Schritt ${session.stepCount}: Arbeite...`);
        
        const response = await callLLM(
            config.provider,
            config.apiKey,
            conversationHistory,
            config.model
        );

        conversationHistory.push({ role: 'assistant', content: response });
        
        // WICHTIG: Nachricht NUR EINMAL an Chat senden
        chatCallback('ai', response);

        // Prüfe ob Agent fertig ist
        const isDone = response.includes('✅') || 
                       response.toLowerCase().includes('fertig') ||
                       response.toLowerCase().includes('abgeschlossen');
        
        if (isDone) {
            session.isPaused = true;
            logCallback(`✅ Aufgabe erledigt! Agent pausiert.`);
            return;
        }

        let hasActions = false;

        // Führe Bash-Befehle aus
        const bashMatches = [...response.matchAll(/<bash>([\s\S]*?)<\/bash>/g)];
        for (const match of bashMatches) {
            hasActions = true;
            const command = match[1].trim();
            logCallback(`💻 ${command}`);
            
            try {
                const output = await execPromise(command, config.directory);
                logCallback(`✅ ${output.substring(0, 300)}`);
                conversationHistory.push({ role: 'user', content: `Output:\n${output}` });
            } catch(err) {
                logCallback(`❌ ${err.message}`);
                conversationHistory.push({ role: 'user', content: `Fehler:\n${err.message}` });
            }
        }

        // Schreibe Dateien
        const writeMatches = [...response.matchAll(/<write_file path="([^"]+)">([\s\S]*?)<\/write_file>/g)];
        for (const match of writeMatches) {
            hasActions = true;
            let filePath = match[1];
            const fileContent = match[2].trim();
            
            if (!filePath.startsWith('/')) {
                if (config.directory === '/') {
                    const ext = path.extname(filePath).toLowerCase();
                    if (['.html', '.css', '.js', '.php'].includes(ext)) {
                        filePath = path.join(session.webDirectory, filePath);
                    } else {
                        filePath = path.join('/root', filePath);
                    }
                } else {
                    filePath = path.join(config.directory, filePath);
                }
            }
            
            logCallback(`💾 ${filePath}`);
            
            try {
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                
                fs.writeFileSync(filePath, fileContent, 'utf8');
                logCallback(`✅ Datei erstellt`);
                conversationHistory.push({ role: 'user', content: `${filePath} wurde erstellt` });
            } catch(err) {
                logCallback(`❌ ${err.message}`);
                conversationHistory.push({ role: 'user', content: `Fehler bei ${filePath}: ${err.message}` });
            }
        }

        // Lese Dateien
        const readMatches = [...response.matchAll(/<read_file path="([^"]+)"\s*\/>/g)];
        for (const match of readMatches) {
            hasActions = true;
            let filePath = match[1];
            
            if (!filePath.startsWith('/')) {
                filePath = path.join(config.directory, filePath);
            }
            
            logCallback(`📄 ${filePath}`);
            
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                conversationHistory.push({ role: 'user', content: `Inhalt von ${filePath}:\n${content.substring(0, 2000)}` });
            } catch(err) {
                logCallback(`❌ ${err.message}`);
                conversationHistory.push({ role: 'user', content: `Fehler: ${err.message}` });
            }
        }

        // Wenn keine Actions und auch kein "✅", zähle leere Antworten
        if (!hasActions && !isDone) {
            session.emptyResponseCount++;
            logCallback(`⚠️ Keine Aktion ausgeführt (${session.emptyResponseCount}/3)`);
            
            if (session.emptyResponseCount >= 3) {
                session.isPaused = true;
                logCallback(`⏸ Agent pausiert (3x keine Aktion)`);
                chatCallback('ai', '⏸ Ich weiß nicht was ich tun soll. Bitte gib mir eine klarere Anweisung.');
                return;
            }
        } else {
            session.emptyResponseCount = 0;
        }

        // Weiter arbeiten nach 2 Sekunden
        setTimeout(() => agentLoop(sessionId), 2000);
        
    } catch(err) {
        logCallback(`❌ API-Fehler: ${err.message}`);
        session.isPaused = true;
        chatCallback('ai', `❌ Fehler: ${err.message}`);
    }
}

function sendChatMessage(sessionId, userMessage, contextData) {
    const session = activeSessions.get(sessionId);
    if (!session) return false;

    session.logCallback(`▶️ Neue Nachricht empfangen`);
    
    const fullMessage = contextData ? `${contextData}\n\n${userMessage}` : userMessage;
    session.conversationHistory.push({ role: 'user', content: fullMessage });
    
    // Reset
    session.isPaused = false;
    session.emptyResponseCount = 0;
    session.stepCount = 0;
    
    agentLoop(sessionId);
    return true;
}

function stopAgent(sessionId) {
    const session = activeSessions.get(sessionId);
    if (session) {
        session.isPaused = true;
        session.logCallback(`⏹ Gestoppt`);
    }
    activeSessions.delete(sessionId);
}

function execPromise(command, cwd) {
    return new Promise((resolve, reject) => {
        exec(command, { cwd, timeout: 30000 }, (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message));
            resolve(stdout || stderr);
        });
    });
}

module.exports = { runAgent, sendChatMessage, stopAgent };