# Evidex API

Base URL: `https://ev1dex.com`. The Express development server exposes the same routes.

- [OpenAPI schema](https://ev1dex.com/openapi.json)
- [DeepSeek-compatible function definition](https://ev1dex.com/agent-tool.json)
- [Runnable agent client](examples/cut-card.mjs)

## The simplest agent workflow

Send the claim and article URL to `POST /api/cards`. Supply `sourceText` when your agent has already read the article. Evidex returns the citation and highlighted excerpt.

If your agent chooses the passage itself, add `markdownContent` with **bold markers**. This path validates and formats the card without calling DeepSeek:

```json
{
  "tagline": "Card cutting preserves source wording",
  "sourceText": "Accurate card cutting preserves the original wording and highlights the selected passage.",
  "citation": "Synthetic demonstration, 2026",
  "markdownContent": "Accurate card cutting **preserves the original wording** and highlights the selected passage."
}
```

Keep the original words and punctuation. The model should not calculate character positions or write HTML. The server calculates highlight positions and the `<HL>` representation.

For a tool-calling agent, bind `cut_card` from `agent-tool.json` to `POST /api/cards` in your tool runner. The runner supplies authentication. Return just `tagline`, `link`, `cite`, and `markdownContent` to the model to avoid repeating the excerpt in three formats. The example CLI does this automatically:

```sh
node examples/cut-card.mjs examples/agent-card.json card.docx
```

The CLI writes compact importable card JSON to stdout, usage to stderr, and optionally saves Word output. It defaults to the live site; set `EVIDEX_API_URL=http://localhost:3001` to test locally. It loads the ignored local `.env` file.

## Authentication and server configuration

`/api/cards` requires:

```http
Authorization: Bearer <EVIDEX_AGENT_API_TOKEN>
Content-Type: application/json
```

`EVIDEX_AGENT_API_TOKEN` is a separate Evidex credential. Do not send a DeepSeek key to this route. The owner stores the token in the backend environment and supplies it to trusted agent runners. If it is unset, the route returns 503; incorrect or absent credentials return 401.

Provider calls use server environment `DEEPSEEK_API_KEY` or the compatibility alias `DS_API_KEY`. `DEEPSEEK_MODEL` defaults to `deepseek-flash`. No provider key is embedded in browser assets, API results, or logs.

The browser's `/api/cite`, `/api/evaluate`, and `/api/extract-evidence` routes are public, with a shared per-instance throttle of 30 requests/minute/IP. The authenticated card route allows 60 requests/minute/IP per instance. These in-memory counters are not a global spending quota across Vercel instances. Configure provider/hosting spend limits for a strict budget.

Express trusts its direct peer address by default. Set `TRUST_CLOUDFLARE=true` only behind a proxy that enforces the repository's Cloudflare origin restrictions. The agent token grants shared API access, not a user account or access to browser-local cards.

## POST /api/cards

### Request

| Field | Purpose |
| --- | --- |
| `tagline` | Required claim, at most 500 characters. |
| `link` or `sourceUrl` | Public HTTP(S) source URL, at most 2,048 characters. Optional when supplying text. |
| `sourceText` | Exact article text, at most 120,000 characters. Takes precedence over fetching. |
| `citation` or `cite` | Optional citation, at most 160 characters. Otherwise derived from available source metadata; missing metadata is not invented. |
| `markdownContent` | Optional exact excerpt with balanced `**...**` spans, at most 15,000 characters. Makes the request deterministic and free of model calls. |
| `content` | Alternative to `markdownContent`, using balanced non-nested `<HL>...</HL>` tags. Supply one format. |

Provide source text or a source URL. Finished cuts need at least one nonempty highlight, with at most 24 spans, and an excerpt of at least 20 characters. The excerpt must occur contiguously in the source; whitespace differences are allowed. A successful grounding check establishes textual matching, not the accuracy of the source or independent proof of the citation's identity.

### Response

```json
{
  "status": "success",
  "card": {
    "tagline": "Card cutting preserves source wording",
    "link": "",
    "cite": "Synthetic demonstration, 2026",
    "plainText": "Accurate card cutting preserves the original wording and highlights the selected passage.",
    "markdownContent": "Accurate card cutting **preserves the original wording** and highlights the selected passage.",
    "content": "Accurate card cutting <HL>preserves the original wording</HL> and highlights the selected passage.",
    "highlights": [{"start": 22, "end": 52, "text": "preserves the original wording"}]
  },
  "meta": {
    "mode": "normalized",
    "model": null,
    "source": "provided_text",
    "sourceCharacters": 89,
    "usage": null
  }
}
```

Offsets are inclusive start/exclusive end UTF-16 positions in `plainText`. For generated cards, `mode` is `deepseek` and `usage` contains `promptTokens`, `completionTokens`, `totalTokens`, and optionally `cachedPromptTokens`. The API returns cards to the caller; import them into the webpage to save them in that browser.

### Errors

```json
{"error":{"code":"ungrounded_content","message":"The evidence excerpt is not an exact contiguous quote from the supplied source"}}
```

| HTTP status | Meaning |
| --- | --- |
| 400 | Invalid input, blocked URL, excessive source size, invalid highlights, or ungrounded supplied excerpt. |
| 401 | Invalid agent token. |
| 405 | Wrong method; see `Allow`. |
| 422 | Source fetch failed or content type is unsupported. Paste source text instead. |
| 429 | Per-instance request limit; see `Retry-After`. |
| 502 | Model request failed, returned malformed output, or changed source wording. |
| 503 | Required backend credentials are not configured. |
| 504 | Model request timed out. |

## Source fetching

The server fetches HTML/plain text, extracts the article with Mozilla Readability, and derives a short citation from available author/publisher/date metadata. JavaScript is not executed. Successful extraction is cached for ten minutes in a bounded 64-entry cache per instance. The cache is not shared across Vercel instances.

Fetching has a total 12-second deadline, a 1.5 MB download limit, and up to four redirects. Every redirect and DNS result is checked against private/local addresses, and the selected public address is pinned for the connection. Only limited transient retries are attempted. A block or unsupported page produces an actionable failure, not a fabricated article.

For login-required, JavaScript-only, PDF, or bot-blocked sources, open the article normally and paste its text into the website's Source Panel or submit `sourceText`. An agent with browser access can do the same. A regular webpage cannot read arbitrary other sites through the user's browser because of cross-origin restrictions; an optional browser extension could provide one-click capture later.

## POST /api/cite

Browser-compatible route. Accepts the card fields above and optional `includeEvaluation`. Returns the existing top-level `status`, `cite`, and `content`, plus `plainText`, `markdownContent`, `highlights`, `meta`, and `evaluation`.

Generated cards are evaluated by default; use `includeEvaluation:false` for the fastest single-call workflow. Supplied finished cuts skip evaluation unless explicitly requested. Evaluation is supplementary and can be `null` if it fails. Token usage in `meta` is for the cutting call; an included evaluation has its own `evaluation.meta.usage`.

For compatibility, card/source failures return HTTP 200 with `status:"fetch_error"`, empty `cite/content`, and `error`/`errorCode`. Check `status`, not only the HTTP status. Throttles still use 429. External agents should use `/api/cards` for consistent HTTP errors and authentication.

## Export routes

- `POST /api/download-docx`: one card.
- `POST /api/download-docx-bulk`: `{ "cards": [...] }`.
- `POST /api/download-pdf-bulk`: `{ "cards": [...] }`.

Required card fields: `tagline`, `cite`, and either `content` or `markdownContent`. `link` is optional; if supplied it must be HTTP(S). Optional `highlightColor` is a six-digit color such as `#FFFF00`.

Canonical `content` takes precedence when both representations are present, so edited content is preserved. To send Markdown in the `content` field, set `contentFormat:"markdown"`. Completely unhighlighted text is also exportable. Each card may contain at most 120,000 content characters; bulk requests accept 1–100 cards and at most 500,000 combined content characters, subject to the host's body limit (512 KB in Express).

Responses are binary DOCX/PDF files with download headers. Invalid export data returns 400 with an `error` string; rendering failures return 500. Do not attempt to parse successful binary output as JSON. Exports do not call a model.

## Other routes

- `POST /api/extract-evidence`: `{ "text": "research notes containing source URLs" }`. Returns `{success:true,items:[{tagline,link}],meta}`. URLs must occur in the input; the model cannot invent a link. Prefer finished card JSON imports to avoid this extra model call.
- `POST /api/evaluate`: `{tagline,cite,content,link}`. Returns overall `score` on the website's 0–6 scale and `credibility`, `support`, and `contradictions` objects with `score` (0–10) and `reasoning`, plus usage metadata. A higher contradictions score means fewer contradictions. Evaluation is a model judgment, not independent fact-checking.
- `GET /api/health`: service status and non-secret provider/model configuration status.

## Verification

```sh
npm run check
npm run build
node --test dist/__tests__/backend.test.js
node scripts/highlighting-regression.mjs
```

With a local server on port 3001 and the agent token configured:

```sh
node tests/smoke-api.mjs
node tests/smoke-api.mjs --live
```

The `--live` flag makes two billed model calls. `py tests/export_regression.py` checks multiline PDF highlights and long-card pagination using PyMuPDF. Browser regression scripts under `tests/browser` use Python Playwright and a running local server.
