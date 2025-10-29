# Evidex API Documentation

## Overview

Evidex provides a RESTful API for extracting, analyzing, and exporting debate evidence from web sources. The API is
deployed on Vercel as serverless functions and can also be self-hosted using the Express server.

**Base URL (Production):** `https://your-deployment.vercel.app`
**Base URL (Local Development):** `http://localhost:3000`

## Authentication

Currently, the API does not require client-side authentication. However, the server requires a valid `GEMINI_API_KEY`
environment variable to be set for AI-powered operations.

## Common Response Codes

| Code  | Description                                                      |
|-------|------------------------------------------------------------------|
| `200` | Success (even for handled errors - see response body for status) |
| `400` | Bad Request - Invalid input parameters                           |
| `405` | Method Not Allowed - Wrong HTTP method                           |
| `500` | Internal Server Error                                            |

## Endpoints

### 1. Extract Evidence

Extracts relevant evidence from a web source that supports a given tagline. The API fetches the webpage, analyzes its
content using AI, and returns highlighted evidence with optional credibility evaluation.

**Endpoint:** `POST /api/cite`

#### Request

**Headers:**

```http
Content-Type: application/json
```

**Body:**

```json
{
  "tagline": "Climate change impacts are accelerating",
  "link": "https://example.com/article",
  "includeEvaluation": true
}
```

**Parameters:**

| Field               | Type    | Required | Description                                                 |
|---------------------|---------|----------|-------------------------------------------------------------|
| `tagline`           | string  | Yes      | The claim or thesis you want evidence to support            |
| `link`              | string  | Yes      | URL of the source webpage to extract evidence from          |
| `includeEvaluation` | boolean | No       | Whether to include credibility evaluation (default: `true`) |

#### Response

**Success Response:**

```json
{
  "status": "success",
  "cite": "Smith et al., 2024 (Nature Climate Change)",
  "content": "Recent studies show that <HL>global temperature anomalies have increased by 0.2°C per decade</HL> since 2000. The acceleration is particularly evident in Arctic regions where <HL>ice loss has tripled</HL> compared to the 1990s baseline.",
  "evaluation": {
    "score": 8.5,
    "credibility": {
      "source_reputation": "High - peer-reviewed journal",
      "author_credentials": "Leading climate scientists",
      "publication_date": "2024",
      "methodology": "Robust data analysis"
    },
    "support": [
      "Provides specific quantitative data (0.2°C per decade)",
      "Compares to established baseline (1990s)",
      "Published in reputable journal (Nature Climate Change)"
    ],
    "contradictions": []
  }
}
```

**Error Response:**

```json
{
  "status": "fetch_error",
  "cite": "",
  "content": "",
  "error": "Failed to fetch webpage: 404 Not Found"
}
```

**Response Fields:**

| Field                       | Type   | Description                                                 |
|-----------------------------|--------|-------------------------------------------------------------|
| `status`                    | string | `"success"` or `"fetch_error"`                              |
| `cite`                      | string | Formatted citation (author, date, publication)              |
| `content`                   | string | Extracted evidence with `<HL>...</HL>` tags for highlights  |
| `evaluation`                | object | Credibility analysis (only if `includeEvaluation: true`)    |
| `evaluation.score`          | number | Overall quality score (0-10)                                |
| `evaluation.credibility`    | object | Source credibility assessment                               |
| `evaluation.support`        | array  | Reasons why the evidence supports the tagline               |
| `evaluation.contradictions` | array  | Any contradictions or weaknesses found                      |
| `error`                     | string | Error message (only present when status is `"fetch_error"`) |

#### Highlight Tags

Evidence text uses `<HL>` tags to mark important passages:

```
This is normal text. <HL>This is highlighted text.</HL> More normal text.
```

These tags are:

- **Balanced:** All opening `<HL>` tags have matching closing `</HL>` tags
- **Case-insensitive:** `<HL>`, `<hl>`, or `<Hl>` all work
- **Preserved in exports:** Maintained when generating Word documents

#### Examples

**Example 1: Basic Evidence Extraction**

```bash
curl -X POST https://your-deployment.vercel.app/api/cite \
  -H "Content-Type: application/json" \
  -d '{
    "tagline": "Renewable energy is cost-competitive",
    "link": "https://example.com/renewable-energy-report"
  }'
```

**Example 2: Without Evaluation**

```bash
curl -X POST https://your-deployment.vercel.app/api/cite \
  -H "Content-Type: application/json" \
  -d '{
    "tagline": "AI improves medical diagnosis",
    "link": "https://example.com/ai-medicine",
    "includeEvaluation": false
  }'
```

---

### 2. Generate Single Card Document

Creates a formatted Word document (.docx) containing a single debate card with proper styling, highlighting, and
citations.

**Endpoint:** `POST /api/download-docx`

#### Request

**Headers:**

```http
Content-Type: application/json
```

**Body:**

```json
{
  "tagline": "Climate change impacts are accelerating",
  "link": "https://example.com/article",
  "cite": "Smith et al., 2024 (Nature Climate Change)",
  "content": "Recent studies show that <HL>global temperature anomalies have increased by 0.2°C per decade</HL> since 2000.",
  "highlightColor": "#FFFF00"
}
```

**Parameters:**

| Field            | Type   | Required | Description                                                |
|------------------|--------|----------|------------------------------------------------------------|
| `tagline`        | string | Yes      | The claim or thesis                                        |
| `link`           | string | Yes      | Source URL                                                 |
| `cite`           | string | Yes      | Formatted citation                                         |
| `content`        | string | Yes      | Evidence text with `<HL>` tags                             |
| `highlightColor` | string | No       | Hex color for highlights (default: `#00FF00` bright green) |

#### Response

**Success:** Binary `.docx` file download

**Headers:**

```http
Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
Content-Disposition: attachment; filename="Smith_et_al_2024_1730000000000.docx"
```

**Error Response:**

```json
{
  "error": "tagline, link, cite, and content are required"
}
```

#### Document Format

Generated Word documents include:

- **Tagline:** 12pt bold (highlighted portions at 12pt)
- **Link:** 6.5pt clickable hyperlink in dark blue
- **Citation:** 10.5pt italic bold with highlight background
- **Content:** 7.5pt body text (highlighted portions at 12pt bold)
- **Font:** Times New Roman throughout
- **Highlighting:** Custom color support with proper shading

#### Examples

**Example: Generate Document from API Response**

```javascript
// First, extract evidence
const citeResponse = await fetch('https://your-deployment.vercel.app/api/cite', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tagline: 'Climate change impacts are accelerating',
    link: 'https://example.com/article'
  })
});

const { cite, content } = await citeResponse.json();

// Then, generate Word document
const docResponse = await fetch('https://your-deployment.vercel.app/api/download-docx', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tagline: 'Climate change impacts are accelerating',
    link: 'https://example.com/article',
    cite,
    content,
    highlightColor: '#FFFF00'
  })
});

const blob = await docResponse.blob();
// Save or download the .docx file
```

---

### 3. Generate Multi-Card Document

Creates a Word document containing multiple debate cards in a single file. Useful for batch exports or creating evidence
packets.

**Endpoint:** `POST /api/download-docx-bulk`

#### Request

**Headers:**

```http
Content-Type: application/json
```

**Body:**

```json
{
  "cards": [
    {
      "tagline": "First claim",
      "link": "https://example.com/article1",
      "cite": "Author1, 2024",
      "content": "Evidence text with <HL>highlights</HL>.",
      "highlightColor": "#FFFF00"
    },
    {
      "tagline": "Second claim",
      "link": "https://example.com/article2",
      "cite": "Author2, 2024",
      "content": "More evidence with <HL>different highlights</HL>.",
      "highlightColor": "#00FFFF"
    }
  ]
}
```

**Parameters:**

| Field                    | Type   | Required | Description                       |
|--------------------------|--------|----------|-----------------------------------|
| `cards`                  | array  | Yes      | Array of card objects (minimum 1) |
| `cards[].tagline`        | string | Yes      | The claim or thesis               |
| `cards[].link`           | string | Yes      | Source URL                        |
| `cards[].cite`           | string | Yes      | Formatted citation                |
| `cards[].content`        | string | Yes      | Evidence text with `<HL>` tags    |
| `cards[].highlightColor` | string | No       | Per-card highlight color (hex)    |

#### Response

**Success:** Binary `.docx` file download with all cards

**Headers:**

```http
Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
Content-Disposition: attachment; filename="cards_1730000000000.docx"
```

**Error Response:**

```json
{
  "error": "cards[] required"
}
```

#### Document Structure

- Each card is formatted identically to single-card documents
- Cards are separated by 2 blank paragraphs
- Each card can have its own highlight color
- All cards use Times New Roman font

#### Examples

**Example: Batch Export**

```bash
curl -X POST https://your-deployment.vercel.app/api/download-docx-bulk \
  -H "Content-Type: application/json" \
  -d '{
    "cards": [
      {
        "tagline": "AI improves productivity",
        "link": "https://example.com/ai-study",
        "cite": "Johnson, 2024",
        "content": "Workers using AI completed tasks <HL>23% faster</HL>.",
        "highlightColor": "#FFFF00"
      },
      {
        "tagline": "Remote work increases satisfaction",
        "link": "https://example.com/remote-work",
        "cite": "Lee, 2024",
        "content": "Survey shows <HL>87% of remote workers</HL> report higher job satisfaction.",
        "highlightColor": "#00FFFF"
      }
    ]
  }' \
  --output cards.docx
```

---

### 4. Health Check

Simple health check endpoint to verify the API is operational.

**Endpoint:** `GET /api/health`

#### Request

No parameters required.

```bash
curl https://your-deployment.vercel.app/api/health
```

#### Response

```json
{
  "status": "ok",
  "timestamp": "2025-01-28T12:00:00.000Z"
}
```

---

## Systematic Batch Processing

Yes! Programs can systematically cite multiple sources and generate Word documents using only API calls. This enables
automated research workflows.

### Workflow Overview

```
1. Define sources → 2. Call /api/cite for each → 3. Collect results → 4. Call /api/download-docx-bulk → 5. Get .docx file
```

**See complete examples:**

- JavaScript/Node.js: [`examples/batch-citation-example.js`](examples/batch-citation-example.js)
- Python: [`examples/batch-citation-example.py`](examples/batch-citation-example.py)

### Key Benefits

- **Parallel Processing:** Cite multiple sources concurrently
- **Quality Filtering:** Use evaluation scores to filter evidence
- **Custom Organization:** Apply different highlight colors per card
- **Single Document:** Export all cards to one .docx file
- **Fully Automated:** No manual copying or formatting required

### Quick Example

```javascript
// 1. Cite multiple sources in parallel
const sources = [
  { tagline: 'AI improves productivity', url: 'https://example.com/ai' },
  { tagline: 'Remote work increases satisfaction', url: 'https://example.com/remote' }
];

const cards = await Promise.all(
  sources.map(async ({ tagline, url }) => {
    const res = await fetch(`${API_BASE}/api/cite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagline, link: url })
    });
    const data = await res.json();
    return { tagline, link: url, cite: data.cite, content: data.content };
  })
);

// 2. Generate single document with all cards
const docRes = await fetch(`${API_BASE}/api/download-docx-bulk`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ cards })
});

const blob = await docRes.blob();
// Save the .docx file
```

---

## Complete Workflow Example

Here's a complete example of extracting evidence and generating a Word document:

```javascript
const API_BASE = 'https://your-deployment.vercel.app';

async function createDebateCard(tagline, sourceUrl) {
  // Step 1: Extract evidence with evaluation
  const extractResponse = await fetch(`${API_BASE}/api/cite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tagline,
      link: sourceUrl,
      includeEvaluation: true
    })
  });

  const data = await extractResponse.json();

  if (data.status !== 'success') {
    throw new Error(`Failed to extract evidence: ${data.error}`);
  }

  console.log('Evidence extracted:', data.cite);
  console.log('Quality score:', data.evaluation?.score);

  // Step 2: Generate Word document
  const docResponse = await fetch(`${API_BASE}/api/download-docx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tagline,
      link: sourceUrl,
      cite: data.cite,
      content: data.content,
      highlightColor: '#FFFF00'
    })
  });

  // Step 3: Save the document
  const blob = await docResponse.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.cite.replace(/[^a-z0-9]/gi, '_')}.docx`;
  a.click();

  return data;
}

// Usage
createDebateCard(
  'Climate change impacts are accelerating',
  'https://example.com/climate-article'
);
```

---

## Error Handling

### Common Error Scenarios

#### 1. Invalid URL

```json
{
  "status": "fetch_error",
  "cite": "",
  "content": "",
  "error": "Failed to fetch webpage: Invalid URL"
}
```

#### 2. Missing API Key

```json
{
  "status": "fetch_error",
  "cite": "",
  "content": "",
  "error": "Server missing GEMINI_API_KEY"
}
```

#### 3. Missing Required Fields

```json
{
  "status": "fetch_error",
  "cite": "",
  "content": "",
  "error": "tagline and link are required"
}
```

#### 4. AI Model Error

```json
{
  "status": "fetch_error",
  "cite": "",
  "content": "",
  "error": "Model returned unexpected format"
}
```

### Best Practices

1. **Always check the `status` field** in responses from `/api/cite`
2. **Validate URLs** before sending to the API
3. **Handle timeout scenarios** - AI processing may take 10-30 seconds
4. **Preserve `<HL>` tag structure** when manipulating content
5. **Use evaluation scores** to filter low-quality evidence
6. **Set appropriate highlight colors** for visual organization

---

## Rate Limiting

Currently, there are no explicit rate limits. However:

- Vercel serverless functions have a **10-second timeout** by default
- Gemini API has its own rate limits based on your API key tier
- For high-volume usage, consider implementing client-side throttling

---

## Self-Hosting

To self-host the API:

```bash
# 1. Clone and install
git clone https://github.com/yourusername/evidex.git
cd evidex
npm install

# 2. Build TypeScript
npm run build

# 3. Set environment variables
export GEMINI_API_KEY=your_api_key_here

# 4. Start server
npm run start
```

The Express server will run on `http://localhost:3000` with the same endpoints.

### Environment Variables

| Variable         | Required | Description                             |
|------------------|----------|-----------------------------------------|
| `GEMINI_API_KEY` | Yes      | Google Gemini API key for AI processing |
| `PORT`           | No       | Server port (default: 3000)             |

---

## API Versioning

Current version: **v1** (implicit - no version prefix in URLs)

Future versions will use URL prefixes (e.g., `/api/v2/cite`) while maintaining backward compatibility.

---

## Support

For issues, questions, or feature requests:

- **GitHub Issues:** [github.com/yourusername/evidex/issues](https://github.com/yourusername/evidex/issues)
- **Documentation:** See [README.md](README.md) and [CLAUDE.md](CLAUDE.md)

---

## Changelog

### Current (2025-01-28)

- Initial API documentation
- Evidence extraction with credibility evaluation
- Single and bulk Word document generation
- Highlight tag validation and balancing
- Health check endpoint
