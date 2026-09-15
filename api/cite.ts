import type {VercelRequest, VercelResponse} from '@vercel/node';
import {cutCard} from '../src/cards/card-service';
import {evaluateCard} from '../src/ai/evidence-services';
import {clientAddress, consumeRateLimit, toApiFailure} from '../src/http/api-security';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({error: 'Method not allowed'});
    return;
  }

  const rate = consumeRateLimit('public-ai', clientAddress(req.headers, undefined, 'vercel'), 30);
  res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
    res.status(429).json({status: 'fetch_error', cite: '', content: '', error: 'Too many requests'});
    return;
  }

  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const result = await cutCard({
      tagline: body.tagline,
      link: body.link,
      sourceUrl: body.sourceUrl,
      sourceText: body.sourceText,
      citation: body.citation,
      cite: body.cite,
      markdownContent: body.markdownContent,
      content: body.content
    });

    let evaluation = null;
    const isDirectCut = typeof body.markdownContent === 'string' || typeof body.content === 'string';
    if (body.includeEvaluation === true || (!isDirectCut && body.includeEvaluation !== false)) {
      try {
        evaluation = await evaluateCard({
          tagline: result.card.tagline,
          cite: result.card.cite,
          content: result.card.content,
          link: result.card.link || 'Provided source'
        }, {retries: 1, timeoutMs: 8_000});
      } catch {
        // Evaluation is supplementary and must not discard a grounded card.
      }
    }

    res.status(200).json({
      status: 'success',
      cite: result.card.cite,
      content: result.card.content,
      plainText: result.card.plainText,
      markdownContent: result.card.markdownContent,
      highlights: result.card.highlights,
      evaluation,
      meta: result.meta
    });
  } catch (error) {
    const failure = toApiFailure(error);
    res.status(200).json({
      status: 'fetch_error',
      cite: '',
      content: '',
      error: failure.body.error.message,
      errorCode: failure.body.error.code
    });
  }
}
