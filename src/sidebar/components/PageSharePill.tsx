import { Globe, X } from 'lucide-react';
import type { PageContext } from '../../services/types';
import { shortHost } from '../../services/pageContext';

interface Props {
  page: PageContext | null;
  enabled: boolean;
  onToggle: () => void;
}

export default function PageSharePill({ page, enabled, onToggle }: Props) {
  if (!page) return null;
  const label = page.title?.trim() || shortHost(page.url) || 'Active tab';
  return (
    <button
      onClick={onToggle}
      className={`group inline-flex items-center gap-1.5 max-w-full pl-2 pr-1.5 py-1 rounded-full text-[11.5px] border transition-all ${
        enabled
          ? 'bg-accent/15 border-accent/40 text-ink'
          : 'bg-surface border-border text-muted hover:text-ink'
      }`}
      title={enabled ? 'Stop sharing this tab' : 'Share this tab'}
    >
      <Globe size={11} className={enabled ? 'text-accent' : ''} />
      <span className="truncate max-w-[200px]">
        {enabled ? 'Sharing' : 'Share'} “{label}”
      </span>
      {enabled && (
        <span className="ml-0.5 grid place-items-center w-4 h-4 rounded-full hover:bg-accent/25">
          <X size={10} />
        </span>
      )}
    </button>
  );
}
