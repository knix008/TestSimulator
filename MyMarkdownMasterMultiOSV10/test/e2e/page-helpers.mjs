// Helpers installed in the app page (window.__t) for the E2E suites: frames, waiting, popups as frames,
// and putting the app back into a known state. Shared by the web and desktop suites.
export const PAGE_HELPERS = String.raw`(() => {
  const A = () => window.__mymarkdown;
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
    return until(() => { const f = frameOf(kind); const d = f?.contentDocument; return Boolean(f?.contentWindow?.__mymarkdownPopup && d?.querySelector('.popup, .popup-menu, [role="dialog"]') && getComputedStyle(f.parentElement).visibility !== 'hidden'); }, timeout, 'popup ' + kind);
  }
  /** Closes popups, the palette and extra panes; with vault: the "Guide" sample vault is open (fresh when fresh: true). */
  async function reset({ vault = false, fresh = false } = {}) {
    const a = A();
    if (a.tutorial()?.state().active) await a.tutorial().stop();
    document.querySelector('.suggest-layer')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    for (const el of document.querySelectorAll('.suggest-layer')) el.remove();
    await a.popups.closeAll();
    for (const el of document.querySelectorAll('.web-popup, .web-popup-shield')) el.remove();
    a.popups.frames.clear();
    if (vault) {
      const guide = a.t('sample.guide');
      if (fresh || a.state.vault?.name !== guide) await a.app.openSample('guide');
      await a.app.restoreLayout(null);
      await a.app.openFile(a.app.lang() === 'en' ? 'Welcome.md' : '시작하기.md', { mode: 'live' });
      a.state.showStart = false; a.app.renderAll();
    } else if (a.state.vault) { await a.app.closeVault(); }
    await frames(2);
  }
  const rect = (selector) => { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }; };
  const activeView = () => A().app.activeNoteView();
  window.__t = { sleep, frames, until, frameOf, popupDoc, popupReady, reset, rect, activeView };
})(); 1`;
