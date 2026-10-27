// 婊氬姩鍒版寚瀹氫綅缃埅鍥撅細node ab-scroll.js <url> <scrollY> <outfile> [width] [height] [waitMs]
const fs = require('node:fs');

const [, , url, yArg, outfile, widthArg, heightArg, waitArg] = process.argv;
const VIEW_W = Number(widthArg || 1440);
const VIEW_H = Number(heightArg || 900);
const WAIT = Number(waitArg || 26000);
const SCROLL_Y = Number(yArg || 0);

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
  await send('Emulation.setDeviceMetricsOverride', {
    width: VIEW_W, height: VIEW_H, deviceScaleFactor: 1, mobile: VIEW_W < 600,
  });
  await send('Page.navigate', { url });
  await sleep(WAIT);

  // 鍒嗘婊氬姩锛岃Е鍙戞粴鍔ㄩ┍鍔ㄧ殑鍔ㄧ敾
  const steps = 12;
  for (let i = 1; i <= steps; i += 1) {
    await evaluate(`window.scrollTo(0, ${(SCROLL_Y * i) / steps})`);
    await sleep(180);
  }
  await evaluate(`window.scrollTo(0, ${SCROLL_Y})`);
  await sleep(2500);

  const at = await evaluate('window.scrollY');
  console.log('scrollY', at);

  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outfile, Buffer.from(data, 'base64'));
  console.log(`ok ${outfile}`);
  ws.close();
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
