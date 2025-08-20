# Get-A-Gist

A Model Context Protocol (MCP) server that provides generic web search and content summarization capabilities. Built on Cloudflare Workers, this service can search the web for any content and generate AI-powered summaries using Google Gemini Flash.

## Prerequisites

- Node.js (version 18 or higher)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed globally
- A Cloudflare account
- Google AI Studio account for Gemini API access

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Authentication

Authenticate with Cloudflare:

```bash
wrangler auth login
```

### 3. Configuration

Update the `name` field in `wrangler.jsonc` to your desired app name:

```jsonc
{
  "name": "get-a-gist",
  // ... other config
}
```

### 4. Environment Variables

This project requires the following environment variables:

#### Required:
- `GEMINI_API_KEY`: Your Google Gemini API key

#### Optional:
- `SEARCH_API_KEY`: API key for enhanced web search (currently uses DuckDuckGo as fallback)

Set up your environment variables using Wrangler:

```bash
# Set the required Gemini API key
wrangler secret put GEMINI_API_KEY

# Optional: Set search API key for enhanced search capabilities
wrangler secret put SEARCH_API_KEY
```

#### Getting a Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account
3. Click "Get API key" and create a new API key
4. Copy the API key and use it with the `wrangler secret put GEMINI_API_KEY` command

## Development

Start the development server:

```bash
npm run dev
```

Your worker will be available at `http://localhost:8787`

### Available Endpoints

- **GET /** - Service information and available endpoints
- **GET /health** - Health check endpoint
- **POST /mcp** - MCP JSON-RPC communication endpoint
- **GET /openapi.json** - OpenAPI specification
- **GET /fp** - Fiberplane API explorer

## MCP Server Usage

This server exposes a single MCP tool:

### `search_and_summarize`

Search the web and automatically summarize the top results using AI.

**Parameters:**
- `query` (string, required): The search query
- `num_results` (number, optional): Number of results to summarize (default: 5, max: 10)
- `summary_length` (number, optional): Maximum length of each summary in words (default: 150)

**Example queries:**
- "latest developments in renewable energy"
- "quantum computing breakthroughs 2024"
- "artificial intelligence trends"

## Deployment

Deploy to Cloudflare:

```bash
npm run deploy
```

After deployment, your MCP server will be available at your Cloudflare Workers URL.

## Features

- **Generic Web Search**: Search for any content across the web
- **AI-Powered Summarization**: Uses Google Gemini 2.5 Flash for intelligent content summarization
- **Content Extraction**: Automatically extracts main content from web pages
- **Concurrent Processing**: Handles multiple page summarizations efficiently
- **Error Handling**: Comprehensive error handling with fallback mechanisms
- **Rate Limiting Aware**: Respects API limits and implements proper error handling

## Architecture

- **Runtime**: Cloudflare Workers (Edge computing)
- **API Framework**: Hono.js (TypeScript-based)
- **MCP Framework**: @modelcontextprotocol/sdk with @hono/mcp
- **AI Model**: Google Gemini 2.5 Flash via Vercel AI SDK
- **Web Search**: DuckDuckGo API with fallback mechanisms

## Troubleshooting

### Common Issues

1. **Missing Gemini API Key**: Ensure you've set the `GEMINI_API_KEY` secret using `wrangler secret put GEMINI_API_KEY`

2. **Authentication issues**: Run `wrangler auth login` and ensure you're logged in to the correct Cloudflare account

3. **Name conflicts**: If you get naming conflicts during deployment, change the `name` field in `wrangler.jsonc` to something unique

4. **Search results not appearing**: The service uses DuckDuckGo's free API which may have limitations. Consider adding a `SEARCH_API_KEY` for enhanced search capabilities

5. **Summarization errors**: Check that your Gemini API key is valid and has sufficient quota

### Getting Help

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [Google AI Studio](https://aistudio.google.com/)
- [Hono.js Documentation](https://hono.dev/)

## Next Steps

- Configure your MCP client to connect to your deployed server
- Test the `search_and_summarize` tool with various queries
- Monitor usage and API quotas in your Cloudflare and Google AI dashboards
- Consider implementing additional search providers for enhanced results
- Explore adding more MCP tools for specialized content processing