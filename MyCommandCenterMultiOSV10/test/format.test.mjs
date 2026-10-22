// Display helpers of the panels (src/lib/format.js): sizes, types, paths, breadcrumbs, patterns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSize, sizeDisplay, typeDisplay, setSeparator, getSeparator, joinPath, baseName, dirName,
  samePath, breadcrumbs, driveOf, truncateMiddle, globToRegExp,
} from '../src/lib/format.js';

const posix = () => setSeparator('/');
const win = () => setSeparator('\\');

// ── formatSize ──
for (const [bytes, want] of [
  [0, '0 B'], [1, '1 B'], [1023, '1023 B'], [1024, '1.0 KB'], [1536, '1.5 KB'],
  [1024 * 1024 - 1, '1024.0 KB'], [1024 * 1024, '1.0 MB'], [5.25 * 1024 * 1024, '5.3 MB'],
  [1024 ** 3, '1.0 GB'], [2.5 * 1024 ** 4, '2560.0 GB'],
]) {
  test(`formatSize(${bytes}) → ${want}`, () => assert.equal(formatSize(bytes), want));
}

test('sizeDisplay: a folder shows <DIR>, a file its size', () => {
  assert.equal(sizeDisplay({ isDir: true, size: 4096 }), '<DIR>');
  assert.equal(sizeDisplay({ isDir: false, size: 2048 }), '2.0 KB');
});

test('typeDisplay: folder, "EXT 파일", or a plain file without extension', () => {
  assert.equal(typeDisplay({ isDir: true }), '폴더');
  assert.equal(typeDisplay({ isDir: false, ext: '.txt' }), 'TXT 파일');
  assert.equal(typeDisplay({ isDir: false, ext: '.tar' }), 'TAR 파일');
  assert.equal(typeDisplay({ isDir: false, ext: '' }), '파일');
  assert.equal(typeDisplay({ isDir: false, ext: '.' }), '파일', 'a lone dot is no extension');
});

test('setSeparator / getSeparator: "/" is the fallback', () => {
  win(); assert.equal(getSeparator(), '\\');
  setSeparator(''); assert.equal(getSeparator(), '/');
  posix();
});

test('joinPath: one separator between folder and name, none doubled', () => {
  posix();
  assert.equal(joinPath('/home/me', 'a.txt'), '/home/me/a.txt');
  assert.equal(joinPath('/', 'etc'), '/etc');
  assert.equal(joinPath('', 'x'), 'x');
  win();
  assert.equal(joinPath('C:\\Users', 'me'), 'C:\\Users\\me');
  assert.equal(joinPath('C:\\', 'Windows'), 'C:\\Windows');
  posix();
});

for (const [p, want] of [
  ['/home/me/a.txt', 'a.txt'], ['/home/me/', 'me'], ['C:\\Users\\me\\doc.pdf', 'doc.pdf'],
  ['C:\\Users\\me\\\\', 'me'], ['plain', 'plain'], ['mixed/dir\\file.js', 'file.js'],
]) {
  test(`baseName(${JSON.stringify(p)}) → ${want}`, () => assert.equal(baseName(p), want));
}

test('dirName: parent folder; the root of a drive keeps its backslash', () => {
  posix();
  assert.equal(dirName('/home/me/a.txt'), '/home/me');
  assert.equal(dirName('/etc'), '/');
  assert.equal(dirName('/home/me/'), '/home');
  assert.equal(dirName('C:\\Users'), 'C:\\');
  assert.equal(dirName('C:\\Users\\me\\a.txt'), 'C:\\Users\\me');
  assert.equal(dirName('noslash'), 'noslash');
});

test('samePath (POSIX): trailing slashes do not count, case does', () => {
  posix();
  assert.equal(samePath('/home/me', '/home/me/'), true);
  assert.equal(samePath('/home/Me', '/home/me'), false);
  assert.equal(samePath('/', '/'), true);
  assert.equal(samePath('', ''), true);
});

test('samePath (Windows): case and slash direction do not count', () => {
  win();
  assert.equal(samePath('C:\\Users\\Me', 'c:/users/me/'), true);
  assert.equal(samePath('C:\\a', 'C:\\b'), false);
  posix();
});

test('breadcrumbs: a Windows path starts at its drive', () => {
  assert.deepEqual(breadcrumbs('C:\\Users\\me'), [
    { label: 'C:\\', path: 'C:\\' }, { label: 'Users', path: 'C:\\Users' }, { label: 'me', path: 'C:\\Users\\me' },
  ]);
});

test('breadcrumbs: a POSIX path starts at /', () => {
  assert.deepEqual(breadcrumbs('/home/me'), [
    { label: '/', path: '/' }, { label: 'home', path: '/home' }, { label: 'me', path: '/home/me' },
  ]);
  assert.deepEqual(breadcrumbs('/'), [{ label: '/', path: '/' }]);
});

test('breadcrumbs: empty path → none; a relative path is joined with the separator', () => {
  posix();
  assert.deepEqual(breadcrumbs(''), []);
  assert.deepEqual(breadcrumbs('a/b').map((c) => c.path), ['a', 'a/b']);
});

for (const [p, want] of [['C:\\Users', 'C:\\'], ['d:/data', 'D:\\'], ['e:', 'E:\\'], ['/home', '/'], ['', '/'], [null, '/']]) {
  test(`driveOf(${JSON.stringify(p)}) → ${want}`, () => assert.equal(driveOf(p), want));
}

test('truncateMiddle: short text unchanged, long paths keep the last name', () => {
  posix();
  assert.equal(truncateMiddle('/a/b.txt'), '/a/b.txt');
  assert.equal(truncateMiddle(''), '');
  assert.equal(truncateMiddle(null), '');
  const long = `/very/${'deep/'.repeat(20)}report.pdf`;
  assert.equal(truncateMiddle(long, 20), '…/report.pdf');
  const r = truncateMiddle(`/x/${'n'.repeat(80)}`, 20);
  assert.equal(r.length, 20);
  assert.ok(r.endsWith('…'));
});

test('globToRegExp: * and ? wildcards, case-insensitive', () => {
  const re = globToRegExp('*.txt');
  assert.ok(re.test('a.txt') && re.test('README.TXT'));
  assert.ok(!re.test('a.txt.bak'));
  assert.ok(globToRegExp('a?c').test('abc') && !globToRegExp('a?c').test('abbc'));
});

test('globToRegExp: several patterns by ; or space; empty means everything', () => {
  const re = globToRegExp('*.jpg; *.png *.gif');
  for (const n of ['a.jpg', 'b.PNG', 'c.gif']) assert.ok(re.test(n), n);
  assert.ok(!re.test('d.bmp'));
  assert.ok(globToRegExp('').test('anything'));
  assert.ok(globToRegExp(undefined).test('anything'));
});

test('globToRegExp: regex characters in a pattern are literal', () => {
  assert.ok(globToRegExp('a+b(1).txt').test('a+b(1).txt'));
  assert.ok(!globToRegExp('a.b').test('axb'), 'a dot is a dot');
  assert.ok(globToRegExp('[x]*').test('[x]yz'));
});
