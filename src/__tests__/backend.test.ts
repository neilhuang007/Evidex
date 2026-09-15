import test from 'node:test';
import assert from 'node:assert/strict';
import {cutCard} from '../cards/card-service';
import {
  assertGroundedExcerpt,
  HighlightValidationError,
  parseMarkdownHighlights,
  parseTaggedHighlights
} from '../cards/highlights';
import {extractArticleHtml, SourceFetchError, validatePublicUrl} from '../cards/source-fetcher';
import {generateDeepSeekJson} from '../ai/deepseek-wrapper';
import {isValidEvaluation} from '../ai/evidence-services';
import {authorizeAgent, clientAddress} from '../http/api-security';

test('Markdown bold normalizes to canonical HL tags and stable offsets', () => {
  const result = parseMarkdownHighlights('Studies show **costs fell 42%** in one year.');
  assert.equal(result.plainText, 'Studies show costs fell 42% in one year.');
  assert.equal(result.content, 'Studies show <HL>costs fell 42%</HL> in one year.');
  assert.deepEqual(result.highlights, [{start: 13, end: 27, text: 'costs fell 42%'}]);
});

test('malformed and nested highlight markup is rejected instead of guessed', () => {
  assert.throws(() => parseMarkdownHighlights('Text with **an open marker'), HighlightValidationError);
  assert.throws(() => parseTaggedHighlights('<HL>outer <HL>inner</HL></HL>'), HighlightValidationError);
  assert.throws(() => parseTaggedHighlights('orphan</HL>'), HighlightValidationError);
});

test('grounding permits whitespace normalization but rejects invented evidence', () => {
  assert.doesNotThrow(() => assertGroundedExcerpt(
    'The measured result was 42 percent.',
    'Introduction\n\nThe measured   result was 42 percent. Conclusion.'
  ));
  assert.throws(
    () => assertGroundedExcerpt('The measured result was 99 percent.', 'The measured result was 42 percent.'),
    HighlightValidationError
  );
});

test('agent-supplied markdown creates a grounded card without an API key', async () => {
  const priorDeepSeek = process.env.DEEPSEEK_API_KEY;
  const priorAlias = process.env.DS_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.DS_API_KEY;
  try {
    const result = await cutCard({
      tagline: 'Costs declined',
      sourceText: 'The report found that costs declined by 42 percent during 2025.',
      citation: 'Example Institute, 2025',
      markdownContent: 'The report found that **costs declined by 42 percent** during 2025.'
    });
    assert.equal(result.meta.mode, 'normalized');
    assert.equal(result.meta.usage, null);
    assert.equal(result.card.cite, 'Example Institute, 2025');
    assert.match(result.card.content, /<HL>costs declined by 42 percent<\/HL>/);
  } finally {
    if (priorDeepSeek === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = priorDeepSeek;
    if (priorAlias === undefined) delete process.env.DS_API_KEY;
    else process.env.DS_API_KEY = priorAlias;
  }
});

test('provided text still rejects unsafe source URL schemes', async () => {
  await assert.rejects(
    cutCard({
      tagline: 'Claim',
      sourceText: 'This is enough source material to validate an evidence quotation.',
      sourceUrl: 'javascript:alert(1)',
      markdownContent: '**This is enough source material** to validate an evidence quotation.'
    }),
    (error: unknown) => error instanceof SourceFetchError && error.code === 'invalid_url'
  );
});

test('SSRF validation blocks loopback, mapped IPv6, and mixed DNS answers', async () => {
  for (const url of [
    'http://127.0.0.1/',
    'http://[::1]/',
    'http://[0:0:0:0:0:0:0:1]/',
    'http://[::ffff:7f00:1]/'
  ]) {
    await assert.rejects(
      validatePublicUrl(url),
      (error: unknown) => error instanceof SourceFetchError && error.code === 'blocked_url'
    );
  }

  await assert.rejects(
    validatePublicUrl('https://example.test/', async () => [
      {address: '93.184.216.34', family: 4},
      {address: '10.0.0.4', family: 4}
    ]),
    (error: unknown) => error instanceof SourceFetchError && error.code === 'blocked_url'
  );
  const valid = await validatePublicUrl(
    'https://example.test/article',
    async () => [{address: '93.184.216.34', family: 4}]
  );
  assert.equal(valid.address.address, '93.184.216.34');
});

test('article extraction keeps readable evidence and derives a non-invented citation', () => {
  const html = `<!doctype html><html><head>
    <title>Study results</title>
    <meta name="author" content="Alex Rivera">
    <meta property="article:published_time" content="2025-04-03">
  </head><body><nav>Unrelated navigation</nav><article>
    <h1>Study results</h1><p>The study tracked 800 households over five years.</p>
    <p>Costs declined by 42 percent after the intervention.</p>
  </article><script>throw new Error('must not execute')</script></body></html>`;
  const result = extractArticleHtml(html, new URL('https://example.com/study'));
  assert.match(result.text, /Costs declined by 42 percent/);
  assert.equal(result.citation, 'Alex Rivera, 2025');
});

test('DeepSeek requests use current model, JSON mode, disabled thinking, and expose usage', async () => {
  let capturedBody: any;
  const result = await generateDeepSeekJson('Return JSON.', 'Input', {
    apiKey: 'test-only-key',
    retries: 1,
    fetchImpl: async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: 'deepseek-flash',
          choices: [{message: {content: '{"ok":true}'}}],
          usage: {prompt_tokens: 9, completion_tokens: 4, total_tokens: 13, prompt_tokens_details: {cached_tokens: 3}}
        })
      };
    }
  });
  assert.equal(capturedBody.model, 'deepseek-flash');
  assert.deepEqual(capturedBody.response_format, {type: 'json_object'});
  assert.deepEqual(capturedBody.thinking, {type: 'disabled'});
  assert.equal(result.usage.totalTokens, 13);
  assert.equal(result.usage.cachedPromptTokens, 3);
});

test('DeepSeek retries transient upstream failures without exposing response details', async () => {
  let attempts = 0;
  const result = await generateDeepSeekJson('Return JSON.', 'Input', {
    apiKey: 'test-only-key',
    retries: 2,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        return {ok: false, status: 503, json: async () => ({internal: 'sensitive upstream detail'})};
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: 'deepseek-flash',
          choices: [{message: {content: '{"ok":true}'}}],
          usage: {prompt_tokens: 1, completion_tokens: 1, total_tokens: 2}
        })
      };
    }
  });
  assert.equal(attempts, 2);
  assert.equal(result.text, '{"ok":true}');
});

test('agent authentication fails closed and forwarded IPs require explicit trust', () => {
  const priorToken = process.env.EVIDEX_AGENT_API_TOKEN;
  process.env.EVIDEX_AGENT_API_TOKEN = 'test-agent-token';
  try {
    assert.equal(authorizeAgent('Bearer test-agent-token'), null);
    assert.equal(authorizeAgent('Bearer wrong')?.statusCode, 401);
    assert.equal(clientAddress({'x-forwarded-for': '198.51.100.9'}, '203.0.113.8'), '203.0.113.8');
    assert.equal(clientAddress({'x-forwarded-for': '198.51.100.9'}, undefined, 'vercel'), '198.51.100.9');
  } finally {
    if (priorToken === undefined) delete process.env.EVIDEX_AGENT_API_TOKEN;
    else process.env.EVIDEX_AGENT_API_TOKEN = priorToken;
  }
});

test('evaluation schema preserves the frontend 0-6 and criterion 0-10 contract', () => {
  assert.equal(isValidEvaluation({
    score: 4,
    credibility: {score: 8, reasoning: 'Established source.'},
    support: {score: 7, reasoning: 'Directly supports the claim.'},
    contradictions: {score: 9, reasoning: 'No meaningful contradiction.'}
  }), true);
  assert.equal(isValidEvaluation({
    score: 74,
    credibility: {},
    support: {score: 7, reasoning: ''},
    contradictions: {score: 11, reasoning: 'Out of range.'}
  }), false);
});
