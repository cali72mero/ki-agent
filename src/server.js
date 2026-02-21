// Feature: Chat-Verwaltung mit SQLite & Multi-Provider API-Keys
const express    = require('express');
const bodyParser = require('body-parser');
const http       = require('http');
const WebSocket  = require('ws');
const path       = require('path');
const fs         = require('fs');
const crypto     = require('crypto');
const { exec }   = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { getConfig, saveConfig }  = require('./config');
const { runAgent, sendChatMessage, stopAgent } = require('./agent-loop');
const { getAvailableModels } = require('./api-providers');
const { search: webSearch, formatForAI } = require('./web-search');
const chatManager = require('./chat-manager');

const SESSIONS_FILE = path.join(__dirname, '..', 'data', 'sessions.json');
const USER_SETTINGS_FILE = path.join(__dirname, '..', 'data', 'user-settings.json');

function createServer() {
    const app    = express();
    const server = http.createServer(app);
    const wss    = new WebSocket.Server({ server });

    app.use(bodyParser.json({ limit: '10mb' }));
    app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    let activeSessions = new Map();
    function loadSessions() {
        if (fs.existsSync(SESSIONS_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
                activeSessions = new Map(Object.entries(data));
            } catch(e) { 
                console.error('Session-Load-Error:', e.message);
                activeSessions = new Map();
            }
        }
    }
    function saveSessions() {
        try {
            const obj = Object.fromEntries(activeSessions);
            fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2), 'utf8');
        } catch(e) { 
            console.error('Session-Save-Error:', e.message);
        }
    }
    loadSessions();

    let userSettings = {};
    function loadUserSettings() {
        if (fs.existsSync(USER_SETTINGS_FILE)) {
            try {
                const content = fs.readFileSync(USER_SETTINGS_FILE, 'utf8');
                if (content.trim()) userSettings = JSON.parse(content);
            } catch(e) { 
                console.error('Settings-Load-Error:', e.message);
                userSettings = {};
            }
        }
    }
    function saveUserSettings() {
        try {
            fs.writeFileSync(USER_SETTINGS_FILE, JSON.stringify(userSettings, null, 2), 'utf8');
            return true;
        } catch(e) { 
            console.error('Settings-Save-Error:', e.message);
            throw e;
        }
    }
    loadUserSettings();

    function getEncryptionKey() {
        try {
            return crypto.createHash('sha256').update(getConfig().password || 'default').digest();
        } catch(e) {
            return crypto.createHash('sha256').update('default').digest();
        }
    }
    function encrypt(text) {
        try {
            if (!text || text === '') return '';
            const KEY = getEncryptionKey();
            const iv  = crypto.randomBytes(16);
            const c   = crypto.createCipheriv('aes-256-cbc', KEY, iv);
            let enc   = c.update(text, 'utf8', 'hex');
            enc      += c.final('hex');
            return iv.toString('hex') + ':' + enc;
        } catch(e) { console.error('Encrypt-Error:', e.message); return text; }
    }
    function decrypt(text) {
        try {
            if (!text || text === '') return '';
            const KEY   = getEncryptionKey();
            const parts = text.split(':');
            if (parts.length !== 2) return text;
            const iv  = Buffer.from(parts[0], 'hex');
            const dc  = crypto.createDecipheriv('aes-256-cbc', KEY, iv);
            let dec   = dc.update(parts[1], 'hex', 'utf8');
            dec      += dc.final('utf8');
            return dec;
        } catch(e) { console.error('Decrypt-Error:', e.message); return text; }
    }

    const wsClients = new Map();
    wss.on('connection', (ws) => {
        const cid = uuidv4();
        wsClients.set(cid, ws);
        ws.on('close', () => wsClients.delete(cid));
    });

    function broadcastLog(sessionId, message) {
        wsClients.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                try { ws.send(JSON.stringify({ type: 'log', sessionId, message })); } catch(e) {}
            }
        });
    }
    function broadcastChat(sessionId, sender, message) {
        wsClients.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                try { ws.send(JSON.stringify({ type: 'chat', sessionId, sender, message })); } catch(e) {}
            }
        });
    }

    function checkSession(req, res, next) {
        const cookies      = req.headers.cookie || '';
        const sessionMatch = cookies.match(/session=([^;]+)/);
        const token        = sessionMatch ? sessionMatch[1] : null;
        if (token && activeSessions.has(token)) {
            req.user = activeSessions.get(token);
            return next();
        }
        res.status(401).json({ error: 'Nicht eingeloggt' });
    }

    function readContextData(cPath) {
        if (!cPath) return '';
        try {
            if (!fs.existsSync(cPath)) return '';
            const st = fs.statSync(cPath);
            if (st.isFile()) return `--- Datei: ${cPath} ---\n${fs.readFileSync(cPath, 'utf8').substring(0, 15000)}\n`;
            if (st.isDirectory()) {
                let r = `--- Verzeichnis: ${cPath} ---\n`;
                for (const f of fs.readdirSync(cPath).slice(0, 8)) {
                    const fp = path.join(cPath, f);
                    if (fs.statSync(fp).isFile())
                        r += `Datei ${f}:\n${fs.readFileSync(fp, 'utf8').substring(0, 2000)}\n\n`;
                }
                return r;
            }
        } catch(e) { return `Fehler: ${e.message}`; }
        return '';
    }

    // =========================================================
    // ROUTEN
    // =========================================================

    app.get('/', (req, res) => {
        const cookies      = req.headers.cookie || '';
        const sessionMatch = cookies.match(/session=([^;]+)/);
        if (sessionMatch && activeSessions.has(sessionMatch[1]))
            res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
        else
            res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
    });

    app.use('/assets', express.static(path.join(__dirname, '..', 'public', 'assets')));

    app.post('/api/login', (req, res) => {
        try {
            const { username, password } = req.body;
            if (!username || !password) return res.status(400).json({ error: 'Username/Password fehlt' });
            const cfg = getConfig();
            if (username === cfg.username && password === cfg.password) {
                const token = uuidv4();
                activeSessions.set(token, { username });
                saveSessions();
                res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; Max-Age=2592000`);
                return res.json({ success: true });
            }
            return res.status(401).json({ error: 'Falsche Zugangsdaten' });
        } catch(e) { return res.status(500).json({ error: 'Server-Fehler' }); }
    });

    app.post('/api/logout', (req, res) => {
        try {
            const m = (req.headers.cookie || '').match(/session=([^;]+)/);
            if (m) { activeSessions.delete(m[1]); saveSessions(); }
            res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0');
            return res.json({ success: true });
        } catch(e) { return res.status(500).json({ error: 'Fehler' }); }
    });

    app.post('/api/models', checkSession, async (req, res) => {
        try {
            const { provider, apiKey } = req.body;
            if (!provider || !apiKey) return res.status(400).json({ error: 'Provider/API-Key fehlt' });
            const models = await getAvailableModels(provider, apiKey);
            return res.json({ models });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });

    // -------- WEB-SUCHE ENDPOINT (neu) --------
    // POST /api/search  { query, maxResults? }
    // Führt Suche aus, gibt formatierte Ergebnisse zurück – kein API-Key nötig!
    app.post('/api/search', checkSession, async (req, res) => {
        try {
            const { query, maxResults = 6 } = req.body;
            if (!query || !query.trim()) return res.status(400).json({ error: 'Kein Suchbegriff' });
            console.log(`[Search] "${query}"`);
            const results  = await webSearch(query.trim(), maxResults);
            const formatted = formatForAI(query.trim(), results);
            return res.json({ success: true, results, formatted, count: results.length });
        } catch(e) {
            console.error('Search-Error:', e.message);
            return res.status(500).json({ error: e.message });
        }
    });

    // -------- USER SETTINGS --------
    app.post('/api/user/settings', checkSession, (req, res) => {
        try {
            const { apiKey, provider, model } = req.body;
            const username = req.user.username;
            if (!userSettings[username]) {
                userSettings[username] = { apiKeys: {}, provider: 'groq', model: '' };
            }
            // Abwärtskompatibilität: alter einzelner apiKey → apiKeys[provider]
            if (userSettings[username].apiKey && !userSettings[username].apiKeys) {
                userSettings[username].apiKeys = {};
                userSettings[username].apiKeys[userSettings[username].provider || 'groq'] = userSettings[username].apiKey;
                delete userSettings[username].apiKey;
            }
            if (!userSettings[username].apiKeys) userSettings[username].apiKeys = {};

            const currentProvider = provider || userSettings[username].provider || 'groq';
            if (provider !== undefined) userSettings[username].provider = provider;
            if (apiKey  !== undefined) {
                userSettings[username].apiKeys[currentProvider] = apiKey === '' ? '' : encrypt(apiKey);
            }
            if (model !== undefined) userSettings[username].model = model || '';

            saveUserSettings();
            return res.json({ success: true });
        } catch(e) {
            return res.status(500).json({ error: e.message || 'Fehler' });
        }
    });

    app.get('/api/user/settings', checkSession, (req, res) => {
        try {
            const settings = userSettings[req.user.username] || {};
            let apiKeysDecrypted = {};
            if (settings.apiKeys) {
                for (const [p, k] of Object.entries(settings.apiKeys))
                    apiKeysDecrypted[p] = k ? decrypt(k) : '';
            } else if (settings.apiKey) {
                apiKeysDecrypted[settings.provider || 'groq'] = decrypt(settings.apiKey);
            }
            const currentProvider = settings.provider || 'groq';
            return res.json({
                apiKeys:  apiKeysDecrypted,
                apiKey:   apiKeysDecrypted[currentProvider] || '',
                provider: currentProvider,
                model:    settings.model || ''
            });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });

    // -------- CHAT MANAGEMENT --------
    app.get('/api/chats', checkSession, async (req, res) => {
        try {
            const chats = await chatManager.getChatList(req.user.username);
            return res.json({ chats });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });

    app.get('/api/chats/:id', checkSession, async (req, res) => {
        try {
            const chat = await chatManager.getChat(parseInt(req.params.id), req.user.username);
            if (!chat) return res.status(404).json({ error: 'Nicht gefunden' });
            return res.json({ chat });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });

    app.post('/api/chats/new', checkSession, async (req, res) => {
        try {
            const { title, message, config } = req.body;
            if (!message) return res.status(400).json({ error: 'Nachricht fehlt' });
            const result = await chatManager.createChat(req.user.username, title || 'Neuer Chat', message, config);
            return res.json({ success: true, chatId: result.chatId });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });

    app.post('/api/chats/:id/message', checkSession, async (req, res) => {
        try {
            const { message } = req.body;
            if (!message) return res.status(400).json({ error: 'Nachricht fehlt' });
            await chatManager.updateChat(parseInt(req.params.id), req.user.username, message);
            return res.json({ success: true });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });

    app.put('/api/chats/:id/title', checkSession, async (req, res) => {
        try {
            const { title } = req.body;
            if (!title) return res.status(400).json({ error: 'Titel fehlt' });
            await chatManager.updateChatTitle(parseInt(req.params.id), req.user.username, title);
            return res.json({ success: true });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });

    app.delete('/api/chats/:id', checkSession, async (req, res) => {
        try {
            await chatManager.deleteChat(parseInt(req.params.id), req.user.username);
            return res.json({ success: true });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });

    app.delete('/api/chats', checkSession, async (req, res) => {
        try {
            const result = await chatManager.deleteAllChats(req.user.username);
            return res.json({ success: true, deleted: result.deleted });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });

    app.post('/api/settings/domain', checkSession, (req, res) => {
        try {
            const cfg = getConfig(); cfg.domain = req.body.domain || ''; saveConfig(cfg);
            return res.json({ success: true });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });

    app.get('/api/settings/domain', checkSession, (req, res) => {
        try {
            return res.json({ domain: getConfig().domain || '' });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });

    // -------- AGENT START --------
    app.post('/api/start', checkSession, (req, res) => {
        try {
            const { provider, apiKey, directory, prompt, contextPath, model, allowRoot, enableWebSearch } = req.body;
            const initialContextData = readContextData(contextPath);
            const sessionId = uuidv4().substring(0, 8).toUpperCase();
            runAgent(
                sessionId,
                { provider, apiKey, model, directory, initialPrompt: prompt, initialContextData, allowRoot, enableWebSearch },
                (msg)         => broadcastLog(sessionId, msg),
                (sender, msg) => broadcastChat(sessionId, sender, msg)
            );
            return res.json({ success: true, sessionId });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });

    app.post('/api/chat', checkSession, (req, res) => {
        try {
            const { sessionId, prompt, contextPath } = req.body;
            const ctxData = readContextData(contextPath);
            const ok = sendChatMessage(sessionId, prompt, ctxData);
            return res.json({ success: ok });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });

    app.post('/api/update', checkSession, (req, res) => {
        exec('bash /opt/ki-agent/update.sh', (err, stdout, stderr) => {
            if (err) return res.status(500).json({ success: false, error: err.message, details: stderr });
            return res.json({ success: true, message: stdout });
        });
    });

    return { server, app };
}

module.exports = { createServer };
