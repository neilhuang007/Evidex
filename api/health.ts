import type { VercelRequest, VercelResponse } from '@vercel/node';
import {DEEPSEEK_MODEL, getDeepSeekApiKey} from '../src/ai/deepseek-wrapper';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ai: {provider: 'deepseek', model: DEEPSEEK_MODEL, configured: Boolean(getDeepSeekApiKey())}
  });
}

