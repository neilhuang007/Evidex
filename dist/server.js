"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const gemini_wrapper_1 = require("./ai/gemini-wrapper");
const wordHandler_1 = require("./exporters/wordHandler");
// Vercel provides env vars via process.env; prefer GEMINI_API_KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
if (!GEMINI_API_KEY) {
    console.warn('Warning: No Gemini API key found in GEMINI_API_KEY. /api/cite will return fetch_error until configured.');
}
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Serve static assets from project root, not dist
app.use(express_1.default.static(path_1.default.join(process.cwd(), 'public')));
// New endpoint: cite evidence using minimal schema { status, cite, content }
app.post('/api/cite', async (req, res) => {
    try {
        const { link, tagline } = req.body || {};
        if (!link || !tagline) {
            return res.status(200).json({ status: 'fetch_error', cite: '', content: '', error: 'tagline and link are required' });
        }
        if (!GEMINI_API_KEY) {
            return res.status(200).json({ status: 'fetch_error', cite: '', content: '', error: 'Server missing GEMINI_API_KEY' });
        }
        // Load the minimal prompt
        // Load prompt from project root, not dist
        const promptPath = path_1.default.resolve(process.cwd(), 'config', 'prompts', 'card_cutter.json');
        const promptRaw = await fs_1.promises.readFile(promptPath, 'utf8');
        const prompt = JSON.parse(promptRaw);
        const schemaText = JSON.stringify(prompt.outputSchema);
        const shotsText = Array.isArray(prompt.shots)
            ? prompt.shots
                .map((s, i) => `Example ${i + 1}\nInput:\n${JSON.stringify(s.input)}\nOutput:\n${JSON.stringify(s.output)}`)
                .join('\n\n')
            : '';
        const systemPrompt = [
            prompt.system || '',
            prompt.instructions || '',
            'Return JSON only. Match this JSON schema exactly:',
            schemaText,
            shotsText ? `\nFew-shot examples:\n${shotsText}` : ''
        ].join('\n\n');
        const userText = `tagline: ${tagline}\nlink: ${link}`;
        const contents = (0, gemini_wrapper_1.convertContentParts)([{ text: userText }]);
        const raw = await (0, gemini_wrapper_1.generateWithRetry)(contents, systemPrompt, -1, 'gemini-2.5-pro', 2, GEMINI_API_KEY);
        const parsed = coerceJson(raw);
        if (!parsed || typeof parsed.status !== 'string' || typeof parsed.cite !== 'string' || typeof parsed.content !== 'string') {
            return res.status(200).json({ status: 'fetch_error', cite: '', content: '', error: 'Model returned unexpected format' });
        }
        return res.status(200).json({ status: parsed.status, cite: parsed.cite, content: parsed.content });
    }
    catch (error) {
        console.error('Error in /api/cite:', error);
        res.status(200).json({ status: 'fetch_error', cite: '', content: '', error: String(error?.message || error) });
    }
});
function coerceJson(text) {
    if (!text)
        return null;
    try {
        return JSON.parse(text);
    }
    catch { }
    // ```json ... ``` fenced
    const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(text);
    if (fenced && fenced[1]) {
        try {
            return JSON.parse(fenced[1]);
        }
        catch { }
    }
    // Braces slice
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) {
        const slice = text.slice(first, last + 1);
        try {
            return JSON.parse(slice);
        }
        catch { }
    }
    return null;
}
app.post('/api/download-docx', async (req, res) => {
    try {
        const { tagline, link, cite, content } = req.body || {};
        if (!tagline || !link || !cite || !content) {
            return res.status(400).json({ error: 'tagline, link, cite, and content are required' });
        }
        const taggedBlock = `
[TAGLINE]${tagline}[/TAGLINE]
[LINK]${link}[/LINK]

[CITE]${cite}[/CITE]

${content}
`.trim();
        const nodes = (0, wordHandler_1.parseTagged)(taggedBlock);
        const buffer = await (0, wordHandler_1.renderDocxBuffer)(nodes);
        const safe = (s) => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'card';
        const fileName = `${safe(cite)}_${Date.now()}.docx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(buffer);
    }
    catch (error) {
        console.error('Error generating document:', error);
        res.status(500).json({ error: 'Failed to generate document' });
    }
});
// Bulk download: accept multiple cards and compile into one .docx
app.post('/api/download-docx-bulk', async (req, res) => {
    try {
        const { cards } = req.body || {};
        if (!Array.isArray(cards) || cards.length === 0) {
            return res.status(400).json({ error: 'cards[] required' });
        }
        const blocks = [];
        for (const c of cards) {
            const tagline = (c?.tagline ?? '').toString();
            const link = (c?.link ?? '').toString();
            const cite = (c?.cite ?? '').toString();
            const content = (c?.content ?? '').toString();
            blocks.push(`
[TAGLINE]${tagline}[/TAGLINE]
[LINK]${link}[/LINK]

[CITE]${cite}[/CITE]

${content}
`.trim());
        }
        const tagged = blocks.join('\n\n\n'); // Extra blank line between cards
        const nodes = (0, wordHandler_1.parseTagged)(tagged);
        const buffer = await (0, wordHandler_1.renderDocxBuffer)(nodes);
        const fileName = `cards_${Date.now()}.docx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(buffer);
    }
    catch (error) {
        console.error('Error generating bulk document:', error);
        res.status(500).json({ error: 'Failed to generate document' });
    }
});
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Serve index.html for any other GET route (SPA fallback)
app.get('*', (req, res) => {
    res.sendFile(path_1.default.join(process.cwd(), 'public', 'index.html'));
});
app.listen(PORT, () => {
    console.log(`✨ AI Card Cutter server running at http://localhost:${PORT}`);
    console.log(`📝 Open http://localhost:${PORT} in your browser to use the app`);
});
