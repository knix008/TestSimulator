// Best-effort, read-only import of the commercial block-diagram formats:
// .slx (zip with XML parts: simulink/blockdiagram.xml, simulink/systems/*.xml,
// configSet XML) and the older .mdl text format (nested "Name { ... }"
// sections). Common block types and parameters are mapped to our library;
// anything else becomes an empty subsystem with the same port counts, and
// the list of unsupported types is put into the model description.
import { zipRead } from '../lib/io/archive.js';
import { newModel, newSystem, makeBlock, nextId } from '../sim/model.js';
import { blockDef, portsOf } from '../sim/blocks/index.js';

const dec = (b) => new TextDecoder('utf-8').decode(b);

// ---------------------------------------------------------------- block mapping
const TYPE = {
  Gain: 'Gain', Sum: 'Sum', Product: 'Product', Constant: 'Constant', Step: 'Step', Sin: 'SineWave', Integrator: 'Integrator',
  TransferFcn: 'TransferFcn', StateSpace: 'StateSpace', ZeroPole: 'ZeroPole', Scope: 'Scope', Inport: 'Inport', Outport: 'Outport',
  SubSystem: 'Subsystem', Mux: 'Mux', Demux: 'Demux', Saturate: 'Saturation', UnitDelay: 'UnitDelay', ZeroOrderHold: 'ZeroOrderHold',
  DiscreteIntegrator: 'DiscreteTimeIntegrator', DiscreteTransferFcn: 'DiscreteTransferFcn', DiscreteFilter: 'DiscreteFilter', DiscreteStateSpace: 'DiscreteStateSpace',
  DiscreteZeroPole: 'DiscreteZeroPole', Abs: 'Abs', Switch: 'Switch', RelationalOperator: 'RelationalOperator', Logic: 'LogicalOperator', Clock: 'Clock',
  DigitalClock: 'DigitalClock', Ground: 'Ground', Terminator: 'Terminator', ToWorkspace: 'ToWorkspace', FromWorkspace: 'FromWorkspace', Display: 'Display',
  Fcn: 'Fcn', Goto: 'Goto', From: 'From', GotoTagVisibility: 'GotoTagVisibility', Merge: 'Merge', EnablePort: 'EnablePort', TriggerPort: 'TriggerPort',
  ActionPort: 'ActionPort', If: 'If', SwitchCase: 'SwitchCase', ForIterator: 'ForIterator', WhileIterator: 'WhileIterator', DataStoreMemory: 'DataStoreMemory',
  DataStoreRead: 'DataStoreRead', DataStoreWrite: 'DataStoreWrite', Math: 'MathFunction', Trigonometry: 'TrigonometricFunction', MinMax: 'MinMax', Sqrt: 'Sqrt',
  Rounding: 'Rounding', Bias: 'Bias', UnaryMinus: 'UnaryMinus', Signum: 'Sign', DeadZone: 'DeadZone', RateLimiter: 'RateLimiter', Relay: 'Relay',
  Quantizer: 'Quantizer', Backlash: 'Backlash', HitCross: 'HitCrossing', Memory: 'Memory', Derivative: 'Derivative', TransportDelay: 'TransportDelay',
  VariableTransportDelay: 'VariableTransportDelay', DiscretePulseGenerator: 'PulseGenerator', RandomNumber: 'RandomNumber', UniformRandomNumber: 'UniformRandomNumber',
  SignalGenerator: 'SignalGenerator', DataTypeConversion: 'DataTypeConversion', Selector: 'Selector', BusCreator: 'BusCreator', BusSelector: 'BusSelector',
  MultiPortSwitch: 'MultiportSwitch', Stop: 'StopSimulation', XYGraph: 'XYGraph', Lookup: 'Lookup1D', Lookup2D: 'Lookup2D', DotProduct: 'DotProduct',
  Polyval: 'Polynomial', Concatenate: 'MatrixConcatenate', Reshape: 'Reshape', Width: 'Width', SignalSpecification: 'SignalSpecification', RateTransition: 'RateTransition',
  InitialCondition: 'IC', Assertion: 'Assertion', PreLookup: 'Prelookup', Interpolation_n_D: 'Interpolation', Delay: 'Delay', S_Function: null, MATLABFcn: 'InterpretedFunction',
  CombinatorialLogic: 'CombinatorialLogic', ArithShift: 'ShiftArithmetic', DiscreteFir: 'DiscreteFilter', DotProduct2: 'DotProduct',
};
/** Library blocks referenced by their library path (masked subsystems in the original library). */
const BY_SOURCE = {
  ramp: 'Ramp', 'pid controller': 'PIDController', 'discrete pid controller': 'DiscretePIDController', 'manual switch': 'ManualSwitch', 'slider gain': 'SliderGain',
  'chirp signal': 'Chirp', 'band-limited white noise': 'BandLimitedWhiteNoise', 'repeating sequence': 'RepeatingSequence', 'repeating sequence stair': 'RepeatingSequenceStair',
  'repeating sequence interpolated': 'RepeatingSequenceInterpolated', 'counter limited': 'CounterLimited', 'counter free-running': 'CounterFreeRunning', 'compare to constant': 'CompareToConstant',
  'compare to zero': 'CompareToZero', 'detect change': 'DetectChange', 'detect increase': 'DetectIncrease', 'detect decrease': 'DetectDecrease', 'detect rise positive': 'DetectRisePositive',
  'detect fall negative': 'DetectFallNegative', 'interval test': 'IntervalTest', 'bitwise operator': 'BitwiseOperator', 'coulomb & viscous friction': 'CoulombViscousFriction', 'coulomb and viscous friction': 'CoulombViscousFriction',
  'wrap to zero': 'WrapToZero', 'saturation dynamic': 'SaturationDynamic', 'dead zone dynamic': 'DeadZoneDynamic', 'tapped delay': 'TappedDelay', 'difference': 'Difference',
  'discrete derivative': 'DiscreteDerivative', 'transfer fcn first order': 'TransferFcnFirstOrder', 'check static range': 'CheckStaticRange', 'check static lower bound': 'CheckStaticLowerBound',
  'check static upper bound': 'CheckStaticUpperBound', 'check dynamic range': 'CheckDynamicRange', 'floating scope': 'FloatingScope', 'signal builder': 'SignalBuilder', 'xy graph': 'XYGraph',
  'lookup table dynamic': 'LookupTableDynamic', 'sine and cosine': 'SineCosineLookup', 'complex to real-imag': 'ComplexToRealImag', 'complex to magnitude-angle': 'ComplexToMagnitudeAngle',
};
/** Parameter renames: [our type] → { theirs: ours }. Same-named parameters are copied as they are. */
const RENAME = {
  UnitDelay: { X0: 'InitialCondition' }, Memory: { X0: 'InitialCondition' }, Integrator: {}, Saturation: {}, Constant: {},
  Lookup1D: { InputValues: 'BreakpointsForDimension1', OutputValues: 'Table', Table: 'Table' },
  Lookup2D: { RowIndex: 'BreakpointsForDimension1', ColumnIndex: 'BreakpointsForDimension2', OutputValues: 'Table' },
  Fcn: { Expr: 'Expr', Expression: 'Expr' }, Scope: { NumInputPorts: 'NumInputPorts' },
  InterpretedFunction: { MATLABFcn: 'Function' },
  Mux: { Inputs: 'Inputs' }, Demux: { Outputs: 'Outputs' },
  DiscreteTransferFcn: { Numerator: 'Numerator', Denominator: 'Denominator' },
  PulseGenerator: {}, StopSimulation: {}, XYGraph: { xmin: 'XMin', xmax: 'XMax', ymin: 'YMin', ymax: 'YMax', st: 'SampleTime' },
  TransportDelay: {}, Relay: {}, Switch: {},
};
const CRITERIA = { 'u2 >= Threshold': 'u2 >= Threshold', 'u2 > Threshold': 'u2 > Threshold', 'u2 ~= 0': 'u2 ~= 0' };

function mapType(blockType, params) {
  if (blockType === 'Reference' || blockType === 'SubSystem') {
    const src = String(params.SourceBlock || params.ReferenceBlock || '').split('/').pop().replace(/\n/g, ' ').toLowerCase().trim();
    if (src && BY_SOURCE[src]) return BY_SOURCE[src];
    if (blockType === 'SubSystem') return 'Subsystem';
    return null;
  }
  if (blockType === 'Lookup_n-D') return String(params.NumberOfTableDimensions || '1') === '2' ? 'Lookup2D' : String(params.NumberOfTableDimensions || '1') === '1' ? 'Lookup1D' : 'LookupND';
  if (blockType === 'Lookup2D') return 'Lookup2D';
  return TYPE[blockType] === undefined ? null : TYPE[blockType];
}

function convertParams(type, src) {
  const def = blockDef(type);
  const out = {};
  if (!def) return out;
  const names = new Set(def.params.map((p) => p.name));
  const ren = RENAME[type] || {};
  for (const [k, v] of Object.entries(src)) {
    const name = ren[k] || k;
    if (names.has(name)) out[name] = String(v);
  }
  if (type === 'Switch' && src.Criteria) out.Criteria = CRITERIA[src.Criteria] || 'u2 >= Threshold';
  if (type === 'Sum' && src.Inputs && !/[+-]/.test(src.Inputs) && /^\d+$/.test(src.Inputs)) out.Inputs = '+'.repeat(Number(src.Inputs));
  if (type === 'Product' && src.Inputs && /^\d+$/.test(src.Inputs)) out.Inputs = '*'.repeat(Number(src.Inputs));
  if (type === 'Constant' && src.Value == null) out.Value = '1';
  if (type === 'Step') { if (src.Time != null) out.Time = src.Time; if (src.Before != null) out.Before = src.Before; if (src.After != null) out.After = src.After; }
  if (type === 'Integrator' && src.InitialCondition != null) out.InitialCondition = src.InitialCondition;
  if (type === 'Saturation') { if (src.UpperLimit != null) out.UpperLimit = src.UpperLimit; if (src.LowerLimit != null) out.LowerLimit = src.LowerLimit; }
  for (const p of def.params) if (p.type === 'bool' && out[p.name] != null) out[p.name] = /^(on|1|true)$/i.test(out[p.name]) ? 'on' : 'off';
  for (const p of def.params) if (p.type === 'enum' && out[p.name] != null && !(p.options || []).some((o) => o.value === out[p.name])) {
    const m = (p.options || []).find((o) => o.value.toLowerCase() === out[p.name].toLowerCase());
    if (m) out[p.name] = m.value; else delete out[p.name];
  }
  return out;
}
const portCounts = (s) => { const m = /\[\s*(\d+)\s*(?:,\s*(\d+))?/.exec(String(s || '')); return m ? [Number(m[1]) || 0, Number(m[2]) || 0] : [1, 1]; };
const parsePos = (s) => { const a = String(s || '').replace(/[[\]]/g, '').split(/[\s,]+/).filter(Boolean).map(Number); return a.length === 4 && a.every(Number.isFinite) ? a : null; };

// ---------------------------------------------------------------- generic tree → model
// raw system = { blocks:[{type, name, sid, params:{}, system?}], lines:[{src:{sid|name, port}, dsts:[{sid|name, port}]}] }
function buildModel(name, rawRoot, settings, notes) {
  const model = newModel(name);
  const unsupported = new Set();
  const conv = (raw) => {
    const sys = newSystem();
    const bySid = new Map(), byName = new Map();
    for (const rb of raw.blocks) {
      let type = mapType(rb.type, rb.params);
      let b;
      if (!type) {
        unsupported.add(rb.params.SourceBlock ? `${rb.type} (${String(rb.params.SourceBlock).split('/').pop()})` : rb.type);
        const [ni, no] = portCounts(rb.params.Ports);
        b = makeBlock(model, 'Subsystem', { name: rb.name }, sys);
        b.system = newSystem();
        for (let i = 1; i <= ni; i++) b.system.blocks.push(makeBlock(model, 'Inport', { name: `In${i}`, x: 40, y: 40 * i, params: { Port: String(i) } }, b.system));
        for (let i = 1; i <= no; i++) b.system.blocks.push(makeBlock(model, 'Outport', { name: `Out${i}`, x: 260, y: 40 * i, params: { Port: String(i) } }, b.system));
        b.mask = { type: rb.type, description: `Imported placeholder for an unsupported block (${rb.type}).`, params: [], init: '', display: rb.type };
      } else {
        b = makeBlock(model, type, { name: rb.name, params: convertParams(type, rb.params) }, sys);
        if (type === 'Subsystem') b.system = rb.system ? conv(rb.system) : newSystem();
      }
      b.name = rb.name || b.name;
      const pos = parsePos(rb.params.Position);
      if (pos) { b.x = pos[0]; b.y = pos[1]; b.w = Math.max(5, pos[2] - pos[0]); b.h = Math.max(5, pos[3] - pos[1]); }
      if (/^(left)$/i.test(rb.params.Orientation || '')) b.flip = true;
      if (/^(up|down)$/i.test(rb.params.Orientation || '')) b.rot = /^down$/i.test(rb.params.Orientation) ? 90 : 270;
      sys.blocks.push(b);
      if (rb.sid != null) bySid.set(String(rb.sid), b);
      byName.set(rb.name, b);
    }
    const find = (r) => (r.sid != null ? bySid.get(String(r.sid)) : byName.get(r.name));
    const port = (b, p) => { const s = String(p).toLowerCase(); if (s === 'enable' || s === 'trigger') return s; if (s === 'ifaction' || s === 'action') return 'action'; const n = Number(p); return n >= 1 ? n : 1; };
    for (const rl of raw.lines) {
      const sb = find(rl.src);
      if (!sb) continue;
      const dsts = rl.dsts.map((d) => ({ b: find(d), p: d.port })).filter((d) => d.b);
      if (!dsts.length) continue;
      const pc = portsOf(sb);
      const sp = port(sb, rl.src.port);
      if (typeof sp === 'number' && sp > pc.out) continue;
      const segs = dsts.map((d) => ({ points: [], dst: { block: d.b.id, port: port(d.b, d.p) }, branches: [] }));
      const line = { id: nextId(model, 'l'), src: { block: sb.id, port: sp }, points: [], dst: null, branches: [], name: rl.name || '', log: false };
      if (segs.length === 1) line.dst = segs[0].dst; else line.branches = segs;
      sys.lines.push(line);
    }
    return sys;
  };
  model.root = conv(rawRoot);
  Object.assign(model.settings, settings);
  const desc = [...notes];
  if (unsupported.size) desc.push(`Unsupported block types imported as empty subsystems: ${[...unsupported].join(', ')}.`);
  model.meta.description = desc.join(' ');
  return model;
}

const SETTINGS = { StartTime: 'startTime', StopTime: 'stopTime', FixedStep: 'fixedStep', MaxStep: 'maxStep', MinStep: 'minStep', InitialStep: 'initialStep', RelTol: 'relTol', AbsTol: 'absTol' };
function settingsFrom(get) {
  const s = {};
  for (const [k, v] of Object.entries(SETTINGS)) { const x = get(k); if (x != null && x !== '') s[v] = String(x); }
  const solver = get('Solver');
  if (solver) {
    const sv = String(solver).replace(/^Variable|^Fixed/i, '').trim();
    const name = /^ode\d+\w*$/i.test(sv) ? sv.toLowerCase() : /^(Fixed|Variable)StepDiscrete$/i.test(solver) ? 'discrete' : /^ode/i.test(solver) ? solver.toLowerCase() : 'auto';
    s.solver = /^ode/.test(name) || name === 'discrete' ? name : 'auto';
  }
  const st = get('SolverType');
  if (st) s.solverType = /fixed/i.test(st) ? 'fixed' : 'variable';
  else if (/^ode[1-58]$|^ode14x$/.test(s.solver || '')) s.solverType = 'fixed';
  return s;
}

// ---------------------------------------------------------------- .mdl text
function mdlParse(text) {
  let i = 0; const n = text.length;
  const ws = () => { for (;;) { while (i < n && /\s/.test(text[i])) i++; if (text[i] === '#') { while (i < n && text[i] !== '\n') i++; continue; } break; } };
  const readStr = () => {
    let s = '';
    for (;;) {
      ws();
      if (text[i] !== '"') break;
      i++;
      while (i < n && text[i] !== '"') { if (text[i] === '\\' && i + 1 < n) { const c = text[i + 1]; s += c === 'n' ? '\n' : c === 't' ? '\t' : c; i += 2; continue; } s += text[i++]; }
      i++;
    }
    return s;
  };
  const section = (tag) => {
    const node = { tag, props: {}, children: [] };
    for (;;) {
      ws();
      if (i >= n) return node;
      if (text[i] === '}') { i++; return node; }
      const m = /^[A-Za-z_$][\w$.:-]*/.exec(text.slice(i, i + 200));
      if (!m) { i++; continue; }
      const key = m[0]; i += key.length;
      ws();
      if (text[i] === '{') { i++; node.children.push(section(key)); continue; }
      if (text[i] === '"') { node.props[key] = readStr(); continue; }
      if (text[i] === '[') { let d = 0, s = ''; do { if (text[i] === '[') d++; if (text[i] === ']') d--; s += text[i++]; } while (i < n && d > 0); node.props[key] = s; continue; }
      let s = ''; while (i < n && !/[\s}]/.test(text[i])) s += text[i++];
      node.props[key] = s.trim();
    }
  };
  return section('root');
}
function mdlSystem(node) {
  const raw = { blocks: [], lines: [] };
  for (const c of node.children) {
    if (c.tag === 'Block') {
      const sub = c.children.find((x) => x.tag === 'System');
      raw.blocks.push({ type: c.props.BlockType, name: c.props.Name, sid: c.props.SID != null ? c.props.SID : null, params: c.props, system: sub ? mdlSystem(sub) : null });
    } else if (c.tag === 'Line') {
      const dsts = [];
      const collect = (seg) => { if (seg.props.DstBlock || seg.props.Dst) dsts.push(endRef(seg.props, 'Dst')); for (const b of seg.children.filter((x) => x.tag === 'Branch')) collect(b); };
      collect(c);
      raw.lines.push({ name: c.props.Name || '', src: endRef(c.props, 'Src'), dsts });
    }
  }
  // names are the reference when SIDs are missing
  const useSid = raw.blocks.every((b) => b.sid != null) && raw.lines.every((l) => l.src.sid != null);
  if (!useSid) { for (const b of raw.blocks) b.sid = null; for (const l of raw.lines) { l.src.sid = null; l.dsts.forEach((d) => { d.sid = null; }); } }
  return raw;
}
/** 'SrcBlock "A" SrcPort 1' or 'Src "3#out:1"' → { sid, name, port }. */
function endRef(props, kind) {
  if (props[kind]) { const m = /^(\d+(?::\d+)*)#(?:out|in):?(\w+)$/.exec(String(props[kind]).trim()) || /^(\d+)#(\w+)$/.exec(String(props[kind]).trim()); if (m) return { sid: m[1], name: null, port: m[2] }; }
  return { sid: null, name: props[`${kind}Block`], port: props[`${kind}Port`] || 1 };
}

/** Imports the text of a .mdl file. */
export function importMdl(text, name) {
  const tree = mdlParse(String(text));
  const modelNode = tree.children.find((c) => c.tag === 'Model' || c.tag === 'Library') || tree;
  const sysNode = modelNode.children.find((c) => c.tag === 'System');
  if (!sysNode) throw new Error('The file has no System section.');
  const props = { ...modelNode.props };
  const cfg = []; const walk = (nd) => { for (const c of nd.children) { if (/ConfigSet|Solver/i.test(c.tag) || c.tag === 'Simulink.SolverCC') cfg.push(c.props); walk(c); } };
  walk(modelNode);
  const get = (k) => { if (props[k] != null) return props[k]; for (const p of cfg) if (p[k] != null) return p[k]; return null; };
  return buildModel(name || props.Name || 'imported', mdlSystem(sysNode), settingsFrom(get), [`Imported from a .mdl file.`]);
}

// ---------------------------------------------------------------- .slx XML
function xmlParse(text) {
  const root = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const ent = (s) => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e.toLowerCase()] ?? (e[1] === 'x' || e[1] === 'X' ? String.fromCodePoint(parseInt(e.slice(2), 16)) : String.fromCodePoint(Number(e.slice(1))))));
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const top = stack[stack.length - 1];
    if (m[1] != null) { top.text += m[1]; continue; }
    if (m[6] != null) { top.text += ent(m[6]); continue; }
    if (!m[3]) continue;
    if (m[2] === '/') { if (stack.length > 1) stack.pop(); continue; }
    const attrs = {};
    m[4].replace(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g, (s, k, q, a, b) => { attrs[k] = ent(a ?? b ?? ''); return ''; });
    const el = { tag: m[3], attrs, children: [], text: '' };
    top.children.push(el);
    if (!m[5]) stack.push(el);
  }
  return root;
}
const kids = (el, tag) => el.children.filter((c) => c.tag === tag);
const pmap = (el) => { const o = {}; for (const p of kids(el, 'P')) o[p.attrs.Name] = p.text.trim(); return o; };
function slxSystem(el, files) {
  const raw = { blocks: [], lines: [] };
  for (const b of kids(el, 'Block')) {
    const params = { ...pmap(b), BlockType: b.attrs.BlockType };
    for (const ip of kids(b, 'InstanceData')) Object.assign(params, pmap(ip));
    let sub = kids(b, 'System')[0] || null;
    if (sub && sub.attrs.Ref && !sub.children.length) { const f = files.get(sub.attrs.Ref); sub = f || null; }
    raw.blocks.push({ type: b.attrs.BlockType, name: b.attrs.Name, sid: b.attrs.SID, params, system: sub ? slxSystem(sub, files) : null });
  }
  for (const l of kids(el, 'Line')) {
    const p = pmap(l);
    const dsts = [];
    const collect = (seg) => { const q = pmap(seg); if (q.Dst) dsts.push(endRef(q, 'Dst')); for (const br of kids(seg, 'Branch')) collect(br); };
    collect(l);
    raw.lines.push({ name: p.Name || '', src: endRef(p, 'Src'), dsts });
  }
  return raw;
}

/** Imports the bytes of an .slx file. */
export function importSlx(bytes, name) {
  const entries = zipRead(bytes);
  const xml = new Map();
  for (const e of entries) if (/\.xml$/i.test(e.name)) xml.set(e.name, e.data);
  const bdName = [...xml.keys()].find((k) => /blockdiagram\.xml$/i.test(k));
  if (!bdName) throw new Error('The archive has no block diagram part.');
  const files = new Map();
  for (const [k, v] of xml) {
    const m = /systems\/(system_[\w-]+)\.xml$/i.exec(k);
    if (m) { const doc = xmlParse(dec(v)); files.set(m[1], kids(doc, 'System')[0] || doc); }
  }
  const doc = xmlParse(dec(xml.get(bdName)));
  const modelEl = doc.children.find((c) => c.tag === 'ModelInformation') ? kids(doc.children.find((c) => c.tag === 'ModelInformation'), 'Model')[0] : doc.children.find((c) => c.tag === 'Model' || c.tag === 'Library');
  let sysEl = modelEl ? kids(modelEl, 'System')[0] : null;
  if (sysEl && sysEl.attrs.Ref && !sysEl.children.length) sysEl = files.get(sysEl.attrs.Ref) || null;
  if (!sysEl) sysEl = files.get('system_root') || null;
  if (!sysEl) throw new Error('The block diagram has no root system.');
  const cfgProps = {};
  for (const [k, v] of xml) if (/config|blockdiagram/i.test(k)) {
    const text = dec(v);
    text.replace(/<P\s+Name="(\w+)"[^>]*>([^<]*)<\/P>/g, (s, a, b) => { if (SETTINGS[a] || a === 'Solver' || a === 'SolverType') if (cfgProps[a] == null) cfgProps[a] = b.trim(); return ''; });
  }
  return buildModel(name || (modelEl && modelEl.attrs.Name) || 'imported', slxSystem(sysEl, files), settingsFrom((k) => cfgProps[k] ?? null), ['Imported from an .slx file.']);
}

export { mdlParse, xmlParse };
