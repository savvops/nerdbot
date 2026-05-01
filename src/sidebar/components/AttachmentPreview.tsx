import { FileText, ImageIcon, X } from 'lucide-react';
import { dataUrl } from '../../services/attachments';
import type { Attachment } from '../../services/types';

interface Props {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

export default function AttachmentPreview({ attachments, onRemove }: Props) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex gap-2 flex-wrap mb-1.5 max-w-full">
      {attachments.map((a) => (
        <div
          key={a.id}
          className="group relative rounded-xl border border-border bg-elevated overflow-hidden flex items-center gap-2 pl-1 pr-1.5 py-1 max-w-[220px]"
        >
          {a.kind === 'image' || a.kind === 'screenshot' ? (
            <img
              src={dataUrl(a)}
              alt={a.name}
              className="w-10 h-10 rounded-lg object-cover shrink-0"
            />
          ) : (
            <span className="grid place-items-center w-10 h-10 rounded-lg bg-bg text-accent shrink-0">
              <FileText size={18} />
            </span>
          )}
          <span className="flex-1 min-w-0">
            <span className="block text-[12px] truncate">{a.name}</span>
            <span className="block text-[10px] text-muted">
              {a.kind === 'screenshot' ? 'Screenshot' : a.kind.toUpperCase()}
              {a.kind === 'pdf' && a.extractedText
                ? ` · ${Math.round(a.extractedText.length / 1000)}k chars`
                : ''}
            </span>
          </span>
          <button
            onClick={() => onRemove(a.id)}
            className="grid place-items-center w-5 h-5 rounded-full bg-bg/80 hover:bg-danger/80 text-muted hover:text-bg transition-colors shrink-0"
            title="Remove"
          >
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function AttachmentBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] text-muted">
      <ImageIcon size={10} /> {count}
    </span>
  );
}
