// Feature E2E: every feature of test/features.mjs driven in the real
// desktop app (Tauri, WebView2 over CDP). Each case names the feature IDs it
// checks (`ids`) and verifies what the user would see and, where files are
// written, the bytes on disk. Shell actions (file manager, mail, wallpaper,
// "Open with") and the scanner are faked by the backend (MYPHOTO_FAKE_SHELL,
// MYPHOTO_FAKE_SCANNER) so nothing opens on the test machine.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { readMetadata } from '../../src/formats/exif.js';
import { readOrientation } from '../../src/formats/jpeg-meta.js';
import { readZip, extractZip } from '../../src/formats/zip.js';
import { readEmbeddedXmp } from '../../src/formats/xmpembed.js';
import { ADOBE, buildIcc } from '../helpers/icc-build.mjs';
import { decodePng16, encodePng16 } from '../../src/formats/highbit.js';
import { encodeGif } from '../../src/create/gif.js';
import { sleep } from './cdp.mjs';
import { copyDir, fixtures, root } from './harness.mjs';

const P = 'window.__myphoto';
const js = (value) => JSON.stringify(value);
const TOP = `${P}.topDialog()`;

/** A real face photo for detection — read from its folder at test time only (never copied into the project). */
export const FACE_PHOTO = path.join(root, '..', 'FaceAlgorithm', 'images', '2025-09-30-111123.jpg');

// ───────────────────────── set-up (before the app starts)

export function prepare(work) {
  copyDir(path.join(root, 'test', 'fixtures', 'formats'), path.join(work, 'formats'));
  copyDir(path.join(root, 'test', 'fixtures', 'dicom'), path.join(work, 'dicom'));
  const put = (dir, names, rename = {}) => {
    fs.mkdirSync(path.join(work, dir), { recursive: true });
    for (const name of names) fs.copyFileSync(path.join(fixtures, name), path.join(work, dir, rename[name] ?? name));
  };
  put('studio', ['beach.jpg', 'city.jpg', 'forest.jpg', 'portrait.jpg', 'sunset.png', 'flower.webp']);
  fs.mkdirSync(path.join(work, 'studio', 'album'));
  put('import-src', ['beach.jpg', 'city.jpg', 'forest.jpg']);
  fs.mkdirSync(path.join(work, 'import-dst'));
  put('sync-src', ['beach.jpg', 'city.jpg', 'sunset.png']);
  put('sync-dst', ['forest.jpg', 'portrait.jpg'], { 'portrait.jpg': 'city.jpg' }); // stale file + changed file
  fs.mkdirSync(path.join(work, 'scan'));
  fs.mkdirSync(path.join(work, 'merge'));
  if (fs.existsSync(FACE_PHOTO)) {
    fs.mkdirSync(path.join(work, 'people'));
    fs.copyFileSync(FACE_PHOTO, path.join(work, 'people', 'face-a.jpg'));
    fs.copyFileSync(FACE_PHOTO, path.join(work, 'people', 'face-b.jpg'));
  }
}

export const env = (work) => ({ MYPHOTO_FAKE_SHELL: path.join(work, 'shell.log'), MYPHOTO_FAKE_SCANNER: path.join(fixtures, 'forest.jpg'), MYPHOTO_FAKE_PRINT: path.join(work, 'printed.pdf'), MYPHOTO_FAKE_MTP: path.join(work, 'phone') });

// ───────────────────────── helpers

const dir = (app, name) => path.join(app.work, name);
/** The app's visible top-level OS windows (Windows), as 'title | WxH' lines. */
const osWindows = (pid) => execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'test', 'e2e', 'os-windows.ps1'), '-ProcessId', String(pid)], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
const shellLog = (app) => (fs.existsSync(dir(app, 'shell.log')) ? fs.readFileSync(dir(app, 'shell.log'), 'utf8').trim().split(/\r?\n/).filter(Boolean).map((line) => line.split('\t')) : []);

async function open(app, folder, min = 1) {
  await app.main.eval(`${P}.closeAllDialogs(); ${P}.actions.setMode('manage'); ${P}.actions.openFolder(${js(folder)}); 1`);
  await app.main.waitFor(`${P}.app.state.source.path === ${js(folder)} && !${P}.app.state.loading && ${P}.app.state.list.length >= ${min}`, { message: `open ${folder}`, timeout: 20000 });
}

const listNames = (app) => app.main.eval(`${P}.app.state.list.map((i) => i.name)`);

async function pathOf(app, name) {
  const found = await app.main.eval(`${P}.app.state.list.find((i) => i.name === ${js(name)})?.path ?? null`);
  assert.ok(found, `${name} is listed`);
  return found;
}

async function select(app, ...names) {
  const paths = [];
  for (const name of names) paths.push(await pathOf(app, name));
  await app.main.eval(`${P}.actions.setSelection(${js(paths)}, ${js(paths[0])}); 1`);
  return paths;
}

async function reloadList(app) {
  await app.main.eval(`${P}.actions.reload(); 1`);
  await sleep(300);
  await app.main.waitFor(`!${P}.app.state.loading`);
}

/** Runs a menu item (by its translation keys) without waiting for it; menuDone() waits. */
async function menu(app, ...keys) {
  const result = await app.main.eval(`(() => { window.__menuDone = null; try { Promise.resolve(${P}.menu(${keys.map(js).join(', ')})).then(() => { window.__menuDone = 'ok'; }, (e) => { window.__menuDone = 'error: ' + (e?.message ?? e); }); return 'started'; } catch (e) { return 'error: ' + e.message; } })()`);
  assert.equal(result, 'started', `${keys.join(' › ')}: ${result}`);
}

async function menuDone(app, timeout = 60000) {
  await app.main.waitFor('window.__menuDone', { timeout, message: 'menu action finished' });
  assert.equal(await app.main.eval('window.__menuDone'), 'ok');
}

/** Waits for the topmost dialog to contain the text of an i18n key. */
async function dialog(app, key, timeout = 15000) {
  await app.main.waitFor(`(() => { const d = ${TOP}; return Boolean(d && d.textContent.includes(${P}.t(${js(key)}))); })()`, { timeout, message: `dialog with ${key}` });
}

/** Sets the control of the dialog field labelled `labelKey` (index-th of that label). */
async function setField(app, labelKey, value, index = 0) {
  const result = await app.main.eval(`(() => {
    const label = ${P}.t(${js(labelKey)});
    const field = [...${TOP}.querySelectorAll('.field')].filter((f) => f.querySelector('.field-label')?.textContent === label)[${index}];
    const control = field?.querySelector('input, select, textarea, .theme-select');
    if (!control) return 'missing ' + label;
    control.value = ${js(String(value))};
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return control.value === ${js(String(value))} ? 'ok' : 'value is ' + control.value;
  })()`);
  assert.equal(result, 'ok', `${labelKey}: ${result}`);
}

async function setCheck(app, labelKey, on) {
  const result = await app.main.eval(`(() => {
    const label = [...${TOP}.querySelectorAll('label.check')].find((l) => l.textContent.includes(${P}.t(${js(labelKey)})));
    const box = label?.querySelector('input');
    if (!box) return 'missing';
    box.checked = ${on}; box.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  })()`);
  assert.equal(result, 'ok', labelKey);
}

/** Clicks the button of the top dialog whose text contains the i18n text. */
async function clickText(app, key, scope = TOP) {
  const result = await app.main.eval(`(() => {
    const text = ${P}.t(${js(key)});
    const buttons = [...(${scope}).querySelectorAll('button')];
    const button = buttons.find((b) => b.textContent.trim() === text) ?? buttons.find((b) => b.textContent.trim().includes(text));
    if (!button) return 'missing ' + text;
    if (button.disabled) return 'disabled';
    button.click(); return 'ok';
  })()`);
  assert.equal(result, 'ok', `${key}: ${result}`);
}

const primary = (app) => app.main.eval(`${TOP}.querySelector('.dialog-buttons .btn.primary').click(); 1`);

/** Answers the next native folder / file / save pickers (true = the suggested save path). */
const pick = (app, ...answers) => app.main.eval(`(window.__myphotoPicks ||= []).push(...${js(answers)}); 1`);

async function waitToast(app, key) {
  await app.main.waitFor(`[...${P}.dqa('.toast-text')].some((e) => e.textContent.includes(${P}.t(${js(key)}).split('{')[0].trim()))`, { timeout: 30000, message: `toast ${key}` });
}

/** Size and mean colour (of a region in fractions) of a picture file, decoded in the page. */
async function imageInfo(app, file, region = null) {
  return app.main.eval(`(async () => {
    const blob = await (await fetch(window.__TAURI_INTERNALS__.convertFileSrc(${js(file)}) + '?t=' + Date.now())).blob();
    const bmp = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const g = canvas.getContext('2d'); g.drawImage(bmp, 0, 0);
    const r = ${js(region)} ?? { x: 0, y: 0, w: 1, h: 1 };
    const x = Math.floor(r.x * bmp.width); const y = Math.floor(r.y * bmp.height);
    const w = Math.max(1, Math.floor(r.w * bmp.width)); const h = Math.max(1, Math.floor(r.h * bmp.height));
    const d = g.getImageData(x, y, w, h).data; const s = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; }
    return { width: bmp.width, height: bmp.height, mean: s.map((v) => v / (d.length / 4)) };
  })()`, 60000);
}

/** Pixel size from a JPEG's SOF marker (no EXIF rotation applied). */
function jpegSize(bytes) {
  for (let i = 2; i < bytes.length - 9;) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marker = bytes[i + 1];
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [(bytes[i + 7] << 8) | bytes[i + 8], (bytes[i + 5] << 8) | bytes[i + 6]];
    i += 2 + length;
  }
  return null;
}

/** Frames of a GIF: walks the blocks (extensions, image descriptors) to the trailer. */
function gifFrames(bytes) {
  let p = 13;
  if (bytes[10] & 0x80) p += 3 * 2 ** ((bytes[10] & 7) + 1);
  const skipSubBlocks = () => { while (bytes[p]) p += bytes[p] + 1; p += 1; };
  let frames = 0;
  while (p < bytes.length && bytes[p] !== 0x3b) {
    if (bytes[p] === 0x21) { p += 2; skipSubBlocks(); continue; }
    if (bytes[p] !== 0x2c) throw new Error('bad GIF block at ' + p);
    frames += 1;
    const packed = bytes[p + 9];
    p += 10;
    if (packed & 0x80) p += 3 * 2 ** ((packed & 7) + 1);
    p += 1;
    skipSubBlocks();
  }
  return frames;
}

const isJpeg = (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8;
const newFiles = (folder, before) => fs.readdirSync(folder).filter((name) => !before.includes(name));

// ───────── editor helpers

const settle = (app) => app.main.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => r(1), 80))))');

async function openEditor(app, file) {
  await app.main.eval(`${P}.closeAllDialogs(); ${P}.actions.editPath(${js(file)}); 1`);
  await app.main.waitFor(`${P}.editor.path === ${js(file)} && ${P}.editor.debug().preview && Boolean(${P}.dq('.editor-preview'))`, { timeout: 60000, message: 'editor ready' });
  await settle(app);
}

async function signature(app) {
  await settle(app);
  return app.main.eval(`(() => { const s = ${P}.editor.testing.shown(); const c = document.createElement('canvas'); c.width = 48; c.height = 32; const g = c.getContext('2d'); g.drawImage(s, 0, 0, 48, 32); return { w: s.width, h: s.height, px: Array.from(g.getImageData(0, 0, 48, 32).data) }; })()`);
}

function difference(a, b) {
  if (a.w !== b.w || a.h !== b.h) return 255;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.px.length; i++) if (i % 4 !== 3) { sum += Math.abs(a.px[i] - b.px[i]); n++; }
  return sum / n;
}

const meanOf = (sig) => [0, 1, 2].map((c) => sig.px.filter((_, i) => i % 4 === c).reduce((s, v) => s + v, 0) / (sig.px.length / 4));
const editState = (app) => app.main.eval(`${P}.editor.debug()`);

async function resetEdit(app) {
  await app.main.eval(`${P}.editor.testing.goToHistory(0); 1`);
  await settle(app);
}

const section = (app, id) => app.main.eval(`${P}.editor.testing.setSection(${js(id)}); 1`);

async function slider(app, key, value) {
  const result = await app.main.eval(`(() => {
    const el = ${P}.dq(${js(`.editor-panel input.slider[data-key="${key}"]`)});
    if (!el) return 'missing';
    el.value = ${js(String(value))}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  })()`);
  assert.equal(result, 'ok', `slider ${key}`);
}

/** Runs `act` on a fresh edit and checks the preview pixels moved by at least `min` (mean |Δ| per channel). */
async function moves(app, label, act, min = 1) {
  await resetEdit(app);
  const before = await signature(app);
  await act();
  const after = await signature(app);
  const d = difference(before, after);
  assert.ok(d >= min, `${label}: preview changed by only ${d.toFixed(2)}`);
  return d;
}

/** Viewport point at fractions of the editor preview. */
async function at(app, fx, fy) {
  const r = await app.main.eval(`(() => { const r = ${P}.dq('.editor-preview').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  return { x: r.x + fx * r.w, y: r.y + fy * r.h };
}

async function leaveEditor(app) {
  await app.main.eval(`${P}.closeAllDialogs(); ${P}.editor.testing.goToHistory(0); ${P}.actions.setMode('manage'); 1`);
  await app.main.waitFor(`${P}.app.state.mode === 'manage'`);
}

// ───────────────────────── cases

export const cases = [
  // ───────── formats
  {
    ids: ['FMT-EXTRA', 'FMT-ICO', 'FMT-SVG', 'FMT-JP2', 'FMT-JXL', 'FMT-AVIF', 'FMT-PDF', 'FMT-GIF', 'FMT-TIFFPAGES', 'FMT-VIDEO', 'FMT-RAW', 'FMT-ZIP'],
    group: '형식', name: '추가 형식 폴더: 모든 파일이 목록에 나오고 썸네일이 만들어진다',
    run: async (app) => {
      await open(app, dir(app, 'formats'), 10);
      const names = await listNames(app);
      for (const name of fs.readdirSync(dir(app, 'formats'))) assert.ok(names.includes(name), `${name} listed`);
      const media = `${P}.app.state.list.filter((i) => !i.isDir && !/\\.zip$/i.test(i.name))`;
      await app.main.waitFor(`${media}.every((i) => { const e = ${P}.thumbs.peek(i); return e && (e.url || e.error); })`, { timeout: 180000, message: 'thumbnails' });
      const result = await app.main.eval(`${media}.map((i) => { const e = ${P}.thumbs.peek(i); return [i.name, e.url ? e.width + 'x' + e.height : 'error: ' + e.error]; })`);
      const failed = result.filter(([, v]) => v.startsWith('error') || v.startsWith('0x'));
      assert.deepEqual(failed, [], 'thumbnails');
    },
  },
  {
    ids: ['FMT-EXTRA', 'FMT-ICO', 'FMT-SVG', 'FMT-JP2', 'FMT-JXL', 'FMT-AVIF', 'FMT-PDF', 'FMT-GIF', 'FMT-TIFFPAGES', 'FMT-RAW', 'VIEW-NAV'],
    group: '형식', name: '보기 모드가 모든 추가 형식을 디코딩해 보여준다',
    run: async (app) => {
      await open(app, dir(app, 'formats'), 10);
      const files = (await listNames(app)).filter((n) => !/\.(zip|webm)$/i.test(n) && !n.includes('_00m'));
      const problems = [];
      for (const name of files) {
        const file = await pathOf(app, name);
        await app.main.eval(`${P}.actions.viewItem(${js(file)}); 1`);
        try {
          await app.main.waitFor(`(() => { const d = ${P}.viewer.debug(); return ${P}.viewer.currentPath === ${js(file)} && ((d.kind && d.kind !== 'placeholder' && d.width > 0) || Boolean(${P}.dq('.viewer .viewer-error'))); })()`, { timeout: 60000 });
          const error = await app.main.eval(`${P}.dq('.viewer .viewer-error')?.textContent ?? null`);
          if (error) problems.push(`${name}: ${error}`);
        } catch (error) {
          problems.push(`${name}: ${error.message}`);
        }
      }
      await app.main.eval(`${P}.actions.setMode('manage'); 1`);
      assert.deepEqual(problems, []);
    },
  },
  {
    ids: ['VIEW-PAGES', 'FMT-TIFFPAGES', 'FMT-PDF'],
    group: '보기', name: '여러 페이지: Ctrl+PageDown/Up 으로 TIFF·PDF 페이지, PageDown 은 다음 사진',
    run: async (app) => {
      await open(app, dir(app, 'formats'), 10);
      for (const name of ['pages.tif', 'document.pdf']) {
        const file = await pathOf(app, name);
        await app.main.eval(`${P}.actions.viewItem(${js(file)}); 1`);
        await app.main.waitFor(`${P}.viewer.currentPath === ${js(file)} && ${P}.viewer.debug().pages === 2`, { timeout: 30000, message: `${name}: 2 pages` });
        assert.equal(await app.main.eval(`${P}.viewer.debug().page`), 0);
        await app.main.key('PageDown', 2);
        await app.main.waitFor(`${P}.viewer.debug().page === 1 && ${P}.viewer.currentPath === ${js(file)} && ${P}.viewer.debug().kind !== 'placeholder'`, { message: `${name}: page 2` });
        assert.match(await app.main.eval(`${P}.dq('.page-label')?.textContent ?? ''`), /2/);
        await app.main.key('PageUp', 2);
        await app.main.waitFor(`${P}.viewer.debug().page === 0`);
      }
      const current = await app.main.eval(`${P}.viewer.currentPath`);
      await app.main.key('PageDown');
      await app.main.waitFor(`${P}.viewer.currentPath !== ${js(current)}`, { message: 'PageDown goes to the next photo' });
      await app.main.eval(`${P}.actions.setMode('manage'); 1`);
    },
  },
  {
    ids: ['VIEW-VIDEO', 'VIEW-FRAME', 'FMT-VIDEO'],
    group: '보기', name: '동영상 재생 → 현재 프레임을 JPEG 로 저장',
    run: async (app) => {
      await open(app, dir(app, 'formats'), 10);
      const file = await pathOf(app, 'clip.webm');
      await app.main.eval(`${P}.actions.viewItem(${js(file)}); 1`);
      await app.main.waitFor(`${P}.viewer.debug().kind === 'video' && ${P}.dq('.viewer video')?.readyState >= 2`, { timeout: 30000, message: 'video loaded' });
      const time = await app.main.eval(`(async () => { const v = ${P}.dq('.viewer video'); v.muted = true; await v.play(); await new Promise((r) => setTimeout(r, 900)); v.pause(); return v.currentTime; })()`);
      assert.ok(time > 0.3, `played ${time}s`);
      const before = fs.readdirSync(dir(app, 'formats'));
      await app.main.eval(`${P}.viewer.testing.saveVideoFrame()`);
      const added = newFiles(dir(app, 'formats'), before);
      assert.equal(added.length, 1, 'one frame file');
      assert.match(added[0], /^clip_\d\dm\d\ds\.jpg$/);
      const bytes = fs.readFileSync(path.join(dir(app, 'formats'), added[0]));
      assert.ok(isJpeg(bytes) && bytes.length > 2000);
      const info = await imageInfo(app, path.join(dir(app, 'formats'), added[0]));
      assert.ok(info.width > 0 && info.height > 0);
      fs.rmSync(path.join(dir(app, 'formats'), added[0]));
      await app.main.eval(`${P}.actions.setMode('manage'); 1`);
    },
  },
  {
    ids: ['VIEW-VIDEOTRIM'],
    group: '보기', name: '동영상 자르기: 보기 도구 모음에서 시작·끝을 정하면 그 부분만 새 WebM 으로(원본은 그대로)',
    run: async (app) => {
      const studio = dir(app, 'studio');
      const clip = path.join(studio, 'clip-trim.webm');
      fs.copyFileSync(path.join(fixtures, '..', 'formats', 'clip.webm'), clip);
      const original = fs.readFileSync(clip);
      await open(app, studio, 6);
      await reloadList(app);
      const file = await pathOf(app, 'clip-trim.webm');
      await app.main.eval(`${P}.actions.viewItem(${js(file)}); 1`);
      await app.main.waitFor(`${P}.app.state.mode === 'view' && ${P}.viewer.debug().kind === 'video' && Boolean(document.querySelector('#viewer-trim'))`, { timeout: 20000 });
      await app.main.eval(`document.querySelector('#viewer-trim').click(); 1`);
      await app.main.waitFor(`${TOP}?.id === 'trim-dialog'`, { timeout: 15000 });
      const duration = await app.main.eval(`Number(${TOP}.querySelector('[data-key=trim-end]').value)`);
      assert.ok(duration >= 1.5, `clip length ${duration}`);
      const set = (key, value) => app.main.eval(`(() => { const i = ${TOP}.querySelector('[data-key=${key}]'); i.value = ${js(String(value))}; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      // An end before the start is refused.
      await set('trim-start', 1);
      await set('trim-end', 0.5);
      assert.ok(await app.main.eval(`${TOP}.querySelector('.trim-length').classList.contains('error')`));
      await set('trim-start', 0.2);
      await set('trim-end', 1.2);
      await set('trim-name', 'clip-part');
      await primary(app);
      const out = path.join(studio, 'clip-part.webm');
      for (let i = 0; i < 300 && !fs.existsSync(out); i++) await sleep(100);
      assert.ok(fs.existsSync(out), 'trimmed file written');
      await app.main.waitFor(`!${TOP}`, { timeout: 30000 });
      const bytes = fs.readFileSync(out);
      assert.deepEqual([...bytes.subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3], 'WebM');
      assert.ok(fs.readFileSync(clip).equals(original), 'original unchanged');
      // Its real length (seek to the end: MediaRecorder files carry no duration).
      const length = await app.main.eval(`(async () => { const v = document.createElement('video'); v.src = window.__TAURI_INTERNALS__.convertFileSrc(${js(out)}); await new Promise((r) => { v.onloadedmetadata = r; setTimeout(r, 5000); }); if (!Number.isFinite(v.duration)) { v.currentTime = 1e6; await new Promise((r) => { v.ondurationchange = r; setTimeout(r, 5000); }); } return { d: v.duration, w: v.videoWidth }; })()`);
      assert.ok(length.d > 0.6 && length.d < 1.9, `trimmed length ${length.d}`);
      assert.ok(length.w > 0, 'has a picture');
      await app.main.key('Escape');
      await app.main.waitFor(`${P}.app.state.mode === 'manage'`);
    },
  },
  {
    ids: ['VIEW-VIDEOOPTS'],
    group: '보기', name: '동영상 재생·화면 옵션: 반복·소리·속도·화면 맞춤(창/실제/채우기) 도구, 설정의 동영상 탭(자동 재생·컨트롤·음량), 보던 곳부터 이어서',
    run: async (app) => {
      const studio = dir(app, 'studio');
      fs.copyFileSync(path.join(fixtures, '..', 'formats', 'clip.webm'), path.join(studio, 'clip-opts.webm'));
      await open(app, studio, 6);
      await reloadList(app);
      const clip = await pathOf(app, 'clip-opts.webm');
      const video = () => app.main.eval(`(() => { const v = document.querySelector('video.viewer-media'); return v ? { loop: v.loop, muted: v.muted, rate: v.playbackRate, controls: v.controls, paused: v.paused, time: v.currentTime, volume: v.volume, w: v.getBoundingClientRect().width, h: v.getBoundingClientRect().height, vw: v.videoWidth } : null; })()`);
      const showClip = async () => {
        await app.main.eval(`${P}.actions.viewItem(${js(clip)}); 1`);
        await app.main.waitFor(`${P}.viewer.debug().kind === 'video' && Boolean(document.querySelector('#video-loop'))`, { timeout: 20000, message: 'video shown' });
      };
      await showClip();
      let v = await video();
      assert.deepEqual({ loop: v.loop, muted: v.muted, rate: v.rate, controls: v.controls }, { loop: false, muted: false, rate: 1, controls: true }, 'defaults');
      // Toolbar: repeat, sound, speed.
      await app.main.eval(`document.querySelector('#video-loop').click(); 1`);
      await app.main.eval(`document.querySelector('#video-mute').click(); 1`);
      await app.main.eval(`(() => { const s = document.querySelector('[data-key=video-speed]'); s.value = '2'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      v = await video();
      assert.deepEqual({ loop: v.loop, muted: v.muted, rate: v.rate }, { loop: true, muted: true, rate: 2 });
      assert.deepEqual(await app.main.eval(`(({ loop, muted, speed }) => ({ loop, muted, speed }))(${P}.app.settings.video)`), { loop: true, muted: true, speed: 2 }, 'remembered');
      // On the screen: fit the window (enlarged), actual size, fill.
      const stage = await app.main.eval(`(() => { const r = document.querySelector('.viewer-stage').getBoundingClientRect(); return { w: r.width, h: r.height }; })()`);
      const setFit = (mode) => app.main.eval(`(() => { const s = document.querySelector('[data-key=video-fit]'); s.value = ${js(mode)}; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await setFit('actual');
      await settle(app);
      v = await video();
      assert.ok(Math.abs(v.w - v.vw) < 2, `actual size ${v.w} vs ${v.vw}`);
      await setFit('fit');
      await settle(app);
      v = await video();
      assert.ok(v.w <= stage.w && v.h <= stage.h && (stage.w - v.w < 12 || stage.h - v.h < 12), `fits the window ${JSON.stringify([v.w, v.h, stage])}`);
      await setFit('fill');
      await settle(app);
      v = await video();
      assert.ok(v.w >= stage.w - 1 && v.h >= stage.h - 1, `fills the window ${JSON.stringify([v.w, v.h, stage])}`);
      await setFit('fit');
      // Resume: leave at 1 s, come back there.
      await app.main.eval(`(() => { const v = document.querySelector('video.viewer-media'); v.pause(); v.currentTime = 1; v.dispatchEvent(new Event('timeupdate')); return 1; })()`);
      await app.main.key('Escape');
      await app.main.waitFor(`${P}.app.state.mode === 'manage'`);
      // Settings → Video: no autoplay, no controls, volume 40.
      await app.main.eval(`${P}.dq('#open-settings').click(); 1`);
      await app.main.waitFor(`${TOP}?.id === 'settings-dialog'`);
      await app.main.eval(`${TOP}.querySelector('.settings-tab[data-tab=video]').click(); 1`);
      await app.main.eval(`(() => { const box = ${TOP}; for (const key of ['autoplay', 'controls']) { const c = box.querySelector(\`[data-key=video-\${key}]\`); c.checked = false; } box.querySelector('[data-key=video-volume]').value = '40'; return 1; })()`);
      await primary(app);
      await app.main.waitFor(`!${TOP} && ${P}.app.settings.video.autoplay === false`);
      await showClip();
      await sleep(600);
      v = await video();
      assert.equal(v.paused, true, 'no autoplay');
      assert.equal(v.controls, false, 'no controls');
      assert.ok(Math.abs(v.volume - 0.4) < 0.01, 'volume 40 %');
      assert.ok(Math.abs(v.time - 1) < 0.3, `resumed at ${v.time}`);
      await app.main.eval(`${P}.app.settings.video = {}; ${P}.app.saveSettings(); 1`);
      await app.main.key('Escape');
      await app.main.waitFor(`${P}.app.state.mode === 'manage'`);
    },
  },
  {
    ids: ['VIEW-ANIMPLAY'],
    group: '보기', name: '움직이는 GIF·동영상: 도구 모음의 재생/일시정지·정지(처음으로)·이전/다음 프레임, Space, 화면에 보이는 프레임이 맞다',
    run: async (app) => {
      const folder = dir(app, 'anim');
      fs.mkdirSync(folder, { recursive: true });
      // Four solid frames: red, green, blue, yellow.
      const colours = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]];
      const solid = ([r, g, b]) => { const data = new Uint8ClampedArray(64 * 48 * 4); for (let i = 0; i < data.length; i += 4) data.set([r, g, b, 255], i); return { width: 64, height: 48, data }; };
      fs.writeFileSync(path.join(folder, 'anim.gif'), encodeGif(colours.map((c) => ({ image: solid(c) })), { delay: 120 }));
      fs.copyFileSync(path.join(fixtures, 'flower.webp'), path.join(folder, 'still.webp'));
      fs.copyFileSync(path.join(fixtures, '..', 'formats', 'clip.webm'), path.join(folder, 'clip-media.webm'));
      await open(app, folder, 3);
      await app.main.eval(`${P}.actions.viewItem(${js(await pathOf(app, 'anim.gif'))}); 1`);
      await app.main.waitFor(`${P}.viewer.debug().anim?.count === 4 && Boolean(document.querySelector('#media-play'))`, { timeout: 20000, message: 'animated GIF with play controls' });
      const anim = () => app.main.eval(`${P}.viewer.debug().anim`);
      assert.equal((await anim()).playing, true, 'plays when opened');
      const start = (await anim()).frame;
      await app.main.waitFor(`${P}.viewer.debug().anim.frame !== ${start}`, { message: 'frames advance' });
      // What is on screen is the frame it says.
      const shown = () => app.main.eval(`(() => { const c = document.querySelector('canvas.viewer-media'); const p = c.getContext('2d').getImageData(32, 24, 1, 1).data; return { rgb: [p[0], p[1], p[2]], frame: ${P}.viewer.debug().anim.frame, label: document.querySelector('#media-position').textContent }; })()`);
      // Pause with a real press and release while frames keep coming.
      const at = await app.main.eval(`(() => { const r = document.querySelector('#media-play').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await app.main.mouse('mouseMoved', at.x, at.y, { button: 'none' });
      await app.main.mouse('mousePressed', at.x, at.y);
      await sleep(200);
      await app.main.mouse('mouseReleased', at.x, at.y);
      await app.main.waitFor(`${P}.viewer.debug().anim.playing === false`, { timeout: 3000, message: 'pause' });
      const paused = await shown();
      await sleep(500);
      assert.deepEqual(await shown(), paused, 'stays on the paused frame');
      assert.deepEqual(paused.rgb, colours[paused.frame], 'the paused frame is on screen');
      assert.equal(paused.label, `${paused.frame + 1} / 4`);
      // Step forward and back.
      await app.main.eval(`document.querySelector('#media-next-frame').click(); 1`);
      await app.main.waitFor(`${P}.viewer.debug().anim.frame === ${(paused.frame + 1) % 4}`, { message: 'next frame' });
      assert.deepEqual((await shown()).rgb, colours[(paused.frame + 1) % 4]);
      await app.main.eval(`document.querySelector('#media-prev-frame').click(); document.querySelector('#media-prev-frame').click(); 1`);
      await app.main.waitFor(`${P}.viewer.debug().anim.frame === ${(paused.frame + 3) % 4}`, { message: 'previous frame twice' });
      // Space plays, the stop button goes back to the first frame.
      await app.main.key(' ');
      await app.main.waitFor(`${P}.viewer.debug().anim.playing`, { message: 'Space plays' });
      await app.main.eval(`document.querySelector('#media-stop').click(); 1`);
      await app.main.waitFor(`!${P}.viewer.debug().anim.playing && ${P}.viewer.debug().anim.frame === 0`, { message: 'stop' });
      assert.deepEqual((await shown()).rgb, colours[0], 'stop shows the first frame');
      // A still picture has no play controls.
      await app.main.eval(`${P}.actions.viewItem(${js(await pathOf(app, 'still.webp'))}); 1`);
      await app.main.waitFor(`${P}.viewer.debug().kind === 'native' && document.querySelector('.viewer-status .status-name')?.textContent.includes('still')`, { timeout: 20000, message: 'still picture' });
      assert.equal(await app.main.eval(`Boolean(document.querySelector('#media-play')) || ${P}.viewer.debug().anim !== null`), false, 'no play controls on a still picture');
      // A video gets the same buttons.
      await app.main.eval(`${P}.app.settings.video = { ...(${P}.app.settings.video ?? {}), autoplay: false, muted: true }; ${P}.actions.viewItem(${js(await pathOf(app, 'clip-media.webm'))}); 1`);
      await app.main.waitFor(`${P}.viewer.debug().kind === 'video' && Boolean(document.querySelector('#media-play')) && document.querySelector('video.viewer-media')?.readyState >= 2`, { timeout: 20000, message: 'video with play controls' });
      const vid = () => app.main.eval(`(() => { const v = document.querySelector('video.viewer-media'); return { paused: v.paused, time: v.currentTime, label: document.querySelector('#media-position').textContent, pressed: document.querySelector('#media-play').getAttribute('aria-pressed') }; })()`);
      await app.main.eval(`document.querySelector('#media-play').click(); 1`);
      await app.main.waitFor(`document.querySelector('video.viewer-media').currentTime > 0.4`, { message: 'video plays' });
      assert.equal((await vid()).pressed, 'true');
      await app.main.eval(`document.querySelector('#media-play').click(); 1`);
      await app.main.waitFor(`document.querySelector('video.viewer-media').paused`, { message: 'video pauses' });
      const t1 = (await vid()).time;
      await app.main.eval(`document.querySelector('#media-next-frame').click(); 1`);
      await app.main.waitFor(`document.querySelector('video.viewer-media').currentTime > ${t1}`, { message: 'video next frame' });
      await app.main.eval(`document.querySelector('#media-stop').click(); 1`);
      await app.main.waitFor(`document.querySelector('video.viewer-media').paused && document.querySelector('video.viewer-media').currentTime === 0`, { message: 'video stop' });
      assert.match((await vid()).label, /^0:00 \/ \d+:\d\d$/);
      await app.main.eval(`${P}.app.settings.video = {}; ${P}.app.saveSettings(); 1`);
      await app.main.key('Escape');
      await app.main.waitFor(`${P}.app.state.mode === 'manage'`);
    },
  },
  {
    ids: ['EDIT-RAW', 'FMT-RAW'],
    group: '편집', name: 'RAW 현상: 미리 보기 없는 Bayer DNG 를 LibRaw 로 디모자이크 (숲 사진의 초록이 살아 있다), 화이트 밸런스 바꾸기',
    run: async (app) => {
      await open(app, dir(app, 'formats'), 10);
      const file = await pathOf(app, 'sensor.dng');
      await openEditor(app, file);
      const state = await editState(app);
      assert.equal(state.rawMode, 'camera', 'developed as RAW');
      assert.ok(state.full.w >= 300 && state.full.h >= 200, `${state.full.w}x${state.full.h}`);
      const [r, g, b] = meanOf(await signature(app));
      assert.ok(g > r + 5 && g > b + 5, `green forest: RGB ${r.toFixed(0)}, ${g.toFixed(0)}, ${b.toFixed(0)}`);
      await section(app, 'light');
      await app.main.eval(`(() => { const s = [...${P}.dqa('.editor-panel select')].find((x) => [...x.options].some((o) => o.value === 'daylight')); s.value = 'auto'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await app.main.waitFor(`${P}.editor.debug().rawMode === 'auto'`, { timeout: 30000 });
      await leaveEditor(app);
    },
  },
  {
    ids: ['BROWSE-ZIP', 'FMT-ZIP'],
    group: '탐색', name: 'ZIP 보관함을 열면 안의 사진이 읽기 전용 폴더로 보인다',
    run: async (app) => {
      await open(app, dir(app, 'formats'), 10);
      const file = await pathOf(app, 'album.zip');
      await app.main.eval(`${P}.actions.viewItem(${js(file)}); 1`);
      await app.main.waitFor(`${P}.app.state.source.path?.startsWith('@') && !${P}.app.state.loading && ${P}.app.state.list.length > 0`, { timeout: 20000, message: 'archive opened' });
      let names = await listNames(app);
      if (names.includes('zipped')) {
        await app.main.eval(`${P}.actions.openFolder(${P}.app.state.list.find((i) => i.name === 'zipped').path); 1`);
        await app.main.waitFor(`${P}.app.state.list.some((i) => i.name === 'photo-1.jpg')`);
        names = await listNames(app);
      }
      assert.deepEqual(names.filter((n) => n.endsWith('.jpg')).sort(), ['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg']);
      await app.main.waitFor(`${P}.app.state.list.every((i) => ${P}.thumbs.peek(i)?.url)`, { timeout: 60000, message: 'thumbnails of zipped photos' });
      assert.equal(await app.main.eval(`${P}.fs.isReadOnly?.(${P}.app.state.list[0].path) ?? true`), true, 'read-only');
    },
  },

  // ───────── browse
  {
    ids: ['BROWSE-TILES'],
    group: '보기 방식', name: '타일 보기와 필름 스트립(위에 큰 미리 보기, → 로 다음 사진), 폴더 아이콘은 이름 위 가운데',
    run: async (app) => {
      fs.mkdirSync(path.join(dir(app, 'studio'), 'albums'), { recursive: true });
      await open(app, dir(app, 'studio'), 6);
      // A folder's icon sits in the middle of its thumbnail, right above its name.
      const folderTile = () => app.main.eval(`(() => { const e = ${P}.dqa('.tile.is-dir').find((t) => t.textContent.includes('albums')); if (!e) return null; const box = (e.querySelector('.tile-thumb') ?? e.querySelector('.tiles-media')).getBoundingClientRect(); const i = e.querySelector('.tile-icon svg').getBoundingClientRect(); const n = (e.querySelector('.tile-name') ?? box); const nb = n.getBoundingClientRect ? n.getBoundingClientRect() : n; return { box: box.left + box.width / 2, icon: i.left + i.width / 2, name: nb.left + nb.width / 2, top: i.top - box.top, bottom: box.bottom - i.bottom }; })()`);
      await app.main.waitFor(`${P}.dqa('.tile.is-dir').some((t) => t.textContent.includes('albums'))`, { message: 'folder tile' });
      const thumbs = await folderTile();
      assert.ok(Math.abs(thumbs.icon - thumbs.box) < 2 && Math.abs(thumbs.icon - thumbs.name) < 2, `thumbnails: folder centred ${JSON.stringify(thumbs)}`);
      assert.ok(Math.abs(thumbs.top - thumbs.bottom) < 3, 'and vertically');
      await menu(app, 'view', 'menu.viewStyle', 'viewStyle.tiles');
      await menuDone(app);
      await app.main.waitFor(`${P}.dqa('.filelist[data-view=tiles] .tile').length >= 6`, { message: 'tiles' });
      const tiles = await folderTile();
      assert.ok(Math.abs(tiles.icon - tiles.box) < 2 && Math.abs(tiles.top - tiles.bottom) < 3, `tiles: folder centred ${JSON.stringify(tiles)}`);
      await menu(app, 'view', 'menu.viewStyle', 'viewStyle.filmstrip');
      await menuDone(app);
      await app.main.waitFor(`Boolean(${P}.dq('.filelist[data-view=filmstrip]'))`);
      const [first] = await select(app, 'beach.jpg');
      await app.main.waitFor(`!${P}.dq('.film-preview').hidden && ${P}.dq('.film-preview .film-caption')?.textContent === 'beach.jpg'`, { message: 'film preview' });
      await app.main.eval(`${P}.dq('.filelist').focus(); 1`);
      await app.main.key('ArrowRight');
      await app.main.waitFor(`${P}.app.state.focus !== ${js(first)} && ${P}.dq('.film-preview .film-caption')?.textContent !== 'beach.jpg'`, { message: 'next in the strip' });
      await app.main.eval(`${P}.app.settings.view = 'thumbs'; ${P}.app.emit('resort'); 1`);
    },
  },
  {
    ids: ['BROWSE-BASKET', 'BROWSE-ALLMEDIA', 'BROWSE-PREVIEW'],
    group: '탐색', name: '바구니(Ctrl+B)·"모든 미디어"·미리 보기 창',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      await app.main.eval(`${P}.app.catalog.clearBasket?.(); 1`);
      await select(app, 'beach.jpg', 'city.jpg');
      await app.main.eval(`${P}.dq('.filelist').focus(); 1`);
      await app.main.key('b', 2);
      await app.main.waitFor(`${P}.app.catalog.basket.length === 2`, { message: 'two in the basket' });
      await menu(app, 'organize', 'organize.showBasket');
      await menuDone(app);
      await app.main.waitFor(`${P}.app.state.source.type === 'basket' && ${P}.app.state.list.length === 2`);
      await app.main.eval(`${P}.actions.showLeftTab('catalog'); 1`);
      await app.main.eval(`[...${P}.dqa('.cat-row')].find((r) => r.querySelector('.cat-label')?.textContent === ${P}.t('catalog.allMedia')).click(); 1`);
      await app.main.waitFor(`${P}.app.state.source.type === 'filter' && ${P}.app.state.list.length >= 6`, { message: 'all media' });
      await open(app, dir(app, 'studio'), 6);
      await app.main.eval(`${P}.actions.showRightTab('preview'); 1`);
      await select(app, 'forest.jpg');
      await app.main.waitFor(`${P}.dq('.preview-name')?.textContent.includes('forest.jpg') && Boolean(${P}.dq('.preview-frame img, .preview-frame canvas, .preview-frame video'))`, { message: 'preview pane' });
      assert.ok(await app.main.eval(`Boolean(${P}.dq('canvas.preview-histogram'))`));
      await app.main.eval(`${P}.actions.showRightTab('properties'); 1`);
    },
  },
  {
    ids: ['ORG-HIERKEY', 'BROWSE-SEARCH', 'BROWSE-SAVEDSEARCH'],
    group: '정리', name: '계층 키워드(Travel|Korea|Busan) → "keyword:travel" 검색 → 저장된 검색으로 다시 열기',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      const [beach] = await select(app, 'beach.jpg');
      await app.main.eval(`${P}.actions.showRightTab('properties'); 1`);
      await app.main.waitFor(`Boolean(${P}.dq('[data-field=keywords]'))`);
      await app.main.eval(`(() => { const i = ${P}.dq('[data-field=keywords]'); i.value = 'Travel|Korea|Busan'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return 1; })()`);
      await app.main.waitFor(`${P}.app.catalog.get(${js(beach)})?.keywords?.includes('Travel|Korea|Busan')`);
      await app.main.eval(`(() => { const s = ${P}.dq('#quick-search'); s.value = 'keyword:travel'; s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return 1; })()`);
      await app.main.waitFor(`${P}.app.state.source.type === 'search' && !${P}.app.state.loading && ${P}.app.state.list.some((i) => i.path === ${js(beach)})`, { message: 'parent keyword finds the child' });
      assert.ok(!(await listNames(app)).includes('city.jpg'));
      await app.main.eval(`${P}.actions.showLeftTab('search'); 1`);
      await app.main.eval(`(() => { const label = ${P}.t('search.keywords'); const f = [...${P}.dqa('.side-pane .field')].find((x) => x.querySelector('.field-label')?.textContent === label); const i = f.querySelector('input'); i.value = 'korea'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await clickText(app, 'search.save', `${P}.dq('.side-pane.left')`);
      await dialog(app, 'search.saveName');
      await setField(app, 'search.saveName', 'Trips');
      await primary(app);
      await app.main.waitFor(`${P}.app.catalog.savedSearches.some((s) => s.name === 'Trips')`);
      await open(app, dir(app, 'studio'), 6);
      await app.main.eval(`${P}.actions.showLeftTab('catalog'); 1`);
      await app.main.waitFor(`[...${P}.dqa('.cat-row .cat-label')].some((e) => e.textContent === 'Trips')`, { message: 'saved search in the catalog pane' });
      await app.main.eval(`[...${P}.dqa('.cat-row')].find((r) => r.querySelector('.cat-label')?.textContent === 'Trips').click(); 1`);
      await app.main.waitFor(`${P}.app.state.source.type === 'search' && ${P}.app.state.source.title === 'Trips' && ${P}.app.state.list.some((i) => i.path === ${js(beach)})`);
      await app.main.eval(`${P}.actions.showLeftTab('folders'); 1`);
    },
  },
  {
    ids: ['ORG-COLLECTION', 'ORG-SMARTCOLLECTION'],
    group: '정리', name: '컬렉션(선택한 사진으로 만들기·보기·빼기)과 스마트 컬렉션(규칙 편집, 일치 수 미리 보기, 조건이 바뀌면 목록도 바뀜)',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      const pair = await select(app, 'beach.jpg', 'city.jpg');
      await app.main.eval(`${P}.actions.showLeftTab('catalog'); 1`);
      await app.main.waitFor(`Boolean(${P}.dq('#new-collection'))`);
      // A manual collection from the selection.
      await app.main.eval(`${P}.dq('#new-collection').click(); 1`);
      await app.main.waitFor(`Boolean(${TOP}?.querySelector('input'))`);
      await app.main.eval(`(() => { const i = ${TOP}.querySelector('input'); i.value = 'Trip'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await primary(app);
      await app.main.waitFor(`${P}.dqa('.collections .cat-row[data-smart=false]').some((r) => r.textContent.includes('Trip') && r.querySelector('.cat-count').textContent === '2')`, { message: 'collection row with 2' });
      await app.main.eval(`${P}.dqa('.collections .cat-row').find((r) => r.textContent.includes('Trip')).click(); 1`);
      await app.main.waitFor(`${P}.app.state.source.type === 'collection' && !${P}.app.state.loading`);
      assert.deepEqual((await listNames(app)).sort(), ['beach.jpg', 'city.jpg']);
      // Taking one out updates the list on screen.
      const id = await app.main.eval(`${P}.app.state.source.id`);
      await app.main.eval(`${P}.app.catalog.removeFromCollection(${js(id)}, [${js(pair[0])}]); 1`);
      await app.main.waitFor(`${P}.app.state.list.map((i) => i.name).join() === 'city.jpg'`, { message: 'list follows the collection' });

      // A smart collection: rating ≥ 4 (default rule) and keyword "sunset".
      await open(app, dir(app, 'studio'), 6);
      const [forest, portrait] = await Promise.all([pathOf(app, 'forest.jpg'), pathOf(app, 'portrait.jpg')]);
      await app.main.eval(`${P}.app.catalog.setRating([${js(forest)}, ${js(portrait)}], 5); ${P}.app.catalog.addKeywords([${js(forest)}], ['sunset']); 1`);
      await app.main.eval(`${P}.dq('#new-smart-collection').click(); 1`);
      await app.main.waitFor(`${TOP}?.id === 'smart-collection-dialog'`);
      await app.main.waitFor(`/2/.test(${TOP}.querySelector('.rule-count').textContent)`, { message: 'preview: two rated photos' });
      await app.main.eval(`(() => { const i = ${TOP}.querySelector('[data-key=collection-name]'); i.value = 'Best sunsets'; i.dispatchEvent(new Event('input', { bubbles: true })); ${TOP}.querySelector('#add-rule').click(); return 1; })()`);
      await app.main.eval(`(() => { const v = ${TOP}.querySelector('[data-rule="1-value"]'); v.value = 'sunset'; v.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await app.main.waitFor(`/1/.test(${TOP}.querySelector('.rule-count').textContent)`, { message: 'preview: one photo' });
      await primary(app);
      await app.main.waitFor(`${P}.app.state.source.type === 'collection' && !${P}.app.state.loading && ${P}.app.state.list.map((i) => i.name).join() === 'forest.jpg'`, { message: 'smart collection shown' });
      // Rules are live: tagging another rated photo brings it in.
      await app.main.eval(`${P}.app.catalog.addKeywords([${js(portrait)}], ['sunset']); 1`);
      await app.main.waitFor(`${P}.app.state.list.map((i) => i.name).sort().join() === 'forest.jpg,portrait.jpg'`, { message: 'live update' });
      // The rules and both collections are what the catalog saves.
      const smart = await app.main.eval(`${P}.app.catalog.collections.find((c) => c.smart)`);
      assert.deepEqual(smart.rules, [{ field: 'rating', op: '>=', value: '4' }, { field: 'keyword', op: 'has', value: 'sunset' }]);
      assert.equal(smart.match, 'all');
      const saved = await app.main.eval(`JSON.stringify(${P}.app.catalog.toJSON().collections.map((c) => c.name))`);
      assert.deepEqual(JSON.parse(saved).sort(), ['Best sunsets', 'Trip']);
    },
  },
  {
    ids: ['FILE-CLIPBOARD'],
    group: '파일', name: 'Ctrl+C / Ctrl+V 로 복사, Ctrl+X / Ctrl+V 로 이동 — 디스크 확인',
    run: async (app) => {
      const studio = dir(app, 'studio');
      fs.mkdirSync(path.join(studio, 'clip'), { recursive: true });
      fs.copyFileSync(path.join(fixtures, 'flower.webp'), path.join(studio, 'cut-me.webp'));
      await open(app, studio, 6);
      await select(app, 'sunset.png');
      await app.main.eval(`${P}.dq('.filelist').focus(); 1`);
      await app.main.key('c', 2);
      await app.main.eval(`${P}.actions.openFolder(${js(path.join(studio, 'clip'))}); 1`);
      await app.main.waitFor(`${P}.app.state.source.path === ${js(path.join(studio, 'clip'))} && !${P}.app.state.loading`);
      await app.main.eval(`${P}.dq('.filelist').focus(); 1`);
      await app.main.key('v', 2);
      await app.main.waitFor(`${P}.app.state.list.some((i) => i.name === 'sunset.png')`, { message: 'pasted copy' });
      assert.ok(fs.existsSync(path.join(studio, 'sunset.png')) && fs.existsSync(path.join(studio, 'clip', 'sunset.png')));
      await open(app, studio, 6);
      await select(app, 'cut-me.webp');
      await app.main.eval(`${P}.dq('.filelist').focus(); 1`);
      await app.main.key('x', 2);
      await app.main.eval(`${P}.actions.openFolder(${js(path.join(studio, 'clip'))}); 1`);
      await app.main.waitFor(`${P}.app.state.source.path === ${js(path.join(studio, 'clip'))} && !${P}.app.state.loading`);
      await app.main.eval(`${P}.dq('.filelist').focus(); 1`);
      await app.main.key('v', 2);
      await app.main.waitFor(`${P}.app.state.list.some((i) => i.name === 'cut-me.webp')`, { message: 'pasted move' });
      for (let i = 0; i < 30 && fs.existsSync(path.join(studio, 'cut-me.webp')); i++) await sleep(100);
      assert.ok(!fs.existsSync(path.join(studio, 'cut-me.webp')) && fs.existsSync(path.join(studio, 'clip', 'cut-me.webp')));
    },
  },
  {
    ids: ['FILE-KEYS'],
    group: '설정', name: '단축키 바꾸기: "바구니에 넣기"를 Ctrl+K 로 → Ctrl+K 가 동작하고 Ctrl+B 는 아니다, 되돌리기',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      await menu(app, 'help', 'keys.title');
      await app.main.waitFor(`Boolean(${P}.dq('#keymap-dialog [data-command=basket]'))`);
      await app.main.eval(`${P}.dq('#keymap-dialog [data-command=basket]').click(); 1`);
      await app.main.waitFor(`${P}.dq('#keymap-dialog [data-command=basket]').textContent === ${P}.t('keys.press')`);
      await app.main.key('k', 2);
      await app.main.waitFor(`${P}.app.settings.keys.basket === 'Ctrl+K'`, { message: 'captured Ctrl+K' });
      assert.equal(await app.main.eval(`${P}.dq('#keymap-dialog [data-command=basket]').textContent`), 'Ctrl+K');
      await primary(app);
      await menuDone(app);
      await app.main.eval(`${P}.app.catalog.clearBasket?.(); 1`);
      const [forest] = await select(app, 'forest.jpg');
      await app.main.eval(`${P}.dq('.filelist').focus(); 1`);
      await app.main.key('b', 2);
      await sleep(300);
      assert.ok(!(await app.main.eval(`${P}.app.catalog.basket.includes(${js(forest)})`)), 'Ctrl+B no longer adds');
      await app.main.key('k', 2);
      await app.main.waitFor(`${P}.app.catalog.basket.includes(${js(forest)})`, { message: 'Ctrl+K adds' });
      await app.main.eval(`${P}.app.settings.keys = {}; ${P}.app.saveSettings(); ${P}.app.catalog.clearBasket?.(); 1`);
    },
  },
  {
    ids: ['APP-KEYS-MODES'],
    group: '설정', name: '보기·편집 단축키도 바꾼다: 보기의 "다음 사진"을 N 으로(→ 는 더 이상 아님), 편집의 "실행 취소"를 Ctrl+U 로',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      await menu(app, 'help', 'keys.title');
      await app.main.waitFor(`Boolean(${P}.dq('#keymap-dialog [data-command="view:next"]'))`);
      const scopes = await app.main.eval(`${P}.dqa('#keymap-dialog tr.keymap-scope').map((r) => r.textContent)`);
      assert.deepEqual(scopes, await app.main.eval(`['manage', 'view', 'edit'].map((s) => ${P}.t(\`keys.scope.\${s}\`))`), 'a heading per mode');
      assert.equal(await app.main.eval(`${P}.dq('#keymap-dialog [data-command="view:next"]').textContent`), 'ArrowRight / PageDown / Space');
      await app.main.eval(`${P}.dq('#keymap-dialog [data-command="view:next"]').click(); 1`);
      await app.main.waitFor(`${P}.dq('#keymap-dialog [data-command="view:next"]').textContent === ${P}.t('keys.press')`);
      await app.main.key('n');
      await app.main.waitFor(`${P}.app.settings.keys['view:next'] === 'N'`, { message: 'captured N' });
      await primary(app);
      await menuDone(app);
      // Viewer: N goes on, → does not.
      const first = await pathOf(app, 'beach.jpg');
      await app.main.eval(`${P}.actions.viewItem(${js(first)}); 1`);
      await app.main.waitFor(`${P}.app.state.mode === 'view' && ${P}.viewer.currentPath === ${js(first)}`);
      await app.main.key('ArrowRight');
      await sleep(300);
      assert.equal(await app.main.eval(`${P}.viewer.currentPath`), first, '→ no longer moves');
      await app.main.key('n');
      await app.main.waitFor(`${P}.viewer.currentPath !== ${js(first)}`, { message: 'N moves on' });
      await app.main.key('Escape');
      await app.main.waitFor(`${P}.app.state.mode === 'manage'`);
      // Editor: undo on Ctrl+U.
      await app.main.eval(`${P}.app.settings.keys['edit:undo'] = 'Ctrl+U'; 1`);
      await openEditor(app, first);
      await app.main.eval(`${P}.editor.testing.change((e) => { e.adjust.exposure = 1; }, 'test'); 1`);
      assert.equal((await editState(app)).history.length, 1);
      await app.main.key('z', 2);
      await sleep(200);
      assert.equal((await editState(app)).history.length, 1, 'Ctrl+Z no longer undoes');
      await app.main.key('u', 2);
      await app.main.waitFor(`${P}.editor.debug().history.length === 0`, { message: 'Ctrl+U undoes' });
      await leaveEditor(app);
      await app.main.eval(`${P}.app.settings.keys = {}; ${P}.app.saveSettings(); 1`);
    },
  },

  {
    ids: ['APP-SETTINGS'],
    group: '설정', name: '설정 창: 테마를 밝게/어둡게, 탭 이동, 저장하면 바로 적용되고 설정 파일에 남는다',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      const original = await app.main.eval(`${P}.app.settings.theme`);
      for (const theme of ['light', 'dark']) {
        await app.main.eval(`${P}.dq('#open-settings').click(); 1`);
        await app.main.waitFor(`Boolean(${P}.dq('#settings-dialog'))`);
        // The Theme tab: a card per theme.
        await app.main.eval(`${P}.dq('#settings-dialog [data-tab=theme]').click(); 1`);
        await app.main.waitFor(`Boolean(${P}.dq('#settings-dialog .theme-card[data-theme=${theme}]'))`, { message: 'theme tab' });
        await app.main.eval(`${P}.dq('#settings-dialog .theme-card[data-theme=${theme}]').click(); 1`);
        await app.main.eval(`${P}.dq('#settings-dialog [data-tab=files]').click(); 1`);
        await app.main.waitFor(`[...${P}.dqa('#settings-dialog label.check')].some((l) => l.textContent.includes(${P}.t('settings.xmpEmbed')))`, { message: 'files tab' });
        await primary(app);
        await app.main.waitFor(`document.documentElement.dataset.theme === ${js(theme)} && ${P}.app.settings.theme === ${js(theme)}`, { message: `theme ${theme}` });
      }
      const file = path.join(app.data, 'settings.json');
      for (let i = 0; i < 30 && !(fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).theme === 'dark'); i++) await sleep(100);
      assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).theme, 'dark', 'settings.json in the data folder');
      await app.main.eval(`${P}.app.settings.theme = ${js(original)}; ${P}.app.saveSettings(); 1`);
    },
  },

  {
    ids: ['APP-MENUS'],
    group: '화면', name: '모든 메뉴·하위 메뉴·오른쪽 클릭 메뉴의 항목에 아이콘이 있다',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      // The folder tree's menu is checked too: earlier cases may have left another tab open.
      await app.main.eval(`${P}.actions.showLeftTab('folders'); 1`);
      await app.main.waitFor(`Boolean(${P}.dq('.tree-row'))`, { message: 'folder tree' });
      await select(app, 'beach.jpg');
      const missing = await app.main.eval(`(async () => {
        const tick = () => new Promise((r) => setTimeout(r, 30));
        const missing = [];
        const scan = async (menu, path) => {
          for (const row of menu.querySelectorAll(':scope > .menu-item')) {
            const label = path + ' › ' + row.querySelector('.menu-label').textContent;
            if (!row.querySelector('.menu-icon svg, .menu-icon .swatch')) missing.push(label);
            if (row.querySelector('.menu-arrow')) {
              row.dispatchEvent(new PointerEvent('pointerenter'));
              await tick();
              const menus = [...${P}.dqa('.menu')];
              const sub = menus[menus.length - 1];
              if (sub !== menu) await scan(sub, label);
            }
          }
        };
        const scanOpen = async (name) => { await tick(); const menu = ${P}.dq('.menu[data-level="0"]'); if (!menu) { missing.push(name + ': no menu'); return; } await scan(menu, name); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); ${P}.closeAllDialogs(); document.body.click(); await tick(); };
        for (const title of ${P}.dqa('.menubar-title')) { title.click(); await scanOpen(title.textContent); title.click(); await tick(); }
        const context = async (el, name) => { if (!el) { missing.push(name + ': not found'); return; } const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10 })); await scanOpen(name); };
        await context(${P}.dq('.tile[data-path$="beach.jpg"]') ?? [...${P}.dqa('.tile')].find((t) => t.textContent.includes('beach.jpg')), 'context: photo');
        await context([...${P}.dqa('.tile')].find((t) => t.textContent.includes('album')), 'context: folder');
        await context(${P}.dq('.tree-row'), 'context: folder tree');
        await context(${P}.dq('.filelist'), 'context: empty list area');
        // Catalog pane rows: a category, a keyword, a saved search.
        ${P}.app.catalog.addCategory('Menu test'); ${P}.app.catalog.addKeywords([${P}.app.state.list.find((i) => !i.isDir).path], ['MenuKw|Child']); ${P}.app.catalog.saveSearch('Menu search', 'beach');
        ${P}.actions.showLeftTab('catalog'); await tick(); await tick();
        await context([...${P}.dqa('.cat-row')].find((r) => r.textContent.includes('Menu test')), 'context: category');
        await context([...${P}.dqa('.cat-row')].find((r) => r.dataset.keyword === 'MenuKw'), 'context: keyword');
        await context([...${P}.dqa('.cat-row')].find((r) => r.textContent.includes('Menu search')), 'context: saved search');
        // People pane row.
        const first = ${P}.app.state.list.find((i) => !i.isDir).path;
        ${P}.app.catalog.addFace(first, { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }); ${P}.app.catalog.nameFace(first, (${P}.app.catalog.get(first).faces.length - 1), 'Menu Person');
        ${P}.actions.showLeftTab('people'); await new Promise((r) => setTimeout(r, 450));
        await context(${P}.dq('.people-pane [data-person="Menu Person"]'), 'context: person');
        ${P}.actions.showLeftTab('folders');
        // Map and the viewer.
        ${P}.actions.showRightTab('map'); await tick(); await tick();
        await context(${P}.dq('[data-drop="__map__"]'), 'context: map');
        ${P}.actions.showRightTab('properties');
        ${P}.actions.viewItem(first); await new Promise((r) => setTimeout(r, 800));
        await context(${P}.dq('.viewer-stage'), 'context: viewer');
        ${P}.actions.setMode('manage'); await tick();
        return missing;
      })()`, 60000);
      assert.deepEqual(missing, [], 'menu items without an icon');
    },
  },

  {
    ids: ['APP-UNDO'],
    group: '파일', name: '여러 장 이동 → 실행 취소(툴바)로 제자리, 다시 실행으로 다시 이동, 이름 바꾸기 취소(Ctrl+Z)',
    run: async (app) => {
      await app.main.eval(`${P}.history.clear(); 1`);
      const studio = dir(app, 'studio');
      const album = path.join(studio, 'album');
      for (const name of ['u1.jpg', 'u2.jpg']) fs.copyFileSync(path.join(fixtures, 'forest.jpg'), path.join(studio, name));
      await open(app, studio, 6);
      await reloadList(app);
      const paths = await select(app, 'u1.jpg', 'u2.jpg');
      await app.main.eval(`${P}.app.state.clipboard = null; 1`);
      await app.main.eval(`${P}.dq('.filelist').focus(); 1`);
      await app.main.key('x', 2);
      await app.main.eval(`${P}.actions.openFolder(${js(album)}); 1`);
      await app.main.waitFor(`${P}.app.state.source.path === ${js(album)} && !${P}.app.state.loading`);
      await app.main.eval(`${P}.dq('.filelist').focus(); 1`);
      await app.main.key('v', 2);
      const where = () => ['u1.jpg', 'u2.jpg'].map((n) => (fs.existsSync(path.join(album, n)) ? 'album' : fs.existsSync(path.join(studio, n)) ? 'studio' : 'gone'));
      for (let i = 0; i < 150 && where().join() !== 'album,album'; i++) await sleep(100);
      assert.deepEqual(where(), ['album', 'album'], 'moved');
      await app.main.waitFor(`!${P}.dq('#undo-button').disabled`, { message: 'undo enabled' });
      await app.main.eval(`${P}.dq('#undo-button').click(); 1`);
      await app.main.waitFor(`!${P}.dq('#redo-button').disabled`, { timeout: 30000, message: 'undo finished' });
      for (let i = 0; i < 150 && where().join() !== 'studio,studio'; i++) await sleep(100);
      const back = where();
      assert.deepEqual(back, ['studio', 'studio'], `undo moved them back (${back.join(',')})`);
      await app.main.waitFor(`!${P}.dq('#redo-button').disabled`);
      await app.main.eval(`${P}.dq('#redo-button').click(); 1`);
      for (let i = 0; i < 150 && where().join() !== 'album,album'; i++) await sleep(100);
      assert.deepEqual(where(), ['album', 'album'], 'redo moved them again');
      await app.main.eval(`${P}.dq('#undo-button').click(); 1`);
      for (let i = 0; i < 150 && where().join() !== 'studio,studio'; i++) await sleep(100);
      assert.deepEqual(where(), ['studio', 'studio']);
      assert.ok(paths.every((p) => fs.readFileSync(p).equals(fs.readFileSync(path.join(fixtures, 'forest.jpg')))), 'same bytes');
      // Rename, then Ctrl+Z.
      await open(app, studio, 6);
      await select(app, 'u1.jpg');
      await app.main.eval(`${P}.dq('.filelist').focus(); 1`);
      await app.main.key('F2');
      await dialog(app, 'file.renameTo');
      await app.main.eval(`(() => { const i = ${TOP}.querySelector('input'); i.value = 'renamed.jpg'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await primary(app);
      for (let i = 0; i < 40 && !fs.existsSync(path.join(studio, 'renamed.jpg')); i++) await sleep(100);
      assert.ok(fs.existsSync(path.join(studio, 'renamed.jpg')));
      await app.main.waitFor(`!${P}.dq('#undo-button').disabled`, { message: 'rename can be undone' });
      await app.main.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); ${P}.closeAllDialogs(); ${P}.dq('.filelist').focus(); 1`);
      await app.main.key('z', 2);
      for (let i = 0; i < 40 && !fs.existsSync(path.join(studio, 'u1.jpg')); i++) await sleep(100);
      assert.ok(fs.existsSync(path.join(studio, 'u1.jpg')) && !fs.existsSync(path.join(studio, 'renamed.jpg')), 'rename undone');
    },
  },

  {
    ids: ['APP-HEADER', 'APP-THEMES'],
    group: '화면', name: '머리글: 테마 버튼으로 다음 테마, 드롭다운으로 선택, 사용자 정의 테마 편집(미리 보기·저장), 국기 언어 토글, 톱니바퀴 설정, 정보 버튼',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      const order = await app.main.eval(`[...${P}.dq('.header-right').children].map((el) => el.id || el.className)`);
      assert.deepEqual(order.map((x) => x.includes('theme-next') ? 'theme' : x.includes('theme-select') ? 'select' : x.includes('language') ? 'language' : x.includes('open-settings') ? 'settings' : x.includes('open-about') ? 'about' : x), ['theme', 'select', 'language', 'settings', 'about']);
      await app.main.eval(`${P}.dq('.header-right .theme-select').click(); 1`);
      const listed = await app.main.eval(`({ items: ${P}.dqa('.theme-popup .theme-item').length, columns: ${P}.dqa('.theme-popup .theme-column').length, dots: ${P}.dqa('.theme-popup .theme-column .theme-item').every((i) => i.querySelectorAll('.theme-dot').length === 4) })`);
      assert.deepEqual(listed, { items: 1 + 1 + 1 + 40, columns: 2, dots: true }, 'system, custom, editor and 40 themes in two columns with their colours');
      await app.main.eval(`${P}.dq('.theme-popup [data-theme=dark]').click(); 1`);
      assert.equal(await app.main.eval(`${P}.dq('.theme-popup')`), null, 'list closes');
      assert.ok(await app.main.eval(`Boolean(${P}.dq('#theme-next .palette-icon'))`), 'palette button');
      await app.main.eval(`${P}.app.settings.theme = 'dark'; ${P}.app.saveSettings(); 1`);
      await app.main.eval(`${P}.dq('#theme-next').click(); 1`);
      await app.main.waitFor(`document.documentElement.dataset.themeId === 'midnight' && ${P}.app.settings.theme === 'midnight'`, { message: 'next theme' });
      await app.main.eval(`(() => { const s = ${P}.dq('.theme-select'); s.value = 'solarized-light'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await app.main.waitFor(`document.documentElement.dataset.theme === 'light' && document.documentElement.dataset.themeId === 'solarized-light'`);
      assert.equal(await app.main.eval(`getComputedStyle(document.body).backgroundColor`), 'rgb(253, 246, 227)');
      // Custom theme: choose a swatch, the window previews it, Save keeps it.
      await app.main.eval(`(() => { const s = ${P}.dq('.theme-select'); s.value = '__edit-custom'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await app.main.waitFor(`Boolean(${P}.dq('#custom-theme-dialog .swatches[data-key=accent] .swatch-dot'))`);
      const accent = await app.main.eval(`(() => { const dot = ${P}.dqa('#custom-theme-dialog .swatches[data-key=accent] .swatch-dot[data-color]')[3]; dot.click(); return dot.dataset.color; })()`);
      await app.main.waitFor(`getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() === ${js(accent)}`, { message: 'live preview' });
      await primary(app);
      await app.main.waitFor(`${P}.app.settings.theme === 'custom' && ${P}.app.settings.customTheme.accent === ${js(accent)}`);
      // Language: shows the other language's flag and toggles.
      const lang = await app.main.eval(`${P}.app.settings.language`);
      const flagBefore = await app.main.eval(`${P}.dq('#language-toggle').title`);
      await app.main.eval(`${P}.dq('#language-toggle').click(); 1`);
      await app.main.waitFor(`${P}.dq('#language-toggle').title !== ${js(flagBefore)}`, { message: 'flag switched' });
      const after = await app.main.eval(`(${P}.dq('.menubar-title[data-menu=file]').textContent)`);
      assert.ok(['File', '파일'].includes(after));
      await app.main.eval(`${P}.dq('#language-toggle').click(); 1`);
      await app.main.waitFor(`${P}.dq('#language-toggle').title === ${js(flagBefore)}`);
      await app.main.eval(`${P}.app.settings.language = ${js(lang)}; ${P}.app.settings.theme = 'dark'; ${P}.app.saveSettings(); 1`);
      assert.ok(await app.main.eval(`${P}.dq('#open-settings svg path').getAttribute('d').startsWith('M12.22 2h')`), 'gear icon');
      assert.ok(await app.main.eval(`${P}.dqa('.menubar-title .menubar-icon svg').length === ${P}.dqa('.menubar-title').length`), 'menu bar titles have icons');
    },
  },
  {
    ids: ['APP-THEMETAB'],
    group: '설정', name: '설정의 테마 탭: 시스템·사용자 정의·어두운 20·밝은 20 을 미리 보기 카드로, 누르면 바로 보이고 취소하면 돌아가며 저장하면 유지',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      await app.main.eval(`${P}.app.settings.theme = 'dark'; ${P}.app.saveSettings(); 1`);
      const shown = () => app.main.eval('document.documentElement.dataset.themeId');
      const openTab = async () => {
        await app.main.eval(`${P}.dq('#open-settings').click(); 1`);
        await app.main.waitFor(`${TOP}?.id === 'settings-dialog'`);
        await app.main.eval(`${TOP}.querySelector('.settings-tab[data-tab=theme]').click(); 1`);
        await app.main.waitFor(`${TOP}.querySelectorAll('.theme-card').length > 0`);
      };
      await openTab();
      const cards = await app.main.eval(`[...${TOP}.querySelectorAll('.theme-card')].map((c) => c.dataset.theme)`);
      assert.equal(cards.length, 42, 'system + custom + 40');
      assert.ok(cards.includes('system') && cards.includes('custom'));
      assert.equal(await app.main.eval(`${TOP}.querySelector('.theme-card.on').dataset.theme`), 'dark', 'current theme marked');
      assert.equal(await app.main.eval(`${TOP}.querySelectorAll('.theme-grid').length`), 3);
      const light = await app.main.eval(`${P}.dqa('.theme-grid')[2].querySelector('.theme-card').dataset.theme`);
      // Clicking previews at once; Cancel goes back.
      await app.main.eval(`${TOP}.querySelector(${js(`.theme-card[data-theme="${light}"]`)}).click(); 1`);
      assert.equal(await shown(), light, 'preview');
      assert.equal(await app.main.eval(`document.documentElement.dataset.theme`), 'light');
      await app.main.eval(`${TOP}.querySelector('.dialog-buttons .btn:not(.primary)').click(); 1`);
      await app.main.waitFor(`!${TOP}`);
      assert.equal(await shown(), 'dark', 'cancel restores');
      assert.equal(await app.main.eval(`${P}.app.settings.theme`), 'dark');
      // Choose and save.
      await openTab();
      await app.main.eval(`${TOP}.querySelector(${js(`.theme-card[data-theme="${light}"]`)}).click(); 1`);
      await primary(app);
      await app.main.waitFor(`!${TOP}`);
      assert.equal(await app.main.eval(`${P}.app.settings.theme`), light, 'saved');
      assert.equal(await shown(), light);
      await app.main.eval(`${P}.app.settings.theme = 'dark'; ${P}.app.saveSettings(); 1`);
      await app.main.eval(`(async () => { const { applyTheme } = await import('/src/themes.js'); applyTheme('dark'); })(); 1`);
    },
  },
  {
    ids: ['APP-WINDOWS'],
    group: '화면', name: '설정·정보·확인 창이 독립된 창으로 열린다: 제목, 고정 크기, 모든 탭이 잘리지 않음, 창을 닫으면 취소',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      await app.main.eval(`${P}.dq('#open-settings').click(); 1`);
      await app.main.waitFor(`Boolean(${P}.topDialog()?.id === 'settings-dialog')`);
      const settings = await app.main.eval(`(() => { const box = ${P}.topDialog(); const doc = box.ownerDocument; const win = doc.defaultView; const tabs = [...box.querySelectorAll('.settings-tab')].map((b) => b.getBoundingClientRect()); const body = box.querySelector('.settings-content').getBoundingClientRect(); const out = { own: doc !== document, title: doc.title, w: win.innerWidth, h: win.innerHeight, cut: [], top: tabs.every((r) => Math.abs(r.top - tabs[0].top) < 1 && r.bottom <= body.top + 1) };
        for (const tab of box.querySelectorAll('.settings-tab')) { tab.click(); if (doc.documentElement.scrollHeight > win.innerHeight + 1) out.cut.push(tab.textContent); }
        return out; })()`);
      assert.equal(settings.own, true, 'its own window');
      assert.equal(settings.title, await app.main.eval(`${P}.t('settings.title')`));
      assert.deepEqual(settings.cut, [], 'tabs that would need scrolling');
      assert.ok(settings.top, `tab buttons in one row above the content: ${JSON.stringify(settings)}`);
      await app.main.eval(`${P}.topDialog().ownerDocument.defaultView.close(); 1`);
      await app.main.waitFor(`!${P}.topDialog()`, { message: 'closing the window cancels' });
      await app.main.eval(`${P}.dq('#open-about').click(); 1`);
      await app.main.waitFor(`${P}.topDialog()?.id === 'about-dialog'`);
      const about = await app.main.eval(`(() => { const box = ${P}.topDialog(); return { own: box.ownerDocument !== document, text: box.textContent, icon: Boolean(box.querySelector('.about-top > img.about-icon + .about-text')), rows: box.querySelectorAll('.about-rows .about-key').length }; })()`);
      assert.ok(about.own && about.icon && about.rows >= 5);
      assert.ok(about.text.includes('SHKWON(knix008@naver.com)'), 'author');
      // APP-ABOUTFORMATS: every supported format, by group, read and written.
      const formats = await app.main.eval(`(() => { const box = ${P}.topDialog(); return { groups: box.querySelectorAll('.about-format-row').length, chips: [...box.querySelectorAll('.ext-chip')].map((c) => c.textContent) }; })()`);
      assert.equal(formats.groups, 14);
      for (const ext of ['JPG', 'HEIC', 'TIFF', 'PSD', 'CR3', 'NEF', 'DCM', 'JXL', 'JP2', 'PDF', 'QOI', 'MP4', 'WEBM', 'ZIP', 'CUBE', 'GPX']) assert.ok(formats.chips.includes(ext), `lists ${ext}`);
      await primary(app);
      await app.main.waitFor(`!${P}.topDialog()`);
    },
  },
  {
    ids: ['APP-PANELS', 'BROWSE-DRIVES', 'BROWSE-SUMMARY'],
    group: '화면', name: '좌우 패널: 제목 아이콘, < > 로 접기·펴기(접으면 아이콘과 세로 제목), 툴바 버튼으로 숨기기, 드라이브 목록, 선택이 없을 때 요약',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      await app.main.eval(`${P}.actions.showLeftTab('folders'); ${P}.actions.showRightTab('properties'); ${P}.actions.setSelection([]); 1`);
      assert.ok(await app.main.eval(`Boolean(${P}.dq('.side-pane.left .pane-head .pane-head-icon svg')) && ${P}.dq('.side-pane.left .pane-head-title').textContent === ${P}.t('pane.folders')`));
      assert.equal(await app.main.eval(`${P}.dq('[data-fold=left]').textContent + ${P}.dq('[data-fold=right]').textContent`), '<>');
      // The drives are buttons on the "folders" title row; a click opens the drive and shows only its folders below.
      const drives = await app.main.eval(`${P}.dqa('.side-pane.left .pane-head .drive-buttons .drive-button').map((b) => b.dataset.drive)`);
      if (process.platform === 'win32') {
        assert.ok(drives.includes('C:\\'), `drives: ${drives}`);
        await app.main.eval(`${P}.dqa('.drive-button').find((b) => b.dataset.drive === 'C:\\\\').click(); 1`);
        await app.main.waitFor(`${P}.app.state.source.path === 'C:\\\\' && !${P}.app.state.loading`, { message: 'drive opened' });
        const shown = await app.main.eval(`({ on: ${P}.dq('.drive-button.on')?.dataset.drive, roots: ${P}.dqa('.folders .tree > .tree-node > .tree-row').map((r) => r.dataset.path).filter((p) => /^[A-Z]:\\\\$/.test(p)), usage: ${P}.dqa('.drive-usage').length })`);
        assert.equal(shown.on, 'C:\\');
        assert.deepEqual(shown.roots, ['C:\\'], 'only the chosen drive in the tree');
        assert.ok(shown.usage === 1, 'free space shown');
        await open(app, dir(app, 'studio'), 6);
      }
      // The main window has a status bar with a visible resize grip in the bottom-right corner.
      const bar = await app.main.eval(`(() => { const b = ${P}.dq('footer.status-bar').getBoundingClientRect(); const g = ${P}.dq('footer.status-bar .resize-grip')?.getBoundingClientRect(); return { h: b.height, bottom: b.bottom - innerHeight, grip: g ? { w: g.width, right: innerWidth - g.right, bottom: innerHeight - g.bottom } : null }; })()`);
      assert.ok(bar.h >= 20 && Math.abs(bar.bottom) <= 1, JSON.stringify(bar));
      assert.ok(bar.grip && bar.grip.w >= 10 && bar.grip.right <= 4 && bar.grip.bottom <= 4, `resize grip: ${JSON.stringify(bar)}`);
      // Fold both panels: strips with the tab icons and a vertical title.
      await app.main.eval(`${P}.dq('[data-fold=left]').click(); ${P}.dq('[data-fold=right]').click(); 1`);
      await app.main.waitFor(`${P}.dq('.side-pane.left').classList.contains('collapsed') && ${P}.dq('.side-pane.right').classList.contains('collapsed')`);
      const strip = await app.main.eval(`({ w: ${P}.dq('.side-pane.left').getBoundingClientRect().width, icons: ${P}.dqa('.side-pane.left .pane-strip-tab svg').length, title: ${P}.dq('.side-pane.left .pane-strip-text').textContent, unfold: ${P}.dq('.side-pane.left [data-fold]').textContent })`);
      assert.ok(strip.w < 50 && strip.icons === 5 && strip.unfold === '>', JSON.stringify(strip));
      assert.equal(strip.title, await app.main.eval(`${P}.t('pane.folders')`));
      await app.main.eval(`${P}.dq('.side-pane.left [data-fold]').click(); ${P}.dq('.side-pane.right [data-fold]').click(); 1`);
      await app.main.waitFor(`!${P}.dq('.side-pane.left').classList.contains('collapsed') && !${P}.dq('.side-pane.right').classList.contains('collapsed')`);
      // Nothing selected: the right panel summarises the list; a type row filters it.
      await app.main.waitFor(`Boolean(${P}.dq('.folder-summary .summary-row'))`, { message: 'summary' });
      await app.main.eval(`${P}.dqa('.folder-summary .summary-row').find((r) => r.textContent.startsWith('JPG')).click(); 1`);
      await app.main.waitFor(`${P}.app.state.list.filter((i) => !i.isDir).every((i) => /\\.jpe?g$/i.test(i.name))`, { message: 'filtered to JPEG' });
      await app.main.eval(`${P}.app.state.listFilter.text = ''; ${P}.actions.reload(); 1`);
      // Toolbar buttons hide and show the panels.
      await app.main.eval(`${P}.dqa('.app-toolbar .tool').find((b) => b.getAttribute('aria-label') === ${P}.t('toolbar.leftPane')).click(); 1`);
      await app.main.waitFor(`${P}.dq('.side-pane.left').hidden`);
      await app.main.eval(`${P}.dqa('.app-toolbar .tool').find((b) => b.getAttribute('aria-label') === ${P}.t('toolbar.leftPane')).click(); 1`);
      await app.main.waitFor(`!${P}.dq('.side-pane.left').hidden`);
    },
  },
  {
    ids: ['APP-WORKSPACE'],
    group: '화면', name: '작업 공간: 지금 배치(패널·탭·폭·보기 방식·정렬)를 이름으로 저장, 메뉴와 Ctrl+Alt+숫자로 되돌리기, 기본 배치',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      const shape = () => app.main.eval(`({ view: ${P}.app.settings.view, right: !${P}.dq('.side-pane.right').hidden, leftTab: ${P}.app.settings.panes.leftTab, width: ${P}.app.settings.panes.leftWidth, sort: ${P}.app.settings.sort.key, list: ${P}.fileList.el?.dataset.view ?? document.querySelector('.filelist')?.dataset.view })`);
      // Layout "Review": details view, no right panel, catalog tab, wider left panel, sorted by rating.
      await app.main.eval(`(() => { const s = ${P}.app.settings; s.view = 'details'; s.panes.right = false; s.panes.leftWidth = 330; s.sort = { key: 'rating', desc: true }; ${P}.actions.showLeftTab('catalog'); ${P}.menu('view', 'workspace.title', 'workspace.save'); return 1; })()`);
      await app.main.waitFor(`Boolean(${TOP}?.querySelector('input'))`);
      await app.main.eval(`(() => { const i = ${TOP}.querySelector('input'); i.value = 'Review'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await primary(app);
      await app.main.waitFor(`${P}.app.settings.workspaces.length === 1`);
      // Back to the default layout …
      await app.main.eval(`${P}.menu('view', 'workspace.title', 'workspace.default'); 1`);
      let now = await shape();
      assert.deepEqual({ view: now.view, right: now.right, leftTab: now.leftTab, width: now.width, sort: now.sort }, { view: 'thumbs', right: true, leftTab: 'folders', width: 260, sort: 'name' });
      // … and to "Review" from the menu: everything comes back, the list too.
      await app.main.eval(`${P}.menu('view', 'workspace.title', 'Review'); 1`);
      await app.main.waitFor(`document.querySelector('.filelist')?.dataset.view === 'details'`, { message: 'list in details view' });
      now = await shape();
      assert.deepEqual({ view: now.view, right: now.right, leftTab: now.leftTab, width: now.width, sort: now.sort }, { view: 'details', right: false, leftTab: 'catalog', width: 330, sort: 'rating' });
      assert.ok(await app.main.eval(`${P}.dq('.side-pane.left .pane-tab[data-tab=catalog]').classList.contains('on') || ${P}.dq('.side-pane.left .pane-tab[data-tab=catalog]').getAttribute('aria-selected') === 'true'`), 'catalog tab shown');
      // Ctrl+Alt+1 = first workspace.
      await app.main.eval(`${P}.menu('view', 'workspace.title', 'workspace.default'); 1`);
      await app.main.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', code: 'Digit1', ctrlKey: true, altKey: true, bubbles: true })); 1`);
      await app.main.waitFor(`${P}.app.settings.view === 'details' && ${P}.app.settings.panes.right === false`, { message: 'Ctrl+Alt+1' });
      assert.ok(await app.main.eval(`${P}.app.state.list.length >= 6`));
      await app.main.eval(`${P}.menu('view', 'workspace.title', 'workspace.default'); 1`);
    },
  },
  {
    ids: ['APP-ZOOMBAR'],
    group: '보기', name: '사진 보기 도구 모음의 축소 · 현재 배율 · 확대: 배율은 두 버튼 사이 가운데, 상태 표시줄과 같은 값',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      const centred = (minus, value, plus) => app.main.eval(`(() => { const a = ${P}.dq('${minus}').getBoundingClientRect(); const v = ${P}.dq('${value}').getBoundingClientRect(); const b = ${P}.dq('${plus}').getBoundingClientRect(); const text = ${P}.dq('${value}'); const range = document.createRange(); range.selectNodeContents(text); const t = range.getBoundingClientRect(); return { order: a.right <= v.left + 1 && v.right <= b.left + 1, box: Math.abs((v.left + v.right) / 2 - (a.right + b.left) / 2), text: Math.abs((t.left + t.right) / 2 - (v.left + v.right) / 2), middle: Math.abs((t.top + t.bottom) / 2 - (a.top + a.bottom) / 2) }; })()`);
      assert.ok(!(await app.main.eval(`Boolean(${P}.dq('.app-toolbar .zoom-value'))`)), 'not in the browsing toolbar');
      // Viewer: the picture's zoom.
      await app.main.eval(`${P}.actions.viewItem(${js(await pathOf(app, 'beach.jpg'))}); 1`);
      await app.main.waitFor(`${P}.app.state.mode === 'view' && /^\\d+%$/.test(${P}.dq('#viewer-zoom')?.textContent ?? '')`, { timeout: 20000, message: 'viewer zoom shown' });
      const before = await app.main.eval(`parseInt(${P}.dq('#viewer-zoom').textContent, 10)`);
      assert.equal(before, await app.main.eval(`Math.round(${P}.viewer.debug().zoom * 100) || parseInt(document.querySelector('.status-zoom').textContent, 10)`) || before);
      const v = await centred('#viewer-zoom-out', '#viewer-zoom', '#viewer-zoom-in');
      assert.ok(v.order && v.box < 2 && v.text < 2 && v.middle < 2, `viewer zoom centred: ${JSON.stringify(v)}`);
      await app.main.eval(`${P}.dq('#viewer-zoom-in').click(); 1`);
      await app.main.waitFor(`parseInt(${P}.dq('#viewer-zoom').textContent, 10) > ${before}`, { message: 'zoomed in' });
      assert.equal(await app.main.eval(`parseInt(${P}.dq('#viewer-zoom').textContent, 10)`), await app.main.eval(`parseInt(document.querySelector('.status-zoom').textContent, 10)`), 'same as the status bar');
      await app.main.key('Escape');
      await app.main.waitFor(`${P}.app.state.mode === 'manage'`);
    },
  },
  {
    ids: ['APP-INPUTS'],
    group: '화면', name: '수치 입력은 − 값 + (가운데 정렬, 누르면 한 단계), 색은 원형 견본에서 고른다',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      await select(app, 'beach.jpg');
      await menu(app, 'tools', 'tools.watermark');
      await dialog(app, 'batch.position');
      const box = await app.main.eval(`(() => { const d = ${P}.topDialog(); const steppers = [...d.querySelectorAll('input[type=number]')].map((i) => ({ wrapped: i.parentElement.classList.contains('stepper'), first: i.previousElementSibling?.textContent, last: i.nextElementSibling?.textContent, align: getComputedStyle(i).textAlign })); return { steppers, swatches: d.querySelectorAll('.swatches .swatch-dot').length, round: getComputedStyle(d.querySelector('.swatch-dot')).borderRadius }; })()`);
      assert.ok(box.steppers.length >= 2);
      for (const s of box.steppers) assert.deepEqual(s, { wrapped: true, first: '−', last: '+', align: 'center' });
      assert.ok(box.swatches >= 10 && box.round === '50%', JSON.stringify(box));
      const sizeBefore = await app.main.eval(`${P}.topDialog().querySelectorAll('input[type=number]')[0].value`);
      await app.main.eval(`${P}.topDialog().querySelector('.stepper .stepper-button:last-child').click(); 1`);
      assert.equal(await app.main.eval(`${P}.topDialog().querySelectorAll('input[type=number]')[0].value`), String(Number(sizeBefore) + 1));
      await app.main.eval(`${P}.topDialog().querySelector('.swatches .swatch-dot[data-color="#ff3b30"]').click(); 1`);
      assert.equal(await app.main.eval(`${P}.topDialog().querySelector('.swatches').value`), '#ff3b30');
      await app.main.eval(`${P}.closeAllDialogs(); 1`);
      await menuDone(app).catch(() => {});
    },
  },
  {
    ids: ['FILE-RECENT'],
    group: '파일', name: '최근 폴더·파일(최대 10개): 파일 메뉴에서 바로 열기, × 로 하나 지우기, 모두 지우기',
    run: async (app) => {
      await app.main.eval(`${P}.app.settings.recentFolders = []; ${P}.app.settings.recentFiles = []; 1`);
      const studio = dir(app, 'studio');
      await open(app, dir(app, 'formats'), 5);
      await open(app, studio, 6);
      const beach = await pathOf(app, 'beach.jpg');
      await app.main.eval(`${P}.actions.viewItem(${js(beach)}); 1`);
      await app.main.waitFor(`${P}.app.state.mode === 'view'`);
      await app.main.eval(`${P}.actions.setMode('manage'); 1`);
      const recent = await app.main.eval(`({ folders: ${P}.app.settings.recentFolders, files: ${P}.app.settings.recentFiles })`);
      assert.deepEqual(recent.folders.slice(0, 2), [studio, dir(app, 'formats')]);
      assert.equal(recent.files[0], beach);
      for (let i = 0; i < 12; i++) await app.main.eval(`${P}.app.settings.recentFolders = [${js(`C:\\none${i}`)}, ...${P}.app.settings.recentFolders].slice(0, 10); 1`);
      await open(app, studio, 6);
      assert.equal(await app.main.eval(`${P}.app.settings.recentFolders.length`), 10, 'at most 10');
      // The submenu: open the file (folder + viewer), forget one, clear all.
      await sleep(400);
      // The menu focuses its first row on the next frame (which closes submenus): hover after that, as a user would.
      const opened = await app.main.eval(`(async () => { try { ${P}.dq('.menubar-title[data-menu=file]').click(); const first = document.querySelectorAll('.menu').length; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); [...document.querySelectorAll('.menu .menu-item')].find((r) => r.textContent.includes(${P}.t('file.recent'))).dispatchEvent(new PointerEvent('pointerenter')); return [first, document.querySelectorAll('.menu').length]; } catch (e) { return e.stack; } })()`);
      assert.deepEqual(opened, [1, 2], 'File › Recent submenu');
      const rows = await app.main.eval(`[...document.querySelectorAll('.menu')[1].querySelectorAll('.menu-item')].map((r) => ({ label: r.querySelector('.menu-label').textContent, remove: Boolean(r.querySelector('.menu-remove')) }))`);
      assert.ok(rows.filter((r) => r.remove).length === 11, `10 folders + 1 file with ×: ${rows.length}`);
      await app.main.eval(`[...document.querySelectorAll('.menu')[1].querySelectorAll('.menu-item')].find((r) => r.textContent.includes('none11')).querySelector('.menu-remove').click(); 1`);
      assert.ok(!(await app.main.eval(`${P}.app.settings.recentFolders.some((p) => p.endsWith('none11'))`)), 'forgotten');
      await app.main.eval(`[...document.querySelectorAll('.menu')[1].querySelectorAll('.menu-item')].find((r) => r.querySelector('.menu-label').textContent === ${js(beach)}).click(); 1`);
      await app.main.waitFor(`${P}.app.state.mode === 'view' && ${P}.viewer.currentPath === ${js(beach)}`, { message: 'recent file opened in the viewer' });
      await app.main.eval(`${P}.actions.setMode('manage'); 1`);
      await menu(app, 'file', 'file.recent', 'file.recentClear');
      await menuDone(app);
      assert.deepEqual(await app.main.eval(`[${P}.app.settings.recentFolders.length, ${P}.app.settings.recentFiles.length]`), [0, 0]);
    },
  },

  {
    ids: ['CREATE-PRINT'],
    group: '만들기', name: '인쇄: 용지·배치·여백·글자 설정, 오른쪽 미리 보기가 따라 바뀌고, 인쇄를 누르면 바로 프린터로 (가짜 프린터 → PDF)',
    run: async (app) => {
      const pdf = path.join(app.work, 'printed.pdf');
      fs.rmSync(pdf, { force: true });
      await open(app, dir(app, 'studio'), 6);
      await select(app, 'beach.jpg', 'city.jpg', 'forest.jpg');
      await menu(app, 'file', 'file.print');
      await app.main.waitFor(`Boolean(${P}.dq('#print-dialog .print-preview-page'))`);
      const blank = (expr) => `(() => { const c = ${expr}; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ink = 0; for (let i = 0; i < d.length; i += 16) if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) ink++; return ink; })()`;
      await app.main.waitFor(`${blank(`${P}.dq('#print-dialog .print-preview-page')`)} > 50`, { timeout: 20000, message: 'preview shows the photos' });
      // Settings are in tabs (printer & paper · layout & margins · text); the output choice stays below them.
      const tabs = await app.main.eval(`${P}.dqa('#print-dialog .print-tabs .settings-tab').map((b) => b.dataset.tab)`);
      assert.deepEqual(tabs, ['paper', 'layout', 'text']);
      const tabOf = { columns: 'layout', rows: 'layout', marginLeft: 'layout', orientation: 'paper' };
      const setKey = (key, value) => app.main.eval(`(() => { ${P}.dq('#print-dialog .print-tabs [data-tab=${tabOf[key]}]').click(); const el = ${P}.dq('#print-dialog [data-key=${key}]'); el.value = ${js(String(value))}; el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return 1; })()`);
      await setKey('columns', 2);
      await setKey('rows', 1);
      await setKey('orientation', 'landscape');
      await setKey('marginLeft', 25);
      await app.main.waitFor(`${P}.dq('#print-dialog .print-page-label').textContent.includes('2')`, { message: 'two pages in the preview' });
      const shape = await app.main.eval(`(() => { const c = ${P}.dq('#print-dialog .print-preview-page'); return [c.width, c.height]; })()`);
      assert.ok(shape[0] > shape[1], 'landscape preview');
      await app.main.eval(`${P}.dq('#print-next').click(); 1`);
      assert.match(await app.main.eval(`${P}.dq('#print-dialog .print-page-label').textContent`), /2/);
      // Every tab fits the window: nothing cut off, the buttons fully visible, the same window size for each tab.
      const fits = await app.main.eval(`(async () => { const box = ${P}.topDialog(); const win = box.ownerDocument.defaultView; const out = [];
        for (const tab of box.querySelectorAll('.print-tabs .settings-tab')) { tab.click(); await new Promise((r) => win.requestAnimationFrame(() => win.requestAnimationFrame(r)));
          const foot = box.querySelector('.dialog-buttons').getBoundingClientRect(); const output = box.querySelector('[data-key=output]').getBoundingClientRect();
          out.push({ tab: tab.dataset.tab, h: win.innerHeight, ok: foot.bottom <= win.innerHeight + 1 && output.bottom <= foot.top + 1 && box.ownerDocument.documentElement.scrollHeight <= win.innerHeight + 1 }); }
        return out; })()`);
      assert.ok(fits.every((f) => f.ok) && new Set(fits.map((f) => f.h)).size === 1, `print window: ${JSON.stringify(fits)}`);
      assert.ok(fits[0].h <= 760, `not too tall: ${fits[0].h}`);
      await primary(app);
      await menuDone(app, 120000);
      for (let i = 0; i < 100 && !fs.existsSync(pdf); i++) await sleep(100);
      assert.ok(fs.existsSync(pdf), 'sent to the (fake) printer');
      const text = fs.readFileSync(pdf).toString('latin1');
      const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
      assert.equal(pages, 2, 'two printed pages');
      assert.equal(await app.main.eval(`${P}.app.settings.print.columns`), 2, 'settings remembered');
    },
  },

  {
    ids: ['BROWSE-THUMBS'],
    group: '탐색', name: '썸네일은 폴더마다 저장된다: 처음 열면 백그라운드로 전부 만들고, 다시 실행해 열면 저장된 것을 바로 쓴다',
    run: async (app) => {
      const folder = path.join(app.work, 'thumbs-test');
      fs.mkdirSync(folder, { recursive: true });
      for (const name of ['beach.jpg', 'city.jpg', 'forest.jpg', 'portrait.jpg', 'sunset.png', 'flower.webp', 'scan.tif', 'artwork.psd']) fs.copyFileSync(path.join(fixtures, name), path.join(folder, name));
      await open(app, folder, 8);
      await app.main.waitFor(`${P}.app.state.list.every((i) => ${P}.thumbs.peek(i)?.url)`, { timeout: 60000, message: 'all thumbnails made' });
      await app.main.eval(`${P}.thumbs.flush()`);
      const root = path.join(app.data, 'thumbnails');
      const stores = fs.readdirSync(root).map((name) => path.join(root, name)).filter((store) => fs.existsSync(path.join(store, 'index.json')));
      const store = stores.find((dirPath) => JSON.parse(fs.readFileSync(path.join(dirPath, 'index.json'), 'utf8')).dir === folder);
      assert.ok(store, 'an index for this folder');
      const mine = JSON.parse(fs.readFileSync(path.join(store, 'index.json'), 'utf8'));
      assert.deepEqual(mine.entries.map((e) => e.name).sort(), fs.readdirSync(folder).sort());
      for (const entry of mine.entries) assert.ok(fs.existsSync(entry.file) && fs.statSync(entry.file).size > 200 && path.dirname(entry.file) === store, entry.name);
      assert.ok(stores.length >= 2, 'other folders have their own stores');
      // Restart: the folder's thumbnails come from its store at once (nothing is made again).
      await app.restart([folder]);
      await app.main.waitFor(`${P}.app.state.source.path === ${js(folder)} && !${P}.app.state.loading && ${P}.app.state.list.length === 8`);
      const stored = await app.main.eval(`${P}.app.state.list.map((i) => Boolean(${P}.thumbs.peek(i)?.stored))`);
      assert.deepEqual(stored, new Array(8).fill(true), 'shown from the folder store');
      const shownFromDisk = await app.main.eval(`${P}.app.state.list.every((i) => ${P}.thumbs.peek(i).url.includes('thumbnails'))`);
      assert.ok(shownFromDisk);
      assert.ok(await app.main.eval(`${P}.app.state.list.every((i) => ${P}.app.catalog.get(i.path)?.width > 0)`), 'catalog filled from the store');
    },
  },

  {
    ids: ['FMT-DICOM', 'VIEW-DICOM'],
    group: '형식', name: 'DICOM: 썸네일, 귀퉁이 정보·방향 표시, 윈도 미리 설정·값 입력·반전·색상표, 거리(mm)·ROI(HU) 측정, 값 읽기, 태그 창, 여러 프레임 시네, 프레임 저장',
    run: async (app) => {
      const folder = dir(app, 'dicom');
      await open(app, folder, 5);
      await app.main.waitFor(`${P}.app.state.list.every((i) => { const e = ${P}.thumbs.peek(i); return e && (e.url || e.error); })`, { timeout: 60000, message: 'DICOM thumbnails' });
      const failed = await app.main.eval(`${P}.app.state.list.filter((i) => !${P}.thumbs.peek(i).url).map((i) => i.name + ': ' + ${P}.thumbs.peek(i).error)`);
      assert.deepEqual(failed, []);
      const ct = await pathOf(app, 'CT_small.dcm');
      await app.main.eval(`${P}.actions.viewItem(${js(ct)}); 1`);
      await app.main.waitFor(`${P}.viewer.dicom.debug()?.units === 'HU' && !${P}.dq('.dicom-bar').hidden`, { timeout: 30000, message: 'DICOM tools' });
      const corners = await app.main.eval(`${P}.viewer.dicom.debug().corners`);
      assert.match(corners, /CompressedSamples CT1/);
      assert.match(corners, /C -?\d+ \/ W \d+/);
      assert.deepEqual(await app.main.eval(`${P}.dqa('.dicom-marker').map((m) => m.textContent).sort()`), ['A', 'L', 'P', 'R']);
      // Window: preset, typed values, invert, colour map.
      const pick = (key, value) => app.main.eval(`(() => { const s = ${P}.dq('[data-key="${key}"]'); s.value = ${js(value)}; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await pick('dicom-preset', 'preset:lung');
      await app.main.waitFor(`${P}.viewer.dicom.debug().state.wc === -600 && ${P}.viewer.dicom.debug().state.ww === 1500`, { message: 'lung window' });
      await app.main.eval(`(() => { const c = ${P}.dq('[data-key="dicom-wc"]'); const w = ${P}.dq('[data-key="dicom-ww"]'); c.value = 40; w.value = 400; w.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await app.main.waitFor(`${P}.viewer.dicom.debug().state.wc === 40 && ${P}.viewer.dicom.debug().state.ww === 400`);
      await app.main.eval(`${P}.dq('[data-dicom=invert]').click(); 1`);
      await app.main.waitFor(`${P}.viewer.dicom.debug().state.invert === true`);
      await pick('dicom-colormap', 'hotiron');
      await app.main.waitFor(`${P}.viewer.dicom.debug().state.colormap === 'hotiron'`);
      // Measure: distance in mm, rectangle ROI in HU.
      const stage = await app.main.eval(`(() => { const r = ${P}.dq('.viewer-media').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
      const at = (fx, fy) => ({ x: stage.x + fx * stage.w, y: stage.y + fy * stage.h });
      await app.main.eval(`${P}.dq('[data-dicom-tool=distance]').click(); 1`);
      await app.main.drag(at(0.2, 0.5), at(0.8, 0.5));
      await app.main.eval(`${P}.dq('[data-dicom-tool=rect]').click(); 1`);
      await app.main.drag(at(0.3, 0.3), at(0.7, 0.7));
      const measures = await app.main.eval(`${P}.viewer.dicom.debug().measures`);
      assert.equal(measures.length, 2, JSON.stringify(measures));
      const mm = Number(measures[0].text.match(/([\d.]+) mm/)?.[1]);
      assert.ok(mm > 40 && mm < 60, `distance ${measures[0].text} (0.6 × 128 px × 0.66 mm ≈ 51 mm)`);
      assert.match(measures[1].text, /HU/);
      assert.equal(await app.main.eval(`${P}.dqa('.dicom-layer .dicom-measure').length`), 2, 'drawn on the picture');
      // Value under the cursor.
      await app.main.eval(`${P}.dq('[data-dicom-tool=rect]').click(); 1`);
      const centre = at(0.5, 0.5);
      await app.main.mouse('mouseMoved', centre.x, centre.y, { button: 'none' });
      await app.main.waitFor(`/HU/.test(${P}.dq('.pixel-info')?.textContent ?? '')`, { message: 'value in HU' });
      // Tags window with search.
      await app.main.eval(`${P}.dq('[data-dicom=tags]').click(); 1`);
      await app.main.waitFor(`Boolean(${P}.dq('#dicom-tags tbody tr'))`);
      const all = await app.main.eval(`${P}.dqa('#dicom-tags tbody tr').length`);
      await app.main.eval(`(() => { const s = ${P}.dq('[data-key="dicom-tag-search"]'); s.value = 'patient'; s.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      const found = await app.main.eval(`${P}.dqa('#dicom-tags tbody tr').length`);
      assert.ok(all > 50 && found > 0 && found < all, `${found} of ${all} tags`);
      assert.equal(await app.main.eval(`${P}.topDialog().ownerDocument !== document`), true, 'tags in their own window');
      await primary(app);
      // Multi-frame: cine plays, frames step, a frame is saved.
      const cine = await pathOf(app, 'cine.dcm');
      await app.main.eval(`${P}.actions.viewItem(${js(cine)}); 1`);
      await app.main.waitFor(`${P}.viewer.dicom.debug()?.frames === 8 && Boolean(${P}.dq('[data-key="dicom-frame"]'))`, { timeout: 20000 });
      assert.equal(await app.main.eval(`${P}.viewer.dicom.debug().fps`), 10);
      await app.main.eval(`${P}.dq('[data-dicom=cine]').click(); 1`);
      await app.main.waitFor(`${P}.viewer.dicom.debug().state.frame >= 3`, { message: 'cine advances' });
      // A real press and release on pause while frames keep coming (the icon used to be replaced every frame and ate the click).
      const pauseAt = await app.main.eval(`(() => { const r = ${P}.dq('[data-dicom=cine]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await app.main.mouse('mouseMoved', pauseAt.x, pauseAt.y, { button: 'none' });
      await app.main.mouse('mousePressed', pauseAt.x, pauseAt.y);
      await new Promise((r) => setTimeout(r, 250));
      await app.main.mouse('mouseReleased', pauseAt.x, pauseAt.y);
      await app.main.waitFor(`${P}.viewer.dicom.debug().cine === false`, { timeout: 3000, message: 'pause stops the cine' });
      const paused = await app.main.eval(`${P}.viewer.dicom.debug().state.frame`);
      await new Promise((r) => setTimeout(r, 400));
      assert.equal(await app.main.eval(`${P}.viewer.dicom.debug().state.frame`), paused, 'stays on the paused frame');
      // Stop: playback ends and goes back to the first frame.
      await app.main.eval(`${P}.dq('[data-dicom=cine]').click(); 1`);
      await app.main.waitFor(`${P}.viewer.dicom.debug().state.frame !== ${paused}`, { message: 'plays again' });
      await app.main.eval(`${P}.dq('[data-dicom=cine-stop]').click(); 1`);
      await app.main.waitFor(`!${P}.viewer.dicom.debug().cine && ${P}.viewer.dicom.debug().state.frame === 0`, { message: 'stop rewinds' });
      await app.main.key('ArrowDown');
      const before = fs.readdirSync(folder);
      await app.main.eval(`${P}.viewer.dicom.testing.saveFrame()`);
      const added = newFiles(folder, before);
      assert.equal(added.length, 1);
      assert.match(added[0], /^cine_frame\d{3}\.png$/);
      fs.rmSync(path.join(folder, added[0]));
      await app.main.eval(`${P}.actions.setMode('manage'); 1`);
    },
  },

  {
    ids: ['VIEW-DICOMSCALE', 'VIEW-DICOMANGLE', 'VIEW-DICOMCINE', 'VIEW-MEASUREUNIT'],
    group: '형식', name: 'DICOM 측정·축척: X·Y 눈금자(왼쪽 위 0), 옮길 수 있는 축척 막대, 눈금자·축척·정보 켜고 끄기, 축척 비율·실제 크기, 각도·Cobb 각, mm·cm·inch 단위, 시네 동영상 저장',
    run: async (app) => {
      const folder = dir(app, 'dicom');
      await open(app, folder, 5);
      await app.main.eval(`${P}.actions.viewItem(${js(await pathOf(app, 'CT_small.dcm'))}); 1`);
      await app.main.waitFor(`${P}.viewer.dicom.debug()?.units === 'HU' && !${P}.dq('.dicom-bar').hidden`, { timeout: 30000, message: 'DICOM tools' });
      const dbg = () => app.main.eval(`${P}.viewer.dicom.debug()`);
      // Rulers: the whole X and Y axes of the picture, 0 at its top-left corner, in mm.
      let d = await dbg();
      assert.ok(d.spacing?.[1] > 0, 'pixel spacing');
      assert.deepEqual(d.rulers.map((r) => r.axis), ['x', 'y']);
      const pic = await app.main.eval(`(() => { const p = ${P}.dq('.viewer-media').getBoundingClientRect(); const s = ${P}.dq('.dicom-rulers').getBoundingClientRect(); return { left: p.left - s.left, top: p.top - s.top, w: p.width, h: p.height, cw: ${P}.dq('.viewer-media').width, ch: ${P}.dq('.viewer-media').height }; })()`);
      const [x, y] = d.rulers;
      assert.ok(Math.abs(x.total - pic.cw * d.spacing[1]) < 0.01 && Math.abs(y.total - pic.ch * d.spacing[0]) < 0.01, 'axes cover the whole picture');
      assert.ok(Math.abs(x.origin - pic.left) < 1.5 && Math.abs(y.origin - pic.top) < 1.5, `0 at the top-left corner ${JSON.stringify([x.origin, y.origin, pic.left, pic.top])}`);
      assert.ok(Math.abs(x.pxPerUnit * x.total - pic.w) < 2, 'x scale matches the picture');
      assert.ok(x.ticks >= Math.floor(x.total / (x.major / 5)) && y.ticks >= Math.floor(y.total / (y.major / 5)), `a tick every fifth of a major step ${JSON.stringify(d.rulers)}`);
      // The bar spans the whole window: negative values before the corner, 0 (with the unit) at it.
      assert.ok(await app.main.eval(`[...${P}.dqa('.dicom-ruler.horizontal text')].some((e) => e.textContent === '0 mm')`), '0 mm at the corner');
      // Scale bar: a round length, movable with the mouse.
      assert.ok(d.scaleBar && Math.abs(d.scaleBar.pixels - d.scaleBar.length * x.pxPerUnit) < 1, `scale bar ${JSON.stringify(d.scaleBar)}`);
      const from = { x: d.scaleBar.x + 10, y: d.scaleBar.y + 10 };
      await app.main.drag(from, { x: from.x - 200, y: from.y - 120 }, 10);
      const moved = (await dbg()).scaleBar;
      assert.ok(Math.abs(moved.x - (d.scaleBar.x - 200)) < 4 && Math.abs(moved.y - (d.scaleBar.y - 120)) < 4, `scale bar moved ${JSON.stringify([d.scaleBar, moved])}`);
      assert.equal((await dbg()).measures.length, 0, 'moving the bar measures nothing');
      assert.match(d.scale, /1 px = 0\.\d+ mm/);
      assert.match(d.scale, /1:\d/);
      assert.match(await app.main.eval(`${P}.dq('.dicom-scale').textContent`), /1 px = /, 'ratio in the bar');
      // Actual size: 1 mm on the screen = 1 mm.
      await app.main.eval(`${P}.dq('[data-dicom=actual]').click(); 1`);
      await app.main.waitFor(`/1:1(\\D|$)/.test(${P}.viewer.dicom.debug().scale)`, { message: 'actual size 1:1' });
      // On / off: rulers, scale bar and the corner information, each on its own (remembered).
      const toggle = (key) => app.main.eval(`${P}.dq('[data-dicom=${key}]').click(); 1`);
      await toggle('rulers');
      assert.equal(await app.main.eval(`${P}.dqa('.dicom-ruler').length`), 0, 'rulers off');
      assert.ok(await app.main.eval(`Boolean(${P}.dq('.dicom-scalebar'))`), 'scale bar still on');
      await toggle('scalebar');
      assert.ok(!(await app.main.eval(`Boolean(${P}.dq('.dicom-scalebar'))`)), 'scale bar off');
      await toggle('corners');
      assert.ok(await app.main.eval(`${P}.dq('.dicom-corners').hidden`), 'information off');
      assert.deepEqual(await app.main.eval(`(({ rulers, scaleBar, corners }) => ({ rulers, scaleBar, corners }))(${P}.app.settings.dicom)`), { rulers: false, scaleBar: false, corners: false }, 'remembered');
      assert.ok(await app.main.eval(`${P}.app.settings.dicom.scaleBarAt?.x > 0`), 'the moved scale bar position is remembered too');
      for (const key of ['rulers', 'scalebar', 'corners']) await toggle(key);
      assert.equal(await app.main.eval(`${P}.dqa('.dicom-ruler').length`), 2);
      assert.ok(await app.main.eval(`Boolean(${P}.dq('.dicom-scalebar')) && !${P}.dq('.dicom-corners').hidden`));
      await app.main.eval(`${P}.viewer.testing.setZoom(1); 1`);
      await settle(app);
      // Angle: first arm left → centre, then a click straight above the centre = 90°.
      const box = await app.main.eval(`(() => { const r = ${P}.dq('.viewer-media').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
      const pt = (fx, fy) => ({ x: box.x + fx * box.w, y: box.y + fy * box.h });
      await app.main.eval(`${P}.dq('[data-dicom-tool=angle]').click(); 1`);
      await app.main.drag(pt(0.2, 0.5), pt(0.5, 0.5));
      assert.equal((await dbg()).pending, 'angle', 'waits for the third point');
      const c = pt(0.5, 0.2);
      await app.main.realClick(c.x, c.y);
      d = await dbg();
      const angle = d.measures.find((m) => m.type === 'angle');
      assert.ok(angle && Math.abs(parseFloat(angle.text) - 90) < 1.5, `angle ${angle?.text}`);
      assert.equal(d.pending, null);
      assert.ok(await app.main.eval(`Boolean(${P}.dq('.dicom-layer .dicom-measure path'))`), 'arc drawn');
      // Cobb: a level line and one rising 0.15 over 0.6 → atan(0.25) ≈ 14°.
      await app.main.eval(`${P}.dq('[data-dicom-tool=cobb]').click(); 1`);
      await app.main.drag(pt(0.2, 0.3), pt(0.8, 0.3));
      await app.main.drag(pt(0.2, 0.75), pt(0.8, 0.6));
      d = await dbg();
      const cobb = d.measures.find((m) => m.type === 'cobb');
      const deg = parseFloat(cobb?.text.replace(/[^\d.]/g, ''));
      assert.ok(Math.abs(deg - 14.04) < 1.5, `Cobb ${cobb?.text}`);
      // Length unit from Settings: cm and inches.
      await app.main.eval(`${P}.dq('[data-dicom-tool=distance]').click(); 1`);
      await app.main.drag(pt(0.2, 0.9), pt(0.8, 0.9));
      const mm = parseFloat((await dbg()).measures.find((m) => m.type === 'distance').text);
      for (const [unit, label, factor] of [['cm', 'cm', 10], ['inch', 'in', 25.4]]) {
        await app.main.eval(`${P}.app.settings.measureUnit = ${js(unit)}; ${P}.viewer.dicom.refresh(); 1`);
        const m = (await dbg()).measures.find((x) => x.type === 'distance').text;
        assert.ok(m.endsWith(` ${label}`) && Math.abs(parseFloat(m) - mm / factor) < 0.01, `${unit}: ${m} (from ${mm} mm)`);
        assert.match((await dbg()).scale, new RegExp(`1 px = [\\d.]+ ${label}`));
        assert.ok(await app.main.eval(`[...${P}.dqa('.dicom-ruler.horizontal text')].some((e) => e.textContent === ${js(`0 ${label}`)})`), `0 ${label} on the ruler`);
      }
      await app.main.eval(`${P}.app.settings.measureUnit = 'mm'; ${P}.viewer.dicom.refresh(); 1`);
      // Cine to video.
      await app.main.eval(`${P}.actions.viewItem(${js(await pathOf(app, 'cine.dcm'))}); 1`);
      await app.main.waitFor(`${P}.viewer.dicom.debug()?.frames === 8 && Boolean(${P}.dq('[data-dicom=save-cine]'))`, { timeout: 20000 });
      const saved = await app.main.eval(`${P}.viewer.dicom.testing.saveCine({ fps: 20 })`);
      assert.ok(saved && /cine_cine\.webm$/.test(saved), saved);
      const webm = fs.readFileSync(saved);
      assert.deepEqual([...webm.subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3], 'WebM');
      assert.ok(webm.includes(Buffer.from('V_VP')), 'video track');
      fs.rmSync(saved);
      await app.main.eval(`${P}.actions.setMode('manage'); 1`);
    },
  },
  {
    ids: ['VIEW-DICOMTOOLS'],
    group: '형식', name: 'DICOM 편의 기능: 자동 윈도, Ctrl·가운데 끌기 윈도, 측정 실행 취소·다시·Del, 측정 선택·Del·우클릭 삭제, 재생 중에도 보이는 측정, 시네 반복·왕복·한 번, 프레임 슬라이더 휠, 단축키, 모든 프레임 PNG·태그 JSON/CSV/TXT 저장',
    run: async (app) => {
      const folder = dir(app, 'dicom');
      await open(app, folder, 5);
      await app.main.eval(`${P}.actions.viewItem(${js(await pathOf(app, 'CT_small.dcm'))}); 1`);
      await app.main.waitFor(`${P}.viewer.dicom.debug()?.units === 'HU'`, { timeout: 30000 });
      const dbg = () => app.main.eval(`${P}.viewer.dicom.debug()`);
      const pick = (key, value) => app.main.eval(`(() => { const s = ${P}.dq('[data-key="${key}"]'); s.value = ${js(value)}; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      // Auto window from the values.
      await pick('dicom-preset', 'preset:lung');
      await app.main.waitFor(`${P}.viewer.dicom.debug().state.ww === 1500`);
      await pick('dicom-preset', 'auto');
      await app.main.waitFor(`${P}.viewer.dicom.debug().state.ww !== 1500`, { message: 'auto window' });
      // Ctrl+drag changes the window without choosing the tool.
      const box = await app.main.eval(`(() => { const r = ${P}.dq('.viewer-media').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
      const pt = (fx, fy) => ({ x: box.x + fx * box.w, y: box.y + fy * box.h });
      const before = (await dbg()).state;
      await app.main.mouse('mouseMoved', pt(0.5, 0.5).x, pt(0.5, 0.5).y, { button: 'none' });
      await app.main.mouse('mousePressed', pt(0.5, 0.5).x, pt(0.5, 0.5).y, { modifiers: 2 });
      for (let i = 1; i <= 6; i++) { await app.main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt(0.5, 0.5).x + i * 15, y: pt(0.5, 0.5).y + i * 6, button: 'left', buttons: 1, modifiers: 2, pointerType: 'mouse' }); await sleep(20); }
      await app.main.mouse('mouseReleased', pt(0.5, 0.5).x + 90, pt(0.5, 0.5).y + 36, { modifiers: 2 });
      let d = await dbg();
      assert.equal(d.tool, 'pan');
      assert.ok(d.state.ww > before.ww && d.state.wc > before.wc, `window by Ctrl+drag ${before.wc}/${before.ww} → ${d.state.wc}/${d.state.ww}`);
      // Measurements: undo / redo / Del, and an angle counted once.
      await app.main.eval(`${P}.viewer.dicom.testing.setTool('distance'); 1`);
      await app.main.drag(pt(0.1, 0.2), pt(0.6, 0.2));
      await app.main.drag(pt(0.1, 0.4), pt(0.6, 0.4));
      assert.equal((await dbg()).measures.length, 2);
      await app.main.key('z', 2);
      assert.equal((await dbg()).measures.length, 1, 'Ctrl+Z');
      await app.main.key('y', 2);
      assert.equal((await dbg()).measures.length, 2, 'Ctrl+Y');
      await app.main.key('Delete');
      assert.equal((await dbg()).measures.length, 1, 'Del');
      // Select a drawn measurement by clicking it: Del removes that one, not the newest.
      await app.main.drag(pt(0.1, 0.4), pt(0.6, 0.4));
      await app.main.drag(pt(0.1, 0.6), pt(0.6, 0.6));
      const ys = async () => (await dbg()).measures.map((m) => m.y);
      const [y02, y04, y06] = await ys();
      await app.main.realClick(pt(0.35, 0.2).x, pt(0.35, 0.2).y);
      assert.equal((await dbg()).selected, 0, 'click selects the line under it');
      assert.equal((await dbg()).measures.length, 3, 'selecting does not draw');
      assert.equal(await app.main.eval(`${P}.dqa('.dicom-layer .dicom-measure.selected').length`), 1, 'selection is highlighted');
      await app.main.key('Delete');
      assert.deepEqual(await ys(), [y04, y06], 'Del deletes the selected one');
      assert.ok(y02 < y04);
      // Right-click on a measurement: its context menu deletes it.
      const rc = pt(0.35, 0.6);
      await app.main.mouse('mouseMoved', rc.x, rc.y, { button: 'none' });
      await app.main.mouse('mousePressed', rc.x, rc.y, { button: 'right' });
      await app.main.mouse('mouseReleased', rc.x, rc.y, { button: 'right' });
      await app.main.waitFor(`Boolean(document.querySelector('.menu [data-id="dicom-delete-measure"]'))`, { message: 'measurement context menu' });
      assert.equal((await dbg()).selected, 1, 'right-click selects it');
      await app.main.eval(`document.querySelector('.menu [data-id="dicom-delete-measure"]').click(); 1`);
      assert.deepEqual(await ys(), [y04], 'context menu deletes it');
      // Esc drops the selection (the tool stays).
      await app.main.realClick(pt(0.35, 0.4).x, pt(0.35, 0.4).y);
      assert.equal((await dbg()).selected, 0);
      await app.main.key('Escape');
      assert.equal((await dbg()).selected, -1, 'Esc drops the selection');
      await app.main.eval(`${P}.viewer.dicom.testing.setTool('angle'); 1`);
      await app.main.drag(pt(0.2, 0.7), pt(0.5, 0.7));
      const c = pt(0.5, 0.5);
      await app.main.realClick(c.x, c.y);
      assert.equal((await dbg()).measures.filter((m) => m.type === 'angle').length, 1, 'an angle is one measurement');
      await app.main.key('z', 2);
      assert.equal((await dbg()).measures.filter((m) => m.type === 'angle').length, 0, 'one undo takes the whole angle away');
      assert.equal((await dbg()).measures.length, 1, 'the distance stays');
      // Keys: tools, invert, colour map, overlays.
      await app.main.key('Escape');
      assert.equal((await dbg()).tool, 'pan');
      await app.main.key('r');
      assert.equal((await dbg()).tool, 'distance', 'R = distance');
      await app.main.key('Escape');
      await app.main.key('i');
      await app.main.waitFor(`${P}.viewer.dicom.debug().state.invert === true`, { message: 'I = invert' });
      const map = (await dbg()).state.colormap ?? 'gray';
      await app.main.key('m');
      await app.main.waitFor(`(${P}.viewer.dicom.debug().state.colormap ?? 'gray') !== ${js(map)}`, { message: 'M = next colour map' });
      await app.main.key('g');
      assert.equal(await app.main.eval(`${P}.dqa('.dicom-ruler').length`), 0, 'G = rulers off');
      await app.main.key('g');
      // Scale bar: double-click puts it back.
      await app.main.eval(`${P}.app.settings.dicom.scaleBarAt = { x: 0.1, y: 0.3 }; 1`);
      await app.main.eval(`${P}.dq('.dicom-scalebar').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); 1`);
      assert.equal(await app.main.eval(`${P}.app.settings.dicom.scaleBarAt`), null);
      // Tags: JSON / CSV / TXT next to the file.
      for (const kind of ['json', 'csv', 'txt']) {
        const target = await app.main.eval(`${P}.viewer.dicom.testing.exportTags(${js(kind)})`);
        const text = fs.readFileSync(target, 'utf8');
        if (kind === 'json') assert.ok(JSON.parse(text).some((r) => r.tag && /Patient/.test(r.name)), 'JSON rows');
        if (kind === 'csv') assert.match(text.split('\r\n')[0], /^tag,name,vr,value$/);
        if (kind === 'txt') assert.match(text, /\t/);
        fs.rmSync(target);
      }

      // Multi-frame: measurements stay on every frame (also during a cine); cine modes; slider wheel; all frames as PNGs.
      await app.main.eval(`${P}.actions.viewItem(${js(await pathOf(app, 'cine.dcm'))}); 1`);
      await app.main.waitFor(`${P}.viewer.dicom.debug()?.frames === 8`, { timeout: 20000 });
      const box2 = await app.main.eval(`(() => { const r = ${P}.dq('.viewer-media').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
      await app.main.eval(`${P}.viewer.dicom.testing.setTool('distance'); 1`);
      await app.main.drag({ x: box2.x + box2.w * 0.2, y: box2.y + box2.h * 0.5 }, { x: box2.x + box2.w * 0.8, y: box2.y + box2.h * 0.5 });
      assert.equal((await dbg()).measures[0].frame, 0);
      await app.main.eval(`${P}.viewer.dicom.testing.setFrame(3); 1`);
      await app.main.waitFor(`${P}.viewer.dicom.debug().state.frame === 3`);
      assert.equal(await app.main.eval(`${P}.dqa('.dicom-layer .dicom-measure').length`), 1, 'still shown on another frame');
      // …and through a whole cine: sampled on every frame it shows.
      await app.main.eval(`(() => { window.__measureSeen = new Set(); window.__measureMissing = 0; ${P}.viewer.dicom.testing.startCine(); const tick = () => { const d = ${P}.viewer.dicom.debug(); if (!d?.cine) return; if (${P}.dqa('.dicom-layer .dicom-measure').length === 1) window.__measureSeen.add(d.state.frame); else window.__measureMissing += 1; requestAnimationFrame(tick); }; requestAnimationFrame(tick); return 1; })()`);
      await app.main.waitFor(`window.__measureSeen.size >= 6`, { timeout: 5000, message: 'measurement seen across the cine' });
      await app.main.eval(`${P}.viewer.dicom.testing.stopCine(); 1`);
      assert.equal(await app.main.eval(`window.__measureMissing`), 0, 'never missing while playing');
      await app.main.eval(`${P}.viewer.dicom.testing.setFrame(0); 1`);
      await app.main.waitFor(`${P}.viewer.dicom.debug().state.frame === 0 && ${P}.dqa('.dicom-layer .dicom-measure').length === 1`, { message: 'back on frame 0' });
      assert.equal(await app.main.eval(`${P}.viewer.dicom.testing.frameDelay(0)`), 100, 'the file\'s frame time');
      await app.main.eval(`${P}.dq('[data-key="dicom-frame"]').dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })); 1`);
      await app.main.waitFor(`${P}.viewer.dicom.debug().state.frame === 1`, { message: 'wheel steps a frame' });
      await pick('dicom-cine-mode', 'bounce');
      await app.main.eval(`(() => { const f = ${P}.dq('[data-key="dicom-fps"]'); f.value = '60'; f.dispatchEvent(new Event('change', { bubbles: true })); ${P}.viewer.dicom.testing.setFrame(5); return 1; })()`);
      await app.main.waitFor(`${P}.viewer.dicom.debug().state.frame === 5`);
      await app.main.key(' ');
      await app.main.waitFor(`${P}.viewer.dicom.debug().direction === -1`, { timeout: 5000, message: 'bounce turns back at the end' });
      await app.main.key(' ');
      assert.equal((await dbg()).cine, false, 'Space stops');
      await pick('dicom-cine-mode', 'once');
      await app.main.eval(`${P}.viewer.dicom.testing.setFrame(5); 1`);
      await app.main.waitFor(`${P}.viewer.dicom.debug().state.frame === 5`);
      await app.main.eval(`${P}.viewer.dicom.testing.startCine(); 1`);
      await app.main.waitFor(`!${P}.viewer.dicom.debug().cine && ${P}.viewer.dicom.debug().state.frame === 7`, { timeout: 5000, message: 'once stops at the last frame' });
      const frames = await app.main.eval(`${P}.viewer.dicom.testing.exportFrames()`);
      const pngs = fs.readdirSync(frames).filter((n) => n.endsWith('.png')).sort();
      assert.deepEqual(pngs, Array.from({ length: 8 }, (_, i) => `cine_${String(i + 1).padStart(3, '0')}.png`));
      assert.deepEqual([...fs.readFileSync(path.join(frames, pngs[0])).subarray(1, 4)], [0x50, 0x4e, 0x47]);
      fs.rmSync(frames, { recursive: true });
      await app.main.eval(`${P}.actions.setMode('manage'); 1`);
    },
  },
  {
    ids: ['FMT-ICC'],
    group: '형식', name: '색 관리: Adobe RGB 프로필이 든 TIFF 를 sRGB 로 변환해 보여 주고(상태 표시줄에 프로필), 설정에서 끄면 변환하지 않는다',
    run: async (app) => {
      const studio = dir(app, 'studio');
      // A 16 × 16 uncompressed RGB TIFF, every pixel Adobe RGB (200, 100, 50), with the profile embedded (tag 34675).
      const w = 16; const h = 16;
      const icc = Buffer.from(buildIcc({ desc: 'Adobe RGB (1998)', xyz: ADOBE, curves: { rTRC: ['gamma', 563 / 256], gTRC: ['gamma', 563 / 256], bTRC: ['gamma', 563 / 256] } }));
      const pixels = Buffer.alloc(w * h * 3);
      for (let i = 0; i < w * h; i++) pixels.set([200, 100, 50], i * 3);
      const entries = [[256, 3, 1, w], [257, 3, 1, h], [258, 3, 3, 'bps'], [259, 3, 1, 1], [262, 3, 1, 2], [273, 4, 1, 'strip'], [277, 3, 1, 3], [278, 3, 1, h], [279, 4, 1, pixels.length], [34675, 7, icc.length, 'icc']];
      const ifdAt = 8; const ifdSize = 2 + entries.length * 12 + 4;
      const bpsAt = ifdAt + ifdSize; const iccAt = bpsAt + 6 + (icc.length % 2 ? 0 : 0); const stripAt = iccAt + icc.length + (icc.length % 2);
      const tiff = Buffer.alloc(stripAt + pixels.length);
      tiff.write('II', 0); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(ifdAt, 4);
      tiff.writeUInt16LE(entries.length, ifdAt);
      entries.forEach(([tag, type, count, value], i) => {
        const at = ifdAt + 2 + i * 12;
        tiff.writeUInt16LE(tag, at); tiff.writeUInt16LE(type, at + 2); tiff.writeUInt32LE(count, at + 4);
        const v = value === 'bps' ? bpsAt : value === 'strip' ? stripAt : value === 'icc' ? iccAt : value;
        if (type === 3 && count === 1) tiff.writeUInt16LE(v, at + 8); else tiff.writeUInt32LE(v, at + 8);
      });
      [8, 8, 8].forEach((b, i) => tiff.writeUInt16LE(b, bpsAt + i * 2));
      icc.copy(tiff, iccAt);
      pixels.copy(tiff, stripAt);
      fs.writeFileSync(path.join(studio, 'adobe-rgb.tif'), tiff);
      await open(app, studio, 6);
      await reloadList(app);
      const file = await pathOf(app, 'adobe-rgb.tif');
      const centre = () => app.main.eval(`(() => { const c = document.querySelector('canvas.viewer-media'); return [...c.getContext('2d').getImageData(8, 8, 1, 1).data.slice(0, 3)]; })()`);
      const show = async () => {
        await app.main.eval(`${P}.actions.viewItem(${js(file)}); 1`);
        await app.main.waitFor(`Boolean(document.querySelector('canvas.viewer-media')) && ${P}.viewer.currentPath === ${js(file)}`, { timeout: 20000 });
        await settle(app);
      };
      await show();
      const managed = await centre();
      // Adobe RGB (200, 100, 50) is sRGB (227, 100, 42) by the standard matrices.
      assert.ok(Math.abs(managed[0] - 227) <= 2 && Math.abs(managed[1] - 100) <= 2 && Math.abs(managed[2] - 42) <= 2, `converted ${managed}`);
      assert.match(await app.main.eval(`document.querySelector('.status-profile')?.textContent ?? ''`), /Adobe RGB \(1998\)/);
      await app.main.key('Escape');
      await app.main.waitFor(`${P}.app.state.mode === 'manage'`);
      // Off in Settings → View.
      await app.main.eval(`${P}.dq('#open-settings').click(); 1`);
      await app.main.waitFor(`${TOP}?.id === 'settings-dialog'`);
      await app.main.eval(`${TOP}.querySelector('.settings-tab[data-tab=view]').click(); ${TOP}.querySelector('[data-key=color-management]').checked = false; 1`);
      await primary(app);
      await app.main.waitFor(`!${TOP} && ${P}.app.settings.colorManagement === false`);
      await show();
      assert.deepEqual(await centre(), [200, 100, 50], 'not converted when off');
      await app.main.key('Escape');
      await app.main.waitFor(`${P}.app.state.mode === 'manage'`);
      await app.main.eval(`${P}.app.settings.colorManagement = true; ${P}.app.saveSettings(); 1`);
    },
  },
  {
    ids: ['EDIT-SAVEAS', 'BATCH-CONVERT'],
    group: '편집', name: '다른 형식으로 저장: 한 사진을 지원하는 모든 쓰기 형식으로 변환하고, 앱이 각각을 다시 읽는다',
    run: async (app) => {
      const folder = path.join(app.work, 'convert');
      fs.mkdirSync(folder, { recursive: true });
      fs.copyFileSync(path.join(fixtures, 'flower.webp'), path.join(folder, 'source.webp'));
      await open(app, folder, 1);
      const formats = await app.main.eval(`(async () => (await import('/src/formats/types.js')).OUTPUT_FORMATS.map((f) => [f.id, f.ext]))()`);
      assert.ok(formats.length >= 21, `${formats.length} formats`);
      const made = [];
      for (const [id, ext] of formats) {
        if (id === 'webp') continue;
        await select(app, 'source.webp');
        await menu(app, 'tools', 'tools.convert');
        await dialog(app, 'edit.format');
        await setField(app, 'edit.format', id);
        await setField(app, 'batch.suffix', `_${id}`).catch(() => {});
        await primary(app);
        await menuDone(app, 120000);
        const file = fs.readdirSync(folder).find((name) => name.toLowerCase().endsWith(`.${ext}`) && name.startsWith('source'));
        assert.ok(file, `${id}: no .${ext} file`);
        made.push(file);
      }
      await reloadList(app);
      await app.main.waitFor(`${P}.app.state.list.every((i) => { const e = ${P}.thumbs.peek(i); return e && (e.url || e.error); })`, { timeout: 120000, message: 'thumbnails of every output' });
      const result = await app.main.eval(`${P}.app.state.list.map((i) => [i.name, ${P}.thumbs.peek(i).url ? ${P}.thumbs.peek(i).width + 'x' + ${P}.thumbs.peek(i).height : 'error: ' + ${P}.thumbs.peek(i).error])`);
      const bad = result.filter(([name, v]) => v.startsWith('error') || (!/\.(ico|pdf)$/i.test(name) && v !== result.find(([n]) => n === 'source.webp')[1]));
      assert.deepEqual(bad, [], 'every converted file opens with the same size');
      assert.equal(made.length, formats.length - 1);
    },
  },

  {
    ids: ['APP-WINDOWS'],
    group: '화면', name: '모든 대화 상자: 열면 OS 창이 하나 생기고, 확인·저장·취소·Esc·닫기 단추로 닫으면 OS 창이 남지 않는다',
    run: async (app) => {
      if (process.platform !== 'win32') return { skipped: 'Windows 창 목록으로 확인' };
      await open(app, dir(app, 'studio'), 6);
      const count = () => osWindows(app.process.pid).filter((w) => !w.endsWith('| 16x16')).length;
      const base = count();
      const dialogs = [
        ['settings: save', () => app.main.eval(`${P}.dq('#open-settings').click(); 1`), 'primary'],
        ['settings: cancel', () => app.main.eval(`${P}.dq('#open-settings').click(); 1`), 'cancel'],
        ['about', () => app.main.eval(`${P}.dq('#open-about').click(); 1`), 'primary'],
        ['shortcuts', () => menu(app, 'help', 'shortcuts.title'), 'escape'],
        ['keymap', () => menu(app, 'help', 'keys.title'), 'primary'],
        ['import', () => menu(app, 'file', 'import.title'), 'cancel'],
        ['sync', () => menu(app, 'file', 'sync.title'), 'cancel'],
        ['new folder (prompt)', () => menu(app, 'file', 'file.newFolder'), 'cancel'],
        ['rename (prompt)', async () => { await select(app, 'beach.jpg'); await menu(app, 'file', 'file.rename'); }, 'cancel'],
        ['delete (confirm)', async () => { await select(app, 'beach.jpg'); await menu(app, 'file', 'file.delete'); }, 'cancel'],
        ['EXIF editor', async () => { await select(app, 'beach.jpg'); await menu(app, 'organize', 'metadata.editExif'); }, 'cancel'],
        ['write metadata', async () => { await select(app, 'beach.jpg'); await menu(app, 'organize', 'metadata.writeToFiles'); }, 'cancel'],
        ['PDF', async () => { await select(app, 'beach.jpg'); await menu(app, 'create', 'create.pdf'); }, 'cancel'],
        ['GIF', async () => { await select(app, 'beach.jpg'); await menu(app, 'create', 'create.gif'); }, 'cancel'],
        ['slideshow export', async () => { await select(app, 'beach.jpg'); await menu(app, 'create', 'create.slideshow'); }, 'cancel'],
        ['ZIP', async () => { await select(app, 'beach.jpg'); await menu(app, 'create', 'create.zip'); }, 'cancel'],
        ['panorama', async () => { await select(app, 'beach.jpg', 'city.jpg'); await menu(app, 'create', 'create.panorama'); }, 'cancel'],
        ['print', async () => { await select(app, 'beach.jpg'); await menu(app, 'file', 'file.print'); }, 'close'],
        ['batch rename', async () => { await select(app, 'beach.jpg'); await menu(app, 'tools', 'tools.batchRename'); }, 'cancel'],
        ['batch resize', async () => { await select(app, 'beach.jpg'); await menu(app, 'tools', 'tools.batchResize'); }, 'cancel'],
        ['convert', async () => { await select(app, 'beach.jpg'); await menu(app, 'tools', 'tools.convert'); }, 'cancel'],
        ['auto adjust', async () => { await select(app, 'beach.jpg'); await menu(app, 'tools', 'tools.autoAdjust'); }, 'cancel'],
        ['dates', async () => { await select(app, 'beach.jpg'); await menu(app, 'tools', 'tools.dates'); }, 'cancel'],
        ['watermark', async () => { await select(app, 'beach.jpg'); await menu(app, 'tools', 'tools.watermark'); }, 'cancel'],
        ['duplicates', () => menu(app, 'tools', 'tools.duplicates'), 'cancel'],
        ['custom theme', () => app.main.eval(`(() => { const s = ${P}.dq('.theme-select'); s.value = '__edit-custom'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`), 'cancel'],
      ];
      const problems = [];
      for (const [name, openIt, how] of dialogs) {
        await openIt();
        try {
          await app.main.waitFor(`Boolean(${P}.topDialog()) && ${P}.topDialog().ownerDocument !== document`, { timeout: 8000 });
        } catch { problems.push(`${name}: no dialog window`); await app.main.eval(`${P}.closeAllDialogs(); 1`); continue; }
        await sleep(300);
        if (!(await app.main.eval(`Boolean(${P}.topDialog())`))) {
          problems.push(`${name}: dialog closed before ${how}`);
          await app.main.eval(`${P}.closeAllDialogs(); 1`);
          continue;
        }
        if (count() !== base + 1) problems.push(`${name}: ${count() - base} OS windows while open`);
        const box = `${P}.topDialog()`;
        if (how === 'primary') await app.main.eval(`(() => { const d = ${box}; if (!d) return 0; d.querySelector('.dialog-buttons .btn.primary').click(); return 1; })()`);
        else if (how === 'cancel') await app.main.eval(`(() => { const d = ${box}; if (!d) return 0; const b = [...d.querySelectorAll('.dialog-buttons .btn')].find((x) => !x.classList.contains('primary')); (b ?? d.querySelector('.dialog-buttons .btn')).click(); return 1; })()`);
        else if (how === 'escape') await app.main.eval(`(() => { const d = ${box}; if (!d) return 0; d.ownerDocument.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1; })()`);
        else await app.main.eval(`(() => { const d = ${box}; if (!d) return 0; d.ownerDocument.defaultView.close(); return 1; })()`);
        try {
          await app.main.waitFor(`!${P}.topDialog()`, { timeout: 8000 });
        } catch { problems.push(`${name}: still open after ${how}`); await app.main.eval(`${P}.closeAllDialogs(); 1`); }
        await sleep(400);
        if (count() !== base) problems.push(`${name}: ${count() - base} OS window(s) left after ${how}`);
      }
      await app.main.eval(`${P}.app.settings.theme = 'dark'; ${P}.app.saveSettings(); 1`);
      assert.deepEqual(problems, []);
    },
  },

  // ───────── metadata
  {
    ids: ['ORG-QUICKKEY', 'META-TEMPLATE'],
    group: '메타데이터', name: '빠른 키워드 세트(편집 창·버튼·Alt+Shift+숫자)와 메타데이터 템플릿(공통 값 저장 → 다른 사진에 한 번에 적용)',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      const pair = await select(app, 'beach.jpg', 'city.jpg');
      await app.main.eval(`${P}.actions.showRightTab('properties'); 1`);
      await app.main.waitFor(`Boolean(${P}.dq('#edit-keyword-sets'))`);
      // Edit the sets: name the first one and give it keywords, add a second set.
      await app.main.eval(`${P}.dq('#edit-keyword-sets').click(); 1`);
      await app.main.waitFor(`${TOP}?.id === 'keyword-sets-dialog'`);
      const type = (selector, value) => app.main.eval(`(() => { const i = ${TOP}.querySelector(${js(selector)}); i.value = ${js(value)}; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await type('[data-set="0"][data-part=name]', 'Travel');
      await type('[data-set="0"][data-part=keywords]', 'sea, city, holiday');
      await app.main.eval(`${TOP}.querySelector('#add-keyword-set').click(); 1`);
      await type('[data-set="1"][data-part=name]', 'People');
      await type('[data-set="1"][data-part=keywords]', 'family');
      await primary(app);
      await app.main.waitFor(`!${TOP} && ${P}.dqa('.quick-keyword').length === 3`, { message: 'three quick keyword buttons' });
      assert.deepEqual(await app.main.eval(`${P}.app.settings.keywordSets.map((x) => x.name)`), ['Travel', 'People']);
      // A button adds the keyword to every selected photo; a second click takes it off.
      await app.main.eval(`${P}.dq('.quick-keyword[data-keyword=sea]').click(); 1`);
      await app.main.waitFor(`${js(pair)}.every((p) => ${P}.app.catalog.get(p)?.keywords?.includes('sea'))`, { message: 'sea on both' });
      await app.main.waitFor(`${P}.dq('.quick-keyword[data-keyword=sea]')?.classList.contains('on')`);
      await app.main.eval(`${P}.dq('.quick-keyword[data-keyword=sea]').click(); 1`);
      await app.main.waitFor(`${js(pair)}.every((p) => !${P}.app.catalog.get(p)?.keywords?.includes('sea'))`, { message: 'sea removed' });
      // Alt+Shift+2 = second keyword of the active set.
      await app.main.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '@', code: 'Digit2', altKey: true, shiftKey: true, bubbles: true })); 1`);
      await app.main.waitFor(`${js(pair)}.every((p) => ${P}.app.catalog.get(p)?.keywords?.includes('city'))`, { message: 'Alt+Shift+2' });
      // Switching the set changes the buttons.
      await app.main.eval(`(() => { const s = ${P}.dq('[data-key=keyword-set]'); s.value = '1'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await app.main.waitFor(`${P}.dqa('.quick-keyword').map((b) => b.dataset.keyword).join() === 'family'`);

      // Template: the selection's common IPTC values (and keywords) are saved under a name …
      await app.main.eval(`${P}.app.catalog.setFields(${js(pair)}, { copyright: '© 2025 Template', city: 'Busan', credit: 'Studio' }); 1`);
      await select(app, 'beach.jpg', 'city.jpg');
      await app.main.waitFor(`Boolean(${P}.dq('#save-metadata-template')) && !${P}.dq('#save-metadata-template').disabled`);
      await app.main.eval(`${P}.dq('#save-metadata-template').click(); 1`);
      await app.main.waitFor(`Boolean(${TOP}?.querySelector('input'))`);
      await app.main.eval(`(() => { const i = ${TOP}.querySelector('input'); i.value = 'Busan shoot'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await primary(app);
      await app.main.waitFor(`${P}.app.settings.metadataTemplates.length === 1`);
      const saved = await app.main.eval(`${P}.app.settings.metadataTemplates[0]`);
      assert.equal(saved.name, 'Busan shoot');
      assert.deepEqual({ ...saved.fields }, { copyright: '© 2025 Template', credit: 'Studio', city: 'Busan' });
      assert.deepEqual(saved.keywords, ['city']);
      // … and applied to another photo in one step.
      const [forest] = await select(app, 'forest.jpg');
      await app.main.waitFor(`${P}.dq('[data-field=city]')?.value === '' && Boolean(${P}.dq('[data-key=metadata-template]')) && !${P}.dq('[data-key=metadata-template]').disabled`, { message: 'panel shows forest.jpg' });
      await app.main.eval(`(() => { const s = ${P}.dq('[data-key=metadata-template]'); s.value = 'Busan shoot'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await app.main.waitFor(`(() => { const r = ${P}.app.catalog.get(${js(forest)}); return r?.copyright === '© 2025 Template' && r.city === 'Busan' && r.credit === 'Studio' && r.keywords?.includes('city'); })()`, { message: 'template applied' });
      await app.main.eval(`${P}.app.settings.keywordSet = 0; ${P}.app.saveSettings(); 1`);
    },
  },
  {
    ids: ['META-IPTC', 'META-EMBED', 'META-BATCH'],
    group: '메타데이터', name: 'IPTC 필드(헤드라인·도시·저작권…) 입력, 여러 장 한꺼번에 설명 → "파일에 넣기"로 JPEG 안에 XMP·EXIF 기록',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      const [forest] = await select(app, 'forest.jpg');
      await app.main.eval(`${P}.actions.showRightTab('properties'); 1`);
      await app.main.waitFor(`Boolean(${P}.dq('.prop-iptc [data-field=headline]'))`);
      const fill = async (field, value) => app.main.eval(`(() => { const i = ${P}.dq('[data-field=${field}]'); i.value = ${js(value)}; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await fill('headline', 'Morning in the forest');
      await fill('city', 'Gangneung');
      await fill('country', 'South Korea');
      await fill('copyright', '© 2024 Tester');
      await fill('author', 'Test Author');
      await app.main.waitFor(`(() => { const r = ${P}.app.catalog.get(${js(forest)}); return r.headline === 'Morning in the forest' && r.city === 'Gangneung' && r.copyright === '© 2024 Tester'; })()`);
      const paths = await select(app, 'beach.jpg', 'city.jpg', 'forest.jpg');
      await app.main.waitFor(`Boolean(${P}.dq('[data-field=caption]'))`);
      await sleep(200);
      await fill('caption', 'Batch caption');
      await app.main.waitFor(`${js(paths)}.every((p) => ${P}.app.catalog.get(p)?.caption === 'Batch caption')`, { message: 'caption on all three' });
      await select(app, 'forest.jpg');
      await menu(app, 'organize', 'metadata.writeToFiles');
      await dialog(app, 'metadata.embedJpeg');
      await setCheck(app, 'metadata.embedJpeg', true);
      await primary(app);
      await menuDone(app);
      const bytes = fs.readFileSync(path.join(dir(app, 'studio'), 'forest.jpg'));
      const text = bytes.toString('utf8');
      assert.ok(text.includes('http://ns.adobe.com/xap/1.0/'), 'XMP packet');
      for (const value of ['Morning in the forest', 'Gangneung', 'South Korea', 'Batch caption', 'Test Author']) assert.ok(text.includes(value), value);
      const meta = (await readMetadata(new Uint8Array(bytes))).summary;
      assert.equal(meta.artist, 'Test Author');
      assert.equal(meta.copyright, '© 2024 Tester');
      assert.equal(meta.caption, 'Batch caption');
      assert.equal(meta.model, 'ILCE-7M4', 'camera EXIF kept');
      assert.ok((await imageInfo(app, path.join(dir(app, 'studio'), 'forest.jpg'))).width === 1600, 'still a valid JPEG');
    },
  },
  {
    ids: ['META-EMBED-MORE'],
    group: '메타데이터', name: '"파일에 넣기"로 PNG·WebP·TIFF 안에도 XMP(별점·키워드·헤드라인)를 기록, 사이드카는 만들지 않는다',
    run: async (app) => {
      const studio = dir(app, 'studio');
      for (const name of ['sunset.png', 'flower.webp', 'scan.tif']) fs.copyFileSync(path.join(fixtures, name), path.join(studio, `embed-${name}`));
      await open(app, studio, 6);
      await reloadList(app);
      const paths = await select(app, 'embed-sunset.png', 'embed-flower.webp', 'embed-scan.tif');
      await app.main.eval(`${P}.app.catalog.setRating(${js(paths)}, 4); ${P}.app.catalog.addKeywords(${js(paths)}, ['embedded']); ${P}.app.catalog.setFields(${js(paths)}, { headline: 'Inside the file' }); 1`);
      await menu(app, 'organize', 'metadata.writeToFiles');
      await dialog(app, 'metadata.embedJpeg');
      await setCheck(app, 'metadata.embedJpeg', true);
      await primary(app);
      await menuDone(app);
      for (const name of ['embed-sunset.png', 'embed-flower.webp', 'embed-scan.tif']) {
        const bytes = new Uint8Array(fs.readFileSync(path.join(studio, name)));
        const xmp = readEmbeddedXmp(bytes);
        assert.match(xmp, /xmp:Rating="4"|<xmp:Rating>4</, `${name}: rating`);
        assert.match(xmp, /embedded/, `${name}: keyword`);
        assert.match(xmp, /Inside the file/, `${name}: headline`);
        assert.ok(!fs.existsSync(path.join(studio, name.replace(/\.[^.]+$/, '.xmp'))), `${name}: no sidecar`);
      }
      // The files still open.
      await app.main.eval(`${P}.actions.viewItem(${js(paths[2])}); 1`);
      await app.main.waitFor(`${P}.app.state.mode === 'view' && ${P}.viewer.debug().width > 0`, { timeout: 30000, message: 'TIFF still opens' });
      await app.main.key('Escape');
      await app.main.waitFor(`${P}.app.state.mode === 'manage'`);
    },
  },
  {
    ids: ['META-EXIFEDIT'],
    group: '메타데이터', name: 'EXIF 편집: 작성자·모델·촬영일·GPS 저장 → 파일의 EXIF 와 카탈로그가 바뀐다',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      const [city] = await select(app, 'city.jpg');
      await menu(app, 'organize', 'metadata.editExif');
      await app.main.waitFor(`Boolean(${P}.dq('#exif-editor'))`);
      await setField(app, 'exif.artist', 'EXIF Tester');
      await setField(app, 'exifEdit.model', 'Edited Model');
      await setField(app, 'exif.taken', '2020-05-06T07:08:09');
      await setField(app, 'exifEdit.lat', '36.5');
      await setField(app, 'exifEdit.lon', '127.25');
      await primary(app);
      await menuDone(app);
      const meta = (await readMetadata(new Uint8Array(fs.readFileSync(path.join(dir(app, 'studio'), 'city.jpg'))))).summary;
      assert.equal(meta.artist, 'EXIF Tester');
      assert.equal(meta.model, 'Edited Model');
      const taken = new Date(meta.taken);
      assert.deepEqual([taken.getFullYear(), taken.getMonth(), taken.getDate(), taken.getHours(), taken.getMinutes()], [2020, 4, 6, 7, 8]);
      assert.ok(Math.abs(meta.lat - 36.5) < 1e-4 && Math.abs(meta.lon - 127.25) < 1e-4);
      assert.equal(readOrientation(new Uint8Array(fs.readFileSync(path.join(dir(app, 'studio'), 'city.jpg')))), 6, 'orientation kept');
      await app.main.waitFor(`${P}.app.catalog.get(${js(city)})?.meta?.artist === 'EXIF Tester'`);
    },
  },
  {
    ids: ['META-GEOTAG', 'BROWSE-MAP'],
    group: '메타데이터', name: '지도에 놓아 지오태그(끌어 놓기 대상) → 파일에 넣으면 EXIF GPS 로 기록',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      const [portrait] = await select(app, 'portrait.jpg');
      await app.main.eval(`${P}.app.catalog.get(${js(portrait)}).meta.lat = undefined; 1`);
      await app.main.eval(`${P}.actions.showRightTab('map'); 1`);
      await app.main.waitFor(`Boolean(${P}.dq('[data-drop="__map__"]'))`, { message: 'map accepts drops' });
      const center = await app.main.center('[data-drop="__map__"]');
      await app.main.eval(`${P}.mapPane.placeAt(${center.x}, ${center.y}, [${js(portrait)}]); 1`);
      const spot = await app.main.eval(`(() => { const r = ${P}.app.catalog.get(${js(portrait)}); return r.geotagged ? { lat: r.meta.lat, lon: r.meta.lon } : null; })()`);
      assert.ok(spot && Number.isFinite(spot.lat) && Number.isFinite(spot.lon), 'geotagged');
      await menu(app, 'organize', 'metadata.writeToFiles');
      await dialog(app, 'metadata.embedJpeg');
      await primary(app);
      await menuDone(app);
      const meta = (await readMetadata(new Uint8Array(fs.readFileSync(path.join(dir(app, 'studio'), 'portrait.jpg'))))).summary;
      assert.ok(Math.abs(meta.lat - spot.lat) < 1e-4 && Math.abs(meta.lon - spot.lon) < 1e-4, `EXIF GPS ${meta.lat}, ${meta.lon}`);
      await app.main.eval(`${P}.actions.showRightTab('properties'); 1`);
    },
  },
  {
    ids: ['META-GPX'],
    group: '메타데이터', name: 'GPX 트랙으로 위치 지정: 촬영 시각으로 트랙 위 위치(보간), 시계 차이 보정, 미리 보기, 이미 위치 있는 사진은 건너뜀',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      // Two photos with a date taken and no location (set here so the test does not depend on the fixtures).
      const [pathA, pathB] = await Promise.all([pathOf(app, 'forest.jpg'), pathOf(app, 'beach.jpg')]);
      await app.main.waitFor(`[${js(pathA)}, ${js(pathB)}].every((p) => ${P}.app.catalog.get(p)?.indexed)`, { timeout: 30000, message: 'indexed first' });
      // Put back afterwards exactly as found (later cases read beach.jpg's own GPS).
      const original = await app.main.eval(`JSON.stringify([${js(pathA)}, ${js(pathB)}].map((p) => ${P}.app.catalog.get(p).meta))`);
      const takenA = Date.UTC(2024, 4, 1, 9, 30);
      const takenB = Date.UTC(2024, 4, 1, 11, 0);
      await app.main.eval(`${P}.app.catalog.update([${js(pathA)}], (r) => { r.meta = { ...(r.meta ?? {}), taken: ${takenA} }; delete r.meta.lat; delete r.meta.lon; }, 'location'); ${P}.app.catalog.update([${js(pathB)}], (r) => { r.meta = { ...(r.meta ?? {}), taken: ${takenB} }; delete r.meta.lat; delete r.meta.lon; }, 'location'); 1`);
      // The camera clock was 1 hour behind: the track runs one hour later.
      const shift = 3_600_000;
      const pt = (lat, lon, time) => `<trkpt lat="${lat}" lon="${lon}"><ele>100</ele><time>${new Date(time).toISOString()}</time></trkpt>`;
      const gpx = `<?xml version="1.0"?><gpx version="1.1" creator="test"><trk><trkseg>
        ${pt(35.0, 129.0, takenA + shift - 60_000)}${pt(35.002, 129.004, takenA + shift + 60_000)}
        ${pt(36.0, 128.0, takenB + shift - 30_000)}${pt(36.0, 128.0, takenB + shift + 30_000)}
      </trkseg></trk></gpx>`;
      const track = path.join(app.work, 'walk.gpx');
      fs.writeFileSync(track, gpx);
      await select(app, 'forest.jpg', 'beach.jpg');
      await pick(app, [track]);
      await menu(app, 'organize', 'gpx.menu');
      await app.main.waitFor(`${TOP}?.id === 'gpx-dialog'`);
      // Without the offset nothing is on the track; with +1 h both are.
      await app.main.waitFor(`${TOP}.querySelectorAll('tr[data-gpx-row]').length === 2 && ${TOP}.querySelectorAll('tr[data-gpx-row]:not(.diff)').length === 0`, { message: 'no match without offset' });
      await app.main.eval(`(() => { const i = ${TOP}.querySelector('[data-key=gpx-hours]'); i.value = '1'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await app.main.waitFor(`${TOP}.querySelectorAll('tr[data-gpx-row]:not(.diff)').length === 2`, { message: 'both match with +1 h' });
      await primary(app);
      await app.main.waitFor(`${P}.app.catalog.get(${js(pathA)})?.meta?.lat != null && ${P}.app.catalog.get(${js(pathB)})?.meta?.lat != null`);
      const a = await app.main.eval(`${P}.app.catalog.get(${js(pathA)}).meta`);
      const b = await app.main.eval(`${P}.app.catalog.get(${js(pathB)}).meta`);
      assert.ok(Math.abs(a.lat - 35.001) < 1e-4 && Math.abs(a.lon - 129.002) < 1e-4, `A interpolated: ${a.lat}, ${a.lon}`);
      assert.equal(a.alt, 100);
      assert.deepEqual([b.lat, b.lon], [36, 128]);
      // Run again: both already have a location, so nothing changes unless asked.
      await pick(app, [track]);
      await menu(app, 'organize', 'gpx.menu');
      await app.main.waitFor(`${TOP}?.id === 'gpx-dialog'`);
      await app.main.eval(`(() => { const i = ${TOP}.querySelector('[data-key=gpx-hours]'); i.value = '1'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      assert.equal(await app.main.eval(`${TOP}.querySelectorAll('tr[data-gpx-row]:not(.diff)').length`), 0, 'already located: skipped');
      await app.main.eval(`(() => { const c = ${TOP}.querySelector('[data-key=gpx-overwrite]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      assert.equal(await app.main.eval(`${TOP}.querySelectorAll('tr[data-gpx-row]:not(.diff)').length`), 2, 'overwrite on');
      await app.main.eval(`${TOP}.querySelector('.dialog-buttons .btn:not(.primary)').click(); 1`);
      await app.main.waitFor(`!${TOP}`);
      await app.main.eval(`(() => { const [a, b] = ${original}; ${P}.app.catalog.update([${js(pathA)}], (r) => { r.meta = a; }, 'location'); ${P}.app.catalog.update([${js(pathB)}], (r) => { r.meta = b; }, 'location'); return 1; })()`);
    },
  },
  {
    ids: ['META-PLACES'],
    group: '메타데이터', name: '주소 찾기: GPS → 도시·나라(OpenStreetMap 응답은 가짜)',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      const [beach] = await select(app, 'beach.jpg');
      await app.main.waitFor(`${P}.app.catalog.get(${js(beach)})?.meta?.lat != null`);
      await app.main.eval(`(() => {
        window.__realFetch = window.fetch; window.__geoCalls = [];
        window.fetch = async (url, options) => { if (String(url).includes('nominatim')) { window.__geoCalls.push(String(url)); return new Response(JSON.stringify({ address: { city: 'Busan', state: 'Busan', country: 'South Korea', country_code: 'kr', suburb: 'Haeundae' } }), { headers: { 'content-type': 'application/json' } }); } return window.__realFetch(url, options); };
        ${P}.app.settings.mapTiles = true; ${P}.app.catalog.setFields([${js(beach)}], { city: '', country: '', countryCode: '', sublocation: '', state: '' }); return 1; })()`);
      try {
        await menu(app, 'organize', 'places.lookUp');
        await menuDone(app);
        const record = await app.main.eval(`${P}.app.catalog.get(${js(beach)})`);
        assert.equal(record.city, 'Busan');
        assert.equal(record.country, 'South Korea');
        assert.equal(record.countryCode, 'KR');
        assert.equal(record.sublocation, 'Haeundae');
        const calls = await app.main.eval('window.__geoCalls');
        assert.equal(calls.length, 1);
        assert.match(calls[0], /lat=35\.158/);
      } finally {
        await app.main.eval(`window.fetch = window.__realFetch; 1`);
      }
    },
  },

  // ───────── people
  {
    ids: ['ORG-PEOPLE-NAME', 'ORG-PEOPLE-BROWSE', 'VIEW-FACES'],
    group: '사람', name: '얼굴에 이름 붙이기 → 사람 창에서 그 사람의 사진만, 이름 바꾸기, 뷰어에서 얼굴 상자(G)',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      const portrait = await pathOf(app, 'portrait.jpg');
      await app.main.eval(`${P}.app.catalog.setFaces(${js(portrait)}, []); ${P}.app.catalog.addFace(${js(portrait)}, { x: 0.29, y: 0.22, w: 0.42, h: 0.32 }); 1`);
      await menu(app, 'organize', 'people.nameFaces');
      await app.main.waitFor(`Boolean(${TOP}?.querySelector('.face-grid .face-cell input'))`);
      await app.main.eval(`(() => { const i = ${TOP}.querySelector('.face-grid .face-cell input'); i.value = 'Alice'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await primary(app);
      await menuDone(app);
      await app.main.waitFor(`${P}.app.catalog.people.includes('Alice') && ${P}.app.catalog.get(${js(portrait)}).faces[0].person === 'Alice'`);
      await app.main.eval(`${P}.actions.showLeftTab('people'); 1`);
      await app.main.waitFor(`Boolean(${P}.dq('.people-pane [data-person="Alice"]'))`, { message: 'Alice in the people pane' });
      assert.equal(await app.main.eval(`${P}.dq('.people-pane [data-person="Alice"] .cat-count').textContent`), '1');
      await app.main.eval(`${P}.dq('.people-pane [data-person="Alice"]').click(); 1`);
      await app.main.waitFor(`${P}.app.state.source.type === 'filter' && !${P}.app.state.loading && ${P}.app.state.list.length === 1 && ${P}.app.state.list[0].path === ${js(portrait)}`, { message: 'photos of Alice' });
      await app.main.eval(`${P}.app.catalog.renamePerson('Alice', 'Alicia'); 1`);
      await app.main.waitFor(`Boolean(${P}.dq('.people-pane [data-person="Alicia"]')) && ${P}.app.catalog.get(${js(portrait)}).faces[0].person === 'Alicia'`, { message: 'renamed' });
      // Viewer: G shows the boxes; clicking one names the face.
      await app.main.eval(`${P}.app.settings.viewer.faces = false; ${P}.actions.viewItem(${js(portrait)}); 1`);
      await app.main.waitFor(`${P}.viewer.currentPath === ${js(portrait)} && ${P}.viewer.debug().kind !== 'placeholder' && ${P}.viewer.debug().width > 0`);
      await app.main.key('g');
      await app.main.waitFor(`${P}.viewer.debug().faces === 1`, { message: 'face box shown' });
      assert.equal(await app.main.eval(`${P}.dq('.face-box .face-name').textContent`), 'Alicia');
      await app.main.eval(`${P}.dq('.face-box').click(); 1`);
      await dialog(app, 'people.name');
      await setField(app, 'people.name', 'Bob');
      await primary(app);
      await app.main.waitFor(`${P}.app.catalog.get(${js(portrait)}).faces[0].person === 'Bob' && ${P}.dq('.face-box .face-name')?.textContent === 'Bob'`);
      await app.main.key('g');
      await app.main.eval(`${P}.actions.setMode('manage'); ${P}.actions.showLeftTab('folders'); 1`);
    },
  },
  {
    ids: ['ORG-PEOPLE-DETECT', 'ORG-PEOPLE-SUGGEST'],
    group: '사람', name: '얼굴 감지(실제 얼굴 사진) → 한 장에 이름을 붙이면 같은 얼굴의 다른 사진에 그 이름이 제안된다',
    run: async (app) => {
      if (!fs.existsSync(path.join(app.work, 'people', 'face-a.jpg'))) return { skipped: `얼굴 사진 없음 (${FACE_PHOTO})` };
      await open(app, dir(app, 'people'), 2);
      const a = await pathOf(app, 'face-a.jpg');
      const b = await pathOf(app, 'face-b.jpg');
      await menu(app, 'organize', 'people.scanList');
      await menuDone(app, 180000);
      const found = await app.main.eval(`[${js(a)}, ${js(b)}].map((p) => (${P}.app.catalog.get(p)?.faces ?? []).map((f) => ({ box: f.box, d: f.descriptor?.length ?? 0 })))`);
      assert.ok(found[0].length >= 1 && found[1].length >= 1, `faces found: ${found[0].length}, ${found[1].length}`);
      assert.ok(found[0][0].d === 128, 'face descriptor (128 values)');
      const box = found[0][0].box;
      assert.ok(box.w > 0.02 && box.w < 1 && box.x >= 0 && box.x + box.w <= 1.01, `box ${JSON.stringify(box)}`);
      await app.main.eval(`${P}.app.catalog.nameFace(${js(a)}, 0, 'Tester'); 1`);
      await app.main.eval(`${P}.actions.showLeftTab('people'); 1`);
      await app.main.waitFor(`Boolean(${P}.dq('#people-scan'))`);
      // Rescan (forced) suggests the named person for the same face in the other photo.
      await app.main.eval(`[...${P}.dqa('.people-pane button')].find((x) => x.textContent.includes(${P}.t('people.rescan'))).click(); 1`);
      await app.main.waitFor(`(${P}.app.catalog.get(${js(b)})?.faces ?? []).some((f) => f.suggested === 'Tester')`, { timeout: 180000, message: 'suggestion' });
      // The naming dialog offers the suggestion; accepting names it.
      await menu(app, 'organize', 'people.nameFaces');
      await app.main.waitFor(`Boolean(${TOP}?.querySelector('.face-grid'))`);
      await app.main.eval(`(() => { for (const cell of ${TOP}.querySelectorAll('.face-cell')) { const accept = [...cell.querySelectorAll('button')].find((x) => !x.hidden && x.textContent.includes('Tester')); accept?.click(); } return 1; })()`);
      await primary(app);
      await menuDone(app);
      await app.main.waitFor(`(${P}.app.catalog.get(${js(b)})?.faces ?? []).some((f) => f.person === 'Tester')`);
      await app.main.eval(`${P}.actions.showLeftTab('folders'); 1`);
    },
  },

  // ───────── private folder
  {
    ids: ['ORG-PRIVATE'],
    group: '비공개 폴더', name: '암호 설정 → 사진을 옮기면 원본이 사라지고 암호화되어 보관 → 보기 → 복원 → 잠금 → 틀린 암호 거부',
    run: async (app) => {
      const studio = dir(app, 'studio');
      fs.copyFileSync(path.join(fixtures, 'beach-small.jpg'), path.join(studio, 'secret.jpg'));
      const original = fs.readFileSync(path.join(studio, 'secret.jpg'));
      await open(app, studio, 6);
      await menu(app, 'file', 'private.title', 'private.open');
      await dialog(app, 'private.passwordAgain', 60000);
      await app.main.eval(`(() => { for (const i of ${TOP}.querySelectorAll('input[type=password]')) { i.value = 'open-sesame'; i.dispatchEvent(new Event('input', { bubbles: true })); } return 1; })()`);
      await primary(app);
      await menuDone(app);
      await app.main.waitFor(`${P}.app.state.source.path?.startsWith('@') && !${P}.app.state.loading`, { message: 'private folder opened' });
      await open(app, studio, 6);
      await select(app, 'secret.jpg');
      await menu(app, 'file', 'private.title', 'private.moveTo');
      await dialog(app, 'private.move');
      await primary(app);
      await menuDone(app);
      assert.ok(!fs.existsSync(path.join(studio, 'secret.jpg')), 'original removed');
      // Nothing in the app data holds the picture in the clear.
      const marker = original.subarray(original.length - 64);
      const contains = (file) => { try { return fs.readFileSync(file).includes(marker); } catch { return false; } }; // WebView2 locks some of its files
      const scan = (folder) => fs.readdirSync(folder, { withFileTypes: true }).some((e) => (e.isDirectory() ? scan(path.join(folder, e.name)) : contains(path.join(folder, e.name))));
      assert.ok(!scan(app.data) && !scan(app.profile), 'stored encrypted');
      await menu(app, 'file', 'private.title', 'private.open');
      await menuDone(app);
      await app.main.waitFor(`${P}.app.state.source.path?.startsWith('@') && ${P}.app.state.list.some((i) => i.name === 'secret.jpg')`, { message: 'in the private folder' });
      const secret = await pathOf(app, 'secret.jpg');
      await app.main.eval(`${P}.actions.viewItem(${js(secret)}); 1`);
      await app.main.waitFor(`${P}.viewer.currentPath === ${js(secret)} && ${P}.viewer.debug().kind !== 'placeholder' && ${P}.viewer.debug().width === 800`, { timeout: 20000, message: 'decrypted and shown' });
      await app.main.eval(`${P}.actions.setMode('manage'); 1`);
      await app.main.waitFor(`${P}.app.state.source.path?.startsWith('@')`);
      await select(app, 'secret.jpg');
      await pick(app, studio);
      await menu(app, 'file', 'private.title', 'private.restore');
      await menuDone(app);
      assert.ok(fs.existsSync(path.join(studio, 'secret.jpg')), 'restored');
      assert.ok(fs.readFileSync(path.join(studio, 'secret.jpg')).equals(original), 'same bytes');
      await menu(app, 'file', 'private.title', 'private.lock');
      await menuDone(app);
      assert.equal(await app.main.eval(`${P}.menu === undefined ? null : (() => { try { ${P}.menu('file', 'private.title', 'private.lock'); return 'enabled'; } catch (e) { return e.message; } })()`), 'menu item disabled: private.lock');
      await menu(app, 'file', 'private.title', 'private.open');
      await dialog(app, 'private.password');
      await app.main.eval(`(() => { const i = ${TOP}.querySelector('input[type=password]'); i.value = 'wrong-one'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await primary(app);
      await menuDone(app);
      await waitToast(app, 'private.wrong');
      assert.ok(!(await app.main.eval(`${P}.app.state.source.path?.startsWith('@') ?? false`)), 'still locked');
      fs.rmSync(path.join(studio, 'secret.jpg'));
    },
  },

  // ───────── import, scan, sync, shell
  {
    ids: ['FILE-IMPORT'],
    group: '가져오기', name: '가져오기: 날짜 하위 폴더(YYYY/MM)·이름 trip_###·키워드·별점·원본 삭제, 다시 가져오면 중복 건너뛰기',
    run: async (app) => {
      const src = dir(app, 'import-src');
      const dst = dir(app, 'import-dst');
      await open(app, dst, 0);
      await menu(app, 'file', 'import.title');
      await app.main.waitFor(`Boolean(${P}.dq('#import-dialog'))`);
      await pick(app, src);
      await app.main.eval(`${P}.dq('#import-pick-source').click(); 1`);
      await app.main.waitFor(`${P}.dqa('#import-dialog .import-cell').length === 3`, { message: 'three photos to import' });
      await pick(app, dst);
      await clickText(app, 'import.chooseDestination');
      await app.main.waitFor(`[...${P}.dqa('#import-dialog .folder-label')].some((e) => e.textContent.includes('import-dst'))`);
      await setField(app, 'import.subfolders', 'YYYY/MM');
      await setField(app, 'import.rename', 'trip_###');
      await setField(app, 'import.keywords', 'imported, holiday');
      await setField(app, 'organize.ratingLabel', '3');
      await setCheck(app, 'import.skipDuplicates', true);
      await setCheck(app, 'import.deleteAfter', true);
      await primary(app);
      await menuDone(app);
      const expected = [['2023', '07'], ['2024', '03'], ['2024', '10']];
      const imported = expected.flatMap(([y, m]) => (fs.existsSync(path.join(dst, y, m)) ? fs.readdirSync(path.join(dst, y, m)).map((n) => path.join(dst, y, m, n)) : []));
      assert.equal(imported.length, 3, `imported: ${imported.map((p) => path.relative(dst, p)).join(', ')}`);
      for (const file of imported) assert.match(path.basename(file), /^trip_\d{3}\.jpg$/);
      assert.deepEqual(fs.readdirSync(src), [], 'originals deleted');
      const records = await app.main.eval(`${js(imported)}.map((p) => ${P}.app.catalog.get(p))`);
      for (const r of records) { assert.deepEqual([...r.keywords].sort(), ['holiday', 'imported']); assert.equal(r.rating, 3); }
      // Same photos again: all skipped.
      for (const name of ['beach.jpg', 'city.jpg', 'forest.jpg']) fs.copyFileSync(path.join(fixtures, name), path.join(src, name));
      await menu(app, 'file', 'import.title');
      await app.main.waitFor(`Boolean(${P}.dq('#import-dialog'))`);
      await pick(app, src);
      await app.main.eval(`${P}.dq('#import-pick-source').click(); 1`);
      await app.main.waitFor(`${P}.dqa('#import-dialog .import-cell').length === 3`);
      await setCheck(app, 'import.deleteAfter', false);
      await primary(app);
      await menuDone(app);
      const after = expected.flatMap(([y, m]) => fs.readdirSync(path.join(dst, y, m)));
      assert.equal(after.length, 3, 'duplicates skipped');
      assert.equal(fs.readdirSync(src).length, 3, 'originals kept this time');
    },
  },
  {
    ids: ['FILE-MTP'],
    group: '가져오기', name: '휴대폰·카메라(MTP)에서 가져오기: 기기 버튼 → 새 사진만 복사(DCIM) → 가져오기 창에서 골라 가져옴, 두 번째는 이미 복사됨',
    run: async (app) => {
      // The fake phone (MYPHOTO_FAKE_MTP): camera photos in DCIM, something else elsewhere.
      const phone = dir(app, 'phone');
      fs.mkdirSync(path.join(phone, 'DCIM', 'Camera'), { recursive: true });
      fs.mkdirSync(path.join(phone, 'Download'), { recursive: true });
      fs.copyFileSync(path.join(fixtures, 'beach.jpg'), path.join(phone, 'DCIM', 'Camera', 'IMG_0001.jpg'));
      fs.copyFileSync(path.join(fixtures, 'forest.jpg'), path.join(phone, 'DCIM', 'Camera', 'IMG_0002.jpg'));
      fs.copyFileSync(path.join(fixtures, 'city.jpg'), path.join(phone, 'Download', 'not-a-camera-photo.jpg'));
      const dst = dir(app, 'from-phone');
      fs.mkdirSync(dst, { recursive: true });
      await open(app, dst, 0);
      await menu(app, 'file', 'import.title');
      await app.main.waitFor(`Boolean(${P}.dq('#import-dialog [data-mtp-device]'))`, { timeout: 20000, message: 'device listed' });
      assert.equal(await app.main.eval(`${P}.dq('#import-dialog [data-mtp-device]').textContent`), 'Test Phone');
      await app.main.eval(`${P}.dq('#import-dialog [data-mtp-device]').click(); 1`);
      await app.main.waitFor(`${P}.dqa('#import-dialog .import-cell').length === 2`, { timeout: 30000, message: 'two camera photos' });
      assert.deepEqual((await app.main.eval(`${P}.dqa('#import-dialog .import-cell span').map((s) => s.textContent)`)).sort(), ['IMG_0001.jpg', 'IMG_0002.jpg']);
      await pick(app, dst);
      await clickText(app, 'import.chooseDestination');
      // The dialog remembers the last import's options: no sub-folders, original names.
      await setField(app, 'import.subfolders', '');
      await setField(app, 'import.rename', '');
      await setCheck(app, 'import.deleteAfter', false);
      await primary(app);
      await menuDone(app);
      const imported = fs.readdirSync(dst).filter((n) => n.endsWith('.jpg')).sort();
      assert.deepEqual(imported, ['IMG_0001.jpg', 'IMG_0002.jpg']);
      assert.ok(fs.readFileSync(path.join(dst, 'IMG_0001.jpg')).equals(fs.readFileSync(path.join(fixtures, 'beach.jpg'))), 'same bytes');
      assert.ok(fs.existsSync(path.join(phone, 'DCIM', 'Camera', 'IMG_0001.jpg')), 'the phone keeps its photos');
      // A second time: nothing new to copy.
      await menu(app, 'file', 'import.title');
      await app.main.waitFor(`Boolean(${P}.dq('#import-dialog [data-mtp-device]'))`, { timeout: 20000 });
      await app.main.eval(`${P}.dq('#import-dialog [data-mtp-device]').click(); 1`);
      await waitToast(app, 'import.deviceCopied');
      await app.main.waitFor(`${P}.dqa('#import-dialog .import-cell').length === 2 && ${TOP}?.id === 'import-dialog'`, { message: 'staged photos listed again' });
      assert.match(await app.main.eval(`[...document.querySelectorAll('.toast')].map((e) => e.textContent).join(' ')`), /0.*2|새 파일 0개, 이미 복사됨 2개|0 new, 2 already/);
      await app.main.eval(`${TOP}.querySelector('.dialog-buttons .btn:not(.primary)').click(); 1`);
      await app.main.waitFor(`!${TOP}`);
    },
  },
  {
    ids: ['FILE-SCAN'],
    group: '가져오기', name: '스캐너에서 가져오기: 스캔한 그림이 현재 폴더에 저장되고 선택된다 (가짜 스캐너)',
    run: async (app) => {
      await open(app, dir(app, 'scan'), 0);
      await menu(app, 'file', 'scan.title');
      await menuDone(app);
      const files = fs.readdirSync(dir(app, 'scan'));
      assert.equal(files.length, 1);
      assert.match(files[0], /^scan-\d{14}\.jpg$/);
      assert.ok(fs.readFileSync(path.join(dir(app, 'scan'), files[0])).equals(fs.readFileSync(path.join(fixtures, 'forest.jpg'))));
      await app.main.waitFor(`${P}.app.state.list.some((i) => i.name === ${js(files[0])} && ${P}.app.state.selection.has(i.path))`, { message: 'listed and selected' });
    },
  },
  {
    ids: ['FILE-SYNC'],
    group: '파일', name: '폴더 동기화(미러): 새 파일 복사, 바뀐 파일 갱신, 원본에 없는 파일 삭제',
    run: async (app) => {
      const src = dir(app, 'sync-src');
      const dst = dir(app, 'sync-dst');
      await open(app, src, 3);
      await menu(app, 'file', 'sync.title');
      await dialog(app, 'sync.mirror');
      await pick(app, dst);
      await app.main.eval(`(() => { const buttons = [...${TOP}.querySelectorAll('button')].filter((b) => b.textContent.includes(${P}.t('batch.chooseFolder'))); buttons[1].click(); return 1; })()`);
      await app.main.waitFor(`[...${TOP}.querySelectorAll('.folder-label')].some((e) => e.textContent.includes('sync-dst'))`);
      await setCheck(app, 'sync.mirror', true);
      await primary(app);
      await app.main.waitFor(`${TOP}?.textContent.includes('sync-dst')`, { message: 'mirror confirmation' });
      await primary(app);
      await menuDone(app);
      assert.deepEqual(fs.readdirSync(dst).sort(), ['beach.jpg', 'city.jpg', 'sunset.png']);
      for (const name of fs.readdirSync(dst)) assert.ok(fs.readFileSync(path.join(dst, name)).equals(fs.readFileSync(path.join(src, name))), name);
    },
  },
  {
    ids: ['FILE-EXTEDITOR'],
    group: '파일', name: '외부 편집기: 프로그램 등록(이름은 파일 이름에서), 편집 메뉴로 선택한 사진들을 그 프로그램에 넘기기, Ctrl+Shift+E',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      const pair = await select(app, 'beach.jpg', 'city.jpg');
      const program = 'C:\\Tools\\FakeEditor.exe';
      await pick(app, [program]);
      await app.main.eval(`${P}.menu('edit', 'external.editIn', 'external.configure'); 1`);
      await app.main.waitFor(`${TOP}?.id === 'external-editors-dialog'`);
      await app.main.eval(`${TOP}.querySelector('#add-external-editor').click(); 1`);
      await app.main.waitFor(`${TOP}.querySelector('[data-editor="0"]')?.value === 'FakeEditor'`, { message: 'name from the program' });
      await primary(app);
      await app.main.waitFor(`${P}.app.settings.externalEditors.length === 1`);
      const before = shellLog(app).length;
      await app.main.eval(`${P}.menu('edit', 'external.editIn', 'FakeEditor'); 1`);
      for (let i = 0; i < 50 && shellLog(app).length === before; i++) await sleep(100);
      const [line] = shellLog(app).slice(before);
      assert.deepEqual(line, ['editor', program, ...pair], 'both photos handed to the program');
      // Ctrl+Shift+E = first editor.
      await select(app, 'forest.jpg');
      await app.main.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'E', code: 'KeyE', ctrlKey: true, shiftKey: true, bubbles: true })); 1`);
      for (let i = 0; i < 50 && shellLog(app).length === before + 1; i++) await sleep(100);
      assert.equal(shellLog(app).at(-1)[0], 'editor');
      assert.match(shellLog(app).at(-1)[2], /forest\.jpg$/);
    },
  },
  {
    ids: ['FILE-OPENWITH', 'FILE-SHARE', 'FILE-WALLPAPER'],
    group: '파일', name: '연결 프로그램·기본 프로그램·탐색기·바탕 화면·공유(메일)·이미지 복사 — 시스템 호출 확인',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      const [beach] = await select(app, 'beach.jpg');
      const before = shellLog(app).length;
      for (const key of ['file.openWith', 'file.openExternal', 'file.reveal', 'file.wallpaper']) {
        await menu(app, 'file', key);
        await menuDone(app);
      }
      // Share: no share sheet here (as on desktops without one) → mail with the file shown.
      await app.main.eval(`navigator.canShare = () => false; 1`);
      await menu(app, 'file', 'share.share');
      await menuDone(app);
      const log = shellLog(app).slice(before);
      const actions = log.map(([action, target]) => `${action}:${target.startsWith('mailto:') ? 'mailto' : path.basename(target)}`);
      assert.deepEqual(actions, ['openWith:beach.jpg', 'open:beach.jpg', 'reveal:beach.jpg', 'wallpaper:beach.jpg', 'reveal:beach.jpg', 'url:mailto']);
      assert.match(decodeURIComponent(log.at(-1)[1]), /beach\.jpg/);
      // Copy image: the clipboard gets a PNG of the whole picture.
      await app.main.eval(`(() => { window.__clip = null; navigator.clipboard.write = async (items) => { window.__clip = await items[0].getType('image/png'); }; return 1; })()`);
      await menu(app, 'file', 'share.copyImage');
      await menuDone(app);
      const size = await app.main.eval(`(async () => { const b = await createImageBitmap(window.__clip); return [window.__clip.type, b.width, b.height]; })()`);
      assert.deepEqual(size, ['image/png', 1600, 1067]);
      assert.ok(beach);
    },
  },

  // ───────── viewer
  {
    ids: ['VIEW-NAVIGATOR', 'VIEW-LOUPE', 'VIEW-ZOOMLOCK', 'VIEW-PIXEL', 'VIEW-FULLSCREEN'],
    group: '보기', name: '확대하면 내비게이터, 돋보기(L), 확대 고정(Z)으로 다음 사진도 같은 배율, 픽셀 정보, 전체 화면(F)',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      const beach = await pathOf(app, 'beach.jpg');
      await app.main.eval(`${P}.app.settings.viewer.navigator = true; ${P}.app.settings.viewer.zoomLock = false; ${P}.actions.viewItem(${js(beach)}); 1`);
      await app.main.waitFor(`${P}.viewer.currentPath === ${js(beach)} && ${P}.viewer.debug().kind !== 'placeholder' && ${P}.viewer.debug().width > 0`);
      await app.main.eval(`${P}.viewer.testing.setZoom(2); 1`);
      await app.main.waitFor(`${P}.viewer.debug().navigator`, { message: 'navigator shown when zoomed in' });
      await app.main.key('z');
      await app.main.waitFor(`${P}.app.settings.viewer.zoomLock === true`);
      const zoom = await app.main.eval(`${P}.viewer.debug().zoom`);
      await app.main.key('ArrowRight');
      await app.main.waitFor(`${P}.viewer.currentPath !== ${js(beach)} && ${P}.viewer.debug().kind !== 'placeholder' && ${P}.viewer.debug().width > 0`);
      await settle(app);
      const next = await app.main.eval(`${P}.viewer.debug()`);
      assert.ok(!next.fit && Math.abs(next.zoom - zoom) < 1e-6, `zoom kept: ${next.zoom} vs ${zoom}`);
      await app.main.key('z');
      await app.main.key('l');
      await app.main.waitFor(`${P}.viewer.debug().loupeOn`);
      const stage = await app.main.center('.viewer-stage, .viewer .stage, .viewer');
      await app.main.mouse('mouseMoved', stage.x, stage.y, { button: 'none' });
      await app.main.mouse('mouseMoved', stage.x + 5, stage.y + 3, { button: 'none' });
      await app.main.waitFor(`!${P}.dq('canvas.loupe').hidden`, { message: 'loupe follows the pointer' });
      await app.main.waitFor(`/RGB\\(\\d+, \\d+, \\d+\\)/.test(${P}.dq('.pixel-info')?.textContent ?? '')`, { message: 'pixel info' });
      await app.main.key('l');
      await app.main.key('f');
      await app.main.waitFor(`document.body.classList.contains('immersive')`, { message: 'fullscreen' });
      await app.main.key('Escape');
      await app.main.waitFor(`!document.body.classList.contains('immersive')`);
      await app.main.eval(`${P}.app.settings.viewer.zoomLock = false; ${P}.actions.setMode('manage'); 1`);
    },
  },

  // ───────── editor
  {
    ids: ['EDIT-LIGHT', 'EDIT-COLOR', 'EDIT-LEVELS', 'EDIT-COLOREQ', 'EDIT-LIGHTEQ', 'EDIT-SPLIT', 'EDIT-DEHAZE', 'EDIT-DETAIL', 'EDIT-LENS', 'EDIT-PERSPECTIVE', 'EDIT-TILTSHIFT', 'EDIT-SKIN'],
    group: '편집', name: '조정 패널: 노출·색·레벨·곡선·Color EQ·Light EQ·스플릿 토닝·안개·디테일·렌즈·원근·틸트시프트·피부 — 각각 미리 보기가 바뀐다',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      await openEditor(app, await pathOf(app, 'portrait.jpg'));
      const viaSlider = (sectionId, key, value) => async () => { await section(app, sectionId); await slider(app, key, value); };
      const viaChange = (body) => async () => { await app.main.eval(`${P}.editor.testing.change((e) => { ${body} }); 1`); };
      const checks = [
        ['exposure', viaSlider('light', 'adjust.exposure', 1)],
        ['contrast', viaSlider('light', 'adjust.contrast', 60)],
        ['shadows', viaSlider('light', 'adjust.shadows', 80)],
        ['dehaze', viaSlider('light', 'tone.dehaze', 70)],
        ['saturation', viaSlider('color', 'adjust.saturation', 80)],
        ['temperature', viaSlider('color', 'adjust.temperature', 70)],
        ['levels', viaSlider('levels', 'levels.black', 60)],
        ['curves', viaChange(`e.adjust.curves = { rgb: [[0, 0], [100, 170], [255, 255]] };`)],
        ['colorEq', async () => { await section(app, 'colorEq'); await app.main.eval(`${P}.dq('.editor-panel [data-band=orange]').click(); 1`); await slider(app, 'colorEq.hue', 120); await slider(app, 'colorEq.saturation', 100); }],
        ['lightEq', viaChange(`e.tone.lightEq = [80, 80, 60, 30, 0, 0, 0, 0, 0];`)],
        ['splitTone', async () => { await section(app, 'splitTone'); await slider(app, 'splitTone.highlightSat', 80); await slider(app, 'splitTone.shadowSat', 80); }],
        ['clarity', viaSlider('detail', 'detail.clarity', 100)],
        ['denoise', viaSlider('detail', 'detail.denoise', 100)],
        ['distortion', viaSlider('lens', 'lens.distortion', 80)],
        ['chromatic', viaSlider('lens', 'lens.chromatic', 100)],
        ['lens vignette', viaSlider('lens', 'lens.vignette', -100)],
        ['perspective vertical', viaSlider('lens', 'lens.vertical', 60)],
        ['perspective rotate', viaSlider('lens', 'lens.rotate', 10)],
        ['tilt-shift', viaChange(`e.tilt = { position: 0.5, width: 0.15, blur: 80, angle: 0, feather: 0.2 };`)],
        ['skin', viaSlider('repair', 'tone.skin', 100)],
      ];
      const results = {};
      for (const [label, act] of checks) results[label] = Number((await moves(app, label, act, label === 'skin' || label === 'chromatic' || label === 'denoise' ? 0.05 : 0.5)).toFixed(2));
      const state = await editState(app);
      assert.ok(state.history.length >= 1);
      await leaveEditor(app);
      assert.ok(Object.values(results).every((v) => v > 0), JSON.stringify(results));
    },
  },
  {
    ids: ['EDIT-WBPICK', 'EDIT-LINE', 'EDIT-HEAL', 'EDIT-CLONE', 'EDIT-LOCAL', 'EDIT-DRAW'],
    group: '편집', name: '포인터 도구: 화이트 밸런스 스포이트, 선 그어 수평, 잡티, 복제 도장(Alt+클릭), 그러데이션·방사형·브러시, 그리기',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      await openEditor(app, await pathOf(app, 'beach.jpg'));
      const use = async (sectionId, toolId) => { await section(app, sectionId); await app.main.eval(`${P}.dq('#tool-${toolId}').click(); 1`); await settle(app); };

      await moves(app, 'white balance picker', async () => {
        await use('color', 'wbpick');
        const p = await at(app, 0.3, 0.2); // blue sky → warmer
        await app.main.realClick(p.x, p.y);
        await app.main.waitFor(`${P}.editor.debug().edit.adjust.temperature !== 0 || ${P}.editor.debug().edit.adjust.tint !== 0`);
      });
      assert.ok((await editState(app)).edit.adjust.temperature > 0, 'blue picked → warmer');

      await resetEdit(app);
      await use('geometry', 'line');
      await app.main.drag(await at(app, 0.1, 0.5), await at(app, 0.9, 0.56));
      await app.main.waitFor(`${P}.editor.debug().edit.geometry.straighten !== 0`, { message: 'straightened' });
      const straighten = (await editState(app)).edit.geometry.straighten;
      assert.ok(straighten < -2 && straighten > -8, `straighten ${straighten}`);

      await moves(app, 'heal', async () => {
        await use('repair', 'heal');
        const p = await at(app, 0.78, 0.18); // the sun
        await app.main.realClick(p.x, p.y);
        await app.main.waitFor(`${P}.editor.debug().edit.spots.some((s) => s.type === 'heal')`);
      }, 0.01);

      await resetEdit(app);
      await use('repair', 'clone');
      const source = await at(app, 0.2, 0.9);
      await app.main.realClick(source.x, source.y, { modifiers: 1 });
      const target = await at(app, 0.78, 0.18);
      await app.main.realClick(target.x, target.y);
      await app.main.waitFor(`${P}.editor.debug().edit.spots.some((s) => s.type === 'clone')`, { message: 'clone spot' });
      const spot = (await editState(app)).edit.spots.find((s) => s.type === 'clone');
      assert.ok(spot.sy > spot.y, 'source below the target');
      await app.main.eval(`${P}.editor.testing.setTool(null); 1`);

      for (const [toolId, kind, from, to] of [['gradient', 'gradient', [0.5, 0.0], [0.5, 0.5]], ['radial', 'radial', [0.5, 0.5], [0.8, 0.8]], ['brush', 'brush', [0.2, 0.7], [0.8, 0.75]]]) {
        await moves(app, kind, async () => {
          await use('local', toolId);
          await app.main.drag(await at(app, ...from), await at(app, ...to));
          await app.main.waitFor(`${P}.editor.debug().edit.local.some((l) => l.kind === ${js(kind)})`, { message: `${kind} mask` });
        }, 0.2);
      }

      await moves(app, 'draw', async () => {
        await use('draw', 'draw');
        await app.main.eval(`${P}.dq('.editor-panel [data-shape=rect]').click(); 1`);
        await app.main.eval(`(() => { const box = [...${P}.dqa('.editor-panel label.check input')].pop(); box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
        await app.main.drag(await at(app, 0.2, 0.2), await at(app, 0.6, 0.6));
        await app.main.waitFor(`${P}.editor.debug().edit.drawings.length === 1 && ${P}.editor.debug().edit.drawings[0].type === 'rect'`);
      }, 1);
      await leaveEditor(app);
    },
  },
  {
    ids: ['EDIT-RESET'],
    group: '편집', name: '섹션 제목의 ↺ 는 그 섹션을 원본 값으로, 효과 카드의 ↺ 는 효과 기본값으로 되돌린다',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      await openEditor(app, await pathOf(app, 'portrait.jpg'));
      await section(app, 'light');
      assert.ok(!(await app.main.eval(`Boolean(${P}.dq('.editor-panel [data-reset=light]'))`)), 'no ↺ while unchanged');
      await slider(app, 'adjust.exposure', 1);
      await slider(app, 'adjust.contrast', 40);
      await app.main.waitFor(`Boolean(${P}.dq('.editor-panel [data-reset=light]'))`, { message: '↺ appears after a change' });
      await section(app, 'color');
      await slider(app, 'adjust.saturation', 50);
      await app.main.eval(`${P}.dq('.editor-panel [data-reset=light]').click(); 1`);
      const after = await app.main.eval(`(() => { const e = ${P}.editor.debug().edit; return { exposure: e.adjust.exposure, contrast: e.adjust.contrast, saturation: e.adjust.saturation, mark: Boolean(${P}.dq('.editor-panel [data-reset=light]')), color: Boolean(${P}.dq('.editor-panel [data-reset=color]')) }; })()`);
      assert.deepEqual(after, { exposure: 0, contrast: 0, saturation: 50, mark: false, color: true }, 'only the light section went back to the original');
      await app.main.eval(`${P}.dq('.editor-panel [data-reset=color]').click(); 1`);
      await app.main.waitFor(`${P}.editor.debug().edit.adjust.saturation === 0`);
      // Effects: change a parameter, then the card's ↺ restores the effect's defaults.
      await section(app, 'effects');
      await app.main.eval(`(() => { const s = ${P}.dq('.editor-panel select[data-key="add-effect"]'); s.value = s.options[1].value; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await app.main.waitFor(`${P}.editor.debug().edit.effects.length === 1`);
      const defaults = await app.main.eval(`JSON.stringify(${P}.editor.debug().edit.effects[0].params)`);
      await app.main.eval(`${P}.editor.testing.change((e) => { for (const k of Object.keys(e.effects[0].params)) if (typeof e.effects[0].params[k] === 'number') e.effects[0].params[k] += 7; }); 1`);
      assert.notEqual(await app.main.eval(`JSON.stringify(${P}.editor.debug().edit.effects[0].params)`), defaults);
      await app.main.eval(`${P}.dq('.editor-panel [data-reset-effect="0"]').click(); 1`);
      await app.main.waitFor(`JSON.stringify(${P}.editor.debug().edit.effects[0].params) === ${js(defaults)}`, { message: 'effect defaults back' });
      await resetEdit(app);
      await leaveEditor(app);
    },
  },
  {
    ids: ['EDIT-ERASE'],
    group: '편집', name: '내용 인식 지우기: 해를 칠하면 하늘로 채워지고, 저장한 사진에도 그대로(나머지는 그대로)',
    run: async (app) => {
      const studio = dir(app, 'studio');
      fs.copyFileSync(path.join(fixtures, 'beach.jpg'), path.join(studio, 'erase-me.jpg'));
      await open(app, studio, 6);
      await reloadList(app);
      const file = await pathOf(app, 'erase-me.jpg');
      const sun = { x: 0.72, y: 0.1, w: 0.12, h: 0.16 };
      const sea = { x: 0.1, y: 0.6, w: 0.3, h: 0.2 };
      const before = await imageInfo(app, file, sun);
      const seaBefore = await imageInfo(app, file, sea);
      await openEditor(app, file);
      await section(app, 'repair');
      await app.main.eval(`${P}.dq('#tool-erase').click(); 1`);
      await settle(app);
      // Brush large enough to cover the sun; paint across it.
      await app.main.eval(`(() => { const r = [...${P}.dqa('.editor-panel input.slider')].find((i) => i.closest('.slider-row')?.textContent.includes(${P}.t('edit.brushSize'))); r.value = '90'; r.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await app.main.drag(await at(app, 0.74, 0.18), await at(app, 0.82, 0.18), 8);
      await app.main.waitFor(`${P}.editor.debug().edit.spots.some((s) => s.type === 'erase' && s.strokes[0].points.length > 2)`, { message: 'erase stroke' });
      await settle(app);
      await app.main.key('s', 2);
      await app.main.waitFor(`${P}.app.state.mode === 'manage'`, { timeout: 120000 });
      const after = await imageInfo(app, file, sun);
      const seaAfter = await imageInfo(app, file, sea);
      // The sun is the brightest, most yellow thing up there: red+green fall, blue (sky) rises.
      assert.ok(after.mean[0] + after.mean[1] < before.mean[0] + before.mean[1] - 20, `sun gone: ${before.mean.map(Math.round)} → ${after.mean.map(Math.round)}`);
      assert.ok(after.mean[2] >= before.mean[2] - 5, 'filled with sky (blue kept)');
      for (let c = 0; c < 3; c++) assert.ok(Math.abs(seaAfter.mean[c] - seaBefore.mean[c]) < 4, 'the rest unchanged');
    },
  },
  {
    ids: ['EDIT-SELECT', 'EDIT-PIXELTARGET'],
    group: '편집', name: '선택 영역과 픽셀 타기팅: 색상 범위(하늘만 어둡게), 요술봉·반전, 올가미 — 선택한 곳만 바뀐다',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      await openEditor(app, await pathOf(app, 'beach.jpg'));
      const use = async (toolId) => { await section(app, 'local'); await app.main.eval(`${P}.dq('#tool-${toolId}').click(); 1`); await settle(app); };
      // Mean of a region of the preview canvas.
      const region = (x, y, w, hgt) => app.main.eval(`(() => { const c = ${P}.dq('.editor-preview'); const g = c.getContext('2d'); const d = g.getImageData(Math.floor(${x} * c.width), Math.floor(${y} * c.height), Math.max(1, Math.floor(${w} * c.width)), Math.max(1, Math.floor(${hgt} * c.height))).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; })()`);
      const sky = [0.1, 0.05, 0.4, 0.15];
      const sand = [0.1, 0.85, 0.5, 0.1];
      const localExposure = async (value) => { await slider(app, 'local.exposure', value); await settle(app); };

      // Colour range: click the sky → only blue pixels get darker.
      const skyBefore = await region(...sky);
      const sandBefore = await region(...sand);
      await use('color');
      const p = await at(app, 0.3, 0.12);
      await app.main.realClick(p.x, p.y);
      await app.main.waitFor(`${P}.editor.debug().edit.local.some((l) => l.kind === 'color')`, { message: 'colour range' });
      const hue = (await editState(app)).edit.local.find((l) => l.kind === 'color').shape.hue;
      assert.ok(hue > 170 && hue < 250, `sky hue ${hue}`);
      await localExposure(-2);
      const skyAfter = await region(...sky);
      const sandAfter = await region(...sand);
      assert.ok(skyAfter < skyBefore - 25, `sky darker: ${skyBefore.toFixed(0)} → ${skyAfter.toFixed(0)}`);
      assert.ok(Math.abs(sandAfter - sandBefore) < 6, `sand unchanged: ${sandBefore.toFixed(0)} → ${sandAfter.toFixed(0)}`);
      // Invert: now everything but the sky.
      await app.main.eval(`(() => { const c = ${P}.dq('[data-key=local-invert]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await settle(app);
      assert.ok(Math.abs((await region(...sky)) - skyBefore) < 8, 'inverted: sky back');
      assert.ok((await region(...sand)) < sandBefore - 25, 'inverted: sand darker');
      await resetEdit(app);

      // Magic wand on the sky.
      await use('wand');
      const w = await at(app, 0.2, 0.1);
      await app.main.realClick(w.x, w.y);
      await app.main.waitFor(`${P}.editor.debug().edit.local.some((l) => l.kind === 'wand')`, { message: 'wand' });
      await localExposure(-2);
      assert.ok((await region(...sky)) < skyBefore - 25, 'wand: sky darker');
      assert.ok(Math.abs((await region(...sand)) - sandBefore) < 6, 'wand: sand unchanged');
      await resetEdit(app);

      // Lasso around the bottom-left: only there.
      await use('lasso');
      const pts = [[0.05, 0.7], [0.6, 0.7], [0.6, 0.98], [0.05, 0.98]];
      const first = await at(app, ...pts[0]);
      await app.main.mouse('mouseMoved', first.x, first.y, { button: 'none' });
      await app.main.mouse('mousePressed', first.x, first.y);
      for (const q of [...pts.slice(1), pts[0]]) {
        const target = await at(app, ...q);
        await app.main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target.x, y: target.y, button: 'left', buttons: 1, pointerType: 'mouse' });
        await sleep(30);
      }
      await app.main.mouse('mouseReleased', first.x, first.y);
      await app.main.waitFor(`${P}.editor.debug().edit.local.some((l) => l.kind === 'lasso' && l.shape.points.length >= 4)`, { message: 'lasso' });
      await localExposure(-2);
      assert.ok((await region(...sand)) < sandBefore - 25, 'lasso: inside darker');
      assert.ok(Math.abs((await region(...sky)) - skyBefore) < 6, 'lasso: outside unchanged');
      await leaveEditor(app);
    },
  },
  {
    ids: ['EDIT-ADJLAYER', 'EDIT-LAYERMASK'],
    group: '편집', name: '조정 레이어와 레이어 마스크: 위쪽 그러데이션 마스크로 하늘만 어둡게, 반전, 브러시로 칠한 곳만',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      await openEditor(app, await pathOf(app, 'beach.jpg'));
      await section(app, 'layers');
      const region = (x, y, w, hgt) => app.main.eval(`(() => { const c = ${P}.dq('.editor-preview'); const d = c.getContext('2d').getImageData(Math.floor(${x} * c.width), Math.floor(${y} * c.height), Math.max(1, Math.floor(${w} * c.width)), Math.max(1, Math.floor(${hgt} * c.height))).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; })()`);
      const topBox = [0.1, 0, 0.8, 0.05]; // above where the top gradient starts to fade
      const bottomBox = [0.1, 0.86, 0.8, 0.12];
      const top0 = await region(...topBox);
      const bottom0 = await region(...bottomBox);
      // An adjustment layer: darker everywhere.
      await app.main.eval(`${P}.dq('#add-adjust-layer').click(); 1`);
      await app.main.waitFor(`${P}.editor.debug().edit.layers.some((l) => l.type === 'adjust')`);
      await slider(app, 'layer.exposure', -2);
      await settle(app);
      assert.ok((await region(...topBox)) < top0 - 25 && (await region(...bottomBox)) < bottom0 - 25, 'whole picture darker');
      // Mask: only the top (fading down).
      const setMask = async (v) => { await app.main.eval(`(() => { const s = ${P}.dq('[data-key=layer-mask]'); s.value = ${js(v)}; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`); await settle(app); };
      await setMask('top');
      assert.ok((await region(...topBox)) < top0 - 25, 'top darker');
      assert.ok(Math.abs((await region(...bottomBox)) - bottom0) < 5, 'bottom untouched');
      // Invert the mask.
      await app.main.eval(`(() => { const c = ${P}.dq('[data-key=layer-mask-invert]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await settle(app);
      assert.ok(Math.abs((await region(...topBox)) - top0) < 5, 'inverted: top untouched');
      assert.ok((await region(...bottomBox)) < bottom0 - 25, 'inverted: bottom darker');
      // A painted mask: choosing it picks the mask brush; only the band painted across the middle.
      await setMask('brush');
      await app.main.eval(`(() => { const c = ${P}.dq('[data-key=layer-mask-invert]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await settle(app);
      const midBox = [0.3, 0.45, 0.4, 0.06];
      const mid0 = await region(...midBox);
      await app.main.drag(await at(app, 0.2, 0.48), await at(app, 0.8, 0.48), 16);
      await settle(app);
      assert.ok((await region(...midBox)) < mid0 - 20, 'painted band darker');
      assert.ok(Math.abs((await region(...topBox)) - top0) < 5 && Math.abs((await region(...bottomBox)) - bottom0) < 5, 'unpainted untouched');
      const layer = (await editState(app)).edit.layers.find((l) => l.type === 'adjust');
      assert.equal(layer.mask.kind, 'brush');
      assert.ok(layer.mask.strokes.length === 1 && layer.mask.strokes[0].points.length > 4, 'one stroke recorded');
      await leaveEditor(app);
    },
  },
  {
    ids: ['EDIT-WHEELS'],
    group: '편집', name: '히스토그램 아래 색상 휠 3개(어두운·중간·밝은 영역): 끌면 그 영역이 그 색으로, 두 번 눌러 원래대로, 색 섹션 ↺',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      await openEditor(app, await pathOf(app, 'beach.jpg'));
      const layout = await app.main.eval(`(() => { const h = ${P}.dq('.editor-histogram').getBoundingClientRect(); const w = ${P}.dq('.color-wheels').getBoundingClientRect(); return { below: w.top >= h.bottom - 1, wheels: ${P}.dqa('.color-wheel').length }; })()`);
      assert.deepEqual(layout, { below: true, wheels: 3 }, 'three wheels right under the histogram');
      const region = (y) => app.main.eval(`(() => { const c = ${P}.dq('.editor-preview'); const d = c.getContext('2d').getImageData(0, Math.floor(${y} * c.height), c.width, Math.max(1, Math.floor(0.1 * c.height))).data; const s = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; } return s.map((v) => v / (d.length / 4)); })()`);
      const sand0 = await region(0.85);
      // Drag the highlights wheel's dot up-left (240° = blue) to near the rim.
      const wheel = await app.main.eval(`(() => { const r = ${P}.dq('.color-wheel[data-wheel=highlights]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; })()`);
      const target = { x: wheel.x + Math.cos((240 * Math.PI) / 180) * wheel.r * 0.85, y: wheel.y + Math.sin((240 * Math.PI) / 180) * wheel.r * 0.85 };
      await app.main.drag({ x: wheel.x, y: wheel.y }, target, 8);
      await settle(app);
      const hl = (await editState(app)).edit.tone.colorBalance.highlights;
      assert.ok(Math.abs(hl.hue - 240) <= 4 && hl.amount > 70 && hl.amount < 95, `highlights wheel ${JSON.stringify(hl)}`);
      const sand1 = await region(0.85);
      assert.ok(sand1[2] - sand1[0] > sand0[2] - sand0[0] + 15, `bright sand bluer ${sand0.map(Math.round)} → ${sand1.map(Math.round)}`);
      assert.ok(Boolean(await app.main.eval(`${P}.dq('.editor-panel [data-reset=color]')`)), 'colour section shows ↺');
      assert.ok((await editState(app)).history.length >= 1, 'in the history');
      // Double-click: back to neutral.
      await app.main.eval(`${P}.dq('.color-wheel[data-wheel=highlights]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); 1`);
      assert.equal((await editState(app)).edit.tone.colorBalance.highlights.amount, 0);
      // The colour section's ↺ clears every wheel.
      await app.main.eval(`${P}.editor.testing.change((e) => { e.tone.colorBalance = { shadows: { hue: 30, amount: 60 } }; }); ${P}.editor.testing.setSection('color'); 1`);
      await app.main.waitFor(`Boolean(${P}.dq('.editor-panel [data-reset=color]'))`);
      await app.main.eval(`${P}.dq('.editor-panel [data-reset=color]').click(); 1`);
      await app.main.waitFor(`!${P}.editor.debug().edit.tone.colorBalance`, { message: 'reset clears the wheels' });
      await leaveEditor(app);
    },
  },
  {
    ids: ['EDIT-EFFECTS'],
    group: '편집', name: '특수 효과 묶음: 모든 효과가 하나씩 미리 보기를 바꾼다',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      await openEditor(app, await pathOf(app, 'forest.jpg'));
      await section(app, 'effects');
      const ids = await app.main.eval(`[...${P}.dq('.editor-panel select[data-key="add-effect"]').options].map((o) => o.value).filter(Boolean)`);
      assert.ok(ids.length >= 20, `${ids.length} effects`);
      const weak = [];
      for (const id of ids) {
        const d = await moves(app, id, async () => {
          await section(app, 'effects');
          await app.main.eval(`(() => { const s = ${P}.dq('.editor-panel select[data-key="add-effect"]'); s.value = ${js(id)}; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
          await app.main.waitFor(`${P}.editor.debug().edit.effects.some((e) => e.id === ${js(id)})`, { timeout: 30000 });
        }, 0);
        if (d < 0.2) weak.push(`${id}: ${d.toFixed(2)}`);
      }
      assert.deepEqual(weak, [], 'effects that barely changed the picture');
      await resetEdit(app);
      await section(app, 'effects');
      await app.main.eval(`(() => { const s = ${P}.dq('.editor-panel select:not([data-key])'); s.value = 'sepia'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await app.main.waitFor(`${P}.editor.debug().edit.adjust.effect === 'sepia'`);
      await leaveEditor(app);
    },
  },
  {
    ids: ['EDIT-CANVAS', 'EDIT-RESIZE', 'EDIT-TEXT', 'EDIT-LAYERS'],
    group: '편집', name: '캔버스 크기·크기 조절·텍스트·이미지 레이어(곱하기 혼합) → 저장한 파일의 크기와 픽셀',
    run: async (app) => {
      const studio = dir(app, 'studio');
      fs.copyFileSync(path.join(fixtures, 'forest.jpg'), path.join(studio, 'layered.jpg'));
      await open(app, studio, 6);
      await reloadList(app);
      const file = await pathOf(app, 'layered.jpg');
      await openEditor(app, file);
      await section(app, 'geometry');
      await app.main.eval(`(() => { const set = (k, v) => { const i = ${P}.dq('.editor-panel [data-key="' + k + '"]'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }; set('resize.width', 800); return 1; })()`);
      await app.main.eval(`${P}.dq('#resize-apply').click(); 1`);
      await app.main.waitFor(`${P}.editor.debug().edit.geometry.resize?.width === 800`);
      await section(app, 'geometry');
      await app.main.eval(`(() => { const set = (k, v) => { const i = ${P}.dq('.editor-panel [data-key="' + k + '"]'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }; set('canvas.width', 1000); set('canvas.height', 700); return 1; })()`);
      await app.main.eval(`${P}.dq('#canvas-apply').click(); 1`);
      await app.main.waitFor(`${P}.editor.debug().edit.canvas.width === 1000`);
      await section(app, 'add');
      await app.main.eval(`${P}.dq('#add-text').click(); 1`);
      await app.main.waitFor(`${P}.editor.debug().edit.overlay.texts.length === 1`);
      await section(app, 'layers');
      await pick(app, [path.join(studio, 'sunset.png')]);
      await app.main.eval(`${P}.dq('#add-layer').click(); 1`);
      await app.main.waitFor(`${P}.editor.debug().edit.layers.length === 1`, { timeout: 20000, message: 'layer added' });
      const normal = await signature(app);
      await app.main.eval(`${P}.editor.testing.change((e) => { e.layers[0].mode = 'multiply'; e.layers[0].opacity = 80; }); 1`);
      const multiplied = await signature(app);
      assert.ok(difference(normal, multiplied) > 0.5, 'blend mode changes the result');
      await app.main.key('s', 2);
      await app.main.waitFor(`${P}.app.state.mode === 'manage'`, { timeout: 60000, message: 'saved' });
      const info = await imageInfo(app, path.join(studio, 'layered.jpg'));
      assert.deepEqual([info.width, info.height], [1000, 700], 'canvas size');
      const border = await imageInfo(app, path.join(studio, 'layered.jpg'), { x: 0, y: 0, w: 0.08, h: 1 });
      assert.ok(border.mean.every((v) => v > 240), `white canvas margin ${border.mean.map((v) => v.toFixed(0))}`);
    },
  },
  {
    ids: ['EDIT-HISTORY', 'EDIT-PRESETS', 'EDIT-COPYPASTE', 'BATCH-PRESET'],
    group: '편집', name: '기록 창으로 되돌아가기, 프리셋 저장·적용, 설정 복사(Ctrl+Shift+C)·붙여넣기, 여러 장에 프리셋 일괄 적용',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      await openEditor(app, await pathOf(app, 'beach.jpg'));
      await section(app, 'light');
      await slider(app, 'adjust.exposure', 0.8);
      await section(app, 'color');
      await slider(app, 'adjust.saturation', -40);
      await section(app, 'history');
      await app.main.waitFor(`${P}.dqa('.editor-panel [data-history]').length === 3`, { message: 'history rows' });
      await app.main.eval(`${P}.dq('.editor-panel [data-history="1"]').click(); 1`);
      await app.main.waitFor(`${P}.editor.debug().history.length === 1 && ${P}.editor.debug().edit.adjust.saturation === 0 && ${P}.editor.debug().edit.adjust.exposure === 0.8`, { message: 'back to step 1' });
      await section(app, 'presets');
      await app.main.eval(`${P}.dq('#preset-save').click(); 1`);
      await dialog(app, 'edit.presetName');
      await setField(app, 'edit.presetName', 'Bright test');
      await primary(app);
      await app.main.waitFor(`${P}.app.catalog.presets.some((p) => p.name === 'Bright test')`);
      await app.main.key('c', 10);
      await leaveEditor(app);
      await openEditor(app, await pathOf(app, 'city.jpg'));
      await section(app, 'presets');
      await app.main.waitFor(`Boolean(${P}.dq('.editor-panel [data-preset="Bright test"]'))`);
      await app.main.eval(`${P}.dq('.editor-panel [data-preset="Bright test"]').click(); 1`);
      await app.main.waitFor(`${P}.editor.debug().edit.adjust.exposure === 0.8`, { message: 'preset applied' });
      await resetEdit(app);
      await app.main.key('v', 10);
      await app.main.waitFor(`${P}.editor.debug().edit.adjust.exposure === 0.8`, { message: 'settings pasted' });
      await leaveEditor(app);
      // Batch: the preset on two photos → new *_edited files, brighter than the originals.
      const studio = dir(app, 'studio');
      const before = fs.readdirSync(studio);
      await select(app, 'forest.jpg', 'flower.webp');
      await menu(app, 'tools', 'tools.applyPreset');
      await dialog(app, 'batch.preset');
      await setField(app, 'batch.preset', 'preset:Bright test');
      await primary(app);
      await menuDone(app, 120000);
      const added = newFiles(studio, before).sort();
      assert.deepEqual(added, ['flower_edited.webp', 'forest_edited.jpg']);
      const a = await imageInfo(app, path.join(studio, 'forest.jpg'));
      const b = await imageInfo(app, path.join(studio, 'forest_edited.jpg'));
      assert.ok(b.mean[1] > a.mean[1] + 10, `brighter: ${a.mean[1].toFixed(0)} → ${b.mean[1].toFixed(0)}`);
      // Edit › Paste settings uses the copied settings.
      await select(app, 'sunset.png');
      await menu(app, 'edit', 'edit.pasteSettings');
      await menuDone(app, 60000);
      assert.ok(fs.existsSync(path.join(studio, 'sunset_edited.png')), 'pasted onto a file');
    },
  },
  {
    ids: ['EDIT-LOOKS'],
    group: '편집', name: '효과 프리셋(룩): 도구 모음 "프리셋" 버튼으로 열고 닫기, 분류·검색·미리 보기, 적용 후 강도·세밀 조정, 해제, 기존 패널·노출은 그대로, 저장',
    run: async (app) => {
      const studio = dir(app, 'studio');
      fs.copyFileSync(path.join(fixtures, 'forest.jpg'), path.join(studio, 'looks.jpg'));
      await open(app, studio, 6);
      await reloadList(app);
      const file = await pathOf(app, 'looks.jpg');
      await openEditor(app, file);
      const ed = () => app.main.eval(`${P}.editor.debug().edit`);
      // The usual way still works: an exposure correction first.
      await section(app, 'light');
      await slider(app, 'adjust.exposure', 0.5);
      const plain = await signature(app);
      // The toolbar's Presets button opens the looks.
      await app.main.eval(`document.querySelector('#edit-looks').click(); 1`);
      await app.main.waitFor(`Boolean(${P}.dq('.editor-panel .edit-section-head.open[data-section=looks]')) && ${P}.dqa('.editor-panel .look-cat').length === 17 && document.querySelector('#edit-looks').classList.contains('on')`, { message: 'looks section with 17 categories' });
      await app.main.eval(`${P}.dq('.editor-panel [data-look-cat=catBW]').click(); 1`);
      await app.main.waitFor(`${P}.dqa('.editor-panel .look-grid [data-look]').length === 14`, { message: 'black & white looks' });
      await app.main.waitFor(`[...${P}.dqa('.editor-panel .look-thumb')].every((c) => c.width > 1)`, { timeout: 20000, message: 'every look has its preview' });
      // The previews differ from each other (the looks are drawn on this photo).
      const thumbs = await app.main.eval(`[...${P}.dqa('.editor-panel .look-thumb')].slice(0, 3).map((c) => c.toDataURL().length)`);
      assert.equal(new Set(thumbs).size, 3, `different previews ${thumbs}`);
      // Search across categories.
      await app.main.eval(`(() => { const s = ${P}.dq('[data-key=look-search]'); s.value = 'noir'; s.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await app.main.waitFor(`Boolean(${P}.dq('.editor-panel [data-look=noir]'))`, { message: 'search finds noir' });
      // Apply: black & white, dark corners — the exposure correction stays.
      await app.main.eval(`${P}.dq('.editor-panel [data-look=noir]').click(); 1`);
      await app.main.waitFor(`${P}.editor.debug().edit.adjust.saturation === -100 && Boolean(${P}.dq('.editor-panel .look-tune[data-look-active=noir]'))`, { message: 'noir applied' });
      let e = await ed();
      assert.ok(e.fx.vignette < 0, 'vignette');
      assert.equal(e.adjust.exposure, 0.5, 'the exposure correction is kept');
      assert.notDeepEqual((await signature(app)).px, plain.px, 'the preview changed');
      // Strength: half the look.
      await slider(app, 'look.amount', 50);
      e = await ed();
      assert.equal(e.adjust.saturation, -50, 'half strength');
      assert.ok(e.fx.vignette > -62 && e.fx.vignette < 0, `vignette at half ${e.fx.vignette}`);
      await slider(app, 'look.amount', 100);
      await app.main.waitFor(`${P}.editor.debug().edit.adjust.saturation === -100 && Boolean(${P}.dq('.editor-panel input.slider[data-key="adjust.contrast"]'))`, { message: 'full strength, fine-tuning sliders' });
      // Fine-tune one value of the look.
      await slider(app, 'adjust.contrast', 60);
      assert.equal((await ed()).adjust.contrast, 60, 'fine-tuned contrast');
      // Remove the look: only its values go back.
      await app.main.eval(`${P}.dq('#look-clear').click(); 1`);
      await app.main.waitFor(`${P}.editor.debug().edit.adjust.saturation === 0 && !${P}.dq('.editor-panel .look-tune')`, { message: 'look removed' });
      e = await ed();
      assert.equal(e.adjust.exposure, 0.5);
      assert.equal(e.fx.vignette, 0);
      // Apply again; the Presets button goes back to the section that was open.
      await app.main.eval(`${P}.dq('.editor-panel [data-look=noir]').click(); 1`);
      await app.main.waitFor(`${P}.editor.debug().edit.adjust.saturation === -100`);
      await app.main.eval(`document.querySelector('#edit-looks').click(); 1`);
      await app.main.waitFor(`Boolean(${P}.dq('.editor-panel .edit-section-head.open[data-section=light]')) && Boolean(${P}.dq('.editor-panel input.slider[data-key="adjust.exposure"]'))`, { message: 'back to the light section' });
      // The look's values are in the ordinary sections too.
      await section(app, 'color');
      assert.equal(await app.main.eval(`Number(${P}.dq('.editor-panel input.slider[data-key="adjust.saturation"]').value)`), -100);
      // Saved: a grey picture.
      await app.main.key('s', 2);
      await app.main.waitFor(`${P}.app.state.mode === 'manage'`, { timeout: 60000 });
      const saved = await imageInfo(app, file);
      assert.ok(Math.abs(saved.mean[0] - saved.mean[1]) < 3 && Math.abs(saved.mean[1] - saved.mean[2]) < 3, `grey: ${saved.mean.map((v) => v.toFixed(0))}`);
    },
  },
  {
    ids: ['EDIT-LUT', 'EDIT-SNAPSHOT'],
    group: '편집', name: 'LUT: 내장 룩과 .cube 가져오기(저장한 사진에 적용), 스냅숏: 이름 붙여 저장하고 눌러서 되돌리기',
    run: async (app) => {
      const studio = dir(app, 'studio');
      fs.copyFileSync(path.join(fixtures, 'forest.jpg'), path.join(studio, 'graded.jpg'));
      // A 2×2×2 .cube that inverts colours.
      const cube = path.join(app.work, 'invert.cube');
      const rows = [];
      for (let b = 0; b < 2; b++) for (let g = 0; g < 2; g++) for (let r = 0; r < 2; r++) rows.push(`${1 - r} ${1 - g} ${1 - b}`);
      fs.writeFileSync(cube, `TITLE "invert"\nLUT_3D_SIZE 2\n${rows.join('\n')}\n`);
      await open(app, studio, 6);
      await reloadList(app);
      const file = await pathOf(app, 'graded.jpg');
      const base = (await imageInfo(app, file)).mean;
      await openEditor(app, file);
      await section(app, 'lut');
      const choose = (id) => app.main.eval(`(() => { const s = ${P}.dq('.editor-panel select[data-key=lut]'); s.value = ${js(id)}; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      // Built-in look: changes the preview; the section gets its ↺.
      await moves(app, 'mono film', async () => { await section(app, 'lut'); await choose('mono-film'); await app.main.waitFor(`${P}.editor.debug().edit.lut?.id === 'mono-film'`); }, 0.5);
      await app.main.waitFor(`Boolean(${P}.dq('.editor-panel [data-reset=lut]'))`);
      // Snapshot of this state …
      await section(app, 'history');
      await app.main.eval(`${P}.dq('#take-snapshot').click(); 1`);
      await app.main.waitFor(`Boolean(${TOP}?.querySelector('input'))`);
      await app.main.eval(`(() => { const i = ${TOP}.querySelector('input'); i.value = 'mono'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await primary(app);
      await app.main.waitFor(`${P}.app.catalog.get(${js(file)})?.snapshots?.length === 1 && Boolean(${P}.dq('.editor-panel [data-snapshot="0"]'))`, { message: 'snapshot listed' });
      // … then something else, and back to the snapshot with one click.
      await section(app, 'lut');
      await choose('');
      await app.main.waitFor(`!${P}.editor.debug().edit.lut`);
      await section(app, 'history');
      await app.main.eval(`${P}.dq('.editor-panel [data-snapshot="0"]').click(); 1`);
      await app.main.waitFor(`${P}.editor.debug().edit.lut?.id === 'mono-film'`, { message: 'snapshot restored' });
      // Import a .cube: it is chosen at once, stays in the list, and the saved photo is graded with it.
      await section(app, 'lut');
      await pick(app, [cube]);
      await app.main.eval(`${P}.dq('#import-lut').click(); 1`);
      await app.main.waitFor(`${P}.editor.debug().edit.lut?.name === 'invert' && ${P}.app.settings.luts.some((x) => x.name === 'invert')`, { message: 'imported' });
      await app.main.waitFor(`[...${P}.dq('.editor-panel select[data-key=lut]').options].some((o) => o.textContent === 'invert')`);
      await app.main.key('s', 2);
      await app.main.waitFor(`${P}.app.state.mode === 'manage'`, { timeout: 60000 });
      const after = (await imageInfo(app, file)).mean;
      for (let c = 0; c < 3; c++) assert.ok(Math.abs(after[c] - (255 - base[c])) < 12, `channel ${c}: ${base[c].toFixed(0)} → ${after[c].toFixed(0)} (inverted)`);
      assert.equal(await app.main.eval(`${P}.app.catalog.get(${js(file)}).snapshots[0].name`), 'mono');
    },
  },
  {
    ids: ['EDIT-16BIT'],
    group: '편집', name: '16비트 사진: 편집기가 정밀 사본으로 보정(어두운 그러데이션을 크게 밝혀도 띠가 없음), 저장하면 16비트 PNG 그대로',
    run: async (app) => {
      const studio = dir(app, 'studio');
      // A dark 16-bit gradient: 0 … 16 of 255 across 512 pixels.
      const width = 512; const height = 64;
      const data = new Float32Array(width * height * 4);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const v = (16 * x) / (width - 1); data.set([v, v, v, 255], (y * width + x) * 4); }
      const target = path.join(studio, 'deep.png');
      fs.writeFileSync(target, encodePng16({ width, height, data }));
      await open(app, studio, 6);
      await reloadList(app);
      const file = await pathOf(app, 'deep.png');
      await openEditor(app, file);
      await app.main.waitFor(`${P}.editor.debug().highBit === true`, { message: 'precise copy kept' });
      assert.match(await app.main.eval(`document.querySelector('.editor-info').textContent`), new RegExp(await app.main.eval(`${P}.t('edit.highBit').replace(/[()]/g, '.')`)));
      await app.main.eval(`${P}.editor.testing.change((e) => { e.adjust.exposure = 3; }, 'push'); 1`);
      await settle(app);
      // The preview row: with 8 bits there would be ~17 steps; dithered precise values average out smoothly.
      const smooth = await app.main.eval(`(() => { const c = ${P}.dq('.editor-preview'); const d = c.getContext('2d').getImageData(0, 0, c.width, 4).data; const cols = []; for (let x = 0; x + 4 <= c.width; x += 4) { let s = 0; for (let y = 0; y < 4; y++) for (let k = 0; k < 4; k++) s += d[(y * c.width + x + k) * 4]; cols.push(s / 16); } let max = 0; for (let i = 1; i < cols.length; i++) max = Math.max(max, Math.abs(cols[i] - cols[i - 1])); return { max, levels: new Set(cols.map((v) => Math.round(v * 2))).size, n: cols.length }; })()`);
      assert.ok(smooth.max < 4, `no band steps in the preview ${JSON.stringify(smooth)}`);
      // Save in place: stays a 16-bit PNG with precise values.
      await app.main.key('s', 2);
      await app.main.waitFor(`${P}.app.state.mode === 'manage'`, { timeout: 60000 });
      const bytes = new Uint8Array(fs.readFileSync(target));
      assert.equal(bytes[24], 16, '16 bits per channel');
      const saved = decodePng16(bytes);
      const row = Array.from({ length: width }, (_, x) => saved.data[x * 4]);
      assert.ok(new Set(row.map((v) => v.toFixed(3))).size > 300, `precise values: ${new Set(row.map((v) => v.toFixed(3))).size}`);
      assert.ok(Math.abs(row[width - 1] - 128) < 2, `+3 EV: 16 → ${row[width - 1].toFixed(2)}`);
    },
  },
  {
    ids: ['EDIT-NONDESTRUCTIVE', 'EDIT-RESTORE'],
    group: '편집', name: '비파괴 재편집: 저장 후 다시 열면 원본+설정으로 열려 효과가 겹치지 않는다, 원본으로 복원',
    run: async (app) => {
      const studio = dir(app, 'studio');
      fs.copyFileSync(path.join(fixtures, 'forest.jpg'), path.join(studio, 'again.jpg'));
      await open(app, studio, 6);
      await reloadList(app);
      const file = await pathOf(app, 'again.jpg');
      const base = (await imageInfo(app, file)).mean[1];
      await openEditor(app, file);
      await section(app, 'light');
      await slider(app, 'adjust.exposure', 1);
      await app.main.key('s', 2);
      await app.main.waitFor(`${P}.app.state.mode === 'manage'`, { timeout: 60000 });
      const once = (await imageInfo(app, file)).mean[1];
      assert.ok(once > base + 15, `brighter after the first save ${base.toFixed(0)} → ${once.toFixed(0)}`);
      await app.main.eval(`${P}.actions.editPath(${js(file)}); 1`);
      await dialog(app, 'edit.reopenYes');
      await primary(app);
      await app.main.waitFor(`${P}.editor.path === ${js(file)} && ${P}.editor.debug().preview && ${P}.editor.debug().fromOriginal`, { timeout: 60000, message: 'opened from the original' });
      assert.equal((await editState(app)).edit.adjust.exposure, 1, 'settings restored');
      await section(app, 'light');
      await slider(app, 'adjust.exposure', 0.5);
      await app.main.key('s', 2);
      await app.main.waitFor(`${P}.app.state.mode === 'manage'`, { timeout: 60000 });
      const twice = (await imageInfo(app, file)).mean[1];
      assert.ok(twice > base + 5 && twice < once - 5, `re-edited from the original: ${base.toFixed(0)} < ${twice.toFixed(0)} < ${once.toFixed(0)}`);
      await select(app, 'again.jpg');
      await menu(app, 'edit', 'edit.restoreOriginal');
      await dialog(app, 'edit.restoreOriginal');
      await primary(app);
      await menuDone(app);
      assert.ok(fs.readFileSync(file).equals(fs.readFileSync(path.join(fixtures, 'forest.jpg'))), 'original bytes back');
    },
  },

  // ───────── create
  {
    ids: ['CREATE-PDF', 'CREATE-GIF', 'CREATE-ZIP', 'CREATE-SLIDESHOW'],
    group: '만들기', name: 'PDF·애니메이션 GIF·ZIP·슬라이드 쇼(HTML·WebM) 를 만들고 파일 내용 확인',
    run: async (app) => {
      const studio = dir(app, 'studio');
      await open(app, studio, 6);
      const make = async (key, fill) => {
        const before = fs.readdirSync(studio);
        await select(app, 'beach.jpg', 'city.jpg', 'forest.jpg');
        await pick(app, true);
        await menu(app, 'create', key);
        await dialog(app, 'create.make');
        await fill?.();
        await primary(app);
        await menuDone(app, 120000);
        const added = newFiles(studio, before);
        assert.equal(added.length, 1, `${key}: ${added.join(', ')}`);
        return path.join(studio, added[0]);
      };
      const pdf = fs.readFileSync(await make('create.pdf', () => setField(app, 'create.docTitle', 'trip')));
      assert.match(pdf.toString('latin1', 0, 8), /^%PDF-1\./);
      assert.match(pdf.toString('latin1'), /\/Count 3/);
      assert.match(pdf.toString('latin1'), /\/Title \(trip\)/);

      const gif = fs.readFileSync(await make('create.gif', () => setField(app, 'create.longSide', 200)));
      assert.equal(gif.toString('latin1', 0, 6), 'GIF89a');
      assert.equal(gif.readUInt16LE(6), 200, 'width 200');
      assert.equal(gifFrames(gif), 3);

      const zipFile = await make('create.zip', () => setField(app, 'edit.fileName', 'three.zip'));
      assert.equal(path.basename(zipFile), 'three.zip');
      const zip = new Uint8Array(fs.readFileSync(zipFile));
      const entries = readZip(zip);
      assert.deepEqual(entries.map((e) => e.name).sort(), ['beach.jpg', 'city.jpg', 'forest.jpg']);
      for (const entry of entries) assert.ok(Buffer.from(extractZip(zip, entry)).equals(fs.readFileSync(path.join(studio, entry.name))), entry.name);

      const html = fs.readFileSync(await make('create.slideshow', () => setField(app, 'create.slideshowKind', 'html')), 'utf8');
      assert.equal((html.match(/data:image\/jpeg;base64,/g) ?? []).length, 3);
      assert.match(html, /city\.jpg/);

      const webm = fs.readFileSync(await make('create.slideshow', async () => { await setField(app, 'create.slideshowKind', 'video'); await setField(app, 'create.size', '1280x720'); await setField(app, 'slideshow.interval', 1); }));
      assert.deepEqual([...webm.subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3], 'WebM (EBML) header');
      assert.ok(webm.length > 20000, `${webm.length} bytes`);
    },
  },
  {
    ids: ['CREATE-MUSIC'],
    group: '만들기', name: '슬라이드 쇼 배경 음악: 설정에서 고르면 쇼 동안 반복 재생·일시 정지, 동영상(WebM)에 Opus 소리 트랙, HTML 에도 들어간다',
    run: async (app) => {
      const studio = dir(app, 'studio');
      // 2 s of a 440 Hz tone as a WAV file.
      const rate = 22050;
      const samples = rate * 2;
      const wav = Buffer.alloc(44 + samples * 2);
      wav.write('RIFF', 0); wav.writeUInt32LE(36 + samples * 2, 4); wav.write('WAVEfmt ', 8);
      wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
      wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
      for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), 44 + i * 2);
      const tone = path.join(app.work, 'tone.wav');
      fs.writeFileSync(tone, wav);
      await open(app, studio, 6);

      // Settings → slideshow: choose the music.
      await pick(app, [tone]);
      await app.main.eval(`${P}.dq('#open-settings').click(); 1`);
      await app.main.waitFor(`${TOP}?.id === 'settings-dialog'`);
      await app.main.eval(`${TOP}.querySelector('[data-tab=slideshow]').click(); 1`);
      await app.main.waitFor(`Boolean(${TOP}.querySelector('[data-key=music-choose]'))`);
      await app.main.eval(`${TOP}.querySelector('[data-key=music-choose]').click(); 1`);
      await app.main.waitFor(`${TOP}.querySelector('[data-key=music-name]').textContent === 'tone.wav'`, { message: 'music chosen' });
      await primary(app);
      await app.main.waitFor(`${P}.app.settings.slideshow.music === ${js(tone)}`);

      // The slideshow plays it; pausing the show pauses the music.
      await select(app, 'beach.jpg', 'city.jpg');
      await app.main.eval(`(async () => { const m = await import('/src/ui/slideshow.js'); window.__show = await m.startSlideshow(${P}.app.state.list.filter((i) => !i.isDir)); })(); 1`);
      await app.main.waitFor(`Boolean(document.querySelector('.slideshow audio.slideshow-music')?.src)`, { message: 'music element' });
      await app.main.waitFor(`window.__show?.music && document.querySelector('.slideshow-music').readyState >= 2`, { timeout: 10000, message: 'music loaded' });
      await app.main.eval(`document.querySelector('.slideshow-music').play().catch(() => {}); 1`);
      await app.main.waitFor(`!window.__show.music.paused`, { timeout: 10000, message: 'music playing' });
      await app.main.eval(`document.querySelector('.slideshow .play-toggle').click(); 1`);
      await app.main.waitFor(`window.__show.music.paused`, { message: 'paused with the show' });
      await app.main.eval(`window.__show.end(); 1`);
      await app.main.waitFor(`!document.querySelector('.slideshow')`);

      // Video export with the music: an Opus track in the WebM.
      const before = fs.readdirSync(studio);
      await select(app, 'beach.jpg', 'city.jpg');
      await menu(app, 'create', 'create.slideshow');
      await dialog(app, 'create.make');
      assert.equal(await app.main.eval(`${TOP}.querySelector('[data-key=music-name]').textContent`), 'tone.wav', 'the slideshow music is the default');
      await setField(app, 'create.size', '1280x720');
      await setField(app, 'slideshow.interval', 1);
      await pick(app, true);
      await primary(app);
      await menuDone(app, 120000);
      const added = newFiles(studio, before).filter((n) => n.endsWith('.webm'));
      assert.equal(added.length, 1, added.join());
      const webm = fs.readFileSync(path.join(studio, added[0]));
      assert.deepEqual([...webm.subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3], 'WebM');
      assert.ok(webm.includes(Buffer.from('A_OPUS')), 'an Opus audio track');
      assert.ok(webm.includes(Buffer.from('V_VP')), 'and the video track');

      // HTML export: the music is inside the page.
      const before2 = fs.readdirSync(studio);
      await menu(app, 'create', 'create.slideshow');
      await dialog(app, 'create.make');
      await setField(app, 'create.slideshowKind', 'html');
      await pick(app, true);
      await primary(app);
      await menuDone(app, 120000);
      const page = newFiles(studio, before2).find((n) => n.endsWith('.html'));
      assert.ok(page, 'HTML written');
      assert.match(fs.readFileSync(path.join(studio, page), 'utf8'), /<audio id="m" src="data:audio\/wav;base64,UklGR/);
      await app.main.eval(`${P}.app.settings.slideshow.music = ''; ${P}.app.saveSettings(); 1`);
    },
  },
  {
    ids: ['CREATE-PANORAMA', 'CREATE-HDR', 'CREATE-FOCUS'],
    group: '만들기', name: '파노라마(겹치는 두 장 이어 붙이기)·HDR(노출 3장 합성)·초점 스태킹(반씩 흐린 두 장)',
    run: async (app) => {
      const merge = dir(app, 'merge');
      const beach = path.join(fixtures, 'beach.jpg');
      // The inputs are cut from beach.jpg in the page.
      await app.main.eval(`(async () => {
        const blob = await (await fetch(window.__TAURI_INTERNALS__.convertFileSrc(${js(beach)}))).blob();
        const bmp = await createImageBitmap(blob, { resizeWidth: 800, resizeHeight: 534 });
        const save = async (name, w, h, draw) => { const c = new OffscreenCanvas(w, h); const g = c.getContext('2d'); draw(g); const b = await c.convertToBlob({ type: 'image/png' }); await ${P}.fs.write(${js(merge)} + '\\\\' + name, new Uint8Array(await b.arrayBuffer())); };
        await save('pano-1.png', 500, 534, (g) => g.drawImage(bmp, 0, 0));
        await save('pano-2.png', 500, 534, (g) => g.drawImage(bmp, -300, 0));
        for (const [name, f] of [['hdr-dark.png', 'brightness(0.45)'], ['hdr-mid.png', 'none'], ['hdr-bright.png', 'brightness(1.9)']]) await save(name, 800, 534, (g) => { g.filter = f; g.drawImage(bmp, 0, 0); });
        for (const [name, side] of [['focus-left.png', 0], ['focus-right.png', 1]]) await save(name, 800, 534, (g) => { g.drawImage(bmp, 0, 0); g.save(); g.beginPath(); g.rect(side ? 0 : 400, 0, 400, 534); g.clip(); g.filter = 'blur(6px)'; g.drawImage(bmp, 0, 0); g.restore(); });
        return 1;
      })()`, 60000);
      await open(app, merge, 7);
      const run = async (key, names, extra) => {
        const before = fs.readdirSync(merge);
        await select(app, ...names);
        await pick(app, true);
        await menu(app, 'create', key);
        await dialog(app, 'create.make');
        await extra?.();
        await primary(app);
        await menuDone(app, 180000);
        const added = newFiles(merge, before);
        assert.equal(added.length, 1, `${key}: ${added.join(', ')}`);
        return path.join(merge, added[0]);
      };
      const pano = await imageInfo(app, await run('create.panorama', ['pano-1.png', 'pano-2.png'], () => setField(app, 'create.direction', 'horizontal')));
      assert.ok(pano.width >= 760 && pano.width <= 840 && Math.abs(pano.height - 534) <= 12, `panorama ${pano.width}x${pano.height}`);
      const hdr = await imageInfo(app, await run('create.hdr', ['hdr-dark.png', 'hdr-mid.png', 'hdr-bright.png'], () => setField(app, 'edit.format', 'png')));
      assert.deepEqual([hdr.width, hdr.height], [800, 534]);
      const dark = await imageInfo(app, path.join(merge, 'hdr-dark.png'));
      const bright = await imageInfo(app, path.join(merge, 'hdr-bright.png'));
      assert.ok(hdr.mean[1] > dark.mean[1] && hdr.mean[1] < bright.mean[1], 'fused exposure between the extremes');
      const focus = await run('create.focus', ['focus-left.png', 'focus-right.png'], () => setField(app, 'edit.format', 'png'));
      const sharpness = (file) => app.main.eval(`(async () => {
        const b = await createImageBitmap(await (await fetch(window.__TAURI_INTERNALS__.convertFileSrc(${js(file)}) + '?t=' + Date.now())).blob());
        const c = new OffscreenCanvas(b.width, b.height); const g = c.getContext('2d'); g.drawImage(b, 0, 0); const d = g.getImageData(0, 0, b.width, b.height).data;
        const half = (x0, x1) => { let s = 0; for (let y = 1; y < b.height - 1; y += 2) for (let x = x0 + 1; x < x1 - 1; x += 2) { const i = (y * b.width + x) * 4; s += Math.abs(4 * d[i + 1] - d[i - 3] - d[i + 5] - d[i + 1 - b.width * 4] - d[i + 1 + b.width * 4]); } return s; };
        return [half(0, b.width / 2), half(b.width / 2, b.width)];
      })()`, 60000);
      const [l, r] = await sharpness(focus);
      const [ll] = await sharpness(path.join(merge, 'focus-left.png'));
      const [, rr] = await sharpness(path.join(merge, 'focus-right.png'));
      assert.ok(l > ll * 0.8 && r > rr * 0.8, `both halves sharp: ${l.toFixed(0)}/${ll.toFixed(0)}, ${r.toFixed(0)}/${rr.toFixed(0)}`);
    },
  },

  // ───────── batch
  {
    ids: ['BATCH-ACTIONS'],
    group: '일괄', name: '일괄 작업(Actions): 편집기 설정을 작업에 기록하고 회전·크기·별점·키워드·PNG 단계를 더해 여러 사진에 한 번에 재생',
    run: async (app) => {
      const studio = dir(app, 'studio');
      await open(app, studio, 6);
      // Record: the editor's settings (brighter) become the first step of a new action.
      await openEditor(app, await pathOf(app, 'portrait.jpg'));
      await app.main.eval(`${P}.editor.testing.change((e) => { e.adjust.exposure = 1.2; }, 'test'); ${P}.editor.testing.setSection('presets'); 1`);
      await app.main.waitFor(`Boolean(${P}.dq('#record-action-step'))`);
      await app.main.eval(`${P}.dq('#record-action-step').click(); 1`);
      await app.main.waitFor(`${TOP}?.id === 'record-step-dialog'`);
      // Clicked from a timer: the click closes this window and opens the next one, which must not happen inside the CDP call.
      await app.main.eval(`setTimeout(() => ${TOP}.querySelector('.dialog-buttons .btn.primary').click(), 50); 1`);
      await app.main.waitFor(`Boolean(${TOP}?.querySelector('input')) && ${TOP}.id !== 'record-step-dialog'`);
      await app.main.eval(`(() => { const i = ${TOP}.querySelector('input'); i.value = 'Web export'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await primary(app);
      await app.main.waitFor(`${P}.app.settings.actions.length === 1 && ${P}.app.settings.actions[0].steps[0].preset.adjust.exposure === 1.2`, { message: 'recorded' });
      await leaveEditor(app);

      // Add steps in the actions dialog and run it on two photos.
      const [beach, city] = await select(app, 'beach.jpg', 'city.jpg');
      const original = await imageInfo(app, beach);
      await menu(app, 'tools', 'actions.menu');
      await app.main.waitFor(`${TOP}?.id === 'actions-dialog' && Boolean(${TOP}.querySelector('[data-action="Web export"]'))`);
      const addStep = (kind) => app.main.eval(`(() => { const s = ${TOP}.querySelector('[data-key=add-step]'); s.value = ${js(kind)}; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      const setStep = (key, value, tag = 'input') => app.main.eval(`(() => { const el = ${TOP}.querySelector(${js(`[data-step="${key}"]`)}); el.value = ${js(String(value))}; el.dispatchEvent(new Event(${js(tag === 'select' ? 'change' : 'input')}, { bubbles: true })); return 1; })()`);
      for (const kind of ['rotate', 'resize', 'rating', 'keywords', 'format']) await addStep(kind);
      await setStep('2-long', 400);
      await setStep('3-value', 4, 'select');
      await setStep('4-words', 'web, export');
      await setStep('5-format', 'png', 'select');
      assert.deepEqual(await app.main.eval(`[...${TOP}.querySelectorAll('.step-row')].map((r) => r.dataset.kind)`), ['edit', 'rotate', 'resize', 'rating', 'keywords', 'format']);
      await app.main.eval(`${TOP}.querySelector('#run-action').click(); 1`);
      await menuDone(app, 120000);
      const outA = path.join(studio, 'beach_action.png');
      const outB = path.join(studio, 'city_action.png');
      for (let i = 0; i < 100 && !(fs.existsSync(outA) && fs.existsSync(outB)); i++) await sleep(100);
      assert.ok(fs.existsSync(outA) && fs.existsSync(outB), 'both written as PNG');
      const png = fs.readFileSync(outA);
      const [w, hgt] = [png.readUInt32BE(16), png.readUInt32BE(20)];
      assert.equal(Math.max(w, hgt), 400, `long side 400: ${w}×${hgt}`);
      assert.equal(hgt > w, original.width > original.height, 'turned 90° (landscape ↔ portrait)');
      const out = await imageInfo(app, outA);
      assert.ok(out.mean[1] > original.mean[1] + 10, `brighter: ${original.mean[1].toFixed(0)} → ${out.mean[1].toFixed(0)}`);
      await app.main.waitFor(`${P}.app.catalog.get(${js(outA)})?.rating === 4 && ${P}.app.catalog.get(${js(outB)})?.keywords?.includes('export')`, { message: 'rating and keywords on the results' });
      assert.equal(await app.main.eval(`${P}.app.settings.actions[0].steps.length`), 6, 'the action was saved with its steps');
    },
  },
  {
    ids: ['BATCH-WATERMARK', 'BATCH-AUTOROTATE', 'BATCH-FILETIME', 'BATCH-ADJUST'],
    group: '일괄 처리', name: '워터마크·EXIF 기준 자동 회전·파일 날짜←촬영일·자동 보정',
    run: async (app) => {
      const studio = dir(app, 'studio');
      fs.copyFileSync(path.join(fixtures, 'beach.jpg'), path.join(studio, 'mark.jpg'));
      fs.copyFileSync(path.join(fixtures, 'city.jpg'), path.join(studio, 'turned.jpg'));
      fs.copyFileSync(path.join(fixtures, 'forest.jpg'), path.join(studio, 'dated.jpg'));
      await open(app, studio, 6);
      await reloadList(app);
      await app.main.waitFor(`['mark.jpg', 'turned.jpg', 'dated.jpg'].every((n) => ${P}.app.state.list.some((i) => i.name === n && ${P}.app.catalog.get(i.path)?.meta?.taken))`, { timeout: 30000, message: 'indexed' });

      await select(app, 'mark.jpg');
      await menu(app, 'tools', 'tools.watermark');
      await dialog(app, 'batch.position');
      await setField(app, 'edit.text', 'TESTMARK');
      await setField(app, 'edit.textSize', 8);
      await setField(app, 'edit.opacity', 100);
      await setField(app, 'edit.textColor', '#ff0000');
      await primary(app);
      await menuDone(app, 60000);
      assert.ok(fs.existsSync(path.join(studio, 'mark_wm.jpg')));
      const region = { x: 0.6, y: 0.85, w: 0.38, h: 0.13 };
      const plain = await imageInfo(app, path.join(studio, 'mark.jpg'), region);
      const marked = await imageInfo(app, path.join(studio, 'mark_wm.jpg'), region);
      assert.ok(marked.mean[0] - marked.mean[2] > plain.mean[0] - plain.mean[2] + 5, 'red text in the bottom right');

      const turned = path.join(studio, 'turned.jpg');
      assert.deepEqual(jpegSize(fs.readFileSync(turned)), [1600, 1067]);
      await select(app, 'turned.jpg');
      await menu(app, 'tools', 'tools.autoRotate');
      await menuDone(app, 60000);
      const bytes = new Uint8Array(fs.readFileSync(turned));
      assert.equal(readOrientation(bytes), 1, 'orientation reset');
      assert.deepEqual(jpegSize(bytes), [1067, 1600], 'pixels turned upright');

      const dated = path.join(studio, 'dated.jpg');
      await select(app, 'dated.jpg');
      await menu(app, 'tools', 'tools.fileTime');
      await menuDone(app);
      assert.equal(fs.statSync(dated).mtime.getTime(), new Date(2024, 9, 5, 8, 0, 0).getTime(), 'file time = date taken');

      const before = fs.readdirSync(studio);
      await select(app, 'dated.jpg');
      await menu(app, 'tools', 'tools.autoAdjust');
      await dialog(app, 'batch.output');
      await primary(app);
      await menuDone(app, 60000);
      assert.deepEqual(newFiles(studio, before), ['dated_adjusted.jpg']);
    },
  },
  {
    ids: ['ORG-ANALYSIS', 'ORG-ANALYSISFOLDERS'],
    group: '정리', name: '이미지 분석·자동 분류: 워커에서 백그라운드 분석(화면 멈춤 없음), 인물·장면·객체 분류, 카탈로그에서 분류별 보기, 속성 표시, 분류별 폴더로 정리',
    run: async (app) => {
      // A folder of its own: fixture photos, the face photo (copied at run time only) and a page of "text".
      const folder = dir(app, 'analysis');
      fs.mkdirSync(folder, { recursive: true });
      for (const name of ['beach.jpg', 'forest.jpg', 'city.jpg', 'flower.webp']) fs.copyFileSync(path.join(fixtures, name), path.join(folder, name));
      const face = fs.existsSync(path.join(app.work, 'people', 'face-a.jpg'));
      if (face) fs.copyFileSync(path.join(app.work, 'people', 'face-a.jpg'), path.join(folder, 'face.jpg'));
      const width = 240; const height = 320;
      const page = new Float32Array(width * height * 4);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const ink = y > 20 && y < 300 && y % 14 < 3 && x > 20 && x < 220 && (x * 7) % 11 > 2;
        const v = ink ? 20 : 250;
        page.set([v, v, v, 255], (y * width + x) * 4);
      }
      fs.writeFileSync(path.join(folder, 'page.png'), encodePng16({ width: width, height: height, data: page }));
      await open(app, folder, face ? 6 : 5);
      // Analyse in the background: the page keeps answering while the worker works.
      await app.main.eval(`window.__longTasks = []; window.__longObserver?.disconnect(); window.__longObserver = new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longTasks.push(Math.round(e.duration)); }); window.__longObserver.observe({ type: 'longtask' }); 1`);
      const queued = await app.main.eval(`${P}.analysis.analyze(${P}.app.state.list)`);
      assert.equal(queued, face ? 6 : 5);
      const pings = [];
      await app.main.waitFor(`${P}.analysis.state().running`, { message: 'analysis starts' });
      while (await app.main.eval(`${P}.analysis.state().running`)) {
        const t0 = Date.now();
        await app.main.eval('1');
        pings.push(Date.now() - t0);
        await sleep(100);
        if (pings.length > 1200) throw new Error('analysis did not finish in 2 minutes');
      }
      const run = JSON.parse(await app.main.eval(`JSON.stringify(${P}.analysis.state())`));
      assert.equal(run.failed, 0, 'every picture analysed');
      assert.equal(run.done, queued);
      const longTasks = JSON.parse(await app.main.eval('JSON.stringify(window.__longTasks)'));
      assert.ok(Math.max(0, ...longTasks) < 400, `no long freeze on the page: ${longTasks}`);
      assert.ok(pings.sort((a, b) => a - b)[Math.floor(pings.length * 0.9)] < 250, `the page answers quickly: ${pings}`);
      const cats = JSON.parse(await app.main.eval(`JSON.stringify(Object.fromEntries(${P}.app.state.list.map((i) => [i.name, ${P}.app.catalog.get(i.path)?.analysis?.cats ?? null])))`));
      for (const [name, list] of Object.entries(cats)) {
        assert.ok(list, `${name} analysed`);
        assert.equal(list.filter((c) => c.startsWith('people/')).length, 1, `${name}: one people category`);
      }
      assert.ok(cats['page.png'].includes('scene/document'), `page: ${cats['page.png']}`);
      assert.ok(cats['forest.jpg'].includes('scene/nature'), `forest: ${cats['forest.jpg']}`);
      assert.ok(cats['beach.jpg'].some((c) => c === 'scene/beach' || c === 'scene/sea'), `beach: ${cats['beach.jpg']}`);
      if (face) assert.ok(['people/portrait', 'people/one'].some((c) => cats['face.jpg'].includes(c)), `face: ${cats['face.jpg']}`);
      // Up to date: asking again queues nothing.
      assert.equal(await app.main.eval(`${P}.analysis.analyze(${P}.app.state.list)`), 0);
      // Catalog pane: the categories with counts; a click lists that category.
      await app.main.eval(`${P}.actions.showLeftTab('catalog'); 1`);
      const docLabel = await app.main.eval(`${P}.t('analysis.scene.document')`);
      await app.main.waitFor(`[...${P}.dqa('.analysis-cats .cat-row .cat-label')].some((e) => e.textContent === ${js(docLabel)})`, { message: 'analysis categories in the catalog pane' });
      await app.main.eval(`[...${P}.dqa('.analysis-cats .cat-row')].find((r) => r.querySelector('.cat-label').textContent === ${js(docLabel)}).click(); 1`);
      await app.main.waitFor(`${P}.app.state.source.type === 'filter' && !${P}.app.state.loading`, { message: 'category listed' });
      const listed = await app.main.eval(`${P}.app.state.list.map((i) => i.name)`);
      assert.ok(listed.includes('page.png'), `document listed: ${listed}`);
      assert.ok(!listed.includes('forest.jpg'), 'other pictures are not');
      // Properties: what the analysis found.
      await app.main.eval(`${P}.actions.selectItem(${P}.app.state.list.find((i) => i.name === 'page.png').path); 1`);
      await app.main.waitFor(`Boolean(${P}.dq('.analysis-chip[data-cat="scene/document"]'))`, { message: 'analysis in the properties panel' });
      // Classification stays in the catalog. No category folders, no copies.
      await open(app, folder, face ? 6 : 5);
      const before = fs.readdirSync(folder);
      const result = JSON.parse(await app.main.eval(`${P}.organizer().then((m) => m.organize(${P}.app.state.list, { kind: 'scene' })).then((r) => JSON.stringify(r))`));
      assert.ok(result.groups >= 2 && result.files === (face ? 6 : 5) && result.folders === 0, JSON.stringify(result));
      assert.deepEqual(fs.readdirSync(folder).sort(), before.sort(), 'classification does not create folders or copies');
      assert.ok(fs.existsSync(path.join(folder, 'page.png')), 'the original stays');
      assert.ok(await app.main.eval(`${P}.app.state.list.some((i) => i.name === 'page.png' && (${P}.app.catalog.get(i.path)?.analysis?.cats ?? []).includes('scene/document'))`), 'the category stays in the catalog');
      // The automatic run follows the setting and stays off for the rest of the suite.
      await app.main.eval(`${P}.analysis.suspendAuto(true); 1`);
    },
  },
  {
    ids: ['VIEW-DICOMCLICK', 'VIEW-DICOMANGLE', 'VIEW-DICOMGRID', 'VIEW-DICOMZOOM', 'VIEW-DICOMEXPORT', 'FMT-DICOM'],
    group: '형식', name: 'DICOM: 클릭으로 각도·거리 재기(화면에 그려짐), 막대의 − 배율 +, 눈금자에 맞춘 격자 켜고 끄기, 프레임을 모든 형식으로 내보내기, 실제 초음파 시네(컬러, 30프레임)',
    run: async (app) => {
      const folder = dir(app, 'dicom-ui');
      fs.mkdirSync(folder, { recursive: true });
      fs.copyFileSync(path.join(root, 'test', 'fixtures', 'dicom', 'CT_small.dcm'), path.join(folder, 'CT_small.dcm'));
      fs.copyFileSync(path.join(root, 'samples', 'cine_us_echo_30f.dcm'), path.join(folder, 'echo.dcm'));
      await open(app, folder, 2);
      await app.main.eval(`${P}.actions.viewItem(${js(await pathOf(app, 'CT_small.dcm'))}); 1`);
      await app.main.waitFor(`${P}.viewer.dicom.debug()?.frames === 1 && Boolean(${P}.dq('[data-dicom-tool=angle]'))`, { timeout: 20000 });
      await sleep(400);
      const box = JSON.parse(await app.main.eval(`JSON.stringify((() => { const r = document.querySelector('.viewer-media').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })())`));
      const at = (fx, fy) => [box.x + fx * box.w, box.y + fy * box.h];
      const last = async () => JSON.parse(await app.main.eval(`JSON.stringify((({ measures, pending }) => ({ m: measures.at(-1), n: measures.length, pending }))(${P}.viewer.dicom.debug()))`));
      // Angle: three clicks (first arm, vertex, second arm).
      await app.main.eval(`${P}.dq('[data-dicom-tool=angle]').click(); 1`);
      for (const [fx, fy] of [[0.2, 0.3], [0.5, 0.6], [0.8, 0.3]]) { await app.main.realClick(...at(fx, fy)); await sleep(120); }
      let state = await last();
      assert.equal(state.m.type, 'angle');
      assert.equal(state.pending, null, 'angle complete after three clicks');
      assert.match(state.m.text, /^\d+(\.\d)?°$/);
      // …drawn: the arms and the arc are stroked on a visible layer.
      const drawn = JSON.parse(await app.main.eval(`JSON.stringify({ layer: getComputedStyle(document.querySelector('.dicom-layer')).display, strokes: [...document.querySelectorAll('.dicom-measure polyline, .dicom-measure path')].map((e) => getComputedStyle(e).stroke) })`));
      assert.equal(drawn.layer, 'block');
      assert.ok(drawn.strokes.length >= 2 && drawn.strokes.every((c) => c !== 'none'), JSON.stringify(drawn));
      // Distance: two clicks.
      await app.main.eval(`${P}.dq('[data-dicom-tool=distance]').click(); 1`);
      for (const [fx, fy] of [[0.1, 0.8], [0.6, 0.8]]) { await app.main.realClick(...at(fx, fy)); await sleep(120); }
      state = await last();
      assert.equal(state.m.type, 'distance');
      assert.match(state.m.text, /\d (mm|cm|in|px)$/);
      await app.main.key('Escape');
      // − zoom + on the DICOM bar, in step with the viewer's own.
      const zoomText = () => app.main.eval(`${P}.dq('[data-dicom=zoom]').textContent + '|' + ${P}.dq('#viewer-zoom').textContent`);
      const [z0] = (await zoomText()).split('|');
      // Grid: on by default, each line on a ruler tick, so zooming moves it with the picture.
      const grid0 = await app.main.eval(`${P}.viewer.dicom.debug().grid`);
      assert.match(grid0, /^\d+x\d+$/);
      assert.match(await app.main.eval(`${P}.dq('[data-dicom=grid]').textContent`), /ON/);
      const gridXs = `[...document.querySelectorAll('.dicom-grid line')].filter((l) => l.getAttribute('x1') === l.getAttribute('x2')).map((l) => l.getAttribute('x1'))`;
      const onTicks = `(() => {
        const xs = new Set(${gridXs});
        const ys = new Set([...document.querySelectorAll('.dicom-grid line')].filter((l) => l.getAttribute('y1') === l.getAttribute('y2')).map((l) => l.getAttribute('y1')));
        const tx = [...document.querySelectorAll('.dicom-ruler.horizontal > line:not(.dicom-ruler-cursor)')];
        const ty = [...document.querySelectorAll('.dicom-ruler.vertical > line:not(.dicom-ruler-cursor)')];
        return tx.length > 2 && ty.length > 2 && tx.every((l) => xs.has(l.getAttribute('x1'))) && ty.every((l) => ys.has(l.getAttribute('y1')));
      })()`;
      assert.equal(await app.main.eval(onTicks), true, 'grid lines sit on the ruler ticks');
      const linesBefore = await app.main.eval(`JSON.stringify(${gridXs})`);
      await app.main.eval(`${P}.dq('[data-dicom=zoom-in]').click(); 1`);
      await sleep(300);
      const [z1, v1] = (await zoomText()).split('|');
      assert.ok(parseInt(z1, 10) > parseInt(z0, 10), `zoomed in: ${z0} → ${z1}`);
      assert.equal(z1, v1, 'the DICOM bar and the toolbar show the same zoom');
      assert.equal(await app.main.eval(onTicks), true, 'grid stays on the ruler ticks when zoomed');
      assert.notEqual(await app.main.eval(`JSON.stringify(${gridXs})`), linesBefore, 'grid moves with the zoom');
      await app.main.eval(`${P}.dq('[data-dicom=zoom-out]').click(); 1`);
      await sleep(300);
      assert.equal((await zoomText()).split('|')[0], z0);
      await app.main.eval(`${P}.dq('[data-dicom=grid]').click(); 1`);
      await app.main.waitFor(`!document.querySelector('.dicom-grid') && /OFF/.test(${P}.dq('[data-dicom=grid]').textContent)`, { message: 'grid off' });
      await app.main.eval(`${P}.dq('[data-dicom=grid]').click(); 1`);
      await app.main.waitFor(`Boolean(document.querySelector('.dicom-grid'))`, { message: 'grid on again' });
      // Export: the dialog offers every output format; JPEG and DICOM files come out right.
      const formats = await app.main.eval(`${P}.dq('[data-dicom=save]') && (setTimeout(() => ${P}.dq('[data-dicom=save]').click(), 0), 1)`);
      assert.equal(formats, 1);
      await app.main.waitFor(`Boolean(${P}.dq('[data-key=dicom-export-format]'))`, { message: 'export dialog' });
      const offered = await app.main.eval(`[...${P}.dq('[data-key=dicom-export-format]').options].map((o) => o.value)`);
      for (const id of ['jpeg', 'png', 'webp', 'bmp', 'tiff', 'gif', 'jp2', 'jxl', 'psd', 'pdf', 'dicom', 'tga', 'qoi', 'png16', 'tiff16']) assert.ok(offered.includes(id), `${id} offered`);
      await app.main.eval(`${P}.topDialog().querySelector('[data-value=false]').click(); 1`);
      const before = fs.readdirSync(folder);
      await app.main.eval(`${P}.viewer.dicom.testing.saveFrame({ format: 'jpeg' })`);
      await app.main.eval(`${P}.viewer.dicom.testing.saveFrame({ format: 'dicom' })`);
      const added = newFiles(folder, before).sort();
      assert.deepEqual(added, ['CT_small_frame001.dcm', 'CT_small_frame001.jpg']);
      const jpg = fs.readFileSync(path.join(folder, 'CT_small_frame001.jpg'));
      assert.equal(jpg.readUInt16BE(0), 0xffd8);
      assert.equal(fs.readFileSync(path.join(folder, 'CT_small_frame001.dcm')).toString('latin1', 128, 132), 'DICM');
      // A real moving ultrasound (colour, 30 frames): plays; no window / level for colour pictures.
      await reloadList(app);
      await app.main.eval(`${P}.actions.viewItem(${js(await pathOf(app, 'echo.dcm'))}); 1`);
      await app.main.waitFor(`${P}.viewer.dicom.debug()?.frames === 30`, { timeout: 30000, message: 'echo has 30 frames' });
      assert.equal(await app.main.eval(`Boolean(${P}.dq('.dicom-bar [data-key=dicom-wc]'))`), false);
      await app.main.eval(`${P}.viewer.dicom.testing.startCine(); 1`);
      await app.main.waitFor(`${P}.viewer.dicom.debug().state.frame >= 5`, { message: 'echo plays' });
      await app.main.eval(`${P}.viewer.dicom.testing.stopCine(); ${P}.actions.setMode('manage'); 1`);
    },
  },
  {
    ids: ['VIEW-FILMSTRIPNAV', 'APP-MINWIDTH', 'APP-PANELS', 'VIEW-VIDEOOPTS'],
    group: '앱', name: '필름 스트립 ◀ ▶(보기 모드·관리 필름 스트립), 창 최소 폭 = 툴바가 다 보이는 폭, 오른쪽 패널 접기 단추는 오른쪽 끝, 동영상 컨트롤은 처음부터 동영상 폭',
    run: async (app) => {
      await open(app, app.photos, 5);
      // Viewer: ◀ ▶ at both ends of the filmstrip.
      const first = await app.main.eval(`${P}.app.state.list.find((i) => !i.isDir && /\\.(jpg|png|webp)$/i.test(i.name)).path`);
      await app.main.eval(`${P}.app.settings.viewer.filmstrip = true; ${P}.actions.viewItem(${js(first)}); 1`);
      await app.main.waitFor(`Boolean(document.querySelector('[data-key=strip-next]')) && !document.querySelector('.filmstrip-box').hidden`, { message: 'filmstrip arrows' });
      const name0 = await app.main.eval(`document.querySelector('.viewer-status .status-name')?.textContent`);
      await app.main.eval(`document.querySelector('[data-key=strip-next]').click(); 1`);
      await app.main.waitFor(`document.querySelector('.viewer-status .status-name')?.textContent !== ${js(name0)}`, { message: '▶ shows the next picture' });
      await app.main.eval(`document.querySelector('[data-key=strip-prev]').click(); 1`);
      await app.main.waitFor(`document.querySelector('.viewer-status .status-name')?.textContent === ${js(name0)}`, { message: '◀ goes back' });
      // A video's own controls span the video from the start.
      const clip = path.join(dir(app, 'video-ui'), 'clip.webm');
      fs.mkdirSync(path.dirname(clip), { recursive: true });
      fs.copyFileSync(path.join(root, 'test', 'fixtures', 'formats', 'clip.webm'), clip);
      await open(app, path.dirname(clip), 1);
      await app.main.eval(`${P}.actions.viewItem(${js(await pathOf(app, 'clip.webm'))}); 1`);
      await app.main.waitFor(`(() => { const v = document.querySelector('video.viewer-media'); return v && v.readyState >= 1 && v.controls && v.dataset.size === Math.round(parseFloat(v.style.width)) + 'x' + Math.round(parseFloat(v.style.height)); })()`, { message: 'controls laid out at the video size' });
      await app.main.eval(`${P}.actions.setMode('manage'); 1`);
      // Manage mode, filmstrip view: ◀ ▶ move the focus.
      await open(app, app.photos, 5);
      const view = await app.main.eval(`${P}.app.settings.view`);
      await app.main.eval(`${P}.app.settings.view = 'filmstrip'; ${P}.fileList.rebuild(); ${P}.actions.selectItem(${P}.app.state.list[0].path); 1`);
      await app.main.waitFor(`getComputedStyle(document.querySelector('[data-key=film-next]')).display !== 'none'`, { message: 'list filmstrip arrows' });
      await app.main.eval(`document.querySelector('[data-key=film-next]').click(); 1`);
      assert.equal(await app.main.eval(`${P}.app.state.focus === ${P}.app.state.list[1].path`), true);
      assert.equal(await app.main.eval(`document.querySelector('[data-key=film-prev]').disabled`), false);
      await app.main.eval(`${P}.app.settings.view = ${js(view)}; ${P}.fileList.rebuild(); 1`);
      // The window is never narrower than its toolbars; nothing is cut off.
      await sleep(400);
      const widths = JSON.parse(await app.main.eval(`JSON.stringify({ min: ${P}.minWidth.current(), inner: innerWidth, clipped: [...document.querySelectorAll('.app-header, .app-toolbar, .viewer-toolbar')].filter((b) => b.offsetParent).filter((b) => { const last = [...b.children].filter((c) => c.offsetParent).pop(); return last && last.getBoundingClientRect().right > b.getBoundingClientRect().right + 1; }).map((b) => b.className) })`));
      assert.ok(widths.min >= 960 && widths.inner >= widths.min - 1, JSON.stringify(widths));
      assert.deepEqual(widths.clipped, []);
      // Fold buttons face the middle: "<" at the right of the left title, ">" at the left of the right title.
      await app.main.eval(`${P}.actions.showRightTab?.('properties'); 1`);
      const gap = await app.main.eval(`(() => { const edge = (side, end) => { const b = document.querySelector('[data-fold=' + side + ']'); const head = b?.closest('.pane-head'); if (!head) return null; const hb = head.getBoundingClientRect(); const bb = b.getBoundingClientRect(); return Math.round(end === 'right' ? hb.right - bb.right : bb.left - hb.left); }; return { left: edge('left', 'right'), right: edge('right', 'left') }; })()`);
      assert.ok(gap && gap.left !== null && gap.left <= 8 && gap.right !== null && gap.right <= 8, `fold button gap ${JSON.stringify(gap)}`);
    },
  },
  {
    ids: ['APP-TUTORIAL'],
    group: '앱', name: '튜토리얼: 시작 화면 버튼으로 실행, 모든 단계가 차례로 실제 기능을 보여 주고, 장 이동·이전·자동 재생, 끝내면 테마·언어·보기 설정이 돌아오고 사용자 폴더는 그대로',
    run: async (app) => {
      await open(app, app.photos, 5);
      const userFiles = () => fs.readdirSync(app.photos).map((n) => `${n}:${fs.statSync(path.join(app.photos, n)).mtimeMs}`).sort();
      const settingsNow = () => app.main.eval(`JSON.stringify({ theme: ${P}.app.settings.theme ?? 'system', view: ${P}.app.settings.view, lang: document.documentElement.lang })`);
      const before = { files: userFiles(), settings: await settingsNow() };
      await app.main.eval(`${P}.actions.setMode('start'); 1`);
      await app.main.waitFor(`Boolean(document.querySelector('#start-tutorial'))`, { message: 'tutorial on the start page' });
      await app.main.eval(`document.querySelector('#start-tutorial').click(); 1`);
      await app.main.waitFor(`${P}.tutorial.state().running && !${P}.tutorial.state().busy && Boolean(document.querySelector('.tutorial-card:not([hidden])'))`, { message: 'tutorial card' });
      const total = await app.main.eval(`${P}.tutorial.state().total`);
      assert.ok(total >= 50, `${total} steps`);
      // Every step, in order, with the Next button; each shows its own feature.
      const seen = [];
      for (let i = 0; i < total; i++) {
        if (i > 0) await app.main.eval(`document.querySelector('.tutorial-card [data-tutorial=next]').click(); 1`);
        await app.main.waitFor(`${P}.tutorial.state().index === ${i} && !${P}.tutorial.state().busy`, { timeout: 60000, message: `step ${i + 1}` });
        const s = await app.main.eval(`${P}.tutorial.state().id`);
        seen.push(s);
        const card = await app.main.eval(`({ title: document.querySelector('.tutorial-title')?.textContent ?? '', count: document.querySelector('[data-key=tutorial-count]')?.textContent ?? '' })`);
        assert.ok(card.title && !card.title.startsWith('tut.'), `step ${i + 1} has a title: ${card.title}`);
        assert.equal(card.count, `${i + 1} / ${total}`);
        if (s === 'folder') assert.ok(await app.main.eval(`/tutorial-photos$/.test(${P}.app.state.source.path) && ${P}.app.state.list.length >= 12`), 'the tutorial folder is open');
        if (s === 'gif') assert.ok(await app.main.eval(`Boolean(document.querySelector('#media-play')) && ${P}.viewer.debug().anim?.count === 4`), 'GIF with play controls');
        if (s === 'dicom') assert.ok(await app.main.eval(`${P}.viewer.dicom.active`), 'DICOM tools');
        if (s === 'looks') assert.ok(await app.main.eval(`Boolean(document.querySelector('.look-tune[data-look-active=portra]'))`), 'a preset applied');
        if (s === 'createGif') assert.ok(await app.main.eval(`Boolean(document.querySelector('.dialog'))`), 'the GIF dialog inside the window');
        if (['welcome', 'folder', 'viewer', 'dicom', 'looks'].includes(s)) assert.equal(await app.main.eval(`!document.querySelector('.tutorial-spot').hidden`), true, `${s}: outlined`);
      }
      assert.equal(new Set(seen).size, total, 'each step once');
      // Back one step, jump to a chapter, auto play goes on by itself.
      await app.main.eval(`document.querySelector('.tutorial-card [data-tutorial=prev]').click(); 1`);
      await app.main.waitFor(`${P}.tutorial.state().index === ${total - 2} && !${P}.tutorial.state().busy`, { timeout: 30000, message: 'previous' });
      await app.main.eval(`(() => { const s = document.querySelector('[data-key=tutorial-chapter]'); s.value = 'view'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await app.main.waitFor(`${P}.tutorial.state().id === 'viewer' && !${P}.tutorial.state().busy`, { timeout: 30000, message: 'chapter jump' });
      await app.main.eval(`document.querySelector('.tutorial-card [data-tutorial=auto]').click(); 1`);
      await app.main.waitFor(`${P}.tutorial.state().id === 'zoom'`, { timeout: 20000, message: 'auto play goes on' });
      // Exit: settings back, the user's folder untouched, the tutorial worked in its own folder.
      await app.main.eval(`document.querySelector('.tutorial-card [data-tutorial=exit]').click(); 1`);
      await app.main.waitFor(`!${P}.tutorial.state().running && !document.querySelector('.tutorial-card') && ${P}.app.state.mode === 'start'`, { timeout: 20000, message: 'tutorial ended' });
      await sleep(500);
      assert.equal(await settingsNow(), before.settings, 'settings restored');
      assert.deepEqual(userFiles(), before.files, 'the user\'s photos were not touched');
      assert.ok(fs.existsSync(path.join(app.work, 'data', 'tutorial-photos', 'forest.jpg')), 'the tutorial used its own folder');
    },
  },
];
