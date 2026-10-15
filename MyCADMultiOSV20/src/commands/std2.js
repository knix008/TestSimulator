// FreeCAD Std commands, second part: the model tree, links, edit modes and
// transforms, alignment, element and clarify selection, expressions, materials
// and textures, parameters and customising, toolbars and panel overlays,
// workbenches, extra 3D windows, VR, PDF and document utilities.
import './std2-icons.js';
import { instancesOf, treeKeys, TREE_OPTIONS } from '../view/modeltree.js';
import { bestFit, transformPlacement, rotationOf } from '../domain/transform3d.js';
import { MATERIAL_FIELDS, MATERIAL_UNITS, MATERIALS, materialName, normalizeCustomMaterials, normalizeMaterial } from '../domain/materials.js';
import { newId } from '../domain/entities.js';


/** Which left-panel sections each workbench shows (Std_Workbench). */
export const WORKBENCHES = {
  all: null,
  part: ['solids', 'solidOps', 'draw', 'modify'],
  partdesign: ['sketch', 'draw', 'solids', 'solidOps'],
  sketcher: ['sketch', 'draw', 'modify'],
  draft: ['draw', 'dims', 'modify', 'layers'],
  techdraw: ['dims', 'draw', 'solidOps'],
  bim: ['arch', 'building', 'draw', 'layers'],
  fem: ['solidOps', 'solids'],
  cam: ['solidOps', 'draw'],
  mesh: ['solidOps', 'solids'],
  assembly: ['solids', 'solidOps'],
  parts: ['parts', 'draw'],
};

/** Overlay panels (Std_DockOverlay*): sides that float over the drawing, and how. */
export const OVERLAY_SIDES = ['left', 'right', 'top', 'bottom'];

export function std2Commands(app) {
  const { t, state } = app;
  const hasDoc = () => Boolean(app.activeDoc());
  const hasSelection = () => state.selection.size > 0;
  const v = () => app.view3d.instance;
  const settings = () => state.settings;
  const tree = () => state.tree;
  const drawing = () => app.activeDrawing();
  const selectedLinks = () => app.selectedEntities().filter((e) => e.clone);
  const sourceOf = (entity) => drawing().entities.find((e) => e.id === entity.clone?.of) ?? null;
  const deepest = (entity) => {
    let at = entity;
    for (let guard = 0; at?.clone && guard < 64; guard++) { const next = sourceOf(at); if (!next) break; at = next; }
    return at;
  };
  const setTree = (patch) => { app.updateSettings({ tree: { ...settings().tree, ...patch } }); state.tree.options = settings().tree; app.renderLeft(); };
  const toggleOption = (key) => ({ icon: 'tree', label: `std.tree.${key}`, checked: () => Boolean(settings().tree?.[key]), run: () => setTree({ [key]: !settings().tree?.[key] }) });
  const overlay = () => settings().overlay ?? {};
  const setOverlay = (patch) => { app.updateSettings({ overlay: { ...overlay(), ...patch } }); app.applyOverlay(); app.renderToolbarState(); };

  const commands = {
    // ── model tree
    treeCollapse: { icon: 'treeCollapse', label: 'std.treeCollapse', enabled: hasDoc, run: () => { for (const key of treeKeys(state)) if (!key.startsWith('folder:') && !key.startsWith('doc:')) tree().collapsed.add(key); tree().expanded.clear(); app.showTree(); } },
    treeExpand: { icon: 'treeExpand', label: 'std.treeExpand', enabled: hasDoc, run: () => { tree().collapsed.clear(); tree().expanded.add('folder:2d'); app.showTree(); } },
    treeCollapseDocument: { icon: 'tree', label: 'std.treeCollapseDocument', enabled: hasDoc, run: () => { const key = `doc:${state.active}`; if (tree().collapsed.has(key)) tree().collapsed.delete(key); else tree().collapsed.add(key); app.showTree(); } },
    treeSelection: { icon: 'search', label: 'std.treeSelection', enabled: hasSelection, run: () => app.showTree({ reveal: app.selectedIds() }) },
    treeSelectAllInstances: { icon: 'clone', label: 'std.treeSelectAllInstances', enabled: hasSelection, run: () => app.select(instancesOf(drawing(), app.selectedIds())) },
    treeDrag: { icon: 'group', label: 'std.treeDrag', enabled: () => hasSelection() && Boolean(drawing()?.groups?.length), run: () => moveToGroupDialog() },
    ...Object.fromEntries(TREE_OPTIONS.map((key) => [`tree:${key}`, toggleOption(key)])),
    treeSingleDocument: { icon: 'drawing', label: 'std.tree.singleDocument', checked: () => !settings().tree?.multiDocument, run: () => setTree({ multiDocument: false }) },
    treeMultiDocument: { icon: 'windows', label: 'std.tree.multiDocument', checked: () => Boolean(settings().tree?.multiDocument), run: () => setTree({ multiDocument: true }) },
    treeOptions: { icon: 'gear', label: 'std.treeOptions', run: (context) => app.showCommandMenu([...TREE_OPTIONS.map((key) => `tree:${key}`), '-', 'treeSingleDocument', 'treeMultiDocument'], context, 'std.treeOptions') },

    // ── links (App::Link = a clone that is named a link)
    linkMake: { icon: 'link', label: 'std.linkMake', enabled: hasDoc, run: () => (hasSelection() ? makeLinks(app.selectedIds()) : externalLinkDialog()) },
    linkMakeGroup: { icon: 'linkGroup', label: 'std.linkMakeGroup', enabled: hasSelection, run: () => makeLinks(app.selectedIds(), { group: true }) },
    linkMakeRelative: { icon: 'link', label: 'std.linkMakeRelative', enabled: () => app.selectedEntities().some((e) => e.group), run: () => makeLinks(app.selectedIds(), { relative: true }) },
    linkReplace: { icon: 'link', label: 'std.linkReplace', enabled: hasSelection, run: () => replaceWithLinks(app.selectedIds()) },
    linkUnlink: { icon: 'unlinkObject', label: 'std.linkUnlink', enabled: () => selectedLinks().length > 0, run: () => app.run('unlinkClone') },
    linkImport: { icon: 'linkImport', label: 'std.linkImport', enabled: () => selectedLinks().some((e) => e.clone.external), run: () => importLinks(selectedLinks().filter((e) => e.clone.external).map((e) => e.id)) },
    linkImportAll: { icon: 'linkImport', label: 'std.linkImportAll', enabled: () => Boolean(drawing()?.entities.some((e) => e.clone?.external)), run: () => importLinks(drawing().entities.filter((e) => e.clone?.external).map((e) => e.id)) },
    linkSelectLinked: { icon: 'link', label: 'std.linkSelectLinked', enabled: () => selectedLinks().some((e) => sourceOf(e)), run: () => app.select(selectedLinks().map(sourceOf).filter(Boolean).map((e) => e.id)) },
    linkSelectLinkedFinal: { icon: 'link', label: 'std.linkSelectLinkedFinal', enabled: () => selectedLinks().some((e) => sourceOf(e)), run: () => app.select([...new Set(selectedLinks().map(deepest).map((e) => e.id))]) },
    linkSelectAllLinks: {
      icon: 'link', label: 'std.linkSelectAllLinks', enabled: hasSelection,
      run: () => { const ids = new Set(app.selectedIds().map((id) => deepest(drawing().entities.find((e) => e.id === id))?.id)); app.select(drawing().entities.filter((e) => e.clone && ids.has(deepest(e)?.id)).map((e) => e.id)); },
    },

    // ── edit modes, transforms, alignment
    editObject: { icon: 'editMode', label: 'std.editObject', enabled: () => state.selection.size === 1, run: () => editSelected() },
    userEditMode: { icon: 'editMode', label: 'std.userEditMode', run: (context) => app.showCommandMenu(['editMode:default', 'editMode:transform', 'editMode:cutting', 'editMode:color'], context, 'std.userEditMode') },
    ...Object.fromEntries(['default', 'transform', 'cutting', 'color'].map((mode) => [`editMode:${mode}`, { icon: 'editMode', label: `std.editMode.${mode}`, checked: () => (settings().userEditMode ?? 'default') === mode, run: () => app.updateSettings({ userEditMode: mode }) }])),
    transform: { icon: 'transform', label: 'std.transform', enabled: hasSelection, run: () => transformDialog() },
    transformManip: { icon: 'transform', label: 'std.transformManip', enabled: () => app.selectedEntities().some((e) => e.type === 'solid'), run: async () => { if (!state.view3d) await app.toggle3d(true); v()?.setOption('handle', 'move'); app.rebuild3d(); app.notify('info', t('std.transformManipHint')); } },
    alignTo: { icon: 'align', label: 'std.alignTo', enabled: () => app.selectedEntities().filter((e) => e.type === 'solid').length === 2, run: () => alignDialog() },
    alignToSelection: {
      icon: 'alignView', label: 'std.alignToSelection', enabled: () => Boolean(state.lastPick),
      run: async () => {
        if (!state.view3d) await app.toggle3d(true);
        const { point, normal } = state.lastPick;
        const camera = v().getCamera();
        const d = Math.hypot(...camera.position.map((p, i) => p - camera.target[i])) || 100;
        v().setCamera({ ...camera, target: point, position: point.map((p, i) => p + normal[i] * d), up: Math.abs(normal[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1] });
      },
    },
    boxElementSelection: { icon: 'boxElements', label: 'std.boxElementSelection', enabled: () => state.view3d && Boolean(state.edgePick), run: () => app.boxSelectEdges() },
    clarifySelection: { icon: 'clarify', label: 'std.clarifySelection', enabled: hasDoc, run: (context) => app.clarifySelection(context) },
    toggleNavigation: { icon: 'navigation', label: 'std.toggleNavigation', checked: () => Boolean(state.navigationOnly), run: () => { state.navigationOnly = !state.navigationOnly; app.notify('info', t(state.navigationOnly ? 'std.navigationOn' : 'std.navigationOff')); app.renderToolbarState(); } },

    // ── expressions, materials, textures
    expressions: { icon: 'expressions', label: 'std.expressions', enabled: hasSelection, run: () => expressionsDialog() },
    setMaterial: { icon: 'material', label: 'std.setMaterial', enabled: () => app.selectedEntities().some((e) => e.type === 'solid'), run: () => materialDialog() },
    materialEditor: { icon: 'materialEdit', label: 'std.materialEditor', run: () => materialEditorDialog() },
    inspectMaterial: { icon: 'material', label: 'std.inspectMaterial', enabled: hasSelection, run: () => inspectDialog('material') },
    inspectAppearance: { icon: 'appearance', label: 'std.inspectAppearance', enabled: hasSelection, run: () => inspectDialog('appearance') },
    textureMapping: { icon: 'texture', label: 'std.textureMapping', enabled: () => app.selectedEntities().some((e) => e.type === 'solid'), run: () => app.chooseTexture(app.selectedIds()) },

    // ── parameters, customising, toolbars, overlays, workbenches
    parameters: { icon: 'parameters', label: 'std.parameters', run: () => parametersDialog() },
    customize: { icon: 'customize', label: 'std.customize', run: () => customizeDialog() },
    toolbarMenu: { icon: 'toolbars', label: 'std.toolbarMenu', run: (context) => app.showCommandMenu(app.TOOLBAR_IDS.map((id) => `toolbar:${id}`), context, 'std.toolbarMenu') },
    ...Object.fromEntries(['main', 'edit', 'clipboard', 'zoom', 'toggles', 'view3d', 'panels', 'custom'].map((id) => [`toolbar:${id}`, { icon: 'toolbars', label: `std.toolbar.${id}`, checked: () => !settings().hiddenToolbars?.includes(id), run: () => { const hidden = new Set(settings().hiddenToolbars ?? []); if (hidden.has(id)) hidden.delete(id); else hidden.add(id); app.updateSettings({ hiddenToolbars: [...hidden] }); } }])),
    toggleToolbarLock: { icon: 'lockToolbar', label: 'std.toggleToolbarLock', checked: () => settings().toolbarLocked !== false, run: () => { app.updateSettings({ toolbarLocked: settings().toolbarLocked === false }); app.notify('info', t(settings().toolbarLocked === false ? 'std.toolbarUnlocked' : 'std.toolbarLocked')); } },
    dockOverlay: { icon: 'overlay', label: 'std.dockOverlay', checked: () => Boolean(overlay().left || overlay().right), run: () => setOverlay({ left: !(overlay().left || overlay().right), right: !(overlay().left || overlay().right) }) },
    dockOverlayAll: { icon: 'overlay', label: 'std.dockOverlayAll', checked: () => OVERLAY_SIDES.every((side) => overlay()[side]), run: () => { const on = !OVERLAY_SIDES.every((side) => overlay()[side]); setOverlay(Object.fromEntries(OVERLAY_SIDES.map((side) => [side, on]))); } },
    dockOverlayToggle: { icon: 'overlay', label: 'std.dockOverlayToggle', checked: () => Boolean(overlay().hidden), run: () => setOverlay({ hidden: !overlay().hidden }) },
    ...Object.fromEntries(OVERLAY_SIDES.map((side) => [`dockOverlay:${side}`, { icon: 'overlay', label: `std.overlay.${side}`, checked: () => Boolean(overlay()[side]), run: () => setOverlay({ [side]: !overlay()[side] }) }])),
    dockOverlayTransparent: { icon: 'overlay', label: 'std.dockOverlayTransparent', checked: () => Boolean(overlay().transparent), run: () => setOverlay({ transparent: !overlay().transparent }) },
    dockOverlayTransparentAll: { icon: 'overlay', label: 'std.dockOverlayTransparentAll', checked: () => Boolean(overlay().transparent && OVERLAY_SIDES.every((side) => overlay()[side])), run: () => setOverlay({ transparent: true, ...Object.fromEntries(OVERLAY_SIDES.map((side) => [side, true])) }) },
    dockOverlayMouseTransparent: { icon: 'overlay', label: 'std.dockOverlayMouseTransparent', checked: () => Boolean(overlay().mouseTransparent), run: () => setOverlay({ mouseTransparent: !overlay().mouseTransparent }) },
    workbench: { icon: 'workbench', label: 'std.workbench', run: (context) => app.showCommandMenu(Object.keys(WORKBENCHES).map((id) => `workbench:${id}`), context, 'std.workbench') },
    ...Object.fromEntries(Object.keys(WORKBENCHES).map((id) => [`workbench:${id}`, { icon: 'workbench', label: `std.wb.${id}`, checked: () => (settings().workbench ?? 'all') === id, run: () => { app.updateSettings({ workbench: id }); app.notify('info', t('std.workbenchSwitched', { name: t(`std.wb.${id}`) })); } }])),

    // ── windows and views
    newView3d: { icon: 'newView', label: 'std.newView3d', enabled: hasDoc, run: () => app.openViewerWindow() },
    viewUndock: { icon: 'undock', label: 'std.viewUndock', enabled: hasDoc, checked: () => app.popups.isOpen('viewer'), run: () => app.openViewerWindow({ undock: true }) },
    viewDock: { icon: 'dock', label: 'std.viewDock', enabled: () => app.popups.isOpen('viewer'), run: () => { app.popups.close('viewer'); app.toggle3d(true); } },
    documentWindow: { icon: 'focusView', label: 'std.documentWindow', run: (context) => app.showCommandMenu(['viewDock', 'viewUndock', 'focusView'], context, 'std.documentWindow') },
    tileWindows: { icon: 'tile', label: 'std.tileWindows', enabled: hasDoc, checked: () => Boolean(state.tiled), run: () => app.setTiled(true) },
    cascadeWindows: { icon: 'cascade', label: 'std.cascadeWindows', enabled: () => Boolean(state.tiled), run: () => app.setTiled(false) },
    viewVR: { icon: 'vr', label: 'std.viewVR', enabled: hasDoc, run: () => app.startVr() },
    sceneInspector: { icon: 'sceneInspector', label: 'std.sceneInspector', enabled: () => Boolean(v()), run: () => sceneInspectorDialog() },

    // ── documents, macros, the app
    printPdf: { icon: 'pdf', label: 'std.printPdf', enabled: hasDoc, run: () => app.printPdf() },
    documentUtility: { icon: 'docUtil', label: 'std.documentUtility', run: () => documentUtilityDialog() },
    recentMacros: { icon: 'recentMacros', label: 'std.recentMacros', enabled: () => Boolean(settings().recentMacros?.length), run: (context) => app.showMacroMenu(context) },
    reloadStyleSheet: { icon: 'reloadStyle', label: 'std.reloadStyleSheet', run: () => { app.reloadStyle(); app.notify('success', t('std.styleReloaded')); } },
    restartSafeMode: { icon: 'safeMode', label: 'std.restartSafeMode', enabled: () => !state.safeMode, run: () => app.restartSafeMode() },
    leaveSafeMode: { icon: 'safeMode', label: 'std.leaveSafeMode', enabled: () => Boolean(state.safeMode), run: () => app.leaveSafeMode() },
  };

  // ───────────────────────── links

  function makeLinks(ids, { group = false, relative = false } = {}) {
    const d = drawing();
    const sources = ids.map((id) => d.entities.find((e) => e.id === id)).filter(Boolean);
    let groupId = null;
    const made = [];
    app.change('std.op.link', (dr) => {
      if (group) {
        groupId = newId();
        dr.groups = [...(dr.groups ?? []), { id: groupId, name: t('std.linkGroupN', { n: (dr.groups?.length ?? 0) + 1 }), parent: null }];
      }
      for (const source of sources) {
        const part = relative ? dr.groups?.find((g) => g.id === source.group && g.part) : null;
        const offset = part?.placement ?? { x: 0, y: 0 };
        const box = app.boxOf(source);
        const c = box ? { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 } : { x: 0, y: 0 };
        const step = box ? (box.maxX - box.minX) * 1.2 || 10 : 10;
        const link = app.D.addEntity(dr, source.type, { ...structuredClone(source), id: undefined, name: `${source.name || app.labelOf(source)} (${t('std.link')})`, group: groupId ?? undefined, clone: { of: source.id, cx: c.x, cy: c.y, dx: (relative ? offset.x : step), dy: relative ? offset.y : 0, angle: 0, scale: 1, flip: false, link: true } });
        made.push(link.id);
      }
    });
    app.select(made);
    app.notify('success', t('std.linksMade', { count: made.length }));
  }

  async function externalLinkDialog() {
    const others = state.docs.filter((doc) => doc.id !== state.active);
    const options = others.flatMap((doc) => doc.drawing.entities.filter((e) => e.type === 'solid' || e.name).slice(0, 60).map((e) => [`${doc.id}|${e.id}`, `${app.docName(doc)} › ${app.labelOf(e)}`, t('std.link')]));
    if (!options.length) { app.notify('info', t('std.linkNothing')); return; }
    await app.form({
      title: t('std.linkMake'), icon: 'link', width: 620, intro: t('std.linkExternalIntro'),
      fields: [{ key: 'objects', type: 'list', label: t('std.linkFromOther'), icon: 'link', options }],
      actions: [{ id: 'ok', label: t('error.close') }],
    }, {
      onPick: ({ value }) => {
        const [docId, entityId] = value.split('|');
        const doc = state.docs.find((one) => one.id === docId);
        const source = doc?.drawing.entities.find((e) => e.id === entityId);
        if (!source) return;
        const box = app.boxOf(source);
        const c = box ? { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 } : { x: 0, y: 0 };
        let id = null;
        app.change('std.op.link', (dr) => {
          id = app.D.addEntity(dr, source.type, { ...structuredClone(source), id: undefined, name: `${source.name || app.labelOf(source)} (${app.docName(doc)})`, clone: { of: source.id, cx: c.x, cy: c.y, dx: 0, dy: 0, angle: 0, scale: 1, flip: false, link: true, external: { file: doc.path ?? '', title: app.docName(doc), cache: structuredClone(source) } } }).id;
        });
        app.select([id]);
        app.notify('success', t('std.linksMade', { count: 1 }));
      },
    });
  }

  function replaceWithLinks(ids) {
    const d = drawing();
    const made = [];
    app.change('std.op.link', (dr) => {
      const keep = { id: newId(), name: t('std.linkSources'), parent: null, hidden: true };
      dr.groups = [...(dr.groups ?? []), keep];
      for (const id of ids) {
        const source = d.entities.find((e) => e.id === id);
        if (!source) continue;
        app.D.updateEntity(dr, id, { group: keep.id });
        const box = app.boxOf(source);
        const c = box ? { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 } : { x: 0, y: 0 };
        made.push(app.D.addEntity(dr, source.type, { ...structuredClone(source), id: undefined, group: source.group ?? undefined, clone: { of: id, cx: c.x, cy: c.y, dx: 0, dy: 0, angle: 0, scale: 1, flip: false, link: true } }).id);
      }
    });
    app.select(made);
    app.notify('success', t('std.linksReplaced', { count: made.length }));
  }

  function importLinks(ids) {
    app.change('std.op.linkImport', (dr) => {
      for (const id of ids) {
        const entity = dr.entities.find((e) => e.id === id);
        if (!entity?.clone?.external) continue;
        const { clone, ...rest } = entity;
        app.D.updateEntity(dr, id, { ...rest, clone: null });
      }
    });
    app.notify('success', t('std.linksImported', { count: ids.length }));
  }

  async function moveToGroupDialog() {
    const groups = drawing().groups ?? [];
    const answer = await app.form({
      title: t('std.treeDrag'), icon: 'group', width: 480,
      fields: [{ key: 'group', type: 'select', label: t('std.toGroup'), icon: 'group', value: groups[0]?.id, options: [['', t('std.noGroup')], ...groups.map((g) => [g.id, g.name])] }],
      actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }],
    });
    if (answer?.action === 'ok') app.moveToGroup(app.selectedIds(), answer.values.group || null);
  }

  // ───────────────────────── edit, transform, align

  function editSelected() {
    const mode = settings().userEditMode ?? 'default';
    if (mode === 'transform') return commands.transform.run();
    if (mode === 'cutting') return app.run('clipPlane');
    if (mode === 'color') return app.run('appearance');
    for (const id of ['editSolid', 'editPart', 'properties']) if (app.commandEnabled(id)) return app.run(id);
    return undefined;
  }

  async function transformDialog() {
    const answer = await app.form({
      title: t('std.transform'), icon: 'transform', width: 480, intro: t('std.transformIntro'),
      fields: [
        ...['dx', 'dy', 'dz'].map((key) => ({ key, type: 'number', label: t(`std.tf.${key}`), icon: 'move', value: 0, step: 1, unit: 'mm' })),
        ...['rx', 'ry', 'rz'].map((key) => ({ key, type: 'number', label: t(`std.tf.${key}`), icon: 'rotate', value: 0, step: 5, unit: '°' })),
        { key: 'about', type: 'select', label: t('std.tf.about'), icon: 'coordinate', value: 'center', options: [['center', t('std.tf.center')], ['origin', t('std.tf.origin')]] },
      ],
      actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }],
    });
    if (answer?.action !== 'ok') return;
    app.transformSelection(answer.values);
  }

  async function alignDialog() {
    const [movable, fixed] = app.selectedEntities().filter((e) => e.type === 'solid');
    state.align = { movable: movable.id, fixed: fixed.id, from: [], to: [] };
    const listing = () => [{ key: 'pairs', type: 'list', label: t('std.alignPairs'), icon: 'align', options: state.align.from.map((p, i) => [String(i), `${i + 1}: (${p.map((v) => v.toFixed(1)).join(', ')}) → ${state.align.to[i] ? `(${state.align.to[i].map((v) => v.toFixed(1)).join(', ')})` : '…'}`]), empty: t('std.alignNone') }];
    if (!state.view3d) await app.toggle3d(true);
    app.notify('info', t('std.alignHint', { movable: app.labelOf(movable), fixed: app.labelOf(fixed) }));
    state.align.refresh = () => app.popups.post('form', { type: 'form:fields', fields: listing() });
    const answer = await app.form({ title: t('std.alignTo'), icon: 'align', width: 620, intro: t('std.alignIntro'), fields: listing(), actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('std.alignApply'), primary: true }] });
    const align = state.align;
    state.align = null;
    if (answer?.action !== 'ok' || !align.to.length) return;
    const n = Math.min(align.from.length, align.to.length);
    const fit = bestFit(align.from.slice(0, n), align.to.slice(0, n));
    app.change('std.op.align', (dr) => {
      const entity = dr.entities.find((e) => e.id === align.movable);
      if (entity) app.D.updateEntity(dr, entity.id, transformPlacement(entity, fit.R, fit.t));
    });
    app.notify('success', t('std.aligned', { count: n, rms: fit.rms.toFixed(3) }));
  }

  // ───────────────────────── expressions, materials, inspection

  async function expressionsDialog() {
    const entities = app.selectedEntities();
    const bound = entities.filter((e) => e.bind);
    const text = JSON.stringify(Object.fromEntries(bound.map((e) => [e.name || e.id, e.bind])), null, 2);
    const answer = await app.form({
      title: t('std.expressions'), icon: 'expressions', width: 640, intro: t('std.expressionsIntro', { count: bound.length }),
      fields: [{ key: 'text', type: 'textarea', label: t('std.expressionsText'), icon: 'expressions', value: bound.length ? text : '', rows: 10 }],
      actions: [{ id: 'copy', label: t('std.exprCopy'), icon: 'copy' }, { id: 'paste', label: t('std.exprPaste'), icon: 'paste' }, { id: 'apply', label: t('std.exprApply'), icon: 'check', primary: true }],
    });
    if (!answer) return;
    if (answer.action === 'copy') { await app.copyText(text); app.notify('success', t('std.exprCopied', { count: bound.length })); return; }
    let source = answer.values.text;
    if (answer.action === 'paste') source = await app.readClipboard();
    let parsed;
    try { parsed = JSON.parse(source); } catch { app.notify('error', t('std.exprBad')); return; }
    const values = Object.values(parsed).filter((v) => v && typeof v === 'object');
    if (!values.length) return;
    app.change('std.op.expressions', (dr) => {
      entities.forEach((entity, i) => {
        const bind = parsed[entity.name] ?? parsed[entity.id] ?? values[Math.min(i, values.length - 1)];
        app.D.updateEntity(dr, entity.id, { bind });
      });
    });
    app.notify('success', t('std.exprApplied', { count: entities.length }));
  }

  async function materialDialog() {
    const custom = normalizeCustomMaterials(settings().customMaterials);
    const solids = app.selectedEntities().filter((e) => e.type === 'solid');
    const current = solids[0].material?.id ?? 'steel';
    const answer = await app.form({
      title: t('std.setMaterial'), icon: 'material', width: 520,
      fields: [{ key: 'material', type: 'select', label: t('std.material'), icon: 'material', value: current, options: [...MATERIALS, ...custom].map((m) => [m.id, materialName(m, app.language())]) },
        { key: 'useColor', type: 'check', label: t('std.materialColor'), icon: 'palette', value: true }],
      actions: [{ id: 'none', label: t('std.materialNone') }, { id: 'ok', label: t('confirm.ok'), primary: true }],
    });
    if (!answer) return;
    const chosen = [...MATERIALS, ...custom].find((m) => m.id === answer.values.material);
    app.change('std.op.material', (dr) => {
      for (const solid of solids) {
        if (answer.action === 'none') { app.D.updateEntity(dr, solid.id, { physical: null }); continue; }
        app.D.updateEntity(dr, solid.id, { physical: normalizeMaterial({ ...chosen, name: materialName(chosen, 'en') }), ...(answer.values.useColor ? { color: chosen.color } : {}) });
      }
    });
  }

  async function materialEditorDialog() {
    const custom = normalizeCustomMaterials(settings().customMaterials);
    const base = MATERIALS[0];
    const answer = await app.form({
      title: t('std.materialEditor'), icon: 'materialEdit', width: 560, intro: t('std.materialEditorIntro', { count: custom.length }),
      fields: [
        { key: 'name', type: 'text', label: t('std.materialName'), icon: 'edit', value: t('std.myMaterial') },
        ...MATERIAL_FIELDS.map((key) => ({ key, type: 'number', label: t(`std.mat.${key}`), icon: 'material', value: base[key], step: 'any', unit: MATERIAL_UNITS[key] })),
        { key: 'color', type: 'color', label: t('prop.color'), icon: 'palette', value: base.color },
      ],
      actions: [...(custom.length ? [{ id: 'clear', label: t('std.materialsClear'), icon: 'trash', danger: true }] : []), { id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('std.materialSave'), primary: true }],
    });
    if (answer?.action === 'clear') { app.updateSettings({ customMaterials: [] }); return; }
    if (answer?.action !== 'ok') return;
    const material = normalizeMaterial({ ...answer.values, id: `custom-${newId()}` });
    app.updateSettings({ customMaterials: [...custom, material] });
    app.notify('success', t('std.materialSaved', { name: material.name }));
  }

  async function inspectDialog(kind) {
    const entity = app.selectedEntities()[0];
    const d = drawing();
    const style = app.D.styleOf(d, entity);
    const rows = kind === 'material'
      ? (entity.physical ?? entity.material
        ? [['name', entity.physical?.name ?? entity.material?.name ?? ''], ...MATERIAL_FIELDS.filter((key) => (entity.physical ?? {})[key] != null).map((key) => [t(`std.mat.${key}`), `${entity.physical[key]} ${MATERIAL_UNITS[key]}`]), ['mass', app.massText(entity)]]
        : [['—', t('std.noMaterial')]])
      : [[t('prop.color'), entity.color ?? `${style.color} (${t('std.byLayer')})`], [t('std.transparency'), `${entity.transparency ?? 0} %`], [t('std.lineWidth'), `${entity.lineWidth ?? style.lineWidth ?? '—'} mm`], [t('std.pointSize'), `${entity.pointSize ?? 3} px`], [t('std.texture'), entity.texture ? t('std.textureYes') : '—']];
    await app.form({
      title: t(kind === 'material' ? 'std.inspectMaterial' : 'std.inspectAppearance'), icon: kind === 'material' ? 'material' : 'appearance', width: 520,
      fields: rows.map(([label, value], i) => ({ key: `r${i}`, type: 'info', label: label === 'name' ? t('std.materialName') : label === 'mass' ? t('std.mass') : label, icon: 'info', value })),
      actions: [{ id: 'ok', label: t('error.close'), primary: true }],
    });
  }

  // ───────────────────────── parameters, customising

  async function parametersDialog() {
    const answer = await app.form({
      title: t('std.parameters'), icon: 'parameters', width: 760, intro: t('std.parametersIntro'),
      fields: [{ key: 'json', type: 'textarea', label: t('std.parametersText'), icon: 'parameters', value: JSON.stringify(settings(), null, 2), rows: 18 }],
      actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }],
    });
    if (answer?.action !== 'ok') return;
    let parsed;
    try { parsed = JSON.parse(answer.values.json); } catch (error) { app.notify('error', t('std.parametersBad', { message: error.message })); return; }
    app.replaceSettings(parsed);
    app.notify('success', t('std.parametersSaved'));
  }

  async function customizeDialog() {
    const answer = await app.form({
      title: t('std.customize'), icon: 'customize', width: 700, intro: t('std.customizeIntro'),
      fields: [
        { key: 'toolbar', type: 'textarea', label: t('std.customToolbar'), icon: 'toolbars', value: (settings().customToolbar ?? []).join('\n'), rows: 6 },
        { key: 'keys', type: 'textarea', label: t('std.customKeys'), icon: 'keyboard', value: Object.entries(settings().customKeys ?? {}).map(([key, id]) => `${key} = ${id}`).join('\n'), rows: 6 },
      ],
      actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }],
    });
    if (answer?.action !== 'ok') return;
    const known = (id) => Boolean(app.commands[id]);
    const toolbar = answer.values.toolbar.split('\n').map((s) => s.trim()).filter(Boolean);
    const keys = {};
    const bad = toolbar.filter((id) => !known(id));
    for (const line of answer.values.keys.split('\n')) {
      const m = line.match(/^\s*((?:Ctrl\+)?(?:Shift\+)?(?:Alt\+)?[A-Za-z0-9])\s*=\s*(\S+)\s*$/);
      if (!line.trim()) continue;
      if (m && known(m[2])) keys[m[1]] = m[2]; else bad.push(line.trim());
    }
    app.updateSettings({ customToolbar: toolbar.filter(known), customKeys: keys });
    if (bad.length) app.notify('warning', t('std.customizeBad', { items: bad.slice(0, 5).join(', ') }));
    else app.notify('success', t('std.customizeSaved'));
  }

  async function sceneInspectorDialog() {
    const lines = [];
    const walk = (object, depth) => {
      if (lines.length > 600) return;
      const count = object.geometry?.attributes?.position ? ` · ${object.geometry.attributes.position.count} vertices` : '';
      lines.push(`${'  '.repeat(depth)}${object.type}${object.name ? ` "${object.name}"` : ''}${object.visible ? '' : ' (hidden)'}${count}`);
      for (const child of object.children) walk(child, depth + 1);
    };
    walk(v().scene, 0);
    await app.form({ title: t('std.sceneInspector'), icon: 'sceneInspector', width: 760, fields: [{ key: 'scene', type: 'textarea', label: t('std.sceneGraph'), icon: 'tree', value: lines.join('\n'), rows: 20, readonly: true }], actions: [{ id: 'ok', label: t('error.close'), primary: true }] });
  }

  async function documentUtilityDialog() {
    const answer = await app.form({
      title: t('std.documentUtility'), icon: 'docUtil', width: 560, intro: t('std.documentUtilityIntro'),
      fields: [{ key: 'note', type: 'info', label: t('std.documentFormat'), icon: 'info', value: t('std.documentFormatText') }],
      actions: [{ id: 'extract', label: t('std.docExtract'), icon: 'export' }, { id: 'create', label: t('std.docCreate'), icon: 'import' }, { id: 'cancel', label: t('error.close'), primary: true }],
    });
    if (answer?.action === 'extract') await app.extractDocument();
    else if (answer?.action === 'create') await app.createDocumentFromJson();
  }

  void rotationOf;
  return commands;
}

/** The FreeCAD command for each MyCAD command of this module. */
export const STD2_FREECAD = {
  Std_TreeCollapse: 'treeCollapse', Std_TreeExpand: 'treeExpand', Std_TreeCollapseDocument: 'treeCollapseDocument', Std_TreeSelection: 'treeSelection',
  Std_TreeSelectAllInstances: 'treeSelectAllInstances', Std_TreeDrag: 'treeDrag', Std_TreeSyncSelection: 'tree:syncSelection', Std_TreeSyncView: 'tree:syncView',
  Std_TreeSyncPlacement: 'tree:syncPlacement', Std_TreePreSelection: 'tree:preSelection', Std_TreeRecordSelection: 'tree:recordSelection',
  Std_TreeSingleDocument: 'treeSingleDocument', Std_TreeMultiDocument: 'treeMultiDocument',
  Std_LinkMake: 'linkMake', Std_LinkMakeGroup: 'linkMakeGroup', Std_LinkMakeRelative: 'linkMakeRelative', Std_LinkReplace: 'linkReplace', Std_LinkUnlink: 'linkUnlink',
  Std_LinkImport: 'linkImport', Std_LinkImportAll: 'linkImportAll', Std_LinkSelectLinked: 'linkSelectLinked', Std_LinkSelectLinkedFinal: 'linkSelectLinkedFinal',
  Std_LinkSelectAllLinks: 'linkSelectAllLinks', Std_Edit: 'editObject', Std_UserEditMode: 'userEditMode', Std_Transform: 'transform', Std_TransformManip: 'transformManip',
  Std_Alignment: 'alignTo', Std_AlignToSelection: 'alignToSelection', Std_BoxElementSelection: 'boxElementSelection', Std_ClarifySelection: 'clarifySelection',
  Std_ToggleNavigation: 'toggleNavigation', Std_Expressions: 'expressions', Std_SetMaterial: 'setMaterial', Std_TextureMapping: 'textureMapping',
  Material_Edit: 'materialEditor', Materials_InspectMaterial: 'inspectMaterial', Materials_InspectAppearance: 'inspectAppearance',
  Std_DlgParameter: 'parameters', Std_DlgCustomize: 'customize', Std_ToolBarMenu: 'toolbarMenu', Std_ToggleToolBarLock: 'toggleToolbarLock',
  Std_DockOverlay: 'dockOverlay', Std_DockOverlayAll: 'dockOverlayAll', Std_DockOverlayToggle: 'dockOverlayToggle', Std_DockOverlayToggleLeft: 'dockOverlay:left',
  Std_DockOverlayToggleRight: 'dockOverlay:right', Std_DockOverlayToggleTop: 'dockOverlay:top', Std_DockOverlayToggleBottom: 'dockOverlay:bottom',
  Std_DockOverlayToggleTransparent: 'dockOverlayTransparent', Std_DockOverlayTransparentAll: 'dockOverlayTransparentAll', Std_DockOverlayMouseTransparent: 'dockOverlayMouseTransparent',
  Std_Workbench: 'workbench', Std_UserInterface: ['leftPanel', 'rightPanel', 'problems', 'console', 'statusBar'], Std_ViewCreate: 'newView3d', Std_ViewUndock: 'viewUndock', Std_ViewDock: 'viewDock', Std_ViewDockUndockFullscreen: 'documentWindow',
  Std_TileWindows: 'tileWindows', Std_CascadeWindows: 'cascadeWindows', Std_ViewVR: 'viewVR', Std_SceneInspector: 'sceneInspector', Std_PrintPdf: 'printPdf',
  Std_ProjectUtil: 'documentUtility', Std_RecentMacros: 'recentMacros', Std_ReloadStyleSheet: 'reloadStyleSheet', Std_RestartInSafeMode: 'restartSafeMode',
};
