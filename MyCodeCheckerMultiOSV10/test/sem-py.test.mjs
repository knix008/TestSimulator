// Tests for the Python semantic analyzer (core/sem-py).
// Every catalog rule is exercised through the samples in sem-py-cases*.mjs:
// the non-compliant sample must report the rule on each line marked
// "# Noncompliant" (and nowhere else), the compliant sample must not report it.
// Every sample must also parse cleanly and run without any rule crashing.
// Set SEM_PART=<part> to run only the rules of one case module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import CASES, { PARTS } from './sem-py-cases.mjs';

const require = createRequire(import.meta.url);
const sem = require('../core/sem-py');

const catalog = sem.catalog();
const PREFIX = 'sem-py:';

function filesOf(c, text) {
  const path = c.path || 'app/a.py';
  return [{ path, text, lang: 'py' }, ...(c.extra || []).map((f) => ({ lang: 'py', ...f }))];
}

function run(files, opts = {}) {
  const stats = {};
  const found = sem.analyze(files, { inactive: opts.inactive || new Set(), root: null, options: opts.options || {}, stats });
  return { found, stats: stats['sem-py'] };
}

function markers(text) {
  const out = [];
  text.split('\n').forEach((l, i) => { if (/\bNoncompliant\b/.test(l)) out.push(i + 1); });
  return out;
}

function checkClean(files, stats) {
  assert.equal(stats.parseErrors, 0, 'sample does not parse');
  // re-run in debug mode so a crashing rule surfaces its own error
  sem.analyze(files, { inactive: new Set(), root: null, options: { 'sem-py': { debug: true } } });
}

function checkMessages(found) {
  for (const f of found) {
    assert.ok(f.message && f.message.en && f.message.ko, `${f.rule}: message`);
    const all = f.message.en + ' ' + f.message.ko;
    assert.ok(!/\{\d\}|\[object Object\]|\$\{/.test(all), `${f.rule}: bad message "${f.message.en}"`);
    assert.ok(Number.isInteger(f.line) && f.line >= 1, `${f.rule}: position`);
  }
}

test('catalog: shape, unique keys and counts', () => {
  const keys = new Set();
  for (const r of catalog) {
    assert.ok(!keys.has(r.key), `duplicate ${r.key}`);
    keys.add(r.key);
    assert.match(r.key, /^sem-py:[a-z0-9-]+$/);
    assert.ok(['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT'].includes(r.type), r.key);
    assert.ok(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'].includes(r.severity), r.key);
    for (const f of ['name', 'why', 'fix']) {
      assert.ok(r[f] && typeof r[f].en === 'string' && r[f].en.trim(), `${r.key} ${f}.en`);
      assert.ok(typeof r[f].ko === 'string' && r[f].ko.trim(), `${r.key} ${f}.ko`);
    }
    assert.deepEqual(r.langs, ['py'], `${r.key} langs`);
    assert.ok(Array.isArray(r.impacts) && r.impacts.length >= 1, `${r.key} impacts`);
    for (const imp of r.impacts) {
      assert.ok(['RELIABILITY', 'SECURITY', 'MAINTAINABILITY'].includes(imp.softwareQuality), `${r.key} impact quality`);
      assert.ok(['BLOCKER', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].includes(imp.severity), `${r.key} impact severity`);
    }
    assert.ok(Number.isFinite(r.debtMin) && r.debtMin > 0, `${r.key} debt`);
    assert.ok(Array.isArray(r.tags) && r.tags.every((t) => t === t.toLowerCase()), `${r.key} tags`);
  }
  assert.ok(catalog.length >= 180, `rule count ${catalog.length}`);
});

test('catalog: every rule has samples and every sample belongs to a rule', () => {
  const ids = new Set(catalog.map((r) => r.key.slice(PREFIX.length)));
  const missing = [...ids].filter((id) => !CASES[id]);
  assert.deepEqual(missing, [], 'rules without samples');
  const orphan = Object.keys(CASES).filter((id) => !ids.has(id));
  assert.deepEqual(orphan, [], 'samples for unknown rules');
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
    if (c.bad) {
      test(`${key}: non-compliant sample${tag}`, () => {
        const want = markers(c.bad);
        assert.ok(want.length, 'sample has no # Noncompliant marker');
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
      test(`${key}: compliant sample${tag}`, () => {
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
  'def f(:\n    pass',
  'class :\n',
  'if x\n    y = 1',
  '"""never closed',
  "'unterminated\nfoo()",
  'x = (1, 2',
  '    indented = 1\nnot_indented = 2\n        deeper = 3',
  'def f():\nreturn 1',
  'lambda: (yield)',
  'a ?? b ::: c @@@ $$$',
  '\u0000\u0001\u0002\ufffd binary',
  'x' .repeat(5000),
  '('.repeat(3000) + ')'.repeat(3000),
  '['.repeat(3000),
  'def f():\n' + Array.from({ length: 200 }, (_, i) => ' '.repeat(4 * (i + 1)) + 'if a:').join('\n') + '\n' + ' '.repeat(804) + 'pass',
  'a' + ' + a'.repeat(4000),
  'match x:\n    case [1, *rest] if rest:\n        pass\n    case {"k": v, **kw}:\n        pass\n    case Point(x=0) | None:\n        pass',
  'async def f():\n    async with a as b, c:\n        async for i in b:\n            await i\n',
  'type Alias[T] = list[T]\ndef g[T: int](x: T) -> T:\n    return x\n',
  'print "python 2"\nexec "code"\n',
  'x = f"{a!r:>{width}} {b=} {{literal}}"\n',
  'class A(B, metaclass=M):\n    @property\n    def p(self) -> int: ...\n',
];

test('robustness: broken or odd input never throws', () => {
  for (const text of BROKEN) {
    for (const path of ['app/a.py', 'app/a.pyi', 'tests/test_a.py']) {
      const files = [{ path, text, lang: 'py' }];
      assert.doesNotThrow(() => sem.analyze(files, { inactive: new Set(), root: null, options: {} }), `${path}: ${text.slice(0, 40)}`);
      assert.doesNotThrow(() => sem.analyze(files, { inactive: new Set(), root: null, options: { 'sem-py': { debug: true } } }), `debug ${path}: ${text.slice(0, 40)}`);
    }
  }
});

test('robustness: unsupported or missing input is ignored', () => {
  const ctx = { inactive: new Set(), root: null, options: {} };
  assert.deepEqual(sem.analyze([], ctx), []);
  assert.deepEqual(sem.analyze(null, ctx), []);
  assert.deepEqual(sem.analyze([null, {}, { path: 'a.py' }, { path: 'a.py', text: null }], ctx), []);
  assert.deepEqual(sem.analyze([{ path: 'src/a.js', text: 'if (a == a) {}', lang: 'js' }], ctx), []);
  assert.deepEqual(sem.analyze([{ path: 'nb.ipynb', text: '{not json', lang: 'py' }], ctx), []);
  assert.doesNotThrow(() => sem.analyze([{ path: 'app/a.py', text: 'x = 1\n', lang: 'py' }]));
});

test('robustness: inactive rules are skipped', () => {
  const text = 'def f(a):\n    if a == a:\n        return 1\n    return 2\n    print(a)\n';
  const files = [{ path: 'app/a.py', text, lang: 'py' }];
  const all = run(files).found;
  assert.ok(all.length > 0, 'sample reports something');
  const first = all[0].rule;
  const off = run(files, { inactive: new Set([first]) }).found;
  assert.ok(!off.some((f) => f.rule === first));
  assert.equal(off.length, all.filter((f) => f.rule !== first).length);
  const none = run(files, { inactive: new Set(catalog.map((r) => r.key)) }).found;
  assert.deepEqual(none, []);
});

test('robustness: findings carry the contract shape', () => {
  const text = 'def f(a):\n    if a == a:\n        return 1\n    return 2\n    print(a)\n';
  const { found } = run([{ path: 'app/a.py', text, lang: 'py' }, { path: 'app/b.py', text, lang: 'py' }]);
  for (const f of found) {
    assert.ok(catalog.some((r) => r.key === f.rule), `unknown rule ${f.rule}`);
    assert.ok(f.file === 'app/a.py' || f.file === 'app/b.py');
    assert.ok(Number.isInteger(f.line) && f.line >= 1);
    assert.ok(f.message.en && f.message.ko);
  }
  assert.deepEqual(found.filter((f) => f.file === 'app/a.py').map((f) => f.rule), found.filter((f) => f.file === 'app/b.py').map((f) => f.rule));
});

test('robustness: notebooks map findings back to the notebook lines', () => {
  const nb = JSON.stringify({
    cells: [
      { cell_type: 'markdown', source: ['# title\n'] },
      { cell_type: 'code', source: ['%matplotlib inline\n', 'def f(a):\n', '    return 1\n', '    print(a)\n'] },
    ],
  }, null, 1);
  const files = [{ path: 'nb/a.ipynb', text: nb, lang: 'py' }];
  const { found } = run(files);
  const lines = nb.split('\n');
  for (const f of found) {
    assert.ok(f.line >= 1 && f.line <= lines.length, `line ${f.line} outside the notebook`);
  }
  const dead = found.filter((f) => f.rule === 'sem-py:unreachable-code');
  assert.equal(dead.length, 1);
  assert.match(lines[dead[0].line - 1], /print\(a\)/);
});
