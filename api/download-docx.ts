import type {VercelRequest, VercelResponse} from '@vercel/node';
import {ExportInputError, exportDocxCards, normalizeExportCard} from '../src/exporters/card-export';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({error: 'Method not allowed'});
    return;
  }
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
}
