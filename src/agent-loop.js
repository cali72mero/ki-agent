// Fix: Verbesserter System-Prompt damit Agent nicht sofort aufgibt
const { callLLM } = require('./api-providers');
const { exec } = require('child_process');
const fs = require('fs');

const activeSessions = new Map();

function runAgent(sessionId, config, logCallback, chatCallback) {
    const { provider, apiKey, model, directory, initialPrompt, deadlineMs, initialContextData } = config;
    
    const conversationHistory = [
        {
            role: 'system',
            content: `Du bist ein autonomer Programmier- und System-Administrator-Agent.

DEINE AUFGABE:
- Führe die gestellte Aufgabe KOMPLETT aus
- Schreibe echten Code und führe Bash-Befehle aus
- Behebe automatisch alle Fehler die auftreten
- Arbeite weiter bis die Aufgabe 100% fertig ist

WICHTIGE REGELN:
1. Sage NIEMALS "Ich habe die Aufgabe abgeschlossen" wenn du noch nichts gemacht hast
2. Wenn du "Hallo" oder eine einfache Frage erhältst, antworte kurz und frage was du tun sollst
3. Melde dich NUR als "fertig" wenn du wirklich Code geschrieben/Befehle ausgeführt hast
4. Bei Fehlern: Analysiere sie und versuche eine Lösung
5. Arbeite im Verzeichnis: ${directory}

VERFÜGBARE TOOLS:
- <bash>command</bash> - Führt Bash-Befehl aus
- <write_file path="...">content</write_file> - Erstellt/aktualisiert Datei
- <read_file path="..."/> - Liest Datei

BEISPIEL:
<bash>ls -la</bash>
<write_file path="test.html"><html>...</html></write_file>

Wenn du fertig bist, schreibe: "✅ Aufgabe abgeschlossen. Was soll ich als Nächstes tun?"`
        },
        { role: 'user', content: initialContextData + '\n\n' + initialPrompt }
    ];

    const session = {
        config,
        conversationHistory,
        isPaused: false,
        deadlineMs,
        logCallback,
        chatCallback
    };

    activeSessions.set(sessionId, session);
    logCallback(`🚀 Agent gestartet im Verzeichnis: ${directory}`);
    
    // Starte die Agent-Loop
    agentLoop(sessionId);
}

async function agentLoop(sessionId) {
    const session = activeSessions.get(sessionId);
    if (!session || session.isPaused) return;

    const { config, conversationHistory, logCallback, chatCallback } = session;
    let step = conversationHistory.length / 2;

    try {
        logCallback(`⚒️ Schritt ${step}: Analysiere & Programmiere...`);
        
        const response = await callLLM(
            config.provider,
            config.apiKey,
            conversationHistory,
            config.model
        );

        conversationHistory.push({ role: 'assistant', content: response });
        chatCallback('ai', response);

        // Prüfe ob Agent fertig ist (nur wenn er auch wirklich was gemacht hat)
        if (response.includes('✅') || response.toLowerCase().includes('aufgabe abgeschlossen')) {
            session.isPaused = true;
            logCallback(`⏸ KI pausiert (spart API-Kosten) und wartet auf neue Nachricht im Chat...`);
            return;
        }

        // Führe Bash-Befehle aus
        const bashMatches = response.matchAll(/<bash>([\s\S]*?)<\/bash>/g);
        for (const match of bashMatches) {
            const command = match[1].trim();
            logCallback(`💻 Befehl: ${command}`);
            
            try {
                const output = await execPromise(command, config.directory);
                logCallback(`✅ Output: ${output.substring(0, 500)}`);
                conversationHistory.push({ role: 'user', content: `Befehl-Output:\n${output}` });
            } catch(err) {
                logCallback(`❌ Fehler: ${err.message}`);
                conversationHistory.push({ role: 'user', content: `Fehler beim Befehl:\n${err.message}` });
            }
        }

        // Schreibe Dateien
        const writeMatches = response.matchAll(/<write_file path="([^"]+)">([\s\S]*?)<\/write_file>/g);
        for (const match of writeMatches) {
            const filePath = match[1];
            const fileContent = match[2].trim();
            logCallback(`💾 Schreibe Datei: ${filePath}`);
            
            try {
                const fullPath = require('path').join(config.directory, filePath);
                fs.writeFileSync(fullPath, fileContent, 'utf8');
                logCallback(`✅ Datei erstellt: ${filePath}`);
                conversationHistory.push({ role: 'user', content: `Datei ${filePath} erfolgreich erstellt` });
            } catch(err) {
                logCallback(`❌ Fehler beim Schreiben: ${err.message}`);
                conversationHistory.push({ role: 'user', content: `Fehler beim Schreiben von ${filePath}: ${err.message}` });
            }
        }

        // Lese Dateien
        const readMatches = response.matchAll(/<read_file path="([^"]+)"\s*\/>/g);
        for (const match of readMatches) {
            const filePath = match[1];
            logCallback(`📄 Lese Datei: ${filePath}`);
            
            try {
                const fullPath = require('path').join(config.directory, filePath);
                const content = fs.readFileSync(fullPath, 'utf8');
                conversationHistory.push({ role: 'user', content: `Inhalt von ${filePath}:\n${content.substring(0, 3000)}` });
            } catch(err) {
                logCallback(`❌ Fehler beim Lesen: ${err.message}`);
                conversationHistory.push({ role: 'user', content: `Fehler beim Lesen von ${filePath}: ${err.message}` });
            }
        }

        // Deadline-Check
        if (Date.now() >= session.deadlineMs) {
            session.isPaused = true;
            chatCallback('ai', '⏰ Deadline erreicht. Ich pausiere jetzt.');
            logCallback(`⏰ Deadline erreicht, Agent pausiert`);
            return;
        }

        // Nächster Loop-Durchlauf
        setTimeout(() => agentLoop(sessionId), 2000);
        
    } catch(err) {
        logCallback(`❌ API-Fehler: ${err.message}`);
        session.isPaused = true;
        chatCallback('ai', `❌ Fehler: ${err.message}. Bitte prüfe deinen API-Key und probiere es erneut.`);
    }
}

function sendChatMessage(sessionId, userMessage, contextData) {
    const session = activeSessions.get(sessionId);
    if (!session) return false;

    session.logCallback(`▶️ Neue Chat-Nachricht erhalten, setze Arbeit fort...`);
    session.chatCallback('user', userMessage);
    
    const fullMessage = contextData ? `${contextData}\n\n${userMessage}` : userMessage;
    session.conversationHistory.push({ role: 'user', content: fullMessage });
    
    session.isPaused = false;
    agentLoop(sessionId);
    return true;
}

function stopAgent(sessionId) {
    const session = activeSessions.get(sessionId);
    if (session) {
        session.isPaused = true;
        session.logCallback(`⏹ Agent gestoppt`);
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