// Update: Funktion zum Abrufen verfügbarer Modelle hinzugefügt
const fetch = require('node-fetch');

async function callLLM(provider, apiKey, messages, model) {
    switch (provider) {
        case 'openai':     return callOpenAI(apiKey, messages, model || 'gpt-4o');
        case 'groq':       return callGroq(apiKey, messages, model || 'llama-3.3-70b-versatile');
        case 'claude':     return callClaude(apiKey, messages, model || 'claude-3-5-sonnet-20241022');
        case 'openrouter': return callOpenRouter(apiKey, messages, model || 'anthropic/claude-3.5-sonnet');
        case 'gemini':     return callGemini(apiKey, messages, model || 'gemini-2.0-flash-exp');
        case 'mistral':    return callMistral(apiKey, messages, model || 'mistral-large-latest');
        case 'cohere':     return callCohere(apiKey, messages, model || 'command-r-plus');
        case 'xai':        return callXAI(apiKey, messages, model || 'grok-2-latest');
        case 'deepseek':   return callDeepSeek(apiKey, messages, model || 'deepseek-chat');
        default: throw new Error(`Unbekannter Provider: ${provider}`);
    }
}

// NEUE FUNKTION: Verfügbare Modelle abrufen
async function getAvailableModels(provider, apiKey) {
    try {
        switch (provider) {
            case 'openai':     return await getOpenAIModels(apiKey);
            case 'groq':       return await getGroqModels(apiKey);
            case 'claude':     return getClaudeModels();
            case 'openrouter': return await getOpenRouterModels(apiKey);
            case 'gemini':     return getGeminiModels();
            case 'mistral':    return await getMistralModels(apiKey);
            case 'cohere':     return getCohere();
            case 'xai':        return getXAIModels();
            case 'deepseek':   return getDeepSeekModels();
            default: return [];
        }
    } catch(e) {
        console.error(`Fehler beim Abrufen der Modelle für ${provider}:`, e.message);
        return [];
    }
}

async function getOpenAIModels(apiKey) {
    const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.data
        .filter(m => m.id.includes('gpt'))
        .map(m => ({ id: m.id, name: m.id }));
}

async function getGroqModels(apiKey) {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.data.map(m => ({ id: m.id, name: m.id }));
}

function getClaudeModels() {
    return [
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Neueste)' },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (Schnell)' },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus (Mächtig)' }
    ];
}

async function getOpenRouterModels(apiKey) {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const data = await res.json();
    return data.data.map(m => ({ 
        id: m.id, 
        name: `${m.name} ($${m.pricing.prompt}/1M tokens)`,
        free: m.pricing.prompt === '0'
    }));
}

function getGeminiModels() {
    return [
        { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Schnell)' }
    ];
}

async function getMistralModels(apiKey) {
    const res = await fetch('https://api.mistral.ai/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const data = await res.json();
    return data.data.map(m => ({ id: m.id, name: m.id }));
}

function getCohere() {
    return [
        { id: 'command-r-plus', name: 'Command R+' },
        { id: 'command-r', name: 'Command R' },
        { id: 'command', name: 'Command' }
    ];
}

function getXAIModels() {
    return [
        { id: 'grok-2-latest', name: 'Grok 2 (Neueste)' },
        { id: 'grok-2-1212', name: 'Grok 2 (12/12/2024)' },
        { id: 'grok-beta', name: 'Grok Beta' }
    ];
}

function getDeepSeekModels() {
    return [
        { id: 'deepseek-chat', name: 'DeepSeek Chat' },
        { id: 'deepseek-coder', name: 'DeepSeek Coder' }
    ];
}

async function callOpenAI(apiKey, messages, model) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, max_tokens: 3000, temperature: 0.2 })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content.trim();
}

async function callGroq(apiKey, messages, model) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, max_tokens: 3000, temperature: 0.2 })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content.trim();
}

async function callClaude(apiKey, messages, model) {
    const systemMsg = messages.find(m => m.role === 'system');
    const userMsgs  = messages.filter(m => m.role !== 'system');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, system: systemMsg ? systemMsg.content : '', messages: userMsgs, max_tokens: 3000 })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.content[0].text.trim();
}

async function callOpenRouter(apiKey, messages, model) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://github.com/cali72mero/ki-agent' },
        body: JSON.stringify({ model, messages, max_tokens: 3000, temperature: 0.2 })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content.trim();
}

async function callGemini(apiKey, messages, model) {
    const contents = messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));
    
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates[0].content.parts[0].text.trim();
}

async function callMistral(apiKey, messages, model) {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, max_tokens: 3000, temperature: 0.2 })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content.trim();
}

async function callCohere(apiKey, messages, model) {
    const lastMsg = messages[messages.length - 1].content;
    const history = messages.slice(0, -1).map(m => ({
        role: m.role === 'assistant' ? 'CHATBOT' : 'USER',
        message: m.content
    }));
    
    const res = await fetch('https://api.cohere.ai/v1/chat', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, message: lastMsg, chat_history: history, max_tokens: 3000, temperature: 0.2 })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.text.trim();
}

async function callXAI(apiKey, messages, model) {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, max_tokens: 3000, temperature: 0.2 })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content.trim();
}

async function callDeepSeek(apiKey, messages, model) {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, max_tokens: 3000, temperature: 0.2 })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content.trim();
}

module.exports = { callLLM, getAvailableModels };