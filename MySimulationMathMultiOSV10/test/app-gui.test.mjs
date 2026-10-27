// Pure parts of the GUI: value display and editing in the Variable Editor,
// file kinds and import commands, %% sections, settings merge, the
// ko / en dictionary, and the name rule for the app's own files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatNumber, formatComplex, valueSummary, cellText, parseCell, withCell, gridShape } from '../src/lib/valueFormat.js';
import { fileKind, importCommand, varNameOf, mQuote, globToRegExp, setModelExts, getModelExts } from '../src/lib/files.js';
import { merge, DEFAULTS } from '../src/lib/settings.js';
import { DICT, KEYS } from '../src/lib/i18n.js';
import { sectionOfText } from '../src/lib/sections.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = (dims, re, cls = 'double', im = null) => ({ cls, dims, re: Float64Array.from(re), im: im ? Float64Array.from(im) : null });

test('formatNumber / formatComplex like format short and long', () => {
  assert.equal(formatNumber(3), '3');
  assert.equal(formatNumber(Math.PI), '3.1416');
  assert.equal(formatNumber(Math.PI, 'double', 'long'), '3.141592653589793');
  assert.equal(formatNumber(1.5e-7), '1.5000e-7');
  assert.equal(formatNumber(NaN), 'NaN');
  assert.equal(formatNumber(-Infinity), '-Inf');
  assert.equal(formatNumber(1, 'logical'), '1');
  assert.equal(formatNumber(7.9, 'int8'), '7');
  assert.equal(formatComplex(1, -2), '1 - 2i');
  assert.equal(formatComplex(0.5, 0), '0.5000');
});

test('valueSummary: scalars, short vectors, text, others', () => {
  assert.equal(valueSummary(T([1, 1], [2.5])), '2.5000');
  assert.equal(valueSummary(T([1, 3], [1, 2, 3])), '[1 2 3]');
  assert.equal(valueSummary(T([3, 1], [1, 2, 3])), '[1;2;3]');
  assert.equal(valueSummary(T([20, 20], new Array(400).fill(0))), '20×20 double');
  assert.equal(valueSummary(T([0, 0], [])), '[]');
  assert.equal(valueSummary({ cls: 'char', dims: [1, 2], re: Float64Array.of(104, 105) }), "'hi'");
  assert.equal(valueSummary({ cls: 'string', dims: [1, 1], data: ['abc'] }), '"abc"');
  assert.equal(valueSummary({ cls: 'cell', dims: [1, 2], data: [] }), '1×2 cell');
  assert.equal(valueSummary({ cls: 'function_handle', dims: [1, 1], name: 'sin' }), '@sin');
});

test('cellText reads column-major cells', () => {
  const m = T([2, 3], [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(gridShape(m), { rows: 2, cols: 3 });
  assert.equal(cellText(m, 0, 1), '3');
  assert.equal(cellText(m, 1, 2), '6');
  assert.equal(cellText({ cls: 'cell', dims: [1, 1], data: [T([1, 1], [9])] }, 0, 0), '9');
});

test('parseCell accepts numbers, Inf/NaN and complex forms', () => {
  assert.deepEqual(parseCell('3.5'), { re: 3.5, im: 0 });
  assert.deepEqual(parseCell(' -2e3 '), { re: -2000, im: 0 });
  assert.deepEqual(parseCell('1+2i'), { re: 1, im: 2 });
  assert.deepEqual(parseCell('1 - 0.5j'), { re: 1, im: -0.5 });
  assert.deepEqual(parseCell('-i'), { re: 0, im: -1 });
  assert.deepEqual(parseCell('4i'), { re: 0, im: 4 });
  assert.deepEqual(parseCell('Inf'), { re: Infinity, im: 0 });
  assert.ok(Number.isNaN(parseCell('nan').re));
  assert.deepEqual(parseCell(''), { re: 0, im: 0 });
  assert.equal(parseCell('abc'), null);
  assert.equal(parseCell('1..2'), null);
});

test('withCell edits, grows with zeros and keeps the original', () => {
  const m = T([2, 2], [1, 2, 3, 4]);
  const a = withCell(m, 0, 1, { re: 9, im: 0 });
  assert.deepEqual(Array.from(a.re), [1, 2, 9, 4]);
  assert.deepEqual(Array.from(m.re), [1, 2, 3, 4], 'values are immutable');
  const b = withCell(m, 2, 2, { re: 5, im: 0 });
  assert.deepEqual(b.dims, [3, 3]);
  assert.deepEqual(Array.from(b.re), [1, 2, 0, 3, 4, 0, 0, 0, 5]);
  const c = withCell(m, 1, 1, { re: 0, im: 2 });
  assert.deepEqual(Array.from(c.im), [0, 0, 0, 2]);
  assert.equal(withCell(c, 1, 1, { re: 1, im: 0 }).im, null, 'complex part dropped when all zero');
  assert.deepEqual(Array.from(withCell(T([1, 1], [0], 'logical'), 0, 0, { re: 7, im: 0 }).re), [1]);
});

test('file kinds, import commands and names', () => {
  assert.equal(fileKind('/a/run.m'), 'script');
  assert.equal(fileKind('/a/plant.msim'), 'model');
  assert.equal(fileKind('/a/plant.smdl'), 'model');
  assert.equal(fileKind('C:/d/x.MAT'), 'data');
  assert.equal(fileKind('v.csv'), 'table');
  assert.equal(fileKind('p.PNG'), 'image');
  assert.equal(fileKind('readme.txt'), 'text');
  assert.equal(fileKind('tool.exe'), 'other');
  setModelExts('.xmdl');
  assert.ok(getModelExts().includes('.xmdl'));
  assert.equal(fileKind('m.xmdl'), 'model');
  assert.equal(varNameOf('my data-1.csv'), 'my_data_1');
  assert.equal(varNameOf('2024.csv'), 'x2024');
  assert.equal(mQuote("it's"), "'it''s'");
  assert.equal(importCommand('/w/d.mat'), "load('/w/d.mat')");
  assert.equal(importCommand('/w/v.csv'), "v = readmatrix('/w/v.csv');");
  assert.equal(importCommand('/w/p.png', 'img'), "img = imread('/w/p.png');");
  assert.equal(importCommand('/w/s.wav'), "[s, s_fs] = audioread('/w/s.wav');");
});

test('globToRegExp: * ? and several patterns', () => {
  assert.ok(globToRegExp('*.m').test('Run.M'));
  assert.ok(!globToRegExp('*.m').test('a.mat'));
  assert.ok(globToRegExp('data?.csv').test('data1.csv'));
  assert.ok(globToRegExp('*.m; *.msim').test('x.msim'));
  assert.ok(globToRegExp('').test('anything'));
  assert.ok(globToRegExp('a+b(1).m').test('a+b(1).m'));
});

test('%% sections of a script', () => {
  const text = '%% One\na = 1;\n%% Two\nb = 2;\nc = 3;\n%%\nd = 4;';
  assert.deepEqual(sectionOfText(text, 2), { startLine: 1, endLine: 2, text: '%% One\na = 1;' });
  assert.deepEqual(sectionOfText(text, 5), { startLine: 3, endLine: 5, text: '%% Two\nb = 2;\nc = 3;' });
  assert.equal(sectionOfText(text, 7).text, '%%\nd = 4;');
  assert.equal(sectionOfText('x = 1;\ny = 2;', 2).text, 'x = 1;\ny = 2;');
  assert.equal(sectionOfText('%%comment-not-section\nx', 2).startLine, 1);
});

test('settings merge: objects merge deeply, arrays replace', () => {
  const s = merge(DEFAULTS, { cmd: { fontSize: 16 }, openFiles: ['/a.m'], layout: { folder: { on: false } } });
  assert.equal(s.cmd.fontSize, 16);
  assert.equal(s.cmd.numericFormat, 'short');
  assert.deepEqual(s.openFiles, ['/a.m']);
  assert.equal(s.layout.folder.on, false);
  assert.equal(s.layout.folder.w, DEFAULTS.layout.folder.w);
  assert.equal(DEFAULTS.cmd.fontSize, 13, 'defaults are not changed');
});

test('dictionary: every key in both languages, placeholders match', () => {
  assert.ok(KEYS.length > 300);
  for (const k of KEYS) {
    assert.ok(DICT.ko[k] && DICT.en[k], `missing text for ${k}`);
    const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    assert.equal(vars(DICT.ko[k]), vars(DICT.en[k]), `placeholders differ for ${k}`);
  }
});

test('every t(key) used by the app shell exists in the dictionary', () => {
  const files = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { if (!['graphics', 'sim'].includes(ent.name)) walk(p); } else if (/\.(jsx?|mjs)$/.test(ent.name) && ent.name !== 'i18n.js') files.push(p);
    }
  };
  walk(path.join(root, 'src'));
  const missing = [];
  for (const f of files) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bt\('([A-Za-z0-9_]+)'/g)) if (!DICT.en[m[1]]) missing.push(`${path.basename(f)}: ${m[1]}`);
  }
  assert.deepEqual(missing, []);
});

test('name rule: the app files never name the commercial products', () => {
  const bad = new RegExp(['matl', 'ab|simul', 'ink'].join(''), 'i');
  const checked = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { if (!['graphics', 'sim'].includes(ent.name)) walk(p); } else if (/\.(jsx?|mjs|css|rs|json|html|md|nsh)$/.test(ent.name)) checked.push(p);
    }
  };
  for (const d of ['src', 'server', 'scripts', 'src-tauri/src', 'src-tauri/windows']) walk(path.join(root, d));
  for (const f of ['index.html', 'vite.config.mjs', 'package.json', 'src-tauri/tauri.conf.json', 'core/fs-node.js', 'README.md', 'ARCHITECTURE.md', 'USERSGUIDE.md']) if (fs.existsSync(path.join(root, f))) checked.push(path.join(root, f));
  const hits = checked.filter((f) => bad.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(root, f));
  assert.deepEqual(hits, []);
  assert.ok(checked.length > 30);
});
