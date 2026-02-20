const express    = require('express');
const bodyParser = require('body-parser');
const http       = require('http');
const WebSocket  = require('ws');
const path       = require('path');
const { v4: uuidv4 }              = require('uuid');
const { getConfig }               = require('./config');
const { runAgent, stopAgent, getActiveAgents } = require('./agent-loop');

function createServer() {
    const app    = express();
    const server = http.createServer(app);
    const wss    = new WebSocket.Server({ server });

    app.use(bodyParser.json());
    app.use(express.static(path.join(__dirname, '..', 'public')));

    // ---------- WebSocket: Live-Log-Broadcasting ----------
    const wsClients = new Map();

    wss.on('connection', (ws) => {
        const cid = uuidv4();
        wsClients.set(cid, ws);
        ws.on('close', () => wsClients.delete(cid));
        ws.send(JSON.stringify({ type: 'connected', message: '\u2714 Verbunden mit KI-Agent Server' }));
    });

    function broadcast(sessionId, message) {
        const payload = JSON.stringify({
            type: 'log',
            sessionId,
            message,
            time: new Date().toLocaleTimeString('de-DE')
        });
        wsClients.forEach((ws) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(payload);
        });
    }

    // ---------- Auth-Middleware ----------
    function checkAuth(req, res, next) {
        const cfg    = getConfig();
        const b64    = (req.headers.authorization || '').split(' ')[1] || '';
        const [u, p] = Buffer.from(b64, 'base64').toString().split(':');
        if (u === cfg.username && p === cfg.password) return next();
        res.set('WWW-Authenticate', 'Basic realm="KI-Agent"');
        res.status(401).send('Authentifizierung erforderlich.');
    }

    // ---------- API-Endpunkte ----------

    // POST /api/start  –  neuen Agenten starten
    app.post('/api/start', checkAuth, (req, res) => {
        const { provider, apiKey, model, directory, taskPrompt, deadline } = req.body;

        if (!apiKey || !taskPrompt || !directory || !provider) {
            return res.status(400).json({ error: 'provider, apiKey, directory und taskPrompt sind Pflichtfelder.' });
        }

        // Deadline in Millisekunden
        let deadlineMs;
        if (deadline) {
            const now = new Date();
            const [h, m] = deadline.split(':').map(Number);
            const t = new Date(now); t.setHours(h, m, 0, 0);
            if (t <= now) t.setDate(t.getDate() + 1);
            deadlineMs = t.getTime();
        } else {
            deadlineMs = Date.now() + 8 * 60 * 60 * 1000; // 8 Stunden als Fallback
        }

        const sessionId = uuidv4().substring(0, 8).toUpperCase();

        // Agent asynchron im Hintergrund starten
        runAgent(
            sessionId,
            { provider, apiKey, model, directory, taskPrompt, deadlineMs },
            (msg) => {
                process.stdout.write(`[${sessionId}] ${msg}\n`);
                broadcast(sessionId, msg);
            }
        );

        res.json({ success: true, sessionId, message: `Agent ${sessionId} gestartet und arbeitet im Hintergrund.` });
    });

    // POST /api/stop/:sessionId
    app.post('/api/stop/:id', checkAuth, (req, res) => {
        const ok = stopAgent(req.params.id);
        res.json({ success: ok, message: ok ? 'Agent gestoppt.' : 'Kein aktiver Agent mit dieser ID.' });
    });

    // GET /api/agents  –  aktive Sessions anzeigen
    app.get('/api/agents', checkAuth, (req, res) => {
        res.json({ agents: getActiveAgents() });
    });

    return { server, app };
}

module.exports = { createServer };
