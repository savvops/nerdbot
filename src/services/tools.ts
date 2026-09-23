import {
  searchWeb,
  fetchUrlContent,
  searchAndExtractUrls,
  bulkFetchUrls,
} from "./scraper";
import { queryKnowledge } from "./rag";
import type { SearchSettings } from "./types";
import { BROWSER_TOOLS, executeBrowserTool, controlState } from './browserControl';

const seenToolNames = new Set<string>();
export const ALL_TOOLS_SCHEMA = [
  ...BROWSER_TOOLS.filter(
    (t) => t.function.name !== 'browser_navigate' && t.function.name !== 'browser_scroll',
  ),
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
  {
    type: "function",
    function: {
      name: "browser_scan_page",
      description:
        "Inspects the active browser tab silently in the background and returns all clickable buttons, inputs, links, and actionable elements with target IDs (e.g. t1, t2).",
      parameters: {
        type: "object",
        properties: {
          showOverlays: {
            type: "boolean",
            description: "Whether to render visual badge numbers on the webpage (default: false).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_click",
      description:
        "Clicks an interactive button, link, or element on the active browser tab by its target ID (e.g. 't1') or visible label.",
      parameters: {
        type: "object",
        properties: {
          targetId: {
            type: "string",
            description: "The target ID (e.g. 't1', 't5') returned from browser_scan_page, or exact button label.",
          },
        },
        required: ["targetId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_type",
      description:
        "Enters text into an input field or textarea on the active webpage.",
      parameters: {
        type: "object",
        properties: {
          targetId: {
            type: "string",
            description: "The input target ID (e.g. 't2') or label.",
          },
          text: {
            type: "string",
            description: "The text to type into the field.",
          },
          clearFirst: {
            type: "boolean",
            description: "Whether to clear existing text before typing (default: false).",
          },
          pressEnter: {
            type: "boolean",
            description: "Whether to press Enter key after typing to submit (default: false).",
          },
        },
        required: ["targetId", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_select",
      description: "Selects an option in a dropdown menu on the active webpage.",
      parameters: {
        type: "object",
        properties: {
          targetId: {
            type: "string",
            description: "The target ID of the select element.",
          },
          value: {
            type: "string",
            description: "The option value or visible text to select.",
          },
        },
        required: ["targetId", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_scroll",
      description: "Scrolls the active webpage in a given direction.",
      parameters: {
        type: "object",
        properties: {
          direction: {
            type: "string",
            enum: ["up", "down", "top", "bottom"],
            description: "Direction to scroll.",
          },
          amount: {
            type: "number",
            description: "Pixels to scroll (default 500).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_navigate",
      description: "Navigates the active browser tab to a new URL.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The full destination URL (must start with http:// or https://).",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_extract_session",
      description:
        "Extract authenticated session cookies, headers, and active URL from the current browser tab to generate ready-to-run cURL or Python CLI commands for terminal and Master Control.",
      parameters: {
        type: "object",
        properties: {
          format: {
            type: "string",
            enum: ["curl", "python", "json"],
            description: "Output format: curl command, python requests script, or json cookies",
          },
          targetPath: {
            type: "string",
            description: "Optional API path or sub-endpoint on this domain (e.g. /api/v1/profile)",
          },
        },
      },
    },
  },
].filter((tool) => {
  if (seenToolNames.has(tool.function.name)) return false;
  seenToolNames.add(tool.function.name);
  return true;
});

export interface ToolExecutionOptions {
  signal?: AbortSignal;
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
    if (options.signal?.aborted) return 'Error: stopped by user.';
    if (['browser_screenshot', 'browser_observe', 'browser_action'].includes(name)) {
      return JSON.stringify(await executeBrowserTool(name, args, options.signal));
    }
    if ((name === 'browser_navigate' || name === 'browser_scroll') && controlState()) {
      return JSON.stringify(await executeBrowserTool(name, args, options.signal));
    }
    switch (name) {
      case "search_web":
        if (!args.query) return "Error: query is required.";
        const webRes = await searchWeb(args.query, options.search);
        return webRes || "No results found.";

      case "fetch_url":
        if (!args.url) return "Error: url is required.";
        const urlRes = await fetchUrlContent(args.url);
        return urlRes || "Public fetch returned no readable content. This does not prove the page is empty. For a signed-in or JavaScript-rendered page, use browser_observe on the bound tab. If that also fails, explain the limitation using evidence already collected.";

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

      case "browser_scan_page": {
        const reply = await chrome.runtime.sendMessage({
          type: "EXECUTE_BROWSER_ACTION",
          payload: {
            action: "scan_page",
            args: { showOverlays: !!args.showOverlays },
          },
        });
        if (!reply?.ok) {
          return `Error: ${reply?.error || "Failed to scan page elements."}`;
        }
        const data = reply.data;
        if (!data || !data.targets || data.targets.length === 0) {
          return `Page "${data?.title || "Active Page"}" (${data?.url || ""}) has no interactive elements detected.`;
        }
        const lines = data.targets.map(
          (t: any) =>
            `- [${t.id}] (${t.role}) "${t.name || "unnamed"}" [actions: ${t.actions.join(", ")}]${
              t.value ? ` (value: "${t.value}")` : ""
            }`
        );
        return (
          `Scanned Page: "${data.title}" (${data.url})\n` +
          `Found ${data.totalInteractive} interactive elements (showing top ${data.targets.length} with numbered badges):\n\n` +
          lines.join("\n") +
          `\n\nTip: Use browser_click with targetId (e.g. "t1") or browser_type with targetId to act.`
        );
      }

      case "browser_click": {
        if (!args.targetId) return "Error: targetId is required.";
        const reply = await chrome.runtime.sendMessage({
          type: "EXECUTE_BROWSER_ACTION",
          payload: { action: "click", args: { targetId: args.targetId } },
        });
        if (!reply?.ok) return `Error: ${reply?.error || reply?.message || "Failed to click element."}`;
        return reply.message || `Successfully clicked ${args.targetId}.`;
      }

      case "browser_type": {
        if (!args.targetId || args.text === undefined) {
          return "Error: targetId and text are required.";
        }
        const reply = await chrome.runtime.sendMessage({
          type: "EXECUTE_BROWSER_ACTION",
          payload: {
            action: "type",
            args: {
              targetId: args.targetId,
              text: args.text,
              clearFirst: !!args.clearFirst,
              pressEnter: !!args.pressEnter,
            },
          },
        });
        if (!reply?.ok) return `Error: ${reply?.error || reply?.message || "Failed to type into element."}`;
        return reply.message || `Successfully entered text into ${args.targetId}.`;
      }

      case "browser_select": {
        if (!args.targetId || !args.value) return "Error: targetId and value are required.";
        const reply = await chrome.runtime.sendMessage({
          type: "EXECUTE_BROWSER_ACTION",
          payload: {
            action: "select",
            args: { targetId: args.targetId, value: args.value },
          },
        });
        if (!reply?.ok) return `Error: ${reply?.error || reply?.message || "Failed to select option."}`;
        return reply.message || `Successfully selected "${args.value}".`;
      }

      case "browser_scroll": {
        const reply = await chrome.runtime.sendMessage({
          type: "EXECUTE_BROWSER_ACTION",
          payload: {
            action: "scroll",
            args: { direction: args.direction || "down", amount: args.amount },
          },
        });
        if (!reply?.ok) return `Error: ${reply?.error || reply?.message || "Failed to scroll."}`;
        return reply.message || `Scrolled page ${args.direction || "down"}.`;
      }

      case "browser_navigate": {
        if (!args.url) return "Error: url is required.";
        const reply = await chrome.runtime.sendMessage({
          type: "EXECUTE_BROWSER_ACTION",
          payload: { action: "navigate", args: { url: args.url } },
        });
        if (!reply?.ok) return `Error: ${reply?.error || reply?.message || "Failed to navigate."}`;
        return reply.message || `Navigated to ${args.url}`;
      }

      case "browser_extract_session": {
        const reply = await chrome.runtime.sendMessage({
          type: "GET_SESSION_COOKIES",
        });
        if (!reply?.ok || !reply.data) {
          return `Error extracting session cookies: ${reply?.error || "Active tab unavailable"}`;
        }
        const { url, title, cookies } = reply.data;
        let targetUrl = url;
        if (args.targetPath) {
          try {
            targetUrl = new URL(args.targetPath, url).toString();
          } catch {
            targetUrl = `${url.replace(/\/$/, "")}/${args.targetPath.replace(/^\//, "")}`;
          }
        }
        const format = args.format || "curl";
        const cookieHeader = (cookies as Array<{ name: string; value: string }>)
          .map((c) => `${c.name}=${c.value}`)
          .join("; ");

        if (format === "json") {
          return JSON.stringify(
            { url: targetUrl, title, cookieCount: cookies.length, cookies },
            null,
            2,
          );
        }

        if (format === "python") {
          return `# Authenticated Python Script for ${title || targetUrl}
import requests

cookies = {
${(cookies as Array<{ name: string; value: string }>).map((c) => `    ${JSON.stringify(c.name)}: ${JSON.stringify(c.value)},`).join("\n")}
}

headers = {
    "User-Agent": "${navigator.userAgent}",
    "Accept": "application/json, text/plain, */*",
}

response = requests.get(${JSON.stringify(targetUrl)}, cookies=cookies, headers=headers)
print("Status:", response.status_code)
print("Response preview:", response.text[:500])
`;
        }

        return `# Authenticated cURL Command for ${title || targetUrl}
# Run this directly in Master Control or your terminal:
curl -X GET ${JSON.stringify(targetUrl)} \\
  -H "User-Agent: ${navigator.userAgent}" \\
  -H "Cookie: ${cookieHeader}" \\
  -H "Accept: application/json, text/plain, */*"`;
      }

      default:
        return `Error: Unknown tool ${name}`;
    }
  } catch (e) {
    console.error(`Tool execution failed for ${name}:`, e);
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}
