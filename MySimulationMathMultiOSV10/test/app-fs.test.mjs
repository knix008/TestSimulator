// File systems of the app: core/fs-node.js (CLI), the host API
// (server/fs-api.js) and the worker's src/engine/fs-http.js on top of it —
// in-process and over real HTTP with the jail and the token.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createNodeFs } from '../core/fs-node.js';
import { createFsApi } from '../server/fs-api.js';
import { createHttpFs, resolvePath, _internal } from '../src/engine/fs-http.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'msm-app-'));
const slash = (p) => p.replace(/\\/g, '/');

/** The same checks for every implementation of CONTRACT §6. */
function exercise(fsys, base) {
  fsys.mkdir(`${base}/sub/deep`);
  fsys.writeText(`${base}/a.txt`, 'hello');
  fsys.appendText(`${base}/a.txt`, ' world');
  assert.equal(fsys.readText(`${base}/a.txt`), 'hello world');
  const bytes = Uint8Array.from([0, 1, 2, 250, 255]);
  fsys.writeBytes(`${base}/b.bin`, bytes);
  assert.deepEqual(Array.from(fsys.readBytes(`${base}/b.bin`)), [0, 1, 2, 250, 255]);
  assert.equal(fsys.exists(`${base}/a.txt`), true);
  assert.equal(fsys.exists(`${base}/nope.txt`), false);
  const st = fsys.stat(`${base}/a.txt`);
  assert.equal(st.isDir, false);
  assert.equal(st.size, 11);
  assert.ok(st.mtimeMs > 0);
  assert.equal(fsys.stat(`${base}/sub`).isDir, true);
  const names = fsys.list(base).map((e) => `${e.name}${e.isDir ? '/' : ''}`);
  assert.deepEqual(names, ['a.txt', 'b.bin', 'sub/']);
  fsys.copy(`${base}/a.txt`, `${base}/sub/c.txt`);
  assert.equal(fsys.readText(`${base}/sub/c.txt`), 'hello world');
  fsys.rename(`${base}/sub/c.txt`, `${base}/sub/deep/d.txt`);
  assert.equal(fsys.exists(`${base}/sub/c.txt`), false);
  assert.equal(fsys.readText(`${base}/sub/deep/d.txt`), 'hello world');
  assert.throws(() => fsys.remove(`${base}/sub`), (e) => e.code === 'ENOTEMPTY' || e.code === 'EPERM' || e.code === 'EEXIST');
  fsys.remove(`${base}/sub`, { recursive: true });
  assert.equal(fsys.exists(`${base}/sub`), false);
  assert.throws(() => fsys.readText(`${base}/missing.txt`), (e) => e.code === 'ENOENT');
  // cwd / chdir and relative paths.
  fsys.chdir(base);
  assert.equal(fsys.cwd(), base);
  assert.equal(fsys.readText('a.txt'), 'hello world');
  assert.throws(() => fsys.chdir(`${base}/a.txt`), (e) => e.code === 'ENOTDIR');
  assert.throws(() => fsys.chdir(`${base}/none`), (e) => e.code === 'ENOENT');
  assert.equal(typeof fsys.tempDir(), 'string');
  assert.equal(typeof fsys.homeDir(), 'string');
}

test('fs-node: every call of the contract', () => {
  const dir = slash(tmp());
  try {
    const fsys = createNodeFs({ cwd: dir });
    exercise(fsys, dir);
    assert.equal(fsys.abs('x/../y.m'), `${dir}/y.m`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fs-node: system() runs in the current folder', () => {
  const dir = slash(tmp());
  try {
    const fsys = createNodeFs({ cwd: dir });
    const r = fsys.system('echo msm-ok');
    assert.equal(r.status, 0);
    assert.match(r.output, /msm-ok/);
    const off = createNodeFs({ cwd: dir, allowSystem: false });
    assert.throws(() => off.system('echo x'), (e) => e.code === 'ENOSYS');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fs-http: resolvePath keeps drives and the root', () => {
  assert.equal(resolvePath('/', 'a/b'), '/a/b');
  assert.equal(resolvePath('/x/y', '../z'), '/x/z');
  assert.equal(resolvePath('/x', '/abs/../q'), '/q');
  assert.equal(resolvePath('C:/work', 'data\\v.csv'), 'C:/work/data/v.csv');
  assert.equal(resolvePath('C:/work', '../../..'), 'C:/');
  assert.equal(resolvePath('/x', 'd:/Other'), 'D:/Other');
});

test('fs-http: base64 helpers are exact for every byte value', () => {
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  assert.deepEqual(Array.from(_internal.b64ToBytes(_internal.bytesToB64(all))), Array.from(all));
  assert.equal(_internal.bytesToB64(new Uint8Array(0)), '');
});

test('fs-http over the host API in-process (jailed web root)', () => {
  const root = tmp();
  const cfg = tmp();
  try {
    const api = createFsApi({ root, jail: true, configDir: cfg });
    const transport = (name, args) => {
      try { return api.call(name, args); } catch (e) { throw Object.assign(new Error(e.message), { code: e.code }); }
    };
    const fsys = createHttpFs({ transport, cwd: '/' });
    exercise(fsys, '/work');
    // The jail: ".." never leaves the root.
    fsys.writeText('/../../escape.txt', 'x');
    assert.ok(fs.existsSync(path.join(root, 'escape.txt')));
    assert.equal(api.call('host/info').jail, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(cfg, { recursive: true, force: true }); }
});

test('host API over HTTP: token, CORS preflight, settings and errors', async () => {
  const root = tmp();
  const cfg = tmp();
  const api = createFsApi({ root, jail: true, configDir: cfg, token: 'secret', corsOrigins: ['http://tauri.localhost'] });
  const server = http.createServer(async (req, res) => { if (!(await api.handle(req, res))) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api/`;
  const post = (name, body, token = 'secret') => fetch(`${base}${name}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), origin: 'http://tauri.localhost' }, body: JSON.stringify(body || {}) });
  try {
    const denied = await post('fs/list', { path: '/' }, '');
    assert.equal(denied.status, 401);
    const pre = await fetch(`${base}fs/list`, { method: 'OPTIONS', headers: { origin: 'http://tauri.localhost' } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), 'http://tauri.localhost');
    let r = await (await post('fs/writeText', { path: '/m/demo.m', text: 'x = 1;' })).json();
    assert.equal(r.ok, true);
    r = await (await post('fs/readText', { path: '/m/demo.m' })).json();
    assert.deepEqual(r, { ok: true, data: 'x = 1;' });
    r = await (await post('fs/readText', { path: '/m/none.m' })).json();
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'ENOENT');
    r = await (await post('settings/set', { settings: { theme: 'daylight', layout: { rightW: 320 } } })).json();
    assert.equal(r.ok, true);
    r = await (await post('settings/get')).json();
    assert.equal(r.data.theme, 'daylight');
    assert.equal(r.data.layout.rightW, 320);
    r = await (await post('fs/system', { command: 'echo x' })).json();
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'ENOSYS');
    r = await (await post('no/such')).json();
    assert.equal(r.ok, false);
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(cfg, { recursive: true, force: true });
  }
});
