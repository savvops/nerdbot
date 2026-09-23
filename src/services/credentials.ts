import { get, set } from './storage';

export interface CredentialItem {
  key: string;
  value: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export const CREDENTIALS_STORAGE_KEY = 'nerdbot.credentials.vault.v1';

/**
 * Validates a credential key name: must be uppercase letters, numbers, underscores or hyphens.
 */
export function normalizeKey(key: string): string {
  return key.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
}

/**
 * Returns all stored credentials sorted alphabetically by key.
 */
export async function listCredentials(): Promise<CredentialItem[]> {
  const items = await get<CredentialItem[]>(CREDENTIALS_STORAGE_KEY, []);
  return items.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Returns a key-value mapping of all credentials in the vault.
 */
export async function getCredentialsMap(): Promise<Record<string, string>> {
  const items = await listCredentials();
  const map: Record<string, string> = {};
  for (const item of items) {
    if (item.key && item.value) {
      map[item.key] = item.value;
    }
  }
  return map;
}

/**
 * Saves or updates a credential in the local vault.
 */
export async function saveCredential(input: {
  key: string;
  value: string;
  description?: string;
}): Promise<CredentialItem> {
  const normalizedKey = normalizeKey(input.key);
  if (!normalizedKey) {
    throw new Error('Credential key name cannot be empty.');
  }

  const items = await listCredentials();
  const existingIndex = items.findIndex((i) => i.key === normalizedKey);
  const now = Date.now();

  let savedItem: CredentialItem;
  if (existingIndex >= 0) {
    savedItem = {
      ...items[existingIndex],
      value: input.value,
      description: input.description ?? items[existingIndex].description,
      updatedAt: now,
    };
    items[existingIndex] = savedItem;
  } else {
    savedItem = {
      key: normalizedKey,
      value: input.value,
      description: input.description || '',
      createdAt: now,
      updatedAt: now,
    };
    items.push(savedItem);
  }

  await set(CREDENTIALS_STORAGE_KEY, items);
  return savedItem;
}

/**
 * Deletes a credential from the vault.
 */
export async function deleteCredential(key: string): Promise<void> {
  const normalizedKey = normalizeKey(key);
  const items = await listCredentials();
  const filtered = items.filter((i) => i.key !== normalizedKey);
  await set(CREDENTIALS_STORAGE_KEY, filtered);
}

/**
 * Extracts secret placeholder keys found in a string (e.g. $SECRET{API_KEY} -> ["API_KEY"]).
 */
export function extractSecretKeys(text: string): string[] {
  if (!text) return [];
  const regex = /\$SECRET\{([A-Za-z0-9_-]+)\}/g;
  const keys: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[1] && !keys.includes(match[1])) {
      keys.push(match[1]);
    }
  }
  return keys;
}

/**
 * In-memory resolution of $SECRET{KEY} placeholders.
 * Replaces placeholders with their actual secret values if present in the vault.
 */
export function resolveSecretsInText(
  text: string,
  vault: Record<string, string>
): string {
  if (!text || !vault || Object.keys(vault).length === 0) return text;

  return text.replace(/\$SECRET\{([A-Za-z0-9_-]+)\}/g, (match, key) => {
    const directMatch = vault[key];
    if (directMatch !== undefined) return directMatch;

    // Check uppercase match fallback
    const upperKey = key.toUpperCase();
    if (vault[upperKey] !== undefined) return vault[upperKey];

    return match;
  });
}

/**
 * Masks raw secrets if they accidentally appear in response text.
 */
export function maskSecretsInText(
  text: string,
  vault: Record<string, string>
): string {
  if (!text || !vault) return text;

  let masked = text;
  for (const [key, rawValue] of Object.entries(vault)) {
    // Only mask secrets that are substantial enough to avoid false-positive replacement
    if (rawValue && rawValue.trim().length >= 4) {
      const escaped = rawValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'g');
      masked = masked.replace(re, `[REDACTED_SECRET:${key}]`);
    }
  }
  return masked;
}
