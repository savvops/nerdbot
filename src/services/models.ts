import {
  DEFAULT_SETTINGS,
  isFreeModel,
  OPENROUTER_FREE_MODEL,
} from "./config";
import type { ProviderConfig, ProviderId } from "./types";

export interface ModelInfo {
  id: string;
  label: string;
  methods?: string[];
  inputModalities?: string[];
  outputModalities?: string[];
}

export interface ModelFetchResult {
  /** Chat/text-generation models only. */
  models: ModelInfo[];
  imageModels: ModelInfo[];
  audioModels: ModelInfo[];
  source: "live" | "fallback";
  error?: string;
}

export interface ModelCatalog {
  chat: ModelInfo[];
  image: ModelInfo[];
  audio: ModelInfo[];
}

const IMAGE_MODEL = /(^|[\/_:.-])(imagen|image|images|dall[\s_-]?e|flux|recraft|ideogram|stable[\s_-]?diffusion)([\/_:.-]|$)/i;
const AUDIO_MODEL = /(^|[\/_:.-])(audio|tts|speech|lyria|musicgen|music)([\/_:.-]|$)/i;
const NON_CHAT_MODEL = /embed|embedding|moderation|rerank|reward|guard|safety|transcribe|whisper|parse|gliner|davinci|babbage/i;

function dedupe(models: ModelInfo[]): ModelInfo[] {
  const seen = new Set<string>();
  return models.filter((model) => model.id && !seen.has(model.id) && !!seen.add(model.id));
}

/** Classify a provider catalog so media-only models never appear in chat pickers. */
export function categorizeModels(models: ModelInfo[]): ModelCatalog {
  const chat: ModelInfo[] = [];
  const image: ModelInfo[] = [];
  const audio: ModelInfo[] = [];
  for (const model of models) {
    const searchable = `${model.id} ${model.label}`;
    const outputs = (model.outputModalities ?? []).map((value) => value.toLowerCase());
    const methods = (model.methods ?? []).map((value) => value.toLowerCase());
    const isImage = outputs.includes("image") || IMAGE_MODEL.test(searchable);
    const isAudio = outputs.includes("audio") || AUDIO_MODEL.test(searchable);
    if (isImage) image.push(model);
    if (isAudio) audio.push(model);
    const isMediaOnly = isImage || isAudio;
    const supportsText = outputs.length === 0 || outputs.includes("text");
    const supportsChatMethod = methods.length === 0 || methods.includes("generatecontent") || methods.includes("chat.completions");
    if (!isMediaOnly && supportsText && supportsChatMethod && !NON_CHAT_MODEL.test(searchable)) chat.push(model);
  }
  return { chat: dedupe(chat), image: dedupe(image), audio: dedupe(audio) };
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
async function fetchRawModels(cfg: ProviderConfig): Promise<ModelInfo[]> {
  switch (cfg.id) {
    case "gemini": {
      const url = `${cfg.baseUrl}/models?key=${encodeURIComponent(cfg.apiKey)}&pageSize=1000`;
      const res = await fetch(url);
      if (!res.ok) throw Object.assign(new Error("http"), { status: res.status });
      const json = await res.json();
      const raw: any[] = json.models ?? [];
      return raw
        .map((m) => {
          const id = String(m.name ?? "").replace(/^models\//, "");
          return {
            id,
            label: m.displayName || id,
            methods: Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [],
          };
        })
        .filter((m) => m.id);
    }
    case "openai":
    case "nvidia":
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
        .filter((m) => !/^~?typesafe\/jev/i.test(String(m.id ?? '')))
        .map((m) => {
          const id = String(m.id ?? "");
          const baseLabel = m.name || id;
          return {
            id,
            label: isFreeModel("openrouter", id)
              ? `${baseLabel} · Free`
              : baseLabel,
            inputModalities: Array.isArray(m.architecture?.input_modalities) ? m.architecture.input_modalities : [],
            outputModalities: Array.isArray(m.architecture?.output_modalities) ? m.architecture.output_modalities : [],
          };
        })
        .filter((m) => m.id)
        .sort((a, b) => {
          if (a.id === OPENROUTER_FREE_MODEL) return -1;
          if (b.id === OPENROUTER_FREE_MODEL) return 1;
          const freeDelta = Number(isFreeModel("openrouter", b.id)) - Number(isFreeModel("openrouter", a.id));
          return freeDelta || a.id.localeCompare(b.id);
        });
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

export async function fetchModelCatalog(cfg: ProviderConfig): Promise<ModelCatalog> {
  return categorizeModels(await fetchRawModels(cfg));
}

/** Backward-compatible chat-only model lookup used by connection validation. */
export async function fetchModels(cfg: ProviderConfig): Promise<ModelInfo[]> {
  return (await fetchModelCatalog(cfg)).chat;
}

/**
 * Validate a provider's API key by attempting a live model fetch.
 * Returns the models on success; throws a user-displayable Error on failure.
 */
export async function validateApiKey(cfg: ProviderConfig): Promise<ModelInfo[]> {
  try {
    // NVIDIA's catalog is public. Verify model access with a minimal generation.
    if (cfg.id === "nvidia") {
      const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: cfg.fastModel, messages: [{ role: "user", content: "Hi" }], max_tokens: 1, stream: false }),
      });
      if (!res.ok) throw Object.assign(new Error("http"), { status: res.status });
    }
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
  catalog: ModelCatalog;
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
      return {
        models: cached.catalog.chat,
        imageModels: cached.catalog.image,
        audioModels: cached.catalog.audio,
        source: "live",
      };
    }
  }
  try {
    const catalog = await fetchModelCatalog(cfg);
    modelCache.set(key, { at: Date.now(), catalog });
    return {
      models: catalog.chat,
      imageModels: catalog.image,
      audioModels: catalog.audio,
      source: "live",
    };
  } catch (err: any) {
    const catalog = FALLBACK_MODEL_CATALOGS[cfg.id];
    return {
      models: catalog.chat,
      imageModels: catalog.image,
      audioModels: catalog.audio,
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

function fallbackMediaList(id: ProviderId, kind: "image" | "audio"): ModelInfo[] {
  const provider = DEFAULT_SETTINGS.providers[id];
  const values = kind === "image"
    ? [provider.fastImageModel, provider.qualityImageModel]
    : [provider.fastAudioModel, provider.qualityAudioModel];
  return dedupe(values.filter((value): value is string => !!value).map((value) => ({ id: value, label: humanize(value) })));
}

/** Offline fallback model lists, seeded from current defaults plus well-known ids. */
export const FALLBACK_MODELS: Record<ProviderId, ModelInfo[]> = {
  nvidia: fallbackList("nvidia", ["openai/gpt-oss-20b"]),
  gemini: fallbackList("gemini", ["gemini-2.0-flash"]),
  openai: fallbackList("openai", ["gpt-4o-mini", "gpt-4o", "o1-mini"]),
  openrouter: fallbackList("openrouter", [
    OPENROUTER_FREE_MODEL,
    "openai/gpt-4o-mini",
    "google/gemini-2.0-flash-001",
  ]),
  lmstudio: fallbackList("lmstudio", []),
  ollama: fallbackList("ollama", []),
  anthropic: fallbackList("anthropic", ["claude-opus-4-5"]),
};

export const FALLBACK_MODEL_CATALOGS: Record<ProviderId, ModelCatalog> = Object.fromEntries(
  (Object.keys(FALLBACK_MODELS) as ProviderId[]).map((id) => [id, {
    chat: FALLBACK_MODELS[id],
    image: fallbackMediaList(id, "image"),
    audio: fallbackMediaList(id, "audio"),
  }]),
) as Record<ProviderId, ModelCatalog>;
