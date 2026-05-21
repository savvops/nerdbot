/**
 * Embeddings — generate vector embeddings via Gemini or any OpenAI-compatible API.
 *
 * Auto-detects the backend from the baseUrl:
 *   - googleapis.com / generativelanguage  → Gemini batchEmbedContents
 *   - anything else (localhost, openrouter, etc.) → OpenAI POST /embeddings
 *
 * For Ollama: `ollama pull nomic-embed-text` returns 768-dim vectors matching
 * the Orama store. For LM Studio: load any embedding model and set its name here.
 *
 * Batches up to 100 texts per request for efficiency.
 */

// Default chosen because text-embedding-004 returns 404 on most current Gemini keys.
// gemini-embedding-001 is the stable RAG-purpose embedding model and supports the
// outputDimensionality: 768 parameter our Orama store is configured for.
const DEFAULT_EMBED_MODEL = 'gemini-embedding-001';
const DEFAULT_LOCAL_EMBED_MODEL = 'nomic-embed-text';
const BATCH_SIZE = 100;
const DIMENSIONS = 768;

export { DIMENSIONS, DEFAULT_EMBED_MODEL };

export interface EmbedOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

function isGeminiUrl(baseUrl: string): boolean {
  return baseUrl.includes('googleapis.com') || baseUrl.includes('generativelanguage');
}

async function embedTextsGemini(
  texts: string[],
  apiKey: string,
  baseUrl: string,
  model: string,
): Promise<number[][]> {
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
        `Embedding API error (${res.status}) using model "${model}": ${errText || res.statusText}\n\nFix: open Settings → Gemini → Embedding model, or configure a local embedding model.`,
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

// OpenAI-compatible POST /v1/embeddings (works with Ollama, LM Studio, OpenAI, OpenRouter)
async function embedTextsOpenAI(
  texts: string[],
  apiKey: string,
  baseUrl: string,
  model: string,
): Promise<number[][]> {
  const url = `${baseUrl.replace(/\/$/, '')}/embeddings`;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey || 'none'}`,
      },
      body: JSON.stringify({ model, input: batch }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(
        `Embedding API error (${res.status}) using model "${model}": ${errText || res.statusText}\n\nFor Ollama: run "ollama pull nomic-embed-text". For LM Studio: load an embedding model and set its name in Settings.`,
      );
    }

    const data = await res.json();
    const embeddings: number[][] = data.data.map(
      (e: { embedding: number[] }) => e.embedding,
    );
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
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

  if (isGeminiUrl(baseUrl)) {
    const model = (opts.model ?? DEFAULT_EMBED_MODEL).trim() || DEFAULT_EMBED_MODEL;
    return embedTextsGemini(texts, apiKey, baseUrl, model);
  }

  // OpenAI-compatible endpoint (Ollama, LM Studio, etc.)
  const model = (opts.model ?? DEFAULT_LOCAL_EMBED_MODEL).trim() || DEFAULT_LOCAL_EMBED_MODEL;
  return embedTextsOpenAI(texts, apiKey, baseUrl, model);
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
