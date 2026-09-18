# Evidex API for agents

Use Evidex to turn a claim and a source into a highlighted evidence card.

Base URL: `https://ev1dex.com`

No API key or bearer token is required. Send JSON with `Content-Type: application/json`.

## Create an evidence card

Send a `POST` request to:

```text
https://ev1dex.com/api/cite
```

The simplest request contains a tagline and a public evidence link:

```json
{
  "tagline": "Card cutting preserves source wording",
  "link": "https://example.com/article",
  "includeEvaluation": false
}
```

- `tagline` is the claim the evidence should support.
- `link` is the public HTTP or HTTPS page containing the evidence.
- Keep `includeEvaluation` set to `false` unless an Evidex quality score is needed. Generating an evaluation requires an additional model call.

Evidex fetches the page, selects an exact supporting passage, creates a citation, and marks the strongest words as highlights.

### JavaScript example

```js
const tagline = "Card cutting preserves source wording";
const link = "https://example.com/article";

const response = await fetch("https://ev1dex.com/api/cite", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({tagline, link, includeEvaluation: false})
});

const result = await response.json();
if (result.status !== "success") {
  throw new Error(result.error || "Evidex could not create the card");
}

const card = {
  tagline,
  link,
  cite: result.cite,
  markdownContent: result.markdownContent
};
```

### curl example

```sh
curl -X POST https://ev1dex.com/api/cite \
  -H "Content-Type: application/json" \
  -d '{
    "tagline": "Card cutting preserves source wording",
    "link": "https://example.com/article",
    "includeEvaluation": false
  }'
```

## When the agent has already read the source

If page fetching fails, or the agent already has the article text, send `sourceText`. It takes precedence over fetched page content.

```json
{
  "tagline": "The program lowered household energy costs",
  "link": "https://example.com/report",
  "sourceText": "Paste the exact source text here.",
  "citation": "Author, Publisher, 2026",
  "includeEvaluation": false
}
```

The `link` and `citation` fields are optional when using `sourceText`, but include them when they are known. Do not invent missing source metadata.

## Submit a passage selected by the agent

An agent can select the quotation itself by adding `markdownContent`. This is the fastest workflow and does not make an Evidex model call. Evidex validates that the quotation occurs in the supplied source and converts the bold markers into card highlights.

```json
{
  "tagline": "Card cutting preserves source wording",
  "link": "https://example.com/article",
  "sourceText": "Accurate card cutting preserves the original wording and highlights the selected passage.",
  "citation": "Synthetic demonstration, 2026",
  "markdownContent": "Accurate card cutting **preserves the original wording** and highlights the selected passage.",
  "includeEvaluation": false
}
```

Rules for `markdownContent`:

- Copy one exact, contiguous passage from `sourceText`.
- Preserve the source's words and punctuation. Whitespace may be normalized.
- Put balanced `**bold markers**` around the strongest supporting words.
- Include at least one nonempty bold span.
- Do not add ellipses, connectors, paraphrases, or commentary.
- Keep enough context to preserve qualifications and negation.

## Successful response

```json
{
  "status": "success",
  "cite": "Synthetic demonstration, 2026",
  "content": "Accurate card cutting <HL>preserves the original wording</HL> and highlights the selected passage.",
  "plainText": "Accurate card cutting preserves the original wording and highlights the selected passage.",
  "markdownContent": "Accurate card cutting **preserves the original wording** and highlights the selected passage.",
  "highlights": [
    {"start": 22, "end": 52, "text": "preserves the original wording"}
  ],
  "evaluation": null,
  "meta": {
    "mode": "normalized",
    "model": null,
    "source": "provided_text",
    "sourceCharacters": 89,
    "usage": null
  }
}
```

Keep the original request's `tagline` and `link`; the response does not repeat them. For compact storage or import into Evidex, save:

```json
{
  "tagline": "the original request tagline",
  "link": "the original request link",
  "cite": "the response cite",
  "markdownContent": "the response markdownContent"
}
```

`highlights` use inclusive-start, exclusive-end UTF-16 offsets in `plainText`. Most agents should use `markdownContent` and do not need to calculate offsets or generate `<HL>` tags.

## Errors and limits

Always inspect the JSON `status`. For compatibility, card and source failures normally return HTTP 200 with this shape:

```json
{
  "status": "fetch_error",
  "cite": "",
  "content": "",
  "error": "Description of the problem",
  "errorCode": "machine_readable_code"
}
```

The public API allows 30 requests per minute per IP address. A rate-limited request returns HTTP 429 and a `Retry-After` header.

Source fetching supports ordinary public HTML and plain-text pages. It does not execute JavaScript. For login-required, JavaScript-only, PDF, or bot-blocked pages, read the source with browser tools and submit its text through `sourceText`.

Input limits:

- `tagline`: 500 characters
- `link`: 2,048 characters
- `sourceText`: 120,000 characters
- `markdownContent`: 15,000 characters
- Finished excerpt: at least 20 characters, at most 24 highlight spans

## Optional quality evaluation

Set `includeEvaluation` to `true` to receive an Evidex evaluation with an overall score from 0 to 6 and credibility, support, and contradiction scores from 0 to 10. A higher contradiction score means fewer contradictions. This is a model judgment, not independent fact-checking.

## Export cards

Exports do not require authentication and do not call a model.

- `POST /api/download-docx` exports one card.
- `POST /api/download-docx-bulk` exports `{ "cards": [...] }`.
- `POST /api/download-pdf-bulk` exports `{ "cards": [...] }`.

Each card needs `tagline`, `cite`, and either `markdownContent` or `content`. `link` and a six-digit `highlightColor`, such as `#FFFF00`, are optional. Export responses are binary DOCX or PDF files, not JSON.

## Recommended agent procedure

1. Identify a precise claim and use it as the `tagline`.
2. Send the tagline and public source URL to `/api/cite` with `includeEvaluation:false`.
3. If Evidex cannot fetch the page, read it with browser tools and retry with `sourceText`.
4. If the agent can identify the best exact passage itself, include `markdownContent` to avoid a model call.
5. Accept the result only when `status` is `success`.
6. Preserve the original `tagline` and `link` alongside the returned `cite` and `markdownContent`.
