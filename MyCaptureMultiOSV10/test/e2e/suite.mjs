// End-to-end cases against the running app. Each case gets the started `App`
// (see harness.mjs) and throws on failure. Files go to a temporary folder.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MAGIC = {
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8,
  png: (b) => b.subarray(1, 4).toString() === 'PNG',
  gif: (b) => b.subarray(0, 4).toString() === 'GIF8',
  tiff: (b) => ['II*\0', 'MM\0*'].includes(b.subarray(0, 4).toString('latin1')),
  bmp: (b) => b.subarray(0, 2).toString() === 'BM',
  webp: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
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

const pngSize = (bytes) => [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];

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

const SETTINGS_TABS = ['general', 'capture', 'record', 'mic', 'save', 'theme'];

export const cases = [
  {
    name: '앱 시작 · 디스플레이 목록과 미리보기',
    run: async (app) => {
      await app.reset({ mode: 'capture', target: 'monitor', monitorId: null });
      const monitors = await app.main.eval(`document.querySelectorAll('.item[data-action="monitor"]').length`);
      assert.ok(monitors >= 2, `expected "all screens" + at least one display, got ${monitors}`);
      await app.main.waitFor(`document.querySelector('#preview-still img')?.naturalWidth > 0`, { message: 'preview image' });
      assert.deepEqual(JSON.parse(await app.main.eval(`JSON.stringify([...document.querySelectorAll('.brand span')].map((span) => span.textContent.trim()))`)), ['MyCapture', 'v1.0'], 'name and version in the title bar');
      assert.equal(await app.main.eval(`document.title`), 'MyCapture v1.0');
    },
  },
  {
    name: '메인 창은 화면 캡처에서 제외됨 (content protection)',
    run: async (app) => {
      if (process.platform !== 'win32') return;
      const script = `Add-Type 'using System;using System.Runtime.InteropServices;public static class A{[DllImport("user32.dll")]public static extern bool GetWindowDisplayAffinity(IntPtr h,out uint a);}';$p=Get-Process -Id ${app.process.pid};$a=0;[void][A]::GetWindowDisplayAffinity($p.MainWindowHandle,[ref]$a);$a`;
      const affinity = execFileSync('powershell.exe', ['-NoProfile', '-Command', script]).toString().trim();
      assert.equal(affinity, '17', 'WDA_EXCLUDEFROMCAPTURE (0x11) expected');
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
  ...['png', 'gif', 'tiff', 'bmp', 'webp'].map((format) => ({
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
          const fits = await settings.eval(`(() => { const b = document.querySelector('.modal-body'); return b.scrollHeight <= b.clientHeight && [...b.children].every((child) => child.getBoundingClientRect().bottom <= b.getBoundingClientRect().bottom + 0.5); })()`);
          assert.ok(fits, `${language}/${tab} overflows`);
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
      await app.main.click('#sources .rail');
      assert.ok(await app.main.eval(`!document.querySelector('#body').classList.contains('left-collapsed') && document.querySelector('#sources h2 svg')`));
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
      const items = Array.from({ length: 30 }, (_, index) => ({ id: `t${index}`, kind: index % 3 ? 'image' : 'video', path: `${file}?${index}`, width: 10, height: 10, durationMs: 1000 }));
      await app.main.eval(`localStorage.setItem('mycapture.gallery.v1', ${JSON.stringify(JSON.stringify(items))}); 1`);
      await app.reset({ mode: 'capture', historyCollapsed: false }, { keepGallery: true });
      await app.main.waitFor(`document.querySelectorAll('#history .tile').length === 30`);
      const scroll = JSON.parse(await app.main.eval(`(() => { const list = document.querySelector('.history-list'); list.scrollTop = 400; return JSON.stringify({ overflow: list.scrollHeight > list.clientHeight, top: list.scrollTop, clear: document.querySelector('[data-action="gallery-clear"]').getBoundingClientRect().bottom <= list.getBoundingClientRect().top + 1 }); })()`));
      assert.deepEqual(scroll, { overflow: true, top: 400, clear: true }, 'list scrolls, "delete all" stays above it');
      await app.main.click('#history [data-action="history-panel"]');
      const rail = JSON.parse(await app.main.eval(`JSON.stringify({ collapsed: document.querySelector('#body').classList.contains('right-collapsed'), width: Math.round(document.querySelector('#history').getBoundingClientRect().width), icon: Boolean(document.querySelector('#history .rail .rail-icon')), title: document.querySelector('#history .rail-title')?.textContent ?? '' })`));
      assert.equal(rail.collapsed, true);
      assert.ok(rail.width <= 60, `collapsed width ${rail.width}`);
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
    name: '캡처 기록 · 다시 열어도 유지, 사라진 파일은 표시',
    run: async (app) => {
      await app.reset({ mode: 'capture', target: 'monitor', monitorId: null, imageFormat: 'png' });
      await capture(app);
      const { file } = checkFile(app, 'png');
      await app.reset({ mode: 'capture' }, { keepGallery: true });
      await app.main.waitFor(`document.querySelectorAll('.tile').length === 1`, { message: 'history survives a restart' });
      fs.rmSync(file);
      await app.reset({ mode: 'capture' }, { keepGallery: true });
      await app.main.waitFor(`document.querySelector('.tile.missing')`, { message: 'missing file is marked' });
      await app.main.click('.tile [data-action="gallery-delete"]');
      await app.main.waitFor(`document.querySelectorAll('.tile').length === 0`);
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
      // Text fields keep their own cut / copy / paste menu.
      await app.main.click('[data-action="target"][data-value="window"]');
      await app.main.eval(`window.__menuEvents = []; 1`);
      await rightClick('[data-input="windowFilter"]');
      await sleep(300);
      assert.deepEqual(JSON.parse(await app.main.eval(`JSON.stringify(window.__menuEvents)`)), [false], 'search box: native menu');
      await app.main.key('Escape');
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
      assert.ok(await settings.eval(`document.querySelectorAll('.tab').length === 6`), 'and still works there');
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
