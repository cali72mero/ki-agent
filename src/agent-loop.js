// Fix: Agent schreibt Code in Dateien (nicht im Chat zeigen!)
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
            content: `Du bist ein vollautomatischer Coding-Agent wie OpenClaw/Cursor.

ARBEITSVERZEICHNIS: ${directory}
WEBSEITEN-ORDNER: ${webDirectory}

WICHTIGE REGEL:
- Schreibe Code IMMER mit <write_file> in Dateien
- Zeige NIEMALS Code im Chat
- Im Chat nur kurze Zusammenfassung: "Datei erstellt: index.html"

TOOLS:
<write_file path="...">KOMPLETTER CODE HIER</write_file>
<read_file path="..."/>
<bash>command</bash>

BEISPIELE:

❌ FALSCH (Code im Chat zeigen):
User: "Erstelle index.html"
Du: "Hier ist der Code:
\`\`\`html
<!DOCTYPE html>...
\`\`\`"

✅ RICHTIG (Code in Datei schreiben):
User: "Erstelle index.html"
Du: <write_file path="${webDirectory === '/var/www/html' ? '/var/www/html/index.html' : 'index.html'}"><!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Meine Webseite</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: white;
        }
        .container {
            text-align: center;
            padding: 40px;
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        h1 { font-size: 3rem; margin-bottom: 20px; }
        p { font-size: 1.2rem; opacity: 0.9; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Willkommen!</h1>
        <p>Das ist meine moderne Webseite.</p>
    </div>
</body>
</html></write_file>
✅ Fertig! Datei erstellt: index.html

BEISPIEL 2 - Mehrere Dateien:
User: "Erstelle eine Webseite mit index.html und style.css"
Du: <write_file path="${webDirectory === '/var/www/html' ? '/var/www/html/index.html' : 'index.html'}"><!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <h1>Hallo Welt</h1>
</body>
</html></write_file>
<write_file path="${webDirectory === '/var/www/html' ? '/var/www/html/style.css' : 'style.css'}">body {
    font-family: Arial;
    background: #1a1a1a;
    color: white;
    padding: 50px;
}
h1 {
    color: #00d4ff;
}</write_file>
✅ Fertig! Dateien erstellt: index.html, style.css

SPEICHERORTE:
- .html/.css/.js/.php → ${webDirectory}
- .py/.sh → ${directory === '/' ? '/root/' : directory}
- Bei explizitem Pfad → nutze diesen

REGELN:
1. Schreibe IMMER vollständigen, funktionierenden Code
2. NIEMALS Code im Chat zeigen (nur Dateinamen)
3. Nutze moderne, schöne Designs
4. Nach Dateien erstellen: "✅ Fertig! Dateien: ..."
5. Bei Fehlern: Korrigiere automatisch`
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
        logCallback(`⚠️ Limit erreicht`);
        return;
    }

    try {
        logCallback(`⚒️ Schritt ${session.stepCount}`);
        
        const response = await callLLM(
            config.provider,
            config.apiKey,
            conversationHistory,
            config.model
        );

        conversationHistory.push({ role: 'assistant', content: response });
        
        // Entferne Code-Blöcke aus Chat-Anzeige (nur Zusammenfassung zeigen)
        let chatMessage = response;
        
        // Entferne <write_file> Tags aus Chat-Anzeige
        chatMessage = chatMessage.replace(/<write_file[^>]*>[\s\S]*?<\/write_file>/g, '');
        // Entferne <bash> Tags aus Chat-Anzeige
        chatMessage = chatMessage.replace(/<bash>[\s\S]*?<\/bash>/g, '');
        // Entferne <read_file> Tags
        chatMessage = chatMessage.replace(/<read_file[^>]*\/>/g, '');
        // Entferne Code-Blöcke
        chatMessage = chatMessage.replace(/```[\s\S]*?```/g, '');
        
        chatMessage = chatMessage.trim();
        if (chatMessage) {
            chatCallback('ai', chatMessage);
        }

        const isDone = response.includes('✅') || 
                       response.toLowerCase().includes('fertig') ||
                       response.toLowerCase().includes('abgeschlossen');
        
        if (isDone) {
            session.isPaused = true;
            logCallback(`✅ Fertig!`);
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
                logCallback(`✅ ${output.substring(0, 200)}`);
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
                    logCallback(`📁 Verzeichnis: ${dir}`);
                }
                
                fs.writeFileSync(filePath, fileContent, 'utf8');
                logCallback(`✅ Erstellt: ${path.basename(filePath)}`);
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
            
            logCallback(`📄 Lese: ${filePath}`);
            
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                conversationHistory.push({ role: 'user', content: `Inhalt von ${filePath}:\n${content.substring(0, 2000)}` });
            } catch(err) {
                logCallback(`❌ ${err.message}`);
                conversationHistory.push({ role: 'user', content: `Fehler: ${err.message}` });
            }
        }

        if (!hasActions && !isDone) {
            session.emptyResponseCount++;
            logCallback(`⚠️ Keine Aktion (${session.emptyResponseCount}/3)`);
            
            if (session.emptyResponseCount >= 3) {
                session.isPaused = true;
                logCallback(`⏸ Pausiert`);
                chatCallback('ai', '⏸ Bitte klarere Anweisung geben.');
                return;
            }
        } else {
            session.emptyResponseCount = 0;
        }

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

    session.logCallback(`▶️ Neue Nachricht`);
    
    const fullMessage = contextData ? `${contextData}\n\n${userMessage}` : userMessage;
    session.conversationHistory.push({ role: 'user', content: fullMessage });
    
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