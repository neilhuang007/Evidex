import type { VercelRequest, VercelResponse } from '@vercel/node';
import { promises as fs } from 'fs';
import path from 'path';
import { convertContentParts, generateWithRetry } from '../src/ai/gemini-wrapper';

function coerceJson(text: string): any | null {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(text);
  if (fenced && fenced[1]) { try { return JSON.parse(fenced[1]); } catch {} }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) { try { return JSON.parse(text.slice(first, last + 1)); } catch {} }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { tagline, link } = (req.body || {}) as { tagline?: string; link?: string };
    if (!tagline || !link) {
      res.status(200).json({ status: 'fetch_error', cite: '', content: '', error: 'tagline and link are required' });
      return;
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
    if (!GEMINI_API_KEY) {
      res.status(200).json({ status: 'fetch_error', cite: '', content: '', error: 'Server missing GEMINI_API_KEY' });
      return;
    }

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
      res.status(200).json({ status: 'fetch_error', cite: '', content: '', error: 'Model returned unexpected format' });
      return;
    }
    res.status(200).json({ status: parsed.status, cite: parsed.cite, content: parsed.content });
  } catch (error: any) {
    console.error('Error in /api/cite:', error);
    res.status(200).json({ status: 'fetch_error', cite: '', content: '', error: String(error?.message || error) });
  }
}
