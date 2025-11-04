import type {VercelRequest, VercelResponse} from '@vercel/node';
import {renderPdfBuffer} from '../src/exporters/pdfHandler';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.status(405).json({error: 'Method not allowed'});
        return;
    }
    try {
        const {cards} = (req.body || {}) as any;
        console.log('Received cards data for PDF:', JSON.stringify(cards, null, 2));

        if (!Array.isArray(cards) || cards.length === 0) {
            res.status(400).json({error: 'cards[] required'});
            return;
        }

        const buffer = await renderPdfBuffer(cards);

        const fileName = `cards_${Date.now()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(buffer);
    } catch (error) {
        console.error('Error generating PDF document:', error);
        res.status(500).json({error: 'Failed to generate PDF document'});
    }
}
