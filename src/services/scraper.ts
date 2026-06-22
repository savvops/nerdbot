/**
 * Universal web scraper service.
 * Uses Jina Reader (r.jina.ai) to fetch content from any URL.
 */

export async function fetchUrlContent(url: string): Promise<string | null> {
  try {
    // Jina Reader's YouTube transcript extractor only triggers reliably on standard watch URLs.
    let targetUrl = url;
    if (targetUrl.includes('youtube.com/shorts/')) {
      const id = targetUrl.split('/shorts/')[1]?.split(/[?#]/)[0];
      if (id) targetUrl = `https://www.youtube.com/watch?v=${id}`;
    } else if (targetUrl.includes('youtu.be/')) {
      const id = targetUrl.split('youtu.be/')[1]?.split(/[?#]/)[0];
      if (id) targetUrl = `https://www.youtube.com/watch?v=${id}`;
    }

    const jinaUrl = `https://r.jina.ai/${targetUrl}`;
    const res = await fetch(jinaUrl, {
      headers: {
        'Accept': 'application/json',
        'X-No-Cache': 'true'
      }
    });
    
    if (!res.ok) return null;
    
    const data = await res.json();
    // Jina Reader returns the clean markdown in the 'content' field.
    return data.data?.content || null;
  } catch (e) {
    console.error('Failed to fetch URL content:', e);
    return null;
  }
}

interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
}

async function searchJina(query: string): Promise<string | null> {
  const url = `https://s.jina.ai/${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { 'Accept': 'text/plain', 'X-No-Cache': 'true' },
  });
  if (!res.ok) return null;
  const text = await res.text();
  return text.trim() || null;
}

async function fetchDuckDuckGoResults(query: string): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { 'Accept': 'text/html' },
  });
  if (!res.ok) return [];
  return parseDuckDuckGoResults(await res.text());
}

export function parseDuckDuckGoResults(html: string): SearchResult[] {
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return Array.from(doc.querySelectorAll('.result'))
      .map((row): SearchResult | null => {
        const link = row.querySelector<HTMLAnchorElement>('a.result__a, a[href]');
        const rawUrl = link?.getAttribute('href') || '';
        const title = cleanText(link?.textContent || '');
        const snippet = cleanText(row.querySelector('.result__snippet')?.textContent || '');
        const url = normalizeDuckDuckGoUrl(rawUrl);
        return title && url ? { title, url, ...(snippet ? { snippet } : {}) } : null;
      })
      .filter((r): r is SearchResult => !!r)
      .filter((r, idx, all) => all.findIndex((x) => x.url === r.url) === idx)
      .slice(0, 8);
  }

  const results: SearchResult[] = [];
  const linkRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null && results.length < 8) {
    const nextLinkIdx = html.indexOf('result__a', linkRegex.lastIndex);
    const block = html.slice(linkRegex.lastIndex, nextLinkIdx > -1 ? nextLinkIdx : linkRegex.lastIndex + 2500);
    const snippetMatch = block.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    const title = cleanText(stripTags(match[2]));
    const url = normalizeDuckDuckGoUrl(decodeHtml(match[1]));
    const snippet = cleanText(stripTags(snippetMatch?.[1] || ''));
    if (title && url && !results.some((r) => r.url === url)) {
      results.push({ title, url, snippet });
    }
  }
  return results;
}

function formatSearchResults(query: string, results: SearchResult[]): string {
  if (results.length === 0) return '';
  const lines = results.map((r, idx) => {
    const snippet = r.snippet ? `\nSnippet: ${r.snippet}` : '';
    return `[${idx + 1}] ${r.title}\nURL: ${r.url}${snippet}`;
  });
  return `DuckDuckGo search results for: "${query}"\n\n${lines.join('\n\n')}`;
}

function normalizeDuckDuckGoUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    const absolute = new URL(rawUrl, 'https://duckduckgo.com').toString();
    const parsed = new URL(absolute);
    const uddg = parsed.searchParams.get('uddg');
    return uddg || absolute;
  } catch {
    return '';
  }
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, ' ');
}

function cleanText(value: string): string {
  return decodeHtml(value).replace(/\s+/g, ' ').trim();
}

function decodeHtml(value: string): string {
  const decoded = value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");

  return decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/**
 * Search the web via Jina AI's search endpoint.
 * Used to give non-Gemini providers access to live web results by injecting them into context.
 */
export async function searchWeb(query: string): Promise<string | null> {
  try {
    let jina: string | null = null;
    try {
      jina = await searchJina(query);
    } catch (e) {
      console.warn('Jina search failed, falling back to DuckDuckGo:', e);
    }
    if (jina) return jina;

    const duckResults = await fetchDuckDuckGoResults(query);
    const fallback = formatSearchResults(query, duckResults);
    return fallback || null;
  } catch (e) {
    console.error('Web search failed:', e);
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
    .replace(/^(search\s+(the\s+)?web\s+(for\s+)?|look\s+up\s+|find\s+(me\s+)?|google\s+|search\s+for\s+)/i, '')
    .replace(/^(what\s+is\s+the\s+|what's\s+the\s+|whats\s+the\s+)/i, '')
    .replace(/^(what\s+is\s+|what's\s+|whats\s+)/i, '')
    .replace(/^(when\s+is\s+|where\s+is\s+|who\s+is\s+|how\s+(do\s+I\s+|to\s+))/i, '')
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
    .map(url => url.replace(/[.,;:!?)\]'"\s]+$/, ''))
    .find(url => {
      try {
        const u = new URL(url);
        return !u.hostname.includes('localhost') && !u.protocol.includes('chrome');
      } catch {
        return false;
      }
    });
  
  return valid || null;
}

export async function searchAndExtractUrls(query: string, maxUrls: number = 30): Promise<string[]> {
  try {
    let text: string | null = null;
    try {
      text = await searchJina(query);
    } catch (e) {
      console.warn('Jina URL search failed, falling back to DuckDuckGo:', e);
    }
    if (!text) {
      const duckResults = await fetchDuckDuckGoResults(query);
      return duckResults.map((r) => r.url).slice(0, maxUrls);
    }
    
    const linkRegex = /\[.*?\]\((https?:\/\/[^\)]+)\)/g;
    const urls: string[] = [];
    let match;
    while ((match = linkRegex.exec(text)) !== null) {
      urls.push(match[1]);
    }
    
    const uniqueUrls = [...new Set(urls)].filter(u => !u.includes('google.com') && !u.includes('youtube.com/watch'));
    return uniqueUrls.slice(0, maxUrls);
  } catch (e) {
    console.error('Failed to search and extract URLs:', e);
    return [];
  }
}

export async function bulkFetchUrls(urls: string[], concurrency: number = 5): Promise<string> {
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
      if (res.status === 'fulfilled' && res.value) {
        results.push(res.value);
      }
    }
    
    if (i + concurrency < urls.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  return results.join('\n\n');
}
