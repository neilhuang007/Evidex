// Start the server, then run node tests/smoke-api.mjs [--live].
// --live makes two small billed DeepSeek calls, including one fetched article.
import 'dotenv/config';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';

const base = (process.env.EVIDEX_API_URL || 'http://localhost:3001').replace(/\/$/, '');
const token = process.env.EVIDEX_AGENT_API_TOKEN;
assert.ok(token, 'EVIDEX_AGENT_API_TOKEN is required');
const output = new URL('../.smoke-output/', import.meta.url);
await mkdir(output, {recursive: true});

async function post(route, body, authenticated = false) {
  return fetch(`${base}${route}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', ...(authenticated ? {Authorization: `Bearer ${token}`} : {})},
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000)
  });
}

const health = await (await fetch(`${base}/api/health`)).json();
assert.equal(health.status, 'ok');
assert.equal(health.ai.provider, 'deepseek');
const sourceText = 'This is a synthetic test article. Accurate card cutting preserves the original wording and highlights the selected passage.';
const input = {
  tagline: 'Card cutting preserves exact wording',
  sourceText,
  citation: 'Synthetic fixture, 2026',
  markdownContent: 'Accurate card cutting **preserves the original wording** and highlights the selected passage.'
};

assert.equal((await post('/api/cards', input)).status, 401);
const response = await post('/api/cards', input, true);
const result = await response.json();
assert.equal(response.status, 200, JSON.stringify(result));
assert.equal(result.meta.mode, 'normalized');
assert.equal(result.meta.usage, null);
assert.ok(result.card.content.includes('<HL>preserves the original wording</HL>'));
assert.equal(result.card.link, '');
assert.equal((await post('/api/cards', {...input, markdownContent: '**This sentence was invented** and does not occur in the source.'}, true)).status, 400);

for (const [route, body, filename, signature] of [
  ['/api/download-docx', result.card, 'agent-card.docx', 'PK'],
  ['/api/download-docx-bulk', {cards: [result.card, {...result.card, highlightColor: '#00FFFF'}]}, 'agent-cards.docx', 'PK'],
  ['/api/download-pdf-bulk', {cards: [result.card]}, 'agent-card.pdf', '%PDF']
]) {
  const exported = await post(route, body);
  assert.equal(exported.status, 200, await exported.clone().text());
  const bytes = Buffer.from(await exported.arrayBuffer());
  assert.equal(bytes.subarray(0, signature.length).toString(), signature);
  await writeFile(new URL(filename, output), bytes);
}
assert.equal((await post('/api/download-docx', {...result.card, highlightColor: 'invalid'})).status, 400);
const browserCut = await (await post('/api/cite', {...input, includeEvaluation: false})).json();
assert.equal(browserCut.status, 'success', JSON.stringify(browserCut));
assert.equal(browserCut.meta.mode, 'normalized');
assert.equal(browserCut.evaluation, null);

if (process.argv.includes('--live')) {
  const started = Date.now();
  const live = await (await post('/api/cite', {
    tagline: input.tagline, sourceText, citation: input.citation, includeEvaluation: false
  })).json();
  assert.equal(live.status, 'success', JSON.stringify(live));
  assert.ok(sourceText.includes(live.plainText));
  assert.ok(live.meta.usage.totalTokens > 0);
  console.log(JSON.stringify({test: 'live source text', elapsedMs: Date.now() - started, ...live.meta}));

  const fetched = await (await post('/api/cite', {
    tagline: 'Scientific evidence shows that Earth is warming',
    link: process.env.EVIDEX_SOURCE_URL || 'https://science.nasa.gov/climate-change/evidence/',
    includeEvaluation: false
  })).json();
  assert.equal(fetched.status, 'success', JSON.stringify(fetched));
  assert.equal(fetched.meta.source, 'fetched_url');
  console.log(JSON.stringify({test: 'live fetched article', ...fetched.meta}));
}
console.log(`PASS: API auth, exact-source validation, Markdown normalization, source-only cards, Word/PDF export (${base})`);
