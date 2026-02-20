// Fix: Agent stoppt automatisch wenn Aufgabe fertig ist (keine endlosen API-Anfragen mehr)
const { callLLM } = require('./api-providers');
const { exec } = require('child_process');
const fs = require('fs');

const activeSessions = new Map();

function runAgent(sessionId, config, logCallback, chatCallback) {
    const { provider, apiKey, model, directory, initialPrompt, initialContextData } = config;
    
    const conversationHistory = [
        {
            role: 'system',
            content: `Du bist ein autonomer Programmier- und System-Administrator-Agent.

DEINE AUFGABE:
- Führe die gestellte Aufgabe KOMPLETT aus
- Schreibe echten Code und führe Bash-Befehle aus
- Behebe automatisch alle Fehler die auftreten
- STOPPE SOFORT wenn die Aufgabe erledigt ist (spart API-Kosten!)

WICHTIGE REGELN:
1. Wenn du "Hallo" oder eine einfache Frage erhältst, antworte kurz und frage was du tun sollst
2. Wenn du eine Aufgabe bekommst (z.B. "Erstelle 3 Webseiten"), mach sie KOMPLETT fertig
3. Wenn du fertig bist, schreibe "✅ Aufgabe abgeschlossen. Was soll ich als Nächstes tun?"
4. Nach "✅" KEINE weiteren API-Anfragen mehr - warte auf neue Nachricht!
5. Arbeite im Verzeichnis: ${directory}

VERFÜGBARE TOOLS:
- <bash>command</bash> - Führt Bash-Befehl aus
- <write_file path="...">content</write_file> - Erstellt/aktualisiert Datei
- <read_file path="..."/> - Liest Datei

BEISPIEL:
User: "Erstelle 3 HTML-Seiten über Anime"
Du: <write_file path="naruto.html">...</write_file>
    <write_file path="onepiece.html">...</write_file>
    <write_file path="dragonball.html">...</write_file>
    ✅ Aufgabe abgeschlossen. Ich habe 3 Anime-Webseiten erstellt. Was soll ich als Nächstes tun?
    
WICHTIG: Nach "✅" stoppst du komplett und wartest auf neue Nachricht!`
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
        maxSteps: 50  // Sicherheitslimit: Maximal 50 API-Calls pro Aufgabe
    };

    activeSessions.set(sessionId, session);
    logCallback(`🚀 Agent gestartet im Verzeichnis: ${directory}`);
    
    // Starte die Agent-Loop
    agentLoop(sessionId);
}

async function agentLoop(sessionId) {
    const session = activeSessions.get(sessionId);
    if (!session || session.isPaused) return;

    const { config, conversationHistory, logCallback, chatCallback, stepCount, maxSteps } = session;
    session.stepCount++;

    // Sicherheitslimit: Stoppe nach 50 Steps
    if (session.stepCount > maxSteps) {
        session.isPaused = true;
        chatCallback('ai', `⚠️ Sicherheitslimit erreicht (${maxSteps} API-Aufrufe). Bitte gib eine neue Anweisung.`);
        logCallback(`⚠️ Sicherheitslimit erreicht, Agent pausiert`);
        return;
    }

    try {
        logCallback(`⚒️ Schritt ${session.stepCount}: Analysiere & Programmiere...`);
        
        const response = await callLLM(
            config.provider,
            config.apiKey,
            conversationHistory,
            config.model
        );

        conversationHistory.push({ role: 'assistant', content: response });
        chatCallback('ai', response);

        // Prüfe ob Agent fertig ist
        if (response.includes('✅') || response.toLowerCase().includes('aufgabe abgeschlossen') || response.toLowerCase().includes('fertig')) {
            session.isPaused = true;
            logCallback(`✅ Aufgabe abgeschlossen! Agent pausiert und wartet auf neue Nachricht...`);
            return;
        }

        // Führe Bash-Befehle aus
        const bashMatches = response.matchAll(/<bash>([\s\S]*?)<\/bash>/g);
        let hasExecutedCommands = false;
        
        for (const match of bashMatches) {
            const command = match[1].trim();
            logCallback(`💻 Befehl: ${command}`);
            hasExecutedCommands = true;
            
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
        let hasWrittenFiles = false;
        
        for (const match of writeMatches) {
            const filePath = match[1];
            const fileContent = match[2].trim();
            logCallback(`💾 Schreibe Datei: ${filePath}`);
            hasWrittenFiles = true;
            
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

        // Wenn keine Actions ausgeführt wurden, aber auch kein "✅", dann pausiere nach 3 leeren Antworten
        if (!hasExecutedCommands && !hasWrittenFiles && !response.includes('<read_file')) {
            if (!session.emptyResponseCount) session.emptyResponseCount = 0;
            session.emptyResponseCount++;
            
            if (session.emptyResponseCount >= 3) {
                session.isPaused = true;
                logCallback(`⏸ Agent pausiert (3 Antworten ohne Aktion) - warte auf neue Nachricht...`);
                return;
            }
        } else {
            session.emptyResponseCount = 0;
        }

        // Nächster Loop-Durchlauf nach 2 Sekunden
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
    
    // Reset counters
    session.isPaused = false;
    session.emptyResponseCount = 0;
    session.stepCount = 0;  // Reset step counter bei neuer Nachricht
    
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