// SEI CERT C / C++ rule pack (core/cert). Every rule has at least one
// non-compliant snippet that must raise it and one compliant snippet that
// must not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cert = require('../core/cert');
const { CWE_TOP25_2024 } = require('../core/cert/lib/meta');

const CASES = [
/*CASES*/
];

const TYPES = new Set(['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT']);
const SEVERITIES = new Set(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO']);
const HANGUL = /[가-힣]/;
const catalog = cert.catalog();
const byKey = new Map(catalog.map((m) => [m.key, m]));

function filesOf(src, lang) {
  if (Array.isArray(src)) return src;
  return [{ path: lang === 'cpp' ? 't.cpp' : 't.c', text: src, lang }];
}

function run(src, lang, key) {
  const warnings = [];
  const findings = cert.analyze(filesOf(src, lang), { inactive: new Set(), warnings, options: {} });
  return { hits: findings.filter((f) => f.rule === key), warnings: warnings.filter((w) => w.rule === key) };
}

test('catalog keys are unique and well formed', () => {
  assert.equal(byKey.size, catalog.length);
  for (const m of catalog) assert.match(m.key, /^cert:[A-Z]{3}\d\d-(C|CPP)$/, m.key);
});

test('catalog covers CERT C and CERT C++ rules', () => {
  const cRules = catalog.filter((m) => m.key.endsWith('-C') && m.certKind === 'rule');
  const cppRules = catalog.filter((m) => m.key.endsWith('-CPP') && m.certKind === 'rule');
  const recs = catalog.filter((m) => m.certKind === 'recommendation');
  assert.ok(cRules.length >= 115, `CERT C rules: ${cRules.length}`);
  assert.ok(cppRules.length >= 80, `CERT C++ rules: ${cppRules.length}`);
  assert.ok(recs.length >= 5, `recommendations: ${recs.length}`);
  for (const id of ['STR31-C', 'FIO30-C', 'ENV33-C', 'SIG30-C', 'MSC30-C', 'MSC32-C', 'FIO21-C', 'CON33-C', 'ERR30-C', 'ENV34-C', 'MSC24-C', 'DCL00-C', 'PRE00-C', 'INT07-C',
    'ERR50-CPP', 'ERR61-CPP', 'OOP50-CPP', 'OOP58-CPP', 'MEM50-CPP', 'MEM57-CPP', 'CTR50-CPP', 'CTR58-CPP', 'STR50-CPP', 'STR53-CPP', 'EXP50-CPP', 'EXP63-CPP',
    'DCL50-CPP', 'DCL60-CPP', 'MSC50-CPP', 'MSC54-CPP', 'CON50-CPP', 'CON56-CPP', 'FIO50-CPP', 'FIO51-CPP']) {
    assert.ok(byKey.has(`cert:${id}`), `missing cert:${id}`);
  }
});

test('every rule has meta fields and en/ko texts', () => {
  for (const m of catalog) {
    const id = m.key.slice(5);
    const cpp = id.endsWith('-CPP');
    assert.ok(TYPES.has(m.type), `${m.key} type`);
    assert.ok(SEVERITIES.has(m.severity), `${m.key} severity`);
    assert.ok(Array.isArray(m.langs) && m.langs.length && m.langs.every((l) => l === 'c' || l === 'cpp'), `${m.key} langs`);
    if (cpp) assert.deepEqual(m.langs, ['cpp'], `${m.key} langs`);
    assert.ok(m.debtMin > 0, `${m.key} debtMin`);
    assert.ok(m.tags.includes('cert'), `${m.key} tags`);
    assert.equal(m.cert, `CERT ${id}`);
    assert.equal(cpp ? m.standards.certCpp : m.standards.certC, id);
    assert.match(m.certPriority, /^L[123]$/, `${m.key} certPriority`);
    assert.equal(m.certLevel, m.certPriority);
    assert.match(m.certRisk.priority, /^P\d+$/);
    for (const f of ['name', 'why', 'fix']) {
      assert.ok(m[f] && m[f].en && m[f].ko, `${m.key} ${f}`);
      assert.ok(HANGUL.test(m[f].ko), `${m.key} ${f}.ko is Korean`);
      assert.ok(!HANGUL.test(m[f].en), `${m.key} ${f}.en is English`);
    }
    if (m.cwe) {
      assert.match(m.cwe, /^CWE-\d+$/);
      assert.equal(m.standards.cwe[0], m.cwe);
      for (const c of m.standards.cwe) assert.ok(m.tags.includes(c.toLowerCase()), `${m.key} tag ${c}`);
      assert.equal(!!m.standards.cweTop25, m.standards.cwe.some((c) => CWE_TOP25_2024.has(c)), `${m.key} cweTop25`);
    }
    if (m.certKind === 'recommendation') assert.equal(m.type, 'CODE_SMELL', `${m.key} recommendation type`);
    if (m.deepAnalysis) assert.match(m.deepAnalysis, /^absint:[A-Z_]+$/, `${m.key} deepAnalysis`);
    assert.equal(typeof m.decidable, 'boolean');
  }
});

test('every rule has compliant and non-compliant test cases', () => {
  const covered = new Set(CASES.map((c) => c.key));
  const missing = catalog.map((m) => m.key).filter((k) => !covered.has(k));
  assert.deepEqual(missing, []);
  for (const c of CASES) assert.ok(byKey.has(c.key), `case for unknown rule ${c.key}`);
});

for (const [i, c] of CASES.entries()) {
  const lang = c.lang || (c.key.endsWith('-CPP') ? 'cpp' : 'c');
  test(`${c.key} #${i + 1}: non-compliant code is reported`, () => {
    const { hits, warnings } = run(c.bad, lang, c.key);
    assert.deepEqual(warnings, []);
    assert.ok(hits.length > 0, `${c.key} not reported`);
    for (const h of hits) {
      assert.ok(h.message && h.message.en && h.message.ko, 'message en/ko');
      assert.ok(HANGUL.test(h.message.ko), 'Korean message');
      assert.ok(h.line >= 1);
    }
  });
  test(`${c.key} #${i + 1}: compliant code is not reported`, () => {
    const { hits, warnings } = run(c.good, lang, c.key);
    assert.deepEqual(warnings, []);
    assert.deepEqual(hits.map((h) => `${h.line}: ${h.message.en}`), []);
  });
}

test('inactive rules are skipped', () => {
  const c = CASES.find((x) => x.key === 'cert:STR31-C');
  const all = cert.analyze(filesOf(c.bad, 'c'), {});
  assert.ok(all.some((f) => f.rule === 'cert:STR31-C'));
  const none = cert.analyze(filesOf(c.bad, 'c'), { inactive: new Set(['cert:STR31-C']) });
  assert.ok(!none.some((f) => f.rule === 'cert:STR31-C'));
});

test('C++-only rules do not run on C files and vice versa for C-only rules', () => {
  const cppOnly = new Set(catalog.filter((m) => !m.langs.includes('c')).map((m) => m.key));
  const cOnly = new Set(catalog.filter((m) => !m.langs.includes('cpp')).map((m) => m.key));
  for (const c of CASES) {
    if (Array.isArray(c.bad)) continue;
    const lang = c.lang || (c.key.endsWith('-CPP') ? 'cpp' : 'c');
    const findings = cert.analyze(filesOf(c.bad, lang), {});
    for (const f of findings) {
      if (lang === 'c') assert.ok(!cppOnly.has(f.rule), `${f.rule} fired on C code`);
      else assert.ok(!cOnly.has(f.rule), `${f.rule} fired on C++ code`);
    }
  }
});

function synthC(n) {
  let s = '#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n\nstruct rec { int id; char name[32]; double v; };\n\n';
  for (let i = 0; i < n; i++) {
    s += `static int helper${i}(struct rec *r, const char *src, int k)\n{\n  int total = 0;\n  char buf[64];\n  if (r == NULL || src == NULL) {\n    return -1;\n  }\n  if (strlen(src) >= sizeof buf) {\n    return -2;\n  }\n  strcpy(buf, src);\n  for (int j = 0; j < k && j < 16; j++) {\n    total += r->id * j;\n    if (total > 1000) {\n      total -= 7;\n    } else {\n      total += buf[j % 8] == 'a' ? 1 : 2;\n    }\n  }\n  switch (k) {\n  case 0:\n    total = 1;\n    break;\n  case 1:\n    total = 2;\n    break;\n  default:\n    total = 3;\n    break;\n  }\n  char *p = malloc(16);\n  if (p != NULL) {\n    snprintf(p, 16, "%d", total);\n    printf("%s\\n", p);\n    free(p);\n  }\n  r->v = (double)total / 3.0;\n  return total;\n}\n\n`;
  }
  return s;
}

function synthCpp(n) {
  let s = '#include <vector>\n#include <string>\n#include <mutex>\n\nnamespace app {\nclass Base { public: virtual ~Base() {} virtual int run(int) = 0; };\n';
  for (let i = 0; i < n; i++) {
    s += `class Worker${i} : public Base {\npublic:\n  explicit Worker${i}(int n) : n_(n), name_("w") {}\n  int run(int k) override {\n    std::lock_guard<std::mutex> g(m_);\n    int acc = 0;\n    for (int j = 0; j < k; ++j) {\n      acc += j * n_;\n      if (acc > 100) { acc %= 17; }\n    }\n    items_.push_back(acc);\n    return acc;\n  }\nprivate:\n  int n_;\n  std::string name_;\n  std::vector<int> items_;\n  std::mutex m_;\n};\n\n`;
  }
  return s + '}\n';
}

test('performance: about 20k lines are analysed in a few seconds', () => {
  const files = [];
  for (let f = 0; f < 10; f++) files.push({ path: `src/m${f}.c`, text: synthC(45), lang: 'c' });
  for (let f = 0; f < 6; f++) files.push({ path: `src/k${f}.cpp`, text: synthCpp(40), lang: 'cpp' });
  const lines = files.reduce((n, f) => n + f.text.split('\n').length, 0);
  assert.ok(lines >= 18000, `synthetic project has ${lines} lines`);
  const warnings = [];
  const t0 = Date.now();
  cert.analyze(files, { warnings });
  const ms = Date.now() - t0;
  assert.deepEqual(warnings, []);
  assert.ok(ms < 20000, `analysis took ${ms} ms for ${lines} lines`);
});
