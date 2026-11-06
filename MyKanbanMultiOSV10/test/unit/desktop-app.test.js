const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, it } = require('../lib/framework');
const pkg = require('../../package.json');

const ROOT = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function startHost(dataDir) {
  const child = spawn(process.execPath, [path.join(ROOT, 'desktop-host.js')], {
    env: { ...process.env, KANBAN_DATA_PATH: dataDir, MYKANBAN_PORT: '3921' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const port = new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      const match = out.match(/MYKANBAN_PORT=(\d+)/);
      if (match) resolve(Number(match[1]));
    });
    child.once('exit', (code) => reject(new Error(`The host ended with code ${code}`)));
  });
  return { child, port };
}

describe('Desktop app', () => {
  it('keeps one version in package.json, Cargo.toml, the lock files and Tauri', () => {
    assert.equal(pkg.version, '1.0.2');
    assert.match(read('src-tauri/Cargo.toml'), new RegExp(`^version = "${pkg.version.replace(/\./g, '\\.')}"$`, 'm'));
    assert.equal(JSON.parse(read('package-lock.json')).version, pkg.version);
    assert.equal(JSON.parse(read('src-tauri/tauri.conf.json')).version, '../package.json');
  });

  it('has no Electron left in its packages or files', () => {
    const packages = { ...pkg.dependencies, ...pkg.devDependencies };
    assert.deepEqual(Object.keys(packages).filter((name) => /electron|rcedit/.test(name)), []);
    for (const file of ['main.js', 'preload.js', 'tmp-cookies.txt']) {
      assert.equal(fs.existsSync(path.join(ROOT, file)), false, file);
    }
    const renderer = ['app', 'board', 'admin', 'report', 'lang'].map((name) => read(`src/renderer/js/${name}.js`)).join('');
    assert.doesNotMatch(renderer, /electron/i);
  });

  it('gives every command the page uses a permission', () => {
    const lib = read('src-tauri/src/lib.rs');
    const handler = lib.match(/generate_handler!\[([\s\S]*?)\]/)[1].split(',').map((s) => s.trim()).filter(Boolean);
    const allowed = JSON.parse(read('src-tauri/capabilities/default.json')).permissions;
    const manifest = read('src-tauri/build.rs');
    for (const command of handler) {
      assert.ok(manifest.includes(`"${command}"`), `build.rs lacks ${command}`);
      assert.ok(allowed.includes(`allow-${command.replace(/_/g, '-')}`), `capability lacks ${command}`);
    }
    const bridge = read('src-tauri/src/bridge.js');
    for (const [, command] of bridge.matchAll(/invoke\('(\w+)'/g)) {
      assert.ok(handler.includes(command), `bridge calls unknown ${command}`);
    }
  });

  it('draws the size marker as a triangle of dots and keeps it hidden on the web', () => {
    const html = read('src/renderer/index.html');
    const marker = html.match(/<div id="win-resize-grip"([^>]*)>([\s\S]*?)<\/div>/);
    assert.match(marker[1], /class="hidden"/);
    const dots = [...marker[2].matchAll(/<circle cx="(\d+)" cy="(\d+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
    assert.deepEqual(dots, [[10, 2], [6, 6], [10, 6], [2, 10], [6, 10], [10, 10]]);
    assert.doesNotMatch(marker[2], /<(path|line|polygon)/);
  });

  it('runs the server, reports its port and ends when the program goes away', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mykanban-host-'));
    const { child, port } = startHost(dataDir);
    try {
      const res = await fetch(`http://127.0.0.1:${await port}/api/app-info`);
      assert.equal((await res.json()).version, pkg.version);
      assert.ok(fs.existsSync(path.join(dataDir, 'kanban.db')));
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.stdin.end();
      assert.equal(await exited, 0);
    } finally {
      if (child.exitCode === null) child.kill();
    }
  });
});
