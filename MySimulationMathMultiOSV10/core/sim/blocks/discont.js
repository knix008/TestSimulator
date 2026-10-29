// Discontinuities: Saturation (+ Dynamic), Dead Zone (+ Dynamic), Rate
// Limiter, Relay, Quantizer, Backlash, Coulomb & Viscous Friction, Hit
// Crossing, Wrap To Zero. Switching points are reported as zero crossings so
// variable-step solvers land on them; memory (relay, backlash, rate limiter,
// hit crossing) changes only in update().
import { def, L, enumP, boolP, numP, TS, S1, copy, tsOf, sat, sgn, at } from './util.js';

const G = 'discont';
const map = (v, f) => Float64Array.from(v, f);
const zcOn = (B) => B.bool('ZeroCross');
const ZC = () => boolP('ZeroCross', true, 'Enable zero-crossing detection', '영점 교차 검출', { tab: 'advanced' });
const dz = (x, lo, hi) => (x > hi ? x - hi : x < lo ? x - lo : 0);

export const BLOCKS = [
  def('Saturation', G, 'Saturation', '포화', {
    desc: L('Limits the input to the range [lower limit, upper limit].', '입력을 [하한, 상한] 범위로 제한합니다.'),
    params: [numP('UpperLimit', '0.5', 'Upper limit', '상한'), numP('LowerLimit', '-0.5', 'Lower limit', '하한'), ZC()],
    size: [40, 40], icon: () => ({ glyph: 'saturation' }),
    make(B) {
      const up = B.arr('UpperLimit'), lo = B.arr('LowerLimit');
      const rt = { ts: -1, output: (S, u) => [map(u[0], (x, i) => sat(x, at(lo, i), at(up, i)))] };
      if (zcOn(B)) rt.zc = (S, u) => { const z = []; u[0].forEach((x, i) => { z.push(x - at(up, i), x - at(lo, i)); }); return z; };
      return rt;
    },
  }),
  def('SaturationDynamic', G, 'Saturation Dynamic', '동적 포화', {
    desc: L('Limits input 2 to the range given by input 1 (upper) and input 3 (lower).', '입력 2를 입력 1(상한)과 입력 3(하한)의 범위로 제한합니다.'),
    size: [50, 50], ports: { in: 3, out: 1, inLabels: ['up', 'u', 'lo'] }, icon: () => ({ glyph: 'saturation', text: 'dyn' }),
    make: () => ({ ts: -1, output: (S, u) => [map(u[1], (x, i) => sat(x, at(u[2], i), at(u[0], i)))], zc: (S, u) => { const z = []; u[1].forEach((x, i) => z.push(x - at(u[0], i), x - at(u[2], i))); return z; } }),
  }),
  def('DeadZone', G, 'Dead Zone', '불감대', {
    desc: L('Zero output inside [start, end]; outside, the input shifted by the zone edge.', '[시작, 끝] 안에서는 0을, 밖에서는 경계만큼 이동한 입력을 냅니다.'),
    params: [numP('LowerValue', '-0.5', 'Start of dead zone', '불감대 시작'), numP('UpperValue', '0.5', 'End of dead zone', '불감대 끝'), ZC()],
    size: [40, 40], icon: () => ({ glyph: 'deadzone' }),
    make(B) {
      const lo = B.arr('LowerValue'), up = B.arr('UpperValue');
      const rt = { ts: -1, output: (S, u) => [map(u[0], (x, i) => dz(x, at(lo, i), at(up, i)))] };
      if (zcOn(B)) rt.zc = (S, u) => { const z = []; u[0].forEach((x, i) => z.push(x - at(up, i), x - at(lo, i))); return z; };
      return rt;
    },
  }),
  def('DeadZoneDynamic', G, 'Dead Zone Dynamic', '동적 불감대', {
    desc: L('Dead zone of input 2 with the zone given by input 1 (upper) and input 3 (lower).', '입력 1(상한)과 입력 3(하한)으로 주어진 입력 2의 불감대.'),
    size: [50, 50], ports: { in: 3, out: 1, inLabels: ['up', 'u', 'lo'] }, icon: () => ({ glyph: 'deadzone', text: 'dyn' }),
    make: () => ({ ts: -1, output: (S, u) => [map(u[1], (x, i) => dz(x, at(u[2], i), at(u[0], i)))] }),
  }),
  def('RateLimiter', G, 'Rate Limiter', '변화율 제한기', {
    desc: L('Limits the rising and falling rate of the signal.', '신호의 상승·하강 변화율을 제한합니다.'),
    params: [numP('RisingSlewLimit', '1', 'Rising slew rate', '상승 변화율'), numP('FallingSlewLimit', '-1', 'Falling slew rate', '하강 변화율'), numP('InitialCondition', '0', 'Initial condition', '초기 조건'), TS('-1')],
    size: [40, 40], icon: () => ({ glyph: 'ratelimit' }),
    make(B) {
      const R = B.arr('RisingSlewLimit'), Fl = B.arr('FallingSlewLimit');
      let yp = null, tp = null;
      const out = (S, u) => {
        if (yp === null || yp.length !== u[0].length) return copy(u[0]);
        const dt = S.t - tp;
        if (!(dt > 0)) return Float64Array.from(yp);
        return map(u[0], (x, i) => { const r = (x - yp[i]) / dt; return r > at(R, i) ? yp[i] + at(R, i) * dt : r < at(Fl, i) ? yp[i] + at(Fl, i) * dt : x; });
      };
      return { ts: tsOf(B, -1), init() { yp = null; tp = null; }, output: (S, u) => [out(S, u)], update(S, u) { const y = out(S, u); yp = y; tp = S.t; } };
    },
  }),
  def('Relay', G, 'Relay', '릴레이', {
    desc: L('Switches the output on when the input reaches the on point and off when it falls to the off point (hysteresis).', '입력이 켜짐 점에 도달하면 켜지고, 꺼짐 점까지 떨어지면 꺼집니다 (히스테리시스).'),
    params: [numP('OnSwitchValue', 'eps', "Switch on point", '켜짐 점'), numP('OffSwitchValue', 'eps', 'Switch off point', '꺼짐 점'), numP('OnOutputValue', '1', 'Output when on', '켜짐 출력'), numP('OffOutputValue', '0', 'Output when off', '꺼짐 출력'), ZC(), TS('-1')],
    size: [40, 40], icon: () => ({ glyph: 'relay' }),
    make(B) {
      const on = B.num('OnSwitchValue', 2.2e-16), off = B.num('OffSwitchValue', 2.2e-16), yOn = B.num('OnOutputValue', 1), yOff = B.num('OffOutputValue', 0);
      if (off > on) B.err('The switch off point must not be greater than the switch on point.');
      let st = null;
      const mode = (u) => Array.from(u[0], (x, i) => (x >= on ? true : x <= off ? false : st ? !!st[i] : false));
      const rt = { ts: tsOf(B, -1), init() { st = null; }, output: (S, u) => [Float64Array.from(mode(u), (m) => (m ? yOn : yOff))], update(S, u) { st = mode(u); } };
      if (zcOn(B)) rt.zc = (S, u) => { const z = []; u[0].forEach((x) => z.push(x - on, x - off)); return z; };
      return rt;
    },
  }),
  def('Quantizer', G, 'Quantizer', '양자화기', {
    desc: L('Rounds the input to a multiple of the quantization interval.', '입력을 양자화 간격의 배수로 반올림합니다.'),
    params: [numP('QuantizationInterval', '0.5', 'Quantization interval', '양자화 간격'), TS('-1')],
    size: [40, 40], icon: () => ({ glyph: 'quantizer' }),
    make(B) {
      const q = B.arr('QuantizationInterval');
      if (q.some((x) => !(x > 0))) B.err('The quantization interval must be positive.');
      return { ts: tsOf(B, -1), output: (S, u) => [map(u[0], (x, i) => { const d = at(q, i); const r = x / d; return d * (r < 0 ? -Math.round(-r) : Math.round(r)); })] };
    },
  }),
  def('Backlash', G, 'Backlash', '백래시', {
    desc: L('Play between input and output: the output follows only after the input moves through the dead band.', '입력과 출력 사이의 유격: 입력이 불감 폭을 지나야 출력이 따라갑니다.'),
    params: [numP('BacklashWidth', '1', 'Deadband width', '불감 폭'), numP('InitialOutput', '0', 'Initial output', '초기 출력'), ZC()],
    size: [40, 40], icon: () => ({ glyph: 'backlash' }),
    make(B) {
      const w = B.arr('BacklashWidth'), ic = B.arr('InitialOutput');
      let yp = null;
      const out = (u) => map(u[0], (x, i) => { const y = yp && yp.length === u[0].length ? yp[i] : at(ic.length ? ic : S1(0), i); const h = at(w, i) / 2; return x > y + h ? x - h : x < y - h ? x + h : y; });
      const rt = { ts: -1, init() { yp = null; }, output: (S, u) => [out(u)], update(S, u) { yp = out(u); } };
      if (zcOn(B)) rt.zc = (S, u) => { const z = []; u[0].forEach((x, i) => { const y = yp && yp.length === u[0].length ? yp[i] : at(ic.length ? ic : S1(0), i); const h = at(w, i) / 2; z.push(x - y - h, x - y + h); }); return z; };
      return rt;
    },
  }),
  def('CoulombViscousFriction', G, 'Coulomb & Viscous Friction', '쿨롱·점성 마찰', {
    desc: L('y = sign(u)·(gain·|u| + offset): Coulomb friction plus viscous friction.', 'y = sign(u)·(이득·|u| + 오프셋): 쿨롱 마찰과 점성 마찰.'),
    params: [numP('offset', '[1 3 2 0]', 'Coulomb friction value (offset)', '쿨롱 마찰 값 (오프셋)'), numP('gain', '1', 'Coefficient of viscous friction (gain)', '점성 마찰 계수 (이득)')],
    size: [40, 40], icon: () => ({ glyph: 'friction' }),
    make(B) {
      const off = B.arr('offset'), g = B.arr('gain');
      return { ts: -1, output: (S, u) => [map(u[0], (x, i) => sgn(x) * (at(g, i) * Math.abs(x) + at(off, i)))], zc: (S, u) => Array.from(u[0]) };
    },
  }),
  def('HitCrossing', G, 'Hit Crossing', '교차 검출', {
    desc: L('Outputs 1 at the time step where the input crosses the offset (in the chosen direction); the solver locates the crossing.', '입력이 오프셋을 (선택한 방향으로) 지나는 시간 스텝에서 1을 냅니다. 솔버가 교차 시점을 찾아냅니다.'),
    params: [numP('HitCrossingOffset', '0', 'Hit crossing offset', '교차 오프셋'), enumP('HitCrossingDirection', 'either', 'Hit crossing direction', '교차 방향', [{ value: 'rising', label: L('rising', '상승') }, { value: 'falling', label: L('falling', '하강') }, { value: 'either', label: L('either', '양쪽') }]), boolP('ShowOutputPort', true, 'Show output port', '출력 포트 표시')],
    size: [40, 40], ports: (p) => ({ in: 1, out: String(p.ShowOutputPort ?? 'on') === 'off' ? 0 : 1 }), icon: () => ({ glyph: 'hitcross' }),
    make(B) {
      const c = B.num('HitCrossingOffset', 0), dir = B.opt('HitCrossingDirection') || 'either';
      let up = null;
      const hit = (u) => Float64Array.from(u[0], (x, i) => {
        const p = up && up.length === u[0].length ? up[i] - c : null, q = x - c;
        if (q === 0) return 1;
        if (p === null) return 0;
        const rise = p < 0 && q >= 0, fall = p > 0 && q <= 0;
        return (dir === 'rising' ? rise : dir === 'falling' ? fall : rise || fall) ? 1 : 0;
      });
      return { ts: -1, init() { up = null; }, output: (S, u) => (B.nOut ? [hit(u)] : null), update(S, u) { up = Float64Array.from(u[0]); }, zc: (S, u) => Array.from(u[0], (x) => x - c) };
    },
  }),
  def('WrapToZero', G, 'Wrap To Zero', '0으로 되돌림', {
    desc: L('Outputs zero when the input exceeds the threshold, otherwise the input.', '입력이 임계값을 넘으면 0을, 아니면 입력을 냅니다.'),
    params: [numP('Threshold', '255', 'Threshold', '임계값')],
    size: [40, 40], icon: () => ({ glyph: 'wrap' }),
    make(B) { const th = B.arr('Threshold'); return { ts: -1, output: (S, u) => [map(u[0], (x, i) => (x > at(th, i) ? 0 : x))] }; },
  }),
];
