import { AlertTriangle, ShieldAlert, X } from 'lucide-react';

interface Props {
  actionName: string;
  targetDescription: string;
  reason: string;
  onConfirm: () => void;
  onDeny: () => void;
}

export default function SafetyConfirmModal({
  actionName,
  targetDescription,
  reason,
  onConfirm,
  onDeny,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-elevated border border-rose-500/40 rounded-2xl max-w-sm w-full p-4 shadow-2xl flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 text-rose-400 font-semibold text-[14px]">
            <ShieldAlert size={18} />
            <span>High-Risk Action Confirmation</span>
          </div>
          <button
            onClick={onDeny}
            className="text-muted hover:text-ink p-1 rounded-md"
          >
            <X size={14} />
          </button>
        </div>

        <p className="text-[13px] text-ink leading-relaxed">
          Nerdbot is preparing to execute a critical action:
        </p>

        <div className="bg-surface/80 border border-border p-2.5 rounded-xl text-[12px] flex flex-col gap-1">
          <div>
            <span className="text-muted font-medium">Action: </span>
            <span className="font-mono text-ink uppercase">{actionName}</span>
          </div>
          <div>
            <span className="text-muted font-medium">Target: </span>
            <span className="text-ink font-medium">“{targetDescription}”</span>
          </div>
          <div className="text-[11px] text-rose-300/90 mt-1 flex items-center gap-1">
            <AlertTriangle size={11} className="shrink-0" />
            <span>{reason}</span>
          </div>
        </div>

        <p className="text-[11.5px] text-muted">
          Do you authorize the browser agent to proceed with this action?
        </p>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onDeny}
            className="px-3 py-1.5 rounded-lg border border-border bg-surface text-ink hover:bg-surface/80 text-[12px] font-medium transition-colors"
          >
            Deny & Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[12px] font-medium transition-colors shadow-sm"
          >
            Authorize Action
          </button>
        </div>
      </div>
    </div>
  );
}
