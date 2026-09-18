import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import JSZip from 'jszip';

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
  assert.deepEqual(
    listed.tools.map((tool) => tool.name),
    ['evidex_cut_evidence_card', 'evidex_export_evidence_document']
  );

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

  const cards = [
    {
      tagline: 'First card',
      cite: 'First Citation, 2026',
      link: 'https://example.com/first',
      markdown_content: 'Before **first highlighted evidence** after.'
    },
    {
      tagline: 'Second card',
      cite: 'Second Citation, 2026',
      content: 'Before <HL>second highlighted evidence</HL> after.',
      highlight_color: '#00FFFF'
    }
  ];
  const docx = await client.callTool({
    name: 'evidex_export_evidence_document',
    arguments: {
      format: 'docx',
      cards,
      tagline_order: ['Second card'],
      file_name: 'ordered evidence',
      response_format: 'json'
    }
  });
  assert.equal(docx.isError, undefined, JSON.stringify(docx.content));
  assert.equal(docx.structuredContent?.document?.fileName, 'ordered-evidence.docx');
  assert.deepEqual(docx.structuredContent?.document?.orderedTaglines, ['Second card', 'First card']);
  const docxResource = docx.content.find((item) => item.type === 'resource');
  assert.ok(docxResource?.resource?.blob);
  const docxBytes = Buffer.from(docxResource.resource.blob, 'base64');
  assert.equal(docxBytes.subarray(0, 2).toString(), 'PK');
  const docxZip = await JSZip.loadAsync(docxBytes);
  const documentXml = await docxZip.file('word/document.xml').async('string');
  const fillColors = new Set(
    [...documentXml.matchAll(/w:fill="([0-9A-F]{6})"/gi)]
      .map((match) => match[1].toUpperCase())
  );
  assert.ok(fillColors.has('00FF00'), 'Default DOCX highlight was not neon green');
  assert.ok(fillColors.has('00FFFF'), 'Custom DOCX highlight color was not preserved');
  assert.ok(!fillColors.has('FFFF00'), 'Default DOCX highlight unexpectedly became yellow');

  const pdf = await client.callTool({
    name: 'evidex_export_evidence_document',
    arguments: {format: 'pdf', cards, file_name: 'evidence brief'}
  });
  assert.equal(pdf.isError, undefined, JSON.stringify(pdf.content));
  assert.equal(pdf.structuredContent?.document?.fileName, 'evidence-brief.pdf');
  const pdfResource = pdf.content.find((item) => item.type === 'resource');
  assert.ok(pdfResource?.resource?.blob);
  assert.equal(Buffer.from(pdfResource.resource.blob, 'base64').subarray(0, 4).toString(), '%PDF');

  console.log('PASS: Evidex MCP card cutting plus ordered DOCX/PDF export');
} finally {
  await client.close();
}
