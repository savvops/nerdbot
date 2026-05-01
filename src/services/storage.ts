const memoryStore = new Map<string, unknown>();

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
    return new Promise<void>((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    });
  }
  memoryStore.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* no-op */
  }
}

export async function remove(key: string): Promise<void> {
  if (hasChromeStorage()) {
    return new Promise<void>((resolve) => {
      chrome.storage.local.remove([key], () => resolve());
    });
  }
  memoryStore.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    /* no-op */
  }
}

export const uid = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
