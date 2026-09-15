import 'dotenv/config';
import assert from 'node:assert/strict';

const baseUrl = process.env.EVIDEX_API_URL || 'http://127.0.0.1:3000';
const sourceText = 'A controlled trial with 800 households found that energy costs declined by 42 percent after the insulation program. Researchers tracked outcomes for five years.';

async function post(path, body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {'content-type': 'application/json', ...headers},
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  });
  const data = await response.json();
  return {response, data};
}

const healthResponse = await fetch(`${baseUrl}/api/health`, {signal: AbortSignal.timeout(5_000)});
assert.equal(healthResponse.status, 200);
const health = await healthResponse.json();
assert.equal(health.status, 'ok');
assert.equal(health.ai?.provider, 'deepseek');
assert.equal(health.ai?.configured, true);

const deterministic = await post('/api/cite', {
  tagline: 'The program lowered household energy costs',
  sourceText,
  citation: 'Example Institute, 2026',
  markdownContent: 'A controlled trial with 800 households found that **energy costs declined by 42 percent** after the insulation program.',
  includeEvaluation: false
});
assert.equal(deterministic.response.status, 200, JSON.stringify(deterministic.data));
assert.equal(deterministic.data.meta.mode, 'normalized');
assert.equal(deterministic.data.meta.usage, null);
assert.match(deterministic.data.content, /<HL>energy costs declined by 42 percent<\/HL>/);

const unauthorized = await post('/api/cards', {
  tagline: 'The program lowered household energy costs',
  sourceText,
  markdownContent: '**A controlled trial** with 800 households found that energy costs declined by 42 percent after the insulation program.'
});
assert.equal(unauthorized.response.status, 401);

assert.ok(process.env.EVIDEX_AGENT_API_TOKEN, 'EVIDEX_AGENT_API_TOKEN is required for the agent API smoke test');
const agent = await post('/api/cards', {
  tagline: 'The program lowered household energy costs',
  sourceText,
  citation: 'Example Institute, 2026',
  markdownContent: 'A controlled trial with 800 households found that **energy costs declined by 42 percent** after the insulation program.'
}, {authorization: `Bearer ${process.env.EVIDEX_AGENT_API_TOKEN}`});
assert.equal(agent.response.status, 200, JSON.stringify(agent.data));
assert.equal(agent.data.card.markdownContent.includes('**energy costs declined by 42 percent**'), true);
assert.equal(agent.data.meta.mode, 'normalized');
assert.equal(agent.data.meta.usage, null);

const generated = await post('/api/cite', {
  tagline: 'The program lowered household energy costs',
  sourceText,
  citation: 'Example Institute, 2026',
  includeEvaluation: false
});
assert.equal(generated.response.status, 200, JSON.stringify(generated.data));
assert.equal(generated.data.meta.mode, 'deepseek');
assert.ok(generated.data.meta.usage?.totalTokens > 0);
assert.match(generated.data.content, /<HL>/);
assert.ok(sourceText.includes(generated.data.plainText));

console.log(JSON.stringify({
  status: 'PASS',
  model: health.ai.model,
  deterministicMode: deterministic.data.meta.mode,
  agentMode: agent.data.meta.mode,
  generatedMode: generated.data.meta.mode,
  generatedTokens: generated.data.meta.usage.totalTokens
}));
