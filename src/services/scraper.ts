import {
  formatSearchResults,
  normalizeSearchSettings,
  resolveSearchProviderOrder,
  searchSearxng,
  type SearchResult,
} from "./searchProviders";
import type { SearchSettings } from "./types";
import { hasAllUrls } from "./permissions";

/**
 * Universal web scraper service.
 * Uses Jina Reader (r.jina.ai) to fetch content from any URL.
 */

export async function fetchUrlContent(url: string): Promise<string | null> {
  try {
    // Jina Reader's YouTube transcript extractor only triggers reliably on standard watch URLs.
    let targetUrl = url;
    if (targetUrl.includes("youtube.com/shorts/")) {
      const id = targetUrl.split("/shorts/")[1]?.split(/[?#]/)[0];
      if (id) targetUrl = `https://www.youtube.com/watch?v=${id}`;
    } else if (targetUrl.includes("youtu.be/")) {
      const id = targetUrl.split("youtu.be/")[1]?.split(/[?#]/)[0];
      if (id) targetUrl = `https://www.youtube.com/watch?v=${id}`;
    }

    const jinaUrl = `https://r.jina.ai/${targetUrl}`;
    const res = await fetch(jinaUrl, {
      headers: {
        Accept: "application/json",
        "X-No-Cache": "true",
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    // Jina Reader returns the clean markdown in the 'content' field.
    return data.data?.content || null;
  } catch (e) {
    console.error("Failed to fetch URL content:", e);
    return null;
  }
}

async function searchJina(query: string): Promise<string | null> {
  const url = `https://s.jina.ai/${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { Accept: "text/plain", "X-No-Cache": "true" },
  });
  if (!res.ok) return null;
  const text = await res.text();
  return text.trim() || null;
}

async function fetchDuckDuckGoResults(
  query: string,
  maxResults = 8,
): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { Accept: "text/html" },
  });
  if (!res.ok) return [];
  return parseDuckDuckGoResults(await res.text()).slice(0, maxResults);
}

export function parseDuckDuckGoResults(html: string): SearchResult[] {
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return Array.from(doc.querySelectorAll(".result"))
      .map((row): SearchResult | null => {
        const link = row.querySelector<HTMLAnchorElement>(
          "a.result__a, a[href]",
        );
        const rawUrl = link?.getAttribute("href") || "";
        const title = cleanText(link?.textContent || "");
        const snippet = cleanText(
          row.querySelector(".result__snippet")?.textContent || "",
        );
        const url = normalizeDuckDuckGoUrl(rawUrl);
        return title && url
          ? {
              title,
              url,
              source: "duckduckgo",
              ...(snippet ? { snippet } : {}),
            }
          : null;
      })
      .filter((r): r is SearchResult => !!r)
      .filter((r, idx, all) => all.findIndex((x) => x.url === r.url) === idx)
      .slice(0, 8);
  }

  const results: SearchResult[] = [];
  const linkRegex =
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null && results.length < 8) {
    const nextLinkIdx = html.indexOf("result__a", linkRegex.lastIndex);
    const block = html.slice(
      linkRegex.lastIndex,
      nextLinkIdx > -1 ? nextLinkIdx : linkRegex.lastIndex + 2500,
    );
    const snippetMatch = block.match(
      /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
    );
    const title = cleanText(stripTags(match[2]));
    const url = normalizeDuckDuckGoUrl(decodeHtml(match[1]));
    const snippet = cleanText(stripTags(snippetMatch?.[1] || ""));
    if (title && url && !results.some((r) => r.url === url)) {
      results.push({ title, url, source: "duckduckgo", snippet });
    }
  }
  return results;
}

function normalizeDuckDuckGoUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  try {
    const absolute = new URL(rawUrl, "https://duckduckgo.com").toString();
    const parsed = new URL(absolute);
    const uddg = parsed.searchParams.get("uddg");
    return uddg || absolute;
  } catch {
    return "";
  }
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

function cleanText(value: string): string {
  return decodeHtml(value).replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string): string {
  const decoded = value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");

  return decoded.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(Number(code)),
  );
}

/**
 * Resolves the provider order the extension is actually permitted to use.
 * duckduckgo/searxng issue cross-origin requests that need the "<all_urls>"
 * host grant for CORS; Jina is CORS-safe. Without the grant the host-only
 * providers are skipped — but never silently rerouted: if the user's
 * configured order contains ONLY host-only providers (e.g. a self-hosted
 * SearXNG), we return [] rather than leak their queries to a third party.
 */
async function permittedProviderOrder(
  normalized: SearchSettings,
): Promise<ReturnType<typeof resolveSearchProviderOrder>> {
  const providerOrder = resolveSearchProviderOrder(normalized);
  if (await hasAllUrls()) return providerOrder;
  return providerOrder.filter((p) => p !== "duckduckgo" && p !== "searxng");
}

const SEARCH_PERMISSION_NOTE =
  "Web search is unavailable: the configured search backend needs the site-access permission. " +
  "Ask the user to grant site access in Settings (or chrome://extensions → Nerdbot → Site access).";

/**
 * Search the web via the configured search router.
 * Option A default is public-safe Jina, with optional SearXNG and DuckDuckGo fallbacks.
 * Used to give non-Gemini providers access to live web results by injecting them into context.
 */
export async function searchWeb(
  query: string,
  settings?: Partial<SearchSettings> | null,
): Promise<string | null> {
  try {
    const normalized = normalizeSearchSettings(settings);
    const providerOrder = await permittedProviderOrder(normalized);
    if (providerOrder.length === 0) return SEARCH_PERMISSION_NOTE;
    for (const provider of providerOrder) {
      try {
        if (provider === "jina") {
          const jina = await searchJina(query);
          if (jina) return jina;
        }
        if (provider === "searxng") {
          const searxngResults = await searchSearxng(query, normalized);
          const formatted = formatSearchResults(query, searxngResults);
          if (formatted) return formatted;
        }
        if (provider === "duckduckgo") {
          const duckResults = await fetchDuckDuckGoResults(
            query,
            normalized.maxResults,
          );
          const formatted = formatSearchResults(query, duckResults);
          if (formatted) return formatted;
        }
      } catch (e) {
        console.warn(`${provider} search failed, trying next provider:`, e);
      }
    }
    return null;
  } catch (e) {
    console.error("Web search failed:", e);
    return null;
  }
}

/**
 * Strip common web-search intent phrases from the user message to produce
 * a cleaner query for Jina AI search (which proxies Google Search).
 */
export function extractSearchQuery(text: string): string {
  const stripped = text
    .trim()
    .replace(
      /^(search\s+(the\s+)?web\s+(for\s+)?|look\s+up\s+|find\s+(me\s+)?|google\s+|search\s+for\s+)/i,
      "",
    )
    .replace(/^(what\s+is\s+the\s+|what's\s+the\s+|whats\s+the\s+)/i, "")
    .replace(/^(what\s+is\s+|what's\s+|whats\s+)/i, "")
    .replace(
      /^(when\s+is\s+|where\s+is\s+|who\s+is\s+|how\s+(do\s+I\s+|to\s+))/i,
      "",
    )
    .trim();
  return stripped.length > 2 ? stripped : text.trim();
}

export function extractUrl(text: string): string | null {
  // Broad URL regex but excludes common punctuation at the end and internal schemas
  const urlRegex = /(https?:\/\/[^\s$.?#].[^\s]*)/gi;
  const matches = text.match(urlRegex);
  if (!matches) return null;

  // Filter out internal or obviously invalid URLs after trimming trailing punctuation
  const valid = matches
    .map((url) => url.replace(/[.,;:!?)\]'"\s]+$/, ""))
    .find((url) => {
      try {
        const u = new URL(url);
        return (
          !u.hostname.includes("localhost") && !u.protocol.includes("chrome")
        );
      } catch {
        return false;
      }
    });

  return valid || null;
}

export async function searchAndExtractUrls(
  query: string,
  maxUrls: number = 30,
  settings?: Partial<SearchSettings> | null,
): Promise<string[]> {
  try {
    const normalized = normalizeSearchSettings(settings);
    const providerOrder = await permittedProviderOrder(normalized);
    if (providerOrder.length === 0) {
      console.warn("searchAndExtractUrls skipped: host permission missing for configured backend");
      return [];
    }
    for (const provider of providerOrder) {
      try {
        if (provider === "jina") {
          const text = await searchJina(query);
          if (!text) continue;
          const linkRegex = /\[.*?\]\((https?:\/\/[^\)]+)\)/g;
          const urls: string[] = [];
          let match;
          while ((match = linkRegex.exec(text)) !== null) {
            urls.push(match[1]);
          }
          const uniqueUrls = [...new Set(urls)].filter(
            (u) =>
              !u.includes("google.com") && !u.includes("youtube.com/watch"),
          );
          if (uniqueUrls.length > 0) return uniqueUrls.slice(0, maxUrls);
        }
        if (provider === "searxng") {
          const searxngResults = await searchSearxng(query, normalized);
          if (searxngResults.length > 0)
            return searxngResults.map((r) => r.url).slice(0, maxUrls);
        }
        if (provider === "duckduckgo") {
          const duckResults = await fetchDuckDuckGoResults(
            query,
            Math.min(maxUrls, normalized.maxResults),
          );
          if (duckResults.length > 0)
            return duckResults.map((r) => r.url).slice(0, maxUrls);
        }
      } catch (e) {
        console.warn(`${provider} URL search failed, trying next provider:`, e);
      }
    }
    return [];
  } catch (e) {
    console.error("Failed to search and extract URLs:", e);
    return [];
  }
}

export async function bulkFetchUrls(
  urls: string[],
  concurrency: number = 5,
): Promise<string> {
  const results: string[] = [];

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const promises = batch.map(async (url) => {
      const content = await fetchUrlContent(url);
      if (content && content.length > 100) {
        return `[Source: ${url}]\n---\n${content}\n---\n`;
      }
      return null;
    });

    const batchResults = await Promise.allSettled(promises);
    for (const res of batchResults) {
      if (res.status === "fulfilled" && res.value) {
        results.push(res.value);
      }
    }

    if (i + concurrency < urls.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results.join("\n\n");
}
