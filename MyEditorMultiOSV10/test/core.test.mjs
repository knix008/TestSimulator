// Unit tests for core/ (no Electron, no browser): encodings, line endings,
// file read/write, session persistence and the API surface.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

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
  assert.equal(first.fontSize, 12);
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

test('encoding: one NUL in a source file is still text; real binaries are not', () => {
  // core/search.js itself holds a literal NUL (a placeholder in a regex replace) and used to open as binary.
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'core', 'search.js'));
  assert.ok(src.includes(0), 'the fixture still contains a NUL');
  assert.equal(enc.decode(src).binary, false);
  assert.equal(enc.decode(Buffer.from('const A = "' + String.fromCharCode(0) + '";' + String.fromCharCode(10) + 'let b = 1;' + String.fromCharCode(10))).binary, false, 'a tiny file with one NUL');
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(Array.from({ length: 4000 }, (_, i) => (i * 7919) & 0xff))]);
  assert.equal(enc.decode(png).binary, true);
  assert.equal(enc.decode(Buffer.alloc(64)).binary, true, 'all NULs');
  assert.equal(enc.decode(Buffer.from('hello world\n', 'utf16le')).encoding, 'utf16le', 'UTF-16 without BOM is still sniffed first');
});

test('session: terminal / theme / preview defaults', () => {
  const s = createSession(path.join(tmp, 'cfg3')).get();
  assert.equal(s.termEol, 'auto');
  assert.equal(s.termCr, 'overwrite');
  assert.equal(s.prompt, null);
  assert.equal(s.autocomplete, true);
  assert.equal(s.htmlPreview, false);
  assert.deepEqual(s.customThemes, []);
});

test('api: app.info carries the user and host for the prompt', async () => {
  const api = createApi({ name: 'test', version: '0.0.0', configDir: path.join(tmp, 'cfg4') });
  const info = await api.call('app.info');
  assert.equal(typeof info.user, 'string');
  assert.ok(info.hostname);
  assert.ok(info.home);
});

// The terminal against a real shell: the marker after a command gives the
// directory and the exit status, a lone CR reaches the panel as it is, CR LF
// is normalised, and the line ending of input to a running program follows
// the option. cmd on Windows, sh elsewhere.
test('terminal: cwd + exit status markers, CR pass-through, input line ending', async () => {
  const { createTerminals } = require('../core/terminal');
  const T = createTerminals();
  const win = process.platform === 'win32';
  const s = T.create({ shell: win ? 'cmd' : 'sh', cwd: tmp });
  const drain = async (since, ms = 4000) => {
    let text = '', seq = since, last = null;
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const r = await T.read({ id: s.id, since: seq, wait: 500 });
      last = r;
      if (r.chunks.length) { seq = r.seq; text += r.chunks.map((c) => c.text).join(''); }
      if (r.idle && Date.now() - t0 > 300) break;
    }
    return { text, seq, r: last };
  };
  try {
    let d = await drain(0, 1500);
    assert.equal(d.text, '', 'no banner, no prompt in the output');
    T.run({ id: s.id, line: 'echo hi' });
    d = await drain(d.seq);
    assert.equal(d.text, 'hi\n');
    assert.equal(d.r.idle, true);
    assert.equal(d.r.rc, 0);
    assert.equal(path.resolve(d.r.cwd).toLowerCase(), path.resolve(tmp).toLowerCase());
    T.run({ id: s.id, line: win ? 'dir nonexist_zz >nul' : 'ls nonexist_zz 2>/dev/null' });
    d = await drain(d.seq);
    assert.ok(d.r.rc > 0, `failure reported: rc=${d.r.rc}`);
    T.run({ id: s.id, line: 'cd ..' });
    d = await drain(d.seq);
    assert.equal(d.r.rc, 0);
    assert.equal(path.resolve(d.r.cwd).toLowerCase(), path.resolve(tmp, '..').toLowerCase());
    // a lone CR is not stripped; CR LF becomes LF; the exit code of a program comes through
    T.run({ id: s.id, line: `node -e "process.stdout.write('a' + String.fromCharCode(13) + 'b' + String.fromCharCode(13, 10) + 'c' + String.fromCharCode(10)); process.exit(4)"` });
    d = await drain(d.seq);
    assert.equal(d.text, 'a' + String.fromCharCode(13) + 'b' + String.fromCharCode(10) + 'c' + String.fromCharCode(10));
    assert.equal(d.r.rc, 4);
    // input to a running program: the line ending follows the option (bytes shown by the program)
    T.run({ id: s.id, line: `node -e "process.stdin.once('data', (b) => { process.stdout.write(JSON.stringify(b.toString()) + String.fromCharCode(10)); process.exit(0); })"` });
    await new Promise((r) => setTimeout(r, 700));
    T.run({ id: s.id, line: 'typed', eol: 'lf' });
    d = await drain(d.seq);
    assert.equal(d.text.trim(), JSON.stringify('typed' + String.fromCharCode(10)));
    T.run({ id: s.id, line: `node -e "process.stdin.once('data', (b) => { process.stdout.write(JSON.stringify(b.toString()) + String.fromCharCode(10)); process.exit(0); })"` });
    await new Promise((r) => setTimeout(r, 700));
    T.run({ id: s.id, line: 'typed', eol: 'crlf' });
    d = await drain(d.seq);
    assert.equal(d.text.trim(), JSON.stringify('typed' + String.fromCharCode(13, 10)));
    // escape sequences: colours (SGR) stay, cursor / OSC sequences go — even when one arrives in two chunks
    T.run({ id: s.id, line: `node -e "const w = (t) => process.stdout.write(t); const E = String.fromCharCode(27); w(E + '[?25'); setTimeout(() => { w('l' + E + ']0;title' + String.fromCharCode(7) + E + '[3'); setTimeout(() => w('2mok' + E + '[0m' + String.fromCharCode(10)), 120); }, 120)"` });
    d = await drain(d.seq);
    assert.equal(d.text, String.fromCharCode(27) + '[32mok' + String.fromCharCode(27) + '[0m' + String.fromCharCode(10));
    // the colour environment: programs are told to colour although stdout is a pipe
    T.run({ id: s.id, line: 'node -e "process.stdout.write(process.env.FORCE_COLOR + process.env.CLICOLOR_FORCE + String(process.env.LANG) + String.fromCharCode(10))"' });
    d = await drain(d.seq);
    assert.match(d.text.trim(), /^11.*utf-?8$/i);
  } finally {
    T.kill({ id: s.id });
    T.shutdown();
  }
});

test('api: term.read honours the long poll (idle + wait) and term.run passes the line ending on', async () => {
  const api = createApi({ name: 'test', version: '0.0.0', configDir: path.join(tmp, 'cfg5') });
  const s = await api.call('term.create', { cwd: tmp, shell: process.platform === 'win32' ? 'cmd' : 'sh' });
  try {
    await new Promise((r) => setTimeout(r, 600));
    const t0 = Date.now();
    const r = await api.call('term.read', { id: s.id, since: 0, idle: true, wait: 400 });
    assert.ok(Date.now() - t0 >= 350, `the poll waited (${Date.now() - t0} ms)`);
    assert.equal(r.idle, true);
    const t1 = Date.now();
    const r2 = await api.call('term.read', { id: s.id, since: 0, idle: false, wait: 400 });   // the state differs from what the caller knows: answered at once
    assert.ok(Date.now() - t1 < 200);
    assert.equal(r2.idle, true);
    await api.call('term.run', { id: s.id, line: `node -e "process.stdin.once('data', (b) => { process.stdout.write(JSON.stringify(b.toString()) + String.fromCharCode(10)); process.exit(0); })"` });
    await new Promise((r) => setTimeout(r, 700));
    await api.call('term.run', { id: s.id, line: 'typed', eol: 'crlf' });
    let text = '', seq = 0;
    for (let i = 0; i < 20; i++) { const x = await api.call('term.read', { id: s.id, since: seq, idle: false, wait: 300 }); if (x.chunks.length) { seq = x.seq; text += x.chunks.map((c) => c.text).join(''); } if (x.idle) break; }
    assert.equal(text.trim(), JSON.stringify('typed' + String.fromCharCode(13, 10)));
  } finally { await api.call('term.kill', { id: s.id }); }
});
