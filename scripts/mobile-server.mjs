import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const port = Number(process.env.NERDBOT_MOBILE_PORT || 8081);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) throw new Error(); }
    catch { res.writeHead(403); res.end('Origin denied'); return; }
  }
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    if (!['/api/status', '/api/mobile-settings', '/api/inference', '/api/browser', '/api/mobile-context'].includes(url.pathname)) { res.writeHead(404); res.end(); return; }
    const upstream = http.request({ hostname: '127.0.0.1', port: 3030, path: url.pathname, method: req.method,
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://127.0.0.1:3030' } }, (reply) => {
      res.writeHead(reply.statusCode || 502, { 'Content-Type': reply.headers['content-type'] || 'application/json', 'Cache-Control': 'no-store' });
      reply.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(JSON.stringify({ ok: false, error: 'PC bridge is unavailable.' })); });
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
    return;
  }
  try {
    const target = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/mobile.html' : url.pathname));
    if (!target.startsWith(root + path.sep) && target !== root) throw new Error('Invalid path');
    if (!(await stat(target)).isFile()) throw new Error('Not a file');
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': target.endsWith('.html') ? 'no-store' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    createReadStream(target).pipe(res);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Nerdbot shared mobile UI ready on loopback ${port}`));
