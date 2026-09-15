# Evidex

Create debate cards from source text, choose highlighted passages, and export Word or PDF documents. The browser stores your cards locally; model calls run on the server.

Live site: https://ev1dex.com

## Run locally

Requires Node.js 22 and a DeepSeek API key.

```sh
npm install
npm run build
npm run dev
```

Open http://localhost:3000. `npm run dev` runs the compiled server; rebuild after TypeScript changes.

Set `DEEPSEEK_API_KEY` in your environment or an ignored `.env` file. The existing `DS_API_KEY` environment variable is also supported. See [.env.example](.env.example) for settings. Never put provider keys in browser JavaScript, HTML, or a client build variable.

## Cut cards with an AI agent

The authenticated `POST /api/cards` endpoint accepts either a source URL or supplied source text. It can ask DeepSeek to select a passage, or validate a finished card submitted by another agent without making a model call.

Use `**bold text**` to mark the words to highlight:

```json
{
  "tagline": "A sample claim",
  "link": "https://example.com/source",
  "citation": "Example Author, 2026, Example Source",
  "sourceText": "The study found a measurable improvement in outcomes.",
  "markdownContent": "The study found a **measurable improvement** in outcomes."
}
```

Send `Authorization: Bearer <EVIDEX_AGENT_API_TOKEN>`. This token belongs to Evidex and is separate from the provider key. The server checks that the passage appears in the supplied source, converts highlights to canonical `<HL>` tags, and returns a card ready for import or export. The token grants shared API access; it is not a user account or access to your browser's saved cards.

For autonomous workflows:

1. Research a source and keep its exact text and citation.
2. Select a passage and mark the spoken words with `**...**`.
3. Submit it to `/api/cards` for validation, or omit `markdownContent` to let DeepSeek select it.
4. Send the returned card to `/api/download-docx`, or collect cards for the bulk Word/PDF endpoints.
5. Paste the returned card JSON into **Import Sources** to edit it in the browser.

See [API.md](API.md) for the complete contract, authentication, limits, and errors.
Agents can also load the [OpenAPI specification](https://ev1dex.com/openapi.json).
For DeepSeek tool calling, use the [single-function definition](https://ev1dex.com/agent-tool.json). A small [interface trial](tests/deepseek-interface-trial.md) favored Markdown over asking the model to calculate offsets.

A runnable example loads your local token and returns importable JSON:

```sh
node examples/cut-card.mjs examples/agent-card.json example.docx
```

## Model choice

The default is `deepseek-flash`, configured through `DEEPSEEK_MODEL`. This is the current model name confirmed by the provider's models endpoint on September 15, 2026. DeepSeek generation runs only on the server and returns usage metadata so actual costs can be measured. [DeepSeek changelog](https://api-docs.deepseek.com/updates/).

There is no card-cutting evaluation here that proves one provider is best. DeepSeek is a reasonable default with the existing key; source validation matters more than the model's ability to emit formatting. External agents can use Luna, Terra, or Sol and submit finished Markdown without paying for a second generation.

Illustrative cost for **5,000 input + 1,000 output tokens**, excluding extra reasoning, tools, retries, and caching:

| Model | Cost per call |
| --- | ---: |
| DeepSeek Flash | $0.00135–$0.00270 (off-peak/peak) |
| GPT-5.6 Luna | $0.0022 |
| GPT-5.6 Terra | $0.022 |
| GPT-5.6 Sol | $0.040 |

These are estimates from published text-token prices, not measured Evidex usage. For low-volume work, Sol can be affordable; evaluate passage quality on your own sources before deciding. [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/), [Luna pricing](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [Terra and Sol pricing](https://developers.openai.com/api/docs/models/compare).

## Development and verification

| Command | Purpose |
| --- | --- |
| `npm run build` | Compile the Express server and shared modules |
| `npm run check` | Type-check both Express and Vercel handlers |
| `npm run dev` | Run the compiled server on port 3000 |
| `npm run start` | Build, then run |

Browser regressions live in `tests/browser`; backend regressions live in `tests`. Test scripts describe their prerequisites and can run without live model charges unless explicitly marked live.

## Structure

- `src/ai/`: server-only model integration.
- `src/cards/`: source retrieval, card generation, and validation shared by both backends.
- `src/server.ts`: Express routes and static client serving.
- `api/`: Vercel serverless routes.
- `public/js/`: card editor, import flow, highlighting, and tutorials.
- `src/exporters/`: Word and PDF generation.
- `dist/`: generated TypeScript output; do not edit manually.

## Deployment

The existing Vercel project is `evidex`. Set encrypted `DEEPSEEK_API_KEY` and `EVIDEX_AGENT_API_TOKEN` environment variables in the target environment, run the checks, and deploy:

```sh
vercel --prod
```

`vercel.json` declares function time limits and static routing. `.vercelignore` excludes local secrets, IDE files, test artifacts, and backups. Changes to environment variables require a new deployment.

The public website has no user accounts. Browser API restrictions and per-instance throttles do not establish user identity or a global spending quota; use hosting/provider spend controls for a strict budget. `/api/cards` requires its own server-configured bearer token.

For the optional Express deployment, use the same server environment variables and `npm run start`. Bind a reverse proxy to the local service. Follow the repository's deployment instructions for GitHub and SSH, and retain the server's Cloudflare origin restrictions.

## Troubleshooting

- **Model configuration error:** check `DEEPSEEK_API_KEY` or `DS_API_KEY` on the backend, then redeploy/restart.
- **Source cannot be fetched:** paste the source text through the API. Paywalls, bot protection, PDFs, and JavaScript-only pages may need extraction by your research agent first.
- **Passage validation fails:** use exact source wording and balanced `**...**`; paraphrases are not evidence quotations.
- **Agent request rejected:** check `EVIDEX_AGENT_API_TOKEN`, distinct from the DeepSeek key.
- **Type errors:** run `npm install`, `npm run check`, and `npm run build`.

## License and support

This project is licensed under the GNU General Public License; see [LICENSE](LICENSE). The repository also states that this software cannot be used or redistributed for business purposes.

Report issues on the GitHub repository. Thanks to the debate community for feedback and testing, DeepSeek for model access, and Vercel for hosting.
