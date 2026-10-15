// FreeCAD's Std commands that MyCAD did not have yet: standard views and
// cameras, visibility and appearance, selection history, windows, document
// tools and help. Each entry is a command of app.js's table (icon, label,
// enabled, run); `app` gives the app's state and functions.
import './std-icons.js';
import { newId } from '../domain/entities.js';
import { groupTree, variableScope } from '../domain/docextras.js';

// ───────────────────────── icons (24 × 24, stroked like the others)


// ───────────────────────── the commands

/** Unit names → mm per unit for the units calculator (lengths) and the other kinds it knows. */
const UNIT_KINDS = {
  length: { mm: 1, cm: 10, m: 1000, km: 1e6, um: 0.001, in: 25.4, ft: 304.8, yd: 914.4, mi: 1609344 },
  angle: { deg: 1, rad: 180 / Math.PI, grad: 0.9, arcmin: 1 / 60, arcsec: 1 / 3600 },
  mass: { kg: 1, g: 0.001, t: 1000, lb: 0.45359237, oz: 0.028349523125 },
  force: { N: 1, kN: 1000, lbf: 4.4482216152605, kgf: 9.80665 },
  pressure: { Pa: 1, kPa: 1000, MPa: 1e6, GPa: 1e9, bar: 1e5, psi: 6894.757293168, atm: 101325 },
  area: { 'mm²': 1, 'cm²': 100, 'm²': 1e6, 'in²': 645.16, 'ft²': 92903.04 },
  volume: { 'mm³': 1, 'cm³': 1000, L: 1e6, 'm³': 1e9, 'in³': 16387.064, gal: 3785411.784 },
  temperature: { '°C': 'c', K: 'k', '°F': 'f' },
};

/** Converts a value between units of one kind; temperatures are offset scales. */
export function convertUnit(kind, value, from, to) {
  const table = UNIT_KINDS[kind];
  if (!table || !(from in table) || !(to in table)) return NaN;
  if (kind === 'temperature') {
    const kelvin = from === 'K' ? value : from === '°C' ? value + 273.15 : (value - 32) * (5 / 9) + 273.15;
    return to === 'K' ? kelvin : to === '°C' ? kelvin - 273.15 : (kelvin - 273.15) * (9 / 5) + 32;
  }
  return (value * table[from]) / table[to];
}
export const UNIT_KIND_NAMES = Object.keys(UNIT_KINDS);
export const unitsOf = (kind) => Object.keys(UNIT_KINDS[kind] ?? {});

/** A random but readable colour (not too dark, not grey). */
export function randomColor(random = Math.random) {
  const h = random() * 360;
  const s = 0.55 + random() * 0.35;
  const l = 0.45 + random() * 0.15;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round((l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))) * 255);
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** "a = 12 mm" lines ↔ variables. */
export function parseVariables(text) {
  const variables = [];
  const errors = [];
  for (const [index, raw] of String(text ?? '').split('\n').entries()) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(-?[\d.]+(?:e[+-]?\d+)?)\s*([^\s]*)$/i);
    if (!m || !Number.isFinite(Number(m[2]))) { errors.push(index + 1); continue; }
    variables.push({ name: m[1], value: Number(m[2]), unit: m[3] ?? '' });
  }
  return { variables, errors };
}
export const formatVariables = (variables) => variables.map((v) => `${v.name} = ${v.value}${v.unit ? ` ${v.unit}` : ''}`).join('\n');

/** Help links: MyCAD's own pages (FreeCAD's website, forum and issue tracker). */
export const HELP_LINKS = {
  website: 'https://github.com/knix008/TestSimulator',
  forum: 'https://github.com/knix008/TestSimulator/discussions',
  reportBug: 'https://github.com/knix008/TestSimulator/issues',
};

export function stdCommands(app) {
  const { t, state } = app;
  const hasDoc = () => Boolean(app.activeDoc());
  const hasSelection = () => state.selection.size > 0;
  const v = () => app.view3d.instance;
  /** The 3D view, switched on if needed. */
  const view3d = async () => { if (!state.view3d) await app.toggle3d(true); return v(); };
  const inView = (fn) => async () => { const view = await view3d(); if (view) fn(view); };
  const selectedOrAll = () => (hasSelection() ? app.selectedIds() : []);
  const editEntities = (labelKey, ids, patch) => app.change(labelKey, (d) => {
    for (const id of ids) {
      const entity = app.D.findEntity(d, id);
      if (entity) app.D.updateEntity(d, id, typeof patch === 'function' ? patch(entity) : patch);
    }
  });

  const views = [
    ['viewFront', 'front', '1'], ['viewTop', 'top', '2'], ['viewRight', 'right', '3'], ['viewRear', 'rear', '4'], ['viewBottom', 'bottom', '5'],
    ['viewLeft', 'left', '6'], ['viewIsometric', 'iso', '0'], ['viewDimetric', 'dimetric', ''], ['viewTrimetric', 'trimetric', ''], ['viewHome', 'home', ''],
  ];
  const viewIcons = { front: 'viewFront', top: 'viewTop', right: 'viewRight', rear: 'viewRear', bottom: 'viewBottom', left: 'viewLeft', iso: 'viewIso', dimetric: 'viewDimetric', trimetric: 'viewTrimetric', home: 'viewHome' };

  const stereo = (mode) => ({
    icon: 'stereo', label: `std.stereo.${mode}`, enabled: hasDoc,
    checked: () => (v()?.stereo ?? 'off') === mode,
    run: inView((view) => view.setStereo(mode)),
  });

  const commands = {
    ...Object.fromEntries(views.map(([id, preset]) => [id, { icon: viewIcons[preset], label: `std.${id}`, enabled: hasDoc, run: inView((view) => view.view(preset)) }])),
    viewRotateLeft: { icon: 'viewRotateLeft', label: 'std.viewRotateLeft', enabled: hasDoc, run: inView((view) => view.rotateView(-90)) },
    viewRotateRight: { icon: 'viewRotateRight', label: 'std.viewRotateRight', enabled: hasDoc, run: inView((view) => view.rotateView(90)) },
    viewFitSelection: {
      icon: 'fitSelection', label: 'std.viewFitSelection', enabled: hasSelection,
      run: async () => {
        if (!state.view3d) return app.zoomToSelection();
        const box = v().boundsOf(new Set(app.selectedIds()));
        if (box.isEmpty()) return app.notify('info', t('std.nothingIn3d'));
        return v().fitBox(box);
      },
    },
    viewBoxZoom: {
      icon: 'boxZoom', label: 'std.viewBoxZoom', enabled: hasDoc,
      run: async () => { if (!state.view3d) return app.startBoxZoom2d(); app.notify('info', t('std.boxZoomHint')); return v().startBoxZoom(); },
    },
    cameraOrtho: { icon: 'cameraOrtho', label: 'std.cameraOrtho', enabled: hasDoc, checked: () => Boolean(v()?.camera.isOrthographicCamera), run: inView((view) => { view.setProjection('ortho'); app.renderToolbarState(); }) },
    cameraPerspective: { icon: 'cameraPerspective', label: 'std.cameraPerspective', enabled: hasDoc, checked: () => Boolean(v() && !v().camera.isOrthographicCamera), run: inView((view) => { view.setProjection('perspective'); app.renderToolbarState(); }) },
    viewSaveCamera: { icon: 'cameraSave', label: 'std.viewSaveCamera', enabled: hasDoc, run: inView((view) => { state.savedCamera = view.getCamera(); app.notify('success', t('std.cameraSaved')); }) },
    viewRestoreCamera: { icon: 'cameraRestore', label: 'std.viewRestoreCamera', enabled: () => hasDoc() && Boolean(state.savedCamera), run: inView((view) => view.setCamera(state.savedCamera)) },
    storeWorkingView: {
      icon: 'cameraSave', label: 'std.storeWorkingView', enabled: hasDoc,
      run: inView((view) => { const camera = view.getCamera(); app.change('std.op.workingView', (d) => { d.workingView = camera; }); app.notify('success', t('std.workingViewStored')); }),
    },
    recallWorkingView: { icon: 'cameraRestore', label: 'std.recallWorkingView', enabled: () => Boolean(app.activeDrawing()?.workingView), run: inView((view) => view.setCamera(app.activeDrawing().workingView)) },
    freezeViews: { icon: 'views', label: 'std.freezeViews', enabled: hasDoc, run: () => freezeViewsDialog() },
    axisCross: {
      icon: 'axisCross', label: 'std.axisCross', enabled: hasDoc, checked: () => v()?.options.axes !== false,
      run: inView((view) => { view.setOption('axes', view.options.axes === false); app.renderToolbarState(); }),
    },
    clipPlane: { icon: 'clipPlane', label: 'std.clipPlane', enabled: hasDoc, checked: () => Boolean(v()?.renderer.clippingPlanes.length), run: () => clipDialog() },
    demoMode: { icon: 'turntable', label: 'std.demoMode', enabled: hasDoc, checked: () => Boolean(v()?.turntable), run: () => turntableDialog() },
    'stereo:off': stereo('off'), 'stereo:anaglyph': stereo('anaglyph'), 'stereo:rows': stereo('rows'), 'stereo:columns': stereo('columns'), 'stereo:sideBySide': stereo('sideBySide'),
    issueCameraPosition: {
      icon: 'cameraPosition', label: 'std.issueCameraPosition', enabled: hasDoc,
      run: inView((view) => {
        const c = view.getCamera();
        const text = `camera position=(${c.position.join(', ')}) target=(${c.target.join(', ')}) up=(${c.up.join(', ')}) projection=${c.projection}`;
        app.consolePrint?.(text);
        app.copyText(text);
        app.notify('info', t('std.cameraIssued'));
      }),
    },
    selectionBox: {
      icon: 'selectionBox', label: 'std.selectionBox', enabled: hasDoc, checked: () => Boolean(v()?.options.selectionBox),
      run: inView((view) => { view.setOption('selectionBox', !view.options.selectionBox); app.rebuild3d(); app.renderToolbarState(); }),
    },

    // ── visibility and appearance
    hideSelection: { icon: 'hideSelection', label: 'std.hideSelection', enabled: hasSelection, run: () => editEntities('std.op.hide', app.selectedIds(), { hidden: true }) },
    showSelection: { icon: 'showSelection', label: 'std.showSelection', enabled: hasSelection, run: () => editEntities('std.op.show', app.selectedIds(), { hidden: false }) },
    toggleVisibility: { icon: 'toggleVisibility', label: 'std.toggleVisibility', enabled: hasSelection, run: () => editEntities('std.op.toggleVisibility', app.selectedIds(), (e) => ({ hidden: !e.hidden })) },
    hideAll: { icon: 'hideAll', label: 'std.hideAll', enabled: hasDoc, run: () => editEntities('std.op.hide', app.activeDrawing().entities.map((e) => e.id), { hidden: true }) },
    showAll: { icon: 'showAll', label: 'std.showAll', enabled: hasDoc, run: () => editEntities('std.op.show', app.activeDrawing().entities.filter((e) => e.hidden).map((e) => e.id), { hidden: false }) },
    toggleAll: { icon: 'toggleAll', label: 'std.toggleAll', enabled: hasDoc, run: () => editEntities('std.op.toggleVisibility', app.activeDrawing().entities.map((e) => e.id), (e) => ({ hidden: !e.hidden })) },
    selectVisible: {
      icon: 'selectVisible', label: 'std.selectVisible', enabled: hasDoc,
      run: () => { const d = app.activeDrawing(); app.select(d.entities.filter((e) => app.D.isVisible(d, e)).map((e) => e.id)); },
    },
    toggleSelectability: {
      icon: 'selectability', label: 'std.toggleSelectability', enabled: hasSelection,
      run: () => { const ids = app.selectedIds(); editEntities('std.op.selectability', ids, (e) => ({ unselectable: !e.unselectable })); app.select([]); app.notify('info', t('std.selectabilityChanged', { count: ids.length })); },
    },
    randomColor: { icon: 'randomColor', label: 'std.randomColor', enabled: hasSelection, run: () => editEntities('std.op.color', app.selectedIds(), () => ({ color: randomColor() })) },
    toggleTransparency: {
      icon: 'transparency', label: 'std.toggleTransparency', enabled: hasSelection,
      run: () => editEntities('std.op.transparency', app.selectedIds(), (e) => ({ transparency: e.transparency ? 0 : 50 })),
    },
    appearance: { icon: 'appearance', label: 'std.appearance', enabled: hasSelection, run: () => appearanceDialog() },

    // ── selection history
    selectionBack: { icon: 'selectionBack', label: 'std.selectionBack', enabled: () => (state.selHistory?.at ?? 0) > 0, run: () => app.selectionStep(-1) },
    selectionForward: { icon: 'selectionForward', label: 'std.selectionForward', enabled: () => state.selHistory && state.selHistory.at < state.selHistory.list.length - 1, run: () => app.selectionStep(1) },

    // ── windows
    closeAll: { icon: 'closeAll', label: 'std.closeAll', enabled: hasDoc, run: async () => { for (const doc of [...state.docs]) if (!(await app.closeDoc(doc))) break; } },
    windows: { icon: 'windows', label: 'std.windows', enabled: () => state.docs.length > 0, run: () => windowsDialog() },
    fullscreen: { icon: 'fullscreen', label: 'std.fullscreen', key: 'F11', checked: () => Boolean(state.fullscreen), run: () => app.setFullscreen(!state.fullscreen) },
    focusView: { icon: 'focusView', label: 'std.focusView', checked: () => Boolean(state.focusView), run: () => app.setFocusView(!state.focusView) },

    // ── document
    revert: { icon: 'revert', label: 'std.revert', enabled: () => Boolean(app.activeDoc()?.path), run: () => app.revertDoc() },
    saveCopy: { icon: 'saveCopy', label: 'std.saveCopy', enabled: hasDoc, run: () => app.saveCopy() },
    mergeDocument: { icon: 'merge', label: 'std.mergeDocument', enabled: hasDoc, run: () => app.mergeDocument() },
    recompute: { icon: 'recompute', label: 'std.recompute', enabled: hasDoc, run: () => app.recompute() },
    skipRecompute: { icon: 'skipRecompute', label: 'std.skipRecompute', checked: () => Boolean(state.skipRecompute), run: () => { state.skipRecompute = !state.skipRecompute; if (!state.skipRecompute) app.recompute(); app.renderToolbarState(); app.notify('info', t(state.skipRecompute ? 'std.recomputeSkipped' : 'std.recomputeOn')); } },
    toggleFreeze: {
      icon: 'freeze', label: 'std.toggleFreeze', enabled: hasSelection,
      run: () => editEntities('std.op.freeze', app.selectedIds(), (e) => ({ frozen: !e.frozen })),
    },
    newGroup: { icon: 'group', label: 'std.newGroup', enabled: hasDoc, run: () => app.newGroup({ part: false }) },
    newPart: { icon: 'part', label: 'std.newPart', enabled: hasDoc, run: () => app.newGroup({ part: true }) },
    textDocument: { icon: 'textDocument', label: 'std.textDocument', enabled: hasDoc, run: () => textDocumentDialog() },
    varSet: { icon: 'varSet', label: 'std.varSet', enabled: hasDoc, run: () => varSetDialog() },
    unitsCalculator: { icon: 'unitsCalculator', label: 'std.unitsCalculator', run: () => unitsDialog() },
    dependencyGraph: { icon: 'dependencyGraph', label: 'std.dependencyGraph', enabled: hasDoc, run: () => app.dependencyGraph() },

    // ── help
    whatsThis: { icon: 'whatsThis', label: 'std.whatsThis', run: () => app.startWhatsThis() },
    website: { icon: 'web', label: 'std.website', run: () => app.openUrl(HELP_LINKS.website) },
    forum: { icon: 'forum', label: 'std.forum', run: () => app.openUrl(HELP_LINKS.forum) },
    reportBug: { icon: 'bug', label: 'std.reportBug', run: () => app.openUrl(HELP_LINKS.reportBug) },
    usersGuide: { icon: 'book', label: 'std.usersGuide', run: () => app.openDocument('UsersGuide.md') },
    devHandbook: { icon: 'book', label: 'std.devHandbook', run: () => app.openDocument('Architecture.md') },
    libraries: { icon: 'libraries', label: 'std.libraries', run: () => librariesDialog() },
    pythonHelp: { icon: 'python', label: 'std.pythonHelp', run: () => pythonHelpDialog() },
    macroFolder: { icon: 'macroFolder', label: 'std.macroFolder', run: () => app.openMacroFolder() },
    sendToConsole: {
      icon: 'console', label: 'std.sendToConsole', enabled: hasSelection,
      run: () => app.sendToConsole(app.selectedIds()),
    },
  };

  // ───────────────────────── dialogs

  async function freezeViewsDialog() {
    const d = app.activeDrawing();
    const list = (d.views ?? []).map((view, index) => [String(index), view.name, t('std.restore')]);
    const onPick = async ({ value }) => { const view = app.activeDrawing().views?.[Number(value)]; if (view) (await view3d())?.setCamera(view.camera); };
    const answer = await app.form({
      title: t('std.freezeViews'), icon: 'views', width: 520,
      fields: [
        { key: 'views', type: 'list', label: t('std.savedViews'), icon: 'views', options: list, empty: t('std.noViews') },
        { key: 'name', type: 'text', label: t('std.viewName'), icon: 'edit', value: t('std.viewN', { n: list.length + 1 }) },
      ],
      actions: [{ id: 'clear', label: t('std.clearViews'), icon: 'trash', danger: true }, { id: 'save', label: t('std.saveView'), icon: 'cameraSave', primary: true }],
    }, { onPick });
    if (answer?.action === 'save') {
      const camera = (await view3d())?.getCamera();
      if (camera) app.change('std.op.views', (dr) => { dr.views = [...(dr.views ?? []), { name: answer.values.name || t('std.viewN', { n: (dr.views?.length ?? 0) + 1 }), camera }]; });
    } else if (answer?.action === 'clear') app.change('std.op.views', (dr) => { delete dr.views; });
  }

  async function clipDialog() {
    const view = await view3d();
    if (!view) return;
    const b = view.bounds;
    const mid = (axis) => (b ? (b.min[axis] + b.max[axis]) / 2 : 0);
    const current = view.clipping ?? {};
    const field = (axis) => [
      { key: `${axis}On`, type: 'check', label: t(`std.clip.${axis}`), icon: 'clipPlane', value: Boolean(current[axis]?.on) },
      { key: `${axis}Offset`, type: 'range', label: t('std.clip.offset', { axis: axis.toUpperCase() }), icon: 'move', value: Math.round(current[axis]?.offset ?? mid(axis)), min: Math.floor(b?.min[axis] ?? -100), max: Math.ceil(b?.max[axis] ?? 100), step: 1, unit: 'mm' },
      { key: `${axis}Flip`, type: 'check', label: t('std.clip.flip'), icon: 'mirror', value: Boolean(current[axis]?.flip) },
    ];
    const apply = (values) => view.setClipping({
      x: { on: values.xOn, offset: values.xOffset, flip: values.xFlip }, y: { on: values.yOn, offset: values.yOffset, flip: values.yFlip },
      z: { on: values.zOn, offset: values.zOffset, flip: values.zFlip }, view: { on: values.viewOn, offset: values.viewOffset },
    });
    const answer = await app.form({
      title: t('std.clipPlane'), icon: 'clipPlane', width: 560, live: true,
      fields: [...field('x'), ...field('y'), ...field('z'),
        { key: 'viewOn', type: 'check', label: t('std.clip.view'), icon: 'eye', value: Boolean(current.view?.on) },
        { key: 'viewOffset', type: 'range', label: t('std.clip.viewOffset'), icon: 'move', value: current.view?.offset ?? 0, min: -Math.ceil(view.size), max: Math.ceil(view.size), step: 1, unit: 'mm' }],
      actions: [{ id: 'off', label: t('std.clip.off'), icon: 'close' }, { id: 'ok', label: t('confirm.ok'), primary: true }],
    }, { onChange: ({ values }) => apply(values) });
    if (answer?.action === 'off') view.setClipping(null);
    else if (answer) apply(answer.values);
    app.renderToolbarState();
  }

  async function turntableDialog() {
    const view = await view3d();
    if (!view) return;
    const apply = (values) => view.setTurntable(values.on, values.speed);
    const answer = await app.form({
      title: t('std.demoMode'), icon: 'turntable', width: 480, live: true,
      fields: [
        { key: 'on', type: 'check', label: t('std.demo.on'), icon: 'play', value: !view.turntable },
        { key: 'speed', type: 'range', label: t('std.demo.speed'), icon: 'clock', value: view.turntable?.speed ?? 2, min: 0.5, max: 20, step: 0.5 },
      ],
      actions: [{ id: 'ok', label: t('confirm.ok'), primary: true }],
    }, { onChange: ({ values }) => apply(values) });
    if (answer) apply(answer.values);
    app.renderToolbarState();
  }

  async function appearanceDialog() {
    const ids = app.selectedIds();
    const d = app.activeDrawing();
    const first = app.D.findEntity(d, ids[0]);
    const style = app.D.styleOf(d, first);
    const answer = await app.form({
      title: t('std.appearance'), icon: 'appearance', width: 520,
      fields: [
        { key: 'color', type: 'color', label: t('prop.color'), icon: 'palette', value: first.color ?? (style.color?.startsWith('#') ? style.color : '#808080') },
        { key: 'byLayer', type: 'check', label: t('std.colorByLayer'), icon: 'layers', value: !first.color },
        { key: 'transparency', type: 'range', label: t('std.transparency'), icon: 'opacity', value: first.transparency ?? 0, min: 0, max: 90, step: 5, unit: '%' },
        { key: 'lineWidth', type: 'number', label: t('std.lineWidth'), icon: 'line', value: first.lineWidth ?? style.lineWidth ?? 0.25, min: 0.05, max: 5, step: 0.05, unit: 'mm' },
        { key: 'pointSize', type: 'number', label: t('std.pointSize'), icon: 'dot', value: first.pointSize ?? 3, min: 1, max: 20, step: 1, unit: 'px' },
      ],
      actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }],
    });
    if (answer?.action !== 'ok') return;
    const { values } = answer;
    editEntities('std.op.appearance', ids, () => ({ color: values.byLayer ? null : values.color, transparency: values.transparency, lineWidth: values.lineWidth, pointSize: values.pointSize }));
  }

  async function windowsDialog() {
    const options = state.docs.map((doc) => [doc.id, `${app.docName(doc)}${doc.dirty ? ' •' : ''}${doc.id === state.active ? `  (${t('std.active')})` : ''}`, t('std.activate')]);
    await app.form({ title: t('std.windows'), icon: 'windows', width: 560, fields: [{ key: 'docs', type: 'list', label: t('std.openWindows'), icon: 'drawing', options }], actions: [{ id: 'ok', label: t('error.close') }] }, { onPick: ({ value }) => { app.activateDoc(value); app.popups.close('form'); } });
  }

  async function textDocumentDialog() {
    const d = app.activeDrawing();
    const docs = d.textDocs ?? [];
    const chosen = docs[0] ?? null;
    const answer = await app.form({
      title: t('std.textDocument'), icon: 'textDocument', width: 640,
      fields: [
        ...(docs.length > 1 ? [{ key: 'which', type: 'select', label: t('std.textDocumentPick'), icon: 'list', value: chosen.id, options: docs.map((doc) => [doc.id, doc.name]) }] : []),
        { key: 'name', type: 'text', label: t('std.textDocumentName'), icon: 'edit', value: chosen?.name ?? t('std.textDocumentDefault') },
        { key: 'text', type: 'textarea', label: t('std.textDocumentText'), icon: 'text', value: chosen?.text ?? '', rows: 12 },
      ],
      actions: [...(chosen ? [{ id: 'delete', label: t('delete'), icon: 'trash', danger: true }, { id: 'new', label: t('std.textDocumentNew'), icon: 'plus' }] : []), { id: 'save', label: t('confirm.ok'), primary: true }],
    });
    if (!answer) return;
    const id = answer.values.which ?? chosen?.id;
    app.change('std.op.textDocument', (dr) => {
      const list = dr.textDocs ?? [];
      if (answer.action === 'delete') dr.textDocs = list.filter((doc) => doc.id !== id);
      else if (answer.action === 'new' || !chosen) dr.textDocs = [...list, { id: newId(), name: answer.action === 'new' ? t('std.textDocumentDefault') : answer.values.name, text: answer.action === 'new' ? '' : answer.values.text }];
      else dr.textDocs = list.map((doc) => (doc.id === id ? { ...doc, name: answer.values.name || doc.name, text: answer.values.text } : doc));
      if (!dr.textDocs.length) delete dr.textDocs;
    });
    if (answer.action === 'new') textDocumentDialog();
  }

  async function varSetDialog() {
    const d = app.activeDrawing();
    const set = d.varSets?.[0] ?? { id: newId(), name: 'VarSet', variables: [] };
    const answer = await app.form({
      title: t('std.varSet'), icon: 'varSet', width: 600, intro: t('std.varSetIntro'),
      fields: [
        { key: 'name', type: 'text', label: t('std.varSetName'), icon: 'edit', value: set.name },
        { key: 'text', type: 'textarea', label: t('std.varSetVariables'), icon: 'varSet', value: formatVariables(set.variables), rows: 10 },
      ],
      actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }],
    });
    if (answer?.action !== 'ok') return;
    const { variables, errors } = parseVariables(answer.values.text);
    if (errors.length) app.notify('warning', t('std.varSetErrors', { lines: errors.join(', ') }));
    app.change('std.op.varSet', (dr) => {
      const next = { id: set.id, name: (answer.values.name || 'VarSet').replace(/[^A-Za-z0-9_]/g, '_'), variables };
      dr.varSets = [next, ...(dr.varSets ?? []).filter((s) => s.id !== set.id)];
      if (!variables.length) dr.varSets = dr.varSets.filter((s) => s.variables.length);
      if (!dr.varSets.length) delete dr.varSets;
    });
    app.setExpressionScope(variableScope(app.activeDrawing()));
  }

  async function unitsDialog() {
    const result = (values) => {
      const value = convertUnit(values.kind, Number(values.value), values.from, values.to);
      return Number.isFinite(value) ? `${+value.toPrecision(10)} ${values.to}` : t('std.units.mismatch');
    };
    let kind = 'length';
    const fields = (values) => [
      { key: 'kind', type: 'select', label: t('std.units.kind'), icon: 'list', value: values.kind, options: UNIT_KIND_NAMES.map((k) => [k, t(`std.units.${k}`)]) },
      { key: 'value', type: 'number', label: t('std.units.value'), icon: 'unitsCalculator', value: values.value, step: 'any' },
      { key: 'from', type: 'select', label: t('std.units.from'), icon: 'arrowRight', value: values.from, options: unitsOf(values.kind).map((u) => [u, u]) },
      { key: 'to', type: 'select', label: t('std.units.to'), icon: 'arrowLeft', value: values.to, options: unitsOf(values.kind).map((u) => [u, u]) },
      { key: 'result', type: 'info', label: t('std.units.result'), icon: 'check', value: result(values) },
    ];
    const start = { kind, value: 1, from: 'in', to: 'mm' };
    const onChange = ({ values }) => {
      if (values.kind !== kind) {
        kind = values.kind;
        const units = unitsOf(kind);
        app.popups.post('form', { type: 'form:fields', fields: fields({ ...values, from: units[0], to: units[1] ?? units[0] }) });
        return;
      }
      app.popups.post('form', { type: 'form:set', key: 'result', value: result(values) });
    };
    await app.form({ title: t('std.unitsCalculator'), icon: 'unitsCalculator', width: 520, live: true, fields: fields(start), actions: [{ id: 'ok', label: t('error.close'), primary: true }] }, { onChange });
  }

  async function librariesDialog() {
    const info = await app.libraryVersions();
    await app.form({
      title: t('std.libraries'), icon: 'libraries', width: 600, intro: t('std.librariesIntro'),
      fields: info.map(([name, version, what]) => ({ key: name, type: 'info', label: name, icon: 'libraries', value: `${version} — ${what}` })),
      actions: [{ id: 'ok', label: t('error.close'), primary: true }],
    });
  }

  async function pythonHelpDialog() {
    const text = await app.pythonModulesText();
    await app.form({ title: t('std.pythonHelp'), icon: 'python', width: 760, fields: [{ key: 'text', type: 'textarea', label: t('std.pythonModules'), icon: 'python', value: text, rows: 18, readonly: true }], actions: [{ id: 'ok', label: t('error.close'), primary: true }] });
  }

  void groupTree;
  void selectedOrAll;
  return commands;
}

/** The FreeCAD command for each new MyCAD command id (merged into the coverage map). */
export const STD_FREECAD = {
  Std_ViewFront: 'viewFront', Std_ViewTop: 'viewTop', Std_ViewRight: 'viewRight', Std_ViewRear: 'viewRear', Std_ViewBottom: 'viewBottom', Std_ViewLeft: 'viewLeft',
  Std_ViewIsometric: 'viewIsometric', Std_ViewDimetric: 'viewDimetric', Std_ViewTrimetric: 'viewTrimetric', Std_ViewHome: 'viewHome',
  Std_ViewRotateLeft: 'viewRotateLeft', Std_ViewRotateRight: 'viewRotateRight', Std_ViewFitSelection: 'viewFitSelection', Std_ViewBoxZoom: 'viewBoxZoom',
  Std_OrthographicCamera: 'cameraOrtho', Std_PerspectiveCamera: 'cameraPerspective', Std_ViewSaveCamera: 'viewSaveCamera', Std_ViewRestoreCamera: 'viewRestoreCamera',
  Std_StoreWorkingView: 'storeWorkingView', Std_RecallWorkingView: 'recallWorkingView', Std_FreezeViews: 'freezeViews', Std_AxisCross: 'axisCross',
  Std_ToggleClipPlane: 'clipPlane', Std_DemoMode: 'demoMode', Std_ViewIvStereoOff: 'stereo:off', Std_ViewIvStereoRedGreen: 'stereo:anaglyph',
  Std_ViewIvStereoInterleavedRows: 'stereo:rows', Std_ViewIvStereoInterleavedColumns: 'stereo:columns', Std_ViewIvStereoQuadBuff: 'stereo:sideBySide',
  Std_ViewIvIssueCamPos: 'issueCameraPosition', Std_SelBoundingBox: 'selectionBox',
  Std_HideSelection: 'hideSelection', Std_ShowSelection: 'showSelection', Std_ToggleVisibility: 'toggleVisibility', Std_HideObjects: 'hideAll',
  Std_ShowObjects: 'showAll', Std_ToggleObjects: 'toggleAll', Std_SelectVisibleObjects: 'selectVisible', Std_ToggleSelectability: 'toggleSelectability',
  Std_RandomColor: 'randomColor', Std_ToggleTransparency: 'toggleTransparency', Std_SetAppearance: 'appearance', Std_SelBack: 'selectionBack', Std_SelForward: 'selectionForward',
  Std_CloseAllWindows: 'closeAll', Std_Windows: 'windows', Std_WindowsMenu: 'windows', Std_MainFullscreen: 'fullscreen', Std_ViewFullscreen: 'focusView',
  Std_Revert: 'revert', Std_SaveCopy: 'saveCopy', Std_MergeProjects: 'mergeDocument', Std_Recompute: 'recompute', Std_Refresh: 'recompute',
  Std_ToggleSkipRecompute: 'skipRecompute', Std_ToggleFreeze: 'toggleFreeze', Std_Group: 'newGroup', Std_Part: 'newPart', Std_TextDocument: 'textDocument',
  Std_VarSet: 'varSet', Std_UnitsCalculator: 'unitsCalculator', Std_DependencyGraph: 'dependencyGraph', Std_ExportDependencyGraph: 'dependencyGraph',
  Std_WhatsThis: 'whatsThis', Std_FreeCADWebsite: 'website', Std_OnlineHelpWebsite: 'website', Std_FreeCADForum: 'forum', Std_ReportBug: 'reportBug',
  Std_FreeCADUserHub: 'usersGuide', Std_DevHandbook: 'devHandbook', Std_AboutQt: 'libraries', Std_PythonHelp: 'pythonHelp', Std_OpenMacrosFolder: 'macroFolder',
  Std_SendToPythonConsole: 'sendToConsole',
};
