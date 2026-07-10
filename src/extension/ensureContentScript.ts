/// <reference types="chrome" />

/**
 * Pings the tab's content script and injects content.js when unanswered.
 * Single source of truth for the on-demand injection handshake — imported by
 * both the background service worker and the sidebar bundle.
 */
export async function ensureContentScript(tabId: number): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.sendMessage) return false;
  try {
    const r = await chrome.tabs.sendMessage(tabId, { type: 'NERDBOT_PING' });
    if (r?.ok) return true;
  } catch {
    /* no content script listening — inject below */
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return true;
  } catch {
    return false; // restricted page (chrome://, Web Store, PDF viewer) or no host access
  }
}
