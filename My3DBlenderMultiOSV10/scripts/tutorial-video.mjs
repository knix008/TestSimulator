// npm run tutorial:video : records the program's own tutorial, done by hand with a visible mouse pointer, and encodes it as
// My3DBlender-Tutorial.mp4 in the project root. Korean, no sound. Needs ffmpeg on the PATH.
// It runs the web build in a headless browser with its own profile: menus are part of the page there, so they are in the picture,
// and the user's settings and projects are not touched.
//   --preview   short pauses and a PNG of every step in test-results/video, no video. Run this first: a recording takes minutes.
//   --en        in English, as My3DBlender-Tutorial.en.mp4
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, sleep, startVite, waitFor } from '../test/e2e/cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const preview = process.argv.includes('--preview');
const rehearse = process.argv.includes('--rehearse');
const language = process.argv.includes('--en') ? 'en' : 'ko';
const OUTPUT = language === 'en' ? 'My3DBlender-Tutorial.en.mp4' : 'My3DBlender-Tutorial.mp4';
const WIDTH = 1920;
const HEIGHT = 1080;
const say = (ko, en) => (language === 'ko' ? ko : en);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'my3d-video-'));
const shotDir = path.join(root, 'test-results', 'video');
if (preview || rehearse) { fs.rmSync(shotDir, { recursive: true, force: true }); fs.mkdirSync(shotDir, { recursive: true }); }

const vite = await startVite(root);
const { cdp, errors, stop } = await launchBrowser(vite.url, { width: WIDTH, height: HEIGHT });
await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false }).catch(() => {});
const js = (expression) => cdp.evaluate(expression);
const hold = (ms) => sleep(preview || rehearse ? Math.min(ms, 120) : ms);
const tid = (id) => `[data-testid="${id}"]`;
const rect = (selector) => js(`(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 } : null; })()`);

// ── The picture
let recording = false;
const frames = [];
async function recorder() {
  let n = 0;
  while (recording) {
    const at = performance.now();
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    const file = path.join(work, `f${String(n++).padStart(6, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, at });
    // About 15 pictures a second at most; slower when the machine is busy, and the durations follow.
    await sleep(Math.max(0, 66 - (performance.now() - at)));
  }
}

// ── The pointer: drawn in the page, as a headless browser has none.
const installPointer = () => js(`(() => {
  if (document.getElementById('video-pointer')) return;
  const p = document.createElement('div');
  p.id = 'video-pointer';
  p.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(960px,540px)';
  p.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l14 11-6.200.8 3.800 7.200-2.800 1.400-3.700-7.300L4 19z" fill="#fff" stroke="#000" stroke-width="1.500" stroke-linejoin="round"/></svg>';
  document.body.append(p);
  const r = document.createElement('div');
  r.id = 'video-ring';
  r.style.cssText = 'position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid #ff9a3c;z-index:2147483646;pointer-events:none;opacity:0';
  document.body.append(r);
})()`);
let mouse = { x: 960, y: 540 };
const showPointer = (x, y) => js(`document.getElementById('video-pointer').style.transform = 'translate(${x}px, ${y}px)'`);
const ring = (x, y) => js(`(() => { const r = document.getElementById('video-ring'); r.style.left = '${x}px'; r.style.top = '${y}px'; r.animate([{ opacity: 1, transform: 'scale(.5)' }, { opacity: 0, transform: 'scale(1.4)' }], { duration: 420 }); })()`);
async function moveTo(x, y, { button = 'none', buttons = 0, modifiers = 0, ms = 450 } = {}) {
  const steps = preview ? 2 : Math.max(4, Math.round(ms / 22));
  const from = mouse;
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const e = k * k * (3 - 2 * k);
    const [px, py] = [from.x + (x - from.x) * e, from.y + (y - from.y) * e];
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py, button, buttons, modifiers });
    await showPointer(px, py);
    if (!preview) await sleep(16);
  }
  mouse = { x, y };
}
async function press(button = 'left', modifiers = 0) {
  await ring(mouse.x, mouse.y);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mouse.x, y: mouse.y, button, buttons: button === 'right' ? 2 : 1, clickCount: 1, modifiers });
}
const release = (button = 'left', modifiers = 0) => cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mouse.x, y: mouse.y, button, clickCount: 1, modifiers });
async function clickAt(x, y, button = 'left') {
  await moveTo(x, y);
  await hold(180);
  await press(button);
  await sleep(40);
  await release(button);
  await hold(260);
}
async function clickId(id) {
  const r = await waitFor(() => rect(tid(id)), 6000);
  await clickAt(r.cx, r.cy);
}
const key = async (k, code, vk) => {
  const text = k.length === 1 ? k : undefined;
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text, windowsVirtualKeyCode: vk });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
};
/** A row of the open menu, by its words. */
const menuRow = (pattern) => js(`(() => { const list = [...document.querySelectorAll('.menu .menu-item')]; const row = list.reverse().find((x) => ${pattern}.test(x.textContent)); if (!row) return null; const r = row.getBoundingClientRect(); return { cx: r.x + Math.min(r.width / 2, 90), cy: r.y + r.height / 2 }; })()`);
async function menuPick(pattern) {
  const r = await waitFor(() => menuRow(pattern), 4000);
  await clickAt(r.cx, r.cy);
}
const canvas = () => rect("[data-testid=area-view3d] canvas");
const worldToScreen = async (p) => {
  const c = await canvas();
  const s = await js(`window.__my3d.editorsOf('view3d')[0].api.project(${JSON.stringify(p)})`);
  return { x: c.x + s.x, y: c.y + s.y };
};
const stepCount = () => js("Number(document.querySelector('[data-testid=tutorial-count]').textContent.split('/')[1])");
const reading = async () => {
  const words = await js("document.querySelector('[data-testid=tutorial-text]').textContent.length");
  await hold(Math.max(3000, words * (language === 'ko' ? 75 : 45)));
};
let shotNumber = 0;
const mark = async (name) => {
  if (!preview) return;
  await sleep(120);
  await cdp.screenshot(path.join(shotDir, `${String(++shotNumber).padStart(2, '0')}-${name}.png`));
};
const nextReady = () => waitFor(() => js("Boolean(document.querySelector('[data-testid=tutorial-next]')) && !document.querySelector('[data-testid=tutorial-next]').disabled"), 60000, 100);
const next = async () => { await nextReady(); await hold(700); await clickId('tutorial-next'); await sleep(250); };

process.on('uncaughtException', async (error) => {
  console.error(error);
  try {
    fs.mkdirSync(shotDir, { recursive: true });
    console.error('menus open:', await js("document.querySelectorAll('.menu').length"), 'rows:', await js("[...document.querySelectorAll('.menu .menu-item')].map((x) => x.textContent).join(' | ').slice(0, 400)"));
    await cdp.screenshot(path.join(shotDir, 'fail.png'));
  } catch { /* gone */ }
  process.exit(1);
});
// ── The recording
await js(`localStorage.clear(); localStorage.setItem('my3d.settings', JSON.stringify({ language: '${language}' }))`);
await cdp.send('Page.reload');
await sleep(800);
await waitFor(() => js('document.readyState === "complete" && Boolean(window.__my3d)'), 30000);
await waitFor(() => js(`Boolean(document.querySelector('${tid('tutorial-ask-run').replaceAll('"', '\\"')}'))`), 10000).catch(() => {});
await js('document.fonts.ready');
await installPointer();
recording = true;
const recordingDone = preview ? null : recorder();

await hold(3500);
await mark('popup');
await clickId('tutorial-ask-run');
await sleep(400);
await waitFor(() => js(`Boolean(document.querySelector('${tid('tutorial-card').replaceAll('"', '\\"')}'))`), 6000);
const total = await stepCount();

// 1 welcome, 2 the window
await reading();
await mark('welcome');
await next();
await reading();
await mark('window');
await next();

// 3 turn the view
await reading();
{
  const c = await canvas();
  await moveTo(c.x + c.w * 0.5, c.y + c.h * 0.42);
  await hold(300);
  await press('right');
  await moveTo(mouse.x + 170, mouse.y + 26, { button: 'right', buttons: 2, ms: 1300 });
  await release('right');
}
await hold(900);
await mark('orbit');
await next();

// 4 zoom
await reading();
{
  const c = await canvas();
  await moveTo(c.x + c.w * 0.5, c.y + c.h * 0.45);
  for (const deltaY of [120, 120, 120, 120, -120, -120, -120, -120, -120, -120]) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: mouse.x, y: mouse.y, deltaX: 0, deltaY });
    await hold(320);
  }
}
await mark('zoom');
await next();

// 5 select the cube
await reading();
{
  const p = await worldToScreen([0, 0, 0]);
  await clickAt(p.x, p.y);
}
await hold(900);
await mark('select');
await next();

// 6 add a ball
await reading();
await clickId('menu-add');
{
  const r = await waitFor(() => menuRow(/^(메시|Mesh)$/), 4000);
  // Straight down first: going sideways along the menu titles would open the next menu.
  await moveTo(mouse.x, r.cy, { ms: 300 });
  await moveTo(r.cx, r.cy, { ms: 250 });
  // Resting on a row opens its submenu; pressing as well would close it again.
  await sleep(600);
  if (!(await menuRow(/UV ?구|UV Sphere/))) { await press('left'); await release('left'); }
  await hold(700);
  await mark('add-menu');
  // Along the row first, so that the way there does not cross the other rows.
  const target = await waitFor(() => menuRow(/UV ?구|UV Sphere/), 4000);
  await moveTo(target.cx, r.cy, { ms: 350 });
  await menuPick(/UV ?구|UV Sphere/);
}
await hold(900);
await mark('add');
await next();

// 7 put it on top: G, Z, move, click
await reading();
{
  const p = await worldToScreen([0, 0, 0]);
  await moveTo(p.x + 40, p.y);
  await hold(300);
  await key('g', 'KeyG', 71);
  await hold(300);
  await key('z', 'KeyZ', 90);
  await hold(300);
  const up = await worldToScreen([0, 0, 2.1]);
  await moveTo(p.x + 40, p.y - Math.abs(up.y - p.y), { ms: 1300 });
  await hold(300);
  await press('left');
  await release('left');
}
await hold(900);
await mark('move');
await next();

// 8 smooth, from the right-click menu
await reading();
{
  const ball = await js("window.__my3d.doc.objects.find((o) => /sphere/i.test(o.name)).location");
  const p = await worldToScreen(ball);
  await clickAt(p.x, p.y, 'right');
  await hold(700);
  await mark('context-menu');
  const row = await menuRow(/부드러운 셰이딩|Shade Smooth/);
  if (row) await clickAt(row.cx, row.cy);
  else { await key('Escape', 'Escape', 27); await clickId('tutorial-do'); }
}
await hold(1100);
await mark('smooth');
await next();

// 9 a modifier: the wrench tab, Add Modifier, Subdivision Surface
await reading();
await clickId('tab-modifiers');
await hold(500);
await clickId('add-modifier');
await hold(500);
{
  const r = await menuRow(/서브디비전|Subdivision/);
  if (r) await clickAt(r.cx, r.cy);
  else { await key('Escape', 'Escape', 27); await clickId('tutorial-do'); }
}
await hold(1200);
await mark('modifier');
{
  const p = await worldToScreen([0, 0, 0]);
  await clickAt(p.x, p.y + 20, 'right');
  await hold(700);
  const row = await menuRow(/부드러운 셰이딩|Shade Smooth/);
  if (row) await clickAt(row.cx, row.cy);
  else { await key('Escape', 'Escape', 27); await clickId('tutorial-do'); }
  await hold(1100);
}
await next();

// 10 colour. The colour picker is the system's and not in the picture: Do It for Me chooses one.
await reading();
await clickId('tab-material');
await hold(500);
await clickId('material-new').catch(() => {});
await hold(900);
await clickId('tutorial-do');
await hold(1300);
await mark('colour');
await next();

// 11 keyframes: I at frame 1, frame 40 raised, I again, and play
await reading();
{
  const c = await canvas();
  await moveTo(c.x + c.w * 0.6, c.y + c.h * 0.5);
  await hold(300);
  await key('i', 'KeyI', 73);
  await hold(800);
  const pick = await menuRow(/위치|Location/).catch(() => null);
  if (pick) { await clickAt(pick.cx, pick.cy); await hold(300); }
  await js('window.__my3d.setFrame(40)');
  await hold(800);
  await js("(() => { const a = window.__my3d; const b = a.doc.objects.find((o) => /sphere/i.test(o.name)); b.location[2] = 4; a.touch(); })()");
  await hold(800);
  await moveTo(c.x + c.w * 0.6, c.y + c.h * 0.5);
  await key('i', 'KeyI', 73);
  await hold(800);
  const pick2 = await menuRow(/위치|Location/).catch(() => null);
  if (pick2) { await clickAt(pick2.cx, pick2.cy); await hold(300); }
  await js('window.__my3d.setFrame(1)');
  await hold(600);
  await mark('keys');
  const done = await js("document.querySelector('[data-testid=tutorial-task-two]')?.dataset.done");
  if (done !== 'yes') await clickId('tutorial-do');
  await key(' ', 'Space', 32);
  await hold(3000);
  await key(' ', 'Space', 32);
  await js('window.__my3d.playing && window.__my3d.togglePlay(); window.__my3d.setFrame(1)');
}
await hold(800);
await next();

// 12 through the camera
await reading();
await clickId('nav-camera');
await hold(1400);
await mark('camera');
await next();

// 13 render, and look at the result
await reading();
await key('F12', 'F12', 123);
await nextReady();
await hold(1200);
await clickId('ws-rendering');
await hold(4500);
await mark('render');
await clickId('ws-layout');
await hold(600);
await next();

// 14 the end
await waitFor(() => rect(tid('tutorial-done')), 4000);
await reading();
await mark('finish');
await clickId('tutorial-done');
await hold(2000);
await mark('end');

recording = false;
await recordingDone;
const count = await js('window.__my3d.doc.objects.length');
await stop();
await vite.stop?.();
if (errors.length) console.log(`Page errors: ${errors.join(' | ').slice(0, 500)}`);
console.log(`${total} steps, ${count} objects at the end.`);

if (preview) { console.log(`Pictures: ${shotDir}`); process.exit(errors.length ? 1 : 0); }

// ── Encoding
const list = path.join(work, 'frames.txt');
const lines = [];
frames.forEach((f, i) => {
  const until = frames[i + 1]?.at ?? f.at + 66;
  lines.push(`file '${f.file.replaceAll('\\', '/')}'`, `duration ${((until - f.at) / 1000).toFixed(4)}`);
});
lines.push(`file '${frames.at(-1).file.replaceAll('\\', '/')}'`);
fs.writeFileSync(list, lines.join('\n'));
const target = path.join(root, OUTPUT);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `fps=30,scale=${WIDTH}:${HEIGHT},format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-an', '-movflags', '+faststart', target], { stdio: 'inherit' });
fs.rmSync(work, { recursive: true, force: true });
console.log(`${OUTPUT}: ${(fs.statSync(target).size / 1048576).toFixed(1)} MB, ${((frames.at(-1).at - frames[0].at) / 60000).toFixed(1)} min, ${frames.length} pictures. ${say('무음, 한국어.', 'Silent, in English.')}`);
process.exit(errors.length ? 1 : 0);
