const { callLLM }        = require('./api-providers');
const { executeCommand } = require('./shell-executor');

// Aktive Agent-Sessions (sessionId -> { running: bool })
const activeAgents = new Map();

/**
 * Haupt-Agent-Schleife. L\u00e4uft autonom bis Deadline oder TASK_COMPLETED.
 * @param {string}   sessionId  - Eindeutige Session-ID
 * @param {object}   config     - { provider, apiKey, model, directory, taskPrompt, deadlineMs }
 * @param {function} onLog      - Callback f\u00fcr Live-Log-Ausgabe
 */
async function runAgent(sessionId, config, onLog) {
    const { provider, apiKey, model, directory, taskPrompt, deadlineMs } = config;

    activeAgents.set(sessionId, { running: true });

    onLog(`\ud83d\ude80 Agent [${sessionId}] gestartet!`);
    onLog(`\ud83d\udcc2 Verzeichnis: ${directory}`);
    onLog(`\ud83d\udccb Aufgabe: ${taskPrompt}`);
    onLog(`\u23f0 Deadline: ${new Date(deadlineMs).toLocaleTimeString('de-DE')}`);
    onLog('---');

    const systemPrompt = `Du bist ein autonomer Linux-Entwickler und System-Administrator mit Root-Rechten.
Arbeitsverzeichnis: ${directory}
Betriebssystem: Linux (Ubuntu/Debian)

AUFGABE: ${taskPrompt}

REGELN (sehr wichtig):
- Antworte IMMER nur mit EINEM einzigen Bash-Befehl
- Kein Erkl\u00e4rungstext, kein Markdown, kein Code-Block - nur der reine Befehl
- F\u00fcr mehrzeilige Dateien: cat > datei.txt << 'EOF'\ninhalt\nEOF
- Wenn die Aufgabe vollst\u00e4ndig und fehlerfrei erledigt ist: antworte exakt TASK_COMPLETED
- Bei Fehlern im Output: analysiere und repariere automatisch im n\u00e4chsten Schritt`;

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: 'Starte die Aufgabe. Was ist dein erster Bash-Befehl?' }
    ];

    let step = 0;
    const MAX_STEPS = 80;

    while (Date.now() < deadlineMs && step < MAX_STEPS) {
        const agent = activeAgents.get(sessionId);
        if (!agent || !agent.running) {
            onLog('\u26d4 Agent wurde manuell gestoppt.');
            break;
        }

        step++;
        onLog(`\n\ud83e\udd14 Schritt ${step}: Frage KI (${provider})...`);

        let kiAntwort;
        try {
            kiAntwort = await callLLM(provider, apiKey, messages, model);
        } catch (err) {
            onLog(`\u274c API-Fehler: ${err.message}`);
            onLog('\u23f3 Warte 10 Sekunden und versuche erneut...');
            await sleep(10000);
            continue;
        }

        // Codeblock-Bereinigung (falls KI trotzdem Backticks schickt)
        const cmdRaw = kiAntwort.replace(/^```(bash|sh)?\n?/i, '').replace(/\n?```$/,'').trim();

        if (cmdRaw.toUpperCase().includes('TASK_COMPLETED')) {
            onLog('\u2705 KI meldet: Aufgabe vollst\u00e4ndig und fehlerfrei erledigt!');
            break;
        }

        onLog(`\ud83d\udcbb Befehl: ${cmdRaw}`);

        const result = await executeCommand(cmdRaw, directory);

        let feedback = '';
        if (result.stdout) {
            onLog(`\ud83d\udce4 Output:\n${result.stdout}`);
            feedback += `STDOUT:\n${result.stdout}\n`;
        }
        if (result.stderr) {
            onLog(`\u26a0\ufe0f  STDERR:\n${result.stderr}`);
            feedback += `STDERR:\n${result.stderr}\n`;
        }
        if (result.error) {
            onLog(`\u274c Exit-Fehler: ${result.error}`);
            feedback += `EXIT ERROR: ${result.error}\n`;
        }
        if (!result.stdout && !result.stderr && !result.error) {
            onLog('\u2714 Befehl erfolgreich (kein Output).');
        }

        // Konversation aktualisieren
        messages.push({ role: 'assistant', content: kiAntwort });
        messages.push({
            role: 'user',
            content: feedback
                ? `Befehlsausgabe:\n${feedback}\nAnalysiere und f\u00fchre den n\u00e4chsten Schritt aus.`
                : 'Befehl erfolgreich. N\u00e4chster Schritt?'
        });

        // Konversation kurz halten (Token-Limit)
        if (messages.length > 24) messages.splice(1, 4);

        await sleep(2500);
    }

    if (Date.now() >= deadlineMs) onLog('\u23f0 Deadline erreicht. Agent stoppt.');
    else if (step >= MAX_STEPS)   onLog(`\ud83d\udd04 Max. ${MAX_STEPS} Schritte erreicht. Agent stoppt.`);

    activeAgents.delete(sessionId);
    onLog('\n\ud83c\udfc1 Agent-Session beendet.');
}

function stopAgent(sessionId) {
    const a = activeAgents.get(sessionId);
    if (a) { a.running = false; return true; }
    return false;
}

function getActiveAgents() {
    return Array.from(activeAgents.keys());
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { runAgent, stopAgent, getActiveAgents };
