// FreeCAD's CAM commands MyCAD did not have yet, on a CAM job kept in the
// drawing (drawing.camJob): tool bits (new, library, load, save), tool
// controllers, the operations (adaptive, area, face, helix, thread milling,
// tapping, slot, deburr, V-carve, from shape, probe, custom G-code, comment,
// stop, array, compound, copies), the dress-ups, fixtures, the property bag,
// start points, loop selection, inspecting, the sanity check, a job template,
// and posting the whole job as one G-code program.
import './camjob-icons.js';
import { isVisible } from '../domain/drawing.js';
import { camSource } from '../domain/cam.js';
import { heightField } from '../domain/cam3d.js';
import { solidMesh } from '../domain/solids.js';
import { pathPoints } from '../domain/draft.js';
import { Tool, TOOL_ICONS, registerTool } from '../view/tools.js';
import {
  DRESSUP_TYPES, FIXTURES, TOOL_KINDS, camId, emptyJob, jobGcode, normalizeCamJob, normalizeController, normalizeOp, normalizeTool, opPaths, sanityCheck,
  toolFromFctb, toolToFctb,
} from '../domain/camjob.js';


/** The new operations: icon and the fields each asks for (beyond name, tool controller, top, depth, step down / over). */
const OPS = {
  adaptive: { icon: 'camAdaptive', fields: [] },
  area: { icon: 'camArea', fields: [] },
  areaWorkplane: { icon: 'camAreaWorkplane', fields: [['workplaneZ', 0, 'mm']] },
  millFace: { icon: 'camMillFace', fields: [['extra', 2, 'mm']] },
  helix: { icon: 'camHelix', fields: [] },
  threadMilling: { icon: 'camThread', fields: [['pitch', 1.5, 'mm'], ['majorDiameter', 0, 'mm']] },
  tapping: { icon: 'camTapping', fields: [['pitch', 1, 'mm']] },
  slot: { icon: 'camSlot', fields: [['extend', 0, 'mm']] },
  deburr: { icon: 'camDeburr', fields: [['width', 0.5, 'mm'], ['extraDepth', 0, 'mm']] },
  vcarve: { icon: 'camVcarve', fields: [['step', 0.2, 'mm'], ['maxDepth', 3, 'mm']] },
  shape: { icon: 'camShape', fields: [] },
  probe: { icon: 'camProbe', fields: [['nx', 3, ''], ['ny', 3, ''], ['probeDepth', 5, 'mm']] },
  custom: { icon: 'camCustom', text: 'gcode' },
  comment: { icon: 'camComment', text: 'text' },
  stop: { icon: 'camStop', check: 'optional' },
};
const NO_TOOL = ['custom', 'comment', 'stop'];
const DRESSUPS = {
  array: { icon: 'camDressArray', fields: [['count', 2, ''], ['dx', 20, 'mm'], ['dy', 0, 'mm']] },
  axisMap: { icon: 'camDressAxisMap', fields: [['radius', 10, 'mm']] },
  dogbone: { icon: 'camDressDogbone', select: ['side', ['left', 'right']] },
  dragKnife: { icon: 'camDressDragKnife', fields: [['offset', 0.5, 'mm'], ['filterAngle', 20, '°']] },
  leadInOut: { icon: 'camDressLeadInOut', fields: [['radius', 3, 'mm']], select: ['side', ['right', 'left']] },
  boundary: { icon: 'camDressBoundary', fields: [] },
  rampEntry: { icon: 'camDressRamp', fields: [['angle', 5, '°'], ['height', 1.5, 'mm']] },
  tag: { icon: 'camDressTag', fields: [['count', 4, ''], ['width', 6, 'mm'], ['height', 2, 'mm']] },
  zCorrect: { icon: 'camDressZCorrect', fields: [['a', 0, 'mm'], ['b', 0, ''], ['c', 0, ''], ['segment', 2, 'mm']] },
};

let startFor = null;
/** CAM_SetStartPoint: one click on the canvas sets the operation's start point. */
class StartPointTool extends Tool {
  click(p) {
    const id = startFor;
    this.api.change('camjob.op.start', (d) => { d.camJob.ops = d.camJob.ops.map((o) => (o.id === id ? { ...o, startPoint: { x: p.x, y: p.y } } : o)); });
    this.api.notify('success', 'camjob.startSet');
    this.api.done();
  }

  prompt() { return 'prompt.camStart.0'; }
}
registerTool('camStart', (api) => new StartPointTool('camStart', api));
TOOL_ICONS.camStart = 'camStartPoint';

export function camJobCommands(app) {
  const { t, state } = app;
  const drawing = () => app.activeDrawing();
  const hasDoc = () => Boolean(app.activeDoc());
  const job = () => drawing()?.camJob ?? null;
  const ok = () => [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }];
  const ask = async (titleKey, icon, fields, width = 500) => { const a = await app.form({ title: t(titleKey), icon, width, fields, actions: ok() }); return a?.action === 'ok' ? a.values : null; };
  const setJob = (label, f) => app.change(label, (d) => { d.camJob = normalizeCamJob(f(structuredClone(d.camJob ?? emptyJob()))); });
  const library = () => (state.settings.camToolLibrary ?? []).map(normalizeTool);

  /** A job with at least one tool and tool controller (a 6 mm end mill at first). */
  function ensureJob() {
    if (job()?.controllers.length) return job();
    setJob('camjob.op.job', (j) => {
      const tool = j.tools[0] ?? normalizeTool({ name: t('camjob.defaultTool'), kind: 'endmill', diameter: 6 });
      if (!j.tools.length) j.tools.push(tool);
      j.controllers.push(normalizeController({ name: 'TC1', tool: tool.id, number: 1 }));
      return j;
    });
    return job();
  }

  /** What an operation works on, its tool and controller (the opPaths context). */
  function context(op) {
    const d = drawing();
    const j = job() ?? emptyJob();
    const ids = new Set(op.source ?? []);
    const entities = d.entities.filter((e) => (ids.size ? ids.has(e.id) : isVisible(d, e)));
    const source = camSource(entities, d);
    const wires = entities.filter((e) => e.kind === 'wire3d').flatMap((e) => e.shape?.paths ?? []);
    const solids = entities.filter((e) => e.type === 'solid' && !['wire3d', 'datum', 'points'].includes(e.kind));
    const model = ['rough3d', 'finish3d'].includes(op.type) && solids.length ? heightField(solids.flatMap((e) => solidMesh(e)), { pad: 5, maxCells: 200 }) : null;
    const controller = j.controllers.find((c) => c.id === op.controller) ?? j.controllers[0] ?? null;
    const tool = j.tools.find((x) => x.id === controller?.tool) ?? null;
    return { source, wires, model, job: j, tool, controller };
  }
  const opsById = () => new Map((job()?.ops ?? []).map((o) => [o.id, o]));
  const pathsOf = (op) => opPaths(op, { ...context(op), opsById: opsById(), pathsOf: (other) => opPaths(other, { ...context(other), opsById: opsById(), pathsOf: () => [] }) });

  // ── operations

  const baseFields = (j, type) => [
    { key: 'name', type: 'text', label: t('camjob.opName'), icon: OPS[type]?.icon ?? 'cam', value: t(`camjob.op.${type}`) },
    ...(NO_TOOL.includes(type) ? [] : [
      { key: 'controller', type: 'select', label: t('camjob.controller'), icon: 'camController', value: j.controllers[0]?.id ?? '', options: j.controllers.map((c) => [c.id, `${c.name} · ${j.tools.find((x) => x.id === c.tool)?.name ?? '?'}`]) },
      { key: 'top', type: 'number', label: t('cam.top'), icon: 'move', value: 0, step: 1, unit: 'mm' },
      { key: 'depth', type: 'number', label: t('cam.depth'), icon: 'move', value: type === 'millFace' ? 1 : 5, min: 0.01, step: 0.5, unit: 'mm' },
      { key: 'stepDown', type: 'number', label: t('cam.stepDown'), icon: 'move', value: 1.5, min: 0.01, step: 0.5, unit: 'mm' },
      { key: 'stepOver', type: 'number', label: t('cam.stepOver'), icon: 'move', value: 0.5, min: 0.05, max: 1, step: 0.05 },
    ]),
  ];

  async function newOp(type, { withController = true } = {}) {
    const j = NO_TOOL.includes(type) ? (job() ?? (setJob('camjob.op.job', (x) => x), job())) : ensureJob();
    const spec = OPS[type];
    const fields = [
      ...baseFields(j, type).filter((f) => withController || f.key !== 'controller'),
      ...(spec.fields ?? []).map(([key, value, unit]) => ({ key, type: 'number', label: t(`camjob.f.${key}`), icon: spec.icon, value, step: unit === 'mm' ? 0.5 : 1, ...(unit ? { unit } : {}) })),
      ...(spec.text ? [{ key: spec.text, type: spec.text === 'gcode' ? 'textarea' : 'text', label: t(`camjob.f.${spec.text}`), icon: spec.icon, value: spec.text === 'gcode' ? 'G4 P1 (pause 1 s)' : t('camjob.commentText'), rows: 5 }] : []),
      ...(spec.check ? [{ key: spec.check, type: 'check', label: t(`camjob.f.${spec.check}`), icon: spec.icon, value: false }] : []),
    ];
    const v = await ask(`camjob.op.${type}`, spec.icon, fields, 520);
    if (!v) return null;
    const { name, controller, ...options } = v;
    const op = normalizeOp({ id: camId('o'), type, name: name || t(`camjob.op.${type}`), controller: controller ?? j.controllers[0]?.id ?? '', source: app.selectedIds(), options });
    setJob('camjob.op.add', (x) => { x.ops.push(op); return x; });
    const count = pathsOf(job().ops.at(-1)).length;
    app.notify('success', t('camjob.opAdded', { name: op.name, count }));
    return op;
  }

  async function pickOp(titleKey, icon, { filter = () => true, extra = [] } = {}) {
    const ops = (job()?.ops ?? []).filter(filter);
    if (!ops.length) { app.notify('info', t('camjob.noOps')); return null; }
    const v = await ask(titleKey, icon, [{ key: 'op', type: 'select', label: t('camjob.operation'), icon: 'cam', value: ops.at(-1).id, options: ops.map((o) => [o.id, `${o.name} (${t(`camjob.op.${o.type}`)})${o.active ? '' : ` — ${t('camjob.inactive')}`}`]) }, ...extra]);
    return v ? { op: ops.find((o) => o.id === v.op), values: v } : null;
  }

  async function arrayOp() {
    const picked = await pickOp('camjob.op.array', 'camArray', { extra: [
      { key: 'mode', type: 'select', label: t('camjob.f.mode'), icon: 'camArray', value: 'linear', options: [['linear', t('camjob.linear')], ['polar', t('camjob.polar')]] },
      { key: 'count', type: 'number', label: t('pd.count'), icon: 'camArray', value: 3, min: 2, max: 500, step: 1 },
      { key: 'dx', type: 'number', label: t('camjob.f.dx'), icon: 'move', value: 30, step: 1, unit: 'mm' },
      { key: 'dy', type: 'number', label: t('camjob.f.dy'), icon: 'move', value: 0, step: 1, unit: 'mm' },
      { key: 'angle', type: 'number', label: t('pd.angle'), icon: 'rotate', value: 360, step: 15, unit: '°' },
      { key: 'cx', type: 'number', label: t('pd.centerX'), icon: 'coordinate', value: 0, step: 1, unit: 'mm' },
      { key: 'cy', type: 'number', label: t('pd.centerY'), icon: 'coordinate', value: 0, step: 1, unit: 'mm' },
    ] });
    if (!picked) return null;
    const { op: _op, ...options } = picked.values;
    const op = normalizeOp({ type: 'array', name: `${t('camjob.op.array')} (${picked.op.name})`, base: picked.op.id, controller: picked.op.controller, options });
    setJob('camjob.op.add', (x) => { x.ops.push(op); return x; });
    return op;
  }

  async function compoundOp() {
    const ops = job()?.ops ?? [];
    if (!ops.length) { app.notify('info', t('camjob.noOps')); return null; }
    const v = await ask('camjob.op.compound', 'camCompound', ops.map((o) => ({ key: o.id, type: 'check', label: o.name, icon: 'cam', value: true })));
    if (!v) return null;
    const children = ops.filter((o) => v[o.id]).map((o) => o.id);
    const op = normalizeOp({ type: 'compound', name: t('camjob.op.compound'), children });
    setJob('camjob.op.add', (x) => { x.ops.push(op); return x; });
    return op;
  }

  async function simpleCopy() {
    const picked = await pickOp('camjob.simpleCopy', 'camSimpleCopy');
    if (!picked) return null;
    const frozen = pathsOf(picked.op);
    const op = normalizeOp({ type: 'copy', name: `${picked.op.name} (${t('camjob.copied')})`, controller: picked.op.controller, options: { ...picked.op.options }, frozen });
    setJob('camjob.op.add', (x) => { x.ops.push(op); return x; });
    return op;
  }

  async function operationCopy() {
    const picked = await pickOp('camjob.operationCopy', 'camOpCopy');
    if (!picked) return null;
    const op = normalizeOp({ ...structuredClone(picked.op), id: camId('o'), name: `${picked.op.name} (2)` });
    setJob('camjob.op.add', (x) => { x.ops.push(op); return x; });
    return op;
  }

  async function toggleActive() {
    const ops = job()?.ops ?? [];
    if (!ops.length) { app.notify('info', t('camjob.noOps')); return; }
    const v = await ask('camjob.toggleActive', 'camToggle', ops.map((o) => ({ key: o.id, type: 'check', label: `${o.name} (${t(`camjob.op.${o.type}`)})`, icon: 'cam', value: o.active })));
    if (v) setJob('camjob.op.toggle', (x) => { x.ops = x.ops.map((o) => ({ ...o, active: Boolean(v[o.id]) })); return x; });
  }

  async function dressup(type) {
    const spec = DRESSUPS[type];
    const boundary = type === 'boundary' ? app.selectedEntities().map((e) => pathPoints(e)).find((p) => p?.closed) : null;
    if (type === 'boundary' && !boundary) { app.notify('info', t('camjob.pickBoundary')); return null; }
    const picked = await pickOp(`camjob.dress.${type}`, spec.icon, { filter: (o) => !['custom', 'comment', 'stop', 'probe'].includes(o.type), extra: [
      ...(spec.fields ?? []).map(([key, value, unit]) => ({ key, type: 'number', label: t(`camjob.f.${key}`), icon: spec.icon, value, step: unit === 'mm' ? 0.5 : 1, ...(unit ? { unit } : {}) })),
      ...(spec.select ? [{ key: spec.select[0], type: 'select', label: t(`camjob.f.${spec.select[0]}`), icon: spec.icon, value: spec.select[1][0], options: spec.select[1].map((s) => [s, t(`camjob.side.${s}`)]) }] : []),
    ] });
    if (!picked) return null;
    const { op: _op, ...params } = picked.values;
    if (boundary) params.boundary = boundary.points.slice(0, -1);
    setJob('camjob.op.dressup', (x) => { x.ops = x.ops.map((o) => (o.id === picked.op.id ? { ...o, dressups: [...o.dressups, { type, params }] } : o)); return x; });
    app.notify('success', t('camjob.dressed', { name: picked.op.name, type: t(`camjob.dress.${type}`) }));
    return picked.op.id;
  }

  // ── job

  async function fixtures() {
    const now = job()?.fixtures ?? ['G54'];
    const v = await ask('camjob.fixture', 'camFixture', FIXTURES.map((f) => ({ key: f, type: 'check', label: f, icon: 'camFixture', value: now.includes(f) })), 400);
    if (v) setJob('camjob.op.fixture', (x) => { x.fixtures = FIXTURES.filter((f) => v[f]); return x; });
  }

  async function propertyBag() {
    const bag = job()?.propertyBag ?? {};
    const v = await ask('camjob.propertyBag', 'camPropertyBag', [{ key: 'text', type: 'textarea', label: t('camjob.bagHint'), icon: 'camPropertyBag', value: Object.entries(bag).map(([k, x]) => `${k} = ${x}`).join('\n'), rows: 8 }]);
    if (!v) return;
    const next = {};
    for (const line of String(v.text).split(/\r?\n/)) { const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line); if (m) next[m[1]] = m[2].trim(); }
    setJob('camjob.op.bag', (x) => { x.propertyBag = next; return x; });
  }

  function programText() {
    const j = job();
    return jobGcode(j, context, { title: drawing().title || app.docName(app.activeDoc()) });
  }

  async function inspect() {
    const ops = job()?.ops ?? [];
    if (!ops.length) { app.notify('info', t('camjob.noOps')); return null; }
    const text = programText();
    await app.form({ title: t('camjob.inspect'), icon: 'camInspect', width: 640, fields: [{ key: 'gcode', type: 'textarea', label: t('camjob.program', { lines: text.split('\n').length }), icon: 'camPost', value: text, rows: 18 }], actions: [{ id: 'ok', label: t('sk.close'), primary: true }] });
    return text;
  }

  async function sanity() {
    const issues = sanityCheck(job() ?? emptyJob(), context);
    await app.form({ title: t('camjob.sanity'), icon: 'camSanity', width: 560, intro: issues.length ? t('camjob.sanityFound', { count: issues.length }) : t('camjob.sanityOk'), fields: issues.slice(0, 20).map((issue, i) => ({ key: `i${i}`, type: 'info', label: t(`camjob.issue.${issue.key}`), icon: issue.level === 'error' ? 'warning' : 'info', value: issue.name ?? '' })), actions: [{ id: 'ok', label: t('sk.close'), primary: true }] });
    return issues;
  }

  async function exportTemplate() {
    const j = job() ?? emptyJob();
    const template = { name: j.name, tools: j.tools, controllers: j.controllers, fixtures: j.fixtures, propertyBag: j.propertyBag, stock: j.stock, ops: j.ops.map(({ id, type, name, options, dressups }) => ({ id, type, name, options, dressups })) };
    return app.saveText(`${j.name || 'job'}-template.json`, `${JSON.stringify(template, null, 2)}\n`, 'json');
  }

  async function post() {
    if (!job()?.ops?.length) { app.notify('info', t('camjob.noOps')); return null; }
    const text = programText();
    await app.saveText(`${app.docName(app.activeDoc()).replace(/\.[^.]+$/, '')}.nc`, text, 'nc');
    return text;
  }

  /** CAM_SelectLoop: the picked edge's whole face outline (3D), or the selected line's connected chain (2D). */
  function selectLoop() {
    const edge = (state.elements ?? []).find((el) => el.kind === 'edge');
    if (edge) {
      const entity = drawing().entities.find((e) => e.id === edge.id);
      const topology = app.topologyOfEntity(entity);
      const faces = topology.edges[edge.index]?.faces ?? [];
      // The face on the edge that faces up most (the top of a pocket wall, as FreeCAD picks).
      const face = faces.slice().sort((a, b) => (topology.faces[b]?.normal?.[2] ?? 0) - (topology.faces[a]?.normal?.[2] ?? 0))[0];
      const loop = topology.edges.filter((e) => e.faces.includes(face)).map((e) => ({ id: entity.id, kind: 'edge', index: e.index, signature: { mid: e.mid, dir: e.dir, length: e.length } }));
      state.elements = [...(state.elements ?? []).filter((el) => el.id !== entity.id || el.kind !== 'edge'), ...loop];
      app.view3d.instance?.setElementHighlight(state.elements);
      app.notify('success', t('camjob.loopSelected', { count: loop.length }));
      return loop.length;
    }
    const d = drawing();
    const start = app.selectedEntities()[0];
    if (!start) { app.notify('info', t('camjob.pickEdge')); return 0; }
    const ends = (e) => { const p = pathPoints(e)?.points; return p ? [p[0], p[p.length - 1]] : []; };
    const chain = new Set([start.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of d.entities) {
        if (chain.has(e.id) || !pathPoints(e)) continue;
        const touches = ends(e).some((p) => [...chain].some((id) => ends(d.entities.find((x) => x.id === id)).some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6)));
        if (touches) { chain.add(e.id); grew = true; }
      }
    }
    app.select([...chain]);
    app.notify('success', t('camjob.loopSelected', { count: chain.size }));
    return chain.size;
  }

  async function startPoint() {
    const picked = await pickOp('camjob.startPoint', 'camStartPoint');
    if (!picked) return;
    startFor = picked.op.id;
    if (state.view3d) await app.toggle3d(false);
    app.setTool('camStart');
  }

  // ── tools

  const toolFields = (tool = {}) => [
    { key: 'name', type: 'text', label: t('camjob.toolName'), icon: 'camToolCreate', value: tool.name ?? t('camjob.defaultTool') },
    { key: 'kind', type: 'select', label: t('camjob.toolKind'), icon: 'camToolCreate', value: tool.kind ?? 'endmill', options: TOOL_KINDS.map((k) => [k, t(`camjob.kind.${k}`)]) },
    { key: 'diameter', type: 'number', label: t('camjob.diameter'), icon: 'camToolCreate', value: tool.diameter ?? 6, min: 0.01, step: 0.5, unit: 'mm' },
    { key: 'angle', type: 'number', label: t('camjob.toolAngle'), icon: 'camVcarve', value: tool.angle ?? 90, min: 1, max: 179, step: 5, unit: '°' },
    { key: 'flutes', type: 'number', label: t('camjob.flutes'), icon: 'camToolCreate', value: tool.flutes ?? 2, min: 1, max: 12, step: 1 },
    { key: 'length', type: 'number', label: t('camjob.toolLength'), icon: 'camToolCreate', value: tool.length ?? 50, min: 1, step: 1, unit: 'mm' },
    { key: 'pitch', type: 'number', label: t('camjob.f.pitch'), icon: 'camThread', value: tool.pitch ?? 1, min: 0.01, step: 0.25, unit: 'mm' },
  ];

  /** A tool into the library and the job, with a controller for it. */
  function addTool(tool, { toLibrary = true } = {}) {
    if (toLibrary) app.updateSettings({ camToolLibrary: [...library().filter((x) => x.id !== tool.id), tool] });
    setJob('camjob.op.tool', (j) => {
      if (!j.tools.some((x) => x.id === tool.id)) j.tools.push(tool);
      if (!j.controllers.some((c) => c.tool === tool.id)) j.controllers.push(normalizeController({ name: `TC${j.controllers.length + 1}`, tool: tool.id, number: j.controllers.length + 1 }));
      return j;
    });
    app.notify('success', t('camjob.toolAdded', { name: tool.name }));
    return tool;
  }

  async function toolCreate() {
    const v = await ask('camjob.toolCreate', 'camToolCreate', toolFields());
    return v ? addTool(normalizeTool({ ...v, id: camId('t') })) : null;
  }

  async function toolDock() {
    const lib = library();
    if (!lib.length) { app.notify('info', t('camjob.libraryEmpty')); return null; }
    const v = await ask('camjob.toolDock', 'camToolDock', [{ key: 'tool', type: 'select', label: t('camjob.tool'), icon: 'camToolDock', value: lib[0].id, options: lib.map((x) => [x.id, `${x.name} · ⌀${x.diameter}`]) }], 440);
    return v ? addTool(lib.find((x) => x.id === v.tool), { toLibrary: false }) : null;
  }

  async function toolLibrary() {
    const lib = library();
    if (!lib.length) { app.notify('info', t('camjob.libraryEmpty')); return; }
    const v = await ask('camjob.toolLibrary', 'camToolLibrary', lib.map((x) => ({ key: x.id, type: 'check', label: `${x.name} · ${t(`camjob.kind.${x.kind}`)} ⌀${x.diameter}`, icon: 'camToolCreate', value: true })));
    if (v) app.updateSettings({ camToolLibrary: lib.filter((x) => v[x.id]) });
  }

  async function toolLoad(given = null) {
    const file = given ?? await app.readTextFileDialog(['fctb', 'json']);
    if (!file) return null;
    try { return addTool({ ...toolFromFctb(file.text), id: camId('t') }); } catch (error) { app.notify('error', t('camjob.badTool', { name: file.name })); return null; }
  }

  async function toolSave(asNew) {
    const tools = [...(job()?.tools ?? []), ...library()].filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i);
    if (!tools.length) { app.notify('info', t('camjob.libraryEmpty')); return null; }
    const v = await ask(asNew ? 'camjob.toolSaveAs' : 'camjob.toolSave', 'camToolSave', [
      { key: 'tool', type: 'select', label: t('camjob.tool'), icon: 'camToolSave', value: tools[0].id, options: tools.map((x) => [x.id, x.name]) },
      ...(asNew ? [{ key: 'name', type: 'text', label: t('camjob.toolName'), icon: 'camToolSave', value: tools[0].name }] : []),
    ], 440);
    if (!v) return null;
    const tool = { ...tools.find((x) => x.id === v.tool), ...(asNew && v.name ? { name: v.name } : {}) };
    return app.saveText(`${tool.name.replace(/[^\w.-]+/g, '_')}.fctb`, toolToFctb(tool), 'fctb');
  }

  async function controller() {
    const j = ensureJob();
    const v = await ask('camjob.controllerNew', 'camController', [
      { key: 'tool', type: 'select', label: t('camjob.tool'), icon: 'camToolCreate', value: j.tools[0]?.id, options: j.tools.map((x) => [x.id, `${x.name} · ⌀${x.diameter}`]) },
      { key: 'number', type: 'number', label: t('camjob.toolNumber'), icon: 'camController', value: j.controllers.length + 1, min: 1, step: 1 },
      { key: 'spindle', type: 'number', label: t('cam.spindle'), icon: 'camController', value: 12000, min: 0, step: 500, unit: 'rpm' },
      { key: 'feed', type: 'number', label: t('cam.feed'), icon: 'camController', value: 600, min: 1, step: 50, unit: 'mm/min' },
      { key: 'plunge', type: 'number', label: t('cam.plunge'), icon: 'camController', value: 150, min: 1, step: 25, unit: 'mm/min' },
    ]);
    if (!v) return null;
    const tc = normalizeController({ ...v, name: `TC${j.controllers.length + 1}` });
    setJob('camjob.op.controller', (x) => { x.controllers.push(tc); return x; });
    return tc;
  }

  const hasJobOps = () => Boolean(job()?.ops?.length);
  return {
    ...Object.fromEntries(Object.keys(OPS).map((type) => [`camjob:${type}`, { icon: OPS[type].icon, label: `camjob.op.${type}`, enabled: hasDoc, run: () => newOp(type) }])),
    'camjob:shapeTC': { icon: 'camShapeTC', label: 'camjob.op.shapeTC', enabled: hasDoc, run: () => newOp('shape') },
    'camjob:array': { icon: 'camArray', label: 'camjob.op.array', enabled: hasJobOps, run: () => arrayOp() },
    'camjob:compound': { icon: 'camCompound', label: 'camjob.op.compound', enabled: hasJobOps, run: () => compoundOp() },
    'camjob:simpleCopy': { icon: 'camSimpleCopy', label: 'camjob.simpleCopy', enabled: hasJobOps, run: () => simpleCopy() },
    'camjob:operationCopy': { icon: 'camOpCopy', label: 'camjob.operationCopy', enabled: hasJobOps, run: () => operationCopy() },
    'camjob:toggleActive': { icon: 'camToggle', label: 'camjob.toggleActive', enabled: hasJobOps, run: () => toggleActive() },
    ...Object.fromEntries(DRESSUP_TYPES.map((type) => [`camjob:dress:${type}`, { icon: DRESSUPS[type].icon, label: `camjob.dress.${type}`, enabled: hasJobOps, run: () => dressup(type) }])),
    'camjob:fixture': { icon: 'camFixture', label: 'camjob.fixture', enabled: hasDoc, run: () => fixtures() },
    'camjob:propertyBag': { icon: 'camPropertyBag', label: 'camjob.propertyBag', enabled: hasDoc, run: () => propertyBag() },
    'camjob:inspect': { icon: 'camInspect', label: 'camjob.inspect', enabled: hasJobOps, run: () => inspect() },
    'camjob:sanity': { icon: 'camSanity', label: 'camjob.sanity', enabled: hasDoc, run: () => sanity() },
    'camjob:exportTemplate': { icon: 'camTemplate', label: 'camjob.exportTemplate', enabled: hasDoc, run: () => exportTemplate() },
    'camjob:post': { icon: 'camPost', label: 'camjob.post', enabled: hasJobOps, run: () => post() },
    'camjob:selectLoop': { icon: 'camSelectLoop', label: 'camjob.selectLoop', enabled: () => (state.elements ?? []).some((el) => el.kind === 'edge') || app.selectedIds().length > 0, run: () => selectLoop() },
    'camjob:startPoint': { icon: 'camStartPoint', label: 'camjob.startPoint', enabled: hasJobOps, run: () => startPoint() },
    'camjob:toolCreate': { icon: 'camToolCreate', label: 'camjob.toolCreate', enabled: hasDoc, run: () => toolCreate() },
    'camjob:toolDock': { icon: 'camToolDock', label: 'camjob.toolDock', enabled: hasDoc, run: () => toolDock() },
    'camjob:toolLibrary': { icon: 'camToolLibrary', label: 'camjob.toolLibrary', enabled: hasDoc, run: () => toolLibrary() },
    'camjob:toolLoad': { icon: 'camToolLoad', label: 'camjob.toolLoad', enabled: hasDoc, run: () => toolLoad() },
    'camjob:toolSave': { icon: 'camToolSave', label: 'camjob.toolSave', enabled: hasDoc, run: () => toolSave(false) },
    'camjob:toolSaveAs': { icon: 'camToolSave', label: 'camjob.toolSaveAs', enabled: hasDoc, run: () => toolSave(true) },
    'camjob:controller': { icon: 'camController', label: 'camjob.controllerNew', enabled: hasDoc, run: () => controller() },
  };
}

export const CAMJOB_MENU = {
  ops: ['camjob:adaptive', 'camjob:area', 'camjob:areaWorkplane', 'camjob:millFace', '-', 'camjob:helix', 'camjob:threadMilling', 'camjob:tapping', 'camjob:slot', 'camjob:deburr', 'camjob:vcarve', '-', 'camjob:shape', 'camjob:shapeTC', 'camjob:probe', '-', 'camjob:custom', 'camjob:comment', 'camjob:stop'],
  job: ['camjob:post', 'camjob:inspect', 'camjob:sanity', '-', 'camjob:array', 'camjob:compound', 'camjob:simpleCopy', 'camjob:operationCopy', 'camjob:toggleActive', '-', 'camjob:fixture', 'camjob:propertyBag', 'camjob:startPoint', 'camjob:selectLoop', 'camjob:exportTemplate'],
  dressups: DRESSUP_TYPES.map((type) => `camjob:dress:${type}`),
  tools: ['camjob:toolCreate', 'camjob:toolDock', 'camjob:toolLibrary', 'camjob:toolLoad', 'camjob:toolSave', 'camjob:toolSaveAs', '-', 'camjob:controller'],
};

export const CAMJOB_FREECAD = {
  CAM_Adaptive: 'camjob:adaptive', CAM_Area: 'camjob:area', CAM_Area_Workplane: 'camjob:areaWorkplane', CAM_Array: 'camjob:array', CAM_Comment: 'camjob:comment',
  CAM_Compound: 'camjob:compound', CAM_Custom: 'camjob:custom', CAM_Deburr: 'camjob:deburr', CAM_DressupArray: 'camjob:dress:array', CAM_DressupAxisMap: 'camjob:dress:axisMap',
  CAM_DressupDogbone: 'camjob:dress:dogbone', CAM_DressupDragKnife: 'camjob:dress:dragKnife', CAM_DressupLeadInOut: 'camjob:dress:leadInOut', CAM_DressupPathBoundary: 'camjob:dress:boundary',
  CAM_DressupRampEntry: 'camjob:dress:rampEntry', CAM_DressupTag: 'camjob:dress:tag', CAM_DressupZCorrect: 'camjob:dress:zCorrect', CAM_ExportTemplate: 'camjob:exportTemplate',
  CAM_Fixture: 'camjob:fixture', CAM_Helix: 'camjob:helix', CAM_Inspect: 'camjob:inspect', CAM_MillFace: 'camjob:millFace', CAM_OpActiveToggle: 'camjob:toggleActive',
  CAM_OperationCopy: 'camjob:operationCopy', CAM_PathShapeTC: 'camjob:shapeTC', CAM_Probe: 'camjob:probe', CAM_PropertyBag: 'camjob:propertyBag', CAM_Sanity: 'camjob:sanity',
  CAM_SelectLoop: 'camjob:selectLoop', CAM_SetStartPoint: 'camjob:startPoint', CAM_Shape: 'camjob:shape', CAM_SimpleCopy: 'camjob:simpleCopy', CAM_Slot: 'camjob:slot',
  CAM_Stop: 'camjob:stop', CAM_Tapping: 'camjob:tapping', CAM_ThreadMilling: 'camjob:threadMilling', CAM_ToolBitCreate: 'camjob:toolCreate', CAM_ToolBitDock: 'camjob:toolDock',
  CAM_ToolBitLibraryOpen: 'camjob:toolLibrary', CAM_ToolBitLoad: 'camjob:toolLoad', CAM_ToolBitSave: 'camjob:toolSave', CAM_ToolBitSaveAs: 'camjob:toolSaveAs',
  CAM_ToolController: 'camjob:controller', CAM_Vcarve: 'camjob:vcarve',
};
