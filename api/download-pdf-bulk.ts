import type {VercelRequest, VercelResponse} from '@vercel/node';
import {ExportInputError, normalizeExportCards} from '../src/exporters/card-export';
import {renderPdfBuffer} from '../src/exporters/pdfHandler';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({error: 'Method not allowed'});
    return;
  }
  try {
    const cards = normalizeExportCards(req.body?.cards);
    const buffer = await renderPdfBuffer(cards);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="cards_${Date.now()}.pdf"`);
    res.send(buffer);
  } catch (error) {
    res.status(error instanceof ExportInputError ? 400 : 500).json({
      error: error instanceof ExportInputError ? error.message : 'Failed to generate document'
    });
  }
}
