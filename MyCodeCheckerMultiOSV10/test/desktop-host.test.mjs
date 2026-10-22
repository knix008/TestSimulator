import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Starts host/desktop.js the way the Tauri shell does and reads MCC_READY.
function startHost() {
  const config = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-host-'));
  const child = spawn(process.execPath, [path.join(root, 'host', 'desktop.js'), '--config', config], { stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
      const m = out.match(/MCC_READY (\{.*\})/);
      if (m) resolve({ child, config, ...JSON.parse(m[1]) });
    });
    child.on('exit', (code) => reject(new Error(`host exited with ${code}`)));
  });
}

test('the desktop sidecar answers the Tauri page across origins and still needs the token', async () => {
  const host = await startHost();
  const url = `http://127.0.0.1:${host.port}/api/workspace.load`;
  try {
    for (const origin of ['http://localhost:5210', 'http://tauri.localhost', 'tauri://localhost']) {
      const pre = await fetch(url, {
        method: 'OPTIONS',
        headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' },
      });
      assert.equal(pre.status, 204, origin);
      assert.equal(pre.headers.get('access-control-allow-origin'), origin);
      assert.match(pre.headers.get('access-control-allow-headers'), /authorization/);
    }
    const ok = await fetch(url, {
      method: 'POST',
      headers: { origin: 'http://tauri.localhost', authorization: `Bearer ${host.token}`, 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('access-control-allow-origin'), 'http://tauri.localhost');
    assert.equal((await ok.json()).ok, true);

    const noToken = await fetch(url, { method: 'POST', headers: { origin: 'http://tauri.localhost' }, body: '{}' });
    assert.equal(noToken.status, 401);

    const stranger = await fetch(url, { method: 'OPTIONS', headers: { origin: 'http://evil.example', 'access-control-request-method': 'POST' } });
    assert.equal(stranger.headers.get('access-control-allow-origin'), null);
  } finally {
    host.child.removeAllListeners('exit');
    host.child.kill();
    fs.rmSync(host.config, { recursive: true, force: true });
  }
});
