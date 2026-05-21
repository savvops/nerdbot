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

/**
 * Search the web via Jina AI's search endpoint.
 * Used to give non-Gemini providers access to live web results by injecting them into context.
 */
export async function searchWeb(query: string): Promise<string | null> {
  try {
    const url = `https://s.jina.ai/${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'Accept': 'text/plain', 'X-No-Cache': 'true' },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text || null;
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
