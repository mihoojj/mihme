// 鏁撮〉鎴浘锛堝厛婊氬埌搴曡Е鍙戣繘鍦猴級锛歯ode ab-page.js <url> <out> [width] [height] [themeClicks] [fullPage]
const fs = require('node:fs');

const [, , url, outfile, widthArg, heightArg, clicksArg, fullArg] = process.argv;
const VIEW_W = Number(widthArg || 1440);
const VIEW_H = Number(heightArg || 900);
const CLICKS = Number(clicksArg || 0);
const FULL = fullArg !== '0';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const list = await (await fetch('http://127.0.0.1:' + (process.env.DSH_SHOT_PORT || 9222) + '/json/list')).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
    setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); rej(new Error('timeout ' + method)); } }, 60000);
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return r.result ? r.result.value : null;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: VIEW_W, height: VIEW_H, deviceScaleFactor: 1, mobile: VIEW_W < 600,
  });
  await send('Page.navigate', { url });
  await sleep(1200);

  if (CLICKS > 0) {
    const target = CLICKS === 1 ? 'light' : 'dark';
    for (let i = 0; i < 4; i += 1) {
      const cur = await evaluate('document.documentElement.dataset.theme');
      if (cur === target) break;
      await evaluate("document.getElementById('themeBtn')?.click()");
      await sleep(280);
    }
    console.log('theme =', await evaluate('document.documentElement.dataset.theme'));
  }

  const errs = await evaluate('JSON.stringify(window.__errs || [])');
  if (errs && errs !== '[]') console.log('PAGE_ERRORS', errs);

  const h = await evaluate('document.documentElement.scrollHeight');
  const steps = Math.ceil(h / VIEW_H);
  for (let i = 1; i <= steps; i += 1) {
    await evaluate(`window.scrollTo(0, ${i * VIEW_H * 0.8})`);
    await sleep(220);
  }
  await sleep(600);
  await evaluate('window.scrollTo(0, 0)');
  await sleep(900);

  const meta = await evaluate('JSON.stringify({h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth})');
  console.log('META', meta);

  const params = { format: 'png' };
  if (FULL) {
    const dims = JSON.parse(meta || '{}');
    params.captureBeyondViewport = true;
    params.clip = { x: 0, y: 0, width: VIEW_W, height: Math.min(dims.h || VIEW_H, 14000), scale: 1 };
  }

  const { data } = await send('Page.captureScreenshot', params);
  fs.writeFileSync(outfile, Buffer.from(data, 'base64'));
  console.log(`ok ${outfile}`);
  ws.close();
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
