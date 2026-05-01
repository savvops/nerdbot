/** Types for the RAG knowledge system. */

export interface KnowledgeFolder {
  id: string;
  name: string;
  emoji: string;
  createdAt: number;
  /** Optional — when set, this folder behaves as a Project (chats can live inside it). */
  description?: string;
  /** Optional — prepended to the system prompt for chats inside this project. */
  systemPrompt?: string;
}

export interface KnowledgeDoc {
  id: string;
  folderId: string;
  name: string;
  sourceType: 'file' | 'url' | 'paste';
  /** Total character count of the raw text. */
  charCount: number;
  chunkCount: number;
  createdAt: number;
}

export interface KnowledgeChunk {
  /** Orama doc id (auto-assigned). */
  folderId: string;
  docId: string;
  docName: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
}

export interface KnowledgeSearchResult {
  text: string;
  docName: string;
  score: number;
}
