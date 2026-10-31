// 把某个区段滚到视口顶部拍一张，用来近距离看版式
// node ab-sec.js <url> <selector> <out.png> [width] [height]
const fs = require('node:fs');

const [, , url, sel, out, widthArg, heightArg] = process.argv;
const VIEW_W = Number(widthArg || 1440);
const VIEW_H = Number(heightArg || 900);
const PORT = process.env.DSH_SHOT_PORT || 9222;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
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
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result ? r.result.value : null;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: VIEW_W, height: VIEW_H, deviceScaleFactor: 1, mobile: VIEW_W < 600,
  });
  await send('Page.navigate', { url });
  await sleep(3600);
  await evaluate(`(function(){var el=document.querySelector(${JSON.stringify(sel)});if(!el)return 'missing';window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 40);return 'ok';})()`);
  await sleep(1500);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log('ok ' + out);
  ws.close();
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
