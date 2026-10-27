// Block-diagram model data structure, shared by the engine (core/sim) and the
// editor (src/sim). Plain JSON objects only, so a model can be posted between
// the Web Worker and the GUI and saved as a ".smdl" file unchanged.
//
//   model  = { format:'smdl', version, name, settings, workspace:[{name, value}],
//              buses:{ name:{ elements:[{name, dims, dtype}] } }, root: system,
//              nextId, meta:{ description, created, modified } }
//   system = { blocks:[block], lines:[line], notes:[{id, x, y, text}] }
//   block  = { id, type, name, x, y, w, h, rot:0|90|180|270, flip, params:{name:string},
//              showName, system?(subsystems), mask?, bg?, fg? }
//   line   = { id, src:{block, port}, points:[[x,y]...], dst:{block, port}|null,
//              branches:[{ points, dst, branches }], name, log }
// Ports are 1-based numbers; the control ports of subsystems are the strings
// 'enable', 'trigger' and 'action'. Ids are unique in the whole model.
import { blockDef, defaultParams, portsOf } from './blocks/index.js';

export const MODEL_EXT = '.smdl';
export const FORMAT = 'smdl';
export const VERSION = 1;

export function defaultSettings() {
  return {
    startTime: '0', stopTime: '10', solver: 'auto', solverType: 'variable',
    fixedStep: 'auto', maxStep: 'auto', minStep: 'auto', initialStep: 'auto',
    relTol: '1e-3', absTol: 'auto', zeroCross: 'on', maxConsecutiveZc: '1000',
    saveTime: 'on', timeName: 'tout', saveOutput: 'on', outputName: 'yout',
    saveState: 'off', stateName: 'xout', signalLogging: 'on', logName: 'logsout',
    singleOutput: 'on', singleOutputName: 'out', limitPoints: 'off', maxPoints: '1000', decimation: '1',
    algebraicLoop: 'warning', pacing: 'off', pacingRate: '1', stopOnAssert: 'on',
  };
}

export function newSystem() { return { blocks: [], lines: [], notes: [] }; }

export function newModel(name = 'untitled') {
  const now = new Date().toISOString();
  return {
    format: FORMAT, version: VERSION, name, settings: defaultSettings(), workspace: [], buses: {},
    root: newSystem(), nextId: 1, meta: { description: '', created: now, modified: now },
  };
}

export const nextId = (model, prefix = 'b') => `${prefix}${model.nextId++}`;
export const clone = (x) => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------- blocks

/** A name not yet used by a block of the system: Gain, Gain1, Gain2 ... */
export function uniqueName(system, base) {
  const used = new Set(system.blocks.map((b) => b.name));
  if (!used.has(base)) return base;
  const stem = base.replace(/\d+$/, '');
  for (let i = 1; ; i++) if (!used.has(stem + i)) return stem + i;
}

/**
 * A new block of `type` (or of a library item with a template). Does not add
 * it to a system. opts: { name, x, y, w, h, params, rot, flip }.
 */
export function makeBlock(model, type, opts = {}, system = null) {
  const def = blockDef(type);
  if (!def) throw new Error(`Unknown block type '${type}'.`);
  const size = def.size || [40, 40];
  const b = {
    id: nextId(model, 'b'), type, name: '', x: opts.x ?? 0, y: opts.y ?? 0, w: opts.w ?? size[0], h: opts.h ?? size[1],
    rot: opts.rot || 0, flip: !!opts.flip, params: { ...defaultParams(type), ...(opts.params || {}) }, showName: def.hideName ? false : true,
  };
  if (def.template) {
    const tpl = def.template(opts.variant);
    if (tpl.params) Object.assign(b.params, tpl.params, opts.params || {});
    if (tpl.system) b.system = materialize(model, tpl.system);
    if (tpl.mask) b.mask = clone(tpl.mask);
  }
  if (opts.system) b.system = opts.system;
  const base = opts.name || (def.label && def.label.en ? def.label.en : type).replace(/[^\w ]+/g, '').trim() || type;
  b.name = system ? uniqueName(system, base) : base;
  return b;
}

/** Turns a template system ({blocks:[{type, name, x, y, params}], lines:[{from:[name,port], to:[name,port]}]}) into a system with ids. */
export function materialize(model, tpl) {
  const sys = newSystem();
  const byName = {};
  for (const tb of tpl.blocks || []) {
    const b = makeBlock(model, tb.type, { ...tb, variant: tb.variant }, sys);
    sys.blocks.push(b);
    byName[tb.name || b.name] = b;
  }
  for (const tl of tpl.lines || []) {
    const s = byName[tl.from[0]], d = byName[tl.to[0]];
    if (!s || !d) continue;
    sys.lines.push({ id: nextId(model, 'l'), src: { block: s.id, port: tl.from[1] }, points: [], dst: { block: d.id, port: tl.to[1] }, branches: [], name: tl.name || '', log: false });
  }
  return sys;
}

/** Gives every block, line and note in `sys` (recursively) a fresh id; returns the old → new id map. */
export function reassignIds(model, sys, map = {}) {
  for (const b of sys.blocks) { const nid = nextId(model, 'b'); map[b.id] = nid; b.id = nid; if (b.system) reassignIds(model, b.system, map); }
  const fix = (seg) => { if (seg.dst && map[seg.dst.block]) seg.dst.block = map[seg.dst.block]; (seg.branches || []).forEach(fix); };
  for (const l of sys.lines) { l.id = nextId(model, 'l'); if (map[l.src.block]) l.src.block = map[l.src.block]; fix(l); }
  for (const n of sys.notes || []) n.id = nextId(model, 'n');
  return map;
}

// ---------------------------------------------------------------- walking and paths

/** Calls fn(block, system, path[]) for every block of the model, depth first. */
export function walk(model, fn, sys = model.root, path = [model.name]) {
  for (const b of sys.blocks) {
    const p = [...path, b.name];
    if (fn(b, sys, p) === false) continue;
    if (b.system) walk(model, fn, b.system, p);
  }
}

/** id → { block, system, path } for all blocks. */
export function indexModel(model) {
  const ix = new Map();
  walk(model, (b, sys, path) => { ix.set(b.id, { block: b, system: sys, path }); });
  return ix;
}

export const escapeName = (n) => String(n).replace(/\//g, '//');
export function splitPath(path) {
  const out = []; let cur = '';
  for (let i = 0; i < path.length; i++) {
    if (path[i] === '/') { if (path[i + 1] === '/') { cur += '/'; i++; continue; } out.push(cur); cur = ''; continue; }
    cur += path[i];
  }
  out.push(cur);
  return out;
}
export const joinPath = (parts) => parts.map(escapeName).join('/');

/** Resolves 'model/Sub/Gain' → { block|null, system, parent } (block null for the model root or a subsystem path ending at a system). */
export function resolvePath(model, path) {
  const parts = Array.isArray(path) ? path : splitPath(String(path));
  if (parts[0] !== model.name) return null;
  let sys = model.root, block = null, parent = null;
  for (let i = 1; i < parts.length; i++) {
    if (!sys) return null;
    const b = sys.blocks.find((x) => x.name === parts[i]);
    if (!b) return null;
    parent = sys; block = b; sys = b.system || null;
  }
  return { block, system: block ? (block.system || null) : model.root, parent: block ? parent : null };
}

/** The system at a list of subsystem block ids (the editor's breadcrumb). */
export function systemAt(model, ids = []) {
  let sys = model.root;
  for (const id of ids) {
    const b = sys.blocks.find((x) => x.id === id);
    if (!b || !b.system) return null;
    sys = b.system;
  }
  return sys;
}

// ---------------------------------------------------------------- lines

/** Every connection of a system as { line, src, dst, name, seg } (one per destination). */
export function connections(sys) {
  const out = [];
  for (const l of sys.lines) {
    const rec = (seg) => { if (seg.dst) out.push({ line: l, src: l.src, dst: seg.dst, name: l.name, seg }); for (const b of seg.branches || []) rec(b); };
    rec(l);
  }
  return out;
}

/** Removes every line end connected to `blockId` (port optional) and prunes empty lines. */
export function detachBlock(sys, blockId, port = null) {
  const keep = [];
  for (const l of sys.lines) {
    if (l.src.block === blockId && (port == null || l.src.port === port)) continue;
    pruneSeg(l, (d) => d.block === blockId && (port == null || d.port === port));
    if (l.dst || (l.branches && l.branches.length)) keep.push(l);
  }
  sys.lines = keep;
}
function pruneSeg(seg, drop) {
  if (seg.dst && drop(seg.dst)) seg.dst = null;
  seg.branches = (seg.branches || []).filter((b) => { pruneSeg(b, drop); return b.dst || (b.branches && b.branches.length); });
  // a segment with no destination and one branch collapses into the branch
  if (!seg.dst && seg.branches.length === 1) {
    const b = seg.branches[0];
    seg.points = [...(seg.points || []), ...(b.points || [])];
    seg.dst = b.dst; seg.branches = b.branches || [];
  }
}

/** Is the input port already driven? */
export function inputUsed(sys, blockId, port) {
  return connections(sys).some((c) => c.dst.block === blockId && c.dst.port === port);
}

/** Adds a line src → dst (a branch of the existing line from src when there is one). */
export function connect(model, sys, src, dst, points = []) {
  const existing = sys.lines.find((l) => l.src.block === src.block && l.src.port === src.port);
  if (existing) {
    if (existing.dst) {
      const first = { points: [], dst: existing.dst, branches: existing.branches || [] };
      existing.dst = null;
      existing.branches = [first];
    }
    existing.branches.push({ points, dst, branches: [] });
    return existing;
  }
  const l = { id: nextId(model, 'l'), src: { ...src }, points, dst: { ...dst }, branches: [], name: '', log: false };
  sys.lines.push(l);
  return l;
}

// ---------------------------------------------------------------- geometry

/** Ports of a block with positions: { in:[{port, x, y, dir}], out:[...], special:[...] }. */
export function portGeometry(block) {
  const pc = portsOf(block);
  const pts = { in: [], out: [], special: [] };
  for (let i = 1; i <= pc.in; i++) pts.in.push({ port: i, ...place(block, 0, (2 * i - 1) / (2 * pc.in), 'left') });
  for (let i = 1; i <= pc.out; i++) pts.out.push({ port: i, ...place(block, 1, (2 * i - 1) / (2 * pc.out), 'right') });
  const sp = pc.special || [];
  sp.forEach((name, k) => pts.special.push({ port: name, ...place(block, (2 * k + 1) / (2 * sp.length), 0, 'top') }));
  return pts;
}
const ROT = { left: 'top', top: 'right', right: 'bottom', bottom: 'left' };
const MIRROR = { left: 'right', right: 'left', top: 'top', bottom: 'bottom' };
function place(block, lx, ly, dir) {
  if (block.flip) { lx = 1 - lx; dir = MIRROR[dir]; }
  const turns = ((block.rot || 0) / 90) % 4;
  for (let k = 0; k < turns; k++) { const nx = 1 - ly, ny = lx; lx = nx; ly = ny; dir = ROT[dir]; }
  return { x: block.x + lx * block.w, y: block.y + ly * block.h, dir };
}
export function portPoint(block, kind, port) {
  const g = portGeometry(block);
  const list = typeof port === 'string' ? g.special : kind === 'out' ? g.out : g.in;
  return list.find((p) => p.port === port) || null;
}

/** Bounding box of a system's blocks, notes and line points (or null when empty). */
export function systemBounds(sys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; };
  for (const b of sys.blocks) { add(b.x, b.y); add(b.x + b.w, b.y + b.h + (b.showName ? 16 : 0)); }
  for (const n of sys.notes || []) { add(n.x, n.y); add(n.x + 120, n.y + 20); }
  const rec = (s) => { for (const p of s.points || []) add(p[0], p[1]); (s.branches || []).forEach(rec); };
  sys.lines.forEach(rec);
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ---------------------------------------------------------------- files

/** Model → text (pretty JSON). */
export function serializeModel(model) {
  const m = clone(model);
  m.format = FORMAT; m.version = VERSION;
  m.meta = { ...(m.meta || {}), modified: new Date().toISOString() };
  return JSON.stringify(m, null, 1);
}

/** Text → model (fills missing fields, checks the structure). */
export function parseModel(text, name) {
  let m;
  try { m = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { throw new Error(`Not a model file: ${e.message}`); }
  if (!m || typeof m !== 'object' || !m.root) throw new Error('Not a model file: missing root system.');
  return normalizeModel(m, name);
}

export function normalizeModel(m, name) {
  m.format = FORMAT; m.version = m.version || VERSION;
  if (name) m.name = name;
  m.name = m.name || 'untitled';
  m.settings = { ...defaultSettings(), ...(m.settings || {}) };
  m.workspace = Array.isArray(m.workspace) ? m.workspace : [];
  m.buses = m.buses || {};
  m.meta = m.meta || {};
  let maxId = 0;
  const seen = (id) => { const k = Number(String(id).replace(/^\D+/, '')); if (k > maxId) maxId = k; };
  const fixSys = (s) => {
    s.blocks = s.blocks || []; s.lines = s.lines || []; s.notes = s.notes || [];
    for (const b of s.blocks) {
      seen(b.id);
      const def = blockDef(b.type);
      b.params = { ...(def ? defaultParams(b.type) : {}), ...(b.params || {}) };
      for (const k of Object.keys(b.params)) b.params[k] = String(b.params[k]);
      b.rot = b.rot || 0; b.flip = !!b.flip; b.showName = b.showName !== false;
      if (!(b.w > 0)) b.w = (def && def.size ? def.size[0] : 40);
      if (!(b.h > 0)) b.h = (def && def.size ? def.size[1] : 40);
      if (b.system) fixSys(b.system);
    }
    const fixSeg = (g) => { g.points = g.points || []; g.branches = g.branches || []; g.branches.forEach(fixSeg); };
    for (const l of s.lines) { seen(l.id); fixSeg(l); l.name = l.name || ''; l.log = !!l.log; }
    for (const n of s.notes) seen(n.id);
  };
  fixSys(m.root);
  m.nextId = Math.max(m.nextId || 1, maxId + 1);
  return m;
}

/** A model name from a file path: 'C:/x/plant.smdl' → 'plant'. */
export function modelNameOfPath(path) {
  const base = String(path || '').split(/[\\/]/).pop() || 'untitled';
  return base.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, 'm$1') || 'untitled';
}

let untitled = 0;
/** 'untitled', 'untitled1', ... (unique per session). */
export function newModelName(taken = []) {
  for (;;) { const n = untitled ? `untitled${untitled}` : 'untitled'; untitled++; if (!taken.includes(n)) return n; }
}

export { blockDef, portsOf };
