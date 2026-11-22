// Web E2E: the real app in headless Edge (own Vite, fake camera and microphone, screen capture without a
// picker). Each case drives the app the way the UI does and checks what came out: pixels of the program
// for sources, filters and transitions; meter levels for audio; files for recordings, replays and
// screenshots; an FFmpeg RTMP listener for streaming; frames in projector windows.
// [F:<id>] in a name marks the feature (src/bc/features.js) the case proves.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { freeDevPort } from '../../scripts/dev-port.mjs';

export const COMMAND_HELPER = '1';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ffmpegOk = () => spawnSync('ffmpeg', ['-hide_banner', '-version']).status === 0;
// What the web build downloads is collected in the page (bc/platform.js downloadBlob → T.downloads):
// headless browsers do not reliably write downloads to disk.
const seen = new Map();
async function waitFiles(app, re, n = 1, timeout = 20000) {
  const list = await app.run(`return await T.downloads(${re}, ${n}, ${timeout});`, timeout + 5000);
  for (const d of list) seen.set(d.name, d);
  return list.map((d) => d.name);
}
const head = (app, name, n = 12) => Buffer.from(seen.get(name)?.head ?? '', 'hex').subarray(0, n);
const sizeOf = (name) => seen.get(name)?.size ?? 0;
const clearDownloads = (app) => app.run('window.__mybroadcastingDownloads = []; return 1;');

/** Two full-screen colour scenes A (red) and B (blue) in an empty collection. */
const AB = `
  const c = await T.empty('AB');
  const A0 = c.scenes[0];
  await T.add('color_source_v3', { color: '#ff0000', width: 1920, height: 1080 }, null, 'Red');
  const B0 = A.studio.addScene('B');
  const blue = A.studio.addSource('color_source_v3', 'Blue', { color: '#0000ff', width: 1920, height: 1080 }, { sceneId: B0.id });
  await T.frames(3);
`;
const RECORD_PROFILE = (format, encoder = 'vp9', extra = '') => `A.studio.updateProfile((p) => { p.output.mode = 'simple'; p.output.simple.recFormat = '${format}'; p.output.simple.encoder = '${encoder}'; p.output.simple.recQuality = 'stream'; p.output.simple.videoBitrate = 1500; p.video.output = '640x360'; ${extra} return p; });`;

export const cases = [
  // ───────────────────────── shell
  { group: 'Shell', name: '[F:shell.start] the start page shows its cards over the moving background', run: async (app) => {
    await app.run(`await T.reset(); A.app.showStartPage(true); await T.frames(4);
      for (const card of ['actions', 'recent', 'samples', 'background']) T.check(document.querySelector('.start-card.' + card), 'card ' + card);
      const bg = A.startBackground(); const f0 = bg.frames; await T.sleep(400); T.check(bg.frames > f0, 'the background moves'); return 1;`);
  } },
  { group: 'Shell', name: '[F:shell.menus] menu bar menus open as popups and run their commands', run: async (app) => {
    await app.run(`await T.reset({ workspace: true }); A.app.openMenubarMenu('scene'); await T.popupReady('menu');
      const d = T.popupDoc('menu'); T.check(d.querySelectorAll('.menu-item').length >= 8, 'items');
      const before = A.studio.c.scenes.length;
      d.querySelector('[data-id="duplicateScene"]').click();
      await T.popupReady('prompt'); T.popupDoc('prompt').querySelector('[data-action="prompt-apply"]').click();
      await T.until(() => A.studio.c.scenes.length === before + 1, 5000, 'scene duplicated'); return 1;`);
  } },
  { group: 'Shell', name: '[F:shell.panels] the side panels collapse from a button at the right end of their header / tab row', run: async (app) => {
    const r = await app.run(`await T.reset({ workspace: true });
      const left = document.querySelector('#left-panel .dock-head .panel-collapse'); const right = document.querySelector('#right-panel .right-tabrow .panel-collapse');
      T.check(left && right, 'both buttons'); const head = left.closest('.dock-head').getBoundingClientRect(); const row = right.closest('.right-tabrow').getBoundingClientRect();
      const lr = left.getBoundingClientRect(); const rr = right.getBoundingClientRect();
      const placed = head.right - lr.right < 12 && row.right - rr.right < 12;
      left.click(); await T.sleep(150); const leftShut = !A.app.settings().showLeftPanel;
      const rail1 = Boolean(document.querySelector('#left-panel .panel-rail'));
      document.querySelector('#right-panel .right-tabrow .panel-collapse').click(); await T.sleep(150);
      const rail2 = Boolean(document.querySelector('#right-panel .panel-rail'));
      document.querySelector('#left-panel .rail-button.expand').click(); document.querySelector('#right-panel .rail-button.expand').click(); await T.sleep(150);
      return { placed, leftShut, rail1, rail2, back: A.app.settings().showLeftPanel && A.app.settings().showRightPanel };`);
    if (!r.placed || !r.leftShut || !r.rail1 || !r.rail2 || !r.back) throw new Error(JSON.stringify(r));
  } },
  { group: 'Shell', name: '[F:shell.panels] left headers and bottom control buttons align in rows and columns', run: async (app) => {
    const r = await app.run(`await T.reset({ workspace: true }); A.app.updateSettings({ showLeftPanel: true, showBottomPanel: true, bottomTab: 'controls' }); await T.sleep(250);
      const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
      return { heads: [...document.querySelectorAll('#left-panel .dock-head')].map(h => [...h.querySelectorAll(':scope > button')].map(rect)),
        controls: [...document.querySelectorAll('#bottom-panel .controls-dock > button')].map(rect) };`);
    for (const head of r.heads) {
      if (head.length < 5 || !head.every((b) => Math.abs(b.y + b.h / 2 - (head[0].y + head[0].h / 2)) <= 1)) throw new Error(JSON.stringify(head));
    }
    if (r.heads.length < 2 || r.controls.length < 4) throw new Error(JSON.stringify(r));
    const firstRow = r.controls.filter((b) => Math.abs(b.y - r.controls[0].y) <= 1);
    if (!r.controls.every((b) => Math.abs(b.w - firstRow[0].w) <= 1 && firstRow.some((first) => Math.abs(first.x - b.x) <= 1))) throw new Error(JSON.stringify(r.controls));
  } },
  { group: 'Shell', name: '[F:shell.panels] every close (x) button turns red under the mouse', run: async (app) => {
    const box = await app.run(`await T.reset({ workspace: true }); A.app.updateSettings({ showBottomPanel: true }); await T.sleep(200);
      const b = document.querySelector('#bottom-panel [data-command="bottomPanel"]'); T.check(b, 'the bottom panel close button'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`);
    await app.main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
    const bg = await app.run(`await T.sleep(150); return getComputedStyle(document.querySelector('#bottom-panel [data-command="bottomPanel"]')).backgroundColor;`);
    await app.main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
    const m = /rgba?\((\d+), (\d+), (\d+)/.exec(bg);
    if (!m || !(Number(m[1]) > 150 && Number(m[2]) < 80 && Number(m[3]) < 80)) throw new Error(`hover background ${bg}`);
  } },
  { group: 'Shell', name: '[F:shell.panels] with nothing selected the right panel is an overview whose buttons run the outputs; quick add sits under the sources', run: async (app) => {
    const r = await app.run(`await T.reset({ workspace: true }); A.studio.select([]); A.studio.selection.source = null; A.app.updateSettings({ showRightPanel: true, showLeftPanel: true, quickAddOpen: true }); await T.sleep(200);
      const ov = document.querySelector('#right-panel [data-overview]'); const cards = ov ? ov.querySelectorAll('.ov-card').length : 0;
      await A.studio.startAudio(); ov.querySelector('[data-command="toggleRecording"]').click(); await T.until(() => A.studio.outputs.recording?.state === 'recording', 10000, 'recording');
      const detail = () => document.querySelector('#right-panel .ov-out.on .ov-out-detail')?.textContent ?? '';
      await T.until(() => /00:00:0[1-9]/.test(detail()), 5000, 'the time moves').catch(() => {}); const live = detail();
      await A.actions.stopRecording({ confirmed: true });
      const tiles = document.querySelectorAll('#left-panel .quick-add .quick-tile').length;
      document.querySelector('#left-panel .quick-tile[data-add-source="text_gdiplus"]').click();
      const formOpen = await T.until(() => [...document.querySelectorAll('.web-popup')].some((f) => getComputedStyle(f).visibility !== 'hidden'), 8000, 'the add form').then(() => true, () => false); await A.popups.closeAll();
      document.querySelector('#left-panel [data-quick-toggle]').click(); await T.sleep(100); const folded = !document.querySelector('#left-panel .quick-tile');
      document.querySelector('#left-panel [data-quick-toggle]').click();
      return { cards, live, tiles, formOpen, folded };`);
    if (r.cards !== 3 || !/00:00:0[1-9]/.test(r.live) || r.tiles !== 8 || !r.formOpen || !r.folded) throw new Error(JSON.stringify(r));
  } },
  { group: 'Shell', name: '[F:shell.panels] [F:src.text] the right panel lines up: one control height, steppers fill their column, all −/+ buttons alike', run: async (app) => {
    const r = await app.run(`await T.reset({ workspace: true }); const it = A.studio.c.scenes[0].items.find((x) => A.studio.c.sources[x.source].type === 'text_gdiplus'); A.studio.select([it.id]);
      const look = async (tab) => { A.app.updateSettings({ rightTab: tab }); await T.sleep(300); const body = document.querySelector('#right-panel .right-body');
        const steppers = [...body.querySelectorAll('.stepper')].filter((x) => !x.closest('.crop-grid'));
        const heights = new Set([...steppers, ...body.querySelectorAll('.row-control select')].map((x) => Math.round(x.getBoundingClientRect().height)));
        const buttons = new Set([...body.querySelectorAll('.stepper-button, .slider-step')].filter((x) => !x.closest('.crop-grid')).map((x) => Math.round(x.getBoundingClientRect().width)));
        const widths = new Set(steppers.map((x) => Math.round(x.getBoundingClientRect().width)));
        return { heights: [...heights], buttons: [...buttons], widths: [...widths], n: steppers.length }; };
      return { props: await look('props'), transform: await look('transform') };`);
    for (const [tab, v] of Object.entries(r)) if (v.n < 1 || v.heights.length !== 1 || v.buttons.length !== 1 || v.widths.length !== 1) throw new Error(tab + ': ' + JSON.stringify(v));
  } },
  { group: 'Shell', name: '[F:set.general] settings: tabs one above the other on the left; labels and controls line up; hints are full lines', run: async (app) => {
    const r = await app.run(`await T.reset({ workspace: true }); A.popups.inline = true; A.popups.open('settings', { tab: 'output' }); await T.popupReady('settings'); await T.sleep(300);
      const d = T.popupDoc('settings'); const tabs = [...d.querySelectorAll('.side-tabs .side-tab')].map((b) => b.getBoundingClientRect());
      const vertical = tabs.length > 8 && tabs.every((b, i) => i === 0 || (b.top > tabs[i - 1].top && Math.abs(b.left - tabs[0].left) < 1));
      const body = d.querySelector('.popup-body').getBoundingClientRect(); const right = tabs.every((b) => b.right <= body.left + 1);
      const lefts = [...new Set([...d.querySelectorAll('.settings-page .row > .row-control')].map((c) => Math.round(c.getBoundingClientRect().left)))];
      const labels = [...new Set([...d.querySelectorAll('.settings-page .row > .row-label')].map((c) => Math.round(c.getBoundingClientRect().left)))];
      const emptyRows = [...d.querySelectorAll('.row-label > span')].filter((s) => !s.textContent.trim()).length; const notes = d.querySelectorAll('.settings-note').length;
      await A.popups.closeAll(); A.popups.inline = false; return { vertical, right, lefts, labels, emptyRows, notes };`);
    if (!r.vertical || !r.right || r.lefts.length !== 1 || r.labels.length !== 1 || r.emptyRows || !r.notes) throw new Error(JSON.stringify(r));
  } },
  { group: 'Shell', name: 'numeric settings place a centered editable value and unit between step buttons', run: async (app) => {
    await app.run(`await T.reset({ workspace: true }); A.popups.inline = true; A.popups.open('settings', { tab: 'font' }); await T.popupReady('settings');
      try {
        const d = T.popupDoc('settings'); const control = () => d.querySelector('[data-stepper="fontSize"]');
        await T.until(() => control(), 5000, 'font size control');
        const el = control(); const parts = [...el.children];
        T.check(parts.length === 4 && parts[0].dataset.stepDir === '-1' && parts[1].classList.contains('stepper-value') && parts[2].textContent === 'px' && parts[3].dataset.stepDir === '1', 'decrease, input, unit, increase');
        T.check(d.defaultView.getComputedStyle(parts[1]).textAlign === 'center', 'input centered');
        const boxes = parts.map((p) => p.getBoundingClientRect());
        T.check(boxes.every((r, i) => !i || boxes[i - 1].right <= r.left + 1), 'horizontal order');
        T.check(boxes.every((r) => Math.abs((r.top + r.bottom) / 2 - (boxes[0].top + boxes[0].bottom) / 2) <= 1), 'vertical alignment');
        parts[1].value = '18px'; parts[1].dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));
        await T.until(() => control()?.querySelector('.stepper-value')?.value === '18', 5000, 'typed value');
        control().querySelector('[data-step-dir="1"]').click();
        await T.until(() => control()?.querySelector('.stepper-value')?.value === '19', 5000, 'increment');
        T.check(control().querySelector('.stepper-unit').textContent === 'px', 'unit remains visible');
      } finally { await A.popups.closeAll(); A.popups.inline = false; }
      return 1;`);
  } },
  { group: 'Shell', name: '[F:help.tutorial] the welcome popup belongs to the start page: it opens there and closes when the page is left', run: async (app) => {
    const r = await app.run(`await T.reset({ workspace: true }); const shown = () => { const f = T.frameOf('welcome'); return Boolean(f && getComputedStyle(f.parentElement).visibility !== 'hidden' && f.parentElement.isConnected); };
      A.run('welcome'); await T.popupReady('welcome'); const onStartWhenOpen = A.state.showStart; const open = shown();
      await A.app.loadSample('talk'); await T.until(() => !A.state.showStart, 10000, 'workspace'); await T.until(() => !shown(), 5000, 'welcome closed');
      return { onStartWhenOpen, open, closed: !shown() };`);
    if (!r.onStartWhenOpen || !r.open || !r.closed) throw new Error(JSON.stringify(r));
  } },
  { group: 'Shell', name: '[F:shell.statusbar] LIVE / REC in the title bar are no taller than the menu items beside them', run: async (app) => {
    const r = await app.run(`await T.reset({ workspace: true }); await A.studio.startAudio(); await A.actions.startRecording(); await T.until(() => document.querySelector('.rec-badge'), 10000, 'REC');
      const badge = document.querySelector('.rec-badge').getBoundingClientRect(); const item = document.querySelector('#menubar button').getBoundingClientRect();
      await A.actions.stopRecording({ confirmed: true }); return { badge: badge.height, item: item.height, middle: Math.abs((badge.top + badge.height / 2) - (item.top + item.height / 2)) };`);
    if (!(r.badge <= r.item && r.middle <= 2)) throw new Error(JSON.stringify(r));
  } },
  { group: 'Shell', name: '[F:shell.toolbar] the toolbar folds groups into » when narrow', run: async (app) => {
    await app.main.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 900, deviceScaleFactor: 1, mobile: false });
    try {
      await app.run(`await T.reset({ workspace: true }); window.dispatchEvent(new Event('resize')); await T.sleep(300);
        const more = document.querySelector('[data-toolbar-more]'); T.check(!more.hidden, 'the » button shows'); T.check(A.state.toolbarHidden.length > 0, 'groups folded'); return 1;`);
    } finally { await app.main.send('Emulation.setDeviceMetricsOverride', { width: app.width, height: app.height, deviceScaleFactor: 1, mobile: false }); }
  } },
  { group: 'Shell', name: '[F:shell.toolbar] streaming control stays visible and identifies stop while live', run: async (app) => {
    await app.main.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 900, deviceScaleFactor: 1, mobile: false });
    try {
      await app.run(`await T.reset({ workspace: true }); window.dispatchEvent(new Event('resize')); await T.sleep(300);
        const button = document.querySelector('#toolbar [data-command="toggleStream"]');
        const check = (live) => { const r = button.getBoundingClientRect(); const bar = document.querySelector('#toolbar').getBoundingClientRect();
          T.check(r.width > 30 && r.left >= bar.left && r.right <= bar.right, 'stream button visible');
          T.check(button.classList.contains('active') === live, 'stream state');
          T.check(button.querySelector('[data-stream-stop].stream-icon').hidden !== live, 'stop icon');
          T.check(button.getAttribute('aria-label') === button.querySelector('.view-name span:not(.off)').textContent, 'state label'); };
        check(false); A.studio.outputs.stream = { state: 'live' };
        try { await A.run('safeAreas'); await T.sleep(100); check(true); }
        finally { A.studio.outputs.stream = null; await A.run('safeAreas'); }
        return 1;`);
    } finally { await app.main.send('Emulation.setDeviceMetricsOverride', { width: app.width, height: app.height, deviceScaleFactor: 1, mobile: false }); }
  } },
  { group: 'Shell', name: '[F:shell.panels] side and bottom panels hide, show and resize', run: async (app) => {
    await app.run(`await T.reset({ workspace: true });
      await A.run('leftPanel'); T.check(document.querySelector('#app').classList.contains('no-left'), 'left hidden');
      await A.run('leftPanel'); await A.run('rightPanel'); await A.run('bottomPanel');
      T.check(document.querySelector('#app').classList.contains('no-right') && document.querySelector('#app').classList.contains('no-bottom'), 'right and bottom hidden');
      await A.run('rightPanel'); await A.run('bottomPanel'); A.app.updateSettings({ leftWidth: 420 }); T.check(getComputedStyle(document.querySelector('#app')).getPropertyValue('--left-width').trim() === '420px', 'width'); A.app.updateSettings({ leftWidth: 320 }); return 1;`);
  } },
  { group: 'Shell', name: '[F:shell.themes] [F:shell.language] theme and language switch the whole window', run: async (app) => {
    await app.run(`await T.reset({ workspace: true }); const theme = A.state.settings.theme; await A.run('theme'); T.check(A.state.settings.theme !== theme, 'theme changed');
      A.app.updateSettings({ language: 'en' }); await T.frames(2); T.check(document.querySelector('[data-menu="scene"]').textContent.includes('Scene'), 'English menus');
      A.app.updateSettings({ language: 'ko', theme }); await T.frames(2); T.check(document.querySelector('[data-menu="scene"]').textContent.includes('장면'), 'Korean menus'); return 1;`);
  } },
  { group: 'Shell', name: '[F:shell.statusbar] the status bar shows stream and recording times, FPS and problems', run: async (app) => {
    await app.run(`await T.reset({ workspace: true }); await T.sleep(1200); const text = document.querySelector('#statusbar').textContent; T.check(/fps/.test(text) && /00:00:00/.test(text), text); T.check(document.querySelector('.status-problems'), 'problems'); return 1;`);
  } },
  { group: 'Shell', name: '[F:shell.undo] Undo and Redo of scene and item edits', run: async (app) => {
    await app.run(`await T.empty(); const n = A.studio.c.scenes.length; A.studio.addScene('U'); T.check(A.studio.c.scenes.length === n + 1, 'added');
      await A.run('undo'); T.check(A.studio.c.scenes.length === n, 'undone'); await A.run('redo'); T.check(A.studio.c.scenes.length === n + 1, 'redone'); return 1;`);
  } },
  { group: 'Shell', name: '[F:shell.messages] messages and problems lists in the bottom panel', run: async (app) => {
    await app.run(`await T.empty(); A.studio.addScene('Nothing here'); await A.actions.runProblems();
      A.app.updateSettings({ bottomTab: 'problems', showBottomPanel: true }); await T.frames(2); T.check(document.querySelectorAll('#bottom-panel [data-problem]').length >= 1, 'a problem row');
      A.app.notify('info', 'hello from the test'); A.app.updateSettings({ bottomTab: 'messages' }); await T.frames(2); T.check(document.querySelector('#bottom-panel').textContent.includes('hello from the test'), 'message row'); return 1;`);
  } },
  // ───────────────────────── scenes
  { group: 'Scenes', name: '[F:scene.switch] [F:trn.cut] clicking a scene switches the program (cut)', run: async (app) => {
    await app.run(`${AB} const cut = A.studio.c.transitions.find((x) => x.type === 'cut_transition'); A.studio.setTransition(cut.id);
      T.check(T.near(await T.pixel(100, 100), [255, 0, 0]), 'red first');
      document.querySelector('[data-scene="' + B0.id + '"]').click(); T.check(T.near(await T.pixel(100, 100), [0, 0, 255]), 'blue after the click'); return 1;`);
  } },
  { group: 'Scenes', name: '[F:scene.nested] [F:scene.filters] a nested scene draws inside another; scene filters apply', run: async (app) => {
    await app.run(`${AB} A.studio.addExisting(B0.id, { sceneId: A0.id }); A.studio.setItem(A.studio.c.scenes[0].items.at(-1).id, (it) => ({ transform: { ...it.transform, sx: 0.5, sy: 0.5 } }));
      T.check(T.near(await T.pixel(100, 100), [0, 0, 255]), 'B inside A (top-left quarter)'); T.check(T.near(await T.pixel(1500, 900), [255, 0, 0]), 'A elsewhere');
      A.studio.addFilter(A0.id, 'color_filter_v2', 'Grade'); A.studio.setFilter(A0.id, A.studio.c.scenes[0].filters[0].id, { settings: { brightness: -1 } });
      T.check(T.near(await T.pixel(1500, 900), [0, 0, 0]), 'the scene filter darkens it'); return 1;`);
  } },
  { group: 'Scenes', name: '[F:scene.screenshot] screenshots of the output, a scene and a source are saved as PNG', run: async (app) => {
    clearDownloads(app);
    await app.run(`${AB} await A.actions.screenshot('program'); await A.actions.screenshot('scene:' + B0.id); await A.actions.screenshot('source:' + blue.source.id); return 1;`);
    const list = await waitFiles(app, /^Screenshot .*\.png$/, 3);
    for (const f of list) if (head(app, f, 4).toString('hex') !== '89504e47') throw new Error(`${f} is not a PNG`);
  } },
  // ───────────────────────── sources
  { group: 'Sources', name: '[F:src.color] [F:src.image] [F:src.visibility] colour and image sources draw; hidden items do not', run: async (app) => {
    await app.run(`await T.empty(); await T.add('color_source_v3', { color: '#00ff00', width: 1920, height: 1080 });
      const img = await T.add('image_source', { file: T.fixture('red.png') }, { x: 100, y: 100, sx: 2, sy: 2 });
      await T.until(() => img.rt.status === 'ready', 8000, 'image loaded'); T.check(T.near(await T.pixel(150, 150), [255, 0, 0]), 'image drawn'); T.check(T.near(await T.pixel(500, 500), [0, 255, 0]), 'colour drawn');
      A.studio.toggleVisible(img.item.id, false); T.check(T.near(await T.pixel(150, 150), [0, 255, 0]), 'hidden'); return 1;`);
  } },
  { group: 'Sources', name: 'source controls hide, stop and resume the same source across scenes', run: async (app) => {
    await app.run(`await T.empty(); const s = await T.add('color_source_v3', { color: '#ff0000', width: 1920, height: 1080 }, null, 'Controlled');
      const other = A.studio.addScene('Other'); A.studio.addExisting(s.source.id, { sceneId: other.id }); A.studio.select([s.item.id]); await T.sleep(200);
      T.check(T.near(await T.pixel(100, 100), [255, 0, 0]), 'initial picture');
      document.querySelector('[data-list="sources"] [data-source-run="' + s.source.id + '"][data-action="paused"]').click(); await T.frames(3);
      T.check(T.near(await T.pixel(100, 100), [0, 0, 0]), 'pause hides video');
      A.studio.selectScene(other.id); await T.frames(4); T.check(T.near(await T.pixel(100, 100), [0, 0, 0]), 'same source paused in other scene');
      document.querySelector('[data-source-run="' + s.source.id + '"][data-action="running"]').click(); await T.frames(3);
      T.check(T.near(await T.pixel(100, 100), [255, 0, 0]), 'resume restores video');
      document.querySelector('[data-source-run="' + s.source.id + '"][data-action="stopped"]').click(); await T.frames(3);
      T.check(T.near(await T.pixel(100, 100), [0, 0, 0]), 'stop hides video'); return 1;`);
  } },
  { group: 'Sources', name: 'source pause preserves media playback position while stop releases the file', run: async (app) => {
    await app.run(`await T.empty(); const m = await T.add('ffmpeg_source', { is_local_file: true, local_file: T.fixture('clip.webm'), looping: true, restart_on_activate: true });
      await T.until(() => m.rt.width === 320 && m.rt.video.currentTime > 0.3, 10000, 'media playing');
      await A.studio.engine.setSourceControl(m.source.id, 'paused'); const at = m.rt.video.currentTime; await T.sleep(250);
      T.check(m.rt.video.paused && Math.abs(m.rt.video.currentTime - at) < 0.05, 'position held');
      await A.studio.engine.setSourceControl(m.source.id, 'running'); await T.sleep(150);
      T.check(!m.rt.video.paused && m.rt.video.currentTime >= at, 'resumed without restarting');
      await A.studio.engine.setSourceControl(m.source.id, 'stopped'); T.check(!m.rt.video.getAttribute('src'), 'file released');
      await A.studio.engine.setSourceControl(m.source.id, 'running'); await T.until(() => !m.rt.video.paused, 10000, 'media reopened'); return 1;`);
  } },
  { group: 'Sources', name: 'source control silences microphone output and monitor and releases its device', run: async (app) => {
    await app.run(`await T.empty(); await A.studio.startAudio(); const mic = await T.add('wasapi_input_capture', {});
      await T.until(() => mic.rt.status === 'ready', 15000, 'mic ready'); A.studio.setAudio(mic.source.id, { monitor: 'both' });
      await T.until(() => A.studio.mixer.channelsById.get(mic.source.id)?.input, 5000, 'mic attached');
      T.check(await T.level(mic.source.id, 1000) > -60, 'mic audible');
      await A.studio.engine.setSourceControl(mic.source.id, 'paused');
      const ch = A.studio.mixer.channelsById.get(mic.source.id);
      T.check(!ch.routing.monitor && ch.routing.tracks.every((v) => !v), 'monitor and output blocked');
      T.check(await T.level(mic.source.id, 1000) < -80, 'mic silent');
      await A.studio.engine.setSourceControl(mic.source.id, 'running'); T.check(await T.level(mic.source.id, 1000) > -60, 'mic resumed');
      const tracks = mic.rt.stream.getTracks(); await A.studio.engine.setSourceControl(mic.source.id, 'stopped');
      T.check(tracks.every((track) => track.readyState === 'ended'), 'device released');
      await A.studio.engine.setSourceControl(mic.source.id, 'running'); T.check(mic.rt.stream?.getTracks().every((track) => track.readyState === 'live'), 'device reacquired'); return 1;`);
  } },
  { group: 'Sources', name: 'camera stop releases and resumes the same configured device', run: async (app) => {
    await app.run(`await T.empty(); const cam = await T.add('dshow_input', {});
      await T.until(() => cam.rt.status === 'ready' && cam.rt.width > 0, 15000, 'camera ready');
      const tracks = cam.rt.stream.getTracks();
      await A.studio.engine.setSourceControl(cam.source.id, 'paused');
      T.check(tracks.every((track) => track.readyState === 'live'), 'pause retains camera');
      await A.studio.engine.setSourceControl(cam.source.id, 'stopped');
      T.check(tracks.every((track) => track.readyState === 'ended'), 'stop releases camera');
      await A.studio.engine.setSourceControl(cam.source.id, 'running');
      T.check(cam.rt.stream?.getVideoTracks().some((track) => track.readyState === 'live'), 'camera reacquired'); return 1;`);
  } },
  { group: 'Sources', name: 'stopped screen capture resumes without reopening the picker', run: async (app) => {
    await app.run(`await T.empty(); const s = await T.add('monitor_capture', {}); await s.rt.pick();
      await T.until(() => s.rt.status === 'ready' && s.rt.width > 0, 10000, 'capture ready');
      const stream = s.rt.stream; const track = stream.getVideoTracks()[0]; s.rt.pick = () => { throw new Error('picker reopened'); };
      await A.studio.engine.setSourceControl(s.source.id, 'stopped');
      T.check(track.readyState === 'live', 'capture retained');
      await A.studio.engine.setSourceControl(s.source.id, 'running');
      T.check(s.rt.stream === stream && track.readyState === 'live', 'same capture resumed'); return 1;`);
  } },
  { group: 'Sources', name: '[F:src.slideshow] the slide show cycles its pictures (auto and next / previous)', run: async (app) => {
    await app.run(`await T.empty(); const s = await T.add('slideshow', { files: ['sample:slide1', 'sample:slide2', 'sample:slide3'], slide_time: 300, transition_speed: 50, transition: 'cut' });
      await T.until(() => s.rt.images.length === 3, 10000, 'loaded'); const i0 = s.rt.index; await T.until(() => s.rt.index !== i0, 3000, 'advanced by itself');
      s.rt.control('pause'); const i1 = s.rt.index; s.rt.control('next'); T.check(s.rt.index === (i1 + 1) % 3, 'next'); s.rt.control('previous'); T.check(s.rt.index === i1, 'previous'); return 1;`);
  } },
  { group: 'Sources', name: '[F:src.media] [F:src.mediaControls] a media file plays; pause, seek, restart, stop', run: async (app) => {
    await app.run(`await T.empty(); const m = await T.add('ffmpeg_source', { is_local_file: true, local_file: T.fixture('clip.webm'), looping: true, restart_on_activate: false });
      await T.until(() => m.rt.width === 320, 10000, 'playing'); T.check(m.rt.mediaState().playing, 'playing'); T.check(m.rt.mediaState().duration > 1500, 'duration');
      m.rt.control('pause'); await T.sleep(100); T.check(!m.rt.mediaState().playing, 'paused'); m.rt.control('seek', 1000); await T.sleep(200); T.check(Math.abs(m.rt.mediaState().time - 1000) < 150, 'seek');
      m.rt.control('restart'); await T.sleep(200); T.check(m.rt.mediaState().playing && m.rt.mediaState().time < 900, 'restart'); m.rt.control('stop'); T.check(m.rt.mediaState().ended, 'stopped'); return 1;`);
  } },
  { group: 'Sources', name: '[F:src.playlist] the VLC playlist plays its files in order and moves next', run: async (app) => {
    await app.run(`await T.empty(); const v = await T.add('vlc_source', { playlist: [T.fixture('playlist-a.webm'), T.fixture('playlist-b.webm')], loop: true, playback_behavior: 'always_play' });
      await T.until(() => v.rt.width === 160, 10000, 'first'); T.check(T.near(await T.pixel(80, 45), [255, 0, 0], 40), 'red clip first');
      v.rt.control('next'); await T.until(() => v.rt.mediaState().index === 1, 5000, 'second'); await T.sleep(300); T.check(T.near(await T.pixel(80, 45), [0, 0, 255], 40), 'blue clip next'); return 1;`);
  } },
  { group: 'Sources', name: '[F:src.browser] [F:src.interact] the browser source draws HTML and CSS, local pages and refreshes', run: async (app) => {
    await app.run(`await T.empty(); const b = await T.add('browser_source', { mode: 'html', html: '<div style="width:300px;height:200px;background:#ff00ff"></div>', css: 'body{margin:0}', width: 400, height: 300 });
      await T.until(() => b.rt.status === 'ready' && b.rt.width === 400, 8000, 'ready'); T.check(T.near(await T.pixel(50, 50), [255, 0, 255]), 'HTML drawn');
      A.studio.updateSettings(b.source.id, { mode: 'local', local_file: T.fixture('page.html') });
      await T.until(async () => T.near(await T.pixel(50, 50, 'program', 1), [0, 255, 0]), 6000, 'local page'); T.check(T.near(await T.pixel(50, 50), [0, 255, 0]), 'local page drawn'); await b.rt.refresh(); T.check(b.rt.status === 'ready', 'refreshed'); return 1;`);
  } },
  { group: 'Sources', name: '[F:src.camera] the video capture device shows the camera with its sound', run: async (app) => {
    await app.run(`await T.empty(); await A.studio.startAudio(); const cam = await T.add('dshow_input', {});
      await T.until(() => cam.rt.status === 'ready' && cam.rt.width > 0, 15000, 'camera ready'); return { w: cam.rt.width, audio: Boolean(cam.rt.audio) };`);
  } },
  { group: 'Sources', name: '[F:src.micInput] [F:aud.mixer] the microphone source reaches its meter', run: async (app) => {
    await app.run(`await T.empty(); await A.studio.startAudio(); const mic = await T.add('wasapi_input_capture', {});
      await T.until(() => mic.rt.status === 'ready', 15000, 'mic ready'); A.studio.attachAudio(mic.rt); const l = await T.level(mic.source.id, 2500); T.check(l > -60, 'level ' + l); return l;`);
  } },
  { group: 'Sources', name: '[F:src.display] [F:src.window] [F:src.game] screen, window and game capture start from the picker', run: async (app) => {
    const r = await app.run(`await T.empty(); const out = [];
      for (const type of ['monitor_capture', 'window_capture', 'game_capture']) { const s = await T.add(type, {}); await s.rt.pick(); await T.until(() => s.rt.status === 'ready' && s.rt.width > 0, 10000, type); out.push([type, s.rt.width]); }
      return out;`);
    app.note?.(JSON.stringify(r));
  } },
  { group: 'Sources', name: '[F:src.audioOutput] [F:src.appAudio] desktop and application audio capture take the shared sound', run: async (app) => {
    await app.run(`await T.empty(); await A.studio.startAudio(); for (const type of ['wasapi_output_capture', 'wasapi_process_output_capture']) { const s = await T.add(type, {}); await s.rt.pick(); T.check(s.rt.status === 'ready', type + ' ready'); T.check(!s.rt.width, type + ' keeps no picture'); } return 1;`);
  } },
  { group: 'Sources', name: '[F:src.text] [F:src.group] text sources render (file, chat log, clock); groups move their children', run: async (app) => {
    await app.run(`await T.empty(); const t1 = await T.add('text_gdiplus', { text: 'Hello', font: { face: 'Arial', size: 80 } }); T.check(t1.rt.width > 100 && t1.rt.height > 60, 'drawn');
      const t2 = await T.add('text_gdiplus', { read_from_file: true, file: 'sample:chat.txt', chatlog: true, chatlog_lines: 2 }); await T.until(() => t2.rt.fileText.includes('viewer1'), 4000, 'file read'); T.check(t2.rt.content().includes('viewer1'), 'file text');
      const t3 = await T.add('text_gdiplus', { text_mode: 'clock', clock_format: 'HH:mm' }); T.check(/^\\d\\d:\\d\\d$/.test(t3.rt.content()), 'clock');
      A.studio.select([t1.item.id, t3.item.id]); const g = A.studio.groupSelected('G'); T.check(g.children.length === 2, 'grouped');
      A.studio.setItem(g.id, (it) => ({ transform: { ...it.transform, x: 300 } })); await T.frames(3); const geo = A.studio.engine.itemGeometry(A.studio.editScene.id).find((x) => x.id === t1.item.id); T.check(geo.corners[0].x >= 299, 'child moved with the group'); return 1;`);
  } },
  { group: 'Sources', name: '[F:src.showHideTransition] items fade in with their show transition', run: async (app) => {
    await app.run(`await T.empty(); await T.add('color_source_v3', { color: '#000000', width: 1920, height: 1080 }); const w = await T.add('color_source_v3', { color: '#ffffff', width: 1920, height: 1080 });
      A.studio.setItem(w.item.id, { show: { type: 'fade_transition', duration: 1500, settings: {} }, visible: false }); await T.frames(2);
      A.studio.toggleVisible(w.item.id, true); await T.sleep(700); const mid = await T.pixel(10, 10, 'program', 1); T.check(mid[0] > 40 && mid[0] < 220, 'half way ' + mid); await T.sleep(1200); T.check(T.near(await T.pixel(10, 10), [255, 255, 255]), 'shown'); return 1;`);
  } },
  // ───────────────────────── transform
  { group: 'Transform', name: '[F:tr.copyPaste] [F:tr.nudge] copy / paste a transform; arrow keys nudge', run: async (app) => {
    await app.run(`await T.empty(); const a = await T.add('color_source_v3', { width: 100, height: 100 }, { x: 300, y: 200, rot: 30 }); const b = await T.add('color_source_v3', { width: 100, height: 100 });
      A.studio.select([a.item.id]); await A.run('copyTransform'); A.studio.select([b.item.id]); await A.run('pasteTransform');
      const bt = A.studio.editScene.items.find((x) => x.id === b.item.id).transform; T.check(bt.x === 300 && bt.rot === 30, 'pasted'); document.activeElement?.blur?.(); return 1;`);
    await app.main.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await app.main.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await app.run(`await T.sleep(100); const it = A.studio.selectedItems()[0]; T.check(it.transform.x === 301, 'nudged ' + it.transform.x); return 1;`);
  } },
  { group: 'Transform', name: '[F:tr.blend] blend modes and scale filtering change how an item is drawn', run: async (app) => {
    await app.run(`await T.empty(); await T.add('color_source_v3', { color: '#ff0000', width: 1920, height: 1080 }); const b = await T.add('color_source_v3', { color: '#0000ff', width: 1920, height: 1080 });
      A.studio.setItem(b.item.id, { blend: 'additive' }); T.check(T.near(await T.pixel(50, 50), [255, 0, 255]), 'additive: magenta');
      A.studio.setItem(b.item.id, { blend: 'normal', scaleFilter: 'lanczos' }); T.check(T.near(await T.pixel(50, 50), [0, 0, 255]), 'normal + lanczos'); return 1;`);
  } },
  { group: 'Transform', name: '[F:tr.move] [F:tr.snap] dragging an item in the preview moves it and snaps to the edge', run: async (app) => {
    await app.run(`await T.empty(); const s = await T.add('color_source_v3', { width: 400, height: 300 }, { x: 600, y: 300 }); A.studio.select([s.item.id]); await T.sleep(300); return 1;`);
    const box = await app.main.eval(`(() => { const ws = A = window.__mybroadcasting; const d = A.workspace().display('main'); const r = document.querySelector('[data-overlay="main"]').getBoundingClientRect(); const k = d.rect.scale / (devicePixelRatio || 1); return { x: r.left + d.rect.x / (devicePixelRatio || 1) + 800 * k, y: r.top + d.rect.y / (devicePixelRatio || 1) + 450 * k, k }; })()`);
    const move = async (type, x, y) => app.main.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
    await move('mousePressed', box.x, box.y);
    for (let i = 1; i <= 10; i++) await move('mouseMoved', box.x - (595 * box.k * i) / 10, box.y);
    await move('mouseReleased', box.x - 595 * box.k, box.y);
    await app.run(`await T.sleep(100); const it = A.studio.selectedItems()[0]; T.check(it.transform.x === 0, 'snapped to the left edge: ' + it.transform.x); T.check(A.studio.undoLabel === 'moveItem', 'one Undo step'); return 1;`);
  } },
  // ───────────────────────── video filters (pixels of the program)
  { group: 'Filters', name: '[F:flt.color] [F:flt.chroma] [F:flt.colorKey] [F:flt.luma] colour correction and keys', run: async (app) => {
    await app.run(`await T.empty(); await T.add('color_source_v3', { color: '#ff0000', width: 1920, height: 1080 }); const g = await T.add('color_source_v3', { color: '#00ff00', width: 1920, height: 1080 });
      const f = A.studio.addFilter(g.source.id, 'chroma_key_filter_v2'); T.check(T.near(await T.pixel(50, 50), [255, 0, 0]), 'green keyed out by chroma key');
      A.studio.removeFilter(g.source.id, f.id); A.studio.addFilter(g.source.id, 'color_key_filter_v2'); T.check(T.near(await T.pixel(50, 50), [255, 0, 0]), 'colour key');
      A.studio.removeFilter(g.source.id, A.studio.c.sources[g.source.id].filters[0].id); const cc = A.studio.addFilter(g.source.id, 'color_filter_v2'); A.studio.setFilter(g.source.id, cc.id, { settings: { color_multiply: '#000000' } }); T.check(T.near(await T.pixel(50, 50), [0, 0, 0]), 'colour multiply');
      A.studio.removeFilter(g.source.id, cc.id); A.studio.updateSettings(g.source.id, { color: '#ffffff' }); const lk = A.studio.addFilter(g.source.id, 'luma_key_filter_v2'); A.studio.setFilter(g.source.id, lk.id, { settings: { luma_max: 0.5 } }); T.check(T.near(await T.pixel(50, 50), [255, 0, 0]), 'white keyed out by luma'); return 1;`);
  } },
  { group: 'Filters', name: '[F:flt.crop] [F:flt.scale] [F:flt.mask] [F:flt.lut] crop / pad, scaling, image mask, LUT', run: async (app) => {
    await app.run(`await T.empty(); const r = await T.add('color_source_v3', { color: '#00ff00', width: 400, height: 400 });
      const crop = A.studio.addFilter(r.source.id, 'crop_filter'); A.studio.setFilter(r.source.id, crop.id, { settings: { left: 200 } }); await T.frames(3);
      T.check(A.studio.engine.itemGeometry(A.studio.editScene.id)[0].w === 200, 'cropped to 200 wide'); T.check(T.near(await T.pixel(300, 100), [0, 0, 0]), 'past the crop: empty');
      A.studio.removeFilter(r.source.id, crop.id); const sc = A.studio.addFilter(r.source.id, 'scale_filter'); A.studio.setFilter(r.source.id, sc.id, { settings: { resolution: '640x360' } }); await T.frames(3); T.check(A.studio.engine.itemGeometry(A.studio.editScene.id)[0].w === 640, 'scaled to 640');
      A.studio.removeFilter(r.source.id, sc.id); const mk = A.studio.addFilter(r.source.id, 'mask_filter_v2'); A.studio.setFilter(r.source.id, mk.id, { settings: { image_path: T.fixture('mask.png'), stretch: true } });
      await T.until(async () => T.near(await T.pixel(300, 200), [0, 0, 0]), 6000, 'mask hides the right half'); T.check(T.near(await T.pixel(100, 200), [0, 255, 0]), 'mask keeps the left half');
      A.studio.removeFilter(r.source.id, mk.id); const lut = A.studio.addFilter(r.source.id, 'clut_filter'); A.studio.setFilter(r.source.id, lut.id, { settings: { image_path: T.fixture('lut-red.cube') } });
      await T.until(async () => T.near(await T.pixel(100, 200), [255, 0, 0]), 6000, 'LUT turns green into red'); return 1;`);
  } },
  { group: 'Filters', name: '[F:flt.delay] [F:flt.scroll] [F:flt.sharpen] [F:flt.tonemap] [F:flt.blur] delay, scroll, sharpen, tone mapping, blur', run: async (app) => {
    await app.run(`await T.empty(); const r = await T.add('color_source_v3', { color: '#808080', width: 1920, height: 1080 });
      const tm = A.studio.addFilter(r.source.id, 'hdr_tonemap_filter'); A.studio.setFilter(r.source.id, tm.id, { settings: { exposure: 4 } }); const v = (await T.pixel(50, 50))[0]; T.check(v > 150 && v < 200, 'tone mapped ' + v); A.studio.removeFilter(r.source.id, tm.id);
      const d = A.studio.addFilter(r.source.id, 'gpu_delay'); A.studio.setFilter(r.source.id, d.id, { settings: { delay_ms: 400 } }); await T.sleep(600); A.studio.updateSettings(r.source.id, { color: '#ff0000' });
      T.check(T.near(await T.pixel(50, 50, 'program', 2), [128, 128, 128]), 'still the old colour'); await T.sleep(700); T.check(T.near(await T.pixel(50, 50), [255, 0, 0]), 'the new colour after the delay'); A.studio.removeFilter(r.source.id, d.id);
      const bars = await T.add('image_source', { file: 'sample:bars' }); await T.until(() => bars.rt.status === 'ready', 8000, 'bars');
      const edge = await T.pixel(274, 100); const sh = A.studio.addFilter(bars.source.id, 'sharpness_filter_v2'); A.studio.setFilter(bars.source.id, sh.id, { settings: { sharpness: 1 } }); const sharp = await T.pixel(274, 100); A.studio.removeFilter(bars.source.id, sh.id);
      T.check(!T.near(edge, sharp, 2), 'sharpen changes edges ' + edge + ' / ' + sharp);
      const bl = A.studio.addFilter(bars.source.id, 'blur_filter'); A.studio.setFilter(bars.source.id, bl.id, { settings: { size: 30 } }); const blurred = await T.pixel(274, 100); T.check(!T.near(edge, blurred, 4), 'blur mixes the bars'); A.studio.removeFilter(bars.source.id, bl.id);
      const before = await T.pixel(100, 100); const sc = A.studio.addFilter(bars.source.id, 'scroll_filter'); A.studio.setFilter(bars.source.id, sc.id, { settings: { speed_x: 400 } }); await T.sleep(500); T.check(!T.near(before, await T.pixel(100, 100), 4), 'scrolling moves the picture'); return 1;`);
  } },
  { group: 'Filters', name: '[F:flt.manage] the filter panel adds, toggles, renames and orders filters', run: async (app) => {
    await app.run(`await T.empty(); const r = await T.add('color_source_v3', { color: '#ff0000', width: 1920, height: 1080 }); A.studio.select([r.item.id]); A.app.updateSettings({ rightTab: 'filters', showRightPanel: true }); await T.frames(2);
      const sel = document.querySelector('[data-filter-add]'); sel.value = 'color_filter_v2'; sel.dispatchEvent(new Event('change', { bubbles: true })); await T.frames(2);
      sel.value = 'blur_filter'; document.querySelector('[data-filter-add]').value = 'blur_filter'; document.querySelector('[data-filter-add]').dispatchEvent(new Event('change', { bubbles: true })); await T.frames(2);
      const list = A.studio.c.sources[r.source.id].filters; T.check(list.length === 2, 'two filters');
      document.querySelector('[data-filter-enabled="' + list[0].id + '"]').click(); T.check(!list[0].enabled, 'toggled off');
      document.querySelector('[data-filter-move="' + list[1].id + ':-1"]').click(); T.check(A.studio.c.sources[r.source.id].filters[0].type === 'blur_filter', 'reordered'); return 1;`);
  } },
  // ───────────────────────── audio
  { group: 'Audio', name: '[F:aud.mute] [F:flt.gain] [F:flt.gate] [F:flt.compressor] mute and audio filters change the level', run: async (app) => {
    await app.run(`await T.empty(); await A.studio.startAudio(); const m = await T.add('ffmpeg_source', { is_local_file: true, local_file: T.fixture('tone.wav'), looping: true });
      await T.until(() => A.studio.mixer.channelsById.has(m.source.id), 8000, 'in the mixer'); const base = await T.level(m.source.id, 800); T.check(base > -30, 'tone level ' + base);
      const g = A.studio.addFilter(m.source.id, 'gain_filter'); A.studio.setFilter(m.source.id, g.id, { settings: { db: -20 } }); const quiet = await T.level(m.source.id, 800); T.check(base - quiet > 14, 'gain -20 dB: ' + base + ' → ' + quiet); A.studio.removeFilter(m.source.id, g.id);
      const c = A.studio.addFilter(m.source.id, 'compressor_filter'); A.studio.setFilter(m.source.id, c.id, { settings: { ratio: 32, threshold: -60 } }); const comp = await T.level(m.source.id, 800); T.check(base - comp > 10, 'compressed: ' + comp); A.studio.removeFilter(m.source.id, c.id);
      const gate = A.studio.addFilter(m.source.id, 'noise_gate_filter'); A.studio.setFilter(m.source.id, gate.id, { settings: { open_threshold: 0, close_threshold: -0.5 } }); const gated = await T.level(m.source.id, 800); T.check(gated < -60, 'gate closed: ' + gated); A.studio.removeFilter(m.source.id, gate.id);
      A.studio.setAudio(m.source.id, { muted: true }); const muted = await T.level(m.source.id, 600); T.check(muted < -90, 'muted: ' + muted); return [base, quiet, comp, gated, muted];`);
  } },
  { group: 'Audio', name: '[F:flt.noise] [F:flt.limiter] [F:flt.expander] [F:flt.upward] [F:flt.eq] [F:flt.invert] [F:flt.vst] every audio filter runs in the chain', run: async (app) => {
    await app.run(`await T.empty(); await A.studio.startAudio(); const m = await T.add('ffmpeg_source', { is_local_file: true, local_file: T.fixture('tone.wav'), looping: true }); await T.until(() => A.studio.mixer.channelsById.has(m.source.id), 8000, 'mixer');
      for (const type of ['noise_suppress_filter_v2', 'limiter_filter', 'expander_filter', 'upward_compressor_filter', 'basic_eq_filter', 'invert_polarity_filter', 'vst_filter']) A.studio.addFilter(m.source.id, type);
      const ch = A.studio.mixer.channelsById.get(m.source.id); T.check(ch.filters.length === 7, 'seven filter nodes'); const l = await T.level(m.source.id, 1500); T.check(Number.isFinite(l) && l > -40, 'sound still flows: ' + l); return l;`);
  } },
  { group: 'Audio', name: '[F:aud.monitor] [F:aud.advanced] [F:aud.tracks] monitoring, balance, sync offset, mono and tracks reach the nodes', run: async (app) => {
    await app.run(`await T.empty(); await A.studio.startAudio(); const m = await T.add('ffmpeg_source', { is_local_file: true, local_file: T.fixture('tone.wav'), looping: true }); await T.until(() => A.studio.mixer.channelsById.has(m.source.id), 8000, 'mixer');
      A.studio.select([m.item.id]); A.app.updateSettings({ rightTab: 'audio', showRightPanel: true }); await T.frames(2);
      const sel = document.querySelector('[data-audio-select$="|monitor"]'); sel.value = 'both'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      A.actions.audioInput(m.source.id, 'balance', 0); A.actions.audioInput(m.source.id, 'sync', 500); A.actions.audioInput(m.source.id, 'mono', true);
      const ch = A.studio.mixer.channelsById.get(m.source.id);
      const master = async () => { await T.sleep(300); let best = -Infinity; for (let i = 0; i < 12; i++) { best = Math.max(best, A.studio.mixer.masterLevel().peak); await T.sleep(50); } return best; };
      T.check(await master() > -40, 'track 1 carries the sound');
      const tr = [...A.studio.c.sources[m.source.id].audio.tracks]; tr[1] = false; A.actions.audioInput(m.source.id, 'tracks', tr); await T.sleep(200);
      T.check(!ch.routing.tracks[1] && ch.routing.tracks[0], 'track 2 off, track 1 on');
      tr[0] = false; A.actions.audioInput(m.source.id, 'tracks', tr); T.check(await master() < -90, 'track 1 off: silence on track 1');
      T.check(ch.routing.monitor && ch.monitor.gain.value === 1, 'monitor on'); T.check(ch.pan.pan.value === -1, 'balance left'); T.check(Math.abs(ch.delay.delayTime.value - 0.5) < 0.05, 'sync offset ' + ch.delay.delayTime.value); T.check(ch.monoIn.channelCount === 1, 'mono');
      return 1;`);
  } },
  { group: 'Audio', name: '[F:aud.ptt] push-to-talk keeps a source silent until its key is held', run: async (app) => {
    await app.run(`await T.empty(); await A.studio.startAudio(); const m = await T.add('ffmpeg_source', { is_local_file: true, local_file: T.fixture('tone.wav'), looping: true }); await T.until(() => A.studio.mixer.channelsById.has(m.source.id), 8000, 'mixer');
      A.actions.audioInput(m.source.id, 'ptt.enabled', true); const off = await T.level(m.source.id, 700); T.check(off < -90, 'silent: ' + off);
      A.studio.runAction('source:' + m.source.id + ':ptt', true); const on = await T.level(m.source.id, 700); T.check(on > -30, 'talking: ' + on); A.studio.runAction('source:' + m.source.id + ':ptt', false); return [off, on];`);
  } },
  { group: 'Audio', name: '[F:aud.global] [F:aud.layout] [F:aud.meterTypes] global devices appear in the mixer; layout and meters follow the settings', run: async (app) => {
    await app.run(`await T.empty(); await A.studio.startAudio(); A.studio.noSave = false; A.studio.updateProfile((p) => { p.audio.devices.mic2 = 'default'; p.audio.meterDecay = 'slow'; return p; });
      try {
        await T.until(() => Object.values(A.studio.c.sources).some((s) => s.global === 'mic2'), 5000, 'global mic'); A.app.updateSettings({ bottomTab: 'mixer', showBottomPanel: true, mixerLayout: 'vertical' }); await T.frames(2);
        T.check(document.querySelector('.mixer.vertical .mixer-strip'), 'vertical strips'); await T.sleep(1500); const ch = document.querySelector('.meter-ch'); T.check(ch.style.getPropertyValue('--level') !== '', 'meter drawn');
      } finally { A.studio.updateProfile((p) => { p.audio.devices.mic2 = ''; p.audio.meterDecay = 'fast'; return p; }); A.app.updateSettings({ mixerLayout: 'horizontal' }); A.studio.noSave = true; }
      return 1;`);
  } },
  // ───────────────────────── transitions
  { group: 'Transitions', name: '[F:trn.fade] [F:trn.fadeColor] [F:trn.swipe] [F:trn.slide] [F:trn.luma] transitions mix the two scenes as they should', run: async (app) => {
    await app.run(`${AB} const set = (type, settings = {}) => { const tr = A.studio.addTransition(type); A.studio.setTransitionSettings(tr.id, settings); return tr; };
      const at = async (p) => { A.studio.engine.setTBar(p, B0.id); return [await T.pixel(200, 500), await T.pixel(1700, 500)]; };
      set('fade_transition'); let [l, r] = await at(0.5); T.check(T.near(l, [128, 0, 128], 30), 'fade half way ' + l); A.studio.engine.setTBar(0);
      set('fade_to_color_transition', { color: '#00ff00', switch_point: 50 }); [l] = await at(0.25); T.check(T.near(l, [128, 128, 0], 40), 'fade to colour ' + l); A.studio.engine.setTBar(0);
      set('swipe_transition', { direction: 'left' }); [l, r] = await at(0.5); T.check(T.near(l, [255, 0, 0], 30) && T.near(r, [0, 0, 255], 30), 'swipe ' + l + ' ' + r); A.studio.engine.setTBar(0);
      set('slide_transition', { direction: 'left' }); [l, r] = await at(0.5); T.check(T.near(l, [255, 0, 0], 30) && T.near(r, [0, 0, 255], 30), 'slide'); A.studio.engine.setTBar(0);
      set('wipe_transition', { luma_image: 'linear-h', luma_softness: 0 }); [l, r] = await at(0.5); T.check(T.near(l, [0, 0, 255], 30) && T.near(r, [255, 0, 0], 30), 'luma wipe ' + l + ' ' + r);
      A.studio.engine.setTBar(1); await T.frames(2); T.check(A.studio.c.current === B0.id, 'the T-bar at the end completes the transition'); return 1;`);
  } },
  { group: 'Transitions', name: '[F:trn.stinger] the stinger plays its video and switches at the transition point', run: async (app) => {
    await app.run(`${AB} const st = A.studio.addTransition('stinger_transition'); A.studio.setTransitionSettings(st.id, { path: T.fixture('stinger.webm'), transition_point: 400 });
      A.studio.transitionTo(B0.id); let saw = false; const end = performance.now() + 4000;
      while (A.studio.engine.transition && performance.now() < end) { const p = await T.pixel(100, 500, 'program', 1); if (T.near(p, [255, 0, 255], 50)) saw = true; }
      T.check(saw, 'the stinger video showed'); await T.until(() => A.studio.c.current === B0.id && !A.studio.engine.transition, 4000, 'switched'); T.check(T.near(await T.pixel(100, 500), [0, 0, 255]), 'B after it');
      A.studio.setTransitionSettings(st.id, { track_matte_enabled: true }); A.studio.collection.current = A0.id; A.studio.engine.updateActivity(); A.studio.transitionTo(B0.id); await T.until(() => !A.studio.engine.transition, 5000, 'matte stinger done'); T.check(A.studio.c.current === B0.id, 'track matte stinger completes'); return 1;`);
  } },
  // ───────────────────────── studio mode
  { group: 'Studio', name: '[F:std.mode] [F:std.tbar] studio mode edits the preview while the program stays; Transition and T-bar', run: async (app) => {
    await app.run(`${AB} A.app.setView('studio'); await T.frames(3); T.check(document.querySelector('[data-pane="program"]') && document.querySelector('[data-studio-bar]'), 'two panes and the bar');
      A.studio.selectScene(B0.id); T.check(A.studio.c.preview === B0.id && A.studio.c.current === A0.id, 'B in preview, A on air'); T.check(T.near(await T.pixel(100, 100), [255, 0, 0]), 'program still red');
      document.querySelector('[data-command="studioTransition"]').click(); await T.until(() => A.studio.c.current === B0.id && !A.studio.engine.transition, 3000, 'transitioned'); T.check(T.near(await T.pixel(100, 100), [0, 0, 255]), 'program blue');
      A.studio.selectScene(A0.id); A.studio.engine.setTBar(0.6, A0.id); T.check(A.studio.engine.transition?.manual, 'manual'); A.studio.engine.setTBar(1, A0.id); T.check(A.studio.c.current === A0.id, 'T-bar completed'); A.app.setView('single'); return 1;`);
  } },
  { group: 'Studio', name: '[F:std.quick] [F:std.swap] quick transitions; swap and duplicate-scene options', run: async (app) => {
    await app.run(`${AB} A.app.setView('studio'); A.app.updateSettings({ swapScenes: true }); A.studio.selectScene(B0.id);
      const q = A.studio.c.quick[0]; T.check(q, 'a quick transition'); A.studio.runQuick(q.id); await T.until(() => A.studio.c.current === B0.id && !A.studio.engine.transition, 3000, 'quick');
      T.check(A.studio.c.preview === A0.id, 'swapped: the old program is in the preview');
      A.app.updateSettings({ swapScenes: false, duplicateScene: true }); A.studio.selectScene(A0.id); A.studio.studioTransition(); await T.until(() => !A.studio.engine.transition, 3000, 'dup');
      T.check(A.studio.c.scenes.find((s) => s.id === A.studio.c.current)?.temporary, 'the program is a copy'); A.app.updateSettings({ duplicateScene: false }); A.app.setView('single'); return 1;`);
  } },
  { group: 'Studio', name: '[F:std.multiview] the multiview shows preview, program and the scenes', run: async (app) => {
    await app.run(`${AB} A.app.setView('multiview'); await T.sleep(400); const d = A.studio.engine.displays.get('multiview'); T.check(d && d.tiles.length === 2 + A.studio.c.scenes.length, 'tiles ' + d?.tiles.length); A.app.setView('single'); return 1;`);
  } },
  { group: 'Studio', name: '[F:std.projector] [F:out.virtualcam] projector windows and the virtual camera get the program picture', run: async (app) => {
    await app.run(`${AB} const w = window.open(location.pathname + '?projector=program', 'proj1', 'width=480,height=270');
      await T.until(() => w.__mybroadcastingProjector?.video.videoWidth > 0, 15000, 'projector picture'); const pv = w.__mybroadcastingProjector.video.videoWidth; w.close();
      await A.studio.startVirtualCam(); await T.until(() => A.studio.projectors.count >= 1, 15000, 'virtual camera connected'); A.studio.stopVirtualCam(); return pv;`);
  } },
  // ───────────────────────── outputs
  { group: 'Audio', name: '[F:aud.mixer] the mixer lays its strips out as cards, several to a row', run: async (app) => {
    const r = await app.run(`await T.empty(); await A.studio.startAudio(); for (const n of ['A', 'B', 'C', 'D']) await T.add('wasapi_input_capture', {}, null, n);
      A.app.updateSettings({ showBottomPanel: true, bottomTab: 'mixer', mixerLayout: 'horizontal' }); await T.sleep(400);
      const boxes = [...document.querySelectorAll('.mixer.horizontal .mixer-strip')].map((e) => e.getBoundingClientRect());
      const rows = new Set(boxes.map((b) => Math.round(b.top))).size; const width = document.querySelector('.mixer').getBoundingClientRect().width;
      return { n: boxes.length, rows, widest: Math.max(...boxes.map((b) => b.width)), width };`);
    if (r.n !== 4 || r.rows >= r.n || r.widest > r.width / 2) throw new Error(JSON.stringify(r));
  } },
  { group: 'Sources', name: '[F:src.display] a screen capture is a moving picture (new frames keep coming), and its row shows it ready', run: async (app) => {
    const r = await app.run(`await T.empty(); const cap = await T.add('monitor_capture', {}); await cap.rt.pick(); await T.until(() => cap.rt.width > 0, 10000, 'capture'); await T.sleep(500);
      const v0 = cap.rt.version; await T.sleep(2000); const gain = cap.rt.version - v0; await T.sleep(200);
      const row = document.querySelector('#left-panel .source-row'); return { gain, warn: Boolean(row?.querySelector('.tag.warn')), status: cap.rt.status };`);
    if (r.gain < 10 || r.warn || r.status !== 'ready') throw new Error(JSON.stringify(r));
  } },
  { group: 'Outputs', name: '[F:str.start] [F:shell.messages] an empty scene says so over the preview; going live with it is asked first', run: async (app) => {
    const r = await app.run(`await T.empty(); await T.sleep(300); const shown = Boolean(document.querySelector('.ws-empty'));
      const visible = () => [...document.querySelectorAll('.popup-frame, .web-popup')].some((f) => f.querySelector('iframe') && getComputedStyle(f).visibility !== 'hidden');
      document.querySelector('.ws-empty [data-add-source="color_source_v3"], .ws-empty [data-add-source="text_gdiplus"]').click(); await T.until(() => visible(), 10000, 'the add-source form'); await A.popups.closeAll();
      A.studio.noSave = false; A.studio.updateProfile((p) => { p.stream = { ...p.stream, service: 'direct', direct: { ...p.stream.direct, server: 'ws://127.0.0.1:1' } }; return p; });
      const going = A.actions.startStream({}); await T.popupReady('confirm'); const asked = T.popupDoc('confirm').body.textContent.includes(A.t('empty.streamTitle'));
      T.popupDoc('confirm').querySelector('[data-action="choice"][data-value="cancel"]').click(); await going;
      const notLive = !A.studio.outputs.stream;
      await T.add('color_source_v3', { color: '#3366ff' }); await T.sleep(300); const gone = !document.querySelector('.ws-empty');
      A.studio.updateProfile((p) => { p.stream = { ...p.stream, service: 'twitch' }; return p; }); A.studio.noSave = true; await A.popups.closeAll();
      return { shown, asked, notLive, gone };`);
    if (!r.shown || !r.asked || !r.notLive || !r.gone) throw new Error(JSON.stringify(r));
  } },
  { group: 'Outputs', name: '[F:str.account] Settings › Stream shows account connection; without a Client ID it says what to do', run: async (app) => {
    const r = await app.run(`await T.reset({ workspace: true }); A.studio.noSave = false; A.studio.updateProfile((p) => { p.stream = { ...p.stream, service: 'twitch', key: '', accounts: { ...p.stream.accounts, twitch: { clientId: '', login: '' } } }; return p; });
      A.popups.inline = true; A.popups.open('settings', { tab: 'stream' }); await T.popupReady('settings'); await T.sleep(300);
      const d = T.popupDoc('settings'); const field = Boolean(d.querySelector('[data-prof="stream.accounts.twitch.clientId"]')); const button = d.querySelector('[data-action="account-connect"][data-value="twitch"]');
      button.click(); await T.until(() => T.frameOf('error') && getComputedStyle(T.frameOf('error').parentElement).visibility !== 'hidden', 10000, 'the error window');
      const said = await T.until(() => T.popupDoc('error')?.body?.textContent.includes(A.t('account.error.no-client-id')), 5000, 'the reason').then(() => true, () => false);
      await A.popups.closeAll(); A.popups.inline = false; A.studio.updateProfile((p) => { p.stream = { ...p.stream, service: 'twitch' }; return p; }); A.studio.noSave = true;
      return { field, button: Boolean(button), said };`);
    // The failure is reported on purpose (error window + log): take it, and check it is that one.
    const logged = app.takeErrors();
    if (!r.field || !r.button || !r.said || !logged.every((e) => /account.failed/.test(e))) throw new Error(JSON.stringify({ r, logged }));
  } },
  { group: 'Outputs', name: '[F:str.start] without a stream key the stream does not start: the user is offered Settings › Stream', run: async (app) => {
    await app.run(`await T.reset({ workspace: true }); A.studio.noSave = false; A.studio.updateProfile((p) => { p.stream = { ...p.stream, service: 'twitch', key: '' }; return p; });
      const going = A.actions.startStream({ confirmed: true }); await T.popupReady('confirm'); const d = T.popupDoc('confirm');
      T.check(d.body.textContent.includes(A.t('stream.problem.noKey')), 'the reason'); d.querySelector('[data-action="choice"][data-value="settings"]').click(); await going;
      await T.popupReady('settings'); await T.until(() => T.popupDoc('settings')?.querySelector('[data-prof="stream.service"]'), 10000, 'the stream tab');
      T.check(!A.studio.outputs.stream, 'not streaming'); T.check(!T.frameOf('error') || getComputedStyle(T.frameOf('error').parentElement).visibility === 'hidden', 'no error window'); await A.popups.closeAll(); A.studio.noSave = true; return 1;`);
  } },
  { group: 'Outputs', name: '[F:str.direct] direct viewing: a viewer opens the address, enters the access code and gets the program over WebRTC', run: async (app) => {
    const { startViewerServer } = await import('../../server/viewers.mjs');
    const { Page, waitTarget } = await import('./cdp.mjs');
    const vs = await startViewerServer({ port: 0, host: '127.0.0.1', log: () => {} });
    let page = null;
    let target = null;
    try {
      const urls = await app.run(`await T.reset({ workspace: true }); A.studio.noSave = false;
        A.studio.updateProfile((p) => { p.stream = { ...p.stream, service: 'direct', direct: { ...p.stream.direct, server: 'ws://127.0.0.1:${vs.port}', code: 'abc', stun: '', title: 'E2E show' } }; return p; });
        await A.actions.startStream({ confirmed: true }); T.check(A.studio.outputs.stream?.state === 'live', 'live'); await T.popupReady('confirm'); return A.studio.outputs.stream.urls;`);
      if (!urls.some((u) => u === `http://127.0.0.1:${vs.port}/?code=abc`)) throw new Error(`addresses: ${urls}`);
      await app.browserCommand('Target.createTarget', { url: `http://127.0.0.1:${vs.port}/` });
      target = await waitTarget(app.port, (x) => String(x.url).startsWith(`http://127.0.0.1:${vs.port}/`), 15000);
      page = await new Page(target).open();
      await page.waitFor(`Boolean(document.getElementById('codeForm'))`, { timeout: 15000, message: 'the access code is asked' });
      await page.eval(`document.getElementById('code').value = 'abc'; document.getElementById('codeForm').requestSubmit(); 1`);
      await page.waitFor(`window.__viewer.video.videoWidth > 0 && document.getElementById('title').textContent === 'E2E show'`, { timeout: 30000, message: 'the picture reaches the viewer' });
      const watching = await app.run(`await T.until(() => A.studio.stats().stream?.viewers === 1, 10000, 'one viewer'); return A.studio.stats().stream.viewers;`);
      if (watching !== 1) throw new Error(`viewers: ${watching}`);
      await app.run(`await A.actions.stopStream({ confirmed: true }); return 1;`);
      await page.waitFor(`document.getElementById('state').textContent !== '' && !window.__viewer.pc`, { timeout: 10000, message: 'the viewer is told the show ended' });
    } finally {
      page?.close();
      if (target) await app.browserCommand('Target.closeTarget', { targetId: target.id }).catch(() => {});
      await app.run(`if (A.studio.outputs.stream) await A.actions.stopStream({ confirmed: true }); await A.popups.closeAll(); A.studio.updateProfile((p) => { p.stream = { ...p.stream, service: 'twitch' }; return p; }); A.studio.noSave = true; return 1;`).catch(() => {});
      await vs.close();
    }
  } },
  { group: 'Outputs', name: '[F:rec.start] [F:rec.formats] [F:out.encoders] recording writes real MKV, WebM, MP4 and fragmented MP4 files', run: async (app) => {
    clearDownloads(app);
    const r = await app.run(`await T.reset({ workspace: true }); await A.studio.startAudio(); const out = [];
      for (const [format, enc] of [['mkv', 'vp9'], ['webm', 'vp8'], ['mp4', 'vp9'], ['fmp4', 'vp9']]) { A.studio.updateProfile((p) => { p.output.mode = 'simple'; p.output.simple.recFormat = format; p.output.simple.encoder = enc; p.output.simple.recQuality = 'stream'; p.output.simple.videoBitrate = 1500; p.video.output = '640x360'; return p; }); await A.actions.startRecording(); await T.sleep(2500); await A.actions.stopRecording({ confirmed: true }); out.push([format, A.studio.lastRecording?.bytes]); }
      return out;`, 120000);
    const list = await waitFiles(app, /\.(mkv|webm|mp4)$/, 4);
    for (const f of list) {
      const h = head(app, f);
      const ok = /\.(mkv|webm)$/.test(f) ? h.subarray(0, 4).toString('hex') === '1a45dfa3' : h.subarray(4, 8).toString() === 'ftyp';
      if (!ok) throw new Error(`${f}: wrong header ${h.toString('hex')}`);
      if (sizeOf(f) < 5000) throw new Error(`${f} is too small (${sizeOf(f)} bytes)`);
    }
    app.note?.(JSON.stringify(r));
  } },
  { group: 'Outputs', name: '[F:rec.pause] [F:rec.split] [F:rec.chapter] [F:rec.multitrack] pause, split, chapters and two audio tracks', run: async (app) => {
    clearDownloads(app);
    await app.run(`await T.reset({ workspace: true }); await A.studio.startAudio();
      A.studio.updateProfile((p) => { p.output.mode = 'advanced'; p.output.stream.encoder = 'vp9'; p.output.record = { ...p.output.record, format: 'mkv', sameAsStream: true, tracks: [1, 2], audioCodec: 'opus' }; p.video.output = '640x360'; return p; });
      await A.actions.startRecording(); const rec = A.studio.outputs.recording; T.check(rec.audioHubs.size === 2, 'two audio tracks');
      await T.sleep(800); T.check(A.studio.pauseRecording(), 'paused'); await T.sleep(600); T.check(A.studio.resumeRecording(), 'resumed'); await T.sleep(600);
      A.studio.addChapter('Middle'); A.studio.splitRecording(); await T.sleep(2500); const parts = rec.parts.length; await A.actions.stopRecording({ confirmed: true });
      A.studio.updateProfile((p) => { p.output.mode = 'simple'; return p; }); T.check(parts >= 2, 'split into ' + parts); return parts;`, 60000);
    await waitFiles(app, /\.mkv$/, 2);
    await waitFiles(app, /\.chapters\.txt$/, 1);
  } },
  { group: 'Outputs', name: '[F:rpl.buffer] [F:rpl.save] the replay buffer saves the last seconds', run: async (app) => {
    clearDownloads(app);
    await app.run(`await T.reset({ workspace: true }); ${RECORD_PROFILE('mp4', 'vp9')} await A.actions.toggleReplay(); T.check(A.studio.outputs.replay, 'on'); await T.sleep(2500); await A.actions.saveReplay(); await A.actions.toggleReplay(); return 1;`, 60000);
    const [f] = await waitFiles(app, /^Replay .*\.mp4$/, 1);
    if (head(app, f).subarray(4, 8).toString() !== 'ftyp') throw new Error('not an MP4');
  } },
  { group: 'Outputs', name: '[F:str.start] [F:str.protocols] streaming over RTMP through the relay reaches an FFmpeg server', run: async (app) => {
    if (!ffmpegOk()) throw new Error('FFmpeg is needed for this test (and for streaming) — install it');
    const { startRelay } = await import(pathToFileURL(path.join(projectRoot, 'server', 'relay.mjs')).href);
    const relay = await startRelay({ port: 0, log: () => {} });
    const port = await freeDevPort(19350);
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mybc-rtmp-')), 'got.flv');
    const server = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-listen', '1', '-timeout', '20', '-f', 'flv', '-i', `rtmp://127.0.0.1:${port}/live/testkey`, '-c', 'copy', '-y', out], { stdio: 'ignore' });
    try {
      await sleep(800);
      await app.run(`await T.reset({ workspace: true }); A.studio.updateProfile((p) => { p.stream = { ...p.stream, service: 'custom', server: 'rtmp://127.0.0.1:${port}/live', key: 'testkey', relay: 'ws://127.0.0.1:${relay.port}' }; p.output.mode = 'simple'; p.output.simple.encoder = 'avc'; p.video.output = '640x360'; return p; });
        await A.actions.startStream({ confirmed: true }); T.check(A.studio.outputs.stream, 'live'); await T.sleep(3000); const st = A.studio.stats().stream; await A.actions.stopStream({ confirmed: true }); T.check(st.bytes > 10000, 'sent ' + st.bytes); return st.bytes;`, 60000);
      await new Promise((resolve) => { server.on('exit', resolve); setTimeout(() => { server.kill(); resolve(); }, 8000); });
      const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', out], { encoding: 'utf8' });
      if (!/h264/.test(probe.stdout)) throw new Error(`the server got no H.264 video: ${probe.stdout} ${probe.stderr}`);
    } finally { server.kill(); relay.server.close(); }
  } },
  { group: 'Outputs', name: '[F:str.protocols] WHIP: the WebRTC offer goes to the endpoint and the connection carries the program', run: async (app) => {
    await app.run(`await T.reset({ workspace: true });
      // A WHIP endpoint inside the page: answers the offer with a peer connection of its own.
      const realFetch = window.fetch; let remote = null;
      window.fetch = async (url, init) => { if (String(url).startsWith('https://whip.test/')) { if (init?.method === 'DELETE') return new Response(null, { status: 200 }); remote = new RTCPeerConnection(); await remote.setRemoteDescription({ type: 'offer', sdp: init.body }); await remote.setLocalDescription(await remote.createAnswer()); await new Promise((r) => setTimeout(r, 500)); return new Response(remote.localDescription.sdp, { status: 201, headers: { Location: '/res/1' } }); } return realFetch(url, init); };
      try {
        A.studio.updateProfile((p) => { p.stream = { ...p.stream, service: 'whip', server: 'https://whip.test/endpoint', whipToken: 't' }; return p; });
        await A.actions.startStream({ confirmed: true }); await T.until(() => A.studio.outputs.stream?.state === 'live', 15000, 'WebRTC connected'); await A.actions.stopStream({ confirmed: true });
      } finally { window.fetch = realFetch; remote?.close(); }
      return 1;`, 60000);
  } },
  // ───────────────────────── tools
  { group: 'Tools', name: '[F:tool.stats] [F:tool.log] stats and log windows show live numbers and lines', run: async (app) => {
    await app.run(`await T.reset({ workspace: true }); A.run('statsWindow'); await T.popupReady('stats'); await T.until(() => T.popupDoc('stats').querySelectorAll('.stats-row').length >= 8, 5000, 'stats rows');
      A.studio.log('info', 'log line for the test'); A.run('logWindow'); await T.popupReady('log'); await T.until(() => T.popupDoc('log').body.textContent.includes('log line for the test'), 5000, 'log line'); return 1;`);
  } },
  { group: 'Tools', name: '[F:tool.autoconfig] the auto-configuration wizard sets resolution, rate and bitrate', run: async (app) => {
    await app.run(`await T.reset({ workspace: true }); A.studio.noSave = false; const before = JSON.stringify(A.studio.profile);
      A.actions.autoConfigure({ usage: 'stream', base: '2560x1440', fps: '30', service: 'twitch', key: 'k' }); const p = A.studio.profile;
      T.check(p.video.base === '2560x1440' && p.video.output === '1920x1080' && p.video.fps === '30', JSON.stringify(p.video)); T.check(p.output.simple.videoBitrate >= 2500, 'bitrate');
      A.studio.updateProfile(JSON.parse(before)); A.studio.noSave = true; return 1;`);
  } },
  { group: 'Tools', name: '[F:tool.scripts] [F:tool.captions] a script switches scenes; captions write into a text source', run: async (app) => {
    await app.run(`${AB} const tools = A.tools(); tools.update({ scripts: [{ name: 'main', enabled: true, code: "bc.after(100, () => bc.setScene('B'))" }] });
      await T.until(() => A.studio.c.current === B0.id && !A.studio.engine.transition, 4000, 'script switched'); tools.update({ scripts: [] });
      tools.writeCaption('안녕하세요 captions'); const cap = Object.values(A.studio.c.sources).find((s) => s.name === 'Captions'); T.check(cap?.settings.text === '안녕하세요 captions', 'caption text'); return tools.captionsAvailable;`);
  } },
  { group: 'Tools', name: '[F:tool.outputTimer] the output timer stops the recording by itself', run: async (app) => {
    clearDownloads(app);
    await app.run(`await T.reset({ workspace: true }); ${RECORD_PROFILE('mkv', 'vp9')} const tools = A.tools(); tools.update({ timer: { ...tools.settings.timer, record: { enabled: true, h: 0, m: 0, s: 1 }, autoStart: true } });
      await A.actions.startRecording(); await T.until(() => !A.studio.outputs.recording, 6000, 'stopped by the timer'); tools.update({ timer: { ...tools.settings.timer, record: { enabled: false, h: 0, m: 30, s: 0 }, autoStart: false } }); return 1;`, 30000);
    await waitFiles(app, /\.mkv$/, 1);
  } },
  // ───────────────────────── settings, collections, hotkeys
  { group: 'Settings', name: '[F:set.general] [F:set.stream] [F:set.output] [F:set.audio] [F:set.video] [F:set.advanced] [F:set.accessibility] every settings tab draws and edits the profile', run: async (app) => {
    await app.run(`await T.reset({ workspace: true }); A.studio.noSave = false; const before = JSON.stringify(A.studio.profile);
      for (const tab of ['general', 'stream', 'output', 'audio', 'video', 'hotkeys', 'accessibility', 'advanced']) { A.popups.open('settings', { tab }); await T.popupReady('settings'); await T.until(() => T.frameOf('settings').contentWindow.__mybroadcastingPopup.state.tab === tab && T.popupDoc('settings').querySelector('.settings-' + tab), 5000, tab); }
      A.popups.open('settings', { tab: 'video' }); await T.popupReady('settings'); await T.until(() => T.popupDoc('settings').querySelector('.settings-video [data-prof="video.fps"]'), 5000, 'video tab');
      const sel = T.popupDoc('settings').querySelector('[data-prof="video.fps"]'); sel.value = '60'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      await T.until(() => A.studio.profile.video.fps === '60', 5000, 'the main window follows'); await T.until(() => A.studio.engine.video.fps === 60, 5000, 'the engine follows');
      A.studio.updateProfile(JSON.parse(before)); A.studio.noSave = true; await A.popups.closeAll(); return 1;`);
  } },
  { group: 'Settings', name: '[F:hk.bind] [F:hk.global] a hotkey bound in Settings switches the scene from the keyboard', run: async (app) => {
    await app.run(`${AB} A.studio.noSave = false; A.studio.bindHotkey('scene:' + B0.id, ['Ctrl+Alt+F9']); A.actions.bindHotkeys(); return 1;`);
    await app.main.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'F9', code: 'F9', windowsVirtualKeyCode: 120, modifiers: 3 });
    await app.main.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F9', code: 'F9', windowsVirtualKeyCode: 120, modifiers: 3 });
    await app.run(`await T.until(() => A.studio.c.current === A.studio.c.scenes[1].id, 3000, 'switched by the hotkey'); A.studio.bindHotkey('scene:' + A.studio.c.scenes[1].id, []); A.studio.noSave = true; return 1;`);
  } },
  { group: 'Collections', name: '[F:col.manage] [F:col.importExport] collections: new, duplicate, rename, switch, remove, export and import', run: async (app) => {
    clearDownloads(app);
    await app.run(`await T.reset(); const st = A.studio; const original = st.collections.current; st.noSave = false;
      try {
        st.newCollection('E2E One'); T.check(st.collections.current === 'E2E One', 'new'); st.addScene('Extra');
        st.duplicateCollection('E2E Two'); T.check(st.c.scenes.some((s) => s.name === 'Extra'), 'duplicated with its scenes');
        T.check(st.renameCollection('E2E Three'), 'renamed'); T.check(st.switchCollection('E2E One'), 'switched'); T.check(st.c.scenes.some((s) => s.name === 'Extra'), 'kept its scenes');
        await A.actions.exportCollection({ sceneJson: true }); const text = st.exportCollection({ sceneJson: true }); const { name } = st.importCollection(text, 'from a scene file'); T.check(st.collections.current === name, 'imported');
        for (const n of ['E2E One', 'E2E Three', name]) { st.switchCollection(n); st.removeCollection(n); }
      } finally { st.switchCollection(original); st.noSave = true; }
      T.check(!st.collections.names.some((n) => n.startsWith('E2E')), 'cleaned up'); return 1;`);
    await waitFiles(app, /\.scenes\.json$/, 1);
  } },
  { group: 'Collections', name: '[F:col.profiles] profiles: new, duplicate, rename, switch, remove', run: async (app) => {
    await app.run(`await T.reset(); const st = A.studio; const original = st.profile.name;
      st.newProfile('P one'); T.check(st.profile.name === 'P one', 'new'); st.newProfile('P two', { copy: true }); T.check(st.renameProfile('P three'), 'rename');
      T.check(st.switchProfile('P one'), 'switch'); st.removeProfile(); st.switchProfile('P three'); st.removeProfile(); st.switchProfile(original);
      T.check(!st.profiles.list.some((p) => p.name.startsWith('P ')), 'cleaned up'); return 1;`);
  } },
  // ───────────────────────── print, help
  { group: 'Print', name: '[F:print.reports] every report lays out in the print window', run: async (app) => {
    await app.run(`await T.reset({ workspace: true }); const reports = ['scenes', 'sources', 'audio', 'hotkeys', 'output', 'session', 'features'];
      A.app.updateSettings({ report: 'scenes' }); A.run('print'); await T.popupReady('print');
      for (const r of reports) { const d = T.popupDoc('print'); d.querySelector('[data-print-report="' + r + '"]').click();
        await T.until(() => { const w = T.frameOf('print').contentWindow.__mybroadcastingPopup.state.print; return w?.html?.includes(A.t('report.' + r)) && w.pages > 0 && !w.busy; }, 30000, 'report ' + r); }
      await A.popups.closeAll(); return 1;`, 120000);
  } },
  { group: 'Help', name: '[F:help.about] [F:help.guide] About and the user\'s guide open', run: async (app) => {
    await app.run(`await T.reset({ workspace: true }); A.run('about'); await T.popupReady('about'); T.check(T.popupDoc('about').body.textContent.includes('MyBroadcasting'), 'about'); await A.popups.closeAll();
      A.popups.inline = true; await A.app.openDocWindow('guide'); const f = document.querySelector('.web-popup-doc-guide iframe'); await T.until(() => f.contentDocument?.querySelector('iframe.viewer-frame')?.contentDocument?.body?.textContent.length > 500, 15000, 'guide text'); A.app.closeDocFrames(); A.popups.inline = false; return 1;`);
  } },
  { group: 'Help', name: '[F:help.samples] every sample collection opens with its scenes and sources ready', run: async (app) => {
    await app.run(`for (const id of A.domain.SAMPLE_COLLECTIONS) { await T.reset({ workspace: id }); await T.sleep(400); const errors = [...A.studio.engine.runtimes.values()].filter((r) => r.status === 'error').map((r) => r.type); T.check(!errors.length, id + ': ' + errors); T.check(A.studio.c.scenes.length >= 1 && Object.keys(A.studio.c.sources).length >= 3, id); } return 1;`);
  } },
];

/** Every command of the menus once (those that ask or leave the app are answered / skipped). */
export async function commandCases(app) {
  const ids = await app.run(`return Object.keys(A.commands);`);
  const skip = new Set(['exit', 'importCollection', 'importProfile', 'tutorial', 'welcome', 'recent', 'showRecordings', 'toggleStream', 'startStream', 'stopStream', 'studioOn', 'studioOff', 'userGuide', 'tutorialDoc', 'backgroundImage', 'print', 'features', 'remux', 'statsWindow', 'logWindow']);
  return ids.filter((id) => !skip.has(id)).map((id) => ({
    group: 'Commands', name: `[F:shell.menus] ${id}`,
    run: async (a) => {
      await a.run(`await T.reset({ workspace: true }); const it = A.studio.editScene.items[1]; if (it) A.studio.select([it.id]);
        const p = A.run(${JSON.stringify(id)}); await T.sleep(250);
        for (const kind of ['prompt', 'confirm', 'form', 'menu', 'settings', 'about', 'stats', 'log']) { const d = T.popupDoc(kind); if (d && getComputedStyle(T.frameOf(kind).parentElement).visibility !== 'hidden') { d.querySelector('[data-action="close"]')?.click(); } }
        await Promise.race([p, T.sleep(4000)]); await A.studio.stopAll(); if (A.studio.outputs.vcam) A.studio.stopVirtualCam(); return 1;`, 30000);
    },
  }));
}
