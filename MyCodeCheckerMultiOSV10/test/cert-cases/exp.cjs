module.exports = [
  { key: 'cert:EXP30-C', bad: `void f(int i, int *a) { i = i++ + 1; a[i] = i++; }`, good: `void f(int i, int *a) { i = i + 1; a[i] = i; i++; int j = i++ && i; (void)j; }` },
  { key: 'cert:EXP30-C', bad: `int g(int, int);
int f(int i) { return g(i++, i); }`, good: `int g(int, int);
int f(int i) { int a = i++; return g(a, i); }` },
  { key: 'cert:EXP30-C', bad: `struct n { struct n *next; };
void f(struct n *p, struct n *q) { p->next = p = q; }`, good: `struct n { struct n *next; };
void f(struct n *p, struct n *q, int *s, int *d) { p->next = q; p = q; *d++ = *s++; }` },
  { key: 'cert:EXP32-C', bad: `void f(void) { static volatile int **ipp; static int *ip; static volatile int i = 0; ipp = &ip; ipp = (int**)&ip; *ipp = &i; int *x = (int *)&i; (void)x; }`,
    good: `void f(void) { static volatile int i = 0; volatile int *p = &i; const volatile int *q = p; (void)q; }` },
  { key: 'cert:EXP33-C', bad: `int f(int n) { int sum; sum += n; return sum; }`, good: `int f(int n) { int sum; sum = 0; sum += n; return sum; }` },
  { key: 'cert:EXP33-C', bad: `int f(void) { int x; int y = x + 1; return y; }`, good: `#include <stdio.h>
#include <stdarg.h>
int f(int n, ...) { int x; va_list ap; va_start(ap, n); va_end(ap); if (scanf("%d", &x) != 1) return 0; return x; }
int g(int c) { int r; if (c) r = 1; else r = 2; return r; }` },
  { key: 'cert:EXP34-C', bad: `#include <stdlib.h>
#include <string.h>
void f(size_t n) { int *p = malloc(n * sizeof *p); p[0] = 1; char *s = malloc(10); strcpy(s, "x"); }`, good: `#include <stdlib.h>
#include <string.h>
void f(void) { int *p = malloc(sizeof *p); if (p == NULL) return; p[0] = 1; char *s = malloc(10); if (!s) { free(p); return; } strcpy(s, "x"); }` },
  { key: 'cert:EXP34-C', bad: `struct s { int v; };
int f(struct s *p) { if (p == 0) { return p->v; } return 0; }`, good: `struct s { int v; };
int f(struct s *p) { if (p == 0) { return 0; } return p->v; }
int g(struct s *p) { if (p != 0) { return p->v; } return -1; }` },
  { key: 'cert:EXP35-C', bad: `struct X { char a[8]; };
struct X salutation(void);
void f(void) { salutation().a[0] = 'h'; char *p = salutation().a; (void)p; }`, good: `struct X { char a[8]; };
struct X salutation(void);
void f(void) { struct X r = salutation(); r.a[0] = 'h'; char c = salutation().a[0]; (void)c; }` },
  { key: 'cert:EXP36-C', bad: `int f(char *c) { int *ip = (int *)c; return *ip; }`, good: `#include <string.h>
int f(char *c) { int i; memcpy(&i, c, sizeof i); char *b = (char *)&i; void *v = c; int *ok = (int *)v; return i + *b + *ok; }` },
  { key: 'cert:EXP37-C', bad: `int g(int a, int b);
int h();
int f(void) { return g(1) + h(1, 2); }`, good: `int g(int a, int b);
int h(void);
int k();
int k(int a) { return a; }
int f(void) { return g(1, 2) + h() + k(3); }` },
  { key: 'cert:EXP39-C', bad: `float f(int i) { return *(float *)&i; }
long g(double d) { long *p = (long *)&d; return *p; }`, good: `#include <string.h>
float f(int i) { float r; memcpy(&r, &i, sizeof r); unsigned char *b = (unsigned char *)&i; unsigned u = *(unsigned *)&i; return r + *b + u; }` },
  { key: 'cert:EXP40-C', bad: `const int vals[3] = { 3, 4, 5 };
void f(void) { int *p = (int *)vals; p[0] = 1; const int c = 2; *(int *)&c = 3; }`, good: `int vals[3] = { 3, 4, 5 };
void f(const int *in) { int *p = (int *)vals; p[0] = 1; const int c = 2; int x = *(int *)&c; (void)x; (void)in; }` },
  { key: 'cert:EXP42-C', bad: `#include <string.h>
struct s { char c; int i; };
int eq(const struct s *a, const struct s *b) { return memcmp(a, b, sizeof *a) == 0; }`, good: `#include <string.h>
struct s { int c; int i; };
struct t { char c; int i; };
int eq(const struct s *a, const struct s *b, const struct t *x, const struct t *y) { return memcmp(a, b, sizeof *a) == 0 && x->c == y->c && x->i == y->i; }` },
  { key: 'cert:EXP43-C', bad: `#include <string.h>
#include <stdio.h>
void f(char *p, int n) { memcpy(p, p + 4, 4); char buf[32]; sprintf(buf, "%s%d", buf, n); }`, good: `#include <string.h>
#include <stdio.h>
void f(char *p, char *q, int n) { memmove(p, p + 4, 4); memcpy(p, q, 4); char buf[32]; sprintf(buf, "%s%d", q, n); }` },
  { key: 'cert:EXP44-C', bad: `#include <stddef.h>
void f(void) { int a = 14; size_t b = sizeof(a++); (void)b; }`, good: `#include <stddef.h>
int g(void);
void f(void) { int a = 14; size_t b = sizeof(a); a++; size_t c = sizeof(g()); (void)b; (void)c; }` },
  { key: 'cert:EXP45-C', bad: `int f(int x, int y) { if (x = y) return 1; while (x = y - 1) y--; return 0; }`, good: `int g(void);
int f(int x, int y) { if ((x = y) != 0) return 1; if ((x = y)) return 2; int c; while ((c = g()) != -1) {} return x == y; }` },
  { key: 'cert:EXP46-C', bad: `int f(int a, int b) { if (a == 1 & b == 2) return 1; return (a < b) | (b > 3); }`, good: `int f(int a, int b) { if (a == 1 && b == 2) return 1; return (a & 4) | (b & 1); }` },
  { key: 'cert:EXP47-C', bad: `#include <stdarg.h>
int f(int n, ...) { va_list ap; va_start(ap, n); char c = va_arg(ap, char); float x = va_arg(ap, float); va_end(ap); return c + (int)x; }`, good: `#include <stdarg.h>
int f(int n, ...) { va_list ap; va_start(ap, n); int c = va_arg(ap, int); double x = va_arg(ap, double); va_end(ap); return c + (int)x; }` },
];
