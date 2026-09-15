"""Build first; run with: py tests/export_regression.py (requires PyMuPDF)."""
from pathlib import Path
import subprocess
import zipfile
import xml.etree.ElementTree as ET
import fitz

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / '.smoke-output'
OUTPUT.mkdir(exist_ok=True)

subprocess.run(['node', '-e', r'''
const {writeFileSync} = require('node:fs');
const {renderPdfBuffer} = require('./dist/exporters/pdfHandler');
const {exportDocxCards, normalizeExportCard} = require('./dist/exporters/card-export');
(async () => {
  const cards = [{tagline:'Export regression', cite:'Synthetic fixture, 2026', link:'',
    content:'Opening sentence. <HL>Highlighted first line.\nHighlighted second line.</HL> Closing sentence.',
    highlightColor:'#FFFF00'}];
  writeFileSync('.smoke-output/multiline.pdf', await renderPdfBuffer(cards));
  cards[0].content = '<HL>' + Array.from({length:160}, (_, i) => `Evidence line ${i+1} preserves the original words.`).join('\n') + '</HL>';
  writeFileSync('.smoke-output/long-card.pdf', await renderPdfBuffer(cards));
  const wordCards = [
    normalizeExportCard({tagline:'First card', cite:'First citation', markdownContent:'Before **first highlight** after.', highlightColor:'#FFFF00'}),
    normalizeExportCard({tagline:'Second card', cite:'Second citation', content:'Literal [CITE] is source text. <HL>second highlight</HL>', highlightColor:'#00FFFF'}),
    normalizeExportCard({tagline:'Unhighlighted card', cite:'Third citation', content:'Plain text stays exportable after every highlight is removed.'})
  ];
  writeFileSync('.smoke-output/word-cards.docx', await exportDocxCards(wordCards));
})();
'''], cwd=ROOT, check=True, timeout=30)

with fitz.open(OUTPUT / 'multiline.pdf') as pdf:
    text = ''.join(page.get_text() for page in pdf)
    assert '<HL>' not in text and '</HL>' not in text, 'Multiline highlights leak literal HL tags into PDF'
    bold_text = ''.join(span['text'] for page in pdf for block in page.get_text('dict')['blocks']
                        if 'lines' in block for line in block['lines'] for span in line['spans']
                        if 'Bold' in span['font'])
    assert 'Highlighted first line.' in bold_text and 'Highlighted second line.' in bold_text

with fitz.open(OUTPUT / 'long-card.pdf') as pdf:
    text = ''.join(page.get_text() for page in pdf)
    assert 'Evidence line 160 preserves the original words.' in text, 'Long-card text is clipped off the PDF page'
    assert len(pdf) > 1, 'Long cards must paginate'

with zipfile.ZipFile(OUTPUT / 'word-cards.docx') as archive:
    root = ET.fromstring(archive.read('word/document.xml'))
    namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    ns = '{' + namespaces['w'] + '}'
    colors = {}
    for run in root.findall('.//w:r', namespaces):
        text = ''.join(node.text or '' for node in run.findall('w:t', namespaces))
        shading = run.find('w:rPr/w:shd', namespaces)
        if shading is not None:
            colors[text] = shading.get(ns + 'fill')
    assert colors['First citation'] == colors['first highlight'] == 'FFFF00'
    assert colors['Second citation'] == colors['second highlight'] == '00FFFF'
    text = ''.join(node.text or '' for node in root.findall('.//w:t', namespaces))
    assert 'Literal [CITE] is source text.' in text, 'Source text must not be parsed as document structure'
    assert 'Plain text stays exportable' in text
    assert not root.findall('.//w:hyperlink', namespaces), 'Source-only cards must not create empty hyperlinks'

print('PASS: multiline PDF highlights, pagination, Word colors, literal text, and unhighlighted export')
