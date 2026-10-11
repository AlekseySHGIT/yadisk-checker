'use strict';
const { getQuery, sendJson, yandexApi, handler } = require('../lib/common');

// Одна страница плоского списка всех файлов Диска.
module.exports = handler(async (req, res, token) => {
  const q = getQuery(req);
  const limit = Math.min(Math.max(Number(q.get('limit')) || 100, 1), 1000);
  const offset = Math.max(Number(q.get('offset')) || 0, 0);
  const fields = 'items.name,items.path,items.size,items.mime_type,items.media_type,limit,offset';
  const data = await yandexApi(token, `/resources/files?limit=${limit}&offset=${offset}&fields=${fields}`);
  sendJson(res, 200, {
    items: (data.items || []).map((it) => ({
      path: it.path,
      name: it.name,
      size: it.size || 0,
      mimeType: it.mime_type || '',
      mediaType: it.media_type || '',
    })),
  });
});
