/* DCM Viewer — renderer application: menus, toolbar, file tree, DICOM pipeline, panels, export, batch. */
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
    hover: null,
    renderToken: 0,
    loadToken: 0,
    histTimer: null,
  };
  const DEFAULTS = {
    theme: 'midnight', lang: 'ko', sidebar: true, sidebarWidth: 300, treeHeight: 50,
    interpolate: false, cornerInfo: true, markers: true, overlays: true, measurements: true, burnAnnotations: true, loop: true, invert: false,
    ruler: false, grid: false, wheelMode: 'zoom', defaultFps: 10, overlayColor: '#00ff80', annotationColor: '#ffd400', rememberLastDir: true, startupDir: '', confirmDelete: true,
  };
  const opt = (k) => (S.settings[k] === undefined ? DEFAULTS[k] : S.settings[k]);
  async function setOpt(patch) { Object.assign(S.settings, patch); await P.settings.set(patch); }

  let viewer, tree;

  /* ══════════════ Init ══════════════ */
  async function init() {
    await P.init();
    S.settings = { ...(P.settings.cache || {}) };
    document.body.classList.toggle('web', !P.isElectron);
    document.body.classList.toggle('electron', P.isElectron);
    window.I18n.setLang(opt('lang'));
    applyTheme(opt('theme'));
    $('sidebar').style.width = `${opt('sidebarWidth')}px`;
    $('treeSection').style.flexBasis = `${opt('treeHeight')}%`;
    document.body.classList.toggle('no-sidebar', !opt('sidebar'));
    $('loopCheck').checked = !!opt('loop');

    viewer = window.Viewer.create({ viewport: $('viewport'), canvas: $('imageCanvas'), overlay: $('overlayCanvas'), on: onViewerEvent });
    viewer.interpolate = !!opt('interpolate');
    viewer.showAnnotations = !!opt('measurements');
    viewer.showRuler = !!opt('ruler');
    viewer.showGrid = !!opt('grid');
    viewer.wheelMode = opt('wheelMode');
    viewer.colors = { line: opt('annotationColor') };
    S.fps = opt('defaultFps') || 10;
    $('fpsInput').value = S.fps;

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
    if (P.isElectron) window.electronAPI.onPopupEvent((msg) => Dlg.dispatch(msg));
    setTool('pan');
    syncMenuState();
    window.addEventListener('resize', () => viewer.resize());

    P.onOpenPath((p) => openPath(p));
    P.onMenuAction((a) => runAction(a));
    P.onDirChanged((dir) => { if (tree.root() === dir) tree.refresh(); });

    const info = await P.appInfo();
    S.appInfo = info;
    updateTitle();

    if (P.isElectron) {
      let dir = opt('startupDir');
      if (dir) { const st = await P.stat(dir); if (!st.exists || !st.isDir) dir = ''; }
      if (!dir) dir = await P.defaultDir();
      if (dir) tree.setRoot(dir);
    } else {
      const root = await P.mountSamples();
      if (root) tree.setRoot(root); else tree.showRoots();
    }
    D.preload(['parser']).catch(() => {});
    setStatus('status.ready');
    applyMinWindowSize();
  }

  /* ══════════════ Theme / language ══════════════ */
  function applyTheme(theme) {
    const th = window.Themes.apply(theme);
    $('themeName').textContent = th.name;
    drawHistogram();
  }
  async function setTheme(theme) { await setOpt({ theme }); applyTheme(theme); syncMenuState(); Dlg.broadcast('theme', window.Themes.get(theme).id); }
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
      panel.innerHTML = '';
      let scheme = '';
      for (const th of window.Themes.list()) {
        if (th.scheme !== scheme) { if (scheme) panel.append(Object.assign(document.createElement('div'), { className: 'menu-sep' })); scheme = th.scheme; }
        panel.append(themeButton(th));
      }
    }
  }
  const RECENT_MAX = 10;
  function pushRecent(dir) {
    if (!dir || !P.isElectron) return;
    const list = (opt('recentDirs') || []).filter((d) => d.toLowerCase() !== dir.toLowerCase());
    list.unshift(dir);
    setOpt({ recentDirs: list.slice(0, RECENT_MAX) });
    buildRecentMenu();
  }
  function buildRecentMenu() {
    const panel = $('recentMenu').querySelector('.menu-panel');
    panel.innerHTML = '';
    const list = P.isElectron ? (opt('recentDirs') || []) : [];
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
    document.querySelectorAll('[data-action="voi-function"]').forEach((b) => b.classList.toggle('checked', !!st && st.voiFunction === b.dataset.value));
    document.querySelectorAll('[data-action="colormap"]').forEach((b) => b.classList.toggle('checked', !!st && st.colormap === b.dataset.value));
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
    $('playBtn').textContent = S.cine ? '❚❚' : '▶';
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
    document.querySelectorAll('.menubar .menu, .toolbar .menu').forEach((m) => {
      const title = m.querySelector('.menu-title');
      title.addEventListener('click', (e) => { e.stopPropagation(); if (open === m) close(); else openMenu(m); });
      title.addEventListener('mouseenter', () => { if (open && open !== m && m.closest('#menus') && open.closest('#menus')) openMenu(m); });
    });
    for (const id of ['themeDropdown', 'exportMenu']) {
      $(id).addEventListener('click', (e) => {
        const b = e.target.closest('button[data-action]');
        if (b) { e.stopPropagation(); close(); runAction(b.dataset.action, b); }
      });
    }
    document.addEventListener('click', (e) => { if (!e.target.closest('.menu-panel') || e.target.closest('button[data-action]')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    menus.addEventListener('click', (e) => {
      const rm = e.target.closest('.menu-remove');
      if (rm) { e.stopPropagation(); runAction('recent-remove', rm.closest('button')); return; }   // keeps the menu open
      const b = e.target.closest('button[data-action]');
      if (b) { e.stopPropagation(); close(); runAction(b.dataset.action, b); }
    });
  }

  /* ══════════════ UI binding ══════════════ */
  function bindUI() {
    bindMenubar();
    // Toolbar / context menus / dialogs: any button with data-action
    document.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-action]');
      if (!b || b.closest('#menus') || b.closest('#themeDropdown') || b.closest('#exportMenu')) return;
      const ctx = b.closest('.ctx-menu');
      if (ctx) hideContextMenus();
      runAction(b.dataset.action, b);
    });
    $('modalHost').addEventListener('mousedown', (e) => { if (e.target === $('modalHost')) Dlg.closeAll(); });

    // Tabs
    document.querySelectorAll('.tabs .tab').forEach((tab) => tab.addEventListener('click', () => {
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
    if (ctrl && key.toLowerCase() === 'p') return act('print');
    if (ctrl && key === '0') return act('fit');
    if (ctrl && key === '1') return act('actual');
    if (ctrl && key === 'ArrowLeft') return act('rotate-left');
    if (ctrl && key === 'ArrowRight') return act('rotate-right');
    if (key === 'F1') return act('shortcuts');
    if (ctrl && key === ',') return act('settings');
    if (key === 'F9') return act('toggle', { dataset: { key: 'sidebar' } });
    if (key === 'F11') return act('fullscreen');
    if (key === 'F12' && P.isElectron) return act('devtools');
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
      case 'm': case 'M': return act('mpr');
      case 'k': case 'K': return act('toggle', { dataset: { key: 'ruler' } });
      case 'g': case 'G': return act('toggle', { dataset: { key: 'grid' } });
      case 'a': case 'A': return act('wl-auto');
      case 'w': return act('wl-file');
      case 'W': return act('wl-reset');
      case ' ': return act('cine-toggle');
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
      case 'Escape': viewer.setTool(S.tool); hideContextMenus(); return;
      default: break;
    }
    const tools = { 1: 'pan', 2: 'wl', 3: 'zoom', 4: 'stack', 5: 'probe', 6: 'length', 7: 'angle', 8: 'rect', 9: 'ellipse', 0: 'text' };
    if (tools[key] && !ctrl) { e.preventDefault(); setTool(tools[key]); }
  }

  /* ══════════════ Actions ══════════════ */
  async function runAction(action, el) {
    const ds = (el && el.dataset) || {};
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    try {
      switch (action) {
        case 'open-file': { const files = await P.pickFiles({ multiple: false }); if (files[0]) openPath(files[0]); break; }
        case 'open-folder': { const dir = await P.pickFolder(); if (dir) tree.setRoot(dir); break; }
        case 'open-recent': { const st = await P.stat(ds.path); if (st.exists && st.isDir) tree.setRoot(ds.path); else { toast(t('file.recentMissing', { dir: ds.path }), true); await runAction('recent-remove', el); } break; }
        case 'recent-remove': { await setOpt({ recentDirs: (opt('recentDirs') || []).filter((d) => d !== ds.path) }); buildRecentMenu(); break; }
        case 'recent-clear': await setOpt({ recentDirs: [] }); buildRecentMenu(); break;
        case 'close-file': closeFile(); break;
        case 'exit': window.close(); break;
        case 'export': await exportImage(ds.format || 'png'); break;
        case 'export-tiff16': await exportTiff16(); break;
        case 'export-frames': await exportAllFrames(); break;
        case 'export-gif-anim': await exportAnimatedGif(); break;
        case 'export-tags': await exportTags(ds.format || 'txt'); break;
        case 'copy-image': await copyImage(); break;
        case 'copy-tags': if (img) { await P.clipboardWriteText(D.tagsToText(img.tags, 'txt')); toast(t('msg.copied')); } break;
        case 'batch': openBatchDialog(); break;
        case 'mpr': openMpr(); break;
        case 'anonymize': openAnonymize(); break;
        case 'export-webm': await exportWebm(); break;
        case 'print': await printImage(); break;
        case 'fit': viewer.fit(); break;
        case 'actual': viewer.actual(); break;
        case 'zoom-in': viewer.zoomBy(1.25); break;
        case 'zoom-out': viewer.zoomBy(0.8); break;
        case 'rotate-left': viewer.rotate(-90); break;
        case 'rotate-right': viewer.rotate(90); break;
        case 'flip-h': viewer.flip('h'); break;
        case 'flip-v': viewer.flip('v'); break;
        case 'reset-view': viewer.reset(); break;
        case 'toggle': await toggleOption(ds.key); break;
        case 'fullscreen': P.toggleFullscreen(); break;
        case 'devtools': P.toggleDevTools(); break;
        case 'theme': await setTheme(ds.value); break;
        case 'theme-toggle': { const list = window.Themes.list(); const i = list.findIndex((x) => x.id === window.Themes.get(opt('theme')).id); await setTheme(list[(i + 1) % list.length].id); break; }
        case 'settings': openSettings(); break;
        case 'settings-reset': await resetSettings(); break;
        case 'lang': await setLang(ds.value); break;
        case 'tool': setTool(ds.tool); break;
        case 'delete-last': viewer.deleteLast(); break;
        case 'clear-measurements': viewer.clear(); break;
        case 'wl-auto': if (img) { const a = img.autoWindow(); if (a) await renderDicom({ wc: a.wc, ww: a.ww, voiLut: -1 }); } break;
        case 'wl-file': if (img) { const w = img.windowsFor(S.frame)[+(ds.index || 0)]; if (w) await renderDicom({ wc: w.wc, ww: w.ww, voiLut: -1 }); else await renderDicom({ resetWindow: true }); } break;
        case 'wl-reset': if (img) await renderDicom({ resetWindow: true, invert: img.defaultInvert(), colormap: 'gray' }); break;
        case 'preset': { const p = presetsFor(img).find((x) => x.id === ds.value); if (p) await renderDicom({ wc: p.wc, ww: p.ww, voiLut: -1 }); break; }
        case 'voi-lut': await renderDicom({ voiLut: +ds.index }); break;
        case 'voi-function': await renderDicom({ voiFunction: ds.value }); break;
        case 'colormap': await renderDicom({ colormap: ds.value }); break;
        case 'cine-toggle': if (S.cine) stopCine(); else startCine(); break;
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
      else if (S.file) { await setOpt({ invert: !opt('invert') }); await renderImage(); }
      syncMenuState();
      return;
    }
    if (key === 'loop') { $('loopCheck').checked = !$('loopCheck').checked; await setOpt({ loop: $('loopCheck').checked }); syncMenuState(); return; }
    const value = !opt(key);
    await setOpt({ [key]: value });
    switch (key) {
      case 'sidebar': document.body.classList.toggle('no-sidebar', !value); viewer.resize(); break;
      case 'interpolate': viewer.interpolate = value; break;
      case 'measurements': viewer.showAnnotations = value; break;
      case 'ruler': viewer.showRuler = value; break;
      case 'grid': viewer.showGrid = value; break;
      case 'overlays': if (img) await renderDicom({ overlays: value }); break;
      case 'cornerInfo': case 'markers': updateCorners(); break;
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
    if (DICOM_EXTS.has(ext) || IMAGE_EXTS.has(ext)) return true;
    if (!ext && !/^(dicomdir|readme|license)$/i.test(name)) return true;   // DICOM files often carry no extension
    return false;
  }

  function normPath(p) { return P.isElectron && P.sep === '\\' ? String(p).replace(/\//g, '\\') : String(p); }
  async function openPath(p) {
    if (!p) return;
    p = normPath(p);
    const st = await P.stat(p);
    if (st.exists && st.isDir) { tree.setRoot(p); return; }
    await openFile(p);
  }

  async function openFile(path) {
    const name = P.basename(path);
    stopCine();
    showLoading(t('status.decoding', { name }));
    const token = ++S.loadToken;
    try {
      const buf = await P.readFile(path);
      if (token !== S.loadToken) return;
      const bytes = new Uint8Array(buf);
      const ext = P.extname(name);
      const dicom = DICOM_EXTS.has(ext) || (!IMAGE_EXTS.has(ext) && D.isDicom(bytes));
      if (dicom) await openDicom(path, name, bytes);
      else if (IMAGE_EXTS.has(ext)) await openImage(path, name, bytes, ext);
      else throw new Error(t('msg.unsupported', { name }));
      // Keep the tree in sync (a file opened from the OS or a drop may live in another folder).
      const dir = P.dirname(path);
      if (tree.root() !== dir && P.isElectron) await tree.setRoot(dir);
      tree.select(path);
      updateSeriesFromTree(path);
      if (P.isElectron && opt('rememberLastDir')) setOpt({ lastDir: dir });
    } catch (err) {
      if (err && err.meta) {   // DICOM without pixel data: still show the tags
        S.file = { path, name, size: 0, kind: 'dicom-meta', meta: err.meta, tags: err.tags || [] };
        viewer.setSource(null);
        refreshPanels();
        syncMenuState();
        toast(t('msg.noPixelData'));
      } else {
        showError(err, t('msg.loadFailed', { name }));
      }
    } finally {
      if (token === S.loadToken) hideLoading();
    }
  }

  async function openDicom(path, name, bytes) {
    const image = await D.load(bytes);
    if (S.file && S.file.image && S.file.image.release) S.file.image.release();
    S.file = { path, name, size: bytes.length, kind: 'dicom', image, warning: image.warning };
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
    if (S.file && S.file.image && S.file.image.release) S.file.image.release();
    S.file = { path, name, size: bytes.length, kind: 'image', bitmapCanvas: c, ext, pages, bytes: pages > 1 ? bytes : null };
    S.frame = 0;
    viewer.annotations = [];
    await renderImage(true);
    buildWindowMenus();
    refreshPanels();
    syncMenuState();
    updateFrameBar();
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
    viewer.setSource({ canvas: c, width: c.width, height: c.height, spacing: null, aspect: 1 }, { keepView: !newFile });
    updateCorners();
    updateStatus();
  }

  function closeFile() {
    stopCine();
    if (S.file && S.file.image && S.file.image.release) S.file.image.release();
    S.file = null; S.frameCanvas = null; S.frame = 0;
    viewer.setSource(null);
    refreshPanels(); syncMenuState(); updateCorners(); updateStatus(); updateFrameBar();
    buildWindowMenus();
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
    let c = S.frameCanvas;
    if (!c || c.width !== r.width || c.height !== r.height || c === (f.bitmapCanvas || null)) { c = document.createElement('canvas'); c.width = r.width; c.height = r.height; }
    const x = c.getContext('2d');
    const id = x.createImageData(r.width, r.height);
    id.data.set(r.rgba);
    x.putImageData(id, 0, 0);
    S.frameCanvas = c;
    const fi = img.frameInfo(S.frame);
    const sp = fi.pixelSpacing;
    const aspect = sp ? sp[0] / sp[1] : (img.geometry.aspect || 1);
    viewer.setSource({ canvas: c, width: r.width, height: r.height, spacing: sp, aspect }, { keepView: !newFile });
    updatePresetSelect();
    updateCorners();
    updateStatus();
    scheduleHistogram();
    relabelAnnotations();
    if (opts.wc !== undefined || opts.ww !== undefined || opts.voiLut !== undefined || opts.resetWindow || opts.colormap || opts.voiFunction || opts.invert !== undefined) syncMenuState();
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
    renderDicom({ ww, wc, voiLut: -1 });
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
  function startCine() {
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
  function stopCine() { if (S.cine) { clearInterval(S.cine); S.cine = null; syncMenuState(); } }

  /* ══════════════ Series (files of the folder) ══════════════ */
  function updateSeriesFromTree(path) {
    const dir = P.dirname(path);
    if (S.series.sorted && S.series.dir === dir && S.series.files.includes(path)) { S.series.index = S.series.files.indexOf(path); updateSeriesBar(); return; }
    const files = tree.files();
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
    await openFile(path);
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
      card.innerHTML = `<div class="series-title">${esc(g.modality || '?')} · ${esc(g.description || (g.number != null ? `Series ${g.number}` : g.key))}</div>
        <div class="series-sub">${esc(g.patient || '')}${g.studyDate ? ' · ' + esc(g.studyDate) : ''} · ${t('series.files', { n: g.items.length })}</div>`;
      card.addEventListener('click', () => selectSeriesGroup(g, true));
      el.append(card);
    }
  }

  /* ══════════════ Viewer events ══════════════ */
  function onViewerEvent(ev, payload) {
    switch (ev) {
      case 'view': updateCorners(); updateStatus(); break;
      case 'wl': onWlDrag(payload); break;
      case 'stack': stepFrame(payload.delta); break;
      case 'hover': S.hover = payload; updateProbe(); break;
      case 'measure': labelAnnotation(payload.annotation); viewer.redraw(); break;
      case 'text': promptText(t('msg.textPrompt')).then((text) => { if (text) { viewer.annotations.push({ type: 'text', points: [{ x: payload.x, y: payload.y }], text }); viewer.redraw(); } }); break;
      case 'context': showContextMenu($('ctxViewer'), payload.clientX, payload.clientY); break;
      default: break;
    }
  }

  function spacing() {
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    return img ? img.frameInfo(S.frame).pixelSpacing : null;
  }

  function labelAnnotation(a) {
    const sp = spacing();
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    const pts = a.points;
    if (a.type === 'length' && pts.length >= 2) {
      const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
      const px = Math.hypot(dx, dy);
      a.label = sp ? `${fmt(Math.hypot(dx * sp[1], dy * sp[0]), 2)} mm` : `${fmt(px, 1)} px`;
    } else if (a.type === 'angle' && pts.length === 3) {
      const sx = sp ? sp[1] : 1, sy = sp ? sp[0] : 1;
      const v1 = [(pts[0].x - pts[1].x) * sx, (pts[0].y - pts[1].y) * sy], v2 = [(pts[2].x - pts[1].x) * sx, (pts[2].y - pts[1].y) * sy];
      const dot = v1[0] * v2[0] + v1[1] * v2[1];
      const n = Math.hypot(...v1) * Math.hypot(...v2) || 1;
      a.label = `${fmt(Math.acos(Math.max(-1, Math.min(1, dot / n))) * 180 / Math.PI, 1)}°`;
    } else if (a.type === 'rect' || a.type === 'ellipse') {
      const region = { x: Math.min(pts[0].x, pts[1].x), y: Math.min(pts[0].y, pts[1].y), w: Math.abs(pts[1].x - pts[0].x), h: Math.abs(pts[1].y - pts[0].y), shape: a.type };
      const st = img ? img.stats(region, S.frame) : null;
      const area = st && st.areaMm2 != null ? `${fmt(st.areaMm2, 1)} mm²` : `${fmt(region.w * region.h * (a.type === 'ellipse' ? Math.PI / 4 : 1), 0)} px²`;
      if (st && st.n) a.label = `${t('roi.area', { a: area })}\n${t('roi.stats', { n: st.n, mean: fmt(st.mean, 1), sd: fmt(st.std, 1), min: fmt(st.min, 0), max: fmt(st.max, 0) })}${st.units ? ' ' + st.units : ''}`;
      else a.label = t('roi.area', { a: area });
    }
  }
  function relabelAnnotations() { for (const a of viewer.annotations) labelAnnotation(a); viewer.redraw(); }

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
        `${img.width} × ${img.height}${fi.pixelSpacing ? ` · ${fmt(fi.pixelSpacing[1], 3)} × ${fmt(fi.pixelSpacing[0], 3)} mm` : ''}`,
        Number.isFinite(fi.sliceLocation) ? `SL ${fmt(fi.sliceLocation, 2)}${Number.isFinite(fi.sliceThickness) ? ` · T ${fmt(fi.sliceThickness, 2)} mm` : ''}` : '',
        m.instanceNumber ? `#${m.instanceNumber}${m.seriesNumber ? ` (S${m.seriesNumber})` : ''}` : '',
      ]) + '<div class="probe"></div>';
    } else if (S.file) {
      $('cornerTL').innerHTML = lines([S.file.name]);
      $('cornerTR').innerHTML = '';
      $('cornerBL').innerHTML = lines([`${t('status.zoom', { z: Math.round(v.scale * 100) })}${v.rotation ? ` · ${v.rotation}°` : ''}`]);
      $('cornerBR').innerHTML = lines([S.frameCanvas ? `${S.frameCanvas.width} × ${S.frameCanvas.height}` : '']) + '<div class="probe"></div>';
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
    if (f && f.warning) $('statusPath').textContent += ` — ${t('msg.warning', { text: f.warning })}`;
  }

  function setStatus(key) { $('statusPath').textContent = t(key); }
  /* The window may not shrink below the width where toolbar or menu-bar buttons would be clipped. */
  function applyMinWindowSize() {
    if (!P.isElectron) return;
    const need = (el) => { let w = 0; for (const c of el.children) w += c.getBoundingClientRect().width + 3; return w + 24; };
    const w = Math.ceil(Math.max(need($('toolbar')), need($('menubar')), 900));
    window.electronAPI.setMinSize(w, 600);
  }
  /* Window / tab title: program name and version, then the open file and its patient / modality. */
  function updateTitle() {
    const info = S.appInfo || {};
    const parts = [`${info.name || 'DCM Viewer'} ${info.version ? 'v' + info.version : ''}`.trim()];
    const f = S.file;
    if (f) {
      const img = f.kind === 'dicom' ? f.image : null;
      const extra = img ? [img.meta.patientName, img.meta.modality, img.frames > 1 ? t('status.frame', { n: S.frame + 1, total: img.frames }) : ''].filter(Boolean).join(' · ') : '';
      parts.push(`${f.name}${extra ? ` (${extra})` : ''}`);
    }
    document.title = parts.join(' — ');
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
      for (const [k, v] of Object.entries(meta)) add(t(`meta.${k}`), v);
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

  /* Print: a preview popup; "Print" goes straight to the system default printer, "System dialog…" lets the user pick. */
  async function printImage() {
    const canvas = currentCanvas();
    if (!canvas) { toast(t('export.noImage')); return; }
    const img = S.file.kind === 'dicom' ? S.file.image : null;
    const m = img ? img.meta : {};
    const info = img ? ['patientName', 'patientId', 'modality', 'studyDate', 'studyDescription', 'seriesDescription', 'institution'].filter((k) => m[k]).map((k) => [t(`meta.${k}`), m[k]]) : [[t('meta.dimensions'), `${canvas.width} × ${canvas.height}`]];
    if (img && img.gray && !img.palette) info.push([t('meta.window'), `W ${fmt(img.state.ww)} / L ${fmt(img.state.wc)}`]);
    const dataUrl = canvas.toDataURL(canvas.width * canvas.height > 4e6 ? 'image/jpeg' : 'image/png', 0.92);
    Dlg.open('print', { dataUrl, name: S.file.name, info }, async (event, data) => {
      if (event !== 'print') return;
      const r = await P.print(data.html, { silent: data.silent, landscape: data.landscape, paper: data.paper, copies: data.copies });
      if (r && r.ok === false && r.reason && r.reason !== 'cancelled') toast(t('msg.printFailed', { reason: r.reason }), true);
      else if (data.silent) toast(t('print.sent'));
    });
  }

  /* ══════════════ Tree operations ══════════════ */
  async function treePaste() {
    if (!P.isElectron) { toast(t('msg.notInBrowser'), true); return; }
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
    if (!P.isElectron) { toast(t('msg.notInBrowser'), true); return; }
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

  function onTreeRoot(dir) {
    $('treePath').textContent = dir || '';
    $('treePath').title = dir || '';
    if (S.watchedDir && S.watchedDir !== dir) P.unwatchDir(S.watchedDir);
    if (dir) { P.watchDir(dir); S.watchedDir = dir; }
    if (dir && P.isElectron && opt('rememberLastDir')) setOpt({ lastDir: dir });
    if (dir) pushRecent(dir);
    if (!S.series.sorted || S.series.dir !== dir) { S.series = { files: [], index: -1, dir, sorted: false, groups: [] }; updateSeriesBar(); renderSeriesPanel(); }
  }

  /* ══════════════ Context menus / toast ══════════════ */
  function showContextMenu(menu, x, y, ctx) {
    hideContextMenus();
    S.ctx = ctx || null;
    menu.classList.add('open');
    const r = menu.getBoundingClientRect();
    const px = Math.min(x, window.innerWidth - r.width - 4), py = Math.min(y, window.innerHeight - r.height - 4);
    menu.style.left = `${Math.max(0, px)}px`; menu.style.top = `${Math.max(0, py)}px`;
    if (menu === $('ctxTree')) {
      const one = ctx && ctx.paths.length === 1;
      menu.querySelector('[data-action="tree-open"]').disabled = !(one && ctx.hit && !ctx.hit.isDir);
      menu.querySelector('[data-action="tree-paste"]').disabled = !(S.treeClipboard && S.treeClipboard.paths.length);
    }
  }
  function hideContextMenus() { document.querySelectorAll('.ctx-menu.open').forEach((m) => m.classList.remove('open')); }
  let toastTimer = null;
  function toast(text, isError) {
    const el = $('toast');
    el.textContent = text;
    el.classList.toggle('error', !!isError);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), isError ? 5000 : 2500);
  }

  /* ══════════════ Dialogs: separate popup windows in Electron, in-page modals in the browser ══════════════ */
  const Dlg = {
    handlers: new Map(),   // kind → onEvent(event, data)
    inpage: new Map(),     // kind → { box, listeners }
    async open(kind, payload = {}, onEvent) {
      this.handlers.set(kind, onEvent || (() => {}));
      if (P.isElectron) {
        await window.electronAPI.popupOpen({ kind, payload, theme: window.Themes.get(opt('theme')).id, lang: window.I18n.lang, ...window.Dialogs.size(kind) });
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
      if (P.isElectron) { window.electronAPI.popupSend(kind, event, data); return; }
      const d = this.inpage.get(kind);
      if (d) d.listeners.forEach((fn) => fn(event, data));
    },
    broadcast(event, data) {
      if (P.isElectron) { window.electronAPI.popupSend(null, event, data); return; }
      for (const d of this.inpage.values()) d.listeners.forEach((fn) => fn(event, data));
    },
    close(kind) {
      if (P.isElectron) { window.electronAPI.popupClose(kind); return; }
      if (this.inpage.has(kind)) { this.inpage.delete(kind); $('modalHost').classList.remove('open'); $('modalBox').innerHTML = ''; }
      const h = this.handlers.get(kind);
      if (h) h('closed');
    },
    closeAll() { for (const k of [...this.inpage.keys()]) this.close(k); },
    dispatch({ kind, event, data }) { const h = this.handlers.get(kind); if (h) h(event, data); },
  };

  /* Long operations show a progress popup (bar + %), optionally cancellable. */
  const Progress = {
    last: null, cancelled: false, open: false,
    start(title, { cancellable = true } = {}) {
      this.cancelled = false; this.open = true;
      this.last = { title, done: 0, total: 0, text: '', cancellable };
      Dlg.open('progress', this.last, (event) => {
        if (event === 'ready') Dlg.send('progress', 'update', this.last);
        if (event === 'cancel' || (event === 'closed' && this.open)) this.cancelled = true;
      });
    },
    update(done, total, text) {
      if (!this.open) return;
      this.last = { ...this.last, done, total, text: text || '' };
      Dlg.send('progress', 'update', this.last);
    },
    finish() { if (!this.open) return; this.open = false; Dlg.close('progress'); },
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
    Dlg.open('settings', { settings: S.settings, defaults: DEFAULTS, isElectron: P.isElectron }, async (event, data) => {
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
    Dlg.open('anonymize', {}, async (event, data) => { if (event === 'run') await anonymizeAndSave(data); });
  }

  /* Overwrite the values of identifying elements in a copy of the file bytes (lengths are kept, so the
   * structure stays valid) and save it as <name>_anon.dcm. */
  async function anonymizeAndSave({ tags, privateTags, replacement }) {
    const f = S.file;
    const src = new Uint8Array(await P.readFile(f.path));
    const bytes = new Uint8Array(src);   // copy
    const parsed = await D.parseRaw(bytes);
    const targets = new Set(tags.map((tg) => 'x' + tg.toLowerCase()));
    let count = 0;
    const visit = (ds) => {
      for (const key of Object.keys(ds.elements)) {
        const e = ds.elements[key];
        const group = parseInt(key.slice(1, 5), 16);
        const isPrivate = group % 2 === 1;
        if (e.items) { e.items.forEach((it) => { if (it.dataSet) visit(it.dataSet); }); continue; }
        if (!e.length || e.length > 1e7) continue;
        if (targets.has(key) || (privateTags && isPrivate)) {
          const vr = e.vr || '';
          const text = /^(DA)$/.test(vr) ? '19000101' : /^(TM)$/.test(vr) ? '000000' : /^(DS|IS|US|SS|UL|SL|FL|FD)$/.test(vr) ? '0' : isPrivate ? '' : replacement;
          const fill = isPrivate && !e.vr ? 0 : 0x20;
          for (let i = 0; i < e.length; i++) bytes[e.dataOffset + i] = i < text.length ? text.charCodeAt(i) : fill;
          count++;
        }
      }
    };
    visit(parsed);
    const name = `${stem()}_anon.dcm`;
    const saved = await P.saveFile({ name, bytes, mime: 'application/dicom', filters: [{ name: 'DICOM', extensions: ['dcm'] }] });
    if (saved) toast(t('anon.done', { n: count, name: P.basename(saved) }));
  }

  /* Record the cine loop (or the series stack) into a WebM video with MediaRecorder. */
  async function exportWebm() {
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
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const finished = new Promise((r) => { rec.onstop = r; });
    Progress.start(t('file.exportWebm'));
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
      const blob = new Blob(chunks, { type: 'video/webm' });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const saved = await P.saveFile({ name: `${stem()}_cine.webm`, bytes, mime: 'video/webm', filters: [{ name: 'WebM', extensions: ['webm'] }] });
      if (saved) toast(t('export.done', { name: P.basename(saved) }));
    } finally { Progress.finish(); if (frames > 1) await renderDicom({ frame: S.frame }); }
  }

  /* ══════════════ Settings (applied from the dialog) ══════════════ */
  async function applySetting(key, value) {
    const img = S.file && S.file.kind === 'dicom' ? S.file.image : null;
    switch (key) {
      case 'theme': await setTheme(value); return;
      case 'lang': await setLang(value); return;
      case 'sidebar': case 'interpolate': case 'cornerInfo': case 'markers': case 'overlays': case 'measurements': case 'burnAnnotations': case 'loop':
        if (!!opt(key) !== !!value) await toggleOption(key);
        return;
      default: break;
    }
    await setOpt({ [key]: value });
    if (key === 'wheelMode') viewer.wheelMode = value;
    if (key === 'annotationColor') viewer.colors = { line: value };
    if (key === 'defaultFps') { S.fps = value; $('fpsInput').value = value; if (S.cine) { stopCine(); startCine(); } }
    if (key === 'overlayColor' && img) await renderDicom({ overlayColor: hexToRgb(value) });
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
    viewer.interpolate = DEFAULTS.interpolate; viewer.showAnnotations = DEFAULTS.measurements; viewer.wheelMode = DEFAULTS.wheelMode; viewer.colors = { line: DEFAULTS.annotationColor };
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
      const el = e.target.closest('.toolbar [title], .toolbar [data-tip], .menubar-right [title], .menubar-right [data-tip], .side-header [title], .side-header [data-tip], .frame-bar [title], .frame-bar [data-tip], .series-bar [title], .series-bar [data-tip], .tags-toolbar [title], .tags-toolbar [data-tip]');
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
    b.querySelector('.flag').innerHTML = lang === 'ko' ? window.Icons.flag('kr') : window.Icons.flag('us');
    b.querySelector('.lang-code').textContent = lang === 'ko' ? '한국어' : 'English';
    b.setAttribute('data-tip', t('view.languageToggle'));
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

  window.App = { state: S, get viewer() { return viewer; }, get tree() { return tree; }, openPath, runAction, renderDicom, setTool, Progress, Dlg };
  document.addEventListener('DOMContentLoaded', () => { init().catch((err) => showError(err)); });
})();
