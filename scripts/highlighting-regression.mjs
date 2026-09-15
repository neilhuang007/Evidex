import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, extname, join, normalize} from 'node:path';
import {readFile} from 'node:fs/promises';

const repoRoot = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const chromePath = process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const testPage = String.raw`<!doctype html>
<meta charset="utf-8">
<pre id="result">RUNNING</pre>
<script type="module">
  import {EditingPanel} from '/js/EditingPanel.js';
  import {CardCutterApp} from '/js/CardCutterApp.js';
  import {markdownHighlightsToTags, normalizeHighlightMarkup} from '/js/utils.js';

  const results = [];
  const panel = Object.create(EditingPanel.prototype);
  panel.selectedColors = new Map([['card', '#00FF00']]);
  panel.defaultColor = '#00FF00';

  function check(name, condition, details = '') {
    results.push({name, passed: Boolean(condition), details});
  }
  function rangeBetween(root, startText, startOffset, endText, endOffset) {
    const range = document.createRange();
    range.setStart(startText, startOffset);
    range.setEnd(endText, endOffset);
    return range;
  }

  function rangeAtTextOffsets(root, start, end) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let position = 0;
    let startPoint;
    let endPoint;
    let node;
    while ((node = walker.nextNode())) {
      const nodeEnd = position + node.length;
      if (!startPoint && start >= position && start <= nodeEnd) {
        startPoint = [node, start - position];
      }
      if (!endPoint && end >= position && end <= nodeEnd) {
        endPoint = [node, end - position];
      }
      position = nodeEnd;
      if (startPoint && endPoint) break;
    }
    return rangeBetween(root, startPoint[0], startPoint[1], endPoint[0], endPoint[1]);
  }

  // Highlighting a cross-element range must not flatten inline markup or remove BRs.
  {
    const root = document.createElement('div');
    root.className = 'group-content';
    root.innerHTML = '<em>alpha</em><br><strong>beta</strong>';
    document.body.append(root);
    const originalEm = root.querySelector('em');
    const originalStrong = root.querySelector('strong');
    const range = rangeBetween(root, root.querySelector('em').firstChild, 1,
      root.querySelector('strong').firstChild, 2);
    panel.addHighlightsToSelection(range, root, 'card');
    check('add preserves markup', Boolean(root.querySelector('em') && root.querySelector('br') && root.querySelector('strong')), root.innerHTML);
    check('add does not rebuild formatting nodes', root.querySelector('em') === originalEm && root.querySelector('strong') === originalStrong, root.innerHTML);
    check('add preserves text', root.textContent === 'alphabeta', root.textContent);
    check('add has no nested highlights', !root.querySelector('.highlight .highlight'), root.innerHTML);
    const serialized = panel.serializeContentToHL(root);
    check('line break persists', serialized === 'a<HL>lpha</HL>\n<HL>be</HL>ta', serialized);
    root.remove();
  }

  // A mixed selection should become entirely highlighted when the toggle is used.
  {
    const root = document.createElement('div');
    root.className = 'group-content';
    root.innerHTML = '<span class="highlight">alpha</span> beta';
    document.body.append(root);
    panel.contentElements = new Map([['card', root]]);
    const range = document.createRange();
    range.selectNodeContents(root);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const button = document.createElement('button');
    button.className = 'highlight-toggle';
    panel.handleHighlightToggle(button, 'card');
    const rerange = document.createRange();
    rerange.selectNodeContents(root);
    check('mixed toggle fills selection', panel.isSelectionEntirelyHighlighted(rerange), root.innerHTML);
    check('mixed toggle preserves text', root.textContent === 'alpha beta', root.textContent);
    root.remove();
  }

  // Removing part of a highlight must preserve nested inline formatting and both tails.
  {
    const root = document.createElement('div');
    root.className = 'group-content';
    root.innerHTML = '<span class="highlight">alpha <em>beta</em> gamma</span>';
    document.body.append(root);
    const beta = root.querySelector('em').firstChild;
    const range = rangeBetween(root, beta, 0, beta, beta.length);
    panel.removeHighlightsFromSelection(range, root, 'card');
    const serialized = panel.serializeContentToHL(root);
    check('remove preserves inline markup', Boolean(root.querySelector('em')), root.innerHTML);
    check('remove preserves highlight tails', serialized === '<HL>alpha </HL>beta<HL> gamma</HL>', serialized);
    check('remove has no nested highlights', !root.querySelector('.highlight .highlight'), root.innerHTML);
    root.remove();
  }

  // Repeated mixed toggles must remain stable across the fragments they create.
  {
    const root = document.createElement('div');
    root.className = 'group-content';
    root.innerHTML = 'one <span class="highlight">two</span> three four';
    document.body.append(root);
    panel.contentElements = new Map([['card', root]]);
    const button = document.createElement('button');

    let selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(rangeAtTextOffsets(root, 0, 13));
    panel.handleHighlightToggle(button, 'card');
    check('mixed fragments become one logical run', panel.serializeContentToHL(root) === '<HL>one two three</HL> four', panel.serializeContentToHL(root));

    selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(rangeAtTextOffsets(root, 4, 7));
    panel.handleHighlightToggle(button, 'card');
    check('repeated toggle removes exact middle', panel.serializeContentToHL(root) === '<HL>one </HL>two<HL> three</HL> four', panel.serializeContentToHL(root));

    selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(rangeAtTextOffsets(root, 4, 7));
    panel.handleHighlightToggle(button, 'card');
    check('repeated toggle restores exact middle', panel.serializeContentToHL(root) === '<HL>one two three</HL> four', panel.serializeContentToHL(root));
    root.remove();
  }

  // A narrow selection inside one highlighted text node must split both tails.
  {
    const root = document.createElement('div');
    root.className = 'group-content';
    root.innerHTML = '<span class="highlight">alpha beta gamma</span>';
    document.body.append(root);
    const range = rangeAtTextOffsets(root, 6, 10);
    panel.removeHighlightsFromSelection(range, root, 'card');
    const serialized = panel.serializeContentToHL(root);
    check('narrow unhighlight splits one span', serialized === '<HL>alpha </HL>beta<HL> gamma</HL>', serialized);
    root.remove();
  }

  // Legacy nested markup must serialize without dropping the outer highlight tail.
  {
    const root = document.createElement('div');
    root.innerHTML = '<span class="highlight">one <span class="highlight">two</span> three</span>';
    const serialized = panel.serializeContentToHL(root);
    check('nested serialization is balanced', serialized === '<HL>one two three</HL>', serialized);
  }

  // Agents may use Markdown bold while storage remains canonical and balanced.
  {
    const markdown = markdownHighlightsToTags('lead **evidence** tail');
    check('markdown bold maps to highlight tags', markdown === 'lead <HL>evidence</HL> tail', markdown);
    const normalized = normalizeHighlightMarkup('<hl>one <HL>two</HL> three</hl>');
    check('agent markup normalizes nested tags', normalized === '<HL>one two three</HL>', normalized);
    const unmatched = normalizeHighlightMarkup('literal ** delimiter');
    check('unmatched markdown stays literal', unmatched === 'literal ** delimiter', unmatched);
  }

  // The card renderer consumes the same contract without injecting model HTML.
  {
    const root = document.createElement('div');
    const app = Object.create(CardCutterApp.prototype);
    app.renderHighlightedContent(root, 'lead **evidence**\nnext', 'rgba(0, 255, 0, 0.3)');
    check('card renderer accepts markdown highlights', root.querySelector('.highlight')?.textContent === 'evidence', root.innerHTML);
    check('card renderer restores persisted breaks', root.querySelectorAll('br').length === 1, root.innerHTML);
    check('card renderer preserves plain text', root.textContent === 'lead evidencenext', root.textContent);
  }

  // Persisted newlines and highlights must survive render -> edit serialization.
  {
    const root = document.createElement('div');
    root.className = 'group-content';
    const app = Object.create(CardCutterApp.prototype);
    const stored = 'first <HL>line</HL>\n<HL>second</HL> line';
    app.renderHighlightedContent(root, stored, 'rgba(0, 255, 0, 0.3)');
    check('reload preserves newline markup', panel.serializeContentToHL(root) === stored, panel.serializeContentToHL(root));
  }

  {
    const root = document.createElement('div');
    root.className = 'group-content';
    root.innerHTML = 'alpha<br><br>beta';
    check('explicit blank line survives save', panel.serializeContentToHL(root) === 'alpha\n\nbeta', panel.serializeContentToHL(root));

    const reload = document.createElement('div');
    reload.className = 'group-content';
    const app = Object.create(CardCutterApp.prototype);
    app.renderHighlightedContent(reload, 'alpha\n\nbeta', 'rgba(0, 255, 0, 0.3)');
    check('literal blank line survives reload', reload.querySelectorAll('br').length === 2 && panel.serializeContentToHL(reload) === 'alpha\n\nbeta', reload.innerHTML);
  }

  // A selection spanning two cards must be rejected by either card's editor.
  {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<div class="group-content">first card</div><div class="group-content">second card</div>';
    document.body.append(wrapper);
    const [first, second] = wrapper.querySelectorAll('.group-content');
    panel.contentElements = new Map([['first', first]]);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(rangeBetween(wrapper, first.firstChild, 0, second.firstChild, 6));
    panel.handleHighlightToggle(document.createElement('button'), 'first');
    check('cross-card range is ignored', !wrapper.querySelector('.highlight'), wrapper.innerHTML);
    wrapper.remove();
  }

  // Literal model markup is rendered as text, then serializes losslessly.
  {
    const root = document.createElement('div');
    root.className = 'group-content';
    const app = Object.create(CardCutterApp.prototype);
    app.renderHighlightedContent(root, 'safe <img src=x onerror=alert(1)> **claim**', 'rgba(0, 255, 0, 0.3)');
    check('literal markup cannot create elements', !root.querySelector('img'), root.innerHTML);
    check('literal markup serializes safely', panel.serializeContentToHL(root) === 'safe <img src=x onerror=alert(1)> <HL>claim</HL>', panel.serializeContentToHL(root));
  }

  // Form keyboard input must not invoke the card highlighter.
  {
    const root = document.createElement('div');
    root.className = 'group-content';
    root.textContent = 'unchanged';
    const input = document.createElement('input');
    document.body.append(root, input);
    panel.contentElements = new Map([['card', root]]);
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', {key: 'b', ctrlKey: true, bubbles: true}));
    check('input shortcut leaves card unchanged', panel.serializeContentToHL(root) === 'unchanged', root.innerHTML);
    root.remove();
    input.remove();
  }

  // Reopening an editor on the same card must not stack event listeners.
  {
    const root = document.createElement('div');
    const listenerPanel = Object.create(EditingPanel.prototype);
    listenerPanel.initializedContentElements = new WeakSet();
    listenerPanel.activePanels = new Map();
    let elementListeners = 0;
    let documentListeners = 0;
    const originalElementListener = root.addEventListener.bind(root);
    const originalDocumentListener = document.addEventListener.bind(document);
    root.addEventListener = (...args) => {
      elementListeners++;
      return originalElementListener(...args);
    };
    document.addEventListener = (...args) => {
      documentListeners++;
      return originalDocumentListener(...args);
    };
    listenerPanel.setupContentEventListeners(root, 'card');
    listenerPanel.setupContentEventListeners(root, 'card');
    document.addEventListener = originalDocumentListener;
    check('editing listeners are idempotent', elementListeners === 2, String(elementListeners));
    check('card editor adds no document listeners', documentListeners === 0, String(documentListeners));
  }

  // Representative large-card sample. Report timing for regressions without a
  // brittle wall-clock assertion.
  const buildLargeRoot = () => {
    const root = document.createElement('div');
    root.className = 'group-content';
    for (let index = 0; index < 2000; index++) {
      const span = document.createElement('span');
      span.textContent = String(index).padStart(4, '0') + ' evidence text ';
      root.appendChild(span);
    }
    return root;
  };
  const largeRoot = buildLargeRoot();
  document.body.append(largeRoot);
  const target = largeRoot.children[1000].firstChild;
  const largeRange = rangeBetween(largeRoot, target, 2, target, 10);
  const startedAt = performance.now();
  panel.addHighlightsToSelection(largeRange, largeRoot, 'card');
  const largeCardMs = performance.now() - startedAt;

  // Time the replaced whole-card rebuild on the same shape for a useful local
  // baseline. This intentionally mirrors its flatten -> replaceChildren path.
  const legacyRoot = buildLargeRoot();
  document.body.append(legacyRoot);
  const legacyTarget = legacyRoot.children[1000].firstChild;
  const legacyRange = rangeBetween(legacyRoot, legacyTarget, 2, legacyTarget, 10);
  const legacyStartedAt = performance.now();
  let flattenedText = '';
  const flatten = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      flattenedText += node.nodeValue || '';
      return;
    }
    for (const child of node.childNodes) flatten(child);
  };
  flatten(legacyRoot);
  const legacyBounds = panel.getSelectionBounds(legacyRange, legacyRoot);
  const legacyHighlight = document.createElement('span');
  legacyHighlight.className = 'highlight';
  legacyHighlight.textContent = flattenedText.slice(legacyBounds.start, legacyBounds.end);
  legacyRoot.replaceChildren(
    document.createTextNode(flattenedText.slice(0, legacyBounds.start)),
    legacyHighlight,
    document.createTextNode(flattenedText.slice(legacyBounds.end))
  );
  panel.restoreSelectionByPositions(legacyRoot, legacyBounds.start, legacyBounds.end);
  panel.serializeContentToHL(legacyRoot);
  const legacyLargeCardMs = performance.now() - legacyStartedAt;
  const failures = results.filter(result => !result.passed);
  document.querySelector('#result').textContent = JSON.stringify({
    passed: failures.length === 0,
    results,
    metrics: {
      largeCardMs: Number(largeCardMs.toFixed(2)),
      legacyLargeCardMs: Number(legacyLargeCardMs.toFixed(2))
    }
  });
</script>`;

const mimeTypes = new Map([
  ['.js', 'text/javascript'],
  ['.html', 'text/html'],
  ['.css', 'text/css']
]);

const server = createServer(async (request, response) => {
  try {
    if (request.url === '/__highlight-test') {
      response.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
      response.end(testPage);
      return;
    }

    const relativePath = decodeURIComponent((request.url || '/').split('?')[0]).replace(/^\/+/, '');
    const publicRoot = join(repoRoot, 'public');
    const filePath = normalize(join(publicRoot, relativePath));
    if (!filePath.startsWith(publicRoot)) throw new Error('Invalid path');
    const body = await readFile(filePath);
    response.writeHead(200, {'content-type': mimeTypes.get(extname(filePath)) || 'application/octet-stream'});
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const {port} = server.address();

const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--disable-extensions',
  '--disable-component-extensions-with-background-pages',
  '--no-first-run',
  '--no-default-browser-check',
  '--virtual-time-budget=2000',
  '--dump-dom',
  `http://127.0.0.1:${port}/__highlight-test`
], {stdio: ['ignore', 'pipe', 'pipe']});

let stdout = '';
let stderr = '';
chrome.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
chrome.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
let timedOut = false;
const timeout = setTimeout(() => {
  timedOut = true;
  chrome.kill();
}, 20000);
const exitCode = await new Promise((resolve, reject) => {
  chrome.on('error', reject);
  chrome.on('close', resolve);
});
clearTimeout(timeout);
server.close();

if (timedOut) {
  console.error('Chrome did not finish the highlight regression run within 20 seconds.');
  process.exit(1);
}

const match = stdout.match(/<pre id="result">([^<]+)<\/pre>/);
if (!match) {
  console.error(stderr || stdout || `Chrome exited with ${exitCode}`);
  process.exit(1);
}

const report = JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
for (const result of report.results) {
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}${result.passed ? '' : `: ${result.details}`}`);
}
console.log(`METRIC 2,000-node partial highlight: ${report.metrics.largeCardMs} ms`);
console.log(`METRIC legacy whole-card rebuild baseline: ${report.metrics.legacyLargeCardMs} ms`);

if (!report.passed) process.exit(1);
