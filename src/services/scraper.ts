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

export function extractUrl(text: string): string | null {
  // Broad URL regex but excludes common punctuation at the end and internal schemas
  const urlRegex = /(https?:\/\/[^\s$.?#].[^\s]*)/gi;
  const matches = text.match(urlRegex);
  if (!matches) return null;
  
  // Filter out internal or obviously invalid URLs
  const valid = matches.find(url => {
    try {
      const u = new URL(url);
      return !u.hostname.includes('localhost') && !u.protocol.includes('chrome');
    } catch {
      return false;
    }
  });
  
  return valid || null;
}
