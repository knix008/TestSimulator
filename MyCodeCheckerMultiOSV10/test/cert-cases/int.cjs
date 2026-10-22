module.exports = [
  { key: 'cert:INT30-C', bad: `#include <limits.h>
unsigned f(void) { return UINT_MAX + 1u; }`, good: `#include <limits.h>
unsigned f(void) { unsigned m = -1u; return UINT_MAX - 1u + m; }` },
  { key: 'cert:INT30-C', bad: `#include <stdlib.h>
int *f(size_t n) { return malloc(n * sizeof(int)); }`, good: `#include <stdlib.h>
#include <stdint.h>
int *f(size_t n) { if (n > SIZE_MAX / sizeof(int)) return NULL; return malloc(n * sizeof(int)); }
int *g(void) { return malloc(16 * sizeof(int)); }` },
  { key: 'cert:INT31-C', bad: `#include <string.h>
void f(char *p) { unsigned char c = 300; memset(p, 0, -1); (void)c; }`, good: `#include <string.h>
void f(char *p) { unsigned char c = 255; unsigned all = -1; memset(p, 0, 4); (void)c; (void)all; }` },
  { key: 'cert:INT31-C', bad: `int f(unsigned u) { return u > -1; }`, good: `int f(unsigned u, int i) { return u > 1 && i > -1; }` },
  { key: 'cert:INT32-C', bad: `#include <limits.h>
int f(void) { return INT_MAX + 1; }
int g(void) { return -INT_MIN; }`, good: `#include <limits.h>
int f(void) { return INT_MAX - 1; }
long g(void) { return -(long)INT_MIN; }` },
  { key: 'cert:INT32-C', bad: `#include <stdlib.h>
#include <limits.h>
int f(void) { return abs(INT_MIN); }`, good: `#include <stdlib.h>
#include <limits.h>
int f(void) { return abs(INT_MIN + 1); }` },
  { key: 'cert:INT33-C', bad: `int f(int a) { return a / 0; }
int g(int a, int b) { return a % b; }`, good: `int f(int a) { return a / 2; }
int g(int a, int b) { if (b == 0) return 0; return a % b; }
int h(int a, int b) { return b != 0 ? a / b : 0; }
double d(double a, double b) { return a / b; }` },
  { key: 'cert:INT34-C', bad: `unsigned f(unsigned x) { return x << 32; }
int g(int x) { return x >> -1; }
int h(void) { return -1 << 2; }`, good: `unsigned f(unsigned x) { return x << 31; }
unsigned long g(unsigned long x) { return x << 40; }` },
  { key: 'cert:INT35-C', bad: `#include <limits.h>
unsigned f(unsigned x, unsigned e) { if (e >= sizeof(unsigned) * CHAR_BIT) return 0; return x << e; }`, good: `#include <limits.h>
char buf[sizeof(unsigned) * CHAR_BIT + 1];
unsigned f(unsigned x, unsigned e) { if (e >= 32) return 0; return x << e; }` },
  { key: 'cert:INT36-C', bad: `void f(void *p) { int i = (int)p; unsigned int *ptr = 0xdeadbeef; (void)i; (void)ptr; }`, good: `#include <stdint.h>
void f(void *p) { uintptr_t i = (uintptr_t)p; unsigned int *ptr = (unsigned int *)0xdeadbeef; int *n = 0; (void)i; (void)ptr; (void)n; }` },
  { key: 'cert:INT07-C', bad: `int f(void) { char c = 200; int i = 1000; return i / c; }`, good: `int f(void) { unsigned char c = 200; char z = 'a'; char t = 0; int i = 1000; return i / c + z + t; }` },
  // regression: sizeof of an unresolved type and macros from missing headers
  { key: 'cert:INT33-C',
    bad: `int f(int a) { return a / 0; }`,
    good: `#include "missing/ec.h"
int f(unsigned long num, EC_POINT *pre) { return num >= ((unsigned long)-1) / sizeof(pre[0]); }` },
  { key: 'cert:INT34-C',
    bad: `int f(int a) { return a << 40; }`,
    good: `#include "missing/stdint_like.h"
int big(unsigned long long n) { return n > (UINT64_C(1) << 61); }` },
  { key: 'cert:INT36-C',
    bad: `char *f(long v) { char *p = v; return p; }`,
    good: `#include "missing/pixbuf.h"
void f(void *img, int j, int stride) { unsigned char *dst = get_pixels(img) + j * stride; dst[0] = 0; }` },
];
