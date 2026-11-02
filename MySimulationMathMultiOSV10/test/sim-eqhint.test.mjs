// 수식 오류의 힌트 (core/sim/eqhint.js): what each mistake suggests, the fixes (each one must make the
// text build, and keep its meaning), notes for likely typos, the M functions' "Hint:" line and the
// dialog's wiring and strings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseEquations, equationModel } from '../core/sim/eqmodel.js';
import { eqHints, eqNotes, isolateDerivative, nearestName } from '../core/sim/eqhint.js';
import { eqParts } from '../core/sim/eqmodel.js';
import { compileModel } from '../core/sim/compile.js';
import { Run } from '../core/sim/runtime.js';
import { createSession } from '../core/session.js';
import { createMemoryFs } from '../core/fs-memory.js';
import { mockCtx } from './helpers/mockctx.mjs';
import { EQ_EXAMPLES } from '../src/sim/logic.js';
import { tr } from '../src/sim/i18n.js';

const ctx = mockCtx();
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

/** The error parseEquations throws for text (fails the test when it builds). */
function errorOf(text, kind = 'auto') {
  try { parseEquations(text, { kind }); } catch (e) { return e; }
  assert.fail(`builds: ${text}`);
}
const hintsOf = (text, kind = 'auto') => eqHints(text, errorOf(text, kind), { kind });
/** The first fix offered for text; it must build. */
function fixOf(text, kind = 'auto') {
  const h = hintsOf(text, kind).find((x) => x.fix != null);
  assert.ok(h, `no fix for ${JSON.stringify(text)}`);
  assert.doesNotThrow(() => parseEquations(h.fix, { kind }), `the fix of ${JSON.stringify(text)} builds: ${JSON.stringify(h.fix)}`);
  return h.fix;
}

test('each kind of mistake gets the fix it needs, and the fix builds', () => {
  const cases = [
    // rearranging
    ["x'' + 0.5*x' + 4*x = u", "x'' = u - 0.5*x' - 4*x"],
    ["m = 2\nm*x'' = -k*x", "m = 2\nx'' = -k*x/m"],
    ["0 = x'' + x", "x'' = -x"],
    ["x'' + x", "x'' = -x"],
    ["x'(t) = -x(t)", "x' = -x"],
    // characters and syntax
    ["x' = -x × 2", "x' = -x * 2"],
    ["x‘ = -x", "x' = -x"],
    ["x' = −x", "x' = -x"],
    ["x' = -x²", "x' = -x^2"],
    ["θ'' = -ω^2*sin(θ)\nω = 3", "theta'' = -omega^2*sin(theta)\nomega = 3"],
    ["x' = -(x + 1", "x' = -(x + 1)"],
    ["x' = -x)", "x' = -x"],
    ["x' = -x +", "x' = -x"],
    ["x' = 1,5*x", "x' = 1.5*x"],
    ["x' == -x", "x' = -x"],
    ["x' := -x", "x' = -x"],
    // names and functions
    ["x' = sn(x)", "x' = sin(x)"],
    ["x' = ln(x + 2)", "x' = log(x + 2)"],
    ["k = 2\nx' = k(x + 1)", "k = 2\nx' = k*(x + 1)"],
    ["x' = -X'", "x' = -x'"],
    ["xdot = -x", "x' = -x"],
    ["x_dot = -x", "x' = -x"],
    ["G = 1/(S + 1)", "G = 1/(s + 1)"],
    // duplicates and initial values
    ["x' = -x\nx' = 2", "x' = -x\n% x' = 2"],
    ["x' = -x\nx = 3", "x' = -x\nx(0) = 3"],
    ["x' = -x\nx'(0) = 1", "x' = -x\n% x'(0) = 1"],
    ["x' = -x\ny(0) = 1", "x' = -x\n% y(0) = 1"],
    ["x' = -x\nX(0) = 1", "x' = -x\nx(0) = 1"],
    ["x' = -x\nx(0) = a0", "a0 = 1\nx' = -x\nx(0) = a0"],
    // transfer functions and state space
    ['H = 0.5/(z - 0.5)', 'Ts = 0.1\nH = 0.5/(z - 0.5)'],
    ['G = K/(s + 1)', 'K = 1\nG = K/(s + 1)'],
    ['A = [0 1; -2 -3]\nB = [0 1]\nC = [1 0]', 'A = [0 1; -2 -3]\nB = [0; 1]\nC = [1 0]'],
    ['A = [0 1; -2 -3]\nB = [0; 1]\nC = [1; 0]', 'A = [0 1; -2 -3]\nB = [0; 1]\nC = [1 0]'],
    ['A = [0 1; -2 -3]\nB = [0; 1]', 'A = [0 1; -2 -3]\nB = [0; 1]\nC = [1 0]'],
    ['A = [0 1; -2 -3]; B = [0; 1]; C = [1 0]; D = [0 0]', 'A = [0 1; -2 -3]; B = [0; 1]; C = [1 0]; D = 0'],
    ['A = [0 1; -2 -3]; B = [0; 1]; C = [1 0]; x0 = 1', 'A = [0 1; -2 -3]; B = [0; 1]; C = [1 0]; x0 = [1; 0]'],
  ];
  for (const [text, want] of cases) assert.equal(fixOf(text), want, JSON.stringify(text));
});

test('dx/dt lines and comments survive a fix; only the broken statement changes', () => {
  assert.equal(fixOf("dx/dt + 2*x = 1   % first order"), "x' = 1 - 2*x  % first order");
  assert.equal(fixOf("k = 4; x'' + k*x = 0; x(0) = 1"), "k = 4; x'' = -k*x; x(0) = 1");
  assert.equal(fixOf("x' = -x\nx' = 2; y = x"), "x' = -x\n y = x");
});

test('a rearranged equation keeps its meaning (simulated)', () => {
  // m x'' + c x' + k x = 0 with m = 2, c = 0, k = 8: x = cos(2t)
  const fixed = fixOf("m = 2; k = 8\nm*x'' + k*x = 0\nx(0) = 1");
  const { model } = equationModel(fixed, { stopTime: String(Math.PI / 2) });
  Object.assign(model.settings, { solverType: 'fixed', solver: 'ode4', fixedStep: '0.001' });
  const out = new Run(compileModel(model, ctx), ctx).init().runSync();
  const t = Array.from(out.props.tout.re), y = Array.from(out.props.yout.re);
  for (const time of [0.5, 1, Math.PI / 2]) {
    const i = t.findIndex((x) => x >= time - 1e-9);
    assert.ok(Math.abs(y[i] - Math.cos(2 * t[i])) < 1e-6, `x(${t[i]}) = ${y[i]}, cos(2t) = ${Math.cos(2 * t[i])}`);
  }
});

test('isolateDerivative: signs, divisors, and the cases it leaves alone', () => {
  const solve = (src) => { const p = eqParts.parseStatement(src, 1); return isolateDerivative(p.lhs || p.rhs, p.lhs ? p.rhs : { k: 'num', v: 0 }); };
  assert.equal(solve("-x'' = x"), "x'' = -x");
  assert.equal(solve("x''/m = F"), "x'' = F*m");
  assert.equal(solve("2*x'' - x' = u"), "x'' = (u + x')/2");
  assert.equal(solve("x'' + x = x''"), null, 'on both sides');
  assert.equal(solve("x''*x'' = 1"), null, 'not linear');
  assert.equal(solve("sin(x'') = 1"), null, 'inside a function');
  assert.equal(solve('x + y = 1'), null, 'no derivative');
});

test('hints without a sure fix still say what to do; a fix that does not help is not offered', () => {
  const only = (text) => { const hs = hintsOf(text); assert.ok(hs.length, text); assert.ok(hs.every((h) => h.fix == null), `no fix: ${text}`); return hs[0]; };
  assert.match(only('G = s^2/(s + 1)').ko, /분모 차수를 올리세요/);
  assert.match(only("x' = -x''").en, /raise it to x'' = /);
  assert.match(only("x' = y'\ny = 2*x").en, /is a signal/);
  assert.match(only("x' = 2*x' + q'").en, /no differential equation for q/);
  assert.match(only('y = z2 + 1\nz2 = y').en, /differential equations x' = -x/);
  assert.match(only("x' = -y\ny = 2*w\nw = y").en, /y → w → y/);
  assert.match(only("x' = x < 1").ko, /비교·논리/);
  assert.match(only("x' = qqq(x)").en, /Functions you can use: sin/);
  // '×' → '*' leaves "x' = -x *", still broken on the same line: shown as advice only
  const h = hintsOf("x' = -x ×")[0];
  assert.equal(h.fix, null);
  assert.match(h.en, /Write '\*' instead of '×'/);
});

test('every hint has Korean and English text; a fix comes with its changed lines', () => {
  const texts = ["x'' + x = u", "x' = sn(x)", 'G = s^2/(s + 1)', "x' = -x\nx' = 2", 'A = [0 1; -2 -3]\nB = [0 1]\nC = [1 0]', "x' = -(x + 1", '', "x'(t) = -x(t)"];
  for (const text of texts) {
    const hs = hintsOf(text);
    assert.ok(hs.length >= 1 && hs.length <= 4, text);
    for (const h of hs) {
      assert.ok(h.ko && h.en && h.ko !== h.en, `${text}: ${h.en}`);
      assert.ok(/[가-힣]/.test(h.ko) && !/[가-힣]/.test(h.en), `${text}: languages`);
      if (h.fix != null) assert.ok(h.preview && h.fix.includes(h.preview.split('\n')[0]), `${text}: preview`);
    }
  }
  assert.deepEqual(eqHints("x' = -x", null), []);
});

test('notes: an input named like a defined name; none for the examples', () => {
  const [n] = eqNotes("k = 4\nx' = -kk*x");
  assert.match(n.ko, /kk.*k를|kk.*k을\(를\)/);
  assert.equal(n.fix, "k = 4\nx' = -k*x");
  assert.equal(eqNotes("k = 4\nx' = -K*x")[0].fix, "k = 4\nx' = -k*x");
  assert.deepEqual(eqNotes("x' = -x + u"), [], 'u is a real input');
  assert.deepEqual(eqNotes("x' = -x\ny' = u1 - y"), [], 'u1 is not x1');
  assert.deepEqual(eqNotes("x' = sn(x)"), [], 'nothing for text that fails');
  for (const x of EQ_EXAMPLES) assert.deepEqual(eqNotes(x.text), [], x.en);
});

test('nearestName: case, one letter, short names only when one holds the other', () => {
  assert.equal(nearestName('K', ['k', 'x']), 'k');
  assert.equal(nearestName('kk', ['k']), 'k');
  assert.equal(nearestName('u1', ['x1']), null);
  assert.equal(nearestName('sn', ['sin', 'sign'], { loose: true }), 'sin');
  assert.equal(nearestName('omegaa', ['omega']), 'omega');
  assert.equal(nearestName('alpha', ['beta']), null);
});

test('the M functions end their errors with the hint', () => {
  const s = createSession({ fs: createMemoryFs(), print: () => {}, host: { post: () => {}, request: () => null } });
  const msg = (code) => { const r = s.evaluate(code); assert.equal(r.ok, false, code); return r.error.message; };
  assert.match(msg(`eq2model('a', "x'' + 4*x = u", 'Open', 'off')`), /\nHint: Put the highest derivative alone on the left: x'' = u - 4\*x → x'' = u - 4\*x$/);
  assert.match(msg(`ode2model('b', "x' = sn(x)", 'Open', 'off')`), /Hint: There is no function sn\. Did you mean sin\?/);
  assert.match(msg(`tf2model('c', 'H = 1/(z - 0.5)', 'Open', 'off')`), /Hint: .*Ts = 0\.1/);
  assert.match(msg(`ss2model('d', 'A = [0 1; -2 -3]; B = [0 1]; C = [1 0]', 'Open', 'off')`), /Hint: B needs 2 rows/);
  assert.ok(s.evaluate(`eq2model('e', "x' = -x", 'Open', 'off');`).ok);
});

test('dialog: hints under the error, notes under the info, Fix and Undo fix; strings and icons', () => {
  const dlg = read('../src/sim/EquationDialog.jsx');
  assert.match(dlg, /import \{ eqHints, eqNotes \} from '..\/..\/core\/sim\/eqhint\.js'/);
  assert.match(dlg, /built\.err \? eqHints\(text, built\.err, \{ kind \}\) : eqNotes\(text, \{ kind \}\)/);
  assert.match(dlg, /className="sim-eq-problem"[\s\S]*\{hintList\}/);
  assert.match(dlg, /\{info && hintList\}/);
  assert.match(dlg, /data-act="fix"[^>]*onClick=\{\(\) => applyFix\(h\)\}/);
  assert.match(dlg, /data-act="unfix"/);
  assert.match(dlg, /lang === 'en' \? h\.en : h\.ko/);
  for (const lang of ['ko', 'en']) {
    for (const k of ['eq_hints', 'eq_notes', 'eq_fix', 'eq_fix_tip', 'eq_unfix', 'eq_unfix_tip']) {
      assert.notEqual(tr(lang, k), k, `${lang}.${k}`);
    }
  }
  const icons = read('../src/sim/icons.jsx');
  for (const n of ['lightbulb', 'wand']) assert.match(icons, new RegExp(`\\n  ${n}: `), n);
  const css = read('../src/sim/sim.css');
  for (const c of ['.sim-eq-problem', '.sim-eq-hints', '.sim-eq-hint ', '.sim-eq-hint-code', '.sim-eq-fix']) assert.ok(css.includes(c), c);
});

test('the manual describes the hints; no product names', () => {
  assert.match(read('../src/docs/ko/11-block-diagrams.md'), /### 오류 힌트[\s\S]*고치기 취소/);
  assert.match(read('../src/docs/en/11-block-diagrams.md'), /### Error Hints[\s\S]*Undo fix/);
  assert.ok(!/matl[a]b|simul[i]nk/i.test(read('../core/sim/eqhint.js') + read('../src/sim/EquationDialog.jsx')), 'name rule');
});
