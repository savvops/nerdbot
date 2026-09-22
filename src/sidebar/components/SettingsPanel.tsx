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
  Info,
  Server,
  RotateCcw,
} from "lucide-react";
import type {
  CustomAgentEndpoint,
  ProviderId,
  SearchProviderId,
  Settings,
  Soul,
} from "../../services/types";
import {
  DEFAULT_CUSTOM_AGENTS,
  PROVIDER_ACCESS_LABELS,
  PROVIDER_DOCS,
  PROVIDER_LABELS,
  PROVIDER_RECOMMENDATIONS,
} from "../../services/config";
import { memoryProvider } from "../../services/memoryProvider";
import { DEFAULT_SOUL_PROMPT } from "../../services/souls";
import ModelSelect from "./ModelSelect";
import JevExperiment from "./JevExperiment";
import {
  getAvailableModels,
  clearModelCache,
  FALLBACK_MODEL_CATALOGS,
  validateApiKey,
  type ModelFetchResult,
} from "../../services/models";
import {
  detectLocalProviders,
  preferredLocalModels,
  type LocalProviderProbe,
} from "../../services/localProviders";
import {
  hasAllUrls,
  requestAllUrls,
  ensureLocalAiAccess,
  onPermissionsChanged,
  requestOriginAccess,
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
  "nvidia",
  "anthropic",
  "lmstudio",
  "ollama",
  "custom_agent",
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
  const [providerHealth, setProviderHealth] = useState<
    "idle" | "checking" | "ready" | "error"
  >("idle");
  const [providerHealthMessage, setProviderHealthMessage] = useState("");
  const [localScanBusy, setLocalScanBusy] = useState(false);
  const [localScanResults, setLocalScanResults] = useState<LocalProviderProbe[]>([]);

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
      cfg.id === "nvidia" ||
      cfg.id === "anthropic";
    // Cloud providers need a key before they'll list models — until then fall
    // back to known modality-specific choices in each picker.
    if (isCloud && !cfg.apiKey.trim()) {
      const fallback = FALLBACK_MODEL_CATALOGS[cfg.id];
      setModelList({
        models: fallback.chat,
        imageModels: fallback.image,
        audioModels: fallback.audio,
        source: "fallback",
      });
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

  useEffect(() => {
    setProviderHealth("idle");
    setProviderHealthMessage("");
  }, [provider.id, provider.baseUrl, provider.apiKey]);

  const checkProviderHealth = async () => {
    setProviderHealth("checking");
    setProviderHealthMessage("Checking connection…");
    if ((provider.id === "lmstudio" || provider.id === "ollama") && !(await ensureLocalAiAccess())) {
      setProviderHealth("error");
      setProviderHealthMessage("Localhost access was not granted.");
      return;
    }
    if (!["lmstudio", "ollama"].includes(provider.id) && !provider.apiKey.trim()) {
      setProviderHealth("error");
      setProviderHealthMessage("Add or connect an API key first.");
      return;
    }
    try {
      if (!await requestOriginAccess(provider.baseUrl)) throw new Error('Provider access was not granted.');
      const models = await validateApiKey(provider);
      setProviderHealth("ready");
      setProviderHealthMessage(`Ready · ${models.length} model${models.length === 1 ? "" : "s"} available`);
      refreshModels();
    } catch (error) {
      setProviderHealth("error");
      setProviderHealthMessage(error instanceof Error ? error.message : "Connection check failed");
    }
  };

  const scanLocalProviders = async () => {
    setLocalScanBusy(true);
    setLocalScanResults([]);
    const { permissionGranted, results } = await detectLocalProviders(settings);
    setLocalScanBusy(false);
    if (!permissionGranted) {
      setProviderHealth("error");
      setProviderHealthMessage("Localhost access was not granted.");
      return;
    }
    setLocalScanResults(results);
    const found = results.find((result) => result.reachable && result.models.length > 0);
    if (!found) return;
    const recommended = preferredLocalModels(found);
    onChange({
      ...settings,
      activeProvider: found.id,
      providers: {
        ...settings.providers,
        [found.id]: {
          ...settings.providers[found.id],
          fastModel: recommended.fastModel || settings.providers[found.id].fastModel,
          qualityModel: recommended.qualityModel || settings.providers[found.id].qualityModel,
        },
      },
    });
    setProviderHealth("ready");
    setProviderHealthMessage(`${PROVIDER_LABELS[found.id]} detected and selected.`);
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

  const customAgents =
    settings.customAgents && settings.customAgents.length > 0
      ? settings.customAgents
      : DEFAULT_CUSTOM_AGENTS;
  const activeAgentId = settings.activeCustomAgentId || customAgents[0]?.id;
  const activeAgent =
    customAgents.find((a) => a.id === activeAgentId) || customAgents[0];

  const updateActiveAgent = (patch: Partial<CustomAgentEndpoint>) => {
    const updated = customAgents.map((a) =>
      a.id === activeAgent?.id ? { ...a, ...patch } : a,
    );
    onChange({
      ...settings,
      customAgents: updated,
    });
  };

  const addCustomAgent = () => {
    const newId = `agent-${Date.now().toString(36)}`;
    const newAgent: CustomAgentEndpoint = {
      id: newId,
      name: `Agent ${customAgents.length + 1}`,
      baseUrl: "http://localhost:8000/v1",
      apiKey: "",
      model: "default",
      description: "Custom Node",
    };
    onChange({
      ...settings,
      customAgents: [...customAgents, newAgent],
      activeCustomAgentId: newId,
    });
  };

  const deleteCustomAgent = (id: string) => {
    if (customAgents.length <= 1) return;
    const remaining = customAgents.filter((a) => a.id !== id);
    onChange({
      ...settings,
      customAgents: remaining,
      activeCustomAgentId:
        activeAgentId === id ? remaining[0].id : activeAgentId,
    });
  };

  const resetDefaultAgents = () => {
    onChange({
      ...settings,
      customAgents: DEFAULT_CUSTOM_AGENTS,
      activeCustomAgentId: DEFAULT_CUSTOM_AGENTS[0].id,
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
                    if (id === "lmstudio" || id === "ollama" || id === "custom_agent") {
                      void ensureLocalAiAccess();
                    }
                  }}
                  className={`px-2.5 py-2 text-[12.5px] rounded-lg border transition-colors text-left ${
                    settings.activeProvider === id
                      ? "bg-accent/15 border-accent/50 text-ink"
                      : "bg-bg border-border text-muted hover:text-ink"
                  }`}
                >
                  <span className="block">{PROVIDER_LABELS[id]}</span>
                  <span className="mt-0.5 block text-[9.5px] text-soft">
                    {PROVIDER_ACCESS_LABELS[id]}
                  </span>
                </button>
              ))}
            </div>
          </Field>

          {settings.activeProvider === "custom_agent" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-[12px] text-ink/90 flex gap-2.5 items-start">
                <Info size={16} className="text-accent shrink-0 mt-0.5" />
                <div className="space-y-1 leading-relaxed">
                  <div className="font-semibold text-accent">Personal & Custom Agents</div>
                  <div>
                    Connect sovereign personal agents, remote agent servers, or multi-agent swarms (e.g. <strong>Hermes</strong> running on your Nukbox, Spine, or Legion nodes, <strong>OpenClaw</strong>, <strong>Eve</strong>, <strong>SAO Core</strong> on port 4177, or Cloudflare Zero Trust Tunnels).
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-ink flex items-center gap-1.5">
                    <Server size={13} className="text-accent" /> Active Agent Node
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={resetDefaultAgents}
                      title="Reset default fleet presets"
                      className="text-[11px] text-soft hover:text-ink flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-elevated"
                    >
                      <RotateCcw size={11} /> Reset Presets
                    </button>
                    <button
                      type="button"
                      onClick={addCustomAgent}
                      className="text-[11px] text-accent font-medium hover:underline flex items-center gap-0.5"
                    >
                      <Plus size={12} /> Add Agent
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {customAgents.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => onChange({ ...settings, activeCustomAgentId: agent.id })}
                      className={`px-2.5 py-2 text-[12px] rounded-lg border transition-all text-left flex flex-col gap-0.5 ${
                        activeAgent?.id === agent.id
                          ? "bg-accent/15 border-accent/50 text-ink shadow-sm"
                          : "bg-bg border-border text-muted hover:text-ink"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-semibold truncate">{agent.name}</span>
                        {activeAgent?.id === agent.id && <Check size={12} className="text-accent shrink-0" />}
                      </div>
                      <span className="text-[10px] text-soft truncate">{agent.description || agent.baseUrl}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-bg border border-border rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] font-semibold text-accent uppercase tracking-wider">Configure Node</span>
                  {customAgents.length > 1 && (
                    <button
                      type="button"
                      onClick={() => deleteCustomAgent(activeAgent.id)}
                      className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1"
                      title="Delete this agent node"
                    >
                      <Trash2 size={11} /> Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Field label="Agent Name">
                    <input
                      value={activeAgent?.name || ""}
                      onChange={(e) => updateActiveAgent({ name: e.target.value })}
                      placeholder="e.g. Hermes Nukbox"
                      className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
                    />
                  </Field>
                  <Field label="Node Note">
                    <input
                      value={activeAgent?.description || ""}
                      onChange={(e) => updateActiveAgent({ description: e.target.value })}
                      placeholder="e.g. RTX 3060 Node"
                      className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
                    />
                  </Field>
                </div>

                <Field label="Base URL">
                  <input
                    value={activeAgent?.baseUrl || ""}
                    onChange={(e) => updateActiveAgent({ baseUrl: e.target.value })}
                    placeholder="http://localhost:8000/v1"
                    className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
                  />
                  <div className="text-[10.5px] text-soft mt-1">
                    Local agent server, LAN IP (e.g. nukbox.local), or Cloudflare Tunnel URL.
                  </div>
                </Field>

                <Field label="API Key / Bearer Token">
                  <div className="flex items-center gap-1 bg-surface border border-border rounded-lg px-2.5 focus-within:border-accent/50">
                    <input
                      type={showKey ? "text" : "password"}
                      value={activeAgent?.apiKey || ""}
                      onChange={(e) => updateActiveAgent({ apiKey: e.target.value })}
                      placeholder="Optional for sovereign/local agents"
                      className="flex-1 py-1.5 text-[12.5px] outline-none bg-transparent"
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

                <Field label="Model / Agent ID">
                  <div className="flex items-center gap-2">
                    <input
                      value={activeAgent?.model || ""}
                      onChange={(e) => updateActiveAgent({ model: e.target.value })}
                      placeholder="e.g. hermes-3, default, sao-agent"
                      className="flex-1 bg-surface border border-border rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
                    />
                    <button
                      type="button"
                      onClick={refreshModels}
                      disabled={modelsLoading}
                      className="p-2 text-muted hover:text-ink rounded bg-surface border border-border"
                      title="Check agent connection & refresh models"
                    >
                      <RefreshCw size={12} className={modelsLoading ? "animate-spin" : ""} />
                    </button>
                  </div>
                </Field>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-border bg-bg p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[12.5px] font-medium text-ink">Provider health</div>
                    <div className={`mt-0.5 text-[10.5px] ${providerHealth === "ready" ? "text-accent" : "text-soft"}`}>
                      {providerHealthMessage || (provider.id === 'nvidia' ? 'Checks model access with a one-token test request.' : "Run a check before relying on this provider.")}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={checkProviderHealth}
                    disabled={providerHealth === "checking"}
                    className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-ink hover:bg-elevated disabled:opacity-50"
                  >
                    {providerHealth === "checking" ? "Checking…" : "Check connection"}
                  </button>
                </div>
                <div className="mt-3 border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={scanLocalProviders}
                    disabled={localScanBusy}
                    className="text-[11px] font-medium text-accent hover:underline disabled:opacity-50"
                  >
                    {localScanBusy ? "Checking localhost…" : "Detect Ollama or LM Studio"}
                  </button>
                  <div className="mt-1 text-[10px] leading-relaxed text-soft">
                    Runs only when clicked and checks the documented default localhost endpoints.
                  </div>
                  {localScanResults.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {localScanResults.map((result) => (
                        <div key={result.id} className="flex items-center justify-between gap-3 text-[10.5px]">
                          <span className="text-ink">{PROVIDER_LABELS[result.id]}</span>
                          <span className={result.reachable ? "text-accent" : "text-soft"}>{result.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

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

              {provider.apiKey === 'managed-by-pc' && (
                <p className="text-xs text-muted">Using this provider's key from your PC extension. The key stays on the PC. Replace this value to use a separate mobile key.</p>
              )}

              <JevExperiment settings={settings} onChange={onChange} />

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
                        ? `${modelList.models.length} chat · ${modelList.imageModels.length} image · ${modelList.audioModels.length} audio`
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
                {modelList?.source === "fallback" && modelList.error && (
                  <div
                    className="text-[10.5px] text-soft mt-0.5"
                    title={modelList.error}
                  >
                    Couldn't fetch live models — showing known ones
                  </div>
                )}
                <div className="mt-1 text-[10.5px] leading-relaxed text-soft">
                  {PROVIDER_RECOMMENDATIONS[provider.id]}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Fast image model">
                  <ModelSelect
                    value={provider.fastImageModel || ""}
                    models={modelList?.imageModels ?? []}
                    loading={modelsLoading}
                    onChange={(id) => updateProvider({ fastImageModel: id })}
                  />
                </Field>
                <Field label="Quality image model">
                  <ModelSelect
                    value={provider.qualityImageModel || ""}
                    models={modelList?.imageModels ?? []}
                    loading={modelsLoading}
                    onChange={(id) => updateProvider({ qualityImageModel: id })}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Fast audio model">
                  <ModelSelect
                    value={provider.fastAudioModel || ""}
                    models={modelList?.audioModels ?? []}
                    loading={modelsLoading}
                    onChange={(id) => updateProvider({ fastAudioModel: id })}
                  />
                </Field>
                <Field label="Quality audio model">
                  <ModelSelect
                    value={provider.qualityAudioModel || ""}
                    models={modelList?.audioModels ?? []}
                    loading={modelsLoading}
                    onChange={(id) => updateProvider({ qualityAudioModel: id })}
                  />
                </Field>
              </div>
            </>
          )}

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

          <Field
            label="Max Output Tokens"
            hint={
              <span className="font-mono text-xs text-text-primary">
                {settings.maxTokens.toLocaleString()}
              </span>
            }
          >
            <div className="space-y-2">
              <input
                type="range"
                min={256}
                max={128000}
                step={256}
                value={Math.min(settings.maxTokens, 128000)}
                onChange={(e) =>
                  onChange({ ...settings, maxTokens: Number(e.target.value) })
                }
                className="w-full accent-[rgb(var(--nb-accent))]"
              />
              <div className="flex items-center gap-1.5 flex-wrap">
                {[2048, 4096, 8192, 16384, 32768, 65536, 128000].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => onChange({ ...settings, maxTokens: val })}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                      settings.maxTokens === val
                        ? "bg-accent/15 border-accent text-accent font-semibold"
                        : "border-border text-muted hover:text-text-primary hover:bg-hover"
                    }`}
                  >
                    {val >= 1000 ? `${Math.round(val / 1000)}k` : val}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={1000000}
                  value={settings.maxTokens}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      maxTokens: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  className="ml-auto w-20 px-2 py-0.5 text-right font-mono text-xs rounded border border-border bg-input-bg text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
            </div>
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
          <Field label="Legacy PC bridge">
            <label className="flex items-start gap-2.5 rounded-lg border border-border bg-bg px-3 py-2.5 text-[12px]">
              <input
                type="checkbox"
                checked={Boolean(settings.bridgeEnabled)}
                onChange={(e) =>
                  onChange({ ...settings, bridgeEnabled: e.target.checked })
                }
                className="mt-0.5 accent-[rgb(var(--nb-accent))]"
              />
              <span>
                <span className="block text-ink">Connect to localhost:3030</span>
                <span className="mt-0.5 block text-[10.5px] text-soft">
                  Only enable this when the optional Nerdbot bridge is running
                  on this PC. Account chat sync does not require it.
                </span>
              </span>
            </label>
          </Field>

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
          Settings and keys are stored only in this browser profile.
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
