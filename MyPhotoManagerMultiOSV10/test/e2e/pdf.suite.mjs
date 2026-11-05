// PDF E2E in the real desktop app: ordinary documents, odd page sizes, damaged
// files, big files, and what the user sees when something does go wrong. The
// app's own PDFs (the "formats" fixtures) are only JPEG pages, which is why none
// of the problems below showed up there. Every case ends with the page alive.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listTargets, Page, sleep } from './cdp.mjs';
import { fixtures } from './harness.mjs';
import { pdfCases, writeBigPdf } from '../helpers/pdf-build.mjs';

const P = 'window.__myphoto';
const js = (value) => JSON.stringify(value);
const BIG_MB = [150, 300, 1000];

export function prepare(work) {
  const { ok, bad } = pdfCases();
  const write = (folder, files) => {
    fs.mkdirSync(path.join(work, folder), { recursive: true });
    for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(work, folder, name), bytes);
  };
  write('pdf-ok', ok);
  write('pdf-bad', bad);
  write('pdf-mixed', { ...ok, ...bad });
  fs.mkdirSync(path.join(work, 'pdf-big'));
  for (const mb of BIG_MB) writeBigPdf(path.join(work, 'pdf-big', `big-${String(mb).padStart(4, '0')}.pdf`), mb);
  fs.mkdirSync(path.join(work, 'plain'));
  fs.copyFileSync(path.join(fixtures, 'beach.jpg'), path.join(work, 'plain', 'beach.jpg'));
}

export const env = () => ({ MYPHOTO_TEST_CRASH: '1' });

// ───────────────────────── helpers

const dir = (app, name) => path.join(app.work, name);

/** Counts a dead page process; each case fails on one it did not cause itself. */
async function watch(app) {
  app.crashes = 0;
  await app.main.send('Inspector.enable');
  if (app.main.__watched) return;
  app.main.__watched = true;
  app.main.on('Inspector.targetCrashed', () => { app.crashes += 1; });
}

async function assertAlive(app, what) {
  assert.equal(app.crashes, 0, `${what}: the page process died`);
  assert.equal(app.process.exitCode, null, `${what}: the program ended`);
  assert.equal(await app.main.eval('1 + 1', 15000), 2, `${what}: the page does not answer`);
}

async function open(app, folder) {
  await app.main.eval(`${P}.closeAllDialogs(); ${P}.actions.setMode('manage'); ${P}.actions.openFolder(${js(folder)}); 1`);
  await app.main.waitFor(`${P}.app.state.source.path === ${js(folder)} && !${P}.app.state.loading && ${P}.app.state.list.length > 0`, { timeout: 20000, message: `open ${folder}` });
}

const pathOf = (app, name) => app.main.eval(`${P}.app.state.list.find((i) => i.name === ${js(name)})?.path ?? null`);

/** Thumbnail state: 'WxH', 'error: …' once it is done. */
async function thumb(app, name, timeout = 60000) {
  const read = `(() => { const i = ${P}.app.state.list.find((x) => x.name === ${js(name)}); if (!i) return null; ${P}.thumbs.get(i, 10); const e = ${P}.thumbs.peek(i); return e ? (e.url ? e.width + 'x' + e.height : 'error: ' + e.error) : null; })()`;
  return app.main.waitFor(read, { timeout, message: `${name}: thumbnail` });
}

/** Opens a file in the viewer and waits for the page or the error panel. */
async function view(app, name, timeout = 60000) {
  const file = await pathOf(app, name);
  assert.ok(file, `${name} is listed`);
  await app.main.eval(`${P}.actions.viewItem(${js(file)}); 1`);
  await app.main.waitFor(`${P}.viewer.currentPath === ${js(file)} && ['pdf', 'error'].includes(${P}.viewer.debug().kind) && !${P}.dq('.viewer .placeholder')`, { timeout, message: `${name}: shown` });
  return app.main.eval(`({ ...${P}.viewer.debug(), error: ${P}.dq('.viewer .viewer-error')?.textContent ?? null })`);
}

/** How many red and dark pixels the picture on screen has in a box (canvas pixels). */
const pixels = (app, x0, y0, x1, y1) => app.main.eval(`(() => {
  const c = ${P}.dq('.viewer canvas.viewer-media');
  const d = c.getContext('2d').getImageData(${x0}, ${y0}, ${x1 - x0}, ${y1 - y0}).data;
  let red = 0, dark = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i] > 200 && d[i + 1] < 60 && d[i + 2] < 60) red++; if (d[i] < 90 && d[i + 1] < 90 && d[i + 2] < 90) dark++; }
  return { red, dark };
})()`);

const picture = (app) => app.main.eval(`${P}.dq('.viewer canvas.viewer-media').toDataURL()`);

async function clickSelector(app, selector, index = 0) {
  const box = await app.main.eval(`(() => { const e = ${P}.dqa(${js(selector)})[${index}]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  assert.ok(box, `${selector} on screen`);
  await app.main.realClick(box.x, box.y);
}

/** Records what the page copies, and leaves the user's clipboard alone. */
const spyClipboard = (app) => app.main.eval(`(() => { window.__copied = null; Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async (text) => { window.__copied = text; } }); return 1; })()`);

async function errorWindowText(app, timeout = 60000) {
  await app.main.waitFor(`Boolean(${P}.dq('#error-dialog textarea')?.value)`, { timeout, message: 'the error window' });
  return app.main.eval(`${P}.dq('#error-dialog textarea').value`);
}

/** After a reload the CDP connection may have gone with the old page. */
async function reattach(app) {
  if (app.main.closed) {
    const target = (await listTargets(app.port)).find((t) => t.type === 'page' && !t.url.includes('about:blank'));
    app.main = await new Page(target).open();
  }
  await app.main.waitFor(`Boolean(window.__myphoto && document.body.classList.contains('ready'))`, { timeout: 40000, message: 'page back' });
}

// ───────────────────────── cases

export const cases = [
  {
    ids: ['FMT-PDF'],
    group: 'PDF', name: '글꼴·도형이 있는 일반 문서: 글자와 도형이 실제로 그려지고 쪽마다 다르다',
    run: async (app) => {
      await watch(app);
      await open(app, dir(app, 'pdf-ok'));
      assert.equal(await thumb(app, 'text.pdf'), '1190x1684');
      const shown = await view(app, 'text.pdf');
      assert.deepEqual([shown.kind, shown.pages, shown.width, shown.height, shown.error], ['pdf', 3, 1190, 1684, null]);
      const box = await pixels(app, 120, 244, 520, 484);
      assert.ok(box.red > 90000, `red rectangle drawn: ${box.red}`);
      const text = await pixels(app, 120, 100, 1100, 180);
      assert.ok(text.dark > 500, `text drawn with the built-in font: ${text.dark}`);
      const first = await picture(app);
      await app.main.key('PageDown', 2);
      await app.main.waitFor(`${P}.viewer.debug().page === 1 && ${P}.dq('.viewer canvas.viewer-media').toDataURL() !== ${js(first)}`, { message: 'page 2 differs from page 1' });
      await assertAlive(app, 'text.pdf');
    },
  },
  {
    ids: ['FMT-PDF'],
    group: 'PDF', name: '글꼴을 넣지 않은 한글 PDF: 글자가 빠지지 않는다 (CMap 파일)',
    run: async (app) => {
      await watch(app);
      await open(app, dir(app, 'pdf-ok'));
      const warnings = [];
      const listener = (event) => warnings.push(event.args.map((a) => a.value ?? '').join(' '));
      app.main.on('Runtime.consoleAPICalled', listener);
      await view(app, 'korean.pdf');
      const text = await pixels(app, 120, 80, 320, 180);
      app.main.listeners.get('Runtime.consoleAPICalled').splice(app.main.listeners.get('Runtime.consoleAPICalled').indexOf(listener), 1);
      assert.ok(text.dark > 300, `Korean text drawn: ${text.dark} dark pixels`);
      assert.deepEqual(warnings.filter((w) => /cMapUrl|standardFontDataUrl|wasmUrl|iccUrl/.test(w)), [], 'pdf.js found its data files');
      await assertAlive(app, 'korean.pdf');
    },
  },
  {
    ids: ['FMT-PDF', 'VIEW-PAGES'],
    group: 'PDF', name: '다른 PDF를 열면 첫 쪽부터 (앞 문서의 쪽 번호가 따라오지 않는다)',
    run: async (app) => {
      await watch(app);
      await open(app, dir(app, 'pdf-ok'));
      await view(app, 'text.pdf');
      await app.main.key('PageDown', 2);
      await app.main.waitFor(`${P}.viewer.debug().page === 1 && ${P}.viewer.debug().kind === 'pdf'`);
      await app.main.eval(`${P}.actions.setMode('manage'); 1`);
      const again = await view(app, 'korean.pdf');
      assert.equal(again.page, 0, 'another document starts at its first page');
      await app.main.eval(`${P}.actions.setMode('manage'); 1`);
      assert.equal((await view(app, 'text.pdf')).page, 0, 'and so does a document opened again');
      await assertAlive(app, 'pages');
    },
  },
  {
    ids: ['FMT-PDF'],
    group: 'PDF', name: '극단적인 쪽 크기: 아주 작은·거대한·가늘고 긴 쪽에서 멈추지 않는다',
    run: async (app) => {
      await watch(app);
      await open(app, dir(app, 'pdf-ok'));
      const sizes = { 'tiny-page.pdf': [20, 20], 'huge-page.pdf': [2400, 2400], 'wide-strip.pdf': [2400, 1], 'tall-strip.pdf': [1, 2400], 'bad-content.pdf': [600, 600] };
      for (const [name, [width, height]] of Object.entries(sizes)) {
        assert.equal(await thumb(app, name), `${width}x${height}`, `${name}: thumbnail`);
        const shown = await view(app, name);
        assert.deepEqual([shown.kind, shown.width, shown.height, shown.error], ['pdf', width, height, null], name);
        await assertAlive(app, name);
        await app.main.eval(`${P}.actions.setMode('manage'); 1`);
      }
    },
  },
  {
    ids: ['FMT-PDF-ERROR'],
    group: 'PDF', name: '손상·암호·빈 PDF: 썸네일과 보기가 이유를 알려 주고 앱은 그대로',
    run: async (app) => {
      await watch(app);
      await open(app, dir(app, 'pdf-bad'));
      const expected = { 'zero-bytes.pdf': 'pdf.invalid', 'garbage.pdf': 'pdf.invalid', 'not-a-pdf.pdf': 'pdf.invalid', 'truncated.pdf': 'pdf.invalid', 'no-pages.pdf': 'pdf.failed', 'page-loop.pdf': 'pdf.failed', 'password.pdf': 'pdf.password' };
      for (const [name, key] of Object.entries(expected)) {
        const reason = await app.main.eval(`${P}.t(${js(key)})`);
        const small = await thumb(app, name);
        assert.ok(small.startsWith(`error: ${reason}`), `${name}: thumbnail says "${small}"`);
        const shown = await view(app, name);
        assert.equal(shown.kind, 'error', name);
        assert.ok(shown.error.includes(name) && shown.error.includes(reason), `${name}: panel says "${shown.error}"`);
        await assertAlive(app, name);
        await app.main.eval(`${P}.actions.setMode('manage'); 1`);
      }
    },
  },
  {
    ids: ['FMT-PDF-ERROR'],
    group: 'PDF', name: '오류 내용 복사: 복사 단추는 파일 경로·이유·호출 스택까지, 자세히 단추는 오류 창으로 (실제 클릭)',
    run: async (app) => {
      await watch(app);
      await open(app, dir(app, 'pdf-bad'));
      await spyClipboard(app);
      await view(app, 'password.pdf');
      const file = await pathOf(app, 'password.pdf');
      await clickSelector(app, '.viewer .viewer-error .btn', 0);
      await app.main.waitFor('window.__copied');
      const copied = await app.main.eval('window.__copied');
      const reason = await app.main.eval(`${P}.t('pdf.password')`);
      for (const part of ['password.pdf', file, reason, 'PasswordException', 'renderPdfPage']) assert.ok(copied.includes(part), `copied text has "${part}":\n${copied}`);
      assert.equal(await app.main.eval(`${P}.dq('.viewer .viewer-error .error-copied').hidden`), false, 'says it was copied');
      await clickSelector(app, '.viewer .viewer-error .btn', 1);
      const shown = await errorWindowText(app);
      for (const part of [file, reason, 'renderPdfPage']) assert.ok(shown.includes(part), `error window has "${part}":\n${shown}`);
      await app.main.eval(`${P}.closeAllDialogs(); ${P}.actions.setMode('manage'); 1`);
      await assertAlive(app, 'copy');
    },
  },
  {
    ids: ['FMT-PDF-ERROR'],
    group: 'PDF', name: '미리 보기 패널·필름스트립도 깨진 PDF의 이유와 복사 단추를 보여 준다',
    run: async (app) => {
      await watch(app);
      await open(app, dir(app, 'pdf-bad'));
      const file = await pathOf(app, 'garbage.pdf');
      await app.main.eval(`${P}.actions.showRightTab('preview'); ${P}.actions.setSelection(${js([file])}, ${js(file)}); 1`);
      await app.main.waitFor(`document.querySelector('.preview-pane .error-panel')?.textContent.includes('garbage.pdf')`, { timeout: 20000, message: 'preview pane error' });
      assert.equal(await app.main.eval(`document.querySelectorAll('.preview-pane .error-panel .btn').length`), 2);
      const before = await app.main.eval(`${P}.app.settings.view`);
      await app.main.eval(`${P}.app.settings.view = 'filmstrip'; ${P}.fileList.rebuild(); 1`);
      await app.main.waitFor(`document.querySelector('.film-preview .error-panel')?.textContent.includes('garbage.pdf')`, { timeout: 20000, message: 'filmstrip error' });
      await app.main.eval(`${P}.app.settings.view = ${js(before)}; ${P}.fileList.rebuild(); ${P}.actions.showRightTab('properties'); 1`);
      await assertAlive(app, 'panes');
    },
  },
  {
    ids: ['FMT-PDF', 'FMT-PDF-ERROR'],
    group: 'PDF', name: '실제 마우스로: 정상·손상 PDF가 섞인 폴더에서 하나씩 클릭하고 두 번 클릭해 본다',
    run: async (app) => {
      await watch(app);
      await open(app, dir(app, 'pdf-mixed'));
      const names = await app.main.eval(`${P}.app.state.list.filter((i) => !i.isDir).map((i) => i.name)`);
      assert.ok(names.length >= 14, `${names.length} files`);
      for (const name of names) {
        const file = await pathOf(app, name);
        await app.main.eval(`${P}.fileList.scrollIntoView(${js(file)}); 1`); // only tiles near the view exist
        await sleep(150);
        const box = await app.main.eval(`(() => { const e = [...document.querySelectorAll('.filelist *')].find((n) => n.children.length === 0 && n.textContent === ${js(name)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top - 20 }; })()`);
        assert.ok(box, `${name} on screen`);
        await app.main.realClick(box.x, box.y);
        await app.main.waitFor(`${P}.app.state.focus === ${js(file)}`, { message: `${name}: selected by a click` });
        await assertAlive(app, `${name} selected`);
        await app.main.realClick(box.x, box.y, { clickCount: 2 });
        await app.main.waitFor(`${P}.app.state.mode === 'view' && ${P}.viewer.currentPath === ${js(file)} && ['pdf', 'error'].includes(${P}.viewer.debug().kind)`, { timeout: 30000, message: `${name}: opened by a double click` });
        await assertAlive(app, `${name} opened`);
        assert.equal(await app.main.eval(`Boolean(${P}.dq('#error-dialog'))`), false, `${name}: shown in place, no error window on top`);
        await app.main.eval(`${P}.actions.setMode('manage'); 1`);
      }
    },
  },
  {
    ids: ['FMT-PDF', 'FMT-PDF-ERROR'],
    group: 'PDF', name: '보기에서 빠르게 넘기고 쪽을 바꿔도 앱이 살아 있고 마지막 파일이 보인다',
    run: async (app) => {
      await watch(app);
      await open(app, dir(app, 'pdf-mixed'));
      const first = await pathOf(app, 'bad-content.pdf');
      await app.main.eval(`${P}.actions.viewItem(${js(first)}); 1`);
      for (let i = 0; i < 40; i++) {
        await app.main.key(i % 7 === 6 ? 'ArrowLeft' : 'ArrowRight');
        await app.main.key('PageDown', 2);
        await sleep(30);
      }
      await app.main.waitFor(`['pdf', 'error'].includes(${P}.viewer.debug().kind)`, { timeout: 30000, message: 'the last file is shown' });
      await assertAlive(app, 'fast browsing');
      await app.main.eval(`${P}.actions.setMode('manage'); 1`);
    },
  },
  {
    ids: ['FMT-PDF'],
    group: 'PDF', name: `큰 PDF (${BIG_MB.join('·')} MB): 파일 내용을 숫자 배열로 넘기면 150 MB에서 화면이 죽었다`,
    run: async (app) => {
      await watch(app);
      await open(app, dir(app, 'pdf-big'));
      for (const mb of BIG_MB) {
        const name = `big-${String(mb).padStart(4, '0')}.pdf`;
        assert.equal(await thumb(app, name, 180000), '1190x1684', `${mb} MB thumbnail`);
        await assertAlive(app, `${mb} MB thumbnail`);
        const shown = await view(app, name, 180000);
        assert.deepEqual([shown.kind, shown.pages, shown.error], ['pdf', 3, null], `${mb} MB shown`);
        await assertAlive(app, `${mb} MB shown`);
        await app.main.eval(`${P}.actions.setMode('manage'); 1`);
      }
    },
  },
  {
    ids: ['APP-CRASH'],
    group: '오류 보고', name: '화면 프로세스가 죽으면: 앱은 남고 화면을 다시 불러와 원인을 복사할 수 있는 창으로 보여 준다',
    run: async (app) => {
      await watch(app);
      await open(app, dir(app, 'pdf-ok'));
      await thumb(app, 'text.pdf');
      const file = await pathOf(app, 'text.pdf');
      await view(app, 'text.pdf');
      app.main.send('Page.crash', {}, 1000);
      await sleep(2500);
      assert.equal(app.process.exitCode, null, 'the program is still running');
      app.crashes = 0;
      await reattach(app);
      const text = await errorWindowText(app);
      assert.ok(text.includes('MyPhotoManager'), `says which program:\n${text}`);
      assert.match(text, /ProcessFailedKind/, 'says what failed');
      assert.ok(text.includes(file), `names the file last read:\n${text}`);
      // The copy button copies the whole report (recorded, so the user's clipboard stays as it is).
      await app.main.eval(`(() => { const area = ${P}.dq('#error-dialog textarea'); const doc = area.ownerDocument; doc.execCommand = () => { window.__copied = area.value.slice(area.selectionStart, area.selectionEnd); return true; }; ${P}.dq('#error-dialog .error-actions .btn').click(); return 1; })()`);
      await app.main.waitFor(`window.__copied && !${P}.dq('#error-dialog .error-copied').hidden`, { message: 'copied' });
      assert.equal(await app.main.eval('window.__copied'), text, 'the copy button copies all of it');
      assert.equal(await app.main.eval(`${P}.app.state.source.type`), 'welcome', 'the folder stays closed so it cannot kill the page again');
      await app.main.eval(`${P}.closeAllDialogs(); 1`);
      assert.equal(fs.existsSync(path.join(app.data, 'crash.log')), false, 'reported once');
      assert.ok(fs.readFileSync(path.join(app.data, 'crash-history.log'), 'utf8').includes(file), 'kept for later');
      await open(app, dir(app, 'plain'));
      await assertAlive(app, 'after the crash');
    },
  },
  {
    ids: ['APP-CRASH'],
    group: '오류 보고', name: '화면이 응답하지 않으면: 다시 불러오고 내용을 보여 준다',
    run: async (app) => {
      await watch(app);
      await open(app, dir(app, 'plain'));
      await app.main.eval('setTimeout(() => { for (;;); }, 0); 1');
      for (let i = 0; i < 60; i++) {
        await sleep(1000);
        const answer = await app.main.send('Runtime.evaluate', { expression: `(document.body.classList.contains('ready') && Boolean(window.__myphoto.dq('#error-dialog textarea')?.value))`, returnByValue: true }, 1000);
        if (answer.result?.result?.value === true || app.main.closed) break;
      }
      app.crashes = 0; // the hung page's process was ended on purpose
      await reattach(app);
      const text = await errorWindowText(app);
      assert.match(text, /응답하지 않아|stopped responding/, text);
      await app.main.eval(`${P}.closeAllDialogs(); 1`);
      await open(app, dir(app, 'plain'));
      await assertAlive(app, 'after the hang');
    },
  },
  {
    ids: ['APP-CRASH'],
    group: '오류 보고', name: 'Rust 패닉: 앱이 계속 돌면 바로 복사할 수 있는 창이 뜨고 다음 실행에 다시 나오지 않는다',
    run: async (app) => {
      await watch(app);
      await app.main.eval(`window.__TAURI_INTERNALS__.invoke('test_crash', { kind: 'panic' }); 1`);
      const text = await errorWindowText(app);
      assert.match(text, /test panic/, text);
      assert.match(text, /panicked at/, text);
      assert.equal(fs.existsSync(path.join(app.data, 'crash.log')), false, 'already reported');
      await app.main.eval(`${P}.closeAllDialogs(); 1`);
      await assertAlive(app, 'after the panic');
    },
  },
  {
    ids: ['APP-CRASH'],
    group: '오류 보고', name: '프로그램 자체가 죽으면(메모리 접근 오류): 기록이 남고 다음 실행에 복사할 수 있는 창으로 보여 준다',
    run: async (app) => {
      await watch(app);
      const pid = app.process.pid;
      await app.main.eval(`window.__TAURI_INTERNALS__.invoke('test_crash', { kind: 'native' }).catch(() => 1); 1`).catch(() => {});
      await Promise.race([app.exited, sleep(30000)]);
      assert.notEqual(app.process.exitCode, null, 'the program ended');
      const log = fs.readFileSync(path.join(app.data, 'crash.log'), 'utf8');
      if (process.platform === 'win32') assert.match(log, /Exception 0xC0000005/, log);
      // The dump Windows may write for this very process is not the user's concern.
      fs.rmSync(path.join(os.homedir(), 'AppData', 'Local', 'CrashDumps', `myphotomanager.exe.${pid}.dmp`), { force: true });
      app.main.close();
      await app.launch([]);
      await watch(app);
      const text = await errorWindowText(app);
      assert.match(text, /Exception 0xC0000005/, text);
      await app.main.eval(`${P}.closeAllDialogs(); 1`);
      await app.restart([dir(app, 'plain')]);
      assert.equal(await app.main.eval(`Boolean(${P}.dq('#error-dialog'))`), false, 'one report only');
    },
  },
];
