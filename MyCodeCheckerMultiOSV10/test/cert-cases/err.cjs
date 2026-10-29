module.exports = [
  {
    key: 'cert:ERR30-C',
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
    key: 'cert:ERR30-C',
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
    key: 'cert:ERR30-C',
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
    key: 'cert:ERR32-C',
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
    key: 'cert:ERR33-C',
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
    key: 'cert:ERR33-C', lang: 'cpp',
    bad: `#include <cstdio>
void f() { std::FILE *fp = std::fopen("a", "r"); std::fclose(fp); }`,
    good: `#include <cstdio>
void f() { std::FILE *fp = std::fopen("a", "r"); if (!fp) return; std::fclose(fp); }`,
  },
  {
    key: 'cert:ERR34-C',
    bad: `#include <stdlib.h>
#include <stdio.h>
int f(const char *s) { int a = atoi(s); long b; sscanf(s, "%ld", &b); return a + (int)b; }`,
    good: `#include <stdlib.h>
#include <errno.h>
long f(const char *s) { char *end; errno = 0; long v = strtol(s, &end, 10); if (end == s || errno == ERANGE) return 0; return v; }`,
  },
  {
    // A field width small enough for the type cannot overflow: '%4d' reads at most 9999.
    key: 'cert:ERR34-C',
    bad: `#include <stdio.h>
int f(const char *s, int *y, int *m) { return sscanf(s, "%4d-%12d", y, m) == 2; }`,
    good: `#include <stdio.h>
int f(const char *s, int *y, int *m, int *d) { return sscanf(s, "%4d-%2d-%2d", y, m, d) == 3; }`,
  },
];
