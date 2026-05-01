import { AlertCircle, X } from 'lucide-react';

interface Props {
  message: string;
  onDismiss: () => void;
  onSettings?: () => void;
}

export default function ErrorBanner({ message, onDismiss, onSettings }: Props) {
  return (
    <div className="mx-3 mb-2 p-2.5 rounded-xl bg-danger/10 border border-danger/40 text-[12.5px] text-ink flex items-start gap-2 animate-slide-up">
      <AlertCircle size={14} className="text-danger mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-danger">Couldn’t complete that</div>
        <div className="text-muted mt-0.5 break-words">{message}</div>
        {onSettings && (
          <button
            onClick={onSettings}
            className="mt-1.5 text-accent hover:underline text-[12px]"
          >
            Open settings →
          </button>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="p-1 rounded text-muted hover:text-ink hover:bg-elevated"
      >
        <X size={12} />
      </button>
    </div>
  );
}
