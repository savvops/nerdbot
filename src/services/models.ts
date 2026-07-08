import { DEFAULT_SETTINGS } from "./config";
import type { ProviderConfig, ProviderId } from "./types";

export interface ModelInfo {
  id: string;
  label: string;
}

export interface ModelFetchResult {
  models: ModelInfo[];
  source: "live" | "fallback";
  error?: string;
}

/** Light, non-crypto string hash so we never place a raw API key in a cache key. */
function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

/** Turn a raw model id into a slightly more readable label (used for fallbacks). */
function humanize(id: string): string {
  return id
    .replace(/[-_]+/g, " ")
    .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Fetch the live model list for a provider.
 * Throws on failure — on a non-ok HTTP status the thrown Error carries `.status`
 * so validateApiKey can map it to a user-facing message.
 */
export async function fetchModels(cfg: ProviderConfig): Promise<ModelInfo[]> {
  switch (cfg.id) {
    case "gemini": {
      const url = `${cfg.baseUrl}/models?key=${encodeURIComponent(cfg.apiKey)}&pageSize=1000`;
      const res = await fetch(url);
      if (!res.ok) throw Object.assign(new Error("http"), { status: res.status });
      const json = await res.json();
      const raw: any[] = json.models ?? [];
      return raw
        .filter(
          (m) =>
            Array.isArray(m.supportedGenerationMethods) &&
            m.supportedGenerationMethods.includes("generateContent")
        )
        .map((m) => {
          const id = String(m.name ?? "").replace(/^models\//, "");
          return { id, label: m.displayName || id };
        })
        .filter((m) => m.id);
    }
    case "openai":
    case "lmstudio":
    case "ollama": {
      const res = await fetch(`${cfg.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
      });
      if (!res.ok) throw Object.assign(new Error("http"), { status: res.status });
      const json = await res.json();
      let ids: string[] = (json.data ?? [])
        .map((m: any) => m.id)
        .filter((id: any): id is string => typeof id === "string" && id.length > 0);
      if (cfg.id === "openai") {
        ids = ids.filter(
          (id) =>
            !/embedding|whisper|tts|dall-e|moderation|davinci|babbage|audio|realtime|transcribe/i.test(
              id
            )
        );
      }
      return ids.map((id) => ({ id, label: id }));
    }
    case "openrouter": {
      const res = await fetch(`${cfg.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
      });
      if (!res.ok) throw Object.assign(new Error("http"), { status: res.status });
      const json = await res.json();
      const raw: any[] = json.data ?? [];
      return raw
        .map((m) => ({ id: String(m.id ?? ""), label: m.name || String(m.id ?? "") }))
        .filter((m) => m.id)
        .sort((a, b) => a.id.localeCompare(b.id));
    }
    case "anthropic": {
      const res = await fetch(`${cfg.baseUrl}/models?limit=1000`, {
        headers: {
          "x-api-key": cfg.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
      });
      if (!res.ok) throw Object.assign(new Error("http"), { status: res.status });
      const json = await res.json();
      const raw: any[] = json.data ?? [];
      return raw
        .map((m) => ({ id: String(m.id ?? ""), label: m.display_name || String(m.id ?? "") }))
        .filter((m) => m.id);
    }
    default:
      return [];
  }
}

/**
 * Validate a provider's API key by attempting a live model fetch.
 * Returns the models on success; throws a user-displayable Error on failure.
 */
export async function validateApiKey(cfg: ProviderConfig): Promise<ModelInfo[]> {
  try {
    // OpenRouter's /models endpoint is public, so it won't reject a bad key.
    // Probe the authenticated /key endpoint first so validation is meaningful.
    if (cfg.id === "openrouter") {
      const res = await fetch(`${cfg.baseUrl}/key`, {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
      });
      if (!res.ok) throw Object.assign(new Error("http"), { status: res.status });
    }
    return await fetchModels(cfg);
  } catch (err: any) {
    const status: number | undefined = err?.status;
    if (status === 401 || status === 403) {
      throw new Error("Invalid API key");
    }
    if (status === 429) {
      throw new Error("Rate limited — the key looks valid, try again shortly");
    }
    const isNetwork =
      err?.name === "TypeError" || /failed to fetch/i.test(String(err?.message ?? ""));
    if (isNetwork) {
      let host = cfg.baseUrl;
      try {
        host = new URL(cfg.baseUrl).host;
      } catch {
        /* keep the raw base URL if it isn't a valid URL */
      }
      let msg = `Could not reach ${host} — check the base URL`;
      if (cfg.id === "lmstudio" || cfg.id === "ollama") {
        msg += " and that the local server is running";
      }
      throw new Error(msg);
    }
    throw new Error("Couldn't verify the key");
  }
}

interface CacheEntry {
  at: number;
  models: ModelInfo[];
}

const CACHE_TTL = 5 * 60 * 1000;
const modelCache = new Map<string, CacheEntry>();

function cacheKey(cfg: ProviderConfig): string {
  return `${cfg.id}|${cfg.baseUrl}|${djb2(cfg.apiKey)}`;
}

/**
 * Cached, never-throwing model lookup. Returns live models when reachable,
 * otherwise the provider's fallback list plus the underlying error message.
 */
export async function getAvailableModels(
  cfg: ProviderConfig,
  opts?: { force?: boolean }
): Promise<ModelFetchResult> {
  const key = cacheKey(cfg);
  if (!opts?.force) {
    const cached = modelCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL) {
      return { models: cached.models, source: "live" };
    }
  }
  try {
    const models = await fetchModels(cfg);
    modelCache.set(key, { at: Date.now(), models });
    return { models, source: "live" };
  } catch (err: any) {
    return {
      models: FALLBACK_MODELS[cfg.id],
      source: "fallback",
      error: String(err?.message ?? err),
    };
  }
}

/** Empty the in-memory model cache (e.g. after the user edits a key or base URL). */
export function clearModelCache(): void {
  modelCache.clear();
}

/** Build a deduped fallback list from the provider's fast/quality defaults + extras. */
function fallbackList(id: ProviderId, extra: string[]): ModelInfo[] {
  const p = DEFAULT_SETTINGS.providers[id];
  const seen = new Set<string>();
  const out: ModelInfo[] = [];
  for (const mid of [p.fastModel, p.qualityModel, ...extra]) {
    if (!mid || seen.has(mid)) continue;
    seen.add(mid);
    out.push({ id: mid, label: humanize(mid) });
  }
  return out;
}

/** Offline fallback model lists, seeded from current defaults plus well-known ids. */
export const FALLBACK_MODELS: Record<ProviderId, ModelInfo[]> = {
  gemini: fallbackList("gemini", ["gemini-2.0-flash"]),
  openai: fallbackList("openai", ["gpt-4o-mini", "gpt-4o", "o1-mini"]),
  openrouter: fallbackList("openrouter", [
    "openai/gpt-4o-mini",
    "google/gemini-2.0-flash-001",
  ]),
  lmstudio: fallbackList("lmstudio", []),
  ollama: fallbackList("ollama", []),
  anthropic: fallbackList("anthropic", ["claude-opus-4-5"]),
};
