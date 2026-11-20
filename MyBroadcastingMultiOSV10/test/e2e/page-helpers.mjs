// Helpers installed in the app page (window.__t) for the E2E suites: frames, waiting, popups as frames,
// and putting the app back into a known state. Shared by the web and desktop suites.
export const PAGE_HELPERS = String.raw`(() => {
  const A = () => window.__mybroadcasting;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = (n = 2) => new Promise((resolve) => { let i = 0; const step = () => { if (++i >= n) resolve(); else requestAnimationFrame(step); }; requestAnimationFrame(step); });
  async function until(test, timeout = 10000, label = 'condition') {
    const end = performance.now() + timeout;
    let last;
    while (performance.now() < end) { try { last = await test(); if (last) return last; } catch (e) { last = e.message; } await sleep(50); }
    throw new Error('timed out: ' + label + ' (last: ' + JSON.stringify(last) + ')');
  }
  const frameOf = (kind) => document.querySelector('.web-popup-' + kind + ' iframe');
  const popupDoc = (kind) => frameOf(kind)?.contentDocument ?? null;
  async function popupReady(kind, timeout = 15000) {
    return until(() => { const f = frameOf(kind); const d = f?.contentDocument; return Boolean(f?.contentWindow?.__mybroadcastingPopup && d?.querySelector('.popup, .popup-menu, .color-picker, [role="dialog"]') && getComputedStyle(f.parentElement).visibility !== 'hidden'); }, timeout, 'popup ' + kind);
  }
  /** Closes popups and frames; with workspace: a fresh sample collection (never saved) in the studio, else the start page. */
  async function reset({ workspace = false } = {}) {
    const a = A();
    if (a.tutorial()?.state().active) await a.tutorial().stop();
    await a.popups.closeAll();
    for (const el of document.querySelectorAll('.web-popup')) el.remove();
    for (const el of document.querySelectorAll('.web-popup-shield')) el.remove();
    a.popups.frames.clear();
    if (a.state.settings.multiview) a.app.updateSettings({ multiview: false });
    if (a.studio.studioMode) a.studio.setStudioMode(false);
    await a.studio.stopAll();
    // A fresh copy of the sample every time: no case sees what the one before it changed.
    if (workspace) { a.app.openTemplate(typeof workspace === 'string' ? workspace : 'talk'); a.app.showStartPage(false); }
    else a.app.showStartPage(true);
    await frames(2);
  }
  const rect = (selector) => { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }; };
  /** An empty collection of its own (never saved), the studio shown. */
  async function empty(name = 'Test') {
    const a = A();
    await reset();
    a.studio.noSave = true;
    a.studio.collection = a.studio.localize(a.M.createCollection(name));
    a.studio.undoStack = []; a.studio.redoStack = [];
    a.studio.selection = { items: new Set(), source: null };
    a.studio.engine.setCollection(a.studio.c);
    a.app.showStartPage(false);
    await frames(3);
    return a.studio.c;
  }
  const fixture = (name) => location.origin + '/test/fixtures/' + name;
  /** Adds a source to the edited scene (no prompts); returns { source, item, rt }. */
  async function add(type, settings = {}, transform = null, name = null) {
    const a = A();
    const made = a.studio.addSource(type, name ?? type, settings);
    if (transform) a.studio.setItem(made.item.id, (it) => ({ transform: { ...it.transform, ...transform } }));
    await frames(2);
    return { ...made, rt: a.studio.engine.runtime(made.source.id) };
  }
  /** RGBA of the program (or 'scene:<id>' / 'source:<id>') at canvas pixel (x, y), after fresh frames. */
  async function pixel(x, y, which = 'program', wait = 4) {
    await frames(wait);
    await sleep(80);
    const p = A().studio.engine.capture(which);
    const i = (Math.round(y) * p.width + Math.round(x)) * 4;
    return [p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]];
  }
  const near = (a, b, tol = 24) => a.every((v, i) => b[i] == null || Math.abs(v - b[i]) <= tol);
  function check(cond, message) { if (!cond) throw new Error(message); }
  /** Peak level (dB) of a source's meter, the loudest of a few reads. */
  async function level(id, ms = 600) {
    const a = A();
    let best = -Infinity;
    const end = performance.now() + ms;
    await sleep(300); // gains glide (setTargetAtTime): let them arrive first
    while (performance.now() < end) { const m = a.studio.mixer.meter(id); if (m) best = Math.max(best, ...m.peak); await sleep(50); }
    return best;
  }
  /** Files the web build downloaded since the last call: [{ name, size, head (hex of the first 12 bytes) }]. */
  async function downloads(re = /./, n = 1, timeout = 20000) {
    window.__mybroadcastingDownloads ??= [];
    const list = await until(() => { const l = window.__mybroadcastingDownloads.filter((d) => re.test(d.name)); return l.length >= n ? l : false; }, timeout, 'downloads ' + re);
    const out = [];
    for (const d of list) { const b = new Uint8Array(await d.blob.slice(0, 12).arrayBuffer()); out.push({ name: d.name, size: d.blob.size, head: [...b].map((x) => x.toString(16).padStart(2, '0')).join('') }); }
    return out;
  }
  window.__mybroadcastingDownloads = [];
  window.__t = { downloads, sleep, frames, until, frameOf, popupDoc, popupReady, reset, rect, empty, fixture, add, pixel, near, check, level };
})(); 1`;
