// Feature: Web-Suche integriert (DuckDuckGo, kostenlos)
const { callLLM } = require('./api-providers');
const { search: webSearch, formatForAI } = require('./web-search');
const { exec } = require('child_process');
const fs   = require('fs');
const path = require('path');

const activeSessions = new Map();

function runAgent(sessionId, config, logCallback, chatCallback) {
    const {
        provider, apiKey, model,
        directory, initialPrompt, initialContextData,
        allowRoot, enableWebSearch
    } = config;

    let webDirectory = directory;
    if (directory === '/') webDirectory = '/var/www/html';

    const rootModeInfo = allowRoot
        ? `\n🔴 ROOT-MODUS AKTIV 🔴\nDu hast volle System-Kontrolle:\n- apt install/update/upgrade\n- systemctl restart/stop/start\n- rm -rf (Dateien löschen)\n- reboot (System neustarten)\n- Alle sudo-Befehle\n\nNutze diese Rechte verantwortungsvoll!`
        : `\n🟢 NORMAL-MODUS\nDu kannst:\n- Dateien erstellen/lesen/schreiben\n- Programme im User-Verzeichnis ausführen\n- Dateien löschen (rm)\n\nDu kannst NICHT:\n- System-Updates (apt update/upgrade)\n- Programme installieren (apt install)\n- System neustarten (reboot)\n- Systemdateien löschen\n- systemctl Befehle`;

    const webSearchInfo = enableWebSearch
        ? `\n🌐 WEB-SUCHE AKTIV:\nWenn du aktuelle Infos brauchst oder der User eine Suchanfrage stellt, nutze den Tag:\n<search>Suchbegriff hier</search>\nDie Ergebnisse werden dir automatisch als Kontext gegeben.`
        : '';

    const conversationHistory = [
        {
            role: 'system',
            content: `Du bist ein automatischer Coding-Agent wie OpenClaw/Cursor.\n\nARBEITSVERZEICHNIS: ${directory}\nWEBSEITEN-ORDNER: ${webDirectory}\n${rootModeInfo}${webSearchInfo}\n\nWIE DU ARBEITEST:\nNutze <bash> Tags für alle Befehle.\n\nBEISPIELE:\n\n1. DATEIEN ERSTELLEN:\n<bash>cat > /root/app.py << 'EOF'\nfrom flask import Flask\napp = Flask(__name__)\n\n@app.route('/')\ndef home():\n    return "Hallo!"\n\nif __name__ == '__main__':\n    app.run(host='0.0.0.0', port=8056)\nEOF\n</bash>\n\n2. DATEIEN LESEN:\n<bash>cat /root/app.py</bash>\n\n3. DATEIEN LÖSCHEN:\n<bash>rm /root/app.py</bash>\n\n4. VERZEICHNISSE ERSTELLEN:\n<bash>mkdir -p /root/mein_projekt</bash>\n\n5. PROGRAMME AUSFÜHREN:\n<bash>python3 /root/app.py &</bash>\n\n${allowRoot ? `6. PROGRAMME INSTALLIEREN (nur Root-Modus):\n<bash>apt update && apt install -y python3-flask</bash>\n\n7. SERVICES NEUSTARTEN (nur Root-Modus):\n<bash>systemctl restart nginx</bash>\n\n8. SYSTEM UPDATEN (nur Root-Modus):\n<bash>apt update && apt upgrade -y</bash>\n\n9. SYSTEM NEUSTARTEN (nur Root-Modus):\n<bash>reboot</bash>` : ''}\n\nREGELN:\n1. Nutze <bash> für ALLE Befehle\n2. Python-Dateien: /root/datei.py\n3. HTML/CSS/JS: ${webDirectory}/datei.html\n4. Schreibe vollständigen Code\n5. Nach Befehlen: Sage "Fertig!"`
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
        enableWebSearch: enableWebSearch || false,
        lastChatMessage: null
    };

    activeSessions.set(sessionId, session);
    logCallback(`🚀 Start: ${directory}`);
    if (allowRoot)      logCallback(`🔴 ROOT-MODUS AKTIV`);
    else                logCallback(`🟢 NORMAL-MODUS`);
    if (enableWebSearch) logCallback(`🌐 WEB-SUCHE AKTIV`);

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

        // === WEB-SUCHE: <search>...</search> Tags verarbeiten ===
        if (session.enableWebSearch) {
            const searchMatches = [...response.matchAll(/<search>([\s\S]*?)<\/search>/g)];
            for (const sm of searchMatches) {
                const query = sm[1].trim();
                logCallback(`🔍 Suche: "${query}"`);
                chatCallback('ai', `🔍 Suche im Internet nach: "${query}"...`);
                const results = await webSearch(query, 6);
                const formatted = formatForAI(query, results);
                logCallback(`✅ ${results.length} Ergebnisse für "${query}"`);
                conversationHistory.push({ role: 'user', content: formatted });
                // Nochmal den Agent aufrufen mit den Suchergebnissen
                session.stepCount--;
                setTimeout(() => agentLoop(sessionId), 500);
                return;
            }
        }

        // Chat-Nachricht anzeigen (ohne bash/search Tags)
        let chatMessage = response
            .replace(/<bash>[\s\S]*?<\/bash>/g, '')
            .replace(/<search>[\s\S]*?<\/search>/g, '')
            .replace(/```[\s\S]*?```/g, '')
            .trim();

        if (chatMessage && chatMessage !== session.lastChatMessage) {
            chatCallback('ai', chatMessage);
            session.lastChatMessage = chatMessage;
        }

        const isDone = response.includes('✅') ||
                       response.toLowerCase().includes('fertig') ||
                       response.toLowerCase().includes('abgeschlossen');

        let hasActions  = false;
        let filesCreated = 0;

        const bashMatches = [...response.matchAll(/<bash>([\s\S]*?)<\/bash>/g)];
        for (const match of bashMatches) {
            hasActions = true;
            const command = match[1].trim();

            if (checkDangerousCommand(command) && !session.allowRoot) {
                logCallback(`❌ BLOCKIERT: ${command.substring(0, 50)}`);
                conversationHistory.push({
                    role: 'user',
                    content: `❌ FEHLER: Befehl blockiert (benötigt Root-Rechte):\n${command}\n\nDieser Befehl ist gefährlich und benötigt Root-Modus.`
                });
                if (session.lastChatMessage !== '❌ Befehl blockiert - benötigt Root-Rechte') {
                    chatCallback('ai', '❌ Befehl blockiert - benötigt Root-Rechte');
                    session.lastChatMessage = '❌ Befehl blockiert - benötigt Root-Rechte';
                }
                continue;
            }

            const isFileCreation = command.includes('cat >') || command.includes('cat>');
            if (isFileCreation) {
                const fm = command.match(/cat\s*>\s*([^\s<]+)/);
                if (fm) logCallback(`💾 ${fm[1]}`);
            } else {
                logCallback(`💻 ${command.substring(0, 60)}`);
            }

            try {
                const output = await execPromise(command, config.directory);
                if (isFileCreation) {
                    filesCreated++;
                    const fm = command.match(/cat\s*>\s*([^\s<]+)/);
                    if (fm) logCallback(`✅ ${path.basename(fm[1])}`);
                } else {
                    const shortOut = output.substring(0, 150).trim();
                    logCallback(shortOut ? `✅ ${shortOut}` : `✅ OK`);
                }
                conversationHistory.push({ role: 'user', content: `Befehl ausgeführt. Output: ${output.substring(0, 500)}` });
            } catch(err) {
                logCallback(`❌ ${err.message}`);
                conversationHistory.push({ role: 'user', content: `FEHLER: ${err.message}` });
            }
        }

        // OpenClaw-Style: Sofort stoppen nach Datei-Erstellung
        if (filesCreated > 0) {
            session.isPaused = true;
            logCallback(`✅ Fertig (${filesCreated} Datei${filesCreated > 1 ? 'en' : ''})`);
            return;
        }

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

        if (hasActions) session.correctionAttempts = 0;

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
    const dangerous = [
        'apt install','apt-get install',
        'apt update','apt-get update',
        'apt upgrade','apt-get upgrade',
        'apt remove','apt-get remove',
        'systemctl','service ',
        'reboot','shutdown',
        'rm -rf /','rm -rf /etc','rm -rf /var','rm -rf /usr','rm -rf /boot',
        'rm -rf /sys','rm -rf /proc','rm -rf /dev',
        'rm -r /','rm -r /etc','rm -r /var','rm -r /usr','rm -r /boot',
        'dd if=','mkfs.','fdisk','parted',
        'iptables','ufw ',
        'passwd','useradd','userdel',
        'chmod 777 /','chown root:root /'
    ];
    const c = cmd.toLowerCase();
    return dangerous.some(d => c.includes(d));
}

function sendChatMessage(sessionId, userMessage, contextData) {
    const session = activeSessions.get(sessionId);
    if (!session) return false;
    session.logCallback(`▶️ Nachricht`);
    const full = contextData ? `${contextData}\n\n${userMessage}` : userMessage;
    session.conversationHistory.push({ role: 'user', content: full });
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
