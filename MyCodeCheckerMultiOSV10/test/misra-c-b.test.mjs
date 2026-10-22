// MISRA C:2012 / 2023 part B (Rules 13.1 - 23.8): one non-compliant and one
// compliant snippet per guideline, run through the misra-c engine.
//
// A case is { bad, good } where each is either a C text (file 't.c') or a
// list of files [{ path, text }]. The non-compliant snippet marks the line
// where the finding is expected with the comment `NC`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engine = require('../core/misra-c');

const CHAPTERS = ['13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23'];
const ours = (key) => CHAPTERS.includes(key.slice('misra-c:'.length).split('.')[0]);

function filesOf(src) {
  const list = typeof src === 'string' ? [{ path: 't.c', text: src }] : src;
  return list.map((f) => ({ path: f.path, text: f.text, lang: 'c' }));
}

function run(src, key) {
  const warnings = [];
  const findings = engine.analyze(filesOf(src), { warnings });
  assert.deepEqual(warnings.filter((w) => ours(w.rule)), [], 'no rule crashed');
  return findings.filter((f) => f.rule === key);
}

function markedLine(src) {
  for (const f of filesOf(src)) {
    const lines = f.text.split('\n');
    const i = lines.findIndex((l) => /\bNC\b/.test(l));
    if (i >= 0) return { file: f.path, line: i + 1 };
  }
  throw new Error('no NC marker in the non-compliant snippet');
}

const CASES = {
  // ---- 13 side effects ----------------------------------------------------
  '13.1': {
    bad: `int next(void);
void f(void) {
  int a[2] = { next(), 1 }; /* NC */
  (void)a;
}`,
    good: `void f(int v) {
  int a[2] = { v, 1 };
  (void)a;
}`,
  },
  '13.2': {
    bad: `void f(int i) {
  int a[4];
  a[i] = i++; /* NC */
}`,
    good: `void f(int i) {
  int a[4];
  a[i] = i + 1;
}`,
  },
  '13.3': {
    bad: `void f(int i) {
  int x;
  x = i++; /* NC */
  (void)x;
}`,
    good: `void f(int i) {
  int x;
  i++;
  x = i;
  (void)x;
}`,
  },
  '13.4': {
    bad: `int get(void);
void f(void) {
  int x;
  if ((x = get()) != 0) { /* NC */
    x = 1;
  }
}`,
    good: `int get(void);
void f(void) {
  int x;
  x = get();
  if (x != 0) {
    x = 1;
  }
}`,
  },
  '13.5': {
    bad: `int poll(void);
void f(int a) {
  if ((a > 0) && (poll() != 0)) { /* NC */
    a = 1;
  }
}`,
    good: `void f(int a, int b) {
  if ((a > 0) && (b > 0)) {
    a = 1;
  }
}`,
  },
  '13.6': {
    bad: `unsigned long f(int i) {
  return sizeof(i++); /* NC */
}`,
    good: `unsigned long f(int i) {
  return sizeof(i);
}`,
  },

  // ---- 14 control expressions ---------------------------------------------
  '14.1': {
    bad: `void f(void) {
  for (float x = 0.0f; x < 1.0f; x += 0.1f) { /* NC */
  }
}`,
    good: `void f(void) {
  for (int i = 0; i < 10; i++) {
  }
}`,
  },
  '14.2': {
    bad: `void f(void) {
  int i;
  for (i = 0; i < 10; i++) { /* NC */
    i = i + 2;
  }
}`,
    good: `void f(int *s) {
  int i;
  for (i = 0; i < 10; i++) {
    *s += i;
  }
}`,
  },
  '14.3': {
    bad: `void f(unsigned char u, int *r) {
  if (u > 300U) { /* NC */
    *r = 1;
  }
}`,
    good: `void f(unsigned char u, int *r) {
  if (u > 3U) {
    *r = 1;
  }
}`,
  },
  '14.4': {
    bad: `void f(int x, int *r) {
  if (x) { /* NC */
    *r = 1;
  }
}`,
    good: `void f(int x, int *r) {
  if (x != 0) {
    *r = 1;
  }
}`,
  },

  // ---- 15 control flow ----------------------------------------------------
  '15.1': {
    bad: `void f(int x) {
  if (x > 0) {
    goto out; /* NC */
  }
out:
  return;
}`,
    good: `void f(int x) {
  if (x > 0) {
    x = 0;
  }
}`,
  },
  '15.2': {
    bad: `void f(int x) {
again:
  x++;
  if (x < 10) {
    goto again; /* NC */
  }
}`,
    good: `void f(int x) {
  if (x < 10) {
    goto done;
  }
  x++;
done:
  x = 0;
}`,
  },
  '15.3': {
    bad: `void f(int x) {
  goto inside; /* NC */
  if (x > 0) {
inside:
    x = 1;
  }
}`,
    good: `void f(int x) {
  if (x > 0) {
    goto after;
  }
  x = 2;
after:
  x = 1;
}`,
  },
  '15.4': {
    bad: `void f(int n) {
  for (int i = 0; i < 10; i++) {
    if (i == n) {
      break;
    }
    if (i == (2 * n)) {
      break; /* NC */
    }
  }
}`,
    good: `void f(int n) {
  for (int i = 0; i < 10; i++) {
    if (i == n) {
      break;
    }
  }
}`,
  },
  '15.5': {
    bad: `int f(int x) {
  if (x > 0) {
    return 1; /* NC */
  }
  return 0;
}`,
    good: `int f(int x) {
  int r = 0;
  if (x > 0) {
    r = 1;
  }
  return r;
}`,
  },
  '15.6': {
    bad: `void f(int x, int *r) {
  if (x > 0)
    *r = 1; /* NC */
}`,
    good: `void f(int x, int *r) {
  if (x > 0) {
    *r = 1;
  }
}`,
  },
  '15.7': {
    bad: `void f(int x, int *r) {
  if (x > 0) {
    *r = 1;
  } else if (x < 0) { /* NC */
    *r = 2;
  }
}`,
    good: `void f(int x, int *r) {
  if (x > 0) {
    *r = 1;
  } else if (x < 0) {
    *r = 2;
  } else {
    *r = 0;
  }
}`,
  },

  // ---- 16 switch ----------------------------------------------------------
  '16.1': {
    bad: `void f(int x, int *r) {
  switch (x) {
    *r = 0; /* NC */
    case 1:
      *r = 1;
      break;
    default:
      break;
  }
}`,
    good: `void f(int x, int *r) {
  switch (x) {
    case 1:
      *r = 1;
      break;
    default:
      break;
  }
}`,
  },
  '16.2': {
    bad: `void f(int x, int y, int *r) {
  switch (x) {
    case 1:
      if (y > 0) {
        case 2: /* NC */
          *r = 1;
      }
      break;
    default:
      break;
  }
}`,
    good: `void f(int x, int *r) {
  switch (x) {
    case 1:
    case 2:
      *r = 1;
      break;
    default:
      break;
  }
}`,
  },
  '16.3': {
    bad: `void f(int x, int *r) {
  switch (x) {
    case 1: /* NC */
      *r = 1;
    case 2:
      *r = 2;
      break;
    default:
      break;
  }
}`,
    good: `void f(int x, int *r) {
  switch (x) {
    case 1:
      *r = 1;
      break;
    case 2:
      *r = 2;
      break;
    default:
      break;
  }
}`,
  },
  '16.4': {
    bad: `void f(int x, int *r) {
  switch (x) { /* NC */
    case 1:
      *r = 1;
      break;
    case 2:
      *r = 2;
      break;
  }
}`,
    good: `void f(int x, int *r) {
  switch (x) {
    case 1:
      *r = 1;
      break;
    default:
      *r = 2;
      break;
  }
}`,
  },
  '16.5': {
    bad: `void f(int x, int *r) {
  switch (x) {
    case 1:
      *r = 1;
      break;
    default: /* NC */
      break;
    case 2:
      *r = 2;
      break;
  }
}`,
    good: `void f(int x, int *r) {
  switch (x) {
    default:
      break;
    case 1:
      *r = 1;
      break;
    case 2:
      *r = 2;
      break;
  }
}`,
  },
  '16.6': {
    bad: `void f(int x, int *r) {
  switch (x) { /* NC */
    default:
      *r = 1;
      break;
  }
}`,
    good: `void f(int x, int *r) {
  switch (x) {
    case 0:
      *r = 0;
      break;
    default:
      *r = 1;
      break;
  }
}`,
  },
  '16.7': {
    bad: `void f(int x, int *r) {
  switch (x > 0) { /* NC */
    case 0:
      *r = 0;
      break;
    default:
      *r = 1;
      break;
  }
}`,
    good: `void f(int x, int *r) {
  switch (x) {
    case 0:
      *r = 0;
      break;
    default:
      *r = 1;
      break;
  }
}`,
  },

  // ---- 17 functions -------------------------------------------------------
  '17.1': {
    bad: `#include <stdarg.h>
int sum(int n, ...) {
  va_list ap; /* NC */
  int s = 0;
  va_start(ap, n);
  s = va_arg(ap, int);
  va_end(ap);
  return s + n;
}`,
    good: `int sum(int n, int m) {
  return n + m;
}`,
  },
  '17.2': {
    bad: [
      { path: 'a.c', text: `int g(int n);
int f(int n) { /* NC */
  return (n > 0) ? g(n - 1) : 0;
}` },
      { path: 'b.c', text: `int f(int n);
int g(int n) {
  return f(n);
}` },
    ],
    good: [
      { path: 'a.c', text: `int g(int n);
int f(int n) {
  return g(n - 1);
}` },
      { path: 'b.c', text: `int g(int n) {
  return n * 2;
}` },
    ],
  },
  '17.3': {
    bad: `void f(void) {
  undeclared_fn(); /* NC */
}`,
    good: `void declared_fn(void);
void f(void) {
  declared_fn();
}`,
  },
  '17.4': {
    bad: `int f(int x) {
  if (x > 0) {
    return 1;
  }
} /* NC */`,
    good: `int f(int x) {
  int r = 0;
  if (x > 0) {
    r = 1;
  }
  return r;
}`,
  },
  '17.5': {
    bad: `void use4(int a[4]);
void f(void) {
  int b[2] = { 0 };
  use4(b); /* NC */
}`,
    good: `void use4(int a[4]);
void f(void) {
  int b[4] = { 0 };
  use4(b);
}`,
  },
  '17.6': {
    bad: `void use4(int a[static 4]); /* NC */`,
    good: `void use4(int a[4]);`,
  },
  '17.7': {
    bad: `int get(void);
void f(void) {
  get(); /* NC */
}`,
    good: `int get(void);
void f(void) {
  (void)get();
}`,
  },
  '17.8': {
    bad: `int f(int x) {
  x = x + 1; /* NC */
  return x;
}`,
    good: `int f(int x) {
  int y = x + 1;
  return y;
}`,
  },
  '17.9': {
    bad: `_Noreturn void stop(int x) {
  if (x > 0) {
    for (;;) {
    }
  }
} /* NC */`,
    good: `_Noreturn void stop(void) {
  for (;;) {
  }
}`,
  },
  '17.10': {
    bad: `_Noreturn int stop(void) { /* NC */
  for (;;) {
  }
}`,
    good: `_Noreturn void stop(void) {
  for (;;) {
  }
}`,
  },
  '17.11': {
    bad: `void spin(void) { /* NC */
  for (;;) {
  }
}`,
    good: `_Noreturn void spin(void) {
  for (;;) {
  }
}`,
  },
  '17.12': {
    bad: `void handler(void);
void (*hp)(void) = handler; /* NC */`,
    good: `void handler(void);
void (*hp)(void) = &handler;`,
  },
  '17.13': {
    bad: `typedef int fn_t(int);
const fn_t *fp; /* NC */`,
    good: `typedef int fn_t(int);
fn_t *fp;`,
  },

  // ---- 18 pointers and arrays ---------------------------------------------
  '18.1': {
    bad: `int f(void) {
  int a[4] = { 0 };
  return a[4]; /* NC */
}`,
    good: `int f(void) {
  int a[4] = { 0 };
  return a[3];
}`,
  },
  '18.2': {
    bad: `long f(void) {
  int a[4];
  int b[4];
  return &a[1] - &b[0]; /* NC */
}`,
    good: `long f(void) {
  int a[4];
  return &a[3] - &a[0];
}`,
  },
  '18.3': {
    bad: `int f(void) {
  int a[4];
  int b[4];
  return &a[1] < &b[0]; /* NC */
}`,
    good: `int f(void) {
  int a[4];
  return &a[1] < &a[3];
}`,
  },
  '18.4': {
    bad: `int f(int *p) {
  int *q = p + 1; /* NC */
  return *q;
}`,
    good: `int f(int *p) {
  return p[1];
}`,
  },
  '18.5': {
    bad: `int ***ppp; /* NC */`,
    good: `int **pp;`,
  },
  '18.6': {
    bad: `int *f(void) {
  int x = 0;
  return &x; /* NC */
}`,
    good: `int *f(void) {
  static int x = 0;
  return &x;
}`,
  },
  '18.7': {
    bad: `struct msg {
  int n;
  int data[]; /* NC */
};`,
    good: `struct msg {
  int n;
  int data[8];
};`,
  },
  '18.8': {
    bad: `void f(int n) {
  int buf[n]; /* NC */
  buf[0] = 0;
}`,
    good: `void f(void) {
  int buf[8];
  buf[0] = 0;
}`,
  },
  '18.9': {
    bad: `struct S { int a[4]; };
struct S make(void);
int f(void) {
  int *p = make().a; /* NC */
  return p[0];
}`,
    good: `struct S { int a[4]; };
struct S make(void);
int f(void) {
  struct S s = make();
  int *p = s.a;
  return p[0];
}`,
  },
  '18.10': {
    bad: `void f(int n, int (*p)[n]); /* NC */`,
    good: `void f(int n, int (*p)[4]);`,
  },

  // ---- 19 overlapping storage ---------------------------------------------
  '19.1': {
    bad: `#include <string.h>
void f(void) {
  char b[8] = { 0 };
  (void)memcpy(&b[1], &b[0], 4); /* NC */
}`,
    good: `#include <string.h>
void f(void) {
  char b[8] = { 0 };
  (void)memcpy(&b[4], &b[0], 4);
}`,
  },
  '19.2': {
    bad: `union u { /* NC */
  int i;
  float f;
};`,
    good: `struct s {
  int i;
  float f;
};`,
  },

  // ---- 20 preprocessing ---------------------------------------------------
  '20.1': {
    bad: `int x;
#include <stdio.h> /* NC */`,
    good: `#include <stdio.h>
int x;`,
  },
  '20.2': {
    bad: `#include "we'rd.h" /* NC */
int x;`,
    good: `#include "weird.h"
int x;`,
  },
  '20.3': {
    bad: `#include <stdio.h> extra /* NC */
int x;`,
    good: `#include <stdio.h>
int x;`,
  },
  '20.4': {
    bad: `#define inline /* NC */
int x;`,
    good: `#define MY_INLINE
int x;`,
  },
  '20.5': {
    bad: `#define LIMIT 4
#undef LIMIT /* NC */
int x;`,
    good: `#define LIMIT 4
int x = LIMIT;`,
  },
  '20.6': {
    bad: `#define ID(a) (a)
int x = ID(
#ifdef FOO /* NC */
1
#else
2
#endif
);`,
    good: `#define ID(a) (a)
#ifdef FOO
int x = ID(1);
#else
int x = ID(2);
#endif`,
  },
  '20.7': {
    bad: `#define SQ(x) x * x /* NC */
int y = SQ(3);`,
    good: `#define SQ(x) ((x) * (x))
int y = SQ(3);`,
  },
  '20.8': {
    bad: `#if 2 /* NC */
int x;
#endif`,
    good: `#if 1
int x;
#endif`,
  },
  '20.9': {
    bad: `#if FEATURE_X /* NC */
int x;
#endif`,
    good: `#if defined(FEATURE_X)
int x;
#endif`,
  },
  '20.10': {
    bad: `#define STR(x) #x /* NC */
const char *s = STR(abc);`,
    good: `#define TWICE(x) ((x) * 2)
int s = TWICE(4);`,
  },
  '20.11': {
    bad: `#define M(x, y) #x ## y /* NC */
int z;`,
    good: `#define M(x, y) x ## y
int z;`,
  },
  '20.12': {
    bad: `#define AA 1
#define CAT(x) ((x) + x ## 1)
int AA1 = 0;
int v = CAT(AA); /* NC */`,
    good: `#define CAT(x) ((x) + x ## 1)
int bb = 2;
int bb1 = 0;
int v = CAT(bb);`,
  },
  '20.13': {
    bad: `#if 0
#elsif X /* NC */
#endif
int x;`,
    good: `#if 0
#else
#endif
int x;`,
  },
  '20.14': {
    bad: [
      { path: 'a.h', text: `#if 1 /* NC */
int a;
` },
      { path: 't.c', text: `#include "a.h"
#endif
int b;` },
    ],
    good: [
      { path: 'a.h', text: `#if 1
int a;
#endif
` },
      { path: 't.c', text: `#include "a.h"
int b;` },
    ],
  },

  // ---- 21 standard library ------------------------------------------------
  '21.1': {
    bad: `#define _MY_LIMIT 4 /* NC */
int x;`,
    good: `#define MY_LIMIT 4
int x;`,
  },
  '21.2': {
    bad: `int _Count; /* NC */`,
    good: `int count;`,
  },
  '21.3': {
    bad: `#include <stdlib.h>
void *f(void) {
  return malloc(4U); /* NC */
}`,
    good: `static char pool[4];
void *f(void) {
  return pool;
}`,
  },
  '21.4': {
    bad: `#include <setjmp.h> /* NC */
int x;`,
    good: `#include <stddef.h>
int x;`,
  },
  '21.5': {
    bad: `#include <signal.h> /* NC */
int x;`,
    good: `#include <stddef.h>
int x;`,
  },
  '21.6': {
    bad: `#include <stdio.h>
void f(void) {
  (void)printf("hi"); /* NC */
}`,
    good: `void out(const char *s);
void f(void) {
  out("hi");
}`,
  },
  '21.7': {
    bad: `#include <stdlib.h>
int f(const char *s) {
  return atoi(s); /* NC */
}`,
    good: `#include <stdlib.h>
long f(const char *s) {
  return strtol(s, NULL, 10);
}`,
  },
  '21.8': {
    bad: `#include <stdlib.h>
void f(void) {
  exit(1); /* NC */
}`,
    good: `int f(void) {
  return 1;
}`,
  },
  '21.9': {
    bad: `#include <stdlib.h>
int cmp(const void *a, const void *b);
void f(int *a) {
  qsort(a, 4U, sizeof(int), &cmp); /* NC */
}`,
    good: `void sort4(int *a);
void f(int *a) {
  sort4(a);
}`,
  },
  '21.10': {
    bad: `#include <time.h>
long f(void) {
  return (long)time(NULL); /* NC */
}`,
    good: `long now(void);
long f(void) {
  return now();
}`,
  },
  '21.11': {
    bad: `#include <tgmath.h> /* NC */
int x;`,
    good: `#include <math.h>
int x;`,
  },
  '21.12': {
    bad: `#include <fenv.h>
int f(void) {
  return fetestexcept(FE_DIVBYZERO); /* NC */
}`,
    good: `#include <fenv.h>
int f(void) {
  return fegetround();
}`,
  },
  '21.13': {
    bad: `#include <ctype.h>
int f(char c) {
  return isdigit(c); /* NC */
}`,
    good: `#include <ctype.h>
int f(char c) {
  return isdigit((unsigned char)c);
}`,
  },
  '21.14': {
    bad: `#include <string.h>
int f(const char *s) {
  return memcmp(s, "abc", 3U); /* NC */
}`,
    good: `#include <string.h>
int f(const int *a, const int *b) {
  return memcmp(a, b, 4U * sizeof(int));
}`,
  },
  '21.15': {
    bad: `#include <string.h>
void f(int *d, const float *s) {
  (void)memcpy(d, s, 4U); /* NC */
}`,
    good: `#include <string.h>
void f(int *d, const int *s) {
  (void)memcpy(d, s, 4U);
}`,
  },
  '21.16': {
    bad: `#include <string.h>
struct pt { char c; int v; };
int f(const struct pt *a, const struct pt *b) {
  return memcmp(a, b, sizeof(struct pt)); /* NC */
}`,
    good: `#include <string.h>
int f(const int *a, const int *b) {
  return memcmp(a, b, sizeof(int));
}`,
  },
  '21.17': {
    bad: `#include <string.h>
void f(void) {
  char d[4];
  (void)strcpy(d, "hello"); /* NC */
}`,
    good: `#include <string.h>
void f(void) {
  char d[8];
  (void)strcpy(d, "hello");
}`,
  },
  '21.18': {
    bad: `#include <string.h>
void f(void) {
  char d[4];
  (void)memset(d, 0, 8U); /* NC */
}`,
    good: `#include <string.h>
void f(void) {
  char d[4];
  (void)memset(d, 0, sizeof(d));
}`,
  },
  '21.19': {
    bad: `#include <stdlib.h>
void f(void) {
  char *p = getenv("HOME"); /* NC */
  (void)p;
}`,
    good: `#include <stdlib.h>
void f(void) {
  const char *p = getenv("HOME");
  (void)p;
}`,
  },
  '21.20': {
    bad: `#include <stdlib.h>
void use(const char *s);
void f(void) {
  const char *a = getenv("A");
  const char *b = getenv("B");
  use(a); /* NC */
  use(b);
}`,
    good: `#include <stdlib.h>
void use(const char *s);
void f(void) {
  const char *a = getenv("A");
  use(a);
  const char *b = getenv("B");
  use(b);
}`,
  },
  '21.21': {
    bad: `#include <stdlib.h>
int f(void) {
  return system("ls"); /* NC */
}`,
    good: `int run_ls(void);
int f(void) {
  return run_ls();
}`,
  },
  '21.22': {
    bad: `#include <tgmath.h>
double f(char c) {
  return sqrt(c); /* NC */
}`,
    good: `#include <tgmath.h>
double f(double d) {
  return sqrt(d);
}`,
  },
  '21.23': {
    bad: `#include <tgmath.h>
double f(float a, double b) {
  return pow(a, b); /* NC */
}`,
    good: `#include <tgmath.h>
double f(double a, double b) {
  return pow(a, b);
}`,
  },
  '21.24': {
    bad: `#include <stdlib.h>
int f(void) {
  return rand(); /* NC */
}`,
    good: `int my_random(void);
int f(void) {
  return my_random();
}`,
  },
  '21.25': {
    bad: `#include <stdatomic.h>
atomic_int counter;
int f(void) {
  return atomic_load_explicit(&counter, memory_order_relaxed); /* NC */
}`,
    good: `#include <stdatomic.h>
atomic_int counter;
int f(void) {
  return atomic_load_explicit(&counter, memory_order_seq_cst);
}`,
  },
  '21.26': {
    bad: `#include <threads.h>
#include <time.h>
static mtx_t m;
void init(void) {
  (void)mtx_init(&m, mtx_plain);
}
void f(const struct timespec *ts) {
  (void)mtx_timedlock(&m, ts); /* NC */
  (void)mtx_unlock(&m);
}`,
    good: `#include <threads.h>
#include <time.h>
static mtx_t m;
void init(void) {
  (void)mtx_init(&m, mtx_timed);
}
void f(const struct timespec *ts) {
  (void)mtx_timedlock(&m, ts);
  (void)mtx_unlock(&m);
}`,
  },

  // ---- 22 resources -------------------------------------------------------
  '22.1': {
    bad: `#include <stdlib.h>
void f(void) {
  int *p = malloc(sizeof(int)); /* NC */
  if (p != NULL) {
    *p = 1;
  }
}`,
    good: `#include <stdlib.h>
void f(void) {
  int *p = malloc(sizeof(int));
  if (p != NULL) {
    *p = 1;
  }
  free(p);
}`,
  },
  '22.2': {
    bad: `#include <stdlib.h>
void f(void) {
  int x = 0;
  int *p = &x;
  free(p); /* NC */
}`,
    good: `#include <stdlib.h>
void f(void) {
  int *p = malloc(sizeof(int));
  free(p);
}`,
  },
  '22.3': {
    bad: `#include <stdio.h>
void f(void) {
  FILE *a = fopen("data.txt", "r");
  FILE *b = fopen("data.txt", "w"); /* NC */
  if (a != NULL) { (void)fclose(a); }
  if (b != NULL) { (void)fclose(b); }
}`,
    good: `#include <stdio.h>
void f(void) {
  FILE *a = fopen("data.txt", "r");
  if (a != NULL) { (void)fclose(a); }
  FILE *b = fopen("data.txt", "w");
  if (b != NULL) { (void)fclose(b); }
}`,
  },
  '22.4': {
    bad: `#include <stdio.h>
void f(void) {
  FILE *fp = fopen("data.txt", "r");
  if (fp != NULL) {
    (void)fputs("x", fp); /* NC */
    (void)fclose(fp);
  }
}`,
    good: `#include <stdio.h>
void f(void) {
  FILE *fp = fopen("data.txt", "w");
  if (fp != NULL) {
    (void)fputs("x", fp);
    (void)fclose(fp);
  }
}`,
  },
  '22.5': {
    bad: `#include <stdio.h>
void f(FILE *fp) {
  FILE copy = *fp; /* NC */
  (void)copy;
}`,
    good: `#include <stdio.h>
void f(FILE *fp) {
  (void)fflush(fp);
}`,
  },
  '22.6': {
    bad: `#include <stdio.h>
void f(void) {
  FILE *fp = fopen("data.txt", "w");
  if (fp != NULL) {
    (void)fclose(fp);
    (void)fputs("x", fp); /* NC */
  }
}`,
    good: `#include <stdio.h>
void f(void) {
  FILE *fp = fopen("data.txt", "w");
  if (fp != NULL) {
    (void)fputs("x", fp);
    (void)fclose(fp);
  }
}`,
  },
  '22.7': {
    bad: `#include <stdio.h>
int f(void) {
  char c = (char)getchar();
  return c == EOF; /* NC */
}`,
    good: `#include <stdio.h>
int f(void) {
  int c = getchar();
  return c == EOF;
}`,
  },
  '22.8': {
    bad: `#include <stdlib.h>
#include <errno.h>
long f(const char *s) {
  long v = strtol(s, NULL, 10); /* NC */
  if (errno != 0) {
    v = 0;
  }
  return v;
}`,
    good: `#include <stdlib.h>
#include <errno.h>
long f(const char *s) {
  errno = 0;
  long v = strtol(s, NULL, 10);
  if (errno != 0) {
    v = 0;
  }
  return v;
}`,
  },
  '22.9': {
    bad: `#include <stdlib.h>
#include <errno.h>
long f(const char *s) {
  errno = 0;
  long v = strtol(s, NULL, 10); /* NC */
  return v;
}`,
    good: `#include <stdlib.h>
#include <errno.h>
long f(const char *s) {
  errno = 0;
  long v = strtol(s, NULL, 10);
  if (errno != 0) {
    v = 0;
  }
  return v;
}`,
  },
  '22.10': {
    bad: `#include <errno.h>
void work(void);
int f(void) {
  errno = 0;
  work();
  return errno != 0; /* NC */
}`,
    good: `#include <stdlib.h>
#include <errno.h>
int f(const char *s) {
  errno = 0;
  long v = strtol(s, NULL, 10);
  return (errno != 0) || (v == 0);
}`,
  },
  '22.11': {
    bad: `#include <threads.h>
int body(void *arg);
void f(void) {
  thrd_t t;
  if (thrd_create(&t, &body, NULL) == thrd_success) {
    (void)thrd_join(t, NULL);
    (void)thrd_detach(t); /* NC */
  }
}`,
    good: `#include <threads.h>
int body(void *arg);
void f(void) {
  thrd_t t;
  if (thrd_create(&t, &body, NULL) == thrd_success) {
    (void)thrd_join(t, NULL);
  }
}`,
  },
  '22.12': {
    bad: `#include <threads.h>
int same(thrd_t a, thrd_t b) {
  return a == b; /* NC */
}`,
    good: `#include <threads.h>
int same(thrd_t a, thrd_t b) {
  return thrd_equal(a, b);
}`,
  },
  '22.13': {
    bad: `#include <threads.h>
void f(void) {
  mtx_t m; /* NC */
  (void)mtx_init(&m, mtx_plain);
  mtx_destroy(&m);
}`,
    good: `#include <threads.h>
static mtx_t m;
void f(void) {
  (void)mtx_init(&m, mtx_plain);
  mtx_destroy(&m);
}`,
  },
  '22.14': {
    bad: `#include <threads.h>
mtx_t gm;
void f(void) {
  (void)mtx_lock(&gm); /* NC */
  (void)mtx_unlock(&gm);
}`,
    good: [
      { path: 'init.c', text: `#include <threads.h>
extern mtx_t gm;
void init(void) {
  (void)mtx_init(&gm, mtx_plain);
}` },
      { path: 't.c', text: `#include <threads.h>
mtx_t gm;
void f(void) {
  (void)mtx_lock(&gm);
  (void)mtx_unlock(&gm);
}` },
    ],
  },
  '22.15': {
    bad: `#include <threads.h>
static mtx_t m;
int body(void *arg);
void f(void) {
  thrd_t t;
  (void)mtx_init(&m, mtx_plain);
  (void)thrd_create(&t, &body, NULL);
  mtx_destroy(&m); /* NC */
  (void)thrd_join(t, NULL);
}`,
    good: `#include <threads.h>
static mtx_t m;
int body(void *arg);
void f(void) {
  thrd_t t;
  (void)mtx_init(&m, mtx_plain);
  (void)thrd_create(&t, &body, NULL);
  (void)thrd_join(t, NULL);
  mtx_destroy(&m);
}`,
  },
  '22.16': {
    bad: `#include <threads.h>
static mtx_t m;
int f(int x) { /* NC */
  (void)mtx_lock(&m);
  if (x > 0) {
    return 1;
  }
  (void)mtx_unlock(&m);
  return 0;
}`,
    good: `#include <threads.h>
static mtx_t m;
int f(int x) {
  int r = 0;
  (void)mtx_lock(&m);
  if (x > 0) {
    r = 1;
  }
  (void)mtx_unlock(&m);
  return r;
}`,
  },
  '22.17': {
    bad: `#include <threads.h>
static mtx_t m;
void f(void) {
  (void)mtx_lock(&m);
  (void)mtx_unlock(&m);
  (void)mtx_unlock(&m); /* NC */
}`,
    good: `#include <threads.h>
static mtx_t m;
void f(void) {
  (void)mtx_lock(&m);
  (void)mtx_unlock(&m);
}`,
  },
  '22.18': {
    bad: `#include <threads.h>
static mtx_t m;
void f(void) {
  (void)mtx_lock(&m);
  (void)mtx_lock(&m); /* NC */
  (void)mtx_unlock(&m);
  (void)mtx_unlock(&m);
}`,
    good: `#include <threads.h>
static mtx_t m;
void init(void) {
  (void)mtx_init(&m, mtx_plain | mtx_recursive);
}
void f(void) {
  (void)mtx_lock(&m);
  (void)mtx_lock(&m);
  (void)mtx_unlock(&m);
  (void)mtx_unlock(&m);
}`,
  },
  '22.19': {
    bad: [
      { path: 'a.c', text: `#include <threads.h>
extern cnd_t cv;
extern mtx_t m1;
void a(void) {
  (void)mtx_lock(&m1);
  (void)cnd_wait(&cv, &m1);
  (void)mtx_unlock(&m1);
}` },
      { path: 'b.c', text: `#include <threads.h>
extern cnd_t cv;
extern mtx_t m2;
void b(void) {
  (void)mtx_lock(&m2);
  (void)cnd_wait(&cv, &m2); /* NC */
  (void)mtx_unlock(&m2);
}` },
    ],
    good: `#include <threads.h>
extern cnd_t cv;
extern mtx_t m1;
void a(void) {
  (void)mtx_lock(&m1);
  (void)cnd_wait(&cv, &m1);
  (void)cnd_wait(&cv, &m1);
  (void)mtx_unlock(&m1);
}`,
  },
  '22.20': {
    bad: `#include <threads.h>
static tss_t key;
void *f(void) {
  return tss_get(key); /* NC */
}`,
    good: `#include <threads.h>
static tss_t key;
void init(void) {
  (void)tss_create(&key, NULL);
}
void *f(void) {
  return tss_get(key);
}`,
  },

  // ---- 23 generic selections ----------------------------------------------
  '23.1': {
    bad: `int f(int x) {
  return _Generic(x, int: 1, default: 0); /* NC */
}`,
    good: `#define KIND(v) _Generic((v), int: 1, default: 0)
int f(int x) {
  return KIND(x);
}`,
  },
  '23.2': {
    bad: `int f(int x) {
  return _Generic(x++, int: 1, default: 0); /* NC */
}`,
    good: `int f(int x) {
  return _Generic(x, int: 1, default: 0);
}`,
  },
  '23.3': {
    bad: `#define KIND(v) _Generic((v), default: 0)
int f(int x) {
  return KIND(x); /* NC */
}`,
    good: `#define KIND(v) _Generic((v), int: 1, default: 0)
int f(int x) {
  return KIND(x);
}`,
  },
  '23.4': {
    bad: `#define KIND(v) _Generic((v), const int: 1, default: 0)
int f(int x) {
  return KIND(x); /* NC */
}`,
    good: `#define KIND(v) _Generic((v), int: 1, default: 0)
int f(int x) {
  return KIND(x);
}`,
  },
  '23.5': {
    bad: `#define KIND(v) _Generic((v), int *: 1, default: 0)
int f(const int *p) {
  return KIND(p); /* NC */
}`,
    good: `#define KIND(v) _Generic((v), int *: 1, const int *: 2, default: 0)
int f(const int *p) {
  return KIND(p);
}`,
  },
  '23.6': {
    bad: `#define KIND(v) _Generic((v), char: 1, int: 2, default: 0)
int f(void) {
  return KIND('a'); /* NC */
}`,
    good: `#define KIND(v) _Generic((v), char: 1, int: 2, default: 0)
int f(char c) {
  return KIND(c);
}`,
  },
  '23.7': {
    bad: `#define DBL(v) _Generic((v), int: (v) + (v), default: 0) /* NC */
int f(int x) {
  return DBL(x);
}`,
    good: `int twice_i(int v);
#define DBL(v) _Generic((v), int: twice_i, default: twice_i)(v)
int f(int x) {
  return DBL(x);
}`,
  },
  '23.8': {
    bad: `#define KIND(v) _Generic((v), int: 1, default: 0, long: 2)
int f(int x) {
  return KIND(x); /* NC */
}`,
    good: `#define KIND(v) _Generic((v), int: 1, long: 2, default: 0)
int f(int x) {
  return KIND(x);
}`,
  },
};

// ---------------------------------------------------------------------------

const catalog = engine.catalog().filter((m) => ours(m.key));
const byKey = new Map(catalog.map((m) => [m.key, m]));

test('part B catalog covers every guideline of chapters 13-23 exactly once', () => {
  const expected = {
    13: 6, 14: 4, 15: 7, 16: 7, 17: 13, 18: 10, 19: 2, 20: 14, 21: 26, 22: 20, 23: 8,
  };
  const keys = catalog.map((m) => m.key);
  assert.equal(new Set(keys).size, keys.length, 'no duplicate keys');
  for (const [ch, n] of Object.entries(expected)) {
    assert.equal(keys.filter((k) => k.startsWith(`misra-c:${ch}.`)).length, n, `chapter ${ch}`);
  }
  for (const k of keys) assert.ok(CASES[k.slice(8)], `test case for ${k}`);
});

test('part B rule metadata is complete', () => {
  const hangul = /[가-힣]/;
  for (const m of catalog) {
    const id = m.key.slice(8);
    assert.deepEqual(m.langs, ['c'], m.key);
    assert.ok(['BUG', 'CODE_SMELL', 'VULNERABILITY'].includes(m.type), m.key);
    assert.ok(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'].includes(m.severity), m.key);
    assert.ok(m.debtMin > 0, m.key);
    for (const t of ['misra-c2012', 'misra-c2023', 'misra']) assert.ok(m.tags.includes(t), `${m.key} tag ${t}`);
    for (const t of m.tags) assert.equal(t, t.toLowerCase(), `${m.key} tag case`);
    assert.equal(m.standards.misraC2012, `Rule ${id}`, m.key);
    assert.equal(m.standards.misraC2023, `Rule ${id}`, m.key);
    assert.ok(['Mandatory', 'Required', 'Advisory'].includes(m.misraCategory), m.key);
    assert.equal(typeof m.decidable, 'boolean', m.key);
    for (const f of ['name', 'why', 'fix']) {
      assert.ok(m[f] && m[f].en && m[f].en.length > 10, `${m.key} ${f}.en`);
      assert.ok(m[f].ko && hangul.test(m[f].ko), `${m.key} ${f}.ko`);
    }
    if (m.cwe) {
      assert.match(m.cwe, /^CWE-\d+$/, m.key);
      assert.ok(m.tags.includes(m.cwe.toLowerCase()), `${m.key} cwe tag`);
    }
    assert.ok(!m.manualReview, `${m.key} is automated`);
  }
  // spot checks of categories and types
  assert.equal(byKey.get('misra-c:13.6').misraCategory, 'Required');
  assert.equal(byKey.get('misra-c:13.6').misraCategory2012, 'Mandatory');
  assert.equal(byKey.get('misra-c:17.3').misraCategory, 'Mandatory');
  assert.equal(byKey.get('misra-c:21.3').type, 'VULNERABILITY');
  assert.equal(byKey.get('misra-c:22.2').type, 'VULNERABILITY');
  assert.equal(byKey.get('misra-c:15.5').type, 'CODE_SMELL');
  assert.equal(byKey.get('misra-c:13.2').decidable, false);
  assert.equal(byKey.get('misra-c:15.1').decidable, true);
});

for (const [id, c] of Object.entries(CASES)) {
  const key = `misra-c:${id}`;
  test(`${key} reports the non-compliant snippet`, () => {
    const want = markedLine(c.bad);
    const got = run(c.bad, key);
    assert.ok(got.some((f) => f.file === want.file && f.line === want.line),
      `expected ${key} at ${want.file}:${want.line}, got ${JSON.stringify(got.map((f) => `${f.file}:${f.line}`))}`);
    for (const f of got) {
      assert.ok(f.message && f.message.en && f.message.ko, 'message has en and ko');
      assert.ok(/[가-힣]/.test(f.message.ko), 'Korean message');
    }
  });
  test(`${key} accepts the compliant snippet`, () => {
    const got = run(c.good, key);
    assert.deepEqual(got.map((f) => `${f.file}:${f.line} ${f.message.en}`), []);
  });
}

test('part B rules analyse a large unit quickly', () => {
  const body = [];
  for (let i = 0; i < 1500; i++) {
    body.push(`static int fn${i}(int a, int *r) {
  int s = 0;
  for (int k = 0; k < 4; k++) {
    if ((a > k) && (r != 0)) {
      s += k;
    } else {
      s -= 1;
    }
  }
  switch (a) {
    case 0:
      s = 1;
      break;
    default:
      break;
  }
  return s;
}`);
  }
  const text = body.join('\n');
  const t0 = Date.now();
  const warnings = [];
  engine.analyze([{ path: 'big.c', text, lang: 'c' }], { warnings });
  const ms = Date.now() - t0;
  assert.deepEqual(warnings.filter((w) => ours(w.rule)), []);
  assert.ok(ms < 20000, `took ${ms} ms`);
});
