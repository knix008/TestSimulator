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
  // ---- pre.js
  {
    key: "cert:PRE30-C",
    bad: `#define assign(uc1, uc2, val) uc1##uc2 = val
void f(void) { int \\u0401 = 0; assign(\\u04, 01, 4); }`,
    good: `#define assign(uc1, uc2, val) uc1##uc2 = val
void f(void) { int ab = 0; assign(a, b, 4); }`,
  },
  {
    key: "cert:PRE31-C",
    bad: `#define ABS(x) (((x) < 0) ? -(x) : (x))
int f(int n) { return ABS(n++); }`,
    good: `#define ABS(x) (((x) < 0) ? -(x) : (x))
#define TWICE(x) ((x) * 2)
int f(int n) { int m = ABS(n); n++; return m + TWICE(n++); }`,
  },
  {
    key: "cert:PRE31-C",
    bad: `#include <assert.h>
void f(int i) { assert(i++ > 0); }`,
    good: `#include <assert.h>
void f(int i) { assert(i > 0); i++; }`,
  },
  {
    key: "cert:PRE32-C",
    bad: `#define CALL(a, b) ((a) + (b))
int g(int q) { return CALL(1,
#ifdef X
  q
#else
  2
#endif
  ); }`,
    good: `#define CALL(a, b) ((a) + (b))
int g(int q) {
#ifdef X
  return CALL(1, q);
#else
  return CALL(1, 2);
#endif
}`,
  },
  {
    key: "cert:PRE00-C",
    bad: `#define CUBE(x) ((x) * (x) * (x))
int f(int a) { return CUBE(a); }`,
    good: `#define STR(x) #x
#define FIELD(s, m) ((s).m)
#define SWAP(a, b) do { int t = a; a = b; b = t; } while (0)
static inline int cube(int x) { return x * x * x; }`,
  },
  {
    key: "cert:PRE01-C",
    bad: `#define CUBE(x) (x * x * x)
int f(int a) { return CUBE(a + 1); }`,
    good: `#define CUBE(x) ((x) * (x) * (x))
#define CALLF(f, a) f(a, 1)
#define FIELD(s) ((s).len)
#define DECL(T, n) T n
int f(int a) { return CUBE(a + 1); }`,
  },
  {
    key: "cert:PRE02-C",
    bad: `#define SUM 1 + 2
#define DIFF(a, b) (a) - (b)
int f(void) { return SUM * DIFF(3, 4); }`,
    good: `#define SUM (1 + 2)
#define DIFF(a, b) ((a) - (b))
#define PTR_T int *
#define NEG -1
#define CALLX(a) f2((a), 2)
int f(void) { return SUM * DIFF(3, 4) * NEG; }`,
  },
  // ---- dcl.js
  {
    key: "cert:DCL30-C",
    bad: `int *f(void) { int x = 1; return &x; }`,
    good: `int *f(void) { static int x = 1; return &x; }
int g(int *p) { int x = *p; int *q = &x; return *q; }`,
  },
  {
    key: "cert:DCL30-C",
    bad: `const char *p;
void dont_do_this(void) { const char c_str[] = "This will change"; p = c_str; }
char *g(void) { char buf[16]; return buf; }`,
    good: `const char *p;
void ok(void) { static const char c_str[] = "Everything OK"; p = c_str; }
char *g(char *buf) { return buf; }`,
  },
  {
    key: "cert:DCL30-C",
    bad: `void squirrel(int **out) { int local = 5; *out = &local; }`,
    good: `void squirrel(int **out) { static int keep = 5; int local = 1; int *tmp = &local; *out = &keep; (void)tmp; }`,
  },
  {
    key: "cert:DCL31-C",
    bad: `extern foo;
int f(void) { return bar(3); }`,
    good: `extern int foo;
int bar(int);
int f(void) { return bar(3); }`,
  },
  {
    key: "cert:DCL36-C",
    bad: `int i1 = 10;
static int i1;`,
    good: `static int i1 = 10;
static int i1;
int i2;
extern int i2;`,
  },
  {
    key: "cert:DCL37-C",
    bad: `#ifndef _MY_HEADER_H_
#define _MY_HEADER_H_
static const unsigned int _max_limit = 1024;
int __count;
void *malloc(unsigned long n);
#endif`,
    good: `#ifndef MY_HEADER_H
#define MY_HEADER_H
static const unsigned int max_limit = 1024;
void f(int _x) { int local_ = _x; (void)local_; }
#endif`,
  },
  {
    key: "cert:DCL38-C",
    bad: `struct flex { int num; int data[1]; };`,
    good: `struct flex { int num; int data[]; };
struct pair { int a[1]; int b; };`,
  },
  {
    key: "cert:DCL39-C",
    bad: `#include <stddef.h>
struct test { int a; char b; int c; };
extern int copy_to_user(void *dest, void *src, size_t size);
void do_stuff(void *usr_buf) { struct test arg = { .a = 1, .b = 2, .c = 3 }; copy_to_user(usr_buf, &arg, sizeof(arg)); }`,
    good: `#include <stddef.h>
struct test { int a; char b; char pad[3]; int c; };
extern int copy_to_user(void *dest, void *src, size_t size);
void do_stuff(void *usr_buf) { struct test arg = { 1, 2, {0}, 3 }; copy_to_user(usr_buf, &arg, sizeof(arg)); }`,
  },
  {
    key: "cert:DCL40-C",
    bad: [
      { path: "a.c", lang: "c", text: `extern int i;
int f(void) { return i; }` },
      { path: "b.c", lang: "c", text: `short i = 0;` },
    ],
    good: [
      { path: "a.c", lang: "c", text: `extern int i;
int f(void) { return i; }` },
      { path: "b.c", lang: "c", text: `int i = 0;` },
    ],
  },
  {
    key: "cert:DCL41-C",
    bad: `int f(int expr) { switch (expr) { int i = 4; case 0: i = 17; return i; default: return 0; } }`,
    good: `int f(int expr) { int i = 4; switch (expr) { case 0: i = 17; return i; default: return 0; } }`,
  },
  {
    key: "cert:DCL00-C",
    bad: `int area(int w) { int scale = 4; return w * scale; }`,
    good: `int area(int w) { const int scale = 4; int acc = 0; acc += w * scale; int k = 1; k++; int m = 2; int *pm = &m; return acc + k + *pm; }`,
  },
  {
    key: "cert:DCL31-C",
    bad: `static count = 3;
int get(void) { return count; }`,
    good: `#include "gtk_missing.h"
G_BEGIN_DECLS
void begin_job(int *p);
void run(int *p) { if (p) { UNKNOWN_MACRO(p) } else { begin_job(p); } begin_job(p); }
G_END_DECLS`,
  },
  {
    key: "cert:DCL30-C", lang: "cpp",
    bad: `char *f(void) { char buf[16] = "x"; return buf; }`,
    good: `#include <string>
#include <cstdio>
std::string f(unsigned s) { char buf[16]; std::snprintf(buf, sizeof buf, "%u", s); return buf; }
struct Gui { int x; };
Gui *g_gui;
int main() { Gui gui{}; g_gui = &gui; return g_gui->x; }`,
  },
  {
    key: "cert:DCL40-C",
    bad: [
      { path: "a.c", lang: "c", text: `int counter;
int get(void) { return counter; }` },
      { path: "b.c", lang: "c", text: `extern long counter;
long get2(void) { return counter; }` },
    ],
    good: [
      { path: "lib.h", lang: "cpp", text: `#pragma once
class Lib { public: Lib(); Lib(const Lib &) = delete; void load(int); void load(const char *); };` },
      { path: "a.cpp", lang: "cpp", text: `#include "lib.h"
Lib::Lib() {}
void Lib::load(int) {}
void Lib::load(const char *) {}` },
      { path: "b.cpp", lang: "cpp", text: `#include "missing/engine.h"
namespace k { bool Engine::start(int x) { return x > 0; } }` },
      { path: "c.cpp", lang: "cpp", text: `#include "missing/listener.h"
namespace k { bool Listener::start(const char *m, int x) { return m && x; } }` },
    ],
  },
  // ---- exp.js
  {
    key: "cert:EXP30-C",
    bad: `void f(int i, int *a) { i = i++ + 1; a[i] = i++; }`,
    good: `void f(int i, int *a) { i = i + 1; a[i] = i; i++; int j = i++ && i; (void)j; }`,
  },
  {
    key: "cert:EXP30-C",
    bad: `int g(int, int);
int f(int i) { return g(i++, i); }`,
    good: `int g(int, int);
int f(int i) { int a = i++; return g(a, i); }`,
  },
  {
    key: "cert:EXP30-C",
    bad: `struct n { struct n *next; };
void f(struct n *p, struct n *q) { p->next = p = q; }`,
    good: `struct n { struct n *next; };
void f(struct n *p, struct n *q, int *s, int *d) { p->next = q; p = q; *d++ = *s++; }`,
  },
  {
    key: "cert:EXP32-C",
    bad: `void f(void) { static volatile int **ipp; static int *ip; static volatile int i = 0; ipp = &ip; ipp = (int**)&ip; *ipp = &i; int *x = (int *)&i; (void)x; }`,
    good: `void f(void) { static volatile int i = 0; volatile int *p = &i; const volatile int *q = p; (void)q; }`,
  },
  {
    key: "cert:EXP33-C",
    bad: `int f(int n) { int sum; sum += n; return sum; }`,
    good: `int f(int n) { int sum; sum = 0; sum += n; return sum; }`,
  },
  {
    key: "cert:EXP33-C",
    bad: `int f(void) { int x; int y = x + 1; return y; }`,
    good: `#include <stdio.h>
#include <stdarg.h>
int f(int n, ...) { int x; va_list ap; va_start(ap, n); va_end(ap); if (scanf("%d", &x) != 1) return 0; return x; }
int g(int c) { int r; if (c) r = 1; else r = 2; return r; }`,
  },
  {
    key: "cert:EXP34-C",
    bad: `#include <stdlib.h>
#include <string.h>
void f(size_t n) { int *p = malloc(n * sizeof *p); p[0] = 1; char *s = malloc(10); strcpy(s, "x"); }`,
    good: `#include <stdlib.h>
#include <string.h>
void f(void) { int *p = malloc(sizeof *p); if (p == NULL) return; p[0] = 1; char *s = malloc(10); if (!s) { free(p); return; } strcpy(s, "x"); }`,
  },
  {
    key: "cert:EXP34-C",
    bad: `struct s { int v; };
int f(struct s *p) { if (p == 0) { return p->v; } return 0; }`,
    good: `struct s { int v; };
int f(struct s *p) { if (p == 0) { return 0; } return p->v; }
int g(struct s *p) { if (p != 0) { return p->v; } return -1; }`,
  },
  {
    key: "cert:EXP35-C",
    bad: `struct X { char a[8]; };
struct X salutation(void);
void f(void) { salutation().a[0] = 'h'; char *p = salutation().a; (void)p; }`,
    good: `struct X { char a[8]; };
struct X salutation(void);
void f(void) { struct X r = salutation(); r.a[0] = 'h'; char c = salutation().a[0]; (void)c; }`,
  },
  {
    key: "cert:EXP36-C",
    bad: `int f(char *c) { int *ip = (int *)c; return *ip; }`,
    good: `#include <string.h>
int f(char *c) { int i; memcpy(&i, c, sizeof i); char *b = (char *)&i; void *v = c; int *ok = (int *)v; return i + *b + *ok; }`,
  },
  {
    key: "cert:EXP37-C",
    bad: `int g(int a, int b);
int h();
int f(void) { return g(1) + h(1, 2); }`,
    good: `int g(int a, int b);
int h(void);
int k();
int k(int a) { return a; }
int f(void) { return g(1, 2) + h() + k(3); }`,
  },
  {
    key: "cert:EXP39-C",
    bad: `float f(int i) { return *(float *)&i; }
long g(double d) { long *p = (long *)&d; return *p; }`,
    good: `#include <string.h>
float f(int i) { float r; memcpy(&r, &i, sizeof r); unsigned char *b = (unsigned char *)&i; unsigned u = *(unsigned *)&i; return r + *b + u; }`,
  },
  {
    key: "cert:EXP40-C",
    bad: `const int vals[3] = { 3, 4, 5 };
void f(void) { int *p = (int *)vals; p[0] = 1; const int c = 2; *(int *)&c = 3; }`,
    good: `int vals[3] = { 3, 4, 5 };
void f(const int *in) { int *p = (int *)vals; p[0] = 1; const int c = 2; int x = *(int *)&c; (void)x; (void)in; }`,
  },
  {
    key: "cert:EXP42-C",
    bad: `#include <string.h>
struct s { char c; int i; };
int eq(const struct s *a, const struct s *b) { return memcmp(a, b, sizeof *a) == 0; }`,
    good: `#include <string.h>
struct s { int c; int i; };
struct t { char c; int i; };
int eq(const struct s *a, const struct s *b, const struct t *x, const struct t *y) { return memcmp(a, b, sizeof *a) == 0 && x->c == y->c && x->i == y->i; }`,
  },
  {
    key: "cert:EXP43-C",
    bad: `#include <string.h>
#include <stdio.h>
void f(char *p, int n) { memcpy(p, p + 4, 4); char buf[32]; sprintf(buf, "%s%d", buf, n); }`,
    good: `#include <string.h>
#include <stdio.h>
void f(char *p, char *q, int n) { memmove(p, p + 4, 4); memcpy(p, q, 4); char buf[32]; sprintf(buf, "%s%d", q, n); }`,
  },
  {
    key: "cert:EXP44-C",
    bad: `#include <stddef.h>
void f(void) { int a = 14; size_t b = sizeof(a++); (void)b; }`,
    good: `#include <stddef.h>
int g(void);
void f(void) { int a = 14; size_t b = sizeof(a); a++; size_t c = sizeof(g()); (void)b; (void)c; }`,
  },
  {
    key: "cert:EXP45-C",
    bad: `int f(int x, int y) { if (x = y) return 1; while (x = y - 1) y--; return 0; }`,
    good: `int g(void);
int f(int x, int y) { if ((x = y) != 0) return 1; if ((x = y)) return 2; int c; while ((c = g()) != -1) {} return x == y; }`,
  },
  {
    key: "cert:EXP46-C",
    bad: `int f(int a, int b) { if (a == 1 & b == 2) return 1; return (a < b) | (b > 3); }`,
    good: `int f(int a, int b) { if (a == 1 && b == 2) return 1; return (a & 4) | (b & 1); }`,
  },
  {
    key: "cert:EXP47-C",
    bad: `#include <stdarg.h>
int f(int n, ...) { va_list ap; va_start(ap, n); char c = va_arg(ap, char); float x = va_arg(ap, float); va_end(ap); return c + (int)x; }`,
    good: `#include <stdarg.h>
int f(int n, ...) { va_list ap; va_start(ap, n); int c = va_arg(ap, int); double x = va_arg(ap, double); va_end(ap); return c + (int)x; }`,
  },
  // ---- int.js
  {
    key: "cert:INT30-C",
    bad: `#include <limits.h>
unsigned f(void) { return UINT_MAX + 1u; }`,
    good: `#include <limits.h>
unsigned f(void) { unsigned m = -1u; return UINT_MAX - 1u + m; }`,
  },
  {
    key: "cert:INT30-C",
    bad: `#include <stdlib.h>
int *f(size_t n) { return malloc(n * sizeof(int)); }`,
    good: `#include <stdlib.h>
#include <stdint.h>
int *f(size_t n) { if (n > SIZE_MAX / sizeof(int)) return NULL; return malloc(n * sizeof(int)); }
int *g(void) { return malloc(16 * sizeof(int)); }`,
  },
  {
    key: "cert:INT31-C",
    bad: `#include <string.h>
void f(char *p) { unsigned char c = 300; memset(p, 0, -1); (void)c; }`,
    good: `#include <string.h>
void f(char *p) { unsigned char c = 255; unsigned all = -1; memset(p, 0, 4); (void)c; (void)all; }`,
  },
  {
    key: "cert:INT31-C",
    bad: `int f(unsigned u) { return u > -1; }`,
    good: `int f(unsigned u, int i) { return u > 1 && i > -1; }`,
  },
  {
    key: "cert:INT32-C",
    bad: `#include <limits.h>
int f(void) { return INT_MAX + 1; }
int g(void) { return -INT_MIN; }`,
    good: `#include <limits.h>
int f(void) { return INT_MAX - 1; }
long g(void) { return -(long)INT_MIN; }`,
  },
  {
    key: "cert:INT32-C",
    bad: `#include <stdlib.h>
#include <limits.h>
int f(void) { return abs(INT_MIN); }`,
    good: `#include <stdlib.h>
#include <limits.h>
int f(void) { return abs(INT_MIN + 1); }`,
  },
  {
    key: "cert:INT33-C",
    bad: `int f(int a) { return a / 0; }
int g(int a, int b) { return a % b; }`,
    good: `int f(int a) { return a / 2; }
int g(int a, int b) { if (b == 0) return 0; return a % b; }
int h(int a, int b) { return b != 0 ? a / b : 0; }
double d(double a, double b) { return a / b; }`,
  },
  {
    key: "cert:INT34-C",
    bad: `unsigned f(unsigned x) { return x << 32; }
int g(int x) { return x >> -1; }
int h(void) { return -1 << 2; }`,
    good: `unsigned f(unsigned x) { return x << 31; }
unsigned long g(unsigned long x) { return x << 40; }`,
  },
  {
    key: "cert:INT35-C",
    bad: `#include <limits.h>
unsigned f(unsigned x, unsigned e) { if (e >= sizeof(unsigned) * CHAR_BIT) return 0; return x << e; }`,
    good: `#include <limits.h>
char buf[sizeof(unsigned) * CHAR_BIT + 1];
unsigned f(unsigned x, unsigned e) { if (e >= 32) return 0; return x << e; }`,
  },
  {
    key: "cert:INT36-C",
    bad: `void f(void *p) { int i = (int)p; unsigned int *ptr = 0xdeadbeef; (void)i; (void)ptr; }`,
    good: `#include <stdint.h>
void f(void *p) { uintptr_t i = (uintptr_t)p; unsigned int *ptr = (unsigned int *)0xdeadbeef; int *n = 0; (void)i; (void)ptr; (void)n; }`,
  },
  {
    key: "cert:INT07-C",
    bad: `int f(void) { char c = 200; int i = 1000; return i / c; }`,
    good: `int f(void) { unsigned char c = 200; char z = 'a'; char t = 0; int i = 1000; return i / c + z + t; }`,
  },
  {
    key: "cert:INT33-C",
    bad: `int f(int a) { return a / 0; }`,
    good: `#include "missing/ec.h"
int f(unsigned long num, EC_POINT *pre) { return num >= ((unsigned long)-1) / sizeof(pre[0]); }`,
  },
  {
    key: "cert:INT34-C",
    bad: `int f(int a) { return a << 40; }`,
    good: `#include "missing/stdint_like.h"
int big(unsigned long long n) { return n > (UINT64_C(1) << 61); }`,
  },
  {
    key: "cert:INT36-C",
    bad: `char *f(long v) { char *p = v; return p; }`,
    good: `#include "missing/pixbuf.h"
void f(void *img, int j, int stride) { unsigned char *dst = get_pixels(img) + j * stride; dst[0] = 0; }`,
  },
  // ---- flp.js
  {
    key: "cert:FLP30-C",
    bad: `void g(float);
void f(void) { for (float x = 0.1f; x <= 1.0f; x += 0.1f) g(x); }`,
    good: `void g(float);
void f(void) { for (int i = 1; i <= 10; i++) g(i / 10.0f); }`,
  },
  {
    key: "cert:FLP32-C",
    bad: `#include <math.h>
double f(double x) { return sqrt(x) + log(0.0) + acos(2.0); }`,
    good: `#include <math.h>
double f(double x) { if (x < 0.0) return 0.0; return sqrt(x) + log(1.0) + acos(0.5) + sqrt(fabs(x)); }`,
  },
  {
    key: "cert:FLP32-C",
    bad: `#include <math.h>
double f(void) { return pow(0.0, -1.0); }`,
    good: `#include <math.h>
double f(void) { return pow(2.0, -1.0) + pow(-2.0, 3.0); }`,
  },
  {
    key: "cert:FLP34-C",
    bad: `void f(void) { int i = 1e10; short s = (short)70000.0; (void)i; (void)s; }`,
    good: `void f(void) { int i = 1e9; short s = (short)7000.0; (void)i; (void)s; }`,
  },
  {
    key: "cert:FLP36-C",
    bad: `void f(long big) { float approx = big; float c = 16777217; (void)approx; (void)c; }`,
    good: `void f(int i) { double d = i; float c = 16777216; double e = 16777217; (void)d; (void)c; (void)e; }`,
  },
  {
    key: "cert:FLP37-C",
    bad: `#include <string.h>
struct S { int i; float f; };
int eq(const struct S *a, const struct S *b) { return memcmp(a, b, sizeof *a) == 0; }
int eqd(const double *a, const double *b) { return memcmp(a, b, sizeof *a) == 0; }`,
    good: `#include <string.h>
struct S { int i; int f; };
int eq(const struct S *a, const struct S *b) { return memcmp(a, b, sizeof *a) == 0; }`,
  },
  // ---- arr.js
  {
    key: "cert:ARR30-C",
    bad: `int a[4];
int f(void){ return a[4]; }`,
    good: `int a[4];
int f(void){ int *e = &a[4]; (void)e; return a[3]; }`,
  },
  {
    key: "cert:ARR30-C",
    bad: `void f(void){ int a[10]; for (int i = 0; i <= 10; i++) a[i] = 0; }`,
    good: `void f(void){ int a[10]; for (int i = 0; i < 10; i++) a[i] = 0; }`,
  },
  {
    key: "cert:ARR32-C",
    bad: `void f(int n){ int a[n]; a[0] = 1; }`,
    good: `void f(int n){ if (n <= 0 || n > 64) return; int a[n]; a[0] = 1; }`,
  },
  {
    key: "cert:ARR36-C",
    bad: `int a[4], b[4];
long f(void){ return &a[2] - &b[0]; }`,
    good: `int a[4];
long f(void){ return &a[3] - &a[0]; }`,
  },
  {
    key: "cert:ARR37-C",
    bad: `struct P { int x, y; };
int f(struct P *p){ int *q = &p->x; return q[1]; }`,
    good: `int f(int *arr){ int *q = arr; return q[1]; }`,
  },
  {
    key: "cert:ARR38-C",
    bad: `#include <string.h>
void f(void){ char d[8]; char s[16]; memcpy(d, s, 16); }`,
    good: `#include <string.h>
void f(void){ char d[16]; char s[16]; memcpy(d, s, sizeof d); }`,
  },
  {
    key: "cert:ARR38-C",
    bad: `#include <string.h>
void f(char *p){ memset(p, 0, sizeof(p)); }`,
    good: `#include <string.h>
void f(char *p, unsigned n){ memset(p, 0, n); }`,
  },
  {
    key: "cert:ARR39-C",
    bad: `int f(int *p, int n){ return *(p + n * sizeof(int)); }`,
    good: `int f(int *p, int n){ return *(p + n); }`,
  },
  {
    key: "cert:ARR01-C",
    bad: `void clear(int a[16]){ for (unsigned i = 0; i < sizeof(a) / sizeof(a[0]); i++) a[i] = 0; }`,
    good: `void clear(int a[], unsigned n){ int local[16]; for (unsigned i = 0; i < n && i < sizeof(local) / sizeof(local[0]); i++) a[i] = local[i]; }`,
  },
  // ---- str.js
  {
    key: "cert:STR30-C",
    bad: `void f(void){ char *p = "abc"; p[0] = 'x'; }`,
    good: `void f(void){ char p[] = "abc"; p[0] = 'x'; }`,
  },
  {
    key: "cert:STR30-C",
    bad: `#include <string.h>
void f(const char *s){ char *p = "abcdef"; strcpy(p, s); }`,
    good: `#include <string.h>
void f(const char *s){ char p[8] = "abcdef"; strncpy(p, s, sizeof p - 1); }`,
  },
  {
    key: "cert:STR31-C",
    bad: `#include <string.h>
void f(const char *s){ char b[8]; strcpy(b, s); }`,
    good: `#include <string.h>
void f(const char *s){ char b[8]; if (strlen(s) < sizeof b) strcpy(b, s); strcpy(b, "ok"); }`,
  },
  {
    key: "cert:STR31-C",
    bad: `#include <stdio.h>
void f(void){ char b[8]; gets(b); scanf("%s", b); }`,
    good: `#include <stdio.h>
void f(void){ char b[8]; fgets(b, sizeof b, stdin); scanf("%7s", b); }`,
  },
  {
    key: "cert:STR31-C",
    bad: `#include <stdio.h>
void f(const char *n){ char b[8]; sprintf(b, "hi %s", n); }`,
    good: `#include <stdio.h>
void f(int n){ char b[16]; sprintf(b, "%d", n); }`,
  },
  {
    key: "cert:STR31-C",
    bad: `#include <string.h>
void f(void){ char b[4]; strcpy(b, "toolong"); }`,
    good: `#include <string.h>
void f(void){ char b[8]; strcpy(b, "fits"); }`,
  },
  {
    key: "cert:STR32-C",
    bad: `#include <string.h>
#include <stdio.h>
void f(const char *s){ char d[8]; strncpy(d, s, sizeof d); puts(d); }`,
    good: `#include <string.h>
void f(const char *s){ char d[8]; strncpy(d, s, sizeof d); d[sizeof d - 1] = '\\0'; }`,
  },
  {
    key: "cert:STR34-C",
    bad: `int f(const char *s){ int c = *s; return c; }`,
    good: `int f(const char *s){ int c = (unsigned char)*s; return c; }`,
  },
  {
    key: "cert:STR37-C",
    bad: `#include <ctype.h>
int f(char c){ return isalpha(c); }`,
    good: `#include <ctype.h>
int f(char c){ return isalpha((unsigned char)c); }`,
  },
  {
    key: "cert:STR38-C",
    bad: `#include <string.h>
#include <wchar.h>
size_t f(const wchar_t *w){ return strlen(w); }`,
    good: `#include <string.h>
#include <wchar.h>
size_t f(const wchar_t *w, const char *s){ return wcslen(w) + strlen(s); }`,
  },
  {
    key: "cert:STR11-C",
    bad: `const char s[3] = "abc";`,
    good: `const char s[] = "abc"; const char t[8] = "abc";`,
  },
  {
    key: "cert:STR11-C",
    bad: `const char name[4] = "abcd";`,
    good: `typedef unsigned char uint8_t;
static const uint8_t kKey[16] = "BoringCrypto Key";`,
  },
  // ---- mem.js
  {
    key: "cert:MEM30-C",
    bad: `#include <stdlib.h>
int f(int *p){ free(p); return *p; }`,
    good: `#include <stdlib.h>
int f(int *p){ int v = *p; free(p); p = NULL; return v; }`,
  },
  {
    key: "cert:MEM30-C",
    bad: `#include <stdlib.h>
void f(char *p){ free(p); free(p); }`,
    good: `#include <stdlib.h>
void f(char *p, int c){ if (c) { free(p); return; } free(p); }`,
  },
  {
    key: "cert:MEM31-C",
    bad: `#include <stdlib.h>
#include <string.h>
int f(int n){ char *p = malloc(n); if (!p) return -1; memset(p, 0, n); return 0; }`,
    good: `#include <stdlib.h>
#include <string.h>
int f(int n){ char *p = malloc(n); if (!p) return -1; memset(p, 0, n); free(p); return 0; }
char *g(int n){ char *p = malloc(n); return p; }`,
  },
  {
    key: "cert:MEM33-C",
    bad: `struct flex { int n; int data[]; };
void f(struct flex *a, struct flex *b){ struct flex s; s.n = 0; *a = *b; (void)s; }`,
    good: `#include <stdlib.h>
#include <string.h>
struct flex { int n; int data[]; };
struct flex *f(int n){ struct flex *p = malloc(sizeof(struct flex) + n * sizeof(int)); return p; }`,
  },
  {
    key: "cert:MEM34-C",
    bad: `#include <stdlib.h>
void f(void){ int x; char buf[8]; char *p = buf; free(&x); free(p); free("lit"); }`,
    good: `#include <stdlib.h>
void f(void){ char *p = malloc(8); free(p); }`,
  },
  {
    key: "cert:MEM35-C",
    bad: `#include <stdlib.h>
struct S { long a, b, c; };
struct S *f(void){ struct S *p = malloc(sizeof(p)); return p; }`,
    good: `#include <stdlib.h>
struct S { long a, b, c; };
struct S *f(void){ struct S *p = malloc(sizeof *p); return p; }`,
  },
  {
    key: "cert:MEM35-C",
    bad: `#include <stdlib.h>
#include <string.h>
char *dup(const char *s){ char *d = malloc(strlen(s)); if (d) strcpy(d, s); return d; }`,
    good: `#include <stdlib.h>
#include <string.h>
char *dup(const char *s){ char *d = malloc(strlen(s) + 1); if (d) strcpy(d, s); return d; }
long *g(int n){ long *p = malloc(n * sizeof(long)); return p; }`,
  },
  {
    key: "cert:MEM36-C",
    bad: `#include <stdlib.h>
void *f(void){ int *p = aligned_alloc(64, 256); p = realloc(p, 512); return p; }`,
    good: `#include <stdlib.h>
void *f(void){ int *p = malloc(256); p = realloc(p, 512); return p; }`,
  },
  // ---- fio.js
  {
    key: "cert:FIO30-C",
    bad: `#include <stdio.h>
void f(const char *user){ printf(user); }`,
    good: `#include <stdio.h>
#include <stdarg.h>
static const char FMT[] = "%s\\n";
void f(const char *user){ printf("%s", user); printf(FMT, user); }
void logf2(const char *fmt, ...){ va_list ap; va_start(ap, fmt); vfprintf(stderr, fmt, ap); va_end(ap); }`,
  },
  {
    key: "cert:FIO30-C",
    bad: `#include <stdio.h>
void f(char *buf, const char *msg){ fprintf(stderr, msg); snprintf(buf, 10, msg); }`,
    good: `#include <stdio.h>
void f(char *buf, int e){ const char *fmt = e ? "err %d\\n" : "ok %d\\n"; fprintf(stderr, fmt, e); snprintf(buf, 10, "%d", e); }`,
  },
  {
    key: "cert:FIO32-C",
    bad: `#include <stdio.h>
int main(int argc, char **argv){ FILE *f = fopen(argv[1], "r"); if (f) fclose(f); return 0; }`,
    good: `#include <stdio.h>
int main(void){ FILE *f = fopen("data.txt", "r"); if (f) fclose(f); return 0; }`,
  },
  {
    key: "cert:FIO34-C",
    bad: `#include <stdio.h>
void f(FILE *fp){ char c; while ((c = fgetc(fp)) != EOF) putchar(c); }`,
    good: `#include <stdio.h>
void f(FILE *fp){ int c; while ((c = fgetc(fp)) != EOF) putchar(c); }`,
  },
  {
    key: "cert:FIO37-C",
    bad: `#include <stdio.h>
#include <string.h>
void f(void){ char buf[64]; if (fgets(buf, sizeof buf, stdin)) buf[strlen(buf) - 1] = '\\0'; }`,
    good: `#include <stdio.h>
#include <string.h>
void f(void){ char buf[64]; if (fgets(buf, sizeof buf, stdin)) { char *p = strchr(buf, '\\n'); if (p) *p = '\\0'; } }`,
  },
  {
    key: "cert:FIO38-C",
    bad: `#include <stdio.h>
void f(void){ FILE my = *stdout; (void)my; }`,
    good: `#include <stdio.h>
void f(void){ FILE *my = stdout; (void)my; }`,
  },
  {
    key: "cert:FIO39-C",
    bad: `#include <stdio.h>
void f(FILE *fp, char *b){ fputs("x", fp); fgets(b, 10, fp); }`,
    good: `#include <stdio.h>
void f(FILE *fp, char *b){ fputs("x", fp); fseek(fp, 0L, SEEK_SET); fgets(b, 10, fp); }`,
  },
  {
    key: "cert:FIO40-C",
    bad: `#include <stdio.h>
void f(FILE *fp){ char buf[32]; if (fgets(buf, sizeof buf, fp) == NULL) { } puts(buf); }`,
    good: `#include <stdio.h>
void f(FILE *fp){ char buf[32]; if (fgets(buf, sizeof buf, fp) == NULL) { buf[0] = '\\0'; } puts(buf); }`,
  },
  {
    key: "cert:FIO41-C",
    bad: `#include <stdio.h>
int f(const char *n){ return getc(fopen(n, "r")); }`,
    good: `#include <stdio.h>
int f(FILE *fp){ return getc(fp); }`,
  },
  {
    key: "cert:FIO42-C",
    bad: `#include <stdio.h>
int f(const char *n){ FILE *fp = fopen(n, "r"); if (!fp) return -1; return fgetc(fp); }`,
    good: `#include <stdio.h>
int f(const char *n){ FILE *fp = fopen(n, "r"); if (!fp) return -1; int c = fgetc(fp); fclose(fp); return c; }
FILE *g(const char *n){ FILE *fp = fopen(n, "r"); return fp; }`,
  },
  {
    key: "cert:FIO44-C",
    bad: `#include <stdio.h>
#include <string.h>
void f(FILE *fp){ fpos_t pos; memset(&pos, 0, sizeof pos); fsetpos(fp, &pos); }`,
    good: `#include <stdio.h>
void f(FILE *fp){ fpos_t pos; if (fgetpos(fp, &pos) == 0) fsetpos(fp, &pos); }`,
  },
  {
    key: "cert:FIO45-C",
    bad: `#include <stdio.h>
#include <unistd.h>
FILE *f(const char *path){ if (access(path, W_OK) == 0) return fopen(path, "w"); return NULL; }`,
    good: `#include <stdio.h>
FILE *f(const char *path){ return fopen(path, "wx"); }`,
  },
  {
    key: "cert:FIO46-C",
    bad: `#include <stdio.h>
void f(FILE *fp){ fclose(fp); fputs("x", fp); }`,
    good: `#include <stdio.h>
void f(FILE *fp){ fclose(fp); fp = NULL; }`,
  },
  {
    key: "cert:FIO47-C",
    bad: `#include <stdio.h>
void f(int n){ printf("%d %s\\n", n); }`,
    good: `#include <stdio.h>
void f(int n, const char *s, double d){ printf("%d %s %5.2f %*d %%\\n", n, s, d, 4, n); }`,
  },
  {
    key: "cert:FIO47-C",
    bad: `#include <stdio.h>
void f(int n){ printf("%s\\n", n); printf("%d\\n", 1.5); }`,
    good: `#include <stdio.h>
void f(long n, void *p){ printf("%ld %p %c\\n", n, p, 'x'); }`,
  },
  {
    key: "cert:FIO21-C",
    bad: `#include <stdio.h>
void f(void){ char n[L_tmpnam]; if (tmpnam(n)) { FILE *f = fopen(n, "w"); if (f) fclose(f); } FILE *g = fopen("/tmp/app.log", "w"); if (g) fclose(g); }`,
    good: `#include <stdlib.h>
#include <unistd.h>
void f(void){ char t[] = "/home/me/.app/XXXXXX"; int fd = mkstemp(t); if (fd >= 0) close(fd); }`,
  },
  {
    key: "cert:FIO47-C",
    bad: `#include <stdio.h>
void f(const char *s) { printf("%d\\n", s); }`,
    good: `#include <stdio.h>
#include "sndfile_missing.h"
void f(const char *path) { fprintf(stderr, "open '%s': %s\\n", path, sf_strerror(NULL)); }`,
  },
  // ---- env.js
  {
    key: "cert:ENV30-C",
    bad: `#include <stdlib.h>
void f(void){ char *p = getenv("TZ"); if (p) p[0] = 'X'; }`,
    good: `#include <stdlib.h>
#include <string.h>
void f(void){ const char *p = getenv("TZ"); char *q = p ? strdup(p) : NULL; if (q) { q[0] = 'X'; free(q); } }`,
  },
  {
    key: "cert:ENV31-C",
    bad: `#include <stdlib.h>
#include <stdio.h>
int main(int argc, char *argv[], char *envp[]){ setenv("A", "1", 1); puts(envp[0]); return 0; }`,
    good: `#include <stdlib.h>
#include <stdio.h>
extern char **environ;
int main(int argc, char *argv[], char *envp[]){ puts(envp[0]); setenv("A", "1", 1); puts(environ[0]); return 0; }`,
  },
  {
    key: "cert:ENV32-C",
    bad: `#include <stdlib.h>
static void bye(void){ exit(1); }
int main(void){ atexit(bye); return 0; }`,
    good: `#include <stdlib.h>
#include <stdio.h>
static void bye(void){ fflush(stdout); }
int main(void){ atexit(bye); return 0; }`,
  },
  {
    key: "cert:ENV33-C",
    bad: `#include <stdlib.h>
void f(const char *cmd){ system(cmd); }`,
    good: `#include <stdlib.h>
int f(void){ return system(NULL); }`,
  },
  {
    key: "cert:ENV33-C",
    bad: `#include <stdio.h>
void f(void){ FILE *p = popen("ls", "r"); if (p) pclose(p); }`,
    good: `#include <unistd.h>
void f(char *const argv[]){ execv("/bin/ls", argv); }`,
  },
  {
    key: "cert:ENV34-C",
    bad: `#include <stdlib.h>
#include <string.h>
int f(void){ const char *a = getenv("A"); const char *b = getenv("B"); return strcmp(a, b); }`,
    good: `#include <stdlib.h>
#include <string.h>
int f(void){ char *a = strdup(getenv("A")); const char *b = getenv("B"); int r = strcmp(a, b); free(a); return r; }`,
  },
  // ---- sig.js
  {
    key: "cert:SIG30-C",
    bad: `#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
static void log_it(const char *m) { fprintf(stderr, "%s\\n", m); }
void handler(int s) { log_it("caught"); free(0); }
int main(void) { signal(SIGINT, handler); return 0; }`,
    good: `#include <signal.h>
#include <unistd.h>
volatile sig_atomic_t got;
void handler(int s) { got = 1; write(2, "x", 1); signal(s, handler); }
int main(void) { signal(SIGINT, handler); while (!got) {} return 0; }`,
  },
  {
    key: "cert:SIG30-C",
    bad: [
      { path: "main.c", lang: "c", text: `#include <signal.h>
void on_term(int);
int main(void) { struct sigaction sa; sa.sa_handler = on_term; sigaction(SIGTERM, &sa, 0); return 0; }` },
      { path: "h.c", lang: "c", text: `#include <stdio.h>
void on_term(int s) { printf("bye\\n"); }` },
    ],
    good: [
      { path: "main.c", lang: "c", text: `#include <signal.h>
void on_term(int);
int main(void) { struct sigaction sa; sa.sa_handler = on_term; sigaction(SIGTERM, &sa, 0); return 0; }` },
      { path: "h.c", lang: "c", text: `#include <stdlib.h>
void on_term(int s) { _Exit(1); }` },
    ],
  },
  {
    key: "cert:SIG30-C", lang: "cpp",
    bad: `#include <csignal>
#include <cstdio>
extern "C" void handler(int) { std::printf("x"); }
int main() { struct sigaction sa; sa.sa_handler = handler; sigaction(SIGINT, &sa, nullptr); }`,
    good: `#include <csignal>
volatile std::sig_atomic_t f;
extern "C" void handler(int) { f = 1; }
int main() { struct sigaction sa; sa.sa_handler = handler; sigaction(SIGINT, &sa, nullptr); }`,
  },
  {
    key: "cert:SIG31-C",
    bad: `#include <signal.h>
#include <string.h>
char *err_msg;
int count;
void handler(int s) { count++; err_msg = 0; }
int main(void) { signal(SIGINT, handler); return 0; }`,
    good: `#include <signal.h>
#include <stdatomic.h>
volatile sig_atomic_t e_flag;
atomic_int counter;
const int limit = 3;
void handler(int s) { e_flag = 1; counter = limit; }
int main(void) { signal(SIGINT, handler); return 0; }`,
  },
  {
    key: "cert:SIG34-C",
    bad: `#include <signal.h>
volatile sig_atomic_t f;
void handler(int s) { signal(s, handler); f = 1; }
int main(void) { signal(SIGUSR1, handler); return 0; }`,
    good: `#include <signal.h>
volatile sig_atomic_t f;
void handler(int s) { signal(s, SIG_DFL); f = 1; }
int main(void) { signal(SIGUSR1, handler); return 0; }`,
  },
  {
    key: "cert:SIG35-C",
    bad: `#include <signal.h>
volatile sig_atomic_t denom;
void sighandle(int s) { if (denom == 0) denom = 1; }
int main(void) { signal(SIGFPE, sighandle); return 0; }`,
    good: `#include <signal.h>
#include <stdlib.h>
void sighandle(int s) { _Exit(1); }
volatile sig_atomic_t f;
void other(int s) { f = 1; }
int main(void) { signal(SIGFPE, sighandle); signal(SIGINT, other); return 0; }`,
  },
  // ---- err.js
  {
    key: "cert:ERR30-C",
    bad: `#include <errno.h>
#include <limits.h>
#include <stdlib.h>
long parse(const char *buf) {
  char *end;
  long v = strtol(buf, &end, 10);
  if (v == LONG_MAX && errno == ERANGE) return 0;
  return v;
}`,
    good: `#include <errno.h>
#include <limits.h>
#include <stdlib.h>
long parse(const char *buf) {
  char *end;
  errno = 0;
  long v = strtol(buf, &end, 10);
  if (end == buf || errno == ERANGE) return 0;
  return v;
}`,
  },
  {
    key: "cert:ERR30-C",
    bad: `#include <errno.h>
#include <locale.h>
#include <stdio.h>
void f(void) {
  errno = 0;
  setlocale(LC_ALL, "");
  if (errno != 0) perror("setlocale");
}`,
    good: `#include <errno.h>
#include <locale.h>
#include <stdio.h>
void f(void) {
  if (setlocale(LC_ALL, "") == NULL) puts("setlocale failed");
}`,
  },
  {
    key: "cert:ERR30-C",
    bad: `#include <errno.h>
#include <stdio.h>
void f(const char *n) {
  FILE *fp = fopen(n, "r");
  if (errno != 0) { perror("fopen"); return; }
  fclose(fp);
}`,
    good: `#include <errno.h>
#include <stdio.h>
void f(const char *n) {
  FILE *fp = fopen(n, "r");
  if (fp == NULL) { if (errno != 0) perror("fopen"); return; }
  fclose(fp);
}`,
  },
  {
    key: "cert:ERR32-C",
    bad: `#include <signal.h>
#include <stdio.h>
#include <errno.h>
void handler(int s) {
  if (signal(s, handler) == SIG_ERR) { perror("signal"); }
}
int main(void) { if (signal(SIGINT, handler) == SIG_ERR) return 1; return 0; }`,
    good: `#include <signal.h>
#include <stdio.h>
#include <errno.h>
#include <stdlib.h>
void handler(int s) {
  if (signal(s, handler) == SIG_ERR) _Exit(1);
}
int main(void) { if (signal(SIGINT, handler) == SIG_ERR) { perror("signal"); return 1; } return 0; }`,
  },
  {
    key: "cert:ERR33-C",
    bad: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
void f(size_t n) {
  char buf[64];
  char *p = malloc(n);
  memset(p, 0, n);
  fgets(buf, sizeof buf, stdin);
  int x;
  scanf("%d", &x);
}`,
    good: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
int f(size_t n) {
  char buf[64];
  char *p = malloc(n);
  if (p == NULL) return -1;
  memset(p, 0, n);
  if (fgets(buf, sizeof buf, stdin) == NULL) { free(p); return -1; }
  int x;
  if (scanf("%d", &x) != 1) { free(p); return -1; }
  (void)remove("tmp.txt");
  free(p);
  return x;
}`,
  },
  {
    key: "cert:ERR33-C", lang: "cpp",
    bad: `#include <cstdio>
void f() { std::FILE *fp = std::fopen("a", "r"); std::fclose(fp); }`,
    good: `#include <cstdio>
void f() { std::FILE *fp = std::fopen("a", "r"); if (!fp) return; std::fclose(fp); }`,
  },
  {
    key: "cert:ERR34-C",
    bad: `#include <stdlib.h>
#include <stdio.h>
int f(const char *s) { int a = atoi(s); long b; sscanf(s, "%ld", &b); return a + (int)b; }`,
    good: `#include <stdlib.h>
#include <errno.h>
long f(const char *s) { char *end; errno = 0; long v = strtol(s, &end, 10); if (end == s || errno == ERANGE) return 0; return v; }`,
  },
  // ---- con.js
  {
    key: "cert:CON30-C",
    bad: `#include <threads.h>
#include <stdlib.h>
tss_t key;
int worker(void *a) { tss_set(key, malloc(16)); return 0; }
int main(void) { if (tss_create(&key, NULL) != thrd_success) return 1; thrd_t t; thrd_create(&t, worker, NULL); thrd_join(t, NULL); return 0; }`,
    good: `#include <threads.h>
#include <stdlib.h>
tss_t key;
int worker(void *a) { tss_set(key, malloc(16)); return 0; }
int main(void) { if (tss_create(&key, free) != thrd_success) return 1; thrd_t t; thrd_create(&t, worker, NULL); thrd_join(t, NULL); tss_delete(key); return 0; }`,
  },
  {
    key: "cert:CON30-C",
    bad: `#include <threads.h>
#include <stdlib.h>
tss_t key;
int worker(void *a) { tss_set(key, malloc(16)); return 0; }
int main(void) { tss_create(&key, NULL); thrd_t t; thrd_create(&t, worker, NULL); thrd_join(t, NULL); tss_delete(key); return 0; }`,
    good: `#include <threads.h>
#include <stdlib.h>
tss_t key;
int worker(void *a) { tss_set(key, malloc(16)); free(tss_get(key)); return 0; }
int main(void) { tss_create(&key, NULL); thrd_t t; thrd_create(&t, worker, NULL); thrd_join(t, NULL); tss_delete(key); return 0; }`,
  },
  {
    key: "cert:CON31-C",
    bad: `#include <threads.h>
#include <stdlib.h>
mtx_t lock;
int worker(void *a) { mtx_lock(&lock); mtx_unlock(&lock); return 0; }
int main(void) {
  thrd_t t;
  mtx_init(&lock, mtx_plain);
  thrd_create(&t, worker, NULL);
  mtx_destroy(&lock);
  thrd_join(t, NULL);
  return 0;
}`,
    good: `#include <threads.h>
#include <stdlib.h>
mtx_t lock;
int worker(void *a) { mtx_lock(&lock); mtx_unlock(&lock); return 0; }
int main(void) {
  thrd_t t;
  mtx_init(&lock, mtx_plain);
  thrd_create(&t, worker, NULL);
  thrd_join(t, NULL);
  mtx_destroy(&lock);
  return 0;
}`,
  },
  {
    key: "cert:CON31-C",
    bad: `#include <threads.h>
#include <stdlib.h>
mtx_t m;
void f(void) { mtx_lock(&m); mtx_destroy(&m); }`,
    good: `#include <threads.h>
#include <stdlib.h>
mtx_t m;
void f(void) { mtx_lock(&m); mtx_unlock(&m); mtx_destroy(&m); }`,
  },
  {
    key: "cert:CON32-C",
    bad: `#include <threads.h>
#include <stdlib.h>
struct multi { unsigned int flag1 : 2; unsigned int flag2 : 2; } flags;
int t1(void *a) { flags.flag1 = 1; return 0; }
int t2(void *a) { flags.flag2 = 2; return 0; }
int main(void) { thrd_t a, b; thrd_create(&a, t1, NULL); thrd_create(&b, t2, NULL); thrd_join(a, NULL); thrd_join(b, NULL); return 0; }`,
    good: `#include <threads.h>
#include <stdlib.h>
struct multi { unsigned int flag1 : 2; unsigned int flag2 : 2; } flags;
mtx_t m;
int t1(void *a) { mtx_lock(&m); flags.flag1 = 1; mtx_unlock(&m); return 0; }
int t2(void *a) { mtx_lock(&m); flags.flag2 = 2; mtx_unlock(&m); return 0; }
int main(void) { thrd_t a, b; thrd_create(&a, t1, NULL); thrd_create(&b, t2, NULL); thrd_join(a, NULL); thrd_join(b, NULL); return 0; }`,
  },
  {
    key: "cert:CON33-C",
    bad: `#include <threads.h>
#include <stdlib.h>
#include <string.h>
int worker(void *a) { char *tok = strtok((char *)a, " "); return tok != 0; }
int main(void) { thrd_t t; char s[] = "a b"; thrd_create(&t, worker, s); thrd_join(t, NULL); return 0; }`,
    good: `#include <string.h>
int main(void) { char s[] = "a b"; char *tok = strtok(s, " "); return tok != 0; }`,
  },
  {
    key: "cert:CON34-C",
    bad: `#include <threads.h>
#include <stdlib.h>
int child(void *v) { int *p = v; return *p; }
void create(thrd_t *tid) { int val = 1; thrd_create(tid, child, &val); }`,
    good: `#include <threads.h>
#include <stdlib.h>
int child(void *v) { int *p = v; return *p; }
int run(void) { thrd_t tid; int val = 1; int res; if (thrd_create(&tid, child, &val) != thrd_success) return -1; thrd_join(tid, &res); return res; }`,
  },
  {
    key: "cert:CON35-C",
    bad: `#include <threads.h>
#include <stdlib.h>
mtx_t a, b;
int x;
void f1(void) { mtx_lock(&a); mtx_lock(&b); x++; mtx_unlock(&b); mtx_unlock(&a); }
void f2(void) { mtx_lock(&b); mtx_lock(&a); x--; mtx_unlock(&a); mtx_unlock(&b); }`,
    good: `#include <threads.h>
#include <stdlib.h>
mtx_t a, b;
int x;
void f1(void) { mtx_lock(&a); mtx_lock(&b); x++; mtx_unlock(&b); mtx_unlock(&a); }
void f2(void) { mtx_lock(&a); mtx_lock(&b); x--; mtx_unlock(&b); mtx_unlock(&a); }`,
  },
  {
    key: "cert:CON35-C",
    bad: `#include <threads.h>
#include <stdlib.h>
typedef struct { int balance; mtx_t m; } account;
void transfer(account *from, account *to, int n) { mtx_lock(&from->m); mtx_lock(&to->m); from->balance -= n; to->balance += n; mtx_unlock(&to->m); mtx_unlock(&from->m); }
account x, y;
void a(void) { transfer(&x, &y, 1); }
void b(void) { transfer(&y, &x, 1); }`,
    good: `#include <threads.h>
#include <stdlib.h>
typedef struct { int balance; mtx_t m; } account;
void transfer(account *from, account *to, int n) { mtx_lock(&from->m); mtx_lock(&to->m); from->balance -= n; to->balance += n; mtx_unlock(&to->m); mtx_unlock(&from->m); }
account x, y;
void a(void) { transfer(&x, &y, 1); }
void b(void) { transfer(&x, &y, 2); }`,
  },
  {
    key: "cert:CON36-C",
    bad: `#include <threads.h>
#include <stdlib.h>
mtx_t m; cnd_t cv; int ready;
void wait_ready(void) { mtx_lock(&m); if (!ready) cnd_wait(&cv, &m); mtx_unlock(&m); }`,
    good: `#include <threads.h>
#include <stdlib.h>
mtx_t m; cnd_t cv; int ready;
void wait_ready(void) { mtx_lock(&m); while (!ready) cnd_wait(&cv, &m); mtx_unlock(&m); }`,
  },
  {
    key: "cert:CON37-C",
    bad: `#include <threads.h>
#include <stdlib.h>
#include <signal.h>
volatile sig_atomic_t f;
void h(int s) { f = 1; }
int w(void *a) { return 0; }
int main(void) { signal(SIGINT, h); thrd_t t; thrd_create(&t, w, NULL); thrd_join(t, NULL); return 0; }`,
    good: `#include <signal.h>
volatile sig_atomic_t f;
void h(int s) { f = 1; }
int main(void) { signal(SIGINT, h); return 0; }`,
  },
  {
    key: "cert:CON38-C",
    bad: `#include <threads.h>
#include <stdlib.h>
mtx_t m; cnd_t cv; int current;
int run_step(void *t) {
  int my = *(int *)t;
  mtx_lock(&m);
  while (current != my) cnd_wait(&cv, &m);
  current++;
  cnd_signal(&cv);
  mtx_unlock(&m);
  return 0;
}`,
    good: `#include <threads.h>
#include <stdlib.h>
mtx_t m; cnd_t cv; int current;
int run_step(void *t) {
  int my = *(int *)t;
  mtx_lock(&m);
  while (current != my) cnd_wait(&cv, &m);
  current++;
  cnd_broadcast(&cv);
  mtx_unlock(&m);
  return 0;
}`,
  },
  {
    key: "cert:CON39-C",
    bad: `#include <threads.h>
#include <stdlib.h>
int w(void *a) { thrd_detach(thrd_current()); return 0; }
int main(void) { thrd_t t; if (thrd_create(&t, w, NULL) != thrd_success) return 1; if (thrd_join(t, 0) != thrd_success) return 1; return 0; }`,
    good: `#include <threads.h>
#include <stdlib.h>
int w(void *a) { return 0; }
int main(void) { thrd_t t; if (thrd_create(&t, w, NULL) != thrd_success) return 1; if (thrd_join(t, 0) != thrd_success) return 1; return 0; }`,
  },
  {
    key: "cert:CON39-C",
    bad: `#include <pthread.h>
void *w(void *a) { return 0; }
int main(void) { pthread_t t; pthread_create(&t, 0, w, 0); pthread_join(t, 0); pthread_detach(t); return 0; }`,
    good: `#include <pthread.h>
void *w(void *a) { return 0; }
int main(int c, char **v) { pthread_t t; pthread_create(&t, 0, w, 0); if (c > 1) pthread_join(t, 0); else pthread_detach(t); return 0; }`,
  },
  {
    key: "cert:CON40-C",
    bad: `#include <stdatomic.h>
#include <stdbool.h>
static atomic_bool flag;
void toggle(void) { flag = !flag; }`,
    good: `#include <stdatomic.h>
#include <stdbool.h>
static atomic_bool flag;
void toggle(void) { bool old = atomic_load(&flag); while (!atomic_compare_exchange_weak(&flag, &old, !old)) {} }`,
  },
  {
    key: "cert:CON40-C", lang: "cpp",
    bad: `#include <atomic>
std::atomic<int> n;
void f() { n = n * 2; }`,
    good: `#include <atomic>
std::atomic<int> n;
void f() { n += 2; }`,
  },
  {
    key: "cert:CON41-C",
    bad: `#include <stdatomic.h>
atomic_int v;
void inc(void) { int old = atomic_load(&v); atomic_compare_exchange_weak(&v, &old, old + 1); }`,
    good: `#include <stdatomic.h>
atomic_int v;
void inc(void) { int old = atomic_load(&v); do { } while (!atomic_compare_exchange_weak(&v, &old, old + 1)); }`,
  },
  {
    key: "cert:CON43-C",
    bad: `#include <threads.h>
#include <stdlib.h>
int counter;
int worker(void *a) { counter++; return 0; }
int main(void) { thrd_t t; thrd_create(&t, worker, NULL); thrd_join(t, NULL); return counter; }`,
    good: `#include <threads.h>
#include <stdlib.h>
int counter; mtx_t m;
int worker(void *a) { mtx_lock(&m); counter++; mtx_unlock(&m); return 0; }
int main(void) { thrd_t t; thrd_create(&t, worker, NULL); thrd_join(t, NULL); return counter; }`,
  },
  // ---- msc.js
  {
    key: "cert:MSC24-C",
    bad: `#include <stdio.h>
#include <stdlib.h>
int f(const char *s, FILE *fp) { rewind(fp); setbuf(fp, NULL); return atoi(s); }`,
    good: `#include <stdio.h>
#include <stdlib.h>
long f(const char *s, FILE *fp) { char *e; if (fseek(fp, 0L, SEEK_SET) != 0) return -1; clearerr(fp); return strtol(s, &e, 10); }`,
  },
  {
    key: "cert:MSC30-C",
    bad: `#include <stdlib.h>
int token(void) { return rand() % 1000; }`,
    good: `#include <stdlib.h>
int token(void) { return (int)(arc4random() % 1000); }`,
  },
  {
    key: "cert:MSC32-C",
    bad: `#include <stdlib.h>
#include <time.h>
void init(void) { srand(time(NULL)); }
int next(void) { return rand(); }`,
    good: `#include <stdlib.h>
#include <time.h>
void init(void) { struct timespec ts; if (timespec_get(&ts, TIME_UTC) == 0) return; srandom(ts.tv_nsec ^ ts.tv_sec); }
long next(void) { return random(); }`,
  },
  {
    key: "cert:MSC32-C",
    bad: `#include <stdlib.h>
long next(void) { return random(); }`,
    good: `#include <stdlib.h>
long next(unsigned s) { srandom(s); return random(); }`,
  },
  {
    key: "cert:MSC32-C",
    bad: `#include <stdlib.h>
long next(void) { srandom(42); return random(); }`,
    good: `#include <stdlib.h>
#include <unistd.h>
long next(void) { unsigned s; if (getentropy(&s, sizeof s) != 0) return 0; srandom(s); return random(); }`,
  },
  {
    key: "cert:MSC33-C",
    bad: `#include <time.h>
char *show(struct tm *t) { return asctime(t); }`,
    good: `#include <time.h>
size_t show(char *buf, size_t n, const struct tm *t) { return strftime(buf, n, "%c", t); }`,
  },
  {
    key: "cert:MSC37-C",
    bad: `int checkpass(const char *p) {
  if (p[0] == 'x') return 1;
}`,
    good: `#include <stdlib.h>
int checkpass(const char *p) {
  if (p[0] == 'x') return 1;
  return 0;
}
int sel(int v) { switch (v) { case 1: return 1; default: return 0; } }
int die(void) { abort(); }
int loop(void) { for (;;) { } }`,
  },
  {
    key: "cert:MSC38-C",
    bad: `#include <assert.h>
typedef void (*handler_t)(int);
void f(handler_t h) { h(1); }
void g(void) { f(assert); }`,
    good: `#include <assert.h>
void g(int x) { assert(x > 0); }`,
  },
  {
    key: "cert:MSC38-C",
    bad: `#include <errno.h>
#undef errno
extern int errno;`,
    good: `#include <errno.h>
int last(void) { return errno; }`,
  },
  {
    key: "cert:MSC39-C",
    bad: `#include <stdarg.h>
#include <stdio.h>
int contains_zero(size_t count, va_list ap) { for (size_t i = 0; i < count; ++i) if (va_arg(ap, double) == 0.0) return 1; return 0; }
int print_reciprocals(size_t count, ...) {
  va_list ap;
  va_start(ap, count);
  if (contains_zero(count, ap)) { va_end(ap); return 1; }
  for (size_t i = 0; i < count; ++i) printf("%f ", 1.0 / va_arg(ap, double));
  va_end(ap);
  return 0;
}`,
    good: `#include <stdarg.h>
#include <stdio.h>
int contains_zero(size_t count, va_list *ap) { va_list ap1; va_copy(ap1, *ap); for (size_t i = 0; i < count; ++i) if (va_arg(ap1, double) == 0.0) { va_end(ap1); return 1; } va_end(ap1); return 0; }
int print_reciprocals(size_t count, ...) {
  va_list ap;
  va_start(ap, count);
  if (contains_zero(count, &ap)) { va_end(ap); return 1; }
  for (size_t i = 0; i < count; ++i) printf("%f ", 1.0 / va_arg(ap, double));
  va_end(ap);
  return 0;
}`,
  },
  {
    key: "cert:MSC40-C",
    bad: `static int I = 12;
extern inline void func(int a) {
  static int b = 0;
  int c = a + I + b;
  (void)c;
}`,
    good: `static int I = 12;
static inline void func(int a) {
  static int b = 0;
  int c = a + I + b;
  (void)c;
}
extern inline int twice(int a) { static const int k = 2; return a * k; }`,
  },
  {
    key: "cert:MSC41-C",
    bad: `#include <string.h>
static const char *db_password = "hunter2!";
int login(const char *password) { return strcmp(password, "s3cr3tPw") == 0; }`,
    good: `#include <string.h>
#include <stdlib.h>
static const char *password_prompt = "Enter password:";
int login(const char *password) { const char *expected = getenv("APP_PASSWORD"); return expected && strcmp(password, expected) == 0; }`,
  },
  {
    key: "cert:MSC41-C", lang: "cpp",
    bad: `#define API_KEY "AKIA1234567890XYZ"
const char *conn = "host=db user=app password=Tr0ub4dor";`,
    good: `#define API_KEY_ENV "APP_API_KEY"
const char *conn = "host=db user=app";`,
  },
  {
    key: "cert:MSC41-C",
    bad: `const char *password = "hunter2xyz";`,
    good: `#define KEY_SAVE_PASS "save_password"
#define PREF_TOKEN "auth.token"
const char *token = "__PW_FD__";`,
  },
  // ---- pos.js
  {
    key: "cert:POS30-C",
    bad: `#include <unistd.h>
#include <stdio.h>
void f(const char *p) { char buf[256]; readlink(p, buf, sizeof(buf)); puts(buf); }`,
    good: `#include <unistd.h>
#include <stdio.h>
void f(const char *p) { char buf[256]; ssize_t len = readlink(p, buf, sizeof(buf) - 1); if (len != -1) { buf[len] = '\\0'; puts(buf); } }`,
  },
  {
    key: "cert:POS30-C",
    bad: `#include <unistd.h>
void f(const char *p) { char buf[256]; ssize_t len = readlink(p, buf, sizeof(buf)); if (len != -1) buf[len] = '\\0'; }`,
    good: `#include <unistd.h>
void f(const char *p) { char buf[256]; ssize_t len = readlink(p, buf, sizeof buf - 1); if (len != -1) buf[len] = '\\0'; }`,
  },
  {
    key: "cert:POS33-C",
    bad: `#include <unistd.h>
int run(char *const argv[]) { pid_t p = vfork(); if (p == 0) { execv(argv[0], argv); _exit(1); } return p; }`,
    good: `#include <unistd.h>
int run(char *const argv[]) { pid_t p = fork(); if (p == 0) { execv(argv[0], argv); _exit(1); } return p; }`,
  },
  {
    key: "cert:POS34-C",
    bad: `#include <stdlib.h>
#include <stdio.h>
int set_tz(const char *v) { char env[1024]; snprintf(env, sizeof env, "TZ=%s", v); return putenv(env); }`,
    good: `#include <stdlib.h>
int set_tz(const char *v) { return setenv("TZ", v, 1); }
static char tzenv[64] = "TZ=UTC";
int set_utc(void) { return putenv(tzenv); }`,
  },
  {
    key: "cert:POS35-C",
    bad: `#include <sys/stat.h>
#include <fcntl.h>
int f(const char *file) { struct stat st; if (lstat(file, &st) == -1) return -1; if (S_ISLNK(st.st_mode)) return -1; int fd = open(file, O_RDWR); return fd; }`,
    good: `#include <sys/stat.h>
#include <fcntl.h>
int f(const char *file) { struct stat a, b; if (lstat(file, &a) == -1) return -1; int fd = open(file, O_RDWR); if (fd == -1) return -1; if (fstat(fd, &b) == -1) return -1; if (a.st_ino != b.st_ino) return -1; return fd; }`,
  },
  {
    key: "cert:POS36-C",
    bad: `#include <unistd.h>
#include <stdlib.h>
void drop(void) { if (setuid(getuid()) == -1) abort(); if (setgid(getgid()) == -1) abort(); }`,
    good: `#include <unistd.h>
#include <stdlib.h>
void drop(void) { if (setgid(getgid()) == -1) abort(); if (setuid(getuid()) == -1) abort(); }`,
  },
  {
    key: "cert:POS37-C",
    bad: `#include <unistd.h>
void drop(void) { setgid(getgid()); setuid(getuid()); }`,
    good: `#include <unistd.h>
#include <stdlib.h>
void drop(void) { if (setgid(getgid()) != 0) abort(); if (setuid(getuid()) != 0) abort(); }`,
  },
  {
    key: "cert:POS38-C",
    bad: `#include <unistd.h>
#include <fcntl.h>
#include <stdio.h>
int main(void) {
  char c;
  int fd = open("test.txt", O_RDONLY);
  if (fd == -1) return 1;
  if (fork() == 0) { if (read(fd, &c, 1) != 1) return 1; return 0; }
  if (read(fd, &c, 1) != 1) return 1;
  return 0;
}`,
    good: `#include <unistd.h>
#include <fcntl.h>
#include <stdio.h>
int main(void) {
  char c;
  pid_t p = fork();
  if (p == -1) return 1;
  int fd = open("test.txt", O_RDONLY | O_CLOEXEC);
  if (fd == -1) return 1;
  if (read(fd, &c, 1) != 1) return 1;
  return 0;
}`,
  },
  {
    key: "cert:POS38-C",
    bad: `#include <unistd.h>
#include <fcntl.h>
int main(char *const argv[]) {
  int fd = open("secret.key", O_RDONLY);
  if (fd == -1) return 1;
  if (fork() == 0) { execv("/bin/helper", argv); _exit(1); }
  return 0;
}`,
    good: `#include <unistd.h>
#include <fcntl.h>
int main(char *const argv[]) {
  int fd = open("secret.key", O_RDONLY | O_CLOEXEC);
  if (fd == -1) return 1;
  if (fork() == 0) { execv("/bin/helper", argv); _exit(1); }
  return 0;
}`,
  },
  {
    key: "cert:POS39-C",
    bad: `#include <sys/socket.h>
#include <netinet/in.h>
void setup(struct sockaddr_in *a, unsigned short port) { a->sin_port = port; a->sin_addr.s_addr = INADDR_LOOPBACK; }`,
    good: `#include <sys/socket.h>
#include <netinet/in.h>
void setup(struct sockaddr_in *a, unsigned short port) { a->sin_port = htons(port); a->sin_addr.s_addr = htonl(INADDR_LOOPBACK); }
void any(struct sockaddr_in *a) { a->sin_addr.s_addr = INADDR_ANY; }`,
  },
  {
    key: "cert:POS39-C",
    bad: `#include <sys/socket.h>
#include <stdint.h>
uint32_t get(int s) { uint32_t n; if (recv(s, &n, sizeof n, 0) != sizeof n) return 0; return n; }`,
    good: `#include <sys/socket.h>
#include <stdint.h>
uint32_t get(int s) { uint32_t n; if (recv(s, &n, sizeof n, 0) != sizeof n) return 0; return ntohl(n); }`,
  },
  {
    key: "cert:POS44-C",
    bad: `#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>
#include <signal.h>
void stop(pthread_t t) { pthread_kill(t, SIGTERM); }`,
    good: `#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>
#include <signal.h>
int stop(pthread_t t) { if (pthread_cancel(t) != 0) return -1; return pthread_join(t, 0); }
int poke(pthread_t t) { return pthread_kill(t, SIGUSR1); }`,
  },
  {
    key: "cert:POS47-C",
    bad: `#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>
void *w(void *a) { int old; pthread_setcanceltype(PTHREAD_CANCEL_ASYNCHRONOUS, &old); return 0; }`,
    good: `#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>
void *w(void *a) { int old; if (pthread_setcanceltype(PTHREAD_CANCEL_DEFERRED, &old) != 0) return 0; return 0; }`,
  },
  {
    key: "cert:POS48-C",
    bad: `#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>
pthread_mutex_t m;
void *w(void *a) { if (pthread_mutex_lock(&m) != 0) return 0; return 0; }
void release(void) { pthread_mutex_unlock(&m); }
int main(void) { pthread_t t; if (pthread_create(&t, 0, w, 0) != 0) return 1; release(); return pthread_join(t, 0); }`,
    good: `#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>
pthread_mutex_t m;
int shared;
void *w(void *a) { if (pthread_mutex_lock(&m) != 0) return 0; shared++; pthread_mutex_unlock(&m); return 0; }
void touch(void) { if (pthread_mutex_lock(&m) != 0) return; shared = 0; pthread_mutex_unlock(&m); }
int main(void) { pthread_t t; if (pthread_create(&t, 0, w, 0) != 0) return 1; touch(); return pthread_join(t, 0); }`,
  },
  {
    key: "cert:POS48-C",
    bad: `#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>
pthread_mutex_t m;
void *w(void *a) { pthread_mutex_lock(&m); pthread_mutex_unlock(&m); return 0; }
int main(void) { pthread_t t; if (pthread_create(&t, 0, w, 0) != 0) return 1; pthread_mutex_destroy(&m); pthread_join(t, 0); return 0; }`,
    good: `#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>
pthread_mutex_t m;
void *w(void *a) { pthread_mutex_lock(&m); pthread_mutex_unlock(&m); return 0; }
int main(void) { pthread_t t; if (pthread_create(&t, 0, w, 0) != 0) return 1; pthread_join(t, 0); pthread_mutex_destroy(&m); return 0; }`,
  },
  {
    key: "cert:POS49-C",
    bad: `#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>
struct multi { unsigned int a : 4; unsigned int b : 4; } g;
void *t1(void *x) { g.a = 1; return 0; }
void *t2(void *x) { g.b = 2; return 0; }
int main(void) { pthread_t p, q; pthread_create(&p, 0, t1, 0); pthread_create(&q, 0, t2, 0); pthread_join(p, 0); pthread_join(q, 0); return 0; }`,
    good: `#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>
struct multi { unsigned int a; unsigned int b; } g;
void *t1(void *x) { g.a = 1; return 0; }
void *t2(void *x) { g.b = 2; return 0; }
int main(void) { pthread_t p, q; pthread_create(&p, 0, t1, 0); pthread_create(&q, 0, t2, 0); pthread_join(p, 0); pthread_join(q, 0); return 0; }`,
  },
  {
    key: "cert:POS50-C",
    bad: `#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>
void *child(void *v) { return v; }
int create(pthread_t *t) { int val = 1; return pthread_create(t, 0, child, &val); }`,
    good: `#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>
void *child(void *v) { return v; }
int create(void) { pthread_t t; int val = 1; if (pthread_create(&t, 0, child, &val) != 0) return -1; return pthread_join(t, 0); }`,
  },
  {
    key: "cert:POS51-C",
    bad: `#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>
pthread_mutex_t a, b;
void f1(void) { pthread_mutex_lock(&a); pthread_mutex_lock(&b); pthread_mutex_unlock(&b); pthread_mutex_unlock(&a); }
void f2(void) { pthread_mutex_lock(&b); pthread_mutex_lock(&a); pthread_mutex_unlock(&a); pthread_mutex_unlock(&b); }`,
    good: `#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>
pthread_mutex_t a, b;
void f1(void) { pthread_mutex_lock(&a); pthread_mutex_lock(&b); pthread_mutex_unlock(&b); pthread_mutex_unlock(&a); }
void f2(void) { pthread_mutex_lock(&a); pthread_mutex_lock(&b); pthread_mutex_unlock(&b); pthread_mutex_unlock(&a); }`,
  },
  {
    key: "cert:POS52-C",
    bad: `#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/socket.h>
pthread_mutex_t m;
void *w(void *a) { char buf[64]; int s = *(int *)a; pthread_mutex_lock(&m); recv(s, buf, sizeof buf, 0); pthread_mutex_unlock(&m); return 0; }`,
    good: `#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/socket.h>
pthread_mutex_t m; int total;
void *w(void *a) { char buf[64]; int s = *(int *)a; long n = recv(s, buf, sizeof buf, 0); pthread_mutex_lock(&m); total += (int)n; pthread_mutex_unlock(&m); return 0; }`,
  },
  {
    key: "cert:POS53-C",
    bad: `#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>
pthread_mutex_t m1, m2; pthread_cond_t cv; int r1, r2;
void *a(void *x) { pthread_mutex_lock(&m1); while (!r1) pthread_cond_wait(&cv, &m1); pthread_mutex_unlock(&m1); return 0; }
void *b(void *x) { pthread_mutex_lock(&m2); while (!r2) pthread_cond_wait(&cv, &m2); pthread_mutex_unlock(&m2); return 0; }`,
    good: `#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>
pthread_mutex_t m1; pthread_cond_t cv; int r1, r2;
void *a(void *x) { pthread_mutex_lock(&m1); while (!r1) pthread_cond_wait(&cv, &m1); pthread_mutex_unlock(&m1); return 0; }
void *b(void *x) { pthread_mutex_lock(&m1); while (!r2) pthread_cond_wait(&cv, &m1); pthread_mutex_unlock(&m1); return 0; }`,
  },
  {
    key: "cert:POS54-C",
    bad: `#include <sys/mman.h>
#include <stddef.h>
void *map(int fd, size_t n) { void *p = mmap(NULL, n, PROT_READ, MAP_PRIVATE, fd, 0); if (p == NULL) return NULL; return p; }`,
    good: `#include <sys/mman.h>
#include <stddef.h>
void *map(int fd, size_t n) { void *p = mmap(NULL, n, PROT_READ, MAP_PRIVATE, fd, 0); if (p == MAP_FAILED) return NULL; return p; }`,
  },
  {
    key: "cert:POS54-C",
    bad: `#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>
void *w(void *a) { return a; }
void start(void) { pthread_t t; pthread_create(&t, NULL, w, NULL); pthread_detach(t); }`,
    good: `#include <pthread.h>
#include <stdlib.h>
#include <unistd.h>
void *w(void *a) { return a; }
int start(void) { pthread_t t; if (pthread_create(&t, NULL, w, NULL) != 0) return -1; return pthread_detach(t); }`,
  },
  // ---- win.js
  {
    key: "cert:WIN30-C",
    bad: `#include <windows.h>
void f(void) {
  LPTSTR buf;
  DWORD n = FormatMessage(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM, NULL, GetLastError(), LANG_USER_DEFAULT, (LPTSTR)&buf, 0, NULL);
  if (n != 0) GlobalFree(buf);
}`,
    good: `#include <windows.h>
void f(void) {
  LPTSTR buf;
  DWORD n = FormatMessage(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM, NULL, GetLastError(), LANG_USER_DEFAULT, (LPTSTR)&buf, 0, NULL);
  if (n != 0) LocalFree(buf);
}`,
  },
  {
    key: "cert:WIN30-C", lang: "cpp",
    bad: `#include <windows.h>
#include <cstdlib>
void f(HANDLE h) {
  char *p = (char *)HeapAlloc(h, 0, 64);
  if (!p) return;
  std::free(p);
  void *q = std::malloc(8);
  LocalFree(q);
}`,
    good: `#include <windows.h>
#include <cstdlib>
void f(HANDLE h) {
  char *p = (char *)HeapAlloc(h, 0, 64);
  if (!p) return;
  HeapFree(h, 0, p);
  void *q = std::malloc(8);
  std::free(q);
}`,
  },
  // ---- cpp-dcl.js
  {
    key: "cert:DCL50-CPP",
    bad: `#include <cstdarg>
int sum(int n, ...) { va_list ap; va_start(ap, n); int s = 0; for (int i = 0; i < n; ++i) s += va_arg(ap, int); va_end(ap); return s; }`,
    good: `template <typename T> T sum(T v) { return v; }
template <typename T, typename... Ts> T sum(T v, Ts... rest) { return v + sum(rest...); }
extern "C" int printf(const char *, ...);
int use() { return sum(1, 2, 3); }`,
  },
  {
    key: "cert:DCL51-CPP",
    bad: `#ifndef _MY_HEADER_H_
#define _MY_HEADER_H_
int __counter;
#endif`,
    good: `#ifndef MY_HEADER_H
#define MY_HEADER_H
namespace app { int counter; int value_; }
#endif`,
  },
  {
    key: "cert:DCL51-CPP",
    bad: `unsigned long long operator"" km(unsigned long long v) { return v * 1000; }
#define override`,
    good: `unsigned long long operator"" _km(unsigned long long v) { return v * 1000; }
#define MY_OVERRIDE override`,
  },
  {
    key: "cert:DCL52-CPP",
    bad: `typedef int &IntRef;
int g;
const IntRef r = g;`,
    good: `typedef const int &CIntRef;
int g;
CIntRef r = g;
const int &r2 = g;`,
  },
  {
    key: "cert:DCL52-CPP",
    bad: `char c = 'x';
char &const p = c;`,
    good: `char c = 'x';
const char &p = c;
int f(int a, int b) { return a & b; }`,
  },
  {
    key: "cert:DCL53-CPP",
    bad: `#include <mutex>
std::mutex m;
void f() { std::unique_lock<std::mutex>(m); }`,
    good: `#include <mutex>
std::mutex m;
void f() { std::unique_lock<std::mutex> lk(m); }`,
  },
  {
    key: "cert:DCL53-CPP",
    bad: `struct Widget { int v; };
int g() { Widget w(); return 0; }`,
    good: `struct Widget { int v; };
int g() { Widget w{}; Widget w2; return w.v + w2.v; }`,
  },
  {
    key: "cert:DCL53-CPP",
    bad: `struct Widget { Widget(int) {} };
struct Gadget { Gadget(Widget) {} };
void g(int i) { Gadget gg(Widget(i)); }`,
    good: `struct Widget { Widget(int) {} };
struct Gadget { Gadget(Widget) {} };
void g(int i) { Gadget gg(Widget{i}); Gadget g2{Widget(i)}; }`,
  },
  {
    key: "cert:DCL54-CPP",
    bad: `#include <cstddef>
#include <cstdlib>
struct S { void *operator new(std::size_t n) { return std::malloc(n); } };`,
    good: `#include <cstddef>
#include <cstdlib>
struct S { void *operator new(std::size_t n) { return std::malloc(n); } void operator delete(void *p) { std::free(p); } };`,
  },
  {
    key: "cert:DCL54-CPP",
    bad: `#include <cstdlib>
#include <new>
void operator delete(void *p) noexcept { std::free(p); }`,
    good: `#include <cstdlib>
#include <new>
void *operator new(std::size_t n) { void *p = std::malloc(n); if (!p) throw std::bad_alloc(); return p; }
void operator delete(void *p) noexcept { std::free(p); }`,
  },
  {
    key: "cert:DCL55-CPP",
    bad: `#include <cstddef>
extern "C" unsigned long copy_to_user(void *to, const void *from, unsigned long n);
struct Test { int a; char b; int c; };
void do_work(void *usr_buf) { Test arg{1, 2, 3}; copy_to_user(usr_buf, &arg, sizeof(arg)); }`,
    good: `#include <cstddef>
extern "C" unsigned long copy_to_user(void *to, const void *from, unsigned long n);
struct Test { int a; int b; int c; };
void do_work(void *usr_buf) { Test arg{1, 2, 3}; copy_to_user(usr_buf, &arg, sizeof(arg)); }`,
  },
  {
    key: "cert:DCL56-CPP",
    bad: `int fact(int i) noexcept(false) {
  if (i < 0) return 0;
  static const int cache[] = { fact(0), fact(1), fact(2), fact(3) };
  if (i < 4) return cache[i];
  return i * fact(i - 1);
}`,
    good: `int fact(int i) noexcept(false) {
  if (i < 0) return 0;
  static const int cache[] = { 1, 1, 2, 6 };
  if (i < 4) return cache[i];
  return i * fact(i - 1);
}`,
  },
  {
    key: "cert:DCL56-CPP",
    bad: [
      { path: "a.cpp", lang: "cpp", text: `int compute();
int numWheels = compute();` },
      { path: "b.cpp", lang: "cpp", text: `extern int numWheels;
int numTires = numWheels * 2;` },
    ],
    good: [
      { path: "a.cpp", lang: "cpp", text: `int numWheels = 4;` },
      { path: "b.cpp", lang: "cpp", text: `extern int numWheels;
int numTires() { return numWheels * 2; }` },
    ],
  },
  {
    key: "cert:DCL57-CPP",
    bad: `#include <stdexcept>
class S { bool bad() const; public: ~S() noexcept(false) { if (bad()) throw std::logic_error("x"); } };`,
    good: `#include <stdexcept>
class S { bool bad() const; public: ~S() { try { if (bad()) throw std::logic_error("x"); } catch (...) {} } };`,
  },
  {
    key: "cert:DCL57-CPP",
    bad: `#include <cstdlib>
void operator delete(void *p) noexcept(false) { if (!p) throw 1; std::free(p); }
void *operator new(unsigned long n);`,
    good: `#include <cstdlib>
void operator delete(void *p) noexcept { std::free(p); }
void *operator new(unsigned long n);`,
  },
  {
    key: "cert:DCL58-CPP",
    bad: `namespace std { int x; }`,
    good: `#include <functional>
struct MyType { int v; };
namespace std { template <> struct hash<MyType> { unsigned long operator()(const MyType &m) const { return m.v; } }; }
namespace mine { int x; }`,
  },
  {
    key: "cert:DCL59-CPP",
    bad: [
      { path: "a.h", lang: "cpp", text: `namespace { int v; }` },
      { path: "a.cpp", lang: "cpp", text: `#include "a.h"
int get() { return v; }` },
    ],
    good: [
      { path: "a.h", lang: "cpp", text: `namespace lib { inline int v; }` },
      { path: "a.cpp", lang: "cpp", text: `#include "a.h"
namespace { int w; }
int get() { return lib::v + w; }` },
    ],
  },
  {
    key: "cert:DCL60-CPP",
    bad: [
      { path: "a.cpp", lang: "cpp", text: `struct S { int a; };
int fa(S s) { return s.a; }` },
      { path: "b.cpp", lang: "cpp", text: `struct S { int a; int b; };
int fb(S s) { return s.b; }` },
    ],
    good: [
      { path: "s.h", lang: "cpp", text: `#pragma once
struct S { int a; int b; };` },
      { path: "a.cpp", lang: "cpp", text: `#include "s.h"
int fa(S s) { return s.a; }
namespace { struct L { int x; }; }` },
      { path: "b.cpp", lang: "cpp", text: `#include "s.h"
int fb(S s) { return s.b; }
namespace { struct L { double y; }; }` },
    ],
  },
  {
    key: "cert:DCL60-CPP",
    bad: [
      { path: "a.cpp", lang: "cpp", text: `inline int twice(int x) { return x * 2; }
int fa() { return twice(1); }` },
      { path: "b.cpp", lang: "cpp", text: `inline int twice(int x) { return x + x + 1; }
int fb() { return twice(2); }` },
    ],
    good: [
      { path: "t.h", lang: "cpp", text: `#pragma once
inline int twice(int x) { return x * 2; }` },
      { path: "a.cpp", lang: "cpp", text: `#include "t.h"
int fa() { return twice(1); }` },
      { path: "b.cpp", lang: "cpp", text: `#include "t.h"
int fb() { return twice(2); }` },
    ],
  },
  {
    key: "cert:DCL60-CPP",
    bad: [
      { path: "a.cpp", lang: "cpp", text: `int helper(int x) { return x + 1; }` },
      { path: "b.cpp", lang: "cpp", text: `int helper(int x) { return x + 2; }` },
    ],
    good: [
      { path: "a.cpp", lang: "cpp", text: `#include "missing/engine.h"
namespace k { void Engine::stop() {} }` },
      { path: "b.cpp", lang: "cpp", text: `#include "missing/listener.h"
namespace k { void Listener::stop() {} }` },
    ],
  },
  {
    key: "cert:DCL54-CPP",
    bad: `#include <cstddef>
struct S { static void *operator new(std::size_t n); };`,
    good: `enum State { A, B };
const char *toString(State s) { return s == A ? "A" : "B"; }
const char *valueOf(int) { return "v"; }`,
  },
  // ---- cpp-exp.js
  {
    key: "cert:EXP50-CPP",
    bad: `void g(int a, int b);
void f(int i) { g(i++, i); }`,
    good: `void g(int a, int b);
void f(int i) { int a = i++; g(a, i); g(i + 1, i); }`,
  },
  {
    key: "cert:EXP50-CPP",
    bad: `int f(int i) { i = i++ + 1; return i; }`,
    good: `int f(int i) { i = i + 1; ++i; return i; }`,
  },
  {
    key: "cert:EXP50-CPP",
    bad: `#include <iostream>
void f(int i) { std::cout << i++ << i << std::endl; }`,
    good: `#include <iostream>
void f(int i) { std::cout << i << std::endl; ++i; std::cout << i << std::endl; }`,
  },
  {
    key: "cert:EXP51-CPP",
    bad: `struct Base { virtual ~Base() = default; };
struct Derived final : Base {};
void f() { Base *b = new Derived[10]; delete [] b; }`,
    good: `struct Base { virtual ~Base() = default; };
struct Derived final : Base {};
void f() { Derived *b = new Derived[10]; delete [] b; }`,
  },
  {
    key: "cert:EXP52-CPP",
    bad: `#include <cstddef>
void f() { int a = 14; int b = sizeof(a++); decltype(a++) c = a; (void)b; (void)c; }`,
    good: `#include <cstddef>
void f() { int a = 14; int b = sizeof(a); ++a; decltype(a) c = a; (void)b; (void)c; }`,
  },
  {
    key: "cert:EXP53-CPP",
    bad: `#include <iostream>
void f() { int i; std::cout << i; }`,
    good: `#include <iostream>
void f() { int i = 0; std::cout << i; int j; j = 4; std::cout << j; int k; std::cin >> k; std::cout << k; }`,
  },
  {
    key: "cert:EXP54-CPP",
    bad: `int &get() { int x = 12; return x; }`,
    good: `int get() { int x = 12; return x; }
static int g;
int &getg() { return g; }
int &pass(int &r) { return r; }`,
  },
  {
    key: "cert:EXP54-CPP",
    bad: `#include <string>
std::string name();
void use(const char *);
void f() { const char *p = name().c_str(); use(p); }`,
    good: `#include <string>
std::string name();
void use(const char *);
void f() { std::string n = name(); const char *p = n.c_str(); use(p); use(name().c_str()); }`,
  },
  {
    key: "cert:EXP54-CPP",
    bad: `struct S { int v; ~S() {} };
int f() { S s{3}; s.~S(); return s.v; }`,
    good: `#include <new>
struct S { int v; ~S() {} };
int f() { alignas(S) unsigned char buf[sizeof(S)]; S *p = new (buf) S{3}; int v = p->v; p->~S(); return v; }`,
  },
  {
    key: "cert:EXP55-CPP",
    bad: `void f() { const int i = 1; int *p = const_cast<int *>(&i); *p = 2; }`,
    good: `void g(const int *cp) { int *p = const_cast<int *>(cp); (void)p; }
void f() { int i = 1; const int *cp = &i; int *p = const_cast<int *>(cp); *p = 2; }`,
  },
  {
    key: "cert:EXP55-CPP",
    bad: `struct S { int cache; int get() const { const_cast<S *>(this)->cache = 4; return cache; } };`,
    good: `struct S { mutable int cache; int get() const { cache = 4; return cache; } };`,
  },
  {
    key: "cert:EXP56-CPP",
    bad: `#include <cstdlib>
int cmp(const void *a, const void *b) { return *(const int *)a - *(const int *)b; }
void f(int *v, std::size_t n) { std::qsort(v, n, sizeof(int), cmp); }`,
    good: `#include <cstdlib>
extern "C" int cmp(const void *a, const void *b) { return *(const int *)a - *(const int *)b; }
void f(int *v, std::size_t n) { std::qsort(v, n, sizeof(int), cmp); }`,
  },
  {
    key: "cert:EXP57-CPP",
    bad: `class Handle { class Body *impl; public: ~Handle() { delete impl; } };`,
    good: `class Body { public: ~Body() {} };
class Handle { Body *impl; public: ~Handle() { delete impl; } };`,
  },
  {
    key: "cert:EXP58-CPP",
    bad: `#include <cstdarg>
extern "C" void f(float a, ...) { va_list l; va_start(l, a); va_end(l); }`,
    good: `#include <cstdarg>
extern "C" void f(double a, ...) { va_list l; va_start(l, a); va_end(l); }`,
  },
  {
    key: "cert:EXP58-CPP",
    bad: `#include <cstdarg>
extern "C" void g(int &n, ...) { va_list l; va_start(l, n); va_end(l); }`,
    good: `#include <cstdarg>
extern "C" void g(int *n, ...) { va_list l; va_start(l, n); va_end(l); }`,
  },
  {
    key: "cert:EXP59-CPP",
    bad: `#include <cstddef>
struct D { virtual void f() {} int i; };
std::size_t off() { return offsetof(D, i); }`,
    good: `#include <cstddef>
struct D { void f() {} int i; };
std::size_t off() { return offsetof(D, i); }`,
  },
  {
    key: "cert:EXP59-CPP",
    bad: `#include <cstddef>
struct S { static int i; int j; };
std::size_t off() { return offsetof(S, i); }`,
    good: `#include <cstddef>
struct S { static int i; int j; };
std::size_t off() { return offsetof(S, j); }`,
  },
  {
    key: "cert:EXP60-CPP",
    bad: `#include <cstdio>
#include <string>
void f(const std::string &s) { std::printf("%s\\n", s); }`,
    good: `#include <cstdio>
#include <string>
void f(const std::string &s) { std::printf("%s\\n", s.c_str()); }`,
  },
  {
    key: "cert:EXP60-CPP",
    bad: `struct B { virtual void f(); int a; };
extern "C" void c_api(B *b);
void g(B &b) { c_api(&b); }`,
    good: `struct P { int a; int b; };
extern "C" void c_api(P *p);
void g(P &p) { c_api(&p); }`,
  },
  {
    key: "cert:EXP61-CPP",
    bad: `auto g() { int i = 12; return [&] { i = 100; return i; }; }`,
    good: `auto g() { int i = 12; return [=]() mutable { i = 100; return i; }; }
int h() { int i = 1; auto l = [&] { return i + 1; }; return l(); }`,
  },
  {
    key: "cert:EXP61-CPP",
    bad: `#include <functional>
struct W { std::function<int()> cb; void set() { int local = 5; cb = [&local] { return local; }; } };`,
    good: `#include <functional>
struct W { std::function<int()> cb; void set() { int local = 5; cb = [local] { return local; }; } };`,
  },
  {
    key: "cert:EXP62-CPP",
    bad: `#include <cstring>
struct C { int i; C() : i(0) {} virtual void f(); void reset() { std::memset(this, 0, sizeof(*this)); } };`,
    good: `#include <cstring>
struct P { int i; int j; };
void clear(P *p) { std::memset(p, 0, sizeof(*p)); }`,
  },
  {
    key: "cert:EXP62-CPP",
    bad: `#include <cstring>
#include <string>
struct R { std::string name; int id; };
bool same(const R &a, const R &b) { return std::memcmp(&a, &b, sizeof(R)) == 0; }`,
    good: `#include <cstring>
#include <string>
struct R { std::string name; int id; };
bool same(const R &a, const R &b) { return a.name == b.name && a.id == b.id; }`,
  },
  {
    key: "cert:EXP63-CPP",
    bad: `#include <string>
#include <iostream>
void g(std::string v) { std::cout << v; }
void f() { std::string s = "x"; g(std::move(s)); std::cout << s.size(); }`,
    good: `#include <string>
#include <iostream>
void g(std::string v) { std::cout << v; }
void f() { std::string s = "x"; g(std::move(s)); s.clear(); s = "y"; std::cout << s.size(); }`,
  },
  {
    key: "cert:INT50-CPP",
    bad: `enum EnumType { First, Second, Third };
EnumType f() { return static_cast<EnumType>(5); }`,
    good: `enum EnumType { First, Second, Third };
enum class Fixed { A, B };
enum Wide : int { W1, W2 };
EnumType f() { return static_cast<EnumType>(2); }
Wide g() { return static_cast<Wide>(5); }`,
  },
  {
    key: "cert:EXP63-CPP",
    bad: `#include <string>
#include <utility>
std::string sink(std::string s);
int f(std::string line) { std::string other = std::move(line); return (int)line.size() + (int)other.size(); }`,
    good: `#include <string>
#include <utility>
std::string trim(std::string s);
int f(std::string line) { line = trim(std::move(line)); return line.empty() ? 0 : 1; }`,
  },
  // ---- cpp-ctr.js
  {
    key: "cert:CTR50-CPP",
    bad: `#include <array>
int f() { std::array<int, 4> a{}; return a[4]; }`,
    good: `#include <array>
int f() { std::array<int, 4> a{}; return a[3] + a.at(2); }`,
  },
  {
    key: "cert:CTR50-CPP",
    bad: `#include <vector>
void insert_in_table(std::vector<int> &table, std::size_t pos, int value) { table[pos] = value; }`,
    good: `#include <vector>
void insert_in_table(std::vector<int> &table, std::size_t pos, int value) { if (pos >= table.size()) return; table[pos] = value; }`,
  },
  {
    key: "cert:CTR50-CPP",
    bad: `#include <cstddef>
void insert_in_table(int *table, std::size_t tableSize, std::size_t pos, int value) { table[pos] = value; }`,
    good: `#include <cstddef>
void insert_in_table(int *table, std::size_t tableSize, std::size_t pos, int value) { if (pos < tableSize) table[pos] = value; }`,
  },
  {
    key: "cert:CTR51-CPP",
    bad: `#include <vector>
void f(std::vector<int> &c) { auto it = c.begin(); c.push_back(4); *it = 2; }`,
    good: `#include <vector>
void f(std::vector<int> &c) { c.push_back(4); auto it = c.begin(); *it = 2; }`,
  },
  {
    key: "cert:CTR51-CPP",
    bad: `#include <vector>
void f(std::vector<int> &v) { for (int x : v) { if (x < 0) v.push_back(-x); } }`,
    good: `#include <vector>
void f(std::vector<int> &v) { std::vector<int> add; for (int x : v) { if (x < 0) add.push_back(-x); } for (int x : add) v.push_back(x); }`,
  },
  {
    key: "cert:CTR51-CPP",
    bad: `#include <vector>
void f(std::vector<int> &v) { for (auto it = v.begin(); it != v.end(); ++it) { if (*it == 0) v.erase(it); } }`,
    good: `#include <vector>
void f(std::vector<int> &v) { for (auto it = v.begin(); it != v.end();) { if (*it == 0) it = v.erase(it); else ++it; } }`,
  },
  {
    key: "cert:CTR52-CPP",
    bad: `#include <algorithm>
#include <vector>
void f(const std::vector<int> &src) { std::vector<int> dest; std::copy(src.begin(), src.end(), dest.begin()); }`,
    good: `#include <algorithm>
#include <iterator>
#include <vector>
void f(const std::vector<int> &src) { std::vector<int> dest; std::copy(src.begin(), src.end(), std::back_inserter(dest)); std::vector<int> d2(src.size()); std::copy(src.begin(), src.end(), d2.begin()); }`,
  },
  {
    key: "cert:CTR52-CPP",
    bad: `#include <algorithm>
#include <vector>
void f() { std::vector<int> v(5); std::fill_n(v.begin(), 10, 0x42); }`,
    good: `#include <algorithm>
#include <vector>
void f() { std::vector<int> v(10); std::fill_n(v.begin(), 10, 0x42); }`,
  },
  {
    key: "cert:CTR53-CPP",
    bad: `#include <algorithm>
#include <vector>
void f(std::vector<int> &a, std::vector<int> &b) { std::sort(a.begin(), b.end()); }`,
    good: `#include <algorithm>
#include <vector>
void f(std::vector<int> &a, std::vector<int> &b) { std::sort(a.begin(), a.end()); b.insert(b.end(), a.begin(), a.end()); }`,
  },
  {
    key: "cert:CTR54-CPP",
    bad: `#include <vector>
long f(std::vector<int> &a, std::vector<int> &b) { return b.end() - a.begin(); }`,
    good: `#include <vector>
long f(std::vector<int> &a) { return a.end() - a.begin(); }`,
  },
  {
    key: "cert:CTR54-CPP",
    bad: `#include <vector>
int f(std::vector<int> &a, std::vector<int> &b) { int n = 0; for (auto it = a.begin(); it != b.end(); ++it) ++n; return n; }`,
    good: `#include <vector>
int f(std::vector<int> &a, std::vector<int> &b) { int n = 0; for (auto it = a.begin(); it != a.end(); ++it) ++n; return n; }`,
  },
  {
    key: "cert:CTR55-CPP",
    bad: `#include <vector>
int f(const std::vector<int> &c) { auto i = c.begin() + 20; return *i; }`,
    good: `#include <vector>
int f(const std::vector<int> &c) { if (c.size() < 21) return 0; auto i = c.begin() + 20; return *i; }`,
  },
  {
    key: "cert:CTR55-CPP",
    bad: `#include <vector>
void f(std::vector<int> &c) { auto e = c.end() + 1; (void)e; }`,
    good: `#include <vector>
void f(std::vector<int> &c) { auto e = c.end() - 1; (void)e; }`,
  },
  {
    key: "cert:CTR56-CPP",
    bad: `#include <iostream>
struct Base { virtual ~Base() = default; double d = 1; };
struct Derived : Base { double extra = 2; };
void f(const Base *b, unsigned n) { for (unsigned i = 0; i < n; ++i) std::cout << b[i].d; }
void g() { Derived d[4]; f(d, 4); }`,
    good: `#include <iostream>
struct Base { virtual ~Base() = default; double d = 1; };
struct Derived : Base { double extra = 2; };
void f(const Base *const *b, unsigned n) { for (unsigned i = 0; i < n; ++i) std::cout << b[i]->d; }
void g() { Derived d[4]; Base *p[4] = { &d[0], &d[1], &d[2], &d[3] }; f(p, 4); }`,
  },
  {
    key: "cert:CTR56-CPP",
    bad: `struct Base { virtual ~Base() = default; int a; };
struct Derived : Base { int b; };
int g() { Base *p = new Derived[3]; int s = p[1].a; return s; }`,
    good: `struct Base { virtual ~Base() = default; int a; };
struct Derived : Base { int b; };
int g() { Derived *p = new Derived[3]; int s = p[1].a; return s; }`,
  },
  {
    key: "cert:CTR57-CPP",
    bad: `#include <algorithm>
#include <vector>
void f(std::vector<int> &v) { std::sort(v.begin(), v.end(), [](int a, int b) { return a <= b; }); }`,
    good: `#include <algorithm>
#include <vector>
void f(std::vector<int> &v) { std::sort(v.begin(), v.end(), [](int a, int b) { return a < b; }); }`,
  },
  {
    key: "cert:CTR57-CPP",
    bad: `#include <set>
#include <functional>
std::set<int, std::less_equal<int>> s;`,
    good: `#include <set>
#include <functional>
std::set<int, std::less<int>> s;`,
  },
  {
    key: "cert:CTR57-CPP",
    bad: `#include <map>
struct Cmp { bool operator()(int a, int b) const { return a >= b; } };
std::map<int, int, Cmp> m;`,
    good: `#include <map>
struct Cmp { bool operator()(int a, int b) const { return a > b; } };
std::map<int, int, Cmp> m;`,
  },
  {
    key: "cert:CTR58-CPP",
    bad: `#include <algorithm>
#include <vector>
void f(std::vector<int> &v) { int timesCalled = 0; v.erase(std::remove_if(v.begin(), v.end(), [timesCalled](int) mutable { return ++timesCalled == 3; }), v.end()); }`,
    good: `#include <algorithm>
#include <vector>
void f(std::vector<int> &v) { int timesCalled = 0; v.erase(std::remove_if(v.begin(), v.end(), [&timesCalled](int) { return ++timesCalled == 3; }), v.end()); }`,
  },
  {
    key: "cert:CTR58-CPP",
    bad: `#include <algorithm>
#include <vector>
class MutablePredicate { int timesCalled = 0; public: bool operator()(int) { return ++timesCalled == 3; } };
void f(std::vector<int> &v) { v.erase(std::remove_if(v.begin(), v.end(), MutablePredicate()), v.end()); }`,
    good: `#include <algorithm>
#include <vector>
class Pred { int limit = 3; public: bool operator()(int x) const { return x == limit; } };
void f(std::vector<int> &v) { v.erase(std::remove_if(v.begin(), v.end(), Pred()), v.end()); }`,
  },
  // ---- cpp-str.js
  {
    key: "cert:STR50-CPP",
    bad: `#include <iostream>
void f() { char buf[12]; std::cin >> buf; }`,
    good: `#include <iostream>
#include <iomanip>
#include <string>
void f() { char buf[12]; std::cin.width(12); std::cin >> buf; char b2[8]; std::cin >> std::setw(8) >> b2; std::string s; std::cin >> s; }`,
  },
  {
    key: "cert:STR51-CPP",
    bad: `#include <cstdlib>
#include <string>
void f() { std::string tmp(std::getenv("TMP")); if (!tmp.empty()) {} }`,
    good: `#include <cstdlib>
#include <string>
void f() { const char *t = std::getenv("TMP"); std::string tmp(t ? t : ""); if (!tmp.empty()) {} }`,
  },
  {
    key: "cert:STR51-CPP",
    bad: `#include <string>
void f() { std::string s = nullptr; (void)s; }`,
    good: `#include <string>
void f() { std::string s = ""; std::string e; (void)s; (void)e; }`,
  },
  {
    key: "cert:STR51-CPP",
    bad: `#include <cstdlib>
#include <string>
std::string home() { const char *h = std::getenv("HOME"); std::string s; s = h; return s; }`,
    good: `#include <cstdlib>
#include <string>
std::string home() { const char *h = std::getenv("HOME"); std::string s; if (h) s = h; return s; }`,
  },
  {
    key: "cert:STR52-CPP",
    bad: `#include <string>
void f(std::string &input) { std::string::iterator loc = input.begin(); input.insert(loc, ';'); *loc = 'x'; }`,
    good: `#include <string>
void f(std::string &input) { std::string::iterator loc = input.begin(); loc = input.insert(loc, ';'); *loc = 'x'; }`,
  },
  {
    key: "cert:STR52-CPP",
    bad: `#include <string>
#include <cstdio>
void f(std::string &s) { const char *p = s.c_str(); s += "tail"; std::puts(p); }`,
    good: `#include <string>
#include <cstdio>
void f(std::string &s) { s += "tail"; const char *p = s.c_str(); std::puts(p); }`,
  },
  {
    key: "cert:STR53-CPP",
    bad: `#include <string>
char at(const std::string &s, std::size_t i) { return s[i]; }`,
    good: `#include <string>
char at(const std::string &s, std::size_t i) { if (i < s.size()) return s[i]; return s.at(0); }`,
  },
  {
    key: "cert:STR53-CPP",
    bad: `#include <string>
char f() { std::string s("abc"); return s[7]; }`,
    good: `#include <string>
char f() { std::string s("abc"); return s[2]; }`,
  },
  // ---- cpp-mem.js
  {
    key: "cert:MEM50-CPP",
    bad: `struct S { void f(); };
void g() { S *s = new S; delete s; s->f(); }`,
    good: `struct S { void f(); };
void g() { S *s = new S; s->f(); delete s; s = nullptr; }`,
  },
  {
    key: "cert:MEM50-CPP",
    bad: `void g(int n) { int *p = new int[n]; delete[] p; delete[] p; }`,
    good: `void g(int n) { int *p = new int[n]; delete[] p; p = new int[n]; delete[] p; }`,
  },
  {
    key: "cert:MEM50-CPP",
    bad: `struct Node { Node *next; };
void freeAll(Node *head) { for (Node *n = head; n; ) { delete n; n = n->next; } }`,
    good: `struct Node { Node *next; };
void freeAll(Node *head) { for (Node *n = head; n; ) { Node *next = n->next; delete n; n = next; } }`,
  },
  {
    key: "cert:MEM51-CPP",
    bad: `void f() { int *a = new int[10]; delete a; }`,
    good: `void f() { int *a = new int[10]; delete[] a; int *b = new int; delete b; }`,
  },
  {
    key: "cert:MEM51-CPP",
    bad: `#include <cstdlib>
struct S { int v; };
void f() { S *s = static_cast<S *>(std::malloc(sizeof(S))); delete s; }`,
    good: `#include <cstdlib>
struct S { int v; };
void f() { S *s = static_cast<S *>(std::malloc(sizeof(S))); std::free(s); }`,
  },
  {
    key: "cert:MEM51-CPP",
    bad: `void f() { int x = 4; int *p = &x; delete p; }`,
    good: `void f() { int *p = new int(4); delete p; }`,
  },
  {
    key: "cert:MEM51-CPP",
    bad: `#include <memory>
void f() { std::unique_ptr<int> p(new int[3]); }`,
    good: `#include <memory>
void f() { std::unique_ptr<int[]> p(new int[3]); std::unique_ptr<int> q(new int(1)); }`,
  },
  {
    key: "cert:MEM52-CPP",
    bad: `#include <new>
#include <cstring>
void f(const int *src, std::size_t n) { int *copy = new (std::nothrow) int[n]; std::memcpy(copy, src, n * sizeof(int)); copy[0] = 1; }`,
    good: `#include <new>
#include <cstring>
void f(const int *src, std::size_t n) { int *copy = new (std::nothrow) int[n]; if (!copy) return; std::memcpy(copy, src, n * sizeof(int)); }`,
  },
  {
    key: "cert:MEM52-CPP",
    bad: `#include <cstdlib>
void f(std::size_t n) { int *p = static_cast<int *>(std::malloc(n * sizeof(int))); p[0] = 0; std::free(p); }`,
    good: `#include <cstdlib>
void f(std::size_t n) { int *p = static_cast<int *>(std::malloc(n * sizeof(int))); if (p == nullptr) return; p[0] = 0; std::free(p); }`,
  },
  {
    key: "cert:MEM53-CPP",
    bad: `#include <cstdlib>
#include <string>
struct S { S(); std::string name; void f(); };
void g() { S *s = static_cast<S *>(std::malloc(sizeof(S))); s->f(); std::free(s); }`,
    good: `#include <cstdlib>
#include <new>
#include <string>
struct S { S(); std::string name; void f(); };
void g() { void *mem = std::malloc(sizeof(S)); if (!mem) return; S *s = new (mem) S; s->f(); s->~S(); std::free(s); }`,
  },
  {
    key: "cert:MEM54-CPP",
    bad: `#include <new>
void f() { char c; long *lp = ::new (&c) long; (void)lp; }`,
    good: `#include <new>
void f() { alignas(long) unsigned char buf[sizeof(long)]; long *lp = ::new (buf) long; (void)lp; }`,
  },
  {
    key: "cert:MEM54-CPP",
    bad: `#include <new>
struct P { double a; double b; };
void f() { unsigned char buf[8]; P *p = new (buf) P; (void)p; }`,
    good: `#include <new>
struct P { double a; double b; };
void f() { alignas(P) unsigned char buf[sizeof(P)]; P *p = new (buf) P; (void)p; }`,
  },
  {
    key: "cert:MEM55-CPP",
    bad: `#include <new>
#include <cstdlib>
void *operator new(std::size_t size) { extern void *alloc_mem(std::size_t); return alloc_mem(size) ? alloc_mem(size) : nullptr; }
void operator delete(void *p) noexcept { std::free(p); }`,
    good: `#include <new>
#include <cstdlib>
void *operator new(std::size_t size) { void *p = std::malloc(size); if (!p) throw std::bad_alloc(); return p; }
void operator delete(void *p) noexcept { std::free(p); }`,
  },
  {
    key: "cert:MEM55-CPP",
    bad: `#include <new>
#include <cstdlib>
void *operator new(std::size_t size) { return std::malloc(size); }
void operator delete(void *p) noexcept { std::free(p); }`,
    good: `#include <new>
#include <cstdlib>
void *operator new(std::size_t size, const std::nothrow_t &) noexcept { return std::malloc(size); }
void operator delete(void *p) noexcept { std::free(p); }`,
  },
  {
    key: "cert:MEM56-CPP",
    bad: `#include <memory>
void f() { int *i = new int; std::shared_ptr<int> p1(i); std::shared_ptr<int> p2(i); }`,
    good: `#include <memory>
void f() { std::shared_ptr<int> p1 = std::make_shared<int>(); std::shared_ptr<int> p2(p1); }`,
  },
  {
    key: "cert:MEM56-CPP",
    bad: `#include <memory>
struct A { std::shared_ptr<A> self() { return std::shared_ptr<A>(this); } };`,
    good: `#include <memory>
struct A : std::enable_shared_from_this<A> { std::shared_ptr<A> self() { return shared_from_this(); } };`,
  },
  {
    key: "cert:MEM56-CPP",
    bad: `#include <memory>
void f() { std::unique_ptr<int> a(new int(1)); std::shared_ptr<int> b(a.get()); }`,
    good: `#include <memory>
void f() { std::unique_ptr<int> a(new int(1)); std::shared_ptr<int> b(std::move(a)); }`,
  },
  {
    key: "cert:MEM57-CPP",
    bad: `struct alignas(32) Vector { char elems[32]; };
Vector *f() { Vector *pv = new Vector; return pv; }`,
    good: `#include <cstddef>
#include <cstdlib>
struct alignas(32) Vector { char elems[32]; static void *operator new(std::size_t n); static void operator delete(void *p); };
struct Plain { char elems[32]; };
Vector *f() { Vector *pv = new Vector; return pv; }
Plain *g() { return new Plain; }`,
  },
  // ---- cpp-fio.js
  {
    key: "cert:FIO50-CPP",
    bad: `#include <fstream>
#include <string>
void f(const std::string &name) {
  std::fstream file(name);
  if (!file.is_open()) return;
  file << "Output some data";
  std::string str;
  file >> str;
}`,
    good: `#include <fstream>
#include <string>
void f(const std::string &name) {
  std::fstream file(name);
  if (!file.is_open()) return;
  file << "Output some data";
  std::string str;
  file.seekg(0, std::ios::beg);
  file >> str;
}`,
  },
  {
    key: "cert:FIO51-CPP",
    bad: `#include <cstdio>
int f(const char *name) {
  std::FILE *fp = std::fopen(name, "r");
  if (!fp) return -1;
  int c = std::fgetc(fp);
  if (c == EOF) return -1;
  std::fclose(fp);
  return c;
}`,
    good: `#include <cstdio>
int f(const char *name) {
  std::FILE *fp = std::fopen(name, "r");
  if (!fp) return -1;
  int c = std::fgetc(fp);
  if (c == EOF) { std::fclose(fp); return -1; }
  std::fclose(fp);
  return c;
}`,
  },
  {
    key: "cert:FIO51-CPP",
    bad: `#include <cstdio>
void f(const char *name) { std::FILE *fp = std::fopen(name, "w"); if (fp) std::fputs("x", fp); }`,
    good: `#include <cstdio>
std::FILE *open_log(const char *name) { std::FILE *fp = std::fopen(name, "w"); return fp; }`,
  },
  {
    key: "cert:FIO51-CPP",
    bad: `#include <fstream>
#include <cstdlib>
void f() { std::ofstream out("log.txt"); out << "bye"; std::exit(1); }`,
    good: `#include <fstream>
#include <cstdlib>
void f() { std::ofstream out("log.txt"); out << "bye"; out.close(); std::exit(1); }`,
  },
  // ---- cpp-err.js
  {
    key: "cert:ERR50-CPP",
    bad: `#include <cstdlib>
void f(int x) { if (x < 0) std::abort(); }`,
    good: `#include <stdexcept>
void f(int x) { if (x < 0) throw std::invalid_argument("x"); }
int main() { return 0; }`,
  },
  {
    key: "cert:ERR50-CPP",
    bad: `#include <stdexcept>
class S { public: ~S() { throw std::runtime_error("dtor"); } };`,
    good: `#include <stdexcept>
class S { public: ~S() noexcept(false) { throw std::runtime_error("dtor"); } };
void g() noexcept { try { throw 1; } catch (int) {} }`,
  },
  {
    key: "cert:ERR50-CPP",
    bad: `void g() noexcept { throw 1; }`,
    good: `#include <cstdlib>
int main() { exit(0); }`,
  },
  {
    key: "cert:ERR51-CPP",
    bad: `#include <stdexcept>
void work(int n) { if (n) throw std::runtime_error("bad"); }
int main() { work(1); return 0; }`,
    good: `#include <stdexcept>
void work(int n) { if (n) throw std::runtime_error("bad"); }
int main() { try { work(1); } catch (...) { return 1; } return 0; }`,
  },
  {
    key: "cert:ERR51-CPP",
    bad: `int main() { throw 3; }`,
    good: `void ok() {}
int main() try { ok(); throw 3; } catch (...) { return 1; }`,
  },
  {
    key: "cert:ERR52-CPP",
    bad: `#include <csetjmp>
static jmp_buf env;
void g() { longjmp(env, 1); }
void f() { if (setjmp(env) == 0) g(); }`,
    good: `struct Jump {};
void g() { throw Jump(); }
void f() { try { g(); } catch (Jump &) {} }`,
  },
  {
    key: "cert:ERR53-CPP",
    bad: `class C { int *p; public: C(int n); };
C::C(int n) try : p(new int[n]) { } catch (...) { delete [] p; }`,
    good: `#include <cstdio>
class C { int *p; static int fails; public: C(int n); };
int C::fails = 0;
C::C(int n) try : p(new int[n]) { } catch (...) { fails++; std::puts("ctor failed"); }`,
  },
  {
    key: "cert:ERR54-CPP",
    bad: `class B {};
class D : public B {};
void f();
void g() { try { f(); } catch (B &b) { } catch (D &d) { } }`,
    good: `class B {};
class D : public B {};
void f();
void g() { try { f(); } catch (D &d) { } catch (B &b) { } catch (...) { } }`,
  },
  {
    key: "cert:ERR54-CPP",
    bad: `#include <stdexcept>
void f();
void g() { try { f(); } catch (const std::exception &e) { } catch (const std::out_of_range &e) { } }`,
    good: `#include <stdexcept>
void f();
void g() { try { f(); } catch (const std::out_of_range &e) { } catch (const std::exception &e) { } }`,
  },
  {
    key: "cert:ERR55-CPP",
    bad: `#include <stdexcept>
void inner(int v) { if (v < 0) throw std::domain_error("neg"); }
void outer(int v) noexcept { inner(v); }`,
    good: `#include <stdexcept>
void inner(int v) { if (v < 0) throw std::domain_error("neg"); }
void outer(int v) noexcept { try { inner(v); } catch (const std::domain_error &) { } }`,
  },
  {
    key: "cert:ERR55-CPP",
    bad: `class E1 {}; class E2 {};
void f(int x) throw(E1) { if (x) throw E2(); }`,
    good: `class E1 {}; class E2 : public E1 {};
void f(int x) throw(E1) { if (x) throw E2(); }`,
  },
  {
    key: "cert:ERR56-CPP",
    bad: `class A { int *p; public: A &operator=(const A &o); };
A &A::operator=(const A &o) { if (this != &o) { delete p; p = new int(*o.p); } return *this; }`,
    good: `class A { int *p; public: A &operator=(const A &o); };
A &A::operator=(const A &o) { int *t = new int(*o.p); delete p; p = t; return *this; }`,
  },
  {
    key: "cert:ERR57-CPP",
    bad: `#include <stdexcept>
void process(int *p) { if (!*p) throw std::runtime_error("zero"); }
void f() { int *p = new int(0); process(p); delete p; }
void g(int n) { char *b = new char[n]; if (n > 10) throw 1; delete [] b; }`,
    good: `#include <stdexcept>
void process(int *p) { if (!*p) throw std::runtime_error("zero"); }
void f() { int *q = new int(0); try { process(q); } catch (...) { delete q; throw; } delete q; }
void h() { int *p = new int(1); delete p; }`,
  },
  {
    key: "cert:ERR58-CPP",
    bad: `#include <string>
int compute() { throw 1; }
int g = compute();
const char *name();
std::string s(name());`,
    good: `#include <string>
int compute() noexcept { return 1; }
int g = compute();
const std::string &s() { static const std::string v("x"); return v; }`,
  },
  {
    key: "cert:ERR58-CPP",
    bad: `class Cfg { public: Cfg() { throw 1; } };
static Cfg cfg;`,
    good: `class Cfg { public: Cfg() noexcept {} };
static Cfg cfg;`,
  },
  {
    key: "cert:ERR59-CPP",
    bad: `extern "C" int callback(int v) { if (v < 0) throw v; return v; }`,
    good: `extern "C" int callback(int v) { try { if (v < 0) throw v; } catch (...) { return -1; } return v; }`,
  },
  {
    key: "cert:ERR59-CPP",
    bad: `#include <cstdlib>
int cmp(const void *a, const void *b) { if (!a) throw 1; return 0; }
void s(int *v, unsigned long n) { std::qsort(v, n, sizeof *v, cmp); }`,
    good: `#include <cstdlib>
int cmp(const void *a, const void *b) { return a < b ? -1 : 1; }
void s(int *v, unsigned long n) { std::qsort(v, n, sizeof *v, cmp); }`,
  },
  {
    key: "cert:ERR60-CPP",
    bad: `#include <string>
class MyErr { std::string msg; public: MyErr(const char *m) : msg(m) {} };
void f() { throw MyErr("x"); }`,
    good: `#include <stdexcept>
class MyErr : public std::runtime_error { public: MyErr(const char *m) : std::runtime_error(m) {} };
void f() { throw MyErr("x"); }`,
  },
  {
    key: "cert:ERR60-CPP",
    bad: `class E { int c; public: E() : c(0) {} E(const E &o) : c(o.c) {} };
void f() { throw E(); }`,
    good: `class E { int c; public: E() : c(0) {} E(const E &o) noexcept : c(o.c) {} };
void f() { throw E(); }`,
  },
  {
    key: "cert:ERR61-CPP",
    bad: `#include <stdexcept>
void f();
void g() { try { f(); } catch (std::exception e) { } }`,
    good: `#include <stdexcept>
void f();
void g() { try { f(); } catch (const std::exception &e) { } catch (int n) { } }`,
  },
  {
    key: "cert:ERR61-CPP",
    bad: `class E {};
void f() { throw new E; }
void g() { try { f(); } catch (E *e) { delete e; } }`,
    good: `class E {};
void f() { throw E(); }
void g() { try { f(); } catch (const char *s) { } catch (E &e) { } }`,
  },
  {
    key: "cert:ERR62-CPP",
    bad: `#include <cstdlib>
int f(const char *s) { return std::atoi(s); }`,
    good: `#include <cstdlib>
#include <cerrno>
long f(const char *s) { char *end; errno = 0; long v = std::strtol(s, &end, 10); if (errno || *end) return 0; return v; }`,
  },
  {
    key: "cert:ERR62-CPP",
    bad: `#include <iostream>
int f() { int n; std::cin >> n; return n; }
#include <cstdlib>
long g(const char *s) { return strtol(s, nullptr, 10); }`,
    good: `#include <iostream>
int f() { int n; if (!(std::cin >> n)) return -1; return n; }
int h() { int n; std::cin >> n; if (std::cin.fail()) return -1; return n; }`,
  },
  // ---- cpp-oop.js
  {
    key: "cert:OOP50-CPP",
    bad: `class B { public: B() { seize(); } virtual ~B() { release(); } protected: virtual void seize(); virtual void release(); };`,
    good: `class B { public: B() { B::seize(); helper(); } virtual ~B() { B::release(); } protected: virtual void seize(); virtual void release(); void helper(); };`,
  },
  {
    key: "cert:OOP50-CPP",
    bad: `class B { public: B(); virtual void init(); };
B::B() { this->init(); }`,
    good: `class B { public: B(); void init(); virtual void run(); };
B::B() { this->init(); }
void go(B &b) { b.run(); }`,
  },
  {
    key: "cert:OOP51-CPP",
    bad: `class Emp { public: virtual void print() const; };
class Mgr : public Emp { int level; public: void print() const override; };
void show(Emp e) { e.print(); }`,
    good: `class Emp { public: virtual void print() const; };
class Mgr : public Emp { int level; public: void print() const override; };
void show(const Emp &e) { e.print(); }
void f(Mgr &m) { show(m); }`,
  },
  {
    key: "cert:OOP51-CPP",
    bad: `struct Base { int a; };
struct Derived : Base { int b; };
void f() { Derived d; Base b = d; Base c; c = d; }`,
    good: `struct Base { int a; };
struct Derived : Base { int b; };
void f() { Derived d; Base &b = d; Base *p = &d; Derived e = d; }`,
  },
  {
    key: "cert:OOP52-CPP",
    bad: `struct Base { virtual void f(); ~Base(); };
struct Derived : Base { void f() override; };
void g() { Base *b = new Derived; delete b; }`,
    good: `struct Base { virtual void f(); virtual ~Base(); };
struct Derived : Base { void f() override; };
void g() { Base *b = new Derived; delete b; }`,
  },
  {
    key: "cert:OOP52-CPP",
    bad: `struct Base { int x; };
struct Derived : Base { int *buf; ~Derived(); };
void g() { Base *b = new Derived(); delete b; }`,
    good: `struct Base { int x; };
struct Derived : Base { int *buf; ~Derived(); };
void g() { Derived *d = new Derived(); delete d; Base *b = new Base; delete b; }`,
  },
  {
    key: "cert:OOP53-CPP",
    bad: `class C { int dependsOnSomeVal; int someVal; public: C(int val) : someVal(val), dependsOnSomeVal(someVal + 1) {} };`,
    good: `class C { int someVal; int dependsOnSomeVal; public: C(int val) : someVal(val), dependsOnSomeVal(someVal + 1) {} };`,
  },
  {
    key: "cert:OOP54-CPP",
    bad: `struct S { S(const S &); };
class T { int n; S *s; public: T &operator=(const T &rhs) { n = rhs.n; delete s; s = new S(*rhs.s); return *this; } };`,
    good: `struct S { S(const S &); };
class T { int n; S *s; public: T &operator=(const T &rhs) { if (this != &rhs) { n = rhs.n; delete s; s = new S(*rhs.s); } return *this; } };`,
  },
  {
    key: "cert:OOP55-CPP",
    bad: `struct B { virtual ~B(); };
struct D : B { int i; };
void f() { B *b = new B; int D::*pm = &D::i; b->*pm = 3; }`,
    good: `struct B { virtual ~B(); int j; };
struct D : B { int i; };
void f() { D *d = new D; int D::*pm = &D::i; d->*pm = 3; B b; int B::*pj = &B::j; b.*pj = 1; }`,
  },
  {
    key: "cert:OOP56-CPP",
    bad: `#include <exception>
void term() { }
void f() { std::set_terminate(term); }`,
    good: `#include <exception>
#include <cstdlib>
void term() { std::abort(); }
void f() { std::set_terminate(term); }`,
  },
  {
    key: "cert:OOP56-CPP",
    bad: `#include <new>
#include <cstdio>
void nh() { std::puts("out of memory"); }
void f() { std::set_new_handler(nh); }`,
    good: `#include <new>
extern char *reserve;
void nh() { if (reserve) { delete [] reserve; reserve = nullptr; return; } throw std::bad_alloc(); }
void f() { std::set_new_handler(nh); }`,
  },
  {
    key: "cert:OOP57-CPP",
    bad: `#include <cstring>
struct S { virtual void f(); int i; };
void g(S *s) { std::memset(s, 0, sizeof(S)); }`,
    good: `#include <cstring>
struct P { int i; double d; };
void g(P *p) { std::memset(p, 0, sizeof(P)); }`,
  },
  {
    key: "cert:OOP57-CPP",
    bad: `#include <cstring>
#include <cstdlib>
#include <string>
struct R { std::string name; };
bool eq(const R &a, const R &b) { return std::memcmp(&a, &b, sizeof(R)) == 0; }
R *mk() { return static_cast<R *>(std::malloc(sizeof(R))); }`,
    good: `#include <cstring>
#include <cstdlib>
struct R { int v[4]; };
bool eq(const R &a, const R &b) { return std::memcmp(&a, &b, sizeof(R)) == 0; }
R *mk() { return static_cast<R *>(std::malloc(sizeof(R))); }`,
  },
  {
    key: "cert:OOP58-CPP",
    bad: `class A { int *p; public: A(A &o) : p(o.p) { o.p = nullptr; } };`,
    good: `class A { int *p; public: A(const A &o) : p(new int(*o.p)) {} A(A &&o) noexcept : p(o.p) { o.p = nullptr; } };`,
  },
  {
    key: "cert:OOP58-CPP",
    bad: `class A { mutable int n; public: A &operator=(const A &o) { n = o.n; o.n = 0; return *this; } };`,
    good: `class A { int n; public: A &operator=(const A &o) { n = o.n; return *this; } };`,
  },
  // ---- cpp-con.js
  {
    key: "cert:CON50-CPP",
    bad: `#include <mutex>
#include <thread>
int counter;
void inc(std::mutex &m) { std::lock_guard<std::mutex> g(m); ++counter; }
void start() { std::mutex m; std::thread t(inc, std::ref(m)); t.detach(); }`,
    good: `#include <mutex>
#include <thread>
int counter;
std::mutex m;
void inc() { std::lock_guard<std::mutex> g(m); ++counter; }
void start() { std::thread t(inc); t.join(); }`,
  },
  {
    key: "cert:CON50-CPP",
    bad: `#include <mutex>
void f() { std::mutex m; m.lock(); }`,
    good: `#include <mutex>
void f() { std::mutex m; m.lock(); m.unlock(); }`,
  },
  {
    key: "cert:CON51-CPP",
    bad: `#include <mutex>
std::mutex m;
void work(int *p);
void f(int *p) { m.lock(); work(p); m.unlock(); }`,
    good: `#include <mutex>
std::mutex m;
void work(int *p);
int shared;
void f(int *p) { std::lock_guard<std::mutex> g(m); work(p); }
void h() { m.lock(); shared++; m.unlock(); }`,
  },
  {
    key: "cert:CON52-CPP",
    bad: `#include <thread>
struct MultiThreadedFlags { unsigned int flag1 : 2; unsigned int flag2 : 2; };
MultiThreadedFlags flags;
void f() { std::thread t1([]() { flags.flag1 = 1; }); std::thread t2([]() { flags.flag2 = 2; }); t1.join(); t2.join(); }`,
    good: `#include <thread>
#include <mutex>
struct MultiThreadedFlags { unsigned int flag1 : 2; unsigned int flag2 : 2; };
MultiThreadedFlags flags;
std::mutex fm;
void f() { std::thread t1([]() { std::lock_guard<std::mutex> g(fm); flags.flag1 = 1; }); std::thread t2([]() { std::lock_guard<std::mutex> g(fm); flags.flag2 = 2; }); t1.join(); t2.join(); }`,
  },
  {
    key: "cert:CON53-CPP",
    bad: `#include <mutex>
struct Bank { std::mutex m; int balance; };
void transfer(Bank *from, Bank *to, int amt) { std::lock_guard<std::mutex> a(from->m); std::lock_guard<std::mutex> b(to->m); from->balance -= amt; to->balance += amt; }`,
    good: `#include <mutex>
struct Bank { std::mutex m; int balance; };
void transfer(Bank *from, Bank *to, int amt) { std::scoped_lock lk(from->m, to->m); from->balance -= amt; to->balance += amt; }`,
  },
  {
    key: "cert:CON53-CPP",
    bad: `#include <mutex>
std::mutex ma, mb;
void f() { std::lock_guard<std::mutex> a(ma); std::lock_guard<std::mutex> b(mb); }
void g() { std::lock_guard<std::mutex> b(mb); std::lock_guard<std::mutex> a(ma); }`,
    good: `#include <mutex>
std::mutex ma, mb;
void f() { std::lock_guard<std::mutex> a(ma); std::lock_guard<std::mutex> b(mb); }
void g() { std::lock_guard<std::mutex> a(ma); std::lock_guard<std::mutex> b(mb); }
void h() { { std::lock_guard<std::mutex> b(mb); } std::lock_guard<std::mutex> a(ma); }`,
  },
  {
    key: "cert:CON54-CPP",
    bad: `#include <mutex>
#include <condition_variable>
std::mutex m; std::condition_variable cv; bool ready;
void consume() { std::unique_lock<std::mutex> lk(m); if (!ready) cv.wait(lk); }`,
    good: `#include <mutex>
#include <condition_variable>
std::mutex m; std::condition_variable cv; bool ready;
void consume() { std::unique_lock<std::mutex> lk(m); while (!ready) cv.wait(lk); }
void c2() { std::unique_lock<std::mutex> lk(m); cv.wait(lk, [] { return ready; }); }`,
  },
  {
    key: "cert:CON55-CPP",
    bad: `#include <mutex>
#include <condition_variable>
std::mutex m; std::condition_variable cv; unsigned long current;
void run_step(unsigned long my) { std::unique_lock<std::mutex> lk(m); while (current != my) cv.wait(lk); ++current; cv.notify_one(); }`,
    good: `#include <mutex>
#include <condition_variable>
std::mutex m; std::condition_variable cv; unsigned long current;
void run_step(unsigned long my) { std::unique_lock<std::mutex> lk(m); while (current != my) cv.wait(lk); ++current; cv.notify_all(); }
std::condition_variable cv2; bool ready;
void c() { std::unique_lock<std::mutex> lk(m); while (!ready) cv2.wait(lk); }
void p() { ready = true; cv2.notify_one(); }`,
  },
  {
    key: "cert:CON56-CPP",
    bad: `#include <mutex>
std::mutex m;
void f() { m.lock(); if (m.try_lock()) { m.unlock(); } m.unlock(); }`,
    good: `#include <mutex>
std::recursive_mutex rm;
std::mutex m;
void f() { rm.lock(); rm.lock(); rm.unlock(); rm.unlock(); m.lock(); m.unlock(); m.lock(); m.unlock(); }`,
  },
  {
    key: "cert:CON56-CPP",
    bad: `#include <mutex>
std::mutex m;
int data;
void helper() { std::lock_guard<std::mutex> g(m); data++; }
void outer() { std::lock_guard<std::mutex> g(m); helper(); }`,
    good: `#include <mutex>
std::mutex m;
int data;
void helper_locked() { data++; }
void helper() { std::lock_guard<std::mutex> g(m); helper_locked(); }
void outer() { std::lock_guard<std::mutex> g(m); helper_locked(); }`,
  },
  // ---- cpp-msc.js
  {
    key: "cert:MSC50-CPP",
    bad: `#include <cstdlib>
int roll() { return std::rand() % 6; }`,
    good: `#include <random>
int roll() { std::random_device rd; std::mt19937 g(rd()); std::uniform_int_distribution<int> d(1, 6); return d(g); }`,
  },
  {
    key: "cert:MSC51-CPP",
    bad: `#include <random>
unsigned f() { std::mt19937 engine; return engine(); }`,
    good: `#include <random>
unsigned f() { std::random_device dev; std::mt19937 engine(dev()); return engine(); }`,
  },
  {
    key: "cert:MSC51-CPP",
    bad: `#include <random>
#include <ctime>
unsigned f() { std::mt19937 a(42); std::default_random_engine b(std::time(nullptr)); return a() + b(); }`,
    good: `#include <random>
unsigned f() { std::random_device dev; std::seed_seq seq{dev(), dev(), dev()}; std::mt19937 a(seq); return a(); }`,
  },
  {
    key: "cert:MSC52-CPP",
    bad: `int sign(int x) { if (x > 0) return 1; if (x < 0) return -1; }`,
    good: `#include <stdexcept>
int sign(int x) { if (x > 0) return 1; if (x < 0) return -1; return 0; }
int pick(int x) { switch (x) { case 0: return 1; default: throw std::logic_error("x"); } }
int main() { }
int loop() { for (;;) { } }`,
  },
  {
    key: "cert:MSC53-CPP",
    bad: `#include <cstdlib>
[[noreturn]] void fatal(int code) { if (code > 0) std::exit(code); }`,
    good: `#include <cstdlib>
[[noreturn]] void fatal(int code) { if (code > 0) std::exit(code); std::abort(); }`,
  },
  {
    key: "cert:MSC54-CPP",
    bad: `#include <csignal>
volatile std::sig_atomic_t flag;
void handler(int) { flag = 1; }
void install() { std::signal(SIGINT, handler); }`,
    good: `#include <csignal>
volatile std::sig_atomic_t flag;
extern "C" void handler(int) { flag = 1; }
void install() { std::signal(SIGINT, handler); std::signal(SIGTERM, SIG_IGN); }`,
  },
  {
    key: "cert:MSC54-CPP",
    bad: `#include <csignal>
struct E {};
extern "C" void handler(int) { throw E(); }
void install() { std::signal(SIGINT, handler); std::signal(SIGTERM, [](int) {}); }`,
    good: `#include <csignal>
volatile std::sig_atomic_t flag;
extern "C" void handler(int s) { flag = s; }
void install() { signal(SIGINT, handler); }`,
  },
  {
    key: "cert:MSC52-CPP",
    bad: `int sign(int x) { if (x > 0) return 1; else if (x < 0) return -1; }`,
    good: `#include "missing/types.h"
namespace {
u32 readU32(const unsigned char *p) {
  return static_cast<u32>(p[0]) | (static_cast<u32>(p[1]) << 8);
}
}`,
  },

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
