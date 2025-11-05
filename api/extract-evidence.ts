import type {VercelRequest, VercelResponse} from '@vercel/node';
import {convertContentParts, generateWithRetry} from '../src/ai/gemini-wrapper';
import * as path from 'path';
import * as fs from 'fs';

function loadPromptConfig() {
    try {
        const configPath = path.join(process.cwd(), 'config', 'prompts', 'evidence_extractor.json');
        const configContent = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(configContent);
    } catch (error) {
        console.error('[extract-evidence] Failed to load prompt config:', error);
        // Fallback to hardcoded prompt if config file not found
        return {
            system: "You are an assistant researcher. Your task is to extract evidence from text and create concise taglines.",
            instructions: "REQUIREMENTS:\n1. Extract all evidence pieces that include citations or source links\n2. For each piece of evidence, create a brief tagline that captures the overarching idea\n3. The tagline should be brief and does not have to form a perfect sentence\n4. The tagline should reflect the main concept, NOT simply restate the data or content\n5. Return results as a JSON array with format: [{\"tagline\": \"...\", \"link\": \"...\"}]\n\nReturn ONLY the JSON array, no additional text or formatting."
        };
    }
}

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
        // Load prompt configuration from JSON file
        const promptConfig = loadPromptConfig();
        const systemPrompt = `${promptConfig.system}\n\n${promptConfig.instructions}`;

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
