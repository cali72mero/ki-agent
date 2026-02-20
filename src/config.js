const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', 'config.json');

function getConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        // Standard-Konfiguration falls config.json noch nicht existiert
        return {
            username: 'admin',
            password: 'changeme123',
            port: 8460
        };
    }
    try {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (e) {
        console.error('Fehler beim Lesen der config.json:', e.message);
        return { username: 'admin', password: 'changeme123', port: 8460 };
    }
}

function saveConfig(data) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}

module.exports = { getConfig, saveConfig };
