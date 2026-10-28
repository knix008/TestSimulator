// Math Operations: Sum (Add / Subtract), Product (Divide), Gain, Slider Gain,
// Abs, Sign, Math Function, Trigonometric Function, Sqrt, MinMax, Rounding,
// Bias, Unary Minus, Dot Product, Polynomial, Matrix Concatenate, Reshape and
// the real-signal complex helpers. Signals are real Float64Array (optional
// .dims [m, n] for matrices, column-major).
import { def, L, P, enumP, boolP, numP, S1, F, copy, map1, map2, withDims, dimsOfSig, sgn, polyval, isBus } from './util.js';
import { MError } from '../../value.js';

const G = 'math';
const fmt = (s) => { const t = String(s ?? '').trim(); return t.length > 8 ? `${t.slice(0, 7)}…` : t; };
const keepDims = (y, a, b) => { const d = a && a.dims && a.length === y.length ? a.dims : b && b.dims && b.length === y.length ? b.dims : null; return withDims(y, d); };
const noBus = (u) => { if (isBus(u)) throw new MError('sim:math:bus', 'A bus signal cannot be used in a math operation.'); return u; };

/** Sign list of Sum / Product: a number n → n copies of the default sign, else the sign characters. */
function signList(s, dflt, allowed) {
  const t = String(s ?? '').trim();
  if (/^\d+$/.test(t)) return dflt.repeat(Math.max(1, Number(t)));
  const out = t.replace(/[|\s]/g, '').split('').filter((c) => allowed.includes(c)).join('');
  return out || dflt.repeat(2);
}

// ------------------------------------------------------------ small dense matrix helpers
function matmul(a, da, b, db) {
  const [m, k] = da, [k2, n] = db;
  if (k !== k2) throw new MError('sim:product:dims', `Matrix dimensions do not agree (${m}×${k} times ${k2}×${n}).`);
  const y = F(m * n);
  for (let j = 0; j < n; j++) for (let p = 0; p < k; p++) { const bv = b[p + j * k]; if (bv) for (let i = 0; i < m; i++) y[i + j * m] += a[i + p * m] * bv; }
  return withDims(y, [m, n]);
}
function matinv(a, d) {
  const n = d[0];
  if (d[1] !== n) throw new MError('sim:product:square', 'Only a square matrix can be inverted.');
  const A = Float64Array.from(a), X = F(n * n);
  for (let i = 0; i < n; i++) X[i + i * n] = 1;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r + c * n]) > Math.abs(A[p + c * n])) p = r;
    if (A[p + c * n] === 0) throw new MError('sim:product:singular', 'The matrix is singular.');
    if (p !== c) for (let j = 0; j < n; j++) { let s = A[c + j * n]; A[c + j * n] = A[p + j * n]; A[p + j * n] = s; s = X[c + j * n]; X[c + j * n] = X[p + j * n]; X[p + j * n] = s; }
    const piv = A[c + c * n];
    for (let j = 0; j < n; j++) { A[c + j * n] /= piv; X[c + j * n] /= piv; }
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = A[r + c * n]; if (f) for (let j = 0; j < n; j++) { A[r + j * n] -= f * A[c + j * n]; X[r + j * n] -= f * X[c + j * n]; } }
  }
  return withDims(X, [n, n]);
}

const MATH_OPS = {
  exp: Math.exp, log: Math.log, '10^u': (x) => 10 ** x, log10: Math.log10, 'magnitude^2': (x) => x * x, square: (x) => x * x,
  sqrt: Math.sqrt, conj: (x) => x, reciprocal: (x) => 1 / x,
};
const MATH2 = { pow: (a, b) => a ** b, hypot: Math.hypot, rem: (a, b) => (b === 0 ? a : a - Math.trunc(a / b) * b), mod: (a, b) => (b === 0 ? a : a - Math.floor(a / b) * b) };
const TRIG = { sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh };
const ROUND = { floor: Math.floor, ceil: Math.ceil, round: (x) => (x < 0 ? -Math.round(-x) : Math.round(x)), fix: Math.trunc };
const nIn = (p, k, d) => { const n = Math.round(Number(p[k])); return n >= 1 ? n : d; };

export const BLOCKS = [
  def('Sum', G, 'Sum', '합', {
    desc: L('Adds or subtracts its inputs (signs such as |+- or a number of inputs). With one input it sums the elements.', '입력을 더하거나 뺍니다 (|+- 같은 부호 목록 또는 입력 개수). 입력이 하나면 원소를 모두 더합니다.'),
    params: [P('Inputs', 'text', '|++', 'List of signs', '부호 목록'), enumP('IconShape', 'rectangular', 'Icon shape', '아이콘 모양', [{ value: 'rectangular', label: L('rectangular', '사각형') }, { value: 'round', label: L('round', '원') }])],
    size: [30, 30], ports: (p) => ({ in: signList(p.Inputs ?? '|++', '+', '+-').length, out: 1 }),
    icon: (p) => ({ glyph: 'sum', text: signList(p.Inputs ?? '|++', '+', '+-'), shape: String(p.IconShape) === 'round' ? 'circle' : 'rect' }),
    make(B) {
      const s = signList(B.str('Inputs'), '+', '+-');
      const k = Array.from(s, (c) => (c === '-' ? -1 : 1));
      return {
        ts: -1,
        output(S, u) {
          if (k.length === 1) { const v = noBus(u[0]); let t = 0; for (let i = 0; i < v.length; i++) t += v[i]; return [S1(k[0] * t)]; }
          let y = null, ref = null;
          for (let i = 0; i < k.length; i++) {
            const v = noBus(u[i]);
            if (!y) { y = Float64Array.from(v, (x) => k[i] * x); ref = v; continue; }
            if (v.length !== y.length && v.length !== 1 && y.length !== 1) { if (S.trial) continue; throw new MError('sim:sum:width', `Input widths ${y.length} and ${v.length} do not agree.`); }
            const ki = k[i];
            y = map2(y, v, (a, b) => a + ki * b);
            if (v.length > (ref ? ref.length : 0)) ref = v;
          }
          return [keepDims(y, ref)];
        },
      };
    },
  }),
  def('Product', G, 'Product', '곱', {
    desc: L('Multiplies or divides its inputs (signs such as ** or */, or a number of inputs), element-wise or as matrices. With one input it multiplies the elements.', '입력을 곱하거나 나눕니다 (** 또는 */ 같은 부호, 또는 입력 개수). 원소별 또는 행렬 연산. 입력이 하나면 원소를 모두 곱합니다.'),
    params: [P('Inputs', 'text', '2', 'Number of inputs or */ list', '입력 개수 또는 */ 목록'), enumP('Multiplication', 'Element-wise(.*)', 'Multiplication', '곱셈', ['Element-wise(.*)', 'Matrix(*)'])],
    size: [30, 30], ports: (p) => ({ in: signList(p.Inputs ?? '2', '*', '*/').length, out: 1 }),
    icon: (p) => { const s = signList(p.Inputs ?? '2', '*', '*/'); return { glyph: 'product', text: s, symbol: String(p.Multiplication || '').startsWith('Matrix') ? 'Π' : '×' }; },
    make(B) {
      const s = signList(B.str('Inputs'), '*', '*/');
      const matrix = B.opt('Multiplication').startsWith('Matrix');
      return {
        ts: -1,
        output(S, u) {
          if (matrix) {
            let y = null, d = null;
            for (let i = 0; i < s.length; i++) {
              const v = noBus(u[i]); let dv = dimsOfSig(v); let w = v;
              if (s[i] === '/') { w = matinv(v, dv); dv = w.dims || [dv[0], dv[0]]; }
              if (!y) { y = w; d = dv; continue; }
              if (S.trial && d[1] !== dv[0]) continue;
              y = matmul(y, d, w, dv); d = dimsOfSig(y).length ? (y.dims || [d[0], dv[1]]) : d;
            }
            return [y];
          }
          if (s.length === 1) { const v = noBus(u[0]); let t = 1; for (let i = 0; i < v.length; i++) t = s === '/' ? t / v[i] : t * v[i]; return [S1(t)]; }
          let y = null, ref = null;
          for (let i = 0; i < s.length; i++) {
            const v = noBus(u[i]);
            if (!y) { y = s[i] === '/' ? map1(v, (x) => 1 / x) : copy(v); ref = v; continue; }
            if (v.length !== y.length && v.length !== 1 && y.length !== 1) { if (S.trial) continue; throw new MError('sim:product:width', `Input widths ${y.length} and ${v.length} do not agree.`); }
            y = s[i] === '/' ? map2(y, v, (a, b) => a / b) : map2(y, v, (a, b) => a * b);
            if (v.length > ref.length) ref = v;
          }
          return [keepDims(y, ref)];
        },
      };
    },
  }),
  def('Gain', G, 'Gain', '이득', {
    desc: L('Multiplies the input by a constant gain (element-wise or as a matrix).', '입력에 상수 이득을 곱합니다 (원소별 또는 행렬).'),
    params: [P('Gain', 'expr', '1', 'Gain', '이득', { num: true }), enumP('Multiplication', 'Element-wise(K.*u)', 'Multiplication', '곱셈', ['Element-wise(K.*u)', 'Matrix(K*u)', 'Matrix(u*K)', 'Matrix(K*u) (u vector)'])],
    size: [40, 40], shape: 'triangle', icon: (p) => ({ text: fmt(p.Gain ?? '1') || '1' }),
    make(B) { return gainRuntime(B); },
  }),
  def('SliderGain', G, 'Slider Gain', '슬라이더 이득', {
    desc: L('A scalar gain set with a slider between Low and High (tunable while running).', 'Low와 High 사이 슬라이더로 정하는 스칼라 이득 (실행 중 조정 가능).'),
    params: [numP('Gain', '1', 'Gain', '이득', { step: 0.01 }), numP('Low', '0', 'Low', '최소'), numP('High', '2', 'High', '최대')],
    size: [40, 40], shape: 'triangle', icon: (p) => ({ text: fmt(p.Gain ?? '1') }),
    make(B) { const k = B.num('Gain', 1); return { ts: -1, output: (S, u) => [keepDims(map1(noBus(u[0]), (x) => k * x), u[0])] }; },
  }),
  def('Abs', G, 'Abs', '절댓값', {
    desc: L('Absolute value of each element.', '각 원소의 절댓값.'),
    params: [boolP('ZeroCross', true, 'Enable zero-crossing detection', '영점 교차 검출', { tab: 'advanced' })],
    size: [40, 40], icon: () => ({ glyph: 'abs' }),
    make(B) { const rt = { ts: -1, output: (S, u) => [keepDims(map1(noBus(u[0]), Math.abs), u[0])] }; if (B.bool('ZeroCross')) rt.zc = (S, u) => Array.from(u[0]); return rt; },
  }),
  def('Sign', G, 'Sign', '부호', {
    desc: L('Sign of each element: 1, 0 or −1.', '각 원소의 부호: 1, 0, −1.'),
    params: [boolP('ZeroCross', true, 'Enable zero-crossing detection', '영점 교차 검출', { tab: 'advanced' })],
    size: [40, 40], icon: () => ({ glyph: 'sign' }),
    make(B) { const rt = { ts: -1, output: (S, u) => [keepDims(map1(noBus(u[0]), sgn), u[0])] }; if (B.bool('ZeroCross')) rt.zc = (S, u) => Array.from(u[0]); return rt; },
  }),
  def('MathFunction', G, 'Math Function', '수학 함수', {
    desc: L('exp, log, 10^u, log10, magnitude^2, square, sqrt, pow, conj, reciprocal, hypot, rem, mod, transpose, hermitian (real signals).', 'exp, log, 10^u, log10, magnitude^2, square, sqrt, pow, conj, reciprocal, hypot, rem, mod, transpose, hermitian (실수 신호).'),
    params: [enumP('Operator', 'exp', 'Function', '함수', ['exp', 'log', '10^u', 'log10', 'magnitude^2', 'square', 'sqrt', 'pow', 'conj', 'reciprocal', 'hypot', 'rem', 'mod', 'transpose', 'hermitian'])],
    size: [50, 40], ports: (p) => ({ in: MATH2[p.Operator || 'exp'] ? 2 : 1, out: 1 }), icon: (p) => ({ text: { '10^u': '10ᵘ', 'magnitude^2': '|u|²', square: 'u²', reciprocal: '1/u', pow: 'uᵛ', transpose: 'uᵀ', hermitian: 'uᴴ', exp: 'eᵘ' }[p.Operator || 'exp'] || p.Operator }),
    make(B) {
      const op = B.opt('Operator') || 'exp';
      if (MATH2[op]) { const f = MATH2[op]; return { ts: -1, output: (S, u) => [keepDims(map2(noBus(u[0]), noBus(u[1]), f), u[0], u[1])] }; }
      if (op === 'transpose' || op === 'hermitian') return { ts: -1, output: (S, u) => { const v = noBus(u[0]); const [m, n] = dimsOfSig(v); const y = F(v.length); for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) y[j + i * n] = v[i + j * m]; return [n === 1 ? withDims(y, [1, m]) : withDims(y, [n, m])]; } };
      const f = MATH_OPS[op];
      if (!f) B.err(`Unknown function '${op}'.`);
      return { ts: -1, output: (S, u) => [keepDims(map1(noBus(u[0]), f), u[0])] };
    },
  }),
  def('TrigonometricFunction', G, 'Trigonometric Function', '삼각 함수', {
    desc: L('sin, cos, tan, asin, acos, atan, atan2, sinh, cosh, tanh, asinh, acosh, atanh or sincos (two outputs).', 'sin, cos, tan, asin, acos, atan, atan2, sinh, cosh, tanh, asinh, acosh, atanh 또는 sincos(출력 두 개).'),
    params: [enumP('Operator', 'sin', 'Function', '함수', ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'sincos'])],
    size: [50, 40], ports: (p) => ({ in: p.Operator === 'atan2' ? 2 : 1, out: p.Operator === 'sincos' ? 2 : 1 }), icon: (p) => ({ text: p.Operator || 'sin' }),
    make(B) {
      const op = B.opt('Operator') || 'sin';
      if (op === 'atan2') return { ts: -1, output: (S, u) => [keepDims(map2(noBus(u[0]), noBus(u[1]), Math.atan2), u[0], u[1])] };
      if (op === 'sincos') return { ts: -1, y0: () => [S1(0), S1(1)], output: (S, u) => [keepDims(map1(noBus(u[0]), Math.sin), u[0]), keepDims(map1(u[0], Math.cos), u[0])] };
      const f = TRIG[op];
      if (!f) B.err(`Unknown function '${op}'.`);
      return { ts: -1, output: (S, u) => [keepDims(map1(noBus(u[0]), f), u[0])] };
    },
  }),
  def('Sqrt', G, 'Sqrt', '제곱근', {
    desc: L('Square root, signed square root sign(u)·sqrt(|u|) or reciprocal square root. Negative inputs of sqrt give NaN (real signals).', '제곱근, 부호 있는 제곱근 sign(u)·sqrt(|u|) 또는 역제곱근. sqrt의 음수 입력은 NaN (실수 신호).'),
    params: [enumP('Operator', 'sqrt', 'Function', '함수', ['sqrt', 'signedSqrt', 'rSqrt'])],
    size: [40, 40], icon: (p) => ({ text: { signedSqrt: '±√u', rSqrt: '1/√u' }[p.Operator] || '√u' }),
    make(B) {
      const op = B.opt('Operator');
      const f = op === 'signedSqrt' ? (x) => sgn(x) * Math.sqrt(Math.abs(x)) : op === 'rSqrt' ? (x) => 1 / Math.sqrt(x) : Math.sqrt;
      return { ts: -1, output: (S, u) => [keepDims(map1(noBus(u[0]), f), u[0])] };
    },
  }),
  def('MinMax', G, 'MinMax', '최소/최대', {
    desc: L('Minimum or maximum of its inputs element-wise; with one input, over the elements.', '입력들의 원소별 최소 또는 최대. 입력이 하나면 원소들 중에서.'),
    params: [enumP('Function', 'min', 'Function', '함수', ['min', 'max']), numP('Inputs', '1', 'Number of inputs', '입력 개수', { min: 1, step: 1 }), boolP('ZeroCross', true, 'Enable zero-crossing detection', '영점 교차 검출', { tab: 'advanced' })],
    size: [40, 40], ports: (p) => ({ in: nIn(p, 'Inputs', 1), out: 1 }), icon: (p) => ({ text: p.Function || 'min' }),
    make(B) {
      const mx = B.opt('Function') === 'max', n = Math.max(1, B.int('Inputs', 1));
      const pick = mx ? (a, b) => (b > a || Number.isNaN(a) ? b : a) : (a, b) => (b < a || Number.isNaN(a) ? b : a);
      const rt = {
        ts: -1,
        output(S, u) {
          if (n === 1) { const v = noBus(u[0]); let r = v[0]; for (let i = 1; i < v.length; i++) r = pick(r, v[i]); return [S1(r)]; }
          let y = copy(noBus(u[0]));
          for (let i = 1; i < n; i++) y = map2(y, noBus(u[i]), pick);
          return [y];
        },
      };
      if (n === 2 && B.bool('ZeroCross')) rt.zc = (S, u) => Array.from(map2(u[0], u[1], (a, b) => a - b));
      return rt;
    },
  }),
  def('Rounding', G, 'Rounding Function', '반올림 함수', {
    desc: L('floor, ceil, round (half away from zero) or fix (towards zero).', 'floor, ceil, round(0에서 먼 쪽으로 반올림) 또는 fix(0 쪽으로).'),
    params: [enumP('Operator', 'floor', 'Function', '함수', ['floor', 'ceil', 'round', 'fix'])],
    size: [40, 40], icon: (p) => ({ text: p.Operator || 'floor' }),
    make(B) { const f = ROUND[B.opt('Operator')] || Math.floor; return { ts: -1, output: (S, u) => [keepDims(map1(noBus(u[0]), f), u[0])] }; },
  }),
  def('Bias', G, 'Bias', '바이어스', {
    desc: L('Adds a constant bias: y = u + Bias.', '상수 바이어스를 더합니다: y = u + Bias.'),
    params: [numP('Bias', '0', 'Bias', '바이어스')], size: [40, 40], icon: (p) => ({ text: `u+${fmt(p.Bias ?? '0')}` }),
    make(B) { const b = B.arr('Bias'); return { ts: -1, output: (S, u) => [keepDims(map2(noBus(u[0]), b.length ? b : S1(0), (x, y) => x + y), u[0])] }; },
  }),
  def('UnaryMinus', G, 'Unary Minus', '부호 반전', {
    desc: L('Negates the input: y = −u.', '입력의 부호를 바꿉니다: y = −u.'), size: [30, 30], icon: () => ({ text: '−u' }),
    make: () => ({ ts: -1, output: (S, u) => [keepDims(map1(noBus(u[0]), (x) => -x), u[0])] }),
  }),
  def('DotProduct', G, 'Dot Product', '내적', {
    desc: L('Inner product sum(u1 .* u2) of two vectors.', '두 벡터의 내적 sum(u1 .* u2).'), size: [40, 40], ports: { in: 2, out: 1 }, icon: () => ({ text: 'u1·u2' }),
    make: () => ({ ts: -1, output(S, u) { const a = noBus(u[0]), b = noBus(u[1]); if (a.length !== b.length && a.length !== 1 && b.length !== 1 && !S.trial) throw new MError('sim:dot:width', `Input widths ${a.length} and ${b.length} do not agree.`); const p = map2(a, b, (x, y) => x * y); let s = 0; for (const v of p) s += v; return [S1(s)]; } }),
  }),
  def('Polynomial', G, 'Polynomial', '다항식', {
    desc: L('Evaluates a polynomial (coefficients in descending powers) at each element.', '각 원소에서 다항식(내림차순 계수)을 계산합니다.'),
    params: [P('coefs', 'expr', '[1 0 0]', 'Polynomial coefficients', '다항식 계수')], size: [50, 40], icon: () => ({ text: 'P(u)' }),
    make(B) { const c = B.arr('coefs'); if (!c.length) B.err('The coefficient vector is empty.'); return { ts: -1, output: (S, u) => [keepDims(map1(noBus(u[0]), (x) => polyval(c, x)), u[0])] }; },
  }),
  def('MatrixConcatenate', G, 'Matrix Concatenate', '행렬 연결', {
    desc: L('Concatenates its inputs vertically (dimension 1) or horizontally (dimension 2).', '입력을 세로(차원 1) 또는 가로(차원 2)로 연결합니다.'),
    params: [numP('NumInputs', '2', 'Number of inputs', '입력 개수', { min: 1, step: 1 }), enumP('ConcatenateDimension', '2', 'Concatenate dimension', '연결 차원', [{ value: '1', label: L('1 (vertical)', '1 (세로)') }, { value: '2', label: L('2 (horizontal)', '2 (가로)') }])],
    size: [30, 50], ports: (p) => ({ in: nIn(p, 'NumInputs', 2), out: 1 }), icon: (p) => ({ text: String(p.ConcatenateDimension) === '1' ? 'Vert\nCat' : 'Horiz\nCat' }),
    make(B) {
      const vert = B.opt('ConcatenateDimension') === '1';
      return {
        ts: -1,
        output(S, u) {
          const ds = u.map((v) => dimsOfSig(noBus(v)));
          if (vert) {
            const n = ds[0][1];
            if (ds.some((d) => d[1] !== n)) { if (!S.trial) throw new MError('sim:concat:dims', 'The inputs must have the same number of columns.'); }
            const m = ds.reduce((a, d) => a + d[0], 0);
            const y = F(m * n); let r0 = 0;
            u.forEach((v, k) => { const mk = ds[k][0]; for (let j = 0; j < n; j++) for (let i = 0; i < mk; i++) y[r0 + i + j * m] = v[i + j * mk] ?? 0; r0 += mk; });
            return [withDims(y, [m, n])];
          }
          const m = ds[0][0];
          if (ds.some((d) => d[0] !== m)) { if (!S.trial) throw new MError('sim:concat:dims', 'The inputs must have the same number of rows.'); }
          const n = ds.reduce((a, d) => a + d[1], 0);
          const y = F(m * n); let o = 0;
          for (const v of u) { y.set(v.subarray(0, Math.min(v.length, y.length - o)), o); o += v.length; }
          return [withDims(y, [m, n])];
        },
      };
    },
  }),
  def('Reshape', G, 'Reshape', '모양 바꾸기', {
    desc: L('Changes the dimensions of a signal (1-D array, column, row or custom [m n]); the element count must not change.', '신호의 차원을 바꿉니다 (1-D 배열, 열, 행, 사용자 [m n]). 원소 개수는 같아야 합니다.'),
    params: [enumP('OutputDimensionality', '1-D array', 'Output dimensionality', '출력 차원', ['1-D array', 'Column vector', 'Row vector', 'Customize']), P('OutputDimensions', 'expr', '[1 1]', 'Output dimensions', '출력 차원', { num: true })],
    size: [40, 40], icon: () => ({ text: 'U( : )' }),
    make(B) {
      const mode = B.opt('OutputDimensionality');
      const od = mode === 'Customize' ? Array.from(B.arr('OutputDimensions'), Math.round) : null;
      return {
        ts: -1,
        output(S, u) {
          const v = noBus(u[0]);
          const y = Float64Array.from(v);
          if (mode === 'Row vector') return [withDims(y, [1, v.length])];
          if (od) {
            const d = od.length === 1 ? [od[0], 1] : od;
            if (d[0] * d[1] !== v.length) { if (S.trial) return [y]; throw new MError('sim:reshape:numel', `Cannot reshape ${v.length} elements to ${d.join('×')}.`); }
            return [withDims(y, d)];
          }
          return [y];
        },
      };
    },
  }),
  def('ComplexToRealImag', G, 'Complex to Real-Imag', '복소수 → 실수·허수', {
    desc: L('Real and imaginary parts. Signals in this engine are real, so the imaginary part is always zero.', '실수부와 허수부. 이 엔진의 신호는 실수이므로 허수부는 항상 0입니다.'),
    params: [enumP('Output', 'Real and imag', 'Output', '출력', ['Real and imag', 'Real', 'Imag'])],
    size: [40, 40], ports: (p) => ({ in: 1, out: String(p.Output || 'Real and imag') === 'Real and imag' ? 2 : 1 }), icon: () => ({ text: 'Re\nIm' }),
    make(B) {
      const o = B.opt('Output');
      return { ts: -1, output: (S, u) => { const v = noBus(u[0]); const re = copy(v), im = F(v.length); return o === 'Real' ? [re] : o === 'Imag' ? [im] : [re, im]; } };
    },
  }),
  def('ComplexToMagnitudeAngle', G, 'Complex to Magnitude-Angle', '복소수 → 크기·각도', {
    desc: L('Magnitude and angle of the input. Signals in this engine are real: the angle is 0 for u ≥ 0 and π for u < 0.', '입력의 크기와 각도. 이 엔진의 신호는 실수이므로 각도는 u ≥ 0이면 0, u < 0이면 π입니다.'),
    params: [enumP('Output', 'Magnitude and angle', 'Output', '출력', ['Magnitude and angle', 'Magnitude', 'Angle'])],
    size: [40, 40], ports: (p) => ({ in: 1, out: String(p.Output || 'Magnitude and angle') === 'Magnitude and angle' ? 2 : 1 }), icon: () => ({ text: '|u|\n∠u' }),
    make(B) {
      const o = B.opt('Output');
      return { ts: -1, output: (S, u) => { const v = noBus(u[0]); const mg = map1(v, Math.abs), an = map1(v, (x) => (x < 0 ? Math.PI : 0)); return o === 'Magnitude' ? [mg] : o === 'Angle' ? [an] : [mg, an]; } };
    },
  }),
];

function gainRuntime(B) {
  const K = B.mat('Gain');
  if (!K.re.length) B.err('The gain is empty.');
  const mode = B.opt('Multiplication');
  const kd = K.dims.length === 2 ? K.dims : [K.m, K.n];
  if (mode.startsWith('Matrix(K*u)')) {
    return { ts: -1, output(S, u) { const v = noBus(u[0]); const dv = dimsOfSig(v); if (S.trial && kd[1] !== dv[0]) return [F(kd[0])]; return [matmul(K.re, kd, v, dv)]; } };
  }
  if (mode === 'Matrix(u*K)') {
    return { ts: -1, output(S, u) { const v = noBus(u[0]); let dv = dimsOfSig(v); if (!v.dims) dv = [1, v.length]; if (S.trial && dv[1] !== kd[0]) return [F(kd[1])]; const y = matmul(v, dv, K.re, kd); return [y]; } };
  }
  const k = K.re;
  const kdims = kd[0] > 1 && kd[1] > 1 ? kd : null;
  return { ts: -1, output: (S, u) => { const v = noBus(u[0]); const y = map2(k, v, (a, b) => a * b); return [withDims(y, v.length >= k.length ? v.dims : kdims)]; } };
}

export const LIBRARY_EXTRA = [
  { id: 'Sum.add', type: 'Sum', group: G, label: L('Add', '더하기'), params: { Inputs: '++' }, desc: L('Adds two inputs.', '두 입력을 더합니다.') },
  { id: 'Sum.subtract', type: 'Sum', group: G, label: L('Subtract', '빼기'), params: { Inputs: '+-' }, desc: L('Subtracts input 2 from input 1.', '입력 1에서 입력 2를 뺍니다.') },
  { id: 'Sum.round', type: 'Sum', group: G, label: L('Sum (round)', '합 (원형)'), params: { Inputs: '|+-', IconShape: 'round' }, desc: L('Round summing junction for feedback loops.', '피드백 루프용 원형 합산점.') },
  { id: 'Product.divide', type: 'Product', group: G, label: L('Divide', '나누기'), params: { Inputs: '*/' }, desc: L('Divides input 1 by input 2.', '입력 1을 입력 2로 나눕니다.') },
];

export { matmul, matinv, signList };
