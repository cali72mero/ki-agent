// Web-Search Tool - DuckDuckGo (100% kostenlos, kein API-Key)
const https = require('https');
const http  = require('http');

/**
 * Suche via DuckDuckGo HTML (gratis, kein Key)
 */
function duckduckgoSearch(query, maxResults = 6) {
    return new Promise((resolve) => {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const options = {
            hostname: 'html.duckduckgo.com',
            path: `/html/?q=${encodeURIComponent(query)}`,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8'
            },
            timeout: 8000
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const results = parseDDG(data, maxResults);
                    resolve(results);
                } catch(e) {
                    resolve([]);
                }
            });
        });
        req.on('error', () => resolve([]));
        req.on('timeout', () => { req.destroy(); resolve([]); });
        req.end();
    });
}

function parseDDG(html, max) {
    const results = [];
    // Match result divs
    const blockRe = /<div class="result[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;
    const titleRe = /<a[^>]+class="result__a"[^>]*>([\s\S]*?)<\/a>/;
    const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/;
    const urlRe = /uddg=([^&"]+)/;

    let m;
    while ((m = blockRe.exec(html)) !== null && results.length < max) {
        const block = m[0];
        const tm = titleRe.exec(block);
        const sm = snippetRe.exec(block);
        const um = urlRe.exec(block);
        if (!tm) continue;

        results.push({
            title:   decodeHTML(tm[1].replace(/<[^>]+>/g, '').trim()),
            snippet: sm ? decodeHTML(sm[1].replace(/<[^>]+>/g, '').trim()) : '',
            url:     um ? decodeURIComponent(um[1]) : ''
        });
    }
    return results;
}

/**
 * Fallback: SearXNG öffentliche Instanz (auch gratis)
 */
function searxSearch(query, maxResults = 6) {
    return new Promise((resolve) => {
        const path = `/search?q=${encodeURIComponent(query)}&format=json&language=de`;
        const options = {
            hostname: 'searx.be',
            path,
            method: 'GET',
            headers: { 'User-Agent': 'KI-Agent/1.0', 'Accept': 'application/json' },
            timeout: 8000
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const results = (json.results || []).slice(0, maxResults).map(r => ({
                        title: r.title || '',
                        snippet: r.content || '',
                        url: r.url || ''
                    }));
                    resolve(results);
                } catch(e) { resolve([]); }
            });
        });
        req.on('error', () => resolve([]));
        req.on('timeout', () => { req.destroy(); resolve([]); });
        req.end();
    });
}

/**
 * Hauptfunktion: DuckDuckGo → Fallback SearX
 * @param {string} query
 * @param {number} maxResults
 * @returns {Promise<Array<{title,snippet,url}>>}
 */
async function search(query, maxResults = 6) {
    console.log(`🔍 Web-Suche: "${query}"`);
    let results = await duckduckgoSearch(query, maxResults);
    if (!results || results.length === 0) {
        console.log('🔄 DDG leer, versuche SearX...');
        results = await searxSearch(query, maxResults);
    }
    console.log(`✅ ${results.length} Ergebnisse für "${query}"`);
    return results;
}

/**
 * Formatiert Suchergebnisse für AI-Kontext
 * @param {string} query
 * @param {Array} results
 * @returns {string}
 */
function formatForAI(query, results) {
    if (!results || results.length === 0) {
        return `[Web-Suche: Keine Ergebnisse für "${query}"]`;
    }

    let text = `=== WEB-SUCHE: "${query}" ===\n`;
    text += `Gefunden: ${results.length} Ergebnisse\n\n`;

    results.forEach((r, i) => {
        text += `[${i+1}] ${r.title}\n`;
        if (r.url)     text += `    URL: ${r.url}\n`;
        if (r.snippet) text += `    ${r.snippet}\n`;
        text += '\n';
    });

    text += `=== ENDE WEB-SUCHE ===\n`;
    return text;
}

function decodeHTML(s) {
    return s
        .replace(/&amp;/g,'&')
        .replace(/&lt;/g,'<')
        .replace(/&gt;/g,'>')
        .replace(/&quot;/g,'"')
        .replace(/&#39;/g,"'")
        .replace(/&nbsp;/g,' ');
}

module.exports = { search, formatForAI, duckduckgoSearch, searxSearch };
