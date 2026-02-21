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

const SESSIONS_FILE      = path.join(__dirname, '..', 'data', 'sessions.json');
const USER_SETTINGS_FILE = path.join(__dirname, '..', 'data', 'user-settings.json');

function createServer() {
    const app    = express();
    const server = http.createServer(app);
    const wss    = new WebSocket.Server({ server });

    app.use(bodyParser.json({ limit: '10mb' }));
    app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    // ---- Sessions ----
    let activeSessions = new Map();
    function loadSessions() {
        if (fs.existsSync(SESSIONS_FILE)) {
            try { activeSessions = new Map(Object.entries(JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')))); }
            catch(e) { activeSessions = new Map(); }
        }
    }
    function saveSessions() {
        try { fs.writeFileSync(SESSIONS_FILE, JSON.stringify(Object.fromEntries(activeSessions), null, 2), 'utf8'); } catch(e) {}
    }
    loadSessions();

    // ---- User Settings ----
    let userSettings = {};
    function loadUserSettings() {
        if (fs.existsSync(USER_SETTINGS_FILE)) {
            try { const c = fs.readFileSync(USER_SETTINGS_FILE, 'utf8'); if (c.trim()) userSettings = JSON.parse(c); }
            catch(e) { userSettings = {}; }
        }
    }
    function saveUserSettings() {
        fs.writeFileSync(USER_SETTINGS_FILE, JSON.stringify(userSettings, null, 2), 'utf8');
    }
    loadUserSettings();

    // ---- Encryption ----
    function getEncryptionKey() {
        try { return crypto.createHash('sha256').update(getConfig().password || 'default').digest(); }
        catch(e) { return crypto.createHash('sha256').update('default').digest(); }
    }
    function encrypt(text) {
        try {
            if (!text) return '';
            const KEY = getEncryptionKey(), iv = crypto.randomBytes(16);
            const c = crypto.createCipheriv('aes-256-cbc', KEY, iv);
            return iv.toString('hex') + ':' + c.update(text,'utf8','hex') + c.final('hex');
        } catch(e) { return text; }
    }
    function decrypt(text) {
        try {
            if (!text) return '';
            const [ivHex, enc] = text.split(':');
            if (!enc) return text;
            const KEY = getEncryptionKey();
            const dc = crypto.createDecipheriv('aes-256-cbc', KEY, Buffer.from(ivHex,'hex'));
            return dc.update(enc,'hex','utf8') + dc.final('utf8');
        } catch(e) { return text; }
    }

    // ---- WebSocket ----
    const wsClients = new Map();
    wss.on('connection', (ws) => {
        const cid = uuidv4(); wsClients.set(cid, ws);
        ws.on('close', () => wsClients.delete(cid));
    });
    function broadcastLog(sid, msg) {
        wsClients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) try { ws.send(JSON.stringify({type:'log',sessionId:sid,message:msg})); } catch(e){} });
    }
    function broadcastChat(sid, sender, msg) {
        wsClients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) try { ws.send(JSON.stringify({type:'chat',sessionId:sid,sender,message:msg})); } catch(e){} });
    }

    // ---- Auth middleware ----
    function checkSession(req, res, next) {
        const m = (req.headers.cookie || '').match(/session=([^;]+)/);
        if (m && activeSessions.has(m[1])) { req.user = activeSessions.get(m[1]); return next(); }
        res.status(401).json({ error: 'Nicht eingeloggt' });
    }

    // ---- Hilfsfunktionen ----
    function readContextData(cPath) {
        if (!cPath) return '';
        try {
            if (!fs.existsSync(cPath)) return '';
            const st = fs.statSync(cPath);
            if (st.isFile()) return `--- Datei: ${cPath} ---\n${fs.readFileSync(cPath,'utf8').substring(0,15000)}\n`;
            if (st.isDirectory()) {
                let r = `--- Verzeichnis: ${cPath} ---\n`;
                for (const f of fs.readdirSync(cPath).slice(0,8)) {
                    const fp = path.join(cPath,f);
                    if (fs.statSync(fp).isFile()) r += `Datei ${f}:\n${fs.readFileSync(fp,'utf8').substring(0,2000)}\n\n`;
                }
                return r;
            }
        } catch(e) { return `Fehler: ${e.message}`; }
        return '';
    }

    /**
     * Kombiniert alle Kontext-Quellen:
     *  1) Datei/Ordner-Kontext (contextPath)
     *  2) Suchergebnisse (searchContext) ← NEU
     */
    function buildFullContext(contextPath, searchContext) {
        const parts = [];
        const fileCtx = readContextData(contextPath);
        if (fileCtx)   parts.push(fileCtx);
        if (searchContext && searchContext.trim()) {
            // Hinweis für die KI: Sie bekommt echte Suchergebnisse
            parts.push(
                `HINWEIS: Du hast folgende aktuelle Web-Suchergebnisse erhalten.\n` +
                `Nutze diese Informationen um die Frage des Nutzers zu beantworten.\n` +
                `Du brauchst KEINE bash-Befehle auszuführen – beantworte einfach als Text und schreibe am Ende "Fertig!".\n\n` +
                searchContext
            );
        }
        return parts.join('\n\n');
    }

    // =========================================================
    // ROUTEN
    // =========================================================

    app.get('/', (req, res) => {
        const m = (req.headers.cookie || '').match(/session=([^;]+)/);
        res.sendFile(path.join(__dirname, '..', 'public', m && activeSessions.has(m[1]) ? 'index.html' : 'login.html'));
    });

    app.use('/assets', express.static(path.join(__dirname, '..', 'public', 'assets')));

    app.post('/api/login', (req, res) => {
        try {
            const { username, password } = req.body;
            if (!username || !password) return res.status(400).json({ error: 'Username/Password fehlt' });
            const cfg = getConfig();
            if (username === cfg.username && password === cfg.password) {
                const token = uuidv4();
                activeSessions.set(token, { username }); saveSessions();
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
            return res.json({ models: await getAvailableModels(provider, apiKey) });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });

    // ---- Web-Suche (kostenlos, kein API-Key) ----
    app.post('/api/search', checkSession, async (req, res) => {
        try {
            const { query, maxResults = 8 } = req.body;
            if (!query || !query.trim()) return res.status(400).json({ error: 'Kein Suchbegriff' });
            console.log(`[Search] "${query}"`);
            const results   = await webSearch(query.trim(), maxResults);
            const formatted = formatForAI(query.trim(), results);
            return res.json({ success: true, results, formatted, count: results.length });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });

    // ---- User Settings ----
    app.post('/api/user/settings', checkSession, (req, res) => {
        try {
            const { apiKey, provider, model } = req.body;
            const u = req.user.username;
            if (!userSettings[u]) userSettings[u] = { apiKeys:{}, provider:'groq', model:'' };
            if (userSettings[u].apiKey && !userSettings[u].apiKeys) {
                userSettings[u].apiKeys = { [userSettings[u].provider||'groq']: userSettings[u].apiKey };
                delete userSettings[u].apiKey;
            }
            if (!userSettings[u].apiKeys) userSettings[u].apiKeys = {};
            const curProv = provider || userSettings[u].provider || 'groq';
            if (provider !== undefined) userSettings[u].provider = provider;
            if (apiKey   !== undefined) userSettings[u].apiKeys[curProv] = apiKey === '' ? '' : encrypt(apiKey);
            if (model    !== undefined) userSettings[u].model = model || '';
            saveUserSettings();
            return res.json({ success: true });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });

    app.get('/api/user/settings', checkSession, (req, res) => {
        try {
            const s = userSettings[req.user.username] || {};
            const dec = {};
            if (s.apiKeys) for (const [p,k] of Object.entries(s.apiKeys)) dec[p] = k ? decrypt(k) : '';
            else if (s.apiKey) dec[s.provider||'groq'] = decrypt(s.apiKey);
            const prov = s.provider || 'groq';
            return res.json({ apiKeys:dec, apiKey:dec[prov]||'', provider:prov, model:s.model||'' });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });

    // ---- Chat Management ----
    app.get('/api/chats', checkSession, async (req,res) => {
        try { return res.json({ chats: await chatManager.getChatList(req.user.username) }); }
        catch(e) { return res.status(500).json({ error: e.message }); }
    });
    app.get('/api/chats/:id', checkSession, async (req,res) => {
        try {
            const chat = await chatManager.getChat(parseInt(req.params.id), req.user.username);
            if (!chat) return res.status(404).json({ error: 'Nicht gefunden' });
            return res.json({ chat });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });
    app.post('/api/chats/new', checkSession, async (req,res) => {
        try {
            const { title, message, config } = req.body;
            if (!message) return res.status(400).json({ error: 'Nachricht fehlt' });
            const r = await chatManager.createChat(req.user.username, title||'Neuer Chat', message, config);
            return res.json({ success:true, chatId:r.chatId });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });
    app.post('/api/chats/:id/message', checkSession, async (req,res) => {
        try {
            const { message } = req.body;
            if (!message) return res.status(400).json({ error: 'Nachricht fehlt' });
            await chatManager.updateChat(parseInt(req.params.id), req.user.username, message);
            return res.json({ success:true });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });
    app.put('/api/chats/:id/title', checkSession, async (req,res) => {
        try {
            const { title } = req.body;
            if (!title) return res.status(400).json({ error: 'Titel fehlt' });
            await chatManager.updateChatTitle(parseInt(req.params.id), req.user.username, title);
            return res.json({ success:true });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });
    app.delete('/api/chats/:id', checkSession, async (req,res) => {
        try { await chatManager.deleteChat(parseInt(req.params.id), req.user.username); return res.json({ success:true }); }
        catch(e) { return res.status(500).json({ error: e.message }); }
    });
    app.delete('/api/chats', checkSession, async (req,res) => {
        try { const r = await chatManager.deleteAllChats(req.user.username); return res.json({ success:true, deleted:r.deleted }); }
        catch(e) { return res.status(500).json({ error: e.message }); }
    });

    app.post('/api/settings/domain', checkSession, (req,res) => {
        try { const cfg=getConfig(); cfg.domain=req.body.domain||''; saveConfig(cfg); return res.json({success:true}); }
        catch(e) { return res.status(500).json({ error: e.message }); }
    });
    app.get('/api/settings/domain', checkSession, (req,res) => {
        try { return res.json({ domain: getConfig().domain||'' }); }
        catch(e) { return res.status(500).json({ error: e.message }); }
    });

    // ---- Agent Start (BUGFIX: searchContext wird jetzt genutzt!) ----
    app.post('/api/start', checkSession, (req, res) => {
        try {
            const {
                provider, apiKey, directory, prompt,
                contextPath, model, allowRoot, enableWebSearch,
                searchContext   // <-- NEU: Suchergebnisse vom Frontend
            } = req.body;

            // Kombiniert: Datei-Kontext + Suchergebnisse
            const initialContextData = buildFullContext(contextPath, searchContext);

            const sessionId = uuidv4().substring(0, 8).toUpperCase();
            runAgent(
                sessionId,
                {
                    provider, apiKey, model, directory,
                    initialPrompt: prompt,
                    initialContextData,    // Enthält jetzt auch Suchergebnisse!
                    allowRoot,
                    enableWebSearch,
                    hasSearchContext: !!(searchContext && searchContext.trim())
                },
                (msg)         => broadcastLog(sessionId, msg),
                (sender, msg) => broadcastChat(sessionId, sender, msg)
            );
            return res.json({ success: true, sessionId });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });

    // ---- Chat-Nachricht (BUGFIX: searchContext wird jetzt genutzt!) ----
    app.post('/api/chat', checkSession, (req, res) => {
        try {
            const { sessionId, prompt, contextPath, searchContext } = req.body;
            // Kombiniert: Datei-Kontext + Suchergebnisse
            const ctxData = buildFullContext(contextPath, searchContext);
            const ok = sendChatMessage(sessionId, prompt, ctxData);
            return res.json({ success: ok });
        } catch(e) { return res.status(500).json({ error: e.message }); }
    });

    app.post('/api/update', checkSession, (req, res) => {
        exec('bash /opt/ki-agent/update.sh', (err, stdout, stderr) => {
            if (err) return res.status(500).json({ success:false, error:err.message, details:stderr });
            return res.json({ success:true, message:stdout });
        });
    });

    return { server, app };
}

module.exports = { createServer };
