'use strict';

// Общий код для функций Vercel (папка api/) и локального сервера (dev/local.js).
// Состояния на сервере нет: OAuth-токен хранится в зашифрованной HttpOnly-cookie.

const crypto = require('crypto');

const env = (name, def = '') => process.env[name] || def;
const CLIENT_ID = () => env('YANDEX_CLIENT_ID');
const CLIENT_SECRET = () => env('YANDEX_CLIENT_SECRET');
const API_BASE = () => env('YANDEX_API_BASE', 'https://cloud-api.yandex.net/v1/disk').replace(/\/$/, '');
const OAUTH_BASE = () => env('YANDEX_OAUTH_BASE', 'https://oauth.yandex.ru').replace(/\/$/, '');
const CHECK_TIMEOUT_MS = () => Number(env('CHECK_TIMEOUT_MS')) || 8000;

// ---------- запросы и ответы ----------

function getQuery(req) {
  return new URL(req.url, 'http://localhost').searchParams;
}

async function readJson(req) {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
    return req.body || {};
  }
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 1e6) throw new Error('too large');
  }
  return data ? JSON.parse(data) : {};
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}

function baseUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || (host && host.startsWith('localhost') ? 'http' : 'https');
  return `${String(proto).split(',')[0]}://${host}`;
}

function redirectUri(req) {
  return env('YANDEX_REDIRECT_URI') || `${baseUrl(req)}/api/callback`;
}

// ---------- cookies ----------

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setCookie(req, res, name, value, maxAge) {
  const secure = baseUrl(req).startsWith('https:') ? '; Secure' : '';
  const cookie = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, cookie) : cookie);
}

function cookieKey() {
  const secret = env('COOKIE_SECRET') || CLIENT_SECRET() || 'local-dev-secret';
  return crypto.createHash('sha256').update('yadisk-cookie:' + secret).digest();
}

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cookieKey(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64url');
}

function decrypt(value) {
  try {
    const buf = Buffer.from(value, 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', cookieKey(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function getToken(req) {
  const raw = parseCookies(req).yd_token;
  return raw ? decrypt(raw) : null;
}

function setToken(req, res, token, maxAge = 365 * 24 * 3600) {
  setCookie(req, res, 'yd_token', encrypt(token), maxAge);
}

function clearToken(req, res) {
  setCookie(req, res, 'yd_token', '', 0);
}

// ---------- API Яндекс Диска ----------

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Понятное описание сетевой ошибки fetch (undici прячет причину в e.cause).
function describeError(e) {
  if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) return `таймаут ${CHECK_TIMEOUT_MS() / 1000} с`;
  const c = e && e.cause;
  if (c && c.code) {
    const known = {
      ECONNREFUSED: 'соединение отклонено',
      ECONNRESET: 'соединение сброшено',
      ENOTFOUND: 'сервер не найден (DNS)',
      EAI_AGAIN: 'ошибка DNS',
      ETIMEDOUT: 'таймаут соединения',
      EHOSTUNREACH: 'хост недоступен',
      ENETUNREACH: 'сеть недоступна',
      UND_ERR_CONNECT_TIMEOUT: 'таймаут соединения',
      UND_ERR_SOCKET: 'ошибка сокета',
    };
    return known[c.code] || c.code;
  }
  return (e && e.message) || String(e);
}

async function yandexApi(token, pathAndQuery) {
  let res;
  try {
    res = await fetch(API_BASE() + pathAndQuery, {
      headers: { Authorization: `OAuth ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    throw new ApiError(502, `API Яндекс Диска недоступен: ${describeError(e)}`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.message || body.description || `HTTP ${res.status}`);
  return body;
}

// Обёртка для функций: ловит ошибки, 401 от Яндекса сбрасывает cookie.
function handler(fn, { auth = true } = {}) {
  return async (req, res) => {
    try {
      const token = getToken(req);
      if (auth && !token) return sendJson(res, 401, { error: 'Нужна авторизация' });
      await fn(req, res, token);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) clearToken(req, res);
        return sendJson(res, e.status === 401 ? 401 : e.status || 502, { error: e.message });
      }
      console.error(e);
      sendJson(res, 500, { error: 'Внутренняя ошибка сервера' });
    }
  };
}

module.exports = {
  CLIENT_ID, CLIENT_SECRET, OAUTH_BASE, CHECK_TIMEOUT_MS,
  getQuery, readJson, sendJson, redirect, redirectUri,
  parseCookies, setCookie, getToken, setToken, clearToken,
  ApiError, describeError, yandexApi, handler,
};
