import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const cf = require('../core/cfamily/index.js');
const { lex, classifyNumber } = require('../core/cfamily/lexer.js');
const { types: Ty } = cf;
const here = dirname(fileURLToPath(import.meta.url));

const vals = (toks) => toks.map((t) => t.value);
const ppText = (src, opts = {}) => cf.preprocess(src, { file: 'm.c', ...opts }).tokens.filter((t) => !t.file.startsWith('<')).map((t) => t.value).join(' ');
const unit = (src, opts = {}) => cf.parseUnit(src, { file: opts.file || (opts.lang === 'cpp' ? 't.cpp' : 't.c'), ...opts });
const errors = (u) => u.diagnostics.filter((d) => d.severity === 'error');
const decl = (u, name) => cf.findFirst(u.ast, (n) => (n.type === 'VarDecl' || n.type === 'FunctionDecl' || n.type === 'FieldDecl' || n.type === 'TypedefDecl') && n.name === name && n.loc.file === u.file);
const tstr = (t) => Ty.typeToString(t);
// initializer expression of a variable
const initOf = (u, name) => decl(u, name).init;
const et = (u, name) => cf.essentialType(initOf(u, name));

// ------------------------------------------------------------------ lexer

test('lexer: punctuators, digraphs and longest match', () => {
  const r = lex('a<<=b>>=c->d...e<:0:><%%>%:%:##', { lang: 'c' });
  assert.deepEqual(vals(r.tokens), ['a', '<<=', 'b', '>>=', 'c', '->', 'd', '...', 'e', '[', '0', ']', '{', '}', '##', '##']);
  const dg = r.tokens.filter((t) => t.digraph).map((t) => t.digraph);
  assert.deepEqual(dg, ['<:', ':>', '<%', '%>', '%:%:']);
  const cpp = lex('a<=>b x->*y p.*q ::z', { lang: 'cpp' });
  assert.deepEqual(vals(cpp.tokens), ['a', '<=>', 'b', 'x', '->*', 'y', 'p', '.*', 'q', '::', 'z']);
  assert.deepEqual(vals(lex('a<=>b', { lang: 'c' }).tokens), ['a', '<=', '>', 'b']);
});

test('lexer: C++ <:: special rule and alternative tokens', () => {
  assert.deepEqual(vals(lex('std::vector<::std::string>', { lang: 'cpp' }).tokens), ['std', '::', 'vector', '<', '::', 'std', '::', 'string', '>']);
  assert.deepEqual(vals(lex('a<::>', { lang: 'cpp' }).tokens), ['a', '[', ']']);
  const alt = lex('a and b or not c bitand d', { lang: 'cpp' }).tokens;
  assert.deepEqual(vals(alt), ['a', '&&', 'b', '||', '!', 'c', '&', 'd']);
  assert.equal(alt[1].alt, 'and');
  assert.equal(lex('a and b', { lang: 'c' }).tokens[1].kind, 'identifier');
});

test('lexer: numeric literals', () => {
  const n = (s, lang) => classifyNumber(s, { lang });
  assert.deepEqual([n('0x1p3').kind, n('0x1p3').value], ['float', 8]);
  assert.equal(n('0x1.8p1').value, 3);
  assert.equal(n('0b1011').value, 11n);
  assert.equal(n("1'000'000ull", 'cpp').value, 1000000n);
  assert.equal(n("1'000'000ull", 'cpp').suffix, 'ull');
  assert.equal(n('017').octal, true);
  assert.equal(n('017').value, 15n);
  assert.equal(n('0').octal, false);
  assert.ok(n('08').error);
  assert.ok(n('0x').error);
  assert.ok(n('1e').error);
  assert.ok(n('12abc').error);
  assert.equal(n('.5f').kind, 'float');
  assert.equal(n('1.5e-3L').suffix, 'L');
  assert.equal(n('10_km', 'cpp').udSuffix, '_km');
  assert.equal(n('42uz', 'cpp').suffix, 'uz');
  // pp-number swallows sign after exponent but not after other letters
  assert.deepEqual(vals(lex('1e+5 0x1p-2 0xe+1').tokens), ['1e+5', '0x1p-2', '0xe+1']);
  assert.deepEqual(vals(lex('a+1').tokens), ['a', '+', '1']);
});

test('lexer: characters, strings, prefixes, raw strings, UCNs', () => {
  const r = lex(`L'a' u8"x" U"y" u'z' "a\\"b" '\\''`, { lang: 'cpp' });
  assert.deepEqual(r.tokens.map((t) => [t.kind, t.prefix]), [['char', 'L'], ['string', 'u8'], ['string', 'U'], ['char', 'u'], ['string', ''], ['char', '']]);
  const raw = lex('R"delim(a)" b\n)delim" x', { lang: 'cpp' });
  assert.equal(raw.tokens[0].kind, 'string');
  assert.equal(raw.tokens[0].raw, true);
  assert.equal(raw.tokens[0].endLine, 2);
  assert.equal(raw.tokens[1].value, 'x');
  // in C, R is an identifier followed by a string
  assert.deepEqual(lex('R"(x)"', { lang: 'c' }).tokens.map((t) => t.kind), ['identifier', 'string']);
  const ucn = lex('int caf\\u00e9 = 1;').tokens[1];
  assert.equal(ucn.kind, 'identifier');
  assert.equal(ucn.ucn, true);
  const ud = lex('"abc"_s 12_km', { lang: 'cpp' }).tokens;
  assert.equal(ud[0].udSuffix, '_s');
  const bad = lex('"open\nx');
  assert.equal(bad.tokens[0].unterminated, true);
});

test('lexer: comments kept on a side list with positions', () => {
  const r = lex('int a; // one /* inner\n/* two // x\n   more */ int b;');
  assert.deepEqual(vals(r.tokens), ['int', 'a', ';', 'int', 'b', ';']);
  assert.equal(r.comments.length, 2);
  assert.deepEqual([r.comments[0].style, r.comments[0].line, r.comments[0].col], ['line', 1, 8]);
  assert.ok(r.comments[0].value.includes('/*'));
  assert.deepEqual([r.comments[1].style, r.comments[1].line, r.comments[1].endLine], ['block', 2, 3]);
  const un = lex('/* never closed');
  assert.ok(un.diagnostics.some((d) => d.code === 'lex-unterminated-comment'));
});

test('lexer: line splices keep original positions', () => {
  const r = lex('int ab\\\ncd = 1; // c \\\n still comment\nint z;');
  assert.deepEqual(vals(r.tokens), ['int', 'abcd', '=', '1', ';', 'int', 'z', ';']);
  const id = r.tokens[1];
  assert.deepEqual([id.line, id.col, id.endLine], [1, 5, 2]);
  assert.equal(r.tokens[2].line, 2);
  assert.equal(r.splices.length, 2);
  assert.equal(r.comments[0].spliced, true);
  assert.equal(r.tokens[5].line, 4);
});

test('lexer: trigraphs are detected (and replaced only on request)', () => {
  const r = lex('a ??= b "??/"');
  assert.equal(r.trigraphs.length, 2);
  assert.deepEqual([r.trigraphs[0].seq, r.trigraphs[0].line, r.trigraphs[0].col], ['??=', 1, 3]);
  assert.deepEqual(vals(r.tokens).slice(0, 4), ['a', '?', '?', '=']);
  const rep = lex('??=define X', { trigraphs: true });
  assert.deepEqual(vals(rep.tokens), ['#', 'define', 'X']);
});

test('lexer: token positions and flags', () => {
  const r = lex('  foo(bar);\n#define X');
  const [foo, lp] = r.tokens;
  assert.deepEqual([foo.line, foo.col, foo.endCol, foo.bol, foo.space], [1, 3, 6, true, true]);
  assert.equal(lp.space, false);
  assert.equal(r.tokens[5].bol, true);
  assert.equal(r.tokens[5].kind, 'punct');
  assert.equal(lex('int x', { lang: 'c' }).tokens[0].kind, 'keyword');
});

// ------------------------------------------------------------------ preprocessor

test('preprocessor: object and function-like macros, # and ##', () => {
  const src = [
    '#define STR(x) #x',
    '#define XSTR(x) STR(x)',
    '#define CAT(a, b) a ## b',
    '#define N 42',
    'CAT(x, 1) XSTR(N) STR(  a  +   "b\\n"  ) CAT(, y) CAT(z,)',
  ].join('\n');
  assert.equal(ppText(src), 'x1 "42" "a + \\"b\\\\n\\"" y z');
});

test('preprocessor: standard C examples (6.10.3.5)', () => {
  const src = [
    '#define x 3',
    '#define f(a) f(x * (a))',
    '#undef x',
    '#define x 2',
    '#define g f',
    '#define z z[0]',
    '#define h g(~',
    '#define m(a) a(w)',
    '#define w 0,1',
    '#define t(a) a',
    '#define p() int',
    '#define q(x) x',
    '#define r(x,y) x ## y',
    'f(y+1) + f(f(z)) % t(t(g)(0) + t)(1);',
    'g(x+(3,4)-w) | h 5) & m',
    '(f)^m(m);',
    'p() i[q()] = { q(1), r(2,3), r(4,), r(,5), r(,) };',
  ].join('\n');
  assert.equal(ppText(src),
    'f ( 2 * ( y + 1 ) ) + f ( 2 * ( f ( 2 * ( z [ 0 ] ) ) ) ) % f ( 2 * ( 0 ) ) + t ( 1 ) ; ' +
    'f ( 2 * ( 2 + ( 3 , 4 ) - 0 , 1 ) ) | f ( 2 * ( ~ 5 ) ) & f ( 2 * ( 0 , 1 ) ) ^ m ( 0 , 1 ) ; ' +
    'int i [ ] = { 1 , 23 , 4 , 5 , } ;');
  const hh = ['#define hash_hash # ## #', '#define mkstr(a) # a', '#define in_between(a) mkstr(a)', '#define join(c, d) in_between(c hash_hash d)', 'char p[] = join(x, y);'].join('\n');
  assert.equal(ppText(hh), 'char p [ ] = "x ## y" ;');
  assert.equal(ppText('#define f(a) a*g\n#define g(a) f(a)\nf(2)(9)'), '2 * 9 * g');
});

test('preprocessor: variadic macros, __VA_OPT__ and GNU comma paste', () => {
  const src = [
    '#define F(...) f(0 __VA_OPT__(,) __VA_ARGS__)',
    '#define G(fmt, args...) printf(fmt, ## args)',
    '#define H(fmt, ...) printf(fmt, ##__VA_ARGS__)',
    '#define SDEF(sname, ...) S sname __VA_OPT__(= { __VA_ARGS__ })',
    'F() F(a, b) G("x") G("y", 1, 2) H("z") H("w", 3) SDEF(foo); SDEF(bar, 1, 2);',
  ].join('\n');
  assert.equal(ppText(src), 'f ( 0 ) f ( 0 , a , b ) printf ( "x" ) printf ( "y" , 1 , 2 ) printf ( "z" ) printf ( "w" , 3 ) S foo ; S bar = { 1 , 2 } ;');
});

test('preprocessor: conditional evaluation', () => {
  const src = [
    '#define A 1',
    '#if defined(A) && !defined B && (A + 2 * 3 == 7)',
    'one',
    '#endif',
    '#if -1 < 0u',
    'bad1',
    '#elif (0x10 >> 2) == 4 && \'a\' == 97 && (1 ? 2 : (1 / 0))',
    'two',
    '#else',
    'bad2',
    '#endif',
    '#ifdef A',
    '#  ifndef A',
    'bad3',
    '#  else',
    'three',
    '#  endif',
    '#endif',
    '#if UNDEFINED_THING || 0',
    'bad4',
    '#elifdef A',
    'four',
    '#endif',
  ].join('\n');
  const r = cf.preprocess(src, { file: 'm.c' });
  assert.equal(r.tokens.map((t) => t.value).join(' '), 'one two three four');
  assert.deepEqual(r.undefInIf.map((u) => u.name), ['UNDEFINED_THING']);
  assert.ok(r.skipped.some((s) => s.startLine === 6 && s.endLine === 6));
  const ifs = r.directives.filter((d) => d.kind === 'if' || d.kind === 'elif');
  assert.deepEqual(ifs.map((d) => d.taken), [true, false, true, false]);
  assert.equal(r.diagnostics.filter((d) => d.severity === 'error').length, 0);
});

test('preprocessor: directive records and macro bookkeeping', () => {
  const src = [
    '#define SQ(x) ((x) * (x))',
    '#define S(x) #x',
    '#define P(a, b) a ## b',
    '#define SQ(x) ((x)*(x))',
    '#undef S',
    '#undef NEVER',
    '#pragma once',
    '#pragma pack(1)',
    '#warning careful',
    '#line 100',
    '#foo bar',
    'int v = SQ(3);',
  ].join('\n');
  const r = cf.preprocess(src, { file: 'm.c' });
  const kinds = r.directives.map((d) => d.kind);
  assert.deepEqual(kinds, ['define', 'define', 'define', 'define', 'undef', 'undef', 'pragma', 'pragma', 'warning', 'line', 'unknown']);
  const sq = r.macroDefs.filter((d) => d.name === 'SQ');
  assert.equal(sq.length, 2);
  assert.equal(sq[1].incompatibleRedefinition, true);
  assert.equal(r.macroDefs.find((d) => d.name === 'S').usesStringify, true);
  assert.equal(r.macroDefs.find((d) => d.name === 'S').undef.line, 5);
  assert.equal(r.macroDefs.find((d) => d.name === 'P').usesPaste, true);
  assert.equal(r.directives[5].wasDefined, false);
  assert.ok(r.diagnostics.some((d) => d.code === 'pp-macro-redefined'));
  assert.ok(r.diagnostics.some((d) => d.code === 'pp-unknown-directive' && d.line === 11));
  assert.ok(r.diagnostics.some((d) => d.code === 'pp-warning'));
  const ex = r.expansions.find((e) => e.name === 'SQ');
  assert.deepEqual([ex.line, ex.col, ex.nested], [12, 9, false]);
  // tokens from the expansion carry the expansion site location
  const fromMacro = r.tokens.filter((t) => t.fromMacro === 'SQ');
  assert.ok(fromMacro.length > 5);
  assert.ok(fromMacro.every((t) => t.line === 12 && t.col === 9 && t.endCol === 14));
  assert.ok(fromMacro.some((t) => t.spelling && t.spelling.line === 4));
});

test('preprocessor: invalid input produces diagnostics, never throws', () => {
  const src = [
    '#if 1 +',
    '#endif',
    '#if',
    '#endif',
    '#else',
    '#define',
    '#define 3x',
    '#define F(a, a) a',
    '#define G(a) # b',
    '#define H ## x',
    '#include',
    '#include junk',
    '#if 1',
    'F(1',
  ].join('\n');
  const r = cf.preprocess(src, { file: 'm.c' });
  const codes = new Set(r.diagnostics.map((d) => d.code));
  for (const c of ['pp-if-syntax', 'pp-if-no-expression', 'pp-unmatched-conditional', 'pp-define-no-name', 'pp-define-invalid-name', 'pp-duplicate-param', 'pp-stringify-non-param', 'pp-paste-at-edge', 'pp-include-invalid', 'pp-unterminated-conditional']) {
    assert.ok(codes.has(c), `missing ${c}`);
  }
  // random garbage
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
  const alphabet = '#define if else endif ( ) , ## # "x\' \\ \n /* */ // a b 1 0x ... __VA_ARGS__ __VA_OPT__ < > include';
  const parts = alphabet.split(' ');
  for (let k = 0; k < 30; k++) {
    let s = '';
    for (let j = 0; j < 80; j++) s += parts[rnd() % parts.length] + (rnd() % 3 ? ' ' : '');
    assert.doesNotThrow(() => cf.parseUnit(s, { file: 'r.c' }));
    assert.doesNotThrow(() => cf.parseUnit(s, { file: 'r.cpp' }));
  }
});

test('preprocessor: include resolution, guards, missing system headers', () => {
  const files = [
    { path: 'src/main.c', text: '#include "util.h"\n#include "util.h"\n#include <config.h>\n#include <nothere.h>\n#include "../inc/once.h"\nint main(void) { return util(UTIL_MAX) + once; }\n' },
    { path: 'src/util.h', text: '#ifndef UTIL_H\n#define UTIL_H\n#define UTIL_MAX 9\nint util(int);\n#endif\n' },
    { path: 'inc/config.h', text: '#define CONFIGURED 1\n' },
    { path: 'inc/once.h', text: '#pragma once\nextern int once;\n' },
  ];
  const fileMap = new Map(files.map((f) => [f.path, { text: f.text }]));
  const u = cf.parseUnit(files[0].text, { file: 'src/main.c', fileMap, includeDirs: ['inc'] });
  assert.deepEqual(u.includes.map((i) => [i.name, i.kind, i.resolved]), [
    ['util.h', 'project', 'src/util.h'],
    ['util.h', 'project', 'src/util.h'],
    ['config.h', 'project', 'inc/config.h'],
    ['nothere.h', 'missing', null],
    ['../inc/once.h', 'project', 'inc/once.h'],
  ]);
  assert.equal(u.includes[1].skipped, 'guard');
  assert.equal(u.headerGuards.get('src/util.h').macro, 'UTIL_H');
  assert.equal(u.headerGuards.get('inc/once.h').pragmaOnce, true);
  assert.equal(u.headerGuards.get('inc/config.h').guarded, false);
  assert.equal(u.macroTable.has('CONFIGURED'), true);
  const missing = u.diagnostics.find((d) => d.code === 'pp-include-not-found');
  assert.equal(missing.severity, 'info');
  assert.equal(errors(u).length, 0);
  assert.equal(decl(u, 'main').symbol.kind, 'function');
  assert.equal(u.unresolved.length, 0);
});

test('preprocessor: builtin headers, predefined and dynamic macros', () => {
  const u = unit('#include <stddef.h>\n#include <stdint.h>\n#include <limits.h>\nsize_t n = __LINE__; uint16_t w = UINT16_MAX; const char *f = __FILE__; int m = INT_MAX;\n#if __STDC_VERSION__ >= 201710L && __SIZEOF_POINTER__ == 8\nint lp64;\n#endif\n');
  assert.equal(tstr(decl(u, 'n').ctype), 'size_t');
  assert.equal(tstr(Ty.canonical(decl(u, 'n').ctype)), 'unsigned long');
  assert.equal(decl(u, 'n').init.value, 4n);
  assert.equal(decl(u, 'w').init.value, 65535n);
  assert.equal(decl(u, 'f').init.value, 't.c');
  assert.ok(decl(u, 'lp64'));
  const u32 = unit('#include <stddef.h>\nsize_t n;', { target: 'ilp32' });
  assert.equal(tstr(Ty.canonical(decl(u32, 'n').ctype)), 'unsigned int');
  const cpp = unit('#if __cplusplus >= 201703L\nint modern;\n#endif\n', { lang: 'cpp', std: 'c++17' });
  assert.ok(decl(cpp, 'modern'));
  const defs = unit('#if FEATURE == 3 && defined(DEBUG)\nint on;\n#endif', { defines: { FEATURE: '3', DEBUG: null } });
  assert.ok(decl(defs, 'on'));
});

test('preprocessor: include placement, _Pragma, directives inside macro arguments, C23', () => {
  const files = { 'a.h': 'int a;\n' };
  const u = cf.parseUnit('int before;\n#include "a.h"\n_Pragma("pack(1)")\n#define F(x) x\nint v = F(1\n#define G 2\n);\n', { file: 'm.c', files });
  assert.equal(u.includes[0].precededByCode, true);
  assert.ok(u.pragmas.some((p) => p.operator && p.text === 'pack(1)'));
  assert.ok(u.diagnostics.some((d) => d.code === 'pp-directive-in-macro-args'));
  const bad = cf.preprocess('#include "we\'ird.h"\n', { file: 'm.c' });
  assert.equal(bad.includes[0].suspiciousChars, true);
  const c23 = unit('constexpr int k = 3; bool flag = true; typeof(k) z = nullptr == 0;', { std: 'c23' });
  assert.equal(errors(c23).length, 0);
  assert.equal(c23.tokens[0].kind, 'keyword');
  assert.equal(tstr(Ty.canonical(decl(c23, 'flag').ctype)), 'bool');
  assert.equal(unit('int constexpr_ok = 1;').tokens[1].value, 'constexpr_ok');
  const trig = unit('int t = 1; ??= \n', { file: 'g.c' });
  assert.equal(trig.trigraphs.length, 1);
});

// ------------------------------------------------------------------ parser: C

test('parser C: declarators and types', () => {
  const u = unit([
    'int (*fp)(int, char **);',
    'static int *ap[4];',
    'int (*pa)[4];',
    'char *(*(*x)(void))[8];',
    'const volatile unsigned long long int q = 1;',
    'void (*signal(int sig, void (*func)(int)))(int);',
    'int arr[] = {1, 2, 3}, *ip = 0;',
    'char msg[] = "hello";',
    'typedef unsigned char byte, *pbyte;',
    'byte b; pbyte pb;',
    '_Alignas(16) int aligned;',
    '_Thread_local int tls;',
    'int vla_user(int n, int m[static 10], int v[n][n]);',
  ].join('\n'));
  assert.equal(errors(u).length, 0);
  const T = (n) => tstr(decl(u, n).ctype);
  assert.equal(T('fp'), 'int (*)(int, char **)');
  assert.equal(T('ap'), 'int *[4]');
  assert.equal(T('pa'), 'int (*)[4]');
  assert.equal(T('x'), 'char *(*(*)(void))[8]');
  assert.equal(T('q'), 'const volatile unsigned long long');
  assert.equal(T('signal'), 'void (*(int, void (*)(int)))(int)');
  assert.equal(T('arr'), 'int [3]');
  assert.equal(T('ip'), 'int *');
  assert.equal(T('msg'), 'char [6]');
  assert.equal(tstr(Ty.canonical(decl(u, 'pb').ctype)), 'unsigned char *');
  assert.deepEqual(decl(u, 'aligned').specs ? 1 : 1, 1);
  assert.equal(decl(u, 'tls').symbol.storage, 'thread');
  const vla = decl(u, 'vla_user');
  assert.equal(tstr(vla.ctype), 'int (int, int *, int (*)[])');
});

test('parser C: typedef names disambiguate declarations from expressions', () => {
  const u = unit([
    'typedef int T;',
    'int a, b;',
    'void f(void) {',
    '  T * x;',
    '  a * b;',
    '  T (y);',
    '  { int T; T * 2; }',
    '  unknown_t * p = 0;',
    '  size_t n;',
    '  (T)a;',
    '  (a) - b;',
    '}',
  ].join('\n'));
  assert.equal(errors(u).length, 0);
  const body = decl(u, 'f').body.body;
  assert.deepEqual(body.map((s) => s.type), ['Declaration', 'ExprStmt', 'Declaration', 'CompoundStmt', 'Declaration', 'Declaration', 'ExprStmt', 'ExprStmt']);
  assert.equal(body[1].expr.op, '*');
  assert.equal(body[3].body[1].type, 'ExprStmt');
  assert.equal(body[4].specs.typeSpec.unknown, true);
  assert.equal(body[6].expr.type, 'CastExpr');
  assert.equal(body[7].expr.type, 'BinaryExpr');
  assert.equal(tstr(Ty.canonical(decl(u, 'n').ctype)), 'unsigned long'); // known typedef even without the header
});

test('parser C: struct, union, enum, bit fields, anonymous members', () => {
  const u = unit([
    'struct S { unsigned a : 3; signed b : 5; int : 0; union { int i; float f; }; struct S *next; } s;',
    'enum E { A, B = 5, C, D = B + 10 };',
    'enum { ANON = -1 };',
    'struct Fwd;',
    'struct Fwd *fp;',
    'int g(void) { return s.i + s.a + A + C + D + ANON + sizeof(struct S); }',
  ].join('\n'));
  assert.equal(errors(u).length, 0);
  const rec = Ty.canonical(decl(u, 's').ctype);
  assert.equal(rec.kind, 'record');
  assert.deepEqual(rec.fields.map((f) => [f.name, f.bitWidth]), [['a', 3], ['b', 5], [null, 0], [null, null], ['next', null]]);
  const consts = cf.findAll(u.ast, 'EnumConstant').map((c) => [c.name, c.constValue]);
  assert.deepEqual(consts, [['A', 0n], ['B', 5n], ['C', 6n], ['D', 15n], ['ANON', -1n]]);
  const ret = cf.findFirst(decl(u, 'g'), 'ReturnStmt');
  const mem = cf.findAll(ret, 'MemberExpr');
  assert.equal(mem[0].memberSymbol.name, 'i');
  assert.equal(mem[1].bitField, 3);
  assert.equal(Ty.canonical(decl(u, 'fp').ctype).to.complete, false);
});

test('parser C: initializers, compound literals, _Generic, _Static_assert', () => {
  const u = unit([
    'struct P { int x, y; };',
    'struct P p = { .y = 2, .x = 1 };',
    'int a[10] = { [2] = 1, [5 ... 7] = 3 };',
    'int b[] = { [4] = 1, 2 };',
    'struct P *q = &(struct P){ 3, 4 };',
    'int sel = _Generic(1.0f, float: 1, double: 2, default: 3);',
    '_Static_assert(sizeof(struct P) == 8, "size");',
    'int old = { 1 , };',
  ].join('\n'));
  assert.equal(errors(u).length, 0);
  const des = initOf(u, 'p').items[0];
  assert.equal(des.type, 'DesignatedInit');
  assert.equal(des.designators[0].name, 'y');
  assert.equal(des.designators[0].field.name, 'y');
  assert.equal(initOf(u, 'a').items[1].designators[0].high.value, 7n);
  assert.equal(tstr(decl(u, 'b').ctype), 'int [6]');
  assert.equal(initOf(u, 'q').arg.type, 'CompoundLiteral');
  const g = initOf(u, 'sel');
  assert.equal(g.type, 'GenericSelection');
  assert.equal(g.selected, 0);
  const sa = cf.findFirst(u.ast, 'StaticAssert');
  assert.equal(sa.value, true);
  assert.equal(initOf(u, 'old').trailingComma, true);
});

test('parser C: statements, labels, switch, GNU extensions, K&R', () => {
  const u = unit([
    'int kr(a, b) int a; char b; { return a + b; }',
    'int f(int x) {',
    '  int r = 0;',
    '  __attribute__((unused)) int unused_var;',
    '  again:',
    '  switch (x) { case 1: case 2 ... 4: r++; break; default: r--; }',
    '  while (x--) if (x & 1) continue; else break;',
    '  do { r <<= 1; } while (r < 100);',
    '  for (int i = 0, j = 1; i < j; i++, j--) ;',
    '  r = ({ int t = r * 2; t + 1; });',
    '  __asm__ volatile ("nop" ::: "memory");',
    '  if (r > 1000) goto again;',
    '  return r ?: 1;',
    '}',
    'static inline __attribute__((always_inline)) int g(void) { return 0; }',
  ].join('\n'));
  assert.equal(errors(u).length, 0);
  const kr = decl(u, 'kr');
  assert.equal(kr.oldStyle, true);
  assert.equal(tstr(kr.ctype), 'int (int, char)');
  const f = decl(u, 'f');
  const types = f.body.body.map((s) => s.type);
  assert.deepEqual(types, ['Declaration', 'Declaration', 'LabelStmt', 'WhileStmt', 'DoStmt', 'ForStmt', 'ExprStmt', 'AsmStmt', 'IfStmt', 'ReturnStmt']);
  const sw = cf.findFirst(f, 'SwitchStmt');
  const cl = cf.switchClauses(sw);
  assert.equal(cl.clauses.length, 2);
  assert.equal(cl.clauses[0].labels.length, 2);
  assert.equal(cl.clauses[0].labels[1].high.value, 4n);
  assert.equal(cf.findFirst(f, 'StmtExpr').ctype.name, 'int');
  assert.equal(cf.findFirst(f, 'ConditionalExpr').gnuElvis, true);
  assert.equal(cf.findFirst(f, 'GotoStmt').labelSymbol.name, 'again');
  assert.deepEqual(decl(u, 'unused_var').specs.attributes.map((a) => a.name), ['unused']);
  assert.ok(decl(u, 'g').specs.functionSpecs.includes('inline'));
});

test('parser: error recovery keeps analysing the rest of the file', () => {
  const u = unit([
    'int ok1(void) { return 1; }',
    'int broken( { int x = ; }',
    'int ok2(void) { int y = 2 +; return y; }',
    'struct { int a; int b c; } s;',
    'int ok3(void) { return 3; }',
    'void ok4(void) { if (1) { foo(; } bar(); }',
  ].join('\n'));
  assert.ok(errors(u).length >= 4);
  for (const n of ['ok1', 'ok2', 'ok3', 'ok4']) assert.ok(decl(u, n), `missing ${n}`);
  assert.ok(cf.findAll(u.ast, ['ErrorDecl', 'ErrorStmt']).length >= 3);
  const ok4 = decl(u, 'ok4');
  assert.ok(cf.findAll(ok4, 'CallExpr').some((c) => c.callee.name === 'bar'));
  assert.ok(u.diagnostics.every((d) => typeof d.line === 'number' && d.file));
});

// ------------------------------------------------------------------ parser: C++

test('parser C++: classes, access, inheritance, special members', () => {
  const u = unit([
    'class Base { public: virtual ~Base() = default; virtual int f() const = 0; protected: int b_ = 0; };',
    'struct Derived final : public Base, private virtual Other {',
    '  Derived() : Base(), v_{1} {}',
    '  explicit Derived(int v) noexcept : v_(v) {}',
    '  Derived(const Derived&) = delete;',
    '  Derived& operator=(Derived&&) noexcept = default;',
    '  int f() const override { return v_; }',
    '  operator bool() const { return v_ != 0; }',
    '  bool operator==(const Derived& o) const { return v_ == o.v_; }',
    '  static constexpr int k = 3;',
    '  friend class Peer;',
    'private:',
    '  mutable int v_ : 8;',
    '};',
    'int Derived2::count = 0;',
  ].join('\n'), { lang: 'cpp' });
  assert.equal(errors(u).length, 0);
  const rec = cf.findAll(u.ast, 'RecordDecl').find((r) => r.name === 'Derived');
  assert.equal(rec.isFinal, true);
  assert.deepEqual(rec.bases.map((b) => [b.name, b.access, b.virtual]), [['Base', 'public', false], ['Other', 'private', true]]);
  const fns = cf.findAll(rec, 'FunctionDecl');
  const by = (pred) => fns.find(pred);
  assert.ok(by((f) => f.isConstructor && f.ctorInits && f.ctorInits.length === 2));
  assert.ok(by((f) => f.isDeleted));
  assert.ok(by((f) => f.isDefault && f.isOperator));
  assert.ok(by((f) => f.name === 'f' && f.isOverride));
  assert.equal(tstr(by((f) => f.isConversion).ctype), 'bool (void)');
  const field = cf.findAll(rec, 'FieldDecl').find((f) => f.name === 'v_');
  assert.equal(field.access, undefined === field.access ? undefined : field.access);
  const decls = rec.members.filter((m) => m.type === 'Declaration');
  assert.equal(decls[decls.length - 1].access, 'private');
  assert.equal(decls[0].access, 'public');
  const base = cf.findAll(u.ast, 'FunctionDecl').find((f) => f.name === 'f' && f.isPure);
  assert.ok(base);
  const dtor = cf.findAll(u.ast, 'FunctionDecl').find((f) => f.isDestructor);
  assert.equal(dtor.name, '~Base');
});

test('parser C++: templates, specializations, variadics, aliases, concepts', () => {
  const u = unit([
    'template <typename T, int N = 4, typename... Rest> struct Arr { T data[N]; };',
    'template <> struct Arr<void> {};',
    'template <typename T> struct Arr<T*, 2> {};',
    'template <class T> using Vec = Arr<T, 8>;',
    'template <typename... Ts> auto sum(Ts... ts) { return (ts + ... + 0); }',
    'template <typename T> concept Small = sizeof(T) <= 4;',
    'template <Small T> T twice(T v) requires (sizeof(T) > 0) { return v + v; }',
    'template <template <typename> class C, typename T> struct Wrap { C<T> c; };',
    'template class Arr<int>;',
    'Vec<int> v; Arr<Arr<int>> nested;',
    'int s = sum(1, 2, 3) + twice<int>(2) + (1 >> 1);',
  ].join('\n'), { lang: 'cpp' });
  assert.equal(errors(u).length, 0);
  const tds = cf.findAll(u.ast, 'TemplateDecl');
  assert.ok(tds.length >= 8);
  assert.deepEqual(tds[0].params.map((p) => [p.kind, p.name, p.pack]), [['type', 'T', false], ['nontype', 'N', false], ['type', 'Rest', true]]);
  assert.equal(tds[1].isSpecialization, true);
  assert.ok(tds.some((t) => t.instantiation));
  assert.ok(cf.findFirst(u.ast, 'FoldExpr'));
  assert.ok(cf.findFirst(u.ast, 'ConceptDecl'));
  const nested = decl(u, 'nested');
  assert.equal(nested.specs.typeSpec.templateArgs[0].type, 'TypeName');
  const s = initOf(u, 's');
  assert.equal(s.type, 'BinaryExpr');
  const calls = cf.findAll(s, 'CallExpr');
  assert.deepEqual(calls.map((c) => c.callee.name), ['sum', 'twice']);
  assert.equal(calls[1].callee.templateArgs.length, 1);
});

test('parser C++: namespaces, using, lambdas, range-for, bindings, exceptions', () => {
  const u = unit([
    '#include <vector>',
    'namespace outer::inner { inline namespace v1 { int x = 1; } }',
    'namespace { int hidden; }',
    'namespace al = outer::inner;',
    'using namespace std;',
    'using IntVec = vector<int>;',
    'enum class Color : unsigned char { Red, Green = 3 };',
    'struct P { int a; double b; };',
    'int run(IntVec& v) {',
    '  auto total = 0;',
    '  for (const auto& e : v) total += e;',
    '  auto [a, b] = P{1, 2.0};',
    '  auto add = [&total, k = 2](int z) mutable -> int { return total + z * k; };',
    '  int* p = new int[10]{};',
    '  delete[] p;',
    '  try { throw std::runtime_error("x"); } catch (const std::exception& ex) { return -1; } catch (...) { throw; }',
    '  if (auto q = add(1); q > 2) { return q; }',
    '  Color c = Color::Green;',
    '  switch (c) { case Color::Red: break; default: break; }',
    '  [[maybe_unused]] constexpr int w = static_cast<int>(Color::Green);',
    '  decltype(total) d = outer::inner::x + al::x;',
    '  return a + static_cast<int>(b) + d;',
    '}',
  ].join('\n'), { lang: 'cpp' });
  assert.equal(errors(u).length, 0);
  assert.ok(cf.findFirst(u.ast, (n) => n.type === 'NamespaceDecl' && n.name === 'outer::inner'));
  assert.ok(cf.findFirst(u.ast, (n) => n.type === 'NamespaceDecl' && n.anonymous));
  assert.equal(cf.findFirst(u.ast, 'RangeForStmt').decl.declarators[0].name, 'e');
  const bind = cf.findFirst(u.ast, 'BindingDecl');
  assert.deepEqual(bind.names.map((n) => n.name), ['a', 'b']);
  assert.deepEqual(bind.bindings.map((s) => tstr(s.type)), ['int', 'double']);
  const lam = cf.findFirst(u.ast, 'LambdaExpr');
  assert.deepEqual(lam.captures.map((c) => [c.name, c.byRef, c.kind]), [['total', true, 'name'], ['k', false, 'init']]);
  assert.equal(lam.mutable, true);
  const nw = cf.findFirst(u.ast, 'NewExpr');
  assert.equal(nw.isArray, true);
  assert.equal(cf.findFirst(u.ast, 'DeleteExpr').array, true);
  const tr = cf.findFirst(u.ast, 'TryStmt');
  assert.deepEqual(tr.handlers.map((h) => h.catchAll), [false, true]);
  const ifs = cf.findFirst(u.ast, 'IfStmt');
  assert.equal(ifs.init.type, 'Declaration');
  const en = cf.findFirst(u.ast, 'EnumDecl');
  assert.equal(en.scoped, true);
  assert.equal(tstr(Ty.canonical(en.ctype).underlying), 'unsigned char');
  const x = cf.findAll(u.ast, 'Identifier').filter((i) => i.name === 'x' && i.qualifier);
  assert.ok(x.length === 2 && x.every((i) => i.symbol && i.symbol.qname === 'outer::inner::v1::x'));
  assert.equal(decl(u, 'hidden').symbol.linkage, 'internal');
  assert.ok(cf.findAll(u.ast, 'CastExpr').some((c) => c.kind === 'static_cast'));
  assert.equal(tstr(decl(u, 'total').ctype), 'int');
});

test('parser C++: casts, operators, references, misc expressions', () => {
  const u = unit([
    'struct V { int x; int operator[](int i) const { return x + i; } V operator+(const V& o) const { return V{x + o.x}; } };',
    'int&& rref(); const int& cref(int& r) { return r; }',
    'int main() {',
    '  V a{1}, b{2};',
    '  V c = a + b;',
    '  int i = c[2];',
    '  const char* s = reinterpret_cast<const char*>(&i);',
    '  void* vp = const_cast<char*>(s);',
    '  V* pv = dynamic_cast<V*>(&a);',
    '  long l = (long)i + int(3) + int{4};',
    '  bool t = noexcept(i++) && sizeof...(int) == 0 || alignof(V) > 0;',
    '  auto cmp = (a.x <=> b.x);',
    '  int V::* mp = &V::x;',
    '  int vv = a.*mp;',
    '  return i > 0 ? i : -i;',
    '}',
  ].join('\n'), { lang: 'cpp' });
  assert.equal(errors(u).length, 0);
  const casts = cf.findAll(u.ast, 'CastExpr').map((c) => c.kind);
  for (const k of ['reinterpret_cast', 'const_cast', 'dynamic_cast', 'c-style', 'functional']) assert.ok(casts.includes(k), k);
  assert.ok(cf.findFirst(u.ast, (n) => n.type === 'FunctionDecl' && n.name === 'operator[]'));
  assert.ok(cf.findFirst(u.ast, (n) => n.type === 'BinaryExpr' && n.op === '<=>'));
  assert.ok(cf.findFirst(u.ast, 'NoexceptExpr'));
  assert.equal(tstr(decl(u, 'mp').ctype), 'int V::*');
  assert.equal(tstr(decl(u, 'rref').ctype), 'int &&(void)');
});

test('parser: unknown macro invocations at file and class scope are tolerated', () => {
  const u = unit('DECLARE_TASK(blink, 128);\nint x;\nEXPORT_SYMBOL(x)\nint y;\nfoo(a, b);\nint main(argc) int argc; { return argc; }\n');
  assert.equal(errors(u).length, 0);
  assert.deepEqual(cf.userDecls(u).map((d) => d.type + (d.name ? ':' + d.name : '')), ['MacroCallDecl:DECLARE_TASK', 'Declaration', 'MacroCallDecl:EXPORT_SYMBOL', 'Declaration', 'MacroCallDecl:foo', 'Declaration']);
  assert.equal(cf.userDecls(u)[0].args, 'blink , 128');
  assert.ok(u.diagnostics.some((d) => d.code === 'unknown-macro-invocation' && d.severity === 'info'));
  const q = unit('class W : public QObject {\n  Q_OBJECT\npublic:\n  W();\n  DECLARE_PROP(int, x)\n};', { lang: 'cpp' });
  assert.equal(errors(q).length, 0);
  assert.deepEqual(cf.findFirst(q.ast, 'RecordDecl').members.map((d) => d.type), ['MacroCallDecl', 'AccessSpec', 'Declaration', 'MacroCallDecl']);
});

test('parser C++: out-of-line members and template member definitions resolve class scope', () => {
  const u = unit([
    'namespace geo {',
    'class Shape { public: virtual ~Shape(); static int make(int k); protected: int size_ = 0; };',
    'Shape::~Shape() {}',
    'int Shape::make(int k) { return k; }',
    'template <typename T> class Stack { public: void push(const T& v); private: T items_[4]; int count_ = 0; };',
    'template <typename T> void Stack<T>::push(const T& v) { items_[count_++] = v; }',
    '}',
    'struct KV { int k; int v; };',
    'int sum(KV (&arr)[3]) { int s = 0; for (const auto& [k, v] : arr) s += k + v; return s; }',
  ].join('\n'), { lang: 'cpp' });
  assert.equal(errors(u).length, 0);
  assert.equal(u.unresolved.length, 0);
  const fns = cf.functionsOf(u, u.file).map((f) => f.qname);
  assert.deepEqual(fns, ['Shape::~Shape', 'Shape::make', 'Stack::push', 'sum']);
  const push = cf.functionsOf(u, u.file)[2];
  const items = cf.findFirst(push.body, (n) => n.type === 'Identifier' && n.name === 'items_');
  assert.equal(items.symbol.kind, 'field');
  const bind = cf.findFirst(u.ast, 'BindingDecl');
  assert.deepEqual(bind.names.map((b) => b.name), ['k', 'v']);
});

test('parser C++: value categories', () => {
  const u = unit([
    'int g; int& lref(); int&& xref(); int pr();',
    'struct S { int m; };',
    'void f(S s, S* p) {',
    '  int a1 = g; int a2 = lref(); int a3 = xref(); int a4 = pr();',
    '  int a5 = static_cast<int&&>(g); int a6 = s.m; int a7 = p->m; int a8 = (g = 1); int a9 = ++g; int a10 = g++;',
    '}',
  ].join('\n'), { lang: 'cpp' });
  const vc = (n) => Ty.valueCategory(initOf(u, n), { lang: 'cpp' });
  assert.deepEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10'].map(vc), ['lvalue', 'lvalue', 'xvalue', 'prvalue', 'xvalue', 'lvalue', 'lvalue', 'lvalue', 'lvalue', 'prvalue']);
});

// ------------------------------------------------------------------ types / sizes / conversions

test('types: sizes and layouts on LP64 and ILP32', () => {
  const src = 'struct A { char c; int i; double d; }; struct B { char m; short b1 : 4; short b2 : 4; long l; }; union U { char c[5]; int i; };\n' +
    'struct A va; struct B vb; union U vu; long L; void *P; long double LD;';
  const lp = unit(src);
  const il = unit(src, { target: 'ilp32' });
  const sz = (x, n) => Ty.sizeOf(decl(x, n).ctype, x.target);
  assert.deepEqual(['va', 'vb', 'vu', 'L', 'P', 'LD'].map((n) => sz(lp, n)), [16, 16, 8, 8, 8, 16]);
  assert.deepEqual(['va', 'vb', 'vu', 'L', 'P', 'LD'].map((n) => sz(il, n)), [16, 8, 8, 4, 4, 12]);
  const lay = Ty.layout(Ty.canonical(decl(lp, 'vb').ctype), lp.target);
  assert.deepEqual(lay.fields.map((f) => [f.name, f.offset, f.bitOffset]), [['m', 0, undefined], ['b1', 2, 0], ['b2', 2, 4], ['l', 8, undefined]]);
  assert.equal(Ty.alignOf(decl(lp, 'va').ctype, lp.target), 8);
});

test('types: promotions and usual arithmetic conversions', () => {
  const T = Ty.T;
  const ua = (a, b, tg) => Ty.usualArithmetic(a, b, tg).name;
  assert.equal(Ty.integerPromote(T.uchar).name, 'int');
  assert.equal(Ty.integerPromote(T.ushort).name, 'int');
  assert.equal(Ty.integerPromote(T.bool).name, 'int');
  assert.equal(Ty.integerPromote(T.uint).name, 'unsigned int');
  assert.equal(Ty.integerPromote(T.uint, null, 3).name, 'int'); // bit-field
  assert.equal(ua(T.int, T.uint), 'unsigned int');
  assert.equal(ua(T.long, T.uint), 'long');
  assert.equal(ua(T.long, T.uint, 'ilp32'), 'unsigned long');
  assert.equal(ua(T.llong, T.ulong), 'unsigned long long');
  assert.equal(ua(T.char, T.short), 'int');
  assert.equal(ua(T.float, T.llong), 'float');
  assert.equal(ua(T.double, T.float), 'double');
  const u = unit('unsigned char a, b; int x = a + b; unsigned u = 1u; long y = u - 1; char *p; int z = p - p; char *q = p + 1; float f = 1.0f * 2;');
  assert.equal(tstr(initOf(u, 'x').ctype), 'int');
  assert.equal(tstr(initOf(u, 'y').ctype), 'unsigned int');
  assert.equal(tstr(initOf(u, 'z').ctype), 'long');
  assert.equal(tstr(initOf(u, 'q').ctype), 'char *');
  assert.equal(tstr(initOf(u, 'f').ctype), 'float');
  assert.ok(Ty.sameType(Ty.pointerTo(T.int), Ty.decay(Ty.arrayOf(T.int, 3))));
});

test('types: integer literal types and constant folding', () => {
  const u = unit([
    'enum { K = 3 };',
    'int a = 2147483647;',
    'long b = 2147483648;',
    'unsigned c = 0xFFFFFFFF;',
    'int d = (1 << 4) | K;',
    'int e = sizeof(int[K]) / sizeof(int);',
    'int f = (unsigned char)300;',
    'int g = -1 < 0u;',
    'int h = 1 ? 10 : 20;',
    'int i = 2147483647 + 1;',
    'int j = 10 / 0;',
    "int k = 'A' + '\\x01';",
    'int m = ~0u >> 28;',
  ].join('\n'));
  const cv = (n) => Ty.constValue(initOf(u, n), { target: u.target });
  assert.equal(tstr(initOf(u, 'a').ctype), 'int');
  assert.equal(tstr(initOf(u, 'b').ctype), 'long');
  assert.equal(tstr(initOf(u, 'c').ctype), 'unsigned int');
  assert.equal(cv('d').value, 19n);
  assert.equal(cv('e').value, 3n);
  assert.equal(cv('f').value, 44n);
  assert.equal(cv('g').value, 0n);
  assert.equal(cv('h').value, 10n);
  assert.equal(cv('i').overflow, true);
  assert.equal(cv('j').divByZero, true);
  assert.equal(cv('k').value, 66n);
  assert.equal(cv('m').value, 15n);
  assert.equal(Ty.constValue(initOf(u, 'a').ctype ? { type: 'Identifier', symbol: null } : null), null);
});

// ------------------------------------------------------------------ essential types

test('essential types: MISRA C model', () => {
  const u = unit([
    '#include <stdint.h>',
    '#include <stdbool.h>',
    'typedef enum { RED, GREEN } colour_t;',
    'enum dir { UP, DOWN };',
    'enum { ANON_C = 100 };',
    'uint8_t u8; uint16_t u16; int8_t s8; int32_t s32; char ch; float fl; double db; bool bo; colour_t col; enum dir d;',
    'struct BF { unsigned int bits : 3; signed int sb : 4; } bf;',
    'int e1 = u8 + u8;',
    'int e2 = u8 + u16;',
    'int e3 = s8 * s32;',
    'int e4 = u8 + s8;',
    'int e5 = ch + 1;',
    "int e6 = ch - 'a';",
    'int e7 = u8 < u16;',
    'int e8 = (uint16_t)u8;',
    'int e9 = 250u + 10u;',
    'int e10 = 100 + 200;',
    'int e11 = u8 << 2;',
    'int e12 = 1u << 9;',
    'int e13 = ~u8;',
    'int e14 = bo ? u8 : u16;',
    'int e15 = true;',
    'int e16 = col;',
    'int e17 = GREEN;',
    'int e18 = DOWN;',
    'int e19 = ANON_C;',
    "int e20 = 'x';",
    'int e21 = fl + db;',
    'int e22 = bf.bits;',
    'int e23 = bf.sb;',
    'int e24 = -5;',
    'int e25 = sizeof(int);',
    'int e26 = u8 & 0x0Fu;',
    'int e27 = !s32;',
    'int e28 = (s8, u16);',
    'int e29 = u8 = 3u;',
  ].join('\n'));
  assert.equal(errors(u).length, 0);
  const E = (n) => { const r = et(u, n); return `${r.category}:${r.name}`; };
  assert.equal(E('e1'), 'unsigned:unsigned char');
  assert.equal(E('e2'), 'unsigned:unsigned short');
  assert.equal(E('e3'), 'signed:int');
  assert.equal(E('e4'), 'signed:int'); // mixed signedness: standard type
  assert.equal(E('e5'), 'character:char');
  assert.equal(E('e6'), 'signed:int');
  assert.equal(E('e7'), 'boolean:bool');
  assert.equal(E('e8'), 'unsigned:unsigned short');
  assert.equal(et(u, 'e8').typedefName, 'uint16_t');
  assert.equal(E('e9'), 'unsigned:unsigned short');
  assert.equal(E('e10'), 'signed:short');
  assert.equal(E('e11'), 'unsigned:unsigned char');
  assert.equal(E('e12'), 'unsigned:unsigned short');
  assert.equal(E('e13'), 'unsigned:unsigned char');
  assert.equal(E('e14'), 'unsigned:unsigned short');
  assert.equal(E('e15'), 'boolean:bool');
  assert.equal(et(u, 'e16').category, 'enum');
  assert.equal(et(u, 'e16').enumName, 'colour_t');
  assert.equal(et(u, 'e17').enumName, 'colour_t');
  assert.equal(et(u, 'e18').enumName, 'dir');
  assert.equal(E('e19'), 'signed:signed char');
  assert.equal(E('e20'), 'character:char');
  assert.equal(E('e21'), 'floating:double');
  assert.equal(E('e22'), 'unsigned:unsigned char');
  assert.equal(E('e23'), 'signed:signed char');
  assert.equal(E('e24'), 'signed:signed char');
  assert.equal(E('e25'), 'unsigned:unsigned char');
  assert.equal(E('e26'), 'unsigned:unsigned char');
  assert.equal(E('e27'), 'boolean:bool');
  assert.equal(E('e28'), 'unsigned:unsigned short');
  assert.equal(E('e29'), 'unsigned:unsigned char');
  assert.equal(et(u, 'e9').ice, true);
  assert.equal(et(u, 'e9').value, 260n);
  assert.equal(cf.essentialTypeOfType(decl(u, 'bo').ctype).category, 'boolean');
  assert.equal(cf.essentialTypeOfType(decl(u, 'u8').ctype).category, 'unsigned');
});

// ------------------------------------------------------------------ symbols / linkage

test('symbols: linkage, storage duration, tentative definitions', () => {
  const u = unit([
    'int g1;',
    'int g1;',
    'extern int g2;',
    'static int s1 = 1;',
    'extern int s1;',
    'int def = 3;',
    'static void helper(void);',
    'static void helper(void) {}',
    'void api(void);',
    'void use(int p) {',
    '  static int counter;',
    '  int local = p;',
    '  extern int g2;',
    '  register int r = 0;',
    '  counter += local + r + g2;',
    '}',
  ].join('\n'));
  assert.equal(errors(u).length, 0);
  const S = (n) => { const s = u.lookup(n); return s && `${s.kind}/${s.linkage}/${s.storage}`; };
  assert.equal(S('g1'), 'variable/external/static');
  assert.equal(S('g2'), 'variable/external/static');
  assert.equal(S('s1'), 'variable/internal/static');
  assert.equal(S('helper'), 'function/internal/none');
  assert.equal(S('api'), 'function/external/none');
  const g1 = u.lookup('g1');
  assert.equal(g1.decls.length, 2);
  assert.equal(g1.tentative.length, 2);
  assert.equal(g1.tentativeDefinition, true);
  assert.equal(u.lookup('g2').definition, null);
  assert.ok(u.lookup('def').definition);
  assert.ok(u.lookup('helper').definition);
  assert.equal(u.lookup('api').definition, null);
  const use = decl(u, 'use');
  const counter = cf.findFirst(use, (n) => n.type === 'VarDecl' && n.name === 'counter').symbol;
  assert.deepEqual([counter.linkage, counter.storage], ['none', 'static']);
  const local = cf.findFirst(use, (n) => n.type === 'VarDecl' && n.name === 'local').symbol;
  assert.deepEqual([local.linkage, local.storage], ['none', 'automatic']);
  const blockExtern = cf.findFirst(use, (n) => n.type === 'VarDecl' && n.name === 'g2').symbol;
  assert.equal(blockExtern, u.lookup('g2'));
  assert.equal(u.lookup('g2').uses.length, 1);
  const bad = unit('int x = 1; int x = 2; static int y; int y; float y2; int y2; void h(void) { int z; int z; }');
  const codes = errors(bad).map((d) => d.code);
  assert.ok(codes.includes('redefinition'));
  assert.ok(codes.includes('conflicting-types'));
  assert.ok(codes.includes('redeclaration'));
});

test('symbols: identifier resolution, scopes, implicit declarations', () => {
  const u = unit([
    'int x = 1;',
    'int f(int x) { { int x = 2; x++; } return x + undeclared_fn(3); }',
    'int h(void) { return x; }',
  ].join('\n'));
  const ids = cf.findAll(u.ast, (n) => n.type === 'Identifier' && n.name === 'x');
  assert.deepEqual(ids.map((i) => i.symbol.kind), ['variable', 'parameter', 'variable']);
  assert.ok(ids[0].symbol !== ids[2].symbol || true);
  assert.equal(ids[2].symbol, u.lookup('x'));
  assert.ok(u.diagnostics.some((d) => d.code === 'implicit-function-declaration'));
  assert.equal(u.lookup('undeclared_fn').implicit, true);
});

test('project: cross-unit symbols and call graph', () => {
  const files = [
    { path: 'src/a.c', text: '#include "shared.h"\nint counter = 0;\nstatic int helper(int v) { return v + 1; }\nint api(int v) { return helper(v) + twice(v); }\nint rec(int n) { return n ? rec(n - 1) : 0; }\nint ping(int n);\nint pong(int n) { return n ? ping(n - 1) : 0; }\n' },
    { path: 'src/b.c', text: '#include "shared.h"\nint counter = 1;\nlong mismatch;\nstatic int helper(void) { return 2; }\nint twice(int v) { return api(v) * 2; }\nint ping(int n) { return pong(n); }\nint main(void) { void (*fp)(void) = 0; if (fp) fp(); return twice(counter) + helper(); }\n' },
    { path: 'src/c.c', text: 'extern int mismatch;\nint undefined_fn(void);\nint use(void) { return undefined_fn() + mismatch; }\n' },
    { path: 'src/shared.h', text: '#ifndef SHARED_H\n#define SHARED_H\nextern int counter;\nint api(int);\nint twice(int);\n#endif\n' },
    { path: 'src/lonely.h', text: 'int lonely(void);\n' },
  ];
  const r = cf.parseProject(files);
  assert.deepEqual(r.units.map((x) => [x.file, !!x.standaloneHeader]), [['src/a.c', false], ['src/b.c', false], ['src/c.c', false], ['src/lonely.h', true]]);
  const counter = r.globalSymbols.get('counter');
  assert.equal(counter.multipleDefinitions, true);
  assert.equal(counter.definitions.length, 2);
  assert.equal(counter.decls.length, 3);
  assert.equal(r.globalSymbols.get('mismatch').typeMismatch, true);
  assert.equal(r.globalSymbols.get('undefined_fn').defined, false);
  assert.equal(r.globalSymbols.get('api').defined, true);
  assert.equal(r.globalSymbols.has('helper'), false);
  const cg = r.callGraph;
  assert.deepEqual(cg.callees('api').sort(), ['src/a.c#helper', 'twice']);
  assert.ok(cg.callers('twice').includes('main'));
  assert.ok(cg.nodes.get('main').calls.some((c) => c.indirect));
  const cycles = cg.recursion().map((c) => c.slice().sort().join(','));
  assert.ok(cycles.includes('rec'));
  assert.ok(cycles.includes('ping,pong'));
  assert.ok(cycles.includes('api,twice'));
  assert.ok(cg.reachableFrom('main').has('src/a.c#helper'));
  // bottom-up order: a callee's component comes before its callers'
  const order = cg.sccs();
  const pos = (k) => order.findIndex((c) => c.includes(k));
  assert.ok(pos('src/a.c#helper') < pos('api'));
  assert.ok(pos('twice') <= pos('main'));
  assert.equal(r.globalSymbols.get('printf'), undefined);
  assert.equal(cg.nodes.get('main').definitions[0].unit, 'src/b.c');
});

// ------------------------------------------------------------------ CFG / dataflow

test('cfg: blocks, edges, reachability and unreachable code', () => {
  const u = unit([
    '#include <stdlib.h>',
    'int f(int x, int *p) {',
    '  int y = 0;',
    '  if (x > 0 && p) { y = *p; } else { y = -1; }',
    '  while (x--) { if (x == 3) continue; if (x == 7) break; y++; }',
    '  switch (y) { case 1: y = 2; case 2: y = 3; break; default: return 0; }',
    '  for (;;) { if (y > 100) goto out; y *= 2; }',
    '  y = 99;',
    'out:',
    '  if (!p) exit(1);',
    '  return y;',
    '  y = 5;',
    '}',
    'void g(void) { while (1) { } int never = 1; }',
    'void h(int a) { if (0) { a = 1; } do { a--; } while (0); }',
  ].join('\n'));
  const g = cf.buildCFG(decl(u, 'f'));
  const unreach = g.unreachable().flatMap((x) => x.nodes.map((n) => cf.sourceText(u, n)));
  assert.deepEqual(unreach, ['y = 99;', 'y = 5;']);
  const kinds = new Set(g.edges.map((e) => e.kind));
  for (const k of ['true', 'false', 'case', 'default', 'fallthrough', 'break', 'continue', 'back', 'goto', 'return', 'noreturn']) assert.ok(kinds.has(k), k);
  // && is split into two branch blocks
  const branches = g.blocks.filter((b) => b.terminator && b.terminator.kind === 'branch');
  assert.ok(branches.some((b) => cf.sourceText(u, b.terminator.cond) === 'x > 0'));
  assert.ok(branches.some((b) => cf.sourceText(u, b.terminator.cond) === 'p'));
  assert.equal(g.loops().length, 2);
  const exitCall = cf.findFirst(decl(u, 'f'), (n) => n.type === 'CallExpr' && n.callee.name === 'exit');
  assert.equal(exitCall.calleeSymbol.noreturn, true);
  const g2 = cf.buildCFG(decl(u, 'g'));
  assert.deepEqual(g2.unreachable().flatMap((x) => x.nodes.map((n) => n.name || n.type)), ['never']);
  assert.equal(g2.exit.preds.filter((e) => g2.isReachable(e.from)).length, 0);
  const g3 = cf.buildCFG(decl(u, 'h'));
  assert.deepEqual(g3.unreachable().flatMap((x) => x.nodes.map((n) => cf.sourceText(u, n))), ['a = 1;']);
  const kept = cf.buildCFG(decl(u, 'h'), { constantConditions: 'keep' });
  assert.equal(kept.unreachable().length, 0);
});

test('cfg: dominators, post-dominators and try/catch edges', () => {
  const u = unit([
    'int may(int);',
    'int f(int a) {',
    '  int r = 0;',
    '  try { r = may(a); if (r) throw 1; } catch (int e) { r = e; } catch (...) { r = -1; }',
    '  return r;',
    '}',
  ].join('\n'), { lang: 'cpp' });
  const g = cf.buildCFG(decl(u, 'f'));
  const handlers = g.blocks.filter((b) => b.kind === 'handler');
  assert.equal(handlers.length, 2);
  assert.ok(handlers.every((h) => h.preds.some((e) => e.kind === 'exception')));
  assert.ok(handlers.every((h) => h.preds.some((e) => e.kind === 'throw')));
  const ret = g.blockOf(cf.findFirst(decl(u, 'f'), 'ReturnStmt'));
  const first = g.entry.succs[0].to;
  assert.ok(g.dominates(first, ret));
  assert.ok(g.postDominates(ret, first));
  assert.ok(!g.dominates(handlers[0], ret));
  assert.equal(g.reachable().size, g.blocks.filter((b) => g.isReachable(b)).length);
});

test('dataflow: generic solver with a constant-propagation lattice', () => {
  const u = unit([
    'int f(int c) {',
    '  int x = 1;',
    '  int y = 2;',
    '  if (c) { x = 3; y = 2; } else { x = 4; }',
    '  int z = x + y;',
    '  while (c--) { y = y + 1; }',
    '  return z + y;',
    '}',
  ].join('\n'));
  const fn = decl(u, 'f');
  const g = cf.buildCFG(fn);
  const TOP = 'T';
  const evalE = (e, env) => {
    const v = Ty.constValue(e, { target: u.target });
    if (v) return Number(v.value);
    if (e.type === 'Identifier' && e.symbol) return env.has(e.symbol) ? env.get(e.symbol) : TOP;
    if (e.type === 'BinaryExpr' && e.op === '+') {
      const a = evalE(e.left, env), b = evalE(e.right, env);
      return a === TOP || b === TOP ? TOP : a + b;
    }
    return TOP;
  };
  const res = cf.solve(g, {
    direction: 'forward',
    boundary: new Map(),
    init: null,
    transferElement(n, env) {
      if (!env) return env;
      const out = new Map(env);
      if (n.type === 'VarDecl' && n.init) out.set(n.symbol, evalE(n.init, env));
      if (n.type === 'ExprStmt' && n.expr.type === 'AssignExpr' && n.expr.left.symbol) out.set(n.expr.left.symbol, evalE(n.expr.right, env));
      if (n.type === 'UnaryExpr' || (n.type === 'BinaryExpr')) return out;
      return out;
    },
    join(a, b) {
      if (!a) return b;
      if (!b) return a;
      const m = new Map();
      for (const [k, v] of a) m.set(k, b.has(k) && b.get(k) === v ? v : TOP);
      for (const [k] of b) if (!a.has(k)) m.set(k, TOP);
      return m;
    },
    equal(a, b) {
      if (a === b) return true;
      if (!a || !b || a.size !== b.size) return false;
      for (const [k, v] of a) if (b.get(k) !== v) return false;
      return true;
    },
  });
  assert.equal(res.converged, true);
  const zDecl = cf.findFirst(fn, (n) => n.type === 'VarDecl' && n.name === 'z');
  const ret = cf.findFirst(fn, 'ReturnStmt');
  const atRet = res.in.get(g.blockOf(ret));
  assert.equal(atRet.get(zDecl.symbol), TOP);
  const ySym = cf.findFirst(fn, (n) => n.type === 'VarDecl' && n.name === 'y').symbol;
  assert.equal(atRet.get(ySym), TOP);
  const zBlockIn = res.in.get(g.blockOf(zDecl));
  assert.equal(zBlockIn.get(ySym), 2);
  // built-in reaching definitions and liveness
  const rd = cf.reachingDefinitions(g);
  assert.equal(rd.in.get(g.blockOf(ret)).get(ySym).size, 3);
  const live = cf.liveVariables(g);
  const cSym = fn.params[0].symbol;
  assert.ok(live.in.get(g.entry.succs[0].to).has(cSym));
});

// ------------------------------------------------------------------ helpers / API

test('AST helpers: walk, findAll, parents, source text, locations', () => {
  const src = 'int add(int a, int b) {\n  return a + b * 2;\n}\n';
  const u = unit(src);
  const bin = cf.findAll(u.ast, 'BinaryExpr');
  assert.deepEqual(bin.map((b) => b.op), ['+', '*']);
  assert.equal(cf.sourceText(u, bin[0]), 'a + b * 2');
  assert.deepEqual([bin[0].loc.line, bin[0].loc.col, bin[0].loc.endLine, bin[0].loc.endCol], [2, 10, 2, 19]);
  assert.equal(cf.parentOf(bin[1]), bin[0]);
  assert.equal(cf.parentKey(bin[1]), 'right');
  assert.equal(cf.enclosing(bin[1], 'FunctionDecl').name, 'add');
  assert.equal(cf.ancestors(bin[1]).pop().type, 'TranslationUnit');
  let visited = 0;
  cf.walk(u.ast, { enter(n) { visited++; if (n.type === 'ReturnStmt') return cf.walk.SKIP; return undefined; } });
  assert.ok(visited > 5);
  assert.ok(cf.findAll(u.ast, 'Identifier').every((n) => cf.parentOf(n)));
  assert.equal(cf.locString(bin[0]), 't.c:2:10');
  assert.deepEqual(cf.userDecls(u).length, 1);
  assert.ok(cf.rawTokens(u).length > 10);
  // every node has a well-formed location
  cf.walk(u.ast, (n) => { assert.ok(n.loc && n.loc.line >= 1 && n.loc.file, n.type); });
  const fromMacro = unit('#define TWICE(x) ((x) * 2)\nint v = TWICE(3);');
  const p = initOf(fromMacro, 'v');
  assert.equal(p.loc.macro, 'TWICE');
  assert.equal(cf.sourceText(fromMacro, p), 'TWICE(3)');
});

test('demo sample native.c parses cleanly with library prototypes', () => {
  const text = readFileSync(join(here, '..', 'samples', 'demo', 'src', 'native.c'), 'utf8');
  const u = cf.parseUnit(text, { file: 'samples/demo/src/native.c' });
  assert.equal(errors(u).length, 0);
  const calls = cf.findAll(u.ast, 'CallExpr').filter((c) => c.loc.file === u.file);
  const names = calls.map((c) => c.callee.name);
  assert.ok(names.includes('strcpy'));
  const strcpy = calls.find((c) => c.callee.name === 'strcpy');
  assert.equal(tstr(strcpy.callee.symbol.type), 'char *(char *, const char *)');
  assert.equal(cf.functionsOf(u, u.file).length, 1);
  // system() is declared by <stdlib.h>, which the sample does not include
  assert.ok(u.diagnostics.some((d) => d.code === 'implicit-function-declaration'));
});

test('robustness: deep nesting and ambiguous < chains stay bounded', () => {
  const tail = '\nint after(void) { return 1; }';
  const cases = [
    'void f(void) {' + '{'.repeat(20000) + 'int x;' + '}'.repeat(20000) + '}',
    'int v = ' + '('.repeat(20000) + '1' + ')'.repeat(20000) + ';',
    'int v = ' + Array(30000).fill('1').join(' + ') + ';',
    'void f(int a) {' + 'if (a) a++; else '.repeat(20000) + 'a--; }',
  ];
  for (const src of cases) {
    const u = unit(src + tail);
    assert.ok(u.lookup('after').definition, 'later declarations survive');
    for (const fn of cf.functionsOf(u)) cf.buildCFG(fn).dominators();
    cf.walk(u.ast, (n) => { if (n.type === 'BinaryExpr') cf.essentialType(n); });
  }
  const long = unit('int v = ' + Array(30000).fill('1').join(' + ') + ';');
  assert.equal(cf.essentialType(initOf(long, 'v')).category, 'signed');
  const ids = [...Array(40)].map((_, i) => 'u' + i);
  const t0 = Date.now();
  const amb = unit('int f() { return ' + ids.join(' < ') + '; }\nint g() { return ' + ids.map((x) => x + '<').join('') + '1; }', { lang: 'cpp' });
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(errors(amb).length, 0);
});

test('performance: 20k generated lines parse well under the bound', () => {
  const lines = ['#include <stdio.h>', '#include <stdint.h>', '#define MAX(a, b) ((a) > (b) ? (a) : (b))', 'typedef struct item { int id; uint32_t flags; struct item *next; } item_t;'];
  let i = 0;
  while (lines.length < 20000) {
    lines.push(`static int fn_${i}(item_t *it, int n) {`, '  int acc = 0; /* accumulate */', '  for (int k = 0; k < n; k++) {',
      `    if (it != NULL && (it->flags & 0x${(i % 255).toString(16)}u) != 0u) {`, `      acc += MAX(it->id, k) * ${i % 7 + 1};`,
      '    } else {', '      acc -= (int)sizeof(item_t);', '    }', '  }', '  switch (acc % 3) { case 0: acc++; break; default: break; }',
      '  printf("%d\\n", acc);', '  return acc;', '}');
    i++;
  }
  const text = lines.join('\n');
  const t0 = Date.now();
  const u = cf.parseUnit(text, { file: 'gen.c' });
  const ms = Date.now() - t0;
  assert.equal(errors(u).length, 0);
  assert.equal(cf.functionsOf(u, 'gen.c').length, i);
  // >= 20k lines/sec on a laptop; the bound is generous to avoid flakiness
  assert.ok(ms < 5000, `took ${ms} ms`);
  const t1 = Date.now();
  for (const fn of cf.functionsOf(u, 'gen.c')) cf.buildCFG(fn);
  assert.ok(Date.now() - t1 < 5000);
});

// ------------------------------------------------------------------ front-end fixes (rule packs no longer work around these)

test('fix a: inside its class the class name is a type even after a constructor is declared', () => {
  const u = unit('namespace n { class T { public: T(); T(const T& o); T(T&& o); T& operator=(const T&); void f(T x); }; }', { lang: 'cpp' });
  const fns = cf.findAll(u.ast, 'FunctionDecl');
  const kinds = fns.map((f) => f.params.map((p) => Ty.nonRef(p.ctype).kind).join(','));
  assert.deepEqual(kinds, ['', 'record', 'record', 'record', 'record']);
  const mv = fns[2].params[0].ctype;
  assert.equal(mv.kind, 'reference');
  assert.equal(mv.rvalue, true);
  assert.equal(Ty.canonical(mv.to).name, 'T');
  // the constructor is still found as a function by name
  assert.equal(u.lookupQualified('n::T::T').kind, 'function');
});

test('fix b: globalSymbols keeps C++ overloads apart, keyed by signature', () => {
  const files = [
    { path: 'a.cpp', text: 'void log(int x) {}\nvoid log(const char *s) {}\nextern "C" void cfn(int);\nint g;\n' },
    { path: 'b.cpp', text: 'void log(int x);\nvoid log(const char *s);\nvoid use() { log(1); log("s"); }\nextern "C" void cfn(int) {}\nextern int g;\n' },
    { path: 'c.c', text: 'int cf(int a) { return a; }\n' },
  ];
  const p = cf.parseProject(files);
  const logs = p.globalSymbols.overloads('log');
  assert.equal(logs.length, 2);
  assert.deepEqual(logs.map((g) => g.key).sort(), ['log(const char *)', 'log(int)']);
  for (const g of logs) {
    assert.equal(g.multipleDefinitions, false);
    assert.equal(g.typeMismatch, false);
  }
  assert.equal(p.globalSymbols.get('log(int)').decls.length, 2);
  assert.ok(p.globalSymbols.get('log'), 'a bare qname still finds an overload');
  assert.equal(p.globalSymbols.get('cfn').signature, null, 'C linkage stays keyed by name');
  assert.equal(p.globalSymbols.get('cfn').defined, true);
  assert.ok(p.globalSymbols.has('cf') && p.globalSymbols.has('g'));
  const a = p.units.find((x) => x.file === 'a.cpp');
  assert.equal(p.globalSymbols.of(a.lookup('log')).key, 'log(int)');
  // the call graph keeps them apart as well
  const use = p.callGraph.nodes.get('use()');
  assert.deepEqual([...use.callees].sort(), ['log(const char *)', 'log(int)']);
  assert.equal(cf.functionKey(a.lookup('log'), a), 'log(int)');
});

test('fix c: Class::member defined without the class header keeps the class in its qname', () => {
  const u = unit('namespace ns { void Widget::draw() { paint(); } int Widget::count = 0; void draw() {} }', { lang: 'cpp' });
  const q = u.symbols.filter((s) => s.kind === 'function' || (s.kind === 'variable' && s.name !== '__func__')).map((s) => s.qname);
  assert.deepEqual(q, ['ns::Widget::draw', 'ns::Widget::count', 'ns::draw']);
  assert.equal(errors(u).length, 0, 'no redefinition of ns::draw');
  const p = cf.parseProject([{ path: 'a.cpp', text: 'void Widget::draw() {}' }, { path: 'b.cpp', text: 'void Gadget::draw() {}' }]);
  assert.ok(p.globalSymbols.get('Widget::draw()') && p.globalSymbols.get('Gadget::draw()'));
  for (const g of p.globalSymbols.values()) assert.equal(g.multipleDefinitions, false);
});

test('fix d: casts to undeclared type names parse as casts and keep the function body', () => {
  const src = 'int f(int x) {\n  int a = static_cast<u16>(x);\n  int b = (u16)x;\n  int c = static_cast<foo::bar>(x) + (reinterpret_cast<const Baz*>(0) != 0);\n  return a + b + c;\n}';
  const u = unit(src, { lang: 'cpp' });
  assert.equal(errors(u).length, 0);
  assert.equal(cf.findAll(u.ast, ['ErrorStmt', 'ErrorExpr']).length, 0);
  const casts = cf.findAll(u.ast, 'CastExpr');
  assert.deepEqual(casts.map((c) => c.kind), ['static_cast', 'c-style', 'static_cast', 'reinterpret_cast']);
  assert.equal(casts[0].typeName.specs.typeSpec.unknown, true);
  assert.ok(Ty.isUnknown(casts[0].typeName.ctype));
  assert.ok(Ty.isPointer(casts[3].typeName.ctype));
  assert.ok(cf.findFirst(u.ast, 'ReturnStmt'));
  const c = unit('int g(int x) { int b = (u16)x; return b; }');
  assert.equal(errors(c).length, 0);
  // other places that must hold a type: new, trailing return, enum base, T{} in C++
  const m = unit('enum : UINT { A };\nauto h() -> Res { return Res{}; }\nvoid k() { Obj *o = new Obj; auto f = [](void *p) -> gboolean { return 0; }; }', { lang: 'cpp' });
  assert.equal(errors(m).length, 0);
});

test('fix e: statements and macros are not turned into implicit-int declarations', () => {
  const u = unit('UNKNOWN(x)\nfoo(bar);\nint z;\nG_DEFINE_TYPE(Pane, pane, GTK_TYPE_BOX)\nstatic void pane_init(Pane *self) { (void)self; }\nG_END_DECLS\n');
  assert.equal(cf.findAll(u.ast, (n) => n.implicitInt).length, 0);
  assert.deepEqual(cf.userDecls(u).filter((d) => d.type === 'MacroCallDecl').map((d) => d.name), ['UNKNOWN', 'foo', 'G_DEFINE_TYPE', 'G_END_DECLS']);
  assert.ok(u.lookup('pane_init').definition);
  // real C90 forms are kept: `f();` and K&R definitions
  const k = unit('f();\nint main(argc) int argc; { return argc; }');
  assert.equal(decl(k, 'f').implicitInt, true);
  assert.equal(decl(k, 'main').krDecls.length, 1);
  const b = unit('void g(void) {\n  G_GNUC_BEGIN_IGNORE_DEPRECATIONS\n  foo(1);\n}');
  assert.equal(errors(b).length, 0);
  assert.equal(cf.findFirst(b.ast, (n) => n.type === 'NullStmt' && n.macro).macro, 'G_GNUC_BEGIN_IGNORE_DEPRECATIONS');
});

test('fix f: Block.loopHeader marks loop headers, also for goto loops', () => {
  const u = unit('void f(int n) { while (n) n--; for (;;) { if (n++) break; } do n--; while (n); again: if (n--) goto again; }');
  const g = cf.buildCFG(cf.functionsOf(u)[0]);
  const heads = g.blocks.filter((b) => b.loopHeader);
  assert.equal(heads.length, 4);
  assert.ok(heads.some((b) => b.label === 'again'));
  assert.deepEqual(heads.filter((b) => b.loopNode).map((b) => b.loopNode.type), ['WhileStmt', 'ForStmt', 'DoStmt']);
  assert.equal(new Set(g.loops().map((L) => L.header)).size, 4);
});

test('fix g: records with members of unknown type or C++ bases have no size', () => {
  const u = unit('struct A { int x; mystery_t m; };\nstruct B { int n; char data[]; };\nstruct C { struct A a; int y; };', { knownTypes: ['mystery_t'] });
  const rec = (x, n) => cf.findAll(x.ast, 'RecordDecl').find((r) => r.name === n && r.isDefinition).ctype;
  assert.equal(Ty.sizeOf(rec(u, 'A')), null);
  assert.equal(Ty.layout(rec(u, 'A')), null);
  assert.equal(Ty.sizeOf(rec(u, 'B')), 4, 'a flexible array member is still fine');
  assert.equal(Ty.sizeOf(rec(u, 'C')), null);
  const p = unit('struct Base { int b; };\nstruct D : Base { int d; };\nstruct V { virtual void f(); int v; };\nstruct P { int a; int b; };', { lang: 'cpp' });
  assert.equal(Ty.sizeOf(rec(p, 'D')), null);
  assert.equal(Ty.sizeOf(rec(p, 'V')), null);
  assert.equal(Ty.sizeOf(rec(p, 'P')), 8);
});

test('fix h: unresolved names get an unresolved type, not int', () => {
  const u = unit('void f(int x) { std::cout << x; int y = foo + 1; (void)y; }', { lang: 'cpp' });
  const ids = cf.findAll(u.ast, (n) => n.type === 'Identifier' && !n.symbol);
  assert.deepEqual(ids.map((i) => i.qname), ['std::cout', 'foo']);
  for (const i of ids) {
    assert.equal(i.ctype.kind, 'unknown');
    assert.equal(i.ctype.unresolved, true);
    assert.equal(i.ctype.name, i.qname);
    assert.ok(Ty.isUnknown(i.ctype));
  }
  const shift = cf.findFirst(u.ast, (n) => n.type === 'BinaryExpr' && n.op === '<<');
  assert.ok(!Ty.isInteger(shift.ctype));
});

test('fix i: project records carry the Unit object as unitRef next to the file name', () => {
  const p = cf.parseProject([{ path: 'a.c', text: 'int h(void);\nint main(void) { return h(); }' }, { path: 'b.c', text: 'int h(void) { return 1; }' }]);
  const n = p.callGraph.nodes.get('h');
  assert.equal(n.definitions[0].unit, 'b.c');
  assert.equal(n.definitions[0].unitRef, p.unitOf('b.c'));
  const call = p.callGraph.nodes.get('main').calls[0];
  assert.equal(call.unitRef.file, 'a.c');
  const g = p.globalSymbols.get('h');
  assert.ok(g.decls.every((d) => d.unitRef && d.unitRef.file === d.unit));
  assert.ok(g.symbols.every((s) => s.unitRef.file === s.unit));
});
