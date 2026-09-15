import {parseMarkdownHighlights} from './highlights';

export function exportContent(body: Record<string, unknown>): string {
  // The editable canonical content wins over auxiliary markdown metadata.
  if (typeof body.content === 'string' && body.contentFormat !== 'markdown') {
    return body.content;
  }
  const markdown = typeof body.markdownContent === 'string'
    ? body.markdownContent
    : body.contentFormat === 'markdown' && typeof body.content === 'string'
      ? body.content
      : '';
  if (markdown) return markdown.includes('**') ? parseMarkdownHighlights(markdown).content : markdown;
  return typeof body.content === 'string' ? body.content : '';
}
