import { searchWeb, fetchUrlContent } from './scraper';
import { queryKnowledge } from './rag';

export const ALL_TOOLS_SCHEMA = [
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the live internet for up-to-date information.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to look up on the web.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch the text content of a specific URL.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to fetch.',
          },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description: 'Search the user\'s local knowledge base (RAG database) for historical context or specific files/projects.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The semantic query to search for.',
          },
        },
        required: ['query'],
      },
    },
  }
];

export async function executeTool(name: string, args: Record<string, any>, embedApiKey?: string, embedBaseUrl?: string, embedModel?: string): Promise<string> {
  try {
    switch (name) {
      case 'search_web':
        if (!args.query) return 'Error: query is required.';
        const webRes = await searchWeb(args.query);
        return webRes || 'No results found.';
        
      case 'fetch_url':
        if (!args.url) return 'Error: url is required.';
        const urlRes = await fetchUrlContent(args.url);
        return urlRes || 'Failed to fetch or empty content.';
        
      case 'search_knowledge_base':
        if (!args.query) return 'Error: query is required.';
        if (!embedApiKey) return 'Error: Missing embedding API key. Cannot search knowledge base.';
        const kbRes = await queryKnowledge(args.query, embedApiKey, {
          baseUrl: embedBaseUrl || 'https://generativelanguage.googleapis.com/v1beta',
          embeddingModel: embedModel || 'gemini-embedding-001',
          limit: 5
        });
        if (!kbRes || kbRes.length === 0) return 'No relevant knowledge found.';
        return 'Knowledge Base Context:\n' + kbRes.map((r: any) => `[Source: ${r.docName}]\n"""\n${r.text}\n"""`).join('\n\n');
        
      default:
        return `Error: Unknown tool ${name}`;
    }
  } catch (e) {
    console.error(`Tool execution failed for ${name}:`, e);
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}
