#!/usr/bin/env node
// `npm run smoke`: the web build in headless Edge / Chrome against a running
// engine — start screen, opening an image, converting it, the 3D view's grid /
// axes / rulers / lights, dragging a light with the mouse, saving in every
// format and reading it back, opening a 3D file, switching language and theme.
//
// Needs: the dev server (`npm run dev`, port 5195) and the engine
// (`npm run engine`, or ENGINE_URL=http://127.0.0.1:<port>). The sample image
// is one of the project's own examples
// (samples/images/robot.png), or SAMPLE_IMAGE.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, hasBrowser } from './cdp.mjs';
import { fileURLToPath } from 'node:url';

const APP = process.env.APP_URL || 'http://localhost:5195/';
const ENGINE = process.env.ENGINE_URL || 'http://127.0.0.1:57650';
const SHOTS = process.env.SHOTS_DIR || path.join(os.tmpdir(), 'mysf3d-smoke');
const sample = process.env.SAMPLE_IMAGE
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'samples', 'images', 'robot.png');

const results = [];
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`  ok    ${name} (${Date.now() - t0} ms)`);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    console.log(`  FAIL  ${name}: ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  if (!hasBrowser()) {
    console.log('[smoke] No Edge / Chrome found (set CHROME_PATH); skipped.');
    return 0;
  }
  try {
    const h = await (await fetch(`${ENGINE}/api/health`)).json();
    assert(h.service === 'mysf3d', 'not the MyStableFast3D engine');
  } catch (err) {
    console.log(`[smoke] The engine does not answer at ${ENGINE} (${err.message}). Start it with \`npm run engine\`.`);
    return 1;
  }
  assert(fs.existsSync(sample), `sample image missing: ${sample}`);
  fs.mkdirSync(SHOTS, { recursive: true });
  const shot = (n) => path.join(SHOTS, n);

  const b = await launch({ port: 9561 });
  try {
    await b.goto(APP);
    await b.eval(`localStorage.clear(); localStorage.setItem('mystablefast3d-state', JSON.stringify({ engineUrl: ${JSON.stringify(ENGINE)}, lang: 'ko', showStartPage: true, tutorialAsk: false })); true`);
    await b.goto(APP);

    await step('start screen with engine and models', async () => {
      await b.waitFor(`!!document.querySelector('.start .engine-card')`);
      await b.waitFor(`document.querySelectorAll('.start .model-link').length >= 2`, 20000);
      const text = await b.eval(`document.querySelector('.start').textContent`);
      assert(text.includes('Stable Fast 3D') && text.includes('TripoSR'), 'models not listed');
      await b.shot(shot('01-start.png'));
    });

    await step('start screen: no panels, their buttons off, background moving', async () => {
      const s = await b.eval(`(() => ({
        panels: document.querySelectorAll('.info-panel, .log-panel').length,
        disabled: ['입력 패널', '설정 패널', '로그'].map((l) => document.querySelector('.toolbar .tbtn[aria-label="' + l + '"]')?.disabled),
        frames: Number(document.querySelector('.start canvas.start-bg')?.dataset.frames || 0),
      }))()`);
      await sleep(700);
      const later = await b.eval(`Number(document.querySelector('.start canvas.start-bg')?.dataset.frames || 0)`);
      assert(s.panels === 0, `${s.panels} panels under the start screen`);
      assert(s.disabled.every(Boolean), `panel buttons not disabled: ${s.disabled}`);
      assert(later > s.frames, 'the background does not move');
      await b.eval(`document.querySelector('.bg-chip[data-bg="galaxy"]').click(); true`);
      await b.waitFor(`document.querySelector('.start canvas.start-bg')?.dataset.scene === 'galaxy'`, 3000);
    });

    await step('labels stay under the start screen', async () => {
      const covered = await b.eval(`(() => {
        const s = document.querySelector('.start').getBoundingClientRect();
        const el = document.elementFromPoint(s.left + s.width / 2, s.top + s.height - 40);
        return !!el.closest('.start');
      })()`);
      assert(covered, 'something shows through the start screen');
    });

    await step('start cards snap to the grid and push the others aside', async () => {
      const centre = (sel, dx = 0, dy = 0) => b.eval(`(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); return { x: r.left + r.width / 2 + ${dx}, y: r.top + r.height / 2 + ${dy} }; })()`);
      const from = await centre('[data-card-move="how"]');
      const to = await centre('[data-card="recent"]', 0, -100);
      await b.mouse('mousePressed', from.x, from.y, 'left', 1);
      for (let i = 1; i <= 10; i++) {
        await b.mouse('mouseMoved', from.x + (to.x - from.x) * i / 10, from.y + (to.y - from.y) * i / 10, 'left', 1);
        await sleep(20);
      }
      await sleep(300);
      const mid = await b.eval(`({ ghost: !!document.querySelector('[data-card-ghost]'), tip: !!document.querySelector('.tooltip, [role=tooltip]') && getComputedStyle(document.querySelector('.tooltip, [role=tooltip]')).opacity !== '0' })`);
      await b.mouse('mouseReleased', to.x, to.y, 'left', 0);
      await sleep(400);
      assert(mid.ghost, 'no silhouette while dragging');
      assert(!mid.tip, 'the handle tooltip rides along the drag');
      const boxes = await b.eval(`[...document.querySelectorAll('.start-card')].map((c) => { const r = c.getBoundingClientRect(); return [c.dataset.card, r.left, r.top, r.right, r.bottom]; })`);
      const clash = boxes.flatMap((a, i) => boxes.slice(i + 1).filter((c) => a[1] < c[3] && c[1] < a[3] && a[2] < c[4] && c[2] < a[4]).map((c) => `${a[0]}/${c[0]}`));
      assert(!clash.length, `cards overlap: ${clash}`);
      assert(!(await b.eval(`!!document.querySelector('[data-card-ghost]')`)), 'the silhouette stayed');
      await b.eval(`document.querySelector('[data-start-arrange]').click(); true`);
    });

    await step('open an image by dropping it', async () => {
      await b.drop([sample]);
      await b.waitFor(`!!document.querySelector('.input-figure img') && !document.querySelector('.start')`);
      const n = await b.eval(`document.querySelectorAll('.info-panel, .log-panel').length`);
      assert(n === 3, `expected the two side panels and the log, found ${n}`);
      const full = await b.eval(`(() => { const l = document.querySelector('.info-panel.side-left').getBoundingClientRect();
        const s = document.querySelector('.statusbar').getBoundingClientRect(); return Math.abs(l.bottom - s.top) < 2; })()`);
      assert(full, 'the side panels do not reach the status bar');
    });

    await step('convert with the selected model', async () => {
      await b.click('.convert-group .tbtn.primary');
      await b.waitFor(`!!document.querySelector('.convert-overlay')`, 10000);
      await b.waitFor(`!document.querySelector('.convert-overlay') && !!window.__mysf3dViewer?.model`, 300000);
      await sleep(800);
      const st = await b.eval(`document.querySelector('.statusbar').textContent`);
      assert(/정점|vertices/.test(st), 'no geometry in the status bar');
      await b.shot(shot('02-converted.png'));
    });

    await step('conversion settings window: groups, refine, reset to defaults', async () => {
      await b.click('.convert-group .tbtn[aria-label="변환 설정"]');
      await b.waitFor(`!!document.querySelector('.convert-settings-modal')`, 5000);
      const groups = await b.eval(`[...document.querySelectorAll('.convert-settings-grid > .form-section')].map((s) => s.querySelectorAll('.field, .check').length)`);
      assert(groups.length === 3 && groups.every((n) => n > 0), `groups/fields: ${groups}`);
      assert(groups[2] === 4, `${groups[2]} surface options`);
      const before = await b.eval(`window.__mysf3dViewer.stats?.faces ?? document.querySelector('.statusbar').textContent`);
      // Smoothing off and no subdividing: a quarter of the faces.
      const setRange = (label, value) => b.eval(`(() => {
        const f = [...document.querySelectorAll('.convert-settings-modal .range-field')].find((x) => x.querySelector('.field-label').textContent.startsWith(${JSON.stringify(label)}));
        const input = f.querySelector('input[type=range]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(String(value))});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return input.value;
      })()`);
      await setRange('면 세분화', 0);
      await setRange('표면 다듬기', 0);
      await b.waitFor(`!document.querySelector('.convert-settings-modal .modal-foot .btn').disabled`, 2000);
      await b.shot(shot('03-convert-settings.png'));
      await b.eval(`[...document.querySelectorAll('.convert-settings-modal .modal-foot .btn')].find((x) => x.textContent.includes('결과에 다시 적용')).click(); true`);
      await b.waitFor(`document.querySelector('.statusbar').textContent.includes('표면을 다시 다듬었습니다')`, 60000);
      const after = await b.eval(`document.querySelector('.statusbar').textContent`);
      assert(String(before) !== after, 'the result did not change');
      // A model of the same size replaced: the axis / ruler labels must be
      // sized again (left at 1 × 1 m they cover the whole view), and the
      // texture must still be there.
      await sleep(400);
      const scene = await b.eval(`(() => { const v = window.__mysf3dViewer; const s = []; let maps = 0;
        v.scene.traverse((o) => { if (o.isSprite && o.visible) s.push(o.scale.y); });
        v.model.traverse((o) => { if (o.isMesh && [].concat(o.material).some((m) => m.map)) maps++; });
        return { big: s.filter((h) => h > 0.5).length, maps }; })()`);
      assert(scene.big === 0, `${scene.big} label sprites left unsized after the refine`);
      assert(scene.maps > 0, 'the refined result lost its texture');
      await b.eval(`document.querySelector('.convert-settings-modal .modal-foot .btn').click(); true`);
      await b.waitFor(`document.querySelector('.convert-settings-modal .modal-foot .btn').disabled`, 2000);
      // Saving is debounced: wait for the stored options to empty.
      await b.waitFor(`Object.values(JSON.parse(localStorage.getItem('mystablefast3d-state')).convertOptions || {}).every((v) => !Object.keys(v).length)`, 3000);
      await b.eval(`[...document.querySelectorAll('.convert-settings-modal .modal-foot .btn')].pop().click(); true`);
      await b.waitFor(`!document.querySelector('.convert-settings-modal')`, 2000);
    });

    await step('grid is 5×5, axes and rulers are drawn', async () => {
      const v = await b.eval(`(() => { const v = window.__mysf3dViewer; return {
        div: v.grid.material.uniforms.uDivisions.value, grid: v.grid.visible,
        axes: v.axes.children.length, rulers: v.rulers.children.length, labels: v.rulers.children.filter((c) => c.isSprite).length }; })()`);
      assert(v.grid && v.div === 5, `grid ${JSON.stringify(v)}`);
      // One sun: only directional lights get the rayed handle.
      const suns = await b.eval(`(() => { const v = window.__mysf3dViewer; let rayed = 0, dir = 0;
        for (const [, e] of v.lights) { if (e.spec.type === 'directional') dir++;
          const r = e.handle?.children.find((c) => c.userData.rays); if (r && r.geometry.attributes.position.count === 24) rayed++; }
        return { rayed, dir }; })()`);
      assert(suns.rayed === suns.dir, `sun-shaped handles ${suns.rayed}, directional lights ${suns.dir}`);
      assert(v.axes >= 9 && v.rulers > 5 && v.labels > 3, `helpers ${JSON.stringify(v)}`);
    });

    await step('drag a light with the mouse', async () => {
      const p = await b.eval(`(() => {
        const v = window.__mysf3dViewer; const h = v.lights.get('key').handle;
        const q = h.position.clone().project(v.camera); const r = v.renderer.domElement.getBoundingClientRect();
        return { x: r.left + (q.x + 1) / 2 * r.width, y: r.top + (1 - q.y) / 2 * r.height, before: h.position.toArray() };
      })()`);
      await b.mouse('mouseMoved', p.x, p.y, 'none', 0);
      await b.mouse('mousePressed', p.x, p.y);
      for (let i = 1; i <= 8; i++) { await b.mouse('mouseMoved', p.x - i * 12, p.y + i * 5); await sleep(30); }
      await b.mouse('mouseReleased', p.x - 96, p.y + 40);
      await sleep(600);
      const after = await b.eval(`(() => { const st = JSON.parse(localStorage.getItem('mystablefast3d-state'));
        return { saved: st.lights.find((l) => l.id === 'key').position, tab: st.rightTab }; })()`);
      const moved = after.saved.some((n, i) => Math.abs(n - [0.9, 1.4, 0.8][i]) > 0.01);
      assert(moved, `light did not move: ${JSON.stringify(after)}`);
      assert(after.tab === 'lights', 'the lights tab did not open');
      await b.shot(shot('03-light.png'));
    });

    await step('save in every format and read it back', async () => {
      const rt = await b.eval(`(async () => {
        const f = await import('/src/lib/formats.js');
        const v = window.__mysf3dViewer; const tris = f.modelStats(v.model).triangles; const out = { tris };
        out.verts = 0;
        v.model.traverse((o) => { if (o.isMesh) out.verts += o.geometry.getAttribute('position').count; });
        for (const fmt of f.EXPORT_FORMATS) {
          const bytes = await f.exportModel(v.exportRoot(), fmt.id);
          if (fmt.id === 'usdz') { out[fmt.id] = bytes.length; continue; }
          const s = f.modelStats((await f.loadModel('x.' + fmt.ext, bytes)).object);
          out[fmt.id] = fmt.points ? s.points : s.triangles;
        }
        return out;
      })()`);
      for (const k of ['glb', 'gltf', 'obj', 'stl', 'stl-ascii', 'ply', 'ply-ascii', '3mf', 'amf', 'dae', 'wrl', 'vtk']) {
        assert(rt[k] === rt.tris, `${k}: ${rt[k]} triangles, expected ${rt.tris}`);
      }
      for (const k of ['pcd', 'xyz']) assert(rt[k] === rt.verts, `${k}: ${rt[k]} points, expected ${rt.verts}`);
      assert(rt.usdz > 1000, 'usdz is empty');
    });

    await step('open a 3D file (OBJ with its MTL)', async () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mysf3d-obj-'));
      fs.writeFileSync(path.join(tmp, 'cube.mtl'), 'newmtl red\nKd 0.9 0.1 0.1\n');
      fs.writeFileSync(path.join(tmp, 'cube.obj'), ['mtllib cube.mtl', 'usemtl red',
        'v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0', 'v 0 0 1', 'v 1 0 1', 'v 1 1 1', 'v 0 1 1',
        'f 1 2 3 4', 'f 5 8 7 6', 'f 1 5 6 2', 'f 2 6 7 3', 'f 3 7 8 4', 'f 5 1 4 8'].join('\n'));
      await b.drop([path.join(tmp, 'cube.obj'), path.join(tmp, 'cube.mtl')]);
      const colour = `(() => { let col = null; window.__mysf3dViewer.model?.traverse((o) => { if (o.isMesh) col = [].concat(o.material)[0].color?.getHexString(); }); return col; })()`;
      await b.waitFor(`document.querySelector('.statusbar').textContent.includes('cube.obj') && ${colour} !== 'ffffff'`, 10000).catch(() => {});
      const c = await b.eval(colour);
      assert(c && c.startsWith('e6'), `MTL colour not applied (${c})`);
    });

    await step('print dialog draws a preview', async () => {
      await b.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true })); true`);
      await b.waitFor(`!!document.querySelector('.print-modal img.print-preview-canvas')`, 15000);
      const n = await b.eval(`document.querySelectorAll('.print-modal .print-scope').length`);
      assert(n === 4, `${n} print layouts`);
      await b.shot(shot('06-print.png'));
      await b.eval(`[...document.querySelectorAll('.print-modal .modal-foot .btn')].find((x) => /취소|Cancel/.test(x.textContent)).click(); true`);
    });

    await step('right-click menus have an icon on every item', async () => {
      const r = await b.eval(`(() => { const c = document.querySelector('.viewer3d-canvas').getBoundingClientRect(); return { x: c.left + 40, y: c.top + 40 }; })()`);
      await b.mouse('mousePressed', r.x, r.y, 'right', 2);
      await b.mouse('mouseReleased', r.x, r.y, 'right', 0);
      await b.waitFor(`!!document.querySelector('.ctxmenu')`, 3000);
      const items = await b.eval(`[...document.querySelectorAll('.ctxmenu .ctxmenu-item')].map((x) => !!x.querySelector('.ci-icon svg'))`);
      assert(items.length >= 10 && items.every(Boolean), `menu items/icons: ${items}`);
      await b.shot(shot('07-context.png'));
      await b.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); true`);
    });

    await step('the tutorial runs through every step', async () => {
      await b.eval(`document.querySelector('[data-help-tutorial]') || [...document.querySelectorAll('.toolbar-right .tbtn.chevron')][1].click(); true`);
      await new Promise((r) => setTimeout(r, 300));
      await b.eval(`document.querySelector('[data-help-tutorial]').click(); true`);
      await b.waitFor(`!!window.__mysf3dTutorial?.active`, 3000);
      await b.eval(`window.__mysf3dTutorial.go(0); true`);
      const missing = [];
      const total = await b.eval(`window.__mysf3dTutorial.total`);
      for (let i = 0; i < total; i++) {
        await b.waitFor(`window.__mysf3dTutorial.index === ${i} && !window.__mysf3dTutorial.busy`, 15000);
        const st = await b.eval(`({ id: window.__mysf3dTutorial.id, missing: window.__mysf3dTutorial.missing })`);
        if (st.missing) missing.push(st.id);
        if (st.id === 'light-drag') await b.shot(shot('08-tutorial.png'));
        if (i < total - 1) await b.eval(`window.__mysf3dTutorial.next(); true`);
      }
      await b.eval(`window.__mysf3dTutorial.stop(true); true`);
      assert(!missing.length, `steps without their target: ${missing.join(', ')}`);
    });

    await step('English and a light theme', async () => {
      await b.eval(`document.querySelector('.toolbar-right .tbtn[aria-label="English"]').click(); true`);
      await b.waitFor(`document.querySelector('.convert-group').textContent.includes('Convert')`);
      await b.eval(`(() => { const st = JSON.parse(localStorage.getItem('mystablefast3d-state')); return true; })()`);
      await b.eval(`document.querySelector('.toolbar-right .menu-wrap.split .tbtn').click(); true`);
      await sleep(400);
      await b.shot(shot('04-en-theme.png'));
    });

    await step('settings dialog shows the engine tab', async () => {
      await b.eval(`document.querySelector('.toolbar-right .tbtn[aria-label="Settings"]').click(); true`);
      await b.waitFor(`!!document.querySelector('.settings-modal')`);
      await b.eval(`[...document.querySelectorAll('.settings-modal .tab')][1].click(); true`);
      const txt = await b.eval(`document.querySelector('.settings-modal').textContent`);
      assert(txt.includes('Stability AI API (paid)') && txt.includes('This computer'), 'engine tab incomplete');
      await b.shot(shot('05-settings.png'));
    });

    const errors = b.logs.filter((l) => /\[(error|exception)\]/i.test(l));
    await step('no console errors', async () => { assert(!errors.length, errors.join('\n')); });
  } finally {
    b.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n[smoke] ${results.length - failed.length}/${results.length} passed — screenshots in ${SHOTS}`);
  return failed.length ? 1 : 0;
}

main().then((code) => process.exit(code), (err) => { console.error(err); process.exit(1); });
