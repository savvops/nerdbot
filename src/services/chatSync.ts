import { api } from '../../convex/_generated/api';
import type { ConvexReactClient } from 'convex/react';
import type { Chat, Message } from './types';
import * as local from './chatManager';
import { FOLDERS_KEY, listFolders, replaceFolders, type KnowledgeFolder } from './rag';
import { onStorageChange } from './storage';

export type ChatManager = Pick<typeof local, 'loadCurrent' | 'saveCurrent' | 'loadHistory' | 'saveChatToHistory' | 'archiveCurrent' | 'restoreFromHistory' | 'deleteFromHistory' | 'loadPinned' | 'pinMessage' | 'unpinNote'>;
type Pending = { operation: string; baseRevision: number; chat: Chat; deleted: boolean };
type ProjectPending = { project: KnowledgeFolder; deleted: boolean };
type Cache = {
  current: Chat; chats: Record<string, Chat>; revisions: Record<string, number>;
  fingerprints: Record<string, string>; pending: Record<string, Pending>; cursor: number;
  notes: Record<string, local.PinnedNote>; noteQueue: Record<string, { note: local.PinnedNote; deleted: boolean }>;
  archived: Record<string, Chat>; imported: boolean;
  projects: Record<string, KnowledgeFolder>; projectQueue: Record<string, ProjectPending>; projectsReady: boolean;
};
export type SyncStatus = { message: string; pending: number; error: boolean; imported: boolean };
export const textChat = (chat: Chat) => ({
  id: chat.id, title: chat.title, createdAt: chat.createdAt, updatedAt: chat.updatedAt,
  ...(chat.projectId ? { projectId: chat.projectId } : {}),
  messages: chat.messages.map(m => ({
    id: m.id, role: m.role, content: m.content, createdAt: m.createdAt,
    ...(m.pinned === undefined ? {} : { pinned: m.pinned }),
    ...(m.finishedAt === undefined ? {} : { finishedAt: m.finishedAt }),
    ...(m.modelUsed ? { modelUsed: m.modelUsed } : {}),
    ...(m.toolCallId ? { toolCallId: m.toolCallId } : {}),
    ...(m.toolCalls ? { toolCallsJson: JSON.stringify(m.toolCalls) } : {}),
  })),
});
const fingerprint = (chat: Chat) => JSON.stringify(textChat(chat));
const fresh = (): Cache => ({ current: local.emptyChat(), chats: {}, revisions: {}, fingerprints: {}, pending: {}, cursor: 0, notes: {}, noteQueue: {}, archived: {}, imported: false,
  projects: {}, projectQueue: {}, projectsReady: false });

function projectValue(folder: KnowledgeFolder): KnowledgeFolder {
  return { ...folder, updatedAt: folder.updatedAt ?? folder.createdAt };
}

// IndexedDB keeps a durable outbox without the small localStorage/Chrome quota.
// Each account gets its own record. navigator.locks prevents two side panels
// from saving over one another's cache while they share the extension origin.
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('nerdbot-chat-sync-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('accounts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function accountCache<T>(key: string, change: (cache: Cache) => T | Promise<T>): Promise<T> {
  const work = async () => {
    const db = await database();
    try {
      const cache = await new Promise<Cache>((resolve, reject) => {
        const r = db.transaction('accounts').objectStore('accounts').get(key);
        r.onsuccess = () => resolve(r.result ?? fresh());
        r.onerror = () => reject(r.error);
      });
      cache.projects ??= {};
      cache.projectQueue ??= {};
      cache.projectsReady ??= false;
      const result = await change(cache);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('accounts', 'readwrite');
        tx.objectStore('accounts').put(cache, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('Local save failed.'));
      });
      return result;
    } finally { db.close(); }
  };
  return navigator.locks ? navigator.locks.request(`nerdbot-cache:${key}`, work) : work();
}

export function createChatSync(client: ConvexReactClient, account: string) {
  const key = `${client.url}:${account}`;
  let stopped = true;
  let running = false;
  let rerun = false;
  let notice = '';
  let status: SyncStatus = { message: 'Connecting…', pending: 0, error: false, imported: false };
  const listeners = new Set<() => void>();
  let channel: BroadcastChannel | null = null;
  let applyingProjects = false;
  const notify = () => { for (const listener of listeners) listener(); };
  const emit = () => { notify(); channel?.postMessage('changed'); };
  const cache = <T,>(fn: (c: Cache) => T | Promise<T>) => accountCache(key, fn);
  const queue = (c: Cache, chat: Chat) => {
    if (!chat.messages.length || chat.messages.some(m => m.pending)) return;
    const print = fingerprint(chat);
    if (c.fingerprints[chat.id] === print) return;
    c.fingerprints[chat.id] = print;
    c.pending[chat.id] = { operation: crypto.randomUUID(), baseRevision: c.pending[chat.id]?.baseRevision ?? c.revisions[chat.id] ?? 0, chat: structuredClone(chat), deleted: false };
  };
  const changed = () => { emit(); void pump(); };

  async function captureProjects(detectDeletes = true, schedule = true): Promise<void> {
    if (applyingProjects) return;
    const localProjects = (await listFolders()).map(projectValue);
    await cache(c => {
      if (!c.projects) c.projects = {};
      if (!c.projectQueue) c.projectQueue = {};
      if (!c.projectsReady) {
        for (const project of localProjects) {
          const remote = c.projects[project.id];
          if (!remote || project.updatedAt > remote.updatedAt) {
            c.projects[project.id] = project;
            c.projectQueue[project.id] = { project, deleted: false };
          }
        }
        c.projectsReady = true;
        return;
      }
      const incoming = new Map(localProjects.map(project => [project.id, project]));
      for (const project of localProjects) {
        const previous = c.projects[project.id];
        if (!previous || JSON.stringify(previous) !== JSON.stringify(project)) {
          c.projects[project.id] = project;
          c.projectQueue[project.id] = { project, deleted: false };
        }
      }
      if (detectDeletes) {
        for (const project of Object.values(c.projects)) {
          if (!incoming.has(project.id)) {
            c.projectQueue[project.id] = { project: { ...project, updatedAt: Date.now() }, deleted: true };
            delete c.projects[project.id];
          }
        }
      }
    });
    if (schedule) changed();
  }

  async function publishProjects(): Promise<void> {
    const snapshot = await cache(c => ({ ready: c.projectsReady, projects: Object.values(c.projects ?? {}).sort((a, b) => b.updatedAt - a.updatedAt) }));
    if (!snapshot.ready) return;
    applyingProjects = true;
    try { await replaceFolders(snapshot.projects); }
    finally { applyingProjects = false; }
  }
  const manager: ChatManager = {
    loadCurrent: () => cache(c => c.current),
    saveCurrent: async chat => {
      await cache(c => { c.current = chat; if (chat.messages.length) c.chats[chat.id] = chat; queue(c, chat); });
      changed();
    },
    loadHistory: () => cache(c => Object.values(c.chats).sort((a, b) => b.updatedAt - a.updatedAt)),
    saveChatToHistory: async chat => {
      await cache(c => { if (chat.messages.length) { c.chats[chat.id] = chat; queue(c, chat); } }); changed();
    },
    archiveCurrent: async (chat, opts = {}) => {
      const next = local.emptyChat(opts.keepProject ? chat.projectId : undefined);
      await cache(c => { if (chat.messages.length) { c.chats[chat.id] = chat; queue(c, chat); } c.current = next; }); changed(); return next;
    },
    restoreFromHistory: id => cache(c => { const chat = c.chats[id]; if (chat) c.current = chat; return chat ?? null; }),
    deleteFromHistory: async id => {
      await cache(c => {
        const chat = c.chats[id]; if (!chat) return;
        c.archived[id] = chat;
        c.pending[id] = { operation: crypto.randomUUID(), baseRevision: c.revisions[id] ?? 0, chat, deleted: true };
        delete c.chats[id];
        if (c.current.id === id) c.current = local.emptyChat();
      }); changed();
    },
    loadPinned: () => cache(c => Object.values(c.notes).sort((a, b) => b.createdAt - a.createdAt)),
    pinMessage: async (chat, message) => {
      const note = { id: crypto.randomUUID(), chatId: chat.id, chatTitle: chat.title, content: message.content, createdAt: Date.now() };
      await cache(c => { c.notes[note.id] = note; c.noteQueue[note.id] = { note, deleted: false }; }); changed(); return manager.loadPinned();
    },
    unpinNote: async id => {
      await cache(c => { const note = c.notes[id]; if (note) { c.noteQueue[id] = { note, deleted: true }; delete c.notes[id]; } }); changed(); return manager.loadPinned();
    },
  };

  async function pump() {
    if (stopped) return;
    if (running) { rerun = true; return; }
    running = true;
    try {
      if (navigator.onLine === false) throw new Error('Offline — changes saved on this device.');
      const pending = await cache(c => Object.values(c.pending));
      for (const job of pending) {
        if (stopped) return;
        let result;
        try {
          const payload = textChat(job.chat);
          result = await client.mutation(api.sync.writeChat, { ...job, expectedAccount: account, chat: job.deleted ? { ...payload, messages: [] } : payload });
        } catch (error) {
          if (job.deleted && error instanceof Error && error.message.includes('changed on another device')) {
            await cache(c => { if (c.pending[job.chat.id]?.operation === job.operation) delete c.pending[job.chat.id]; c.cursor = 0; });
            notice = 'A newer version was kept. Delete it again if you still want to remove it.';
            continue;
          }
          throw error;
        }
        if (stopped) return;
        await cache(c => {
          const latest = c.pending[job.chat.id];
          if (result.conflict) {
            notice = 'Both edits were saved. Look for a conflict copy in History.';
            const copy = { ...(latest?.chat ?? job.chat), id: result.id, title: `${job.chat.title} (conflict copy)` };
            c.chats[result.id] = copy; c.revisions[result.id] = result.revision;
            c.fingerprints[result.id] = fingerprint({ ...job.chat, id: result.id, title: copy.title });
            delete c.pending[job.chat.id]; delete c.fingerprints[job.chat.id];
            if (c.current.id === job.chat.id) c.current = copy;
            if (latest && latest.operation !== job.operation) queue(c, copy);
            // Re-read the original even if an earlier pull already advanced the cursor.
            c.cursor = 0;
          } else {
            c.revisions[job.chat.id] = result.revision;
            if (latest?.operation === job.operation) delete c.pending[job.chat.id];
            else if (latest) latest.baseRevision = result.revision;
          }
        });
      }
      const notes = await cache(c => Object.values(c.noteQueue));
      for (const job of notes) {
        if (stopped) return;
        await client.mutation(api.sync.writeNote, { ...job, expectedAccount: account });
        await cache(c => { if (c.noteQueue[job.note.id]?.deleted === job.deleted) delete c.noteQueue[job.note.id]; });
      }
      const projects = await cache(c => Object.values(c.projectQueue ?? {}));
      for (const job of projects) {
        if (stopped) return;
        await client.mutation(api.sync.writeProject, { ...job, expectedAccount: account });
        await cache(c => {
          const current = c.projectQueue?.[job.project.id];
          if (current && current.deleted === job.deleted && current.project.updatedAt === job.project.updatedAt) delete c.projectQueue[job.project.id];
        });
      }
      while (!stopped) {
        const cursor = await cache(c => c.cursor);
        const page = await client.query(api.sync.changes, { after: cursor });
        if (!page.length) break;
        for (const change of page) {
          if (stopped) return;
          if (change.kind === 'chat') {
            const remote = await client.query(api.sync.readChat, { id: change.id });
            if (!remote || stopped) continue;
            await cache(c => {
              if (c.pending[change.id]) return;
              if (remote.deleted) {
                if (c.chats[change.id]) c.archived[change.id] = c.chats[change.id];
                delete c.chats[change.id];
                if (c.current.id === change.id) c.current = local.emptyChat();
              } else {
                const old = c.chats[change.id];
                const messages: Message[] = remote.messages.map(m => {
                  const { toolCallsJson, ...value } = m;
                  const previous = old?.messages.find(p => p.id === m.id);
                  return { ...value, ...(previous?.attachments ? { attachments: previous.attachments } : {}), ...(toolCallsJson ? { toolCalls: JSON.parse(toolCallsJson) } : {}) };
                });
                const chat: Chat = { id: remote.id, title: remote.title, createdAt: remote.createdAt, updatedAt: remote.updatedAt, messages,
                  ...(remote.projectId ? { projectId: remote.projectId } : {}), ...(old?.soulId ? { soulId: old.soulId } : {}) };
                // Never replace an actively streaming local draft with the last cloud copy.
                if (!old?.messages.some(m => m.pending)) {
                  c.chats[change.id] = chat; c.fingerprints[change.id] = fingerprint(chat);
                  if (c.current.id === change.id) c.current = chat;
                } else return;
              }
              c.revisions[change.id] = remote.revision;
            });
          } else if (change.kind === 'note') {
            const note = await client.query(api.sync.readNote, { id: change.id });
            if (note) await cache(c => { if (!c.noteQueue[change.id]) { if (note.deleted) delete c.notes[change.id]; else { const { deleted: _, ...value } = note; c.notes[change.id] = value; } } });
          } else {
            const project = await client.query(api.sync.readProject, { id: change.id });
            if (project) await cache(c => {
              if (!c.projects) c.projects = {};
              if (!c.projectQueue) c.projectQueue = {};
              if (c.projectQueue[change.id]) return;
              if (project.deleted) delete c.projects[change.id];
              else c.projects[change.id] = projectValue(project);
            });
          }
          await cache(c => { c.cursor = Math.max(c.cursor, change.sequence); });
        }
      }
      await publishProjects();
      const info = await cache(c => ({ pending: Object.keys(c.pending).length + Object.keys(c.noteQueue).length + Object.keys(c.projectQueue ?? {}).length, imported: c.imported }));
      status = { ...info, message: info.pending ? 'Saving changes…' : notice || 'Chats and projects synced', error: false };
      emit();
    } catch (error) {
      const info = await cache(c => ({ pending: Object.keys(c.pending).length + Object.keys(c.noteQueue).length + Object.keys(c.projectQueue ?? {}).length, imported: c.imported }));
      status = { ...info, message: error instanceof Error ? error.message : 'Sync paused. Your changes remain on this device.', error: true };
      notify();
    } finally {
      running = false;
      if (rerun && !stopped) { rerun = false; queueMicrotask(() => { void pump(); }); }
    }
  }
  return {
    manager,
    getStatus: () => status,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start() {
      stopped = false;
      channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`nerdbot-sync:${key}`);
      const watch = client.watchQuery(api.sync.head, {});
      const unsubscribe = watch.onUpdate(() => { void pump(); });
      // Remote changes arrive through the head subscription. Only retry locally
      // queued work/errors, rather than polling Convex when nothing has changed.
      const timer = window.setInterval(() => {
        void cache(c => Object.keys(c.pending).length + Object.keys(c.noteQueue).length).then(count => {
          if (count || status.error) void pump();
        });
      }, 5000);
      const online = () => { void pump(); };
      const stopProjectWatch = onStorageChange(FOLDERS_KEY, () => { void captureProjects(); });
      window.addEventListener('online', online);
      if (channel) channel.onmessage = () => { notify(); };
      void captureProjects(false, false).then(pump);
      return () => { stopped = true; unsubscribe(); stopProjectWatch(); clearInterval(timer); window.removeEventListener('online', online); channel?.close(); channel = null; };
    },
    async importLocal() {
      const [current, history, notes, projects] = await Promise.all([local.loadCurrent(), local.loadHistory(), local.loadPinned(), listFolders()]);
      await cache(c => {
        if (c.imported) return;
        const chats = new Map([...history, current].map(chat => [chat.id, chat]));
        for (const chat of chats.values()) if (chat.messages.length) {
          // Preserve the source keys and attachments locally, import text only to cloud.
          const copy = { ...chat, messages: chat.messages.map(m => ({ ...m, pending: false })) };
          if (!c.chats[chat.id]) { c.chats[chat.id] = copy; queue(c, copy); }
        }
        for (const note of notes) if (!c.notes[note.id]) { c.notes[note.id] = note; c.noteQueue[note.id] = { note, deleted: false }; }
        for (const raw of projects) {
          const project = projectValue(raw);
          if (!c.projects[project.id] || project.updatedAt > c.projects[project.id].updatedAt) {
            c.projects[project.id] = project;
            c.projectQueue[project.id] = { project, deleted: false };
          }
        }
        c.projectsReady = true;
        c.imported = true;
      }); changed();
    },
    retry: pump,
  };
}
export type ChatSync = ReturnType<typeof createChatSync>;
