// 鏁撮〉鎴浘锛歯ode ab-full.js <url> <outfile> [width] [height] [waitMs]
const fs = require('node:fs');

const [, , url, outfile, widthArg, heightArg, waitArg] = process.argv;
const VIEW_W = Number(widthArg || 1440);
const VIEW_H = Number(heightArg || 900);
const WAIT = Number(waitArg || 4000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const list = await (await fetch('http://127.0.0.1:' + (process.env.DSH_SHOT_PORT || 9222) + '/json/list')).json();
  let page = list.find((t) => t.type === 'page');
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
  await send('Emulation.setDeviceMetricsOverride', {
    width: VIEW_W, height: VIEW_H, deviceScaleFactor: 1, mobile: VIEW_W < 600,
  });
  await send('Page.navigate', { url });
  await sleep(WAIT);

  const info = await evaluate(`JSON.stringify({
    title: document.title,
    w: document.documentElement.scrollWidth,
    h: document.documentElement.scrollHeight,
    text: (document.body.innerText || '').slice(0, 4000)
  })`);

  const meta = JSON.parse(info || '{}');
  console.log('META', JSON.stringify({ ...meta, text: undefined }));
  console.log('TEXT_START');
  console.log(meta.text || '');
  console.log('TEXT_END');

  const shotH = Math.min(meta.h || VIEW_H, 12000);
  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: VIEW_W, height: shotH, scale: 1 },
  });
  fs.writeFileSync(outfile, Buffer.from(data, 'base64'));
  console.log(`ok ${outfile} ${VIEW_W}x${shotH}`);
  ws.close();
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
