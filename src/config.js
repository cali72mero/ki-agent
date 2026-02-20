// Update: Standard-Port auf 80 geändert
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', 'config.json');

function getConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        return { username: 'admin', password: 'changeme123', port: 80 };
    }
    try {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (e) {
        return { username: 'admin', password: 'changeme123', port: 80 };
    }
}

function saveConfig(data) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}

module.exports = { getConfig, saveConfig };