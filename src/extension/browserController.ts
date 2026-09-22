export interface ControlState { session: string; tabId: number; title: string; url: string }
let bound: ControlState | null = null;
let epoch = 0;
let pending: { id: string; session: string; action: Record<string, unknown>; snapshot: string } | null = null;

function webUrl(value: unknown): string {
  const url = new URL(String(value));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP or HTTPS website URL.');
  return url.href;
}

async function current(session: unknown) {
  if (!bound || session !== bound.session) throw new Error('Control session expired. Select the tab again.');
  const before = epoch;
  const tab = await chrome.tabs.get(bound.tabId);
  if (before !== epoch || session !== bound?.session) throw new Error('Control session changed.');
  if (!tab.active) throw new Error('The controlled tab is no longer active. Return to it before continuing.');
  return tab;
}

/** Runs in the isolated extension world. No arbitrary model JavaScript is accepted. */
function pageOperation(operation: string, args: Record<string, unknown>) {
  const state = window as unknown as {
    __nerdbotControl?: { id: string; url: string; elements: Element[] };
  };
  if (operation === 'observe') {
    const elements = Array.from(document.querySelectorAll('a[href],button,input,textarea,select,[role="button"],[contenteditable="true"]'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      }).slice(0, 150);
    const id = crypto.randomUUID();
    state.__nerdbotControl = { id, url: location.href, elements };
    return {
      snapshot: id, url: location.href, title: document.title, readyState: document.readyState,
      text: (document.body?.innerText || '').slice(0, 16000),
      images: Array.from(document.images).filter(img => {
        const r = img.getBoundingClientRect();
        return r.width > 30 && r.height > 30 && getComputedStyle(img).visibility !== 'hidden';
      }).slice(0, 60).map(img => ({
        alt: img.alt, title: img.title, src: img.currentSrc || img.src,
        href: img.closest('a')?.href,
        context: (img.closest('article,figure,tr,[role="listitem"]')?.textContent || img.parentElement?.textContent || '').trim().slice(0, 600),
      })),
      elements: elements.map((el, i) => ({
        ref: String(i), tag: el.tagName.toLowerCase(),
        label: (el.getAttribute('aria-label') || (el as HTMLInputElement).placeholder || el.getAttribute('title') || el.querySelector('img')?.alt || el.textContent || '').trim().slice(0, 180),
        type: el.getAttribute('type'), href: el.getAttribute('href'),
      })),
    };
  }
  if (operation === 'scroll') {
    window.scrollBy(0, args.direction === 'up' ? -window.innerHeight * 0.8 : window.innerHeight * 0.8);
    state.__nerdbotControl = undefined;
    return { ok: true, message: 'Scrolled. Observe again before selecting an element.' };
  }
  const snap = state.__nerdbotControl;
  if (!snap || snap.id !== args.snapshot || snap.url !== location.href) throw new Error('Page changed. Observe again.');
  if (typeof args.ref !== 'string' || !/^\d+$/.test(args.ref)) throw new Error('Invalid element reference.');
  const el = snap.elements[Number(args.ref)];
  if (!el?.isConnected) throw new Error('Element changed. Observe again.');
  if (el instanceof HTMLInputElement && ['password', 'file', 'hidden'].includes(el.type)) throw new Error('Complete password and file fields yourself.');
  if (operation === 'describe') return { label: (el.getAttribute('aria-label') || (el as HTMLInputElement).placeholder || el.textContent || el.tagName).trim().slice(0, 180), url: location.href };
  if (operation === 'click') {
    if (!(el instanceof HTMLElement)) throw new Error('Element is not clickable.');
    if (el instanceof HTMLAnchorElement) {
      if (!['http:', 'https:'].includes(new URL(el.href).protocol)) throw new Error('This link is not a website.');
      // Keep ordinary links in the bound tab; do not follow popup tabs automatically.
      el.target = '_self';
    }
    el.click();
  } else if (operation === 'fill') {
    if (typeof args.text !== 'string' || args.text.length > 12000) throw new Error('Invalid field text.');
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) throw new Error('Only text inputs and text areas are supported.');
    if (el.disabled || el.readOnly) throw new Error('This field is not editable.');
    const prototype = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(el, args.text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else throw new Error('Unsupported browser action.');
  state.__nerdbotControl = undefined;
  return { ok: true, message: 'Action dispatched. Observe the page to verify the result.' };
}

export async function browserCommand(command: Record<string, unknown>): Promise<unknown> {
  const op = command.op;
  if (op === 'status') return bound;
  if (op === 'release') { epoch++; bound = null; pending = null; return null; }
  if (op === 'bind' || op === 'newTab') {
    epoch++; pending = null; bound = null;
    const bindingEpoch = epoch;
    const tab = op === 'newTab'
      ? await chrome.tabs.create({ url: webUrl(command.url), active: true })
      : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    if (tab?.id == null) throw new Error('No active tab.');
    if (epoch !== bindingEpoch) throw new Error('Control stopped.');
    bound = { session: crypto.randomUUID(), tabId: tab.id, title: tab.title || 'New work tab', url: tab.url || '' };
    return bound;
  }
  const tab = await current(command.session);
  const startEpoch = epoch;
  if (op === 'screenshot') {
    const data = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    await current(command.session);
    if (epoch !== startEpoch) throw new Error('Control stopped.');
    return data;
  }
  if (op === 'prepare') {
    if (!['click', 'fill'].includes(String(command.action))) throw new Error('Unsupported action.');
    // Verify snapshot/ref without running the action; confirmation remains in the UI.
    const action = { ...command };
    const [description] = await chrome.scripting.executeScript({ target: { tabId: tab.id! }, func: pageOperation, args: ['describe', action] });
    if (epoch !== startEpoch) throw new Error('Control stopped.');
    pending = { id: crypto.randomUUID(), session: bound!.session, action, snapshot: String(command.snapshot) };
    return { approval: pending.id, tab: { ...bound, url: tab.url, title: tab.title }, label: description?.result?.label, action: command.action, ref: command.ref, text: command.text };
  }
  let action = command;
  if (op === 'commit') {
    if (!pending || pending.id !== command.approval || pending.session !== command.session) throw new Error('Approval expired.');
    action = pending.action;
    pending = null;
  }
  if (epoch !== startEpoch || !bound) throw new Error('Control stopped.');
  if (op === 'navigate') {
    const url = webUrl(command.url);
    if (tab.url !== url) await chrome.tabs.update(tab.id!, { url });
    if (epoch !== startEpoch || !bound) throw new Error('Control stopped.');
    bound = { ...bound, url };
    return { ok: true, message: 'Navigation started. Observe again when the page has loaded.' };
  }
  if (!['observe', 'scroll', 'commit'].includes(String(op))) throw new Error('Unsupported browser command.');
  const operation = op === 'commit' ? String(action.action) : String(op);
  // Navigation acknowledgements do not mean the document/app has rendered.
  // Retry empty or loading observations, bounded below the bridge timeout.
  const deadline = Date.now() + 6000;
  let observation: any;
  do {
    const liveTab = await current(command.session);
    if (epoch !== startEpoch) throw new Error('Control stopped.');
    if (op !== 'observe' || liveTab.status !== 'loading') {
      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id! }, func: pageOperation, args: [operation, action],
        });
        if (epoch !== startEpoch) throw new Error('Control stopped.');
        observation = result?.result;
        if (op !== 'observe') return observation;
        if (observation?.text?.trim() && observation.readyState !== 'loading') return { ...observation, status: 'ready' };
      } catch (error) {
        if (op !== 'observe' || Date.now() >= deadline) throw error;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  } while (Date.now() < deadline);
  await current(command.session);
  return { ...observation, status: 'unavailable', message: 'No readable page content became available within 6 seconds. It may still be loading or access may be blocked. Do not treat this as an empty portfolio. Explain the limitation instead of repeatedly navigating.' };

}

chrome.tabs.onRemoved.addListener((id) => { if (bound?.tabId === id) { epoch++; bound = null; pending = null; } });
