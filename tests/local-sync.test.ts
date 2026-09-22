import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConvexReactClient } from 'convex/react';
import { accountCache, createChatSync, textChat } from '../src/services/chatSync';
const sample = () => ({ id: crypto.randomUUID(), title: 'Test', createdAt: 1, updatedAt: 1, messages: [{ id: 'm', role: 'user' as const, content: 'text', createdAt: 1, attachments: [{ id: 'file', kind: 'image' as const, name: 'private.png', mimeType: 'image/png', data: 'secret-file' }] }] });
beforeEach(() => {
  vi.stubGlobal('window', { setInterval: () => 1, clearInterval() {}, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('BroadcastChannel', undefined);
});
function transport() {
  return { url: 'https://sync.test', mutation: vi.fn(async () => ({ id: '', revision: 1, conflict: false })), query: vi.fn(async () => []), watchQuery: () => ({ onUpdate: () => () => {} }) };
}
describe('durable local sync', () => {
  it('syncs the project assignment while excluding attachments, local personas and project files', () => {
    const value = textChat({ ...sample(), projectId: 'local-kb', soulId: 'local-persona' });
    expect(value.projectId).toBe('local-kb');
    expect(JSON.stringify(value)).not.toMatch(/secret-file|local-persona|attachments/);
  });
  it('persists the outbox offline, reloads it, and keeps accounts separate', async () => {
    const client = transport(); const user = crypto.randomUUID();
    vi.stubGlobal('navigator', { onLine: false });
    const first = createChatSync(client as unknown as ConvexReactClient, user);
    const chat = sample(); await first.manager.saveCurrent(chat);
    const second = createChatSync(client as unknown as ConvexReactClient, user);
    expect((await second.manager.loadCurrent()).id).toBe(chat.id);
    const other = createChatSync(client as unknown as ConvexReactClient, crypto.randomUUID());
    expect(await other.manager.loadHistory()).toEqual([]);
    expect(await accountCache(`${client.url}:${user}`, c => Object.keys(c.pending).length)).toBe(1);
    vi.stubGlobal('navigator', { onLine: true });
    client.mutation.mockResolvedValue({ id: chat.id, revision: 1, conflict: false });
    const stop = second.start();
    await vi.waitFor(() => expect(client.mutation).toHaveBeenCalledTimes(1));
    await vi.waitFor(async () => expect(await accountCache(`${client.url}:${user}`, c => Object.keys(c.pending).length)).toBe(0));
    stop();
  });
  it('does not upload streaming drafts or lose newer edits while an upload is in flight', async () => {
    const client = transport(); const user = crypto.randomUUID(); const chat = sample();
    const sync = createChatSync(client as unknown as ConvexReactClient, user);
    await sync.manager.saveCurrent({ ...chat, messages: chat.messages.map(m => ({ ...m, pending: true })) });
    expect(await accountCache(`${client.url}:${user}`, c => Object.keys(c.pending).length)).toBe(0);
    await sync.manager.saveCurrent(chat);
    let finish!: (value: { id: string; revision: number; conflict: boolean }) => void;
    client.mutation.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    client.mutation.mockImplementationOnce(async () => ({ id: chat.id, revision: 2, conflict: false }));
    const stop = sync.start();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await sync.manager.saveCurrent({ ...chat, title: 'newer', updatedAt: 2 });
    finish({ id: chat.id, revision: 1, conflict: false });
    await vi.waitFor(() => expect(client.mutation).toHaveBeenCalledTimes(2));
    expect(client.mutation.mock.calls[1][1].baseRevision).toBe(1);
    expect((await sync.manager.loadCurrent()).title).toBe('newer'); stop();
  });
});
