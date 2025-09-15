import type { VercelRequest, VercelResponse } from '@vercel/node';
import { parseTagged, renderDocxBuffer } from '../src/exporters/wordHandler';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { cards } = (req.body || {}) as any;
    if (!Array.isArray(cards) || cards.length === 0) {
      res.status(400).json({ error: 'cards[] required' });
      return;
    }

    const blocks: string[] = [];
    for (const c of cards) {
      const tagline = (c?.tagline ?? '').toString();
      const link = (c?.link ?? '').toString();
      const cite = (c?.cite ?? '').toString();
      const content = (c?.content ?? '').toString();
      blocks.push(`
[TAGLINE]${tagline}[/TAGLINE]
[LINK]${link}[/LINK]

[CITE]${cite}[/CITE]

${content}
`.trim());
    }

    const tagged = blocks.join('\n\n\n'); // Extra blank line between cards
    const nodes = parseTagged(tagged);
    const buffer = await renderDocxBuffer(nodes);

    const fileName = `cards_${Date.now()}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error generating bulk document:', error);
    res.status(500).json({ error: 'Failed to generate document' });
  }
}

