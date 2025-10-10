import type {VercelRequest, VercelResponse} from '@vercel/node';
import {promises as fs} from 'fs';
import path from 'path';
import {convertContentParts, generateWithRetry} from '../src/ai/gemini-wrapper';

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

function validateAndFixHLTags(content: string): string {
    if (!content || typeof content !== 'string') return content;

    let fixed = content;

    // Count opening and closing tags
    const openTags = (fixed.match(/<HL>/gi) || []).length;
    const closeTags = (fixed.match(/<\/HL>/gi) || []).length;

    // If already balanced, return as-is
    if (openTags === closeTags) return fixed;

    console.warn(`[cite.ts] Unbalanced HL tags detected: ${openTags} opening, ${closeTags} closing. Attempting to fix...`);

    // More opening tags than closing - need to add closing tags or remove opening tags
    if (openTags > closeTags) {
        // Strategy: Find each <HL> and ensure it has a matching </HL> before the next <HL>
        const parts: string[] = [];
        const segments = fixed.split(/(<\/?HL>)/gi);
        let depth = 0;

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];

            if (/<HL>/i.test(segment)) {
                if (depth > 0) {
                    // We're already inside an HL tag, close it first
                    parts.push('</HL>');
                }
                parts.push('<HL>');
                depth = 1;
            } else if (/<\/HL>/i.test(segment)) {
                if (depth > 0) {
                    parts.push('</HL>');
                    depth = 0;
                }
                // If depth is 0, skip this orphaned closing tag
            } else {
                parts.push(segment);
            }
        }

        // Close any remaining open tags
        if (depth > 0) {
            parts.push('</HL>');
        }

        fixed = parts.join('');
    }
    // More closing tags than opening - remove excess closing tags
    else if (closeTags > openTags) {
        const parts: string[] = [];
        const segments = fixed.split(/(<\/?HL>)/gi);
        let depth = 0;

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];

            if (/<HL>/i.test(segment)) {
                parts.push('<HL>');
                depth++;
            } else if (/<\/HL>/i.test(segment)) {
                if (depth > 0) {
                    parts.push('</HL>');
                    depth--;
                }
                // If depth is 0, skip this orphaned closing tag
            } else {
                parts.push(segment);
            }
        }

        fixed = parts.join('');
    }

    console.log(`[cite.ts] Fixed HL tags. Result has ${(fixed.match(/<HL>/gi) || []).length} opening and ${(fixed.match(/<\/HL>/gi) || []).length} closing tags.`);

    return fixed;
}

async function runEvaluation(tagline: string, cite: string, content: string, link: string, apiKey: string): Promise<any | null> {
    try {
        const promptPath = path.resolve(process.cwd(), 'config', 'prompts', 'evidence_evaluator.json');
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

        const userText = `tagline: ${tagline}\ncite: ${cite}\ncontent: ${content}\nlink: ${link}`;
        const contents = convertContentParts([{text: userText}]);

        const raw = await generateWithRetry(contents, systemPrompt, -1, 'gemini-2.5-pro', 2, apiKey);
        const parsed = coerceJson(raw);

        if (!parsed || typeof parsed.score !== 'number' || !parsed.credibility || !parsed.support || !parsed.contradictions) {
            console.warn('[cite.ts] Evaluation returned unexpected format, skipping');
            return null;
        }

        return {
            score: parsed.score,
            credibility: parsed.credibility,
            support: parsed.support,
            contradictions: parsed.contradictions
        };
    } catch (error) {
        console.warn('[cite.ts] Evaluation failed:', error);
        return null;
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
      const {tagline, link, includeEvaluation = true} = (req.body || {}) as {
          tagline?: string;
          link?: string;
          includeEvaluation?: boolean
      };
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

      // Validate and fix HL tags before returning
      const fixedContent = validateAndFixHLTags(parsed.content);

      // Run evaluation in parallel if requested and cite was successful
      let evaluation = null;
      if (includeEvaluation && parsed.status === 'success') {
          evaluation = await runEvaluation(tagline, parsed.cite, fixedContent, link, GEMINI_API_KEY);
      }

      res.status(200).json({
          status: parsed.status,
          cite: parsed.cite,
          content: fixedContent,
          evaluation: evaluation
      });
  } catch (error: any) {
    console.error('Error in /api/cite:', error);
    res.status(200).json({ status: 'fetch_error', cite: '', content: '', error: String(error?.message || error) });
  }
}
