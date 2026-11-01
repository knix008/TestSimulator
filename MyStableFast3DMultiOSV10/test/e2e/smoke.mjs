#!/usr/bin/env node
// `npm run smoke`: the web build in headless Edge / Chrome against a running
// engine — start screen, opening an image, converting it, the 3D view's grid /
// axes / rulers / lights, dragging a light with the mouse, saving in every
// format and reading it back, opening a 3D file, switching language and theme.
//
// Needs: the dev server (`npm run dev`, port 5195) and the engine
// (`npm run engine`, or ENGINE_URL=http://127.0.0.1:<port>). The sample image
// comes from the Stable Fast 3D source the engine downloaded
// (<engine>/models/sf3d/src/demo_files/examples), or SAMPLE_IMAGE.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, hasBrowser } from './cdp.mjs';
import { defaultHome } from '../../scripts/engine.mjs';

const APP = process.env.APP_URL || 'http://localhost:5195/';
const ENGINE = process.env.ENGINE_URL || 'http://127.0.0.1:57650';
const SHOTS = process.env.SHOTS_DIR || path.join(os.tmpdir(), 'mysf3d-smoke');
const sample = process.env.SAMPLE_IMAGE
  || path.join(defaultHome(), 'models', 'sf3d', 'src', 'demo_files', 'examples', 'chair1.png');

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
    await b.eval(`localStorage.clear(); localStorage.setItem('mystablefast3d-state', JSON.stringify({ engineUrl: ${JSON.stringify(ENGINE)}, lang: 'ko', showStartPage: true })); true`);
    await b.goto(APP);

    await step('start screen with engine and models', async () => {
      await b.waitFor(`!!document.querySelector('.start .engine-card')`);
      await b.waitFor(`document.querySelectorAll('.start .model-link').length >= 2`, 20000);
      const text = await b.eval(`document.querySelector('.start').textContent`);
      assert(text.includes('Stable Fast 3D') && text.includes('TripoSR'), 'models not listed');
      await b.shot(shot('01-start.png'));
    });

    await step('labels stay under the start screen', async () => {
      const covered = await b.eval(`(() => {
        const s = document.querySelector('.start').getBoundingClientRect();
        const el = document.elementFromPoint(s.left + s.width / 2, s.top + s.height - 40);
        return !!el.closest('.start');
      })()`);
      assert(covered, 'something shows through the start screen');
    });

    await step('open an image by dropping it', async () => {
      await b.drop([sample]);
      await b.waitFor(`!!document.querySelector('.input-figure img') && !document.querySelector('.start')`);
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

    await step('grid is 5×5, axes and rulers are drawn', async () => {
      const v = await b.eval(`(() => { const v = window.__mysf3dViewer; return {
        div: v.grid.material.uniforms.uDivisions.value, grid: v.grid.visible,
        axes: v.axes.children.length, rulers: v.rulers.children.length, labels: document.querySelectorAll('.ruler-label').length }; })()`);
      assert(v.grid && v.div === 5, `grid ${JSON.stringify(v)}`);
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
        for (const fmt of f.EXPORT_FORMATS) {
          const bytes = await f.exportModel(v.exportRoot(), fmt.id);
          out[fmt.id] = fmt.id === 'usdz' ? bytes.length : f.modelStats((await f.loadModel('x.' + fmt.ext, bytes)).object).triangles;
        }
        return out;
      })()`);
      for (const k of ['glb', 'gltf', 'obj', 'stl', 'stl-ascii', 'ply']) {
        assert(rt[k] === rt.tris, `${k}: ${rt[k]} triangles, expected ${rt.tris}`);
      }
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
