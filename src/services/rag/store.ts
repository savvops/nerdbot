/**
 * Orama-based vector store for the knowledge system.
 *
 * Manages the Orama instance lifecycle:
 * - Creates the DB with the knowledge schema
 * - Persists to / restores from IndexedDB
 * - Provides insert, search, and delete operations
 */

import { create, insert, search, remove, count } from '@orama/orama';
import { persist, restore } from '@orama/plugin-data-persistence';
import { DIMENSIONS } from './embeddings';
import type { KnowledgeChunk, KnowledgeSearchResult } from './types';

const IDB_NAME = 'nerdbot-knowledge';
const IDB_STORE = 'orama';
const IDB_KEY = 'db-snapshot';

let db: any = null;

// ---------- IndexedDB helpers ----------

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const idb = req.result;
      if (!idb.objectStoreNames.contains(IDB_STORE)) {
        idb.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------- Store lifecycle ----------

export async function getStore(): Promise<any> {
  if (db) return db;

  // Try restoring from IndexedDB first
  const snapshot = await idbGet<string>(IDB_KEY);
  if (snapshot) {
    try {
      db = await restore('json', snapshot as any);
      return db;
    } catch {
      // Corrupted snapshot — start fresh
      await idbDelete(IDB_KEY);
    }
  }

  // Create fresh
  db = create({
    schema: {
      folderId: 'string' as const,
      docId: 'string' as const,
      docName: 'string' as const,
      chunkIndex: 'number' as const,
      text: 'string' as const,
      embedding: `vector[${DIMENSIONS}]` as const,
    },
  });
  return db;
}

export async function saveStore(): Promise<void> {
  if (!db) return;
  const snapshot = await persist(db, 'json');
  await idbSet(IDB_KEY, snapshot);
}

// ---------- Operations ----------

export async function insertChunks(chunks: KnowledgeChunk[]): Promise<void> {
  const store = await getStore();
  for (const chunk of chunks) {
    insert(store, chunk as any);
  }
  await saveStore();
}

export async function searchKnowledge(
  queryEmbedding: number[],
  queryText: string,
  opts: { limit?: number; folderId?: string } = {},
): Promise<KnowledgeSearchResult[]> {
  const store = await getStore();
  const total = count(store);
  if (total === 0) return [];

  const searchOpts: any = {
    mode: 'hybrid',
    term: queryText,
    vector: {
      value: queryEmbedding,
      property: 'embedding',
    },
    limit: opts.limit ?? 5,
  };
  if (opts.folderId) {
    searchOpts.where = { folderId: opts.folderId };
  }

  const results: any = search(store, searchOpts);
  // In Orama v3, search may return sync or async depending on mode
  const resolved = results instanceof Promise ? await results : results;

  return (resolved.hits || []).map((hit: any) => ({
    text: hit.document.text,
    docName: hit.document.docName,
    score: hit.score,
  }));
}

export async function deleteByDocId(docId: string): Promise<void> {
  const store = await getStore();

  const searchOpts: any = {
    where: { docId },
    limit: 10000,
  };

  const results: any = search(store, searchOpts);
  const resolved = results instanceof Promise ? await results : results;

  for (const hit of (resolved.hits || [])) {
    remove(store, hit.id);
  }

  await saveStore();
}

export async function deleteByFolderId(folderId: string): Promise<void> {
  const store = await getStore();

  const searchOpts: any = {
    where: { folderId },
    limit: 10000,
  };

  const results: any = search(store, searchOpts);
  const resolved = results instanceof Promise ? await results : results;

  for (const hit of (resolved.hits || [])) {
    remove(store, hit.id);
  }

  await saveStore();
}

export async function getChunkCount(): Promise<number> {
  const store = await getStore();
  return count(store) as number;
}
