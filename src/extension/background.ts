/// <reference types="chrome" />

async function ensureContentScript(tabId: number): Promise<boolean> {
  try { const r = await chrome.tabs.sendMessage(tabId, { type: 'NERDBOT_PING' }); if (r?.ok) return true; } catch {}
  try { await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }); return true; } catch { return false; }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    ?.setPanelBehavior?.({ openPanelOnActionClick: true })
    .catch(() => undefined);
});

chrome.action?.onClicked?.addListener(async (tab) => {
  if (tab.windowId !== undefined) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch {
      /* no-op */
    }
  }
});

chrome.commands?.onCommand?.addListener(async (command) => {
  if (command === 'open_quick_chat') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await ensureContentScript(tab.id);
        await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_QUICK_CHAT' });
      } catch {
        /* content script not loaded on this page */
      }
    }
  }
});

type Msg =
  | { type: 'GET_PAGE_CONTEXT' }
  | { type: 'GET_PAGE_TEXT' }
  | { type: 'CAPTURE_SCREENSHOT' }
  | { type: 'LIST_TABS' }
  | { type: 'GET_TAB_TEXT'; payload: { tabId: number } }
  | { type: 'QUICK_CHAT_QUEUE'; payload: { text: string } }
  | { type: 'PING' };

chrome.runtime.onMessage.addListener((message: Msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === 'PING') {
        sendResponse({ ok: true });
        return;
      }
      if (message.type === 'QUICK_CHAT_QUEUE') {
        sendResponse({ ok: true });
        return;
      }
      if (message.type === 'CAPTURE_SCREENSHOT') {
        const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });
        sendResponse({ ok: true, data: dataUrl });
        return;
      }
      if (message.type === 'LIST_TABS') {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const list = tabs
          .filter((t) => t.id != null && t.url && !t.url.startsWith('chrome://'))
          .map((t) => ({ tabId: t.id!, url: t.url!, title: t.title || '' }));
        sendResponse({ ok: true, data: list });
        return;
      }
      if (message.type === 'GET_TAB_TEXT') {
        const tabId = message.payload.tabId;
        try {
          await ensureContentScript(tabId);
          const reply = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_TEXT' });
          const tab = await chrome.tabs.get(tabId);
          sendResponse({
            ok: true,
            data: { tabId, url: tab.url ?? '', title: tab.title ?? '', ...reply },
          });
        } catch {
          sendResponse({ ok: false, error: 'tab_unreachable' });
        }
        return;
      }
      if (message.type === 'GET_PAGE_CONTEXT' || message.type === 'GET_PAGE_TEXT') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          sendResponse({ ok: false, error: 'no_active_tab' });
          return;
        }
        try {
          await ensureContentScript(tab.id);
          const reply = await chrome.tabs.sendMessage(tab.id, message);
          sendResponse({ ok: true, data: { ...reply, tabId: tab.id, url: tab.url, title: tab.title } });
        } catch {
          sendResponse({
            ok: true,
            data: {
              tabId: tab.id,
              url: tab.url ?? '',
              title: tab.title ?? '',
              selection: '',
              text: '',
              note: 'content_script_unavailable',
            },
          });
        }
        return;
      }
      sendResponse({ ok: false, error: 'unknown_message' });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true;
});
