'use strict';
const { getQuery, sendJson, yandexApi, handler } = require('../lib/common');

// Содержимое одной папки. Нужен как запасной вариант, когда плоский список
// /resources/files пуст (например, индекс Яндекса ещё не обновился).
module.exports = handler(async (req, res, token) => {
  const q = getQuery(req);
  const path = q.get('path') || 'disk:/';
  const limit = Math.min(Math.max(Number(q.get('limit')) || 100, 1), 1000);
  const offset = Math.max(Number(q.get('offset')) || 0, 0);
  const fields = [
    '_embedded.total',
    ...['type', 'name', 'path', 'size', 'mime_type', 'media_type'].map((f) => `_embedded.items.${f}`),
  ].join(',');
  const data = await yandexApi(
    token,
    `/resources?path=${encodeURIComponent(path)}&limit=${limit}&offset=${offset}&fields=${fields}`,
  );
  const emb = data._embedded || {};
  sendJson(res, 200, {
    total: emb.total || 0,
    items: (emb.items || []).map((it) => ({
      type: it.type,
      path: it.path,
      name: it.name,
      size: it.size || 0,
      mimeType: it.mime_type || '',
      mediaType: it.media_type || '',
    })),
  });
});
