'use strict';

// Checks that npm start relays the app's output without garbling it.
//
// Launching real Electron would take over the desktop, so node is swapped in for electron.
// When started under node, main.js prints a Korean notice and exits with 1; we capture both.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const START = path.join(__dirname, '..', 'tools', 'start.js');

test('npm start relays Korean app output intact and passes through the exit code', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdb-start-'));
  const wrapper = path.join(dir, 'run.js');
  fs.writeFileSync(wrapper, `'use strict';
const Module = require('module');
const original = Module._resolveFilename;
Module._resolveFilename = function resolve(request, ...rest) {
  if (request === 'electron') return ' electron';
  return original.call(this, request, ...rest);
};
require.cache[' electron'] = { id: ' electron', filename: ' electron', loaded: true, exports: process.execPath };
require(${JSON.stringify(START)});
`);
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [wrapper], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
      const out = [];
      child.stdout.on('data', (chunk) => out.push(chunk));
      child.stderr.on('data', (chunk) => out.push(chunk));
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, text: Buffer.concat(out).toString('utf8') }));
    });
    assert.equal(result.code, 1, `the app's exit code was not passed through\n${result.text}`);
    assert.match(result.text, /Electron 이 아니라 Node 로 켜졌습니다/, `the app's message was garbled or missing\n${result.text}`);
    assert.doesNotMatch(result.text, /\uFFFD/, 'output contains garbled characters');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('npm start pipes the app output, decodes it as text, and rewrites it', () => {
  const source = fs.readFileSync(START, 'utf8');
  assert.match(source, /stdio:\s*\['inherit',\s*'pipe',\s*'pipe'\]/, 'the app writes straight to the terminal, so text is garbled in a CP949 terminal');
  assert.match(source, /stdout\.setEncoding\('utf8'\)/, 'stdout is not decoded as UTF-8');
  assert.match(source, /stderr\.setEncoding\('utf8'\)/, 'stderr is not decoded as UTF-8');
  assert.match(source, /delete env\.ELECTRON_RUN_AS_NODE/, 'ELECTRON_RUN_AS_NODE is not removed');
});
