import { get, set } from './storage';
import type { Message } from './types';

const FACTS_KEY = 'nerdbot.memory.facts.v1';
const USER_KEY = 'nerdbot.memory.user.v1';

export interface MemoryProvider {
  buildSystemPromptSection(): Promise<string>;
  syncTurn(userMsg: Message, asstMsg: Message): Promise<void>;
  loadFacts(): Promise<string>;
  loadUserProfile(): Promise<string>;
  saveFacts(content: string): Promise<void>;
  saveUserProfile(content: string): Promise<void>;
}

/**
 * Stores long-term context as two plain markdown files — facts and user profile.
 * Loaded fresh into every system prompt. User can edit directly in Settings > Memory.
 * Auto-extraction from turns is a future enhancement; for now edits are manual.
 */
export class MarkdownMemoryProvider implements MemoryProvider {
  async loadFacts(): Promise<string> {
    return get<string>(FACTS_KEY, '');
  }

  async loadUserProfile(): Promise<string> {
    return get<string>(USER_KEY, '');
  }

  async saveFacts(content: string): Promise<void> {
    await set(FACTS_KEY, content);
  }

  async saveUserProfile(content: string): Promise<void> {
    await set(USER_KEY, content);
  }

  async buildSystemPromptSection(): Promise<string> {
    const [facts, user] = await Promise.all([this.loadFacts(), this.loadUserProfile()]);
    const parts: string[] = [];
    if (facts.trim()) parts.push(`[Long-term memory]\n${facts.trim()}`);
    if (user.trim()) parts.push(`[User profile]\n${user.trim()}`);
    return parts.join('\n\n');
  }

  // Stub — manual editing only for now. Auto-extraction can be added later.
  async syncTurn(_userMsg: Message, _asstMsg: Message): Promise<void> {}
}

export const memoryProvider = new MarkdownMemoryProvider();
