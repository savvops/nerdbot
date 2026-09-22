/// <reference types="chrome" />

import { ensureContentScript } from './ensureContentScript';
import { initBridgeClient } from './bridgeClient';

initBridgeClient();

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

const PROTECTED_URL_REGEX =
  /^(chrome|chrome-extension|edge|about|devtools|view-source):|^https:\/\/chromewebstore\.google\.com\//i;

type Msg =
  | { type: 'GET_PAGE_CONTEXT' }
  | { type: 'GET_PAGE_TEXT' }
  | { type: 'CAPTURE_SCREENSHOT' }
  | { type: 'LIST_TABS' }
  | { type: 'GET_TAB_TEXT'; payload: { tabId: number } }
  | { type: 'QUICK_CHAT_QUEUE'; payload: { text: string } }
  | { type: 'GET_SESSION_COOKIES' }
  | { type: 'PING' }
  | {
      type: 'EXECUTE_BROWSER_ACTION';
      payload: {
        action: 'scan_page' | 'click' | 'type' | 'select' | 'scroll' | 'navigate' | 'clear_overlays';
        args?: any;
      };
    };

chrome.runtime.onMessage.addListener((message: Msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === 'PING') {
        sendResponse({ ok: true });
        return;
      }
      if (message.type === 'GET_SESSION_COOKIES') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url) {
          sendResponse({ ok: false, error: 'no_active_tab' });
          return;
        }
        try {
          const cookies = await chrome.cookies.getAll({ url: tab.url });
          sendResponse({
            ok: true,
            data: {
              url: tab.url,
              title: tab.title || '',
              cookies: cookies.map((c) => ({
                name: c.name,
                value: c.value,
                domain: c.domain,
                path: c.path,
                secure: c.secure,
                httpOnly: c.httpOnly,
              })),
            },
          });
        } catch (err: any) {
          sendResponse({ ok: false, error: err.message || 'failed_to_get_cookies' });
        }
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
      if (message.type === 'EXECUTE_BROWSER_ACTION') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || !tab.url) {
          sendResponse({ ok: false, error: 'No active browser tab found.' });
          return;
        }
        if (PROTECTED_URL_REGEX.test(tab.url)) {
          sendResponse({
            ok: false,
            error: `Cannot automate protected browser page (${tab.url}). Please open a normal webpage.`,
          });
          return;
        }

        const { action, args = {} } = message.payload;

        if (action === 'navigate') {
          if (!args.url) {
            sendResponse({ ok: false, error: 'URL is required for navigate.' });
            return;
          }
          if (PROTECTED_URL_REGEX.test(args.url)) {
            sendResponse({ ok: false, error: 'Cannot navigate to protected browser URLs.' });
            return;
          }
          await chrome.tabs.update(tab.id, { url: args.url });
          sendResponse({ ok: true, message: `Navigated to ${args.url}` });
          return;
        }

        await ensureContentScript(tab.id);

        let contentMsg: any;
        if (action === 'scan_page') {
          contentMsg = { type: 'SCAN_PAGE_ELEMENTS', showOverlays: args.showOverlays !== false };
        } else if (action === 'click') {
          contentMsg = { type: 'BROWSER_CLICK', identifier: args.targetId || args.identifier };
        } else if (action === 'type') {
          contentMsg = {
            type: 'BROWSER_TYPE',
            identifier: args.targetId || args.identifier,
            text: args.text,
            clearFirst: args.clearFirst,
            pressEnter: args.pressEnter,
          };
        } else if (action === 'select') {
          contentMsg = {
            type: 'BROWSER_SELECT',
            identifier: args.targetId || args.identifier,
            value: args.value,
          };
        } else if (action === 'scroll') {
          contentMsg = { type: 'BROWSER_SCROLL', direction: args.direction || 'down', amount: args.amount };
        } else if (action === 'clear_overlays') {
          contentMsg = { type: 'CLEAR_OVERLAYS' };
        }

        if (!contentMsg) {
          sendResponse({ ok: false, error: `Unknown browser action: ${action}` });
          return;
        }

        const reply = await chrome.tabs.sendMessage(tab.id, contentMsg);
        sendResponse(reply);
        return;
      }
      sendResponse({ ok: false, error: 'unknown_message' });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })().catch(() => {
    /* sendResponse can throw if the message channel closes first */
  });
  return true;
});
