// Update: Session-basiertes Login-System mit Cookie-Support
const express    = require('express');
const bodyParser = require('body-parser');
const http       = require('http');
const WebSocket  = require('ws');
const path       = require('path');
const fs         = require('fs');
const { exec }   = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { getConfig, saveConfig }  = require('./config');
const { runAgent, sendChatMessage, stopAgent } = require('./agent-loop');

function createServer() {
    const app    = express();
    const server = http.createServer(app);
    const wss    = new WebSocket.Server({ server });

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

    // Session-Speicher (im RAM, geht bei Neustart verloren - absichtlich für Sicherheit)
    const activeSessions = new Map();

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

    // Session-Cookie prüfen
    function checkSession(req, res, next) {
        const cookies = req.headers.cookie || '';
        const sessionMatch = cookies.match(/session=([^;]+)/);
        const sessionToken = sessionMatch ? sessionMatch[1] : null;

        if (sessionToken && activeSessions.has(sessionToken)) {
            req.user = activeSessions.get(sessionToken);
            return next();
        }
        res.status(401).json({ error: 'Nicht eingeloggt. Bitte anmelden.' });
    }

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
                const files = fs.readdirSync(cPath).slice(0, 8);
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

    // Login-Seite (statisch)
    app.get('/', (req, res) => {
        const cookies = req.headers.cookie || '';
        const sessionMatch = cookies.match(/session=([^;]+)/);
        if (sessionMatch && activeSessions.has(sessionMatch[1])) {
            // Bereits eingeloggt -> Zeige Interface
            res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
        } else {
            // Nicht eingeloggt -> Zeige Login
            res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
        }
    });

    // Statische Assets (CSS, JS) ohne Auth
    app.use('/assets', express.static(path.join(__dirname, '..', 'public', 'assets')));

    // Login-Endpoint
    app.post('/api/login', (req, res) => {
        const { username, password } = req.body;
        const cfg = getConfig();

        if (username === cfg.username && password === cfg.password) {
            const sessionToken = uuidv4();
            activeSessions.set(sessionToken, { username });
            res.setHeader('Set-Cookie', `session=${sessionToken}; HttpOnly; Path=/; Max-Age=86400`);
            res.json({ success: true });
        } else {
            res.status(401).json({ error: 'Falscher Benutzername oder Passwort' });
        }
    });

    // Logout-Endpoint
    app.post('/api/logout', (req, res) => {
        const cookies = req.headers.cookie || '';
        const sessionMatch = cookies.match(/session=([^;]+)/);
        if (sessionMatch) activeSessions.delete(sessionMatch[1]);
        res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0');
        res.json({ success: true });
    });

    // Domain-Einstellung speichern
    app.post('/api/settings/domain', checkSession, (req, res) => {
        const { domain } = req.body;
        const cfg = getConfig();
        cfg.domain = domain || '';
        saveConfig(cfg);
        res.json({ success: true });
    });

    // Domain abrufen
    app.get('/api/settings/domain', checkSession, (req, res) => {
        const cfg = getConfig();
        res.json({ domain: cfg.domain || '' });
    });

    app.post('/api/start', checkSession, (req, res) => {
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

    app.post('/api/chat', checkSession, (req, res) => {
        const { sessionId, prompt, contextPath } = req.body;
        const ctxData = readContextData(contextPath);
        const ok = sendChatMessage(sessionId, prompt, ctxData);
        res.json({ success: ok });
    });

    app.post('/api/update', checkSession, (req, res) => {
        exec('bash /opt/ki-agent/update.sh', (err, stdout, stderr) => {
            if (err) {
                return res.status(500).json({ success: false, error: err.message, details: stderr });
            }
            res.json({ success: true, message: stdout });
        });
    });

    return { server, app };
}

module.exports = { createServer };