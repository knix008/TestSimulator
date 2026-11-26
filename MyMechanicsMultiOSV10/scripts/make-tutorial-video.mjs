// npm run tutorial:video — plays the tutorial's ten lessons (doc/Tutorial.md) in the real web app and records them:
//   doc/video/MyMechanics-Tutorial.mp4  (or …Tutorial.en.mp4 with --lang en), with a copy in the project root.
//   node scripts/make-tutorial-video.mjs [--lang ko|en] [--only 1,3] [--gpu] [--keep]
// Headless Edge over CDP on its own Vite (a free port — never the dev server on 5494). The lessons are driven through
// window.__mymechanics and the guide's helpers (scripts/guide-helpers.mjs) while a drawn pointer moves to every button
// it presses and a caption says what happens. Frames are screenshots taken one after the other (each with its time:
// a headless page stops drawing by itself after a while, a screenshot makes it draw) and each is held until the next
// one (ffmpeg concat durations), so the video runs at real speed. Silent. --only records just those lessons (a quick
// look, not copied to the root). Needs ffmpeg (PATH, FFMPEG=…, or Chocolatey's).
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freeDevPort } from './dev-port.mjs';
import { installHelpers } from './guide-helpers.mjs';
import { Page, waitTarget, sleep } from '../test/e2e/cdp.mjs';
import { LESSONS as PLAN } from './tutorial-plan.mjs';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i < 0 ? def : args[i + 1]; };
const lang = opt('--lang', 'ko') === 'en' ? 'en' : 'ko';
const only = opt('--only', '') ? new Set(opt('--only').split(',').map(Number)) : null;
const gpu = args.includes('--gpu');
const WIDTH = 1600;
const HEIGHT = 960;
const baseName = lang === 'en' ? 'MyMechanics-Tutorial.en' : 'MyMechanics-Tutorial';

function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return 'ffmpeg'; } catch { /* not on PATH */ }
  const choco = 'C:/ProgramData/chocolatey/bin/ffmpeg.exe';
  if (fs.existsSync(choco)) return choco;
  throw new Error('ffmpeg is needed (on PATH or FFMPEG=path)');
}

// ───────────────────────── the pointer, captions and title cards (run in the page as window.__v)

function installVideo(lang) {
  const g = window.__g;
  const { m, sleep, rectOf } = g;
  const T = (ko, en) => (lang === 'en' ? en : ko);
  const css = document.createElement('style');
  css.textContent = `
    #tv-cursor { position: fixed; left: 0; top: 0; width: 26px; height: 26px; z-index: 2147483647; pointer-events: none; transform: translate(-3px, -2px); filter: drop-shadow(0 2px 3px rgba(0,0,0,.45)); }
    .tv-ripple { position: fixed; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; border: 3px solid #e11d48; z-index: 2147483646; pointer-events: none; animation: tv-ripple .55s ease-out forwards; }
    @keyframes tv-ripple { from { transform: scale(.3); opacity: 1; } to { transform: scale(1.4); opacity: 0; } }
    #tv-caption { position: fixed; left: 50%; bottom: 46px; transform: translateX(-50%); max-width: 1100px; z-index: 2147483645; pointer-events: none; display: flex; align-items: center; gap: 12px; padding: 10px 18px; border-radius: 12px; background: rgba(17, 24, 39, .88); color: #fff; font: 600 19px/1.4 "Segoe UI", "Malgun Gothic", sans-serif; box-shadow: 0 6px 24px rgba(0,0,0,.35); transition: opacity .25s; }
    #tv-caption .chip { flex: none; padding: 3px 10px; border-radius: 999px; background: #e11d48; font-size: 14px; }
    #tv-card { position: fixed; inset: 0; z-index: 2147483646; display: grid; place-content: center; text-align: center; gap: 14px; background: linear-gradient(135deg, #0f172a, #1e3a8a); color: #fff; font-family: "Segoe UI", "Malgun Gothic", sans-serif; transition: opacity .4s; }
    #tv-card .n { font-size: 22px; letter-spacing: .2em; color: #fda4af; font-weight: 700; }
    #tv-card .t { font-size: 46px; font-weight: 800; }
    #tv-card .s { font-size: 21px; color: #cbd5e1; max-width: 1000px; }`;
  document.head.append(css);
  const cursor = document.createElement('div');
  cursor.id = 'tv-cursor';
  cursor.innerHTML = '<svg viewBox="0 0 26 26" width="26" height="26"><path d="M3 2 L3 21 L8 16.5 L11.5 24 L14.8 22.6 L11.3 15.2 L18 15.2 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.body.append(cursor);
  let at = { x: innerWidth / 2, y: innerHeight / 2 };
  const place = (p) => { at = { x: p.x, y: p.y }; cursor.style.left = `${p.x}px`; cursor.style.top = `${p.y}px`; };
  place(at);
  // Real input from CDP (the sketch's mouse clicks) moves the pointer too.
  addEventListener('mousemove', (e) => place({ x: e.clientX, y: e.clientY }), true);
  addEventListener('mousedown', (e) => v.ripple({ x: e.clientX, y: e.clientY }), true);
  const pointOf = (target) => {
    if (target && typeof target === 'object' && 'x' in target && !('w' in target)) return target;
    const r = rectOf(target);
    return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null;
  };
  const v = {
    T,
    /** Moves the drawn pointer to a target (selector, element, rect or point) in `ms`. */
    async go(target, ms = 650) {
      if (v.fast) return true;
      const p = pointOf(target);
      if (!p) return false;
      const from = { ...at }; const t0 = performance.now();
      while (true) {
        const k = Math.min(1, (performance.now() - t0) / ms);
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        place({ x: from.x + (p.x - from.x) * e, y: from.y + (p.y - from.y) * e });
        if (k >= 1) break;
        await sleep(16);
      }
      return true;
    },
    ripple(p = at) { const r = document.createElement('div'); r.className = 'tv-ripple'; r.style.left = `${p.x}px`; r.style.top = `${p.y}px`; document.body.append(r); setTimeout(() => r.remove(), 700); },
    /** Points at an element and clicks it; `fallback` runs when it is not on the screen. */
    async click(target, fallback, pause = 350) {
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      if (el && rectOf(el)) {
        await v.go(el); v.ripple(); await sleep(120);
        el.click();
      } else if (fallback) await fallback();
      await g.settle(pause);
    },
    async cmd(id, pause) {
      // A command inside a CommandManager flyout: point at its ▾ and run it (the flyout's button then shows it).
      const box = !document.querySelector(`#palette-host [data-command="${id}"]`) && document.querySelector(`#palette-host [data-fly-items~="${id}"]`);
      if (box) { await v.go(box.querySelector('[data-fly]')); v.ripple(); await sleep(200); await m.run(id); await g.settle(pause ?? 350); return; }
      return v.click(document.querySelector(`#palette-host [data-command="${id}"]`) ?? document.querySelector(`[data-command="${id}"]`), () => m.run(id), pause);
    },
    /** Types a value into a PropertyManager field, one character after the other. */
    async type(key, value, unit = 'length') {
      const input = document.querySelector(`#left-panel [data-pm-field="${key}"]`);
      if (input) {
        await v.go(input); v.ripple(); input.focus();
        for (let i = 1; i <= value.length; i++) { input.value = value.slice(0, i); await sleep(110); }
      }
      m.actions.pmFieldChanged(key, value, unit);
      await g.settle(700);
    },
    async ok(pause = 900) { await v.click('#left-panel .pm-ok', () => m.actions.acceptEditing(), pause); },
    caption(text) {
      let c = document.getElementById('tv-caption');
      if (!c) { c = document.createElement('div'); c.id = 'tv-caption'; document.body.append(c); }
      c.innerHTML = `${v.chip ? `<span class="chip">${v.chip}</span>` : ''}<span>${text}</span>`;
      c.style.opacity = '1';
    },
    hideCaption() { const c = document.getElementById('tv-caption'); if (c) c.style.opacity = '0'; },
    async card(n, title, sub, ms = 2600) {
      const c = document.createElement('div'); c.id = 'tv-card'; c.style.opacity = '0';
      c.innerHTML = `${n ? `<div class="n">${n}</div>` : ''}<div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}`;
      document.body.append(c);
      await sleep(30); c.style.opacity = '1';
      await sleep(ms);
      c.style.opacity = '0'; await sleep(450); c.remove();
    },
    /** Turns the view about the vertical axis by `dx` pixels' worth of dragging over `ms`. */
    async orbit(dx = 360, ms = 3000, dy = 0) {
      const vp = m.viewport; const steps = Math.max(1, Math.round(ms / 33));
      for (let i = 0; i < steps; i++) { vp.rotateBy(dx / steps, dy / steps); await sleep(33); }
      await g.settle(100);
    },
    async hold(ms) { if (!v.fast) await sleep(ms); },

    // ——— the tutorial robot, replayed step by step (scripts/tutorial-plan.mjs) ———
    /** Points at a command's button (or the flyout that holds it). */
    async point(id) {
      const el = document.querySelector(`#palette-host [data-command="${id}"]`) ?? document.querySelector(`#palette-host [data-fly-items~="${id}"] [data-fly]`) ?? document.querySelector(`[data-command="${id}"]`);
      if (el) { await v.go(el, 450); v.ripple(); await sleep(150); }
    },
    async robotStep(d, view) {
      const R = (v.robot ??= m.tutorial.robot(lang));
      const map = (v.map ??= { parts: new Map(), asm: new Map(), drawing: null });
      const [gripSrc, robotSrc] = R.assemblies;
      const asmSrc = (key) => (key === 'grip' ? gripSrc : robotSrc);
      const asmOf = (key) => m.project.assemblies.find((a) => a.id === map.asm.get(asmSrc(key).id));
      const showDoc = async (kind, id) => { if (m.active()?.id !== id) { m.actions.switchDocument({ kind, id }); await g.settle(700); } };
      const cmdOf = (f) => ({ extrude: f.op === 'cut' ? 'cutExtrude' : 'extrude', revolve: f.op === 'cut' ? 'cutRevolve' : 'revolve', plane: 'refPlane' }[f.type] ?? f.type);
      if (d.newPart !== undefined) {
        const src = R.parts[d.newPart];
        if (d.newPart === 0) {
          await g.reset(); m.actions.showStartPage(true); await g.settle(800);
          await v.click('[data-start="template"][data-value="part"]', () => m.actions.newDocument('part'), 900);
          if (!m.active() || m.state.showStart) { await m.actions.newDocument('part'); await g.settle(600); }
        } else {
          await v.click('#toolbar [data-command="newPart"]', () => m.run('newPart'), 900);
        }
        const part = m.active();
        m.actions.change('op.rename', (p) => { if (d.newPart === 0) p.name = R.name; Object.assign(part, { name: src.name, material: src.material, partNo: src.partNo, description: src.description ?? '', color: src.color ?? null }); });
        map.parts.set(src.id, part.id);
        await g.settle(500);
        const field = document.querySelector('#right-panel [data-prop="name"], #right-panel input');
        if (field) { await v.go(field); g.mark(field, null, null, { pad: 2 }); await v.hold(1200); g.clear(); }
        document.querySelector('#palette-host [data-cm-tab="features"]')?.click();
        if (d.then) await v.robotStep(d.then, view);
      }
      if (d.part !== undefined) {
        const src = R.parts[d.part];
        await showDoc('part', map.parts.get(src.id));
        const part = m.active();
        for (let i = d.from; i <= d.to; i++) {
          const f = src.features[i];
          if (f.type === 'sketch') {
            await v.point(i === 0 || src.features[i - 1]?.type !== 'plane' ? 'sketch' : 'sketch');
            m.actions.change('op.sketch', () => { part.features.push(structuredClone(f)); });
            await g.settle(500);
            m.actions.select([{ kind: 'feat', id: f.id }]); await g.settle(300);
            const row = g.featureRow(f); if (row) await v.go(row, 400);
            await v.hold(900);
            m.actions.select([]);
          } else {
            await v.point(cmdOf(f));
            m.tutorial.begin(f); await g.settle(900);
            if (i === d.from || f.type !== 'plane') await g.fit();
            await v.hold(f.type === 'plane' ? 600 : 1100);
            await v.ok(900);
          }
        }
        if (view) await g.view(view);
        await g.fit();
      }
      if (d.newAssembly) {
        const src = asmSrc(d.newAssembly);
        await v.point('newMenu');
        await m.run('newAssembly'); await g.settle(800);
        const asm = m.active();
        m.actions.change('op.rename', () => Object.assign(asm, { name: src.name, partNo: src.partNo ?? '', description: src.description ?? '' }));
        map.asm.set(src.id, asm.id);
        document.querySelector('#palette-host [data-cm-tab="assembly"]')?.click();
        await g.settle(400);
        if (d.then) await v.robotStep(d.then, view);
      }
      if (d.components) {
        const src = asmSrc(d.components); const asm = asmOf(d.components);
        await showDoc('assembly', asm.id);
        for (const i of d.items) {
          const c = structuredClone(src.components[i]);
          if (c.part) c.part = map.parts.get(c.part);
          if (c.sub) c.sub = map.asm.get(c.sub);
          await v.point('insertComponent');
          m.actions.change('op.insertComponent', () => { asm.components.push(c); });
          await g.settle(600); await g.fit(); await v.hold(700);
        }
      }
      if (d.mates) {
        const src = asmSrc(d.mates); const asm = asmOf(d.mates);
        await showDoc('assembly', asm.id);
        for (const i of d.items) {
          const mate = structuredClone(src.mates[i]);
          await v.point('mate');
          m.actions.startMate(); await g.settle(300);
          const e = m.state.editing;
          e.mate = mate; e.isNew = true; e.pick = null;
          m.actions.pmSet('type', mate.type); await g.settle(900);
          await v.hold(900);
          await v.ok(900);
        }
        await g.fit();
      }
      if (d.motors) {
        const src = asmSrc(d.motors); const asm = asmOf(d.motors);
        await showDoc('assembly', asm.id);
        if (d.items.length) {
          await v.point('motion');
          m.actions.change('op.motion', () => {
            asm.motion ??= { duration: src.motion.duration, motors: [] };
            asm.motion.duration = src.motion.duration;
            for (const i of d.items) asm.motion.motors.push(structuredClone(src.motion.motors[i]));
          });
          await g.settle(500);
        }
        if (d.play) {
          const play = document.querySelector('[data-player="play"]');
          if (play) { await v.go(play); v.ripple(); play.click(); }
          await v.hold(d.play * 1000);
          const stop = document.querySelector('[data-player="stop"]');
          if (stop) { await v.go(stop, 300); stop.click(); }
          await g.settle(500);
        }
      }
      if (d.explode) {
        const asm = asmOf('robot');
        await v.point('explodeEditor');
        m.actions.change('op.explode', () => { asm.explode = structuredClone(robotSrc.explode); asm.explode.on = true; });
        await g.settle(900); await g.fit(); await v.hold(2200);
        m.actions.change('op.explode', () => { asm.explode.on = false; });
        await g.settle(600);
      }
      if (d.explodeAnimate) {
        await v.point('explodeAnimate');
        await m.run('explodeAnimate'); await v.hold(1500);
        await m.run('explodeAnimate'); await v.hold(1500);
      }
      if (d.drawing) {
        const asm = asmOf('robot');
        await v.point('newDrawing');
        const dsrc = structuredClone(R.drawings[0]);
        dsrc.source = { kind: 'assembly', id: asm.id };
        m.actions.change('op.newDrawing', (p) => { p.drawings.push(dsrc); });
        map.drawing = dsrc.id;
        await showDoc('drawing', dsrc.id);
        await g.settle(1500); await g.fit(); await v.hold(1500);
      }
      if (d.drawingDone) {
        const bom = document.querySelector('#drawing-host .bom, #drawing-host [data-bom]');
        if (bom) { await v.go(bom); }
        await v.hold(2500);
      }
    },
    /** The screen point of a model point, for the pointer. */
    at(p) { return g.toPage(p); },
  };
  window.__v = v;
  return 'video';
}

// ───────────────────────── the lessons (each step runs in the page with g = window.__g, v = window.__v)

const L = (ko, en) => ({ ko, en });
// The lessons come from the tutorial plan (scripts/tutorial-plan.mjs): every step replays its part of the finished
// tutorial robot (v.robotStep, in the page) — sketches drawn, features made in their own PropertyManagers,
// components inserted, mates and motors added — so the video builds the same robot as the documents and samples.
const lessons = PLAN.map((lesson) => ({
  ...lesson,
  steps: lesson.steps.map((step) => ({ say: step.say, run: `async (g, v) => { await v.robotStep(${JSON.stringify(step.do)}, ${JSON.stringify(step.view ?? null)}); }` })),
}));

// ───────────────────────── run

const browser = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((b) => fs.existsSync(b));
const encoder = ffmpegPath();
const port = await freeDevPort(5900);
const env = { ...process.env, MYMECHANICS_NO_HMR: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env });
let viteLog = '';
vite.stdout.on('data', (d) => { viteLog += d; });
vite.stderr.on('data', (d) => { viteLog += d; });
const debugPort = await freeDevPort(port + 1);
// The profile's name ("msk-smoke-<pid>") lets smoke-web's orphan sweep close this browser too if the script dies.
const profile = path.join(tmpdir(), `msk-smoke-${process.pid}`);
const work = fs.mkdtempSync(path.join(tmpdir(), 'mymechanics-video-'));
let edge;
let page;
let problems = 0;
const killProfileBrowsers = () => {
  if (process.platform !== 'win32') return;
  const ps = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe' or Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*msk-smoke-${process.pid}*' } | ForEach-Object { $_.ProcessId }`;
  const pids = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).stdout.split(/\r?\n/).filter(Boolean);
  for (const pid of pids) spawnSync('taskkill', ['/PID', pid.trim(), '/F'], { stdio: 'ignore' });
};
let cleaned = false;
const cleanup = () => {
  if (cleaned) return;
  cleaned = true;
  try { page?.send('Browser.close').catch(() => {}); } catch { /* gone */ }
  try { edge?.kill(); } catch { /* gone */ }
  try { vite?.kill(); } catch { /* gone */ }
  killProfileBrowsers();
};
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(signal, () => { cleanup(); process.exit(130); });
process.on('exit', cleanup);

const evaluate = async (expression, timeout = 180000) => {
  const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeout);
  const ex = r.result?.exceptionDetails;
  if (ex || r.error) throw new Error(ex?.exception?.description ?? ex?.text ?? r.error?.message);
  return r.result?.result?.value;
};

const frames = [];
let recording = false;
let recorder = null;
const startRecording = () => {
  recording = true;
  recorder = (async () => {
    while (recording) {
      const time = Date.now() / 1000;
      const shot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 }, 30000).catch(() => null);
      if (!shot?.result?.data) { await sleep(40); continue; }
      const file = path.join(work, `${String(frames.length).padStart(6, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
      frames.push({ file, time });
      await sleep(15);
    }
  })();
};

try {
  for (let i = 0; i < 200 && !/Local:/.test(viteLog); i++) await sleep(150);
  const flags = gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  edge = spawn(browser, ['--headless=new', ...flags, `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--disable-sync', '--disable-extensions', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--window-size=${WIDTH},${HEIGHT}`, 'about:blank'], { stdio: 'ignore' });
  const target = await waitTarget(debugPort, (t) => t.type === 'page', 40000);
  page = await new Page(target).open();
  await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
  await page.send('Page.navigate', { url: `http://127.0.0.1:${port}/?nowelcome` });
  await page.waitFor('Boolean(window.__mymechanics)', { timeout: 90000, interval: 200 });
  await evaluate('window.__mymechanics.actions.ensureKernel().then(() => "ready")');
  await evaluate(`(${installHelpers})(${JSON.stringify(lang)})`);
  if (lang === 'en' && (await evaluate('window.__mymechanics.state.settings.language')) !== 'en') { await evaluate('window.__mymechanics.run("language")'); await sleep(500); }
  await evaluate(`(${installVideo})(${JSON.stringify(lang)})`);
  await evaluate('window.__g.reset()');
  await evaluate('(async () => { window.__mymechanics.actions.showStartPage(true); await window.__g.settle(1200); return 1; })()');

  // A partial run (--only) first builds the lessons before it quickly, unrecorded (each lesson goes on from the last).
  const first = only ? Math.min(...only) : 1;
  if (first > 1) {
    await evaluate('window.__v.fast = true');
    for (const lesson of lessons.slice(0, first - 1)) for (const step of lesson.steps) await evaluate(`(async () => { const g = window.__g; const v = window.__v; await (${step.run})(g, v); return 'ok'; })()`);
    await evaluate('window.__v.fast = false');
    console.log(`(lessons 1–${first - 1} built without recording)`);
  }
  startRecording();
  const T = (x) => x[lang];
  await evaluate(`window.__v.card('', 'MyMechanics', ${JSON.stringify(T(L(`튜토리얼 — 6축 다관절 로봇 만들기, ${PLAN.length}과`, `Tutorial — building a six-axis robot, in ${PLAN.length} lessons`)))}, 3200)`);
  for (const [n, lesson] of lessons.entries()) {
    if (only && !only.has(n + 1)) continue;
    const chip = lang === 'en' ? `Lesson ${n + 1}` : `${n + 1}과`;
    console.log(`── ${chip}. ${T(lesson.title)}`);
    await evaluate(`window.__v.chip = ${JSON.stringify(chip)}; window.__v.hideCaption(); window.__v.card(${JSON.stringify(chip.toUpperCase())}, ${JSON.stringify(T(lesson.title))}, ${JSON.stringify(T(lesson.sub))})`);
    for (const [s, step] of lesson.steps.entries()) {
      const t0 = Date.now();
      try {
        await evaluate(`window.__v.caption(${JSON.stringify(T(step.say))})`);
        await sleep(900);
        await evaluate(`(async () => { const g = window.__g; const v = window.__v; await (${step.run})(g, v); return 'ok'; })()`);
        if (step.mouse) {
          // Real mouse input, relative to window.__pt (set by the step), moved in small steps so the pointer glides.
          const [ox, oy] = await evaluate('window.__pt');
          let [cx, cy] = await evaluate('(() => { const c = document.getElementById("tv-cursor").getBoundingClientRect(); return [c.left + 3, c.top + 2]; })()');
          for (const [dx, dy, action] of step.mouse) {
            const x = ox + dx; const y = oy + dy;
            for (let k = 1; k <= 20; k++) {
              const e = k / 20; const s2 = e < 0.5 ? 2 * e * e : 1 - (-2 * e + 2) ** 2 / 2;
              await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx + (x - cx) * s2, y: cy + (y - cy) * s2, button: 'none' });
              await sleep(25);
            }
            cx = x; cy = y;
            if (action === 'click') {
              await sleep(250);
              await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
              await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
              await sleep(500);
            }
          }
          await sleep(700);
        }
        console.log(`  ✔ step ${s + 1} [${Date.now() - t0} ms]`);
      } catch (error) {
        problems++;
        console.log(`  ✘ step ${s + 1}: ${String(error.message).split('\n')[0].slice(0, 300)} [${Date.now() - t0} ms]`);
      }
      for (const e of page.errors.splice(0)) { problems++; console.log(`  ! ${String(e).slice(0, 300)}`); }
    }
    await evaluate('window.__v.hideCaption()');
    await sleep(500);
    // The model so far against the tutorial robot: every part's feature count, and anything that did not build.
    const state = await evaluate(`(async () => { const m = window.__mymechanics; const out = []; for (const p of m.project.parts) { const e = await m.actions.buildPart(p); const bad = p.features.filter((f) => e?.results?.get?.(f.id) && !e.results.get(f.id).ok).map((f) => f.name); out.push(p.name + ' ' + p.features.length + ${process.env.TUT_NAMES ? "' [' + p.features.map((f) => f.type).join(',') + ']'" : "''"} + (bad.length ? ' FAILED ' + bad.join(',') : '')); } for (const a of m.project.assemblies) out.push(a.name + ' comps ' + a.components.length + ' mates ' + a.mates.length + ' motors ' + (a.motion?.motors?.length ?? 0)); return out.join(' | '); })()`).catch((e) => String(e.message));
    console.log(`  model: ${state}`);
    if (/FAILED/.test(state)) problems++;
    // The lesson's picture for the documents (doc/images/<lang>/tut-robot-NN.png).
    await evaluate('(async () => { const v = window.__v; const c = document.getElementById("tv-cursor"); if (c) c.style.opacity = "0"; await window.__g.settle(300); return 1; })()');
    const pic = await page.send('Page.captureScreenshot', { format: 'png' }, 30000).catch(() => null);
    await evaluate('(() => { const c = document.getElementById("tv-cursor"); if (c) c.style.opacity = "1"; return 1; })()');
    if (pic?.result?.data) await sharp(Buffer.from(pic.result.data, 'base64')).resize({ width: 1400, withoutEnlargement: true }).png({ palette: true, quality: 90 }).toFile(path.join(root, 'doc', 'images', lang, `tut-robot-${String(n + 1).padStart(2, '0')}.png`));
  }
  await evaluate(`(async () => { const g = window.__g; await g.reset(); window.__mymechanics.actions.showStartPage(true); await g.settle(600); })()`);
  await evaluate(`window.__v.card('', ${JSON.stringify(T(L('마치며', 'That is it')))}, ${JSON.stringify(T(L('각 과의 결과는 시작 화면 › 예제 › 튜토리얼에 있습니다. 사용 설명서(F1)에서 모든 기능을 더 볼 수 있습니다.', 'Each lesson\'s result is on the start page under Samples › Tutorial. The user guide (F1) shows every feature.')))}, 3500)`);
  await sleep(400);
  recording = false;
  await recorder;
} finally {
  cleanup();
}

// ───────────────────────── encode

if (frames.length < 10) { console.log(`✘ only ${frames.length} frames were recorded`); process.exit(1); }
const list = [];
for (let i = 0; i < frames.length; i++) {
  const next = frames[i + 1]?.time ?? frames[i].time + 1.5;
  list.push(`file '${frames[i].file.replace(/\\/g, '/')}'`, `duration ${Math.max(0.01, next - frames[i].time).toFixed(3)}`);
}
list.push(`file '${frames.at(-1).file.replace(/\\/g, '/')}'`);
const listFile = path.join(work, 'frames.txt');
fs.writeFileSync(listFile, list.join('\n'));
const videoDir = path.join(root, 'doc', 'video');
fs.mkdirSync(videoDir, { recursive: true });
const out = path.join(videoDir, `${baseName}.mp4`);
console.log(`Encoding ${frames.length} frames (${(frames.at(-1).time - frames[0].time).toFixed(1)} s) …`);
const r = spawnSync(encoder, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-movflags', '+faststart', '-an', out], { stdio: 'inherit' });
if (r.status !== 0) { console.log('✘ ffmpeg failed'); process.exit(1); }
const mb = (fs.statSync(out).size / 1048576).toFixed(1);
console.log(`🎬 ${path.relative(root, out)} ${mb} MB`);
if (!only) {
  fs.copyFileSync(out, path.join(root, `${baseName}.mp4`));
  console.log(`   copied to ${baseName}.mp4 in the project root`);
}
if (!args.includes('--keep')) fs.rmSync(work, { recursive: true, force: true });
else console.log(`   frames: ${work}`);
console.log(problems ? `${problems} problem(s) during the recording (see above).` : 'Done.');
process.exitCode = problems ? 1 : 0;
