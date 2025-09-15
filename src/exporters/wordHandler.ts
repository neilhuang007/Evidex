import { promises as fs } from "fs";
import * as path from "path";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ShadingType,
  ExternalHyperlink,
} from "docx";

export type InlineRun = { kind: "plain" | "hl"; text: string };

export type RenderNode =
  | { kind: "tagline"; runs: InlineRun[] }
  | { kind: "text"; runs: InlineRun[] }
  | { kind: "link"; href: string; text: string }
  | { kind: "cite"; text: string };

export interface WordHandlerOptions {
  outputDir?: string; // default: "output"
  fileName?: string; // optional custom file name
}

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

function ptToHalfPoints(pt: number): number {
  return Math.round(pt * 2);
}

export function parseTagged(input: string): RenderNode[] {
  const cleanInput = input.replace(/\r\n/g, "\n").trim();
  const nodes: RenderNode[] = [];
  
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
    } else {
      break;
    }
  }

  return nodes;
}

function parseRuns(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  const re = /<HL>([\s\S]*?)<\/HL>/gi;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
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

function renderParagraphs(nodes: RenderNode[]): Paragraph[] {
  const paras: Paragraph[] = [];
  for (const node of nodes) {
    if (node.kind === "tagline") {
      const children = node.runs.map((r) =>
        r.kind === "hl"
          ? new TextRun({
              text: r.text,
              bold: false,
              size: ptToHalfPoints(SIZES.highlightPt),
              shading: { type: ShadingType.CLEAR, fill: COLORS.brightGreen, color: "auto" },
              font: FONT,
            })
          : new TextRun({
              text: r.text,
              bold: true,
              size: ptToHalfPoints(SIZES.taglinePt),
              font: FONT,
            })
      );
      paras.push(new Paragraph({ children }));
      // No blank line after tagline - link goes directly underneath
    } else if (node.kind === "text") {
      const children = node.runs.map((r) =>
        r.kind === "hl"
          ? new TextRun({
              text: r.text,
              bold: false,
              size: ptToHalfPoints(SIZES.highlightPt),
              shading: { type: ShadingType.CLEAR, fill: COLORS.brightGreen, color: "auto" },
              font: FONT,
            })
          : new TextRun({
              text: r.text,
              size: ptToHalfPoints(SIZES.textPt),
              font: FONT,
            })
      );
      paras.push(new Paragraph({ children }));
    } else if (node.kind === "link") {
      // Render as clickable hyperlink with styling
      const linkRun = new TextRun({
        text: node.text || node.href,
        color: COLORS.darkBlue,
        size: ptToHalfPoints(SIZES.linkPt),
        font: FONT,
      });
      const hyperlink = new ExternalHyperlink({
        children: [linkRun],
        link: node.href || node.text,
      });
      paras.push(new Paragraph({ children: [hyperlink] }));
      // No blank line after link - controlled at card level
    } else if (node.kind === "cite") {
      const citeRun = new TextRun({
        text: node.text,
        italics: true,
        bold: true,
        color: "000000",
        size: ptToHalfPoints(SIZES.citePt),
        font: FONT,
        shading: { type: ShadingType.CLEAR, fill: COLORS.brightGreen, color: "auto" },
      });
      paras.push(new Paragraph({ children: [citeRun] }));
      // blank line after cite
      paras.push(new Paragraph({ children: [] }));
    }
  }
  return paras;
}

export async function renderDocxBuffer(nodes: RenderNode[]): Promise<Buffer> {
  const doc = new Document({
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

  const buf = await Packer.toBuffer(doc);
  return buf as Buffer;
}

export async function writeTaggedToDocx(
  input: string,
  opts: WordHandlerOptions = {}
): Promise<string> {
  const nodes = parseTagged(input);
  const buffer = await renderDocxBuffer(nodes);

  const outputDir = opts.outputDir || path.resolve("output");
  await fs.mkdir(outputDir, { recursive: true });

  const fileName =
    opts.fileName || `tagged_${new Date().toISOString().replace(/[:.]/g, "-")}.docx`;
  const outPath = path.join(outputDir, fileName);
  await fs.writeFile(outPath, buffer);
  return outPath;
}

// Convenience sample runner (optional)
export async function demoSample(): Promise<string> {
  const sample = `
[TAGLINE]AI assistants boost productivity[/TAGLINE]

Researchers find that <HL>AI assistance</HL> reduces task time by 23% across writing tasks.

[LINK href="https://example.com/study"]Smith 2024[/LINK]
  `.trim();
  return writeTaggedToDocx(sample);
}
