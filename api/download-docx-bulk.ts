import type {VercelRequest, VercelResponse} from '@vercel/node';
import {parseTagged, renderDocxBuffer} from '../src/exporters/wordHandler';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { cards } = (req.body || {}) as any;
      console.log('Received cards data:', JSON.stringify(cards, null, 2));
    if (!Array.isArray(cards) || cards.length === 0) {
      res.status(400).json({ error: 'cards[] required' });
      return;
    }

      const allNodes: any[] = [];

    for (const c of cards) {
      const tagline = (c?.tagline ?? '').toString();
      const link = (c?.link ?? '').toString();
      const cite = (c?.cite ?? '').toString();
      const content = (c?.content ?? '').toString();
        const cardColor = c?.highlightColor;
        console.log(`Card "${cite}" highlight color:`, cardColor);

        const cardTagged = `
[TAGLINE]${tagline}[/TAGLINE]
[LINK]${link}[/LINK]

[CITE]${cite}[/CITE]

${content}
`.trim();

        // Parse this card with its specific color
        const cardNodes = parseTagged(cardTagged, cardColor);
        allNodes.push(...cardNodes);

        // Add spacing between cards (2 blank paragraphs)
        if (allNodes.length > 0) {
            allNodes.push({kind: "text", runs: [{kind: "plain", text: "\n\n"}]});
        }
    }

      const buffer = await renderDocxBuffer(allNodes);

    const fileName = `cards_${Date.now()}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error generating bulk document:', error);
    res.status(500).json({ error: 'Failed to generate document' });
  }
}

