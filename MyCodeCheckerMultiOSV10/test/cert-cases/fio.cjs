module.exports = [
  { key: 'cert:FIO30-C', bad: `#include <stdio.h>\nvoid f(const char *user){ printf(user); }`, good: `#include <stdio.h>\n#include <stdarg.h>\nstatic const char FMT[] = "%s\\n";\nvoid f(const char *user){ printf("%s", user); printf(FMT, user); }\nvoid logf2(const char *fmt, ...){ va_list ap; va_start(ap, fmt); vfprintf(stderr, fmt, ap); va_end(ap); }` },
  { key: 'cert:FIO30-C', bad: `#include <stdio.h>\nvoid f(char *buf, const char *msg){ fprintf(stderr, msg); snprintf(buf, 10, msg); }`, good: `#include <stdio.h>\nvoid f(char *buf, int e){ const char *fmt = e ? "err %d\\n" : "ok %d\\n"; fprintf(stderr, fmt, e); snprintf(buf, 10, "%d", e); }` },
  { key: 'cert:FIO32-C', bad: `#include <stdio.h>\nint main(int argc, char **argv){ FILE *f = fopen(argv[1], "r"); if (f) fclose(f); return 0; }`, good: `#include <stdio.h>\nint main(void){ FILE *f = fopen("data.txt", "r"); if (f) fclose(f); return 0; }` },
  { key: 'cert:FIO34-C', bad: `#include <stdio.h>\nvoid f(FILE *fp){ char c; while ((c = fgetc(fp)) != EOF) putchar(c); }`, good: `#include <stdio.h>\nvoid f(FILE *fp){ int c; while ((c = fgetc(fp)) != EOF) putchar(c); }` },
  { key: 'cert:FIO37-C', bad: `#include <stdio.h>\n#include <string.h>\nvoid f(void){ char buf[64]; if (fgets(buf, sizeof buf, stdin)) buf[strlen(buf) - 1] = '\\0'; }`, good: `#include <stdio.h>\n#include <string.h>\nvoid f(void){ char buf[64]; if (fgets(buf, sizeof buf, stdin)) { char *p = strchr(buf, '\\n'); if (p) *p = '\\0'; } }` },
  { key: 'cert:FIO38-C', bad: `#include <stdio.h>\nvoid f(void){ FILE my = *stdout; (void)my; }`, good: `#include <stdio.h>\nvoid f(void){ FILE *my = stdout; (void)my; }` },
  { key: 'cert:FIO39-C', bad: `#include <stdio.h>\nvoid f(FILE *fp, char *b){ fputs("x", fp); fgets(b, 10, fp); }`, good: `#include <stdio.h>\nvoid f(FILE *fp, char *b){ fputs("x", fp); fseek(fp, 0L, SEEK_SET); fgets(b, 10, fp); }` },
  { key: 'cert:FIO40-C', bad: `#include <stdio.h>\nvoid f(FILE *fp){ char buf[32]; if (fgets(buf, sizeof buf, fp) == NULL) { } puts(buf); }`, good: `#include <stdio.h>\nvoid f(FILE *fp){ char buf[32]; if (fgets(buf, sizeof buf, fp) == NULL) { buf[0] = '\\0'; } puts(buf); }` },
  { key: 'cert:FIO41-C', bad: `#include <stdio.h>\nint f(const char *n){ return getc(fopen(n, "r")); }`, good: `#include <stdio.h>\nint f(FILE *fp){ return getc(fp); }` },
  { key: 'cert:FIO42-C', bad: `#include <stdio.h>\nint f(const char *n){ FILE *fp = fopen(n, "r"); if (!fp) return -1; return fgetc(fp); }`, good: `#include <stdio.h>\nint f(const char *n){ FILE *fp = fopen(n, "r"); if (!fp) return -1; int c = fgetc(fp); fclose(fp); return c; }\nFILE *g(const char *n){ FILE *fp = fopen(n, "r"); return fp; }` },
  { key: 'cert:FIO44-C', bad: `#include <stdio.h>\n#include <string.h>\nvoid f(FILE *fp){ fpos_t pos; memset(&pos, 0, sizeof pos); fsetpos(fp, &pos); }`, good: `#include <stdio.h>\nvoid f(FILE *fp){ fpos_t pos; if (fgetpos(fp, &pos) == 0) fsetpos(fp, &pos); }` },
  { key: 'cert:FIO45-C', bad: `#include <stdio.h>\n#include <unistd.h>\nFILE *f(const char *path){ if (access(path, W_OK) == 0) return fopen(path, "w"); return NULL; }`, good: `#include <stdio.h>\nFILE *f(const char *path){ return fopen(path, "wx"); }` },
  { key: 'cert:FIO46-C', bad: `#include <stdio.h>\nvoid f(FILE *fp){ fclose(fp); fputs("x", fp); }`, good: `#include <stdio.h>\nvoid f(FILE *fp){ fclose(fp); fp = NULL; }` },
  { key: 'cert:FIO47-C', bad: `#include <stdio.h>\nvoid f(int n){ printf("%d %s\\n", n); }`, good: `#include <stdio.h>\nvoid f(int n, const char *s, double d){ printf("%d %s %5.2f %*d %%\\n", n, s, d, 4, n); }` },
  { key: 'cert:FIO47-C', bad: `#include <stdio.h>\nvoid f(int n){ printf("%s\\n", n); printf("%d\\n", 1.5); }`, good: `#include <stdio.h>\nvoid f(long n, void *p){ printf("%ld %p %c\\n", n, p, 'x'); }` },
  { key: 'cert:FIO21-C', bad: `#include <stdio.h>\nvoid f(void){ char n[L_tmpnam]; if (tmpnam(n)) { FILE *f = fopen(n, "w"); if (f) fclose(f); } FILE *g = fopen("/tmp/app.log", "w"); if (g) fclose(g); }`, good: `#include <stdlib.h>\n#include <unistd.h>\nvoid f(void){ char t[] = "/home/me/.app/XXXXXX"; int fd = mkstemp(t); if (fd >= 0) close(fd); }` },
  // regression: the type of a call to a function from a missing header is unknown
  { key: 'cert:FIO47-C',
    bad: `#include <stdio.h>
void f(const char *s) { printf("%d\\n", s); }`,
    good: `#include <stdio.h>
#include "sndfile_missing.h"
void f(const char *path) { fprintf(stderr, "open '%s': %s\\n", path, sf_strerror(NULL)); }` },
];
