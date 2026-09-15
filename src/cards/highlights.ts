export type HighlightRange = {
  start: number;
  end: number;
  text: string;
};

export type HighlightedText = {
  plainText: string;
  markdownContent: string;
  content: string;
  highlights: HighlightRange[];
};

export class HighlightValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HighlightValidationError';
  }
}

const MAX_HIGHLIGHTS = 24;

function validateRanges(plainText: string, ranges: Array<{start: number; end: number}>): HighlightRange[] {
  if (!ranges.length) throw new HighlightValidationError('At least one highlighted span is required');
  if (ranges.length > MAX_HIGHLIGHTS) {
    throw new HighlightValidationError(`A card may contain at most ${MAX_HIGHLIGHTS} highlighted spans`);
  }

  let priorEnd = 0;
  return ranges.map(({start, end}) => {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < priorEnd || end <= start || end > plainText.length) {
      throw new HighlightValidationError('Highlight spans must be non-empty, ordered, and non-overlapping');
    }
    priorEnd = end;
    return {start, end, text: plainText.slice(start, end)};
  });
}

function renderRanges(plainText: string, highlights: HighlightRange[], open: string, close: string): string {
  let cursor = 0;
  let rendered = '';
  for (const highlight of highlights) {
    rendered += plainText.slice(cursor, highlight.start);
    rendered += open + plainText.slice(highlight.start, highlight.end) + close;
    cursor = highlight.end;
  }
  return rendered + plainText.slice(cursor);
}

function buildResult(plainText: string, ranges: Array<{start: number; end: number}>): HighlightedText {
  const highlights = validateRanges(plainText, ranges);
  return {
    plainText,
    markdownContent: renderRanges(plainText, highlights, '**', '**'),
    content: renderRanges(plainText, highlights, '<HL>', '</HL>'),
    highlights
  };
}

export function parseMarkdownHighlights(markdown: string): HighlightedText {
  if (typeof markdown !== 'string' || !markdown.trim()) {
    throw new HighlightValidationError('markdownContent must be a non-empty string');
  }

  const plainParts: string[] = [];
  const ranges: Array<{start: number; end: number}> = [];
  let plainLength = 0;
  let cursor = 0;
  let openStart: number | null = null;

  while (cursor < markdown.length) {
    const marker = markdown.indexOf('**', cursor);
    if (marker < 0) {
      const tail = markdown.slice(cursor);
      plainParts.push(tail);
      plainLength += tail.length;
      break;
    }

    const text = markdown.slice(cursor, marker);
    plainParts.push(text);
    plainLength += text.length;
    if (openStart === null) {
      openStart = plainLength;
    } else {
      ranges.push({start: openStart, end: plainLength});
      openStart = null;
    }
    cursor = marker + 2;
  }

  if (openStart !== null) throw new HighlightValidationError('Markdown bold markers must be balanced');
  return buildResult(plainParts.join(''), ranges);
}

export function parseTaggedHighlights(content: string): HighlightedText {
  if (typeof content !== 'string' || !content.trim()) {
    throw new HighlightValidationError('content must be a non-empty string');
  }

  const plainParts: string[] = [];
  const ranges: Array<{start: number; end: number}> = [];
  const tagPattern = /<\/?HL>/gi;
  let cursor = 0;
  let plainLength = 0;
  let openStart: number | null = null;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(content)) !== null) {
    const text = content.slice(cursor, match.index);
    plainParts.push(text);
    plainLength += text.length;
    const isClose = /^<\//.test(match[0]);

    if (!isClose) {
      if (openStart !== null) throw new HighlightValidationError('Highlight tags may not be nested');
      openStart = plainLength;
    } else {
      if (openStart === null) throw new HighlightValidationError('Found a closing highlight tag without an opening tag');
      ranges.push({start: openStart, end: plainLength});
      openStart = null;
    }

    cursor = match.index + match[0].length;
  }

  const tail = content.slice(cursor);
  plainParts.push(tail);
  if (openStart !== null) throw new HighlightValidationError('Highlight tags must be balanced');
  return buildResult(plainParts.join(''), ranges);
}

export function normalizeComparableText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function assertGroundedExcerpt(excerpt: string, sourceText: string): void {
  const normalizedExcerpt = normalizeComparableText(excerpt);
  const normalizedSource = normalizeComparableText(sourceText);
  if (!normalizedExcerpt || normalizedExcerpt.length < 20) {
    throw new HighlightValidationError('The evidence excerpt is too short');
  }
  if (!normalizedSource.includes(normalizedExcerpt)) {
    throw new HighlightValidationError('The evidence excerpt is not an exact contiguous quote from the supplied source');
  }
}
