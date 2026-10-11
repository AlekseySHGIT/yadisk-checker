'use strict';
const {
  CLIENT_ID, CLIENT_SECRET, OAUTH_BASE, getQuery, redirect, parseCookies, setCookie, setToken, describeError, handler,
} = require('../lib/common');

// Яндекс возвращает сюда code, меняем его на токен и кладём токен в cookie.
module.exports = handler(async (req, res) => {
  const q = getQuery(req);
  const fail = (msg) => redirect(res, '/?error=' + encodeURIComponent(msg));
  const err = q.get('error_description') || q.get('error');
  if (err) return fail(err);
  const state = parseCookies(req).yd_state;
  setCookie(req, res, 'yd_state', '', 0);
  if (!q.get('code') || !state || q.get('state') !== state) return fail('Неверный ответ OAuth, попробуйте ещё раз');

  try {
    const tokenRes = await fetch(`${OAUTH_BASE()}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: q.get('code'),
        client_id: CLIENT_ID(),
        client_secret: CLIENT_SECRET(),
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !body.access_token) throw new Error(body.error_description || body.error || `HTTP ${tokenRes.status}`);
    setToken(req, res, body.access_token, Number(body.expires_in) || undefined);
    redirect(res, '/');
  } catch (e) {
    fail('Не удалось получить токен: ' + describeError(e));
  }
}, { auth: false });
