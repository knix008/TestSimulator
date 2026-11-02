// Octave compatibility of the language: end keywords (endif, endfor, …),
// do … until, unwind_protect, # comments, ** and operator assignment (+=, ++),
// script functions, and the interpreter functions of core/lang/octave.js
// (evalc, lasterror, settings, test / demo, publish, history, debugger, …).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession } from '../core/session.js';
import { createMemoryFs } from '../core/fs-memory.js';
import { lex } from '../core/lang/lexer.js';
import { parse } from '../core/lang/parser.js';
import { reindentM } from '../src/lib/indentM.js';
import * as lang from '../core/lang/index.js';

function session(files = {}, host) {
  const out = [];
  const events = [];
  const fsys = createMemoryFs(files);
  const s = createSession({ fs: fsys, host, print: (t, st) => out.push([st, t]), onEvent: (e) => events.push(e) });
  return {
    s, out, events, fs: fsys,
    run(code) { const r = s.evaluate(code); if (!r.ok) throw new Error(r.error.message); return r; },
    fail(code) { const r = s.evaluate(code); assert.equal(r.ok, false, `expected an error from: ${code}`); return r.error; },
    v(name) { return js(s.getVariable(name)); },
    text() { return out.filter((o) => o[0] === 'out').map((o) => o[1]).join(''); },
    clearOut() { out.length = 0; },
  };
}
function js(v) {
  if (v == null) return v;
  if (v.cls === 'char') return v.dims[0] <= 1 ? String.fromCharCode(...v.re) : v;
  if (v.cls === 'string') return v.data.length === 1 ? v.data[0] : v.data;
  if (v.re) {
    const vals = Array.from(v.re);
    return vals.length === 1 ? vals[0] : vals;
  }
  if (v.cls === 'cell') return v.data.map(js);
  if (v.cls === 'struct' && v.data.length === 1) return Object.fromEntries(v.fields.map((f) => [f, js(v.data[0][f])]));
  return v;
}

// ------------------------------------------------------------------ syntax
test('Octave end keywords close their blocks', () => {
  const h = session();
  h.run([
    'x = 0;',
    'for k = 1:3, x = x + k; endfor',
    'if x == 6, a = 1; else, a = 2; endif',
    'w = 0; while w < 3, w = w + 1; endwhile',
    "switch a, case 1, b = 'one'; otherwise, b = 'other'; endswitch",
    'try, error("x:y", "bad"); catch err, m = err.message; end_try_catch',
    'parfor k = 1:2, q(k) = k; endparfor',
  ].join('\n'));
  assert.equal(h.v('x'), 6);
  assert.equal(h.v('a'), 1);
  assert.equal(h.v('w'), 3);
  assert.equal(h.v('b'), 'one');
  assert.equal(h.v('m'), 'bad');
  assert.deepEqual(h.v('q'), [1, 2]);
  // the lexer marks the form; a mismatched end keyword is a parse error
  const t = lex('if 1\nendif').find((x) => x.type === 'kw' && x.value === 'end');
  assert.equal(t.form, 'endif');
  assert.throws(() => parse('if 1\n x = 1;\nendwhile'), /endwhile/);
  // a field named like a keyword stays a field
  h.run('s.endif = 4; y = s.endif;');
  assert.equal(h.v('y'), 4);
});

test('endfunction, script functions and classdef end keywords', () => {
  const h = session({
    '/home/sq.m': 'function y = sq(x)\n  y = x.^2;\nendfunction\n',
    '/home/Pt.m': 'classdef Pt\n  properties\n    X = 1;\n  endproperties\n  methods\n    function v = twice(o)\n      v = 2 * o.X;\n    endfunction\n  endmethods\nendclassdef\n',
    '/home/scr.m': '1;\nfunction r = helper(a)\n  r = a + 100;\nendfunction\nz = helper(1);\n',
  });
  h.run('a = sq(3); p = Pt(); b = p.twice(); scr');
  assert.equal(h.v('a'), 9);
  assert.equal(h.v('b'), 2);
  assert.equal(h.v('z'), 101);
  // functions defined before statements in Command Window code
  h.run('function r = cw_f(x)\n r = -x;\nendfunction\nc = cw_f(5);');
  assert.equal(h.v('c'), -5);
});

test('do … until runs the body at least once; break and continue work', () => {
  const h = session();
  h.run('n = 0;\ndo\n  n++;\nuntil n >= 4');
  assert.equal(h.v('n'), 4);
  h.run('m = 10; do m = m + 1; until true');
  assert.equal(h.v('m'), 11);
  h.run('k = 0; s = 0;\ndo\n  k += 1;\n  if k == 2, continue; endif\n  if k > 5, break; endif\n  s += k;\nuntil k >= 100');
  assert.equal(h.v('s'), 1 + 3 + 4 + 5);
  // `do` and `until` remain usable as variable names
  h.run('do = 3; until = do + 1;');
  assert.equal(h.v('until'), 4);
});

test('unwind_protect runs the cleanup on success, error and return', () => {
  const h = session({ '/home/up.m': 'function r = up()\n  global LOG\n  r = 1;\n  unwind_protect\n    LOG(end+1) = 1;\n    return;\n  unwind_protect_cleanup\n    LOG(end+1) = 2;\n  end_unwind_protect\n  r = 3;\nend\n' });
  h.run('c = 0;\nunwind_protect\n  c = 1;\nunwind_protect_cleanup\n  c = c + 10;\nend_unwind_protect');
  assert.equal(h.v('c'), 11);
  const e = h.fail('unwind_protect\n  error("my:id", "fails");\nunwind_protect_cleanup\n  cleaned = true;\nend_unwind_protect');
  assert.equal(e.message, 'fails');
  assert.equal(h.v('cleaned'), 1);
  h.run('global LOG\nLOG = [];\nr = up();');
  assert.equal(h.v('r'), 1);
  assert.deepEqual(h.v('LOG'), [1, 2]);
});

test('# comments, #{ … #} blocks, ** and operator assignment', () => {
  const h = session();
  h.run('a = 2 ** 3; # comment\nb = [1 2 3] .** 2; % another\n#{\nnot = code(\n#}\nx = 5;\nx += 2; x -= 1; x *= 3; x /= 2;\ny = [1 2]; y .*= [3 4]; y(2) += 10;\nz = 1; z++; z--; z++;\nt = true; t |= false; t &= false;\nhold_v = 1; hold_v ^= 3;');
  assert.equal(h.v('a'), 8);
  assert.deepEqual(h.v('b'), [1, 4, 9]);
  assert.equal(h.v('x'), 9);
  assert.deepEqual(h.v('y'), [3, 18]);
  assert.equal(h.v('z'), 2);
  h.run('z2 = 1; z2 ++; ++z2; --z2; --z2;');
  assert.equal(h.v('z2'), 1);
  assert.equal(h.v('t'), 0);
  // ++ / -- inside expressions are unchanged
  h.run('p = 1 - -2; q = 3 ++4; r = (1 --2); r2 = [1 --2];');
  assert.equal(h.v('p'), 3);
  assert.equal(h.v('q'), 7);
  assert.equal(h.v('r'), 3);
  assert.deepEqual(h.v('r2'), [1, 2]);
  // != and ! were already accepted
  h.run('u = 3 != 4; v = !true;');
  assert.equal(h.v('u'), 1);
  assert.equal(h.v('v'), 0);
  // command syntax still works, and `x += 1` is not a command even for a new name
  h.run('format long\nformat short\nnewvar = 1; newvar += 1;');
  assert.equal(h.v('newvar'), 2);
});

test('problems panel and auto indent understand the new syntax', () => {
  const h = session();
  assert.deepEqual(h.s.check('x = 1;\ndo\n  x++;\nuntil x > 3\nif x, disp(x), endif\n').filter((p) => p.severity === 'error'), []);
  assert.deepEqual(h.s.check('# note\nq = 1;\nq += 1;\nunwind_protect\n  q++;\nunwind_protect_cleanup\n  disp(q)\nend_unwind_protect\n').filter((p) => p.severity !== 'info'), []);
  assert.ok(h.s.check('w = undefined_thing_zz + 1;\n').some((p) => p.code === 'undefined'));
  const src = 'do\nx++;\nuntil x > 3\nunwind_protect\ny = 1;\nunwind_protect_cleanup\ny = 2;\nend_unwind_protect\nif a\nb = 1;\nendif\n# c\nfor k = 1:2\nz = k;\nendfor';
  assert.equal(reindentM(src, '  '), 'do\n  x++;\nuntil x > 3\nunwind_protect\n  y = 1;\nunwind_protect_cleanup\n  y = 2;\nend_unwind_protect\nif a\n  b = 1;\nendif\n# c\nfor k = 1:2\n  z = k;\nendfor');
});

// ------------------------------------------------------------------ evaluation and errors
test('evalc captures output; lasterror; nthargout; isargout; print_usage', () => {
  const h = session({
    '/home/outs.m': 'function [a, b, c] = outs()\n  a = isargout(1); b = isargout(2); c = isargout(3);\n  global SEEN\n  SEEN = [isargout(1) isargout(2) isargout(3)];\nend\n',
    '/home/pu.m': 'function pu(x)\n% PU does a thing.\n%   pu(x) with one input.\n  print_usage();\nend\n',
  });
  h.run('s = evalc("disp(42); y = 3");');
  assert.match(h.v('s'), /42\n/);
  assert.match(h.v('s'), /y =/);
  h.run('s2 = evalc("error(\'boom\')", "disp(\'caught\')");');
  assert.equal(h.v('s2'), 'caught\n');
  h.run('try, error("a:b", "first"); catch, end\nle = lasterror();');
  assert.deepEqual([h.v('le').message, h.v('le').identifier], ['first', 'a:b']);
  h.run("lasterror('reset'); le2 = lasterror();");
  assert.equal(h.v('le2').message, '');
  h.run('n2 = nthargout(2, @max, [1 9 3]); c = nthargout([1 2], @size, ones(2, 5));');
  assert.equal(h.v('n2'), 2);
  assert.deepEqual(h.v('c'), [2, 5]);
  h.run('global SEEN\n[~, q] = outs(); s1 = SEEN;\n[p1, ~, p3] = outs(); s2 = SEEN;\nouts(); s3 = SEEN;');
  assert.deepEqual(h.v('s1'), [0, 1, 0]);
  assert.deepEqual(h.v('s2'), [1, 0, 1]);
  assert.deepEqual(h.v('s3'), [1, 0, 0]);
  const e = h.fail('pu(1)');
  assert.match(e.message, /Invalid call to pu/);
  assert.equal(e.identifier, 'Octave:invalid-fun-call');
});

test('assert compares values; fail and assert_equal', () => {
  const h = session();
  h.run('assert([1 2 3], [1 2 3]); assert(pi, 3.1416, 1e-4); assert(100, 101, -0.02); assert("abc", "abc"); assert({1, "a"}, {1, "a"});');
  h.run('assert(true, "message form still works"); assert(1 == 1, "id:x", "fmt %d", 3);');
  assert.match(h.fail('assert([1 2 3], [1 2 4])').message, /Abs err 1 exceeds tol 0/);
  assert.match(h.fail('assert(single(1), 1)').message, /Class single != double/);
  assert.match(h.fail('assert([1 2], [1 2 3])').message, /Dimensions don't match/);
  assert.match(h.fail('assert(false, "custom %d", 7)').message, /custom 7/);
  h.run('fail("error(\'abc\')", "ab"); fail("warning(\'careful\')", "warning", "care"); assert_equal(1:3, [1 2 3]);');
  assert.match(h.fail('fail("x = 1;")').message, /but got none/);
  assert.match(h.fail('assert_equal(1, 2)').message, /ASSERT errors/);
});

test('parseparams, symvar, typeinfo, is_function_handle, isglobal, errno', () => {
  const h = session();
  h.run('[r, p] = parseparams({1, 2, "Color", "red"});\n[r2, c, w] = parseparams({5, "width", 3}, "Color", "blue", "Width", 1);');
  assert.deepEqual(h.v('r'), [1, 2]);
  assert.deepEqual(h.v('p'), ['Color', 'red']);
  assert.deepEqual([h.v('r2'), h.v('c'), h.v('w')], [[5], 'blue', 3]);
  h.run('v = symvar("a*sin(x) + b^2 + pi");');
  assert.deepEqual(h.v('v'), ['a', 'b', 'x']);
  h.run('t = {typeinfo(1), typeinfo([1 2]), typeinfo(1+2i), typeinfo(true), typeinfo([true false]), typeinfo(\'s\'), typeinfo({}), typeinfo(struct()), typeinfo(int8(1)), typeinfo(single([1 2])), typeinfo(@sin), typeinfo([])};');
  assert.deepEqual(h.v('t'), ['scalar', 'matrix', 'complex scalar', 'bool', 'bool matrix', 'sq_string', 'cell', 'scalar struct', 'int8 scalar', 'float matrix', 'function handle', 'null_matrix']);
  h.run('f1 = is_function_handle(@sin); f2 = is_function_handle("sin"); global G\nG = 1; g1 = isglobal("G"); g2 = isglobal("f1");');
  assert.deepEqual([h.v('f1'), h.v('f2'), h.v('g1'), h.v('g2')], [1, 0, 1, 0]);
  h.run('e1 = errno("ENOENT"); e2 = errno("NOPE"); old = errno(5); now = errno(); L = errno_list();');
  assert.deepEqual([h.v('e1'), h.v('e2'), h.v('old'), h.v('now'), h.v('L').EACCES], [2, -1, 0, 5, 13]);
});

// ------------------------------------------------------------------ settings
test('settings: max_recursion_depth, silent_functions, debug_on_error, "local" restore', () => {
  const h = session({
    '/home/rec.m': 'function r = rec(n)\n  if n == 0, r = 0; else, r = 1 + rec(n - 1); end\nend\n',
    '/home/loud.m': 'function loud()\n  x = 7\nend\n',
    '/home/tmpset.m': 'function v = tmpset()\n  max_recursion_depth(42, "local");\n  v = max_recursion_depth();\nend\n',
  });
  h.run('d0 = max_recursion_depth(); old = max_recursion_depth(10);');
  assert.equal(h.v('old'), h.v('d0'));
  assert.match(h.fail('rec(50)').message, /recursion/i);
  h.run('max_recursion_depth(500); r = rec(50);');
  assert.equal(h.v('r'), 50);
  h.clearOut();
  h.run('silent_functions(true); loud(); silent_functions(false);');
  assert.doesNotMatch(h.text(), /x =/);
  h.run('loud();');
  assert.match(h.text(), /x =/);
  h.run('v = tmpset(); after = max_recursion_depth();');
  assert.deepEqual([h.v('v'), h.v('after')], [42, 500]);
  h.run('debug_on_error(true); a = debug_on_error(); debug_on_error(false); b = debug_on_error();');
  assert.deepEqual([h.v('a'), h.v('b')], [1, 0]);
  h.run('m = max_stack_depth(); mfe = mfile_encoding(); bo = beep_on_error(); dw = debug_on_warning(); di = debug_on_interrupt();');
  assert.deepEqual([h.v('m'), h.v('mfe'), h.v('bo'), h.v('dw'), h.v('di')], [1024, 'utf-8', 0, 0, 0]);
  assert.throws(() => h.run('max_recursion_depth(-1)'), /non-negative/);
});

test('missing_function_hook, autoload, mlock, memoize, localfunctions', () => {
  const h = session({
    '/home/lib/impl.m': 'function r = impl(x)\n  r = x * 1000;\nend\nfunction r = aliasfn(x)\n  r = -x;\nend\n',
    '/home/hook.m': 'function hook(name)\n  global MISSING\n  MISSING = name;\nend\n',
    '/home/lf.m': 'function c = lf()\n  c = localfunctions();\nend\nfunction a1()\nend\nfunction a2()\nend\n',
    '/home/lk.m': 'function lk()\n  mlock();\nend\n',
  });
  h.run('global MISSING\nmissing_function_hook("hook");');
  h.fail('no_such_function_here(1)');
  h.run('global MISSING\nm = MISSING; missing_function_hook("");');
  assert.equal(h.v('m'), 'no_such_function_here');
  h.run('autoload("aliasfn", "/home/lib/impl.m"); y = aliasfn(4); al = autoload();');
  assert.equal(h.v('y'), -4);
  assert.equal(h.v('al').function, 'aliasfn');
  h.run('lk(); t1 = mislocked("lk"); munlock("lk"); t2 = mislocked("lk");');
  assert.deepEqual([h.v('t1'), h.v('t2')], [1, 0]);
  h.run('global CALLS\nCALLS = 0;\nf = @(x) x.^2;\nmf = memoize(f);\na = mf(3); b = mf(3); c = mf(4);');
  assert.deepEqual([h.v('a'), h.v('b'), h.v('c')], [9, 9, 16]);
  h.run('clearAllMemoizedCaches(); d = mf(3);');
  assert.equal(h.v('d'), 9);
  h.run('c = lf(); n = numel(c); names = cellfun(@func2str, c, "UniformOutput", false);');
  assert.equal(h.v('n'), 2);
  assert.deepEqual([...h.v('names')].sort(), ['a1', 'a2']);
});

// ------------------------------------------------------------------ paths, help, history
test('load path helpers, help text, history', () => {
  const h = session({ '/home/lib/data.txt': 'x', '/home/lib/sub/x.m': 'y = 1;', '/home/doc1.m': 'function doc1()\n% DOC1 Does one thing. And more.\n%   Second line.\nend\n' });
  h.run('addpath("/home/lib"); p = file_in_loadpath("data.txt"); none = file_in_loadpath("nope.txt"); d = dir_in_loadpath("sub"); fp = file_in_path("/home/lib", "data.txt");');
  assert.equal(h.v('p'), '/home/lib/data.txt');
  assert.deepEqual(h.v('none'), []);
  assert.equal(h.v('d'), '/home/lib/sub');
  assert.equal(h.v('fp'), '/home/lib/data.txt');
  h.run('[t, f] = get_help_text("doc1"); s = get_first_help_sentence("doc1"); [t2, f2] = get_help_text_from_file("/home/doc1.m"); [t3, f3] = get_help_text("not_a_function_x");');
  assert.match(h.v('t'), /DOC1 Does one thing/);
  assert.equal(h.v('f'), 'plain text');
  assert.equal(h.v('s'), 'DOC1 Does one thing.');
  assert.match(h.v('t2'), /Second line/);
  assert.equal(h.v('f3'), 'Not found');
  h.run('restoredefaultpath(); cl = command_line_path(); rehash();');
  assert.equal(h.v('cl'), '');
  h.run('savepath("/home/saved_pathdef.m");');
  assert.match(h.fs.readText('/home/saved_pathdef.m'), /function p = pathdef/);
  h.run('hist_a = 1;');
  h.run('hist_a = hist_a + 1;');
  h.run('c = history();');
  const hist = h.v('c');
  assert.ok(hist.includes('hist_a = hist_a + 1;'));
  h.run('run_history(-2);');
  assert.equal(h.v('hist_a'), 3);
  h.clearOut();
  h.run('history -q 2');
  assert.match(h.text(), /run_history\(-2\);\nhistory -q 2\n$/);
});

test('input event hooks run after each Command Window command; atexit and exit', () => {
  const h = session({ '/home/tick.m': 'function tick(d)\n  global TICKS\n  TICKS(end+1) = d;\nend\n', '/home/bye.m': 'function bye()\n  global BYE\n  BYE = 1;\nend\n' });
  h.run('global TICKS\nTICKS = []; id = add_input_event_hook(@tick, 7);');
  h.run('x = 1;');
  h.run('remove_input_event_hook(id);');
  h.run('y = 2;');
  h.run('global TICKS\nn = numel(TICKS);');
  assert.equal(h.v('n'), 2);
  h.run('global BYE\natexit("bye");');
  const r = h.s.evaluate('exit(3)');
  assert.equal(r.ok, true);
  assert.equal(r.exit, 3);
  assert.equal(h.v('BYE'), 1);
  assert.ok(h.events.some((e) => e.type === 'exit' && e.status === 3));
});

// ------------------------------------------------------------------ test / demo / publish
const TESTED = [
  'function y = tested(x)',
  '  y = 2 * x;',
  'endfunction',
  '%!assert (tested (2), 4)',
  '%!test',
  '%! a = tested (3);',
  '%! assert (a, 6);',
  '%!shared k',
  '%! k = 10;',
  '%!assert (tested (k), 20)',
  '%!error <must be> error ("x must be positive")',
  '%!error id=my:id error ("my:id", "with id")',
  '%!warning <careful> warning ("be careful")',
  '%!xtest',
  '%! assert (tested (1), 3)',
  '%!function r = helper2 (v)',
  '%!  r = v + 1;',
  '%!endfunction',
  '%!assert (helper2 (1), 2)',
  '%!demo',
  '%! z = tested (21);',
  '%! disp (z)',
  '',
].join('\n');

test('test runs %! blocks; demo and example show and run %!demo', () => {
  const h = session({ '/home/tested.m': TESTED, '/home/broken.m': 'function broken()\nend\n%!assert (1, 2)\n%!test\n%! assert (true)\n', '/home/t/tb2.m': TESTED.replace(/tested/g, 'tb2') });
  h.run('[ok, n, nmax, nxfail] = test("tested");');
  assert.deepEqual([h.v('ok'), h.v('n'), h.v('nmax'), h.v('nxfail')], [1, 7, 8, 1]);
  h.clearOut();
  h.run('test tested');
  assert.match(h.text(), /PASSES 7 out of 8 tests/);
  h.clearOut();
  h.run('[ok2, n2, nmax2] = test("broken", "quiet");');
  assert.deepEqual([h.v('ok2'), h.v('n2'), h.v('nmax2')], [0, 1, 2]);
  h.run('test broken');
  assert.match(h.text(), /!!!!! test failed/);
  h.clearOut();
  h.run('demo tested');
  assert.match(h.text(), /tested example 1:/);
  assert.match(h.text(), /42/);
  h.run('[code, idx] = example("tested");');
  assert.match(h.v('code'), /z = tested \(21\);/);
  assert.equal(h.v('idx'), 1);
  h.clearOut();
  h.run('oruntests("/home/t");');
  assert.match(h.text(), /tb2\.m\s+PASS\s+7\/8/);
  h.clearOut();
  h.run('rundemos("/home/t");');
  assert.match(h.text(), /42/);
});

test('publish writes HTML (and LaTeX); grabcode reads the code back', () => {
  const script = '%% My report\n% Some text.\nx = 6 * 7\n%% Second part\ny = x + 1;\ndisp(y)\n';
  const h = session({ '/home/rep.m': script });
  h.run('out = publish("rep.m");');
  assert.equal(h.v('out'), '/home/html/rep.html');
  const html = h.fs.readText('/home/html/rep.html');
  assert.match(html, /<h1>My report<\/h1>/);
  assert.match(html, /<h2>Second part<\/h2>/);
  assert.match(html, /<pre class="codeoutput">x =[\s\S]*42/);
  assert.match(html, /<pre class="codeoutput">\s*43<\/pre>/);
  h.run('code = grabcode("/home/html/rep.html");');
  assert.equal(h.v('code'), script);
  h.run('out2 = publish("rep.m", "latex");');
  assert.match(h.fs.readText(h.v('out2')), /\\begin\{verbatim\}/);
  // the published run does not touch the caller's workspace
  assert.equal(h.s.getVariable('x'), null);
});

test('speed measures run times; profshow and profexport', () => {
  const h = session({ '/home/work.m': 'function work()\n  s = 0; for k = 1:200, s = s + k; end\nend\n' });
  h.run('[order, n, t1, t2] = speed("v = zeros(1, n); for i = 1:n, v(i) = i; end", "", 50, "v = 1:n;", 0);');
  assert.ok(Array.isArray(h.v('n')) && h.v('n').length >= 5);
  assert.equal(h.v('t1').length, h.v('n').length);
  assert.equal(h.v('t2').length, h.v('n').length);
  assert.ok(Number.isFinite(h.v('order').p));
  h.run('profile on; work(); work(); profile off;');
  h.clearOut();
  h.run('profshow(5)');
  assert.match(h.text(), /work/);
  h.run('profexport("/home/prof");');
  assert.match(h.fs.readText('/home/prof/index.html'), /work/);
});

// ------------------------------------------------------------------ debugger
test('debugger: dbwhere, dbup / dbdown move the evaluation frame, dblist, dbtype, isdebugmode', () => {
  const replies = ['dbwhere', 'v_in = isdebugmode();', 'dbup', 'seen_up = q;', 'dbdown', 'seen_down = b;', 'dblist(2)', 'dbcont'];
  const asked = [];
  const host = { post() {}, request(m) { if (m.type !== 'debug.paused') return null; asked.push(m); const r = replies.shift(); return r === 'dbcont' ? 'continue' : { eval: r }; } };
  const files = { '/home/inner.m': 'function r = inner(b)\n  r = b + 1;\n  keyboard;\n  r = r * 2;\nend\n', '/home/outer.m': 'function r = outer()\n  q = 99;\n  r = inner(5);\nend\n' };
  const h = session(files, host);
  h.run('res = outer();');
  assert.equal(h.v('res'), 12);
  const text = h.text();
  assert.match(text, /stopped in inner at line 3/);
  assert.match(text, /stopped in outer at line 3/);
  assert.match(text, /-->\s*3\s+keyboard;/);
  h.run('dbstatus;');
  // values read through the moved frame were assigned there (outer / inner workspaces), not the base
  assert.equal(h.s.getVariable('seen_up'), null);
  h.clearOut();
  h.run('dbtype inner');
  assert.match(h.text(), /1\s+function r = inner\(b\)\n2\s+r = b \+ 1;/);
  h.clearOut();
  h.run('dbtype inner 2:3');
  assert.doesNotMatch(h.text(), /function/);
  h.run('m = isdebugmode();');
  assert.equal(h.v('m'), 0);
  h.clearOut();
  h.run('dbwhere');
  assert.match(h.text(), /stopped at top level/);
  assert.match(h.fail('dbup').message, /only available while debugging/);
});

test('GUI windows post events; loadobj / saveobj / numArgumentsFromSubscript defaults', () => {
  const h = session();
  h.run('x = 1; commandhistory; filebrowser; workspace; openvar("x");');
  const panes = h.events.filter((e) => e.type === 'showPane').map((e) => e.pane);
  assert.deepEqual(panes, ['history', 'files', 'workspace']);
  assert.ok(h.events.some((e) => e.type === 'openVariable' && e.name === 'x'));
  h.run('a = loadobj(5); b = saveobj("t"); c = {1, 2, 3}; s = substruct("{}", {":"}); n = numArgumentsFromSubscript(c, s, 1); s2 = substruct("()", {1}); n2 = numArgumentsFromSubscript(c, s2, 1);');
  assert.deepEqual([h.v('a'), h.v('b'), h.v('n'), h.v('n2')], [5, 't', 3, 1]);
  h.run('src = "# hello"; source_file = "/home/src1.m";');
  h.fs.writeText('/home/src1.m', 'function f_in_src()\nend\nsourced = 5;\n');
  h.run('source("/home/src1.m");');
  assert.equal(h.v('sourced'), 5);
});

test('every language builtin has English and Korean help with syntax', () => {
  for (const name of Object.keys(lang.builtins)) {
    const hp = lang.help[name];
    if (['dbcont', 'dbstep', 'dbquit'].includes(name) && hp) continue;
    assert.ok(hp, `help for ${name}`);
    assert.ok(hp.en && hp.ko && Array.isArray(hp.syntax) && hp.syntax.length > 0, `complete help for ${name}`);
    assert.ok(/[가-힣]/.test(hp.ko), `Korean text for ${name}`);
  }
});

test('the new language files follow the product-name rule', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const banned = new RegExp(['mat', 'lab', '|', 'sim', 'ulink'].join(''), 'i');
  for (const f of [path.join(here, '..', 'core', 'lang', 'octave.js'), fileURLToPath(import.meta.url)]) assert.ok(!banned.test(fs.readFileSync(f, 'utf8')), path.basename(f));
});
