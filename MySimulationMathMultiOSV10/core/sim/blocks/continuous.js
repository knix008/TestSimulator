// Continuous: Integrator (limits, external reset, external initial condition,
// state and saturation ports), Derivative, Transfer Fcn, State-Space,
// Zero-Pole, Transport Delay, Variable Transport Delay, PID Controller.
import { def, L, P, enumP, boolP, numP, S1, F, copy, tf2ss, poly, matvec, sat, at } from './util.js';

const G = 'continuous';
const RESET = [{ value: 'none', label: L('none', '없음') }, { value: 'rising', label: L('rising', '상승') }, { value: 'falling', label: L('falling', '하강') }, { value: 'either', label: L('either', '양쪽') }, { value: 'level', label: L('level', '레벨') }];
const fmtPoly = (s) => { const t = String(s || '').trim().replace(/^\[|\]$/g, '').trim().split(/[\s,]+/).filter(Boolean); if (!t.length) return '?'; const n = t.length - 1; return t.map((c, i) => { const p = n - i; const cc = c === '1' && p > 0 ? '' : c; return p === 0 ? c : p === 1 ? `${cc}s` : `${cc}s^${p}`; }).filter((x, i) => t[i] !== '0').join('+').replace(/\+-/g, '-') || '0'; };
const edge = (type, prev, cur) => {
  const rise = (prev < 0 && cur >= 0) || (prev === 0 && cur > 0);
  const fall = (prev > 0 && cur <= 0) || (prev === 0 && cur < 0);
  return type === 'rising' ? rise : type === 'falling' ? fall : type === 'either' ? rise || fall : false;
};

/** Shared linear state-space runtime: dx = A x + B u, y = C x + D u (column-major A n×n, B n×m, C p×n, D p×m). */
export function ssRuntime({ A, B, C, D, n, m, p, x0 }) {
  const direct = D.some((v) => v !== 0);
  const ux = (u) => { const v = u[0]; if (v.length === m) return v; if (v.length === 1) { const r = F(m); r.fill(v[0]); return r; } throw new Error(`The input width ${v.length} does not match the number of inputs ${m}.`); };
  return {
    ts: 0, nx: n, direct,
    x0: () => (x0 && x0.length === n ? Float64Array.from(x0) : x0 && x0.length === 1 ? F(n).fill(x0[0]) : F(n)),
    output(S, u, x) {
      const uv = direct ? ux(u) : null;
      const y = matvec(C, p, n, x);
      if (direct) for (let i = 0; i < p; i++) { let s = 0; for (let j = 0; j < m; j++) s += D[i + j * p] * uv[j]; y[i] += s; }
      return [y];
    },
    deriv(S, u, x, dx) {
      const uv = ux(u);
      for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += A[i + j * n] * x[j]; for (let j = 0; j < m; j++) s += B[i + j * n] * uv[j]; dx[i] = s; }
    },
  };
}
/** Transfer function runtime via controllable canonical form (scalar input / output). */
function tfRuntime(B, num, den, x0) {
  const r = tf2ss(num, den);
  if (!r.n) { const D = r.D; return { ts: 0, output: (S, u) => [Float64Array.from(u[0], (v) => D * v)] }; }
  return ssRuntime({ A: r.A, B: r.B, C: r.C, D: Float64Array.of(r.D), n: r.n, m: 1, p: 1, x0 });
}

export const BLOCKS = [
  def('Integrator', G, 'Integrator', '적분기', {
    desc: L('Integrates its input. Options: output limits, external reset, external initial condition, state and saturation ports.', '입력을 적분합니다. 출력 제한, 외부 리셋, 외부 초기 조건, 상태·포화 포트를 지원합니다.'),
    params: [
      enumP('ExternalReset', 'none', 'External reset', '외부 리셋', RESET),
      enumP('InitialConditionSource', 'internal', 'Initial condition source', '초기 조건 원천', [{ value: 'internal', label: L('internal', '내부') }, { value: 'external', label: L('external', '외부') }]),
      numP('InitialCondition', '0', 'Initial condition', '초기 조건'),
      boolP('LimitOutput', false, 'Limit output', '출력 제한'),
      numP('UpperSaturationLimit', 'inf', 'Upper saturation limit', '상한'),
      numP('LowerSaturationLimit', '-inf', 'Lower saturation limit', '하한'),
      boolP('ShowSaturationPort', false, 'Show saturation port', '포화 포트 표시', { tab: 'advanced' }),
      boolP('ShowStatePort', false, 'Show state port', '상태 포트 표시', { tab: 'advanced' }),
      P('AbsoluteTolerance', 'text', 'auto', 'Absolute tolerance', '절대 허용 오차', { tab: 'advanced' }),
    ],
    size: [40, 40],
    ports: (p) => {
      const r = String(p.ExternalReset || 'none') !== 'none', ic = String(p.InitialConditionSource || 'internal') === 'external';
      const sp = String(p.ShowSaturationPort) === 'on' && String(p.LimitOutput) === 'on', st = String(p.ShowStatePort) === 'on';
      return { in: 1 + (r ? 1 : 0) + (ic ? 1 : 0), out: 1 + (sp ? 1 : 0) + (st ? 1 : 0), inLabels: [], outLabels: [] };
    },
    icon: () => ({ frac: ['1', 's'] }),
    make(B) {
      const reset = B.opt('ExternalReset') || 'none', ext = B.opt('InitialConditionSource') === 'external';
      const lim = B.bool('LimitOutput');
      const up = lim ? B.arr('UpperSaturationLimit') : S1(Infinity), lo = lim ? B.arr('LowerSaturationLimit') : S1(-Infinity);
      const satPort = lim && B.bool('ShowSaturationPort'), statePort = B.bool('ShowStatePort');
      const iR = reset !== 'none' ? 1 : -1, iC = ext ? (iR > 0 ? 2 : 1) : -1;
      let ic = ext ? S1(0) : B.arr('InitialCondition');
      if (!ic.length) ic = S1(0);
      let n = ic.length;
      let prevR = null, first = true;
      const icAt = (u) => { const v = ext ? u[iC] || S1(0) : ic; return v; };
      const rt = {
        ts: 0, nx: n, widthFromInput: true,
        direct: [false, false, !statePort],
        setWidth(w) { if (ic.length === 1 || ext) { n = w; rt.nx = w; } },
        x0: () => { const x = F(n); for (let i = 0; i < n; i++) x[i] = sat(at(ic, i), at(lo, i), at(up, i)); return x; },
        init() { prevR = null; first = true; },
        output(S, u, x) {
          if (first && ext && S.major && !S.trial) { const v = icAt(u); for (let i = 0; i < n; i++) x[i] = at(v, i); first = false; }
          const y = F(n);
          for (let i = 0; i < n; i++) y[i] = lim ? sat(x[i], at(lo, i), at(up, i)) : x[i];
          const out = [y];
          if (satPort) out.push(Float64Array.from(y, (v, i) => (v >= at(up, i) ? 1 : v <= at(lo, i) ? -1 : 0)));
          if (statePort) out.push(Float64Array.from(x));
          return out;
        },
        deriv(S, u, x, dx) {
          const v = u[0];
          if (reset === 'level' && u[iR] && u[iR].some((r) => r !== 0)) { dx.fill(0); return; }
          for (let i = 0; i < n; i++) {
            let d = at(v, i);
            if (lim && ((x[i] >= at(up, i) && d > 0) || (x[i] <= at(lo, i) && d < 0))) d = 0;
            dx[i] = d;
          }
        },
        update(S, u, x) {
          first = false;
          if (iR > 0) {
            const r = u[iR] || S1(0);
            const cur = r[0];
            let fire = false;
            if (reset === 'level') fire = r.some((q) => q !== 0);
            else if (prevR !== null) fire = edge(reset, prevR, cur);
            prevR = cur;
            if (fire) { const v = icAt(u); for (let i = 0; i < n; i++) x[i] = at(v, i); }
          }
          if (lim) for (let i = 0; i < n; i++) x[i] = sat(x[i], at(lo, i), at(up, i));
        },
      };
      if (iR > 0 || lim) {
        rt.zc = (S, u, x) => {
          const z = [];
          if (iR > 0 && reset !== 'level') z.push((u[iR] || S1(0))[0]);
          if (lim) for (let i = 0; i < n; i++) { const a = at(up, i), b = at(lo, i); if (Number.isFinite(a)) z.push(x[i] - a); if (Number.isFinite(b)) z.push(x[i] - b); }
          return z;
        };
      }
      return rt;
    },
  }),
  def('Derivative', G, 'Derivative', '미분기', {
    desc: L('Approximates du/dt by the difference quotient of the last time steps.', '마지막 시간 스텝들의 차분으로 du/dt를 근사합니다.'),
    params: [numP('CoefficientInTFapproximation', 'inf', 'Coefficient c in the approximation s/(1/c·s + 1)', '근사 s/(1/c·s + 1)의 계수 c', { tab: 'advanced' })],
    size: [40, 40], icon: () => ({ text: 'du/dt' }),
    make() {
      let tp = null, up = null, dlast = null;
      return {
        ts: 0,
        init() { tp = null; up = null; dlast = null; },
        output(S, u) {
          const v = u[0];
          if (tp === null || !(S.t > tp)) return [dlast && dlast.length === v.length ? dlast : F(v.length)];
          const h = S.t - tp;
          return [Float64Array.from(v, (x, i) => (x - (up[i] ?? 0)) / h)];
        },
        update(S, u) {
          const v = u[0];
          if (tp !== null && S.t > tp) dlast = Float64Array.from(v, (x, i) => (x - (up[i] ?? 0)) / (S.t - tp));
          tp = S.t; up = Float64Array.from(v);
        },
      };
    },
  }),
  def('TransferFcn', G, 'Transfer Fcn', '전달 함수', {
    desc: L('Linear transfer function num(s)/den(s) (coefficients in descending powers of s).', '선형 전달 함수 num(s)/den(s) (s의 내림차순 계수).'),
    params: [P('Numerator', 'expr', '[1]', 'Numerator coefficients', '분자 계수'), P('Denominator', 'expr', '[1 1]', 'Denominator coefficients', '분모 계수'), P('AbsoluteTolerance', 'text', 'auto', 'Absolute tolerance', '절대 허용 오차', { tab: 'advanced' })],
    size: [60, 40], icon: (p) => ({ frac: [fmtPoly(p.Numerator ?? '[1]'), fmtPoly(p.Denominator ?? '[1 1]')] }),
    make(B) {
      const num = B.arr('Numerator'), den = B.arr('Denominator');
      if (!den.length || den.every((x) => x === 0)) B.err('The denominator must not be zero.');
      try { return tfRuntime(B, num, den); } catch (e) { return B.err(e.message); }
    },
  }),
  def('StateSpace', G, 'State-Space', '상태 공간', {
    desc: L("x' = Ax + Bu, y = Cx + Du with an initial state.", "x' = Ax + Bu, y = Cx + Du (초기 상태 포함)."),
    params: [P('A', 'expr', '1', 'A', 'A'), P('B', 'expr', '1', 'B', 'B'), P('C', 'expr', '1', 'C', 'C'), P('D', 'expr', '1', 'D', 'D'), P('InitialCondition', 'expr', '0', 'Initial conditions', '초기 조건')],
    size: [60, 40], icon: () => ({ text: "x' = Ax+Bu\ny = Cx+Du" }),
    make(Bk) {
      const A = Bk.mat('A'), Bm = Bk.mat('B'), C = Bk.mat('C'), D = Bk.mat('D');
      const n = A.m;
      if (A.m !== A.n) Bk.err('A must be square.');
      const m = n ? Bm.n : D.n, p = n ? C.m : D.m;
      if (n && (Bm.m !== n || C.n !== n)) Bk.err('The sizes of A, B and C do not agree.');
      const Dm = D.re.length ? D.re : F(p * m);
      if (Dm.length !== p * m) Bk.err(`D must be ${p}×${m}.`);
      if (!n) return { ts: 0, output: (S, u) => { const v = u[0]; const y = F(p); for (let i = 0; i < p; i++) { let s = 0; for (let j = 0; j < m; j++) s += Dm[i + j * p] * at(v, j); y[i] = s; } return [y]; } };
      return ssRuntime({ A: A.re, B: Bm.re, C: C.re, D: Dm, n, m, p, x0: Bk.arr('InitialCondition') });
    },
  }),
  def('ZeroPole', G, 'Zero-Pole', '영점-극점', {
    desc: L('Transfer function given by zeros, poles and gain: K·Π(s − z)/Π(s − p).', '영점·극점·이득으로 주어진 전달 함수: K·Π(s − z)/Π(s − p).'),
    params: [P('Zeros', 'expr', '[1]', 'Zeros', '영점'), P('Poles', 'expr', '[0 -1]', 'Poles', '극점'), P('Gain', 'expr', '[1]', 'Gain', '이득')],
    size: [70, 40], icon: (p) => ({ frac: [`(s-${String(p.Zeros ?? '1').replace(/[[\]]/g, '')})`, `(s-${String(p.Poles ?? '[0 -1]').replace(/[[\]]/g, '').trim().split(/[\s,]+/).join(')(s-')})`] }),
    make(B) {
      const z = B.mat('Zeros'), pz = B.mat('Poles'), k = B.num('Gain', 1);
      const num = poly(Array.from(z.re), z.im ? Array.from(z.im) : null).map((c) => c * k);
      const den = poly(Array.from(pz.re), pz.im ? Array.from(pz.im) : null);
      try { return tfRuntime(B, num, den); } catch (e) { return B.err(e.message); }
    },
  }),
  def('TransportDelay', G, 'Transport Delay', '전달 지연', {
    desc: L('Delays the input by a fixed time (interpolating between recorded steps).', '입력을 일정 시간 지연합니다 (기록한 스텝 사이 보간).'),
    params: [numP('DelayTime', '1', 'Time delay', '지연 시간'), numP('InitialOutput', '0', 'Initial output', '초기 출력'), numP('BufferSize', '1024', 'Initial buffer size', '초기 버퍼 크기', { tab: 'advanced' })],
    size: [50, 40], icon: () => ({ text: 'e^-sT' }),
    make(B) {
      const T = B.num('DelayTime', 1), ic = B.arr('InitialOutput');
      if (T < 0) B.err('The delay must not be negative.');
      return delayRuntime(() => T, ic, T > 0 ? false : true);
    },
  }),
  def('VariableTransportDelay', G, 'Variable Transport Delay', '가변 전달 지연', {
    desc: L('Delays input 1 by the time given at input 2 (bounded by the maximum delay).', '입력 1을 입력 2의 시간만큼 지연합니다 (최대 지연으로 제한).'),
    params: [numP('MaximumDelay', '10', 'Maximum delay', '최대 지연'), numP('InitialOutput', '0', 'Initial output', '초기 출력')],
    size: [60, 40], ports: { in: 2, out: 1 }, icon: () => ({ text: 'T(u)' }),
    make(B) {
      const mx = B.num('MaximumDelay', 10), ic = B.arr('InitialOutput');
      const r = delayRuntime((u) => sat((u[1] || S1(0))[0], 0, mx), ic, false);
      r.direct = [false, true];
      return r;
    },
  }),
  def('PIDController', G, 'PID Controller', 'PID 제어기', {
    desc: L('Continuous PID: P + I/s + D·N·s/(s + N) (parallel) or P·(1 + I/s + D·N·s/(s + N)) (ideal), optional output limits with clamping anti-windup.', '연속 PID: P + I/s + D·N·s/(s + N) (병렬) 또는 P·(1 + I/s + D·N·s/(s + N)) (이상형), 출력 제한과 클램핑 와인드업 방지.'),
    params: [
      enumP('Controller', 'PID', 'Controller', '제어기', ['PID', 'PI', 'PD', 'P', 'I']),
      enumP('Form', 'Parallel', 'Form', '형태', [{ value: 'Parallel', label: L('Parallel', '병렬') }, { value: 'Ideal', label: L('Ideal', '이상형') }]),
      numP('P', '1', 'Proportional (P)', '비례 (P)'), numP('I', '1', 'Integral (I)', '적분 (I)'), numP('D', '0', 'Derivative (D)', '미분 (D)'), numP('N', '100', 'Filter coefficient (N)', '필터 계수 (N)'),
      numP('InitialConditionForIntegrator', '0', 'Integrator initial condition', '적분기 초기 조건', { tab: 'advanced' }),
      numP('InitialConditionForFilter', '0', 'Filter initial condition', '필터 초기 조건', { tab: 'advanced' }),
      boolP('LimitOutput', false, 'Limit output', '출력 제한', { tab: 'advanced' }),
      numP('UpperSaturationLimit', 'inf', 'Upper limit', '상한', { tab: 'advanced' }), numP('LowerSaturationLimit', '-inf', 'Lower limit', '하한', { tab: 'advanced' }),
    ],
    size: [60, 40], icon: (p) => ({ text: p.Controller || 'PID' }),
    make(B) { return pidContinuous(B); },
  }),
];

function delayRuntime(delayOf, ic, direct) {
  let ts = [], us = [], t0 = 0;
  const icv = ic.length ? ic : S1(0);
  return {
    ts: 0, direct,
    init(S) { ts = []; us = []; t0 = S ? S.t : 0; if (S && S.run) t0 = S.run.tStart ?? S.t; },
    output(S, u) {
      const T = delayOf(u);
      if (T <= 0 || !ts.length && T <= 0) return [copy(u[0])];
      const tq = S.t - T;
      if (!ts.length || tq < ts[0] || tq < t0) return [copy(icv)];
      let lo = 0, hi = ts.length - 1;
      if (tq >= ts[hi]) {
        // between the last recorded step and now: interpolate towards the current input
        const tl = ts[hi], ul = us[hi], v = u[0];
        if (!(S.t > tl)) return [Float64Array.from(ul)];
        const f = (tq - tl) / (S.t - tl);
        return [Float64Array.from(ul, (x, i) => x + f * ((v[i] ?? x) - x))];
      }
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= tq) lo = m; else hi = m; }
      const f = (tq - ts[lo]) / ((ts[hi] - ts[lo]) || 1);
      return [Float64Array.from(us[lo], (x, i) => x + f * ((us[hi][i] ?? x) - x))];
    },
    update(S, u) {
      if (ts.length && S.t <= ts[ts.length - 1]) { us[us.length - 1] = Float64Array.from(u[0]); return; }
      ts.push(S.t); us.push(Float64Array.from(u[0]));
      const T = delayOf(u);
      // drop history older than needed (keep a margin)
      let k = 0; while (k + 2 < ts.length && ts[k + 1] < S.t - T - 1e-9) k++;
      if (k > 256) { ts.splice(0, k); us.splice(0, k); }
    },
    nextHit(t) { const T = delayOf([S1(0), S1(0)]); const tb = t0 + T; return t < tb ? tb : Infinity; },
  };
}

function pidContinuous(B) {
  const kind = B.opt('Controller') || 'PID', ideal = B.opt('Form') === 'Ideal';
  const P0 = B.num('P', 1), I0 = /I/.test(kind) ? B.num('I', 1) : 0, D0 = /D/.test(kind) ? B.num('D', 0) : 0, N = B.num('N', 100);
  const kp = kind === 'I' ? 0 : P0, ki = ideal ? P0 * I0 : I0, kd = ideal ? P0 * D0 : D0;
  const lim = B.bool('LimitOutput'), up = lim ? B.num('UpperSaturationLimit', Infinity) : Infinity, lo = lim ? B.num('LowerSaturationLimit', -Infinity) : -Infinity;
  const xi0 = B.num('InitialConditionForIntegrator', 0), xf0 = B.num('InitialConditionForFilter', 0);
  const useD = kd !== 0;
  const raw = (e, x) => kp * e + x[0] + (useD ? kd * N * (e - x[1]) : 0);
  return {
    ts: 0, nx: useD ? 2 : 1,
    x0: () => (useD ? Float64Array.of(xi0, xf0) : Float64Array.of(xi0)),
    output(S, u, x) { const e = u[0][0]; return [S1(sat(raw(e, x), lo, up))]; },
    deriv(S, u, x, dx) {
      const e = u[0][0];
      const r = raw(e, x);
      const windup = (r > up && ki * e > 0) || (r < lo && ki * e < 0);
      dx[0] = windup ? 0 : ki * e;
      if (useD) dx[1] = N * (e - x[1]);
    },
    direct: kp !== 0 || useD,
  };
}
