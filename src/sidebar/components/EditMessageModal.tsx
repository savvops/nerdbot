import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  initial: string;
  onClose: () => void;
  onSave: (text: string) => void;
}

export default function EditMessageModal({ open, initial, onClose, onSave }: Props) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (open) setText(initial);
  }, [open, initial]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 bg-black/55 animate-fade-in">
      <div className="w-full max-w-[420px] rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between px-4 h-12 border-b border-border">
          <div>
            <div className="text-[13.5px] font-semibold">Edit message</div>
            <div className="text-[11px] text-muted">Resends and discards the old reply</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-elevated">
            <X size={14} />
          </button>
        </div>

        <div className="p-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            autoFocus
            className="w-full bg-bg border border-border focus-within:border-accent/50 rounded-lg px-3 py-2 text-[13.5px] outline-none resize-none"
          />
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2 bg-bg">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-[13px] text-muted hover:text-ink hover:bg-elevated"
          >
            Cancel
          </button>
          <button
            onClick={() => text.trim() && onSave(text.trim())}
            disabled={!text.trim()}
            className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
              text.trim()
                ? 'bg-accent text-bg hover:brightness-110 shadow-md shadow-accent/20'
                : 'bg-elevated text-soft cursor-not-allowed'
            }`}
          >
            Resend
          </button>
        </div>
      </div>
    </div>
  );
}
