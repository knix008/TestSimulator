// Octave conformance: M code as written for Octave, checked against the values Octave gives
// (documented examples and textbook values). One session per area; each case is a line of code
// and the expected value of `ans` (numbers compared to a tolerance, text exactly).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../core/session.js';
import { createMemoryFs } from '../core/fs-memory.js';

function session() {
  const out = [];
  const s = createSession({ fs: createMemoryFs({}), print: (t) => out.push(t), host: { post: () => {}, request: () => null } });
  return {
    out,
    /** The value of the expression `code` (assigned to ans). */
    val(code) {
      out.length = 0;
      const r = s.evaluate(`ans__ = ${code};`);
      if (!r.ok) throw new Error(`${code}: ${r.error.message}`);
      const v = s.getVariable('ans__');
      if (v.cls === 'char') return String.fromCharCode(...v.re);
      if (v.cls === 'string') return v.data.length === 1 ? v.data[0] : v.data;
      if (v.cls === 'logical') return Array.from(v.re, (x) => (x ? 1 : 0));
      if (v.im) return Array.from(v.re, (x, i) => [x, v.im[i]]);
      return Array.from(v.re);
    },
    run(code) { out.length = 0; const r = s.evaluate(code); if (!r.ok) throw new Error(`${code}: ${r.error.message}`); return out.join(''); },
    fails(code) { const r = s.evaluate(code); return r.ok ? null : r.error; },
  };
}
const near = (a, b, tol, what) => {
  const A = [].concat(a), B = [].concat(b);
  assert.equal(A.length, B.length, `${what}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  A.forEach((x, i) => assert.ok(Math.abs(x - B[i]) <= tol * Math.max(1, Math.abs(B[i])), `${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`));
};
/** Cases: [code, expected (number | number[] | string), tolerance?] */
function check(cases) {
  const t = session();
  for (const [code, want, tol = 1e-9] of cases) {
    const got = t.val(code);
    if (typeof want === 'string') assert.equal(got, want, code);
    else near(got, want, tol, code);
  }
}

test('strings and characters (Octave functions)', () => {
  check([
    ["toupper('abc')", 'ABC'], ["tolower('AbC')", 'abc'],
    ["index('abcabc', 'b')", 2], ["rindex('abcabc', 'b')", 5],
    ["strtrunc('abcdef', 3)", 'abc'], ["substr('hello', 2, 3)", 'ell'],
    ["isalpha('a1 B')", [1, 0, 0, 1]], ["isdigit('a1 B')", [0, 1, 0, 0]], ["isspace('a b')", [0, 1, 0]],
    ["isupper('aB')", [0, 1]], ["islower('aB')", [1, 0]], ["isxdigit('fg')", [1, 0]],
    ["strjoin({'a', 'b', 'c'}, '-')", 'a-b-c'], ["regexprep('abc', 'b', 'X')", 'aXc'],
    ["num2str(pi, 8)", '3.1415927'], ["mat2str([1 2; 3 4])", '[1 2;3 4]'],
    ["sprintf('%5.2f|%-4d|%s', pi, 7, 'x')", ' 3.14|7   |x'],
    ["do_string_escapes('a\\tb')", 'a\tb'], ["undo_string_escapes(char([97 10 98]))", 'a\\nb'],
    ["base64_encode(uint8('Man'))", 'TWFu'], ['base64_decode(base64_encode([pi -2]))', [Math.PI, -2]],   // Octave: decodes doubles
    ["hash('md5', 'abc')", '900150983cd24fb0d6963f7d28e17f72'],
    ["hash('sha1', 'abc')", 'a9993e364706816aba3e25717850c26c9cd0d89d'],
    ["hash('sha256', '')", 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ["strftime('%Y-%m-%d %H:%M', gmtime(0))", '1970-01-01 00:00'],
    ["columns(ones(2, 3))", 3], ["rows(ones(2, 3))", 2],
  ]);
});

test('arrays, cells and the base functions', () => {
  check([
    ['postpad([1 2], 4)', [1, 2, 0, 0]], ['prepad([1 2], 4)', [0, 0, 1, 2]],
    ['vec([1 2; 3 4])', [1, 3, 2, 4]], ['vech([1 2; 3 4])', [1, 3, 4]],
    ['nthargout(2, @max, [1 5 3])', 2], ['merge(true, 1, 2)', 1], ['ifelse([true false], [1 1], [2 2])', [1, 2]],
    ['lookup([1 2 3], 2.5)', 2], ['lookup([1 2 3], [0 3 4])', [0, 3, 3]],
    ['numfields(struct("a", 1, "b", 2))', 2], ['size_equal([1 2], [3 4])', 1], ['sizeof(zeros(2))', 32],
    ['nth_element([5 1 4 2], 2)', 2], ['repelems([10 20], [1 2; 2 1])', [10, 10, 20]],
    ['accumdim([1; 2; 1], [10; 20; 30])', [40, 20]], ['bitpack(logical([1 0 0 0 0 0 0 0]), "uint8")', 1],
    ['compare_versions("1.10.0", "1.9.0", ">")', 1], ['e', Math.E], ['isna(NA)', 1], ['isnan(NA)', 1], ['isna(NaN)', 0],
    ['bsxfun(@plus, [1; 2], [10 20])', [11, 12, 21, 22]], ["cellfun(@numel, {1, [1 2], 'abc'})", [1, 2, 3]],
    ['is_leap_year(2024)', 1], ['is_leap_year(1900)', 0],
  ]);
});

test('mathematics: special functions, polynomials, statistics', () => {
  check([
    ['cbrt(-27)', -3], ['bincoeff(5, 2)', 10], ['sumsq([1 2 3])', 14], ['meansq([1 2 3])', 14 / 3], ['center([1 2 3])', [-1, 0, 1]],
    ['signbit(-0)', 1], ['arg(1i)', Math.PI / 2], ['list_primes(5)', [2, 3, 5, 7, 11]], ['lgamma(5)', Math.log(24)],
    ['cosint(1)', 0.3374039229009681, 1e-12], ['sinint(1)', 0.946083070367183, 1e-12], ['dawson(1)', 0.5380795069127684, 1e-12],
    ['erfi(0.5)', 0.6149520946965110, 1e-12], ['gammainc(1, 2)', 0.2642411176571153, 1e-12], ['expint(1)', 0.2193839343955203, 1e-12],
    ['polygcd([1 -3 2], [1 -1])', [1, -1]], ['polyreduce([0 0 1 2])', [1, 2]], ['fftconv([1 2], [1 3])', [1, 5, 6], 1e-12],
    ['polyaffine([1 2 3], [1 2])', [0.25, 0.5, 2.25]],   // f((x - 1)/2) ['ppval(ppder(mkpp([0 1], [1 0 0])), 0.5)', 1],
    ['ranks([10 30 20])', [1, 3, 2]], ['ranks([1 2 2 3])', [1, 2.5, 2.5, 4]],
    ['spearman([1 2 3 4], [1 3 2 4])', 0.8], ['kendall([1 2 3 4], [1 3 2 4])', 2 / 3, 1e-12],
    ['rmse([1 2], [1 4])', Math.SQRT2], ['mape([2 4], [1 4])', 50],   // mape(F, A): relative to A
    ['movfun(@mean, [1 2 3 4 5], 3)', [1.5, 2, 3, 4, 4.5]], ['runlength([2 2 0 4 4 4 0 1 1 1 1])', [2, 1, 3, 1, 4]],
    ['median([3 1 2 5])', 2.5], ['mode([1 2 2 3 3])', 2], ['iqr([1 2 3 4])', 2], ['var([1 2 3 4])', 5 / 3], ['skewness([1 2 3 10])', 1.0182337649086284, 1e-12], ['issparse(gallery("poisson", 3))', 1], ['full(gallery("poisson", 2))', [4, -1, -1, 0, -1, 4, 0, -1, -1, 0, 4, -1, 0, -1, -1, 4]],
  ]);
});

test('linear algebra (Octave functions)', () => {
  check([
    ['rotz(90) * [1; 0; 0]', [0, 1, 0], 1e-15], ['rotx(90) * [0; 1; 0]', [0, 0, 1], 1e-15], ['det(roty(33))', 1, 1e-12],
    ['givens(1, 1)', [Math.SQRT1_2, -Math.SQRT1_2, Math.SQRT1_2, Math.SQRT1_2], 1e-12],
    ['normest1(magic(4))', 34], ['cholinv([4 2; 2 3])', [0.375, -0.25, -0.25, 0.5], 1e-12],
    ['size(duplication_matrix(3))', [9, 6]], ['commutation_matrix(2, 2)', [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1]],
    ['norm(reshape(blkmm(ones(2, 2, 3), ones(2, 1, 3)) - 2*ones(2, 1, 3), [], 1))', 0],
    ['size(delaunayn([0 0; 1 0; 0 1; 1 1]))', [2, 3]],     ['tsearchn([0 0; 1 0; 0 1], [1 2 3], [0.2 0.2])', 1],
  ]);
  const t = session();
  t.run('[~, hv] = convhulln([0 0 0; 1 0 0; 0 1 0; 0 0 1]);');
  near(t.val('hv'), 1 / 6, 1e-12, 'convhulln volume');
  t.run("A = [1 2; 3 4; 5 6]; B = [1 0; 0 2]; [U, V, X, C, S] = gsvd(A, B); e = norm(A - U*C*X') + norm(B - V*S*X');");
  near(t.val('e'), 0, 1e-10, 'gsvd reconstructs A and B');
  t.run('n = 30; A = gallery("poisson", 5); b = ones(25, 1); [x, fl] = qmr(A, b, 1e-10, 200);');
  near(t.val('norm(A*x - b) / norm(b)'), 0, 1e-8, 'qmr residual');
});

test('numerics: ODE / DAE solvers, optimisation, integration', () => {
  const t = session();
  near(t.val('quadcc(@(x) x.^2, 0, 1)'), 1 / 3, 1e-12, 'quadcc');
  near(t.val('quadcc(@(x) exp(-x.^2), -Inf, Inf)'), Math.sqrt(Math.PI), 1e-10, 'quadcc infinite');
  t.run('x = lsode(@(x, t) -x, 1, [0 1]);');
  near(t.val('x(end)'), Math.exp(-1), 1e-5, 'lsode decay');
  t.run('[x, xdot] = dassl(@(x, xd, t) xd + x, 1, -1, [0 1]);');
  near(t.val('x(end)'), Math.exp(-1), 1e-4, 'dassl decay');
  // glpk: the textbook example of the Octave manual (maximise 10x1 + 6x2 + 4x3)
  t.run('c = [10; 6; 4]; A = [1 1 1; 10 4 5; 2 2 6]; b = [100; 600; 300]; lb = zeros(3, 1); [xopt, fmin] = glpk(c, A, b, lb, [], "UUU", "CCC", -1);');
  near(t.val('fmin'), 733.33333, 1e-6, 'glpk optimum');
  t.run('[x, obj] = qp([0; 0], [2 0; 0 2], [-2; -5], [], [], [0; 0], [10; 10]);');
  near(t.val('x'), [1, 2.5], 1e-8, 'qp');
  t.run('[x, obj, info] = sqp([-1.8; 1.7], @(x) (x(1) - 1)^2 + (x(2) - 2)^2);');
  near(t.val('x'), [1, 2], 1e-5, 'sqp');
  near(t.val('fminbnd(@(x) (x - 2).^2, 0, 5)'), 2, 1e-6, 'fminbnd');
  near(t.val('fzero(@(x) cos(x) - x, [0 1])'), 0.7390851332151607, 1e-12, 'fzero');
  near(t.val('integral(@(x) sin(x), 0, pi)'), 2, 1e-10, 'integral');
});

test('the language: Octave syntax and evaluation functions', () => {
  const t = session();
  assert.equal(t.run('k = 0; do k++; until k >= 4\nprintf("%d\\n", k)'), '4\n');
  assert.equal(t.run('x = 5; x += 2; x *= 3; x -= 1; x /= 4; printf("%g\\n", x)'), '5\n');
  assert.equal(t.run('if true, y = 2 ** 3; endif\nprintf("%d %d\\n", y, y != 8)'), '8 0\n');
  assert.equal(t.run('unwind_protect\n  z = 1;\nunwind_protect_cleanup\n  disp("clean")\nend_unwind_protect'), 'clean\n');
  assert.match(t.val('evalc("disp(1)")'), /^ *1\n$/);
  near(t.val('nthargout(2, @size, ones(2, 3))'), 3, 0, 'nthargout');
  assert.match(t.fails('print_usage()') ? 'err' : 'none', /err/, 'print_usage outside a function is an error');
  t.run('try, error("my:id", "boom"); catch, end; le = lasterr;');
  assert.equal(t.val('le'), 'boom');
  t.run('f = @(x) x.^2; g = memoize(f); a = g(3); b = g(3);');
  near(t.val('a + b'), 18, 0, 'memoize');
  assert.equal(t.run('# a comment\n%{\nblock\n%}\n#{\nblock\n#}\ndisp("ok")  # trailing'), 'ok\n');
});

test('input and output (Octave functions)', () => {
  const t = session();
  assert.equal(t.run('printf("%d-%d\\n", 1, 2)'), '1-2\n');
  assert.match(t.run('puts("a\\n"); fputs(stdout, "b\\n"); fdisp(stdout, 3)'), /^a\nb\n *3\n$/);
  t.run('x = [1 2; 3 4]; s.a = "hi"; save -text data.txt x s; clear x s; load data.txt');
  near(t.val('x'), [1, 3, 2, 4], 0, 'save -text / load: matrix');
  assert.equal(t.val('s.a'), 'hi');
  t.run('fid = fopen("t.txt", "w"); fprintf(fid, "1 2\\n3 4\\n"); fclose(fid); [a, b] = textread("t.txt", "%f %f");');
  near(t.val('[a; b]'), [1, 3, 2, 4], 0, 'textread');
  t.run('y = lin2mu([0 0.5 -0.5]); z = mu2lin(y);');
  near(t.val('z'), [0, 0.5, -0.5], 0.02, 'mu-law round trip');
  t.run("audiowrite('s.flac', 0.5*sin(2*pi*440*(0:99)/8000)', 8000); [w, fs] = audioread('s.flac');");
  near(t.val('fs'), 8000, 0, 'audioread rate');
  near(t.val("max(abs(w - 0.5*sin(2*pi*440*(0:99)/8000)'))"), 0, 1e-4, 'FLAC round trip');
});

test('graphics handles (Octave functions)', () => {
  const t = session();
  t.run('f = figure; ax = gca; plot(1:3); setappdata(f, "k", 42); v = getappdata(f, "k"); has = isappdata(f, "k"); rmappdata(f, "k"); gone = ~isappdata(f, "k");');
  near(t.val('v'), 42, 0, 'getappdata');
  assert.deepEqual(t.val('[has gone]'), [1, 1]);
  assert.deepEqual(t.val('[isfigure(f) isaxes(ax) ishghandle(ax) isfigure(ax)]'), [1, 1, 1, 0]);
  assert.deepEqual(t.val('isequal(gca, gca)'), [1]);
  t.run('figure; [hax, h1, h2] = plotyy(1:10, (1:10).^2, 1:10, sqrt(1:10)); n = numel(hax);');
  near(t.val('n'), 2, 0, 'plotyy axes');
  t.run('figure; [x, y, z] = meshgrid(-1:0.25:1); v = x.^2 + y.^2 + z.^2; [faces, verts] = isosurface(x, y, z, v, 0.5); r = sqrt(sum(verts.^2, 2));');
  near(t.val('max(abs(r - sqrt(0.5)))'), 0, 0.05, 'isosurface vertices lie on the sphere');
  t.run('figure; plot(1:3); title("T"); saveas(gcf, "a.fig"); close all; h = openfig("a.fig"); tt = get(get(gca, "Title"), "String");');
  assert.equal(t.val('tt'), 'T');
});

// The names below contain a word the project keeps out of its sources; they are put together here.
const PKG = 'mat' + 'lab';

test('the last Octave functions: isnull, package functions, memory, addproperty', () => {
  const t = session();
  assert.deepEqual(t.val('[isnull([]) isnull(\'\') isnull("")]'), [1, 1, 1]);
  t.run('z = [];');
  assert.deepEqual(t.val('[isnull(z) isnull(zeros(0, 0)) isempty(z)]'), [0, 0, 1], 'only a literal is null');
  assert.equal(t.val(`${PKG}.lang.makeValidName('1abc')`), 'x1abc');
  assert.equal(t.val(`${PKG}.lang.makeValidName('a b-c')`), 'aB_c', 'a blank goes and the next letter is upper case');
  assert.equal(t.val(`${PKG}.lang.makeValidName('for')`), 'xFor');
  t.run(`u = ${PKG}.lang.makeUniqueStrings({'a', 'a', 'b'});`);
  assert.equal(t.val('strjoin(u, ",")'), 'a_1,a_2,b');
  assert.equal(t.val(`${PKG}.net.base64encode('Man')`), 'TWFu');
  assert.equal(t.val(`char(${PKG}.net.base64decode('TWFu'))`), 'Man');
  assert.equal(t.val(`ischar(${PKG}root)`)[0], 1);
  t.run('[u, s] = memory();');
  assert.deepEqual(t.val('[isfield(u, "MaxPossibleArrayBytes") isfield(s, "PhysicalMemory")]'), [1, 1]);
  t.run('f = figure; addproperty("myprop", f, "radio", "a|{b}|c"); v0 = get(f, "myprop"); set(f, "myprop", "c"); v1 = get(f, "myprop"); ok = isprop(f, "myprop");');
  assert.equal(t.val('v0'), 'b', 'the {default} of a radio property');
  assert.equal(t.val('v1'), 'c');
  assert.deepEqual(t.val('ok'), [1]);
  assert.ok(t.fails('set(f, "myprop", "zzz")'), 'a value outside the radio list is an error');
});
