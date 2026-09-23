import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api } from '../convex/_generated/api';
const modules = import.meta.glob('../convex/**/*.ts');
const chat = { id: 'chat-1', title: 'Hello', createdAt: 1, updatedAt: 1, messages: [{ id: 'm1', role: 'user' as const, content: 'hello', createdAt: 1 }] };
async function setup() {
  const t = convexTest(schema, modules);
  const [a, b] = await t.run(async ctx => Promise.all([ctx.db.insert('users', { email: 'a@example.test' }), ctx.db.insert('users', { email: 'b@example.test' })]));
  return { t, a: t.withIdentity({ subject: a }), b: t.withIdentity({ subject: b }) };
}
describe('account-owned chat sync', () => {
  it('syncs project metadata and keeps chats assigned to their project', async () => {
    const { a, b } = await setup();
    const project = { id: 'project-1', name: 'Adobe', emoji: '🎨', description: 'Stock work', systemPrompt: 'Analyze sales evidence.', createdAt: 1, updatedAt: 2 };
    await a.mutation(api.sync.writeProject, { project, deleted: false });
    expect(await b.query(api.sync.readProject, { id: project.id })).toBeNull();
    expect((await a.query(api.sync.readProject, { id: project.id }))?.name).toBe('Adobe');
    await a.mutation(api.sync.writeChat, { operation: 'project-chat', baseRevision: 0, deleted: false, chat: { ...chat, projectId: project.id } });
    expect((await a.query(api.sync.readChat, { id: chat.id }))?.projectId).toBe(project.id);
    expect((await a.query(api.sync.changes, { after: 0 })).some(change => change.kind === 'project' && change.id === project.id)).toBe(true);
    await a.mutation(api.sync.writeProject, { project: { ...project, updatedAt: 3 }, deleted: true });
    expect((await a.query(api.sync.readProject, { id: project.id }))?.deleted).toBe(true);
    // Verifies writeProject accepts project object even if deleted property is passed
    await a.mutation(api.sync.writeProject, { project: { ...project, deleted: false, updatedAt: 4 }, deleted: false });
    expect((await a.query(api.sync.readProject, { id: project.id }))?.deleted).toBe(false);
  });
  it('rejects unsigned callers and isolates reads, writes and pins by account', async () => {
    const { t, a, b } = await setup();
    await expect(t.query(api.sync.head)).rejects.toThrow(/Sign in/);
    await expect(t.mutation(api.sync.writeChat, { operation: 'x', baseRevision: 0, deleted: false, chat })).rejects.toThrow(/Sign in/);
    await expect(a.mutation(api.sync.writeChat, { expectedAccount: 'previous-account', operation: 'queued', baseRevision: 0, deleted: false, chat })).rejects.toThrow(/Account changed/);
    await expect(a.mutation(api.sync.writeNote, { expectedAccount: 'previous-account', note: { id: 'queued-pin', chatId: chat.id, chatTitle: '', content: 'private', createdAt: 1 }, deleted: false })).rejects.toThrow(/Account changed/);
    await a.mutation(api.sync.writeChat, { operation: 'a1', baseRevision: 0, deleted: false, chat });
    expect(await b.query(api.sync.readChat, { id: chat.id })).toBeNull();
    expect(await b.query(api.sync.changes, { after: 0 })).toEqual([]);
    await b.mutation(api.sync.writeChat, { operation: 'b1', baseRevision: 0, deleted: false, chat: { ...chat, title: 'B only' } });
    expect((await a.query(api.sync.readChat, { id: chat.id }))?.title).toBe('Hello');
    await a.mutation(api.sync.writeNote, { note: { id: 'n1', chatId: chat.id, chatTitle: chat.title, content: 'private', createdAt: 1 }, deleted: false });
    expect(await b.query(api.sync.readNote, { id: 'n1' })).toBeNull();
  });
  it('deduplicates retries even after another device writes; preserves conflicting edits', async () => {
    const { a } = await setup();
    const args = { operation: 'once', baseRevision: 0, deleted: false, chat };
    const initial = await a.mutation(api.sync.writeChat, args);
    await a.mutation(api.sync.writeChat, { ...args, operation: 'second', baseRevision: 1, chat: { ...chat, title: 'Phone edit' } });
    expect(await a.mutation(api.sync.writeChat, args)).toEqual(initial);
    const fork = await a.mutation(api.sync.writeChat, { ...args, operation: 'third', baseRevision: 1, chat: { ...chat, title: 'PC edit' } });
    expect(fork.conflict).toBe(true);
    expect((await a.query(api.sync.readChat, { id: chat.id }))?.title).toBe('Phone edit');
    expect((await a.query(api.sync.readChat, { id: fork.id }))?.title).toBe('PC edit (conflict copy)');
  });
  it('propagates deletions and prevents stale deletions or unpin retries from erasing/resurrecting data', async () => {
    const { a } = await setup();
    await a.mutation(api.sync.writeChat, { operation: 'create', baseRevision: 0, deleted: false, chat });
    await expect(a.mutation(api.sync.writeChat, { operation: 'stale', baseRevision: 0, deleted: true, chat })).rejects.toThrow(/changed/);
    await a.mutation(api.sync.writeChat, { operation: 'delete', baseRevision: 1, deleted: true, chat });
    expect((await a.query(api.sync.readChat, { id: chat.id }))?.deleted).toBe(true);
    const note = { id: 'pin', chatId: chat.id, chatTitle: chat.title, content: 'saved', createdAt: 1 };
    await a.mutation(api.sync.writeNote, { note, deleted: false });
    await a.mutation(api.sync.writeNote, { note, deleted: true });
    await a.mutation(api.sync.writeNote, { note, deleted: false });
    expect((await a.query(api.sync.readNote, { id: 'pin' }))?.deleted).toBe(true);
  });
  it('paginates change history beyond the old 30-chat cap without missing interleaved notes', async () => {
    const { a } = await setup();
    for (let i = 0; i < 31; i++) {
      await a.mutation(api.sync.writeChat, { operation: `op-${i}`, baseRevision: 0, deleted: false, chat: { ...chat, id: `chat-${i}` } });
      await a.mutation(api.sync.writeNote, { note: { id: `pin-${i}`, chatId: chat.id, chatTitle: '', content: '', createdAt: i }, deleted: false });
    }
    let cursor = 0; const changes = [];
    for (;;) {
      const page = await a.query(api.sync.changes, { after: cursor });
      if (!page.length) break;
      changes.push(...page); cursor = page.at(-1)!.sequence;
    }
    expect(changes).toHaveLength(62);
    expect(new Set(changes.map(c => c.sequence)).size).toBe(62);
  });
});
