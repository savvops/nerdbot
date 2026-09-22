// One-time signing-key setup. Never prints or puts private keys in argv.
import { generateKeyPair, exportPKCS8, exportJWK } from 'jose';
import { spawnSync } from 'node:child_process';
const cli = 'node_modules/convex/bin/main.js';
const call = (args, input) => spawnSync(process.execPath, [cli, ...args], { input, encoding: 'utf8', windowsHide: true });
const existing = call(['env', 'list']);
if (existing.status !== 0) throw new Error('Could not check Convex environment. No keys changed.');
const hasPrivate = /^JWT_PRIVATE_KEY=/m.test(existing.stdout);
const hasPublic = /^JWKS=/m.test(existing.stdout);
if (hasPrivate !== hasPublic) throw new Error('Incomplete existing signing configuration. No keys changed.');
if (hasPrivate) {
  console.log('Existing signing keys retained.');
} else {
  const keys = await generateKeyPair('RS256', { extractable: true });
  const privateKey = (await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g, ' ');
  const jwks = JSON.stringify({ keys: [{ use: 'sig', ...await exportJWK(keys.publicKey) }] });
  for (const [name, value] of [['JWT_PRIVATE_KEY', privateKey], ['JWKS', jwks]]) {
    const result = call(['env', 'set', name], value);
    if (result.status !== 0) throw new Error(`Could not configure ${name}; inspect the deployment before retrying.`);
  }
  console.log('Convex signing keys configured. Secret values were not printed.');
}
