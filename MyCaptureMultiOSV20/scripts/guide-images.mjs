// npm run guide:images — screenshots for the user's guide (doc/images/{ko,en}/*.png).
//
// Drives the real debug app with the E2E harness (own WebView2 profile, so the
// user's settings are never touched). Nothing of the real screen goes into the
// pictures: the preview and the capture history are filled with drawn demo images
// and the window list with made-up windows before each screenshot.
//
// Needs the debug binary: cargo build --manifest-path src-tauri/Cargo.toml
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const { App } = await import(pathToFileURL(path.join(root, 'test', 'e2e', 'harness.mjs')).href);

const WIDTH = 1180;
const HEIGHT = 760;

// Runs in the page: a drawn "desktop" picture (no real screen content).
const DEMO = `(() => {
  const picture = (w, h, hue, label) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, 'hsl(' + hue + ' 60% 55%)');
    sky.addColorStop(1, 'hsl(' + ((hue + 40) % 360) + ' 55% 30%)');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    const s = w / 1920;
    g.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 6; i += 1) { g.beginPath(); g.arc((200 + i * 300) * s, (900 - (i % 3) * 120) * s, (260 + i * 30) * s, 0, Math.PI * 2); g.fill(); }
    const win = (x, y, ww, wh, tint) => {
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect((x + 10) * s, (y + 12) * s, ww * s, wh * s);
      g.fillStyle = '#fbfcfe'; g.fillRect(x * s, y * s, ww * s, wh * s);
      g.fillStyle = tint; g.fillRect(x * s, y * s, ww * s, 46 * s);
      g.fillStyle = '#e3e8f0';
      for (let r = 0; r < 7; r += 1) g.fillRect((x + 30) * s, (y + 80 + r * 52) * s, (ww - 60 - (r % 3) * 90) * s, 22 * s);
    };
    win(180, 140, 900, 560, 'hsl(' + hue + ' 55% 45%)');
    win(820, 360, 860, 520, 'hsl(' + ((hue + 160) % 360) + ' 50% 45%)');
    g.fillStyle = 'rgba(15,20,30,0.75)'; g.fillRect(0, h - 70 * s, w, 70 * s);
    g.fillStyle = '#fff'; g.font = 'bold ' + Math.round(40 * s) + 'px Segoe UI'; g.fillText(label, 40 * s, h - 22 * s);
    return c.toDataURL('image/jpeg', 0.86);
  };
  const s = window.__mycapture.state;
  s.preview = { url: picture(1920, 1200, 210, 'Demo'), caption: '1920 × 1200' };
  s.previewLoading = false;
  const now = Date.now();
  s.gallery = [
    { id: 'demo1', kind: 'image', path: 'C:\\\\Users\\\\me\\\\Pictures\\\\Capture_2026-11-17_09-12-40.png', thumbnail: picture(384, 240, 200, 'PNG'), width: 1920, height: 1200, bytes: 812345, at: now - 4e5 },
    { id: 'demo2', kind: 'image', path: 'C:\\\\Users\\\\me\\\\Pictures\\\\Capture_2026-11-17_09-20-02.jpg', thumbnail: picture(384, 240, 30, 'JPG'), width: 1280, height: 720, bytes: 254000, at: now - 3e5 },
    { id: 'demo3', kind: 'video', path: 'C:\\\\Users\\\\me\\\\Videos\\\\Recording_2026-11-17_09-31-55.mp4', thumbnail: picture(384, 240, 280, 'MP4'), width: 1920, height: 1080, durationMs: 42000, bytes: 9.2e6, at: now - 2e5 },
    { id: 'demo4', kind: 'image', path: 'C:\\\\Users\\\\me\\\\Pictures\\\\Capture_2026-11-17_09-40-18.jpg', thumbnail: picture(384, 240, 140, 'JPG'), width: 800, height: 600, bytes: 120000, at: now - 1e5 },
  ];
  s.missing = new Set();
  s.windows = [
    ['Document - Editor', 'editor.exe', 30], ['Calculator', 'calc.exe', 200], ['Photos', 'photos.exe', 120], ['Terminal', 'terminal.exe', 260],
  ].map(([title, appName, hue], i) => ({ id: 9000 + i, title, appName, width: 1280 - i * 80, height: 800 - i * 40 }));
  s.thumbs = new Map(s.windows.map((w, i) => [w.id, picture(320, 200, [30, 200, 120, 260][i], '')]));
  s.notice = null;
  window.__mycapture.render();
  return 1;
})()`;

// Pictures go to a scratch folder first: the guide window bundles doc/images, so a
// new file there makes the dev server reload the app in the middle of the run.
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'mycapture-guide-images-'));
const app = new App();
await app.start();
const shots = [];
const save = async (page, language, name, clip) => {
  const result = await page.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
  if (!result.result?.data) throw new Error(`${name}: ${JSON.stringify(result.error ?? result)}`);
  const dir = path.join(staging, language);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.png`), Buffer.from(result.result.data, 'base64'));
  shots.push(`${language}/${name}.png`);
};
const main = () => app.main;
// Real previews and window lists load in the background; let them land, then cover them.
const demo = async () => { await sleep(1500); await main().eval(DEMO); await sleep(250); };
const setSize = (w, h) => main().eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: ${w}, height: ${h} } } }).then(() => 1)`);
const rectOf = async (selector, pad = 0) => { await main().waitFor(`document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect().width > 0`, { message: selector }); return rectOnce(selector, pad); };
const rectOnce = async (selector, pad) => JSON.parse(await main().eval(`JSON.stringify((() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.max(0, r.left - ${pad}), y: Math.max(0, r.top - ${pad}), width: Math.min(innerWidth, r.width + ${pad * 2}), height: r.height + ${pad * 2} }; })())`));

try {
  await setSize(WIDTH, HEIGHT);
  for (const language of ['ko', 'en']) {
    const base = { language, theme: 'light-classic', mode: 'capture', target: 'monitor', monitorId: null, sidebarCollapsed: false, historyCollapsed: false,
      // Demo folders: no real user name in the pictures (nothing is saved during the run).
      imageDirectory: 'C:\\Users\\me\\Pictures', videoDirectory: 'C:\\Users\\me\\Videos' };
    // Start screen
    await app.reset({ ...base, showStartScreen: true });
    await demo();
    await main().eval(`localStorage.removeItem('mycapture.startLayout.v1'); window.__mycapture.actions['start-arrange'](); 1`);
    await sleep(500);
    await save(main(), language, 'start');
    await save(main(), language, 'titlebar', await rectOf('#bar'));
    // Dark start screen
    await main().eval(`window.__mycapture.actions['theme-set']('dark-midnight'); 1`);
    await demo();
    await sleep(300);
    await save(main(), language, 'start-dark');
    await main().eval(`window.__mycapture.actions['theme-set']('light-classic'); 1`);

    // Main window, image capture
    await main().eval(`window.__mycapture.actions['start-close'](); 1`);
    await demo();
    await save(main(), language, 'main-capture');
    // Window list
    await main().eval(`window.__mycapture.state.settings.target = 'window'; 1`);
    await main().eval(`window.__mycapture.actions.target('window'); 1`);
    await sleep(300);
    await demo();
    await main().eval(`(() => { const s = window.__mycapture.state; s.settings = { ...s.settings, windowId: 9000 }; window.__mycapture.render(); return 1; })()`);
    await sleep(200);
    await save(main(), language, 'target-window', await rectOf('#sources'));
    await main().eval(`window.__mycapture.actions.target('monitor'); 1`);

    // Screen recording
    await main().eval(`window.__mycapture.actions.mode('record'); 1`);
    await demo();
    await save(main(), language, 'main-record');
    await main().eval(`window.__mycapture.actions.mode('capture'); 1`);

    // Both panels collapsed from the title bar
    await main().eval(`window.__mycapture.actions.sidebar(); window.__mycapture.actions['history-panel'](); 1`);
    await demo();
    await save(main(), language, 'panels-collapsed');
    await main().eval(`window.__mycapture.actions.sidebar(); window.__mycapture.actions['history-panel'](); 1`);

    // Viewer with a history entry
    await demo();
    await main().eval(`(() => { window.__mycapture.state.result = null; return 1; })()`);
    await save(main(), language, 'history', await rectOf('#history'));

    // Theme dropdown and the settings' theme tab
    await main().click('[data-action="theme-menu"]');
    const menu = await app.popup('theme-menu');
    await sleep(400);
    await save(menu, language, 'theme-menu');
    await menu.key('Escape');
    menu.close();
    await main().eval(`window.__mycapture.actions['theme-custom'](); 1`);
    const settings = await app.popup('settings');
    await sleep(500);
    await save(settings, language, 'settings-theme');
    await settings.click('[data-action="settings-tab"][data-value="save"]');
    await sleep(300);
    await save(settings, language, 'settings-save');
    await settings.key('Escape');
    settings.close();

    // The user's guide window
    await main().click('#bar [data-action="open-guide"]');
    const guide = await app.popup('guide');
    await sleep(700);
    await guide.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'popup-guide', value: { Logical: { width: 980, height: 640 } } }).then(() => 1)`);
    await sleep(400);
    await save(guide, language, 'guide');
    await guide.key('Escape');
    guide.close();
    await sleep(300);
  }
  for (const shot of shots) {
    const target = path.join(root, 'doc', 'images', shot);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(staging, shot), target);
  }
  console.log(`${shots.length} images:\n  ${shots.join('\n  ')}`);
} finally {
  await app.stop();
  fs.rmSync(staging, { recursive: true, force: true });
}
