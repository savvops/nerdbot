import { Readable } from 'node:stream';

const origins = {
  gemini: 'https://generativelanguage.googleapis.com', openai: 'https://api.openai.com',
  openrouter: 'https://openrouter.ai', nvidia: 'https://integrate.api.nvidia.com',
  anthropic: 'https://api.anthropic.com', lmstudio: 'http://localhost:1234', ollama: 'http://localhost:11434',
};
const allowed = {
  gemini: /^\/v1beta\/models(?:\/[a-zA-Z0-9_.%-]+:(?:streamGenerateContent|generateContent|embedContent|batchEmbedContents))?$/,
  openrouter: /^\/api\/(?:v1\/(?:models|key|chat\/completions|embeddings)|alpha\/decisions)$/,
  anthropic: /^\/v1\/(?:models|messages)$/,
  default: /^\/v1\/(?:models|chat\/completions|embeddings|images\/generations|audio\/speech)$/,
};

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function body(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 12 * 1024 * 1024) throw new Error('Request too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}

export function safeSettings(settings) {
  if (!settings) return {};
  const providers = {};
  for (const [id, cfg] of Object.entries(settings.providers || {})) {
    if (!origins[id] || !cfg) continue;
    providers[id] = { id, apiKey: cfg.apiKey ? 'managed-by-pc' : '',
      baseUrl: origins[id] + (id === 'gemini' ? '/v1beta' : id === 'openrouter' ? '/api/v1' : '/v1') };
    for (const key of ['fastModel', 'qualityModel', 'fastImageModel', 'qualityImageModel', 'fastAudioModel', 'qualityAudioModel', 'embeddingModel', 'visionEnabled']) {
      if (typeof cfg[key] === 'string' || typeof cfg[key] === 'boolean') providers[id][key] = cfg[key];
    }
  }
  return { activeProvider: settings.activeProvider || settings.activeProviderId || 'gemini', speed: settings.speed || settings.mode || 'fast', providers };
}

export async function mobileRoutes(req, res, settings, requestExtension) {
  const route = new URL(req.url, 'http://localhost').pathname;
  if (!['/api/mobile-settings', '/api/inference', '/api/browser', '/api/mobile-context'].includes(route)) return false;
  // Same-origin mobile server proxies from loopback. Do not allow drive-by webpages.
  const origin = req.headers.origin;
  if (origin && origin !== 'http://127.0.0.1:3030') { json(res, 403, { error: 'Origin denied' }); return true; }
  try {
    if (route === '/api/mobile-settings' && req.method === 'GET') { json(res, 200, safeSettings(settings)); return true; }
    if (route === '/api/mobile-context' && req.method === 'GET') {
      const data = await requestExtension('GET_PAGE_CONTEXT', {});
      json(res, 200, { ok: !data.error, data, error: data.error }); return true;
    }
    if (req.method !== 'POST') { json(res, 405, { error: 'Method not allowed' }); return true; }
    const input = await body(req);
    if (route === '/api/browser') {
      if (!['status', 'bind', 'newTab', 'release', 'observe', 'scroll', 'navigate', 'prepare', 'commit', 'screenshot'].includes(input.op)) throw new Error('Unsupported browser operation.');
      const result = await requestExtension('BROWSER_REQUEST', input);
      json(res, 200, result); return true;
    }
    const { provider, path, method = 'POST', headers: supplied = {}, body: payload } = input;
    if (!Object.hasOwn(origins, provider) || typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) throw new Error('Provider not supported.');
    const url = new URL(path, origins[provider]);
    if (url.origin !== origins[provider] || !(allowed[provider] || allowed.default).test(url.pathname)) throw new Error('Endpoint not allowed.');
    const isRead = /\/(models|key)$/.test(url.pathname);
    if (method !== (isRead ? 'GET' : 'POST')) throw new Error('Method not allowed.');
    let key = String(supplied.authorization || supplied['x-api-key'] || url.searchParams.get('key') || '').replace(/^Bearer /i, '');
    if (key === 'managed-by-pc') key = settings?.providers?.[provider]?.apiKey || '';
    url.searchParams.delete('key');
    if (!key && !['lmstudio', 'ollama'].includes(provider)) throw new Error('Add a provider key in Settings or connect the PC extension.');
    const headers = { 'Content-Type': 'application/json' };
    if (provider === 'gemini') url.searchParams.set('key', key);
    else if (provider === 'anthropic') { headers['x-api-key'] = key; headers['anthropic-version'] = '2023-06-01'; }
    else headers.Authorization = `Bearer ${key}`;
    if (provider === 'openrouter') headers['X-Title'] = 'Nerdbot Mobile';
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 120000);
    res.on('close', () => ctrl.abort());
    try {
      const upstream = await fetch(url, { method, headers, body: method === 'GET' ? undefined : payload, signal: ctrl.signal, redirect: 'error' });
      if (!upstream.ok) { json(res, upstream.status, { error: `${provider} returned HTTP ${upstream.status}. Check the key, model access and provider limits.` }); return true; }
      res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' });
      if (upstream.body) await new Promise((resolve, reject) => {
        const stream = Readable.fromWeb(upstream.body);
        stream.on('error', reject); res.on('finish', resolve); res.on('close', resolve); stream.pipe(res);
      });
      else res.end();
    } finally { clearTimeout(timeout); }
  } catch (e) {
    if (!res.headersSent) json(res, 400, { ok: false, error: e.message || 'Request failed.' });
    else res.end();
  }
  return true;
}
