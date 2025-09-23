import type {VercelRequest, VercelResponse} from '@vercel/node';
import {parseTagged, renderDocxBuffer} from '../src/exporters/wordHandler';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
      const {tagline, link, cite, content, highlightColor} = (req.body || {}) as any;
    if (!tagline || !link || !cite || !content) {
      res.status(400).json({ error: 'tagline, link, cite, and content are required' });
      return;
    }

    const taggedBlock = `
[TAGLINE]${tagline}[/TAGLINE]
[LINK]${link}[/LINK]

[CITE]${cite}[/CITE]

${content}
`.trim();

      const nodes = parseTagged(taggedBlock, highlightColor);
      const buffer = await renderDocxBuffer(nodes, highlightColor);

    const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'card';
    const fileName = `${safe(cite)}_${Date.now()}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error generating document:', error);
    res.status(500).json({ error: 'Failed to generate document' });
  }
}

