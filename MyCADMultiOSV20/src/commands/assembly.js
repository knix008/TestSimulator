// FreeCAD's Assembly and Robot commands MyCAD did not have yet. Assembly:
// assemblies (new, active), new parts, inserting components from other open
// drawings (copied or linked), grounding, solving, the ball, distance,
// parallel, perpendicular and angle joints (in app.js with the others), the
// couplings (gears, belt, rack and pinion, screw), an exploded view, the bill
// of materials and ASMT export. Robot: tool shape on the flange, home pose,
// default orientation and move values, trajectories from edges, compound and
// dressed-up trajectories.
import './assembly-icons.js';
import { normalizeEntity } from '../domain/entities.js';
import { billOfMaterials, jointKeys, poseOf, toAsmt } from '../domain/assembly.js';
import { compoundTrajectory, dressUpTrajectory, flangePose, robotJointValues } from '../domain/robot.js';
import { solidMesh, solidProperties } from '../domain/solids.js';
import { pathPoints } from '../domain/draft.js';


export function assemblyCommands(app) {
  const { t, state } = app;
  const drawing = () => app.activeDrawing();
  const hasDoc = () => Boolean(app.activeDoc());
  const solids = () => app.selectedSolids();
  const groups = () => drawing()?.groups ?? [];
  const assemblies = () => groups().filter((g) => g.assembly);
  const ok = () => [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'ok', label: t('confirm.ok'), primary: true }];
  const ask = async (titleKey, icon, fields, width = 480) => { const a = await app.form({ title: t(titleKey), icon, width, fields, actions: ok() }); return a?.action === 'ok' ? a.values : null; };
  const centreOf = (e) => { const tris = solidMesh(e); const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity]; for (const tri of tris) for (const p of tri) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } return Number.isFinite(lo[0]) ? lo.map((v, k) => (v + hi[k]) / 2) : null; };

  // ── assemblies and parts

  function createAssembly() {
    const group = { id: app.newId(), name: t('asm.assemblyN', { n: assemblies().length + 1 }), parent: null, assembly: true };
    const ids = solids().map((e) => e.id);
    app.change('asm.op.create', (d) => { d.groups = [...(d.groups ?? []), group]; for (const id of ids) app.D.updateEntity(d, id, { group: group.id }); });
    state.activeAssembly = group.id;
    app.showTree();
    app.notify('success', t('asm.created', { name: group.name }));
    return group;
  }

  async function activate() {
    const list = assemblies();
    if (!list.length) { app.notify('info', t('asm.noAssembly')); return; }
    const v = await ask('asm.activate', 'asmActivate', [{ key: 'id', type: 'select', label: t('asm.assembly'), icon: 'asmCreate', value: state.activeAssembly ?? list[0].id, options: [['', t('asm.none')], ...list.map((g) => [g.id, g.name])] }], 440);
    if (!v) return;
    state.activeAssembly = v.id || null;
    app.showTree();
  }

  function newPart() {
    const parent = assemblies().find((g) => g.id === state.activeAssembly)?.id ?? null;
    const part = { id: app.newId(), name: t('asm.partN', { n: groups().filter((g) => g.part).length + 1 }), parent, part: true, placement: { x: 0, y: 0, z: 0, rz: 0 } };
    app.change('asm.op.newPart', (d) => { d.groups = [...(d.groups ?? []), part]; });
    app.showTree();
    app.notify('success', t('asm.partMade', { name: part.name }));
    return part;
  }

  /** Assembly_Insert / Assembly_InsertLink: solids of another open drawing, copied or linked here. */
  async function insert(link) {
    const others = app.state.docs.filter((doc) => doc.id !== app.state.active);
    const items = others.flatMap((doc) => doc.drawing.entities.filter((e) => e.type === 'solid').map((e) => ({ doc, e })));
    if (!items.length) { app.notify('info', t('asm.nothingToInsert')); return null; }
    const v = await ask(link ? 'asm.insertLink' : 'asm.insert', link ? 'asmInsertLink' : 'asmInsert', items.slice(0, 40).map((item, i) => ({ key: `c${i}`, type: 'check', label: `${app.docName(item.doc)} › ${app.labelOf(item.e)}`, icon: 'part', value: i === 0 })), 560);
    if (!v) return null;
    const chosen = items.filter((_, i) => v[`c${i}`]);
    const parent = assemblies().find((g) => g.id === state.activeAssembly)?.id;
    const made = app.change('asm.op.insert', (d) => chosen.map(({ doc, e }) => {
      const { id: _id, ...copy } = structuredClone(e);
      const raw = link
        ? { ...copy, clone: { of: e.id, cx: 0, cy: 0, dx: 0, dy: 0, angle: 0, scale: 1, flip: false, link: true, external: { file: doc.path ?? '', title: app.docName(doc), cache: structuredClone(e) } } }
        : copy;
      const entity = normalizeEntity({ ...raw, group: parent ?? undefined });
      if (entity) d.entities.push(entity);
      return entity;
    }).filter(Boolean));
    app.select(made.map((e) => e.id));
    app.notify('success', t('asm.inserted', { count: made.length }));
    return made;
  }

  function toggleGrounded() {
    const list = solids();
    const on = !list.every((e) => e.grounded);
    app.change('asm.op.grounded', (d) => { for (const e of list) app.D.updateEntity(d, e.id, { grounded: on || undefined }); });
    app.notify('success', t(on ? 'asm.grounded' : 'asm.ungrounded', { count: list.length }));
  }

  function solve() {
    app.change('asm.op.solve', (d) => { d.joints = [...(d.joints ?? [])]; });
    const status = app.activeDoc()?.assemblyStatus;
    const failed = status?.failed?.length ?? 0;
    app.notify(failed ? 'error' : 'success', failed ? t('asm.solveFailed', { count: failed }) : t('asm.solved', { count: drawing().joints?.length ?? 0 }));
    return status;
  }

  // ── couplings

  /** Assembly_CreateJointGears / Belt / RackPinion / Screw: one joint's value follows another's. */
  async function coupling(kind) {
    const joints = drawing().joints ?? [];
    const turning = joints.filter((j) => jointKeys(j.type).includes('angle'));
    const sliding = joints.filter((j) => jointKeys(j.type).includes('offset'));
    const leaders = turning;
    const followers = kind === 'rackPinion' ? sliding : kind === 'screw' ? joints.filter((j) => jointKeys(j.type).includes('offset')) : turning;
    if (!leaders.length || !followers.length) { app.notify('info', t('asm.needJoints')); return null; }
    const name = (j) => `${j.id} · ${t(`joint.${j.type}`)}`;
    const fields = [
      ...(kind === 'screw' ? [] : [{ key: 'leader', type: 'select', label: t('asm.leader'), icon: 'jointRevolute', value: leaders[0].id, options: leaders.map((j) => [j.id, name(j)]) }]),
      { key: 'follower', type: 'select', label: t(kind === 'screw' ? 'asm.screwJoint' : 'asm.follower'), icon: 'jointSlider', value: followers.find((j) => j.id !== leaders[0].id)?.id ?? followers[0].id, options: followers.map((j) => [j.id, name(j)]) },
      ...(kind === 'gears' || kind === 'belt' ? [
        { key: 'r1', type: 'number', label: t('asm.radius1'), icon: 'jointGears', value: 20, min: 0.001, step: 1, unit: 'mm' },
        { key: 'r2', type: 'number', label: t('asm.radius2'), icon: 'jointGears', value: 10, min: 0.001, step: 1, unit: 'mm' },
      ] : kind === 'rackPinion' ? [{ key: 'r1', type: 'number', label: t('asm.pinionRadius'), icon: 'jointRackPinion', value: 10, min: 0.001, step: 1, unit: 'mm' }]
        : [{ key: 'pitch', type: 'number', label: t('asm.pitch'), icon: 'jointScrew', value: 2, step: 0.25, unit: 'mm' }]),
    ];
    const v = await ask(`asm.coupling.${kind}`, { gears: 'jointGears', belt: 'jointBelt', rackPinion: 'jointRackPinion', screw: 'jointScrew' }[kind], fields);
    if (!v) return null;
    const leader = kind === 'screw' ? v.follower : v.leader;
    // gears turn the other way; a belt the same way; a rack moves 2πr per turn; a screw its pitch per turn.
    const ratio = kind === 'gears' ? -v.r1 / v.r2 : kind === 'belt' ? v.r1 / v.r2 : kind === 'rackPinion' ? (2 * Math.PI * v.r1) / 360 : v.pitch / 360;
    const key = kind === 'rackPinion' || kind === 'screw' ? 'offset' : 'angle';
    app.change('asm.op.coupling', (d) => { d.joints = d.joints.map((j) => (j.id === v.follower ? { ...j, follow: { joint: leader, key, from: 'angle', ratio, phase: 0 } } : j)); });
    app.notify('success', t('asm.coupled', { ratio: app.fmt(ratio, 4) }));
    return ratio;
  }

  // ── views and reports

  async function explodedView() {
    const now = drawing().exploded?.factor ?? 0;
    const v = await ask('asm.explodedView', 'asmExplode', [{ key: 'factor', type: 'number', label: t('asm.explodeFactor'), icon: 'asmExplode', value: now || 1, min: 0, max: 10, step: 0.25 }], 440);
    if (!v) return;
    app.change('asm.op.explode', (d) => { if (v.factor > 0) d.exploded = { factor: v.factor }; else delete d.exploded; });
    if (!state.view3d) await app.toggle3d(true); else app.rebuild3d();
  }

  function parts() {
    const asm = assemblies().find((g) => g.id === state.activeAssembly);
    const all = drawing().entities.filter((e) => e.type === 'solid' && !['datum', 'wire3d'].includes(e.kind));
    return asm ? all.filter((e) => e.group === asm.id || groups().some((g) => g.id === e.group && g.parent === asm.id)) : all;
  }

  function bom() {
    const rows = billOfMaterials(parts(), { volumeOf: (e) => solidProperties(e).volume ?? 0, nameOf: (e) => app.labelOf(e) });
    const head = [t('asm.bom.index'), t('asm.bom.name'), t('asm.bom.count'), t('asm.bom.material'), t('asm.bom.volume')];
    const lines = [head, ...rows.map((r) => [String(r.index), r.name, String(r.count), r.material || '—', `${app.fmt(r.volume / 1000, 3)} cm³`])];
    const widths = head.map((_, c) => Math.max(...lines.map((l) => l[c].length)));
    const text = lines.map((l) => l.map((cell, c) => cell.padEnd(widths[c])).join('  ')).join('\n');
    const doc = { id: app.newId(), name: t('asm.bomName'), text };
    app.change('asm.op.bom', (d) => { d.textDocs = [...(d.textDocs ?? []), doc]; });
    app.showTree();
    app.notify('success', t('asm.bomMade', { count: rows.length }));
    return rows;
  }

  async function exportAsmt() {
    const text = toAsmt(parts(), drawing().joints ?? [], { name: assemblies().find((g) => g.id === state.activeAssembly)?.name ?? app.docName(app.activeDoc()), massOf: (e) => (solidProperties(e).volume ?? 0) * (e.physical?.density ?? 7850) * 1e-9 });
    await app.saveText(`${app.docName(app.activeDoc()).replace(/\.[^.]+$/, '')}.asmt`, text, 'asmt');
    return text;
  }

  // ── robot

  const robots = () => drawing().entities.filter((e) => e.kind === 'robot');
  const robotOf = () => solids().find((e) => e.kind === 'robot') ?? (robots().length === 1 ? robots()[0] : null);
  const dataOf = (id) => drawing().robots?.[id] ?? { defaults: { speed: 50, accel: 50, cont: false } };
  const setData = (label, id, patch) => app.change(label, (d) => { d.robots = { ...(d.robots ?? {}), [id]: { ...(d.robots?.[id] ?? { defaults: { speed: 50, accel: 50, cont: false } }), ...patch } }; });
  const needRobot = (fn) => () => { const r = robotOf(); if (!r) { app.notify('info', t('notice.robotNone')); return null; } return fn(r); };

  function addTool(robot) {
    const tool = solids().find((e) => e.kind !== 'robot');
    if (!tool) { app.notify('info', t('robot.pickTool')); return; }
    const flange = flangePose(poseOf(robot), robotJointValues(robot), robot.params?.reach ?? 1);
    // rel = flange⁻¹ · tool
    const inv = (m) => { const r = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]]; const tt = [m[3], m[7], m[11]]; return [r[0], r[1], r[2], -(r[0] * tt[0] + r[1] * tt[1] + r[2] * tt[2]), r[3], r[4], r[5], -(r[3] * tt[0] + r[4] * tt[1] + r[5] * tt[2]), r[6], r[7], r[8], -(r[6] * tt[0] + r[7] * tt[1] + r[8] * tt[2])]; };
    const mul = (a, b) => [0, 1, 2].flatMap((i) => [0, 1, 2, 3].map((j) => a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j] + (j === 3 ? a[i * 4 + 3] : 0)));
    setData('robot.op.tool', robot.id, { tool: { id: tool.id, rel: mul(inv(flange), poseOf(tool)) } });
    app.notify('success', t('robot.toolSet', { name: app.labelOf(tool) }));
  }

  async function orientation(robot) {
    const now = dataOf(robot.id).orientation ?? [0, 180, 0];
    const v = await ask('robot.orientation', 'robotOrientation', ['a', 'b', 'c'].map((k, i) => ({ key: k, type: 'number', label: t(`robot.angle.${k}`), icon: 'rotate', value: now[i], step: 5, unit: '°' })), 420);
    if (v) setData('robot.op.defaults', robot.id, { orientation: [v.a, v.b, v.c] });
  }

  async function defaults(robot) {
    const d = dataOf(robot.id).defaults;
    const v = await ask('robot.defaults', 'robotDefaults', [
      { key: 'speed', type: 'number', label: t('robot.speed'), icon: 'robotDefaults', value: d.speed, min: 1, max: 100, step: 5, unit: '%' },
      { key: 'accel', type: 'number', label: t('robot.accel'), icon: 'robotDefaults', value: d.accel, min: 1, max: 100, step: 5, unit: '%' },
      { key: 'cont', type: 'check', label: t('robot.cont'), icon: 'robotDefaults', value: d.cont },
    ], 420);
    if (v) setData('robot.op.defaults', robot.id, { defaults: { speed: v.speed, accel: v.accel, cont: v.cont } });
  }

  function edgeToTrajectory(robot) {
    const edges = (state.elements ?? []).filter((el) => el.kind === 'edge').map((el) => app.elementPoints(el));
    const wires = app.selectedEntities().filter((e) => e.type !== 'solid').map((e) => pathPoints(e)).filter(Boolean).map((p) => p.points.map((q) => [q.x, q.y, 0]));
    const points = [...edges, ...wires].flat();
    if (points.length < 2) { app.notify('info', t('robot.pickEdges')); return null; }
    const data = dataOf(robot.id);
    const list = data.trajectories ?? [];
    const traj = { id: `t${Date.now().toString(36)}`, name: t('robot.trajectoryN', { n: list.length + 1 }), points, speed: data.defaults.speed, accel: data.defaults.accel, cont: data.defaults.cont, ...(data.orientation ? { orientation: data.orientation } : {}) };
    setData('robot.op.trajectory', robot.id, { trajectories: [...list, traj] });
    app.notify('success', t('robot.trajectoryMade', { name: traj.name, count: points.length }));
    return traj;
  }

  async function compound(robot) {
    const list = dataOf(robot.id).trajectories ?? [];
    if (list.length < 2) { app.notify('info', t('robot.needTrajectories')); return; }
    const v = await ask('robot.compound', 'robotCompound', list.map((tr) => ({ key: tr.id, type: 'check', label: tr.name, icon: 'robotEdge2Trac', value: true })));
    if (!v) return;
    const chosen = list.filter((tr) => v[tr.id]);
    if (chosen.length < 2) return;
    setData('robot.op.trajectory', robot.id, { trajectories: [...list, compoundTrajectory(chosen, t('robot.compoundN', { n: list.length + 1 }))] });
  }

  async function dressUp(robot) {
    const list = dataOf(robot.id).trajectories ?? [];
    if (!list.length) { app.notify('info', t('robot.needTrajectories')); return; }
    const v = await ask('robot.dressUp', 'robotDressUp', [
      { key: 'id', type: 'select', label: t('robot.trajectory'), icon: 'robotEdge2Trac', value: list[0].id, options: list.map((tr) => [tr.id, tr.name]) },
      { key: 'speed', type: 'number', label: t('robot.speed'), icon: 'robotDefaults', value: list[0].speed, min: 1, max: 100, step: 5, unit: '%' },
      { key: 'accel', type: 'number', label: t('robot.accel'), icon: 'robotDefaults', value: list[0].accel, min: 1, max: 100, step: 5, unit: '%' },
      { key: 'cont', type: 'check', label: t('robot.cont'), icon: 'robotDefaults', value: list[0].cont },
      { key: 'dx', type: 'number', label: t('robot.offsetX'), icon: 'move', value: 0, step: 1, unit: 'mm' },
      { key: 'dy', type: 'number', label: t('robot.offsetY'), icon: 'move', value: 0, step: 1, unit: 'mm' },
      { key: 'dz', type: 'number', label: t('robot.offsetZ'), icon: 'move', value: 0, step: 1, unit: 'mm' },
    ]);
    if (!v) return;
    const base = list.find((tr) => tr.id === v.id);
    setData('robot.op.trajectory', robot.id, { trajectories: [...list, dressUpTrajectory(base, { offset: [v.dx, v.dy, v.dz], speed: v.speed, accel: v.accel, cont: v.cont }, `${base.name} (${t('robot.dressed')})`)] });
  }

  async function runTrajectory(robot) {
    const list = dataOf(robot.id).trajectories ?? [];
    if (!list.length) { app.notify('info', t('robot.needTrajectories')); return null; }
    const v = list.length === 1 ? { id: list[0].id } : await ask('robot.run', 'robotRun', [{ key: 'id', type: 'select', label: t('robot.trajectory'), icon: 'robotEdge2Trac', value: list[0].id, options: list.map((tr) => [tr.id, tr.name]) }], 440);
    if (!v) return null;
    const traj = list.find((tr) => tr.id === v.id);
    return app.robotTrajectory({ robot, targets: traj.points, save: false });
  }

  const twoSolids = () => solids().length === 2;
  const robotRun = (fn) => ({ enabled: () => robots().length > 0, run: needRobot(fn) });
  return {
    'asm:create': { icon: 'asmCreate', label: 'asm.create', enabled: hasDoc, run: () => createAssembly() },
    'asm:activate': { icon: 'asmActivate', label: 'asm.activate', enabled: () => assemblies().length > 0, run: () => activate() },
    'asm:newPart': { icon: 'asmNewPart', label: 'asm.newPart', enabled: hasDoc, run: () => newPart() },
    'asm:insert': { icon: 'asmInsert', label: 'asm.insert', enabled: () => app.state.docs.length > 1, run: () => insert(false) },
    'asm:insertLink': { icon: 'asmInsertLink', label: 'asm.insertLink', enabled: () => app.state.docs.length > 1, run: () => insert(true) },
    'asm:grounded': { icon: 'asmGrounded', label: 'asm.toggleGrounded', enabled: () => solids().length > 0, checked: () => solids().length > 0 && solids().every((e) => e.grounded), run: () => toggleGrounded() },
    'asm:solve': { icon: 'asmSolve', label: 'asm.solve', enabled: () => Boolean(drawing()?.joints?.length), run: () => solve() },
    'asm:explodedView': { icon: 'asmExplode', label: 'asm.explodedView', enabled: hasDoc, checked: () => Boolean(drawing()?.exploded), run: () => explodedView() },
    'asm:bom': { icon: 'asmBom', label: 'asm.bom', enabled: () => Boolean(drawing()?.entities.some((e) => e.type === 'solid')), run: () => bom() },
    'asm:exportAsmt': { icon: 'asmExportAsmt', label: 'asm.exportAsmt', enabled: () => Boolean(drawing()?.entities.some((e) => e.type === 'solid')), run: () => exportAsmt() },
    'joint:gears': { icon: 'jointGears', label: 'asm.coupling.gears', enabled: () => (drawing()?.joints?.length ?? 0) >= 2, run: () => coupling('gears') },
    'joint:belt': { icon: 'jointBelt', label: 'asm.coupling.belt', enabled: () => (drawing()?.joints?.length ?? 0) >= 2, run: () => coupling('belt') },
    'joint:rackPinion': { icon: 'jointRackPinion', label: 'asm.coupling.rackPinion', enabled: () => (drawing()?.joints?.length ?? 0) >= 2, run: () => coupling('rackPinion') },
    'joint:screw': { icon: 'jointScrew', label: 'asm.coupling.screw', enabled: () => Boolean(drawing()?.joints?.length), run: () => coupling('screw') },
    'robot:tool': { icon: 'robotTool', label: 'robot.tool', enabled: () => twoSolids() && solids().some((e) => e.kind === 'robot'), run: needRobot(addTool) },
    'robot:setHome': { icon: 'robotSetHome', label: 'robot.setHome', ...robotRun((r) => { setData('robot.op.home', r.id, { home: robotJointValues(r) }); app.notify('success', t('robot.homeSet')); }) },
    'robot:home': { icon: 'robotHome', label: 'robot.home', ...robotRun((r) => { const home = dataOf(r.id).home ?? [0, -90, 90, 0, 90, 0]; app.change('robot.op.home', (d) => app.D.updateEntity(d, r.id, { params: { ...r.params, ...Object.fromEntries(home.map((v, i) => [`a${i + 1}`, v])) } })); }) },
    'robot:orientation': { icon: 'robotOrientation', label: 'robot.orientation', ...robotRun(orientation) },
    'robot:defaults': { icon: 'robotDefaults', label: 'robot.defaults', ...robotRun(defaults) },
    'robot:edge2trac': { icon: 'robotEdge2Trac', label: 'robot.edge2trac', ...robotRun(edgeToTrajectory) },
    'robot:compound': { icon: 'robotCompound', label: 'robot.compound', ...robotRun(compound) },
    'robot:dressUp': { icon: 'robotDressUp', label: 'robot.dressUp', ...robotRun(dressUp) },
    'robot:run': { icon: 'robotRun', label: 'robot.run', ...robotRun(runTrajectory) },
  };
}

export const ASSEMBLY_MENU = {
  assembly: ['asm:create', 'asm:activate', 'asm:newPart', 'asm:insert', 'asm:insertLink', '-', 'asm:grounded', 'asm:solve', '-', 'joint:gears', 'joint:belt', 'joint:rackPinion', 'joint:screw', '-', 'asm:explodedView', 'asm:bom', 'asm:exportAsmt'],
  robot: ['robot:tool', 'robot:setHome', 'robot:home', 'robot:orientation', 'robot:defaults', '-', 'robot:edge2trac', 'robot:compound', 'robot:dressUp', 'robot:run'],
};

export const ASSEMBLY_FREECAD = {
  Assembly_ActivateAssembly: 'asm:activate', Assembly_CreateAssembly: 'asm:create', Assembly_CreateBom: 'asm:bom', Assembly_CreateJointAngle: 'joint:angle',
  Assembly_CreateJointBall: 'joint:ball', Assembly_CreateJointBelt: 'joint:belt', Assembly_CreateJointDistance: 'joint:distance', Assembly_CreateJointGearBelt: 'group',
  Assembly_CreateJointGears: 'joint:gears', Assembly_CreateJointParallel: 'joint:parallel', Assembly_CreateJointPerpendicular: 'joint:perpendicular',
  Assembly_CreateJointRackPinion: 'joint:rackPinion', Assembly_CreateJointScrew: 'joint:screw', Assembly_CreateView: 'asm:explodedView', Assembly_ExportASMT: 'asm:exportAsmt',
  Assembly_Insert: 'asm:insert', Assembly_InsertLink: 'asm:insertLink', Assembly_InsertNewPart: 'asm:newPart', Assembly_SolveAssembly: 'asm:solve', Assembly_ToggleGrounded: 'asm:grounded',
  Robot_AddToolShape: 'robot:tool', Robot_Edge2Trac: 'robot:edge2trac', Robot_RestoreHomePos: 'robot:home', Robot_SetDefaultOrientation: 'robot:orientation',
  Robot_SetDefaultValues: 'robot:defaults', Robot_SetHomePos: 'robot:setHome', Robot_TrajectoryCompound: 'robot:compound', Robot_TrajectoryDressUp: 'robot:dressUp',
};
