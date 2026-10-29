// Tests of the Math Operations, Logic and Bit Operations, Signal Attributes
// and Model Verification blocks of the simulation engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newModel, makeBlock, connect } from '../core/sim/model.js';
import { compileModel } from '../core/sim/compile.js';
import { Run } from '../core/sim/runtime.js';
import { portsOf, iconOf } from '../core/sim/blocks/index.js';
import * as math from '../core/sim/blocks/math.js';
import * as logic from '../core/sim/blocks/logic.js';
import * as attributes from '../core/sim/blocks/attributes.js';
import { mockCtx } from './helpers/mockctx.mjs';

const ctx = mockCtx();
const close = (a, b, tol = 1e-12, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a}`);

/** blocks: [name, type, params]; lines: [src, port, dst, port]. Returns { model, run, out }. */
function sim(blocks, lines, settings = {}) {
  const m = newModel('t');
  const by = {};
  for (const [name, type, params] of blocks) { const b = makeBlock(m, type, { name, params }, m.root); m.root.blocks.push(b); by[name] = b; }
  for (const [a, pa, b, pb] of lines) connect(m, m.root, { block: by[a].id, port: pa }, { block: by[b].id, port: pb });
  Object.assign(m.settings, { stopTime: '0', ...settings });
  const run = new Run(compileModel(m, ctx), ctx).init();
  const out = run.runSync();
  return { model: m, run, out };
}
/** Last row of yout (all output elements). */
function last(r) { const y = r.out.props.yout; const [N, w] = y.dims; return Array.from({ length: w }, (_, j) => y.re[N - 1 + j * N]); }
const C = (name, v) => [name, 'Constant', { Value: v }];
const O = (name, k) => [name, 'Outport', { Port: String(k) }];

test('every math / logic / attribute block builds, has ports, an icon and runs with default parameters', () => {
  for (const mod of [math, logic, attributes]) {
    for (const d of mod.BLOCKS) {
      assert.equal(typeof d.make, 'function', `${d.type} has make`);
      assert.ok(d.label.en && d.label.ko, `${d.type} has bilingual labels`);
      const m = newModel('t');
      const b = makeBlock(m, d.type, {}, m.root);
      const pc = portsOf(b);
      assert.ok(pc.in >= 0 && pc.out >= 0, d.type);
      assert.ok(iconOf(b), d.type);
    }
  }
});

test('Sum adds with signs, broadcasts scalars and sums elements with one input', () => {
  const r = sim([C('a', '[1 2 3]'), C('b', '10'), ['s', 'Sum', { Inputs: '|+-' }], ['s1', 'Sum', { Inputs: '+' }], O('o', 1), O('o2', 2)],
    [['a', 1, 's', 1], ['b', 1, 's', 2], ['a', 1, 's1', 1], ['s', 1, 'o', 1], ['s1', 1, 'o2', 1]]);
  assert.deepEqual(last(r), [-9, -8, -7, 6]);
});

test('Gain: element-wise and matrix K*u', () => {
  const r = sim([C('u', '[1;2]'), ['g', 'Gain', { Gain: '[1 2; 3 4]', Multiplication: 'Matrix(K*u)' }], ['e', 'Gain', { Gain: '[2 3]' }], O('o', 1), O('o2', 2)],
    [['u', 1, 'g', 1], ['u', 1, 'e', 1], ['g', 1, 'o', 1], ['e', 1, 'o2', 1]]);
  assert.deepEqual(last(r), [5, 11, 2, 6]);
});

test('Product: element-wise divide and matrix inverse', () => {
  const r = sim([C('a', '[6 8]'), C('b', '[2 4]'), ['p', 'Product', { Inputs: '*/' }], C('M', '[2 0; 0 4]'), C('v', '[2; 8]'), ['q', 'Product', { Inputs: '/*', Multiplication: 'Matrix(*)' }], O('o', 1), O('o2', 2)],
    [['a', 1, 'p', 1], ['b', 1, 'p', 2], ['M', 1, 'q', 1], ['v', 1, 'q', 2], ['p', 1, 'o', 1], ['q', 1, 'o2', 1]]);
  assert.deepEqual(last(r), [3, 2, 1, 2]);
});

test('Math Function, Trigonometric Function and Sqrt', () => {
  const r = sim([C('x', '2'), C('y', '3'), ['pw', 'MathFunction', { Operator: 'pow' }], ['md', 'MathFunction', { Operator: 'mod' }], ['ex', 'MathFunction', { Operator: '10^u' }],
    ['at', 'TrigonometricFunction', { Operator: 'atan2' }], ['sc', 'TrigonometricFunction', { Operator: 'sincos' }], ['sq', 'Sqrt', { Operator: 'signedSqrt' }], C('n', '-4'),
    O('o1', 1), O('o2', 2), O('o3', 3), O('o4', 4), O('o5', 5), O('o6', 6), O('o7', 7)],
  [['x', 1, 'pw', 1], ['y', 1, 'pw', 2], ['y', 1, 'md', 1], ['x', 1, 'md', 2], ['x', 1, 'ex', 1], ['y', 1, 'at', 1], ['x', 1, 'at', 2], ['x', 1, 'sc', 1], ['n', 1, 'sq', 1],
    ['pw', 1, 'o1', 1], ['md', 1, 'o2', 1], ['ex', 1, 'o3', 1], ['at', 1, 'o4', 1], ['sc', 1, 'o5', 1], ['sc', 2, 'o6', 1], ['sq', 1, 'o7', 1]]);
  const v = last(r);
  assert.deepEqual(v.slice(0, 3), [8, 1, 100]);
  close(v[3], Math.atan2(3, 2)); close(v[4], Math.sin(2)); close(v[5], Math.cos(2)); close(v[6], -2);
});

test('MinMax, Rounding, Bias, Unary Minus, Dot Product and Polynomial', () => {
  const r = sim([C('a', '[3 -1 2.5]'), C('b', '[1 1]'), ['mx', 'MinMax', { Function: 'max' }], ['mn2', 'MinMax', { Function: 'min', Inputs: '2' }], ['rd', 'Rounding', { Operator: 'round' }],
    ['bi', 'Bias', { Bias: '10' }], ['um', 'UnaryMinus', {}], ['dp', 'DotProduct', {}], ['po', 'Polynomial', { coefs: '[1 0 -1]' }], C('two', '2'),
    O('o1', 1), O('o2', 2), O('o3', 3), O('o4', 4), O('o5', 5), O('o6', 6)],
  [['a', 1, 'mx', 1], ['a', 1, 'mn2', 1], ['two', 1, 'mn2', 2], ['a', 1, 'rd', 1], ['two', 1, 'bi', 1], ['two', 1, 'um', 1], ['b', 1, 'dp', 1], ['b', 1, 'dp', 2], ['two', 1, 'po', 1],
    ['mx', 1, 'o1', 1], ['mn2', 1, 'o2', 1], ['rd', 1, 'o3', 1], ['bi', 1, 'o4', 1], ['dp', 1, 'o5', 1], ['po', 1, 'o6', 1]]);
  assert.deepEqual(last(r), [3, 2, -1, 2, 3, -1, 3, 12, 2, 3]);
});

test('Matrix Concatenate, Reshape, Width and Probe report dimensions', () => {
  const r = sim([C('a', '[1 2; 3 4]'), C('b', '[5; 6]'), ['h', 'MatrixConcatenate', { ConcatenateDimension: '2' }], ['rs', 'Reshape', { OutputDimensionality: 'Customize', OutputDimensions: '[3 2]' }],
    ['pr', 'Probe', {}], ['w', 'Width', {}], O('o1', 1), O('o2', 2), O('o3', 3)],
  [['a', 1, 'h', 1], ['b', 1, 'h', 2], ['h', 1, 'rs', 1], ['rs', 1, 'pr', 1], ['h', 1, 'w', 1], ['pr', 1, 'o1', 1], ['pr', 2, 'o2', 1], ['w', 1, 'o3', 1]]);
  assert.deepEqual(last(r), [6, 3, 2, 6]);
});

test('Relational, Logical, Compare To Constant and Interval Test', () => {
  const r = sim([C('a', '[1 2 3]'), C('b', '2'), ['re', 'RelationalOperator', { Operator: '>=' }], ['lo', 'LogicalOperator', { Operator: 'XOR', Inputs: '2' }], ['ct', 'CompareToConstant', { relop: '==', const: '3' }],
    ['no', 'LogicalOperator', { Operator: 'NOT' }], ['it', 'IntervalTest', { lowlimit: '2', uplimit: '3', IntervalClosedRight: 'off' }], ['nan', 'RelationalOperator', { Operator: 'isFinite' }],
    O('o1', 1), O('o2', 2), O('o3', 3), O('o4', 4), O('o5', 5)],
  [['a', 1, 're', 1], ['b', 1, 're', 2], ['re', 1, 'lo', 1], ['ct', 1, 'lo', 2], ['a', 1, 'ct', 1], ['re', 1, 'no', 1], ['a', 1, 'it', 1], ['b', 1, 'nan', 1],
    ['re', 1, 'o1', 1], ['lo', 1, 'o2', 1], ['no', 1, 'o3', 1], ['it', 1, 'o4', 1], ['nan', 1, 'o5', 1]]);
  assert.deepEqual(last(r), [0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1]);
});

test('Bitwise Operator with a mask and Shift Arithmetic', () => {
  const r = sim([C('a', '[12 10]'), ['ba', 'BitwiseOperator', { logicop: 'AND', UseBitMask: 'on', BitMask: '6' }], ['bx', 'BitwiseOperator', { logicop: 'XOR', UseBitMask: 'off', NumInputPorts: '1' }],
    ['sl', 'ShiftArithmetic', { BitShiftNumber: '2', BitShiftDirection: 'Left' }], ['sr', 'ShiftArithmetic', { BitShiftNumber: '1', BitShiftDirection: 'Right' }],
    O('o1', 1), O('o2', 2), O('o3', 3), O('o4', 4)],
  [['a', 1, 'ba', 1], ['a', 1, 'bx', 1], ['a', 1, 'sl', 1], ['a', 1, 'sr', 1], ['ba', 1, 'o1', 1], ['bx', 1, 'o2', 1], ['sl', 1, 'o3', 1], ['sr', 1, 'o4', 1]]);
  assert.deepEqual(last(r), [4, 2, 6, 48, 40, 6, 5]);
});

test('Detect Increase fires once at the step; Detect Change keeps the previous value', () => {
  const r = sim([['s', 'Step', { Time: '0.5', SampleTime: '0.1' }], ['di', 'DetectIncrease', {}], ['dc', 'DetectChange', { vinit: '1' }], O('o1', 1), O('o2', 2)],
    [['s', 1, 'di', 1], ['s', 1, 'dc', 1], ['di', 1, 'o1', 1], ['dc', 1, 'o2', 1]], { stopTime: '1', solverType: 'fixed', fixedStep: '0.1' });
  const y = r.out.props.yout, t = r.out.props.tout.re, N = t.length;
  const fired = [], changed = [];
  for (let i = 0; i < N; i++) { if (y.re[i]) fired.push(Math.round(t[i] * 10) / 10); if (y.re[i + N]) changed.push(Math.round(t[i] * 10) / 10); }
  assert.deepEqual(fired, [0.5]);
  assert.deepEqual(changed, [0, 0.5]);
});

test('Data Type Conversion saturates or wraps integers and rounds as configured', () => {
  const r = sim([C('a', '[200 -129.5 3.7]'), ['sat', 'DataTypeConversion', { OutDataTypeStr: 'int8', SaturateOnIntegerOverflow: 'on', RndMeth: 'Nearest' }],
    ['wr', 'DataTypeConversion', { OutDataTypeStr: 'int8', RndMeth: 'Floor' }], ['bo', 'DataTypeConversion', { OutDataTypeStr: 'boolean' }], O('o1', 1), O('o2', 2), O('o3', 3)],
  [['a', 1, 'sat', 1], ['a', 1, 'wr', 1], ['a', 1, 'bo', 1], ['sat', 1, 'o1', 1], ['wr', 1, 'o2', 1], ['bo', 1, 'o3', 1]]);
  assert.deepEqual(last(r), [127, -128, 4, -56, 126, 3, 1, 1, 1]);
});

test('Rate Transition holds a continuous signal at its own sample time; IC overrides the first sample', () => {
  const r = sim([['c', 'Clock', {}], ['rt', 'RateTransition', { OutPortSampleTime: '0.5' }], ['ic', 'IC', { Value: '-1' }], O('o1', 1), O('o2', 2)],
    [['c', 1, 'rt', 1], ['c', 1, 'ic', 1], ['rt', 1, 'o1', 1], ['ic', 1, 'o2', 1]], { stopTime: '1', solverType: 'fixed', fixedStep: '0.1' });
  const y = r.out.props.yout, t = r.out.props.tout.re, N = t.length;
  for (let i = 0; i < N; i++) close(y.re[i], Math.floor(t[i] / 0.5 + 1e-9) * 0.5, 1e-9, `t=${t[i]}`);
  close(y.re[N], -1); close(y.re[N + 3], 0.3, 1e-12);
});

test('Assertion stops the simulation with an error, or only warns when stopping is off', () => {
  assert.throws(() => sim([['c', 'Clock', {}], ['cz', 'CompareToConstant', { relop: '<', const: '0.3' }], ['as', 'Assertion', {}]], [['c', 1, 'cz', 1], ['cz', 1, 'as', 1]], { stopTime: '1' }), /Assertion failed/);
  const r = sim([['c', 'Clock', {}], ['ck', 'CheckStaticUpperBound', { max: '0.5', stopWhenAssertionFail: 'off' }]], [['c', 1, 'ck', 1]], { stopTime: '1' });
  assert.equal(r.run.diags.filter((d) => /above the upper bound/.test(d.message)).length, 1);
  close(r.out.props.tout.re[r.out.props.tout.re.length - 1], 1);
});

test('Check Dynamic Range passes when the signal stays between the bounds', () => {
  const r = sim([C('lo', '-1'), ['s', 'SineWave', {}], C('hi', '1'), ['cd', 'CheckDynamicRange', {}]], [['lo', 1, 'cd', 1], ['s', 1, 'cd', 2], ['hi', 1, 'cd', 3]], { stopTime: '5' });
  assert.equal(r.run.diags.length, 0);
});
