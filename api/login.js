'use strict';
const crypto = require('crypto');
const { CLIENT_ID, OAUTH_BASE, redirect, redirectUri, setCookie, handler } = require('../lib/common');

// Переход на страницу входа Яндекса.
module.exports = handler(async (req, res) => {
  if (!CLIENT_ID()) return redirect(res, '/?error=' + encodeURIComponent('Не задан YANDEX_CLIENT_ID'));
  const state = crypto.randomBytes(16).toString('hex');
  setCookie(req, res, 'yd_state', state, 600);
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID(),
    redirect_uri: redirectUri(req),
    state,
  });
  redirect(res, `${OAUTH_BASE()}/authorize?${q}`);
}, { auth: false });
