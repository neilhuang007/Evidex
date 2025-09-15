"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTagged = parseTagged;
exports.renderDocxBuffer = renderDocxBuffer;
exports.writeTaggedToDocx = writeTaggedToDocx;
exports.demoSample = demoSample;
const fs_1 = require("fs");
const path = __importStar(require("path"));
const docx_1 = require("docx");
const FONT = "Times New Roman";
const COLORS = {
    darkBlue: "002060", // Word dark blue
    brightGreen: "00FF00",
};
const SIZES = {
    taglinePt: 12, // bold
    linkPt: 6.5,
    textPt: 7.5,
    highlightPt: 12,
    // 14px ≈ 10.5pt
    citePt: 10.5,
};
function ptToHalfPoints(pt) {
    return Math.round(pt * 2);
}
function parseTagged(input) {
    const cleanInput = input.replace(/\r\n/g, "\n").trim();
    const nodes = [];
    // Parse tags sequentially from the input string
    let remaining = cleanInput;
    while (remaining.length > 0) {
        // Try to match tagline
        const taglineMatch = remaining.match(/^\[TAGLINE\]([\s\S]*?)\[\/TAGLINE\](?:\n|$)/i);
        if (taglineMatch) {
            nodes.push({ kind: "tagline", runs: parseRuns(taglineMatch[1].trim()) });
            remaining = remaining.slice(taglineMatch[0].length);
            continue;
        }
        // Try to match link
        const linkMatch = remaining.match(/^\[LINK(?:\s+href=\"([^\"]+)\")?\]([\s\S]*?)\[\/LINK\](?:\n|$)/i);
        if (linkMatch) {
            const href = (linkMatch[1] || linkMatch[2] || "").trim();
            const text = (linkMatch[2] || linkMatch[1] || href).trim();
            nodes.push({ kind: "link", href, text });
            remaining = remaining.slice(linkMatch[0].length);
            continue;
        }
        // Try to match cite
        const citeMatch = remaining.match(/^\[CITE\]([\s\S]*?)\[\/CITE\](?:\n|$)/i);
        if (citeMatch) {
            const text = citeMatch[1].trim();
            nodes.push({ kind: "cite", text });
            remaining = remaining.slice(citeMatch[0].length);
            continue;
        }
        // If no tags match, find the next line or end of string
        const nextLineMatch = remaining.match(/^(.*?)(?:\n|$)/);
        if (nextLineMatch) {
            const line = nextLineMatch[1].trim();
            if (line) {
                // Check if this is the start of content (not empty line)
                if (!line.match(/^\s*$/)) {
                    // Take everything remaining as content
                    nodes.push({ kind: "text", runs: parseRuns(remaining.trim()) });
                    break;
                }
            }
            remaining = remaining.slice(nextLineMatch[0].length);
        }
        else {
            break;
        }
    }
    return nodes;
}
function parseRuns(text) {
    const runs = [];
    const re = /<HL>([\s\S]*?)<\/HL>/gi;
    let lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
        const idx = m.index;
        if (idx > lastIndex) {
            runs.push({ kind: "plain", text: text.slice(lastIndex, idx) });
        }
        runs.push({ kind: "hl", text: m[1] });
        lastIndex = re.lastIndex;
    }
    if (lastIndex < text.length) {
        runs.push({ kind: "plain", text: text.slice(lastIndex) });
    }
    return runs;
}
function renderParagraphs(nodes) {
    const paras = [];
    for (const node of nodes) {
        if (node.kind === "tagline") {
            const children = node.runs.map((r) => r.kind === "hl"
                ? new docx_1.TextRun({
                    text: r.text,
                    bold: false,
                    size: ptToHalfPoints(SIZES.highlightPt),
                    shading: { type: docx_1.ShadingType.CLEAR, fill: COLORS.brightGreen, color: "auto" },
                    font: FONT,
                })
                : new docx_1.TextRun({
                    text: r.text,
                    bold: true,
                    size: ptToHalfPoints(SIZES.taglinePt),
                    font: FONT,
                }));
            paras.push(new docx_1.Paragraph({ children }));
            // No blank line after tagline - link goes directly underneath
        }
        else if (node.kind === "text") {
            const children = node.runs.map((r) => r.kind === "hl"
                ? new docx_1.TextRun({
                    text: r.text,
                    bold: false,
                    size: ptToHalfPoints(SIZES.highlightPt),
                    shading: { type: docx_1.ShadingType.CLEAR, fill: COLORS.brightGreen, color: "auto" },
                    font: FONT,
                })
                : new docx_1.TextRun({
                    text: r.text,
                    size: ptToHalfPoints(SIZES.textPt),
                    font: FONT,
                }));
            paras.push(new docx_1.Paragraph({ children }));
        }
        else if (node.kind === "link") {
            // Render as clickable hyperlink with styling
            const linkRun = new docx_1.TextRun({
                text: node.text || node.href,
                color: COLORS.darkBlue,
                size: ptToHalfPoints(SIZES.linkPt),
                font: FONT,
            });
            const hyperlink = new docx_1.ExternalHyperlink({
                children: [linkRun],
                link: node.href || node.text,
            });
            paras.push(new docx_1.Paragraph({ children: [hyperlink] }));
            // No blank line after link - controlled at card level
        }
        else if (node.kind === "cite") {
            const citeRun = new docx_1.TextRun({
                text: node.text,
                italics: true,
                bold: true,
                color: "000000",
                size: ptToHalfPoints(SIZES.citePt),
                font: FONT,
                shading: { type: docx_1.ShadingType.CLEAR, fill: COLORS.brightGreen, color: "auto" },
            });
            paras.push(new docx_1.Paragraph({ children: [citeRun] }));
            // blank line after cite
            paras.push(new docx_1.Paragraph({ children: [] }));
        }
    }
    return paras;
}
async function renderDocxBuffer(nodes) {
    const doc = new docx_1.Document({
        styles: {
            default: {
                document: {
                    run: { font: FONT },
                },
            },
        },
        sections: [
            {
                properties: {},
                children: renderParagraphs(nodes),
            },
        ],
    });
    const buf = await docx_1.Packer.toBuffer(doc);
    return buf;
}
async function writeTaggedToDocx(input, opts = {}) {
    const nodes = parseTagged(input);
    const buffer = await renderDocxBuffer(nodes);
    const outputDir = opts.outputDir || path.resolve("output");
    await fs_1.promises.mkdir(outputDir, { recursive: true });
    const fileName = opts.fileName || `tagged_${new Date().toISOString().replace(/[:.]/g, "-")}.docx`;
    const outPath = path.join(outputDir, fileName);
    await fs_1.promises.writeFile(outPath, buffer);
    return outPath;
}
// Convenience sample runner (optional)
async function demoSample() {
    const sample = `
[TAGLINE]AI assistants boost productivity[/TAGLINE]

Researchers find that <HL>AI assistance</HL> reduces task time by 23% across writing tasks.

[LINK href="https://example.com/study"]Smith 2024[/LINK]
  `.trim();
    return writeTaggedToDocx(sample);
}
