// Tests for the abstract-interpretation engine (core/absint).
// Every checker has true-positive cases (with the path events where it
// matters) and true-negative cases that a naive checker would flag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const absint = require('../core/absint');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function analyze(code, opts = {}) {
  const files = [{ path: opts.file || (opts.lang === 'cpp' ? 'a.cpp' : 'a.c'), text: code, lang: opts.lang || 'c' }];
  for (const x of opts.extra || []) files.push({ lang: opts.lang || 'c', ...x });
  const ctx = { inactive: new Set(), root: null, options: { absint: opts.absint || {}, models: opts.models }, stats: {} };
  const out = absint.analyze(files, ctx);
  out.stats = ctx.stats;
  return out;
}

function markerLine(code, marker = 'BUG') {
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(`/*${marker}*/`)) return i + 1;
  return null;
}

function of(findings, checker) {
  return findings.filter((f) => f.rule === `absint:${checker}`);
}

function expectTP(checker, code, opts = {}) {
  const found = analyze(code, opts);
  const hits = of(found, checker);
  assert.ok(hits.length > 0, `${checker} expected; got ${JSON.stringify(found.map((f) => `${f.line}:${f.checker}`))}`);
  const line = markerLine(code);
  if (line) assert.ok(hits.some((f) => f.line === line), `${checker} expected at line ${line}; got lines ${hits.map((f) => f.line)}`);
  for (const f of hits) {
    assert.ok(f.message && f.message.en && f.message.ko, 'bilingual message');
    assert.ok(Array.isArray(f.events) && f.events.some((e) => e.main), 'main event');
    assert.ok(f.confidence === 'definite' || f.confidence === 'possible');
  }
  return hits;
}

function expectTN(checker, code, opts = {}) {
  const found = analyze(code, opts);
  const hits = of(found, checker);
  assert.equal(hits.length, 0, `${checker} not expected; got ${JSON.stringify(hits.map((f) => `${f.line}: ${f.message.en}`))}`);
  return found;
}

const tags = (f) => f.events.map((e) => e.tag);

// ---------------------------------------------------------------- catalog

test('catalog lists every checker with Defect Analysis metadata', () => {
  const cat = absint.catalog();
  const keys = new Set(cat.map((m) => m.key));
  assert.equal(keys.size, cat.length);
  const expected = ['OVERRUN', 'NEGATIVE_RETURNS', 'INTEGER_OVERFLOW', 'DIVIDE_BY_ZERO', 'FORWARD_NULL', 'NULL_RETURNS', 'REVERSE_INULL',
    'RESOURCE_LEAK', 'USE_AFTER_FREE', 'DOUBLE_FREE', 'BAD_FREE', 'ALLOC_FREE_MISMATCH', 'UNINIT', 'UNINIT_CTOR', 'RETURN_LOCAL',
    'STRING_NULL', 'BUFFER_SIZE', 'SIZEOF_MISMATCH', 'CHECKED_RETURN', 'DEADCODE', 'UNREACHABLE', 'IDENTICAL_BRANCHES',
    'CONSTANT_EXPRESSION_RESULT', 'NO_EFFECT', 'MISSING_BREAK', 'MISSING_RETURN', 'INFINITE_LOOP', 'OVERLAPPING_COPY', 'BAD_SHIFT',
    'SIGN_EXTENSION', 'MIXED_ENUMS', 'COPY_PASTE_ERROR', 'LOCK', 'MISSING_LOCK', 'ORDER_REVERSAL', 'SLEEP', 'TAINTED_SCALAR',
    'TAINTED_STRING', 'STRING_OVERFLOW', 'FORMAT_STRING', 'OS_CMD_INJECTION',
    'USE_AFTER_MOVE', 'INVALIDATE_ITERATOR', 'MISMATCHED_ITERATOR', 'DELETE_VOID', 'VIRTUAL_DTOR', 'UNCAUGHT_EXCEPT',
    'COPY_WITHOUT_ASSIGN', 'ASSIGN_WITHOUT_COPY', 'AUTO_CAUSES_COPY', 'PASS_BY_VALUE', 'DC.STRING_BUFFER', 'DC.WEAK_CRYPTO', 'DC.STREAM_BUFFER',
    'OVERFLOW_BEFORE_WIDEN', 'ARRAY_VS_SINGLETON', 'SWAPPED_ARGUMENTS', 'UNUSED_VALUE', 'DELETE_ARRAY', 'STACK_USE', 'COPY_INSTEAD_OF_MOVE',
    'EVALUATION_ORDER', 'BAD_COMPARE', 'UNINTENDED_INTEGER_DIVISION', 'NESTING_INDENT_MISMATCH', 'MISSING_COMMA', 'STRAY_SEMICOLON',
    'CTOR_DTOR_LEAK', 'WRAPPER_ESCAPE', 'NULL_FIELD', 'SIZECHECK', 'BAD_SIZEOF'];
  for (const c of expected) assert.ok(keys.has(`absint:${c}`), c);
  for (const m of cat) {
    assert.match(m.key, /^absint:[A-Z_]+(\.[A-Z_]+)?$/);
    assert.ok(m.langs.includes('cpp') && m.langs.every((l) => l === 'c' || l === 'cpp'));
    assert.ok(['BUG', 'VULNERABILITY'].includes(m.type));
    assert.ok(m.name.en && m.name.ko && m.why.en && m.why.ko && m.fix.en && m.fix.ko);
    assert.ok(m.checker && m.category && m.impact);
    assert.match(m.cwe, /^CWE-\d+$/);
    assert.ok(m.tags.includes(m.cwe.toLowerCase()));
  }
});

test('analyze ignores non C files and fully inactive profiles', () => {
  assert.deepEqual(absint.analyze([{ path: 'a.js', text: 'x()', lang: 'js' }], { inactive: new Set(), options: {} }), []);
  const all = new Set(absint.catalog().map((m) => m.key));
  assert.deepEqual(absint.analyze([{ path: 'a.c', text: 'int f(void){int *p=0;return *p;}', lang: 'c' }], { inactive: all, options: {} }), []);
});

// ---------------------------------------------------------------- OVERRUN

test('OVERRUN TP: off-by-one loop writes past a local array', () => {
  const [f] = expectTP('OVERRUN', `
int f(void) {
  int a[10];
  for (int i = 0; i <= 10; i++)
    a[i] = i; /*BUG*/
  return a[0];
}`);
  assert.equal(f.confidence, 'definite');
  assert.ok(tags(f).includes('condition'));
});

test('OVERRUN TP: strcpy of a longer literal and malloc(strlen(s)) copy', () => {
  expectTP('OVERRUN', `
#include <string.h>
void f(void) {
  char b[4];
  strcpy(b, "hello"); /*BUG*/
}`);
  expectTP('OVERRUN', `
#include <stdlib.h>
#include <string.h>
char *dup(const char *s) {
  char *p = malloc(strlen(s));
  if (!p) return 0;
  strcpy(p, s); /*BUG*/
  return p;
}`);
});

test('OVERRUN TN: bounded loop, guarded index and sizeof-bounded copy', () => {
  expectTN('OVERRUN', `
#include <string.h>
int f(int i, const char *src) {
  int a[10];
  char b[16];
  for (int k = 0; k < 10; k++) a[k] = k;
  if (i >= 0 && i < 10) a[i] = 1;
  memcpy(b, src, sizeof(b));
  return a[9] + b[15];
}`);
  expectTN('OVERRUN', `
static int valid(int p) { return p >= 0 && p < 16; }
void set(unsigned char *out, int prio) {
  unsigned char map[2] = {0};
  if (!valid(prio)) return;
  map[prio / 8] = 1;
  out[0] = map[0];
}`);
});

// ---------------------------------------------------------------- NEGATIVE_RETURNS

test('NEGATIVE_RETURNS TP: read() result used as size and as index', () => {
  expectTP('NEGATIVE_RETURNS', `
#include <unistd.h>
#include <string.h>
void f(int fd, char *dst) {
  char buf[64];
  int n = read(fd, buf, sizeof(buf));
  memcpy(dst, buf, n); /*BUG*/
}`);
});

test('NEGATIVE_RETURNS TP: interprocedural negative error code used as index', () => {
  const [f] = expectTP('NEGATIVE_RETURNS', `
static int find(int key) {
  if (key > 100) return -1;
  return key % 8;
}
int lookup(int key) {
  int table[8] = {0};
  int i = find(key);
  return table[i]; /*BUG*/
}`);
  assert.ok(f.events.some((e) => e.line === 3), 'event in the callee');
});

test('NEGATIVE_RETURNS TN: the error value is checked first', () => {
  expectTN('NEGATIVE_RETURNS', `
#include <unistd.h>
#include <string.h>
void f(int fd, char *dst) {
  char buf[64];
  int n = read(fd, buf, sizeof(buf));
  if (n < 0) return;
  memcpy(dst, buf, n);
}`);
  expectTN('NEGATIVE_RETURNS', `
static int find(int key) { if (key > 100) return -1; return key % 8; }
int lookup(int key) {
  int table[8] = {0};
  int i = find(key);
  if (i < 0) return 0;
  return table[i];
}`);
});

// ---------------------------------------------------------------- INTEGER_OVERFLOW

test('INTEGER_OVERFLOW TP: constant signed overflow and range overflow after refinement', () => {
  expectTP('INTEGER_OVERFLOW', `
int f(void) {
  int x = 2147483647;
  x = x + 1; /*BUG*/
  return x;
}`);
  expectTP('INTEGER_OVERFLOW', `
int g(int x) {
  if (x > 1000000000 && x < 1500000000)
    return x * 2; /*BUG*/
  return 0;
}`);
});

test('INTEGER_OVERFLOW TP: unsigned wrap-around used as an allocation size', () => {
  expectTP('INTEGER_OVERFLOW', `
#include <stdlib.h>
char *f(void) {
  unsigned int n = 0;
  return malloc(n - 1); /*BUG*/
}`);
});

test('INTEGER_OVERFLOW TN: unknown operands and guarded arithmetic', () => {
  expectTN('INTEGER_OVERFLOW', `
int f(int x, int y) {
  int a = x / 2 + 1;
  int b = 0;
  if (x < 1000 && x > -1000) b = x * 2;
  return a + b + y;
}`);
  expectTN('INTEGER_OVERFLOW', `
#include <stdlib.h>
char *g(unsigned int n) {
  if (n == 0) return 0;
  return malloc(n - 1);
}`);
});

// ---------------------------------------------------------------- DIVIDE_BY_ZERO

test('DIVIDE_BY_ZERO TP: zero divisor and interprocedural division by a zero argument', () => {
  expectTP('DIVIDE_BY_ZERO', `
int f(int a) {
  int d = 0;
  return a / d; /*BUG*/
}`);
  const [f] = expectTP('DIVIDE_BY_ZERO', `
static int ratio(int a, int b) { return a / b; }
int use(int x) {
  return ratio(x, 0); /*BUG*/
}`);
  assert.ok(f.events.some((e) => e.line === 2), 'callee event');
});

test('DIVIDE_BY_ZERO TP: loop counter starting at zero is a possible zero divisor', () => {
  const [f] = expectTP('DIVIDE_BY_ZERO', `
int f(void) {
  int s = 0;
  for (int i = 0; i < 5; i++)
    s += 100 / i; /*BUG*/
  return s;
}`);
  assert.ok(f.confidence === 'possible' || f.confidence === 'definite');
});

test('DIVIDE_BY_ZERO TN: divisor checked against zero', () => {
  expectTN('DIVIDE_BY_ZERO', `
int f(int a, int d) {
  if (d != 0) return a / d;
  return 0;
}`);
  expectTN('DIVIDE_BY_ZERO', `
static int ratio(int a, int b) { if (b == 0) return 0; return a / b; }
int use(int x) { return ratio(x, 0) + ratio(x, 3); }`);
});

// ---------------------------------------------------------------- FORWARD_NULL

test('FORWARD_NULL TP: dereference after a null check, with the check in the events', () => {
  const [f] = expectTP('FORWARD_NULL', `
struct s { int v; };
int f(struct s *p) {
  if (p == 0) {
    return p->v; /*BUG*/
  }
  return 0;
}`);
  assert.ok(tags(f).includes('null_check'));
});

test('FORWARD_NULL TP: null passed to a function that dereferences it (cross-file events)', () => {
  const [f] = expectTP('FORWARD_NULL', `
void helper(int *q);
void caller(void) {
  int *p = 0;
  helper(p); /*BUG*/
}`, { extra: [{ path: 'b.c', text: 'void helper(int *q) {\n  *q = 1;\n}\n' }] });
  assert.ok(tags(f).includes('assign_zero'));
  assert.ok(f.events.some((e) => e.file === 'b.c' && e.line === 2), 'event in the callee file');
});

test('FORWARD_NULL TN: early return on null and reassignment before use', () => {
  expectTN('FORWARD_NULL', `
int f(int *p) {
  if (!p) return 0;
  return *p;
}
int g(int c) {
  int x = 1;
  int *p = 0;
  p = &x;
  return *p + c;
}`);
  expectTN('FORWARD_NULL', `
void helper(int *q) { if (q) *q = 1; }
void caller(void) { helper(0); }`);
});

// ---------------------------------------------------------------- NULL_RETURNS

test('NULL_RETURNS TP: unchecked fopen result passed to fgets', () => {
  const [f] = expectTP('NULL_RETURNS', `
#include <stdio.h>
void f(char *buf) {
  FILE *fp = fopen("a.txt", "r");
  fgets(buf, 10, fp); /*BUG*/
  fclose(fp);
}`);
  assert.ok(tags(f).includes('returned_null'));
});

test('NULL_RETURNS TP: project function returning NULL, checked by other callers', () => {
  expectTP('NULL_RETURNS', `
struct node { int key; struct node *next; };
static struct node table[4];
struct node *lookup(int k) {
  if (k < 0 || k >= 4) return 0;
  return &table[k];
}
int a(int k) { struct node *n = lookup(k); if (!n) return -1; return n->key; }
int b(int k) { struct node *n = lookup(k); if (n == 0) return -1; return n->key; }
int c(int k) {
  struct node *n = lookup(k);
  return n->key; /*BUG*/
}`);
});

test('NULL_RETURNS TN: checked result, and unchecked malloc by default', () => {
  expectTN('NULL_RETURNS', `
#include <stdlib.h>
#include <string.h>
int f(void) {
  char *e = getenv("HOME");
  if (!e) return 0;
  return (int)strlen(e);
}
void g(void) {
  char *p = malloc(8);
  p[0] = 0;
  free(p);
}`);
  expectTN('NULL_RETURNS', `
struct node { int key; };
static struct node one;
struct node *get(int k) { if (k) return 0; return &one; }
int a(int k) { return get(k)->key; }
int b(int k) { struct node *n = get(k); return n->key; }`);
});

// ---------------------------------------------------------------- REVERSE_INULL

test('REVERSE_INULL TP: dereference before the null check', () => {
  const [f] = expectTP('REVERSE_INULL', `
struct s { int x; };
int f(struct s *p) {
  int v = p->x;
  if (!p) return -1; /*BUG*/
  return v;
}`);
  assert.ok(tags(f).includes('deref'));
  expectTP('REVERSE_INULL', `
void g(int *q) {
  *q = 1;
  if (q == 0) /*BUG*/
    return;
  *q = 2;
}`);
});

test('REVERSE_INULL TN: check before dereference, dereference on one path only', () => {
  expectTN('REVERSE_INULL', `
struct s { int x; };
int f(struct s *p) {
  if (!p) return -1;
  return p->x;
}
int g(struct s *p, int c) {
  int v = 0;
  if (c) v = p->x;
  if (!p) return -1;
  return v;
}`);
});

// ---------------------------------------------------------------- RESOURCE_LEAK

test('RESOURCE_LEAK TP: early return leaks malloc and fopen results', () => {
  const [f] = expectTP('RESOURCE_LEAK', `
#include <stdlib.h>
void f(int n) {
  char *p = malloc(10);
  if (n > 3) return; /*BUG*/
  free(p);
}`);
  assert.ok(tags(f).includes('alloc_fn'));
  expectTP('RESOURCE_LEAK', `
#include <stdio.h>
int g(int x) {
  FILE *fp = fopen("a", "r");
  if (!fp) return -1;
  if (x) return 1; /*BUG*/
  fclose(fp);
  return 0;
}`);
});

test('RESOURCE_LEAK TP: allocation overwritten in a loop', () => {
  expectTP('RESOURCE_LEAK', `
#include <stdlib.h>
void f(int n) {
  char *p = 0;
  for (int i = 0; i < n; i++)
    p = malloc(16); /*BUG*/
  free(p);
}`);
});

test('RESOURCE_LEAK TN: ownership transferred, returned, or freed on all paths', () => {
  expectTN('RESOURCE_LEAK', `
#include <stdlib.h>
static char *keep;
void store(void) { char *p = malloc(4); keep = p; }
char *make(void) { char *p = malloc(4); return p; }
void both(int c) { char *p = malloc(4); if (c) { free(p); return; } free(p); }
void give(void (*sink)(char *)) { char *p = malloc(4); sink(p); }
struct box { char *data; };
void into(struct box *b) { b->data = malloc(4); }`);
  expectTN('RESOURCE_LEAK', `
#include <stdlib.h>
void f(void) {
  char *p = malloc(4);
  if (!p) return;
  free(p);
}
void g(void) {
  char *p = malloc(8);
  char *q = realloc(p, 16);
  if (!q) { free(p); return; }
  free(q);
}`);
});

// ---------------------------------------------------------------- USE_AFTER_FREE

test('USE_AFTER_FREE TP: write after free, also through a releasing helper', () => {
  const [f] = expectTP('USE_AFTER_FREE', `
#include <stdlib.h>
void f(void) {
  char *p = malloc(10);
  if (!p) return;
  free(p);
  p[0] = 1; /*BUG*/
}`);
  assert.ok(tags(f).includes('freed_arg'));
  expectTP('USE_AFTER_FREE', `
#include <stdlib.h>
static void release(char *p) { free(p); }
void g(void) {
  char *q = malloc(10);
  if (!q) return;
  release(q);
  q[1] = 2; /*BUG*/
}`);
});

test('USE_AFTER_FREE TN: pointer reset after free, or freed on another path', () => {
  expectTN('USE_AFTER_FREE', `
#include <stdlib.h>
void f(int c) {
  char *p = malloc(10);
  if (!p) return;
  free(p);
  p = 0;
  if (p) p[0] = 1;
}
void g(int c) {
  char *p = malloc(10);
  if (!p) return;
  if (c) { free(p); return; }
  p[0] = 1;
  free(p);
}`);
});

// ---------------------------------------------------------------- DOUBLE_FREE

test('DOUBLE_FREE TP: second free, directly and through a helper', () => {
  expectTP('DOUBLE_FREE', `
#include <stdlib.h>
void f(void) {
  char *p = malloc(10);
  free(p);
  free(p); /*BUG*/
}`);
  expectTP('DOUBLE_FREE', `
#include <stdlib.h>
static void release(char *p) { free(p); }
void g(void) {
  char *q = malloc(10);
  release(q);
  free(q); /*BUG*/
}`);
});

test('DOUBLE_FREE TN: pointer nulled between frees, frees on exclusive paths', () => {
  expectTN('DOUBLE_FREE', `
#include <stdlib.h>
void f(void) { char *p = malloc(10); free(p); p = 0; free(p); }
void g(int c) { char *p = malloc(10); if (c) free(p); else free(p); }`);
});

// ---------------------------------------------------------------- BAD_FREE

test('BAD_FREE TP: freeing a stack array, a string literal and an offset pointer', () => {
  expectTP('BAD_FREE', `
#include <stdlib.h>
void f(void) {
  char buf[10];
  free(buf); /*BUG*/
}`);
  expectTP('BAD_FREE', `
#include <stdlib.h>
void g(void) {
  char *p = malloc(10);
  if (!p) return;
  p++;
  free(p); /*BUG*/
}`);
  expectTP('BAD_FREE', `
#include <stdlib.h>
void h(void) {
  char *s = "text";
  free(s); /*BUG*/
}`);
});

test('BAD_FREE TN: heap pointer freed at its start', () => {
  expectTN('BAD_FREE', `
#include <stdlib.h>
void f(void) {
  char buf[4];
  char *p = buf;
  p = malloc(10);
  free(p);
}
void g(void) { char *p = malloc(10); char *q = p + 1; (void)q; free(p); }`);
});

// ---------------------------------------------------------------- ALLOC_FREE_MISMATCH

test('ALLOC_FREE_MISMATCH TP: new[] released with delete, malloc released with delete', () => {
  expectTP('ALLOC_FREE_MISMATCH', `
void f() {
  int *p = new int[10];
  delete p; /*BUG*/
}`, { lang: 'cpp' });
  expectTP('ALLOC_FREE_MISMATCH', `
#include <stdlib.h>
void g() {
  int *q = (int *)malloc(4);
  delete q; /*BUG*/
}`, { lang: 'cpp' });
});

test('ALLOC_FREE_MISMATCH TN: matching release functions', () => {
  expectTN('ALLOC_FREE_MISMATCH', `
#include <stdlib.h>
void f() { int *p = new int[10]; delete[] p; }
void g() { int *q = (int *)malloc(4); free(q); }
void h() { int *r = new int; delete r; }`, { lang: 'cpp' });
});

// ---------------------------------------------------------------- UNINIT

test('UNINIT TP: variable assigned on one path only, and accumulator never initialized', () => {
  const [f] = expectTP('UNINIT', `
int f(int c) {
  int x;
  if (c) x = 1;
  return x; /*BUG*/
}`);
  assert.ok(tags(f).includes('var_decl'));
  expectTP('UNINIT', `
int g(int n) {
  int sum;
  for (int i = 0; i < n; i++)
    sum += i; /*BUG*/
  return 0;
}`);
});

test('UNINIT TN: assigned on every path, through a pointer, or by scanf', () => {
  expectTN('UNINIT', `
#include <stdio.h>
void init(int *p);
int f(int c) { int x; if (c) x = 1; else x = 2; return x; }
int g(void) { int y; init(&y); return y; }
int h(void) { int z; if (scanf("%d", &z) != 1) return 0; return z; }`);
  expectTN('UNINIT', `
#include <string.h>
int k(void) { char b[8]; memset(b, 0, sizeof(b)); return b[3]; }
int m(int n) { int a[4]; for (int i = 0; i < 4; i++) a[i] = n; return a[2]; }`);
});

// ---------------------------------------------------------------- UNINIT_CTOR

test('UNINIT_CTOR TP: constructor misses a scalar and a pointer member', () => {
  const hits = expectTP('UNINIT_CTOR', `
class Box {
public:
  Box(int w);
private:
  int w_;
  int h_;
  char *name_;
};
Box::Box(int w) : w_(w) { } /*BUG*/
`, { lang: 'cpp' });
  assert.ok(hits.some((f) => /h_/.test(f.message.en)) && hits.some((f) => /name_/.test(f.message.en)));
});

test('UNINIT_CTOR TP: in-class constructor leaves a pointer member unset on every path', () => {
  const [f] = expectTP('UNINIT_CTOR', `
struct Node {
  Node(int v) { value = v; if (v > 0) count = 1; else count = 0; } /*BUG*/
  int value;
  int count;
  Node *next;
};`, { lang: 'cpp' });
  assert.match(f.message.en, /next/);
  assert.ok(f.events.some((e) => e.tag === 'member_decl'));
});

test('UNINIT_CTOR TN: init list, body assignment and default member initializers', () => {
  expectTN('UNINIT_CTOR', `
class A {
public:
  A(int v) : a_(v), b_(0) { c_ = 0; }
private:
  int a_;
  int b_;
  int c_;
  int d_ = 3;
  static int s_;
};
class B {
public:
  B() { init(); }
  void init();
private:
  int x_;
};`, { lang: 'cpp' });
});

// ---------------------------------------------------------------- RETURN_LOCAL

test('RETURN_LOCAL TP: address of a local scalar and a local array escape', () => {
  expectTP('RETURN_LOCAL', `
int *f(void) {
  int x = 3;
  return &x; /*BUG*/
}`);
  expectTP('RETURN_LOCAL', `
char *g(void) {
  char buf[16];
  buf[0] = 0;
  return buf; /*BUG*/
}`);
});

test('RETURN_LOCAL TN: static storage and heap storage', () => {
  expectTN('RETURN_LOCAL', `
#include <stdlib.h>
char *f(void) { static char buf[16]; return buf; }
char *g(void) { char *p = malloc(4); return p; }
const char *h(void) { return "literal"; }`);
});

// ---------------------------------------------------------------- STRING_NULL

test('STRING_NULL TP: buffer filled by read() and by strncpy used as a string', () => {
  const [f] = expectTP('STRING_NULL', `
#include <unistd.h>
#include <string.h>
int f(int fd) {
  char b[8];
  if (read(fd, b, sizeof(b)) < 0) return 0;
  return (int)strlen(b); /*BUG*/
}`);
  assert.ok(tags(f).includes('string_null_source'));
  expectTP('STRING_NULL', `
#include <stdio.h>
#include <string.h>
void g(const char *s) {
  char d[8];
  strncpy(d, s, 8);
  printf("%s", d); /*BUG*/
}`);
});

test('STRING_NULL TN: explicit termination before the string use', () => {
  expectTN('STRING_NULL', `
#include <unistd.h>
#include <string.h>
int f(int fd) {
  char b[8];
  if (read(fd, b, 7) < 0) return 0;
  b[7] = 0;
  return (int)strlen(b);
}
void g(char *d, const char *s, unsigned long n) {
  strncpy(d, s, n - 1);
  d[n - 1] = 0;
  (void)strlen(d);
}`);
});

// ---------------------------------------------------------------- BUFFER_SIZE

test('BUFFER_SIZE TP: strncpy and strncat with the full buffer size', () => {
  expectTP('BUFFER_SIZE', `
#include <string.h>
void f(const char *s) {
  char d[16];
  strncpy(d, s, sizeof(d)); /*BUG*/
  (void)d;
}`);
  expectTP('BUFFER_SIZE', `
#include <string.h>
void g(const char *s) {
  char d[16] = "x";
  strncat(d, s, sizeof(d)); /*BUG*/
}`);
});

test('BUFFER_SIZE TN: room left for the terminator', () => {
  expectTN('BUFFER_SIZE', `
#include <string.h>
void f(const char *s) {
  char d[16];
  strncpy(d, s, sizeof(d) - 1);
  d[15] = 0;
}
void g(const char *s) {
  char d[16];
  strncpy(d, s, sizeof(d));
  d[sizeof(d) - 1] = '\\0';
}`);
});

// ---------------------------------------------------------------- SIZEOF_MISMATCH

test('SIZEOF_MISMATCH TP: allocation and memset sized by the pointer', () => {
  expectTP('SIZEOF_MISMATCH', `
#include <stdlib.h>
struct item { int a, b, c, d; };
struct item *f(void) {
  struct item *p = malloc(sizeof(p)); /*BUG*/
  return p;
}`);
  expectTP('SIZEOF_MISMATCH', `
#include <string.h>
struct item { int a, b, c, d; };
void g(struct item *p) {
  memset(p, 0, sizeof(p)); /*BUG*/
}`);
});

test('SIZEOF_MISMATCH TN: element sizes', () => {
  expectTN('SIZEOF_MISMATCH', `
#include <stdlib.h>
#include <string.h>
struct item { int a, b; };
struct item *f(void) { struct item *p = malloc(sizeof(*p)); return p; }
char **g(int n) { char **v = malloc(n * sizeof(char *)); return v; }
void h(struct item *p) { memset(p, 0, sizeof(*p)); }`);
});

// ---------------------------------------------------------------- CHECKED_RETURN

test('CHECKED_RETURN TP: result ignored where most callers check it; setuid ignored', () => {
  expectTP('CHECKED_RETURN', `
int open_dev(int n);
int a(void) { if (open_dev(1) < 0) return -1; return 0; }
int b(void) { int r = open_dev(2); return r; }
int c(void) { return open_dev(3) == 0; }
void d(void) {
  open_dev(4); /*BUG*/
}`);
  expectTP('CHECKED_RETURN', `
int setuid(unsigned int uid);
void drop(void) {
  setuid(1000); /*BUG*/
}`);
});

test('CHECKED_RETURN TN: result never checked, or explicitly discarded', () => {
  expectTN('CHECKED_RETURN', `
int log_line(const char *s);
int open_dev(int n);
void a(void) { log_line("a"); log_line("b"); log_line("c"); }
int b(void) { if (open_dev(1)) return 1; if (open_dev(2)) return 2; if (open_dev(3)) return 3; (void)open_dev(4); return 0; }`);
});

// ---------------------------------------------------------------- DEADCODE

test('DEADCODE TP: repeated null check and interprocedural constant range', () => {
  const [f] = expectTP('DEADCODE', `
int f(int *p) {
  if (p == 0) return 0;
  *p = 1;
  if (p == 0)
    return -1; /*BUG*/
  return 1;
}`);
  assert.ok(tags(f).includes('cond_const'));
  expectTP('DEADCODE', `
static int panel_width(int real) {
  int w = real;
  if (w < 400) w = 900;
  return w;
}
int layout(int r) {
  int w = panel_width(r);
  if (w < 400)
    w = 400; /*BUG*/
  return w;
}`);
});

test('DEADCODE TN: feasible branches, globals and macro constants', () => {
  expectTN('DEADCODE', `
#define DEBUG 0
static int flag;
int f(int x) {
  int r = 0;
  if (x > 5) r = 1;
  if (x > 3) r += 2;
  if (DEBUG) r = 7;
  flag = 0;
  if (flag) r = 9;
  return r;
}`);
});

// ---------------------------------------------------------------- UNREACHABLE

test('UNREACHABLE TP: statements after return and after break', () => {
  expectTP('UNREACHABLE', `
int f(int x) {
  return x;
  x = 2; /*BUG*/
}`);
  expectTP('UNREACHABLE', `
int g(int n) {
  while (n) {
    break;
    n--; /*BUG*/
  }
  return n;
}`);
});

test('UNREACHABLE TN: break after return in switch, labels reached by goto', () => {
  expectTN('UNREACHABLE', `
int f(int x) {
  switch (x) {
    case 1: return 1;
      break;
    default: break;
  }
  if (x > 9) goto out;
  x++;
out:
  return x;
}`);
});

// ---------------------------------------------------------------- IDENTICAL_BRANCHES

test('IDENTICAL_BRANCHES TP: identical if/else and identical ?: results', () => {
  expectTP('IDENTICAL_BRANCHES', `
int f(int c, int a) {
  int r;
  if (c) { r = a + 1; } else { r = a + 1; } /*BUG*/
  return r;
}`);
  expectTP('IDENTICAL_BRANCHES', `
int g(int c, int a) {
  return c ? a * 2 : a * 2; /*BUG*/
}`);
});

test('IDENTICAL_BRANCHES TN: different branches and else-if chains', () => {
  expectTN('IDENTICAL_BRANCHES', `
int f(int c, int a) {
  int r;
  if (c) r = a + 1; else r = a - 1;
  if (c == 1) r = 0; else if (c == 2) r = 0;
  return c ? r : a;
}`);
});

// ---------------------------------------------------------------- CONSTANT_EXPRESSION_RESULT

test('CONSTANT_EXPRESSION_RESULT TP: || with a constant, unsigned < 0, impossible mask', () => {
  expectTP('CONSTANT_EXPRESSION_RESULT', `
int f(int x) {
  if (x == 1 || 2) /*BUG*/
    return 1;
  return 0;
}`);
  expectTP('CONSTANT_EXPRESSION_RESULT', `
int g(unsigned int u) {
  if (u < 0) /*BUG*/
    return -1;
  return 0;
}`);
  expectTP('CONSTANT_EXPRESSION_RESULT', `
int h(int x) {
  return (x & 4) == 8; /*BUG*/
}`);
});

test('CONSTANT_EXPRESSION_RESULT TN: real comparisons, signed and enum tests', () => {
  expectTN('CONSTANT_EXPRESSION_RESULT', `
enum mode { M0, M1 };
int f(int x, int i, enum mode m) {
  if (x == 1 || x == 2) return 1;
  if (i < 0) return 2;
  if (m < 0) return 3;
  if ((x & 12) == 8) return 4;
  return 0;
}`);
});

// ---------------------------------------------------------------- NO_EFFECT

test('NO_EFFECT TP: discarded comparison, self assignment, array compared to NULL', () => {
  expectTP('NO_EFFECT', `
void f(int x) {
  x == 1; /*BUG*/
}`);
  expectTP('NO_EFFECT', `
struct s { int v; };
void g(struct s *p) {
  p->v = p->v; /*BUG*/
}`);
  expectTP('NO_EFFECT', `
#include <stddef.h>
int h(void) {
  char buf[8];
  buf[0] = 0;
  if (buf == NULL) /*BUG*/
    return 1;
  return 0;
}`);
});

test('NO_EFFECT TN: void casts, increments and C++ stream operators', () => {
  expectTN('NO_EFFECT', `
void f(int x, int *p) {
  (void)x;
  x++;
  *p = x;
}`);
  expectTN('NO_EFFECT', `
#include <iostream>
void g(int x) {
  std::cout << "value " << x << std::endl;
}`, { lang: 'cpp' });
});

// ---------------------------------------------------------------- MISSING_BREAK

test('MISSING_BREAK TP: case falls through into the next case and into default', () => {
  expectTP('MISSING_BREAK', `
int f(int x) {
  int r = 0;
  switch (x) {
    case 1:
      r = 10;
    case 2: /*BUG*/
      r += 2;
      break;
  }
  return r;
}`);
  expectTP('MISSING_BREAK', `
int g(int x) {
  int r = 0;
  switch (x) {
    case 1: r = 1; break;
    case 2: r = 2;
    default: /*BUG*/
      r++;
  }
  return r;
}`);
});

test('MISSING_BREAK TN: fall-through comment, grouped labels, return', () => {
  expectTN('MISSING_BREAK', `
int f(int x) {
  int r = 0;
  switch (x) {
    case 1:
      r = 1;
      /* fallthrough */
    case 2:
    case 3:
      r += 3;
      break;
    case 4:
      return 4;
    default:
      r = 9;
  }
  return r;
}`);
});

// ---------------------------------------------------------------- MISSING_RETURN

test('MISSING_RETURN TP: if without else and switch without default', () => {
  expectTP('MISSING_RETURN', `
int f(int x) {
  if (x > 0) return 1;
} /*BUG*/
`);
  expectTP('MISSING_RETURN', `
int g(int x) {
  switch (x) {
    case 1: return 10;
    case 2: return 20;
  }
} /*BUG*/
`);
});

test('MISSING_RETURN TN: all paths return or end in exit, and main', () => {
  expectTN('MISSING_RETURN', `
#include <stdlib.h>
int f(int x) { if (x > 0) return 1; return 0; }
int g(int x) { if (x) return 1; exit(1); }
int h(int x) { while (1) { if (x++ > 10) return x; } }
int main(void) { }`);
});

// ---------------------------------------------------------------- INFINITE_LOOP

test('INFINITE_LOOP TP: loop variable never updated', () => {
  expectTP('INFINITE_LOOP', `
int f(int *a) {
  int j = 0;
  for (int i = 0; i < 10; j++) /*BUG*/
    a[j % 4] = j;
  return j;
}`);
  expectTP('INFINITE_LOOP', `
int g(int n) {
  int m = 0;
  if (n <= 0) return 0;
  while (n > 0) /*BUG*/
    m--;
  return m;
}`);
});

test('INFINITE_LOOP TN: counting loop, loop with break, loop calling a function', () => {
  expectTN('INFINITE_LOOP', `
int poll(void);
int f(int n) {
  int s = 0;
  for (int i = 0; i < n; i++) s += i;
  int k = 5;
  while (k > 0) { if (s > 3) break; s++; }
  int r = 1;
  while (r > 0) { r = poll(); }
  return s + k + r;
}`);
});

// ---------------------------------------------------------------- OVERLAPPING_COPY

test('OVERLAPPING_COPY TP: memcpy within one buffer and sprintf into its own argument', () => {
  expectTP('OVERLAPPING_COPY', `
#include <string.h>
void f(void) {
  char buf[16] = {0};
  memcpy(buf + 1, buf, 8); /*BUG*/
}`);
  expectTP('OVERLAPPING_COPY', `
#include <stdio.h>
void g(void) {
  char buf[32] = "abc";
  sprintf(buf, "%s!", buf); /*BUG*/
}`);
});

test('OVERLAPPING_COPY TN: memmove and disjoint ranges', () => {
  expectTN('OVERLAPPING_COPY', `
#include <string.h>
void f(void) {
  char buf[16] = {0};
  memmove(buf + 1, buf, 8);
  memcpy(buf + 8, buf, 8);
}`);
});

// ---------------------------------------------------------------- BAD_SHIFT

test('BAD_SHIFT TP: shift by the type width and by a loop bound reaching it', () => {
  expectTP('BAD_SHIFT', `
int f(void) {
  int s = 32;
  return 1 << s; /*BUG*/
}`);
  expectTP('BAD_SHIFT', `
unsigned g(void) {
  unsigned m = 0;
  for (int i = 0; i <= 32; i++)
    m |= 1u << i; /*BUG*/
  return m;
}`);
});

test('BAD_SHIFT TN: shifts within range', () => {
  expectTN('BAD_SHIFT', `
unsigned f(unsigned s) {
  unsigned v = 1u << 31;
  if (s < 32) v |= 1u << s;
  for (int i = 0; i < 32; i++) v ^= 1u << i;
  return v;
}`);
});

// ---------------------------------------------------------------- SIGN_EXTENSION

test('SIGN_EXTENSION TP: byte shifted into the sign bit then widened', () => {
  expectTP('SIGN_EXTENSION', `
unsigned long f(const unsigned char *p) {
  unsigned long v = p[0] << 24; /*BUG*/
  return v;
}`);
  expectTP('SIGN_EXTENSION', `
unsigned long long g(const unsigned char *p) {
  unsigned long long v;
  v = (p[3] << 24) | p[2]; /*BUG*/
  return v;
}`);
});

test('SIGN_EXTENSION TN: cast before shifting, or 32-bit destination', () => {
  expectTN('SIGN_EXTENSION', `
unsigned long f(const unsigned char *p) { unsigned long v = (unsigned long)p[0] << 24; return v; }
unsigned int g(const unsigned char *p) { unsigned int v = p[0] << 24; return v; }
unsigned long h(const unsigned char *p) { unsigned long v = p[0] << 8; return v; }`);
});

// ---------------------------------------------------------------- MIXED_ENUMS

test('MIXED_ENUMS TP: comparison and assignment across enum types', () => {
  expectTP('MIXED_ENUMS', `
enum color { RED, GREEN };
enum shape { CIRCLE, SQUARE };
int f(enum color c) {
  return c == SQUARE; /*BUG*/
}`);
  expectTP('MIXED_ENUMS', `
enum color { RED, GREEN };
enum shape { CIRCLE, SQUARE };
void g(void) {
  enum color c;
  c = CIRCLE; /*BUG*/
  (void)c;
}`);
});

test('MIXED_ENUMS TN: same enum and explicit conversion', () => {
  expectTN('MIXED_ENUMS', `
enum color { RED, GREEN };
enum shape { CIRCLE, SQUARE };
int f(enum color c, enum shape s) {
  if (c == GREEN) return 1;
  return (int)c == (int)s;
}`);
});

// ---------------------------------------------------------------- COPY_PASTE_ERROR

test('COPY_PASTE_ERROR TP: one identifier left unrenamed in a copied statement', () => {
  const [f] = expectTP('COPY_PASTE_ERROR', `
struct v { int x, y; };
void scale(struct v *a, const struct v *b, int sx, int sy) {
  a->x = b->x * sx;
  a->y = b->y * sx; /*BUG*/
}`);
  assert.match(f.message.en, /sy/);
  expectTP('COPY_PASTE_ERROR', `
struct r { int w, h; };
void pad(struct r *o, const struct r *s, int pad_w, int pad_h) {
  o->w = s->w + pad_w;
  o->h = s->h + pad_w; /*BUG*/
}`);
});

test('COPY_PASTE_ERROR TN: consistent renaming, or no counterpart name', () => {
  expectTN('COPY_PASTE_ERROR', `
struct v { int x, y; };
void scale(struct v *a, const struct v *b, int sx, int sy) {
  a->x = b->x * sx;
  a->y = b->y * sy;
}
void same(struct v *a, const struct v *b, int k) {
  a->x = b->x * k;
  a->y = b->y * k;
}`);
});

// ---------------------------------------------------------------- locks

const PTHREAD = `
typedef struct { int v; } pthread_mutex_t;
int pthread_mutex_lock(pthread_mutex_t *m);
int pthread_mutex_unlock(pthread_mutex_t *m);
int pthread_mutex_trylock(pthread_mutex_t *m);
unsigned int sleep(unsigned int s);
`;

test('LOCK TP: lock still held on an error return; lock acquired twice', () => {
  const [f] = expectTP('LOCK', `${PTHREAD}
static pthread_mutex_t mu;
static int shared;
int f(int err) {
  pthread_mutex_lock(&mu);
  if (err) return -1; /*BUG*/
  shared++;
  pthread_mutex_unlock(&mu);
  return 0;
}`);
  assert.ok(tags(f).includes('lock'));
  expectTP('LOCK', `${PTHREAD}
static pthread_mutex_t mu;
void g(void) {
  pthread_mutex_lock(&mu);
  pthread_mutex_lock(&mu); /*BUG*/
  pthread_mutex_unlock(&mu);
}`);
});

test('LOCK TN: released on all paths; trylock result checked', () => {
  expectTN('LOCK', `${PTHREAD}
static pthread_mutex_t mu;
static int shared;
int f(int err) {
  pthread_mutex_lock(&mu);
  if (err) { pthread_mutex_unlock(&mu); return -1; }
  shared++;
  pthread_mutex_unlock(&mu);
  return 0;
}
int g(void) {
  if (pthread_mutex_trylock(&mu) != 0) return -1;
  shared++;
  pthread_mutex_unlock(&mu);
  return 0;
}`);
});

test('MISSING_LOCK TP: shared counter updated without its usual lock', () => {
  expectTP('MISSING_LOCK', `${PTHREAD}
static pthread_mutex_t mu;
static int counter;
void a(void) { pthread_mutex_lock(&mu); counter++; pthread_mutex_unlock(&mu); }
void b(void) { pthread_mutex_lock(&mu); counter += 2; pthread_mutex_unlock(&mu); }
int c(void) { int v; pthread_mutex_lock(&mu); v = counter; pthread_mutex_unlock(&mu); return v; }
void d(void) { pthread_mutex_lock(&mu); counter = 0; pthread_mutex_unlock(&mu); }
void e(void) {
  counter--; /*BUG*/
}`);
});

test('MISSING_LOCK TP: unlocked read of a lock-protected variable', () => {
  expectTP('MISSING_LOCK', `${PTHREAD}
static pthread_mutex_t mu;
static int level;
void up(void) { pthread_mutex_lock(&mu); level++; pthread_mutex_unlock(&mu); }
void down(void) { pthread_mutex_lock(&mu); level--; pthread_mutex_unlock(&mu); }
void reset(void) { pthread_mutex_lock(&mu); level = 0; pthread_mutex_unlock(&mu); }
int report(void) {
  return level; /*BUG*/
}`);
});

test('MISSING_LOCK TN: helper always called with the lock held, init code', () => {
  expectTN('MISSING_LOCK', `${PTHREAD}
static pthread_mutex_t mu;
static int counter;
static void bump(void) { counter++; }
void a(void) { pthread_mutex_lock(&mu); bump(); counter++; pthread_mutex_unlock(&mu); }
void b(void) { pthread_mutex_lock(&mu); bump(); counter++; pthread_mutex_unlock(&mu); }
void c(void) { pthread_mutex_lock(&mu); counter += 2; pthread_mutex_unlock(&mu); }
void module_init(void) { counter = 0; }`);
});

test('ORDER_REVERSAL TP: two locks taken in both orders, directly and through a callee', () => {
  expectTP('ORDER_REVERSAL', `${PTHREAD}
static pthread_mutex_t ma, mb;
void f(void) { pthread_mutex_lock(&ma); pthread_mutex_lock(&mb); pthread_mutex_unlock(&mb); pthread_mutex_unlock(&ma); }
void g(void) {
  pthread_mutex_lock(&mb);
  pthread_mutex_lock(&ma); /*BUG*/
  pthread_mutex_unlock(&ma);
  pthread_mutex_unlock(&mb);
}`);
  expectTP('ORDER_REVERSAL', `${PTHREAD}
static pthread_mutex_t ma, mb;
static void touch_a(void) { pthread_mutex_lock(&ma); pthread_mutex_unlock(&ma); }
void f(void) { pthread_mutex_lock(&ma); pthread_mutex_lock(&mb); pthread_mutex_unlock(&mb); pthread_mutex_unlock(&ma); }
void g(void) {
  pthread_mutex_lock(&mb);
  touch_a(); /*BUG*/
  pthread_mutex_unlock(&mb);
}`);
});

test('ORDER_REVERSAL TN: consistent order, or the first lock released first', () => {
  expectTN('ORDER_REVERSAL', `${PTHREAD}
static pthread_mutex_t ma, mb;
void f(void) { pthread_mutex_lock(&ma); pthread_mutex_lock(&mb); pthread_mutex_unlock(&mb); pthread_mutex_unlock(&ma); }
void g(void) { pthread_mutex_lock(&ma); pthread_mutex_lock(&mb); pthread_mutex_unlock(&mb); pthread_mutex_unlock(&ma); }
void h(void) { pthread_mutex_lock(&mb); pthread_mutex_unlock(&mb); pthread_mutex_lock(&ma); pthread_mutex_unlock(&ma); }`);
});

test('SLEEP TP: blocking call while holding a lock, directly and through a helper', () => {
  expectTP('SLEEP', `${PTHREAD}
static pthread_mutex_t mu;
void f(void) {
  pthread_mutex_lock(&mu);
  sleep(1); /*BUG*/
  pthread_mutex_unlock(&mu);
}`);
  const [f] = expectTP('SLEEP', `${PTHREAD}
static pthread_mutex_t mu;
static void wait_a_bit(void) { sleep(1); }
void g(void) {
  pthread_mutex_lock(&mu);
  wait_a_bit(); /*BUG*/
  pthread_mutex_unlock(&mu);
}`);
  assert.ok(tags(f).includes('sleep'));
});

test('SLEEP TN: blocking call after the unlock, helper that does not block', () => {
  expectTN('SLEEP', `${PTHREAD}
static pthread_mutex_t mu;
static int n;
static void quick(void) { n++; }
void f(void) { pthread_mutex_lock(&mu); quick(); pthread_mutex_unlock(&mu); sleep(1); }`);
});

// ---------------------------------------------------------------- taint

test('TAINTED_SCALAR TP: argv value as index, getenv value as allocation size and loop bound', () => {
  const [f] = expectTP('TAINTED_SCALAR', `
#include <stdlib.h>
int main(int argc, char **argv) {
  int table[16] = {0};
  int n = atoi(argv[1]);
  return table[n]; /*BUG*/
}`);
  assert.ok(tags(f).includes('tainted_source'));
  expectTP('TAINTED_SCALAR', `
#include <stdlib.h>
char *f(void) {
  int n = atoi(getenv("SIZE"));
  return malloc(n); /*BUG*/
}`);
  expectTP('TAINTED_SCALAR', `
#include <stdio.h>
int g(int *out) {
  int n, s = 0;
  if (scanf("%d", &n) != 1) return 0;
  for (int i = 0; i < n; i++) /*BUG*/
    s += i;
  return s;
}`);
});

test('TAINTED_SCALAR TN: value bounded before use', () => {
  expectTN('TAINTED_SCALAR', `
#include <stdlib.h>
int main(int argc, char **argv) {
  int table[16] = {0};
  int n = atoi(argv[1]);
  if (n < 0 || n >= 16) return 1;
  int m = atoi(argv[2]);
  return table[n] + table[(unsigned)m % 16];
}`);
});

test('TAINTED_STRING TP: environment string loaded as a library and put in the environment', () => {
  expectTP('TAINTED_STRING', `
#include <stdlib.h>
void *dlopen(const char *name, int flags);
void f(void) {
  dlopen(getenv("PLUGIN"), 0); /*BUG*/
}`);
  expectTP('TAINTED_STRING', `
#include <stdlib.h>
int main(int argc, char **argv) {
  putenv(argv[1]); /*BUG*/
  return 0;
}`);
});

test('TAINTED_STRING TN: constant strings', () => {
  expectTN('TAINTED_STRING', `
#include <stdlib.h>
void *dlopen(const char *name, int flags);
void f(void) { dlopen("libm.so", 0); setenv("LANG", "C", 1); }`);
});

test('STRING_OVERFLOW TP: argv copied into a fixed buffer, scanf %s without width', () => {
  expectTP('STRING_OVERFLOW', `
#include <string.h>
int main(int argc, char **argv) {
  char name[16];
  strcpy(name, argv[1]); /*BUG*/
  return name[0];
}`);
  expectTP('STRING_OVERFLOW', `
#include <stdio.h>
int f(void) {
  char word[16];
  if (scanf("%s", word) != 1) /*BUG*/
    return 0;
  return word[0];
}`);
});

test('STRING_OVERFLOW TN: bounded copies', () => {
  expectTN('STRING_OVERFLOW', `
#include <stdio.h>
#include <string.h>
int main(int argc, char **argv) {
  char name[16];
  strncpy(name, argv[1], sizeof(name) - 1);
  name[15] = 0;
  char word[16];
  if (scanf("%15s", word) != 1) return 0;
  return name[0] + word[0];
}`);
});

test('FORMAT_STRING TP: argv as format; tainted string reaching printf in a callee', () => {
  expectTP('FORMAT_STRING', `
#include <stdio.h>
int main(int argc, char **argv) {
  printf(argv[1]); /*BUG*/
  return 0;
}`);
  const [f] = expectTP('FORMAT_STRING', `
#include <stdio.h>
#include <stdlib.h>
static void logmsg(const char *m) { printf(m); }
void g(void) {
  logmsg(getenv("MSG")); /*BUG*/
}`);
  assert.ok(f.events.some((e) => e.line === 4), 'callee sink event');
});

test('FORMAT_STRING TN: tainted data passed as an argument, literal formats', () => {
  expectTN('FORMAT_STRING', `
#include <stdio.h>
#include <stdlib.h>
static void logmsg(const char *m) { printf("%s", m); }
int main(int argc, char **argv) {
  printf("%s\\n", argv[1]);
  logmsg(getenv("MSG"));
  printf("done\\n");
  return 0;
}`);
});

test('OS_CMD_INJECTION TP: argv to system, and through a wrapper in another file', () => {
  expectTP('OS_CMD_INJECTION', `
#include <stdlib.h>
int main(int argc, char **argv) {
  return system(argv[1]); /*BUG*/
}`);
  const [f] = expectTP('OS_CMD_INJECTION', `
void run(const char *cmd);
int main(int argc, char **argv) {
  run(argv[1]); /*BUG*/
  return 0;
}`, { extra: [{ path: 'b.c', text: '#include <stdlib.h>\nvoid run(const char *cmd) {\n  system(cmd);\n}\n' }] });
  assert.ok(f.events.some((e) => e.file === 'b.c' && e.line === 3), 'sink event in b.c');
  assert.ok(tags(f).includes('tainted_source'));
});

test('OS_CMD_INJECTION TN: constant commands', () => {
  expectTN('OS_CMD_INJECTION', `
#include <stdlib.h>
static void run(const char *cmd) { system(cmd); }
int main(int argc, char **argv) {
  system("ls -l");
  run("date");
  return argc;
}`);
});

// ---------------------------------------------------------------- user models

test('user models from the defects.js format apply (allocator, sink)', () => {
  const models = [
    { name: 'pool_get', kind: 'allocator', pattern: '\\bpool_get\\s*\\(' },
    { name: 'pool_put', kind: 'free', pattern: '\\bpool_put\\s*\\(' },
    { name: 'run_query', kind: 'sink', checker: 'OS_CMD_INJECTION', pattern: '\\brun_query\\s*\\(' },
  ];
  const code = `
#include <stdlib.h>
void *pool_get(int n);
void pool_put(void *p);
void run_query(const char *q);
void leak(int c) {
  char *p = pool_get(8);
  if (c) return; /*BUG*/
  pool_put(p);
}
int main(int argc, char **argv) {
  run_query(argv[1]);
  return 0;
}`;
  expectTP('RESOURCE_LEAK', code, { models });
  const sink = of(analyze(code, { models }), 'OS_CMD_INJECTION');
  assert.ok(sink.length === 1 && sink[0].line === 12, JSON.stringify(sink.map((f) => f.line)));
  expectTN('RESOURCE_LEAK', code.replace('if (c) return; /*BUG*/', 'if (c) { pool_put(p); return; }'), { models });
});

// ---------------------------------------------------------------- confidence

test('possible findings are reported one severity lower', () => {
  const found = analyze(`
int f(int k) {
  int a[10];
  int i = k & 15;
  a[i] = 0;
  return a[0];
}`);
  const hits = of(found, 'OVERRUN');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].confidence, 'possible');
  assert.equal(hits[0].severity, 'MAJOR');
});

// ---------------------------------------------------------------- termination and budgets

test('terminates on deep loop nests, a huge switch and mutual recursion', () => {
  let nest = 'int deep(int n) {\n  int s = 0;\n';
  for (let i = 0; i < 12; i++) nest += `${'  '.repeat(i + 1)}for (int i${i} = 0; i${i} < n; i${i}++)\n`;
  nest += `${'  '.repeat(13)}s += i0 * i11;\n  return s;\n}\n`;
  let sw = 'int big(int x) {\n  int r = 0;\n  switch (x) {\n';
  for (let i = 0; i < 2000; i++) sw += `    case ${i}: r = ${i * 3}; break;\n`;
  sw += '  }\n  return r;\n}\n';
  const rec = `
int odd(int n);
int even(int n) { if (n == 0) return 1; return odd(n - 1); }
int odd(int n) { if (n == 0) return 0; return even(n - 1); }
int fact(int n) { return n <= 1 ? 1 : n * fact(n - 1); }
int spin(int n) { while (n != 1) n = (n % 2) ? 3 * n + 1 : n / 2; return n; }
`;
  const t0 = Date.now();
  const found = analyze(nest + sw + rec);
  const ms = Date.now() - t0;
  assert.ok(ms < 10000, `took ${ms} ms`);
  assert.ok(Array.isArray(found));
  assert.equal(found.stats.internalErrors, 0);
});

test('a function over its time budget reports nothing from the abstract interpreter', () => {
  const code = `
int f(void) {
  int *p = 0;
  int s = 0;
  for (int i = 0; i < 100; i++)
    for (int j = 0; j < 100; j++) s += i * j;
  return *p + s;
}`;
  assert.ok(of(analyze(code), 'FORWARD_NULL').length > 0);
  const found = analyze(code, { absint: { functionMs: 0 } });
  assert.equal(of(found, 'FORWARD_NULL').length, 0);
  assert.ok(found.stats.aborted >= 1);
  const steps = analyze(code, { absint: { maxSteps: 3 } });
  assert.equal(of(steps, 'FORWARD_NULL').length, 0);
});

test('the total budget skips remaining functions', () => {
  const found = analyze('int f(void) { int *p = 0; return *p; }\nint g(void) { int *q = 0; return *q; }\n', { absint: { totalMs: -1 } });
  assert.equal(found.filter((f) => f.rule === 'absint:FORWARD_NULL').length, 0);
});

test('the total step budget skips remaining functions, without a clock', () => {
  const code = 'int f(void) { int *p = 0; return *p; }\nint g(void) { int *q = 0; return *q; }\n';
  const one = analyze(code, { absint: { totalSteps: 3 } });
  assert.equal(one.filter((f) => f.rule === 'absint:FORWARD_NULL').length, 0);
  assert.ok(one.stats.aborted >= 1);
  const all = analyze(code);
  assert.equal(all.filter((f) => f.rule === 'absint:FORWARD_NULL').length, 2);
  assert.ok(all.stats.steps > 0);
  // No time limit by default: a slow clock changes nothing.
  const now = Date.now;
  let t = 0;
  Date.now = () => (t += 60000);
  try {
    const lines = (list) => list.map((f) => `${f.rule}:${f.line}`);
    assert.deepEqual(lines(analyze(code)), lines(all));
  } finally {
    Date.now = now;
  }
});

test('functions with parse errors are skipped', () => {
  const found = analyze('int f(int x) {\n  int y = (unknown_t)x x;\n  if (x) return 1;\n}\n');
  assert.equal(of(found, 'MISSING_RETURN').length, 0);
});

// ---------------------------------------------------------------- samples

test('samples/demo/src/native.c parses and analyzes', () => {
  const p = path.join(root, 'samples', 'demo', 'src', 'native.c');
  const text = fs.readFileSync(p, 'utf8');
  const ctx = { inactive: new Set(), root, options: {}, stats: {} };
  const found = absint.analyze([{ path: 'samples/demo/src/native.c', text, lang: 'c' }], ctx);
  assert.ok(Array.isArray(found));
  assert.ok(ctx.stats.functions >= 1);
  assert.equal(ctx.stats.internalErrors, 0);
  for (const f of found) {
    assert.match(f.rule, /^absint:/);
    assert.equal(f.file, 'samples/demo/src/native.c');
  }
});

test('engine is registered with core/engines.js', () => {
  const { engines } = require('../core/engines');
  assert.ok(engines().some((e) => e.id === 'absint'));
});

// ---------------------------------------------------------------- C++: templates, virtual calls, exceptions

const cpp = { lang: 'cpp' };

test('C++ templates: a function template body is analysed generically and its summary used at call sites', () => {
  expectTP('FORWARD_NULL', `
template <class T> int first(T *p) { return p[0]; }
int use() {
  int *q = nullptr;
  return first(q); /*BUG*/
}`, cpp);
  expectTN('FORWARD_NULL', `
template <class T> int first(T *p) { return p ? p[0] : 0; }
int use() { int *q = nullptr; return first(q); }`, cpp);
});

test('C++ virtual calls: the summaries of every overrider are joined', () => {
  expectTP('FORWARD_NULL', `
struct Shape { virtual int area(int *scale) = 0; virtual ~Shape() {} };
struct Square : Shape { int area(int *scale) override { return 4 * *scale; } };
struct Circle : Shape { int area(int *scale) override { return 3 * *scale; } };
int total(Shape *s) {
  int *k = nullptr;
  return s->area(k); /*BUG*/
}`, cpp);
  // one overrider checks for null: not every target dereferences, no report
  expectTN('FORWARD_NULL', `
struct Shape { virtual int area(int *scale) = 0; virtual ~Shape() {} };
struct Square : Shape { int area(int *scale) override { return 4 * *scale; } };
struct Circle : Shape { int area(int *scale) override { return scale ? 3 * *scale : 0; } };
int total(Shape *s) { int *k = nullptr; return s->area(k); }`, cpp);
});

test('C++ member calls: non-virtual methods use their summary, a call through a null object pointer is reported', () => {
  expectTP('FORWARD_NULL', `
struct Buf { int n; int get(int *i) { return *i + n; } };
int f(Buf &b) { int *idx = nullptr; return b.get(idx); /*BUG*/ }`, cpp);
  expectTP('FORWARD_NULL', `
struct Node { int v; int value() const { return v; } };
int g() {
  Node *n = nullptr;
  return n->value(); /*BUG*/
}`, cpp);
  expectTN('FORWARD_NULL', `
struct Node { int v; int value() const { return v; } static int count() { return 1; } };
int g(Node *n) { if (!n) return Node::count(); return n->value(); }`, cpp);
});

test('RESOURCE_LEAK TP: raw new leaks when an exception leaves the function or a callee throws', () => {
  const [f] = expectTP('RESOURCE_LEAK', `
void fill(int *p, int n) {
  int *tmp = new int[n];
  if (n > 100) throw n; /*BUG*/
  p[0] = tmp[0];
  delete[] tmp;
}`, cpp);
  assert.ok(tags(f).includes('exception_leak'));
  expectTP('RESOURCE_LEAK', `
void check(int v) { if (v < 0) throw v; }
void g(int v) {
  int *buf = new int[4];
  check(v); /*BUG*/
  delete[] buf;
}`, cpp);
});

test('RESOURCE_LEAK TN: RAII owners, try blocks and parented objects', () => {
  expectTN('RESOURCE_LEAK', `
#include <memory>
struct Node { int v; };
void check(int v) { if (v < 0) throw v; }
void a(int v) { std::unique_ptr<Node> p(new Node); check(v); }
void b(int v) { int *buf = new int[4]; try { check(v); } catch (...) { delete[] buf; throw; } delete[] buf; }
struct Widget { Widget(Widget *parent); };
void c(Widget *w) { Widget *child = new Widget(w); (void)child; }
struct Guard { explicit Guard(int fd); ~Guard(); };
void d(int fd) { Guard g(fd); }`, cpp);
});

test('UNCAUGHT_EXCEPT TP: throw out of a destructor, a noexcept function and main', () => {
  expectTP('UNCAUGHT_EXCEPT', `
struct File { int fd; ~File() { if (fd < 0) throw fd; /*BUG*/ } };`, cpp);
  expectTP('UNCAUGHT_EXCEPT', `
int parse(int v) { if (v < 0) throw v; return v; }
int safe(int v) noexcept {
  return parse(v); /*BUG*/
}`, cpp);
  expectTP('UNCAUGHT_EXCEPT', `
int parse(int v) { if (v < 0) throw v; return v; }
int main(int argc, char **argv) {
  (void)argv;
  return parse(argc - 2); /*BUG*/
}`, cpp);
});

test('UNCAUGHT_EXCEPT TN: caught exceptions and functions allowed to throw', () => {
  expectTN('UNCAUGHT_EXCEPT', `
int parse(int v) { if (v < 0) throw v; return v; }
int safe(int v) noexcept { try { return parse(v); } catch (...) { return -1; } }
int may(int v) noexcept(false) { return parse(v); }
struct File { ~File() { try { parse(-1); } catch (int) {} } };
int main(int argc, char **) { try { return parse(argc); } catch (...) { return 1; } }`, cpp);
});

// ---------------------------------------------------------------- C++ standard library models

test('USE_AFTER_MOVE TP: object used after std::move, also a unique_ptr', () => {
  const [f] = expectTP('USE_AFTER_MOVE', `
#include <string>
#include <utility>
void sink(std::string s);
void f() {
  std::string name = "abc";
  sink(std::move(name));
  name.size(); /*BUG*/
}`, cpp);
  assert.ok(tags(f).includes('move'));
  expectTP('USE_AFTER_MOVE', `
#include <memory>
struct Node { int v; };
void own(std::unique_ptr<Node> p);
int g() {
  std::unique_ptr<Node> p(new Node);
  own(std::move(p));
  return p->v; /*BUG*/
}`, cpp);
});

test('USE_AFTER_MOVE TN: reassigned, cleared, const reference parameter, scalars and evaluation order', () => {
  expectTN('USE_AFTER_MOVE', `
#include <string>
#include <vector>
#include <utility>
#include <map>
void sink(std::string s);
void look(const std::string &s);
void f(std::vector<std::string> &out) {
  std::string a = "x";
  out.push_back(std::move(a));
  a = "y";
  a.size();
  std::string b = "z";
  sink(std::move(b));
  b.clear();
  b.size();
  std::string c = "w";
  look(std::move(c));
  c.size();
  int n = 3;
  int m = std::move(n);
  (void)(n + m);
}
void g(std::map<std::string, std::string> &m, std::string k) { m[k.substr(0, 1)] = std::move(k); }`, cpp);
});

test('INVALIDATE_ITERATOR TP: push_back while iterating and erase without using its result', () => {
  expectTP('INVALIDATE_ITERATOR', `
#include <vector>
void f(std::vector<int> &v) {
  for (auto it = v.begin(); it != v.end(); ++it) {
    if (*it == 0) v.push_back(1);
  } /*BUG*/
}`.replace('} /*BUG*/', '}'), cpp);
  expectTP('INVALIDATE_ITERATOR', `
#include <vector>
void g(std::vector<int> &v) {
  for (int x : v) {
    if (x < 0) v.push_back(-x); /*BUG*/
  }
}`, cpp);
  expectTP('INVALIDATE_ITERATOR', `
#include <list>
void h(std::list<int> &l) {
  auto it = l.begin();
  l.erase(it);
  ++it; /*BUG*/
}`, cpp);
});

test('INVALIDATE_ITERATOR TN: iterator refreshed from erase, loop left after the change, string positions', () => {
  expectTN('INVALIDATE_ITERATOR', `
#include <vector>
#include <string>
#include <list>
void f(std::list<int> &l) {
  for (auto it = l.begin(); it != l.end(); ) {
    if (*it == 0) it = l.erase(it); else ++it;
  }
}
void g(std::vector<int> &v) {
  for (int x : v) { if (x < 0) { v.push_back(-x); break; } }
}
void h(std::list<int> &l) { auto it = l.begin(); l.push_back(3); ++it; }
size_t r(std::string &s) {
  size_t n = 0;
  for (std::string::size_type pos = s.find("a"); pos != std::string::npos; pos = s.find("a", pos + 1)) { s.replace(pos, 1, "b"); n++; }
  return n;
}`, cpp);
});

test('MISMATCHED_ITERATOR TP and TN', () => {
  expectTP('MISMATCHED_ITERATOR', `
#include <vector>
#include <algorithm>
void f(std::vector<int> &a, std::vector<int> &b) {
  a.erase(b.begin()); /*BUG*/
}`, cpp);
  expectTP('MISMATCHED_ITERATOR', `
#include <vector>
#include <algorithm>
bool g(std::vector<int> &a, std::vector<int> &b) {
  return std::find(a.begin(), b.end(), 3) != a.end(); /*BUG*/
}`, cpp);
  expectTP('MISMATCHED_ITERATOR', `
#include <vector>
bool h(std::vector<int> &a, std::vector<int> &b) {
  auto it = a.begin();
  return it != b.end(); /*BUG*/
}`, cpp);
  expectTN('MISMATCHED_ITERATOR', `
#include <vector>
#include <algorithm>
void f(std::vector<int> &a, std::vector<int> &b) {
  a.erase(a.begin());
  a.insert(a.end(), b.begin(), b.end());
  std::sort(b.begin(), b.end());
  auto it = std::find(a.begin(), a.end(), 3);
  if (it != a.end()) a.erase(it);
}`, cpp);
});

test('std::optional and containers: empty optional dereferenced, front() of an empty vector', () => {
  expectTP('FORWARD_NULL', `
#include <optional>
int f() {
  std::optional<int> o;
  return *o; /*BUG*/
}`, cpp);
  expectTP('FORWARD_NULL', `
#include <optional>
int g(bool c) {
  std::optional<int> o = std::nullopt;
  return o.value(); /*BUG*/
}`, cpp);
  expectTN('FORWARD_NULL', `
#include <optional>
int f(bool c) { std::optional<int> o; if (c) o = 3; if (o) return *o; return o.value_or(0); }
int g() { std::optional<int> o; o.emplace(2); return *o; }`, cpp);
  expectTP('OVERRUN', `
#include <vector>
int h() {
  std::vector<int> v;
  return v.front(); /*BUG*/
}`, cpp);
  expectTN('OVERRUN', `
#include <vector>
#include <string>
int h(bool c) { std::vector<int> v; if (c) v.push_back(1); if (!v.empty()) return v.front(); return 0; }
void k(const std::vector<std::string> &in) { std::string s; for (const auto &x : in) s += x; if (!in.empty()) s.pop_back(); }`, cpp);
});

test('RETURN_LOCAL TP/TN: c_str() of a local std::string', () => {
  expectTP('RETURN_LOCAL', `
#include <string>
const char *name(int i) {
  std::string s = "item" + std::to_string(i);
  return s.c_str(); /*BUG*/
}`, cpp);
  expectTN('RETURN_LOCAL', `
#include <string>
static std::string g_name;
const char *name() { return g_name.c_str(); }
const char *other(const std::string &s) { return s.c_str(); }`, cpp);
});

test('ALLOC_FREE_MISMATCH TP for class arrays, DELETE_VOID TP/TN', () => {
  expectTP('ALLOC_FREE_MISMATCH', `
struct Item { int v; };
void f() {
  Item *items = new Item[3];
  delete items; /*BUG*/
}`, cpp);
  expectTP('DELETE_VOID', `
void f(void *p) {
  delete (int *)0;
  delete p; /*BUG*/
}`, cpp);
  expectTN('DELETE_VOID', `
struct Item { int v; };
void f(void *p) { delete static_cast<Item *>(p); }`, cpp);
});

test('VIRTUAL_DTOR TP: delete through a base without a virtual destructor', () => {
  expectTP('VIRTUAL_DTOR', `
#include <string>
struct Base { virtual void run() {} ~Base() {} };
struct Derived : Base { std::string name; void run() override {} };
void destroy(Base *b) {
  delete b; /*BUG*/
}`, cpp);
  expectTP('VIRTUAL_DTOR', `
#include <memory>
struct Base { int id; };
struct Derived : Base { ~Derived() {} };
void make() {
  std::unique_ptr<Base> p(new Derived); /*BUG*/
}`, cpp);
});

test('VIRTUAL_DTOR TN: virtual destructor in the base, no derived classes, trivial derived classes', () => {
  expectTN('VIRTUAL_DTOR', `
#include <memory>
struct Base { virtual ~Base() {} virtual void run() {} };
struct Derived : Base { ~Derived() override {} };
void destroy(Base *b) { delete b; }
struct Solo { int v; ~Solo() {} };
void kill(Solo *s) { delete s; }
struct Pod { int a; };
struct Pod2 : Pod { int b; };
void drop(Pod *p) { delete p; }
void sp() { std::shared_ptr<Pod> p(new Pod2); }`, cpp);
});

test('COPY_WITHOUT_ASSIGN and ASSIGN_WITHOUT_COPY', () => {
  expectTP('COPY_WITHOUT_ASSIGN', `
struct Buffer { /*BUG*/
  char *data;
  int size;
  Buffer(const Buffer &o) : data(new char[o.size]), size(o.size) {}
  ~Buffer() { delete[] data; }
};`, cpp);
  expectTP('ASSIGN_WITHOUT_COPY', `
struct Buffer { /*BUG*/
  char *data;
  Buffer &operator=(const Buffer &o) { data = o.data; return *this; }
};`, cpp);
  expectTN('COPY_WITHOUT_ASSIGN', `
struct A { char *data; A(const A &o); A &operator=(const A &o); };
struct B { char *data; B(const B &) = delete; };
struct C { int v; C(const C &o) : v(o.v) {} };`, cpp);
});

test('AUTO_CAUSES_COPY TP/TN: range-for copies of strings and a reference returned by a getter', () => {
  expectTP('AUTO_CAUSES_COPY', `
#include <string>
#include <vector>
int total(const std::vector<std::string> &names) {
  int n = 0;
  for (auto name : names) /*BUG*/
    n += (int)name.size();
  return n;
}`, cpp);
  expectTP('AUTO_CAUSES_COPY', `
#include <vector>
struct Model { const std::vector<int> &weights() const; };
int first(const Model &m) {
  auto w = m.weights(); /*BUG*/
  return w.empty() ? 0 : w[0];
}`, cpp);
  expectTN('AUTO_CAUSES_COPY', `
#include <string>
#include <vector>
struct Model { const std::vector<int> &weights() const; };
int total(const std::vector<std::string> &names, const std::vector<int> &nums, const Model &m) {
  int n = 0;
  for (const auto &name : names) n += (int)name.size();
  for (auto x : nums) n += x;
  for (auto name : names) { name += "!"; n += (int)name.size(); }
  auto w = m.weights();
  w.push_back(1);
  return n + (int)w.size();
}`, cpp);
});

test('PASS_BY_VALUE TP/TN: containers and large structs passed by value and only read', () => {
  expectTP('PASS_BY_VALUE', `
#include <vector>
int sum(std::vector<int> values) { /*BUG*/
  int s = 0;
  for (int v : values) s += v;
  return s;
}`, cpp);
  expectTP('PASS_BY_VALUE', `
struct Big { int data[64]; };
int head(Big b) { /*BUG*/
  return b.data[0];
}`, cpp);
  expectTN('PASS_BY_VALUE', `
#include <vector>
#include <string>
#include <utility>
struct Big { int data[64]; };
struct Small { int a, b; };
int a(const std::vector<int> &v) { return (int)v.size(); }
int b(std::vector<int> v) { v.push_back(1); return (int)v.size(); }
std::vector<int> keep;
void c(std::vector<int> v) { keep = std::move(v); }
int d(Small s) { return s.a; }
int e(std::string s) { return (int)s.size(); }
void run(Big cfg) { (void)cfg.data[0]; }
void start() { void (*fp)(Big) = run; (void)fp; }`, cpp);
});

test('DC.STRING_BUFFER, DC.WEAK_CRYPTO and DC.STREAM_BUFFER', () => {
  expectTP('DC.STRING_BUFFER', `
#include <stdio.h>
void f(char *buf) {
  gets(buf); /*BUG*/
}`);
  expectTP('DC.WEAK_CRYPTO', `
#include <stdlib.h>
int token(void) {
  return rand(); /*BUG*/
}`);
  expectTP('DC.STREAM_BUFFER', `
#include <iostream>
void f() {
  char name[16];
  std::cin >> name; /*BUG*/
}`, cpp);
  expectTN('DC.STREAM_BUFFER', `
#include <iostream>
#include <iomanip>
#include <string>
void f() { char name[16]; std::cin >> std::setw(16) >> name; std::string s; std::cin >> s; int n; std::cin >> n; }`, cpp);
  expectTN('DC.WEAK_CRYPTO', `
int rand(void) { return 4; }
int token(void) { return rand(); }`);
});

test('C++ checkers stay within the budget on a large generated translation unit', () => {
  const parts = ['#include <vector>', '#include <string>', 'struct Base { virtual int run(int *p) = 0; virtual ~Base() {} };'];
  for (let i = 0; i < 300; i++) {
    parts.push(`struct D${i} : Base { int run(int *p) override { return p ? *p + ${i} : 0; } };`);
    parts.push(`int use${i}(Base *b, std::vector<int> &v) { int x = ${i}; for (auto it = v.begin(); it != v.end(); ++it) x += *it; std::string s = "a"; std::string t = std::move(s); return b->run(&x) + (int)t.size(); }`);
  }
  const t0 = Date.now();
  const found = analyze(parts.join('\n'), cpp);
  assert.ok(Date.now() - t0 < 4000, `took ${Date.now() - t0} ms`);
  assert.equal(found.stats.internalErrors, 0);
  assert.equal(of(found, 'USE_AFTER_MOVE').length + of(found, 'INVALIDATE_ITERATOR').length + of(found, 'FORWARD_NULL').length, 0);
});

// ---------------------------------------------------------------- more defect checkers

test('OVERFLOW_BEFORE_WIDEN TP: 32-bit product widened by initialization, return and argument', () => {
  const [f] = expectTP('OVERFLOW_BEFORE_WIDEN', `
long long area(int w, int h) {
  long long a = w * h; /*BUG*/
  return a;
}`);
  assert.equal(f.events[f.events.length - 1].tag, 'overflow_before_widen');
  assert.match(f.message.en, /32-bit arithmetic.*long long/);
  expectTP('OVERFLOW_BEFORE_WIDEN', `
#include <stdlib.h>
void *grid(int rows, int cols) {
  return malloc(rows * cols); /*BUG*/
}`);
  expectTP('OVERFLOW_BEFORE_WIDEN', `
unsigned long long bits(unsigned int x) {
  return x << 20; /*BUG*/
}`);
});

test('OVERFLOW_BEFORE_WIDEN TN: widened operand, small operand types, refined ranges, 32-bit destination', () => {
  expectTN('OVERFLOW_BEFORE_WIDEN', `
long long a(int w, int h) { return (long long)w * h; }
long long b(unsigned char w, unsigned char h) { long long r = w * h; return r; }
long long c(int w, int h) {
  if (w > 0 && w < 1000 && h > 0 && h < 1000) { long long r = w * h; return r; }
  return 0;
}
int d(int w, int h) { int r = w * h; return r; }
long long e(void) { int k = 1000; long long r = k * 3; return r; }`);
});

test('ARRAY_VS_SINGLETON TP: indexing a pointer to a scalar, and a callee that uses its parameter as an array', () => {
  expectTP('ARRAY_VS_SINGLETON', `
int f(void) {
  int x = 1;
  int *p = &x;
  return p[1]; /*BUG*/
}`);
  const [g] = expectTP('ARRAY_VS_SINGLETON', `
void fill(int *a) { a[0] = 0; a[1] = 0; a[2] = 0; }
void g(void) {
  int y;
  fill(&y); /*BUG*/
  (void)y;
}`);
  assert.ok(tags(g).includes('ptr_arith'));
  expectTN('OVERRUN', `
int f(void) { int x = 1; int *p = &x; return p[1]; }`);
});

test('ARRAY_VS_SINGLETON TN: element 0 of a singleton, real arrays, callee touching element 0 only', () => {
  expectTN('ARRAY_VS_SINGLETON', `
int f(void) { int x = 1; int *p = &x; return p[0]; }
int g(void) { int a[4] = {0}; int *p = a; return p[3]; }
void set0(int *a) { a[0] = 7; }
int h(void) { int y; set0(&y); return y; }
void fill(int *a) { a[0] = 0; a[1] = 0; }
void k(void) { int arr[2]; fill(arr); (void)arr[0]; }`);
});

test('SWAPPED_ARGUMENTS TP: argument names match the parameters in another order', () => {
  const [f] = expectTP('SWAPPED_ARGUMENTS', `
void copy(char *dst, const char *src, int n);
void use(char *dst, char *src, int n) {
  copy(src, dst, n); /*BUG*/
}`);
  assert.ok(tags(f).includes('params'));
});

test('SWAPPED_ARGUMENTS TN: matching order, unrelated names, a single coincidence', () => {
  expectTN('SWAPPED_ARGUMENTS', `
void copy(char *dst, const char *src, int n);
void use(char *dst, char *src, char *a, char *b, int n) {
  copy(dst, src, n);
  copy(a, b, n);
  copy(src, a, n);
}`);
});

test('UNUSED_VALUE TP: call result overwritten, and a value that is never read', () => {
  const [f] = expectTP('UNUSED_VALUE', `
int compute(int);
int f(int a) {
  int r = compute(a); /*BUG*/
  r = compute(a + 1);
  return r;
}`);
  assert.ok(tags(f).includes('overwrite'));
  assert.equal(f.events[f.events.length - 1].tag, 'returned_value');
  expectTP('UNUSED_VALUE', `
int compute(int);
void g(int a, int *out) {
  int t = a * 2;
  *out = t;
  t = compute(a); /*BUG*/
}`);
});

test('UNUSED_VALUE TN: defensive initializers, values read on some path, loops, address taken', () => {
  expectTN('UNUSED_VALUE', `
#include <stddef.h>
int compute(int);
int a(int x) { int r = 0; r = compute(x); return r; }
int b(int x, int c) { int r = compute(x); if (c) r = 5; return r; }
int c(int n) { int s = 0; for (int i = 0; i < n; i++) s = s + compute(i); return s; }
void d(int *p) { char *q = NULL; q = (char *)p; (void)q; }
int e(int x) { int r = compute(x); int *pr = &r; *pr = 1; return r; }
int f(int x) { volatile int r = compute(x); r = 2; return 0; }`);
});

test('DELETE_ARRAY TP: member allocated with new[] deleted with delete, and new deleted with delete[]', () => {
  const found = expectTP('DELETE_ARRAY', `
class Buf {
  char *data;
  int *one;
public:
  Buf(int k) { data = new char[k]; one = new int; }
  ~Buf() { delete data; /*BUG*/ delete[] one; }
};`, cpp);
  assert.equal(found.length, 2);
  assert.ok(found.every((f) => tags(f).includes('alloc')));
});

test('DELETE_ARRAY TN: matching forms, and locals left to ALLOC_FREE_MISMATCH', () => {
  expectTN('DELETE_ARRAY', `
class Buf {
  char *data;
  int *one;
public:
  Buf(int k) { data = new char[k]; one = new int; }
  ~Buf() { delete[] data; delete one; }
};
void f() { int *a = new int[4]; delete a; }`, cpp);
});

test('STACK_USE TP: large local frame and a call chain above the limit', () => {
  const [f] = expectTP('STACK_USE', `
#include <string.h>
void big(void) { /*BUG*/
  char buf[70000];
  memset(buf, 0, sizeof buf);
}`);
  assert.ok(tags(f).includes('stack_use_local'));
  const [g] = expectTP('STACK_USE', `
#include <string.h>
void leaf(void) { char b[3000]; memset(b, 1, sizeof b); }
void mid(void) { /*BUG*/
  char c[2000];
  memset(c, 2, sizeof c);
  leaf();
}`, { absint: { stackLimit: 4096 } });
  assert.match(g.message.en, /mid -> leaf uses 5000 bytes/);
  assert.ok(tags(g).includes('stack_use_callee'));
});

test('STACK_USE TN: frames within the limit, static buffers, recursion counted once', () => {
  expectTN('STACK_USE', `
#include <string.h>
void a(void) { char b[1000]; memset(b, 0, sizeof b); }
void s(void) { static char big[200000]; memset(big, 0, sizeof big); }
int r(int n) { char e[100]; memset(e, 0, sizeof e); return n ? r(n - 1) + e[0] : 0; }`, { absint: { stackLimit: 4096 } });
});

test('COPY_INSTEAD_OF_MOVE TP: local copied into push_back and into a by-value parameter as its last use', () => {
  const [f] = expectTP('COPY_INSTEAD_OF_MOVE', `
#include <string>
#include <vector>
void f(std::vector<std::string> &out) {
  std::string name = "x";
  name += "y";
  out.push_back(name); /*BUG*/
}`, cpp);
  assert.match(f.message.en, /std::move\(name\)/);
  expectTP('COPY_INSTEAD_OF_MOVE', `
#include <string>
void take(std::string s);
void g() {
  std::string v = "a";
  take(v); /*BUG*/
}`, cpp);
});

test('COPY_INSTEAD_OF_MOVE TN: used afterwards, copied in a loop, const local, reference parameter', () => {
  expectTN('COPY_INSTEAD_OF_MOVE', `
#include <string>
#include <vector>
void take(std::string s);
void keep(const std::string &s);
void f(std::vector<std::string> &out) {
  std::string name = "x";
  out.push_back(name);
  keep(name);
}
void g(std::vector<std::string> &out) {
  std::string name = "x";
  for (int i = 0; i < 3; i++) out.push_back(name);
}
void h() { const std::string c = "c"; take(c); }
void k() { std::string r = "r"; keep(r); }
void m() { std::string t = "t"; take(std::move(t)); }`, cpp);
});

test('EVALUATION_ORDER TP: x = x++, f(i++, i) and a[i] = i++', () => {
  expectTP('EVALUATION_ORDER', `
int g(int i) {
  i = i++; /*BUG*/
  return i;
}`);
  expectTP('EVALUATION_ORDER', `
int f(int, int);
int h(int i) {
  return f(i++, i); /*BUG*/
}`);
  const [k] = expectTP('EVALUATION_ORDER', `
void k(int *a, int i) {
  a[i] = i++; /*BUG*/
}`);
  assert.ok(tags(k).includes('read'));
});

test('EVALUATION_ORDER TN: sequence points, separate statements and C++ stream insertion', () => {
  expectTN('EVALUATION_ORDER', `
int f(int, int);
int g(int i, int *p, int *q) {
  int a[10];
  a[i] = i + 1;
  i++;
  *p++ = *q++;
  i = (i++, i);
  int x = i && i++;
  x = f(i, i);
  i = f(i++, 0);
  return x + a[0];
}`);
  expectTN('EVALUATION_ORDER', `
#include <iostream>
void h(int i) { std::cout << i++ << i; }`, cpp);
});

test('BAD_COMPARE TP: function name compared with 0, used as a condition, pointer < null', () => {
  expectTP('BAD_COMPARE', `
int ready(void);
int f(void) {
  if (ready == 0) /*BUG*/
    return 1;
  return 0;
}`);
  expectTP('BAD_COMPARE', `
int ready(void);
int g(void) {
  if (ready) /*BUG*/
    return 1;
  return 0;
}`);
  expectTP('BAD_COMPARE', `
int h(char *p) {
  return p < 0; /*BUG*/
}`);
});

test('BAD_COMPARE TN: called function, pointer equality with null, function pointer variables', () => {
  expectTN('BAD_COMPARE', `
int ready(void);
int f(char *p, int (*cb)(void)) {
  if (ready() == 0) return 1;
  if (p == 0 || cb == 0) return 2;
  if (cb) return cb();
  return p > (char *)16;
}`);
});

test('UNINTENDED_INTEGER_DIVISION TP: int / int assigned to and returned as double', () => {
  expectTP('UNINTENDED_INTEGER_DIVISION', `
double ratio(int a, int b) {
  double r = a / b; /*BUG*/
  return r;
}`);
  expectTP('UNINTENDED_INTEGER_DIVISION', `
float avg(int sum, int n) {
  return sum / n; /*BUG*/
}`);
});

test('UNINTENDED_INTEGER_DIVISION TN: floating operand, exact constant quotient, integer destination', () => {
  expectTN('UNINTENDED_INTEGER_DIVISION', `
double a(int x, int y) { return (double)x / y; }
double b(void) { return 10 / 2; }
int c(int x, int y) { int q = x / y; return q; }
double d(int x) { return x / 1; }
double e(double x, int y) { return x / y; }`);
});

test('NESTING_INDENT_MISMATCH TP: second statement indented like the unbraced if body', () => {
  const [f] = expectTP('NESTING_INDENT_MISMATCH', `
void work(int);
void f(int c) {
  if (c)
    work(1);
    work(2); /*BUG*/
  work(3);
}`);
  assert.ok(tags(f).includes('nesting_indent'));
  expectTP('NESTING_INDENT_MISMATCH', `
void work(int);
void g(int n) {
  for (int i = 0; i < n; i++)
    work(i);
    work(-1); /*BUG*/
}`);
});

test('NESTING_INDENT_MISMATCH TN: braces, correct indentation, else branches', () => {
  expectTN('NESTING_INDENT_MISMATCH', `
void work(int);
void f(int c) {
  if (c)
    work(1);
  work(2);
  if (c) {
    work(3);
    work(4);
  }
  if (c)
    work(5);
  else
    work(6);
  work(7);
}`);
});

test('MISSING_COMMA TP: adjacent literals in a global and a local string array', () => {
  const [f] = expectTP('MISSING_COMMA', `
const char *names[] = {
  "alpha",
  "beta"  /*BUG*/
  "gamma",
  "delta",
};`);
  assert.ok(tags(f).includes('concatenation'));
  expectTP('MISSING_COMMA', `
int puts(const char *);
void f(void) {
  const char *opts[] = { "-a", "-b" "-c", "-d", "-e" }; /*BUG*/
  puts(opts[0]);
}`);
});

test('MISSING_COMMA TN: continued sentence, exact declared size, no other string elements', () => {
  expectTN('MISSING_COMMA', `
const char *msgs[] = {
  "this is a long message "
  "continued here",
  "second",
  "third",
};
const char *fixed[3] = { "ab" "cd", "ef", "gh" };
const char *one[] = { "a" "b" };
const char *plain[] = { "x", "y", "z" };`);
});

test('STRAY_SEMICOLON TP: if and for followed by a semicolon and a block', () => {
  expectTP('STRAY_SEMICOLON', `
void work(int);
void f(int c) {
  if (c); /*BUG*/
  {
    work(1);
  }
}`);
  expectTP('STRAY_SEMICOLON', `
void work(int);
void g(int n) {
  for (int i = 0; i < n; i++); { /*BUG*/
    work(2);
  }
}`);
});

test('STRAY_SEMICOLON TN: empty loop body on purpose, semicolon on its own line, if with else', () => {
  expectTN('STRAY_SEMICOLON', `
void work(int);
void f(char *p, const char *q, int c) {
  while ((*p++ = *q++));
  work(0);
  while (c--)
    ;
  work(1);
  if (c); else work(2);
}`);
});

test('CTOR_DTOR_LEAK TP: destructor does not free, and no destructor at all', () => {
  const [f] = expectTP('CTOR_DTOR_LEAK', `
class Leak {
  char *p;
public:
  Leak() { p = new char[16]; } /*BUG*/
  ~Leak() {}
};`, cpp);
  assert.ok(tags(f).includes('dtor') && tags(f).includes('alloc'));
  expectTP('CTOR_DTOR_LEAK', `
#include <stdlib.h>
class NoDtor {
  int *q;
public:
  NoDtor() : q((int *)malloc(4)) {} /*BUG*/
};`, cpp);
});

test('CTOR_DTOR_LEAK TN: freed in the destructor or another method, handed over, smart pointer, destructor elsewhere', () => {
  expectTN('CTOR_DTOR_LEAK', `
#include <memory>
void adopt(char *);
class A { char *p; public: A() { p = new char[4]; } ~A() { delete[] p; } };
class B { char *p; public: B() { p = new char[4]; } void close() { delete[] p; p = nullptr; } ~B() { close(); } };
class C { char *p; public: C() { p = new char[4]; adopt(p); } };
class D { std::unique_ptr<int> u; public: D() { u = std::unique_ptr<int>(new int(1)); } };
class E { int *p; public: E(); ~E(); };
E::E() { p = new int(2); }`, cpp);
});

test('WRAPPER_ESCAPE TP: c_str() of a local returned, and data() stored in a global', () => {
  expectTP('WRAPPER_ESCAPE', `
#include <string>
const char *name() {
  std::string s = "abc";
  return s.c_str(); /*BUG*/
}`, cpp);
  const [g] = expectTP('WRAPPER_ESCAPE', `
#include <string>
const char *g_name;
void keep(int n) {
  std::string s(n, 'x');
  g_name = s.c_str(); /*BUG*/
}`, cpp);
  assert.ok(tags(g).includes('wrapper'));
});

test('WRAPPER_ESCAPE TN: string returned by value, static string, buffer used locally', () => {
  expectTN('WRAPPER_ESCAPE', `
#include <string>
#include <cstring>
std::string a() { std::string s = "a"; return s; }
const char *b() { static std::string s = "b"; return s.c_str(); }
size_t c() { std::string s = "c"; const char *p = s.c_str(); return strlen(p); }
const char *d(const std::string &s) { return s.c_str(); }`, cpp);
});

test('NULL_FIELD TP: field set to NULL on a path and dereferenced', () => {
  const [f] = expectTP('NULL_FIELD', `
#include <stddef.h>
struct S { int *f; int n; };
int g(struct S *s, int c) {
  if (c)
    s->f = NULL;
  return *s->f; /*BUG*/
}`);
  assert.ok(tags(f).includes('assign_zero'));
  assert.ok(tags(f).includes('condition'));
  expectTN('FORWARD_NULL', `
#include <stddef.h>
struct S { int *f; int n; };
int g(struct S *s, int c) { if (c) s->f = NULL; return *s->f; }`);
});

test('NULL_FIELD TN: field reassigned or checked before the dereference', () => {
  expectTN('NULL_FIELD', `
#include <stddef.h>
struct S { int *f; };
int a(struct S *s, int *v) { s->f = NULL; s->f = v; return *s->f; }
int b(struct S *s) { s->f = NULL; if (s->f) return *s->f; return 0; }
int c(struct S *s, int *v) { s->f = v; return *s->f; }`);
});

test('SIZECHECK TP: constant allocation not a multiple of, or smaller than, the pointee', () => {
  expectTP('SIZECHECK', `
#include <stdlib.h>
struct P { int x, y; };
void f(void) {
  struct P *p = malloc(10); /*BUG*/
  free(p);
}`);
  expectTP('SIZECHECK', `
#include <stdlib.h>
void g(void) {
  long *q;
  q = (long *)malloc(4); /*BUG*/
  free(q);
}`);
});

test('SIZECHECK TN: sizeof-based sizes, char buffers, flexible array members, unknown sizes', () => {
  expectTN('SIZECHECK', `
#include <stdlib.h>
struct P { int x, y; };
struct V { int n; char data[]; };
void f(int n) {
  struct P *p = malloc(sizeof(struct P) * 2);
  char *c = malloc(7);
  struct V *v = malloc(sizeof(struct V) + 5);
  int *k = malloc(n);
  int *z = calloc(4, sizeof(int));
  free(p); free(c); free(v); free(k); free(z);
}`);
});

test('BAD_SIZEOF TP: array parameter, pointer element count and strncpy sized by the pointer', () => {
  expectTP('BAD_SIZEOF', `
int len(char buf[64]) {
  return (int)sizeof(buf); /*BUG*/
}`);
  expectTP('BAD_SIZEOF', `
int count(int *p) {
  return (int)(sizeof(p) / sizeof(p[0])); /*BUG*/
}`);
  expectTP('BAD_SIZEOF', `
#include <string.h>
void cp(char *dst, const char *src) {
  strncpy(dst, src, sizeof(dst)); /*BUG*/
}`);
});

test('BAD_SIZEOF TN: real arrays, pointer-to-pointer elements and memset left to SIZEOF_MISMATCH', () => {
  const found = expectTN('BAD_SIZEOF', `
#include <string.h>
void a(const char *src) { char dst[32]; strncpy(dst, src, sizeof(dst)); dst[31] = 0; (void)dst[0]; }
int b(void) { int v[8]; return (int)(sizeof(v) / sizeof(v[0])); }
void c(char **dst, char **src) { memcpy(dst, src, sizeof(src)); }
void d(int *p) { memset(p, 0, sizeof(p)); }`);
  assert.ok(of(found, 'SIZEOF_MISMATCH').length > 0);
});
