import { useEffect, useRef, useState } from 'react';
import type { Settings } from '../../services/types';
import { evaluateJev, JEV_MODEL, type JevDecision } from '../../services/jev';
import { requestOriginAccess } from '../../services/permissions';

export default function JevExperiment({ settings, onChange }: {
  settings: Settings;
  onChange: (settings: Settings) => void;
}) {
  const hasOpenRouterKey = !!settings.providers.openrouter.apiKey.trim();
  const [prompt, setPrompt] = useState('Find black T-shirts on the current website.');
  const [result, setResult] = useState<JevDecision | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (!settings.experimentalJev) pending.current?.abort();
  }, [settings.experimentalJev]);
  const run = async () => {
    const controller = new AbortController();
    pending.current?.abort();
    pending.current = controller;
    setBusy(true); setError(''); setResult(null);
    try {
      if (!await requestOriginAccess('https://openrouter.ai')) throw new Error('OpenRouter access was not granted.');
      const decision = await evaluateJev(settings, prompt, controller.signal);
      if (!controller.signal.aborted) setResult(decision);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Jev unavailable.');
    } finally {
      if (pending.current === controller) setBusy(false);
    }
  };
  return <section className="rounded-xl border border-border p-3 space-y-3">
    <label className="flex items-center gap-2 text-sm font-medium">
      <input type="checkbox" checked={!!settings.experimentalJev}
        onChange={(e) => onChange({ ...settings, experimentalJev: e.target.checked })} />
      Jev smart routing · OpenRouter
    </label>
    <p className="text-xs text-muted">When enabled, Jev classifies each request before chat and exposes only the tools it needs: chat, search, browser, or clarify. Low-confidence decisions and Jev errors fall back to normal chat. Clicks and field edits still require approval. Usage is billed separately by OpenRouter.</p>
    {settings.experimentalJev && !hasOpenRouterKey && <p role="alert" className="text-xs text-danger">Add an OpenRouter API key before using Jev. Until then, requests immediately fall back to normal chat.</p>}
    {settings.experimentalJev && <>
      <details className="rounded-lg border border-border p-2">
        <summary className="cursor-pointer text-xs text-muted">Test the router</summary>
      <label className="mt-2 block text-xs text-muted">Request to evaluate
        <textarea className="mt-1 w-full bg-bg border border-border rounded-lg p-2 text-ink" rows={3}
          value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={12000} />
      </label>
      <button type="button" className="rounded-lg bg-accent/15 text-accent px-3 py-2 text-xs disabled:opacity-50"
        disabled={busy || !prompt.trim()} onClick={run}>{busy ? 'Evaluating…' : 'Test decision'}</button>
      <div className="text-[10px] text-muted">{JEV_MODEL}</div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {result && <div role="status" className="text-xs space-y-1">
        <p>Suggested route: <strong>{result.choice}</strong> · {result.elapsedMs} ms</p>
        {Object.entries(result.probabilities).map(([route, p]) => <p key={route}>{route}: {(p * 100).toFixed(1)}%</p>)}
        <p className="text-muted">Model confidence: {(result.confidence * 100).toFixed(1)}%. This is not a guarantee of correctness.</p>
      </div>}
      </details>
    </>}
  </section>;
}
