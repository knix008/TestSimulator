//@step {"name": "settings: helpers (the settings popup is a frame in the web build)", "expect": "^ok$"}
return (() => {
  const m = window.__mymechanics;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
  /** What the main window shows: the snapshot plus the pixels of the 3D view and of the overlay canvases. */
  window.__look = () => {
    const vp = m.viewport;
    let pix = 0;
    try {
      const c = vp?.capture?.(96, 64);
      const d = c?.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      if (d) for (let i = 0; i < d.length; i += 7) pix = (pix * 31 + d[i]) | 0;
    } catch { /* no view */ }
    let over = 0;
    for (const cv of document.querySelectorAll('#view-host canvas')) {
      if (cv === vp?.canvas) continue;
      try { const d = cv.getContext('2d')?.getImageData(0, 0, cv.width, cv.height).data; if (d) for (let i = 0; i < d.length; i += 97) over = (over * 31 + d[i]) | 0; } catch { /* not 2d */ }
    }
    const s = window.__snap();
    delete s.settings;
    return { ...s, pix, over, text: hash(document.querySelector('#app')?.innerText ?? ''), css: hash(['#menubar', '#menubar [data-menu]', '#toolbar', '#toolbar button', '#tabs', '#palette-host button', '#left-panel', '.tree-label', '#right-panel', '#statusbar', '#view-host', '#start-page', '#start-page .start-scroll', '#start-page canvas'].map((q) => { const e = document.querySelector(q); if (!e) return ''; const c = getComputedStyle(e); const r = e.getBoundingClientRect(); return [e.className, c.fontFamily, c.fontSize, c.fontWeight, c.fontStyle, c.color, c.backgroundColor, c.backgroundImage.slice(0, 200), c.borderColor, Math.round(r.width), Math.round(r.height)].join('/'); }).join('|')) };
  };
  window.__settingsWin = async (tab = null) => {
    if (!m.popups.isOpen('settings')) { m.run('settings'); }
    let win = null;
    for (let i = 0; i < 80; i++) {
      win = m.popups.frames.get('settings')?.querySelector('iframe')?.contentWindow;
      if (win?.document?.querySelector('[data-action="tab"]')) break;
      await sleep(100);
    }
    if (!win?.document?.querySelector('[data-action="tab"]')) throw new Error('the settings popup did not open');
    if (tab) {
      const b = win.document.querySelector(`[data-action="tab"][data-value="${tab}"]`);
      b?.click();
      await sleep(120);
    }
    return win;
  };
  // Settings whose effect is not visible in the main window right after the change, and why (their value is
  // still required to reach the app's settings).
  window.__SETTINGS_STORED_ONLY = {
    showWelcome: 'the welcome window at the next start',
    snapToGrid: 'used while drawing in a sketch',
    autoRelations: 'used while drawing in a sketch',
    editDimOnCreate: 'used when a smart dimension is placed',
    projection: 'first / third angle: used when drawing views are made',
    invertZoom: 'used by the mouse wheel',
    confirmExit: 'asked when the app is closed',
    recentMax: 'the length of the recent files list',
    startTab: 'the start page at the next start',
    restoreSession: 'at the next start',
    autosave: 'timer of the next automatic save',
    autosaveMinutes: 'timer of the next automatic save',
    reopenLast: 'at the next start',
    showStartPage: 'whether the start page shows at the next start',
    startRecentCount: 'how many recent files the start page lists — the test profile has none',
    animation: 'the kind of the animated start-page background: its canvas animates all the time, so one look cannot tell a new kind from the next frame (checked by "background kind" and Shuffle instead)',
    animationSpeed: 'read by the start-page animation on every frame',
    backgroundFit: 'how a background picture is laid out — no picture is set here; see the "background picture" step',
    backgroundOpacity: 'how strongly a background picture shows — no picture is set here; see the "background picture" step',
    animationInterval: 'the timer that changes the animation',
    animationRandom: 'a random animation at the next start',
    animationOnStartOnly: 'where the animation runs (only the start page in this app)',
  };
  /**
   * Every control of the open settings tab: toggles, segments (data-setting), drop-downs, steppers, sliders,
   * framed numbers. Each must change the app's settings (the popup writes them, the app reads them), and the
   * main window must look different unless the setting is listed in __SETTINGS_STORED_ONLY.
   */
  window.__settingsTab = async (tab) => {
    const fails = []; const seen = [];
    const settled = async () => { await sleep(140); };
    const main = () => JSON.stringify(m.state.settings);
    const check = async (label, act, keyHint) => {
      const s0 = main(); const l0 = JSON.stringify(window.__look());
      await act(); await settled();
      const s1 = main();
      if (s1 === s0) { fails.push(`${label}: the app's settings did not change`); return; }
      const changedKeys = Object.keys(JSON.parse(s1)).filter((k) => JSON.stringify(JSON.parse(s1)[k]) !== JSON.stringify(JSON.parse(s0)[k]));
      seen.push(`${label}→${changedKeys.join('+')}`);
      if (changedKeys.every((k) => window.__SETTINGS_STORED_ONLY[k])) return;
      if (JSON.stringify(window.__look()) === l0) fails.push(`${label} (${changedKeys.join('+')}): nothing in the main window changed`);
    };
    const onStart = tab === 'background' || tab === 'start';
    if (onStart) { m.actions.showStartPage(true); await sleep(200); }
    let win = await window.__settingsWin(tab);
    const doc = () => win.document;
    const q = (sel) => doc().querySelector(sel);
    const qa = (sel) => [...doc().querySelectorAll(sel)];
    if (!q(`[data-action="tab"][data-value="${tab}"]`)?.classList.contains('active')) fails.push(`tab ${tab} did not open`);
    // Toggles.
    for (const key of [...new Set(qa('input[data-toggle]').map((x) => x.dataset.toggle))]) {
      await check(`toggle ${key}`, () => { const b = q(`input[data-toggle="${key}"]`); b.click(); }, key);
      q(`input[data-toggle="${key}"]`)?.click(); await settled();
    }
    // Segments and theme rows (data-setting): every option not active.
    for (const key of [...new Set(qa('[data-setting]').map((x) => x.dataset.setting))]) {
      const start = m.state.settings[key];
      const values = [...new Set(qa(`[data-setting="${key}"]`).map((x) => x.dataset.value))];
      // Theme rows: a few of them (each is a full re-colouring).
      const list = key === 'theme' ? values.filter((v) => String(v) !== String(start)).slice(0, 4) : values.filter((v) => String(v) !== String(start));
      for (const v of list) {
        await check(`${key}=${v}`, () => q(`[data-setting="${key}"][data-value="${CSS.escape(v)}"]`)?.click(), key);
        if (String(m.state.settings[key]) !== String(v)) fails.push(`${key}=${v}: the app has ${m.state.settings[key]}`);
        // Back to the start value before the next option, so each option is compared with the same state.
        { const b0 = q(`[data-setting="${key}"][data-value="${CSS.escape(String(start))}"]`); if (b0 && key !== 'theme') { b0.click(); await settled(); } }
      }
      const back = q(`[data-setting="${key}"][data-value="${CSS.escape(String(start))}"]`);
      if (back) { back.click(); await settled(); }
    }
    // Drop-downs.
    for (const key of [...new Set(qa('select[data-select]').map((x) => x.dataset.select))]) {
      const sel = q(`select[data-select="${key}"]`);
      const start = sel.value;
      const opts = [...sel.options].map((o) => o.value).filter((v) => v !== start).slice(0, 3);
      for (const v of opts) {
        await check(`${key}=${v}`, () => { const s = q(`select[data-select="${key}"]`); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, key);
      }
      const s = q(`select[data-select="${key}"]`); if (s) { s.value = start; s.dispatchEvent(new Event('change', { bubbles: true })); await settled(); }
    }
    // Steppers ([ − ] value [ + ]): −, + and a typed value.
    for (const key of [...new Set(qa('[data-stepper]').map((x) => x.dataset.stepper))]) {
      const el = () => q(`[data-stepper="${key}"]`);
      if (el().classList.contains('disabled')) continue;
      const val = () => Number(el().querySelector('.stepper-value').value);
      const start = val();
      const up = () => el().querySelector('[data-step-dir="1"]'); const down = () => el().querySelector('[data-step-dir="-1"]');
      const first = up().hasAttribute('data-at-limit') ? down : up; const second = first === up ? down : up;
      await check(`${key} ${first === up ? '+' : '−'}`, () => first().click(), key);
      await check(`${key} ${second === up ? '+' : '−'}`, () => second().click(), key);
      const min = Number(el().dataset.min); const max = Number(el().dataset.max); const step = Number(el().dataset.step) || 1;
      const target = Math.min(max, Math.max(min, start + step * 2 <= max ? start + step * 2 : start - step * 2));
      await check(`${key} typed ${target}`, () => { const i = el().querySelector('.stepper-value'); i.value = String(target); i.dispatchEvent(new Event('change', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); i.blur(); }, key);
      const grid = Math.min(max, Math.max(min, Math.round((target - min) / step) * step + min));
      if (Math.abs(val() - grid) > 1e-9) fails.push(`${key}: typed ${target}, shows ${val()} (expected ${grid})`);
      const i = el().querySelector('.stepper-value'); i.value = String(start); i.dispatchEvent(new Event('change', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); i.blur(); await settled();
    }
    // Sliders (framed by ui/sliders.js) and framed numbers: −, + and a typed value.
    for (const range of qa('input[type="range"]')) {
      const wrap = range.closest('.slider-control');
      const label = range.getAttribute('aria-label') || range.id || range.name || 'slider';
      if (!wrap) { fails.push(`slider ${label}: no − / + frame`); continue; }
      const [minus, plus] = wrap.querySelectorAll('.slider-step');
      const startV = range.value;
      await check(`slider ${label} ${Number(range.value) >= Number(range.max) ? '−' : '+'}`, () => (Number(range.value) >= Number(range.max) ? minus : plus).click(), label);
      const box = wrap.querySelector('.slider-value');
      const tv = (Number(range.min) + Number(range.max)) / 2;
      await check(`slider ${label} typed`, () => { box.value = String(tv); box.dispatchEvent(new Event('change', { bubbles: true })); }, label);
      range.value = startV; range.dispatchEvent(new Event('input', { bubbles: true })); range.dispatchEvent(new Event('change', { bubbles: true })); await settled();
    }
    for (const input of qa('input[data-num]')) {
      const wrap = input.closest('.num-control');
      const label = input.getAttribute('aria-label') || input.dataset.num || 'number';
      if (!wrap) { fails.push(`number ${label}: no − / + frame`); continue; }
      const [minus, plus] = wrap.querySelectorAll('.slider-step');
      const start = input.value;
      await check(`number ${label} +`, () => plus.click(), label);
      await check(`number ${label} −`, () => minus.click(), label);
      input.value = start; input.dispatchEvent(new Event('change', { bubbles: true })); await settled();
    }
    // Text settings.
    for (const input of qa('input[data-setting-text]')) {
      const key = input.dataset.settingText; const start = input.value;
      await check(`text ${key}`, () => { input.value = `${start}x`; input.dispatchEvent(new Event('change', { bubbles: true })); }, key);
      input.value = start; input.dispatchEvent(new Event('change', { bubbles: true })); await settled();
    }
    win = await window.__settingsWin();
    if (onStart) { m.actions.showStartPage(false); await sleep(150); }
    return fails.length ? `FAIL ${tab}: ${fails.join(' ; ')}` : `ok ${tab}: ${seen.length} changes — ${seen.join(', ')}`;
  };
  return 'ok';
})()
//@step {"name": "settings: the settings window opens with its tabs", "expect": "^ok "}
return (async () => {
  const m = window.__mymechanics;
  await m.actions.closeProject({ force: true }); await m.actions.openSampleAsk('flange'); await new Promise((r) => setTimeout(r, 500));
  window.__settingsStart = JSON.stringify(m.state.settings);
  const win = await window.__settingsWin();
  const tabs = [...win.document.querySelectorAll('[data-action="tab"]')].map((b) => b.dataset.value);
  window.__settingsTabs = tabs;
  return tabs.length >= 5 ? `ok ${tabs.join(',')}` : `only ${tabs.length} tabs`;
})()
//@step {"name": "settings: background picture — its opacity and fit change how the start page shows it", "expect": "^ok"}
return (async () => {
  const m = window.__mymechanics;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const native = await import('/src/platform/native.js');
  // A small picture stored as the web build does after picking one (no file dialog).
  const c = document.createElement('canvas'); c.width = 64; c.height = 40;
  const g = c.getContext('2d'); g.fillStyle = '#c0392b'; g.fillRect(0, 0, 64, 40); g.fillStyle = '#2980b9'; g.fillRect(0, 0, 32, 20);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  await native.storeWebBackground(new File([blob], 'test.png', { type: 'image/png' }));
  const start = JSON.stringify(m.state.settings);
  // (Not quiet: the app applies settings changes like the settings window's do.)
  m.actions.updateSettings({ backgroundImage: `web:test.png:${Date.now()}`, backgroundName: 'test.png', backgroundKind: 'image' });
  // (the picture loads asynchronously; the start page is drawn once it is there)
  await sleep(600); m.actions.showStartPage(true); await sleep(500);
  const scroll = () => document.querySelector('#start-page .start-scroll');
  const look = () => { const el = scroll(); if (!el) return 'none'; const a = getComputedStyle(el); const b = getComputedStyle(el, '::before'); const d = getComputedStyle(el, '::after'); return [a.backgroundImage.replace(/url([^)]*)/g, 'url').slice(0, 300), a.backgroundSize, a.backgroundRepeat, a.backgroundPosition, a.opacity, b.backgroundSize, b.opacity, b.backgroundRepeat, d.backgroundSize, d.opacity].join('|'); };
  const fails = [];
  if (!document.querySelector('#start-page.with-image')) fails.push('the start page does not show the picture');
  const l0 = look();
  m.actions.updateSettings({ backgroundOpacity: m.state.settings.backgroundOpacity === 60 ? 30 : 60 }); await sleep(200);
  if (look() === l0) fails.push('opacity: the picture looks the same');
  const fits = ['cover', 'contain', 'tile', 'center', 'stretch'];
  for (const fit of fits.filter((x) => x !== m.state.settings.backgroundFit)) {
    const before = look();
    m.actions.updateSettings({ backgroundFit: fit }); await sleep(150);
    if (look() === before) fails.push(`fit ${fit}: the picture looks the same`);
  }
  m.actions.updateSettings(JSON.parse(start));
  await native.clearBackground();
  m.actions.showStartPage(false); await sleep(200);
  return fails.length ? `FAIL ${fails.join('; ')}` : 'ok';
})()
