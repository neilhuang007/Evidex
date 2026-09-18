import {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';
import {
  ExportInputError,
  exportDocxCards,
  normalizeExportCards,
  type ExportCard
} from '../exporters/card-export';
import {renderPdfBuffer} from '../exporters/pdfHandler';
import {newDocumentId, storeDocument} from './document-store';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME = 'application/pdf';

const exportCardSchema = z.object({
  tagline: z.string().min(1).max(500)
    .describe('Evidence-card claim or heading.'),
  cite: z.string().min(1).max(2_000)
    .describe('Citation displayed with the evidence.'),
  link: z.string().url().max(2_048).optional()
    .describe('Optional public HTTP(S) source link.'),
  content: z.string().min(1).max(120_000).optional()
    .describe('Canonical evidence text with balanced <HL>...</HL> highlights.'),
  markdown_content: z.string().min(1).max(120_000).optional()
    .describe('Evidence text with balanced **bold markers**. Use this when canonical content is unavailable.'),
  highlight_color: z.string().regex(/^#[\da-f]{6}$/i).default('#00FF00')
    .describe('Optional six-digit custom highlight color. Omit this field to use the Evidex UI default neon green (#00FF00); only set it when the user requests another color.')
}).strict().refine((card) => Boolean(card.content || card.markdown_content), {
  message: 'Each card needs content or markdown_content'
});

const exportInputSchema = z.object({
  format: z.enum(['docx', 'pdf']).default('docx')
    .describe('Export format. DOCX imports directly into Google Docs; PDF preserves a fixed layout.'),
  cards: z.array(exportCardSchema).min(1).max(100)
    .describe('Cards to export. Their array order is preserved unless tagline_order is supplied.'),
  tagline_order: z.array(z.string().min(1).max(500)).max(100).optional()
    .describe('Optional case-insensitive tagline order matching the UI custom-order export. Matching groups come first; unlisted cards follow in their original order.'),
  file_name: z.string().min(1).max(100).optional()
    .describe('Optional filename, with or without the extension.'),
  response_format: z.enum(['json', 'markdown']).default('json')
    .describe('Text rendering for the result. Structured output is always included.')
}).strict();

const exportOutputSchema = z.object({
  status: z.literal('success'),
  document: z.object({
    fileName: z.string(),
    format: z.enum(['docx', 'pdf']),
    mimeType: z.string(),
    sizeBytes: z.number().int().nonnegative(),
    cardCount: z.number().int().positive(),
    orderedTaglines: z.array(z.string()),
    downloadUrl: z.string().url().nullable(),
    expiresAt: z.string().datetime().nullable()
  })
});

type ExportInput = z.infer<typeof exportInputSchema>;
type ExportOutput = z.infer<typeof exportOutputSchema>;

function normalizeFileName(value: string | undefined, format: ExportInput['format']): string {
  const extension = `.${format}`;
  const withoutExtension = (value || 'evidex-evidence-cards')
    .replace(/\.(docx|pdf)$/i, '')
    .replace(/[^a-z0-9._ -]+/gi, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 90) || 'evidex-evidence-cards';
  return `${withoutExtension}${extension}`;
}

function toExportCards(cards: ExportInput['cards']): ExportCard[] {
  return normalizeExportCards(cards.map((card) => ({
    tagline: card.tagline,
    cite: card.cite,
    link: card.link || '',
    content: card.content,
    markdownContent: card.markdown_content,
    highlightColor: card.highlight_color
  })));
}

function orderCards(cards: ExportCard[], taglineOrder: string[] | undefined): ExportCard[] {
  if (!taglineOrder?.length) return cards;
  const requested = [...new Set(taglineOrder.map((tagline) => tagline.trim().toLocaleLowerCase()))];
  const ordered: ExportCard[] = [];
  for (const tagline of requested) {
    ordered.push(...cards.filter((card) => card.tagline.toLocaleLowerCase() === tagline));
  }
  const selected = new Set(requested);
  ordered.push(...cards.filter((card) => !selected.has(card.tagline.toLocaleLowerCase())));
  return ordered;
}

function publicBaseUrl(): string | undefined {
  const raw = process.env.MCP_PUBLIC_URL?.replace(/\/+$/, '');
  if (!raw) return undefined;
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('MCP_PUBLIC_URL must be a public HTTP(S) URL without credentials');
  }
  return url.toString().replace(/\/$/, '');
}

function formatText(output: ExportOutput, responseFormat: ExportInput['response_format']): string {
  const document = output.document;
  if (responseFormat === 'json') return JSON.stringify(output);
  const access = document.downloadUrl
    ? `[Download ${document.fileName}](${document.downloadUrl}) (expires ${document.expiresAt})`
    : `${document.fileName} is attached to this tool result.`;
  return `### Evidex ${document.format.toUpperCase()} export\n\n${access}\n\n${document.cardCount} card${document.cardCount === 1 ? '' : 's'} in the requested order.`;
}

export function registerExportTool(server: McpServer): void {
  server.registerTool(
    'evidex_export_evidence_document',
    {
      title: 'Export Evidex cards as DOCX or PDF',
      description: `Render one or more completed evidence cards with the same formatting as the Evidex browser UI.

Supports DOCX for direct Google Docs import, PDF for fixed-layout sharing, exact input order, the UI's optional custom tagline ordering, source hyperlinks, citations, multiline evidence, canonical <HL> or Markdown highlights, and an optional custom highlight color for every card. Omit highlight_color for the UI default neon green (#00FF00); never choose a different color unless the user requests it.

The remote server returns a private, unguessable download URL that expires after 15 minutes. A local stdio server returns the document as an attached MCP resource. The agent should upload the DOCX to Google Drive and open it with Google Docs instead of rebuilding the formatting.`,
      inputSchema: exportInputSchema,
      outputSchema: exportOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (params: ExportInput) => {
      try {
        const cards = orderCards(toExportCards(params.cards), params.tagline_order);
        const buffer = params.format === 'pdf'
          ? await renderPdfBuffer(cards)
          : await exportDocxCards(cards);
        const fileName = normalizeFileName(params.file_name, params.format);
        const mimeType = params.format === 'pdf' ? PDF_MIME : DOCX_MIME;
        const publicUrl = publicBaseUrl();
        let downloadUrl: string | null = null;
        let expiresAt: string | null = null;
        let documentId: string;

        if (publicUrl) {
          const stored = storeDocument(buffer, fileName, mimeType);
          documentId = stored.id;
          downloadUrl = `${publicUrl}/files/${stored.id}/${encodeURIComponent(fileName)}`;
          expiresAt = new Date(stored.expiresAt).toISOString();
        } else {
          documentId = newDocumentId();
        }

        const output: ExportOutput = {
          status: 'success',
          document: {
            fileName,
            format: params.format,
            mimeType,
            sizeBytes: buffer.length,
            cardCount: cards.length,
            orderedTaglines: cards.map((card) => card.tagline),
            downloadUrl,
            expiresAt
          }
        };
        const content = downloadUrl
          ? [{
            type: 'resource_link' as const,
            uri: downloadUrl,
            name: fileName,
            title: fileName,
            description: `Formatted Evidex ${params.format.toUpperCase()} document. The link expires after 15 minutes.`,
            mimeType,
            size: buffer.length
          }]
          : [{
            type: 'resource' as const,
            resource: {
              uri: `evidex://exports/${documentId}/${encodeURIComponent(fileName)}`,
              mimeType,
              blob: buffer.toString('base64')
            }
          }];

        return {
          content: [{type: 'text' as const, text: formatText(output, params.response_format)}, ...content],
          structuredContent: output
        };
      } catch (error) {
        const message = error instanceof ExportInputError
          ? error.message
          : 'Evidex could not render the document. Check the card fields and try again.';
        return {
          isError: true,
          content: [{type: 'text' as const, text: `Evidex export error: ${message}`}]
        };
      }
    }
  );
}
