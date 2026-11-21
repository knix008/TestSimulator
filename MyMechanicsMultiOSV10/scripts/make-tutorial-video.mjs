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
    cmd(id, pause) { return v.click(document.querySelector(`#palette-host [data-command="${id}"]`) ?? document.querySelector(`[data-command="${id}"]`), () => m.run(id), pause); },
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
    async hold(ms) { await sleep(ms); },
    /** The screen point of a model point, for the pointer. */
    at(p) { return g.toPage(p); },
  };
  window.__v = v;
  return 'video';
}

// ───────────────────────── the lessons (each step runs in the page with g = window.__g, v = window.__v)

const L = (ko, en) => ({ ko, en });
const lessons = [
  {
    title: L('첫 스케치 — 사각형과 치수', 'First sketch — a rectangle and dimensions'),
    sub: L('모든 부품은 평면 위의 2D 스케치에서 시작합니다.', 'Every part starts from a 2D sketch on a plane.'),
    steps: [
      { say: L('시작 화면에서 새 부품을 누릅니다.', 'On the start page, press New Part.'), run: async (g, v) => {
        await g.reset(); g.m.actions.showStartPage(true); await g.settle(900);
        await v.click('[data-start="template"][data-value="part"]', () => g.m.actions.newDocument('part'), 900);
        if (!g.m.active() || g.m.state.showStart) { await g.m.actions.newDocument('part'); await g.settle(600); }
        await v.hold(1200);
      } },
      { say: L('피처 탭에서 스케치를 누르고 윗면을 고릅니다.', 'In the Features tab press Sketch, then pick the Top plane.'), run: async (g, v) => {
        await v.click('#palette-host [data-cm-tab="features"]');
        await v.cmd('sketch', 700);
        await v.hold(700);
        await v.click('[data-pm="sketchOn:top"]', () => document.querySelector('[data-pm="sketchOn:top"]')?.click(), 1000);
        await v.hold(600);
      } },
      { say: L('중심 사각형을 누르고, 원점을 클릭한 다음 바깥쪽에서 모서리를 클릭합니다.', 'Press Center Rectangle, click the origin, then click a corner outside.'), run: async (g, v) => {
        await v.cmd('sk:centerRect', 300);
        const o = g.toPage([0, 0, 0]); window.__pt = [o.x, o.y];
      }, mouse: [[0, 0, 'click'], [150, -90, 'click'], [260, -160]] },
      { say: L('지능형 치수로 가로선에 80, 세로선에 50을 넣습니다. 선이 검게 바뀌면 완전 정의입니다.', 'With Smart Dimension give the horizontal line 80 and the vertical line 50. Black lines: fully defined.'), run: async (g, v) => {
        const { m } = g;
        await v.cmd('sk:dimension', 300);
        const ed = m.state.editing.editor;
        m.actions.updateSettings({ editDimOnCreate: false }, { quiet: true });
        const pt = (id) => ed.sketch.entities.find((e) => e.id === id);
        const lines = ed.sketch.entities.filter((e) => e.type === 'line' && !e.construction);
        const horizontal = lines.find((l) => Math.abs(pt(l.p1).y - pt(l.p2).y) < 1e-6);
        const vertical = lines.find((l) => Math.abs(pt(l.p1).x - pt(l.p2).x) < 1e-6);
        for (const [line, value] of [[horizontal, 80], [vertical, 50]]) {
          const a = pt(line.p1); const b = pt(line.p2);
          await v.go(v.at([(a.x + b.x) / 2, (a.y + b.y) / 2, 0])); v.ripple();
          ed.selection = [line.id]; await ed.createDimension();
          const dim = ed.sketch.constraints.filter((c) => c.type === 'distance').find((d) => d.a === line.id);
          if (dim) { dim.value = value; ed.solve(); }
          ed.selection = []; ed.render(); await g.settle(900);
        }
        m.actions.updateSettings({ editDimOnCreate: true }, { quiet: true });
        const status = [...document.querySelectorAll('#statusbar .status-item')].find((s) => /정의|defined/i.test(s.textContent));
        if (status) { await v.go(status); g.mark(status, null, v.T('완전 정의', 'Fully defined'), { at: 'above', pad: 3 }); }
        await v.hold(2200); g.clear();
      } },
      { say: L('스케치 종료를 누르면 트리에 스케치1이 생깁니다.', 'Press Exit Sketch: Sketch1 appears in the tree.'), run: async (g, v) => {
        await v.cmd('exitSketch', 800);
        await v.hold(1500);
      } },
    ],
  },
  {
    title: L('돌출 — 스케치를 입체로', 'Extrude — from sketch to solid'),
    sub: L('스케치를 깊이만큼 밀어내 블록을 만듭니다.', 'Push the sketch out by a depth to make a block.'),
    steps: [
      { say: L('돌출 보스를 누르고 깊이에 20을 넣습니다. 노란 미리보기가 나옵니다.', 'Press Extruded Boss and type 20 for the depth: a yellow preview appears.'), run: async (g, v) => {
        await v.click('#palette-host [data-cm-tab="features"]');
        await v.cmd('extrude', 700);
        await g.view('iso'); await g.fit();
        await v.type('depth', '20');
        await v.hold(1800);
      } },
      { say: L('✔를 누르면 보스-돌출1이 생깁니다. 왼쪽 끌기로 보기를 돌립니다.', 'Press ✔: Boss-Extrude1 is made. Drag with the left button to turn the view.'), run: async (g, v) => {
        await v.ok(1200);
        await v.orbit(260, 2600, 30); await v.orbit(-260, 2000, -30);
        await v.hold(800);
      } },
    ],
  },
  {
    title: L('필렛과 구멍', 'Fillets and holes'),
    sub: L('세로 모서리를 둥글게 하고 카운터보어 구멍을 냅니다.', 'Round the vertical edges and add a counterbored hole.'),
    steps: [
      { say: L('필렛을 누르고 세로 모서리 네 개를 클릭한 뒤 반지름 5를 넣습니다.', 'Press Fillet, click the four vertical edges and type 5 for the radius.'), run: async (g, v) => {
        const { m } = g;
        await v.cmd('fillet', 600);
        const vp = m.viewport; const r = vp.canvas.getBoundingClientRect();
        for (const ed of m.state.partEntry.edgeList) {
          const d = ed.tangentAt(0.5);
          if (Math.abs(d.z) <= 0.9 * Math.hypot(d.x, d.y, d.z)) continue;
          const p = ed.pointAt(0.5); const s = vp.toScreen([p.x, p.y, p.z]);
          const hit = vp.pick(s.x + r.left, s.y + r.top, { kinds: ['edge'] });
          if (!hit) continue;
          await v.go({ x: s.x + r.left, y: s.y + r.top }, 500); v.ripple();
          vp.options.onPick(hit, { clientX: s.x + r.left, clientY: s.y + r.top }); await g.settle(400);
        }
        await v.type('radius', '5');
        await v.hold(1200);
        await v.ok(1400);
      } },
      { say: L('구멍 가공 마법사에서 카운터보어를 고르고, 윗면을 클릭해 위치를 정합니다.', 'In the Hole Wizard pick Counterbore and click the top face to place it.'), run: async (g, v) => {
        const { m } = g;
        await v.cmd('hole', 700);
        const kind = document.querySelector('#left-panel [data-pm-set="kind"][data-value="counterbore"]') ?? document.querySelector('#left-panel [data-pm-set="kind"]');
        if (kind) { await v.go(kind); v.ripple(); }
        m.actions.pmSet('kind', 'counterbore'); await g.settle(700);
        await v.go(v.at([15, 0, 20])); v.ripple();
        g.clickAt([15, 0, 20]); await g.settle(1200);
        await v.hold(1500);
        await v.ok(1500);
      } },
    ],
  },
  {
    title: L('패턴 — 구멍 네 개', 'Pattern — four holes'),
    sub: L('원본 구멍을 고치면 복사본도 함께 바뀝니다.', 'Change the original hole and the copies follow.'),
    steps: [
      { say: L('구멍을 고르고 원형 패턴을 누릅니다. 축은 Z, 개수는 4입니다.', 'Select the hole and press Circular Pattern: axis Z, 4 copies.'), run: async (g, v) => {
        const { m } = g;
        const hole = g.featureOf('hole');
        const row = g.featureRow(hole);
        if (row) { await v.go(row); v.ripple(); }
        m.actions.select([{ kind: 'feat', id: hole.id }]); await g.settle(400);
        await v.cmd('circularPattern', 600);
        const axis = document.querySelector('#left-panel [data-pm-set="axisKind"][data-value="z"]');
        if (axis) { await v.go(axis); v.ripple(); }
        m.actions.pmSet('axisKind', 'z'); await g.settle(500);
        await v.type('count', '4', 'number');
        await v.hold(1600);
        await v.ok(1500);
      } },
      { say: L('완성된 부품입니다. 트리에는 만든 순서대로 피처가 쌓입니다.', 'The finished part. The tree keeps the features in the order you made them.'), run: async (g, v) => {
        g.m.actions.select([]); await g.fit();
        await v.go('#left-panel .tree'); g.mark('#left-panel .tree', null, null, { pad: -1 });
        await v.orbit(720, 5000); g.clear();
      } },
    ],
  },
  {
    title: L('스윕 — 경로를 따라 관 만들기', 'Sweep — a tube along a path'),
    sub: L('윤곽을 경로를 따라 쓸어 관을 만듭니다.', 'Sweep a profile along a path to make a tube.'),
    steps: [
      { say: L('윗면에 원 두 개(관의 바깥과 안), 정면에 열린 경로를 그려 둡니다.', 'Two circles on Top (the tube wall) and an open path on Front.'), run: async (g, v) => {
        await g.newPart(); await v.click('#palette-host [data-cm-tab="features"]');
        g.sketch({ kind: 'std', name: 'top' }, [{ id: 'pc', type: 'point', x: 0, y: 0 }, { id: 'c1', type: 'circle', c: 'pc', r: 8 }, { id: 'c2', type: 'circle', c: 'pc', r: 6 }], v.T('윤곽', 'Profile'));
        g.sketch({ kind: 'std', name: 'front' }, [{ id: 'q1', type: 'point', x: 0, y: 0 }, { id: 'q2', type: 'point', x: 0, y: 60 }, { id: 'q3', type: 'point', x: 50, y: 100 }, { id: 'q4', type: 'point', x: 110, y: 100 }, { id: 'm1', type: 'line', p1: 'q1', p2: 'q2' }, { id: 'm2', type: 'line', p1: 'q2', p2: 'q3' }, { id: 'm3', type: 'line', p1: 'q3', p2: 'q4' }], v.T('경로', 'Path'));
        await g.settle(800); await g.view('iso'); await g.fit();
        for (const name of [v.T('윤곽', 'Profile'), v.T('경로', 'Path')]) { const row = g.treeRow(name); if (row) { await v.go(row); g.mark(row, null, null, { pad: 1 }); await v.hold(900); } }
        await v.hold(800); g.clear();
      } },
      { say: L('스윕을 누르면 윤곽과 경로가 들어갑니다. ✔를 누릅니다.', 'Press Sweep: the profile and the path are filled in. Press ✔.'), run: async (g, v) => {
        await v.cmd('sweep', 1500);
        await v.hold(1600);
        await v.ok(1500); g.m.actions.select([]); await g.fit();
        await v.orbit(500, 4000);
      } },
    ],
  },
  {
    title: L('판금 — 플랜지와 전개도', 'Sheet metal — flanges and the flat pattern'),
    sub: L('판을 만들고 모서리 플랜지를 세운 뒤 펼쳐 봅니다.', 'Make a sheet, raise an edge flange, then flatten it.'),
    steps: [
      { say: L('사각형 스케치로 베이스 플랜지를 만듭니다. 두께·굽힘 반지름·K 계수를 정합니다.', 'A Base Flange from a rectangle sketch: thickness, bend radius and K-factor.'), run: async (g, v) => {
        const { m } = g;
        await g.newPart();
        g.sketch({ kind: 'std', name: 'top' }, g.rect(0, 0, 120, 70), v.T('판', 'Plate'));
        await g.settle(500);
        await v.click('#palette-host [data-cm-tab="sheetMetal"]');
        await v.cmd('baseFlange', 900);
        await g.view('iso'); await g.fit(); await v.hold(1800);
        await v.ok(1200);
      } },
      { say: L('판 윗면의 모서리를 고르고 모서리 플랜지를 누릅니다. 길이 35.', 'Pick a top edge of the sheet and press Edge Flange: length 35.'), run: async (g, v) => {
        const { m } = g;
        const entry = m.state.partEntry;
        const i = entry.edgeList.findIndex((ed) => ed.geomType === 'LINE' && ed.startPoint.x > 119.9 && ed.endPoint.x > 119.9 && ed.startPoint.z > 0.5 && ed.endPoint.z > 0.5);
        if (i >= 0) { const p = entry.edgeList[i].pointAt(0.5); await v.go(v.at([p.x, p.y, p.z])); v.ripple(); }
        m.actions.select([{ kind: 'edge', bodyKey: 'body', index: i, key: `edge:body:${i}` }]); await g.settle(400);
        await v.cmd('edgeFlange', 800);
        await v.type('length', '35');
        await v.hold(1500);
        await v.ok(1400);
        await v.orbit(300, 2500);
      } },
      { say: L('전개를 누르면 굽힘 여유를 넣은 전개도가 나옵니다.', 'Press Flatten: the flat pattern, bend allowance included.'), run: async (g, v) => {
        await v.cmd('flatten', 900);
        await g.view('top'); await g.fit(); await v.hold(2500);
        await v.cmd('flatten', 900);
        await g.view('iso'); await g.fit(); await v.hold(1000);
      } },
    ],
  },
  {
    title: L('어셈블리와 메이트', 'Assemblies and mates'),
    sub: L('부품을 넣고 메이트로 서로의 위치를 묶습니다.', 'Insert parts and tie their positions together with mates.'),
    steps: [
      { say: L('축 어셈블리 예제입니다. 왼쪽 트리에 부품과 메이트가 있습니다.', 'The shaft assembly sample: the components and mates are in the tree.'), run: async (g, v) => {
        await g.sample('shaftAssembly'); await g.view('iso'); await g.fit();
        await v.go('#left-panel .tree'); await v.hold(1500);
        await v.orbit(400, 3500);
      } },
      { say: L('메이트를 누르고 원통면 두 개를 고르면 동심 메이트가 됩니다.', 'Press Mate and pick two cylindrical faces: a concentric mate.'), run: async (g, v) => {
        const { m } = g;
        const asm = m.active();
        const mate = asm.mates.find((x) => x.type === 'concentric') ?? asm.mates[0];
        await v.cmd('mate', 600);
        const e = m.state.editing;
        e.mate = JSON.parse(JSON.stringify(mate)); e.pick = null; e.isNew = false;
        m.actions.pmSet('type', mate.type); await g.settle(1000);
        const picks = document.querySelector('#left-panel .pm-pick');
        if (picks) { await v.go(picks); g.mark(picks, null, v.T('원통면 두 개', 'Two cylindrical faces'), { at: 'below' }); }
        await v.hold(2600); g.clear();
        await v.click('#left-panel .pm-cancel', () => m.actions.cancelEditing({ quiet: true }), 700);
      } },
    ],
  },
  {
    title: L('모션 스터디', 'Motion study'),
    sub: L('모터를 달아 기구가 움직이는 모습을 봅니다.', 'Add a motor and watch the mechanism move.'),
    steps: [
      { say: L('감속기 예제에서 모션 스터디를 열고 재생합니다. 입력축의 회전 모터가 기어를 돌립니다.', 'Open the motion study of the gear reducer and play it: the motor on the input shaft turns the gears.'), run: async (g, v) => {
        const { m } = g;
        await g.sample('asmGearReducer'); await g.view('iso'); await g.fit();
        await v.cmd('motion', 700);
        await v.click('#left-panel [data-pm="playMotion"]', () => m.actions.pmCommand('playMotion'), 300);
        await v.hold(7000);
        await v.click('#left-panel [data-pm="stopMotion"]', () => m.actions.pmCommand('stopMotion'), 500);
        await v.click('#left-panel .pm-cancel', () => m.actions.cancelEditing({ quiet: true }), 600);
      } },
    ],
  },
  {
    title: L('도면 — 단면도와 부품표', 'Drawings — section views and a BOM'),
    sub: L('모델에서 도면을 만들고 단면도·상세도·부품표를 넣습니다.', 'Make a drawing of the model with section, detail and BOM.'),
    steps: [
      { say: L('어셈블리를 연 채 새 도면을 만들면 표준 3면도가 들어갑니다.', 'With the assembly open, a new drawing gets the three standard views.'), run: async (g, v) => {
        const { m } = g;
        await g.sample('shaftAssembly'); await g.settle(500);
        await m.actions.newDrawing(); await g.settle(1800);
        await v.hold(1500);
      } },
      { say: L('정면도를 고르고 단면도와 상세도를 누릅니다.', 'Select the front view and press Section View, then Detail View.'), run: async (g, v) => {
        const { m } = g;
        const front = document.querySelector('.drawing-paper svg .view');
        if (front) { await v.go(front); v.ripple(); if (front.dataset?.view) m.actions.select([{ kind: 'view', id: front.dataset.view }]); }
        await g.settle(400);
        await v.cmd('sectionView', 1200); await v.hold(1200);
        await v.cmd('detailView', 1500); await v.hold(1500);
      } },
      { say: L('부품표를 누르면 부품 번호·이름·수량 표가 들어갑니다.', 'Press Bill of Materials: a table of item numbers, names and quantities.'), run: async (g, v) => {
        await v.cmd('bom', 1400);
        const bom = document.querySelector('.drawing-paper svg .bom');
        if (bom) { await v.go(bom); g.mark(bom, null, null, { pad: 4 }); }
        await v.hold(2600); g.clear();
      } },
    ],
  },
  {
    title: L('정적 해석', 'Static analysis'),
    sub: L('고정 면과 하중을 정하고 응력과 안전율을 봅니다.', 'Fix a face, load another and look at the stress and the factor of safety.'),
    steps: [
      { say: L('외팔보를 열고 평가 › 해석을 누릅니다. 왼쪽 끝을 고정하고 오른쪽 끝에 200 N을 아래로 줍니다.', 'Open a cantilever and press Evaluate › Simulation. Fix the left end, push 200 N down on the right end.'), run: async (g, v) => {
        const { m } = g;
        const { e, fix, load } = await g.cantilever();
        for (const [face, list] of [[fix, 'fixtures'], [load, 'loads']]) {
          await v.go(v.at([face.c.x, face.c.y, face.c.z])); v.ripple(); await g.settle(300);
          e[list] = [{ index: face.i, faceId: face.f.hashCode, type: 'PLANE' }];
          m.viewport.setSelection([...(e.fixtures ?? []), ...(e.loads ?? [])].map((x) => ({ kind: 'face', bodyKey: 'body', index: x.index })));
          await g.settle(500);
        }
        e.magnitude = 200; e.resolution = 60;
        m.actions.pmSet('dir', '-z'); await g.settle(900);
        await v.hold(1500);
      } },
      { say: L('해석 실행을 누르면 von Mises 응력(파랑 → 빨강)과 최대 변위, 최소 안전율이 나옵니다.', 'Press Run: von Mises stress (blue → red), the largest displacement and the smallest factor of safety.'), run: async (g, v) => {
        const { m } = g;
        await v.click('#left-panel [data-pm="runSim"]', () => m.actions.pmCommand('runSim'), 2500);
        await g.fit(); await v.hold(1500);
        await v.orbit(300, 3000);
        await g.pmEnd(); await v.hold(2500);
      } },
    ],
  },
];

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

  startRecording();
  const T = (x) => x[lang];
  await evaluate(`window.__v.card('', 'MyMechanics', ${JSON.stringify(T(L('튜토리얼 — 스케치에서 해석까지, 10과', 'Tutorial — from a sketch to analysis, in ten lessons')))}, 3200)`);
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
  }
  await evaluate(`(async () => { const g = window.__g; await g.reset(); window.__mymechanics.actions.showStartPage(true); await g.settle(600); })()`);
  await evaluate(`window.__v.card('', ${JSON.stringify(T(L('마치며', 'That is it')))}, ${JSON.stringify(T(L('시작 화면의 예제 75개와 사용 설명서(F1)에서 모든 기능을 더 볼 수 있습니다.', 'The 75 samples on the start page and the user guide (F1) show every feature.')))}, 3500)`);
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
