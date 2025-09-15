// src/ai/gemini-wrapper.ts

// Minimal, SDK-free Gemini API wrapper compatible with Node runtimes
// that do not include DOM types. Uses fetch if available, and falls back
// to dynamic import of node-fetch only when necessary.

// Minimal API shapes we need
export type Part = { text?: string; inlineData?: unknown; fileData?: { mimeType: string; fileUri: string } };
export type Content = { role?: 'user' | 'model' | 'system'; parts: Part[] };

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Detect environment safely without DOM lib types
const isBrowser = typeof (globalThis as any).window !== 'undefined';
let fetchFn: any = (globalThis as any).fetch ? (globalThis as any).fetch.bind(globalThis) : null;

let apiKeyGlobal: string | null = null;

export function initGeminiClient(apiKey: string) {
  apiKeyGlobal = apiKey;
}

export function convertContentParts(
  parts: Array<{ text?: string; fileData?: { mimeType: string; fileUri: string } }>
): Content[] {
  const userParts: Part[] = [];
  for (const p of parts) {
    if (p.text) userParts.push({ text: p.text });
    else if (p.fileData) userParts.push({ fileData: p.fileData });
  }
  return [{ role: 'user', parts: userParts }];
}

async function ensureFetch(): Promise<any> {
  if (fetchFn) return fetchFn;
  // Node without global fetch: dynamically import node-fetch
  const mod = await import('node-fetch');
  fetchFn = (mod as any).default || (mod as any);
  return fetchFn;
}

async function callGemini(
  contents: Content[],
  systemPrompt: string,
  thinkingBudget: number,
  model: string,
  apiKey?: string
): Promise<string> {
  const key = apiKey || apiKeyGlobal || (process as any)?.env?.GEMINI_API_KEY || (process as any)?.env?.GOOGLE_API_KEY;
  if (!key) throw new Error('Gemini API key not provided. Call initGeminiClient() or pass apiKey.');

  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const body: any = { contents, generationConfig: {} };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
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
  } as any);

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Gemini API error: ${resp.status} ${JSON.stringify(data)}`);
  }
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
  return text;
}

export async function generateWithRetry(
  contents: Content[],
  systemPrompt: string,
  thinkingBudget = -1,
  model = 'gemini-2.5-pro',
  retries = 3,
  apiKey?: string
): Promise<string> {
  let lastErr: any;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await callGemini(contents, systemPrompt, thinkingBudget, model, apiKey);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}
