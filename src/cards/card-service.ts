import {DEEPSEEK_MODEL, DeepSeekUsage, generateDeepSeekJson} from '../ai/deepseek-wrapper';
import {
  assertGroundedExcerpt,
  HighlightedText,
  HighlightValidationError,
  parseMarkdownHighlights,
  parseTaggedHighlights
} from './highlights';
import {resolveSource} from './source-fetcher';

const MAX_TAGLINE_CHARS = 500;
const MAX_CUT_CONTENT_CHARS = 15_000;

export type CutCardInput = {
  tagline?: unknown;
  link?: unknown;
  sourceUrl?: unknown;
  sourceText?: unknown;
  citation?: unknown;
  cite?: unknown;
  markdownContent?: unknown;
  content?: unknown;
};

export type CardResult = {
  status: 'success';
  card: {
    tagline: string;
    link: string;
    cite: string;
    plainText: string;
    markdownContent: string;
    content: string;
    highlights: HighlightedText['highlights'];
  };
  meta: {
    mode: 'normalized' | 'deepseek';
    model: string | null;
    source: 'provided_text' | 'fetched_url';
    sourceCharacters: number;
    usage: DeepSeekUsage | null;
  };
};

export class CardInputError extends Error {
  constructor(message: string, readonly code = 'invalid_request') {
    super(message);
    this.name = 'CardInputError';
  }
}

export class CardGenerationError extends Error {
  constructor(message: string, readonly code: 'invalid_model_response' | 'ungrounded_model_response') {
    super(message);
    this.name = 'CardGenerationError';
  }
}

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new CardInputError(`${field} is required`);
  const result = value.trim();
  if (result.length > maxLength) throw new CardInputError(`${field} may contain at most ${maxLength} characters`);
  return result;
}

function optionalString(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new CardInputError(`${field} must be a string`);
  const result = value.trim();
  if (result.length > maxLength) throw new CardInputError(`${field} may contain at most ${maxLength} characters`);
  return result || undefined;
}

export function coerceJson(text: string): any | null {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(text);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  const firstObject = text.indexOf('{');
  const lastObject = text.lastIndexOf('}');
  if (firstObject >= 0 && lastObject > firstObject) {
    try { return JSON.parse(text.slice(firstObject, lastObject + 1)); } catch {}
  }
  const firstArray = text.indexOf('[');
  const lastArray = text.lastIndexOf(']');
  if (firstArray >= 0 && lastArray > firstArray) {
    try { return JSON.parse(text.slice(firstArray, lastArray + 1)); } catch {}
  }
  return null;
}

const cardPromptConfig = require('../../config/prompts/card_cutter.json') as {
  version: number;
  model: string;
  system: string;
};
if (cardPromptConfig.version !== 2 || !cardPromptConfig.system) {
  throw new Error('Unsupported card cutter prompt configuration');
}
const CARD_SYSTEM_PROMPT = cardPromptConfig.system;

function parseDirectCut(markdownContent?: string, taggedContent?: string): HighlightedText | null {
  if (markdownContent && taggedContent) {
    throw new CardInputError('Provide markdownContent or content, not both');
  }
  try {
    if (markdownContent) return parseMarkdownHighlights(markdownContent);
    if (taggedContent) return parseTaggedHighlights(taggedContent);
    return null;
  } catch (error) {
    if (error instanceof HighlightValidationError) throw new CardInputError(error.message, 'invalid_highlights');
    throw error;
  }
}

function validateGrounding(highlighted: HighlightedText, sourceText: string, fromModel: boolean): void {
  try {
    assertGroundedExcerpt(highlighted.plainText, sourceText);
  } catch (error) {
    if (!(error instanceof HighlightValidationError)) throw error;
    if (fromModel) throw new CardGenerationError(error.message, 'ungrounded_model_response');
    throw new CardInputError(error.message, 'ungrounded_content');
  }
}

export async function cutCard(input: CutCardInput): Promise<CardResult> {
  const tagline = requiredString(input.tagline, 'tagline', MAX_TAGLINE_CHARS);
  const sourceUrl = optionalString(input.sourceUrl ?? input.link, 'sourceUrl', 2_048);
  const sourceText = optionalString(input.sourceText, 'sourceText', 120_000);
  const citation = optionalString(input.citation ?? input.cite, 'citation', 160);
  const markdownContent = optionalString(input.markdownContent, 'markdownContent', MAX_CUT_CONTENT_CHARS);
  const taggedContent = optionalString(input.content, 'content', MAX_CUT_CONTENT_CHARS);

  const source = await resolveSource({sourceText, sourceUrl, citation});
  let highlighted = parseDirectCut(markdownContent, taggedContent);
  let model: string | null = null;
  let usage: DeepSeekUsage | null = null;
  let mode: CardResult['meta']['mode'] = 'normalized';

  if (highlighted) {
    validateGrounding(highlighted, source.text, false);
  } else {
    mode = 'deepseek';
    const modelResult = await generateDeepSeekJson(
      CARD_SYSTEM_PROMPT,
      JSON.stringify({tagline, source: source.text}),
      {model: DEEPSEEK_MODEL, retries: 2, timeoutMs: 16_000, maxTokens: 2_500}
    );
    model = modelResult.model;
    usage = modelResult.usage;
    const parsed = coerceJson(modelResult.text);
    if (!parsed || parsed.status !== 'success' || typeof parsed.markdownContent !== 'string') {
      throw new CardGenerationError('The AI service returned an unexpected card format', 'invalid_model_response');
    }
    try {
      highlighted = parseMarkdownHighlights(parsed.markdownContent);
    } catch (error) {
      if (error instanceof HighlightValidationError) {
        throw new CardGenerationError(error.message, 'invalid_model_response');
      }
      throw error;
    }
    validateGrounding(highlighted, source.text, true);
  }

  return {
    status: 'success',
    card: {
      tagline,
      link: source.url || sourceUrl || '',
      cite: source.citation,
      plainText: highlighted.plainText,
      markdownContent: highlighted.markdownContent,
      content: highlighted.content,
      highlights: highlighted.highlights
    },
    meta: {
      mode,
      model,
      source: source.source,
      sourceCharacters: source.text.length,
      usage
    }
  };
}
