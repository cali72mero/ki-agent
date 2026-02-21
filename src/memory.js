// Memory System - Agent lernt über Zeit
// Nutzt sqlite3 (bereits installiert)
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'memory.db');

if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

// Tabellen erstellen
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL UNIQUE,
            value TEXT NOT NULL,
            context TEXT DEFAULT '',
            category TEXT DEFAULT 'general',
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            accessed_at INTEGER DEFAULT (strftime('%s', 'now')),
            access_count INTEGER DEFAULT 0
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_key ON memories(key)');
    db.run('CREATE INDEX IF NOT EXISTS idx_category ON memories(category)');
});

/**
 * Speichere Erinnerung
 */
function remember(key, value, context = '', category = 'general') {
    return new Promise((resolve) => {
        db.run(
            `INSERT INTO memories (key, value, context, category)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET
               value = excluded.value,
               context = excluded.context,
               category = excluded.category,
               accessed_at = strftime('%s', 'now')`,
            [key, value, context, category],
            (err) => {
                if (err) console.error('Memory save failed:', err.message);
                else console.log(`🧠 Memory saved: ${key}`);
                resolve(!err);
            }
        );
    });
}

/**
 * Abrufen einer Erinnerung
 */
function recall(key) {
    return new Promise((resolve) => {
        db.get('SELECT * FROM memories WHERE key = ?', [key], (err, row) => {
            if (err || !row) return resolve(null);
            db.run(
                `UPDATE memories SET accessed_at = strftime('%s', 'now'), access_count = access_count + 1 WHERE key = ?`,
                [key]
            );
            console.log(`🧠 Memory recalled: ${key}`);
            resolve(row);
        });
    });
}

/**
 * Suche nach Erinnerungen
 */
function search(query, limit = 10) {
    return new Promise((resolve) => {
        const q = `%${query}%`;
        db.all(
            `SELECT * FROM memories
             WHERE key LIKE ? OR value LIKE ? OR context LIKE ?
             ORDER BY access_count DESC, accessed_at DESC
             LIMIT ?`,
            [q, q, q, limit],
            (err, rows) => {
                if (err) return resolve([]);
                resolve(rows || []);
            }
        );
    });
}

/**
 * Lösche Erinnerung
 */
function forget(key) {
    return new Promise((resolve) => {
        db.run('DELETE FROM memories WHERE key = ?', [key], (err) => {
            if (!err) console.log(`🧠 Memory forgotten: ${key}`);
            resolve(!err);
        });
    });
}

/**
 * Alle Memories einer Kategorie
 */
function getByCategory(category) {
    return new Promise((resolve) => {
        db.all(
            'SELECT * FROM memories WHERE category = ? ORDER BY accessed_at DESC',
            [category],
            (err, rows) => resolve(err ? [] : (rows || []))
        );
    });
}

/**
 * Memory Context für AI generieren
 */
async function generateContext(query) {
    const relevant = await search(query, 5);
    if (relevant.length === 0) return '';

    let context = '\n--- Relevante Erinnerungen ---\n';
    relevant.forEach(mem => {
        context += `• ${mem.key}: ${mem.value}\n`;
        if (mem.context) context += `  Context: ${mem.context}\n`;
    });
    context += '--- Ende Erinnerungen ---\n\n';
    return context;
}

module.exports = {
    remember,
    recall,
    search,
    forget,
    getByCategory,
    generateContext
};
