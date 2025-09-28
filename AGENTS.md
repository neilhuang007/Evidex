# Repository Guidelines

## Project Structure & Module Organization
- `src/server.ts` runs the Express API, orchestrating Gemini calls via `src/ai/gemini-wrapper.ts` and Word export routines in `src/exporters/wordHandler.ts`.
- `api/` contains Vercel serverless handlers (`cite.ts`, `download-docx*.ts`, `health.ts`) that mirror the Express endpoints for deployment.
- `public/` holds the browser client (`index.html`, `app.js`, `styles.css`); client assets are served directly by Express without bundling.
- `config/` stores prompt and export templates (`prompts/card_cutter.json`, `export/word.json`); keep edits versioned and review diffs carefully.
- `dist/` is generated TypeScript output; never edit compiled files manually.

## Build, Test, and Development Commands
- `npm install` installs dependencies; rerun whenever `package.json` changes.
- `npm run build` compiles TypeScript with `tsc` and is our baseline regression check.
- `npm run dev` serves the compiled API from `dist/server.js`; ensure `npm run build` has run first.
- `npm run start` chains the build and dev steps for local smoke testing.
- `npx tsc --watch` is useful for iterative type-checking while editing.

## Coding Style & Naming Conventions
- TypeScript modules use 2-space indentation, strict typing, and named exports for shared helpers; follow the patterns in `src/ai/gemini-wrapper.ts`.
- Prefer camelCase for functions/variables, PascalCase for classes, and dash-case filenames under `public/`.
- Keep Express route handlers lean and push formatting logic into `src/exporters`.
- When adjusting prompts, preserve JSON formatting and trailing commas to keep diffs clean.

## Testing Guidelines
- There is no dedicated test runner yet; at minimum run `npm run build` before committing to catch type regressions.
- Validate API behavior locally with `npm run dev` and smoke-test key routes, e.g.:
```bash
curl -X POST http://localhost:3000/api/cite -H "Content-Type: application/json" -d '{"link":"https://example.com","tagline":"sample"}'
```
- Document any manual checks in your PR notes; new features should include future test stubs under `src/__tests__` when possible.

## Commit & Pull Request Guidelines
- Recent history favors `type. concise summary` prefixes (e.g., `ft. refine manual highlighting`); match that style and keep subject lines under 72 characters.
- Write descriptive bodies listing user-visible changes and verification steps.
- Pull requests should link related issues, describe required env vars (`GEMINI_API_KEY`), and include screenshots or sample exports for UI or document changes.

## Configuration & Secrets
- Set `GEMINI_API_KEY` in your environment before hitting `/api/cite`; never commit secrets or `.env` files.
- Review changes to `config/prompts` and `config/export` in PRs, since they directly affect model output and document formatting.
