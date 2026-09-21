// Binary files open in the hex view only: file.read refuses them, file.readRange
// still serves bytes (including files larger than 64 MB), and the UI has no
// "open as text" path.
//   npm test -- test/hex-binary.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isBinaryImageName, openKind, openMode, paneView, MAX_TEXT } from '../src/lib/imagekind.js';

const require = createRequire(import.meta.url);
const files = require('../core/files');
const { createApi } = require('../core/api');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'myeditor-hex-'));

function writeBin(name, bytes) {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, Buffer.from(bytes));
  return p;
}

test('files.read rejects a binary file; sniff and readRange still work', async () => {
  const p = writeBin('payload.bin', [0x4d, 0x5a, ...Array(80).fill(0), 0x50, 0x45]);
  const sniff = await files.sniff(p);
  assert.equal(sniff.binary, true);
  assert.equal(sniff.size, fs.statSync(p).size);
  await assert.rejects(files.read(p), (e) => e.code === 'EBINARY' && e.size === sniff.size);
  const head = await files.readRange(p, 0, 2);
  assert.equal(Buffer.from(head.base64, 'base64').toString('latin1'), 'MZ');
  assert.equal(head.size, sniff.size);
  assert.equal(openMode({ name: 'payload.bin', sniff }), 'hex');
  assert.equal(paneView({ kind: 'hex', name: 'payload.bin' }).hexDump, true);
  assert.equal(paneView({ kind: 'hex', name: 'payload.bin' }).fillPicture, false);
});

test('a text file is still opened as text', async () => {
  const p = writeBin('readme.txt', Buffer.from('hello\nworld\n', 'utf8'));
  const sniff = await files.sniff(p);
  assert.equal(sniff.binary, false);
  const r = await files.read(p);
  assert.equal(r.text.replace(/\r\n/g, '\n'), 'hello\nworld\n');
  assert.equal(openMode({ name: 'readme.txt', sniff }), 'text');
  assert.equal(paneView({ kind: 'text', name: 'readme.txt' }).hexDump, false);
});

test('files.read refuses more than 64 MB; hex range read does not', async () => {
  assert.equal(files.MAX_FILE, MAX_TEXT);
  const p = path.join(tmp, 'huge.bin');
  fs.writeFileSync(p, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0, 0, 0]));
  fs.truncateSync(p, MAX_TEXT + 16);
  assert.equal(fs.statSync(p).size, MAX_TEXT + 16);
  const sniff = await files.sniff(p);
  assert.equal(sniff.size, MAX_TEXT + 16);
  await assert.rejects(files.read(p), (e) => e.code === 'ETOOBIG' && e.size === MAX_TEXT + 16);
  const head = await files.readRange(p, 0, 4);
  assert.equal(Buffer.from(head.base64, 'base64').toString('latin1'), '\x7fELF');
  assert.equal(head.size, MAX_TEXT + 16);
  assert.equal(openMode({ name: 'huge.bin', sniff: { binary: true, size: sniff.size } }), 'hex');
  assert.equal(openMode({ name: 'huge.txt', sniff: { binary: false, size: sniff.size } }), 'too-big');
});

test('api: file.sniff / file.read / file.readRange match the hex path', async () => {
  const api = createApi({ name: 'test', version: '0.0.0', configDir: path.join(tmp, 'cfg') });
  const p = writeBin('lib.dll', [0x4d, 0x5a, 0, 0, 0, 0, 0, 1]);
  const sniff = await api.call('file.sniff', { path: p });
  assert.equal(sniff.binary, true);
  await assert.rejects(api.call('file.read', { path: p }), (e) => e.code === 'EBINARY');
  const r = await api.call('file.readRange', { path: p, offset: 0, length: 2 });
  assert.equal(Buffer.from(r.base64, 'base64')[0], 0x4d);
  assert.equal(openMode({ name: path.basename(p), sniff }), 'hex');
});

test('editor policy: sniffed binaries become hex tabs, never text', async () => {
  const bin = writeBin('tool.exe', [0x4d, 0x5a, ...Array(32).fill(0)]);
  const txt = writeBin('ok.txt', Buffer.from('ok', 'utf8'));
  const sniffBin = await files.sniff(bin);
  const sniffTxt = await files.sniff(txt);
  assert.equal(openMode({ name: 'tool.exe', sniff: sniffBin }), 'hex');
  assert.equal(openMode({ name: 'ok.txt', sniff: sniffTxt }), 'text');
  assert.equal(openKind('tool.exe'), 'unknown');
  assert.equal(isBinaryImageName('tool.exe'), false);
  const view = paneView({ kind: 'hex', name: 'tool.exe', imageHex: false }, { minimap: true });
  assert.deepEqual({ fillPicture: view.fillPicture, hexDump: view.hexDump, hexaBeside: view.hexaBeside }, {
    fillPicture: false, hexDump: true, hexaBeside: false,
  });
});

test('App and HexView have no path that reopens a binary as text', () => {
  const app = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
  assert.doesNotMatch(app, /hexAsText|onOpenAsText|hex_as_text/);
  assert.match(app, /s && s\.binary[\s\S]{0,80}openHex/);
  assert.match(app, /EBINARY' && !force\) return openHex/);
  assert.match(app, /it is not reopened as text/);
  const hex = fs.readFileSync(path.join(root, 'src', 'components', 'HexView.jsx'), 'utf8');
  assert.doesNotMatch(hex, /onOpenAsText|hex_as_text|텍스트로 열기|Open as text/);
  const i18n = fs.readFileSync(path.join(root, 'src', 'lib', 'i18n.js'), 'utf8');
  assert.doesNotMatch(i18n, /hex_as_text/);
  assert.match(i18n, /hex_readonly/);
});
