# Evidex

A web application for generating debate cards by extracting and formatting evidence from web sources using the Google Gemini API.

## Overview

Evidex streamlines the research process by automatically extracting relevant evidence from web sources and formatting it into properly structured debate cards. The application leverages AI to identify supporting evidence for specific taglines and exports them in standard debate formats.

## Features

- **Automated Evidence Extraction** - Extract relevant quotes from web sources based on taglines
- **AI-Powered Analysis** - Uses Google Gemini API for intelligent content analysis
- **Multiple Export Formats** - Generate single or bulk Word documents with proper formatting
- **Custom Highlighting** - Preserve important text highlighting in exported documents
- **Serverless Architecture** - Deployed on Vercel for scalability and performance

## Quick Start

### Prerequisites

- Node.js 16.x or higher
- npm or yarn package manager
- Google Gemini API key

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/evidex.git
cd evidex

# Install dependencies
npm install

# Build the project
npm run build

# Start development server
npm run dev
```

### Environment Setup

Create a `.env` file in the root directory:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

## Project Structure

```
evidex/
├── src/
│   ├── ai/                 # AI integration modules
│   ├── exporters/          # Document export handlers
│   ├── server.ts           # Express server for local development
│   └── types/              # TypeScript type definitions
├── api/                    # Vercel serverless functions
├── public/                 # Static frontend assets
├── config/
│   └── prompts/           # AI prompt configurations
├── dist/                   # Compiled TypeScript output
└── vercel.json            # Vercel deployment configuration
```

## API Documentation

For complete API documentation including request/response formats, examples, and workflows, see **[API.md](API.md)**.

### Quick Overview

| Endpoint                  | Method | Description                                               |
|---------------------------|--------|-----------------------------------------------------------|
| `/api/cite`               | POST   | Extract evidence from webpage with credibility evaluation |
| `/api/download-docx`      | POST   | Generate single debate card Word document                 |
| `/api/download-docx-bulk` | POST   | Generate multi-card Word document                         |
| `/api/health`             | GET    | Health check endpoint                                     |

### Key Features

- **AI-Powered Evidence Extraction** - Automatically identifies relevant quotes from sources
- **Credibility Evaluation** - Assesses source quality and evidence strength
- **Highlight Preservation** - Maintains `<HL>` tag formatting in exports
- **Custom Styling** - Configurable highlight colors per card
- **Vercel Compatible** - Works seamlessly with serverless deployments
- **Self-Hosting Support** - Can be deployed on any Node.js server

**Full documentation:** [API.md](API.md)

## Development

### Build Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install project dependencies |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run dev` | Start development server with hot reload |
| `npm run start` | Build and run production server |

### Technology Stack

| Component | Technology |
|-----------|------------|
| **Runtime** | Node.js |
| **Language** | TypeScript |
| **AI Service** | Google Gemini API |
| **Deployment** | Vercel Serverless |
| **Document Processing** | docx library |
| **Frontend** | HTML/CSS/JavaScript |

## Configuration

<details>
<summary><b>TypeScript Configuration</b></summary>

The project uses TypeScript with the following key settings:

- **Target**: ES2020
- **Module**: CommonJS
- **Output Directory**: `dist/`
- **Source Directory**: `src/`
- **Strict Mode**: Enabled

Configuration file: `tsconfig.json`
</details>

<details>
<summary><b>AI Prompt Configuration</b></summary>

Custom prompts for the Gemini API are stored in `config/prompts/card_cutter.json`. This includes:

- System prompt for evidence extraction
- Few-shot examples for better accuracy
- Custom formatting instructions

</details>

<details>
<summary><b>Vercel Deployment</b></summary>

Deployment configuration is managed through `vercel.json`:

- Serverless functions in `/api` directory
- Static asset serving from `/public`
- Custom routing rules
- Environment variable management

</details>

## Deployment

### Vercel Deployment

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy to Vercel:
```bash
vercel
```

3. Set environment variables in Vercel dashboard:
   - Navigate to Project Settings > Environment Variables
   - Add `GEMINI_API_KEY` with your API key

### Self-Hosting

For self-hosting, you can run the Express server:

```bash
# Build the project
npm run build

# Set environment variables
export GEMINI_API_KEY=your_key_here

# Start the server
npm run start
```

The server will run on `http://localhost:3000` by default.

## Architecture Details

<details>
<summary><b>AI Integration Layer</b></summary>

The AI integration (`src/ai/gemini-wrapper.ts`) provides:

- Minimal Gemini API wrapper without SDK dependencies
- Automatic retry logic for failed requests
- Environment-agnostic design (works in browser and Node.js)
- Efficient token usage optimization

</details>

<details>
<summary><b>Document Export System</b></summary>

The document handler (`src/exporters/wordHandler.ts`) features:

- Custom tagged format parser
- Support for TAGLINE, CITE, LINK tags
- Highlighting preservation with `<HL>` tags
- Formatted Word document generation
- Bulk export capabilities

</details>

<details>
<summary><b>Serverless Architecture</b></summary>

Benefits of the serverless approach:

- Auto-scaling based on demand
- No server maintenance required
- Cost-effective for variable workloads
- Global CDN distribution
- Zero-downtime deployments

</details>

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style Guidelines

- Use TypeScript for all new code
- Follow existing code formatting patterns
- Add appropriate type definitions
- Include comments for complex logic
- Write unit tests for new features

## Troubleshooting

<details>
<summary><b>Common Issues</b></summary>

### Build Errors

If you encounter TypeScript compilation errors:
```bash
# Clean build directory
rm -rf dist/
# Reinstall dependencies
npm ci
# Rebuild
npm run build
```

### API Key Issues

Ensure your Gemini API key:
- Is valid and active
- Has appropriate permissions
- Is correctly set in environment variables

### Deployment Issues

For Vercel deployment problems:
- Check `vercel.json` configuration
- Verify environment variables are set in Vercel dashboard
- Review function logs in Vercel dashboard

</details>

## License

This project is licensed under the GNU General Public License - see the [LICENSE](LICENSE) file for details.

**Important**: This software cannot be used or redistributed for business purposes.

## Support

For issues, questions, or suggestions, please open an issue on the GitHub repository.

## Acknowledgments

- Google Gemini API for AI capabilities
- Vercel for hosting infrastructure
- The debate community for feedback and testing