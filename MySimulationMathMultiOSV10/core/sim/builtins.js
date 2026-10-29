// M-language builtins of the simulation area: model files and editors
// (new_system, open_system, load_system, close_system, save_system), paths
// (bdroot, gcs, gcb, gcbh, find_system), editing (add_block, delete_block,
// add_line, delete_line, replace_block, set_param, get_param), simulation
// (sim, simset, simget, parsim) and the SimulationInput / SimulationOutput
// classes.
import {
  MError, str, num, bool, cell, struct, tensor, object, isText, toStr, isTensor, isStruct, isCell, isObject, isChar, empty,
} from '../value.js';
import { newModel, makeBlock, uniqueName, splitPath, joinPath, escapeName, connections, detachBlock, connect, inputUsed, clone, reassignIds, walk, portsOf, blockDef } from './model.js';
import { LIBRARY, defaultParams } from './blocks/index.js';
import { compileModel } from './compile.js';
import { Run } from './runtime.js';
import { simState, E, post, entryOf, addModel, loadModel, markChanged, handleOf, resolveObj, absPath } from './state.js';
import { writeModelFile } from './files.js';
import { startRun, finish, prepareRun } from './messages.js';

// ------------------------------------------------------------ helpers
const T = (v) => (v != null && isText(v) ? toStr(v) : null);
const need = (v, what, fn) => { const s = T(v); if (s == null) throw E(`sim:${fn}:arg`, `${what} must be text.`); return s; };
const objArg = (v, fn) => { if (v != null && isText(v)) return toStr(v); if (v != null && isTensor(v) && v.re.length === 1 && !isChar(v)) return v.re[0]; throw E(`sim:${fn}:arg`, `Expected a block path or handle.`); };
const cellCol = (items) => cell([items.length, 1], items);
const fmtN = (x) => (x === Infinity ? 'inf' : x === -Infinity ? '-inf' : Number.isNaN(x) ? 'NaN' : String(x));
/** A parameter value as the text stored in the model. */
export function paramText(v, type) {
  if (v == null) return '';
  if (isText(v)) return toStr(v);
  if (isTensor(v)) {
    if (v.cls === 'logical' && v.re.length === 1 && (type === 'bool' || type == null)) return v.re[0] ? 'on' : 'off';
    if (type === 'bool' && v.re.length === 1) return v.re[0] ? 'on' : 'off';
    const [m, n] = v.dims;
    if (v.re.length === 1) return fmtN(v.re[0]);
    if (!v.re.length) return '[]';
    const rows = [];
    for (let i = 0; i < m; i++) { const r = []; for (let j = 0; j < n; j++) r.push(fmtN(v.re[i + j * m])); rows.push(r.join(' ')); }
    return `[${rows.join('; ')}]`;
  }
  throw E('sim:param:value', `A parameter value must be text or numeric (got ${v.cls}).`);
}
/** Name/value pairs → [[name, Value], ...]. */
function pairs(args, start, fn) {
  const out = [];
  for (let i = start; i < args.length; i += 2) {
    const k = T(args[i]);
    if (k == null) throw E(`sim:${fn}:arg`, `Expected a parameter name at argument ${i + 1}.`);
    if (i + 1 >= args.length) throw E(`sim:${fn}:arg`, `Parameter '${k}' needs a value.`);
    out.push([k, args[i + 1]]);
  }
  return out;
}

// model settings: public names ↔ settings keys
const SET = {
  StartTime: 'startTime', StopTime: 'stopTime', Solver: 'solver', SolverType: 'solverType', FixedStep: 'fixedStep', MaxStep: 'maxStep', MinStep: 'minStep',
  InitialStep: 'initialStep', RelTol: 'relTol', AbsTol: 'absTol', ZeroCrossControl: 'zeroCross', MaxConsecutiveZCs: 'maxConsecutiveZc', SaveTime: 'saveTime',
  TimeSaveName: 'timeName', SaveOutput: 'saveOutput', OutputSaveName: 'outputName', SaveState: 'saveState', StateSaveName: 'stateName', SignalLogging: 'signalLogging',
  SignalLoggingName: 'logName', ReturnWorkspaceOutputs: 'singleOutput', ReturnWorkspaceOutputsName: 'singleOutputName', LimitDataPoints: 'limitPoints',
  MaxDataPoints: 'maxPoints', Decimation: 'decimation', AlgebraicLoopMsg: 'algebraicLoop', EnablePacing: 'pacing', PacingRate: 'pacingRate', StopOnAssertion: 'stopOnAssert',
};
const settingKey = (name) => {
  const k = Object.keys(SET).find((x) => x.toLowerCase() === name.toLowerCase());
  if (k) return SET[k];
  const own = Object.values(SET).find((x) => x.toLowerCase() === name.toLowerCase());
  return own || null;
};
function settingIn(key, v) {
  const s = paramText(v, ['zeroCross', 'saveTime', 'saveOutput', 'saveState', 'signalLogging', 'singleOutput', 'limitPoints', 'pacing', 'stopOnAssert'].includes(key) ? 'bool' : null);
  if (key === 'solverType') return /fixed/i.test(s) ? 'fixed' : 'variable';
  if (key === 'zeroCross') return /disable|^off$/i.test(s) ? 'off' : 'on';
  if (key === 'solver') { const t = s.replace(/^(VariableStep|FixedStep)/i, ''); return /^discrete$/i.test(t) ? 'discrete' : t.toLowerCase() === 'auto' || t === '' ? 'auto' : t; }
  if (key === 'algebraicLoop') return /error/i.test(s) ? 'error' : /none/i.test(s) ? 'none' : 'warning';
  return s;
}
function settingOut(key, s) {
  if (key === 'solverType') return s === 'fixed' ? 'Fixed-step' : 'Variable-step';
  if (key === 'zeroCross') return s === 'off' ? 'DisableAll' : 'UseLocalSettings';
  return String(s);
}
function applySettings(model, list, fn) {
  for (const [k, v] of list) {
    const key = settingKey(k);
    if (!key) throw E(`sim:${fn}:unknownParameter`, `'${k}' is not a parameter of the model '${model.name}'.`);
    model.settings[key] = settingIn(key, v);
  }
}

// ------------------------------------------------------------ library lookup
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
function libraryItem(src) {
  const last = splitPath(String(src)).pop();
  const q = norm(last);
  const alias = { subsystem: 'Subsystem', inport: 'Inport', outport: 'Outport', in: 'Inport', out: 'Outport', sin: 'SineWave', saturate: 'Saturation', logic: 'LogicalOperator', math: 'MathFunction', trigonometry: 'TrigonometricFunction', signum: 'Sign', lookupnd: 'LookupND', lookup1d: 'Lookup1D', '1dlookuptable': 'Lookup1D', '2dlookuptable': 'Lookup2D', ndlookuptable: 'LookupND', mfunction: 'MFunction' };
  const byAlias = alias[q] ? LIBRARY.find((i) => i.id === alias[q]) : null;
  if (byAlias) return byAlias;
  return LIBRARY.find((i) => norm(i.id) === q) || LIBRARY.find((i) => norm(i.type) === q && !i.variant) || LIBRARY.find((i) => norm(i.label.en) === q) || LIBRARY.find((i) => i.label.ko === last) || null;
}

// ------------------------------------------------------------ editing helpers
function parentOf(ctx, path, fn) {
  const parts = splitPath(String(path));
  if (parts.length < 2) throw E(`sim:${fn}:path`, `'${path}' must be a block path 'model/.../name'.`);
  const parent = resolveObj(ctx, joinPath(parts.slice(0, -1)));
  if (!parent.system) throw E(`sim:${fn}:path`, `'${joinPath(parts.slice(0, -1))}' is not a system.`);
  return { ...parent, name: parts[parts.length - 1] };
}
function freeSpot(sys) {
  if (!sys.blocks.length) return { x: 60, y: 60 };
  let x1 = -Infinity, y0 = Infinity;
  for (const b of sys.blocks) { x1 = Math.max(x1, b.x + b.w); y0 = Math.min(y0, b.y); }
  return { x: Math.round((x1 + 60) / 5) * 5, y: Math.round(y0 / 5) * 5 };
}
function prunePorts(sys, b) {
  const pc = portsOf(b);
  for (const c of connections(sys)) {
    if (c.dst.block === b.id && typeof c.dst.port === 'number' && c.dst.port > pc.in) detachBlock(sys, b.id, c.dst.port);
    if (c.dst.block === b.id && typeof c.dst.port === 'string' && !(pc.special || []).includes(c.dst.port)) detachBlock(sys, b.id, c.dst.port);
  }
  sys.lines = sys.lines.filter((l) => !(l.src.block === b.id && l.src.port > pc.out));
}
const ORIENT = { right: [0, false], left: [0, true], down: [90, false], up: [270, false] };
function setBlockParams(ctx, r, list, fn) {
  const b = r.block, def = blockDef(b.type);
  for (const [k, v] of list) {
    const lk = k.toLowerCase();
    if (lk === 'name') {
      const nm = paramText(v);
      if (!nm) throw E(`sim:${fn}:name`, 'A block name must not be empty.');
      if (r.parent.blocks.some((x) => x !== b && x.name === nm)) throw E(`sim:${fn}:nameTaken`, `A block named '${nm}' already exists in this system.`);
      b.name = nm;
      continue;
    }
    if (lk === 'position') { const a = isTensor(v) ? Array.from(v.re) : []; if (a.length !== 4) throw E(`sim:${fn}:position`, 'Position must be [left top right bottom].'); b.x = a[0]; b.y = a[1]; b.w = Math.max(5, a[2] - a[0]); b.h = Math.max(5, a[3] - a[1]); continue; }
    if (lk === 'orientation') { const o = ORIENT[paramText(v).toLowerCase()]; if (!o) throw E(`sim:${fn}:orientation`, "Orientation must be 'right', 'left', 'up' or 'down'."); b.rot = o[0]; b.flip = o[1]; continue; }
    if (lk === 'showname') { b.showName = paramText(v, 'bool') === 'on'; continue; }
    if (lk === 'backgroundcolor') { b.bg = paramText(v); continue; }
    if (lk === 'foregroundcolor') { b.fg = paramText(v); continue; }
    if (lk === 'description') { b.description = paramText(v); continue; }
    const p = def && def.params.find((q) => q.name.toLowerCase() === lk);
    const mp = b.mask && (b.mask.params || []).find((q) => q.name.toLowerCase() === lk);
    if (!p && !mp) throw E(`sim:${fn}:unknownParameter`, `Block '${r.path}' (${def ? def.label.en : b.type}) has no parameter named '${k}'.`);
    const name = p ? p.name : mp.name;
    let text = paramText(v, p ? p.type : mp.type === 'checkbox' ? 'bool' : null);
    if (p && p.type === 'enum' && !(p.options || []).some((o) => o.value === text)) {
      const m = (p.options || []).find((o) => o.value.toLowerCase() === text.toLowerCase());
      if (!m) throw E(`sim:${fn}:badValue`, `'${text}' is not a valid value for '${name}' (one of: ${(p.options || []).map((o) => o.value).join(', ')}).`);
      text = m.value;
    }
    b.params[name] = text;
  }
  if (r.parent) prunePorts(r.parent, b);
}
function getBlockParam(ctx, r, name) {
  const b = r.block, def = blockDef(b.type);
  const lk = name.toLowerCase();
  const pc = portsOf(b);
  switch (lk) {
    case 'name': return str(b.name);
    case 'parent': return str(joinPath(splitPath(r.path).slice(0, -1)));
    case 'blocktype': return str(b.type);
    case 'type': return str('block');
    case 'handle': return num(handleOf(ctx, r.model.name, b.id));
    case 'sid': return str(b.id);
    case 'position': return tensor('double', [1, 4], Float64Array.of(b.x, b.y, b.x + b.w, b.y + b.h));
    case 'orientation': return str(b.rot === 90 ? 'down' : b.rot === 270 ? 'up' : b.flip ? 'left' : 'right');
    case 'ports': return tensor('double', [1, 4], Float64Array.of(pc.in, pc.out, (pc.special || []).includes('enable') ? 1 : 0, (pc.special || []).includes('trigger') ? 1 : 0));
    case 'showname': return str(b.showName === false ? 'off' : 'on');
    case 'mask': return str(b.mask ? 'on' : 'off');
    case 'masktype': return str(b.mask ? b.mask.type || '' : '');
    case 'description': return str(b.description || '');
    case 'blocks': return cellCol((b.system ? b.system.blocks : []).map((x) => str(x.name)));
    case 'objectparameters': case 'dialogparameters': {
      const names = [...(def ? def.params.map((p) => p.name) : []), ...((b.mask && b.mask.params) || []).map((p) => p.name)];
      const rec = Object.create(null);
      for (const n of names) rec[n] = str(String(b.params[n] ?? ''));
      return struct([1, 1], Object.keys(rec), [rec]);
    }
    default: {
      const k = Object.keys(b.params).find((x) => x.toLowerCase() === lk);
      if (k != null) return str(String(b.params[k]));
      throw E('sim:get_param:unknownParameter', `Block '${r.path}' has no parameter named '${name}'.`);
    }
  }
}
function getModelParam(ctx, r, name) {
  const m = r.model, lk = name.toLowerCase();
  const st = simState(ctx);
  switch (lk) {
    case 'name': return str(m.name);
    case 'type': return str('block_diagram');
    case 'handle': return num(handleOf(ctx, m.name, 'root'));
    case 'filename': return str(r.entry.path || '');
    case 'blocks': return cellCol(m.root.blocks.map((x) => str(x.name)));
    case 'description': return str((m.meta && m.meta.description) || '');
    case 'simulationstatus': { const c = st.runs.get(m.name); return str(c ? c.state : 'stopped'); }
    case 'simulationtime': { const c = st.runs.get(m.name); return num(c ? c.run.t : 0); }
    case 'objectparameters': { const rec = Object.create(null); for (const [k, v] of Object.entries(SET)) rec[k] = str(settingOut(v, m.settings[v])); return struct([1, 1], Object.keys(rec), [rec]); }
    default: {
      const key = settingKey(name);
      if (!key) throw E('sim:get_param:unknownParameter', `The model '${m.name}' has no parameter named '${name}'.`);
      return str(settingOut(key, m.settings[key]));
    }
  }
}

// ------------------------------------------------------------ simulation
const SIMIN_PROPS = ['ModelName', 'Variables', 'BlockParameters', 'ModelParameters', 'ExternalInput', 'InitialState', 'Description'];
function simInput(modelName) {
  const p = Object.create(null);
  p.ModelName = str(modelName);
  p.Variables = struct([1, 0], ['Name', 'Value', 'Workspace']);
  p.BlockParameters = struct([1, 0], ['BlockPath', 'Name', 'Value']);
  p.ModelParameters = struct([1, 0], ['Name', 'Value']);
  p.ExternalInput = empty();
  p.InitialState = empty();
  p.Description = str('');
  return object('SimulationInput', p);
}
const withProp = (obj, name, v) => { const p = Object.assign(Object.create(null), obj.props); p[name] = v; return { ...obj, props: p }; };
const appendRec = (s, rec) => { const d = [...s.data, Object.assign(Object.create(null), rec)]; return struct([1, d.length], s.fields, d); };
function needSimIn(v, fn) { if (!isObject(v) || v.cls !== 'SimulationInput') throw E(`sim:${fn}:arg`, 'Expected a SimulationInput object.'); return v; }

/** External input Value → { t:number[], cols:[[Float64Array per element] per port] } (matrix [t u1 u2 ...] → one column per port). */
function externalInput(v) {
  if (v == null || (isTensor(v) && !v.re.length)) return null;
  if (isTensor(v) && v.dims[1] >= 2) {
    const [m, n] = v.dims;
    const t = Array.from(v.re.subarray(0, m));
    const cols = [];
    for (let j = 1; j < n; j++) cols.push([v.re.subarray(j * m, (j + 1) * m)]);
    return { t, cols };
  }
  throw E('sim:sim:externalInput', 'ExternalInput must be a matrix [t, u1, u2, ...].');
}

/** Runs one simulation synchronously. spec: { name, settings:[[k,v]], vars:Map, blockParams:[[path,[[k,v]]]], ext } */
export function runSimulation(ctx, spec, { nargout = 1, legacy = false } = {}) {
  const entry = loadModel(ctx, spec.name);
  const model = clone(entry.model);
  if (spec.settings && spec.settings.length) applySettings(model, spec.settings, 'sim');
  if (legacy) model.settings.saveState = 'on';
  for (const [path, list] of spec.blockParams || []) {
    const parts = splitPath(path); parts[0] = model.name;
    const r = resolveInModel({ model, path: '' }, parts);
    if (!r || !r.block) throw E('sim:sim:blockParameter', `There is no block named '${path}'.`);
    setBlockParams(ctx, r, list, 'sim');
  }
  const name = model.name;
  const prog = compileModel(model, ctx, { overrides: spec.vars || null });
  const run = new Run(prog, ctx, { name, onDiagnostic: (d) => { if (d.level === 'warning' && ctx.warning) ctx.warning('sim:diagnostic', d.message); } });
  run.init();
  if (spec.ext) run.extInput = spec.ext;
  post(ctx, run.status('running'));
  let out;
  try { out = run.runSync(); } catch (e) {
    post(ctx, { type: 'sim.diagnostic', name, level: 'error', message: e.message, block: e.block });
    post(ctx, run.status('error', e.message));
    throw e instanceof MError ? e : E('sim:sim:failed', e.message || String(e));
  }
  for (const m of run.scopeMessages(true)) post(ctx, { ...m, reset: true });
  post(ctx, run.valuesMessage());
  post(ctx, run.status('stopped'));
  if (nargout === 0) run.writeWorkspace(ctx);
  return { out, run };
}
function resolveInModel(entry, parts) {
  let sys = entry.model.root, block = null, parent = null;
  for (let i = 1; i < parts.length; i++) {
    if (!sys) return null;
    const b = sys.blocks.find((x) => x.name === parts[i]);
    if (!b) return null;
    parent = sys; block = b; sys = b.system || null;
  }
  return { entry, model: entry.model, block, system: sys, parent, path: joinPath(parts) };
}
function specFromSimIn(obj) {
  const p = obj.props;
  const vars = new Map();
  for (const r of p.Variables.data) vars.set(toStr(r.Name), r.Value);
  const bp = new Map();
  for (const r of p.BlockParameters.data) { const k = toStr(r.BlockPath); if (!bp.has(k)) bp.set(k, []); bp.get(k).push([toStr(r.Name), r.Value]); }
  return {
    name: toStr(p.ModelName), vars, blockParams: [...bp.entries()],
    settings: p.ModelParameters.data.map((r) => [toStr(r.Name), r.Value]), ext: externalInput(p.ExternalInput),
  };
}

// ------------------------------------------------------------ find_system
const FIND_OPTS = new Set(['searchdepth', 'blocktype', 'name', 'type', 'findall', 'lookundermasks', 'followlinks', 'includecommented', 'regexp', 'casesensitive', 'variants', 'matchfilter', 'parent']);
function findSystem(ctx, args) {
  let i = 0;
  let roots;
  const st = simState(ctx);
  if (args.length % 2 === 1 || (args.length && T(args[0]) != null && !FIND_OPTS.has(T(args[0]).toLowerCase()) && args.length >= 1 && !(args.length % 2 === 0 && blockParamLike(args[0])))) {
    const r = resolveObj(ctx, objArg(args[0], 'find_system'));
    roots = [r]; i = 1;
  } else roots = [...st.models.values()].map((e) => ({ entry: e, model: e.model, block: null, system: e.model.root, parent: null, path: e.model.name }));
  const crit = [];
  let depth = Infinity, findAll = false, regexp = false, cs = true;
  for (const [k, v] of pairs(args, i, 'find_system')) {
    const lk = k.toLowerCase();
    if (lk === 'searchdepth') depth = isTensor(v) ? v.re[0] : Number(T(v));
    else if (lk === 'findall') findAll = paramText(v, 'bool') === 'on';
    else if (lk === 'regexp') regexp = paramText(v, 'bool') === 'on';
    else if (lk === 'casesensitive') cs = paramText(v, 'bool') === 'on';
    else if (['lookundermasks', 'followlinks', 'includecommented', 'variants', 'matchfilter'].includes(lk)) { /* accepted, no effect */ }
    else crit.push([k, paramText(v)]);
  }
  const match = (want, have) => { if (regexp) return new RegExp(want, cs ? '' : 'i').test(have); return cs ? want === have : want.toLowerCase() === have.toLowerCase(); };
  const out = [];
  const test = (getter) => crit.every(([k, w]) => { let h; try { h = getter(k); } catch { return false; } return h != null && match(w, h); });
  for (const r of roots) {
    if (!r.block) {
      if (test((k) => { const lk = k.toLowerCase(); return lk === 'type' ? 'block_diagram' : lk === 'name' ? r.model.name : lk === 'blocktype' ? null : toStr(getModelParam(ctx, r, k)); })) out.push(findAll ? num(handleOf(ctx, r.model.name, 'root')) : str(r.model.name));
    }
    const base = r.block ? splitPath(r.path) : [r.model.name];
    const visit = (sys, path, d) => {
      if (d > depth) return;
      for (const b of sys.blocks) {
        const p = [...path, b.name];
        const rr = { entry: r.entry, model: r.model, block: b, parent: sys, path: joinPath(p) };
        const ok = test((k) => { const v = getBlockParam(ctx, rr, k); return isText(v) ? toStr(v) : null; });
        if (ok) out.push(findAll ? num(handleOf(ctx, r.model.name, b.id)) : str(rr.path));
        if (b.system) visit(b.system, p, d + 1);
      }
    };
    if (r.block && test((k) => { const v = getBlockParam(ctx, r, k); return isText(v) ? toStr(v) : null; })) out.push(findAll ? num(handleOf(ctx, r.model.name, r.block.id)) : str(r.path));
    if (r.system) visit(r.system, base, 1);
  }
  if (findAll) return tensor('double', [out.length, 1], Float64Array.from(out.map((v) => v.re[0])));
  return cellCol(out);
}
const blockParamLike = (v) => { const s = T(v); return s != null && /^[A-Z]\w*$/.test(s) && !s.includes('/'); };

// ------------------------------------------------------------ builtins
function lineEnd(sys, spec, kind, fn) {
  const s = String(spec);
  const k = s.lastIndexOf('/');
  if (k < 1) throw E(`sim:${fn}:port`, `'${s}' must be 'block/port'.`);
  const bname = s.slice(0, k).replace(/\/\//g, '/'), ps = s.slice(k + 1);
  const b = sys.blocks.find((x) => x.name === bname);
  if (!b) throw E(`sim:${fn}:noBlock`, `There is no block named '${bname}' in this system.`);
  const lp = ps.toLowerCase();
  const pc = portsOf(b);
  if (kind === 'in' && ['enable', 'trigger', 'ifaction', 'action'].includes(lp)) {
    const port = lp === 'ifaction' ? 'action' : lp;
    if (!(pc.special || []).includes(port)) throw E(`sim:${fn}:port`, `Block '${bname}' has no ${port} port.`);
    return { block: b.id, port };
  }
  const n = Number(ps);
  if (!(n >= 1) || !Number.isInteger(n)) throw E(`sim:${fn}:port`, `Invalid port '${ps}'.`);
  if (n > (kind === 'out' ? pc.out : pc.in)) throw E(`sim:${fn}:port`, `Block '${bname}' has no ${kind === 'out' ? 'output' : 'input'} port ${n}.`);
  return { block: b.id, port: n };
}
function simNames(ctx, args, nargout, fn) {
  const st = simState(ctx);
  if (args.length) return objArg(args[0], fn);
  if (!st.cur.system) throw E(`sim:${fn}:noModel`, 'No model is open.');
  return st.cur.system;
}

export const builtins = {
  new_system(args, nargout, ctx) {
    const st = simState(ctx);
    let name = args.length ? need(args[0], 'The model name', 'new_system') : '';
    if (!name) { let k = 0; do { name = k ? `untitled${k}` : 'untitled'; k++; } while (st.models.has(name)); }
    if (!/^[A-Za-z]\w*$/.test(name)) throw E('sim:new_system:name', `'${name}' is not a valid model name.`);
    if (st.models.has(name)) throw E('sim:new_system:exists', `A model named '${name}' is already loaded.`);
    addModel(ctx, newModel(name), '');
    st.cur.system = name;
    return nargout ? num(handleOf(ctx, name, 'root')) : [];
  },
  load_system(args, nargout, ctx) {
    const e = loadModel(ctx, need(args[0], 'The model name', 'load_system'));
    return nargout ? num(handleOf(ctx, e.model.name, 'root')) : [];
  },
  open_system(args, nargout, ctx) {
    const st = simState(ctx);
    const s = need(args[0], 'The model name', 'open_system');
    const parts = splitPath(s);
    const e = loadModel(ctx, parts.length > 1 ? parts[0] : s);
    if (parts.length > 1) resolveObj(ctx, joinPath([e.model.name, ...parts.slice(1)]));
    st.cur.system = parts.length > 1 ? joinPath([e.model.name, ...parts.slice(1)]) : e.model.name;
    post(ctx, { type: 'sim.openEditor', name: e.model.name, path: e.path || '' });
    return nargout ? num(handleOf(ctx, e.model.name, 'root')) : [];
  },
  close_system(args, nargout, ctx) {
    const st = simState(ctx);
    const name = args.length ? splitPath(String(objArg(args[0], 'close_system')))[0] : splitPath(st.cur.system || '')[0];
    if (!name || !st.models.has(name)) { if (args.length) throw E('sim:close_system:notLoaded', `The model '${name}' is not loaded.`); return []; }
    const save = args.length > 1 && (isText(args[1]) ? /^(on|1|true)$/i.test(toStr(args[1])) : isTensor(args[1]) && args[1].re[0] !== 0);
    if (save) builtins.save_system([str(name)], 0, ctx);
    const ctl = st.runs.get(name);
    if (ctl) finish(ctx, ctl);
    st.models.delete(name);
    if (splitPath(st.cur.system || '')[0] === name) st.cur = { system: st.models.size ? [...st.models.keys()].pop() : '', block: '' };
    post(ctx, { type: 'sim.closed', name });
    return [];
  },
  save_system(args, nargout, ctx) {
    const st = simState(ctx);
    const name = args.length ? splitPath(String(objArg(args[0], 'save_system')))[0] : splitPath(st.cur.system || '')[0];
    const e = entryOf(ctx, name);
    if (!e) throw E('sim:save_system:notLoaded', `The model '${name}' is not loaded.`);
    let p = args.length > 1 ? need(args[1], 'The file name', 'save_system') : (e.path && /\.smdl$/i.test(e.path) ? e.path : `${name}.smdl`);
    if (!/\.\w+$/.test(p)) p += '.smdl';
    p = absPath(ctx.fs, p);
    const nm = splitPath(p.split('/').pop().replace(/\.[^.]*$/, ''))[0];
    if (nm !== name && /^[A-Za-z]\w*$/.test(nm)) { st.models.delete(name); e.model.name = nm; st.models.set(nm, e); if (splitPath(st.cur.system || '')[0] === name) st.cur.system = nm; }
    e.path = p;
    writeModelFile(ctx.fs, p, e.model);
    markChanged(ctx, e.model.name);
    return nargout ? str(p) : [];
  },
  bdroot(args, nargout, ctx) {
    const st = simState(ctx);
    if (!args.length) return str(splitPath(st.cur.system || '')[0] || '');
    const r = resolveObj(ctx, objArg(args[0], 'bdroot'));
    return str(r.model.name);
  },
  gcs(args, nargout, ctx) { return str(simState(ctx).cur.system || ''); },
  gcb(args, nargout, ctx) { return str(simState(ctx).cur.block || ''); },
  gcbh(args, nargout, ctx) { const b = simState(ctx).cur.block; if (!b) return num(-1); try { const r = resolveObj(ctx, b); return num(handleOf(ctx, r.model.name, r.block.id)); } catch { return num(-1); } },
  find_system(args, nargout, ctx) { return findSystem(ctx, args); },
  add_block(args, nargout, ctx) {
    const st = simState(ctx);
    const src = need(args[0], 'The source block', 'add_block'), dst = need(args[1], 'The destination path', 'add_block');
    const par = parentOf(ctx, dst, 'add_block');
    const list = pairs(args, 2, 'add_block');
    const unique = list.find(([k]) => k.toLowerCase() === 'makenameunique');
    const rest = list.filter(([k]) => k.toLowerCase() !== 'makenameunique' && k.toLowerCase() !== 'copyoption');
    let name = par.name;
    if (par.system.blocks.some((x) => x.name === name)) {
      if (unique && paramText(unique[1], 'bool') === 'on') name = uniqueName(par.system, name);
      else throw E('sim:add_block:exists', `A block named '${name}' already exists in '${par.path}'.`);
    }
    let b = null;
    let copySrc = null;
    try { const r = resolveObj(ctx, src, { load: false }); if (r.block) copySrc = r; } catch { copySrc = null; }
    if (copySrc) {
      b = clone(copySrc.block);
      const tmp = { blocks: [b], lines: [], notes: [] };
      reassignIds(par.model, tmp);
    } else {
      const item = libraryItem(src);
      if (!item) throw E('sim:add_block:noSource', `There is no library block named '${src}'.`);
      b = makeBlock(par.model, item.type, { variant: item.variant, params: item.params }, null);
    }
    b.name = name;
    const spot = freeSpot(par.system);
    b.x = spot.x; b.y = spot.y;
    par.system.blocks.push(b);
    const r = { entry: par.entry, model: par.model, block: b, parent: par.system, path: joinPath([...splitPath(par.path), name]) };
    try { setBlockParams(ctx, r, rest, 'add_block'); } catch (e) { par.system.blocks.pop(); throw e; }
    st.cur.block = r.path; st.cur.system = par.path;
    markChanged(ctx, par.model.name);
    return nargout ? num(handleOf(ctx, par.model.name, b.id)) : [];
  },
  delete_block(args, nargout, ctx) {
    const st = simState(ctx);
    const items = isCell(args[0]) ? args[0].data : [args[0]];
    for (const it of items) {
      const r = resolveObj(ctx, objArg(it, 'delete_block'));
      if (!r.block) throw E('sim:delete_block:model', 'Use close_system to remove a whole model.');
      detachBlock(r.parent, r.block.id);
      r.parent.blocks = r.parent.blocks.filter((x) => x !== r.block);
      if (st.cur.block === r.path) st.cur.block = '';
      markChanged(ctx, r.model.name);
    }
    return [];
  },
  add_line(args, nargout, ctx) {
    if (args.length < 3) throw E('sim:add_line:arg', "Use add_line(system, 'src/port', 'dst/port').");
    const r = resolveObj(ctx, objArg(args[0], 'add_line'));
    if (!r.system) throw E('sim:add_line:system', `'${r.path}' is not a system.`);
    if (!isText(args[1]) || !isText(args[2])) throw E('sim:add_line:arg', "Port handles are not supported; use 'block/port' text.");
    const s = lineEnd(r.system, toStr(args[1]), 'out', 'add_line'), d = lineEnd(r.system, toStr(args[2]), 'in', 'add_line');
    if (inputUsed(r.system, d.block, d.port)) throw E('sim:add_line:connected', `The input port '${toStr(args[2])}' is already connected.`);
    const l = connect(r.model, r.system, s, d);
    markChanged(ctx, r.model.name);
    return nargout ? num(handleOf(ctx, r.model.name, l.id)) : [];
  },
  delete_line(args, nargout, ctx) {
    if (args.length === 1) {
      const h = objArg(args[0], 'delete_line');
      const rec = typeof h === 'number' ? simState(ctx).byHandle.get(h) : null;
      if (!rec) throw E('sim:delete_line:arg', 'Invalid line handle.');
      const e = entryOf(ctx, rec.model);
      let done = false;
      const rec2 = (sys) => { const n = sys.lines.length; sys.lines = sys.lines.filter((l) => l.id !== rec.id); if (sys.lines.length !== n) done = true; for (const b of sys.blocks) if (b.system) rec2(b.system); };
      if (e) rec2(e.model.root);
      if (!done) throw E('sim:delete_line:noLine', 'The line no longer exists.');
      markChanged(ctx, rec.model);
      return [];
    }
    const r = resolveObj(ctx, objArg(args[0], 'delete_line'));
    const s = lineEnd(r.system, need(args[1], 'The source port', 'delete_line'), 'out', 'delete_line');
    const d = lineEnd(r.system, need(args[2], 'The destination port', 'delete_line'), 'in', 'delete_line');
    const hit = connections(r.system).find((c) => c.src.block === s.block && c.src.port === s.port && c.dst.block === d.block && c.dst.port === d.port);
    if (!hit) throw E('sim:delete_line:noLine', `There is no line from '${toStr(args[1])}' to '${toStr(args[2])}'.`);
    detachBlock(r.system, d.block, d.port);
    markChanged(ctx, r.model.name);
    return [];
  },
  replace_block(args, nargout, ctx) {
    const r = resolveObj(ctx, objArg(args[0], 'replace_block'));
    const oldT = need(args[1], 'The block type', 'replace_block'), newT = need(args[2], 'The new block', 'replace_block');
    const item = libraryItem(newT);
    if (!item) throw E('sim:replace_block:noSource', `There is no library block named '${newT}'.`);
    const oldItem = libraryItem(oldT);
    const matches = (b) => b.type === oldT || (oldItem && b.type === oldItem.type);
    const done = [];
    const visit = (sys, path) => {
      for (const b of sys.blocks) {
        const p = [...path, b.name];
        if (matches(b)) {
          const nb = makeBlock(r.model, item.type, { variant: item.variant, params: item.params }, null);
          const keep = Object.fromEntries(Object.entries(b.params).filter(([k]) => k in nb.params));
          Object.assign(b, { type: item.type, params: { ...defaultParams(item.type), ...(item.params || {}), ...keep } });
          if (nb.system) b.system = nb.system; else delete b.system;
          prunePorts(sys, b);
          done.push(str(joinPath(p)));
        }
        if (b.system) visit(b.system, p);
      }
    };
    visit(r.system || r.model.root, splitPath(r.path));
    if (done.length) markChanged(ctx, r.model.name);
    return cellCol(done);
  },
  set_param(args, nargout, ctx) {
    const st = simState(ctx);
    const target = objArg(args[0], 'set_param');
    const r = resolveObj(ctx, target);
    const list = pairs(args, 1, 'set_param');
    if (!r.block) {
      for (const [k, v] of list) {
        const lk = k.toLowerCase();
        if (lk === 'simulationcommand') {
          const cmd = paramText(v).toLowerCase();
          const name = r.model.name;
          if (cmd === 'start') startRun(ctx, name, null, false);
          else if (cmd === 'stop') { const c = st.runs.get(name); if (c) finish(ctx, c); }
          else if (cmd === 'pause') { const c = st.runs.get(name); if (c && c.state === 'running') { c.state = 'paused'; if (c.timer) { clearTimeout(c.timer); c.timer = null; } post(ctx, c.run.status('paused')); } }
          else if (cmd === 'continue') { const c = st.runs.get(name); if (c && c.state === 'paused') startRun(ctx, name, null, false); }
          else if (cmd === 'step') { let c = st.runs.get(name); if (!c) c = startRun(ctx, name, null, true); if (c) { if (!c.run.step()) finish(ctx, c); else post(ctx, c.run.status('paused')); } }
          else if (cmd === 'update') { const run = prepareRun(ctx, name, r.model); post(ctx, { type: 'sim.compiled', name, ok: true, ...run.compiledInfo() }); }
          else throw E('sim:set_param:command', `Unknown simulation command '${cmd}'.`);
          continue;
        }
        if (lk === 'description') { r.model.meta.description = paramText(v); continue; }
        applySettings(r.model, [[k, v]], 'set_param');
      }
      markChanged(ctx, r.model.name);
      return [];
    }
    setBlockParams(ctx, r, list, 'set_param');
    const ctl = st.runs.get(r.model.name);
    if (ctl) { try { ctl.run.tune(r.block.id, Object.fromEntries(Object.entries(r.block.params))); } catch (e) { if (ctx.warning) ctx.warning('sim:tune', e.message); } }
    st.cur.block = joinPath([...splitPath(r.path).slice(0, -1), r.block.name]);
    markChanged(ctx, r.model.name);
    return [];
  },
  get_param(args, nargout, ctx) {
    if (args.length < 2) throw E('sim:get_param:arg', 'Use get_param(object, parameter).');
    const name = need(args[1], 'The parameter name', 'get_param');
    const one = (o) => { const r = resolveObj(ctx, objArg(o, 'get_param')); return r.block ? getBlockParam(ctx, r, name) : getModelParam(ctx, r, name); };
    if (isCell(args[0])) return cell(args[0].dims, args[0].data.map(one));
    return one(args[0]);
  },
  sim(args, nargout, ctx) {
    if (!args.length) throw E('sim:sim:arg', "Use sim('model') or sim(simIn).");
    if (isCell(args[0])) return cell(args[0].dims, args[0].data.map((x) => runSimulation(ctx, specFromSimIn(needSimIn(x, 'sim')), { nargout: 1 }).out));
    if (isObject(args[0]) && args[0].cls === 'SimulationInput') {
      const { out } = runSimulation(ctx, specFromSimIn(args[0]), { nargout });
      return nargout === 0 ? [] : out;
    }
    const name = need(args[0], 'The model name', 'sim');
    const spec = { name, settings: [] };
    let i = 1;
    if (i < args.length && isTensor(args[i]) && !isChar(args[i])) {
      const ts = Array.from(args[i].re);
      if (ts.length === 1) spec.settings.push(['StopTime', num(ts[0])]);
      else if (ts.length >= 2) { spec.settings.push(['StartTime', num(ts[0])]); spec.settings.push(['StopTime', num(ts[ts.length - 1])]); }
      i++;
      if (i < args.length && isStruct(args[i])) { const s = args[i]; for (const f of s.fields) if (!(isTensor(s.data[0][f]) && !s.data[0][f].re.length)) spec.settings.push([f, s.data[0][f]]); i++; }
      if (i < args.length && isTensor(args[i])) { spec.ext = externalInput(args[i]); i++; }
      const { out, run } = runSimulation(ctx, spec, { nargout: nargout || 1, legacy: nargout > 1 });
      if (nargout <= 1) return out;
      const p = out.props;
      const st = run.prog.model.settings;
      return [p[st.timeName || 'tout'] || empty(), p[st.stateName || 'xout'] || empty(), p[st.outputName || 'yout'] || empty()];
    }
    while (i < args.length) {
      if (isStruct(args[i])) { const s = args[i]; for (const f of s.fields) spec.settings.push([f, s.data[0][f]]); i++; continue; }
      const k = T(args[i]);
      if (k == null || i + 1 >= args.length) throw E('sim:sim:arg', `Expected a parameter name and value at argument ${i + 1}.`);
      const lk = k.toLowerCase();
      if (lk === 'srcworkspace' || lk === 'dstworkspace' || lk === 'captureerrors' || lk === 'timeout') { i += 2; continue; }
      if (lk === 'externalinput') { spec.ext = externalInput(args[i + 1]); i += 2; continue; }
      if (lk === 'loadexternalinput') { i += 2; continue; }
      spec.settings.push([k, args[i + 1]]); i += 2;
    }
    const { out, run } = runSimulation(ctx, spec, { nargout: nargout === 0 ? 0 : 1, legacy: nargout > 1 });
    if (nargout === 0) return [];
    if (nargout === 1) return out;
    const p = out.props;
    const st = run.prog.model.settings;
    return [p[st.timeName || 'tout'] || empty(), p[st.stateName || 'xout'] || empty(), p[st.outputName || 'yout'] || empty()];
  },
  simset(args) {
    let base = null, i = 0;
    if (args.length && isStruct(args[0])) { base = args[0]; i = 1; }
    const rec = Object.create(null);
    if (base) for (const f of base.fields) rec[f] = base.data[0][f];
    for (const [k, v] of pairs(args, i, 'simset')) {
      const key = settingKey(k);
      if (!key) throw E('sim:simset:unknownParameter', `'${k}' is not a simulation parameter.`);
      const pub = Object.keys(SET).find((x) => SET[x] === key);
      rec[pub] = v;
    }
    return struct([1, 1], Object.keys(rec), [rec]);
  },
  simget(args, nargout, ctx) {
    if (!args.length) throw E('sim:simget:arg', "Use simget('model') or simget('model', name).");
    if (isStruct(args[0])) {
      if (args.length < 2) return args[0];
      const n = need(args[1], 'The parameter name', 'simget');
      const f = args[0].fields.find((x) => x.toLowerCase() === n.toLowerCase());
      return f ? args[0].data[0][f] : empty();
    }
    const r = resolveObj(ctx, need(args[0], 'The model name', 'simget'));
    if (args.length > 1) return getModelParam(ctx, r, need(args[1], 'The parameter name', 'simget'));
    return getModelParam(ctx, r, 'ObjectParameters');
  },
  parsim(args, nargout, ctx) {
    if (!args.length) throw E('sim:parsim:arg', 'Use parsim(simIn) with a SimulationInput or a cell array of them.');
    const list = isCell(args[0]) ? args[0].data : [args[0]];
    const outs = list.map((x) => {
      const spec = specFromSimIn(needSimIn(x, 'parsim'));
      try { return runSimulation(ctx, spec, { nargout: 1 }).out; } catch (e) {
        const p = Object.create(null); p.ErrorMessage = str(e.message || String(e)); return object('SimulationOutput', p);
      }
    });
    return cell([1, outs.length], outs);
  },
  SimulationInput(args) { return simInput(args.length ? need(args[0], 'The model name', 'SimulationInput') : ''); },
};

// ------------------------------------------------------------ classes
const simInMethods = {
  setVariable(args) {
    const o = needSimIn(args[0], 'setVariable');
    const name = need(args[1], 'The variable name', 'setVariable');
    if (args.length < 3) throw E('sim:setVariable:arg', 'setVariable needs a name and a value.');
    let ws = 'global-workspace';
    for (const [k, v] of pairs(args, 3, 'setVariable')) if (k.toLowerCase() === 'workspace') ws = paramText(v);
    const kept = o.props.Variables.data.filter((r) => toStr(r.Name) !== name);
    const s = appendRec(struct([1, kept.length], ['Name', 'Value', 'Workspace'], kept), { Name: str(name), Value: args[2], Workspace: str(ws) });
    return withProp(o, 'Variables', s);
  },
  setModelParameter(args) {
    let o = needSimIn(args[0], 'setModelParameter');
    for (const [k, v] of pairs(args, 1, 'setModelParameter')) {
      if (!settingKey(k)) throw E('sim:setModelParameter:unknownParameter', `'${k}' is not a model parameter.`);
      const kept = o.props.ModelParameters.data.filter((r) => toStr(r.Name).toLowerCase() !== k.toLowerCase());
      o = withProp(o, 'ModelParameters', appendRec(struct([1, kept.length], ['Name', 'Value'], kept), { Name: str(k), Value: v }));
    }
    return o;
  },
  setBlockParameter(args) {
    let o = needSimIn(args[0], 'setBlockParameter');
    for (let i = 1; i < args.length; i += 3) {
      const path = need(args[i], 'The block path', 'setBlockParameter'), name = need(args[i + 1], 'The parameter name', 'setBlockParameter');
      if (i + 2 >= args.length) throw E('sim:setBlockParameter:arg', 'setBlockParameter needs a block path, a parameter name and a value.');
      o = withProp(o, 'BlockParameters', appendRec(o.props.BlockParameters, { BlockPath: str(path), Name: str(name), Value: args[i + 2] }));
    }
    return o;
  },
  setExternalInput(args) { const o = needSimIn(args[0], 'setExternalInput'); return withProp(o, 'ExternalInput', args[1] || empty()); },
  setInitialState(args) { const o = needSimIn(args[0], 'setInitialState'); return withProp(o, 'InitialState', args[1] || empty()); },
  getVariable(args) {
    const o = needSimIn(args[0], 'getVariable'); const name = need(args[1], 'The variable name', 'getVariable');
    const r = o.props.Variables.data.find((x) => toStr(x.Name) === name);
    if (!r) throw E('sim:getVariable:none', `The variable '${name}' is not set.`);
    return r.Value;
  },
};
const outNames = (o) => Object.keys(o.props).filter((k) => k !== 'SimulationMetadata' && k !== 'ErrorMessage');
export const classes = {
  SimulationInput: {
    props: SIMIN_PROPS,
    construct(args) { return simInput(args.length ? need(args[0], 'The model name', 'SimulationInput') : ''); },
    methods: simInMethods,
    display(obj, name) {
      const p = obj.props;
      return `${name ? `${name} = \n\n` : ''}  SimulationInput with properties:\n\n          ModelName: '${toStr(p.ModelName)}'\n          Variables: [1×${p.Variables.data.length} struct]\n    BlockParameters: [1×${p.BlockParameters.data.length} struct]\n    ModelParameters: [1×${p.ModelParameters.data.length} struct]\n      ExternalInput: ${p.ExternalInput && p.ExternalInput.re && p.ExternalInput.re.length ? `[${p.ExternalInput.dims.join('×')} double]` : '[]'}\n`;
    },
  },
  SimulationOutput: {
    props: [],
    methods: {
      get(args) { const o = args[0]; const n = need(args[1], 'The name', 'get'); if (!(n in o.props)) throw E('sim:SimulationOutput:noField', `The simulation output has no element named '${n}'.`); return o.props[n]; },
      find(args) { const o = args[0]; const n = need(args[1], 'The name', 'find'); return n in o.props ? o.props[n] : empty(); },
      who(args) { return cellCol(outNames(args[0]).map((k) => str(k))); },
    },
    display(obj, name) {
      const lines = outNames(obj).map((k) => { const v = obj.props[k]; const d = v && v.dims ? v.dims.join('×') : '1×1'; return `      ${k}: [${d} ${v ? v.cls : ''}]`; });
      const err = obj.props.ErrorMessage && toStr(obj.props.ErrorMessage);
      return `${name ? `${name} = \n\n` : ''}  SimulationOutput:\n${lines.join('\n')}\n\n     SimulationMetadata: [1×1 struct]\n           ErrorMessage: [${err ? `'${err}'` : '0×0 char'}]\n`;
    },
  },
};

export { libraryItem, bool, escapeName, walk };
