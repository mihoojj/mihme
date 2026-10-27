// 杩愯鏈熻嚜妫€锛歯ode ab-check.js <url> [width]
const [, , url, widthArg] = process.argv;
const VIEW_W = Number(widthArg || 1440);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const list = await (await fetch('http://127.0.0.1:' + (process.env.DSH_SHOT_PORT || 9222) + '/json/list')).json();
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''));
    }
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
    setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); rej(new Error('timeout ' + method)); } }, 30000);
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return r.result ? r.result.value : null;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: VIEW_W, height: 900, deviceScaleFactor: 1, mobile: VIEW_W < 600 });
  await send('Page.navigate', { url });
  await sleep(1500);

  const report = await evaluate(`JSON.stringify({
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    clock: document.getElementById('clock').textContent,
    theme: document.documentElement.dataset.theme,
    themeLabel: document.getElementById('themeBtn').textContent,
    wordShadow: (document.getElementById('wordFace').style.textShadow || '').slice(0, 40),
    crosses: document.querySelectorAll('.grid__cross').length,
    revealed: document.querySelectorAll('.reveal.is-in').length,
    totalReveal: document.querySelectorAll('.reveal').length,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    hiddenAfterScroll: 0
  })`);
  console.log('CHECK', report);

  await evaluate("document.getElementById('themeBtn').click()");
  await sleep(400);
  console.log('AFTER_TOGGLE', await evaluate("document.documentElement.dataset.theme + ' / ' + getComputedStyle(document.body).backgroundColor"));

  console.log('EXCEPTIONS', JSON.stringify(errors));
  ws.close();
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
