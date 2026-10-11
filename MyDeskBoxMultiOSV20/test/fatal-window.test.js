'use strict';

// Opens the fatal error window in real Electron.
// A fake window can't tell us whether the text lands in the text box, is selectable, or whether the buttons send on the right channels.
// The clipboard belongs to the user, so we leave it alone and only capture the signal the copy button sends.

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

test('real error window lets you select text and send copy and close', { timeout: 60000 }, async () => {
  const electron = require('electron');
  assert.equal(typeof electron, 'string', 'could not find the electron executable');
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

    assert.equal(out.value, text, 'text shown in the window differs from the error text');
    assert.equal(out.readOnly, true, 'error text is editable');
    assert.equal(out.userSelect, 'text', 'error text cannot be selected');
    assert.equal(out.selected, text, 'full text was not preselected on open');
    assert.equal(out.title, '제목');
    assert.deepEqual(out.buttons, ['복사', '닫기']);
    assert.equal(out.detail, '복사했습니다', 'no confirmation shown after copying');
    assert.deepEqual(out.seen, ['copy', 'close', 'close'], 'a button or Esc did not send its signal');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
