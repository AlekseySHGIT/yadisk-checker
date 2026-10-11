'use strict';
const { CLIENT_ID, redirectUri, getToken, clearToken, sendJson, yandexApi, ApiError, handler } = require('../lib/common');

// Кто вошёл и сколько места на Диске.
module.exports = handler(async (req, res) => {
  const base = { oauthConfigured: Boolean(CLIENT_ID()), clientId: CLIENT_ID() || null, redirectUri: redirectUri(req) };
  const token = getToken(req);
  if (!token) return sendJson(res, 200, { ...base, authorized: false });
  try {
    const disk = await yandexApi(token, '/');
    sendJson(res, 200, {
      ...base,
      authorized: true,
      user: disk.user ? { login: disk.user.login, name: disk.user.display_name } : null,
      totalSpace: disk.total_space,
      usedSpace: disk.used_space,
      trashSize: disk.trash_size,
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      clearToken(req, res);
      return sendJson(res, 200, { ...base, authorized: false, error: 'Токен недействителен или истёк' });
    }
    sendJson(res, 200, { ...base, authorized: true, error: e.message });
  }
}, { auth: false });
