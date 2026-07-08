// Live provider smoke test — run LOCALLY where network + keys are available.
//
//   node scripts/live-provider-test.mjs
//
// Reads keys from process.env or a .env file in the current directory:
//   GEMINI_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, ANTHROPIC_API_KEY
//   (optional local: LMSTUDIO_BASE_URL, OLLAMA_BASE_URL)
//
// It mirrors the model-discovery + key-validation logic in
// src/services/models.ts (fetchModels / validateApiKey), so a PASS here means
// the extension's onboarding validation and Settings model dropdowns will work
// for that provider. This does NOT import the extension source (that pulls in
// chrome.* APIs) — keep it in sync with models.ts if that file changes.

import { readFileSync } from "node:fs";

// --- tiny .env loader (no dependency) ---
try {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* no .env next to the repo root — rely on process.env */
}

const DEFAULT_BASE = {
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  anthropic: "https://api.anthropic.com/v1",
  lmstudio: process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1",
  ollama: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
};

// Mirrors fetchModels() in src/services/models.ts.
async function fetchModels(id, baseUrl, apiKey) {
  const httpErr = (res) => Object.assign(new Error("http"), { status: res.status });
  switch (id) {
    case "gemini": {
      const res = await fetch(`${baseUrl}/models?key=${encodeURIComponent(apiKey)}&pageSize=1000`);
      if (!res.ok) throw httpErr(res);
      const json = await res.json();
      return (json.models ?? [])
        .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
        .map((m) => ({ id: String(m.name ?? "").replace(/^models\//, ""), label: m.displayName || m.name }))
        .filter((m) => m.id);
    }
    case "openai":
    case "lmstudio":
    case "ollama": {
      const res = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!res.ok) throw httpErr(res);
      const json = await res.json();
      let ids = (json.data ?? []).map((m) => m.id).filter((x) => typeof x === "string" && x.length > 0);
      if (id === "openai") ids = ids.filter((x) => !/embedding|whisper|tts|dall-e|moderation|davinci|babbage|audio|realtime|transcribe/i.test(x));
      return ids.map((x) => ({ id: x, label: x }));
    }
    case "openrouter": {
      const res = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!res.ok) throw httpErr(res);
      const json = await res.json();
      return (json.data ?? [])
        .map((m) => ({ id: String(m.id ?? ""), label: m.name || String(m.id ?? "") }))
        .filter((m) => m.id)
        .sort((a, b) => a.id.localeCompare(b.id));
    }
    case "anthropic": {
      const res = await fetch(`${baseUrl}/models?limit=1000`, {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
      });
      if (!res.ok) throw httpErr(res);
      const json = await res.json();
      return (json.data ?? [])
        .map((m) => ({ id: String(m.id ?? ""), label: m.display_name || String(m.id ?? "") }))
        .filter((m) => m.id);
    }
    default:
      return [];
  }
}

// Mirrors validateApiKey() — including the OpenRouter authenticated /key probe.
async function validateApiKey(id, baseUrl, apiKey) {
  if (id === "openrouter") {
    const res = await fetch(`${baseUrl}/key`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) throw Object.assign(new Error("http"), { status: res.status });
  }
  return fetchModels(id, baseUrl, apiKey);
}

const CASES = [
  { id: "gemini", key: process.env.GEMINI_API_KEY },
  { id: "openai", key: process.env.OPENAI_API_KEY },
  { id: "openrouter", key: process.env.OPENROUTER_API_KEY },
  { id: "anthropic", key: process.env.ANTHROPIC_API_KEY },
  { id: "lmstudio", key: "lm-studio", optional: true },
  { id: "ollama", key: "ollama", optional: true },
];

let failures = 0;
for (const c of CASES) {
  const base = DEFAULT_BASE[c.id];
  if (!c.key) {
    console.log(`○ ${c.id.padEnd(11)} skipped (no key set)`);
    continue;
  }
  try {
    const models = await validateApiKey(c.id, base, c.key);
    if (!models.length) throw new Error("no chat models returned");
    console.log(`✓ ${c.id.padEnd(11)} ${String(models.length).padStart(4)} models  e.g. ${models.slice(0, 3).map((m) => m.id).join(", ")}`);
  } catch (err) {
    // Local providers being offline is expected, not a failure.
    if (c.optional && (err?.name === "TypeError" || /fetch failed/i.test(String(err?.message)))) {
      console.log(`○ ${c.id.padEnd(11)} offline (local server not running) — ok`);
      continue;
    }
    failures++;
    console.log(`✗ ${c.id.padEnd(11)} FAILED: ${err?.status ? "HTTP " + err.status : err?.message}`);
  }
}

console.log(failures ? `\n${failures} provider(s) failed.` : "\nAll configured providers validated.");
process.exit(failures ? 1 : 0);
