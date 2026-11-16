// Pictures of furniture items drawn in the background worker
// (src/view3d/thumbworker.js), so registering an item or drawing many
// library pictures never freezes the app. itemsThumb(items, models) → a PNG
// data URL, or null when this browser cannot draw in a worker (the caller
// then draws on the page as before).
let ready = null;
let seq = 0;
const waiting = new Map();

function worker() {
  if (ready) return ready;
  ready = new Promise((resolve) => {
    let w;
    try { w = new Worker(new URL("../view3d/thumbworker.js", import.meta.url), { type: "module" }); } catch { resolve(null); return; }
    const timer = setTimeout(() => { try { w.terminate(); } catch { /* gone */ } resolve(null); }, 15000);
    w.onerror = () => { clearTimeout(timer); resolve(null); };
    w.onmessage = (e) => {
      const m = e.data;
      if (m.ready) { clearTimeout(timer); resolve(m.webgl ? w : null); if (!m.webgl) w.terminate(); return; }
      const p = waiting.get(m.id);
      if (!p) return;
      waiting.delete(m.id);
      if (m.error || !m.img) p(null);
      else { const r = new FileReader(); r.onload = () => p(String(r.result)); r.onerror = () => p(null); r.readAsDataURL(m.img); }
    };
  });
  return ready;
}

export async function itemsThumb(items, models = [], { w = 160, h = 128 } = {}) {
  const wk = await worker();
  if (!wk) return null;
  const id = `items-${++seq}`;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    wk.postMessage({ id, type: "items", items, models, w, h });
  });
}
