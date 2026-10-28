// Discrete: Unit Delay, Delay, Zero-Order Hold, Discrete-Time Integrator,
// Discrete Transfer Fcn / Filter / Zero-Pole / State-Space, Discrete PID,
// Memory, Difference, Tapped Delay, Discrete Derivative, Transfer Fcn First
// Order. States live in the runtime closures and change only in update().
import { def, L, P, enumP, boolP, numP, TS, S1, F, copy, tsOf, poly, sat, at } from './util.js';
import { MError } from '../../value.js';

const G = 'discrete';
const RESET = [{ value: 'none', label: L('none', '없음') }, { value: 'rising', label: L('rising', '상승') }, { value: 'falling', label: L('falling', '하강') }, { value: 'either', label: L('either', '양쪽') }, { value: 'level', label: L('level', '레벨') }];
const edge = (type, prev, cur) => {
  const rise = (prev < 0 && cur >= 0) || (prev === 0 && cur > 0);
  const fall = (prev > 0 && cur <= 0) || (prev === 0 && cur < 0);
  return type === 'rising' ? rise : type === 'falling' ? fall : type === 'either' ? rise || fall : false;
};
/** The state vector `s` (or the initial value) fitted to width w. */
const fit = (s, w, ic) => (s && s.length === w ? s : ic.length === w ? Float64Array.from(ic) : ic.length === 1 ? F(w).fill(ic[0]) : s || Float64Array.from(ic));
const icOf = (B, n) => { const a = B.arr(n); return a.length ? a : S1(0); };
const per = (ts) => (Array.isArray(ts) ? ts[0] : 0);
const fmtZ = (s) => { const t = String(s || '').trim().replace(/^\[|\]$/g, '').trim().split(/[\s,]+/).filter(Boolean); if (!t.length) return '?'; const n = t.length - 1; return t.map((c, i) => { const p = n - i; const cc = c === '1' && p > 0 ? '' : c; return p === 0 ? c : p === 1 ? `${cc}z` : `${cc}z^${p}`; }).filter((x, i) => t[i] !== '0').join('+').replace(/\+-/g, '-') || '0'; };

/**
 * Direct form II transposed filter with equal-length b, a (a[0] = 1), one
 * state set per input element (sized from the input width).
 */
function df2t(B, b, a, ts) {
  const n = b.length - 1;
  const direct = b[0] !== 0;
  let st = null; // array of Float64Array(n) per channel
  const chans = (w) => { if (!st || st.length !== w) st = Array.from({ length: w }, () => F(n)); return st; };
  const y0 = (u) => { const v = u[0] || S1(0); const s = chans(v.length); return Float64Array.from(v, (x, i) => b[0] * x + (n ? s[i][0] : 0)); };
  return {
    ts, direct,
    init() { st = null; },
    output(S, u) { if (!direct) { const w = (u[0] || S1(0)).length; const s = st && st.length === w ? st : null; return [Float64Array.from({ length: w }, (_, i) => (s && n ? s[i][0] : 0))]; } return [y0(u)]; },
    update(S, u) {
      const v = u[0] || S1(0);
      const s = chans(v.length);
      for (let c = 0; c < v.length; c++) {
        const x = v[c], z = s[c];
        const y = b[0] * x + (n ? z[0] : 0);
        for (let i = 0; i < n; i++) z[i] = b[i + 1] * x - a[i + 1] * y + (i + 1 < n ? z[i + 1] : 0);
      }
    },
  };
}
/** num/den in descending powers of z → equal-length (b, a) normalised by a[0]. */
function zCoeffs(B, num, den) {
  let d = Array.from(den); while (d.length > 1 && d[0] === 0) d.shift();
  if (!d.length || d[0] === 0) B.err('The denominator must not be zero.');
  let nm = Array.from(num); while (nm.length > 1 && nm[0] === 0 && nm.length > d.length) nm.shift();
  if (nm.length > d.length) B.err('The transfer function must be proper (numerator degree <= denominator degree).');
  while (nm.length < d.length) nm.unshift(0);
  const a0 = d[0];
  return { b: nm.map((x) => x / a0), a: d.map((x) => x / a0) };
}

export const BLOCKS = [
  def('UnitDelay', G, 'Unit Delay', '단위 지연', {
    desc: L('Delays the input by one sample period: y(k) = u(k−1).', '입력을 한 샘플 주기 지연합니다: y(k) = u(k−1).'),
    params: [numP('InitialCondition', '0', 'Initial condition', '초기 조건'), TS('-1')],
    size: [40, 40], icon: () => ({ frac: ['1', 'z'] }),
    make(B) {
      const ic = icOf(B, 'InitialCondition');
      let s = null;
      return { ts: tsOf(B, -1), direct: false, init() { s = null; }, output: (S, u) => [copy(fit(s, (u[0] || ic).length, ic))], update(S, u) { s = Float64Array.from(u[0]); } };
    },
  }),
  def('Delay', G, 'Delay', '지연', {
    desc: L('Delays the input by N sample periods.', '입력을 N 샘플 주기 지연합니다.'),
    params: [numP('DelayLength', '2', 'Delay length', '지연 길이', { min: 0, step: 1 }), numP('InitialCondition', '0', 'Initial condition', '초기 조건'), TS('-1')],
    size: [40, 40], icon: (p) => ({ frac: ['1', `z^${p.DelayLength ?? 2}`] }),
    make(B) {
      const N = B.int('DelayLength', 2), ic = icOf(B, 'InitialCondition');
      if (N < 0) B.err('The delay length must not be negative.');
      let buf = [];
      if (N === 0) return { ts: tsOf(B, -1), output: (S, u) => [copy(u[0])] };
      return {
        ts: tsOf(B, -1), direct: false,
        init() { buf = []; },
        output(S, u) { const w = (u[0] || ic).length; return [copy(buf.length >= N ? fit(buf[0], w, ic) : fit(null, w, ic))]; },
        update(S, u) { buf.push(Float64Array.from(u[0])); if (buf.length > N) buf.shift(); },
      };
    },
  }),
  def('ZeroOrderHold', G, 'Zero-Order Hold', '영차 홀드', {
    desc: L('Samples the input and holds it for one sample period.', '입력을 샘플링하여 한 샘플 주기 동안 유지합니다.'),
    params: [TS('1')], size: [40, 40], icon: () => ({ glyph: 'quantizer' }),
    make: (B) => ({ ts: tsOf(B, [1, 0]), output: (S, u) => [copy(u[0])] }),
  }),
  def('DiscreteTimeIntegrator', G, 'Discrete-Time Integrator', '이산 시간 적분기', {
    desc: L('Discrete integration (forward Euler, backward Euler or trapezoidal) with gain, limits and external reset.', '이산 적분 (전진 오일러, 후진 오일러, 사다리꼴), 이득·제한·외부 리셋 지원.'),
    params: [
      enumP('IntegratorMethod', 'Integration: Forward Euler', 'Integrator method', '적분 방법', ['Integration: Forward Euler', 'Integration: Backward Euler', 'Integration: Trapezoidal']),
      numP('gainval', '1.0', 'Gain value', '이득 값'),
      enumP('ExternalReset', 'none', 'External reset', '외부 리셋', RESET),
      numP('InitialCondition', '0', 'Initial condition', '초기 조건'),
      boolP('LimitOutput', false, 'Limit output', '출력 제한'),
      numP('UpperSaturationLimit', 'inf', 'Upper saturation limit', '상한'), numP('LowerSaturationLimit', '-inf', 'Lower saturation limit', '하한'),
      TS('1'),
    ],
    size: [50, 40], ports: (p) => ({ in: String(p.ExternalReset || 'none') !== 'none' ? 2 : 1, out: 1 }),
    icon: (p) => ({ frac: [/Trapezoidal/.test(p.IntegratorMethod) ? 'KTs(z+1)' : /Backward/.test(p.IntegratorMethod) ? 'KTs z' : 'KTs', /Trapezoidal/.test(p.IntegratorMethod) ? '2(z-1)' : 'z-1'] }),
    make(B) {
      const m = B.opt('IntegratorMethod'), meth = /Trapezoidal/.test(m) ? 'trap' : /Backward/.test(m) ? 'be' : 'fe';
      const K = B.num('gainval', 1), ic = icOf(B, 'InitialCondition'), reset = B.opt('ExternalReset') || 'none';
      const lim = B.bool('LimitOutput'), up = lim ? B.arr('UpperSaturationLimit') : S1(Infinity), lo = lim ? B.arr('LowerSaturationLimit') : S1(-Infinity);
      const ts = tsOf(B, [1, 0]);
      let x = null, prevR = null, tPrev = null;
      const T = (S) => (per(ts) > 0 ? per(ts) : tPrev === null ? 0 : S.t - tPrev);
      const fired = (u) => { if (reset === 'none') return false; const r = (u[1] || S1(0))[0]; if (reset === 'level') return r !== 0; return prevR !== null && edge(reset, prevR, r); };
      const out = (S, u) => {
        const v = u[0] || S1(0), w = v.length, s = fit(x, w, ic);
        const y = F(w);
        const h = K * T(S);
        if (fired(u) || x === null) { for (let i = 0; i < w; i++) y[i] = sat(at(ic, i), at(lo, i), at(up, i)); return y; }
        for (let i = 0; i < w; i++) y[i] = sat(meth === 'fe' ? s[i] : meth === 'be' ? s[i] + h * v[i] : s[i] + 0.5 * h * v[i], at(lo, i), at(up, i));
        return y;
      };
      return {
        ts, direct: meth !== 'fe' ? [true, true] : [false, true],
        init() { x = null; prevR = null; tPrev = null; },
        output: (S, u) => [out(S, u)],
        update(S, u) {
          const v = u[0] || S1(0), y = out(S, u), h = K * T(S), w = v.length;
          const nx = F(w);
          for (let i = 0; i < w; i++) nx[i] = sat(meth === 'fe' ? y[i] + h * v[i] : meth === 'be' ? y[i] : y[i] + 0.5 * h * v[i], at(lo, i), at(up, i));
          x = nx;
          if (reset !== 'none') prevR = (u[1] || S1(0))[0];
          tPrev = S.t;
        },
      };
    },
  }),
  def('DiscreteTransferFcn', G, 'Discrete Transfer Fcn', '이산 전달 함수', {
    desc: L('Discrete transfer function num(z)/den(z) (descending powers of z).', '이산 전달 함수 num(z)/den(z) (z의 내림차순).'),
    params: [P('Numerator', 'expr', '[1]', 'Numerator', '분자'), P('Denominator', 'expr', '[1 0.5]', 'Denominator', '분모'), TS('1')],
    size: [60, 40], icon: (p) => ({ frac: [fmtZ(p.Numerator ?? '[1]'), fmtZ(p.Denominator ?? '[1 0.5]')] }),
    make(B) { const { b, a } = zCoeffs(B, B.arr('Numerator'), B.arr('Denominator')); return df2t(B, b, a, tsOf(B, [1, 0])); },
  }),
  def('DiscreteFilter', G, 'Discrete Filter', '이산 필터', {
    desc: L('IIR / FIR filter num(z⁻¹)/den(z⁻¹) (ascending powers of z⁻¹).', 'IIR/FIR 필터 num(z⁻¹)/den(z⁻¹) (z⁻¹의 오름차순).'),
    params: [P('Numerator', 'expr', '[1]', 'Numerator', '분자'), P('Denominator', 'expr', '[1 0.5]', 'Denominator', '분모'), TS('1')],
    size: [60, 40], icon: (p) => ({ frac: [String(p.Numerator ?? '[1]').replace(/[[\]]/g, ''), String(p.Denominator ?? '[1 0.5]').replace(/[[\]]/g, '')] }),
    make(B) {
      const nm = Array.from(B.arr('Numerator')), dn = Array.from(B.arr('Denominator'));
      if (!dn.length || dn[0] === 0) B.err('The leading denominator coefficient must not be zero.');
      const L2 = Math.max(nm.length, dn.length);
      while (nm.length < L2) nm.push(0); while (dn.length < L2) dn.push(0);
      const a0 = dn[0];
      return df2t(B, nm.map((x) => x / a0), dn.map((x) => x / a0), tsOf(B, [1, 0]));
    },
  }),
  def('DiscreteZeroPole', G, 'Discrete Zero-Pole', '이산 영점-극점', {
    desc: L('Discrete transfer function from zeros, poles and gain in z.', 'z 영역의 영점·극점·이득으로 주어진 이산 전달 함수.'),
    params: [P('Zeros', 'expr', '[1]', 'Zeros', '영점'), P('Poles', 'expr', '[0 0.5]', 'Poles', '극점'), P('Gain', 'expr', '1', 'Gain', '이득'), TS('1')],
    size: [70, 40], icon: () => ({ frac: ['(z-z1)', '(z-p1)(z-p2)'] }),
    make(B) {
      const z = B.mat('Zeros'), p = B.mat('Poles'), k = B.num('Gain', 1);
      const num = poly(Array.from(z.re), z.im ? Array.from(z.im) : null).map((c) => c * k);
      const den = poly(Array.from(p.re), p.im ? Array.from(p.im) : null);
      const { b, a } = zCoeffs(B, num, den);
      return df2t(B, b, a, tsOf(B, [1, 0]));
    },
  }),
  def('TransferFcnFirstOrder', G, 'Transfer Fcn First Order', '1차 전달 함수', {
    desc: L('Discrete first-order low-pass K·(1−p)·z/(z−p).', '이산 1차 저역 통과 K·(1−p)·z/(z−p).'),
    params: [numP('PoleZ', '0.95', 'Pole (in z)', '극점 (z)'), numP('Gain', '1', 'DC gain', 'DC 이득'), numP('ICPrevOutput', '0', 'Initial previous output', '이전 출력 초기값'), TS('-1')],
    size: [70, 40], icon: () => ({ frac: ['K(1-p)z', 'z-p'] }),
    make(B) {
      const p = B.num('PoleZ', 0.95), K = B.num('Gain', 1), ic = B.num('ICPrevOutput', 0);
      let yp = null;
      return {
        ts: tsOf(B, -1),
        init() { yp = null; },
        output: (S, u) => [Float64Array.from(u[0], (x, i) => p * (yp ? yp[i] ?? ic : ic) + K * (1 - p) * x)],
        update(S, u) { yp = Float64Array.from(u[0], (x, i) => p * (yp ? yp[i] ?? ic : ic) + K * (1 - p) * x); },
      };
    },
  }),
  def('DiscreteStateSpace', G, 'Discrete State-Space', '이산 상태 공간', {
    desc: L('x(k+1) = A x(k) + B u(k), y(k) = C x(k) + D u(k).', 'x(k+1) = A x(k) + B u(k), y(k) = C x(k) + D u(k).'),
    params: [P('A', 'expr', '1', 'A', 'A'), P('B', 'expr', '1', 'B', 'B'), P('C', 'expr', '1', 'C', 'C'), P('D', 'expr', '1', 'D', 'D'), P('InitialCondition', 'expr', '0', 'Initial conditions', '초기 조건'), TS('1')],
    size: [70, 40], icon: () => ({ text: 'x(k+1)=Ax+Bu\ny(k)=Cx+Du' }),
    make(Bk) {
      const A = Bk.mat('A'), Bm = Bk.mat('B'), C = Bk.mat('C'), D = Bk.mat('D');
      const n = A.m;
      if (A.m !== A.n) Bk.err('A must be square.');
      const m = n ? Bm.n : D.n, p = n ? C.m : D.m;
      if (n && (Bm.m !== n || C.n !== n)) Bk.err('The sizes of A, B and C do not agree.');
      const Dm = D.re.length ? D.re : F(p * m);
      if (Dm.length !== p * m) Bk.err(`D must be ${p}×${m}.`);
      const direct = Dm.some((v) => v !== 0);
      const x0 = Bk.arr('InitialCondition');
      let x = F(n);
      const uv = (u) => { const v = u[0] || S1(0); if (v.length === m) return v; if (v.length === 1) return F(m).fill(v[0]); throw new MError('sim:dss:width', `The input width ${v.length} does not match the number of inputs ${m}.`); };
      return {
        ts: tsOf(Bk, [1, 0]), direct,
        init() { x = x0.length === n ? Float64Array.from(x0) : F(n).fill(x0.length ? x0[0] : 0); },
        output(S, u) {
          const v = direct ? uv(u) : null, y = F(p);
          for (let i = 0; i < p; i++) { let s = 0; for (let j = 0; j < n; j++) s += C.re[i + j * p] * x[j]; if (v) for (let j = 0; j < m; j++) s += Dm[i + j * p] * v[j]; y[i] = s; }
          return [y];
        },
        update(S, u) {
          const v = uv(u), nx = F(n);
          for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += A.re[i + j * n] * x[j]; for (let j = 0; j < m; j++) s += Bm.re[i + j * n] * v[j]; nx[i] = s; }
          x = nx;
        },
      };
    },
  }),
  def('DiscretePIDController', G, 'Discrete PID Controller', '이산 PID 제어기', {
    desc: L('Discrete parallel PID: P + I·Ts/(z−1) + D·N/(1 + N·Ts/(z−1)) (forward Euler), optional output limits with clamping.', '이산 병렬 PID: P + I·Ts/(z−1) + D·N/(1 + N·Ts/(z−1)) (전진 오일러), 출력 제한과 클램핑.'),
    params: [
      enumP('Controller', 'PID', 'Controller', '제어기', ['PID', 'PI', 'PD', 'P', 'I']),
      numP('P', '1', 'Proportional (P)', '비례 (P)'), numP('I', '1', 'Integral (I)', '적분 (I)'), numP('D', '0', 'Derivative (D)', '미분 (D)'), numP('N', '100', 'Filter coefficient (N)', '필터 계수 (N)'),
      numP('InitialConditionForIntegrator', '0', 'Integrator initial condition', '적분기 초기 조건', { tab: 'advanced' }),
      numP('InitialConditionForFilter', '0', 'Filter initial condition', '필터 초기 조건', { tab: 'advanced' }),
      boolP('LimitOutput', false, 'Limit output', '출력 제한', { tab: 'advanced' }),
      numP('UpperSaturationLimit', 'inf', 'Upper limit', '상한', { tab: 'advanced' }), numP('LowerSaturationLimit', '-inf', 'Lower limit', '하한', { tab: 'advanced' }),
      TS('1'),
    ],
    size: [60, 40], icon: (p) => ({ text: `${p.Controller || 'PID'}(z)` }),
    make(B) {
      const kind = B.opt('Controller') || 'PID';
      const kp = kind === 'I' ? 0 : B.num('P', 1), ki = /I/.test(kind) ? B.num('I', 1) : 0, kd = /D/.test(kind) ? B.num('D', 0) : 0, N = B.num('N', 100);
      const lim = B.bool('LimitOutput'), up = lim ? B.num('UpperSaturationLimit', Infinity) : Infinity, lo = lim ? B.num('LowerSaturationLimit', -Infinity) : -Infinity;
      const xi0 = B.num('InitialConditionForIntegrator', 0), xf0 = B.num('InitialConditionForFilter', 0);
      const ts = tsOf(B, [1, 0]);
      const Ts = per(ts) > 0 ? per(ts) : 1;
      let xi = xi0, xf = xf0;
      const raw = (e) => kp * e + xi + (kd ? kd * N * e - kd * N * xf : 0);
      return {
        ts, direct: kp !== 0 || kd !== 0,
        init() { xi = xi0; xf = xf0; },
        output: (S, u) => [S1(sat(raw(u[0][0]), lo, up))],
        update(S, u) {
          const e = u[0][0], r = raw(e);
          if (!((r > up && ki * e > 0) || (r < lo && ki * e < 0))) xi += ki * Ts * e;
          if (kd) xf += Ts * N * (e - xf);
        },
      };
    },
  }),
  def('Memory', G, 'Memory', '메모리', {
    desc: L('Outputs the input of the previous major time step.', '이전 주 시간 스텝의 입력을 내보냅니다.'),
    params: [numP('InitialCondition', '0', 'Initial condition', '초기 조건')],
    size: [40, 40], icon: () => ({ text: 'Mem' }),
    make(B) { const ic = icOf(B, 'InitialCondition'); let s = null; return { ts: -1, direct: false, init() { s = null; }, output: (S, u) => [copy(fit(s, (u[0] || ic).length, ic))], update(S, u) { s = Float64Array.from(u[0]); } }; },
  }),
  def('Difference', G, 'Difference', '차분', {
    desc: L('y(k) = u(k) − u(k−1).', 'y(k) = u(k) − u(k−1).'),
    params: [numP('ICPrevInput', '0', 'Initial previous input', '이전 입력 초기값'), TS('-1')],
    size: [50, 40], icon: () => ({ frac: ['z-1', 'z'] }),
    make(B) { const ic = icOf(B, 'ICPrevInput'); let s = null; return { ts: tsOf(B, -1), init() { s = null; }, output: (S, u) => { const p = fit(s, u[0].length, ic); return [Float64Array.from(u[0], (x, i) => x - p[i])]; }, update(S, u) { s = Float64Array.from(u[0]); } }; },
  }),
  def('DiscreteDerivative', G, 'Discrete Derivative', '이산 미분', {
    desc: L('y(k) = K·(u(k) − u(k−1)) / Ts.', 'y(k) = K·(u(k) − u(k−1)) / Ts.'),
    params: [numP('gainval', '1.0', 'Gain value', '이득 값'), numP('ICPrevScaledInput', '0', 'Initial condition for previous weighted input K·u/Ts', '이전 가중 입력 K·u/Ts 초기값'), TS('1')],
    size: [50, 40], icon: () => ({ frac: ['K(z-1)', 'Ts z'] }),
    make(B) {
      const K = B.num('gainval', 1), ic = B.num('ICPrevScaledInput', 0), ts = tsOf(B, [1, 0]);
      const Ts = per(ts) > 0 ? per(ts) : 1;
      let s = null;
      return { ts, init() { s = null; }, output: (S, u) => [Float64Array.from(u[0], (x, i) => K * x / Ts - (s ? s[i] ?? ic : ic))], update(S, u) { s = Float64Array.from(u[0], (x) => K * x / Ts); } };
    },
  }),
  def('TappedDelay', G, 'Tapped Delay', '탭 지연', {
    desc: L('Outputs the last N delayed samples of a scalar input as a vector.', '스칼라 입력의 지연된 최근 N개 샘플을 벡터로 내보냅니다.'),
    params: [numP('NumDelays', '4', 'Number of delays', '지연 개수', { min: 1, step: 1 }), numP('vinit', '0', 'Initial condition', '초기 조건'), enumP('DelayOrder', 'Oldest', 'Order output vector starting with', '출력 벡터 시작', [{ value: 'Oldest', label: L('Oldest', '가장 오래된 것') }, { value: 'Newest', label: L('Newest', '가장 최근 것') }]), TS('-1')],
    size: [50, 40], icon: () => ({ text: 'z⁻¹…z⁻ᴺ' }),
    make(B) {
      const N = Math.max(1, B.int('NumDelays', 4)), ic = icOf(B, 'vinit'), newest = B.opt('DelayOrder') === 'Newest';
      let buf;
      const reset = () => { buf = Array.from({ length: N }, (_, i) => at(ic, i)); }; // buf[0] = oldest
      reset();
      return { ts: tsOf(B, -1), direct: false, init: reset, output: () => [Float64Array.from(newest ? buf.slice().reverse() : buf)], update(S, u) { buf.shift(); buf.push(u[0][0]); } };
    },
  }),
];
