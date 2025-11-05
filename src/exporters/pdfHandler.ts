import PDFDocument from 'pdfkit';

export interface PdfHandlerOptions {
    highlightColor?: string;
}

const FONT = 'Times-Roman';
const FONT_BOLD = 'Times-Bold';
const FONT_ITALIC = 'Times-Italic';
const FONT_BOLD_ITALIC = 'Times-BoldItalic';

const COLORS = {
    darkBlue: '#002060',
    defaultHighlight: '#00FF00',
    black: '#000000',
};

const SIZES = {
    tagline: 12,
    link: 6.5,
    text: 7.5,
    highlight: 12,
    cite: 10.5,
};

const LINE_HEIGHT_MULTIPLIER = 1.2; // 1.2x for comfortable single spacing

export async function renderPdfBuffer(cards: any[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'LETTER',
            margins: {top: 72, bottom: 72, left: 72, right: 72},
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        try {
            let isFirstCard = true;

            for (const card of cards) {
                if (!isFirstCard) {
                    doc.moveDown(3);  // Add extra blank line before next tagline
                }
                isFirstCard = false;

                const tagline = (card?.tagline ?? '').toString();
                const link = (card?.link ?? '').toString();
                const cite = (card?.cite ?? '').toString();
                const content = (card?.content ?? '').toString();
                const highlightColor = card?.highlightColor || COLORS.defaultHighlight;

                // Tagline (bold, 12pt)
                if (tagline) {
                    doc
                        .font(FONT_BOLD)
                        .fontSize(SIZES.tagline)
                        .fillColor(COLORS.black)
                        .text(tagline, {continued: false});
                    doc.moveDown(0.3);
                }

                // Link (small, dark blue)
                if (link) {
                    doc
                        .font(FONT)
                        .fontSize(SIZES.link)
                        .fillColor(COLORS.darkBlue)
                        .text(link, {link: link, underline: false, continued: false});
                    doc.moveDown(0.5);
                }

                // Citation (bold italic, 10.5pt)
                if (cite) {
                    doc
                        .font(FONT_BOLD_ITALIC)
                        .fontSize(SIZES.cite)
                        .fillColor(COLORS.black)
                        .text(cite, {continued: false});
                    doc.moveDown(0.5);
                }

                // Content with highlights
                if (content) {
                    renderContentWithHighlights(doc, content, highlightColor);
                    doc.moveDown(0.5);
                }
            }

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

function renderContentWithHighlights(
    doc: PDFKit.PDFDocument,
    content: string,
    highlightColor: string
) {
    // Normalize HL tags and line endings for consistent parsing
    let normalized = content
        .replace(/\r\n/g, '\n')
        .replace(/<\/?hl>/gi, (m) => m.toUpperCase());

    // Simple approach: split by HL tags and render sequentially
    const hlPattern = /<HL>(.*?)<\/HL>/gi;
    let lastIndex = 0;
    let match;

    const startX = doc.x;
    const startY = doc.y;
    const maxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const defaultLineHeight = doc.font(FONT).fontSize(SIZES.text).currentLineHeight();
    const defaultLineAdvance = defaultLineHeight * LINE_HEIGHT_MULTIPLIER;
    let lineHeightTracker = defaultLineAdvance;

    // Process text in segments
    const segments: Array<{ text: string; highlighted: boolean }> = [];

    while ((match = hlPattern.exec(normalized)) !== null) {
        // Add non-highlighted text before this match
        if (match.index > lastIndex) {
            const plainText = normalized.substring(lastIndex, match.index);
            if (plainText) {
                segments.push({text: plainText, highlighted: false});
            }
        }

        // Add highlighted text
        segments.push({text: match[1], highlighted: true});
        lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last match
    if (lastIndex < normalized.length) {
        const remaining = normalized.substring(lastIndex);
        if (remaining) {
            segments.push({text: remaining, highlighted: false});
        }
    }

    // Render segments
    let currentX = startX;
    let currentY = startY;
    let drewContent = false;

    for (const segment of segments) {
        if (!segment.text) continue;

        const fontName = segment.highlighted ? FONT_BOLD : FONT;
        const fontSize = segment.highlighted ? SIZES.highlight : SIZES.text;

        doc.font(fontName).fontSize(fontSize);
        const segmentLineHeight = doc.currentLineHeight();
        const segmentLineAdvance = segmentLineHeight * LINE_HEIGHT_MULTIPLIER;

        const rawLines = segment.text.split('\n');

        for (let rawIndex = 0; rawIndex < rawLines.length; rawIndex++) {
            let remainingLine = rawLines[rawIndex];

            if (remainingLine.length === 0) {
                drewContent = true;
                currentX = startX;
                currentY += lineHeightTracker;
                lineHeightTracker = defaultLineAdvance;
                continue;
            }

            let safetyCounter = 0;
            const maxIterations = remainingLine.length * 2; // Safety limit

            while (remainingLine.length > 0 && safetyCounter < maxIterations) {
                safetyCounter++;
                const availableWidth = startX + maxWidth - currentX;

                if (availableWidth <= 0) {
                    currentX = startX;
                    currentY += lineHeightTracker;
                    lineHeightTracker = defaultLineAdvance;
                    continue;
                }

                const {fitted, remainder} = fitTextToWidth(doc, remainingLine, availableWidth);

                // If nothing fits but we have remaining text, force render at least one character
                if (!fitted && remainingLine.length > 0) {
                    const forcedChar = remainingLine[0];
                    const charWidth = doc.widthOfString(forcedChar);
                    lineHeightTracker = Math.max(lineHeightTracker, segmentLineAdvance);

                    if (segment.highlighted) {
                        const paddingX = 1.5;
                        const paddingY = Math.max(2, segmentLineHeight * 0.15);
                        const rectHeight = segmentLineHeight;
                        doc.save()
                            .rect(
                                currentX - paddingX,
                                currentY - paddingY,
                                charWidth + paddingX * 2,
                                rectHeight + paddingY * 2
                            )
                            .fill(highlightColor)
                            .restore();
                    }

                    doc.fillColor(COLORS.black).text(forcedChar, currentX, currentY, {
                        lineBreak: false,
                        continued: false,
                    });

                    drewContent = true;
                    currentX += charWidth;
                    remainingLine = remainingLine.slice(1);

                    // Move to next line after forcing a character
                    currentX = startX;
                    currentY += lineHeightTracker;
                    lineHeightTracker = defaultLineAdvance;
                    continue;
                }

                const drawWidth = doc.widthOfString(fitted);
                lineHeightTracker = Math.max(lineHeightTracker, segmentLineAdvance);

                if (segment.highlighted) {
                    const paddingX = 1.5;
                    const paddingY = Math.max(2, segmentLineHeight * 0.15);
                    const rectHeight = segmentLineHeight;
                    doc.save()
                        .rect(
                            currentX - paddingX,
                            currentY - paddingY,
                            drawWidth + paddingX * 2,
                            rectHeight + paddingY * 2
                        )
                        .fill(highlightColor)
                        .restore();
                }

                doc.fillColor(COLORS.black).text(fitted, currentX, currentY, {
                    lineBreak: false,
                    continued: false,
                });

                drewContent = true;
                currentX += drawWidth;
                remainingLine = remainder;

                if (remainingLine.length > 0) {
                    currentX = startX;
                    currentY += lineHeightTracker;
                    lineHeightTracker = defaultLineAdvance;
                }
            }

            if (rawIndex < rawLines.length - 1) {
                currentX = startX;
                currentY += lineHeightTracker;
                lineHeightTracker = defaultLineAdvance;
            }
        }
    }

    if (drewContent) {
        currentY += lineHeightTracker;
        doc.x = startX;
        doc.y = currentY;
        doc.font(FONT).fontSize(SIZES.text);
    } else {
        doc.x = startX;
        doc.y = currentY;
        doc.font(FONT).fontSize(SIZES.text);
    }
}

function fitTextToWidth(
    doc: PDFKit.PDFDocument,
    text: string,
    availableWidth: number
): { fitted: string; remainder: string } {
    if (availableWidth <= 0 || text.length === 0) {
        return {fitted: '', remainder: text};
    }

    let breakIndex = text.length;
    let lastWhitespace = -1;

    for (let i = 1; i <= text.length; i++) {
        const slice = text.slice(0, i);
        const width = doc.widthOfString(slice);
        const char = text[i - 1];

        if (/\s/.test(char)) {
            lastWhitespace = i;
        }

        if (width > availableWidth) {
            if (lastWhitespace > 0) {
                breakIndex = lastWhitespace;
            } else {
                breakIndex = i - 1 > 0 ? i - 1 : 1;
            }
            break;
        }

        if (i === text.length) {
            breakIndex = text.length;
        }
    }

    const fitted = text.slice(0, breakIndex);
    const remainder = text.slice(breakIndex);

    return {fitted, remainder};
}
