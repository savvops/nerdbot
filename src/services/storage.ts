const memoryStore = new Map<string, unknown>();
export const STORAGE_CHANGE_EVENT = 'nerdbot-storage-change';

function announce(key: string): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(STORAGE_CHANGE_EVENT, { detail: { key } }));
  }
}

const hasChromeStorage = (): boolean =>
  typeof chrome !== 'undefined' && !!chrome.storage?.local;

export async function get<T>(key: string, fallback: T): Promise<T> {
  if (hasChromeStorage()) {
    return new Promise<T>((resolve) => {
      chrome.storage.local.get([key], (res) => {
        resolve((res[key] as T) ?? fallback);
      });
    });
  }
  if (memoryStore.has(key)) return memoryStore.get(key) as T;
  try {
    const raw = localStorage.getItem(key);
    if (raw != null) return JSON.parse(raw) as T;
  } catch {
    /* no-op */
  }
  return fallback;
}

export async function set<T>(key: string, value: T): Promise<void> {
  if (hasChromeStorage()) {
    await new Promise<void>((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    });
    announce(key);
    return;
  }
  memoryStore.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* no-op */
  }
  announce(key);
}

export async function remove(key: string): Promise<void> {
  if (hasChromeStorage()) {
    await new Promise<void>((resolve) => {
      chrome.storage.local.remove([key], () => resolve());
    });
    announce(key);
    return;
  }
  memoryStore.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    /* no-op */
  }
  announce(key);
}

export function onStorageChange(key: string, listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const localListener = (event: Event) => {
    if ((event as CustomEvent<{ key?: string }>).detail?.key === key) listener();
  };
  window.addEventListener(STORAGE_CHANGE_EVENT, localListener);
  const chromeListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[key]) listener();
  };
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(chromeListener);
  }
  return () => {
    window.removeEventListener(STORAGE_CHANGE_EVENT, localListener);
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.removeListener(chromeListener);
    }
  };
}

export const uid = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
