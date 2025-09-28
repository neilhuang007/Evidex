# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Evidex - A web application for extracting and formatting research evidence from web sources using the Gemini API.

## Architecture

### Deployment
- Deployed on Vercel with serverless functions in `/api` directory
- Express server in `/src/server.ts` for local development
- Static frontend served from `/public`

### Core Components

**AI Integration** (`src/ai/gemini-wrapper.ts`)
- Minimal Gemini API wrapper without SDK dependencies
- Handles API calls with retry logic
- Supports both browser and Node environments

**Document Export** (`src/exporters/wordHandler.ts`)
- Generates formatted Word documents (.docx) from debate cards
- Custom tagged format parser supporting TAGLINE, CITE, LINK tags
- Highlighting with `<HL>` tags preserved in output

**API Endpoints**
- `/api/cite` - Fetches webpage and extracts evidence supporting a tagline
- `/api/download-docx` - Generates single card Word document
- `/api/download-docx-bulk` - Generates multi-card Word document
- `/api/health` - Health check endpoint

## Commands

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run development server (requires build first)
npm run dev

# Build and run
npm run start
```

## Environment Variables

Required for API functionality:
- `GEMINI_API_KEY` - Google Gemini API key for AI processing

## Configuration

- **Prompts**: `config/prompts/card_cutter.json` - System prompt and few-shot examples for card generation
- **TypeScript**: Compiles from `src/` to `dist/` with CommonJS output
- **Vercel**: Routes configured in `vercel.json` for serverless deployment