const fetch = require('node-fetch');

/**
 * Ruft das LLM des gew\u00e4hlten Anbieters auf.
 * @param {string} provider - 'openai' | 'groq' | 'claude' | 'openrouter'
 * @param {string} apiKey
 * @param {Array}  messages - OpenAI-Format [{role, content}]
 * @param {string} model    - Modellname (optional, hat Standardwerte)
 * @returns {Promise<string>} - Antwort-Text der KI
 */
async function callLLM(provider, apiKey, messages, model) {
    switch (provider) {
        case 'openai':    return callOpenAI(apiKey, messages, model || 'gpt-4o');
        case 'groq':      return callGroq(apiKey, messages, model || 'llama-3.3-70b-versatile');
        case 'claude':    return callClaude(apiKey, messages, model || 'claude-3-5-sonnet-20241022');
        case 'openrouter':return callOpenRouter(apiKey, messages, model || 'anthropic/claude-3.5-sonnet');
        default:
            throw new Error(`Unbekannter API-Provider: "${provider}". Erlaubt: openai, groq, claude, openrouter`);
    }
}

async function callOpenAI(apiKey, messages, model) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, max_tokens: 2048, temperature: 0.2 })
    });
    const data = await res.json();
    if (data.error) throw new Error(`OpenAI Fehler: ${data.error.message}`);
    return data.choices[0].message.content.trim();
}

async function callGroq(apiKey, messages, model) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, max_tokens: 2048, temperature: 0.2 })
    });
    const data = await res.json();
    if (data.error) throw new Error(`Groq Fehler: ${data.error.message}`);
    return data.choices[0].message.content.trim();
}

async function callClaude(apiKey, messages, model) {
    const systemMsg = messages.find(m => m.role === 'system');
    const userMsgs  = messages.filter(m => m.role !== 'system');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model,
            system: systemMsg ? systemMsg.content : '',
            messages: userMsgs,
            max_tokens: 2048
        })
    });
    const data = await res.json();
    if (data.error) throw new Error(`Claude Fehler: ${data.error.message}`);
    return data.content[0].text.trim();
}

async function callOpenRouter(apiKey, messages, model) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/cali72mero/ki-agent'
        },
        body: JSON.stringify({ model, messages, max_tokens: 2048, temperature: 0.2 })
    });
    const data = await res.json();
    if (data.error) throw new Error(`OpenRouter Fehler: ${data.error.message}`);
    return data.choices[0].message.content.trim();
}

module.exports = { callLLM };
