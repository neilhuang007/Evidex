/**
 * Example: Batch Evidence Citation and Document Generation
 *
 * This example demonstrates how to systematically cite multiple sources
 * and generate a single Word document containing all cards using only API calls.
 */

const fetch = require('node-fetch');
const fs = require('fs').promises;

const API_BASE = 'https://your-deployment.vercel.app'; // Change to your deployment URL

/**
 * Cite a single source and return the card data
 */
async function citeSource(tagline, sourceUrl) {
    console.log(`Citing: "${tagline}" from ${sourceUrl}`);

    const response = await fetch(`${API_BASE}/api/cite`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            tagline,
            link: sourceUrl,
            includeEvaluation: true
        })
    });

    const data = await response.json();

    if (data.status !== 'success') {
        throw new Error(`Failed to cite: ${data.error}`);
    }

    console.log(`  ✓ Citation: ${data.cite}`);
    console.log(`  ✓ Quality Score: ${data.evaluation?.score || 'N/A'}/10`);

    return {
        tagline,
        link: sourceUrl,
        cite: data.cite,
        content: data.content,
        evaluation: data.evaluation
    };
}

/**
 * Generate a Word document from multiple cards
 */
async function generateDocument(cards, outputPath) {
    console.log(`\nGenerating document with ${cards.length} cards...`);

    const response = await fetch(`${API_BASE}/api/download-docx-bulk`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            cards: cards.map((card, index) => ({
                tagline: card.tagline,
                link: card.link,
                cite: card.cite,
                content: card.content,
                // Alternate highlight colors for visual distinction
                highlightColor: index % 2 === 0 ? '#FFFF00' : '#00FFFF'
            }))
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to generate document: ${error.error}`);
    }

    const buffer = await response.buffer();
    await fs.writeFile(outputPath, buffer);

    console.log(`✓ Document saved to: ${outputPath}`);
}

/**
 * Main workflow: Cite multiple sources and generate a document
 */
async function main() {
    // Define sources to cite
    const sources = [
        {
            tagline: 'Climate change impacts are accelerating',
            url: 'https://example.com/climate-article'
        },
        {
            tagline: 'Renewable energy is cost-competitive',
            url: 'https://example.com/renewable-energy'
        },
        {
            tagline: 'AI improves medical diagnosis accuracy',
            url: 'https://example.com/ai-medicine'
        }
    ];

    try {
        // Step 1: Cite all sources (can be done in parallel)
        console.log('=== Step 1: Citing Sources ===\n');
        const cards = await Promise.all(
            sources.map(({tagline, url}) => citeSource(tagline, url))
        );

        // Step 2: Filter by quality (optional)
        const highQualityCards = cards.filter(card =>
            !card.evaluation || card.evaluation.score >= 7.0
        );

        console.log(`\n${highQualityCards.length}/${cards.length} cards meet quality threshold`);

        // Step 3: Generate Word document
        console.log('\n=== Step 2: Generating Document ===');
        await generateDocument(highQualityCards, './debate_cards.docx');

        console.log('\n✓ Complete! Your debate cards are ready.');

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Run the workflow
main();
