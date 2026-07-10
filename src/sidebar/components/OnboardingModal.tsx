import { useEffect, useState, type ReactNode } from "react";
import { Check, Eye, EyeOff, Loader2, X } from "lucide-react";
import BrandMark from "./BrandMark";
import { SUGGESTIONS as HERO_SUGGESTIONS } from "./HeroEmpty";
import ModelSelect from "./ModelSelect";
import { validateApiKey, type ModelInfo } from "../../services/models";
import { PROVIDER_DOCS, PROVIDER_LABELS } from "../../services/config";
import { withRetry } from "../../utils/retry";
import type { ProviderId, Settings } from "../../services/types";
import { hasAllUrls, requestAllUrls } from "../../services/permissions";

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

type Step = "welcome" | "provider" | "key" | "validating" | "models" | "done";

/** Only these two providers are offered during first-run onboarding. */
type OnboardProvider = Extract<ProviderId, "gemini" | "openrouter">;

/** First three HeroEmpty suggestions seed the "done" step. */
const SUGGESTIONS = HERO_SUGGESTIONS.slice(0, 3).map((s) => s.text);

const INSTRUCTIONS: Record<OnboardProvider, string[]> = {
  gemini: ["Open Google AI Studio", 'Click "Create API key"', "Paste it below"],
  openrouter: ["Open OpenRouter keys", "Create a key", "Paste it below"],
};

const primaryBtn =
  "px-4 py-2 rounded-lg text-[13px] font-medium bg-accent text-bg hover:brightness-110 shadow-md shadow-accent/20 transition-all";
const ghostBtn =
  "px-3 py-1.5 rounded-lg text-[13px] text-muted hover:text-ink hover:bg-elevated";

/** Small labelled wrapper matching the app's compact form-field style. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[11.5px] text-muted font-medium mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

export default function OnboardingModal({
  open,
  settings,
  onComplete,
  onSkip,
  onOpenSettings,
  onTryPrompt,
}: Props) {
  const [step, setStep] = useState<Step>("welcome");
  const [pid, setPid] = useState<OnboardProvider>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState<ModelInfo[]>([]);
  const [fastModel, setFastModel] = useState("");
  const [qualityModel, setQualityModel] = useState("");
  const [pageAccess, setPageAccess] = useState<
    "unknown" | "granted" | "denied"
  >("unknown");
  const [permissionBusy, setPermissionBusy] = useState(false);

  // Reset all local state whenever the wizard is (re)opened.
  useEffect(() => {
    if (open) {
      setStep("welcome");
      setPid("gemini");
      setApiKey("");
      setShowKey(false);
      setError(null);
      setFetched([]);
      setFastModel("");
      setQualityModel("");
      setPageAccess("unknown");
      setPermissionBusy(false);
      void hasAllUrls().then((granted) => {
        if (granted) setPageAccess("granted");
      });
    }
  }, [open]);

  // Validate the key on entering the "validating" step.
  useEffect(() => {
    if (step !== "validating") return;
    let cancelled = false;
    (async () => {
      try {
        const models = await withRetry(
          () =>
            validateApiKey({
              ...settings.providers[pid],
              apiKey: apiKey.trim(),
            }),
          2, // 1 retry
          (e) => e instanceof Error && !e.message.includes("Invalid API key"),
        );
        if (cancelled) return;
        const def = settings.providers[pid];
        // When the config default is missing from the live list, prefer a
        // model whose name suggests the right tier over an arbitrary first
        // entry (API order is unsorted and can lead with experimental models).
        const pick = (want: string, hint: RegExp) =>
          models.some((m) => m.id === want)
            ? want
            : (models.find((m) => hint.test(m.id))?.id ?? models[0]?.id ?? want);
        setFetched(models);
        setFastModel(pick(def.fastModel, /flash|mini|haiku|lite|small/i));
        setQualityModel(pick(def.qualityModel, /pro|sonnet|opus|large/i));
        setError(null);
        setStep("models");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Couldn’t verify the key");
        setStep("key");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (!open) return null;

  const buildNext = (): Settings => ({
    ...settings,
    activeProvider: pid,
    onboardedAt: Date.now(),
    providers: {
      ...settings.providers,
      [pid]: {
        ...settings.providers[pid],
        apiKey: apiKey.trim(),
        fastModel,
        qualityModel,
      },
    },
  });

  // Commit the configured settings first, then optionally seed a prompt.
  const finish = (prompt?: string) => {
    onComplete(buildNext());
    if (prompt) onTryPrompt(prompt);
  };

  const canContinueKey = apiKey.trim().length > 0;

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
                  Nerdbot runs on your own AI key — free tiers work great.
                </p>
              </div>
            </div>
            <button
              onClick={() => setStep("provider")}
              className={`w-full ${primaryBtn}`}
            >
              Get started
            </button>
          </div>
        )}

        {step === "provider" && (
          <>
            <div className="p-4 space-y-2.5">
              <div className="text-[12.5px] text-muted">
                Pick a provider to get your free key from.
              </div>
              {(["gemini", "openrouter"] as const).map((id) => {
                const selected = pid === id;
                return (
                  <button
                    key={id}
                    onClick={() => setPid(id)}
                    className={`w-full text-left px-3.5 py-3 rounded-xl border transition-colors ${
                      selected
                        ? "border-accent bg-accent/10"
                        : "border-border bg-surface hover:bg-elevated"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="text-[13.5px] font-semibold text-ink">
                        {PROVIDER_LABELS[id]}
                      </div>
                      {id === "gemini" && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent/20 text-accent">
                          Recommended
                        </span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-muted mt-0.5">
                      {id === "gemini"
                        ? "Generous free tier"
                        : "Free models available — one key, many models"}
                    </div>
                  </button>
                );
              })}
              <button
                onClick={onOpenSettings}
                className="w-full text-center text-[11.5px] text-soft hover:text-ink pt-1"
              >
                I’ll use something else / set up later
              </button>
            </div>
            <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-2 bg-bg">
              <button onClick={() => setStep("welcome")} className={ghostBtn}>
                ← Back
              </button>
              <button onClick={() => setStep("key")} className={primaryBtn}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === "key" && (
          <>
            <div className="p-4 space-y-3">
              {error && (
                <div className="text-[12px] text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
              <ol className="space-y-1.5">
                {INSTRUCTIONS[pid].map((t, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 text-[12.5px] text-soft"
                  >
                    <span className="shrink-0 w-4 h-4 rounded-full bg-elevated text-[10px] flex items-center justify-center text-muted font-medium">
                      {i + 1}
                    </span>
                    {t}
                  </li>
                ))}
              </ol>
              <button
                onClick={() => window.open(PROVIDER_DOCS[pid], "_blank")}
                className="w-full px-3 py-2 rounded-lg text-[13px] font-medium border border-accent/50 text-accent hover:bg-accent/10 transition-colors"
              >
                Get a key ↗
              </button>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoFocus
                  placeholder="Paste your API key"
                  className="w-full bg-bg border border-border focus:border-accent/50 rounded-lg pl-3 pr-9 py-2 text-[13px] outline-none"
                />
                <button
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted hover:text-ink"
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-2 bg-bg">
              <button onClick={() => setStep("provider")} className={ghostBtn}>
                ← Back
              </button>
              <button
                onClick={() => {
                  setError(null);
                  setStep("validating");
                }}
                disabled={!canContinueKey}
                className={
                  canContinueKey
                    ? primaryBtn
                    : "px-4 py-2 rounded-lg text-[13px] font-medium bg-elevated text-soft cursor-not-allowed"
                }
              >
                Continue
              </button>
            </div>
          </>
        )}

        {step === "validating" && (
          <div className="p-8 flex flex-col items-center justify-center gap-3 text-center">
            <Loader2 size={26} className="text-accent animate-spin" />
            <div className="text-[13px] text-muted">Checking your key…</div>
          </div>
        )}

        {step === "models" && (
          <>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-1.5 text-[13px] font-medium text-accent">
                <Check size={15} /> Key works
              </div>
              <Field label="Fast model">
                <ModelSelect
                  value={fastModel}
                  models={fetched}
                  onChange={setFastModel}
                />
              </Field>
              <Field label="Quality model">
                <ModelSelect
                  value={qualityModel}
                  models={fetched}
                  onChange={setQualityModel}
                />
              </Field>
            </div>
            <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-2 bg-bg">
              <button onClick={() => setStep("key")} className={ghostBtn}>
                ← Back
              </button>
              <button onClick={() => setStep("done")} className={primaryBtn}>
                Continue
              </button>
            </div>
          </>
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
                    Try one of these to get going, or just start typing.
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
