import { DEFAULT_SETTINGS } from '../services/config';
import type { Settings } from '../services/types';

const realFetch = window.fetch.bind(window);
const providerOrigins: Record<string, string> = {
  'https://generativelanguage.googleapis.com': 'gemini',
  'https://api.openai.com': 'openai',
  'https://openrouter.ai': 'openrouter',
  'https://integrate.api.nvidia.com': 'nvidia',
  'https://api.anthropic.com': 'anthropic',
  'http://localhost:1234': 'lmstudio',
  'http://localhost:11434': 'ollama',
};

// Explicit transport adapter: only provider calls use the PC proxy. No arbitrary
// destinations, Chrome API emulation, browser profiles, or credential export.
window.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url, location.href);
  const provider = providerOrigins[url.origin];
  if (!provider) return realFetch(input, init);
  const headers = Object.fromEntries(request.headers.entries());
  return realFetch('/api/inference', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, path: url.pathname + url.search, method: request.method, headers,
      body: request.method === 'GET' ? undefined : await request.text() }),
    signal: request.signal,
  });
};

async function boot() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4000);
  try {
    const res = await realFetch('/api/mobile-settings', { signal: controller.signal });
    if (res.ok) {
      const pc = await res.json() as Partial<Settings>;
      const raw = localStorage.getItem('nerdbot.settings.v1');
      const saved = raw ? JSON.parse(raw) as Partial<Settings> : {};
      const providers = Object.fromEntries(Object.entries(DEFAULT_SETTINGS.providers).map(([id, defaults]) => {
        const key = id as keyof Settings['providers'];
        const desktop = pc.providers?.[key];
        const mobile = saved.providers?.[key];
        return [id, { ...defaults, ...desktop, ...mobile,
          apiKey: mobile?.apiKey && mobile.apiKey !== 'managed-by-pc' ? mobile.apiKey : desktop?.apiKey || '' }];
      }));
      localStorage.setItem('nerdbot.settings.v1', JSON.stringify({ ...DEFAULT_SETTINGS, ...pc, ...saved, providers,
        onboardedAt: saved.onboardedAt || Date.now(), experimentalJev: saved.experimentalJev === true }));
    }
  } catch { /* Standalone setup stays usable while the bridge is offline. */ }
  finally { window.clearTimeout(timeout); }
  // Migrate the old Expo chat once. Keep the original key untouched for rollback.
  try {
    if (!localStorage.getItem('nerdbot.chat.current.v1')) {
      const messages = JSON.parse(localStorage.getItem('@nerdbot_mobile_messages') || '[]');
      if (Array.isArray(messages) && messages.length) {
        const now = Date.now();
        localStorage.setItem('nerdbot.chat.current.v1', JSON.stringify({ id: crypto.randomUUID(), title: 'Mobile conversation',
          createdAt: now, updatedAt: now, messages: messages.filter((m) => m && typeof m.content === 'string').map((m) => ({ ...m, pending: false, isStreaming: false })) }));
      }
    }
  } catch { /* Preserve malformed legacy storage rather than overwriting it. */ }
  await import('../sidebar/main');
}
void boot().catch((error: unknown) => {
  const status = document.getElementById('startup-status');
  if (status) status.textContent = `Nerdbot could not start: ${error instanceof Error ? error.message : 'startup failed'}. Tap Reload Nerdbot to retry.`;
});
