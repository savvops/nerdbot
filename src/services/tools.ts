import {
  searchWeb,
  fetchUrlContent,
  searchAndExtractUrls,
  bulkFetchUrls,
} from "./scraper";
import { queryKnowledge } from "./rag";
import type { SearchSettings } from "./types";

export const ALL_TOOLS_SCHEMA = [
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the live internet for up-to-date information.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to look up on the web.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Fetch the text content of a specific URL.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL to fetch.",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_knowledge_base",
      description:
        "Search the user's local knowledge base (RAG database) for historical context or specific files/projects.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The semantic query to search for.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deep_research",
      description:
        "Performs a deep, comprehensive research task by searching the web and concurrently reading up to 30 URLs to synthesize a massive report.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The deep research topic to investigate.",
          },
        },
        required: ["query"],
      },
    },
  },
];

export interface ToolExecutionOptions {
  embedApiKey?: string;
  embedBaseUrl?: string;
  embedModel?: string;
  search?: Partial<SearchSettings> | null;
}

export async function executeTool(
  name: string,
  args: Record<string, any>,
  options: ToolExecutionOptions = {},
): Promise<string> {
  try {
    switch (name) {
      case "search_web":
        if (!args.query) return "Error: query is required.";
        const webRes = await searchWeb(args.query, options.search);
        return webRes || "No results found.";

      case "fetch_url":
        if (!args.url) return "Error: url is required.";
        const urlRes = await fetchUrlContent(args.url);
        return urlRes || "Failed to fetch or empty content.";

      case "search_knowledge_base":
        if (!args.query) return "Error: query is required.";
        if (!options.embedApiKey)
          return "Error: Missing embedding API key. Cannot search knowledge base.";
        const kbRes = await queryKnowledge(args.query, options.embedApiKey, {
          baseUrl:
            options.embedBaseUrl ||
            "https://generativelanguage.googleapis.com/v1beta",
          embeddingModel: options.embedModel || "gemini-embedding-001",
          limit: 5,
        });
        if (!kbRes || kbRes.length === 0) return "No relevant knowledge found.";
        return (
          "Knowledge Base Context:\n" +
          kbRes
            .map((r: any) => `[Source: ${r.docName}]\n"""\n${r.text}\n"""`)
            .join("\n\n")
        );

      case "deep_research":
        if (!args.query) return "Error: query is required.";
        const urls = await searchAndExtractUrls(args.query, 30, options.search);
        if (!urls || urls.length === 0)
          return "Error: Could not find any URLs for deep research.";
        const bulkRes = await bulkFetchUrls(urls, 5);
        return bulkRes || "Failed to fetch contents for deep research.";

      default:
        return `Error: Unknown tool ${name}`;
    }
  } catch (e) {
    console.error(`Tool execution failed for ${name}:`, e);
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}
