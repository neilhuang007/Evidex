import express from 'express';
import cors from 'cors';
import path from 'path';
import { promises as fs } from 'fs';
import { convertContentParts, generateWithRetry } from './ai/gemini-wrapper';
import { parseTagged, renderDocxBuffer } from './exporters/wordHandler';

// Vercel provides env vars via process.env; prefer GEMINI_API_KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
if (!GEMINI_API_KEY) {
  console.warn('Warning: No Gemini API key found in GEMINI_API_KEY. /api/cite will return fetch_error until configured.');
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// Serve static assets from project root, not dist
app.use(express.static(path.join(process.cwd(), 'public')));

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
    const promptPath = path.resolve(process.cwd(), 'config', 'prompts', 'card_cutter.json');
    const promptRaw = await fs.readFile(promptPath, 'utf8');
    const prompt = JSON.parse(promptRaw);

    const schemaText = JSON.stringify(prompt.outputSchema);
    const shotsText = Array.isArray(prompt.shots)
      ? prompt.shots
          .map((s: any, i: number) => `Example ${i + 1}\nInput:\n${JSON.stringify(s.input)}\nOutput:\n${JSON.stringify(s.output)}`)
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
    const contents = convertContentParts([{ text: userText }]);

    const raw = await generateWithRetry(contents, systemPrompt, -1, 'gemini-2.5-pro', 2, GEMINI_API_KEY);
    const parsed = coerceJson(raw);
    if (!parsed || typeof parsed.status !== 'string' || typeof parsed.cite !== 'string' || typeof parsed.content !== 'string') {
      return res.status(200).json({ status: 'fetch_error', cite: '', content: '', error: 'Model returned unexpected format' });
    }
    return res.status(200).json({ status: parsed.status, cite: parsed.cite, content: parsed.content });
  } catch (error: any) {
    console.error('Error in /api/cite:', error);
    res.status(200).json({ status: 'fetch_error', cite: '', content: '', error: String(error?.message || error) });
  }
});

function coerceJson(text: string): any | null {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  // ```json ... ``` fenced
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(text);
  if (fenced && fenced[1]) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  // Braces slice
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const slice = text.slice(first, last + 1);
    try { return JSON.parse(slice); } catch {}
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

    const nodes = parseTagged(taggedBlock);
    const buffer = await renderDocxBuffer(nodes);

    const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'card';
    const fileName = `${safe(cite)}_${Date.now()}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (error) {
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

    const blocks: string[] = [];
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
    const nodes = parseTagged(tagged);
    const buffer = await renderDocxBuffer(nodes);

    const fileName = `cards_${Date.now()}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error generating bulk document:', error);
    res.status(500).json({ error: 'Failed to generate document' });
  }
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve index.html for any other GET route (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`✨ AI Card Cutter server running at http://localhost:${PORT}`);
    console.log(`📝 Open http://localhost:${PORT} in your browser to use the app`);
});
