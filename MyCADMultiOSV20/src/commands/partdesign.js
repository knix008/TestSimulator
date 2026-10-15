// FreeCAD's PartDesign commands MyCAD did not have yet: bodies (the active
// body takes new features; its tip hides the features after it), moving
// features, the patterns, a sketch on a face or datum plane, shape binders,
// and the subtractive helix, loft and pipe.
import './partdesign-icons.js';
import { normalizeSolidData } from '../domain/solids.js';
import { AXES, MIRROR_PLANES, PATTERN_MODES } from '../domain/partops.js';
import { DATUM_TYPES } from '../domain/partops.js';


export function partDesignCommands(app) {
  const { t, state } = app;
  const drawing = () => app.activeDrawing();
  const bodies = () => (drawing()?.groups ?? []).filter((g) => g.body);
  const solids = () => app.selectedSolids();
  const bodyOf = (entity) => bodies().find((b) => b.id === entity?.group) ?? null;

  /** A pattern of the selected solid (it becomes the pattern's base). */
  async function pattern(mode) {
    const base = solids()[0];
    const fields = {
      linear: [
        { key: 'count', type: 'number', label: t('pd.count'), icon: 'pdLinearPattern', value: 3, min: 1, max: 1000, step: 1 },
        { key: 'length', type: 'number', label: t('pd.length'), icon: 'move', value: 50, step: 1, unit: 'mm' },
        { key: 'dir', type: 'select', label: t('pd.direction'), icon: 'axes', value: 'x', options: AXES.map((a) => [a, a.toUpperCase()]) },
      ],
      polar: [
        { key: 'count2', type: 'number', label: t('pd.count'), icon: 'pdPolarPattern', value: 6, min: 1, max: 1000, step: 1 },
        { key: 'angle', type: 'number', label: t('pd.angle'), icon: 'rotate', value: 360, min: -360, max: 360, step: 15, unit: '°' },
        { key: 'axis', type: 'select', label: t('pd.axis'), icon: 'axes', value: '2', options: AXES.map((a, i) => [String(i), a.toUpperCase()]) },
        { key: 'cx', type: 'number', label: t('pd.centerX'), icon: 'coordinate', value: 0, step: 1, unit: 'mm' },
        { key: 'cy', type: 'number', label: t('pd.centerY'), icon: 'coordinate', value: 0, step: 1, unit: 'mm' },
      ],
      mirror: [{ key: 'plane', type: 'select', label: t('part.mirrorPlane'), icon: 'pdMirrored', value: '0', options: MIRROR_PLANES.map((p, i) => [String(i), t(`part.plane.${p}`)]) }],
    };
    const list = mode === 'multi' ? [...fields.linear, ...fields.polar] : fields[mode];
    const answer = await app.form({ title: t(`pd.pattern.${mode}`), icon: { linear: 'pdLinearPattern', polar: 'pdPolarPattern', mirror: 'pdMirrored', multi: 'pdMultiTransform' }[mode], width: 500, intro: t('pd.patternIntro', { name: app.labelOf(base) }), fields: list, actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }] });
    if (answer?.action !== 'ok') return;
    const v = answer.values;
    const dir = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[v.dir ?? 'x'];
    const params = { mode: PATTERN_MODES.indexOf(mode), count: v.count ?? 3, length: v.length ?? 50, dx: dir[0], dy: dir[1], dz: dir[2], count2: v.count2 ?? 4, angle: v.angle ?? 360, axis: Number(v.axis ?? 2), cx: v.cx ?? 0, cy: v.cy ?? 0, plane: Number(v.plane ?? 0) };
    const added = app.change('pd.op.pattern', (d) => {
      app.D.removeEntities(d, [base.id]);
      return app.D.addEntity(d, 'solid', { kind: 'pattern', name: `${t(`pd.pattern.${mode}`)} (${app.labelOf(base)})`, params, shape: { base: normalizeSolidData(base) }, layer: base.layer, color: base.color, group: base.group ?? undefined });
    });
    app.select([added.id]);
  }

  async function newBody({ migrate = false } = {}) {
    const ids = solids().map((e) => e.id);
    const body = { id: app.newId(), name: t('pd.bodyN', { n: bodies().length + 1 }), parent: null, body: true };
    app.change('pd.op.body', (d) => {
      d.groups = [...(d.groups ?? []), body];
      for (const id of ids) app.D.updateEntity(d, id, { group: body.id });
    });
    state.activeBody = body.id;
    app.notify('success', t(migrate ? 'pd.migrated' : 'pd.bodyMade', { name: body.name, count: ids.length }));
    app.showTree();
  }

  async function chooseBody(titleKey) {
    const list = bodies();
    if (!list.length) { app.notify('info', t('pd.noBody')); return null; }
    const answer = await app.form({ title: t(titleKey), icon: 'pdBody', width: 460, fields: [{ key: 'body', type: 'select', label: t('pd.body'), icon: 'pdBody', value: list[0].id, options: list.map((b) => [b.id, b.name]) }], actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }] });
    return answer?.action === 'ok' ? answer.values.body : null;
  }

  async function moveInTree() {
    const feature = solids()[0];
    const body = bodyOf(feature);
    const others = drawing().entities.filter((e) => e.group === body?.id && e.id !== feature.id);
    if (!others.length) { app.notify('info', t('pd.nothingToMoveAfter')); return; }
    const answer = await app.form({ title: t('pd.moveFeatureInTree'), icon: 'pdMoveInTree', width: 480, fields: [{ key: 'after', type: 'select', label: t('pd.after'), icon: 'list', value: others[others.length - 1].id, options: others.map((e) => [e.id, app.labelOf(e)]) }], actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }] });
    if (answer?.action !== 'ok') return;
    app.change('pd.op.reorder', (d) => {
      const moving = d.entities.find((e) => e.id === feature.id);
      d.entities = d.entities.filter((e) => e.id !== feature.id);
      d.entities.splice(d.entities.findIndex((e) => e.id === answer.values.after) + 1, 0, moving);
    });
  }

  /** PartDesign_NewSketch: the working plane on the picked face or the selected datum plane, then drawing in 2D. */
  async function newSketch() {
    const face = (state.elements ?? []).find((el) => el.kind === 'face');
    const datum = app.selectedEntities().find((e) => e.kind === 'datum' && DATUM_TYPES[e.params.type] === 'plane');
    if (face) await app.workPlaneOnFace(face.signature.center, face.signature.normal);
    else if (datum) await app.workPlaneOnDatum(datum);
    else { app.notify('info', t('pd.sketchNeedsFace')); return; }
    app.clearElements();
    if (state.view3d) await app.toggle3d(false);
    app.notify('success', t('pd.sketchReady'));
  }

  async function subtractive(kind) {
    const base = solids()[0];
    if (!base) { app.notify('info', t('pd.subtractiveNeedsBase')); return; }
    const tool = kind === 'helix' ? await app.openSolidDialog({ kind: 'helix' }) : await app.solidFeature(kind === 'pipe' ? 'sweep' : 'loft');
    if (!tool) return;
    app.select([base.id, tool.id]);
    const cut = app.booleanSelection('cut');
    if (cut) app.change('pd.op.subtractive', (d) => app.D.updateEntity(d, cut.id, { name: `${t(`pd.subtractive.${kind}`)} (${app.labelOf(base)})`, group: base.group ?? undefined }));
  }

  return {
    'pd:body': { icon: 'pdBody', label: 'pd.newBody', enabled: () => Boolean(app.activeDoc()), run: () => newBody() },
    'pd:migrate': { icon: 'pdBody', label: 'pd.migrate', enabled: () => solids().some((e) => !e.group), run: () => newBody({ migrate: true }) },
    'pd:activeBody': { icon: 'pdBody', label: 'pd.activeBody', enabled: () => bodies().length > 0, run: async () => { const id = await chooseBody('pd.activeBody'); if (id) { state.activeBody = id; app.showTree(); } } },
    'pd:moveTip': { icon: 'pdTip', label: 'pd.moveTip', enabled: () => solids().length === 1 && Boolean(bodyOf(solids()[0])), run: () => { const f = solids()[0]; app.change('pd.op.tip', (d) => { d.groups = d.groups.map((g) => (g.id === f.group ? { ...g, tip: g.tip === f.id ? null : f.id } : g)); }); } },
    'pd:moveFeature': { icon: 'pdMoveFeature', label: 'pd.moveFeature', enabled: () => solids().length > 0 && bodies().length > 0, run: async () => { const id = await chooseBody('pd.moveFeature'); if (id) app.moveToGroup(app.selectedIds(), id); } },
    'pd:moveFeatureInTree': { icon: 'pdMoveInTree', label: 'pd.moveFeatureInTree', enabled: () => solids().length === 1 && Boolean(bodyOf(solids()[0])), run: () => moveInTree() },
    'pd:linearPattern': { icon: 'pdLinearPattern', label: 'pd.pattern.linear', enabled: () => solids().length === 1, run: () => pattern('linear') },
    'pd:polarPattern': { icon: 'pdPolarPattern', label: 'pd.pattern.polar', enabled: () => solids().length === 1, run: () => pattern('polar') },
    'pd:mirrored': { icon: 'pdMirrored', label: 'pd.pattern.mirror', enabled: () => solids().length === 1, run: () => pattern('mirror') },
    'pd:multiTransform': { icon: 'pdMultiTransform', label: 'pd.pattern.multi', enabled: () => solids().length === 1, run: () => pattern('multi') },
    'pd:newSketch': { icon: 'pdNewSketch', label: 'pd.newSketch', enabled: () => (state.elements ?? []).some((el) => el.kind === 'face') || app.selectedEntities().some((e) => e.kind === 'datum'), run: () => newSketch() },
    'pd:shapeBinder': { icon: 'pdShapeBinder', label: 'pd.shapeBinder', enabled: () => solids().length > 0, run: async () => { await app.run('linkMake'); app.change('pd.op.binder', (d) => { for (const id of app.selectedIds()) app.D.updateEntity(d, id, { name: `${t('pd.shapeBinder')} ${app.labelOf(app.D.findEntity(d, id))}`, group: state.activeBody ?? undefined }); }); } },
    'pd:subShapeBinder': { icon: 'pdSubShapeBinder', label: 'pd.subShapeBinder', enabled: () => (state.elements ?? []).length > 0, run: () => app.run('part:elementCopy') },
    'pd:subtractiveHelix': { icon: 'pdSubtractiveHelix', label: 'pd.subtractive.helix', enabled: () => solids().length === 1, run: () => subtractive('helix') },
    'pd:subtractiveLoft': { icon: 'pdSubtractiveLoft', label: 'pd.subtractive.loft', enabled: () => solids().length === 1, run: () => subtractive('loft') },
    'pd:subtractivePipe': { icon: 'pdSubtractivePipe', label: 'pd.subtractive.pipe', enabled: () => solids().length === 1, run: () => subtractive('pipe') },
  };
}

export const PARTDESIGN_FREECAD = {
  PartDesign_Body: 'pd:body', PartDesign_Migrate: 'pd:migrate', PartDesign_MoveTip: 'pd:moveTip', PartDesign_MoveFeature: 'pd:moveFeature', PartDesign_MoveFeatureInTree: 'pd:moveFeatureInTree',
  PartDesign_LinearPattern: 'pd:linearPattern', PartDesign_PolarPattern: 'pd:polarPattern', PartDesign_Mirrored: 'pd:mirrored', PartDesign_MultiTransform: 'pd:multiTransform',
  PartDesign_NewSketch: 'pd:newSketch', PartDesign_ShapeBinder: 'pd:shapeBinder', PartDesign_SubShapeBinder: 'pd:subShapeBinder', PartDesign_SubtractiveHelix: 'pd:subtractiveHelix',
  PartDesign_SubtractiveLoft: 'pd:subtractiveLoft', PartDesign_SubtractivePipe: 'pd:subtractivePipe', PartDesign_WizardShaftCallBack: 'part:shaft',
};
