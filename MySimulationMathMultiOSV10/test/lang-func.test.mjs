// Language: control flow, functions on the path, local/nested/private/package
// functions, handles and closures, variable arguments, globals, persistent
// variables, scripts and the evaluation builtins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionWith } from '../core/lang/session.js';
import { createMemoryFs } from '../core/fs-memory.js';

function session(files = {}, opts = {}) {
  const out = [];
  const fs = createMemoryFs(files);
  const s = createSessionWith(null, { fs, print: (t, st) => out.push([st, t]), ...opts });
  return {
    s, out, fs,
    run(code) { const r = s.evaluate(code); if (!r.ok) throw Object.assign(new Error(r.error.message), { id: r.error.identifier }); return r; },
    fail(code) { const r = s.evaluate(code); assert.equal(r.ok, false, `expected an error from: ${code}`); return r.error; },
    v(name) { return js(s.getVariable(name)); },
    raw(name) { return s.getVariable(name); },
    text(stream = 'out') { return out.filter((o) => o[0] === stream).map((o) => o[1]).join(''); },
  };
}
function js(v) {
  if (v == null) return v;
  if (v.cls === 'char') return String.fromCharCode(...v.re);
  if (v.cls === 'string') return v.data.length === 1 ? v.data[0] : v.data;
  if (v.re) { const a = Array.from(v.re); return a.length === 1 ? a[0] : a; }
  if (v.cls === 'cell') return v.data.map(js);
  if (v.cls === 'struct' && v.data.length === 1) return Object.fromEntries(v.fields.map((f) => [f, js(v.data[0][f])]));
  return v;
}

test('loops: while with break/continue, for over ranges, matrices and cells', () => {
  const h = session({
    '/home/firstOver.m': 'function i = firstOver(v, t)\nfor i = 1:numel_(v)\n  if v(i) > t\n    return\n  end\nend\ni = -1;\nend\nfunction n = numel_(v)\nn = 0; for k = v, n = n + 1; end\nend\n',
  });
  h.run('n = 0; k = 0; while 1, k = k + 1; if k > 10, break; end; if k == 3 || k == 5, continue; end; n = n + k; end');
  assert.equal(h.v('n'), 47);
  h.run('s = 0; for i = 10:-2:1, s = s + i; end; c = 0; for col = [1 2; 3 4], c = c + col(1) * col(2); end; t = \'\'; for e = {\'a\', \'b\'}, t = [t e{1}]; end; z = 0; for q = [], z = 1; end');
  assert.equal(h.v('s'), 30);
  assert.equal(h.v('c'), 3 + 8);
  assert.equal(h.v('t'), 'ab');
  assert.equal(h.v('z'), 0);
  h.run('a = firstOver([1 5 9], 4); b = firstOver([1 2], 4);');
  assert.equal(h.v('a'), 2);
  assert.equal(h.v('b'), -1);
  h.run('i = 7; for i = 1:3, end; last = i; for j = 1:0, end;');
  assert.equal(h.v('last'), 3);
  assert.deepEqual(h.raw('j').dims, [1, 0]);
});

test('switch with numbers, text and cell cases', () => {
  const h = session();
  h.run("function_ = 0; v = 'two'; switch v, case 'one', r = 1; case {'two', 'deux'}, r = 2; otherwise, r = 0; end; n = 3; switch n, case 1, m = 'a'; case {2, 3}, m = 'b'; end; switch 9, case 1, o = 1; otherwise, o = 'other'; end; switch \"x\", case 'x', w = 1; end");
  assert.equal(h.v('r'), 2);
  assert.equal(h.v('m'), 'b');
  assert.equal(h.v('o'), 'other');
  assert.equal(h.v('w'), 1);
});

test('functions on the path: outputs, nargin, nargout, varargin, varargout', () => {
  const h = session({
    '/home/stats2.m': 'function [s, p, n] = stats2(varargin)\n% STATS2 sum and product\nn = nargin;\ns = 0; p = 1;\nfor k = 1:nargin\n  s = s + varargin{k}; p = p * varargin{k};\nend\nif nargout < 2, p = []; end\nend\n',
    '/home/spread.m': 'function varargout = spread(v)\nfor k = 1:nargout\n  varargout{k} = v(k);\nend\nend\n',
    '/home/noout.m': 'function noout(x)\nassignin(\'base\', \'touched\', x);\nend\n',
  });
  h.run('[a, b, c] = stats2(2, 3, 4); d = stats2(5); [x, y] = spread([7 8 9]); noout(11);');
  assert.equal(h.v('a'), 9);
  assert.equal(h.v('b'), 24);
  assert.equal(h.v('c'), 3);
  assert.equal(h.v('d'), 5);
  assert.equal(h.v('x'), 7);
  assert.equal(h.v('y'), 8);
  assert.equal(h.v('touched'), 11);
  assert.match(h.fail('q = noout(1)').message, /Too many output arguments/);
  assert.match(h.fail('stats2_ = 1; [a1, a2, a3, a4] = stats2(1)').message, /Too many output arguments/);
  h.run('ni = nargin(\'stats2\'); no = nargout(\'stats2\');');
  assert.equal(h.v('ni'), -1);
  assert.equal(h.v('no'), 3);
  assert.match(h.fail('spread(1, 2)').message, /Too many input arguments/);
});

test('unassigned outputs and tilde outputs', () => {
  const h = session({
    '/home/maybe.m': 'function [a, b] = maybe(flag)\na = 1;\nif flag, b = 2; end\nend\n',
    '/home/ign.m': 'function r = ign(~, y)\nr = y;\nend\n',
  });
  h.run('[p, q] = maybe(1); [~, w] = maybe(1); r = ign(1, 2);');
  assert.equal(h.v('q'), 2);
  assert.equal(h.v('w'), 2);
  assert.equal(h.v('r'), 2);
  assert.match(h.fail('[p, q] = maybe(0);').message, /Output argument "b" \(and possibly others\) not assigned/);
});

test('local functions, subfunction precedence and recursion', () => {
  const h = session({
    '/home/fact.m': 'function r = fact(n)\nif n <= 1\n  r = 1;\nelse\n  r = n * fact(n - 1);\nend\nend\n',
    '/home/main1.m': 'function r = main1(x)\nr = helper(x) + 1;\nend\nfunction r = helper(x)\nr = 10 * x;\nend\n',
    '/home/helper.m': 'function r = helper(x)\nr = -1;\nend\n',
  });
  h.run('a = fact(10); b = main1(2); c = helper(2);');
  assert.equal(h.v('a'), 3628800);
  assert.equal(h.v('b'), 21);
  assert.equal(h.v('c'), -1);
});

test('nested functions share variables with their parent', () => {
  const h = session({
    '/home/counter.m': 'function [r, h] = counter()\ncount = 0;\nbump(); bump(); bump();\nr = count;\nh = @bump;\n  function bump()\n    count = count + 1;\n  end\nend\n',
    '/home/acc.m': 'function f = acc(start)\ntotal = start;\nf = @add;\n  function t = add(x)\n    total = total + x;\n    t = total;\n  end\nend\n',
  });
  h.run('[r, hb] = counter(); f = acc(10); a = f(1); b = f(5); g = acc(0); c = g(2); d = f(0);');
  assert.equal(h.v('r'), 3);
  assert.equal(h.v('a'), 11);
  assert.equal(h.v('b'), 16);
  assert.equal(h.v('c'), 2);
  assert.equal(h.v('d'), 16);
});

test('anonymous functions capture values at creation', () => {
  const h = session();
  h.run('k = 2; f = @(x) k * x; k = 100; a = f(3); g = @() 42; b = g(); h2 = @(x, y) x + y; c = h2(1, 2); comp = @(x) f(f(x)); d = comp(1); m = @(v) v(end); e = m([4 5 6]);');
  assert.equal(h.v('a'), 6);
  assert.equal(h.v('b'), 42);
  assert.equal(h.v('c'), 3);
  assert.equal(h.v('d'), 4);
  assert.equal(h.v('e'), 6);
  h.run('s = func2str(f); t = func2str(@sin); u = str2func(\'@(z) z + 1\'); w = u(1);');
  assert.equal(h.v('s'), '@(x)k*x');
  assert.equal(h.v('t'), 'sin');
  assert.equal(h.v('w'), 2);
  h.run('mo = @() deal(1, 2); [p, q] = mo();');
  assert.equal(h.v('q'), 2);
});

test('handles to path and local functions; feval', () => {
  const h = session({
    '/home/apply2.m': 'function r = apply2(f, x)\nr = f(f(x));\nend\n',
    '/home/withlocal.m': 'function h = withlocal()\nh = @twice;\nend\nfunction r = twice(x)\nr = 2 * x;\nend\n',
  });
  h.run('a = apply2(@(x) x + 3, 1); hl = withlocal(); b = hl(5); c = feval(@(x) x^2, 4); d = feval(\'apply2\', @(x) -x, 2); e = apply2(hl, 1);');
  assert.equal(h.v('a'), 7);
  assert.equal(h.v('b'), 10);
  assert.equal(h.v('c'), 16);
  assert.equal(h.v('d'), 2);
  assert.equal(h.v('e'), 4);
});

test('scripts run in the caller workspace; local functions in scripts', () => {
  const h = session({
    '/home/setup.m': 'alpha = 3;\nbeta = sq(alpha);\nfunction r = sq(t)\nr = t^2;\nend\n',
    '/home/usesscript.m': 'function r = usesscript()\nsetup;\nr = beta + 1;\nend\n',
  });
  h.run('setup');
  assert.equal(h.v('beta'), 9);
  h.run('clear beta; q = usesscript();');
  assert.equal(h.v('q'), 10);
  assert.equal(h.raw('beta'), null);
  assert.match(h.fail('z = setup;').message, /SCRIPT setup as a function/);
  h.run("run('/home/setup.m')");
  assert.equal(h.v('alpha'), 3);
});

test('private folders and packages', () => {
  const h = session({
    '/home/lib/pubfn.m': 'function r = pubfn(x)\nr = privfn(x) + 1;\nend\n',
    '/home/lib/private/privfn.m': 'function r = privfn(x)\nr = x * 100;\nend\n',
    '/home/+geom/area.m': 'function a = area(r)\na = 3 * r^2;\nend\n',
    '/home/+geom/+sub/deep.m': 'function a = deep()\na = 7;\nend\n',
  });
  h.run("addpath('/home/lib'); a = pubfn(2); b = geom.area(2); c = geom.sub.deep(); f = @geom.area; d = f(1);");
  assert.equal(h.v('a'), 201);
  assert.equal(h.v('b'), 12);
  assert.equal(h.v('c'), 7);
  assert.equal(h.v('d'), 3);
  assert.match(h.fail('privfn(1)').message, /privfn/);
});

test('global and persistent variables', () => {
  const h = session({
    '/home/incg.m': 'function incg()\nglobal G\nG = G + 1;\nend\n',
    '/home/tick.m': 'function n = tick()\npersistent count\nif isempty_(count), count = 0; end\ncount = count + 1;\nn = count;\nend\nfunction t = isempty_(v)\nt = 1;\nfor k = v, t = 0; end\nend\n',
  });
  h.run('global G; G = 1; incg(); incg(); a = G;');
  assert.equal(h.v('a'), 3);
  h.run('x1 = tick(); x2 = tick(); x3 = tick();');
  assert.equal(h.v('x3'), 3);
  h.run('clear functions; y = tick();');
  assert.equal(h.v('y'), 1);
  h.run('clear G; global G; b = G;');
  assert.equal(h.v('b'), 3);
});

test('eval, evalin, assignin and exist', () => {
  const h = session({
    '/home/setcaller.m': "function setcaller()\nassignin('caller', 'fromCallee', 5);\nv = evalin('caller', 'base_v * 2');\nassignin('base', 'twice', v);\nend\n",
    '/home/somefile.m': 'function somefile()\nend\n',
  });
  h.run("eval('e1 = 3;'); e2 = eval('e1 + 1'); eval('bad syntax (', 'e3 = 9;'); base_v = 21; setcaller(); [p, q] = eval('deal(1, 2)');");
  assert.equal(h.v('e1'), 3);
  assert.equal(h.v('e2'), 4);
  assert.equal(h.v('e3'), 9);
  assert.equal(h.v('fromCallee'), 5);
  assert.equal(h.v('twice'), 42);
  assert.equal(h.v('q'), 2);
  h.run("x1 = exist('base_v'); x2 = exist('somefile'); x3 = exist('nothing_here'); x4 = exist('eval'); x5 = exist('/home', 'dir');");
  assert.deepEqual([h.v('x1'), h.v('x2'), h.v('x3'), h.v('x4'), h.v('x5')], [1, 2, 0, 5, 7]);
  h.run("eval('evOut = 1 + 1')");
  assert.match(h.text(), /evOut = 2/);
});

test('inputname, narginchk and nargin checks', () => {
  const h = session({
    '/home/nameof.m': 'function s = nameof(a, b)\ns = inputname(2);\nend\n',
    '/home/chk.m': 'function chk(varargin)\nnarginchk(1, 2);\nend\n',
  });
  h.run('alpha = 1; beta = 2; s = nameof(alpha, beta); chk(1);');
  assert.equal(h.v('s'), 'beta');
  assert.match(h.fail('chk()').message, /Not enough input arguments/);
  assert.match(h.fail('chk(1, 2, 3)').message, /Too many input arguments/);
});

test('arguments blocks validate, convert and fill defaults', () => {
  const h = session({
    '/home/argf.m': 'function r = argf(x, y, opts)\narguments\n  x (1,1)\n  y = 10\n  opts.Scale = 1\n  opts.Offset = 0\nend\nr = x * opts.Scale + y + opts.Offset;\nend\n',
    '/home/argv.m': 'function r = argv(x)\narguments\n  x {mustBeBig}\nend\nr = x;\nend\nfunction mustBeBig(v)\nif v < 5, error(\'my:small\', \'Value must be big.\'); end\nend\n',
  });
  h.run("a = argf(2); b = argf(2, 1); c = argf(2, 1, 'Scale', 3, 'Offset', 100);");
  assert.equal(h.v('a'), 12);
  assert.equal(h.v('b'), 3);
  assert.equal(h.v('c'), 107);
  assert.match(h.fail('argf([1 2])').message, /Invalid argument at position 1. Value must be of size 1x1/);
  assert.match(h.fail("argf(1, 2, 'Nope', 1)").message, /Invalid name-value argument 'Nope'/);
  h.run('d = argv(7);');
  assert.equal(h.v('d'), 7);
  const e = h.fail('argv(1)');
  assert.match(e.message, /Invalid argument at position 1. Value must be big./);
});

test('functions are reloaded when their file changes', async () => {
  const h = session({ '/home/ver1.m': 'function r = ver1()\nr = 1;\nend\n' });
  h.run('a = ver1();');
  await new Promise((r) => setTimeout(r, 5));
  h.fs.writeText('/home/ver1.m', 'function r = ver1()\nr = 2;\nend\n');
  h.run('b = ver1();');
  assert.equal(h.v('a'), 1);
  assert.equal(h.v('b'), 2);
});

test('recursion limit is reported as an error', () => {
  const h = session({ '/home/forever.m': 'function forever(n)\nforever(n + 1);\nend\n' });
  const e = h.fail('forever(1)');
  assert.match(e.message, /recursion limit/i);
});

test('command syntax calls functions with text arguments', () => {
  const h = session({ '/home/echoargs.m': "function echoargs(varargin)\nassignin('base', 'got', varargin);\nend\n" });
  h.run("echoargs hello 'two words' 3");
  assert.deepEqual(h.v('got'), ['hello', 'two words', '3']);
  h.run('format long; x = 1/3');
  assert.match(h.text(), /0\.333333333333333/);
  h.run('format short; format compact; y = 1/3');
  assert.match(h.text(), /y = 0\.3333\n/);
});

test('cd, pwd, path and which', () => {
  const h = session({ '/home/proj/tool1.m': 'function r = tool1()\nr = 5;\nend\n', '/home/other/x.txt': 'x' });
  h.run("cd('/home/proj'); p = pwd; a = tool1(); cd ..; q = pwd;");
  assert.equal(h.v('p'), '/home/proj');
  assert.equal(h.v('a'), 5);
  assert.equal(h.v('q'), '/home');
  assert.match(h.fail('tool1()').message, /tool1/);
  h.run("addpath('/home/proj'); b = tool1(); w = which('tool1'); pp = path; rmpath('/home/proj');");
  assert.equal(h.v('b'), 5);
  assert.equal(h.v('w'), '/home/proj/tool1.m');
  assert.equal(h.v('pp'), '/home/proj');
  assert.match(h.fail('tool1()').message, /tool1/);
  h.run("g = genpath('/home');");
  assert.match(h.v('g'), /\/home:\/home\/other:\/home\/proj/);
});

test('clear, who and whos', () => {
  const h = session();
  h.run('a1 = 1; a2 = [1 2]; b = "x"; clear a*; w = who; s = whos;');
  assert.deepEqual(h.v('w'), ['b']);
  assert.equal(h.raw('s').data.length, 2);
  h.run('clearvars -except b');
  assert.equal(h.raw('w'), null);
  assert.equal(h.v('b'), 'x');
  h.run('clear');
  assert.equal(h.s.listVariables().length, 0);
});
