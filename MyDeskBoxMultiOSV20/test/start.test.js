'use strict';

// npm start 가 tauri dev 를 띄우고, 그 출력을 깨뜨리지 않고 넘기는지 본다.
// 진짜 tauri dev 는 빌드하고 바탕화면을 차지하므로 가짜 CLI 를 넣는다 (MYDESKBOX_TAURI_CLI).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const START = path.join(__dirname, '..', 'tools', 'start.js');

function run(args, extraEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [START, ...args], { env: { ...process.env, ...extraEnv } });
    const out = [];
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => out.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, text: Buffer.concat(out).toString('utf8') }));
  });
}

test('npm start runs tauri dev, relays Korean output intact and passes through the exit code', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdb-start-'));
  const fake = path.join(dir, 'tauri.js');
  fs.writeFileSync(fake, `'use strict';
process.stdout.write('받은 인자: ' + JSON.stringify(process.argv.slice(2)) + '\\n');
process.stderr.write('ELECTRON_RUN_AS_NODE=' + (process.env.ELECTRON_RUN_AS_NODE || '') + '\\n');
process.stderr.write('바탕화면을 되돌렸습니다\\n');
process.exit(3);
`);
  try {
    const plain = await run([], { MYDESKBOX_TAURI_CLI: fake, ELECTRON_RUN_AS_NODE: '1' });
    assert.equal(plain.code, 3, `the exit code was not passed through\n${plain.text}`);
    assert.match(plain.text, /받은 인자: \["dev"\]/, `does not run tauri dev\n${plain.text}`);
    assert.match(plain.text, /바탕화면을 되돌렸습니다/, `output was garbled or missing\n${plain.text}`);
    assert.match(plain.text, /ELECTRON_RUN_AS_NODE=\n/, 'ELECTRON_RUN_AS_NODE is passed down');
    assert.doesNotMatch(plain.text, /�/, 'output contains garbled characters');

    const withArgs = await run(['--restore-desktop'], { MYDESKBOX_TAURI_CLI: fake });
    assert.match(withArgs.text, /받은 인자: \["dev","--","--","--restore-desktop"\]/, 'app arguments do not reach the app');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('npm start pipes the output and decodes it as text', () => {
  const source = fs.readFileSync(START, 'utf8');
  assert.match(source, /stdio:\s*\['inherit',\s*'pipe',\s*'pipe'\]/, 'output goes straight to the terminal, so text is garbled in a CP949 terminal');
  assert.match(source, /stdout\.setEncoding\('utf8'\)/);
  assert.match(source, /stderr\.setEncoding\('utf8'\)/);
  assert.ok(fs.existsSync(require.resolve('@tauri-apps/cli/tauri.js', { paths: [path.join(__dirname, '..')] })), 'run npm install first');
});
