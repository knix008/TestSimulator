// Header languages (a '.h' header is C, C++ or both: core/cfamily/hlang.js),
// the C/C++ engines keeping to their own language, and parsing code whose
// macro definitions are in headers that are not part of the project.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { analyzeSources } from '../core/analyze.js';

const require = createRequire(import.meta.url);
const cfront = require('../core/cfront.js');
const cf = require('../core/cfamily');
const hlang = require('../core/cfamily/hlang.js');
const misraC = require('../core/misra-c');
const misraCpp = require('../core/misra-cpp');
const legacy = require('../core/misra-legacy');

const withLang = (files) => files.map((f) => ({ ...f, lang: /\.(c|h)$/.test(f.path) ? 'c' : 'cpp' }));
const ctx = () => ({ inactive: new Set(), root: null, options: {} });
const errorsOf = (unit) => unit.diagnostics.filter((d) => d.severity === 'error');

const CPP_HEADER = [
  '#ifndef CAMERA_EXCEPTIONS_H', '#define CAMERA_EXCEPTIONS_H',
  'namespace camera {',
  'class CameraError : public Base {',
  'public:',
  '  explicit CameraError(const Message &what);',
  '  int code() const;',
  '};',
  '}',
  '#endif', '',
].join('\n');

const C_HEADER = [
  '#ifndef PROTOCOL_H', '#define PROTOCOL_H',
  'struct __attribute__((packed)) frame { unsigned char type; unsigned short len; };',
  'int protocol_send(const struct frame *f);',
  '#endif', '',
].join('\n');

// ---------------------------------------------------------------- the decision

test('a header only C++ units include is C++, one only C units include is C, and one both include is both', () => {
  const langs = cfront.headerLanguages(withLang([
    { path: 'inc/only_cpp.h', text: 'int f(int x);\n' },
    { path: 'inc/only_c.h', text: 'int g(int x);\n' },
    { path: 'inc/shared.h', text: 'int h(int x);\n' },
    { path: 'inc/nested.h', text: 'int k(int x);\n' },
    { path: 'inc/via.h', text: '#include "nested.h"\n' },
    { path: 'src/a.cpp', text: '#include "../inc/only_cpp.h"\n#include "../inc/shared.h"\n#include "../inc/via.h"\n' },
    { path: 'src/b.c', text: '#include "../inc/only_c.h"\n#include "../inc/shared.h"\n' },
  ]));
  assert.equal(langs.get('inc/only_cpp.h'), 'cpp');
  assert.equal(langs.get('inc/only_c.h'), 'c');
  assert.equal(langs.get('inc/shared.h'), 'both');
  assert.equal(langs.get('inc/nested.h'), 'cpp', 'transitive includes count');
  assert.equal(langs.get('inc/via.h'), 'cpp');
});

test('C++-only syntax outside #ifdef __cplusplus makes a header C++, guarded syntax does not', () => {
  const cpp = (text) => hlang.scanFile(text).cppSyntax;
  assert.equal(cpp(CPP_HEADER), true);
  assert.equal(cpp('template <typename T> T max(T a, T b);\n'), true);
  assert.equal(cpp('void f(const std::string &s);\n'), true);
  assert.equal(cpp('struct S { int a; };\nbool operator==(S a, S b);\n'), true);
  assert.equal(cpp('#include <vector>\n'), true);
  assert.equal(cpp(C_HEADER), false);
  assert.equal(cpp([
    '#ifdef __cplusplus', 'extern "C" {', '#endif',
    'int c_api(int x);',
    '#ifdef __cplusplus', '}', 'namespace wrap { inline int api(int x) { return ::c_api(x); } }', '#endif', '',
  ].join('\n')), false, 'C++ inside #ifdef __cplusplus is for C++ readers only');
  assert.equal(cpp('#if defined(__cplusplus) && __cplusplus >= 201103L\ntemplate <class T> struct X {};\n#else\nstruct X { int v; };\n#endif\n'), false);
  assert.equal(cpp('#ifndef __cplusplus\ntypedef int bool_t;\n#else\nclass Shim { public: int v; };\n#endif\n'), false);
  assert.equal(cpp('/* class Foo : public Bar { }; */\nconst char *s = "namespace x { }";\nstruct this_is { int public_; };\n'), false, 'comments and strings do not count');
  assert.equal(cpp('struct [[gnu::packed]] s { int a; };\n'), false, 'C23 attributes are not C++');
});

test('an include inside #ifdef __cplusplus only counts for C++ units', () => {
  const langs = cfront.headerLanguages(withLang([
    { path: 'wrap.h', text: 'int w(int);\n' },
    { path: 'plain.h', text: 'int p(int);\n' },
    { path: 'api.h', text: '#ifdef __cplusplus\n#include "wrap.h"\n#endif\n#include "plain.h"\n' },
    { path: 'main.c', text: '#include "api.h"\n' },
  ]));
  assert.equal(langs.get('wrap.h'), 'c', 'a C unit does not reach it: no unit includes it and it is plain C');
  assert.equal(langs.get('plain.h'), 'c');
  const both = cfront.headerLanguages(withLang([
    { path: 'wrap.h', text: 'int w(int);\n' },
    { path: 'api.h', text: '#ifdef __cplusplus\n#include "wrap.h"\n#endif\n' },
    { path: 'main.c', text: '#include "api.h"\n' },
    { path: 'app.cpp', text: '#include "api.h"\n' },
  ]));
  assert.equal(both.get('wrap.h'), 'cpp');
  assert.equal(both.get('api.h'), 'both');
});

test('a header no unit includes is decided by its content, and passes it to what it includes', () => {
  const langs = cfront.headerLanguages(withLang([
    { path: 'include/exceptions.h', text: CPP_HEADER + '#include "detail.h"\n' },
    { path: 'include/detail.h', text: 'int detail(int x);\n' },
    { path: 'include/config.h', text: '#define CONFIG_MAX 4\nint config_get(int key);\n' },
  ]));
  assert.equal(langs.get('include/exceptions.h'), 'cpp');
  assert.equal(langs.get('include/detail.h'), 'cpp');
  assert.equal(langs.get('include/config.h'), 'c');
});

test('assignHeaderLanguages marks C++ headers as cpp and leaves the others', () => {
  const files = withLang([
    { path: 'a.h', text: CPP_HEADER },
    { path: 'b.h', text: C_HEADER },
    { path: 'b.c', text: '#include "b.h"\n' },
  ]);
  cfront.assignHeaderLanguages(files);
  assert.deepEqual(files.map((f) => f.lang), ['cpp', 'c', 'c']);
});

// ---------------------------------------------------------------- engines

test('a C++ header only C++ units include is not parsed or reported by the C engines', () => {
  const files = withLang([
    { path: 'camera/include/exceptions.h', text: CPP_HEADER },
    { path: 'camera/src/camera.cpp', text: '#include "../include/exceptions.h"\nint camera_open(int id) { return id; }\n' },
    { path: 'src/main.c', text: '#include <stdio.h>\nint main(void) { (void)printf("x\\n"); return 0; }\n' },
  ]);
  const c = misraC.analyze(files, ctx());
  assert.deepEqual(c.filter((f) => f.file.startsWith('camera/')), [], 'no C rule reports on the C++ header or unit');
  const legacyC = legacy.analyze(files, ctx()).filter((f) => f.rule.startsWith('misra-c2004:') && f.file.startsWith('camera/'));
  assert.deepEqual(legacyC, []);
  assert.equal(cfront.parsedProject(files).headerLangs.get('camera/include/exceptions.h'), 'cpp');
});

test('a C++ header no unit includes is parsed as C++: no compile error from misra-c', () => {
  const files = withLang([{ path: 'include/exceptions.h', text: CPP_HEADER }, { path: 'src/a.c', text: 'int a(void) { return 0; }\n' }]);
  const found = misraC.analyze(files, ctx());
  assert.deepEqual(found.filter((f) => f.rule === 'misra-c:dir-2.1'), []);
  const unit = cfront.parsedProject(files).units.find((u) => u.file === 'include/exceptions.h');
  assert.equal(unit.lang, 'cpp');
  assert.equal(unit.standaloneHeader, true);
  assert.deepEqual(errorsOf(unit), []);
});

test('a C header only C units include is not reported by the C++ engines', () => {
  const files = withLang([
    { path: 'include/protocol.h', text: C_HEADER },
    { path: 'src/protocol.c', text: '#include "../include/protocol.h"\nint protocol_send(const struct frame *f) { return f->len; }\n' },
    { path: 'src/app.cpp', text: 'int run_app(int x) { return x; }\n' },
  ]);
  const cpp = misraCpp.analyze(files, ctx());
  assert.deepEqual(cpp.filter((f) => f.file === 'include/protocol.h'), []);
  const legacyCpp = legacy.analyze(files, ctx()).filter((f) => f.rule.startsWith('misra-cpp2008:') && f.file === 'include/protocol.h');
  assert.deepEqual(legacyCpp, []);
  // the C engines still check it
  assert.ok(misraC.analyze(files, ctx()).some((f) => f.file === 'include/protocol.h'));
});

test('a header C and C++ units include is checked by both engine families', () => {
  const files = withLang([
    { path: 'include/protocol.h', text: C_HEADER },
    { path: 'src/protocol.c', text: '#include "../include/protocol.h"\nint protocol_send(const struct frame *f) { return f->len; }\n' },
    { path: 'src/app.cpp', text: '#include "../include/protocol.h"\nint run_app(const frame *f) { return protocol_send(f); }\n' },
  ]);
  assert.equal(cfront.headerLanguages(files).get('include/protocol.h'), 'both');
  assert.ok(misraC.analyze(files, ctx()).some((f) => f.file === 'include/protocol.h'));
  const cpp = misraCpp.analyze(files, ctx()).filter((f) => f.file === 'include/protocol.h');
  assert.ok(cpp.some((f) => /packed/.test(f.message.en)), 'the C++ rules see the GCC attribute through the C++ unit');
});

test('a C unit that includes a C++ header gets no C findings in that header', () => {
  const files = withLang([
    { path: 'include/exceptions.h', text: CPP_HEADER },
    { path: 'src/wrong.c', text: '#include "../include/exceptions.h"\nint wrong(void) { return 0; }\n' },
  ]);
  const found = misraC.analyze(files, ctx());
  assert.deepEqual(found.filter((f) => f.file === 'include/exceptions.h'), []);
});

test('batches of a large project use the header languages of the whole project', () => {
  const files = withLang([
    { path: 'inc/cls.h', text: 'int shared(int x);\n' },
    { path: 'inc/alone.h', text: CPP_HEADER },
    { path: 'src/a.cpp', text: '#include "../inc/cls.h"\nint a(int x) { return shared(x); }\n' },
    { path: 'src/b.cpp', text: '#include "../inc/cls.h"\nint b(int x) { return shared(x); }\n' },
    { path: 'src/c.c', text: 'int c(int x) { return x; }\n' },
  ]);
  const TINY = { smallSources: 1, firstSources: 1, maxSources: 1, tokens: 1 };
  const langs = [];
  const errors = [];
  for (const list of cfront.batches(files, TINY)) {
    const p = cfront.projectFor(list);
    langs.push(p.headerLangs.get('inc/cls.h'));
    for (const u of p.units) if (u.file === 'inc/alone.h') errors.push(u.lang, errorsOf(u).length);
  }
  assert.ok(langs.length > 1);
  assert.ok(langs.every((l) => l === 'cpp'), 'every batch knows that only C++ units include the header');
  assert.deepEqual(errors, ['cpp', 0]);
});

test('analyzeSources reports no misra-c compile error in C++ headers', () => {
  const a = analyzeSources([
    { path: 'camera/include/exceptions.h', text: CPP_HEADER },
    { path: 'camera/include/configs.h', text: '#pragma once\nnamespace va { struct Config { int w; int h; }; }\n' },
    { path: 'src/main.c', text: 'int main(void) { return 0; }\n' },
  ]);
  assert.deepEqual(a.issues.filter((i) => i.rule === 'misra-c:dir-2.1'), []);
  assert.deepEqual(a.issues.filter((i) => /^misra-c(2004)?:/.test(i.rule) && i.file.startsWith('camera/')), []);
});

// ---------------------------------------------------------------- missing definitions

const parse = (text, opts = {}) => cf.parseUnit(text, { file: 'a.c', lang: 'c', ...opts });
const firstOf = (unit, type) => cf.findFirst(unit.ast, (n) => n.type === type);

test('an unknown name next to a string literal is a string-literal macro', () => {
  const u = parse([
    'int my_printf(const char *fmt, ...);',
    'void f(unsigned v) {',
    '  my_printf("value=%" PRIx32 "\\n", v);',
    '  my_printf("big=%" G_GINT64_FORMAT " end\\n", (long)v);',
    '  my_printf(LV_SYMBOL_REFRESH "  refresh");',
    '  my_printf(LOG_TAG);',
    '}', '',
  ].join('\n'));
  assert.deepEqual(errorsOf(u), []);
  const lits = cf.findAll(u.ast, (n) => n.type === 'StringLiteral');
  assert.deepEqual(lits.map((s) => s.macroParts || null), [['PRIx32'], ['G_GINT64_FORMAT'], ['LV_SYMBOL_REFRESH']]);
  assert.ok(lits.every((s) => s.incomplete));
  assert.equal(lits[0].value, 'value=%\n');
  assert.equal(lits[0].parts.length, 2, 'parts are the literals only');
  assert.equal(cf.types.canonical(lits[0].ctype).size, null, 'the size of the literal is unknown');
});

test('a declared name next to a string literal is still a syntax error', () => {
  const u = parse('int my_printf(const char *fmt, ...);\nvoid f(const char *fmt) { my_printf(fmt "x"); }\n');
  assert.equal(errorsOf(u).length > 0, true);
});

test('an unknown macro call after a declarator is an attribute macro', () => {
  const u = parse([
    'int my_printf(const char *fmt, ...) G_GNUC_PRINTF(1, 2);',
    'void my_abort(void) G_GNUC_NORETURN;',
    'static int counter G_GNUC_UNUSED = 0;',
    'int handler(int x) LV_ATTRIBUTE_FAST_MEM { return x; }',
    'LV_ATTRIBUTE_TIMER_HANDLER unsigned int lv_timer_handler(void);',
    '',
  ].join('\n'));
  assert.deepEqual(errorsOf(u), []);
  const pre = cf.findFirst(u.ast, (n) => n.type === 'FunctionDecl' && n.name === 'lv_timer_handler');
  assert.ok(pre, 'an attribute macro in front of the specifiers');
  const fn = firstOf(u, 'FunctionDecl');
  assert.deepEqual(fn.attributes.map((a) => [a.name, a.args, a.syntax]), [['G_GNUC_PRINTF', '1 , 2', 'macro']]);
  const def = cf.findFirst(u.ast, (n) => n.type === 'FunctionDecl' && n.name === 'handler');
  assert.ok(def.body, 'the definition keeps its body');
  const v = cf.findFirst(u.ast, (n) => n.type === 'VarDecl' && n.name === 'counter');
  assert.ok(v.init);
});

test('real syntax errors in C files are still reported', () => {
  assert.ok(errorsOf(parse('int broken(int a) {\n  int b = a + ;\n  return b;\n}\n')).length > 0);
  assert.ok(errorsOf(parse('int x y;\n')).length > 0, 'a lower-case name after a declarator is not a macro');
  assert.ok(errorsOf(parse('int f(void) { return 1 }\n')).length > 0);
  const files = [{ path: 'src/broken.c', text: 'int broken(int a)\n{\n    int b = a + ;\n    return b;\n}\n', lang: 'c' }];
  const found = misraC.analyze(files, ctx()).filter((f) => f.rule === 'misra-c:dir-2.1');
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 3);
});

test('an unknown function-like macro in #if counts as 0, without a compile error', () => {
  const u = parse('#if GTK_CHECK_VERSION(4, 0, 0)\nint gtk_major = 4;\n#else\nint gtk_major = 3;\n#endif\n#if !SOME_FEATURE(x) && 1\nint feature_off;\n#endif\n');
  assert.deepEqual(errorsOf(u), []);
  const v = firstOf(u, 'VarDecl');
  assert.equal(v.init.value, 3n);
  assert.ok(cf.findFirst(u.ast, (n) => n.type === 'VarDecl' && n.name === 'feature_off'));
  assert.ok(u.undefInIf.some((x) => x.name === 'GTK_CHECK_VERSION' && x.call));
  // a broken #if is still an error
  assert.ok(errorsOf(parse('#if 1 +\n#endif\n')).some((d) => d.code === 'pp-if-syntax'));
});

test('common platform macros are predefined and the project defines can replace them', () => {
  const entropy = '#if !defined(unix) && !defined(__unix__) && !defined(__unix) && !defined(_WIN32)\n#error "Platform entropy sources only work on Unix and Windows"\n#endif\nint ok;\n';
  assert.deepEqual(errorsOf(parse(entropy)), []);
  const has = (opts, name) => parse(`#ifdef ${name}\nint yes;\n#endif\n`, opts).ast.decls.length === 1;
  assert.ok(has({}, '__linux__') && has({}, '__unix__') && has({}, '__GNUC__') && has({}, '__x86_64__'));
  assert.ok(!has({}, '_WIN32'));
  assert.ok(has({ target: 'llp64' }, '_WIN32') && has({ target: 'llp64' }, '_WIN64') && !has({ target: 'llp64' }, '__linux__'));
  assert.ok(has({ target: 'ilp32' }, '__i386__') && !has({ target: 'ilp32' }, '__x86_64__'));
  assert.ok(has({ platform: 'windows' }, '_WIN32'));
  // a project for another compiler: no GCC, no host system or processor
  const iar = { defines: { __ICCARM__: 1 } };
  assert.ok(has(iar, '__ICCARM__') && !has(iar, '__GNUC__') && !has(iar, '__linux__') && !has(iar, '__x86_64__'));
  // a project that names its system keeps the compiler and processor
  const win = { defines: ['_WIN32'] };
  assert.ok(has(win, '_WIN32') && !has(win, '__linux__') && has(win, '__GNUC__'));
  assert.ok(!has({ platform: 'none' }, '__GNUC__') && !has({ platform: 'none' }, '__linux__'));
  assert.ok(!has({ undefs: ['__linux__'] }, '__linux__'));
  const gnuc = parse('#if __GNUC__ >= 4\nint modern;\n#endif\n');
  assert.equal(gnuc.ast.decls.length, 1);
});
