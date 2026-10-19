// The Node core both hosts share: the API table, the session file, file
// reading / writing (atomic, BOMs) and the ZIP container.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createApi } = require('../core/api.js');
const { readZip, writeZip, crc32 } = require('../core/zip.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtm-core-'));

test('session: defaults, save, recent list', async () => {
  const dir = tmp();
  const api = createApi({ configDir: dir });
  const s = await api.call('session.get');
  assert.equal(s.language, 'ko');
  assert.equal(s.defaultLayout, 'map');
  await api.call('session.save', { theme: 'nord', tabs: [{ path: '', draft: 'x'.repeat(9 * 1024 * 1024) }] });
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'session.json'), 'utf8'));
  assert.equal(saved.theme, 'nord');
  assert.equal(saved.tabs[0].draft, '', 'an oversized draft is dropped');
  assert.equal(saved.tabs[0].draftTooLarge, true);
  for (const p of ['a', 'b', 'a']) await api.call('recent.touch', { path: p });
  assert.deepEqual((await api.call('session.get')).recent, ['a', 'b']);
  assert.deepEqual(await api.call('recent.remove', { path: 'a' }), ['b']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('files: text with BOMs, base64, data URLs, stat', async () => {
  const dir = tmp();
  const api = createApi({ configDir: dir });
  const f = path.join(dir, 'sub', 'map.tmap');
  const w = await api.call('file.writeText', { path: f, text: '{"맵":1}' });
  assert.ok(w.mtime > 0);
  assert.equal((await api.call('file.readText', { path: f })).text, '{"맵":1}');
  fs.writeFileSync(path.join(dir, 'bom.txt'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('가나', 'utf8')]));
  assert.equal((await api.call('file.readText', { path: path.join(dir, 'bom.txt') })).text, '가나');
  fs.writeFileSync(path.join(dir, 'u16.txt'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('ab', 'utf16le')]));
  assert.equal((await api.call('file.readText', { path: path.join(dir, 'u16.txt') })).text, 'ab');
  await api.call('file.writeBase64', { path: path.join(dir, 'x.png'), base64: Buffer.from('PNGDATA').toString('base64') });
  const d = await api.call('file.dataUrl', { path: path.join(dir, 'x.png') });
  assert.equal(d.dataUrl, `data:image/png;base64,${Buffer.from('PNGDATA').toString('base64')}`);
  await assert.rejects(api.call('file.dataUrl', { path: f }), /Not an image/);
  const csv = path.join(dir, 'a.csv');
  await api.call('file.writeText', { path: csv, text: 'x', bom: true });
  assert.deepEqual([...fs.readFileSync(csv)], [0xef, 0xbb, 0xbf, 0x78]);
  const list = await api.call('fs.list', { path: dir });
  assert.ok(list.entries[0].isDir, 'folders first');
  await assert.rejects(api.call('no.such'), (e) => e.code === 'ENOMETHOD');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('zip: write, read back (stored and deflated), through the API', async () => {
  const data = Buffer.from('hello hello hello hello '.repeat(50));
  const zip = writeZip([{ name: 'mimetype', data: 'application/x', store: true }, { name: 'dir/한글.txt', data }]);
  const back = readZip(zip);
  assert.deepEqual(back.map((e) => e.name), ['mimetype', 'dir/한글.txt']);
  assert.equal(back[1].data.toString(), data.toString());
  assert.ok(zip.length < data.length, 'deflated');
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const dir = tmp();
  const api = createApi({ configDir: dir });
  const p = path.join(dir, 't.xmind');
  await api.call('zip.write', { path: p, files: [{ name: 'content.json', text: '[1]' }, { name: 'p.png', base64: 'AAEC' }] });
  const r = await api.call('zip.read', { path: p });
  assert.deepEqual(r.entries, [{ name: 'content.json', text: '[1]' }, { name: 'p.png', base64: 'AAEC' }]);
  assert.throws(() => readZip(Buffer.from('not a zip at all, definitely not')), /Not a ZIP/);
  fs.rmSync(dir, { recursive: true, force: true });
});
