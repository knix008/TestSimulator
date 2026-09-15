// Unit tests for core/ (no Electron, no browser): encodings, line endings,
// file read/write, session persistence and the API surface.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const enc = require('../core/encoding');
const files = require('../core/files');
const { createSession } = require('../core/session');
const { createApi, serializeError } = require('../core/api');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'myeditor-test-'));

test('encoding: BOM detection and round trips', () => {
  const text = '안녕하세요 Hello 日本語\nline 2';
  for (const id of ['utf8', 'utf8bom', 'utf16le', 'utf16be', 'cp949']) {
    const buf = enc.encode(text, id, 'lf');
    const d = enc.decode(buf);
    if (id === 'cp949') {
      // No BOM and not valid UTF-8 → the machine's legacy code page; decode explicitly instead.
      assert.equal(enc.decode(buf, { encoding: 'cp949' }).text.startsWith('안녕하세요'), true);
    } else {
      assert.equal(d.encoding, id, `detected ${id}`);
      assert.equal(d.text, text);
    }
  }
  assert.equal(enc.encode('x', 'utf8bom', 'lf')[0], 0xef);
  assert.equal(enc.encode('x', 'utf16le', 'lf').length, 4);   // BOM + 1 UTF-16 unit
  assert.equal(enc.encode('x', 'utf16be', 'lf')[0], 0xfe);
});

test('encoding: UTF-16 without BOM is sniffed, binary is flagged', () => {
  const le = Buffer.from('hello world\n', 'utf16le');
  assert.equal(enc.decode(le).encoding, 'utf16le');
  assert.equal(enc.decode(le).text, 'hello world\n');
  const bin = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100, 0), Buffer.from('abc')]);
  assert.equal(enc.decode(bin).binary, true);
});

test('encoding: line endings detected, normalized and re-applied', () => {
  assert.equal(enc.detectEol('a\r\nb\r\nc\n'), 'crlf');
  assert.equal(enc.detectEol('a\nb\nc\r\n'), 'lf');
  assert.equal(enc.detectEol('a\rb\rc'), 'cr');
  assert.equal(enc.detectEol('no newline', 'crlf'), 'crlf');
  assert.equal(enc.normalizeEol('a\r\nb\rc\n'), 'a\nb\nc\n');
  assert.equal(enc.applyEol('a\nb\n', 'crlf'), 'a\r\nb\r\n');
  const d = enc.decode(Buffer.from('x\r\ny\r\n'));
  assert.equal(d.eol, 'crlf');
  assert.equal(d.text, 'x\ny\n');
  assert.equal(enc.encode(d.text, d.encoding, d.eol).toString(), 'x\r\ny\r\n');
});

test('encoding: canEncode warns about lossy conversions', () => {
  assert.equal(enc.canEncode('한글', 'utf8'), true);
  assert.equal(enc.canEncode('한글', 'cp949'), true);
  assert.equal(enc.canEncode('한글', 'windows1252'), false);
  assert.equal(enc.canEncode('café', 'windows1252'), true);
});

test('files: read / write keep encoding and eol, atomic write, listing', async () => {
  const p = path.join(tmp, 'doc.txt');
  await files.write(p, 'first\nsecond\n', { encoding: 'utf8bom', eol: 'crlf' });
  const raw = fs.readFileSync(p);
  assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(raw.subarray(3).toString(), 'first\r\nsecond\r\n');
  const r = await files.read(p);
  assert.equal(r.encoding, 'utf8bom');
  assert.equal(r.eol, 'crlf');
  assert.equal(r.text, 'first\nsecond\n');
  assert.equal(typeof r.mtime, 'number');
  assert.equal(fs.readdirSync(tmp).some((n) => n.endsWith('.tmp')), false, 'no temp file left behind');

  fs.mkdirSync(path.join(tmp, 'sub', 'deep'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'b.txt'), 'b');
  fs.writeFileSync(path.join(tmp, '.hidden'), 'h');
  fs.writeFileSync(path.join(tmp, 'a10.txt'), 'x');
  fs.writeFileSync(path.join(tmp, 'a2.txt'), 'x');
  const l = await files.list(tmp);
  assert.equal(l.entries[0].name, 'sub');                     // folders first
  assert.equal(l.entries.some((e) => e.name === '.hidden'), false);
  const names = l.entries.filter((e) => !e.isDir).map((e) => e.name);
  assert.ok(names.indexOf('a2.txt') < names.indexOf('a10.txt'), 'natural order');
  const lh = await files.list(tmp, { showHidden: true });
  assert.equal(lh.entries.some((e) => e.name === '.hidden'), true);
  await assert.rejects(files.read(path.join(tmp, 'sub')), (e) => e.code === 'EISDIR');
  fs.writeFileSync(path.join(tmp, 'bin.dat'), Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64, 0)]));
  await assert.rejects(files.read(path.join(tmp, 'bin.dat')), (e) => e.code === 'EBINARY');
  const dr = await files.drives();
  assert.ok(dr.length > 0);
});

test('session: defaults, persistence and recent list', () => {
  const dir = path.join(tmp, 'cfg');
  const s = createSession(dir);
  const first = s.get();
  assert.equal(first.language, 'ko');
  assert.equal(first.fontSize, 14);
  s.save({ theme: 'nord', tabs: [{ path: null, name: 'new 1', draft: 'x'.repeat(600 * 1024) }] });
  const s2 = createSession(dir);
  const g = s2.get();
  assert.equal(g.theme, 'nord');
  assert.equal(g.tabs[0].draft, '');                 // too large a draft is dropped
  assert.equal(g.tabs[0].draftTooLarge, true);
  s2.touchRecent('/a'); s2.touchRecent('/b'); s2.touchRecent('/a');
  assert.deepEqual(s2.get().recent, ['/a', '/b']);
  s2.removeRecent('/b');
  assert.deepEqual(s2.get().recent, ['/a']);
  s2.clearRecent();
  assert.deepEqual(s2.get().recent, []);
});

test('api: surface, errors are serializable, encoding guard on write', async () => {
  const api = createApi({ name: 'test', version: '0.0.0', configDir: path.join(tmp, 'cfg2') });
  const info = await api.call('app.info');
  assert.equal(info.host, 'test');
  assert.ok(info.encodings.some((e) => e.id === 'cp949'));
  const p = path.join(tmp, 'api.txt');
  await api.call('file.write', { path: p, text: 'hi\n', encoding: 'utf8', eol: 'lf' });
  const r = await api.call('file.read', { path: p });
  assert.equal(r.text, 'hi\n');
  assert.equal(r.name, 'api.txt');
  await assert.rejects(api.call('file.write', { path: p, text: '한글', encoding: 'windows1252', eol: 'lf' }), (e) => e.code === 'EENCODE');
  await assert.rejects(api.call('nope'), (e) => e.code === 'ENOMETHOD');
  let caught = null;
  try { await api.call('file.read', { path: path.join(tmp, 'missing.txt') }); } catch (e) { caught = serializeError(e); }
  assert.equal(caught.code, 'ENOENT');
  assert.ok(caught.message);
  assert.equal(await api.call('file.exists', { path: p }), true);
  assert.equal((await api.call('fs.list', { path: tmp })).entries.some((e) => e.name === 'api.txt'), true);
});
