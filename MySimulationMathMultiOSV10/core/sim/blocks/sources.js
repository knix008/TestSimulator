// Sources: Constant, Step, Ramp, Sine Wave, Pulse Generator, Clock, Digital
// Clock, Signal Generator, Chirp, random sources, Band-Limited White Noise,
// From Workspace, Repeating Sequence (+ Stair / Interpolated), Signal Builder,
// Counters, Ground (and the root In port entry). Sources with jumps report
// them through nextHit so variable-step solvers land on them.
import { def, L, P, enumP, boolP, numP, TS, S1, F, copy, tsOf, rng, interp1, withDims } from './util.js';
import { MError, isStruct, isTensor } from '../../value.js';

const G = 'sources';
const at = (a, i) => (a.length === 1 ? a[0] : a[i]);
const widthOf = (...as) => Math.max(1, ...as.map((a) => a.length));
const vec = (n, f) => { const y = F(n); for (let i = 0; i < n; i++) y[i] = f(i); return y; };
const tsDisc = (B, d) => { const t = tsOf(B, d); return t; };
const fmt = (s) => String(s).length > 10 ? `${String(s).slice(0, 9)}…` : String(s);
/** Next multiple of `period` (with offset) strictly after t. */
const nextGrid = (t, period, off = 0) => { let k = Math.floor((t - off) / period + 1e-9) + 1; let x = off + k * period; if (x <= t + 1e-12 * Math.max(1, Math.abs(t))) x += period; return x; };

/** Workspace data → { t: number[], cols: Float64Array[] (one per column) } */
function workspaceData(v, what) {
  if (isStruct(v)) {
    const r = v.data[0];
    const time = r.time || r.Time;
    let vals = r.Data || r.data || null;
    if (!vals && r.signals) { const s = r.signals.data ? r.signals.data[0] : null; vals = s && (s.values || s.Values); }
    if (!time || !vals) throw new MError('sim:fromws:format', `${what}: a struct needs the fields time and signals.values (or Time and Data).`);
    return split(time.re, vals);
  }
  if (!isTensor(v) || v.dims.length !== 2 || v.dims[1] < 2) throw new MError('sim:fromws:format', `${what}: expected a matrix [t, u1, u2, …] or a struct with time and values.`);
  const [m, n] = v.dims;
  return { t: Array.from(v.re.subarray(0, m)), cols: Array.from({ length: n - 1 }, (_, j) => v.re.subarray((j + 1) * m, (j + 2) * m)) };
}
function split(time, vals) {
  const m = time.length;
  const n = vals.re.length / (m || 1);
  return { t: Array.from(time), cols: Array.from({ length: Math.round(n) }, (_, j) => vals.re.subarray(j * m, (j + 1) * m)) };
}
function lookupData(d, t, mode, extrap) {
  const tt = d.t, N = tt.length;
  const y = F(d.cols.length);
  if (!N) return y;
  if (t > tt[N - 1]) {
    for (let c = 0; c < d.cols.length; c++) {
      const col = d.cols[c];
      y[c] = extrap === 'zero' ? 0 : extrap === 'hold' || N < 2 ? col[N - 1] : col[N - 1] + (col[N - 1] - col[N - 2]) / ((tt[N - 1] - tt[N - 2]) || 1) * (t - tt[N - 1]);
    }
    return y;
  }
  let lo = 0, hi = N - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tt[m] <= t) lo = m; else hi = m; }
  for (let c = 0; c < d.cols.length; c++) {
    const col = d.cols[c];
    if (t <= tt[0]) y[c] = col[0];
    else if (mode === 'hold') y[c] = t >= tt[hi] ? col[hi] : col[lo];
    else { const f = (t - tt[lo]) / ((tt[hi] - tt[lo]) || 1); y[c] = col[lo] + f * (col[hi] - col[lo]); }
  }
  return y;
}

export const BLOCKS = [
  def('Constant', G, 'Constant', '상수', {
    desc: L('Outputs a constant value (scalar, vector or matrix).', '상수 값(스칼라·벡터·행렬)을 내보냅니다.'),
    params: [P('Value', 'expr', '1', 'Constant value', '상수 값', { num: true }), boolP('VectorParams1D', true, 'Interpret vector parameters as 1-D', '벡터 파라미터를 1-D로 해석'), TS('inf')],
    size: [40, 30], ports: { in: 0, out: 1 }, icon: (p) => ({ text: fmt(p.Value ?? '1') }),
    make(B) {
      const m = B.mat('Value');
      const y = withDims(Float64Array.from(m.re), m.dims.length === 2 && m.dims[0] > 1 && m.dims[1] > 1 ? m.dims : null);
      if (!y.length) B.err('The constant value is empty.');
      return { ts: tsOf(B, Infinity), output: () => [y], tune(B2) { const m2 = B2.mat('Value'); const y2 = Float64Array.from(m2.re); if (m2.dims[0] > 1 && m2.dims[1] > 1) y2.dims = m2.dims; this.output = () => [y2]; } };
    },
  }),
  def('Step', G, 'Step', '계단', {
    desc: L('Steps from the initial to the final value at the step time.', '스텝 시간에 초기값에서 최종값으로 바뀝니다.'),
    params: [numP('Time', '1', 'Step time', '스텝 시간', { step: 0.1 }), numP('Before', '0', 'Initial value', '초기값'), numP('After', '1', 'Final value', '최종값'), TS('0')],
    size: [40, 40], ports: { in: 0, out: 1 }, icon: () => ({ glyph: 'step' }),
    make(B) {
      const T = B.num('Time', 1), a = B.arr('Before'), b = B.arr('After'), n = widthOf(a, b);
      const y0 = vec(n, (i) => at(a, i)), y1 = vec(n, (i) => at(b, i));
      return { ts: tsOf(B, 0), output: (S) => [S.t >= T ? y1 : y0], nextHit: (t) => (t < T ? T : Infinity) };
    },
  }),
  def('Ramp', G, 'Ramp', '램프', {
    desc: L('A signal that rises with a constant slope from the start time.', '시작 시간부터 일정한 기울기로 증가하는 신호.'),
    params: [numP('slope', '1', 'Slope', '기울기'), numP('start', '0', 'Start time', '시작 시간'), numP('InitialOutput', '0', 'Initial output', '초기 출력')],
    size: [40, 40], ports: { in: 0, out: 1 }, icon: () => ({ glyph: 'ramp' }),
    make(B) {
      const k = B.arr('slope'), t0 = B.num('start', 0), y0 = B.arr('InitialOutput'), n = widthOf(k, y0);
      return { ts: 0, output: (S) => [vec(n, (i) => at(y0, i) + (S.t > t0 ? at(k, i) * (S.t - t0) : 0))], nextHit: (t) => (t < t0 ? t0 : Infinity) };
    },
  }),
  def('SineWave', G, 'Sine Wave', '사인파', {
    desc: L('Amplitude·sin(Frequency·t + Phase) + Bias (frequency in rad/s).', '진폭·sin(주파수·t + 위상) + 바이어스 (주파수 rad/s).'),
    params: [numP('Amplitude', '1', 'Amplitude', '진폭'), numP('Bias', '0', 'Bias', '바이어스'), numP('Frequency', '1', 'Frequency (rad/sec)', '주파수 (rad/s)'), numP('Phase', '0', 'Phase (rad)', '위상 (rad)'), TS('0')],
    size: [40, 40], ports: { in: 0, out: 1 }, icon: () => ({ glyph: 'sine' }),
    make(B) {
      const A = B.arr('Amplitude'), b = B.arr('Bias'), w = B.arr('Frequency'), ph = B.arr('Phase'), n = widthOf(A, b, w, ph);
      return { ts: tsOf(B, 0), output: (S) => [vec(n, (i) => at(A, i) * Math.sin(at(w, i) * S.t + at(ph, i)) + at(b, i))] };
    },
  }),
  def('PulseGenerator', G, 'Pulse Generator', '펄스 발생기', {
    desc: L('Rectangular pulses: amplitude, period, pulse width (% of period) and phase delay.', '사각 펄스: 진폭, 주기, 펄스 폭(주기의 %), 위상 지연.'),
    params: [enumP('PulseType', 'time', 'Pulse type', '펄스 종류', [{ value: 'time', label: L('Time based', '시간 기반') }, { value: 'sample', label: L('Sample based', '샘플 기반') }]), numP('Amplitude', '1', 'Amplitude', '진폭'), numP('Period', '10', 'Period', '주기'), numP('PulseWidth', '5', 'Pulse width (% of period)', '펄스 폭 (주기의 %)'), numP('PhaseDelay', '0', 'Phase delay', '위상 지연'), TS('1')],
    size: [40, 40], ports: { in: 0, out: 1 }, icon: () => ({ glyph: 'pulse' }),
    make(B) {
      const A = B.arr('Amplitude'), T = B.num('Period', 10), pw = B.num('PulseWidth', 5), d = B.num('PhaseDelay', 0);
      if (!(T > 0)) B.err('The period must be positive.');
      const sample = B.opt('PulseType') === 'sample';
      const Ts = sample ? B.num('SampleTime', 1) : 0;
      const P0 = sample ? T * Ts : T, W = sample ? pw * Ts : (pw / 100) * T, D = sample ? d * Ts : d;
      const on = vec(A.length, (i) => A[i]), off = F(A.length);
      const level = (t) => { if (t < D) return false; const ph = (t - D) % P0; return ph < W - 1e-12 * Math.max(1, P0); };
      return {
        ts: sample ? [Ts, 0] : 0,
        output: (S) => [level(S.t) ? on : off],
        nextHit(t) { if (sample) return Infinity; if (t < D) return D; const k = Math.floor((t - D) / P0 + 1e-12); const a = D + k * P0 + W, b = D + (k + 1) * P0; return a > t + 1e-12 * Math.max(1, t) ? a : b; },
      };
    },
  }),
  def('Clock', G, 'Clock', '시계', {
    desc: L('Outputs the current simulation time.', '현재 시뮬레이션 시간을 내보냅니다.'),
    params: [boolP('DisplayTime', false, 'Display time', '시간 표시'), numP('Decimation', '10', 'Decimation', '솎아내기', { min: 1, step: 1 })],
    size: [40, 40], ports: { in: 0, out: 1 }, icon: () => ({ glyph: 'clock' }),
    make: () => ({ ts: 0, output: (S) => [S1(S.t)] }),
  }),
  def('DigitalClock', G, 'Digital Clock', '디지털 시계', {
    desc: L('Outputs the simulation time at the specified sample rate.', '지정한 샘플 주기로 시뮬레이션 시간을 내보냅니다.'),
    params: [TS('1')], size: [60, 30], ports: { in: 0, out: 1 }, icon: () => ({ text: '12:34' }),
    make: (B) => { const ts = tsOf(B, [1, 0]); return { ts: ts === -1 ? [1, 0] : ts, output: (S) => [S1(S.t)] }; },
  }),
  def('SignalGenerator', G, 'Signal Generator', '신호 발생기', {
    desc: L('Sine, square, sawtooth or random wave of given amplitude and frequency.', '진폭과 주파수를 정한 사인·사각·톱니·랜덤 파형.'),
    params: [enumP('WaveForm', 'sine', 'Wave form', '파형', [{ value: 'sine', label: L('sine', '사인') }, { value: 'square', label: L('square', '사각') }, { value: 'sawtooth', label: L('sawtooth', '톱니') }, { value: 'random', label: L('random', '랜덤') }]), numP('Amplitude', '1', 'Amplitude', '진폭'), numP('Frequency', '1', 'Frequency', '주파수'), enumP('Units', 'rad/sec', 'Units', '단위', ['rad/sec', 'Hertz'])],
    size: [40, 40], ports: { in: 0, out: 1 }, icon: (p) => ({ glyph: { square: 'pulse', sawtooth: 'sawtooth', random: 'random' }[p.WaveForm] || 'sine' }),
    make(B) {
      const A = B.num('Amplitude', 1), f0 = B.num('Frequency', 1), hz = B.opt('Units') === 'Hertz', wf = B.opt('WaveForm');
      const fhz = hz ? f0 : f0 / (2 * Math.PI), P0 = fhz > 0 ? 1 / fhz : Infinity;
      let r = rng(1), held = 0, nextT = 0;
      return {
        ts: 0,
        init() { r = rng(1); held = 0; nextT = 0; },
        output(S) {
          const t = S.t, ph = Number.isFinite(P0) ? ((t / P0) % 1 + 1) % 1 : 0;
          switch (wf) {
            case 'square': return [S1(ph < 0.5 ? A : -A)];
            case 'sawtooth': return [S1(A * (2 * ph - 1))];
            case 'random': return [S1(A * held)];
            default: return [S1(A * Math.sin(2 * Math.PI * fhz * t))];
          }
        },
        update(S) { if (wf === 'random' && S.t >= nextT) { held = 2 * r.u() - 1; nextT = S.t + (Number.isFinite(P0) ? P0 / 2 : 1); } },
        nextHit: (t) => (wf === 'square' || wf === 'sawtooth') && Number.isFinite(P0) ? nextGrid(t, wf === 'square' ? P0 / 2 : P0) : Infinity,
      };
    },
  }),
  def('Chirp', G, 'Chirp Signal', '처프 신호', {
    desc: L('A sine whose frequency rises linearly from the initial frequency (Hz) to the target frequency at the target time.', '주파수가 초기 주파수(Hz)에서 목표 시간의 목표 주파수까지 선형으로 증가하는 사인파.'),
    params: [numP('f1', '0.1', 'Initial frequency (Hz)', '초기 주파수 (Hz)'), numP('T', '100', 'Target time (s)', '목표 시간 (s)'), numP('f2', '1', 'Frequency at target time (Hz)', '목표 시간의 주파수 (Hz)')],
    size: [40, 40], ports: { in: 0, out: 1 }, icon: () => ({ glyph: 'chirp' }),
    make(B) { const f1 = B.num('f1', 0.1), T = B.num('T', 100), f2 = B.num('f2', 1); const k = (f2 - f1) / (T || 1); return { ts: 0, output: (S) => [S1(Math.sin(2 * Math.PI * (f1 + 0.5 * k * S.t) * S.t))] }; },
  }),
  def('RandomNumber', G, 'Random Number', '난수', {
    desc: L('Normally distributed random numbers held for each sample time (repeatable with the seed).', '샘플 시간마다 정규 분포 난수를 냅니다 (시드로 재현 가능).'),
    params: [numP('Mean', '0', 'Mean', '평균'), numP('Variance', '1', 'Variance', '분산'), numP('Seed', '0', 'Seed', '시드'), TS('0.1')],
    size: [40, 40], ports: { in: 0, out: 1 }, icon: () => ({ glyph: 'random' }),
    make(B) {
      const m = B.arr('Mean'), v = B.arr('Variance'), seed = B.arr('Seed'), n = widthOf(m, v, seed);
      let gens, y;
      const draw = () => vec(n, (i) => at(m, i) + Math.sqrt(Math.max(0, at(v, i))) * gens[i].n());
      return { ts: tsOf(B, [0.1, 0]), direct: false, init() { gens = Array.from({ length: n }, (_, i) => rng(at(seed, i) + i * 7919 + 1)); y = draw(); }, output: () => [y], update() { y = draw(); } };
    },
  }),
  def('UniformRandomNumber', G, 'Uniform Random Number', '균등 난수', {
    desc: L('Uniformly distributed random numbers in [Minimum, Maximum] held for each sample time.', '[최소, 최대] 균등 분포 난수를 샘플 시간마다 냅니다.'),
    params: [numP('Minimum', '-1', 'Minimum', '최소'), numP('Maximum', '1', 'Maximum', '최대'), numP('Seed', '0', 'Seed', '시드'), TS('0.1')],
    size: [40, 40], ports: { in: 0, out: 1 }, icon: () => ({ glyph: 'noise' }),
    make(B) {
      const lo = B.arr('Minimum'), hi = B.arr('Maximum'), seed = B.arr('Seed'), n = widthOf(lo, hi, seed);
      let gens, y;
      const draw = () => vec(n, (i) => at(lo, i) + (at(hi, i) - at(lo, i)) * gens[i].u());
      return { ts: tsOf(B, [0.1, 0]), direct: false, init() { gens = Array.from({ length: n }, (_, i) => rng(at(seed, i) + i * 7919 + 1)); y = draw(); }, output: () => [y], update() { y = draw(); } };
    },
  }),
  def('BandLimitedWhiteNoise', G, 'Band-Limited White Noise', '대역 제한 백색 잡음', {
    desc: L('White noise of the given power spectral density for continuous systems (normal deviates scaled by sqrt(Cov/Ts)).', '연속 시스템용 지정 전력 스펙트럼 밀도의 백색 잡음 (정규 난수 × sqrt(Cov/Ts)).'),
    params: [numP('Cov', '0.1', 'Noise power', '잡음 전력'), numP('Ts', '0.1', 'Sample time', '샘플 시간'), numP('seed', '23341', 'Seed', '시드')],
    size: [40, 40], ports: { in: 0, out: 1 }, icon: () => ({ glyph: 'noise' }),
    make(B) {
      const cov = B.arr('Cov'), Ts = B.num('Ts', 0.1), seed = B.arr('seed'), n = widthOf(cov, seed);
      if (!(Ts > 0)) B.err('The sample time must be positive.');
      let gens, y;
      const draw = () => vec(n, (i) => Math.sqrt(Math.max(0, at(cov, i)) / Ts) * gens[i].n());
      return { ts: [Ts, 0], direct: false, init() { gens = Array.from({ length: n }, (_, i) => rng(at(seed, i) + i * 104729 + 1)); y = draw(); }, output: () => [y], update() { y = draw(); } };
    },
  }),
  def('FromWorkspace', G, 'From Workspace', '작업 공간에서', {
    desc: L('Reads a signal from a workspace variable: a matrix [t, u1, u2, …] or a struct with time and values.', '작업 공간 변수에서 신호를 읽습니다: 행렬 [t, u1, u2, …] 또는 time과 values가 있는 구조체.'),
    params: [P('VariableName', 'expr', 'simin', 'Data', '데이터'), boolP('Interpolate', true, 'Interpolate data', '데이터 보간'), enumP('OutputAfterFinalValue', 'Extrapolation', 'Form output after final data value by', '마지막 데이터 이후 출력', ['Extrapolation', 'Setting to zero', 'Holding final value']), TS('0')],
    size: [70, 30], ports: { in: 0, out: 1 }, icon: (p) => ({ text: fmt(p.VariableName || 'simin') }),
    make(B) {
      const d = workspaceData(B.val('VariableName'), B.path);
      const mode = B.bool('Interpolate') ? 'linear' : 'hold';
      const ex = { Extrapolation: 'linear', 'Setting to zero': 'zero', 'Holding final value': 'hold' }[B.opt('OutputAfterFinalValue')] || 'linear';
      return { ts: tsOf(B, 0), output: (S) => [lookupData(d, S.t, mode, ex)], nextHit(t) { if (mode === 'linear') return Infinity; for (const x of d.t) if (x > t + 1e-12 * Math.max(1, Math.abs(t))) return x; return Infinity; } };
    },
  }),
  def('RepeatingSequence', G, 'Repeating Sequence', '반복 시퀀스', {
    desc: L('A periodic piecewise-linear signal through the given time / output values.', '주어진 시간/출력 값을 지나는 주기적인 구간 선형 신호.'),
    params: [P('rep_seq_t', 'expr', '[0 2]', 'Time values', '시간 값'), P('rep_seq_y', 'expr', '[0 2]', 'Output values', '출력 값')],
    size: [40, 40], ports: { in: 0, out: 1 }, icon: () => ({ glyph: 'sawtooth' }),
    make(B) {
      const tt = B.arr('rep_seq_t'), yy = B.arr('rep_seq_y');
      if (tt.length !== yy.length || tt.length < 2) B.err('Time and output values must have the same length (at least 2).');
      const P0 = tt[tt.length - 1] - tt[0];
      if (!(P0 > 0)) B.err('The time values must increase.');
      const phase = (t) => tt[0] + (((t - tt[0]) % P0) + P0) % P0;
      return {
        ts: 0, output: (S) => [S1(interp1(tt, yy, phase(S.t), 'linear', 'clip'))],
        nextHit(t) { const p = phase(t), base = t - (p - tt[0]); for (const x of tt) if (base + x - tt[0] > t + 1e-12 * Math.max(1, Math.abs(t))) return base + x - tt[0]; return base + P0; },
      };
    },
  }),
  def('RepeatingSequenceStair', G, 'Repeating Sequence Stair', '반복 계단 시퀀스', {
    desc: L('Outputs the values of a vector one per sample time, repeating.', '벡터의 값을 샘플 시간마다 하나씩 반복해서 내보냅니다.'),
    params: [P('OutValues', 'expr', '[3 1 4 2 1]', 'Vector of output values', '출력 값 벡터'), TS('-1')],
    size: [40, 40], ports: { in: 0, out: 1 }, icon: () => ({ glyph: 'quantizer' }),
    make(B) {
      const v = B.arr('OutValues');
      if (!v.length) B.err('The vector of output values is empty.');
      let k = 0;
      const ts = tsOf(B, -1);
      return { ts: ts === -1 ? [1, 0] : ts, direct: false, init() { k = 0; }, output: () => [S1(v[k % v.length])], update() { k++; } };
    },
  }),
  def('RepeatingSequenceInterpolated', G, 'Repeating Sequence Interpolated', '반복 보간 시퀀스', {
    desc: L('A periodic sequence sampled at the given rate, interpolated between breakpoints.', '주어진 주기로 샘플링한 주기 시퀀스 (중단점 사이 보간).'),
    params: [P('OutValues', 'expr', '[3 1 4 2 1]', 'Output values', '출력 값'), P('TimeValues', 'expr', '[0 0.1 0.5 0.6 1]', 'Time values', '시간 값'), enumP('LookUpMeth', 'Interpolation-Use End Values', 'Lookup method', '룩업 방법', ['Interpolation-Use End Values', 'Use Input Below', 'Use Input Nearest', 'Use Input Above']), TS('0.01')],
    size: [40, 40], ports: { in: 0, out: 1 }, icon: () => ({ glyph: 'sawtooth' }),
    make(B) {
      const tt = B.arr('TimeValues'), yy = B.arr('OutValues');
      if (tt.length !== yy.length || tt.length < 2) B.err('Time and output values must have the same length (at least 2).');
      const P0 = tt[tt.length - 1] - tt[0];
      const meth = { 'Use Input Below': 'below', 'Use Input Nearest': 'nearest', 'Use Input Above': 'above' }[B.opt('LookUpMeth')] || 'linear';
      return { ts: tsOf(B, [0.01, 0]), output: (S) => [S1(interp1(tt, yy, tt[0] + ((((S.t - tt[0]) % P0) + P0) % P0), meth, 'clip'))] };
    },
  }),
  def('SignalBuilder', G, 'Signal Builder', '신호 빌더', {
    desc: L('Piecewise-linear signals through time / value points (one row of values per output element).', '시간/값 점을 지나는 구간 선형 신호 (출력 원소마다 값 한 행).'),
    params: [P('Time', 'expr', '[0 1 1 5 5 10]', 'Time points', '시간 점'), P('Values', 'expr', '[0 0 1 1 0 0]', 'Values (one row per signal)', '값 (신호마다 한 행)'), enumP('AfterFinal', 'hold', 'After the last point', '마지막 점 이후', [{ value: 'hold', label: L('Hold final value', '마지막 값 유지') }, { value: 'zero', label: L('Zero', '0') }, { value: 'linear', label: L('Extrapolate', '외삽') }])],
    size: [60, 40], ports: { in: 0, out: 1 }, icon: () => ({ glyph: 'step', text: 'builder' }),
    make(B) {
      const tt = B.arr('Time'), vm = B.mat('Values');
      const m = vm.n === tt.length ? vm.m : vm.m === tt.length ? vm.n : 0;
      if (!m) B.err('The number of value columns must equal the number of time points.');
      const byRow = vm.n === tt.length;
      const cols = Array.from({ length: m }, (_, r) => vec(tt.length, (j) => (byRow ? vm.re[r + j * vm.m] : vm.re[j + r * vm.m])));
      const d = { t: Array.from(tt), cols };
      const ex = B.opt('AfterFinal');
      return {
        ts: 0, output: (S) => [lookupData(d, S.t, 'linear', ex === 'linear' ? 'linear' : ex)],
        nextHit(t) { for (const x of d.t) if (x > t + 1e-12 * Math.max(1, Math.abs(t))) return x; return Infinity; },
      };
    },
  }),
  def('CounterLimited', G, 'Counter Limited', '제한 카운터', {
    desc: L('Counts up by one each sample time and wraps to zero after the upper limit.', '샘플 시간마다 1씩 증가하며 상한 다음에 0으로 돌아갑니다.'),
    params: [numP('uplimit', '7', 'Upper limit', '상한', { min: 0, step: 1 }), TS('1')],
    size: [40, 40], ports: { in: 0, out: 1 }, icon: (p) => ({ text: `0..${p.uplimit || 7}` }),
    make(B) { const lim = Math.max(0, B.int('uplimit', 7)); let k = 0; const ts = tsOf(B, [1, 0]); return { ts: ts === -1 ? [1, 0] : ts, direct: false, init() { k = 0; }, output: () => [S1(k)], update() { k = k >= lim ? 0 : k + 1; } }; },
  }),
  def('CounterFreeRunning', G, 'Counter Free-Running', '자유 실행 카운터', {
    desc: L('Counts up each sample time and wraps after 2^bits − 1.', '샘플 시간마다 증가하고 2^비트 − 1 다음에 돌아갑니다.'),
    params: [numP('NumBits', '16', 'Number of bits', '비트 수', { min: 1, step: 1 }), TS('1')],
    size: [40, 40], ports: { in: 0, out: 1 }, icon: () => ({ text: 'cnt' }),
    make(B) { const lim = 2 ** Math.max(1, Math.min(52, B.int('NumBits', 16))) - 1; let k = 0; const ts = tsOf(B, [1, 0]); return { ts: ts === -1 ? [1, 0] : ts, direct: false, init() { k = 0; }, output: () => [S1(k)], update() { k = k >= lim ? 0 : k + 1; } }; },
  }),
  def('Ground', G, 'Ground', '접지', {
    desc: L('Outputs zero (grounds an unused input).', '0을 내보냅니다 (쓰지 않는 입력을 접지).'),
    size: [24, 24], ports: { in: 0, out: 1 }, icon: () => ({ glyph: 'ground' }), hideName: true,
    make: () => ({ ts: Infinity, output: () => [S1(0)] }),
  }),
];

export const LIBRARY_EXTRA = [
  { id: 'In1', type: 'Inport', group: G, label: L('In1', '입력 1'), params: { Port: '1' }, desc: L('Model input port (external input).', '모델 입력 포트 (외부 입력).') },
];

export { workspaceData, lookupData, nextGrid, copy, tsDisc };
