module.exports = [
  {
    key: 'cert:MSC24-C',
    bad: `#include <stdio.h>
#include <stdlib.h>
int f(const char *s, FILE *fp) { rewind(fp); setbuf(fp, NULL); return atoi(s); }`,
    good: `#include <stdio.h>
#include <stdlib.h>
long f(const char *s, FILE *fp) { char *e; if (fseek(fp, 0L, SEEK_SET) != 0) return -1; clearerr(fp); return strtol(s, &e, 10); }`,
  },
  {
    key: 'cert:MSC30-C',
    bad: `#include <stdlib.h>
int token(void) { return rand() % 1000; }`,
    good: `#include <stdlib.h>
int token(void) { return (int)(arc4random() % 1000); }`,
  },
  {
    key: 'cert:MSC32-C',
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
    key: 'cert:MSC32-C',
    bad: `#include <stdlib.h>
long next(void) { return random(); }`,
    good: `#include <stdlib.h>
long next(unsigned s) { srandom(s); return random(); }`,
  },
  {
    key: 'cert:MSC32-C',
    bad: `#include <stdlib.h>
long next(void) { srandom(42); return random(); }`,
    good: `#include <stdlib.h>
#include <unistd.h>
long next(void) { unsigned s; if (getentropy(&s, sizeof s) != 0) return 0; srandom(s); return random(); }`,
  },
  {
    key: 'cert:MSC33-C',
    bad: `#include <time.h>
char *show(struct tm *t) { return asctime(t); }`,
    good: `#include <time.h>
size_t show(char *buf, size_t n, const struct tm *t) { return strftime(buf, n, "%c", t); }`,
  },
  {
    key: 'cert:MSC37-C',
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
    key: 'cert:MSC38-C',
    bad: `#include <assert.h>
typedef void (*handler_t)(int);
void f(handler_t h) { h(1); }
void g(void) { f(assert); }`,
    good: `#include <assert.h>
void g(int x) { assert(x > 0); }`,
  },
  {
    key: 'cert:MSC38-C',
    bad: `#include <errno.h>
#undef errno
extern int errno;`,
    good: `#include <errno.h>
int last(void) { return errno; }`,
  },
  {
    key: 'cert:MSC39-C',
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
    key: 'cert:MSC40-C',
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
    key: 'cert:MSC41-C',
    bad: `#include <string.h>
static const char *db_password = "hunter2!";
int login(const char *password) { return strcmp(password, "s3cr3tPw") == 0; }`,
    good: `#include <string.h>
#include <stdlib.h>
static const char *password_prompt = "Enter password:";
int login(const char *password) { const char *expected = getenv("APP_PASSWORD"); return expected && strcmp(password, expected) == 0; }`,
  },
  {
    key: 'cert:MSC41-C', lang: 'cpp',
    bad: `#define API_KEY "AKIA1234567890XYZ"
const char *conn = "host=db user=app password=Tr0ub4dor";`,
    good: `#define API_KEY_ENV "APP_API_KEY"
const char *conn = "host=db user=app";`,
  },
  // regression: settings keys and placeholder markers are not secrets
  { key: 'cert:MSC41-C',
    bad: `const char *password = "hunter2xyz";`,
    good: `#define KEY_SAVE_PASS "save_password"
#define PREF_TOKEN "auth.token"
const char *token = "__PW_FD__";` },
];
