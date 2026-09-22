import { get, set } from "./storage";
import {
  DEFAULT_SEARCH_SETTINGS,
  normalizeSearchSettings,
} from "./searchProviders";
import type { CustomAgentEndpoint, ProviderConfig, ProviderId, Settings } from "./types";

const SETTINGS_KEY = "nerdbot.settings.v1";

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  gemini: "Google Gemini",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  lmstudio: "LM Studio",
  ollama: "Ollama",
  anthropic: "Anthropic",
  custom_agent: "Custom Agent",
};

export const PROVIDER_DOCS: Record<ProviderId, string> = {
  gemini: "https://aistudio.google.com/apikey",
  openai: "https://platform.openai.com/api-keys",
  openrouter: "https://openrouter.ai/keys",
  lmstudio: "https://lmstudio.ai",
  ollama: "https://ollama.com",
  anthropic: "https://console.anthropic.com/settings/keys",
  custom_agent: "https://github.com/savvops",
};

/** Rough $/1M tokens — used purely for the in-composer cost hint. */
export const PROVIDER_COST: Record<
  ProviderId,
  { fastIn: number; fastOut: number; qualityIn: number; qualityOut: number }
> = {
  gemini: { fastIn: 0.075, fastOut: 0.3, qualityIn: 1.25, qualityOut: 5 },
  openai: { fastIn: 0.15, fastOut: 0.6, qualityIn: 2.5, qualityOut: 10 },
  openrouter: { fastIn: 0.1, fastOut: 0.4, qualityIn: 3, qualityOut: 15 },
  lmstudio: { fastIn: 0, fastOut: 0, qualityIn: 0, qualityOut: 0 },
  ollama: { fastIn: 0, fastOut: 0, qualityIn: 0, qualityOut: 0 },
  anthropic: { fastIn: 0.8, fastOut: 4, qualityIn: 3, qualityOut: 15 },
  custom_agent: { fastIn: 0, fastOut: 0, qualityIn: 0, qualityOut: 0 },
};

export const DEFAULT_CUSTOM_AGENTS: CustomAgentEndpoint[] = [
  {
    id: "hermes-legion",
    name: "Hermes Legion",
    baseUrl: "http://localhost:8000/v1",
    apiKey: "",
    model: "hermes-3",
    description: "Local Legion Workstation Node",
  },
  {
    id: "hermes-nukbox",
    name: "Hermes Nukbox",
    baseUrl: "http://nukbox.local:8000/v1",
    apiKey: "",
    model: "hermes-3-llama-3.1-8b",
    description: "RTX 3060 Nukbox Personal Agent",
  },
  {
    id: "hermes-spine",
    name: "Hermes Spine",
    baseUrl: "http://spine.local:8000/v1",
    apiKey: "",
    model: "hermes-3-llama-3.1-8b",
    description: "Spine Personal Agent Node",
  },
  {
    id: "sao-core",
    name: "SAO Core",
    baseUrl: "http://localhost:4177/v1",
    apiKey: "",
    model: "sao-agent",
    description: "Savv Agent Office Orchestrator",
  },
  {
    id: "openclaw-eve",
    name: "OpenClaw / Eve",
    baseUrl: "http://localhost:18789/v1",
    apiKey: "",
    model: "default",
    description: "OpenClaw & Eve Agent Gateway",
  },
];

const defaultProviders = (): Record<ProviderId, ProviderConfig> => ({
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
    fastModel: "google/gemini-2.0-flash-001",
    qualityModel: "anthropic/claude-3.7-sonnet",
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
  custom_agent: {
    id: "custom_agent",
    apiKey: "",
    baseUrl: "http://localhost:8000/v1",
    fastModel: "default",
    qualityModel: "default",
  },
});

export const DEFAULT_SETTINGS: Settings = {
  activeProvider: "gemini",
  speed: "fast",
  temperature: 0.7,
  maxTokens: 4096,
  shareTab: true,
  webSearch: true,
  theme: "dark",
  providers: defaultProviders(),
  customAgents: DEFAULT_CUSTOM_AGENTS,
  activeCustomAgentId: "hermes-legion",
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
    customAgents:
      stored.customAgents && stored.customAgents.length > 0
        ? stored.customAgents
        : DEFAULT_CUSTOM_AGENTS,
    activeCustomAgentId:
      stored.activeCustomAgentId || DEFAULT_SETTINGS.activeCustomAgentId,
    search: normalizeSearchSettings(stored.search),
  } as Settings;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await set(SETTINGS_KEY, settings);
}

export function activeModel(settings: Settings): string {
  if (settings.activeProvider === "custom_agent" && settings.customAgents && settings.customAgents.length > 0) {
    const active =
      settings.customAgents.find((a) => a.id === settings.activeCustomAgentId) ||
      settings.customAgents[0];
    return active.model || "default";
  }
  const p = settings.providers[settings.activeProvider];
  return settings.speed === "fast" ? p.fastModel : p.qualityModel;
}

export function activeProvider(settings: Settings): ProviderConfig {
  if (settings.activeProvider === "custom_agent" && settings.customAgents && settings.customAgents.length > 0) {
    const active =
      settings.customAgents.find((a) => a.id === settings.activeCustomAgentId) ||
      settings.customAgents[0];
    const baseCfg = settings.providers.custom_agent ?? {
      id: "custom_agent",
      apiKey: "",
      baseUrl: active.baseUrl,
      fastModel: active.model || "default",
      qualityModel: active.model || "default",
    };
    return {
      ...baseCfg,
      baseUrl: active.baseUrl || baseCfg.baseUrl,
      apiKey: active.apiKey !== undefined ? active.apiKey : baseCfg.apiKey,
      fastModel: active.model || baseCfg.fastModel || "default",
      qualityModel: active.model || baseCfg.qualityModel || "default",
    };
  }
  return settings.providers[settings.activeProvider];
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
  gemini: 1_000_000,
  openai: 128_000,
  openrouter: 128_000,
  lmstudio: 32_000,
  ollama: 32_000,
  anthropic: 200_000,
  custom_agent: 128_000,
};

/** Get the effective max context tokens for the current settings.
 *  If the user set a custom maxContextTokens, use that; otherwise use the provider default. */
export function getMaxContext(settings: Settings): number {
  if (settings.maxContextTokens > 0) return settings.maxContextTokens;
  return CONTEXT_WINDOW[settings.activeProvider] ?? 128_000;
}
