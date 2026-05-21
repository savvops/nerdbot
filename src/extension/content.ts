/// <reference types="chrome" />

const MAX_PAGE_TEXT = 60_000;

function getSelection(): string {
  try {
    return window.getSelection()?.toString().trim() ?? '';
  } catch {
    return '';
  }
}

function getPageText(): string {
  const clone = document.body?.cloneNode(true) as HTMLElement | null;
  if (!clone) return '';
  clone.querySelectorAll('script,style,noscript,svg,iframe').forEach((n) => n.remove());
  const text = (clone.innerText || '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > MAX_PAGE_TEXT ? text.slice(0, MAX_PAGE_TEXT) + '\n…[truncated]' : text;
}

async function getYouTubeTranscript(): Promise<string | undefined> {
  if (!/youtube\.com\/(watch|shorts)/.test(location.href)) return undefined;
  // Try to scrape rendered transcript panel if open
  const segs = document.querySelectorAll(
    'ytd-transcript-segment-renderer .segment-text, ytd-transcript-segment-list-renderer .segment-text'
  );
  if (segs.length > 0) {
    const out: string[] = [];
    segs.forEach((n) => {
      const t = (n as HTMLElement).innerText.trim();
      if (t) out.push(t);
    });
    if (out.length > 0) return out.join(' ');
  }
  // Fallback: try ytInitialPlayerResponse caption tracks
  try {
    const html = document.documentElement.outerHTML;
    const m = html.match(/"captionTracks":(\[.*?\])/);
    if (!m) return undefined;
    const tracks = JSON.parse(m[1]);
    const url = tracks?.[0]?.baseUrl;
    if (!url) return undefined;
    const xml = await fetch(url).then((r) => r.text());
    const lines = Array.from(xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)).map((m2) =>
      m2[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/<[^>]+>/g, '')
    );
    const joined = lines.join(' ').trim();
    return joined.length > MAX_PAGE_TEXT ? joined.slice(0, MAX_PAGE_TEXT) + '\n…[truncated]' : joined;
  } catch {
    return undefined;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GET_PAGE_CONTEXT') {
    sendResponse({
      url: location.href,
      title: document.title,
      selection: getSelection(),
    });
    return true;
  }
  if (message?.type === 'GET_PAGE_TEXT') {
    (async () => {
      const transcript = await getYouTubeTranscript();
      sendResponse({
        url: location.href,
        title: document.title,
        selection: getSelection(),
        text: getPageText(),
        transcript,
      });
    })();
    return true;
  }
  if (message?.type === 'TOGGLE_QUICK_CHAT') {
    toggleQuickChat();
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

/* ---------- Quick Chat overlay (Ctrl+Shift+L) ---------- */

const QC_ID = 'nerdbot-quick-chat-host';

function toggleQuickChat() {
  const existing = document.getElementById(QC_ID);
  if (existing) {
    existing.remove();
    return;
  }
  mountQuickChat();
}

function mountQuickChat() {
  const host = document.createElement('div');
  host.id = QC_ID;
  host.style.cssText =
    'position:fixed;bottom:24px;right:24px;z-index:2147483647;width:380px;font-family:Inter,system-ui,sans-serif;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      .qc {
        background: rgb(24 27 34); color: rgb(232 234 240);
        border: 1px solid rgb(48 53 65); border-radius: 16px;
        box-shadow: 0 24px 60px rgba(0,0,0,.45);
        overflow: hidden;
      }
      .qc-head { display:flex; align-items:center; gap:8px; padding:10px 14px; border-bottom:1px solid rgb(48 53 65); font-size:13px; }
      .qc-orb { width:18px; height:18px; border-radius:50%; background: conic-gradient(from 220deg, #8aa4ff, #c089ff, #ff8ad1, #ffd089, #8aa4ff); }
      .qc-title { font-weight:600; flex:1; }
      .qc-x { background:transparent; border:0; color:rgb(156 163 178); cursor:pointer; padding:4px; border-radius:6px; }
      .qc-x:hover { background:rgb(32 36 45); color:rgb(232 234 240); }
      textarea {
        width:100%; min-height:64px; max-height:220px; resize:none; padding:12px 14px;
        border:0; outline:none; background:transparent; color:rgb(232 234 240);
        font:inherit; font-size:13.5px; line-height:1.5; box-sizing:border-box;
      }
      textarea::placeholder { color: rgb(110 117 132); }
      .qc-foot { display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-top:1px solid rgb(48 53 65); font-size:11px; color:rgb(156 163 178); }
      .qc-send { padding:5px 12px; border-radius:999px; background:rgb(138 164 255); color:rgb(17 19 24); font-weight:600; border:0; cursor:pointer; font-size:12px; }
      .qc-send:disabled { background: rgb(48 53 65); color: rgb(110 117 132); cursor:not-allowed; }
    </style>
    <div class="qc">
      <div class="qc-head">
        <div class="qc-orb"></div>
        <div class="qc-title">Quick chat</div>
        <button class="qc-x" id="x">✕</button>
      </div>
      <textarea id="ta" placeholder="Ask Nerdbot about this page…"></textarea>
      <div class="qc-foot">
        <span>Opens in side panel · Esc to close</span>
        <button class="qc-send" id="send" disabled>Send →</button>
      </div>
    </div>
  `;
  document.documentElement.appendChild(host);
  const ta = shadow.getElementById('ta') as HTMLTextAreaElement;
  const send = shadow.getElementById('send') as HTMLButtonElement;
  const close = () => host.remove();
  shadow.getElementById('x')?.addEventListener('click', close);
  ta.focus();

  const selection = window.getSelection()?.toString().trim();
  if (selection) ta.value = selection;
  if (selection) send.disabled = false;

  ta.addEventListener('input', () => {
    send.disabled = ta.value.trim().length === 0;
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });
  send.addEventListener('click', submit);

  function submit() {
    const text = ta.value.trim();
    if (!text) return;
    chrome.runtime.sendMessage({ type: 'QUICK_CHAT_QUEUE', payload: { text } }, () => {});
    chrome.storage.local.set({ 'nerdbot.quickQueue.v1': { text, createdAt: Date.now() } });
    close();
  }
}
