// Files written for Octave (test/fixtures/octave): they are told from their dialect and run as Octave
// runs them — "…" is a char array with backslash escapes, # and % comments both work, function files
// with Texinfo help and %! tests work — while files in the usual dialect keep "…" as a string value.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession } from '../core/session.js';
import { createNodeFs } from '../core/fs-node.js';
import { isOctaveSource, lex } from '../core/lang/lexer.js';
import { texinfoText } from '../core/lang/interp.js';
import { outlineOf } from '../src/lib/outline.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'octave');
const src = (name) => fs.readFileSync(path.join(dir, name), 'utf8');

/** Runs code with the fixtures folder as the current folder; → everything printed. */
function run(code) {
  const out = [];
  const s = createSession({ fs: createNodeFs({ cwd: dir }), print: (t) => out.push(t), host: { post: () => {}, request: () => null } });
  const r = s.evaluate(`cd('${dir.split('\\').join('/')}'); ${code}`);
  assert.ok(r.ok, r.error && r.error.message);
  return out.join('');
}

test('the dialect is told from the source', () => {
  for (const name of ['demo.m', 'comments.m', 'oct_greet.m', 'clampv.m']) assert.equal(isOctaveSource(src(name)), true, name);
  assert.equal(isOctaveSource(src('classic.m')), false);
  assert.equal(isOctaveSource('x = 1; % comment\ny = "abc";'), false);
  assert.equal(isOctaveSource('#!/usr/bin/octave\nx = 1;'), true, 'shebang');
  assert.equal(isOctaveSource('x = 1;\n# note'), true, '# comment line');
  assert.equal(isOctaveSource('if x, y = 1; endif'), true);
  assert.equal(isOctaveSource('printf("%d\\n", 3)'), true);
  assert.equal(isOctaveSource('k++;'), true);
  assert.equal(isOctaveSource('x += 2;'), true);
  assert.equal(isOctaveSource('a = b != c;'), true);
  assert.equal(isOctaveSource('y = 2**3;'), true);
  assert.equal(isOctaveSource('do\n  k = k + 1;\nuntil k > 3'), true);
  assert.equal(isOctaveSource("s = 'it''s'; t = x'; % transpose"), false);
  assert.equal(isOctaveSource('#{\nblock\n#}\nx = 1;'), false, 'a #{ #} block alone is not a sign (both dialects accept it here)');
});

test('"…" in an Octave source: a char array with escapes; elsewhere a string value', () => {
  const oct = lex('printf("a\\tb\\n\\"q\\" \\x41\\101 \\\\");', {});
  const s = oct.find((t) => t.type === 'str');
  assert.ok(s, 'a char token');
  assert.equal(s.value, 'a\tb\n"q" AA \\');
  const classic = lex('s = "a\\tb";', {});
  assert.ok(classic.some((t) => t.type === 'dstr' && t.value === 'a\\tb'), 'the usual dialect: no escapes, a string value');
  assert.ok(lex('s = "a\\tb";', { octave: true }).some((t) => t.type === 'str' && t.value === 'a\tb'), 'forced by the option');
});

test('an Octave script runs as in Octave (functions in the script, printf, ++ / += , do-until, unwind_protect …)', () => {
  const out = run('demo');
  const want = [
    '1 squared is 1', '5 squared is 25',
    'length of name: 6, first char: O',
    '[tab\there] has 8 chars',
    '3: gamma', 'some are big', 'k = 3', '   10   20   30',
    'z = 8, ne = 0', '1,2,3,4,5 (5 values)', 'cleanup ran', 'caught: boom 42 (demo:boom)',
    'fields: a, b', 'map has one: 1', 'sum via cellfun: 12', 'a|b|c|',
    'det = -360, rows = 3, columns = 3', '0.0500 0.3000 0.0500', 'DONE',
  ];
  for (const w of want) assert.ok(out.includes(w), `missing: ${JSON.stringify(w)}\n${out}`);
});

test('comments: % and # lines, %{ %} and #{ #} blocks, trailing and continuation comments, not inside quotes', () => {
  const out = run('comments');
  assert.match(out, /^1 2 3 3\n/);
  assert.match(out, /it's % not a comment\n# not a comment either\n/);
  assert.match(out, /\n {3}1 {3}2\n {3}3 {3}4\n/, 'disp in Octave\'s layout');
  assert.doesNotMatch(out, /999/);
});

test('a file in the usual dialect is unchanged', () => {
  assert.equal(run('classic'), '1 3\n9\n');
});

test('an Octave function file: called by name, Texinfo help, %! tests and print_usage', () => {
  assert.equal(run('caller'), 'Hello, World!\n14\n');
  const help = run('help clampv');
  assert.match(help, / -- Y = clampv \(X, LO, HI\)\n -- Y = clampv \(X\)\nLimit each element of X to the range \[LO, HI\]\./);
  assert.match(help, /\n {5}clampv \(\[-1 0\.5 2\]\)\n/);
  assert.match(help, /See also: min, max\./);
  assert.doesNotMatch(help, /@|texinfo|#####/, 'no markup, no banner');
  assert.match(run('help oct_greet'), / -- S = oct_greet \(NAME\)\nGreets NAME\./);
  assert.match(run('test clampv'), /PASSES 3 out of 3 tests/);
  assert.match(run('test oct_greet'), /PASSES 1 out of 1 test/, 'the %! code of an Octave file is Octave code ("…\\n")');
});

test('texinfoText leaves other help alone and turns markup into text', () => {
  assert.equal(texinfoText('plain help\nsecond line'), 'plain help\nsecond line');
  const t = texinfoText('-*- texinfo -*-\n@deftypefn {} {} f (@var{x})\nUse @code{f} with @samp{x} @dots{} @@home.\n@end deftypefn');
  assert.equal(t, ' -- f (X)\nUse f with \'x\' ... @home.');
});

test('Octave blocks in the outline, the keywords in iskeyword', () => {
  const o = outlineOf(src('demo.m'));
  assert.deepEqual(o.map((x) => x.name), ['sq', 'describe']);
  const nested = outlineOf('function a ()\n  if x\n    y = 1;\n  endif\n  do\n    k++;\n  until k > 2\nendfunction\nfunction b ()\nendfunction\n');
  assert.deepEqual(nested.map((x) => `${x.kind}:${x.name}`), ['function:a', 'local:b']);
  const out = run("disp([iskeyword('endif'), iskeyword('until'), iskeyword('unwind_protect'), iskeyword('endx')])");
  assert.match(out, /1 +1 +1 +0/);
});

test('Octave code shows its values in Octave\'s layout; the usual dialect keeps its own', () => {
  const show = (code) => run(code);
  const oct = (code) => show(`\n# Octave code\n${code}`);   // the comment on its own line (run() puts cd(…) first)
  assert.equal(oct('x = 4'), 'x = 4\n');
  assert.equal(oct('p = pi'), 'p = 3.1416\n');
  assert.equal(oct('q = 0.001'), 'q = 1.0000e-03\n');
  assert.equal(oct('r = 0.01'), 'r = 0.010000\n');
  assert.equal(oct('u = 12345.678'), 'u = 1.2346e+04\n');
  assert.equal(oct('v = 123456789'), 'v = 123456789\n');
  assert.equal(oct('y = [1 2 3]'), 'y =\n\n   1   2   3\n\n');
  assert.equal(oct('w = [1.5 2.25]'), 'w =\n\n   1.5000   2.2500\n\n');
  assert.equal(oct('n = [1 NaN Inf]'), 'n =\n\n     1   NaN   Inf\n\n');
  assert.equal(oct('c = 3 + 4i'), 'c = 3 + 4i\n');
  assert.equal(oct('e = []'), 'e = [](0x0)\n');
  assert.equal(oct("t = 'abc'"), 't = abc\n');
  assert.equal(oct('b = true'), 'b = 1\n');
  assert.equal(oct('k = int32([1 -20 3])'), 'k =\n\n    1  -20    3\n\n');
  assert.equal(oct("s.a = 1; s.b = 'hi'; s"), 's =\n\n  scalar structure containing the fields:\n\n    a = 1\n    b = hi\n\n');
  assert.equal(oct("c = {1, 'abc'}"), 'c =\n{\n  [1,1] = 1\n  [1,2] = abc\n}\n\n');
  assert.equal(oct("disp(4); disp([1 2 3]); disp(pi); disp('hi')"), '4\n   1   2   3\n3.1416\nhi\n');
  assert.match(oct('big = 1:30'), /^big =\n\n Columns 1 through \d+:\n\n {4}1 {4}2/);
  // a function from an Octave file shows its values the Octave way, called from anywhere
  assert.equal(show('x = 4'), 'x =\n\n     4\n\n', 'the usual dialect is unchanged');
  assert.equal(show('disp(4)'), '     4\n');
});
