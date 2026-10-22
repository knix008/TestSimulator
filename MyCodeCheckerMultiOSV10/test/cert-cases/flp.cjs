module.exports = [
  { key: 'cert:FLP30-C', bad: `void g(float);
void f(void) { for (float x = 0.1f; x <= 1.0f; x += 0.1f) g(x); }`, good: `void g(float);
void f(void) { for (int i = 1; i <= 10; i++) g(i / 10.0f); }` },
  { key: 'cert:FLP32-C', bad: `#include <math.h>
double f(double x) { return sqrt(x) + log(0.0) + acos(2.0); }`, good: `#include <math.h>
double f(double x) { if (x < 0.0) return 0.0; return sqrt(x) + log(1.0) + acos(0.5) + sqrt(fabs(x)); }` },
  { key: 'cert:FLP32-C', bad: `#include <math.h>
double f(void) { return pow(0.0, -1.0); }`, good: `#include <math.h>
double f(void) { return pow(2.0, -1.0) + pow(-2.0, 3.0); }` },
  { key: 'cert:FLP34-C', bad: `void f(void) { int i = 1e10; short s = (short)70000.0; (void)i; (void)s; }`, good: `void f(void) { int i = 1e9; short s = (short)7000.0; (void)i; (void)s; }` },
  { key: 'cert:FLP36-C', bad: `void f(long big) { float approx = big; float c = 16777217; (void)approx; (void)c; }`, good: `void f(int i) { double d = i; float c = 16777216; double e = 16777217; (void)d; (void)c; (void)e; }` },
  { key: 'cert:FLP37-C', bad: `#include <string.h>
struct S { int i; float f; };
int eq(const struct S *a, const struct S *b) { return memcmp(a, b, sizeof *a) == 0; }
int eqd(const double *a, const double *b) { return memcmp(a, b, sizeof *a) == 0; }`, good: `#include <string.h>
struct S { int i; int f; };
int eq(const struct S *a, const struct S *b) { return memcmp(a, b, sizeof *a) == 0; }` },
];
