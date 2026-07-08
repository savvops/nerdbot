// Thin wrapper over chrome.permissions for the "<all_urls>" host permission.
// Guards every call so it stays safe in non-extension contexts (e.g. tests, SSR).

const ALL_URLS = { origins: ['<all_urls>'] };

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
