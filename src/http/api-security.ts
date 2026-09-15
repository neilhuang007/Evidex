import {timingSafeEqual} from 'crypto';
import {CardGenerationError, CardInputError} from '../cards/card-service';
import {SourceFetchError} from '../cards/source-fetcher';
import {DeepSeekError} from '../ai/deepseek-wrapper';

type RateEntry = {count: number; resetAt: number};
const rateEntries = new Map<string, RateEntry>();
const MAX_RATE_ENTRIES = 2_000;

export type ApiFailure = {
  statusCode: number;
  body: {error: {code: string; message: string}};
};

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function authorizeAgent(authorization: string | undefined): ApiFailure | null {
  const expected = process.env.EVIDEX_AGENT_API_TOKEN || '';
  if (!expected) {
    return {
      statusCode: 503,
      body: {error: {code: 'agent_api_disabled', message: 'The agent API is not configured'}}
    };
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorization || '');
  if (!match || !safeEqual(match[1], expected)) {
    return {
      statusCode: 401,
      body: {error: {code: 'unauthorized', message: 'A valid bearer token is required'}}
    };
  }
  return null;
}

export function clientAddress(
  headers: Record<string, unknown>,
  remoteAddress?: string,
  trustedProxy?: 'vercel' | 'cloudflare'
): string {
  if (!trustedProxy) return remoteAddress || 'unknown';
  const headerName = trustedProxy === 'cloudflare' ? 'cf-connecting-ip' : 'x-forwarded-for';
  const forwarded = headers[headerName];
  const forwardedText = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof forwardedText === 'string' && forwardedText.trim()) return forwardedText.split(',')[0].trim();
  return remoteAddress || 'unknown';
}

export function consumeRateLimit(
  namespace: string,
  identity: string,
  limit: number,
  windowMs = 60_000
): {allowed: boolean; retryAfterSeconds: number; remaining: number} {
  const now = Date.now();
  const key = `${namespace}:${identity}`;
  if (!rateEntries.has(key) && rateEntries.size >= MAX_RATE_ENTRIES) {
    for (const [key, entry] of rateEntries) {
      if (entry.resetAt <= now) rateEntries.delete(key);
    }
    while (rateEntries.size >= MAX_RATE_ENTRIES) {
      const oldestKey = rateEntries.keys().next().value as string | undefined;
      if (!oldestKey) break;
      rateEntries.delete(oldestKey);
    }
  }

  let entry = rateEntries.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = {count: 0, resetAt: now + windowMs};
    rateEntries.set(key, entry);
  }
  entry.count += 1;
  return {
    allowed: entry.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1_000)),
    remaining: Math.max(0, limit - entry.count)
  };
}

export function toApiFailure(error: unknown): ApiFailure {
  if (error instanceof CardInputError) {
    return {statusCode: 400, body: {error: {code: error.code, message: error.message}}};
  }
  if (error instanceof SourceFetchError) {
    const statusCode = ['invalid_url', 'blocked_url', 'source_too_large'].includes(error.code) ? 400 : 422;
    return {statusCode, body: {error: {code: error.code, message: error.message}}};
  }
  if (error instanceof CardGenerationError) {
    return {statusCode: 502, body: {error: {code: error.code, message: error.message}}};
  }
  if (error instanceof DeepSeekError) {
    const statusCode = error.code === 'missing_api_key' ? 503 : error.code === 'timeout' ? 504 : 502;
    return {statusCode, body: {error: {code: error.code, message: error.message}}};
  }
  return {statusCode: 500, body: {error: {code: 'internal_error', message: 'The request could not be completed'}}};
}
