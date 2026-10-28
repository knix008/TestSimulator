// Assorted elementary functions: block diagonal matrices, complex conjugate
// pairing, cell partitioning of arrays and deployment status.
import { tensor, isTensor, isSparse, toTensor, sparseMatrix, cell, bool, prod, normDims } from '../../value.js';
import { E, dense, finalize, firstNonSingleton, splitDims, gather, count } from './util.js';
import { catClass } from './ops.js';

// ------------------------------------------------------------- blkdiag

function blkdiagFn(args) {
  if (!args.length) return tensor('double', [0, 0]);
  const items = args.map((a) => {
    if (isSparse(a)) return a;
    if (!isTensor(a)) throw E('base:blkdiag:invalidType', 'Inputs must be numeric, logical or char arrays.');
    if (a.dims.length > 2) throw E('base:blkdiag:inputsMustBe2D', 'Inputs must be 2-D.');
    return a;
  });
  const m = items.reduce((s, a) => s + a.dims[0], 0), n = items.reduce((s, a) => s + a.dims[1], 0);
  const anyIm = items.some((a) => a.im);
  if (items.some(isSparse)) {
    const colPtr = [0], rowIdx = [], re = [], im = [];
    let r0 = 0;
    for (const a of items) {
      const [am, an] = a.dims;
      for (let j = 0; j < an; j++) {
        if (isSparse(a)) for (let p = a.colPtr[j]; p < a.colPtr[j + 1]; p++) { rowIdx.push(r0 + a.rowIdx[p]); re.push(a.re[p]); im.push(a.im ? a.im[p] : 0); }
        else for (let i = 0; i < am; i++) { const x = a.re[i + j * am], y = a.im ? a.im[i + j * am] : 0; if (x !== 0 || y !== 0) { rowIdx.push(r0 + i); re.push(x); im.push(y); } }
        colPtr.push(rowIdx.length);
      }
      r0 += am;
    }
    const cls = items.every((a) => a.cls === 'logical') ? 'logical' : 'double';
    return sparseMatrix(m, n, colPtr, rowIdx, re, anyIm ? im : null, cls);
  }
  const re = new Float64Array(m * n), im = anyIm ? new Float64Array(m * n) : null;
  let r0 = 0, c0 = 0;
  for (const a of items) {
    const [am, an] = a.dims;
    for (let j = 0; j < an; j++) for (let i = 0; i < am; i++) {
      re[r0 + i + (c0 + j) * m] = a.re[i + j * am];
      if (a.im) im[r0 + i + (c0 + j) * m] = a.im[i + j * am];
    }
    r0 += am; c0 += an;
  }
  return finalize(catClass(items), [m, n], re, im);
}

// ------------------------------------------------------------- cplxpair

function cplxpairFn(args) {
  if (!args.length) throw E('base:cplxpair:notEnoughInputs', 'Not enough input arguments.');
  const t = dense(args[0], 'cplxpair');
  const n0 = count(t);
  let tol = 100 * 2.220446049250313e-16;
  if (args[1] !== undefined && count(args[1]) > 0) {
    tol = dense(args[1], 'cplxpair').re[0];
    if (!(tol >= 0)) throw E('base:cplxpair:invalidTol', 'Tolerance must be a nonnegative scalar.');
  }
  if (tol > 1) tol = 1;
  const dim = args[2] !== undefined ? dense(args[2], 'cplxpair').re[0] - 1 : firstNonSingleton(t.dims);
  if (n0 === 0) return t;
  const { before, len, after } = splitDims(t.dims, dim);
  const re = new Float64Array(n0), im = new Float64Array(n0);
  for (let a = 0; a < after; a++) for (let b = 0; b < before; b++) {
    const base = a * before * len + b;
    const z = [];
    for (let q = 0; q < len; q++) z.push([t.re[base + q * before], t.im ? t.im[base + q * before] : 0]);
    const out = pairSlice(z, tol);
    out.forEach(([x, y], q) => { re[base + q * before] = x; im[base + q * before] = y; });
  }
  return finalize(t.cls === 'single' ? 'single' : 'double', t.dims, re, im);
}
function pairSlice(z, tol) {
  const abs = (c) => Math.hypot(c[0], c[1]);
  const reals = [], cplx = [];
  for (const c of z) {
    if (Math.abs(c[1]) <= tol * abs(c)) reals.push([c[0], 0]); else cplx.push(c);
  }
  cplx.sort((p, q) => p[0] - q[0]);
  const out = [];
  const used = new Array(cplx.length).fill(false);
  for (let i = 0; i < cplx.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const c = cplx[i];
    let best = -1, bd = Infinity;
    for (let j = i + 1; j < cplx.length; j++) {
      if (used[j]) continue;
      const d = Math.hypot(cplx[j][0] - c[0], cplx[j][1] + c[1]);
      if (d < bd) { bd = d; best = j; }
    }
    if (best < 0 || bd > tol * abs(c) * 2) throw E('base:cplxpair:ComplexNumbersCantBePaired', 'Complex numbers can\'t be paired.');
    used[best] = true;
    const d = cplx[best];
    const xr = (c[0] + d[0]) / 2, xi = (Math.abs(c[1]) + Math.abs(d[1])) / 2;
    out.push([xr, -xi], [xr, xi]);
  }
  // pairs ordered by increasing real part, then the real values sorted
  const pairs = []; for (let i = 0; i < out.length; i += 2) pairs.push([out[i], out[i + 1]]);
  pairs.sort((p, q) => p[0][0] - q[0][0]);
  reals.sort((p, q) => p[0] - q[0]);
  return [...pairs.flat(), ...reals];
}

// ------------------------------------------------------------- mat2cell

function mat2cellFn(args) {
  if (args.length < 1) throw E('base:mat2cell:notEnoughInputs', 'Not enough input arguments.');
  const A = args[0];
  const dims = (A.dims || [1, 1]).slice();
  const nd = Math.max(dims.length, args.length - 1);
  while (dims.length < nd) dims.push(1);
  const parts = [];
  for (let k = 0; k < nd; k++) {
    if (k + 1 < args.length) {
      const v = Array.from(dense(args[k + 1], 'mat2cell').re);
      if (v.some((x) => !(x >= 0) || !Number.isInteger(x))) throw E('base:mat2cell:NonNegIntDimsVector', 'Dimension vectors must contain nonnegative integers.');
      const s = v.reduce((a, b) => a + b, 0);
      if (s !== dims[k]) throw E('base:mat2cell:dimensionMismatch', `Input arguments, D1 through D${args.length - 1}, must sum to each dimension of the input matrix size, [${dims.join(' ')}].`);
      parts.push(v);
    } else parts.push([dims[k]]);
  }
  const cdims = parts.map((p) => p.length);
  const offs = parts.map((p) => { const o = [0]; for (const x of p) o.push(o[o.length - 1] + x); return o; });
  const strides = []; let st = 1; for (let k = 0; k < nd; k++) { strides.push(st); st *= dims[k]; }
  const nc = prod(cdims);
  const data = new Array(nc);
  const cs = new Array(nd).fill(0);
  for (let c = 0; c < nc; c++) {
    let r = c; for (let k = 0; k < nd; k++) { cs[k] = r % cdims[k]; r = Math.floor(r / cdims[k]); }
    const bd = cs.map((q, k) => parts[k][q]);
    const nb = prod(bd);
    const idx = new Array(nb);
    const sub = new Array(nd).fill(0);
    for (let e = 0; e < nb; e++) {
      let q = e, lin = 0;
      for (let k = 0; k < nd; k++) { sub[k] = q % bd[k]; q = Math.floor(q / bd[k]); lin += (offs[k][cs[k]] + sub[k]) * strides[k]; }
      idx[e] = lin;
    }
    data[c] = gather(isSparse(A) ? toTensor(A) : A, idx, bd);
  }
  return cell(normDims(cdims.length === 1 ? [cdims[0], 1] : cdims), data);
}

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const builtins = {
  blkdiag: blkdiagFn,
  cplxpair: cplxpairFn,
  mat2cell: mat2cellFn,
  isdeployed() { return bool(false); },
};
export const help = {
  blkdiag: H('Block diagonal matrix from the input matrices.', '입력 행렬로 블록 대각 행렬 생성.', ['B = blkdiag(A1, A2, ..., An)']),
  cplxpair: H('Sorts complex numbers into complex conjugate pairs.', '복소수를 켤레 쌍으로 정렬.', ['B = cplxpair(A)', 'B = cplxpair(A, tol)', 'B = cplxpair(A, [], dim)']),
  mat2cell: H('Divides an array into a cell array of sub-arrays.', '배열을 부분 배열의 셀형 배열로 분할.', ['C = mat2cell(A, dim1Dist, ..., dimNDist)', 'C = mat2cell(A, rowDist)']),
  isdeployed: H('True when running as a deployed application (always false here).', '배포된 응용 프로그램으로 실행 중인지 확인 (여기서는 항상 false).', ['tf = isdeployed']),
};
