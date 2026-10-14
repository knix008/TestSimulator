// Web E2E: the production web build in headless Edge / Chrome.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from './cdp.mjs';
import { fixtures, root } from './harness.mjs';

const P = 'window.__myphoto';
const js = (value) => JSON.stringify(value);

export const cases = [
  {
    ids: ['APP-WEB'], group: '시작', name: '첫 화면: 폴더 열기·사진 열기·예제 사진 버튼, 서비스 워커·매니페스트',
    run: async (app) => {
      for (const id of ['#welcome-open-folder', '#welcome-open-files', '#welcome-samples']) assert.ok(await app.main.eval(`Boolean(document.querySelector('${id}'))`), id);
      const manifest = await app.main.eval(`fetch('./manifest.webmanifest').then((r) => r.json())`);
      assert.equal(manifest.name, 'MyPhotoManager');
      assert.ok(manifest.icons.some((i) => i.sizes === '512x512'));
      await app.main.waitFor(`navigator.serviceWorker.getRegistration().then((r) => Boolean(r))`, { timeout: 15000 });
    },
  },
  {
    ids: ['APP-WEB', 'META-EXIF'], group: '열기', name: '예제 사진: 6장, 썸네일과 EXIF(카메라·GPS)',
    run: async (app) => {
      await app.main.click('#welcome-samples');
      await app.main.waitFor(`${P}.app.state.list.length === 6`);
      await app.main.waitFor(`document.querySelectorAll('.tile .tile-img').length === 6`, { timeout: 30000 });
      await app.main.waitFor(`[...${P}.app.catalog.files.values()].filter((r) => r.meta?.lat != null).length === 3`, { timeout: 15000 });
      const city = await app.main.eval(`[...${P}.app.catalog.files.entries()].find(([p]) => p.endsWith('city.jpg'))[1]`);
      assert.equal(city.meta.camera, 'Nikon D850');
      assert.deepEqual([city.width, city.height], [1067, 1600]);
    },
  },
  {
    ids: ['APP-WEB', 'FMT-HEIC', 'FMT-TIFF', 'FMT-PSD', 'FMT-RAW'], group: '열기', name: '파일 선택 창으로 사진 열기 (HEIC·TIFF·PSD·DNG 포함)',
    run: async (app) => {
      await app.main.send('Page.setInterceptFileChooserDialog', { enabled: true });
      const chosen = new Promise((resolve) => app.main.on('Page.fileChooserOpened', resolve));
      await app.main.eval(`document.querySelector('.folder-actions .btn:last-child').click(); 1`);
      const { backendNodeId } = await chosen;
      const files = ['phone.heic', 'scan.tif', 'artwork.psd', 'camera.dng', 'icon.bmp'].map((name) => path.join(fixtures, name)).filter((file) => fs.existsSync(file));
      await app.main.send('DOM.setFileInputFiles', { files, backendNodeId });
      await app.main.send('Page.setInterceptFileChooserDialog', { enabled: false });
      await app.main.waitFor(`${P}.app.state.list.length === ${files.length}`);
      await app.main.waitFor(`${P}.app.state.list.every((i) => ${P}.thumbs.peek(i)?.url)`, { timeout: 60000, message: 'thumbnails of HEIC/TIFF/PSD/DNG/BMP' });
    },
  },
  {
    ids: ['ORG-RATING', 'ORG-LABEL', 'ORG-KEYWORDS', 'APP-PERSIST'], group: '정리', name: '별점·레이블·키워드 — 새로 고침 후에도 카탈로그(IndexedDB)에 남는다',
    run: async (app) => {
      const first = await app.main.eval(`${P}.app.state.list[0].path`);
      await app.main.eval(`${P}.actions.selectItem(${js(first)}); document.querySelector('.filelist').focus(); 1`);
      await app.main.key('4', 2);
      await app.main.eval(`${P}.app.catalog.addKeywords([${js(first)}], ['web']); 1`);
      await app.main.waitFor(`${P}.app.catalog.get(${js(first)}).rating === 4`);
      await sleep(1600); // debounced save
      await app.reload();
      assert.equal(await app.main.eval(`${P}.app.catalog.get(${js(first)})?.rating`), 4);
      assert.deepEqual(await app.main.eval(`${P}.app.catalog.get(${js(first)})?.keywords`), ['web']);
    },
  },
  {
    ids: ['VIEW-NAV', 'VIEW-INFO'], group: '보기', name: '보기 모드: 이동·확대·정보 오버레이·히스토그램',
    run: async (app) => {
      await app.main.eval(`${P}.actions.openSamples(); 1`);
      await app.main.waitFor(`${P}.app.state.list.length === 6`);
      const beach = await app.main.eval(`${P}.app.state.list.find((i) => i.name === 'beach.jpg').path`);
      await app.main.eval(`${P}.actions.viewItem(${js(beach)}); 1`);
      await app.main.waitFor(`document.querySelector('.viewer-holder img.viewer-media:not(.placeholder)')`);
      await app.main.key('i');
      await app.main.key('h');
      await app.main.waitFor(`!document.querySelector('.viewer-info').hidden && document.querySelector('.viewer-info').textContent.includes('Canon EOS R5')`);
      await app.main.key('ArrowRight');
      await app.main.waitFor(`!${P}.viewer.currentPath.endsWith('beach.jpg')`);
      await app.main.key('i');
      await app.main.key('h');
      await app.main.key('Escape');
      await app.main.waitFor(`${P}.app.state.mode === 'manage'`);
    },
  },
  {
    ids: ['EDIT-EFFECTS', 'EDIT-TEXT', 'EDIT-HISTORY'], group: '편집', name: '편집: 흑백 효과 + 테두리 미리 보기, 실행 취소',
    run: async (app) => {
      const flower = await app.main.eval(`${P}.app.state.list.find((i) => i.name === 'flower.webp').path`);
      await app.main.eval(`${P}.actions.editPath(${js(flower)}); 1`);
      await app.main.waitFor(`document.querySelector('.editor-preview')`, { timeout: 20000 });
      await app.main.eval(`document.querySelector('.edit-section-head[data-section=effects]').click(); 1`);
      await app.main.eval(`(() => { const s = document.querySelector('.edit-section select'); s.value = 'grayscale'; s.dispatchEvent(new Event('change')); return 1; })()`);
      await app.main.waitFor(`(() => { const c = document.querySelector('.editor-preview'); const d = c.getContext('2d').getImageData(c.width / 2 - 100, c.height / 2 - 150, 1, 1).data; return d[0] === d[1] && d[1] === d[2]; })()`);
      await app.main.key('z', 2);
      await app.main.waitFor(`${P}.editor.debug().edit.adjust.effect === 'none'`);
      await app.main.eval(`document.querySelector('#edit-cancel').click(); 1`);
      await app.main.waitFor(`${P}.app.state.mode === 'manage'`);
    },
  },
  {
    ids: ['APP-LANG'], group: '보기 방식', name: '영어로 전환하면 메뉴가 바뀌고 좁은 창(1000px)에서도 툴바가 넘치지 않는다',
    run: async (app) => {
      await app.main.eval(`${P}.app.settings.language = 'en'; ${P}.app.saveSettings(); 1`);
      await app.reload();
      await app.main.waitFor(`document.querySelector('.menubar-title[data-menu=file]').textContent === 'File'`);
      await app.main.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false });
      await sleep(300);
      const overflow = await app.main.eval(`document.querySelector('.app-header').scrollWidth <= document.querySelector('.app-header').clientWidth + 1`);
      await app.main.send('Emulation.clearDeviceMetricsOverride');
      assert.ok(overflow, 'header fits');
    },
  },
  {
    ids: ['APP-WEB', 'FMT-EXTRA', 'FMT-ICO', 'FMT-SVG', 'FMT-JP2', 'FMT-JXL', 'FMT-AVIF', 'FMT-PDF', 'FMT-GIF', 'FMT-TIFFPAGES', 'FMT-VIDEO', 'FMT-RAW'],
    group: '형식', name: '웹 빌드도 모든 추가 형식의 썸네일을 만든다 (JPEG 2000·JPEG XL·PDF·미리 보기 없는 DNG 포함)',
    run: async (app) => {
      const files = fs.readdirSync(formats).filter((n) => !n.endsWith('.zip')).map((n) => path.join(formats, n));
      await openFiles(app, files);
      await app.main.waitFor(`${P}.app.state.list.length === ${files.length}`);
      await app.main.waitFor(`${P}.app.state.list.every((i) => { const e = ${P}.thumbs.peek(i); return e && (e.url || e.error); })`, { timeout: 180000, message: 'thumbnails' });
      const failed = await app.main.eval(`${P}.app.state.list.map((i) => [i.name, ${P}.thumbs.peek(i)]).filter(([, e]) => !e.url || !e.width).map(([n, e]) => n + ': ' + (e.error ?? e.width + 'x' + e.height))`);
      assert.deepEqual(failed, []);
    },
  },
  {
    ids: ['APP-WEB', 'EDIT-RAW'], group: '편집', name: '웹에서 RAW 현상: Bayer DNG 를 LibRaw 로 열어 편집',
    run: async (app) => {
      const dng = await app.main.eval(`${P}.app.state.list.find((i) => i.name === 'sensor.dng')?.path`);
      assert.ok(dng, 'sensor.dng opened');
      await app.main.eval(`${P}.actions.editPath(${js(dng)}); 1`);
      await app.main.waitFor(`${P}.editor.debug().rawMode === 'camera' && ${P}.editor.debug().full?.w >= 300`, { timeout: 60000, message: 'developed' });
      await app.main.eval(`${P}.editor.testing.goToHistory(0); ${P}.actions.setMode('manage'); 1`);
    },
  },
  {
    ids: ['APP-WEB', 'BROWSE-ZIP'], group: '탐색', name: '웹에서 ZIP 보관함을 폴더처럼 열기',
    run: async (app) => {
      await openFiles(app, [path.join(formats, 'album.zip')]);
      await app.main.waitFor(`${P}.app.state.list.some((i) => i.name === 'album.zip')`);
      await app.main.eval(`${P}.actions.viewItem(${P}.app.state.list.find((i) => i.name === 'album.zip').path); 1`);
      await app.main.waitFor(`${P}.app.state.source.path?.includes('album') && ${P}.app.state.list.length > 0`, { message: 'archive opened' });
      const zipped = await app.main.eval(`${P}.app.state.list.find((i) => i.name === 'zipped')?.path ?? null`);
      if (zipped) await app.main.eval(`${P}.actions.openFolder(${js(zipped)}); 1`);
      await app.main.waitFor(`${P}.app.state.list.filter((i) => i.name.endsWith('.jpg')).length === 3`);
    },
  },
  {
    ids: ['APP-WEB', 'CREATE-PDF', 'CREATE-ZIP'], group: '만들기', name: '웹에서 PDF·ZIP 만들기 → 내려받기 파일 확인',
    run: async (app) => {
      const downloads = fs.mkdtempSync(path.join(app.profile, 'downloads-'));
      await app.main.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
      await app.main.eval(`${P}.actions.openSamples(); 1`);
      await app.main.waitFor(`${P}.app.state.list.length === 6`);
      const paths = await app.main.eval(`${P}.app.state.list.filter((i) => /\\.jpg$/.test(i.name)).slice(0, 2).map((i) => i.path)`);
      await app.main.eval(`${P}.actions.setSelection(${js(paths)}, ${js(paths[0])}); 1`);
      for (const [key, check] of [['create.pdf', (b) => /^%PDF-/.test(b.toString('latin1', 0, 5)) && /\/Count 2/.test(b.toString('latin1'))], ['create.zip', (b) => b.readUInt32LE(0) === 0x04034b50]]) {
        const before = fs.readdirSync(downloads);
        await app.main.eval(`${P}.menu('create', ${js(key)}); 1`);
        await app.main.waitFor(`Boolean(document.querySelector('.dialog .dialog-buttons .btn.primary'))`);
        await app.main.eval(`[...document.querySelectorAll('.dialog')].pop().querySelector('.dialog-buttons .btn.primary').click(); 1`);
        let added = [];
        for (let i = 0; i < 100 && !added.length; i++) { await sleep(200); added = fs.readdirSync(downloads).filter((n) => !before.includes(n) && !n.endsWith('.crdownload')); }
        assert.equal(added.length, 1, `${key} downloaded`);
        assert.ok(check(fs.readFileSync(path.join(downloads, added[0]))), `${key}: ${added[0]}`);
      }
    },
  },
];

const formats = path.join(root, 'test', 'fixtures', 'formats');

async function openFiles(app, files) {
  await app.main.eval(`${P}.closeAllDialogs(); ${P}.actions.setMode('manage'); 1`);
  await app.main.send('Page.setInterceptFileChooserDialog', { enabled: true });
  const chosen = new Promise((resolve) => app.main.on('Page.fileChooserOpened', resolve));
  await app.main.eval(`${P}.menu('file', 'web.openFiles'); 1`);
  const { backendNodeId } = await chosen;
  await app.main.send('DOM.setFileInputFiles', { files, backendNodeId });
  await app.main.send('Page.setInterceptFileChooserDialog', { enabled: false });
}

export { root };
