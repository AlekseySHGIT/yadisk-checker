'use strict';

// Локальный запуск без Vercel: отдаёт public/ и вызывает те же функции из api/.
//   node dev/local.js        (настройки берутся из .env)

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.PORT) || 3000;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
};

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const api = pathname.match(/^\/api\/([a-z]+)$/);
  if (api) {
    const file = path.join(ROOT, 'api', api[1] + '.js');
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
    return require(file)(req, res);
  }
  const file = path.normalize(path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.statusCode = 403; return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Готово: http://localhost:${PORT}`);
  for (const addrs of Object.values(require('os').networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`С iPhone в той же Wi-Fi сети: http://${a.address}:${PORT}`);
    }
  }
});
