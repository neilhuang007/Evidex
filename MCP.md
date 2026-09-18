# Evidex MCP server

The Evidex MCP server exposes one focused tool:

```text
evidex_cut_evidence_card
```

It accepts a tagline and a public source link or exact source text, then returns a validated, importable evidence card. The server calls the public `/api/cite` endpoint and does not require authentication.

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

The smoke test connects over MCP stdio, discovers the tool, and submits a deterministic card with `source_text` and `markdown_content`. That path validates and formats the card without making a DeepSeek call.

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

The production process is described by `ecosystem.mcp.config.cjs` and runs behind nginx. The public `/evidex/mcp` route is rewritten to the server's internal `/mcp` route.
