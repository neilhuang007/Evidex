import {z} from 'zod';

const DEFAULT_API_URL = 'https://ev1dex.com';
const REQUEST_TIMEOUT_MS = 60_000;

const usageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  cachedPromptTokens: z.number().int().nonnegative().optional()
});

const evaluationCriterionSchema = z.object({
  score: z.number().min(0).max(10),
  reasoning: z.string()
});

export const evaluationSchema = z.object({
  score: z.number().int().min(0).max(6),
  credibility: evaluationCriterionSchema,
  support: evaluationCriterionSchema,
  contradictions: evaluationCriterionSchema,
  meta: z.object({
    model: z.string(),
    usage: usageSchema
  })
});

export const highlightSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  text: z.string()
});

export const responseMetaSchema = z.object({
  mode: z.enum(['normalized', 'deepseek']),
  model: z.string().nullable(),
  source: z.enum(['provided_text', 'fetched_url']),
  sourceCharacters: z.number().int().nonnegative(),
  usage: usageSchema.nullable()
});

const successResponseSchema = z.object({
  status: z.literal('success'),
  cite: z.string(),
  content: z.string(),
  plainText: z.string(),
  markdownContent: z.string(),
  highlights: z.array(highlightSchema),
  evaluation: evaluationSchema.nullable(),
  meta: responseMetaSchema
});

const failureResponseSchema = z.object({
  status: z.literal('fetch_error'),
  error: z.string(),
  errorCode: z.string().optional()
});

const apiResponseSchema = z.union([successResponseSchema, failureResponseSchema]);

export type EvidexApiSuccess = z.infer<typeof successResponseSchema>;

export type CutEvidenceRequest = {
  tagline: string;
  link?: string;
  sourceText?: string;
  citation?: string;
  markdownContent?: string;
  includeEvaluation: boolean;
};

export class EvidexApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
    readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'EvidexApiError';
  }
}

function apiBaseUrl(): string {
  const configured = (process.env.EVIDEX_API_URL || DEFAULT_API_URL).replace(/\/$/, '');
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new EvidexApiError('EVIDEX_API_URL must be a valid HTTP(S) URL', 'invalid_configuration');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new EvidexApiError('EVIDEX_API_URL must use HTTP or HTTPS', 'invalid_configuration');
  }
  return configured;
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = Number(response.headers.get('retry-after'));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export async function cutEvidenceCard(request: CutEvidenceRequest): Promise<EvidexApiSuccess> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/cite`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'evidex-mcp-server/1.0.0'
      },
      body: JSON.stringify({
        tagline: request.tagline,
        link: request.link,
        sourceText: request.sourceText,
        citation: request.citation,
        markdownContent: request.markdownContent,
        includeEvaluation: request.includeEvaluation
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    const message = error instanceof Error && error.name === 'TimeoutError'
      ? 'Evidex did not respond within 60 seconds'
      : 'Could not connect to Evidex';
    throw new EvidexApiError(message, 'connection_failed');
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new EvidexApiError('Evidex returned a non-JSON response', 'invalid_response', response.status);
  }

  if (response.status === 429) {
    throw new EvidexApiError(
      'Evidex rate limit reached',
      'rate_limited',
      response.status,
      retryAfterSeconds(response)
    );
  }
  if (!response.ok) {
    throw new EvidexApiError(`Evidex returned HTTP ${response.status}`, 'http_error', response.status);
  }

  const parsed = apiResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new EvidexApiError('Evidex returned an unexpected response format', 'invalid_response', response.status);
  }
  if (parsed.data.status === 'fetch_error') {
    throw new EvidexApiError(parsed.data.error, parsed.data.errorCode || 'card_failed', response.status);
  }
  return parsed.data;
}
