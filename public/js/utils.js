// utils.js - Utility functions

/**
 * Convert hex color to rgba
 * @param {string} hex - Hex color code (e.g., '#FF0000')
 * @param {number} alpha - Alpha transparency value (0-1)
 * @returns {string} RGBA color string
 */
export function hexToRgba(hex, alpha = 1) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Convert paired Markdown bold delimiters to the app's canonical highlight tags.
 * A backslash can be used to keep a literal `**` delimiter.
 */
export function markdownHighlightsToTags(value) {
    const input = String(value ?? '');
    const delimiters = [];

    for (let index = 0; index < input.length - 1; index++) {
        if (input[index] !== '*' || input[index + 1] !== '*') continue;

        let backslashes = 0;
        for (let cursor = index - 1; cursor >= 0 && input[cursor] === '\\'; cursor--) {
            backslashes++;
        }
        if (backslashes % 2 === 0) delimiters.push(index);
        index++;
    }

    // Preserve an unmatched delimiter as ordinary text.
    if (delimiters.length % 2 !== 0) delimiters.pop();
    if (delimiters.length === 0) return input;

    let output = '';
    let cursor = 0;
    for (let index = 0; index < delimiters.length; index++) {
        const delimiter = delimiters[index];
        output += input.slice(cursor, delimiter);
        output += index % 2 === 0 ? '<HL>' : '</HL>';
        cursor = delimiter + 2;
    }

    return output + input.slice(cursor);
}

/**
 * Normalize model- or user-authored highlight markup into balanced, non-nested
 * `<HL>...</HL>` runs. Markdown bold is accepted as an agent-friendly alias.
 */
export function normalizeHighlightMarkup(value) {
    const input = markdownHighlightsToTags(value);
    const tokenPattern = /<\s*(\/?)\s*HL\s*>/gi;
    const runs = [];
    let depth = 0;
    let cursor = 0;
    let match;

    const append = (text, highlighted) => {
        if (!text) return;
        const previous = runs[runs.length - 1];
        if (previous && previous.highlighted === highlighted) {
            previous.text += text;
        } else {
            runs.push({text, highlighted});
        }
    };

    while ((match = tokenPattern.exec(input)) !== null) {
        append(input.slice(cursor, match.index), depth > 0);
        if (match[1]) {
            depth = Math.max(0, depth - 1);
        } else {
            depth++;
        }
        cursor = tokenPattern.lastIndex;
    }
    append(input.slice(cursor), depth > 0);

    return runs.map(run => run.highlighted
        ? `<HL>${run.text}</HL>`
        : run.text
    ).join('');
}

/**
 * API base URL for making requests
 */
export const API_BASE = '';
