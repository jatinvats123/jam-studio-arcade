// node tools/serve.mjs   (PORT env var overrides 8080)
// Zero-dependency static server for the studio root.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
};

const server = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('Bad request'); return; }
  let file = path.join(ROOT, path.normalize(url));
  if (!file.startsWith(ROOT) || /[\\/](\.git|node_modules)([\\/]|$)/.test(file)) { res.writeHead(403).end('Forbidden'); return; }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) {
      if (!url.endsWith('/')) { res.writeHead(301, { Location: url + '/' }).end(); return; }
      file = path.join(file, 'index.html');
    }
    fs.readFile(file, (e, data) => {
      if (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is busy; the studio server is probably already running at http://localhost:${PORT}/`);
    process.exit(0);
  }
  throw e;
});
server.listen(PORT, () => console.log(`SERVING ${ROOT}\nArcade: http://localhost:${PORT}/`));
