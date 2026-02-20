// MEGA-FIX: Wie OpenClaw - Bash statt XML-Tags!
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
            content: `Du bist ein automatischer Coding-Agent wie OpenClaw/Cursor.

ARBEITSVERZEICHNIS: ${directory}
WEBSEITEN-ORDNER: ${webDirectory}

WIE DU DATEIEN ERSTELLST:
Nutze BASH-BEFEHLE um Dateien zu erstellen (NICHT komplizierte Tags!):

BEISPIEL - Python Flask App erstellen:
<bash>cat > /root/app.py << 'EOF'
from flask import Flask
app = Flask(__name__)

@app.route('/')
def home():
    return "Hallo!"

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8056)
EOF
</bash>

BEISPIEL - HTML Webseite erstellen:
<bash>cat > ${webDirectory}/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Webseite</title>
    <style>
        body { 
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            font-family: Arial;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
        }
    </style>
</head>
<body>
    <h1>Willkommen!</h1>
</body>
</html>
EOF
</bash>

BEISPIEL - Mehrere Dateien:
<bash>cat > ${webDirectory}/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <h1>Hallo</h1>
</body>
</html>
EOF
</bash>
<bash>cat > ${webDirectory}/style.css << 'EOF'
body {
    background: #1a1a1a;
    color: white;
    font-family: Arial;
}
EOF
</bash>

REGELN:
1. Nutze <bash>cat > /pfad << 'EOF' ... EOF</bash> für Dateien
2. Python-Dateien: /root/datei.py
3. HTML/CSS/JS: ${webDirectory}/datei.html
4. Im Chat KEINE Code-Blöcke zeigen (nur "Dateien erstellt")
5. Schreibe vollständigen, funktionierenden Code
6. Nach Dateien erstellen: "✅ Fertig! Dateien: datei1.py, datei2.html"

WICHTIG:
- IMMER <bash> Tags nutzen
- Kompletten Code schreiben (nicht "...")
- Moderne Designs mit CSS`
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
        emptyResponseCount: 0,
        filesCreatedThisRound: 0
    };

    activeSessions.set(sessionId, session);
    logCallback(`🚀 Start: ${directory}`);
    
    agentLoop(sessionId);
}

async function agentLoop(sessionId) {
    const session = activeSessions.get(sessionId);
    if (!session || session.isPaused) return;

    const { config, conversationHistory, logCallback, chatCallback } = session;
    session.stepCount++;
    session.filesCreatedThisRound = 0;

    if (session.stepCount > session.maxSteps) {
        session.isPaused = true;
        chatCallback('ai', `⚠️ Limit erreicht`);
        logCallback(`⚠️ Limit`);
        return;
    }

    try {
        logCallback(`⚒️ Step ${session.stepCount}`);
        
        const response = await callLLM(
            config.provider,
            config.apiKey,
            conversationHistory,
            config.model
        );

        conversationHistory.push({ role: 'assistant', content: response });
        
        // Entferne <bash> Tags aus Chat-Anzeige
        let chatMessage = response;
        chatMessage = chatMessage.replace(/<bash>[\s\S]*?<\/bash>/g, '');
        chatMessage = chatMessage.replace(/```[\s\S]*?```/g, '');
        
        chatMessage = chatMessage.trim();
        if (chatMessage) {
            chatCallback('ai', chatMessage);
        }

        const isDone = response.includes('✅') || 
                       response.toLowerCase().includes('fertig') ||
                       response.toLowerCase().includes('abgeschlossen');

        let hasActions = false;

        // Führe ALLE Bash-Befehle aus
        const bashMatches = [...response.matchAll(/<bash>([\s\S]*?)<\/bash>/g)];
        for (const match of bashMatches) {
            hasActions = true;
            const command = match[1].trim();
            
            // Prüfe ob es ein cat > Befehl ist (Datei wird erstellt)
            const isFileCreation = command.includes('cat >') || command.includes('cat>');
            
            if (isFileCreation) {
                // Extrahiere Dateiname aus "cat > /pfad/datei.py"
                const fileMatch = command.match(/cat\s*>\s*([^\s<]+)/);
                if (fileMatch) {
                    logCallback(`💾 ${fileMatch[1]}`);
                }
            } else {
                logCallback(`💻 ${command.substring(0, 50)}...`);
            }
            
            try {
                const output = await execPromise(command, config.directory);
                
                if (isFileCreation) {
                    session.filesCreatedThisRound++;
                    const fileMatch = command.match(/cat\s*>\s*([^\s<]+)/);
                    if (fileMatch) {
                        const fileName = path.basename(fileMatch[1]);
                        logCallback(`✅ ${fileName}`);
                    }
                } else {
                    logCallback(`✅ ${output.substring(0, 150)}`);
                }
                
                conversationHistory.push({ role: 'user', content: `Befehl ausgeführt. Output: ${output.substring(0, 500)}` });
            } catch(err) {
                logCallback(`❌ ${err.message}`);
                conversationHistory.push({ role: 'user', content: `FEHLER: ${err.message}` });
            }
        }

        // AUTO-KORREKTUR: Wenn "Fertig" aber keine Befehle/Dateien
        if (isDone && !hasActions) {
            
            // Verhindere Endlosschleife - max 2 Korrekturversuche
            if (!session.correctionAttempts) session.correctionAttempts = 0;
            session.correctionAttempts++;
            
            if (session.correctionAttempts > 2) {
                session.isPaused = true;
                logCallback(`❌ Abgebrochen - Agent versteht Aufgabe nicht`);
                chatCallback('ai', '❌ Fehler: Kann keine Dateien erstellen. Bitte anderes Model nutzen (z.B. llama-3.3-70b-versatile bei Groq).');
                return;
            }
            
            session.isPaused = false;
            conversationHistory.push({ 
                role: 'user', 
                content: `❌ DU HAST KEINE DATEIEN ERSTELLT!

Nutze Bash-Befehle:
<bash>cat > /root/datei.py << 'EOF'
CODE HIER
EOF
</bash>

Versuche es JETZT NOCHMAL mit <bash> Tags!` 
            });
            logCallback(`⚠️ Korrektur ${session.correctionAttempts}/2`);
            chatCallback('ai', '⚠️ Korrigiere...');
            setTimeout(() => agentLoop(sessionId), 1000);
            return;
        }
        
        // Reset correction counter bei Erfolg
        if (hasActions) {
            session.correctionAttempts = 0;
        }
        
        // Normale Fertigstellung
        if (isDone) {
            session.isPaused = true;
            logCallback(`✅ Fertig`);
            return;
        }

        if (!hasActions && !isDone) {
            session.emptyResponseCount++;
            logCallback(`⚠️ Keine Aktion (${session.emptyResponseCount}/3)`);
            
            if (session.emptyResponseCount >= 3) {
                session.isPaused = true;
                logCallback(`⏸ Pausiert`);
                chatCallback('ai', '⏸ Klarere Anweisung nötig');
                return;
            }
        } else {
            session.emptyResponseCount = 0;
        }

        setTimeout(() => agentLoop(sessionId), 2000);
        
    } catch(err) {
        logCallback(`❌ ${err.message}`);
        session.isPaused = true;
        chatCallback('ai', `❌ ${err.message}`);
    }
}

function sendChatMessage(sessionId, userMessage, contextData) {
    const session = activeSessions.get(sessionId);
    if (!session) return false;

    session.logCallback(`▶️ Nachricht`);
    
    const fullMessage = contextData ? `${contextData}\n\n${userMessage}` : userMessage;
    session.conversationHistory.push({ role: 'user', content: fullMessage });
    
    session.isPaused = false;
    session.emptyResponseCount = 0;
    session.stepCount = 0;
    session.correctionAttempts = 0;
    
    agentLoop(sessionId);
    return true;
}

function stopAgent(sessionId) {
    const session = activeSessions.get(sessionId);
    if (session) {
        session.isPaused = true;
        session.logCallback(`⏹ Stop`);
    }
    activeSessions.delete(sessionId);
}

function execPromise(command, cwd) {
    return new Promise((resolve, reject) => {
        exec(command, { cwd, shell: '/bin/bash', timeout: 30000 }, (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message));
            resolve(stdout || stderr || 'OK');
        });
    });
}

module.exports = { runAgent, sendChatMessage, stopAgent };