// The application shell in the MyCAD layout: menu bar (with the workbench
// selector), toolbar (language, theme, settings and about on the right), the
// node palette and pipeline tree on the left, document tabs + viewport (the
// pipeline graph, the dashboard, the data view or the 3D view) + result strip
// in the middle, the property panel on the right and the status bar.
import { h, replace, numberField, unionJack, taegukgi, aboutMark, themeSwatch, downloadName, parseNumber } from './dom.js';
import { GraphEditor, NODE_W } from './graph.js';
import { chartSpec, drawSpec, tableElement, scalarRows, tableTsv } from './views.js';
import { chartValueAt } from './charts.js';
import * as dialogs from './dialogs.js';
import { showPrint } from './printdialog.js';
import { StartPage } from './startpage.js';
import { iconOf } from './icons.js';
import { Tutorial, STEPS as TUTORIAL_STEPS } from './tutorial.js';
import { t, setLanguage, getLanguage } from '../core/i18n.js';
import { MENUS, WORKBENCHES, TOOLBAR_GROUPS, CONTEXT_MENUS, SHORTCUTS, commandIcon, commandName, commandTip } from '../core/commands.js';
import { THEMES, resolveTheme, themeVars, themesByMode, CUSTOM_THEME_ID, createCustomTheme, sanitizeTheme } from '../core/themes.js';
import { saveSettings, addRecent, ANIMATIONS } from '../core/settings.js';
import { nodeSpec, nodeName, nodeHelp, categoryOf, CATEGORIES, NODES } from '../core/catalog.js';
import {
  emptyModel, normalizeModel, parseModel, serializeModel, newId, createNode, connect, upstream, executionOrder, checkModel, engineModel,
  externalNodes, autoLayout, EXTENSION,
} from '../core/model.js';
import { tableCsv, outputJson, outputSummary, columnNames, findColumn, valueColumns, gridCsv, scalarsCsv } from '../core/result.js';
import { formatValue } from '../core/colormap.js';
import * as native from '../platform/native.js';
import { popoutsEnabled, openPopout, placePopout, hidePopout, setInlinePredicate, popoutDocuments } from '../platform/popout.js';
import { runStudy, cancelStudy, engineKind } from '../platform/solver.js';

/** Data files the importers read (binary ones through a File data node) and SPICE netlists. */
const DATA_EXTENSIONS = ['csv', 'tsv', 'txt', 'json', 'stl', 'wav', 'xlsx', 'mat', 'png'];
const NETLIST_EXTENSIONS = ['cir', 'net', 'sp', 'spice', 'ckt', 'mycircuit', 'myheat'];
const NETLIST_RE = /\.(cir|net|sp|spice|ckt|mycircuit)$/i;

const START_KEEPS = new Set(['about', 'home', 'settings', 'shortcuts', 'usage', 'tutorialDoc', 'tutorial', 'batchHelp', 'newFromSample', 'open', 'quit', 'clearRecent', 'toolPanel', 'propertyPanel', 'chartPanel', 'fullscreen', 'expressionHelp', 'pythonInfo', 'nodeLibrary', 'textCut', 'textCopy', 'textPaste', 'textSelectAll']);
const VIEWS = { viewGraph: 'graph', viewDashboard: 'dashboard', viewData: 'data', view3d: '3d' };

let docCounter = 0;

export function startApp(root, settings) {
  const state = {
    settings,
    docs: [],
    activeId: null,
    view: 'graph',
    running: false,
    runningNodes: new Set(),
    progress: null,
    status: 'statusReady',
    cursor: null,
    chartTab: 'chart',
    tableIndex: 0,
    fonts: [],
    clipboard: null,
    python: undefined,
    plot3d: { x: '', y: '', z: '', color: '', mode: 'line' },
  };
  let graph = null;
  let startPage = null;
  let tutorial = null;
  setInlinePredicate(() => Boolean(tutorial?.active));
  let plot3d = null;
  let themePopped = false;
  let menuOpen = null;

  // ───────────────────────── documents and history
  const doc = () => state.docs.find((d) => d.id === state.activeId) ?? state.docs[0];

  function addDoc(model, path = null) {
    const d = { id: `doc${++docCounter}`, model: normalizeModel(model), path, dirty: false, past: [], future: [], pending: null, selection: null, results: null, runInfo: null, stale: new Set(), trustExternal: false };
    state.docs.push(d);
    state.activeId = d.id;
    if (graph) graph.fitted = false;
    return d;
  }

  /** Applies fn(model) → model. `commit` false keeps the change open; true closes it into one undo step. */
  function updateModel(fn, commit = true, { stale = null } = {}) {
    const d = doc();
    if (!d) return;
    if (!d.pending) d.pending = d.model;
    const before = d.model;
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
    markStale(d, stale ?? changedNodes(before, d.model));
    update();
    if (commit && state.settings.autoRun && !state.running && d.model.nodes.length) scheduleAutoRun();
  }

  /** Node ids whose parameters, inputs or existence changed (moving a node changes nothing). */
  function changedNodes(a, b) {
    const ids = new Set();
    const key = (n) => JSON.stringify([n.type, n.params, n.disabled]);
    const am = new Map(a.nodes.map((n) => [n.id, n]));
    for (const n of b.nodes) if (!am.has(n.id) || key(am.get(n.id)) !== key(n)) ids.add(n.id);
    const linkKey = (l) => `${l.from}>${l.to}:${l.toPort}`;
    const al = new Set(a.links.map(linkKey));
    const bl = new Set(b.links.map(linkKey));
    for (const l of b.links) if (!al.has(linkKey(l))) ids.add(l.to);
    for (const l of a.links) if (!bl.has(linkKey(l))) ids.add(l.to);
    // Sweeps re-run other nodes: any change makes them stale too.
    if (ids.size) for (const n of b.nodes) if (n.type === 'opt.sweep') ids.add(n.id);
    return ids;
  }

  function markStale(d, ids) {
    if (!d.results || !ids.size) return;
    const stack = [...ids];
    while (stack.length) {
      const id = stack.pop();
      if (d.stale.has(id)) continue;
      d.stale.add(id);
      for (const l of d.model.links) if (l.from === id) stack.push(l.to);
    }
  }

  let autoRunTimer = null;
  function scheduleAutoRun() {
    clearTimeout(autoRunTimer);
    autoRunTimer = setTimeout(() => run('run'), 700);
  }

  function undo() {
    const d = doc();
    if (!d?.past.length) return;
    const before = d.model;
    d.future.push(d.model);
    d.model = d.past.pop();
    d.dirty = true;
    markStale(d, changedNodes(before, d.model));
    pruneSelection(d);
    update({ props: true });
  }

  function redo() {
    const d = doc();
    if (!d?.future.length) return;
    const before = d.model;
    d.past.push(d.model);
    d.model = d.future.pop();
    d.dirty = true;
    markStale(d, changedNodes(before, d.model));
    pruneSelection(d);
    update({ props: true });
  }

  function pruneSelection(d) {
    if (!d.selection) return;
    const list = d.selection.kind === 'node' ? d.model.nodes : d.model.links;
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
    state.tableIndex = 0;
    update({ props: true });
  }

  const selectedNodes = () => {
    const d = doc();
    return d?.selection?.kind === 'node' ? d.model.nodes.filter((n) => d.selection.ids.includes(n.id)) : [];
  };
  /** The node whose results the bottom strip and the data view show: the selected one, else the last chart. */
  const focusNode = () => {
    const d = doc();
    if (!d) return null;
    const sel = selectedNodes();
    if (sel.length) return sel[0];
    return null;
  };
  const outputOf = (id) => doc()?.results?.get(id) ?? null;

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
    const c = theme.colors;
    try {
      globalThis.localStorage?.setItem('mysimulator.docTheme', JSON.stringify({
        dark: theme.mode === 'dark',
        vars: { '--bg': c.bg, '--surface': c.panel, '--text': c.text, '--muted': c.muted, '--border': c.line, '--accent': c.accent, '--accent-soft': c.button, '--code-bg': c.panelAlt, '--row-alt': c.panelAlt, '--shadow': '0 1px 3px rgba(0,0,0,.15)' },
      }));
    } catch { /* storage unavailable */ }
  }

  function patchSettings(patch) {
    const languageChanged = patch.language && patch.language !== state.settings.language;
    state.settings = { ...state.settings, ...patch };
    saveSettings(globalThis.localStorage, state.settings);
    if (languageChanged) {
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
    els.dashboard = h('div', { className: 'dashboard', dataset: { testid: 'dashboard' }, hidden: true });
    els.dataView = h('div', { className: 'data-view', dataset: { testid: 'data-view' }, hidden: true });
    els.chartCanvas = h('canvas', { dataset: { testid: 'chart-canvas' } });
    els.chartHint = h('p', { className: 'panel-hint' });
    els.chartTable = h('div', { className: 'chart-table', hidden: true });
    els.chartHead = h('div', { className: 'chart-head' });
    els.chartReadout = h('span', { className: 'chart-readout', dataset: { testid: 'chart-readout' } });
    els.chart = h('div', { className: 'chart-strip', dataset: { testid: 'chart-strip' } },
      els.chartHead, h('div', { className: 'chart-body' }, els.chartCanvas, els.chartTable, els.chartHint, els.chartReadout));
    els.chartSplitter = h('div', { className: 'chart-splitter', title: t('chartTitle') });
    els.center = h('main', { className: 'center' }, els.tabstrip, els.viewport, els.chartSplitter, els.chart);
    els.workspace = h('div', { className: 'workspace', dataset: { testid: 'workspace' } }, els.left, els.center, els.right);
    els.status = h('footer', { className: 'statusbar', dataset: { testid: 'statusbar' } });
    els.drop = h('div', { className: 'drop-hint' }, t('dropHint'));
    els.tour = h('div', { className: 'tour-layer', dataset: { testid: 'tour-layer' } });
    appEl.append(els.menubar, els.toolbar, els.workspace, els.status, els.drop, els.tour);
    els.viewport.append(els.dashboard, els.dataView, els.overlay);
    graph?.destroy();
    graph = new GraphEditor(els.viewport, graphCallbacks);
    plot3d?.destroy();
    plot3d = null;
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
    bindChartHover();
    els.chart.style.height = `${state.settings.chartHeight}px`;
    update({ props: true });
  }

  function bindSplitter() {
    els.chartSplitter.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const startY = event.clientY;
      const start = state.settings.chartHeight;
      const move = (ev) => {
        state.settings.chartHeight = Math.max(110, Math.min(560, start - (ev.clientY - startY)));
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

  /** The value under the mouse on the result chart. */
  function bindChartHover() {
    const readout = (canvas, el, event) => {
      const v = chartValueAt(canvas, event.clientX, event.clientY);
      el.textContent = v ? `x ${formatValue(v.x, 5)} · y ${formatValue(v.y, 5)}` : '';
    };
    els.chartCanvas.addEventListener('pointermove', (event) => readout(els.chartCanvas, els.chartReadout, event));
    els.chartCanvas.addEventListener('pointerleave', () => { els.chartReadout.textContent = ''; });
  }

  // ───── menu bar
  function buildMenubar() {
    const lang = getLanguage();
    replace(els.menubar,
      h('span', { className: 'app-brand', dataset: { testid: 'app-brand' } },
        h('img', { src: './icon.png', alt: '', width: 18, height: 18 }),
        h('b', null, 'MySimulator'),
        h('small', null, `v${__APP_VERSION__}`),
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

  // ───── the menu window (desktop): drop-down menus open in one borderless window kept for reuse.
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
    async show(el, x, y, onClose) {
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

  function openContextMenu(kind, x, y) {
    const menu = CONTEXT_MENUS[kind] ?? CONTEXT_MENUS.general;
    openMenu({ id: 'context', title: t(`ctx_${kind}`), icon: menu.icon }, null, menu.items, { x, y });
  }

  function onContextMenu(event) {
    const target = event.target;
    if (target.closest?.('.popup-backdrop, .menu-popup, .tour-card')) return;
    event.preventDefault();
    if (target.closest('.graph-canvas')) return; // the graph opens its own on release
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
    if (target.closest('[data-testid=dashboard]')) return at('dashboard');
    const node = target.closest('.tree-node');
    const key = node?.dataset.testid?.replace(/^tree-/, '');
    if (key?.startsWith('node-')) {
      const id = key.slice(5);
      const d = doc();
      if (!(d.selection?.kind === 'node' && d.selection.ids.includes(id))) select({ kind: 'node', ids: [id] });
      return at('tree');
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
    const zoomPct = state.view === '3d' && plot3d ? plot3d.zoomPercent() : graph ? Math.round(graph.scale * 100) : 100;
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

  // ───── left panel: node palette + pipeline tree
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

  function paletteButton(id, lang) {
    const type = id.startsWith('add:') ? id.slice(4) : null;
    const button = h('button', {
      type: 'button', className: isChecked(id) ? 'tool on' : 'tool', disabled: !isEnabled(id), title: commandTip(id, lang), dataset: { testid: `tool-${id}` }, onClick: () => run(id),
      draggable: Boolean(type),
    }, h('span', { className: 'menu-icon', style: type ? { color: categoryOf(type).color } : null }, iconOf(id)), h('span', { className: 'ellipsis' }, commandName(id, lang)));
    if (type) {
      button.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('application/x-mysim-node', type);
        event.dataTransfer.effectAllowed = 'copy';
      });
    }
    return button;
  }

  function renderLeft() {
    const lang = getLanguage();
    const wb = WORKBENCHES.find((item) => item.id === state.settings.workbench) ?? WORKBENCHES[0];
    const d = doc();
    const tools = h('div', { className: 'tool-groups', dataset: { testid: 'tool-grid' } }, ...wb.groups.map((group) => h('section', { className: 'tool-group', dataset: { testid: `tool-group-${group.id}` } },
      h('h3', { className: 'tool-group-title' }, h('span', { className: 'menu-icon' }, group.icon), h('span', { className: 'ellipsis' }, lang === 'en' ? group.en : group.ko), h('span', { className: 'tool-group-count' }, group.tools.length)),
      h('div', { className: 'tool-grid' }, ...group.tools.map((id) => paletteButton(id, lang))))));
    els.left.classList.toggle('collapsed', state.settings.leftCollapsed);
    if (state.settings.leftCollapsed) {
      replace(els.left, panelStrip('left'));
      return;
    }
    replace(els.left,
      panelHead('left'),
      ...panelSection('tools', `${wb.icon} ${lang === 'en' ? wb.en : wb.ko}`, tools, h('p', { className: 'panel-hint palette-hint' }, t('paletteHint'))),
      ...panelSection('tree', t('pipelineTree'), d ? pipelineTree(d) : null));
  }

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

  function statusIcon(d, node) {
    const out = d.results?.get(node.id);
    if (state.runningNodes.has(node.id)) return ['⟳', 'run'];
    if (node.disabled) return ['⊘', 'off'];
    if (!out) return ['○', 'none'];
    if (d.stale.has(node.id)) return ['◔', 'stale'];
    if (!out.ok) return out.skipped ? ['–', 'skip'] : ['✕', 'error'];
    return out.warnings.length ? ['⚠', 'warn'] : ['✓', 'ok'];
  }

  function pipelineTree(d) {
    const lang = getLanguage();
    const sel = d.selection;
    const order = executionOrder(d.model) ?? d.model.nodes.map((n) => n.id);
    const rows = [
      h('button', { type: 'button', className: !sel ? 'tree-node on' : 'tree-node', style: { paddingLeft: '8px' }, dataset: { testid: 'tree-pipeline' }, onClick: () => select(null) },
        h('span', { className: 'twist' }, '▾'), h('span', { className: 'menu-icon' }, '⛓'), h('span', { className: 'ellipsis' }, d.model.name || t('untitled')), h('span', { className: 'tree-meta' }, `${d.model.nodes.length}`)),
    ];
    order.forEach((id, index) => {
      const node = d.model.nodes.find((n) => n.id === id);
      if (!node) return;
      const spec = nodeSpec(node.type);
      const [mark, cls] = statusIcon(d, node);
      const out = d.results?.get(id);
      rows.push(h('button', {
        type: 'button', className: sel?.kind === 'node' && sel.ids.includes(id) ? 'tree-node on' : 'tree-node', style: { paddingLeft: '20px' },
        title: `${node.name} — ${spec ? nodeName(spec, lang) : node.type}${out?.error ? `\n${out.error}` : ''}`, dataset: { testid: `tree-node-${id}` },
        onClick: (event) => { select({ kind: 'node', ids: [id] }, event.ctrlKey || event.shiftKey); graph?.reveal(id); },
        onDblclick: () => run('viewData'),
      }, h('span', { className: 'tree-index' }, String(index + 1)), h('span', { className: 'chip', style: { background: categoryOf(node.type).color } }), h('span', { className: 'menu-icon' }, spec?.icon ?? '?'),
      h('span', { className: 'ellipsis' }, node.name), h('span', { className: `tree-status ${cls}` }, mark)));
    });
    if (!d.model.nodes.length) rows.push(h('p', { className: 'panel-hint' }, t('treeEmpty')));
    return h('div', { className: 'spec-tree', dataset: { testid: 'pipeline-tree' } }, ...rows);
  }

  // ───── tabs
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
      const target = dir > 0 ? tabs.find((tab) => tab.offsetLeft > left + 2) : [...tabs].reverse().find((tab) => tab.offsetLeft < left - 2);
      row.scrollTo({ left: target ? target.offsetLeft : dir > 0 ? row.scrollWidth : 0, behavior: 'smooth' });
    };
    els.tabPrev = h('button', { type: 'button', className: 'tab-nav', title: t('tabPrev'), 'aria-label': t('tabPrev'), dataset: { testid: 'tab-prev' }, onClick: () => step(-1) }, '<');
    els.tabNext = h('button', { type: 'button', className: 'tab-nav', title: t('tabNext'), 'aria-label': t('tabNext'), dataset: { testid: 'tab-next' }, onClick: () => step(1) }, '>');
    els.tabsRow = row;
    // The view switch sits at the right of the tab strip.
    const viewSwitch = h('span', { className: 'view-switch', dataset: { testid: 'view-switch' } },
      ...Object.entries(VIEWS).map(([cmd, view]) => h('button', { type: 'button', className: state.view === view ? 'on' : null, dataset: { testid: `view-${view}` }, title: commandTip(cmd, getLanguage()), onClick: () => run(cmd) },
        h('span', { className: 'menu-icon' }, commandIcon(cmd)), h('span', null, commandName(cmd, getLanguage())))));
    replace(els.tabstrip, row, els.tabPrev, els.tabNext,
      h('button', { type: 'button', className: 'ghost', title: commandName('new', getLanguage()), onClick: () => run('new') }, '+'), viewSwitch);
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
    els.tabPrev.disabled = row.scrollLeft <= 1;
    els.tabNext.disabled = row.scrollLeft + row.clientWidth >= row.scrollWidth - 1;
  }

  function activate(id) {
    state.activeId = id;
    if (graph) graph.fitted = false;
    if (plot3d) plot3d.key = null;
    update({ props: true });
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

  const propRow = (label, control, testid, help = null) => h('div', { className: help ? 'prop-row has-help' : 'prop-row', dataset: testid ? { testid } : undefined, title: help ?? undefined }, h('span', { className: 'prop-label', title: help ? `${label} — ${help}` : label }, label), control);
  const fieldGroup = (legend, ...children) => h('fieldset', { className: 'field-group' }, h('legend', null, legend), ...children);
  const resultTable = (rows) => h('table', { className: 'result-table' }, h('tbody', null, ...rows.map(([a, b]) => h('tr', null, h('td', null, a), h('td', null, b)))));

  function patchNode(id, patch, { rerender = true } = {}) {
    updateModel((m) => ({ ...m, nodes: m.nodes.map((n) => (n.id === id ? { ...n, ...patch, params: patch.params ? { ...n.params, ...patch.params } : n.params } : n)) }));
    if (rerender) renderRight(true);
  }

  /** Column names offered for a node's column parameters: what its inputs produced last time. */
  function columnsFor(node, port = null, nodeKey = null, own = false) {
    const d = doc();
    if (own && node.type !== 'source.table') return columnNames(outputOf(node.id));
    if (nodeKey) {
      const target = d.model.nodes.find((n) => n.id === node.params[nodeKey]);
      return target ? columnNames(outputOf(target.id)) : [];
    }
    if (node.type === 'source.table') return columnNames(outputOf(node.id));
    const links = d.model.links.filter((l) => l.to === node.id && (!port || l.toPort === port));
    const names = [];
    for (const l of links) for (const c of columnNames(outputOf(l.from))) if (!names.includes(c)) names.push(c);
    return names;
  }

  function scalarsFor(node, nodeKey) {
    const d = doc();
    if (nodeKey) {
      const target = d.model.nodes.find((n) => n.id === node.params[nodeKey]);
      return target ? (outputOf(target.id)?.scalars ?? []).map((s) => s.name) : [];
    }
    const links = d.model.links.filter((l) => l.to === node.id);
    return links.flatMap((l) => (outputOf(l.from)?.scalars ?? []).map((s) => s.name));
  }

  let datalistCounter = 0;
  function suggestInput(value, options, onChange, testid, placeholder = '') {
    const id = `dl${++datalistCounter}`;
    return h('span', { className: 'suggest' },
      h('input', { type: 'text', value: value ?? '', placeholder, list: options.length ? id : null, dataset: testid ? { testid } : undefined, onChange: (event) => onChange(event.target.value) }),
      options.length ? h('datalist', { id }, ...options.map((o) => h('option', { value: o }))) : null);
  }

  /** The editor of one parameter. */
  function paramControl(node, p, lang) {
    const value = node.params[p.key];
    const set = (v) => patchNode(node.id, { params: { [p.key]: v } }, { rerender: ['select', 'bool', 'node'].includes(p.type) });
    const testid = `param-${p.key}`;
    switch (p.type) {
      case 'number':
      case 'int': {
        const v = value === '' || value == null ? NaN : Number(value);
        return numberField({ value: v, step: p.step ?? (p.type === 'int' ? 1 : 0.1), min: p.min ?? -Infinity, max: p.max ?? Infinity, suffix: p.unit ?? '', testid, digits: 8,
          onChange: (x) => set(p.type === 'int' ? Math.round(x) : x) });
      }
      case 'bool':
        return h('label', { className: 'check' }, h('input', { type: 'checkbox', checked: Boolean(value ?? p.def), dataset: { testid }, onChange: (event) => set(event.target.checked) }));
      case 'select':
        return h('select', { dataset: { testid }, onChange: (event) => set(event.target.value) },
          ...p.options.map(([v, ko, en]) => h('option', { value: v, selected: String(v) === String(value ?? p.def) }, lang === 'en' ? en : ko)));
      case 'code':
        if (node.type === 'dyn.blocks' && p.key === 'diagram') {
          // The diagram text with the graphical editor beside it.
          const area = h('textarea', { className: 'code-input', rows: p.rows ?? 8, spellcheck: false, value: value ?? '', dataset: { testid }, onChange: (event) => set(event.target.value) });
          return h('div', { className: 'csv-editor' }, area,
            h('div', { className: 'row' }, h('button', { type: 'button', dataset: { testid: 'open-block-editor' }, onClick: async () => {
              const { openBlockEditor } = await import('./blockeditor.js');
              openBlockEditor({ text: node.params.diagram ?? '', lang, constants: String(node.params.constants ?? '').split(/[,;\n]/).map((c) => c.split('=')[0].trim()).filter(Boolean), onSave: (text) => patchNode(node.id, { params: { diagram: text } }, { rerender: true }) });
            } }, `🧩 ${t('blockEditor')}`)));
        }
      // falls through
      case 'textarea':
        return h('textarea', { className: p.type === 'code' ? 'code-input' : null, rows: p.rows ?? 4, spellcheck: false, value: value ?? '', placeholder: p.placeholder ?? '', dataset: { testid }, onChange: (event) => set(event.target.value),
          onKeydown: (event) => {
            if (event.key === 'Tab') {
              event.preventDefault();
              const el = event.target;
              const s = el.selectionStart;
              el.setRangeText('  ', s, el.selectionEnd, 'end');
            }
          } });
      case 'csv': {
        const area = h('textarea', { className: 'code-input', rows: p.rows ?? 8, spellcheck: false, value: value ?? '', dataset: { testid }, onChange: (event) => set(event.target.value) });
        return h('div', { className: 'csv-editor' }, area,
          h('div', { className: 'row' },
            h('button', { type: 'button', dataset: { testid: 'param-import' }, onClick: async () => {
              const file = await native.openTextFile([{ name: t('tableFiles'), extensions: ['csv', 'tsv', 'txt', 'json'] }]).catch((e) => { dialogs.showError(String(e)); return null; });
              if (!file) return;
              set(/\.json$/i.test(file.name) ? jsonToCsv(file.text) : file.text);
              state.status = t('imported', { name: file.name });
            } }, `📂 ${t('importFile')}`),
            h('span', { className: 'muted' }, `${String(value ?? '').split('\n').filter((l) => l.trim()).length} ${t('lines')}`)));
      }
      case 'column':
        return suggestInput(value, columnsFor(node, p.port ?? null, p.nodeKey ?? null, Boolean(p.own)), set, testid, t('columnAuto'));
      case 'columns': {
        const names = columnsFor(node);
        const input = h('input', { type: 'text', value: value ?? '', placeholder: t('columnsAll'), dataset: { testid }, onChange: (event) => set(event.target.value) });
        const chips = names.length ? h('div', { className: 'column-chips' }, ...names.slice(0, 30).map((name) => {
          const chosen = String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
          const on = chosen.includes(name);
          return h('button', { type: 'button', className: on ? 'chip-button on' : 'chip-button', onClick: () => set((on ? chosen.filter((c) => c !== name) : [...chosen, name]).join(', ')) }, name);
        })) : null;
        return h('div', { className: 'columns-editor' }, input, chips);
      }
      case 'table': {
        const d = doc();
        const link = d.model.links.find((l) => l.to === node.id);
        const tables = link ? (outputOf(link.from)?.tables ?? []).map((tb) => tb.name) : [];
        return suggestInput(value, tables, set, testid, t('tableFirst'));
      }
      case 'node': {
        const d = doc();
        return h('select', { dataset: { testid }, onChange: (event) => set(event.target.value) },
          h('option', { value: '', selected: !value }, '—'),
          ...d.model.nodes.filter((n) => n.id !== node.id && n.type !== 'opt.sweep').map((n) => h('option', { value: n.id, selected: n.id === value }, `${nodeSpec(n.type)?.icon ?? ''} ${n.name}`)));
      }
      case 'param': {
        const d = doc();
        const target = d.model.nodes.find((n) => n.id === node.params[p.nodeKey]);
        const spec = target ? nodeSpec(target.type) : null;
        const keys = spec ? spec.params.filter((q) => q.type === 'number' || q.type === 'int') : [];
        return h('select', { dataset: { testid }, onChange: (event) => set(event.target.value) },
          h('option', { value: '', selected: !value }, '—'),
          ...keys.map((q) => h('option', { value: q.key, selected: q.key === value }, `${lang === 'en' ? q.en : q.ko} (${q.key})`)),
          ...(value && !keys.some((q) => q.key === value) ? [h('option', { value, selected: true }, value)] : []));
      }
      case 'metric': {
        const options = [...scalarsFor(node, p.nodeKey ?? null), ...(p.nodeKey ? columnsFor(node, null, p.nodeKey) : columnsFor(node))];
        return suggestInput(value, [...new Set(options)], set, testid, t('metricHint'));
      }
      case 'blob': {
        // A file kept in the pipeline (base64): name and size, and a button to choose another.
        const content = String(node.params.content ?? '');
        const kb = Math.round((content.length * 3) / 4 / 1024);
        return h('div', { className: 'row blob-input' },
          h('button', { type: 'button', dataset: { testid: 'param-blob' }, onClick: async () => {
            const file = await native.openDataFile([{ name: t('dataFiles'), extensions: DATA_EXTENSIONS }], true).catch((e) => { dialogs.showError(String(e)); return null; });
            if (!file) return;
            patchNode(node.id, { name: file.name.replace(/\.[^.]+$/, ''), params: { fileName: file.name, content: file.base64 } }, { rerender: true });
            state.status = t('imported', { name: file.name });
          } }, `📂 ${t('importFile')}`),
          h('span', { className: 'muted ellipsis', dataset: { testid: 'param-blob-name' } }, node.params.fileName ? `${node.params.fileName} · ${kb} KB` : t('noFile')));
      }
      case 'file': {
        const input = h('input', { type: 'text', value: value ?? '', dataset: { testid }, onChange: (event) => set(event.target.value) });
        return h('span', { className: 'file-input' }, input,
          native.isTauri ? h('button', { type: 'button', title: t('browse'), onClick: async () => {
            const path = await native.pickPath([{ name: t('allFiles'), extensions: p.filters ?? ['*'] }], Boolean(p.save), value || undefined);
            if (path) set(relativePath(path));
          } }, '…') : null);
      }
      default:
        return h('input', { type: 'text', value: value ?? '', placeholder: p.placeholder ?? '', dataset: { testid }, onChange: (event) => set(event.target.value) });
    }
  }

  /** A path inside the pipeline file's folder is kept relative (the pipeline can move with its data). */
  function relativePath(path) {
    const base = doc()?.path?.replace(/[\\/][^\\/]*$/, '');
    if (base && path.toLowerCase().startsWith(`${base.toLowerCase()}`) && /[\\/]/.test(path[base.length] ?? '')) return path.slice(base.length + 1);
    return path;
  }

  function nodeProperties(d, node) {
    const lang = getLanguage();
    const spec = nodeSpec(node.type);
    if (!spec) return [h('p', { className: 'panel-hint' }, t('issueUnknownType', { name: node.name, type: node.type }))];
    const out = outputOf(node.id);
    const visible = spec.params.filter((p) => !p.show || p.show(node.params));
    const presets = spec.presets?.length ? propRow(t('preset'), h('select', { dataset: { testid: 'node-preset' }, onChange: (event) => {
      const preset = spec.presets.find((x) => x.id === event.target.value);
      if (preset) {
        patchNode(node.id, { params: preset.params });
        state.status = t('presetApplied', { name: lang === 'en' ? preset.en : preset.ko });
        renderStatus();
      }
    } }, h('option', { value: '' }, t('presetChoose')), ...spec.presets.map((x) => h('option', { value: x.id }, lang === 'en' ? x.en : x.ko)))) : null;
    const resultRows = scalarRows(out);
    return [
      fieldGroup(`${spec.icon} ${nodeName(spec, lang)}`,
        propRow(t('name'), h('input', { type: 'text', value: node.name, dataset: { testid: 'prop-name' }, onChange: (event) => patchNode(node.id, { name: event.target.value }) })),
        propRow(t('nodeType'), h('span', { className: 'muted' }, `${categoryOf(node.type).icon} ${lang === 'en' ? categoryOf(node.type).en : categoryOf(node.type).ko} · ${node.type}`)),
        h('details', { className: 'node-help', open: state.settings.showHelp }, h('summary', null, t('nodeHelpTitle')), h('p', null, nodeHelp(spec, lang)),
          spec.desktopOnly ? h('p', { className: 'warn-text' }, native.isTauri ? t('desktopOnlyOk') : t('desktopOnlyWeb')) : null),
        presets,
        propRow(t('disabled'), h('label', { className: 'check' }, h('input', { type: 'checkbox', checked: node.disabled, dataset: { testid: 'prop-disabled' }, onChange: (event) => patchNode(node.id, { disabled: event.target.checked }) })))),
      fieldGroup(`⚙ ${t('parameters')}`, ...visible.map((p) => propRow(lang === 'en' ? p.en : p.ko, paramControl(node, p, lang), `row-${p.key}`, p.help ? p.help[lang === 'en' ? 1 : 0] : null))),
      out ? fieldGroup(`${out.ok ? '📊' : '⚠'} ${t('results')}${d.stale.has(node.id) ? ` · ${t('staleShort')}` : ''}`,
        out.ok ? null : h('p', { className: 'error-text', dataset: { testid: 'prop-error' } }, out.error),
        ...out.warnings.map((w) => h('p', { className: 'warn-text' }, `⚠ ${w}`)),
        resultRows.length ? resultTable(resultRows) : null,
        out.text ? h('pre', { className: 'result-text', dataset: { testid: 'prop-text' } }, out.text) : null,
        out.ok ? h('p', { className: 'muted' }, `${outputSummary(out)}${out.elapsedMs > 0 ? ` · ${formatValue(out.elapsedMs, 3)} ms` : ''}`) : null) : null,
      h('div', { className: 'prop-actions' }, ...['runSelected', 'viewData', 'addToDashboard', 'duplicate', 'toggleDisable', 'delete'].map((id) => h('button', { type: 'button', disabled: !isEnabled(id), title: commandTip(id, lang), dataset: { testid: `prop-action-${id}` }, onClick: () => run(id) }, `${commandIcon(id)} ${commandName(id, lang)}`))),
    ];
  }

  function propertyContent(d) {
    const sel = d.selection;
    const lang = getLanguage();
    if (sel?.kind === 'node') {
      const nodes = d.model.nodes.filter((n) => sel.ids.includes(n.id));
      if (nodes.length === 1) return nodeProperties(d, nodes[0]);
      if (nodes.length > 1) {
        return [h('p', { className: 'panel-hint' }, `${t('selection')}: ${nodes.length}`),
          h('div', { className: 'prop-actions' }, ...['runSelected', 'duplicate', 'copy', 'toggleDisable', 'disconnect', 'delete'].map((id) => h('button', { type: 'button', onClick: () => run(id) }, `${commandIcon(id)} ${commandName(id, lang)}`)))];
      }
    }
    if (sel?.kind === 'link') {
      const link = d.model.links.find((l) => l.id === sel.ids[0]);
      if (link) {
        const from = d.model.nodes.find((n) => n.id === link.from);
        const to = d.model.nodes.find((n) => n.id === link.to);
        return [fieldGroup(`⟶ ${t('link')}`,
          propRow(t('linkFrom'), h('span', null, from?.name ?? link.from)),
          propRow(t('linkTo'), h('span', null, `${to?.name ?? link.to} · ${link.toPort}`))),
        h('div', { className: 'prop-actions' }, h('button', { type: 'button', onClick: () => run('delete') }, `${commandIcon('delete')} ${commandName('delete', lang)}`))];
      }
    }
    // Nothing selected: the pipeline and the last run.
    const m = d.model;
    const counts = { ok: 0, failed: 0, warned: 0 };
    for (const n of m.nodes) {
      const out = d.results?.get(n.id);
      if (!out) continue;
      if (out.ok) { counts.ok++; if (out.warnings.length) counts.warned++; } else counts.failed++;
    }
    return [
      h('p', { className: 'panel-hint', dataset: { testid: 'empty-props' } }, t('emptyProps')),
      fieldGroup(`⛓ ${t('pipeline')}`,
        propRow(t('name'), h('input', { type: 'text', value: m.name, dataset: { testid: 'prop-model-name' }, onChange: (event) => { updateModel((model) => ({ ...model, name: event.target.value }), true, { stale: new Set() }); renderTabs(); } })),
        propRow(t('description'), h('textarea', { rows: 3, value: m.description, dataset: { testid: 'prop-model-desc' }, onChange: (event) => updateModel((model) => ({ ...model, description: event.target.value }), true, { stale: new Set() }) })),
        propRow(t('seed'), numberField({ value: m.settings.seed, min: 0, step: 1, testid: 'prop-seed', onChange: (v) => updateModel((model) => ({ ...model, settings: { ...model.settings, seed: Math.round(v) } }), true, { stale: new Set(m.nodes.map((n) => n.id)) }) })),
        propRow(t('nodes'), h('span', null, `${m.nodes.length} · ${t('links')} ${m.links.length}`))),
      d.runInfo ? fieldGroup(`📊 ${t('lastRun')}`, resultTable([
        [t('runOk'), String(counts.ok)], [t('runFailed'), String(counts.failed)], [t('runWarned'), String(counts.warned)],
        [t('elapsed'), `${formatValue(d.runInfo.elapsedMs / 1000, 3)} s`], [t('engine'), engineKind === 'native' ? t('engineNative') : t('engineWasm')],
      ])) : null,
      h('div', { className: 'prop-actions' }, ...['run', 'validate', 'nodeLibrary', 'exportReport'].map((id) => h('button', { type: 'button', disabled: !isEnabled(id), dataset: { testid: `prop-action-${id}` }, onClick: () => run(id) }, `${commandIcon(id)} ${commandName(id, lang)}`))),
    ];
  }

  // ───── viewport: graph, dashboard, data view, 3D; overlays (progress, chips)
  function renderOverlay() {
    const items = [];
    const d = doc();
    const lang = getLanguage();
    if (d && state.view === '3d') {
      const node = focusNode() ?? d.model.nodes.find((n) => outputOf(n.id)?.tables.length);
      const out = node ? outputOf(node.id) : null;
      const table = out?.tables[0];
      const cols = table ? table.columns.filter((c) => !c.labels).map((c) => c.name) : [];
      const pick = (key, label) => h('span', { className: 'chip-label' }, label, h('select', { dataset: { testid: `plot3d-${key}` }, onChange: (event) => { state.plot3d[key] = event.target.value; renderView(); } },
        ...(key === 'color' ? [h('option', { value: '' }, t('colorByOrder'))] : []), ...cols.map((c) => h('option', { value: c, selected: c === resolved3d(table)[key] }, c))));
      const scene = sceneOf(out);
      if (scene && plot3d) {
        // Playback of a physics scene.
        const anim = plot3d.anim;
        const end = anim ? anim.times[anim.times.length - 1] : 0;
        const label = (time) => `${time.toFixed(2)} / ${end.toFixed(2)} s`;
        plot3d.onSceneTime = (time) => {
          const slider = document.querySelector('[data-testid=scene-time]');
          if (slider && document.activeElement !== slider) slider.value = String(time);
          const text = document.querySelector('[data-testid=scene-clock]');
          if (text) text.textContent = label(time);
        };
        plot3d.onSceneEnd = () => renderOverlay();
        items.push(h('div', { className: 'view-chips' },
          h('span', { className: 'chip-label' }, `${nodeSpec(node.type)?.icon ?? ''} ${node.name}`),
          h('button', { type: 'button', className: anim?.playing ? 'on' : null, dataset: { testid: 'scene-play' }, title: t(anim?.playing ? 'scenePause' : 'scenePlay'), onClick: () => { plot3d.playScene(!plot3d.anim?.playing); renderOverlay(); } }, anim?.playing ? `⏸ ${t('scenePause')}` : `▶ ${t('scenePlay')}`),
          h('button', { type: 'button', dataset: { testid: 'scene-rewind' }, title: t('sceneRewind'), onClick: () => { plot3d.playScene(false); plot3d.seekScene(0); renderOverlay(); } }, '⏮'),
          h('input', { type: 'range', className: 'scene-slider', min: 0, max: end, step: end / 1000 || 0.001, value: anim?.t ?? 0, dataset: { testid: 'scene-time' }, onInput: (event) => plot3d.seekScene(Number(event.target.value)) }),
          h('span', { className: 'chip-label scene-clock', dataset: { testid: 'scene-clock' } }, label(anim?.t ?? 0)),
          h('select', { dataset: { testid: 'scene-speed' }, title: t('sceneSpeed'), onChange: (event) => { if (plot3d.anim) plot3d.anim.speed = Number(event.target.value); } },
            ...[0.1, 0.25, 0.5, 1, 2, 4].map((v) => h('option', { value: v, selected: (anim?.speed ?? 1) === v }, `×${v}`))),
          h('button', { type: 'button', className: state.settings.grid3d ? 'on' : null, dataset: { testid: 'plot3d-grid3d' }, title: commandTip('grid3d', lang), onClick: () => run('grid3d') }, `${commandIcon('grid3d')} ${commandName('grid3d', lang)}`)));
      } else if (table) {
        items.push(h('div', { className: 'view-chips' },
          h('span', { className: 'chip-label' }, `${nodeSpec(node.type)?.icon ?? ''} ${node.name}`),
          pick('x', 'x'), pick('y', 'y'), pick('z', 'z'), pick('color', '🎨'),
          h('select', { dataset: { testid: 'plot3d-mode' }, onChange: (event) => { state.plot3d.mode = event.target.value; renderView(); } },
            h('option', { value: 'line', selected: state.plot3d.mode === 'line' }, t('mode3dLine')), h('option', { value: 'points', selected: state.plot3d.mode === 'points' }, t('mode3dPoints'))),
          ...['grid3d', 'axes3d'].map((cmd) => h('button', { type: 'button', className: state.settings[cmd] ? 'on' : null, dataset: { testid: `plot3d-${cmd}` }, title: commandTip(cmd, lang), onClick: () => run(cmd) }, `${commandIcon(cmd)} ${commandName(cmd, lang)}`))));
      } else items.push(h('div', { className: 'view-empty' }, t('view3dEmpty')));
    }
    if (state.running) {
      const p = state.progress ?? { fraction: 0, phase: '', message: '' };
      items.push(h('div', { className: 'solve-banner', dataset: { testid: 'solve-banner' } },
        h('div', { className: 'row' }, h('strong', null, t('statusRunning')), h('span', { className: 'muted ellipsis' }, p.message ?? ''),
          h('button', { type: 'button', style: { marginLeft: 'auto' }, onClick: () => run('stop'), dataset: { testid: 'solve-stop' } }, `■ ${commandName('stop', lang)}`)),
        h('div', { className: 'progress-track' }, h('div', { className: 'progress-fill', style: { width: `${Math.round((p.fraction ?? 0) * 100)}%` } }))));
    }
    replace(els.overlay, ...items);
  }

  /** The physics scene a node's output describes (its text is {"scene": …}), or null. */
  function sceneOf(out) {
    if (!out?.text?.startsWith('{"scene"')) return null;
    try {
      const scene = JSON.parse(out.text).scene;
      return out.tables.some((t) => t.name === scene.frames) ? scene : null;
    } catch {
      return null;
    }
  }

  function resolved3d(table) {
    const cols = table.columns.filter((c) => !c.labels).map((c) => c.name);
    const values = valueColumns(table).map((c) => c.name);
    const pick = (want, fallback) => (want && cols.includes(want) ? want : fallback);
    return {
      x: pick(state.plot3d.x, values[0] ?? cols[0]),
      y: pick(state.plot3d.y, values[1] ?? cols[1] ?? cols[0]),
      z: pick(state.plot3d.z, values[2] ?? (table.x != null ? table.columns[table.x].name : cols[2] ?? cols[0])),
      // A solid's field points are coloured by the field (the fourth column) unless a colour is chosen.
      color: pick(state.plot3d.color, table.name === 'field points' ? (cols[3] ?? '') : ''),
    };
  }

  async function renderView() {
    const d = doc();
    if (!d || !graph) return;
    const view = state.view;
    graph.canvas.style.display = view === 'graph' ? '' : 'none';
    els.dashboard.hidden = view !== 'dashboard';
    els.dataView.hidden = view !== 'data';
    if (plot3d) plot3d.el.style.display = view === '3d' ? '' : 'none';
    if (view === 'graph') {
      graph.setState({
        model: d.model, selection: d.selection, results: d.results, stale: d.stale, running: state.runningNodes, settings: state.settings,
      });
    } else if (view === 'dashboard') renderDashboard(d);
    else if (view === 'data') renderDataView(d);
    else if (view === '3d') {
      if (!plot3d) {
        const { Plot3D } = await import('./plot3d.js');
        if (state.view !== '3d') return;
        plot3d ??= new Plot3D(els.viewport);
      }
      plot3d.el.style.display = '';
      plot3d.setOptions({ grid: state.settings.grid3d, axes: state.settings.axes3d });
      const node = focusNode() ?? d.model.nodes.find((n) => outputOf(n.id)?.tables.length);
      const out = node ? outputOf(node.id) : null;
      const table = out?.tables[0];
      if (!table) { plot3d.setData(null, null); return; }
      const scene = sceneOf(out);
      if (scene) {
        const fresh = plot3d.sceneKey;
        plot3d.setScene(scene, out.tables.find((x) => x.name === scene.frames), `${d.id}:${node.id}:${out.elapsedMs}:${state.settings.theme}:${state.settings.grid3d}`);
        // The playback chips need the scene's length.
        if (fresh !== plot3d.sceneKey) renderOverlay();
        return;
      }
      const r = resolved3d(table);
      const col = (name) => findColumn(table, name)?.values ?? new Float64Array(0);
      // A point cloud (a CAD part's surface) is drawn as points at true proportions.
      const cloud = /points/i.test(table.name);
      const mode = cloud ? 'points' : state.plot3d.mode;
      plot3d.setData({ x: col(r.x), y: col(r.y), z: col(r.z), names: [r.x, r.y, r.z], color: r.color ? col(r.color) : null, mode, equal: cloud, colormap: state.settings.colormap },
        `${d.id}:${node.id}:${out.elapsedMs}:${JSON.stringify(r)}:${mode}:${state.settings.colormap}:${state.settings.theme}`);
    }
  }

  /** The dashboard: a tile per chart and KPI node, in the order they sit on the canvas (rows, then columns). */
  function renderDashboard(d) {
    const lang = getLanguage();
    const tiles = d.model.nodes.filter((n) => n.type === 'out.plot' || n.type === 'out.kpi').sort((a, b) => (Math.round(a.y / 60) - Math.round(b.y / 60)) || a.x - b.x);
    const kpis = tiles.filter((n) => n.type === 'out.kpi');
    const charts = tiles.filter((n) => n.type === 'out.plot');
    if (!tiles.length) {
      replace(els.dashboard, h('div', { className: 'dash-empty', dataset: { testid: 'dash-empty' } },
        h('p', null, t('dashEmpty')),
        h('button', { type: 'button', className: 'primary', dataset: { testid: 'dash-add-charts' }, onClick: () => addChartsForLeaves() }, `📈 ${t('dashAddCharts')}`)));
      return;
    }
    const canvases = [];
    const kpiRow = kpis.length ? h('div', { className: 'kpi-row' }, ...kpis.map((n) => {
      const out = outputOf(n.id);
      const s = out?.scalars?.[0];
      const status = out?.scalars?.find((x) => x.name === 'status')?.value ?? 0;
      return h('button', { type: 'button', className: `kpi-tile${status > 0 ? ' alarm' : ''}${!out ? ' empty' : ''}${d.stale.has(n.id) ? ' stale' : ''}`, dataset: { testid: `kpi-${n.id}` }, title: out?.text || out?.error || n.name,
        onClick: () => select({ kind: 'node', ids: [n.id] }) },
      h('span', { className: 'kpi-label ellipsis' }, n.params.label || n.name),
      h('span', { className: 'kpi-value' }, s && Number.isFinite(s.value) ? formatValue(s.value, 5) : out?.ok === false ? '✕' : '—', s?.unit ? h('small', null, ` ${s.unit}`) : null),
      h('span', { className: 'kpi-foot ellipsis' }, out?.ok === false ? out.error : status > 0 ? t('kpiAlarm') : ''));
    })) : null;
    const grid = h('div', { className: 'dash-grid' }, ...charts.map((n) => {
      const out = sourceOutput(n);
      const canvas = h('canvas', { className: 'dash-canvas' });
      const readout = h('span', { className: 'chart-readout' });
      canvas.addEventListener('pointermove', (event) => { const v = chartValueAt(canvas, event.clientX, event.clientY); readout.textContent = v ? `x ${formatValue(v.x, 5)} · y ${formatValue(v.y, 5)}` : ''; });
      canvas.addEventListener('pointerleave', () => { readout.textContent = ''; });
      canvases.push([canvas, n, out]);
      const span = Math.max(1, Math.min(3, Number(n.params.span) || 1));
      const body = n.params.chart === 'table'
        ? h('div', { className: 'dash-table' }, tableElement(chartSpec(out, n.params, n.type).table, 200))
        : h('div', { className: 'dash-chart' }, canvas, readout, !out ? h('p', { className: 'panel-hint' }, t('dashNoData')) : null);
      return h('section', { className: `dash-tile${d.stale.has(n.id) ? ' stale' : ''}`, style: { gridColumn: `span ${span}` }, dataset: { testid: `dash-${n.id}` } },
        h('header', null, h('span', { className: 'menu-icon' }, '📈'), h('b', { className: 'ellipsis' }, n.params.title || n.name),
          h('span', { className: 'toolbar-spacer' }),
          h('button', { type: 'button', className: 'ghost', title: commandName('viewData', lang), onClick: () => { select({ kind: 'node', ids: [n.id] }); run('viewData'); } }, '⤢'),
          h('button', { type: 'button', className: 'ghost', title: commandName('viewGraph', lang), onClick: () => { select({ kind: 'node', ids: [n.id] }); run('viewGraph'); graph?.reveal(n.id); } }, '⛓')),
        body);
    }));
    replace(els.dashboard, h('div', { className: 'dash-head' }, h('h2', null, d.model.name || t('untitled')), d.model.description ? h('p', { className: 'muted' }, d.model.description) : null), kpiRow, grid);
    requestAnimationFrame(() => {
      for (const [canvas, n, out] of canvases) {
        if (!out) continue;
        const spec = chartSpec(out, { ...n.params, title: '' }, n.type);
        drawSpec(canvas, spec, state.settings);
      }
    });
  }

  /** A chart node shows its own (pass-through) output; before a run, nothing. */
  function sourceOutput(node) {
    return outputOf(node.id);
  }

  function renderDataView(d) {
    const lang = getLanguage();
    const node = focusNode();
    if (!node) {
      replace(els.dataView, h('div', { className: 'dash-empty' }, h('p', null, t('dataViewEmpty'))));
      return;
    }
    const out = outputOf(node.id);
    const spec = nodeSpec(node.type);
    if (!out) {
      replace(els.dataView, h('div', { className: 'dash-empty' }, h('p', null, `${spec?.icon ?? ''} ${node.name}`), h('p', null, t('dataNotRun')),
        h('button', { type: 'button', className: 'primary', onClick: () => run('runSelected') }, `${commandIcon('runSelected')} ${commandName('runSelected', lang)}`)));
      return;
    }
    const tableIndex = Math.min(state.tableIndex, Math.max(0, out.tables.length - 1));
    const table = out.tables[tableIndex];
    const canvas = h('canvas', { className: 'data-canvas', dataset: { testid: 'data-canvas' } });
    const readout = h('span', { className: 'chart-readout' });
    canvas.addEventListener('pointermove', (event) => { const v = chartValueAt(canvas, event.clientX, event.clientY); readout.textContent = v ? `x ${formatValue(v.x, 5)} · y ${formatValue(v.y, 5)}` : ''; });
    const params = node.type === 'out.plot' ? node.params : { table: table?.name };
    const gridOnly = !out.tables.length && out.grids.length;
    replace(els.dataView,
      h('div', { className: 'data-head' },
        h('b', null, `${spec?.icon ?? ''} ${node.name}`),
        out.tables.length > 1 ? h('select', { dataset: { testid: 'data-table-select' }, onChange: (event) => { state.tableIndex = Number(event.target.value); update(); } },
          ...out.tables.map((tb, i) => h('option', { value: i, selected: i === tableIndex }, `▤ ${tb.name} (${tb.rows})`))) : table ? h('span', { className: 'muted' }, `▤ ${table.name} (${table.rows})`) : null,
        out.grids.length ? h('span', { className: 'muted' }, `▦ ${out.grids.map((g) => g.name).join(', ')}`) : null,
        h('span', { className: 'toolbar-spacer' }),
        ...['exportCsv', 'exportJson', 'copyTable'].map((id) => h('button', { type: 'button', title: commandTip(id, lang), disabled: !isEnabled(id), onClick: () => run(id) }, `${commandIcon(id)} ${commandName(id, lang)}`))),
      out.ok ? null : h('p', { className: 'error-text' }, out.error),
      h('div', { className: 'data-body' },
        h('div', { className: 'data-chart' }, canvas, readout),
        h('div', { className: 'data-side' },
          out.scalars.length ? h('div', { className: 'data-scalars' }, resultTable(scalarRows(out))) : null,
          out.text ? h('pre', { className: 'result-text' }, out.text) : null,
          table && !gridOnly ? tableElement(table, 1000) : null)));
    requestAnimationFrame(() => drawSpec(canvas, chartSpec(out, gridOnly ? {} : params, node.type), state.settings));
  }

  // ───── result strip (bottom)
  function renderChart() {
    const lang = getLanguage();
    const folded = state.settings.bottomCollapsed;
    els.chart.style.display = state.settings.showChartPanel ? '' : 'none';
    els.chartSplitter.style.display = state.settings.showChartPanel && !folded ? '' : 'none';
    els.chart.classList.toggle('collapsed', folded);
    els.chart.style.height = folded ? '' : `${state.settings.chartHeight}px`;
    if (!state.settings.showChartPanel) return;
    const panelButtons = [
      h('button', { type: 'button', className: 'panel-collapse', title: folded ? t('panelExpand') : t('panelCollapse'), dataset: { testid: 'collapse-bottom' }, onClick: (e) => { e.stopPropagation(); patchSettings({ bottomCollapsed: !folded }); } }, folded ? '▴' : '▾'),
      h('button', { type: 'button', className: 'panel-collapse', title: t('panelHide'), dataset: { testid: 'hide-bottom' }, onClick: (e) => { e.stopPropagation(); patchSettings({ showChartPanel: false }); } }, '✕'),
    ];
    const node = focusNode();
    const out = node ? outputOf(node.id) : null;
    if (folded) {
      replace(els.chartHead,
        h('button', { type: 'button', className: 'chart-unfold', title: t('panelExpand'), dataset: { testid: 'unfold-bottom' }, onClick: () => patchSettings({ bottomCollapsed: false }) },
          h('span', { className: 'menu-icon' }, iconOf('chartPanel')), h('strong', null, t('chartTitle2'))),
        h('span', { className: 'toolbar-spacer' }), ...panelButtons);
      return;
    }
    const tableIndex = out ? Math.min(state.tableIndex, Math.max(0, out.tables.length - 1)) : 0;
    replace(els.chartHead,
      h('span', { className: 'menu-icon' }, iconOf('chartPanel')), h('strong', { className: 'chart-title ellipsis' }, node ? `${t('chartTitle2')} · ${node.name}` : t('chartTitle2')),
      ...[['chart', t('tabChart')], ['table', t('tabTable')], ['values', t('tabValues')], ['log', t('tabLog')]].map(([id, label]) => h('button', {
        type: 'button', className: state.chartTab === id ? 'chart-tab on' : 'chart-tab', dataset: { testid: `chart-tab-${id}` }, onClick: () => { state.chartTab = id; renderChart(); },
      }, label)),
      out?.tables.length > 1 && (state.chartTab === 'table' || state.chartTab === 'chart') ? h('select', { className: 'chart-select', dataset: { testid: 'chart-table-select' }, onChange: (event) => { state.tableIndex = Number(event.target.value); update(); } },
        ...out.tables.map((tb, i) => h('option', { value: i, selected: i === tableIndex }, tb.name))) : null,
      h('span', { className: 'toolbar-spacer' }),
      ...panelButtons);
    els.chartTable.hidden = true;
    els.chartCanvas.style.display = 'none';
    els.chartHint.style.display = 'none';
    const hint = (text) => { els.chartHint.textContent = text; els.chartHint.style.display = ''; };
    if (state.chartTab === 'log') {
      els.chartTable.hidden = false;
      replace(els.chartTable, logView());
      return;
    }
    if (!node) return hint(t('chartPickNode'));
    if (!out) return hint(t('chartNotRun'));
    if (state.chartTab === 'values') {
      els.chartTable.hidden = false;
      const rows = scalarRows(out);
      replace(els.chartTable, out.ok ? null : h('p', { className: 'error-text' }, out.error), rows.length ? resultTable(rows) : h('p', { className: 'panel-hint' }, t('noValues')), out.text ? h('pre', { className: 'result-text' }, out.text) : null);
      return;
    }
    if (state.chartTab === 'table') {
      els.chartTable.hidden = false;
      replace(els.chartTable, out.tables[tableIndex] ? tableElement(out.tables[tableIndex], 500) : h('p', { className: 'panel-hint' }, t('noTable')));
      return;
    }
    if (!out.ok) return hint(out.error);
    els.chartCanvas.style.display = '';
    const params = node.type === 'out.plot' ? node.params : { table: out.tables[tableIndex]?.name };
    const spec = chartSpec(out, params, node.type);
    if (spec.kind === 'table') {
      els.chartCanvas.style.display = 'none';
      els.chartTable.hidden = false;
      replace(els.chartTable, tableElement(spec.table, 500));
      return;
    }
    requestAnimationFrame(() => {
      if (!drawSpec(els.chartCanvas, spec, state.settings)) hint(out.scalars.length ? t('onlyValues') : t('chartEmpty'));
    });
  }

  function logView() {
    const d = doc();
    if (!d?.results) return h('p', { className: 'panel-hint' }, t('logEmpty'));
    const rows = [];
    const order = executionOrder(d.model) ?? d.model.nodes.map((n) => n.id);
    for (const id of order) {
      const node = d.model.nodes.find((n) => n.id === id);
      const out = d.results.get(id);
      if (!node || !out) continue;
      const mark = out.ok ? (out.warnings.length ? '⚠' : '✓') : out.skipped ? '–' : '✕';
      rows.push(h('tr', { className: out.ok ? null : 'log-error', onClick: () => select({ kind: 'node', ids: [id] }) },
        h('td', null, mark), h('td', null, node.name), h('td', { className: 'num' }, out.elapsedMs > 0 ? `${formatValue(out.elapsedMs, 3)} ms` : ''),
        h('td', null, out.ok ? [outputSummary(out), ...out.warnings.map((w) => ` ⚠ ${w}`)].join('') : out.error)));
    }
    return h('table', { className: 'data-table log-table', dataset: { testid: 'run-log' } }, h('tbody', null, ...rows));
  }

  // ───── status bar
  function renderStatus() {
    const d = doc();
    const c = state.cursor;
    const python = state.python === undefined ? '' : state.python ? `🐍 ${state.python}` : `🐍 ${t('pythonNone')}`;
    replace(els.status,
      h('span', { dataset: { testid: 'status-text' } }, t(state.status) === state.status ? state.status : t(state.status)),
      d ? h('span', { dataset: { testid: 'status-nodes' } }, `${t('nodes')}: ${d.model.nodes.length}`) : null,
      d ? h('span', { dataset: { testid: 'status-selection' } }, `${t('selection')}: ${d.selection?.ids?.length ?? 0}`) : null,
      h('span', { dataset: { testid: 'status-cursor' } }, c && state.view === 'graph' ? `${t('cursor')}: ${Math.round(c.x)}, ${Math.round(c.y)}` : `${t('cursor')}: —`),
      h('span', { dataset: { testid: 'status-engine' } }, `${t('engine')}: ${engineKind === 'native' ? t('engineNative') : t('engineWasm')}`),
      native.isTauri && python ? h('span', { dataset: { testid: 'status-python' } }, python) : null,
      d ? h('span', { dataset: { testid: 'status-dirty' } }, d.dirty ? t('modified') : t('saved')) : null,
      d ? h('span', { dataset: { testid: 'status-doc' }, style: { marginLeft: 'auto', paddingRight: native.isTauri ? '28px' : '10px' } }, d.path ?? d.model.name) : null,
      native.isTauri ? h('span', { className: 'size-grip', dataset: { testid: 'size-grip' }, title: t('resizeWindow'), onPointerdown: (event) => { event.preventDefault(); native.startResize(); } }) : null);
  }

  // ───── graph callbacks
  const graphCallbacks = {
    onSelect: (selection, additive) => select(selection, additive),
    onCursor: (cursor) => { state.cursor = cursor; renderStatusSoon(); },
    onZoom: () => renderToolbar(),
    onContext: (kind, x, y, wx, wy) => { state.addAt = kind === 'canvas' ? { x: wx - NODE_W / 2, y: wy - 20 } : null; openContextMenu(kind, x, y); },
    onOpenNode: (id) => { select({ kind: 'node', ids: [id] }); run('viewData'); },
    onAddAt: (x, y, cx, cy) => { state.addAt = { x, y }; dialogs.showNodeLibrary(api, { x: cx, y: cy }); },
    onDropNode: (type, x, y) => addNode(type, { x, y, link: false }),
    onMoveNodes: (ids, dx, dy) => updateModel((m) => ({ ...m, nodes: m.nodes.map((n) => (ids.includes(n.id) ? { ...n, x: Math.round(n.x + dx), y: Math.round(n.y + dy) } : n)) }), true, { stale: new Set() }),
    onConnect: (from, to, port, replaced) => {
      const d = doc();
      let model = d.model;
      if (replaced) model = { ...model, links: model.links.filter((l) => l.id !== replaced) };
      const next = connect(model, from, to, port);
      if (!next) {
        state.status = t('linkLoop');
        renderStatus();
        return;
      }
      updateModel(() => next);
    },
    onDisconnect: (linkId) => updateModel((m) => ({ ...m, links: m.links.filter((l) => l.id !== linkId) })),
    onLinkToEmpty: (from, x, y, cx, cy) => { state.addAt = { x, y: y - 20, from }; dialogs.showNodeLibrary(api, { x: cx, y: cy }); },
    footer: (node, out) => {
      const d = doc();
      if (state.runningNodes.has(node.id)) return t('statusRunning');
      if (!out) return d?.results ? t('notRun') : '';
      if (!out.ok) return out.error ?? '';
      return outputSummary(out) + (d?.stale.has(node.id) ? ` · ${t('staleShort')}` : '');
    },
    emptyHint: () => [t('graphEmpty1'), t('graphEmpty2')],
  };

  let statusTimer = 0;
  function renderStatusSoon() {
    if (statusTimer) return;
    statusTimer = requestAnimationFrame(() => { statusTimer = 0; renderStatus(); });
  }

  // ───────────────────────── node editing
  /** Adds a node of `type`: at a given place, else right of the selected node (and linked from it), else in view. */
  function addNode(type, { x = null, y = null, link = true } = {}) {
    const d = doc();
    if (!d || !nodeSpec(type)) return null;
    const lang = getLanguage();
    const sel = selectedNodes();
    const from = state.addAt?.from ? d.model.nodes.find((n) => n.id === state.addAt.from) : link && sel.length === 1 ? sel[0] : null;
    let at;
    if (x != null) at = { x, y };
    else if (state.addAt) at = { x: state.addAt.x, y: state.addAt.y };
    else if (from) at = { x: from.x + NODE_W + 60, y: from.y };
    else {
      const c = graph?.center() ?? { x: 200, y: 160 };
      at = { x: c.x - NODE_W / 2, y: c.y - 40 };
    }
    state.addAt = null;
    // Do not land exactly on another node.
    for (let k = 0; k < 20 && d.model.nodes.some((n) => Math.abs(n.x - at.x) < 30 && Math.abs(n.y - at.y) < 30); k++) at = { x: at.x + 24, y: at.y + 24 };
    const node = createNode(d.model, type, at.x, at.y, lang);
    let model = { ...d.model, nodes: [...d.model.nodes, node] };
    const spec = nodeSpec(type);
    if (from && spec.inputs.length && from.id !== node.id) model = connect(model, from.id, node.id, spec.inputs[0].port) ?? model;
    updateModel(() => model);
    doc().selection = { kind: 'node', ids: [node.id] };
    if (state.view !== 'graph') state.view = 'graph';
    showStart(false);
    state.status = t('nodeAdded', { name: node.name });
    update({ props: true });
    return node.id;
  }

  function deleteSelection() {
    const d = doc();
    const sel = d?.selection;
    if (!sel) return;
    if (sel.kind === 'node') {
      updateModel((m) => ({ ...m, nodes: m.nodes.filter((n) => !sel.ids.includes(n.id)), links: m.links.filter((l) => !sel.ids.includes(l.from) && !sel.ids.includes(l.to)) }));
      for (const id of sel.ids) d.results?.delete(id);
    } else if (sel.kind === 'link') updateModel((m) => ({ ...m, links: m.links.filter((l) => !sel.ids.includes(l.id)) }));
    d.selection = null;
    update({ props: true });
  }

  /** Copies nodes (and the links among them) with new ids, shifted by (dx, dy). */
  function pasteNodes(clip, dx = 40, dy = 40) {
    if (!clip?.nodes.length) return;
    const d = doc();
    const ids = new Map();
    const taken = d.model.nodes.map((n) => n.id);
    const names = new Set(d.model.nodes.map((n) => n.name));
    const nodes = clip.nodes.map((n) => {
      const id = newId('n', [...taken, ...ids.values()]);
      ids.set(n.id, id);
      let name = n.name;
      for (let k = 2; names.has(name); k++) name = `${n.name} (${k})`;
      names.add(name);
      return { ...structuredClone(n), id, name, x: n.x + dx, y: n.y + dy };
    });
    const linkIds = d.model.links.map((l) => l.id);
    const links = clip.links.filter((l) => ids.has(l.from) && ids.has(l.to)).map((l) => {
      const id = newId('l', linkIds);
      linkIds.push(id);
      return { ...l, id, from: ids.get(l.from), to: ids.get(l.to) };
    });
    updateModel((m) => ({ ...m, nodes: [...m.nodes, ...nodes], links: [...m.links, ...links] }));
    doc().selection = { kind: 'node', ids: nodes.map((n) => n.id) };
    update({ props: true });
  }

  const clipOfSelection = () => {
    const d = doc();
    const nodes = selectedNodes();
    const ids = new Set(nodes.map((n) => n.id));
    return { nodes: structuredClone(nodes), links: d.model.links.filter((l) => ids.has(l.from) && ids.has(l.to)) };
  };

  /** A chart node after every node that has no outgoing link and is not an output itself. */
  function addChartsForLeaves() {
    const d = doc();
    const lang = getLanguage();
    const leaves = d.model.nodes.filter((n) => !n.type.startsWith('out.') && !d.model.links.some((l) => l.from === n.id));
    if (!leaves.length) return;
    let model = d.model;
    for (const leaf of leaves) {
      const node = createNode(model, 'out.plot', leaf.x + NODE_W + 60, leaf.y, lang);
      node.params.title = leaf.name;
      model = connect({ ...model, nodes: [...model.nodes, node] }, leaf.id, node.id, 'in') ?? model;
    }
    updateModel(() => model);
    state.status = t('chartsAdded', { n: leaves.length });
    update();
  }

  // ───────────────────────── commands
  function hasResult(id) {
    return Boolean(outputOf(id));
  }

  function isEnabled(id) {
    const d = doc();
    if (!d) return ['new', 'open', 'newFromSample', 'settings', 'about', 'usage'].includes(id);
    if (id.startsWith('add:')) return true;
    const sel = selectedNodes();
    const node = focusNode();
    switch (id) {
      case 'undo': return d.past.length > 0;
      case 'redo': return d.future.length > 0;
      case 'run': case 'validate': return !state.running && d.model.nodes.length > 0;
      case 'runSelected': return !state.running && sel.length > 0;
      case 'stop': return state.running;
      case 'copy': case 'duplicate': case 'toggleDisable': case 'disconnect': return sel.length > 0;
      case 'rename': case 'nodeHelp': case 'addToDashboard': return sel.length === 1;
      case 'delete': return Boolean(d.selection);
      case 'paste': return Boolean(state.clipboard?.nodes.length);
      case 'selectAll': case 'autoLayout': case 'fit': return d.model.nodes.length > 0;
      case 'exportCsv': case 'exportJson': return Boolean(node && outputOf(node.id)?.ok);
      case 'copyTable': return Boolean(node && outputOf(node.id)?.tables.length);
      case 'exportAllCsv': case 'clearResults': case 'exportReport': return Boolean(d.results);
      case 'closeOthers': return state.docs.length > 1;
      case 'exportChart': return state.settings.showChartPanel;
      case 'viewData': return Boolean(node) || state.view === 'data';
      default: return true;
    }
  }

  function isChecked(id) {
    if (VIEWS[id]) return state.view === VIEWS[id];
    switch (id) {
      case 'home': return Boolean(state.startVisible);
      case 'run': return state.running;
      case 'showGrid': return state.settings.showGrid;
      case 'showRulers': return state.settings.showRulers;
      case 'chartGrid': return state.settings.chartGrid;
      case 'grid3d': return state.settings.grid3d;
      case 'axes3d': return state.settings.axes3d;
      case 'snap': return state.settings.snap;
      case 'showPreviews': return state.settings.showPreviews;
      case 'autoRun': return state.settings.autoRun;
      case 'toolPanel': return state.settings.showToolPanel;
      case 'propertyPanel': return state.settings.showPropertyPanel;
      case 'chartPanel': return state.settings.showChartPanel;
      case 'toggleDisable': return selectedNodes().length > 0 && selectedNodes().every((n) => n.disabled);
      default: return false;
    }
  }

  async function run(id) {
    const d = doc();
    const lang = getLanguage();
    if (state.startVisible && !START_KEEPS.has(id)) showStart(false);
    if (id.startsWith('add:')) {
      addNode(id.slice(4));
      return;
    }
    if (VIEWS[id]) {
      state.view = VIEWS[id];
      if (state.view === '3d' && plot3d) plot3d.key = null;
      update();
      return;
    }
    switch (id) {
      case 'new': addDoc(emptyModel(lang)); showStart(false); update({ props: true }); break;
      case 'home': showStart(!state.startVisible); update(); break;
      case 'tutorial': startTutorial(); break;
      case 'tutorialDoc': native.openGuide(lang, 'Tutorial', `${commandName('tutorialDoc', lang)} — MySimulator`).catch((error) => dialogs.showError(String(error))); break;
      case 'newFromSample': dialogs.showSamples(api); break;
      case 'open': await openFile(); break;
      case 'importData': await importData(); break;
      case 'save': if (d) await saveDoc(d); break;
      case 'saveAs': if (d) await saveDoc(d, true); break;
      case 'closeTab': if (d) closeDoc(d.id); break;
      case 'quit': requestQuit(); break;
      case 'exportCsv': await exportNodeCsv(); break;
      case 'exportJson': { const n = focusNode(); const out = n && outputOf(n.id); if (out) await saveText(downloadName(`${d.model.name}-${n.name}`, 'json'), outputJson(out), 'jsonFiles', 'json'); break; }
      case 'exportAllCsv': await exportAll(); break;
      case 'exportPng': await exportPng(); break;
      case 'exportReport': dialogs.showReport(api); break;
      case 'print': printReport(); break;
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'copy': state.clipboard = clipOfSelection(); update(); break;
      case 'paste': pasteNodes(state.clipboard); break;
      case 'duplicate': pasteNodes(clipOfSelection()); break;
      case 'delete': deleteSelection(); break;
      case 'selectAll': if (d) select({ kind: 'node', ids: d.model.nodes.map((n) => n.id) }); break;
      case 'toggleDisable': {
        const ids = selectedNodes().map((n) => n.id);
        const off = !selectedNodes().every((n) => n.disabled);
        if (ids.length) updateModel((m) => ({ ...m, nodes: m.nodes.map((n) => (ids.includes(n.id) ? { ...n, disabled: off } : n)) }));
        renderRight(true);
        break;
      }
      case 'disconnect': {
        const ids = selectedNodes().map((n) => n.id);
        updateModel((m) => ({ ...m, links: m.links.filter((l) => !ids.includes(l.from) && !ids.includes(l.to)) }));
        break;
      }
      case 'rename': {
        const node = selectedNodes()[0];
        if (!node) break;
        if (state.settings.showPropertyPanel && !state.settings.rightCollapsed) {
          requestAnimationFrame(() => { const el = els.right.querySelector('[data-testid=prop-name]'); el?.focus(); el?.select(); });
        } else dialogs.prompt(api, commandName('rename', lang), node.name, (name) => patchNode(node.id, { name }));
        break;
      }
      case 'autoLayout': if (d) { updateModel((m) => autoLayout(m), true, { stale: new Set() }); requestAnimationFrame(() => graph?.fit()); } break;
      case 'pipelineSettings': dialogs.showPipelineSettings(api); break;
      case 'fit': if (state.view === '3d') plot3d?.fit(); else graph?.fit(); renderToolbar(); break;
      case 'zoomReset': if (state.view === '3d') plot3d?.fit(); else graph?.resetView(); renderToolbar(); break;
      case 'zoomIn': if (state.view === '3d') plot3d?.zoomBy(1.25); else graph?.zoomAt(1.25); renderToolbar(); break;
      case 'zoomOut': if (state.view === '3d') plot3d?.zoomBy(0.8); else graph?.zoomAt(0.8); renderToolbar(); break;
      case 'showGrid': patchSettings({ showGrid: !state.settings.showGrid }); break;
      case 'showRulers': patchSettings({ showRulers: !state.settings.showRulers }); break;
      case 'chartGrid': patchSettings({ chartGrid: !state.settings.chartGrid }); break;
      case 'grid3d': patchSettings({ grid3d: !state.settings.grid3d }); break;
      case 'axes3d': patchSettings({ axes3d: !state.settings.axes3d }); break;
      case 'snap': patchSettings({ snap: !state.settings.snap }); break;
      case 'showPreviews': patchSettings({ showPreviews: !state.settings.showPreviews }); break;
      case 'toolPanel': patchSettings({ showToolPanel: !state.settings.showToolPanel }); break;
      case 'propertyPanel': patchSettings({ showPropertyPanel: !state.settings.showPropertyPanel }); break;
      case 'chartPanel': patchSettings({ showChartPanel: !state.settings.showChartPanel, bottomCollapsed: false }); break;
      case 'fullscreen': native.toggleFullscreen(); break;
      case 'nodeLibrary': dialogs.showNodeLibrary(api); break;
      case 'run': await runPipeline(); break;
      case 'runSelected': await runPipeline(selectedNodes().map((n) => n.id)); break;
      case 'stop': cancelStudy(); break;
      case 'validate': dialogs.showValidation(issuesOf(d.model)); break;
      case 'autoRun': patchSettings({ autoRun: !state.settings.autoRun }); break;
      case 'clearResults': if (d) { d.results = null; d.runInfo = null; d.stale = new Set(); update({ props: true }); } break;
      case 'expressionHelp': dialogs.showExpressionHelp(api); break;
      case 'pythonInfo': dialogs.showPythonInfo(api); break;
      case 'batchHelp': dialogs.showBatchHelp(api); break;
      case 'settings': dialogs.showSettings(api); break;
      case 'about': dialogs.showAbout(api); break;
      case 'shortcuts': dialogs.showShortcuts(api); break;
      case 'usage': native.openGuide(lang, 'UsersGuide', `${commandName('usage', lang)} — MySimulator`).catch((error) => dialogs.showError(String(error))); break;
      case 'clearRecent': patchSettings({ recentFiles: [] }); break;
      case 'nodeHelp': { const n = selectedNodes()[0]; if (n) dialogs.showNodeHelp(api, n.type); break; }
      case 'addToDashboard': {
        const n = selectedNodes()[0];
        if (!n) break;
        const id2 = addNode('out.plot');
        if (id2) patchNode(id2, { params: { title: n.name } });
        break;
      }
      case 'copyTable': {
        const n = focusNode();
        const out = n && outputOf(n.id);
        const tb = out?.tables[Math.min(state.tableIndex, out.tables.length - 1)];
        if (tb) { await navigator.clipboard?.writeText(tableTsv(tb)).catch(() => {}); state.status = t('tableCopied', { rows: tb.rows }); renderStatus(); }
        break;
      }
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
      case 'exportChart': els.chartCanvas.toBlob((blob) => blob && saveBlob(downloadName(`${d?.model.name ?? 'chart'}-chart`, 'png'), blob, 'pngFiles', 'png'), 'image/png'); break;
      default: break;
    }
  }

  function issuesOf(model) {
    return checkModel(model).map((issue) => ({ ...issue, text: t(issue.key, issue.args) }));
  }

  // ───────────────────────── running
  /** Runs the pipeline, or (ids) only those nodes and what they depend on; results merge into the document's. */
  async function runPipeline(ids = null) {
    const d = doc();
    if (!d || state.running || !d.model.nodes.length) return;
    let model = d.model;
    if (ids?.length) {
      const keep = new Set(ids);
      for (const id of ids) for (const up of upstream(d.model, id)) keep.add(up);
      // A sweep reaches into the nodes it varies and measures.
      for (const id of [...keep]) {
        const n = d.model.nodes.find((x) => x.id === id);
        if (n?.type === 'opt.sweep') for (const key of ['node', 'node2', 'metricNode']) if (n.params[key]) { keep.add(n.params[key]); for (const up of upstream(d.model, n.params[key])) keep.add(up); }
      }
      model = { ...d.model, nodes: d.model.nodes.filter((n) => keep.has(n.id)), links: d.model.links.filter((l) => keep.has(l.from) && keep.has(l.to)) };
    }
    const issues = issuesOf(model).filter((issue) => issue.level === 'error');
    if (issues.length) {
      dialogs.showValidation(issuesOf(model));
      state.status = 'validateFirst';
      update();
      return;
    }
    // Programs on the computer run only after the user agreed for this document.
    const external = externalNodes(model);
    if (external.length && native.isTauri && !d.trustExternal) {
      const ok = await dialogs.confirmExternal(api, external);
      if (!ok) return;
      d.trustExternal = true;
    }
    state.running = true;
    state.runningNodes = new Set(model.nodes.map((n) => n.id));
    state.progress = { fraction: 0, phase: 'start', message: '' };
    state.status = 'statusRunning';
    update();
    const ranModel = d.model;
    const started = performance.now();
    let lastPaint = 0;
    try {
      const baseDir = d.path ? d.path.replace(/[\\/][^\\/]*$/, '') : null;
      const result = await runStudy(engineModel(model), (progress) => {
        state.progress = progress;
        const now = performance.now();
        if (now - lastPaint > 100) {
          lastPaint = now;
          renderOverlay();
        }
      }, baseDir);
      const elapsedMs = result.header.elapsedMs || performance.now() - started;
      if (!d.results || !ids) d.results = new Map();
      for (const [id, out] of result.nodes) d.results.set(id, out);
      for (const id of result.nodes.keys()) d.stale.delete(id);
      if (!ids) d.stale = new Set();
      // Changes made while the run went on make their nodes stale again.
      if (d.model !== ranModel) markStale(d, changedNodes(ranModel, d.model));
      d.runInfo = { elapsedMs, at: Date.now() };
      const failed = [...result.nodes.values()].filter((o) => !o.ok && !o.skipped);
      state.status = failed.length ? `${t('statusDoneErrors', { n: failed.length })} · ${formatValue(elapsedMs / 1000, 3)} s` : `${t('statusDone')} · ${formatValue(elapsedMs / 1000, 3)} s`;
      if (!focusNode() && state.view === 'data') state.view = 'graph';
    } catch (error) {
      if (error.message === 'cancelled') state.status = 'statusCancelled';
      else {
        state.status = 'statusFailed';
        dialogs.showError(`${t('statusFailed')}: ${error.message}`);
      }
    } finally {
      state.running = false;
      state.runningNodes = new Set();
      state.progress = null;
      update({ props: true });
    }
  }

  // ───────────────────────── files
  const modelFilters = () => [{ name: t('modelFiles'), extensions: [EXTENSION, 'json'] }];

  function openModel(model, path, { keepPristine = false } = {}) {
    const d = doc();
    if (!keepPristine && d && !d.dirty && !d.path && !d.model.nodes.length && !d.results && state.docs.length === 1) state.docs = [];
    const added = addDoc(model, path);
    showStart(false);
    if (path) patchSettings(addRecent(state.settings, path));
    state.view = 'graph';
    update({ props: true });
    requestAnimationFrame(() => graph?.fit());
    return added;
  }

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
      const file = await native.openDataFile([...modelFilters(), { name: t('dataFiles'), extensions: DATA_EXTENSIONS }, { name: t('netlistFiles'), extensions: NETLIST_EXTENSIONS }]);
      if (!file) return;
      if (file.base64 != null) importBinary(file.name, file.base64);
      else openText(file.name, file.text, native.isTauri ? file.path : null);
    } catch (error) {
      dialogs.showError(t('fileOpenFailed'), String(error?.message ?? error));
    }
  }

  /** A .mysim pipeline opens as a document; CSV/TSV/TXT and plain JSON data become a data table node. */
  function openText(name, text, path) {
    if (/\.(csv|tsv|txt)$/i.test(name)) return importTable(name, text);
    if (NETLIST_RE.test(name)) return importNetlist(name, text);
    if (/\.myheat$/i.test(name)) return importHeat(name, text);
    if (/\.json$/i.test(name)) {
      try {
        const raw = JSON.parse(text);
        if (!Array.isArray(raw?.nodes)) return importTable(name, jsonToCsv(text));
      } catch { /* not JSON: parseModel reports it */ }
    }
    openModel(parseModel(text), path);
    return null;
  }

  function importTable(name, text) {
    if (state.startVisible) showStart(false);
    const id = addNode('source.table', { link: false });
    if (!id) return;
    patchNode(id, { name: name.replace(/\.[^.]+$/, ''), params: { data: text, tableName: name.replace(/\.[^.]+$/, '') } });
    state.status = t('imported', { name });
    update({ props: true });
  }

  /** A binary data file (STL, WAV, XLSX, MAT, PNG) becomes a File data node that keeps it. */
  function importBinary(name, base64) {
    if (state.startVisible) showStart(false);
    const id = addNode('source.file', { link: false });
    if (!id) return;
    patchNode(id, { name: name.replace(/\.[^.]+$/, ''), params: { fileName: name, content: base64 } });
    state.status = t('imported', { name });
    update({ props: true });
  }

  /** A MyHeatManager model becomes a heat study node that keeps it (the engine is built in). */
  function importHeat(name, text) {
    if (state.startVisible) showStart(false);
    const id = addNode('io.myheat', { link: false });
    if (!id) return;
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const base64 = btoa(binary);
    patchNode(id, { name: name.replace(/\.[^.]+$/, ''), params: { fileName: name, content: base64 } });
    state.status = t('imported', { name });
    update({ props: true });
  }

  /** A SPICE netlist (or a MyCircuit project, through MyCircuit's own exporter) becomes a circuit node. */
  async function importNetlist(name, text) {
    if (state.startVisible) showStart(false);
    let params = { netlist: text };
    if (/\.mycircuit$/i.test(name)) {
      try {
        const { myCircuitToSpice } = await import('../core/mycircuit.js');
        const spice = myCircuitToSpice(text);
        params = { netlist: spice.netlist, probes: spice.probes };
      } catch (error) {
        dialogs.showError(t('fileOpenFailed'), String(error?.message ?? error));
        return;
      }
    }
    const id = addNode('circuit.spice', { link: false });
    if (!id) return;
    patchNode(id, { name: name.replace(/\.[^.]+$/, ''), params });
    state.status = t('imported', { name });
    update({ props: true });
  }

  async function importData() {
    try {
      const file = await native.openDataFile([{ name: t('dataFiles'), extensions: DATA_EXTENSIONS }, { name: t('netlistFiles'), extensions: NETLIST_EXTENSIONS }]);
      if (!file) return;
      if (file.base64 != null) importBinary(file.name, file.base64);
      else if (NETLIST_RE.test(file.name)) importNetlist(file.name, file.text);
      else if (/\.myheat$/i.test(file.name)) importHeat(file.name, file.text);
      else importTable(file.name, /\.json$/i.test(file.name) ? jsonToCsv(file.text) : file.text);
    } catch (error) {
      dialogs.showError(t('fileOpenFailed'), String(error?.message ?? error));
    }
  }

  async function openPath(path) {
    try {
      const file = await native.readDataFile(path);
      if (file.base64 != null) importBinary(file.name, file.base64);
      else openText(file.name, file.text, path);
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
      const saved = await native.saveTextFile(name, text, [{ name: t(filterKey), extensions: [extension] }]);
      if (saved) { state.status = t('savedTo', { name: saved }); renderStatus(); }
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

  async function exportNodeCsv() {
    const d = doc();
    const n = focusNode();
    const out = n && outputOf(n.id);
    if (!out) return;
    const table = out.tables[Math.min(state.tableIndex, out.tables.length - 1)];
    const text = table ? tableCsv(table) : out.grids.length ? gridCsv(out.grids[0]) : scalarsCsv(out);
    await saveText(downloadName(`${d.model.name}-${n.name}${table && out.tables.length > 1 ? `-${table.name}` : ''}`, 'csv'), text, 'csvFiles', 'csv');
  }

  /** Every node's tables, grids and values in one CSV, sections headed by "# node / table". */
  async function exportAll() {
    const d = doc();
    if (!d?.results) return;
    const parts = [];
    for (const n of d.model.nodes) {
      const out = d.results.get(n.id);
      if (!out?.ok) continue;
      if (out.scalars.length) parts.push(`# ${n.name} / values\n${scalarsCsv(out)}`);
      for (const tb of out.tables) parts.push(`# ${n.name} / ${tb.name}\n${tableCsv(tb)}`);
      for (const g of out.grids) parts.push(`# ${n.name} / ${g.name}\n${gridCsv(g)}`);
    }
    await saveText(downloadName(`${d.model.name}-results`, 'csv'), parts.join('\n'), 'csvFiles', 'csv');
  }

  async function exportPng() {
    const d = doc();
    let blob = null;
    if (state.view === '3d' && plot3d) blob = await plot3d.toBlob();
    else if (state.view === 'graph') blob = await graph.toBlob();
    else {
      const canvas = (state.view === 'data' ? els.dataView : els.dashboard).querySelector('canvas');
      if (canvas) blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    }
    if (blob) await saveBlob(downloadName(d?.model.name, 'png'), blob, 'pngFiles', 'png');
  }

  async function saveReport() {
    const d = doc();
    await saveText(downloadName(`${d.model.name}-report`, 'html'), dialogs.standaloneReport(api, d), 'htmlFiles', 'html');
  }

  function printSources() {
    const d = doc();
    if (!d) return null;
    let image = null;
    try {
      if (state.view === '3d' && plot3d) { plot3d.render(); image = plot3d.renderer.domElement.toDataURL('image/png'); }
      else if (state.view === 'graph') image = graph.canvas.toDataURL('image/png');
      else image = (state.view === 'data' ? els.dataView : els.dashboard).querySelector('canvas')?.toDataURL('image/png') ?? null;
    } catch { image = null; }
    let chart = null;
    try { if (state.settings.showChartPanel && els.chartCanvas.width > 10 && els.chartCanvas.style.display !== 'none' && focusNode()) chart = els.chartCanvas.toDataURL('image/png'); } catch { chart = null; }
    return { doc: d, image, chart, legend: null };
  }

  function printReport() {
    if (!doc()) return;
    showPrint(api, printSources);
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

  // ───────────────────────── update
  function update(parts = {}) {
    const d = doc();
    if (!els.toolbar) return;
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
    if (d) native.setWindowTitle(`${d.model.name || t('untitled')}${d.dirty ? ' *' : ''} — MySimulator v${__APP_VERSION__}`);
  }

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
      if (doc()?.selection && !typing) select(null);
      return;
    }
    if (typing && !ctrl && !key.startsWith('F')) return;
    const entry = Object.entries(SHORTCUTS).find(([, keys]) => keys === combo || (keys === 'Delete' && (key === 'Delete' || key === 'Backspace') && !typing) || (keys === '+' && (key === '+' || key === '=')) || (keys === '-' && key === '-' && !ctrl));
    if (entry && !(typing && ['Ctrl+C', 'Ctrl+V', 'Ctrl+A', 'Ctrl+Z', 'Ctrl+Y'].includes(combo))) {
      event.preventDefault();
      run(entry[0]);
    }
  });

  appEl.addEventListener('contextmenu', onContextMenu);

  appEl.addEventListener('dragover', (event) => {
    if ([...(event.dataTransfer?.types ?? [])].includes('Files')) {
      event.preventDefault();
      appEl.classList.add('dropping');
    }
  });
  appEl.addEventListener('dragleave', (event) => {
    if (event.target === appEl || !appEl.contains(event.relatedTarget)) appEl.classList.remove('dropping');
  });
  appEl.addEventListener('drop', async (event) => {
    if (![...(event.dataTransfer?.types ?? [])].includes('Files')) return;
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
    if (state.view === 'dashboard') renderView();
    if (minWidth && window.innerWidth < minWidth - 1) native.setMinWidth(minWidth);
  });

  // ───────────────────────── API for the dialogs, the start page, the tutorial and the tests
  const api = {
    state,
    get fonts() { return state.fonts; },
    get isTauri() { return native.isTauri; },
    query: (selector) => [document, ...popoutDocuments()].map((d) => d.querySelector(selector)).find(Boolean) ?? null,
    popoutLabels: () => popoutDocuments().map((d) => d.defaultView?.location.hash.slice(1)),
    doc,
    appInfo: native.appInfo,
    patchSettings,
    updateModel,
    patchNode,
    openModel,
    saveText,
    saveBlob,
    saveReport,
    printReport,
    run,
    addNode,
    outputOf,
    openPath,
    newModel: () => openModel(emptyModel(getLanguage()), null),
    startTutorial,
    showStart,
    startVisible: () => Boolean(startPage?.visible),
    refreshStart: () => startPage?.render(),
    refreshToolbar: () => renderToolbar(),
    openText: (name, text) => openText(name, text, null),
    importBinary,
    importNetlist,
    importHeat,
    openMenuById: (id) => { const menu = MENUS.find((m) => m.id === id); const anchor = els.menubar.querySelector(`[data-testid=menu-${id}]`); if (menu && anchor) openMenu(menu, anchor); },
    closeMenu,
    activate,
    closeDocForce,
    select: (selection) => select(selection),
    setView: (view) => { state.view = view; update(); },
    setStatus: (status) => { state.status = status; renderStatus(); },
    setChartTab: (tab) => { state.chartTab = tab; renderChart(); },
    tutorial: () => tutorial,
    graph: () => graph,
    openContextAt: (kind, x, y) => openContextMenu(kind, x, y),
    runPipeline,
    isEnabled,
    pythonInfo: () => state.python,
    nodeSpecs: NODES,
    categories: CATEGORIES,
    addChartsForLeaves,
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
  if (native.isTauri) native.pythonInfo().then((python) => { state.python = python; renderStatus(); });
  window.__mysim = { state, run, api, doc, query: api.query, closeMenu, get tutorial() { return tutorial; }, get graph() { return graph; }, get plot3d() { return plot3d; } };
  return api;
}

/** JSON data (an object of arrays, or an array of row objects) as CSV text. */
export function jsonToCsv(text) {
  const raw = JSON.parse(text);
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  if (Array.isArray(raw)) {
    const keys = [...new Set(raw.flatMap((r) => (r && typeof r === 'object' ? Object.keys(r) : [])))];
    return [keys.map(cell).join(','), ...raw.map((r) => keys.map((k) => cell(r?.[k])).join(','))].join('\n');
  }
  if (raw && typeof raw === 'object') {
    const keys = Object.keys(raw).filter((k) => Array.isArray(raw[k]));
    const n = Math.max(0, ...keys.map((k) => raw[k].length));
    const rows = [keys.map(cell).join(',')];
    for (let i = 0; i < n; i++) rows.push(keys.map((k) => cell(raw[k][i])).join(','));
    return rows.join('\n');
  }
  throw new Error('the JSON must be an object of arrays or an array of objects');
}

export { parseNumber };
