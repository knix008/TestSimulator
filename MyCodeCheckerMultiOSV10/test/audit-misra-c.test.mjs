// Precision checks of the MISRA C:2012 / C:2004 / C++:2008 packs on idioms of
// real projects: each compliant sample used to be reported; the matching
// non-compliant sample keeps the rule's true positives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const misraC = require('../core/misra-c');
const legacy = require('../core/misra-legacy');

function files(src, lang = 'c') {
  const list = typeof src === 'string' ? [{ path: lang === 'cpp' ? 't.cpp' : 't.c', text: src }] : src;
  return list.map((f) => ({ path: f.path, text: f.text, lang: f.lang || lang }));
}
function run(engine, src, options = {}, lang = 'c') {
  const warnings = [];
  const out = engine.analyze(files(src, lang), { inactive: new Set(), warnings, options });
  assert.deepEqual(warnings, [], JSON.stringify(warnings));
  return out;
}
const hits = (findings, rule) => findings.filter((f) => f.rule === rule);
function flagged(engine, rule, src, opts, lang) {
  const f = hits(run(engine, src, opts, lang), rule);
  assert.ok(f.length > 0, `${rule} should be reported`);
  return f;
}
function clean(engine, rule, src, opts, lang) {
  const f = hits(run(engine, src, opts, lang), rule);
  assert.deepEqual(f.map((x) => `${x.file}:${x.line} ${x.message && x.message.en}`), [], `${rule} should not be reported`);
}

// ---------------------------------------------------------------- headers that were not found

const MISSING = `#include <minigui/minigui.h>
static void draw(int hdc) {
  SetBrushColor(hdc, 3);
}
`;
const UNDECLARED = `#include <stdio.h>
static void draw(int hdc) {
  SetBrushColor(hdc, 3);
}
`;

test('17.3 / C:2004 8.1: a call that may be declared in a header that was not found is not reported', () => {
  clean(misraC, 'misra-c:17.3', MISSING);
  clean(legacy, 'misra-c2004:8.1', MISSING);
  flagged(misraC, 'misra-c:17.3', UNDECLARED);
  flagged(legacy, 'misra-c2004:8.1', UNDECLARED);
});

test('17.3: a project function called without a prototype is reported also with missing headers', () => {
  const src = [
    { path: 'a.c', text: '#include <minigui/minigui.h>\nint use(void) { return hit(1); }\n' },
    { path: 'b.c', text: 'int hit(int v) { return v; }\n' },
  ];
  flagged(misraC, 'misra-c:17.3', src);
});

test('17.7: the fictitious int result of an undeclared function is not reported as discarded', () => {
  clean(misraC, 'misra-c:17.7', MISSING);
  clean(misraC, 'misra-c:17.7', UNDECLARED);
  flagged(misraC, 'misra-c:17.7', '#include <stdio.h>\nvoid f(void) { printf("x"); }\n');
});

test('chapter 10 / 11 / 14.4: the type guessed for an undeclared function is not judged', () => {
  const src = `#include <minigui/minigui.h>
#include <stdint.h>
void f(void) {
  uint32_t k = ArchSwap32(3U);
  char *t = (char *)GetWindowText(1U);
  if (IsWindowVisible(2U)) { k = 1U; }
  (void)k; (void)t;
}
`;
  clean(legacy, 'misra-c2004:10.1', src);
  clean(misraC, 'misra-c:10.3', src);
  clean(misraC, 'misra-c:11.4', src);
  clean(misraC, 'misra-c:11.7', src);
  clean(misraC, 'misra-c:14.4', src);
  // a declared function keeps its type
  const decl = `#include <stdint.h>
int32_t swap(int32_t v);
int32_t g(int32_t a) { return a; }
void f(void) {
  uint32_t k = swap(3);
  if (g(2)) { k = 1U; }
  (void)k;
}
`;
  flagged(legacy, 'misra-c2004:10.1', decl);
  flagged(misraC, 'misra-c:10.3', decl);
  flagged(misraC, 'misra-c:14.4', decl);
});

test('14.4 honours the configured Boolean typedefs', () => {
  const src = 'typedef int flag_t;\nint f(flag_t ok) { if (ok) { return 1; } return 0; }\n';
  flagged(misraC, 'misra-c:14.4', src);
  clean(misraC, 'misra-c:14.4', src, { misra: { booleanTypedefs: ['flag_t'] } });
});

// ---------------------------------------------------------------- one type seen through a qualified copy

test('11.3 / 8.4: const pointer to a struct without a tag is the same type', () => {
  const src = `typedef struct { int a; } pk_t;
int build(const pk_t *p);
int build(const pk_t *p) { return p->a; }
static int use(pk_t *q) {
  const pk_t *r = q;
  return build(q) + r->a;
}
`;
  clean(misraC, 'misra-c:11.3', src);
  clean(legacy, 'misra-c2004:11.4', src);
  clean(misraC, 'misra-c:8.4', src);
  flagged(misraC, 'misra-c:11.3', 'typedef struct { int a; } pk_t;\ntypedef struct { int b; } other_t;\nint use(pk_t *q) { const other_t *r = (const other_t *)q; return r->b; }\n');
});

test('11.3: a wide string literal matches the wchar_t of the headers', () => {
  const src = '#include <wchar.h>\nint same(const wchar_t *s) { return wcscmp(s, L"x"); }\n';
  clean(misraC, 'misra-c:11.3', src);
});

test('11.5: `c ? p : NULL` has the type of p', () => {
  const src = '#include <stddef.h>\nstatic char buf[4];\nconst char *pick(int c) { const char *t = (c != 0) ? buf : NULL; return t; }\n';
  clean(misraC, 'misra-c:11.5', src);
  flagged(misraC, 'misra-c:11.5', '#include <stdlib.h>\nvoid f(void) { char *p = malloc(4U); free(p); }\n');
});

test('8.4: a declaration with a type from a missing header is not compared', () => {
  const src = [
    { path: 'video.h', text: '#include "lvgl/lvgl.h"\nbool video_is_playing(void);\n' },
    { path: 'video.c', text: '#include <stdbool.h>\n#include "video.h"\nbool video_is_playing(void) { return false; }\n' },
  ];
  clean(misraC, 'misra-c:8.4', src);
});

test('8.4: a definition in a unit that did not find the header declaring it is not reported', () => {
  const src = [
    { path: 'include/cam.h', text: 'void cam_apply(void);\n' },
    { path: 'src/logic/cam.c', text: '#include "../include/cam.h"\nvoid cam_apply(void) { }\n' },
    { path: 'src/main.c', text: '#include "include/cam.h"\nint main(void) { cam_apply(); return 0; }\n' },
  ];
  clean(misraC, 'misra-c:8.4', src);
  flagged(misraC, 'misra-c:8.4', 'void lonely(void) { }\n');
});

// ---------------------------------------------------------------- comments, macros and layout

test('Dir 4.4: code examples in documentation comments are not commented-out code', () => {
  clean(misraC, 'misra-c:dir-4.4', `/**
 * Argument checker.
 *
 * Usage:
 *    input_check(ctx);
 *    input_check(ctx, pd);
 */
int x;
`);
  clean(misraC, 'misra-c:dir-4.4', '/* Example: x = f(y); */\nint x;\n');
  flagged(misraC, 'misra-c:dir-4.4', '// x = f(1);\nint x;\n');
  flagged(legacy, 'misra-c2004:2.4', '/*\nstatic int g(int v)\n{\n  return v;\n}\n*/\nint x;\n');
});

test('C:2004 14.3: the semicolon after a macro call that expands to a block is no null statement', () => {
  clean(legacy, 'misra-c2004:14.3', '#define SWAP(a, b) { int t_ = (a); (a) = (b); (b) = t_; }\nvoid f(int x, int y) {\n  SWAP(x, y); /* swap */\n  (void)x;\n}\n');
  flagged(legacy, 'misra-c2004:14.3', 'void f(int x) {\n  x = 1; ;\n  (void)x;\n}\n');
});

test('C:2004 19.4: a macro naming an enumeration constant or a compliant macro is a constant', () => {
  clean(legacy, 'misra-c2004:19.4', 'enum mode { MODE_A, MODE_B };\n#define DEFAULT_MODE MODE_B\n#define START_MODE DEFAULT_MODE\nint m = START_MODE;\n');
  flagged(legacy, 'misra-c2004:19.4', '#define ERR_IO -4\nint e = ERR_IO;\n');
  flagged(legacy, 'misra-c2004:19.4', '#define EXPORT __attribute__((visibility("default")))\nEXPORT int e;\n');
});

test('13.5 / C:2004 12.4: a pure function defined in another file is no side effect', () => {
  const src = [
    { path: 'mode.c', text: 'static int g_mode;\nint is_special(void) { return g_mode; }\nvoid set_mode(int m) { g_mode = m; }\n' },
    { path: 'use.c', text: 'int is_special(void);\nvoid set_mode(int m);\nint f(int i) { if ((i == 2) && (is_special() != 0)) { return 1; } return 0; }\n' },
  ];
  clean(misraC, 'misra-c:13.5', src);
  clean(legacy, 'misra-c2004:12.4', src);
  const bad = [src[0], { path: 'use.c', text: 'int is_special(void);\nint set_flag(int m);\nint set_flag(int m) { static int n; n = m; return n; }\nint f(int i) { if ((i == 2) && (set_flag(i) != 0)) { return 1; } return 0; }\n' }];
  flagged(misraC, 'misra-c:13.5', bad);
});

test('5.7 / C:2004 5.4 / 5.7: references to one tag from several files are one type', () => {
  const src = [
    { path: 'a.c', text: '#include <sys/time.h>\nvoid fa(void) { struct timeval *tv = 0; (void)tv; }\n' },
    { path: 'b.c', text: '#include <sys/time.h>\nvoid fb(void) { struct timeval *tw = 0; (void)tw; }\n' },
  ];
  clean(misraC, 'misra-c:5.7', src);
  clean(legacy, 'misra-c2004:5.4', src);
  assert.ok(!hits(run(legacy, src), 'misra-c2004:5.7').some((f) => /timeval/.test(f.message.en)));
  flagged(misraC, 'misra-c:5.7', 'struct cap { int a; };\nstatic struct cap cap[2];\n');
  flagged(misraC, 'misra-c:5.7', [
    { path: 'a.c', text: 'struct node { int a; };\nint ua(struct node *n) { return n->a; }\n' },
    { path: 'b.c', text: 'struct node { long b; };\nlong ub(struct node *n) { return n->b; }\n' },
  ]);
});

test('Dir 4.9: macros that cannot be functions are not reported', () => {
  const src = `#define ATTR(m) __attribute__((deprecated(m)))
#define EXPORT
#define EXPORT_DEP(m) ATTR(m) EXPORT
#define SET(x, v) ((x) = (v))
#define BUMP(x) (++(x))
#define K(x) ((x) + 1)
int arr[K(2)];
int g(int v) {
  int r = 0;
  switch (v) { case K(4): r = 1; break; default: break; }
  SET(r, v);
  BUMP(r);
  return r;
}
`;
  clean(misraC, 'misra-c:dir-4.9', src);
  const f = flagged(misraC, 'misra-c:dir-4.9', '#define SQ(x) ((x) * (x))\nint h(int v) { return SQ(v); }\n');
  assert.match(f[0].message.en, /'SQ'/);
});

test('C:2004 18.1: a structure that a header that was not found may complete is not reported', () => {
  clean(legacy, 'misra-c2004:18.1', '#include <termios.h>\nvoid f(void) { struct termios *t = 0; (void)t; }\n');
  flagged(legacy, 'misra-c2004:18.1', 'struct opaque;\nvoid f(void) { struct opaque *t = 0; (void)t; }\n');
});

test('C++:2008 7-1-1 says that the pointer itself should be const', () => {
  const f = flagged(legacy, 'misra-cpp2008:7-1-1', '#include <cstring>\nint f(const char *s) {\n  const char *c = std::strchr(s, 44);\n  return c != nullptr ? 1 : 0;\n}\n', {}, 'cpp');
  assert.match(f[0].message.en, /should itself be const/);
  assert.match(f[0].message.ko, /포인터 자체가 const/);
});

test('22.10: errno read after a function that POSIX documents as setting it', () => {
  const src = `#include <errno.h>
#include <stdio.h>
#include <sys/stat.h>
int f(const char *p) {
  struct stat st;
  if (stat(p, &st) != 0) { (void)printf("%d", errno); return -1; }
  return 0;
}
`;
  clean(misraC, 'misra-c:22.10', src);
  flagged(misraC, 'misra-c:22.10', '#include <errno.h>\n#include <stdio.h>\nint f(void) {\n  (void)printf("x");\n  if (errno != 0) { return 1; }\n  return 0;\n}\n');
});

test('2.1: the while (0) of a do-while block that ends in a call that does not return', () => {
  clean(misraC, 'misra-c:2.1', '#include <stdlib.h>\n#define BUG() do { abort(); } while (0)\nvoid f(int x) {\n  switch (x) { case 1: break; default: BUG(); }\n}\n');
  flagged(misraC, 'misra-c:2.1', 'int h(int v) { return v; v++; }\n');
});

test('17.3 / C:2004 8.1: library functions the built-in headers lack are declared by the header included', () => {
  const src = '#include <time.h>\n#include <wchar.h>\n#include <unistd.h>\nstatic void f(wchar_t *d, const wchar_t *s) {\n  struct timespec ts;\n  (void)clock_gettime(0, &ts);\n  (void)wcscat(d, s);\n  (void)isatty(1);\n}\n';
  clean(misraC, 'misra-c:17.3', src);
  clean(legacy, 'misra-c2004:8.1', src);
  // without the header the call is undeclared
  flagged(misraC, 'misra-c:17.3', '#include <stdio.h>\nvoid f(void) { (void)isatty(1); }\n');
});
