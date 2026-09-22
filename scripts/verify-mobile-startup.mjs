import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import vm from 'node:vm';

// Exercise startup under an offline bridge and a rejected UI import, without
// using real provider keys or changing any browser storage.
const source = (await readFile('src/mobile/main.ts', 'utf8'))
  .replace("import { DEFAULT_SETTINGS } from '../services/config';", 'const DEFAULT_SETTINGS = { providers: {} };')
  .replace("import('../sidebar/main')", 'openSidebar()');
const { code } = await transform(source, { loader: 'ts', format: 'iife' });
for (const failure of [false, true]) {
  let expire;
  let opened = false;
  const status = { textContent: 'Loading your conversation…' };
  const context = vm.createContext({
    AbortController, Request, URL, Error, console,
    location: { href: 'https://example.test/' },
    localStorage: { getItem: () => null },
    document: { getElementById: () => status },
    window: {
      fetch: (_input, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Offline')))),
      setTimeout: (callback, delay) => { assert.equal(delay, 4000); expire = callback; return 1; },
      clearTimeout() {},
    },
    openSidebar: async () => { opened = true; if (failure) throw new Error('Module unavailable'); },
  });
  vm.runInContext(code, context);
  assert.equal(opened, false);
  expire();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(opened, true, 'Offline settings must not block rendering');
  if (failure) assert.match(status.textContent, /Module unavailable/);
}
console.log('PASS: offline bridge timeout continues startup; UI import failure renders a recovery message.');
