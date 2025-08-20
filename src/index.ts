import { createFiberplane, createOpenAPISpec } from "@fiberplane/hono";
import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { z } from "zod";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from '@ai-sdk/google';

type Bindings = {
  GEMINI_API_KEY: string;
  SERPER_API_KEY: string;
};

interface SerperSearchResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
}

interface SerperResponse {
  organic: SerperSearchResult[];
  searchParameters: {
    q: string;
    gl: string;
    hl: string;
  };
}

function createMcpServer(env: Bindings) {
  const server = new McpServer({
    name: "get-a-gist-mcp-server",
    version: "1.0.0",
    description: "MCP server for web search and AI-powered content summarization"
  });

  server.tool(
    "search_and_summarize",
    "Search the web and generate an AI-powered summary of the results. Perfect for getting quick insights on any topic from multiple sources.",
    {
      query: z.string().min(1).describe("The search query to find relevant web content"),
      num_results: z.number().min(1).max(10).default(5).describe("Number of search results to include in summary (default: 5, max: 10)"),
      summary_length: z.number().min(50).max(500).default(150).describe("Target length of the combined summary in words (default: 150)")
    },
    async ({ query, num_results, summary_length }) => {
      try {
        // Search using Serper API
        const searchResponse = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'X-API-KEY': env.SERPER_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            q: query,
            gl: 'in', // India as default country
            hl: 'en',
            num: num_results
          })
        });

        if (!searchResponse.ok) {
          throw new Error(`Search API error: ${searchResponse.status}`);
        }

        const searchData = await searchResponse.json() as SerperResponse;
        
        if (!searchData.organic || searchData.organic.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No search results found for query: "${query}"`
              }
            ]
          };
        }

        // Combine all snippets into one text for summarization
        const combinedSnippets = searchData.organic
          .slice(0, num_results)
          .map((result, index) => `${index + 1}. ${result.title}\n${result.snippet}\nSource: ${result.link}`)
          .join('\n\n');

        // Generate AI summary using Google Gemini
        const google = createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY });
        
        const summaryResponse = await generateText({
          model: google("gemini-2.5-flash"),
          messages: [
            {
              role: "system",
              content: `You are an expert content summarizer. Create a comprehensive summary of the provided search results. The summary should be approximately ${summary_length} words and capture the key information from all sources.`
            },
            {
              role: "user",
              content: `Please summarize the following search results for the query "${query}":\n\n${combinedSnippets}`
            }
          ]
        });

        // Prepare result metadata
        const searchResults = searchData.organic.slice(0, num_results).map(result => ({
          title: result.title,
          url: result.link,
          snippet: result.snippet,
          date: result.date || null
        }));

        // Format sources list
        const sourcesList = searchResults.map((result, index) => 
          `**${index + 1}. ${result.title}**\nURL: ${result.url}\nPublished: ${result.date || 'Date not available'}`
        ).join('\n\n');

        const responseText = `# Search Results for "${query}"\n\nFound ${searchResults.length} results and generated a combined AI summary:\n\n## Combined Summary\n\n${summaryResponse.text}\n\n## Sources\n\n${sourcesList}\n\n---\n\n*Summary generated using Google Gemini 2.5 Flash*`;

        return {
          content: [
            {
              type: "text",
              text: responseText
            }
          ]
        };

      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error performing search and summarization: ${error instanceof Error ? error.message : "Unknown error"}`
            }
          ],
          isError: true
        };
      }
    }
  );

  return server;
}

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => {
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  
  return c.json({
    name: "Get-A-Gist",
    description: "MCP server for searching the web and summarizing any content using AI",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      mcp: "/mcp",
      openapi: "/openapi.json",
      explorer: "/fp",
    },
  });
});

app.get("/health", (c) => {
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  
  return c.json({
    status: "healthy",
    service: "Get-A-Gist MCP Server",
    version: "1.0.0",
    tools: ["search_and_summarize"],
    timestamp: new Date().toISOString(),
  });
});

app.all("/mcp", async (c) => {
  const mcpServer = createMcpServer(c.env);
  const transport = new StreamableHTTPTransport();
  
  await mcpServer.connect(transport);
  return transport.handleRequest(c);
});

app.get("/openapi.json", c => {
  return c.json(createOpenAPISpec(app, {
    info: {
      title: "Get-A-Gist MCP Server",
      version: "1.0.0",
      description: "MCP server for web search and AI-powered content summarization"
    },
  }));
});

app.use("/fp/*", createFiberplane({
  app,
  openapi: { url: "/openapi.json" }
}));

export default app;