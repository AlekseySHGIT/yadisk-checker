'use strict';

const { CHECK_TIMEOUT_MS, describeError } = require('./common');

const MAX_REDIRECTS = 5;

// Проходит по цепочке редиректов ссылки на скачивание (downloader → сервер хранилища)
// и проверяет, что сервер, который реально отдаёт файл, отвечает. Скачивается только 1 байт.
//
// known.failed  — хосты, уже признанные недоступными: к ним не обращаемся, статус 'skipped'.
// known.good    — хосты, которые уже отвечали: к ним обращаемся сразу.
// known.allow   — ещё не проверенный хост, к которому клиент разрешил обратиться.
// Любой другой новый хост → статус 'need_probe': клиент проверит его один раз,
// а остальные файлы с этого хоста подождут результата.
async function probeDownload(href, known) {
  const passed = []; // хосты, которые ответили в этой проверке
  let url = href;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const host = new URL(url).host;
    if (known.failed.has(host)) return { status: 'skipped', host, reason: `сервер ${host} уже недоступен`, passed };
    if (!known.good.has(host) && host !== known.allow) return { status: 'need_probe', host, passed };

    let res;
    try {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        headers: { Range: 'bytes=0-0' },
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS()),
      });
    } catch (e) {
      return { status: 'server_down', host, reason: describeError(e), passed };
    }
    if (res.body) res.body.cancel().catch(() => {});
    if (res.status >= 500) return { status: 'server_down', host, reason: `сервер ответил HTTP ${res.status}`, passed };
    passed.push(host);

    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url).href;
      continue;
    }
    if (res.status === 200 || res.status === 206) return { status: 'ok', host, reason: null, passed };
    // 4xx: сервер жив, проблема в конкретном файле или ссылке
    return { status: 'error', host, reason: `HTTP ${res.status}`, passed };
  }
  return { status: 'error', host: new URL(url).host, reason: 'слишком много редиректов', passed };
}

module.exports = { probeDownload };
