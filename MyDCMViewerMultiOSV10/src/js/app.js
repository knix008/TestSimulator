/* MyDCMViewer — renderer application: menus, toolbar, file tree, DICOM pipeline, panels, export, batch. */
(function () {
  'use strict';
  const P = window.Platform;
  const D = window.DicomDecoder;
  const E = window.Encoders;
  const t = (k, p) => window.I18n.t(k, p);
  const $ = (id) => document.getElementById(id);

  const DICOM_EXTS = new Set(['dcm', 'dicm', 'dicom', 'dic']);
  const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'ico', 'svg', 'avif', 'heic', 'heif', 'hif', 'jp2', 'j2k', 'jpc', 'jpx', 'j2c']);
  const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', ico: 'image/x-icon', svg: 'image/svg+xml', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif', hif: 'image/heif', jp2: 'image/jp2', j2k: 'image/jp2', jpc: 'image/jp2', jpx: 'image/jpx', j2c: 'image/jp2' };
  const EXPORT_MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp', tiff: 'image/tiff', gif: 'image/gif' };
  const EXPORT_EXT = { png: 'png', jpeg: 'jpg', webp: 'webp', bmp: 'bmp', tiff: 'tif', gif: 'gif' };
  const EXTRA_PRESETS = [{ id: 'abdomen', wc: 40, ww: 400 }, { id: 'spine', wc: 50, ww: 250 }, { id: 'angio', wc: 300, ww: 600 }];

  /* ── State ── */
  const S = {
    file: null,          // { path, name, size, kind: 'dicom' | 'image', image, bitmapCanvas, warning }
    frame: 0,
    frameCanvas: null,   // rendered current frame
    settings: {},
    tool: 'pan',
    cine: null,          // interval id
    fps: 10,
    series: { files: [], index: -1, dir: null, sorted: false, groups: [] },
    treeClipboard: null, // { paths, cut }
    tabs: [],            // open files: { id, path, name, file, snap, used }
    tabId: 0,            // active tab id (0 = none)
    hover: null,
    renderToken: 0,
    loadToken: 0,
    histTimer: null,
    calibration: null,   // [rowMm, colMm] per pixel — user scale; overrides DICOM PixelSpacing when set
  };
  const DEFAULTS = {
    theme: 'midnight', lang: 'ko', sidebar: true, sidebarWidth: 300, treeHeight: 50, rightPanel: true, rightPanelWidth: 290,
    interpolate: false, cornerInfo: true, markers: true, overlays: true, measurements: true, burnAnnotations: true, loop: true, invert: false,
    ruler: false, scaleBar: true, scaleBarPos: null, grid: false, measureUnit: 'cm', wheelMode: 'zoom', defaultFps: 10, overlayColor: '#00ff80', annotationColor: '#ffd400', rememberLastDir: true, startupDir: '', confirmDelete: true,
    showStartOnLaunch: true, showTourOnLaunch: true, tutorialDone: false, startScreen: {}, docLayout: {}, syncScroll: true, refLines: true,
    pacsNodes: [], pacsLocalAE: 'MYDCMVIEWER', pacsLocalPort: 11112, pacsInbox: '',
  };
  const UNIT_FROM_MM = { mm: 1, cm: 0.1, in: 1 / 25.4 };
  const UNIT_TO_MM = { mm: 1, cm: 10, m: 1000, in: 25.4, inch: 25.4, inches: 25.4 };
  const opt = (k) => (S.settings[k] === undefined ? DEFAULTS[k] : S.settings[k]);
  async function setOpt(patch) { Object.assign(S.settings, patch); await P.settings.set(patch); }

  let viewer, tree;

  /* ══════════════ Init ══════════════ */
  async function init() {
    await P.init();
    S.settings = { ...(P.settings.cache || {}) };
    if (S.settings.measureUnit === 'px' || S.settings.measureUnit === 'mm') S.settings.measureUnit = 'cm';
    // before the "show the tutorial at launch" option, the tutorial came up until it was finished once
    if (S.settings.showTourOnLaunch === undefined && S.settings.tutorialDone) S.settings.showTourOnLaunch = false;
    document.body.classList.toggle('web', !P.isDesktop);
    document.body.classList.toggle('desktop', P.isDesktop);
    window.I18n.setLang(opt('lang'));
    if (opt('customTheme')) window.Themes.setCustom(opt('customTheme'));
    applyTheme(opt('theme'));
    $('sidebar').style.width = `${opt('sidebarWidth')}px`;
    $('rightPanel').style.width = `${opt('rightPanelWidth')}px`;
    document.body.classList.toggle('no-right', !opt('rightPanel'));
    $('treeSection').style.flexBasis = `${opt('treeHeight')}%`;
    document.body.classList.toggle('no-sidebar', !opt('sidebar'));
    $('loopCheck').checked = !!opt('loop');

    viewer = window.Viewer.create({ viewport: $('viewport'), canvas: $('imageCanvas'), overlay: $('overlayCanvas'), on: onViewerEvent });
    viewer.interpolate = !!opt('interpolate');
    viewer.showAnnotations = !!opt('measurements');
    viewer.showRuler = !!opt('ruler');
    viewer.showScaleBar = !!opt('scaleBar');
    viewer.scaleBarPos = opt('scaleBarPos');
    document.body.classList.toggle('ruler-on', !!opt('ruler'));
    viewer.showGrid = !!opt('grid');
    viewer.wheelMode = opt('wheelMode');
    viewer.measureUnit = displayUnit();
    viewer.colors = { line: opt('annotationColor') };
    S.fps = opt('defaultFps') || 10;
    $('fpsInput').value = S.fps;

    window.Layout.init({
      grid: $('viewGrid'), viewport: $('viewport'), sync: !!opt('syncScroll'), refLines: !!opt('refLines'),
      app: { tabs: () => S.tabs, activeTabId: () => S.tabId, activate: (tab) => activateTab(tab), activeGeometry, t },
    });

    tree = window.FileTree.create($('fileTree'), {
      isOpenable: (e) => isOpenableName(e.name),
      onOpen: (p) => openPath(p),
      onRoot: (dir) => onTreeRoot(dir),
      onContext: (e, paths, hit) => showContextMenu($('ctxTree'), e.clientX, e.clientY, { paths, hit }),
      onError: (err) => toast(err.message, true),
    });

    buildStaticMenus();
    bindUI();
    bindTooltips();
    updateLangButton();
    if (P.isDesktop) window.desktopAPI.onPopupEvent((msg) => Dlg.dispatch(msg));
    // the grip in the bottom-right corner resizes the window (a browser cannot resize its own window: hidden there)
    if (P.isDesktop && window.desktopAPI.startResize) {
      const grip = $('resizeGrip');
      grip.hidden = false;
      // (the drag itself: bindWindowChrome — the system resize loop does not run in this frameless window)
    }
    P.progress = {
      start: async (title) => { if (!Progress.open) Progress.start(title, { cancellable: false }); else Progress.update(0, 0, title); },
      finish: () => Progress.finish(),
    };
    // a dialog window that saves a file asks this window for the popup
    Dlg.handlers.set('__progress', (event, data) => { if (event === 'start') P.progress.start(data); else if (event === 'finish') P.progress.finish(); });
    setTool('pan');
    syncMenuState();
    window.addEventListener('resize', () => { viewer.resize(); updateTabOverflow(); });

    P.onOpenPath((p) => openPath(p));
    P.onDirChanged((dir) => { if (tree.root() === dir) tree.refresh(); });

    const info = await P.appInfo();
    S.appInfo = info;
    updateTitle();
    $('appVersion').textContent = info.version ? `v${info.version}` : '';
    bindWindowChrome();

    renderDriveBar();
    if (P.isDesktop) {
      let dir = opt('startupDir');
      if (dir) { const st = await P.stat(dir); if (!st.exists || !st.isDir) dir = ''; }
      if (!dir) dir = await P.defaultDir();
      if (dir) tree.setRoot(dir);
    } else {
      const root = await P.mountSamples();
      if (root) tree.setRoot(root); else tree.showRoots();
      renderDriveBar();
    }
    D.preload(['parser']).catch(() => {});
    setStatus('status.ready');
    History.sync();
    applyMinWindowSize();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(applyMinWindowSize);
    window.addEventListener('resize', () => { clearTimeout(S.minSizeTimer); S.minSizeTimer = setTimeout(applyMinWindowSize, 200); });
    bindDesktopDrop();
    mountStartPage();
    if (opt('showStartOnLaunch') !== false) showStart();
    const handed = await P.ready();   // desktop: the window appears now, already drawn, and the files it was started with open
    if (handed && handed.length) hideStart();
    if (opt('showTourOnLaunch')) setTimeout(() => runAction('tour'), 600);
  }

  /* ══════════════ Start page ══════════════ */
  let startPage = null;
  function mountStartPage() {
    if (!window.StartPage || startPage) return;
    startPage = window.StartPage.mount($('startPage'), {
      t, lang: () => window.I18n.lang, settings: () => S.settings, info: () => S.appInfo || {},
      icon: (name) => window.Icons.svg(name),
      recent: () => ({ files: P.isDesktop ? (opt('recentFiles') || []) : [], folders: P.isDesktop ? (opt('recentDirs') || []) : [] }),
      onAction: (id) => runAction(id.includes(':') ? id.slice(0, id.indexOf(':')) : id, { dataset: { value: id.slice(id.indexOf(':') + 1), sample: id.slice(id.indexOf(':') + 1), path: id.slice(id.indexOf(':') + 1) } }),
      onSettings: (patch) => setOpt(patch),
    });
  }
  function showStart() { if (!startPage) mountStartPage(); if (startPage) { stopCine(); startPage.show(); $('startBtn').classList.add('active'); } }
  function hideStart() { if (startPage && startPage.visible) { startPage.hide(); $('startBtn').classList.remove('active'); viewer.resize(); } }

  /* Sample files: shipped with the desktop app (resources/samples), served from /samples on the web. */
  async function openSample(id) {
    const s = (window.StartPage ? window.StartPage.SAMPLES : []).find((x) => x.id === id);
    if (!s) return;
    if (P.isDesktop) {
      const dir = await P.samplesDir();
      if (!dir) { toast(t('start.noSamples'), true); return; }
      const p = P.join(dir, ...s.file.split('/'));
      if (s.file.endsWith('/DICOMDIR')) await openDicomdir(p); else await openPath(p);
      return;
    }
    if (!S.sampleRoot) S.sampleRoot = P.web.mountUrls('Samples', window.StartPage.SAMPLES.map((x) => ({ name: x.file, url: `samples/${x.file.split('/').map(encodeURIComponent).join('/')}` })));
    const p = `${S.sampleRoot}/${s.file}`;
    if (s.file.endsWith('/DICOMDIR')) await openDicomdir(p); else await openPath(p);
  }

  /* Desktop: files and folders dragged in from the file manager arrive as paths (the webview gets no File objects). */
  function bindDesktopDrop() {
    if (!P.isDesktop) return;
    const targets = [$('viewport'), $('fileTree')];
    const under = (d) => { const el = Number.isFinite(d.x) ? document.elementFromPoint(d.x, d.y) : null; return targets.find((t) => el && t.contains(el)) || $('viewport'); };
    P.onFileDrop((d) => {
      targets.forEach((t) => t.classList.remove('drag-over'));
      if (d.type === 'enter' || d.type === 'over') { under(d).classList.add('drag-over'); return; }
      if (d.type === 'drop' && d.paths && d.paths.length) openPath(d.paths[0]);
    });
  }

  /* ══════════════ Theme / language ══════════════ */
  function applyTheme(theme) {
    const th = window.Themes.apply(theme);
    $('themeName').textContent = th.name;
    drawHistogram();
  }
  async function setTheme(theme) { const th = window.Themes.get(theme); await setOpt({ theme, themeBg: th.vars['--bg'], themeScheme: th.scheme }); applyTheme(theme); syncMenuState(); Dlg.broadcast('theme', window.Themes.get(theme).id); setTimeout(applyMinWindowSize, 50); }
  async function setLang(lang) {
    await setOpt({ lang });
    window.I18n.setLang(lang);
    updateLangButton();
    Dlg.broadcast('lang', lang);
    buildStaticMenus();
    setTimeout(applyMinWindowSize, 50);
    syncMenuState();
    refreshPanels();
    updateCorners();
    updateStatus();
  }

  /* ══════════════ Menus ══════════════ */
  function themeButton(th) {
    const b = document.createElement('button');
    b.className = 'radio'; b.dataset.action = 'theme'; b.dataset.value = th.id;
    const v = th.vars;
    b.innerHTML = `<span>${esc(th.name)}</span><span class="swatch"><i style="background:${v['--bg']}"></i><i style="background:${v['--panel-bg']}"></i><i style="background:${v['--accent']}"></i><i style="background:${v['--text']}"></i></span>`;
    return b;
  }
  function buildThemeMenus() {
    for (const panel of [$('themeMenu').querySelector('.menu-panel'), $('themeDropdown').querySelector('.menu-panel')]) {
      // 20 dark and 20 light themes side by side, each column under its heading
      panel.innerHTML = '';
      panel.classList.add('theme-columns');
      for (const scheme of ['dark', 'light']) {
        const col = document.createElement('div');
        col.className = 'theme-col';
        col.append(Object.assign(document.createElement('div'), { className: 'menu-heading', textContent: t(scheme === 'dark' ? 'view.themeDark' : 'view.themeLight') }));
        for (const th of window.Themes.list()) if (th.scheme === scheme) col.append(themeButton(th));
        panel.append(col);
      }
      // the user's own theme: the last row, across both columns
      const own = document.createElement('div');
      own.className = 'theme-custom-row';
      own.append(Object.assign(document.createElement('div'), { className: 'menu-sep' }), themeButton(window.Themes.custom()));
      panel.append(own);
    }
  }
  const RECENT_MAX = 10;
  function pushRecent(dir) {
    if (!dir || !P.isDesktop) return;
    const list = (opt('recentDirs') || []).filter((d) => d.toLowerCase() !== dir.toLowerCase());
    list.unshift(dir);
    setOpt({ recentDirs: list.slice(0, RECENT_MAX) });
    buildRecentMenu();
  }
  function pushRecentFile(p) {
    if (!p || !P.isDesktop) return;
    const list = (opt('recentFiles') || []).filter((d) => d.toLowerCase() !== p.toLowerCase());
    list.unshift(p);
    setOpt({ recentFiles: list.slice(0, RECENT_MAX) });
    buildRecentFilesMenu();
  }
  function buildRecentFilesMenu() {
    const panel = $('recentFilesMenu').querySelector('.menu-panel');
    panel.innerHTML = '';
    const list = P.isDesktop ? (opt('recentFiles') || []) : [];
    if (!list.length) { const b = document.createElement('button'); b.disabled = true; b.textContent = t('file.recentNone'); panel.append(b); return; }
    for (const f of list) {
      const b = document.createElement('button');
      b.dataset.action = 'recent-file'; b.dataset.path = f; b.dataset.icon = 'file'; b.title = f;
      b.innerHTML = `<span>${esc(P.basename(f))}</span><span class="menu-remove" data-remove="recent-file-remove" title="${esc(t('file.recentRemove'))}">×</span>`;
      panel.append(b);
    }
    panel.append(Object.assign(document.createElement('div'), { className: 'menu-sep' }));
    const clear = document.createElement('button');
    clear.dataset.action = 'recent-files-clear'; clear.dataset.icon = 'trash'; clear.textContent = t('file.recentClear');
    panel.append(clear);
    window.Icons.decorate(panel);
  }
  function buildRecentMenu() {
    const panel = $('recentMenu').querySelector('.menu-panel');
    panel.innerHTML = '';
    const list = P.isDesktop ? (opt('recentDirs') || []) : [];
    if (!list.length) { const b = document.createElement('button'); b.disabled = true; b.textContent = t('file.recentNone'); panel.append(b); return; }
    for (const dir of list) {
      const b = document.createElement('button');
      b.dataset.action = 'open-recent'; b.dataset.path = dir; b.dataset.icon = 'folder'; b.title = dir;
      b.innerHTML = `<span>${esc(dir)}</span><span class="menu-remove" title="${esc(t('file.recentRemove'))}">×</span>`;
      panel.append(b);
    }
    panel.append(Object.assign(document.createElement('div'), { className: 'menu-sep' }));
    const clear = document.createElement('button');
    clear.dataset.action = 'recent-clear'; clear.dataset.icon = 'trash'; clear.textContent = t('file.recentClear');
    panel.append(clear);
    window.Icons.decorate(panel);
  }
  function buildStaticMenus() {
    buildThemeMenus();
    buildRecentMenu();
    buildRecentFilesMenu();
    const cm = $('colormapMenu').querySelector('.menu-panel');
    cm.innerHTML = '';
    for (const id of D.COLORMAP_IDS) {
      const b = document.createElement('button');
      b.className = 'radio'; b.dataset.action = 'colormap'; b.dataset.value = id; b.textContent = t(`cm.${id}`);
      cm.append(b);
    }
    const sel = $('colormapSelect');
    sel.innerHTML = '';
    for (const id of D.COLORMAP_IDS) { const o = document.createElement('option'); o.value = id; o.textContent = t(`cm.${id}`); sel.append(o); }
    buildWindowMenus();
    window.I18n.apply();
    window.Icons.decorate(document);
  }

  function presetsFor(image) {
    if (!image || !image.gray) return [];
    return image.modality === 'CT' ? [...D.CT_PRESETS, ...EXTRA_PRESETS] : [];
  }

  function buildWindowMenus() {
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    const pm = $('wlPresetsMenu').querySelector('.menu-panel');
    const lm = $('wlLutMenu').querySelector('.menu-panel');
    pm.innerHTML = ''; lm.innerHTML = '';
    const sel = $('presetSelect');
    sel.innerHTML = '';
    const addOpt = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; sel.append(o); return o; };
    addOpt('auto', t('wl.auto'));
    const wins = img ? img.windowsFor(S.frame) : [];
    wins.forEach((w, i) => {
      const text = `${w.label || t('wl.fileWindow', { n: i + 1 })} (W ${fmt(w.ww)} / L ${fmt(w.wc)})`;
      addOpt(`file:${i}`, text);
      const b = document.createElement('button'); b.className = 'radio'; b.dataset.action = 'wl-file'; b.dataset.index = i; b.textContent = text; pm.append(b);
    });
    const presets = presetsFor(img);
    if (presets.length && wins.length) pm.append(Object.assign(document.createElement('div'), { className: 'menu-sep' }));
    for (const p of presets) {
      const text = `${t(`preset.${p.id}`)} (W ${p.ww} / L ${p.wc})`;
      addOpt(`preset:${p.id}`, text);
      const b = document.createElement('button'); b.className = 'radio'; b.dataset.action = 'preset'; b.dataset.value = p.id; b.textContent = text; pm.append(b);
    }
    if (!pm.children.length) { const b = document.createElement('button'); b.disabled = true; b.textContent = t('wl.none'); pm.append(b); }
    addOpt('custom', t('wl.custom')).hidden = true;
    const luts = img ? img.voiLuts : [];
    if (!luts.length) { const b = document.createElement('button'); b.disabled = true; b.textContent = t('wl.none'); lm.append(b); }
    luts.forEach((l, i) => {
      const b = document.createElement('button'); b.className = 'radio'; b.dataset.action = 'voi-lut'; b.dataset.index = i; b.textContent = `${l.label} (${l.n} × ${l.bits} bit)`; lm.append(b);
      addOpt(`lut:${i}`, `LUT: ${l.label}`);
    });
  }

  function syncMenuState() {
    if (props) props.refresh();
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    const st = img ? img.state : null;
    document.querySelectorAll('[data-action="toggle"]').forEach((b) => {
      const key = b.dataset.key;
      const val = key === 'invert' ? !!(st ? st.invert : opt('invert')) : key === 'loop' ? $('loopCheck').checked : !!opt(key);
      b.classList.toggle('checked', val);
    });
    const themeId = window.Themes.get(opt('theme')).id;
    document.querySelectorAll('[data-action="theme"]').forEach((b) => b.classList.toggle('checked', b.dataset.value === themeId));
    document.querySelectorAll('[data-action="lang"]').forEach((b) => b.classList.toggle('checked', b.dataset.value === window.I18n.lang));
    document.querySelectorAll('[data-action="tool"]').forEach((b) => b.classList.toggle('checked', b.dataset.tool === S.tool));
    $('toolsMore').querySelector('.menu-title').classList.toggle('checked', ['cobb', 'polygon', 'freehand', 'point', 'arrow'].includes(S.tool));
    document.querySelectorAll('[data-action="layout"]').forEach((b) => b.classList.toggle('checked', b.dataset.value === `${window.Layout.state.rows}x${window.Layout.state.cols}`));
    document.querySelectorAll('[data-action="voi-function"]').forEach((b) => b.classList.toggle('checked', !!st && st.voiFunction === b.dataset.value));
    document.querySelectorAll('[data-action="colormap"]').forEach((b) => b.classList.toggle('checked', !!st && st.colormap === b.dataset.value));
    { const fl = (st && st.filters) || []; const one = fl.length === 1 ? fl[0].name : fl.length ? '*' : ''; document.querySelectorAll('[data-action="filter-quick"]').forEach((b) => b.classList.toggle('checked', (b.dataset.value || '') === one)); }
    document.querySelectorAll('[data-action="voi-lut"]').forEach((b) => b.classList.toggle('checked', !!st && st.voiLut === +b.dataset.index));
    document.querySelectorAll('[data-action="wl-file"][data-index]').forEach((b) => {
      const w = img && img.windowsFor(S.frame)[+b.dataset.index];
      b.classList.toggle('checked', !!(st && w && st.voiLut < 0 && near(st.wc, w.wc) && near(st.ww, w.ww)));
    });
    document.querySelectorAll('[data-action="preset"]').forEach((b) => {
      const p = presetsFor(img).find((x) => x.id === b.dataset.value);
      b.classList.toggle('checked', !!(st && p && st.voiLut < 0 && near(st.wc, p.wc) && near(st.ww, p.ww)));
    });
    document.body.classList.toggle('has-file', !!S.file);
    document.body.classList.toggle('has-dicom', !!img);
    document.body.classList.toggle('has-gray', !!(img && img.gray && !img.palette));
    document.body.classList.toggle('multi-frame', frameCount() > 1);
    document.body.classList.toggle('has-series', S.series.files.length > 1);
    // play / pause / stop: the running one is lit, the ones that do nothing now are dimmed (no per-frame redraws)
    $('playBtn').classList.toggle('checked', !!S.cine);
    $('pauseBtn').disabled = !S.cine;
    document.querySelectorAll('[data-action="cine-pause"]').forEach((b) => { b.disabled = !S.cine; });
    $('colormapSelect').value = st ? st.colormap : 'gray';
    updatePresetSelect();
  }
  const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.5;

  function updatePresetSelect() {
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    const sel = $('presetSelect');
    if (!img || !img.gray) { sel.value = 'auto'; return; }
    const st = img.state;
    let value = 'custom';
    if (st.voiLut >= 0) value = `lut:${st.voiLut}`;
    else {
      const wins = img.windowsFor(S.frame);
      const fi = wins.findIndex((w) => near(w.wc, st.wc) && near(w.ww, st.ww));
      const pi = presetsFor(img).find((p) => near(p.wc, st.wc) && near(p.ww, st.ww));
      const auto = img.autoWindow();
      if (fi >= 0) value = `file:${fi}`;
      else if (pi) value = `preset:${pi.id}`;
      else if (auto && near(auto.wc, st.wc) && near(auto.ww, st.ww)) value = 'auto';
    }
    sel.value = value;
    $('wwInput').value = Number.isFinite(st.ww) ? fmt(st.ww) : '';
    $('wcInput').value = Number.isFinite(st.wc) ? fmt(st.wc) : '';
  }

  /* Menubar behaviour: click a title to open, hover to switch, click outside / Esc to close. */
  function bindMenubar() {
    const menus = $('menus');
    let open = null;
    const close = () => { if (open) { open.classList.remove('open'); open = null; } menus.classList.remove('active'); };
    const openMenu = (m) => { if (open === m) return; if (open) open.classList.remove('open'); open = m; m.classList.add('open'); menus.classList.add('active'); };
    S.closeMenus = close;
    document.querySelectorAll('.menubar .menu, .toolbar .menu').forEach((m) => {
      const title = m.querySelector('.menu-title');
      title.addEventListener('click', (e) => { e.stopPropagation(); if (open === m) close(); else openMenu(m); });
      title.addEventListener('mouseenter', () => { if (open && open !== m && m.closest('#menus') && open.closest('#menus')) openMenu(m); });
    });
    for (const id of ['themeDropdown', 'exportMenu', 'layoutDropdown', 'toolsMore', 'transformMenu', 'dicomMenu']) {
      $(id).addEventListener('click', (e) => {
        const b = e.target.closest('button[data-action]');
        if (b) { e.stopPropagation(); close(); runAction(b.dataset.action, b); }
      });
    }
    document.addEventListener('click', (e) => { if (!e.target.closest('.menu-panel') || e.target.closest('button[data-action]')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    menus.addEventListener('click', (e) => {
      const rm = e.target.closest('.menu-remove');
      if (rm) { e.stopPropagation(); runAction(rm.dataset.remove || 'recent-remove', rm.closest('button')); return; }   // keeps the menu open
      const b = e.target.closest('button[data-action]');
      if (b) { e.stopPropagation(); close(); runAction(b.dataset.action, b); }
    });
  }

  /* ══════════════ Right panel: properties of what is shown, changed in place ══════════════ */
  let props = null;
  function buildProps() {
    const dicom = () => (S.file && S.file.kind === 'dicom' ? S.file.image : null);
    const gray = () => { const img = dicom(); return !!(img && img.gray && !img.palette); };
    const shown = () => !!(S.file && S.frameCanvas);
    const flag = (key, label) => ({ type: 'check', label, get: () => !!opt(key), set: (v) => { if (!!opt(key) !== v) toggleOption(key); } });
    const meta = (k) => { const img = dicom(); return img ? img.meta[k] : (S.file && S.file.meta ? S.file.meta[k] : ''); };
    const sections = [
      { id: 'file', icon: 'file', title: 'props.file', visible: () => !!S.file, fields: [
        { label: 'meta.fileName', get: () => S.file.name },
        { label: 'meta.fileSize', get: () => (S.file.size ? fmtSize(S.file.size) : '') },
        { label: 'meta.imageSize', get: () => (S.frameCanvas ? `${S.frameCanvas.width} × ${S.frameCanvas.height}` : ''), visible: shown },
        { label: 'meta.frames', get: () => frameCount(), visible: () => frameCount() > 1 },
        { label: 'meta.pixelSpacing', get: () => { const sp = spacing(); return sp ? `${fmt(sp[0], 4)} × ${fmt(sp[1], 4)} mm` : ''; }, visible: shown },
        { label: 'meta.modality', get: () => meta('modality') },
        { label: 'meta.patientName', get: () => meta('patientName') },
        { label: 'meta.studyDate', get: () => meta('studyDate') },
        { label: 'meta.transferSyntax', get: () => meta('transferSyntax') },
      ] },
      { id: 'view', icon: 'view', title: 'props.view', visible: shown, fields: [
        { type: 'number', label: 'props.zoom', unit: '%', min: 10, max: 6400, step: 10, decimals: 0, get: () => viewer.view.scale * 100, set: (v) => viewer.zoomBy(Math.max(2, v) / 100 / viewer.view.scale) },
        { type: 'select', label: 'props.rotation', options: () => [0, 90, 180, 270].map((d) => [String(d), `${d}°`]), get: () => String(viewer.view.rotation), set: (v) => viewer.rotate(+v - viewer.view.rotation) },
        { type: 'check', label: 'view.flipH', get: () => viewer.view.flipH, set: (v) => { if (viewer.view.flipH !== v) runAction('flip-h'); } },
        { type: 'check', label: 'view.flipV', get: () => viewer.view.flipV, set: (v) => { if (viewer.view.flipV !== v) runAction('flip-v'); } },
        flag('interpolate', 'props.smooth'),
        { type: 'buttons', items: [
          { icon: 'fit', title: t('view.fit'), run: () => runAction('fit') },
          { icon: 'actual', title: t('view.actual'), run: () => runAction('actual') },
          { icon: 'rotate-left', title: t('view.rotateLeft'), run: () => runAction('rotate-left') },
          { icon: 'rotate-right', title: t('view.rotateRight'), run: () => runAction('rotate-right') },
          { icon: 'reset', title: t('view.resetView'), run: () => runAction('reset-view') },
        ] },
      ] },
      { id: 'wl', icon: 'wl', title: 'props.wl', visible: gray, fields: [
        { type: 'number', label: 'props.ww', min: 1, step: 1, get: () => dicom().state.ww, set: (v) => renderDicom({ ww: Math.max(1, v), voiLut: -1 }) },
        { type: 'number', label: 'props.wc', step: 1, get: () => dicom().state.wc, set: (v) => renderDicom({ wc: v, voiLut: -1 }) },
        { type: 'select', label: 'props.preset', options: () => [...$('presetSelect').options].map((o) => [o.value, o.textContent]), get: () => $('presetSelect').value, set: (v) => applyPresetValue(v) },
        { type: 'select', label: 'wl.colormap', options: () => D.COLORMAP_IDS.map((id) => [id, t(`cm.${id}`)]), get: () => dicom().state.colormap || 'gray', set: (v) => renderDicom({ colormap: v }) },
        { type: 'select', label: 'props.voiFunction', options: () => ['LINEAR', 'LINEAR_EXACT', 'SIGMOID'].map((x) => [x, x]), get: () => dicom().state.voiFunction || 'LINEAR', set: (v) => runAction('voi-function', { dataset: { value: v } }) },
        { type: 'check', label: 'props.invert', get: () => !!dicom().state.invert, set: (v) => { if (!!dicom().state.invert !== v) toggleOption('invert'); } },
      ] },
      { id: 'cine', icon: 'cine', title: 'props.cine', visible: () => frameCount() > 1, fields: [
        { type: 'number', label: 'props.frame', min: 1, step: 1, decimals: 0, get: () => S.frame + 1, set: (v) => setFrame(Math.round(v) - 1) },
        { type: 'number', label: 'props.fps', min: 1, max: 120, step: 1, decimals: 0, get: () => S.fps, set: (v) => { $('fpsInput').value = String(Math.round(v)); $('fpsInput').dispatchEvent(new Event('change')); } },
        { type: 'check', label: 'cine.loop', get: () => $('loopCheck').checked, set: (v) => { if ($('loopCheck').checked !== v) toggleOption('loop'); } },
        { type: 'buttons', items: [
          { icon: 'first', title: t('cine.first'), run: () => runAction('frame-first') },
          { icon: 'play', title: t('cine.play'), run: () => runAction('cine-play'), active: () => !!S.cine },
          { icon: 'pause', title: t('cine.pause'), run: () => runAction('cine-pause') },
          { icon: 'stop', title: t('cine.stop'), run: () => runAction('cine-stop') },
          { icon: 'last', title: t('cine.last'), run: () => runAction('frame-last') },
        ] },
      ] },
      { id: 'display', icon: 'layers', title: 'props.display', visible: shown, fields: [
        flag('ruler', 'view.ruler'), flag('scaleBar', 'view.scaleBar'), flag('grid', 'view.grid'),
        flag('cornerInfo', 'settings.cornerInfo'), flag('markers', 'settings.markers'), flag('measurements', 'settings.measurements'),
        { ...flag('overlays', 'settings.overlays'), visible: () => !!dicom() },
        { type: 'select', label: 'settings.measureUnit', options: () => [['cm', t('settings.unitCm')], ['in', t('settings.unitIn')]], get: () => opt('measureUnit'), set: (v) => applySetting('measureUnit', v) },
        { type: 'color', label: 'settings.annotationColor', get: () => opt('annotationColor'), set: (v) => applySetting('annotationColor', v) },
      ] },
      { id: 'measure', icon: 'length', title: 'props.measure', visible: shown, fields: [
        { type: 'list', empty: t('props.noMeasure'), items: () => viewer.annotations.map((a) => `${t(`tool.${a.type}`) !== `tool.${a.type}` ? t(`tool.${a.type}`) : a.type}${a.label ? ` — ${a.label}` : ''}`) },
        { type: 'buttons', items: [{ icon: 'trash', title: t('props.clearMeasure'), run: () => runAction('clear-measurements') }] },
      ] },
    ];
    props = window.PropsPanel.create({
      body: $('propsBody'), rail: $('rightRail'), t, sections,
      onRail: async (id) => { if (!opt('rightPanel')) await toggleOption('rightPanel'); requestAnimationFrame(() => props.open(id)); },
    });
    props.render();
    document.addEventListener('langchange', () => props.render());
  }

  /* The page's own title row (desktop): the window buttons at the right of the menu bar, and the empty parts
   * of the menu bar (and the icon / name) move the window like a title bar; a double click maximises. */
  function bindWindowChrome() {
    if (!P.isDesktop || !window.desktopAPI.setPosition) return;
    const api = window.desktopAPI;
    const setMax = (m) => { document.body.classList.toggle('maximized', !!m); const b = document.querySelector('.win-btn[data-win="max"]'); if (b) b.title = t(m ? 'win.restore' : 'win.maximize'); };
    api.isMaximized().then(setMax).catch(() => {});
    api.onWinState((s) => setMax(s && s.maximized));
    $('winControls').addEventListener('click', (e) => {
      const b = e.target.closest('[data-win]');
      if (!b) return;
      if (b.dataset.win === 'min') api.minimize();
      else if (b.dataset.win === 'max') api.toggleMaximize().then(setMax);
      else runAction('exit');
    });
    const dragArea = (e) => e.button === 0 && !e.target.closest('button, input, select, a, .menu, .wl-bar, .theme-control, .win-controls');
    const bar = $('menubar');
    // mouse events on the window, like the image viewer: pointer capture on the menu bar made WebView2 end the press at once
    let drag = null;
    bar.addEventListener('mousedown', (e) => {
      if (!dragArea(e) || e.detail > 1) return;
      e.preventDefault();
      drag = { sx: e.screenX, sy: e.screenY, wx: window.screenX, wy: window.screenY, moved: false, queued: false };
    });
    window.addEventListener('mousemove', async (e) => {
      if (!drag) return;
      if (!(e.buttons & 1)) { drag = null; return; }
      const dx = e.screenX - drag.sx, dy = e.screenY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      if (!drag.moved) {
        drag.moved = true;
        // a maximised window is restored first and keeps the pointer at the same share of its width
        if (document.body.classList.contains('maximized')) {
          const share = (drag.sx - window.screenX) / Math.max(1, window.outerWidth);
          await api.toggleMaximize().then(setMax);
          await new Promise((r) => setTimeout(r, 60));
          if (!drag) return;
          drag.wx = drag.sx - share * window.outerWidth; drag.wy = window.screenY;
        }
      }
      drag.x = drag.wx + dx; drag.y = drag.wy + dy;
      if (drag.queued) return;
      drag.queued = true;
      requestAnimationFrame(() => { if (!drag) return; drag.queued = false; api.setPosition(drag.x, drag.y); });
    });
    window.addEventListener('mouseup', () => { drag = null; rs = null; });

    // resizing: thin strips along the edges and corners, and the grip in the bottom-right corner
    const edges = document.createElement('div');
    edges.className = 'win-edges';
    for (const d of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) { const el = document.createElement('div'); el.className = `win-edge e-${d}`; el.dataset.dir = d; edges.append(el); }
    document.body.append(edges);
    let rs = null;
    const startResize = (dir, e) => {
      if (e.button !== 0 || document.body.classList.contains('maximized')) return;
      e.preventDefault(); e.stopPropagation();
      rs = { dir, sx: e.screenX, sy: e.screenY, x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight, queued: false };
    };
    edges.addEventListener('mousedown', (e) => { const el = e.target.closest('.win-edge'); if (el) startResize(el.dataset.dir, e); });
    $('resizeGrip').addEventListener('mousedown', (e) => startResize('se', e));
    window.addEventListener('mousemove', (e) => {
      if (!rs) return;
      if (!(e.buttons & 1)) { rs = null; return; }
      const dx = e.screenX - rs.sx, dy = e.screenY - rs.sy;
      const minW = Math.max(900, minSizeSent || 0), minH = 600;
      let { x, y, w, h } = rs;
      if (rs.dir.includes('e')) w = Math.max(minW, rs.w + dx);
      if (rs.dir.includes('s')) h = Math.max(minH, rs.h + dy);
      if (rs.dir.includes('w')) { w = Math.max(minW, rs.w - dx); x = rs.x + rs.w - w; }
      if (rs.dir.includes('n')) { h = Math.max(minH, rs.h - dy); y = rs.y + rs.h - h; }
      rs.next = { x, y, w, h };
      if (rs.queued) return;
      rs.queued = true;
      requestAnimationFrame(() => { if (!rs) return; rs.queued = false; const n = rs.next; api.setBounds(n.x, n.y, n.w, n.h); });
    });
    bar.addEventListener('dblclick', (e) => { if (dragArea(e)) api.toggleMaximize().then(setMax); });
  }

  /* ══════════════ UI binding ══════════════ */
  function bindUI() {
    bindMenubar();
    MenuMirror.init();
    buildProps();
    // Toolbar / context menus / dialogs: any button with data-action
    document.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-action]');
      if (!b || b.closest('#menus') || b.closest('#themeDropdown') || b.closest('#exportMenu') || b.closest('#layoutDropdown') || b.closest('#toolsMore') || b.closest('#transformMenu') || b.closest('#dicomMenu')) return;
      const ctx = b.closest('.ctx-menu');
      if (ctx) hideContextMenus();
      runAction(b.dataset.action, b);
    });
    $('modalHost').addEventListener('mousedown', (e) => { if (e.target === $('modalHost')) Dlg.closeAll(); });

    // Folded left panel: a rail item unfolds the panel at that part (the folder tree or one of the tabs)
    $('sidebarRail').addEventListener('click', async (e) => {
      const item = e.target.closest('[data-rail]');
      if (!item) return;
      if (!opt('sidebar')) await toggleOption('sidebar');
      const which = item.dataset.rail;
      if (which === 'folder') $('fileTree').focus({ preventScroll: true });
      else { const tab = document.querySelector(`.tabs .tab[data-tab="${which}"]`); if (tab) tab.click(); }
    });
    // Tabs
    document.querySelectorAll('.tabs .tab').forEach((tab) => tab.addEventListener('click', () => {
      document.querySelectorAll('#sidebarRail [data-rail]').forEach((r) => r.classList.toggle('current', r.dataset.rail === tab.dataset.tab));
      document.querySelectorAll('.tabs .tab').forEach((x) => x.classList.toggle('active', x === tab));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${tab.dataset.tab}`));
      if (tab.dataset.tab === 'histogram') drawHistogram();
    }));
    $('tagSearch').addEventListener('input', () => renderTags());

    // Frame bar
    $('frameSlider').addEventListener('input', (e) => setFrame(+e.target.value));
    $('fpsInput').addEventListener('change', (e) => { S.fps = Math.max(1, Math.min(120, +e.target.value || 10)); if (S.cine) { stopCine(); startCine(); } });
    $('loopCheck').addEventListener('change', () => { setOpt({ loop: $('loopCheck').checked }); syncMenuState(); });
    $('seriesSlider').addEventListener('input', (e) => openSeriesIndex(+e.target.value));

    // Toolbar W/L controls
    $('presetSelect').addEventListener('change', (e) => applyPresetValue(e.target.value));
    $('colormapSelect').addEventListener('change', (e) => renderDicom({ colormap: e.target.value }));
    const wlInput = () => { const ww = +$('wwInput').value, wc = +$('wcInput').value; if (Number.isFinite(ww) && Number.isFinite(wc) && ww > 0) renderDicom({ ww, wc }); };
    $('wwInput').addEventListener('change', wlInput);
    $('wcInput').addEventListener('change', wlInput);

    // Sidebar resize + splitter
    bindDrag($('sidebarResizer'), (dx) => {
      const w = Math.max(200, Math.min(600, S.sidebarStart + dx));
      $('sidebar').style.width = `${w}px`;
      return w;
    }, () => { S.sidebarStart = $('sidebar').getBoundingClientRect().width; }, (w) => setOpt({ sidebarWidth: w }));
    bindDrag($('rightResizer'), (dx) => {
      const w = Math.max(220, Math.min(560, S.rightStart - dx));
      $('rightPanel').style.width = `${w}px`;
      return w;
    }, () => { S.rightStart = $('rightPanel').getBoundingClientRect().width; }, (w) => setOpt({ rightPanelWidth: w }));
    bindDrag($('sideSplitter'), (_dx, dy) => {
      const total = $('sidebar').getBoundingClientRect().height;
      const pct = Math.max(15, Math.min(85, S.treeStart + dy / total * 100));
      $('treeSection').style.flexBasis = `${pct}%`;
      return pct;
    }, () => { S.treeStart = parseFloat($('treeSection').style.flexBasis) || 50; }, (pct) => setOpt({ treeHeight: pct }), true);

    // Drag & drop
    const vp = $('viewport');
    for (const el of [vp, $('fileTree')]) {
      el.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; el.classList.add('drag-over'); });
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', async (e) => {
        e.preventDefault(); el.classList.remove('drag-over');
        const paths = await P.mountDropped(e.dataTransfer);
        if (paths.length) openPath(paths[0]);
        if (!P.isDesktop) renderDriveBar();
      });
    }

    // Context menus
    document.addEventListener('mousedown', (e) => { if (!e.target.closest('.ctx-menu')) hideContextMenus(); });
    window.addEventListener('blur', hideContextMenus);

    // Keyboard
    document.addEventListener('keydown', onKey);
  }

  function bindDrag(handle, onMove, onStart, onEnd, vertical) {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onStart();
      const sx = e.clientX, sy = e.clientY;
      let last;
      document.body.style.cursor = vertical ? 'row-resize' : 'col-resize';
      document.body.classList.add('dragging');
      const move = (ev) => { last = onMove(ev.clientX - sx, ev.clientY - sy); viewer.resize(); };
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); document.body.style.cursor = ''; document.body.classList.remove('dragging'); if (last !== undefined) onEnd(last); };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  }

  /* ══════════════ Keyboard ══════════════ */
  function onKey(e) {
    const inInput = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
    if ($('modalHost').classList.contains('open')) { if (e.key === 'Escape') Dlg.closeAll(); return; }
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key;
    const act = (a, extra) => { e.preventDefault(); runAction(a, extra); };
    if (ctrl && !e.shiftKey && key.toLowerCase() === 'o') return act('open-file');
    if (ctrl && e.shiftKey && key.toLowerCase() === 'o') return act('open-folder');
    if (ctrl && key.toLowerCase() === 'e') return act('export', { dataset: { format: 'png' } });
    if (ctrl && key === 'Tab') return act(e.shiftKey ? 'tab-prev' : 'tab-next');
    if (ctrl && key.toLowerCase() === 'w' && P.isDesktop) return act('close-file');
    if (ctrl && !e.shiftKey && key.toLowerCase() === 'z') return act('undo');
    if (ctrl && (key.toLowerCase() === 'y' || (e.shiftKey && key.toLowerCase() === 'z'))) return act('redo');
    if (ctrl && key.toLowerCase() === 'p') return act('print');
    if (ctrl && key === '0') return act('fit');
    if (ctrl && key === '1') return act('actual');
    if (ctrl && key === 'ArrowLeft') return act('rotate-left');
    if (ctrl && key === 'ArrowRight') return act('rotate-right');
    if (key === 'F1') return act(ctrl ? 'help-window' : 'shortcuts');
    if (ctrl && key === ',') return act('settings');
    if (key === 'F9') return act('toggle', { dataset: { key: 'sidebar' } });
    if (key === 'F8') { e.preventDefault(); return act('toggle', { dataset: { key: 'rightPanel' } }); }
    if (key === 'F11') return act('fullscreen');
    if (key === 'F12' && P.isDesktop) return act('devtools');
    if (inInput) return;
    if (ctrl && key.toLowerCase() === 'c') {
      if (document.activeElement === $('fileTree')) return act('tree-copy');
      return act('copy-image');
    }
    if (ctrl && key.toLowerCase() === 'x' && document.activeElement === $('fileTree')) return act('tree-cut');
    if (ctrl && key.toLowerCase() === 'v' && document.activeElement === $('fileTree')) return act('tree-paste');
    if (key === 'Delete' && document.activeElement === $('fileTree')) return act('tree-delete');
    if (document.activeElement === $('fileTree') && !['Escape', ' '].includes(key)) return;   // the tree handles its own arrows
    switch (key) {
      case '+': case '=': return act('zoom-in');
      case '-': case '_': return act('zoom-out');
      case 'h': case 'H': return act('flip-h');
      case 'v': case 'V': return act('flip-v');
      case 'r': case 'R': return act('reset-view');
      case 'i': case 'I': return act('toggle', { dataset: { key: 'invert' } });
      case 'm': return act('mpr');
      case 'M': return act(e.shiftKey ? 'volume' : 'mpr');
      case 'k': case 'K': return act('toggle', { dataset: { key: 'ruler' } });
      case 'b': case 'B': return act('toggle', { dataset: { key: 'scaleBar' } });
      case 'g': case 'G': return act('toggle', { dataset: { key: 'grid' } });
      case 'a': case 'A': return act('wl-auto');
      case 'w': return act('wl-file');
      case 'W': return act('wl-reset');
      case ' ': return act('cine-toggle');
      case 's': case 'S': return act('cine-stop');
      case 'ArrowUp': return act('frame-prev');
      case 'ArrowDown': return act('frame-next');
      case 'ArrowLeft': return act('series-prev');
      case 'ArrowRight': return act('series-next');
      case 'PageUp': return act('series-prev');
      case 'PageDown': return act('series-next');
      case 'Home': return act('frame-first');
      case 'End': return act('frame-last');
      case 'Backspace': return act('delete-last');
      case 'Delete': return act('clear-measurements');
      case 'Escape': if (!viewer.cancelDrawing()) viewer.setTool(S.tool); hideContextMenus(); return;
      case 'Enter': if (viewer.finishPolygon()) e.preventDefault(); return;
      case 'q': case 'Q': return act('tool', { dataset: { tool: 'magnify' } });
      default: break;
    }
    const tools = { 1: 'pan', 2: 'wl', 3: 'zoom', 4: 'stack', 5: 'probe', 6: 'length', 7: 'angle', 8: 'rect', 9: 'ellipse', 0: 'text' };
    // Shift + digit (by physical key, so it works on every keyboard layout)
    const shifted = { Digit5: 'point', Digit7: 'cobb', Digit8: 'polygon', Digit9: 'freehand', Digit0: 'arrow' };
    if (e.shiftKey && !ctrl && shifted[e.code]) { e.preventDefault(); setTool(shifted[e.code]); return; }
    if (tools[key] && !ctrl) { e.preventDefault(); setTool(tools[key]); }
  }

  /* ══════════════ Actions ══════════════ */
  const BUSY_ACTIONS = {
    'export': 'progress.exporting', 'export-tiff16': 'progress.exporting', 'export-frames': 'progress.exporting', 'export-gif-anim': 'progress.exporting',
    'export-tags': 'progress.exporting', 'export-webm': 'progress.exporting', 'export-mp4': 'progress.exporting', 'export-pdf-save': 'progress.exporting',
    'export-dicom': 'progress.exporting', 'export-dicom-sc': 'progress.exporting', 'export-measurements': 'progress.exporting',
    'export-dicomdir': 'progress.exporting', 'export-as': 'progress.exporting', 'copy-image': 'progress.copying', 'copy-tags': 'progress.copying',
  };
  async function runAction(action, el) {
    const ds = (el && el.dataset) || {};
    if (BUSY_ACTIONS[action] && !Progress.open && S.file) {
      Progress.start(t(BUSY_ACTIONS[action], { name: S.file.name }), { cancellable: false });
      await Progress.shown();
      try { return await runAction(action, el); } finally { await Progress.finish(); }
    }
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    try {
      switch (action) {
        case 'open-file': { const files = await P.pickFiles({ multiple: false }); if (files[0]) openPath(files[0]); break; }
        case 'open-folder': { const dir = await P.pickFolder(); if (dir) { hideStart(); await tree.setRoot(dir); if (!P.isDesktop) renderDriveBar(); } break; }
        case 'open-recent': { const st = await P.stat(ds.path); if (st.exists && st.isDir) tree.setRoot(ds.path); else { toast(t('file.recentMissing', { dir: ds.path }), true); await runAction('recent-remove', el); } break; }
        case 'recent-remove': { await setOpt({ recentDirs: (opt('recentDirs') || []).filter((d) => d !== ds.path) }); buildRecentMenu(); break; }
        case 'recent-clear': await setOpt({ recentDirs: [] }); buildRecentMenu(); break;
        case 'close-file': closeFile(); break;
        case 'tabs-scroll': scrollTabs(+ds.dir || 1); break;
        case 'tab-next': stepTab(1); break;
        case 'tab-prev': stepTab(-1); break;
        case 'exit': P.closeWindow(); break;
        case 'export': await exportImage(ds.format || 'png'); break;
        case 'export-tiff16': await exportTiff16(); break;
        case 'export-as-dialog': await openExportAs(); break;
        case 'export-as': await exportAs(ds.format, ds.options ? (typeof ds.options === 'string' ? JSON.parse(ds.options) : ds.options) : {}, ds.scope || 'auto'); break;
        case 'export-frames': await exportAllFrames(); break;
        case 'export-gif-anim': await exportAnimatedGif(); break;
        case 'export-tags': await exportTags(ds.format || 'txt'); break;
        case 'copy-image': await copyImage(); break;
        case 'copy-tags': if (img) { await P.clipboardWriteText(D.tagsToText(img.tags, 'txt')); toast(t('msg.copied')); } break;
        case 'batch': openBatchDialog(); break;
        case 'mpr': openMpr(); break;
        case 'anonymize': openAnonymize(); break;
        case 'export-webm': await exportVideo('webm'); break;
        case 'print': await printImage(); break;
        case 'fit': viewer.fit(); break;
        case 'actual': viewer.actual(); break;
        case 'zoom-in': viewer.zoomBy(1.25); break;
        case 'zoom-out': viewer.zoomBy(0.8); break;
        case 'rotate-left': viewer.rotate(-90); History.push(); break;
        case 'rotate-right': viewer.rotate(90); History.push(); break;
        case 'flip-h': viewer.flip('h'); History.push(); break;
        case 'flip-v': viewer.flip('v'); History.push(); break;
        case 'reset-view': viewer.reset(); History.push(); break;
        case 'toggle': await toggleOption(ds.key); break;
        case 'fullscreen': P.toggleFullscreen(); break;
        case 'devtools': P.toggleDevTools(); break;
        case 'theme': await setTheme(ds.value); break;
        case 'theme-toggle': { const list = window.Themes.list(); const i = list.findIndex((x) => x.id === window.Themes.get(opt('theme')).id); await setTheme(list[(i + 1) % list.length].id); break; }
        case 'settings': openSettings(); break;
        case 'settings-reset': await resetSettings(); break;
        case 'lang': await setLang(ds.value); break;
        case 'tool': setTool(ds.tool); break;
        case 'delete-last': viewer.deleteLast(); History.push(); break;
        case 'clear-measurements': viewer.clear(); History.push(); break;
        case 'scalebar-pos': {   // the tutorial moves the scale bar (the user drags it)
          if (!opt('scaleBar')) await toggleOption('scaleBar');
          viewer.scaleBarPos = ds.reset ? null : { fx: +ds.fx, fy: +ds.fy };
          await setOpt({ scaleBarPos: viewer.scaleBarPos });
          break;
        }
        case 'props-open': if (!opt('rightPanel')) await toggleOption('rightPanel'); if (props) props.open(ds.sec); break;
        case 'calibrate': await calibrateFromLength(); break;
        case 'clear-calibration': clearCalibration(); break;
        case 'wl-step': {
          if (!img || !img.gray) break;
          const range = img.range ? img.range.max - img.range.min : 256;
          const step = (range > 2000 ? 10 : range > 200 ? 5 : 1) * (ds.big ? 10 : 1) * (+ds.dir || 1);
          const st = img.state;
          if (ds.what === 'ww') await renderDicom({ ww: Math.max(1, (st.ww || 1) + step), voiLut: -1 });
          else await renderDicom({ wc: (st.wc || 0) + step, voiLut: -1 });
          break;
        }
        case 'undo': await History.undo(); break;
        case 'redo': await History.redo(); break;
        case 'wl-auto': if (img) { const a = img.autoWindow(); if (a) await renderDicom({ wc: a.wc, ww: a.ww, voiLut: -1 }); } break;
        case 'wl-file': if (img) { const w = img.windowsFor(S.frame)[+(ds.index || 0)]; if (w) await renderDicom({ wc: w.wc, ww: w.ww, voiLut: -1 }); else await renderDicom({ resetWindow: true }); } break;
        case 'wl-reset': if (img) await renderDicom({ resetWindow: true, invert: img.defaultInvert(), colormap: 'gray' }); break;
        case 'preset': { const p = presetsFor(img).find((x) => x.id === ds.value); if (p) await renderDicom({ wc: p.wc, ww: p.ww, voiLut: -1 }); break; }
        case 'voi-lut': await renderDicom({ voiLut: +ds.index }); break;
        case 'voi-function': await renderDicom({ voiFunction: ds.value }); break;
        case 'colormap': await renderDicom({ colormap: ds.value }); break;
        case 'cine-toggle': if (S.cine) stopCine(); else startCine(); break;
        case 'cine-play': startCine(); break;
        case 'cine-pause': stopCine(); break;
        case 'cine-stop': await cineStop(); break;
        case 'video-extract': await extractVideo(); break;
        case 'frame-first': setFrame(0); break;
        case 'frame-last': if (img) setFrame(img.frames - 1); break;
        case 'frame-prev': stepFrame(-1); break;
        case 'frame-next': stepFrame(1); break;
        case 'series-prev': stepSeries(-1); break;
        case 'series-next': stepSeries(1); break;
        case 'series-scan': await scanSeries(); break;
        case 'tree-up': tree.up(); break;
        case 'tree-refresh': tree.refresh(); break;
        case 'tree-open': { const p = tree.selected()[0]; if (p) openPath(p); break; }
        case 'tree-show': { const p = tree.selected()[0]; if (p) P.showInFolder(p); break; }
        case 'tree-copy': S.treeClipboard = { paths: tree.selected(), cut: false }; break;
        case 'tree-cut': S.treeClipboard = { paths: tree.selected(), cut: true }; break;
        case 'tree-paste': await treePaste(); break;
        case 'tree-delete': await treeDelete(); break;
        case 'tree-copy-path': { const p = tree.selected(); if (p.length) { await P.clipboardWriteText(p.join('\n')); toast(t('msg.copied')); } break; }
        case 'about': openAbout(); break;
        case 'shortcuts': openShortcuts(); break;
        case 'lang-toggle': await setLang(window.I18n.lang === 'ko' ? 'en' : 'ko'); break;
        case 'start-page': if (startPage && startPage.visible && el && el.closest && el.closest('#menus')) hideStart(); else showStart(); break;
        case 'start-hide': hideStart(); break;
        case 'sample': await openSample(ds.sample || ds.value); break;
        case 'recent-file': await openPath(ds.path || ds.value); break;
        case 'recent-folder': { const d = ds.path || ds.value; const st = await P.stat(d); if (st.exists && st.isDir) { hideStart(); tree.setRoot(d); } else toast(t('file.recentMissing', { dir: d }), true); break; }
        case 'recent-file-remove': await setOpt({ recentFiles: (opt('recentFiles') || []).filter((x) => x !== ds.path) }); buildRecentFilesMenu(); break;
        case 'recent-files-clear': await setOpt({ recentFiles: [] }); buildRecentFilesMenu(); break;
        case 'tour': startTour(ds.from || undefined); break;
        case 'help-window': openHelp(ds.page); break;
        case 'sidebar-tab': { const tab = document.querySelector(`.tabs .tab[data-tab="${ds.tab}"]`); if (tab) tab.click(); break; }
        case 'demo-measure': demoMeasure(ds.kind); break;
        case 'demo-fusion': await demoFusion(ds.on !== false && ds.on !== 'false'); break;
        case 'open-dicomdir': { const files = await P.pickFiles({ multiple: false, dicomdir: true }); if (files[0]) await openDicomdir(files[0]); break; }
        case 'tag-editor': openTagEditor(); break;
        case 'document': openDocumentWindow(); break;
        case 'export-mp4': await exportVideo('mp4'); break;
        case 'export-pdf': await exportPdf(); break;
        case 'export-pdf-save': await exportPdfSave(typeof ds.options === 'string' ? JSON.parse(ds.options) : ds.options || {}); break;
        case 'export-dicom': await exportDicom(); break;
        case 'export-dicom-sc': await exportDicomSc(); break;
        case 'export-measurements': await exportMeasurements(); break;
        case 'finish-polygon': viewer.finishPolygon(); break;
        case 'export-dicomdir': await exportDicomdir(); break;
        case 'fusion': openFusion(); break;
        case 'volume': openVolume(); break;
        case 'close-dialog': Dlg.close(ds.kind); break;
        case 'tab-close': { const tb = S.ctx && S.ctx.tab; if (tb) closeTab(tb); break; }
        case 'tab-close-others': { const keep = S.ctx && S.ctx.tab; for (const tb of S.tabs.slice()) if (tb !== keep) closeTab(tb); if (keep) activateTab(keep); break; }
        case 'tab-close-all': for (const tb of S.tabs.slice()) closeTab(tb); break;
        case 'tab-copy-path': { const tb = S.ctx && S.ctx.tab; if (tb) { await P.clipboardWriteText(tb.path); toast(t('msg.copied')); } break; }
        case 'tab-show': { const tb = S.ctx && S.ctx.tab; if (tb) P.showInFolder(tb.path); break; }
        case 'filters': openFilters(); break;
        case 'filter-quick': await setFilters(ds.value ? [{ name: ds.value, params: window.ImageFilters.defaults(ds.value) }] : []); break;
        case 'pacs': openPacs(); break;
        case 'open-zip': { const files = await P.pickFiles({ multiple: false }); if (files[0]) await openZip(files[0]); break; }
        case 'layout': { const [r, c] = String(ds.value || '1x1').split('x').map(Number); if (S.file) saveTabState(currentTab()); window.Layout.set(r, c); syncMenuState(); break; }
        default: console.warn('unknown action', action);
      }
    } catch (err) {
      showError(err);
    }
  }

  async function toggleOption(key) {
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    if (key === 'invert') {
      if (img) await renderDicom({ invert: !img.state.invert });
      else if (S.file) { await setOpt({ invert: !opt('invert') }); await renderImage(); History.push(); }
      syncMenuState();
      return;
    }
    if (key === 'loop') { $('loopCheck').checked = !$('loopCheck').checked; await setOpt({ loop: $('loopCheck').checked }); syncMenuState(); return; }
    const value = !opt(key);
    await setOpt({ [key]: value });
    switch (key) {
      case 'sidebar': document.body.classList.toggle('no-sidebar', !value); viewer.resize(); break;
      case 'rightPanel': document.body.classList.toggle('no-right', !value); viewer.resize(); if (value && props) props.refresh(); break;
      case 'interpolate': viewer.interpolate = value; break;
      case 'measurements': viewer.showAnnotations = value; break;
      case 'ruler': viewer.showRuler = value; document.body.classList.toggle('ruler-on', value); break;
      case 'scaleBar': viewer.showScaleBar = value; break;
      case 'grid': viewer.showGrid = value; break;
      case 'overlays': if (img) await renderDicom({ overlays: value }); break;
      case 'cornerInfo': case 'markers': updateCorners(); break;
      case 'syncScroll': window.Layout.setSync(value); break;
      case 'refLines': window.Layout.setRefLines(value); break;
      default: break;
    }
    syncMenuState();
  }

  function setTool(tool) {
    S.tool = tool;
    viewer.setTool(tool);
    syncMenuState();
  }

  /* ══════════════ Files ══════════════ */
  function isOpenableName(name) {
    const ext = P.extname(name);
    if (DICOM_EXTS.has(ext) || IMAGE_EXTS.has(ext) || ext === 'zip') return true;
    if (!ext && !/^(readme|license)$/i.test(name)) return true;   // DICOM files often carry no extension (DICOMDIR opens as a directory of series)
    return false;
  }

  function normPath(p) { return P.isDesktop && P.sep === '\\' ? String(p).replace(/\//g, '\\') : String(p); }
  async function openPath(p) {
    if (!p) return;
    p = normPath(p);
    const st = await P.stat(p);
    if (st.exists && st.isDir) { hideStart(); tree.setRoot(p); return; }
    if (/^dicomdir$/i.test(P.basename(p))) { await openDicomdir(p); return; }
    if (P.extname(p) === 'zip') { await openZip(p); return; }
    await openFile(p);
  }

  /* Every opened file gets a tab. replace = load into the current tab (stack browsing); tab = load into that tab. */
  async function openFile(path, { replace = false, tab = null } = {}) {
    const name = P.basename(path);
    const existing = S.tabs.find((x) => samePath(x.path, path));
    if (!replace && !tab && existing) { await activateTab(existing); return; }
    stopCine();
    showLoading(t('status.decoding', { name }));
    const token = ++S.loadToken;
    let made = null;
    const prevTabId = S.tabId;   // the tab this open created (a DICOM without pixels reuses it)
    try {
      const buf = await P.readFile(path);
      if (token !== S.loadToken) return;
      const bytes = new Uint8Array(buf);
      const ext = P.extname(name);
      const dicom = DICOM_EXTS.has(ext) || (!IMAGE_EXTS.has(ext) && D.isDicom(bytes));
      const target = made = tab || (replace ? currentTab() : null) || newTab(path, name);
      if (target.file && target.file !== S.file) releaseFile(target.file);
      const prevFile = S.file;
      S.tabId = target.id;
      if (dicom) await openDicom(path, name, bytes);
      else if (IMAGE_EXTS.has(ext)) await openImage(path, name, bytes, ext);
      else throw new Error(t('msg.unsupported', { name }));
      if (prevFile && prevFile !== S.file && !S.tabs.some((x) => x.file === prevFile)) releaseFile(prevFile);
      target.file = S.file; target.path = path; target.name = name; target.used = Date.now();
      renderTabs();
      trimRetained();
      hideStart();
      pushRecentFile(path);
      // Keep the tree in sync (a file opened from the OS or a drop may live in another folder).
      const dir = P.dirname(path);
      if (tree.root() !== dir && P.isDesktop) await tree.setRoot(dir);
      tree.select(path);
      updateSeriesFromTree(path);
      if (P.isDesktop && opt('rememberLastDir')) setOpt({ lastDir: dir });
    } catch (err) {
      if (err && err.meta) {   // DICOM without pixel data: still show the tags
        S.file = { path, name, size: 0, kind: 'dicom-meta', meta: err.meta, tags: err.tags || [], docKind: err.docKind || 'other', video: err.video || null };
        const target = made || tab || (replace ? currentTab() : null) || newTab(path, name);
        S.tabId = target.id; target.file = S.file; target.path = path; target.name = name; target.used = Date.now();
        renderTabs();
        viewer.setSource(null);
        refreshPanels();
        syncMenuState();
        updateStatus();
        hideStart();
        pushRecentFile(path);
        await showDocView();
        if (S.file.docKind === 'other') toast(t('msg.noPixelData'));
      } else {
        // a tab made for a file that could not be opened goes away again
        if (made && !made.file && made !== tab) { S.tabs.splice(S.tabs.indexOf(made), 1); if (S.tabId === made.id) S.tabId = prevTabId; renderTabs(); }
        showError(err, t('msg.loadFailed', { name }));
      }
    } finally {
      if (token === S.loadToken) hideLoading();
    }
  }

  async function openDicom(path, name, bytes) {
    const image = await D.load(bytes);
    S.file = { path, name, size: bytes.length, kind: 'dicom', image, warning: image.warning };
    if (!S.keepNext) S.calibration = null;
    S.frame = 0;
    S.fps = image.frameRate ? Math.round(image.frameRate) : 10;
    $('fpsInput').value = S.fps;
    viewer.annotations = [];
    await renderDicom({ frame: 0, resetWindow: true, overlays: !!opt('overlays'), overlayColor: hexToRgb(opt('overlayColor')) }, { newFile: !S.keepNext });
    buildWindowMenus();
    window.I18n.apply($('wlMenu'));
    refreshPanels();
    syncMenuState();
    updateFrameBar();
    History.reset();
  }

  /* Decode a general image (page = TIFF page) to a canvas: TIFF / HEIF / JPEG 2000 through ImageFormats, the rest natively. */
  async function decodeImageCanvas(bytes, ext, page = 0) {
    const IF = window.ImageFormats;
    if (IF && IF.EXTS.has(ext)) {
      const r = await IF.decode(bytes, ext, { page });
      const c = document.createElement('canvas');
      c.width = r.width; c.height = r.height;
      const id = c.getContext('2d').createImageData(r.width, r.height);
      id.data.set(r.rgba);
      c.getContext('2d').putImageData(id, 0, 0);
      return { canvas: c, pages: r.pages || 1 };
    }
    const blob = new Blob([bytes], { type: MIME[ext] || 'application/octet-stream' });
    let bitmap;
    try { bitmap = await createImageBitmap(blob); }
    catch { bitmap = await loadViaImg(blob); }
    const c = document.createElement('canvas');
    c.width = bitmap.width; c.height = bitmap.height;
    c.getContext('2d').drawImage(bitmap, 0, 0);
    if (bitmap.close) bitmap.close();
    return { canvas: c, pages: 1 };
  }

  async function openImage(path, name, bytes, ext) {
    const { canvas: c, pages } = await decodeImageCanvas(bytes, ext, 0);
    S.file = { path, name, size: bytes.length, kind: 'image', bitmapCanvas: c, ext, pages, bytes: pages > 1 ? bytes : null };
    if (!S.keepNext) S.calibration = null;
    S.frame = 0;
    viewer.annotations = [];
    await renderImage(true);
    buildWindowMenus();
    refreshPanels();
    syncMenuState();
    updateFrameBar();
    History.reset();
  }

  function loadViaImg(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The browser cannot decode this image')); };
      im.src = url;
    });
  }

  async function renderImage(newFile) {
    const src = S.file.bitmapCanvas;
    let c = src;
    if (opt('invert')) {
      c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
      const x = c.getContext('2d');
      x.drawImage(src, 0, 0);
      const id = x.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < id.data.length; i += 4) { id.data[i] = 255 - id.data[i]; id.data[i + 1] = 255 - id.data[i + 1]; id.data[i + 2] = 255 - id.data[i + 2]; }
      x.putImageData(id, 0, 0);
    }
    S.frameCanvas = c;
    viewer.setSource({ canvas: c, width: c.width, height: c.height, spacing: spacing(), aspect: 1 }, { keepView: !newFile });
    updateCorners();
    updateStatus();
    relabelAnnotations();
  }

  function closeFile() {
    const tab = currentTab();
    if (tab) { closeTab(tab); return; }
    clearViewer();
  }
  function clearViewer() {
    S.fusion = null;
    stopCine();
    S.file = null; S.frameCanvas = null; S.frame = 0; S.tabId = 0; S.calibration = null;
    viewer.setSource(null);
    refreshPanels(); syncMenuState(); updateCorners(); updateStatus(); updateFrameBar();
    buildWindowMenus();
    History.reset();
    renderTabs();
  }

  /* ══════════════ File tabs ══════════════ */
  const RETAIN_MAX = 6;   // decoded files kept in memory for instant switching; older tabs reload from disk
  const samePath = (a, b) => String(a || '').replace(/\\/g, '/').toLowerCase() === String(b || '').replace(/\\/g, '/').toLowerCase();
  function currentTab() { return S.tabs.find((x) => x.id === S.tabId) || null; }
  function newTab(path, name) {
    const cur = currentTab();
    if (cur) saveTabState(cur);
    const tab = { id: (S.tabSeq = (S.tabSeq || 0) + 1), path, name, file: null, snap: null, used: Date.now() };
    S.tabs.push(tab);
    return tab;
  }
  function releaseFile(f) { if (f && f.image && f.image.video) f.image.video.destroy(); if (f && f.image && f.image.release) f.image.release(); }
  function saveTabState(tab) {
    if (!tab || tab.file !== S.file || !S.file) return;
    tab.snap = {
      frame: S.frame, view: { ...viewer.view }, fps: S.fps,
      annotations: JSON.parse(JSON.stringify(viewer.annotations)),
      win: History.snapshot().win, imageInvert: S.file.kind === 'image' ? !!opt('invert') : undefined,
      history: { stack: History.stack.slice(), index: History.index },
      calibration: S.calibration ? S.calibration.slice() : null,
      series: S.series && S.series.files.length > 1 ? { ...S.series, files: S.series.files.slice(), items: S.series.current ? S.series.current.items : null } : null,
    };
  }
  async function restoreTabState(tab) {
    const snap = tab.snap;
    if (!snap) return;
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    History.restoring = true;
    try {
      if (img && snap.win) {
        const w = snap.win;
        const o = { frame: snap.frame, invert: w.invert, colormap: w.colormap, voiFunction: w.voiFunction };
        if (w.voiLut >= 0) o.voiLut = w.voiLut; else if (w.custom && Number.isFinite(w.wc)) { o.wc = w.wc; o.ww = w.ww; } else o.resetWindow = true;
        await renderDicom(o);
      } else if (S.file && S.file.kind === 'image' && snap.frame && S.file.pages > 1) await setFrame(snap.frame);
      S.fps = snap.fps || S.fps; $('fpsInput').value = S.fps;
      viewer.annotations = JSON.parse(JSON.stringify(snap.annotations || []));
      Object.assign(viewer.view, snap.view);
      viewer.redraw();
      if (snap.history) { History.stack = snap.history.stack.slice(); History.index = snap.history.index; }
      S.calibration = snap.calibration ? snap.calibration.slice() : null;
      if (snap.series && snap.series.files.includes(tab.path)) { S.series = { ...snap.series, index: snap.series.files.indexOf(tab.path) }; updateSeriesBar(); renderSeriesPanel(); }
      applyViewerSpacing();
      relabelAnnotations(); updateCorners(); updateStatus(); updateFrameBar(); syncMenuState();
    } finally { History.restoring = false; History.sync(); }
  }
  async function activateTab(tab) {
    if (!tab) return;
    if (tab.id === S.tabId && tab.file === S.file) { renderTabs(); return; }
    const cur = currentTab();
    if (cur && cur !== tab) saveTabState(cur);
    stopCine();
    S.tabId = tab.id;
    tab.used = Date.now();
    S.calibration = tab.snap && tab.snap.calibration ? tab.snap.calibration.slice() : null;
    if (tab.file) {
      S.file = tab.file;
      S.frame = tab.snap ? tab.snap.frame : 0;
      History.reset();
      if (S.file.kind === 'dicom') await renderDicom({ frame: S.frame }, { newFile: true });
      else if (S.file.kind === 'image') await renderImage(true);
      else viewer.setSource(null);
      buildWindowMenus(); window.I18n.apply($('wlMenu')); refreshPanels(); syncMenuState(); updateFrameBar();
      await restoreTabState(tab);
      tree.select(tab.path); updateSeriesFromTree(tab.path);
      renderTabs();
    } else {
      await openFile(tab.path, { tab });   // released earlier to save memory → decode again
      await restoreTabState(tab);
    }
  }
  function closeTab(tab) {
    const i = S.tabs.indexOf(tab);
    if (i < 0) return;
    S.tabs.splice(i, 1);
    const wasActive = tab.id === S.tabId;
    releaseFile(tab.file);
    tab.file = null;
    if (!wasActive) { renderTabs(); return; }
    const next = S.tabs[Math.min(i, S.tabs.length - 1)];
    if (next) { S.tabId = 0; S.file = null; activateTab(next); }
    else clearViewer();
  }
  function trimRetained() {
    const retained = S.tabs.filter((x) => x.file && x.id !== S.tabId).sort((p, q) => p.used - q.used);
    while (retained.length > RETAIN_MAX - 1) { const old = retained.shift(); saveTabState(old); releaseFile(old.file); old.file = null; }
  }
  function renderTabs() {
    const scroll = $('tabScroll');
    scroll.innerHTML = '';
    document.body.classList.toggle('has-tabs', S.tabs.length > 0);
    for (const tab of S.tabs) {
      const el = document.createElement('div');
      el.className = `file-tab${tab.id === S.tabId ? ' active' : ''}`;
      el.dataset.id = tab.id;
      el.title = tab.path;
      const isDicom = !tab.file || tab.file.kind !== 'image';
      el.innerHTML = `<span class="tab-icon">${window.Icons.svg(isDicom ? 'file' : 'image')}</span><span class="tab-name">${esc(tab.name)}</span><span class="tab-close" title="${esc(t('tabs.close'))}">×</span>`;
      el.addEventListener('click', (e) => { if (e.target.closest('.tab-close')) closeTab(tab); else activateTab(tab); });
      el.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); closeTab(tab); } });
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); showContextMenu($('ctxTab'), e.clientX, e.clientY, { tab }); });
      scroll.append(el);
    }
    updateTabOverflow();
    if (window.Layout && window.Layout.count > 1) { for (const tab of S.tabs) if (tab.id !== S.tabId && tab.file && !tab.snap) saveTabState(tab); window.Layout.refresh(); }
    const active = scroll.querySelector('.file-tab.active');
    if (active) {   // keep the active tab in view (the strip is overflow:hidden, so scroll it ourselves)
      const left = active.offsetLeft, right = left + active.offsetWidth;
      if (left < scroll.scrollLeft) scroll.scrollLeft = Math.max(0, left - 8);
      else if (right > scroll.scrollLeft + scroll.clientWidth) scroll.scrollLeft = right - scroll.clientWidth + 8;
    }
  }
  function updateTabOverflow() {
    const scroll = $('tabScroll');
    $('tabBar').classList.toggle('overflow', scroll.scrollWidth > scroll.clientWidth + 1);
  }
  function scrollTabs(dir) { $('tabScroll').scrollBy({ left: dir * 220, behavior: 'smooth' }); }
  function stepTab(delta) {
    if (S.tabs.length < 2) return;
    const i = S.tabs.findIndex((x) => x.id === S.tabId);
    activateTab(S.tabs[(i + delta + S.tabs.length) % S.tabs.length]);
  }

  /* ══════════════ DICOM rendering ══════════════ */
  async function renderDicom(opts = {}, { newFile = false } = {}) {
    const f = S.file;
    if (!f || f.kind !== 'dicom') return;
    const img = f.image;
    if (Number.isFinite(opts.frame)) S.frame = Math.max(0, Math.min(img.frames - 1, opts.frame));
    const token = ++S.renderToken;
    const r = await img.render({ ...opts, frame: S.frame });
    if (token !== S.renderToken || S.file !== f) return;
    const fused = await fuse(img, r);
    if (token !== S.renderToken || S.file !== f) return;
    if (fused) r.rgba = fused;
    let c = S.frameCanvas;
    if (!c || c.width !== r.width || c.height !== r.height || c === (f.bitmapCanvas || null)) { c = document.createElement('canvas'); c.width = r.width; c.height = r.height; }
    const x = c.getContext('2d');
    const id = x.createImageData(r.width, r.height);
    id.data.set(r.rgba);
    x.putImageData(id, 0, 0);
    S.frameCanvas = c;
    const fi = img.frameInfo(S.frame);
    const fileSp = fi.pixelSpacing;
    const sp = spacing();
    const aspect = (fileSp || sp) ? (fileSp || sp)[0] / (fileSp || sp)[1] : (img.geometry.aspect || 1);
    viewer.setSource({ canvas: c, width: r.width, height: r.height, spacing: sp, aspect }, { keepView: !newFile });
    updatePresetSelect();
    updateCorners();
    updateStatus();
    scheduleHistogram();
    relabelAnnotations();
    window.Layout.onActiveChanged();
    if (opts.wc !== undefined || opts.ww !== undefined || opts.voiLut !== undefined || opts.resetWindow || opts.colormap || opts.voiFunction || opts.invert !== undefined) { syncMenuState(); if (!opts._drag && !newFile) History.push(); }
  }

  function applyPresetValue(value) {
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    if (!img) return;
    if (value === 'auto') { const a = img.autoWindow(); if (a) renderDicom({ wc: a.wc, ww: a.ww, voiLut: -1 }); }
    else if (value.startsWith('file:')) { const w = img.windowsFor(S.frame)[+value.slice(5)]; if (w) renderDicom({ wc: w.wc, ww: w.ww, voiLut: -1 }); }
    else if (value.startsWith('preset:')) { const p = presetsFor(img).find((x) => x.id === value.slice(7)); if (p) renderDicom({ wc: p.wc, ww: p.ww, voiLut: -1 }); }
    else if (value.startsWith('lut:')) renderDicom({ voiLut: +value.slice(4) });
  }

  /* W/L drag: the sensitivity follows the value range of the frame. */
  function onWlDrag({ dx, dy }) {
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    if (!img || !img.gray) return;
    const st = img.state;
    const range = img.range ? img.range.max - img.range.min : 256;
    const k = Math.max(range > 2 ? 1 : 0.01, range / 1024);
    const ww = Math.max(1, (st.ww || 1) + dx * k);
    const wc = (st.wc || 0) + dy * k;
    renderDicom({ ww, wc, voiLut: -1, _drag: true });
  }

  /* ══════════════ Frames / cine ══════════════ */
  function frameCount() {
    if (!S.file) return 1;
    if (S.file.kind === 'dicom') return S.file.image.frames;
    return S.file.pages || 1;
  }
  async function setFrame(i) {
    const n = frameCount();
    if (n <= 1) return;
    i = Math.max(0, Math.min(n - 1, i));
    if (i === S.frame) return;
    if (S.file.kind === 'image') {   // multi-page TIFF: decode the page on demand
      const f = S.file;
      S.frame = i;
      const { canvas } = await decodeImageCanvas(f.bytes, f.ext, i);
      if (S.file !== f) return;
      f.bitmapCanvas = canvas;
      await renderImage(false);
      renderInfo();
    } else renderDicom({ frame: i });
    updateFrameBar();
  }
  function stepFrame(d) {
    const n = frameCount();
    if (n > 1) {
      let i = S.frame + d;
      if (i < 0) i = $('loopCheck').checked ? n - 1 : 0;
      if (i >= n) i = $('loopCheck').checked ? 0 : n - 1;
      setFrame(i);
    } else if (S.series.files.length > 1) stepSeries(d);
  }
  function updateFrameBar() {
    const n = frameCount();
    $('frameSlider').max = String(Math.max(0, n - 1));
    $('frameSlider').value = String(S.frame);
    $('frameLabel').textContent = `${S.frame + 1} / ${n}`;
  }
  const videoOf = () => (S.file && S.file.kind === 'dicom' && S.file.image.video) || null;
  async function startVideo() {
    const v = videoOf();
    const f = S.file;
    const p = await v.player();
    if (S.file !== f) return;
    p.video.playbackRate = Math.max(0.1, Math.min(16, (S.fps || v.fps) / v.fps));
    S.cine = { video: p };
    syncMenuState();
    let busy = false;
    const from = S.frame >= frameCount() - 1 ? 0 : S.frame;
    await p.play(async (i, ended) => {
      if (S.file !== f) { p.pause(); return; }
      if (ended) {
        if ($('loopCheck').checked && S.cine && S.cine.video === p) { await p.stop(); S.frame = 0; startVideo(); return; }
        S.cine = null; syncMenuState();
      }
      if (busy || i === S.frame) return;
      busy = true;
      try { S.frame = i; await renderDicom({ frame: i }); updateFrameBar(); } finally { busy = false; }
    }, from);
  }
  function startCine() {
    if (S.cine) return;
    if (videoOf()) { startVideo().catch((err) => { S.cine = null; syncMenuState(); showError(err); }); return; }
    if (frameCount() <= 1 && S.series.files.length <= 1) return;
    stopCine();
    S.cine = setInterval(() => {
      const n = frameCount();
      if (n > 1) {
        let i = S.frame + 1;
        if (i >= n) { if (!$('loopCheck').checked) { stopCine(); return; } i = 0; }
        setFrame(i);
      } else {
        const idx = S.series.index + 1;
        if (idx >= S.series.files.length) { if (!$('loopCheck').checked) { stopCine(); return; } openSeriesIndex(0); } else openSeriesIndex(idx);
      }
    }, 1000 / S.fps);
    syncMenuState();
  }
  function stopCine() {
    if (!S.cine) return;
    if (S.cine.video) { const i = S.cine.video.pause(); S.cine = null; if (Number.isFinite(i) && i !== S.frame) setFrame(i); }
    else { clearInterval(S.cine); S.cine = null; }
    syncMenuState();
  }
  /** Stop: halt the cine and go back to the first frame (or the first image of the series). */
  async function cineStop() {
    const was = S.cine;
    if (was && was.video) { S.cine = null; await was.video.stop(); }
    else stopCine();
    syncMenuState();
    if (frameCount() > 1) { if (S.frame !== 0) await setFrame(0); else if (was && was.video) await renderDicom({ frame: 0 }); }
    else if (S.series.files.length > 1 && S.series.index !== 0) openSeriesIndex(0);
  }

  /** Save the video stream of a DICOM video: H.264 / HEVC as MP4, MPEG-2 as the elementary stream (.m2v). */
  async function extractVideo() {
    const f = S.file;
    if (!f || (f.kind !== 'dicom' && f.kind !== 'dicom-meta')) { toast(t('export.notDicom')); return; }
    Progress.start(t('progress.exporting', { name: f.name }), { cancellable: false });
    let bytes, name, mime;
    try {
      const v = await D.extractVideo(new Uint8Array(await P.readFile(f.path)));
      if (v.codec === 'mpeg2') { bytes = v.stream; name = `${stem()}.m2v`; mime = 'video/mpeg'; }
      else { bytes = window.DicomVideo.toMp4(v.stream, { codec: v.codec, fps: v.fps, width: v.width, height: v.height }); name = `${stem()}.mp4`; mime = 'video/mp4'; }
    } catch (err) { await Progress.finish(); toast(err.message || String(err), true); return; }
    const saved = await P.saveFile({ name, bytes, mime, filters: [{ name: name.split('.').pop().toUpperCase(), extensions: [name.split('.').pop()] }] });
    await Progress.finish();
    if (saved) toast(t('export.done', { name: P.basename(saved) }));
  }

  /* ══════════════ Series (files of the folder) ══════════════ */
  function updateSeriesFromTree(path) {
    const dir = P.dirname(path);
    if (S.series.sorted && (S.series.dir === dir || S.series.dicomdir) && S.series.files.includes(path)) { S.series.index = S.series.files.indexOf(path); updateSeriesBar(); return; }
    const listed = tree.files();
    const files = listed.includes(path) ? listed : [];
    S.series = { files, index: files.indexOf(path), dir, sorted: false, groups: [] };
    updateSeriesBar();
    renderSeriesPanel();
  }
  function updateSeriesBar() {
    const n = S.series.files.length;
    $('seriesSlider').max = String(Math.max(0, n - 1));
    $('seriesSlider').value = String(Math.max(0, S.series.index));
    $('seriesLabel').textContent = n ? `${S.series.index + 1} / ${n}` : '';
    document.body.classList.toggle('has-series', n > 1);
  }
  function stepSeries(d) {
    const n = S.series.files.length;
    if (n < 2) return;
    let i = S.series.index + d;
    if (i < 0 || i >= n) { if (!$('loopCheck').checked) return; i = (i + n) % n; }
    openSeriesIndex(i);
  }
  let seriesOpenTimer = null;
  function openSeriesIndex(i) {
    const p = S.series.files[i];
    if (!p) return;
    S.series.index = i;
    updateSeriesBar();
    clearTimeout(seriesOpenTimer);
    seriesOpenTimer = setTimeout(() => openFileKeepView(p), S.cine ? 0 : 30);
  }
  async function openFileKeepView(path) {
    // Same as openFile but keeps zoom / pan / window when the image geometry matches (stack browsing).
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    const keep = img ? { wc: img.state.wc, ww: img.state.ww, invert: img.state.invert, colormap: img.state.colormap, custom: img.isWindowCustom(), voiFunction: img.state.voiFunction, view: { ...viewer.view } } : null;
    S.keepNext = keep;
    await openFile(path, { replace: true });
    S.keepNext = null;
  }

  async function scanSeries() {
    const dir = tree.root();
    if (!dir) return;
    const names = tree.files();
    if (!names.length) { toast(t('series.none')); return; }
    Progress.start(t('series.load'));
    const items = [];
    try {
      for (let i = 0; i < names.length; i++) {
        if (Progress.cancelled) break;
        const p = names[i];
        try {
          const head = new Uint8Array(await P.readFileHead(p, 4096));
          if (!D.isDicom(head)) continue;
          const bytes = new Uint8Array(await P.readFile(p));
          const h = await D.scanHeader(bytes);
          items.push({ path: p, name: P.basename(p), ...h });
        } catch { /* not a DICOM */ }
        Progress.update(i + 1, names.length, P.basename(p));
      }
    } finally { Progress.finish(); }
    if (!items.length) { toast(t('series.none')); return; }
    const groups = new Map();
    for (const it of items) {
      const key = it.seriesUid || `(${it.studyUid || '?'})`;
      if (!groups.has(key)) groups.set(key, { key, items: [], modality: it.modality, description: it.seriesDescription, number: it.seriesNumber, patient: it.patientName, studyDescription: it.studyDescription, studyDate: it.studyDate });
      groups.get(key).items.push(it);
    }
    const list = [...groups.values()].map((g) => ({ ...g, items: D.sortSeries(g.items) }))
      .sort((a, b) => (Number.isFinite(a.number) && Number.isFinite(b.number) ? a.number - b.number : 0));
    S.series = { files: [], index: -1, dir, sorted: true, groups: list };
    const current = S.file ? list.find((g) => g.items.some((it) => it.path === S.file.path)) : null;
    selectSeriesGroup(current || list[0], !current);
    renderSeriesPanel();
    toast(t('msg.sortedSeries', { files: items.length, series: list.length }));
    document.querySelector('.tab[data-tab="series"]').click();
  }

  function selectSeriesGroup(g, openFirst) {
    S.series.files = g.items.map((it) => it.path);
    S.series.index = S.file ? S.series.files.indexOf(S.file.path) : -1;
    S.series.current = g;
    updateSeriesBar();
    if (openFirst && S.series.files.length) openSeriesIndex(0);
    renderSeriesPanel();
  }

  function renderSeriesPanel() {
    const el = $('seriesList');
    el.innerHTML = '';
    if (!S.series.sorted) {
      const div = document.createElement('div'); div.className = 'series-note';
      div.textContent = S.series.files.length ? `${t('series.unsorted')} — ${t('series.files', { n: S.series.files.length })}` : t('series.none');
      el.append(div);
      return;
    }
    for (const g of S.series.groups) {
      const card = document.createElement('div');
      card.className = `series-card${g === S.series.current ? ' active' : ''}`;
      card.innerHTML = `<canvas class="series-thumb" width="64" height="64"></canvas><div class="series-title">${esc(g.modality || '?')} · ${esc(g.description || (g.number != null ? `Series ${g.number}` : g.key))}</div>
        <div class="series-sub">${esc(g.patient || '')}${g.studyDate ? ' · ' + esc(g.studyDate) : ''} · ${t('series.files', { n: g.items.length })}</div>`;
      card.addEventListener('click', () => selectSeriesGroup(g, true));
      el.append(card);
      seriesThumb(g, card.querySelector('canvas'));
    }
  }

  /* ══════════════ Undo / redo (measurements, view transform, window / colour) ══════════════ */
  const History = {
    stack: [], index: -1, restoring: false, MAX: 100,
    snapshot() {
      const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
      const st = img ? img.state : null;
      const vv = viewer.view;
      return {
        annotations: JSON.parse(JSON.stringify(viewer.annotations.map((x) => ({ ...x, selected: false })))),
        view: { rotation: vv.rotation, flipH: vv.flipH, flipV: vv.flipV },
        win: st ? { wc: st.wc, ww: st.ww, voiLut: st.voiLut, voiFunction: st.voiFunction, invert: st.invert, colormap: st.colormap, custom: img.isWindowCustom() } : null,
        imageInvert: !img && S.file ? !!opt('invert') : undefined,
      };
    },
    reset() { this.stack = []; this.index = -1; if (S.file) this.push(); this.sync(); },
    push() {
      if (this.restoring || !S.file) return;
      const snap = this.snapshot();
      const key = JSON.stringify(snap);
      if (this.index >= 0 && JSON.stringify(this.stack[this.index]) === key) return;
      this.stack = this.stack.slice(0, this.index + 1);
      this.stack.push(snap);
      if (this.stack.length > this.MAX) this.stack.shift();
      this.index = this.stack.length - 1;
      this.sync();
    },
    canUndo() { return this.index > 0; },
    canRedo() { return this.index < this.stack.length - 1; },
    async undo() { if (this.canUndo()) { this.index--; await this.apply(this.stack[this.index]); } },
    async redo() { if (this.canRedo()) { this.index++; await this.apply(this.stack[this.index]); } },
    async apply(snap) {
      this.restoring = true;
      try {
        viewer.annotations = JSON.parse(JSON.stringify(snap.annotations));
        Object.assign(viewer.view, snap.view);
        viewer.redraw();
        const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
        if (img && snap.win) {
          const w = snap.win;
          const o = { invert: w.invert, colormap: w.colormap, voiFunction: w.voiFunction };
          if (w.voiLut >= 0) o.voiLut = w.voiLut;
          else if (w.custom && Number.isFinite(w.wc)) { o.wc = w.wc; o.ww = w.ww; }
          else o.resetWindow = true;
          await renderDicom(o);
          if (w.voiLut < 0 && !w.custom) await renderDicom({ invert: w.invert, colormap: w.colormap, voiFunction: w.voiFunction });
        } else if (!img && S.file && snap.imageInvert !== undefined && snap.imageInvert !== !!opt('invert')) {
          await setOpt({ invert: snap.imageInvert }); await renderImage();
        }
        relabelAnnotations(); updateCorners(); updateStatus(); syncMenuState();
      } finally { this.restoring = false; this.sync(); }
    },
    sync() {
      const u = $('undoBtn'), r = $('redoBtn');
      if (u) u.disabled = !this.canUndo();
      if (r) r.disabled = !this.canRedo();
    },
  };

  /* ══════════════ Viewer events ══════════════ */
  function onViewerEvent(ev, payload) {
    if (props) props.refresh();
    switch (ev) {
      case 'view': updateCorners(); updateStatus(); break;
      case 'scalebar': setOpt({ scaleBarPos: payload }); break;
      case 'wl': onWlDrag(payload); break;
      case 'stack': stepFrame(payload.delta); break;
      case 'hover': S.hover = payload; updateProbe(); break;
      case 'measure': labelAnnotation(payload.annotation); viewer.redraw(); if (payload.done) History.push(); break;
      case 'wlend': History.push(); break;
      case 'arrowtext': promptText(t('msg.arrowPrompt')).then((text) => { payload.annotation.text = text || ''; viewer.redraw(); History.push(); }); break;
      case 'text': promptText(t('msg.textPrompt')).then((text) => { if (text) { viewer.annotations.push({ type: 'text', points: [{ x: payload.x, y: payload.y }], text }); viewer.redraw(); History.push(); } }); break;
      case 'context': showContextMenu($('ctxViewer'), payload.clientX, payload.clientY); break;
      default: break;
    }
  }

  /* Geometry of the shown slice, for the other viewports' sync and reference lines. */
  function activeGeometry() {
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    return img ? window.Layout.geometryOf(img, S.frame) : null;
  }

  function fileSpacing() {
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    return img ? img.frameInfo(S.frame).pixelSpacing : null;
  }
  function spacing() {
    if (S.calibration && S.calibration[0] > 0 && S.calibration[1] > 0) return S.calibration;
    return fileSpacing();
  }
  function realUnit() {
    return opt('measureUnit') === 'in' ? 'in' : 'cm';
  }
  function displayUnit() {
    return spacing() ? realUnit() : 'px';
  }
  function unitLabel(u) { return u === 'in' ? 'Inch' : u; }
  function formatLength(mm, px) {
    const u = displayUnit();
    if (u === 'px' || mm == null) return `${fmt(px, 1)} px`;
    const k = UNIT_FROM_MM[u] || 1;
    const digits = u === 'in' ? 3 : 2;
    return `${fmt(mm * k, digits)} ${unitLabel(u)}`;
  }
  function formatArea(mm2, px2) {
    const u = displayUnit();
    if (u === 'px' || mm2 == null) return `${fmt(px2, 0)} px²`;
    const k = UNIT_FROM_MM[u] || 1;
    const digits = u === 'in' ? 3 : 1;
    return `${fmt(mm2 * k * k, digits)} ${unitLabel(u)}²`;
  }
  function labelAnnotation(a) {
    const sp = spacing();
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    const pts = a.points;
    if (a.type === 'length' && pts.length >= 2) {
      const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
      const px = Math.hypot(dx, dy);
      const mm = sp ? Math.hypot(dx * sp[1], dy * sp[0]) : null;
      a.label = formatLength(mm, px);
    } else if (a.type === 'angle' && pts.length === 3) {
      const sx = sp ? sp[1] : 1, sy = sp ? sp[0] : 1;
      const v1 = [(pts[0].x - pts[1].x) * sx, (pts[0].y - pts[1].y) * sy], v2 = [(pts[2].x - pts[1].x) * sx, (pts[2].y - pts[1].y) * sy];
      const dot = v1[0] * v2[0] + v1[1] * v2[1];
      const n = Math.hypot(...v1) * Math.hypot(...v2) || 1;
      a.label = `${fmt(Math.acos(Math.max(-1, Math.min(1, dot / n))) * 180 / Math.PI, 1)}°`;
    } else if (a.type === 'cobb' && pts.length >= 4) {
      const sx = sp ? sp[1] : 1, sy = sp ? sp[0] : 1;
      const dir = (p, q) => Math.atan2((q.y - p.y) * sy, (q.x - p.x) * sx);
      let d = Math.abs(dir(pts[0], pts[1]) - dir(pts[2], pts[3])) * 180 / Math.PI % 180;
      if (d > 90) d = 180 - d;
      a.label = `Cobb ${fmt(d, 1)}°`;
    } else if (a.type === 'point' && pts.length) {
      const v = img ? img.valueAt(pts[0].x, pts[0].y, S.frame) : null;
      const val = v ? (v.value !== undefined ? `${fmt(v.value, 1)}${v.units ? ' ' + v.units : ''}` : `RGB ${v.r}, ${v.g}, ${v.b}`) : '';
      a.label = `(${Math.floor(pts[0].x)}, ${Math.floor(pts[0].y)})${val ? ' ' + val : ''}`;
    } else if ((a.type === 'polygon' || a.type === 'freehand') && pts.length >= 3) {
      const st = polygonStats(img, pts, S.frame);
      const mm2 = sp ? st.areaPx * sp[0] * sp[1] : null;
      const perimPx = pts.reduce((sum, p, i) => { const q = pts[(i + 1) % pts.length]; return sum + Math.hypot((q.x - p.x) * (sp ? sp[1] : 1), (q.y - p.y) * (sp ? sp[0] : 1)); }, 0);
      const area = formatArea(mm2, st.areaPx);
      const perim = formatLength(sp ? perimPx : null, perimPx);
      a.label = st.n ? `${t('roi.area', { a: area })} · ${t('roi.perimeter', { p: perim })}\n${t('roi.stats', { n: st.n, mean: fmt(st.mean, 1), sd: fmt(st.std, 1), min: fmt(st.min, 0), max: fmt(st.max, 0) })}${st.units ? ' ' + st.units : ''}` : `${t('roi.area', { a: area })} · ${t('roi.perimeter', { p: perim })}`;
    } else if (a.type === 'rect' || a.type === 'ellipse') {
      const region = { x: Math.min(pts[0].x, pts[1].x), y: Math.min(pts[0].y, pts[1].y), w: Math.abs(pts[1].x - pts[0].x), h: Math.abs(pts[1].y - pts[0].y), shape: a.type };
      const st = img ? img.stats(region, S.frame) : null;
      const px2 = region.w * region.h * (a.type === 'ellipse' ? Math.PI / 4 : 1);
      const mm2 = sp ? px2 * sp[0] * sp[1] : (st && st.areaMm2 != null ? st.areaMm2 : null);
      const area = formatArea(mm2, px2);
      if (st && st.n) a.label = `${t('roi.area', { a: area })}\n${t('roi.stats', { n: st.n, mean: fmt(st.mean, 1), sd: fmt(st.std, 1), min: fmt(st.min, 0), max: fmt(st.max, 0) })}${st.units ? ' ' + st.units : ''}`;
      else a.label = t('roi.area', { a: area });
    }
  }

  function applyViewerSpacing() {
    if (!viewer.source) return;
    viewer.setSpacing(spacing());
    relabelAnnotations();
    updateCorners();
  }
  function lastLengthAnnotation() {
    const list = viewer.annotations || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i];
      if (a && a.type === 'length' && a.points && a.points.length >= 2) return a;
    }
    return null;
  }
  function parseRealLength(text) {
    const m = String(text || '').trim().match(/^([+-]?\d+(?:[.,]\d+)?)\s*(mm|cm|m|in|inch|inches)?$/i);
    if (!m) return null;
    const n = parseFloat(m[1].replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return null;
    const raw = (m[2] || realUnit()).toLowerCase();
    const k = UNIT_TO_MM[raw];
    if (!k) return null;
    return n * k;
  }
  async function calibrateFromLength() {
    const a = lastLengthAnnotation();
    if (!a) { toast(t('msg.calibrateNeedLine'), true); return; }
    const dx = a.points[1].x - a.points[0].x, dy = a.points[1].y - a.points[0].y;
    const px = Math.hypot(dx, dy);
    if (px < 1) { toast(t('msg.calibrateNeedLine'), true); return; }
    const text = await promptText(t('msg.calibratePrompt'), realUnit() === 'in' ? '1 in' : '1 cm');
    if (!text) return;
    const mm = parseRealLength(text);
    if (mm == null) { toast(t('msg.calibrateInvalid'), true); return; }
    const mmPerPx = mm / px;
    S.calibration = [mmPerPx, mmPerPx];
    applyViewerSpacing();
    toast(t('msg.calibrated', { mm: fmt(mmPerPx, 4) }));
  }
  function clearCalibration() {
    if (!S.calibration) { toast(t('msg.calibrateNone')); return; }
    S.calibration = null;
    applyViewerSpacing();
    toast(t('msg.calibrateCleared'));
  }
  function relabelAnnotations() {
    viewer.measureUnit = displayUnit();
    for (const a of viewer.annotations) labelAnnotation(a);
    viewer.redraw();
  }

  function updateProbe() {
    const h = S.hover;
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    let text = '';
    if (h && S.file) {
      const x = Math.floor(h.x), y = Math.floor(h.y);
      let v = '';
      if (img) {
        const p = img.valueAt(x, y, S.frame);
        if (p) {
          if (p.r !== undefined && p.raw === undefined) v = `RGB ${p.r}, ${p.g}, ${p.b}`;
          else { v = `${fmt(p.value, 1)}${p.units ? ' ' + p.units : ''}`; if (p.raw !== p.value) v += ` (raw ${p.raw})`; if (p.r !== undefined) v += ` RGB ${p.r},${p.g},${p.b}`; if (p.padding) v += ' [pad]'; }
        }
      } else if (S.frameCanvas) {
        const d = S.frameCanvas.getContext('2d').getImageData(x, y, 1, 1).data;
        v = `RGB ${d[0]}, ${d[1]}, ${d[2]}`;
      }
      text = t('status.probe', { x, y, v });
    }
    $('statusProbe').textContent = text;
    $('cornerBR').querySelector('.probe') && ($('cornerBR').querySelector('.probe').textContent = text);
  }

  /* ══════════════ Corners / markers / status ══════════════ */
  function updateCorners() {
    const show = !!opt('cornerInfo') && !!S.file;
    for (const id of ['cornerTL', 'cornerTR', 'cornerBL', 'cornerBR']) $(id).style.display = show ? '' : 'none';
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    const m = img ? img.meta : null;
    const v = viewer.viewState();
    const lines = (arr) => arr.filter(Boolean).map((s) => `<div>${esc(s)}</div>`).join('');
    if (S.file && img) {
      const st = img.state;
      const fi = img.frameInfo(S.frame);
      $('cornerTL').innerHTML = lines([m.patientName, m.patientId, [m.patientSex, m.patientAge, m.patientBirthDate].filter(Boolean).join(' · ')]);
      $('cornerTR').innerHTML = lines([[m.modality, m.studyDate, m.studyTime].filter(Boolean).join(' · '), m.studyDescription, m.seriesDescription, m.institution, m.manufacturer]);
      const wl = img.gray && !img.palette ? (st.voiLut >= 0 ? `VOI LUT: ${img.voiLuts[st.voiLut].label}` : `W ${fmt(st.ww)} / L ${fmt(st.wc)}${st.voiFunction !== 'LINEAR' ? ' ' + st.voiFunction : ''}`) : '';
      $('cornerBL').innerHTML = lines([
        wl, st.colormap !== 'gray' ? t(`cm.${st.colormap}`) : '', st.invert ? t('view.invert') : '',
        img.frames > 1 ? t('status.frame', { n: S.frame + 1, total: img.frames }) : '',
        `${t('status.zoom', { z: Math.round(v.scale * 100) })}${v.rotation ? ` · ${v.rotation}°` : ''}${v.flipH ? ' · ⇋' : ''}${v.flipV ? ' · ⇅' : ''}`,
      ]);
      $('cornerBR').innerHTML = lines([
        `${img.width} × ${img.height}${spacing() ? ` · ${fmt(spacing()[1], 3)} × ${fmt(spacing()[0], 3)} mm${S.calibration ? ` (${t('meta.calibrated')})` : ''}` : ''}`,
        Number.isFinite(fi.sliceLocation) ? `SL ${fmt(fi.sliceLocation, 2)}${Number.isFinite(fi.sliceThickness) ? ` · T ${fmt(fi.sliceThickness, 2)} mm` : ''}` : '',
        m.instanceNumber ? `#${m.instanceNumber}${m.seriesNumber ? ` (S${m.seriesNumber})` : ''}` : '',
      ]) + '<div class="probe"></div>';
    } else if (S.file) {
      $('cornerTL').innerHTML = lines([S.file.name]);
      $('cornerTR').innerHTML = '';
      $('cornerBL').innerHTML = lines([`${t('status.zoom', { z: Math.round(v.scale * 100) })}${v.rotation ? ` · ${v.rotation}°` : ''}`]);
      $('cornerBR').innerHTML = lines([
        S.frameCanvas ? `${S.frameCanvas.width} × ${S.frameCanvas.height}` : '',
        S.calibration ? `${fmt(S.calibration[1], 3)} × ${fmt(S.calibration[0], 3)} mm (${t('meta.calibrated')})` : '',
      ]) + '<div class="probe"></div>';
    } else {
      for (const id of ['cornerTL', 'cornerTR', 'cornerBL', 'cornerBR']) $(id).innerHTML = '';
    }
    updateMarkers();
    updateProbe();
  }

  function updateMarkers() {
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    const show = !!opt('markers') && img && S.frameCanvas;
    const els = { top: $('markerTop'), bottom: $('markerBottom'), left: $('markerLeft'), right: $('markerRight') };
    if (!show) { for (const e of Object.values(els)) e.textContent = ''; return; }
    // Screen direction → image direction (undo rotation / flip / zoom), then ask the geometry for the anatomical label.
    const c0 = viewer.clientToImage(100, 100), cx = viewer.clientToImage(101, 100), cy = viewer.clientToImage(100, 101);
    const dirX = { x: cx.x - c0.x, y: cx.y - c0.y }, dirY = { x: cy.x - c0.x, y: cy.y - c0.y };
    const norm = (d) => { const n = Math.hypot(d.x, d.y) || 1; return [d.x / n, d.y / n]; };
    const [rx, ry] = norm(dirX), [bx, by] = norm(dirY);
    els.right.textContent = img.dirLabel(rx, ry, S.frame) || '';
    els.left.textContent = img.dirLabel(-rx, -ry, S.frame) || '';
    els.bottom.textContent = img.dirLabel(bx, by, S.frame) || '';
    els.top.textContent = img.dirLabel(-bx, -by, S.frame) || '';
  }

  function updateStatus() {
    updateTitle();
    if (props) props.refresh();
    const f = S.file;
    const img = f && f.kind === 'dicom' ? f.image : null;
    $('statusPath').textContent = f ? f.path : t('status.ready');
    $('statusPath').title = f ? f.path : '';
    $('statusPatient').textContent = img ? [img.meta.patientName, img.meta.patientId, img.meta.modality, img.meta.studyDate].filter(Boolean).join(' · ') : '';
    $('statusSize').textContent = f && S.frameCanvas ? `${S.frameCanvas.width} × ${S.frameCanvas.height}${f.size ? ` · ${fmtSize(f.size)}` : ''}${img && img.frames > 1 ? ` · ${t('status.frame', { n: S.frame + 1, total: img.frames })}` : ''}` : '';
    $('statusWL').textContent = img && img.gray && !img.palette ? t('status.wl', { ww: fmt(img.state.ww), wc: fmt(img.state.wc) }) : '';
    const v = viewer.viewState();
    $('statusZoom').textContent = f ? t('status.zoom', { z: Math.round(v.scale * 100) }) : '';
    $('zoomBadge').textContent = f ? `${Math.round(v.scale * 100)}%` : '';
    $('zoomLabel').textContent = `${Math.round(v.scale * 100)}%`;
    $('zoomBadge').style.display = f ? '' : 'none';
    $('dropHint').style.display = f ? 'none' : '';
    const doc = !!(f && f.kind === 'dicom-meta');
    $('docView').hidden = !doc;
    document.body.classList.toggle('has-doc', doc);
    if (doc && S.docFor !== f) showDocView();
    if (f && f.warning) $('statusPath').textContent += ` — ${t('msg.warning', { text: f.warning })}`;
  }

  function setStatus(key) { $('statusPath').textContent = t(key); }
  /* The window may not shrink below the width where toolbar or menu-bar buttons would be clipped. */
  // Measured at their natural width (max-content), not at the current window width: fields such as the
  // preset and colour-map lists would already have shrunk in a narrow window and give too small a minimum.
  function naturalWidth(el) {
    const saved = el.getAttribute('style');
    el.style.width = 'max-content'; el.style.minWidth = 'max-content'; el.style.overflow = 'visible'; el.style.flex = 'none';
    const w = el.getBoundingClientRect().width;
    if (saved == null) el.removeAttribute('style'); else el.setAttribute('style', saved);
    return w;
  }
  let minSizeSent = 0;
  function applyMinWindowSize() {
    if (!P.isDesktop) return;
    const w = Math.ceil(Math.max(naturalWidth($('toolbar')), naturalWidth($('menubar')), 900)) + 2;
    if (w === minSizeSent) return;
    minSizeSent = w;
    window.desktopAPI.setMinSize(w, 600);
  }
  /* Window / tab title: program name and version, then the open file and its patient / modality. */
  function updateTitle() {
    const info = S.appInfo || {};
    const parts = [`${info.name || 'MyDCMViewer'} ${info.version ? 'v' + info.version : ''}`.trim()];
    const f = S.file;
    if (f) {
      const img = f.kind === 'dicom' ? f.image : null;
      const extra = img ? [img.meta.patientName, img.meta.modality, img.frames > 1 ? t('status.frame', { n: S.frame + 1, total: img.frames }) : ''].filter(Boolean).join(' · ') : '';
      parts.push(`${f.name}${extra ? ` (${extra})` : ''}`);
    }
    document.title = parts.join(' — ');
    P.setTitle(document.title);
  }
  function showLoading(text) { $('loading').classList.add('show'); $('loadingText').textContent = text || t('status.loading'); }
  function hideLoading() { $('loading').classList.remove('show'); }

  /* ══════════════ Panels: info / tags / histogram ══════════════ */
  function refreshPanels() { renderInfo(); renderTags(); scheduleHistogram(); renderSeriesPanel(); }

  function renderInfo() {
    const el = $('panel-info');
    el.innerHTML = '';
    const f = S.file;
    if (!f) { const d = document.createElement('div'); d.className = 'info-empty'; d.textContent = t('sidebar.noFile'); el.append(d); return; }
    const dl = document.createElement('dl');
    dl.className = 'info-list';
    const add = (label, value) => { if (value === undefined || value === null || value === '') return; const dt = document.createElement('dt'); dt.textContent = label; const dd = document.createElement('dd'); dd.textContent = String(value); dd.title = String(value); dl.append(dt, dd); };
    add(t('meta.fileName'), f.name);
    if (f.size) add(t('meta.fileSize'), fmtSize(f.size));
    if (f.kind === 'dicom' || f.kind === 'dicom-meta') {
      const meta = f.kind === 'dicom' ? f.image.meta : f.meta;
      for (const [k, v] of Object.entries(meta)) if (!/undefined|NaN/.test(String(v))) add(t(`meta.${k}`), v);
      if (f.kind === 'dicom' && f.image.frames > 1) {
        const fi = f.image.frameInfo(S.frame);
        const parts = [t('status.frame', { n: S.frame + 1, total: f.image.frames })];
        if (Number.isFinite(fi.sliceLocation)) parts.push(`SL ${fmt(fi.sliceLocation, 2)}`);
        if (fi.position) parts.push(`IPP ${fi.position.map((x) => fmt(x, 2)).join('\\')}`);
        add(t('meta.frameInfo'), parts.join(' · '));
      }
    } else {
      add(t('meta.format'), (f.ext || '').toUpperCase());
      add(t('meta.dimensions'), `${f.bitmapCanvas.width} × ${f.bitmapCanvas.height}`);
      if (f.pages > 1) add(t('meta.frames'), `${S.frame + 1} / ${f.pages}`);
    }
    el.append(dl);
  }

  function renderTags() {
    const el = $('tagsList');
    el.innerHTML = '';
    const f = S.file;
    const tags = f && (f.kind === 'dicom' ? f.image.tags : f.kind === 'dicom-meta' ? f.tags : null);
    if (!tags) { el.innerHTML = `<div class="info-empty">${esc(t(f ? 'export.notDicom' : 'sidebar.noFile'))}</div>`; return; }
    const q = $('tagSearch').value.trim().toLowerCase();
    const frag = document.createDocumentFragment();
    let n = 0;
    for (const tg of tags) {
      if (q && !(`${tg.tag} ${tg.name} ${tg.vr} ${tg.value}`.toLowerCase().includes(q))) continue;
      n++;
      const row = document.createElement('div');
      row.className = `tag-row${tg.item ? ' item' : ''}`;
      row.style.paddingLeft = `${6 + tg.depth * 12}px`;
      row.innerHTML = `<span class="tag-id">${esc(tg.tag)}</span><span class="tag-name">${esc(tg.name)}</span><span class="tag-vr">${esc(tg.vr)}</span><span class="tag-value" title="${esc(tg.value)}">${esc(tg.value)}</span>`;
      frag.append(row);
    }
    const head = document.createElement('div');
    head.className = 'tags-count';
    head.textContent = t('tags.count', { n });
    el.append(head, frag);
  }

  function scheduleHistogram() { clearTimeout(S.histTimer); S.histTimer = setTimeout(drawHistogram, 120); }
  function drawHistogram() {
    const canvas = $('histCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const css = getComputedStyle(document.body);
    ctx.fillStyle = css.getPropertyValue('--panel-bg').trim() || '#222';
    ctx.fillRect(0, 0, w, h);
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    const info = $('histInfo');
    if (!img || !img.gray || img.palette) { info.textContent = S.file ? t('hist.none') : t('sidebar.noFile'); return; }
    const hist = img.histogram(w, S.frame);
    if (!hist) { info.textContent = ''; return; }
    const counts = hist.counts;
    let max = 0;
    for (let i = 0; i < counts.length; i++) if (counts[i] > max) max = counts[i];
    // log scale so the background peak does not flatten everything else
    const lmax = Math.log(max + 1) || 1;
    ctx.fillStyle = css.getPropertyValue('--accent').trim() || '#38bdf8';
    for (let i = 0; i < counts.length; i++) {
      const bh = Math.log(counts[i] + 1) / lmax * (h - 4);
      ctx.fillRect(i, h - bh, 1, bh);
    }
    const st = img.state;
    if (st.voiLut < 0 && Number.isFinite(st.wc) && Number.isFinite(st.ww)) {
      const toX = (v) => (v - hist.min) / (hist.max - hist.min || 1) * w;
      const x0 = toX(st.wc - st.ww / 2), x1 = toX(st.wc + st.ww / 2);
      ctx.fillStyle = 'rgba(250, 204, 21, 0.18)';
      ctx.fillRect(Math.max(0, x0), 0, Math.min(w, x1) - Math.max(0, x0), h);
      ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0 + 0.5, 0); ctx.lineTo(x0 + 0.5, h); ctx.moveTo(x1 + 0.5, 0); ctx.lineTo(x1 + 0.5, h); ctx.stroke();
    }
    info.textContent = `${t('hist.range', { min: fmt(hist.min), max: fmt(hist.max) })}${hist.units ? ' ' + hist.units : ''} · ${t('hist.window')}`;
  }

  /* ══════════════ Export ══════════════ */
  function currentCanvas() {
    if (!S.file || !S.frameCanvas) return null;
    return viewer.exportCanvas(!!opt('burnAnnotations'));
  }
  function stem() { const n = S.file ? S.file.name : 'image'; const i = n.lastIndexOf('.'); return i > 0 ? n.slice(0, i) : n; }
  function frameSuffix() { const img = S.file && S.file.kind === 'dicom' ? S.file.image : null; return img && img.frames > 1 ? `_${t('export.frameSuffix')}${String(S.frame + 1).padStart(2, '0')}` : ''; }

  async function encodeCanvas(canvas, format, quality = 0.92) {
    const mime = EXPORT_MIME[format];
    if (format === 'png' || format === 'jpeg' || format === 'webp') {
      const blob = await new Promise((r) => canvas.toBlob(r, mime, quality));
      if (!blob) throw new Error(`Cannot encode ${format}`);
      return new Uint8Array(await blob.arrayBuffer());
    }
    const id = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const args = { width: canvas.width, height: canvas.height, rgba: id.data };
    if (format === 'bmp') return E.bmp(args);
    if (format === 'gif') return E.gif(args);
    if (format === 'tiff') { const sp = spacing(); return E.tiff({ ...args, dpi: sp ? 25.4 / sp[1] : 72 }); }
    throw new Error(`Unknown format ${format}`);
  }

  async function exportImage(format) {
    const canvas = currentCanvas();
    if (!canvas) { toast(t('export.noImage')); return; }
    const bytes = await encodeCanvas(canvas, format);
    const name = `${stem()}${frameSuffix()}.${EXPORT_EXT[format]}`;
    const saved = await P.saveFile({ name, bytes, mime: EXPORT_MIME[format], filters: [{ name: format.toUpperCase(), extensions: [EXPORT_EXT[format]] }] });
    if (saved) toast(t('export.done', { name: P.basename(saved) }));
  }

  /* ── Export as any format (imageExport.js): the picture as shown, the raw values for 16-bit / float /
     medical formats, and every frame (or the sorted series) for multi-page and volume formats ── */
  async function exportInput(formatId, scope) {
    const X = window.ImageExport;
    const fmt = X.get(formatId);
    const canvas = currentCanvas();
    if (!canvas) return null;
    const rgba = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const input = { width: canvas.width, height: canvas.height, rgba, name: stem() };
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    if (!img) return input;
    const fi = img.frameInfo(S.frame);
    if (fi.pixelSpacing) input.spacing = fi.pixelSpacing.slice(0, 2);
    if (fi.sliceThickness) input.sliceThickness = fi.sliceThickness;
    const sameSize = canvas.width === img.width && canvas.height === img.height;
    const rawOk = img.gray && !img.palette && sameSize;
    if (rawOk) input.gray = await img.valuesOf(S.frame);
    const many = fmt.kinds.includes('frames') && scope !== 'frame';
    if (!many || !rawOk) return input;
    // every frame of a multi-frame file, or every image of the sorted series (same size)
    if (img.frames > 1) {
      input.frames = [];
      for (let f = 0; f < img.frames; f++) {
        const r = await img.render({ frame: f });
        input.frames.push({ rgba: r.rgba, gray: await img.valuesOf(f) });
        Progress.update(f + 1, img.frames);
      }
      await img.render({ frame: S.frame });
    } else if (S.series.sorted && S.series.files.length > 1 && scope === 'all') {
      input.frames = [];
      for (const p of S.series.files) {
        const im = await D.load(new Uint8Array(await P.readFile(p)));
        if (im.width !== img.width || im.height !== img.height || !im.gray) continue;
        const r = await im.render({ wc: img.state.wc, ww: img.state.ww, voiLut: -1, invert: img.state.invert });
        input.frames.push({ rgba: r.rgba, gray: await im.valuesOf(0) });
      }
    }
    return input;
  }
  async function exportAs(formatId, options = {}, scope = 'auto') {
    const X = window.ImageExport;
    const fmt = X && X.get(formatId);
    if (!fmt) { toast(t('exp.unknown', { id: formatId }), true); return; }
    if (!(await fmt.isAvailable())) { toast(t('exp.unavailable', { name: fmt.label }), true); return; }
    let bytes, name;
    Progress.start(t('exp.working', { name: fmt.label }), { cancellable: false });
    try {
      const input = await exportInput(formatId, scope);
      if (!input) { toast(t('export.noImage')); return; }
      bytes = await X.encode(formatId, input, { ...X.defaults(formatId), ...options });
      const twoFiles = ['analyze', 'mhd'].includes(fmt.id);
      const ext = twoFiles ? 'zip' : fmt.ext;
      name = `${stem()}${input.frames ? '' : frameSuffix()}.${ext}`;
    } finally { Progress.finish(); }
    const saved = await P.saveFile({ name, bytes, mime: fmt.mime, filters: [{ name: fmt.label, extensions: [name.split('.').pop()] }] });
    if (saved) toast(t('export.done', { name: P.basename(saved) }));
  }
  async function openExportAs() {
    const X = window.ImageExport;
    if (!X) return;
    if (!currentCanvas()) { toast(t('export.noImage')); return; }
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    const formats = await Promise.all(X.FORMATS.map(async (f) => ({ id: f.id, label: f.label, ext: f.ext, group: f.group, kinds: f.kinds, options: f.options, notes: f.notes, available: await f.isAvailable() })));
    const many = img ? (img.frames > 1 ? img.frames : S.series.sorted && S.series.files.length > 1 ? S.series.files.length : 0) : 0;
    Dlg.open('exportas', { formats, last: opt('lastExportFormat') || 'png', frames: many, raw: !!(img && img.gray && !img.palette) }, async (event, data) => {
      if (event !== 'export' || !data) return;
      await setOpt({ lastExportFormat: data.id });
      await exportAs(data.id, data.options || {}, data.scope || 'auto');
    });
  }

  async function exportTiff16() {
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    if (!img) { toast(t('export.notDicom')); return; }
    const samples = img.samplesOf ? img.samplesOf(S.frame) : null;
    if (!samples || !img.gray) { toast(t('export.notDicom')); return; }
    const n = img.width * img.height;
    const gray16 = new Uint16Array(n);
    const signed = img.signed;
    for (let i = 0; i < n; i++) { const v = samples[i]; gray16[i] = Math.max(0, Math.min(65535, Math.round(signed ? v + 32768 : v))); }
    const sp = spacing();
    const bytes = E.tiff({ width: img.width, height: img.height, gray16, dpi: sp ? 25.4 / sp[1] : 72 });
    const name = `${stem()}${frameSuffix()}_16bit.tif`;
    const saved = await P.saveFile({ name, bytes, mime: 'image/tiff', filters: [{ name: 'TIFF', extensions: ['tif'] }] });
    if (saved) toast(t('export.done', { name: P.basename(saved) }));
  }

  async function renderFrameCanvas(img, frame, useCurrent) {
    // Render one frame to a canvas without disturbing the viewer's state more than necessary.
    const st = { ...img.state };
    const opts = useCurrent ? { frame } : { frame, resetWindow: true, colormap: 'gray', invert: img.defaultInvert() };
    const r = await img.render(opts);
    const c = document.createElement('canvas'); c.width = r.width; c.height = r.height;
    const id = c.getContext('2d').createImageData(r.width, r.height); id.data.set(r.rgba); c.getContext('2d').putImageData(id, 0, 0);
    // restore the previous window for the viewer
    await img.render({ frame: st.frame, wc: st.wc, ww: st.ww, voiLut: st.voiLut, voiFunction: st.voiFunction, invert: st.invert, colormap: st.colormap });
    return c;
  }

  async function exportAllFrames() {
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    if (!img) { toast(t('export.notDicom')); return; }
    if (img.frames < 2) { toast(t('export.singleFrame')); return; }
    Progress.start(t('file.exportAllFrames'));
    try {
      const files = [];
      for (let i = 0; i < img.frames; i++) {
        if (Progress.cancelled) return;
        Progress.update(i, img.frames, t('status.frame', { n: i + 1, total: img.frames }));
        const c = await renderFrameCanvas(img, i, true);
        files.push({ name: `${stem()}_${t('export.frameSuffix')}${String(i + 1).padStart(3, '0')}.png`, data: await encodeCanvas(c, 'png') });
      }
      const name = `${stem()}_frames.zip`;
      const saved = await P.saveFile({ name, bytes: E.zip(files), mime: 'application/zip', filters: [{ name: 'ZIP', extensions: ['zip'] }] });
      if (saved) toast(t('export.zipDone', { n: files.length, name: P.basename(saved) }));
    } finally { Progress.finish(); await renderDicom({ frame: S.frame }); }
  }

  async function exportAnimatedGif() {
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    if (!img) { toast(t('export.notDicom')); return; }
    if (img.frames < 2) { toast(t('export.singleFrame')); return; }
    Progress.start(t('file.exportGifAnimated'));
    try {
      const frames = [];
      for (let i = 0; i < img.frames; i++) {
        if (Progress.cancelled) return;
        Progress.update(i, img.frames, t('status.frame', { n: i + 1, total: img.frames }));
        const c = await renderFrameCanvas(img, i, true);
        frames.push(c.getContext('2d').getImageData(0, 0, c.width, c.height).data);
      }
      const bytes = E.gifAnimated({ width: img.width, height: img.height, frames, delayMs: Math.round(1000 / (S.fps || 10)), loop: true });
      const name = `${stem()}_cine.gif`;
      const saved = await P.saveFile({ name, bytes, mime: 'image/gif', filters: [{ name: 'GIF', extensions: ['gif'] }] });
      if (saved) toast(t('export.done', { name: P.basename(saved) }));
    } finally { Progress.finish(); await renderDicom({ frame: S.frame }); }
  }

  async function exportTags(format) {
    const f = S.file;
    const tags = f && (f.kind === 'dicom' ? f.image.tags : f.kind === 'dicom-meta' ? f.tags : null);
    if (!tags) { toast(t('export.notDicom')); return; }
    const text = D.tagsToText(tags, format);
    const ext = format === 'json' ? 'json' : format === 'csv' ? 'csv' : 'txt';
    const bytes = new TextEncoder().encode(text);
    const saved = await P.saveFile({ name: `${stem()}_tags.${ext}`, bytes, mime: 'text/plain', filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (saved) toast(t('export.done', { name: P.basename(saved) }));
  }

  async function copyImage() {
    const canvas = currentCanvas();
    if (!canvas) { toast(t('export.noImage')); return; }
    await P.clipboardWriteImage(canvas);
    toast(t('msg.copied'));
  }

  /* Print: the document dialog (title, details, notes, page and printer settings, live preview); "Print" goes
   * straight to the chosen printer on the desktop, "System dialog…" (and the browser) through the print dialog. */
  async function printImage() {
    const canvas = currentCanvas();
    if (!canvas) { toast(t('export.noImage')); return; }
    const dataUrl = canvas.toDataURL(canvas.width * canvas.height > 4e6 ? 'image/jpeg' : 'image/png', 0.92);
    // The dialog prints by itself (desktop: straight to the chosen printer); it reports back here.
    Dlg.open('print', { mode: 'print', dataUrl, name: S.file.name, sections: reportSections(canvas), layout: opt('docLayout') || {} }, (event, r) => {
      if (event !== 'printed' || !r) return;
      if (r.layout) setOpt({ docLayout: r.layout });
      if (r.ok === false && r.reason && r.reason !== 'cancelled') toast(t('msg.printFailed', { reason: r.reason }), true);
      else if (r.ok && !r.system) toast(r.printer ? t('print.sentTo', { printer: r.printer }) : t('print.sent'));
    });
  }

  /* ══════════════ Tree operations ══════════════ */
  async function treePaste() {
    if (!P.isDesktop) { toast(t('msg.notInBrowser'), true); return; }
    const cb = S.treeClipboard;
    const dest = tree.root();
    if (!cb || !cb.paths.length) { toast(t('msg.noClipboard')); return; }
    if (!dest) return;
    const results = await P.copyInto(cb.paths, dest, cb.cut);
    const okN = results.filter((r) => r.ok).length;
    const bad = results.filter((r) => !r.ok);
    if (cb.cut) S.treeClipboard = null;
    toast(t('msg.pasted', { n: okN }));
    if (bad.length) showError(new Error(bad.map((b) => `${b.src}: ${b.error}`).join('\n')));
    tree.refresh();
  }

  async function treeDelete() {
    if (!P.isDesktop) { toast(t('msg.notInBrowser'), true); return; }
    const paths = tree.selected();
    if (!paths.length) return;
    const name = paths.length === 1 ? P.basename(paths[0]) : `${paths.length} items`;
    if (opt('confirmDelete')) {
      const r = await P.messageBox({ type: 'question', message: t('msg.deleteConfirm', { name }), buttons: [t('dlg.ok'), t('dlg.cancel')] });
      if (r !== 0) return;
    }
    for (const p of paths) {
      await P.trash(p);
      if (S.file && S.file.path === p) closeFile();
    }
    toast(t('msg.deleted', { name }));
    tree.refresh();
  }

  /* Drive buttons in the folder header: every drive (desktop) or mounted root (browser); the current one is highlighted. */
  async function renderDriveBar() {
    const bar = $('driveBar');
    let roots = [];
    try { roots = await P.roots(); } catch { roots = []; }
    bar.innerHTML = '';
    for (const r of roots) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'drive-btn';
      b.dataset.path = r.path;
      const label = P.isDesktop ? String(r.name).replace(/[\\/]+$/, '') : r.name;
      b.innerHTML = `${window.Icons.svg('drive')}<span>${esc(label)}</span>`;
      b.setAttribute('data-tip', r.path);
      b.addEventListener('click', () => tree.setRoot(r.path));
      bar.append(b);
    }
    markDrive(tree.root());
  }
  function markDrive(dir) {
    const norm = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase();
    const cur = norm(dir);
    $('driveBar').querySelectorAll('.drive-btn').forEach((b) => {
      const d = norm(b.dataset.path);
      b.classList.toggle('active', !!cur && (cur === d || cur.startsWith(d + (P.isDesktop ? '\\' : '/')) || cur.startsWith(d + '/')));
    });
  }

  function onTreeRoot(dir) {
    $('treePathText').textContent = dir || '';
    $('treePath').title = dir || '';
    markDrive(dir);
    if (S.watchedDir && S.watchedDir !== dir) P.unwatchDir(S.watchedDir);
    if (dir) { P.watchDir(dir); S.watchedDir = dir; }
    if (dir && P.isDesktop && opt('rememberLastDir')) setOpt({ lastDir: dir });
    if (dir) pushRecent(dir);
    if (!S.series.sorted || S.series.dir !== dir) { S.series = { files: [], index: -1, dir, sorted: false, groups: [] }; updateSeriesBar(); renderSeriesPanel(); }
  }

  /* ══════════════ Context menus / toast ══════════════ */
  function showContextMenu(menu, x, y, ctx) {
    hideContextMenus();
    S.ctx = ctx || null;
    menu.classList.add('open');
    const r = menu.getBoundingClientRect();
    const px = MenuMirror.on ? x : Math.min(x, window.innerWidth - r.width - 4), py = MenuMirror.on ? y : Math.min(y, window.innerHeight - r.height - 4);
    menu.style.left = `${Math.max(0, px)}px`; menu.style.top = `${Math.max(0, py)}px`;
    if (menu === $('ctxTree')) {
      const one = ctx && ctx.paths.length === 1;
      menu.querySelector('[data-action="tree-open"]').disabled = !(one && ctx.hit && !ctx.hit.isDir);
      menu.querySelector('[data-action="tree-paste"]').disabled = !(S.treeClipboard && S.treeClipboard.paths.length);
    }
  }
  function hideContextMenus() { document.querySelectorAll('.ctx-menu.open').forEach((m) => m.classList.remove('open')); }

  /* Desktop: a page cannot draw past its window, so the open drop-down / context menu is shown by the menu
   * overlay window (src/menu.html) instead. The panel stays open (but invisible) in this page, which keeps all
   * the menu logic here: the overlay draws a copy at the same screen position, and what the user does there
   * comes back as a click on the same button of the real panel. Watching the DOM catches every way a menu
   * opens, closes or changes (check marks, recent files) without touching the code that does it. */
  const MenuMirror = {
    on: false, panel: null, sent: '', timer: 0,
    init() {
      if (!P.isDesktop || !window.desktopAPI || !window.desktopAPI.menuOpen) return;
      this.on = true;
      document.body.classList.add('menu-mirror');
      new MutationObserver(() => this.schedule()).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'disabled', 'hidden'] });
      window.desktopAPI.onMenuEvent((ev) => this.onEvent(ev));
      window.addEventListener('resize', () => { if (this.panel) this.dismiss(); });
    },
    schedule() { if (!this.timer) this.timer = requestAnimationFrame(() => { this.timer = 0; this.sync(); }); },
    current() { return document.querySelector('.menu.open > .menu-panel, .ctx-menu.open'); },
    titles() { return [...document.querySelectorAll('.menu > .menu-title')]; },
    sync() {
      const panel = this.current();
      if (!panel) { if (this.panel) { this.panel = null; this.sent = ''; window.desktopAPI.menuClose().catch(() => {}); } return; }
      const r = panel.getBoundingClientRect();
      const clone = panel.cloneNode(true);
      clone.setAttribute('data-mirror-panel', '');
      const html = clone.outerHTML;
      const key = `${html}|${Math.round(r.left)},${Math.round(r.top)}|${document.body.className}|${document.documentElement.getAttribute('style')}`;
      if (panel === this.panel && key === this.sent) return;
      this.panel = panel; this.sent = key;
      const chain = [];
      for (let a = panel.parentElement; a && a !== document.body; a = a.parentElement) chain.unshift({ tag: a.tagName.toLowerCase(), cls: a.className });
      const titles = this.titles();
      const hot = titles.map((t, i) => { const q = t.getBoundingClientRect(); return { i, x: q.left, y: q.top, w: q.width, h: q.height }; }).filter((h) => h.w && h.h);
      const owner = panel.parentElement && panel.parentElement.querySelector(':scope > .menu-title');
      window.desktopAPI.menuOpen({
        html, chain, hot, ownerIndex: owner ? titles.indexOf(owner) : null,
        kind: panel.classList.contains('ctx-menu') ? 'ctx' : 'menu',
        rect: { x: r.left, y: r.top },
        rootStyle: document.documentElement.getAttribute('style') || '',
        bodyClass: document.body.className.replace(/\bmenu-mirror\b/, ''),
        theme: document.body.dataset.theme || '', scheme: document.body.dataset.scheme || '',
      }).catch((e) => { console.error('menu overlay', e); this.on = false; document.body.classList.remove('menu-mirror'); });
    },
    dismiss() { if (S.closeMenus) S.closeMenus(); hideContextMenus(); },
    onEvent(ev) {
      const panel = this.panel;
      if (!ev || !panel) return;
      if (ev.type === 'dismiss') { this.dismiss(); return; }
      if (ev.type === 'title') {
        const t = this.titles()[ev.index];
        if (!t) return;
        if (ev.click) { if (panel.classList.contains('ctx-menu')) hideContextMenus(); t.click(); }
        else t.dispatchEvent(new MouseEvent('mouseenter'));
        return;
      }
      if (ev.type === 'pick') {
        const b = panel.querySelectorAll('button')[ev.index];
        if (!b || b.disabled) return;
        const target = ev.remove ? b.querySelector('.menu-remove') || b : b;
        target.click();
      }
    },
  };
  let toastTimer = null;
  function toast(text, isError) {
    const el = $('toast');
    el.textContent = text;
    el.classList.toggle('error', !!isError);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), isError ? 5000 : 2500);
  }

  /* ══════════════ Dialogs: separate popup windows on the desktop, in-page modals in the browser ══════════════ */
  const Dlg = {
    handlers: new Map(),   // kind → onEvent(event, data)
    inpage: new Map(),     // kind → { box, listeners }
    async open(kind, payload = {}, onEvent) {
      this.handlers.set(kind, onEvent || (() => {}));
      if (P.isDesktop) {
        await window.desktopAPI.popupOpen({ kind, payload, theme: window.Themes.get(opt('theme')).id, lang: window.I18n.lang, ...window.Dialogs.size(kind) });
        return;
      }
      this.closeAll();
      const host = $('modalHost');
      const box = $('modalBox');
      box.className = 'modal-box';
      box.innerHTML = '';
      const listeners = [];
      const ctx = {
        isPopup: false,
        send: (event, data) => { const h = this.handlers.get(kind); if (h) h(event, data); },
        close: () => this.close(kind),
        onMessage: (fn) => listeners.push(fn),
        resize: () => {},
      };
      this.inpage.set(kind, { box, listeners });
      window.Dialogs.render(kind, box, payload, ctx);
      window.Icons.decorate(box);
      host.classList.add('open');
      host.dataset.kind = kind;
      const f = box.querySelector('input:not([readonly]):not([type=checkbox]):not([type=radio]), button.primary');
      if (f) f.focus();
    },
    send(kind, event, data) {
      if (P.isDesktop) { window.desktopAPI.popupSend(kind, event, data); return; }
      const d = this.inpage.get(kind);
      if (d) d.listeners.forEach((fn) => fn(event, data));
    },
    broadcast(event, data) {
      if (P.isDesktop) { window.desktopAPI.popupSend(null, event, data); return; }
      for (const d of this.inpage.values()) d.listeners.forEach((fn) => fn(event, data));
    },
    close(kind) {
      if (P.isDesktop) { window.desktopAPI.popupClose(kind); return; }
      if (this.inpage.has(kind)) { this.inpage.delete(kind); $('modalHost').classList.remove('open'); $('modalBox').innerHTML = ''; }
      const h = this.handlers.get(kind);
      if (h) h('closed');
    },
    closeAll() { for (const k of [...this.inpage.keys()]) this.close(k); },
    dispatch({ kind, event, data }) { const h = this.handlers.get(kind); if (h) h(event, data); },
  };

  /* Long operations show a progress popup (bar + %), optionally cancellable.
   * One popup at a time: a start while the last one is still up reuses it, a start while it is closing
   * waits until it is gone (a desktop popup window cannot be opened twice). */
  const Progress = {
    last: null, cancelled: false, open: false, visible: false, closing: false,
    opening: Promise.resolve(), gone: Promise.resolve(),
    start(title, { cancellable = true } = {}) {
      this.cancelled = false; this.open = true; this.shownAt = Date.now();
      this.last = { title, done: 0, total: 0, text: '', cancellable };
      if (this.visible && !this.closing) { this.opening.then(() => Dlg.send('progress', 'update', this.last)); return; }
      const prev = Promise.race([this.gone, new Promise((r) => setTimeout(r, 2000))]);
      let markGone;
      this.gone = new Promise((r) => { markGone = r; });
      this.visible = true;
      let markReady;
      this.ready = new Promise((r) => { markReady = r; });
      this.opening = prev.then(() => {
        this.closing = false;
        return Dlg.open('progress', this.last, (event) => {
          if (event === 'ready') { Dlg.send('progress', 'update', this.last); markReady(); }
          if (event === 'cancel') this.cancelled = true;
          if (event === 'closed') { if (this.open && !this.closing) this.cancelled = true; this.visible = false; this.closing = false; markGone(); }
        });
      }).catch((err) => { console.warn('[progress]', err); this.visible = false; markGone(); markReady(); });
    },
    /** Resolves once the popup is on screen (or after a short wait), so heavy work that blocks the page starts after it is painted. */
    async shown() {
      await Promise.race([this.ready || Promise.resolve(), new Promise((r) => setTimeout(r, 1500))]);
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 40)));
    },
    update(done, total, text) {
      if (!this.open) return;
      this.last = { ...this.last, done, total, text: text || '' };
      Dlg.send('progress', 'update', this.last);
    },
    async finish() {
      if (!this.open) return;
      this.open = false;
      await this.opening;
      // a quick job still shows its popup for a moment instead of flickering
      const left = 450 - (Date.now() - this.shownAt);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      if (!this.open && this.visible && !this.closing) { this.closing = true; Dlg.close('progress'); }
    },
  };

  function showError(err, title, detail) {
    console.error(err);
    const message = title || (err && err.message) || String(err);
    const det = detail || (title ? (err && (err.stack || err.message)) : (err && err.stack)) || '';
    Dlg.open('error', { title: t('dlg.errorTitle'), message, detail: det });
  }
  function promptText(title, value = '') {
    return new Promise((resolve) => {
      let done = false;
      Dlg.open('prompt', { title, value }, (event, data) => {
        if (event === 'result' && !done) { done = true; resolve(data.value || ''); }
        else if (event === 'closed' && !done) { done = true; resolve(''); }
      });
    });
  }
  async function openAbout() {
    const info = S.appInfo || await P.appInfo();
    Dlg.open('about', { info });
  }
  function openShortcuts() { Dlg.open('shortcuts'); }

  function openSettings() {
    const SP = window.StartPage || {};
    Dlg.open('settings', { settings: S.settings, defaults: DEFAULTS, isDesktop: P.isDesktop, startScenes: SP.SCENES || [], startDefaults: SP.SPEED_DEFAULTS || {} }, async (event, data) => {
      if (event === 'setting') await applySetting(data.key, data.value);
      else if (event === 'reset') { await resetSettings(); Dlg.send('settings', 'settings', S.settings); }
    });
  }

  function openBatchDialog() {
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    const wl = img && img.gray ? { wc: img.state.wc, ww: img.state.ww, colormap: img.state.colormap, invert: img.state.invert, voiFunction: img.state.voiFunction } : null;
    Dlg.open('batch', { source: tree.root() || '', wl }, (event, data) => {
      if (event !== 'done') return;
      if (data.failures && data.failures.length) showError(new Error(t('batch.done', { ok: data.ok, fail: data.failures.length })), t('batch.failures'), data.failures.join('\n'));
      else toast(`${t('batch.done', { ok: data.ok, fail: 0 })}${data.outDir ? `\n${t('batch.output', { dir: data.outDir })}` : ''}`);
      if (tree.root() === data.source) tree.refresh();
    });
  }

  /* ══════════════ Documents: SR, waveform (ECG), encapsulated PDF, RT plan / structures ══════════════ */
  async function showDocView() {
    const f = S.file;
    const host = $('docView');
    if (!f || f.kind !== 'dicom-meta' || !window.DocViews) { host.hidden = true; return; }
    S.docFor = f;
    host.hidden = false;
    host.innerHTML = `<div class="doc-loading">${esc(t('status.loading'))}</div>`;
    try {
      const bytes = new Uint8Array(await P.readFile(f.path));
      if (S.file !== f) return;
      await window.DocViews.render(host, bytes, {
        kind: f.docKind, name: f.name, t, fmt, esc, toast, stem: stem(),
        save: async (o) => {
          Progress.start(t('progress.exporting', { name: o.name }), { cancellable: false });
          try { const saved = await P.saveFile(o); if (saved) toast(t('export.done', { name: P.basename(saved) })); return saved; } finally { await Progress.finish(); }
        },
        openDicomdir: f.docKind === 'dicomdir' ? () => openDicomdir(f.path) : null,
        video: f.video, extractVideo: () => runAction('video-extract'),
      });
    } catch (err) {
      host.innerHTML = `<div class="doc-error">${esc(err && err.message || String(err))}</div>`;
    }
  }
  function openDocumentWindow() {
    const f = S.file;
    if (!f || (f.kind !== 'dicom' && f.kind !== 'dicom-meta')) { toast(t('export.notDicom')); return; }
    if (f.kind === 'dicom-meta') { showDocView(); return; }
    toast(t('doc.isImage'));
  }

  /* ══════════════ DICOMDIR (CD / DVD): patient › study › series in the Series panel ══════════════ */
  async function openDicomdir(path) {
    const bytes = new Uint8Array(await P.readFile(path));
    const dir = window.DicomDocs.readDicomDir(bytes);
    const base = P.dirname(path);
    // web: the referenced files sit next to a URL-mounted DICOMDIR — give each one its URL
    const entry = !P.isDesktop && P.web.entries.get(path);
    const resolve = (parts) => {
      const p = P.join(base, ...parts);
      if (entry && entry.url && !P.web.entries.has(p)) {
        const url = entry.url.replace(/[^/]*$/, '') + parts.map(encodeURIComponent).join('/');
        P.web.entries.set(p, { url });
      }
      return p;
    };
    const groups = [];
    for (const pt of dir.patients || []) for (const st of pt.studies || []) for (const se of st.series || []) {
      const items = (se.images || []).filter((im) => im.path && im.path.length).map((im) => ({ path: resolve(im.path), name: im.path[im.path.length - 1], instance: im.instance }))
        .sort((a, b) => (a.instance || 0) - (b.instance || 0));
      if (!items.length) continue;
      groups.push({ key: se.uid || `${st.uid}/${se.number}`, items, modality: se.modality, description: se.description, number: se.number, patient: pt.name, studyDescription: st.description, studyDate: st.date });
    }
    if (!groups.length) { toast(t('dicomdir.empty'), true); return; }
    hideStart();
    S.series = { files: [], index: -1, dir: base, sorted: true, groups, dicomdir: path };
    selectSeriesGroup(groups[0], true);
    renderSeriesPanel();
    document.querySelector('.tab[data-tab="series"]').click();
    toast(t('dicomdir.loaded', { series: groups.length, files: groups.reduce((n, g) => n + g.items.length, 0) }));
  }

  /* ══════════════ ZIP archives: unpacked in memory and shown as a read-only folder ══════════════ */
  async function openZip(path) {
    showLoading(t('status.decoding', { name: P.basename(path) }));
    try {
      const files = await window.ZipReader.readAll(new Uint8Array(await P.readFile(path)));
      if (!files.length) { toast(t('zip.empty'), true); return; }
      const root = P.mountArchive(P.basename(path), files);
      hideStart();
      await tree.setRoot(root);
      renderDriveBar();
      const dicomdir = files.find((f) => /(^|\/)dicomdir$/i.test(f.name));
      if (dicomdir) await openDicomdir(`${root}/${dicomdir.name}`);
      toast(t('zip.opened', { n: files.length, name: P.basename(path) }));
    } finally { hideLoading(); }
  }

  /* ══════════════ Export a series (or the open files) as a DICOMDIR file set — for a CD, DVD or USB stick ══════════════ */
  async function exportDicomdir() {
    const paths = S.series.sorted && S.series.files.length ? S.series.groups.flatMap((g) => g.items.map((it) => it.path)) : S.tabs.filter((x) => !x.file || x.file.kind !== 'image').map((x) => x.path);
    const unique = [...new Set(paths)];
    if (!unique.length) { toast(t('export.notDicom')); return; }
    const W = window.DicomWriter;
    const entries = [];
    Progress.start(t('file.exportDicomdir'));
    try {
      for (let i = 0; i < unique.length; i++) {
        if (Progress.cancelled) return;
        Progress.update(i, unique.length, P.basename(unique[i]));
        const bytes = new Uint8Array(await P.readFile(unique[i]));
        if (!D.isDicom(bytes)) continue;
        // ISO 9660 names: 8 upper-case characters, no extension
        entries.push({ path: ['DICOM', `S${String(Math.floor(i / 9999) + 1).padStart(4, '0')}`, `I${String(i % 9999 + 1).padStart(7, '0')}`], bytes: W.write(W.parse(bytes)) });
      }
    } finally { Progress.finish(); }
    if (!entries.length) { toast(t('export.notDicom')); return; }
    const dicomdir = W.makeDicomDir(entries, { fileSetId: 'MYDCMVIEWER' });
    if (P.isDesktop) {
      const parent = await P.pickFolder();
      if (!parent) return;
      const out = await P.uniqueDir(P.join(parent, 'DICOMDIR_EXPORT'));
      for (const e of entries) await P.writeFile(P.join(out, ...e.path), e.bytes);
      await P.writeFile(P.join(out, 'DICOMDIR'), dicomdir);
      toast(t('export.dicomdirDone', { n: entries.length, dir: out }));
    } else {
      const zip = E.zip([{ name: 'DICOMDIR', data: dicomdir }, ...entries.map((e) => ({ name: e.path.join('/'), data: e.bytes }))]);
      const saved = await P.saveFile({ name: 'DICOMDIR_EXPORT.zip', bytes: zip, mime: 'application/zip', filters: [{ name: 'ZIP', extensions: ['zip'] }] });
      if (saved) toast(t('export.dicomdirDone', { n: entries.length, dir: saved }));
    }
  }

  /* Series panel thumbnails: the middle image of each series, drawn small once and kept. */
  const thumbCache = new Map();
  async function seriesThumb(g, canvas) {
    const it = g.items[Math.floor(g.items.length / 2)] || g.items[0];
    if (!it) return;
    let url = thumbCache.get(it.path);
    if (!url) {
      try {
        const img = await D.load(new Uint8Array(await P.readFile(it.path)));
        const r = await img.render({ frame: Math.floor(img.frames / 2), resetWindow: true });
        const c = document.createElement('canvas'); c.width = r.width; c.height = r.height;
        const id = c.getContext('2d').createImageData(r.width, r.height); id.data.set(r.rgba); c.getContext('2d').putImageData(id, 0, 0);
        img.release();
        const s = 64 / Math.max(r.width, r.height);
        const tcv = document.createElement('canvas'); tcv.width = Math.max(1, Math.round(r.width * s)); tcv.height = Math.max(1, Math.round(r.height * s));
        const tx = tcv.getContext('2d'); tx.imageSmoothingQuality = 'high'; tx.drawImage(c, 0, 0, tcv.width, tcv.height);
        url = tcv;
        thumbCache.set(it.path, url);
      } catch { return; }
    }
    canvas.width = url.width; canvas.height = url.height;
    canvas.getContext('2d').drawImage(url, 0, 0);
  }

  /* ══════════════ Fusion (PET/CT): another open image over this one ══════════════ */
  async function fuse(img, r) {
    const fu = S.fusion;
    if (!fu || !fu.tabId || fu.tabId === S.tabId) return null;
    const tab = S.tabs.find((x) => x.id === fu.tabId);
    const overlay = tab && tab.file && tab.file.kind === 'dicom' ? tab.file.image : null;
    if (!overlay || overlay === img) return null;
    const res = await window.Fusion.compose({ base: img, baseFrame: S.frame, baseRgba: r.rgba, overlay, colormap: fu.colormap, opacity: fu.opacity, threshold: fu.threshold, lut: D.colormap(fu.colormap) });
    S.fusionInfo = t(res.resampled ? 'fusion.resampled' : res.noOverlap ? 'fusion.noOverlap' : 'fusion.stretched', { frame: res.frame + 1, n: res.matched });
    Dlg.send('fusion', 'info', S.fusionInfo);
    return res.rgba;
  }
  function openFusion() {
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    if (!img) { toast(t('export.notDicom')); return; }
    const tabs = S.tabs.filter((x) => x.id !== S.tabId && (!x.file || x.file.kind === 'dicom')).map((x) => ({ id: x.id, name: x.name }));
    if (!tabs.length) { toast(t('fusion.needTwo'), true); return; }
    Dlg.open('fusion', { tabs, current: S.fusion || {}, colormaps: D.COLORMAP_IDS.filter((c) => c !== 'gray').map((id) => ({ id, label: t(`cm.${id}`) })) }, async (event, data) => {
      if (event !== 'set') return;
      S.fusion = data && data.tabId ? data : null;
      const tab = S.fusion && S.tabs.find((x) => x.id === S.fusion.tabId);
      if (tab && !tab.file) {   // released to save memory: decode it again
        const image = await D.load(new Uint8Array(await P.readFile(tab.path)));
        tab.file = { path: tab.path, name: tab.name, size: 0, kind: 'dicom', image };
      }
      await renderDicom({});
    });
  }

  /* ── 3D volume rendering (volume3d.js) of the sorted series or a multi-frame file ── */
  function openVolume() {
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    if (!img) { toast(t('export.notDicom')); return; }
    if (!img.gray || img.palette) { toast(t('vr.notGray'), true); return; }
    const name = stem();
    if (img.frames > 1) { Dlg.open('volume', { multiframe: S.file.path, name }); return; }
    if (!S.series.sorted || S.series.files.length < 2) { toast(t('mpr.needSeries'), true); return; }
    Dlg.open('volume', { files: S.series.files.slice(), name });
  }

  /* ── Image filters (imageFilters.js): a chain applied while rendering; exports show it too ── */
  async function setFilters(list) {
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    if (!img) { toast(t('export.notDicom')); return; }
    await renderDicom({ filters: list || [] });
    syncMenuState();
  }
  function openFilters() {
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    if (!img) { toast(t('export.notDicom')); return; }
    Dlg.open('filters', { filters: img.state.filters || [] }, async (event, data) => {
      if (event === 'set' && S.file && S.file.image === img) await setFilters((data && data.filters) || []);
    });
  }

  /* ── PACS (pacs.js): search / retrieve / send / receive over the DICOM network ── */
  function openPacs() {
    const f = S.file;
    const isDcm = f && (f.kind === 'dicom' || f.kind === 'dicom-meta');
    const sendFiles = isDcm ? (S.series.sorted && S.series.files.length > 1 && S.series.files.includes(f.path) ? S.series.files.slice() : [f.path]) : [];
    const sendLabel = sendFiles.length > 1 ? t('pacs.sendSeries', { n: sendFiles.length }) : sendFiles.length ? f.name : '';
    Dlg.open('pacs', { nodes: opt('pacsNodes') || [], localAE: opt('pacsLocalAE'), localPort: opt('pacsLocalPort'), inbox: opt('pacsInbox') || '', sendFiles, sendLabel }, async (event, data) => {
      if (event === 'nodes' && data) await setOpt({ pacsNodes: data.nodes || [], pacsLocalAE: data.localAE, pacsLocalPort: data.localPort });
      if (event === 'retrieved' && data && data.files && data.files.length) {
        hideStart();
        if (data.dir) await tree.setRoot(data.dir);
        await openPath(data.files[0]);
        if (data.files.length > 1) await scanSeries();
      }
    });
  }

  /* ══════════════ Tutorial ══════════════ */
  /** The help window (help.js): every feature with pictures; a page can start the tutorial at its step. */
  function openHelp(page) {
    Dlg.open('help', { page: page || null }, (event, data) => {
      if (event === 'tour' && data) { Dlg.close('help'); hideStart(); startTour(data); }
    });
  }
  function startTour(from) {
    if (!window.Tour) return;
    Dlg.closeAll();
    window.Tour.start({
      lang: window.I18n.lang, from,
      run: (action, data) => runAction(action, { dataset: data || {} }),
      onEnd: () => { setOpt({ tutorialDone: true }); },
      // the card's "show the tutorial at launch" check box: the same setting as Settings › Start screen
      startup: !!opt('showTourOnLaunch'),
      onStartup: (on) => { setOpt({ showTourOnLaunch: on }); },
    });
  }
  /** Tutorial demos: one measurement of the given kind, drawn the way the mouse would. */
  function demoMeasure(kind = 'length') {
    const src = viewer.source;
    if (!src) return;
    const W = src.width, H = src.height, P2 = (x, y) => ({ x: W * x, y: H * y });
    const shapes = {
      length: [P2(0.3, 0.5), P2(0.7, 0.55)],
      angle: [P2(0.3, 0.35), P2(0.45, 0.6), P2(0.7, 0.45)],
      cobb: [P2(0.3, 0.3), P2(0.6, 0.36), P2(0.32, 0.7), P2(0.62, 0.62)],
      rect: [P2(0.42, 0.42), P2(0.58, 0.56)],
      ellipse: [P2(0.38, 0.4), P2(0.56, 0.58)],
      polygon: [P2(0.4, 0.35), P2(0.6, 0.38), P2(0.64, 0.58), P2(0.48, 0.66), P2(0.36, 0.52)],
      freehand: Array.from({ length: 24 }, (_, i) => P2(0.5 + 0.12 * Math.cos(i / 24 * Math.PI * 2) * (1 + 0.15 * Math.sin(i)), 0.5 + 0.1 * Math.sin(i / 24 * Math.PI * 2))),
      point: [P2(0.52, 0.48)],
      arrow: [P2(0.62, 0.3), P2(0.52, 0.44)],
      text: [P2(0.2, 0.2)],
    };
    const pts = shapes[kind] || shapes.length;
    const a = { type: shapes[kind] ? kind : 'length', points: pts.map((p) => ({ ...p })), label: '' };
    if (kind === 'arrow') a.text = t('tour.arrowText');
    if (kind === 'text') a.text = t('tour.textNote');
    labelAnnotation(a);
    viewer.annotations.push(a);
    viewer.redraw();
    History.push();
  }
  /** Tutorial demo: fuse the other open DICOM tab over this one, or switch fusion off. */
  async function demoFusion(on) {
    if (!on) { S.fusion = null; await renderDicom({}); return; }
    const other = S.tabs.find((x) => x.id !== S.tabId && (!x.file || x.file.kind === 'dicom'));
    if (!other) return;
    if (!other.file) { const image = await D.load(new Uint8Array(await P.readFile(other.path))); other.file = { path: other.path, name: other.name, size: 0, kind: 'dicom', image }; }
    S.fusion = { tabId: other.id, colormap: 'hotiron', opacity: 0.5, threshold: 0.05 };
    await renderDicom({});
  }


  /* Polygon / freehand ROI statistics: pixels whose centre lies inside the outline. */
  function polygonStats(img, pts, frame) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    let area2 = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; area2 += p.x * q.y - q.x * p.y; }
    const out = { n: 0, mean: NaN, std: NaN, min: NaN, max: NaN, areaPx: Math.abs(area2) / 2, units: img ? img.units : '' };
    if (!img || !img.gray) return out;
    const inside = (x, y) => {
      let c = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], b = pts[j];
        if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) c = !c;
      }
      return c;
    };
    let n = 0, sum = 0, sum2 = 0, min = Infinity, max = -Infinity;
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(img.height, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(img.width, Math.ceil(x1)); x++) {
        if (!inside(x + 0.5, y + 0.5)) continue;
        const v = img.valueAt(x, y, frame);
        if (!v || !Number.isFinite(v.value) || v.padding) continue;
        n++; sum += v.value; sum2 += v.value * v.value;
        if (v.value < min) min = v.value;
        if (v.value > max) max = v.value;
      }
    }
    if (!n) return out;
    const mean = sum / n;
    return { ...out, n, mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), min, max };
  }

  /* ══════════════ More exports: PDF report, DICOM, measurements ══════════════ */
  /** What a printed page / PDF report can show, in sections the document dialog turns on and off. */
  function reportSections(canvas) {
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    const m = img ? img.meta : {};
    const rows = (keys) => keys.filter((k) => m[k]).map((k) => [t(`meta.${k}`), String(m[k])]);
    const image = [[t('meta.fileName'), S.file ? S.file.name : ''], [t('meta.dimensions'), img ? `${img.width} × ${img.height}` : `${canvas.width} × ${canvas.height}`]];
    if (img) {
      const sp = spacing();
      if (sp) image.push([t('meta.pixelSpacing'), `${fmt(sp[0], 3)} × ${fmt(sp[1], 3)} mm`]);
      const fi = img.frameInfo(S.frame);
      if (fi.sliceThickness) image.push([t('meta.sliceThickness'), `${fmt(fi.sliceThickness, 2)} mm`]);
      if (img.gray && !img.palette) image.push([t('meta.window'), `W ${fmt(img.state.ww)} / L ${fmt(img.state.wc)}`]);
      if (img.frames > 1) image.push([t('meta.frames'), `${S.frame + 1} / ${img.frames}`]);
    }
    const measure = [];
    viewer.annotations.forEach((a, i) => { if (a.label || a.text) measure.push([`${i + 1}. ${t(`tools.short.${a.type}`)}`, String(a.label || a.text).replace(/\n/g, ' · ')]); });
    return [
      { id: 'patient', title: t('report.secPatient'), rows: rows(['patientName', 'patientId', 'patientBirthDate', 'patientSex', 'patientAge']) },
      { id: 'study', title: t('report.secStudy'), rows: rows(['modality', 'studyDate', 'studyTime', 'accessionNumber', 'studyDescription', 'seriesDescription', 'bodyPart', 'protocolName', 'institution', 'manufacturer']) },
      { id: 'image', title: t('report.secImage'), rows: image },
      { id: 'measure', title: t('report.secMeasure'), rows: measure },
    ].filter((sec) => sec.rows.length);
  }
  /* PDF report: the document dialog in PDF mode (title, subtitle, author, keywords, notes, which details, page);
   * its "Save PDF" comes back as export-pdf-save, which draws the page and writes the file. */
  async function exportPdf() {
    const canvas = currentCanvas();
    if (!canvas) { toast(t('export.noImage')); return; }
    const payload = { mode: 'pdf', dataUrl: canvas.toDataURL('image/jpeg', 0.95), name: S.file.name, sections: reportSections(canvas), layout: { landscape: canvas.width > canvas.height * 1.2, ...(opt('docLayout') || {}) } };
    S.pdfPayload = payload;
    Dlg.open('print', payload, (event, data) => {
      if (event !== 'save' || !data) return;
      if (data.layout) setOpt({ docLayout: data.layout });
      runAction('export-pdf-save', { dataset: { options: data.options } });
    });
  }
  async function exportPdfSave(options) {
    const payload = S.pdfPayload;
    if (!payload) return;
    const o = window.Dialogs.docOptions(payload, options);
    const page = await window.Dialogs.printPageCanvas(payload, o);
    const jpeg = new Uint8Array(await (await new Promise((r) => page.toBlob(r, 'image/jpeg', 0.92))).arrayBuffer());
    const subject = o.subtitle || String(o.notes || '').split(/\r?\n/)[0];
    const bytes = E.pdf({ pages: [{ jpeg, width: page.width, height: page.height, dpi: o.dpi }], title: o.title || payload.name, author: o.author, subject, keywords: o.keywords });
    const saved = await P.saveFile({ name: `${stem()}${frameSuffix()}_report.pdf`, bytes, mime: 'application/pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (saved) toast(t('export.done', { name: P.basename(saved) }));
  }
  async function exportDicom() {
    const f = S.file;
    if (!f || (f.kind !== 'dicom' && f.kind !== 'dicom-meta')) { toast(t('export.notDicom')); return; }
    const src = new Uint8Array(await P.readFile(f.path));
    const bytes = f.kind === 'dicom' ? await window.DicomWriter.decompress(src) : window.DicomWriter.write(window.DicomWriter.parse(src));
    const saved = await P.saveFile({ name: `${stem()}_uncompressed.dcm`, bytes, mime: 'application/dicom', filters: [{ name: 'DICOM', extensions: ['dcm'] }] });
    if (saved) toast(t('export.done', { name: P.basename(saved) }));
  }
  async function exportDicomSc() {
    const canvas = currentCanvas();
    if (!canvas) { toast(t('export.noImage')); return; }
    const img = S.file.kind === 'dicom' ? S.file.image : null;
    const m = img ? img.meta : {};
    const rgba = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const bytes = window.DicomWriter.secondaryCapture({
      width: canvas.width, height: canvas.height, rgba,
      meta: { patientName: m.patientName || '', patientId: m.patientId || '', studyDescription: m.studyDescription || '', seriesDescription: `${m.seriesDescription || S.file.name} (MyDCMViewer)`, modality: 'OT', studyUid: img && img.studyUid, pixelSpacing: spacing() },
    });
    const saved = await P.saveFile({ name: `${stem()}${frameSuffix()}_sc.dcm`, bytes, mime: 'application/dicom', filters: [{ name: 'DICOM', extensions: ['dcm'] }] });
    if (saved) toast(t('export.done', { name: P.basename(saved) }));
  }
  async function exportMeasurements() {
    const list = viewer.annotations || [];
    if (!list.length) { toast(t('export.noMeasurements')); return; }
    const sp = spacing();
    const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const rows = [['#', 'type', 'label', 'frame', 'points (x y, image pixels)', 'pixel spacing (mm)', 'file'].map(q).join(',')];
    list.forEach((a, i) => rows.push([i + 1, a.type, String(a.label || a.text || '').replace(/\n/g, ' | '), S.frame + 1, a.points.map((p) => `${fmt(p.x, 2)} ${fmt(p.y, 2)}`).join('; '), sp ? `${fmt(sp[0], 4)} \\ ${fmt(sp[1], 4)}` : '', S.file ? S.file.name : ''].map(q).join(',')));
    const bytes = new TextEncoder().encode('\ufeff' + rows.join('\r\n') + '\r\n');
    const saved = await P.saveFile({ name: `${stem()}_measurements.csv`, bytes, mime: 'text/csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (saved) toast(t('export.done', { name: P.basename(saved) }));
  }

  /* ══════════════ Tag editor ══════════════ */
  function openTagEditor() {
    const f = S.file;
    if (!f || (f.kind !== 'dicom' && f.kind !== 'dicom-meta')) { toast(t('export.notDicom')); return; }
    Dlg.open('tageditor', { path: f.path, name: f.name }, (event, data) => {
      if (event === 'saved' && data && data.path) { toast(t('export.done', { name: P.basename(data.path) })); if (data.open && P.isDesktop) openPath(data.path); }
    });
  }

  /* ══════════════ Advanced DICOM: MPR / MIP, anonymised copy, cine video ══════════════ */
  function openMpr() {
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    if (!img) { toast(t('export.notDicom')); return; }
    if (!img.gray || img.palette) { toast(t('mpr.notGray'), true); return; }
    const name = stem();
    if (img.frames > 1) { Dlg.open('mpr', { multiframe: S.file.path, name }); return; }
    if (!S.series.sorted || S.series.files.length < 2) { toast(t('mpr.needSeries'), true); return; }
    Dlg.open('mpr', { files: S.series.files.slice(), name });
  }

  function openAnonymize() {
    const f = S.file;
    if (!f || (f.kind !== 'dicom' && f.kind !== 'dicom-meta')) { toast(t('export.notDicom')); return; }
    Dlg.open('anonymize', {}, async (event, data) => {
      if (event !== 'run') return;
      Progress.start(t('progress.exporting', { name: f.name }), { cancellable: false });
      try { await anonymizeAndSave(data); } finally { await Progress.finish(); }
    });
  }

  /* De-identify a copy (dicomWriter.anonymize): the chosen elements replaced or emptied, also inside
   * sequences, private groups removed, Study / Series / SOP Instance UIDs replaced consistently,
   * Patient Identity Removed = YES. Saved as <name>_anon.dcm. */
  async function anonymizeAndSave({ tags, privateTags, replacement, newUids }) {
    const f = S.file;
    const src = new Uint8Array(await P.readFile(f.path));
    const bytes = window.DicomWriter.anonymize(src, { tags, removePrivate: privateTags, replacement, newUids: newUids !== false });
    const name = `${stem()}_anon.dcm`;
    const saved = await P.saveFile({ name, bytes, mime: 'application/dicom', filters: [{ name: 'DICOM', extensions: ['dcm'] }] });
    if (saved) toast(t('anon.done', { n: bytes.count || tags.length, name: P.basename(saved) }));
  }

  /* Record the cine loop (or the series stack) into an MP4 (H.264) or WebM (VP9/VP8) video with MediaRecorder.
   * No timeslice (chunked recording is unreliable) and one warm-up recording first: the first H.264
   * encoder of a session takes seconds to start and would otherwise swallow the first frames. */
  let videoWarm = {};
  async function warmRecorder(mime, w, h) {
    if (videoWarm[mime]) return;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    const stream = c.captureStream(0);
    const rec = new MediaRecorder(stream, { mimeType: mime });
    const done = new Promise((r) => { rec.onstop = r; });
    rec.start();
    for (let i = 0; i < 6; i++) { stream.getVideoTracks()[0].requestFrame(); await new Promise((r) => setTimeout(r, 100)); }
    rec.stop();
    await done;
    stream.getTracks().forEach((tr) => tr.stop());
    videoWarm[mime] = true;
  }
  async function exportVideo(format = 'webm') {
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    const frames = img ? img.frames : 1;
    const stackFiles = S.series.files.length > 1 ? S.series.files.length : 0;
    if (!img || (frames < 2 && !stackFiles)) { toast(t('export.singleFrame')); return; }
    if (typeof MediaRecorder === 'undefined') { toast(t('video.unsupported'), true); return; }
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    const fps = Math.max(1, Math.min(60, S.fps || 10));
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    const candidates = format === 'mp4' ? ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4'] : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mime = candidates.find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) { toast(t(format === 'mp4' ? 'video.noMp4' : 'video.unsupported'), true); return; }
    // H.264 needs even dimensions
    if (format === 'mp4') { canvas.width += canvas.width % 2; canvas.height += canvas.height % 2; }
    await warmRecorder(mime, canvas.width, canvas.height);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const finished = new Promise((r) => { rec.onstop = r; });
    Progress.start(t(format === 'mp4' ? 'file.exportMp4' : 'file.exportWebm'));
    try {
      rec.start();
      const n = frames > 1 ? frames : stackFiles;
      for (let i = 0; i < n; i++) {
        if (Progress.cancelled) break;
        Progress.update(i, n, t('status.frame', { n: i + 1, total: n }));
        let c;
        if (frames > 1) c = await renderFrameCanvas(img, i, true);
        else {
          const fileImg = await D.load(new Uint8Array(await P.readFile(S.series.files[i])));
          const r = await fileImg.render({ wc: img.state.wc, ww: img.state.ww, colormap: img.state.colormap, invert: img.state.invert });
          c = document.createElement('canvas'); c.width = r.width; c.height = r.height;
          const id = c.getContext('2d').createImageData(r.width, r.height); id.data.set(r.rgba); c.getContext('2d').putImageData(id, 0, 0);
          fileImg.release();
        }
        ctx.drawImage(c, 0, 0, canvas.width, canvas.height);
        if (track.requestFrame) track.requestFrame();
        await new Promise((r) => setTimeout(r, 1000 / fps));
      }
      rec.stop();
      await finished;
      if (Progress.cancelled) return;
      const type = format === 'mp4' ? 'video/mp4' : 'video/webm';
      const blob = new Blob(chunks, { type });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const saved = await P.saveFile({ name: `${stem()}_cine.${format}`, bytes, mime: type, filters: [{ name: format === 'mp4' ? 'MP4' : 'WebM', extensions: [format] }] });
      if (saved) toast(t('export.done', { name: P.basename(saved) }));
    } finally { Progress.finish(); if (frames > 1) await renderDicom({ frame: S.frame }); }
  }

  /* ══════════════ Settings (applied from the dialog) ══════════════ */
  async function applySetting(key, value) {
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    switch (key) {
      case 'theme': await setTheme(value); return;
      case 'customTheme': {
        await setOpt({ customTheme: value });
        window.Themes.setCustom(value);
        buildThemeMenus(); syncMenuState();
        if (window.Themes.get(opt('theme')).id === 'custom') await setTheme('custom');
        return;
      }
      case 'lang': await setLang(value); return;
      case 'sidebar': case 'rightPanel': case 'scaleBar': case 'interpolate': case 'cornerInfo': case 'markers': case 'overlays': case 'measurements': case 'burnAnnotations': case 'loop': case 'syncScroll': case 'refLines':
        if (!!opt(key) !== !!value) await toggleOption(key);
        return;
      default: break;
    }
    await setOpt({ [key]: value });
    if (key === 'wheelMode') viewer.wheelMode = value;
    if (key === 'measureUnit') { relabelAnnotations(); }
    if (key === 'annotationColor') viewer.colors = { line: value };
    if (key === 'defaultFps') { S.fps = value; $('fpsInput').value = value; if (S.cine) { stopCine(); startCine(); } }
    if (key === 'overlayColor' && img) await renderDicom({ overlayColor: hexToRgb(value) });
    if ((key === 'startScreen' || key === 'showStartOnLaunch') && startPage) startPage.refresh();
  }

  async function resetSettings() {
    const keep = { lastDir: S.settings.lastDir, windowBounds: S.settings.windowBounds };
    const patch = { ...DEFAULTS, ...keep };
    S.settings = { ...patch };
    await P.settings.set(patch);
    applyTheme(DEFAULTS.theme);
    window.I18n.setLang(DEFAULTS.lang); updateLangButton();
    document.body.classList.toggle('no-sidebar', !DEFAULTS.sidebar);
    $('sidebar').style.width = `${DEFAULTS.sidebarWidth}px`;
    $('treeSection').style.flexBasis = `${DEFAULTS.treeHeight}%`;
    viewer.interpolate = DEFAULTS.interpolate; viewer.showAnnotations = DEFAULTS.measurements; viewer.wheelMode = DEFAULTS.wheelMode; viewer.measureUnit = displayUnit(); viewer.colors = { line: DEFAULTS.annotationColor };
    relabelAnnotations();
    $('loopCheck').checked = DEFAULTS.loop; S.fps = DEFAULTS.defaultFps; $('fpsInput').value = S.fps;
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    if (img) await renderDicom({ overlays: DEFAULTS.overlays, overlayColor: hexToRgb(DEFAULTS.overlayColor) });
    buildStaticMenus(); syncMenuState(); refreshPanels(); updateCorners(); updateStatus(); viewer.resize();
    Dlg.broadcast('theme', DEFAULTS.theme); Dlg.broadcast('lang', DEFAULTS.lang);
    toast(t('settings.resetDone'));
  }

  function hexToRgb(hex) { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ''); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 255, 128]; }

  /* ══════════════ Tooltips (toolbar / icon buttons) ══════════════ */
  function bindTooltips() {
    const tip = $('tooltip');
    let timer = null;
    const show = (el) => {
      const text = el.getAttribute('data-tip') || el.getAttribute('title');
      if (!text) return;
      if (el.getAttribute('title')) { el.setAttribute('data-tip', el.getAttribute('title')); el.removeAttribute('title'); }
      tip.textContent = el.getAttribute('data-tip');
      tip.classList.add('show');
      const r = el.getBoundingClientRect();
      tip.style.left = '0px'; tip.style.top = '0px';
      const tr = tip.getBoundingClientRect();
      let x = r.left + r.width / 2 - tr.width / 2, y = r.bottom + 6;
      if (x < 4) x = 4; if (x + tr.width > window.innerWidth - 4) x = window.innerWidth - tr.width - 4;
      if (y + tr.height > window.innerHeight - 4) y = r.top - tr.height - 6;
      tip.style.left = `${x}px`; tip.style.top = `${y}px`;
    };
    const hide = () => { clearTimeout(timer); tip.classList.remove('show'); };
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest('.toolbar [title], .toolbar [data-tip], .menubar-right [title], .menubar-right [data-tip], .wl-bar [title], .side-header [title], .side-header [data-tip], .drive-bar [data-tip], .frame-bar [title], .frame-bar [data-tip], .series-bar [title], .series-bar [data-tip], .tags-toolbar [title], .tags-toolbar [data-tip]');
      if (!el) { hide(); return; }
      clearTimeout(timer);
      timer = setTimeout(() => show(el), 350);
    });
    document.addEventListener('mouseout', (e) => { if (e.target.closest && e.target.closest('[title], [data-tip]')) hide(); });
    document.addEventListener('mousedown', hide);
    window.addEventListener('blur', hide);
  }

  /* ══════════════ Language toggle (flag button) ══════════════ */
  function updateLangButton() {
    const b = $('langBtn');
    if (!b) return;
    const lang = window.I18n.lang;
    // the flag shows the language the click switches TO: UK flag while Korean, Korean flag while English
    b.querySelector('.flag').innerHTML = lang === 'ko' ? window.Icons.flag('gb') : window.Icons.flag('kr');
    b.setAttribute('data-tip', lang === 'ko' ? 'Switch to English' : '한국어로 전환');
  }

  /* ══════════════ Utilities ══════════════ */
  function fmt(v, digits) {
    if (!Number.isFinite(v)) return '';
    if (digits === undefined) return Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : String(+v.toFixed(2));
    return v.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }
  function fmtSize(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  /* Keep window / view across files of a stack (see openFileKeepView). */
  const _openDicom = openDicom;
  openDicom = async function (path, name, bytes) {   // eslint-disable-line no-func-assign
    const keep = S.keepNext;
    await _openDicom(path, name, bytes);
    const img = S.file && S.file.image;
    if (keep && img && img.gray) {
      const o = { invert: keep.invert, colormap: keep.colormap, voiFunction: keep.voiFunction };
      if (keep.custom && Number.isFinite(keep.wc)) { o.wc = keep.wc; o.ww = keep.ww; }
      await renderDicom(o);
      Object.assign(viewer.view, keep.view);
      viewer.redraw();
      updateCorners(); updateStatus();
    }
  };

  window.App = { MenuMirror, state: S, get startPage() { return startPage; }, showStart, hideStart, openSample, get viewer() { return viewer; }, get tree() { return tree; }, openPath, runAction, renderDicom, setTool, Progress, Dlg, History, get tabs() { return S.tabs; }, activateTab, closeTab };
  document.addEventListener('DOMContentLoaded', () => { init().catch((err) => showError(err)); });
})();
