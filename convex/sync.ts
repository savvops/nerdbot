import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError, v } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { payloadValue, projectValue } from './schema';

async function owner(ctx: QueryCtx | MutationCtx) {
  const id = await getAuthUserId(ctx);
  if (!id) throw new ConvexError('Sign in to sync your chats.');
  return id;
}
async function nextSequence(ctx: MutationCtx, user: Id<'users'>) {
  const head = await ctx.db.query('syncHeads').withIndex('owner', q => q.eq('owner', user)).unique();
  const sequence = (head?.sequence ?? 0) + 1;
  if (head) await ctx.db.patch(head._id, { sequence });
  else await ctx.db.insert('syncHeads', { owner: user, sequence });
  return sequence;
}
export const me = query({ args: {}, handler: async ctx => {
  const id = await getAuthUserId(ctx);
  if (!id) return null;
  const user = await ctx.db.get(id);
  return user ? { id, email: user.email ?? '' } : null;
} });
export const head = query({ args: {}, handler: async ctx => {
  const user = await owner(ctx);
  return (await ctx.db.query('syncHeads').withIndex('owner', q => q.eq('owner', user)).unique())?.sequence ?? 0;
} });
export const changes = query({ args: { after: v.number() }, handler: async (ctx, { after }) => {
  const user = await owner(ctx);
  const [chats, notes, projects] = await Promise.all([
    ctx.db.query('chats').withIndex('owner_sequence', q => q.eq('owner', user).gt('sequence', after)).take(25),
    ctx.db.query('notes').withIndex('owner_sequence', q => q.eq('owner', user).gt('sequence', after)).take(25),
    ctx.db.query('projects').withIndex('owner_sequence', q => q.eq('owner', user).gt('sequence', after)).take(25),
  ]);
  return [...chats.map(c => ({ kind: 'chat' as const, id: c.clientId, revision: c.revision, deleted: c.deleted, sequence: c.sequence })),
    ...notes.map(n => ({ kind: 'note' as const, id: n.clientId, revision: 0, deleted: n.deleted, sequence: n.sequence })),
    ...projects.map(p => ({ kind: 'project' as const, id: p.clientId, revision: 0, deleted: p.deleted, sequence: p.sequence }))]
    .sort((a, b) => a.sequence - b.sequence).slice(0, 25);
} });
export const readChat = query({ args: { id: v.string() }, handler: async (ctx, { id }) => {
  const user = await owner(ctx);
  const chat = await ctx.db.query('chats').withIndex('owner_client', q => q.eq('owner', user).eq('clientId', id)).unique();
  if (!chat) return null;
  const messages = chat.deleted ? [] : await ctx.db.query('messages').withIndex('chat', q => q.eq('chat', chat._id)).collect();
  return { id, title: chat.title, createdAt: chat.createdAt, updatedAt: chat.updatedAt, projectId: chat.projectId,
    revision: chat.revision, deleted: chat.deleted, messages: messages.sort((a, b) => a.position - b.position).map(m => m.value) };
} });
export const writeChat = mutation({ args: { expectedAccount: v.optional(v.string()), operation: v.string(), baseRevision: v.number(), deleted: v.boolean(), chat: payloadValue }, handler: async (ctx, args) => {
  const user = await owner(ctx);
  if (args.expectedAccount && args.expectedAccount !== user) throw new ConvexError('Account changed. Sign back into the original account to sync these changes.');
  if (args.operation.length > 100 || args.chat.id.length > 100 || args.chat.title.length > 500 || args.chat.messages.length > 1000 || JSON.stringify(args.chat).length > 500_000) {
    throw new ConvexError('This chat exceeds the text sync limit. Export it locally or start a new chat.');
  }
  const receipt = await ctx.db.query('syncReceipts').withIndex('owner_operation', q => q.eq('owner', user).eq('operation', args.operation)).unique();
  if (receipt) return { id: receipt.clientId, revision: receipt.revision, conflict: receipt.conflict };
  const original = await ctx.db.query('chats').withIndex('owner_client', q => q.eq('owner', user).eq('clientId', args.chat.id)).unique();
  const conflict = (original?.revision ?? 0) !== args.baseRevision;
  // Stale deletes never erase a newer version. Stale edits become a separate copy.
  if (conflict && args.deleted) throw new ConvexError('This chat changed on another device. Sync and delete it again.');
  const existing = conflict ? null : original;
  const id = conflict ? `${args.operation}-copy` : args.chat.id;
  const revision = (existing?.revision ?? 0) + 1;
  const sequence = await nextSequence(ctx, user);
  const row = { owner: user, clientId: id, title: args.chat.title + (conflict ? ' (conflict copy)' : ''),
    createdAt: args.chat.createdAt, updatedAt: Date.now(), projectId: args.chat.projectId, revision, sequence, deleted: args.deleted };
  const chatId = existing ? existing._id : await ctx.db.insert('chats', row);
  if (existing) await ctx.db.patch(chatId, row);
  const old = await ctx.db.query('messages').withIndex('chat', q => q.eq('chat', chatId)).collect();
  const byId = new Map(old.map(m => [m.value.id, m]));
  const keep = new Set<string>();
  if (!args.deleted) for (const [position, value] of args.chat.messages.entries()) {
    if (keep.has(value.id) || value.content.length > 150_000) throw new ConvexError('Invalid or oversized message.');
    keep.add(value.id);
    const previous = byId.get(value.id);
    if (!previous) await ctx.db.insert('messages', { chat: chatId, position, value });
    else if (previous.position !== position || JSON.stringify(previous.value) !== JSON.stringify(value)) await ctx.db.patch(previous._id, { position, value });
  }
  // The previous content stays on the user's local archive; tombstones prevent resurrection.
  for (const message of old) if (!keep.has(message.value.id)) await ctx.db.delete(message._id);
  await ctx.db.insert('syncReceipts', { owner: user, operation: args.operation, clientId: id, revision, conflict });
  return { id, revision, conflict };
} });
export const readNote = query({ args: { id: v.string() }, handler: async (ctx, { id }) => {
  const user = await owner(ctx);
  const note = await ctx.db.query('notes').withIndex('owner_client', q => q.eq('owner', user).eq('clientId', id)).unique();
  return note ? { id, chatId: note.chatId, chatTitle: note.chatTitle, content: note.content, createdAt: note.createdAt, deleted: note.deleted } : null;
} });
export const writeNote = mutation({ args: { expectedAccount: v.optional(v.string()), note: v.object({ id: v.string(), chatId: v.string(), chatTitle: v.string(), content: v.string(), createdAt: v.number() }), deleted: v.boolean() }, handler: async (ctx, { note, deleted, expectedAccount }) => {
  const user = await owner(ctx);
  if (expectedAccount && expectedAccount !== user) throw new ConvexError('Account changed. Sign back into the original account to sync these changes.');
  if (JSON.stringify(note).length > 160_000) throw new ConvexError('Pinned note is too large.');
  const existing = await ctx.db.query('notes').withIndex('owner_client', q => q.eq('owner', user).eq('clientId', note.id)).unique();
  // A delayed retry cannot resurrect an unpinned note. Repinning creates a new ID.
  if (existing?.deleted || (existing && !deleted)) return;
  const { id, ...rest } = note;
  const row = { ...rest, clientId: id, owner: user, deleted, sequence: await nextSequence(ctx, user) };
  if (existing) await ctx.db.patch(existing._id, row);
  else await ctx.db.insert('notes', row);
} });
export const readProject = query({ args: { id: v.string() }, handler: async (ctx, { id }) => {
  const user = await owner(ctx);
  const project = await ctx.db.query('projects').withIndex('owner_client', q => q.eq('owner', user).eq('clientId', id)).unique();
  if (!project) return null;
  return {
    id: project.clientId, name: project.name, emoji: project.emoji,
    createdAt: project.createdAt, updatedAt: project.updatedAt,
    description: project.description, systemPrompt: project.systemPrompt,
    deleted: project.deleted,
  };
} });
export const writeProject = mutation({ args: {
  expectedAccount: v.optional(v.string()), project: projectValue, deleted: v.boolean(),
}, handler: async (ctx, { expectedAccount, project, deleted }) => {
  const user = await owner(ctx);
  if (expectedAccount && expectedAccount !== user) throw new ConvexError('Account changed. Sign back into the original account to sync these changes.');
  if (project.id.length > 100 || project.name.length > 500 || JSON.stringify(project).length > 30_000) throw new ConvexError('Project metadata is too large.');
  const existing = await ctx.db.query('projects').withIndex('owner_client', q => q.eq('owner', user).eq('clientId', project.id)).unique();
  // Ignore delayed older writes; equal timestamps make retries idempotent.
  if (existing && existing.updatedAt > project.updatedAt) return;
  const { id, deleted: _deleted, ...metadata } = project as any;
  const row = { ...metadata, clientId: id, owner: user, deleted, sequence: await nextSequence(ctx, user) };
  if (existing) await ctx.db.patch(existing._id, row);
  else await ctx.db.insert('projects', row);
} });
