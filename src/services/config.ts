import { get, set } from "./storage";
import {
  DEFAULT_SEARCH_SETTINGS,
  normalizeSearchSettings,
} from "./searchProviders";
import type { ProviderConfig, ProviderId, Settings } from "./types";

const SETTINGS_KEY = "nerdbot.settings.v1";

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  gemini: "Google Gemini",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  nvidia: "NVIDIA NIM",
  lmstudio: "LM Studio",
  ollama: "Ollama",
  anthropic: "Anthropic",
};

export const PROVIDER_ACCESS_LABELS: Record<ProviderId, string> = {
  gemini: "API · free tier available",
  openai: "Paid API",
  openrouter: "Free + paid models",
  nvidia: "Free prototyping · limits apply",
  lmstudio: "Local",
  ollama: "Local",
  anthropic: "Paid API",
};

export const PROVIDER_RECOMMENDATIONS: Record<ProviderId, string> = {
  gemini: "Start with a current Flash model for speed.",
  openai: "Use a mini model for fast mode and a larger model for quality.",
  openrouter: "openrouter/free routes across currently available free models; availability and limits can change.",
  nvidia: "Hosted NVIDIA models for prototyping. Account limits and model access vary; check NVIDIA for production terms. Jev is available only through the separate OpenRouter experiment.",
  lmstudio: "Use a loaded 7B–8B model for fast mode when your hardware is limited.",
  ollama: "Use a 3B–8B model for fast mode; choose a larger installed model for quality.",
  anthropic: "Use Haiku for fast mode and Sonnet for quality.",
};

export const PROVIDER_DOCS: Record<ProviderId, string> = {
  gemini: "https://aistudio.google.com/apikey",
  openai: "https://platform.openai.com/api-keys",
  openrouter: "https://openrouter.ai/keys",
  nvidia: "https://build.nvidia.com/settings/api-keys",
  lmstudio: "https://lmstudio.ai",
  ollama: "https://ollama.com",
  anthropic: "https://console.anthropic.com/settings/keys",
};

/** OpenRouter's zero-cost router, which selects an available free model per request. */
export const OPENROUTER_FREE_MODEL = "openrouter/free";

/** Rough $/1M tokens — used purely for the in-composer cost hint. */
export const PROVIDER_COST: Record<
  ProviderId,
  { fastIn: number; fastOut: number; qualityIn: number; qualityOut: number }
> = {
  gemini: { fastIn: 0.075, fastOut: 0.3, qualityIn: 1.25, qualityOut: 5 },
  openai: { fastIn: 0.15, fastOut: 0.6, qualityIn: 2.5, qualityOut: 10 },
  openrouter: { fastIn: 0.1, fastOut: 0.4, qualityIn: 3, qualityOut: 15 },
  nvidia: { fastIn: 0, fastOut: 0, qualityIn: 0, qualityOut: 0 },
  lmstudio: { fastIn: 0, fastOut: 0, qualityIn: 0, qualityOut: 0 },
  ollama: { fastIn: 0, fastOut: 0, qualityIn: 0, qualityOut: 0 },
  anthropic: { fastIn: 0.8, fastOut: 4, qualityIn: 3, qualityOut: 15 },
};

const defaultProviders = (): Record<ProviderId, ProviderConfig> => ({
  nvidia: {
    id: "nvidia",
    apiKey: "",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    fastModel: "nvidia/nemotron-3.5-lightning-30b-a3b",
    qualityModel: "nvidia/nemotron-3-super-120b-a12b",
    visionEnabled: false,
  },
  gemini: {
    id: "gemini",
    apiKey: "",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    fastModel: "gemini-3.5-flash",
    qualityModel: "gemini-3.1-pro",
    fastImageModel: "gemini-2.5-flash-image",
    qualityImageModel: "gemini-3.1-flash-image",
    fastAudioModel: "lyria-002",
    qualityAudioModel: "lyria-3-pro-preview",
    embeddingModel: "gemini-embedding-001",
  },
  openai: {
    id: "openai",
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    fastModel: "gpt-4o-mini",
    qualityModel: "gpt-4o",
    fastImageModel: "dall-e-3",
    qualityImageModel: "dall-e-3",
    fastAudioModel: "tts-1",
    qualityAudioModel: "tts-1-hd",
  },
  openrouter: {
    id: "openrouter",
    apiKey: "",
    baseUrl: "https://openrouter.ai/api/v1",
    fastModel: OPENROUTER_FREE_MODEL,
    qualityModel: OPENROUTER_FREE_MODEL,
  },
  lmstudio: {
    id: "lmstudio",
    apiKey: "lm-studio",
    baseUrl: "http://localhost:1234/v1",
    fastModel: "qwen2.5-7b-instruct",
    qualityModel: "qwen2.5-32b-instruct",
  },
  ollama: {
    id: "ollama",
    apiKey: "ollama",
    baseUrl: "http://localhost:11434/v1",
    fastModel: "llama3.2:3b",
    qualityModel: "llama3.1:8b",
  },
  anthropic: {
    id: "anthropic",
    apiKey: "",
    baseUrl: "https://api.anthropic.com/v1",
    fastModel: "claude-haiku-4-5-20251001",
    qualityModel: "claude-sonnet-4-6",
  },
});

export const DEFAULT_SETTINGS: Settings = {
  experimentalJev: false,
  activeProvider: "gemini",
  speed: "fast",
  temperature: 0.7,
  maxTokens: 4096,
  shareTab: true,
  webSearch: true,
  theme: "dark",
  providers: defaultProviders(),
  ragChunks: 5,
  maxContextTokens: 0,
  search: DEFAULT_SEARCH_SETTINGS,
};

export async function loadSettings(): Promise<Settings> {
  const stored = await get<Partial<Settings> | null>(SETTINGS_KEY, null);
  if (!stored) return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    // Merge each provider entry over its default so blobs persisted by older
    // schemas (missing apiKey, models, etc.) are backfilled field-by-field.
    providers: Object.fromEntries(
      Object.entries(DEFAULT_SETTINGS.providers).map(([id, def]) => [
        id,
        { ...def, ...((stored.providers as Record<string, object> | undefined)?.[id] ?? {}) },
      ]),
    ) as Settings["providers"],
    search: normalizeSearchSettings(stored.search),
  } as Settings;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await set(SETTINGS_KEY, settings);
}

export function activeModel(settings: Settings): string {
  const p = settings.providers[settings.activeProvider];
  return settings.speed === "fast" ? p.fastModel : p.qualityModel;
}

export function activeProvider(settings: Settings): ProviderConfig {
  return settings.providers[settings.activeProvider];
}

/** True when the selected model is explicitly zero-cost. */
export function isFreeModel(providerId: ProviderId, model: string): boolean {
  if (providerId === "lmstudio" || providerId === "ollama") return true;
  if (providerId !== "openrouter") return false;
  const id = model.trim().toLowerCase();
  return id === OPENROUTER_FREE_MODEL || id.endsWith(":free");
}

export function isVisionCapable(settings: Settings): boolean {
  const p = settings.activeProvider;
  if (
    p === "gemini" ||
    p === "openai" ||
    p === "openrouter" ||
    p === "anthropic"
  )
    return true;
  // Local providers: opt-in when user enables a multimodal model (llava, qwen2-vl, etc.)
  return !!settings.providers[p].visionEnabled;
}

export function isSearchCapable(_settings: Settings): boolean {
  // All providers support web search: Gemini via native grounding, others via Jina injection.
  return true;
}

/** True only for Gemini, which gets native Google grounding rather than injected results. */
export function hasNativeSearch(settings: Settings): boolean {
  return settings.activeProvider === "gemini";
}

/** Known context window sizes (tokens) by provider. Conservative defaults. */
export const CONTEXT_WINDOW: Record<ProviderId, number> = {
  nvidia: 32_000,
  gemini: 1_000_000,
  openai: 128_000,
  openrouter: 128_000,
  lmstudio: 32_000,
  ollama: 32_000,
  anthropic: 200_000,
};

/** Get the effective max context tokens for the current settings.
 *  If the user set a custom maxContextTokens, use that; otherwise use the provider default. */
export function getMaxContext(settings: Settings): number {
  if (settings.maxContextTokens > 0) return settings.maxContextTokens;
  return CONTEXT_WINDOW[settings.activeProvider] ?? 128_000;
}
