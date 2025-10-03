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
 * API base URL for making requests
 */
export const API_BASE = '';
