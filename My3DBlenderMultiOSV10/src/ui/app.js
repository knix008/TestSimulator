// The application: the document and its history, the top bar, workspaces, the area tree, the status bar, keys.
import { decodeImages, encodeImageData, setRenderThreads } from './render.js';
import { activeObject, createDefaultScene, deserialize, evaluatedMesh, sceneStats, serialize, setFrame } from '../core/doc.js';
import { coverage, FEATURES } from '../core/features.js';
import { History } from '../core/history.js';
import { adjustLast, allOps, canRun, getOp, run, touch } from '../core/ops.js';
import { THEMES, resolveTheme, themeVars, themesByMode } from '../core/themes.js';
import { appInfo, isTauri, onCloseRequested, onMaximizedChange, quit, setLanguageNative, setMinWidth, setWindowTheme, setWindowTitle, startupFiles, windowAction, windowReady, openExternal, startResize, invoke, readFont, listFonts, getUiZoom, setUiZoom } from '../platform/native.js';
import { aboutMark, gripDots, h, replace, taegukgi, themeSwatch, unionJack } from './dom.js';
import { ask, closeAllDialogs, dialogDocuments, openDialog, queryAll, showError } from './dialogs.js';
import { createTimeline, createDopeSheet, createGraph, createNLA } from './editors/anim.js';
import { createConsole, createImageEditor, createInfo, createSpreadsheet, createTextEditor, createUVEditor } from './editors/misc.js';
import { createNodeEditor } from './editors/nodes.js';
import { createOutliner } from './editors/outliner.js';
import { createProperties } from './editors/properties.js';
import { createView3D } from './editors/view3d.js';
import { getLanguage, nameOf, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import { WORKSPACES, workspaceById } from './layouts.js';
import { closeMenus, menuOpen, menuTitle, openMenu, openMenuBelow } from './menus.js';
import { createTutorial } from './tutorial.js';
import { getFont, parseFont, registerFont } from '../core/ttf.js';
import { setFallbackFont, setMissingFontHook } from '../core/text3d.js';
import { registerUiOps, fileMenuItems, loadProjectText, recentFiles, setRecentFiles, setRecentLimit } from './uiops.js';
import { button, numField, panel, row, select, toggle } from './widgets.js';

import { createAssetBrowser } from './editors/assets.js';
import { backgroundOptions, createStartScreen, sampleBrowser } from './startscreen.js';
import { createClipEditor } from './editors/clip.js';
import { createSequencer } from './editors/sequencer.js';
import { BUILTIN_ADDONS, addonFromFile, addonInfo, addonOperators, disableAddon, enableAddon, isEnabled } from '../core/addons.js';
import { applyKeymap, comboFromEvent, defaultKey, keyConflicts, lookupKey } from '../core/keymap.js';

export const EDITORS = {
  view3d: { en: '3D Viewport', ko: '3D 뷰포트', icon: 'ed-view3d', create: createView3D },
  outliner: { en: 'Outliner', ko: '아웃라이너', icon: 'ed-outliner', create: createOutliner },
  properties: { en: 'Properties', ko: '속성', icon: 'ed-properties', create: createProperties },
  timeline: { en: 'Timeline', ko: '타임라인', icon: 'ed-timeline', create: createTimeline },
  dopesheet: { en: 'Dope Sheet', ko: '도프 시트', icon: 'ed-dopesheet', create: createDopeSheet },
  graph: { en: 'Graph Editor', ko: '그래프 에디터', icon: 'ed-graph', create: createGraph },
  nla: { en: 'Nonlinear Animation', ko: '비선형 애니메이션', icon: 'ed-nla', create: createNLA },
  nodes: { en: 'Node Editor', ko: '노드 에디터', icon: 'ed-node', create: createNodeEditor },
  uv: { en: 'UV Editor', ko: 'UV 에디터', icon: 'ed-uv', create: createUVEditor },
  image: { en: 'Image Editor', ko: '이미지 에디터', icon: 'ed-image', create: createImageEditor },
  text: { en: 'Text Editor', ko: '텍스트 에디터', icon: 'ed-text', create: createTextEditor },
  console: { en: 'Scripting Console', ko: '스크립팅 콘솔', icon: 'ed-console', create: createConsole },
  info: { en: 'Info', ko: '정보', icon: 'ed-info', create: createInfo },
  spreadsheet: { en: 'Spreadsheet', ko: '스프레드시트', icon: 'ed-sheet', create: createSpreadsheet },
  assets: { en: 'Asset Browser', ko: '애셋 브라우저', icon: 'ed-assets', create: createAssetBrowser },
  sequencer: { en: 'Video Sequencer', ko: '비디오 시퀀서', icon: 'ed-sequencer', create: createSequencer },
  clip: { en: 'Movie Clip Editor', ko: '무비 클립 에디터', icon: 'ed-clip', create: createClipEditor },
};

const SETTINGS_KEY = 'my3d.settings';
let prefPage = 'interface';
const defaults = () => ({ language: 'ko', theme: 'studio', undoSteps: 64, uiScale: 1, showStats: true, emulate3: true, keymap: {}, addons: { enabled: [], user: [] } });

function loadSettings() {
  try { return { ...defaults(), ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }; } catch { return defaults(); }
}

export function createApp(rootEl) {
  const settings = loadSettings();
  setLanguage(settings.language);
  const appEl = h('div', { className: 'app' });
  rootEl.append(appEl);

  const history = new History(settings.undoSteps);
  const ctx = {
    doc: createDefaultScene(), history, lastOp: null,
    undo: () => app.undo(),
    notify: () => {},
    // The canvas compresses far better than the core's plain PNG writer.
    encodeImage: (image) => encodeImageData(image),
    get images() { return app.images; },
  };
  history.reset(ctx.doc);

  // ── The app object every editor talks to
  const app = {
    settings, ctx,
    get doc() { return ctx.doc; },
    logLines: [], renderResult: null, renderProgress: null, playing: false, projectPath: null, projectName: null, savedRev: null, pivotMode: 'MEDIAN',
    images: {}, imageCache: () => app.images,

    op(id, props = {}) {
      try {
        const result = run(ctx, id, props);
        const op = getOp(id);
        if (result === 'CANCELLED') { app.status(t(`${op.en}: nothing to do`, `${op.ko}: 할 일이 없습니다`)); app.invalidate(); return false; }
        app.log(`${id}(${logProps(props)})`, 'info');
        app.status('');
        app.invalidate();
        return true;
      } catch (error) {
        app.status(error.message, true);
        app.log(`${id}: ${error.message}`, 'error');
        if (!/cannot run/.test(error.message)) console.warn(error);
        return false;
      }
    },
    canRun: (id) => canRun(ctx, id),
    /** A property changed in a widget; `final` ends one undo step (false while a drag goes on). */
    changed(label, final = true) {
      touch(ctx);
      if (final) { history.push(ctx.doc, label); ctx.lastOp = null; }
      app.invalidate();
    },
    commit(label) {
      touch(ctx);
      history.push(ctx.doc, label);
      ctx.lastOp = null;
      app.invalidate();
    },
    commitSelection() { touch(ctx); history.amend(ctx.doc); app.invalidate(); },
    touch() { touch(ctx); app.invalidate(); },
    undo() {
      const text = history.undo();
      if (text == null) { app.status(t('Nothing to undo', '실행 취소할 것이 없습니다')); return false; }
      replaceDocument(text);
      return true;
    },
    redo() {
      const text = history.redo();
      if (text == null) { app.status(t('Nothing to redo', '다시 실행할 것이 없습니다')); return false; }
      replaceDocument(text);
      return true;
    },
    adjustLast(values) {
      adjustLast(ctx, values);
      app.invalidate();
    },
    setFrame(frame) {
      setFrame(ctx.doc, frame);
      touch(ctx);
      app.invalidate();
    },
    togglePlay() {
      app.playing = !app.playing;
      if (app.playing) { playClock = performance.now(); app.requestFrame(); }
      app.invalidate();
    },
    log(text, kind = 'info') { app.logLines.push({ text, kind }); if (app.logLines.length > 2000) app.logLines.shift(); },
    status(text, error = false) { statusMsg.textContent = text; statusMsg.classList.toggle('status-error', error); },

    /** Does this subtree hold a field being typed in or dragged? Then it must not be rebuilt under the user's hands. */
    widgetActive(el) {
      const active = el.ownerDocument.activeElement;
      return Boolean(active && el.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && !active.readOnly) || (pointerDown && el.contains(pointerDown));
    },

    invalidate() { needsUpdate = true; app.requestFrame(); },
    invalidateExcept() { app.invalidate(); },
    requestFrame() { if (!framePending) { framePending = true; requestAnimationFrame(tick); } },
    setActiveArea(area) { if (activeArea !== area) { activeArea = area; screen.querySelectorAll('.area').forEach((el) => el.classList.toggle('active-area', el.__area === area)); } },

    setWorkspace(id) {
      closeMenus();
      const ws = workspaceById(id);
      workspaceId = ws.id;
      layouts[ws.id] ??= ws.make();
      const doc = ctx.doc;
      const obj = activeObject(doc);
      if (obj && doc.mode !== ws.mode) {
        const allowed = ws.mode === 'OBJECT' || (obj.type === 'MESH' && ['EDIT', 'SCULPT', 'VERTEX_PAINT', 'TEXTURE_PAINT'].includes(ws.mode));
        doc.mode = allowed ? ws.mode : 'OBJECT';
        touch(ctx);
      } else if (!obj) doc.mode = 'OBJECT';
      maximized = null;
      buildTabs();
      buildScreen();
      app.invalidate();
      app.hideStart?.();
    },
    /** Every workspace back to its default layout (each editor loses its view state). */
    resetLayouts() {
      for (const key of Object.keys(layouts)) delete layouts[key];
      layouts[workspaceId] = workspaceById(workspaceId).make();
      maximized = null;
    },
    get workspace() { return workspaceId; },
    editorsOf: (type) => liveEditors().filter((e) => e.type === type).map((e) => e.instance),
    openDialog, ask, showError,
    fileSaved() { app.savedRev = history.current?.text ?? null; updateTitle(); },
    isDirty() { return app.savedRev !== (history.current?.text ?? null); },
    updateTitle: () => updateTitle(),
    replaceDocument: (text, reset = false) => replaceDocument(text, reset),
    showImageResult(result) { app.renderResult = result; app.invalidate(); },
    applyTheme: () => applyTheme(),
    rebuildChrome: () => rebuildChrome(),
    setActiveTab: () => {},
  };

  const logProps = (p) => Object.entries(p).filter(([k]) => k !== 'points').map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');

  function replaceDocument(text, reset = false) {
    ctx.doc = deserialize(text);
    ctx.lastOp = null;
    // Undo may bring back an older picture.
    decodeImages(ctx.doc, app.images).then(() => app.invalidate()).catch(() => {});
    if (reset) { history.reset(ctx.doc); app.savedRev = history.current.text; app.hideStart?.(); }
    for (const o of ctx.doc.objects) if (o.type === 'TEXT' && o.data?.font) app.ensureFont?.(o.data.font);
    touch(ctx);
    for (const e of liveEditors()) e.instance.syncHeader?.();
    syncSceneButton();
    app.invalidate();
    updateTitle();
  }

  // ── Frame loop
  let needsUpdate = false;
  let framePending = false;
  let playClock = 0;
  let lastStatsRev = -1;
  function tick(now) {
    framePending = false;
    if (app.playing) {
      const doc = ctx.doc;
      const spf = 1000 / doc.fps;
      if (now - playClock >= spf) {
        const steps = Math.max(1, Math.floor((now - playClock) / spf));
        playClock += steps * spf;
        let f = doc.frame + steps;
        if (f > doc.frameEnd) f = doc.frameStart + ((f - doc.frameStart) % Math.max(1, doc.frameEnd - doc.frameStart + 1));
        setFrame(doc, f);
        touch(ctx);
        needsUpdate = true;
      }
      app.requestFrame();
    }
    if (needsUpdate) {
      needsUpdate = false;
      for (const e of liveEditors()) { try { e.instance.update?.(); } catch (error) { reportError(error); } }
      updateStatusStats();
      updateTitle();
    }
    for (const e of liveEditors()) { try { e.instance.frame?.(); } catch (error) { reportError(error); } }
  }
  const reportError = (error) => {
    console.error(error);
    app.status(String(error?.message ?? error), true);
  };

  // ── Areas
  let workspaceId = 'layout';
  const layouts = {};
  let maximized = null;
  let activeArea = null;
  let pointerDown = null;
  const mounted = [];
  const liveEditors = () => mounted;

  const screen = h('div', { className: 'screen', dataset: { testid: 'screen' } });

  function disposeEditors() {
    for (const e of mounted.splice(0)) {
      try { e.instance.dispose?.(); } catch (error) { console.warn(error); }
    }
    activeArea = null;
  }

  function buildArea(node) {
    const area = node;
    const root = h('div', { className: 'area', dataset: { testid: `area-${node.editor}` } });
    root.__area = area;
    const header = h('div', { className: 'area-header' });
    const body = h('div', { className: 'area-body' });
    root.append(header, body);
    root.addEventListener('pointerdown', () => app.setActiveArea(area), true);
    root.addEventListener('pointerenter', () => { hoverArea = area; });
    const spec = EDITORS[node.editor] ?? EDITORS.info;
    const switcher = h('button', {
      type: 'button', className: 'editor-switch', title: nameOf(spec), dataset: { testid: `editor-switch-${node.editor}` },
      onClick: (e) => openMenuBelow(e.currentTarget, editorMenu(node)),
    }, icon(spec.icon, 14), icon('down', 9));
    header.append(switcher);
    const inSide = isSideArea(node);
    if (inSide) header.append(h('span', { className: 'area-title', dataset: { testid: `area-title-${node.editor}` } }, nameOf(spec)));
    const instance = spec.create(app, body, area);
    mounted.push({ type: node.editor, instance, area, root });
    instance.header?.(header);
    if (inSide) header.append(h('button', { type: 'button', className: 'side-fold area-fold', title: t('Collapse this column', '이 열 접기'), dataset: { testid: `side-collapse-${node.editor}` }, onClick: () => foldSide(true) }, icon('right', 11)));
    root.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.area-header') && !e.target.closest('input, select')) {
        e.preventDefault();
        openMenu(areaMenu(node), e.clientX, e.clientY);
      }
    });
    return root;
  }

  const editorMenu = (node) => {
    const group = (keys) => keys.map((key) => ({ label: nameOf(EDITORS[key]), icon: EDITORS[key].icon, checked: node.editor === key, testid: `set-editor-${key}`, onClick: () => { node.editor = key; delete node.state; buildScreen(); app.invalidate(); } }));
    return [
      { heading: t('General', '일반') }, ...group(['view3d', 'image', 'uv', 'nodes']),
      { heading: t('Animation', '애니메이션') }, ...group(['timeline', 'dopesheet', 'graph', 'nla']),
      { heading: t('Scripting', '스크립팅') }, ...group(['text', 'console', 'info']),
      { heading: t('Data', '데이터') }, ...group(['outliner', 'properties', 'spreadsheet']),
    ];
  };

  const findParent = (tree, node, parent = null) => {
    if (tree === node) return parent;
    if (!tree.split) return null;
    return findParent(tree.a, node, tree) ?? findParent(tree.b, node, tree);
  };
  const splitArea = (node, dir) => {
    const copy = { editor: node.editor };
    const old = { ...node };
    for (const key of Object.keys(node)) delete node[key];
    Object.assign(node, { split: dir, ratio: 0.5, a: old, b: copy });
    buildScreen();
    app.invalidate();
  };
  const joinArea = (node) => {
    const parent = findParent(layouts[workspaceId], node);
    if (!parent) return;
    const keep = parent.a === node ? parent.a : parent.b;
    const replaced = { ...keep };
    for (const key of Object.keys(parent)) delete parent[key];
    Object.assign(parent, replaced);
    buildScreen();
    app.invalidate();
  };
  const areaMenu = (node) => [
    { label: t('Vertical Split', '세로 분할'), icon: 'split-v', testid: 'area-split-v', onClick: () => splitArea(node, 'h') },
    { label: t('Horizontal Split', '가로 분할'), icon: 'split-h', testid: 'area-split-h', onClick: () => splitArea(node, 'v') },
    { label: t('Join (remove the other side)', '합치기 (반대쪽 제거)'), disabled: !findParent(layouts[workspaceId], node), testid: 'area-join', onClick: () => joinArea(node) },
    null,
    { label: maximized ? t('Restore Area', '영역 복원') : t('Maximize Area', '영역 최대화'), icon: 'maximize2', shortcut: 'Ctrl Space', testid: 'area-maximize', onClick: () => toggleMaximize(node) },
  ];
  const toggleMaximize = (node) => {
    maximized = maximized ? null : node;
    buildScreen();
    app.invalidate();
  };

  const holds = (tree, node) => tree === node || (tree.split ? holds(tree.a, node) || holds(tree.b, node) : false);
  const sideRoot = () => { const root = layouts[workspaceId]; return !maximized && root?.split === 'h' ? root : null; };
  function isSideArea(node) { const root = sideRoot(); return Boolean(root && holds(root.b, node)); }
  const foldSide = (closed) => {
    const root = sideRoot();
    if (!root) return;
    root.sideCollapsed = closed;
    activeArea = null;
    buildScreen();
    app.invalidate();
  };
  const leafEditors = (tree) => (tree.split ? [...leafEditors(tree.a), ...leafEditors(tree.b)] : [tree.editor]);

  function buildNode(node) {
    if (!node.split) return buildArea(node);
    if (node === sideRoot() && node.sideCollapsed) {
      const strip = h('div', { className: 'side-strip', dataset: { testid: 'side-strip' } },
        h('button', { type: 'button', className: 'side-fold', title: t('Expand this column', '이 열 펼치기'), dataset: { testid: 'side-expand' }, onClick: () => foldSide(false) }, icon('left', 11)),
        leafEditors(node.b).map((key) => { const spec = EDITORS[key] ?? EDITORS.info; return h('button', { type: 'button', className: 'side-strip-icon', title: nameOf(spec), onClick: () => foldSide(false) }, icon(spec.icon, 15)); }));
      const pane = h('div', { className: 'pane', style: { flex: '1 1 0' } }, buildNode(node.a));
      return h('div', { className: 'split h' }, pane, strip);
    }
    const el = h('div', { className: `split ${node.split}` });
    const [paneA, paneB] = [h('div', { className: 'pane' }), h('div', { className: 'pane' })];
    const apply = () => {
      paneA.style.flex = `${node.ratio} 1 0`;
      paneB.style.flex = `${1 - node.ratio} 1 0`;
    };
    apply();
    paneA.append(buildNode(node.a));
    paneB.append(buildNode(node.b));
    const divider = h('div', { className: 'divider', dataset: { testid: 'divider' } });
    divider.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      divider.classList.add('dragging');
      const r = el.getBoundingClientRect();
      const move = (m) => {
        const k = node.split === 'h' ? (m.clientX - r.left) / r.width : (m.clientY - r.top) / r.height;
        const total = node.split === 'h' ? r.width : r.height;
        const margin = Math.min(0.45, 40 / total);
        node.ratio = Math.max(margin, Math.min(1 - margin, k));
        apply();
        app.invalidate();
      };
      // On the window: the divider is 3 px wide, and the pointer leaves it at once.
      const up = () => { divider.classList.remove('dragging'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    el.append(paneA, divider, paneB);
    return el;
  }

  const screenWrap = h('div', { className: 'screen-wrap' }, screen);
  function buildScreen() {
    disposeEditors();
    screen.replaceChildren(buildNode(maximized ?? layouts[workspaceId]));
    if (!activeArea && mounted[0]) app.setActiveArea(mounted.find((e) => e.type === 'view3d')?.area ?? mounted[0].area);
  }

  // ── Top bar
  const topbar = h('div', { className: 'topbar', dataset: { testid: 'topbar' } });
  const tabsEl = h('div', { className: 'workspaces', dataset: { testid: 'workspaces' } });
  const WORKSPACE_ICONS = { layout: 'ed-view3d', modeling: 'mesh', sculpting: 'tool-brush', uv: 'ed-uv', paint: 'texture', shading: 'material', animation: 'ed-timeline', rendering: 'render', compositing: 'ed-node', geonodes: 'mod-nodes', video: 'ed-sequencer', tracking: 'ed-clip', assets: 'ed-assets', scripting: 'ed-console' };
  const wsBar = h('div', { className: 'ws-bar', dataset: { testid: 'ws-bar' } }, tabsEl);
  function buildTabs() {
    tabsEl.replaceChildren(...WORKSPACES.map((ws) => h('button', { type: 'button', className: `ws-tab${ws.id === workspaceId ? ' on' : ''}`, dataset: { testid: `ws-${ws.id}` }, onClick: () => app.setWorkspace(ws.id) }, icon(WORKSPACE_ICONS[ws.id] ?? 'ed-view3d', 13), nameOf(ws))));
  }

  const opEntry = (id, props = {}, label) => {
    const op = getOp(id);
    return { label: label ?? nameOf(op), icon: op.icon, shortcut: op.key, op: id, disabled: !app.canRun(id), onClick: () => app.op(id, props) };
  };

  const editItems = () => {
    const entries = history.entries();
    return [
      { label: t('Undo', '실행 취소'), icon: 'undo', shortcut: 'Ctrl Z', disabled: !history.canUndo, testid: 'menu-undo', onClick: () => app.undo() },
      { label: t('Redo', '다시 실행'), icon: 'redo', shortcut: 'Ctrl Shift Z', disabled: !history.canRedo, testid: 'menu-redo', onClick: () => app.redo() },
      { label: t('Undo History', '실행 취소 기록'), items: entries.items.map((label, i) => ({ label, checked: i === entries.index, onClick: () => { const text = history.jump(i); if (text) replaceDocument(text); } })) },
      null,
      { label: t('Search Operators...', '연산자 검색...'), icon: 'search', shortcut: 'F3', testid: 'menu-search', onClick: () => openSearch() },
      { label: t('Add-ons', '애드온'), testid: 'menu-addons', items: () => [...addonOperators().map((id) => opEntry(id)), ...(addonOperators().length ? [null] : []), { label: t('Manage Add-ons...', '애드온 관리...'), testid: 'menu-addons-manage', onClick: () => openAddons() }] },
      { label: t('Adjust Last Operation', '마지막 작업 조정'), shortcut: 'F9', disabled: !ctx.lastOp, onClick: () => {} },
      null,
      { label: t('Preferences...', '환경 설정...'), icon: 'settings', testid: 'menu-preferences', onClick: () => openSettings() },
    ];
  };
  const renderItems = () => [
    opEntry('render.render'), opEntry('render.animation'),
    null,
    opEntry('render.save_image'),
    null,
    { label: t('Engine', '엔진'), items: [['PATH', t('Path Tracing (CPU)', '경로 추적 (CPU)')], ['GPU', t('Path Tracing (GPU)', '경로 추적 (GPU)')], ['REALTIME', t('Real-time (GPU)', '실시간 (GPU)')]].map(([id, label]) => ({ label, checked: ctx.doc.render.engine === id, onClick: () => { ctx.doc.render.engine = id; app.changed('Engine', true); } })) },
  ];
  const windowItems = () => [
    { label: t('Toggle Maximize Area', '영역 최대화 전환'), shortcut: 'Ctrl Space', onClick: () => { const area = activeArea ?? mounted[0]?.area; if (area) toggleMaximize(maximized ?? area); } },
    { label: t('Reset This Workspace Layout', '이 워크스페이스 배치 초기화'), onClick: () => { layouts[workspaceId] = workspaceById(workspaceId).make(); maximized = null; buildScreen(); app.invalidate(); } },
    null,
    { label: t('Toggle Full Screen', '전체 화면 전환'), shortcut: 'F11', onClick: () => import('../platform/native.js').then((m) => m.toggleFullscreen()) },
  ];
  const helpItems = () => [
    { label: t("User's Guide", '사용자 설명서'), icon: 'guide', testid: 'menu-guide', onClick: () => openDoc('UsersGuide') },
    { label: t('Tutorial', '튜토리얼'), icon: 'tutorial', testid: 'menu-tutorial', onClick: () => app.startTutorial() },
    { label: t('Tutorial Course (written)', '튜토리얼 교재 (문서)'), icon: 'guide', testid: 'menu-tutorial-doc', onClick: () => openDoc('Tutorial') },
    null,
    { label: t('Feature Coverage...', '기능 구현 현황...'), icon: 'ed-coverage', testid: 'menu-coverage', onClick: () => openCoverage() },
    { label: t('About My3DBlender', 'My3DBlender 정보'), icon: 'ed-info', testid: 'menu-about', onClick: () => openAbout() },
  ];
  const openDoc = (base) => {
    const name = getLanguage() === 'en' ? `${base}.en.html` : `${base}.html`;
    if (isTauri) import('../platform/native.js').then((m) => m.invoke('open_doc_window', { name, title: base === 'Tutorial' ? t('Tutorial', '튜토리얼') : t("User's Guide", '사용자 설명서') })).catch((error) => showError(t('Could not open the document', '문서를 열 수 없습니다'), error));
    else window.open(`./doc/${name}`, 'my3d-docs', 'width=1040,height=820');
  };

  const sceneButton = h('button', { type: 'button', className: 'top-btn', dataset: { testid: 'scene-menu' }, onClick: (e) => openMenuBelow(e.currentTarget, sceneItems()) });
  const sceneItems = () => [
    { heading: t('Scenes', '장면') },
    ...(ctx.doc.scenes ?? []).map((s) => ({ label: s.name, checked: s.id === ctx.doc.activeScene, testid: `scene-${s.name}`, onClick: () => { app.op('scene.set', { id: s.id }); syncSceneButton(); } })),
    null,
    { ...opEntry('scene.new', { type: 'EMPTY' }), testid: 'scene-new', onClick: () => { app.op('scene.new', { type: 'EMPTY' }); syncSceneButton(); } },
    { ...opEntry('scene.new', { type: 'COPY' }, t('Copy This Scene', '이 장면 복사')), testid: 'scene-copy', onClick: () => { app.op('scene.new', { type: 'COPY' }); syncSceneButton(); } },
    { ...opEntry('scene.delete'), testid: 'scene-delete', onClick: () => { app.op('scene.delete'); syncSceneButton(); } },
  ];
  const syncSceneButton = () => {
    const name = ctx.doc.scenes?.find((s) => s.id === ctx.doc.activeScene)?.name ?? 'Scene';
    if (sceneButton.dataset.name !== name) { sceneButton.dataset.name = name; sceneButton.replaceChildren(icon('ed-view3d', 13), h('span', null, name), icon('down', 9)); updateMinWidth(); }
    sceneButton.title = t('Scene', '장면');
  };
  app.syncSceneButton = syncSceneButton;
  const flagButton = h('button', { type: 'button', className: 'top-btn', dataset: { testid: 'language' }, onClick: () => { settings.language = getLanguage() === 'ko' ? 'en' : 'ko'; saveSettings(); setLanguage(settings.language); setLanguageNative(settings.language); rebuildChrome(); } });
  const themeButton = h('button', { type: 'button', className: 'top-btn', dataset: { testid: 'theme' }, onClick: (e) => openThemeMenu(e.currentTarget) });
  const nextTheme = h('button', { type: 'button', className: 'top-btn', dataset: { testid: 'theme-next' }, onClick: () => { const i = THEMES.findIndex((x) => x.id === settings.theme); settings.theme = THEMES[(i + 1) % THEMES.length].id; saveSettings(); applyTheme(); } }, icon('palette', 15));
  const settingsButton = h('button', { type: 'button', className: 'top-btn', dataset: { testid: 'settings' }, onClick: () => openSettings() }, icon('settings', 15));
  const aboutButton = h('button', { type: 'button', className: 'top-btn', dataset: { testid: 'about' }, onClick: () => openAbout() }, aboutMark());
  const maxBtn = h('button', { type: 'button', className: 'win-btn', onClick: () => windowAction('toggleMaximize') }, icon('maximize', 12));
  const brandName = h('span', null);
  const brand = h('span', { className: 'brand', dataset: { testid: 'brand' } }, h('img', { src: './icon.png', alt: '' }), brandName);
  const startToggle = h('button', { type: 'button', className: 'start-toggle', dataset: { testid: 'start-toggle' }, onClick: () => { if (startScreen.isOpen()) app.hideStart(); else app.showStart(); } });

  function buildTopbar() {
    brandName.replaceChildren('My3DBlender ', h('small', null, `v${__APP_VERSION__}`));
    startToggle.replaceChildren(icon('home', 14), h('span', null, t('Start', '시작')));
    startToggle.title = t('Start screen', '시작 화면');
    syncSceneButton();
    flagButton.replaceChildren(getLanguage() === 'ko' ? unionJack(13) : taegukgi(13));
    flagButton.title = getLanguage() === 'ko' ? 'English' : '한국어';
    nextTheme.title = t('Next theme', '다음 테마');
    settingsButton.title = t('Preferences', '환경 설정');
    aboutButton.title = t('About', '정보');
    const theme = resolveTheme(settings.theme);
    themeButton.replaceChildren(themeSwatch(theme, 13), h('span', null, nameOfTheme(theme)), icon('down', 9));
    themeButton.title = t('Theme', '테마');
    startToggle.title = t('Start screen', '시작 화면');
    replace(topbar,
      brand,
      startToggle,
      menuTitle(t('File', '파일'), () => fileMenuItems(app), 'menu-file'),
      menuTitle(t('Edit', '편집'), editItems, 'menu-edit'),
      menuTitle(t('Render', '렌더'), renderItems, 'menu-render'),
      menuTitle(t('Window', '창'), windowItems, 'menu-window'),
      menuTitle(t('Help', '도움말'), helpItems, 'menu-help'),
      h('span', { className: 'top-spacer' }),
      h('span', { className: 'top-tools' }, sceneButton, flagButton, nextTheme, themeButton, settingsButton, aboutButton),
      isTauri ? h('button', { type: 'button', className: 'win-btn', title: t('Minimize', '최소화'), onClick: () => windowAction('minimize') }, icon('minimize', 12)) : null,
      isTauri ? maxBtn : null,
      isTauri ? h('button', { type: 'button', className: 'win-btn close', title: t('Close', '닫기'), dataset: { testid: 'win-close' }, onClick: () => requestClose() }, icon('close', 12)) : null,
    );
    updateMinWidth();
  }
  const nameOfTheme = (theme) => theme.name[getLanguage()] ?? theme.name.en;

  /** The narrowest the window may get: every button in the top bar must stay fully visible. */
  const measureTopBar = () => {
    const bar = getComputedStyle(topbar);
    let width = parseFloat(bar.paddingLeft) + parseFloat(bar.paddingRight) + parseFloat(bar.columnGap || 0) * (topbar.children.length - 1);
    for (const child of topbar.children) {
      if (child.classList.contains('top-spacer')) { width += 12; continue; }
      const style = getComputedStyle(child);
      width += child.getBoundingClientRect().width + parseFloat(style.marginLeft) + parseFloat(style.marginRight);
    }
    // The tabs have their own row: the wider of the two sets the limit.
    return Math.ceil(Math.max(width, tabsEl.scrollWidth + 12) + 2);
  };
  let measuringWidth = false;
  /** The narrowest the window may get: every button stays visible in either language, so that switching language leaves the window as it is. */
  function updateMinWidth() {
    requestAnimationFrame(() => {
      if (measuringWidth) return;
      measuringWidth = true;
      const current = getLanguage();
      let need = 0;
      for (const language of ['ko', 'en']) {
        setLanguage(language);
        buildTopbar();
        buildTabs();
        need = Math.max(need, measureTopBar());
      }
      setLanguage(current);
      buildTopbar();
      buildTabs();
      // Rebuilding asks for another measurement; this frame's has just been made.
      requestAnimationFrame(() => { measuringWidth = false; });
      app.minWidth = need;
      setMinWidth(Math.ceil(need * getUiZoom()));
      appEl.style.minWidth = `${need}px`;
    });
  }

  function openThemeMenu(button2) {
    const pick = (theme) => h('button', { type: 'button', className: `theme-item${settings.theme === theme.id ? ' on' : ''}`, dataset: { testid: `theme-${theme.id}` }, onClick: () => { settings.theme = theme.id; saveSettings(); applyTheme(); closeMenus(); } }, themeSwatch(theme, 13), nameOfTheme(theme));
    const panelEl = openMenuBelow(button2, []);
    panelEl.style.width = '420px';
    const column = (mode, name) => h('div', { className: 'theme-column', dataset: { testid: `theme-column-${mode}` } }, h('div', { className: 'menu-heading' }, name), themesByMode(mode).map(pick));
    panelEl.append(h('div', { className: 'theme-columns' }, column('dark', t('Dark', '어두운 테마')), column('light', t('Light', '밝은 테마'))));
    const r = button2.getBoundingClientRect();
    panelEl.style.left = `${Math.max(2, Math.min(r.left, window.innerWidth - 426))}px`;
  }

  function applyTheme() {
    const theme = resolveTheme(settings.theme);
    for (const [key, value] of Object.entries(themeVars(theme))) appEl.style.setProperty(key, value);
    appEl.dataset.theme = theme.id;
    appEl.dataset.themeMode = theme.mode;
    document.documentElement.style.colorScheme = theme.mode;
    document.body.style.background = theme.colors.bg;
    setWindowTheme(theme.mode);
    if (mounted.length) { buildTopbar(); app.invalidate(); }
  }

  const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private window */ } };

  function rebuildChrome() {
    document.documentElement.lang = getLanguage();
    buildTopbar();
    buildTabs();
    buildScreen();
    buildStatusHints();
    if (startScreen.isOpen()) startScreen.rebuild();
    app.invalidate();
  }

  // ── Status bar
  const statusMsg = h('span', { className: 'status-msg', dataset: { testid: 'status-msg' } });
  const statusHints = h('span', { style: { display: 'inline-flex', gap: '12px' } });
  const statusStats = h('span', { dataset: { testid: 'status-stats' } });
  const statusbar = h('div', { className: 'statusbar', dataset: { testid: 'statusbar' } }, statusMsg, h('span', { className: 'status-spacer' }), statusHints, statusStats, isTauri ? h('span', { className: 'size-grip', title: t('Drag to resize the window', '끌어서 창 크기 조절'), dataset: { testid: 'window-grip' }, onPointerdown: (e) => { if (e.button === 0) { e.preventDefault(); startResize(); } } }, gripDots()) : null);
  const hint = (key, text) => h('span', { className: 'key-hint' }, h('kbd', null, key), text);
  function buildStatusHints() {
    if (settings.showHints === false) { statusHints.replaceChildren(); return; }
    statusHints.replaceChildren(hint(t('LMB', '왼쪽'), t('Select', '선택')), hint(t('RMB drag', '오른쪽 끌기'), t('Orbit', '회전')), hint(t('Shift+RMB drag', 'Shift+오른쪽 끌기'), t('Pan', '이동')), hint(t('RMB', '오른쪽'), t('Menu', '메뉴')), hint('F3', t('Search', '검색')));
  }
  function updateStatusStats() {
    const rev = ctx.doc._rev ?? 0;
    if (rev === lastStatsRev || !settings.showStats) return;
    lastStatsRev = rev;
    const s = sceneStats(ctx.doc);
    const o = activeObject(ctx.doc);
    statusStats.textContent = `${o?.name ?? '-'} | ${t('Verts', '꼭짓점')} ${s.verts} | ${t('Faces', '면')} ${s.faces} | ${t('Tris', '삼각형')} ${s.tris} | ${t('Objects', '오브젝트')} ${ctx.doc.selected.length}/${ctx.doc.objects.length} | v${__APP_VERSION__}`;
  }
  function updateTitle() {
    const name = app.projectName ?? t('(unsaved)', '(저장 안 됨)');
    const title = `${app.isDirty() ? '* ' : ''}${name} - My3DBlender v${__APP_VERSION__}`;
    if (title !== app.lastTitle) { app.lastTitle = title; setWindowTitle(title); }
  }

  // ── Dialogs
  function openSearch() {
    const input = h('input', { className: 'search-input', placeholder: t('Search for an operator', '연산자 이름으로 검색'), dataset: { testid: 'search-input' }, spellcheck: false });
    const list = h('div', { className: 'search-list', dataset: { testid: 'search-list' } });
    let selectedIndex = 0;
    let rows = [];
    let dialog;
    const refill = () => {
      const needle = input.value.trim().toLowerCase();
      const all = allOps().filter((op) => !op.props.some((p) => p.hidden && p.def === '') && app.canRun(op.id));
      const hits = (needle ? all.filter((op) => `${op.en} ${op.ko} ${op.id}`.toLowerCase().includes(needle)) : all).slice(0, 12);
      selectedIndex = Math.min(selectedIndex, Math.max(0, hits.length - 1));
      rows = hits;
      list.replaceChildren(...hits.map((op, i) => h('button', { type: 'button', className: `search-row${i === selectedIndex ? ' on' : ''}`, dataset: { testid: `search-${op.id}` }, onClick: () => runIt(op) }, icon(op.icon ?? 'tool', 14), nameOf(op), h('small', null, op.key ?? op.id))));
    };
    const runIt = (op) => { dialog?.close(); app.op(op.id); };
    input.addEventListener('input', () => { selectedIndex = 0; refill(); });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'ArrowDown') { selectedIndex = Math.min(rows.length - 1, selectedIndex + 1); refill(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { selectedIndex = Math.max(0, selectedIndex - 1); refill(); e.preventDefault(); }
      if (e.key === 'Enter' && rows[selectedIndex]) runIt(rows[selectedIndex]);
      if (e.key === 'Escape') dialog?.close();
    });
    refill();
    openDialog({ id: 'search', title: t('Search', '검색'), icon: 'search', width: 480, height: 420, body: [input, list] }).then((d) => { dialog = d; input.focus(); });
  }
  app.openSearch = openSearch;

  /** The settings that have a default worth going back to. */
  const PREFERENCE_KEYS = ['showStats', 'showHints', 'toolLabels', 'recentCount', 'viewGrid', 'showNavGizmo', 'gizmoSize', 'orbitSpeed', 'panSpeed', 'zoomSpeed', 'invertZoom', 'rightDragNav', 'emulate3', 'leftDrag', 'renderThreads', 'showStart', 'askTutorial', 'startBg', 'startBgSpeed', 'startCardOpacity', 'startBgShuffle'];
  const applyPreferences = () => {
    setRenderThreads(settings.renderThreads ?? 0);
    setRecentLimit(settings.recentCount ?? 10);
    buildStatusHints();
    startScreen?.sync();
    for (const v of app.editorsOf('view3d')) v.instance?.syncHeader?.();
    app.invalidate();
  };
  /** Preferences › Packages: what the program needs, its state, and downloading and installing it with progress and a stop button. */
  function packagesPage() {
    const page = h('div', { className: 'pkg-page', dataset: { testid: 'pkg-page' } });
    if (!isTauri) {
      page.append(h('p', { className: 'ask-text' }, t('In a browser nothing needs installing.', '브라우저에서는 설치할 것이 없습니다.')));
      return page;
    }
    const mb = (n) => (n / 1048576).toFixed(1);
    const fill = h('div', { className: 'progress-fill', dataset: { testid: 'pkg-fill' } });
    const bar = h('div', { className: 'progress-track pkg-bar' }, fill);
    const line = h('div', { className: 'pkg-progress', dataset: { testid: 'pkg-progress' } });
    const stop = button(t('Stop', '중지'), () => invoke('package_cancel'), { testid: 'pkg-stop' });
    const start = button('', () => install(true), { className: 'primary', testid: 'pkg-install' });
    const state = h('span', { className: 'pkg-state', dataset: { testid: 'pkg-state' } });
    const name = h('strong', { dataset: { testid: 'pkg-name' } });
    let info = null;
    let timer = 0;
    let lastPhase = '';
    const stopTimer = () => { clearInterval(timer); timer = 0; };
    const showIdle = () => {
      bar.style.display = 'none';
      stop.style.display = 'none';
      start.style.display = info?.canInstall ? '' : 'none';
      start.textContent = info?.installed ? t('Download and Install Again', '다시 받아 설치') : t('Download and Install', '받아서 설치');
    };
    const refresh = async () => {
      [info] = await invoke('package_list');
      name.textContent = info.name;
      state.textContent = info.installed ? `${t('Installed', '설치됨')} · ${info.version}` : t('Not installed', '설치되어 있지 않음');
      state.classList.toggle('missing', !info.installed);
      showIdle();
    };
    const poll = async () => {
      const p = await invoke('package_progress');
      const running = p.phase === 'download' || p.phase === 'install';
      bar.style.display = running ? '' : 'none';
      stop.style.display = running ? '' : 'none';
      start.style.display = running ? 'none' : (info?.canInstall ? '' : 'none');
      if (p.phase === 'download') {
        const percent = p.total ? Math.min(100, Math.floor((p.received / p.total) * 100)) : 0;
        bar.classList.toggle('busy', !p.total);
        fill.style.width = p.total ? `${percent}%` : '100%';
        line.textContent = p.total ? `${t('Downloading', '내려받는 중')} ${percent}% (${mb(p.received)} / ${mb(p.total)} MB)` : `${t('Downloading', '내려받는 중')} ${mb(p.received)} MB`;
      } else if (p.phase === 'install') {
        bar.classList.add('busy');
        fill.style.width = '100%';
        line.textContent = t('Installing... the setup does not report how far along it is', '설치 중... 설치 프로그램은 진행 정도를 알려 주지 않습니다');
      }
      if (running) { lastPhase = p.phase; return; }
      stopTimer();
      if (!lastPhase) return;
      lastPhase = '';
      bar.classList.remove('busy');
      await refresh();
      if (p.phase === 'done') line.textContent = t('Finished.', '끝났습니다.');
      else if (p.phase === 'cancelled') line.textContent = t('Stopped. Nothing was changed.', '중지했습니다. 바뀐 것은 없습니다.');
      else if (p.phase === 'failed') {
        line.textContent = `${t('Failed', '실패')}: ${p.error ?? ''}`;
        const answer = await ask({ title: t('Installation Failed', '설치 실패'), message: t(`${info.name} could not be installed: ${p.error ?? ''}. Try again?`, `${info.name} 을(를) 설치하지 못했습니다: ${p.error ?? ''}. 다시 설치할까요?`), buttons: [['retry', t('Try Again', '다시 설치'), true], ['no', t('Cancel', '취소')]] });
        if (answer === 'retry') install(false);
      }
    };
    const watch = () => { if (!timer) timer = setInterval(() => { if (!page.isConnected) { stopTimer(); return; } poll(); }, 150); };
    const install = async (confirm) => {
      if (confirm) {
        const answer = await ask({ title: info.name, message: t('This downloads the setup from Microsoft, about 2 MB, and it fetches the runtime, about 180 MB. Go on?', 'Microsoft에서 약 2 MB의 설치 프로그램을 받고, 이것이 약 180 MB의 런타임을 내려받습니다. 계속할까요?'), buttons: [['go', t('Download and Install', '받아서 설치'), true], ['no', t('Cancel', '취소')]] });
        if (answer !== 'go') return;
      }
      line.textContent = '';
      lastPhase = 'download';
      try {
        await invoke('package_install', { id: info.id });
        watch();
        poll();
      } catch (error) {
        lastPhase = '';
        line.textContent = String(error?.message ?? error);
      }
    };
    page.append(
      h('p', { className: 'ask-text' }, t('My3DBlender needs one package from outside: the web view it draws its window with. Everything else is built in.', 'My3DBlender에 필요한 외부 패키지는 창을 그리는 웹 뷰 하나입니다. 나머지는 모두 프로그램에 들어 있습니다.')),
      h('div', { className: 'pkg-row' }, h('div', { className: 'pkg-head' }, name, h('span', { className: 'pkg-tag' }, t('Required', '필수')), state), bar, line, h('div', { className: 'pkg-buttons' }, start, stop)));
    refresh().then(async () => { const p = await invoke('package_progress'); if (p.phase === 'download' || p.phase === 'install') { lastPhase = p.phase; watch(); } });
    return page;
  }

  function openSettings() {
    const change = (key) => (v) => { settings[key] = v; saveSettings(); applyPreferences(); };
    const number = (label, key, fallback, min, max, step, suffix = '') => row(label, numField({ value: settings[key] ?? fallback, int: true, min, max, step, suffix, testid: `pref-${key}`, onChange: change(key) }));
    const check = (label, key, fallback = true) => toggle({ value: settings[key] ?? fallback, label, testid: `pref-${key}`, onChange: change(key) });
    const pages = [
      ['interface', 'ed-properties', t('Interface', '화면'), [
        row(t('Language', '언어'), select({ value: settings.language, options: [['ko', '한국어'], ['en', 'English']], testid: 'pref-language', onChange: (v) => { settings.language = v; saveSettings(); setLanguage(v); setLanguageNative(v); rebuildChrome(); } })),
        row(t('Theme', '테마'), select({ value: settings.theme, options: THEMES.map((x) => [x.id, nameOfTheme(x)]), testid: 'pref-theme', onChange: (v) => { settings.theme = v; saveSettings(); applyTheme(); } })),
        toggle({ value: settings.showStats, label: t('Show scene statistics in the status bar', '상태 표시줄에 장면 통계 표시'), onChange: (v) => { settings.showStats = v; saveSettings(); statusStats.textContent = ''; lastStatsRev = -1; app.invalidate(); } }),
        isTauri
          ? row(t('Interface Scale', '화면 크기'), select({ value: String(settings.uiScale ?? 1), options: [['0.9', '90%'], ['1', '100%'], ['1.1', '110%'], ['1.25', '125%'], ['1.5', '150%']], testid: 'pref-uiScale', onChange: (v) => { settings.uiScale = Number(v); saveSettings(); setUiZoom(settings.uiScale).then(() => updateMinWidth()); } }))
          : h('div', { className: 'note-line' }, t('Interface scale: use the browser\'s Ctrl and + or −.', '화면 크기: 브라우저의 Ctrl + / − 를 쓰세요.')),
        check(t('Show mouse hints in the status bar', '상태 표시줄에 마우스 안내 표시'), 'showHints'),
        number(t('Recent Projects', '최근 프로젝트 수'), 'recentCount', 10, 1, 30, 1),
      ]],
      ['viewport', 'ed-view3d', t('3D View', '3D 뷰'), [
        check(t('Show the grid in new views', '새 뷰에 격자 표시'), 'viewGrid'),
        check(t('Show the axis widget', '축 표시 보이기'), 'showNavGizmo'),
        check(t('Show names in the toolbar', '도구 모음에 이름 표시'), 'toolLabels'),
        number(t('Transform Gizmo Size', '변형 기즈모 크기'), 'gizmoSize', 80, 30, 200, 10, '%'),
      ]],
      ['navigation', 'tool-rotate', t('Navigation', '화면 조작'), [
        number(t('Orbit Speed', '회전 속도'), 'orbitSpeed', 100, 10, 400, 10, '%'),
        number(t('Pan Speed', '이동 속도'), 'panSpeed', 100, 10, 400, 10, '%'),
        number(t('Zoom Speed', '확대·축소 속도'), 'zoomSpeed', 100, 10, 400, 10, '%'),
        check(t('Invert the zoom wheel', '휠 확대·축소 방향 반대로'), 'invertZoom', false),
        check(t('Right button drag: orbit (Shift: pan, Ctrl: zoom)', '오른쪽 버튼 끌기: 회전 (Shift: 이동, Ctrl: 확대·축소)'), 'rightDragNav'),
        check(t('Alt + left button drag: orbit', 'Alt + 왼쪽 버튼 끌기: 회전'), 'emulate3'),
        row(t('Left Button Drag', '왼쪽 버튼 끌기'), select({ value: settings.leftDrag ?? 'box', options: [['box', t('Box select', '상자 선택')], ['orbit', t('Orbit the view', '보기 회전')]], testid: 'pref-leftDrag', onChange: change('leftDrag') })),
      ]],
      ['start', 'home', t('Start and Tutorial', '시작과 튜토리얼'), [
        check(t('Show the start screen at startup', '시작할 때 시작 화면 표시'), 'showStart'),
        check(t('Ask about the tutorial at startup', '시작할 때 튜토리얼 실행 묻기'), 'askTutorial'),
        row(t('Background', '배경'), select({ value: settings.startBg ?? 'wirecubes', options: backgroundOptions(), testid: 'pref-start-bg', onChange: change('startBg') })),
        check(t('Change the background by itself', '배경 자동 변경'), 'startBgShuffle', false),
        number(t('Background Speed', '배경 속도'), 'startBgSpeed', 100, 0, 300, 10, '%'),
        number(t('Card Opacity', '카드 불투명도'), 'startCardOpacity', 85, 20, 100, 5, '%'),
      ]],
      ['packages', 'import', t('Packages', '패키지'), [packagesPage()]],
      ['system', 'settings', t('System', '시스템'), [
        row(t('Undo Steps', '실행 취소 단계'), numField({ value: settings.undoSteps, int: true, min: 1, max: 500, step: 8, testid: 'pref-undo', onChange: (v) => { settings.undoSteps = v; history.limit = v; saveSettings(); } })),
        number(t('Render Threads (0: automatic)', '렌더 스레드 (0: 자동)'), 'renderThreads', 0, 0, 64, 1),
        h('div', { className: 'btn-row pref-buttons' },
          button(t('Edit Keymap...', '단축키 편집...'), () => openKeymap(), { testid: 'pref-keymap' }),
          button(t('Manage Add-ons...', '애드온 관리...'), () => openAddons(), { testid: 'pref-addons' })),
      ]],
    ];
    const restore = button(t('Restore Defaults', '기본값으로 되돌리기'), async () => {
            const answer = await ask({ title: t('Restore Defaults', '기본값으로 되돌리기'), message: t('Put these settings back as they were? Language, theme, keys and add-ons stay.', '이 설정들을 처음 상태로 되돌릴까요? 언어, 테마, 단축키, 애드온은 그대로입니다.'), buttons: [['yes', t('Restore', '되돌리기'), true], ['no', t('Cancel', '취소')]] });
            if (answer !== 'yes') return;
            for (const key of PREFERENCE_KEYS) delete settings[key];
            Object.assign(settings, defaults(), { language: settings.language, theme: settings.theme, keymap: settings.keymap, addons: settings.addons, undoSteps: settings.undoSteps });
            saveSettings();
            applyPreferences();
            closeAllDialogs();
            openSettings();
          }, { className: 'pref-reset', testid: 'pref-reset' });
    const bodies = new Map(pages.map(([id, , , controls]) => [id, h('div', { className: 'pref-page', dataset: { testid: `pref-page-${id}` } }, controls)]));
    const tabs = new Map();
    const show = (id) => {
      prefPage = id;
      for (const [key, el] of bodies) el.style.display = key === id ? '' : 'none';
      for (const [key, el] of tabs) el.classList.toggle('on', key === id);
    };
    for (const [id, name, label] of pages) tabs.set(id, h('button', { type: 'button', className: 'pref-tab', dataset: { testid: `pref-tab-${id}` }, onClick: () => show(id) }, icon(name, 15), h('span', null, label)));
    const body = h('div', { className: 'pref-layout', dataset: { testid: 'pref-layout' } }, h('nav', { className: 'pref-tabs' }, [...tabs.values()], restore), h('div', { className: 'pref-pages' }, [...bodies.values()]));
    show(bodies.has(prefPage) ? prefPage : 'interface');
    openDialog({ id: 'settings', title: t('Preferences', '환경 설정'), icon: 'settings', width: 720, height: 500, body });
  }

  const tutorial = createTutorial(app);
  app.tutorial = tutorial;
  /** Runs the tutorial on a new scene; unsaved work is asked about first. */
  app.startTutorial = async () => {
    if (app.isDirty()) {
      const answer = await ask({ title: t('Tutorial', '튜토리얼'), message: t('The tutorial starts on a new scene, and this project has unsaved changes.', '튜토리얼은 새 장면에서 시작합니다. 이 프로젝트에 저장하지 않은 변경 내용이 있습니다.'), buttons: [['discard', t('Discard and Start', '버리고 시작'), true], ['no', t('Cancel', '취소')]] });
      if (answer !== 'discard') return;
    }
    app.replaceDocument(serialize(createDefaultScene()), true);
    app.projectPath = null;
    app.projectName = null;
    app.fileSaved();
    app.hideStart();
    tutorial.start();
  };

  // Fonts for text objects: loaded when a text needs one. A file does not hold its fonts; it names them.
  const fontLoads = new Map();
  const ensureFont = (family) => {
    if (!family || getFont(family) || fontLoads.has(family)) return fontLoads.get(family);
    const load = readFont(family).then((file) => {
      if (!file) throw new Error(t(`${family} cannot be reached from here: open its file with Load Font File`, `여기서는 ${family} 에 접근할 수 없습니다: 글꼴 파일 열기로 불러오세요`));
      registerFont(family, parseFont(file.bytes, file.index));
      for (const o of ctx.doc.objects) if (o.type === 'TEXT' && o.data.font === family) o.data = { ...o.data };
      touch(ctx);
      app.invalidate();
    }).catch((error) => { fontLoads.delete(family); app.status(error?.message ?? String(error)); });
    fontLoads.set(family, load);
    return load;
  };
  app.ensureFont = ensureFont;
  // For the tests of the real window.
  app.setUiScaleForTest = (scale) => setUiZoom(scale).then(() => updateMinWidth());
  app.evaluatedFaces = (obj) => evaluatedMesh(ctx.doc, obj)?.faces.length ?? 0;
  // Hangul and the like, with no font chosen: the first of the usual system fonts that is there.
  let fallbackTried = false;
  setMissingFontHook(() => {
    if (fallbackTried) return;
    fallbackTried = true;
    listFonts().then(async (names) => {
      const family = ['Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', 'Noto Sans CJK KR', 'Noto Sans KR', 'NanumGothic', 'Noto Sans CJK JP'].find((n) => names.includes(n));
      if (!family) return;
      await ensureFont(family);
      if (getFont(family)) { setFallbackFont(family); for (const o of ctx.doc.objects) if (o.type === 'TEXT') o.data = { ...o.data }; touch(ctx); app.invalidate(); }
    });
  });
  app.loadFontFile = (name, bytes) => { registerFont(name, parseFont(bytes, 0)); fontLoads.set(name, Promise.resolve()); };
  let fontNames = null;
  /** The font row of a text object's data tab. */
  app.fontPicker = (data) => {
    const pick = select({ value: data.font ?? '', options: [['', t('Built-in (Latin only)', '내장 글꼴 (라틴 문자만)')], ...(data.font ? [[data.font, data.font]] : [])], testid: 'text-font', onChange: async (family) => {
      data.font = family || null;
      if (family) await ensureFont(family);
      touch(ctx);
      app.commit(t('Font', '글꼴'));
    } });
    const fill = (names) => { const current = pick.value; replace(pick, ...[['', t('Built-in (Latin only)', '내장 글꼴 (라틴 문자만)')], ...names.map((n) => [n, n])].map(([v, label]) => h('option', { value: v, selected: v === current }, label))); pick.value = current; };
    if (fontNames) fill(fontNames); else listFonts().then((names) => { fontNames = names; fill(names); });
    const open = button(t('Load Font File...', '글꼴 파일 열기...'), () => app.op('font.open'), { testid: 'text-font-file' });
    return row(t('Font', '글꼴'), h('span', { className: 'font-row' }, pick, open));
  };
  /** Asked at startup: a tutorial for those who want one, and the choice not to be asked again. */
  app.askTutorial = () => {
    let dialog;
    openDialog({
      id: 'tutorial-ask', title: t('Tutorial', '튜토리얼'), icon: 'tutorial', width: 640, height: 298,
      body: h('div', { className: 'tutorial-ask', dataset: { testid: 'tutorial-ask' } },
        h('div', { className: 'tutorial-ask-main' },
          h('img', { src: './sample/thumb/subsurf-mug.png', alt: '', draggable: false, dataset: { testid: 'tutorial-ask-picture' } }),
          h('div', { className: 'tutorial-ask-text' },
            h('strong', null, t('Would you like to run the tutorial?', '튜토리얼을 실행할까요?')),
            h('p', null, t('It runs in this window, about ten minutes, step by step. Each step shows where to look and ticks itself off as you do it.', '이 창에서 약 10분 동안 단계별로 진행됩니다. 단계마다 어디를 볼지 알려 주고, 직접 하면 저절로 체크됩니다.')),
            h('ul', null, [
              t('Turning and zooming the view', '보기 돌리기와 확대·축소'),
              t('Selecting, adding and moving', '선택, 추가, 이동'),
              t('Smooth shading, a modifier and colour', '부드러운 셰이딩, 모디파이어, 색'),
              t('Keyframes that make it move', '움직임을 만드는 키프레임'),
              t('Rendering a picture', '그림으로 렌더링'),
            ].map((line) => h('li', null, line))))),
        toggle({ value: settings.askTutorial !== false, label: t('Show this at startup', '시작할 때 이 창 표시'), testid: 'tutorial-ask-show', onChange: (v) => { settings.askTutorial = v; saveSettings(); } })),
      actions: [
        button(t('Run the Tutorial', '튜토리얼 실행'), () => { dialog?.close(); app.startTutorial(); }, { className: 'primary', testid: 'tutorial-ask-run' }),
        button(t('Later', '나중에'), () => dialog?.close(), { testid: 'tutorial-ask-later' }),
      ],
    }).then((d) => { dialog = d; });
  };

  const allAddons = () => [...BUILTIN_ADDONS, ...(settings.addons.user ?? [])];
  const addonLog = (line) => app.log(line, 'info');
  /** Turns on what was on last time. A broken add-on is reported and stays off; it does not stop the program. */
  function startAddons() {
    for (const id of settings.addons.enabled ?? []) {
      const addon = allAddons().find((a) => a.id === id);
      if (!addon) continue;
      try { enableAddon(ctx, addon, addonLog); } catch (error) { app.log(`${addon.name}: ${error.message}`, 'error'); }
    }
  }
  function openAddons() {
    const list = h('div', { className: 'keymap-list', dataset: { testid: 'addon-list' } });
    const toggleAddon = (addon) => {
      try {
        if (isEnabled(addon.id)) { disableAddon(addon.id); settings.addons.enabled = settings.addons.enabled.filter((x) => x !== addon.id); }
        else { enableAddon(ctx, addon, addonLog); settings.addons.enabled = [...new Set([...settings.addons.enabled, addon.id])]; }
        saveSettings();
      } catch (error) {
        showError(t('The add-on failed', '애드온 실행에 실패했습니다'), error.message);
      }
      refill();
      app.invalidate();
    };
    const refill = () => {
      list.replaceChildren(...allAddons().map((addon) => {
        const info = addonInfo(ctx, addon);
        return h('div', { className: 'addon-row', dataset: { testid: `addon-${addon.id}` } },
          toggle({ value: isEnabled(addon.id), label: '', testid: `addon-toggle-${addon.id}`, onChange: () => toggleAddon(addon) }),
          h('div', { className: 'addon-text' }, h('strong', null, info.name ?? addon.name), h('small', null, `${info.category ?? ''} · ${addon.language}${addon.builtin ? ` · ${t('built in', '기본 제공')}` : ''}`), h('div', { className: 'note-line' }, info.error ? `${t('Error', '오류')}: ${info.error}` : info.description ?? '')),
          addon.builtin ? null : h('button', { type: 'button', className: 'icon-btn', title: t('Remove', '제거'), dataset: { testid: `addon-remove-${addon.id}` }, onClick: () => { disableAddon(addon.id); settings.addons.user = settings.addons.user.filter((x) => x.id !== addon.id); settings.addons.enabled = settings.addons.enabled.filter((x) => x !== addon.id); saveSettings(); refill(); } }, icon('delete', 12)));
      }));
    };
    app.installAddon = (name, text) => {
      const addon = addonFromFile(name, text);
      settings.addons.user = [...settings.addons.user.filter((x) => x.id !== addon.id), addon];
      saveSettings();
      refill();
      return addon;
    };
    refill();
    openDialog({
      id: 'addons', title: t('Add-ons', '애드온'), icon: 'settings', width: 620, height: 520,
      body: [
        h('div', { className: 'note-line' }, t('An add-on is a program: install only what you trust. It runs with the same rights as any script here.', '애드온은 프로그램입니다. 믿을 수 있는 것만 설치하세요. 여기서 실행되는 다른 스크립트와 같은 권한으로 실행됩니다.')),
        list,
        h('div', { className: 'btn-row', style: { marginTop: '6px' } }, button(t('Install from File...', '파일에서 설치...'), () => app.op('wm.addon_install'), { icon: 'import', testid: 'addon-install' })),
      ],
    });
  }
  app.openAddons = openAddons;

  function openKeymap() {
    const search = h('input', { className: 'search-input', placeholder: t('Search for an operator or a key', '연산자 또는 키로 검색'), dataset: { testid: 'keymap-search' }, spellcheck: false });
    const list = h('div', { className: 'keymap-list', dataset: { testid: 'keymap-list' } });
    let capturing = null;
    const apply = () => { applyKeymap(settings.keymap); saveSettings(); refill(); app.invalidate(); };
    const refill = () => {
      const needle = search.value.trim().toLowerCase();
      const rows = allOps().filter((op) => !op.props.some((p) => p.hidden && p.def === '') && (!needle || `${op.en} ${op.ko} ${op.id} ${op.key ?? ''}`.toLowerCase().includes(needle))).slice(0, 200);
      list.replaceChildren(...rows.map((op) => {
        const changed = settings.keymap[op.id] !== undefined;
        const clash = keyConflicts(op.id, op.key ?? '');
        return h('div', { className: `keymap-row${changed ? ' changed' : ''}` },
          h('span', { className: 'keymap-name', title: op.id }, nameOf(op)),
          clash.length && changed ? h('span', { className: 'keymap-clash', title: clash.join(', ') }, t('also on another', '다른 작업과 겹침')) : null,
          h('button', { type: 'button', className: `keymap-key${capturing === op.id ? ' capturing' : ''}`, dataset: { testid: `keymap-${op.id}` }, onClick: () => { capturing = op.id; refill(); } }, capturing === op.id ? t('Press a key...', '키를 누르세요...') : op.key ?? t('(none)', '(없음)')),
          changed ? h('button', { type: 'button', className: 'icon-btn', title: t(`Back to ${defaultKey(op.id) || 'none'}`, `${defaultKey(op.id) || '없음'}(으)로 되돌리기`), dataset: { testid: `keymap-reset-${op.id}` }, onClick: () => { delete settings.keymap[op.id]; apply(); } }, icon('undo', 11)) : null);
      }));
    };
    search.addEventListener('input', refill);
    const capture = (e) => {
      if (!capturing) return;
      const combo = comboFromEvent(e);
      if (!combo) return;
      e.preventDefault();
      e.stopPropagation();
      const id = capturing;
      capturing = null;
      if (combo !== 'Esc') settings.keymap[id] = combo === 'Backspace' ? '' : combo;
      apply();
    };
    refill();
    openDialog({
      id: 'keymap', title: t('Keymap', '단축키'), icon: 'settings', width: 620, height: 600,
      body: [search, list, h('div', { className: 'btn-row', style: { marginTop: '6px' } }, button(t('Reset All', '모두 되돌리기'), () => { settings.keymap = {}; apply(); }, { testid: 'keymap-reset-all' }))],
      onClose: () => { list.ownerDocument.defaultView.removeEventListener('keydown', capture, true); },
    }).then(() => list.ownerDocument.defaultView.addEventListener('keydown', capture, true));
  }
  app.openKeymap = openKeymap;

  async function openAbout() {
    const info = await appInfo();
    const built = info.buildTime ? new Date(info.buildTime * 1000) : new Date(__BUILD_TIME__);
    const rows = [
      [t('Version', '버전'), info.version],
      [t('Build', '빌드'), info.commit],
      [t('Built', '빌드 시각'), built.toLocaleString()],
      [t('Build Type', '빌드 종류'), info.profile ? `${info.profile} (${info.target})` : t('Web', '웹')],
      [t('Compiler', '컴파일러'), info.rustc],
      ['OS', [info.os, info.arch].filter(Boolean).join(' ')],
      [t('Runtime', '런타임'), info.tauri ? `Tauri ${info.tauri}` : t('Web browser', '웹 브라우저')],
      [t('Author', '제작자'), 'SHKWON(knix008@naver.com)'],
    ].filter(([, value]) => value);
    const c = coverage();
    openDialog({
      id: 'about', title: t('About', '정보'), icon: 'ed-info', width: 540, height: 362,
      body: h('div', { className: 'about', dataset: { testid: 'about-body' } },
        h('div', { className: 'about-head' },
          h('img', { src: './icon.png', alt: '', dataset: { testid: 'about-icon' } }),
          h('div', { className: 'about-text', dataset: { testid: 'about-text' } },
            h('h2', null, 'My3DBlender'),
            h('p', null, t('A 3D creation suite for Web, Windows, macOS and Linux', '웹·Windows·macOS·Linux용 3D 제작 도구')),
            h('p', { className: 'about-note' }, t('An independent program, inspired by Blender. Not made by or affiliated with the Blender Foundation.', 'Blender에서 영감을 받은 독립 프로그램이며, Blender Foundation과 관련이 없습니다.')))),
        h('div', { className: 'about-list', dataset: { testid: 'about-list' } }, rows.map(([key, value]) => h('div', { className: 'about-line' }, h('span', { className: 'about-key' }, key), h('span', null, value)))),
        h('div', { className: 'about-actions' }, button(t(`Feature coverage: ${c.percent}%`, `기능 구현 현황: ${c.percent}%`), () => openCoverage(), { testid: 'about-coverage' }))),
    });
    void openExternal;
  }

  function openCoverage() {
    const c = coverage();
    const label = { done: t('Done', '완료'), partial: t('Partial', '부분'), planned: t('Planned', '예정') };
    const groups = [];
    for (const a of c.areas) {
      groups.push(h('tr', { className: 'area-row' }, h('td', { colSpan: 2 }, `${t(a.area, AREA_KO[a.area] ?? a.area)}  (${a.done} / ${a.partial} / ${a.planned})`)));
      for (const f of FEATURES.filter((x) => x.area === a.area)) {
        groups.push(h('tr', { dataset: { feature: f.id } }, h('td', null, nameOf(f), f.note ? h('div', { className: 'note' }, f.note) : null), h('td', null, h('span', { className: `status-pill status-${f.status}` }, label[f.status]))));
      }
    }
    openDialog({
      id: 'coverage', title: t('Feature Coverage', '기능 구현 현황'), icon: 'ed-coverage', width: 760, height: 620,
      body: [
        h('div', { className: 'coverage-head' },
          h('span', { className: 'coverage-num', dataset: { testid: 'coverage-percent' } }, `${c.percent}%`),
          h('span', null, t(`${c.done} done, ${c.partial} partial, ${c.planned} planned, of ${c.total} functional areas. A partial feature counts as half.`, `전체 ${c.total}개 기능 영역 중 완료 ${c.done}, 부분 ${c.partial}, 예정 ${c.planned}. 부분 구현은 절반으로 계산합니다.`))),
        h('table', { className: 'feature-table', dataset: { testid: 'coverage-table' } }, h('tbody', null, groups)),
      ],
    });
  }
  const AREA_KO = { Interface: '화면', Files: '파일', Objects: '오브젝트', 'Mesh modeling': '메시 모델링', Modifiers: '모디파이어', 'Sculpt & Paint': '스컬프트와 페인트', 'UV & Images': 'UV와 이미지', Shading: '셰이딩', 'Geometry Nodes': '지오메트리 노드', Rendering: '렌더링', Animation: '애니메이션', Physics: '물리', 'Grease Pencil': '그리스 펜슬', Editors: '에디터' };

  async function requestClose() {
    if (app.isDirty()) {
      const answer = await ask({ title: t('Save changes?', '변경 내용을 저장할까요?'), message: t('This project has unsaved changes.', '저장하지 않은 변경 내용이 있습니다.'), buttons: [['save', t('Save', '저장'), true], ['discard', t("Don't Save", '저장 안 함')], ['cancel', t('Cancel', '취소')]] });
      if (answer === 'save') { const ok = await app.saveProject(); if (!ok) return; } else if (answer !== 'discard') return;
    }
    await quit();
  }

  // ── Keys
  let hoverArea = null;
  window.addEventListener('keydown', (e) => {
    const target = e.target;
    if (target.tagName === 'INPUT' && !target.readOnly && target.type !== 'checkbox' && target.type !== 'color') return;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
    if (menuOpen()) return;
    if (document.querySelector('.popup-backdrop:not(.modeless)')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    // Over the start screen, keys meant for a hidden 3D view (X deletes!) must not reach it.
    if (startScreen.isOpen() && !ctrl && !['F3', 'F11'].includes(e.key)) return;
    // The user's keymap comes first, unless a transform is waiting for its X, Y, Z or a number.
    if (Object.keys(settings.keymap ?? {}).length && !app.editorsOf('view3d').some((v) => v.api?.modal?.())) {
      const hit = lookupKey(settings.keymap, comboFromEvent(e), (id) => app.canRun(id));
      if (hit?.run) { stop(); app.op(hit.run); return; }
      if (hit?.swallow) { stop(); return; }
    }
    if (ctrl && key === 'z') { stop(); if (e.shiftKey) app.redo(); else app.undo(); return; }
    if (ctrl && key === 'y') { stop(); app.redo(); return; }
    if (ctrl && key === 's') { stop(); app.op(e.shiftKey ? 'wm.save_as' : 'wm.save'); return; }
    if (ctrl && key === 'o') { stop(); app.op('wm.open'); return; }
    if (ctrl && key === 'n') { stop(); app.op('wm.new'); return; }
    if (e.key === 'F3') { stop(); openSearch(); return; }
    if (e.key === 'F12') { stop(); app.op(e.ctrlKey ? 'render.animation' : 'render.render'); return; }
    if (e.key === 'F11') { stop(); import('../platform/native.js').then((m) => m.toggleFullscreen()); return; }
    if (ctrl && key === ' ') { stop(); const area = hoverArea ?? activeArea; if (area || maximized) toggleMaximize(maximized ?? area); return; }
    if (key === ' ' ) { stop(); app.togglePlay(); return; }
    if (e.key === 'ArrowLeft' && !ctrl) { stop(); app.setFrame(ctx.doc.frame - 1); return; }
    if (e.key === 'ArrowRight' && !ctrl) { stop(); app.setFrame(ctx.doc.frame + 1); return; }
    const area = hoverArea ?? activeArea;
    const editor = mounted.find((m) => m.area === area)?.instance ?? mounted.find((m) => m.area === activeArea)?.instance;
    if (editor?.onKey?.(e)) stop();
  });
  window.addEventListener('pointerdown', (e) => { pointerDown = e.target?.closest?.('.num-field, select') ?? null; }, true);
  window.addEventListener('pointerup', () => { if (pointerDown) { pointerDown = null; app.invalidate(); } }, true);
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) app.importDropped?.(file);
  });

  // ── Start
  registerUiOps(app);
  const startScreen = createStartScreen(app, {
    saveSettings,
    openDoc,
    recentFiles: () => (isTauri ? recentFiles() : []),
    setRecent: (list) => setRecentFiles(list),
    samples: () => app.openSamples(),
    startTutorial: () => app.startTutorial(),
    preferences: () => openSettings(),
    about: () => openAbout(),
    canExit: isTauri,
    exit: () => requestClose(),
    flag: () => (getLanguage() === 'ko' ? unionJack(16) : taegukgi(16)),
    toggleLanguage: () => flagButton.click(),
    themeName: (theme) => nameOfTheme(theme),
    applyTheme: () => applyTheme(),
    newProject: () => app.op('wm.new'),
    newEmpty: () => app.op('wm.new_empty'),
    open: () => app.op('wm.open'),
    openRecent: (path) => loadProjectText(app, path),
    openSample: (s) => app.openSample(s),
    importMenu: () => { const r = document.querySelector('[data-testid=start-import]').getBoundingClientRect(); openMenu(fileMenuItems(app).find((x) => x?.testid === 'menu-import').items, r.left, r.bottom); },
  });
  screenWrap.append(startScreen.root);
  startScreen.root.style.display = 'none';
  app.showStart = () => { startScreen.show(); startToggle.classList.add('active'); };
  app.hideStart = () => { if (startScreen.isOpen()) { startScreen.hide(); app.requestFrame(); app.invalidate(); } startToggle.classList.remove('active'); };
  /** Opens a sample as a new, unnamed-on-disk project; saving asks where. */
  app.openSample = async (sample) => {
    try {
      const response = await fetch(`./sample/${sample.file}`);
      if (!response.ok) throw new Error(`${sample.file}: ${response.status}`);
      app.replaceDocument(await response.text(), true);
      app.projectPath = null;
      app.projectName = sample.file.split('/').pop();
      app.images = await decodeImages(ctx.doc, app.images);
      app.fileSaved();
      if (sample.workspace) app.setWorkspace(sample.workspace);
      app.hideStart();
      const words = getLanguage() === 'en' ? sample.tryThis.en : sample.tryThis.ko;
      app.log(words, 'report');
      app.status(words);
      if (sample.bake) app.op('ptcache.bake_all');
    } catch (error) {
      showError(t('Could not open the sample', '샘플을 열 수 없습니다'), error?.message ?? error);
    }
  };
  app.openSamples = () => {
    const state = { level: 'all' };
    const browser = sampleBrowser(app, state, { onOpen: (s) => { closeAllDialogs(); app.openSample(s); } });
    openDialog({ id: 'samples', title: t('Sample Projects', '샘플 프로젝트'), icon: 'samples', width: 980, height: 720, body: h('div', { className: 'sample-dialog', dataset: { testid: 'sample-dialog' } }, browser.chips, browser.grid) });
  };
  settings.addons = { enabled: [], user: [], ...settings.addons };
  startAddons();
  applyKeymap(settings.keymap);
  appEl.append(topbar, wsBar, screenWrap, statusbar);
  layouts.layout = workspaceById('layout').make();
  buildTabs();
  applyTheme();
  buildStatusHints();
  buildTopbar();
  buildScreen();
  app.invalidate();
  app.savedRev = history.current.text;
  updateTitle();
  if (isTauri && (settings.uiScale ?? 1) !== 1) setUiZoom(settings.uiScale).then(() => updateMinWidth());
  applyPreferences();
  if (settings.showStart !== false) app.showStart();
  if (settings.askTutorial !== false) app.askTutorial();

  if (isTauri) {
    onCloseRequested(() => requestClose());
    onMaximizedChange((isMax) => maxBtn.replaceChildren(icon(isMax ? 'restore' : 'maximize', 12)));
    startupFiles().then(async (files) => {
      if (files[0]) { await loadProjectText(app, files[0]); app.hideStart(); }
    });
  } else {
    onCloseRequested((asking) => asking && app.isDirty());
  }
  requestAnimationFrame(() => requestAnimationFrame(() => windowReady()));
  setLanguageNative(settings.language);

  // Test and script access.
  app.closeMenus = closeMenus;
  app.closeAllDialogs = closeAllDialogs;
  app.query = queryAll;
  app.dialogDocuments = dialogDocuments;
  window.__my3d = app;
  void h; void openExternal;
  return app;
}
