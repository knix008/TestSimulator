// Lookup Tables: 1-D, 2-D and n-D Lookup Table (linear / flat / nearest /
// above, linear or clipped extrapolation), Prelookup + Interpolation Using
// Prelookup, Direct Lookup Table, Lookup Table Dynamic, Sine / Cosine lookup.
import { def, L, P, enumP, numP, TS, F, tsOf, findInterval, at } from './util.js';
import { MError } from '../../value.js';

const G = 'lookup';
const METHODS = ['Linear', 'Flat', 'Nearest', 'Above'];
const interpP = () => enumP('InterpMethod', 'Linear', 'Interpolation method', '보간 방법', [{ value: 'Linear', label: L('Linear', '선형') }, { value: 'Flat', label: L('Flat (input below)', '평탄 (아래 값)') }, { value: 'Nearest', label: L('Nearest', '최근접') }, { value: 'Above', label: L('Above', '위 값') }]);
const extrapP = () => enumP('ExtrapMethod', 'Linear', 'Extrapolation method', '외삽 방법', [{ value: 'Linear', label: L('Linear', '선형') }, { value: 'Clip', label: L('Clip', '자르기') }]);
const bpP = (k, def0) => P(`BreakpointsForDimension${k}`, 'expr', def0, `Breakpoints ${k}`, `중단점 ${k}`);

function checkBp(B, bp, k) {
  if (!bp.length) B.err(`Breakpoints ${k} are empty.`);
  for (let i = 1; i < bp.length; i++) if (!(bp[i] > bp[i - 1])) B.err(`Breakpoints ${k} must be strictly increasing.`);
  return bp;
}
/** Interval index k and fraction f of x in breakpoints bp. */
function kf(bp, x, clip) {
  const n = bp.length;
  if (n < 2) return [0, 0];
  const k = findInterval(bp, x);
  let f = (x - bp[k]) / (bp[k + 1] - bp[k]);
  if (clip) f = f < 0 ? 0 : f > 1 ? 1 : f;
  return [k, f];
}
const shape = (f, meth) => (meth === 'Flat' ? (f >= 1 ? 1 : 0) : meth === 'Nearest' ? (f < 0.5 ? 0 : 1) : meth === 'Above' ? (f <= 0 ? 0 : 1) : f);
/** Multilinear interpolation in a column-major table: ks/fs per dimension. */
function multilinear(tab, dims, ks, fs) {
  const nd = ks.length;
  let s = 0;
  for (let c = 0; c < 1 << nd; c++) {
    let w = 1, idx = 0, stride = 1;
    for (let d = 0; d < nd; d++) {
      const hi = (c >> d) & 1;
      const size = dims[d] || 1;
      const kk = size < 2 ? 0 : ks[d] + hi;
      w *= size < 2 ? (hi ? 0 : 1) : hi ? fs[d] : 1 - fs[d];
      idx += Math.min(kk, size - 1) * stride;
      stride *= size;
    }
    if (w) s += w * tab[idx];
  }
  return s;
}
const tableDims = (m, nd) => { const d = m.dims.slice(); if (nd === 1) return [m.re.length]; while (d.length < nd) d.push(1); return d; };

export const BLOCKS = [
  def('Lookup1D', G, '1-D Lookup Table', '1-D 룩업 테이블', {
    desc: L('Interpolates the table at the input using the breakpoints.', '중단점을 써서 입력 위치의 테이블 값을 보간합니다.'),
    params: [P('Table', 'expr', 'tanh([-5:5])', 'Table data', '테이블 데이터'), bpP(1, '[-5:5]'), interpP(), extrapP(), TS('-1')],
    size: [50, 40], icon: () => ({ glyph: 'lookup1' }),
    make(B) {
      const tab = B.arr('Table'), bp = checkBp(B, B.arr('BreakpointsForDimension1'), 1);
      if (tab.length !== bp.length) B.err(`The table has ${tab.length} values but there are ${bp.length} breakpoints.`);
      const meth = B.opt('InterpMethod'), clip = B.opt('ExtrapMethod') === 'Clip';
      return { ts: tsOf(B, -1), output: (S, u) => [Float64Array.from(u[0], (x) => { const [k, f] = kf(bp, x, clip); return multilinear(tab, [tab.length], [k], [shape(f, meth)]); })] };
    },
  }),
  def('Lookup2D', G, '2-D Lookup Table', '2-D 룩업 테이블', {
    desc: L('Bilinear interpolation of a table: rows by input 1, columns by input 2.', '테이블의 쌍선형 보간: 행은 입력 1, 열은 입력 2.'),
    params: [P('Table', 'expr', '[4 5 6;16 19 20;10 18 23]', 'Table data', '테이블 데이터'), bpP(1, '[1:3]'), bpP(2, '[1:3]'), interpP(), extrapP(), TS('-1')],
    size: [50, 50], ports: { in: 2, out: 1 }, icon: () => ({ glyph: 'lookup2' }),
    make(B) {
      const m = B.mat('Table'), b1 = checkBp(B, B.arr('BreakpointsForDimension1'), 1), b2 = checkBp(B, B.arr('BreakpointsForDimension2'), 2);
      if (m.m !== b1.length || m.n !== b2.length) B.err(`The table must be ${b1.length}×${b2.length}.`);
      const meth = B.opt('InterpMethod'), clip = B.opt('ExtrapMethod') === 'Clip';
      return {
        ts: tsOf(B, -1),
        output(S, u) {
          const n = Math.max(u[0].length, u[1].length), y = F(n);
          for (let i = 0; i < n; i++) { const [k1, f1] = kf(b1, at(u[0], i), clip), [k2, f2] = kf(b2, at(u[1], i), clip); y[i] = multilinear(m.re, [m.m, m.n], [k1, k2], [shape(f1, meth), shape(f2, meth)]); }
          return [y];
        },
      };
    },
  }),
  def('LookupND', G, 'n-D Lookup Table', 'n-D 룩업 테이블', {
    desc: L('Multilinear interpolation of an n-dimensional table (one input per dimension).', 'n차원 테이블의 다중 선형 보간 (차원마다 입력 하나).'),
    params: [numP('NumberOfTableDimensions', '2', 'Number of table dimensions', '테이블 차원 수', { min: 1, max: 4, step: 1 }), P('Table', 'expr', '[4 5 6;16 19 20;10 18 23]', 'Table data', '테이블 데이터'), bpP(1, '[1:3]'), bpP(2, '[1:3]'), bpP(3, '[1:2]'), bpP(4, '[1:2]'), interpP(), extrapP(), TS('-1')],
    size: [50, 50], ports: (p) => ({ in: Math.max(1, Math.min(4, Math.round(Number(p.NumberOfTableDimensions) || 2))), out: 1 }), icon: () => ({ glyph: 'lookup2', text: 'n-D' }),
    make(B) {
      const nd = Math.max(1, Math.min(4, B.int('NumberOfTableDimensions', 2)));
      const m = B.mat('Table'), dims = tableDims(m, nd);
      const bps = Array.from({ length: nd }, (_, d) => checkBp(B, B.arr(`BreakpointsForDimension${d + 1}`), d + 1));
      bps.forEach((bp, d) => { if (bp.length !== (dims[d] || 1)) B.err(`Dimension ${d + 1} of the table has ${dims[d] || 1} values but there are ${bp.length} breakpoints.`); });
      const meth = B.opt('InterpMethod'), clip = B.opt('ExtrapMethod') === 'Clip';
      return {
        ts: tsOf(B, -1),
        output(S, u) {
          const n = Math.max(...u.map((v) => v.length)), y = F(n);
          for (let i = 0; i < n; i++) {
            const ks = [], fs = [];
            for (let d = 0; d < nd; d++) { const [k, f] = kf(bps[d], at(u[d], i), clip); ks.push(k); fs.push(shape(f, meth)); }
            y[i] = multilinear(m.re, dims, ks, fs);
          }
          return [y];
        },
      };
    },
  }),
  def('Prelookup', G, 'Prelookup', '사전 룩업', {
    desc: L('Finds the breakpoint interval (zero-based index) and the fraction of the input within it.', '입력이 속한 중단점 구간(0부터 인덱스)과 구간 내 비율을 구합니다.'),
    params: [P('BreakpointsData', 'expr', '[10:10:110]', 'Breakpoints', '중단점'), extrapP(), TS('-1')],
    size: [50, 40], ports: { in: 1, out: 2, outLabels: ['k', 'f'] }, icon: () => ({ text: 'k, f' }),
    make(B) {
      const bp = checkBp(B, B.arr('BreakpointsData'), 1), clip = B.opt('ExtrapMethod') === 'Clip';
      return { ts: tsOf(B, -1), output(S, u) { const k = F(u[0].length), f = F(u[0].length); u[0].forEach((x, i) => { const r = kf(bp, x, clip); k[i] = r[0]; f[i] = r[1]; }); return [k, f]; } };
    },
  }),
  def('Interpolation', G, 'Interpolation Using Prelookup', '사전 룩업 보간', {
    desc: L('Interpolates a table from (index, fraction) pairs computed by Prelookup blocks.', 'Prelookup 블록이 구한 (인덱스, 비율) 쌍으로 테이블을 보간합니다.'),
    params: [numP('NumberOfTableDimensions', '1', 'Number of table dimensions', '테이블 차원 수', { min: 1, max: 4, step: 1 }), P('Table', 'expr', 'sqrt([1:11])', 'Table data', '테이블 데이터'), TS('-1')],
    size: [50, 50], ports: (p) => { const nd = Math.max(1, Math.min(4, Math.round(Number(p.NumberOfTableDimensions) || 1))); return { in: 2 * nd, out: 1 }; }, icon: () => ({ glyph: 'lookup1', text: 'k,f' }),
    make(B) {
      const nd = Math.max(1, Math.min(4, B.int('NumberOfTableDimensions', 1)));
      const m = B.mat('Table'), dims = tableDims(m, nd);
      return {
        ts: tsOf(B, -1),
        output(S, u) {
          const n = Math.max(...u.map((v) => v.length)), y = F(n);
          for (let i = 0; i < n; i++) {
            const ks = [], fs = [];
            for (let d = 0; d < nd; d++) {
              let k = Math.round(at(u[2 * d], i)), f = at(u[2 * d + 1], i);
              const size = dims[d] || 1;
              if (k >= size - 1 && size > 1) { f += k - (size - 2); k = size - 2; }
              if (k < 0) k = 0;
              ks.push(k); fs.push(f);
            }
            y[i] = multilinear(m.re, dims, ks, fs);
          }
          return [y];
        },
      };
    },
  }),
  def('DirectLookupTable', G, 'Direct Lookup Table (n-D)', '직접 룩업 테이블 (n-D)', {
    desc: L('Outputs the table element at the (zero-based, clipped) index inputs.', '(0부터, 범위 제한된) 인덱스 입력 위치의 테이블 원소를 냅니다.'),
    params: [numP('NumberOfTableDimensions', '1', 'Number of table dimensions', '테이블 차원 수', { min: 1, max: 2, step: 1 }), P('Table', 'expr', '[4 5 6 7 8]', 'Table data', '테이블 데이터'), TS('-1')],
    size: [50, 40], ports: (p) => ({ in: Math.round(Number(p.NumberOfTableDimensions) || 1) === 2 ? 2 : 1, out: 1 }), icon: () => ({ text: 'T[k]' }),
    make(B) {
      const nd = B.int('NumberOfTableDimensions', 1) === 2 ? 2 : 1;
      const m = B.mat('Table');
      const ci = (x, n) => Math.max(0, Math.min(n - 1, Math.floor(x)));
      return {
        ts: tsOf(B, -1),
        output(S, u) {
          if (nd === 1) return [Float64Array.from(u[0], (x) => m.re[ci(x, m.re.length)])];
          const n = Math.max(u[0].length, u[1].length);
          return [Float64Array.from({ length: n }, (_, i) => m.re[ci(at(u[0], i), m.m) + ci(at(u[1], i), m.n) * m.m])];
        },
      };
    },
  }),
  def('LookupTableDynamic', G, 'Lookup Table Dynamic', '동적 룩업 테이블', {
    desc: L('1-D lookup where the breakpoints (input 2) and table (input 3) are signals.', '중단점(입력 2)과 테이블(입력 3)이 신호인 1-D 룩업.'),
    params: [enumP('LookUpMeth', 'Interpolation-Extrapolation', 'Lookup method', '룩업 방법', ['Interpolation-Extrapolation', 'Interpolation-Use End Values', 'Use Input Nearest', 'Use Input Below', 'Use Input Above'])],
    size: [50, 50], ports: { in: 3, out: 1, inLabels: ['x', 'xdat', 'ydat'] }, icon: () => ({ glyph: 'lookup1', text: 'dyn' }),
    make(B) {
      const lm = B.opt('LookUpMeth');
      const meth = { 'Use Input Nearest': 'Nearest', 'Use Input Below': 'Flat', 'Use Input Above': 'Above' }[lm] || 'Linear';
      const clip = lm !== 'Interpolation-Extrapolation';
      return {
        ts: -1,
        output(S, u) {
          const xd = u[1], yd = u[2];
          if (xd.length !== yd.length && !S.trial) throw new MError('sim:lookup:dynamic', `xdat (${xd.length}) and ydat (${yd.length}) must have the same width.`);
          if (xd.length !== yd.length || xd.length < 2) return [Float64Array.from(u[0], () => yd[0] ?? 0)];
          return [Float64Array.from(u[0], (x) => { const [k, f] = kf(xd, x, clip); return multilinear(yd, [yd.length], [k], [shape(f, meth)]); })];
        },
      };
    },
  }),
  def('SineCosineLookup', G, 'Sine and Cosine', '사인 및 코사인', {
    desc: L('Sine and cosine of the input from a lookup table of one quarter wave.', '1/4 파장 룩업 테이블로 구한 입력의 사인과 코사인.'),
    params: [numP('TableSize', '1024', 'Number of table points (quarter wave)', '테이블 점 개수 (1/4 파장)', { min: 4, step: 1 })],
    size: [50, 40], ports: { in: 1, out: 2, outLabels: ['sin', 'cos'] }, icon: () => ({ glyph: 'sine', text: 'lookup' }),
    make(B) {
      const N = Math.max(4, B.int('TableSize', 1024));
      const tab = Float64Array.from({ length: N + 1 }, (_, i) => Math.sin((i / N) * Math.PI / 2));
      const sq = (r) => { const k = Math.min(N - 1, Math.floor(r)), f = r - k; return tab[k] + f * (tab[k + 1] - tab[k]); };
      const q = (x) => { let p = (x / (Math.PI / 2)) % 4; if (p < 0) p += 4; const seg = Math.floor(p), r = (p - seg) * N; return seg === 0 ? sq(r) : seg === 1 ? sq(N - r) : seg === 2 ? -sq(r) : -sq(N - r); };
      return { ts: -1, output: (S, u) => [Float64Array.from(u[0], q), Float64Array.from(u[0], (x) => q(x + Math.PI / 2))] };
    },
  }),
];

export { METHODS, multilinear };
