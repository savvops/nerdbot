/**
 * Embeddings — generate vector embeddings via Gemini's embeddings API.
 *
 * Model name is configurable per-user via Settings. Default is text-embedding-004
 * for backward compatibility. Newer keys may need gemini-embedding-001 or similar.
 *
 * Batches up to 100 texts per request for efficiency.
 */

// Default chosen because text-embedding-004 returns 404 on most current Gemini keys.
// gemini-embedding-001 is the stable RAG-purpose embedding model and supports the
// outputDimensionality: 768 parameter our Orama store is configured for.
const DEFAULT_EMBED_MODEL = 'gemini-embedding-001';
const BATCH_SIZE = 100;
const DIMENSIONS = 768;

export { DIMENSIONS, DEFAULT_EMBED_MODEL };

export interface EmbedOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export async function embedTexts(
  texts: string[],
  optsOrApiKey: EmbedOptions | string,
  // Legacy positional args retained for back-compat:
  baseUrlArg = 'https://generativelanguage.googleapis.com/v1beta',
  modelArg?: string,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const opts: EmbedOptions =
    typeof optsOrApiKey === 'string'
      ? { apiKey: optsOrApiKey, baseUrl: baseUrlArg, model: modelArg }
      : optsOrApiKey;

  const apiKey = opts.apiKey;
  const baseUrl = opts.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  const model = (opts.model ?? DEFAULT_EMBED_MODEL).trim() || DEFAULT_EMBED_MODEL;

  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const url = `${baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(
      model,
    )}:batchEmbedContents?key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: batch.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          outputDimensionality: DIMENSIONS,
        })),
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(
        `Embedding API error (${res.status}) using model "${model}": ${errText || res.statusText}\n\nFix: open Settings and try a different "Embedding model" (e.g. gemini-embedding-001).`,
      );
    }

    const data = await res.json();
    const embeddings: number[][] = data.embeddings.map(
      (e: { values: number[] }) => e.values,
    );
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}

/** Embed a single query string. */
export async function embedQuery(
  text: string,
  optsOrApiKey: EmbedOptions | string,
  baseUrlArg?: string,
  modelArg?: string,
): Promise<number[]> {
  const [embedding] = await embedTexts([text], optsOrApiKey, baseUrlArg, modelArg);
  return embedding;
}
