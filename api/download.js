'use strict';
const { getQuery, sendJson, redirect, yandexApi, handler } = require('../lib/common');

// Свежая ссылка на скачивание (ссылки Яндекса живут ограниченное время).
module.exports = handler(async (req, res, token) => {
  const p = getQuery(req).get('path');
  if (!p) return sendJson(res, 400, { error: 'Не указан path' });
  const link = await yandexApi(token, `/resources/download?path=${encodeURIComponent(p)}`);
  redirect(res, link.href);
});
