// Update: Server mit Chat-Endpoints und Datei-Leser f\u00fcr Kontext
const express    = require('express');
const bodyParser = require('body-parser');
const http       = require('http');
const WebSocket  = require('ws');
const path       = require('path');
const fs         = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getConfig }  = require('./config');
const { runAgent, sendChatMessage, stopAgent } = require('./agent-loop');

function createServer() {
    const app    = express();
    const server = http.createServer(app);
    const wss    = new WebSocket.Server({ server });

    app.use(bodyParser.json());
    app.use(express.static(path.join(__dirname, '..', 'public')));

    const wsClients = new Map();
    wss.on('connection', (ws) => {
        const cid = uuidv4();
        wsClients.set(cid, ws);
        ws.on('close', () => wsClients.delete(cid));
    });

    function broadcastLog(sessionId, message) {
        wsClients.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'log', sessionId, message }));
        });
    }

    function broadcastChat(sessionId, sender, message) {
        wsClients.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat', sessionId, sender, message }));
        });
    }

    function checkAuth(req, res, next) {
        const cfg = getConfig();
        const b64 = (req.headers.authorization || '').split(' ')[1] || '';
        const [u, p] = Buffer.from(b64, 'base64').toString().split(':');
        if (u === cfg.username && p === cfg.password) return next();
        res.set('WWW-Authenticate', 'Basic realm="KI-Agent"');
        res.status(401).send('Authentifizierung erforderlich.');
    }

    // Liest Dateien/Ordner f\u00fcr die KI, um API Kosten zu sparen (wie bei OpenClaw)
    function readContextData(cPath) {
        if(!cPath) return '';
        try {
            if(!fs.existsSync(cPath)) return '';
            const st = fs.statSync(cPath);
            if(st.isFile()) {
                return `--- Datei: ${cPath} ---\n${fs.readFileSync(cPath, 'utf8').substring(0, 15000)}\n`;
            }
            if(st.isDirectory()) {
                let res = `--- Verzeichnis: ${cPath} ---\n`;
                const files = fs.readdirSync(cPath).slice(0, 8); // Max 8 Dateien um Token zu sparen
                for(let f of files) {
                    const fp = path.join(cPath, f);
                    if(fs.statSync(fp).isFile()) {
                        res += `Datei ${f}:\n${fs.readFileSync(fp, 'utf8').substring(0, 2000)}\n\n`;
                    }
                }
                return res;
            }
        } catch(e) { return `Fehler beim Lesen: ${e.message}`; }
        return '';
    }

    app.post('/api/start', checkAuth, (req, res) => {
        const { provider, apiKey, directory, prompt, contextPath, deadline } = req.body;
        
        let deadlineMs = Date.now() + 8 * 60 * 60 * 1000;
        if(deadline) {
            const [h, m] = deadline.split(':').map(Number);
            const t = new Date(); t.setHours(h, m, 0, 0);
            if(t <= new Date()) t.setDate(t.getDate() + 1);
            deadlineMs = t.getTime();
        }

        const initialContextData = readContextData(contextPath);
        const sessionId = uuidv4().substring(0, 8).toUpperCase();

        runAgent(
            sessionId,
            { provider, apiKey, directory, initialPrompt: prompt, deadlineMs, initialContextData },
            (msg) => broadcastLog(sessionId, msg),
            (sender, msg) => broadcastChat(sessionId, sender, msg)
        );

        res.json({ success: true, sessionId });
    });

    app.post('/api/chat', checkAuth, (req, res) => {
        const { sessionId, prompt, contextPath } = req.body;
        const ctxData = readContextData(contextPath);
        const ok = sendChatMessage(sessionId, prompt, ctxData);
        res.json({ success: ok });
    });

    return { server, app };
}

module.exports = { createServer };