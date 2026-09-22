/// <reference types="chrome" />

let bridgeSocket: WebSocket | null = null;
let reconnectTimer: any = null;

export function initBridgeClient() {
  connectToBridge();

  // Listen for tab switch
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    if (!bridgeSocket || bridgeSocket.readyState !== WebSocket.OPEN) return;
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab.url && !tab.url.startsWith('chrome://')) {
        bridgeSocket.send(
          JSON.stringify({
            type: 'TAB_CHANGED',
            tab: { tabId: tab.id, url: tab.url, title: tab.title || '' },
          })
        );
      }
    } catch {
      /* ignore */
    }
  });

  // Listen for tab url or title update
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (!bridgeSocket || bridgeSocket.readyState !== WebSocket.OPEN) return;
    if (tab.active && (changeInfo.url || changeInfo.title)) {
      if (tab.url && !tab.url.startsWith('chrome://')) {
        bridgeSocket.send(
          JSON.stringify({
            type: 'TAB_CHANGED',
            tab: { tabId: tab.id, url: tab.url, title: tab.title || '' },
          })
        );
      }
    }
  });

  // Listen for settings change to keep mobile synced with PC keys
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes['nerdbot.settings.v1']) {
      if (bridgeSocket && bridgeSocket.readyState === WebSocket.OPEN) {
        bridgeSocket.send(
          JSON.stringify({
            type: 'SETTINGS_UPDATED',
            settings: changes['nerdbot.settings.v1'].newValue,
          })
        );
      }
    }
  });
}

function connectToBridge() {
  if (bridgeSocket && (bridgeSocket.readyState === WebSocket.OPEN || bridgeSocket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    bridgeSocket = new WebSocket('ws://localhost:3030');

    bridgeSocket.onopen = async () => {
      console.log('[Nerdbot] Connected to PC Bridge on ws://localhost:3030');

      let activeTab: any = null;
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url && !tab.url.startsWith('chrome://')) {
          activeTab = { tabId: tab.id, url: tab.url, title: tab.title || '' };
        }
      } catch {
        /* ignore */
      }

      chrome.storage.local.get(['nerdbot.settings.v1'], (res) => {
        const settings = res['nerdbot.settings.v1'] || null;
        bridgeSocket?.send(
          JSON.stringify({
            type: 'IDENTIFY',
            role: 'brave',
            activeTab,
            settings,
          })
        );
      });
    };

    bridgeSocket.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'GET_PAGE_CONTEXT') {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) {
            bridgeSocket?.send(
              JSON.stringify({
                type: 'PAGE_CONTEXT_REPLY',
                requestId: msg.requestId,
                data: { error: 'no_active_tab' },
              })
            );
            return;
          }

          try {
            const reply = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' });
            bridgeSocket?.send(
              JSON.stringify({
                type: 'PAGE_CONTEXT_REPLY',
                requestId: msg.requestId,
                data: {
                  tabId: tab.id,
                  url: tab.url ?? '',
                  title: tab.title ?? '',
                  text: reply?.text || '',
                  selection: reply?.selection || '',
                },
              })
            );
          } catch {
            bridgeSocket?.send(
              JSON.stringify({
                type: 'PAGE_CONTEXT_REPLY',
                requestId: msg.requestId,
                data: {
                  tabId: tab.id,
                  url: tab.url ?? '',
                  title: tab.title ?? '',
                  text: '',
                  note: 'content_script_unavailable',
                },
              })
            );
          }
        } else if (msg.type === 'OPEN_TAB' && msg.url) {
          chrome.tabs.create({ url: msg.url });
        }
      } catch (err) {
        console.error('[Nerdbot Bridge] Error processing message:', err);
      }
    };

    bridgeSocket.onclose = () => {
      bridgeSocket = null;
      scheduleReconnect();
    };

    bridgeSocket.onerror = () => {
      bridgeSocket = null;
      scheduleReconnect();
    };
  } catch {
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToBridge();
  }, 3000);
}
