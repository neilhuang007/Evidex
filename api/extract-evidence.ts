import type {VercelRequest, VercelResponse} from '@vercel/node';
import {convertContentParts, generateWithRetry} from '../src/ai/gemini-wrapper';

function coerceJson(text: string): any | null {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
    }
    const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(text);
    if (fenced && fenced[1]) {
        try {
            return JSON.parse(fenced[1]);
        } catch {
        }
    }
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) {
        try {
            return JSON.parse(text.slice(first, last + 1));
        } catch {
        }
    }
    // Try to find array of objects
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (firstBracket >= 0 && lastBracket > firstBracket) {
        try {
            return JSON.parse(text.slice(firstBracket, lastBracket + 1));
        } catch {
        }
    }
    return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({error: 'Method not allowed'});
    }

    const {text} = req.body;
    if (!text || typeof text !== 'string') {
        return res.status(400).json({error: 'Missing or invalid text input'});
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        return res.status(500).json({error: 'Gemini API key not configured'});
    }

    try {
        const systemPrompt = `You are an assistant researcher. Your task is to extract evidence from text and create concise taglines.

REQUIREMENTS:
1. Extract all evidence pieces that include citations or source links
2. For each piece of evidence, create a brief tagline that captures the overarching idea
3. The tagline should be brief and does not have to form a perfect sentence
4. The tagline should reflect the main concept, NOT simply restate the data or content
5. Return results as a JSON array with format: [{"tagline": "...", "link": "..."}]

EXAMPLE:
Input: "Member States are allowed to take unilateral measures and restrict this freedom on grounds of public policy according to https://example.com/eu-law"
Output: [{"tagline": "EU allows member states to react in face to crisis", "link": "https://example.com/eu-law"}]

Return ONLY the JSON array, no additional text or formatting.`;

        const userPrompt = `Extract evidence and create taglines from the following text:\n\n${text}`;

        const contents = convertContentParts([{text: userPrompt}]);
        const aiResponse = await generateWithRetry(
            contents,
            systemPrompt,
            -1, // no thinking budget needed for this task
            'gemini-2.5-flash', // use flash for speed
            3,
            apiKey
        );

        console.log('[extract-evidence] AI Response:', aiResponse);

        // Try to parse the response as JSON
        const parsed = coerceJson(aiResponse);

        if (!parsed) {
            console.error('[extract-evidence] Failed to parse AI response as JSON');
            return res.status(500).json({error: 'Failed to parse AI response'});
        }

        // Ensure it's an array
        const results = Array.isArray(parsed) ? parsed : [parsed];

        // Validate results
        const validResults = results.filter(item =>
            item &&
            typeof item === 'object' &&
            item.tagline &&
            item.link &&
            typeof item.tagline === 'string' &&
            typeof item.link === 'string'
        );

        if (validResults.length === 0) {
            return res.status(400).json({error: 'No valid evidence found in text'});
        }

        console.log(`[extract-evidence] Successfully extracted ${validResults.length} evidence items`);

        return res.status(200).json({
            success: true,
            items: validResults
        });

    } catch (error: any) {
        console.error('[extract-evidence] Error:', error);
        return res.status(500).json({
            error: 'Failed to extract evidence',
            details: error.message
        });
    }
}
