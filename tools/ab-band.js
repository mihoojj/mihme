// 检查跑马灯在滚动时是否跳位：采样 .band__track 的 translateX 逐帧差值
// node ab-band.js <url> [width] [height]
const fs = require('node:fs');

const [, , url, widthArg, heightArg] = process.argv;
const VIEW_W = Number(widthArg || 1440);
const VIEW_H = Number(heightArg || 900);
const PORT = process.env.DSH_SHOT_PORT || 9222;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
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
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception || {}).description);
    return r.result ? r.result.value : null;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: VIEW_W, height: VIEW_H, deviceScaleFactor: 1, mobile: VIEW_W < 600,
  });
  await send('Page.navigate', { url });
  await sleep(4200); // 等开屏揭幕结束、滚动解锁

  const probe = `(async () => {
    const t = document.querySelector('.band__track');
    if (!t) return { error: 'no track' };
    t.scrollIntoView({ block: 'center' });
    await new Promise(r => setTimeout(r, 500));

    const anim = getComputedStyle(t).animationName;
    const half = t.children[0].getBoundingClientRect().width;

    const xs = [];
    let stop = false;
    const rec = () => {
      const m = getComputedStyle(t).transform;
      xs.push(m === 'none' ? 0 : new DOMMatrix(m).m41);
      if (!stop) requestAnimationFrame(rec);
    };
    requestAnimationFrame(rec);

    for (let i = 0; i < 26; i++) {
      window.scrollBy(0, 70);
      await new Promise(r => setTimeout(r, 45));
    }
    stop = true;
    await new Promise(r => setTimeout(r, 260));

    const d = xs.slice(1).map((v, i) => v - xs[i]).filter(v => Math.abs(v) < half * .5);
    const abs = d.map(Math.abs);
    return {
      animationName: anim,
      half,
      frames: xs.length,
      scrollSteps: 26,
      maxStepPx: Math.max(...abs),
      medianStepPx: abs.slice().sort((a, b) => a - b)[Math.floor(abs.length / 2)],
      backwardSteps: d.filter(v => v > 1).length,
      finalX: xs[xs.length - 1],
    };
  })()`;

  const out = await evaluate(probe);
  console.log(JSON.stringify(out, null, 2));

  // 回到跑马灯位置拍一张，确认视觉上没有错位
  await evaluate("document.querySelector('.band').scrollIntoView({block:'center'})");
  await sleep(700);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('shots/band-after.png', Buffer.from(data, 'base64'));
  console.log('ok shots/band-after.png');
  ws.close();
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
