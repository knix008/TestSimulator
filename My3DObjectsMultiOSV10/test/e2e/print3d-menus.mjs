#!/usr/bin/env node
// `npm run smoke:print3d`: the "Save for 3D printing" entries open the dialog
// — File menu, Export menu, the 3D view's right-click menu and Ctrl+Shift+P —
// and its check reads a bundled model. Needs only the dev server
// (`npm run dev`, port 5196): no engine, models come from samples/.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, hasBrowser } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = process.env.APP_URL || 'http://localhost:5196/';
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const results = [];

async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok    ${name}`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`  FAIL  ${name}: ${err.message}`);
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

async function main() {
  if (!hasBrowser()) {
    console.log('[print3d] No Edge / Chrome found (set CHROME_PATH); skipped.');
    return 0;
  }
  const b = await launch({ port: 9571, width: 1520, height: 940 });
  const open = `!!document.querySelector('.print3d-modal [data-watertight]')`;
  const close = `[...document.querySelectorAll('.print3d-modal .modal-foot .btn')].find((x) => /취소|Cancel/.test(x.textContent)).click(); true`;
  try {
    await b.goto(APP);
    await b.eval(`localStorage.clear(); localStorage.setItem('my3dobjects-state', JSON.stringify({ engineUrl: 'http://127.0.0.1:9', lang: 'ko', showStartPage: false, tutorialAsk: false })); true`);
    await b.goto(APP);
    await b.drop([path.join(root, 'samples', 'models', 'pawn.stl')]);
    await b.waitFor(`!!window.__my3dobjectsViewer?.model`, 30000);

    await step('File menu → Save for 3D printing', async () => {
      await b.eval(`[...document.querySelectorAll('.toolbar .tbtn')].find((x) => /파일|File/.test(x.getAttribute('aria-label') || x.textContent)).click(); true`);
      await b.waitFor(`!!document.querySelector('[data-menu-print3d]')`, 5000);
      assert(await b.eval(`!!document.querySelector('[data-menu-print3d] svg')`), 'no icon');
      await b.eval(`document.querySelector('[data-menu-print3d]').click(); true`);
      await b.waitFor(open, 20000);
      await b.eval(close);
      await sleep(300);
    });

    await step('Export menu → Save for 3D printing', async () => {
      await b.eval(`[...document.querySelectorAll('.toolbar .tbtn')].find((x) => /내보내기|Export/.test(x.getAttribute('aria-label') || x.textContent)).click(); true`);
      await b.waitFor(`!!document.querySelector('[data-export-print3d]')`, 5000);
      await b.eval(`document.querySelector('[data-export-print3d]').click(); true`);
      await b.waitFor(open, 20000);
      await b.eval(close);
      await sleep(300);
    });

    await step('right-click menu → Save for 3D printing', async () => {
      const r = await b.eval(`(() => { const c = document.querySelector('.viewer3d-canvas').getBoundingClientRect(); return { x: c.left + 40, y: c.top + 40 }; })()`);
      await b.mouse('mousePressed', r.x, r.y, 'right', 2);
      await b.mouse('mouseReleased', r.x, r.y, 'right', 0);
      await b.waitFor(`!!document.querySelector('.ctxmenu')`, 3000);
      await b.eval(`[...document.querySelectorAll('.ctxmenu .ctxmenu-item')].find((x) => /3D 프린트|3D printing/.test(x.textContent)).click(); true`);
      await b.waitFor(open, 20000);
      await b.eval(close);
      await sleep(300);
    });

    await step('Ctrl+Shift+P, size and file type change the check', async () => {
      await b.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', ctrlKey: true, shiftKey: true })); true`);
      await b.waitFor(open, 20000);
      const before = await b.eval(`document.querySelector('[data-print3d-dims]').textContent`);
      assert(/× 100 mm$/.test(before), `height should be 100 mm: ${before}`);
      await b.eval(`[...document.querySelectorAll('.print3d-presets .btn')].find((x) => x.textContent.startsWith('50')).click(); true`);
      await b.waitFor(`/× 50 mm$/.test(document.querySelector('[data-print3d-dims]').textContent)`, 10000);
      await b.eval(`[...document.querySelectorAll('.print3d-modal .seg')].find((x) => x.textContent === 'STL').click(); true`);
      await b.waitFor(`/STL/.test(document.querySelector('[data-print3d-save]').textContent)`, 5000);
      const colours = await b.eval(`document.querySelector('.print3d-modal input[type=checkbox]:disabled') !== null`);
      assert(colours, 'colours should be off for STL');
      // Back to the defaults for the next run.
      await b.eval(`[...document.querySelectorAll('.print3d-presets .btn')].find((x) => x.textContent.startsWith('100')).click(); [...document.querySelectorAll('.print3d-modal .seg')].find((x) => x.textContent === '3MF').click(); true`);
      await sleep(400);
      await b.eval(close);
    });
  } finally {
    b.close();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`[print3d] ${results.length - failed}/${results.length} passed`);
  return failed ? 1 : 0;
}

main().then((code) => process.exit(code), (err) => { console.error(err); process.exit(1); });
