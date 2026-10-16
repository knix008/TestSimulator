// Tutorial: a guided tour that runs the real app, step by step, chapter by
// chapter — start page, managing photos, viewing (zoom, GIF / video / DICOM),
// editing (sliders, effect presets, crop, layers …), creating and batch tools,
// dashboard and settings.
//
// It works in a folder of its own (sample photos copied into the app's data
// folder), so saving an edit or running a tool never touches the user's files.
// Dialogs open inside the main window while it runs (they show in a screen
// recording), and the theme, language and view settings it changes are put
// back when it ends. A card at the bottom right shows the step, with previous /
// next, auto play, a chapter list and exit; the part of the window the step is
// about is outlined.
import { encodeGif } from '../create/gif.js';
import { getLanguage, onLanguageChange, setLanguage, t } from '../i18n.js';
import { invoke, isDesktop } from '../platform/native.js';
import { clear, h } from './dom.js';
import { icon } from './icons.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Waits until `test()` is truthy (or the time is up); never throws. */
async function until(test, timeout = 8000) {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    try { if (await test()) return true; } catch { /* not yet */ }
    await sleep(80);
  }
  return false;
}
const q = (selector) => document.querySelector(selector);
const click = (selector) => { const el = q(selector); el?.click(); return Boolean(el); };
/** Sets a range slider like a user drag (input + change). */
function slide(selector, value) {
  const el = q(selector);
  if (!el) return false;
  el.value = String(value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

export const TUTORIAL_FILES = ['beach.jpg', 'beach-copy.jpg', 'city.jpg', 'forest.jpg', 'portrait.jpg', 'sunset.png', 'flower.webp', 'aerial.webp', 'clip.webm', 'ct.dcm', 'cine.dcm'];

/**
 * The steps. `chapter` groups them; `target` is what the step outlines (a
 * selector, or a function returning an element); `run(api)` puts the app in the
 * state the step shows; `dwell` is how long auto play stays (ms).
 */
export const CHAPTERS = ['start', 'manage', 'view', 'edit', 'create', 'settings'];
export const STEPS = [
  // ── start page
  { id: 'welcome', chapter: 'start', target: '.start-head', run: (a) => a.showStart() },
  { id: 'begin', chapter: 'start', target: '.start-actions', run: (a) => a.showStart() },
  { id: 'tasks', chapter: 'start', target: '.task-grid', run: (a) => a.showStart() },
  // ── manage
  { id: 'folder', chapter: 'manage', target: '.filelist', dwell: 5000, run: (a) => a.openTutorialFolder() },
  { id: 'viewStyles', chapter: 'manage', target: '.app-toolbar .segmented', dwell: 6000, async run(a) {
    await a.manage();
    for (const style of ['tiles', 'details', 'filmstrip', 'thumbs']) { a.setView(style); await sleep(900); }
  } },
  { id: 'select', chapter: 'manage', target: '.filelist', async run(a) {
    await a.manage();
    const photo = a.file('beach.jpg');
    if (!photo) return;
    a.actions.setSelection([photo.path]);
    await sleep(300);
    a.actions.rate(5, [photo.path]);
    a.actions.setLabel('red', [photo.path]);
    a.actions.toggleTag([photo.path]);
  } },
  { id: 'sortFilter', chapter: 'manage', target: '.app-toolbar', run: (a) => a.manage() },
  { id: 'folders', chapter: 'manage', target: '.side-pane.left', run: async (a) => { await a.manage(); a.actions.showLeftTab('folders'); } },
  { id: 'catalog', chapter: 'manage', target: '.side-pane.left', run: async (a) => { await a.manage(); a.actions.showLeftTab('catalog'); } },
  { id: 'calendar', chapter: 'manage', target: '.side-pane.left', run: async (a) => { await a.manage(); a.actions.showLeftTab('calendar'); } },
  { id: 'people', chapter: 'manage', target: '.side-pane.left', run: async (a) => { await a.manage(); a.actions.showLeftTab('people'); } },
  { id: 'search', chapter: 'manage', target: '.side-pane.left', run: async (a) => { await a.manage(); a.actions.showLeftTab('search'); } },
  { id: 'properties', chapter: 'manage', target: '.side-pane.right', async run(a) {
    await a.manage();
    const photo = a.file('city.jpg');
    if (photo) a.actions.setSelection([photo.path]);
    a.actions.showRightTab('properties');
  } },
  { id: 'preview', chapter: 'manage', target: '.side-pane.right', run: async (a) => { await a.manage(); a.actions.showRightTab('preview'); } },
  { id: 'map', chapter: 'manage', target: '.side-pane.right', run: async (a) => { await a.manage(); a.actions.showRightTab('map'); } },
  { id: 'basket', chapter: 'manage', target: '.app-header', async run(a) {
    await a.manage();
    const photos = ['beach.jpg', 'forest.jpg'].map((n) => a.file(n)?.path).filter(Boolean);
    a.actions.setSelection(photos);
    await a.menu('organize', 'organize.addToBasket');
  } },
  // ── view
  { id: 'viewer', chapter: 'view', target: '.viewer-toolbar', run: (a) => a.view('forest.jpg') },
  { id: 'zoom', chapter: 'view', target: '#viewer-zoom', dwell: 5000, async run(a) {
    await a.view('forest.jpg');
    a.viewer.testing.setZoom(2.5);
    await sleep(1600);
    a.viewer.testing.setZoom(1);
  } },
  { id: 'overlays', chapter: 'view', target: '.viewer-toolbar', async run(a) {
    await a.view('city.jpg');
    a.viewerToggle('histogram', true);
    a.viewerToggle('info', true);
  } },
  { id: 'filmstrip', chapter: 'view', target: '.viewer', async run(a) {
    a.viewerToggle('histogram', false);
    a.viewerToggle('filmstrip', true);
    await a.view('city.jpg');
  } },
  { id: 'gif', chapter: 'view', target: '.media-tools', dwell: 6000, async run(a) {
    await a.view('animation.gif');
    await until(() => q('#media-play'));
    await sleep(2500);
    click('#media-play'); // pause
    await sleep(800);
    click('#media-next-frame');
  } },
  { id: 'video', chapter: 'view', target: '.media-tools', dwell: 6000, async run(a) {
    await a.view('clip.webm');
    await until(() => q('video.viewer-media')?.readyState >= 2);
    const video = q('video.viewer-media');
    if (video) { video.muted = true; video.play().catch(() => {}); }
  } },
  { id: 'dicom', chapter: 'view', target: '.dicom-bar', dwell: 6000, async run(a) {
    await a.view('ct.dcm');
    await until(() => a.viewer.dicom.active);
    a.viewer.dicom.testing.setTool('distance');
  } },
  { id: 'cine', chapter: 'view', target: '.dicom-bar', dwell: 6000, async run(a) {
    await a.view('cine.dcm');
    await until(() => a.viewer.dicom.debug()?.frames > 1);
    a.viewer.dicom.testing.startCine();
  } },
  // ── edit
  { id: 'editor', chapter: 'edit', target: '.editor-panel', run: (a) => a.edit('forest.jpg') },
  { id: 'light', chapter: 'edit', target: '.editor-panel', async run(a) {
    await a.edit('forest.jpg');
    a.editor.testing.setSection('light');
    await sleep(300);
    slide('.editor-panel input.slider[data-key="adjust.exposure"]', 0.4);
    slide('.editor-panel input.slider[data-key="adjust.shadows"]', 30);
  } },
  { id: 'color', chapter: 'edit', target: '.editor-panel', async run(a) {
    await a.edit('forest.jpg');
    a.editor.testing.setSection('color');
    await sleep(300);
    slide('.editor-panel input.slider[data-key="adjust.vibrance"]', 35);
  } },
  { id: 'looks', chapter: 'edit', target: '.edit-looks-pin', dwell: 6000, async run(a) {
    await a.edit('forest.jpg');
    await until(() => q('.editor-panel [data-look-cat=catFilmColor]'));
    if (!q('.editor-panel [data-look=portra]')) click('.editor-panel [data-look-cat=catFilmColor]');
    await until(() => q('.editor-panel [data-look=portra]'));
    await sleep(1200);
    click('.editor-panel [data-look=portra]');
  } },
  { id: 'lookTune', chapter: 'edit', target: '.look-tune', async run(a) {
    await a.edit('forest.jpg');
    if (!q('.look-tune')) {
      await until(() => q('.editor-panel [data-look-cat=catFilmColor]'));
      if (!q('.editor-panel [data-look=portra]')) click('.editor-panel [data-look-cat=catFilmColor]');
      await until(() => q('.editor-panel [data-look=portra]'));
      click('.editor-panel [data-look=portra]');
    }
    await until(() => q('.look-tune'));
    slide('.editor-panel input.slider[data-key="look.amount"]', 130);
    await sleep(400);
    slide('.editor-panel input.slider[data-key="fx.grain"]', 35);
  } },
  { id: 'geometry', chapter: 'edit', target: '.editor-panel', run: async (a) => { await a.edit('forest.jpg'); a.editor.testing.setSection('geometry'); } },
  { id: 'effects', chapter: 'edit', target: '.editor-panel', run: async (a) => { await a.edit('forest.jpg'); a.editor.testing.setSection('effects'); } },
  { id: 'local', chapter: 'edit', target: '.editor-panel', run: async (a) => { await a.edit('forest.jpg'); a.editor.testing.setSection('local'); } },
  { id: 'textDraw', chapter: 'edit', target: '.editor-panel', run: async (a) => { await a.edit('forest.jpg'); a.editor.testing.setSection('add'); } },
  { id: 'layers', chapter: 'edit', target: '.editor-panel', run: async (a) => { await a.edit('forest.jpg'); a.editor.testing.setSection('layers'); } },
  { id: 'history', chapter: 'edit', target: '.editor-panel', run: async (a) => { await a.edit('forest.jpg'); a.editor.testing.setSection('history'); } },
  { id: 'beforeAfter', chapter: 'edit', target: '#edit-before', dwell: 5000, async run(a) {
    await a.edit('forest.jpg');
    click('#edit-before');
    await sleep(1500);
    click('#edit-before');
  } },
  { id: 'save', chapter: 'edit', target: '#edit-save', dwell: 5000, async run(a) {
    await a.edit('forest.jpg');
    if (!q('#edit-save')?.disabled) click('#edit-save');
    await until(() => a.app.state.mode === 'manage', 20000);
  } },
  // ── create and tools (dialogs are opened and left for the next step to close)
  { id: 'slideshow', chapter: 'create', target: '.slideshow', dwell: 6000, async run(a) {
    await a.manage();
    a.actions.setSelection([]);
    await a.menu('view', 'view.slideshow');
  } },
  { id: 'compare', chapter: 'create', target: '.compare', async run(a) {
    await a.manage();
    a.actions.setSelection(['beach.jpg', 'beach-copy.jpg'].map((n) => a.file(n)?.path).filter(Boolean));
    await a.menu('tools', 'tools.compare');
  } },
  { id: 'duplicates', chapter: 'create', target: '.dialog', run: async (a) => { await a.manage(); await a.menu('tools', 'tools.duplicates'); } },
  { id: 'createGif', chapter: 'create', target: '.dialog', run: (a) => a.dialogFor(['beach.jpg', 'city.jpg', 'forest.jpg'], 'create', 'create.gif') },
  { id: 'createPdf', chapter: 'create', target: '.dialog', run: (a) => a.dialogFor(['beach.jpg', 'city.jpg', 'forest.jpg'], 'create', 'create.pdf') },
  { id: 'panorama', chapter: 'create', target: '.dialog', run: (a) => a.dialogFor(['beach.jpg', 'city.jpg'], 'create', 'create.panorama') },
  { id: 'batch', chapter: 'create', target: '.dialog', run: (a) => a.dialogFor(['beach.jpg', 'city.jpg', 'forest.jpg'], 'tools', 'tools.batchRename') },
  { id: 'resize', chapter: 'create', target: '.dialog', run: (a) => a.dialogFor(['beach.jpg', 'city.jpg', 'forest.jpg'], 'tools', 'tools.batchResize') },
  { id: 'watermark', chapter: 'create', target: '.dialog', run: (a) => a.dialogFor(['beach.jpg', 'city.jpg'], 'tools', 'tools.watermark') },
  { id: 'analysis', chapter: 'create', target: '.dialog', run: (a) => a.dialogFor([], 'tools', 'analysis.toFolders') },
  { id: 'print', chapter: 'create', target: '.dialog', run: (a) => a.dialogFor(['beach.jpg', 'city.jpg'], 'file', 'file.print') },
  // ── dashboard and settings
  { id: 'dashboard', chapter: 'settings', target: '.mode-switch', run: (a) => a.mode('dashboard') },
  { id: 'settings', chapter: 'settings', target: '.dialog', run: async (a) => { await a.manage(); a.openSettings(); } },
  { id: 'theme', chapter: 'settings', target: '.theme-select', dwell: 6000, async run(a) {
    await a.manage();
    for (const id of ['paper', 'nord', a.initial.theme]) { await a.pickTheme(id); await sleep(1200); }
  } },
  { id: 'language', chapter: 'settings', target: '.lang-toggle', dwell: 5000, async run(a) {
    await a.manage();
    const back = getLanguage();
    setLanguage(back === 'ko' ? 'en' : 'ko');
    await sleep(1800);
    setLanguage(back);
  } },
  { id: 'shortcuts', chapter: 'settings', target: '.dialog', run: async (a) => { await a.manage(); a.shortcuts(); } },
  { id: 'done', chapter: 'settings', target: '.start-head', run: (a) => a.showStart() },
];

/**
 * The tutorial controller. `deps` are app functions (see app.js):
 * { app, actions, menu, viewer, editor, closeAllDialogs, fs, joinPath, showStart, openSettings, pickTheme, shortcuts, openSamples }.
 */
export function createTutorial(deps) {
  const { app } = deps;
  let index = -1;
  let running = false;
  let auto = false;
  let autoTimer = null;
  let busy = null;
  let folder = null;
  let initial = null;
  let stopLang = null;
  const card = h('div.tutorial-card', { role: 'dialog', 'aria-live': 'polite', hidden: true });
  const spot = h('div.tutorial-spot', { hidden: true });
  let spotTimer = null;

  const file = (name) => app.state.list.find((item) => item.name === name) ?? null;
  /** Closes what a step left open: dialogs, the compare view, a slideshow (they close on Esc). */
  const closeAll = () => {
    deps.closeAllDialogs();
    if (q('.slideshow, .compare')) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  };
  const api = {
    ...deps,
    get initial() { return initial; },
    file,
    async manage() {
      closeAll();
      if (app.state.mode !== 'manage') deps.actions.setMode('manage');
      await until(() => app.state.mode === 'manage' && !app.state.loading);
    },
    async mode(id) { closeAll(); deps.actions.switchMode(id); await until(() => app.state.mode === id); await sleep(300); },
    setView(style) { app.settings.view = style; app.saveSettings(); deps.refreshManage(); },
    async view(name) {
      closeAll();
      const item = file(name);
      if (!item) return;
      if (app.state.mode === 'view' && app.state.viewPath === item.path) return;
      deps.actions.viewItem(item.path);
      await until(() => app.state.mode === 'view' && deps.viewer.debug().kind && deps.viewer.debug().kind !== 'placeholder', 15000);
      await sleep(300);
    },
    viewerToggle(key, on) {
      if (Boolean(app.settings.viewer[key]) === on) return;
      const label = t(key === 'info' ? 'view.info' : key === 'histogram' ? 'view.histogram' : 'view.filmstrip');
      const button = [...document.querySelectorAll('.viewer-toolbar button.tool')].find((b) => b.getAttribute('aria-label') === label);
      button?.click();
    },
    async edit(name) {
      closeAll();
      const item = file(name);
      if (!item) return;
      if (app.state.mode === 'edit' && deps.editor.path === item.path) return;
      deps.actions.editPath(item.path);
      await until(() => deps.editor.path === item.path && deps.editor.debug().preview && q('.editor-preview'), 20000);
      await sleep(300);
    },
    /** Runs a menu item without waiting for what it opens (a dialog stays open until the next step closes it). */
    menu(menu, ...keys) {
      try { Promise.resolve(deps.menu(menu, ...keys)).catch(() => {}); } catch { /* not available here */ }
      return sleep(400);
    },
    async dialogFor(names, menu, key) {
      await api.manage();
      deps.actions.setSelection(names.map((n) => file(n)?.path).filter(Boolean));
      await sleep(200);
      api.menu(menu, key); // the dialog stays open until the next step closes it
      await until(() => document.querySelector('.dialog'), 4000);
    },
    async openTutorialFolder() {
      closeAll();
      folder = folder ?? (await prepareFolder());
      if (!folder) { await deps.openSamples?.(); return; }
      if (app.state.source?.path !== folder) await deps.actions.openFolder(folder);
      deps.actions.setMode('manage');
      await until(() => app.state.source?.path === folder && !app.state.loading && app.state.list.length >= TUTORIAL_FILES.length);
    },
  };

  /** The tutorial folder in the app's data folder, filled with the sample files (desktop); null on the web. */
  async function prepareFolder() {
    if (!isDesktop()) return null;
    const info = await invoke('app_info').catch(() => null);
    if (!info?.dataDir) return null;
    const dir = deps.joinPath(info.dataDir, 'tutorial-photos');
    await Promise.resolve(deps.fs.mkdir(info.dataDir, 'tutorial-photos')).catch(() => {}); // already there is fine
    const present = new Set(((await deps.fs.list(dir).catch(() => null))?.files ?? []).map((e) => e.name));
    for (const name of TUTORIAL_FILES) {
      if (present.has(name)) continue;
      const bytes = new Uint8Array(await (await fetch(`./tutorial/${name}`)).arrayBuffer());
      await deps.fs.write(deps.joinPath(dir, name), bytes);
    }
    if (!present.has('animation.gif')) await deps.fs.write(deps.joinPath(dir, 'animation.gif'), await makeGif());
    return dir;
  }

  /** An animated GIF of the sample photos (small), for the GIF player step. */
  async function makeGif() {
    const frames = [];
    for (const name of ['beach.jpg', 'city.jpg', 'forest.jpg', 'sunset.png']) {
      const bitmap = await createImageBitmap(await (await fetch(`./tutorial/${name}`)).blob());
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 160;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, 240, 160);
      frames.push({ image: ctx.getImageData(0, 0, 240, 160), delay: 600 });
    }
    return encodeGif(frames, { loop: 0 });
  }

  // ───────── the card and the outline

  function render() {
    clear(card);
    if (!running) return;
    const step = STEPS[index];
    const chapterSteps = STEPS.filter((s) => s.chapter === step.chapter);
    const chapter = h('select.input.tutorial-chapter', { title: t('tut.chapter'), dataset: { key: 'tutorial-chapter' }, onchange: (e) => go(STEPS.findIndex((s) => s.chapter === e.target.value)) },
      CHAPTERS.map((c, i) => h('option', { value: c, selected: c === step.chapter }, `${i + 1}. ${t(`tut.ch.${c}`)}`)));
    card.append(
      h('div.tutorial-top', h('span.tutorial-badge', { html: icon('help') }), chapter,
        h('span.tutorial-count', { dataset: { key: 'tutorial-count' } }, t('tut.count', { n: index + 1, total: STEPS.length })),
        h('button.tool.small', { type: 'button', title: t('tut.exit'), dataset: { tutorial: 'exit' }, html: icon('close'), onclick: () => stop() })),
      h('div.tutorial-progress', h('span', { style: { width: `${((index + 1) / STEPS.length) * 100}%` } })),
      h('h3.tutorial-title', t(`tut.${step.id}.title`)),
      h('p.tutorial-text', t(`tut.${step.id}.text`)),
      h('div.tutorial-sub', t('tut.inChapter', { n: chapterSteps.indexOf(step) + 1, total: chapterSteps.length })),
      h('div.tutorial-buttons',
        h('button.btn', { type: 'button', dataset: { tutorial: 'prev' }, disabled: index === 0, onclick: () => go(index - 1) }, h('span', { html: icon('prev') }), t('tut.prev')),
        h(`button.btn${auto ? '.on' : ''}`, { type: 'button', dataset: { tutorial: 'auto' }, onclick: () => setAuto(!auto) }, h('span', { html: icon(auto ? 'pause' : 'play') }), t(auto ? 'tut.pause' : 'tut.autoplay')),
        index === STEPS.length - 1
          ? h('button.btn.primary', { type: 'button', dataset: { tutorial: 'finish' }, onclick: () => stop() }, t('tut.finish'))
          : h('button.btn.primary', { type: 'button', dataset: { tutorial: 'next' }, onclick: () => go(index + 1) }, t('tut.next'), h('span', { html: icon('next') }))),
      busy ? h('div.tutorial-busy', t('tut.working')) : '');
  }

  function placeSpot() {
    const step = STEPS[index];
    const target = !running || !step ? null : typeof step.target === 'function' ? step.target() : [...document.querySelectorAll(step.target)].find((el) => el.getClientRects().length && el.offsetParent !== null) ?? null;
    if (!target) { spot.hidden = true; return; }
    const r = target.getBoundingClientRect();
    if (!r.width || !r.height) { spot.hidden = true; return; }
    spot.hidden = false;
    Object.assign(spot.style, { left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
  }

  async function go(next) {
    if (!running || next < 0 || next >= STEPS.length) return;
    clearTimeout(autoTimer);
    index = next;
    const mine = {};
    busy = mine;
    render();
    placeSpot();
    try { await STEPS[index].run?.(api); } catch (error) { console.warn('tutorial step', STEPS[index].id, error); }
    if (busy !== mine) return; // another step was chosen meanwhile
    busy = null;
    render();
    placeSpot();
    if (auto) scheduleNext();
  }

  function scheduleNext() {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      if (!running || !auto || busy) return;
      if (index < STEPS.length - 1) go(index + 1); else setAuto(false);
    }, STEPS[index].dwell ?? 4500);
  }

  function setAuto(on) {
    auto = on;
    clearTimeout(autoTimer);
    render();
    if (auto && !busy) scheduleNext();
  }

  async function start({ step = 0, autoplay = false } = {}) {
    if (running) { go(step); return; }
    running = true;
    auto = autoplay;
    initial = {
      theme: app.settings.theme ?? 'system',
      language: getLanguage(),
      view: app.settings.view,
      panes: JSON.parse(JSON.stringify(app.settings.panes ?? {})),
      viewer: JSON.parse(JSON.stringify(app.settings.viewer ?? {})),
      inlineDialogs: globalThis.__myphotoInlineDialogs,
    };
    globalThis.__myphotoInlineDialogs = true; // dialogs inside the window while the tour runs
    document.body.append(spot, card);
    document.body.classList.add('tutorial-on');
    card.hidden = false;
    stopLang = onLanguageChange(render);
    spotTimer = setInterval(placeSpot, 250);
    await go(step);
  }

  async function stop() {
    if (!running) return;
    running = false;
    auto = false;
    clearTimeout(autoTimer);
    clearInterval(spotTimer);
    stopLang?.();
    card.hidden = true;
    spot.hidden = true;
    card.remove();
    spot.remove();
    document.body.classList.remove('tutorial-on');
    closeAll();
    // Put back what the tour changed.
    if (initial) {
      app.settings.view = initial.view;
      app.settings.panes = initial.panes;
      app.settings.viewer = initial.viewer;
      app.saveSettings();
      if ((app.settings.theme ?? 'system') !== initial.theme) await deps.pickTheme(initial.theme);
      if (getLanguage() !== initial.language) setLanguage(initial.language);
      globalThis.__myphotoInlineDialogs = initial.inlineDialogs;
    }
    index = -1;
    deps.showStart();
  }

  return {
    start,
    stop,
    next: () => go(index + 1),
    prev: () => go(index - 1),
    go,
    setAuto,
    /** For tests and the recording scripts. */
    state: () => ({ running, index, id: STEPS[index]?.id ?? null, chapter: STEPS[index]?.chapter ?? null, busy: Boolean(busy), auto, total: STEPS.length, folder }),
  };
}
