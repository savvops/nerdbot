import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { safeSettings, mobileRoutes } from '../bridge/mobile-routes.mjs';
import http from 'node:http';

async function moduleAt(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22' });
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const store = { 'nerdbot.settings.v1': { activeProvider: 'openrouter', providers: { openrouter: { apiKey: 'test-openrouter-key', fastModel: 'existing-model' } } } };
let active = true;
const executed = [];
globalThis.chrome = {
  storage: { local: { get(keys, cb) { cb(store); } } },
  tabs: { onRemoved: { addListener() {} }, query: async () => [{ id: 7, active, url: 'https://example.com/', title: 'Test tab' }],
    get: async (id) => ({ id, active, url: 'https://example.com/', title: 'Test tab' }),
    create: async ({ url }) => ({ id: 9, active: true, url }), update: async (id, patch) => { executed.push({ tabId: id, patch }); } },
  scripting: { executeScript: async (args) => { executed.push(args); return [{ result: { label: 'Search', snapshot: 's1', text: 'Loaded page', readyState: 'complete' } }]; } },
};
const config = await moduleAt('src/services/config.ts');
const settings = await config.loadSettings();
assert.equal(settings.providers.openrouter.fastModel, 'existing-model');
assert.equal(settings.providers.nvidia.baseUrl, 'https://integrate.api.nvidia.com/v1');
assert.equal(settings.experimentalJev, false);

const jev = await moduleAt('src/services/jev.ts');
const good = { answers: { route: { choice: 'browser', confidence: 0.8, probabilities: { chat: 0.1, search: 0.1, browser: 0.8, clarify: 0 } } } };
assert.equal(jev.parseJevDecision(good, 100).choice, 'browser');
assert.throws(() => jev.parseJevDecision({ answers: { route: { ...good.answers.route, choice: '__proto__' } } }, 0));
assert.throws(() => jev.parseJevDecision({ answers: { route: { ...good.answers.route, probabilities: { ...good.answers.route.probabilities, browser: 2 } } } }, 0));
const realFetch = globalThis.fetch;
let requests = [];
globalThis.fetch = async (url, init) => { requests.push({ url, init }); return new Response(JSON.stringify(good)); };
await assert.rejects(jev.evaluateJev(settings, 'test'), /Enable/);
assert.equal(requests.length, 0);
await jev.evaluateJev({ ...settings, activeProvider: 'nvidia', experimentalJev: true }, 'Find a product');
assert.equal(requests[0].url, 'https://openrouter.ai/api/alpha/decisions');
assert.equal(requests[0].init.headers.Authorization, 'Bearer test-openrouter-key');
assert.equal(JSON.parse(requests[0].init.body).model, 'typesafe/jev-1.13');
globalThis.fetch = async () => new Response('{}', { status: 429 });
await assert.rejects(jev.evaluateJev({ ...settings, experimentalJev: true }, 'test'), /429/);

const models = await moduleAt('src/services/models.ts');
const catalog = models.categorizeModels([
  { id: 'gemini-3.5-flash', label: 'Gemini Flash', methods: ['generateContent'] },
  { id: 'gemini-3.1-flash-image', label: 'Gemini Flash Image', methods: ['generateContent'], outputModalities: ['text', 'image'] },
  { id: 'imagen-4.0-generate-001', label: 'Imagen 4', methods: ['predict'] },
  { id: 'lyria-3-pro-preview', label: 'Lyria 3 Pro', methods: ['predict'], outputModalities: ['audio'] },
  { id: 'gemini-embedding-001', label: 'Gemini Embedding' },
]);
assert.deepEqual(catalog.chat.map((model) => model.id), ['gemini-3.5-flash']);
assert.deepEqual(catalog.image.map((model) => model.id), ['gemini-3.1-flash-image', 'imagen-4.0-generate-001']);
assert.deepEqual(catalog.audio.map((model) => model.id), ['lyria-3-pro-preview']);
requests = [];
globalThis.fetch = async (url, init) => { requests.push({ url, init }); return new Response('{}', { status: 401 }); };
await assert.rejects(models.validateApiKey(settings.providers.nvidia), /Invalid API key/);
assert.match(requests[0].url, /chat\/completions$/);
assert.equal(JSON.parse(requests[0].init.body).max_tokens, 1);
globalThis.fetch = realFetch;

const controller = await moduleAt('src/extension/browserController.ts');
await assert.rejects(controller.browserCommand({ op: 'observe', session: 'invented' }), /expired/);
const first = await controller.browserCommand({ op: 'bind' });
await assert.rejects(controller.browserCommand({ op: 'navigate', session: first.session, url: 'javascript:alert(1)' }), /HTTP/);
await assert.rejects(controller.browserCommand({ op: 'commit', session: first.session, approval: 'invented' }), /expired/);
await controller.browserCommand({ op: 'observe', session: first.session, tabId: 999 });
assert.equal(executed.at(-1).target.tabId, 7);
const originalScript = chrome.scripting.executeScript;
let observations = 0;
chrome.scripting.executeScript = async () => [{ result: ++observations === 1
  ? { text: '', elements: [], readyState: 'loading' }
  : { text: 'Portfolio loaded', elements: [], readyState: 'complete' } }];
const settled = await controller.browserCommand({ op: 'observe', session: first.session });
assert.equal(settled.text, 'Portfolio loaded');
assert.equal(settled.status, 'ready');
assert.equal(observations, 2);
chrome.scripting.executeScript = originalScript;
active = false;
await assert.rejects(controller.browserCommand({ op: 'observe', session: first.session }), /no longer active/);
active = true;
const approval = await controller.browserCommand({ op: 'prepare', session: first.session, action: 'click', ref: '0', snapshot: 's1' });
await controller.browserCommand({ op: 'release' });
await assert.rejects(controller.browserCommand({ op: 'commit', session: first.session, approval: approval.approval }), /expired/);
const second = await controller.browserCommand({ op: 'newTab', url: 'https://example.org/' });
assert.equal(second.tabId, 9);
await assert.rejects(controller.browserCommand({ op: 'observe', session: first.session }), /expired/);

assert.equal(safeSettings(settings).providers.openrouter.apiKey, 'managed-by-pc');
assert.ok(!JSON.stringify(safeSettings(settings)).includes('test-openrouter-key'));
const server = http.createServer(async (req, res) => { if (!await mobileRoutes(req, res, settings, async () => ({ ok: true }))) { res.writeHead(404); res.end(); } });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const forbidden = await fetch(base + '/api/inference', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' });
  assert.equal(forbidden.status, 403);
  for (const path of ['//evil.example/api/v1/chat/completions', '/api/v1/auth/keys', '/api/v1/chat/completions/../../auth/keys']) {
    const result = await fetch(base + '/api/inference', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'openrouter', path }) });
    assert.equal(result.status, 400);
  }
  const safe = await (await fetch(base + '/api/mobile-settings')).json();
  assert.equal(safe.providers.openrouter.apiKey, 'managed-by-pc');
} finally { await new Promise((resolve) => server.close(resolve)); }
// A freshly loaded mobile UI recovers the worker's existing tab binding.
globalThis.window = new EventTarget();
requests = [];
globalThis.fetch = async (_url, init) => {
  const command = JSON.parse(init.body);
  requests.push(command);
  return new Response(JSON.stringify({ ok: true, data: command.op === 'status' ? second : { text: 'Observed bound tab' } }));
};
const mobileControl = await moduleAt('src/services/browserControl.ts');
await mobileControl.executeBrowserTool('browser_observe', {});
assert.deepEqual(requests.map(r => r.op), ['status', 'observe']);
assert.equal(requests[1].session, second.session);
requests = [];
await mobileControl.executeBrowserTool('browser_navigate', { url: 'https://example.org/asset' });
assert.deepEqual(requests.map(r => r.op), ['navigate', 'observe']);
globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: 'Page changed. Observe again.' }));
await assert.rejects(mobileControl.controlCommand({ op: 'prepare' }), /Page changed/);
assert.equal(mobileControl.controlState().session, second.session);
globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: 'PC extension is disconnected.' }));
await assert.rejects(mobileControl.controlCommand({ op: 'status' }), /disconnected/);
assert.equal(mobileControl.controlState(), null);
await assert.rejects(mobileControl.executeBrowserTool('browser_observe', {}), /disconnected/);
globalThis.fetch = realFetch;
console.log('PASS: settings migration, modality-separated model catalogs, NVIDIA authenticated probe, Jev validation/OpenRouter-only routing, bound-tab isolation, stale approvals, proxy restrictions, key redaction, mobile binding recovery and disconnect reporting.');
