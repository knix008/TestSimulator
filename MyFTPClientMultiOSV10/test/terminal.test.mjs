// Local terminal sessions: open / write / read / close / cap.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createApi } = require('../core/api');
const { MAX_SESSIONS } = require('../core/terminal');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'myftp-term-'));
const cwd = os.tmpdir();

let api;

before(() => {
  api = createApi({ name: 'test', version: '0.0.0', configDir: path.join(tmp, 'config') });
});

after(async () => {
  await api.shutdown();
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 }); } catch { /* Windows may still hold a handle */ }
});

async function waitFor(id, needle, ms = 4000) {
  const start = Date.now();
  let text = '';
  while (Date.now() - start < ms) {
    const r = await api.call('terminal.read', { id, after: 0 });
    text = (r.chunks || []).map((c) => c.data).join('');
    if (text.includes(needle)) return text;
    await new Promise((res) => setTimeout(res, 40));
  }
  throw new Error(`terminal output did not include ${JSON.stringify(needle)}\n---\n${text}\n---`);
}

test('terminal: local open, echo, read, close', async () => {
  const s = await api.call('terminal.open', { kind: 'local', cwd });
  assert.equal(s.kind, 'local');
  assert.equal(s.alive, true);
  assert.ok(s.id);
  const line = process.platform === 'win32' ? 'echo hello-term\r\n' : 'echo hello-term\n';
  await api.call('terminal.write', { id: s.id, data: line });
  await waitFor(s.id, 'hello-term');
  const listed = await api.call('terminal.list');
  assert.equal(listed.sessions.some((x) => x.id === s.id), true);
  assert.equal(listed.max, MAX_SESSIONS);
  const closed = await api.call('terminal.close', { id: s.id });
  assert.equal(closed.ok, true);
  await assert.rejects(() => api.call('terminal.read', { id: s.id }), /not found/i);
});

test('terminal: Korean UTF-8 and CP949 decode, hangul echo', async () => {
  const { ConsoleDecoder } = require('../core/encoding');
  const utf = new ConsoleDecoder();
  assert.equal(utf.push(Buffer.from('안녕', 'utf8')), '안녕');
  const split = new ConsoleDecoder();
  const hangul = Buffer.from('한글', 'utf8');
  assert.equal(split.push(hangul.subarray(0, 2)), '');
  assert.equal(split.push(hangul.subarray(2)), '한글');
  const oem = new ConsoleDecoder();
  assert.equal(oem.push(Buffer.from([0xBE, 0xC8, 0xB3, 0xE7])), '안녕');

  const s = await api.call('terminal.open', { kind: 'local', cwd });
  try {
    await waitFor(s.id, '>', 3000);
    const line = process.platform === 'win32' ? 'echo 한글\r\n' : 'printf "%s\\n" 한글\n';
    await api.call('terminal.write', { id: s.id, data: line });
    await waitFor(s.id, '한글');
  } finally {
    await api.call('terminal.close', { id: s.id });
  }
});

test('terminal: lists installed shells and opens a chosen one', async () => {
  const r = await api.call('terminal.shells');
  assert.ok(Array.isArray(r.shells) && r.shells.length >= 1);
  for (const s of r.shells) {
    assert.ok(s.id && s.label && s.path);
  }
  const sh = r.shells.find((s) => s.preferred) || r.shells[0];
  const opened = await api.call('terminal.open', { kind: 'local', cwd, shellId: sh.id });
  assert.equal(opened.shellId, sh.id);
  await api.call('terminal.close', { id: opened.id });
  await assert.rejects(() => api.call('terminal.open', { kind: 'local', cwd, shellId: '__missing_shell__' }), /not installed|not found/i);
});

test('terminal: powershell prompt shows a filesystem path', async (t) => {
  if (process.platform !== 'win32') { t.skip(); return; }
  const r = await api.call('terminal.shells');
  const sh = (r.shells || []).find((s) => s.id === 'powershell' || s.id === 'pwsh');
  if (!sh) { t.skip(); return; }
  const s = await api.call('terminal.open', { kind: 'local', cwd, shellId: sh.id });
  try {
    const text = await waitFor(s.id, 'PS ', 8000);
    assert.match(text.replace(/\r/g, ''), /PS [A-Za-z]:\\/);
    assert.equal(text.includes('Microsoft.PowerShell.Core\\FileSystem::'), false);
  } finally {
    await api.call('terminal.close', { id: s.id });
  }
});

test('terminal: missing session and remote without connection', async () => {
  await assert.rejects(() => api.call('terminal.write', { id: 9999, data: 'x' }), /not found/i);
  await assert.rejects(() => api.call('terminal.open', { kind: 'remote', connId: 1 }), /not connected/i);
});

test('terminal: session cap', async () => {
  const ids = [];
  try {
    for (let i = 0; i < MAX_SESSIONS; i++) {
      const s = await api.call('terminal.open', { kind: 'local', cwd });
      ids.push(s.id);
    }
    await assert.rejects(() => api.call('terminal.open', { kind: 'local', cwd }), /at most/i);
  } finally {
    for (const id of ids) await api.call('terminal.close', { id });
  }
});
