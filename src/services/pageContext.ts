import type { PageContext, SharedTab } from './types';

const hasChrome = (): boolean =>
  typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage;

async function send<T>(type: string, payload?: unknown): Promise<T | null> {
  if (!hasChrome()) return null;
  return new Promise<T | null>((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, payload }, (res) => {
        if (chrome.runtime.lastError || !res?.ok) {
          resolve(null);
          return;
        }
        resolve(res.data as T);
      });
    } catch {
      resolve(null);
    }
  });
}

export async function getPageContext(): Promise<PageContext | null> {
  return send<PageContext>('GET_PAGE_CONTEXT');
}

export async function getPageText(): Promise<PageContext | null> {
  return send<PageContext>('GET_PAGE_TEXT');
}

export async function listTabs(): Promise<SharedTab[]> {
  // Try direct chrome.tabs API first (works in side panels)
  if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      return tabs
        .filter((t) => t.id != null && t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'))
        .map((t) => ({ tabId: t.id!, url: t.url!, title: t.title || '' }));
    } catch {
      /* fall through to message approach */
    }
  }
  const r = await send<SharedTab[]>('LIST_TABS');
  return r ?? [];
}

export async function getTabText(tabId: number): Promise<SharedTab | null> {
  // 1. Try messaging the content script (fastest if it's loaded)
  if (typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
    try {
      const reply = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_TEXT' });
      if (reply?.text) {
        const tab = await chrome.tabs.get(tabId);
        return {
          tabId,
          url: tab.url ?? '',
          title: tab.title ?? '',
          text: reply.text,
          transcript: reply?.transcript,
        };
      }
    } catch {
      /* content script not loaded — fall through */
    }
  }

  // 2. Fall back to injecting a script directly (works even without content script)
  if (typeof chrome !== 'undefined' && chrome.scripting?.executeScript) {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const clone = document.body?.cloneNode(true) as HTMLElement | null;
          if (!clone) return '';
          clone.querySelectorAll('script,style,noscript,svg,iframe').forEach((n) => n.remove());
          const text = (clone.innerText || '')
            .replace(/\s+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          return text.length > 60000 ? text.slice(0, 60000) + '\n…[truncated]' : text;
        },
      });
      const tab = await chrome.tabs.get(tabId);
      return {
        tabId,
        url: tab.url ?? '',
        title: tab.title ?? '',
        text: (result?.result as string) || '',
      };
    } catch {
      /* can't inject (e.g. chrome:// pages) */
    }
  }

  // 3. Last resort: background message
  return send<SharedTab>('GET_TAB_TEXT', { tabId });
}

export function shortHost(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function isYouTube(url?: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return /(^|\.)youtube\.com$/i.test(u.hostname) && u.pathname.startsWith('/watch');
  } catch {
    return false;
  }
}
