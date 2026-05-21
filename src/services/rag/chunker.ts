/**
 * Chunker — splits raw text into overlapping chunks for embedding.
 *
 * Uses a simple sliding-window approach by character count (not tokens)
 * with sentence-boundary snapping for cleaner chunks.
 */

const DEFAULT_CHUNK_SIZE = 1200;   // ~300 tokens worth of chars
const DEFAULT_OVERLAP = 200;       // overlap between consecutive chunks

export interface ChunkOptions {
  size?: number;
  overlap?: number;
}

export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const size = Math.max(1, opts.size ?? DEFAULT_CHUNK_SIZE);
  const overlap = Math.max(0, opts.overlap ?? DEFAULT_OVERLAP);

  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (cleaned.length <= size) return [cleaned];

  const chunks: string[] = [];
  let start = 0;

  while (start < cleaned.length) {
    let end = Math.min(start + size, cleaned.length);

    // Try to snap to the end of a sentence if possible
    if (end < cleaned.length) {
      const slice = cleaned.slice(start, end);
      const lastBreak = Math.max(
        slice.lastIndexOf('. '),
        slice.lastIndexOf('.\n'),
        slice.lastIndexOf('\n\n'),
      );
      if (lastBreak > size * 0.5) {
        end = start + lastBreak + 1;
      }
    }

    const chunk = cleaned.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);

    const nextStart = end - overlap;
    if (nextStart <= start) {
      start = end;
    } else {
      start = nextStart;
    }

    if (start >= cleaned.length) break;
    // Prevent infinite loop on very small text
    if (end >= cleaned.length) break;
  }

  return chunks;
}
