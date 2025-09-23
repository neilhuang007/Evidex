import {promises as fs} from "fs";
import * as path from "path";
import {Document, ExternalHyperlink, Packer, Paragraph, ShadingType, TextRun,} from "docx";

export type InlineRun = { kind: "plain" | "hl"; text: string };

export type RenderNode =
    | { kind: "tagline"; runs: InlineRun[]; highlightColor?: string }
    | { kind: "text"; runs: InlineRun[]; highlightColor?: string }
  | { kind: "link"; href: string; text: string }
  | { kind: "cite"; text: string };

export interface WordHandlerOptions {
  outputDir?: string; // default: "output"
  fileName?: string; // optional custom file name
    highlightColor?: string; // custom highlight color (hex)
}

const FONT = "Times New Roman";
const COLORS = {
  darkBlue: "002060", // Word dark blue
  brightGreen: "00FF00",
    defaultHighlight: "00FF00",
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

export function parseTagged(input: string, defaultHighlightColor?: string): RenderNode[] {
    console.log('parseTagged called with color:', defaultHighlightColor);
  // Normalize newlines but DO NOT trim — preserve leading/trailing blanks
  const text = input.replace(/\r\n/g, "\n");
  const nodes: RenderNode[] = [];

  let i = 0;
  const len = text.length;
  while (i < len) {
    const s = text.slice(i);

    // [TAGLINE]...[/TAGLINE]\n?
    let m = /^\[TAGLINE\]([\s\S]*?)\[\/TAGLINE\](?:\n)?/i.exec(s);
    if (m) {
        nodes.push({kind: "tagline", runs: parseRuns(m[1]), highlightColor: defaultHighlightColor});
      i += m[0].length;
      continue;
    }

    // [LINK href="..."]text[/LINK]\n?  or [LINK]text[/LINK]\n?
    m = /^\[LINK(?:\s+href=\"([^\"]+)\")?\]([\s\S]*?)\[\/LINK\](?:\n)?/i.exec(s);
    if (m) {
      const href = (m[1] || m[2] || "").trim();
      const textContent = (m[2] || m[1] || href).trim();
      nodes.push({ kind: "link", href, text: textContent });
      i += m[0].length;
      continue;
    }

    // [CITE]...[/CITE]\n?
    m = /^\[CITE\]([\s\S]*?)\[\/CITE\](?:\n)?/i.exec(s);
    if (m) {
      nodes.push({ kind: "cite", text: m[1].trim() });
      i += m[0].length;
      continue;
    }

    // Not at a tag — consume text up to the next tag marker, preserving blanks
    const nextTagIdxs = ["[TAGLINE]", "[LINK", "[CITE]"].map((t) => s.indexOf(t)).filter((n) => n >= 0);
    let end = nextTagIdxs.length > 0 ? Math.min(...nextTagIdxs) : s.length;
    // Safety: if a malformed tag is at position 0 but regex didn't match, advance by 1 char
    if (end === 0) end = 1;

    const chunk = s.slice(0, end);
    if (chunk.length > 0) {
        nodes.push({kind: "text", runs: parseRuns(chunk), highlightColor: defaultHighlightColor});
      i += chunk.length;
      continue;
    }

    // Fallback: advance one char to avoid infinite loop
    i += 1;
  }

  return nodes;
}

function parseRuns(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
    console.log('parseRuns input text:', text);

    // Support both <HL> and <hl> tags (case insensitive)
    const re = /<hl>([\s\S]*?)<\/hl>/gi;

    // First normalize the text to ensure consistent case
    const originalText = text;
    text = text.replace(/<HL>/gi, '<hl>').replace(/<\/HL>/gi, '</hl>');
    console.log('parseRuns normalized text:', text);

  let lastIndex = 0;
  let m: RegExpExecArray | null;
    let matchCount = 0;
  while ((m = re.exec(text)) !== null) {
      matchCount++;
      console.log(`Found highlight match ${matchCount}:`, m[1]);
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
    console.log(`parseRuns found ${matchCount} highlights, returning ${runs.length} runs`);
  return runs;
}

function renderParagraphs(nodes: RenderNode[], defaultHighlightColor?: string): Paragraph[] {
  const paras: Paragraph[] = [];
  let trailingBlank = 0; // count of consecutive trailing blank paragraphs
  let suppressNextLeadingBlanks = false; // used to prevent extra blanks right after cite

    const makeRun = (r: InlineRun, mode: "tagline" | "text", nodeHighlightColor?: string) => {
        // Use node-specific color, then default color, then fallback
        const hlColor = nodeHighlightColor ? nodeHighlightColor.replace('#', '') :
            defaultHighlightColor ? defaultHighlightColor.replace('#', '') :
                COLORS.brightGreen;
        if (r.kind === "hl") {
            console.log(`Creating highlight run with color: ${hlColor} (node: ${nodeHighlightColor}, default: ${defaultHighlightColor})`);
        }

    if (mode === "tagline") {
      return r.kind === "hl"
        ? new TextRun({
            text: r.text,
              bold: true,
            size: ptToHalfPoints(SIZES.highlightPt),
              shading: {type: ShadingType.CLEAR, fill: hlColor, color: "auto"},
            font: FONT,
          })
        : new TextRun({
            text: r.text,
            bold: true,
            size: ptToHalfPoints(SIZES.taglinePt),
            font: FONT,
          });
    }
    // mode === 'text'
    return r.kind === "hl"
      ? new TextRun({
          text: r.text,
            bold: true,
          size: ptToHalfPoints(SIZES.highlightPt),
            shading: {type: ShadingType.CLEAR, fill: hlColor, color: "auto"},
          font: FONT,
        })
      : new TextRun({
          text: r.text,
          size: ptToHalfPoints(SIZES.textPt),
          font: FONT,
        });
  };

  const runsToParagraphSpecs = (
    runs: InlineRun[],
    mode: "tagline" | "text",
    nodeHighlightColor?: string
  ): { paragraph: Paragraph; isBlank: boolean }[] => {
    const paraRuns: TextRun[][] = [[]];
    for (const r of runs) {
      const parts = r.text.split("\n");
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part.length > 0) {
            paraRuns[paraRuns.length - 1].push(makeRun({...r, text: part}, mode, nodeHighlightColor));
        }
        if (i < parts.length - 1) {
          // newline boundary -> start a new paragraph
          paraRuns.push([]);
        }
      }
    }
    // Convert to Paragraphs (including empty ones to preserve blank lines)
    return paraRuns.map((children) => ({
      paragraph: new Paragraph({ children }),
      isBlank: children.length === 0,
    }));
  };

  const ensureExactlyOneTrailingBlank = () => {
    if (trailingBlank === 0) {
      paras.push(new Paragraph({ children: [] }));
      trailingBlank = 1;
    } else if (trailingBlank > 1) {
      // remove extras
      while (trailingBlank > 1) {
        paras.pop();
        trailingBlank -= 1;
      }
    }
  };

  const MAX_CONSECUTIVE_BLANKS = 2; // preserve up to two blanks (e.g., between cards)
  const appendParagraphSpec = (spec: { paragraph: Paragraph; isBlank: boolean }) => {
    if (spec.isBlank) {
      // Optionally suppress leading blanks once (e.g., immediately after cite)
      if (suppressNextLeadingBlanks) {
        return; // skip
      }
      // allow up to MAX_CONSECUTIVE_BLANKS blanks
      if (trailingBlank < MAX_CONSECUTIVE_BLANKS) {
        paras.push(spec.paragraph);
        trailingBlank += 1;
      }
    } else {
      paras.push(spec.paragraph);
      trailingBlank = 0;
      // once we see content, disable suppression
      suppressNextLeadingBlanks = false;
    }
  };

  for (const node of nodes) {
    if (node.kind === "tagline") {
      // Render tagline and ensure exactly one blank line after
        const specs = runsToParagraphSpecs(node.runs, "tagline", node.highlightColor);
      for (const spec of specs) appendParagraphSpec(spec);
      ensureExactlyOneTrailingBlank();
    } else if (node.kind === "text") {
      // Render text, compressing consecutive blank lines
        const specs = runsToParagraphSpecs(node.runs, "text", node.highlightColor);
      // If suppression is active, drop leading blanks in this chunk
      if (suppressNextLeadingBlanks) {
        let i = 0;
        while (i < specs.length && specs[i].isBlank) i += 1;
        // after dropping leading blanks, disable suppression
        suppressNextLeadingBlanks = false;
        for (; i < specs.length; i++) appendParagraphSpec(specs[i]);
      } else {
        for (const spec of specs) appendParagraphSpec(spec);
      }
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
      // Reset trailing blank count since we added content
      trailingBlank = 0;
    } else if (node.kind === "cite") {
      // Ensure exactly one blank line before cite
      ensureExactlyOneTrailingBlank();
        // Use the default highlight color for cite background, fallback to brightGreen
        const citeColor = defaultHighlightColor ? defaultHighlightColor.replace('#', '') : COLORS.brightGreen;
      const citeRun = new TextRun({
        text: node.text,
        italics: true,
        bold: true,
        color: "000000",
        size: ptToHalfPoints(SIZES.citePt),
        font: FONT,
          shading: {type: ShadingType.CLEAR, fill: citeColor, color: "auto"},
      });
      paras.push(new Paragraph({ children: [citeRun] }));
      trailingBlank = 0;
      // Ensure exactly one blank line after cite and suppress any additional leading blanks from following text
      ensureExactlyOneTrailingBlank();
      suppressNextLeadingBlanks = true;
    }
  }
  return paras;
}

export async function renderDocxBuffer(nodes: RenderNode[], defaultHighlightColor?: string): Promise<Buffer> {
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
          children: renderParagraphs(nodes, defaultHighlightColor),
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
    const nodes = parseTagged(input, opts.highlightColor);
    const buffer = await renderDocxBuffer(nodes, opts.highlightColor);

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

