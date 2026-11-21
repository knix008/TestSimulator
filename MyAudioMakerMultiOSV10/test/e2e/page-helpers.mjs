// Helpers installed in the app page (window.__t) for the E2E suites: frames, waiting, popups, and a
// fresh song for each case. Shared by the web and desktop suites.
export const PAGE_HELPERS = String.raw`(() => {
  const A = () => window.__myaudiomaker;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = (n = 2) => new Promise((resolve) => { let i = 0; const step = () => { if (++i >= n) resolve(); else requestAnimationFrame(step); }; requestAnimationFrame(step); });
  async function until(test, timeout = 10000, label = 'condition') {
    const end = performance.now() + timeout;
    let last;
    while (performance.now() < end) { try { last = await test(); if (last) return last; } catch (e) { last = e.message; } await sleep(50); }
    throw new Error('timed out: ' + label + ' (last: ' + JSON.stringify(last) + ')');
  }
  /** Closes popups and frames, stops playback, and makes sure a song is open (not the start page). */
  async function reset({ song = true } = {}) {
    const a = A();
    if (a.tutorial()?.state().active) await a.tutorial().stop();
    a.actions.stopPlayback();
    // Tests sing with the guide voice (the AI voice would download a voice bank); AI voice tests turn it on themselves.
    if (a.state.settings.voiceEngine !== 'guide') a.api.updateSettings({ voiceEngine: 'guide' }, { quiet: true });
    await a.popups.closeAll();
    for (const el of document.querySelectorAll('.web-popup')) el.remove();
    for (const el of document.querySelectorAll('.web-popup-shield')) el.remove();
    a.popups.frames.clear();
    if (song && (!a.state.doc || a.state.showStart)) { if (a.state.doc) a.actions.showStartPage(false); else a.actions.newSong('pop'); }
    await frames(2);
  }
  /** A fresh song from a template (or a sample), marked saved so the next one replaces it without a question. */
  async function fresh(template = 'pop') {
    await reset({ song: false });
    if (A().state.doc) A().state.doc.markSaved();
    const d = A().actions.newSong(template);
    d.markSaved();
    await frames(2);
    return d;
  }
  async function sample(id = 'pop-firstlove') {
    await reset({ song: false });
    if (A().state.doc) A().state.doc.markSaved();
    const d = await A().actions.openSampleAsk(id);
    d.markSaved();
    await frames(2);
    return d;
  }
  const frameOf = (kind) => document.querySelector('.web-popup-' + kind + ' iframe');
  async function popupReady(kind, timeout = 15000) {
    return until(() => { const f = frameOf(kind); const d = f?.contentDocument; return Boolean(f?.contentWindow?.__myaudiomakerPopup && d?.querySelector('.popup, .popup-menu, .color-picker, [role="dialog"]') && getComputedStyle(f.parentElement).visibility !== 'hidden'); }, timeout, 'popup ' + kind);
  }
  /** Icons drawn as the fallback dot (a name the icon set does not have). */
  const missingIcons = (doc = document) => [...doc.querySelectorAll('svg[data-icon="dot"]')].length;
  /** Text that looks like an untranslated key ("section.verse"). */
  const rawKeys = (doc = document) => [...new Set((doc.body.innerText.match(/\b[a-z]+\.[a-z][a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*\b/g) ?? []).filter((k) => !/\.(mam|mid|midi|txt|lrc|json|wav|com|pdf|zip|js|html|anthropic)$/.test(k) && !/^(e\.g|i\.e|api\.|console\.|localhost)/.test(k)))];
  window.__t = { sleep, frames, until, reset, fresh, sample, frameOf, popupReady, missingIcons, rawKeys };
})(); 1`;

/** Runs a command by id (the same path as a menu or toolbar click). */
export const COMMAND_HELPER = String.raw`window.__cmd = (id, context) => window.__myaudiomaker.run(id, context); 1`;
