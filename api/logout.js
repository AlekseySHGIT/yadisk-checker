'use strict';
const { sendJson, clearToken, handler } = require('../lib/common');

module.exports = handler(async (req, res) => {
  clearToken(req, res);
  sendJson(res, 200, { ok: true });
}, { auth: false });
