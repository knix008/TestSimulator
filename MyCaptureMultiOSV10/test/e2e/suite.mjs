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

export const cases = [
  {
    name: '앱 시작 · 디스플레이 목록과 미리보기',
    run: async (app) => {
      await app.reset({ mode: 'capture', target: 'monitor', monitorId: null });
      const monitors = await app.main.eval(`document.querySelectorAll('.item[data-action="monitor"]').length`);
      assert.ok(monitors >= 2, `expected "all screens" + at least one display, got ${monitors}`);
      await app.main.waitFor(`document.querySelector('#preview-still img')?.naturalWidth > 0`, { message: 'preview image' });
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
    name: '마이크 탭 · 레벨 미터 · 테스트 녹음',
    run: async (app) => {
      await app.reset({ mode: 'record' });
      await app.main.click('[data-action="open-mic"]');
      await app.main.waitFor(`document.querySelector('.tab.active')?.dataset.value === 'mic'`);
      await app.main.waitFor(`document.querySelector('[data-select="micDeviceId"]').options.length >= 1 && !window.__mycapture.state.mic.opening`);
      await app.main.waitFor(`parseFloat(document.querySelector('#meter-fill').style.width) > 0`, { message: 'meter moves with the (fake) microphone' });
      await app.main.click('[data-action="mic-test"]');
      await app.main.waitFor(`document.querySelector('#mic-playback')?.src.startsWith('blob:')`, { timeout: 10000, message: 'test recording ready' });
      await app.main.click('[data-action="close-modal"]');
    },
  },
  {
    name: '설정 · 탭 전환 · 스크롤 없음',
    run: async (app) => {
      await app.reset();
      await app.main.click('[data-action="open-settings"]');
      for (const tab of ['general', 'capture', 'record', 'mic', 'save']) {
        await app.main.click(`[data-action="settings-tab"][data-value="${tab}"]`);
        await sleep(tab === 'mic' ? 600 : 150);
        const fits = await app.main.eval(`(() => { const b = document.querySelector('.modal-body'); return b.scrollHeight <= b.clientHeight; })()`);
        assert.ok(fits, `settings tab ${tab} overflows`);
      }
      await app.main.click('[data-action="close-modal"]');
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
      assert.ok(await app.main.eval(`document.querySelector('#body').classList.contains('collapsed') && document.querySelector('.rail .rail-icon') && document.querySelector('.rail-title').textContent.length > 0`));
      await app.main.click('.rail');
      assert.ok(await app.main.eval(`!document.querySelector('#body').classList.contains('collapsed') && document.querySelector('#sources h2 svg')`));
    },
  },
  {
    name: '최소 창 크기에서 모든 버튼이 보이고 눌림',
    run: async (app) => {
      await app.reset({ mode: 'capture', target: 'window' });
      const before = await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|inner_size', { label: 'main' })`);
      await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 860, height: 600 } } })`);
      await sleep(600);
      const audit = () => app.main.eval(`(() => {
        const bad = [];
        const modal = document.querySelector('.modal');
        for (const el of (modal ?? document).querySelectorAll('button, select, input[type=range], input[type=search], [data-resize]')) {
          if (el.closest('[hidden]')) continue;
          const scroller = el.closest('.source-body');
          if (scroller && el !== scroller) continue;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          const name = el.dataset.action ?? el.dataset.select ?? el.dataset.input ?? el.className;
          if (r.left < 0 || r.top < 0 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) { bad.push('outside ' + name); continue; }
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (!hit || !(el === hit || el.contains(hit))) bad.push('covered ' + name);
        }
        return bad;
      })()`);
      try {
        for (const mode of ['capture', 'record']) {
          await app.main.click(`[data-action="mode"][data-value="${mode}"]`);
          for (const target of ['monitor', 'window', 'region']) {
            await app.main.click(`[data-action="target"][data-value="${target}"]`);
            await sleep(200);
            assert.deepEqual(await audit(), [], `${mode}/${target}`);
          }
        }
        await app.main.click('[data-action="open-settings"]');
        for (const tab of ['general', 'capture', 'record', 'mic', 'save']) {
          await app.main.click(`[data-action="settings-tab"][data-value="${tab}"]`);
          await sleep(150);
          assert.deepEqual(await audit(), [], `settings/${tab}`);
        }
        await app.main.click('[data-action="close-modal"]');
      } finally {
        await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Physical: ${JSON.stringify(before)} } })`);
      }
    },
  },
  {
    name: '프로그램 정보 대화상자',
    run: async (app) => {
      await app.reset();
      await app.main.click('[data-action="open-about"]');
      const text = await app.main.eval(`document.querySelector('.modal').textContent`);
      assert.match(text, /MyCapture/);
      assert.match(text, /1\.\d+\.\d+/);
      await app.main.key('Escape');
      await app.main.waitFor(`!document.querySelector('.modal')`);
    },
  },
  {
    name: '렌더러 오류 없음',
    run: async (app) => {
      assert.deepEqual(app.main.errors, [], 'uncaught exceptions in the main window');
    },
  },
];
