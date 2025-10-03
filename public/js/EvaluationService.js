// EvaluationService.js - Evidence evaluation service

import {API_BASE} from './utils.js';

export class EvaluationService {
    /**
     * Evaluate a single card
     * @param {Object} card - Card object with tagline, cite, content, link
     * @returns {Promise<Object|null>} Evaluation result with score and breakdown
     */
    static async evaluateCard(card) {
        if (!card || card.pending) return null;

        try {
            const response = await fetch(`${API_BASE}/api/evaluate`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    tagline: card.tagline,
                    cite: card.cite,
                    content: card.content,
                    link: card.link
                })
            });

            if (!response.ok) {
                console.error('Evaluation failed:', response.status);
                return null;
            }

            const data = await response.json();
            return {
                score: data.score,
                credibility: data.credibility,
                support: data.support,
                contradictions: data.contradictions
            };
        } catch (error) {
            console.error('Error evaluating card:', error);
            return null;
        }
    }

    /**
     * Calculate average evaluation score for a group of cards
     * @param {Array} cards - Array of card objects
     * @returns {number} Average score (0-6)
     */
    static calculateGroupScore(cards) {
        if (!cards || cards.length === 0) return 0;

        // Filter out cards without evaluation scores
        const evaluatedCards = cards.filter(c =>
            c.evaluationScore !== undefined && c.evaluationScore !== null
        );

        if (evaluatedCards.length === 0) return 0;

        // Calculate average score
        const sum = evaluatedCards.reduce((acc, c) => acc + (c.evaluationScore || 0), 0);
        const avg = sum / evaluatedCards.length;

        // Round to nearest integer for display
        return Math.round(avg);
    }

    /**
     * Calculate average breakdown for a group of cards
     * @param {Array} cards - Array of card objects
     * @returns {Object|null} Average breakdown with credibility, support, contradictions
     */
    static calculateGroupBreakdown(cards) {
        if (!cards || cards.length === 0) return null;

        // Filter out cards without evaluation breakdowns
        const evaluatedCards = cards.filter(c =>
            c.evaluationBreakdown !== undefined && c.evaluationBreakdown !== null
        );

        if (evaluatedCards.length === 0) return null;

        // Calculate averages for each metric
        const credibilitySum = evaluatedCards.reduce((acc, c) =>
            acc + (c.evaluationBreakdown.credibility?.score || 0), 0
        );
        const supportSum = evaluatedCards.reduce((acc, c) =>
            acc + (c.evaluationBreakdown.support?.score || 0), 0
        );
        const contradictionsSum = evaluatedCards.reduce((acc, c) =>
            acc + (c.evaluationBreakdown.contradictions?.score || 0), 0
        );

        const count = evaluatedCards.length;

        return {
            credibility: {
                score: (credibilitySum / count).toFixed(1),
                reasoning: evaluatedCards[0].evaluationBreakdown.credibility?.reasoning || ''
            },
            support: {
                score: (supportSum / count).toFixed(1),
                reasoning: evaluatedCards[0].evaluationBreakdown.support?.reasoning || ''
            },
            contradictions: {
                score: (contradictionsSum / count).toFixed(1),
                reasoning: evaluatedCards[0].evaluationBreakdown.contradictions?.reasoning || ''
            }
        };
    }
}
