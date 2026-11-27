// Helpers installed in the app page (window.__t) for the E2E suites: frames, waiting, popups as frames,
// and putting the app back into a known state. Shared by the web and desktop suites.
export const PAGE_HELPERS = String.raw`(() => {
  const A = () => window.__myhexa;
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
    return until(() => { const f = frameOf(kind); const d = f?.contentDocument; return Boolean(f?.contentWindow?.__myhexaPopup && d?.querySelector('.popup, .popup-menu, [role="dialog"]') && getComputedStyle(f.parentElement).visibility !== 'hidden'); }, timeout, 'popup ' + kind);
  }
  /** Closes popups and every tab (unsaved changes dropped); with sample: that sample open in a tab; else the start page. */
  async function reset({ sample = null } = {}) {
    const a = A();
    if (a.tutorial()?.state().active) await a.tutorial().stop();
    for (const el of document.querySelectorAll('.suggest-layer')) el.remove();
    await a.popups.closeAll();
    for (const el of document.querySelectorAll('.web-popup, .web-popup-shield')) el.remove();
    a.popups.frames.clear();
    for (const tab of [...a.editor.tabs]) await a.editor.close(tab, { force: true });
    if (sample) { await a.app.openSample(sample); await until(() => document.querySelector('.hx-row'), 8000, 'hex rows'); }
    else a.app.showStartPage(true);
    await frames(2);
  }
  /** Fills a tool window's field and fires its input / change event. */
  function fill(kind, selector, value) {
    const d = popupDoc(kind);
    const el = d.querySelector(selector);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el;
  }
  const click = (kind, selector) => { const el = popupDoc(kind).querySelector(selector); el.click(); return el; };
  const rect = (selector) => { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }; };
  const view = () => A().editor.activeView();
  const doc = () => A().editor.activeDoc();
  const bytes = async (offset, length) => [...await doc().read(offset, length)];
  const key = (k, opts = {}) => view().input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));
  window.__t = { sleep, frames, until, frameOf, popupDoc, popupReady, reset, fill, click, rect, view, doc, bytes, key };
})(); 1`;
