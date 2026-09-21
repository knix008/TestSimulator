// File ops, print, terminal text, prompt helpers, i18n, icons, DICOM, PNG.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { t, tAll, getLanguage } from '../src/lib/i18n.js';
import { mergeOutput } from '../src/lib/termtext.js';
import { printOptsOf, PRINT_DEFAULTS } from '../src/lib/print.js';
import { computeIndentLevel, indentColumns, indentLevelFromColumns, guideColumns, whitespaceIndentLevel } from '../src/lib/indentguides.js';
import { formatMs, goDate, formatPath, defaultTemplate, SEGMENT_TYPES, renderTemplate, resolveColor, GIT_STATE_COLORS } from '../src/lib/prompt.js';
const require = createRequire(import.meta.url);
const { serializeError, createApi } = require('../core/api');
const files = require('../core/files');
const png = require('../core/png');
const { applyWindow, WINDOW_PRESETS } = require('../core/dicom');
const { protectCmdLine, isPosixWinTool, parseEtcShells, parseWtCommandLine } = require('../core/terminal');
const enc = require('../core/encoding');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'med-helpers-'));

test('files mkdir, rename, exists, remove, stat', async () => {
  const dir = path.join(tmp, 'nested', 'dir');
  const st = await files.mkdir(dir);
  assert.equal(st.isDir, true);
  assert.equal(await files.exists(dir), true);
  const moved = path.join(tmp, 'moved');
  await files.rename(dir, moved);
  assert.equal(await files.exists(dir), false);
  assert.equal(await files.exists(moved), true);
  await files.remove(moved);
  assert.equal(await files.exists(moved), false);
  assert.equal(await files.exists(path.join(tmp, 'nope')), false);
});

test('files writeDataUrl and dataUrl round-trip a PNG', async () => {
  const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]);
  const url = png.dataUrl(2, 2, rgba);
  const p = path.join(tmp, 'tiny.png');
  const w = await files.writeDataUrl(p, url);
  assert.ok(w.size > 0);
  const r = await files.dataUrl(p);
  assert.match(r.dataUrl, /^data:image\/png;base64,/);
  const sniff = await files.sniff(p);
  assert.equal(sniff.binary, true);
  await assert.rejects(files.dataUrl(path.join(tmp, 'x.bin')), (e) => e.code === 'ENOTIMAGE');
});

test('files.readRange clamps offset and empty files are still readable', async () => {
  const p = path.join(tmp, 'empty.txt');
  await files.write(p, '', { encoding: 'utf8', eol: 'lf' });
  const r = await files.readRange(p, 0, 16);
  assert.equal(r.size, 0);
  assert.equal(r.base64, '');
  await files.write(p, 'abcdef', { encoding: 'utf8', eol: 'lf' });
  const slice = await files.readRange(p, 2, 3);
  assert.equal(Buffer.from(slice.base64, 'base64').toString(), 'cde');
  const past = await files.readRange(p, 999, 10);
  assert.equal(past.base64, '');
});

test('PNG encoder writes a valid 1×1 pixel', () => {
  const buf = png.encodeRgba(1, 1, new Uint8Array([10, 20, 30, 255]));
  assert.deepEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(buf.toString('ascii', 12, 16), 'IHDR');
  assert.equal(buf.readUInt32BE(16), 1);
  assert.equal(buf.readUInt32BE(20), 1);
});

test('DICOM window presets cover abdomen through liver', () => {
  for (const id of ['abdomen', 'bone', 'brain', 'lung', 'soft', 'liver']) {
    assert.ok(WINDOW_PRESETS[id].ww > 0);
    assert.equal(typeof WINDOW_PRESETS[id].wl, 'number');
  }
});

test('applyWindow maps a stored value through ww/wl to grey', () => {
  const pixels = new Uint8Array([0, 40, 80, 255]);
  const rgba = applyWindow(pixels, { width: 4, height: 1, ww: 80, wl: 40 });
  assert.equal(rgba[3], 255);
  assert.equal(rgba[4], rgba[5]);
  assert.ok(rgba[0] < rgba[8]);
});

const I18N = [
  ['ok', '확인', 'OK'],
  ['cancel', '취소', 'Cancel'],
  ['lint_tab', '문제점', 'Problems'],
  ['save', '저장', 'Save'],
  ['new_file', '새 문서', 'New'],
  ['open_file', '열기…', 'Open…'],
  ['settings', '설정', 'Settings'],
  ['about', '정보', 'About'],
  ['hex_opened', null, null],
  ['inst_retry', null, null],
  ['inst_ask_runtime_title', null, null],
  ['inst_kind_runtime', null, null],
  ['too_big_title', null, null],
  ['binary_title', null, null],
  ['set_print_page_setup', '용지', 'Paper'],
  ['set_print_paper', '용지 크기', 'Paper size'],
  ['set_print_margin', '여백', 'Margins'],
];

for (const [key, ko, en] of I18N) {
  test(`i18n ${key} has Korean and English`, () => {
    assert.equal(getLanguage(), 'ko');
    const koText = t(key);
    assert.notEqual(koText, key, key);
    if (ko) assert.equal(koText, ko);
    const all = tAll(key);
    assert.ok(all.length >= 1);
    if (en) assert.ok(all.includes(en), all.join(' | '));
  });
}

test('i18n interpolates {n} placeholders', () => {
  assert.equal(t('untitled', { n: 3 }), '새 문서 3');
  assert.match(t('st_pos', { line: 12, col: 4 }), /12/);
  assert.match(t('matches', { n: 7 }), /7/);
});

test('printOptsOf fills defaults and clamps tab size', () => {
  const d = printOptsOf({});
  assert.equal(d.printHeader, PRINT_DEFAULTS.printHeader);
  assert.equal(d.printFontSize, 9.5);
  assert.equal(d.printPaper, 'a4');
  assert.equal(d.printLandscape, false);
  assert.equal(d.printMargin, 12);
  assert.equal(d.tabSize, 4);
  const off = printOptsOf({ printHeader: false, printBorder: true, printFontSize: 0, tabSize: 99 });
  assert.equal(off.printHeader, false);
  assert.equal(off.printBorder, true);
  assert.equal(off.printFontSize, 9.5);
  assert.equal(off.tabSize, 16);
});

test('mergeOutput overwrite, newline, strip, CRLF', () => {
  assert.equal(mergeOutput('abc', '\rXY', 'overwrite'), 'XY');
  assert.equal(mergeOutput('abc', '\rXY', 'newline'), 'abc\nXY');
  assert.equal(mergeOutput('abc', '\rXY', 'strip'), 'abcXY');
  assert.equal(mergeOutput('ab', '\r\ncd', 'overwrite'), 'ab\ncd');
  assert.equal(mergeOutput('ab\r', 'cd', 'overwrite'), 'cd');
});

test('indent guides: spaces, tabs, whitespace lines', () => {
  assert.equal(computeIndentLevel('    foo', 4), 4);
  assert.equal(computeIndentLevel('\tfoo', 4), 4);
  assert.equal(computeIndentLevel('    ', 4), -1);
  assert.equal(indentColumns('        x', 4), 8);
  assert.equal(indentLevelFromColumns(8, 4), 2);
  assert.deepEqual(guideColumns(8, 4), [0, 4]);
  assert.equal(whitespaceIndentLevel(4, 8, 4), 2);
  assert.equal(whitespaceIndentLevel(8, 4, 4), 2);
  assert.equal(whitespaceIndentLevel(-1, 4, 4), 0);
});

for (const type of SEGMENT_TYPES) {
  test(`prompt default template for ${type}`, () => {
    const tpl = defaultTemplate(type);
    assert.equal(typeof tpl, 'string');
    assert.ok(tpl.length > 0);
  });
}

test('formatMs and goDate and formatPath', () => {
  assert.equal(formatMs(12), '12ms');
  assert.equal(formatMs(1500), '1.50s');
  assert.match(formatMs(65000), /1m/);
  const d = new Date(2026, 8, 21, 13, 9, 0);
  assert.equal(goDate(d, '2006-01-02'), '2026-09-21');
  assert.equal(goDate(d, '15:04'), '13:09');
  assert.equal(formatPath('C:\\Home\\Projects\\App', 'C:\\Home', { style: 'folder' }), 'App');
  assert.equal(formatPath('C:\\Home\\Projects\\App', 'C:\\Home', { style: 'full' }).includes('Projects'), true);
});

test('renderTemplate and resolveColor', () => {
  assert.equal(renderTemplate('hi {{ .Name }}', { Name: 'cmd' }), 'hi cmd');
  assert.equal(resolveColor('transparent', {}), null);
  assert.equal(resolveColor('auto', { gitStateName: 'staged' }), GIT_STATE_COLORS.staged);
  assert.equal(resolveColor('#ff00aa', {}), '#ff00aa');
  assert.equal(resolveColor('accent', { theme: { accent: '#abc' } }), '#abc');
});

test('protectCmdLine leaves builtins alone; posix dll paths are detected', () => {
  assert.equal(protectCmdLine('echo hi'), 'echo hi');
  assert.equal(protectCmdLine('dir'), 'dir');
  assert.equal(isPosixWinTool('C:\\cygwin64\\bin\\ls.exe'), true);
  assert.equal(isPosixWinTool('C:\\Git\\usr\\bin\\ls.exe'), true);
  assert.equal(isPosixWinTool('C:\\Windows\\System32\\cmd.exe'), false);
  assert.deepEqual(parseEtcShells('/bin/zsh\n'), ['/bin/zsh']);
  assert.equal(parseWtCommandLine('pwsh.exe -NoLogo'), 'pwsh.exe');
});

test('serializeError keeps code and message', () => {
  const e = new Error('boom'); e.code = 'EFAIL'; e.path = '/x';
  const s = serializeError(e);
  assert.equal(s.code, 'EFAIL');
  assert.equal(s.message, 'boom');
  assert.equal(s.path, '/x');
  assert.equal(serializeError(null).code, 'UNKNOWN');
});

test('api methods cover files, session, lint, format and install', async () => {
  const dir = path.join(tmp, 'cfg-api');
  const api = createApi({ name: 'test', version: '0.0.0', configDir: dir });
  const names = Object.keys(api.methods).sort();
  for (const n of [
    'app.info', 'session.get', 'session.save', 'file.read', 'file.write', 'file.sniff', 'file.readRange',
    'file.exists', 'fs.list', 'fs.mkdir', 'fs.rename', 'fs.remove', 'lint.run', 'lint.tools',
    'format.run', 'format.tools', 'install.start', 'install.status', 'term.create', 'term.kill',
  ]) {
    assert.ok(names.includes(n), n);
  }
  assert.equal(await api.call('file.canEncode', { text: '한글', encoding: 'utf8' }), true);
  assert.equal(enc.ENCODINGS.length, 11);
  await api.shutdown();
});

test('app icon documents are large cards inside the well', () => {
  const svg = fs.readFileSync(path.join(root, 'assets', 'icon.svg'), 'utf8');
  assert.match(svg, /width="108" height="136"/);
  assert.match(svg, /scale\(0\.96\)/);
  assert.match(svg, /width="312" height="280"/);
  const gen = fs.readFileSync(path.join(root, 'scripts', 'generate-file-icons.mjs'), 'utf8');
  assert.match(gen, /M58 28h72l48 48/);
});

test('MAX_FILE is 64 MB', () => {
  assert.equal(files.MAX_FILE, 64 * 1024 * 1024);
});
