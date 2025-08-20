import { createFiberplane, createOpenAPISpec } from "@fiberplane/hono";
import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { z } from "zod";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

type Bindings = {
  GEMINI_API_KEY: string;
  SERPER_API_KEY: string;
  SEARCH_API_KEY?: string;
};

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  published?: string;
}

interface SummarizedResult {
  title: string;
  url: string;
  summary: string;
  published?: string;
  originalSnippet: string;
}

// Extract main content from HTML
function extractMainContent(html: string): string {
  // Remove script and style tags
  let content = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Remove HTML tags but keep text content
  content = content.replace(/<[^>]*>/g, ' ');
  
  // Clean up whitespace
  content = content.replace(/\s+/g, ' ').trim();
  
  // Limit content length to avoid token limits
  return content.substring(0, 5000);
}

// Perform web search using Serper API (Google Search)
async function searchWeb(query: string, numResults: number, env: Bindings): Promise<SearchResult[]> {
  const serperApiKey = env.SERPER_API_KEY;
  if (!serperApiKey) {
    throw new Error('SERPER_API_KEY is required but not configured');
  }

  try {
    console.log(`[SERPER] Searching for: "${query}" with ${numResults} results`);
    
    const requestBody = {
      q: query,
      num: numResults,
      gl: 'in', // Country - India
      hl: 'en', // Language
    };
    
    console.log(`[SERPER] Request body:`, JSON.stringify(requestBody));
    
    // Use the correct Serper endpoint (removed /w)
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': serperApiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`[SERPER] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SERPER] API error: ${response.status} - ${errorText}`);
      throw new Error(`Serper API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;
    console.log('[SERPER] Response received:', JSON.stringify(data, null, 2));
    
    const results: SearchResult[] = [];

    // Process organic results from Serper
    if (data.organic && Array.isArray(data.organic)) {
      console.log(`[SERPER] Processing ${data.organic.length} organic results`);
      for (const result of data.organic.slice(0, numResults)) {
        results.push({
          title: result.title || 'No title',
          url: result.link || '',
          snippet: result.snippet || 'No description available',
          published: result.date || new Date().toISOString(),
        });
      }
    }

    // If no organic results, try news results
    if (results.length === 0 && data.news && Array.isArray(data.news)) {
      console.log(`[SERPER] No organic results, processing ${data.news.length} news results`);
      for (const result of data.news.slice(0, numResults)) {
        results.push({
          title: result.title || 'No title',
          url: result.link || '',
          snippet: result.snippet || 'No description available',
          published: result.date || new Date().toISOString(),
        });
      }
    }

    console.log(`[SERPER] Found ${results.length} search results`);
    return results;
  } catch (error) {
    console.error('[SERPER] Search error:', error);
    throw error;
  }
}

// Fetch and extract content from a URL
async function fetchPageContent(url: string): Promise<string> {
  try {
    console.log(`[FETCH] Attempting to fetch: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GetAGist/1.0)',
      },
    });
    
    console.log(`[FETCH] Response status: ${response.status} for ${url}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    console.log(`[FETCH] HTML length: ${html.length} characters`);
    
    const content = extractMainContent(html);
    console.log(`[FETCH] Extracted content length: ${content.length} characters`);
    
    return content;
  } catch (error) {
    console.error(`[FETCH] Error fetching ${url}:`, error);
    return '';
  }
}

// Generate AI summary using Gemini
async function generateSummary(content: string, summaryLength: number, env: Bindings): Promise<string> {
  try {
    console.log(`[GEMINI] Generating summary for content length: ${content.length} characters`);
    
    if (!content || content.trim().length === 0) {
      console.log(`[GEMINI] No content provided for summarization`);
      return "No content available to summarize.";
    }
    
    const google = createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY });
    
    const summaryPrompt = `Please provide a concise summary of the following content in approximately ${summaryLength} words. Focus on the key points and main insights:\n\nContent: ${content}\n\nSummary:`;

    console.log(`[GEMINI] Sending request to Gemini API`);
    const response = await generateText({
      model: google("gemini-2.5-flash"),
      messages: [
        { role: "user", content: summaryPrompt }
      ],
    });

    console.log(`[GEMINI] Summary generated, length: ${response.text.length} characters`);
    return response.text;
  } catch (error) {
    console.error('[GEMINI] Summary generation error:', error);
    return content.substring(0, summaryLength * 5); // Fallback to truncated content
  }
}

// Create MCP server with search and summarize tool
function createMcpServer(env: Bindings) {
  const server = new McpServer({
    name: "get-a-gist",
    version: "1.0.0",
    description: "MCP server for searching the web and summarizing any content using AI",
  });

  server.tool(
    "search_and_summarize",
    {
      query: z.string().min(1).describe("The search query to find relevant content"),
      num_results: z.number().min(1).max(10).default(5).describe("Number of results to summarize (max 10)"),
      summary_length: z.number().min(50).max(500).default(150).describe("Maximum length of each summary in words"),
    },
    async ({ query, num_results, summary_length }) => {
      try {
        // Step 1: Search the web
        const searchResults = await searchWeb(query, num_results, env);
        
        if (searchResults.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No search results found for query: "${query}". This could be due to API limitations or the query not returning any results.`,
            }],
            isError: false,
          };
        }

        // Step 2: Process results and generate summaries
        const google = createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY });
        const summarizedResults: SummarizedResult[] = [];

        for (const result of searchResults) {
          try {
            // Fetch page content if URL is accessible
            let contentToSummarize = result.snippet;
            
            // Try to fetch full content for better summarization
            if (result.url && !result.url.includes('example.com')) {
              const pageContent = await fetchPageContent(result.url);
              if (pageContent && pageContent.length > result.snippet.length) {
                contentToSummarize = pageContent;
              }
            }

            // Generate AI summary
            const summaryPrompt = `Please provide a concise summary of the following content in approximately ${summary_length} words. Focus on the key points and main insights:

Content: ${contentToSummarize}

Summary:`;

            const response = await generateText({
              model: google("gemini-2.5-flash"),
              messages: [
                { role: "user", content: summaryPrompt }
              ],
            });

            summarizedResults.push({
              title: result.title,
              url: result.url,
              summary: response.text,
              published: result.published,
              originalSnippet: result.snippet,
            });

          } catch (summaryError) {
            console.error(`Error summarizing ${result.url}:`, summaryError);
            // Fallback to original snippet
            summarizedResults.push({
              title: result.title,
              url: result.url,
              summary: result.snippet,
              published: result.published,
              originalSnippet: result.snippet,
            });
          }
        }

        // Step 3: Format and return results
        const formattedResults = summarizedResults.map((result, index) => {
          return `**${index + 1}. ${result.title}**
URL: ${result.url}
${result.published ? `Published: ${new Date(result.published).toLocaleDateString()}` : ''}

**AI Summary:**
${result.summary}

---`;
        }).join('\n\n');

        const responseText = `# Search Results for "${query}"

Found ${summarizedResults.length} results and generated AI summaries:

${formattedResults}

*Summaries generated using Google Gemini 2.5 Flash*`;

        return {
          content: [{
            type: "text",
            text: responseText,
          }],
        };

      } catch (error) {
        console.error('Search and summarize error:', error);
        return {
          content: [{
            type: "text",
            text: `Error processing search query "${query}": ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
          isError: true,
        };
      }
    }
  );

  return server;
}

const app = new Hono<{ Bindings: Bindings }>();

// Health check endpoint
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

// Root endpoint
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
      search: "/api/search",
      openapi: "/openapi.json",
      explorer: "/fp",
    },
  });
});

// MCP endpoint
app.all("/mcp", async (c) => {
  const mcpServer = createMcpServer(c.env);
  const transport = new StreamableHTTPTransport();
  
  await mcpServer.connect(transport);
  return transport.handleRequest(c);
});

// REST API endpoint for direct testing
app.post("/api/search", async (c) => {
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  
  try {
    const body = await c.req.json();
    const { query, num_results = 5, summary_length = 150 } = body;
    
    if (!query) {
      return c.json({ error: "Query parameter is required" }, 400);
    }
    
    // Step 1: Search the web
    console.log(`[API] Starting search for: "${query}"`);
    const searchResults = await searchWeb(query, num_results, c.env);
    console.log(`[API] Search completed, found ${searchResults.length} results`);
    
    if (searchResults.length === 0) {
      return c.json({
        query,
        results: [],
        message: "No search results found",
        debug: "Serper API returned no results"
      });
    }
    
    // Step 2: Fetch and summarize content
    const summaries = [];
    for (let i = 0; i < searchResults.length; i++) {
      const result = searchResults[i];
      console.log(`[API] Processing result ${i + 1}: ${result.title}`);
      
      try {
        // Try to fetch full content, but fallback to snippet if it fails
        let contentToSummarize = result.snippet;
        let pageContent = '';
        let contentSource = 'snippet';
        
        if (result.url && !result.url.includes('example.com')) {
          console.log(`[API] Fetching content from: ${result.url}`);
          pageContent = await fetchPageContent(result.url);
          console.log(`[API] Fetched content length: ${pageContent.length} characters`);
          
          if (pageContent && pageContent.length > 100) {
            contentToSummarize = pageContent;
            contentSource = 'full_page';
            console.log(`[API] Using full page content for summarization`);
          } else {
            console.log(`[API] Page content too short, using snippet instead`);
          }
        }
        
        console.log(`[API] Generating summary for result ${i + 1}`);
        const summary = await generateSummary(contentToSummarize, summary_length, c.env);
        console.log(`[API] Summary generated, length: ${summary.length} characters`);
        
        summaries.push({
          title: result.title,
          url: result.url,
          published: result.published,
          summary: summary,
          contentSource: contentSource,
          contentLength: contentToSummarize.length
        });
      } catch (error) {
        console.error(`[API] Error processing ${result.url}:`, error);
        summaries.push({
          title: result.title,
          url: result.url,
          published: result.published,
          summary: result.snippet, // Fallback to snippet
          contentSource: 'snippet_fallback',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    console.log(`[API] Completed processing ${summaries.length} results`);
    
    return c.json({
      query,
      results: summaries,
      count: summaries.length,
      timestamp: new Date().toISOString(),
      debug: {
        searchResultsFound: searchResults.length,
        summariesGenerated: summaries.length
      }
    });
  } catch (error) {
    console.error('[API] Error:', error);
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      debug: 'Check server logs for more details'
    }, 500);
  }
});

// OpenAPI specification
app.get("/openapi.json", c => {
  return c.json(createOpenAPISpec(app, {
    info: {
      title: "Get-A-Gist MCP Server",
      version: "1.0.0",
      description: "MCP server for searching the web and summarizing any content using AI",
    },
  }));
});

// Fiberplane API explorer
app.use("/fp/*", createFiberplane({
  app,
  openapi: { url: "/openapi.json" }
}));

export default app;