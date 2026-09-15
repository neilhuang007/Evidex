import type {VercelRequest, VercelResponse} from '@vercel/node';
import {evaluateCard} from '../src/ai/evidence-services';
import {clientAddress, consumeRateLimit, toApiFailure} from '../src/http/api-security';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({error: 'Method not allowed'});
    return;
  }
  const rate = consumeRateLimit('public-ai', clientAddress(req.headers, undefined, 'vercel'), 30);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
    res.status(429).json({error: 'Too many requests'});
    return;
  }
  try {
    res.status(200).json(await evaluateCard((req.body || {}) as any));
  } catch (error) {
    const failure = toApiFailure(error);
    res.status(failure.statusCode).json(failure.body);
  }
}
