// Feature: Chat-Verwaltung mit SQLite
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
                if (content.trim()) {
                    userSettings = JSON.parse(content);
                }
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
            const ENCRYPTION_KEY = getEncryptionKey();
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            return iv.toString('hex') + ':' + encrypted;
        } catch(e) {
            console.error('Encrypt-Error:', e.message);
            return text;
        }
    }
    
    function decrypt(text) {
        try {
            if (!text || text === '') return '';
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
            console.error('Decrypt-Error:', e.message);
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
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(JSON.stringify({ type: 'log', sessionId, message }));
                } catch(e) {}
            }
        });
    }

    function broadcastChat(sessionId, sender, message) {
        wsClients.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(JSON.stringify({ type: 'chat', sessionId, sender, message }));
                } catch(e) {}
            }
        });
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
        } catch(e) { 
            return `Fehler: ${e.message}`; 
        }
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
                return res.status(400).json({ error: 'Username/Password fehlt' });
            }
            
            const cfg = getConfig();
            
            if (username === cfg.username && password === cfg.password) {
                const sessionToken = uuidv4();
                activeSessions.set(sessionToken, { username });
                saveSessions();
                res.setHeader('Set-Cookie', `session=${sessionToken}; HttpOnly; Path=/; Max-Age=2592000`);
                return res.json({ success: true });
            } else {
                return res.status(401).json({ error: 'Falsche Zugangsdaten' });
            }
        } catch(e) {
            console.error('Login-Error:', e.message);
            return res.status(500).json({ error: 'Server-Fehler' });
        }
    });

    app.post('/api/logout', (req, res) => {
        try {
            const cookies = req.headers.cookie || '';
            const sessionMatch = cookies.match(/session=([^;]+)/);
            if (sessionMatch) {
                activeSessions.delete(sessionMatch[1]);
                saveSessions();
            }
            res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0');
            return res.json({ success: true });
        } catch(e) {
            return res.status(500).json({ error: 'Fehler' });
        }
    });

    app.post('/api/models', checkSession, async (req, res) => {
        try {
            const { provider, apiKey } = req.body;
            if (!provider || !apiKey) {
                return res.status(400).json({ error: 'Provider/API-Key fehlt' });
            }
            const models = await getAvailableModels(provider, apiKey);
            return res.json({ models });
        } catch(e) {
            console.error('Models-Error:', e.message);
            return res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/user/settings', checkSession, (req, res) => {
        try {
            console.log('POST /api/user/settings - Body:', JSON.stringify(req.body));
            
            const { apiKey, provider, model } = req.body;
            const username = req.user.username;
            
            if (apiKey === undefined && provider === undefined && model === undefined) {
                console.log('400: Keine Daten im Request');
                return res.status(400).json({ error: 'Keine Daten gesendet' });
            }
            
            if (!userSettings[username]) {
                userSettings[username] = {};
            }
            
            if (apiKey !== undefined) {
                if (apiKey === '') {
                    userSettings[username].apiKey = '';
                } else {
                    userSettings[username].apiKey = encrypt(apiKey);
                }
            }
            
            if (provider !== undefined) {
                userSettings[username].provider = provider || 'groq';
            }
            
            if (model !== undefined) {
                userSettings[username].model = model || '';
            }
            
            saveUserSettings();
            console.log('Settings gespeichert für:', username);
            
            return res.json({ success: true });
        } catch(e) {
            console.error('Settings-Save-Error:', e.message, e.stack);
            return res.status(500).json({ error: e.message || 'Unbekannter Fehler' });
        }
    });

    app.get('/api/user/settings', checkSession, (req, res) => {
        try {
            const username = req.user.username;
            const settings = userSettings[username] || {};
            
            return res.json({
                apiKey: settings.apiKey ? decrypt(settings.apiKey) : '',
                provider: settings.provider || 'groq',
                model: settings.model || ''
            });
        } catch(e) {
            console.error('Settings-Load-Error:', e.message);
            return res.status(500).json({ error: e.message });
        }
    });

    // === CHAT MANAGEMENT ENDPOINTS ===
    
    // Chat-Liste laden
    app.get('/api/chats', checkSession, async (req, res) => {
        try {
            const username = req.user.username;
            const chats = await chatManager.getChatList(username);
            return res.json({ chats });
        } catch(e) {
            console.error('Chat-List-Error:', e.message);
            return res.status(500).json({ error: e.message });
        }
    });
    
    // Einzelnen Chat laden
    app.get('/api/chats/:id', checkSession, async (req, res) => {
        try {
            const username = req.user.username;
            const chatId = parseInt(req.params.id);
            const chat = await chatManager.getChat(chatId, username);
            
            if (!chat) {
                return res.status(404).json({ error: 'Chat nicht gefunden' });
            }
            
            return res.json({ chat });
        } catch(e) {
            console.error('Chat-Load-Error:', e.message);
            return res.status(500).json({ error: e.message });
        }
    });
    
    // Neuen Chat erstellen
    app.post('/api/chats/new', checkSession, async (req, res) => {
        try {
            const username = req.user.username;
            const { title, message, config } = req.body;
            
            if (!message) {
                return res.status(400).json({ error: 'Nachricht fehlt' });
            }
            
            const chatTitle = title || 'Neuer Chat';
            const result = await chatManager.createChat(username, chatTitle, message, config);
            
            return res.json({ success: true, chatId: result.chatId });
        } catch(e) {
            console.error('Chat-Create-Error:', e.message);
            return res.status(500).json({ error: e.message });
        }
    });
    
    // Nachricht zu Chat hinzufügen
    app.post('/api/chats/:id/message', checkSession, async (req, res) => {
        try {
            const username = req.user.username;
            const chatId = parseInt(req.params.id);
            const { message } = req.body;
            
            if (!message) {
                return res.status(400).json({ error: 'Nachricht fehlt' });
            }
            
            await chatManager.updateChat(chatId, username, message);
            
            return res.json({ success: true });
        } catch(e) {
            console.error('Chat-Update-Error:', e.message);
            return res.status(500).json({ error: e.message });
        }
    });
    
    // Chat-Titel ändern
    app.put('/api/chats/:id/title', checkSession, async (req, res) => {
        try {
            const username = req.user.username;
            const chatId = parseInt(req.params.id);
            const { title } = req.body;
            
            if (!title) {
                return res.status(400).json({ error: 'Titel fehlt' });
            }
            
            await chatManager.updateChatTitle(chatId, username, title);
            
            return res.json({ success: true });
        } catch(e) {
            console.error('Chat-Title-Error:', e.message);
            return res.status(500).json({ error: e.message });
        }
    });
    
    // Einzelnen Chat löschen
    app.delete('/api/chats/:id', checkSession, async (req, res) => {
        try {
            const username = req.user.username;
            const chatId = parseInt(req.params.id);
            
            await chatManager.deleteChat(chatId, username);
            
            return res.json({ success: true });
        } catch(e) {
            console.error('Chat-Delete-Error:', e.message);
            return res.status(500).json({ error: e.message });
        }
    });
    
    // Alle Chats löschen
    app.delete('/api/chats', checkSession, async (req, res) => {
        try {
            const username = req.user.username;
            const result = await chatManager.deleteAllChats(username);
            
            return res.json({ success: true, deleted: result.deleted });
        } catch(e) {
            console.error('Chats-Delete-All-Error:', e.message);
            return res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/settings/domain', checkSession, (req, res) => {
        try {
            const { domain } = req.body;
            const cfg = getConfig();
            cfg.domain = domain || '';
            saveConfig(cfg);
            return res.json({ success: true });
        } catch(e) {
            return res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/settings/domain', checkSession, (req, res) => {
        try {
            const cfg = getConfig();
            return res.json({ domain: cfg.domain || '' });
        } catch(e) {
            return res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/start', checkSession, (req, res) => {
        try {
            const { provider, apiKey, directory, prompt, contextPath, model, allowRoot } = req.body;

            const initialContextData = readContextData(contextPath);
            const sessionId = uuidv4().substring(0, 8).toUpperCase();

            runAgent(
                sessionId,
                { provider, apiKey, model, directory, initialPrompt: prompt, initialContextData, allowRoot },
                (msg) => broadcastLog(sessionId, msg),
                (sender, msg) => broadcastChat(sessionId, sender, msg)
            );

            return res.json({ success: true, sessionId });
        } catch(e) {
            console.error('Start-Error:', e.message);
            return res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/chat', checkSession, (req, res) => {
        try {
            const { sessionId, prompt, contextPath } = req.body;
            const ctxData = readContextData(contextPath);
            const ok = sendChatMessage(sessionId, prompt, ctxData);
            return res.json({ success: ok });
        } catch(e) {
            return res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/update', checkSession, (req, res) => {
        exec('bash /opt/ki-agent/update.sh', (err, stdout, stderr) => {
            if (err) {
                return res.status(500).json({ success: false, error: err.message, details: stderr });
            }
            return res.json({ success: true, message: stdout });
        });
    });

    return { server, app };
}

module.exports = { createServer };