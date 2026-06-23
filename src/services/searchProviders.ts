import type { SearchProviderId, SearchSettings } from "./types";

export type { SearchProviderId, SearchSettings } from "./types";

export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
  source?: SearchProviderId;
}

export const DEFAULT_SEARCH_SETTINGS: SearchSettings = {
  provider: "jina",
  searxngUrl: "http://localhost:8080",
  fallbackProviders: ["searxng", "duckduckgo"],
  maxResults: 8,
  fetchTopPages: false,
  maxFetchedPages: 3,
};

const SEARCH_PROVIDERS: SearchProviderId[] = ["searxng", "jina", "duckduckgo"];

export function normalizeSearchSettings(
  settings?: Partial<SearchSettings> | null,
): SearchSettings {
  const merged = { ...DEFAULT_SEARCH_SETTINGS, ...(settings ?? {}) };
  const provider = SEARCH_PROVIDERS.includes(merged.provider)
    ? merged.provider
    : DEFAULT_SEARCH_SETTINGS.provider;
  const fallbackProviders = (
    merged.fallbackProviders ?? DEFAULT_SEARCH_SETTINGS.fallbackProviders
  ).filter((p) => SEARCH_PROVIDERS.includes(p));
  return {
    provider,
    searxngUrl: trimTrailingSlash(
      merged.searxngUrl || DEFAULT_SEARCH_SETTINGS.searxngUrl,
    ),
    fallbackProviders,
    maxResults: clampNumber(
      merged.maxResults,
      1,
      20,
      DEFAULT_SEARCH_SETTINGS.maxResults,
    ),
    fetchTopPages: Boolean(merged.fetchTopPages),
    maxFetchedPages: clampNumber(
      merged.maxFetchedPages,
      1,
      10,
      DEFAULT_SEARCH_SETTINGS.maxFetchedPages,
    ),
  };
}

export function resolveSearchProviderOrder(
  settings?: Partial<SearchSettings> | null,
): SearchProviderId[] {
  const normalized = normalizeSearchSettings(settings);
  return uniqueProviders([
    normalized.provider,
    ...normalized.fallbackProviders,
  ]);
}

export function parseSearxngResults(data: any): SearchResult[] {
  const rows: any[] = Array.isArray(data?.results) ? data.results : [];
  return rows
    .map((row: any): SearchResult | null => {
      const title = cleanText(String(row?.title ?? ""));
      const url = String(row?.url ?? "").trim();
      const snippet = cleanText(String(row?.content ?? row?.snippet ?? ""));
      if (!title || !isHttpUrl(url)) return null;
      return { title, url, ...(snippet ? { snippet } : {}), source: "searxng" };
    })
    .filter((r: SearchResult | null): r is SearchResult => Boolean(r))
    .filter((r, idx, all) => all.findIndex((x) => x.url === r.url) === idx);
}

export async function searchSearxng(
  query: string,
  settings?: Partial<SearchSettings> | null,
): Promise<SearchResult[]> {
  const normalized = normalizeSearchSettings(settings);
  const base = normalized.searxngUrl;
  if (!base) return [];
  const url = `${base}/search?q=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return parseSearxngResults(data).slice(0, normalized.maxResults);
}

export function formatSearchResults(
  query: string,
  results: SearchResult[],
): string {
  if (results.length === 0) return "";
  const lines = results.map((r, idx) => {
    const snippet = r.snippet ? `\nSnippet: ${r.snippet}` : "";
    const source = r.source ? `\nProvider: ${r.source}` : "";
    return `[${idx + 1}] ${r.title}\nURL: ${r.url}${source}${snippet}`;
  });
  return `Search results for: "${query}"\n\n${lines.join("\n\n")}`;
}

function uniqueProviders(providers: SearchProviderId[]): SearchProviderId[] {
  const seen = new Set<SearchProviderId>();
  return providers.filter((p) => {
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });
}

function clampNumber(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
