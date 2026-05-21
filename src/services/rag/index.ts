/**
 * RAG Knowledge System — Public API
 *
 * This module is the single entry-point for the knowledge system.
 * It coordinates: chunking → embedding → storing, and query → search → retrieve.
 */

import { get, set, uid } from '../storage';
import { chunkText } from './chunker';
import { embedTexts, embedQuery } from './embeddings';
import { insertChunks, searchKnowledge, deleteByDocId, deleteByFolderId, getChunkCount } from './store';
import type { KnowledgeFolder, KnowledgeDoc, KnowledgeChunk, KnowledgeSearchResult } from './types';

const FOLDERS_KEY = 'nerdbot.knowledge.folders.v1';
const DOCS_KEY = 'nerdbot.knowledge.docs.v1';

// ---------- Folders ----------

export async function listFolders(): Promise<KnowledgeFolder[]> {
  return get<KnowledgeFolder[]>(FOLDERS_KEY, []);
}

export async function createFolder(
  name: string,
  emoji = '📁',
  extras: { description?: string; systemPrompt?: string } = {}
): Promise<KnowledgeFolder> {
  const folders = await listFolders();
  const folder: KnowledgeFolder = {
    id: uid(),
    name: name.trim(),
    emoji,
    createdAt: Date.now(),
    description: extras.description?.trim() || undefined,
    systemPrompt: extras.systemPrompt?.trim() || undefined,
  };
  await set(FOLDERS_KEY, [folder, ...folders]);
  return folder;
}

export async function updateFolder(
  id: string,
  patch: Partial<Pick<KnowledgeFolder, 'name' | 'emoji' | 'description' | 'systemPrompt'>>
): Promise<KnowledgeFolder | null> {
  const folders = await listFolders();
  const idx = folders.findIndex((f) => f.id === id);
  if (idx < 0) return null;
  const updated: KnowledgeFolder = {
    ...folders[idx],
    ...patch,
    name: patch.name?.trim() ?? folders[idx].name,
    description: patch.description?.trim() || undefined,
    systemPrompt: patch.systemPrompt?.trim() || undefined,
  };
  folders[idx] = updated;
  await set(FOLDERS_KEY, folders);
  return updated;
}

export async function getFolder(id: string): Promise<KnowledgeFolder | null> {
  const folders = await listFolders();
  return folders.find((f) => f.id === id) ?? null;
}

export async function deleteFolder(folderId: string): Promise<void> {
  const folders = await listFolders();
  await set(FOLDERS_KEY, folders.filter((f) => f.id !== folderId));

  // Delete all docs in this folder
  const allDocs = await getAllDocs();
  await set(DOCS_KEY, allDocs.filter((d) => d.folderId !== folderId));

  // Delete all chunks from the vector store
  await deleteByFolderId(folderId);
}

// ---------- Documents ----------

async function getAllDocs(): Promise<KnowledgeDoc[]> {
  return get<KnowledgeDoc[]>(DOCS_KEY, []);
}

export async function listDocs(folderId: string): Promise<KnowledgeDoc[]> {
  const all = await getAllDocs();
  return all.filter((d) => d.folderId === folderId);
}

export async function deleteDoc(docId: string): Promise<void> {
  const all = await getAllDocs();
  await set(DOCS_KEY, all.filter((d) => d.id !== docId));
  await deleteByDocId(docId);
}

// ---------- Ingest ----------

export interface IngestOptions {
  folderId: string;
  name: string;
  text: string;
  sourceType: 'file' | 'url' | 'paste';
  apiKey: string;
  baseUrl?: string;
  embeddingModel?: string;
  onProgress?: (step: 'chunking' | 'embedding' | 'indexing', pct: number) => void;
}

export async function ingestDocument(opts: IngestOptions): Promise<KnowledgeDoc> {
  const { folderId, name, text, sourceType, apiKey, baseUrl, embeddingModel, onProgress } = opts;

  // 1. Chunk
  onProgress?.('chunking', 0);
  const chunks = chunkText(text);
  onProgress?.('chunking', 100);

  // 2. Embed
  onProgress?.('embedding', 0);
  const embeddings = await embedTexts(chunks, {
    apiKey,
    baseUrl,
    model: embeddingModel,
  });
  onProgress?.('embedding', 100);

  // 3. Create doc record
  const docId = uid();
  const doc: KnowledgeDoc = {
    id: docId,
    folderId,
    name,
    sourceType,
    charCount: text.length,
    chunkCount: chunks.length,
    createdAt: Date.now(),
  };

  const allDocs = await getAllDocs();
  await set(DOCS_KEY, [doc, ...allDocs]);

  // 4. Insert into Orama
  onProgress?.('indexing', 0);
  const oramaChunks: KnowledgeChunk[] = chunks.map((chunkText, i) => ({
    folderId,
    docId,
    docName: name,
    chunkIndex: i,
    text: chunkText,
    embedding: embeddings[i],
  }));
  await insertChunks(oramaChunks);
  onProgress?.('indexing', 100);

  return doc;
}

// ---------- Query ----------

export async function queryKnowledge(
  question: string,
  apiKey: string,
  opts: { folderId?: string; limit?: number; baseUrl?: string; embeddingModel?: string } = {},
): Promise<KnowledgeSearchResult[]> {
  const totalChunks = await getChunkCount();
  if (totalChunks === 0) return [];

  const embedding = await embedQuery(question, {
    apiKey,
    baseUrl: opts.baseUrl,
    model: opts.embeddingModel,
  });
  return searchKnowledge(embedding, question, {
    limit: opts.limit ?? 5,
    folderId: opts.folderId,
  });
}

// ---------- Stats ----------

export async function knowledgeStats(): Promise<{
  folders: number;
  docs: number;
  chunks: number;
}> {
  const folders = await listFolders();
  const docs = await getAllDocs();
  const chunks = await getChunkCount();
  return { folders: folders.length, docs: docs.length, chunks };
}

// Re-export types for convenience
export type { KnowledgeFolder, KnowledgeDoc, KnowledgeSearchResult } from './types';
