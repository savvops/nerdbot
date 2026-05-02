import { get, set, uid } from './storage';
import type { Soul } from './types';

const SOULS_KEY = 'nerdbot.souls.v1';

export async function loadSouls(): Promise<Soul[]> {
  return get<Soul[]>(SOULS_KEY, []);
}

export async function createSoul(
  input: Pick<Soul, 'name' | 'emoji' | 'systemPrompt'>
): Promise<Soul> {
  const souls = await loadSouls();
  const now = Date.now();
  const soul: Soul = { ...input, id: uid(), createdAt: now, updatedAt: now };
  await set(SOULS_KEY, [soul, ...souls]);
  return soul;
}

export async function updateSoul(
  id: string,
  patch: Partial<Pick<Soul, 'name' | 'emoji' | 'systemPrompt'>>
): Promise<void> {
  const souls = await loadSouls();
  await set(
    SOULS_KEY,
    souls.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s))
  );
}

export async function deleteSoul(id: string): Promise<void> {
  const souls = await loadSouls();
  await set(SOULS_KEY, souls.filter((s) => s.id !== id));
}

export const DEFAULT_SOUL_PROMPT = `You are a curious, warm, and precise assistant.
You think carefully before answering and acknowledge uncertainty when relevant.
You prefer concrete examples over abstractions and keep responses tight.`;
