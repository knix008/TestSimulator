// Helpers installed in the app page (window.__t) for the E2E suites: frames,
// synthetic pointer events on the 3D canvas at world points (no real mouse),
// project set-up and clean-up. Shared by the web and desktop suites.
export const PAGE_HELPERS = String.raw`(() => {
  const A = () => window.__mysketchbook;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = (n = 2) => new Promise((resolve) => { let i = 0; const step = () => { if (++i >= n) resolve(); else requestAnimationFrame(step); }; requestAnimationFrame(step); });
  const canvas = () => A().viewport.canvas;
  const vec = (x, y, z) => A().viewport.target.clone().set(x, y, z);
  const screen = (x, y, z) => { A().viewport.camera.updateMatrixWorld(); return A().viewport.worldToScreen(vec(x, y, z)); };
  const fire = (type, x, y, extra = {}) => {
    const pressed = type === 'pointerdown' || (type === 'pointermove' && extra.pressed);
    const init = { clientX: x, clientY: y, screenX: x, screenY: y, bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
      button: type === 'pointermove' ? -1 : 0, buttons: pressed ? 1 : 0, ctrlKey: Boolean(extra.ctrl), shiftKey: Boolean(extra.shift), altKey: Boolean(extra.alt) };
    const Ctor = type.startsWith('pointer') ? PointerEvent : MouseEvent;
    return canvas().dispatchEvent(new Ctor(type, init));
  };
  /** Moves to (x, y), waits for the throttled move handler, then presses and releases there. */
  async function click(x, y, extra = {}) {
    fire('pointermove', x, y, extra); await frames(3);
    fire('pointerdown', x, y, extra); fire('pointerup', x, y, extra);
    await frames(2);
  }
  /** Press at a, move in steps (each waits for the throttled move handler), release at b. */
  async function drag(a, b, extra = {}, steps = 8) {
    fire('pointermove', a.x, a.y, extra); await frames(2);
    fire('pointerdown', a.x, a.y, extra); await frames(1);
    for (let i = 1; i <= steps; i++) { fire('pointermove', a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps, { ...extra, pressed: true }); await frames(2); }
    fire('pointerup', b.x, b.y, extra); await frames(2);
  }
  async function move(x, y, extra = {}) { fire('pointermove', x, y, extra); await frames(3); }
  const clickWorld = async (x, y, z, extra) => { const s = screen(x, y, z); await click(s.x, s.y, extra); return s; };
  const moveWorld = async (x, y, z, extra) => { const s = screen(x, y, z); await move(s.x, s.y, extra); return s; };
  /** Top view framing a box (plan-like, but the 3D view: walls are picked from above). */
  async function top(box = [-5, 5]) {
    const v = A().viewport;
    const B = v.contentBox().clone();
    B.min.set(box[0], 0, box[0]); B.max.set(box[1], 2.5, box[1]);
    v.setView('top', { animate: false, box: B });
    v.requestRender(); await frames(3);
  }
  async function iso(box) {
    const v = A().viewport;
    if (box) { const B = v.contentBox().clone(); B.min.set(...box[0]); B.max.set(...box[1]); v.setView('iso', { animate: false, box: B }); }
    else v.setView('iso', { animate: false });
    v.requestRender(); await frames(3);
  }
  /** Closes popups and frames, back to the select tool, and makes sure a project is open (not the start page). */
  async function reset({ project = true } = {}) {
    const a = A();
    if (a.tutorial()?.state().active) await a.tutorial().stop();
    await a.popups.closeAll();
    for (const el of document.querySelectorAll('.web-popup')) el.remove();
    for (const el of document.querySelectorAll('.web-popup-shield')) el.remove();
    a.popups.frames.clear();
    if (project && (!a.state.doc || a.state.showStart)) { if (a.state.doc) a.actions.showStartPage(false); else a.actions.newProject('room'); }
    if (a.state.planView) a.actions.setPlanView(false);
    if (a.viewport && a.state.tool !== 'select') a.actions.setTool('select');
    await frames(2);
  }
  /** A fresh project from a template, marked saved so that the next one replaces it without a question. */
  async function fresh(template = 'empty') {
    await reset({ project: false });
    const d = A().actions.newProject(template);
    d.markSaved();
    await frames(2);
    return d;
  }
  const counts = () => { const p = A().state.doc?.project; return p ? { walls: p.walls.length, rooms: p.rooms.length, openings: p.openings.length, objects: p.objects.length, models: p.models.length, scenes: p.scenes.length, levels: p.levels.length } : null; };
  async function until(test, timeout = 10000, label = 'condition') {
    const end = performance.now() + timeout;
    let last;
    while (performance.now() < end) { try { last = await test(); if (last) return last; } catch (e) { last = e.message; } await sleep(50); }
    throw new Error('timed out: ' + label + ' (last: ' + JSON.stringify(last) + ')');
  }
  const frameOf = (kind) => document.querySelector('.web-popup-' + kind + ' iframe');
  async function popupReady(kind, timeout = 15000) {
    return until(() => { const f = frameOf(kind); const d = f?.contentDocument; return Boolean(f?.contentWindow?.__mysketchbookPopup && d?.querySelector('.popup, .popup-menu, .color-picker, [role="dialog"]') && getComputedStyle(f.parentElement).visibility !== 'hidden'); }, timeout, 'popup ' + kind);
  }
  window.__t = { sleep, frames, vec, screen, fire, click, drag, move, clickWorld, moveWorld, top, iso, reset, fresh, counts, until, frameOf, popupReady };
})(); 1`;
