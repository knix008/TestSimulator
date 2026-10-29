// Audit of the JavaScript / TypeScript / HTML / CSS line rules: realistic
// compliant code that used to be reported, next to the violations the rules
// must keep reporting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const base = require('../core/rules.js');
const extra = require('../core/rules-extra/index.js');
const js = require('../core/rules-extra/js.js');
const { structuralIssues } = require('../core/metrics.js');
const { commentKind, ruleLangsFor } = require('../core/languages.js');

const ALL = [...base.RULES, ...extra.RULES];
const byKey = (key) => {
  const r = ALL.find((x) => x.key === key);
  assert.ok(r, `rule ${key}`);
  return r;
};

// Mirrors the line loop of core/analyze.js for one rule; returns the hit lines.
function hits(key, text, lang = 'js') {
  const rule = byKey(key);
  const langs = new Set(ruleLangsFor(lang));
  if (!rule.langs.includes('*') && !rule.langs.some((l) => langs.has(l))) return [];
  const structural = structuralIssues(text, commentKind(lang));
  const out = [];
  const sourceLines = rule.scope === 'any' ? structural.lines : structural.code;
  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i];
    if (!line || !line.trim()) continue;
    if (rule.scope !== 'any' && structural.commentOnly[i] && line.trim() === '') continue;
    rule.re.lastIndex = 0;
    if (!rule.re.test(line)) continue;
    if (rule.skip && rule.skip(structural.lines[i], line, 'src/a.' + lang, { index: i, lines: structural.lines })) continue;
    out.push(i + 1);
  }
  return out;
}

const flags = (key, line, lang) => hits(key, line, lang).length > 0;

const CASES = [
  // key, lang, [bad lines], [good lines]
  ['js:child-process', 'js',
    ["cp.exec('ls ' + dir);", 'exec(`git log ${ref}`);', "require('child_process').execSync('rm -rf ' + p);"],
    ["import { spawn } from 'node:child_process';", "const cp = require('child_process');", 'const m = re.exec(a + b);', "db.exec('DELETE FROM t WHERE id = ' + id);", "spawn('git', ['log', ref]);"]],
  ['js:eqeq', 'js',
    ['if (a == b) {', 'if (a != b) {'],
    ['if (x == null) return;', 'if (undefined != y) {', "if (typeof v == 'string') {", "const s = 'a == b';", 'const re = /[=!]==?\\s*NaN/;', 'if (a === b && c !== d) {']],
  ['js:eval', 'js',
    ['eval(code);', 'window.eval(src);'],
    ['const v = this.eval(st, e.right);', '  eval(st, e) {', "const msg = 'eval() runs a string';"]],
  ['js:innerhtml', 'js',
    ['el.innerHTML = html;', 'el.innerHTML = `<b>${name}</b>`;'],
    ["el.innerHTML = '';", 'if (el.innerHTML == prev) {']],
  ['js:debugger', 'js', ['debugger;'], ['opts.debugger = true;', 'const { debugger: dbg } = cfg;']],
  ['js:with', 'js', ['with (obj) {'], ['const next = arr.with(1, 2);', 'n.vals = n.vals.with(v, sv);', '  with(k, v) {']],
  ['js:proto', 'js',
    ['obj.__proto__ = evil;', "target['__proto__'].polluted = 1;", "Foo['prototype'].bar = baz;"],
    ['const map = { __proto__: null };', "if (key === '__proto__') continue;", 'const p = Object.getPrototypeOf(o);']],
  ['js:postmessage', 'js',
    ["win.postMessage(data, '*');"],
    ["parentPort.postMessage({ type: 'done' });", 'w.postMessage({ theme }, window.location.origin);', 'worker.postMessage(job);']],
  ['js:http-url', 'js',
    ["fetch('http://api.example.com/v1');"],
    ["const NS = 'http://www.w3.org/2000/svg';", "['평문 HTTP URL입니다', 'http:// 트래픽은 읽힙니다.']", "fetch('http://localhost:3000/x');", "$schema: 'http://cyclonedx.org/schema/bom-1.5.schema.json',"]],
  ['js:alert', 'js', ["alert('Saved');"], ["Alert.alert('Saved');", "dialog.alert('x');"]],
  ['js:javascript-url', 'js', ["a.href = 'javascript:void(0)';"], ["['javascript: URL in CSS', 'Old engines run it.'],"]],
  ['js:await-in-loop', 'js',
    ['for (const f of files) await upload(f);'],
    ['for await (const chunk of stream) {', "await log('waiting for the server');", 'const forecast = await load();']],
  ['js:sql-concat', 'js',
    ['const q = "SELECT * FROM users WHERE id = " + id;', "db.query('UPDATE users SET name = ' + name);"],
    ['const SELECTED = SELECTED_COLOR + 1;', "conn.query(`DELETE FROM ${quoteId(t)} WHERE id = ?`, [id]);", "toast('Deleted ' + n + ' rows');"]],
  ['js:disable-lint', 'js',
    ['// eslint-disable-next-line no-console', 'run(); /* eslint-disable-line */'],
    ["const text = 'eslint-disable is a directive';"]],
  ['js:ts-ignore', 'ts', ['// @ts-ignore', '  // @ts-expect-error wrong overload'], ["const s = '@ts-ignore';"]],
  ['js:array-delete', 'js', ['delete items[i];'], ['delete rec[k];', 'delete doc.packages[0].versionInfo;']],
  ['js:discarded-new', 'js', ['new Logger(config);'], ['new Flow(an).run();', 'const l = new Logger(config);']],
  ['js:regexp-from-variable', 'js',
    ['const re = new RegExp(req.query.q);'],
    ["const g = new RegExp(re.source, 'g');", 'const re = new RegExp(PATTERN);', 'const r = new RegExp(String.raw`^\\d+$`);']],
  ['js:dynamic-require', 'js', ['const p = require(name);'], ['val jwt = JWT.require(alg).build();']],
  ['js:jsx-target-blank', 'js',
    ['<a href={url} target="_blank">Docs</a>'],
    ['<a href={url} target="_blank" rel="noopener noreferrer">Docs</a>', '  target="_blank"']],
  ['js:unreachable-same-line', 'js',
    ['return result; cleanup();'],
    ["return win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));"]],
  ['html:img-alt', 'html', ['<img src="a.png">'], ['<img', '<img src="a.png" alt="">']],
  ['html:inline-script', 'html',
    ['<script>', '<script type="module">'],
    ['<script type="application/ld+json">', '<script', '<script src="/app.js"></script>']],
  ['html:password-autocomplete', 'html',
    ['<input type="password" name="pw">'],
    ['<input type="password" autocomplete="current-password">', '  type="password"']],
  ['html:anchor-without-href', 'html',
    ['<a class="btn">Open</a>'],
    ['<a [routerLink]="[\'/home\']">Home</a>', '<a [href]="url">x</a>', '<a-scene embedded>']],
  ['html:autocomplete-sensitive', 'html', ['<input name="otp_code">'], ['<input name="footprint">']],
  ['css:import', 'css',
    ["@import url('theme.css');", "@import 'print.css';", "@import 'https://fonts.example.com/x';"],
    ["@import 'variables';", "@import 'mixins.scss';", '@import "tailwindcss";']],
  ['css:font-family-no-generic', 'css',
    ['font-family: "Helvetica Neue", Arial;'],
    ["font-family: 'Material Icons';", 'font-family: "Inter", Arial, sans-serif;']],
  ['css:zero-with-unit', 'css', ['margin: 0px;'], ['width: calc(0px + 2em);', '--gap: 0px;']],
  ['css:expression', 'css', ['width: expression(document.body.clientWidth);'], ['--my-expression(x)']],
];

for (const [key, lang, bad, good] of CASES) {
  test(`${key}: keeps its violations and spares the audited compliant code`, () => {
    for (const line of bad) assert.ok(flags(key, line, lang), `${key} must flag: ${line}`);
    for (const line of good) assert.ok(!flags(key, line, lang), `${key} must not flag: ${line}`);
  });
}

test('js line rules do not match inside string, template or regex literals', () => {
  for (const line of ["const msg = 'debugger; eval(x)';", 'const re = /\\beval\\s*\\(/;', 'const t = `var x = 1`;']) {
    for (const key of ['js:debugger', 'js:eval', 'js:var']) assert.ok(!flags(key, line), `${key}: ${line}`);
  }
  assert.ok(flags('js:var', 'var x = 1;'));
});

test('a line inside a multi-line template is literal when the caller passes the line context', () => {
  const text = ['const sample = `', 'if (a == b) { var x = 1; }', '`;', 'if (c == d) { var y = 2; }'].join('\n');
  assert.deepEqual(hits('js:eqeq', text), [4]);
  assert.deepEqual(hits('js:var', text), [4]);
  // without the context the line is judged on its own
  const rule = byKey('js:var');
  assert.equal(rule.skip('if (a == b) { var x = 1; }', 'if (a == b) { var x = 1; }'), false);
});

test('literalMask: strings, regexes, templates with ${} code, JSX closing tags', () => {
  const show = (l) => js.literalMask(l).map((x, i) => (x ? '_' : l[i])).join('');
  assert.equal(show("a = 'x' + b"), "a = '__ + b");
  assert.equal(show('x = /a b/g; y = a / b / c;'), 'x = /____g; y = a / b / c;');
  assert.equal(show('t = `a ${x == y} b`;'), 't = `____x == y____;');
  assert.equal(show("<p>Don't</p>"), "<p>Don't</p>");
  assert.equal(show('return </div>;'), 'return </div>;');
});
