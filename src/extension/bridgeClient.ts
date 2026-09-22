import { browserCommand } from './browserController';
import { ensureContentScript } from './ensureContentScript';

let socket: WebSocket | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;
let enabled = false;
async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id == null ? null : { tabId: tab.id, url: tab.url || '', title: tab.title || '' };
}
function send(message: unknown) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }

export function initBridgeClient() {
  const connect = () => {
    if (!enabled) return;
    if (socket && socket.readyState < WebSocket.CLOSING) return;
    const ws = new WebSocket('ws://localhost:3030');
    socket = ws;
    ws.onopen = async () => {
      const data = await chrome.storage.local.get('nerdbot.settings.v1');
      send({ type: 'IDENTIFY', role: 'brave', activeTab: await activeTab(), settings: data['nerdbot.settings.v1'] || null });
    };
    ws.onmessage = async ({ data }) => {
      let request: any;
      try {
        request = JSON.parse(data);
        if (request.type === 'BROWSER_REQUEST') {
          const result = await browserCommand(request.payload);
          send({ type: 'BROWSER_REPLY', requestId: request.requestId, result: { ok: true, data: result } });
        } else if (request.type === 'GET_PAGE_CONTEXT') {
          const tab = await activeTab();
          if (!tab) throw new Error('No active tab.');
          await ensureContentScript(tab.tabId);
          let page = {};
          try { page = await chrome.tabs.sendMessage(tab.tabId, { type: 'GET_PAGE_TEXT' }); } catch { /* restricted page */ }
          send({ type: 'PAGE_CONTEXT_REPLY', requestId: request.requestId, data: { ...page, ...tab } });
        }
      } catch (e) {
        const error = e instanceof Error ? e.message : 'Browser request failed.';
        if (request?.type === 'BROWSER_REQUEST') send({ type: 'BROWSER_REPLY', requestId: request.requestId, result: { ok: false, error } });
        else if (request?.requestId) send({ type: 'PAGE_CONTEXT_REPLY', requestId: request.requestId, data: { error } });
      }
    };
    ws.onclose = () => {
      if (socket === ws) socket = null;
      void browserCommand({ op: 'release' });
      if (enabled && !retry) retry = setTimeout(() => { retry = undefined; connect(); }, 3000);
    };
    ws.onerror = () => ws.close();
  };
  const setEnabled = (value: boolean) => {
    if (enabled === value) return;
    enabled = value;
    if (enabled) connect();
    else {
      if (retry) clearTimeout(retry);
      retry = undefined;
      const current = socket;
      socket = null;
      current?.close();
      void browserCommand({ op: 'release' });
    }
  };
  void chrome.storage.local.get('nerdbot.settings.v1').then(data => {
    setEnabled(Boolean(data['nerdbot.settings.v1']?.bridgeEnabled));
  });
  chrome.tabs.onActivated.addListener(() => { void activeTab().then((tab) => send({ type: 'TAB_CHANGED', tab })); });
  chrome.tabs.onUpdated.addListener((_id, change, tab) => {
    if (tab.active && (change.url || change.title)) void activeTab().then((value) => send({ type: 'TAB_CHANGED', tab: value }));
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes['nerdbot.settings.v1']) {
      const settings = changes['nerdbot.settings.v1'].newValue;
      setEnabled(Boolean(settings?.bridgeEnabled));
      send({ type: 'SETTINGS_UPDATED', settings });
    }
  });
}
