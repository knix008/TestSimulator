// Helpers installed in the app page (window.__t) for the E2E suites: frames, waiting, popups as frames
// (fill a form, pick a menu item), pointer gestures on the canvas, and putting the app back into a
// known state. Shared by the web and desktop suites.
export const PAGE_HELPERS = String.raw`(() => {
  const A = () => window.__myagents;
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
    return until(() => { const f = frameOf(kind); const d = f?.contentDocument; return Boolean(f?.contentWindow?.__myagentsPopup && d?.querySelector('.popup, .popup-menu, .color-picker, [role="dialog"]') && getComputedStyle(f.parentElement).visibility !== 'hidden'); }, timeout, 'popup ' + kind);
  }
  /** Fills the form popup ({ name: value }) and presses its main button. */
  async function fillForm(values) {
    await popupReady('form');
    const d = popupDoc('form');
    for (const [name, value] of Object.entries(values)) {
      const el = d.querySelector('[data-ff="' + name + '"]');
      if (!el) throw new Error('form field ' + name);
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    d.querySelector('[data-action="form-submit"]').click();
  }
  /** Chooses a menu item (by id) in the open menu popup. */
  async function pickMenu(id) {
    await popupReady('menu');
    const item = await until(() => popupDoc('menu')?.querySelector('.menu-item[data-id="' + CSS.escape(id) + '"]'), 5000, 'menu item ' + id);
    item.click();
  }
  /** A pointer gesture from one point to another (client coordinates). */
  async function drag(from, to, target, { steps = 6 } = {}) {
    const opts = (x, y, type) => ({ bubbles: true, cancelable: true, pointerId: 7, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, isPrimary: true });
    const start = target ?? document.elementFromPoint(from.x, from.y);
    start.dispatchEvent(new PointerEvent('pointerdown', opts(from.x, from.y, 'pointerdown')));
    const host = document.querySelector('.canvas-host');
    for (let i = 1; i <= steps; i += 1) { const x = from.x + ((to.x - from.x) * i) / steps; const y = from.y + ((to.y - from.y) * i) / steps; host.dispatchEvent(new PointerEvent('pointermove', opts(x, y, 'pointermove'))); await frames(1); }
    host.dispatchEvent(new PointerEvent('pointerup', opts(to.x, to.y, 'pointerup')));
    await frames(2);
  }
  const centre = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const nodeEl = (id) => document.querySelector('.node[data-node="' + CSS.escape(id) + '"]');
  /** Closes popups and frames; with agent: a template agent is open in the editor (stored in the core). */
  async function reset({ agent = null } = {}) {
    const a = A();
    await a.popups.closeAll();
    for (const el of document.querySelectorAll('.web-popup')) el.remove();
    for (const el of document.querySelectorAll('.web-popup-shield')) el.remove();
    a.popups.frames.clear();
    a.editor.state.paletteQuery = '';
    if (a.editor.dirty() && a.state.hasDoc) a.editor.state.saved = JSON.stringify(Object.fromEntries(['name', 'description', 'icon', 'nodes', 'edges', 'variables'].map((k) => [k, a.editor.doc()[k]])));
    if (agent) {
      await until(() => a.state.core.status === 'ready', 30000, 'core ready');
      await a.actions.fromTemplate(agent);
      await until(() => document.querySelectorAll('.canvas-host .node').length === a.editor.doc().nodes.length, 10000, 'canvas drawn');
    } else if (a.state.hasDoc) { await a.actions.closeAgent(); }
    else if (!a.state.showStart) a.actions.showStartPage(true);
    await frames(2);
  }
  const rect = (selector) => { const el = typeof selector === 'string' ? document.querySelector(selector) : selector; if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }; };
  window.__t = { sleep, frames, until, frameOf, popupDoc, popupReady, fillForm, pickMenu, drag, centre, nodeEl, reset, rect };
})(); 1`;
