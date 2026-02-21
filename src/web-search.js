// Web-Search Tool - Kostenlose DuckDuckGo Suche
const https = require('https');
const { URL } = require('url');

/**
 * Suche im Internet via DuckDuckGo (KOSTENLOS!)
 * @param {string} query - Suchbegriff
 * @param {number} maxResults - Anzahl Ergebnisse (Standard: 5)
 * @returns {Promise<Array>} - Array mit {title, url, snippet}
 */
async function search(query, maxResults = 5) {
    try {
        console.log(`🔍 Web-Suche: "${query}"`);
        
        // DuckDuckGo HTML-Suche (ohne API-Key!)
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        
        const html = await httpsGet(searchUrl);
        const results = parseResults(html, maxResults);
        
        console.log(`✅ ${results.length} Ergebnisse gefunden`);
        return results;
        
    } catch (error) {
        console.error('❌ Web-Suche fehlgeschlagen:', error.message);
        return [];
    }
}

/**
 * HTTP GET Request
 */
function httpsGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

/**
 * Parse DuckDuckGo HTML Results
 */
function parseResults(html, maxResults) {
    const results = [];
    
    // Regex für Result-Blöcke
    const resultRegex = /<div class="result[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g;
    const titleRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/;
    const snippetRegex = /<a class="result__snippet"[^>]*>([^<]+)<\/a>/;
    
    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
        const block = match[1];
        
        const titleMatch = titleRegex.exec(block);
        const snippetMatch = snippetRegex.exec(block);
        
        if (titleMatch) {
            results.push({
                title: decodeHTML(titleMatch[2].trim()),
                url: titleMatch[1],
                snippet: snippetMatch ? decodeHTML(snippetMatch[1].trim()) : ''
            });
        }
    }
    
    return results;
}

/**
 * Decode HTML Entities
 */
function decodeHTML(text) {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

/**
 * Suche + Formatierung für AI
 * @param {string} query - Suchbegriff
 * @returns {Promise<string>} - Formatierte Ergebnisse
 */
async function searchAndFormat(query) {
    const results = await search(query, 5);
    
    if (results.length === 0) {
        return `Keine Ergebnisse für "${query}" gefunden.`;
    }
    
    let formatted = `🔍 Web-Suche: "${query}"\n\n`;
    
    results.forEach((result, i) => {
        formatted += `${i + 1}. **${result.title}**\n`;
        formatted += `   URL: ${result.url}\n`;
        if (result.snippet) {
            formatted += `   ${result.snippet}\n`;
        }
        formatted += '\n';
    });
    
    return formatted;
}

/**
 * Alternative: Searx Metasearch (falls DuckDuckGo blockiert)
 */
async function searxSearch(query, maxResults = 5) {
    try {
        // Öffentliche Searx-Instanz
        const apiUrl = `https://searx.be/search?q=${encodeURIComponent(query)}&format=json`;
        const response = await httpsGetJSON(apiUrl);
        
        return response.results.slice(0, maxResults).map(r => ({
            title: r.title,
            url: r.url,
            snippet: r.content || ''
        }));
    } catch (error) {
        console.error('❌ Searx-Suche fehlgeschlagen:', error.message);
        return [];
    }
}

function httpsGetJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

module.exports = {
    search,
    searchAndFormat,
    searxSearch
};