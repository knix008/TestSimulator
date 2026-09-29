'use strict';

// npm start 가 앱이 남긴 말을 깨뜨리지 않고 그대로 보여 주는지.
//
// 진짜 Electron 을 띄우면 바탕화면을 차지한다. 그래서 electron 자리에 node 를 끼운다.
// node 로 켜진 main.js 는 한국어 안내를 남기고 1 로 끝난다. 그 말과 끝난 값을 받아 본다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const START = path.join(__dirname, '..', 'tools', 'start.js');

test('npm start 는 앱이 남긴 한국어를 깨뜨리지 않고 끝난 값도 그대로 넘긴다', async () => {
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
    assert.equal(result.code, 1, `앱이 끝난 값을 넘기지 않았다\n${result.text}`);
    assert.match(result.text, /Electron 이 아니라 Node 로 켜졌습니다/, `앱의 말이 깨졌거나 오지 않았다\n${result.text}`);
    assert.doesNotMatch(result.text, /\uFFFD/, '깨진 글자가 섞였다');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('npm start 는 앱의 출력을 받아 글로 풀어 다시 쓴다', () => {
  const source = fs.readFileSync(START, 'utf8');
  assert.match(source, /stdio:\s*\['inherit',\s*'pipe',\s*'pipe'\]/, '앱이 터미널에 바로 써서 CP949 터미널에서 글이 깨진다');
  assert.match(source, /stdout\.setEncoding\('utf8'\)/, '표준 출력을 UTF-8 로 풀지 않는다');
  assert.match(source, /stderr\.setEncoding\('utf8'\)/, '오류 출력을 UTF-8 로 풀지 않는다');
  assert.match(source, /delete env\.ELECTRON_RUN_AS_NODE/, 'ELECTRON_RUN_AS_NODE 를 걷어 내지 않는다');
});
