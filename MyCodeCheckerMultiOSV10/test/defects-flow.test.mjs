// Path-defect pass (core/defects.js pathDefects): idioms of real C code that
// the line pass used to report, and the defects it must keep reporting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathDefects } from '../core/defects.js';

const run = (text, lang = 'c') => pathDefects(text, lang, `a.${lang}`, {});
const rules = (text, lang) => run(text, lang).map((f) => `${f.line}:${f.rule}`);
const none = (text, rule, lang) => {
  const hits = run(text, lang).filter((f) => f.rule === rule);
  assert.deepEqual(hits.map((f) => `${f.line}: ${f.message.en}`), [], `${rule} not expected`);
};
const has = (text, rule, line, lang) => {
  const hits = run(text, lang).filter((f) => f.rule === rule);
  assert.ok(hits.some((f) => f.line === line), `${rule} expected at ${line}; got ${JSON.stringify(rules(text, lang))}`);
};

test('UNREACHABLE: conditional returns, labels, #else and else branches are reachable', () => {
  none([
    'int f(char *s, int c)',
    '{',
    '    if (s == NULL)',
    '        return -1;',
    '    for (int i = 0; i < c; i++)',
    '        if (s[i] == 0)',
    '            return i;',
    '    if (c < 0)',
    '        goto fail;',
    '    return c;',
    'fail:',
    '    return -1;',
    '}',
    'int g(int c)',
    '{',
    '#ifdef FAST',
    '    return 1;',
    '#else',
    '    return c + 1;',
    '#endif',
    '}',
    'int h(int c)',
    '{',
    '    if (c) {',
    '        return 1;',
    '    } else {',
    '        c++;',
    '        return c;',
    '    }',
    '}',
  ].join('\n'), 'defect:UNREACHABLE');
  none('function b(x) {\n  return inner(x);\n  function inner(v) { return v + 1; }\n}\n', 'defect:UNREACHABLE', 'js');
  has('int u(int c)\n{\n    return c;\n    c++;\n}\n', 'defect:UNREACHABLE', 4);
});

test('USE_AFTER_FREE / DOUBLE_FREE: frees on another branch or before an exit, and reassigned pointers', () => {
  const code = [
    'void a(char *p, int c)',
    '{',
    '    if (c) {',
    '        free(p);',
    '    } else {',
    '        free(p);',
    '    }',
    '}',
    'void b(char *p, int c)',
    '{',
    '    switch (c) {',
    '    case 1:',
    '        free(p);',
    '        break;',
    '    case 2:',
    '        free(p);',
    '        break;',
    '    }',
    '}',
    'int c(int fd, char *buf)',
    '{',
    '    if (write(fd, buf, 1) != 1) {',
    '        close(fd);',
    '        return -1;',
    '    }',
    '    if (!buf[0]) { close(fd); return -2; }',
    '    while (read(fd, buf, 1) > 0) {',
    '        if (buf[0] == 0) { free(buf); break; }',
    '    }',
    '    close(fd);',
    '    return 0;',
    '}',
    'void d(void)',
    '{',
    '    char *p = malloc(4);',
    '    free(p);',
    '    p = malloc(8);',
    '    if (p) p[0] = 1;',
    '    free(p);',
    '    log_info("closed fd: %d, free(p) done", 1);',
    '}',
  ].join('\n');
  none(code, 'defect:DOUBLE_FREE');
  none(code, 'defect:USE_AFTER_FREE');
  has('void u(char *p)\n{\n    free(p);\n    p[0] = 1;\n}\n', 'defect:USE_AFTER_FREE', 4);
  has('void u(char *p, int c)\n{\n    if (c)\n        free(p);\n    p[0] = 1;\n}\n', 'defect:USE_AFTER_FREE', 5);
  has('void u(char *p)\n{\n    free(p);\n    free(p);\n}\n', 'defect:DOUBLE_FREE', 4);
});

test('RESOURCE_LEAK: memory kept in a global, a field or an out-parameter is not leaked', () => {
  const code = [
    'static char *g_buf;',
    'void a(void)',
    '{',
    '    g_buf = malloc(64);',
    '}',
    'int b(struct obj *o, int n)',
    '{',
    '    char *p = malloc(n);',
    '    if (p == NULL) return -1;',
    '    o->buf = p;',
    '    return 0;',
    '}',
    'int c(FILE **out)',
    '{',
    '    FILE *f = fopen("x", "r");',
    '    if (!f) return -1;',
    '    *out = f;',
    '    return 0;',
    '}',
    'void d(struct list *l)',
    '{',
    '    struct node *n = malloc(sizeof *n);',
    '    if (!n) return;',
    '    list_add(l, n);',
    '}',
  ].join('\n');
  none(code, 'defect:RESOURCE_LEAK');
  // The pointer is tested in `if (!p) return -1;`, not returned: still a leak.
  has('int e(int n)\n{\n    char *p = malloc(n);\n    if (!p) return -1;\n    memset(p, 0, n);\n    return 0;\n}\n', 'defect:RESOURCE_LEAK', 7);
});

test('NULL_RETURNS: null checks with an exit, sizeof and short-circuit tests are guards', () => {
  const code = [
    'void a(struct node **head)',
    '{',
    '    struct node *n = malloc(sizeof *n);',
    '    if (!n) return;',
    '    n->next = *head;',
    '}',
    'int b(size_t kl, size_t vl)',
    '{',
    '    char *k = malloc(kl);',
    '    char *v = malloc(vl);',
    '    if (!k || !v) { free(k); free(v); return -1; }',
    '    k[0] = v[0] = 0;',
    '    return 0;',
    '}',
    'int c(int len)',
    '{',
    '    char *t = malloc(len);',
    '    if (t == NULL)',
    '    {',
    '        printf("no memory\\n");',
    '        return 0;',
    '    }',
    '    t[0] = 1;',
    '    char *u = malloc(len);',
    '    if (u && u[0]) return 1;',
    '    return 0;',
    '}',
  ].join('\n');
  none(code, 'defect:NULL_RETURNS');
  has('void u(void)\n{\n    char *q = malloc(4);\n    q[0] = 1;\n}\n', 'defect:NULL_RETURNS', 4);
});

test('FORWARD_NULL: the else branch of a null test is not the null path', () => {
  none('int f(struct s *p)\n{\n    int x;\n    if (p == NULL) {\n        x = 0;\n    } else {\n        x = p->n;\n    }\n    return x;\n}\n', 'defect:FORWARD_NULL');
  has('int f(struct s *p)\n{\n    if (p == NULL) {\n        p->n = 1;\n    }\n    return 0;\n}\n', 'defect:FORWARD_NULL', 4);
});

test('UNINIT: struct members, block comments and member reads are not uninitialized locals', () => {
  const code = [
    'struct rx {',
    '    char *buf;',
    '    size_t len;',
    '};',
    '/* rx_pull: up to (cap - len - 1) bytes',
    ' *   9 = door; int pin;',
    ' */',
    'int f(struct rx *r)',
    '{',
    '    int len;',
    '    len = r->len;',
    '    return len;',
    '}',
    'int g(struct rx *r)',
    '{',
    '    int len;',
    '    if (r->len > sizeof len) return 0;',
    '    len = 1;',
    '    return len;',
    '}',
  ].join('\n');
  none(code, 'defect:UNINIT');
  has('int u(void)\n{\n    int v;\n    return v + 1;\n}\n', 'defect:UNINIT', 4);
});

test('DIVIDE_BY_ZERO, LOCK: fractions, regex literals, comments and lock helpers', () => {
  none('double h(double x) { return x / 0.5; }\n/* a / 0 in a comment\n * x / 0 */\nconst char *p = "a / 0";\n', 'defect:DIVIDE_BY_ZERO');
  none('function c(s) { return s.split(/0/); }\n', 'defect:DIVIDE_BY_ZERO', 'js');
  has('int d(int n) { return n / 0; }\n', 'defect:DIVIDE_BY_ZERO', 1);
  none('void queue_lock(struct q *q)\n{\n    pthread_mutex_lock(&q->mu);\n}\n', 'defect:LOCK', 'c');
  none('void f(std::weak_ptr<A> w)\n{\n    auto sp = w.lock();\n    if (sp) sp->run();\n}\n', 'defect:LOCK', 'cpp');
  has('int g(int a)\n{\n    pthread_mutex_lock(&mu);\n    a++;\n    return a;\n}\n', 'defect:LOCK', 6);
});
