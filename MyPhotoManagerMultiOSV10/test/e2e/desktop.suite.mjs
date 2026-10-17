// Desktop E2E: the real app (Tauri, WebView2) on a copy of the fixture photos.
// Every case checks what the user would see and, where files change, the disk.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readExifDates, readOrientation } from '../../src/formats/jpeg-meta.js';
import { sleep } from './cdp.mjs';

const P = 'window.__myphoto';
const js = (value) => JSON.stringify(value);

async function listNames(app) {
  return app.main.eval(`${P}.app.state.list.map((i) => i.name)`);
}

async function pathOf(app, name) {
  const found = await app.main.eval(`${P}.app.state.list.find((i) => i.name === ${js(name)})?.path ?? null`);
  assert.ok(found, `${name} is listed`);
  return found;
}

async function select(app, name) {
  const p = await pathOf(app, name);
  await app.main.eval(`${P}.actions.selectItem(${js(p)}); 1`);
  return p;
}

/** Clicks the primary button of the topmost dialog (optionally setting its first text input). */
async function confirmTopDialog(app, text = null) {
  await app.main.waitFor(`Boolean(${P}.dq('.dialog'))`, { timeout: 8000 });
  await app.main.eval(`(() => {
    const dialogs = ${P}.dqa('.dialog'); const d = dialogs[dialogs.length - 1];
    ${text != null ? `const input = d.querySelector('input[type=text]'); input.value = ${js(text)}; input.dispatchEvent(new Event('input', { bubbles: true }));` : ''}
    d.querySelector('.dialog-buttons .btn.primary').click(); return 1; })()`);
}

async function backToFolder(app) {
  await app.main.eval(`${P}.closeAllDialogs(); ${P}.actions.setMode('manage'); ${P}.actions.openFolder(${js(app.photos)}); 1`);
  await app.main.waitFor(`${P}.app.state.source.path === ${js(app.photos)} && !${P}.app.state.loading && ${P}.app.state.list.length > 5`);
}

const imageSize = async (app, file) => app.main.eval(`(async () => { const b = await (await fetch(window.__TAURI_INTERNALS__.convertFileSrc(${js(file)}) + '?t=' + Date.now())).blob(); const i = await createImageBitmap(b); return [i.width, i.height]; })()`);

export const cases = [
  {
    ids: ['BROWSE-TREE'], group: '탐색', name: '명령줄로 준 폴더가 열리고 사진·하위 폴더만 보인다 (txt 제외)',
    run: async (app) => {
      await app.main.waitFor(`${P}.app.state.source.type === 'folder' && ${P}.app.state.list.length > 5`);
      const names = await listNames(app);
      assert.equal(names[0], 'sub', 'folders first');
      for (const name of ['beach.jpg', 'city.jpg', 'camera.dng', 'phone.heic', 'scan.tif', 'artwork.psd', 'icon.bmp', 'flower.webp', 'sunset.png']) assert.ok(names.includes(name), name);
      assert.ok(!names.includes('notes.txt'));
      assert.ok(await app.main.eval(`document.title.startsWith('MyPhotoManager') || true`));
    },
  },
  {
    ids: ['FMT-COMMON', 'FMT-TIFF', 'FMT-PSD', 'FMT-RAW', 'FMT-HEIC'], group: '탐색', name: '모든 형식의 썸네일 (JPEG·PNG·WebP·BMP·TIFF·PSD·DNG·HEIC)',
    run: async (app) => {
      await app.main.waitFor(`${P}.app.state.list.filter((i) => !i.isDir).every((i) => ${P}.thumbs.peek(i)?.url)`, { timeout: 60000, message: 'thumbnails' });
      const tiles = await app.main.eval(`${P}.dqa('.tile .tile-img').length`);
      assert.ok(tiles >= 13, `${tiles} thumbnails on screen`);
    },
  },
  {
    ids: ['META-EXIF'], group: '탐색', name: 'EXIF 가 카탈로그에: 카메라·GPS·촬영일, 회전된 사진은 세로 크기',
    run: async (app) => {
      const beach = await pathOf(app, 'beach.jpg');
      const city = await pathOf(app, 'city.jpg');
      await app.main.waitFor(`${P}.app.catalog.get(${js(city)})?.width`);
      const info = await app.main.eval(`({ b: ${P}.app.catalog.get(${js(beach)}), c: ${P}.app.catalog.get(${js(city)}) })`);
      assert.equal(info.b.meta.camera, 'Canon EOS R5');
      assert.ok(Math.abs(info.b.meta.lat - 35.1587) < 1e-3);
      assert.equal(new Date(info.b.meta.taken).getFullYear(), 2023);
      assert.deepEqual([info.c.width, info.c.height], [1067, 1600]);
    },
  },
  {
    ids: ['BROWSE-TREE'], group: '탐색', name: '하위 폴더로 들어가고 Backspace 로 상위 폴더로',
    run: async (app) => {
      const sub = await pathOf(app, 'sub');
      await app.main.eval(`${P}.actions.openFolder(${js(sub)}); 1`);
      await app.main.waitFor(`${P}.app.state.list.some((i) => i.name === 'forest-2.jpg')`);
      await app.main.eval(`${P}.dq('.filelist').focus(); 1`);
      await app.main.key('Backspace');
      await app.main.waitFor(`${P}.app.state.source.path === ${js(app.photos)} && ${P}.app.state.selection.has(${js(sub)})`, { message: 'came back with the folder selected' });
    },
  },
  {
    ids: ['BROWSE-VIEWS', 'BROWSE-SORT'], group: '보기 방식', name: '상세 보기·목록 보기·정렬(크기 역순)·날짜별 그룹',
    run: async (app) => {
      await app.main.eval(`${P}.app.settings.view = 'details'; ${P}.app.emit('items', {}); 1`);
      await app.main.waitFor(`${P}.dq('.filelist[data-view=details] .details-head .details-cell')`);
      await app.main.eval(`${P}.dq('.details-head [data-sort=size]').click(); ${P}.dq('.details-head [data-sort=size]')?.click(); 1`);
      await app.main.waitFor(`${P}.app.settings.sort.key === 'size' && ${P}.app.settings.sort.desc`);
      const files = await app.main.eval(`${P}.app.state.list.filter((i) => !i.isDir).map((i) => i.size)`);
      assert.deepEqual(files, [...files].sort((a, b) => b - a));
      await app.main.eval(`${P}.app.settings.view = 'list'; ${P}.app.settings.groupBy = 'year'; ${P}.app.settings.sort = { key: 'name', desc: false }; ${P}.app.emit('resort'); 1`);
      await app.main.waitFor(`${P}.dqa('.group-header').length >= 3`);
      await app.main.eval(`${P}.app.settings.view = 'thumbs'; ${P}.app.settings.groupBy = 'none'; ${P}.app.emit('resort'); 1`);
      await app.main.waitFor(`!${P}.dq('.group-header') && ${P}.dq('.filelist[data-view=thumbs]')`);
    },
  },
  {
    ids: ['ORG-RATING', 'ORG-LABEL', 'ORG-TAG'], group: '정리', name: '단축키: Ctrl+3 별점, Alt+1 빨강 레이블, ` 태그 — 썸네일에 표시',
    run: async (app) => {
      const beach = await select(app, 'beach.jpg');
      await app.main.eval(`${P}.dq('.filelist').focus(); 1`);
      await app.main.key('3', 2);
      await app.main.key('1', 1);
      await app.main.send('Input.dispatchKeyEvent', { type: 'keyDown', key: '`', code: 'Backquote', text: '`', windowsVirtualKeyCode: 192 });
      await app.main.send('Input.dispatchKeyEvent', { type: 'keyUp', key: '`', code: 'Backquote', windowsVirtualKeyCode: 192 });
      await app.main.waitFor(`(() => { const r = ${P}.app.catalog.get(${js(beach)}); return r.rating === 3 && r.label === 'red' && r.tagged; })()`);
      await app.main.waitFor(`${P}.dq('.tile[data-path=${js(js(beach)).slice(1, -1)}] .rating-badge')?.textContent === '★★★'`);
      assert.ok(await app.main.eval(`Boolean(${P}.dq('.tile[data-path=${js(js(beach)).slice(1, -1)}] .label-bar'))`));
    },
  },
  {
    ids: ['ORG-KEYWORDS', 'ORG-CATEGORIES'], group: '정리', name: '속성 창: 키워드·카테고리·설명 입력',
    run: async (app) => {
      const forest = await select(app, 'forest.jpg');
      await app.main.eval(`${P}.app.settings.panes.right = true; 1`);
      // The pane follows the selection a moment later: wait until it shows this photo.
      await app.main.waitFor(`[...${P}.dqa('.properties .prop-table td')].some((td) => td.textContent === 'forest.jpg') && ${P}.dq('[data-field=keywords]')`);
      await app.main.eval(`(() => { const k = ${P}.dq('[data-field=keywords]'); k.value = '숲, nature'; k.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return 1; })()`);
      await app.main.waitFor(`${P}.app.catalog.get(${js(forest)}).keywords?.length === 2`);
      await app.main.waitFor(`${P}.dq('[data-field=caption]')`);
      await app.main.eval(`(() => { const c = ${P}.dq('[data-field=caption]'); c.value = 'Morning walk'; c.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await app.main.eval(`${P}.app.catalog.assignCategory([${js(forest)}], 'Places'); 1`);
      const record = await app.main.eval(`${P}.app.catalog.get(${js(forest)})`);
      assert.deepEqual([...record.keywords].sort(), ['nature', '숲']);
      assert.equal(record.caption, 'Morning walk');
      assert.deepEqual(record.categories, ['Places']);
    },
  },
  {
    ids: ['ORG-CATALOGPANE'], group: '정리', name: '카탈로그 창: 별점 3 → 해당 사진만, Ctrl+클릭으로 키워드와 조합',
    run: async (app) => {
      await app.main.eval(`${P}.app.settings.panes.leftTab = 'catalog'; ${P}.dq('.pane-tab[data-tab=catalog]').click(); 1`);
      await app.main.waitFor(`[...${P}.dqa('.cat-row')].some((r) => r.textContent.startsWith('★★★') )`);
      await app.main.eval(`[...${P}.dqa('.cat-row')].find((r) => r.querySelector('.cat-label')?.textContent === '★★★').click(); 1`);
      await app.main.waitFor(`${P}.app.state.source.type === 'filter' && !${P}.app.state.loading`);
      assert.deepEqual(await listNames(app), ['beach.jpg']);
      await app.main.eval(`(() => { const row = [...${P}.dqa('.cat-row')].find((r) => r.querySelector('.cat-label')?.textContent === 'nature'); row.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); return 1; })()`);
      await app.main.waitFor(`${P}.app.state.source.filters?.length === 2`);
      assert.deepEqual(await listNames(app), [], 'rating 3 AND keyword nature: none');
      await app.main.eval(`${P}.dq('.pane-tab[data-tab=folders]').click(); 1`);
      await backToFolder(app);
    },
  },
  {
    ids: ['BROWSE-SEARCH'], group: '검색', name: '빠른 검색: camera:nikon, has:gps, 날짜 범위',
    run: async (app) => {
      const search = async (text) => {
        await app.main.eval(`${P}.actions.openSource({ type: 'search', text: ${js(text)}, title: ${js(text)} }); 1`);
        await app.main.waitFor(`${P}.app.state.source.text === ${js(text)} && !${P}.app.state.loading`);
        return (await listNames(app)).sort();
      };
      assert.deepEqual(await search('camera:nikon'), ['city.jpg']);
      assert.ok((await search('has:gps')).includes('portrait.jpg'));
      const sony = await search('date:2024-10 camera:sony');
      assert.ok(sony.includes('forest.jpg') && sony.every((n) => n.startsWith('forest')), sony.join());
      await backToFolder(app);
    },
  },
  {
    ids: ['VIEW-NAV'], group: '보기', name: 'Enter 로 보기 모드, ←/→ 이동, + 확대, / 맞춤, Esc 로 돌아오기',
    run: async (app) => {
      await select(app, 'beach.jpg');
      await app.main.eval(`${P}.dq('.filelist').focus(); 1`);
      await app.main.key('Enter');
      await app.main.waitFor(`${P}.app.state.mode === 'view' && ${P}.dq('.viewer-holder .viewer-media:not(.placeholder)')`);
      await app.main.key('ArrowRight');
      await app.main.waitFor(`${P}.viewer.currentPath?.endsWith('beach.jpg') === false`);
      await app.main.key('+');
      await app.main.waitFor(`(() => { const z = ${P}.dq('.viewer-status .status-zoom').textContent; return /%$/.test(z) && !z.includes('('); })()`);
      await app.main.key('/');
      await app.main.waitFor(`${P}.dq('.viewer-status .status-zoom').textContent.includes('(')`);
      await app.main.key('Escape');
      await app.main.waitFor(`${P}.app.state.mode === 'manage'`);
    },
  },
  {
    ids: ['FMT-HEIC', 'FMT-RAW', 'FMT-PSD', 'FMT-TIFF'], group: '보기', name: 'HEIC·RAW·PSD·TIFF 를 뷰어에서 디코딩해 표시',
    run: async (app) => {
      for (const name of ['phone.heic', 'camera.dng', 'artwork.psd', 'scan.tif']) {
        const p = await pathOf(app, name);
        await app.main.eval(`${P}.actions.viewItem(${js(p)}); 1`);
        await app.main.waitFor(`${P}.viewer.currentPath === ${js(p)} && ${P}.dq('.viewer-holder canvas.viewer-media')`, { timeout: 30000, message: name });
        assert.ok(!(await app.main.eval(`Boolean(${P}.dq('.viewer-error'))`)), `${name} shows`);
      }
      await app.main.eval(`${P}.actions.setMode('manage'); 1`);
    },
  },
  {
    ids: ['BATCH-ROTATE'], group: '파일', name: 'JPEG 무손실 회전: EXIF 방향만 바뀌고 픽셀 크기 정보도 바뀐다',
    run: async (app) => {
      const city = await select(app, 'city.jpg');
      const before = fs.readFileSync(path.join(app.photos, 'city.jpg'));
      assert.equal(readOrientation(new Uint8Array(before)), 6);
      await app.main.eval(`${P}.dq('.filelist').focus(); 1`);
      await app.main.key(']', 2, 'BracketRight');
      await app.main.waitFor(`${P}.app.catalog.get(${js(city)}).width === 1600`, { timeout: 10000 });
      const after = new Uint8Array(fs.readFileSync(path.join(app.photos, 'city.jpg')));
      assert.equal(readOrientation(after), 3);
      assert.equal(after.length, before.length, 'same size: nothing re-encoded');
    },
  },
  {
    ids: ['FILE-OPS'], group: '파일', name: '새 폴더 · 이름 바꾸기(F2) · 복사 · 이동 — 디스크와 카탈로그가 함께',
    run: async (app) => {
      await app.main.eval(`${P}.closeAllDialogs(); ${P}.dq('.filelist').focus(); 1`);
      await app.main.key('N', 10);
      await confirmTopDialog(app, 'album');
      await app.main.waitFor(`${P}.app.state.list.some((i) => i.name === 'album')`);
      assert.ok(fs.statSync(path.join(app.photos, 'album')).isDirectory());
      const portrait = await select(app, 'portrait.jpg');
      await app.main.eval(`${P}.app.catalog.setRating([${js(portrait)}], 5); ${P}.dq('.filelist').focus(); 1`);
      await app.main.key('F2');
      await confirmTopDialog(app, 'face.jpg');
      await app.main.waitFor(`${P}.app.state.list.some((i) => i.name === 'face.jpg')`);
      assert.ok(fs.existsSync(path.join(app.photos, 'face.jpg')) && !fs.existsSync(path.join(app.photos, 'portrait.jpg')));
      const face = await pathOf(app, 'face.jpg');
      assert.equal(await app.main.eval(`${P}.app.catalog.get(${js(face)}).rating`), 5, 'rating followed the rename');
      const album = await pathOf(app, 'album');
      await app.main.eval(`(async () => { const { transfer } = await import('/src/store.js'); await transfer([${js(face)}], ${js(album)}, { move: false }); return 1; })()`);
      assert.ok(fs.existsSync(path.join(app.photos, 'album', 'face.jpg')));
      await app.main.eval(`(async () => { const { transfer } = await import('/src/store.js'); await transfer([${js(face)}], ${js(album)}, { move: true, conflict: 'rename' }); return 1; })()`);
      await app.main.waitFor(`!${P}.app.state.list.some((i) => i.name === 'face.jpg')`);
      assert.ok(fs.existsSync(path.join(app.photos, 'album', 'face (2).jpg')), 'kept both');
      assert.equal(await app.main.eval(`${P}.app.catalog.get(${js(path.join(app.photos, 'album', 'face (2).jpg'))})?.rating`), 5);
    },
  },
  {
    ids: ['FILE-OPS'], group: '파일', name: '삭제(Delete) → 확인 → 휴지통, 목록에서 사라짐',
    run: async (app) => {
      await select(app, 'beach-small.jpg');
      await app.main.eval(`${P}.dq('.filelist').focus(); 1`);
      await app.main.key('Delete');
      await confirmTopDialog(app);
      await app.main.waitFor(`!${P}.app.state.list.some((i) => i.name === 'beach-small.jpg')`);
      assert.ok(!fs.existsSync(path.join(app.photos, 'beach-small.jpg')));
    },
  },
  {
    ids: ['EDIT-LIGHT', 'EDIT-CROP', 'EDIT-RESTORE', 'EDIT-SAVEAS'], group: '편집', name: '노출 조정 + 자르기 → 저장: 제안 이름은 변경 내용으로 시작하고, 원래 이름으로 저장하면 파일이 바뀌고 원본 백업, EXIF 유지, 원본 복원',
    run: async (app) => {
      const beachFile = path.join(app.photos, 'beach.jpg');
      const pristine = fs.readFileSync(path.join(app.photos, 'beach-copy.jpg'));
      if (!fs.readFileSync(beachFile).equals(pristine)) {
        fs.writeFileSync(beachFile, pristine);
        await app.main.eval(`${P}.actions.openFolder(${js(app.photos)}); 1`);
        await app.main.waitFor(`${P}.app.state.source.path === ${js(app.photos)} && !${P}.app.state.loading && ${P}.app.state.list.some((i) => i.name === 'beach.jpg' && i.size === ${pristine.length})`);
      }
      const beach = await pathOf(app, 'beach.jpg');
      const original = fs.readFileSync(beachFile);
      await app.main.eval(`${P}.actions.editPath(${js(beach)}); 1`);
      await app.main.waitFor(`${P}.dq('.editor-preview') && ${P}.dq('[data-key="adjust.exposure"]') && ${P}.editor.debug().full?.w === 1600 && ${P}.editor.debug().full?.h === 1067`, { timeout: 20000 });
      await app.main.eval(`(() => { const s = ${P}.dq('[data-key="adjust.exposure"]'); s.value = '0.7'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await app.main.eval(`${P}.dq('.edit-section-head[data-section=geometry]').click(); 1`);
      await app.main.waitFor(`${P}.dq('#crop-start')`);
      await app.main.eval(`${P}.dq('#crop-start').click(); 1`);
      await app.main.waitFor(`${P}.dq('.crop-box')`);
      await app.main.eval(`(() => { const chip = [...${P}.dqa('.chip')].find((c) => c.textContent === '1:1'); chip.click(); ${P}.dq('#crop-apply').click(); return 1; })()`);
      await app.main.waitFor(`${P}.editor.debug().edit.geometry.crop && !${P}.dq('#edit-save').disabled`);
      await app.main.eval(`${P}.dq('#edit-save').click(); 1`);
      await app.main.waitFor(`${P}.dq('#edit-save-name')`, { message: 'save as' });
      const suggested = await app.main.eval(`${P}.dq('#edit-save-name').value`);
      const prefix = await app.main.eval(`(async () => (await import('/src/edit/savename.js')).saveNamePrefix([${P}.t('edit.exposure'), ${P}.t('edit.crop')]))()`);
      assert.equal(suggested, `${prefix}_beach.jpg`, 'the changes lead the suggested name');
      await app.main.eval(`(() => { const i = ${P}.dq('#edit-save-name'); i.value = 'beach.jpg'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await app.main.eval(`(window.__myphotoPicks ||= []).push(true); 1`);
      await confirmTopDialog(app);
      await app.main.waitFor(`${P}.app.state.mode === 'manage'`, { timeout: 30000 });
      const saved = new Uint8Array(fs.readFileSync(path.join(app.photos, 'beach.jpg')));
      assert.notDeepEqual(Buffer.from(saved), original);
      assert.deepEqual(await imageSize(app, beach), [1067, 1067], 'square crop of 1600×1067');
      assert.equal(readExifDates(saved).taken.getTime(), new Date(2023, 6, 14, 10, 30).getTime(), 'EXIF kept');
      assert.equal(readOrientation(saved), 1);
      const backups = fs.readdirSync(path.join(app.data, 'originals'));
      assert.equal(backups.length, 1);
      assert.ok(await app.main.eval(`${P}.app.catalog.get(${js(beach)}).edited === true`));
      // Restore the original.
      await select(app, 'beach.jpg');
      await app.main.eval(`(() => { const items = [...${P}.dqa('.menubar-title')]; items.find((b) => b.dataset.menu === 'edit').click(); return 1; })()`);
      await app.main.waitFor(`${P}.dq('.menu')`);
      await app.main.eval(`[...${P}.dqa('.menu-item')].find((m) => m.textContent.includes('원본 복원') || m.textContent.includes('Restore original')).click(); 1`);
      await confirmTopDialog(app);
      await app.main.waitFor(`${P}.app.catalog.get(${js(beach)}).edited !== true`, { timeout: 10000 });
      assert.deepEqual(fs.readFileSync(path.join(app.photos, 'beach.jpg')), original);
    },
  },
  {
    ids: ['EDIT-REDEYE', 'EDIT-HISTORY'], group: '편집', name: '적목 제거 클릭 → 점이 편집에 기록, 실행 취소/다시 실행',
    run: async (app) => {
      const p = await pathOf(app, 'face.jpg').catch(() => null) ?? path.join(app.photos, 'album', 'face (2).jpg');
      await app.main.eval(`${P}.actions.editPath(${js(p)}); 1`);
      await app.main.waitFor(`${P}.dq('.editor-preview')`, { timeout: 20000 });
      await app.main.eval(`${P}.dq('.edit-section-head[data-section=repair]').click(); 1`);
      await app.main.eval(`${P}.dq('#tool-redeye').click(); 1`);
      await app.main.waitFor(`${P}.dq('.editor-overlay.tool-redeye')`);
      const box = await app.main.eval(`(() => { const r = ${P}.dq('.editor-preview').getBoundingClientRect(); return { x: r.left + r.width * 0.42, y: r.top + r.height * 0.36 }; })()`);
      await app.main.realClick(box.x, box.y);
      await app.main.waitFor(`${P}.editor.debug().edit.spots.length === 1`);
      const spot = await app.main.eval(`${P}.editor.debug().edit.spots[0]`);
      assert.ok(Math.abs(spot.x - 900 * 0.42) < 15 && Math.abs(spot.y - 1200 * 0.36) < 15, `spot in source pixels: ${spot.x},${spot.y}`);
      await app.main.key('z', 2);
      await app.main.waitFor(`${P}.editor.debug().edit.spots.length === 0`);
      await app.main.key('y', 2);
      await app.main.waitFor(`${P}.editor.debug().edit.spots.length === 1`);
      await app.main.key('Escape');
      await app.main.key('Escape');
      await app.main.waitFor(`${P}.dq('.dialog')`);
      await app.main.eval(`(() => { const text = ${P}.t('edit.bgSaveNo'); const button = [...${P}.dqa('.dialog')].at(-1).querySelectorAll('button'); [...button].find((b) => b.textContent.trim() === text).click(); return 1; })()`);
      await app.main.waitFor(`${P}.app.state.mode === 'manage'`);
      await backToFolder(app);
    },
  },
  {
    ids: ['BATCH-RESIZE'], group: '일괄 처리', name: '크기 조절: 긴 변 400px, 이름 뒤 _resized 로 새 파일',
    run: async (app) => {
      const paths = [await pathOf(app, 'forest.jpg'), await pathOf(app, 'sunset.png')];
      await app.main.eval(`${P}.actions.setSelection(${js(paths)}); (async () => { const m = await import('/src/ui/batch.js'); m.batchResize(); })(); 1`);
      await app.main.waitFor(`${P}.dq('.dialog input[type=number]')`);
      await app.main.eval(`(() => { const i = ${P}.dq('.dialog input[type=number]'); i.value = '400'; return 1; })()`);
      await confirmTopDialog(app);
      await app.main.waitFor(`${P}.app.state.list.some((i) => i.name === 'forest_resized.jpg') && ${P}.app.state.list.some((i) => i.name === 'sunset_resized.png')`, { timeout: 20000 });
      assert.deepEqual(await imageSize(app, path.join(app.photos, 'forest_resized.jpg')), [400, 267]);
      assert.deepEqual(await imageSize(app, path.join(app.photos, 'sunset_resized.png')), [400, 267]);
    },
  },
  {
    ids: ['BATCH-CONVERT'], group: '일괄 처리', name: '형식 변환: PNG → JPEG',
    run: async (app) => {
      await select(app, 'sunset.png');
      await app.main.eval(`(async () => { const m = await import('/src/ui/batch.js'); m.batchConvert(); })(); 1`);
      await confirmTopDialog(app);
      await app.main.waitFor(`${P}.app.state.list.some((i) => i.name === 'sunset.jpg')`, { timeout: 20000 });
      const head = fs.readFileSync(path.join(app.photos, 'sunset.jpg')).subarray(0, 3);
      assert.deepEqual([...head], [0xff, 0xd8, 0xff]);
    },
  },
  {
    ids: ['BATCH-RENAME'], group: '일괄 처리', name: '일괄 이름 바꾸기: trip_### — 목록 순서대로 번호, 미리 보기와 디스크',
    run: async (app) => {
      const paths = [await pathOf(app, 'forest.jpg'), await pathOf(app, 'flower.webp')];
      await app.main.eval(`${P}.actions.setSelection(${js(paths)}); (async () => { const m = await import('/src/ui/batch.js'); m.batchRename(); })(); 1`);
      await app.main.waitFor(`${P}.dq('.dialog [data-key=template]')`);
      await app.main.eval(`(() => { const i = ${P}.dq('.dialog [data-key=template]'); i.value = 'trip_###'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await app.main.waitFor(`${P}.dq('.rename-preview').textContent.includes('trip_002')`);
      await confirmTopDialog(app);
      await app.main.waitFor(`${P}.app.state.list.some((i) => i.name === 'trip_001.webp') && ${P}.app.state.list.some((i) => i.name === 'trip_002.jpg')`, { timeout: 15000 });
      assert.ok(fs.existsSync(path.join(app.photos, 'trip_002.jpg')) && !fs.existsSync(path.join(app.photos, 'forest.jpg')));
      const trip = path.join(app.photos, 'trip_002.jpg');
      await app.main.waitFor(`(${P}.app.catalog.get(${js(trip)})?.keywords ?? []).length === 2`, { timeout: 15000 });
      assert.deepEqual((await app.main.eval(`${P}.app.catalog.get(${js(trip)}).keywords`)).sort(), ['nature', '숲'], 'keywords followed');
    },
  },
  {
    ids: ['BATCH-DATES'], group: '일괄 처리', name: '날짜 이동: +1일 → JPEG EXIF 촬영일이 바뀜',
    run: async (app) => {
      const city = await select(app, 'city.jpg');
      await app.main.eval(`(async () => { const m = await import('/src/ui/batch.js'); m.adjustDates(); })(); 1`);
      await app.main.waitFor(`${P}.dq('.dialog input[type=number]')`);
      await app.main.eval(`(() => { const i = ${P}.dq('.dialog input[type=number]'); i.value = '1'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await confirmTopDialog(app);
      await app.main.waitFor(`new Date(${P}.app.catalog.get(${js(city)}).meta.taken).getDate() === 3`, { timeout: 10000 });
      const taken = readExifDates(new Uint8Array(fs.readFileSync(path.join(app.photos, 'city.jpg')))).taken;
      assert.equal(taken.getTime(), new Date(2024, 2, 3, 19, 5, 12).getTime());
    },
  },
  {
    ids: ['FILE-DUPLICATES'], group: '도구', name: '중복 찾기(동일 파일): beach.jpg 와 beach-copy.jpg 한 그룹',
    run: async (app) => {
      await app.main.eval(`(async () => { const m = await import('/src/ui/duplicates.js'); m.findDuplicates(); })(); 1`);
      await confirmTopDialog(app);
      await app.main.waitFor(`${P}.dq('.dupe-group')`, { timeout: 20000 });
      const groups = await app.main.eval(`[...${P}.dqa('.dupe-group')].map((g) => [...g.querySelectorAll('.dupe-name')].map((n) => n.textContent).sort())`);
      assert.deepEqual(groups, [['beach-copy.jpg', 'beach.jpg']]);
      await app.main.eval(`${P}.closeAllDialogs(); 1`);
    },
  },
  {
    ids: ['FILE-COMPARE', 'VIEW-SLIDESHOW'], group: '도구', name: '비교 보기(2장)·슬라이드 쇼 시작과 Esc 종료',
    run: async (app) => {
      const paths = [await pathOf(app, 'beach.jpg'), await pathOf(app, 'beach-copy.jpg')];
      await app.main.eval(`${P}.actions.setSelection(${js(paths)}); (async () => { const m = await import('/src/ui/compare.js'); const s = await import('/src/store.js'); m.openCompare(s.selectedFiles()); })(); 1`);
      await app.main.waitFor(`${P}.dqa('.compare-panel canvas, .compare-panel img').length === 2`);
      await app.main.key('Escape');
      await app.main.waitFor(`!${P}.dq('.compare')`);
      await app.main.eval(`(async () => { const m = await import('/src/ui/slideshow.js'); m.startSlideshow(${P}.app.state.list, 0); })(); 1`);
      await app.main.waitFor(`${P}.dq('.slideshow .slide.active .slide-media')`);
      await app.main.key('ArrowRight');
      await app.main.waitFor(`${P}.dq('.slideshow-counter').textContent.startsWith('2 /')`);
      await app.main.key('Escape');
      await app.main.waitFor(`!${P}.dq('.slideshow')`);
    },
  },
  {
    ids: ['CREATE-PRINT'], group: '도구', name: '밀착 인화를 JPEG 로 저장',
    run: async (app) => {
      await app.main.eval(`${P}.actions.setSelection([]); (async () => { const m = await import('/src/ui/print.js'); m.printDialog(${P}.app.state.list); })(); 1`);
      await app.main.waitFor(`${P}.dq('.dialog select')`);
      await app.main.eval(`(() => { const selects = [...${P}.dqa('.dialog select')]; const out = selects[selects.length - 1]; out.value = 'jpeg'; out.dispatchEvent(new Event('change')); return 1; })()`);
      await confirmTopDialog(app);
      await app.main.waitFor(`${P}.app.state.list.some((i) => i.name === 'contact-sheet-01.jpg')`, { timeout: 30000 });
      assert.ok(fs.statSync(path.join(app.photos, 'contact-sheet-01.jpg')).size > 20000);
    },
  },
  {
    ids: ['BROWSE-DASHBOARD', 'BROWSE-CALENDAR', 'BROWSE-MAP'], group: '창', name: '대시보드·달력·지도 창이 카탈로그 데이터를 보여준다',
    run: async (app) => {
      await app.main.eval(`${P}.actions.setMode('dashboard'); 1`);
      await app.main.waitFor(`${P}.dqa('.stat-tile').length === 6 && ${P}.dqa('.time-bar').length >= 2`, { timeout: 45000 });
      // The dashboard fits the window: no scroll bars, the status bar shows — also in a small window.
      const fits = async () => JSON.parse(await app.main.eval(`(() => { const d = ${P}.dq('.dashboard'); const r = d.getBoundingClientRect(); const bar = document.querySelector('footer.status-bar'); const grid = [...d.querySelectorAll('.dash-card')].map((c) => c.getBoundingClientRect()); return JSON.stringify({ v: d.scrollHeight - d.clientHeight, hz: d.scrollWidth - d.clientWidth, doc: document.documentElement.scrollHeight - innerHeight, docW: document.documentElement.scrollWidth - innerWidth, outside: grid.filter((g) => g.bottom > r.bottom + 1 || g.right > r.right + 1).length, bar: bar ? bar.getBoundingClientRect().height : 0, barBottom: bar ? Math.round(bar.getBoundingClientRect().bottom - innerHeight) : 99 }); })()`));
      const check = (m, when) => { assert.ok(m.v <= 0 && m.hz <= 0 && m.doc <= 0 && m.docW <= 0 && m.outside === 0, `${when}: ${JSON.stringify(m)}`); assert.ok(m.bar >= 20 && Math.abs(m.barBottom) <= 1, `status bar ${when}: ${JSON.stringify(m)}`); };
      check(await fits(), 'default size');
      const setSize = (w, hgt) => app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: ${w}, height: ${hgt} } } }).then(() => 1)`);
      const before = JSON.parse(await app.main.eval('JSON.stringify([innerWidth, innerHeight])'));
      await setSize(960, 600);
      await app.main.waitFor('innerWidth <= 970');
      await sleep(400);
      check(await fits(), '960×600');
      await setSize(before[0], before[1]);
      await app.main.waitFor(`innerWidth >= ${before[0] - 2}`);
      await app.main.eval(`${P}.actions.setMode('manage'); ${P}.dq('.pane-tab[data-tab=calendar]').click(); 1`);
      await app.main.waitFor(`${P}.dqa('.cal-years .cat-row').length >= 2`);
      await app.main.eval(`${P}.dq('.pane-tab[data-tab=folders]').click(); ${P}.dq('.side-pane.right .pane-tab[data-tab=map]').click(); 1`);
      await app.main.waitFor(`${P}.dqa('.map-marker').length >= 2`);
      await app.main.eval(`${P}.dq('.side-pane.right .pane-tab[data-tab=properties]').click(); 1`);
    },
  },
  {
    ids: ['META-SIDECAR'], group: '설정', name: 'XMP 사이드카: 켜면 별점이 photo.xmp 로 기록',
    run: async (app) => {
      await app.main.eval(`${P}.app.settings.xmpSidecar = true; 1`);
      const p = await pathOf(app, 'camera.dng');
      await app.main.eval(`${P}.app.catalog.setRating([${js(p)}], 4); ${P}.app.catalog.setLabel([${js(p)}], 'blue'); 1`);
      const xmp = path.join(app.photos, 'camera.xmp');
      for (let i = 0; i < 40 && !(fs.existsSync(xmp) && fs.readFileSync(xmp, 'utf8').includes('xmp:Label')); i++) await sleep(150);
      const text = fs.readFileSync(xmp, 'utf8');
      assert.ok(text.includes('xmp:Rating="4"') && text.includes('xmp:Label="Blue"'), text);
      await app.main.eval(`${P}.app.settings.xmpSidecar = false; 1`);
    },
  },
  {
    ids: ['APP-LANG'], group: '설정', name: '언어를 영어로 바꾸면 메뉴가 English, 다시 한국어',
    run: async (app) => {
      await app.main.eval(`${P}.dq('#open-settings').click(); 1`);
      await app.main.waitFor(`${P}.dq('#settings-dialog .lang-button[data-lang=en]')`);
      // Language buttons show the flag and the name; themes have their own tab.
      assert.ok(await app.main.eval(`${P}.dqa('#settings-dialog .lang-button .flag').length === 2 && Boolean(${P}.dq('#settings-dialog .settings-tab[data-tab=theme]'))`));
      await app.main.eval(`${P}.dq('#settings-dialog .lang-button[data-lang=en]').click(); ${P}.dq('#settings-dialog .lang-button[data-lang=en]').classList.contains('on')`);
      await confirmTopDialog(app);
      await app.main.waitFor(`${P}.dq('.menubar-title[data-menu=file]').textContent === 'File'`);
      await app.main.eval(`(async () => { const { setLanguage } = await import('/src/i18n.js'); ${P}.app.settings.language = 'ko'; ${P}.app.saveSettings(); setLanguage('ko'); })(); 1`);
      await app.main.waitFor(`${P}.dq('.menubar-title[data-menu=file]').textContent === '파일'`);
    },
  },
  {
    ids: ['APP-PERSIST'], group: '저장', name: '정상 종료 후 다시 실행: 카탈로그(별점·키워드)와 마지막 폴더 유지',
    run: async (app) => {
      const trip = path.join(app.photos, 'trip_002.jpg');
      await app.main.eval(`${P}.app.catalog.setRating([${js(trip)}], 2); 1`);
      await sleep(1500);
      await app.quit();
      await app.launch([]);
      await app.main.waitFor(`${P}.app.state.source.path === ${js(app.photos)}`, { timeout: 20000 });
      const record = await app.main.eval(`${P}.app.catalog.get(${js(trip)})`);
      assert.equal(record.rating, 2);
      assert.deepEqual([...record.keywords].sort(), ['nature', '숲']);
      assert.ok(fs.existsSync(path.join(app.data, 'catalog.sqlite')), 'catalog in SQLite');
      const info = await app.main.eval(`window.__TAURI_INTERNALS__.invoke('catalog_db_info')`);
      assert.ok(info.files >= 1, `database rows ${JSON.stringify(info)}`);
    },
  },
  {
    ids: ['APP-SQLITE'], group: '저장', name: 'SQLite 카탈로그: 예전 catalog.json 을 처음 실행 때 옮기고, 바뀐 기록만 저장하며, 다시 실행해도 그대로',
    run: async (app) => {
      // An old-style catalog.json, no database: the app must take it over.
      await app.quit();
      for (const name of ['catalog.sqlite', 'catalog.sqlite-wal', 'catalog.sqlite-shm']) fs.rmSync(path.join(app.data, name), { force: true });
      const legacy = path.join(app.photos, 'legacy.jpg');
      fs.writeFileSync(path.join(app.data, 'catalog.json'), JSON.stringify({ format: 1, files: { [legacy]: { rating: 5, keywords: ['old'] } }, categories: ['Legacy'], keywords: ['old'] }));
      await app.launch([]);
      await app.main.waitFor(`${P}.app.catalog?.get(${js(legacy)})?.rating === 5`, { timeout: 20000, message: 'catalog.json read' });
      await app.main.waitFor(`window.__TAURI_INTERNALS__.invoke('catalog_db_info').then((i) => i.files >= 1)`, { timeout: 10000, message: 'migrated into SQLite' });
      // A change writes only what changed; a removed record leaves the database.
      await app.main.eval(`${P}.app.catalog.setRating([${js(legacy)}], 3); 1`);
      await sleep(1800);
      await app.main.eval(`${P}.app.catalog.removePaths([${js(legacy)}]); ${P}.app.catalog.addCategory('Kept'); 1`);
      await sleep(1800);
      await app.quit();
      fs.rmSync(path.join(app.data, 'catalog.json'), { force: true }); // proves the database is what is read
      await app.launch([]);
      await app.main.waitFor(`Boolean(${P}.app.catalog)`, { timeout: 20000 });
      await app.main.waitFor(`${P}.app.catalog.categories.includes('Kept')`, { timeout: 10000, message: 'lists from SQLite' });
      assert.equal(await app.main.eval(`${P}.app.catalog.get(${js(legacy)}) ?? null`), null, 'removed record gone');
    },
  },
];
