// Feature E2E: every ACDSee feature of test/features.mjs driven in the real
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

export const env = (work) => ({ MYPHOTO_FAKE_SHELL: path.join(work, 'shell.log'), MYPHOTO_FAKE_SCANNER: path.join(fixtures, 'forest.jpg'), MYPHOTO_FAKE_PRINT: path.join(work, 'printed.pdf') });

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
    group: '보기 방식', name: '타일 보기와 필름 스트립(위에 큰 미리 보기, → 로 다음 사진)',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      await menu(app, 'view', 'menu.viewStyle', 'viewStyle.tiles');
      await menuDone(app);
      await app.main.waitFor(`${P}.dqa('.filelist[data-view=tiles] .tile').length >= 6`, { message: 'tiles' });
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
    ids: ['APP-SETTINGS'],
    group: '설정', name: '설정 창: 테마를 밝게/어둡게, 탭 이동, 저장하면 바로 적용되고 설정 파일에 남는다',
    run: async (app) => {
      await open(app, dir(app, 'studio'), 6);
      const original = await app.main.eval(`${P}.app.settings.theme`);
      for (const theme of ['light', 'dark']) {
        await app.main.eval(`${P}.dq('#open-settings').click(); 1`);
        await app.main.waitFor(`Boolean(${P}.dq('#settings-dialog'))`);
        await setField(app, 'settings.theme', theme);
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
      for (let i = 0; i < 40 && where().join() !== 'album,album'; i++) await sleep(100);
      assert.deepEqual(where(), ['album', 'album'], 'moved');
      await app.main.waitFor(`!${P}.dq('#undo-button').disabled`, { message: 'undo enabled' });
      await app.main.eval(`${P}.dq('#undo-button').click(); 1`);
      for (let i = 0; i < 40 && where().join() !== 'studio,studio'; i++) await sleep(100);
      assert.deepEqual(where(), ['studio', 'studio'], 'undo moved them back');
      await app.main.waitFor(`!${P}.dq('#redo-button').disabled`);
      await app.main.eval(`${P}.dq('#redo-button').click(); 1`);
      for (let i = 0; i < 40 && where().join() !== 'album,album'; i++) await sleep(100);
      assert.deepEqual(where(), ['album', 'album'], 'redo moved them again');
      await app.main.eval(`${P}.dq('#undo-button').click(); 1`);
      for (let i = 0; i < 40 && where().join() !== 'studio,studio'; i++) await sleep(100);
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
      await app.main.eval(`${P}.dq('.filelist').focus(); 1`);
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
      // Drives first, each with a name and free space; a click opens it.
      const drives = await app.main.eval(`${P}.dqa('.folders .tree > .tree-node > .tree-row').filter((r) => /\\([A-Z]:\\)$/.test(r.textContent)).map((r) => r.dataset.path)`);
      if (process.platform === 'win32') {
        assert.ok(drives.includes('C:\\'), `drives: ${drives}`);
        assert.ok(await app.main.eval(`${P}.dqa('.drive-usage').length >= 1`), 'free space shown');
        await app.main.eval(`${P}.dqa('.folders .tree-row').find((r) => r.dataset.path === 'C:\\\\').click(); 1`);
        await app.main.waitFor(`${P}.app.state.source.path === 'C:\\\\' && !${P}.app.state.loading`, { message: 'drive opened' });
        await open(app, dir(app, 'studio'), 6);
      }
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
      const setKey = (key, value) => app.main.eval(`(() => { const el = ${P}.dq('#print-dialog [data-key=${key}]'); el.value = ${js(String(value))}; el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return 1; })()`);
      await setKey('columns', 2);
      await setKey('rows', 1);
      await setKey('orientation', 'landscape');
      await setKey('marginLeft', 25);
      await app.main.waitFor(`${P}.dq('#print-dialog .print-page-label').textContent.includes('2')`, { message: 'two pages in the preview' });
      const shape = await app.main.eval(`(() => { const c = ${P}.dq('#print-dialog .print-preview-page'); return [c.width, c.height]; })()`);
      assert.ok(shape[0] > shape[1], 'landscape preview');
      await app.main.eval(`${P}.dq('#print-next').click(); 1`);
      assert.match(await app.main.eval(`${P}.dq('#print-dialog .print-page-label').textContent`), /2/);
      const cut = await app.main.eval(`(() => { const doc = ${P}.topDialog().ownerDocument; return doc.documentElement.scrollHeight > doc.defaultView.innerHeight + 1; })()`);
      assert.equal(cut, false, 'the print window shows everything');
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
      await app.main.eval(`${P}.dq('[data-dicom=cine]').click(); 1`);
      assert.equal(await app.main.eval(`${P}.viewer.dicom.debug().cine`), false);
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
        if (count() !== base + 1) problems.push(`${name}: ${count() - base} OS windows while open`);
        const box = `${P}.topDialog()`;
        if (how === 'primary') await app.main.eval(`${box}.querySelector('.dialog-buttons .btn.primary').click(); 1`);
        else if (how === 'cancel') await app.main.eval(`(() => { const b = [...${box}.querySelectorAll('.dialog-buttons .btn')].find((x) => !x.classList.contains('primary')); (b ?? ${box}.querySelector('.dialog-buttons .btn')).click(); return 1; })()`);
        else if (how === 'escape') await app.main.eval(`${box}.ownerDocument.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 1`);
        else await app.main.eval(`${box}.ownerDocument.defaultView.close(); 1`);
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
      await dialog(app, 'private.passwordAgain');
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
];
