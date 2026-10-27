// LTI model objects (tf, ss, zpk, frd, pid) as Values: constructors, property
// access, display and indexing. The math lives in lti.js / ops.js.
import {
  tensor, num, str, cell, struct, structOf, object, stringArray, isText, toStr, toNum, isCell, isStruct, isObject, isTensor, isString, isFuncHandle, prod,
} from '../../../value.js';
import { E, F, M, nv, fmtG, cplx, isNum } from '../_util.js';
import {
  mkTF, mkZPK, mkSS, mkFRD, gainTF, toTF, toSS, toZPK, convertTo, fixMeta, trimLead, zerosM, isZeroPoly, hasDelay, totalDelay,
} from './lti.js';
import { select, expandTo } from './ops.js';

export const LTI_CLASSES = ['tf', 'ss', 'zpk', 'frd', 'pid'];
export const isLTI = (v) => v != null && isObject(v) && LTI_CLASSES.includes(v.cls);

// ------------------------------------------------------------ Value helpers
export function rowsV(v) { const { m, n, a } = M(v); const r = []; for (let i = 0; i < m; i++) { const x = new Array(n); for (let j = 0; j < n; j++) x[j] = a[i + j * m]; r.push(x); } return r; }
export function matV(rows, m, n) {
  m = m ?? rows.length; n = n ?? (rows.length ? rows[0].length : (rows.cols || 0));
  const a = new Float64Array(m * n); for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) a[i + j * m] = rows[i][j];
  return tensor('double', [m, n], a);
}
export const colV = (a) => tensor('double', [a.length, 1], Float64Array.from(a));
export const rowV = (a) => tensor('double', [1, a.length], Float64Array.from(a));
export const ccol = (re, im) => cplx([re.length, 1], re, im && im.some((x) => x !== 0) ? im : null);
const cellCol = (items) => cell([items.length, 1], items);
const namesV = (names) => cellCol(names.map((s) => str(s)));
const emptyStruct = () => struct([1, 1], [], [Object.create(null)]);
function textList(v) {
  if (isText(v) && !isCell(v)) return [toStr(v)];
  if (isCell(v)) return v.data.map((x) => (isText(x) ? toStr(x) : ''));
  if (isString(v)) return v.data.map((s) => s ?? '');
  throw E('lti:badName', 'Names must be text or a cell array of text.');
}
/** Complex vector Value → {re, im} arrays. */
export function cvec(v) {
  if (v == null) return { re: [], im: [] };
  const t = M(v); const n = t.a.length; const re = Array.from(t.a); const im = t.im ? Array.from(t.im) : new Array(n).fill(0);
  return { re, im };
}

// ------------------------------------------------------------ model <-> Value
const COMMON_PROPS = ['InputDelay', 'OutputDelay', 'Ts', 'TimeUnit', 'InputName', 'InputUnit', 'InputGroup', 'OutputName', 'OutputUnit', 'OutputGroup', 'Notes', 'UserData', 'Name', 'SamplingGrid'];
export const PROPS = {
  tf: ['Numerator', 'Denominator', 'Variable', 'IODelay', ...COMMON_PROPS],
  zpk: ['Z', 'P', 'K', 'DisplayFormat', 'Variable', 'IODelay', ...COMMON_PROPS],
  ss: ['A', 'B', 'C', 'D', 'E', 'Scaled', 'StateName', 'StateUnit', 'InternalDelay', ...COMMON_PROPS],
  frd: ['Frequency', 'ResponseData', 'FrequencyUnit', 'IODelay', ...COMMON_PROPS],
  pid: ['Kp', 'Ki', 'Kd', 'Tf', 'IFormula', 'DFormula', 'InputDelay', 'OutputDelay', 'Ts', 'TimeUnit', 'InputName', 'InputUnit', 'InputGroup', 'OutputName', 'OutputUnit', 'OutputGroup', 'Notes', 'UserData', 'Name', 'SamplingGrid'],
};
function commonProps(m, p) {
  const meta = m.meta;
  p.InputDelay = colV(meta.InputDelay); p.OutputDelay = colV(meta.OutputDelay); p.Ts = num(m.Ts); p.TimeUnit = str(meta.TimeUnit || 'seconds');
  p.InputName = namesV(meta.InputName); p.InputUnit = namesV(meta.InputUnit); p.InputGroup = emptyStruct();
  p.OutputName = namesV(meta.OutputName); p.OutputUnit = namesV(meta.OutputUnit); p.OutputGroup = emptyStruct();
  p.Notes = stringArray([0, 1], []); p.UserData = meta.UserData || tensor('double', [0, 0]); p.Name = str(meta.Name || ''); p.SamplingGrid = emptyStruct();
  if (Array.isArray(meta.Notes) && meta.Notes.length) p.Notes = stringArray([meta.Notes.length, 1], meta.Notes.slice());
}
const defVar = (m) => m.meta.Variable || (m.Ts === 0 ? 's' : 'z');
/** Builds the object Value of a model. */
export function makeObj(m) {
  const p = Object.create(null);
  let cls = m.type;
  if (m.type === 'tf') {
    p.Numerator = cell([m.ny, m.nu], colMajor2(m.num, m.ny, m.nu).map((a) => rowV(a)));
    p.Denominator = cell([m.ny, m.nu], colMajor2(m.den, m.ny, m.nu).map((a) => rowV(a)));
    p.Variable = str(defVar(m)); p.IODelay = matV(m.meta.IODelay, m.ny, m.nu);
  } else if (m.type === 'zpk') {
    p.Z = cell([m.ny, m.nu], colMajor2(m.z, m.ny, m.nu).map((z) => ccol(z.re, z.im)));
    p.P = cell([m.ny, m.nu], colMajor2(m.p, m.ny, m.nu).map((z) => ccol(z.re, z.im)));
    p.K = matV(m.k, m.ny, m.nu); p.DisplayFormat = str(m.meta.DisplayFormat || 'roots');
    let v = defVar(m); if (v === 'z^-1' || v === 'q^-1') v = 'z'; p.Variable = str(v); p.IODelay = matV(m.meta.IODelay, m.ny, m.nu);
  } else if (m.type === 'ss') {
    p.A = matV(m.A, m.n, m.n); p.B = matV(m.B, m.n, m.nu); p.C = matV(m.C, m.ny, m.n); p.D = matV(m.D, m.ny, m.nu);
    p.E = m.E ? matV(m.E, m.n, m.n) : tensor('double', [0, 0]); p.Scaled = tensor('logical', [1, 1], [0]);
    p.StateName = namesV(m.meta.StateName); p.StateUnit = namesV(m.meta.StateUnit); p.InternalDelay = tensor('double', [0, 1]);
  } else if (m.type === 'frd') {
    const nf = m.freq.length; const re = new Float64Array(m.ny * m.nu * nf), im = new Float64Array(m.ny * m.nu * nf);
    for (let k = 0; k < nf; k++) for (let j = 0; j < m.nu; j++) for (let i = 0; i < m.ny; i++) { const q = i + j * m.ny + k * m.ny * m.nu; re[q] = m.R[i][j].re[k]; im[q] = m.R[i][j].im[k]; }
    p.Frequency = colV(m.freq); p.ResponseData = cplx([m.ny, m.nu, nf], re, im); p.FrequencyUnit = str(m.FrequencyUnit || 'rad/TimeUnit'); p.IODelay = matV(m.meta.IODelay, m.ny, m.nu);
  } else if (m.type === 'pid') {
    cls = 'pid';
    p.Kp = num(m.Kp); p.Ki = num(m.Ki); p.Kd = num(m.Kd); p.Tf = num(m.Tf); p.IFormula = str(m.IFormula || ''); p.DFormula = str(m.DFormula || '');
  }
  commonProps(m, p);
  const o = object(cls, p, { extra: { _lti: m } });
  o._ltiProps = p;
  return o;
}
function colMajor2(X, ny, nu) { const r = []; for (let j = 0; j < nu; j++) for (let i = 0; i < ny; i++) r.push(X[i][j]); return r; }
function fromColMajor(list, ny, nu) { const r = []; for (let i = 0; i < ny; i++) { r.push([]); for (let j = 0; j < nu; j++) r[i].push(list[i + j * ny]); } return r; }

function metaFromProps(p, ny, nu, n = 0) {
  const g = (k) => p[k];
  const meta = {
    InputName: g('InputName') ? textList(g('InputName')) : [], OutputName: g('OutputName') ? textList(g('OutputName')) : [],
    InputUnit: g('InputUnit') ? textList(g('InputUnit')) : [], OutputUnit: g('OutputUnit') ? textList(g('OutputUnit')) : [],
    StateName: g('StateName') ? textList(g('StateName')) : [], StateUnit: g('StateUnit') ? textList(g('StateUnit')) : [],
    InputDelay: g('InputDelay') ? Array.from(F(g('InputDelay'))) : [], OutputDelay: g('OutputDelay') ? Array.from(F(g('OutputDelay'))) : [],
    IODelay: g('IODelay') && prod(g('IODelay').dims) ? rowsV(g('IODelay')) : null,
    TimeUnit: g('TimeUnit') ? toStr(g('TimeUnit')) : 'seconds', Name: g('Name') ? toStr(g('Name')) : '',
    Notes: g('Notes') && isString(g('Notes')) ? g('Notes').data.slice() : [], UserData: g('UserData') || null,
    Variable: g('Variable') ? toStr(g('Variable')) : null, DisplayFormat: g('DisplayFormat') ? toStr(g('DisplayFormat')) : 'roots',
  };
  if (meta.InputDelay.length === 1 && nu > 1) meta.InputDelay = new Array(nu).fill(meta.InputDelay[0]);
  if (meta.OutputDelay.length === 1 && ny > 1) meta.OutputDelay = new Array(ny).fill(meta.OutputDelay[0]);
  if (meta.IODelay && meta.IODelay.length === 1 && meta.IODelay[0].length === 1 && ny * nu > 1) meta.IODelay = Array.from({ length: ny }, () => new Array(nu).fill(meta.IODelay[0][0]));
  return fixMeta(meta, ny, nu, n);
}
/** Model of an object Value (cached while its props are unchanged). */
export function getModel(o) {
  if (o._lti && o._ltiProps === o.props) return o._lti;
  const p = o.props; const Ts = p.Ts ? toNum(p.Ts) : 0;
  let m;
  if (o.cls === 'tf') {
    const N = p.Numerator, D = p.Denominator;
    const ny = N.dims[0], nu = N.dims[1];
    const nl = fromColMajor(N.data.map((x) => Array.from(F(x))), ny, nu), dl = fromColMajor(D.data.map((x) => Array.from(F(x))), ny, nu);
    m = mkTF(nl, dl, Ts, metaFromProps(p, ny, nu));
  } else if (o.cls === 'zpk') {
    const ny = p.K.dims[0], nu = p.K.dims[1];
    m = mkZPK(fromColMajor(p.Z.data.map(cvec), ny, nu), fromColMajor(p.P.data.map(cvec), ny, nu), rowsV(p.K), Ts, metaFromProps(p, ny, nu));
  } else if (o.cls === 'ss') {
    const A = rowsV(p.A), D = rowsV(p.D); const ny = p.D.dims[0], nu = p.D.dims[1];
    const Em = p.E && prod(p.E.dims) ? rowsV(p.E) : null;
    m = mkSS(A, rowsV(p.B), rowsV(p.C), D, Ts, metaFromProps(p, ny, nu, A.length), Em, [ny, nu]);
  } else if (o.cls === 'frd') {
    const R = p.ResponseData; const d = R.dims; const ny = d[0], nu = d[1], nf = d.length > 2 ? d[2] : 1;
    const t = M(R); const Rr = [];
    for (let i = 0; i < ny; i++) { Rr.push([]); for (let j = 0; j < nu; j++) { const re = [], im = []; for (let k = 0; k < nf; k++) { const q = i + j * ny + k * ny * nu; re.push(t.a[q]); im.push(t.im ? t.im[q] : 0); } Rr[i].push({ re, im }); } }
    m = mkFRD(Rr, Array.from(F(p.Frequency)), Ts, metaFromProps(p, ny, nu)); m.FrequencyUnit = p.FrequencyUnit ? toStr(p.FrequencyUnit) : 'rad/TimeUnit';
  } else if (o.cls === 'pid') {
    m = pidModel(toNum(p.Kp), toNum(p.Ki), toNum(p.Kd), toNum(p.Tf), Ts, p.IFormula ? toStr(p.IFormula) : '', p.DFormula ? toStr(p.DFormula) : '', metaFromProps(p, 1, 1));
  } else throw E('lti:notModel', `Expected a dynamic system model, got ${o.cls}.`);
  o._lti = m; o._ltiProps = o.props;
  return m;
}

// ------------------------------------------------------------ pid
/** pid parameters + its transfer function (type 'pid' keeps the parameters; toTF works on .tf). */
export function pidModel(Kp, Ki, Kd, Tf, Ts, IFormula = '', DFormula = '', meta) {
  const m = { type: 'pid', Kp, Ki, Kd, Tf, Ts, IFormula: Ts ? (IFormula || 'ForwardEuler') : '', DFormula: Ts ? (DFormula || 'ForwardEuler') : '', ny: 1, nu: 1, meta: fixMeta(meta, 1, 1) };
  return m;
}
/** Transfer function of a pid model. */
export function pidTF(m) {
  const { Kp, Ki, Kd, Tf, Ts } = m;
  let num = [Kp], den = [1];
  const add = (n2, d2) => { const nn = polyAddL(conv(num, d2), conv(n2, den)); num = nn; den = conv(den, d2); };
  if (Ts === 0) {
    if (Ki) add([Ki], [1, 0]);
    if (Kd) add([Kd, 0], Tf ? [Tf, 1] : [1]);
  } else {
    const T = Ts > 0 ? Ts : 1;
    const integ = (f) => (f === 'BackwardEuler' ? [[T, 0], [1, -1]] : f === 'Trapezoidal' ? [[T / 2, T / 2], [1, -1]] : [[T], [1, -1]]);
    if (Ki) { const [n, d] = integ(m.IFormula); add(n.map((x) => x * Ki), d); }
    if (Kd) {
      if (Tf) { const [n, d] = integ(m.DFormula); /* Kd/(Tf + IF(z)) */ add(d.map((x) => x * Kd), polyAddL(d.map((x) => x * Tf), n)); }
      else add([Kd, -Kd], [T, 0]);
    }
  }
  return mkTF([[num]], [[den]], Ts, { ...m.meta });
}
const conv = (a, b) => { const r = new Array(a.length + b.length - 1).fill(0); for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] += a[i] * b[j]; return r; };
const polyAddL = (a, b) => { const n = Math.max(a.length, b.length); const A = [...new Array(n - a.length).fill(0), ...a], B = [...new Array(n - b.length).fill(0), ...b]; return A.map((x, i) => x + B[i]); };

// ------------------------------------------------------------ argument → model
/** Any LTI object or numeric gain → internal model ('pid' becomes tf). */
export function ltiArg(v, what = 'Argument') {
  if (isLTI(v)) { const m = getModel(v); return m.type === 'pid' ? pidTF(m) : m; }
  if (v && isObject(v) && v.cls === 'digitalFilter' && v.props) {
    const n = v.props.Numerator, d = v.props.Denominator;
    if (n) return mkTF([[Array.from(F(n))]], [[d ? Array.from(F(d)) : [1]]], -1, {});
  }
  if (isNum(v)) { const r = rowsV(v); return gainTF(r.length ? r : [], 0); }
  throw E('lti:notModel', `${what} must be a dynamic system model (tf, ss, zpk, frd) or a numeric array.`);
}
/** Model → object Value of the type requested. */
export function outObj(m, type) { return makeObj(type && type !== m.type ? convertTo(m, type) : m); }

// ------------------------------------------------------------ name/value pairs on constructors
const SETTABLE = ['Variable', 'Ts', 'TimeUnit', 'InputName', 'OutputName', 'StateName', 'InputUnit', 'OutputUnit', 'StateUnit', 'InputDelay', 'OutputDelay', 'IODelay', 'Name', 'Notes', 'UserData', 'DisplayFormat', 'InputGroup', 'OutputGroup', 'FrequencyUnit', 'IFormula', 'DFormula'];
export function applyNV(m, args) {
  if (!args.length) return m;
  if (args.length % 2) throw E('lti:badNV', 'Property name/value pairs must come in pairs.');
  let o = makeObj(m);
  for (let i = 0; i < args.length; i += 2) {
    if (!isText(args[i])) throw E('lti:badNV', 'Property names must be text.');
    o = setProp(o, toStr(args[i]), args[i + 1]);
  }
  return getModel(o);
}

// ------------------------------------------------------------ property get / set
const ALIASES = { num: 'Numerator', den: 'Denominator', a: 'A', b: 'B', c: 'C', d: 'D', e: 'E', z: 'Z', p: 'P', k: 'K', u: 'InputName', y: 'OutputName', ts: 'Ts' };
export function propName(o, name) {
  const list = PROPS[o.cls] || [];
  const exact = list.find((x) => x === name); if (exact) return exact;
  const ci = list.find((x) => x.toLowerCase() === name.toLowerCase()); if (ci) return ci;
  if (ALIASES[name.toLowerCase()] && list.includes(ALIASES[name.toLowerCase()]) && name.length <= 3) return ALIASES[name.toLowerCase()];
  const pref = list.filter((x) => x.toLowerCase().startsWith(name.toLowerCase())); if (pref.length === 1) return pref[0];
  throw E('lti:noProp', `The property "${name}" is not defined for ${o.cls} models.`);
}
export function setProp(o, name, rhs) {
  const pn = propName(o, name);
  const props = Object.assign(Object.create(null), o.props);
  let v = rhs;
  if (['InputName', 'OutputName', 'StateName', 'InputUnit', 'OutputUnit', 'StateUnit'].includes(pn)) v = namesV(textList(rhs));
  if (pn === 'Variable') {
    const s = toStr(rhs); const ok = o.cls === 'zpk' ? ['s', 'p', 'z', 'q', 'z^-1', 'q^-1'] : ['s', 'p', 'z', 'q', 'z^-1', 'q^-1'];
    if (!ok.includes(s)) throw E('lti:badVariable', `Invalid value for the "Variable" property: '${s}'.`);
    v = str(s);
  }
  if (pn === 'Ts') {
    const t = toNum(rhs); if (!(t === 0 || t === -1 || t > 0)) throw E('lti:badTs', 'The sample time must be 0, -1 or a positive scalar.');
    const curT = props.Ts ? toNum(props.Ts) : 0;
    if (props.Variable) { const cv = toStr(props.Variable); if (t === 0 && /^[zq]/.test(cv)) props.Variable = str('s'); if (t !== 0 && (cv === 's' || cv === 'p') && curT === 0) props.Variable = str('z'); }
    v = num(t);
  }
  props[pn] = v;
  const r = { ...o, props }; delete r._lti; r._ltiProps = null;
  // validate by rebuilding
  const m = getModel(r);
  if (pn === 'Variable' && m.type === 'tf') {
    // re-pad numerators/denominators for the new variable convention
    return makeObj(mkTF(m.num.map((row) => row.map((p) => trimFor(p, toStr(v)))), m.den.map((row) => row.map((p) => trimFor(p, toStr(v)))), m.Ts, m.meta));
  }
  return makeObj(m);
}
const trimFor = (p, v) => (v === 'z^-1' || v === 'q^-1' ? trimTrail(trimLead(p)) : trimLead(p));
const trimTrail = (p) => { let n = p.length; while (n > 1 && p[n - 1] === 0) n--; return p.slice(0, n); };

// ------------------------------------------------------------ indexing helpers
const COLONLIKE = (a) => a && (a.colon || (a.cls === ':') || (a.cls === 'char' && a.re && a.re.length === 1 && a.re[0] === 58));
export function indexList(a, n, names) {
  if (COLONLIKE(a)) return Array.from({ length: n }, (_, i) => i);
  if (isText(a) || isCell(a) || isString(a)) {
    const list = textList(a); return list.map((s) => { const k = names.indexOf(s); if (k < 0) throw E('lti:badIndex', `Unknown channel name '${s}'.`); return k; });
  }
  const t = M(a);
  if (a.cls === 'logical') { const r = []; for (let i = 0; i < t.a.length; i++) if (t.a[i]) r.push(i); return r; }
  return Array.from(t.a).map((x) => { if (!Number.isInteger(x) || x < 1 || x > n) throw E('lti:badIndex', `Index exceeds model dimensions (${n}).`); return x - 1; });
}
/** Applies the remaining subscripts to a plain value (cells, arrays, structs). */
export function applyRest(v, subs) {
  for (const s of subs) {
    if (s.type === '.') {
      if (isStruct(v)) { const f = v.fields.find((x) => x === s.subs); if (!f) throw E('lti:noField', `Reference to non-existent field '${s.subs}'.`); v = v.data[0][f]; continue; }
      if (isLTI(v)) { v = v.props[propName(v, s.subs)]; continue; }
      throw E('lti:badIndex', 'Dot indexing is not supported for this value.');
    }
    const idx = s.subs;
    const dims = v.dims || [1, 1];
    let lin;
    if (idx.length === 1) lin = indexList(idx[0], prod(dims), []);
    else {
      const r = indexList(idx[0], dims[0], []), c = indexList(idx[1], dims[1], []);
      lin = []; for (const j of c) for (const i of r) lin.push(i + j * dims[0]);
      if (s.type === '()' && !isCell(v) || s.type === '()') {
        if (isCell(v)) { v = cell([r.length, c.length], lin.map((k) => v.data[k])); continue; }
        const t = M(v); v = cplx([r.length, c.length], lin.map((k) => t.a[k]), t.im ? lin.map((k) => t.im[k]) : null); continue;
      }
    }
    if (s.type === '{}') { if (!isCell(v)) throw E('lti:badIndex', 'Brace indexing is only supported for cell arrays.'); if (lin.length !== 1) throw E('lti:badIndex', 'Brace indexing must select one element here.'); v = v.data[lin[0]]; continue; }
    if (isCell(v)) { v = cell([1, lin.length], lin.map((k) => v.data[k])); continue; }
    const t = M(v); const shape = dims[0] === 1 ? [1, lin.length] : [lin.length, 1];
    v = cplx(shape, lin.map((k) => t.a[k]), t.im ? lin.map((k) => t.im[k]) : null);
  }
  return v;
}
/** subsref of an LTI object. */
export function ltiSubsref(o, subs) {
  let k = 0; let v = o;
  if (subs[0].type === '()') {
    const m = getModel(o);
    const args = subs[0].subs;
    if (args.length === 1 && !COLONLIKE(args[0]) && m.ny * m.nu !== 1 && !(m.ny === 1 || m.nu === 1)) throw E('lti:badIndex', 'Use sys(outputs, inputs) to select a subsystem.');
    let ri, ci;
    if (args.length === 1) { if (m.ny === 1) { ri = [0]; ci = indexList(args[0], m.nu, m.meta.InputName); } else { ci = [0]; ri = indexList(args[0], m.ny, m.meta.OutputName); } }
    else { ri = indexList(args[0], m.ny, m.meta.OutputName); ci = indexList(args[1], m.nu, m.meta.InputName); }
    v = makeObj(m.type === 'pid' ? m : select(m, ri, ci));
    k = 1;
  }
  if (k < subs.length && subs[k].type === '.') {
    v = v.props[propName(v, subs[k].subs)]; k++;
  } else if (k < subs.length && subs[k].type === '{}') throw E('lti:badIndex', `Brace indexing is not supported for ${o.cls} models.`);
  return applyRest(v, subs.slice(k));
}
/** subsasgn of an LTI object. */
export function ltiSubsasgn(o, subs, rhs) {
  if (subs[0].type === '.') {
    const pn = propName(o, subs[0].subs);
    if (subs.length === 1) return setProp(o, pn, rhs);
    // nested: e.g. sys.InputName{2} = 'u2'
    let cur = o.props[pn];
    const s = subs[1];
    if (subs.length === 2 && (s.type === '{}' || s.type === '()')) {
      const k = s.subs.length === 1 ? indexList(s.subs[0], prod(cur.dims), [])[0] : indexList(s.subs[0], cur.dims[0], [])[0] + indexList(s.subs[1], cur.dims[1], [])[0] * cur.dims[0];
      if (isCell(cur)) { const data = cur.data.slice(); while (data.length <= k) data.push(str('')); data[k] = s.type === '{}' ? rhs : (isCell(rhs) ? rhs.data[0] : rhs); cur = cell(cur.dims[0] === 1 ? [1, data.length] : [data.length, 1], data); }
      else { const t = M(cur); const a = Float64Array.from(t.a); a[k] = toNum(rhs); cur = tensor('double', cur.dims, a); }
      return setProp(o, pn, cur);
    }
    throw E('lti:badAssign', 'Unsupported nested assignment to a model property.');
  }
  if (subs[0].type === '()' && subs.length === 1) {
    const m = getModel(o); const r = ltiArg(rhs);
    if (m.type === 'ss' || m.type === 'frd' || m.type === 'pid') throw E('lti:badAssign', `Assigning subsystems of ${m.type} models is not supported; build the model with [ ] concatenation instead.`);
    const args = subs[0].subs;
    const ri = indexList(args[0], m.ny, m.meta.OutputName), ci = args.length > 1 ? indexList(args[1], m.nu, m.meta.InputName) : [0];
    const tm = toTF(m), tr = toTF(expandTo(r, ri.length, ci.length));
    const num = tm.num.map((row) => row.slice()), den = tm.den.map((row) => row.slice());
    ri.forEach((i, a) => ci.forEach((j, b) => { num[i][j] = tr.num[a][b]; den[i][j] = tr.den[a][b]; }));
    const res = mkTF(num, den, tm.Ts, tm.meta);
    return makeObj(m.type === 'zpk' ? toZPK(res) : res);
  }
  throw E('lti:badAssign', `Unsupported assignment to a ${o.cls} model.`);
}

// ------------------------------------------------------------ display
const coefStr = (c) => (Number.isInteger(c) && Math.abs(c) < 1e10 ? String(c) : fmtG(c, 4));
export function polyText(p, v) {
  const asc = v === 'z^-1' || v === 'q^-1';
  const q = asc ? trimTrail(p) : trimLead(p);
  const deg = q.length - 1; const terms = [];
  for (let i = 0; i < q.length; i++) {
    const c = q[i]; if (c === 0) continue;
    const pw = asc ? i : deg - i;
    const a = Math.abs(c);
    let t;
    const vv = asc ? (pw === 0 ? '' : `${v[0]}^-${pw}`) : (pw === 0 ? '' : pw === 1 ? v : `${v}^${pw}`);
    if (!vv) t = coefStr(a); else t = a === 1 ? vv : `${coefStr(a)} ${vv}`;
    terms.push([c < 0, t]);
  }
  if (!terms.length) return '0';
  return terms.map(([neg, t], k) => (k === 0 ? (neg ? '-' : '') + t : (neg ? ' - ' : ' + ') + t)).join('');
}
function center(s, w) { const l = Math.floor((w - s.length) / 2); return ' '.repeat(Math.max(0, l)) + s; }
function fracLines(numS, denS, prefix = '') {
  const w = Math.max(numS.length, denS.length);
  const pad = ' '.repeat(prefix.length);
  return [pad + center(numS, w), prefix + '-'.repeat(w), pad + center(denS, w)];
}
function factorText(z, v, isDen) {
  // group roots: real and complex pairs; repeated factors with ^k
  const items = []; const used = new Array(z.re.length).fill(false);
  for (let i = 0; i < z.re.length; i++) {
    if (used[i]) continue; used[i] = true;
    const r = z.re[i], im = z.im[i];
    let t;
    if (Math.abs(im) > 1e-12 * Math.max(1, Math.abs(r))) {
      // find conjugate
      for (let j = i + 1; j < z.re.length; j++) if (!used[j] && Math.abs(z.re[j] - r) <= 1e-10 * Math.max(1, Math.abs(r)) && Math.abs(z.im[j] + im) <= 1e-10 * Math.max(1, Math.abs(im))) { used[j] = true; break; }
      const b = -2 * r, c = r * r + im * im;
      t = `${v}^2` + (b === 0 ? '' : (b < 0 ? ' - ' : ' + ') + (Math.abs(b) === 1 ? '' : coefStr(Math.abs(b))) + v) + (c === 0 ? '' : ' + ' + coefStr(c));
      t = `(${t})`;
    } else if (r === 0) t = v;
    else t = `(${v}${r < 0 ? '+' : '-'}${coefStr(Math.abs(r))})`;
    items.push(t);
  }
  // collapse repeats
  const out = []; for (const t of items) { const last = out[out.length - 1]; if (last && last.t === t) last.k++; else out.push({ t, k: 1 }); }
  return out.map(({ t, k }) => (k > 1 ? (t.startsWith('(') ? `${t}^${k}` : `${t}^${k}`) : t)).join(' ');
}
function tsLine(m) {
  if (m.Ts === 0) return '';
  return m.Ts === -1 ? 'Sample time: unspecified\n' : `Sample time: ${fmtG(m.Ts, 5)} ${m.meta.TimeUnit || 'seconds'}\n`;
}
function delayPrefix(m, i, j) {
  const tau = totalDelay(m, i, j); if (!tau) return '';
  if (m.Ts === 0) return `exp(-${coefStr(tau)}*s) * `;
  return `z^(-${tau}) * `;
}
function sisoText(m, i, j, indent = '  ') {
  const v = m.type === 'zpk' ? (defVar(m) === 'z^-1' ? 'z' : defVar(m)) : defVar(m);
  let numS, denS;
  if (m.type === 'tf') {
    numS = polyText(m.num[i][j], v); const d = (v === 'z^-1' || v === 'q^-1') ? trimTrail(m.den[i][j]) : trimLead(m.den[i][j]);
    denS = d.length === 1 && d[0] === 1 ? null : polyText(m.den[i][j], v);
  } else {
    const k = m.k[i][j]; const zt = factorText(m.z[i][j], v); const pt = factorText(m.p[i][j], v);
    if (k === 0) { numS = '0'; denS = null; }
    else { numS = zt ? (k === 1 ? zt : k === -1 ? `-${zt}` : `${coefStr(k)} ${zt}`) : coefStr(k); denS = pt || null; }
  }
  const pre = delayPrefix(m, i, j);
  if (denS == null) return [indent + pre + numS];
  return fracLines(numS, denS, pre).map((l) => indent + l);
}
function isStaticModel(m) {
  if (m.type === 'tf') return m.den.every((r) => r.every((d) => trimLead(d).length === 1)) && m.num.every((r) => r.every((n) => trimLead(n).length === 1)) && !hasDelay(m);
  if (m.type === 'zpk') return m.p.every((r) => r.every((p) => !p.re.length)) && m.z.every((r) => r.every((z) => !z.re.length)) && !hasDelay(m);
  if (m.type === 'ss') return m.n === 0;
  return false;
}
function matTable(rows, rlab, clab) {
  const fmt = (x) => (x === 0 ? '0' : fmtG(x, 4));
  const cells = rows.map((r) => r.map(fmt));
  const lw = Math.max(0, ...rlab.map((s) => s.length));
  const cw = clab.map((c, j) => Math.max(c.length, ...cells.map((r) => r[j].length)) + 2);
  const lines = ['   ' + ' '.repeat(lw) + clab.map((c, j) => c.padStart(cw[j])).join('')];
  rows.forEach((_, i) => lines.push('   ' + rlab[i].padEnd(lw) + cells[i].map((s, j) => s.padStart(cw[j])).join('')));
  return lines.join('\n');
}
const chanNames = (names, base) => names.map((s, i) => s || `${base}${i + 1}`);
export function displayText(o, name) {
  const m = getModel(o);
  const out = [`${name} =`, ' '];
  const kind = (m.Ts === 0 ? 'Continuous-time' : 'Discrete-time');
  if (m.type === 'pid') return pidDisplay(m, name);
  if (m.ny * m.nu === 0) { out.push(`  Empty ${m.type} model.`, ''); return out.join('\n') + '\n'; }
  if (m.type === 'tf' || m.type === 'zpk') {
    if (isStaticModel(m)) {
      if (m.ny * m.nu === 1) out.push('  ' + coefStr(m.type === 'tf' ? trimLead(m.num[0][0])[0] / trimLead(m.den[0][0])[0] : m.k[0][0]));
      else { const t = toTF(m); const G = t.num.map((r, i) => r.map((n, j) => trimLead(n)[0] / trimLead(t.den[i][j])[0])); out.push('  D = ', matTable(G, chanNames(m.meta.OutputName, 'y'), chanNames(m.meta.InputName, 'u'))); }
      out.push(' ', 'Static gain.'); return out.join('\n') + '\n';
    }
    if (m.ny * m.nu === 1) out.push(...sisoText(m, 0, 0));
    else {
      for (let j = 0; j < m.nu; j++) {
        out.push(`  From input ${m.meta.InputName[j] ? `"${m.meta.InputName[j]}"` : j + 1} to output${m.ny > 1 ? '...' : ` ${m.meta.OutputName[0] ? `"${m.meta.OutputName[0]}"` : 1}:`}`);
        for (let i = 0; i < m.ny; i++) {
          const lines = sisoText(m, i, j, '');
          const lab = m.ny > 1 ? ` ${m.meta.OutputName[i] || i + 1}:  ` : '   ';
          const mid = lines.length === 3 ? 1 : 0;
          lines.forEach((l, q) => out.push('  ' + (q === mid ? lab : ' '.repeat(lab.length)) + l));
          out.push(' ');
        }
      }
      out.pop();
    }
    out.push(' ');
    if (m.meta.Name) out.push(`Name: ${m.meta.Name}`);
    out.push(tsLine(m) + `${kind} ${m.type === 'tf' ? 'transfer function' : 'zero/pole/gain model'}.`);
    return out.join('\n') + '\n';
  }
  if (m.type === 'ss') {
    const xs = chanNames(m.meta.StateName, 'x'), us = chanNames(m.meta.InputName, 'u'), ys = chanNames(m.meta.OutputName, 'y');
    if (m.n) {
      out.push('  A = ', matTable(m.A, xs, xs), ' ', '  B = ', matTable(m.B, xs, us), ' ', '  C = ', matTable(m.C, ys, xs), ' ');
    }
    out.push('  D = ', matTable(m.D, ys, us), ' ');
    if (m.E) out.push('  E = ', matTable(m.E, xs, xs), ' ');
    if (m.meta.InputDelay.some((x) => x)) out.push(`  Input delays (${m.meta.TimeUnit}): ${m.meta.InputDelay.map(coefStr).join(' ')}`, ' ');
    if (m.meta.OutputDelay.some((x) => x)) out.push(`  Output delays (${m.meta.TimeUnit}): ${m.meta.OutputDelay.map(coefStr).join(' ')}`, ' ');
    if (m.meta.Name) out.push(`Name: ${m.meta.Name}`);
    out.push(tsLine(m) + (m.n ? `${kind} state-space model.` : 'Static gain.'));
    return out.join('\n') + '\n';
  }
  // frd
  const unit = m.FrequencyUnit === 'rad/TimeUnit' ? `rad/${(m.meta.TimeUnit || 'seconds').replace(/s$/, '')}` : m.FrequencyUnit;
  for (let j = 0; j < m.nu; j++) for (let i = 0; i < m.ny; i++) {
    if (m.ny * m.nu > 1) out.push(`  From input ${j + 1} to output ${i + 1}:`);
    out.push(`      Frequency(${unit})        Response     `, '      ----------------        --------     ');
    for (let k = 0; k < m.freq.length; k++) {
      const re = m.R[i][j].re[k], im = m.R[i][j].im[k];
      out.push(`      ${fmtG(m.freq[k], 4).padStart(10)}       ${fmtG(re, 4).padStart(10)} ${im < 0 ? '-' : '+'} ${fmtG(Math.abs(im), 4)}i`);
    }
    out.push(' ');
  }
  out.push(tsLine(m) + `${kind} frequency response.`);
  return out.join('\n') + '\n';
}
function pidDisplay(m, name) {
  const parts = []; const top = [], mid = [], bot = [];
  const push = (t, n = '', d = '') => { const w = Math.max(t.length, n.length, d.length); top.push(center(n, w).padEnd(w)); mid.push(t.padEnd(w)); bot.push(center(d, w).padEnd(w)); };
  const cont = m.Ts === 0;
  if (m.Kp) push('Kp');
  if (m.Ki) { if (top.length) push(' + '); if (cont) { push('Ki * '); push('---', '1', 's'); } else { push('Ki * '); push(intText(m.IFormula, true)); } }
  if (m.Kd) {
    if (top.length) push(' + ');
    if (cont) { if (m.Tf) { push('Kd * '); push('--------', 's', 'Tf*s+1'); } else push('Kd * s'); }
    else { push('Kd * '); push(m.Tf ? '-----------' : '------', '1', m.Tf ? `Tf+${intText(m.DFormula, false)}` : 'Ts'); }
  }
  if (!top.length) push('0');
  const lines = [`${name} =`, ' '];
  const hasFrac = top.some((t) => t.trim());
  if (hasFrac) lines.push('  ' + top.join('').replace(/\s+$/, ''));
  lines.push('  ' + mid.join('').replace(/\s+$/, ''));
  if (hasFrac) lines.push('  ' + bot.join('').replace(/\s+$/, ''));
  lines.push(' ');
  const g = []; if (m.Kp) g.push(`Kp = ${coefStr(m.Kp)}`); if (m.Ki) g.push(`Ki = ${coefStr(m.Ki)}`); if (m.Kd) g.push(`Kd = ${coefStr(m.Kd)}`); if (m.Tf) g.push(`Tf = ${coefStr(m.Tf)}`);
  if (g.length) lines.push(`  with ${g.join(', ')}`, ' ');
  const type = (m.Kp ? 'P' : '') + (m.Ki ? 'I' : '') + (m.Kd ? 'D' : '') + (m.Kd && m.Tf ? 'F' : '');
  const what = type === 'P' || type === 'I' ? `${type}-only controller` : `${type || 'P'} controller`;
  lines.push(tsLine(m) + `${cont ? 'Continuous-time' : 'Discrete-time'} ${what.replace('PIDF controller', 'PIDF controller')}${type.length > 1 ? ' in parallel form' : ''}.`.replace('PI controller', 'PI controller'));
  return lines.join('\n') + '\n';
}
function intText(f, integ) { if (f === 'BackwardEuler') return integ ? 'Ts*z/(z-1)' : 'Ts*z/(z-1)'; if (f === 'Trapezoidal') return 'Ts*(z+1)/(2*(z-1))'; return integ ? 'Ts/(z-1)' : 'Ts/(z-1)'; }
