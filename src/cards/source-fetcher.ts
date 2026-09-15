import {lookup as dnsLookup} from 'dns/promises';
import * as http from 'http';
import * as https from 'https';
import {isIP} from 'net';
import {Readability} from '@mozilla/readability';
import {JSDOM} from 'jsdom';
import * as ipaddr from 'ipaddr.js';

export const MAX_SOURCE_CHARS = 120_000;
const MAX_DOWNLOAD_BYTES = 1_500_000;
const MAX_REDIRECTS = 4;
const FETCH_DEADLINE_MS = 12_000;
const MAX_FETCH_ATTEMPTS = 2;
const CACHE_TTL_MS = 10 * 60_000;
const MAX_CACHE_ENTRIES = 64;

type ResolvedAddress = {address: string; family: number};
type LookupFn = (hostname: string) => Promise<ResolvedAddress[]>;
type CachedSource = {expiresAt: number; document: SourceDocument};
const sourceCache = new Map<string, CachedSource>();

export type SourceDocument = {
  text: string;
  url?: string;
  citation: string;
  source: 'provided_text' | 'fetched_url';
};

export class SourceFetchError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid_url' | 'blocked_url' | 'fetch_failed' | 'unsupported_content' | 'source_too_large'
  ) {
    super(message);
    this.name = 'SourceFetchError';
  }
}

function cleanHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

function isPublicIp(address: string): boolean {
  try {
    // process() canonicalizes IPv4-mapped IPv6 before classification, covering
    // both dotted (::ffff:127.0.0.1) and hexadecimal (::ffff:7f00:1) forms.
    return ipaddr.process(cleanHostname(address)).range() === 'unicast';
  } catch {
    return false;
  }
}

function parseSourceUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SourceFetchError('sourceUrl must be a valid HTTP or HTTPS URL', 'invalid_url');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) {
    throw new SourceFetchError('sourceUrl must be a public HTTP or HTTPS URL without credentials', 'invalid_url');
  }
  return url;
}

async function defaultLookup(hostname: string): Promise<ResolvedAddress[]> {
  return await dnsLookup(hostname, {all: true, verbatim: true});
}

export async function validatePublicUrl(rawUrl: string, lookup: LookupFn = defaultLookup): Promise<{
  url: URL;
  address: ResolvedAddress;
}> {
  const url = parseSourceUrl(rawUrl);

  const hostname = cleanHostname(url.hostname);
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new SourceFetchError('sourceUrl resolves to a blocked address', 'blocked_url');
  }

  let addresses: ResolvedAddress[];
  if (isIP(hostname)) {
    addresses = [{address: hostname, family: isIP(hostname)}];
  } else {
    try {
      addresses = await lookup(hostname);
    } catch {
      throw new SourceFetchError('The source host could not be resolved', 'fetch_failed');
    }
  }

  if (!addresses.length || addresses.some(({address}) => !isPublicIp(address))) {
    throw new SourceFetchError('sourceUrl resolves to a blocked address', 'blocked_url');
  }

  return {url, address: addresses[0]};
}

async function getNodeFetch(): Promise<(url: string, init: any) => Promise<any>> {
  const imported = await import('node-fetch');
  return ((imported as any).default || imported) as (url: string, init: any) => Promise<any>;
}

function pinnedAgent(protocol: string, resolved: ResolvedAddress): http.Agent | https.Agent {
  const options = {
    keepAlive: false,
    lookup: (_hostname: string, lookupOptions: any, callback: any) => {
      if (lookupOptions?.all) callback(null, [{address: resolved.address, family: resolved.family}]);
      else callback(null, resolved.address, resolved.family);
    }
  };
  return protocol === 'https:' ? new https.Agent(options) : new http.Agent(options);
}

async function readLimitedBody(response: any, controller: AbortController): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DOWNLOAD_BYTES) {
    throw new SourceFetchError('The source page is too large', 'source_too_large');
  }

  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const rawChunk of response.body as AsyncIterable<Uint8Array>) {
    const chunk = Buffer.from(rawChunk);
    bytes += chunk.length;
    if (bytes > MAX_DOWNLOAD_BYTES) {
      controller.abort();
      throw new SourceFetchError('The source page is too large', 'source_too_large');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] !== '#') return named[code.toLowerCase()] ?? entity;
    const value = code[1].toLowerCase() === 'x'
      ? Number.parseInt(code.slice(2), 16)
      : Number.parseInt(code.slice(1), 10);
    return Number.isFinite(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : entity;
  });
}

function attributeValue(tag: string, attribute: string): string | undefined {
  const pattern = new RegExp(`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = pattern.exec(tag);
  return match ? decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? '').trim() : undefined;
}

function metaValues(html: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (attributeValue(tag, 'name') || attributeValue(tag, 'property') || '').toLowerCase();
    const content = attributeValue(tag, 'content');
    if (key && content && !values.has(key)) values.set(key, content);
  }
  return values;
}

function compact(value: string, maxLength: number): string {
  return decodeHtmlEntities(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

async function withinDeadline<T>(promise: Promise<T>, deadlineAt: number): Promise<T> {
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) throw new SourceFetchError('The source request timed out', 'fetch_failed');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new SourceFetchError('The source request timed out', 'fetch_failed')),
          remainingMs
        );
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function extractArticleHtml(html: string, url: URL): {text: string; citation: string} {
  const meta = metaValues(html);
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  let article: {
    title?: string | null;
    byline?: string | null;
    siteName?: string | null;
    textContent?: string | null;
  } | null = null;
  try {
    const dom = new JSDOM(html, {url: url.toString()});
    article = new Readability(dom.window.document as any).parse();
    dom.window.close();
  } catch {
    // The conservative tag-strip fallback below still handles malformed HTML.
  }

  const title = compact(meta.get('og:title') || article?.title || titleMatch?.[1] || '', 160);
  const author = compact(meta.get('author') || meta.get('article:author') || article?.byline || '', 100);
  const site = compact(meta.get('og:site_name') || article?.siteName || url.hostname.replace(/^www\./, ''), 100);
  const date = meta.get('article:published_time') || meta.get('date') || meta.get('datepublished') || '';
  const year = /(?:19|20)\d{2}/.exec(date)?.[0];
  const label = author || site || title || url.hostname;
  const citation = compact(`${label}${year ? `, ${year}` : ''}`, 160);

  const fallbackText = html
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(?:p|div|article|section|main|h[1-6]|li|blockquote|br|tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = compact(article?.textContent || fallbackText, MAX_SOURCE_CHARS);
  return {text, citation};
}

async function fetchPage(rawUrl: string): Promise<{body: string; contentType: string; finalUrl: URL}> {
  const fetchImpl = await getNodeFetch();
  let nextUrl = rawUrl;
  const deadlineAt = Date.now() + FETCH_DEADLINE_MS;
  let redirects = 0;

  while (Date.now() < deadlineAt) {
    const {url, address} = await withinDeadline(validatePublicUrl(nextUrl), deadlineAt);
    let redirected = false;

    for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt += 1) {
      const remainingMs = deadlineAt - Date.now();
      if (remainingMs <= 0) break;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.min(6_000, remainingMs));
      try {
        const response = await fetchImpl(url.toString(), {
          method: 'GET',
          headers: {
            'Accept': 'text/html, application/xhtml+xml, text/plain;q=0.9',
            'User-Agent': 'EvidexArticleFetcher/1.0 (+https://ev1dex.com)'
          },
          redirect: 'manual',
          signal: controller.signal,
          agent: pinnedAgent(url.protocol, address)
        });

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          response.body?.destroy?.();
          if (!location || redirects >= MAX_REDIRECTS) {
            throw new SourceFetchError('The source returned too many redirects', 'fetch_failed');
          }
          nextUrl = new URL(location, url).toString();
          redirects += 1;
          redirected = true;
          break;
        }

        if (!response.ok) {
          response.body?.destroy?.();
          const retryAfter = response.headers.get('retry-after');
          let retryDelay: number | null = null;
          if (response.status === 408 || (response.status >= 500 && response.status <= 504)) {
            retryDelay = 200 * (attempt + 1);
          } else if (response.status === 429 && retryAfter) {
            const seconds = Number(retryAfter);
            const parsedDelay = Number.isFinite(seconds)
              ? seconds * 1_000
              : new Date(retryAfter).getTime() - Date.now();
            if (parsedDelay >= 0 && parsedDelay <= 1_000) retryDelay = parsedDelay;
          }

          if (retryDelay !== null && attempt + 1 < MAX_FETCH_ATTEMPTS && Date.now() + retryDelay < deadlineAt) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            continue;
          }
          throw new SourceFetchError(`The source returned HTTP ${response.status}`, 'fetch_failed');
        }

        const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!['text/html', 'application/xhtml+xml', 'text/plain'].includes(contentType)) {
          response.body?.destroy?.();
          throw new SourceFetchError('The source is not an HTML or plain-text document', 'unsupported_content');
        }
        const body = await readLimitedBody(response, controller);
        return {body, contentType, finalUrl: url};
      } catch (error: any) {
        if (error instanceof SourceFetchError) throw error;
        const canRetry = attempt + 1 < MAX_FETCH_ATTEMPTS && Date.now() + 200 < deadlineAt;
        if (canRetry) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          continue;
        }
        if (error?.name === 'AbortError') throw new SourceFetchError('The source request timed out', 'fetch_failed');
        throw new SourceFetchError('The source page could not be fetched', 'fetch_failed');
      } finally {
        clearTimeout(timeout);
      }
    }

    if (!redirected) break;
  }

  throw new SourceFetchError('The source request timed out', 'fetch_failed');
}

function cacheKey(url: URL): string {
  const copy = new URL(url.toString());
  copy.hash = '';
  return copy.toString();
}

function cachedSource(url: URL): SourceDocument | null {
  const key = cacheKey(url);
  const cached = sourceCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    sourceCache.delete(key);
    return null;
  }
  return {...cached.document};
}

function storeSource(originalUrl: URL, document: SourceDocument): void {
  if (sourceCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = sourceCache.keys().next().value as string | undefined;
    if (oldestKey) sourceCache.delete(oldestKey);
  }
  sourceCache.set(cacheKey(originalUrl), {expiresAt: Date.now() + CACHE_TTL_MS, document: {...document}});
}

export async function resolveSource(input: {
  sourceText?: unknown;
  sourceUrl?: unknown;
  citation?: unknown;
}): Promise<SourceDocument> {
  const sourceText = typeof input.sourceText === 'string' ? input.sourceText.trim() : '';
  const sourceUrl = typeof input.sourceUrl === 'string' ? input.sourceUrl.trim() : '';
  const requestedCitation = typeof input.citation === 'string' ? compact(input.citation, 160) : '';
  const parsedSourceUrl = sourceUrl ? parseSourceUrl(sourceUrl) : null;

  if (sourceText) {
    if (sourceText.length > MAX_SOURCE_CHARS) {
      throw new SourceFetchError(`sourceText may contain at most ${MAX_SOURCE_CHARS} characters`, 'source_too_large');
    }
    let fallbackCitation = 'Provided source';
    if (parsedSourceUrl) fallbackCitation = parsedSourceUrl.hostname.replace(/^www\./, '');
    return {
      text: sourceText,
      ...(parsedSourceUrl ? {url: parsedSourceUrl.toString()} : {}),
      citation: requestedCitation || fallbackCitation,
      source: 'provided_text'
    };
  }

  if (!parsedSourceUrl) throw new SourceFetchError('Provide sourceText or sourceUrl', 'invalid_url');
  const cached = cachedSource(parsedSourceUrl);
  if (cached) return {...cached, citation: requestedCitation || cached.citation};

  const fetched = await fetchPage(parsedSourceUrl.toString());
  const extracted = fetched.contentType === 'text/plain'
    ? {text: compact(fetched.body, MAX_SOURCE_CHARS), citation: fetched.finalUrl.hostname.replace(/^www\./, '')}
    : extractArticleHtml(fetched.body, fetched.finalUrl);
  if (extracted.text.length < 20) throw new SourceFetchError('The source page did not contain readable text', 'fetch_failed');
  const document: SourceDocument = {
    text: extracted.text,
    url: fetched.finalUrl.toString(),
    citation: extracted.citation,
    source: 'fetched_url'
  };
  storeSource(parsedSourceUrl, document);
  return {...document, citation: requestedCitation || document.citation};
}
