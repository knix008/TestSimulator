module.exports = [
  { key: 'cert:ARR30-C', bad: `int a[4];\nint f(void){ return a[4]; }`, good: `int a[4];\nint f(void){ int *e = &a[4]; (void)e; return a[3]; }` },
  { key: 'cert:ARR30-C', bad: `void f(void){ int a[10]; for (int i = 0; i <= 10; i++) a[i] = 0; }`, good: `void f(void){ int a[10]; for (int i = 0; i < 10; i++) a[i] = 0; }` },
  { key: 'cert:ARR32-C', bad: `void f(int n){ int a[n]; a[0] = 1; }`, good: `void f(int n){ if (n <= 0 || n > 64) return; int a[n]; a[0] = 1; }` },
  { key: 'cert:ARR36-C', bad: `int a[4], b[4];\nlong f(void){ return &a[2] - &b[0]; }`, good: `int a[4];\nlong f(void){ return &a[3] - &a[0]; }` },
  { key: 'cert:ARR37-C', bad: `struct P { int x, y; };\nint f(struct P *p){ int *q = &p->x; return q[1]; }`, good: `int f(int *arr){ int *q = arr; return q[1]; }` },
  { key: 'cert:ARR38-C', bad: `#include <string.h>\nvoid f(void){ char d[8]; char s[16]; memcpy(d, s, 16); }`, good: `#include <string.h>\nvoid f(void){ char d[16]; char s[16]; memcpy(d, s, sizeof d); }` },
  { key: 'cert:ARR38-C', bad: `#include <string.h>\nvoid f(char *p){ memset(p, 0, sizeof(p)); }`, good: `#include <string.h>\nvoid f(char *p, unsigned n){ memset(p, 0, n); }` },
  { key: 'cert:ARR39-C', bad: `int f(int *p, int n){ return *(p + n * sizeof(int)); }`, good: `int f(int *p, int n){ return *(p + n); }` },
  { key: 'cert:ARR01-C', bad: 'void clear(int a[16]){ for (unsigned i = 0; i < sizeof(a) / sizeof(a[0]); i++) a[i] = 0; }', good: 'void clear(int a[], unsigned n){ int local[16]; for (unsigned i = 0; i < n && i < sizeof(local) / sizeof(local[0]); i++) a[i] = local[i]; }' },
];
