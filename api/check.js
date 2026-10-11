'use strict';
const { readJson, sendJson, yandexApi, handler } = require('../lib/common');
const { probeDownload } = require('../lib/probe');

// Проверка одного файла. Клиент передаёт, какие серверы уже недоступны (failedHosts),
// какие уже отвечали (goodHosts) и какой новый сервер можно проверить сейчас (allowHost).
// Подробности — в lib/probe.js.
module.exports = handler(async (req, res, token) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Только POST' });
  const body = await readJson(req).catch(() => ({}));
  if (!body.path) return sendJson(res, 400, { error: 'Не указан path' });
  const list = (v) => new Set(Array.isArray(v) ? v.map(String) : []);
  const known = { failed: list(body.failedHosts), good: list(body.goodHosts), allow: body.allowHost || null };

  let href;
  try {
    href = (await yandexApi(token, `/resources/download?path=${encodeURIComponent(body.path)}`)).href;
  } catch (e) {
    if (e.status === 401) throw e;
    return sendJson(res, 200, { status: 'error', host: null, reason: e.message });
  }
  if (!href) return sendJson(res, 200, { status: 'error', host: null, reason: 'API не вернул ссылку на скачивание' });

  sendJson(res, 200, await probeDownload(href, known));
});
