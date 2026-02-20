#!/usr/bin/env node

const { createServer } = require('./src/server');
const { getConfig } = require('./src/config');

const config = getConfig();
const PORT = process.env.PORT || config.port || 8460;

const { server } = createServer();

server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('\u256c\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d');
    console.log('\u2551        \ud83e\udd16  KI-Agent Server               \u2551');
    console.log(`\u2551   L\u00e4uft auf: http://0.0.0.0:${PORT}         \u2551`);
    console.log(`\u2551   Login: ${config.username} / [dein passwort]        \u2551`);
    console.log('\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d');
    console.log('');
    console.log(`\u2714 Web-Interface: http://0.0.0.0:${PORT}`);
    console.log('\u2714 Aus dem Internet erreichbar (Port in Firewall freigeben!)');
    console.log('');
});
