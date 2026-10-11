'use strict';
const { readJson, sendJson, setToken, handler } = require('../lib/common');

// Ручной ввод OAuth-токена.
module.exports = handler(async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Только POST' });
  const body = await readJson(req).catch(() => ({}));
  const token = String(body.token || '').trim();
  if (!token) return sendJson(res, 400, { error: 'Пустой токен' });
  setToken(req, res, token);
  sendJson(res, 200, { ok: true });
}, { auth: false });
