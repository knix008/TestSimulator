// The application shell in the MyCAD layout: menu bar (with the workbench
// selector), toolbar (language, theme, settings and about on the right), the
// tool panel and model tree on the left, document tabs + viewport + chart
// strip in the middle, the property panel on the right and the status bar.
import { h, replace, numberField, unionJack, taegukgi, aboutMark, themeSwatch, downloadName, parseNumber } from './dom.js';
import { Editor2D, bcColor, materialColor } from './editor2d.js';
import { drawLineChart, drawBarChart, SERIES_COLORS } from './charts.js';
import * as dialogs from './dialogs.js';
import { showPrint } from './printdialog.js';
import * as engineering from './engineering.js';
import { StartPage } from './startpage.js';
import { iconOf } from './icons.js';
import { Tutorial, STEPS as TUTORIAL_STEPS } from './tutorial.js';
import { t, setLanguage, getLanguage } from '../core/i18n.js';
import { MENUS, WORKBENCHES, TOOLBAR_GROUPS, CONTEXT_MENUS, SHORTCUTS, commandIcon, commandName, commandTip } from '../core/commands.js';
import { THEMES, resolveTheme, themeVars, themesByMode, CUSTOM_THEME_ID, createCustomTheme, sanitizeTheme } from '../core/themes.js';
import { saveSettings, addRecent, toDisplayT, tUnitLabel, fromDisplayT, ANIMATIONS, toDisplayLength } from '../core/settings.js';
import {
  emptyModel, normalizeModel, parseModel, serializeModel, newId, bodyBounds, moveBody, resizeBody, checkModel, engineModel,
  cellCount, boundaryTargets, EXTENSION, interpolate, cellSize,
} from '../core/model.js';
import { materialFromLibrary, materialName } from '../core/materials.js';
import { field, viewField, range, rangeAllFrames, sampleLine, fieldCsv, resultVtk, probesCsv, lineCsv, sampleLine3D, slice as sliceField, bodyIntegrals, cellAt } from '../core/result.js';
import { lut, niceTicks, formatValue } from '../core/colormap.js';
import { parseNodeCsv } from '../core/heatmap.js';
import { comfortFields } from '../core/comfort.js';
import { relabelModel } from '../core/model-i18n.js';
import { calculixDeck, bodiesFromDxf } from '../core/interop.js';
import { nastranBdf, ansysCdb, comsolMphtxt, gmshMsh, resultVtu, modelStl, dxfFromModel, thermToModel, modelToTherm, gmshToModel, IMPORT_EXTENSIONS } from '../core/formats.js';
import { deckReader } from '../core/decks.js';
import { idfToModel } from '../core/idf.js';
import * as native from '../platform/native.js';
import { popoutsEnabled, openPopout, placePopout, hidePopout, setInlinePredicate, popoutDocuments } from '../platform/popout.js';
import { runStudy, cancelStudy, engineKind } from '../platform/solver.js';

const FIELD_COMMANDS = { fieldT: 'T', fieldFlux: 'flux', fieldVelocity: 'velocity', fieldPressure: 'pressure', fieldTurbulence: 'turbulence', fieldStress: 'stress', fieldDisp: 'disp', fieldMode: 'mode', fieldLiquid: 'liquid', fieldVoltage: 'voltage', fieldCurrent: 'current', fieldComfort: 'comfort', fieldPPD: 'ppd', fieldCalc: 'calc' };
const FIELD_REQUIRES = { T: 'T', flux: 'qx', velocity: 'u', pressure: 'p', turbulence: 'nut', stress: 'vonMises', disp: 'dispX', mode: 'modeX_1', liquid: 'liquid', voltage: 'V', current: 'J', comfort: 'u', ppd: 'u' };
const BC_COMMANDS = { bcTemperature: 'temperature', bcFlux: 'flux', bcConvection: 'convection', bcRadiation: 'radiation', bcAdiabatic: 'adiabatic', bcContact: 'contact', bcThinLayer: 'thinLayer', bcInlet: 'inlet', bcOutlet: 'outlet', bcOpen: 'open', bcInternalFan: 'internalFan', bcVoltage: 'voltage', bcGround: 'ground', bcCurrent: 'currentIn', bcFixed: 'fixed', bcPressure: 'pressure', bcForce: 'force' };
const TOOLS = ['select', 'rect', 'circle', 'polygon', 'probe', 'lineCut'];
const START_KEEPS = new Set(['showAxes', 'thermalAnalysis', 'textCut', 'textCopy', 'textPaste', 'textSelectAll', 'exportChart', 'showGrid', 'showMesh', 'showRulers', 'about', 'home', 'settings', 'shortcuts', 'usage', 'tutorialDoc', 'tutorial', 'batchHelp', 'newFromSample', 'open', 'materials', 'heatmapImport', 'heatmapView', 'heatmapStats', 'heatmapExport', 'heatmapCompare', 'pcbStackup', 'quit', 'clearRecent', 'toolPanel', 'propertyPanel', 'chartPanel', 'fullscreen']);

let docCounter = 0;
let resultCounter = 0;

export function startApp(root, settings) {
  const state = {
    settings,
    docs: [],
    activeId: null,
    tool: 'select',
    view: '2d',
    fieldKind: 'T',
    showResult: false,
    isotherms: false,
    vectors: false,
    streamlines: false,
    mode: 0,
    deformed: false,
    playing: false,
    layer: null,
    solving: false,
    progress: null,
    status: 'statusReady',
    cursor: null,
    chartTab: 'probes',
    fonts: [],
    clipboard: null,
    heatmap: { data: null, name: null, time: null, limit: null, power: 2, resolution: 160, showNodes: true },
  };
  let editor = null;
  let startPage = null;
  let tutorial = null;
  // While the tutorial runs, dialogs and menus stay in the page: its spotlight points at them there.
  setInlinePredicate(() => Boolean(tutorial?.active));
  let view3d = null;
  let themePopped = false;
  let menuOpen = null;
  let playTimer = null;

  // ───────────────────────── documents and history
  const doc = () => state.docs.find((d) => d.id === state.activeId) ?? state.docs[0];

  function addDoc(model, path = null) {
    const d = { id: `doc${++docCounter}`, model: normalizeModel(model), path, dirty: false, past: [], future: [], pending: null, selection: null, result: null, stale: false, frame: 0, lineCut: null };
    state.docs.push(d);
    state.activeId = d.id;
    state.showResult = false;
    state.layer = null;
    if (editor) editor.fitted = false;
    return d;
  }

  /** Applies fn(model) → model. `commit` false keeps the change open (drags); true closes it into one undo step. */
  function updateModel(fn, commit = true) {
    const d = doc();
    if (!d) return;
    if (!d.pending) d.pending = d.model;
    d.model = normalizeModel(fn(d.model));
    if (commit) {
      if (d.pending !== d.model) {
        d.past.push(d.pending);
        if (d.past.length > 200) d.past.shift();
        d.future = [];
      }
      d.pending = null;
    }
    d.dirty = true;
    if (d.result) d.stale = true;
    update();
    if (commit && state.settings.autoRun && d.result && !state.solving) scheduleAutoRun();
  }

  let autoRunTimer = null;
  function scheduleAutoRun() {
    clearTimeout(autoRunTimer);
    autoRunTimer = setTimeout(() => run('run'), 800);
  }

  function undo() {
    const d = doc();
    if (!d?.past.length) return;
    d.future.push(d.model);
    d.model = d.past.pop();
    d.dirty = true;
    if (d.result) d.stale = true;
    pruneSelection(d);
    update({ props: true });
  }

  function redo() {
    const d = doc();
    if (!d?.future.length) return;
    d.past.push(d.model);
    d.model = d.future.pop();
    d.dirty = true;
    if (d.result) d.stale = true;
    pruneSelection(d);
    update({ props: true });
  }

  function pruneSelection(d) {
    if (!d.selection) return;
    const lists = { body: d.model.bodies, boundary: d.model.boundaries, probe: d.model.probes, material: d.model.materials };
    const list = lists[d.selection.kind];
    if (!list) return;
    const ids = d.selection.ids.filter((id) => list.some((item) => item.id === id));
    d.selection = ids.length ? { ...d.selection, ids } : null;
  }

  function select(selection, additive = false) {
    const d = doc();
    if (!d) return;
    if (additive && selection && d.selection?.kind === selection.kind) {
      const ids = new Set(d.selection.ids);
      for (const id of selection.ids) {
        if (ids.has(id)) ids.delete(id);
        else ids.add(id);
      }
      d.selection = ids.size ? { kind: selection.kind, ids: [...ids] } : null;
    } else {
      d.selection = selection;
    }
    update({ props: true });
  }

  const selectedBodies = () => {
    const d = doc();
    return d?.selection?.kind === 'body' ? d.model.bodies.filter((b) => d.selection.ids.includes(b.id)) : [];
  };

  // ───────────────────────── settings, theme, language
  function applyAppearance() {
    const theme = resolveTheme(state.settings.theme, state.settings.customTheme);
    const appEl = root.querySelector('.app');
    for (const [key, value] of Object.entries(themeVars(theme))) {
      appEl.style.setProperty(key, value);
      document.documentElement.style.setProperty(key, value);
    }
    appEl.dataset.theme = theme.id;
    appEl.dataset.themeMode = theme.mode;
    appEl.style.fontFamily = `"${state.settings.fontFamily}", "Segoe UI", "Malgun Gothic", sans-serif`;
    appEl.style.fontSize = `${state.settings.fontSize}px`;
    native.setWindowTheme(theme.mode);
    // The user's guide pages (scripts/build-docs.mjs) read the app's colours from here.
    const c = theme.colors;
    try {
      globalThis.localStorage?.setItem('myheatmanager.docTheme', JSON.stringify({
        dark: theme.mode === 'dark',
        vars: { '--bg': c.bg, '--surface': c.panel, '--text': c.text, '--muted': c.muted, '--border': c.line, '--accent': c.accent, '--accent-soft': c.button, '--code-bg': c.panelAlt, '--row-alt': c.panelAlt, '--shadow': '0 1px 3px rgba(0,0,0,.15)' },
      }));
    } catch { /* storage unavailable */ }
  }

  function patchSettings(patch) {
    const languageChanged = patch.language && patch.language !== state.settings.language;
    const previousLanguage = state.settings.language;
    state.settings = { ...state.settings, ...patch };
    saveSettings(globalThis.localStorage, state.settings);
    if (languageChanged) {
      // The labels on the canvas follow: sample, library and automatic names are renamed (typed names stay).
      for (const d of state.docs) d.model = relabelModel(d.model, previousLanguage, state.settings.language);
      setLanguage(state.settings.language);
      native.setLanguageNative(state.settings.language);
      buildShell();
    }
    applyAppearance();
    if (startPage?.visible && ('startBgTransparency' in patch || 'animation' in patch || ('startLayout' in patch && patch.startLayout == null))) {
      startPage.background.setKind(state.settings.animation);
      startPage.render();
    }
    update({ props: true });
  }

  // ───────────────────────── shell
  root.innerHTML = '';
  const appEl = h('div', { className: 'app', dataset: { testid: 'app' } });
  root.append(appEl);
  const els = {};
  dialogs.setDialogHost(appEl);

  function buildShell() {
    replace(appEl);
    els.menubar = h('nav', { className: 'menubar', dataset: { testid: 'menubar' } });
    els.toolbar = h('div', { className: 'toolbar', dataset: { testid: 'toolbar' } });
    els.left = h('aside', { className: 'panel left', dataset: { testid: 'left-panel' } });
    els.right = h('aside', { className: 'panel right', dataset: { testid: 'right-panel' } });
    els.tabstrip = h('div', { className: 'tabstrip', dataset: { testid: 'tabstrip' } });
    els.viewport = h('div', { className: 'viewport', dataset: { testid: 'viewport' } });
    els.overlay = h('div', { style: { display: 'contents' } });
    els.chartCanvas = h('canvas', { dataset: { testid: 'chart-canvas' } });
    els.chartHint = h('p', { className: 'panel-hint' });
    els.chartHead = h('div', { className: 'chart-head' });
    els.chart = h('div', { className: 'chart-strip', dataset: { testid: 'chart-strip' } },
      els.chartHead, h('div', { className: 'chart-body' }, els.chartCanvas, els.chartHint));
    els.chartSplitter = h('div', { className: 'chart-splitter', title: t('chartTitle') });
    els.center = h('main', { className: 'center' }, els.tabstrip, els.viewport, els.chartSplitter, els.chart);
    els.workspace = h('div', { className: 'workspace', dataset: { testid: 'workspace' } }, els.left, els.center, els.right);
    els.status = h('footer', { className: 'statusbar', dataset: { testid: 'statusbar' } });
    els.drop = h('div', { className: 'drop-hint' }, t('dropHint'));
    els.tour = h('div', { className: 'tour-layer', dataset: { testid: 'tour-layer' } });
    appEl.append(els.menubar, els.toolbar, els.workspace, els.status, els.drop, els.tour);
    els.viewport.append(els.overlay);
    editor?.destroy();
    editor = new Editor2D(els.viewport, editorCallbacks);
    view3d?.destroy();
    view3d = null;
    // The start page covers the workspace (menu bar, toolbar and status bar stay).
    const wasVisible = startPage ? startPage.visible : state.startVisible;
    startPage?.destroy();
    startPage = new StartPage(els.workspace, api);
    startPage.show(wasVisible);
    if (tutorial) tutorial.layer = els.tour;
    else tutorial = new Tutorial(api, els.tour);
    if (tutorial.active) {
      els.tour.classList.add('active');
      tutorial.draw(TUTORIAL_STEPS[tutorial.index]);
    }
    buildMenubar();
    bindWindowDrag();
    bindSplitter();
    els.chart.style.height = `${state.settings.chartHeight}px`;
    update({ props: true });
  }

  function bindSplitter() {
    els.chartSplitter.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const startY = event.clientY;
      const start = state.settings.chartHeight;
      const move = (ev) => {
        state.settings.chartHeight = Math.max(110, Math.min(460, start - (ev.clientY - startY)));
        els.chart.style.height = `${state.settings.chartHeight}px`;
        renderChart();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        saveSettings(globalThis.localStorage, state.settings);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  // ───── menu bar
  function buildMenubar() {
    const lang = getLanguage();
    // There is no system title bar: the menu bar row carries the app's icon, name and version,
    // the start-page button before the File menu, and the window buttons at its right end.
    // Its empty parts move the window (CSS app-region on Windows, start_dragging elsewhere).
    replace(els.menubar,
      h('span', { className: 'app-brand', dataset: { testid: 'app-brand' } },
        h('img', { src: './icon.png', alt: '', width: 18, height: 18 }),
        h('b', null, 'MyHeatManager'),
        h('small', null, `v${__APP_VERSION__}`),
        // The open project's name, a fixed gap after the version in a fixed-width slot (… when too long).
        els.project = h('span', { className: 'app-project ellipsis', dataset: { testid: 'app-project' } })),
      h('button', {
        type: 'button', className: isChecked('home') ? 'menu-root home-button on' : 'menu-root home-button', dataset: { testid: 'tb-home' },
        title: commandTip('home', lang), onClick: () => run('home'),
      }, h('span', { className: 'menu-icon' }, commandIcon('home')), h('span', { className: 'menu-label' }, t('homeLabel'))),
      ...MENUS.map((menu) => h('button', {
        type: 'button', className: 'menu-root', dataset: { testid: `menu-${menu.id}` }, title: lang === 'en' ? menu.en : menu.ko,
        onClick: (event) => (menuOpen?.id === menu.id || menuHost.justClosed(menu.id) ? closeMenu() : openMenu(menu, event.currentTarget)),
        onMouseenter: (event) => { if (menuOpen && menuOpen.id !== menu.id && menuOpen.root) openMenu(menu, event.currentTarget); },
      }, h('span', { className: 'menu-icon' }, menu.icon), h('span', { className: 'menu-label' }, lang === 'en' ? menu.en : menu.ko))),
      h('label', { className: 'workbench' }, h('select', {
        dataset: { testid: 'workbench' }, 'aria-label': 'workbench',
        onChange: (event) => patchSettings({ workbench: event.target.value }),
      }, ...WORKBENCHES.map((wb) => h('option', { value: wb.id, selected: wb.id === state.settings.workbench }, `${wb.icon}  ${lang === 'en' ? wb.en : wb.ko}`)))),
      native.isTauri ? h('span', { className: 'win-controls', dataset: { testid: 'win-controls' } },
        h('button', { type: 'button', className: 'win-button', title: t('winMinimize'), dataset: { testid: 'win-min' }, onClick: () => native.windowAction('minimize') }, '—'),
        h('button', { type: 'button', className: 'win-button', title: state.maximized ? t('winRestore') : t('winMaximize'), dataset: { testid: 'win-max' }, onClick: () => native.windowAction('toggleMaximize') }, state.maximized ? '❐' : '☐'),
        h('button', { type: 'button', className: 'win-button close', title: t('close'), dataset: { testid: 'win-close' }, onClick: () => requestQuit() }, '✕')) : null);
  }

  // macOS / Linux webviews ignore app-region: the empty menu bar starts the move there, and a
  // double click maximises (Windows does both itself).
  function bindWindowDrag() {
    if (!native.isTauri || /^Win/.test(navigator.platform)) return;
    els.menubar.addEventListener('mousedown', (event) => {
      if (event.button !== 0 || event.target.closest('button, select, input, .win-controls')) return;
      if (event.detail === 2) native.windowAction('toggleMaximize');
      else native.windowAction('startDragging');
    });
  }

  function closeMenu() {
    menuOpen?.el.remove();
    if (menuOpen?.popped) menuHost.hide();
    menuOpen = null;
  }

  // ───── the menu window (desktop): drop-down menus — the menu bar's, right-click menus and the theme list —
  // open in one borderless window kept for reuse, so they can reach past the main window. Clicking anywhere
  // else (the window loses focus) or Escape closes them.
  const menuHost = {
    popout: null,
    opening: null,
    closedAt: 0,
    closedId: null,
    onClose: null,
    async get() {
      if (this.popout && !this.popout.win.closed) return this.popout;
      this.opening ??= openPopout('menu', 'menu-window').then((popout) => {
        this.opening = null;
        this.popout = popout;
        if (popout) {
          popout.win.addEventListener('blur', () => this.dismiss());
          popout.win.document.addEventListener('keydown', (event) => { if (event.key === 'Escape') this.dismiss(); });
          popout.win.document.addEventListener('contextmenu', (event) => event.preventDefault());
        }
        return popout;
      });
      return this.opening;
    },
    /** Shows el (already laid out in the page, unseen) in the menu window at page point (x, y). */
    async show(el, x, y, onClose) {
      // In its own window a long list (the themes) need not scroll: it may run past the main window.
      el.style.maxHeight = 'none';
      const box = el.getBoundingClientRect();
      const popout = await this.get();
      if (!popout || !el.isConnected) return false;
      this.onClose = onClose;
      el.style.visibility = '';
      el.style.left = '0px';
      el.style.top = '0px';
      popout.root.replaceChildren(popout.win.document.adoptNode(el));
      await placePopout(popout, { x, y, width: box.width, height: box.height, focus: true });
      return true;
    },
    hide() {
      this.onClose = null;
      if (this.popout) { this.popout.root.replaceChildren(); hidePopout(this.popout); }
    },
    dismiss() {
      const onClose = this.onClose;
      this.closedAt = Date.now();
      this.hide();
      onClose?.();
    },
    /** True right after the window closed itself because the click went to the main window (that click must not reopen it). */
    justClosed(id) {
      return this.closedId === id && Date.now() - this.closedAt < 400;
    },
  };

  function menuItemButton(id) {
    const enabled = isEnabled(id);
    const checked = isChecked(id);
    return h('button', {
      type: 'button', role: 'menuitem', className: 'menu-item', disabled: !enabled, dataset: { testid: `menuitem-${id}` }, title: commandTip(id, getLanguage()),
      style: enabled ? null : { opacity: 0.45 },
      onClick: () => { closeMenu(); run(id); },
    }, h('span', { className: 'menu-icon' }, iconOf(id)), h('span', { className: 'menu-label' }, commandName(id, getLanguage())),
    h('span', { className: 'muted', style: { marginLeft: 'auto', fontSize: '11px', paddingLeft: '18px' } }, checked ? '✓' : SHORTCUTS[id] ?? ''));
  }

  /** A right-click menu: a title row with the context's icon, then its commands (each with its icon). */
  function openContextMenu(kind, x, y) {
    const menu = CONTEXT_MENUS[kind] ?? CONTEXT_MENUS.general;
    openMenu({ id: 'context', title: t(`ctx_${kind}`), icon: menu.icon }, null, menu.items, { x, y });
  }

  // Every right click opens an app menu (the webview's own, icon-less one never shows).
  function onContextMenu(event) {
    const target = event.target;
    if (target.closest?.('.popup-backdrop, .menu-popup, .tour-card')) return;
    event.preventDefault();
    if (target.closest('.view-canvas')) return; // the 2D editor opens its own on release
    const d = doc();
    const at = (kind) => openContextMenu(kind, event.clientX, event.clientY);
    if (target.matches('input[type=text], input[type=number], input:not([type]), textarea')) {
      state.ctxText = target;
      return at('text');
    }
    if (target.closest('[data-testid=view3d]')) return at('view3d');
    const tab = target.closest('.tab');
    if (tab?.dataset.testid) {
      activate(tab.dataset.testid.slice(4));
      return at('tab');
    }
    if (target.closest('[data-testid=chart-strip]')) return at('chart');
    const node = target.closest('.tree-node');
    const key = node?.dataset.testid?.replace(/^tree-/, '');
    if (key && d) {
      const pick = (prefix, kind) => {
        if (!key.startsWith(prefix)) return false;
        const id = key.slice(prefix.length);
        if (!d.selection || d.selection.kind !== kind || !d.selection.ids.includes(id)) select({ kind, ids: [id] });
        return true;
      };
      if (pick('body-', 'body')) return at('body');
      if (pick('bc-', 'boundary')) return at('boundary');
      if (pick('probe-', 'probe')) return at('probe');
      if (pick('mat-', 'material')) return at('material');
      if (key.startsWith('field-') || key === 'results') return at('results');
      if (['study', 'domain', 'bodies', 'boundaries', 'probes', 'materials'].includes(key)) return at(key);
    }
    at('general');
  }

  function openMenu(menu, anchor, items = menu.items, position = null) {
    closeMenu();
    const content = [];
    if (menu.id === 'context') {
      content.push(h('header', { className: 'popup-title menu-popup-title', dataset: { testid: 'context-title' } },
        h('span', { className: 'popup-heading' }, h('span', { className: 'menu-icon' }, menu.icon), h('strong', null, menu.title))));
    }
    for (const id of items) {
      if (id === '|') content.push(h('span', { className: 'menu-separator', 'aria-hidden': 'true' }));
      else content.push(menuItemButton(id));
    }
    if (menu.id === 'file' && state.settings.recentFiles.length) {
      content.push(h('p', { className: 'menu-section' }, t('recentFiles')));
      for (const file of state.settings.recentFiles) {
        content.push(h('span', { className: 'menu-item recent-item' },
          h('button', { type: 'button', role: 'menuitem', className: 'recent-open', title: file.path, onClick: () => { closeMenu(); openPath(file.path); } },
            h('span', { className: 'menu-icon' }, commandIcon('recent')), h('span', { className: 'menu-label ellipsis' }, file.name)),
          h('button', { type: 'button', className: 'recent-remove', title: t('remove'), onClick: (event) => { event.stopPropagation(); patchSettings({ recentFiles: state.settings.recentFiles.filter((f) => f.path !== file.path) }); closeMenu(); } }, '✕')));
      }
      content.push(menuItemButton('clearRecent'));
    }
    const rect = anchor?.getBoundingClientRect();
    const el = h('div', { className: 'menu-popup', role: 'menu', dataset: { testid: 'menu-popup', layout: 'single-column' }, style: { left: `${position?.x ?? rect.left}px`, top: `${position?.y ?? rect.bottom}px` } },
      h('div', { className: 'menu-items' }, ...content));
    appEl.append(el);
    menuOpen = { id: menu.id, el, root: Boolean(anchor && !position), popped: false };
    if (popoutsEnabled()) {
      // In a window of its own the menu may run past the main window (the desktop keeps it on the screen).
      el.style.visibility = 'hidden';
      const entry = menuOpen;
      const x = position?.x ?? rect.left;
      const y = position?.y ?? rect.bottom;
      entry.popped = true;
      menuHost.show(el, x, y, () => {
        if (menuOpen !== entry) return;
        menuHost.closedId = entry.id;
        menuOpen = null;
      }).then((shown) => {
        if (shown || menuOpen !== entry) return;
        entry.popped = false;
        el.style.visibility = '';
        keepMenuInPage(el);
      });
      return;
    }
    keepMenuInPage(el);
  }

  /** Keeps a menu drawn in the page inside the window. */
  function keepMenuInPage(el) {
    const box = el.getBoundingClientRect();
    if (box.bottom > window.innerHeight - 4) el.style.top = `${Math.max(4, window.innerHeight - box.height - 4)}px`;
    if (box.right > window.innerWidth - 4) el.style.left = `${Math.max(4, window.innerWidth - box.width - 4)}px`;
  }

  document.addEventListener('pointerdown', (event) => {
    if (menuOpen && !menuOpen.el.contains(event.target) && !event.target.closest?.('.menu-root')) closeMenu();
    if (state.themeMenu && !event.target.closest?.('.theme-picker')) {
      state.themeMenu = false;
      renderToolbar();
    }
  }, true);

  // ───── toolbar
  function toolButton(id) {
    const on = isChecked(id);
    return h('button', {
      type: 'button', className: on ? 'tool on' : 'tool', disabled: !isEnabled(id), dataset: { testid: `tb-${id}` }, title: `${commandTip(id, getLanguage())}${SHORTCUTS[id] ? ` (${SHORTCUTS[id]})` : ''}`,
      'aria-pressed': on, onClick: () => run(id),
    }, h('span', { className: 'menu-icon' }, iconOf(id)));
  }

  function renderToolbar() {
    els.menubar?.querySelector('.home-button')?.classList.toggle('on', Boolean(state.startVisible));
    const lang = getLanguage();
    const sep = () => h('span', { className: 'toolbar-sep' });
    const groups = TOOLBAR_GROUPS.flatMap((group, index) => [index ? sep() : null, ...group.map(toolButton)]);
    const theme = resolveTheme(state.settings.theme, state.settings.customTheme);
    const zoomPct = state.view === '3d' && view3d ? view3d.zoomPercent() : editor ? Math.round(editor.scale * 20) : 100;
    // The theme drop-down: two columns running down (dark | light), each theme a tile of two lines (its colours
    // as a strip — background, panel, button, accent, text — then its name); the custom theme and the way to
    // its settings at the bottom.
    const themeTile = (item, testid) => h('button', {
      type: 'button', className: item.id === theme.id ? 'theme-tile on' : 'theme-tile', dataset: { testid },
      title: lang === 'en' ? item.name.en : item.name.ko,
      onClick: () => { state.themeMenu = false; patchSettings(item.id === CUSTOM_THEME_ID ? { theme: item.id, customTheme: item } : { theme: item.id }); },
    }, h('span', { className: 'theme-strip', style: { borderColor: item.colors.line } },
      ...['bg', 'panel', 'button', 'accent', 'text'].map((key) => h('i', { style: { background: item.colors[key] } }))),
    h('span', { className: 'theme-name ellipsis' }, lang === 'en' ? item.name.en : item.name.ko));
    const custom = state.settings.customTheme ? sanitizeTheme(state.settings.customTheme) : createCustomTheme(theme);
    const themeMenu = state.themeMenu ? h('div', { className: 'theme-menu', dataset: { testid: 'theme-menu' } },
      h('div', { className: 'theme-menu-columns' }, ...['dark', 'light'].map((mode) => h('div', { className: 'theme-menu-group' },
        h('p', { className: 'theme-menu-title' }, mode === 'dark' ? t('themesDark') : t('themesLight')),
        h('div', { className: 'theme-menu-list' }, ...themesByMode(mode).map((item) => themeTile(item, `theme-pick-${item.id}`)))))),
      h('div', { className: 'theme-menu-custom' },
        h('p', { className: 'theme-menu-title' }, t('customTheme')),
        h('div', { className: 'theme-menu-custom-row' },
          themeTile(custom, 'theme-pick-custom'),
          h('button', { type: 'button', className: 'theme-menu-edit', dataset: { testid: 'theme-custom-settings' },
            onClick: () => { state.themeMenu = false; renderToolbar(); dialogs.showSettings(api, 'tabCustomTheme'); } },
          h('span', { className: 'menu-icon' }, '🎨'), h('span', null, t('customThemeSettings'))),
          h('button', { type: 'button', className: 'theme-menu-edit', dataset: { testid: 'theme-settings' },
            onClick: () => { state.themeMenu = false; renderToolbar(); dialogs.showSettings(api, 'tabTheme'); } },
          h('span', { className: 'menu-icon' }, '◐'), h('span', null, t('themeSettings')))))) : null;
    replace(els.toolbar,
      ...groups,
      sep(),
      toolButton('toolPanel'), toolButton('propertyPanel'), toolButton('chartPanel'),
      sep(),
      h('span', { className: 'zoom-control' },
        h('button', { type: 'button', className: 'tool', title: commandName('zoomOut', lang), onClick: () => run('zoomOut') }, '−'),
        h('span', { className: 'zoom-value', dataset: { testid: 'zoom-value' } }, `${zoomPct}%`),
        h('button', { type: 'button', className: 'tool', title: commandName('zoomIn', lang), onClick: () => run('zoomIn') }, '+'),
        h('button', { type: 'button', className: 'tool', title: `${commandName('zoomReset', lang)} (Ctrl+0)`, dataset: { testid: 'tb-zoomReset' }, onClick: () => run('zoomReset') }, iconOf('zoomReset'))),
      h('span', { className: 'toolbar-spacer' }),
      h('button', {
        type: 'button', className: 'tool tool-flag', dataset: { testid: 'tb-language' }, title: `${t('language')}: ${lang === 'ko' ? 'English' : '한국어'}`,
        onClick: () => patchSettings({ language: lang === 'ko' ? 'en' : 'ko' }),
      }, lang === 'ko' ? unionJack(15) : taegukgi(15)),
      h('span', { className: 'theme-picker' },
        h('button', {
          type: 'button', className: 'tool theme-cycle', dataset: { testid: 'tb-theme' }, title: `${t('theme')}: ${lang === 'en' ? theme.name.en : theme.name.ko}`,
          onClick: () => {
            const same = THEMES.filter((item) => item.mode === theme.mode);
            const next = same[(same.findIndex((item) => item.id === theme.id) + 1) % same.length];
            patchSettings({ theme: next.id });
          },
        }, themeSwatch(theme, 15)),
        h('button', { type: 'button', className: 'tool theme-caret', dataset: { testid: 'tb-theme-menu' }, title: t('theme'), onClick: () => {
          state.themeMenu = !state.themeMenu && !menuHost.justClosed('theme');
          renderToolbar();
        } }, '▾'),
        themeMenu),
      h('button', { type: 'button', className: 'tool', dataset: { testid: 'tb-settings' }, title: commandName('settings', lang), onClick: () => run('settings') }, h('span', { className: 'menu-icon' }, commandIcon('settings'))),
      h('button', { type: 'button', className: 'tool tool-about', dataset: { testid: 'tb-about' }, title: commandName('about', lang), onClick: () => run('about') }, aboutMark()));
    // Desktop: the theme list drops into the menu window (it may reach past the main window).
    if (themeMenu && popoutsEnabled()) {
      const box = themeMenu.getBoundingClientRect();
      themeMenu.style.visibility = 'hidden';
      themePopped = true;
      menuHost.show(themeMenu, box.left, box.top, () => { menuHost.closedId = 'theme'; state.themeMenu = false; themePopped = false; });
    } else if (!themeMenu && themePopped) {
      themePopped = false;
      menuHost.hide();
    }
  }

  // ───── left panel: tools + model tree
  function panelSection(id, title, ...children) {
    const folded = state.settings.folds[id];
    return [
      h('h2', { className: 'panel-title' }, h('button', {
        type: 'button', className: 'panel-fold', dataset: { testid: `fold-${id}` },
        onClick: () => patchSettings({ folds: { ...state.settings.folds, [id]: !folded } }),
      }, h('span', { className: 'fold-mark' }, folded ? '▸' : '▾'), h('span', { className: 'ellipsis' }, title))),
      folded ? null : children,
    ];
  }

  function renderLeft() {
    const lang = getLanguage();
    const wb = WORKBENCHES.find((item) => item.id === state.settings.workbench) ?? WORKBENCHES[0];
    const d = doc();
    const tools = h('div', { className: 'tool-groups', dataset: { testid: 'tool-grid' } }, ...wb.groups.map((group) => h('section', { className: 'tool-group', dataset: { testid: `tool-group-${group.id}` } },
      h('h3', { className: 'tool-group-title' }, h('span', { className: 'menu-icon' }, group.icon), h('span', { className: 'ellipsis' }, lang === 'en' ? group.en : group.ko), h('span', { className: 'tool-group-count' }, group.tools.length)),
      h('div', { className: 'tool-grid' }, ...group.tools.map((id) => h('button', {
        type: 'button', className: isChecked(id) ? 'tool on' : 'tool', disabled: !isEnabled(id), title: commandTip(id, lang), dataset: { testid: `tool-${id}` }, onClick: () => run(id),
      }, h('span', { className: 'menu-icon' }, iconOf(id)), h('span', { className: 'ellipsis' }, commandName(id, lang))))))));
    els.left.classList.toggle('collapsed', state.settings.leftCollapsed);
    if (state.settings.leftCollapsed) {
      replace(els.left, panelStrip('left'));
      return;
    }
    replace(els.left,
      panelHead('left'),
      ...panelSection('tools', `${wb.icon} ${lang === 'en' ? wb.en : wb.ko}`, tools),
      ...panelSection('tree', t('modelTree'), d ? modelTree(d) : null));
  }

  // A side panel's title bar: its icon, its title and the fold button; folded, a narrow strip
  // with the same icon and the title written downwards, which unfolds it again.
  const PANELS = { left: { icon: '🛠', title: () => t('panelLeft'), key: 'leftCollapsed', fold: '«', unfold: '»' }, right: { icon: '📝', title: () => t('properties'), key: 'rightCollapsed', fold: '»', unfold: '«' } };

  function panelHead(side) {
    const panel = PANELS[side];
    return h('div', { className: 'panel-head', dataset: { testid: `panel-head-${side}` } },
      h('span', { className: 'menu-icon' }, panel.icon),
      h('span', { className: 'ellipsis' }, panel.title()),
      h('button', { type: 'button', className: 'panel-collapse', title: t('panelCollapse'), 'aria-label': t('panelCollapse'), dataset: { testid: `collapse-${side}` }, onClick: () => patchSettings({ [panel.key]: true }) }, panel.fold));
  }

  function panelStrip(side) {
    const panel = PANELS[side];
    return h('button', { type: 'button', className: 'panel-strip', title: `${panel.title()} — ${t('panelExpand')}`, dataset: { testid: `expand-${side}` }, onClick: () => patchSettings({ [panel.key]: false }) },
      h('span', { className: 'strip-arrow' }, panel.unfold),
      h('span', { className: 'menu-icon' }, panel.icon),
      h('span', { className: 'strip-title' }, panel.title()));
  }

  function treeNode({ key, label, icon = null, chip = null, meta = '', depth = 0, on = false, onClick, extra = null, testid }) {
    return h('button', {
      type: 'button', className: on ? 'tree-node on' : 'tree-node', style: { paddingLeft: `${8 + depth * 12}px` }, title: label, dataset: { testid: testid ?? `tree-${key}` }, onClick,
    }, h('span', { className: 'twist' }, depth === 0 ? '▾' : '·'), chip ? h('span', { className: 'chip', style: { background: chip } }) : null, icon ? h('span', { className: 'menu-icon' }, icon) : null,
    h('span', { className: 'ellipsis' }, label), meta ? h('span', { className: 'tree-meta' }, meta) : null, extra);
  }

  function modelTree(d) {
    const sel = d.selection;
    const is = (kind, id) => sel?.kind === kind && (id == null || sel.ids.includes(id));
    const m = d.model;
    const lang = getLanguage();
    const rows = [
      treeNode({ key: 'study', label: `${t('treeStudy')}: ${commandName(m.study.type, lang)}${m.study.flow ? ' + CHT' : ''}${m.study.stress ? ' + σ' : ''}`, icon: '⚙', on: is('study'), onClick: () => select({ kind: 'study', ids: [] }) }),
      treeNode({ key: 'domain', label: `${t('domainTitle')}: ${m.domain.dim}D ${m.domain.width}×${m.domain.height}${m.domain.dim === 3 ? `×${m.domain.depth}` : ''} mm`, icon: '⬚', meta: cellCount(m.domain).toLocaleString(), on: is('domain'), onClick: () => select({ kind: 'domain', ids: [] }) }),
      treeNode({ key: 'materials', label: `${t('treeMaterials')} (${m.materials.length})`, icon: '🧱', onClick: () => run('materials') }),
      ...m.materials.map((mat) => treeNode({ key: `mat-${mat.id}`, label: materialName(mat, lang), chip: materialColor(mat), meta: `k ${formatValue(mat.k)}`, depth: 1, on: is('material', mat.id), onClick: () => select({ kind: 'material', ids: [mat.id] }) })),
      treeNode({ key: 'bodies', label: `${t('treeBodies')} (${m.bodies.length})`, icon: '▣', onClick: () => run('selectAll') }),
      ...m.bodies.map((body) => {
        const mat = m.materials.find((x) => x.id === body.material);
        const power = body.current ? 'I²R' : body.powerProfile ? 'P(t)' : body.power ? `${formatValue(body.power)} W` : '';
        return treeNode({
          key: `body-${body.id}`, label: body.name || body.id, chip: materialColor(mat), meta: power, depth: 1, on: is('body', body.id),
          onClick: (event) => select({ kind: 'body', ids: [body.id] }, event.ctrlKey || event.shiftKey),
          extra: h('span', { className: 'eye', title: body.hidden ? t('yes') : t('no'), onClick: (event) => { event.stopPropagation(); updateModel((model) => ({ ...model, bodies: model.bodies.map((b) => (b.id === body.id ? { ...b, hidden: !b.hidden } : b)) })); } }, body.hidden ? '◌' : '◉'),
        });
      }),
      treeNode({ key: 'boundaries', label: `${t('treeBoundaries')} (${m.boundaries.length})`, icon: '≋', onClick: () => {} }),
      ...m.boundaries.map((bc) => treeNode({ key: `bc-${bc.id}`, label: bc.name || bc.id, chip: bcColor(bc.type), meta: bcTypeName(bc.type), depth: 1, on: is('boundary', bc.id), onClick: () => select({ kind: 'boundary', ids: [bc.id] }) })),
      treeNode({ key: 'probes', label: `${t('treeProbes')} (${m.probes.length})`, icon: '⊕', onClick: () => {} }),
      ...m.probes.map((p) => treeNode({ key: `probe-${p.id}`, label: p.name || p.id, icon: '⊕', meta: probeValueText(d, p.id) ?? '', depth: 1, on: is('probe', p.id), onClick: () => select({ kind: 'probe', ids: [p.id] }) })),
      treeNode({ key: 'results', label: d.result ? `${t('treeResults')}${d.stale ? ' ⚠' : ''}` : t('noResults'), icon: '🌡', onClick: () => { if (d.result) { state.showResult = true; update(); } else run('run'); } }),
    ];
    if (d.result) {
      for (const [cmd, kind] of Object.entries(FIELD_COMMANDS)) {
        if (!hasField(kind)) continue;
        rows.push(treeNode({ key: `field-${kind}`, label: commandName(cmd, lang), icon: commandIcon(cmd), depth: 1, on: state.showResult && state.fieldKind === kind, onClick: () => run(cmd) }));
      }
    }
    return h('div', { className: 'spec-tree', dataset: { testid: 'model-tree' } }, ...rows);
  }

  const bcTypeName = (type) => t(`bc${type[0].toUpperCase()}${type.slice(1)}`);

  // ───── tabs
  // Tabs that do not fit scroll sideways: < and > on the right step one tab at a time, the wheel
  // scrolls too, and the active tab is always brought into view.
  let tabScroll = 0;
  function renderTabs() {
    const row = h('div', { className: 'tabs-row', dataset: { testid: 'tabs-row' }, onWheel: (event) => { event.preventDefault(); row.scrollLeft += event.deltaY || event.deltaX; tabScroll = row.scrollLeft; syncTabButtons(); }, onScroll: () => { tabScroll = row.scrollLeft; syncTabButtons(); } },
      ...state.docs.map((d) => h('button', {
        type: 'button', className: d.id === state.activeId ? 'tab on' : 'tab', dataset: { testid: `tab-${d.id}` }, title: d.path ?? d.model.name,
        onClick: () => activate(d.id),
      }, h('span', { className: 'ellipsis' }, `${d.model.name || t('untitled')}${d.dirty ? ' *' : ''}`),
      h('span', { role: 'button', title: t('close'), onClick: (event) => { event.stopPropagation(); closeDoc(d.id); } }, '×'))));
    const step = (dir) => {
      const tabs = [...row.querySelectorAll('.tab')];
      const left = row.scrollLeft;
      // The next tab whose left edge is past (or the previous one before) the visible start.
      const target = dir > 0 ? tabs.find((tab) => tab.offsetLeft > left + 2) : [...tabs].reverse().find((tab) => tab.offsetLeft < left - 2);
      row.scrollTo({ left: target ? target.offsetLeft : dir > 0 ? row.scrollWidth : 0, behavior: 'smooth' });
    };
    els.tabPrev = h('button', { type: 'button', className: 'tab-nav', title: t('tabPrev'), 'aria-label': t('tabPrev'), dataset: { testid: 'tab-prev' }, onClick: () => step(-1) }, '<');
    els.tabNext = h('button', { type: 'button', className: 'tab-nav', title: t('tabNext'), 'aria-label': t('tabNext'), dataset: { testid: 'tab-next' }, onClick: () => step(1) }, '>');
    els.tabsRow = row;
    replace(els.tabstrip, row, els.tabPrev, els.tabNext,
      h('button', { type: 'button', className: 'ghost', title: commandName('new', getLanguage()), onClick: () => run('new') }, '+'));
    row.scrollLeft = tabScroll;
    requestAnimationFrame(() => {
      const active = row.querySelector('.tab.on');
      if (active && (active.offsetLeft < row.scrollLeft || active.offsetLeft + active.offsetWidth > row.scrollLeft + row.clientWidth)) {
        row.scrollLeft = Math.max(0, active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2);
        tabScroll = row.scrollLeft;
      }
      syncTabButtons();
    });
  }

  function syncTabButtons() {
    const row = els.tabsRow;
    if (!row) return;
    // Always on the right; greyed out when there is nothing further that way.
    els.tabPrev.disabled = row.scrollLeft <= 1;
    els.tabNext.disabled = row.scrollLeft + row.clientWidth >= row.scrollWidth - 1;
  }

  function activate(id) {
    stopPlaying();
    state.activeId = id;
    const d = doc();
    state.showResult = Boolean(d?.result);
    state.layer = null;
    if (editor) editor.fitted = false;
    if (editor) {
      editor.state.model = null;
    }
    view3d && (view3d.key = null);
    update({ props: true });
    editor?.fit();
  }

  function closeDoc(id, after = null) {
    const d = state.docs.find((x) => x.id === id);
    if (!d) return;
    const finish = () => {
      state.docs = state.docs.filter((x) => x.id !== id);
      if (!state.docs.length) addDoc(emptyModel(getLanguage()));
      if (state.activeId === id) state.activeId = state.docs[state.docs.length - 1].id;
      activate(state.activeId);
      after?.();
    };
    if (d.dirty && state.settings.confirmClose) {
      state.activeId = id;
      update();
      dialogs.confirmSave(api, async () => { if (await saveDoc(d)) finish(); }, finish);
    } else finish();
  }

  // ───── property panel
  let propsKey = null;
  function renderRight(force) {
    const d = doc();
    const key = d ? `${d.id}:${d.selection?.kind}:${d.selection?.ids.join(',')}` : '';
    if (!force && key === propsKey && els.right.contains(document.activeElement) && document.activeElement !== document.body) return;
    propsKey = key;
    const scroll = els.right.scrollTop;
    els.right.classList.toggle('collapsed', state.settings.rightCollapsed);
    if (state.settings.rightCollapsed) {
      replace(els.right, panelStrip('right'));
      return;
    }
    replace(els.right, panelHead('right'), ...(d ? propertyContent(d) : []));
    els.right.scrollTop = scroll;
  }

  const propRow = (label, control, testid) => h('div', { className: 'prop-row', dataset: testid ? { testid } : undefined }, h('span', { className: 'prop-label', title: label }, label), control);
  const fieldGroup = (legend, ...children) => h('fieldset', { className: 'field-group' }, h('legend', null, legend), ...children);
  const num = (value, onChange, opts = {}) => numberField({ value, onChange, step: opts.step ?? 1, min: opts.min ?? -Infinity, max: opts.max ?? Infinity, suffix: opts.suffix ?? '', testid: opts.testid, digits: opts.digits ?? 6 });
  const selectEl = (value, options, onChange, testid) => h('select', { dataset: testid ? { testid } : undefined, onChange: (event) => onChange(event.target.value) },
    ...options.map(([v, label]) => h('option', { value: v, selected: String(v) === String(value ?? '') }, label)));
  const textInput = (value, onChange, testid) => h('input', { type: 'text', value: value ?? '', dataset: testid ? { testid } : undefined, onChange: (event) => onChange(event.target.value) });
  // One-line "x:value, x:value" text for small tables (time tables of boundaries).
  const pairText = (rows) => (Array.isArray(rows) ? rows.map(([x, v]) => `${x}:${v}`).join(", ") : "");
  const parsePairs = (text) => { const rows = String(text).split(/[,;]+/).map((pair) => pair.split(":").map(parseNumber)).filter((p) => p.length === 2 && p.every(Number.isFinite)).sort((a, b) => a[0] - b[0]); return rows.length ? rows : null; };
  const tableText = (table, columns) => (table ?? []).map((r) => r.join(', ')).join('\n') || '';
  const parseTable = (text) => {
    const rows = String(text).split(/\n|;/).map((line) => line.split(/[,\t ]+/).map(parseNumber)).filter((r) => r.length >= 2 && Number.isFinite(r[0]) && Number.isFinite(r[1])).map((r) => [r[0], r[1]]);
    return rows.length ? rows.sort((a, b) => a[0] - b[0]) : null;
  };
  const tUnit = () => tUnitLabel(state.settings.temperatureUnit);
  const dispT = (c) => toDisplayT(c, state.settings.temperatureUnit);
  const tempField = (value, onChange, testid) => num(dispT(value), (v) => onChange(fromDisplayT(v, state.settings.temperatureUnit)), { suffix: tUnit(), testid });

  function patchBody(id, patch) {
    updateModel((m) => ({ ...m, bodies: m.bodies.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
    renderRight(true);
  }

  function patchBoundary(id, patch) {
    updateModel((m) => ({ ...m, boundaries: m.boundaries.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
    renderRight(true);
  }

  function patchProbe(id, patch) {
    updateModel((m) => ({ ...m, probes: m.probes.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
    renderRight(true);
  }

  function propertyContent(d) {
    const m = d.model;
    const sel = d.selection;
    const lang = getLanguage();
    if (sel?.kind === 'body') {
      const bodies = m.bodies.filter((b) => sel.ids.includes(b.id));
      if (bodies.length > 1) {
        return [h('p', { className: 'panel-hint' }, `${t('selection')}: ${bodies.length}`),
          propRow(t('material'), selectEl('', [['', '—'], ...m.materials.map((x) => [x.id, x.name])], (v) => { if (v) updateModel((model) => ({ ...model, bodies: model.bodies.map((b) => (sel.ids.includes(b.id) ? { ...b, material: v } : b)) })); })),
          h('div', { className: 'prop-actions' }, ...['duplicate', 'delete', 'bringFront', 'sendBack'].map((id) => h('button', { type: 'button', onClick: () => run(id) }, `${commandIcon(id)} ${commandName(id, lang)}`)))];
      }
      const body = bodies[0];
      if (!body) return [];
      const geometry = body.shape === 'circle'
        ? [propRow(t('position'), h('span', { className: 'pair' }, num(body.cx, (v) => patchBody(body.id, { cx: v }), { suffix: 'x' }), num(body.cy, (v) => patchBody(body.id, { cy: v }), { suffix: 'y' }))),
          propRow(t('radius'), num(body.r, (v) => patchBody(body.id, { r: v }), { min: 0.001, step: 0.5, suffix: 'mm' }))]
        : body.shape === 'polygon'
          ? [propRow(t('position'), h('textarea', { value: body.points.map((p) => p.map((v) => formatValue(v, 6)).join(', ')).join('\n'), onChange: (event) => { const pts = String(event.target.value).split('\n').map((l) => l.split(/[,\s]+/).map(parseNumber)).filter((p) => p.length >= 2 && p.every(Number.isFinite)).map((p) => [p[0], p[1]]); if (pts.length >= 3) patchBody(body.id, { points: pts }); } }))]
          : [propRow(t('position'), h('span', { className: 'pair' }, num(body.x, (v) => patchBody(body.id, { x: v }), { suffix: 'x', testid: 'prop-x' }), num(body.y, (v) => patchBody(body.id, { y: v }), { suffix: 'y', testid: 'prop-y' }))),
            propRow(t('size'), h('span', { className: 'pair' }, num(body.w, (v) => patchBody(body.id, { w: v }), { min: 0.001, suffix: 'w', testid: 'prop-w' }), num(body.h, (v) => patchBody(body.id, { h: v }), { min: 0.001, suffix: 'h', testid: 'prop-h' })))];
      const stats = d.result?.header.bodies?.find((b) => b.id === body.id);
      return [
        fieldGroup(`▣ ${body.name || body.id}`,
          propRow(t('name'), textInput(body.name, (v) => patchBody(body.id, { name: v }), 'prop-name')),
          propRow(t('shape'), h('span', null, t(`shape${body.shape[0].toUpperCase()}${body.shape.slice(1)}`))),
          propRow(t('material'), selectEl(body.material, m.materials.map((x) => [x.id, x.name]), (v) => patchBody(body.id, { material: v }), 'prop-material')),
          ...geometry,
          m.domain.dim === 3 ? propRow(t('zRange'), h('span', { className: 'pair' }, num(body.z0, (v) => patchBody(body.id, { z0: v }), { suffix: 'z0' }), num(body.z1, (v) => patchBody(body.id, { z1: v }), { suffix: 'z1' }))) : null),
        fieldGroup(`🔥 ${t('power')}`,
          propRow(t('power'), num(body.power, (v) => patchBody(body.id, { power: v }), { min: 0, step: 0.5, suffix: 'W', testid: 'prop-power' })),
          propRow(t('powerProfile'), h('textarea', { placeholder: 't (s), W', value: tableText(body.powerProfile), onChange: (event) => patchBody(body.id, { powerProfile: parseTable(event.target.value) }) })),
          propRow(t('current'), h('textarea', { placeholder: 't (s), A', value: tableText(body.current), onChange: (event) => patchBody(body.id, { current: parseTable(event.target.value) }) })),
          propRow(t('resistance'), num(body.resistance ?? NaN, (v) => patchBody(body.id, { resistance: Number.isFinite(v) ? v : null }), { min: 0, step: 0.0005, suffix: 'Ω' }))),
        stats ? fieldGroup(`🌡 ${t('treeResults')}`, resultTable([[t('minT'), `${formatValue(dispT(stats.min))} ${tUnit()}`], [t('avgT'), `${formatValue(dispT(stats.avg))} ${tUnit()}`], [t('maxT'), `${formatValue(dispT(stats.max))} ${tUnit()}`]])) : null,
        h('div', { className: 'prop-actions' },
          ...['duplicate', 'delete', 'bringFront', 'sendBack', 'bcConvection'].map((id) => h('button', { type: 'button', title: commandTip(id, lang), onClick: () => run(id) }, `${commandIcon(id)} ${commandName(id, lang)}`))),
      ];
    }
    if (sel?.kind === 'boundary') {
      const bc = m.boundaries.find((b) => b.id === sel.ids[0]);
      if (!bc) return [];
      const targets = boundaryTargets(m, bc.type).map((target) => {
        if (target.startsWith('body:')) {
          const body = m.bodies.find((b) => `body:${b.id}` === target);
          return [target, `▣ ${body?.name || target.slice(5)}`];
        }
        return [target, t(`edge${target[0].toUpperCase()}${target.slice(1)}`)];
      }).concat(bc.type !== 'internalFan' && bc.target === 'interior' ? [['interior', t('edgeInterior')]] : []);
      const types = ['temperature', 'flux', 'convection', 'radiation', 'adiabatic', 'contact', 'thinLayer', 'inlet', 'fan', 'internalFan', 'outlet', 'open', 'wall', 'slip', 'voltage', 'ground', 'currentIn', 'fixed', 'rollerX', 'rollerY', 'pressure', 'force'];
      const values = [];
      if (bc.type === 'temperature') values.push(propRow(t('temperature'), tempField(bc.T, (v) => patchBoundary(bc.id, { T: v }), 'prop-T')));
      if (bc.type === 'flux') values.push(propRow(t('heatFlux'), num(bc.q, (v) => patchBoundary(bc.id, { q: v }), { step: 100, suffix: 'W/m²' })));
      if (bc.type === 'convection') {
        values.push(propRow(t('hCoef'), num(bc.h, (v) => patchBoundary(bc.id, { h: v }), { min: 0, step: 1, suffix: 'W/m²K', testid: 'prop-h-coef' })));
        values.push(propRow(t('fluidT'), tempField(bc.Tinf, (v) => patchBoundary(bc.id, { Tinf: v }), 'prop-Tinf')));
        values.push(propRow(t('emissivity'), num(bc.emissivity, (v) => patchBoundary(bc.id, { emissivity: v }), { min: 0, max: 1, step: 0.05 })));
      }
      if (bc.type === 'radiation') {
        values.push(propRow(t('emissivity'), num(bc.emissivity, (v) => patchBoundary(bc.id, { emissivity: v }), { min: 0, max: 1, step: 0.05 })));
        values.push(propRow(t('surroundT'), tempField(bc.Tamb, (v) => patchBoundary(bc.id, { Tamb: v }))));
      }
      if (bc.type === 'inlet') {
        values.push(propRow(t('velocity'), num(bc.velocity, (v) => patchBoundary(bc.id, { velocity: v }), { step: 0.1, suffix: 'm/s' })));
        values.push(propRow(t('inletT'), tempField(bc.Tin, (v) => patchBoundary(bc.id, { Tin: v }))));
      }
      if (bc.type === 'convection' || bc.type === 'radiation') {
        values.push(propRow(t('uTag'), h('select', { dataset: { testid: 'prop-tag' }, onChange: (event) => patchBoundary(bc.id, { tag: event.target.value || null }) },
          ...[['', '—'], ['Frame', 'Frame'], ['Edge', 'Edge'], ['COG', 'COG (center of glass)'], ['Divider', 'Divider'], ['SHGC Exterior', 'SHGC Exterior'], ['Interior', 'Interior'], ['Exterior', 'Exterior']].map(([v, label]) => h('option', { value: v, selected: (bc.tag ?? '') === v }, label)))));
      }
      if (bc.type === 'internalFan') {
        const dirs = m.domain.dim === 3 ? ['+x', '-x', '+y', '-y', '+z', '-z'] : ['+x', '-x', '+y', '-y'];
        values.push(propRow(t('fanDirection'), selectEl(bc.direction, dirs.map((x) => [x, x]), (v) => patchBoundary(bc.id, { direction: v }), 'prop-fan-direction')));
      }
      if (bc.type === 'fan' || bc.type === 'internalFan') {
        // The fan curve as "flow m³/s : pressure Pa" pairs; the solver finds where it meets the system's resistance.
        const curveText = (bc.curve ?? []).map(([q, p]) => `${q}:${p}`).join(', ');
        if (bc.type === 'fan') values.push(propRow(t('inletT'), tempField(bc.Tin, (v) => patchBoundary(bc.id, { Tin: v }))));
        values.push(propRow(t('fanCurve'), textInput(curveText, (text) => {
          const curve = text.split(/[,;\n]+/).map((pair) => pair.split(':').map(Number)).filter((pq) => pq.length === 2 && pq.every(Number.isFinite)).sort((a, b) => a[0] - b[0]);
          if (curve.length >= 2) patchBoundary(bc.id, { curve });
        }, 'prop-fan-curve')));
        const point = d.result?.header?.boundaries?.find((b) => b.id === bc.id)?.operatingPoint;
        if (point) values.push(propRow(t('operatingPoint'), h('span', { className: 'muted', dataset: { testid: 'prop-fan-point' } }, `${formatValue(point.flow * 1000)} L/s · ${formatValue(point.pressure)} Pa`)));
      }
      if (bc.type === 'open') values.push(propRow(t('fluidT'), tempField(bc.Tinf, (v) => patchBoundary(bc.id, { Tinf: v }))));
      if (bc.type === 'inlet' && m.study.turbulence === 'kOmegaSST') {
        values.push(propRow(t('turbIntensity'), num(bc.turbulenceIntensity * 100, (v) => patchBoundary(bc.id, { turbulenceIntensity: v / 100 }), { min: 0.1, max: 40, step: 1, suffix: '%' })));
        values.push(propRow(t('mixingLength'), num(bc.mixingLength ?? NaN, (v) => patchBoundary(bc.id, { mixingLength: Number.isFinite(v) ? v : null }), { min: 0.001, step: 0.5, suffix: 'mm' })));
      }
      // Values that change with time (transient studies): "t:value, …" tables override the constant.
      const transient = m.study.type === 'transient';
      const timeTable = (key, label, unit) => propRow(`${label} (t)`, textInput(pairText(bc[key]), (text) => patchBoundary(bc.id, { [key]: parsePairs(text) }), `prop-${key}`), h('span', { className: 'muted', title: t('timeTableHint') }, unit));
      if (transient && bc.type === 'temperature') values.push(timeTable('Tt', t('temperature'), 's:°C'));
      if (transient && bc.type === 'flux') values.push(timeTable('qt', t('heatFlux'), 's:W/m²'));
      if (transient && bc.type === 'convection') values.push(timeTable('ht', t('hCoef'), 's:W/m²K'), timeTable('Tinft', t('fluidT'), 's:°C'));
      if (transient && bc.type === 'radiation') values.push(timeTable('Tambt', t('surroundT'), 's:°C'));
      if (bc.type === 'convection') {
        // h from a correlation (natural convection on a vertical / horizontal surface, forced flow over a plate).
        const mode = bc.hMode ?? 'fixed';
        values.push(propRow(t('hMode'), h('select', { dataset: { testid: 'prop-hmode' }, onChange: (event) => patchBoundary(bc.id, { hMode: event.target.value }) },
          ...['fixed', 'naturalVertical', 'naturalHorizontalUp', 'naturalHorizontalDown', 'forcedPlate'].map((v) => h('option', { value: v, selected: v === mode }, t(`hMode_${v}`))))));
        if (mode !== 'fixed') values.push(propRow(t('charLength'), num(bc.length ?? 100, (v) => patchBoundary(bc.id, { length: v }), { min: 1, step: 10, suffix: 'mm' })));
        if (mode === 'forcedPlate') values.push(propRow(t('velocity'), num(bc.velocity ?? 1, (v) => patchBoundary(bc.id, { velocity: v }), { min: 0, step: 0.5, suffix: 'm/s' })));
        const hMean = d.result?.header?.boundaries?.find((b) => b.id === bc.id)?.hMean;
        if (mode !== 'fixed' && Number.isFinite(hMean)) values.push(propRow(t('hEvaluated'), h('span', { className: 'muted', dataset: { testid: 'prop-hmean' } }, `${formatValue(hMean)} W/m²K`)));
      }
      if (bc.type === 'thinLayer') {
        values.push(propRow(t('layerThickness'), num(bc.thickness ?? 0.1, (v) => patchBoundary(bc.id, { thickness: v }), { min: 0.001, step: 0.05, suffix: 'mm', testid: 'prop-thin-d' })));
        values.push(propRow(t('conductivity'), num(bc.k ?? 0.2, (v) => patchBoundary(bc.id, { k: v }), { min: 1e-4, step: 0.1, suffix: 'W/mK', testid: 'prop-thin-k' })));
        values.push(propRow(t('layerMode'), h('select', { dataset: { testid: 'prop-thin-mode' }, onChange: (event) => patchBoundary(bc.id, { mode: event.target.value }) },
          ...[['resistive', t('layerResistive')], ['conductive', t('layerConductive')]].map(([v, label]) => h('option', { value: v, selected: v === (bc.mode ?? 'resistive') }, label)))));
      }
      if (bc.type === 'contact') values.push(propRow(t('contactR'), num(bc.resistance, (v) => patchBoundary(bc.id, { resistance: v }), { min: 0, step: 1e-5, suffix: 'm²K/W' })));
      if (bc.type === 'voltage') values.push(propRow(t('voltageV'), num(bc.V, (v) => patchBoundary(bc.id, { V: v }), { step: 0.1, suffix: 'V' })));
      if (bc.type === 'currentIn') values.push(propRow(t('currentI'), num(bc.I, (v) => patchBoundary(bc.id, { I: v }), { step: 1, suffix: 'A' })));
      if (bc.type === 'pressure') values.push(propRow(t('pressureP'), num(bc.p / 1000, (v) => patchBoundary(bc.id, { p: v * 1000 }), { step: 10, suffix: 'kPa' })));
      if (bc.type === 'force') {
        values.push(propRow('Fx · Fy', h('span', { className: 'pair' }, num(bc.fx, (v) => patchBoundary(bc.id, { fx: v }), { suffix: 'N' }), num(bc.fy, (v) => patchBoundary(bc.id, { fy: v }), { suffix: 'N' }))));
        if (m.domain.dim === 3) values.push(propRow('Fz', num(bc.fz, (v) => patchBoundary(bc.id, { fz: v }), { suffix: 'N' })));
      }
      const edge = ['left', 'right', 'top', 'bottom'].includes(bc.target);
      const heat = d.result?.header.boundaries?.find((b) => b.id === bc.id);
      return [
        fieldGroup(`≋ ${bc.name || bc.id}`,
          propRow(t('name'), textInput(bc.name, (v) => patchBoundary(bc.id, { name: v }), 'prop-bc-name')),
          propRow(t('type'), selectEl(bc.type, types.map((x) => [x, bcTypeName(x)]), (v) => patchBoundary(bc.id, retypeBoundary(m, bc, v)), 'prop-bc-type')),
          propRow(t('target'), selectEl(bc.target, targets, (v) => patchBoundary(bc.id, { target: v }), 'prop-bc-target')),
          ...values,
          edge ? propRow(t('range'), h('span', { className: 'pair' },
            num(bc.range?.[0] ?? NaN, (v) => patchBoundary(bc.id, { range: Number.isFinite(v) ? [v, bc.range?.[1] ?? (bc.target === 'left' || bc.target === 'right' ? m.domain.height : m.domain.width)] : null }), { suffix: 'mm' }),
            num(bc.range?.[1] ?? NaN, (v) => patchBoundary(bc.id, { range: Number.isFinite(v) ? [bc.range?.[0] ?? 0, v] : null }), { suffix: 'mm' }))) : null,
          propRow(t('region'), textInput(bc.region ? bc.region.join(', ') : '', (v) => { const r = v.split(/[,\s]+/).map(parseNumber); patchBoundary(bc.id, { region: (r.length === 4 || (r.length === 6 && m.domain.dim === 3)) && r.every(Number.isFinite) ? r : null }); }, 'prop-region'), h('span', { className: 'muted' }, m.domain.dim === 3 ? t('regionHint3d') : t('regionHint2d')))),
        heat ? fieldGroup(`🌡 ${t('treeResults')}`, resultTable([
          [t('heat'), `${formatValue(heat.heat)} W`], [t('area'), `${formatValue(heat.area * 1e6)} mm²`], ['q̄', `${formatValue(heat.area ? heat.heat / heat.area : 0)} W/m²`],
          ...(heat.massFlow != null ? [[t('massFlow'), `${formatValue(heat.massFlow * 1000)} g/s`], [t('volumeFlow'), `${formatValue(heat.volumeFlow * 6e4)} L/min`], [t('pressureAvg'), `${formatValue(heat.pressureAvg)} Pa`], [t('temperatureAvg'), `${formatValue(dispT(heat.temperatureAvg))} ${tUnit()}`]] : []),
          ...(heat.current != null ? [[t('currentI'), `${formatValue(heat.current)} A`]] : []),
        ])) : null,
        h('div', { className: 'prop-actions' }, h('button', { type: 'button', onClick: () => run('delete') }, `${commandIcon('delete')} ${commandName('delete', lang)}`)),
      ];
    }
    if (sel?.kind === 'probe') {
      const p = m.probes.find((x) => x.id === sel.ids[0]);
      if (!p) return [];
      const values = d.result?.header.probes?.find((x) => x.id === p.id)?.values ?? [];
      return [
        fieldGroup(`⊕ ${p.name || p.id}`,
          propRow(t('name'), textInput(p.name, (v) => patchProbe(p.id, { name: v }))),
          propRow(t('position'), h('span', { className: 'pair' }, num(p.x, (v) => patchProbe(p.id, { x: v }), { suffix: 'x' }), num(p.y, (v) => patchProbe(p.id, { y: v }), { suffix: 'y' }))),
          m.domain.dim === 3 ? propRow('z', num(p.z, (v) => patchProbe(p.id, { z: v }), { suffix: 'mm' })) : null),
        values.length ? fieldGroup(`🌡 ${t('treeResults')}`, resultTable([[t('temperature'), `${formatValue(dispT(values[Math.min(values.length - 1, d.frame)]))} ${tUnit()}`], [t('maxT'), `${formatValue(dispT(Math.max(...values.filter(Number.isFinite))))} ${tUnit()}`]])) : null,
        h('div', { className: 'prop-actions' }, h('button', { type: 'button', onClick: () => run('delete') }, `${commandIcon('delete')} ${commandName('delete', lang)}`)),
      ];
    }
    if (sel?.kind === 'material') {
      const mat = m.materials.find((x) => x.id === sel.ids[0]);
      if (!mat) return [];
      const rows = dialogs.materialEditor(mat, (patch) => { updateMaterial(mat.id, patch); renderRight(true); }, m);
      return [fieldGroup(`🧱 ${materialName(mat, lang)}`, ...rows.map((r) => { r.className = 'prop-row'; r.firstChild.className = 'prop-label'; return r; })),
        h('div', { className: 'prop-actions' }, h('button', { type: 'button', onClick: () => assignMaterial(mat.id) }, `${commandIcon('assignMaterial')} ${commandName('assignMaterial', lang)}`))];
    }
    if (sel?.kind === 'domain') {
      const dm = m.domain;
      const patchDomain = (patch) => { updateModel((model) => ({ ...model, domain: { ...model.domain, ...patch } })); renderRight(true); };
      return [fieldGroup(`⬚ ${t('domainTitle')}`,
        propRow(t('dimension'), selectEl(dm.dim, [[2, '2D'], [3, '3D']], (v) => patchDomain({ dim: Number(v) }))),
        propRow(t('width'), num(dm.width, (v) => patchDomain({ width: v }), { min: 0.001, suffix: 'mm' })),
        propRow(t('height'), num(dm.height, (v) => patchDomain({ height: v }), { min: 0.001, suffix: 'mm' })),
        propRow(t('depth'), num(dm.depth, (v) => patchDomain({ depth: v }), { min: 0.001, suffix: 'mm' })),
        propRow(t('cellsX'), num(dm.nx, (v) => patchDomain({ nx: Math.round(v) }), { min: 1, max: 2000, step: 10, testid: 'prop-nx' })),
        propRow(t('cellsY'), num(dm.ny, (v) => patchDomain({ ny: Math.round(v) }), { min: 1, max: 2000, step: 10, testid: 'prop-ny' })),
        dm.dim === 3 ? propRow(t('cellsZ'), num(dm.nz, (v) => patchDomain({ nz: Math.round(v) }), { min: 1, max: 500, step: 1 })) : null,
        propRow(t('background'), selectEl(dm.background ?? '', [['', t('void')], ...m.materials.map((x) => [x.id, x.name])], (v) => patchDomain({ background: v || null }))),
        propRow(t('ambient'), tempField(m.ambient, (v) => { updateModel((model) => ({ ...model, ambient: v })); renderRight(true); })),
        propRow(t('cells'), h('span', null, `${cellCount(dm).toLocaleString()} · Δ ${formatValue(dm.width / dm.nx)} × ${formatValue(dm.height / dm.ny)} mm`)))];
    }
    // Nothing selected (or the study row): the model, the study settings and the result summary.
    const rows = dialogs.studyFields(m.study, (patch) => { updateModel((model) => ({ ...model, study: { ...model.study, ...patch } })); renderRight(true); }, m.domain.dim)
      .map((r) => { r.className = 'prop-row'; r.firstChild.className = 'prop-label'; return r; });
    const header = d.result?.header;
    return [
      sel?.kind === 'study' ? null : h('p', { className: 'panel-hint', dataset: { testid: 'empty-props' } }, t('emptyProps')),
      fieldGroup(`📄 ${t('reportModel')}`,
        propRow(t('name'), textInput(m.name, (v) => { updateModel((model) => ({ ...model, name: v })); renderTabs(); }, 'prop-model-name')),
        propRow(t('domainTitle'), h('button', { type: 'button', onClick: () => select({ kind: 'domain', ids: [] }) }, `${m.domain.dim}D · ${cellCount(m.domain).toLocaleString()} ${t('cells')}`))),
      fieldGroup(`⚙ ${t('studyTitle')}`, ...rows),
      header ? fieldGroup(`🌡 ${t('reportSummary')}${d.stale ? ' ⚠' : ''}`, resultTable([
        [t('minT'), `${formatValue(dispT(header.stats.Tmin))} ${tUnit()}`],
        [t('maxT'), `${formatValue(dispT(header.stats.Tmax))} ${tUnit()}`],
        ...(header.stats.vmax ? [['v max', `${formatValue(header.stats.vmax)} m/s`]] : []),
        ...(header.stats.vonMisesMax ? [['σ vM max', `${formatValue(header.stats.vonMisesMax / 1e6)} MPa`]] : []),
        ...(header.solar ? [[t('solarAbsorbed'), `${formatValue(header.solar.absorbed)} W`]] : []),
        ...(header.balance ? [[t('balanceError'), `${formatValue((header.balance.error ?? 0) * 100)} %`]] : []),
        [t('elapsed'), `${formatValue((header.elapsedMs ?? 0) / 1000)} s`],
      ])) : null,
      h('div', { className: 'prop-actions' }, ...['run', 'validate', 'exportReport'].map((id) => h('button', { type: 'button', disabled: !isEnabled(id), onClick: () => run(id) }, `${commandIcon(id)} ${commandName(id, lang)}`))),
    ];
  }

  const resultTable = (rows) => h('table', { className: 'result-table' }, h('tbody', null, ...rows.map(([a, b]) => h('tr', null, h('td', null, a), h('td', null, b)))));

  // ───── viewport overlays: field chips, legend, frame bar, progress
  function renderOverlay() {
    const d = doc();
    const items = [];
    const lang = getLanguage();
    if (d) {
      const chips = [];
      if (d.model.domain.dim === 3 && state.view === '2d') {
        const nz = d.model.domain.nz;
        const layer = state.layer ?? nz - 1;
        chips.push(h('span', { className: 'chip-label' }, t('layer'), h('select', { dataset: { testid: 'layer' }, onChange: (event) => { state.layer = Number(event.target.value); update(); } },
          ...Array.from({ length: nz }, (_, k) => h('option', { value: k, selected: k === layer }, `${k + 1} · z ${formatValue(((k + 0.5) * d.model.domain.depth) / nz)} mm`)))));
      }
      if (d.result && state.view === '3d' && state.showResult && d.result.header.grid.dim === 3) {
        // 3D post-processing: a slice plane through the result and an isosurface (ParaView Slice / Contour).
        const g = d.result.header.grid;
        const counts = { x: g.nx, y: g.ny, z: g.nz };
        const sl = state.slice ?? { axis: '', index: 0 };
        chips.push(h('span', { className: 'chip-label' }, t('sliceLabel'), h('select', { dataset: { testid: 'slice-axis' }, onChange: (event) => { const axis = event.target.value; state.slice = axis ? { axis, index: Math.floor(counts[axis] / 2) } : null; update(); } },
          ...[['', t('off')], ['x', 'x'], ['y', 'y'], ['z', 'z']].map(([v, label]) => h('option', { value: v, selected: v === (sl.axis || '') }, label)))));
        if (sl.axis) chips.push(numberField({ value: sl.index + 1, min: 1, max: counts[sl.axis], step: 1, testid: 'slice-index', onChange: (v) => { state.slice = { ...sl, index: Math.round(v) - 1 }; update(); } }));
        const f = currentField(d);
        const isoOn = Boolean(state.iso?.on);
        chips.push(h('button', { type: 'button', className: isoOn ? 'on' : null, dataset: { testid: 'iso-toggle' }, onClick: () => { state.iso = isoOn ? null : { on: true, value: f ? (f.lo + f.hi) / 2 : 0 }; update(); } }, `◍ ${t('isoLabel')}`));
        if (isoOn && f) {
          const isT = state.fieldKind === 'T';
          const shown = isT ? dispT(state.iso.value) : state.iso.value * (f.scale ?? 1);
          chips.push(numberField({ value: shown, step: Math.max(1e-6, Number(((f.hi - f.lo) / 20).toPrecision(2))), suffix: isT ? tUnit() : f.unit, testid: 'iso-value',
            onChange: (v) => { state.iso = { on: true, value: isT ? fromDisplayT(v, state.settings.temperatureUnit) : v / (f.scale ?? 1) }; update(); } }));
        }
      }
      if (d.result) {
        chips.push(h('button', { type: 'button', className: state.showResult ? 'on' : null, dataset: { testid: 'toggle-result' }, onClick: () => { state.showResult = !state.showResult; update(); } }, state.showResult ? `🌡 ${t('treeResults')}` : `▣ ${t('reportModel')}`));
        if (state.showResult) {
          chips.push(h('select', { dataset: { testid: 'field-select' }, onChange: (event) => run(event.target.value) },
            ...Object.entries(FIELD_COMMANDS).filter(([, kind]) => hasField(kind)).map(([cmd, kind]) => h('option', { value: cmd, selected: kind === state.fieldKind }, `${commandIcon(cmd)} ${commandName(cmd, lang)}`))));
        }
        if (state.showResult && state.fieldKind === 'mode' && d.result.header.modes?.length) {
          chips.push(h('span', { className: 'chip-label' }, '〜', h('select', { dataset: { testid: 'mode-select' }, onChange: (event) => { state.mode = Number(event.target.value); update(); } },
            ...d.result.header.modes.map((m, k) => h('option', { value: k, selected: k === state.mode }, `${t('modeN', { n: k + 1 })} · ${formatValue(m.frequency)} Hz`)))));
        }
        if (d.stale) chips.push(h('span', { className: 'chip-label', title: t('statusReady'), style: { color: 'var(--danger)' } }, '⚠ ', lang === 'en' ? 'model changed — run again' : '모델이 바뀜 — 다시 실행'));
      }
      if (chips.length) items.push(h('div', { className: 'view-chips' }, ...chips));
      if (d.result && state.showResult) {
        const legend = legendBox(d);
        if (legend) items.push(legend);
        const frames = d.result.header.times?.length ?? 1;
        if (frames > 1 && (state.fieldKind === 'T' || state.fieldKind === 'liquid')) {
          const time = d.result.header.times[d.frame] ?? 0;
          items.push(h('div', { className: 'frame-bar', dataset: { testid: 'frame-bar' } },
            h('button', { type: 'button', className: 'tool', title: commandName('animate', lang), onClick: () => run('animate') }, state.playing ? '⏸' : '▶'),
            h('input', { type: 'range', min: 0, max: frames - 1, value: d.frame, dataset: { testid: 'frame-slider' }, onInput: (event) => { stopPlaying(); setFrame(Number(event.target.value)); } }),
            h('span', { className: 'frame-time' }, `${t('time')} ${formatTime(time)} (${d.frame + 1}/${frames})`)));
        }
      }
    }
    if (state.solving) {
      const p = state.progress ?? { fraction: 0, phase: '', message: '' };
      items.push(h('div', { className: 'solve-banner', dataset: { testid: 'solve-banner' } },
        h('div', { className: 'row' }, h('strong', null, t('statusSolving')), h('span', { className: 'muted ellipsis' }, `${phaseName(p.phase)} ${p.message ?? ''}`),
          h('button', { type: 'button', style: { marginLeft: 'auto' }, onClick: () => run('stop'), dataset: { testid: 'solve-stop' } }, `■ ${commandName('stop', lang)}`)),
        h('div', { className: 'progress-track' }, h('div', { className: 'progress-fill', style: { width: `${Math.round((p.fraction ?? 0) * 100)}%` } }))));
    }
    replace(els.overlay, ...items);
  }

  const phaseName = (phase) => {
    const key = `phase${String(phase ?? '')[0]?.toUpperCase() ?? ''}${String(phase ?? '').slice(1)}`;
    const text = t(key);
    return text === key ? phase ?? '' : text;
  };

  function formatTime(seconds) {
    if (seconds >= 3600) return `${formatValue(seconds / 3600, 3)} h`;
    if (seconds >= 120) return `${formatValue(seconds / 60, 3)} min`;
    return `${formatValue(seconds, 4)} s`;
  }

  /** PMV/PPD of the air cells, computed once per result (core/comfort.js). */
  function ensureComfort(d) {
    // Recomputed when the comfort inputs (study › met, clo, humidity, radiant temperature) change.
    const key = JSON.stringify(d.model.study.comfort ?? null);
    if ((d.result.derived?.pmv && d.result.derived.comfortKey === key) || !d.result.header.fields.u) return;
    const fluidIndex = d.result.header.materials.map((id, i) => [id, i]).filter(([id]) => d.model.materials.find((m) => m.id === id)?.kind === 'fluid').map(([, i]) => i);
    const lastT = (d.result.header.fields.T.frames ?? 1) - 1;
    d.result.derived = { ...(d.result.derived ?? {}), ...comfortFields(field(d.result, 'T', lastT), field(d.result, 'u'), field(d.result, 'v'), field(d.result, 'mat'), fluidIndex, d.model.study.comfort, field(d.result, 'w')), comfortKey: key };
  }

  const fieldFrame = (d) => (state.fieldKind === 'mode' ? state.mode : d.frame);

  function currentField(d) {
    if (state.fieldKind === 'comfort' || state.fieldKind === 'ppd') ensureComfort(d);
    const vf = viewField(d.result, state.fieldKind, fieldFrame(d));
    if (!vf) return null;
    const mat = field(d.result, 'mat');
    // Temperature keeps one scale over all frames so the animation compares like with like.
    let r;
    if ((state.fieldKind === 'T' || state.fieldKind === 'liquid') && d.result.header.times?.length > 1) {
      r = state.fieldKind === 'liquid' ? { lo: 0, hi: 1 } : rangeAllFrames(d.result, 'T');
    } else if (state.fieldKind === 'comfort') r = { lo: -3, hi: 3 };
    else if (state.fieldKind === 'ppd') r = { lo: 5, hi: 100 };
    else r = range(vf.values, mat);
    return { ...vf, ...r };
  }

  function legendBox(d) {
    const f = currentField(d);
    if (!f) return null;
    const scale = f.scale ?? 1;
    const isT = state.fieldKind === 'T';
    const conv = (v) => (isT ? dispT(v) : v * scale);
    const lo = conv(f.lo);
    const hi = conv(f.hi);
    const unit = isT ? tUnit() : f.unit;
    const table = lut(state.settings.colormap, state.settings.colorSteps);
    const stops = Array.from({ length: 11 }, (_, i) => {
      const n = Math.round((i / 10) * 255);
      return `rgb(${table[n * 3]},${table[n * 3 + 1]},${table[n * 3 + 2]}) ${i * 10}%`;
    });
    const ticks = niceTicks(lo, hi, 7).filter((v) => v >= lo && v <= hi);
    return h('div', { className: 'legend', dataset: { testid: 'legend' } },
      h('div', { className: 'legend-title' }, `${unit}`),
      h('div', { className: 'legend-body' },
        h('div', { className: 'legend-bar', style: { background: `linear-gradient(0deg, ${stops.join(', ')})` } }),
        h('div', { className: 'legend-ticks' }, ...ticks.map((v) => h('span', { style: { bottom: `${((v - lo) / (hi - lo || 1)) * 100}%` } }, formatValue(v))))),
      h('div', { className: 'legend-title', style: { fontWeight: 400 } }, `${formatValue(lo)} – ${formatValue(hi)}`));
  }

  function setFrame(frame) {
    const d = doc();
    if (!d?.result) return;
    d.frame = Math.max(0, Math.min((d.result.header.times?.length ?? 1) - 1, frame));
    update();
  }

  function stopPlaying() {
    if (playTimer) clearInterval(playTimer);
    playTimer = null;
    state.playing = false;
  }

  // ───── chart strip
  function renderChart() {
    const d = doc();
    const lang = getLanguage();
    const folded = state.settings.bottomCollapsed;
    els.chart.style.display = state.settings.showChartPanel ? '' : 'none';
    els.chartSplitter.style.display = state.settings.showChartPanel && !folded ? '' : 'none';
    els.chart.classList.toggle('collapsed', folded);
    els.chart.style.height = folded ? '' : `${state.settings.chartHeight}px`;
    if (!state.settings.showChartPanel) return;
    // The bottom panel's title bar: icon and title, the tabs, then fold (▾ / ▴) and hide (✕) on the right;
    // folded, only this bar stays (click it to unfold).
    const panelButtons = [
      h('button', { type: 'button', className: 'panel-collapse', title: folded ? t('panelExpand') : t('panelCollapse'), dataset: { testid: 'collapse-bottom' }, onClick: (e) => { e.stopPropagation(); patchSettings({ bottomCollapsed: !folded }); } }, folded ? '▴' : '▾'),
      h('button', { type: 'button', className: 'panel-collapse', title: t('panelHide'), dataset: { testid: 'hide-bottom' }, onClick: (e) => { e.stopPropagation(); patchSettings({ showChartPanel: false }); } }, '✕'),
    ];
    if (folded) {
      replace(els.chartHead,
        h('button', { type: 'button', className: 'chart-unfold', title: t('panelExpand'), dataset: { testid: 'unfold-bottom' }, onClick: () => patchSettings({ bottomCollapsed: false }) },
          h('span', { className: 'menu-icon' }, iconOf('chartPanel')), h('strong', null, t('chartTitle2'))),
        h('span', { className: 'toolbar-spacer' }), ...panelButtons);
      return;
    }
    replace(els.chartHead,
      h('span', { className: 'menu-icon' }, iconOf('chartPanel')), h('strong', { className: 'chart-title' }, t('chartTitle2')),
      ...[['probes', t('chartProbes')], ['line', t('chartLine')], ['bodies', t('chartBodies')], ['residuals', t('chartResiduals')]].map(([id, label]) => h('button', {
        type: 'button', className: state.chartTab === id ? 'chart-tab on' : 'chart-tab', dataset: { testid: `chart-tab-${id}` }, onClick: () => { state.chartTab = id; renderChart(); },
      }, label)),
      h('span', { className: 'toolbar-spacer' }),
      state.chartTab === 'line' ? h('button', { type: 'button', className: 'chart-tab', title: commandTip('lineCut', lang), onClick: () => run('lineCut') }, `${commandIcon('lineCut')} ${commandName('lineCut', lang)}`) : null,
      ...panelButtons);
    const header = d?.result?.header;
    let series = [];
    let bars = null;
    let opts = {};
    if (header && state.chartTab === 'probes' && header.probes?.length) {
      const times = header.times ?? [0];
      series = header.probes.map((p) => ({ name: d.model.probes.find((x) => x.id === p.id)?.name || p.id, points: (p.values ?? []).map((v, i) => [times[i] ?? i, dispT(v)]) }));
      opts = { xLabel: `${t('time')} (s)`, yLabel: tUnit(), marker: times.length > 1 ? times[d.frame] : null };
      if (times.length < 2) {
        // A steady study: one bar per probe.
        bars = header.probes.map((p) => ({ name: d.model.probes.find((x) => x.id === p.id)?.name || p.id, value: dispT(p.values?.[0]) }));
      }
    } else if (header && state.chartTab === 'line' && d.lineCut?.a && d.lineCut?.b) {
      const f = currentField(d);
      if (f) {
        const grid = header.grid;
        const layer = grid.dim === 3 ? state.layer ?? grid.nz - 1 : 0;
        const isT = state.fieldKind === 'T';
        // A line typed in 3D (a and b carry z) samples through the volume; otherwise along the shown layer.
        const pts = grid.dim === 3 && Number.isFinite(d.lineCut.a.z) ? sampleLine3D(grid, f.values, field(d.result, 'mat'), d.lineCut.a, d.lineCut.b) : sampleLine(grid, f.values, field(d.result, 'mat'), d.lineCut.a, d.lineCut.b, layer);
        state.lastLine = { name: state.fieldKind, unit: isT ? tUnit() : f.unit, samples: pts.map((p) => ({ ...p, value: isT ? dispT(p.value) : p.value * (f.scale ?? 1) })) };
        series = [{ name: commandName(Object.keys(FIELD_COMMANDS).find((k) => FIELD_COMMANDS[k] === state.fieldKind), lang), points: pts.map((p) => [p.s, isT ? dispT(p.value) : p.value * (f.scale ?? 1)]) }];
        opts = { xLabel: 'A → B (mm)', yLabel: isT ? tUnit() : f.unit };
      }
    } else if (header && state.chartTab === 'residuals' && header.residuals?.iterations?.length) {
      // Convergence: each residual on a log scale (log10 of the normalised value).
      const its = header.residuals.iterations;
      series = Object.entries(header.residuals.series ?? {}).filter(([, values]) => values?.length).map(([name, values]) => ({ name, points: values.map((v, i) => [its[i] ?? i, v > 0 ? Math.log10(v) : NaN]) }));
      opts = { xLabel: t('iterations'), yLabel: 'log₁₀' };
    } else if (header && state.chartTab === 'bodies' && header.bodies?.length) {
      const times = header.times ?? [0];
      if (times.length > 1) {
        series = header.bodies.filter((b) => b.maxHistory?.length).map((b) => ({ name: d.model.bodies.find((x) => x.id === b.id)?.name || b.id, points: b.maxHistory.map((v, i) => [times[i] ?? i, dispT(v)]) }));
        opts = { xLabel: `${t('time')} (s)`, yLabel: tUnit(), marker: times[d.frame] };
      } else {
        bars = header.bodies.map((b) => ({ name: d.model.bodies.find((x) => x.id === b.id)?.name || b.id, value: dispT(b.max) }));
      }
    }
    const any = Boolean(bars?.length) || series.length > 0;
    els.chartHint.style.display = any ? 'none' : '';
    els.chartHint.textContent = t('chartEmpty');
    requestAnimationFrame(() => {
      if (bars?.length) drawBarChart(els.chartCanvas, bars, { unit: tUnit() });
      else if (series.length) drawLineChart(els.chartCanvas, series, opts);
      else els.chartCanvas.getContext('2d').clearRect(0, 0, els.chartCanvas.width, els.chartCanvas.height);
    });
  }

  // ───── status bar
  function renderStatus() {
    const d = doc();
    const c = state.cursor;
    const value = c?.value ? `${formatValue(state.fieldKind === 'T' ? dispT(c.value.value) : c.value.value)} ${state.fieldKind === 'T' ? tUnit() : c.value.unit}` : '';
    replace(els.status,
      h('span', { dataset: { testid: 'status-text' } }, t(state.status) === state.status ? state.status : t(state.status)),
      d ? h('span', { dataset: { testid: 'status-cells' } }, `${t('cells')}: ${cellCount(d.model.domain).toLocaleString()}`) : null,
      d ? h('span', { dataset: { testid: 'status-selection' } }, `${t('selection')}: ${d.selection?.ids?.length ?? 0}`) : null,
      h('span', { dataset: { testid: 'status-cursor' } }, c ? `${t('cursor')}: ${formatValue(toDisplayLength(c.x, state.settings.lengthUnit), 5)}, ${formatValue(toDisplayLength(c.y, state.settings.lengthUnit), 5)} ${state.settings.lengthUnit}` : `${t('cursor')}: —`),
      h('span', { dataset: { testid: 'status-value' } }, value),
      h('span', { dataset: { testid: 'status-engine' } }, `${t('engine')}: ${engineKind === 'native' ? t('engineNative') : t('engineWasm')}`),
      d ? h('span', { dataset: { testid: 'status-dirty' } }, d.dirty ? t('modified') : t('saved')) : null,
      d ? h('span', { dataset: { testid: 'status-doc' }, style: { marginLeft: 'auto', paddingRight: native.isTauri ? '28px' : '10px' } }, d.path ?? d.model.name) : null,
      // The resize marker in the bottom right corner (desktop: drag it to resize the window).
      native.isTauri ? h('span', { className: 'size-grip', dataset: { testid: 'size-grip' }, title: t('resizeWindow'), onPointerdown: (event) => { event.preventDefault(); native.startResize(); } }) : null);
  }

  // ───── the editor / 3D view
  function probeValueText(d, id) {
    const values = d.result?.header.probes?.find((p) => p.id === id)?.values;
    if (!values?.length) return null;
    const v = values[Math.min(values.length - 1, d.frame)];
    return Number.isFinite(v) ? `${formatValue(dispT(v))} ${tUnit()}` : null;
  }

  async function renderView() {
    const d = doc();
    if (!d) return;
    const f = d.result && state.showResult ? currentField(d) : null;
    const probeValues = {};
    if (d.result) for (const p of d.model.probes) probeValues[p.id] = probeValueText(d, p.id);
    const common = {
      model: d.model, selection: d.selection, tool: state.tool, result: d.result, showResult: Boolean(d.result && state.showResult && f),
      fieldKind: state.fieldKind, frame: fieldFrame(d), layer: state.layer, streamlines: state.streamlines, settings: state.settings, range: f ? { lo: f.lo, hi: f.hi } : null,
      slice: state.slice, iso: state.iso,
      isotherms: state.isotherms, vectors: state.vectors, deformed: state.deformed, showGrid: state.settings.showGrid, showMesh: state.settings.showMesh, showAxes: state.settings.showAxes, lengthUnit: state.settings.lengthUnit, showRulers: state.settings.showRulers,
      showLabels: state.settings.showLabels, lineCut: d.lineCut, probeValues, fontFamily: state.settings.fontFamily, fontSize: state.settings.fontSize,
    };
    if (state.view === '3d') {
      editor.canvas.style.display = 'none';
      if (!view3d) {
        const { View3D } = await import('./view3d.js');
        if (state.view !== '3d') return;
        view3d ??= new View3D(els.viewport);
        view3d.onPick = (hit) => pick3d(hit);
      }
      view3d.el.style.display = '';
      view3d.setState(common);
    } else {
      editor.canvas.style.display = '';
      if (view3d) view3d.el.style.display = 'none';
      editor.setState(common);
    }
  }

  /**
   * A click on the 3D view: with the probe tool a probe goes to that point of a 3D model; otherwise the status bar shows
   * the point and the value of the cell just inside the surface.
   */
  function pick3d(hit) {
    const d = doc();
    if (!d) return;
    const dom = d.model.domain;
    const { dx, dy, dz } = cellSize(dom);
    // Half a cell into the body, against the face normal, so the point lies in the cell that was clicked.
    const p = [hit.x - hit.normal[0] * dx * 0.5, hit.y - hit.normal[1] * dy * 0.5, hit.z - hit.normal[2] * (dom.dim === 3 ? dz : 0) * 0.5];
    const clamp = (v, hi) => Math.min(Math.max(v, 0), hi);
    const [x, y, z] = [clamp(p[0], dom.width), clamp(p[1], dom.height), dom.dim === 3 ? clamp(p[2], dom.depth) : dom.depth / 2];
    const len = (v) => formatValue(toDisplayLength(v, state.settings.lengthUnit), 5);
    const at = `x ${len(x)}, y ${len(y)}${dom.dim === 3 ? `, z ${len(z)}` : ''} ${state.settings.lengthUnit}`;
    if (state.tool === 'probe' && dom.dim === 3) {
      const id = newId('p', d.model.probes.map((q) => q.id));
      updateModel((m) => ({ ...m, probes: [...m.probes, { id, name: `${t('newProbe')} ${m.probes.length + 1}`, x, y, z }] }));
      doc().selection = { kind: 'probe', ids: [id] };
      state.status = `${t('probePlaced3d')} ${at}`;
      update({ props: true });
      return;
    }
    const vf = d.result && state.showResult ? viewField(d.result, state.fieldKind, fieldFrame(d)) : null;
    const cell = vf ? cellAt(d.result.header.grid, x, y, z) : -1;
    const value = cell >= 0 ? vf.values[cell] * (vf.scale ?? 1) : null;
    const shown = value == null || !Number.isFinite(value) ? '' : ` → ${state.fieldKind === 'T' ? `${formatValue(dispT(value))} ${tUnit()}` : `${formatValue(value)} ${vf.unit}`}`;
    state.status = `${at}${shown}`;
    renderStatus();
  }

  const editorCallbacks = {
    onSelect: (selection, additive) => select(selection, additive),
    onCursor: (cursor) => {
      state.cursor = cursor;
      renderStatus();
    },
    onZoom: () => renderToolbar(),
    onContext: (x, y) => openContextMenu('canvas', x, y),
    onAddBody: (shape) => addBody(shape),
    onAddProbe: (x, y) => {
      const d = doc();
      const id = newId('p', d.model.probes.map((p) => p.id));
      updateModel((m) => ({ ...m, probes: [...m.probes, { id, name: `${t('newProbe')} ${m.probes.length + 1}`, x, y, z: editor.layerZ() ?? m.domain.depth / 2 }] }));
      doc().selection = { kind: 'probe', ids: [id] };
      update({ props: true });
    },
    onMoveSelection: (dx, dy, commit) => {
      const d = doc();
      if (d.selection?.kind !== 'body') return;
      if (dx || dy) updateModel((m) => ({ ...m, bodies: m.bodies.map((b) => (d.selection.ids.includes(b.id) ? moveBody(b, dx, dy) : b)) }), false);
      if (commit) updateModel((m) => m, true);
    },
    onMoveProbe: (id, x, y, commit) => updateModel((m) => ({ ...m, probes: m.probes.map((p) => (p.id === id ? { ...p, x, y } : p)) }), commit),
    onResizeBody: (id, bounds, commit) => {
      if (bounds) updateModel((m) => ({ ...m, bodies: m.bodies.map((b) => (b.id === id ? resizeBody(b, bounds) : b)) }), false);
      if (commit) updateModel((m) => m, true);
    },
    onLineCut: (line) => {
      const d = doc();
      d.lineCut = line;
      if (line.b) {
        state.chartTab = 'line';
        if (!state.settings.showChartPanel) patchSettings({ showChartPanel: true });
      }
      update();
    },
  };

  function addBody(geometry) {
    const d = doc();
    const id = newId('b', d.model.bodies.map((b) => b.id));
    const material = d.model.materials.find((m) => m.kind !== 'fluid')?.id ?? d.model.materials[0]?.id ?? null;
    const z = d.model.domain.dim === 3 ? { z0: 0, z1: d.model.domain.depth } : {};
    updateModel((m) => ({ ...m, bodies: [...m.bodies, { id, name: `${t('newBody')} ${m.bodies.length + 1}`, material, ...z, ...geometry }] }));
    doc().selection = { kind: 'body', ids: [id] };
    state.showResult = false;
    update({ props: true });
  }

  // ───────────────────────── update
  function update(parts = {}) {
    const d = doc();
    if (!els.toolbar) return;
    const theme = resolveTheme(state.settings.theme, state.settings.customTheme);
    const width = (shown, collapsed) => (!shown ? 0 : collapsed ? 30 : state.settings.panelSize);
    els.workspace.style.gridTemplateColumns = `${width(state.settings.showToolPanel, state.settings.leftCollapsed)}px minmax(0, 1fr) ${width(state.settings.showPropertyPanel, state.settings.rightCollapsed)}px`;
    els.left.hidden = !state.settings.showToolPanel;
    els.right.hidden = !state.settings.showPropertyPanel;
    renderToolbar();
    renderLeft();
    renderTabs();
    renderRight(parts.props);
    renderOverlay();
    renderStatus();
    renderChart();
    renderView();
    fitMinWidth();
    if (els.project) {
      const name = d ? `${d.model.name || t('untitled')}${d.dirty ? ' *' : ''}` : '';
      els.project.textContent = name;
      els.project.title = name;
    }
    if (d) native.setWindowTitle(`${d.model.name || t('untitled')}${d.dirty ? ' *' : ''} — MyHeatManager v${__APP_VERSION__}`);
    void theme;
  }

  /**
   * The window's minimum width: what the toolbar (and the menu bar) need with every button showing.
   * Measured at max-content, where the spacer shrinks to its min-width; re-applied when it changes
   * (font size, language, toolbar state). The web page gets the same min-width and scrolls instead.
   */
  let minWidth = 0;
  function fitMinWidth() {
    const need = (el) => {
      if (!el) return 0;
      const old = el.style.width;
      el.style.width = 'max-content';
      const width = el.getBoundingClientRect().width;
      el.style.width = old;
      return width;
    };
    const width = Math.ceil(Math.max(need(els.toolbar), need(els.menubar)));
    if (!width || Math.abs(width - minWidth) < 2) return;
    minWidth = width;
    appEl.style.minWidth = `${width}px`;
    native.setMinWidth(width);
  }

  /** Cell counts so the thinnest visible body spans two cells (at most ~250k cells in 2D, 1.5M in 3D). */
  function autoMesh() {
    const d = doc();
    if (!d) return;
    const dm = d.model.domain;
    let thin = Math.min(dm.width, dm.height) / 20;
    for (const b of d.model.bodies.filter((x) => !x.hidden)) {
      const bb = bodyBounds(b);
      thin = Math.min(thin, Math.max(1e-3, bb.x1 - bb.x0), Math.max(1e-3, bb.y1 - bb.y0));
    }
    let cell = thin / 2;
    const limit = dm.dim === 3 ? 1.5e6 / Math.max(1, dm.nz) : 250000;
    while ((dm.width / cell) * (dm.height / cell) > limit) cell *= 1.15;
    updateModel((m) => ({ ...m, domain: { ...m.domain, nx: Math.max(4, Math.round(dm.width / cell)), ny: Math.max(4, Math.round(dm.height / cell)) } }));
    renderRight(true);
    state.status = t('autoMeshDone', { nx: doc().model.domain.nx, ny: doc().model.domain.ny });
    renderStatus();
  }

  // ───────────────────────── commands
  function hasField(kind) {
    const d = doc();
    if (kind === 'calc') return Boolean(d?.result?.derived?.calc);
    const name = FIELD_REQUIRES[kind];
    return Boolean(d?.result?.header.fields?.[name]);
  }

  function isEnabled(id) {
    const d = doc();
    if (!d) return ['new', 'open', 'newFromSample', 'settings', 'about', 'usage'].includes(id);
    if (FIELD_COMMANDS[id]) return hasField(FIELD_COMMANDS[id]);
    switch (id) {
      case 'undo': return d.past.length > 0;
      case 'redo': return d.future.length > 0;
      case 'run': case 'validate': return !state.solving;
      case 'stop': return state.solving;
      case 'copy': case 'duplicate': case 'bringFront': case 'sendBack': case 'assignMaterial': case 'heatSource': return d.selection?.kind === 'body';
      case 'delete': return Boolean(d.selection && ['body', 'boundary', 'probe', 'material'].includes(d.selection.kind));
      case 'paste': return Boolean(state.clipboard?.length);
      case 'animate': return (d.result?.header.times?.length ?? 0) > 1;
      case 'deformed': return hasField('disp');
      case 'vectors': return Boolean(d.result?.header.fields?.qx || d.result?.header.fields?.u);
      case 'streamlines': return Boolean(d.result?.header.fields?.u);
      case 'isotherms': case 'lineCut': case 'clearResults': case 'exportCsv': case 'exportVtk': case 'exportVtu': case 'probeChart': case 'calculator': return Boolean(d.result);
      case 'exportTherm': return d.model.domain.dim === 2;
      case 'heatmapExport': case 'heatmapStats': return Boolean(state.heatmap.data);
      case 'toggleHide': return d.selection?.kind === 'body';
      case 'closeOthers': return state.docs.length > 1;
      case 'exportChart': return state.settings.showChartPanel;
      case 'exportProbesCsv': return Boolean(d.result?.header.probes?.length);
      case 'lineCut3d': return Boolean(d.result && d.result.header.grid.dim === 3);
      case 'exportLineCsv': return Boolean(d.result && d.lineCut?.a && d.lineCut?.b);
      default: return true;
    }
  }

  function isChecked(id) {
    const d = doc();
    if (TOOLS.includes(id)) return state.tool === id && !(id === 'select' && state.view === '3d');
    if (FIELD_COMMANDS[id]) return Boolean(d?.result && state.showResult && state.fieldKind === FIELD_COMMANDS[id]);
    switch (id) {
      case 'home': return Boolean(state.startVisible);
      case 'run': return state.solving;
      case 'view2d': return state.view === '2d';
      case 'view3d': return state.view === '3d';
      case 'showGrid': return state.settings.showGrid;
      case 'showMesh': return state.settings.showMesh;
      case 'showAxes': return state.settings.showAxes;
      case 'showRulers': return state.settings.showRulers;
      case 'showLabels': return state.settings.showLabels;
      case 'toolPanel': return state.settings.showToolPanel;
      case 'propertyPanel': return state.settings.showPropertyPanel;
      case 'chartPanel': return state.settings.showChartPanel;
      case 'isotherms': return state.isotherms;
      case 'vectors': return state.vectors;
      case 'deformed': return state.deformed;
      case 'animate': return state.playing;
      case 'steady': return d?.model.study.type === 'steady';
      case 'transient': return d?.model.study.type === 'transient';
      case 'toggleFlow': return Boolean(d?.model.study.flow);
      case 'toggleNatural': return Boolean(d?.model.study.natural);
      case 'toggleStress': return Boolean(d?.model.study.stress);
      case 'toggleTurbulence': return d?.model.study.turbulence === 'kOmegaSST';
      case 'toggleElectric': return Boolean(d?.model.study.electric);
      case 'toggleModal': return Boolean(d?.model.study.modal?.enabled);
      case 'streamlines': return state.streamlines;
      default: return false;
    }
  }

  async function run(id) {
    const d = doc();
    const lang = getLanguage();
    // Working on the model leaves the start page; help, settings and file pickers keep it.
    if (state.startVisible && !START_KEEPS.has(id)) showStart(false);
    if (FIELD_COMMANDS[id]) {
      if (!hasField(FIELD_COMMANDS[id])) return;
      state.fieldKind = FIELD_COMMANDS[id];
      state.showResult = true;
      update();
      return;
    }
    if (BC_COMMANDS[id]) {
      addBoundary(BC_COMMANDS[id]);
      return;
    }
    if (TOOLS.includes(id)) {
      state.tool = id;
      editor?.cancelDraft();
      if (id === 'lineCut') {
        state.view = '2d';
        if (d) d.lineCut = null;
      } else if (id === 'probe' && state.view === '3d' && d?.model.domain.dim === 3) {
        // In the 3D view of a 3D model a probe goes where the model is clicked (pick3d).
        state.status = t('probePick3d');
      } else if (id !== 'select') {
        state.showResult = false;
        state.view = '2d';
      }
      setHint(id);
      update();
      return;
    }
    switch (id) {
      case 'new': addDoc(emptyModel(lang)); showStart(false); update({ props: true }); editor.fit(); break;
      case 'home': showStart(!state.startVisible); update(); break;
      case 'tutorial': startTutorial(); break;
      case 'tutorialDoc': native.openGuide(lang, 'Tutorial', `${commandName('tutorialDoc', lang)} — MyHeatManager`).catch((error) => dialogs.showError(String(error))); break;
      case 'newFromSample': dialogs.showSamples(api); break;
      case 'open': await openFile(); break;
      case 'save': if (d) await saveDoc(d); break;
      case 'saveAs': if (d) await saveDoc(d, true); break;
      case 'closeTab': if (d) closeDoc(d.id); break;
      case 'quit': requestQuit(); break;
      case 'exportCsv': await exportCsv(); break;
      case 'exportPng': await exportPng(); break;
      case 'exportVtk': await exportVtk(); break;
      case 'exportReport': dialogs.showReport(api); break;
      case 'print': printReport(); break;
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'copy': state.clipboard = selectedBodies().map((b) => structuredClone(b)); update(); break;
      case 'paste': pasteBodies(state.clipboard ?? [], 5); break;
      case 'duplicate': pasteBodies(selectedBodies(), 5); break;
      case 'delete': deleteSelection(); break;
      case 'selectAll': if (d) select({ kind: 'body', ids: d.model.bodies.map((b) => b.id) }); break;
      case 'bringFront': case 'sendBack': reorder(id === 'bringFront'); break;
      case 'fit': editor?.fit(); if (view3d && d) { view3d.fit(d.model.domain, d.model.domain.dim === 3 ? d.model.domain.depth : Math.max(d.model.domain.width, d.model.domain.height) * 0.08); view3d.render(); } renderToolbar(); break;
      case 'zoomReset': if (state.view === '3d' && view3d && d) { view3d.fit(d.model.domain, d.model.domain.dim === 3 ? d.model.domain.depth : Math.max(d.model.domain.width, d.model.domain.height) * 0.08); view3d.updateGuides(); view3d.render(); } else editor?.resetView(); renderToolbar(); break;
      case 'zoomIn': if (state.view === '3d' && view3d) view3d.zoomBy(1.25); else editor?.zoomAt(1.25); renderToolbar(); break;
      case 'zoomOut': if (state.view === '3d' && view3d) view3d.zoomBy(0.8); else editor?.zoomAt(0.8); renderToolbar(); break;
      case 'view2d': state.view = '2d'; update(); break;
      case 'view3d': state.view = '3d'; update(); break;
      case 'showGrid': patchSettings({ showGrid: !state.settings.showGrid }); break;
      case 'showMesh': patchSettings({ showMesh: !state.settings.showMesh }); break;
      case 'showAxes': patchSettings({ showAxes: !state.settings.showAxes }); break;
      case 'showRulers': patchSettings({ showRulers: !state.settings.showRulers }); break;
      case 'showLabels': patchSettings({ showLabels: !state.settings.showLabels }); break;
      case 'toolPanel': patchSettings({ showToolPanel: !state.settings.showToolPanel }); break;
      case 'propertyPanel': patchSettings({ showPropertyPanel: !state.settings.showPropertyPanel }); break;
      case 'chartPanel': patchSettings({ showChartPanel: !state.settings.showChartPanel, bottomCollapsed: false }); break;
      case 'fullscreen': native.toggleFullscreen(); break;
      case 'domain': dialogs.showDomain(api); break;
      case 'materials': dialogs.showMaterials(api); break;
      case 'assignMaterial': {
        const sel = d?.selection;
        const current = sel?.kind === 'material' ? sel.ids[0] : null;
        if (current) assignMaterial(current);
        else dialogs.showMaterials(api);
        break;
      }
      case 'newMaterial': {
        const mid = newId('m', d.model.materials.map((m) => m.id));
        updateModel((m) => ({ ...m, materials: [...m.materials, { id: mid, name: `${t('newMaterialName')} ${m.materials.length + 1}`, kind: 'solid', color: '#a0b4c8', k: 10, rho: 2000, cp: 800, emissivity: 0.5, E: 100e9, nu: 0.3, alpha: 10e-6 }] }));
        select({ kind: 'material', ids: [mid] });
        break;
      }
      case 'heatSource': {
        const body = selectedBodies()[0];
        if (!body) break;
        if (!body.power && !body.powerProfile && !body.current) patchBody(body.id, { power: 1 });
        requestAnimationFrame(() => els.right.querySelector('input[data-testid="prop-power"]')?.focus());
        break;
      }
      case 'steady': case 'transient': updateModel((m) => ({ ...m, study: { ...m.study, type: id } })); renderRight(true); break;
      case 'toggleFlow': updateModel((m) => ({ ...m, study: { ...m.study, flow: !m.study.flow } })); renderRight(true); break;
      case 'toggleNatural': updateModel((m) => ({ ...m, study: { ...m.study, natural: !m.study.natural, flow: m.study.natural ? m.study.flow : true } })); renderRight(true); break;
      case 'toggleStress': updateModel((m) => ({ ...m, study: { ...m.study, stress: !m.study.stress } })); renderRight(true); break;
      case 'toggleTurbulence': updateModel((m) => ({ ...m, study: { ...m.study, turbulence: m.study.turbulence === 'kOmegaSST' ? 'laminar' : 'kOmegaSST', flow: true } })); renderRight(true); break;
      case 'toggleElectric': updateModel((m) => ({ ...m, study: { ...m.study, electric: !m.study.electric } })); renderRight(true); break;
      case 'toggleModal': updateModel((m) => ({ ...m, study: { ...m.study, modal: { ...m.study.modal, enabled: !m.study.modal.enabled } } })); renderRight(true); break;
      case 'streamlines': state.streamlines = !state.streamlines; state.showResult = true; if (state.streamlines && hasField('velocity')) state.fieldKind = state.fieldKind === 'T' ? state.fieldKind : state.fieldKind; update(); break;
      case 'parametric': dialogs.showParametric(api); break;
      case 'autoMesh': autoMesh(); break;
      case 'solverSettings': dialogs.showStudy(api); break;
      case 'validate': dialogs.showValidation(issuesOf(d.model)); break;
      case 'run': await solve(); break;
      case 'stop': cancelStudy(); break;
      case 'isotherms': state.isotherms = !state.isotherms; state.showResult = true; update(); break;
      case 'vectors': state.vectors = !state.vectors; state.showResult = true; update(); break;
      case 'deformed': state.deformed = !state.deformed; state.showResult = true; update(); break;
      case 'animate': toggleAnimation(); break;
      case 'probeChart': state.chartTab = 'probes'; patchSettings({ showChartPanel: true, bottomCollapsed: false }); break;
      case 'clearResults': if (d) { d.result = null; d.stale = false; state.showResult = false; stopPlaying(); update({ props: true }); } break;
      case 'reliability': dialogs.showReliability(api); break;
      case 'uFactor': dialogs.showUFactor(api); break;
      case 'heatmapImport': await importNodeData(); break;
      case 'heatmapView': case 'heatmapStats': dialogs.showHeatmap(api); break;
      case 'heatmapExport': dialogs.showHeatmap(api); break;
      case 'batchHelp': dialogs.showBatchHelp(api); break;
      case 'thermalAnalysis': dialogs.showThermal(api); break;
      case 'exportCalculix': if (d) await saveText(downloadName(d.model.name, 'inp'), calculixDeck(d.model), 'inpFiles', 'inp'); break;
      case 'importDxf': await importDxf(); break;
      case 'importModel': await importModelFile(); break;
      case 'fileFormats': dialogs.showFormats(api); break;
      case 'compactModel': engineering.showCompactModel(api); break;
      case 'heatSink': engineering.showHeatSink(api); break;
      case 'pcbStackup': engineering.showPcbStackup(api); break;
      case 'powerMap': engineering.showPowerMap(api); break;
      case 'solderFatigue': engineering.showSolderFatigue(api); break;
      case 'harmonic': engineering.showHarmonic(api); break;
      case 'calculator': engineering.showCalculator(api); break;
      case 'heatmapCompare': engineering.showHeatmapCompare(api); break;
      case 'exportNastran': if (d) await saveText(downloadName(d.model.name, 'bdf'), nastranBdf(d.model), 'nastranFiles', 'bdf'); break;
      case 'exportAnsys': if (d) await saveText(downloadName(d.model.name, 'cdb'), ansysCdb(d.model), 'ansysFiles', 'cdb'); break;
      case 'exportComsol': if (d) await saveText(downloadName(d.model.name, 'mphtxt'), comsolMphtxt(d.model), 'comsolFiles', 'mphtxt'); break;
      case 'exportGmsh': if (d) await saveText(downloadName(d.model.name, 'msh'), gmshMsh(d.model), 'gmshFiles', 'msh'); break;
      case 'exportTherm': if (d) await saveText(downloadName(d.model.name, 'thmx'), modelToTherm(d.model), 'thermFiles', 'thmx'); break;
      case 'exportStl': if (d) await saveText(downloadName(d.model.name, 'stl'), modelStl(d.model), 'stlFiles', 'stl'); break;
      case 'exportDxf': if (d) await saveText(downloadName(d.model.name, 'dxf'), dxfFromModel(d.model), 'dxfFiles', 'dxf'); break;
      case 'exportVtu': if (d?.result) await saveText(downloadName(d.model.name, 'vtu'), resultVtu(d.result, d.model.name), 'vtuFiles', 'vtu'); break;
      case 'settings': dialogs.showSettings(api); break;
      case 'about': dialogs.showAbout(api); break;
      case 'shortcuts': dialogs.showShortcuts(api); break;
      case 'usage': native.openGuide(lang, 'UsersGuide', `${commandName('usage', lang)} — MyHeatManager`).catch((error) => dialogs.showError(String(error))); break;
      case 'clearRecent': patchSettings({ recentFiles: [] }); break;
      case 'textCut': case 'textCopy': case 'textSelectAll': {
        const field = state.ctxText;
        if (!field) break;
        field.focus();
        if (id === 'textSelectAll') field.select();
        else document.execCommand(id === 'textCut' ? 'cut' : 'copy');
        break;
      }
      case 'textPaste': {
        const field = state.ctxText;
        if (!field) break;
        field.focus();
        try {
          const text = await navigator.clipboard.readText();
          document.execCommand('insertText', false, text);
        } catch {
          document.execCommand('paste');
        }
        break;
      }
      case 'closeOthers': {
        const keep = state.activeId;
        const others = state.docs.filter((x) => x.id !== keep).map((x) => x.id);
        const next = () => { const id2 = others.shift(); if (id2) closeDoc(id2, next); else activate(keep); };
        next();
        break;
      }
      case 'toggleHide': {
        const ids = selectedBodies().map((b) => b.id);
        if (ids.length) updateModel((m) => ({ ...m, bodies: m.bodies.map((b) => (ids.includes(b.id) ? { ...b, hidden: !b.hidden } : b)) }));
        break;
      }
      case 'lineCut3d': if (d?.result) dialogs.showLineCut3d(api); break;
      case 'exportProbesCsv': if (d?.result) await saveText(downloadName(`${d.model.name}-probes`, 'csv'), probesCsv(d.result.header, d.model, tUnit()), 'csvFilesOut', 'csv'); break;
      case 'exportLineCsv': if (state.lastLine) await saveText(downloadName(`${d?.model.name ?? 'line'}-line`, 'csv'), lineCsv(state.lastLine.samples, state.lastLine.name, state.lastLine.unit), 'csvFilesOut', 'csv'); break;
      case 'exportChart': els.chartCanvas.toBlob((blob) => blob && saveBlob(downloadName(`${d?.model.name ?? 'chart'}-chart`, 'png'), blob, 'pngFiles', 'png'), 'image/png'); break;
      default: break;
    }
  }

  function setHint(tool) {
    const keys = { select: 'hintSelect', rect: 'hintRect', circle: 'hintCircle', polygon: 'hintPolygon', probe: 'hintProbe', lineCut: 'hintLine' };
    state.status = keys[tool] ?? 'statusReady';
  }

  function issuesOf(model) {
    return checkModel(model).map((issue) => ({ ...issue, text: t(issue.key, issue.args) }));
  }

  /** The patch for changing a boundary's type: an internal fan needs an interior target, a region and a curve; others an edge. */
  function retypeBoundary(m, bc, type) {
    if (type === 'internalFan') {
      const dom = m.domain;
      const r = (v) => Math.round(v * 100) / 100;
      const region = bc.region ?? (dom.dim === 3
        ? [r(dom.width * 0.45), r(dom.height * 0.2), r(dom.depth * 0.2), r(dom.width * 0.55), r(dom.height * 0.8), r(dom.depth * 0.8)]
        : [r(dom.width * 0.45), r(dom.height * 0.2), r(dom.width * 0.55), r(dom.height * 0.8)]);
      return { type, target: bc.target.startsWith('body:') ? bc.target : 'interior', region, curve: bc.curve?.length >= 2 ? bc.curve : (dom.dim === 3 ? [[0, 60], [0.004, 30], [0.008, 0]] : [[0, 60], [0.002, 30], [0.004, 0]]) };
    }
    return { type, target: bc.target === 'interior' ? 'exterior' : bc.target };
  }

  function addBoundary(type) {
    const d = doc();
    if (!d) return;
    const lang = getLanguage();
    const bodies = selectedBodies();
    const defaults = { inlet: 'left', outlet: 'right', open: 'top', fixed: 'bottom', voltage: 'left', ground: 'right', currentIn: 'left', pressure: 'top', force: 'top' };
    const base = { type, T: d.model.ambient, Tinf: d.model.ambient, Tamb: d.model.ambient, Tin: d.model.ambient, h: type === 'convection' ? 10 : 10, emissivity: type === 'radiation' ? 0.9 : 0, q: 1000, velocity: 1 };
    // An existing boundary that is selected just changes its type.
    if (d.selection?.kind === 'boundary' && !bodies.length) {
      const bcId = d.selection.ids[0];
      updateModel((m) => ({ ...m, boundaries: m.boundaries.map((b) => (b.id === bcId ? { ...b, ...retypeBoundary(m, b, type) } : b)) }));
      renderRight(true);
      return;
    }
    const targets = type === 'internalFan' ? ['interior'] : bodies.length ? bodies.map((b) => `body:${b.id}`) : [defaults[type] ?? (d.model.domain.background ? 'top' : 'exterior')];
    if (type === 'internalFan') {
      // A thin slab across the middle of the domain, blowing along +x; the curve is a small axial fan's.
      const dom = d.model.domain;
      const r = (v) => Math.round(v * 100) / 100;
      base.region = dom.dim === 3
        ? [r(dom.width * 0.45), r(dom.height * 0.2), r(dom.depth * 0.2), r(dom.width * 0.55), r(dom.height * 0.8), r(dom.depth * 0.8)]
        : [r(dom.width * 0.45), r(dom.height * 0.2), r(dom.width * 0.55), r(dom.height * 0.8)];
      base.direction = '+x';
      base.curve = dom.dim === 3 ? [[0, 60], [0.004, 30], [0.008, 0]] : [[0, 60], [0.002, 30], [0.004, 0]];
    }
    const ids = [];
    updateModel((m) => {
      const taken = m.boundaries.map((b) => b.id);
      const added = targets.map((target) => {
        const id = newId('bc', [...taken, ...ids]);
        ids.push(id);
        const body = m.bodies.find((b) => `body:${b.id}` === target);
        return { id, name: `${bcTypeName(type)}${body ? ` · ${body.name || body.id}` : ''}`, target, ...base };
      });
      return { ...m, boundaries: [...m.boundaries, ...added] };
    });
    doc().selection = { kind: 'boundary', ids };
    state.status = bodies.length ? 'statusReady' : 'bcPickTarget';
    update({ props: true });
    void lang;
  }

  function deleteSelection() {
    const d = doc();
    const sel = d?.selection;
    if (!sel) return;
    if (sel.kind === 'body') {
      updateModel((m) => ({
        ...m,
        bodies: m.bodies.filter((b) => !sel.ids.includes(b.id)),
        boundaries: m.boundaries.filter((bc) => !sel.ids.some((id) => bc.target === `body:${id}`)),
        reliability: { components: m.reliability.components.filter((c) => !sel.ids.includes(c.body)) },
      }));
    } else if (sel.kind === 'boundary') updateModel((m) => ({ ...m, boundaries: m.boundaries.filter((b) => !sel.ids.includes(b.id)) }));
    else if (sel.kind === 'probe') updateModel((m) => ({ ...m, probes: m.probes.filter((p) => !sel.ids.includes(p.id)) }));
    else if (sel.kind === 'material') {
      sel.ids.forEach((id) => removeMaterial(id));
    }
    d.selection = null;
    update({ props: true });
  }

  function pasteBodies(bodies, offset) {
    if (!bodies.length) return;
    const d = doc();
    const ids = [];
    updateModel((m) => {
      const taken = m.bodies.map((b) => b.id);
      const copies = bodies.map((b) => {
        const id = newId('b', [...taken, ...ids]);
        ids.push(id);
        return { ...moveBody(structuredClone(b), offset, -offset), id, name: `${b.name || b.id} (2)` };
      });
      return { ...m, bodies: [...m.bodies, ...copies] };
    });
    d.selection = { kind: 'body', ids };
    update({ props: true });
  }

  function reorder(front) {
    const d = doc();
    const ids = d?.selection?.kind === 'body' ? d.selection.ids : [];
    if (!ids.length) return;
    updateModel((m) => {
      const chosen = m.bodies.filter((b) => ids.includes(b.id));
      const rest = m.bodies.filter((b) => !ids.includes(b.id));
      return { ...m, bodies: front ? [...rest, ...chosen] : [...chosen, ...rest] };
    });
  }

  function updateMaterial(id, patch) {
    updateModel((m) => ({ ...m, materials: m.materials.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  }

  function removeMaterial(id) {
    const d = doc();
    const used = d.model.bodies.some((b) => b.material === id) || d.model.domain.background === id;
    if (used) return;
    updateModel((m) => ({ ...m, materials: m.materials.filter((x) => x.id !== id) }));
  }

  function addLibraryMaterial(libraryId) {
    const d = doc();
    const material = materialFromLibrary(libraryId, getLanguage());
    let id = material.id;
    let n = 2;
    while (d.model.materials.some((m) => m.id === id)) id = `${material.id}${n++}`;
    updateModel((m) => ({ ...m, materials: [...m.materials, { ...material, id }] }));
    return id;
  }

  /**
   * A material whose specific heat follows a measured cp(T) table (the DSC window's sapphire method):
   * a copy of the selected body's material, or a generic solid, with cpT rows [[°C, J/kgK]].
   */
  function addMaterialCpT(rows, name) {
    const d = doc();
    if (!d || !rows?.length) return null;
    const body = d.selection?.kind === 'body' ? d.model.bodies.find((b) => b.id === d.selection.ids[0]) : null;
    const base = d.model.materials.find((m) => m.id === body?.material) ?? { kind: 'solid', k: 0.5, rho: 1200, emissivity: 0.9, color: '#c8a46e' };
    const id = newId('cpT', d.model.materials.map((m) => m.id));
    const mid = rows[Math.floor(rows.length / 2)][1];
    updateModel((m) => ({ ...m, materials: [...m.materials, { ...base, id, name: name || `cp(T) ${id}`, cp: mid, cpT: rows.map(([T, cp]) => [T, cp]) }] }));
    state.status = t('cpTAdded', { name: name || id });
    update({ props: true });
    return id;
  }

  function assignMaterial(materialId) {
    const d = doc();
    const bodies = d.selection?.kind === 'body' ? d.selection.ids : [];
    if (!bodies.length) return;
    updateModel((m) => ({ ...m, bodies: m.bodies.map((b) => (bodies.includes(b.id) ? { ...b, material: materialId } : b)) }));
  }

  function toggleAnimation() {
    const d = doc();
    if (!d?.result) return;
    if (state.playing) {
      stopPlaying();
      update();
      return;
    }
    const frames = d.result.header.times?.length ?? 1;
    if (frames < 2) return;
    state.playing = true;
    state.showResult = true;
    if (d.frame >= frames - 1) d.frame = 0;
    playTimer = setInterval(() => {
      const current = doc();
      if (!current?.result || current !== d) return stopPlaying();
      current.frame = (current.frame + 1) % frames;
      renderOverlay();
      renderView();
      renderChart();
    }, 120);
    update();
  }

  // ───────────────────────── solving
  async function solve() {
    const d = doc();
    if (!d || state.solving) return;
    const issues = issuesOf(d.model);
    if (issues.some((issue) => issue.level === 'error')) {
      dialogs.showValidation(issues);
      state.status = 'validateFirst';
      update();
      return;
    }
    stopPlaying();
    state.solving = true;
    state.progress = { fraction: 0, phase: 'mesh', message: '' };
    state.status = 'statusSolving';
    update();
    const solvedModel = d.model;
    let lastPaint = 0;
    const started = performance.now();
    try {
      const result = await runStudy(engineModel(solvedModel), (progress) => {
        state.progress = progress;
        const now = performance.now();
        if (now - lastPaint > 100) {
          lastPaint = now;
          renderOverlay();
        }
      });
      result.id = ++resultCounter;
      // WebAssembly has no clock of its own: the engine reports 0 there, so time the call here.
      if (!result.header.elapsedMs) result.header.elapsedMs = Math.round(performance.now() - started);
      d.result = result;
      d.stale = d.model !== solvedModel;
      d.frame = Math.max(0, (result.header.times?.length ?? 1) - 1);
      if (!hasFieldIn(result, state.fieldKind)) state.fieldKind = 'T';
      state.showResult = true;
      state.status = result.header.warnings?.length ? `${t('statusDone')} · ⚠ ${result.header.warnings[0]}` : `${t('statusDone')} · ${formatValue((result.header.elapsedMs ?? 0) / 1000)} s`;
      if (state.tool !== 'select' && state.tool !== 'lineCut') state.tool = 'select';
    } catch (error) {
      if (error.message === 'cancelled') state.status = 'statusCancelled';
      else {
        state.status = 'statusFailed';
        dialogs.showError(`${t('statusFailed')}: ${error.message}`, error.result?.header?.warnings?.join('\n') ?? '');
      }
    } finally {
      state.solving = false;
      state.progress = null;
      update({ props: true });
    }
  }

  const hasFieldIn = (result, kind) => Boolean(result.header.fields?.[FIELD_REQUIRES[kind]]);

  // ───────────────────────── files
  const modelFilters = () => [{ name: t('modelFiles'), extensions: [EXTENSION, 'json'] }];

  function openModel(model, path, { keepPristine = false } = {}) {
    const d = doc();
    // Replace a pristine empty tab instead of piling up "Untitled" tabs.
    if (!keepPristine && d && !d.dirty && !d.path && !d.model.bodies.length && !d.result && state.docs.length === 1) state.docs = [];
    const added = addDoc(model, path);
    showStart(false);
    if (path) patchSettings(addRecent(state.settings, path));
    update({ props: true });
    requestAnimationFrame(() => editor?.fit());
    return added;
  }

  // ───────────────────────── start page and tutorial
  function showStart(visible) {
    state.startVisible = visible;
    startPage?.show(visible);
    els.workspace?.classList.toggle('starting', visible);
    if (visible) closeMenu();
    renderToolbar();
  }

  function closeDocForce(id) {
    state.docs = state.docs.filter((x) => x.id !== id);
    if (!state.docs.length) addDoc(emptyModel(getLanguage()));
    if (state.activeId === id || !state.docs.some((x) => x.id === state.activeId)) state.activeId = state.docs[state.docs.length - 1].id;
    activate(state.activeId);
  }

  function startTutorial(index = 0) {
    tutorial.start({ index });
  }

  async function openFile() {
    try {
      const file = await native.openTextFile([...modelFilters(), { name: t('importFiles'), extensions: IMPORT_EXTENSIONS }, { name: t('csvFiles'), extensions: ['csv', 'txt'] }]);
      if (!file) return;
      openText(file.name, file.text, native.isTauri ? file.path : null);
    } catch (error) {
      dialogs.showError(t('fileOpenFailed'), String(error?.message ?? error));
    }
  }

  function openText(name, text, path, extra = {}) {
    if (/\.(csv|txt)$/i.test(name)) {
      dialogs.showHeatmap(api, { data: parseNodeCsv(text), name });
      return;
    }
    if (IMPORT_EXTENSIONS.includes(name.split('.').pop().toLowerCase())) {
      importText(name, text, path, extra);
      return;
    }
    openModel(parseModel(text), path);
  }

  /**
   * THERM .thmx, Gmsh .msh, DXF, a solver deck (Nastran, Ansys, CalculiX, COMSOL) or an IDF board as a new (unsaved)
   * model; the warnings of the conversion go to the status bar.
   */
  async function importText(name, text, path = null, extra = {}) {
    const lang = getLanguage();
    const base = name.replace(/\.[^.]+$/, '');
    let model;
    let warnings = [];
    try {
      if (/\.thmx$/i.test(name)) model = thermToModel(text, { language: lang });
      else if (/\.msh$/i.test(name)) ({ model, warnings } = gmshToModel(text, { language: lang }));
      else if (/\.emn$/i.test(name)) ({ model, warnings } = idfToModel(text, extra.library ?? await idfLibrary(path), { language: lang }));
      else if (deckReader(name)) ({ model, warnings } = deckReader(name)(text, { language: lang }));
    } catch (error) {
      dialogs.showError(t('fileOpenFailed'), `${name}: ${String(error?.message ?? error)}`);
      return;
    }
    if (!model) {
      model = emptyModel(lang);
      const material = model.materials.find((m) => m.kind !== 'fluid')?.id ?? model.materials[0]?.id ?? null;
      const { bodies, bounds } = bodiesFromDxf(text, { material });
      if (!bodies.length) { dialogs.showError(t('dxfEmpty')); return; }
      model = { ...model, bodies, domain: { ...model.domain, width: Math.ceil((bounds?.x1 ?? 100) * 1.05), height: Math.ceil((bounds?.y1 ?? 60) * 1.05) } };
    }
    model = normalizeModel({ ...model, name: model.name || base });
    addDoc(model);
    doc().dirty = true;
    showStart(false);
    state.status = warnings.length ? `${t('imported', { name })} — ${warnings.join(' · ')}` : t('imported', { name });
    update({ props: true });
    editor?.fit();
  }

  /** The IDF part library beside a board file: the same name with .emp on the desktop, else picked by the user (may be skipped). */
  async function idfLibrary(boardPath) {
    if (native.isTauri && boardPath) {
      for (const ext of ['emp', 'EMP']) {
        try { return (await native.readTextFile(boardPath.replace(/\.[^.\\/]+$/, `.${ext}`))).text; } catch { /* not there */ }
      }
    }
    state.status = t('idfPickLibrary');
    update();
    const file = await native.openTextFile([{ name: t('idfLibraryFiles'), extensions: ['emp'] }]);
    return file?.text ?? '';
  }

  async function importModelFile() {
    try {
      const file = await native.openTextFile([{ name: t('importFiles'), extensions: IMPORT_EXTENSIONS }]);
      if (file) await importText(file.name, file.text, native.isTauri ? file.path : null);
    } catch (error) {
      dialogs.showError(t('fileOpenFailed'), String(error?.message ?? error));
    }
  }

  async function openPath(path) {
    try {
      const file = await native.readTextFile(path);
      openText(file.name, file.text, path);
    } catch (error) {
      patchSettings({ recentFiles: state.settings.recentFiles.filter((f) => f.path !== path) });
      dialogs.showError(t('fileOpenFailed'), String(error?.message ?? error));
    }
  }

  async function saveDoc(d, as = false) {
    try {
      const target = await native.saveTextFile(downloadName(d.model.name, EXTENSION), serializeModel(d.model), modelFilters(), as || !native.isTauri ? null : d.path);
      if (!target) return false;
      if (native.isTauri) {
        d.path = target;
        patchSettings(addRecent(state.settings, target));
      }
      d.dirty = false;
      update();
      return true;
    } catch (error) {
      dialogs.showError(t('fileSaveFailed'), String(error?.message ?? error));
      return false;
    }
  }

  async function saveText(name, text, filterKey, extension) {
    try {
      await native.saveTextFile(name, text, [{ name: t(filterKey), extensions: [extension] }]);
    } catch (error) {
      dialogs.showError(t('fileSaveFailed'), String(error?.message ?? error));
    }
  }

  async function saveBlob(name, blob, filterKey, extension) {
    try {
      await native.saveBlobFile(name, blob, [{ name: t(filterKey), extensions: [extension] }]);
    } catch (error) {
      dialogs.showError(t('fileSaveFailed'), String(error?.message ?? error));
    }
  }

  async function exportCsv() {
    const d = doc();
    const f = d?.result ? currentField(d) : null;
    if (!f) return;
    await saveText(downloadName(`${d.model.name}-${state.fieldKind}`, 'csv'), fieldCsv(d.result, f.values, state.fieldKind, f.unit === '°C' ? 'C' : f.unit.replace(/[^\w]/g, '')), 'csvFiles', 'csv');
  }

  async function exportVtk() {
    const d = doc();
    if (!d?.result) return;
    await saveText(downloadName(d.model.name, 'vtk'), resultVtk(d.result, d.model.name), 'vtkFiles', 'vtk');
  }

  async function exportPng() {
    const d = doc();
    const blob = state.view === '3d' && view3d ? await view3d.toBlob() : await editor.toBlob();
    if (blob) await saveBlob(downloadName(d?.model.name, 'png'), blob, 'pngFiles', 'png');
  }

  async function saveReport() {
    const d = doc();
    await saveText(downloadName(`${d.model.name}-report`, 'html'), dialogs.standaloneReport(api, d), 'htmlFiles', 'html');
  }

  /** What the print window can put on paper: the live view (2D canvas or 3D render), the legend and the chart. */
  function printSources() {
    const d = doc();
    if (!d) return null;
    let image = null;
    try {
      if (state.view === '3d' && view3d) { view3d.render(); image = view3d.renderer.domElement.toDataURL('image/png'); }
      else image = editor.canvas.toDataURL('image/png');
    } catch { image = null; }
    let chart = null;
    try { if (state.settings.showChartPanel && els.chartCanvas.width > 10 && d.result) chart = els.chartCanvas.toDataURL('image/png'); } catch { chart = null; }
    let legend = null;
    const f = d.result && state.showResult ? currentField(d) : null;
    if (f) {
      const isT = state.fieldKind === 'T';
      const conv = (v) => (isT ? dispT(v) : v * (f.scale ?? 1));
      const lo = conv(f.lo);
      const hi = conv(f.hi);
      const table = lut(state.settings.colormap, state.settings.colorSteps);
      legend = {
        lo, hi, unit: isT ? tUnit() : f.unit,
        stops: Array.from({ length: 11 }, (_, i) => { const n = Math.round((i / 10) * 255); return `rgb(${table[n * 3]},${table[n * 3 + 1]},${table[n * 3 + 2]}) ${i * 10}%`; }),
        ticks: niceTicks(lo, hi, 7).filter((v) => v >= lo && v <= hi).map((v) => ({ at: ((v - lo) / (hi - lo || 1)) * 100, text: formatValue(v) })),
      };
    }
    return { doc: d, image, chart, legend };
  }

  function printReport() {
    if (!doc()) return;
    showPrint(api, printSources);
  }

  /** DXF outlines → bodies in the current model (the domain grows to hold them). */
  async function importDxf() {
    try {
      const file = await native.openTextFile([{ name: 'DXF', extensions: ['dxf'] }]);
      if (!file) return;
      const d = doc();
      const material = d.model.materials.find((m) => m.kind !== 'fluid')?.id ?? d.model.materials[0]?.id ?? null;
      const { bodies, bounds } = bodiesFromDxf(file.text, { material, taken: d.model.bodies.map((b) => b.id) });
      if (!bodies.length) { dialogs.showError(t('dxfEmpty')); return; }
      updateModel((m) => {
        const domain = { ...m.domain };
        if (bounds) {
          domain.width = Math.max(domain.width, Math.ceil(bounds.x1 * 1.05));
          domain.height = Math.max(domain.height, Math.ceil(bounds.y1 * 1.05));
        }
        return { ...m, domain, bodies: [...m.bodies, ...bodies] };
      });
      doc().selection = { kind: 'body', ids: bodies.map((b) => b.id) };
      state.status = t('dxfImported', { n: bodies.length });
      showStart(false);
      update({ props: true });
      editor?.fit();
    } catch (error) {
      dialogs.showError(t('fileOpenFailed'), String(error?.message ?? error));
    }
  }

  async function importNodeData() {
    try {
      const file = await native.openTextFile([{ name: t('csvFiles'), extensions: ['csv', 'txt'] }]);
      if (!file) return;
      const data = parseNodeCsv(file.text);
      dialogs.closeDialog('heatmap');
      dialogs.showHeatmap(api, { data, name: file.name });
    } catch (error) {
      dialogs.showError(t('fileOpenFailed'), String(error?.message ?? error));
    }
  }

  function requestQuit(fromBrowser = false) {
    const dirty = state.docs.filter((d) => d.dirty);
    if (fromBrowser) return dirty.length > 0 && state.settings.confirmClose;
    if (!dirty.length || !state.settings.confirmClose) {
      native.quit();
      return false;
    }
    state.activeId = dirty[0].id;
    update();
    dialogs.confirmSave(api, async () => {
      for (const d of dirty) if (!(await saveDoc(d))) return;
      native.quit();
    }, () => native.quit());
    return true;
  }

  // ───────────────────────── keyboard, drag and drop
  window.addEventListener('keydown', (event) => {
    if (dialogs.topDialog()) return;
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    const key = event.key;
    const ctrl = event.ctrlKey || event.metaKey;
    const combo = `${ctrl ? 'Ctrl+' : ''}${event.shiftKey && (ctrl || key.startsWith('F')) ? 'Shift+' : ''}${key.length === 1 ? key.toUpperCase() : key}`;
    if (key === 'Escape') {
      closeMenu();
      native.leaveFullscreen();
      editor?.cancelDraft();
      if (state.tool !== 'select') run('select');
      return;
    }
    if (typing && !ctrl && !key.startsWith('F')) return;
    if (key === 'Enter' && state.tool === 'polygon') {
      editor.finishPolygon();
      return;
    }
    if (key === ' ' && !typing) {
      event.preventDefault();
      run('animate');
      return;
    }
    const entry = Object.entries(SHORTCUTS).find(([, keys]) => keys === combo || (keys === 'Delete' && key === 'Delete') || (keys === '+' && (key === '+' || key === '=')) || (keys === '-' && key === '-' && !ctrl));
    if (entry && !(typing && ['Ctrl+C', 'Ctrl+V', 'Ctrl+A', 'Ctrl+Z', 'Ctrl+Y'].includes(combo))) {
      event.preventDefault();
      run(entry[0]);
    }
  });

  appEl.addEventListener('contextmenu', onContextMenu);

  appEl.addEventListener('dragover', (event) => {
    event.preventDefault();
    appEl.classList.add('dropping');
  });
  appEl.addEventListener('dragleave', (event) => {
    if (event.target === appEl || !appEl.contains(event.relatedTarget)) appEl.classList.remove('dropping');
  });
  appEl.addEventListener('drop', async (event) => {
    event.preventDefault();
    appEl.classList.remove('dropping');
    for (const file of Array.from(event.dataTransfer?.files ?? [])) {
      try {
        openText(file.name, await file.text(), null);
      } catch (error) {
        dialogs.showError(t('fileOpenFailed'), `${file.name}: ${error.message}`);
      }
    }
  });

  window.addEventListener('resize', () => {
    renderChart();
    syncTabButtons();
    // Anything that sizes the window below the toolbar's width (a script, a restored placement) is undone.
    if (minWidth && window.innerWidth < minWidth - 1) native.setMinWidth(minWidth);
  });

  // ───────────────────────── API for the dialogs
  const api = {
    state,
    get fonts() { return state.fonts; },
    get isTauri() { return native.isTauri; },
    /** The first element matching selector in the page or in an open pop-out window (dialogs, menus). */
    query: (selector) => [document, ...popoutDocuments()].map((d) => d.querySelector(selector)).find(Boolean) ?? null,
    popoutLabels: () => popoutDocuments().map((d) => d.defaultView?.location.hash.slice(1)),
    doc,
    appInfo: native.appInfo,
    patchSettings,
    updateModel,
    updateMaterial,
    removeMaterial,
    addLibraryMaterial,
    addMaterialCpT,
    assignMaterial,
    openModel,
    importNodeData,
    saveText,
    saveBlob,
    saveReport,
    printReport,
    run,
    refreshHeatmap: null,
    // start page and tutorial
    openPath,
    newModel: (dim) => {
      const model = emptyModel(getLanguage());
      if (dim === 3) {
        model.domain = { ...model.domain, dim: 3, nz: 10, background: null };
        model.boundaries = [{ id: 'bc1', name: getLanguage() === 'en' ? 'Air' : '공기', target: 'exterior', type: 'convection', h: 10, Tinf: 25, emissivity: 0.85 }];
      }
      openModel(normalizeModel(model), null);
    },
    startTutorial,
    showStart,
    startVisible: () => Boolean(startPage?.visible),
    refreshStart: () => startPage?.render(),
    refreshToolbar: () => renderToolbar(),
    /** Opens file text as the Open command would (model, THERM, Gmsh, DXF, node CSV) — tests and drops use it. */
    openText: (name, text, extra) => openText(name, text, null, extra),
    openMenuById: (id) => { const menu = MENUS.find((m) => m.id === id); const anchor = els.menubar.querySelector(`[data-testid=menu-${id}]`); if (menu && anchor) openMenu(menu, anchor); },
    closeMenu,
    activate,
    closeDocForce,
    select: (selection) => select(selection),
    setView: (view) => { state.view = view === '3d' ? '3d' : '2d'; update(); },
    setDisplay: (flags) => { Object.assign(state, flags); update(); },
    setLineCut: (line) => { const d = doc(); d.lineCut = line; state.chartTab = 'line'; state.showResult = true; update(); },
    setChartTab: (tab) => { state.chartTab = tab; update(); },
    setFrame: (frame) => setFrame(frame),
    stopPlaying: () => { stopPlaying(); },
    setStatus: (status) => { state.status = status; renderStatus(); },
    tutorial: () => tutorial,
    setMode: (k) => { state.mode = k; update(); },
    openContextAt: (kind, x, y) => openContextMenu(kind, x, y),
    openCurve: async (onText) => {
      const file = await native.openTextFile([{ name: t('csvFiles'), extensions: ['csv', 'txt'] }]);
      if (file) onText(file.text, file.name);
    },
    addMaterial: (material) => {
      const d = doc();
      let id = material.id;
      let n = 2;
      while (d.model.materials.some((m) => m.id === id)) id = `${material.id}${n++}`;
      updateModel((m) => ({ ...m, materials: [...m.materials, { ...material, id }] }));
      select({ kind: 'material', ids: [id] });
      state.status = t('materialAdded', { name: material.name });
      renderStatus();
      return id;
    },
  };

  // ───────────────────────── start
  addDoc(emptyModel(getLanguage()));
  if (state.settings.animationRandom) {
    const others = ANIMATIONS.filter((k) => k !== state.settings.animation);
    state.settings.animation = others[Math.floor(Math.random() * others.length)];
  }
  state.startVisible = state.settings.showStartPage;
  buildShell();
  applyAppearance();
  native.listFonts().then((fonts) => { state.fonts = fonts; });
  native.onCloseRequested((fromBrowser) => requestQuit(fromBrowser));
  native.onMaximizedChange((maximized) => {
    if (state.maximized === maximized) return;
    state.maximized = maximized;
    buildMenubar();
  });
  native.startupFiles().then((paths) => paths.forEach((path) => openPath(path)));
  window.__myheat = { state, run, api, doc, query: api.query, closeMenu, get tutorial() { return tutorial; }, get view3d() { return view3d; } };
  return api;
}

export { interpolate, SERIES_COLORS };
