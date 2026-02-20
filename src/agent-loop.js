// Fix: Auto-Korrektur auch bei erstem Step + stärkerer Prompt
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
            content: `Du bist ein Coding-Agent. Du musst IMMER XML-Tags nutzen um Dateien zu erstellen.

ARBEITSVERZEICHNIS: ${directory}

⚠️⚠️⚠️ KRITISCH ⚠️⚠️⚠️
Dateien kannst du NUR mit diesem XML-Tag erstellen:
<write_file path="/voller/pfad.py">CODE HIER</write_file>

OHNE dieses Tag wird KEINE Datei erstellt!

FALSCH ❌ (Datei wird NICHT erstellt):
User: "Erstelle maintenance.py"
Du: "Ich erstelle die Datei maintenance.py"
     ✅ Fertig!
     
→ KEINE DATEI ERSTELLT! ❌

RICHTIG ✅ (Datei wird erstellt):
User: "Erstelle maintenance.py"
Du: <write_file path="/root/maintenance.py">from flask import Flask
app = Flask(__name__)
@app.route('/')
def home():
    return "Hallo!"
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8056)
</write_file>
✅ Fertig! Datei erstellt: /root/maintenance.py

→ DATEI WURDE ERSTELLT! ✅

WICHTIGE BEISPIELE:

BEISPIEL 1 - Flask Wartungsseite auf Port 8056:
<write_file path="/root/maintenance.py">from flask import Flask

app = Flask(__name__)

@app.route('/')
def maintenance():
    return '''<!DOCTYPE html>
<html>
<head>
    <title>Wartung</title>
    <meta charset="utf-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
            text-align: center;
            color: white;
            padding: 50px;
            background: rgba(255,255,255,0.1);
            border-radius: 20px;
            backdrop-filter: blur(10px);
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        }
        h1 { 
            font-size: 3rem; 
            margin-bottom: 20px;
            text-shadow: 2px 2px 10px rgba(0,0,0,0.3);
        }
        p { font-size: 1.2rem; opacity: 0.9; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🛠️ Wartungsarbeiten</h1>
        <p>Wir arbeiten gerade an Verbesserungen.</p>
        <p>Wir sind bald zurück!</p>
    </div>
</body>
</html>'''

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8056)
</write_file>

BEISPIEL 2 - HTML Webseite:
<write_file path="${webDirectory}/index.html"><!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <title>Webseite</title>
    <style>
        body {
            font-family: Arial;
            background: linear-gradient(135deg, #667eea, #764ba2);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: white;
            margin: 0;
        }
    </style>
</head>
<body>
    <h1>Hallo Welt!</h1>
</body>
</html></write_file>

REGELN:
1. IMMER <write_file> nutzen für Dateien
2. Voller Pfad: /root/datei.py oder ${webDirectory}/datei.html
3. Kompletten Code schreiben (nicht "...")
4. Im Chat keine Code-Blöcke (nur "Datei erstellt")
5. Python-Dateien → /root/
6. HTML/CSS/JS → ${webDirectory}/`
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
    logCallback(`🚀 Start: ${directory}`);
    
    agentLoop(sessionId);
}

async function agentLoop(sessionId) {
    const session = activeSessions.get(sessionId);
    if (!session || session.isPaused) return;

    const { config, conversationHistory, logCallback, chatCallback } = session;
    session.stepCount++;

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

        let hasActions = false;

        // Bash-Befehle
        const bashMatches = [...response.matchAll(/<bash>([\s\S]*?)<\/bash>/g)];
        for (const match of bashMatches) {
            hasActions = true;
            const command = match[1].trim();
            logCallback(`💻 ${command}`);
            
            try {
                const output = await execPromise(command, config.directory);
                logCallback(`✅ ${output.substring(0, 150)}`);
                conversationHistory.push({ role: 'user', content: `Output:\n${output}` });
            } catch(err) {
                logCallback(`❌ ${err.message}`);
                conversationHistory.push({ role: 'user', content: `Fehler:\n${err.message}` });
            }
        }

        // Dateien schreiben
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
                logCallback(`✅ ${path.basename(filePath)}`);
                conversationHistory.push({ role: 'user', content: `${filePath} erfolgreich erstellt` });
            } catch(err) {
                logCallback(`❌ ${err.message}`);
                conversationHistory.push({ role: 'user', content: `FEHLER: ${err.message}` });
            }
        }

        // Dateien lesen
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
                conversationHistory.push({ role: 'user', content: `Inhalt:\n${content.substring(0, 2000)}` });
            } catch(err) {
                logCallback(`❌ ${err.message}`);
                conversationHistory.push({ role: 'user', content: `Fehler: ${err.message}` });
            }
        }

        // AUTO-KORREKTUR: Wenn "Fertig" aber keine Dateien
        if (isDone && !hasActions) {
            session.isPaused = false;
            conversationHistory.push({ 
                role: 'user', 
                content: `❌ FEHLER: Du hast "Fertig" gesagt aber KEINE Dateien erstellt!

Du MUSST dieses XML-Tag nutzen:
<write_file path="/root/datei.py">CODE</write_file>

Versuche es JETZT NOCHMAL und nutze diesmal das <write_file> Tag!` 
            });
            logCallback(`⚠️ KEINE DATEIEN - Korrektur gestartet`);
            chatCallback('ai', '⚠️ Korrigiere... (nutze jetzt <write_file> Tags)');
            setTimeout(() => agentLoop(sessionId), 1000);
            return;
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