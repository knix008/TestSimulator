// absint audit: idioms of real C code the interpreter used to report wrongly
// (non-relational ranges, loops over one allocation site, defensive enum
// defaults, stub definitions, zero-filled buffers, missing headers), next to
// the defects that must stay reported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const absint = require('../core/absint');

function analyze(files) {
  const list = (typeof files === 'string' ? [{ path: 'a.c', text: files }] : files).map((f) => ({ lang: 'c', ...f }));
  return absint.analyze(list, { inactive: new Set(), root: null, options: {}, stats: {} });
}
const of = (found, checker) => found.filter((f) => f.rule === `absint:${checker}`);
const none = (code, checker) => {
  const hits = of(analyze(code), checker);
  assert.deepEqual(hits.map((f) => `${f.line}: ${f.message.en}`), [], `${checker} not expected`);
};
const some = (code, checker) => {
  const hits = of(analyze(code), checker);
  assert.ok(hits.length > 0, `${checker} expected`);
  return hits;
};

const HDR = '#include <stddef.h>\n#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n#include <sys/types.h>\n#include <sys/socket.h>\n';

test('OVERRUN: a size that shrinks as the offset grows ends at a fixed place', () => {
  none(`${HDR}
int rd(int fd)
{
    char resp[1024];
    size_t used = 0;
    char *term = NULL;
    while (used < sizeof(resp) - 1) {
        ssize_t r = recv(fd, resp + used, sizeof(resp) - 1 - used, 0);
        if (r <= 0) return -1;
        used += (size_t)r;
        resp[used] = '\\0';
        if ((term = strstr(resp, "\\r\\n\\r\\n")) != NULL) break;
    }
    return term ? (int)(term - resp) : -2;
}
void cat(const char *uid)
{
    char who[160];
    strcpy(who, "x");
    size_t wlen = strlen(who);
    snprintf(who + wlen, sizeof(who) - wlen, "  /  %s", uid);
    puts(who);
}`, 'OVERRUN');
  const hits = some(`${HDR}
int bad(int fd)
{
    char b[64];
    size_t used = 10;
    snprintf(b + used, 100 - used, "%d", fd);
    return b[0];
}`, 'OVERRUN');
  assert.equal(hits[0].confidence, 'definite');
});

test('OVERRUN: a possible overrun says so in its message', () => {
  const hits = of(analyze(`
void f(int i)
{
    int a[10];
    if (i >= 0 && i < 12) a[i] = 0;
}`), 'OVERRUN');
  assert.ok(hits.length > 0);
  for (const h of hits.filter((x) => x.confidence === 'possible')) assert.match(h.message.en, /^Possibly overrunning .* up to /);
});

test('USE_AFTER_FREE: growing one buffer with realloc in a loop', () => {
  none(`${HDR}
int grow(const char *src, size_t n, char **body)
{
    char *out = NULL;
    size_t out_len = 0, out_cap = 0, pos = 0;
    while (pos < n) {
        size_t size = 16;
        if (out_len + size + 1 > out_cap) {
            size_t nc = out_cap ? out_cap : 4096;
            while (nc < out_len + size + 1) nc *= 2;
            char *nb = (char *)realloc(out, nc);
            if (!nb) { free(out); return -1; }
            out = nb;
            out_cap = nc;
        }
        memcpy(out + out_len, src + pos, size);
        out_len += size;
        pos += size;
    }
    if (out) out[out_len] = '\\0';
    *body = out;
    return 0;
}`, 'USE_AFTER_FREE');
  some(`${HDR}
void g(void)
{
    char *p = malloc(4);
    if (!p) return;
    char *q = realloc(p, 10);
    if (!q) { free(p); return; }
    p[0] = 1;
    free(q);
}`, 'USE_AFTER_FREE');
});

test('DEADCODE: a C enum may hold other values; stubs and weak definitions are not the only body', () => {
  none(`
typedef enum { K_A = 1, K_B = 2, K_C = 3 } Kind;
void use(int);
void set_mode(Kind k)
{
    int idx = (k == K_A) ? 1 : (k == K_B) ? 2 : (k == K_C) ? 3 : 0;
    if (idx == 0) return;
    use(idx);
}`, 'DEADCODE');
  const caller = 'int discover(int b);\nvoid log_w(int);\nint scan(int b)\n{\n    int n = discover(b);\n    if (n < 0) {\n        log_w(n);\n        n = 0;\n    }\n    return n;\n}\n';
  // the weak default and the real definition (another build configuration)
  assert.deepEqual(of(analyze([
    { path: 'a_stub.c', text: 'int discover(int b) { (void)b; return 0; }\n' },
    { path: 'use.c', text: caller },
    { path: 'z_real.c', text: 'int hw(int);\nint discover(int b) { if (b < 0) return -1; return hw(b); }\n' },
  ]), 'DEADCODE'), []);
  none(`__attribute__((weak)) int discover(int b) { (void)b; return 0; }\n${caller}`, 'DEADCODE');
  // the only definition seen, in another file: a batch or configuration may lack the real one
  assert.deepEqual(of(analyze([
    { path: 'stub.c', text: 'int discover(int b) { (void)b; return 0; }\n' },
    { path: 'use.c', text: caller },
  ]), 'DEADCODE'), []);
  // one definition in the same file: its result really is never negative
  some(`int discover(int b) { (void)b; return 0; }\n${caller}`, 'DEADCODE');
});

test('STRING_NULL: a read that stops before the zero-filled end keeps the buffer terminated', () => {
  none(`${HDR}
int f(FILE *kf)
{
    char kbuf[256] = {0};
    size_t nr = fread(kbuf, 1, sizeof(kbuf) - 1, kf);
    if (nr > 0 && strstr(kbuf, "k")) return 1;
    return 0;
}`, 'STRING_NULL');
  some(`${HDR}
int g(FILE *kf)
{
    char kbuf[256] = {0};
    size_t nr = fread(kbuf, 1, sizeof(kbuf), kf);
    if (nr > 0 && strstr(kbuf, "k")) return 1;
    return 0;
}`, 'STRING_NULL');
});

test('RESOURCE_LEAK: the null branch of a NULL test leaks nothing, even without the header defining NULL', () => {
  none(`
void *malloc(unsigned long);
void free(void *);
int printf(const char *, ...);
int f(int n)
{
    char *p;
    p = malloc(n);
    if (p == NULL)
    {
        printf("no memory");
        return 0;
    }
    p[0] = 1;
    free(p);
    return 1;
}`, 'RESOURCE_LEAK');
});

test('UNUSED_VALUE: a value dropped by leaving the loop is "not used", unresolved constants are defensive', () => {
  const hits = some(`
int get(int *);
void put(long);
int run(void)
{
    long total = -1;
    int ok = 0;
    for (;;) {
        int got = 0;
        int status = get(&got);
        if (status == 200) { put(got); total = got; ok = 1; break; }
        if (status == 206) { if (total < 0) total = got; continue; }
        break;
    }
    return ok;
}`, 'UNUSED_VALUE');
  const drop = hits.find((h) => /total/.test(h.message.en) && /\bgot\b/.test(h.message.en));
  assert.ok(drop, JSON.stringify(hits.map((h) => h.message.en)));
  assert.match(drop.message.en, /is not used/);
  none(`
int step(void);
int run(void)
{
    int err = MPG123_OK;
    err = step();
    return err;
}`, 'UNUSED_VALUE');
});
