// node examples/cut-card.mjs input.json [output.docx]
import 'dotenv/config';
import {readFile, writeFile} from 'node:fs/promises';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || inputPath === '--help') {
  console.log('Usage: node examples/cut-card.mjs input.json [output.docx]');
  console.log('Requires EVIDEX_AGENT_API_TOKEN. EVIDEX_API_URL defaults to https://ev1dex.com.');
  console.log('Provide markdownContent to validate a finished card without a model call.');
  process.exit(inputPath ? 0 : 1);
}

async function post(baseUrl, route, body, token) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message = typeof data.error === 'string' ? data.error : data.error?.message;
    throw new Error(`${route}: HTTP ${response.status} ${message || data.message || 'Request failed'}`);
  }
  return response;
}

try {
  const token = process.env.EVIDEX_AGENT_API_TOKEN;
  if (!token) throw new Error('Set EVIDEX_AGENT_API_TOKEN in the environment or local .env file.');
  const baseUrl = (process.env.EVIDEX_API_URL || 'https://ev1dex.com').replace(/\/$/, '');
  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  const result = await (await post(baseUrl, '/api/cards', input, token)).json();
  if (result.status !== 'success' || !result.card) throw new Error('The API did not return a card.');

  if (outputPath) {
    const document = await post(baseUrl, '/api/download-docx', result.card, token);
    await writeFile(outputPath, Buffer.from(await document.arrayBuffer()));
    console.error(`Saved ${outputPath}`);
  }

  // Return one representation of the excerpt to keep an agent's context small.
  // This compact card can be pasted into Import Sources or sent to an exporter.
  const {tagline, link, cite, markdownContent} = result.card;
  console.error(JSON.stringify({mode: result.meta.mode, usage: result.meta.usage}));
  console.log(JSON.stringify({tagline, link, cite, markdownContent}, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
