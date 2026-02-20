// Fix: rm nur bei System-Pfaden blockieren!
const { callLLM } = require('./api-providers');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const activeSessions = new Map();

function runAgent(sessionId, config, logCallback, chatCallback) {
    const { provider, apiKey, model, directory, initialPrompt, initialContextData, allowRoot } = config;
    
    let webDirectory = directory;
    if (directory === '/') {
        webDirectory = '/var/www/html';
    }
    
    const rootModeInfo = allowRoot ? `
🔴 ROOT-MODUS AKTIV 🔴
Du hast volle System-Kontrolle:
- apt install/update/upgrade
- systemctl restart/stop/start
- rm -rf (Dateien löschen)
- reboot (System neustarten)
- Alle sudo-Befehle

Nutze diese Rechte verantwortungsvoll!` : `
🟢 NORMAL-MODUS
Du kannst:
- Dateien erstellen/lesen/schreiben
- Programme im User-Verzeichnis ausführen
- Dateien löschen (rm)

Du kannst NICHT:
- System-Updates (apt update/upgrade)
- Programme installieren (apt install)
- System neustarten (reboot)
- Systemdateien löschen
- systemctl Befehle`;
    
    const conversationHistory = [
        {
            role: 'system',
            content: `Du bist ein automatischer Coding-Agent wie OpenClaw/Cursor.

ARBEITSVERZEICHNIS: ${directory}
WEBSEITEN-ORDNER: ${webDirectory}
${rootModeInfo}

WIE DU ARBEITEST:
Nutze <bash> Tags für alle Befehle.

BEISPIELE:

1. DATEIEN ERSTELLEN:
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

2. DATEIEN LESEN:
<bash>cat /root/app.py</bash>

3. DATEIEN LÖSCHEN:
<bash>rm /root/app.py</bash>

4. VERZEICHNISSE ERSTELLEN:
<bash>mkdir -p /root/mein_projekt</bash>

5. PROGRAMME AUSFÜHREN:
<bash>python3 /root/app.py &</bash>

${allowRoot ? `6. PROGRAMME INSTALLIEREN (nur Root-Modus):
<bash>apt update && apt install -y python3-flask</bash>

7. SERVICES NEUSTARTEN (nur Root-Modus):
<bash>systemctl restart nginx</bash>

8. SYSTEM UPDATEN (nur Root-Modus):
<bash>apt update && apt upgrade -y</bash>

9. SYSTEM NEUSTARTEN (nur Root-Modus):
<bash>reboot</bash>` : ''}

REGELN:
1. Nutze <bash> für ALLE Befehle
2. Python-Dateien: /root/datei.py
3. HTML/CSS/JS: ${webDirectory}/datei.html
4. Schreibe vollständigen Code
5. Nach Befehlen: Sage "Fertig!"`
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
        filesCreatedThisRound: 0,
        allowRoot: allowRoot || false,
        lastChatMessage: null
    };

    activeSessions.set(sessionId, session);
    logCallback(`🚀 Start: ${directory}`);
    if (allowRoot) {
        logCallback(`🔴 ROOT-MODUS AKTIV`);
    } else {
        logCallback(`🟢 NORMAL-MODUS`);
    }
    
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
        
        let chatMessage = response;
        chatMessage = chatMessage.replace(/<bash>[\s\S]*?<\/bash>/g, '');
        chatMessage = chatMessage.replace(/```[\s\S]*?```/g, '');
        
        chatMessage = chatMessage.trim();
        
        if (chatMessage && chatMessage !== session.lastChatMessage) {
            chatCallback('ai', chatMessage);
            session.lastChatMessage = chatMessage;
        }

        const isDone = response.includes('✅') || 
                       response.toLowerCase().includes('fertig') ||
                       response.toLowerCase().includes('abgeschlossen');

        let hasActions = false;
        let filesCreated = 0;

        const bashMatches = [...response.matchAll(/<bash>([\s\S]*?)<\/bash>/g)];
        for (const match of bashMatches) {
            hasActions = true;
            const command = match[1].trim();
            
            const isDangerous = checkDangerousCommand(command);
            
            if (isDangerous && !session.allowRoot) {
                logCallback(`❌ BLOCKIERT: ${command.substring(0, 50)}`);
                conversationHistory.push({ 
                    role: 'user', 
                    content: `❌ FEHLER: Befehl blockiert (benötigt Root-Rechte):\n${command}\n\nDieser Befehl ist gefährlich und benötigt Root-Modus. Im Normal-Modus kannst du nur Dateien erstellen/lesen/schreiben.` 
                });
                if (session.lastChatMessage !== '❌ Befehl blockiert - benötigt Root-Rechte') {
                    chatCallback('ai', '❌ Befehl blockiert - benötigt Root-Rechte');
                    session.lastChatMessage = '❌ Befehl blockiert - benötigt Root-Rechte';
                }
                continue;
            }
            
            const isFileCreation = command.includes('cat >') || command.includes('cat>');
            
            if (isFileCreation) {
                const fileMatch = command.match(/cat\s*>\s*([^\s<]+)/);
                if (fileMatch) {
                    logCallback(`💾 ${fileMatch[1]}`);
                }
            } else {
                logCallback(`💻 ${command.substring(0, 60)}`);
            }
            
            try {
                const output = await execPromise(command, config.directory);
                
                if (isFileCreation) {
                    filesCreated++;
                    const fileMatch = command.match(/cat\s*>\s*([^\s<]+)/);
                    if (fileMatch) {
                        const fileName = path.basename(fileMatch[1]);
                        logCallback(`✅ ${fileName}`);
                    }
                } else {
                    const shortOutput = output.substring(0, 150);
                    if (shortOutput.trim()) {
                        logCallback(`✅ ${shortOutput}`);
                    } else {
                        logCallback(`✅ OK`);
                    }
                }
                
                conversationHistory.push({ role: 'user', content: `Befehl ausgeführt. Output: ${output.substring(0, 500)}` });
            } catch(err) {
                logCallback(`❌ ${err.message}`);
                conversationHistory.push({ role: 'user', content: `FEHLER: ${err.message}` });
            }
        }

        // WIE OPENCLAW: Stoppe SOFORT wenn Dateien erstellt wurden!
        if (filesCreated > 0) {
            session.isPaused = true;
            logCallback(`✅ Fertig (${filesCreated} Datei${filesCreated > 1 ? 'en' : ''})`);
            return;
        }

        // AUTO-KORREKTUR: Nur wenn NICHTS gemacht wurde
        if (isDone && !hasActions) {
            if (!session.correctionAttempts) session.correctionAttempts = 0;
            session.correctionAttempts++;
            
            if (session.correctionAttempts > 2) {
                session.isPaused = true;
                logCallback(`❌ Abgebrochen`);
                if (session.lastChatMessage !== '❌ Model versteht Aufgabe nicht') {
                    chatCallback('ai', '❌ Model versteht Aufgabe nicht. Nutze stärkeres Model (z.B. llama-3.3-70b-versatile).');
                    session.lastChatMessage = '❌ Model versteht Aufgabe nicht';
                }
                return;
            }
            
            session.isPaused = false;
            conversationHistory.push({ 
                role: 'user', 
                content: `❌ DU HAST KEINE BEFEHLE AUSGEFÜHRT!\n\nNutze <bash> Tags:\n<bash>cat > /root/datei.py << 'EOF'\nCODE\nEOF\n</bash>\n\nVersuche es NOCHMAL!` 
            });
            logCallback(`⚠️ Korrektur ${session.correctionAttempts}/2`);
            setTimeout(() => agentLoop(sessionId), 1000);
            return;
        }
        
        if (hasActions) {
            session.correctionAttempts = 0;
        }
        
        // Normale "Fertig" Nachricht
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
                if (session.lastChatMessage !== '⏸ Klarere Anweisung nötig') {
                    chatCallback('ai', '⏸ Klarere Anweisung nötig');
                    session.lastChatMessage = '⏸ Klarere Anweisung nötig';
                }
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

function checkDangerousCommand(cmd) {
    // NUR System-kritische Befehle blockieren!
    const dangerous = [
        'apt install', 'apt-get install',
        'apt update', 'apt-get update',
        'apt upgrade', 'apt-get upgrade',
        'apt remove', 'apt-get remove',
        'systemctl', 'service ',
        'reboot', 'shutdown',
        // NUR rm mit System-Pfaden blockieren!
        'rm -rf /', 'rm -rf /etc', 'rm -rf /var', 'rm -rf /usr', 'rm -rf /boot',
        'rm -rf /sys', 'rm -rf /proc', 'rm -rf /dev',
        'rm -r /', 'rm -r /etc', 'rm -r /var', 'rm -r /usr', 'rm -r /boot',
        'dd if=', 
        'mkfs.', 'fdisk', 'parted',
        'iptables', 'ufw ',
        'passwd', 'useradd', 'userdel',
        'chmod 777 /',
        'chown root:root /'
    ];
    
    const cmdLower = cmd.toLowerCase();
    return dangerous.some(d => cmdLower.includes(d));
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
    session.lastChatMessage = null;
    
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