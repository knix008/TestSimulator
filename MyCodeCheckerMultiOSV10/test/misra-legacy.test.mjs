// Legacy MISRA rule packs (MISRA C:2004 and MISRA C++:2008): catalog metadata
// and one compliant + one non-compliant snippet per checked rule. The
// non-compliant line is marked with `//!` or `/* NC */` (or given as `line`).
// Rules reused unchanged from the MISRA C:2012 / C++:2023 packs run the cases
// of the rule they reuse (test/misra-legacy-cases/reused.cjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engine = require('../core/misra-legacy');
const { engines } = require('../core/engines');
const CASES = [
  ...require('./misra-legacy-cases/c2004.cjs'),
  ...require('./misra-legacy-cases/cpp2008.cjs'),
  ...require('./misra-legacy-cases/reused.cjs'),
];

const catalog = engine.catalog();
const byKey = new Map(catalog.map((m) => [m.key, m]));
const hangul = /[가-힣]/;

const langOf = (key) => (key.startsWith('misra-cpp2008:') ? 'cpp' : 'c');

function filesOf(src, lang) {
  const list = typeof src === 'string' ? [{ path: lang === 'cpp' ? 't.cpp' : 't.c', text: src }] : src;
  return list.map((f) => ({ path: f.path, text: f.text, lang: f.lang || lang }));
}

function run(files, options) {
  const warnings = [];
  const findings = engine.analyze(files, { inactive: new Set(), warnings, options: options || {} });
  assert.deepEqual(warnings, [], `rule errors: ${JSON.stringify(warnings)}`);
  return findings;
}

function markedLine(files) {
  for (const f of files) {
    const lines = f.text.split('\n');
    const i = lines.findIndex((l) => l.includes('//!') || /\/\*\s*NC\s*\*\//.test(l));
    if (i >= 0) return { file: f.path, line: i + 1 };
  }
  return null;
}

const STD = {
  'misra-c2004': { label: 'misraC2004', count: 142, checked: 120, id: /^\d+\.\d+$/, cats: ['Required', 'Advisory'] },
  'misra-cpp2008': { label: 'misraCpp2008', count: 228, checked: 180, id: /^\d+-\d+-\d+$/, cats: ['Required', 'Advisory', 'Document'] },
};

test('catalog has both legacy standards with valid metadata', () => {
  assert.equal(new Set(catalog.map((m) => m.key)).size, catalog.length, 'duplicate keys');
  for (const m of catalog) {
    const [fam, id] = m.key.split(':');
    const std = STD[fam];
    assert.ok(std, `unknown family ${m.key}`);
    assert.match(id, std.id, m.key);
    assert.deepEqual(m.langs, [fam === 'misra-c2004' ? 'c' : 'cpp'], m.key);
    assert.equal(m.standards[std.label], `Rule ${id}`, m.key);
    for (const k of ['misraC2012', 'misraCpp2023']) if (m.standards[k]) assert.match(m.standards[k], /^(Rule|Dir) \d+\.\d+(\.\d+)?$/, `${m.key} ${k}`);
    assert.ok(m.tags.includes(fam) && m.tags.includes('misra'), m.key);
    for (const t of m.tags) assert.equal(t, t.toLowerCase(), `${m.key} tag ${t}`);
    assert.ok(['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT'].includes(m.type), m.key);
    assert.ok(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'].includes(m.severity), m.key);
    assert.ok(Number.isFinite(m.debtMin) && m.debtMin > 0, m.key);
    assert.ok(std.cats.includes(m.misraCategory), `${m.key} category ${m.misraCategory}`);
    assert.equal(typeof m.decidable, 'boolean', m.key);
    if (m.cwe) assert.match(m.cwe, /^CWE-\d+$/, m.key);
    for (const f of ['name', 'why', 'fix']) {
      assert.ok(m[f] && m[f].en && m[f].ko, `${m.key} ${f}`);
      assert.match(m[f].ko, hangul, `${m.key} ${f}.ko`);
      assert.doesNotMatch(m[f].en, hangul, `${m.key} ${f}.en`);
    }
    if (m.manual) assert.equal(m.manualReview, true, m.key);
  }
});

for (const [fam, std] of Object.entries(STD)) {
  test(`${fam} has every rule of the standard and enough checked rules`, () => {
    const mine = catalog.filter((m) => m.key.startsWith(`${fam}:`));
    const checked = mine.filter((m) => !m.manual);
    assert.equal(mine.length, std.count, `${fam} rules`);
    assert.ok(checked.length >= std.checked, `${fam}: ${checked.length} checked rules, want >= ${std.checked}`);
  });
}

test('every checked rule has test cases and manual rules have no check', () => {
  const tested = new Set(CASES.map((c) => c.key));
  const missing = catalog.filter((m) => !m.manual && !tested.has(m.key)).map((m) => m.key);
  assert.deepEqual(missing, []);
  for (const c of CASES) assert.ok(byKey.has(c.key), `case for unknown key ${c.key}`);
  for (const c of CASES) assert.ok(!byKey.get(c.key).manual, `case for manual rule ${c.key}`);
  for (const r of engine.rules()) if (r.meta.manual) assert.ok(!r.check && !r.project, `${r.meta.key} is manual but has a check`);
});

test('document-only C++:2008 rules are manual', () => {
  const docs = catalog.filter((m) => m.misraCategory === 'Document');
  assert.ok(docs.length >= 10);
  for (const m of docs) assert.equal(m.manual, true, m.key);
});

for (const c of CASES) {
  const lang = langOf(c.key);
  const name = `${c.key}${c.title ? ` (${c.title})` : ''}`;
  test(`${name} flags non-compliant code`, () => {
    const files = filesOf(c.bad, lang);
    const where = c.line ? { file: c.file || files[0].path, line: c.line } : markedLine(files);
    assert.ok(where, `case ${name} has no marker`);
    const hits = run(files, c.opts).filter((f) => f.rule === c.key);
    assert.ok(hits.some((h) => h.file === where.file && h.line === where.line),
      `${name}: expected a finding at ${where.file}:${where.line}, got ${JSON.stringify(hits.map((h) => `${h.file}:${h.line} ${h.message.en}`))}`);
    for (const h of hits) {
      assert.ok(h.message && h.message.en && h.message.ko, `${name} message text`);
      assert.match(h.message.ko, hangul, `${name} ko message`);
    }
  });
  if (c.good !== undefined) {
    test(`${name} accepts compliant code`, () => {
      const hits = run(filesOf(c.good, lang), c.opts).filter((f) => f.rule === c.key);
      assert.deepEqual(hits.map((h) => `${h.file}:${h.line} ${h.message.en}`), []);
    });
  }
}

test('meta of a few rules is exact', () => {
  const a = byKey.get('misra-c2004:17.4');
  assert.equal(a.misraCategory, 'Required');
  assert.equal(a.standards.misraC2004, 'Rule 17.4');
  assert.equal(a.standards.misraC2012, 'Rule 18.4');
  assert.ok(a.tags.includes('misra-c2004'));
  const b = byKey.get('misra-cpp2008:5-0-3');
  assert.equal(b.standards.misraCpp2008, 'Rule 5-0-3');
  assert.equal(b.misraCategory, 'Required');
  assert.ok(b.tags.includes('misra-cpp2008'));
  assert.equal(byKey.get('misra-c2004:2.4').misraCategory, 'Advisory');
  assert.equal(byKey.get('misra-cpp2008:0-4-1').misraCategory, 'Document');
  assert.equal(byKey.get('misra-c2004:1.3').manual, true);
});

test('engines() includes misra-legacy', () => {
  const ids = engines().map((e) => e.id);
  assert.ok(ids.includes('misra-legacy'), ids.join(','));
});

test('reused rules report under the legacy key when the source engine runs on the same files', () => {
  const files = [{ path: 'h.h', text: '#ifndef H_H\n#define H_H\nint ok;\n#endif\n' }, { path: 'u.c', text: '#include "h.h"\n/* x = compute(y); */\nint main(void) { return 0; }\n', lang: 'c' }]
    .map((f) => ({ lang: 'c', ...f }));
  const misraC = require('../core/misra-c');
  const a = misraC.analyze(files, {}).filter((f) => f.rule === 'misra-c:dir-4.4');
  const b = engine.analyze(files, {}).filter((f) => f.rule === 'misra-c2004:2.4');
  assert.ok(a.length > 0 && b.length > 0, 'both engines report the commented-out code');
});

test('only the selected language is analysed and broken input does not throw', () => {
  const junk = ['', '#if\n', 'int f( {', 'struct { ;', '#define A(\n', 'void f(void) { switch (x) { case : } }', 'template<class T> class { };', '"unterminated', '/* open'];
  for (const text of junk) {
    for (const lang of ['c', 'cpp']) {
      const res = run([{ path: lang === 'c' ? 'j.c' : 'j.cpp', text, lang }]);
      assert.ok(Array.isArray(res));
      for (const f of res) assert.ok(f.rule.startsWith(lang === 'c' ? 'misra-c2004:' : 'misra-cpp2008:'), `${f.rule} on ${lang}`);
    }
  }
  assert.deepEqual(engine.analyze([{ path: 'a.js', text: 'var x = 1;', lang: 'js' }], {}), []);
});

test('inactive rules are not run', () => {
  const inactive = new Set(catalog.map((m) => m.key));
  assert.deepEqual(engine.analyze([{ path: 't.c', text: 'int x = 010;', lang: 'c' }], { inactive }), []);
});

test('analyzes about 20k lines in a reasonable time', () => {
  let c = '#include <stdint.h>\n';
  let cpp = '#include <cstdint>\n';
  for (let i = 0; i < 1500; i++) {
    c += `static int32_t f${i}(int32_t x, uint32_t y) {
  int32_t r = 0;
  int32_t k;
  for (k = 0; k < x; k++) { if ((k % 2) == 0) { r += k; } else { r -= (int32_t)y; } }
  switch (x) { case 1: r = 2; break; default: break; }
  return r;
}
`;
    cpp += `namespace n${i} {
class C${i} { public: explicit C${i}(std::int32_t a) : m(a) {} std::int32_t get() const { return m; } private: std::int32_t m; };
std::int32_t g${i}(std::int32_t x) { C${i} c(x); std::int32_t r = 0; for (std::int32_t k = 0; k < x; ++k) { r += c.get(); } return r; }
}
`;
  }
  const t0 = Date.now();
  const res = engine.analyze([{ path: 'big.c', text: c, lang: 'c' }, { path: 'big.cpp', text: cpp, lang: 'cpp' }], {});
  const ms = Date.now() - t0;
  assert.ok(res.length > 0);
  assert.ok(ms < 60000, `took ${ms} ms`);
});
