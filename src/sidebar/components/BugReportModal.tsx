import { useEffect, useState } from "react";
import { Bug, X } from "lucide-react";
import type { Settings } from "../../services/types";

export const BUG_REPORT_EMAIL = "admin@savvstudio.com";

interface Props {
  open: boolean;
  settings: Settings;
  onClose: () => void;
}

function extensionVersion(): string {
  try {
    return chrome?.runtime?.getManifest?.().version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** Non-sensitive diagnostic info that helps triage a report. No API keys. */
function buildDiagnostics(settings: Settings): string {
  const model =
    settings.speed === "fast"
      ? settings.providers[settings.activeProvider]?.fastModel
      : settings.providers[settings.activeProvider]?.qualityModel;
  const lines = [
    `Nerdbot version: ${extensionVersion()}`,
    `Provider: ${settings.activeProvider}`,
    `Model: ${model ?? "unknown"} (${settings.speed})`,
    `Persona: ${settings.activeSoulId ?? "default"}`,
    `Web search: ${settings.webSearch ? "on" : "off"}`,
    `Theme: ${settings.theme}`,
    `User agent: ${typeof navigator !== "undefined" ? navigator.userAgent : "unknown"}`,
  ];
  return lines.join("\n");
}

export default function BugReportModal({ open, settings, onClose }: Props) {
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);

  useEffect(() => {
    if (open) {
      setDescription("");
      setSteps("");
      setIncludeDiagnostics(true);
    }
  }, [open]);

  if (!open) return null;

  const canSend = description.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    const bodyParts = [
      "What went wrong:",
      description.trim(),
    ];
    if (steps.trim()) {
      bodyParts.push("", "Steps to reproduce:", steps.trim());
    }
    if (includeDiagnostics) {
      bodyParts.push("", "---", "Diagnostics:", buildDiagnostics(settings));
    }
    const subject = `Nerdbot bug report (v${extensionVersion()})`;
    const mailto = `mailto:${BUG_REPORT_EMAIL}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(bodyParts.join("\n"))}`;
    // Open the user's mail client. window.open keeps the side panel intact.
    window.open(mailto, "_blank");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 bg-black/55 animate-fade-in">
      <div className="w-full max-w-[420px] rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between px-4 h-12 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <Bug size={16} className="text-accent shrink-0" />
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold leading-none">
                Report a bug
              </div>
              <div className="text-[11px] text-muted mt-0.5 truncate">
                Sends to {BUG_REPORT_EMAIL}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-elevated"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="block text-[11.5px] text-muted font-medium mb-1">
              What went wrong?
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Describe the bug you ran into…"
              className="w-full bg-bg border border-border focus-within:border-accent/50 rounded-lg px-3 py-2 text-[13px] outline-none resize-none"
            />
          </div>

          <div>
            <label className="block text-[11.5px] text-muted font-medium mb-1">
              Steps to reproduce{" "}
              <span className="text-soft font-normal">(optional)</span>
            </label>
            <textarea
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              rows={3}
              placeholder={"1. …\n2. …\n3. …"}
              className="w-full bg-bg border border-border focus-within:border-accent/50 rounded-lg px-3 py-2 text-[13px] outline-none resize-none"
            />
          </div>

          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeDiagnostics}
              onChange={(e) => setIncludeDiagnostics(e.target.checked)}
              className="w-3.5 h-3.5 mt-0.5 accent-[rgb(var(--nb-accent))]"
            />
            <span className="text-[11.5px] text-soft leading-snug">
              Include diagnostics (version, provider, model, browser). No API
              keys or chat content are ever included.
            </span>
          </label>
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2 bg-bg">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-[13px] text-muted hover:text-ink hover:bg-elevated"
          >
            Cancel
          </button>
          <button
            onClick={send}
            disabled={!canSend}
            className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
              canSend
                ? "bg-accent text-bg hover:brightness-110 shadow-md shadow-accent/20"
                : "bg-elevated text-soft cursor-not-allowed"
            }`}
          >
            Send report
          </button>
        </div>
      </div>
    </div>
  );
}
