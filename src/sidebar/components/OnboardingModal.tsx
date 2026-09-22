import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import BrandMark from "./BrandMark";
import { SUGGESTIONS as HERO_SUGGESTIONS } from "./HeroEmpty";
import { validateApiKey } from "../../services/models";
import {
  OPENROUTER_FREE_MODEL,
  PROVIDER_LABELS,
} from "../../services/config";
import { withRetry } from "../../utils/retry";
import type { ProviderId, Settings } from "../../services/types";
import { hasAllUrls, requestAllUrls } from "../../services/permissions";
import { connectOpenRouter } from "../../services/openRouterAuth";
import {
  detectLocalProviders,
  preferredLocalModels,
} from "../../services/localProviders";

interface Props {
  open: boolean;
  settings: Settings;
  /** Persist the fully configured settings and close. */
  onComplete: (next: Settings) => void;
  /** Persist only onboardedAt and close. */
  onSkip: () => void;
  /** Skip onboarding and open the full Settings panel. */
  onOpenSettings: () => void;
  /** Fill the composer with a prompt (does not auto-send). */
  onTryPrompt: (text: string) => void;
}

type Step = "welcome" | "connect" | "validating" | "done";

/** First three HeroEmpty suggestions seed the "done" step. */
const SUGGESTIONS = HERO_SUGGESTIONS.slice(0, 3).map((s) => s.text);

const primaryBtn =
  "px-4 py-2 rounded-lg text-[13px] font-medium bg-accent text-bg hover:brightness-110 shadow-md shadow-accent/20 transition-all";
const ghostBtn =
  "px-3 py-1.5 rounded-lg text-[13px] text-muted hover:text-ink hover:bg-elevated";

export default function OnboardingModal({
  open,
  settings,
  onComplete,
  onSkip,
  onOpenSettings,
  onTryPrompt,
}: Props) {
  const [step, setStep] = useState<Step>("welcome");
  const [apiKey, setApiKey] = useState("");
  const [selectedProvider, setSelectedProvider] =
    useState<ProviderId>("openrouter");
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [localBusy, setLocalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageAccess, setPageAccess] = useState<
    "unknown" | "granted" | "denied"
  >("unknown");
  const [permissionBusy, setPermissionBusy] = useState(false);

  // Reset all local state whenever the wizard is (re)opened.
  useEffect(() => {
    if (open) {
      setStep("welcome");
      setApiKey("");
      setSelectedProvider("openrouter");
      setLocalModels([]);
      setLocalBusy(false);
      setError(null);
      setPageAccess("unknown");
      setPermissionBusy(false);
      void hasAllUrls().then((granted) => {
        if (granted) setPageAccess("granted");
      });
    }
  }, [open]);

  const startOpenRouterConnection = async () => {
    setError(null);
    setStep("validating");
    try {
      const key = await connectOpenRouter();
      await withRetry(
        () =>
          validateApiKey({
            ...settings.providers.openrouter,
            apiKey: key,
          }),
        2,
        (e) => e instanceof Error && !e.message.includes("Invalid API key"),
      );
      setApiKey(key);
      setSelectedProvider("openrouter");
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t connect OpenRouter");
      setStep("connect");
    }
  };

  if (!open) return null;

  const buildNext = (): Settings => {
    const current = settings.providers[selectedProvider];
    const configured =
      selectedProvider === "openrouter"
        ? {
            ...current,
            apiKey: apiKey.trim(),
            fastModel: OPENROUTER_FREE_MODEL,
            qualityModel: OPENROUTER_FREE_MODEL,
          }
        : {
            ...current,
            fastModel: localModels[0] || current.fastModel,
            qualityModel: localModels[1] || localModels[0] || current.qualityModel,
          };
    return {
      ...settings,
      activeProvider: selectedProvider,
      onboardedAt: Date.now(),
      providers: {
        ...settings.providers,
        [selectedProvider]: configured,
      },
    };
  };

  const detectAndUseLocalAi = async () => {
    setError(null);
    setLocalBusy(true);
    const { permissionGranted, results } = await detectLocalProviders(settings);
    setLocalBusy(false);
    if (!permissionGranted) {
      setError("Localhost access was not granted. You can still use OpenRouter or configure a provider in Settings.");
      return;
    }
    const found = results.find((result) => result.reachable && result.models.length > 0);
    if (!found) {
      setError("No ready Ollama or LM Studio server was found. Start a local server with a model loaded, or continue with OpenRouter.");
      return;
    }
    const recommended = preferredLocalModels(found);
    setSelectedProvider(found.id);
    setLocalModels([recommended.fastModel, recommended.qualityModel]);
    setStep("done");
  };

  // Commit the configured settings first, then optionally seed a prompt.
  const finish = (prompt?: string) => {
    onComplete(buildNext());
    if (prompt) onTryPrompt(prompt);
  };

  const requestPageAccess = async () => {
    setPermissionBusy(true);
    const granted = await requestAllUrls();
    setPageAccess(granted ? "granted" : "denied");
    setPermissionBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 bg-black/55 animate-fade-in">
      <div className="w-full max-w-[420px] rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between px-4 h-12 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <BrandMark size={18} className="shrink-0" />
            <div className="text-[13.5px] font-semibold leading-none">
              Welcome to Nerdbot
            </div>
          </div>
          <button
            onClick={onSkip}
            className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-elevated"
          >
            <X size={14} />
          </button>
        </div>

        {step === "welcome" && (
          <div className="p-5 space-y-4">
            <div className="flex flex-col items-center text-center gap-3 py-2">
              <div className="relative">
                <div
                  className="absolute inset-0 -m-3 rounded-full bg-accent/20 blur-xl"
                  aria-hidden="true"
                />
                <BrandMark size={52} className="relative" />
              </div>
              <div>
                <div className="text-[15px] font-semibold">
                  Your browser, now with a brain.
                </div>
                <p className="text-[13px] text-muted mt-1.5 max-w-[300px]">
                  Start with a free AI model. No Nerdbot subscription required.
                </p>
              </div>
            </div>
            <button
              onClick={() => setStep("connect")}
              className={`w-full ${primaryBtn}`}
            >
              Use Nerdbot Free
            </button>
          </div>
        )}

        {step === "connect" && (
          <>
            <div className="p-5 space-y-4">
              {error && (
                <div className="text-[12px] text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
              <div className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="text-[13.5px] font-semibold text-ink">
                    {PROVIDER_LABELS.openrouter}
                  </div>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent/20 text-accent">
                    Free model
                  </span>
                </div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
                  Sign in or create an account in the window that opens. No API
                  key to create, copy, or paste. No payment method required.
                  Free-model availability and rate limits can change.
                </p>
              </div>
              <button
                onClick={startOpenRouterConnection}
                className={`w-full ${primaryBtn}`}
              >
                Continue with OpenRouter
              </button>
              <div className="border-t border-border pt-4">
                <div className="text-[12.5px] font-medium text-ink">Already run AI locally?</div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  After you click, Nerdbot checks only the default Ollama and LM Studio localhost endpoints. It never reads CLI credentials.
                </p>
                <button
                  onClick={detectAndUseLocalAi}
                  disabled={localBusy}
                  className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-[12.5px] font-medium text-ink transition-colors hover:bg-elevated disabled:opacity-50"
                >
                  {localBusy ? "Checking this computer…" : "Check for local AI"}
                </button>
              </div>
              <button
                onClick={onOpenSettings}
                className="w-full text-center text-[11.5px] text-soft hover:text-ink pt-1"
              >
                Use another provider
              </button>
            </div>
            <div className="px-4 py-3 border-t border-border flex items-center bg-bg">
              <button onClick={() => setStep("welcome")} className={ghostBtn}>
                ← Back
              </button>
            </div>
          </>
        )}

        {step === "validating" && (
          <div className="p-8 flex flex-col items-center justify-center gap-3 text-center">
            <Loader2 size={26} className="text-accent animate-spin" />
            <div className="text-[13px] text-muted">Waiting for OpenRouter…</div>
          </div>
        )}

        {step === "done" && (
          <>
            <div className="p-4 space-y-3">
              <div className="flex flex-col items-center text-center gap-2 py-2">
                <div className="w-11 h-11 rounded-full bg-accent/15 flex items-center justify-center">
                  <Check size={22} className="text-accent" />
                </div>
                <div>
                  <div className="text-[14px] font-semibold">You’re all set</div>
                  <p className="text-[12.5px] text-muted mt-1 max-w-[280px]">
                    {selectedProvider === "openrouter"
                      ? "Connected to OpenRouter's free model. Free availability and limits can change."
                      : `Connected to ${PROVIDER_LABELS[selectedProvider]} on this computer.`}
                    {" "}Try one of these, or just start typing.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="rounded-xl border border-border bg-bg px-3.5 py-3 text-left">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[12.5px] font-medium text-ink">
                        Page access
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted">
                        Needed for page context, multi-tab sharing, screenshots,
                        and Quick Chat.
                      </div>
                    </div>
                    {pageAccess === "granted" ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-accent">
                        <Check size={13} /> Allowed
                      </span>
                    ) : (
                      <button
                        onClick={requestPageAccess}
                        disabled={permissionBusy}
                        className="shrink-0 rounded-lg border border-accent/50 px-2.5 py-1.5 text-[11.5px] font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
                      >
                        {permissionBusy
                          ? "Waiting…"
                          : pageAccess === "denied"
                            ? "Try again"
                            : "Allow"}
                      </button>
                    )}
                  </div>
                  {pageAccess === "denied" && (
                    <div className="mt-2 text-[10.5px] text-soft">
                      Not granted. Nerdbot still works, and you can enable page
                      access later by turning page sharing on.
                    </div>
                  )}
                </div>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => finish(s)}
                    className="w-full text-left text-[13px] text-ink/90 px-3.5 py-2.5 rounded-xl bg-surface hover:bg-elevated border border-border transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2 bg-bg">
              <button onClick={() => finish()} className={primaryBtn}>
                Start chatting
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
