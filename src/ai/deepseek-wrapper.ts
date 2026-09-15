// Small, SDK-free DeepSeek client for Node and Vercel runtimes.

const configuredModel = process.env.DEEPSEEK_MODEL?.trim();
export const DEEPSEEK_MODEL = configuredModel && /^deepseek-[a-z0-9.-]{1,80}$/i.test(configuredModel)
  ? configuredModel
  : 'deepseek-flash';
const DEEPSEEK_CHAT_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_TOKENS = 2_500;

export type DeepSeekUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedPromptTokens?: number;
};

export type DeepSeekResult = {
  text: string;
  model: string;
  usage: DeepSeekUsage;
};

export type DeepSeekOptions = {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  retries?: number;
  timeoutMs?: number;
  fetchImpl?: (url: string, init: any) => Promise<any>;
};

export class DeepSeekError extends Error {
  constructor(
    message: string,
    readonly code: 'missing_api_key' | 'timeout' | 'upstream_error' | 'invalid_response',
    readonly upstreamStatus?: number,
    readonly retryable = false
  ) {
    super(message);
    this.name = 'DeepSeekError';
  }
}

export function getDeepSeekApiKey(): string {
  // DS_API_KEY is retained as a deployment compatibility alias. Neither value
  // is ever sent to clients or included in logs/errors.
  return process.env.DEEPSEEK_API_KEY || process.env.DS_API_KEY || '';
}

async function getFetch(): Promise<(url: string, init: any) => Promise<any>> {
  if (typeof (globalThis as any).fetch === 'function') {
    return (globalThis as any).fetch.bind(globalThis);
  }
  const imported = await import('node-fetch');
  return ((imported as any).default || imported) as (url: string, init: any) => Promise<any>;
}

function usageFrom(data: any): DeepSeekUsage {
  const usage = data?.usage || {};
  return {
    promptTokens: Number(usage.prompt_tokens) || 0,
    completionTokens: Number(usage.completion_tokens) || 0,
    totalTokens: Number(usage.total_tokens) || 0,
    ...(Number.isFinite(Number(usage.prompt_tokens_details?.cached_tokens))
      ? {cachedPromptTokens: Number(usage.prompt_tokens_details.cached_tokens)}
      : {})
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestOnce(
  systemPrompt: string,
  userPrompt: string,
  options: DeepSeekOptions
): Promise<DeepSeekResult> {
  const apiKey = options.apiKey || getDeepSeekApiKey();
  if (!apiKey) {
    throw new DeepSeekError('The AI service is not configured', 'missing_api_key');
  }

  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1_000), 60_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchImpl = options.fetchImpl || await getFetch();
    const response = await fetchImpl(DEEPSEEK_CHAT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model || DEEPSEEK_MODEL,
        messages: [
          {role: 'system', content: systemPrompt},
          {role: 'user', content: userPrompt}
        ],
        response_format: {type: 'json_object'},
        thinking: {type: 'disabled'},
        max_tokens: Math.min(Math.max(options.maxTokens ?? DEFAULT_MAX_TOKENS, 128), 8_000),
        stream: false
      }),
      signal: controller.signal
    });

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new DeepSeekError('The AI service returned an unreadable response', 'invalid_response', response.status);
    }

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new DeepSeekError('The AI service could not complete the request', 'upstream_error', response.status, retryable);
    }

    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      throw new DeepSeekError('The AI service returned an empty response', 'invalid_response', response.status, true);
    }

    return {
      text,
      model: typeof data?.model === 'string' ? data.model : (options.model || DEEPSEEK_MODEL),
      usage: usageFrom(data)
    };
  } catch (error: any) {
    if (error instanceof DeepSeekError) throw error;
    if (error?.name === 'AbortError') {
      throw new DeepSeekError('The AI service timed out', 'timeout', undefined, true);
    }
    throw new DeepSeekError('The AI service could not be reached', 'upstream_error', undefined, true);
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateDeepSeekJson(
  systemPrompt: string,
  userPrompt: string,
  options: DeepSeekOptions = {}
): Promise<DeepSeekResult> {
  const retries = Math.min(Math.max(options.retries ?? 2, 1), 3);
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await requestOnce(systemPrompt, userPrompt, options);
    } catch (error) {
      lastError = error;
      if (!(error instanceof DeepSeekError) || !error.retryable || attempt === retries - 1) break;
      await delay(250 * (2 ** attempt));
    }
  }

  throw lastError;
}
