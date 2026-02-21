// Memory System - Agent lernt über Zeit
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'memory.db');

// Sicherstellen dass data/ existiert
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Tabellen erstellen
db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        context TEXT,
        category TEXT DEFAULT 'general',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        accessed_at INTEGER DEFAULT (strftime('%s', 'now')),
        access_count INTEGER DEFAULT 0
    );
    
    CREATE INDEX IF NOT EXISTS idx_key ON memories(key);
    CREATE INDEX IF NOT EXISTS idx_category ON memories(category);
    CREATE INDEX IF NOT EXISTS idx_accessed ON memories(accessed_at DESC);
`);

/**
 * Speichere Erinnerung
 * @param {string} key - Schlüssel (z.B. "user_coding_style")
 * @param {string} value - Wert
 * @param {string} context - Kontext (optional)
 * @param {string} category - Kategorie (optional)
 */
function remember(key, value, context = '', category = 'general') {
    try {
        // Check ob bereits existiert
        const existing = db.prepare('SELECT id FROM memories WHERE key = ?').get(key);
        
        if (existing) {
            // Update
            db.prepare(`
                UPDATE memories 
                SET value = ?, context = ?, category = ?, accessed_at = strftime('%s', 'now')
                WHERE key = ?
            `).run(value, context, category, key);
            console.log(`🧠 Memory updated: ${key}`);
        } else {
            // Insert
            db.prepare(`
                INSERT INTO memories (key, value, context, category)
                VALUES (?, ?, ?, ?)
            `).run(key, value, context, category);
            console.log(`🧠 Memory saved: ${key}`);
        }
        
        return true;
    } catch (error) {
        console.error('❌ Memory save failed:', error.message);
        return false;
    }
}

/**
 * Abrufen einer Erinnerung
 * @param {string} key - Schlüssel
 * @returns {object|null} - {key, value, context, category, created_at}
 */
function recall(key) {
    try {
        const memory = db.prepare(`
            SELECT * FROM memories WHERE key = ?
        `).get(key);
        
        if (memory) {
            // Update access stats
            db.prepare(`
                UPDATE memories 
                SET accessed_at = strftime('%s', 'now'), access_count = access_count + 1
                WHERE key = ?
            `).run(key);
            
            console.log(`🧠 Memory recalled: ${key}`);
            return memory;
        }
        
        return null;
    } catch (error) {
        console.error('❌ Memory recall failed:', error.message);
        return null;
    }
}

/**
 * Suche nach Erinnerungen (Fuzzy Search)
 * @param {string} query - Suchbegriff
 * @param {number} limit - Max Ergebnisse
 * @returns {Array} - Gefundene Memories
 */
function search(query, limit = 10) {
    try {
        const results = db.prepare(`
            SELECT * FROM memories 
            WHERE key LIKE ? OR value LIKE ? OR context LIKE ?
            ORDER BY access_count DESC, accessed_at DESC
            LIMIT ?
        `).all(`%${query}%`, `%${query}%`, `%${query}%`, limit);
        
        console.log(`🔍 Memory search: "${query}" (${results.length} results)`);
        return results;
    } catch (error) {
        console.error('❌ Memory search failed:', error.message);
        return [];
    }
}

/**
 * Lösche Erinnerung
 * @param {string} key - Schlüssel
 */
function forget(key) {
    try {
        db.prepare('DELETE FROM memories WHERE key = ?').run(key);
        console.log(`🧠 Memory forgotten: ${key}`);
        return true;
    } catch (error) {
        console.error('❌ Memory forget failed:', error.message);
        return false;
    }
}

/**
 * Alle Memories einer Kategorie
 * @param {string} category - Kategorie
 * @returns {Array}
 */
function getByCategory(category) {
    try {
        return db.prepare(`
            SELECT * FROM memories 
            WHERE category = ?
            ORDER BY accessed_at DESC
        `).all(category);
    } catch (error) {
        console.error('❌ Get by category failed:', error.message);
        return [];
    }
}

/**
 * Memory-Statistiken
 * @returns {object} - {total, categories, most_accessed}
 */
function stats() {
    try {
        const total = db.prepare('SELECT COUNT(*) as count FROM memories').get().count;
        
        const categories = db.prepare(`
            SELECT category, COUNT(*) as count 
            FROM memories 
            GROUP BY category
        `).all();
        
        const mostAccessed = db.prepare(`
            SELECT key, value, access_count 
            FROM memories 
            ORDER BY access_count DESC 
            LIMIT 10
        `).all();
        
        return {
            total,
            categories,
            most_accessed: mostAccessed
        };
    } catch (error) {
        console.error('❌ Memory stats failed:', error.message);
        return { total: 0, categories: [], most_accessed: [] };
    }
}

/**
 * Memory Context für AI generieren
 * @param {string} query - User-Query
 * @returns {string} - Relevanter Memory-Context
 */
function generateContext(query) {
    const relevant = search(query, 5);
    
    if (relevant.length === 0) {
        return '';
    }
    
    let context = '\n--- Relevante Erinnerungen ---\n';
    relevant.forEach(mem => {
        context += `• ${mem.key}: ${mem.value}\n`;
        if (mem.context) {
            context += `  Context: ${mem.context}\n`;
        }
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
    stats,
    generateContext
};