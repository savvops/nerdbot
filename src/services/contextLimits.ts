import type { Settings } from './types';
import { activeModel, activeProvider } from './config';

/**
 * Best-effort lookup of a model's max context window in tokens.
 * When unknown, falls back to a safe default per provider.
 */
const KNOWN: Array<[RegExp, number]> = [
  // Gemini family — see https://ai.google.dev/gemini-api/docs/models
  [/^gemini-(2\.5|3)\.\d?-pro/, 2_000_000],
  [/^gemini-3\.\d?-pro/, 2_000_000],
  [/^gemini-(2|2\.0|2\.5|3|3\.1)-?(flash|flash-lite)/, 1_000_000],
  [/^gemini-2\.0-flash-preview-image-generation/, 32_000],
  [/^gemini-.*-image-preview/, 32_000],
  [/^imagen/, 480], // text prompt only
  // OpenAI / OpenRouter
  [/^gpt-4o(?:-mini)?/, 128_000],
  [/^gpt-4-turbo/, 128_000],
  [/^o1/, 200_000],
  [/^claude-3\.7|claude-3\.5/, 200_000],
  [/^claude-3-opus/, 200_000],
  // Common local
  [/^qwen2\.5-(?:7b|32b)/, 32_768],
  [/^llama-?3\.1/, 128_000],
  [/^llama-?3\.2/, 128_000],
  [/^llama-?3/, 8_192],
];

const PROVIDER_FALLBACK: Record<string, number> = {
  gemini: 1_000_000,
  openai: 128_000,
  openrouter: 128_000,
  lmstudio: 8_192,
  ollama: 8_192,
};

export function contextWindowFor(model: string, providerId: string): number {
  const m = model.trim().toLowerCase();
  for (const [re, tokens] of KNOWN) {
    if (re.test(m)) return tokens;
  }
  return PROVIDER_FALLBACK[providerId] ?? 32_000;
}

export function activeContextWindow(settings: Settings): number {
  return contextWindowFor(activeModel(settings), activeProvider(settings).id);
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(n);
}
