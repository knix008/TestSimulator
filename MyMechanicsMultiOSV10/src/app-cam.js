// The main window's side of CAM (app-mfg.js chains it onto app-more.js's hooks): the CAM PropertyManager with
// set-up (machine, stock, work offset, post), the tool library, recognised features, the operation list and
// each operation's parameters, toolpath generation and display, material removal simulation with the gouge
// check, cycle time, G-code and the set-up sheet (saved through the app's export path; tests hand in a hook).
// The machining itself is in cad/cam-*.js (no DOM).
import * as THREE from 'three';
import { machiningModel, recognizeFeatures, turningProfile, threadHints } from './cad/cam-features.js';
import { camContext, defaultStock, planOperations, generateProgram, generateToolpath, createOp, OP_DEFAULTS, MILL_OPS, TURN_OPS, stockVolume, expandMoves, profileAt } from './cad/cam-ops.js';
import { simulateMilling, gougeCheck, simulateTurning, turnGougeCheck, cycleTime, zmapMesh } from './cad/cam-sim.js';
import { postProcess, POSTS, POST_IDS, WCS_ORIGINS, setupSheetHtml, wcsOrigin } from './cad/cam-post.js';
import { cloneTools, MACHINES, machineOf, cutMaterialOf, CUT_MATERIALS, MILL_TOOL_TYPES, TURN_TOOL_TYPES, isTurnTool, parseInsert, withInsert } from './cad/cam-tools.js';
import { materialName } from './cad/materials.js';
import { passList } from './cad/cam-edit.js';
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';

const TABS = ['setup', 'tools', 'features', 'ops', 'sim', 'post'];
const OP_ICONS = {
  facing: 'camFacing', pocket: 'camPocket', adaptive: 'camAdaptive', contour: 'camContour', slot: 'camSlot', helix: 'camHelix', spot: 'camSpot', drill: 'camDrill', peck: 'camPeck', chipBreak: 'camPeck', tap: 'camTap',
  zlevel: 'camZLevel', parallel: 'camParallel', scallop: 'camScallop', waterline: 'camWaterline',
  rotary4: 'camRotary4', multi5: 'camMulti5', mtAxial: 'camMillTurnAxial', mtRadial: 'camMillTurnRadial',
  tFace: 'camTurnFace', tRough: 'camTurnRough', tFinish: 'camTurnFinish', tDrill: 'camDrill', tBoreRough: 'camTurnBore', tBoreFinish: 'camTurnBore', tGroove: 'camTurnGroove', tThread: 'camTurnThread',
};
const FEATURE_ICONS = { face: 'camFacing', pocket: 'camPocket', slot: 'camSlot', boss: 'camBoss', step: 'camStep', hole: 'camDrill', surface3d: 'camParallel' };
const TOOL_ICONS = { flat: 'camToolFlat', ball: 'camToolBall', bull: 'camToolBull', face: 'camFacing', drill: 'camDrill', spot: 'camSpot', tap: 'camTap', turnRough: 'camTurnRough', turnFinish: 'camTurnFinish', bore: 'camTurnBore', groove: 'camTurnGroove', thread: 'camTurnThread', turnDrill: 'camDrill' };
const PATH_COLOURS = ['#1e88e5', '#43a047', '#8e24aa', '#f4511e', '#00897b', '#6d4c41', '#3949ab', '#c0ca33', '#d81b60', '#00acc1'];
const NUM_PARAMS = ['stepdown', 'stepover', 'leave', 'leaveZ', 'ramp', 'engagement', 'scallop', 'angle', 'sample', 'depth', 'dwell', 'peck', 'breakThrough', 'pitch', 'passes', 'length', 'z1', 'major', 'clearance', 'rpm', 'feedRate', 'plungeRate', 'vc', 'feedRev', 'angleStep', 'maxTilt', 'lead', 'count', 'startAngle', 'z'];
const PERCENT = new Set(['stepover']);
const MT_OPS = ['mtAxial', 'mtRadial'];
const MULTI_NOTES = { rotary4: 'cam.note.rotary4', multi5: 'cam.note.multi5', mtAxial: 'cam.note.mtAxial', mtRadial: 'cam.note.mtRadial' };

export function createCamTools(ctx) {
  const { state, t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const part = () => ctx.activePart();
  const editing = () => state.editing;
  const owns = (e) => e?.mode === 'cam';
  const fmt = (v, d = 2) => ctx.fmt(v, d);
  const sel = (key, options, current, label, glyph = null) => `<label class="pm-field" title="${escapeHtml(label)}">${glyph ? icon(glyph) : ''}<span class="pm-label">${escapeHtml(label)}</span><select data-pm-select="${escapeHtml(key)}" aria-label="${escapeHtml(label)}">${options.map(([v, text]) => `<option value="${escapeHtml(v)}" ${String(v) === String(current ?? '') ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select></label>`;
  const check = (key, on, label, glyph) => `<label class="pm-check" title="${escapeHtml(label)}"><input type="checkbox" data-pm-toggle="${escapeHtml(key)}" ${on ? 'checked' : ''}/>${icon(glyph)}<span>${escapeHtml(label)}</span></label>`;
  let saveHook = null;
  const runtime = { key: null, model: null, rec: null, profile: null, program: null, sim: null, check: null, times: null, partId: null, opCache: new Map() };

  // ───────────────────────── the machining worker (generation and simulation off this thread)

  // One worker kept between requests: it loads the kernel once and keeps the machining model of the part last
  // sent (the B-rep goes over only when the part's key changes). Cancel ends it; the next request starts a new one.
  let worker = null; let workerKey = null; let requests = 0;
  const useWorker = () => typeof Worker !== 'undefined' && !state.settings?.camInline;
  function camWorker() {
    if (!worker) { worker = new Worker(new URL('./workers/cam-worker.js', import.meta.url), { type: 'module' }); workerKey = null; }
    return worker;
  }
  function stopWorker() { try { worker?.terminate(); } catch { /* gone */ } worker = null; workerKey = null; }

  /** One request to the worker: resolves with its result, null when cancelled; progress goes to `report`. */
  function inWorker(message, entry, report, signal) {
    return new Promise((resolve, reject) => {
      const w = camWorker();
      const id = ++requests;
      const send = { ...message, id, key: runtime.key };
      if (workerKey !== runtime.key) {
        let brep = null; try { brep = entry.body?.serialize?.() ?? null; } catch { brep = null; }
        Object.assign(send, { brep, mesh: entry.mesh });
      }
      const done = (fn, v) => { clearInterval(timer); w.removeEventListener('message', onMessage); w.removeEventListener('error', onError); fn(v); };
      const onMessage = (event) => {
        const m = event.data;
        if (m?.id !== id) return;
        if (m.type === 'progress') report?.({ fraction: m.fraction, text: m.text });
        else if (m.type === 'done') { workerKey = runtime.key; done(resolve, m.result); }
        else if (m.type === 'error') done(reject, new Error(m.message));
      };
      const onError = (event) => { stopWorker(); done(reject, new Error(event.message ?? 'worker')); };
      const timer = setInterval(() => { if (signal?.cancelled) { stopWorker(); done(resolve, null); } }, 100);
      w.addEventListener('message', onMessage);
      w.addEventListener('error', onError);
      w.postMessage(send);
    });
  }

  /** What a toolpath depends on besides the part: the operation, its tool, the stock, machine and material. */
  const opKey = (cam, op, rt) => JSON.stringify([rt.key, op, cam.tools.find((x) => x.id === op.tool) ?? null, rt.stock, cam.machine, cam.material ?? part()?.material ?? null]);

  // ───────────────────────── data

  /** The part's CAM set-up (made on first use: the machine from the shape, the default tools). */
  function camOf(p, { create = false } = {}) {
    if (!p.cam && create) p.cam = { machine: 'vmc', post: 'fanuc', stock: { mode: 'auto', margin: 2, top: 2, bottom: 0 }, wcs: 'stockTopCenter', tools: cloneTools(), ops: [], program: 1001, coolant: true, material: null };
    return p.cam ?? null;
  }
  const isLathe = (cam) => machineOf(cam?.machine).kind === 'lathe';
  const edit = (mutate) => ctx.change('op.cam', () => { const cam = camOf(part(), { create: true }); mutate(cam); });

  /** The machining model of the part as built (cached by its build). */
  function model() {
    const p = part();
    if (!p) return null;
    const entry = ctx.buildPart(p);
    if (!entry?.mesh) return null;
    const cam = camOf(p);
    const key = `${p.id}|${entry.key}|${JSON.stringify(cam?.stock ?? null)}|${cam?.machine}`;
    if (runtime.key !== key) {
      const m = machiningModel(entry.mesh, { shape: entry.body ?? null });
      const stock = stockOf(cam, m);
      Object.assign(runtime, { key, partId: p.id, model: m, stock, rec: recognizeFeatures(m, { stockTop: stock.kind === 'bar' ? stock.z1 : stock.z1, hints: { threads: threadHints(p) } }), profile: null, program: null, sim: null, check: null, times: null });
      if (isLathe(cam)) { try { runtime.profile = turningProfile(m); } catch { runtime.profile = null; } }
    }
    return runtime;
  }

  function stockOf(cam, m) {
    const s = cam?.stock ?? { mode: 'auto', margin: 2, top: 2, bottom: 0 };
    if (isLathe(cam)) {
      const auto = defaultStock(m.bounds, { turning: true, margin: Number(s.margin) || 0, top: Number(s.top) || 0, bottom: 0 });
      auto.z0 = m.bounds.lo[2];
      return s.mode === 'custom' && s.r > 0 ? { ...auto, r: Number(s.r), z1: Number(s.z1 ?? auto.z1), z0: Number(s.z0 ?? auto.z0), bore: Number(s.bore) || 0 } : auto;
    }
    if (s.mode === 'custom' && ['x0', 'y0', 'z0', 'x1', 'y1', 'z1'].every((k) => Number.isFinite(Number(s[k])))) return { kind: 'box', x0: Number(s.x0), y0: Number(s.y0), z0: Number(s.z0), x1: Number(s.x1), y1: Number(s.y1), z1: Number(s.z1) };
    return defaultStock(m.bounds, { margin: Number(s.margin) || 0, top: Number(s.top) || 0, bottom: Number(s.bottom) || 0 });
  }

  function camCtx(cam, rt) {
    return camContext({ model: rt.model, stock: rt.stock, tools: cam.tools, machine: cam.machine, material: cam.material ?? part().material, features: rt.rec.features, profile: rt.profile });
  }

  // ───────────────────────── editing

  function begin(tab = 'setup', extra = {}) {
    const p = part();
    if (!p) { notify('info', t('cam.needPart')); return; }
    if (!camOf(p)) ctx.change('op.cam', () => { camOf(p, { create: true }); });
    if (editing() && !owns(editing())) ctx.cancelEditing({ quiet: true });
    state.editing = { mode: 'cam', tab, opId: editing()?.opId ?? null, toolId: null, showPath: true, showRapids: true, showStock: true, showSim: true, play: 100, ...extra };
    state.leftTab = 'pm';
    ctx.syncView(); ctx.renderAll();
  }
  const finish = () => ctx.cancelEditing({ quiet: true });

  /** A tool for an operation type (the largest that fits the feature). */
  function toolFor(cam, type, feature) {
    const pick = (types, pred = () => true) => cam.tools.filter((x) => types.includes(x.type) && pred(x)).sort((a, b) => b.d - a.d);
    const width = feature?.width ?? feature?.d ?? Infinity;
    switch (type) {
      case 'facing': return pick(['face'])[0] ?? pick(['flat'])[0];
      case 'pocket': case 'adaptive': case 'contour': case 'zlevel': return pick(['flat'], (x) => x.d <= width * 0.8)[0] ?? pick(['flat']).at(-1);
      case 'slot': return pick(['flat'], (x) => x.d <= width + 1e-6)[0];
      case 'helix': return pick(['flat'], (x) => x.d < (feature?.counterbore?.d ?? feature?.d ?? 20) * 0.9)[0];
      case 'spot': return pick(['spot'])[0];
      case 'drill': case 'peck': case 'chipBreak': return pick(['drill'], (x) => !feature || Math.abs(x.d - feature.d) < 0.06)[0] ?? pick(['drill'])[0];
      case 'tap': return pick(['tap'], (x) => !feature?.thread || x.thread === feature.thread)[0];
      case 'parallel': case 'scallop': case 'waterline': return pick(['ball'])[0] ?? pick(['bull'])[0];
      case 'multi5': return pick(['ball'])[0];
      case 'rotary4': return pick(['ball']).at(-1) ?? pick(['flat']).at(-1);
      case 'mtAxial': return pick(['drill'], (x) => !feature || Math.abs(x.d - feature.d) < 0.06)[0] ?? pick(['drill'])[0];
      case 'mtRadial': return pick(['drill'])[0];
      case 'tFace': case 'tRough': return pick(['turnRough'])[0];
      case 'tFinish': return pick(['turnFinish'])[0];
      case 'tBoreRough': case 'tBoreFinish': return pick(['bore'])[0];
      case 'tGroove': return pick(['groove'])[0];
      case 'tThread': return pick(['thread'])[0];
      case 'tDrill': return pick(['turnDrill'])[0];
      default: return cam.tools[0];
    }
  }
  const FEATURE_TYPES_FOR = { facing: ['face'], pocket: ['pocket', 'step', 'hole'], adaptive: ['pocket', 'step'], contour: ['pocket', 'boss', 'slot'], slot: ['slot'], helix: ['hole'], spot: ['hole'], drill: ['hole'], peck: ['hole'], chipBreak: ['hole'], tap: ['hole'], parallel: ['surface3d'], scallop: ['surface3d'] };

  function addOp(type) {
    const p = part();
    if (!p) { notify('info', t('cam.needPart')); return; }
    const cam = camOf(p, { create: true });
    // Mill-turn live-tool operations run on the lathe set-up.
    const lathe = TURN_OPS.includes(type) || MT_OPS.includes(type);
    if (lathe !== isLathe(cam)) { ctx.change('op.cam', () => { const c = camOf(p, { create: true }); c.machine = lathe ? 'lathe' : 'vmc'; c.post = machineOf(c.machine).post; }); }
    const rt = model();
    if (!rt) { notify('info', t('notice.noBody')); return; }
    const feats = rt.rec.features.filter((f) => (FEATURE_TYPES_FOR[type] ?? []).includes(f.type));
    const feature = ['drill', 'peck', 'chipBreak', 'tap', 'spot', 'zlevel', 'waterline'].includes(type) ? null : feats[0] ?? null;
    const tool = toolFor(camOf(p), type, feature);
    if (!tool) { notify('error', t('cam.noToolFor', { op: t(`cam.op.${type}`) })); return; }
    const id = ctx.newId('op');
    edit((c) => { c.ops.push(createOp(type, { id, tool: tool.id, feature: feature?.id ?? null, name: `${t(`cam.op.${type}`)}${feature ? ` (${featureName(feature)})` : ''}` })); });
    begin('ops', { opId: id });
    notify('success', t('cam.opAdded', { name: t(`cam.op.${type}`) }));
  }

  function featureName(f) { return `${t(`cam.feature.${f.type}`)} ${f.id.replace(/^\D+/, '')}`; }

  function recognize() {
    const rt = model();
    if (!rt) { notify('info', t('notice.noBody')); return; }
    begin('features');
    notify('success', t('cam.recognized', { count: rt.rec.features.length }));
  }

  function planAll() {
    const p = part(); const rt = model();
    if (!p || !rt) { notify('info', t('notice.noBody')); return; }
    const cam = camOf(p, { create: true });
    const lathe = isLathe(cam);
    if (lathe && !rt.profile) { notify('error', t('cam.error.notTurnable')); return; }
    const ops = planOperations(rt.rec.features, cam.tools, { turning: lathe, profile: rt.profile }).map((o) => ({ ...o, id: ctx.newId('op'), name: `${t(`cam.op.${o.type}`)}${o.feature ? ` (${featureName(rt.rec.features.find((f) => f.id === o.feature))})` : ''}` }));
    edit((c) => { c.ops = ops; });
    begin('ops');
    notify('success', t('cam.planned', { count: ops.length }));
  }

  async function generate({ quiet = false } = {}) {
    const p = part(); const rt = model();
    if (!p || !rt) { notify('info', t('notice.noBody')); return null; }
    const cam = camOf(p, { create: true });
    if (!cam.ops.length) { notify('info', t('cam.noOps')); return null; }
    const ops = cam.ops.filter((op) => !op.suppressed);
    const keys = new Map(ops.map((op) => [op.id, opKey(cam, op, rt)]));
    const todo = ops.filter((op) => !runtime.opCache.has(keys.get(op.id)));
    let fresh = { paths: [], errors: [] };
    if (todo.length) {
      fresh = await ctx.withProgress('progress.cam', p.name, async (op, report, signal) => {
        if (!useWorker()) { await new Promise((r) => setTimeout(r, 20)); return generateProgram(camCtx(cam, rt), todo); }
        return inWorker({ kind: 'generate', context: { stock: rt.stock, tools: cam.tools, machine: cam.machine, material: cam.material ?? p.material, features: rt.rec.features, profile: rt.profile }, ops: todo }, ctx.buildPart(p), report, signal);
      }, { delay: 200, cancellable: true }).catch((error) => { notify('error', t('cam.opFailed', { name: p.name, reason: error.message })); return null; });
      if (!fresh) { if (!quiet) notify('info', t('cam.cancelled')); return null; }
      for (const tp of fresh.paths) runtime.opCache.set(keys.get(tp.op), tp);
      if (runtime.opCache.size > 200) runtime.opCache = new Map([...runtime.opCache].slice(-100));
    }
    const program = { paths: ops.map((op) => runtime.opCache.get(keys.get(op.id))).filter(Boolean), errors: fresh.errors };
    runtime.program = program; runtime.sim = null; runtime.check = null;
    runtime.times = cycleTime(program.paths, machineOf(cam.machine));
    for (const tp of program.paths) for (const w of tp.warnings ?? []) notify('warning', t('cam.opWarning', { name: cam.ops.find((o) => o.id === tp.op)?.name ?? tp.op, reason: t(`cam.warn.${w}`, null, w) }));
    for (const er of program.errors) notify('error', t('cam.opFailed', { name: cam.ops.find((o) => o.id === er.op)?.name ?? er.op, reason: t(`cam.error.${er.code}`, null, er.message) }));
    if (!quiet && !program.errors.length) notify('success', t('cam.generated', { count: program.paths.length, time: fmtTime(runtime.times.total) }));
    ctx.syncView(); ctx.renderLeft();
    return program;
  }

  async function simulate() {
    const p = part();
    let rt = model();
    if (!rt) { notify('info', t('notice.noBody')); return null; }
    if (!rt.program) { await generate({ quiet: true }); rt = model(); }
    if (!rt.program?.paths.length) return null;
    const cam = camOf(p);
    const result = await ctx.withProgress('progress.camSim', p.name, async (op, report, signal) => {
      if (useWorker()) {
        const lathe = rt.stock.kind === 'bar';
        const span = lathe ? Math.max(rt.stock.r, rt.stock.z1 - rt.stock.z0) : Math.max(rt.stock.x1 - rt.stock.x0, rt.stock.y1 - rt.stock.y0);
        return inWorker({ kind: 'simulate', stock: rt.stock, paths: rt.program.paths, tools: cam.tools, lathe, profile: rt.profile, cell: lathe ? Math.max(0.05, span / 400) : Math.max(0.2, span / 300), tol: lathe ? Math.max(0.03, span / 800) : 0.03 }, ctx.buildPart(p), report, signal);
      }
      await new Promise((r) => setTimeout(r, 20));
      if (rt.stock.kind === 'bar') {
        const span = Math.max(rt.stock.r, rt.stock.z1 - rt.stock.z0);
        const sim = simulateTurning(rt.stock, rt.program.paths, cam.tools, { cell: Math.max(0.05, span / 400) });
        const at = (z) => profileAt(rt.profile, z);
        return { sim, check: turnGougeCheck(sim, at, { tol: Math.max(0.03, span / 800) }) };
      }
      const span = Math.max(rt.stock.x1 - rt.stock.x0, rt.stock.y1 - rt.stock.y0);
      const cell = Math.max(0.2, span / 300);
      const sim = simulateMilling(rt.stock, rt.program.paths, cam.tools, { cell, onProgress: (f) => report({ fraction: f }) });
      const grid = rt.model.topGrid();
      return { sim, check: gougeCheck(sim, rt.model, { tol: 0.03 }) };
    }, { delay: 150, cancellable: true }).catch((error) => { notify('error', t('cam.opFailed', { name: p.name, reason: error.message })); return null; });
    if (!result) return null;
    runtime.sim = result.sim; runtime.check = result.check;
    const g = result.check.count;
    notify(g ? 'warning' : 'success', g ? t('cam.gouges', { count: g, depth: fmt(result.check.max, 3) }) : t('cam.simulated', { volume: fmt(result.sim.removed / 1000, 1) }));
    if (result.sim.skipped?.length) notify('info', t('cam.simSkipped', { count: result.sim.skipped.length }));
    if (editing()?.mode === 'cam') editing().tab = 'sim';
    ctx.syncView(); ctx.renderLeft();
    return result;
  }


  const fileName = (ext) => `${(part()?.name ?? 'part').replace(/[\\/:*?"<>|]+/g, '_')}${ext}`;
  async function save(name, type, content, mime) {
    if (saveHook) { await saveHook(content, name, type); notify('success', t('notice.exported', { name })); return true; }
    return ctx.saveExport(name, type, content, mime);
  }

  function gcode() {
    const p = part(); const rt = model(); const cam = camOf(p);
    if (!rt?.program) return null;
    return postProcess({ number: cam.program ?? 1001, name: p.name, tools: cam.tools, paths: rt.program.paths, stock: rt.stock, wcs: cam.wcs, bounds: rt.model.bounds, post: cam.post, coolant: cam.coolant !== false, date: new Date().toISOString().slice(0, 10), ops: cam.ops, comp: cam.comp ?? 'computed' });
  }

  async function saveGcode() {
    let rt = model();
    if (!rt) { notify('info', t('notice.noBody')); return false; }
    if (!rt.program) { await generate({ quiet: true }); rt = model(); }
    const code = gcode();
    if (!code) return false;
    return save(fileName('.nc'), 'nc', code, 'text/plain');
  }

  function labels() {
    const L = {};
    for (const k of ['title', 'job', 'material', 'machine', 'post', 'stock', 'wcs', 'cycle', 'cutting', 'rapid', 'changes', 'tools', 'type', 'flutes', 'corner', 'length', 'note', 'ops', 'name', 'speed', 'feed', 'stepdown', 'stepover', 'time']) L[`sheet.${k}`] = t(`cam.sheet.${k}`);
    for (const ty of [...MILL_TOOL_TYPES, ...TURN_TOOL_TYPES]) L[`tool.${ty}`] = t(`cam.tool.${ty}`);
    for (const o of [...MILL_OPS, ...TURN_OPS]) L[`op.${o}`] = t(`cam.op.${o}`);
    for (const w of WCS_ORIGINS) L[`wcs.${w}`] = t(`cam.wcs.${w}`);
    return L;
  }

  function setupSheet() {
    const p = part(); const rt = model(); const cam = camOf(p);
    if (!rt?.program) return null;
    return setupSheetHtml({ name: p.name, material: materialName(cam.material ?? p.material, ctx.lang()), machine: t(`cam.machine.${cam.machine}`), post: t(`cam.post.${cam.post}`), stock: rt.stock, wcs: cam.wcs, origin: wcsOrigin(rt.stock, cam.wcs, rt.model.bounds), tools: cam.tools, ops: cam.ops, paths: rt.program.paths, times: rt.times, labels: labels(), date: new Date().toLocaleString(), lang: ctx.lang() });
  }

  async function saveSetupSheet() {
    let rt = model();
    if (!rt) { notify('info', t('notice.noBody')); return false; }
    if (!rt.program) { await generate({ quiet: true }); rt = model(); }
    const html = setupSheet();
    if (!html) return false;
    return save(fileName('-setup.html'), 'html', html, 'text/html');
  }

  // ───────────────────────── PropertyManager

  const fmtTime = (s) => { const m = Math.floor(s / 60); const r = Math.round(s - m * 60); return `${m}:${String(r).padStart(2, '0')}`; };

  function pm(e) {
    const { pmHead, pmSeg } = ctx.pm;
    const p = part();
    const cam = p ? camOf(p) : null;
    if (!p || !cam) return pmHead('camManager', t('cmd.camManager'), t('cam.needPart'));
    const tabs = pmSeg('camTab', TABS.map((k) => [k, t(`cam.tab.${k}`), `camTab_${k}`]), e.tab);
    const body = { setup: setupPm, tools: toolsPm, features: featuresPm, ops: opsPm, sim: simPm, post: postPm }[e.tab]?.(e, cam) ?? '';
    return [pmHead('camManager', t('cmd.camManager'), t('pm.help.cam')), `<div class="pm-group cam-tabs">${tabs}</div>`, body].join('');
  }

  function setupPm(e, cam) {
    const { pmGroup, pmNum } = ctx.pm;
    const rt = model();
    const lathe = isLathe(cam);
    const s = cam.stock ?? {};
    const st = rt?.stock;
    const matId = cam.material ?? part().material;
    const machine = sel('camMachine', MACHINES.map((m) => [m.id, t(`cam.machine.${m.id}`)]), cam.machine, t('cam.machine'), lathe ? 'camTurnRough' : 'camMachine');
    const posts = sel('camPost', POST_IDS.filter((id) => POSTS[id].kind === (lathe ? 'lathe' : 'mill')).map((id) => [id, t(`cam.post.${id}`)]), cam.post, t('cam.postProcessor'), 'camPost');
    const comp = lathe ? sel('camComp', [['computed', t('cam.comp.computed')], ['control', t('cam.comp.control')]], cam.comp ?? 'computed', t('cam.comp'), 'camTurnFinish') : '';
    const wcs = lathe ? comp : sel('camWcs', WCS_ORIGINS.map((w) => [w, t(`cam.wcs.${w}`)]), cam.wcs, t('cam.wcsOrigin'), 'camWcs');
    const mat = `<p class="pm-note">${icon('material', 'icon tiny')} ${escapeHtml(materialName(matId, ctx.lang()))} → ${escapeHtml(t(`cam.cut.${cutMaterialOf(matId)}`))}</p>${sel('camCutMaterial', [['', t('cam.cut.fromPart')], ...Object.keys(CUT_MATERIALS).map((k) => [k, t(`cam.cut.${k}`)])], cam.cutClass ?? '', t('cam.cutClass'), 'material')}`;
    const stockMode = ctx.pm.pmSeg('camStockMode', [['auto', t('cam.stock.auto'), 'camStock'], ['custom', t('cam.stock.custom'), 'edit']], s.mode ?? 'auto');
    let stockFields;
    if (s.mode === 'custom') stockFields = lathe ? ['r', 'z0', 'z1', 'bore'].map((k) => pmNum(`camStock.${k}`, s[k] ?? (st?.[k] ?? 0), t(`cam.stock.${k}`), 'camStock', 'mm')).join('') : ['x0', 'y0', 'z0', 'x1', 'y1', 'z1'].map((k) => pmNum(`camStock.${k}`, s[k] ?? st?.[k] ?? 0, t(`cam.stock.${k}`), 'camStock', 'mm')).join('');
    else stockFields = ['margin', 'top', ...(lathe ? [] : ['bottom'])].map((k) => pmNum(`camStock.${k}`, s[k] ?? 0, t(`cam.stock.${k}`), 'camStock', 'mm')).join('');
    const stockText = st ? (st.kind === 'bar' ? `Ø${fmt(2 * st.r)} × ${fmt(st.z1 - st.z0)} mm` : `${fmt(st.x1 - st.x0)} × ${fmt(st.y1 - st.y0)} × ${fmt(st.z1 - st.z0)} mm`) : '—';
    return [
      pmGroup('camMachine', t('cam.machineGroup'), `${machine}${posts}${wcs}${pmNum('camProgram', cam.program ?? 1001, t('cam.programNumber'), 'camPost')}${check('camCoolant', cam.coolant !== false, t('cam.coolant'), 'camCoolant')}`),
      pmGroup('material', t('cam.materialGroup'), mat),
      pmGroup('camStock', t('cam.stockGroup'), `${stockMode}${stockFields}<p class="pm-note">${escapeHtml(stockText)}${st ? ` · ${escapeHtml(t('cam.stock.volume'))} ${fmt(stockVolume(st) / 1000, 1)} cm³` : ''}</p>`),
    ].join('');
  }

  function toolsPm(e, cam) {
    const { pmGroup, pmNum, pmButton } = ctx.pm;
    const lathe = isLathe(cam);
    const list = cam.tools.filter((x) => isTurnTool(x) === lathe);
    const rows = list.map((x) => `<button type="button" class="cam-row ${e.toolId === x.id ? 'active' : ''}" data-pm="cam.selTool:${escapeHtml(x.id)}" title="${escapeHtml(t(`cam.tool.${x.type}`))}">${icon(TOOL_ICONS[x.type] ?? 'camToolFlat', 'icon tiny')}<b>T${x.T}</b><span class="grow">${escapeHtml(t(`cam.tool.${x.type}`))} Ø${fmt(x.d)}${x.thread ? ` ${x.thread}` : ''}${x.rc ? ` R${fmt(x.rc)}` : ''}</span><span class="pm-count">${escapeHtml(x.grade === 'hss' ? 'HSS' : t('cam.grade.carbide'))}</span></button>`).join('');
    const tool = cam.tools.find((x) => x.id === e.toolId);
    const insert = tool && lathe ? `<label class="pm-field" title="${escapeHtml(t('cam.toolField.insert'))}">${icon('camTurnRough')}<span class="pm-label">${escapeHtml(t('cam.toolField.insert'))}</span>${ctx.pm.textInput('camTool.insert', tool.insert ?? '')}</label>` : '';
    const fields = tool ? insert + ['T', 'd', ...(lathe ? ['nose', 'angle', 'approach', 'width'] : ['flutes', 'rc', 'flute', 'length', 'tip', 'pitch'])].map((k) => pmNum(`camTool.${k}`, tool[k] ?? 0, t(`cam.toolField.${k}`), k === 'T' ? 'camTool' : 'smartDim', ['T', 'flutes', 'angle', 'tip'].includes(k) ? '' : 'mm')).join('') + sel('camToolGrade', [['carbide', t('cam.grade.carbide')], ['hss', 'HSS']], tool.grade ?? 'carbide', t('cam.grade'), 'material') + `<div class="pm-row">${pmButton(`cam.delTool:${tool.id}`, 'trash', t('action.delete'))}</div>` : `<p class="pm-note">${escapeHtml(t('cam.pickTool'))}</p>`;
    const types = lathe ? TURN_TOOL_TYPES : MILL_TOOL_TYPES;
    return [
      pmGroup('camTool', t('cam.toolLibrary'), `<div class="cam-list">${rows}</div><div class="pm-row">${sel('camNewToolType', types.map((ty) => [ty, t(`cam.tool.${ty}`)]), e.newToolType ?? types[0], t('cam.toolType'))}${pmButton('cam.addTool', 'plus', t('cam.addTool'))}</div>`),
      pmGroup('edit', t('cam.toolData'), fields),
    ].join('');
  }

  function featuresPm(e, cam) {
    const { pmGroup, pmButton } = ctx.pm;
    const rt = model();
    if (!rt) return pmGroup('camRecognize', t('cam.features'), `<p class="pm-note">${escapeHtml(t('notice.noBody'))}</p>`);
    const lathe = isLathe(cam);
    let body;
    if (lathe) {
      const pf = rt.profile;
      body = pf ? `<p class="pm-note">${escapeHtml(t('cam.turnProfile', { d: fmt(2 * pf.maxR), l: fmt(pf.front - pf.back), bore: pf.bore > 0 ? fmt(2 * pf.bore) : '—', grooves: pf.grooves.length }))}</p>` : `<p class="pm-note warn">${escapeHtml(t('cam.error.notTurnable'))}</p>`;
    } else {
      body = rt.rec.features.map((f) => `<div class="cam-row ${e.featureId === f.id ? 'active' : ''}"><button type="button" class="icon-button" data-pm="cam.selFeature:${escapeHtml(f.id)}" title="${escapeHtml(t('cam.showFeature'))}">${icon(FEATURE_ICONS[f.type] ?? 'camPocket', 'icon tiny')}</button><span class="grow">${escapeHtml(featureName(f))} — ${escapeHtml(featureDetail(f))}</span><button type="button" class="icon-button" data-pm="cam.planFeature:${escapeHtml(f.id)}" title="${escapeHtml(t('cam.planFeature'))}">${icon('plus', 'icon tiny')}</button></div>`).join('') || `<p class="pm-note">${escapeHtml(t('cam.noFeatures'))}</p>`;
      if (rt.rec.turnable) body += `<p class="pm-note">${icon('info', 'icon tiny')} ${escapeHtml(t('cam.turnableHint'))}</p>`;
    }
    return pmGroup('camRecognize', t('cam.features'), `<div class="cam-list">${body}</div><div class="pm-row">${pmButton('cam.planAll', 'camPlan', t('cam.planAll'))}</div>`);
  }

  function featureDetail(f) {
    switch (f.type) {
      case 'face': return `Z${fmt(f.z)}`;
      case 'pocket': case 'step': return t('cam.detail.pocket', { depth: fmt(f.depth), floor: fmt(f.floor), w: fmt(f.width ?? 0) });
      case 'slot': return t('cam.detail.slot', { w: fmt(f.width), l: fmt(f.length), depth: fmt(f.depth) });
      case 'boss': return t('cam.detail.boss', { h: fmt(f.height) });
      case 'hole': return `Ø${fmt(f.d)} × ${fmt(f.depth)}${f.through ? ` ${t('cam.through')}` : ''}${f.counterbore ? ` ⌴Ø${fmt(f.counterbore.d)}` : ''}${f.thread ? ` ${f.thread}` : f.tapCandidate ? ` (${t('cam.tapDrillOf', { size: f.tapCandidate })})` : ''}`;
      case 'surface3d': return t('cam.detail.surface', { area: fmt(f.area / 100, 1) });
      default: return '';
    }
  }

  function opsPm(e, cam) {
    const { pmGroup, pmNum, pmButton } = ctx.pm;
    const lathe = isLathe(cam);
    const rt = model();
    const times = rt?.times;
    const pathOf = (id) => rt?.program?.paths.find((x) => x.op === id);
    const rows = cam.ops.map((o, i) => {
      const tool = cam.tools.find((x) => x.id === o.tool);
      const tIndex = rt?.program?.paths.findIndex((x) => x.op === o.id) ?? -1;
      const failed = rt?.program?.errors.find((x) => x.op === o.id);
      return `<div class="cam-row ${e.opId === o.id ? 'active' : ''} ${o.suppressed ? 'muted' : ''} ${failed ? 'error' : ''}"><input type="checkbox" data-pm-toggle="camOpOn:${escapeHtml(o.id)}" ${o.suppressed ? '' : 'checked'} title="${escapeHtml(t('cam.opOn'))}"/><button type="button" class="grow cam-op" data-pm="cam.selOp:${escapeHtml(o.id)}">${icon(OP_ICONS[o.type] ?? 'camPocket', 'icon tiny')}<span>${i + 1}. ${escapeHtml(o.name ?? t(`cam.op.${o.type}`))}</span><span class="pm-count">T${tool?.T ?? '?'}${tIndex >= 0 && times ? ` · ${fmtTime(times.perOp[tIndex])}` : ''}</span></button></div>`;
    }).join('') || `<p class="pm-note">${escapeHtml(t('cam.noOps'))}</p>`;
    const types = lathe ? [...TURN_OPS, ...MT_OPS] : MILL_OPS.filter((ty) => !MT_OPS.includes(ty));
    const add = `<div class="pm-row">${sel('camNewOpType', types.map((ty) => [ty, t(`cam.op.${ty}`)]), e.newOpType ?? types[0], t('cam.opType'))}${pmButton('cam.addOp', 'plus', t('cam.addOp'))}</div>`;
    const op = cam.ops.find((o) => o.id === e.opId);
    let detail = `<p class="pm-note">${escapeHtml(t('cam.pickOp'))}</p>`;
    if (op) {
      const tools = cam.tools.filter((x) => isTurnTool(x) === TURN_OPS.includes(op.type));
      const feats = (rt?.rec.features ?? []).filter((f) => (FEATURE_TYPES_FOR[op.type] ?? []).includes(f.type));
      const keys = Object.keys(OP_DEFAULTS[op.type] ?? {}).filter((k) => NUM_PARAMS.includes(k));
      const num = (k) => pmNum(`camOp.${k}`, PERCENT.has(k) ? Math.round((op[k] ?? 0) * 1000) / 10 : op[k] ?? 0, t(`cam.param.${k}`), 'smartDim', PERCENT.has(k) ? '%' : ['ramp', 'engagement', 'angle', 'passes', 'clearance'].includes(k) ? '' : 'mm');
      const pathInfo = pathOf(op.id);
      detail = [
        `<label class="pm-field">${icon('edit')}<span class="pm-label">${escapeHtml(t('cam.opName'))}</span>${ctx.pm.textInput('camOp.name', op.name ?? '')}</label>`,
        sel('camOpTool', tools.map((x) => [x.id, `T${x.T} ${t(`cam.tool.${x.type}`)} Ø${fmt(x.d)}`]), op.tool, t('cam.tool'), TOOL_ICONS[cam.tools.find((x) => x.id === op.tool)?.type] ?? 'camToolFlat'),
        FEATURE_TYPES_FOR[op.type] ? sel('camOpFeature', [['', t(['drill', 'peck', 'chipBreak', 'tap', 'spot'].includes(op.type) ? 'cam.allMatching' : 'cam.wholePart')], ...feats.map((f) => [f.id, featureName(f)])], op.feature ?? '', t('cam.feature'), 'camRecognize') : '',
        keys.map(num).join(''),
        'pattern' in (OP_DEFAULTS[op.type] ?? {}) ? ctx.pm.pmSeg('camOpPattern', [['lines', t('cam.pattern.lines'), 'camParallel'], ['rings', t('cam.pattern.rings'), 'camRotary4']], op.pattern ?? 'lines') : '',
        MULTI_NOTES[op.type] ? `<p class="pm-note">${escapeHtml(t(MULTI_NOTES[op.type]))}</p>` : '',
        'direction' in (OP_DEFAULTS[op.type] ?? {}) ? ctx.pm.pmSeg('camOpDirection', [['climb', t('cam.climb'), 'camClimb'], ['conventional', t('cam.conventional'), 'camConventional']], op.direction ?? 'climb') : '',
        'finishPass' in (OP_DEFAULTS[op.type] ?? {}) ? check('camOpFinish', op.finishPass, t('cam.finishPass'), 'camContour') : '',
        `<details class="cam-overrides"><summary>${escapeHtml(t('cam.speedsFeeds'))}</summary>${(lathe ? ['vc', 'feedRev'] : ['rpm', 'feedRate', 'plungeRate']).map((k) => pmNum(`camOp.${k}`, op[k] ?? 0, t(`cam.param.${k}`), 'camSpeed', '')).join('')}<p class="pm-note">${escapeHtml(t('cam.zeroIsAuto'))}${pathInfo ? ` · ${pathInfo.css ? `${Math.round(pathInfo.vc)} m/min` : `S${pathInfo.rpm}`} · F${fmt(pathInfo.feed, lathe ? 3 : 0)}` : ''}</p></details>`,
        lathe ? '' : editGroup(e, op, cam, rt),
        `<div class="pm-row">${pmButton(`cam.moveOp:${op.id}|-1`, 'camMoveUp', t('cam.moveUp'))}${pmButton(`cam.moveOp:${op.id}|1`, 'camMoveDown', t('cam.moveDown'))}${pmButton(`cam.genOp:${op.id}`, 'camGenerate', t('cam.generateOne'))}${pmButton(`cam.delOp:${op.id}`, 'trash', t('action.delete'))}</div>`,
      ].join('');
    }
    return [
      pmGroup('camOps', t('cam.operations'), `<div class="cam-list">${rows}</div>${add}<div class="pm-row">${pmButton('cam.planAll', 'camPlan', t('cam.planAll'))}${pmButton('cam.generate', 'camGenerate', t('cmd.camGenerate'))}</div>`),
      pmGroup('edit', t('cam.opParams'), detail),
    ].join('');
  }

  /**
   * Toolpath editing (cad/cam-edit.js) of a milling operation: leads, linking, order, direction, feed, a trim window,
   * and each pass of the generated path (delete / reverse / feed factor). The edits stay with the operation.
   */
  function editGroup(e, op, cam, rt) {
    const { pmNum, pmSeg, pmButton } = ctx.pm;
    const ed = op.edits ?? {};
    const lead = (which) => {
      const L = ed[which] ?? { type: 'none' };
      return `${pmSeg(`camEdit.${which}`, [['none', t('cam.edit.none'), 'close'], ['arc', t('cam.edit.arc'), 'camLeadArc'], ['line', t('cam.edit.line'), 'camLeadLine']], L.type ?? 'none')}${L.type === 'arc' ? `${pmNum(`camEd.${which}.radius`, L.radius ?? 2, t('cam.edit.radius'), 'dimRadius', 'mm')}${pmNum(`camEd.${which}.angle`, L.angle ?? 90, t('cam.edit.angle'), 'dimAngle', '°')}` : ''}${L.type === 'line' ? pmNum(`camEd.${which}.length`, L.length ?? 3, t('cam.edit.length'), 'smartDim', 'mm') : ''}`;
    };
    const link = ed.linking ?? { mode: 'clearance' };
    const trim = ed.trim ?? null;
    let passes = [];
    if (rt) { try { passes = passList(generateToolpath(camCtx(cam, rt), { ...op, edits: null }).moves, ed); } catch { passes = []; } }
    const del = new Set(ed.deleted ?? []), rev = new Set(ed.reversed ?? []);
    const rows = passes.slice(0, 200).map((p) => `<div class="cam-row ${del.has(p.index) ? 'muted' : ''} ${e.passSel === p.index ? 'active' : ''}"><button type="button" class="grow cam-op" data-pm="cam.pass:sel|${p.index}"><span>#${p.index + 1}</span><span class="pm-count">Z ${fmt(p.z, 2)} · ${fmt(p.length, 1)} mm${ed.feeds?.[p.index] ? ` · ×${fmt(ed.feeds[p.index], 2)}` : ''}${rev.has(p.index) ? ' · ⇄' : ''}</span></button><button type="button" class="icon-button" data-pm="cam.pass:rev|${p.index}" title="${escapeHtml(t('cam.edit.reverse'))}">${icon('camReverse', 'icon tiny')}</button><button type="button" class="icon-button" data-pm="cam.pass:del|${p.index}" title="${escapeHtml(t(del.has(p.index) ? 'cam.edit.restore' : 'action.delete'))}">${icon(del.has(p.index) ? 'undo' : 'trash', 'icon tiny')}</button></div>`).join('');
    const passFeed = e.passSel != null && passes.some((p) => p.index === e.passSel) ? pmNum('camEd.passFeed', Math.round((ed.feeds?.[e.passSel] ?? 1) * 100), t('cam.edit.passFeed', { n: e.passSel + 1 }), 'camSpeed', '%') : '';
    return `<details class="cam-overrides cam-edit" ${e.editOpen ? 'open' : ''} data-cam-edit><summary>${icon('camEditPath', 'icon tiny')} ${escapeHtml(t('cam.edit.title'))}${Object.keys(ed).length ? ' •' : ''}</summary>
      <p class="pm-note">${escapeHtml(t('cam.edit.leadIn'))}</p>${lead('leadIn')}
      <p class="pm-note">${escapeHtml(t('cam.edit.leadOut'))}</p>${lead('leadOut')}
      ${pmSeg('camEdit.leadSide', [['left', t('cam.edit.left'), 'camClimb'], ['right', t('cam.edit.right'), 'camConventional']], ed.leadSide ?? 'left')}
      <p class="pm-note">${escapeHtml(t('cam.edit.linking'))}</p>
      ${pmSeg('camEdit.link', [['clearance', t('cam.edit.clearance'), 'camRetract'], ['minimum', t('cam.edit.minimum'), 'camRetractMin'], ['stay', t('cam.edit.stay'), 'camStayDown']], link.mode)}
      ${link.mode === 'stay' ? pmNum('camEd.stayDown', link.stayDown ?? 5, t('cam.edit.stayDown'), 'smartDim', 'mm') : ''}
      ${pmSeg('camEdit.order', [['asis', t('cam.edit.asis'), 'camPlan'], ['nearest', t('cam.edit.nearest'), 'camNearest']], ed.order ?? 'asis')}
      ${check('camEdReverseAll', Boolean(ed.reverseAll), t('cam.edit.reverseAll'), 'camReverse')}
      ${pmNum('camEd.feedAll', Math.round((ed.feedAll ?? 1) * 100), t('cam.edit.feedAll'), 'camSpeed', '%')}
      ${check('camEdTrim', Boolean(trim), t('cam.edit.trim'), 'camTrim')}
      ${trim ? `${['x0', 'x1', 'y0', 'y1'].map((k) => pmNum(`camEd.trim.${k}`, trim[k], t(`cam.edit.${k}`), 'position', 'mm')).join('')}${pmSeg('camEdit.trimKeep', [['inside', t('cam.edit.inside'), 'camTrim'], ['outside', t('cam.edit.outside'), 'camTrimOut']], trim.keep ?? 'inside')}` : ''}
      <p class="pm-note">${escapeHtml(t('cam.edit.passes', { count: passes.length, gone: del.size }))}</p><div class="cam-list cam-passes">${rows}</div>${passFeed}
      <div class="pm-row">${pmButton('cam.resetEdits', 'undo', t('cam.edit.reset'))}</div></details>`;
  }

  /** Changes the selected operation's edits (dropping empty ones) and marks the program to be made again. */
  function editOp(mutate) {
    const e = editing();
    e.editOpen = true;
    edit((c) => {
      const op = c.ops.find((o) => o.id === e.opId);
      if (!op) return;
      const ed = structuredClone(op.edits ?? {});
      mutate(ed);
      for (const k of Object.keys(ed)) { const v = ed[k]; if (v == null || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) delete ed[k]; }
      if (ed.leadIn?.type === 'none') delete ed.leadIn; if (ed.leadOut?.type === 'none') delete ed.leadOut;
      if (ed.linking?.mode === 'clearance') delete ed.linking; if (ed.order === 'asis') delete ed.order; if (ed.feedAll === 1) delete ed.feedAll; if (ed.leadSide === 'left') delete ed.leadSide;
      if (Object.keys(ed).length) op.edits = ed; else delete op.edits;
    });
    invalidate();
  }
  /** The default window: the stock's footprint. */
  const stockBox = () => { const s = runtime.stock; return s && s.kind !== 'bar' ? { x0: s.x0, x1: s.x1, y0: s.y0, y1: s.y1, keep: 'inside' } : { x0: -50, x1: 50, y0: -50, y1: 50, keep: 'inside' }; };

  function simPm(e) {
    const { pmGroup, pmButton, pmNum } = ctx.pm;
    const rt = model();
    const prog = rt?.program;
    const tm = rt?.times;
    const res = [];
    if (prog) {
      res.push(`<li>${icon('camGenerate', 'icon tiny')}<span>${escapeHtml(t('cam.paths', { count: prog.paths.length }))}</span></li>`);
      if (tm) res.push(`<li>${icon('timer', 'icon tiny')}<span>${escapeHtml(t('cam.cycleTime', { total: fmtTime(tm.total), cutting: fmtTime(tm.cutting), rapid: fmtTime(tm.rapid), changes: tm.changes }))}</span></li>`);
    }
    if (rt?.sim) {
      const g = rt.check;
      const expected = stockVolume(rt.stock) - Math.abs(rt.model.welded ? meshVolumeOf(rt) : 0);
      res.push(`<li>${icon('camSimulate', 'icon tiny')}<span>${escapeHtml(t('cam.removed', { removed: fmt(rt.sim.removed / 1000, 2), expected: fmt(expected / 1000, 2) }))}</span></li>`);
      res.push(`<li class="${g.count ? 'error' : ''}">${icon(g.count ? 'error' : 'check', 'icon tiny')}<span>${escapeHtml(g.count ? t('cam.gouges', { count: g.count, depth: fmt(g.max, 3) }) : t('cam.noGouge'))}</span></li>`);
      res.push(`<li>${icon('camStock', 'icon tiny')}<span>${escapeHtml(t('cam.remaining', { volume: fmt(g.remaining / 1000, 2) }))}</span></li>`);
      if (rt.sim.rapidCuts) res.push(`<li class="error">${icon('warning', 'icon tiny')}<span>${escapeHtml(t('cam.rapidCuts', { count: rt.sim.rapidCuts }))}</span></li>`);
    }
    const show = [check('camShowPath', e.showPath, t('cam.showPath'), 'camGenerate'), check('camShowRapids', e.showRapids, t('cam.showRapids'), 'camRapid'), check('camShowStock', e.showStock, t('cam.showStock'), 'camStock'), check('camShowSim', e.showSim, t('cam.showSim'), 'camSimulate')].join('');
    return [
      pmGroup('camSimulate', t('cam.simGroup'), `<div class="pm-row">${pmButton('cam.generate', 'camGenerate', t('cmd.camGenerate'))}${pmButton('cam.simulate', 'camSimulate', t('cmd.camSimulate'))}</div>${pmNum('camPlay', e.play ?? 100, t('cam.play'), 'camPlay', '%')}<ul class="mfg-results">${res.join('') || `<li class="muted">${escapeHtml(t('cam.notGenerated'))}</li>`}</ul>`),
      pmGroup('eye', t('cam.display'), show),
    ].join('');
  }

  function meshVolumeOf(rt) {
    if (rt.partVolume != null) return rt.partVolume;
    const V = rt.model.welded.vertices; const T = rt.model.welded.triangles; let vol = 0;
    for (let k = 0; k < T.length; k += 3) {
      const a = 3 * T[k]; const b = 3 * T[k + 1]; const c = 3 * T[k + 2];
      vol += (V[a] * (V[b + 1] * V[c + 2] - V[b + 2] * V[c + 1]) - V[a + 1] * (V[b] * V[c + 2] - V[b + 2] * V[c]) + V[a + 2] * (V[b] * V[c + 1] - V[b + 1] * V[c])) / 6;
    }
    rt.partVolume = vol;
    return vol;
  }

  function postPm(e, cam) {
    const { pmGroup, pmButton } = ctx.pm;
    const lathe = isLathe(cam);
    const code = model()?.program ? gcode() : null;
    const preview = code ? `<pre class="cam-gcode">${escapeHtml(code.split('\n').slice(0, 60).join('\n'))}${code.split('\n').length > 60 ? '\n…' : ''}</pre><p class="pm-note">${escapeHtml(t('cam.lines', { count: code.split('\n').length - 1 }))}</p>` : `<p class="pm-note">${escapeHtml(t('cam.notGenerated'))}</p>`;
    return [
      pmGroup('camPost', t('cam.postGroup'), `${sel('camPost', POST_IDS.filter((id) => POSTS[id].kind === (lathe ? 'lathe' : 'mill')).map((id) => [id, t(`cam.post.${id}`)]), cam.post, t('cam.postProcessor'), 'camPost')}<div class="pm-row">${pmButton('cam.generate', 'camGenerate', t('cmd.camGenerate'))}${pmButton('cam.saveGcode', 'camPost', t('cmd.camPost'))}${pmButton('cam.saveSheet', 'camSetupSheet', t('cmd.camSetupSheet'))}</div>`),
      pmGroup('file', t('cam.preview'), preview),
    ].join('');
  }

  // ───────────────────────── PropertyManager events

  function field(key, raw) {
    const e = editing(); const p = part(); if (!p) return undefined;
    const v = Number(String(raw).replace(',', '.'));
    if (key === 'camPlay') { e.play = Math.max(0, Math.min(100, Number.isFinite(v) ? v : 100)); ctx.syncView(); return ctx.renderLeft(); }
    if (key === 'camProgram') { if (v > 0) edit((c) => { c.program = Math.round(v); }); return undefined; }
    if (key.startsWith('camStock.')) { const k = key.slice(9); if (Number.isFinite(v)) edit((c) => { c.stock = { ...(c.stock ?? {}), [k]: v }; }); return undefined; }
    if (key === 'camTool.insert') {
      const ins = parseInsert(raw);
      if (String(raw).trim() && !ins) { notify('error', t('cam.badInsert', { code: raw })); return ctx.renderLeft(); }
      edit((c) => { const tool = c.tools.find((x) => x.id === e.toolId); if (tool) { tool.insert = String(raw).trim(); withInsert(tool); } });
      invalidate();
      return undefined;
    }
    if (key.startsWith('camTool.')) {
      const k = key.slice(8);
      if (!Number.isFinite(v) || (k === 'd' && !(v > 0))) { notify('error', t('notice.invalidValue', { text: raw })); return ctx.renderLeft(); }
      edit((c) => { const tool = c.tools.find((x) => x.id === e.toolId); if (tool) tool[k] = k === 'T' || k === 'flutes' ? Math.max(1, Math.round(v)) : v; });
      return undefined;
    }
    if (key.startsWith('camEd.')) {
      const k = key.slice(6);
      if (!Number.isFinite(v)) { notify('error', t('notice.invalidValue', { text: raw })); return ctx.renderLeft(); }
      const lead = /^(leadIn|leadOut)\.(radius|angle|length)$/.exec(k);
      if (lead) { if (!(v > 0)) return ctx.renderLeft(); editOp((ed) => { ed[lead[1]] = { ...(ed[lead[1]] ?? { type: 'arc' }), [lead[2]]: v }; }); return undefined; }
      if (k === 'stayDown') { editOp((ed) => { ed.linking = { mode: 'stay', ...(ed.linking ?? {}), stayDown: Math.max(0, v) }; }); return undefined; }
      if (k === 'feedAll') { if (v > 0) editOp((ed) => { ed.feedAll = v / 100; }); return undefined; }
      if (k === 'passFeed') { if (v > 0 && e.passSel != null) editOp((ed) => { ed.feeds = { ...(ed.feeds ?? {}) }; if (v === 100) delete ed.feeds[e.passSel]; else ed.feeds[e.passSel] = v / 100; }); return undefined; }
      const tr = /^trim\.(x0|x1|y0|y1)$/.exec(k);
      if (tr) { editOp((ed) => { ed.trim = { ...(ed.trim ?? stockBox()), [tr[1]]: v }; }); return undefined; }
      return undefined;
    }
    if (key.startsWith('camOp.')) {
      const k = key.slice(6);
      if (k === 'name') { edit((c) => { const op = c.ops.find((o) => o.id === e.opId); if (op) op.name = String(raw); }); return undefined; }
      if (!Number.isFinite(v)) { notify('error', t('notice.invalidValue', { text: raw })); return ctx.renderLeft(); }
      if (['stepdown', 'sample', 'pitch'].includes(k) && !(v > 0)) { notify('error', t('notice.invalidValue', { text: raw })); return ctx.renderLeft(); }
      edit((c) => { const op = c.ops.find((o) => o.id === e.opId); if (op) op[k] = PERCENT.has(k) ? v / 100 : v; });
      invalidate();
      return undefined;
    }
    return undefined;
  }

  const invalidate = () => { runtime.program = null; runtime.sim = null; runtime.check = null; runtime.times = null; };

  function set(key, value) {
    const e = editing();
    if (key === 'camTab') { e.tab = value; ctx.syncView(); return ctx.renderLeft(); }
    if (key === 'camStockMode') { edit((c) => { c.stock = { ...(c.stock ?? {}), mode: value }; if (value === 'custom' && runtime.stock) Object.assign(c.stock, runtime.stock.kind === 'bar' ? { r: runtime.stock.r, z0: runtime.stock.z0, z1: runtime.stock.z1 } : { x0: runtime.stock.x0, y0: runtime.stock.y0, z0: runtime.stock.z0, x1: runtime.stock.x1, y1: runtime.stock.y1, z1: runtime.stock.z1 }); }); return undefined; }
    if (key === 'camEdit.leadIn' || key === 'camEdit.leadOut') { const w = key.slice(8); editOp((ed) => { ed[w] = { ...(ed[w] ?? {}), type: value }; if (value === 'arc') { ed[w].radius ??= 2; ed[w].angle ??= 90; } if (value === 'line') ed[w].length ??= 3; }); return undefined; }
    if (key === 'camEdit.leadSide') { editOp((ed) => { ed.leadSide = value; }); return undefined; }
    if (key === 'camEdit.link') { editOp((ed) => { ed.linking = { ...(ed.linking ?? {}), mode: value }; if (value === 'stay') ed.linking.stayDown ??= 5; }); return undefined; }
    if (key === 'camEdit.order') { editOp((ed) => { ed.order = value; }); return undefined; }
    if (key === 'camEdit.trimKeep') { editOp((ed) => { ed.trim = { ...(ed.trim ?? stockBox()), keep: value }; }); return undefined; }
    if (key === 'camOpPattern') { edit((c) => { const op = c.ops.find((o) => o.id === e.opId); if (op) op.pattern = value; }); invalidate(); return undefined; }
    if (key === 'camOpDirection') { edit((c) => { const op = c.ops.find((o) => o.id === e.opId); if (op) op.direction = value; }); invalidate(); return undefined; }
    return undefined;
  }

  function select(key, value) {
    const e = editing();
    if (key === 'camMachine') { edit((c) => { const was = isLathe(c); c.machine = value; if (was !== isLathe(c) || POSTS[c.post]?.kind !== machineOf(value).kind) c.post = machineOf(value).post; }); invalidate(); return true; }
    if (key === 'camPost') { edit((c) => { c.post = value; }); return true; }
    if (key === 'camWcs') { edit((c) => { c.wcs = value; }); return true; }
    if (key === 'camComp') { edit((c) => { c.comp = value; }); return true; }
    if (key === 'camCutMaterial') { edit((c) => { c.cutClass = value || null; c.material = value ? null : c.material; }); invalidate(); return true; }
    if (key === 'camNewToolType') { e.newToolType = value; return true; }
    if (key === 'camNewOpType') { e.newOpType = value; return true; }
    if (key === 'camToolGrade') { edit((c) => { const tool = c.tools.find((x) => x.id === e.toolId); if (tool) tool.grade = value; }); invalidate(); return true; }
    if (key === 'camOpTool') { edit((c) => { const op = c.ops.find((o) => o.id === e.opId); if (op) op.tool = value; }); invalidate(); return true; }
    if (key === 'camOpFeature') { edit((c) => { const op = c.ops.find((o) => o.id === e.opId); if (op) op.feature = value || null; }); invalidate(); return true; }
    return false;
  }

  function toggle(key, checked) {
    const e = editing();
    if (key === 'camCoolant') { edit((c) => { c.coolant = checked; }); return undefined; }
    if (key === 'camEdReverseAll') { editOp((ed) => { ed.reverseAll = checked || undefined; }); return undefined; }
    if (key === 'camEdTrim') { editOp((ed) => { ed.trim = checked ? stockBox() : undefined; }); return undefined; }
    if (key === 'camOpFinish') { edit((c) => { const op = c.ops.find((o) => o.id === e.opId); if (op) op.finishPass = checked; }); invalidate(); return undefined; }
    if (key.startsWith('camOpOn:')) { const id = key.slice(8); edit((c) => { const op = c.ops.find((o) => o.id === id); if (op) op.suppressed = !checked; }); invalidate(); return undefined; }
    const show = { camShowPath: 'showPath', camShowRapids: 'showRapids', camShowStock: 'showStock', camShowSim: 'showSim' }[key];
    if (show) { e[show] = checked; ctx.syncView(); }
    return undefined;
  }

  const NAMES = new Set(['cam.pass', 'cam.resetEdits', 'cam.selTool', 'cam.addTool', 'cam.delTool', 'cam.selFeature', 'cam.planFeature', 'cam.planAll', 'cam.selOp', 'cam.addOp', 'cam.delOp', 'cam.moveOp', 'cam.genOp', 'cam.generate', 'cam.simulate', 'cam.saveGcode', 'cam.saveSheet']);
  const handles = (name) => NAMES.has(name);

  async function command(name, arg) {
    const e = editing();
    const p = part();
    if (name === 'clear') return undefined;
    if (!p) return undefined;
    switch (name) {
      case 'cam.selTool': e.toolId = arg; e.tab = 'tools'; return ctx.renderLeft();
      case 'cam.addTool': {
        const type = e.newToolType ?? (isLathe(camOf(p)) ? TURN_TOOL_TYPES : MILL_TOOL_TYPES)[0];
        const id = ctx.newId('tool');
        edit((c) => { const T = Math.max(0, ...c.tools.map((x) => x.T)) + 1; c.tools.push({ id, T, type, d: type === 'groove' ? 3 : TURN_TOOL_TYPES.includes(type) ? 0.8 : 10, flutes: 3, rc: type === 'ball' ? 5 : type === 'bull' ? 1 : 0, flute: 25, length: 50, tip: 118, nose: 0.4, angle: 80, width: 3, pitch: type === 'tap' ? 1 : undefined, grade: type === 'tap' ? 'hss' : 'carbide' }); });
        e.toolId = id; return ctx.renderLeft();
      }
      case 'cam.delTool': {
        if (camOf(p).ops.some((o) => o.tool === arg)) { notify('error', t('cam.toolInUse')); return undefined; }
        edit((c) => { c.tools = c.tools.filter((x) => x.id !== arg); }); e.toolId = null; return undefined;
      }
      case 'cam.selFeature': e.featureId = e.featureId === arg ? null : arg; ctx.syncView(); return ctx.renderLeft();
      case 'cam.planFeature': {
        const rt = model(); const f = rt?.rec.features.find((x) => x.id === arg);
        if (!f) return undefined;
        const ops = planOperations([f], camOf(p).tools).map((o) => ({ ...o, id: ctx.newId('op'), feature: o.feature ?? (['drill', 'peck', 'spot', 'tap'].includes(o.type) && f.type === 'hole' ? f.id : o.feature), name: `${t(`cam.op.${o.type}`)} (${featureName(f)})` }));
        edit((c) => { c.ops.push(...ops); });
        invalidate();
        notify('success', t('cam.planned', { count: ops.length }));
        return undefined;
      }
      case 'cam.planAll': return planAll();
      case 'cam.selOp': e.opId = arg; e.tab = 'ops'; ctx.syncView(); return ctx.renderLeft();
      case 'cam.addOp': return addOp(e.newOpType ?? (isLathe(camOf(p)) ? TURN_OPS : MILL_OPS)[0]);
      case 'cam.delOp': edit((c) => { c.ops = c.ops.filter((o) => o.id !== arg); }); if (e.opId === arg) e.opId = null; invalidate(); return undefined;
      case 'cam.moveOp': {
        const [id, dir] = String(arg).split('|');
        edit((c) => { const i = c.ops.findIndex((o) => o.id === id); const j = i + Number(dir); if (i >= 0 && j >= 0 && j < c.ops.length) [c.ops[i], c.ops[j]] = [c.ops[j], c.ops[i]]; });
        invalidate(); return undefined;
      }
      case 'cam.genOp': {
        const rt = model(); const cam = camOf(p); const op = cam.ops.find((o) => o.id === arg);
        if (!rt || !op) return undefined;
        try { const tp = generateToolpath(camCtx(cam, rt), op); notify('success', t('cam.opGenerated', { name: op.name, moves: tp.moves.length })); }
        catch (error) { notify('error', t('cam.opFailed', { name: op.name, reason: t(`cam.error.${error.code}`, null, error.message) })); }
        return generate({ quiet: true });
      }
      case 'cam.pass': {
        const [what, n] = String(arg).split('|'); const i = Number(n);
        if (what === 'sel') { e.passSel = e.passSel === i ? null : i; e.editOpen = true; ctx.syncView(); return ctx.renderLeft(); }
        if (what === 'del') editOp((ed) => { const s = new Set(ed.deleted ?? []); if (s.has(i)) s.delete(i); else s.add(i); ed.deleted = [...s].sort((a, b) => a - b); });
        if (what === 'rev') editOp((ed) => { const s = new Set(ed.reversed ?? []); if (s.has(i)) s.delete(i); else s.add(i); ed.reversed = [...s].sort((a, b) => a - b); });
        return undefined;
      }
      case 'cam.resetEdits': editOp((ed) => { for (const k of Object.keys(ed)) delete ed[k]; }); e.passSel = null; return undefined;
      case 'cam.generate': return generate();
      case 'cam.simulate': return simulate();
      case 'cam.saveGcode': return saveGcode();
      case 'cam.saveSheet': return saveSetupSheet();
      default: return undefined;
    }
  }

  const accept = () => finish();
  const subject = () => t('cmd.camManager');

  // ───────────────────────── 3D display

  function linesGroup(vp) {
    if (!vp.groups.mfg) { vp.groups.mfg = new THREE.Group(); vp.groups.mfg.name = 'mfg'; vp.scene.add(vp.groups.mfg); }
    return 'mfg';
  }

  function stockSegments(st) {
    if (st.kind === 'bar') {
      const seg = []; const n = 48;
      for (const z of [st.z0, st.z1]) for (let i = 0; i < n; i++) { const a = (2 * Math.PI * i) / n; const b = (2 * Math.PI * (i + 1)) / n; seg.push(st.cx + st.r * Math.cos(a), st.cy + st.r * Math.sin(a), z, st.cx + st.r * Math.cos(b), st.cy + st.r * Math.sin(b), z); }
      for (let i = 0; i < 8; i++) { const a = (2 * Math.PI * i) / 8; seg.push(st.cx + st.r * Math.cos(a), st.cy + st.r * Math.sin(a), st.z0, st.cx + st.r * Math.cos(a), st.cy + st.r * Math.sin(a), st.z1); }
      return seg;
    }
    const { x0, y0, z0, x1, y1, z1 } = st;
    const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const seg = [];
    for (let i = 0; i < 4; i++) { const a = c[i]; const b = c[(i + 1) % 4]; seg.push(a[0], a[1], z0, b[0], b[1], z0, a[0], a[1], z1, b[0], b[1], z1, a[0], a[1], z0, a[0], a[1], z1); }
    return seg;
  }

  /** Toolpath segments (feed per op colour, rapids apart), up to `play` % of all moves. */
  function pathLines(rt, e) {
    const out = [];
    const paths = rt.program?.paths ?? [];
    const total = paths.reduce((s, p) => s + p.moves.length, 0);
    let budget = Math.round((total * (e.play ?? 100)) / 100);
    const st = rt.stock;
    const world = (tp, p) => (tp.kind === 'turn' ? [st.cx + p[0], st.cy, p[2]] : p);
    paths.forEach((tp, i) => {
      if (budget <= 0) return;
      const feed = []; const rapid = [];
      let pos = null; let used = 0;
      for (const m of expandMoves(tp.moves)) {
        if (!m.p || m.k === 'dwell') continue;
        const q = world(tp, m.p);
        if (pos) (m.k === 'r' ? rapid : feed).push(...pos, ...q);
        pos = q;
        if (++used > budget * 3) break;
      }
      budget -= tp.moves.length;
      const selected = e.opId && tp.op === e.opId;
      if (feed.length) out.push({ segments: feed, color: PATH_COLOURS[i % PATH_COLOURS.length], width: selected ? 2.4 : 1.3, depthTest: true, opacity: e.opId && !selected ? 0.45 : 1 });
      if (rapid.length && e.showRapids) out.push({ segments: rapid, color: '#e53935', width: 1, dashed: true, dashSize: 2, gapSize: 2, depthTest: true, opacity: 0.8 });
    });
    return out;
  }

  function featureLines(rt, e) {
    const f = rt.rec.features.find((x) => x.id === e.featureId);
    if (!f) return [];
    const seg = [];
    const loop = (pts, z) => { for (let i = 0; i < pts.length; i++) { const a = pts[i]; const b = pts[(i + 1) % pts.length]; seg.push(a[0], a[1], z, b[0], b[1], z); } };
    if (f.outline?.length) { loop(f.outline, f.floor ?? f.top ?? 0); if (f.top != null && f.floor != null) loop(f.outline, f.top); }
    if (f.type === 'hole') { const n = 32; const pts = Array.from({ length: n }, (_, k) => [f.x + (f.d / 2) * Math.cos((2 * Math.PI * k) / n), f.y + (f.d / 2) * Math.sin((2 * Math.PI * k) / n)]); loop(pts, f.top); loop(pts, f.bottom); }
    if (f.type === 'face') { const b = rt.model.bounds; loop([[b.lo[0], b.lo[1]], [b.hi[0], b.lo[1]], [b.hi[0], b.hi[1]], [b.lo[0], b.hi[1]]], f.z); }
    if (f.bounds) { const { lo, hi } = f.bounds; loop([[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]]], hi[2]); }
    return seg.length ? [{ segments: seg, color: '#ffb300', width: 3, depthTest: false }] : [];
  }

  /** The simulated stock as a mesh: the Z-map's top (milling) or the remaining profile turned (turning). */
  function simMesh(rt) {
    if (!rt.sim) return null;
    if (rt.sim.map) return zmapMesh(rt.sim.map, { partHeights: rt.check?.partHeights, tol: 0.05 });
    const g = rt.sim.grid; const st = rt.stock; const n = 48;
    const rows = [];
    for (let j = 0; j < g.nz; j++) { let r = 0; for (let i = g.nr - 1; i >= 0; i--) if (g.m[j * g.nr + i]) { r = (i + 1) * g.dr; break; } rows.push([g.z0 + (j + 0.5) * g.dz, r]); }
    const V = []; const T = [];
    rows.forEach(([z, r]) => { for (let k = 0; k < n; k++) { const a = (2 * Math.PI * k) / n; V.push(st.cx + r * Math.cos(a), st.cy + r * Math.sin(a), z); } });
    for (let j = 0; j + 1 < rows.length; j++) for (let k = 0; k < n; k++) { const a = j * n + k; const b = j * n + ((k + 1) % n); T.push(a, b, b + n, a, b + n, a + n); }
    const N = new Float32Array(V.length);
    for (let q = 0; q < V.length; q += 3) { const dx = V[q] - st.cx; const dy = V[q + 1] - st.cy; const l = Math.hypot(dx, dy) || 1; N[q] = dx / l; N[q + 1] = dy / l; }
    return { vertices: Float32Array.from(V), normals: N, triangles: Uint32Array.from(T), faceGroups: [{ start: 0, count: T.length, faceId: 0 }], colors: null };
  }

  function decorate(kind) {
    const vp = ctx.viewport();
    if (!vp) return;
    const group = linesGroup(vp);
    const e = editing();
    if (kind !== 'part' || !owns(e)) { vp.setLines(group, []); return; }
    const rt = model();
    if (!rt) { vp.setLines(group, []); return; }
    const lines = [];
    if (e.showStock) lines.push({ segments: stockSegments(rt.stock), color: '#78909c', width: 1.2, dashed: true, dashSize: 3, gapSize: 2, depthTest: true });
    if (e.tab === 'features' || e.featureId) lines.push(...featureLines(rt, e));
    if (e.showPath && rt.program) lines.push(...pathLines(rt, e));
    vp.setLines(group, lines);
    if (e.showSim && rt.sim) {
      const mesh = simMesh(rt);
      if (mesh) {
        // three's setIndex takes a plain array (a typed one would be read as an attribute).
        vp.addBody({ key: 'cam:stock', mesh: { ...mesh, triangles: Array.from(mesh.triangles) }, edges: null, colors: mesh.colors ?? undefined, color: '#b0bec5', faceIndex: new Map(), edgeIndex: new Map(), opacity: 0.95, pickable: false });
        const body = vp.bodies.get('body');
        if (body) { body.mesh.material.transparent = true; body.mesh.material.opacity = 0.25; body.mesh.material.depthWrite = false; }
      }
    }
  }

  const docPart = () => Boolean(part()) && editing()?.mode !== 'sketch';
  const toggleMode = (tab) => () => (owns(editing()) && editing().tab === tab ? finish() : begin(tab));
  const opCmd = (type) => ({ icon: OP_ICONS[type], label: `cam.op.${type}`, enabled: docPart, run: () => addOp(type) });
  const commands = {
    camManager: { icon: 'camManager', label: 'cmd.camManager', enabled: docPart, checked: () => owns(editing()), run: () => (owns(editing()) ? finish() : begin('setup')) },
    camStock: { icon: 'camStock', label: 'cmd.camStock', enabled: docPart, run: toggleMode('setup') },
    camTools: { icon: 'camTool', label: 'cmd.camTools', enabled: docPart, run: toggleMode('tools') },
    camRecognize: { icon: 'camRecognize', label: 'cmd.camRecognize', enabled: docPart, run: () => recognize() },
    camPlan: { icon: 'camPlan', label: 'cmd.camPlan', enabled: docPart, run: () => planAll() },
    camFacing: opCmd('facing'), camPocket: opCmd('pocket'), camAdaptive: opCmd('adaptive'), camContour: opCmd('contour'), camSlot: opCmd('slot'), camHelix: opCmd('helix'),
    camSpot: opCmd('spot'), camDrill: opCmd('drill'), camPeck: opCmd('peck'), camTap: opCmd('tap'),
    camZLevel: opCmd('zlevel'), camParallel: opCmd('parallel'), camScallop: opCmd('scallop'), camWaterline: opCmd('waterline'),
    camRotary4: opCmd('rotary4'), camMulti5: opCmd('multi5'), camMillTurnAxial: opCmd('mtAxial'), camMillTurnRadial: opCmd('mtRadial'),
    camTurnFace: opCmd('tFace'), camTurnRough: opCmd('tRough'), camTurnFinish: opCmd('tFinish'), camTurnBore: opCmd('tBoreRough'), camTurnGroove: opCmd('tGroove'), camTurnThread: opCmd('tThread'),
    camGenerate: { icon: 'camGenerate', label: 'cmd.camGenerate', enabled: () => Boolean(part()?.cam?.ops?.length), run: () => { if (!owns(editing())) begin('sim'); return generate(); } },
    camSimulate: { icon: 'camSimulate', label: 'cmd.camSimulate', enabled: () => Boolean(part()?.cam?.ops?.length), run: () => { if (!owns(editing())) begin('sim'); return simulate(); } },
    camPost: { icon: 'camPost', label: 'cmd.camPost', enabled: () => Boolean(part()?.cam?.ops?.length), run: () => saveGcode() },
    camSetupSheet: { icon: 'camSetupSheet', label: 'cmd.camSetupSheet', enabled: () => Boolean(part()?.cam?.ops?.length), run: () => saveSetupSheet() },
  };
  const TAB = ['camManager', 'camStock', 'camTools', 'camRecognize', 'camPlan', '|', 'camFacing', 'camPocket', 'camAdaptive', 'camContour', 'camSlot', 'camHelix', '|', 'camSpot', 'camDrill', 'camPeck', 'camTap', '|', 'camZLevel', 'camParallel', 'camScallop', 'camWaterline', '|', 'camRotary4', 'camMulti5', 'camMillTurnAxial', 'camMillTurnRadial', '|', 'camTurnFace', 'camTurnRough', 'camTurnFinish', 'camTurnBore', 'camTurnGroove', 'camTurnThread', '|', 'camGenerate', 'camSimulate', 'camPost', 'camSetupSheet'];

  const api = {
    begin, addOp, planAll, recognize, generate, simulate, saveGcode, saveSetupSheet, gcode, setupSheet,
    model: () => model(), camOf: () => camOf(part()), program: () => runtime.program, simulation: () => (runtime.sim ? { removed: runtime.sim.removed, gouges: runtime.check?.count ?? 0, max: runtime.check?.max ?? 0, remaining: runtime.check?.remaining ?? 0, rapidCuts: runtime.sim.rapidCuts ?? 0 } : null),
    times: () => runtime.times, setSaveHook(fn) { saveHook = fn; },
  };
  return { commands, TAB, owns, pm, pick: () => undefined, field, set, select, toggle, accept, handles, command, subject, decorate, colours: () => undefined, api };
}
