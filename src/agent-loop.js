// Fix: Web-Suche Kontext + Q&A Antworten werden korrekt erkannt
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
        allowRoot, enableWebSearch, hasSearchContext
    } = config;

    let webDirectory = directory === '/' ? '/var/www/html' : directory;

    const rootModeInfo = allowRoot
        ? `\n🔴 ROOT-MODUS AKTIV 🔴\nDu hast volle System-Kontrolle:\n- apt install/update/upgrade\n- systemctl restart/stop/start\n- rm -rf\n- reboot`
        : `\n🟢 NORMAL-MODUS\nDu kannst: Dateien erstellen/lesen/schreiben, rm in User-Ordnern\nDu kannst NICHT: apt, systemctl, reboot, Systemdateien löschen`;

    const webSearchInfo = enableWebSearch
        ? `\n🌐 WEB-SUCHE AKTIV:\nWenn du aktuelle Infos brauchst, nutze: <search>Suchbegriff</search>\nDie Ergebnisse kommen automatisch als Kontext zurück.`
        : '';

    const conversationHistory = [
        {
            role: 'system',
            content:
`Du bist ein intelligenter KI-Agent (wie OpenClaw/Cursor) mit zwei Fähigkeiten:

1. CODING-AGENT: Nutze <bash> Tags für alle Terminal-Befehle.
   Beispiel: <bash>cat > /root/app.py << 'EOF'\nprint('Hallo')\nEOF\n</bash>

2. CHAT-ASSISTENT: Wenn der Nutzer eine Frage stellt (z.B. mit Web-Suchergebnissen),
   antworte einfach als Text. KEIN <bash> nötig. Schreibe am Ende "Fertig!".

ARBEITSVERZEICHNIS: ${directory}\nWEBSEITEN-ORDNER: ${webDirectory}
${rootModeInfo}${webSearchInfo}

BEISPIELE CODING:
1. <bash>cat > /root/app.py << 'EOF'\nfrom flask import Flask\napp = Flask(__name__)\nEOF\n</bash>
2. <bash>cat /root/app.py</bash>
3. <bash>mkdir -p /root/projekt</bash>
${allowRoot ? `4. <bash>apt update && apt install -y python3-flask</bash>\n5. <bash>systemctl restart nginx</bash>` : ''}

REGELN:
- Coding: Nutze <bash> für alle Befehle, schreibe vollständigen Code
- Q&A/Suche: Antworte als Text, kein <bash>, schreibe am Ende "Fertig!"
- Nach Befehlen: Sage "Fertig!"`
        },
        { role: 'user', content: (initialContextData || '') + '\n\n' + initialPrompt }
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
        allowRoot:       allowRoot       || false,
        enableWebSearch: enableWebSearch || false,
        hasSearchContext: hasSearchContext || false,
        lastChatMessage: null,
        correctionAttempts: 0
    };

    activeSessions.set(sessionId, session);
    logCallback(`🚀 Start: ${directory}`);
    if (allowRoot)       logCallback(`🔴 ROOT-MODUS`);
    else                 logCallback(`🟢 NORMAL-MODUS`);
    if (enableWebSearch) logCallback(`🌐 WEB-SUCHE AKTIV`);
    if (hasSearchContext) logCallback(`🔍 Suchergebnisse im Kontext`);

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
        return;
    }

    try {
        logCallback(`⚒️ Step ${session.stepCount}`);

        const response = await callLLM(
            config.provider, config.apiKey,
            conversationHistory, config.model
        );

        conversationHistory.push({ role: 'assistant', content: response });

        // === WEB-SUCHE Tags verarbeiten ===
        if (session.enableWebSearch) {
            const searchMatches = [...response.matchAll(/<search>([\s\S]*?)<\/search>/g)];
            for (const sm of searchMatches) {
                const query = sm[1].trim();
                logCallback(`🔍 Suche: "${query}"`);
                chatCallback('ai', `🔍 Suche: "${query}"...`);
                const results   = await webSearch(query, 6);
                const formatted = formatForAI(query, results);
                logCallback(`✅ ${results.length} Ergebnisse`);
                conversationHistory.push({ role: 'user', content: formatted });
                session.stepCount--;
                setTimeout(() => agentLoop(sessionId), 500);
                return;
            }
        }

        // Chat-Nachricht ohne bash/search Tags anzeigen
        const chatMessage = response
            .replace(/<bash>[\s\S]*?<\/bash>/g, '')
            .replace(/<search>[\s\S]*?<\/search>/g, '')
            .replace(/```[\s\S]*?```/g, '')
            .trim();

        if (chatMessage && chatMessage !== session.lastChatMessage) {
            chatCallback('ai', chatMessage);
            session.lastChatMessage = chatMessage;
        }

        // === FERTIG-Erkennung ===
        const hasBash = response.includes('<bash>');
        const isDone  = response.includes('✅') ||
                        response.toLowerCase().includes('fertig') ||
                        response.toLowerCase().includes('abgeschlossen') ||
                        response.toLowerCase().includes('done');

        // NEU: Reine Text-Antwort (kein bash) = Q&A Antwort = direkt fertig
        // Verhindert die nervige "Klarere Anweisung nötig" Meldung bei Suchanfragen
        const isPureTextAnswer = !hasBash && chatMessage.length > 80;

        if (isPureTextAnswer || isDone) {
            session.isPaused = true;
            logCallback(`✅ Fertig (Text-Antwort)`);
            return;
        }

        // === BASH-Befehle ausführen ===
        let filesCreated  = 0;
        let hasActions    = false;

        const bashMatches = [...response.matchAll(/<bash>([\s\S]*?)<\/bash>/g)];
        for (const match of bashMatches) {
            hasActions = true;
            const command = match[1].trim();

            if (checkDangerousCommand(command) && !session.allowRoot) {
                logCallback(`❌ BLOCKIERT: ${command.substring(0,50)}`);
                conversationHistory.push({ role:'user', content:`❌ Befehl blockiert (Root-Rechte nötig):\n${command}` });
                if (session.lastChatMessage !== '❌ Befehl blockiert') {
                    chatCallback('ai', '❌ Befehl blockiert – Root-Modus aktivieren!');
                    session.lastChatMessage = '❌ Befehl blockiert';
                }
                continue;
            }

            const isFileCr = command.includes('cat >') || command.includes('cat>');
            const fm = isFileCr ? command.match(/cat\s*>\s*([^\s<]+)/) : null;
            logCallback(isFileCr && fm ? `💾 ${fm[1]}` : `💻 ${command.substring(0,60)}`);

            try {
                const output = await execPromise(command, config.directory);
                if (isFileCr) { filesCreated++; if (fm) logCallback(`✅ ${path.basename(fm[1])}`); }
                else { const s = output.substring(0,150).trim(); logCallback(s ? `✅ ${s}` : `✅ OK`); }
                conversationHistory.push({ role:'user', content:`Befehl ausgeführt. Output: ${output.substring(0,500)}` });
            } catch(err) {
                logCallback(`❌ ${err.message}`);
                conversationHistory.push({ role:'user', content:`FEHLER: ${err.message}` });
            }
        }

        // Nach Datei-Erstellung: sofort stoppen (OpenClaw-Style)
        if (filesCreated > 0) {
            session.isPaused = true;
            logCallback(`✅ Fertig (${filesCreated} Datei${filesCreated>1?'en':''})`);
            return;
        }

        // Korrektur wenn KI nix getan hat
        if (!hasActions && !isDone && !isPureTextAnswer) {
            session.correctionAttempts++;
            if (session.correctionAttempts > 2) {
                session.isPaused = true;
                if (session.lastChatMessage !== '❌ Keine Aktion') {
                    chatCallback('ai', '❌ Model antwortet ohne Aktion. Starkeres Model wählen (z.B. llama-3.3-70b-versatile)');
                    session.lastChatMessage = '❌ Keine Aktion';
                }
                return;
            }
            conversationHistory.push({ role:'user', content:`❌ KEIN BEFEHL AUSGEFÜHRT! Nutze <bash>...</bash> Tags!\nVersuche es nochmal!` });
            logCallback(`⚠️ Korrektur ${session.correctionAttempts}/2`);
            setTimeout(() => agentLoop(sessionId), 1000);
            return;
        }

        if (hasActions) session.correctionAttempts = 0;
        if (isDone) { session.isPaused = true; logCallback(`✅ Fertig`); return; }

        setTimeout(() => agentLoop(sessionId), 2000);

    } catch(err) {
        logCallback(`❌ ${err.message}`);
        session.isPaused = true;
        chatCallback('ai', `❌ ${err.message}`);
    }
}

function checkDangerousCommand(cmd) {
    const dangerous = [
        'apt install','apt-get install','apt update','apt-get update',
        'apt upgrade','apt-get upgrade','apt remove','apt-get remove',
        'systemctl','service ','reboot','shutdown',
        'rm -rf /','rm -rf /etc','rm -rf /var','rm -rf /usr',
        'rm -rf /boot','rm -rf /sys','rm -rf /proc','rm -rf /dev',
        'rm -r /','rm -r /etc','rm -r /var','rm -r /usr',
        'dd if=','mkfs.','fdisk','parted','iptables','ufw ',
        'passwd','useradd','userdel','chmod 777 /','chown root:root /'
    ];
    const c = cmd.toLowerCase();
    return dangerous.some(d => c.includes(d));
}

function sendChatMessage(sessionId, userMessage, contextData) {
    const session = activeSessions.get(sessionId);
    if (!session) return false;
    session.logCallback(`▶️ Nachricht`);
    const full = contextData ? `${contextData}\n\n${userMessage}` : userMessage;
    session.conversationHistory.push({ role:'user', content: full });
    session.isPaused = false;
    session.emptyResponseCount = 0;
    session.stepCount = 0;
    session.correctionAttempts = 0;
    session.lastChatMessage = null;
    agentLoop(sessionId);
    return true;
}

function stopAgent(sessionId) {
    const s = activeSessions.get(sessionId);
    if (s) { s.isPaused = true; s.logCallback(`⏹ Stop`); }
    activeSessions.delete(sessionId);
}

function execPromise(command, cwd) {
    return new Promise((resolve, reject) => {
        exec(command, { cwd, shell:'/bin/bash', timeout:30000 }, (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message));
            resolve(stdout || stderr || 'OK');
        });
    });
}

module.exports = { runAgent, sendChatMessage, stopAgent };
