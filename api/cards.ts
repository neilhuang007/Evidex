import type {VercelRequest, VercelResponse} from '@vercel/node';
import {cutCard} from '../src/cards/card-service';
import {authorizeAgent, clientAddress, consumeRateLimit, toApiFailure} from '../src/http/api-security';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({error: {code: 'method_not_allowed', message: 'Use POST'}});
    return;
  }

  const authorization = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  const authFailure = authorizeAgent(authorization);
  if (authFailure) {
    res.status(authFailure.statusCode).json(authFailure.body);
    return;
  }

  const rate = consumeRateLimit('cards', clientAddress(req.headers, undefined, 'vercel'), 60);
  res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
    res.status(429).json({error: {code: 'rate_limited', message: 'Too many requests'}});
    return;
  }

  try {
    const result = await cutCard((req.body || {}) as Record<string, unknown>);
    res.status(200).json(result);
  } catch (error) {
    const failure = toApiFailure(error);
    res.status(failure.statusCode).json(failure.body);
  }
}
