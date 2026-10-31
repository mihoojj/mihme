// 拍真实截图给作品区用：桌面亮/暗、手机、陈述区
// node ab-shots.js <url> <outDir>
const fs = require('node:fs');
const path = require('node:path');

const [, , url, outDir = 'shots/raw'] = process.argv;
const PORT = process.env.DSH_SHOT_PORT || 9222;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
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
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result ? r.result.value : null;
  };
  const shot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(outDir, name + '.png');
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log('ok ' + file);
  };
  const setView = (width, height, dsf = 1) => send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: dsf, mobile: width < 600,
  });

  await send('Page.enable');
  await send('Runtime.enable');

  /* ---- 桌面 ---- */
  await setView(1440, 900);
  await send('Page.navigate', { url });
  await sleep(4600);                       // 开屏 ~2.6s，留足
  await evaluate("window.scrollTo(0,0)");
  await sleep(900);
  await shot('site-hero-dark');

  await evaluate("document.getElementById('themeBtn').click(); 'ok'");  // 走真实切换路径，HUD 换色才会跟着走
  await sleep(1200);
  await shot('site-hero-light');

  await evaluate("document.getElementById('themeBtn').click(); 'ok'");
  await sleep(900);
  await evaluate("document.querySelector('#statement').scrollIntoView({block:'center'})");
  await sleep(1500);                       // 等 clip 揭幕跑完
  await shot('site-statement');

  /* ---- 手机 ---- */
  await setView(390, 844, 2);
  await send('Page.navigate', { url });
  await sleep(4600);
  await evaluate("window.scrollTo(0,0)");
  await sleep(900);
  await shot('site-mobile');

  ws.close();
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
