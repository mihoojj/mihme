// 瀹氭椂鎴浘锛歯ode ab-timed.js <url> <outPrefix> <ms,ms,...> [width] [height]
const fs = require('node:fs');
const [, , url, prefix, timesArg, widthArg, heightArg] = process.argv;
const VIEW_W = Number(widthArg || 1440);
const VIEW_H = Number(heightArg || 900);
const TIMES = String(timesArg || '300,900,1800,3000').split(',').map(Number);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const list = await (await fetch('http://127.0.0.1:' + (process.env.DSH_SHOT_PORT || 9222) + '/json/list')).json();
  const page = list.find((t) => t.type === 'page');
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

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: VIEW_W, height: VIEW_H, deviceScaleFactor: 1, mobile: VIEW_W < 600,
  });

  const t0 = Date.now();
  send('Page.navigate', { url }).catch(() => {});

  for (const t of TIMES) {
    const wait = t - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const f = `${prefix}-${t}.png`;
    fs.writeFileSync(f, Buffer.from(data, 'base64'));
    console.log('ok', f);
  }
  ws.close();
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
