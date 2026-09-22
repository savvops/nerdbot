import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';

export const messageValue = v.object({
  id: v.string(), role: v.union(v.literal('system'), v.literal('user'), v.literal('assistant'), v.literal('tool')),
  content: v.string(), createdAt: v.number(), pinned: v.optional(v.boolean()),
  finishedAt: v.optional(v.number()), modelUsed: v.optional(v.string()),
  toolCallId: v.optional(v.string()), toolCallsJson: v.optional(v.string()),
});
export const payloadValue = v.object({
  id: v.string(), title: v.string(), createdAt: v.number(), updatedAt: v.number(),
  projectId: v.optional(v.string()),
  messages: v.array(messageValue),
});
export const projectValue = v.object({
  id: v.string(), name: v.string(), emoji: v.string(), createdAt: v.number(), updatedAt: v.number(),
  description: v.optional(v.string()), systemPrompt: v.optional(v.string()),
});
export default defineSchema({
  ...authTables,
  syncHeads: defineTable({ owner: v.id('users'), sequence: v.number() }).index('owner', ['owner']),
  chats: defineTable({
    owner: v.id('users'), clientId: v.string(), title: v.string(), createdAt: v.number(), updatedAt: v.number(),
    projectId: v.optional(v.string()), revision: v.number(), sequence: v.number(), deleted: v.boolean(),
  }).index('owner_client', ['owner', 'clientId']).index('owner_sequence', ['owner', 'sequence']),
  messages: defineTable({ chat: v.id('chats'), position: v.number(), value: messageValue }).index('chat', ['chat']),
  syncReceipts: defineTable({ owner: v.id('users'), operation: v.string(), clientId: v.string(), revision: v.number(), conflict: v.boolean() })
    .index('owner_operation', ['owner', 'operation']),
  notes: defineTable({ owner: v.id('users'), clientId: v.string(), chatId: v.string(), chatTitle: v.string(), content: v.string(), createdAt: v.number(), deleted: v.boolean(), sequence: v.number() })
    .index('owner_client', ['owner', 'clientId']).index('owner_sequence', ['owner', 'sequence']),
  projects: defineTable({
    owner: v.id('users'), clientId: v.string(), name: v.string(), emoji: v.string(), createdAt: v.number(), updatedAt: v.number(),
    description: v.optional(v.string()), systemPrompt: v.optional(v.string()), deleted: v.boolean(), sequence: v.number(),
  }).index('owner_client', ['owner', 'clientId']).index('owner_sequence', ['owner', 'sequence']),
});
