// Logic and Bit Operations: Relational / Logical Operator, Compare To
// Constant / Zero, Bitwise Operator, Shift Arithmetic, Interval Test,
// Combinatorial Logic and the Detect Change / Increase / Decrease / Rise /
// Fall blocks (previous input kept in update()). Outputs are 1 / 0.
import { def, L, P, enumP, boolP, numP, S1, F, map1, map2, withDims, isBus } from './util.js';
import { MError } from '../../value.js';

const G = 'logic';
const B01 = (b) => (b ? 1 : 0);
const noBus = (u) => { if (isBus(u)) throw new MError('sim:logic:bus', 'A bus signal cannot be used in a logic operation.'); return u; };
const REL = { '==': (a, b) => a === b, '~=': (a, b) => a !== b, '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>=': (a, b) => a >= b, '>': (a, b) => a > b };
const UNARY = { isInf: (x) => x === Infinity || x === -Infinity, isNaN: Number.isNaN, isFinite: Number.isFinite };
const ORDER = new Set(['<', '<=', '>=', '>']);
const RELOPS = ['==', '~=', '<', '<=', '>=', '>'];
const nIn = (p, k, d) => { const n = Math.round(Number(p[k])); return n >= 1 ? n : d; };
const u32 = (x) => (Number.isFinite(x) ? Math.round(x) >>> 0 : 0);

/** Relational comparison against a constant (Compare To Constant / Zero). */
function compareConst(B, c) {
  const op = B.opt('relop') || '<=';
  const f = REL[op];
  if (!f) B.err(`Unknown operator '${op}'.`);
  const rt = { ts: -1, output: (S, u) => [map2(noBus(u[0]), c, (a, b) => B01(f(a, b)))] };
  if (ORDER.has(op) && B.bool('ZeroCross')) rt.zc = (S, u) => Array.from(map2(u[0], c, (a, b) => a - b));
  return rt;
}

/** Detect-family block: output f(u, previous u); the previous value starts at vinit. */
function detect(type, en, ko, den, dko, f) {
  return def(type, G, en, ko, {
    desc: L(den, dko),
    params: [numP('vinit', '0', 'Initial condition', '초기 조건')],
    size: [60, 40], icon: () => ({ text: en.replace(/^Detect /, '') }),
    make(B) {
      const v0 = B.arr('vinit');
      let prev = null;
      return {
        ts: -1,
        init() { prev = null; },
        output(S, u) { const v = noBus(u[0]); const p = prev && prev.length === v.length ? prev : (v0.length === v.length ? v0 : F(v.length).fill(v0.length ? v0[0] : 0)); return [Float64Array.from(v, (x, i) => B01(f(x, p[i])))]; },
        update(S, u) { prev = Float64Array.from(u[0]); },
      };
    },
  });
}

export const BLOCKS = [
  def('RelationalOperator', G, 'Relational Operator', '관계 연산자', {
    desc: L('Compares two inputs (==, ~=, <, <=, >=, >) or tests one input (isInf, isNaN, isFinite); outputs 1 for true.', '두 입력을 비교(==, ~=, <, <=, >=, >)하거나 한 입력을 검사(isInf, isNaN, isFinite)합니다. 참이면 1.'),
    params: [enumP('Operator', '<=', 'Relational operator', '관계 연산자', [...RELOPS, 'isInf', 'isNaN', 'isFinite']), boolP('ZeroCross', true, 'Enable zero-crossing detection', '영점 교차 검출', { tab: 'advanced' })],
    size: [40, 40], ports: (p) => ({ in: UNARY[p.Operator] ? 1 : 2, out: 1 }), icon: (p) => ({ text: p.Operator || '<=' }),
    make(B) {
      const op = B.opt('Operator') || '<=';
      if (UNARY[op]) { const f = UNARY[op]; return { ts: -1, output: (S, u) => [map1(noBus(u[0]), (x) => B01(f(x)))] }; }
      const f = REL[op];
      if (!f) B.err(`Unknown operator '${op}'.`);
      const rt = { ts: -1, output: (S, u) => [map2(noBus(u[0]), noBus(u[1]), (a, b) => B01(f(a, b)))] };
      if (ORDER.has(op) && B.bool('ZeroCross')) rt.zc = (S, u) => Array.from(map2(u[0], u[1], (a, b) => a - b));
      return rt;
    },
  }),
  def('LogicalOperator', G, 'Logical Operator', '논리 연산자', {
    desc: L('AND, OR, NAND, NOR, XOR, NXOR or NOT of its inputs (nonzero is true); with one input the elements are combined.', '입력들의 AND, OR, NAND, NOR, XOR, NXOR, NOT (0이 아니면 참). 입력이 하나면 원소끼리 결합합니다.'),
    params: [enumP('Operator', 'AND', 'Operator', '연산자', ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'NXOR', 'NOT']), numP('Inputs', '2', 'Number of input ports', '입력 포트 수', { min: 1, step: 1 })],
    size: [40, 40], ports: (p) => ({ in: p.Operator === 'NOT' ? 1 : nIn(p, 'Inputs', 2), out: 1 }), icon: (p) => ({ text: p.Operator || 'AND' }),
    make(B) {
      const op = B.opt('Operator') || 'AND';
      const n = op === 'NOT' ? 1 : Math.max(1, B.int('Inputs', 2));
      const base = { AND: 'and', NAND: 'and', OR: 'or', NOR: 'or', XOR: 'xor', NXOR: 'xor' }[op];
      const neg = op === 'NAND' || op === 'NOR' || op === 'NXOR';
      const comb = base === 'and' ? (a, b) => a && b : base === 'or' ? (a, b) => a || b : (a, b) => a !== b;
      return {
        ts: -1,
        output(S, u) {
          if (op === 'NOT') return [map1(noBus(u[0]), (x) => B01(x === 0))];
          if (n === 1) { const v = noBus(u[0]); let r = v[0] !== 0; for (let i = 1; i < v.length; i++) r = comb(r, v[i] !== 0); return [S1(B01(neg ? !r : r))]; }
          let y = map1(noBus(u[0]), (x) => B01(x !== 0));
          for (let i = 1; i < n; i++) y = map2(y, noBus(u[i]), (a, b) => B01(comb(a !== 0, b !== 0)));
          if (neg) y = map1(y, (x) => 1 - x);
          return [y];
        },
      };
    },
  }),
  def('CompareToConstant', G, 'Compare To Constant', '상수와 비교', {
    desc: L('Compares the input with a constant; outputs 1 for true.', '입력을 상수와 비교합니다. 참이면 1.'),
    params: [enumP('relop', '<=', 'Operator', '연산자', RELOPS), numP('const', '3', 'Constant value', '상수 값'), boolP('ZeroCross', true, 'Enable zero-crossing detection', '영점 교차 검출', { tab: 'advanced' })],
    size: [50, 40], icon: (p) => ({ text: `${p.relop || '<='} ${p.const ?? '3'}` }),
    make(B) { const c = B.arr('const'); return compareConst(B, c.length ? c : S1(0)); },
  }),
  def('CompareToZero', G, 'Compare To Zero', '0과 비교', {
    desc: L('Compares the input with zero; outputs 1 for true.', '입력을 0과 비교합니다. 참이면 1.'),
    params: [enumP('relop', '<=', 'Operator', '연산자', RELOPS), boolP('ZeroCross', true, 'Enable zero-crossing detection', '영점 교차 검출', { tab: 'advanced' })],
    size: [50, 40], icon: (p) => ({ text: `${p.relop || '<='} 0` }),
    make: (B) => compareConst(B, S1(0)),
  }),
  def('BitwiseOperator', G, 'Bitwise Operator', '비트 연산자', {
    desc: L('Bitwise AND, OR, XOR or NOT on unsigned 32-bit integers (inputs are rounded), with an optional bit mask.', '부호 없는 32비트 정수(입력은 반올림)에 대한 비트 AND, OR, XOR, NOT. 비트 마스크 사용 가능.'),
    params: [enumP('logicop', 'AND', 'Operator', '연산자', ['AND', 'OR', 'XOR', 'NOT']), boolP('UseBitMask', true, 'Use bit mask', '비트 마스크 사용'), numP('BitMask', '217', 'Bit mask', '비트 마스크'), numP('NumInputPorts', '1', 'Number of input ports', '입력 포트 수', { min: 1, step: 1 })],
    size: [50, 40], ports: (p) => ({ in: String(p.logicop) === 'NOT' || String(p.UseBitMask ?? 'on') === 'on' ? 1 : nIn(p, 'NumInputPorts', 2), out: 1 }), icon: (p) => ({ text: `Bitwise\n${p.logicop || 'AND'}` }),
    make(B) {
      const op = B.opt('logicop') || 'AND';
      const mask = B.bool('UseBitMask') && op !== 'NOT' ? u32(B.num('BitMask', 0)) : null;
      const f = op === 'OR' ? (a, b) => (a | b) >>> 0 : op === 'XOR' ? (a, b) => (a ^ b) >>> 0 : (a, b) => (a & b) >>> 0;
      return {
        ts: -1,
        output(S, u) {
          if (op === 'NOT') return [map1(noBus(u[0]), (x) => (~u32(x)) >>> 0)];
          if (mask !== null) return [map1(noBus(u[0]), (x) => f(u32(x), mask))];
          if (u.length === 1) { const v = noBus(u[0]); let r = u32(v[0]); for (let i = 1; i < v.length; i++) r = f(r, u32(v[i])); return [S1(r)]; }
          let y = map1(noBus(u[0]), u32);
          for (let i = 1; i < u.length; i++) y = map2(y, noBus(u[i]), (a, b) => f(a, u32(b)));
          return [y];
        },
      };
    },
  }),
  def('ShiftArithmetic', G, 'Shift Arithmetic', '산술 시프트', {
    desc: L('Shifts the (rounded) integer input left or right by a number of bits (arithmetic: y = u·2^n or floor(u/2^n)).', '(반올림한) 정수 입력을 지정한 비트 수만큼 왼쪽/오른쪽으로 시프트합니다 (산술: y = u·2^n 또는 floor(u/2^n)).'),
    params: [numP('BitShiftNumber', '8', 'Number of bits to shift', '시프트 비트 수', { min: 0, step: 1 }), enumP('BitShiftDirection', 'Right', 'Direction', '방향', [{ value: 'Left', label: L('Left', '왼쪽') }, { value: 'Right', label: L('Right', '오른쪽') }])],
    size: [50, 40], icon: (p) => ({ text: `${String(p.BitShiftDirection) === 'Left' ? '<<' : '>>'} ${p.BitShiftNumber ?? 8}` }),
    make(B) { const n = Math.max(0, B.int('BitShiftNumber', 8)), k = 2 ** n, left = B.opt('BitShiftDirection') === 'Left'; return { ts: -1, output: (S, u) => [map1(noBus(u[0]), (x) => { const v = Math.round(x); return left ? v * k : Math.floor(v / k); })] }; },
  }),
  def('IntervalTest', G, 'Interval Test', '구간 검사', {
    desc: L('Outputs 1 when the input lies in the interval between the lower and upper limits.', '입력이 하한과 상한 사이 구간에 있으면 1을 냅니다.'),
    params: [numP('uplimit', '0.5', 'Upper limit', '상한'), numP('lowlimit', '-0.5', 'Lower limit', '하한'), boolP('IntervalClosedRight', true, 'Interval closed on right', '오른쪽 닫힌 구간'), boolP('IntervalClosedLeft', true, 'Interval closed on left', '왼쪽 닫힌 구간')],
    size: [50, 40], icon: (p) => ({ text: `[${p.lowlimit ?? '-0.5'}, ${p.uplimit ?? '0.5'}]` }),
    make(B) {
      const hi = B.num('uplimit', 0.5), lo = B.num('lowlimit', -0.5), cr = B.bool('IntervalClosedRight'), cl = B.bool('IntervalClosedLeft');
      return { ts: -1, output: (S, u) => [map1(noBus(u[0]), (x) => B01((cl ? x >= lo : x > lo) && (cr ? x <= hi : x < hi)))] };
    },
  }),
  def('CombinatorialLogic', G, 'Combinatorial Logic', '조합 논리', {
    desc: L('Truth table: the input elements (nonzero = 1) select a row (first element is the most significant bit); the row is the output.', '진리표: 입력 원소(0이 아니면 1)가 행을 고르고(첫 원소가 최상위 비트) 그 행을 출력합니다.'),
    params: [P('TruthTable', 'expr', '[0 0;0 1;0 1;1 0]', 'Truth table', '진리표')],
    size: [50, 40], icon: () => ({ text: 'Truth\nTable' }),
    make(B) {
      const T = B.mat('TruthTable');
      const rows = T.m, cols = T.n;
      const bits = Math.round(Math.log2(rows));
      if (!rows || 2 ** bits !== rows) B.err('The truth table must have 2^n rows.');
      return {
        ts: -1,
        output(S, u) {
          const v = noBus(u[0]);
          if (v.length !== bits && !S.trial) throw new MError('sim:combinatorial:width', `The input width must be ${bits} for a truth table with ${rows} rows.`);
          let r = 0; for (let i = 0; i < bits; i++) r = r * 2 + ((v[i] ?? 0) !== 0 ? 1 : 0);
          const y = F(cols); for (let j = 0; j < cols; j++) y[j] = T.re[r + j * rows];
          return [y];
        },
      };
    },
  }),
  detect('DetectChange', 'Detect Change', '변화 검출', 'Outputs 1 when the input differs from its previous value.', '입력이 이전 값과 다르면 1을 냅니다.', (x, p) => x !== p),
  detect('DetectIncrease', 'Detect Increase', '증가 검출', 'Outputs 1 when the input is greater than its previous value.', '입력이 이전 값보다 크면 1을 냅니다.', (x, p) => x > p),
  detect('DetectDecrease', 'Detect Decrease', '감소 검출', 'Outputs 1 when the input is less than its previous value.', '입력이 이전 값보다 작으면 1을 냅니다.', (x, p) => x < p),
  detect('DetectRisePositive', 'Detect Rise Positive', '양수 상승 검출', 'Outputs 1 when the input becomes positive (previous value ≤ 0).', '입력이 양수가 되면(이전 값 ≤ 0) 1을 냅니다.', (x, p) => x > 0 && p <= 0),
  detect('DetectRiseNonnegative', 'Detect Rise Nonnegative', '비음수 상승 검출', 'Outputs 1 when the input becomes nonnegative (previous value < 0).', '입력이 0 이상이 되면(이전 값 < 0) 1을 냅니다.', (x, p) => x >= 0 && p < 0),
  detect('DetectFallNegative', 'Detect Fall Negative', '음수 하강 검출', 'Outputs 1 when the input becomes negative (previous value ≥ 0).', '입력이 음수가 되면(이전 값 ≥ 0) 1을 냅니다.', (x, p) => x < 0 && p >= 0),
  detect('DetectFallNonpositive', 'Detect Fall Nonpositive', '비양수 하강 검출', 'Outputs 1 when the input becomes nonpositive (previous value > 0).', '입력이 0 이하가 되면(이전 값 > 0) 1을 냅니다.', (x, p) => x <= 0 && p > 0),
];

export { REL, withDims };
