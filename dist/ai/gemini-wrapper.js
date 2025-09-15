"use strict";
// src/ai/gemini-wrapper.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.initGeminiClient = initGeminiClient;
exports.convertContentParts = convertContentParts;
exports.generateWithRetry = generateWithRetry;
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// Detect environment safely without DOM lib types
const isBrowser = typeof globalThis.window !== 'undefined';
let fetchFn = globalThis.fetch ? globalThis.fetch.bind(globalThis) : null;
let apiKeyGlobal = null;
function initGeminiClient(apiKey) {
    apiKeyGlobal = apiKey;
}
function convertContentParts(parts) {
    const userParts = [];
    for (const p of parts) {
        if (p.text)
            userParts.push({ text: p.text });
        else if (p.fileData)
            userParts.push({ fileData: p.fileData });
    }
    return [{ role: 'user', parts: userParts }];
}
async function ensureFetch() {
    if (fetchFn)
        return fetchFn;
    // Node without global fetch: dynamically import node-fetch
    const mod = await Promise.resolve().then(() => __importStar(require('node-fetch')));
    fetchFn = mod.default || mod;
    return fetchFn;
}
async function callGemini(contents, systemPrompt, thinkingBudget, model, apiKey) {
    const key = apiKey || apiKeyGlobal || process?.env?.GEMINI_API_KEY || process?.env?.GOOGLE_API_KEY;
    if (!key)
        throw new Error('Gemini API key not provided. Call initGeminiClient() or pass apiKey.');
    const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(key)}`;
    const body = { contents, generationConfig: {} };
    if (systemPrompt)
        body.systemInstruction = { parts: [{ text: systemPrompt }] };
    if (typeof thinkingBudget === 'number' && thinkingBudget >= 0) {
        body.generationConfig.thinkingConfig = { thinkingBudget };
    }
    // Debug logging
    // eslint-disable-next-line no-console
    console.log('=== Gemini API Request ===');
    // eslint-disable-next-line no-console
    console.log('Model:', model);
    // eslint-disable-next-line no-console
    console.log('System Prompt:', systemPrompt);
    // eslint-disable-next-line no-console
    console.log('Contents:', JSON.stringify(contents, null, 2));
    // eslint-disable-next-line no-console
    console.log('Thinking Budget:', thinkingBudget);
    // eslint-disable-next-line no-console
    console.log('========================');
    const f = await ensureFetch();
    const resp = await f(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) {
        throw new Error(`Gemini API error: ${resp.status} ${JSON.stringify(data)}`);
    }
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    return text;
}
async function generateWithRetry(contents, systemPrompt, thinkingBudget = -1, model = 'gemini-2.5-pro', retries = 3, apiKey) {
    let lastErr;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            return await callGemini(contents, systemPrompt, thinkingBudget, model, apiKey);
        }
        catch (err) {
            lastErr = err;
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
    }
    throw lastErr;
}
