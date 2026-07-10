import { useState, useEffect, useRef } from "react";
import {
  ExternalLink,
  Eye,
  EyeOff,
  X,
  Plus,
  Trash2,
  Check,
  Pencil,
  Bug,
  RefreshCw,
} from "lucide-react";
import type {
  ProviderId,
  SearchProviderId,
  Settings,
  Soul,
} from "../../services/types";
import { PROVIDER_DOCS, PROVIDER_LABELS } from "../../services/config";
import { memoryProvider } from "../../services/memoryProvider";
import { DEFAULT_SOUL_PROMPT } from "../../services/souls";
import ModelSelect from "./ModelSelect";
import {
  getAvailableModels,
  clearModelCache,
  type ModelFetchResult,
} from "../../services/models";
import {
  hasAllUrls,
  requestAllUrls,
  ensureAllUrls,
  onPermissionsChanged,
} from "../../services/permissions";

interface Props {
  open: boolean;
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  souls: Soul[];
  onCreateSoul: (
    input: Pick<Soul, "name" | "emoji" | "systemPrompt">,
  ) => Promise<Soul>;
  onUpdateSoul: (
    id: string,
    patch: Partial<Pick<Soul, "name" | "emoji" | "systemPrompt">>,
  ) => Promise<void>;
  onDeleteSoul: (id: string) => Promise<void>;
  onSoulsChange: (souls: Soul[]) => void;
  onReportBug: () => void;
}

const PROVIDER_ORDER: ProviderId[] = [
  "gemini",
  "openai",
  "openrouter",
  "anthropic",
  "lmstudio",
  "ollama",
];
const SEARCH_PROVIDER_ORDER: SearchProviderId[] = [
  "jina",
  "searxng",
  "duckduckgo",
];
const SEARCH_PROVIDER_LABELS: Record<SearchProviderId, string> = {
  jina: "Jina Search",
  searxng: "SearXNG (self-hosted)",
  duckduckgo: "DuckDuckGo HTML",
};

export default function SettingsPanel({
  open,
  settings,
  onChange,
  onClose,
  souls,
  onCreateSoul,
  onUpdateSoul,
  onDeleteSoul,
  onReportBug,
}: Props) {
  const [showKey, setShowKey] = useState(false);

  const provider = settings.providers[settings.activeProvider];

  // Model list (live-fetched, debounced, cached in services/models.ts)
  const [modelList, setModelList] = useState<ModelFetchResult | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const forceModelsRef = useRef(false);

  useEffect(() => {
    // Only fetch while the panel is open — avoids an unsolicited /models call
    // on every app launch for already-configured users.
    if (!open) return;
    const cfg = provider;
    const isCloud =
      cfg.id === "gemini" ||
      cfg.id === "openai" ||
      cfg.id === "openrouter" ||
      cfg.id === "anthropic";
    // Cloud providers need a key before they'll list models — until then fall
    // back to just the current value + Custom in the picker.
    if (isCloud && !cfg.apiKey.trim()) {
      setModelList(null);
      setModelsLoading(false);
      return;
    }
    const force = forceModelsRef.current;
    forceModelsRef.current = false;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setModelsLoading(true);
      try {
        const res = await getAvailableModels(cfg, { force });
        if (!cancelled) setModelList(res);
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, provider.id, provider.baseUrl, provider.apiKey, refreshNonce]);

  const refreshModels = () => {
    clearModelCache();
    forceModelsRef.current = true;
    setModelsLoading(true);
    setRefreshNonce((n) => n + 1);
  };

  // Host ("<all_urls>") permission state — gates the search backends that
  // must fetch arbitrary sites (SearXNG / DuckDuckGo).
  const [hasHostAccess, setHasHostAccess] = useState(false);
  const [searchHint, setSearchHint] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    hasAllUrls().then((v) => {
      if (active) setHasHostAccess(v);
    });
    const unsub = onPermissionsChanged(() => {
      hasAllUrls().then((v) => {
        if (active) setHasHostAccess(v);
      });
    });
    return () => {
      active = false;
      unsub();
    };
  }, [open]);

  // Memory state
  const [facts, setFacts] = useState("");
  const [userProfile, setUserProfile] = useState("");
  const [factsSaved, setFactsSaved] = useState(false);
  const [userSaved, setUserSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    memoryProvider.loadFacts().then(setFacts);
    memoryProvider.loadUserProfile().then(setUserProfile);
  }, [open]);

  const saveFacts = async () => {
    await memoryProvider.saveFacts(facts);
    setFactsSaved(true);
    setTimeout(() => setFactsSaved(false), 1500);
  };

  const saveUserProfile = async () => {
    await memoryProvider.saveUserProfile(userProfile);
    setUserSaved(true);
    setTimeout(() => setUserSaved(false), 1500);
  };

  // Souls edit state
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmoji, setEditEmoji] = useState("");
  const [editPrompt, setEditPrompt] = useState("");

  const beginEdit = (soul: Soul) => {
    setEditingId(soul.id);
    setEditName(soul.name);
    setEditEmoji(soul.emoji);
    setEditPrompt(soul.systemPrompt);
  };

  const beginNew = () => {
    setEditingId("new");
    setEditName("");
    setEditEmoji("✨");
    setEditPrompt(DEFAULT_SOUL_PROMPT);
  };

  const cancelEdit = () => setEditingId(null);

  const commitEdit = async () => {
    if (!editName.trim() || !editPrompt.trim()) return;
    if (editingId === "new") {
      await onCreateSoul({
        name: editName.trim(),
        emoji: editEmoji || "✨",
        systemPrompt: editPrompt,
      });
    } else if (editingId) {
      await onUpdateSoul(editingId, {
        name: editName.trim(),
        emoji: editEmoji || "✨",
        systemPrompt: editPrompt,
      });
    }
    setEditingId(null);
  };

  if (!open) return null;

  const updateProvider = (patch: Partial<typeof provider>) => {
    onChange({
      ...settings,
      providers: {
        ...settings.providers,
        [settings.activeProvider]: { ...provider, ...patch },
      },
    });
  };

  const updateSearch = (patch: Partial<Settings["search"]>) => {
    onChange({
      ...settings,
      search: {
        ...settings.search,
        ...patch,
      },
    });
  };

  // SearXNG / DuckDuckGo fetch arbitrary sites, so they need "<all_urls>".
  // This runs from the <select> onChange (a user gesture), so it can prompt.
  const handleSearchProviderChange = async (next: SearchProviderId) => {
    if (next === "searxng" || next === "duckduckgo") {
      const has = await hasAllUrls();
      if (!has) {
        const granted = await requestAllUrls();
        if (granted) setHasHostAccess(true);
        else {
          setSearchHint(
            "Site access is needed for that search backend — keeping the previous provider.",
          );
          setTimeout(() => setSearchHint(null), 4000);
          return; // denied: don't switch
        }
      }
    }
    updateSearch({ provider: next });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/55 animate-fade-in flex items-stretch sm:items-center justify-end sm:justify-center p-0 sm:p-3">
      <div className="w-full sm:max-w-[420px] sm:rounded-2xl bg-surface border-l sm:border border-border shadow-2xl overflow-hidden flex flex-col h-full sm:max-h-[90vh] animate-slide-up">
        <div className="flex items-center justify-between px-4 h-12 border-b border-border">
          <div>
            <div className="text-[13.5px] font-semibold">Settings</div>
            <div className="text-[11px] text-muted">Provider, model, theme</div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-elevated"
          >
            <X size={14} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-5 flex-1">
          <Field label="Provider">
            <div className="grid grid-cols-2 gap-1.5">
              {PROVIDER_ORDER.map((id) => (
                <button
                  key={id}
                  onClick={() => {
                    onChange({ ...settings, activeProvider: id });
                    // Local providers fetch http://localhost from the extension
                    // origin; without the host grant those requests are
                    // CORS-blocked unless the server sets headers. Ask now,
                    // while we still have this click's gesture.
                    if (id === "lmstudio" || id === "ollama") {
                      void ensureAllUrls();
                    }
                  }}
                  className={`px-2.5 py-2 text-[12.5px] rounded-lg border transition-colors text-left ${
                    settings.activeProvider === id
                      ? "bg-accent/15 border-accent/50 text-ink"
                      : "bg-bg border-border text-muted hover:text-ink"
                  }`}
                >
                  {PROVIDER_LABELS[id]}
                </button>
              ))}
            </div>
          </Field>

          <Field
            label="API key"
            hint={
              <a
                href={PROVIDER_DOCS[provider.id]}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline inline-flex items-center gap-0.5"
              >
                Get key <ExternalLink size={10} />
              </a>
            }
          >
            <div className="flex items-center gap-1 bg-bg border border-border rounded-lg px-2.5 focus-within:border-accent/50">
              <input
                type={showKey ? "text" : "password"}
                value={provider.apiKey}
                onChange={(e) => updateProvider({ apiKey: e.target.value })}
                placeholder={
                  provider.id === "lmstudio" || provider.id === "ollama"
                    ? "Not required"
                    : "sk-…"
                }
                className="flex-1 py-2 text-[13px] outline-none"
              />
              <button
                onClick={() => setShowKey((v) => !v)}
                className="p-1 text-muted hover:text-ink"
                title={showKey ? "Hide" : "Show"}
              >
                {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </Field>

          <Field label="Base URL">
            <input
              value={provider.baseUrl}
              onChange={(e) => updateProvider({ baseUrl: e.target.value })}
              className="w-full bg-bg border border-border focus-within:border-accent/50 rounded-lg px-3 py-2 text-[13px] outline-none"
            />
            {(provider.id === "lmstudio" || provider.id === "ollama") && (
              <div className="text-[10.5px] text-soft mt-1">
                If requests fail with a CORS error, enable CORS in LM Studio's
                server settings or set{" "}
                <code className="text-ink/80">OLLAMA_ORIGINS</code> — or grant
                site access.
              </div>
            )}
          </Field>

          <div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fast model">
                <ModelSelect
                  value={provider.fastModel}
                  models={modelList?.models ?? []}
                  loading={modelsLoading}
                  onChange={(id) => updateProvider({ fastModel: id })}
                />
              </Field>
              <Field label="Quality model">
                <ModelSelect
                  value={provider.qualityModel}
                  models={modelList?.models ?? []}
                  loading={modelsLoading}
                  onChange={(id) => updateProvider({ qualityModel: id })}
                />
              </Field>
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[10.5px] text-soft">
                {modelsLoading
                  ? "Loading models…"
                  : modelList
                    ? `${modelList.models.length} models`
                    : "Models"}
              </span>
              <button
                type="button"
                onClick={refreshModels}
                disabled={modelsLoading}
                className="p-1 -mr-1 text-muted hover:text-ink rounded disabled:opacity-40"
                title="Refresh model list"
              >
                <RefreshCw
                  size={12}
                  className={modelsLoading ? "animate-spin" : ""}
                />
              </button>
            </div>
            {modelList?.source === "fallback" && (
              <div
                className="text-[10.5px] text-soft mt-0.5"
                title={modelList.error}
              >
                Couldn't fetch live models — showing known ones
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fast image model">
              <input
                value={provider.fastImageModel || ""}
                onChange={(e) =>
                  updateProvider({ fastImageModel: e.target.value })
                }
                placeholder="e.g. gemini-2.0-flash"
                className="w-full bg-bg border border-border rounded-lg px-2.5 py-2 text-[12.5px] outline-none"
              />
            </Field>
            <Field label="Quality image model">
              <input
                value={provider.qualityImageModel || ""}
                onChange={(e) =>
                  updateProvider({ qualityImageModel: e.target.value })
                }
                placeholder="e.g. imagen-3.0-generate-002"
                className="w-full bg-bg border border-border rounded-lg px-2.5 py-2 text-[12.5px] outline-none"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fast audio model">
              <input
                value={provider.fastAudioModel || ""}
                onChange={(e) =>
                  updateProvider({ fastAudioModel: e.target.value })
                }
                placeholder="e.g. gemini-2.0-flash"
                className="w-full bg-bg border border-border rounded-lg px-2.5 py-2 text-[12.5px] outline-none"
              />
            </Field>
            <Field label="Quality audio model">
              <input
                value={provider.qualityAudioModel || ""}
                onChange={(e) =>
                  updateProvider({ qualityAudioModel: e.target.value })
                }
                placeholder="e.g. gemini-2.5-pro"
                className="w-full bg-bg border border-border rounded-lg px-2.5 py-2 text-[12.5px] outline-none"
              />
            </Field>
          </div>

          {provider.id === "gemini" && (
            <Field label="Embedding model (for Knowledge Base / projects)">
              <input
                value={provider.embeddingModel || ""}
                onChange={(e) =>
                  updateProvider({ embeddingModel: e.target.value })
                }
                placeholder="e.g. gemini-embedding-001 or text-embedding-004"
                className="w-full bg-bg border border-border rounded-lg px-2.5 py-2 text-[12.5px] outline-none"
              />
              <div className="text-[10.5px] text-soft mt-1">
                Used to embed project files & queries. Leave blank for the
                default (
                <code className="text-ink/80">gemini-embedding-001</code>).
                Other options:{" "}
                <code className="text-ink/80">gemini-embedding-2</code>,{" "}
                <code className="text-ink/80">gemini-embedding-2-preview</code>.
                List your key's available models with{" "}
                <code className="text-ink/80">/v1beta/models</code>.
              </div>
            </Field>
          )}

          {(provider.id === "lmstudio" || provider.id === "ollama") && (
            <>
              <Field label="Vision / multimodal">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!provider.visionEnabled}
                    onChange={(e) =>
                      updateProvider({ visionEnabled: e.target.checked })
                    }
                    className="w-3.5 h-3.5 accent-[rgb(var(--nb-accent))]"
                  />
                  <span className="text-[12.5px] text-soft">
                    Enable image &amp; screenshot attachments (requires a
                    multimodal model like{" "}
                    <code className="text-ink/80">llava</code>,{" "}
                    <code className="text-ink/80">llama3.2-vision</code>, or{" "}
                    <code className="text-ink/80">qwen2-vl</code>)
                  </span>
                </label>
              </Field>

              <Field label="Embedding model (for Knowledge Base)">
                <input
                  value={provider.embeddingModel || ""}
                  onChange={(e) =>
                    updateProvider({ embeddingModel: e.target.value })
                  }
                  placeholder={
                    provider.id === "ollama"
                      ? "nomic-embed-text"
                      : "nomic-embed-text-v1.5"
                  }
                  className="w-full bg-bg border border-border rounded-lg px-2.5 py-2 text-[12.5px] outline-none"
                />
                <div className="text-[10.5px] text-soft mt-1">
                  Used when no Gemini key is configured. Returns 768-dim vectors
                  that match the knowledge store.
                  {provider.id === "ollama" && (
                    <>
                      {" "}
                      Run{" "}
                      <code className="text-ink/80">
                        ollama pull nomic-embed-text
                      </code>{" "}
                      first.
                    </>
                  )}
                </div>
              </Field>
            </>
          )}

          <Field label={`Temperature · ${settings.temperature.toFixed(2)}`}>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={settings.temperature}
              onChange={(e) =>
                onChange({ ...settings, temperature: Number(e.target.value) })
              }
              className="w-full accent-[rgb(var(--nb-accent))]"
            />
          </Field>

          <Field label={`Max tokens · ${settings.maxTokens}`}>
            <input
              type="range"
              min={256}
              max={16000}
              step={128}
              value={settings.maxTokens}
              onChange={(e) =>
                onChange({ ...settings, maxTokens: Number(e.target.value) })
              }
              className="w-full accent-[rgb(var(--nb-accent))]"
            />
          </Field>

          {/* ── Web Search ── */}
          <div className="border-t border-border pt-4">
            <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-3">
              Web Search
            </div>
            <div className="space-y-4">
              <Field label="Search provider">
                <select
                  value={settings.search.provider}
                  onChange={(e) =>
                    handleSearchProviderChange(
                      e.target.value as SearchProviderId,
                    )
                  }
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-[13px] outline-none"
                >
                  {SEARCH_PROVIDER_ORDER.map((id) => (
                    <option key={id} value={id}>
                      {SEARCH_PROVIDER_LABELS[id]}
                    </option>
                  ))}
                </select>
                <div className="text-[10.5px] text-soft mt-1">
                  Public-safe default is Jina. Use SearXNG for a sovereign
                  self-hosted search backend.
                </div>
                {(settings.search.provider === "searxng" ||
                  settings.search.provider === "duckduckgo") &&
                  !hasHostAccess && (
                    <div className="text-[10.5px] text-soft mt-1">
                      This backend fetches sites directly and needs site access.
                      Nerdbot will ask for permission when you switch to it.
                    </div>
                  )}
                {searchHint && (
                  <div className="text-[10.5px] text-accent mt-1">
                    {searchHint}
                  </div>
                )}
              </Field>

              {settings.search.provider === "searxng" ||
              settings.search.fallbackProviders.includes("searxng") ? (
                <Field label="SearXNG URL">
                  <input
                    value={settings.search.searxngUrl}
                    onChange={(e) =>
                      updateSearch({ searxngUrl: e.target.value })
                    }
                    placeholder="http://localhost:8080"
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-[13px] outline-none"
                  />
                  <div className="text-[10.5px] text-soft mt-1">
                    Nerdbot calls{" "}
                    <code className="text-ink/80">
                      /search?q=...&amp;format=json
                    </code>{" "}
                    on this base URL.
                  </div>
                </Field>
              ) : null}

              <Field
                label={`Max search results · ${settings.search.maxResults}`}
              >
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={1}
                  value={settings.search.maxResults}
                  onChange={(e) =>
                    updateSearch({ maxResults: Number(e.target.value) })
                  }
                  className="w-full accent-[rgb(var(--nb-accent))]"
                />
              </Field>

              <Field label="Fallback order">
                <div className="text-[11px] leading-5 text-soft rounded-lg border border-border bg-bg px-3 py-2">
                  {settings.search.provider} →{" "}
                  {settings.search.fallbackProviders.join(" → ")}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateSearch({
                      provider: "jina",
                      fallbackProviders: ["searxng", "duckduckgo"],
                    })
                  }
                  className="mt-2 text-[11px] text-accent hover:underline"
                >
                  Reset to public-safe default
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateSearch({
                      provider: "searxng",
                      fallbackProviders: ["jina", "duckduckgo"],
                    })
                  }
                  className="ml-3 mt-2 text-[11px] text-accent hover:underline"
                >
                  Use sovereign mode
                </button>
              </Field>
            </div>
          </div>

          {/* ── Knowledge & Context ── */}
          <div className="border-t border-border pt-4">
            <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-3">
              Knowledge & Context
            </div>

            <div className="space-y-4">
              <Field
                label={`RAG chunks per query · ${settings.ragChunks ?? 5}`}
              >
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={settings.ragChunks ?? 5}
                  onChange={(e) =>
                    onChange({ ...settings, ragChunks: Number(e.target.value) })
                  }
                  className="w-full accent-[rgb(var(--nb-accent))]"
                />
                <div className="flex justify-between text-[10px] text-soft mt-0.5">
                  <span>1 (precise)</span>
                  <span>~{(settings.ragChunks ?? 5) * 300} tokens added</span>
                  <span>10 (broad)</span>
                </div>
              </Field>

              <Field
                label={`Context limit · ${settings.maxContextTokens > 0 ? `${(settings.maxContextTokens / 1000).toFixed(0)}K tokens` : "Auto"}`}
              >
                <input
                  type="range"
                  min={0}
                  max={256000}
                  step={4000}
                  value={settings.maxContextTokens}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      maxContextTokens: Number(e.target.value),
                    })
                  }
                  className="w-full accent-[rgb(var(--nb-accent))]"
                />
                <div className="flex justify-between text-[10px] text-soft mt-0.5">
                  <span>Auto (provider default)</span>
                  <span>256K</span>
                </div>
                <div className="text-[10.5px] text-soft mt-1">
                  Old messages are auto-trimmed when the chat exceeds this
                  limit. Set to Auto to use the provider's max window.
                </div>
              </Field>
            </div>
          </div>

          {/* ── Personas (Souls) ── */}
          <div className="border-t border-border pt-4">
            <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-3">
              Personas
            </div>
            <div className="space-y-1.5">
              {/* None option */}
              <button
                onClick={() =>
                  onChange({ ...settings, activeSoulId: undefined })
                }
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left text-[12.5px] transition-colors ${
                  !settings.activeSoulId
                    ? "bg-accent/15 border-accent/50 text-ink"
                    : "bg-bg border-border text-muted hover:text-ink"
                }`}
              >
                <span>🤖</span>
                <span className="flex-1">Default (no persona)</span>
                {!settings.activeSoulId && (
                  <Check size={12} className="text-accent" />
                )}
              </button>

              {souls.map((soul) =>
                editingId === soul.id ? (
                  <SoulEditForm
                    key={soul.id}
                    name={editName}
                    emoji={editEmoji}
                    prompt={editPrompt}
                    onName={setEditName}
                    onEmoji={setEditEmoji}
                    onPrompt={setEditPrompt}
                    onSave={commitEdit}
                    onCancel={cancelEdit}
                  />
                ) : (
                  <div
                    key={soul.id}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[12.5px] transition-colors ${
                      settings.activeSoulId === soul.id
                        ? "bg-accent/15 border-accent/50"
                        : "bg-bg border-border"
                    }`}
                  >
                    <button
                      className="flex items-center gap-2 flex-1 text-left min-w-0"
                      onClick={() =>
                        onChange({ ...settings, activeSoulId: soul.id })
                      }
                    >
                      <span>{soul.emoji}</span>
                      <span className="flex-1 truncate text-ink">
                        {soul.name}
                      </span>
                      {settings.activeSoulId === soul.id && (
                        <Check size={12} className="text-accent shrink-0" />
                      )}
                    </button>
                    <button
                      onClick={() => beginEdit(soul)}
                      className="p-1 text-muted hover:text-ink rounded"
                      title="Edit"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={async () => {
                        await onDeleteSoul(soul.id);
                        if (settings.activeSoulId === soul.id)
                          onChange({ ...settings, activeSoulId: undefined });
                      }}
                      className="p-1 text-muted hover:text-red-400 rounded"
                      title="Delete"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ),
              )}

              {editingId === "new" ? (
                <SoulEditForm
                  name={editName}
                  emoji={editEmoji}
                  prompt={editPrompt}
                  onName={setEditName}
                  onEmoji={setEditEmoji}
                  onPrompt={setEditPrompt}
                  onSave={commitEdit}
                  onCancel={cancelEdit}
                />
              ) : (
                <button
                  onClick={beginNew}
                  className="w-full flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-dashed border-border text-muted hover:text-ink text-[12px] transition-colors"
                >
                  <Plus size={12} /> New persona
                </button>
              )}
            </div>
          </div>

          {/* ── Memory ── */}
          <div className="border-t border-border pt-4">
            <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-1">
              Memory
            </div>
            <div className="text-[10.5px] text-soft mb-3">
              Injected into every system prompt. Edit to teach Nerdbot
              persistent facts about you.
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11.5px] text-muted font-medium">
                    Long-term facts
                  </label>
                  <button
                    onClick={saveFacts}
                    className="text-[11px] text-accent hover:underline flex items-center gap-1"
                  >
                    {factsSaved ? (
                      <>
                        <Check size={10} /> Saved
                      </>
                    ) : (
                      "Save"
                    )}
                  </button>
                </div>
                <textarea
                  value={facts}
                  onChange={(e) => setFacts(e.target.value)}
                  rows={4}
                  placeholder={
                    "- Prefers TypeScript over JavaScript\n- Works on macOS\n- Uses Neovim"
                  }
                  className="w-full bg-bg border border-border focus-within:border-accent/50 rounded-lg px-3 py-2 text-[12px] outline-none resize-none font-mono"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11.5px] text-muted font-medium">
                    User profile
                  </label>
                  <button
                    onClick={saveUserProfile}
                    className="text-[11px] text-accent hover:underline flex items-center gap-1"
                  >
                    {userSaved ? (
                      <>
                        <Check size={10} /> Saved
                      </>
                    ) : (
                      "Save"
                    )}
                  </button>
                </div>
                <textarea
                  value={userProfile}
                  onChange={(e) => setUserProfile(e.target.value)}
                  rows={3}
                  placeholder={
                    "Senior full-stack engineer.\nBuilds browser extensions and AI tools.\nBlunt communication style preferred."
                  }
                  className="w-full bg-bg border border-border focus-within:border-accent/50 rounded-lg px-3 py-2 text-[12px] outline-none resize-none font-mono"
                />
              </div>
            </div>
          </div>

          <Field label="Theme">
            <div className="grid grid-cols-3 gap-1.5">
              {(["dark", "light", "system"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    onChange({ ...settings, theme: t });
                    const root = document.documentElement;
                    if (t === "system") {
                      const prefDark = window.matchMedia(
                        "(prefers-color-scheme: dark)",
                      ).matches;
                      root.classList.toggle("dark", prefDark);
                      root.classList.toggle("light", !prefDark);
                    } else {
                      root.classList.toggle("dark", t === "dark");
                      root.classList.toggle("light", t === "light");
                    }
                  }}
                  className={`px-2.5 py-2 text-[12.5px] rounded-lg border transition-colors capitalize ${
                    settings.theme === t
                      ? "bg-accent/15 border-accent/50 text-ink"
                      : "bg-bg border-border text-muted hover:text-ink"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>

          {/* ── Help & Feedback ── */}
          <div className="border-t border-border pt-4">
            <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-3">
              Help & Feedback
            </div>
            <button
              onClick={onReportBug}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border bg-bg text-muted hover:text-ink hover:border-accent/50 text-[12.5px] transition-colors"
            >
              <Bug size={14} className="text-accent" />
              <span className="flex-1 text-left">Report a bug</span>
            </button>
            <div className="text-[10.5px] text-soft mt-1.5">
              Opens your email client to send a report to the Nerdbot team.
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border bg-bg text-[11px] text-muted">
          Settings sync to this browser only. Keys never leave your device.
        </div>
      </div>
    </div>
  );
}

function SoulEditForm({
  name,
  emoji,
  prompt,
  onName,
  onEmoji,
  onPrompt,
  onSave,
  onCancel,
}: {
  name: string;
  emoji: string;
  prompt: string;
  onName: (v: string) => void;
  onEmoji: (v: string) => void;
  onPrompt: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="bg-elevated border border-border rounded-lg p-3 space-y-2">
      <div className="flex gap-2">
        <input
          value={emoji}
          onChange={(e) => onEmoji(e.target.value)}
          maxLength={2}
          className="w-10 text-center bg-bg border border-border rounded px-1 py-1.5 text-[14px] outline-none"
          placeholder="✨"
        />
        <input
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="Persona name"
          className="flex-1 bg-bg border border-border rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
        />
      </div>
      <textarea
        value={prompt}
        onChange={(e) => onPrompt(e.target.value)}
        rows={5}
        placeholder="Describe how this persona should behave…"
        className="w-full bg-bg border border-border rounded-lg px-2.5 py-2 text-[12px] outline-none resize-none font-mono"
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-[12px] text-muted hover:text-ink border border-border rounded-lg"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!name.trim() || !prompt.trim()}
          className="px-3 py-1.5 text-[12px] bg-accent/20 border border-accent/40 text-ink rounded-lg hover:bg-accent/30 disabled:opacity-40"
        >
          Save persona
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11.5px] text-muted font-medium">{label}</label>
        {hint && <span className="text-[11px]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
