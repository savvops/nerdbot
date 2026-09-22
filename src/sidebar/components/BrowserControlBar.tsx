import { Eye, EyeOff, Square, Sparkles } from 'lucide-react';

interface Props {
  activeTabTitle?: string;
  activeAction?: string;
  isControlling: boolean;
  showBadges: boolean;
  onToggleBadges: () => void;
  onStop: () => void;
}

export default function BrowserControlBar({
  activeTabTitle,
  activeAction,
  isControlling,
  showBadges,
  onToggleBadges,
  onStop,
}: Props) {
  if (!isControlling && !activeAction) return null;

  return (
    <div className="bg-surface/90 backdrop-blur border-b border-border/80 px-3 py-2 flex items-center justify-between gap-2 text-[12px] animate-slide-up shadow-sm">
      <div className="flex items-center gap-2 min-w-0">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-medium text-ink truncate">
            <Sparkles size={11} className="text-accent shrink-0" />
            <span className="truncate">
              {activeAction || `Browser Agent on “${activeTabTitle || 'Page'}”`}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onToggleBadges}
          className={`p-1.5 rounded-md border text-[11px] flex items-center gap-1 transition-colors ${
            showBadges
              ? 'bg-accent/15 border-accent/40 text-ink'
              : 'bg-elevated border-border text-muted hover:text-ink'
          }`}
          title={showBadges ? 'Hide element badge overlay' : 'Show element badge overlay'}
        >
          {showBadges ? <Eye size={12} className="text-accent" /> : <EyeOff size={12} />}
          <span className="hidden sm:inline">Badges</span>
        </button>

        <button
          onClick={onStop}
          className="px-2 py-1 rounded-md bg-rose-500/15 border border-rose-500/40 text-rose-300 hover:bg-rose-500/25 hover:text-rose-100 flex items-center gap-1 transition-colors text-[11px] font-medium"
          title="Emergency Stop: Halt browser action immediately"
        >
          <Square size={10} className="fill-rose-400 text-rose-400" />
          <span>Stop</span>
        </button>
      </div>
    </div>
  );
}
