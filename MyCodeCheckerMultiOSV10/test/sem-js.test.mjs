// Tests for the JavaScript / TypeScript semantic analyzer (core/sem-js).
// Every catalog rule is exercised through the samples in sem-js-cases*.mjs:
// the non-compliant sample must report the rule on each line marked
// "Noncompliant" (and nowhere else), the compliant sample must not report it.
// Every sample must also parse cleanly and run without any rule crashing.
// Set SEM_PART=<part> to run only the rules of one case module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import CASES, { PARTS } from './sem-js-cases.mjs';

const require = createRequire(import.meta.url);
const sem = require('../core/sem-js');

const catalog = sem.catalog();
const PREFIX = 'sem-js:';

function filesOf(c, text) {
  const lang = c.lang || 'js';
  const path = c.path || (lang === 'ts' ? 'src/a.ts' : 'src/a.js');
  return [{ path, text, lang }, ...(c.extra || []).map((f) => ({ lang, ...f }))];
}

function run(files, opts = {}) {
  const stats = {};
  const found = sem.analyze(files, { inactive: opts.inactive || new Set(), root: null, options: opts.options || {}, stats });
  return { found, stats: stats['sem-js'] };
}

function markers(text) {
  const out = [];
  text.split('\n').forEach((l, i) => { if (/\bNoncompliant\b/.test(l)) out.push(i + 1); });
  return out;
}

function checkClean(files, stats) {
  assert.equal(stats.parseErrors, 0, 'sample does not parse');
  assert.equal(stats.ruleErrors, 0, 'a rule crashed on the sample');
  // re-run in debug mode so a crashing rule surfaces its own error
  sem.analyze(files, { inactive: new Set(), root: null, options: { 'sem-js': { debug: true } } });
}

function checkMessages(found) {
  for (const f of found) {
    assert.ok(f.message && f.message.en && f.message.ko, `${f.rule}: message`);
    const all = f.message.en + ' ' + f.message.ko;
    assert.ok(!/\{\d\}|\[object Object\]/.test(all), `${f.rule}: bad message "${f.message.en}"`);
    assert.ok(f.line >= 1 && f.column >= 1, `${f.rule}: position`);
  }
}

test('catalog: shape, unique keys and counts', () => {
  const keys = new Set();
  for (const r of catalog) {
    assert.ok(!keys.has(r.key), `duplicate ${r.key}`);
    keys.add(r.key);
    assert.match(r.key, /^sem-js:[a-z0-9-]+$/);
    assert.ok(['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT'].includes(r.type), r.key);
    assert.ok(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'].includes(r.severity), r.key);
    for (const f of ['name', 'why', 'fix']) {
      assert.ok(r[f] && typeof r[f].en === 'string' && r[f].en.trim(), `${r.key} ${f}.en`);
      assert.ok(typeof r[f].ko === 'string' && r[f].ko.trim(), `${r.key} ${f}.ko`);
    }
    assert.ok(Array.isArray(r.langs) && r.langs.length && r.langs.every((l) => l === 'js' || l === 'ts'), `${r.key} langs`);
    assert.ok(Array.isArray(r.impacts) && r.impacts.length >= 1, `${r.key} impacts`);
    for (const imp of r.impacts) {
      assert.ok(['RELIABILITY', 'SECURITY', 'MAINTAINABILITY'].includes(imp.softwareQuality), `${r.key} impact quality`);
      assert.ok(['BLOCKER', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].includes(imp.severity), `${r.key} impact severity`);
    }
    assert.ok(Number.isFinite(r.debtMin) && r.debtMin > 0, `${r.key} debt`);
    assert.ok(Array.isArray(r.tags) && r.tags.every((t) => t === t.toLowerCase()), `${r.key} tags`);
  }
  assert.ok(catalog.length >= 250, `rule count ${catalog.length}`);
});

test('catalog: every rule has samples and every sample belongs to a rule', () => {
  const ids = new Set(catalog.map((r) => r.key.slice(PREFIX.length)));
  const missing = [...ids].filter((id) => !CASES[id]);
  assert.deepEqual(missing, [], 'rules without samples');
  const orphan = Object.keys(CASES).filter((id) => !ids.has(id));
  assert.deepEqual(orphan, [], 'samples for unknown rules');
});

test('catalog: TypeScript samples exist', () => {
  const ts = Object.values(CASES).flat().filter((c) => c.lang === 'ts');
  assert.ok(ts.filter((c) => c.bad).length >= 5, 'at least five non-compliant ts samples');
  assert.ok(ts.filter((c) => c.good).length >= 5, 'at least five compliant ts samples');
});

const part = process.env.SEM_PART;
const selected = part ? Object.keys(PARTS[part] || {}) : catalog.map((r) => r.key.slice(PREFIX.length));

for (const id of selected) {
  const key = PREFIX + id;
  const cases = [].concat(CASES[id] || []);
  test(`${key}: has non-compliant and compliant samples`, () => {
    assert.ok(cases.some((c) => c.bad), 'missing non-compliant sample');
    assert.ok(cases.some((c) => c.good), 'missing compliant sample');
  });
  cases.forEach((c, i) => {
    const tag = cases.length > 1 ? ` #${i + 1}` : '';
    const lang = c.lang || 'js';
    if (c.bad) {
      test(`${key}: non-compliant ${lang} sample${tag}`, () => {
        const want = markers(c.bad);
        assert.ok(want.length, 'sample has no Noncompliant marker');
        const files = filesOf(c, c.bad);
        const { found, stats } = run(files);
        checkClean(files, stats);
        const got = found.filter((f) => f.rule === key && f.file === files[0].path);
        const lines = [...new Set(got.map((f) => f.line))].sort((a, b) => a - b);
        assert.deepEqual(lines, want, `expected lines ${want} got ${lines}`);
        checkMessages(found);
      });
    }
    if (c.good) {
      test(`${key}: compliant ${lang} sample${tag}`, () => {
        const files = filesOf(c, c.good);
        const { found, stats } = run(files);
        checkClean(files, stats);
        const got = found.filter((f) => f.rule === key);
        assert.deepEqual(got.map((f) => `${f.line}: ${f.message.en}`), []);
        checkMessages(found);
      });
    }
  });
}

// ── robustness ──
const BROKEN = [
  '',
  '   \n\n',
  'function (',
  'class { {{{ ',
  'const x = `unterminated ${ a',
  'if (a) { else }',
  '/* never closed',
  "'unterminated string\nfoo()",
  'let x = <div><span></div>;',
  'a ?.. b ::: c @@@',
  '\u0000\u0001\u0002� binary',
  'x'.repeat(5000),
  '('.repeat(3000) + ')'.repeat(3000),
  '['.repeat(3000),
  '{'.repeat(2000),
  'function f() {' + 'if (a) {'.repeat(400) + '}'.repeat(401),
  'a' + ' + a'.repeat(4000),
  'interface X { a: number }; type T<U> = U extends string ? 1 : 2;',
  'enum E { A = 1, B }\nnamespace N { export const x = 1 }',
  '@decorator class A { @prop x: number = 1; constructor(private y: string) {} }',
];

test('robustness: broken or odd input never throws', () => {
  for (const text of BROKEN) {
    for (const [path, lang] of [['src/a.js', 'js'], ['src/a.ts', 'ts'], ['src/a.tsx', 'ts'], ['src/a.jsx', 'js']]) {
      const files = [{ path, text, lang }];
      assert.doesNotThrow(() => sem.analyze(files, { inactive: new Set(), root: null, options: {} }), `${path}: ${text.slice(0, 40)}`);
      const { found, stats } = run(files);
      assert.ok(Array.isArray(found));
      assert.equal(stats.ruleErrors, 0, `rule crashed on ${path}: ${text.slice(0, 40)}`);
    }
  }
});

test('robustness: unsupported or missing input is ignored', () => {
  const ctx = { inactive: new Set(), root: null, options: {} };
  assert.deepEqual(sem.analyze([], ctx), []);
  assert.deepEqual(sem.analyze(null, ctx), []);
  assert.deepEqual(sem.analyze([null, {}, { path: 'a.js' }, { path: 'a.js', text: null }], ctx), []);
  assert.deepEqual(sem.analyze([{ path: 'src/a.py', text: 'x == x', lang: 'py' }], ctx), []);
  assert.deepEqual(sem.analyze([{ path: 'src/a.c', text: 'int main() { return 0; }', lang: 'c' }], ctx), []);
  assert.deepEqual(sem.analyze([{ path: 'types/a.d.ts', text: 'declare const x: number;\nif (x == x) {}', lang: 'ts' }], ctx), []);
  assert.doesNotThrow(() => sem.analyze([{ path: 'src/a.js', text: 'if (a == a) {}', lang: 'js' }]));
});

test('robustness: inactive rules are skipped', () => {
  const text = 'function f(a) {\n  if (a == a) return 1;\n  return 2;\n}\nf(1);\n';
  const files = [{ path: 'src/a.js', text, lang: 'js' }];
  const all = run(files).found;
  assert.ok(all.some((f) => f.rule === 'sem-js:identical-operands'));
  const off = run(files, { inactive: new Set(['sem-js:identical-operands']) }).found;
  assert.ok(!off.some((f) => f.rule === 'sem-js:identical-operands'));
  const none = run(files, { inactive: new Set(catalog.map((r) => r.key)) }).found;
  assert.deepEqual(none, []);
});

test('robustness: findings carry the contract shape and are sorted', () => {
  const text = 'var a = 1;\nif (a == a) {}\nvar b = b;\nfunction g() { return; console.log(1); }\n';
  const files = [{ path: 'src/b.js', text, lang: 'js' }, { path: 'src/a.js', text, lang: 'js' }];
  const { found } = run(files);
  assert.ok(found.length >= 2);
  for (const f of found) {
    assert.ok(f.rule.startsWith(PREFIX));
    assert.ok(catalog.some((r) => r.key === f.rule), `unknown rule ${f.rule}`);
    assert.ok(f.file === 'src/a.js' || f.file === 'src/b.js');
    assert.ok(Number.isInteger(f.line) && f.line >= 1);
  }
  const order = found.map((f) => `${f.file}:${String(f.line).padStart(5, '0')}`);
  assert.deepEqual(order, [...order].sort());
});

test('robustness: vue single-file components analyse the script block only', () => {
  const text = '<template>\n  <div v-if="a == a">x</div>\n</template>\n<script>\nexport default { data() { const b = 1; if (b == b) return {}; return {}; } };\n</script>\n';
  const { found } = run([{ path: 'src/C.vue', text, lang: 'js' }]);
  const lines = found.filter((f) => f.rule === 'sem-js:identical-operands').map((f) => f.line);
  assert.deepEqual(lines, [5]);
  assert.deepEqual(run([{ path: 'src/D.vue', text: '<template><p/></template>', lang: 'js' }]).found, []);
});

test('robustness: minified bundles are skipped', () => {
  const text = 'var a=1;if(a==a){}'.repeat(400);
  assert.deepEqual(run([{ path: 'dist/app.min.js', text, lang: 'js' }]).found, []);
});
