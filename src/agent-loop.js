// Update: Chat, Pausen-System & Kontext integriert
const EventEmitter = require('events');
const { callLLM }        = require('./api-providers');
const { executeCommand } = require('./shell-executor');

const activeAgents = new Map();

async function runAgent(sessionId, config, onLog, onChat) {
    const { provider, apiKey, model, directory, initialPrompt, deadlineMs, initialContextData } = config;
    
    const emitter = new EventEmitter();
    activeAgents.set(sessionId, { running: true, emitter });

    onLog(`\ud83d\ude80 Agent gestartet im Verzeichnis: ${directory}`);

    const systemPrompt = `Du bist ein autonomer Linux-Entwickler und Server-Admin mit Root-Rechten.
Arbeitsverzeichnis: ${directory}

REGELN:
1. Wenn du am Arbeiten bist und Befehle ausf\u00fchren willst, antworte IMMER nur mit genau EINEM Bash-Befehl (kein Text au\u00dferhalb des Befehls!).
2. Nutze f\u00fcr Dateien: cat > datei.txt << 'EOF' ... EOF
3. WICHTIG: Wenn du deine aktuelle Aufgabe vollst\u00e4ndig erledigt und alle Fehler behoben hast, antworte exakt mit dem Keyword: TASK_COMPLETED
Nach TASK_COMPLETED wartet das System auf neue Nachrichten vom Nutzer.`;

    let messages = [{ role: 'system', content: systemPrompt }];

    let firstMsg = initialPrompt;
    if (initialContextData) {
        firstMsg = `Hier sind hochgeladene/gelesene Kontext-Daten (Dateien/Verzeichnisse):\n${initialContextData}\n\nAufgabe:\n${initialPrompt}`;
    }
    messages.push({ role: 'user', content: firstMsg });
    onChat('user', initialPrompt);

    let isWaitingForUser = false;
    let step = 0;

    // Event Listener f\u00fcr Chat-Nachrichten w\u00e4hrend der Laufzeit
    emitter.on('chat', (userMsg, ctxData) => {
        let content = userMsg;
        if(ctxData) content = `Kontext-Daten:\n${ctxData}\n\nNeue Anweisung:\n${userMsg}`;
        messages.push({ role: 'user', content });
        onChat('user', userMsg);
        isWaitingForUser = false; // Aufwachen
        onLog('\u25b6\ufe0f Neue Chat-Nachricht erhalten, setze Arbeit fort...');
        emitter.emit('resume');
    });

    while (Date.now() < deadlineMs) {
        const agent = activeAgents.get(sessionId);
        if (!agent || !agent.running) break;

        if (isWaitingForUser) {
            onLog('\u23f8 KI pausiert (spart API-Kosten) und wartet auf neue Nachricht im Chat...');
            await new Promise(resolve => emitter.once('resume', resolve));
            continue;
        }

        step++;
        onLog(`\u2692\ufe0f Schritt ${step}: Analysiere & Programmiere...`);

        let kiAntwort;
        try {
            kiAntwort = await callLLM(provider, apiKey, messages, model);
        } catch (err) {
            onLog(`\u274c API-Fehler: ${err.message}`);
            await new Promise(r => setTimeout(r, 5000));
            continue;
        }

        const cmdRaw = kiAntwort.replace(/^```(bash|sh)?\n?/i, '').replace(/\n?```$/,'').trim();

        // Wenn KI fertig ist -> in Standby gehen
        if (cmdRaw.includes('TASK_COMPLETED')) {
            const aiReply = "\u2705 Ich habe alle Fehler behoben und die Aufgabe abgeschlossen. Was soll ich als N\u00e4chstes tun?";
            onChat('ai', aiReply);
            messages.push({ role: 'assistant', content: cmdRaw }); // Histroy behalten
            isWaitingForUser = true; // API stoppen
            continue;
        }

        onLog(`\ud83d\udcbb F\u00fchre aus: ${cmdRaw.substring(0, 80)}...`);
        const result = await executeCommand(cmdRaw, directory);

        let feedback = '';
        if (result.stdout) feedback += `STDOUT:\n${result.stdout}\n`;
        if (result.stderr) feedback += `STDERR:\n${result.stderr}\n`;
        if (result.error)  feedback += `EXIT ERROR: ${result.error}\n`;

        messages.push({ role: 'assistant', content: kiAntwort });
        messages.push({
            role: 'user',
            content: feedback ? `Ausgabe:\n${feedback}\nAnalysiere Fehler und f\u00fchre n\u00e4chsten Schritt aus.` : 'Erfolgreich. N\u00e4chster Schritt?'
        });

        // Token Limit Management
        if (messages.length > 30) messages.splice(1, 4);

        await new Promise(r => setTimeout(r, 2000));
    }

    if(Date.now() >= deadlineMs) onChat('ai', '\u23f0 Meine Deadline ist erreicht. Ich stelle die Arbeit ein.');
    activeAgents.delete(sessionId);
}

function sendChatMessage(sessionId, msg, contextData) {
    const agent = activeAgents.get(sessionId);
    if(agent) { agent.emitter.emit('chat', msg, contextData); return true; }
    return false;
}

function stopAgent(sessionId) {
    const a = activeAgents.get(sessionId);
    if (a) { a.running = false; a.emitter.emit('resume'); return true; }
    return false;
}

module.exports = { runAgent, sendChatMessage, stopAgent };