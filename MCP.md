# Evidex MCP server

The Evidex MCP server exposes two focused tools:

```text
evidex_cut_evidence_card
evidex_export_evidence_document
```

`evidex_cut_evidence_card` accepts a tagline and a public source link or exact source text, then returns a validated, importable evidence card. The server calls the public `/api/cite` endpoint and does not require authentication.

`evidex_export_evidence_document` turns 1–100 completed cards into the same formatted DOCX or PDF available in the browser UI. It supports:

- Direct Google Docs import through DOCX
- Fixed-layout PDF export
- Exact card-array order
- Optional UI-style custom ordering with `tagline_order`
- Multiple cards sharing one tagline
- Unlisted cards appended in their original order
- Source hyperlinks, citations, multiline content, and unhighlighted content
- Canonical `<HL>...</HL>` or Markdown `**...**` highlights
- A separate six-digit `highlight_color` for each card
- A custom `file_name`

The hosted server returns an unguessable download link that expires after 15 minutes. Local stdio clients receive the document as an embedded MCP resource.

## Hosted endpoint

Use the production Streamable HTTP endpoint:

```text
https://javavirtualenvironment.com/evidex/mcp
```

For Codex CLI:

```sh
codex mcp add evidex-remote --url https://javavirtualenvironment.com/evidex/mcp
```

## Build and test

```sh
npm install
npm run build
npm run test:mcp
```

The smoke test connects over MCP stdio, submits a deterministic card without making a DeepSeek call, verifies custom ordering, and validates generated DOCX and PDF signatures.

## Export cards for Google Docs

Call `evidex_export_evidence_document` with `format: "docx"` and completed cards. Cards are rendered in their array order unless `tagline_order` is supplied. Upload the returned `.docx` to Google Drive and open it with Google Docs; the agent does not need to recreate the formatting.

```json
{
  "format": "docx",
  "file_name": "energy-evidence-brief",
  "tagline_order": ["Costs fell", "Reliability improved"],
  "cards": [
    {
      "tagline": "Reliability improved",
      "cite": "Independent Study, 2026",
      "link": "https://example.com/study",
      "markdown_content": "The study found **reliability improved by 18 percent**.",
      "highlight_color": "#00FFFF"
    },
    {
      "tagline": "Costs fell",
      "cite": "Agency Report, 2026",
      "content": "Household costs <HL>fell during the first year</HL>.",
      "highlight_color": "#FFFF00"
    }
  ]
}
```

## Add to a local Codex client

After building, register the compiled stdio server:

```sh
codex mcp add evidex -- node E:\projects\evidex\dist\mcp\index.js
```

Verify it with:

```sh
codex mcp get evidex
codex mcp list
```

The ChatGPT desktop app, Codex CLI, and Codex IDE extension share the local Codex MCP configuration. Start a new session or restart the client after adding the server so it can refresh its tool catalog.

`EVIDEX_API_URL` defaults to `https://ev1dex.com`. Set it when targeting another Evidex deployment:

```sh
codex mcp add evidex --env EVIDEX_API_URL=http://localhost:3000 -- node E:\projects\evidex\dist\mcp\index.js
```

## Run over Streamable HTTP

For local HTTP testing:

```sh
npm run mcp:http
```

The endpoint is `http://127.0.0.1:3002/mcp`. Override the bind with `--host`, `--port`, `MCP_HOST`, or `MCP_PORT`. When binding beyond localhost, set `MCP_ALLOWED_HOSTS` to a comma-separated hostname allowlist.

The production process is described by `ecosystem.mcp.config.cjs` and runs behind nginx. The `deploy/nginx/evidex-mcp-location.conf` snippet rewrites the public `/evidex/mcp` route to the server's internal `/mcp` route.
