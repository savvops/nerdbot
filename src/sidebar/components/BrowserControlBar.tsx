import { useEffect, useState } from 'react';
import { Eye, EyeOff, Square, Sparkles } from 'lucide-react';
import { controlCommand, controlState } from '../../services/browserControl';

interface Props {
  activeTabTitle?: string;
  activeAction?: string;
  isControlling?: boolean;
  showBadges?: boolean;
  onToggleBadges?: () => void;
  onStop?: () => void;
  bridgeEnabled?: boolean;
}

export default function BrowserControlBar({
  activeTabTitle,
  activeAction,
  isControlling,
  showBadges,
  onToggleBadges,
  onStop,
  bridgeEnabled,
}: Props) {
  // If autonomous agent action is active
  if (isControlling || activeAction) {
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
                {activeAction || `Browser Agent on "${activeTabTitle || 'Page'}"`}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onToggleBadges && (
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
          )}

          {onStop && (
            <button
              onClick={onStop}
              className="px-2 py-1 rounded-md bg-rose-500/15 border border-rose-500/40 text-rose-300 hover:bg-rose-500/25 hover:text-rose-100 flex items-center gap-1 transition-colors text-[11px] font-medium"
              title="Emergency Stop: Halt browser action immediately"
            >
              <Square size={10} className="fill-rose-400 text-rose-400" />
              <span>Stop</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // If Legacy PC Bridge is enabled
  if (bridgeEnabled) {
    return <RemoteBridgeBar />;
  }

  return null;
}

function RemoteBridgeBar() {
  const [target, setTarget] = useState(controlState());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    let checking = false;
    const update = () => setTarget(controlState());
    const refresh = async () => {
      if (checking || document.visibilityState === 'hidden') return;
      checking = true;
      try {
        await controlCommand({ op: 'status' });
        if (mounted) setError('');
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Browser unavailable');
      } finally {
        checking = false;
      }
    };
    window.addEventListener('nerdbot-control-change', update);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    void refresh();
    const interval = window.setInterval(refresh, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener('nerdbot-control-change', update);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const run = async (op: string, url?: string) => {
    setBusy(true);
    setError('');
    try {
      setTarget(await controlCommand({ op, url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Browser unavailable');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border-b border-border px-3 py-2 text-xs space-y-1">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-muted">
          {target ? `Control: ${target.title}` : 'PC Brave · no tab linked'}
        </span>
        <button
          disabled={busy}
          className="text-accent disabled:opacity-50 min-h-9 px-2 rounded border border-border"
          onClick={() => void run('bind')}
        >
          {busy ? 'Connecting…' : 'Control this tab'}
        </button>
        <button
          disabled={busy}
          className="text-accent disabled:opacity-50"
          onClick={() => {
            const url = window.prompt(
              'Website for a new work tab (transfers control from the previous tab):',
              'https://search.brave.com/'
            );
            if (url) void run('newTab', url);
          }}
        >
          New work tab
        </button>
        {target && (
          <button className="text-danger" onClick={() => void run('release')}>
            Release control
          </button>
        )}
      </div>
      {target && (
        <p className="text-muted truncate" title={target.url}>
          {target.url} · Clicks and field edits require approval.
        </p>
      )}
      {!target && !error && (
        <p className="text-muted">
          Select a website tab in PC Brave, then tap Control this tab.
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
