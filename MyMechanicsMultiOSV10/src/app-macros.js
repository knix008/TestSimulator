// Macros: recording what the user does, playing it back, and the automation API macros are written against.
// A macro is JavaScript (.mmjs) run as an async function of `mm` (the API) — recorded macros are plain lists of
// `await mm.…(…)` calls, and hand-written ones can use loops, variables and the model data.
// The recorder notes the app's entry points (commands, picks in the view, PropertyManager input, selection,
// documents, sketch contents) — only the outermost call of a user action: what it calls in turn is not recorded.
// The macro editor is its own window (popup 'macro'): the script, a console (log, errors with their line, an
// immediate prompt), record / run / stop, load and save.

import { createFeature, regenerate } from './cad/features.js';
import { addArc, addCenterRectangle, addCircle, addLine, addPolygon, addRectangle, addSlot, createSketchGeometry, solveSketch } from './cad/sketch.js';
import { edgeSignature, faceSignature } from './cad/refs.js';
import { addConfiguration } from './cad/params.js';

/** The recorder the app's entry points report to (created first, so app.js can use it everywhere). */
export function createRecorder() {
  const r = {
    on: false, playing: false, depth: 0, steps: [], listeners: new Set(),
    /** Calls `fn`, noting `call(args)` when it is a top-level user action while recording. */
    around(call, args, fn) {
      if (r.on && !r.playing && r.depth === 0 && !String(args?.[0] ?? '').startsWith('macro')) r.push({ call, args: plain(args) });
      r.depth++;
      try { return fn(); } finally { r.depth--; }
    },
    /** A step noted directly (keyboard Enter / Esc, the sketch contents before a sketch closes). */
    note(call, args = [], { before = false } = {}) {
      if (!r.on || r.playing) return;
      const step = { call, args: plain(args) };
      // Inside a recorded call (a sketch closed by a command): before that call, so the replay sets the sketch first.
      if (before && r.depth > 0 && r.steps.length) r.steps.splice(r.steps.length - 1, 0, step); else r.push(step);
    },
    push(step) { r.steps.push(step); for (const fn of r.listeners) fn(step); },
  };
  return r;
}

/** Arguments as plain data (picks, selections and sketches are JSON; events and DOM nodes are dropped). */
function plain(args) {
  const skip = (v) => typeof v === 'function' || (typeof Element !== 'undefined' && v instanceof Element) || (typeof Event !== 'undefined' && v instanceof Event);
  return JSON.parse(JSON.stringify(args ?? [], (k, v) => (skip(v) ? undefined : v)) ?? '[]');
}

const API_NAMES = { run: 'run', pick: 'pick', select: 'select', pmCommand: 'pm', pmSet: 'set', pmField: 'field', pmToggle: 'toggle', pmSelect: 'choose', pmStep: 'step', pickMode: 'pickMode', accept: 'accept', cancel: 'cancel', exitSketch: 'exitSketch', setSketch: 'setSketch', document: 'document', material: 'material' };

/** A recorded step as one line of the macro. */
export function stepLine(step) {
  const name = API_NAMES[step.call] ?? step.call;
  const args = (step.args ?? []).map((a) => JSON.stringify(a));
  while (args.length && (args.at(-1) === 'null' || args.at(-1) === undefined)) args.pop();
  return `await mm.${name}(${args.join(', ')});`;
}

/** The text of a recorded macro. */
export function macroScript(steps, { title = 'Recorded macro', date = new Date() } = {}) {
  const p = (n) => String(n).padStart(2, '0');
  const when = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
  return [`// MyMechanics macro — ${title}`, `// ${when}`, '', ...steps.map(stepLine), ''].join('\n');
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

/** The line of the macro an error happened on (from the stack of the compiled function), or null. */
export function errorLine(error) {
  const m = /<anonymous>:(\d+):(\d+)/.exec(String(error?.stack ?? '')) ?? /eval.*?:(\d+):(\d+)/.exec(String(error?.stack ?? ''));
  // The compiled function adds two lines before the body ("async function anonymous(mm,console\n) {").
  return m ? Math.max(1, Number(m[1]) - 2) : null;
}

/** Compiles a macro (syntax errors thrown here, with their line). */
export function compileMacro(text) {
  return new AsyncFunction('mm', 'console', String(text ?? ''));
}

export function createMacroTools(ctx) {
  const { state, t, recorder } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const M = (state.macro ??= { text: '', log: [], running: false, stop: false, name: 'macro.mmjs' });

  // ───────────────────────── the editor window

  const view = () => ({ text: M.text, log: M.log.slice(-300), recording: recorder.on, running: M.running, name: M.name, steps: recorder.on ? recorder.steps.length : 0 });
  let stamp = 0;
  let editorOpen = false;
  function post(extra = {}) { if (editorOpen) ctx.popups.post('macro', { type: 'macro-state', ...view(), ...extra }); }
  function openEditor() {
    if (editorOpen) { ctx.popups.post('macro', { type: 'macro-state', ...view(), text: M.text, replaceText: true }); return; }
    editorOpen = true;
    stamp = Date.now();
    Promise.resolve(ctx.popups.open('macro', { ...view(), stamp })).finally(() => { editorOpen = false; });
  }
  function log(level, text, line = null) {
    M.log.push({ at: new Date().toISOString(), level, text: String(text), line });
    if (M.log.length > 1000) M.log.splice(0, M.log.length - 1000);
    post();
  }

  // ───────────────────────── recording

  function startRecording() {
    if (M.running) return;
    recorder.steps = []; recorder.on = true;
    notify('info', t('macro.recording'));
    ctx.renderAll(); post();
  }
  function stopRecording() {
    if (!recorder.on) return null;
    recorder.on = false;
    const steps = recorder.steps.slice();
    M.text = macroScript(steps, { title: ctx.projectName() || t('macro.recorded') });
    M.name = 'macro.mmjs';
    notify('success', t('macro.recorded', { count: steps.length }));
    ctx.renderAll();
    if (editorOpen) post({ replaceText: true }); else openEditor();
    return M.text;
  }
  recorder.listeners.add(() => { post(); ctx.renderStatus?.(); });

  // ───────────────────────── the API

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const check = () => { if (M.stop) throw Object.assign(new Error(t('macro.stopped')), { stopped: true }); };
  const settle = async () => { check(); await sleep(0); await ctx.idle?.(); check(); };
  const call = async (fn) => { check(); const r = await fn(); await settle(); return r; };
  const ref = (kind, nameOrId) => {
    const p = ctx.project(); if (!p) return null;
    const list = kind === 'part' ? p.parts : kind === 'assembly' ? p.assemblies : p.drawings;
    const d = list.find((x) => x.id === nameOrId) ?? list.find((x) => x.name === nameOrId);
    return d ? { kind, id: d.id } : null;
  };

  // ───────────────────────── model building (the API a hand-written macro builds parts with)

  const part = () => { const p = ctx.activePart(); if (!p) throw new Error(t('macro.noPart')); return p; };
  const featureOf = (p, name) => { const f = typeof name === 'object' && name ? p.features.find((x) => x.id === name.id) : p.features.find((x) => x.name === name || x.id === name); if (!f) throw new Error(t('macro.noFeature', { name: typeof name === 'object' ? name?.name : name })); return f; };
  /** A plane: 'front' | 'top' | 'right', a plane feature's name, or { offset, from } for a new offset plane. */
  const planeOf = (p, plane) => {
    if (plane == null || ['front', 'top', 'right'].includes(plane)) return { kind: 'std', name: plane ?? 'front' };
    if (typeof plane === 'object' && plane.kind) return plane;
    const f = p.features.find((x) => (x.name === plane || x.id === plane) && x.type === 'plane');
    if (!f) throw new Error(t('macro.noPlane', { name: plane }));
    return { kind: 'ref', id: f.id };
  };
  /**
   * The shapes of a sketch: { rect: [w, h, cx = 0, cy = 0] } (centred), { corners: [x1, y1, x2, y2] },
   * { circle: [cx, cy, d] }, { line: [x1, y1, x2, y2] }, { arc: [cx, cy, r, a0°, a1°] }, { polygon: [cx, cy, r, sides] },
   * { slot: [x1, y1, x2, y2, width] }, { polyline: [[x, y]…] } (closed), { axis: [x1, y1, x2, y2] } (construction).
   */
  function drawShapes(s, shapes) {
    for (const sh of shapes) {
      const [k] = Object.keys(sh); const v = sh[k];
      if (k === 'rect') addCenterRectangle(s, v[2] ?? 0, v[3] ?? 0, v[0] / 2, v[1] / 2);
      else if (k === 'corners') addRectangle(s, v[0], v[1], v[2], v[3]);
      else if (k === 'circle') addCircle(s, v[0], v[1], v[2] / 2);
      else if (k === 'line') addLine(s, v[0], v[1], v[2], v[3]);
      else if (k === 'axis') addLine(s, v[0], v[1], v[2], v[3], { construction: true });
      else if (k === 'arc') addArc(s, v[0], v[1], v[2], (v[3] * Math.PI) / 180, (v[4] * Math.PI) / 180);
      else if (k === 'polygon') addPolygon(s, v[0], v[1], v[2], v[3] ?? 6);
      else if (k === 'slot') addSlot(s, v[0], v[1], v[2], v[3], v[4] / 2);
      else if (k === 'polyline') { let prev = null, first = null; for (const [x, y] of v) { const l = prev ? addLine(s, prev[0], prev[1], x, y, { from: prev[2] }) : null; const pt = l ? l.p2 : null; if (!first && l) first = l.p1; prev = [x, y, pt]; } if (prev && first && v.length > 2) addLine(s, prev[0], prev[1], v[0][0], v[0][1], { from: prev[2], to: first }); }
      else throw new Error(t('macro.badShape', { kind: k }));
    }
  }
  /** One feature added to the active part (one undo step); its name back. */
  const addFeature = (type, params) => call(() => {
    let name = null;
    ctx.change('op.macro', () => { const p = part(); const f = createFeature(p, type, params); p.features.push(f); name = f.name; });
    const err = ctx.rebuildErrors?.(part()).find((x) => x.feature.name === name);
    if (err) throw new Error(t('macro.featureFailed', { name, error: t(`rebuild.${err.error}`, null, err.error) }));
    return name;
  });
  const sigOf = (kind) => (test = () => true) => { const r = regenerate(part()); if (!r.body) return []; return (kind === 'edge' ? r.body.edges.map(edgeSignature) : r.body.faces.map(faceSignature)).filter(typeof test === 'function' ? test : () => true); };
  const docOf = () => { const d = ctx.active(); if (!d) throw new Error(t('macro.noDocument')); return d; };

  // ───────────────────────── events (add-in style): handlers stay until removed or the macros are reset

  const handlers = new Map();
  let emitting = false;
  function emit(event, payload) {
    const list = handlers.get(event); if (!list?.size || emitting) return;
    emitting = true;
    try { for (const fn of [...list]) { try { const r = fn(payload); if (r?.catch) r.catch((error) => log('error', `${event}: ${error?.message ?? error}`)); } catch (error) { log('error', `${event}: ${error?.message ?? error}`); } } } finally { emitting = false; }
  }

  /** The automation API (`mm` in a macro). Every call waits until the app has caught up. */
  const mm = {
    // building parts
    sketch: (plane, shapes = [], { name } = {}) => call(() => {
      let out = null;
      ctx.change('op.macro', () => { const p = part(); const s = createFeature(p, 'sketch', { plane: planeOf(p, plane), ...createSketchGeometry(), ...(name ? { name } : {}) }); drawShapes(s, shapes); solveSketch(s); p.features.push(s); out = s.name; });
      return out;
    }),
    plane: (base, offset, { name } = {}) => addFeature('plane', { base: planeOf(part(), base), offset, ...(name ? { name } : {}) }),
    extrude: (sketch, depth, o = {}) => addFeature('extrude', { sketch: featureOf(part(), sketch).id, op: o.op ?? 'boss', end: depth === 'through' ? 'through' : o.end ?? (o.midplane ? 'midplane' : 'blind'), depth: typeof depth === 'number' ? depth : 10, reverse: Boolean(o.reverse), ...(o.name ? { name: o.name } : {}) }),
    cut: (sketch, depth = 'through', o = {}) => mm.extrude(sketch, depth, { ...o, op: 'cut' }),
    revolve: (sketch, angle = 360, o = {}) => addFeature('revolve', { sketch: featureOf(part(), sketch).id, op: o.op ?? 'boss', angle, reverse: Boolean(o.reverse), ...(o.name ? { name: o.name } : {}) }),
    fillet: (radius, edges = () => true, o = {}) => { const list = typeof edges === 'function' ? sigOf('edge')(edges) : edges; if (!list.length) throw new Error(t('macro.noEdges')); return addFeature('fillet', { radius, edges: list, ...(o.name ? { name: o.name } : {}) }); },
    chamfer: (distance, edges = () => true, o = {}) => { const list = typeof edges === 'function' ? sigOf('edge')(edges) : edges; if (!list.length) throw new Error(t('macro.noEdges')); return addFeature('chamfer', { distance, edges: list, ...(o.name ? { name: o.name } : {}) }); },
    shell: (thickness, faces = () => false, o = {}) => addFeature('shell', { thickness, faces: typeof faces === 'function' ? sigOf('face')(faces) : faces, ...(o.name ? { name: o.name } : {}) }),
    hole: (sketch, o = {}) => addFeature('hole', { sketch: featureOf(part(), sketch).id, ...o }),
    feature: (type, params = {}) => addFeature(type, params),
    edges: (test) => sigOf('edge')(test),
    faces: (test) => sigOf('face')(test),
    // feature tree
    features: () => (ctx.activePart()?.features ?? []).map((f) => ({ id: f.id, name: f.name, type: f.type, suppressed: Boolean(f.suppressed) })),
    deleteFeature: (name) => call(() => ctx.change('op.macro', () => { const p = part(); const f = featureOf(p, name); p.features = p.features.filter((x) => x !== f); })),
    suppress: (name, on = true) => call(() => ctx.change('op.macro', () => { featureOf(part(), name).suppressed = Boolean(on); })),
    renameFeature: (name, to) => call(() => ctx.change('op.macro', () => { featureOf(part(), name).name = String(to); })),
    errors: () => (ctx.rebuildErrors?.(ctx.activePart()) ?? []).map((x) => ({ feature: x.feature.name, error: x.error })),
    // configurations
    configurations: () => (ctx.activePart()?.configurations ?? []).map((c) => ({ id: c.id, name: c.name, active: ctx.activePart().config === c.id })),
    addConfiguration: (name) => call(() => { let id = null; ctx.change('op.macro', () => { const c = addConfiguration(part(), name); id = c.id; }); return id; }),
    useConfiguration: (name) => call(() => ctx.change('op.macro', () => { const p = part(); if (name == null) { p.config = null; return; } const c = (p.configurations ?? []).find((x) => x.name === name || x.id === name); if (!c) throw new Error(t('macro.noConfig', { name })); p.config = c.id; })),
    // properties
    properties: () => { const d = docOf(); return { name: d.name, partNo: d.partNo ?? '', description: d.description ?? '', material: d.material ?? null, custom: { ...(d.customProperties ?? {}) } }; },
    customProperty: (key) => docOf().customProperties?.[key] ?? null,
    setCustomProperty: (key, value) => call(() => ctx.change('op.macro', () => { const d = docOf(); d.customProperties ??= {}; if (value == null) delete d.customProperties[key]; else d.customProperties[String(key)] = String(value); })),
    // measuring
    boundingBox: () => { const b = ctx.activePart() ? ctx.buildPart(ctx.activePart())?.body : null; if (!b) return null; const [lo, hi] = b.boundingBox.bounds; return { min: lo, max: hi, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] }; },
    // documents and assemblies
    documents: () => { const p = ctx.project(); if (!p) return []; return [...p.parts.map((d) => ({ kind: 'part', id: d.id, name: d.name })), ...(p.assemblies ?? []).map((d) => ({ kind: 'assembly', id: d.id, name: d.name })), ...(p.drawings ?? []).map((d) => ({ kind: 'drawing', id: d.id, name: d.name }))]; },
    // New documents in the open project (no question asked; mm.newDocument starts a new project).
    addPart: (name) => call(() => ctx.addPart(name ?? null)?.name ?? null),
    addAssembly: (name) => call(() => ctx.addAssembly(name ?? null)),
    components: () => (ctx.activeAssembly?.()?.components ?? []).map((c) => ({ id: c.id, name: c.name, part: ctx.project().parts.find((p) => p.id === c.part)?.name ?? c.part, position: c.position.slice(), fixed: Boolean(c.fixed) })),
    insertComponent: (partName, position = null) => call(() => {
      const p = ctx.project()?.parts.find((x) => x.name === partName || x.id === partName);
      if (!p) throw new Error(t('macro.noPartNamed', { name: partName }));
      const asm = ctx.activeAssembly?.(); if (!asm) throw new Error(t('macro.noAssembly'));
      const before = new Set(asm.components.map((c) => c.id));
      ctx.insertComponent(p.id);
      const c = ctx.activeAssembly().components.find((x) => !before.has(x.id));
      if (c && position) ctx.change('op.macro', () => { c.position = position.slice(0, 3).map(Number); });
      return c?.name ?? null;
    }),
    moveComponent: (name, position) => call(() => ctx.change('op.macro', () => { const c = ctx.activeAssembly?.()?.components.find((x) => x.name === name || x.id === name); if (!c) throw new Error(t('macro.noComponent', { name })); c.position = position.slice(0, 3).map(Number); })),
    interference: () => call(() => ctx.interferenceList()),
    // events
    on: (event, fn) => { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event).add(fn); return () => handlers.get(event)?.delete(fn); },
    off: (event, fn) => { if (fn) handlers.get(event)?.delete(fn); else handlers.delete(event); },
    events: () => [...handlers.entries()].filter(([, s]) => s.size).map(([k, s]) => ({ event: k, handlers: s.size })),

    // what a recorded macro uses
    run: (id) => call(() => ctx.run(id)),
    pick: (hit, mods = {}) => call(() => ctx.pick(hit, { ctrlKey: false, shiftKey: false, metaKey: false, ...mods })),
    select: (items, opts = {}) => call(() => ctx.select(items, opts)),
    pm: (name) => call(() => ctx.pmCommand(name)),
    set: (key, value) => call(() => ctx.pmSet(key, value)),
    field: (key, raw, unit) => call(() => ctx.pmField(key, raw, unit)),
    toggle: (key, checked) => call(() => ctx.pmToggle(key, checked)),
    choose: (key, value) => call(() => ctx.pmSelect(key, value)),
    step: (key, delta) => call(() => ctx.pmStep(key, delta)),
    pickMode: (mode) => call(() => { if (state.editing) { state.editing.pick = mode; ctx.renderLeft(); } }),
    accept: () => call(() => ctx.accept()),
    cancel: () => call(() => ctx.cancel()),
    exitSketch: () => call(() => ctx.exitSketch()),
    setSketch: (geometry) => call(() => ctx.setSketch(geometry)),
    document: (r) => call(() => ctx.switchDocument(typeof r === 'string' ? (ref('part', r) ?? ref('assembly', r) ?? ref('drawing', r)) : r)),
    material: (id) => call(() => ctx.setMaterial(id)),
    // reading the model
    get project() { const p = ctx.project(); return p ? structuredClone(p) : null; },
    active: () => structuredClone(ctx.active() ?? null),
    parts: () => (ctx.project()?.parts ?? []).map((p) => ({ id: p.id, name: p.name, material: p.material, features: p.features.map((f) => ({ id: f.id, name: f.name, type: f.type })) })),
    feature: (name) => { const p = ctx.activePart(); const f = p?.features.find((x) => x.name === name || x.id === name); return f ? structuredClone(f) : null; },
    massProperties: () => ctx.massProperties(),
    selection: () => structuredClone(state.selection),
    // changing the model directly (one undo step each)
    setParam: (featureName, key, value) => call(() => ctx.change('op.macro', () => { const f = ctx.activePart()?.features.find((x) => x.name === featureName || x.id === featureName); if (!f) throw new Error(t('macro.noFeature', { name: featureName })); f[key] = value; })),
    setVariable: (name, value) => call(() => ctx.change('op.macro', () => { const p = ctx.activePart(); if (!p) throw new Error(t('macro.noPart')); p.variables ??= []; const v = p.variables.find((x) => x.name === name); if (v) v.value = value; else p.variables.push({ name, value }); })),
    setProperty: (key, value) => call(() => ctx.change('op.macro', () => { const d = ctx.active(); if (!d) throw new Error(t('macro.noPart')); d[key] = value; })),
    rebuild: () => call(() => ctx.run('rebuild')),
    open: (sample) => call(() => ctx.openSample(sample)),
    newDocument: (kind = 'part') => call(() => ctx.newDocument(kind)),
    export: (format) => call(() => ctx.run(format === 'step' ? 'exportStep' : format === 'stl' ? 'exportStl' : format === 'iges' ? 'exportIges' : `exportMesh:${format}`)),
    // the macro itself
    wait: async (ms) => { const end = Date.now() + Math.max(0, Number(ms) || 0); while (Date.now() < end) { check(); await sleep(Math.min(50, end - Date.now())); } },
    log: (...a) => log('info', a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')),
    notify: (text) => notify('info', String(text)),
    version: () => ctx.version(),
  };
  const consoleShim = { log: mm.log, info: mm.log, warn: (...a) => log('warn', a.join(' ')), error: (...a) => log('error', a.join(' ')) };

  /** Runs a macro: its result (or the error, logged with its line). */
  async function runMacro(text = M.text, { name = M.name } = {}) {
    if (M.running) return { ok: false, error: 'busy' };
    if (recorder.on) stopRecording();
    let fn;
    try { fn = compileMacro(text); } catch (error) { log('error', `${t('macro.syntax')}: ${error.message}`, errorLine(error)); return { ok: false, error: error.message }; }
    M.running = true; M.stop = false; recorder.playing = true;
    log('info', t('macro.started', { name }));
    ctx.renderAll(); post();
    const t0 = performance.now();
    try {
      const value = await fn(mm, consoleShim);
      log('ok', t('macro.finished', { ms: Math.round(performance.now() - t0) }));
      return { ok: true, value };
    } catch (error) {
      const line = errorLine(error);
      log(error?.stopped ? 'warn' : 'error', error?.stopped ? t('macro.stopped') : `${error?.message ?? error}${line ? ` (${t('macro.line', { line })})` : ''}`, line);
      return { ok: false, error: error?.message ?? String(error), line };
    } finally {
      M.running = false; M.stop = false; recorder.playing = false;
      ctx.renderAll(); post();
    }
  }
  function stopMacro() { if (M.running) M.stop = true; }

  /** The console's prompt: an expression's value, or statements run. */
  async function evaluate(line) {
    const src = String(line ?? '').trim(); if (!src) return undefined;
    log('input', src);
    let fn;
    try { fn = compileMacro(`return (${src});`); } catch { try { fn = compileMacro(src); } catch (error) { log('error', error.message); return undefined; } }
    recorder.playing = true;
    try { const v = await fn(mm, consoleShim); if (v !== undefined) log('result', typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v, null, 0)?.slice(0, 2000) ?? String(v)); return v; }
    catch (error) { log('error', error?.message ?? String(error)); return undefined; }
    finally { recorder.playing = false; }
  }

  async function loadMacro() {
    const text = await ctx.readText({ name: t('macro.file'), extensions: ['mmjs', 'js'] });
    if (text == null) return false;
    M.text = text; M.name = 'macro.mmjs';
    if (editorOpen) post({ replaceText: true }); else openEditor();
    return true;
  }
  async function runFile() { const ok = await loadMacro(); if (ok) return runMacro(); return null; }
  const saveMacro = () => ctx.saveExport(M.name || 'macro.mmjs', 'mmjs', M.text, 'text/javascript');

  // Messages from the editor window.
  ctx.popups.on('macro', async (data) => {
    if (typeof data.text === 'string') M.text = data.text;
    switch (data.op) {
      case 'record': return recorder.on ? stopRecording() : startRecording();
      case 'run': return runMacro(M.text);
      case 'stop': return stopMacro();
      case 'clear-log': M.log = []; return post();
      case 'reset-events': handlers.clear(); log('info', t('macro.eventsReset')); return post();
      case 'new': M.text = ''; M.name = 'macro.mmjs'; return post({ replaceText: true });
      case 'load': return loadMacro();
      case 'save': return saveMacro();
      case 'eval': return evaluate(data.line);
      case 'text': return undefined;
      default: return undefined;
    }
  });

  const commands = {
    macroRecord: { icon: 'macroRecord', label: 'cmd.macroRecord', checked: () => recorder.on, enabled: () => !M.running, run: () => (recorder.on ? stopRecording() : startRecording()) },
    macroRun: { icon: 'macroRun', label: 'cmd.macroRun', enabled: () => !M.running, run: () => runFile() },
    macroStop: { icon: 'macroStop', label: 'cmd.macroStop', enabled: () => M.running || recorder.on, run: () => (recorder.on ? stopRecording() : stopMacro()) },
    macroEditor: { icon: 'macroEditor', label: 'cmd.macroEditor', run: () => openEditor() },
  };
  const api = { mm, emit, resetHandlers: () => handlers.clear(), runMacro, stopMacro, startRecording, stopRecording, evaluate, openEditor, loadMacro, saveMacro, state: () => ({ ...view(), steps: recorder.steps.slice() }), setText: (text) => { M.text = text; post({ replaceText: true }); } };
  return { commands, api, emit, recording: () => recorder.on, running: () => M.running };
}
