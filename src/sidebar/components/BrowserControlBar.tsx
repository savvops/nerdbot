import { useEffect, useState } from 'react';
import { controlCommand, controlState } from '../../services/browserControl';

export default function BrowserControlBar() {
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
      } finally { checking = false; }
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
    setBusy(true); setError('');
    try { setTarget(await controlCommand({ op, url })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Browser unavailable'); }
    finally { setBusy(false); }
  };
  return <section className="border-b border-border px-3 py-2 text-xs space-y-1">
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-muted">{target ? `Control: ${target.title}` : 'PC Brave · no tab linked'}</span>
      <button disabled={busy} className="text-accent disabled:opacity-50 min-h-9 px-2 rounded border border-border" onClick={() => void run('bind')}>{busy ? 'Connecting…' : 'Control this tab'}</button>
      <button disabled={busy} className="text-accent disabled:opacity-50" onClick={() => {
        const url = window.prompt('Website for a new work tab (transfers control from the previous tab):', 'https://search.brave.com/');
        if (url) void run('newTab', url);
      }}>New work tab</button>
      {target && <button className="text-danger" onClick={() => void run('release')}>Release control</button>}
    </div>
    {target && <p className="text-muted truncate" title={target.url}>{target.url} · Clicks and field edits require approval.</p>}
    {!target && !error && <p className="text-muted">Select a website tab in PC Brave, then tap Control this tab.</p>}
    {error && <p role="alert" className="text-danger">{error}</p>}
  </section>;
}
