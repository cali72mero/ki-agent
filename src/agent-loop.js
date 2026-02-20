// Fix: Agent MUSS write_file Tags nutzen - strengerer System-Prompt
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
            content: `Du bist ein Coding-Agent der wie OpenClaw/Cursor funktioniert.

ARBEITSVERZEICHNIS: ${directory}
WEBSEITEN-ORDNER: ${webDirectory}

⚠️ KRITISCHE REGEL:
Du MUSST IMMER die <write_file> Tags nutzen um Dateien zu erstellen!
NIEMALS nur sagen "Datei erstellt" ohne das <write_file> Tag zu verwenden!

FALSCH ❌:
"Ich erstelle jetzt die Datei maintenance.py"
✅ Fertig! Datei erstellt: maintenance.py

RICHTIG ✅:
<write_file path="/root/maintenance.py">import flask
app = flask.Flask(__name__)

@app.route('/')
def home():
    return "Wartung!"

if __name__ == '__main__':
    app.run()</write_file>
✅ Fertig! Datei erstellt: maintenance.py

TOOLS DIE DU NUTZEN MUSST:
<write_file path="VOLLER_PFAD">KOMPLETTER CODE</write_file>
<read_file path="PFAD"/>
<bash>command</bash>

BEISPIEL 1 - Flask App erstellen:
User: "Erstelle Flask App mit Wartungsseite in /root"

Du MUSST antworten:
<write_file path="/root/maintenance.py">from flask import Flask, render_template

app = Flask(__name__)

@app.route('/')
def maintenance():
    return '''<!DOCTYPE html>
<html>
<head>
    <title>Wartung</title>
    <style>
        body {
            font-family: Arial;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea, #764ba2);
            margin: 0;
        }
        .container {
            text-align: center;
            color: white;
            padding: 40px;
            background: rgba(255,255,255,0.1);
            border-radius: 20px;
            backdrop-filter: blur(10px);
        }
        h1 { font-size: 3rem; margin-bottom: 20px; }
        p { font-size: 1.2rem; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🛠️ Wartungsarbeiten</h1>
        <p>Wir sind bald zurück!</p>
    </div>
</body>
</html>'''

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
</write_file>
✅ Fertig! Datei erstellt: /root/maintenance.py

BEISPIEL 2 - HTML Webseite:
User: "Erstelle index.html"

Du MUSST antworten:
<write_file path="${webDirectory}/index.html"><!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Meine Seite</title>
    <style>
        body {
            font-family: 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea, #764ba2);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            margin: 0;
            color: white;
        }
        .container {
            text-align: center;
            padding: 50px;
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Willkommen!</h1>
    </div>
</body>
</html></write_file>
✅ Fertig! Datei erstellt: index.html

PFAD-REGELN:
- Python/Shell-Scripts mit vollem Pfad: /root/datei.py
- HTML/CSS/JS: ${webDirectory}/datei.html
- Bei User-Pfad: Nutze den exakten Pfad

WICHTIG:
1. IMMER vollständigen, funktionierenden Code schreiben
2. NIEMALS nur "Ich erstelle..." ohne <write_file> Tag
3. Moderne, schöne Designs nutzen
4. Im Chat keine Code-Blöcke zeigen (nur "Datei erstellt")
5. Nach Dateien: "✅ Fertig! Datei erstellt: DATEINAME"`
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
    logCallback(`🚀 Agent gestartet: ${directory}`);
    if (directory === '/') {
        logCallback(`🌐 Webseiten: ${webDirectory}`);
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
        chatCallback('ai', `⚠️ Limit erreicht. Neue Anweisung nötig.`);
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
        
        // Entferne Code-Tags aus Chat-Anzeige
        let chatMessage = response;
        chatMessage = chatMessage.replace(/<write_file[^>]*>[\s\S]*?<\/write_file>/g, '');
        chatMessage = chatMessage.replace(/<bash>[\s\S]*?<\/bash>/g, '');
        chatMessage = chatMessage.replace(/<read_file[^>]*\/>/g, '');
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
            logCallback(`✅ Fertig`);
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
            
            // Nur relative Pfade anpassen, absolute Pfade beibehalten
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
                    logCallback(`📁 Dir: ${dir}`);
                }
                
                fs.writeFileSync(filePath, fileContent, 'utf8');
                logCallback(`✅ ${path.basename(filePath)}`);
                conversationHistory.push({ role: 'user', content: `${filePath} wurde erfolgreich erstellt` });
            } catch(err) {
                logCallback(`❌ ${err.message}`);
                conversationHistory.push({ role: 'user', content: `FEHLER beim Erstellen von ${filePath}: ${err.message}. Bitte korrigiere den Pfad oder die Dateirechte.` });
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
                conversationHistory.push({ role: 'user', content: `Fehler beim Lesen: ${err.message}` });
            }
        }

        // Wenn Agent sagt "Fertig" aber keine Dateien erstellt hat
        if (isDone && !hasActions && session.stepCount > 1) {
            session.isPaused = false; // NICHT pausieren
            conversationHistory.push({ 
                role: 'user', 
                content: 'FEHLER: Du hast gesagt "Fertig" aber keine Dateien erstellt! Du MUSST die <write_file> Tags nutzen um Dateien zu erstellen. Versuche es nochmal und nutze diesmal die Tags!' 
            });
            logCallback(`⚠️ Keine Dateien erstellt - fordere Korrektur an`);
            setTimeout(() => agentLoop(sessionId), 1000);
            return;
        }

        if (!hasActions && !isDone) {
            session.emptyResponseCount++;
            logCallback(`⚠️ Keine Aktion (${session.emptyResponseCount}/3)`);
            
            if (session.emptyResponseCount >= 3) {
                session.isPaused = true;
                logCallback(`⏸ Pausiert`);
                chatCallback('ai', '⏸ Klarere Anweisung nötig.');
                return;
            }
        } else {
            session.emptyResponseCount = 0;
        }

        setTimeout(() => agentLoop(sessionId), 2000);
        
    } catch(err) {
        logCallback(`❌ API: ${err.message}`);
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
        exec(command, { cwd, timeout: 30000 }, (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message));
            resolve(stdout || stderr);
        });
    });
}

module.exports = { runAgent, sendChatMessage, stopAgent };