// GNU Octave base-library functions: character classes, Octave string
// utilities, cells / structs, padding and rearranging, lookup, accumdim,
// bsxfun, merge, constants e / NA, sizes, base64 and hashes, Unix time
// functions, file name utilities, preferences, settings, bzip2 and unpack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../core/session.js';
import { createMemoryFs } from '../core/fs-memory.js';
import { buildRegistry } from '../core/registry.js';
import * as octave from '../core/lib/base/octave.js';
import * as octsys from '../core/lib/base/octsys.js';
import { bzip2Compress, bzip2Decompress } from '../core/lib/base/bzip2.js';

function session(opts = {}) {
  const out = [];
  const fs = createMemoryFs(opts.files || {});
  const s = createSession({ fs, host: opts.host, print: (t) => out.push(t) });
  const run = (code) => { const r = s.evaluate(code); if (!r.ok) throw new Error(`${r.error.identifier}: ${r.error.message}\n  in: ${code}`); };
  const v = (name) => {
    const x = s.getVariable(name);
    if (x.cls === 'char') return String.fromCharCode(...x.re);
    if (x.cls === 'string') return x.data.length === 1 ? x.data[0] : x.data;
    if (x.re) return x.re.length === 1 && !x.im ? x.re[0] : Array.from(x.re);
    return x;
  };
  const raw = (name) => s.getVariable(name);
  const fail = (code) => { const r = s.evaluate(code); assert.equal(r.ok, false, `expected an error from: ${code}`); return r.error; };
  return { s, fs, run, v, raw, fail, out };
}
const S = session();
const val = (code, name = 'r') => { S.run(`${name} = ${code};`); return S.v(name); };
const near = (a, b, tol = 1e-12) => {
  if (typeof b === 'number') { assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `expected ${b}, got ${a}`); return; }
  assert.equal(a.length, b.length);
  b.forEach((x, i) => assert.ok(Math.abs(a[i] - x) <= tol * Math.max(1, Math.abs(x)), `[${i}] expected ${x}, got ${a[i]}`));
};

test('registry: no duplicates and every new builtin has bilingual help', () => {
  const reg = buildRegistry();
  for (const mod of [octave, octsys]) {
    for (const name of Object.keys(mod.builtins)) {
      assert.equal(reg.owner[name], 'base', name);
      const h = mod.help[name];
      assert.ok(h && h.en && h.ko && Array.isArray(h.syntax) && h.syntax.length, `help for ${name}`);
    }
  }
});

test('character class functions', () => {
  assert.deepEqual(val("isalpha('a1 B_é')"), [1, 0, 0, 1, 0, 1]);
  assert.deepEqual(val("isdigit('a1 9')"), [0, 1, 0, 1]);
  assert.deepEqual(val("isalnum('a1 _')"), [1, 1, 0, 0]);
  assert.deepEqual(val("islower('aB1')"), [1, 0, 0]);
  assert.deepEqual(val("isupper('aB1')"), [0, 1, 0]);
  assert.deepEqual(val("isxdigit('0fG')"), [1, 1, 0]);
  assert.deepEqual(val("ispunct('a,.!')"), [0, 1, 1, 1]);
  assert.deepEqual(val('iscntrl(char([9 65 127]))'), [1, 0, 1]);
  assert.deepEqual(val("isprint(['a ' char(7)])"), [1, 1, 0]);
  assert.deepEqual(val("isgraph(['a ' char(7)])"), [1, 0, 0]);
  assert.deepEqual(val("isascii(['a' char(200)])"), [1, 0]);
  assert.equal(val('isalpha(65)'), 0);
  S.run("c = isdigit({'a1', '22'}); c1 = c{1}; c2 = c{2};");
  assert.deepEqual(S.v('c1'), [0, 1]); assert.deepEqual(S.v('c2'), [1, 1]);
  assert.equal(S.raw('c1').cls, 'logical');
});

test('constants e and NA, isna', () => {
  near(val('e'), Math.E);
  S.run('m = e(2, 3);'); assert.deepEqual(S.raw('m').dims, [2, 3]);
  assert.equal(val("class(e(2, 'single'))"), 'single');
  S.run('x = [1 NA NaN]; t = isna(x); n = isnan(x);');
  assert.deepEqual(S.v('t'), [0, 1, 0]);
  assert.deepEqual(S.v('n'), [0, 1, 1]);
  assert.deepEqual(val('isna(NA(1, 2))'), [1, 1]);
  assert.equal(val("isna('a')"), 0);
});

test('sizes and type predicates', () => {
  assert.equal(val('rows(ones(3, 4))'), 3);
  assert.equal(val('columns(ones(3, 4))'), 4);
  assert.equal(val('size_equal([1 2; 3 4], ones(2), zeros(2, 2))'), 1);
  assert.equal(val('size_equal([1 2], [1; 2])'), 0);
  assert.equal(val('size_equal()'), 1);
  assert.equal(val('sizeof([1 2 3])'), 24);
  assert.equal(val("sizeof('abc')"), 3);
  assert.equal(val("sizeof({1, 'ab'})"), 10);
  assert.equal(val('numfields(struct(\'a\', 1, \'b\', 2))'), 2);
  assert.equal(val('numfields(5)'), 0);
  assert.ok(val('sizemax') > 1e9);
  assert.equal(val('isbool(true)'), 1); assert.equal(val('isbool(1)'), 0);
  assert.equal(val('iscomplex(1+2i)'), 1); assert.equal(val('iscomplex(1)'), 0);
  assert.equal(val("is_sq_string('a')"), 1); assert.equal(val('is_dq_string("a")'), 1); assert.equal(val("is_dq_string('a')"), 0);
  assert.equal(val('isindex([1 2 3])'), 1);
  assert.equal(val('isindex([1 2 3], 2)'), 0);
  assert.equal(val('isindex(0)'), 0);
  assert.equal(val('isindex(1.5)'), 0);
  assert.equal(val("isindex(':')"), 1);
  assert.equal(val('isindex(logical([1 0 1]), 3)'), 1);
  S.run('[tf, d] = isuniform([1 3 5 7]);'); assert.equal(S.v('tf'), 1); assert.equal(S.v('d'), 2);
  S.run('[tf, d] = isuniform(0:0.1:1);'); assert.equal(S.v('tf'), 1); near(S.v('d'), 0.1);
  S.run('[tf, d] = isuniform([1 2 4]);'); assert.equal(S.v('tf'), 0); assert.ok(Number.isNaN(S.v('d')));
  assert.equal(val('isdefinite([2 -1; -1 2])'), 1);
  assert.equal(val('isdefinite([1 2; 2 1])'), 0);
  assert.equal(val('isdefinite([1 2; 3 4])'), 0);
  assert.equal(val('isdefinite([2 1i; -1i 2])'), 1);
  assert.equal(val('isdefinite(ones(2, 3))'), 0);
});

test('Octave string utilities', () => {
  assert.equal(val("index('Teststring', 't')"), 4);
  assert.equal(val("index('Teststring', 't', 'last')"), 6);
  assert.equal(val("rindex('Teststring', 't')"), 6);
  assert.equal(val("index('abc', 'z')"), 0);
  assert.deepEqual(val("index({'abcb', 'xb'}, 'b')"), [2, 2]);
  assert.deepEqual(val("findstr('ababab', 'aba')"), [1, 3]);
  assert.deepEqual(val("findstr('aba', 'ababab')"), [1, 3]);
  assert.equal(val("findstr('ababab', 'aba', 0)"), 1);
  assert.equal(val("substr('This is a sample string', 6, 9)"), 'is a samp');
  assert.equal(val("substr('hello', 2)"), 'ello');
  assert.equal(val("substr('hello', 2, -1)"), 'ell');
  assert.equal(val("strtrunc('abcdef', 3)"), 'abc');
  S.run("c = strtrunc({'abcdef', 'xy'}, 3); c1 = c{1}; c2 = c{2};");
  assert.equal(S.v('c1'), 'abc'); assert.equal(S.v('c2'), 'xy');
  S.run("c = ostrsplit('a:b;c', ':;'); n = numel(c); c3 = c{3};");
  assert.equal(S.v('n'), 3); assert.equal(S.v('c3'), 'c');
  assert.equal(val("numel(ostrsplit('a::b', ':', true))"), 2);
  assert.equal(val("numel(ostrsplit('a::b', ':'))"), 3);
  assert.equal(val("cstrcat('ab ', 'cd ')"), 'ab cd ');
  S.fail("cstrcat('a', 1)");
  assert.equal(val("do_string_escapes('a\\nb\\t\\x41\\101')"), 'a\nb\tAA');
  assert.equal(val("undo_string_escapes(['a' char(10) 'b\"'])"), 'a\\nb\\"');
  assert.equal(val("untabify(['a' char(9) 'b'])"), 'a       b');
  assert.equal(val("untabify(['ab' char(9) 'c'], 4)"), 'ab  c');
  assert.equal(val("untabify(['a' char(9)], 4, true)"), 'a');
  assert.deepEqual(val("strchr('hello world', 'lo')"), [3, 4, 5, 8, 10]);
  assert.deepEqual(val("strchr('hello world', 'lo', 2)"), [3, 4]);
  assert.deepEqual(val("strmatch('app', {'apple', 'banana', 'application'})"), [1, 3]);
  assert.equal(val("strmatch('apple', ['apple  '; 'apple x'; 'banana '], 'exact')"), 1);
  assert.equal(val("numel(strmatch('zz', {'a'}))"), 0);
  assert.deepEqual(val("unicode_idx(['a' char([55357 56832]) 'b'])"), [1, 2, 2, 3]);
  assert.equal(val("tolower('AbC')"), 'abc');
  assert.equal(val("toupper('AbC')"), 'ABC');
});

test('strread reads formatted words', () => {
  S.run("[a, b] = strread('1 2 3 4', '%f %f');");
  assert.deepEqual(S.v('a'), [1, 3]); assert.deepEqual(S.v('b'), [2, 4]);
  S.run("[n, v] = strread('x 1 y 2', '%s %d'); n2 = n{2}; cv = class(v);");
  assert.equal(S.v('n2'), 'y'); assert.deepEqual(S.v('v'), [1, 2]); assert.equal(S.v('cv'), 'int32');
  S.run("a = strread('1,2,,4', '%f', 'delimiter', ',');");
  const a = S.v('a'); assert.equal(a.length, 4); assert.ok(Number.isNaN(a[2])); assert.equal(a[3], 4);
  S.run("a = strread('5 6 7');"); assert.deepEqual(S.v('a'), [5, 6, 7]);
  S.run("a = strread('k=1 x k=2 y', 'k=%d %*s');"); assert.deepEqual(S.v('a'), [1, 2]);
});

test('cells: celldisp, cellindexmat, cellslices', () => {
  const T = session();
  T.run("c = {1, 'two', {3}}; celldisp(c)");
  const text = T.out.join('');
  assert.match(text, /c\{1\} =/);
  assert.match(text, /c\{2\} =\s+two/);
  assert.match(text, /c\{3\}\{1\} =/);
  T.out.length = 0;
  T.run("celldisp({[]}, 'z')");
  assert.match(T.out.join(''), /z\{1\} = \[\]\(0x0\)/);
  S.run('y = cellindexmat({[1 2 3], [4 5 6]}, 2); y1 = y{1}; y2 = y{2};');
  assert.equal(S.v('y1'), 2); assert.equal(S.v('y2'), 5);
  S.run('y = cellindexmat({magic(3)}, 1, \':\'); y1 = y{1};');
  assert.deepEqual(S.v('y1'), [8, 1, 6]);
  S.run('sl = cellslices(1:10, [1 4], [3 6]); s1 = sl{1}; s2 = sl{2};');
  assert.deepEqual(S.v('s1'), [1, 2, 3]); assert.deepEqual(S.v('s2'), [4, 5, 6]);
  S.run('sl = cellslices(magic(4), [1 3], [2 4], 2); s2 = sl{2};');
  assert.deepEqual(S.raw('s2').dims, [4, 2]);
});

test('arrays: common_size, postpad, prepad, vec, vech, rotdim, repelems, nth_element', () => {
  S.run('[err, a, b] = common_size([1 2; 3 4], 5);');
  assert.equal(S.v('err'), 0); assert.deepEqual(S.v('b'), [5, 5, 5, 5]);
  S.run('[err, a, b] = common_size([1 2], [1 2 3]);'); assert.equal(S.v('err'), 1);
  assert.deepEqual(val('postpad([1 2], 4)'), [1, 2, 0, 0]);
  assert.deepEqual(val('postpad([1 2 3], 2)'), [1, 2]);
  assert.deepEqual(val('prepad([1 2], 4, 9)'), [9, 9, 1, 2]);
  assert.deepEqual(val('prepad([1 2 3], 2)'), [2, 3]);
  S.run('p = postpad([1 2; 3 4], 3, 0, 2);'); assert.deepEqual(S.raw('p').dims, [2, 3]); assert.deepEqual(S.v('p'), [1, 3, 2, 4, 0, 0]);
  S.run('v = vec([1 2; 3 4]);'); assert.deepEqual(S.raw('v').dims, [4, 1]); assert.deepEqual(S.v('v'), [1, 3, 2, 4]);
  S.run('v = vec([1 2; 3 4], 2);'); assert.deepEqual(S.raw('v').dims, [1, 4]);
  assert.deepEqual(val('vech([1 2 3; 4 5 6; 7 8 9])'), [1, 4, 7, 5, 8, 9]);
  S.run('A = [1 2 3; 4 5 6]; d = isequal(rotdim(A), rot90(A)) && isequal(rotdim(A, 2), rot90(A, 2)) && isequal(rotdim(A, 3), rot90(A, 3)) && isequal(rotdim(A, -1), rot90(A, -1));');
  assert.equal(S.v('d'), 1);
  S.run('B = reshape(1:8, 2, 2, 2); R = rotdim(B, 1, [1 3]); ok = isequal(size(R), [2 2 2]) && R(1, 1, 1) == B(1, 1, 2);');
  assert.equal(S.v('ok'), 1);
  assert.deepEqual(val('repelems([10 20 30], [1 3; 2 3])'), [10, 10, 30, 30, 30]);
  assert.equal(val('nth_element([5 3 9 1], 2)'), 3);
  assert.deepEqual(val('nth_element([5 3 9 1], 2:3)'), [3, 5]);
  assert.deepEqual(val('nth_element([5 1; 3 9; 0 4], 1)'), [0, 1]);
  assert.ok(Number.isNaN(val('nth_element([3 NaN 1], 3)')));
});

test('merge / ifelse, lookup, accumdim, bsxfun, powerset', () => {
  assert.deepEqual(val('merge([true false true], [1 2 3], [10 20 30])'), [1, 20, 3]);
  assert.deepEqual(val('ifelse([1 2 3] > 1, 0, [7 8 9])'), [7, 0, 0]);
  assert.equal(val('merge(false, 1, 2)'), 2);
  S.run("c = merge([true false], {'a', 'b'}, {'x', 'y'}); c2 = c{2};"); assert.equal(S.v('c2'), 'y');
  assert.deepEqual(val('lookup([1 2 3 4], [0.5 1 2.5 4 5])'), [0, 1, 2, 4, 4]);
  assert.deepEqual(val('lookup([4 3 2 1], [5 3.5 1])'), [0, 1, 4]);
  assert.deepEqual(val("lookup([1 2 3], [2 2.5], 'm')"), [2, 0]);
  assert.deepEqual(val("lookup([1 2 3], [2 2.5], 'b')"), [1, 0]);
  assert.deepEqual(val("lookup([1 2 3], [0 5], 'lr')"), [1, 2]);
  assert.deepEqual(val("lookup({'apple', 'cherry', 'pear'}, {'banana', 'pear'})"), [1, 3]);
  S.run('A = accumdim([1 2 1 2 1]\', [1 2 3 4 5]\');'); assert.deepEqual(S.v('A'), [9, 6]);
  S.run('A = accumdim([1 2 1], [1 2 3; 4 5 6], 2);'); assert.deepEqual(S.raw('A').dims, [2, 2]); assert.deepEqual(S.v('A'), [4, 10, 2, 5]);
  S.run('A = accumdim([1 3 1]\', [1 5 3]\', 1, 4, @max, -1);'); assert.deepEqual(S.v('A'), [3, -1, 5, -1]);
  S.run('A = accumdim([2 2]\', [1; 2], 1, 3);'); assert.deepEqual(S.v('A'), [0, 3, 0]);
  assert.deepEqual(val('bsxfun(@plus, [1; 2], [10 20])'), [11, 12, 21, 22]);
  assert.deepEqual(val('bsxfun(@(a, b) a .* b, [1 2 3], 2)'), [2, 4, 6]);
  S.fail('bsxfun(@plus, [1 2], [1 2 3])');
  S.run('p = powerset([3 1 2]); n = numel(p); p4 = p{4}; p8 = p{8};');
  assert.equal(S.v('n'), 8); assert.deepEqual(S.v('p4'), [1, 2]); assert.deepEqual(S.v('p8'), [1, 2, 3]);
  S.run("p = powerset({'a', 'b'}); n = numel(p);"); assert.equal(S.v('n'), 4);
});

test('base64, bitpack, hash, compare_versions, list_in_columns', () => {
  assert.equal(val('base64_encode(1)'), 'AAAAAAAA8D8=');
  assert.equal(val("base64_decode('AAAAAAAA8D8=')"), 1);
  S.run('x = [pi -1 1e300 0.5]; y = base64_decode(base64_encode(x)); ok = isequal(x, y);'); assert.equal(S.v('ok'), 1);
  S.run('y = base64_decode(base64_encode(1:6), [2 3]);'); assert.deepEqual(S.raw('y').dims, [2, 3]);
  assert.equal(val("base64_encode(uint8([72 105]))"), 'SGk=');
  assert.equal(val("base64_encode(single(1))"), 'AACAPw==');
  S.fail("base64_encode('a')");
  S.run('b = bitunpack(uint8(5)); p = bitpack(b, \'uint8\'); cb = class(b); cp = class(p);');
  assert.deepEqual(S.v('b'), [1, 0, 1, 0, 0, 0, 0, 0]); assert.equal(S.v('p'), 5); assert.equal(S.v('cb'), 'logical'); assert.equal(S.v('cp'), 'uint8');
  assert.equal(val("bitpack(logical([0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1]), 'uint32')"), 2147483648);
  assert.equal(val('bitpack(bitunpack(-2.5), \'double\')'), -2.5);
  assert.equal(val("hash('md5', 'abc')"), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(val("hash('md5', '')"), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(val("hash('md4', 'abc')"), 'a448017aaf21d8525fc10ae87aa6729d');
  assert.equal(val("hash('md2', 'abc')"), 'da853b0d3f88d99b30283a69e6ded6bb');
  assert.equal(val("hash('sha1', 'abc')"), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  assert.equal(val("hash('sha224', 'abc')"), '23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7');
  assert.equal(val("hash('sha256', 'abc')"), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(val("hash('sha384', 'abc')"), 'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7');
  assert.equal(val("hash('sha512', 'abc')"), 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f');
  assert.equal(val("hash('sha256', repmat('a', 1, 200))"), 'c2a908d98f5df987ade41b5fce213067efbcc21ef2240212a41e54b5e7c28ae5');
  S.fail("hash('nope', 'abc')");
  assert.equal(val("compare_versions('1.10.0', '1.9.3', '>')"), 1);
  assert.equal(val("compare_versions('2.0', '2.0.0', '==')"), 1);
  assert.equal(val("compare_versions('1.2', '1.3', '>=')"), 0);
  assert.equal(val("compare_versions('1.2', '1.3', '!=')"), 1);
  assert.equal(val("list_in_columns({'abc', 'def', 'ghijkl', 'mno'}, 20)"), 'abc     ghijkl\ndef     mno\n');
  assert.equal(val("list_in_columns({'a', 'b'}, 20, '> ')"), '> a  b\n');
});

test('Unix time functions', () => {
  S.run('t = time();'); assert.ok(Math.abs(S.v('t') - Date.now() / 1000) < 5);
  S.run('tm = gmtime(0); y = tm.year; mo = tm.mon; d = tm.mday; wd = tm.wday; z = tm.zone;');
  assert.equal(S.v('y'), 70); assert.equal(S.v('mo'), 0); assert.equal(S.v('d'), 1); assert.equal(S.v('wd'), 4); assert.equal(S.v('z'), 'GMT');
  S.run('tm = gmtime(1e9 + 0.25); s = strftime(\'%Y-%m-%d %H:%M:%S %j %a %b\', tm); us = tm.usec;');
  assert.equal(S.v('s'), '2001-09-09 01:46:40 252 Sun Sep'); assert.equal(S.v('us'), 250000);
  S.run('t0 = 1700000000; back = mktime(localtime(t0));'); assert.equal(S.v('back'), 1700000000);
  S.run('a = asctime(gmtime(0));'); assert.equal(S.v('a'), 'Thu Jan 01 00:00:00 1970\n');
  S.run('c = ctime(0); ok = numel(c) == 25;'); assert.equal(S.v('ok'), 1);
  S.run("[tm, n] = strptime('2024-03-15 13:45:30', '%Y-%m-%d %H:%M:%S'); y = tm.year; mo = tm.mon; d = tm.mday; h = tm.hour; wd = tm.wday; yd = tm.yday;");
  assert.equal(S.v('n'), 20); assert.equal(S.v('y'), 124); assert.equal(S.v('mo'), 2); assert.equal(S.v('d'), 15); assert.equal(S.v('h'), 13); assert.equal(S.v('wd'), 5); assert.equal(S.v('yd'), 74);
  S.run("[tm, n] = strptime('Mar 5 2020 03:04 PM', '%b %d %Y %I:%M %p'); h = tm.hour;"); assert.equal(S.v('h'), 15); assert.ok(S.v('n') > 0);
  S.run("[tm, n] = strptime('garbage', '%Y');"); assert.equal(S.v('n'), 0);
  assert.equal(val('is_leap_year(2000)'), 1);
  assert.deepEqual(val('is_leap_year([1900 2024 2023])'), [0, 1, 0]);
});

test('file name utilities, stat, readdir, glob, rename, unlink', () => {
  const T = session({ files: { '/home/data/a.txt': 'hello', '/home/data/b.txt': 'x', '/home/data/c.csv': '1,2', '/home/data/sub/d.txt': 'd' } });
  T.run("[c, st, msg] = canonicalize_file_name('data/../data/a.txt');");
  assert.equal(T.v('c'), '/home/data/a.txt'); assert.equal(T.v('st'), 0);
  T.run("[c, st, msg] = canonicalize_file_name('nope.txt');"); assert.equal(T.v('st'), -1); assert.equal(T.v('c'), '');
  T.run("m = make_absolute_filename('x/../y.txt');"); assert.equal(T.v('m'), '/home/y.txt');
  T.run("a = is_absolute_filename('/x'); b = is_absolute_filename('x'); c = is_absolute_filename('C:/x');");
  assert.equal(T.v('a'), 1); assert.equal(T.v('b'), 0); assert.equal(T.v('c'), 1);
  T.run("a = is_rooted_relative_filename('./x'); b = is_rooted_relative_filename('../x'); c = is_rooted_relative_filename('x');");
  assert.equal(T.v('a'), 1); assert.equal(T.v('b'), 1); assert.equal(T.v('c'), 0);
  T.run("s = is_same_file('data/a.txt', '/home/data/../data/a.txt'); t = is_same_file('data/a.txt', 'data/b.txt'); u = is_same_file('data/a.txt', {'data/b.txt', '/home/data/a.txt'});");
  assert.equal(T.v('s'), 1); assert.equal(T.v('t'), 0); assert.deepEqual(T.v('u'), [0, 1]);
  T.run("h = tilde_expand('~/x'); g = get_home_directory();"); assert.equal(T.v('h'), '/home/x'); assert.equal(T.v('g'), '/home');
  T.run("[info, err] = stat('data/a.txt'); sz = info.size; m = info.mode; isreg = S_ISREG(m); isdir = S_ISDIR(m); ms = info.modestr;");
  assert.equal(T.v('err'), 0); assert.equal(T.v('sz'), 5); assert.equal(T.v('isreg'), 1); assert.equal(T.v('isdir'), 0); assert.equal(T.v('ms'), '-rw-r--r--');
  T.run("[info, err] = lstat('data'); d = S_ISDIR(info.mode);"); assert.equal(T.v('d'), 1);
  T.run("[info, err, msg] = stat('missing'); e = isempty(info);"); assert.equal(T.v('err'), -1); assert.equal(T.v('e'), 1);
  T.run("[f, err] = readdir('data'); n = numel(f); f1 = f{1}; f3 = f{3};");
  assert.equal(T.v('n'), 6); assert.equal(T.v('f1'), '.'); assert.equal(T.v('f3'), 'a.txt');
  T.run("g = glob('data/*.txt'); n = numel(g); g1 = g{1};"); assert.equal(T.v('n'), 2); assert.equal(T.v('g1'), 'data/a.txt');
  T.run("g = glob({'data/*.csv', 'data/s*/?.txt'}); n = numel(g); g2 = g{2};"); assert.equal(T.v('n'), 2); assert.equal(T.v('g2'), 'data/sub/d.txt');
  T.run("g = glob('/home/data/[ab].txt'); n = numel(g);"); assert.equal(T.v('n'), 2);
  T.run("g = glob('nothing*'); n = numel(g);"); assert.equal(T.v('n'), 0);
  T.run("[err, msg] = rename('data/b.txt', 'data/bb.txt'); ex = exist('data/bb.txt', 'file');");
  assert.equal(T.v('err'), 0); assert.ok(T.v('ex') > 0);
  T.run("[err, msg] = rename('data/zz.txt', 'data/q.txt');"); assert.equal(T.v('err'), -1);
  T.fail("rename('data/zz.txt', 'data/q.txt')");
  T.run("[err, msg] = unlink('data/bb.txt'); ex = exist('data/bb.txt', 'file');"); assert.equal(T.v('err'), 0); assert.equal(T.v('ex'), 0);
  T.run("[err, msg] = unlink('data/bb.txt');"); assert.equal(T.v('err'), -1);
  T.run("old = chdir('data'); p = pwd;"); assert.equal(T.v('p'), '/home/data');
  T.run("chdir('..');");
  T.run("p = P_tmpdir(); c = user_config_dir(); d = user_data_dir();");
  assert.equal(T.v('p'), '/tmp'); assert.equal(T.v('c'), '/home/.config'); assert.equal(T.v('d'), '/home/.local/share');
  T.run("putenv('OCT_TEST_VAR', 'v1'); a = isenv('OCT_TEST_VAR'); b = isenv('OCT_NOT_SET_XYZ'); v = getenv('OCT_TEST_VAR');");
  assert.equal(T.v('a'), 1); assert.equal(T.v('b'), 0); assert.equal(T.v('v'), 'v1');
});

test('temporary files', () => {
  const T = session();
  T.run("[fid, name, msg] = mkstemp('/tmp/octXXXXXX'); fprintf(fid, 'abc'); fclose(fid); txt = fileread(name);");
  assert.ok(T.v('fid') >= 3); assert.match(T.v('name'), /^\/tmp\/oct[A-Za-z0-9]{6}$/); assert.equal(T.v('txt'), 'abc');
  T.fail("mkstemp('/tmp/oct')");
  T.run('[fid, msg] = tmpfile(); fprintf(fid, \'z\'); frewind(fid); s = fread(fid, 1, \'char=>char\'); fclose(fid);');
  assert.ok(T.v('fid') >= 3); assert.equal(T.v('s'), 'z');
});

test('system information', () => {
  S.run('h = gethostname(); p = getpid(); p2 = getpid(); n = nproc(); i = isieee(); st = isstudent();');
  assert.ok(S.v('h').length > 0); assert.equal(S.v('p'), S.v('p2')); assert.ok(S.v('n') >= 1); assert.equal(S.v('i'), 1); assert.equal(S.v('st'), 0);
  S.run('[u, err] = uname(); sn = u.sysname; m = u.machine;'); assert.equal(S.v('err'), 0); assert.ok(S.v('sn').length > 0);
  S.run('r = getrusage(); ut = r.utime.sec + r.utime.usec / 1e6;'); assert.ok(S.v('ut') >= 0);
  assert.equal(val('license'), 'MIT');
  assert.equal(val("license('test', 'mysimulationmath')"), 1);
  assert.equal(val("license('test', 'other_toolbox')"), 0);
  S.run('pack');
  S.run('sz = terminal_size();'); assert.equal(S.v('sz').length, 2);
});

test('preferences persist in prefdir', () => {
  const T = session();
  T.run("addpref('mytool', 'size', [1 2 3]); setpref('mytool', 'name', 'abc'); a = getpref('mytool', 'size'); b = getpref('mytool', 'name');");
  assert.deepEqual(T.v('a'), [1, 2, 3]); assert.equal(T.v('b'), 'abc');
  T.fail("addpref('mytool', 'size', 1)");
  T.run("s = getpref('mytool'); f = fieldnames(s); n = numel(f);"); assert.equal(T.v('n'), 2);
  T.run("t = ispref('mytool'); u = ispref('mytool', {'size', 'nope'}); w = ispref('other');");
  assert.equal(T.v('t'), 1); assert.deepEqual(T.v('u'), [1, 0]); assert.equal(T.v('w'), 0);
  T.run("d = getpref('mytool', 'level', 7); d2 = getpref('mytool', 'level', 9);"); assert.equal(T.v('d'), 7); assert.equal(T.v('d2'), 7);
  T.run("setpref('mytool', {'x', 'y'}, {1, {2, 'q'}}); y = getpref('mytool', 'y'); y2 = y{2};"); assert.equal(T.v('y2'), 'q');
  T.run("setpref('mytool', 'nanval', [NaN Inf -Inf]); nv = getpref('mytool', 'nanval');");
  const nv = T.v('nv'); assert.ok(Number.isNaN(nv[0])); assert.equal(nv[1], Infinity); assert.equal(nv[2], -Infinity);
  T.run("rmpref('mytool', 'x'); t = ispref('mytool', 'x');"); assert.equal(T.v('t'), 0);
  T.fail("rmpref('mytool', 'x')");
  T.run("p = prefdir; e = exist(fullfile(p, 'prefs.json'), 'file');"); assert.ok(T.v('e') > 0);
  // a new session on the same file system sees the stored values
  const s2 = createSession({ fs: T.fs, print() {} });
  assert.equal(s2.evaluate("q = getpref('mytool', 'name');").ok, true);
  assert.equal(String.fromCharCode(...s2.getVariable('q').re), 'abc');
  T.run("rmpref('mytool'); t = ispref('mytool');"); assert.equal(T.v('t'), 0);
});

test('display and file settings', () => {
  const T = session();
  T.run('p0 = output_precision(); old = output_precision(10); p1 = output_precision();');
  assert.equal(T.v('p0'), 5); assert.equal(T.v('old'), 5); assert.equal(T.v('p1'), 10);
  T.out.length = 0; T.run('x = pi'); assert.match(T.out.join(''), /3\.14159265358979/);
  T.run('format short; p2 = output_precision();'); assert.equal(T.v('p2'), 5);
  T.run('format long; p3 = output_precision(); format short;'); assert.equal(T.v('p3'), 16);
  T.fail('output_precision(-1)');
  for (const [name, def] of [['fixed_point_format', 0], ['print_empty_dimensions', 1], ['split_long_rows', 1], ['print_struct_array_contents', 0], ['confirm_recursive_rmdir', 1]]) {
    T.run(`a = ${name}(); old = ${name}(~a); b = ${name}(); ${name}(a, 'local');`);
    assert.equal(T.v('a'), def, name); assert.equal(T.v('b'), 1 - def, name);
  }
  T.run('a = struct_levels_to_print(); struct_levels_to_print(5); b = struct_levels_to_print();'); assert.equal(T.v('a'), 2); assert.equal(T.v('b'), 5);
  T.run("a = string_fill_char(); string_fill_char('*'); b = string_fill_char();"); assert.equal(T.v('a'), ' '); assert.equal(T.v('b'), '*');
  T.fail("string_fill_char('ab')");
  T.run("a = ls_command(); ls_command('ls -l'); b = ls_command();"); assert.equal(T.v('a'), 'ls -C'); assert.equal(T.v('b'), 'ls -l');
  T.run('w = whos_line_format();'); assert.match(T.v('w'), /%la/);
  T.run("r = recycle(); recycle('off');"); assert.equal(T.v('r'), 'off');
  T.fail("recycle('on')");
});

test('menu and yes_or_no ask through the Command Window', () => {
  const answers = ['7', '2', 'maybe', 'yes'];
  const host = { post() {}, request(msg) { return msg.type === 'input' ? answers.shift() : null; } };
  const T = session({ host });
  T.run("k = menu('Pick one', 'red', 'green', 'blue');");
  assert.equal(T.v('k'), 2);
  assert.match(T.out.join(''), /\[ 2\] green/);
  T.run("y = yes_or_no('Continue? ');"); assert.equal(T.v('y'), 1);
  const N = session();
  N.fail("menu('t', 'a')");
});

test('bzip2 codec round trip and file functions', () => {
  const rnd = (n, seed) => { const a = new Uint8Array(n); let x = seed; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) >>> 0; a[i] = x >>> 24; } return a; };
  const cases = [new Uint8Array(0), Uint8Array.from([65]), new TextEncoder().encode('hello hello hello hello'), new Uint8Array(5000).fill(7), rnd(30000, 1),
    Uint8Array.from({ length: 20000 }, (_, i) => (i % 3 === 0 ? 97 : 98)), Uint8Array.from({ length: 3000 }, (_, i) => Math.floor(i / 300))];
  for (const c of cases) {
    const z = bzip2Compress(c);
    assert.equal(String.fromCharCode(z[0], z[1], z[2]), 'BZh');
    assert.deepEqual(Array.from(bzip2Decompress(z)), Array.from(c));
  }
  // multi-block input (level 1 = 100k blocks)
  const big = rnd(250000, 7);
  for (let i = 0; i < big.length; i += 7) big[i] = 0;
  assert.deepEqual(bzip2Decompress(bzip2Compress(big, 1)).length, big.length);
  assert.ok(Buffer.compare(Buffer.from(bzip2Decompress(bzip2Compress(big, 1))), Buffer.from(big)) === 0);
  // a stream made by the reference bzip2 program ("hello world\n")
  const ref = Uint8Array.from([0x42, 0x5a, 0x68, 0x39, 0x31, 0x41, 0x59, 0x26, 0x53, 0x59, 0x4e, 0xec, 0xe8, 0x36, 0x00, 0x00, 0x02, 0x51, 0x80, 0x00, 0x10, 0x40, 0x00, 0x06, 0x44, 0x90, 0x80, 0x20, 0x00, 0x31, 0x06, 0x4c, 0x41, 0x01, 0xa7, 0xa9, 0xa5, 0x80, 0xbb, 0x94, 0x31, 0xf8, 0xbb, 0x92, 0x29, 0xc2, 0x84, 0x82, 0x77, 0x67, 0x41, 0xb0]);
  assert.equal(new TextDecoder().decode(bzip2Decompress(ref)), 'hello world\n');
  assert.throws(() => bzip2Decompress(Uint8Array.from([1, 2, 3, 4, 5])));
  const T = session({ files: { '/home/w/a.txt': 'alpha alpha alpha', '/home/w/b.txt': 'beta' } });
  T.run("f = bzip2('w/*.txt'); n = numel(f); e = exist('w/a.txt', 'file');");
  assert.equal(T.v('n'), 2); assert.equal(T.v('e'), 0);
  T.run("g = bunzip2('w/a.txt.bz2'); t = fileread('w/a.txt');"); assert.equal(T.v('t'), 'alpha alpha alpha');
  T.run("bunzip2('w/b.txt.bz2'); bzip2('w/b.txt', 'out'); u = unpack('out/b.txt.bz2', 'un'); t2 = fileread('un/b.txt');"); assert.equal(T.v('t2'), 'beta');
  T.run("tar('pack.tar', {'w/a.txt'}); unpack('pack.tar', 'tx'); t3 = fileread('tx/w/a.txt');"); assert.equal(T.v('t3'), 'alpha alpha alpha');
  T.run("zip('pack.zip', {'w/a.txt'}); z = unpack('pack.zip', 'zx'); nz = numel(z);"); assert.equal(T.v('nz'), 1);
  // tar.bz2 through unpack
  T.run("tar('arch.tar', {'w/a.txt'}); bzip2('arch.tar'); u = unpack('arch.tar.bz2', 'tb'); t4 = fileread('tb/w/a.txt');"); assert.equal(T.v('t4'), 'alpha alpha alpha');
  T.fail("unpack('w/a.txt')");
});
