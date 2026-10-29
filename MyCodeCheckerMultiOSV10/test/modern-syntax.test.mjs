// Recent language versions: the semantic parsers accept the new syntax, the
// line rules do not misread it, and files are given the right language.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { detectLanguage, refineLanguage } = require('../core/languages.js');
const { classify, structuralIssues } = require('../core/metrics.js');
const { RULES } = require('../core/rules.js');
const extra = require('../core/rules-extra');
const jsParser = require('../core/sem-js/parser.js');
const { parseKotlin } = require('../core/sem-java/kparser.js');
const phpParser = require('../core/sem-php/parser.js');
const semJava = require('../core/sem-java');
const semGo = require('../core/sem-go');
const semRb = require('../core/sem-rb');

const ctx = () => ({ inactive: new Set(), root: null, options: {} });
const lineRule = (key) => [...RULES, ...(extra.RULES || [])].find((r) => r.key === key);
const fires = (key, line) => {
  const r = lineRule(key);
  r.re.lastIndex = 0;
  return r.re.test(line) && !(r.skip && r.skip(line, line));
};

// ── file recognition ──

test('newer source extensions and Ruby DSL files are recognized', () => {
  assert.equal(detectLanguage('src/a.mts'), 'ts');
  assert.equal(detectLanguage('src/a.cts'), 'ts');
  assert.equal(detectLanguage('typings/a.pyi'), 'py');
  assert.equal(detectLanguage('gui.pyw'), 'py');
  assert.equal(detectLanguage('lib/tasks/db.rake'), 'rb');
  assert.equal(detectLanguage('app.gemspec'), 'rb');
  assert.equal(detectLanguage('config.ru'), 'rb');
  assert.equal(detectLanguage('Rakefile'), 'rb');
  assert.equal(detectLanguage('sub/Gemfile'), 'rb');
  assert.equal(detectLanguage('README'), null);
});

test('files that share an extension with another format get the language of their content', () => {
  const qt = '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE TS>\n<TS version="2.1">\n<message><source>eval(x)</source></message>\n</TS>\n';
  assert.equal(detectLanguage('i18n/app_ko.ts', qt), 'xml');
  assert.equal(detectLanguage('src/app.ts', 'export const a: number = 1;\n'), 'ts');
  assert.equal(detectLanguage('Account.cls', 'VERSION 1.0 CLASS\nBEGIN\nEND\nAttribute VB_Name = "Account"\n'), 'vb6');
  assert.equal(detectLanguage('thesis.cls', '\\NeedsTeXFormat{LaTeX2e}\n\\ProvidesClass{thesis}\n'), null);
  assert.equal(detectLanguage('Account.cls', 'public with sharing class Account {\n}\n'), 'apex');
  assert.equal(detectLanguage('solve.m', 'function x = solve(A, b)\n% SOLVE\nx = A \\ b;\nend\n'), null);
  assert.equal(detectLanguage('View.m', '#import "View.h"\n@implementation View\n@end\n'), 'objc');
  assert.equal(detectLanguage('radio.pls', '[playlist]\nFile1=http://x\n'), null);
  assert.equal(detectLanguage('pkg.pls', 'CREATE OR REPLACE PACKAGE p AS\nEND p;\n'), 'plsql');
  assert.equal(detectLanguage('load.ctl', 'LOAD DATA\nINFILE \'a.csv\'\nINTO TABLE t\n'), null);
  assert.equal(refineLanguage('ts', '.ts', '\uFEFF<TS version="2.1"></TS>'), 'xml');
});

// ── TypeScript 5 ──

test('TypeScript "infer U extends C" in parentheses and "await using" parse', () => {
  const src = [
    'type E<T> = T extends readonly (infer U extends string)[] ? U : never;',
    'type F<T> = T extends [infer H extends number, ...infer R] ? H : never;',
    'type G<T> = T extends (infer U extends string ? 1 : 2) ? U : never;',
    'export async function main() {',
    '  await using conn = await open();',
    '  using res = open2();',
    '  await work(conn, res);',
    '}',
  ].join('\n');
  const ast = jsParser.parse(src, { ts: true, sourceType: 'module' });
  const fn = ast.body.find((n) => n.type === 'ExportNamedDeclaration').declaration;
  assert.deepEqual(fn.body.body.slice(0, 2).map((s) => s.kind), ['await using', 'using']);
  // "await" alone is still an expression.
  const plain = jsParser.parse('async function f(using) { await using; await g(); }', { ts: false, sourceType: 'module' });
  assert.equal(plain.body[0].body.body[0].type, 'ExpressionStatement');
});

// ── Kotlin 2 ──

test('Kotlin context parameters and when guards parse', () => {
  const u = parseKotlin([
    'context(logger: Logger, tx: Tx)',
    'fun audit(e: String) = logger.log(e)',
    'context(Logger)',
    'fun old(e: String) = info(e)',
    'class A {',
    '  context(l: Logger)',
    '  fun f() {}',
    '}',
    'fun g(x: Any) = when (x) {',
    '  is String if x.isEmpty() -> 1',
    '  else if x == 2 -> 3',
    '  else -> 2',
    '}',
  ].join('\n'));
  assert.equal(u.errors, 0, JSON.stringify(u.errorList));
  assert.deepEqual(u.funcs.map((f) => f.name), ['audit', 'old', 'g']);
});

test('a guarded when branch does not make a later branch a duplicate condition', () => {
  const text = [
    'sealed interface R { data class Ok(val v: Int?) : R; data object No : R }',
    'fun show(r: R): String = when (r) {',
    '    is R.Ok if r.v == null -> "empty"',
    '    is R.Ok -> "ok"',
    '    R.No -> "no"',
    '}',
    'fun dup(r: R): String = when (r) {',
    '    is R.Ok -> "a"',
    '    is R.Ok -> "b"',
    '    else -> "c"',
    '}',
  ].join('\n');
  const found = semJava.analyze([{ path: 'a.kt', text, lang: 'kt' }], ctx()).filter((f) => f.rule === 'sem-java:kt-duplicate-condition');
  assert.deepEqual(found.map((f) => f.line), [9]);
});

// ── PHP 8.4 ──

test('PHP asymmetric visibility keeps the read visibility of the property', () => {
  const r = phpParser.parse([
    '<?php',
    'final class A {',
    '    public private(set) string $label = "x";',
    '    protected(set) int $n = 0;',
    '    public function __construct(public private(set) int $id) {}',
    '}',
  ].join('\n'));
  assert.deepEqual(r.errors, []);
  const cls = r.ast.stmts.find((s) => s.k === 'ClassDecl');
  const props = (cls.members || cls.body || []).filter((m) => m.k === 'PropDecl');
  assert.deepEqual(props.map((p) => [...p.mods]), [['public', 'private(set)'], ['protected(set)']]);
  const ctor = (cls.members || cls.body || []).find((m) => m.k === 'Method');
  assert.deepEqual([...ctor.params[0].mods], ['public', 'private(set)']);
});

// ── Go 1.22 ──

test('without go.mod, code that needs Go 1.22 is not told about shared loop variables', () => {
  const loop = 'package p\n\nimport "fmt"\n\nfunc F(xs []int) {\n\tfor i, x := range xs {\n\t\tgo func() { fmt.Println(i, x) }()\n\t}\n}\n';
  const rule = 'sem-go:goroutine-loop-var';
  const run = (text) => semGo.analyze([{ path: 'p/a.go', text, lang: 'go' }], ctx()).filter((f) => f.rule === rule).length;
  assert.equal(run(loop), 2, 'no version known: reported');
  assert.equal(run(loop + '\nfunc G() {\n\tfor i := range 10 {\n\t\tfmt.Println(i)\n\t}\n}\n'), 0, 'range over int needs 1.22');
  assert.equal(run(loop.replace('import "fmt"', 'import (\n\t"fmt"\n\t"iter"\n)\n\nvar _ iter.Seq[int]')), 0, 'iter needs 1.23');
});

// ── Ruby 3 ──

test('deconstruct_keys(keys) is a protocol method, not an unused parameter', () => {
  const text = 'class P\n  def deconstruct_keys(keys) = { x: @x }\n  def other(keys) = { x: @x }\nend\n';
  const found = semRb.analyze([{ path: 'p.rb', text, lang: 'rb' }], ctx()).filter((f) => f.rule === 'sem-rb:unused-parameter');
  assert.deepEqual(found.map((f) => f.line), [3]);
});

// ── line rules ──

test('Python SQL formatting rule tells parameters from formatting', () => {
  assert.equal(fires('py:sql-format', 'cur.execute("SELECT * FROM t WHERE id = %s", (uid,))'), false);
  assert.equal(fires('py:sql-format', 'cur.executemany("INSERT INTO t VALUES (%s, %s)", rows)'), false);
  assert.equal(fires('py:sql-format', 'cur.execute("SELECT * FROM t WHERE name = \'%s\'" % name)'), true);
  assert.equal(fires('py:sql-format', 'cur.execute("SELECT * FROM t WHERE id = {}".format(uid))'), true);
  assert.equal(fires('py:sql-format', 'cur.execute(f"SELECT * FROM t WHERE id = {uid}")'), true);
  assert.equal(fires('py:sql-format', 'cur.execute("SELECT * FROM t WHERE id = " + uid)'), true);
});

test('Ruby system/exec rule ignores execute, exec_query and receiver methods', () => {
  // The multi-argument form and a constant command line carry no shell-built data.
  for (const line of ['conn.execute("SELECT 1")', 'conn.exec_query(sql)', 'stmt.exec(x)', 'def system(cmd)', 'system "ls", dir', 'system("tar", "czf", out, dir)', 'system("make clean")']) assert.equal(fires('rb:system', line), false, line);
  for (const line of ['system("ls #{cmd}")', 'system "ls " + dir', 'exec(cmd)', 'Kernel.system(cmd)', 'system("rm -rf #{path}", exception: true)']) assert.equal(fires('rb:system', line), true, line);
});

test('Rust SQL rule sees a format! that builds a statement before the call', () => {
  assert.equal(fires('rs:sql-format', 'let sql = format!("SELECT id FROM users WHERE name = \'{}\'", name);'), true);
  assert.equal(fires('rs:sql-format', 'conn.execute(&format!("DELETE FROM t WHERE id = {id}"), [])?;'), true);
  assert.equal(fires('rs:sql-format', 'let msg = format!("selected {} rows", n);'), false);
});

// ── comments next to new literal forms ──

test('a comment after a Rust lifetime is still a comment', () => {
  const { code } = classify("pub fn new(input: &'src str) -> Self { Self { input } } // TODO: x.unwrap()\nlet c = '\\'';  // q\n", 'slash');
  assert.equal(code[0].includes('unwrap'), false);
  assert.equal(code[1].trim(), "let c = '\\'';");
});

test('# inside strings, interpolation and shell parameter forms is not a comment', () => {
  const rb = classify('conn.execute("SELECT * FROM t WHERE n = \'#{name}\'") # note\n', 'hash').code[0];
  assert.equal(rb.trim(), 'conn.execute("SELECT * FROM t WHERE n = \'#{name}\'")');
  assert.equal(classify('url = "http://x/#frag"  # c\n', 'hash').code[0].trim(), 'url = "http://x/#frag"');
  assert.equal(classify('echo ${#arr[@]} $# # count\n', 'hash').code[0].trim(), 'echo ${#arr[@]} $#');
  assert.equal(classify("key: don't # comment\n", 'hash').code[0].trim(), "key: don't");
  assert.equal(classify('# whole line\n', 'hash').commentOnly[0], true);
  assert.equal(classify("SELECT '--' AS dash -- c\n", 'dash').code[0].trim(), "SELECT '--' AS dash");
});

test('a prose comment with a keyword is not commented-out code', () => {
  const keys = (text, kind) => structuralIssues(text, kind).issues.filter((i) => i.rule === 'common:commented-code').map((i) => i.line);
  assert.deepEqual(keys('// Edge cases for the line rules: lifetimes, raw strings.\nfn a() {}\n', 'slash'), []);
  assert.deepEqual(keys('// return compute(x);\nfn a() {}\n', 'slash'), [1]);
  assert.deepEqual(keys('# if ready:\nx = 1\n', 'hash'), [1]);
});
