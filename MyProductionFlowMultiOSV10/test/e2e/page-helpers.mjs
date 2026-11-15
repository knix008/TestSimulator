// Helpers installed in the app page (window.__t) for the E2E suites: synthetic
// pointer events on the 2D editor canvas at world points (no real mouse), model
// set-up and clean-up, waiting. Shared by the web and desktop suites.
export const PAGE_HELPERS = String.raw`(() => {
  const A = () => window.__myproductionflow;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = (n = 2) => new Promise((resolve) => { let i = 0; const step = () => { if (++i >= n) resolve(); else requestAnimationFrame(step); }; requestAnimationFrame(step); });
  const canvas = () => A().canvas.canvas;
  /** World metres → client pixels of the 2D canvas. */
  const screen = (x, y) => { const c = A().canvas; const r = c.canvas.getBoundingClientRect(); const [sx, sy] = c.toScreen(x, y); return { x: r.left + sx, y: r.top + sy }; };
  const fire = (type, x, y, extra = {}) => {
    const pressed = type === 'pointerdown' || (type === 'pointermove' && extra.pressed);
    const init = { clientX: x, clientY: y, screenX: x, screenY: y, bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
      button: extra.button ?? (type === 'pointermove' ? -1 : 0), buttons: pressed ? 1 : 0, ctrlKey: Boolean(extra.ctrl), shiftKey: Boolean(extra.shift), altKey: Boolean(extra.alt), detail: extra.detail ?? 1 };
    const Ctor = type.startsWith('pointer') ? PointerEvent : MouseEvent;
    return canvas().dispatchEvent(new Ctor(type, init));
  };
  async function click(x, y, extra = {}) { fire('pointermove', x, y, extra); await frames(1); fire('pointerdown', x, y, extra); fire('pointerup', x, y, extra); await frames(2); }
  async function dblclick(x, y, extra = {}) { await click(x, y, extra); await click(x, y, { ...extra, detail: 2 }); fire('dblclick', x, y, { ...extra, detail: 2 }); await frames(2); }
  async function drag(a, b, extra = {}, steps = 8) {
    fire('pointermove', a.x, a.y, extra); await frames(1);
    fire('pointerdown', a.x, a.y, extra); await frames(1);
    for (let i = 1; i <= steps; i++) { fire('pointermove', a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps, { ...extra, pressed: true }); await frames(1); }
    fire('pointerup', b.x, b.y, extra); await frames(2);
  }
  const clickWorld = (x, y, extra) => { const s = screen(x, y); return click(s.x, s.y, extra); };
  const dragWorld = (a, b, extra, steps) => drag(screen(a[0], a[1]), screen(b[0], b[1]), extra, steps);
  /** Closes popups and frames, stops a run, back to the select tool, and makes sure a model is open. */
  async function reset({ project = true } = {}) {
    const a = A();
    if (a.tutorial()?.state().active) await a.tutorial().stop();
    await a.popups.closeAll();
    for (const el of document.querySelectorAll('.web-popup')) el.remove();
    for (const el of document.querySelectorAll('.web-popup-shield')) el.remove();
    a.popups.frames.clear();
    a.actions.stopRun({ quiet: true });
    if (project && (!a.state.doc || a.state.showStart)) { if (a.state.doc) a.actions.showStartPage(false); else a.actions.newProject('blank'); }
    if (a.state.tool !== 'select') a.actions.setTool('select');
    a.canvas?.cancelPlace();
    await frames(2);
  }
  /** A fresh model from a template, marked saved so that the next one replaces it without a question. */
  async function fresh(template = 'blank') {
    await reset({ project: false });
    const d = A().actions.newProject(template);
    d.markSaved();
    await frames(3);
    return d;
  }
  async function sample(id) {
    await reset({ project: false });
    const d = A().api.openSample(id);
    d.markSaved();
    await frames(3);
    return d;
  }
  const model = () => A().state.doc?.model;
  const byName = (name) => model()?.blocks.find((b) => b.name === name);
  async function until(test, timeout = 10000, label = 'condition') {
    const end = performance.now() + timeout;
    let last;
    while (performance.now() < end) { try { last = await test(); if (last) return last; } catch (e) { last = e.message; } await sleep(50); }
    throw new Error('timed out: ' + label + ' (last: ' + JSON.stringify(last) + ')');
  }
  const frameOf = (kind) => document.querySelector('.web-popup-' + kind + ' iframe');
  async function popupReady(kind, timeout = 15000) {
    return until(() => { const f = frameOf(kind); const d = f?.contentDocument; return Boolean(f?.contentWindow?.__myproductionflowPopup && d?.querySelector('.popup, .popup-menu, [role="dialog"]') && getComputedStyle(f.parentElement).visibility !== 'hidden'); }, timeout, 'popup ' + kind);
  }
  window.__t = { sleep, frames, screen, fire, click, dblclick, drag, clickWorld, dragWorld, reset, fresh, sample, model, byName, until, frameOf, popupReady };
  return true;
})()`;
