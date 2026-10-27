const fs = require('node:fs');
const path = require('node:path');

const OUT = process.env.AB_OUT || path.join(process.cwd(), 'shots');
const URL_ = process.env.AB_URL || 'https://ansyn.me/';
const PREFIX = process.env.AB_PREFIX || 'ansyn';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function connect() {
  const list = await (await fetch('http://127.0.0.1:' + (process.env.DSH_SHOT_PORT || 9222) + '/json/list')).json();
  const page = list.find(t => t.type === 'page');
  if (!page) throw new Error('no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
    setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); rej(new Error('timeout ' + method)); } }, 30000);
  });
  return { ws, send, events };
}

async function shot(send, file, opts = {}) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!opts.full, ...(opts.clip ? { clip: opts.clip } : {}) });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  return fs.statSync(file).size;
}

async function visit(send, events, width, height, dsf, mobile, label, waitMs) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dsf, mobile });
  events.length = 0;
  await send('Page.navigate', { url: URL_ });
  await sleep(waitMs);
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result ? r.result.value : null;
  };
  const info = await ev(`(() => {
    const pre = [...document.querySelectorAll('[class*=preload],[class*=loader],[class*=intro],[class*=splash]')].map(e => e.className).slice(0,6);
    return {
      title: document.title,
      preloaderCandidates: pre,
      bodyText: document.body.innerText.replace(/\\s+/g,' ').slice(0, 180),
      lat: (document.body.innerText.match(/LAT\\s*\\S*/) || [null])[0],
      bg: getComputedStyle(document.body).backgroundColor,
      docH: document.documentElement.scrollHeight,
      imgs: document.images.length,
      brokenImgs: [...document.images].filter(i => !i.complete || i.naturalWidth === 0).map(i => i.currentSrc || i.src).slice(0,5),
      fonts: document.fonts ? document.fonts.status : 'n/a',
      scrollW: document.documentElement.scrollWidth,
      viewportW: window.innerWidth
    };
  })()`);
  const size = await shot(send, path.join(OUT, `${PREFIX}-${label}.png`));
  const errs = events.filter(e => e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type))
    .map(e => e.params.args.map(a => a.value || a.description || a.type).join(' ')).slice(0, 8);
  const fails = events.filter(e => e.method === 'Network.loadingFailed').map(e => e.params.errorText).slice(0, 8);
  const bad = events.filter(e => e.method === 'Network.responseReceived' && e.params.response.status >= 400)
    .map(e => `${e.params.response.status} ${e.params.response.url}`).slice(0, 8);
  return { label, size, info, errs, fails, bad };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { ws, send, events } = await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  if (process.env.AB_SCHEME) { await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: process.env.AB_SCHEME }] }); }
  const t0 = Date.now();
  const nav = await send('Page.navigate', { url: URL_ });
  await sleep(6000);
  const perf = await send('Runtime.evaluate', {
    expression: `(() => { const n = performance.getEntriesByType('navigation')[0] || {}; return { domContentLoaded: Math.round(n.domContentLoadedEventEnd||0), load: Math.round(n.loadEventEnd||0), transferKB: Math.round((n.transferSize||0)/1024), resources: performance.getEntriesByType('resource').length }; })()`,
    returnByValue: true
  });
  const desktop = await visit(send, events, 1440, 900, 1, false, 'desktop', 6000);
  const mobile = await visit(send, events, 390, 844, 2, true, 'mobile', 6000);
  console.log(JSON.stringify({ nav: nav.frameId ? 'ok' : '?', perf: perf.result.value, desktop, mobile, elapsedMs: Date.now() - t0 }, null, 2));
  ws.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });


