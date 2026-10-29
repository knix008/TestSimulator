// Signal Attributes: Data Type Conversion, Signal Specification, Width, Rate
// Transition, IC, Probe; and Model Verification: Assertion and the Check
// Static / Dynamic Range and Bound blocks (checked at major steps in log()).
import { def, L, P, enumP, boolP, numP, TS, S1, F, copy, castTo, tsOf, isBus, dimsOfSig } from './util.js';
import { MError } from '../../value.js';

const G = 'attributes';
const V = 'verification';
const noBus = (u) => { if (isBus(u)) throw new MError('sim:attributes:bus', 'A bus signal is not supported by this block.'); return u; };
const INT_BITS = { int8: [8, true], uint8: [8, false], int16: [16, true], uint16: [16, false], int32: [32, true], uint32: [32, false] };
const ROUNDING = { Floor: 'floor', Ceiling: 'ceil', Nearest: 'nearest', Round: 'nearest', Zero: 'zero', Simplest: 'zero', Convergent: 'nearest' };

/** Integer cast with wrap-around instead of saturation. */
function wrapTo(dtype, x, round) {
  const ib = INT_BITS[dtype];
  if (!ib) return castTo(dtype, x, round);
  if (!Number.isFinite(x)) return castTo(dtype, x, round);
  const r = round === 'floor' ? Math.floor(x) : round === 'ceil' ? Math.ceil(x) : round === 'zero' ? Math.trunc(x) : (x < 0 ? -Math.round(-x) : Math.round(x));
  const m = 2 ** ib[0];
  let v = ((r % m) + m) % m;
  if (ib[1] && v >= m / 2) v -= m;
  return v;
}

/** Verification block runtime: check(u) → message or null; reported at major steps. */
function checker(B, check) {
  const enabled = B.bool('enabled');
  const stop = B.bool('stopWhenAssertionFail');
  let warned = false;
  return {
    ts: tsOf(B, -1), direct: false,
    init() { warned = false; },
    log(S, u) {
      if (!enabled || S.trial || !S.run) return;
      const msg = check(u);
      if (!msg) return;
      const text = `Assertion failed in '${B.path}' at t = ${S.t}: ${msg}`;
      if (stop) S.run.assertFail(text, B.block.id);
      else if (!warned) { warned = true; S.run.warn(text, B.block.id); }
    },
  };
}
const verifyParams = (extra) => [...extra, boolP('enabled', true, 'Enable assertion', '검증 사용'), boolP('stopWhenAssertionFail', true, 'Stop simulation when assertion fails', '검증 실패 시 시뮬레이션 정지'), TS('-1')];
const firstBad = (v, ok) => { for (let i = 0; i < v.length; i++) if (!ok(v[i], i)) return i; return -1; };
const at = (a, i) => (a.length === 1 ? a[0] : a[i]);

export const BLOCKS = [
  def('DataTypeConversion', G, 'Data Type Conversion', '데이터 형식 변환', {
    desc: L('Converts the input to another data type (rounding and integer saturation or wrap-around).', '입력을 다른 데이터 형식으로 변환합니다 (반올림, 정수 포화 또는 순환).'),
    params: [P('OutDataTypeStr', 'dtype', 'double', 'Output data type', '출력 데이터 형식'), enumP('RndMeth', 'Floor', 'Integer rounding mode', '정수 반올림 방식', ['Floor', 'Ceiling', 'Nearest', 'Round', 'Zero', 'Convergent', 'Simplest']), boolP('SaturateOnIntegerOverflow', false, 'Saturate on integer overflow', '정수 오버플로 시 포화')],
    size: [60, 40], icon: (p) => ({ text: String(p.OutDataTypeStr || 'double').replace(/^Inherit: */, '') }),
    make(B) {
      const dt = B.opt('OutDataTypeStr').replace(/^Inherit: */i, '') || 'double';
      const known = ['double', 'single', 'boolean', 'logical', 'auto', ...Object.keys(INT_BITS)];
      if (!known.includes(dt)) B.err(`Unknown data type '${dt}'.`);
      const rnd = ROUNDING[B.opt('RndMeth')] || 'floor';
      const satur = B.bool('SaturateOnIntegerOverflow');
      if (dt === 'auto' || dt === 'double') return { ts: -1, output: (S, u) => [copy(noBus(u[0]))] };
      const f = satur || !INT_BITS[dt] ? (x) => castTo(dt, x, rnd) : (x) => wrapTo(dt, x, rnd);
      return { ts: -1, output: (S, u) => { const v = noBus(u[0]); const y = Float64Array.from(v, f); if (v.dims) y.dims = v.dims; return [y]; } };
    },
  }),
  def('SignalSpecification', G, 'Signal Specification', '신호 사양', {
    desc: L('Passes the signal through and checks its width / dimensions (-1 = any).', '신호를 그대로 통과시키며 폭/차원을 검사합니다 (-1 = 아무거나).'),
    params: [P('Dimensions', 'expr', '-1', 'Dimensions', '차원', { num: true }), P('OutDataTypeStr', 'dtype', 'Inherit: auto', 'Data type', '데이터 형식'), TS('-1')],
    size: [60, 30], icon: () => ({ text: 'Spec' }),
    make(B) {
      const d = Array.from(B.arr('Dimensions'), Math.round);
      return {
        ts: tsOf(B, -1),
        output(S, u) {
          const v = noBus(u[0]);
          if (!S.trial && d.length && d[0] > 0) {
            const vd = dimsOfSig(v);
            const ok = d.length === 1 ? v.length === d[0] : vd[0] === d[0] && vd[1] === d[1];
            if (!ok) throw new MError('sim:signalspec:dims', `The signal has dimensions ${vd.join('×')} but ${d.join('×')} is specified.`);
          }
          return [copy(v)];
        },
      };
    },
  }),
  def('Width', G, 'Width', '폭', {
    desc: L('Outputs the number of elements of its input.', '입력의 원소 개수를 내보냅니다.'), size: [40, 30], icon: () => ({ text: 'Width' }),
    make: () => ({ ts: -1, direct: false, output: (S, u) => [S1(isBus(u[0]) ? u[0].signals.length : u[0].length)] }),
  }),
  def('Probe', G, 'Probe', '프로브', {
    desc: L('Outputs the width and the dimensions [rows cols] of its input.', '입력의 폭과 차원 [행 열]을 내보냅니다.'),
    size: [40, 40], ports: { in: 1, out: 2 }, icon: () => ({ text: 'W:\nD:' }),
    make: () => ({ ts: -1, direct: false, y0: () => [S1(1), Float64Array.of(1, 1)], output: (S, u) => { const v = noBus(u[0]); return [S1(v.length), Float64Array.from(dimsOfSig(v))]; } }),
  }),
  def('RateTransition', G, 'Rate Transition', '샘플 주기 변환', {
    desc: L('Samples the input at the output sample time and holds it (zero-order hold between rates).', '입력을 출력 샘플 시간마다 샘플링해 유지합니다 (주기 사이 영차 유지).'),
    params: [numP('OutPortSampleTime', '-1', 'Output port sample time (-1 = inherited)', '출력 포트 샘플 시간 (-1 = 상속)', { step: 0.01 }), boolP('Integrity', true, 'Ensure data integrity during data transfer', '데이터 전달 무결성 보장', { tab: 'advanced' })],
    size: [40, 40], icon: () => ({ text: 'Rate\nTrans' }),
    make(B) {
      const a = B.arr('OutPortSampleTime');
      const T = a.length ? a[0] : -1;
      const ts = T > 0 ? [T, a[1] || 0] : T === 0 ? 0 : -1;
      return { ts, output: (S, u) => [copy(noBus(u[0]))] };
    },
  }),
  def('IC', G, 'IC', '초기 조건', {
    desc: L('Outputs the initial value at the start time, then the input.', '시작 시간에는 초기값을, 그 뒤에는 입력을 내보냅니다.'),
    params: [numP('Value', '1', 'Initial value', '초기값')], size: [40, 30], icon: (p) => ({ text: `IC=${p.Value ?? '1'}` }),
    make(B) {
      const ic = B.arr('Value');
      let started = false;
      return {
        ts: -1,
        init() { started = false; },
        output(S, u) { if (!started && (!S.run || S.t <= S.run.tStart)) return [ic.length ? copy(ic) : S1(0)]; return [copy(noBus(u[0]))]; },
        update() { started = true; },
      };
    },
  }),
  // ------------------------------------------------------------ verification
  def('Assertion', V, 'Assertion', '검증', {
    desc: L('Checks that every element of the input is nonzero; stops the simulation (or warns) when it is not.', '입력의 모든 원소가 0이 아닌지 검사합니다. 아니면 시뮬레이션을 멈추거나 경고합니다.'),
    params: [boolP('Enabled', true, 'Enable assertion', '검증 사용'), boolP('StopWhenAssertionFail', true, 'Stop simulation when assertion fails', '검증 실패 시 시뮬레이션 정지'), TS('-1')],
    size: [50, 40], ports: { in: 1, out: 0 }, icon: () => ({ text: 'assert' }),
    make(B) {
      const enabled = B.bool('Enabled'), stop = B.bool('StopWhenAssertionFail');
      let warned = false;
      return {
        ts: tsOf(B, -1), direct: false,
        init() { warned = false; },
        log(S, u) {
          if (!enabled || S.trial || !S.run) return;
          const v = noBus(u[0]);
          const k = firstBad(v, (x) => x !== 0 && !Number.isNaN(x));
          if (k < 0) return;
          const text = `Assertion failed in '${B.path}' at t = ${S.t}.`;
          if (stop) S.run.assertFail(text, B.block.id);
          else if (!warned) { warned = true; S.run.warn(text, B.block.id); }
        },
      };
    },
  }),
  def('CheckStaticRange', V, 'Check Static Range', '정적 범위 검사', {
    desc: L('Checks that the input stays within [min, max].', '입력이 [min, max] 안에 있는지 검사합니다.'),
    params: verifyParams([numP('min', '-1', 'Lower bound', '하한'), numP('max', '1', 'Upper bound', '상한'), boolP('min_included', true, 'Inclusive lower bound', '하한 포함'), boolP('max_included', true, 'Inclusive upper bound', '상한 포함')]),
    size: [60, 40], ports: { in: 1, out: 0 }, icon: (p) => ({ text: `[${p.min ?? -1}, ${p.max ?? 1}]` }),
    make(B) {
      const lo = B.arr('min'), hi = B.arr('max'), li = B.bool('min_included'), hiI = B.bool('max_included');
      return checker(B, (u) => { const v = noBus(u[0]); const k = firstBad(v, (x, i) => (li ? x >= at(lo, i) : x > at(lo, i)) && (hiI ? x <= at(hi, i) : x < at(hi, i))); return k < 0 ? null : `element ${k + 1} = ${v[k]} is outside the range.`; });
    },
  }),
  def('CheckStaticLowerBound', V, 'Check Static Lower Bound', '정적 하한 검사', {
    desc: L('Checks that the input is not below the lower bound.', '입력이 하한보다 작지 않은지 검사합니다.'),
    params: verifyParams([numP('min', '0', 'Lower bound', '하한'), boolP('min_included', true, 'Inclusive boundary', '경계 포함')]),
    size: [60, 40], ports: { in: 1, out: 0 }, icon: (p) => ({ text: `≥ ${p.min ?? 0}` }),
    make(B) { const lo = B.arr('min'), inc = B.bool('min_included'); return checker(B, (u) => { const v = noBus(u[0]); const k = firstBad(v, (x, i) => (inc ? x >= at(lo, i) : x > at(lo, i))); return k < 0 ? null : `element ${k + 1} = ${v[k]} is below the lower bound.`; }); },
  }),
  def('CheckStaticUpperBound', V, 'Check Static Upper Bound', '정적 상한 검사', {
    desc: L('Checks that the input is not above the upper bound.', '입력이 상한보다 크지 않은지 검사합니다.'),
    params: verifyParams([numP('max', '0', 'Upper bound', '상한'), boolP('max_included', true, 'Inclusive boundary', '경계 포함')]),
    size: [60, 40], ports: { in: 1, out: 0 }, icon: (p) => ({ text: `≤ ${p.max ?? 0}` }),
    make(B) { const hi = B.arr('max'), inc = B.bool('max_included'); return checker(B, (u) => { const v = noBus(u[0]); const k = firstBad(v, (x, i) => (inc ? x <= at(hi, i) : x < at(hi, i))); return k < 0 ? null : `element ${k + 1} = ${v[k]} is above the upper bound.`; }); },
  }),
  def('CheckDynamicRange', V, 'Check Dynamic Range', '동적 범위 검사', {
    desc: L('Checks that input 2 (sig) lies between input 1 (min) and input 3 (max).', '입력 2(sig)가 입력 1(min)과 입력 3(max) 사이에 있는지 검사합니다.'),
    params: verifyParams([]),
    size: [60, 60], ports: { in: 3, out: 0, inLabels: ['min', 'sig', 'max'] }, icon: () => ({ text: 'min ≤ sig\n≤ max' }),
    make(B) { return checker(B, (u) => { const lo = noBus(u[0]), v = noBus(u[1]), hi = noBus(u[2]); const k = firstBad(v, (x, i) => x >= at(lo, i) && x <= at(hi, i)); return k < 0 ? null : `element ${k + 1} = ${v[k]} is outside [${at(lo, k)}, ${at(hi, k)}].`; }); },
  }),
];

export { wrapTo, F };
