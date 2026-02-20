// Chat-Verwaltung mit SQLite
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'chats.db');

// Datenbank initialisieren
function initDatabase() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    const db = new sqlite3.Database(DB_PATH);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            messages TEXT NOT NULL,
            config TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    db.close();
}

initDatabase();

// Neuen Chat erstellen
function createChat(userId, title, firstMessage, config) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);
        const messages = JSON.stringify([firstMessage]);
        const configStr = JSON.stringify(config || {});
        
        db.run(
            'INSERT INTO chats (user_id, title, messages, config) VALUES (?, ?, ?, ?)',
            [userId, title, messages, configStr],
            function(err) {
                db.close();
                if (err) return reject(err);
                resolve({ chatId: this.lastID, title });
            }
        );
    });
}

// Chat-Liste eines Users laden
function getChatList(userId) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);
        
        db.all(
            'SELECT id, title, created_at, updated_at FROM chats WHERE user_id = ? ORDER BY updated_at DESC',
            [userId],
            (err, rows) => {
                db.close();
                if (err) return reject(err);
                resolve(rows || []);
            }
        );
    });
}

// Einzelnen Chat laden
function getChat(chatId, userId) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);
        
        db.get(
            'SELECT * FROM chats WHERE id = ? AND user_id = ?',
            [chatId, userId],
            (err, row) => {
                db.close();
                if (err) return reject(err);
                if (!row) return resolve(null);
                
                resolve({
                    id: row.id,
                    title: row.title,
                    messages: JSON.parse(row.messages),
                    config: JSON.parse(row.config || '{}'),
                    created_at: row.created_at,
                    updated_at: row.updated_at
                });
            }
        );
    });
}

// Chat aktualisieren (neue Nachricht hinzufügen)
function updateChat(chatId, userId, newMessage) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);
        
        // Erst aktuelle Messages laden
        db.get(
            'SELECT messages FROM chats WHERE id = ? AND user_id = ?',
            [chatId, userId],
            (err, row) => {
                if (err || !row) {
                    db.close();
                    return reject(err || new Error('Chat nicht gefunden'));
                }
                
                const messages = JSON.parse(row.messages);
                messages.push(newMessage);
                
                // Aktualisieren
                db.run(
                    'UPDATE chats SET messages = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
                    [JSON.stringify(messages), chatId, userId],
                    (err) => {
                        db.close();
                        if (err) return reject(err);
                        resolve({ success: true });
                    }
                );
            }
        );
    });
}

// Chat-Titel ändern
function updateChatTitle(chatId, userId, newTitle) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);
        
        db.run(
            'UPDATE chats SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
            [newTitle, chatId, userId],
            (err) => {
                db.close();
                if (err) return reject(err);
                resolve({ success: true });
            }
        );
    });
}

// Einzelnen Chat löschen
function deleteChat(chatId, userId) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);
        
        db.run(
            'DELETE FROM chats WHERE id = ? AND user_id = ?',
            [chatId, userId],
            function(err) {
                db.close();
                if (err) return reject(err);
                resolve({ success: true, deleted: this.changes });
            }
        );
    });
}

// Alle Chats eines Users löschen
function deleteAllChats(userId) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);
        
        db.run(
            'DELETE FROM chats WHERE user_id = ?',
            [userId],
            function(err) {
                db.close();
                if (err) return reject(err);
                resolve({ success: true, deleted: this.changes });
            }
        );
    });
}

module.exports = {
    createChat,
    getChatList,
    getChat,
    updateChat,
    updateChatTitle,
    deleteChat,
    deleteAllChats
};