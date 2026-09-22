// Thin wrapper over chrome.permissions for the "<all_urls>" host permission.
// Guards every call so it stays safe in non-extension contexts (e.g. tests, SSR).

const ALL_URLS = { origins: ["<all_urls>"] };
const LOCAL_AI_ORIGINS = {
  origins: [
    "http://localhost:11434/*",
    "http://127.0.0.1:11434/*",
    "http://localhost:1234/*",
    "http://127.0.0.1:1234/*",
  ],
};

const hasChromePermissions = (): boolean =>
  typeof chrome !== 'undefined' && !!chrome.permissions;

/** Resolves true when the extension already holds the "<all_urls>" host permission. */
export async function hasAllUrls(): Promise<boolean> {
  if (!hasChromePermissions()) return false;
  return new Promise<boolean>((resolve) => {
    try {
      chrome.permissions.contains(ALL_URLS, (res) => {
        if (chrome.runtime?.lastError) return resolve(false);
        resolve(!!res);
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * Prompts the user to grant the "<all_urls>" host permission.
 * MUST be called from within a user gesture (e.g. a click handler) or Chrome
 * will reject the request. Resolves true when the permission is granted.
 */
export async function requestAllUrls(): Promise<boolean> {
  if (!hasChromePermissions()) return false;
  return new Promise<boolean>((resolve) => {
    try {
      chrome.permissions.request(ALL_URLS, (granted) => {
        if (chrome.runtime?.lastError) return resolve(false);
        resolve(!!granted);
      });
    } catch {
      resolve(false);
    }
  });
}

/** Ask only for the default Ollama and LM Studio localhost origins. */
export async function hasLocalAiAccess(): Promise<boolean> {
  if (!hasChromePermissions()) return false;
  return new Promise<boolean>((resolve) => {
    try {
      chrome.permissions.contains(LOCAL_AI_ORIGINS, (result) => {
        if (chrome.runtime?.lastError) return resolve(false);
        resolve(!!result);
      });
    } catch {
      resolve(false);
    }
  });
}

/** Must be called directly from a click or other user gesture. */
export async function requestLocalAiAccess(): Promise<boolean> {
  if (!hasChromePermissions()) return false;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const timeout = setTimeout(() => finish(false), 15_000);
    try {
      chrome.permissions.request(LOCAL_AI_ORIGINS, (granted) => {
        if (chrome.runtime?.lastError) return finish(false);
        finish(!!granted);
      });
    } catch {
      finish(false);
    }
  });
}

export async function ensureLocalAiAccess(): Promise<boolean> {
  // Mobile uses the same-origin PC proxy; this does not probe the phone's localhost.
  if (!hasChromePermissions()) return true;
  if (await hasLocalAiAccess()) return true;
  return requestLocalAiAccess();
}

/** Request one API/site origin, directly from a user gesture. */
export async function requestOriginAccess(url: string): Promise<boolean> {
  if (!hasChromePermissions()) return true;
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) return false;
  return chrome.permissions.request({ origins: [`${parsed.protocol}//${parsed.hostname}/*`] });
}

/**
 * Ensures the "<all_urls>" grant, prompting if needed. Call from within a
 * user gesture and BEFORE any slow awaited work, or Chrome's transient
 * activation expires and the prompt silently fails.
 */
export async function ensureAllUrls(): Promise<boolean> {
  if (await hasAllUrls()) return true;
  return requestAllUrls();
}

/**
 * Subscribes to permission grant/revoke events. Fires `cb` whenever any
 * permission is added or removed. Returns an unsubscribe function that removes
 * both listeners.
 */
export function onPermissionsChanged(cb: () => void): () => void {
  if (!hasChromePermissions()) return () => {};
  const handler = () => cb();
  // This @types/chrome version types onAdded/onRemoved without removeListener;
  // the runtime objects have it, so cast to the complete Event type.
  const onAdded = chrome.permissions.onAdded as unknown as chrome.events.Event<() => void>;
  const onRemoved = chrome.permissions.onRemoved as unknown as chrome.events.Event<() => void>;
  onAdded.addListener(handler);
  onRemoved.addListener(handler);
  return () => {
    onAdded.removeListener(handler);
    onRemoved.removeListener(handler);
  };
}
