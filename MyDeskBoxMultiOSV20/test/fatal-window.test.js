'use strict';

// 큰 오류 창을 진짜 Electron 으로 띄워 본다.
// 가짜 창으로는 글상자에 글이 들어가는지, 골라지는지, 단추가 제 채널로 보내는지 알 수 없다.
// 클립보드는 사용자 것이라 건드리지 않는다. 복사 단추가 보내는 신호만 받는다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SRC = path.join(__dirname, '..', 'src');

function runElectron(script) {
  const electron = require('electron');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return new Promise((resolve, reject) => {
    const child = spawn(electron, [script], { env });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out }));
  });
}

test('진짜 오류 창에서 글을 고르고 복사와 닫기를 보낼 수 있다', { timeout: 60000 }, async () => {
  const electron = require('electron');
  assert.equal(typeof electron, 'string', 'electron 실행 파일을 찾지 못했다');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdb-fatal-'));
  const text = [
    'MyDeskBox 1.0.0',
    'win32 x64 · Electron',
    '',
    'Error: 진짜 창 오류',
    ...Array.from({ length: 200 }, (_, i) => `    at 자리${i} (file${i}.js:${i}:1)`),
  ].join('\n');
  const script = path.join(dir, 'fatal.js');
  fs.writeFileSync(script, `'use strict';
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const SRC = ${JSON.stringify(SRC)};
const text = ${JSON.stringify(text)};
const seen = [];
ipcMain.on('fatal:copy', () => seen.push('copy'));
ipcMain.on('fatal:close', () => seen.push('close'));
setTimeout(() => { console.error('TIMEOUT'); app.exit(3); }, 30000);
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(check) {
  for (let i = 0; i < 100 && !check(); i += 1) await wait(50);
}
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      show: false,
      width: 520,
      height: 420,
      webPreferences: {
        preload: path.join(SRC, 'preload', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    const report = { title: '제목', detail: '설명', copied: '복사했습니다', copy: '복사', close: '닫기', text };
    await win.loadFile(path.join(SRC, 'renderer', 'fatal.html'), { query: { report: JSON.stringify(report) } });
    const js = (code) => win.webContents.executeJavaScript(code);
    const out = {};
    out.value = await js("document.getElementById('report').value");
    out.readOnly = await js("document.getElementById('report').readOnly");
    out.userSelect = await js("getComputedStyle(document.getElementById('report')).userSelect");
    out.selected = await js("(() => { const b = document.getElementById('report'); return b.value.slice(b.selectionStart, b.selectionEnd); })()");
    out.title = await js("document.getElementById('title').textContent");
    out.buttons = await js("[document.getElementById('copy').textContent, document.getElementById('close').textContent]");
    await js("document.getElementById('copy').click()");
    await until(() => seen.includes('copy'));
    win.webContents.send('fatal:copied', report.copied);
    await wait(150);
    out.detail = await js("document.getElementById('detail').textContent");
    await js("document.getElementById('close').click()");
    await until(() => seen.includes('close'));
    await js("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
    await until(() => seen.filter((x) => x === 'close').length >= 2);
    out.seen = seen;
    console.log('RESULT ' + JSON.stringify(out));
    app.exit(0);
  } catch (err) {
    console.error(err && err.stack || err);
    app.exit(2);
  }
});
`);
  try {
    const result = await runElectron(script);
    assert.equal(result.code, 0, result.out);
    const line = result.out.split(/\r?\n/).find((row) => row.startsWith('RESULT '));
    assert.ok(line, result.out);
    const out = JSON.parse(line.slice('RESULT '.length));

    assert.equal(out.value, text, '창에 보인 글이 오류 글과 다르다');
    assert.equal(out.readOnly, true, '오류 글을 고칠 수 있다');
    assert.equal(out.userSelect, 'text', '오류 글을 고를 수 없다');
    assert.equal(out.selected, text, '뜨자마자 글 전체를 골라 두지 않았다');
    assert.equal(out.title, '제목');
    assert.deepEqual(out.buttons, ['복사', '닫기']);
    assert.equal(out.detail, '복사했습니다', '복사한 뒤 알려 주지 않았다');
    assert.deepEqual(out.seen, ['copy', 'close', 'close'], '단추나 Esc 가 제 신호를 보내지 않았다');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
