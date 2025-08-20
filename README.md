# Get-A-Gist MCP Server Specification

This document outlines the design and implementation of a Model Context Protocol (MCP) server that provides web search and AI-powered content summarization capabilities.

The server searches the web for any content using Google Search (via Serper API) and generates intelligent combined summaries using Google Gemini 2.5 Flash AI. It's designed to handle queries like "latest AI news", "quantum computing breakthroughs", or any topic requiring quick insights from multiple web sources.

## 1. Technology Stack

- **Edge Runtime:** Cloudflare Workers
- **API Framework:** Hono.js (TypeScript-based web framework)
- **MCP Framework:** @modelcontextprotocol/sdk and @hono/mcp
- **AI Model:** Google Gemini 2.5 Flash via Vercel AI SDK
- **Web Search:** Serper API (Google Search API)
- **HTTP Client:** Built-in fetch API
- **Language:** TypeScript

## 2. Architecture Overview

The server follows a streamlined architecture focused on real-time processing:

1. **MCP Client** sends search query via MCP protocol
2. **Serper API** provides real Google search results
3. **Content Processing** combines search result snippets
4. **Google Gemini** generates a single comprehensive summary
5. **Formatted Response** returned to MCP client

No persistent storage is required - all processing happens in real-time.

## 3. MCP Server Tools

The server exposes a single, powerful tool:

### 3.1. Search and Summarize Tool

- **Tool Name:** `search_and_summarize`
- **Description:** "Search the web and generate an AI-powered summary of the results. Perfect for getting quick insights on any topic from multiple sources."
- **Parameters:**
  - `query` (string, required): The search query to find relevant web content
  - `num_results` (number, optional): Number of search results to include in summary (default: 5, max: 10)
  - `summary_length` (number, optional): Target length of the combined summary in words (default: 150)
- **Returns:** Formatted text with combined summary and source list

### 3.2. Tool Workflow

1. **Search Phase:** Query Serper API with user's search terms
2. **Content Aggregation:** Combine snippets from all search results
3. **AI Summarization:** Generate single comprehensive summary using Gemini
4. **Response Formatting:** Return structured response with summary and sources

## 4. API Endpoints

### 4.1. MCP Communication Endpoint

- **ALL /mcp**
  - Description: Handle all MCP JSON-RPC communication
  - Uses StreamableHTTPTransport for direct Hono context handling
  - Processes `search_and_summarize` tool calls
  - Returns formatted text responses

### 4.2. Health Check Endpoint

- **GET /health**
  - Description: Server health and status check
  - Returns: Service status, version, available tools, timestamp
  - Headers: No-cache headers for real-time status

### 4.3. Root Information Endpoint

- **GET /**
  - Description: Server information and available endpoints
  - Returns: Service name, description, version, endpoint list
  - Headers: No-cache headers

### 4.4. OpenAPI Documentation

- **GET /openapi.json**
  - Description: OpenAPI specification for the server
  - Returns: Complete API documentation in OpenAPI format

## 5. Integrations

### 5.1. Serper API Integration

- **Service:** Google Search API via Serper.dev
- **Endpoint:** `https://google.serper.dev/search`
- **Method:** POST with JSON payload
- **Configuration:**
  - Country: India (`gl: 'in'`)
  - Language: English (`hl: 'en'`)
  - Results: Configurable (1-10)
- **Response Processing:** Extract organic search results with titles, URLs, snippets, and dates

### 5.2. Google Gemini Integration

- **Model:** `gemini-2.5-flash` via Vercel AI SDK
- **Provider:** Google Generative AI
- **Usage:** Single combined summarization of all search result snippets
- **Prompt Strategy:** System prompt for expert summarization + user content
- **Output:** Comprehensive summary capturing key information from all sources

## 6. Environment Variables and Bindings

Required environment variables:

- **`GEMINI_API_KEY`** (string, required): Google Gemini API key for AI summarization
- **`SERPER_API_KEY`** (string, required): Serper API key for Google search access

## 7. Response Format

### 7.1. MCP Tool Response

```
# Search Results for "{query}"

Found {count} results and generated a combined AI summary:

## Combined Summary

{ai_generated_summary}

## Sources

**1. {title}**
URL: {url}
Published: {date}

**2. {title}**
URL: {url}
Published: {date}

---

*Summary generated using Google Gemini 2.5 Flash*
```

### 7.2. Error Handling

- **No Results:** Informative message about query limitations
- **API Failures:** Graceful error messages with context
- **Invalid Parameters:** Clear parameter validation errors

## 8. Key Features

### 8.1. Performance Optimizations

- **Snippet-Only Processing:** Uses search result snippets instead of full page content for speed
- **Single Summary:** One comprehensive summary instead of individual summaries
- **No Caching:** Real-time results with cache-control headers
- **Concurrent Processing:** Efficient handling of multiple search results

### 8.2. Content Processing Strategy

- **Combined Approach:** Aggregates all search result snippets into single content block
- **AI-Powered:** Uses advanced language model for intelligent summarization
- **Source Attribution:** Maintains clear links to original sources
- **Flexible Length:** Configurable summary length based on user needs

### 8.3. Geographic Localization

- **Default Country:** India for search results localization
- **Language:** English for consistent processing
- **Regional Relevance:** Results tailored to Indian context when applicable

## 9. Deployment Configuration

### 9.1. Cloudflare Workers Setup

- **Runtime:** Cloudflare Workers with Hono.js
- **Bindings:** Environment variables for API keys
- **Secrets Management:** Secure storage of API credentials
- **Edge Deployment:** Global distribution for low latency

### 9.2. Security Considerations

- **API Key Protection:** Secure environment variable storage
- **Rate Limiting:** Handled by upstream APIs (Serper, Gemini)
- **Input Validation:** Parameter validation and sanitization
- **Error Disclosure:** Minimal error information exposure

## 10. Usage Examples

### 10.1. Latest News Query
```
Query: "Latest AI news"
Results: 5 sources from AI news sites, tech blogs, major publications
Summary: Comprehensive overview of recent AI developments, funding, product launches
```

### 10.2. Technical Research Query
```
Query: "quantum computing breakthroughs 2024"
Results: 3-10 sources from research institutions, tech publications
Summary: Key advances, research findings, commercial applications
```

### 10.3. Market Analysis Query
```
Query: "cryptocurrency market trends"
Results: Multiple financial and crypto news sources
Summary: Market movements, regulatory updates, expert analysis
```

## 11. Further Reading

- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)
- [Hono.js Framework](https://hono.dev/)
- [Serper API Documentation](https://serper.dev/)
- [Google Gemini API](https://ai.google.dev/)
- [Cloudflare Workers](https://workers.cloudflare.com/)
