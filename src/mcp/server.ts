import {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';
import {
  cutEvidenceCard,
  evaluationSchema,
  EvidexApiError,
  highlightSchema,
  responseMetaSchema
} from './evidex-client';
import {registerExportTool} from './export-tool';

const inputSchema = z.object({
  tagline: z.string()
    .min(1)
    .max(500)
    .describe('Precise claim that the evidence passage should support.'),
  link: z.string()
    .url()
    .max(2_048)
    .optional()
    .describe('Public HTTP(S) source URL. Optional when source_text is supplied.'),
  source_text: z.string()
    .min(1)
    .max(120_000)
    .optional()
    .describe('Exact source text already read by the agent. Takes precedence over fetching link.'),
  citation: z.string()
    .max(160)
    .optional()
    .describe('Known author, publisher, and date copied from the source. Never invent missing metadata.'),
  markdown_content: z.string()
    .min(1)
    .max(15_000)
    .optional()
    .describe('Optional exact contiguous source excerpt with balanced **bold highlights**. Providing this avoids an Evidex model call.'),
  include_evaluation: z.boolean()
    .default(false)
    .describe('Whether to make an additional model call for an evidence-quality evaluation. Defaults to false.'),
  response_format: z.enum(['json', 'markdown'])
    .default('json')
    .describe('Text rendering for the tool result. Structured output is returned in both modes.')
}).strict();

const cardSchema = z.object({
  tagline: z.string(),
  link: z.string(),
  cite: z.string(),
  plainText: z.string(),
  markdownContent: z.string(),
  content: z.string(),
  highlights: z.array(highlightSchema)
});

const outputSchema = z.object({
  status: z.literal('success'),
  card: cardSchema,
  evaluation: evaluationSchema.nullable(),
  meta: responseMetaSchema
});

type ToolInput = z.infer<typeof inputSchema>;
type ToolOutput = z.infer<typeof outputSchema>;

const SERVER_INSTRUCTIONS = 'Use evidex_cut_evidence_card when the user needs a sourced evidence excerpt supporting a claim. Provide a precise tagline and either a public link or source_text. If browser tools already read the source, pass source_text. If choosing the excerpt, pass one exact contiguous markdown_content passage with **highlighted words** to avoid an Evidex model call. Never invent citation metadata or alter quoted wording. Use evidex_export_evidence_document to render completed cards as DOCX or PDF, preserving card order, custom tagline order, citations, links, highlights, and per-card colors. Prefer DOCX when the result will be imported into Google Docs. Omit highlight_color for the default neon green (#00FF00) and only customize it when the user explicitly requests another color. The public service is limited to 30 card-cutting requests per minute per IP.';

function formatSuccess(output: ToolOutput, responseFormat: ToolInput['response_format']): string {
  if (responseFormat === 'json') return JSON.stringify(output);
  const sourceLine = output.card.link ? `\nSource: ${output.card.link}` : '';
  const scoreLine = output.evaluation ? `\nEvaluation: ${output.evaluation.score}/6` : '';
  return `### ${output.card.tagline}\n\n${output.card.markdownContent}\n\nCitation: ${output.card.cite}${sourceLine}${scoreLine}`;
}

function formatError(error: unknown): string {
  if (!(error instanceof EvidexApiError)) {
    return 'Evidex could not create the card because of an unexpected integration error. Retry once, then report the failure.';
  }

  const prefix = `Evidex error (${error.code}): ${error.message}.`;
  if (error.code === 'rate_limited') {
    const delay = error.retryAfterSeconds ? ` Wait ${error.retryAfterSeconds} seconds before retrying.` : ' Wait before retrying.';
    return prefix + delay;
  }
  if (['fetch_failed', 'unsupported_content', 'blocked_url'].includes(error.code)) {
    return `${prefix} Read the page with browser tools and retry with source_text.`;
  }
  if (['ungrounded_content', 'invalid_highlights'].includes(error.code)) {
    return `${prefix} Ensure markdown_content is an exact contiguous quotation from the supplied source with balanced, nonempty **bold markers**.`;
  }
  return prefix;
}

export function createEvidexMcpServer(): McpServer {
  const server = new McpServer(
    {name: 'evidex-mcp-server', version: '1.0.0'},
    {instructions: SERVER_INSTRUCTIONS}
  );

  server.registerTool(
    'evidex_cut_evidence_card',
    {
      title: 'Cut an Evidex evidence card',
      description: `Create and validate a highlighted evidence card for one claim and source.

Provide tagline plus either link or source_text. When markdown_content is omitted, Evidex selects a supporting exact quotation. When markdown_content is provided, it must be an exact contiguous passage from the source with balanced **bold highlights**; Evidex validates and formats it without a card-cutting model call.

Returns an importable card containing tagline, link, citation, exact quoted text, Markdown highlights, canonical <HL> content, highlight offsets, processing metadata, and an optional evaluation. On source-fetch failure, read the page with browser tools and retry with source_text.`,
      inputSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ToolInput) => {
      if (!params.link && !params.source_text) {
        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text: 'Provide either link or source_text. Use source_text when the page requires login, JavaScript, or browser access.'
          }]
        };
      }

      try {
        const result = await cutEvidenceCard({
          tagline: params.tagline,
          link: params.link,
          sourceText: params.source_text,
          citation: params.citation,
          markdownContent: params.markdown_content,
          includeEvaluation: params.include_evaluation
        });
        const output: ToolOutput = {
          status: 'success',
          card: {
            tagline: params.tagline.trim(),
            link: params.link || '',
            cite: result.cite,
            plainText: result.plainText,
            markdownContent: result.markdownContent,
            content: result.content,
            highlights: result.highlights
          },
          evaluation: result.evaluation,
          meta: result.meta
        };
        return {
          content: [{type: 'text' as const, text: formatSuccess(output, params.response_format)}],
          structuredContent: output
        };
      } catch (error) {
        return {
          isError: true,
          content: [{type: 'text' as const, text: formatError(error)}]
        };
      }
    }
  );

  registerExportTool(server);

  return server;
}
