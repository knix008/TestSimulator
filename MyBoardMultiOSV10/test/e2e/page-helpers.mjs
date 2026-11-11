// Helpers installed in the app page (window.__t) for the E2E suites: frames, waiting, popups as frames,
// and putting the app back into a known state. Shared by the web and desktop suites.
export const PAGE_HELPERS = String.raw`(() => {
  const A = () => window.__myboard;
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
    return until(() => { const f = frameOf(kind); const d = f?.contentDocument; return Boolean(f?.contentWindow?.__myboardPopup && d?.querySelector('.popup, .popup-menu, .color-picker, [role="dialog"]') && getComputedStyle(f.parentElement).visibility !== 'hidden'); }, timeout, 'popup ' + kind);
  }
  /** Closes popups and frames; with workspace: a demo workspace is open (no database needed). */
  async function reset({ workspace = false } = {}) {
    const a = A();
    if (a.tutorial()?.state().active) await a.tutorial().stop();
    await a.popups.closeAll();
    for (const el of document.querySelectorAll('.web-popup')) el.remove();
    for (const el of document.querySelectorAll('.web-popup-shield')) el.remove();
    a.popups.frames.clear();
    if (workspace) { if (!a.state.doc) a.actions.openDemo('kanban'); else if (a.state.showStart) a.actions.showStartPage(false); }
    else if (a.state.doc) await a.actions.closeProject();
    await frames(2);
  }
  const rect = (selector) => { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }; };
  window.__t = { sleep, frames, until, frameOf, popupDoc, popupReady, reset, rect };
})(); 1`;
