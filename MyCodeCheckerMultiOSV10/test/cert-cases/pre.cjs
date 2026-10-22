module.exports = [
  { key: 'cert:PRE30-C', bad: `#define assign(uc1, uc2, val) uc1##uc2 = val
void f(void) { int \\u0401 = 0; assign(\\u04, 01, 4); }`, good: `#define assign(uc1, uc2, val) uc1##uc2 = val
void f(void) { int ab = 0; assign(a, b, 4); }` },
  { key: 'cert:PRE31-C', bad: `#define ABS(x) (((x) < 0) ? -(x) : (x))
int f(int n) { return ABS(n++); }`, good: `#define ABS(x) (((x) < 0) ? -(x) : (x))
#define TWICE(x) ((x) * 2)
int f(int n) { int m = ABS(n); n++; return m + TWICE(n++); }` },
  { key: 'cert:PRE31-C', bad: `#include <assert.h>
void f(int i) { assert(i++ > 0); }`, good: `#include <assert.h>
void f(int i) { assert(i > 0); i++; }` },
  { key: 'cert:PRE32-C', bad: `#define CALL(a, b) ((a) + (b))
int g(int q) { return CALL(1,
#ifdef X
  q
#else
  2
#endif
  ); }`, good: `#define CALL(a, b) ((a) + (b))
int g(int q) {
#ifdef X
  return CALL(1, q);
#else
  return CALL(1, 2);
#endif
}` },
  { key: 'cert:PRE00-C', bad: `#define CUBE(x) ((x) * (x) * (x))
int f(int a) { return CUBE(a); }`, good: `#define STR(x) #x
#define FIELD(s, m) ((s).m)
#define SWAP(a, b) do { int t = a; a = b; b = t; } while (0)
static inline int cube(int x) { return x * x * x; }` },
  { key: 'cert:PRE01-C', bad: `#define CUBE(x) (x * x * x)
int f(int a) { return CUBE(a + 1); }`, good: `#define CUBE(x) ((x) * (x) * (x))
#define CALLF(f, a) f(a, 1)
#define FIELD(s) ((s).len)
#define DECL(T, n) T n
int f(int a) { return CUBE(a + 1); }` },
  { key: 'cert:PRE02-C', bad: `#define SUM 1 + 2
#define DIFF(a, b) (a) - (b)
int f(void) { return SUM * DIFF(3, 4); }`, good: `#define SUM (1 + 2)
#define DIFF(a, b) ((a) - (b))
#define PTR_T int *
#define NEG -1
#define CALLX(a) f2((a), 2)
int f(void) { return SUM * DIFF(3, 4) * NEG; }` },
];
