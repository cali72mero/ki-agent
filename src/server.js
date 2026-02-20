// Fix: Besseres Error-Handling für /api/user/settings
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

const SESSIONS_FILE = path.join(__dirname, '..', 'data', 'sessions.json');
const USER_SETTINGS_FILE = path.join(__dirname, '..', 'data', 'user-settings.json');
const CHAT_HISTORY_FILE = path.join(__dirname, '..', 'data', 'chat-history.json');

function createServer() {
    const app    = express();
    const server = http.createServer(app);
    const wss    = new WebSocket.Server({ server });

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    let activeSessions = new Map();
    function loadSessions() {
        if (fs.existsSync(SESSIONS_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
                activeSessions = new Map(Object.entries(data));
            } catch(e) { console.error('Fehler beim Laden von Sessions:', e.message); }
        }
    }
    function saveSessions() {
        try {
            const obj = Object.fromEntries(activeSessions);
            fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2));
        } catch(e) { console.error('Fehler beim Speichern von Sessions:', e.message); }
    }
    loadSessions();

    let userSettings = {};
    function loadUserSettings() {
        if (fs.existsSync(USER_SETTINGS_FILE)) {
            try {
                userSettings = JSON.parse(fs.readFileSync(USER_SETTINGS_FILE, 'utf8'));
            } catch(e) { console.error('Fehler beim Laden von User-Settings:', e.message); }
        }
    }
    function saveUserSettings() {
        try {
            fs.writeFileSync(USER_SETTINGS_FILE, JSON.stringify(userSettings, null, 2));
        } catch(e) { console.error('Fehler beim Speichern von User-Settings:', e.message); }
    }
    loadUserSettings();

    let chatHistory = {};
    function loadChatHistory() {
        if (fs.existsSync(CHAT_HISTORY_FILE)) {
            try {
                chatHistory = JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE, 'utf8'));
            } catch(e) { console.error('Fehler beim Laden von Chat-History:', e.message); }
        }
    }
    function saveChatHistory() {
        try {
            fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(chatHistory, null, 2));
        } catch(e) { console.error('Fehler beim Speichern von Chat-History:', e.message); }
    }
    loadChatHistory();

    function getEncryptionKey() {
        try {
            return crypto.createHash('sha256').update(getConfig().password || 'default').digest();
        } catch(e) {
            return crypto.createHash('sha256').update('default').digest();
        }
    }
    
    function encrypt(text) {
        try {
            const ENCRYPTION_KEY = getEncryptionKey();
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            return iv.toString('hex') + ':' + encrypted;
        } catch(e) {
            console.error('Verschlüsselungsfehler:', e.message);
            return text;
        }
    }
    
    function decrypt(text) {
        try {
            const ENCRYPTION_KEY = getEncryptionKey();
            const parts = text.split(':');
            if (parts.length !== 2) return text;
            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = parts[1];
            const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch(e) {
            console.error('Entschlüsselungsfehler:', e.message);
            return text;
        }
    }

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
        if (!chatHistory[sessionId]) chatHistory[sessionId] = [];
        chatHistory[sessionId].push({ sender, message, timestamp: Date.now() });
        saveChatHistory();
    }

    function checkSession(req, res, next) {
        const cookies = req.headers.cookie || '';
        const sessionMatch = cookies.match(/session=([^;]+)/);
        const sessionToken = sessionMatch ? sessionMatch[1] : null;

        if (sessionToken && activeSessions.has(sessionToken)) {
            req.user = activeSessions.get(sessionToken);
            return next();
        }
        res.status(401).json({ error: 'Nicht eingeloggt' });
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
        } catch(e) { return `Fehler: ${e.message}`; }
        return '';
    }

    app.get('/', (req, res) => {
        const cookies = req.headers.cookie || '';
        const sessionMatch = cookies.match(/session=([^;]+)/);
        if (sessionMatch && activeSessions.has(sessionMatch[1])) {
            res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
        } else {
            res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
        }
    });

    app.use('/assets', express.static(path.join(__dirname, '..', 'public', 'assets')));

    app.post('/api/login', (req, res) => {
        try {
            const { username, password } = req.body;
            
            if (!username || !password) {
                return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
            }
            
            const cfg = getConfig();
            
            if (username === cfg.username && password === cfg.password) {
                const sessionToken = uuidv4();
                activeSessions.set(sessionToken, { username });
                saveSessions();
                res.setHeader('Set-Cookie', `session=${sessionToken}; HttpOnly; Path=/; Max-Age=2592000`);
                res.json({ success: true });
            } else {
                res.status(401).json({ error: 'Falscher Benutzername oder Passwort' });
            }
        } catch(e) {
            console.error('Login-Fehler:', e.message);
            res.status(500).json({ error: 'Server-Fehler beim Login' });
        }
    });

    app.post('/api/logout', (req, res) => {
        const cookies = req.headers.cookie || '';
        const sessionMatch = cookies.match(/session=([^;]+)/);
        if (sessionMatch) {
            activeSessions.delete(sessionMatch[1]);
            saveSessions();
        }
        res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0');
        res.json({ success: true });
    });

    app.post('/api/models', checkSession, async (req, res) => {
        try {
            const { provider, apiKey } = req.body;
            if (!provider || !apiKey) {
                return res.status(400).json({ error: 'Provider und API Key erforderlich' });
            }
            const models = await getAvailableModels(provider, apiKey);
            res.json({ models });
        } catch(e) {
            console.error('Fehler beim Abrufen der Modelle:', e.message);
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/user/settings', checkSession, (req, res) => {
        try {
            const { apiKey, provider, model } = req.body;
            const username = req.user.username;
            
            if (!userSettings[username]) userSettings[username] = {};
            
            // Nur speichern wenn Werte vorhanden sind
            if (apiKey !== undefined && apiKey !== '') {
                userSettings[username].apiKey = encrypt(apiKey);
            }
            if (provider !== undefined && provider !== '') {
                userSettings[username].provider = provider;
            }
            if (model !== undefined) {
                userSettings[username].model = model;
            }
            
            saveUserSettings();
            res.json({ success: true });
        } catch(e) {
            console.error('Fehler beim Speichern der User-Settings:', e.message);
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/user/settings', checkSession, (req, res) => {
        const username = req.user.username;
        const settings = userSettings[username] || {};
        
        res.json({
            apiKey: settings.apiKey ? decrypt(settings.apiKey) : '',
            provider: settings.provider || 'groq',
            model: settings.model || ''
        });
    });

    app.get('/api/chat/history/:sessionId', checkSession, (req, res) => {
        const { sessionId } = req.params;
        res.json({ history: chatHistory[sessionId] || [] });
    });

    app.post('/api/settings/domain', checkSession, (req, res) => {
        const { domain } = req.body;
        const cfg = getConfig();
        cfg.domain = domain || '';
        saveConfig(cfg);
        res.json({ success: true });
    });

    app.get('/api/settings/domain', checkSession, (req, res) => {
        const cfg = getConfig();
        res.json({ domain: cfg.domain || '' });
    });

    app.post('/api/start', checkSession, (req, res) => {
        const { provider, apiKey, directory, prompt, contextPath, deadline, model } = req.body;
        
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
            { provider, apiKey, model, directory, initialPrompt: prompt, deadlineMs, initialContextData },
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