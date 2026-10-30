// A small Chrome DevTools Protocol client for the smoke test: WebView2 (the
// Tauri window) and a headless Edge both expose every page on one debugging
// port. Uses Node's built-in fetch and WebSocket.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function listTargets(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  return (await res.json()).filter((t) => t.type === 'page');
}

// Waits for a page target whose URL (or title) matches `match`.
export async function waitForTarget(port, match, ms = 30000) {
  const t0 = Date.now();
  let last = [];
  while (Date.now() - t0 < ms) {
    try {
      last = await listTargets(port);
      const hit = last.find((t) => match(t));
      if (hit) return hit;
    } catch { /* the browser is still starting */ }
    await sleep(150);
  }
  throw new Error(`no matching page target after ${ms} ms (have: ${last.map((t) => t.url).join(', ') || 'none'})`);
}

export async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
  });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(typeof e.data === 'string' ? e.data : e.data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  // Evaluates an expression (awaiting a returned promise) and returns its value.
  async function evaluate(expression, timeout = 60000) {
    const r = await Promise.race([
      send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }),
      sleep(timeout).then(() => { throw new Error(`evaluate timed out: ${expression.slice(0, 80)}`); }),
    ]);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text);
    }
    return r.result ? r.result.value : undefined;
  }

  async function until(expression, ms = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try { if (await evaluate(`!!(${expression})`)) return; } catch { /* page reloading */ }
      await sleep(100);
    }
    throw new Error(`timeout waiting for ${expression}`);
  }

  async function screenshot() {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(r.data, 'base64');
  }

  return { send, evaluate, until, screenshot, close: () => ws.close() };
}
