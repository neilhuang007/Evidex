import 'dotenv/config';
import 'dotenv/config';
import express from 'express';
import path from 'path';
import {cutCard} from './cards/card-service';
import {evaluateCard, extractEvidence} from './ai/evidence-services';
import {DEEPSEEK_MODEL, getDeepSeekApiKey} from './ai/deepseek-wrapper';
import {authorizeAgent, clientAddress, consumeRateLimit, toApiFailure} from './http/api-security';
import {ExportInputError, exportDocxCards, normalizeExportCard, normalizeExportCards} from './exporters/card-export';
import {renderPdfBuffer} from './exporters/pdfHandler';

export const app = express();
const PORT = process.env.PORT || 3000;
const trustedProxy = process.env.TRUST_CLOUDFLARE === 'true' ? 'cloudflare' : undefined;

app.use(express.json({limit: '512kb'}));
app.use(express.static(path.join(process.cwd(), 'public')));

app.post('/api/cite', async (req, res) => {
  const rate = consumeRateLimit('public-ai', clientAddress(req.headers, req.socket.remoteAddress, trustedProxy), 30);
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
      } catch {}
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
      status: 'fetch_error', cite: '', content: '',
      error: failure.body.error.message,
      errorCode: failure.body.error.code
    });
  }
});

app.post('/api/cards', async (req, res) => {
  const authFailure = authorizeAgent(req.headers.authorization);
  if (authFailure) {
    res.status(authFailure.statusCode).json(authFailure.body);
    return;
  }
  const rate = consumeRateLimit('cards', clientAddress(req.headers, req.socket.remoteAddress, trustedProxy), 60);
  res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
    res.status(429).json({error: {code: 'rate_limited', message: 'Too many requests'}});
    return;
  }
  try {
    res.status(200).json(await cutCard(req.body || {}));
  } catch (error) {
    const failure = toApiFailure(error);
    res.status(failure.statusCode).json(failure.body);
  }
});

app.post('/api/evaluate', async (req, res) => {
  const rate = consumeRateLimit('public-ai', clientAddress(req.headers, req.socket.remoteAddress, trustedProxy), 30);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
    res.status(429).json({error: 'Too many requests'});
    return;
  }
  try {
    res.status(200).json(await evaluateCard(req.body || {}));
  } catch (error) {
    const failure = toApiFailure(error);
    res.status(failure.statusCode).json(failure.body);
  }
});

app.post('/api/extract-evidence', async (req, res) => {
  const rate = consumeRateLimit('public-ai', clientAddress(req.headers, req.socket.remoteAddress, trustedProxy), 30);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
    res.status(429).json({error: 'Too many requests'});
    return;
  }
  try {
    const result = await extractEvidence(req.body?.text);
    if (!result.items.length) {
      res.status(400).json({error: 'No valid evidence links found in text'});
      return;
    }
    res.status(200).json({success: true, ...result});
  } catch (error) {
    const failure = toApiFailure(error);
    res.status(failure.statusCode).json(failure.body);
  }
});

app.post('/api/download-docx', async (req, res) => {
  try {
    const card = normalizeExportCard(req.body);
    const buffer = await exportDocxCards([card]);
    const safe = card.cite.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'card';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}_${Date.now()}.docx"`);
    res.send(buffer);
  } catch (error) {
    res.status(error instanceof ExportInputError ? 400 : 500).json({
      error: error instanceof ExportInputError ? error.message : 'Failed to generate document'
    });
  }
});

app.post('/api/download-docx-bulk', async (req, res) => {
  try {
    const buffer = await exportDocxCards(normalizeExportCards(req.body?.cards));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="cards_${Date.now()}.docx"`);
    res.send(buffer);
  } catch (error) {
    res.status(error instanceof ExportInputError ? 400 : 500).json({
      error: error instanceof ExportInputError ? error.message : 'Failed to generate document'
    });
  }
});

app.post('/api/download-pdf-bulk', async (req, res) => {
  try {
    const buffer = await renderPdfBuffer(normalizeExportCards(req.body?.cards));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="cards_${Date.now()}.pdf"`);
    res.send(buffer);
  } catch (error) {
    res.status(error instanceof ExportInputError ? 400 : 500).json({
      error: error instanceof ExportInputError ? error.message : 'Failed to generate document'
    });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ai: {provider: 'deepseek', model: DEEPSEEK_MODEL, configured: Boolean(getDeepSeekApiKey())}
  });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Evidex server listening on http://localhost:${PORT}`);
  });
}
