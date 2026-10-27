// Cell arrays and structures: cell, struct, fieldnames, isfield, rmfield,
// setfield / getfield, orderfields, struct2cell, cell2struct, num2cell,
// cell2mat, cellfun, arrayfun, structfun, deal, namedargs2cell.
import {
  tensor, normDims, prod, isTensor, isSparse, isString, isCell, isStruct, isChar, isObject, isFuncHandle,
  toTensor, num, bool, str, cell, struct, stringArray, MError,
} from '../../value.js';
import { E, textArg, optArg, textList, sizeArgs, dense, gather, count, classDef, isCellstr, splitDims, permuteAny, reshapeAny } from './util.js';
import { catValues, catClass } from './ops.js';
import { MError as ME } from '../../value.js';

const emptyD = () => tensor('double', [0, 0]);
function need(args, n, fname) { if (args.length < n) throw E(`base:${fname}:notEnoughInputs`, 'Not enough input arguments.'); }

// ------------------------------------------------------------- struct

function structFn(args, nargout, ctx) {
  if (args.length === 0) return struct([1, 1], [], [Object.create(null)]);
  if (args.length === 1) {
    const v = args[0];
    if (isStruct(v)) return v;
    if (isObject(v)) {
      const def = classDef(ctx, v.cls);
      const names = def && def.props ? def.props : Object.keys(v.props || {});
      const r = Object.create(null);
      for (const p of names) {
        let val = v.props ? v.props[p] : undefined;
        if (def && def.methods && typeof def.getProp === 'function') val = def.getProp(v, p, ctx);
        r[p] = val && val.cls ? val : emptyD();
      }
      return struct([1, 1], names, [r]);
    }
    if (isTensor(v) && v.re.length === 0) return struct([0, 0], [], []);
    throw E('base:struct:invalidInput', 'Conversion to struct from this class is not possible.');
  }
  if (args.length % 2) throw E('base:struct:nameValuePairs', 'Field and value input arguments must come in pairs.');
  const fields = [], vals = [];
  let dims = null;
  for (let i = 0; i < args.length; i += 2) {
    const f = textArg(args[i]);
    if (f === null) throw E('base:struct:invalidFieldName', 'Field names must be character vectors or string scalars.');
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(f)) throw E('base:struct:invalidFieldName', `Invalid field name "${f}".`);
    if (fields.includes(f)) throw E('base:struct:duplicateField', `Duplicate field name "${f}".`);
    const v = args[i + 1];
    fields.push(f); vals.push(v);
    if (isCell(v) && prod(v.dims) !== 1) {
      if (dims && !(dims.length === v.dims.length && dims.every((x, k) => x === v.dims[k]))) throw E('base:struct:fieldDimensionMismatch', 'Dimensions of cell array inputs must match.');
      dims = v.dims;
    }
  }
  if (!dims) dims = [1, 1];
  const n = prod(dims);
  const data = [];
  for (let k = 0; k < n; k++) {
    const r = Object.create(null);
    fields.forEach((f, i) => {
      const v = vals[i];
      r[f] = isCell(v) ? (prod(v.dims) === 1 ? v.data[0] : v.data[k]) : v;
    });
    data.push(r);
  }
  return struct(dims, fields, data);
}

function fieldnamesFn(args, nargout, ctx) {
  need(args, 1, 'fieldnames');
  const v = args[0];
  let names;
  if (isStruct(v)) names = v.fields;
  else if (isObject(v)) { const def = classDef(ctx, v.cls); names = def && def.props ? def.props : Object.keys(v.props || {}); }
  else throw E('base:fieldnames:InvalidInput', 'Invalid input argument of type \'' + v.cls + '\'. Input must be a structure or a Java or COM object.');
  return cell([names.length, 1], names.map((f) => str(f)));
}

function isfieldFn(args) {
  need(args, 2, 'isfield');
  const s = args[0], f = args[1];
  const has = (name) => isStruct(s) && s.fields.includes(name);
  if (isCell(f)) return { cls: 'logical', dims: f.dims, re: Float64Array.from(f.data, (x) => { const t = textArg(x); return t !== null && has(t) ? 1 : 0; }), im: null };
  if (isString(f) && f.data.length !== 1) return { cls: 'logical', dims: f.dims, re: Float64Array.from(f.data, (t) => (has(t) ? 1 : 0)), im: null };
  const t = textArg(f);
  return bool(t !== null && has(t));
}

function rmfieldFn(args) {
  need(args, 2, 'rmfield');
  const s = args[0];
  if (!isStruct(s)) throw E('base:rmfield:notStruct', 'S must be a structure array.');
  const names = isCell(args[1]) || isString(args[1]) ? textList(args[1]).list : [textArg(args[1])];
  for (const n of names) if (!s.fields.includes(n)) throw E('base:rmfield:InvalidFieldname', `A field named '${n}' doesn't exist.`);
  const fields = s.fields.filter((f) => !names.includes(f));
  const data = s.data.map((r) => { const o = Object.create(null); for (const f of fields) o[f] = r[f]; return o; });
  return struct(s.dims, fields, data);
}

function idxArg(v) {
  // {i, j} index cell for getfield / setfield
  const subs = v.data.map((x) => (isChar(x) && x.re.length === 1 && x.re[0] === 58 ? null : Array.from(dense(x, 'getfield').re)));
  return subs;
}
function linearOf(dims, subs) {
  if (subs.length === 1) return subs[0][0] - 1;
  let lin = 0, mul = 1;
  for (let k = 0; k < subs.length; k++) { lin += (subs[k][0] - 1) * mul; mul *= dims[k] || 1; }
  return lin;
}

function getfieldFn(args) {
  need(args, 2, 'getfield');
  let v = args[0];
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (isCell(a)) { v = gather(v, [linearOf(v.dims, idxArg(a))], [1, 1]); continue; }
    const f = textArg(a);
    if (!isStruct(v)) throw E('base:getfield:notStruct', 'Input must be a structure.');
    if (!v.fields.includes(f)) throw E('base:getfield:noField', `Reference to non-existent field '${f}'.`);
    v = v.data[0][f];
  }
  return v;
}

function setfieldRec(s, path, value) {
  if (!path.length) return value;
  const [p, ...rest] = path;
  if (isCell(p)) {
    if (!isStruct(s)) s = struct([1, 1], [], [Object.create(null)]);
    const k = linearOf(s.dims, idxArg(p));
    const one = gather(s, [k], [1, 1]);
    const upd = setfieldRec(one, rest, value);
    const data = s.data.slice();
    while (data.length <= k) { const r = Object.create(null); for (const f of s.fields) r[f] = emptyD(); data.push(r); }
    const fields = s.fields.slice(); for (const f of upd.fields) if (!fields.includes(f)) fields.push(f);
    for (const r of data) for (const f of fields) if (!(f in r)) r[f] = emptyD();
    data[k] = upd.data[0];
    const dims = prod(s.dims) >= data.length ? s.dims : [1, data.length];
    return struct(dims, fields, data);
  }
  const f = textArg(p);
  if (f === null || !/^[A-Za-z][A-Za-z0-9_]*$/.test(f)) throw E('base:setfield:invalidFieldName', 'Invalid field name.');
  if (s == null || (isTensor(s) && s.re.length === 0)) s = struct([1, 1], [], [Object.create(null)]);
  if (!isStruct(s)) throw E('base:setfield:notStruct', 'Input must be a structure.');
  const fields = s.fields.includes(f) ? s.fields : [...s.fields, f];
  const data = s.data.map((r) => { const o = Object.create(null); for (const k of fields) o[k] = k in r ? r[k] : emptyD(); return o; });
  if (!data.length) data.push(Object.create(null));
  data[0][f] = setfieldRec(data[0][f] && isStruct(data[0][f]) ? data[0][f] : rest.length ? null : data[0][f], rest, value);
  return struct(s.dims, fields, data);
}
function setfieldFn(args) {
  need(args, 3, 'setfield');
  return setfieldRec(args[0], args.slice(1, -1), args[args.length - 1]);
}

function orderfieldsFn(args, nargout) {
  need(args, 1, 'orderfields');
  const s = args[0];
  if (!isStruct(s)) throw E('base:orderfields:arg1NotStruct', 'First argument must be a struct.');
  let order;
  if (args.length === 1) order = s.fields.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  else {
    const o = args[1];
    if (isStruct(o)) order = o.fields.slice();
    else if (isCell(o) || isString(o)) order = textList(o).list;
    else order = Array.from(dense(o, 'orderfields').re).map((k) => s.fields[k - 1]);
    if (order.length !== s.fields.length || !order.every((f) => s.fields.includes(f))) throw E('base:orderfields:InvalidOrder', 'The order must contain each field name exactly once.');
  }
  const out = struct(s.dims, order, s.data);
  if (nargout >= 2) return [out, tensor('double', [order.length, 1], order.map((f) => s.fields.indexOf(f) + 1))];
  return out;
}

function struct2cellFn(args) {
  need(args, 1, 'struct2cell');
  const s = args[0];
  if (!isStruct(s)) throw E('base:struct2cell:notStruct', 'Input must be a structure.');
  const nf = s.fields.length, n = s.data.length;
  const data = [];
  for (let k = 0; k < n; k++) for (const f of s.fields) data.push(s.data[k][f]);
  const d = s.dims;
  const od = n === 1 ? [nf, 1] : [nf, ...d];
  return cell(od, data);
}

function cell2structFn(args) {
  need(args, 2, 'cell2struct');
  const c = args[0];
  if (!isCell(c)) throw E('base:cell2struct:argNotCell', 'First argument must be a cell array.');
  const fields = isCell(args[1]) || isString(args[1]) ? textList(args[1]).list : textList(args[1]).list;
  const dim = args.length > 2 ? dense(args[2], 'cell2struct').re[0] - 1 : 0;
  const d = c.dims.slice(); while (d.length <= dim) d.push(1);
  if (d[dim] !== fields.length) throw E('base:cell2struct:InconsistentFieldCount', 'Number of field names must match number of fields in new structure.');
  const { before, len, after } = splitDims(d, dim);
  const data = [];
  for (let a = 0; a < after; a++) for (let b = 0; b < before; b++) {
    const r = Object.create(null);
    fields.forEach((f, k) => { r[f] = c.data[a * before * len + k * before + b]; });
    data.push(r);
  }
  const od = d.filter((_, i) => i !== dim);
  const outDims = od.length === 1 ? [od[0], 1] : od;
  return struct(normDims(outDims), fields, data);
}

function num2cellFn(args) {
  need(args, 1, 'num2cell');
  const A = args[0];
  if (args.length > 1) {
    const dimsSel = Array.from(dense(args[1], 'num2cell').re).map((x) => x - 1);
    const d = (A.dims || [1, 1]).slice();
    const nd = Math.max(d.length, ...dimsSel.map((x) => x + 1));
    while (d.length < nd) d.push(1);
    const rest = []; for (let i = 0; i < nd; i++) if (!dimsSel.includes(i)) rest.push(i);
    const outDims = d.map((x, i) => (dimsSel.includes(i) ? 1 : x));
    const p = permuteAny(A, [...dimsSel, ...rest]);
    const blk = dimsSel.reduce((acc, i) => acc * d[i], 1);
    const n = prod(outDims);
    const data = [];
    const blkDims = d.map((x, i) => (dimsSel.includes(i) ? x : 1));
    for (let k = 0; k < n; k++) {
      const idx = []; for (let q = 0; q < blk; q++) idx.push(k * blk + q);
      data.push(gather(p, idx, blkDims));
    }
    return cell(outDims, data);
  }
  if (isCell(A)) return cell(A.dims, A.data.map((x) => cell([1, 1], [x])));
  const n = count(A);
  const data = [];
  for (let k = 0; k < n; k++) data.push(gather(A, [k], [1, 1]));
  return cell(A.dims || [1, 1], data);
}

function cell2matFn(args, nargout, ctx) {
  need(args, 1, 'cell2mat');
  const C = args[0];
  if (!isCell(C)) throw E('base:cell2mat:InvalidInput', 'Input must be a cell array.');
  if (C.data.length === 0) return emptyD();
  for (const x of C.data) if (isCell(x) || (isObject(x) && !x.arr)) throw E('base:cell2mat:UnsupportedCellContent', 'CELL2MAT does not support cell arrays containing cell arrays or objects.');
  const d = C.dims;
  if (d.length > 2) {
    // concatenate along higher dims page by page
    const [m, n] = d; const per = m * n; const pagesN = C.data.length / per;
    const pages = [];
    for (let p = 0; p < pagesN; p++) pages.push(cell2matFn([cell([m, n], C.data.slice(p * per, (p + 1) * per))], 1, ctx));
    return catValues(2, pages, ctx);
  }
  const [m, n] = d;
  const rows = [];
  for (let i = 0; i < m; i++) { const items = []; for (let j = 0; j < n; j++) items.push(C.data[i + j * m]); rows.push(catValues(1, items, ctx)); }
  return catValues(0, rows, ctx);
}

// ------------------------------------------------------------- cellfun / arrayfun / structfun

function funOptions(args, fname) {
  let uniform = true, handler = null, end = args.length;
  for (let i = 2; i < args.length - 1; i++) {
    const s = optArg(args[i]);
    if (s === 'uniformoutput' || s === 'errorhandler') {
      end = Math.min(end, i);
      const v = args[i + 1];
      if (s === 'uniformoutput') uniform = isTensor(v) ? v.re[0] !== 0 : optArg(v) === 'true';
      else handler = v;
      i++;
    }
  }
  return { uniform, handler, end };
}

function callEach(fname, fn, n, getArgs, nargout, ctx, opts, dims) {
  const nout = Math.max(nargout, 1);
  const results = Array.from({ length: nout }, () => new Array(n));
  let gotAny = nargout > 0;
  for (let k = 0; k < n; k++) {
    if (ctx.checkInterrupt) ctx.checkInterrupt();
    const a = getArgs(k);
    let r;
    try {
      r = ctx.call(fn, a, nargout);
    } catch (e) {
      if (!opts.handler || !(e instanceof ME || e.identifier !== undefined)) throw e;
      const S = struct([1, 1], ['message', 'identifier', 'index'], [Object.assign(Object.create(null), { message: str(e.message), identifier: str(e.identifier || ''), index: num(k + 1) })]);
      r = ctx.call(opts.handler, [S, ...a], nargout);
    }
    if (nargout === 0) {
      if (r && r.length) { gotAny = true; results[0][k] = r[0]; } else results[0][k] = undefined;
      continue;
    }
    if (!r || r.length < nout) throw E(`base:${fname}:tooManyOutputs`, 'Too many output arguments.');
    for (let q = 0; q < nout; q++) results[q][k] = r[q];
  }
  if (!gotAny || (nargout === 0 && results[0].some((x) => x === undefined))) {
    if (nargout === 0 && results[0].every((x) => x === undefined)) return undefined;
  }
  const outs = results.map((list) => {
    if (!opts.uniform) return cell(dims, list.map((x) => (x === undefined ? emptyD() : x)));
    if (n === 0) return tensor('double', dims);
    for (const x of list) {
      if (x === undefined) throw E(`base:${fname}:noOutput`, 'The function did not return a value.');
      if (!(isTensor(x) || isSparse(x)) || count(x) !== 1) {
        throw E(`base:${fname}:NotAScalarOutput`, `Non-scalar in Uniform output, at index ${list.indexOf(x) + 1}, output 1.\nSet 'UniformOutput' to false.`);
      }
    }
    const ts = list.map((x) => toTensor(x));
    const cls0 = ts[0].cls;
    for (const t of ts) if ((t.cls === 'logical') !== (cls0 === 'logical') || (t.cls === 'char') !== (cls0 === 'char')) {
      throw E(`base:${fname}:MismatchInOutputTypes`, `Mismatch in type of outputs, at index ${ts.indexOf(t) + 1}, output 1 (${t.cls} versus ${cls0}).\nSet 'UniformOutput' to false.`);
    }
    const cls = catClass(ts);
    const re = Float64Array.from(ts, (t) => t.re[0]);
    const anyIm = ts.some((t) => t.im);
    const im = anyIm ? Float64Array.from(ts, (t) => (t.im ? t.im[0] : 0)) : null;
    return { cls, dims: normDims(dims), re, im };
  });
  return nargout <= 1 ? outs[0] : outs;
}

const LEGACY = {
  isempty: (x) => bool(count(x) === 0),
  islogical: (x) => bool(x.cls === 'logical'),
  isreal: (x) => bool(!(x.im)),
  length: (x) => { const d = x.dims || [1, 1]; return num(prod(d) === 0 ? 0 : Math.max(...d)); },
  ndims: (x) => num((x.dims || [1, 1]).length),
  prodofsize: (x) => num(count(x)),
};

function cellfunFn(args, nargout, ctx) {
  need(args, 2, 'cellfun');
  let fn = args[0];
  const opts = funOptions(args, 'cellfun');
  const cells = args.slice(1, opts.end);
  for (const c of cells) if (!isCell(c)) throw E('base:cellfun:NotACell', 'Input #2 expected to be a cell array, was ' + c.cls + ' instead.');
  const fname = textArg(fn);
  const n = cells[0].data.length;
  for (const c of cells) if (c.data.length !== n || c.dims.join() !== cells[0].dims.join()) throw E('base:cellfun:AllInputsSameSize', 'All of the input arguments must be of the same size and shape.');
  if (fname !== null) {
    if (LEGACY[fname]) return { cls: 'logical', dims: cells[0].dims, ...(() => { const vals = cells[0].data.map((x) => LEGACY[fname](x)); const cls = vals.length ? vals[0].cls : 'double'; return { cls, re: Float64Array.from(vals, (v) => v.re[0]), im: null }; })() };
    if (fname === 'size') { const k = dense(args[2], 'cellfun').re[0]; return tensor('double', cells[0].dims, cells[0].data.map((x) => ((x.dims || [1, 1])[k - 1] || 1))); }
    if (fname === 'isclass') { const c = textArg(args[2]); return { cls: 'logical', dims: cells[0].dims, re: Float64Array.from(cells[0].data, (x) => (x.cls === c ? 1 : 0)), im: null }; }
    fn = fname;
  }
  return callEach('cellfun', fn, n, (k) => cells.map((c) => c.data[k]), nargout, ctx, opts, cells[0].dims);
}

function arrayfunFn(args, nargout, ctx) {
  need(args, 2, 'arrayfun');
  let fn = args[0];
  if (textArg(fn) !== null) fn = textArg(fn);
  const opts = funOptions(args, 'arrayfun');
  const arrs = args.slice(1, opts.end);
  const n = count(arrs[0]);
  for (const a of arrs) if (count(a) !== n || (a.dims || [1, 1]).join() !== (arrs[0].dims || [1, 1]).join()) throw E('base:arrayfun:AllInputsSameSize', 'All of the input arguments must be of the same size and shape.');
  return callEach('arrayfun', fn, n, (k) => arrs.map((a) => gather(a, [k], [1, 1])), nargout, ctx, opts, arrs[0].dims || [1, 1]);
}

function structfunFn(args, nargout, ctx) {
  need(args, 2, 'structfun');
  let fn = args[0];
  if (textArg(fn) !== null) fn = textArg(fn);
  const s = args[1];
  if (!isStruct(s) || s.data.length !== 1) throw E('base:structfun:NotAScalarStruct', 'Input must be a scalar structure.');
  const opts = funOptions([args[0], ...args.slice(1)], 'structfun');
  const n = s.fields.length;
  const r = callEach('structfun', fn, n, (k) => [s.data[0][s.fields[k]]], nargout, ctx, opts, [n, 1]);
  if (opts.uniform || r === undefined) return r;
  const toStruct = (c) => { const rec = Object.create(null); s.fields.forEach((f, k) => { rec[f] = c.data[k]; }); return struct([1, 1], s.fields, [rec]); };
  return Array.isArray(r) ? r.map(toStruct) : toStruct(r);
}

function dealFn(args, nargout) {
  const n = Math.max(1, nargout);
  if (args.length === 1) return n === 1 ? args[0] : Array.from({ length: n }, () => args[0]);
  if (args.length !== n) throw E('base:deal:nargin', 'The number of outputs should match the number of inputs.');
  return n === 1 ? args[0] : args.slice();
}

function cellFn(args) {
  const v = args[0];
  if (args.length === 1 && isString(v)) return cell(v.dims, v.data.map((s) => str(s == null ? '' : s)));
  const dims = sizeArgs(args, 'cell');
  return cell(dims);
}

export const builtins = {
  cell: cellFn,
  struct: structFn,
  fieldnames: fieldnamesFn,
  isfield: isfieldFn,
  rmfield: rmfieldFn,
  getfield: getfieldFn,
  setfield: setfieldFn,
  orderfields: orderfieldsFn,
  struct2cell: struct2cellFn,
  cell2struct: cell2structFn,
  num2cell: num2cellFn,
  cell2mat: cell2matFn,
  cellfun: cellfunFn,
  arrayfun: arrayfunFn,
  structfun: structfunFn,
  deal: dealFn,
  namedargs2cell(args) {
    need(args, 1, 'namedargs2cell');
    const s = args[0];
    if (!isStruct(s) || s.data.length !== 1) throw E('base:namedargs2cell:notScalarStruct', 'Input must be a scalar structure.');
    const data = [];
    for (const f of s.fields) data.push(str(f), s.data[0][f]);
    return cell([1, data.length], data);
  },
};

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  cell: H('Create a cell array of empty matrices.', '빈 행렬로 된 셀형 배열 생성.', ['C = cell(n)', 'C = cell(m, n, ...)', 'C = cell(sz)']),
  struct: H('Create a structure array.', '구조체 배열 생성.', ['s = struct', 's = struct(field, value)', 's = struct(field1, value1, ..., fieldN, valueN)', 's = struct(obj)']),
  fieldnames: H('Field names of a structure or properties of an object.', '구조체 필드 이름 또는 객체 속성.', ['fields = fieldnames(S)']),
  isfield: H('Determine if input is a structure array field.', '구조체 배열의 필드인지 판별.', ['TF = isfield(S, field)']),
  rmfield: H('Remove fields from a structure.', '구조체에서 필드 제거.', ['s = rmfield(s, field)']),
  getfield: H('Get a field of a structure array.', '구조체 배열의 필드 값 얻기.', ['value = getfield(S, field)', 'value = getfield(S, {i}, field1, ..., fieldN)']),
  setfield: H('Assign a value to a structure array field.', '구조체 배열 필드에 값 할당.', ['S = setfield(S, field, value)', 'S = setfield(S, field1, ..., fieldN, value)']),
  orderfields: H('Order fields of a structure array.', '구조체 배열의 필드 순서 정렬.', ['S = orderfields(S1)', 'S = orderfields(S1, S2)', 'S = orderfields(S1, C)', '[S, P] = orderfields(...)']),
  struct2cell: H('Convert a structure to a cell array.', '구조체를 셀형 배열로 변환.', ['C = struct2cell(S)']),
  cell2struct: H('Convert a cell array to a structure array.', '셀형 배열을 구조체 배열로 변환.', ['S = cell2struct(C, fields, dim)']),
  num2cell: H('Convert an array to a cell array with consistently sized cells.', '배열을 같은 크기 셀로 된 셀형 배열로 변환.', ['C = num2cell(A)', 'C = num2cell(A, dims)']),
  cell2mat: H('Convert a cell array to an ordinary array.', '셀형 배열을 일반 배열로 변환.', ['A = cell2mat(C)']),
  cellfun: H('Apply a function to each cell of a cell array.', '셀형 배열의 각 셀에 함수 적용.', ['A = cellfun(func, C)', 'A = cellfun(func, C1, ..., Cn)', "A = cellfun(..., 'UniformOutput', false)", "A = cellfun(..., 'ErrorHandler', errorFunc)", '[A1, ..., Am] = cellfun(...)']),
  arrayfun: H('Apply a function to each element of an array.', '배열의 각 원소에 함수 적용.', ['B = arrayfun(func, A)', 'B = arrayfun(func, A1, ..., An)', "B = arrayfun(..., 'UniformOutput', false)"]),
  structfun: H('Apply a function to each field of a scalar structure.', '스칼라 구조체의 각 필드에 함수 적용.', ['A = structfun(func, S)', "A = structfun(..., 'UniformOutput', false)"]),
  deal: H('Distribute inputs to outputs.', '입력을 출력으로 분배.', ['[B1, ..., Bn] = deal(A)', '[B1, ..., Bn] = deal(A1, ..., An)']),
  namedargs2cell: H('Convert a structure of name-value arguments to a cell array.', '이름-값 인수 구조체를 셀형 배열로 변환.', ['C = namedargs2cell(s)']),
};
void stringArray; void isFuncHandle; void reshapeAny; void isCellstr; void MError;
