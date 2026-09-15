import {exportContent} from '../cards/export-content';
import {parseRuns, RenderNode, renderDocxBuffer} from './wordHandler';

export type ExportCard = {
  tagline: string;
  cite: string;
  content: string;
  link: string;
  highlightColor?: string;
};

export class ExportInputError extends Error {}

export function normalizeExportCard(value: unknown): ExportCard {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ExportInputError('A card object is required');
  }
  const body = value as Record<string, unknown>;
  const text = (field: string, maxLength: number, required = true): string => {
    const raw = body[field];
    if (raw === undefined && !required) return '';
    if (typeof raw !== 'string' || (required && !raw.trim()) || raw.length > maxLength) {
      throw new ExportInputError(`${field} must be a ${required ? 'non-empty ' : ''}string of at most ${maxLength} characters`);
    }
    return raw;
  };
  const tagline = text('tagline', 500);
  const cite = text('cite', 2000);
  const link = text('link', 2048, false);
  if (link) {
    try {
      const url = new URL(link);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    } catch {
      throw new ExportInputError('link must be an HTTP or HTTPS URL');
    }
  }
  let content: string;
  try {
    content = exportContent(body);
  } catch {
    throw new ExportInputError('Markdown highlight markers must be balanced and non-empty');
  }
  if (!content.trim() || content.length > 120_000) {
    throw new ExportInputError('content must contain between 1 and 120000 characters');
  }
  const highlightColor = body.highlightColor;
  if (highlightColor !== undefined && (typeof highlightColor !== 'string' || !/^#[\da-f]{6}$/i.test(highlightColor))) {
    throw new ExportInputError('highlightColor must be a six-digit hex color such as #FFFF00');
  }
  return {tagline, cite, content, link, highlightColor: highlightColor as string | undefined};
}

export function normalizeExportCards(value: unknown): ExportCard[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new ExportInputError('Provide between 1 and 100 cards');
  }
  const cards = value.map(normalizeExportCard);
  if (cards.reduce((total, card) => total + card.content.length, 0) > 500_000) {
    throw new ExportInputError('Combined card content may contain at most 500000 characters');
  }
  return cards;
}

export function cardToNodes(card: ExportCard): RenderNode[] {
  // Fields are data, not a serialized template. Literal [CITE]/[LINK] strings
  // in a source must not create extra document sections or hyperlinks.
  const nodes: RenderNode[] = [{kind: 'tagline', runs: [{kind: 'plain', text: card.tagline}]}];
  if (card.link) nodes.push({kind: 'link', href: card.link, text: card.link});
  nodes.push({kind: 'cite', text: card.cite, highlightColor: card.highlightColor});
  nodes.push({kind: 'text', runs: parseRuns(card.content), highlightColor: card.highlightColor});
  return nodes;
}

export async function exportDocxCards(cards: ExportCard[]): Promise<Buffer> {
  const nodes: RenderNode[] = [];
  for (const card of cards) {
    if (nodes.length) nodes.push({kind: 'text', runs: [{kind: 'plain', text: '\n\n'}]});
    nodes.push(...cardToNodes(card));
  }
  return renderDocxBuffer(nodes);
}
