// Tests for the HIS metric engine (core/his): exact metric values on small
// hand-computed C functions, every threshold rule bad/good, option overrides,
// summary() and robustness.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const his = require('../core/his');
const { compute } = require('../core/his/metrics');

const C = (text, path = 'src/a.c') => [{ path, text, lang: 'c' }];
const rowsOf = (files, options) => his.functionMetrics(files, options);
const row = (files, name, options) => {
  const r = rowsOf(files, options).find((x) => x.function === name);
  assert.ok(r, `row for ${name}`);
  return r;
};
const run = (files, options = {}, inactive = new Set()) => his.analyze(files, { inactive, options, root: null });
const hits = (files, rule, options) => run(files, options).filter((f) => f.rule === rule);

const ifs = (n) => Array.from({ length: n }, (_, i) => `  if (a > ${i}) { r++; }`).join('\n');

test('catalog lists every HIS threshold rule with bilingual texts', () => {
  const cat = his.catalog();
  const keys = cat.map((r) => r.key).sort();
  assert.deepEqual(keys, ['his:CALLING', 'his:CALLS', 'his:COMF', 'his:COMF_FILE', 'his:GOTO', 'his:LEVEL', 'his:NOMV', 'his:NOMVPR',
    'his:PARAM', 'his:PATH', 'his:RETURN', 'his:STMT', 'his:VG', 'his:VOCF', 'his:ap_cg_cycle'].sort());
  for (const r of cat) {
    assert.equal(r.type, 'CODE_SMELL');
    assert.deepEqual(r.langs, ['c', 'cpp']);
    assert.deepEqual(r.tags, ['his', 'metrics']);
    for (const k of ['name', 'why', 'fix']) {
      assert.ok(r[k].en && r[k].ko, `${r.key} ${k}`);
    }
    assert.ok(r.debtMin > 0);
  }
});

test('default thresholds follow HIS and can be overridden', () => {
  const t = his.thresholds({});
  assert.deepEqual({ COMF: t.COMF, PATH: t.PATH, GOTO: t.GOTO, VG: t.VG, CALLING: t.CALLING, CALLS: t.CALLS, PARAM: t.PARAM, STMT: t.STMT, LEVEL: t.LEVEL, RETURN: t.RETURN, VOCF: t.VOCF, ap_cg_cycle: t.ap_cg_cycle },
    { COMF: 0.2, PATH: 80, GOTO: 0, VG: 10, CALLING: 5, CALLS: 7, PARAM: 5, STMT: 50, LEVEL: 4, RETURN: 1, VOCF: 4, ap_cg_cycle: 0 });
  const o = his.thresholds({ his: { thresholds: { VG: 15, COMF: 0.1, PARAM: 'bad' } } });
  assert.equal(o.VG, 15);
  assert.equal(o.COMF, 0.1);
  assert.equal(o.COMF_FILE, 0.1);
  assert.equal(o.PARAM, 5);
});

test('PATH counts non-cyclic paths of if/else chains, sequences, loops and switches', () => {
  const src = `
int chain(int a) { int r; if (a == 1) r = 1; else if (a == 2) r = 2; else r = 3; return r; }
int seq(int a, int b) { int r = 0; if (a) r++; if (b) r++; return r; }
int loop(int a, int b) { int r = 0; while (a) { if (b) r++; a--; } return r; }
int loops2(int a) { int r = 0; for (int i = 0; i < a; i++) r++; do { r--; } while (r > 0); return r; }
int sw(int a) { int r = 0; switch (a) { case 1: r = 1; break; case 2: r = 2; break; case 3: r = 4; break; default: r = 3; } return r; }
int nodef(int a) { int r = 0; switch (a) { case 1: r = 1; break; case 2: r = 2; break; } return r; }
int logic(int a, int b) { if (a && b) return 1; return 0; }
int early(int a, int b) { if (a) return 1; if (b) return 2; return 3; }
int straight(int a) { return a + 1; }
int back(int a) { again: if (a) { a--; goto again; } return a; }
`;
  const files = C(src);
  assert.equal(row(files, 'chain').PATH, 3);
  assert.equal(row(files, 'seq').PATH, 4);
  assert.equal(row(files, 'loop').PATH, 3);
  assert.equal(row(files, 'loops2').PATH, 4);
  assert.equal(row(files, 'sw').PATH, 4);
  assert.equal(row(files, 'nodef').PATH, 3);
  assert.equal(row(files, 'logic').PATH, 3);
  assert.equal(row(files, 'early').PATH, 3);
  assert.equal(row(files, 'straight').PATH, 1);
  assert.equal(row(files, 'back').PATH, 2);
});

test('PATH saturates at the cap', () => {
  const files = C(`int big(int a) {\n  int r = 0;\n${ifs(25)}\n  return r;\n}\n`);
  assert.equal(row(files, 'big').PATH, 1e6);
  assert.equal(row(files, 'big', { his: { pathCap: 100 } }).PATH, 100);
  const f = hits(files, 'his:PATH');
  assert.equal(f.length, 1);
  assert.match(f[0].message.en, /saturated/);
});

test('v(G) counts decisions; && and || only with logicalOperators', () => {
  const src = `
int chain(int a) { int r; if (a == 1) r = 1; else if (a == 2) r = 2; else r = 3; return r; }
int sw(int a) { int r = 0; switch (a) { case 1: r = 1; break; case 2: r = 2; break; default: r = 3; } return r; }
int cond(int a) { return a ? 1 : 2; }
int logic(int a, int b) { int r = 0; if (a && b || a) r = 1; while (a) a--; for (;;) { break; } do { r++; } while (0); return r; }
`;
  const files = C(src);
  assert.equal(row(files, 'chain').VG, 3);
  assert.equal(row(files, 'sw').VG, 3);
  assert.equal(row(files, 'cond').VG, 2);
  assert.equal(row(files, 'logic').VG, 5);
  assert.equal(row(files, 'logic', { his: { logicalOperators: true } }).VG, 7);
});

test('RETURN counts return statements plus a reachable end of body', () => {
  const src = `
int one(int a) { return a; }
int two(int a) { if (a) return 1; return 0; }
void none(int *p) { *p = 1; }
void early(int *p) { if (!p) return; *p = 1; }
int both(int a) { if (a) return 1; else return 2; }
`;
  const files = C(src);
  assert.equal(row(files, 'one').RETURN, 1);
  assert.equal(row(files, 'two').RETURN, 2);
  assert.equal(row(files, 'none').RETURN, 1);
  assert.equal(row(files, 'early').RETURN, 2);
  assert.equal(row(files, 'both').RETURN, 2);
});

test('LEVEL is the deepest control nesting; else-if keeps the level', () => {
  const src = `
int flat(int a) { return a; }
int chain(int a) { int r = 0; if (a == 1) r = 1; else if (a == 2) r = 2; else if (a == 3) r = 3; else r = 4; return r; }
int deep(int a) { if (a) { while (a) { for (;;) { if (a > 2) { do { a--; } while (a); } break; } } } return a; }
int inelse(int a) { if (a) { a++; } else { if (a < 0) { a--; } } return a; }
`;
  const files = C(src);
  assert.equal(row(files, 'flat').LEVEL, 0);
  assert.equal(row(files, 'chain').LEVEL, 1);
  assert.equal(row(files, 'deep').LEVEL, 5);
  assert.equal(row(files, 'inelse').LEVEL, 2);
});

test('VOCF is (N1 + N2) / (n1 + n2) from the Halstead counts', () => {
  const files = C('int inc(int a) { return a + 1; }\nvoid h(void) { inc(1); inc(2); }\n');
  // inc: operators int ( int { return + ;  -> N1 = 7, n1 = 6; operands inc a a 1 -> N2 = 4, n2 = 3
  const data = compute(files, {});
  const inc = data.rows.find((r) => r.function === 'inc');
  assert.deepEqual(inc.halstead, { N1: 7, N2: 4, n1: 6, n2: 3 });
  assert.equal(inc.VOCF, 1.222);
  // h: void ( void { ( ; ( ; -> N1 = 8, n1 = 4; operands h inc 1 inc 2 -> N2 = 5, n2 = 4
  const h = data.rows.find((r) => r.function === 'h');
  assert.deepEqual(h.halstead, { N1: 8, N2: 5, n1: 4, n2: 4 });
  assert.equal(h.VOCF, 1.625);
});

test('STMT, GOTO, PARAM and CALLS on one function', () => {
  const src = `
int g1(int); int g2(int); void sink(int);
int work(int a, int b, int c) {
  int r = 0;
  for (int i = 0; i < a; i++) { r += g1(i); }
  if (b) goto done;
  r = g2(r) + g1(r);
  sink(r);
done:
  return r;
}
void nop(void) { }
`;
  const files = C(src);
  const w = row(files, 'work');
  // int r; for; r += ...; if; goto; r = ...; sink(r); return  -> 8
  assert.equal(w.STMT, 8);
  assert.equal(w.GOTO, 1);
  assert.equal(w.PARAM, 3);
  assert.equal(w.CALLS, 3);
  const n = row(files, 'nop');
  assert.equal(n.PARAM, 0);
  assert.equal(n.STMT, 0);
  assert.equal(n.COMF, null);
});

test('CALLING counts distinct callers across the project', () => {
  const files = [
    { path: 'src/util.c', lang: 'c', text: 'int util(int a) { return a; }\n' },
    { path: 'src/b.c', lang: 'c', text: 'int util(int);\nint b1(void) { return util(1) + util(2); }\nint b2(void) { return util(3); }\n' },
    { path: 'src/c.c', lang: 'c', text: 'int util(int);\nint c1(void) { return util(4); }\n' },
  ];
  assert.equal(row(files, 'util').CALLING, 3);
  assert.equal(row(files, 'b1').CALLING, 0);
  assert.equal(row(files, 'b1').CALLS, 1);
});

test('COMF uses the header comment and comments inside the function', () => {
  const src = `int x;
/*
 * Adds one.
 */
int inc(int a) {
  int r = a; /* copy */
  r++;
  // done
  return r;
}
int bare(int a) { int r = a; r++; return r; }
`;
  const files = C(src);
  // header 3 lines + 2 inner comment lines over 3 statements
  assert.equal(row(files, 'inc').COMF, 1.667);
  assert.equal(row(files, 'bare').COMF, 0);
  const fm = his.fileMetrics(files);
  assert.equal(fm.length, 1);
  assert.equal(fm[0].commentLines, 5);
  assert.equal(fm[0].statements, 6);
  assert.equal(fm[0].COMF, 0.833);
});

test('ap_cg_cycle marks recursive functions and reports one finding per cycle', () => {
  const files = [
    { path: 'src/p.c', lang: 'c', text: 'int q(int);\nint p(int n) { return n ? q(n - 1) : 0; }\n' },
    { path: 'src/q.c', lang: 'c', text: 'int p(int);\nint q(int n) { return n ? p(n - 1) : 1; }\nint self(int n) { return n ? self(n - 1) : 0; }\nint leaf(void) { return 0; }\n' },
  ];
  assert.equal(row(files, 'p').ap_cg_cycle, 1);
  assert.equal(row(files, 'q').ap_cg_cycle, 1);
  assert.equal(row(files, 'self').ap_cg_cycle, 1);
  assert.equal(row(files, 'leaf').ap_cg_cycle, 0);
  const f = hits(files, 'his:ap_cg_cycle');
  assert.equal(f.length, 2);
  const mutual = f.find((x) => x.file === 'src/p.c');
  assert.equal(mutual.line, 2);
  assert.equal(mutual.events.length, 2);
  assert.match(mutual.message.en, /p -> q -> p/);
  assert.ok(f.some((x) => x.function === 'self' && /self -> self/.test(x.message.en)));
  assert.equal(hits(files, 'his:ap_cg_cycle', { his: { thresholds: { ap_cg_cycle: 2 } } }).length, 0);
});

// ------------------------------------------------------------ threshold rules: bad / good

const COMMENTED = (body) => `/* documented function */\n/* second line */\n${body}`;

const CASES = [
  ['his:PATH', C(`int f(int a) {\n  int r = 0;\n${ifs(7)}\n  return r;\n}\n`), C(`int f(int a) {\n  int r = 0;\n${ifs(6)}\n  return r;\n}\n`), /non-cyclic paths is 128 \(limit 80\)/],
  ['his:GOTO', C('int f(int a) { if (a) goto out; a++; out: return a; }\n'), C('int f(int a) { if (a) { a++; } return a; }\n'), /goto statements is 1 \(limit 0\)/],
  ['his:VG', C(`int f(int a) {\n  int r = 0;\n${ifs(10)}\n  return r;\n}\n`), C(`int f(int a) {\n  int r = 0;\n${ifs(9)}\n  return r;\n}\n`), /v\(G\) is 11 \(limit 10\)/],
  ['his:CALLING',
    C(`int f(int a) { return a; }\n${Array.from({ length: 6 }, (_, i) => `int c${i}(void) { return f(${i}); }`).join('\n')}\n`),
    C(`int f(int a) { return a; }\n${Array.from({ length: 5 }, (_, i) => `int c${i}(void) { return f(${i}); }`).join('\n')}\n`), /calling functions is 6 \(limit 5\)/],
  ['his:CALLS',
    C(`${Array.from({ length: 8 }, (_, i) => `void g${i}(void);`).join('\n')}\nvoid f(void) { ${Array.from({ length: 8 }, (_, i) => `g${i}();`).join(' ')} }\n`),
    C(`${Array.from({ length: 8 }, (_, i) => `void g${i}(void);`).join('\n')}\nvoid f(void) { ${Array.from({ length: 7 }, (_, i) => `g${i}();`).join(' ')} g0(); }\n`), /called functions is 8 \(limit 7\)/],
  ['his:PARAM', C('int f(int a, int b, int c, int d, int e, int g) { return a + b + c + d + e + g; }\n'), C('int f(int a, int b, int c, int d, int e, ...) { return a + b + c + d + e; }\n'), /parameters is 6 \(limit 5\)/],
  ['his:STMT', C(`int f(int a) {\n${'  a++;\n'.repeat(50)}  return a;\n}\n`), C(`int f(int a) {\n${'  a++;\n'.repeat(49)}  return a;\n}\n`), /statements is 51 \(limit 50\)/],
  ['his:LEVEL', C('int f(int a) { if (a) { if (a > 1) { if (a > 2) { if (a > 3) { if (a > 4) { a = 0; } } } } } return a; }\n'),
    C('int f(int a) { if (a) { if (a > 1) { if (a > 2) { if (a > 3) { a = 0; } } } } return a; }\n'), /nesting depth is 5 \(limit 4\)/],
  ['his:RETURN', C('int f(int a) { if (a) return 1; return 0; }\n'), C('int f(int a) { int r = 0; if (a) r = 1; return r; }\n'), /return points is 2 \(limit 1\)/],
  ['his:VOCF', C(`int f(int x) {\n${'  x = x + 1;\n'.repeat(12)}  return x;\n}\n`), C('int f(int x) { return x + 1; }\n'), /vocabulary frequency is .* \(N1=/],
  ['his:COMF', C('int f(int a) { int r = a; r++; return r; }\n'), C(COMMENTED('int f(int a) { int r = a; r++; return r; }\n')), /comment density is 0 \(0 comment lines, 3 statements\)/],
  ['his:COMF_FILE', C('int f(int a) { int r = a; r++; return r; }\n'), C(COMMENTED('int f(int a) { int r = a; r++; return r; }\n')), /File comment density \(COMF\) is 0/],
];

for (const [rule, bad, good, re] of CASES) {
  test(`${rule} reports the bad sample and not the good one`, () => {
    const b = hits(bad, rule);
    assert.equal(b.length, 1, `${rule} bad: ${JSON.stringify(b)}`);
    assert.match(b[0].message.en, re);
    assert.ok(b[0].message.ko.length > 0);
    assert.equal(b[0].file, 'src/a.c');
    if (rule !== 'his:COMF_FILE') assert.equal(b[0].function, 'f');
    assert.deepEqual(hits(good, rule), [], `${rule} good`);
  });
}

test('findings point at the function name line', () => {
  const files = C('/* a */\n\nint\nf(int a)\n{\n  if (a) return 1;\n  return 0;\n}\n');
  const f = hits(files, 'his:RETURN');
  assert.equal(f.length, 1);
  assert.equal(f[0].line, 4);
});

test('NOMV and NOMVPR use MISRA findings passed in the options', () => {
  const files = C('int f(int a) {\n  a++;\n  a--;\n  return a;\n}\nint g(int a) { return a; }\n');
  assert.deepEqual(hits(files, 'his:NOMV'), []);
  assert.equal(row(files, 'f').NOMV, undefined);
  const misraFindings = [
    { rule: 'misra-c:10.1', file: 'src/a.c', line: 2 },
    { rule: 'misra-c:10.1', file: 'src/a.c', line: 3 },
    { rule: 'misra-c:15.5', file: 'src/a.c', line: 4 },
    { rule: 'cert:EXP30-C', file: 'src/a.c', line: 2 },
    { rule: 'misra-c:8.4', file: 'src/other.c', line: 2 },
  ];
  const opts = { his: { misraFindings } };
  const r = row(files, 'f', opts);
  assert.equal(r.NOMV, 3);
  assert.equal(r.NOMVPR, 2);
  assert.equal(row(files, 'g', opts).NOMV, 0);
  const nomv = hits(files, 'his:NOMV', opts);
  assert.equal(nomv.length, 1);
  assert.match(nomv[0].message.en, /MISRA violations is 3/);
  assert.equal(hits(files, 'his:NOMVPR', opts).length, 1);
  assert.equal(hits(files, 'his:NOMV', { his: { misraFindings, thresholds: { NOMV: 3 } } }).length, 0);
});

test('threshold overrides change what is reported', () => {
  const files = C('int f(int a) { if (a) { a++; } if (a > 2) { a--; } return a; }\n');
  assert.deepEqual(hits(files, 'his:VG'), []);
  const f = hits(files, 'his:VG', { his: { thresholds: { VG: 2 } } });
  assert.equal(f.length, 1);
  assert.match(f[0].message.en, /v\(G\) is 3 \(limit 2\)/);
  assert.equal(hits(files, 'his:PATH', { his: { thresholds: { PATH: 3 } } }).length, 1);
  assert.equal(hits(files, 'his:COMF', { his: { thresholds: { COMF: -1 } } }).length, 0);
});

test('inactive rules are skipped and all-inactive returns nothing', () => {
  const files = C('int f(int a) { if (a) return 1; return 0; }\n');
  const all = new Set(his.catalog().map((r) => r.key));
  assert.deepEqual(run(files, {}, all), []);
  const f = run(files, {}, new Set(['his:RETURN']));
  assert.ok(f.length > 0);
  assert.ok(!f.some((x) => x.rule === 'his:RETURN'));
});

test('C++ functions and headers are measured once', () => {
  const files = [
    { path: 'src/m.hpp', lang: 'cpp', text: 'inline int twice(int a) { if (a) { return a * 2; } return 0; }\n' },
    { path: 'src/a.cpp', lang: 'cpp', text: '#include "m.hpp"\nnamespace n { int a1() { return twice(1); } }\n' },
    { path: 'src/b.cpp', lang: 'cpp', text: '#include "m.hpp"\nint b1() { auto l = [](int x) { return x; }; return twice(l(2)); }\n' },
  ];
  const rows = rowsOf(files);
  assert.equal(rows.filter((r) => r.function === 'twice').length, 1);
  const t = rows.find((r) => r.function === 'twice');
  assert.equal(t.file, 'src/m.hpp');
  assert.equal(t.RETURN, 2);
  assert.equal(t.CALLING, 2);
  const b1 = rows.find((r) => r.function === 'b1');
  assert.equal(b1.RETURN, 1);
  assert.equal(hits(files, 'his:RETURN').filter((f) => f.function === 'twice').length, 1);
});

test('summary gives min, max, avg and violations per metric', () => {
  const files = C(`int a1(int a) { return a; }
int a2(int a) { if (a) return 1; return 0; }
int a3(int a, int b) { int r = 0; if (a) r++; if (b) r++; if (a && b) r++; return r; }
`);
  const rows = rowsOf(files);
  assert.equal(rows.length, 3);
  const s = his.summary(rows);
  assert.equal(s.functions, 3);
  assert.deepEqual({ min: s.metrics.VG.min, max: s.metrics.VG.max, avg: s.metrics.VG.avg, violations: s.metrics.VG.violations }, { min: 1, max: 4, avg: 2.333, violations: 0 });
  assert.deepEqual({ min: s.metrics.RETURN.min, max: s.metrics.RETURN.max, violations: s.metrics.RETURN.violations }, { min: 1, max: 2, violations: 1 });
  assert.equal(s.metrics.COMF.violations, 3);
  assert.equal(s.metrics.PATH.max, 12);
  assert.equal(s.violatingFunctions, 3);
  assert.equal(his.summary(rows, { his: { thresholds: { RETURN: 2 } } }).metrics.RETURN.violations, 0);
  assert.equal(s.metrics.NOMV, undefined);
  const empty = his.summary([]);
  assert.equal(empty.functions, 0);
  assert.equal(empty.metrics.VG.count, 0);
  assert.equal(empty.metrics.VG.avg, null);
});

test('row shape matches the report table columns', () => {
  const [r] = rowsOf(C('int f(int a) { return a; }\n'));
  assert.deepEqual(Object.keys(r), ['file', 'function', 'line', 'COMF', 'PATH', 'GOTO', 'VG', 'CALLING', 'CALLS', 'PARAM', 'STMT', 'LEVEL', 'RETURN', 'VOCF', 'ap_cg_cycle']);
  assert.equal(his.METRICS.includes('VG'), true);
});

test('broken or foreign input never throws', () => {
  const inputs = [
    [],
    null,
    [{ path: 'x.py', lang: 'py', text: 'def f(): pass' }],
    C('int f( { if (;; ) } } }}} while'),
    C('#if 1\nint f(int a) {\n#else\n}\n'),
    C(''),
    C('void f(void) { for (;;) { } }\n'),
    [{ path: 'src/q.c', lang: 'c', text: null }],
  ];
  for (const files of inputs) {
    assert.doesNotThrow(() => run(files));
    assert.doesNotThrow(() => rowsOf(files));
    assert.doesNotThrow(() => his.fileMetrics(files));
  }
  assert.deepEqual(run(null), []);
  assert.deepEqual(rowsOf([{ path: 'x.py', lang: 'py', text: 'x = 1' }]), []);
  const inf = row(C('void f(void) { for (;;) { } }\n'), 'f');
  assert.equal(inf.PATH, 1);
});
