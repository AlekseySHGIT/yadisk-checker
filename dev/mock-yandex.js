'use strict';

// Имитация API Яндекс Диска для проверки приложения без настоящего аккаунта.
//   node dev/mock-yandex.js
//   YANDEX_API_BASE=http://127.0.0.1:4000/v1/disk YANDEX_OAUTH_BASE=http://127.0.0.1:4000 node dev/local.js
// Токен для ручного входа: test-token
// MOCK_EMPTY_FLAT=1 — плоский список файлов пуст (как при задержке индекса Яндекса),
// приложение должно найти файлы обходом папок.
// MOCK_TOKEN_429=N — первые N запросов токена получают 429 (лимит запросов Яндекса).
//
// Серверы скачивания:
//   127.0.0.1:4001 — downloader, редиректит на хранилища
//   127.0.0.1:4002 — хранилище, работает
//   127.0.0.1:4003 — хранилище, выключено (соединение отклоняется)
//   127.0.0.1:4004 — хранилище, зависает (таймаут)
//   127.0.0.1:4005 — хранилище, отвечает 503

const http = require('http');

const TOKEN = 'test-token';
let tokenRequests = 0;
const STORAGES = [4002, 4003, 4004, 4005];
const FILES = Array.from({ length: 24 }, (_, i) => ({
  name: `photo_${String(i + 1).padStart(2, '0')}.jpg`,
  path: `disk:/Фото/photo_${String(i + 1).padStart(2, '0')}.jpg`,
  size: 150000 + i * 98765,
  mime_type: 'image/jpeg',
  media_type: 'image',
  storage: i === 7 ? null : STORAGES[i % STORAGES.length], // файл №8 «удалён» — 404 у API
}));

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/token' && req.method === 'POST') {
    if (tokenRequests++ < Number(process.env.MOCK_TOKEN_429 || 0)) {
      return json(res, 429, { error: 'bad_response', error_description: 'bad response status code 429' });
    }
    return json(res, 200, { access_token: TOKEN });
  }
  if (url.pathname === '/authorize') {
    const q = url.searchParams;
    res.writeHead(302, { Location: `${q.get('redirect_uri')}?code=abc&state=${q.get('state')}` });
    return res.end();
  }
  if (req.headers.authorization !== `OAuth ${TOKEN}`) return json(res, 401, { message: 'Не авторизован.' });

  if (url.pathname === '/v1/disk/' || url.pathname === '/v1/disk') {
    return json(res, 200, { user: { login: 'test', display_name: 'Тестовый пользователь' }, total_space: 10e9, used_space: 3.2e9 });
  }
  if (url.pathname === '/v1/disk/resources/files') {
    const limit = Number(url.searchParams.get('limit')) || 20;
    const offset = Number(url.searchParams.get('offset')) || 0;
    const all = process.env.MOCK_EMPTY_FLAT ? [] : FILES;
    const items = all.slice(offset, offset + limit).map(({ storage, ...f }) => f);
    return json(res, 200, { items, limit, offset });
  }
  if (url.pathname === '/v1/disk/resources') {
    const limit = Number(url.searchParams.get('limit')) || 20;
    const offset = Number(url.searchParams.get('offset')) || 0;
    const dir = url.searchParams.get('path');
    const all = dir === 'disk:/'
      ? [{ type: 'dir', name: 'Фото', path: 'disk:/Фото' }]
      : dir === 'disk:/Фото' ? FILES.map(({ storage, ...f }) => ({ type: 'file', ...f })) : null;
    if (!all) return json(res, 404, { message: 'Не удалось найти запрошенный ресурс.' });
    return json(res, 200, { _embedded: { items: all.slice(offset, offset + limit), total: all.length } });
  }
  if (url.pathname === '/v1/disk/resources/download') {
    const f = FILES.find((x) => x.path === url.searchParams.get('path'));
    if (!f || !f.storage) return json(res, 404, { message: 'Не удалось найти запрошенный ресурс.' });
    return json(res, 200, { href: `http://127.0.0.1:4001/disk/${f.storage}/${encodeURIComponent(f.name)}`, method: 'GET', templated: false });
  }
  json(res, 404, { message: 'not found' });
}).listen(4000, '127.0.0.1');

// downloader: редирект на хранилище
http.createServer((req, res) => {
  const m = req.url.match(/^\/disk\/(\d+)\/(.+)$/);
  if (!m) { res.writeHead(404); return res.end(); }
  res.writeHead(302, { Location: `http://127.0.0.1:${m[1]}/file/${m[2]}` });
  res.end();
}).listen(4001, '127.0.0.1');

// рабочее хранилище
http.createServer((req, res) => {
  res.writeHead(206, { 'Content-Type': 'image/jpeg', 'Content-Range': 'bytes 0-0/1000' });
  res.end('x');
}).listen(4002, '127.0.0.1');

// 4003 — никто не слушает
// зависающее хранилище
http.createServer(() => {}).listen(4004, '127.0.0.1');
// хранилище с ошибкой 503
http.createServer((req, res) => { res.writeHead(503); res.end(); }).listen(4005, '127.0.0.1');

console.log('Mock Яндекс Диска: http://127.0.0.1:4000, токен: test-token');
