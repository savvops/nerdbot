import type { ProviderConfig, ProviderId, Settings } from "./types";
import { ensureLocalAiAccess } from "./permissions";

export type LocalProviderId = Extract<ProviderId, "lmstudio" | "ollama">;

export interface LocalProviderProbe {
  id: LocalProviderId;
  baseUrl: string;
  reachable: boolean;
  models: string[];
  message: string;
}

const LOCAL_PROVIDER_ORDER: LocalProviderId[] = ["ollama", "lmstudio"];
const TIMEOUT_MS = 3000;

function modelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data
    .map((entry) =>
      entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string"
        ? (entry as { id: string }).id
        : "",
    )
    .filter(Boolean);
}

async function probe(cfg: ProviderConfig): Promise<LocalProviderProbe> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/models`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        id: cfg.id as LocalProviderId,
        baseUrl: cfg.baseUrl,
        reachable: false,
        models: [],
        message: `Responded with HTTP ${response.status}`,
      };
    }
    const models = modelIds(await response.json());
    return {
      id: cfg.id as LocalProviderId,
      baseUrl: cfg.baseUrl,
      reachable: true,
      models,
      message: models.length
        ? `${models.length} model${models.length === 1 ? "" : "s"} ready`
        : "Server ready; load a model to chat",
    };
  } catch (error) {
    return {
      id: cfg.id as LocalProviderId,
      baseUrl: cfg.baseUrl,
      reachable: false,
      models: [],
      message:
        error instanceof DOMException && error.name === "AbortError"
          ? "No response within 3 seconds"
          : "Not detected on the default localhost endpoint",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Ask only for localhost access, then probe the documented OpenAI-compatible
 * endpoints. This must be called from a user gesture; no scan runs at startup.
 */
export async function detectLocalProviders(
  settings: Settings,
): Promise<{ permissionGranted: boolean; results: LocalProviderProbe[] }> {
  const permissionGranted = await ensureLocalAiAccess();
  if (!permissionGranted) return { permissionGranted, results: [] };
  const results = await Promise.all(
    LOCAL_PROVIDER_ORDER.map((id) => probe(settings.providers[id])),
  );
  return { permissionGranted, results };
}

export function preferredLocalModels(result: LocalProviderProbe): {
  fastModel: string;
  qualityModel: string;
} {
  const models = result.models;
  const small = models.find((id) => /3b|7b|8b|mini|small|flash/i.test(id));
  const large = models.find((id) => /14b|27b|32b|70b|large|pro/i.test(id));
  const first = small ?? models[0];
  const second = large ?? models[1] ?? first;
  return {
    fastModel: first ?? "",
    qualityModel: second ?? first ?? "",
  };
}
