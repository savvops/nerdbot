import { get, set, uid } from './storage';
import type { Chat, Message } from './types';

const CURRENT_KEY = 'nerdbot.chat.current.v1';
const HISTORY_KEY = 'nerdbot.chat.history.v1';
const PINNED_KEY = 'nerdbot.pinned.v1';
const MAX_HISTORY = 30;

export function emptyChat(projectId?: string): Chat {
  const now = Date.now();
  return {
    id: uid(),
    title: 'New conversation',
    messages: [],
    createdAt: now,
    updatedAt: now,
    projectId,
  };
}

/** Loose chats = no project. */
export function looseChats(history: Chat[]): Chat[] {
  return history.filter((c) => !c.projectId);
}

export function chatsInProject(history: Chat[], projectId: string): Chat[] {
  return history.filter((c) => c.projectId === projectId);
}

export async function loadCurrent(): Promise<Chat> {
  const c = await get<Chat | null>(CURRENT_KEY, null);
  return c ?? emptyChat();
}

export async function saveCurrent(chat: Chat): Promise<void> {
  await set(CURRENT_KEY, chat);
}

export async function loadHistory(): Promise<Chat[]> {
  return get<Chat[]>(HISTORY_KEY, []);
}

export async function saveChatToHistory(chat: Chat): Promise<void> {
  if (chat.messages.length > 0) {
    const history = await loadHistory();
    const next = [chat, ...history.filter((c) => c.id !== chat.id)].slice(0, MAX_HISTORY);
    await set(HISTORY_KEY, next);
  }
}

export async function archiveCurrent(chat: Chat, opts: { keepProject?: boolean } = {}): Promise<Chat> {
  await saveChatToHistory(chat);
  const fresh = emptyChat(opts.keepProject ? chat.projectId : undefined);
  await saveCurrent(fresh);
  return fresh;
}

export async function restoreFromHistory(id: string): Promise<Chat | null> {
  const history = await loadHistory();
  const found = history.find((c) => c.id === id);
  if (!found) return null;
  await saveCurrent(found);
  return found;
}

export async function deleteFromHistory(id: string): Promise<void> {
  const history = await loadHistory();
  await set(
    HISTORY_KEY,
    history.filter((c) => c.id !== id)
  );
}

export function appendMessage(chat: Chat, msg: Message): Chat {
  const messages = [...chat.messages, msg];
  const title =
    chat.title === 'New conversation' && msg.role === 'user'
      ? deriveTitle(msg.content)
      : chat.title;
  return { ...chat, messages, title, updatedAt: Date.now() };
}

export function updateMessage(chat: Chat, id: string, patch: Partial<Message>): Chat {
  return {
    ...chat,
    messages: chat.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    updatedAt: Date.now(),
  };
}

export function deleteMessage(chat: Chat, id: string): Chat {
  return {
    ...chat,
    messages: chat.messages.filter((m) => m.id !== id),
    updatedAt: Date.now(),
  };
}

/** Drop everything from a message onward (used for regenerate). */
export function truncateAfter(chat: Chat, id: string, includeAnchor: boolean): Chat {
  const idx = chat.messages.findIndex((m) => m.id === id);
  if (idx < 0) return chat;
  const messages = chat.messages.slice(0, includeAnchor ? idx : idx + 1);
  return { ...chat, messages, updatedAt: Date.now() };
}

function deriveTitle(input: string): string {
  const cleaned = input.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 48) return cleaned;
  return cleaned.slice(0, 45) + '…';
}

export function exportToMarkdown(chat: Chat): string {
  const lines: string[] = [`# ${chat.title}`, ''];
  lines.push(`> Exported ${new Date().toISOString()} · ${chat.messages.length} messages`, '');
  for (const m of chat.messages) {
    const head = m.role === 'user' ? '**You**' : '**Nerdbot**';
    lines.push(head, '', m.content, '');
    if (m.attachments?.length) {
      lines.push(`_Attachments: ${m.attachments.map((a) => a.name).join(', ')}_`, '');
    }
    lines.push('---', '');
  }
  return lines.join('\n');
}

/* Pinned messages */
export interface PinnedNote {
  id: string;
  chatId: string;
  chatTitle: string;
  content: string;
  createdAt: number;
}

export async function loadPinned(): Promise<PinnedNote[]> {
  return get<PinnedNote[]>(PINNED_KEY, []);
}

export async function pinMessage(chat: Chat, message: Message): Promise<PinnedNote[]> {
  const pinned = await loadPinned();
  const note: PinnedNote = {
    id: uid(),
    chatId: chat.id,
    chatTitle: chat.title,
    content: message.content,
    createdAt: Date.now(),
  };
  const next = [note, ...pinned].slice(0, 100);
  await set(PINNED_KEY, next);
  return next;
}

export async function unpinNote(id: string): Promise<PinnedNote[]> {
  const pinned = await loadPinned();
  const next = pinned.filter((p) => p.id !== id);
  await set(PINNED_KEY, next);
  return next;
}
