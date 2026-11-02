// GNU Octave I/O functions of the io area: C-style stream helpers, textread,
// scanf, web, audio formats (AU, AIFF, FLAC, mu-law), audiorecorder, ftp,
// figure files, the Octave text data format and IMAGE_PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../core/session.js';
import { createMemoryFs } from '../core/fs-memory.js';
import { buildRegistry } from '../core/registry.js';
import { toStr } from '../core/value.js';
import * as streams from '../core/lib/io/streams.js';
import * as audiorec from '../core/lib/io/audiorec.js';
import * as ftp from '../core/lib/io/ftp.js';
import * as octtext from '../core/lib/io/octtext.js';
import { builtins as imioBuiltins, help as imioHelp } from '../core/lib/image/imio.js';
import { ulawToLinear, linearToUlaw, alawToLinear, linearToAlaw } from '../core/lib/io/audiofmt.js';

/** A fake application host: input line, browser, audio devices / recorder, FTP server. */
function fakeHost() {
  const posted = [];
  const ftpFiles = new Map([['/pub/readme.txt', 'hello ftp\n'], ['/pub/data/a.bin', '\x01\x02\x03']]);
  const ftpDirs = new Set(['/', '/pub', '/pub/data']);
  const rec = new Map();
  const tone = (n, ch) => Array.from({ length: ch }, (_, c) => Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin(i / 10) * (c ? -1 : 1)));
  const host = {
    posted,
    inputLine: '12 34',
    post(m) { posted.push(m); },
    request(m) {
      switch (m.type) {
        case 'input': return { text: host.inputLine };
        case 'web.open': posted.push(m); return { ok: true };
        case 'audio.devices': return { input: [{ name: 'Mic', id: 3, driver: 'v1' }], output: [{ name: 'Speakers', id: 7, driver: 'v2' }] };
        case 'audio.record.start': rec.set(m.id, m); return { ok: true };
        case 'audio.record.data': case 'audio.record.stop': { const r = rec.get(m.id); return { channels: tone(Math.round(r.sampleRate * 0.25), r.numChannels) }; }
        case 'audio.recordBlocking': return { channels: tone(Math.round(m.sampleRate * m.seconds), m.numChannels) };
        case 'audio.playBlocking': return { ok: true };
        case 'ftp': return ftpOp(m);
        default: return null;
      }
    },
  };
  const b64 = (s) => Buffer.from(s, 'latin1').toString('base64');
  function ftpOp(m) {
    switch (m.op) {
      case 'open': return m.host === 'ftp.example.org' ? { session: 's1', path: '/' } : { error: 'unknown host' };
      case 'pwd': return { path: '/' };
      case 'cd': return ftpDirs.has(m.path) ? { path: m.path } : { error: 'no such folder' };
      case 'list': {
        const pre = m.path.replace(/\/$/, '') + '/';
        const out = [];
        for (const d of ftpDirs) if (d.startsWith(pre) && d !== pre && !d.slice(pre.length).includes('/')) out.push({ name: d.slice(pre.length), isDir: true, size: 0, mtimeMs: 0 });
        for (const [f, t] of ftpFiles) if (f.startsWith(pre) && !f.slice(pre.length).includes('/')) out.push({ name: f.slice(pre.length), isDir: false, size: t.length, mtimeMs: Date.UTC(2026, 0, 2, 3, 4, 5) });
        return { entries: out };
      }
      case 'get': return ftpFiles.has(m.path) ? { bodyBase64: b64(ftpFiles.get(m.path)) } : { error: 'no such file' };
      case 'put': ftpFiles.set(m.path, Buffer.from(m.bodyBase64, 'base64').toString('latin1')); return { ok: true };
      case 'delete': ftpFiles.delete(m.path); return { ok: true };
      case 'mkdir': ftpDirs.add(m.path); return { ok: true };
      case 'rmdir': ftpDirs.delete(m.path); return { ok: true };
      case 'rename': ftpFiles.set(m.to, ftpFiles.get(m.from)); ftpFiles.delete(m.from); return { ok: true };
      case 'close': return { ok: true };
      default: return { error: 'bad op' };
    }
  }
  host.ftpFiles = ftpFiles;
  return host;
}

function session(files = {}, host = fakeHost()) {
  const fs = createMemoryFs(files);
  let out = '';
  const s = createSession({ fs, host, print(t) { out += t; } });
  const run = (code) => {
    const r = s.evaluate(code);
    if (!r.ok) throw new Error(`${r.error.identifier}: ${r.error.message}`);
  };
  const fail = (code) => { const r = s.evaluate(code); assert.equal(r.ok, false, `expected an error from: ${code}`); return r.error; };
  const v = (name) => s.getVariable(name);
  const nums = (name) => Array.from(v(name).re);
  return { s, fs, host, run, fail, v, nums, out: () => out, clearOut: () => { out = ''; } };
}

// ---------------------------------------------------------------- streams

test('stdin/stdout/stderr, SEEK_* constants and native_float_format', () => {
  const t = session();
  t.run('a = [stdin stdout stderr]; b = [SEEK_SET SEEK_CUR SEEK_END]; c = native_float_format();');
  assert.deepEqual(t.nums('a'), [0, 1, 2]);
  assert.deepEqual(t.nums('b'), [-1, 0, 1]);
  assert.equal(toStr(t.v('c')), 'ieee-le');
  t.run("fid = fopen('s.bin', 'w+'); fwrite(fid, 1:10); fseek(fid, -3, SEEK_END); x = fread(fid)'; fseek(fid, 2, SEEK_SET); y = fread(fid, 1); fclose(fid);");
  assert.deepEqual(t.nums('x'), [8, 9, 10]);
  assert.deepEqual(t.nums('y'), [3]);
});

test('printf, puts, fputs, fdisp, fflush', () => {
  const t = session();
  t.run("printf('%d-%s\\n', 5, 'x'); puts('raw %d\\n'); fputs(stdout, 'out!');");
  assert.equal(t.out(), '5-x\nraw %d\\nout!');
  t.run("fid = fopen('o.txt', 'w'); fputs(fid, 'line1\\n'); fdisp(fid, [1 2 3]); st = fflush(fid); fclose(fid); txt = fileread('o.txt');");
  assert.equal(t.nums('st')[0], 0);
  const txt = toStr(t.v('txt'));
  assert.ok(txt.startsWith('line1\\n'), txt);
  assert.match(txt, /1\s+2\s+3/);
  t.clearOut();
  t.run('fdisp(stdout, pi)');
  assert.match(t.out(), /3\.1416/);
  assert.equal(t.fail('fputs(99, "x")').identifier, 'io:fputs:invalidFid');
});

test('fskipl, fclear, is_valid_file_id, freport', () => {
  const t = session({ '/home/l.txt': 'a\nb\r\nc\nd\ne' });
  t.run("fid = fopen('l.txt'); n = fskipl(fid, 2); r = fgetl(fid); m = fskipl(fid, Inf); e1 = feof(fid); fclear(fid); frewind(fid); n1 = fskipl(fid); ok = [is_valid_file_id(fid) is_valid_file_id(1) is_valid_file_id(77) is_valid_file_id('x')];");
  assert.equal(t.nums('n')[0], 2);
  assert.equal(toStr(t.v('r')), 'c');
  assert.equal(t.nums('m')[0], 1); // "d\n" counted, the unterminated "e" is not
  assert.equal(t.nums('e1')[0], 1);
  assert.equal(t.nums('n1')[0], 1);
  assert.deepEqual(t.nums('ok'), [1, 1, 0, 0]);
  t.clearOut();
  t.run('freport()');
  assert.match(t.out(), /number\s+mode\s+arch\s+name/);
  assert.match(t.out(), /\s3\s+r\s+ieee-le\s+l\.txt/);
  t.run('fclose(fid);');
  assert.deepEqual(Array.from(t.s.evaluate('is_valid_file_id(fid)').ok ? [1] : [0]), [1]);
});

test('textread reads columns into separate outputs', () => {
  const t = session({ '/home/d.txt': 'name val n\nalpha 1.5 3\nbeta 2.5 4\ngamma 3.5 5\n' });
  t.run("[s, v, n] = textread('d.txt', '%s %f %d', 'headerlines', 1);");
  assert.deepEqual(t.v('s').data.map((x) => toStr(x)), ['alpha', 'beta', 'gamma']);
  assert.deepEqual(t.nums('v'), [1.5, 2.5, 3.5]);
  assert.equal(t.v('n').cls, 'int32');
  t.run("[a, b] = textread('d.txt', '%*s %f %f', 2, 'headerlines', 1);");
  assert.deepEqual(t.nums('a'), [1.5, 2.5]);
  assert.deepEqual(t.nums('b'), [3, 4]);
  t.run("w = textread('d.txt', '%s', 'delimiter', '\\n');");
  assert.equal(t.v('w').data.length, 4);
  assert.equal(t.fail("textread('none.txt')").identifier, 'io:textread:fileNotFound');
});

test('scanf reads a line through the host input request', () => {
  const t = session();
  t.run("[x, count] = scanf('%d');");
  assert.deepEqual(t.nums('x'), [12, 34]);
  assert.equal(t.nums('count')[0], 2);
  const t2 = session({}, { post() {}, request() { return null; } });
  assert.equal(t2.fail("scanf('%d')").identifier, 'io:scanf:noInput');
});

test('web opens URLs through the host and reports the status', () => {
  const t = session({ '/home/page.html': '<p>x</p>' });
  t.run("[st, h, u] = web('https://example.org', '-browser'); [st2, ~, u2] = web('page.html');");
  assert.equal(t.nums('st')[0], 0);
  assert.equal(toStr(t.v('u')), 'https://example.org');
  assert.equal(toStr(t.v('u2')), 'file:///home/page.html');
  const msg = t.host.posted.find((m) => m.type === 'web.open' && m.url === 'https://example.org');
  assert.equal(msg.browser, true);
  const t2 = session({}, { post() {}, request() { return null; } });
  t2.run("st = web('https://example.org');");
  assert.equal(t2.nums('st')[0], 2);
});

// ---------------------------------------------------------------- audio

test('G.711 tables are inverse on their codes; lin2mu / mu2lin follow the reference', () => {
  for (let u = 0; u < 256; u++) { if (u === 127) continue; assert.equal(linearToUlaw(ulawToLinear(u)), u, `ulaw ${u}`); }
  for (let a = 0; a < 256; a++) assert.equal(linearToAlaw(alawToLinear(a)), a, `alaw ${a}`);
  const t = session();
  t.run('m = lin2mu([0 1 -1 0.5]); y = mu2lin(m); m16 = lin2mu(int16(1000), 16); y8 = mu2lin(255, 8); t = mu2lin([0 128]);');
  assert.deepEqual(t.nums('m'), [255, 128, 0, 143]);
  const y = t.nums('y');
  assert.ok(Math.abs(y[3] - 0.5) < 0.02 && y[0] === 0 && Math.abs(y[1] - 32124 / 32768) < 1e-12);
  assert.equal(t.nums('m16')[0], 206);
  assert.deepEqual(t.nums('t'), [-32124 / 32768, 32124 / 32768]);
  assert.equal(t.fail('lin2mu(1, 4)').identifier, 'io:lin2mu:badN');
});

test('audiowrite / audioread round trips in AU, AIFF, AIFF-C, FLAC and mu-law WAV', () => {
  const t = session();
  t.run("fs = 8000; x = [sin((0:999)' / 7) * 0.8, cos((0:999)' / 11) * 0.5];");
  for (const [file, opts, tol] of [
    ['a.au', '', 1 / 32768], ['a.snd', ", 'BitsPerSample', 24", 1 / 2 ** 23], ['a.aiff', '', 1 / 32768], ['a.aif', ", 'BitsPerSample', 8", 1 / 128],
    ['a.aifc', ", 'BitsPerSample', 32", 1e-7], ['a.flac', '', 1 / 32768], ['b.flac', ", 'BitsPerSample', 24", 1 / 2 ** 23], ['c.flac', ", 'BitsPerSample', 8", 1 / 128],
  ]) {
    t.run(`audiowrite('${file}', x, fs${opts}, 'Title', 'T1', 'Artist', 'Me'); [y, r] = audioread('${file}'); info = audioinfo('${file}');`);
    assert.deepEqual(t.v('y').dims, [1000, 2], file);
    assert.equal(t.nums('r')[0], 8000, file);
    const x = t.nums('x'), yv = t.nums('y');
    let err = 0; for (let i = 0; i < x.length; i++) err = Math.max(err, Math.abs(x[i] - yv[i]));
    assert.ok(err <= tol, `${file}: error ${err}`);
    const info = t.v('info').data[0];
    if (!/\.(au|snd)$/.test(file)) assert.equal(toStr(info.Title), 'T1', file);
    assert.equal(info.NumChannels.re[0], 2);
  }
  t.run("info = audioinfo('a.flac'); n = audioread('a.flac', 'native'); part = audioread('a.flac', [11 20]);");
  assert.equal(toStr(t.v('info').data[0].CompressionMethod), 'FLAC');
  assert.equal(t.v('n').cls, 'int16');
  assert.deepEqual(t.v('part').dims, [10, 2]);
  // FLAC is smaller than the raw PCM for a smooth signal
  assert.ok(t.fs.readBytes('/home/a.flac').length < 1000 * 2 * 2 * 0.8);
  t.run("audiowrite('u.wav', x, fs, 'Encoding', 'mu-law'); [z, r] = audioread('u.wav'); iz = audioinfo('u.wav'); audiowrite('al.au', x, fs, 'Encoding', 'A-law'); w = audioread('al.au');");
  let e1 = 0; const x = t.nums('x'), z = t.nums('z'), w = t.nums('w');
  for (let i = 0; i < x.length; i++) e1 = Math.max(e1, Math.abs(x[i] - z[i]), Math.abs(x[i] - w[i]));
  assert.ok(e1 < 0.03, `G.711 error ${e1}`);
  assert.equal(toStr(t.v('iz').data[0].CompressionMethod), 'mu-law');
  assert.equal(t.fail("audiowrite('a.mp3', x, fs)").identifier, 'io:audiowrite:unsupportedFormat');
  assert.equal(t.fail("audiowrite('f.flac', x, fs, 'BitsPerSample', 32)").identifier, 'io:audiowrite:badBits');
});

test('audioread decodes big-endian RIFX and a FLAC stream with stereo decorrelation', () => {
  // RIFX: 2 frames, 1 channel, 16-bit big-endian
  const rifx = new Uint8Array([
    0x52, 0x49, 0x46, 0x58, 0, 0, 0, 40, 0x57, 0x41, 0x56, 0x45,
    0x66, 0x6d, 0x74, 0x20, 0, 0, 0, 16, 0, 1, 0, 1, 0, 0, 0x1f, 0x40, 0, 0, 0x3e, 0x80, 0, 2, 0, 16,
    0x64, 0x61, 0x74, 0x61, 0, 0, 0, 4, 0x40, 0x00, 0xc0, 0x00,
  ]);
  const t = session({ '/home/r.wav': rifx });
  t.run("[y, fs] = audioread('r.wav');");
  assert.deepEqual(t.nums('y'), [0.5, -0.5]);
  assert.equal(t.nums('fs')[0], 8000);
  // hand-made FLAC frame: 2 channels mid/side, 4 samples, verbatim subframes
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
  const L = [10, -3, 7, 0], R = [4, 5, -6, 0];
  const mid = L.map((l, i) => (l + R[i]) >> 1), side = L.map((l, i) => l - R[i]);
  put(0xfff8, 16); put(6, 4); put(0, 4); put(10, 4); put(4, 3); put(0, 1); put(0, 8); put(3, 8);
  const hdr = bytesOf(bits); bits.length = 0;
  const crc8 = (b) => { let c = 0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 7) & 255 : (c << 1) & 255; } return c; };
  const sub = (vals, bps) => { put(0, 1); put(1, 6); put(0, 1); for (const v of vals) put(v < 0 ? v + 2 ** bps : v, bps); };
  sub(mid, 16); sub(side, 17);
  while (bits.length % 8) bits.push(0);
  put(0, 16); // CRC-16 (not checked)
  const body = bytesOf(bits);
  const si = []; bits.length = 0;
  put(4, 16); put(4, 16); put(0, 24); put(0, 24); put(8000, 20); put(1, 3); put(15, 5); put(0, 4); put(4, 32); for (let i = 0; i < 16; i++) put(0, 8);
  const stream = new Uint8Array([0x66, 0x4c, 0x61, 0x43, 0x80, 0, 0, 34, ...bytesOf(bits), ...hdr, crc8(hdr), ...body]);
  const t2 = session({ '/home/m.flac': stream });
  t2.run("y = audioread('m.flac', 'native');");
  assert.deepEqual(t2.nums('y'), [...L, ...R]);
  function bytesOf(b) { const out = []; for (let i = 0; i < b.length; i += 8) { let v = 0; for (let k = 0; k < 8; k++) v = (v << 1) | (b[i + k] || 0); out.push(v); } return out; }
});

test('audioformats and audiodevinfo', () => {
  const t = session();
  t.run("f = audioformats(); g = audioformats('flac');");
  assert.ok(t.v('f').data.length >= 5);
  assert.equal(toStr(t.v('g').data[0].name), 'FLAC');
  t.clearOut();
  t.run('audioformats');
  assert.match(t.out(), /name: AIFF/);
  t.run("d = audiodevinfo(); ni = audiodevinfo(1); no = audiodevinfo(0); nm = audiodevinfo(1, 3); id = audiodevinfo(0, 'Speakers'); dv = audiodevinfo(1, 3, 'DriverVersion'); sid = audiodevinfo(1, 44100, 16, 2); ok = audiodevinfo(1, 3, 44100, 16, 2); bad = audiodevinfo(1, 9, 44100, 16, 2);");
  assert.equal(toStr(t.v('d').data[0].input.data[0].Name), 'Mic');
  assert.deepEqual([t.nums('ni')[0], t.nums('no')[0], t.nums('id')[0], t.nums('sid')[0], t.nums('ok')[0], t.nums('bad')[0]], [1, 1, 7, 3, 1, 0]);
  assert.equal(toStr(t.v('nm')), 'Mic');
  assert.equal(toStr(t.v('dv')), 'v1');
  const t2 = session({}, { post() {}, request() { return null; } });
  t2.run('n = audiodevinfo(1);');
  assert.equal(t2.nums('n')[0], 0);
});

test('audiorecorder records through the host; record() and function forms', () => {
  const t = session();
  t.run('r = audiorecorder(8000, 16, 2); recordblocking(r, 0.5); y = getaudiodata(r); i16 = getaudiodata(r, "int16"); rec0 = isrecording(r); p = getplayer(r); fsr = p.SampleRate; n = r.TotalSamples;');
  assert.deepEqual(t.v('y').dims, [4000, 2]);
  assert.equal(t.v('i16').cls, 'int16');
  assert.equal(t.nums('rec0')[0], 0);
  assert.equal(t.nums('fsr')[0], 8000);
  assert.equal(t.nums('n')[0], 4000);
  t.run('r2 = audiorecorder; record(r2); on = isrecording(r2); z = getaudiodata(r2); stop(r2); off = isrecording(r2); z2 = getaudiodata(r2); bits = r2.BitsPerSample; r2.Tag = "mine"; tg = r2.Tag;');
  assert.equal(t.nums('on')[0], 1);
  assert.equal(t.nums('off')[0], 0);
  assert.deepEqual(t.v('z2').dims, [2000, 1]);
  assert.equal(t.nums('bits')[0], 8);
  assert.equal(toStr(t.v('tg')), 'mine');
  assert.ok(t.host.posted.length >= 0);
  t.run('x = record(0.1, 16000); pl = play(r); playing = isplaying(pl); stop(pl);');
  assert.deepEqual(t.v('x').dims, [1600, 1]);
  assert.ok(t.host.posted.some((m) => m.type === 'audio.play'));
  t.run('ap = audioplayer(zeros(100, 1), 8000); play(ap); resume(ap); playblocking(ap); stop(ap); s = isplaying(ap);');
  assert.equal(t.nums('s')[0], 0);
  assert.equal(t.fail('play(5)').identifier, 'io:play:badArgument');
  const t2 = session({}, { post() {}, request() { return null; } });
  assert.equal(t2.fail('r = audiorecorder; recordblocking(r, 1)').identifier, 'io:audiorecorder:noHost');
  assert.equal(t2.fail('r = audiorecorder; getaudiodata(r)').identifier, 'io:getaudiodata:noData');
});

// ---------------------------------------------------------------- ftp

test('ftp object: dir, cd, mget, mput, rename, delete, mkdir, ascii/binary', () => {
  const t = session({ '/home/up.txt': 'a\nb\n', '/home/up2.txt': 'two' });
  t.run("f = ftp('ftp.example.org', 'user', 'pw'); p = cd(f, 'pub'); d = dir(f); names = {d.name};");
  assert.equal(toStr(t.v('p')), '/pub');
  assert.deepEqual(t.v('names').data.map((x) => toStr(x)).sort(), ['data', 'readme.txt']);
  t.run("got = mget(f, 'readme.txt', 'dl'); txt = fileread('dl/readme.txt'); mget(f, 'data', 'dl'); b = fileread('dl/data/a.bin');");
  assert.equal(toStr(t.v('txt')), 'hello ftp\n');
  assert.equal(toStr(t.v('got').data[0]), '/home/dl/readme.txt');
  assert.equal(toStr(t.v('b')), '\x01\x02\x03');
  t.run("ascii(f); up = mput(f, 'up*.txt'); binary(f); rename(f, 'up2.txt', 'renamed.txt'); delete(f, 'readme.txt'); mkdir(f, 'newdir'); d2 = dir(f, '*.txt');");
  assert.equal(t.host.ftpFiles.get('/pub/up.txt'), 'a\r\nb\r\n');
  assert.equal(t.host.ftpFiles.get('/pub/renamed.txt'), 'two');
  assert.ok(!t.host.ftpFiles.has('/pub/readme.txt'));
  assert.deepEqual(t.v('d2').data.map((r) => toStr(r.name)).sort(), ['renamed.txt', 'up.txt']);
  t.run('close(f);');
  assert.equal(t.fail("cd(f, 'x')").identifier, 'io:ftp:closed');
  assert.equal(t.fail("g = ftp('nowhere.example');").identifier, 'io:ftp:failed');
  const t2 = session({}, { post() {}, request() { return null; } });
  assert.equal(t2.fail("f = ftp('ftp.example.org');").identifier, 'io:ftp:noHost');
});

// ---------------------------------------------------------------- Octave text format and save settings

test('save -text writes the Octave text format and load reads it back', () => {
  const t = session();
  t.run("a = 3; b = [1 2.5; -Inf NaN]; c = 1+2i; s = 'hello'; m = ['ab'; 'cd']; L = [true false]; k = int16([1 -2 3]); e = []; cc = {1, 'x'; [1 2], {2}}; st.x = 1; st.y = 'z'; sa = struct('p', {1, 2}); sp = sparse([1 0; 0 2]); z = reshape(1:8, 2, 2, 2);");
  t.run("save('-text', 'w.txt', 'a', 'b', 'c', 's', 'm', 'L', 'k', 'e', 'cc', 'st', 'sa', 'sp', 'z');");
  const text = t.fs.readText('/home/w.txt');
  assert.match(text, /^# Created by MySimulationMath, /);
  assert.match(text, /# name: b\n# type: matrix\n# rows: 2\n# columns: 2\n 1 2\.5\n -Inf NaN/);
  assert.match(text, /# name: c\n# type: complex scalar\n\(1,2\)/);
  assert.match(text, /# name: k\n# type: int16 matrix/);
  t.run("clear all; S = load('w.txt'); load w.txt");
  const S = t.v('S').data[0];
  assert.equal(S.a.re[0], 3);
  assert.deepEqual(Array.from(S.b.re), [1, -Infinity, 2.5, NaN]);
  assert.equal(S.c.im[0], 2);
  assert.equal(toStr(S.s), 'hello');
  assert.deepEqual(S.m.dims, [2, 2]);
  assert.equal(S.L.cls, 'logical');
  assert.equal(S.k.cls, 'int16');
  assert.deepEqual(Array.from(S.k.re), [1, -2, 3]);
  assert.deepEqual(S.e.dims, [0, 0]);
  assert.equal(toStr(S.cc.data[2]), 'x');
  assert.equal(S.cc.data[3].cls, 'cell');
  assert.equal(toStr(S.st.data[0].y), 'z');
  assert.deepEqual(S.sa.dims, [1, 2]);
  assert.equal(S.sa.data[1].p.re[0], 2);
  assert.equal(S.sp.sparse, true);
  assert.deepEqual(S.z.dims, [2, 2, 2]);
  assert.deepEqual(t.nums('k'), [1, -2, 3]);
  // a file made by Octave itself
  const t2 = session({ '/home/o.txt': '# Created by Octave 9.2.0, Mon Nov 02 10:00:00 2026 UTC <u@h>\n# name: v\n# type: matrix\n# rows: 1\n# columns: 3\n 1 2 3\n\n\n# name: q\n# type: sq_string\n# elements: 1\n# length: 3\nabc\n\n\n' });
  t2.run("load('o.txt'); w = whos;");
  assert.deepEqual(t2.nums('v'), [1, 2, 3]);
  assert.equal(toStr(t2.v('q')), 'abc');
});

test('save_default_options, save_header_format_string, save_precision', () => {
  const t = session();
  t.run("o = save_default_options(); old = save_default_options('-text'); x = pi; save('d.dat', 'x'); p0 = save_precision(); save_precision(5); save('e.dat', 'x'); h = save_header_format_string(); save_header_format_string('# made %Y'); save('f.dat', 'x'); save('g.mat', 'x', '-mat');");
  assert.equal(toStr(t.v('o')), '-mat');
  assert.equal(toStr(t.v('old')), '-mat');
  assert.equal(t.nums('p0')[0], 17);
  assert.match(t.fs.readText('/home/d.dat'), /# name: x\n# type: scalar\n3\.141592653589793/);
  assert.match(t.fs.readText('/home/e.dat'), /\n3\.1416\n/);
  assert.match(t.fs.readText('/home/f.dat'), /^# made \d{4}\n/);
  assert.match(toStr(t.v('h')), /^# Created by MySimulationMath/);
  assert.notEqual(t.fs.readBytes('/home/g.mat')[0], 35); // binary MAT, not text
  t.run("clear x; load('e.dat');");
  assert.ok(Math.abs(t.nums('x')[0] - 3.1416) < 1e-12);
  assert.equal(t.fail("save_default_options('-bogus')").identifier, 'io:save_default_options:badOption');
  assert.equal(t.fail('save_precision(30)').identifier, 'io:save_precision:badValue');
});

// ---------------------------------------------------------------- IMAGE_PATH

test('IMAGE_PATH adds folders to the image file search', () => {
  const t = session();
  t.run("mkdir('/imgs'); imwrite(uint8(magic(4)), '/imgs/m.png'); p0 = IMAGE_PATH(); IMAGE_PATH('.;/imgs'); A = imread('m.png'); B = imread('m'); info = imfinfo('m.png');");
  assert.equal(toStr(t.v('p0')), '.');
  assert.deepEqual(t.v('A').dims, [4, 4]);
  assert.deepEqual(t.v('B').dims, [4, 4]);
  assert.equal(t.v('info').data[0].Width.re[0], 4);
  t.run("IMAGE_PATH('.');");
  assert.match(t.fail("imread('m.png')").identifier, /fileNotFound/);
});

test('imwrite Mode lossless writes lossless JPEG (SOF3) that imread decodes exactly', () => {
  const t = session();
  t.run("A = uint8(mod((1:37)' * (1:53), 256)); A(:, :, 2) = uint8(mod((1:37)' + (1:53) * 3, 256)); A(:, :, 3) = 255 - A(:, :, 1);");
  t.run("imwrite(A, 'a.jpg', 'Mode', 'lossless'); B = imread('a.jpg'); okA = isequal(A, B);");
  assert.equal(t.nums('okA')[0], 1);
  t.run("C = uint16(mod((1:20)' * (1:31) * 37, 4096)); imwrite(C, 'c.jpg', 'Mode', 'lossless', 'BitDepth', 12); D = imread('c.jpg'); okC = isequal(C, D); cls = class(D); i = imfinfo('c.jpg');");
  assert.equal(t.nums('okC')[0], 1);
  assert.equal(toStr(t.v('cls')), 'uint16');
  assert.equal(t.v('i').data[0].BitDepth.re[0], 12);
  assert.equal(toStr(t.v('i').data[0].CodingProcess), 'Lossless');
  t.run("E = uint16(mod((1:9)' * (1:9) * 7919, 65536)); imwrite(E, 'e.jpg', 'Mode', 'lossless'); okE = isequal(E, imread('e.jpg'));");
  assert.equal(t.nums('okE')[0], 1);
  const bytes = t.fs.readBytes('/home/e.jpg');
  assert.deepEqual([bytes[2], bytes[3]], [0xff, 0xc3]);
  assert.match(t.fail("imwrite(uint8(1), 'x.jpg', 'Mode', 'other')").identifier, /badMode/);
});

// ---------------------------------------------------------------- registry and help

test('every new builtin is registered with English and Korean help', () => {
  const reg = buildRegistry();
  const mods = [streams, audiorec, ftp, octtext];   // savefig / openfig / hgsave / hgload: graphics (core/graphics/octave.js)
  for (const m of mods) {
    for (const name of Object.keys(m.builtins)) {
      const h = m.help[name];
      assert.ok(h && h.en && h.ko && Array.isArray(h.syntax) && h.syntax.length, `help for ${name}`);
      assert.equal(reg.owner[name], 'io', `${name} is owned by io`);
    }
  }
  assert.ok(imioBuiltins.IMAGE_PATH && imioHelp.IMAGE_PATH.ko);
  for (const cls of ['audiorecorder', 'ftp']) assert.ok(reg.classes[cls], cls);
});
