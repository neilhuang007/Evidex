import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = path.join(repositoryRoot, 'dist', 'mcp', 'index.js');
const sourceText = 'The independent study found that the program lowered household energy costs by 18 percent during the first year.';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  cwd: repositoryRoot,
  stderr: 'pipe',
  env: {...process.env, EVIDEX_API_URL: process.env.EVIDEX_API_URL || 'https://ev1dex.com'}
});
const client = new Client({name: 'evidex-mcp-smoke', version: '1.0.0'});

try {
  await client.connect(transport);
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 1);
  assert.equal(listed.tools[0].name, 'evidex_cut_evidence_card');

  const result = await client.callTool({
    name: 'evidex_cut_evidence_card',
    arguments: {
      tagline: 'The program lowered household energy costs',
      link: 'https://example.com/study',
      source_text: sourceText,
      citation: 'Independent Study, 2026',
      markdown_content: 'The independent study found that **the program lowered household energy costs by 18 percent** during the first year.',
      include_evaluation: false,
      response_format: 'json'
    }
  });

  assert.equal(result.isError, undefined, JSON.stringify(result.content));
  assert.equal(result.structuredContent?.status, 'success');
  assert.equal(result.structuredContent?.card?.tagline, 'The program lowered household energy costs');
  assert.equal(result.structuredContent?.card?.cite, 'Independent Study, 2026');
  assert.equal(result.structuredContent?.meta?.mode, 'normalized');
  assert.equal(result.structuredContent?.meta?.usage, null);
  assert.match(result.structuredContent?.card?.markdownContent || '', /\*\*the program lowered household energy costs by 18 percent\*\*/);
  console.log('PASS: Evidex MCP discovery and deterministic evidence-card tool call');
} finally {
  await client.close();
}
