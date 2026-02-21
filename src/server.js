// KI-Agent Server - Chat + Multi-Provider + Web-Suche
const express  = require('express');
const http     = require('http');
const WebSocket = require('ws');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { getConfig, saveConfig }  = require('./config');
const { runAgent, sendChatMessage, stopAgent } = require('./agent-loop');
const { getAvailableModels } = require('./api-providers');
const { search: webSearch, formatForAI } = require('./web-search');
const chatManager = require('./chat-manager');

const SESSIONS_FILE      = path.join(__dirname, '..', 'data', 'sessions.json');
const USER_SETTINGS_FILE = path.join(__dirname, '..', 'data', 'user-settings.json');

// === Such-Kontext Cache (serverseitig) ===
const searchContextCache = new Map();
function storeSearchContext(formatted) {
    const id = uuidv4().replace(/-/g, '').substring(0, 12);
    searchContextCache.set(id, { formatted, ts: Date.now() });
    for (const [k, v] of searchContextCache.entries())
        if (Date.now() - v.ts > 600000) searchContextCache.delete(k);
    return id;
}
function getSearchContext(id) {
    return id ? (searchContextCache.get(id)?.formatted || '') : '';
}

function createServer() {
    const app    = express();
    const server = http.createServer(app);
    const wss    = new WebSocket.Server({ server });

    // ================================================================
    // DIAGNOSE-MIDDLEWARE: Loggt JEDEN Request VOR allem anderen
    // Auch body-parser Fehler werden hier sichtbar
    // ================================================================
    app.use((req, res, next) => {
        const cookie = req.headers.cookie ? req.headers.cookie.substring(0, 40) + '...' : 'none';
        console.log(`[REQ] ${req.method} ${req.path} | cookie: ${cookie} | content-type: ${req.headers['content-type'] || 'none'} | content-length: ${req.headers['content-length'] || '0'}`);
        next();
    });

    // Cache-Control fuer alle /api Responses (verhindert Browser/NGINX Caching)
    app.use('/api', (req, res, next) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        next();
    });

    // JSON Body-Parser
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    // ---- Sessions ----
    let activeSessions = new Map();
    function loadSessions() {
        if (fs.existsSync(SESSIONS_FILE)) {
            try { activeSessions = new Map(Object.entries(JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')))); }
            catch(e) { console.error('[Sessions] Ladefehler:', e.message); activeSessions = new Map(); }
        }
    }
    function saveSessions() {
        try { fs.writeFileSync(SESSIONS_FILE, JSON.stringify(Object.fromEntries(activeSessions), null, 2), 'utf8'); } catch(e) {}
    }
    loadSessions();
    console.log(`[Sessions] ${activeSessions.size} Session(s) geladen`);

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

    // ---- Crypto ----
    function getKey() {
        try { return crypto.createHash('sha256').update(getConfig().password || 'default').digest(); }
        catch(e) { return crypto.createHash('sha256').update('default').digest(); }
    }
    function encrypt(t) {
        try { if (!t) return ''; const iv = crypto.randomBytes(16), c = crypto.createCipheriv('aes-256-cbc', getKey(), iv); return iv.toString('hex') + ':' + c.update(t,'utf8','hex') + c.final('hex'); }
        catch(e) { return t; }
    }
    function decrypt(t) {
        try { if (!t) return ''; const [h, e] = t.split(':'); if (!e) return t; const d = crypto.createDecipheriv('aes-256-cbc', getKey(), Buffer.from(h,'hex')); return d.update(e,'hex','utf8') + d.final('utf8'); }
        catch(e) { return t; }
    }

    // ---- WebSocket ----
    const wsClients = new Map();
    wss.on('connection', (ws) => {
        const cid = uuidv4(); wsClients.set(cid, ws);
        ws.on('close', () => wsClients.delete(cid));
    });
    const bLog  = (sid, msg)         => wsClients.forEach(ws => { if (ws.readyState===1) try{ws.send(JSON.stringify({type:'log',sessionId:sid,message:msg}));}catch(e){} });
    const bChat = (sid, sender, msg) => wsClients.forEach(ws => { if (ws.readyState===1) try{ws.send(JSON.stringify({type:'chat',sessionId:sid,sender,message:msg}));}catch(e){} });

    // ---- Auth (mit Logging) ----
    function checkSession(req, res, next) {
        const m     = (req.headers.cookie||'').match(/session=([^;]+)/);
        const token = m ? m[1] : null;
        const valid = !!(token && activeSessions.has(token));
        console.log(`[Auth] ${req.method} ${req.path} | token: ${token ? token.substring(0,8)+'...' : 'KEIN'} | valid: ${valid} | sessions: ${activeSessions.size}`);
        if (valid) { req.user = activeSessions.get(token); return next(); }
        console.log(`[Auth] REJECT -> 401`);
        return res.status(401).json({ error: 'Nicht eingeloggt' });
    }

    // ---- Context helpers ----
    function readFileCtx(cPath) {
        if (!cPath) return '';
        try {
            if (!fs.existsSync(cPath)) return '';
            const st = fs.statSync(cPath);
            if (st.isFile()) return `--- Datei: ${cPath} ---\n${fs.readFileSync(cPath,'utf8').substring(0,15000)}\n`;
            if (st.isDirectory()) {
                let r = `--- Verzeichnis: ${cPath} ---\n`;
                for (const f of fs.readdirSync(cPath).slice(0,8)) {
                    const fp = path.join(cPath,f);
                    if (fs.statSync(fp).isFile()) r += `${f}:\n${fs.readFileSync(fp,'utf8').substring(0,2000)}\n\n`;
                }
                return r;
            }
        } catch(e) { return `Fehler: ${e.message}`; }
        return '';
    }

    function buildCtx(contextPath, ctxId) {
        const parts = [];
        const f = readFileCtx(contextPath);
        if (f) parts.push(f);
        const s = getSearchContext(ctxId);
        if (s) {
            parts.push(
                'HINWEIS F\u00dcR KI: Du hast folgende aktuelle Web-Suchergebnisse.\n' +
                'Nutze diese Informationen um die Frage zu beantworten.\n' +
                'Antworte als normaler Text, kein Bash n\u00f6tig. Schreibe am Ende "Fertig!".\n\n' + s
            );
        }
        return parts.join('\n\n');
    }

    // =========================================================
    // ROUTES
    // =========================================================

    // ---- DIAGNOSE (kein Auth!) ----
    app.get('/api/ping', (req, res) => {
        res.json({
            ok:      true,
            time:    new Date().toISOString(),
            method:  req.method,
            path:    req.path,
            sessions: activeSessions.size,
            cookie:  req.headers.cookie ? req.headers.cookie.substring(0, 60) + '...' : 'none',
            headers: {
                host:           req.headers.host,
                'content-type': req.headers['content-type'] || 'none',
                'x-forwarded-for': req.headers['x-forwarded-for'] || 'none'
            }
        });
    });

    app.get('/', (req, res) => {
        const m = (req.headers.cookie||'').match(/session=([^;]+)/);
        res.sendFile(path.join(__dirname,'..','public', m&&activeSessions.has(m[1]) ? 'index.html' : 'login.html'));
    });
    app.use('/assets', express.static(path.join(__dirname,'..','public','assets')));

    app.post('/api/login', (req, res) => {
        try {
            const { username, password } = req.body;
            if (!username||!password) return res.status(400).json({error:'Username/Password fehlt'});
            const cfg = getConfig();
            if (username===cfg.username && password===cfg.password) {
                const token = uuidv4();
                activeSessions.set(token,{username}); saveSessions();
                res.setHeader('Set-Cookie',`session=${token}; HttpOnly; Path=/; Max-Age=2592000`);
                return res.json({success:true});
            }
            return res.status(401).json({error:'Falsche Zugangsdaten'});
        } catch(e) { return res.status(500).json({error:'Server-Fehler'}); }
    });

    app.post('/api/logout', (req, res) => {
        const m = (req.headers.cookie||'').match(/session=([^;]+)/);
        if (m) { activeSessions.delete(m[1]); saveSessions(); }
        res.setHeader('Set-Cookie','session=; HttpOnly; Path=/; Max-Age=0');
        res.json({success:true});
    });

    app.post('/api/models', checkSession, async (req, res) => {
        try {
            const {provider,apiKey} = req.body;
            if (!provider||!apiKey) return res.status(400).json({error:'Provider/Key fehlt'});
            return res.json({models: await getAvailableModels(provider,apiKey)});
        } catch(e) { return res.status(500).json({error:e.message}); }
    });

    // -------- WEB-SUCHE --------
    app.post('/api/search', checkSession, async (req, res) => {
        try {
            const { query, maxResults = 6 } = req.body;
            if (!query||!query.trim()) return res.status(400).json({error:'Kein Suchbegriff'});
            console.log(`[Search] "${query}"`);
            const results   = await webSearch(query.trim(), maxResults);
            const formatted = formatForAI(query.trim(), results);
            const ctxId = storeSearchContext(formatted);
            console.log(`[Search] ctxId=${ctxId}, ${results.length} Ergebnisse, ${formatted.length} Bytes`);
            return res.json({ success:true, ctxId, count:results.length, bytes:formatted.length });
        } catch(e) {
            console.error('[Search Error]', e.message);
            return res.status(500).json({error:e.message});
        }
    });

    // -------- USER SETTINGS --------
    app.post('/api/user/settings', checkSession, (req, res) => {
        try {
            const {apiKey,provider,model} = req.body;
            const u = req.user.username;
            if (!userSettings[u]) userSettings[u] = {apiKeys:{},provider:'groq',model:''};
            if (userSettings[u].apiKey && !userSettings[u].apiKeys) {
                userSettings[u].apiKeys = {[userSettings[u].provider||'groq']:userSettings[u].apiKey};
                delete userSettings[u].apiKey;
            }
            if (!userSettings[u].apiKeys) userSettings[u].apiKeys = {};
            const p = provider||userSettings[u].provider||'groq';
            if (provider!==undefined) userSettings[u].provider = provider;
            if (apiKey!==undefined)   userSettings[u].apiKeys[p] = apiKey==='' ? '' : encrypt(apiKey);
            if (model!==undefined)    userSettings[u].model = model||'';
            saveUserSettings();
            return res.json({success:true});
        } catch(e) { return res.status(500).json({error:e.message}); }
    });

    app.get('/api/user/settings', checkSession, (req, res) => {
        try {
            const s = userSettings[req.user.username]||{};
            const dec = {};
            if (s.apiKeys) for (const [p,k] of Object.entries(s.apiKeys)) dec[p]=k?decrypt(k):'';
            else if (s.apiKey) dec[s.provider||'groq']=decrypt(s.apiKey);
            const p = s.provider||'groq';
            return res.json({apiKeys:dec,apiKey:dec[p]||'',provider:p,model:s.model||''});
        } catch(e) { return res.status(500).json({error:e.message}); }
    });

    // -------- CHAT MANAGEMENT --------
    app.get('/api/chats', checkSession, async (req,res) => {
        console.log(`[Chats] GET - user: ${req.user?.username}`);
        try { 
            const chats = await chatManager.getChatList(req.user.username);
            console.log(`[Chats] OK - ${chats.length} Chats`);
            return res.json({chats});
        }
        catch(e) { 
            console.error('[Chats] FEHLER:', e.message);
            return res.status(500).json({error:e.message}); 
        }
    });
    app.get('/api/chats/:id', checkSession, async (req,res) => {
        try {
            const c = await chatManager.getChat(parseInt(req.params.id),req.user.username);
            return c ? res.json({chat:c}) : res.status(404).json({error:'Nicht gefunden'});
        } catch(e) { return res.status(500).json({error:e.message}); }
    });
    app.post('/api/chats/new', checkSession, async (req,res) => {
        try {
            const {title,message,config} = req.body;
            if (!message) return res.status(400).json({error:'Nachricht fehlt'});
            const r = await chatManager.createChat(req.user.username,title||'Neuer Chat',message,config);
            return res.json({success:true,chatId:r.chatId});
        } catch(e) { return res.status(500).json({error:e.message}); }
    });
    app.post('/api/chats/:id/message', checkSession, async (req,res) => {
        try {
            if (!req.body.message) return res.status(400).json({error:'Nachricht fehlt'});
            await chatManager.updateChat(parseInt(req.params.id),req.user.username,req.body.message);
            return res.json({success:true});
        } catch(e) { return res.status(500).json({error:e.message}); }
    });
    app.put('/api/chats/:id/title', checkSession, async (req,res) => {
        try {
            if (!req.body.title) return res.status(400).json({error:'Titel fehlt'});
            await chatManager.updateChatTitle(parseInt(req.params.id),req.user.username,req.body.title);
            return res.json({success:true});
        } catch(e) { return res.status(500).json({error:e.message}); }
    });
    app.delete('/api/chats/:id', checkSession, async (req,res) => {
        try { await chatManager.deleteChat(parseInt(req.params.id),req.user.username); return res.json({success:true}); }
        catch(e) { return res.status(500).json({error:e.message}); }
    });
    app.delete('/api/chats', checkSession, async (req,res) => {
        try { const r = await chatManager.deleteAllChats(req.user.username); return res.json({success:true,deleted:r.deleted}); }
        catch(e) { return res.status(500).json({error:e.message}); }
    });

    app.post('/api/settings/domain', checkSession, (req,res) => {
        try { const cfg=getConfig(); cfg.domain=req.body.domain||''; saveConfig(cfg); return res.json({success:true}); }
        catch(e) { return res.status(500).json({error:e.message}); }
    });
    app.get('/api/settings/domain', checkSession, (req,res) => {
        try { return res.json({domain:getConfig().domain||''}); }
        catch(e) { return res.status(500).json({error:e.message}); }
    });

    // -------- AGENT START --------
    app.post('/api/start', checkSession, (req, res) => {
        try {
            console.log('[/api/start] body:', JSON.stringify({
                provider: req.body?.provider,
                model:    req.body?.model,
                prompt:   (req.body?.prompt||'').substring(0,50),
                ctxId:    req.body?.ctxId
            }));

            const { provider, apiKey, directory, prompt, contextPath, model, allowRoot, enableWebSearch, ctxId } = req.body;

            if (!provider) return res.status(400).json({error:'Provider fehlt'});
            if (!prompt)   return res.status(400).json({error:'Prompt fehlt'});

            const fullCtx = buildCtx(contextPath, ctxId);
            const sessionId = uuidv4().substring(0,8).toUpperCase();
            runAgent(
                sessionId,
                { provider, apiKey, model, directory, initialPrompt:prompt, initialContextData:fullCtx,
                  allowRoot, enableWebSearch, hasSearchContext: !!(ctxId && searchContextCache.has(ctxId)) },
                (msg)         => bLog(sessionId, msg),
                (sender, msg) => bChat(sessionId, sender, msg)
            );
            return res.json({success:true, sessionId});
        } catch(e) {
            console.error('[/api/start Error]', e.message, e.stack);
            return res.status(500).json({error:e.message});
        }
    });

    // -------- CHAT NACHRICHT --------
    app.post('/api/chat', checkSession, (req, res) => {
        try {
            const { sessionId, prompt, contextPath, ctxId } = req.body;
            const ctxData = buildCtx(contextPath, ctxId);
            const ok = sendChatMessage(sessionId, prompt, ctxData);
            return res.json({success:ok});
        } catch(e) { return res.status(500).json({error:e.message}); }
    });

    app.post('/api/update', checkSession, (req,res) => {
        require('child_process').exec('bash /opt/ki-agent/update.sh', (err,stdout,stderr) => {
            if (err) return res.status(500).json({success:false,error:err.message,details:stderr});
            return res.json({success:true,message:stdout});
        });
    });

    // -------- GLOBALER FEHLER-HANDLER --------
    app.use((err, req, res, next) => {
        console.error('[Express Fehler]', err.type||'', err.status||500, err.message);
        const status = err.status || err.statusCode || 500;
        const msg    = err.type === 'entity.parse.failed'
            ? `JSON Parse-Fehler: ${err.message}` : (err.message || 'Unbekannter Fehler');
        return res.status(status).json({error: msg});
    });

    return { server, app };
}

module.exports = { createServer };
