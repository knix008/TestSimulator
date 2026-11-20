// End-to-end cases against the running app. Each case gets the started `App`
// (see harness.mjs) and throws on failure. Files go to a temporary folder.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MAGIC = {
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8,
  png: (b) => b.subarray(1, 4).toString() === 'PNG',
  gif: (b) => b.subarray(0, 4).toString() === 'GIF8',
  tiff: (b) => ['II*\0', 'MM\0*'].includes(b.subarray(0, 4).toString('latin1')),
  bmp: (b) => b.subarray(0, 2).toString() === 'BM',
  webp: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
  avif: (b) => b.subarray(4, 12).toString() === 'ftypavif',
  mp4: (b) => b.subarray(4, 8).toString() === 'ftyp',
  webm: (b) => b.readUInt32BE(0) === 0x1a45dfa3,
};

let ffprobeAvailable;
function probe(file) {
  if (ffprobeAvailable === undefined) {
    try { execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); ffprobeAvailable = true; } catch { ffprobeAvailable = false; }
  }
  if (!ffprobeAvailable) return null;
  const json = execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries',
    'format=duration:stream=codec_type,codec_name,width,height,nb_read_frames', '-of', 'json', file]).toString();
  const info = JSON.parse(json);
  return {
    duration: Number(info.format?.duration),
    video: info.streams.find((s) => s.codec_type === 'video'),
    audio: info.streams.find((s) => s.codec_type === 'audio'),
  };
}

function checkFile(app, extension) {
  const file = app.newestFile(`.${extension}`);
  assert.ok(file, `no .${extension} file was written`);
  const bytes = fs.readFileSync(file);
  assert.ok(bytes.length > 100, `${file} is too small (${bytes.length} bytes)`);
  assert.ok(MAGIC[extension](bytes), `${file} is not a ${extension.toUpperCase()} file`);
  return { file, bytes };
}

const countFiles = (app, extension) => fs.readdirSync(app.output).filter((name) => name.toLowerCase().endsWith(extension)).length;
const pngFiles = (app) => countFiles(app, '.png');
const webmFiles = (app) => countFiles(app, '.webm');

const pngSize = (bytes) => [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];

/** Windows display affinity of the main window: '17' = left out of captures, '0' = capturable. */
function displayAffinity(app) {
  const script = `Add-Type 'using System;using System.Runtime.InteropServices;public static class A{[DllImport("user32.dll")]public static extern bool GetWindowDisplayAffinity(IntPtr h,out uint a);}';$p=Get-Process -Id ${app.process.pid};$a=0;[void][A]::GetWindowDisplayAffinity($p.MainWindowHandle,[ref]$a);$a`;
  return execFileSync('powershell.exe', ['-NoProfile', '-Command', script]).toString().trim();
}

/** True when the image (a data-URL expression evaluated in the main window) is not one flat colour. */
function hasContent(app, dataUrlExpression) {
  return app.main.eval(`(async () => {
    const image = new Image();
    image.src = await ${dataUrlExpression};
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, 64, 64);
    const data = context.getImageData(0, 0, 64, 64).data;
    let min = 255, max = 0;
    for (let i = 0; i < data.length; i += 4) { const l = (data[i] + data[i + 1] + data[i + 2]) / 3; min = Math.min(min, l); max = Math.max(max, l); }
    return max - min > 40;
  })()`);
}

async function capture(app) {
  await app.clearNotice();
  await app.main.click('[data-action="capture"]');
  const notice = await app.notice();
  assert.equal(notice.kind, 'success', notice.text);
  return notice;
}

/** Records for `seconds` with the current settings and returns the saved file. */
async function record(app, extension, seconds, { pauseFor = 0 } = {}) {
  await app.clearNotice();
  await app.main.click('[data-action="record"]');
  await app.main.waitFor(`window.__mycapture.state.session.phase === 'recording' || window.__mycapture.state.notice?.kind === 'error'`, { timeout: 20000 });
  const phase = await app.main.eval(`window.__mycapture.state.session.phase`);
  assert.equal(phase, 'recording', await app.main.eval(`window.__mycapture.state.notice?.text ?? ''`));
  await sleep(seconds * 1000);
  if (pauseFor) {
    await app.main.click('[data-action="pause"]');
    await sleep(pauseFor * 1000);
    await app.main.click('[data-action="resume"]');
    await sleep(1000);
  }
  await app.main.eval(`window.__mycapture.actions.stop(); 1`);
  const notice = await app.notice(30000);
  assert.equal(notice.kind, 'success', notice.text);
  return checkFile(app, extension);
}

async function dragOverlay(app, from, to) {
  await app.main.waitFor(`window.__mycapture.state.busy`, { timeout: 5000 });
  const overlay = await app.page((target) => target.id !== app.main.target.id, 15000);
  const page = await overlay.open();
  await page.waitFor(`document.querySelector('canvas')?.width > 1`, { timeout: 15000 });
  await sleep(300);
  if (to) {
    await page.mouse('mousePressed', from.x, from.y);
    await page.mouse('mouseMoved', (from.x + to.x) / 2, (from.y + to.y) / 2);
    await page.mouse('mouseMoved', to.x, to.y);
    await page.mouse('mouseReleased', to.x, to.y);
  } else {
    await page.key('Escape');
  }
  page.close();
}

/** Controls that lie outside the window or are covered (scrolling lists only need to be reachable). */
const AUDIT = `(() => {
  const bad = [];
  for (const el of document.querySelectorAll('button, select, input[type=range], input[type=search], input[type=color], [data-resize]')) {
    if (el.closest('[hidden]')) continue;
    const scroller = el.closest('.source-body, .history-list');
    if (scroller && el !== scroller) continue;
    if (getComputedStyle(el).visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const name = el.dataset.action ?? el.dataset.select ?? el.dataset.input ?? el.dataset.custom ?? el.className;
    if (r.left < 0 || r.top < 0 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) { bad.push('outside ' + name); continue; }
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hit || !(el === hit || el.contains(hit) || hit.closest('label')?.contains(el))) bad.push('covered ' + name);
  }
  return bad;
})()`;

const SETTINGS_TABS = ['general', 'capture', 'record', 'mic', 'save', 'theme', 'start'];

export const cases = [
  {
    name: '앱 시작 · 디스플레이 목록과 미리보기',
    run: async (app) => {
      await app.reset({ mode: 'capture', target: 'monitor', monitorId: null });
      const monitors = await app.main.eval(`document.querySelectorAll('.item[data-action="monitor"]').length`);
      assert.ok(monitors >= 2, `expected "all screens" + at least one display, got ${monitors}`);
      await app.main.waitFor(`document.querySelector('#preview-still img')?.naturalWidth > 0`, { message: 'preview image' });
      assert.deepEqual(JSON.parse(await app.main.eval(`JSON.stringify([...document.querySelectorAll('.brand span')].map((span) => span.textContent.trim()))`)), ['MyCapture', 'v1.0.2'], 'name and version in the title bar');
      assert.equal(await app.main.eval(`document.title`), 'MyCapture v1.0.2');
    },
  },
  {
    name: '메인 창은 평소 다른 캡처 프로그램으로 찍을 수 있음 (content protection 꺼짐)',
    run: async (app) => {
      if (process.platform !== 'win32') return;
      assert.equal(displayAffinity(app), '0', 'WDA_NONE: other capture tools can capture MyCapture');
    },
  },
  {
    name: '자기 자신 캡처 · 툴바의 MyCapture 창 모드를 켜고 캡처 (창 크기 그대로)',
    run: async (app) => {
      await app.reset({ mode: 'capture', target: 'monitor', monitorId: null, imageFormat: 'png', selfMode: false });
      await app.clearNotice();
      await app.main.click('[data-action="self-mode"]');
      assert.equal(await app.main.eval(`document.querySelector('[data-action="self-mode"]').getAttribute('aria-pressed')`), 'true', 'the toolbar toggle is on');
      await app.main.click('[data-action="capture"]');
      const notice = await app.notice();
      assert.equal(notice.kind, 'success', notice.text);
      const { bytes } = checkFile(app, 'png');
      // Exactly the content: no invisible resize border, no desktop around the corners.
      const size = await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|inner_size', { label: 'main' })`);
      const [width, height] = pngSize(bytes);
      assert.deepEqual([width, height], [size.width, size.height], 'image size = window content size');
      assert.ok(await hasContent(app, `window.__mycapture.state.result.thumbnail`), 'the picture shows the window, not a blank frame');
      if (process.platform === 'win32') assert.equal(displayAffinity(app), '0', 'still capturable by other programs after capturing itself');
    },
  },
  {
    name: '자기 자신 녹화 · MyCapture 창을 동영상으로 (선택 창 없이, 창은 그대로)',
    run: async (app) => {
      // The picker engine is selected: recording itself still needs no picker.
      await app.reset({ mode: 'record', engine: 'display', target: 'monitor', videoFormat: 'webm', microphone: false, selfMode: true });
      await app.clearNotice();
      await app.main.click('[data-action="record"]');
      await app.main.waitFor(`window.__mycapture.state.session.phase === 'recording' || window.__mycapture.state.notice?.kind === 'error'`, { timeout: 20000 });
      assert.equal(await app.main.eval(`window.__mycapture.state.session.phase`), 'recording', await app.main.eval(`window.__mycapture.state.notice?.text ?? ''`));
      assert.equal(await app.main.eval(`document.querySelector('#preview-caption b').textContent`), await app.main.eval(`window.__mycapture.t('source.self')`));
      assert.equal(await app.main.eval(`document.querySelector('#live').hidden`), true, 'no live preview: it would record itself recording (a shaking tunnel)');
      if (process.platform === 'win32') assert.equal(displayAffinity(app), '0', 'visible to capture while recording itself');
      await sleep(2500);
      assert.equal(await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|is_minimized', { label: 'main' })`), false, 'the window stays up');
      assert.ok(await hasContent(app, `(() => { const v = document.querySelector('#live'); const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0); return c.toDataURL(); })()`), 'recorded frames show the window');
      await app.main.eval(`window.__mycapture.actions.stop(); 1`);
      const notice = await app.notice(30000);
      assert.equal(notice.kind, 'success', notice.text);
      const { file } = checkFile(app, 'webm');
      const info = probe(file);
      if (info) {
        const size = await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|inner_size', { label: 'main' })`);
        assert.ok(Math.abs(info.video.width - size.width) <= 1, `video ${info.video.width} wide, window content ${size.width}`);
      }
      if (process.platform === 'win32') assert.equal(displayAffinity(app), '0', 'capturable by other programs after the recording');
    },
  },
  {
    name: '모든 화면 캡처 → JPG 저장, 캡처 뒤 창이 다시 보임',
    run: async (app) => {
      await app.reset({ mode: 'capture', target: 'monitor', monitorId: null, imageFormat: 'jpg' });
      await capture(app);
      checkFile(app, 'jpg');
      const visible = await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', { label: 'main' })`);
      assert.equal(visible, true, 'main window must be shown again after the capture');
    },
  },
  ...['png', 'gif', 'tiff', 'bmp', 'webp', 'avif'].map((format) => ({
    name: `디스플레이 캡처 → ${format.toUpperCase()} 저장`,
    run: async (app) => {
      const id = await app.main.eval(`window.__mycapture.state.monitors[0].id`);
      await app.reset({ mode: 'capture', target: 'monitor', monitorId: id, imageFormat: format });
      await capture(app);
      const { bytes } = checkFile(app, format);
      if (format === 'png') {
        const monitor = await app.main.eval(`window.__mycapture.state.monitors[0]`);
        assert.deepEqual(pngSize(bytes), [monitor.width, monitor.height]);
      }
    },
  })),
  {
    name: '클립보드로 복사 · 다른 형식으로 저장 (AVIF ↔ PNG, 기록 · 보기 · 방금 캡처)',
    run: async (app) => {
      if (process.platform !== 'win32') return;
      // Size of the bitmap on the clipboard (STA PowerShell), e.g. "1920x1200".
      const clipboardImage = () => execFileSync('powershell.exe', ['-NoProfile', '-STA', '-Command',
        'Add-Type -AssemblyName System.Windows.Forms; $i = [Windows.Forms.Clipboard]::GetImage(); if ($i) { \'{0}x{1}\' -f $i.Width, $i.Height }']).toString().trim();
      const clearClipboard = () => execFileSync('powershell.exe', ['-NoProfile', '-STA', '-Command', 'Set-Clipboard -Value " "']);
      await app.reset();
      const monitor = await app.main.eval(`window.__mycapture.state.monitors[0]`);
      const size = `${monitor.width}x${monitor.height}`;
      await app.reset({ mode: 'capture', target: 'monitor', monitorId: monitor.id, imageFormat: 'avif' });
      await capture(app);
      const { file: avif } = checkFile(app, 'avif');

      // The last capture, from the button next to the shutter.
      clearClipboard();
      await app.clearNotice();
      await app.main.click('[data-action="copy-last"]');
      assert.equal((await app.notice()).kind, 'success');
      assert.equal(clipboardImage(), size, 'last capture on the clipboard');

      // An AVIF file from the history (decoded by the webview): tile button and viewer button.
      const id = await app.main.eval(`window.__mycapture.state.gallery.at(-1).id`);
      clearClipboard();
      await app.clearNotice();
      await app.main.click(`[data-action="gallery-copy"][data-value="${id}"]`);
      assert.equal((await app.notice()).kind, 'success');
      assert.equal(clipboardImage(), size, 'AVIF from the history on the clipboard');
      await app.main.click(`[data-action="gallery-open"][data-value="${id}"]`);
      await app.main.waitFor(`document.querySelector('#viewer [data-viewer="copy"]') && document.querySelector('#viewer [data-viewer="save-as"]')`, { message: 'viewer copy / save-as buttons' });
      clearClipboard();
      await app.clearNotice();
      await app.main.click('#viewer [data-viewer="copy"]');
      assert.equal((await app.notice()).kind, 'success');
      assert.equal(clipboardImage(), size, 'copied from the viewer');
      await app.main.eval(`document.querySelector('#viewer [data-viewer="close"]').click(); 1`);

      // Save as: AVIF → PNG (webview pixels) and PNG → WEBP / JPG (Rust reads the file).
      const output = JSON.stringify(app.output);
      const png = JSON.parse(await app.main.eval(`window.__mycapture.files.saveImageAs(${JSON.stringify(avif)}, { kind: 'folder', directory: ${output}, stem: 'from-avif' }, 'png', 90).then(JSON.stringify)`));
      const pngBytes = fs.readFileSync(png.path);
      assert.ok(MAGIC.png(pngBytes), 'AVIF saved as PNG');
      assert.deepEqual(pngSize(pngBytes), [monitor.width, monitor.height]);
      for (const format of ['webp', 'jpg', 'gif', 'avif']) {
        const saved = JSON.parse(await app.main.eval(`window.__mycapture.files.saveImageAs(${JSON.stringify(png.path)}, { kind: 'folder', directory: ${output}, stem: 'from-png' }, '${format}', 85).then(JSON.stringify)`));
        assert.ok(MAGIC[format](fs.readFileSync(saved.path)), `PNG saved as ${format.toUpperCase()}`);
      }
      // The context menu of an image entry offers both.
      const labels = await app.main.eval(`(() => { const s = window.__mycapture; return [s.t('menu.copyImage'), s.t('menu.saveAs')].join('|'); })()`);
      assert.equal(labels, '이미지를 클립보드로 복사|다른 형식으로 저장…');
    },
  },
  {
    name: '창 목록 · 썸네일 · 창 캡처',
    run: async (app) => {
      await app.reset({ mode: 'capture', target: 'window', imageFormat: 'png' });
      await app.main.waitFor(`document.querySelectorAll('.item[data-action="window"]').length > 0`, { message: 'window list' });
      await app.main.waitFor(`document.querySelector('.item[data-action="window"] img')`, { message: 'window thumbnail' });
      await app.main.click('.item[data-action="window"]');
      await capture(app);
      checkFile(app, 'png');
    },
  },
  {
    name: '영역 선택 오버레이 → 드래그한 크기 그대로 저장',
    run: async (app) => {
      await app.reset({ mode: 'capture', target: 'region', imageFormat: 'png', region: null });
      const scale = await app.main.eval(`window.__mycapture.state.monitors[0].scaleFactor`);
      await app.clearNotice();
      await app.main.click('[data-action="capture"]');
      await dragOverlay(app, { x: 120, y: 140 }, { x: 420, y: 340 });
      const notice = await app.notice();
      assert.equal(notice.kind, 'success', notice.text);
      const { bytes } = checkFile(app, 'png');
      const [width, height] = pngSize(bytes);
      assert.ok(Math.abs(width - 300 * scale) <= 2 && Math.abs(height - 200 * scale) <= 2, `got ${width}×${height}`);
      const pages = await app.otherPages();
      assert.equal(pages.length, 0, 'overlays must close');
    },
  },
  {
    name: '영역 선택 Esc 취소',
    run: async (app) => {
      await app.reset({ mode: 'capture', target: 'region' });
      await app.main.click('[data-action="select-region"]');
      await dragOverlay(app, null, null);
      await app.main.waitFor(`window.__mycapture.state.busy === null && (window.__mycapture.state.notice?.text ?? '').includes('취소')`);
    },
  },
  {
    name: '같은 영역 다시 캡처',
    run: async (app) => {
      const monitor = await app.main.eval(`window.__mycapture.state.monitors[0]`);
      await app.reset({ mode: 'capture', target: 'region', imageFormat: 'png', region: { monitorId: monitor.id, x: 10, y: 20, width: 201, height: 99 } });
      await app.clearNotice();
      await app.main.click('[data-action="recapture-region"]');
      const notice = await app.notice();
      assert.equal(notice.kind, 'success', notice.text);
      assert.deepEqual(pngSize(checkFile(app, 'png').bytes), [201, 99]);
    },
  },
  {
    name: '녹화 · 앱 대상 · MP4',
    run: async (app) => {
      await app.reset({ mode: 'record', engine: 'native', target: 'monitor', videoFormat: 'mp4', microphone: false });
      const { file } = await record(app, 'mp4', 3);
      const info = probe(file);
      if (info) {
        assert.equal(info.video.codec_name, 'h264');
        assert.ok(Math.abs(info.duration - 3) < 1.2, `duration ${info.duration}`);
      }
    },
  },
  {
    name: '녹화 · 앱 대상 · WebM · 일시정지 시간 제외',
    run: async (app) => {
      await app.reset({ mode: 'record', engine: 'native', target: 'monitor', videoFormat: 'webm', microphone: false });
      const { file } = await record(app, 'webm', 2, { pauseFor: 2 });
      const info = probe(file);
      if (info) {
        assert.ok(['vp8', 'vp9'].includes(info.video.codec_name));
        assert.ok(Math.abs(info.duration - 3) < 1.2, `duration ${info.duration} should exclude the 2 s pause`);
      }
    },
  },
  {
    name: '녹화 · 영역 · 짝수 크기로 인코딩',
    run: async (app) => {
      const monitor = await app.main.eval(`window.__mycapture.state.monitors[0]`);
      await app.reset({ mode: 'record', engine: 'native', target: 'region', videoFormat: 'mp4', region: { monitorId: monitor.id, x: 0, y: 0, width: 321, height: 241 } });
      const { file } = await record(app, 'mp4', 2);
      const info = probe(file);
      if (info) assert.deepEqual([info.video.width, info.video.height], [320, 240]);
    },
  },
  {
    name: '녹화 · 시스템 선택 창 · 마이크 오디오 포함',
    run: async (app) => {
      await app.reset({ mode: 'record', engine: 'display', target: 'monitor', videoFormat: 'mp4', microphone: true, systemAudio: false });
      const { file } = await record(app, 'mp4', 3);
      const info = probe(file);
      if (info) assert.ok(info.audio, 'an audio track (microphone) is expected');
    },
  },
  {
    name: '전체 화면 녹화 · 작은 제어판에서 일시정지·정지',
    run: async (app) => {
      await app.reset({ mode: 'record', engine: 'native', target: 'monitor', videoFormat: 'webm', microphone: false });
      await app.clearNotice();
      await app.main.click('[data-action="record"]');
      const panel = await (await app.page((target) => target.id !== app.main.target.id, 15000)).open();
      await panel.waitFor(`(() => { const time = document.querySelector('.recbar-time')?.textContent; return Boolean(time) && time !== '00:00'; })()`, { message: 'panel clock' });
      await panel.waitFor(`document.querySelector('[data-command="pause"]')`);
      await panel.click('[data-command="pause"]');
      await app.main.waitFor(`window.__mycapture.state.session.phase === 'paused'`);
      await panel.waitFor(`document.querySelector('[data-command="resume"]')`);
      await panel.click('[data-command="resume"]');
      await app.main.waitFor(`window.__mycapture.state.session.phase === 'recording'`);
      await sleep(800);
      await panel.click('[data-command="stop"]');
      panel.close();
      const notice = await app.notice(30000);
      assert.equal(notice.kind, 'success', notice.text);
      checkFile(app, 'webm');
      await app.main.waitFor(`(async () => (await window.__TAURI_INTERNALS__.invoke('plugin:window|is_minimized', { label: 'main' })) === false)()`, { message: 'main window restored' });
      assert.equal((await app.otherPages()).length, 0, 'recording controls must close');
    },
  },
  {
    name: '마이크 탭 · 레벨 미터 · 테스트 녹음 (설정 창)',
    run: async (app) => {
      await app.reset({ mode: 'record' });
      await app.main.click('[data-action="open-mic"]');
      const settings = await app.popup('settings');
      await settings.waitFor(`document.querySelector('.tab.active')?.dataset.value === 'mic'`);
      await settings.waitFor(`document.querySelector('[data-select="micDeviceId"]')?.options.length >= 1 && !document.querySelector('.meter-block .hint')?.textContent.includes('…')`);
      await settings.waitFor(`parseFloat(document.querySelector('#meter-fill').style.width) > 0`, { message: 'meter moves with the (fake) microphone' });
      await settings.click('[data-action="mic-test"]');
      await settings.waitFor(`document.querySelector('#mic-playback')?.src.startsWith('blob:')`, { timeout: 10000, message: 'test recording ready' });
      await settings.click('[data-action="close"]');
      settings.close();
    },
  },
  {
    name: '설정 창 · 고정 크기, 모든 탭이 스크롤 없이 다 보임',
    run: async (app) => {
      await app.reset();
      await app.main.click('[data-action="open-settings"]');
      const settings = await app.popup('settings');
      const size = JSON.parse(await settings.eval(`JSON.stringify([innerWidth, innerHeight])`));
      assert.equal(await settings.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|is_resizable', { label: 'popup-settings' })`), false, 'fixed size');
      for (const language of ['ko', 'en']) {
        for (const tab of SETTINGS_TABS) {
          await settings.click(`[data-action="settings-tab"][data-value="${tab}"]`);
          await sleep(tab === 'mic' ? 500 : 150);
          const overflow = await settings.eval(`(() => { const b = document.querySelector('.modal-body'); const bottom = b.getBoundingClientRect().bottom; return Math.max(b.scrollHeight - b.clientHeight, ...[...b.children].map((child) => child.getBoundingClientRect().bottom - bottom - 0.5)); })()`);
          assert.ok(overflow <= 0, `${language}/${tab} overflows by ${Math.ceil(overflow)}px`);
          assert.deepEqual(await settings.eval(AUDIT), [], `${language}/${tab}`);
          assert.deepEqual(JSON.parse(await settings.eval(`JSON.stringify([innerWidth, innerHeight])`)), size, 'size never changes');
        }
        await settings.click('[data-action="settings-tab"][data-value="general"]');
        await settings.click(`[data-action="setting"][data-key="language"][data-value="${language === 'ko' ? 'en' : 'ko'}"]`);
      }
      await settings.click('[data-action="close"]');
      settings.close();
    },
  },
  {
    name: '한국어 ↔ English 전환 (국기 버튼)',
    run: async (app) => {
      await app.reset({ language: 'ko' });
      assert.equal(await app.main.eval(`document.querySelector('[data-action="mode"][data-value="capture"]').textContent.trim()`), '이미지 캡처');
      assert.ok(await app.main.eval(`document.querySelector('.flag-button svg [fill="#012169"]') !== null`), 'UK flag while Korean');
      await app.main.click('[data-action="language"]');
      assert.equal(await app.main.eval(`document.querySelector('[data-action="mode"][data-value="capture"]').textContent.trim()`), 'Screenshot');
      assert.ok(await app.main.eval(`document.querySelector('.flag-button svg circle[fill="#cd2e3a"]') !== null`), 'Korean flag while English');
      const error = await app.main.eval(`window.__TAURI_INTERNALS__.invoke('save_pending', { output: { kind: 'folder', directory: 'x', stem: 'x' }, format: 'heic' }).catch((e) => String(e))`);
      assert.match(error, /Unsupported image format/, 'backend messages follow the language');
      await app.main.click('[data-action="language"]');
    },
  },
  {
    name: '왼쪽 패널 접기 · 펼치기 (아이콘과 제목 표시)',
    run: async (app) => {
      await app.reset({ sidebarCollapsed: false });
      await app.main.click('#sources [data-action="sidebar"]');
      assert.ok(await app.main.eval(`document.querySelector('#body').classList.contains('left-collapsed') && document.querySelector('#sources .rail .rail-icon') && document.querySelector('.rail-title').textContent.length > 0`));
      assert.ok(await app.main.eval(`document.querySelector('#sources').getBoundingClientRect().width <= 30`), 'collapsed to a slim strip');
      assert.ok(await app.main.eval(`document.querySelector('#sources .rail svg path[d*="M13.5 9l3 3-3 3"]') !== null`), 'expand icon: panel with an arrow');
      await app.main.click('#sources .rail');
      assert.ok(await app.main.eval(`!document.querySelector('#body').classList.contains('left-collapsed') && document.querySelector('#sources h2 svg')`));
    },
  },
  {
    name: '타이틀바 · 좌우 패널 접기 버튼 (눌림 상태 · 기억)',
    run: async (app) => {
      await app.reset({ sidebarCollapsed: false, historyCollapsed: false });
      const state = () => app.main.eval(`JSON.stringify({
        left: document.querySelector('#body').classList.contains('left-collapsed'),
        right: document.querySelector('#body').classList.contains('right-collapsed'),
        leftPressed: document.querySelector('#bar [data-action="sidebar"]').getAttribute('aria-pressed'),
        rightPressed: document.querySelector('#bar [data-action="history-panel"]').getAttribute('aria-pressed'),
        stored: JSON.parse(localStorage.getItem('mycapture.settings.v1')),
      })`).then(JSON.parse);
      let now = await state();
      assert.deepEqual([now.left, now.right, now.leftPressed, now.rightPressed], [false, false, 'true', 'true']);
      await app.main.click('#bar [data-action="sidebar"]');
      now = await state();
      assert.deepEqual([now.left, now.right, now.leftPressed, now.stored.sidebarCollapsed], [true, false, 'false', true], 'left panel collapsed from the title bar');
      await app.main.click('#bar [data-action="history-panel"]');
      now = await state();
      assert.deepEqual([now.left, now.right, now.rightPressed, now.stored.historyCollapsed], [true, true, 'false', true], 'right panel collapsed from the title bar');
      // The preview takes the room.
      assert.ok(await app.main.eval(`document.querySelector('#stage').getBoundingClientRect().width > innerWidth - 120`), 'preview fills the window');
      await app.main.click('#bar [data-action="sidebar"]');
      await app.main.click('#bar [data-action="history-panel"]');
      now = await state();
      assert.deepEqual([now.left, now.right, now.leftPressed, now.rightPressed], [false, false, 'true', 'true']);
      // The tooltips name what the button does next.
      assert.equal(await app.main.eval(`document.querySelector('#bar [data-action="sidebar"]').title`), '왼쪽 패널(대상) 접기');
    },
  },
  {
    name: '시작 화면 · 카드 보드, 빠른 시작, 테마 카드 없음, 시작할 때 표시',
    run: async (app) => {
      await app.reset({ showStartScreen: true, theme: 'light-classic' });
      await app.main.waitFor(`!document.querySelector('#start-page').hidden && document.querySelectorAll('.start-card').length === 5`, { message: 'start screen at startup' });
      assert.ok(await app.main.eval(`getComputedStyle(document.querySelector('#toolbar')).display === 'none' && getComputedStyle(document.querySelector('#body')).display === 'none'`), 'toolbar and panels hidden');
      assert.equal(await app.main.eval(`document.querySelector('.start-hero .start-version').textContent`), 'v1.0.2');
      assert.equal(await app.main.eval(`document.querySelectorAll('.start-tile').length`), 6, 'six quick-start tiles');
      // Themes are not on the start screen (title bar menu and Settings have them).
      assert.equal(await app.main.eval(`document.querySelectorAll('.start-theme, [data-card="themes"]').length`), 0, 'no themes card');
      // The moving background draws behind the cards.
      const frames = () => app.main.eval(`(() => { const c = document.querySelector('.start-bg-canvas'); return c && c.width > 100 && c.height > 100 ? 1 : 0; })()`);
      assert.equal(await frames(), 1, 'background canvas sized to the page');
      assert.ok(await app.main.eval(`(() => { const c = document.querySelector('.start-bg-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) return true; return false; })()`), 'background has something drawn');
      assert.equal(await app.main.eval(`document.querySelector('#bar [data-action="home"]').getAttribute('aria-pressed')`), 'true');
      // Cards never overlap and the name card is on top.
      const rects = JSON.parse(await app.main.eval(`JSON.stringify([...document.querySelectorAll('.start-card')].map((el) => { const r = el.getBoundingClientRect(); return { id: el.dataset.card, x: r.left, y: r.top, r: r.right, b: r.bottom }; }))`));
      assert.equal(rects[0].id, 'hero');
      assert.ok(rects.every((rect) => rect.id === 'hero' || rect.y >= rects[0].b), 'name card first');
      for (const a of rects) for (const b of rects) if (a.id < b.id) assert.ok(a.r <= b.x + 1 || b.r <= a.x + 1 || a.b <= b.y + 1 || b.b <= a.y + 1, `${a.id} overlaps ${b.id}`);

      // Moving a card: drag the "tips" handle above the quick-start card.
      const handle = JSON.parse(await app.main.eval(`JSON.stringify((() => { const r = document.querySelector('[data-card-handle="tips"]').getBoundingClientRect(); const q = document.querySelector('.start-card-begin').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, tx: q.left + 20, ty: q.top + 4 }; })())`));
      await app.main.mouse('mousePressed', handle.x, handle.y);
      for (let step = 1; step <= 8; step += 1) await app.main.mouse('mouseMoved', handle.x + ((handle.tx - handle.x) * step) / 8, handle.y + ((handle.ty - handle.y) * step) / 8);
      await app.main.mouse('mouseReleased', handle.tx, handle.ty);
      await sleep(300);
      const saved = JSON.parse(await app.main.eval(`localStorage.getItem('mycapture.startLayout.v1')`));
      assert.ok(saved && saved.cards.tips.row < saved.cards.begin.row, `tips moved above quick start: ${JSON.stringify(saved?.cards)}`);
      await app.main.click('[data-action="start-arrange"]');
      const arranged = JSON.parse(await app.main.eval(`localStorage.getItem('mycapture.startLayout.v1')`));
      assert.equal(arranged.flow, 'auto');
      assert.ok(arranged.cards.begin.row < arranged.cards.tips.row, 'auto arrange restores the order');

      // Quick start: record a window → that mode and target, start screen closed.
      await app.main.click('[data-action="start-quick"][data-value="record:window"]');
      assert.deepEqual(JSON.parse(await app.main.eval(`JSON.stringify([window.__mycapture.state.home, window.__mycapture.state.settings.mode, window.__mycapture.state.settings.target, document.querySelector('#start-page').hidden])`)), [false, 'record', 'window', true]);
      // The ⌂ button opens and closes it again; a mode tab also leaves it.
      await app.main.click('#bar [data-action="home"]');
      assert.equal(await app.main.eval(`document.querySelector('#start-page').hidden`), false);
      await app.main.click('[data-action="mode"][data-value="capture"]');
      assert.equal(await app.main.eval(`document.querySelector('#start-page').hidden`), true);
      await app.main.click('#bar [data-action="home"]');
      // "Show at startup" off is remembered; the next start goes straight to capturing.
      await app.main.eval(`(() => { const box = document.querySelector('[data-toggle="showStartScreen"]'); box.click(); return 1; })()`);
      assert.equal(await app.main.eval(`JSON.parse(localStorage.getItem('mycapture.settings.v1')).showStartScreen`), false);
      await app.main.eval(`location.reload(); 1`);
      await sleep(400);
      await app.main.waitFor(`window.__mycapture && document.querySelector('#bar .brand')`);
      assert.equal(await app.main.eval(`document.querySelector('#start-page').hidden`), true, 'not shown at startup any more');
    },
  },
  {
    name: '시작 화면 · 최근 캡처를 누르면 크게 보기',
    run: async (app) => {
      await app.reset({ mode: 'capture', target: 'monitor', monitorId: null });
      await app.main.click('[data-action="capture"]');
      await app.notice(30000);
      await app.main.click('#bar [data-action="home"]');
      await app.main.waitFor(`document.querySelectorAll('.start-recent-item').length === 1`, { message: 'recent capture card' });
      await app.main.click('.start-recent-open');
      await app.main.waitFor(`window.__mycapture.state.viewing && !document.querySelector('#viewer').hidden && document.querySelector('#start-page').hidden`, { message: 'viewer opens' });
    },
  },
  {
    name: '시작 화면 · 배경 설정 (장면 · 움직임 · 속도 · 투명도, 바로 반영)',
    run: async (app) => {
      await app.reset({ showStartScreen: true, theme: 'dark-midnight' });
      await app.main.waitFor(`!document.querySelector('#start-page').hidden && document.querySelector('.start-bg-canvas')?.width > 100`, { message: 'start screen with its background' });
      // A few pixels of the background (alpha only), and the whole picture as a fingerprint.
      const inked = `(() => { const c = document.querySelector('.start-bg-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 53) if (d[i] > 0) n += 1; return n; })()`;
      const picture = `document.querySelector('.start-bg-canvas').toDataURL()`;
      assert.ok(await app.main.eval(inked) > 0, 'the default scene draws');

      // The Background button opens Settings on the Start screen tab.
      await app.main.click('.start-tools [data-action="start-background"]');
      const settings = await app.popup('settings');
      await settings.waitFor(`document.querySelector('.tab.active')?.dataset.value === 'start'`, { message: 'opens on the start screen tab' });
      assert.equal(await settings.eval(`document.querySelectorAll('.start-bg-scene').length`), 24, 'twenty-four scenes');
      assert.equal(await settings.eval(`document.querySelector('.start-bg-scene.current')?.dataset.value`), 'studio');
      assert.equal(await settings.eval(`[...document.querySelectorAll('.start-bg-scene strong')].every((el) => el.textContent.trim() && el.scrollWidth <= el.clientWidth + 1)`), true, 'scene names shown whole');

      // Each scene applies at once, and each looks different.
      const looks = new Map();
      for (const kind of ['region', 'film', 'lens', 'studio']) {
        await settings.click(`.start-bg-scene[data-value="${kind}"]`);
        await app.main.waitFor(`window.__mycapture.state.settings.startBgKind === '${kind}'`, { message: `${kind} reaches the main window` });
        await sleep(150);
        assert.ok(await app.main.eval(inked) > 0, `${kind} draws`);
        looks.set(kind, await app.main.eval(picture));
        assert.equal(await settings.eval(`document.querySelector('.start-bg-scene.current')?.dataset.value`), kind);
      }
      assert.equal(new Set(looks.values()).size, 4, 'four different pictures');

      // Off: an empty canvas (the gradient shows), and the sliders are disabled.
      await settings.click('[data-action="setting"][data-key="startBgMotion"][data-value="off"]');
      await app.main.waitFor(`window.__mycapture.state.settings.startBgMotion === 'off'`);
      await app.main.waitFor(`${inked} === 0`, { message: 'nothing drawn when off' });
      assert.equal(await settings.eval(`[...document.querySelectorAll('[data-input^="startBg"]')].every((input) => input.disabled)`), true, 'sliders disabled when off');
      // Still: a picture that does not move.
      await settings.click('[data-action="setting"][data-key="startBgMotion"][data-value="still"]');
      await app.main.waitFor(`window.__mycapture.state.settings.startBgMotion === 'still' && ${inked} > 0`, { message: 'still picture drawn' });
      const still = await app.main.eval(picture);
      await sleep(600);
      assert.equal(await app.main.eval(picture), still, 'still: the picture does not change');
      // Animated: it moves again.
      await settings.click('[data-action="setting"][data-key="startBgMotion"][data-value="animated"]');
      await app.main.waitFor(`window.__mycapture.state.settings.startBgMotion === 'animated'`);
      const before = await app.main.eval(picture);
      await sleep(500);
      assert.notEqual(await app.main.eval(picture), before, 'animated: the picture changes');

      // Speed and transparency sliders: live while dragging, shown in percent.
      const drag = (key, value) => settings.eval(`(() => { const r = document.querySelector('[data-input="${key}"]'); r.value = '${value}'; r.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await drag('startBgSpeed', 200);
      await app.main.waitFor(`window.__mycapture.state.settings.startBgSpeed === 200`, { message: 'speed reaches the main window while dragging' });
      assert.equal(await settings.eval(`document.querySelector('[data-output="startBgSpeed"]').textContent`), '200%');
      // Twice the speed: the clock runs about twice as fast as real time.
      const t0 = await app.main.eval(`performance.now()`);
      const c0 = await app.main.eval(`window.__mycapture.startBackground().time`);
      await sleep(1000);
      const rate = (await app.main.eval(`window.__mycapture.startBackground().time`) - c0) / ((await app.main.eval(`performance.now()`) - t0) / 1000);
      assert.ok(rate > 1.5 && rate < 2.3, `200% speed runs at ${rate.toFixed(2)}×`);
      await drag('startBgTransparency', 50);
      await app.main.waitFor(`window.__mycapture.state.settings.startBgTransparency === 50 && document.querySelector('.start-bg-canvas').style.opacity === '0.5'`, { message: 'background transparency applied' });
      assert.equal(await settings.eval(`document.querySelector('[data-output="startBgTransparency"]').textContent`), '50%');
      await drag('startCardTransparency', 40);
      await app.main.waitFor(`document.querySelector('.start-inner').style.getPropertyValue('--start-card-alpha') === '60%'`, { message: 'card transparency applied' });
      // Change by itself (Settings).
      await settings.click('[data-action="setting"][data-key="startBgShuffle"][data-value="30"]');
      await app.main.waitFor(`window.__mycapture.state.settings.startBgShuffle === 30`);

      // Reset: back to the defaults.
      await settings.click('[data-action="start-bg-reset"]');
      await app.main.waitFor(`(() => { const s = window.__mycapture.state.settings; return s.startBgKind === 'studio' && s.startBgMotion === 'animated' && s.startBgSpeed === 100 && s.startBgTransparency === 0 && s.startCardTransparency === 15 && s.startBgShuffle === 0; })()`, { message: 'reset to defaults' });
      await settings.click('[data-action="close"]');
      settings.close();

      // Kept after a restart.
      await app.reset({ showStartScreen: true, startBgKind: 'lens', startBgMotion: 'still' });
      await app.main.waitFor(`!document.querySelector('#start-page').hidden && ${inked} > 0`);
      assert.equal(await app.main.eval(`window.__mycapture.startBackground()?.settings().kind`), 'lens');
      assert.equal(await app.main.eval(`window.__mycapture.startBackground()?.running`), false, 'still: not animating');
      // Leaving the start screen stops the background.
      await app.main.click('#bar [data-action="home"]');
      assert.equal(await app.main.eval(`window.__mycapture.startBackground()`), null, 'background gone with the start screen');
      await app.reset({});
    },
  },
  {
    name: '시작 화면 · 움직이는 배경 카드 (장면 24개 · 움직임 · 자동 바꾸기 · 속도 · 투명도, 설정 창과 동기화)',
    run: async (app) => {
      await app.reset({ showStartScreen: true, theme: 'light-classic' });
      await app.main.waitFor(`document.querySelector('.start-card-background .bg-tile')`, { message: 'background card' });
      const inked = `(() => { const c = document.querySelector('.start-bg-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 53) if (d[i] > 0) n += 1; return n; })()`;
      const card = '.start-card-background';
      const current = () => app.main.eval(`[...document.querySelectorAll('${card} .bg-tile.on')].map((el) => el.dataset.value).join()`);
      assert.equal(await app.main.eval(`document.querySelectorAll('${card} .bg-tile').length`), 24, 'twenty-four scene tiles');
      assert.equal(await app.main.eval(`[...document.querySelectorAll('${card} .bg-tile, ${card} [data-action="start-bg-motion"], ${card} .start-slider, ${card} [data-action="start-bg-reset"]')].every((el) => el.querySelector('svg.icon[data-tone]'))`), true, 'every control has a colour icon');
      assert.equal(await current(), 'studio');
      // A tile: the scene changes at once, the tile is marked, the board is not rebuilt.
      await app.main.eval(`document.querySelector('${card}').dataset.mark = 'same'; 1`);
      for (const kind of ['lens', 'film', 'region']) {
        await app.main.click(`${card} .bg-tile[data-value="${kind}"]`);
        await app.main.waitFor(`window.__mycapture.state.settings.startBgKind === '${kind}' && window.__mycapture.startBackground().settings().kind === '${kind}'`, { message: `${kind} chosen on the card` });
        assert.equal(await current(), kind);
      }
      assert.equal(await app.main.eval(`document.querySelector('${card}').dataset.mark`), 'same', 'only the card body was refreshed');
      // Motion: off clears the picture and disables the sliders; animated brings it back.
      await app.main.click(`${card} [data-action="start-bg-motion"][data-value="off"]`);
      await app.main.waitFor(`${inked} === 0`, { message: 'off from the card' });
      // Off: speed and background transparency are off too; card transparency still applies.
      assert.deepEqual(JSON.parse(await app.main.eval(`JSON.stringify([...document.querySelectorAll('${card} input[type=range]')].map((input) => [input.dataset.input, input.disabled]))`)), [['startBgSpeed', true], ['startBgTransparency', true], ['startCardTransparency', false]]);
      await app.main.click(`${card} [data-action="start-bg-motion"][data-value="animated"]`);
      await app.main.waitFor(`${inked} > 0 && window.__mycapture.startBackground().running`, { message: 'animated from the card' });
      // Sliders: live, and the card is not rebuilt under the pointer.
      await app.main.eval(`(() => { const r = document.querySelector('${card} [data-input="startBgSpeed"]'); r.dataset.mark = 'kept'; r.value = '250'; r.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await app.main.waitFor(`window.__mycapture.state.settings.startBgSpeed === 250`);
      await sleep(300);
      assert.equal(await app.main.eval(`document.querySelector('${card} [data-input="startBgSpeed"]').dataset.mark`), 'kept', 'slider element kept while dragging');
      assert.equal(await app.main.eval(`document.querySelector('${card} [data-output="startBgSpeed"]').textContent`), '250%');
      await app.main.eval(`(() => { const r = document.querySelector('${card} [data-input="startBgTransparency"]'); r.value = '30'; r.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await app.main.waitFor(`window.__mycapture.state.settings.startBgTransparency === 30 && document.querySelector('.start-bg-canvas').style.opacity === '0.7'`, { message: 'transparency from the card' });
      await app.main.eval(`(() => { const r = document.querySelector('${card} [data-input="startCardTransparency"]'); r.value = '50'; r.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await app.main.waitFor(`document.querySelector('.start-inner').style.getPropertyValue('--start-card-alpha') === '50%'`, { message: 'card transparency from the card' });
      // Another one: a different scene at random. Change by itself: every 30 s (checked with a short clock below).
      const before = await current();
      await app.main.click(`${card} [data-action="start-bg-random"]`);
      await app.main.waitFor(`[...document.querySelectorAll('${card} .bg-tile.on')].map((el) => el.dataset.value).join() !== '${before}'`, { message: 'another scene' });
      await app.main.click(`${card} [data-action="start-bg-auto"][data-value="30"]`);
      assert.equal(await app.main.eval(`window.__mycapture.state.settings.startBgShuffle`), 30);
      // The clock: nothing before 30 s, a new scene after.
      const shown = await current();
      assert.equal(await app.main.eval(`window.__mycapture.shuffleTick(Date.now() + 10000)`), false, 'not yet at 10 s');
      assert.equal(await app.main.eval(`window.__mycapture.shuffleTick(Date.now() + 31000)`), true, 'changed after 30 s');
      assert.notEqual(await current(), shown, 'a different scene');
      // Still or off: it does not change by itself.
      await app.main.click(`${card} [data-action="start-bg-motion"][data-value="still"]`);
      assert.equal(await app.main.eval(`window.__mycapture.shuffleTick(Date.now() + 999999)`), false, 'no change while still');
      await app.main.click(`${card} [data-action="start-bg-motion"][data-value="animated"]`);

      // Card → Settings: the Settings window shows the card's choices.
      const chosen = await current();
      await app.main.click('.start-tools [data-action="start-background"]');
      const settings = await app.popup('settings');
      await settings.waitFor(`document.querySelector('.start-bg-scene.current')?.dataset.value === '${chosen}' && document.querySelector('[data-output="startBgSpeed"]')?.textContent === '250%' && document.querySelector('[data-output="startCardTransparency"]')?.textContent === '50%'`, { message: 'Settings shows the card choices' });
      assert.equal(await settings.eval(`[...document.querySelectorAll('.start-bg-scene')].every((el) => el.querySelector('svg.icon[data-tone]'))`), true, 'scene buttons in Settings have icons');
      // Settings → card: a change there shows on the card.
      await settings.click('.start-bg-scene[data-value="lens"]');
      await app.main.waitFor(`[...document.querySelectorAll('${card} .bg-tile.on')].map((el) => el.dataset.value).join() === 'lens'`, { message: 'card follows Settings' });
      await settings.click('[data-action="setting"][data-key="startBgMotion"][data-value="still"]');
      await app.main.waitFor(`document.querySelector('${card} [data-action="start-bg-motion"].on')?.dataset.value === 'still'`, { message: 'motion follows Settings' });
      await settings.click('[data-action="close"]');
      settings.close();
      // Reset on the card.
      await app.main.click(`${card} [data-action="start-bg-reset"]`);
      await app.main.waitFor(`(() => { const s = window.__mycapture.state.settings; return s.startBgKind === 'studio' && s.startBgMotion === 'animated' && s.startBgSpeed === 100 && s.startBgTransparency === 0 && s.startCardTransparency === 15 && s.startBgShuffle === 0; })()`, { message: 'reset from the card' });
      assert.equal(await current(), 'studio');
      await app.reset({});
    },
  },
  {
    name: '다른 캡처 프로그램으로 캡처 가능 (시작 화면 · 팝업), 자체 녹화 중에만 제외',
    run: async (app) => {
      if (process.platform !== 'win32') return;
      // The windows of the app process, as Windows sees them: 0 = any program can capture it.
      const windows = () => JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(path.dirname(fileURLToPath(import.meta.url)), 'window-affinity.ps1'), '-ProcessId', String(app.process.pid)]).toString() || '[]');
      await app.reset({ showStartScreen: true });
      await app.main.waitFor(`!document.querySelector('#start-page').hidden`);
      await sleep(300);
      let seen = windows();
      assert.ok(seen.length >= 1, 'main window found');
      assert.deepEqual(seen.map((w) => w.affinity), seen.map(() => 0), `start screen capturable by other programs: ${JSON.stringify(seen)}`);
      // A popup too.
      await app.main.click('[data-action="open-settings"]');
      const settings = await app.popup('settings');
      await sleep(300);
      seen = windows();
      assert.ok(seen.length >= 2, `main and settings windows: ${JSON.stringify(seen)}`);
      assert.ok(seen.every((w) => w.affinity === 0), `settings window capturable: ${JSON.stringify(seen)}`);
      await settings.click('[data-action="close"]');
      settings.close();
      // While MyCapture records a region of the screen (the main window stays on screen),
      // it leaves itself out; afterwards it is capturable again.
      const monitor = await app.main.eval(`window.__mycapture.state.monitors.find((m) => m.primary) ?? window.__mycapture.state.monitors[0]`);
      await app.reset({ mode: 'record', engine: 'native', target: 'region', videoFormat: 'webm', microphone: false, region: { monitorId: monitor.id, x: 0, y: 0, width: 200, height: 160 } });
      await app.clearNotice();
      await app.main.click('[data-action="record"]');
      await app.main.waitFor(`window.__mycapture.state.session.phase === 'recording'`, { timeout: 20000, message: 'recording' });
      await sleep(400);
      seen = windows();
      assert.ok(seen.length >= 1 && seen.every((w) => w.affinity === 0x11), `left out while recording: ${JSON.stringify(seen)}`);
      await app.main.click('[data-action="stop"]');
      await app.notice(30000);
      await sleep(300);
      seen = windows();
      assert.ok(seen.length >= 1 && seen.every((w) => w.affinity === 0), `capturable again after recording: ${JSON.stringify(seen)}`);
      await app.reset({ mode: 'capture' });
    },
  },
  {
    name: '인쇄 · 별도 창 (미리 보기 · 용지 · 방향 · 여백 · 크기, TIFF, 동영상 제외)',
    run: async (app) => {
      // Nothing captured yet: the print button is off.
      await app.reset({ mode: 'capture', target: 'monitor', monitorId: null, imageFormat: 'png' });
      assert.equal(await app.main.eval(`document.querySelector('[data-action="print"]').disabled`), true, 'nothing to print yet');
      await capture(app);
      const { file } = checkFile(app, 'png');
      await app.main.waitFor(`!document.querySelector('[data-action="print"]').disabled`, { message: 'print button on after a capture' });
      assert.ok(await app.main.eval(`document.querySelector('[data-action="print"] svg.icon[data-tone]') !== null`), 'print button has a colour icon');
      await app.main.click('[data-action="print"]');
      const printWin = async () => {
        const win = await app.popup('print');
        // Never the real print dialog: count the calls instead.
        await win.eval(`window.print = () => { window.__printed = (window.__printed || 0) + 1; }; 1`);
        await win.waitFor(`document.querySelector('.print-preview-image')?.complete && document.querySelector('.print-preview-image').naturalWidth > 0`, { message: 'image in the preview' });
        return win;
      };
      let win = await printWin();
      // Its own resizable window, with every option iconed.
      assert.equal(await win.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|is_resizable', { label: 'popup-print' })`), true, 'resizable window');
      assert.equal(await win.eval(`document.querySelector('.print-file').textContent`), file.split(/[\\/]/).pop());
      assert.deepEqual(await win.eval(`[...document.querySelectorAll('.print-options .segment:not([data-print="margin"]), .print-check, .print-label, .modal-foot button')].filter((el) => !el.querySelector('svg.icon[data-tone]')).map((el) => el.textContent.trim())`), [], 'every option has a colour icon (margins are plain numbers in mm)');
      // Options change the preview and are remembered.
      await win.click('[data-print="orientation"][data-value="landscape"]');
      assert.equal(await win.eval(`document.querySelector('.print-page').dataset.landscape`), 'true');
      await win.click('[data-print="paper"][data-value="Letter"]');
      await win.click('[data-print="scale"][data-value="actual"]');
      await win.waitFor(`document.querySelector('[data-print-size]').textContent.includes('100%')`, { message: 'actual size shown' });
      await win.click('[data-print="margin"][data-value="20"]');
      assert.deepEqual(JSON.parse(await win.eval(`localStorage.getItem('mycapture.print.v1')`)), { paper: 'Letter', orientation: 'landscape', margin: 20, scale: 'actual', percent: 100, header: true, footer: true, border: false });
      // Percent: the slider only works in that mode.
      assert.equal(await win.eval(`document.querySelector('[data-print-percent]').disabled`), true);
      await win.click('[data-print="scale"][data-value="percent"]');
      await win.eval(`(() => { const r = document.querySelector('[data-print-percent]'); r.value = '50'; r.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await win.waitFor(`document.querySelector('[data-print-size]').textContent.includes('50%')`, { message: '50% applied' });
      // Header off, border on: the preview follows.
      await win.click('[data-print-toggle="header"]');
      await win.click('[data-print-toggle="border"]');
      assert.equal(await win.eval(`document.querySelector('.print-page-head')`), null);
      assert.equal(await win.eval(`document.querySelector('.print-preview-image').classList.contains('bordered')`), true);
      // Print: the page at paper size, then the dialog (stubbed).
      await win.click('[data-print-action="print"]');
      await win.waitFor(`window.__printed === 1`, { message: 'print dialog asked for' });
      assert.match(await win.eval(`document.querySelector('#print-page-rule').textContent`), /@page \{ size: 279\.4mm 215\.9mm; margin: 0; \}/, 'Letter landscape page');
      const sheet = JSON.parse(await win.eval(`JSON.stringify({ style: document.querySelector('.print-sheet').getAttribute('style'), image: document.querySelector('.print-sheet-image').getAttribute('src') === document.querySelector('.print-preview-image').getAttribute('src'), head: Boolean(document.querySelector('.print-sheet-head')), foot: Boolean(document.querySelector('.print-sheet-foot')) })`));
      assert.deepEqual(sheet, { style: 'width:279.400mm;height:215.900mm', image: true, head: false, foot: true });
      // Defaults again.
      await win.click('[data-print-action="reset"]');
      assert.equal(await win.eval(`document.querySelector('[data-print="scale"].active').dataset.value`), 'fit');
      await win.click('[data-action="close"]');
      win.close();

      // From the viewer's toolbar, and a TIFF (the webview cannot draw it: a PNG from the app).
      await app.reset({ mode: 'capture', target: 'monitor', monitorId: null, imageFormat: 'tiff' }, { keepGallery: true });
      await capture(app);
      const tiff = checkFile(app, 'tiff').file;
      // The history lists the newest last.
      await app.main.click('#history .tile:last-child .tile-open');
      await app.main.waitFor(`!document.querySelector('#viewer').hidden`);
      await app.main.click('#viewer [data-viewer="print"]');
      win = await printWin();
      assert.equal(await win.eval(`document.querySelector('.print-file').textContent`), tiff.split(/[\\/]/).pop(), 'the viewed image');
      assert.match(await win.eval(`document.querySelector('.print-preview-image').getAttribute('src')`), /^blob:/, 'TIFF shown through a PNG');
      await win.click('[data-action="close"]');
      win.close();
      await app.main.eval(`document.querySelector('#viewer [data-viewer="close"]').click(); 1`);

      // A video is not printed.
      const video = { id: 'vid1', kind: 'video', path: file, width: 10, height: 10, durationMs: 1000 };
      await app.main.eval(`localStorage.setItem('mycapture.gallery.v1', ${JSON.stringify(JSON.stringify([video]))}); 1`);
      await app.reset({ mode: 'capture' }, { keepGallery: true });
      await app.clearNotice();
      await app.main.eval(`window.__mycapture.actions.print('vid1'); 1`);
      await app.main.waitFor(`window.__mycapture.state.notice?.kind === 'warn'`, { message: 'a video is refused with a warning' });
      assert.equal(await app.hasPopup('print'), false, 'no print window for a video');
      await app.reset({ mode: 'capture' });
    },
  },
  {
    name: '시작 화면 · 우클릭 메뉴에 배경 설정 · 자동 정렬 · 최근 캡처 전체 삭제',
    run: async (app) => {
      await app.reset({ showStartScreen: true });
      await app.main.waitFor(`!document.querySelector('#start-page').hidden`);
      const box = JSON.parse(await app.main.eval(`JSON.stringify(document.querySelector('.start-tools').getBoundingClientRect())`));
      const x = box.left + 10;
      const y = box.top + box.height / 2;
      await app.main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
      await app.main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', buttons: 0, clickCount: 1 });
      const menu = await app.popup('menu');
      const items = JSON.parse(await menu.eval(`JSON.stringify([...document.querySelectorAll('.menu-item')].map((item) => ({ value: item.dataset.value, disabled: item.disabled, icon: Boolean(item.querySelector('svg')) })))`));
      const values = items.map((item) => item.value);
      assert.ok(['start-background', 'start-arrange', 'gallery-clear', 'home'].every((value) => values.includes(value)), `start screen menu: ${values}`);
      assert.ok(items.every((item) => item.icon), 'every item has an icon');
      assert.equal(items.find((item) => item.value === 'gallery-clear').disabled, true, 'nothing to delete yet');
      await menu.click('[data-value="start-background"]');
      menu.close();
      const settings = await app.popup('settings');
      await settings.waitFor(`document.querySelector('.tab.active')?.dataset.value === 'start'`, { message: 'menu opens the background settings' });
      await settings.click('[data-action="close"]');
      settings.close();
    },
  },
  {
    name: '컬러 아이콘 · 메인 창 · 시작 화면 · 설정 창 · 우클릭 메뉴 (밝은 · 어두운 테마)',
    run: async (app) => {
      // Every visible icon is drawn in its tone's colour (except on solid coloured buttons).
      const ICON_CHECK = `(() => {
        const probe = document.createElement('i');
        document.body.appendChild(probe);
        const want = (tone) => { probe.style.color = 'var(--tone-' + tone + ')'; return getComputedStyle(probe).color; };
        const exempt = '.shutter-disc, .primary, .chip.on, .round-button.pause, .round-button.resume, .viewer-main, .tile-play, .tile-video, .start-recent-badge, .recbar-button.pause, .recbar-button.resume, .recbar-button.stop, [data-viewer="stop"]';
        const icons = [...document.querySelectorAll('svg.icon')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden]'); });
        const wrong = [];
        const hues = new Set();
        for (const el of icons) {
          if (!el.dataset.tone) { wrong.push('no tone: ' + el.outerHTML.slice(0, 60)); continue; }
          if (el.closest(exempt)) continue;
          const colour = getComputedStyle(el).color;
          hues.add(colour);
          if (colour !== want(el.dataset.tone)) wrong.push(el.dataset.icon + ' ' + colour + ' != ' + want(el.dataset.tone));
        }
        probe.remove();
        return JSON.stringify({ count: icons.length, hues: hues.size, wrong: wrong.slice(0, 10) });
      })()`;
      const check = async (page, where, least) => {
        const result = JSON.parse(await page.eval(ICON_CHECK));
        assert.deepEqual(result.wrong, [], `${where}: icons in their colours`);
        assert.ok(result.count >= least.count, `${where}: ${result.count} icons`);
        assert.ok(result.hues >= least.hues, `${where}: ${result.hues} different colours`);
        return result;
      };
      for (const theme of ['light-classic', 'dark-midnight']) {
        await app.reset({ theme, showStartScreen: true, mode: 'capture' });
        await app.main.waitFor(`!document.querySelector('#start-page').hidden`);
        await check(app.main, `${theme} start screen`, { count: 15, hues: 6 });
        await app.main.click('[data-action="start-close"]');
        await check(app.main, `${theme} main window`, { count: 15, hues: 6 });
        // Toolbar: every item (segments, chips, the format button) has a colour icon, in both modes.
        for (const mode of ['capture', 'record']) {
          await app.main.click(`[data-action="mode"][data-value="${mode}"]`);
          await sleep(150);
          const bare = await app.main.eval(`[...document.querySelectorAll('#toolbar .segment, #toolbar .chip, #toolbar .format-pick, #toolbar button')].filter((el) => !el.querySelector('svg.icon[data-tone]')).map((el) => el.textContent.trim() || el.className)`);
          assert.deepEqual(bare, [], `${theme} ${mode} toolbar: items without an icon`);
          assert.equal(await app.main.eval(`document.querySelectorAll('#toolbar select').length`), 0, 'no native drop-down in the toolbar');
          await check(app.main, `${theme} ${mode} toolbar`, { count: mode === 'record' ? 18 : 8, hues: mode === 'record' ? 8 : 5 });
        }
        await app.main.click('[data-action="mode"][data-value="capture"]');
        // The format button opens the app's own menu, one colour icon per format.
        await app.main.click('#toolbar [data-action="format-menu"]');
        const formats = await app.popup('menu');
        await formats.waitFor(`document.querySelectorAll('.menu-item').length === 7`, { message: 'format menu' });
        await check(formats, `${theme} format menu`, { count: 7, hues: 5 });
        await formats.click('[data-value="image-format:webp"]');
        formats.close();
        await app.main.waitFor(`window.__mycapture.state.settings.imageFormat === 'webp' && document.querySelector('#toolbar .format-pick span').textContent === 'WEBP'`, { message: 'format chosen from the menu' });
        // The shutter keeps its white icon on the accent disc.
        assert.equal(await app.main.eval(`getComputedStyle(document.querySelector('.shutter-disc .icon')).color`), 'rgb(255, 255, 255)', 'shutter icon stays white');
        // Light and dark themes use different shades of the same hue.
        const trash = await app.main.eval(`(() => { const p = document.createElement('i'); p.style.color = 'var(--tone-red)'; document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; })()`);
        assert.equal(trash, theme.startsWith('light') ? 'rgb(220, 38, 38)' : 'rgb(248, 113, 113)', `${theme}: red shade`);

        // Settings window: every tab.
        await app.main.click('[data-action="open-settings"]');
        const settings = await app.popup('settings');
        for (const tab of SETTINGS_TABS) {
          await settings.click(`[data-action="settings-tab"][data-value="${tab}"]`);
          await sleep(tab === 'mic' ? 400 : 100);
          await check(settings, `${theme} settings/${tab}`, { count: 8, hues: 3 });
          if (tab === 'capture') {
            // The same format menu from Settings: the choice comes back to this window.
            await settings.click('[data-action="format-menu"]');
            const formats = await app.popup('menu');
            await formats.waitFor(`document.querySelector('[data-value="image-format:png"]')`);
            await formats.click('[data-value="image-format:png"]');
            formats.close();
            await settings.waitFor(`document.querySelector('.format-pick span')?.textContent === 'PNG'`, { message: 'format chosen in Settings' });
            await app.main.waitFor(`window.__mycapture.state.settings.imageFormat === 'png'`, { message: 'and the main window follows' });
          }
        }
        await settings.click('[data-action="close"]');
        settings.close();

        // Context menu.
        const box = JSON.parse(await app.main.eval(`JSON.stringify(document.querySelector('#toolbar').getBoundingClientRect())`));
        const x = box.left + 8;
        const y = box.top + box.height / 2;
        await app.main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
        await app.main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', buttons: 0, clickCount: 1 });
        const menu = await app.popup('menu');
        await check(menu, `${theme} context menu`, { count: 6, hues: 5 });
        await menu.key('Escape');
        menu.close();
        await sleep(300);
      }
      await app.reset({});
    },
  },
  {
    name: '시작 화면 · 최근 캡처 개별 삭제 · 전체 삭제 (파일은 그대로)',
    run: async (app) => {
      await app.reset({ mode: 'capture', target: 'monitor', monitorId: null, imageFormat: 'png' });
      for (let i = 0; i < 3; i += 1) {
        await app.clearNotice();
        await app.main.click('[data-action="capture"]');
        await app.notice(30000);
        await sleep(1100); // a different file name each time (seconds in the stem)
      }
      const files = fs.readdirSync(app.output).filter((name) => name.endsWith('.png'));
      await app.main.click('#bar [data-action="home"]');
      await app.main.waitFor(`document.querySelectorAll('.start-recent-item').length === 3`, { message: 'three recent captures' });
      // Newest first.
      const newest = await app.main.eval(`window.__mycapture.state.gallery[0].id`);
      assert.equal(await app.main.eval(`document.querySelector('.start-recent-item').dataset.id`), newest, 'newest capture first');
      // Delete one with its own button.
      await app.main.click(`.start-recent-item[data-id="${newest}"] .start-recent-delete`);
      await app.main.waitFor(`document.querySelectorAll('.start-recent-item').length === 2 && document.querySelectorAll('#history .tile').length === 2`, { message: 'one entry removed' });
      assert.equal(await app.main.eval(`document.querySelector('#start-page').hidden`), false, 'still on the start screen');
      // Delete all: asks first.
      await app.main.click('.start-card-recent [data-action="gallery-clear"]');
      const confirm = await app.popup('confirm');
      await confirm.click('[data-action="gallery-clear-confirm"]');
      confirm.close();
      await app.main.waitFor(`document.querySelectorAll('.start-recent-item').length === 0 && document.querySelector('.start-card-recent .start-empty')`, { message: 'recent list emptied' });
      assert.ok(await app.main.eval(`document.querySelector('.start-card-recent [data-action="gallery-clear"]').disabled`), 'delete all disabled when empty');
      assert.ok(files.length >= 3 && files.every((name) => fs.existsSync(`${app.output}/${name}`)), 'saved files are not deleted');
    },
  },
  {
    name: '사용 설명서 창 · 목차 · 찾기 · 따라 하기 · 크기 조절',
    run: async (app) => {
      await app.reset({ language: 'ko' });
      await app.main.click('#bar [data-action="open-guide"]');
      const guide = await app.popup('guide');
      await guide.waitFor(`document.querySelectorAll('.guide-toc button').length >= 10`, { message: 'contents' });
      assert.match(await guide.eval(`document.querySelector('.guide-doc h1').textContent`), /사용 설명서/);
      // Contents → that chapter at the top.
      await guide.eval(`[...document.querySelectorAll('.guide-toc button')].find((b) => b.textContent.includes('테마')).click(); 1`);
      await guide.waitFor(`(() => { const doc = document.querySelector('.guide-doc'); const h = [...doc.querySelectorAll('h2')].find((x) => x.textContent.includes('테마')); return Math.abs(h.getBoundingClientRect().top - doc.getBoundingClientRect().top) < 40; })()`, { message: 'jumped to the chapter' });
      // Search highlights matches.
      await guide.eval(`(() => { const box = document.querySelector('.guide-search'); box.focus(); box.value = 'WebM'; box.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      assert.ok(await guide.eval(`document.querySelectorAll('.guide-doc mark').length`) >= 3, 'matches marked');
      await guide.key('Escape');
      assert.equal(await guide.eval(`document.querySelectorAll('.guide-doc mark').length`), 0, 'Esc clears the search first');
      // Tutorial tab.
      await guide.click('[data-action="guide-doc"][data-value="tutorial"]');
      assert.match(await guide.eval(`document.querySelector('.guide-doc h1').textContent`), /따라 하기/);
      assert.deepEqual(await guide.eval(AUDIT.replace(".source-body, .history-list", ".source-body, .history-list, .guide-toc, .guide-doc")), []);
      // Resizable: a new size sticks.
      await guide.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'popup-guide', value: { Logical: { width: 700, height: 500 } } }).then(() => 1)`);
      await guide.waitFor(`Math.abs(innerWidth - 700) < 4`, { message: 'guide window resized' });
      // English follows the language.
      await app.main.click('[data-action="language"]');
      await guide.waitFor(`/User's Guide/.test(document.querySelector('.guide-doc h1').textContent) || /Tutorial/.test(document.querySelector('.guide-doc h1').textContent)`, { message: 'guide in English' });
      await app.main.click('[data-action="language"]');
      await guide.key('Escape');
      guide.close();
    },
  },
  {
    name: '최소 창 크기에서 모든 버튼이 보이고 눌림',
    run: async (app) => {
      await app.reset({ mode: 'capture', target: 'window' });
      const before = await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|inner_size', { label: 'main' })`);
      await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 860, height: 600 } } })`);
      await sleep(600);
      const audit = () => app.main.eval(AUDIT);
      try {
        for (const mode of ['capture', 'record']) {
          await app.main.click(`[data-action="mode"][data-value="${mode}"]`);
          for (const target of ['monitor', 'window', 'region']) {
            await app.main.click(`[data-action="target"][data-value="${target}"]`);
            await sleep(200);
            assert.deepEqual(await audit(), [], `${mode}/${target}`);
          }
        }
        // Collapsed panels and the start screen: the title bar (and the top of the start screen) still fits.
        await app.main.click('#bar [data-action="sidebar"]');
        await app.main.click('#bar [data-action="history-panel"]');
        assert.deepEqual(await audit(), [], 'both panels collapsed');
        await app.main.click('#bar [data-action="sidebar"]');
        await app.main.click('#bar [data-action="history-panel"]');
        await app.main.click('#bar [data-action="home"]');
        await sleep(300);
        // In both languages ("Screen recording" is longer than "화면 녹화").
        for (const language of ['ko', 'en']) {
          // The title bar and the top of the start screen (the rest scrolls; checked card by card below).
          assert.deepEqual(await app.main.eval(AUDIT.replace("querySelectorAll('button, select, input[type=range], input[type=search], input[type=color], [data-resize]')", "querySelectorAll('#bar button, .start-tools button, .start-hero button')")), [], `start screen (${language})`);
          // The moving background card, scrolled into view: every control visible and reachable.
          await app.main.eval(`document.querySelector('.start-card-background').scrollIntoView({ block: 'end' }); 1`);
          await sleep(200);
          assert.deepEqual(JSON.parse(await app.main.eval(`JSON.stringify([...document.querySelectorAll('.start-card-background button, .start-card-background input')].map((el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.left < 0 || r.right > innerWidth + 0.5 || r.top < 0 || r.bottom > innerHeight + 0.5 ? 'outside ' + (el.dataset.value ?? el.dataset.input ?? el.dataset.action) : hit && (el === hit || el.contains(hit) || hit.closest('label')?.contains(el)) ? '' : 'covered ' + (el.dataset.value ?? el.dataset.input ?? el.dataset.action); }).filter(Boolean))`)), [], `background card at the minimum size (${language})`);
          await app.main.eval(`document.querySelector('.start-scroll').scrollTop = 0; 1`);
          assert.ok(await app.main.eval(`(() => { const s = document.querySelector('.start-scroll'); return s.scrollWidth <= s.clientWidth + 1 && document.querySelector('.app').scrollWidth <= innerWidth + 1; })()`), `no sideways scrolling (${language})`);
          assert.ok(await app.main.eval(`[...document.querySelectorAll('.mode')].every((b) => b.getBoundingClientRect().height < 40)`), `mode labels on one line (${language})`);
          assert.ok(await app.main.eval(`(() => { const r = document.querySelector('.brand-name').getBoundingClientRect(); return r.width > 40 && r.right <= document.querySelector('.modes').getBoundingClientRect().left; })()`), `program name "MyCapture" visible in the title bar (${language})`);
          assert.ok(await app.main.eval(`document.querySelector('[data-action="win-close"]').getBoundingClientRect().right <= innerWidth + 0.5`), `close button inside the window (${language})`);
          await app.main.click('[data-action="language"]');
          await sleep(200);
        }
        await app.main.click('#bar [data-action="home"]');
      } finally {
        await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Physical: ${JSON.stringify(before)} } })`);
      }
    },
  },
  {
    name: '프로그램 정보 창',
    run: async (app) => {
      await app.reset();
      await app.main.click('[data-action="open-about"]');
      const about = await app.popup('about');
      await about.waitFor(`/1\\.\\d+\\.\\d+/.test(document.querySelector('.about-list').textContent)`, { message: 'version shown' });
      assert.match(await about.eval(`document.body.textContent`), /MyCapture/);
      assert.deepEqual(await about.eval(AUDIT), []);
      await about.key('Escape');
      about.close();
      await app.main.waitFor(`(async () => !(await fetch('http://127.0.0.1:${app.port}/json/list').then((r) => r.json())).some((t) => t.title === 'popup-about'))()`, { message: 'Esc closes the window' }).catch(async () => assert.equal(await app.hasPopup('about'), false));
    },
  },
  {
    name: '캡처 기록 · 우측 패널에 이미지와 동영상(동영상 표시)',
    run: async (app) => {
      const monitor = await app.main.eval(`window.__mycapture.state.monitors[0]`);
      await app.reset({ mode: 'capture', target: 'monitor', monitorId: monitor.id, imageFormat: 'png' });
      assert.ok(await app.main.eval(`document.querySelector('.gallery-empty') !== null`), 'empty message first');
      await capture(app);
      await app.reset({ mode: 'record', engine: 'native', target: 'region', videoFormat: 'webm', region: { monitorId: monitor.id, x: 0, y: 0, width: 320, height: 200 } }, { keepGallery: true });
      await record(app, 'webm', 1);
      await app.main.waitFor(`document.querySelectorAll('.tile').length === 2`);
      const tiles = JSON.parse(await app.main.eval(`JSON.stringify([...document.querySelectorAll('.tile')].map((tile) => ({
        kind: tile.classList.contains('video') ? 'video' : 'image',
        badge: tile.querySelector('.tile-video')?.textContent.trim() ?? null,
        thumb: Boolean(tile.querySelector('img')),
        top: Math.round(tile.getBoundingClientRect().top),
        left: Math.round(tile.getBoundingClientRect().left),
        inPanel: Boolean(tile.closest('#history .history-list')),
      })))`));
      assert.equal(tiles[1].kind, 'video', 'newest at the bottom of the list');
      assert.match(tiles[1].badge, /^동영상/, 'video marker over the thumbnail');
      assert.equal(tiles[0].badge, null, 'no video marker on images');
      assert.ok(tiles.every((tile) => tile.thumb), 'thumbnails');
      assert.ok(tiles.every((tile) => tile.inPanel), 'listed in the right panel');
      assert.ok(tiles[0].top < tiles[1].top && tiles[0].left === tiles[1].left, 'laid out vertically');
      const right = await app.main.eval(`document.querySelector('#history').getBoundingClientRect().left >= document.querySelector('#stage').getBoundingClientRect().right`);
      assert.ok(right, 'history panel is right of the preview');
    },
  },
  {
    name: '캡처 기록 · 많으면 상하 스크롤, 우측 패널 접기 · 펼치기',
    run: async (app) => {
      const file = checkFile(app, 'png').file;
      // Real files: entries whose file does not exist are dropped from the history.
      const copies = Array.from({ length: 30 }, (_, index) => {
        const copy = file.replace(/\.png$/i, `-copy${index}.png`);
        fs.copyFileSync(file, copy);
        return copy;
      });
      const items = copies.map((path, index) => ({ id: `t${index}`, kind: index % 3 ? 'image' : 'video', path, width: 10, height: 10, durationMs: 1000 }));
      await app.main.eval(`localStorage.setItem('mycapture.gallery.v1', ${JSON.stringify(JSON.stringify(items))}); 1`);
      await app.reset({ mode: 'capture', historyCollapsed: false }, { keepGallery: true });
      await app.main.waitFor(`document.querySelectorAll('#history .tile').length === 30`);
      const scroll = JSON.parse(await app.main.eval(`(() => { const list = document.querySelector('.history-list'); list.scrollTop = 400; return JSON.stringify({ overflow: list.scrollHeight > list.clientHeight, top: list.scrollTop, clear: document.querySelector('[data-action="gallery-clear"]').getBoundingClientRect().bottom <= list.getBoundingClientRect().top + 1 }); })()`));
      assert.deepEqual(scroll, { overflow: true, top: 400, clear: true }, 'list scrolls, "delete all" stays above it');
      await app.main.click('#history [data-action="history-panel"]');
      const rail = JSON.parse(await app.main.eval(`JSON.stringify({ collapsed: document.querySelector('#body').classList.contains('right-collapsed'), width: Math.round(document.querySelector('#history').getBoundingClientRect().width), icon: Boolean(document.querySelector('#history .rail .rail-icon')), title: document.querySelector('#history .rail-title')?.textContent ?? '' })`));
      assert.equal(rail.collapsed, true);
      assert.ok(rail.width <= 30, `collapsed width ${rail.width} (a slim 28px strip)`);
      assert.ok(rail.icon && rail.title.length > 0, 'icon and title stay visible');
      await app.main.click('#history .rail');
      assert.equal(await app.main.eval(`document.querySelectorAll('#history .tile').length`), 30);
      await app.reset({ mode: 'capture' });
    },
  },
  {
    name: '좌측 패널 · 저장 위치는 설정 창에만, 최소 폭은 탭 레이블 한 줄',
    run: async (app) => {
      await app.reset({ mode: 'record', target: 'monitor', leftWidth: 120 });
      assert.equal(await app.main.eval(`document.querySelector('#sources .folder, #sources .save-location')`), null, 'no save location in the left panel');
      await app.main.click('[data-action="open-settings"]');
      const settings = await app.popup('settings');
      await settings.click('[data-action="settings-tab"][data-value="save"]');
      assert.equal(await settings.eval(`document.querySelectorAll('[data-action="choose-folder"]').length`), 2, 'image and video folders in Settings');
      await settings.click('[data-action="close"]');
      settings.close();
      const oneLine = () => app.main.eval(`(() => [...document.querySelectorAll('#sources .targets .segment')].every((segment) => {
        const label = segment.querySelector('span');
        const r = segment.getBoundingClientRect();
        return label.scrollWidth <= label.clientWidth + 1 && segment.scrollWidth <= segment.clientWidth + 1 && r.height < 40
          && r.right <= document.querySelector('#sources').getBoundingClientRect().right;
      }))()`);
      assert.ok(await oneLine(), 'Korean labels on one line at the minimum width');
      // Drag the splitter far to the left: it stops at the minimum.
      const bar = JSON.parse(await app.main.eval(`JSON.stringify(document.querySelector('[data-split="left"]').getBoundingClientRect())`));
      const y = bar.top + bar.height / 2;
      await app.main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bar.left + 2, y });
      await app.main.mouse('mousePressed', bar.left + 2, y);
      await app.main.mouse('mouseMoved', 20, y);
      await app.main.mouse('mouseReleased', 20, y);
      assert.ok(await oneLine(), 'dragging cannot go below the one-line width');
      const stored = await app.main.eval(`window.__mycapture.state.settings.leftWidth`);
      assert.ok(stored >= 150, `stored width ${stored}`);
      await app.main.click('[data-action="language"]');
      assert.ok(await oneLine(), 'English labels on one line too');
      await app.main.click('[data-action="language"]');
      await app.reset({ mode: 'capture' });
    },
  },
  {
    name: '좌우 패널 · 최소 폭이 같음 (한국어 · English)',
    run: async (app) => {
      const width = (selector) => app.main.eval(`document.querySelector('${selector}').getBoundingClientRect().width`);
      /** Drags a splitter as far as it goes toward its own panel. */
      const squeeze = async (side) => {
        const bar = JSON.parse(await app.main.eval(`JSON.stringify(document.querySelector('[data-split="${side}"]').getBoundingClientRect())`));
        const x = bar.left + 2;
        const y = bar.top + bar.height / 2;
        const to = side === 'left' ? 5 : await app.main.eval('innerWidth - 5');
        await app.main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await app.main.mouse('mousePressed', x, y);
        await app.main.mouse('mouseMoved', (x + to) / 2, y);
        await app.main.mouse('mouseMoved', to, y);
        await app.main.mouse('mouseReleased', to, y);
      };
      for (const language of ['ko', 'en']) {
        await app.reset({ mode: 'capture', language, leftWidth: 400, rightWidth: 400 }, { keepGallery: true });
        await squeeze('left');
        await squeeze('right');
        const [left, right] = [await width('#sources'), await width('#history')];
        assert.ok(Math.abs(left - right) <= 1, `${language}: left ${left}px, right ${right}px`);
        assert.ok(left >= 200, `${language}: minimum ${left}px`);
        // Stored too small (hand-edited or from an older version): both come up to the same minimum.
        await app.reset({ mode: 'capture', language, leftWidth: 120, rightWidth: 120 }, { keepGallery: true });
        assert.ok(Math.abs((await width('#sources')) - (await width('#history'))) <= 1, `${language}: stored widths below the minimum`);
      }
      await app.reset({ mode: 'capture' });
    },
  },
  {
    name: '캡처 기록 · 개별 삭제 → 목록에서만, 파일은 그대로',
    run: async (app) => {
      await app.reset({ mode: 'capture', target: 'monitor', monitorId: null, imageFormat: 'bmp' });
      await capture(app);
      const { file } = checkFile(app, 'bmp');
      await app.clearNotice();
      await app.main.click('.tile [data-action="gallery-delete"]');
      const notice = await app.notice();
      assert.equal(notice.kind, 'success', notice.text);
      assert.ok(fs.existsSync(file), 'the saved file is not deleted');
      assert.equal(await app.main.eval(`document.querySelectorAll('.tile').length`), 0);
    },
  },
  {
    name: '캡처 기록 · 전체 삭제 (확인 창 · 취소 가능)',
    run: async (app) => {
      await app.reset({ mode: 'capture', target: 'monitor', monitorId: null, imageFormat: 'gif' });
      await capture(app);
      await capture(app);
      await app.main.waitFor(`document.querySelectorAll('.tile').length === 2`);
      await app.main.click('[data-action="gallery-clear"]');
      let confirm = await app.popup('confirm');
      assert.match(await confirm.eval(`document.querySelector('.confirm-text').textContent`), /2/);
      await confirm.click('[data-action="close"]');
      confirm.close();
      await sleep(300);
      assert.equal(await app.main.eval(`document.querySelectorAll('.tile').length`), 2, 'cancel keeps everything');
      const files = fs.readdirSync(app.output).filter((name) => name.endsWith('.gif'));
      await app.main.click('[data-action="gallery-clear"]');
      confirm = await app.popup('confirm');
      await confirm.click('[data-action="gallery-clear-confirm"]');
      confirm.close();
      await app.main.waitFor(`document.querySelectorAll('.tile').length === 0 && document.querySelector('.gallery-empty')`);
      assert.ok(files.length >= 2 && files.every((name) => fs.existsSync(`${app.output}/${name}`)), 'saved files are not deleted');
    },
  },
  {
    name: '캡처 기록 · 다시 열어도 유지, 사라진 파일은 기록에서 빠짐',
    run: async (app) => {
      await app.reset({ mode: 'capture', target: 'monitor', monitorId: null, imageFormat: 'png' });
      await capture(app);
      const { file } = checkFile(app, 'png');
      await app.reset({ mode: 'capture' }, { keepGallery: true });
      await app.main.waitFor(`document.querySelectorAll('.tile').length === 1`, { message: 'history survives a restart' });
      fs.rmSync(file);
      await app.reset({ mode: 'capture' }, { keepGallery: true });
      await app.main.waitFor(`document.querySelectorAll('.tile').length === 0 && window.__mycapture.state.gallery.length === 0`, { message: 'deleted file dropped from the history' });
      assert.equal(JSON.parse(await app.main.eval(`localStorage.getItem('mycapture.gallery.v1')`)).length, 0, 'and from storage');
    },
  },
  {
    name: '캡처 기록 보기 · 이미지 확대 · 축소 · 맞춤 · 100%',
    run: async (app) => {
      await app.reset({ mode: 'capture', target: 'monitor', monitorId: null, imageFormat: 'png' });
      await capture(app);
      await app.main.click('#history .tile [data-action="gallery-open"]');
      await app.main.waitFor(`document.querySelector('#viewer:not([hidden]) .viewer-image')?.naturalWidth > 0`, { message: 'image shown in the viewer' });
      await sleep(200);
      const zoom = () => app.main.eval(`parseInt(document.querySelector('.viewer-zoom').textContent, 10)`);
      const fitted = await zoom();
      assert.ok(fitted > 0 && fitted <= 100, `fit ${fitted}%`);
      assert.ok(await app.main.eval(`document.querySelector('#history .tile.selected') !== null`), 'selected item is highlighted');
      await app.main.click('[data-viewer="zoom-in"]');
      assert.ok(await zoom() > fitted, 'zoom in');
      await app.main.click('[data-viewer="zoom-out"]');
      await app.main.click('[data-viewer="zoom-out"]');
      assert.ok(await zoom() < fitted, 'zoom out');
      await app.main.click('[data-viewer="actual"]');
      assert.equal(await zoom(), 100);
      await app.main.click('[data-viewer="fit"]');
      assert.equal(await zoom(), fitted);
      // wheel zoom over the image
      const box = JSON.parse(await app.main.eval(`JSON.stringify(document.querySelector('.viewer-canvas').getBoundingClientRect())`));
      await app.main.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.left + box.width / 2, y: box.top + box.height / 2, deltaX: 0, deltaY: -120 });
      await app.main.waitFor(`parseInt(document.querySelector('.viewer-zoom').textContent, 10) > ${fitted}`, { message: 'wheel zoom' });
      await app.main.key('Escape');
      await app.main.waitFor(`document.querySelector('#viewer').hidden && !document.querySelector('#preview-still').hidden`, { message: 'Esc closes the viewer' });
    },
  },
  {
    name: '캡처 기록 보기 · 동영상 재생 · 일시정지 · 정지',
    run: async (app) => {
      const monitor = await app.main.eval(`window.__mycapture.state.monitors[0]`);
      await app.reset({ mode: 'record', engine: 'native', target: 'region', videoFormat: 'webm', region: { monitorId: monitor.id, x: 0, y: 0, width: 320, height: 200 } });
      await record(app, 'webm', 3);
      await app.main.click('#history .tile.video [data-action="gallery-open"]');
      await app.main.waitFor(`document.querySelector('#viewer:not([hidden]) video')?.readyState >= 1`, { message: 'video loaded' });
      const video = (expression) => app.main.eval(`(() => { const v = document.querySelector('.viewer-video'); return ${expression}; })()`);
      assert.ok(await video('v.paused'), 'starts paused');
      await app.main.click('[data-viewer="play"]');
      await app.main.waitFor(`document.querySelector('.viewer-video').currentTime > 0.5`, { message: 'plays' });
      assert.ok(await app.main.eval(`document.querySelector('[data-viewer="pause"]') !== null`), 'button turns into pause');
      await app.main.click('[data-viewer="pause"]');
      const pausedAt = await video('v.currentTime');
      await sleep(600);
      assert.ok(await video('v.paused'), 'paused');
      assert.equal(await video('v.currentTime'), pausedAt, 'stays put while paused');
      await app.main.click('[data-viewer="play"]');
      await sleep(400);
      await app.main.click('[data-viewer="stop"]');
      assert.ok(await video('v.paused && v.currentTime === 0'), 'stop = pause + back to the start');
      assert.match(await app.main.eval(`document.querySelector('.viewer-time').textContent`), /^00:00 \/ 00:0[2-4]$/);
      await app.main.click('[data-viewer="close"]');
      await app.main.waitFor(`document.querySelector('#viewer').hidden`);
    },
  },
  {
    name: '테마 · 버튼을 누르면 다음 테마, 드롭다운 창에 어두운 20 · 밝은 20',
    run: async (app) => {
      await app.reset({ theme: 'dark-midnight' });
      const theme = () => app.main.eval(`document.documentElement.dataset.theme`);
      const bg = () => app.main.eval(`getComputedStyle(document.body).backgroundColor`);
      const order = JSON.parse(await app.main.eval(`JSON.stringify([...document.querySelectorAll('#bar .bar-end > *')].map((el) => el.dataset.action ?? el.className))`));
      assert.ok(order.indexOf('theme-split') >= 0 && order.indexOf('theme-split') === order.indexOf('open-settings') - 1, `theme button sits left of settings: ${order}`);
      const before = await bg();
      await app.main.click('[data-action="theme-next"]');
      assert.equal(await theme(), 'dark-ink', 'next theme');
      assert.notEqual(await bg(), before, 'colours actually change');
      await app.main.click('[data-action="theme-menu"]');
      const menu = await app.popup('theme-menu');
      const info = JSON.parse(await menu.eval(`JSON.stringify({
        cols: [...document.querySelectorAll('.theme-col')].map((col) => col.querySelectorAll('.theme-row').length),
        current: document.querySelector('.theme-row.current')?.dataset.value,
      })`));
      assert.deepEqual(info, { cols: [20, 20], current: 'dark-ink' });
      await menu.click('[data-value="light-mint"]');
      menu.close();
      await app.main.waitFor(`document.documentElement.dataset.theme === 'light-mint'`, { message: 'the main window follows the dropdown' });
      assert.equal(await app.main.eval(`document.documentElement.style.colorScheme`), 'light');
      await sleep(400);
      assert.equal(await app.hasPopup('theme-menu'), false, 'dropdown closes after choosing');
      await app.reset({ theme: 'light-mint' }, { keepGallery: true });
      assert.equal(await theme(), 'light-mint', 'remembered');
    },
  },
  {
    name: '테마 · 사용자 정의 색과 설정 창의 테마 탭',
    run: async (app) => {
      await app.reset({ theme: 'light-classic' });
      await app.main.click('[data-action="theme-menu"]');
      const menu = await app.popup('theme-menu');
      await menu.click('[data-action="theme-custom"]');
      menu.close();
      const settings = await app.popup('settings');
      await settings.waitFor(`document.querySelector('.tab.active')?.dataset.value === 'theme'`, { message: 'custom… opens the theme tab' });
      assert.equal(await settings.eval(`document.querySelectorAll('.theme-chip').length`), 40);
      const bar = JSON.parse(await settings.eval(`JSON.stringify(document.querySelector('.theme-chip .theme-swatch').getBoundingClientRect())`));
      assert.ok(bar.width > bar.height * 4, `colours shown as a long horizontal bar (${bar.width}×${bar.height})`);
      const hiddenNames = await settings.eval(`[...document.querySelectorAll('.theme-chip')].filter((chip) => { const name = chip.querySelector('.theme-chip-name'); return !name || name.textContent.trim() !== chip.getAttribute('aria-label') || name.getBoundingClientRect().height < 8 || name.scrollWidth > name.clientWidth; }).map((chip) => chip.dataset.value)`);
      assert.deepEqual(hiddenNames, [], 'every theme shows its whole name');
      await settings.click('.theme-chip[data-value="dark-ice"]');
      await app.main.waitFor(`document.documentElement.dataset.theme === 'dark-ice'`);
      await settings.eval(`(() => { const input = document.querySelector('[data-custom="accent"]'); input.value = '#ff00aa'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await app.main.waitFor(`document.documentElement.dataset.theme === 'custom' && getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() === '#ff00aa'`, { message: 'editing a colour switches the main window to the custom theme' });
      await settings.click('[data-action="setting"][data-key="customMode"][data-value="light"]');
      await app.main.waitFor(`document.documentElement.dataset.themeMode === 'light'`);
      await settings.click('[data-action="close"]');
      settings.close();
      await app.reset({ theme: 'custom', customTheme: { mode: 'dark', accent: '#00aa55' } }, { keepGallery: true });
      assert.equal(await app.main.eval(`getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()`), '#00aa55', 'custom colours survive a restart');
      await app.reset({ theme: 'system' });
    },
  },
  {
    name: '창이 커지면 미리보기 · 보기 이미지도 계속 커짐',
    run: async (app) => {
      const win = (command, args = {}) => app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|${command}', ${JSON.stringify({ label: 'main', ...args })})`);
      const monitor = await app.main.eval(`window.__mycapture.state.monitors.find((m) => m.primary) ?? window.__mycapture.state.monitors[0]`);
      await app.reset({ mode: 'capture', target: 'monitor', monitorId: monitor.id, imageFormat: 'png' });
      await app.main.waitFor(`document.querySelector('#preview-still img')?.naturalWidth > 0`);
      const before = await win('inner_size');
      // Displayed size of an object-fit: contain image, and the area it sits in.
      const measure = (selector) => app.main.eval(`(() => {
        const img = document.querySelector(${JSON.stringify(selector)});
        const r = img.getBoundingClientRect();
        const scale = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
        return JSON.stringify({ shown: [Math.round(img.naturalWidth * scale), Math.round(img.naturalHeight * scale)], box: [Math.round(r.width), Math.round(r.height)], natural: img.naturalWidth });
      })()`);
      try {
        await win('set_size', { value: { Logical: { width: 860, height: 600 } } });
        await sleep(500);
        const small = JSON.parse(await measure('#preview-still img'));
        await win('set_size', { value: { Physical: { width: monitor.width - 40, height: monitor.height - 80 } } });
        await sleep(500);
        const large = JSON.parse(await measure('#preview-still img'));
        assert.ok(large.natural >= Math.min(1920, monitor.width), `preview is sharp enough (${large.natural}px)`);
        assert.ok(large.shown[0] > small.shown[0] * 1.5, `preview grows with the window: ${small.shown} → ${large.shown}`);
        assert.ok(Math.abs(large.shown[0] - large.box[0]) <= 2 || Math.abs(large.shown[1] - large.box[1]) <= 2, `fills the preview area ${large.shown} in ${large.box}`);
        // A small capture shown in the viewer also grows past 100 %.
        await app.reset({ mode: 'capture', target: 'region', imageFormat: 'png', region: { monitorId: monitor.id, x: 0, y: 0, width: 200, height: 120 } });
        await app.clearNotice();
        await app.main.click('[data-action="recapture-region"]');
        await app.notice();
        await app.main.click('#history .tile [data-action="gallery-open"]');
        await app.main.waitFor(`document.querySelector('.viewer-image')?.naturalWidth > 0`);
        await sleep(300);
        assert.ok(await app.main.eval(`parseInt(document.querySelector('.viewer-zoom').textContent, 10)`) > 100, 'small image is enlarged to fit');
      } finally {
        await win('set_size', { value: { Physical: before } });
      }
    },
  },
  {
    name: '자동 저장 · 전체 화면 · 창 · 영역 캡처가 모두 캡처 기록에 (아래로 쌓임)',
    run: async (app) => {
      const monitor = await app.main.eval(`window.__mycapture.state.monitors[0]`);
      // Settings from before auto-save existed ("ask every time" on, no version): they switch to auto-save.
      await app.reset({ askPath: true, mode: 'capture', target: 'monitor', monitorId: null, imageFormat: 'png' });
      assert.equal(await app.main.eval(`window.__mycapture.state.settings.askPath`), false, 'saving is automatic');
      await capture(app);
      await app.main.click('[data-action="target"][data-value="window"]');
      await app.main.waitFor(`document.querySelectorAll('.item[data-action="window"]').length > 0`);
      await app.main.click('.item[data-action="window"]');
      await capture(app);
      await app.main.click('[data-action="target"][data-value="region"]');
      await app.main.click('[data-action="capture"]');
      await dragOverlay(app, { x: 100, y: 100 }, { x: 300, y: 220 });
      assert.equal((await app.notice()).kind, 'success');
      await app.main.waitFor(`document.querySelectorAll('#history .tile').length === 3`, { message: 'all three captures are in the history' });
      const rows = JSON.parse(await app.main.eval(`JSON.stringify([...document.querySelectorAll('#history .tile')].map((tile) => ({
        name: tile.querySelector('.tile-caption strong').textContent, top: tile.getBoundingClientRect().top,
        size: tile.querySelector('.tile-caption small').textContent })))`));
      assert.ok(rows[0].top < rows[1].top && rows[1].top < rows[2].top, 'a list growing downward');
      const [regionWidth] = rows[2].size.split(' × ').map((part) => parseInt(part, 10));
      assert.ok(regionWidth > 0 && regionWidth < monitor.width / 2, `newest (the region) is the last row: ${rows[2].size}`);
      assert.equal(new Set(rows.map((row) => row.name)).size, 3, 'three separate files');
      for (const row of rows) assert.ok(fs.existsSync(`${app.output}/${row.name}`), `${row.name} saved`);
    },
  },
  {
    name: '컨텍스트 메뉴 · 아이콘 있는 메뉴 창, 브라우저 메뉴 대신',
    run: async (app) => {
      await app.reset({ mode: 'capture', target: 'monitor', monitorId: null, imageFormat: 'png' });
      await capture(app);
      const { file } = checkFile(app, 'png');
      await app.main.eval(`window.__menuEvents = []; document.addEventListener('contextmenu', (e) => setTimeout(() => window.__menuEvents.push(e.defaultPrevented)), true); 1`);
      const rightClick = async (selector) => {
        const box = JSON.parse(await app.main.eval(`JSON.stringify(document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect())`));
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        await app.main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
        await app.main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', buttons: 0, clickCount: 1 });
      };
      await rightClick('#history .tile');
      let menu = await app.popup('menu');
      const items = JSON.parse(await menu.eval(`JSON.stringify([...document.querySelectorAll('.menu-item')].map((item) => ({ command: item.dataset.value, icon: Boolean(item.querySelector('svg path, svg rect, svg circle')), label: item.textContent.trim() })))`));
      assert.ok(items.length >= 6, `history menu items: ${items.map((i) => i.label)}`);
      assert.ok(items.every((item) => item.icon), 'every menu item has an icon');
      assert.ok(await app.main.eval(`window.__menuEvents.every(Boolean)`), 'the browser menu is suppressed');
      await app.clearNotice();
      await menu.click('[data-value^="copy-path:"]');
      menu.close();
      await app.main.waitFor(`window.__mycapture.state.notice?.kind === 'success'`, { message: 'path copied' });
      const clipboard = execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Clipboard']).toString().trim();
      assert.equal(clipboard, file, 'the file path is on the clipboard');
      const commands = (list) => list.map((item) => item.command.split(':')[0]);
      assert.ok(['copy-image', 'save-as', 'print'].every((name) => commands(items).includes(name)), `history: copy to clipboard and save as (${commands(items)})`);
      // Viewer: copy and save as too.
      await app.main.click('#history .tile-open');
      await app.main.waitFor(`!document.querySelector('#viewer').hidden`);
      await rightClick('#viewer .viewer-canvas');
      menu = await app.popup('menu');
      const viewerItems = JSON.parse(await menu.eval(`JSON.stringify([...document.querySelectorAll('.menu-item')].map((item) => item.dataset.value))`));
      assert.ok(['viewer:copy', 'viewer:save-as', 'viewer:print'].every((name) => viewerItems.includes(name)), `viewer menu: ${viewerItems}`);
      await app.clearNotice();
      await menu.click('[data-value="viewer:copy"]');
      menu.close();
      assert.equal((await app.notice()).kind, 'success', 'copied from the viewer menu');
      await app.main.eval(`document.querySelector('#viewer [data-viewer="close"]').click(); 1`);
      // Preview area: the last capture to the clipboard.
      await rightClick('#preview');
      menu = await app.popup('menu');
      assert.ok(await menu.eval(`(() => { const item = document.querySelector('[data-value="copy-last"]'); return item && !item.disabled; })()`), 'preview menu: copy the last capture');
      await app.clearNotice();
      await menu.click('[data-value="copy-last"]');
      menu.close();
      assert.equal((await app.notice()).kind, 'success', 'last capture copied from the menu');
      // Start screen: a recent capture has the same menu as the history.
      await app.main.click('#bar [data-action="home"]');
      await app.main.waitFor(`document.querySelector('.start-recent-item')`);
      await rightClick('.start-recent-item');
      menu = await app.popup('menu');
      const recentItems = JSON.parse(await menu.eval(`JSON.stringify([...document.querySelectorAll('.menu-item')].map((item) => item.dataset.value.split(':')[0]))`));
      assert.ok(['view', 'copy-image', 'save-as', 'print', 'reveal'].every((name) => recentItems.includes(name)), `recent capture menu: ${recentItems}`);
      await menu.click('[data-value^="view:"]');
      menu.close();
      await app.main.waitFor(`document.querySelector('#start-page').hidden && !document.querySelector('#viewer').hidden`, { message: 'view from the start screen menu' });
      await app.main.eval(`document.querySelector('#viewer [data-viewer="close"]').click(); 1`);
      // General menu elsewhere.
      await rightClick('#toolbar');
      menu = await app.popup('menu');
      assert.ok(await menu.eval(`document.querySelector('[data-value="open-settings"] svg') !== null`), 'settings entry with icon');
      await menu.key('Escape');
      menu.close();
      await sleep(300);
      // Delete through the menu: removed from the history, file kept.
      await rightClick('#history .tile');
      menu = await app.popup('menu');
      await menu.click('[data-value^="delete:"]');
      menu.close();
      await app.main.waitFor(`document.querySelectorAll('#history .tile').length === 0`);
      assert.ok(fs.existsSync(file), 'file kept');
      // Text fields: the app's own editing menu (colour icons), not the webview's.
      await app.main.click('[data-action="target"][data-value="window"]');
      await app.main.eval(`window.__menuEvents = []; 1`);
      const field = '[data-input="windowFilter"]';
      await app.main.eval(`(() => { const f = document.querySelector('${field}'); f.focus(); f.value = 'MyCapture'; f.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await sleep(200);
      await app.main.eval(`(() => { const f = document.querySelector('${field}'); f.focus(); f.setSelectionRange(0, 2); return 1; })()`);
      const textMenu = async () => {
        // Right-click on the text itself: a right-click past its end moves the caret
        // there (as in any browser) and the selection is gone.
        const box = JSON.parse(await app.main.eval(`JSON.stringify(document.querySelector('${field}').getBoundingClientRect())`));
        const padding = await app.main.eval(`parseFloat(getComputedStyle(document.querySelector('${field}')).paddingLeft)`);
        const x = box.left + padding + 6;
        const y = box.top + box.height / 2;
        await app.main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
        await app.main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', buttons: 0, clickCount: 1 });
        const opened = await app.popup('menu');
        await opened.waitFor(`document.querySelector('[data-value="text:paste"]')`, { message: 'text menu' });
        return opened;
      };
      menu = await textMenu();
      assert.deepEqual(JSON.parse(await app.main.eval(`JSON.stringify(window.__menuEvents)`)), [true], 'search box: no native menu');
      const textItems = JSON.parse(await menu.eval(`JSON.stringify([...document.querySelectorAll('.menu-item')].map((item) => ({ command: item.dataset.value, disabled: item.disabled, tone: item.querySelector('svg.icon')?.dataset.tone ?? '', colour: getComputedStyle(item.querySelector('svg.icon')).color })))`));
      assert.deepEqual(textItems.map((item) => item.command), ['text:undo', 'text:cut', 'text:copy', 'text:paste', 'text:delete', 'text:select-all']);
      assert.ok(textItems.every((item) => item.tone && !item.disabled), `every item has a colour icon and is enabled: ${JSON.stringify(textItems)}`);
      assert.ok(new Set(textItems.map((item) => item.colour)).size >= 3, 'in several colours');
      // UTF-8 out: the console code page would garble Korean text.
      const clipboardText = () => execFileSync('powershell.exe', ['-NoProfile', '-Command', '[Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-Clipboard -Raw']).toString('utf8').trim();
      // Copy: the remembered selection, although the menu window took the focus.
      await menu.click('[data-value="text:copy"]');
      menu.close();
      await sleep(400);
      assert.equal(clipboardText(), 'My', 'copy from the text menu');
      // Select all, then cut: the field is empty, the clipboard has it all.
      menu = await textMenu();
      await menu.click('[data-value="text:select-all"]');
      menu.close();
      await app.main.waitFor(`(() => { const f = document.querySelector('${field}'); return f.selectionStart === 0 && f.selectionEnd === 9; })()`, { message: 'select all' });
      menu = await textMenu();
      await menu.click('[data-value="text:cut"]');
      menu.close();
      await app.main.waitFor(`document.querySelector('${field}').value === '' && window.__mycapture.state.windowFilter === ''`, { message: 'cut empties the field (and the filter follows)' });
      await sleep(300);
      assert.equal(clipboardText(), 'MyCapture', 'cut puts it on the clipboard');
      // Paste puts it back.
      menu = await textMenu();
      await menu.click('[data-value="text:paste"]');
      menu.close();
      await app.main.waitFor(`document.querySelector('${field}').value === 'MyCapture'`, { message: 'paste from the text menu' });
      await app.main.eval(`(() => { const f = document.querySelector('${field}'); f.value = ''; f.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);

      // Popups: the guide's search box, selected guide text and the window itself.
      await app.main.click('#bar [data-action="open-guide"]');
      const guide = await app.popup('guide');
      await guide.waitFor(`document.querySelector('.guide-doc p')`, { message: 'guide shown' });
      const guideClick = async (selector) => {
        const box = JSON.parse(await guide.eval(`JSON.stringify(document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect())`));
        const x = box.left + Math.min(20, box.width / 2);
        const y = box.top + Math.min(10, box.height / 2);
        await guide.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
        await guide.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', buttons: 0, clickCount: 1 });
        return app.popup('menu');
      };
      const values = (page) => page.eval(`[...document.querySelectorAll('.menu-item')].map((item) => item.dataset.value + (item.querySelector('svg.icon[data-tone]') ? '' : ' (no colour icon)'))`);
      menu = await guideClick('.guide-search');
      await menu.waitFor(`document.querySelector('[data-value="text:paste"]')`, { message: 'text menu in the guide search box' });
      assert.ok((await values(menu)).every((value) => value.startsWith('text:') && !value.includes('no colour')), 'guide search: text menu with colour icons');
      await menu.key('Escape');
      menu.close();
      await sleep(300);
      // Selected guide text: Copy, then Close.
      const selected = await guide.eval(`(() => { const p = document.querySelector('.guide-doc p'); const range = document.createRange(); range.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(range); return s.toString().trim(); })()`);
      menu = await guideClick('.guide-doc p');
      await menu.waitFor(`document.querySelector('[data-value="text:copy-selection"]')`, { message: 'copy for selected guide text' });
      assert.deepEqual(await values(menu), ['text:copy-selection', 'popup-close']);
      await menu.click('[data-value="text:copy-selection"]');
      menu.close();
      await sleep(400);
      assert.equal(clipboardText().replace(/\s+/g, ' '), selected.replace(/\s+/g, ' '), 'selected guide text copied');
      await guide.eval(`getSelection().removeAllRanges(); 1`);
      menu = await guideClick('.guide-doc p');
      await menu.waitFor(`document.querySelector('[data-value="popup-close"]')`);
      assert.deepEqual(await values(menu), ['popup-close'], 'nothing selected: just Close');
      await menu.click('[data-value="popup-close"]');
      menu.close();
      guide.close();
      for (let i = 0; i < 30 && (await app.hasPopup('guide')); i += 1) await sleep(100);
      assert.equal(await app.hasPopup('guide'), false, 'Close from the menu closes the guide');
    },
  },
  {
    name: '창 위치 · 크기 · 최대화를 기억했다가 다시 실행할 때 사용',
    run: async (app) => {
      const win = (command, args = {}) => app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|${command}', ${JSON.stringify({ label: 'main', ...args })})`);
      const monitor = await app.main.eval(`window.__mycapture.state.monitors.find((m) => m.primary) ?? window.__mycapture.state.monitors[0]`);
      const target = { x: monitor.x + 137, y: monitor.y + 91, width: Math.min(1004, monitor.width - 200), height: Math.min(688, monitor.height - 150) };
      if (await win('is_maximized')) await win('unmaximize');
      await win('set_position', { value: { Physical: { x: target.x, y: target.y } } });
      await win('set_size', { value: { Physical: { width: target.width, height: target.height } } });
      await sleep(1200); // saved half a second after the last change

      const errors = app.main.errors;
      await app.restart();
      app.main.errors.push(...errors);
      const position = await win('outer_position');
      const size = await win('inner_size');
      assert.deepEqual({ x: position.x, y: position.y, width: size.width, height: size.height }, target, 'same place and size after a restart');

      await win('maximize');
      await sleep(1200);
      await app.restart();
      assert.equal(await win('is_maximized'), true, 'maximized again after a restart');
      await win('unmaximize');
      await sleep(400);
      const restored = await win('inner_size');
      assert.deepEqual([restored.width, restored.height], [target.width, target.height], 'un-maximizing returns to the remembered size');
    },
  },
  {
    name: '중복 실행 · 이미 실행 중이면 알림 창을 띄우고, 닫으면 종료',
    run: async (app) => {
      if (process.platform !== 'win32') return;
      const second = app.spawnSecond();
      const exited = new Promise((resolve) => second.once('exit', () => resolve(true)));
      const title = () => execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${second.pid} -ErrorAction SilentlyContinue).MainWindowTitle`]).toString().trim();
      try {
        let shown = '';
        for (let i = 0; i < 50 && !shown; i++) {
          await sleep(300);
          shown = title();
        }
        assert.equal(shown, 'MyCapture', 'a message box (not a second app window "MyCapture v1.0.2")');
        assert.equal(second.exitCode, null, 'it waits for the user to read the message');
        // OK on the message box: the second copy ends, the first keeps running.
        execFileSync('powershell.exe', ['-NoProfile', '-Command', `[void](Get-Process -Id ${second.pid}).CloseMainWindow()`]);
        assert.ok(await Promise.race([exited, sleep(8000).then(() => false)]), 'the second copy quits after the message');
        assert.equal(await app.main.eval('1 + 1'), 2, 'the first copy is untouched');
      } finally {
        if (second.exitCode == null) spawn('taskkill', ['/PID', String(second.pid), '/T', '/F'], { stdio: 'ignore' });
      }
    },
  },
  {
    name: '종료 · 저장하지 않은 캡처가 있으면 저장 여부를 물음 (취소 · 저장)',
    run: async (app) => {
      await app.reset({ mode: 'capture', target: 'monitor', monitorId: null, imageFormat: 'png' });
      await capture(app);
      const before = pngFiles(app);
      // As after a cancelled save dialog: the image is still waiting to be saved.
      await app.main.eval(`window.__mycapture.state.result.path = null; 1`);
      await app.main.eval(`window.__mycapture.actions['win-close'](); 1`);
      let ask = await app.popup('confirm');
      assert.equal(await ask.eval(`document.querySelector('.confirm-text').textContent`), await app.main.eval(`window.__mycapture.t('exit.imageBody')`));
      assert.equal(await ask.eval(`document.querySelectorAll('.modal-foot button').length`), 3, "cancel · don't save · save");
      await ask.click('.modal-foot [data-action="close"]');
      ask.close();
      await sleep(500);
      assert.equal(await app.main.eval('1 + 1'), 2, 'cancel keeps the app open');
      assert.equal(app.process.exitCode, null);
      await app.main.eval(`window.__mycapture.actions['win-close'](); 1`);
      ask = await app.popup('confirm');
      const exited = new Promise((resolve) => app.process.once('exit', () => resolve(true)));
      await ask.click('[data-action="exit-choice"][data-value="save"]');
      ask.close();
      assert.ok(await Promise.race([exited, sleep(10000).then(() => false)]), `save, then quit (${await app.main.eval('JSON.stringify(window.__mycapture?.state.notice)').catch(() => 'window gone')})`);
      assert.equal(pngFiles(app), before + 1, 'the image was saved before quitting');
      assert.deepEqual(app.main.errors, [], 'uncaught exceptions in the main window');
      await app.restart();
    },
  },
  {
    name: '종료 · 녹화 중이면 저장 여부를 물음 (저장 안 함 → 파일 남기지 않음)',
    run: async (app) => {
      await app.reset({ mode: 'record', engine: 'native', target: 'monitor', videoFormat: 'webm', microphone: false });
      const before = webmFiles(app);
      await app.main.click('[data-action="record"]');
      await app.main.waitFor(`window.__mycapture.state.session.phase === 'recording'`, { timeout: 20000 });
      await sleep(1500);
      // A whole-screen recording minimizes the window; closing brings it back to ask.
      await app.main.eval(`window.__mycapture.actions['win-close'](); 1`);
      const ask = await app.popup('confirm');
      assert.equal(await ask.eval(`document.querySelector('.confirm-text').textContent`), await app.main.eval(`window.__mycapture.t('exit.recordingBody')`));
      const exited = new Promise((resolve) => app.process.once('exit', () => resolve(true)));
      await ask.click('[data-action="exit-choice"][data-value="discard"]');
      ask.close();
      assert.ok(await Promise.race([exited, sleep(10000).then(() => false)]), "don't save, then quit");
      assert.equal(webmFiles(app), before, 'the unfinished recording is removed');
      await app.restart();
    },
  },
  {
    name: '팝업은 메인 창 밖으로 표시 · 이동되고, 메인 창을 닫으면 함께 종료',
    run: async (app) => {
      await app.reset({ theme: 'dark-midnight' });
      const win = (label, command, args = {}) => app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|${command}', ${JSON.stringify({ label, ...args })})`);
      if (await win('main', 'is_maximized')) await win('main', 'unmaximize');
      await win('main', 'set_size', { value: { Logical: { width: 860, height: 600 } } });
      await sleep(500);
      const main = { ...(await win('main', 'outer_position')), ...(await win('main', 'outer_size')) };
      // The theme dropdown hangs below the small main window.
      await app.main.click('[data-action="theme-menu"]');
      const menu = await app.popup('theme-menu');
      const menuPos = await win('popup-theme-menu', 'outer_position');
      const menuSize = await win('popup-theme-menu', 'outer_size');
      assert.ok(menuPos.y + menuSize.height > main.y + main.height, 'dropdown extends past the bottom of the main window');
      await menu.key('Escape');
      menu.close();
      // A popup can be moved anywhere, independent of the main window.
      await app.main.click('[data-action="open-settings"]');
      const settings = await app.popup('settings');
      await win('popup-settings', 'set_position', { value: { Physical: { x: main.x + main.width + 40, y: main.y } } });
      await sleep(300);
      const moved = await win('popup-settings', 'outer_position');
      assert.ok(moved.x >= main.x + main.width, 'settings window sits outside the main window');
      assert.ok(await settings.eval(`document.querySelectorAll('.tab').length === ${SETTINGS_TABS.length}`), 'and still works there');
      await app.main.click('[data-action="open-about"]');
      await app.popup('about');
      await app.main.eval(`window.__mycapture.actions['win-close'](); 1`);
      const exited = await Promise.race([new Promise((resolve) => app.process.once('exit', () => resolve(true))), sleep(8000).then(() => false)]);
      assert.ok(exited, 'closing the main window ends the app and its popups');
    },
  },
  {
    name: '렌더러 오류 없음',
    run: async (app) => {
      assert.deepEqual(app.main.errors, [], 'uncaught exceptions in the main window');
    },
  },
];
