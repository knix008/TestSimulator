// The Tauri shell does not reimplement the file manager. It spawns server/server.js
// (CC_HOST_NAME=tauri) and the page calls that API. These cases boot that same
// process and walk the features the panels, archives, search, session and terminal use.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = `tauri-test-${process.pid}`;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function call(origin, name, args = {}) {
  const body = JSON.stringify(args);
  const url = new URL(`/api/${encodeURIComponent(name)}`, origin);
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, 'content-length': Buffer.byteLength(body) },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let json;
        try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (err) { reject(err); return; }
        if (!json.ok) {
          const err = new Error(json.error && json.error.message ? json.error.message : `API ${name} failed`);
          err.code = json.error && json.error.code;
          reject(err);
          return;
        }
        resolve(json.data);
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

function request(origin, method, pathname, { headers = {}, body } = {}) {
  const url = new URL(pathname, origin);
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers: { authorization: `Bearer ${TOKEN}`, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    if (body) req.end(body);
    else req.end();
  });
}

async function waitJob(origin, id, ms = 20000) {
  const t0 = Date.now();
  for (;;) {
    const snap = await call(origin, 'jobs.get', { id });
    if (snap && snap.status && snap.status !== 'running') return snap;
    if (Date.now() - t0 > ms) throw new Error(`job ${id} still running`);
    await new Promise((r) => setTimeout(r, 40));
  }
}

let origin = '';
let child = null;
let configDir = '';
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-tauri-'));

before(async () => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-tauri-cfg-'));
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [
    path.join(root, 'server', 'server.js'),
    '--port', String(port),
    '--host', '127.0.0.1',
    '--token', TOKEN,
    '--no-open',
  ], {
    cwd: root,
    env: { ...process.env, CC_HOST_NAME: 'tauri', CC_CONFIG_DIR: configDir, CC_NO_OPEN: '1', CC_SMOKE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (c) => { log += c.toString(); });
  child.stderr.on('data', (c) => { log += c.toString(); });
  const t0 = Date.now();
  for (;;) {
    if (child.exitCode != null) throw new Error(`core exited\n${log}`);
    try { await call(origin, 'app.info'); break; } catch { /* not up yet */ }
    if (Date.now() - t0 > 15000) throw new Error(`core did not start\n${log}`);
    await new Promise((r) => setTimeout(r, 80));
  }
});

after(async () => {
  try { if (origin) await call(origin, 'app.shutdown'); } catch { /* already gone */ }
  if (child && child.exitCode == null) {
    child.kill();
    await new Promise((r) => child.on('exit', r));
  }
  fs.rmSync(scratch, { recursive: true, force: true });
  if (configDir) fs.rmSync(configDir, { recursive: true, force: true });
});

describe('Tauri core host', { concurrency: false }, () => {
  test('the shell contract spawns this server with the tauri host name', () => {
    const rust = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'main.rs'), 'utf8');
    const ui = fs.readFileSync(path.join(root, 'src', 'lib', 'backend.js'), 'utf8');
    assert.match(rust, /fn host_config/);
    assert.match(rust, /fn bus_post/);
    assert.match(rust, /CC_HOST_NAME", "tauri"/);
    assert.match(rust, /"--no-open"/);
    assert.match(rust, /server\.js/);
    assert.match(ui, /invoke\('host_config'\)/);
    assert.match(ui, /invoke\('bus_post'/);
    assert.match(ui, /isTauri/);
  });

  test('app.info identifies the tauri desktop host and its capabilities', async () => {
    const info = await call(origin, 'app.info');
    assert.equal(info.host, 'tauri');
    assert.equal(info.platform, process.platform);
    assert.equal(info.sep, path.sep);
    assert.equal(info.capabilities.open, true);
    assert.equal(info.capabilities.print, true);
    assert.equal(typeof info.home, 'string');
    if (process.platform === 'win32') assert.equal(info.capabilities.trash, true);
  });

  test('list, create, write, read, rename, rename-many, copy, delete', async () => {
    const dir = path.join(scratch, 'panel');
    fs.mkdirSync(dir);
    const made = await call(origin, 'fs.mkdir', { dir, name: '폴더' });
    assert.equal(path.basename(made.path), '폴더');
    const file = await call(origin, 'fs.createFile', { dir, name: 'note.txt' });
    await call(origin, 'fs.writeText', { path: file.path, text: '안녕하세요\n' });
    const read = await call(origin, 'fs.readFile', { path: file.path });
    assert.equal(read.kind, 'text');
    assert.match(read.text, /안녕하세요/);
    const renamed = await call(origin, 'fs.rename', { path: file.path, newName: 'renamed.txt' });
    assert.equal(path.basename(renamed.path), 'renamed.txt');
    const second = await call(origin, 'fs.createFile', { dir, name: 'b.txt' });
    const swapped = await call(origin, 'fs.renameMany', { items: [{ path: renamed.path, newName: 'b.txt' }, { path: second.path, newName: 'renamed.txt' }] });
    assert.equal(swapped.renamed.length, 2);
    const listed = await call(origin, 'fs.list', { path: dir, showHidden: false });
    assert.ok(listed.entries.some((e) => e.name === '폴더' && e.isDir));
    assert.ok(listed.entries.some((e) => e.name === 'b.txt' && !e.isDir));
    const dest = path.join(scratch, 'other');
    fs.mkdirSync(dest);
    const copy = await call(origin, 'ops.transfer', { sources: [path.join(dir, 'b.txt')], dest, move: false });
    const done = await waitJob(origin, copy.id);
    assert.equal(done.status, 'done');
    assert.ok(fs.existsSync(path.join(dest, 'b.txt')));
    const info = await call(origin, 'fs.info', { path: path.join(dest, 'b.txt') });
    assert.equal(info.isDir, false);
    const hash = await call(origin, 'fs.hash', { path: path.join(dest, 'b.txt') });
    assert.match(hash.md5, /^[0-9a-f]{32}$/);
    assert.match(hash.sha256, /^[0-9a-f]{64}$/);
    const del = await call(origin, 'ops.delete', { paths: [path.join(dest, 'b.txt')] });
    const deleted = await waitJob(origin, del.id);
    assert.equal(deleted.status, 'done');
    assert.equal(fs.existsSync(path.join(dest, 'b.txt')), false);
  });

  test('zip create, describe and extract round-trip', async () => {
    const src = path.join(scratch, 'pack');
    fs.mkdirSync(path.join(src, '안'), { recursive: true });
    fs.writeFileSync(path.join(src, '안', 'a.txt'), 'zip-body');
    const created = await call(origin, 'archive.create', { sources: [src], destBase: path.join(scratch, 'bundle'), format: 'zip', split: false });
    const snap = await waitJob(origin, created.id);
    assert.equal(snap.status, 'done', snap.error || '');
    const archivePath = snap.result.archivePath;
    const described = await call(origin, 'archive.describe', { path: archivePath });
    assert.equal(described.isArchive, true);
    const formats = await call(origin, 'archive.formats');
    assert.ok(formats.formats.includes('zip'));
    const destDir = path.join(scratch, 'unpacked');
    const extracted = await call(origin, 'archive.extract', { archivePath, destDir });
    const out = await waitJob(origin, extracted.id);
    assert.equal(out.status, 'done', out.error || '');
    assert.equal(fs.readFileSync(path.join(destDir, 'pack', '안', 'a.txt'), 'utf8'), 'zip-body');
  });

  test('search finds a file by name under the folder', async () => {
    const rootDir = path.join(scratch, 'search');
    fs.mkdirSync(path.join(rootDir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'sub', 'needle-tauri.txt'), 'find me');
    const started = await call(origin, 'search.start', { root: rootDir, pattern: 'needle-tauri.txt', matchMode: 'exact' });
    const snap = await waitJob(origin, started.id);
    assert.equal(snap.status, 'done', snap.error || '');
    const list = snap.result.found || [];
    assert.ok(list.some((e) => e.name === 'needle-tauri.txt'), JSON.stringify(snap.result).slice(0, 400));
  });

  test('session save and load stay in the tauri config directory', async () => {
    await call(origin, 'session.save', { patch: { language: 'en', theme: 'daylight' } });
    const loaded = await call(origin, 'session.load');
    assert.equal(loaded.language, 'en');
    assert.equal(loaded.theme, 'daylight');
    assert.ok(fs.existsSync(path.join(configDir, 'session.json')));
  });

  test('terminal: shells, echo, idle returns, then the session can be killed', async () => {
    const shells = await call(origin, 'term.shells');
    assert.ok(shells.length >= 1);
    assert.ok(shells[0].id && shells[0].label);
    const created = await call(origin, 'term.create', { cwd: scratch });
    const mark = 'cc-tauri-ok';
    await new Promise((r) => setTimeout(r, process.platform === 'win32' ? 800 : 200));
    await call(origin, 'term.run', { id: created.id, line: `echo ${mark}` });
    const t0 = Date.now();
    let text = '';
    for (;;) {
      const read = await call(origin, 'term.read', { id: created.id, since: 0 });
      text = (read.chunks || []).map((c) => c.text).join('');
      if (text.includes(mark) && read.idle) break;
      if (Date.now() - t0 > 12000) throw new Error(`terminal timeout: ${JSON.stringify(text).slice(0, 500)}`);
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(text.includes('__CC_'), false);
    await call(origin, 'term.kill', { id: created.id });
  });

  test('media stream and download speak HTTP range and attachment', async () => {
    const wav = path.join(scratch, 'tone.wav');
    const data = Buffer.alloc(44);
    data.write('RIFF', 0);
    data.writeUInt32LE(36, 4);
    data.write('WAVEfmt ', 8);
    data.writeUInt32LE(16, 16);
    data.writeUInt16LE(1, 20);
    data.writeUInt16LE(1, 22);
    data.writeUInt32LE(8000, 24);
    data.writeUInt32LE(8000, 28);
    data.writeUInt16LE(1, 32);
    data.writeUInt16LE(8, 34);
    data.write('data', 36);
    data.writeUInt32LE(0, 40);
    fs.writeFileSync(wav, data);
    const head = await request(origin, 'HEAD', `/api/media?path=${encodeURIComponent(wav)}`);
    assert.equal(head.status, 200);
    assert.match(String(head.headers['content-type']), /audio\/wav/);
    const part = await request(origin, 'GET', `/api/media?path=${encodeURIComponent(wav)}`, { headers: { range: 'bytes=0-3' } });
    assert.equal(part.status, 206);
    assert.equal(part.body.toString('utf8'), 'RIFF');
    const dl = await request(origin, 'GET', `/api/download?path=${encodeURIComponent(wav)}`);
    assert.equal(dl.status, 200);
    assert.match(String(dl.headers['content-disposition']), /tone\.wav/);
  });

  test('upload writes a file into the panel folder', async () => {
    const dir = path.join(scratch, 'drop');
    fs.mkdirSync(dir);
    const res = await request(origin, 'POST', `/api/upload?dir=${encodeURIComponent(dir)}&rel=${encodeURIComponent('dropped.txt')}`, {
      headers: { 'content-type': 'application/octet-stream' },
      body: Buffer.from('from-outside'),
    });
    assert.equal(res.status, 200);
    const json = JSON.parse(res.body.toString('utf8'));
    assert.equal(json.ok, true);
    assert.equal(fs.readFileSync(path.join(dir, 'dropped.txt'), 'utf8'), 'from-outside');
  });

  test('trash removes the file on the windows desktop host', async () => {
    if (process.platform !== 'win32') return;
    const file = path.join(scratch, `trash-${process.pid}.txt`);
    fs.writeFileSync(file, 'bye');
    const job = await call(origin, 'ops.trash', { paths: [file] });
    const snap = await waitJob(origin, job.id);
    assert.equal(snap.status, 'done', snap.error || '');
    assert.equal(fs.existsSync(file), false);
  });

  test('every registered API method answers JSON instead of crashing the core', async () => {
    const src = fs.readFileSync(path.join(root, 'core', 'api.js'), 'utf8');
    const names = [...src.matchAll(/'([a-z]+\.[A-Za-z]+)'\s*:/g)].map((m) => m[1]);
    assert.ok(names.includes('fs.list'));
    assert.ok(names.includes('app.shutdown'));
    const skip = new Set(['app.shutdown', 'term.create', 'term.run', 'term.write', 'term.read', 'fs.open', 'fs.openWith', 'fs.print', 'clipboard.writeImage', 'search.start', 'archive.create', 'archive.extract', 'ops.transfer', 'ops.delete', 'ops.trash']);
    for (const name of names) {
      if (skip.has(name)) continue;
      const res = await request(origin, 'POST', `/api/${encodeURIComponent(name)}`, {
        headers: { 'content-type': 'application/json' },
        body: Buffer.from('{}'),
      });
      assert.equal(res.status, 200, name);
      const json = JSON.parse(res.body.toString('utf8'));
      assert.equal(typeof json.ok, 'boolean', name);
    }
  });
});
