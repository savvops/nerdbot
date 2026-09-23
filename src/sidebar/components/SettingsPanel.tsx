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
  Server,
  RotateCcw,
  Link2,
  Shield,
  Cpu,
  Bot,
  Cloud,
  Copy,
  KeyRound,
} from "lucide-react";
import type {
  CloudAccountInfo,
  CustomAgentEndpoint,
  ProviderId,
  SearchProviderId,
  Settings,
  Soul,
} from "../../services/types";
import {
  DEFAULT_CUSTOM_AGENTS,
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
import {
  listCredentials,
  saveCredential,
  deleteCredential,
  type CredentialItem,
} from "../../services/credentials";

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
  cloudAccount?: CloudAccountInfo;
  initialTab?: "connections" | "vault" | "models" | "personas";
}

type SettingsTab = "connections" | "vault" | "models" | "personas";

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
  cloudAccount,
  initialTab = "connections",
}: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [showKey, setShowKey] = useState(false);
  const [providerHealth, setProviderHealth] = useState<
    "idle" | "checking" | "ready" | "error"
  >("idle");
  const [providerHealthMessage, setProviderHealthMessage] = useState("");
  const [localScanBusy, setLocalScanBusy] = useState(false);
  const [localScanResults, setLocalScanResults] = useState<LocalProviderProbe[]>([]);

  // Credentials Vault state
  const [credentials, setCredentials] = useState<CredentialItem[]>([]);
  const [showSecretMap, setShowSecretMap] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isEditingCred, setIsEditingCred] = useState(false);
  const [credKeyInput, setCredKeyInput] = useState("");
  const [credValInput, setCredValInput] = useState("");
  const [credDescInput, setCredDescInput] = useState("");
  const [credError, setCredError] = useState("");

  const provider = settings.providers[settings.activeProvider];

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  const loadVault = async () => {
    try {
      const items = await listCredentials();
      setCredentials(items);
    } catch {
      /* no-op */
    }
  };

  useEffect(() => {
    if (open) {
      loadVault();
    }
  }, [open, activeTab]);

  const handleSaveCred = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredError("");
    if (!credKeyInput.trim()) {
      setCredError("Key name is required (e.g. GITHUB_TOKEN).");
      return;
    }
    if (!credValInput.trim()) {
      setCredError("Secret value cannot be empty.");
      return;
    }
    try {
      await saveCredential({
        key: credKeyInput,
        value: credValInput,
        description: credDescInput.trim(),
      });
      setCredKeyInput("");
      setCredValInput("");
      setCredDescInput("");
      setIsEditingCred(false);
      await loadVault();
    } catch (err: any) {
      setCredError(err.message || "Failed to save credential.");
    }
  };

  const handleDeleteCred = async (key: string) => {
    if (!window.confirm(`Delete credential "${key}" from your local vault?`)) return;
    await deleteCredential(key);
    await loadVault();
  };

  const copySecretTag = (key: string) => {
    const tag = `$SECRET{${key}}`;
    navigator.clipboard.writeText(tag);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
  };

  // Model list (live-fetched, debounced, cached in services/models.ts)
  const [modelList, setModelList] = useState<ModelFetchResult | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const forceModelsRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const cfg = provider;
    const isCloud =
      cfg.id === "gemini" ||
      cfg.id === "openai" ||
      cfg.id === "openrouter" ||
      cfg.id === "nvidia" ||
      cfg.id === "anthropic";
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
    if (
      (provider.id === "lmstudio" || provider.id === "ollama") &&
      !(await ensureLocalAiAccess())
    ) {
      setProviderHealth("error");
      setProviderHealthMessage("Localhost access was not granted.");
      return;
    }
    if (
      !["lmstudio", "ollama"].includes(provider.id) &&
      !provider.apiKey.trim()
    ) {
      setProviderHealth("error");
      setProviderHealthMessage("Add or connect an API key first.");
      return;
    }
    try {
      if (!(await requestOriginAccess(provider.baseUrl)))
        throw new Error("Provider access was not granted.");
      const models = await validateApiKey(provider);
      setProviderHealth("ready");
      setProviderHealthMessage(
        `Ready · ${models.length} model${models.length === 1 ? "" : "s"} available`,
      );
      refreshModels();
    } catch (error) {
      setProviderHealth("error");
      setProviderHealthMessage(
        error instanceof Error ? error.message : "Connection check failed",
      );
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

  const [searchHint, setSearchHint] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const unsub = onPermissionsChanged(() => {
      hasAllUrls().then(() => {});
    });
    return () => {
      unsub();
    };
  }, [open]);

  // Souls / Personas management state
  const [editingSoulId, setEditingSoulId] = useState<string | null>(null);
  const [isCreatingSoul, setIsCreatingSoul] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmoji, setEditEmoji] = useState("🤖");
  const [editPrompt, setEditPrompt] = useState("");

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

  const startEditSoul = (s: Soul) => {
    setEditingSoulId(s.id);
    setIsCreatingSoul(false);
    setEditName(s.name);
    setEditEmoji(s.emoji);
    setEditPrompt(s.systemPrompt);
  };

  const startCreateSoul = () => {
    setIsCreatingSoul(true);
    setEditingSoulId(null);
    setEditName("");
    setEditEmoji("🤖");
    setEditPrompt(DEFAULT_SOUL_PROMPT);
  };

  const cancelSoulEdit = () => {
    setEditingSoulId(null);
    setIsCreatingSoul(false);
  };

  const saveSoulEdit = async () => {
    if (!editName.trim() || !editPrompt.trim()) return;
    if (isCreatingSoul) {
      const created = await onCreateSoul({
        name: editName.trim(),
        emoji: editEmoji || "🤖",
        systemPrompt: editPrompt.trim(),
      });
      onChange({ ...settings, activeSoulId: created.id });
    } else if (editingSoulId) {
      await onUpdateSoul(editingSoulId, {
        name: editName.trim(),
        emoji: editEmoji || "🤖",
        systemPrompt: editPrompt.trim(),
      });
    }
    cancelSoulEdit();
  };

  if (!open) return null;

  const updateProvider = (patch: Partial<(typeof settings.providers)[ProviderId]>) => {
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

  const handleSearchProviderChange = async (next: SearchProviderId) => {
    if (next === "searxng" || next === "duckduckgo") {
      const has = await hasAllUrls();
      if (!has) {
        const granted = await requestAllUrls();
        if (!granted) {
          setSearchHint(
            "Site access is needed for that search backend — keeping previous provider.",
          );
          setTimeout(() => setSearchHint(null), 4000);
          return;
        }
      }
    }
    updateSearch({ provider: next });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 animate-fade-in flex items-stretch sm:items-center justify-end sm:justify-center p-0 sm:p-3 backdrop-blur-sm">
      <div className="w-full sm:max-w-[480px] sm:rounded-2xl bg-surface border-l sm:border border-border shadow-2xl overflow-hidden flex flex-col h-full sm:max-h-[92vh] animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-12 border-b border-border bg-bg/70 shrink-0">
          <div>
            <div className="text-[13.5px] font-semibold text-ink">Settings</div>
            <div className="text-[11px] text-muted">Manage connections, vault, models & personas</div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-elevated transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-border bg-bg/40 overflow-x-auto text-xs shrink-0 no-scrollbar">
          <button
            onClick={() => setActiveTab("connections")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all ${
              activeTab === "connections"
                ? "bg-elevated text-ink border border-border shadow-sm"
                : "text-muted hover:text-ink hover:bg-elevated/50"
            }`}
          >
            <Link2 size={13} /> Connections & Keys
          </button>
          <button
            onClick={() => setActiveTab("vault")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all ${
              activeTab === "vault"
                ? "bg-elevated text-ink border border-border shadow-sm"
                : "text-muted hover:text-ink hover:bg-elevated/50"
            }`}
          >
            <Shield size={13} /> Credentials Vault
          </button>
          <button
            onClick={() => setActiveTab("models")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all ${
              activeTab === "models"
                ? "bg-elevated text-ink border border-border shadow-sm"
                : "text-muted hover:text-ink hover:bg-elevated/50"
            }`}
          >
            <Cpu size={13} /> Models & Gen
          </button>
          <button
            onClick={() => setActiveTab("personas")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all ${
              activeTab === "personas"
                ? "bg-elevated text-ink border border-border shadow-sm"
                : "text-muted hover:text-ink hover:bg-elevated/50"
            }`}
          >
            <Bot size={13} /> Personas & Memory
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="overflow-y-auto p-4 space-y-5 flex-1">
          {/* TAB 1: CONNECTIONS & KEYS */}
          {activeTab === "connections" && (
            <div className="space-y-5 animate-fade-in">
              {/* Primary AI Provider */}
              <Field label="Active AI Provider">
                <select
                  value={settings.activeProvider}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      activeProvider: e.target.value as ProviderId,
                    })
                  }
                  className="w-full bg-bg border border-border rounded-lg px-2.5 py-2 text-[13px] outline-none"
                >
                  {PROVIDER_ORDER.map((id) => (
                    <option key={id} value={id}>
                      {PROVIDER_LABELS[id]}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-[11px] text-soft">
                  {PROVIDER_RECOMMENDATIONS[settings.activeProvider]}
                </div>
              </Field>

              {/* Provider Health Check & Local Detection */}
              <div className="rounded-xl border border-border bg-bg p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[12px] font-medium text-ink">Provider Connection</div>
                    <div
                      className={`mt-0.5 text-[10.5px] ${
                        providerHealth === "ready" ? "text-emerald-400" : "text-soft"
                      }`}
                    >
                      {providerHealthMessage ||
                        (provider.id === "nvidia"
                          ? "Checks model access with a one-token test request."
                          : "Run a check to test network access to this endpoint.")}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={checkProviderHealth}
                    disabled={providerHealth === "checking"}
                    className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-ink hover:bg-elevated disabled:opacity-50 transition-colors"
                  >
                    {providerHealth === "checking" ? "Checking…" : "Test Connection"}
                  </button>
                </div>
                <div className="mt-3 border-t border-border pt-2.5">
                  <button
                    type="button"
                    onClick={scanLocalProviders}
                    disabled={localScanBusy}
                    className="text-[11px] font-medium text-accent hover:underline disabled:opacity-50"
                  >
                    {localScanBusy ? "Checking localhost…" : "Scan for Ollama / LM Studio"}
                  </button>
                  {localScanResults.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {localScanResults.map((result) => (
                        <div
                          key={result.id}
                          className="flex items-center justify-between gap-3 text-[10.5px]"
                        >
                          <span className="text-ink">{PROVIDER_LABELS[result.id]}</span>
                          <span className={result.reachable ? "text-emerald-400" : "text-soft"}>
                            {result.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Custom Agent Fleet / Multi-Node Switcher */}
              {settings.activeProvider === "custom_agent" ? (
                <div className="rounded-xl border border-border bg-bg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[12.5px] font-medium text-ink flex items-center gap-1.5">
                        <Server size={14} className="text-accent" />
                        <span>Multi-Node Agent Grid</span>
                      </div>
                      <div className="text-[10.5px] text-soft">
                        Switch between Hermes Legion, Nukbox, Spine, SAO Core & custom endpoints.
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={addCustomAgent}
                        className="px-2 py-1 text-[11px] rounded bg-elevated border border-border hover:border-accent text-ink flex items-center gap-1"
                        title="Add a new custom node"
                      >
                        <Plus size={11} /> Add Node
                      </button>
                      <button
                        type="button"
                        onClick={resetDefaultAgents}
                        className="p-1 text-soft hover:text-ink rounded"
                        title="Reset fleet to default presets"
                      >
                        <RotateCcw size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {customAgents.map((agent) => {
                      const isSelected = agent.id === activeAgent?.id;
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() =>
                            onChange({
                              ...settings,
                              activeCustomAgentId: agent.id,
                            })
                          }
                          className={`flex flex-col text-left p-2 rounded-lg border transition-all ${
                            isSelected
                              ? "bg-accent/15 border-accent text-ink"
                              : "bg-surface border-border text-muted hover:text-ink hover:bg-elevated"
                          }`}
                        >
                          <div className="font-semibold text-[11.5px] truncate">
                            {agent.name}
                          </div>
                          <div className="text-[10px] text-soft truncate font-mono">
                            {agent.baseUrl.replace(/^https?:\/\//, "")}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="pt-2 border-t border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11.5px] font-medium text-ink">
                        Node Configuration ({activeAgent?.name})
                      </span>
                      {customAgents.length > 1 && (
                        <button
                          type="button"
                          onClick={() => deleteCustomAgent(activeAgent?.id || "")}
                          className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1"
                        >
                          <Trash2 size={11} /> Remove Node
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Agent Name">
                        <input
                          value={activeAgent?.name || ""}
                          onChange={(e) => updateActiveAgent({ name: e.target.value })}
                          placeholder="e.g. Hermes Nukbox"
                          className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-[12px] outline-none"
                        />
                      </Field>
                      <Field label="Node Note">
                        <input
                          value={activeAgent?.description || ""}
                          onChange={(e) => updateActiveAgent({ description: e.target.value })}
                          placeholder="e.g. RTX 3060 Node"
                          className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-[12px] outline-none"
                        />
                      </Field>
                    </div>

                    <Field label="Base URL">
                      <input
                        value={activeAgent?.baseUrl || ""}
                        onChange={(e) => updateActiveAgent({ baseUrl: e.target.value })}
                        placeholder="http://localhost:8000/v1"
                        className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-[12px] font-mono outline-none"
                      />
                    </Field>

                    <Field label="Bearer Token / API Key (Optional)">
                      <div className="flex items-center gap-1 bg-surface border border-border rounded-lg px-2.5 focus-within:border-accent">
                        <input
                          type={showKey ? "text" : "password"}
                          value={activeAgent?.apiKey || ""}
                          onChange={(e) => updateActiveAgent({ apiKey: e.target.value })}
                          placeholder="Optional for LAN / local nodes"
                          className="flex-1 py-1.5 text-[12px] font-mono outline-none bg-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey((v) => !v)}
                          className="p-1 text-muted hover:text-ink"
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
                          placeholder="e.g. default, hermes-3"
                          className="flex-1 bg-surface border border-border rounded-lg px-2.5 py-1.5 text-[12px] font-mono outline-none"
                        />
                        <button
                          type="button"
                          onClick={refreshModels}
                          disabled={modelsLoading}
                          className="p-2 text-muted hover:text-ink rounded bg-surface border border-border"
                          title="Refresh models"
                        >
                          <RefreshCw size={12} className={modelsLoading ? "animate-spin" : ""} />
                        </button>
                      </div>
                    </Field>
                  </div>
                </div>
              ) : (
                <>
                  {/* Standard Provider API Key & Base URL */}
                  <Field
                    label="API Key"
                    hint={
                      PROVIDER_DOCS[provider.id] ? (
                        <a
                          href={PROVIDER_DOCS[provider.id]}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent hover:underline inline-flex items-center gap-0.5"
                        >
                          Get key <ExternalLink size={10} />
                        </a>
                      ) : null
                    }
                  >
                    <div className="flex items-center gap-1 bg-bg border border-border rounded-lg px-2.5 focus-within:border-accent">
                      <input
                        type={showKey ? "text" : "password"}
                        value={provider.apiKey}
                        onChange={(e) => updateProvider({ apiKey: e.target.value })}
                        placeholder={
                          provider.id === "lmstudio" || provider.id === "ollama"
                            ? "Not required"
                            : "sk-…"
                        }
                        className="flex-1 py-2 text-[12.5px] font-mono outline-none bg-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((v) => !v)}
                        className="p-1 text-muted hover:text-ink"
                      >
                        {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </Field>

                  <Field label="Base URL">
                    <input
                      value={provider.baseUrl}
                      onChange={(e) => updateProvider({ baseUrl: e.target.value })}
                      className="w-full bg-bg border border-border rounded-lg px-2.5 py-2 text-[12.5px] font-mono outline-none"
                    />
                  </Field>
                </>
              )}

              {/* Web Search Backend */}
              <div className="border-t border-border pt-4 space-y-3">
                <div className="text-[12.5px] font-semibold text-ink">Web Search Backend</div>
                <Field label="Search Provider">
                  <select
                    value={settings.search?.provider || "duckduckgo"}
                    onChange={(e) =>
                      handleSearchProviderChange(e.target.value as SearchProviderId)
                    }
                    className="w-full bg-bg border border-border rounded-lg px-2.5 py-2 text-[12.5px] outline-none"
                  >
                    {SEARCH_PROVIDER_ORDER.map((id) => (
                      <option key={id} value={id}>
                        {SEARCH_PROVIDER_LABELS[id]}
                      </option>
                    ))}
                  </select>
                </Field>

                {settings.search?.provider === "searxng" && (
                  <Field label="SearXNG URL">
                    <input
                      value={settings.search?.searxngUrl || ""}
                      onChange={(e) => updateSearch({ searxngUrl: e.target.value })}
                      placeholder="https://searx.example.com"
                      className="w-full bg-bg border border-border rounded-lg px-2.5 py-1.5 text-[12px] font-mono outline-none"
                    />
                  </Field>
                )}

                {searchHint && <div className="text-[11px] text-amber-400">{searchHint}</div>}
              </div>

              {/* Cloud Sync (Convex Account) */}
              <div className="border-t border-border pt-4 space-y-3">
                <div className="text-[12.5px] font-semibold text-ink flex items-center gap-1.5">
                  <Cloud size={15} className={cloudAccount?.user ? "text-emerald-400" : "text-muted"} />
                  <span>Cloud Sync (Convex)</span>
                </div>
                <div className="rounded-xl border border-border bg-bg p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-semibold text-ink truncate">
                        {cloudAccount?.user ? cloudAccount.user.email : "Local-only mode"}
                      </div>
                      <div className="text-[11px] text-muted truncate">
                        {cloudAccount?.user
                          ? `${cloudAccount.status.message}${cloudAccount.status.pending ? ` · ${cloudAccount.status.pending} pending` : ""}`
                          : "Sync conversations & projects across PC, laptop & mobile."}
                      </div>
                    </div>
                    {cloudAccount?.user ? (
                      <button
                        type="button"
                        onClick={() => cloudAccount.onSignOut()}
                        className="px-2.5 py-1 rounded-lg border border-border text-[11.5px] text-muted hover:text-danger hover:bg-elevated transition-colors"
                      >
                        Sign out
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => cloudAccount?.onSignIn()}
                        className="px-3 py-1.5 rounded-lg bg-accent text-white text-[12px] font-medium hover:brightness-110 transition-colors"
                      >
                        Sign in
                      </button>
                    )}
                  </div>

                  {cloudAccount?.user && (
                    <div className="border-t border-border pt-2.5 flex flex-wrap items-center gap-2">
                      {cloudAccount.status.error && (
                        <button
                          type="button"
                          onClick={() => cloudAccount.onRetry()}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent/15 text-accent hover:bg-accent/20 text-[11.5px] font-medium transition-colors"
                        >
                          <RefreshCw size={11} /> Retry sync
                        </button>
                      )}
                      {!cloudAccount.status.imported && (
                        <button
                          type="button"
                          onClick={() => cloudAccount.onImportLocal()}
                          className="px-2.5 py-1 rounded-lg bg-elevated hover:bg-border text-ink text-[11.5px] transition-colors"
                        >
                          Import local chats & projects
                        </button>
                      )}
                    </div>
                  )}

                  <div className="text-[10.5px] text-soft leading-relaxed">
                    Zero-leakage policy: Provider API keys, local credentials vault secrets, and private files stay 100% on this PC and never sync to cloud.
                  </div>
                </div>
              </div>

              {/* Legacy PC Bridge */}
              <div className="border-t border-border pt-4">
                <Field label="Legacy PC Bridge">
                  <label className="flex items-start gap-2.5 rounded-lg border border-border bg-bg px-3 py-2.5 text-[12px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(settings.bridgeEnabled)}
                      onChange={(e) =>
                        onChange({ ...settings, bridgeEnabled: e.target.checked })
                      }
                      className="mt-0.5 accent-[rgb(var(--nb-accent))]"
                    />
                    <span>
                      <span className="block text-ink font-medium">Connect to localhost:3030</span>
                      <span className="mt-0.5 block text-[10.5px] text-soft">
                        Only enable if intentionally running <code>npm run bridge</code> on this PC. Cloud chat sync does not require it.
                      </span>
                    </span>
                  </label>
                </Field>
              </div>
            </div>
          )}

          {/* TAB 2: CREDENTIALS VAULT */}
          {activeTab === "vault" && (
            <div className="space-y-4 animate-fade-in">
              {/* Security Banner */}
              <div className="rounded-xl border border-border bg-bg p-3.5 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-[12.5px] text-ink">
                  <Shield size={15} className="text-emerald-400" />
                  <span>Secure Local Credentials Vault</span>
                </div>
                <p className="text-[11.5px] text-muted leading-relaxed">
                  Store sensitive API keys, tokens, and secrets locally in <code>chrome.storage.local</code>. Secrets are resolved in memory at execution time and <strong>never</strong> synced to Convex cloud or exposed in chat transcripts.
                </p>
                <div className="text-[11px] text-soft pt-1">
                  In chat: use <code>$SECRET&#123;KEY_NAME&#125;</code> or the Key button in the composer bar.
                </div>
              </div>

              {/* Header + Add button */}
              <div className="flex items-center justify-between pt-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Stored Secrets ({credentials.length})
                </div>
                {!isEditingCred && (
                  <button
                    type="button"
                    onClick={() => {
                      setCredKeyInput("");
                      setCredValInput("");
                      setCredDescInput("");
                      setCredError("");
                      setIsEditingCred(true);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent text-white text-[11.5px] font-medium hover:brightness-110 transition-colors"
                  >
                    <Plus size={12} /> Add Secret
                  </button>
                )}
              </div>

              {/* Add / Edit Form */}
              {isEditingCred && (
                <form
                  onSubmit={handleSaveCred}
                  className="rounded-xl border border-border bg-elevated/80 p-3.5 space-y-3 animate-fade-in"
                >
                  <div className="text-xs font-semibold text-ink">
                    {credKeyInput ? `Configure ${credKeyInput}` : "Add Secret"}
                  </div>
                  <Field label="Key Name (e.g. GITHUB_TOKEN, AWS_KEY)">
                    <input
                      autoFocus
                      value={credKeyInput}
                      onChange={(e) => setCredKeyInput(e.target.value.toUpperCase())}
                      placeholder="KEY_NAME"
                      className="w-full bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:border-accent"
                    />
                  </Field>
                  <Field label="Secret Value">
                    <div className="flex items-center gap-1 bg-bg border border-border rounded-lg px-2.5 focus-within:border-accent">
                      <input
                        type={showKey ? "text" : "password"}
                        value={credValInput}
                        onChange={(e) => setCredValInput(e.target.value)}
                        placeholder="sk-..., ghp_..., or secret token"
                        className="flex-1 py-1.5 text-xs font-mono outline-none bg-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((v) => !v)}
                        className="p-1 text-muted hover:text-ink"
                      >
                        {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </Field>
                  <Field label="Description / Note (Optional)">
                    <input
                      value={credDescInput}
                      onChange={(e) => setCredDescInput(e.target.value)}
                      placeholder="e.g. Personal access token for GitHub scripts"
                      className="w-full bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-accent"
                    />
                  </Field>
                  {credError && <p className="text-danger text-xs">{credError}</p>}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingCred(false);
                        setCredError("");
                      }}
                      className="px-3 py-1.5 text-xs text-muted hover:text-ink border border-border rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!credKeyInput.trim() || !credValInput.trim()}
                      className="px-3.5 py-1.5 text-xs bg-accent text-white rounded-lg font-medium hover:brightness-110 disabled:opacity-50"
                    >
                      Save to Vault
                    </button>
                  </div>
                </form>
              )}

              {/* Secrets List */}
              {credentials.length === 0 && !isEditingCred ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted text-xs space-y-1">
                  <KeyRound size={24} className="mx-auto text-soft mb-2" />
                  <div className="font-medium text-ink">Vault is empty</div>
                  <div className="text-soft text-[11px]">
                    Add API keys or secrets to safely use them across chats without leaking them.
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {credentials.map((c) => {
                    const isRevealed = Boolean(showSecretMap[c.key]);
                    return (
                      <div
                        key={c.key}
                        className="rounded-xl border border-border bg-bg p-3 space-y-2 hover:border-border/80 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-xs font-semibold text-ink truncate">
                              {c.key}
                            </span>
                            <button
                              type="button"
                              onClick={() => copySecretTag(c.key)}
                              title="Copy $SECRET{...} tag for chat"
                              className="px-1.5 py-0.5 rounded bg-elevated border border-border text-[10px] font-mono text-soft hover:text-accent hover:border-accent/40 transition-colors flex items-center gap-1"
                            >
                              {copiedKey === c.key ? (
                                <>
                                  <Check size={10} className="text-emerald-400" /> Copied
                                </>
                              ) : (
                                <>
                                  <Copy size={9} /> $SECRET&#123;{c.key}&#125;
                                </>
                              )}
                            </button>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setCredKeyInput(c.key);
                                setCredValInput(c.value);
                                setCredDescInput(c.description || "");
                                setCredError("");
                                setIsEditingCred(true);
                              }}
                              className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-elevated transition-colors"
                              title="Edit secret"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCred(c.key)}
                              className="p-1.5 rounded-md text-muted hover:text-danger hover:bg-elevated transition-colors"
                              title="Delete secret"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>

                        {c.description && (
                          <div className="text-[11px] text-muted">{c.description}</div>
                        )}

                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50 text-[11px]">
                          <div className="font-mono text-soft truncate flex-1">
                            {isRevealed ? c.value : "••••••••••••••••"}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setShowSecretMap((prev) => ({
                                  ...prev,
                                  [c.key]: !prev[c.key],
                                }))
                              }
                              className="p-1 text-muted hover:text-ink"
                              title={isRevealed ? "Hide secret" : "Reveal secret"}
                            >
                              {isRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(c.value);
                                setCopiedKey(`val-${c.key}`);
                                setTimeout(() => setCopiedKey(null), 1400);
                              }}
                              className="p-1 text-muted hover:text-ink"
                              title="Copy plaintext secret"
                            >
                              {copiedKey === `val-${c.key}` ? (
                                <Check size={12} className="text-emerald-400" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MODELS & GENERATION */}
          {activeTab === "models" && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[12.5px] font-semibold text-ink">Active Models</div>
                  <div className="text-[11px] text-muted">
                    Catalog for {PROVIDER_LABELS[settings.activeProvider]}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={refreshModels}
                  disabled={modelsLoading}
                  className="px-2 py-1 text-[11px] rounded bg-elevated border border-border hover:border-accent text-ink flex items-center gap-1"
                >
                  <RefreshCw size={11} className={modelsLoading ? "animate-spin" : ""} /> Refresh
                </button>
              </div>

              {settings.activeProvider !== "custom_agent" && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Fast model">
                    <ModelSelect
                      value={provider.fastModel}
                      onChange={(v) => updateProvider({ fastModel: v })}
                      models={modelList?.models || []}
                      loading={modelsLoading}
                      placeholder="Fast model"
                    />
                  </Field>
                  <Field label="Quality model">
                    <ModelSelect
                      value={provider.qualityModel}
                      onChange={(v) => updateProvider({ qualityModel: v })}
                      models={modelList?.models || []}
                      loading={modelsLoading}
                      placeholder="Quality model"
                    />
                  </Field>
                </div>
              )}

              {/* Multimodal Models */}
              {Boolean(modelList?.imageModels && modelList.imageModels.length > 0) && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Fast image model">
                    <ModelSelect
                      value={provider.fastImageModel || ""}
                      onChange={(v) => updateProvider({ fastImageModel: v })}
                      models={modelList?.imageModels || []}
                      loading={modelsLoading}
                      placeholder="Image model"
                    />
                  </Field>
                  <Field label="Quality image model">
                    <ModelSelect
                      value={provider.qualityImageModel || ""}
                      onChange={(v) => updateProvider({ qualityImageModel: v })}
                      models={modelList?.imageModels || []}
                      loading={modelsLoading}
                      placeholder="Quality image model"
                    />
                  </Field>
                </div>
              )}

              {Boolean(modelList?.audioModels && modelList.audioModels.length > 0) && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Fast audio model">
                    <ModelSelect
                      value={provider.fastAudioModel || ""}
                      onChange={(v) => updateProvider({ fastAudioModel: v })}
                      models={modelList?.audioModels || []}
                      loading={modelsLoading}
                      placeholder="Audio model"
                    />
                  </Field>
                  <Field label="Quality audio model">
                    <ModelSelect
                      value={provider.qualityAudioModel || ""}
                      onChange={(v) => updateProvider({ qualityAudioModel: v })}
                      models={modelList?.audioModels || []}
                      loading={modelsLoading}
                      placeholder="Quality audio model"
                    />
                  </Field>
                </div>
              )}

              {/* Embedding Model */}
              <Field label="Embedding Model (Knowledge Base)">
                <input
                  value={provider.embeddingModel || ""}
                  onChange={(e) => updateProvider({ embeddingModel: e.target.value })}
                  placeholder="e.g. text-embedding-3-small, text-embedding-004"
                  className="w-full bg-bg border border-border rounded-lg px-2.5 py-1.5 text-[12px] font-mono outline-none"
                />
              </Field>

              {/* Temperature */}
              <Field
                label={`Temperature · ${settings.temperature.toFixed(2)}`}
                hint={
                  <span className="text-soft">
                    {settings.temperature < 0.3
                      ? "Precise"
                      : settings.temperature > 0.8
                      ? "Creative"
                      : "Balanced"}
                  </span>
                }
              >
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={settings.temperature}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      temperature: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-[rgb(var(--nb-accent))]"
                />
              </Field>

              {/* Jev Reflex Experiment */}
              <div className="border-t border-border pt-4">
                <JevExperiment settings={settings} onChange={onChange} />
              </div>
            </div>
          )}

          {/* TAB 4: PERSONAS & MEMORY */}
          {activeTab === "personas" && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[12.5px] font-semibold text-ink">Personas (Souls)</div>
                  <div className="text-[11px] text-muted">Customize Nerdbot’s tone and behavior</div>
                </div>
                {!isCreatingSoul && !editingSoulId && (
                  <button
                    type="button"
                    onClick={startCreateSoul}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent text-white text-[11.5px] font-medium hover:brightness-110 transition-colors"
                  >
                    <Plus size={12} /> New Persona
                  </button>
                )}
              </div>

              {/* Active Soul Selector */}
              <Field label="Active Persona">
                <select
                  value={settings.activeSoulId || "default"}
                  onChange={(e) =>
                    onChange({ ...settings, activeSoulId: e.target.value })
                  }
                  className="w-full bg-bg border border-border rounded-lg px-2.5 py-2 text-[12.5px] outline-none"
                >
                  <option value="default">🤖 Nerdbot (Default)</option>
                  {souls.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.emoji} {s.name}
                    </option>
                  ))}
                </select>
              </Field>

              {/* Create/Edit Persona Form */}
              {(isCreatingSoul || editingSoulId) && (
                <SoulEditForm
                  name={editName}
                  emoji={editEmoji}
                  prompt={editPrompt}
                  onName={setEditName}
                  onEmoji={setEditEmoji}
                  onPrompt={setEditPrompt}
                  onSave={saveSoulEdit}
                  onCancel={cancelSoulEdit}
                />
              )}

              {/* Souls List */}
              {souls.length > 0 && !isCreatingSoul && !editingSoulId && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                    Custom Personas
                  </div>
                  {souls.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-bg hover:border-border/80 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base">{s.emoji}</span>
                        <span className="text-[12.5px] font-medium text-ink truncate">{s.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEditSoul(s)}
                          className="p-1 text-muted hover:text-ink"
                          title="Edit persona"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSoul(s.id)}
                          className="p-1 text-muted hover:text-danger"
                          title="Delete persona"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Memory Provider */}
              <div className="border-t border-border pt-4 space-y-3">
                <div className="text-[12.5px] font-semibold text-ink">Long-Term Memory</div>
                <div className="text-[11px] text-muted">
                  Injected into every system prompt. Edit to teach Nerdbot persistent facts about you.
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11.5px] text-muted font-medium">Long-term facts</label>
                      <button
                        type="button"
                        onClick={saveFacts}
                        className="text-[11px] text-accent hover:underline flex items-center gap-1"
                      >
                        {factsSaved ? <><Check size={10} className="text-emerald-400" /> Saved</> : "Save"}
                      </button>
                    </div>
                    <textarea
                      value={facts}
                      onChange={(e) => setFacts(e.target.value)}
                      rows={3}
                      placeholder="e.g. Working on legion, prefers TypeScript, uses Tailwind…"
                      className="w-full bg-bg border border-border rounded-lg px-2.5 py-1.5 text-[11.5px] outline-none resize-none font-mono"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11.5px] text-muted font-medium">User profile</label>
                      <button
                        type="button"
                        onClick={saveUserProfile}
                        className="text-[11px] text-accent hover:underline flex items-center gap-1"
                      >
                        {userSaved ? <><Check size={10} className="text-emerald-400" /> Saved</> : "Save"}
                      </button>
                    </div>
                    <textarea
                      value={userProfile}
                      onChange={(e) => setUserProfile(e.target.value)}
                      rows={2}
                      placeholder="e.g. Name: Savv, Role: Systems & AI Engineer…"
                      className="w-full bg-bg border border-border rounded-lg px-2.5 py-1.5 text-[11.5px] outline-none resize-none font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Theme Selector */}
              <div className="border-t border-border pt-4">
                <Field label="Appearance Theme">
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["dark", "light", "system"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
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
                        className={`px-2.5 py-2 text-[12px] rounded-lg border transition-colors capitalize ${
                          settings.theme === t
                            ? "bg-accent/15 border-accent text-ink font-medium"
                            : "bg-bg border-border text-muted hover:text-ink"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              {/* Help & Bug Report */}
              <div className="border-t border-border pt-4">
                <button
                  type="button"
                  onClick={onReportBug}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border bg-bg text-muted hover:text-ink hover:border-accent/40 text-[12px] transition-colors"
                >
                  <Bug size={14} className="text-accent" />
                  <span>Report an Issue or Bug</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border bg-bg/80 text-[11px] text-muted shrink-0 flex items-center justify-between">
          <span>Nerdbot v1.0 · Sovereign AI</span>
          <span className="text-soft">Saved locally</span>
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
          placeholder="🤖"
        />
        <input
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="Persona name"
          className="flex-1 bg-bg border border-border rounded-lg px-2.5 py-1.5 text-[12px] outline-none"
        />
      </div>
      <textarea
        value={prompt}
        onChange={(e) => onPrompt(e.target.value)}
        rows={5}
        placeholder="Describe how this persona should behave…"
        className="w-full bg-bg border border-border rounded-lg px-2.5 py-2 text-[11.5px] outline-none resize-none font-mono"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-[11.5px] text-muted hover:text-ink border border-border rounded-lg"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!name.trim() || !prompt.trim()}
          className="px-3 py-1.5 text-[11.5px] bg-accent text-white rounded-lg font-medium hover:brightness-110 disabled:opacity-40"
        >
          Save Persona
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
