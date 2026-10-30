// The desktop (Tauri) side that runs without a window: the Node host the
// shell starts (host/host.js — ready line, token, CORS, stdin = lifetime),
// the shared HTTP API handler, the start page's layout and background
// helpers, the i18n dictionaries and the Tauri configuration.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { cardsOf, place, compact, autoArrange, swapVertical, layoutValue, overlaps, COLS } from '../src/lib/startLayout.js';
import { ANIMATION_KINDS, ANIMATION_ICONS, DEFAULT_START_BACKGROUND } from '../src/lib/startBackground.js';
import { tIn } from '../src/lib/i18n.js';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createApi } = require('../core/api');
const { createApiHandler } = require('../server/http-api');
const { startHost } = require('../host/host');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mfs-desktop-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

async function post(port, name, body, headers = {}) {
  const res = await fetch(`http://127.0.0.1:${port}/api/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body || {}) });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
}

describe('Node host (sidecar)', () => {
  test('serves core/api.js behind its token, with CORS for the app page', async () => {
    const host = startHost({ configDir: path.join(tmp, 'host1'), version: '1.0.1', autoStart: false });
    try {
      const { port, token } = await host.ready;
      assert.ok(port > 0);
      assert.match(token, /^[0-9a-f]{48}$/);
      const auth = { authorization: `Bearer ${token}`, origin: 'http://tauri.localhost' };
      const info = await post(port, 'app.info', {}, auth);
      assert.equal(info.status, 200);
      assert.equal(info.body.ok, true);
      assert.equal(info.body.data.host, 'tauri');
      assert.equal(info.body.data.version, '1.0.1');
      assert.equal(info.body.data.configDir, path.join(tmp, 'host1'));
      assert.equal(info.headers.get('access-control-allow-origin'), 'http://tauri.localhost');
      assert.equal((await post(port, 'app.info', {}, { authorization: 'Bearer nope' })).status, 401);
      assert.equal((await post(port, 'app.info')).status, 401);
      const pre = await fetch(`http://127.0.0.1:${port}/api/app.info`, { method: 'OPTIONS', headers: { origin: 'http://tauri.localhost', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type' } });
      assert.equal(pre.status, 204);
      assert.match(pre.headers.get('access-control-allow-headers'), /authorization/);
      const missing = await post(port, 'no.such', {}, auth);
      assert.equal(missing.body.ok, false);
      assert.match(missing.body.error.message, /Unknown API method/);
      const other = await fetch(`http://127.0.0.1:${port}/index.html`);
      assert.equal(other.status, 404);
    } finally {
      await host.stop();
    }
  });

  test('autoStart in the session starts the servers when the host comes up', async () => {
    const dir = path.join(tmp, 'host2');
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'share'));
    fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify({ autoStart: true }));
    fs.writeFileSync(path.join(dir, 'server_settings.json'), JSON.stringify({
      sharedFolders: [{ virtualName: 'data', physicalPath: path.join(dir, 'share') }], allowAnonymous: true,
      protocols: { enableFtp: true, enableFtps: false, enableSftp: false, ftpPort: 0 },
    }));
    const host = startHost({ configDir: dir });
    try {
      const { port, token } = await host.ready;
      let state = null;
      for (let i = 0; i < 50 && !(state && state.running); i++) {
        state = (await post(port, 'server.state', {}, { authorization: `Bearer ${token}` })).body.data.state;
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.equal(state.running, true);
      await host.stop();
      assert.equal(host.api.manager.running, false, 'stop() stops the FTP servers');
    } finally {
      await host.stop();
    }
  });

  test('as a process: one ready line on stdout, exits when stdin closes', async () => {
    const dir = path.join(tmp, 'host3');
    const child = spawn(process.execPath, [path.join(root, 'host', 'host.js')], { env: { ...process.env, MFS_CONFIG_DIR: dir, MFS_VERSION: '9.9.9' }, stdio: ['pipe', 'pipe', 'ignore'] });
    let out = '';
    const ready = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no ready line')), 15000);
      child.stdout.on('data', (d) => {
        out += d;
        const i = out.indexOf('\n');
        if (i >= 0) { clearTimeout(timer); resolve(JSON.parse(out.slice(0, i))); }
      });
    });
    assert.equal(ready.ready, true);
    const info = await post(ready.port, 'app.info', {}, { authorization: `Bearer ${ready.token}` });
    assert.equal(info.body.data.version, '9.9.9');
    assert.equal(info.body.data.configDir, dir);
    const code = await new Promise((resolve) => { child.on('exit', resolve); child.stdin.end(); });
    assert.equal(code, 0);
  });

  test('the web handler without a token answers everyone, without CORS', async () => {
    const api = createApi({ name: 'web', configDir: path.join(tmp, 'web') });
    const handle = createApiHandler(api);
    const server = http.createServer((req, res) => handle(req, res, new URL(req.url, 'http://x')).then((done) => { if (!done) { res.writeHead(404); res.end(); } }));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const { port } = server.address();
      const r = await post(port, 'app.info', {}, { origin: 'http://example.com' });
      assert.equal(r.body.data.host, 'web');
      assert.equal(r.headers.get('access-control-allow-origin'), null);
      const bad = await fetch(`http://127.0.0.1:${port}/api/app.info`, { method: 'POST', body: '{nope' });
      assert.equal(bad.status, 400);
      const get = await fetch(`http://127.0.0.1:${port}/api/app.info`);
      assert.equal(get.status, 405);
    } finally {
      server.close();
      await api.shutdown();
    }
  });
});

describe('Start page', () => {
  const IDS = ['hero', 'status', 'quick', 'shares', 'addresses', 'profiles', 'help', 'side'];
  const SPAN = { hero: 3, status: 1, quick: 2, shares: 1, addresses: 2, profiles: 1, help: 1, side: 1 };
  const noOverlap = (cards) => {
    const list = Object.values(cards);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) assert.ok(!overlaps(list[i], list[j]), `cards ${i} and ${j} overlap`);
  };

  test('default layout: every card placed inside the grid, none overlapping', () => {
    const cards = cardsOf(null, IDS, SPAN, {});
    assert.deepEqual(Object.keys(cards).sort(), [...IDS].sort());
    for (const c of Object.values(cards)) assert.ok(c.col >= 0 && c.col + c.w <= COLS);
    assert.equal(cards.hero.row, 0);
    assert.equal(cards.hero.w, 3);
    noOverlap(cards);
  });

  test('moving, resizing and swapping keep the board consistent; the layout round-trips', () => {
    let cards = cardsOf(null, IDS, SPAN, { status: 10, quick: 8 });
    cards = place(cards, 'side', { col: 0, row: 0 });
    noOverlap(cards);
    cards = place(cards, 'quick', { w: 3, fit: false, h: 12 });
    noOverlap(cards);
    assert.equal(cards.quick.w, 3);
    cards = swapVertical(cards, 'status', -1);
    noOverlap(cards);
    const saved = layoutValue(compact(cards));
    assert.equal(saved.version, 2);
    const back = cardsOf(saved, IDS, SPAN, {});
    for (const id of IDS) assert.equal(back[id].w, cards[id].w);
    noOverlap(autoArrange(IDS, SPAN, {}));
  });

  test('a card added in a later version goes below the saved ones', () => {
    const saved = layoutValue(cardsOf(null, IDS.filter((id) => id !== 'side'), SPAN, {}));
    const cards = cardsOf(saved, IDS, SPAN, {});
    assert.ok(cards.side);
    noOverlap(cards);
  });

  test('background kinds all have an icon and the default kind exists', () => {
    assert.ok(ANIMATION_KINDS.includes(DEFAULT_START_BACKGROUND.kind));
    for (const k of ANIMATION_KINDS) assert.ok(ANIMATION_ICONS[k], k);
  });

  test('every start page string exists in Korean and English', () => {
    const src = fs.readFileSync(path.join(root, 'src', 'components', 'StartPage.jsx'), 'utf8');
    const keys = new Set([...src.matchAll(/t\('([a-z0-9_]+)'/gi)].map((m) => m[1]));
    for (const k of ANIMATION_KINDS) { keys.add(`anim_${k}`); keys.add(`anim_${k}_d`); }
    for (const k of ['start_page', 'tip_start_page', 'tray_show', 'tray_quit', 'set_show_start', 'set_show_start_hint', 'boot_host_error', 'host_tauri']) keys.add(k);
    for (const key of keys) {
      for (const lang of ['ko', 'en']) assert.notEqual(tIn(lang, key), key, `${lang}: ${key} missing`);
    }
  });
});

describe('Packaging', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const conf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  const cargo = fs.readFileSync(path.join(root, 'src-tauri', 'Cargo.toml'), 'utf8');

  test('one version everywhere: package.json, Cargo.toml, the title', () => {
    assert.equal(pkg.version, '1.0.1');
    assert.equal(conf.version, '../package.json');
    assert.match(cargo, new RegExp(`^version = "${pkg.version.replace(/\./g, '\\.')}"`, 'm'));
    assert.equal(tIn('ko', 'appName'), `My FTP Server V${pkg.version}`);
    assert.equal(tIn('en', 'appName'), `My FTP Server V${pkg.version}`);
  });

  test('no Electron left in the project', () => {
    assert.equal(fs.existsSync(path.join(root, 'electron')), false);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    assert.ok(!deps.electron && !deps['electron-builder']);
    assert.equal(pkg.main, undefined);
    const src = fs.readdirSync(path.join(root, 'src'), { recursive: true }).filter((f) => /\.(jsx?|mjs)$/.test(f));
    for (const f of src) assert.doesNotMatch(fs.readFileSync(path.join(root, 'src', f), 'utf8'), /myFtpServer\.|ipcRenderer|isElectron/, f);
  });

  test('the shell commands the page calls are allowed, and the sidecar is bundled', () => {
    const caps = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'capabilities', 'default.json'), 'utf8'));
    const ids = caps.permissions.map((p) => (typeof p === 'string' ? p : p.identifier));
    for (const cmd of ['renderer_ready', 'set_min_size', 'set_tray', 'quit_app']) assert.ok(ids.includes(`allow-${cmd.replace(/_/g, '-')}`), cmd);
    const backend = fs.readFileSync(path.join(root, 'src', 'lib', 'backend.js'), 'utf8');
    for (const m of backend.matchAll(/invoke\('([a-z_]+)'/g)) assert.ok(ids.includes(`allow-${m[1].replace(/_/g, '-')}`), m[1]);
    for (const p of ['core:window:allow-start-resize-dragging', 'core:window:allow-toggle-maximize', 'opener:allow-reveal-item-in-dir', 'clipboard-manager:allow-write-text']) assert.ok(ids.includes(p), p);
    assert.equal(conf.bundle.resources['sidecar/'], 'sidecar/');
    assert.match(conf.build.beforeBuildCommand, /prepare-tauri\.mjs --release/);
    const hooks = fs.readFileSync(path.join(root, 'src-tauri', 'windows', 'hooks.nsh'));
    assert.deepEqual([...hooks.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'hooks.nsh needs a UTF-8 BOM');
  });
});
