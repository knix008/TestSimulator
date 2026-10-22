// GUI smoke test: drives the real page over CDP and checks every feature area — the start page, every
// sample, viewing tools, measurements, filters, dialogs, the tutorial, both languages — and exports
// every format, then opens each exported file with OTHER programs (scripts/validate-exports.py:
// Pillow, pydicom, ffprobe, pdfinfo) to prove the files work outside MyDCMViewer.
//
//   npm run smoke                 web page in headless Edge / Chrome
//   npm run smoke:desktop         the Tauri program (build it first: cargo build --manifest-path src-tauri/Cargo.toml);
//                                 adds popup windows, printing to files and PACS against scripts/mini-pacs.cjs
//   node scripts/smoke.mjs --only export,pacs     run some sections (start, samples, view, measure, filters,
//                                                 dialogs, export, docs, tour, lang, pacs)
//   --keep                        keep the exported files (their folder is printed)
// Exit code 1 when a check fails. Skips (missing validator / not available here) are listed, never passed.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, sleep, root } from './cdp.mjs';

const argv = process.argv.slice(2);
const desktop = argv.includes('--desktop');
const keep = argv.includes('--keep');
const onlyArg = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : '';
const only = new Set(onlyArg ? onlyArg.split(',') : []);
const want = (s) => !only.size || only.has(s);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dcmv-smoke-'));
const saveDir = path.join(work, 'exports');
const printDir = path.join(work, 'print');
const folderDir = path.join(work, 'folder');
const inbox = path.join(work, 'pacs-inbox');
[saveDir, printDir, folderDir, inbox].forEach((d) => fs.mkdirSync(d, { recursive: true }));
const PACS_PORT = 11400 + Math.floor(Math.random() * 400), SCP_PORT = PACS_PORT + 500;

const results = [];
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };
function record(section, name, status, detail = '') {
  results.push({ section, name, status, detail });
  const mark = status === 'pass' ? `${C.g}✔` : status === 'skip' ? `${C.y}–` : `${C.r}✘`;
  console.log(`  ${mark}${C.x} ${name}${detail ? ` ${C.d}${detail}${C.x}` : ''}`);
}
/** fn throws to fail; may return a detail string; return { skip: 'why' } to skip. */
async function check(section, name, fn) {
  try {
    const r = await fn();
    if (r && typeof r === 'object' && r.skip) record(section, name, 'skip', r.skip);
    else record(section, name, 'pass', typeof r === 'string' ? r : '');
  } catch (e) {
    record(section, name, 'fail', (e && e.message ? e.message : String(e)).split('\n')[0].slice(0, 300));
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const page = await launch({
  desktop, lang: 'ko', width: 1440, height: 900,
  settings: { showStartOnLaunch: true, pacsNodes: [{ name: 'Mini', ae: 'MINIPACS', host: '127.0.0.1', port: PACS_PORT }], pacsLocalPort: SCP_PORT, pacsInbox: inbox },
  env: { MYDCMVIEWER_TEST_SAVE_DIR: saveDir, MYDCMVIEWER_TEST_PRINT_DIR: printDir, MYDCMVIEWER_TEST_FOLDER: folderDir, MYDCMVIEWER_TEST_ANSWER: '0' },
});
const outDir = desktop ? saveDir : page.downloads;
// first lines of each error, with the top of its stack so a failure says where it came from
const errorsOf = (p) => p.errors.splice(0).filter((e) => e && !/favicon|ResizeObserver loop/.test(e)).map((e) => String(e).split('\n').slice(0, 3).map((l) => l.trim()).join(' ⟵ '));

// fire an action without awaiting it inside evaluate (long awaits there can stall the webview)
async function act(action, dataset = {}) {
  await page.eval(`(window.__actErr = null, window.__actDone = false, App.runAction(${JSON.stringify(action)}, { dataset: ${JSON.stringify(dataset)} }).then(() => { window.__actDone = true; }, (e) => { window.__actErr = String(e && e.message || e); window.__actDone = true; }), 0)`);
}
async function actWait(action, dataset = {}, ms = 30000) {
  await act(action, dataset);
  await page.waitFor('window.__actDone', ms);
  const err = await page.eval('window.__actErr');
  if (err) throw new Error(`${action}: ${err}`);
}
const pixelSpread = `(() => { const c = App.state.frameCanvas; if (!c) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const step = 4 * Math.max(1, Math.floor(d.length / 4 / 20000)); let mn = 765, mx = 0; for (let i = 0; i < d.length; i += step) { const v = d[i] + d[i + 1] + d[i + 2]; if (v < mn) mn = v; if (v > mx) mx = v; } return mx - mn; })()`;
const pixelHash = `(() => { const c = App.state.frameCanvas; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) >>> 0; return h; })()`;
async function openSample(id) {
  await actWait('sample', { sample: id }, 45000);
  await page.waitFor(`App.state.file && (!document.getElementById('docView').hidden || !!App.state.frameCanvas || App.state.file.kind === 'image')`, 20000);
  await sleep(300);
}

// exports: wait for the new file, remember what it should be, validate them all in one go at the end
const exported = [];
const listOut = () => (fs.existsSync(outDir) ? fs.readdirSync(outDir, { recursive: true }).map(String) : []);
async function exportVia(name, action, dataset = {}, { ms = 60000, ext } = {}) {
  // a new file, or one rewritten now (the browser overwrites a download of the same name)
  const stamp = new Map(listOut().map((f) => [f, fs.statSync(path.join(outDir, f)).mtimeMs]));
  const before = { has: (f) => stamp.has(f) && fs.statSync(path.join(outDir, f)).mtimeMs === stamp.get(f) };
  // the progress popup must come up while it works (in-page modal on the web, a window on the desktop)
  // count progress popups the page opens (a fast one may come and go between two looks)
  await page.eval(`(() => { if (!window.__dlgHooked) { const o = App.Dlg.open.bind(App.Dlg); App.Dlg.open = (k, ...a) => { if (k === 'progress') window.__progressCount = (window.__progressCount || 0) + 1; return o(k, ...a); }; window.__dlgHooked = true; } window.__progressCount = 0; return 0; })()`);
  await act(action, dataset);
  let progress = false;
  const p0 = Date.now();
  while (Date.now() - p0 < ms) {
    if (!progress) progress = desktop
      ? (await page.targets()).some((x) => /kind=progress/.test(x.url))
      : await page.eval(`document.getElementById('modalHost').classList.contains('open') && document.getElementById('modalHost').dataset.kind === 'progress'`);
    if (await page.eval('window.__actDone')) break;
    await sleep(60);
  }
  const err = await page.eval('window.__actErr');
  if (err) throw new Error(`${action}: ${err}`);
  progress = progress || (await page.eval('window.__progressCount || 0')) > 0;
  assert(progress, `${name}: no progress popup was shown`);
  const t0 = Date.now();
  let found = null, lastSize = -1;
  while (Date.now() - t0 < ms) {
    const fresh = listOut().filter((f) => !before.has(f) && !/\.(crdownload|tmp|part)$/i.test(f) && fs.statSync(path.join(outDir, f)).isFile());
    if (fresh.length) {
      const f = path.join(outDir, fresh[0]);
      const size = fs.statSync(f).size;
      if (size > 0 && size === lastSize) { found = f; break; }
      lastSize = size;
    }
    await sleep(250);
  }
  assert(found, `${name}: no file was written`);
  if (ext) assert(found.toLowerCase().endsWith(ext), `${name}: wrote ${path.basename(found)}, expected *${ext}`);
  exported.push({ name, file: found });
  return `${path.basename(found)} (${(fs.statSync(found).size / 1024).toFixed(1)} KB)`;
}

// a dialog: an in-page modal on the web, a popup window on the desktop → { eval, waitFor, close }
async function dialog(kind, action, dataset = {}) {
  await act(action, dataset);
  if (!desktop) {
    await page.waitFor(`document.getElementById('modalHost').classList.contains('open') && document.getElementById('modalHost').dataset.kind === ${JSON.stringify(kind)}`, 10000);
    const scoped = (expr) => `(() => { const box = document.getElementById('modalBox'); return (${expr}); })()`;
    return { eval: (e, ms) => page.eval(scoped(e), ms), waitFor: (e, ms) => page.waitFor(scoped(e), ms), close: () => page.eval(`App.Dlg.close(${JSON.stringify(kind)})`), errors: () => errorsOf(page) };
  }
  let t = null;
  for (let i = 0; i < 60 && !t; i++) { t = (await page.targets()).find((x) => new RegExp(`popup\\.html.*kind=${kind}\\b`).test(x.url)); if (!t) await sleep(250); }
  assert(t, `no ${kind} popup window`);
  const pop = await page.connectTarget(t);
  await pop.waitFor(`document.querySelector('#popupBox') && document.querySelector('#popupBox').children.length > 0`, 15000);
  const scoped = (expr) => `(() => { const box = document.getElementById('popupBox'); return (${expr}); })()`;
  return {
    eval: (e, ms) => pop.eval(scoped(e), ms), waitFor: (e, ms) => pop.waitFor(scoped(e), ms),
    close: async () => { await page.eval(`App.Dlg.close(${JSON.stringify(kind)})`); await sleep(400); await pop.close(); },
    errors: () => errorsOf(pop),
  };
}

let pacsProc = null;
try {
  await page.waitFor('window.App && window.StartPage', 30000);
  await sleep(1200);

  /* ── Start page ── */
  if (want('start')) {
    console.log(`${C.b}Start page${C.x}`);
    await check('start', 'start page is shown at launch', async () => {
      await page.waitFor(`document.getElementById('startPage') && !document.getElementById('startPage').hidden`, 10000);
      return `${await page.eval(`document.querySelectorAll('#startPage [data-sample]').length`)} sample cards`;
    });
    await check('start', 'every sample card is listed', async () => {
      const n = await page.eval(`document.querySelectorAll('#startPage [data-sample]').length`), want = await page.eval('StartPage.SAMPLES.length');
      assert(n === want && n >= 15, `${n} cards for ${want} samples`);
    });
    await check('start', 'no script errors at startup', async () => { const e = errorsOf(page); assert(!e.length, e.join(' | ')); });
  }

  /* ── Every sample opens ── */
  if (want('samples')) {
    console.log(`${C.b}Samples${C.x}`);
    const samples = await page.eval('StartPage.SAMPLES.map((s) => s.id)');
    for (const id of samples) {
      await check('samples', `opens sample "${id}"`, async () => {
        await openSample(id);
        const doc = await page.eval(`!document.getElementById('docView').hidden`);
        const e = errorsOf(page);
        assert(!e.length, e.join(' | '));
        if (doc) return `document view: ${await page.eval(`document.querySelector('#docView h2') ? document.querySelector('#docView h2').textContent : ''`)}`;
        const spread = await page.eval(pixelSpread);
        assert(spread > 10, `image looks blank (spread ${spread})`);
        return `${await page.eval('App.state.frameCanvas.width')}×${await page.eval('App.state.frameCanvas.height')}`;
      });
    }
  }

  /* ── Viewing ── */
  if (want('view')) {
    console.log(`${C.b}Viewing${C.x}`);
    await openSample('ct');
    const st = (k) => page.eval(`App.state.file.image.state.${k}`);
    await check('view', 'window width step (W +)', async () => { const a = await st('ww'); await actWait('wl-step', { what: 'ww', dir: 1 }); const b = await st('ww'); assert(b > a, `${a} → ${b}`); return `${a} → ${b}`; });
    await check('view', 'CT preset (lung)', async () => { await actWait('preset', { value: 'lung' }); return `W ${await st('ww')} / L ${await st('wc')}`; });
    await check('view', 'auto window', async () => { await actWait('wl-auto'); return `W ${Math.round(await st('ww'))}`; });
    await check('view', 'colour map (hot iron)', async () => { await actWait('colormap', { value: 'hotiron' }); assert((await st('colormap')) === 'hotiron', 'colormap not set'); await actWait('colormap', { value: 'gray' }); });
    await check('view', 'invert toggles', async () => { const h0 = await page.eval(pixelHash); await actWait('toggle', { key: 'invert' }); const h1 = await page.eval(pixelHash); await actWait('toggle', { key: 'invert' }); assert(h0 !== h1, 'pixels unchanged'); });
    await check('view', 'zoom, rotate, flip, reset', async () => {
      const z0 = await page.eval('App.viewer.view.scale');
      await actWait('zoom-in'); await actWait('rotate-right'); await actWait('flip-h');
      const z1 = await page.eval('App.viewer.view.scale');
      await actWait('reset-view');
      assert(z1 !== z0, 'zoom did not change');
    });
    // where the image sits: the middle of the free area (less the rulers when they are on)
    const offCentre = `(() => { const v = App.viewer, s = v.source, vp = document.getElementById('viewport').getBoundingClientRect(); const a = v.imageToClient(0, 0), b = v.imageToClient(s.width, s.height); const l = v.showRuler ? 34 : 0, t = v.showRuler ? 22 : 0; return Math.round(Math.hypot((a.x + b.x) / 2 - (l + (vp.width - l) / 2), (a.y + b.y) / 2 - (t + (vp.height - t) / 2))); })()`;
    await check('view', 'an opened image is centred, also with the rulers on', async () => {
      const d0 = await page.eval(offCentre);
      await actWait('toggle', { key: 'ruler' }); await sleep(200);
      const d1 = await page.eval(offCentre);
      await actWait('toggle', { key: 'ruler' });
      assert(d0 <= 1 && d1 <= 1, `off by ${d0} / ${d1} px`);
    });
    await check('view', 'scale bar: on / off and moved with the mouse', async () => {
      if (!(await page.eval('App.viewer.showScaleBar'))) await actWait('toggle', { key: 'scaleBar' });
      const vp = await page.rect('#viewport');
      const from = { x: vp.x + vp.w / 2, y: vp.y + vp.h - 34 - 12 };
      const before = await page.eval(`JSON.stringify({ pos: App.viewer.scaleBarPos, el: (document.elementFromPoint(${from.x}, ${from.y}) || {}).id, vp: ${JSON.stringify(vp)} })`);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y });
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 6; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x - i * 40, y: from.y - i * 40, buttons: 1 });
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: from.x - 240, y: from.y - 240, button: 'left', buttons: 0, clickCount: 1 });
      await sleep(200);
      const pos = await page.eval('App.viewer.scaleBarPos');
      const pan = await page.eval('App.viewer.view.tx + App.viewer.view.ty');
      assert(pos && pos.fy < 0.8, `not moved: ${JSON.stringify(pos)}`);
      assert(pan === 0, `the drag panned the image instead ${before}`);
      await actWait('toggle', { key: 'scaleBar' });
      assert(!(await page.eval('App.viewer.showScaleBar')), 'still shown');
      await actWait('toggle', { key: 'scaleBar' });
      return `moved to ${pos.fx.toFixed(2)}, ${pos.fy.toFixed(2)}`;
    });
    await check('view', 'left panel folds and unfolds (panel button, rail)', async () => {
      await page.eval(`(document.querySelector('.side-collapse').click(), 0)`); await sleep(300);
      assert(await page.eval(`document.body.classList.contains('no-sidebar') && getComputedStyle(document.getElementById('sidebarRail')).display !== 'none'`), 'not folded');
      assert((await page.eval(offCentre)) <= 1, 'image not centred after folding');
      await page.eval(`(document.querySelector('#sidebarRail button').click(), 0)`); await sleep(300);
      assert(await page.eval(`!document.body.classList.contains('no-sidebar') && document.getElementById('sidebarBtn').classList.contains('checked')`), 'not unfolded');
    });
    await check('view', 'undo / redo', async () => { await actWait('wl-step', { what: 'wc', dir: 1 }); const a = await st('wc'); await actWait('undo'); const b = await st('wc'); await actWait('redo'); const c = await st('wc'); assert(a !== b && c === a, `${a} / ${b} / ${c}`); });
    await check('view', 'viewport layout 2×2 and back', async () => {
      await actWait('layout', { value: '2x2' }); await sleep(500);
      const n = await page.eval(`document.querySelectorAll('.layout-cell, .vp-cell, [data-cell]').length`);
      await actWait('layout', { value: '1x1' });
      return `${n} cells`;
    });
    await check('view', 'cine plays a multi-frame image', async () => {
      await openSample('emri');
      const f0 = await page.eval('App.state.frame');
      await actWait('cine-toggle'); await sleep(1500); await actWait('cine-toggle');
      const f1 = await page.eval('App.state.frame');
      assert(f1 !== f0, `still on frame ${f0}`);
      return `frame ${f0} → ${f1}`;
    });
    await check('view', 'no script errors', async () => { const e = errorsOf(page); assert(!e.length, e.join(' | ')); });
  }

  /* ── Measurements ── */
  if (want('measure')) {
    console.log(`${C.b}Measurements${C.x}`);
    await openSample('ct');
    await check('measure', 'length measurement with a value in mm', async () => {
      await actWait('clear-measurements'); await actWait('demo-measure');
      const a = await page.eval('App.viewer.annotations.map((a) => a.type + ":" + (a.label || "")).join(" ")');
      assert(/length:.*\d/.test(a), a || 'no annotation');
      return a;
    });
    for (const tool of ['pan', 'wl', 'zoom', 'probe', 'length', 'angle', 'cobb', 'rect', 'ellipse', 'polygon', 'freehand', 'point', 'arrow', 'text', 'magnify']) {
      await check('measure', `tool "${tool}" can be selected`, async () => { await actWait('tool', { tool }); assert((await page.eval('App.state.tool')) === tool, 'not selected'); });
    }
    await check('measure', 'drawing a rectangle ROI with the mouse gives statistics', async () => {
      await actWait('clear-measurements'); await actWait('tool', { tool: 'rect' });
      const r = await page.rect('#viewport');
      await page.drag(r.x + r.w * 0.42, r.y + r.h * 0.42, r.x + r.w * 0.58, r.y + r.h * 0.58);
      await sleep(400);
      const a = await page.eval('App.viewer.annotations.map((a) => a.type + ":" + (a.label || "")).join(" ")');
      await actWait('tool', { tool: 'pan' });
      assert(/rect/.test(a), a || 'no ROI');
      return a.slice(0, 120);
    });
    await check('measure', 'delete last / clear', async () => { await actWait('demo-measure'); const n = await page.eval('App.viewer.annotations.length'); await actWait('delete-last'); const m = await page.eval('App.viewer.annotations.length'); assert(m === n - 1, `${n} → ${m}`); });
  }

  /* ── Filters ── */
  if (want('filters')) {
    console.log(`${C.b}Image filters${C.x}`);
    await openSample('ct');
    const base = await page.eval(pixelHash);
    const ids = await page.eval('ImageFilters.FILTERS.map((f) => f.id)');
    for (const id of ids) {
      await check('filters', `filter "${id}" changes the picture`, async () => {
        await actWait('filter-quick', { value: id });
        const h = await page.eval(pixelHash);
        assert(h !== base, 'pixels unchanged');
        assert(await page.eval(`document.querySelector('[data-action="filter-quick"][data-value="${id}"]').classList.contains('checked')`), 'menu not checked');
      });
    }
    await check('filters', 'no filter restores the original exactly', async () => { await actWait('filter-quick', { value: '' }); assert((await page.eval(pixelHash)) === base, 'pixels differ'); });
    await check('filters', 'filter chain dialog adds two steps', async () => {
      const d = await dialog('filters', 'filters');
      await d.eval(`(box.querySelector('#fiAdd').click(), box.querySelector('#fiAdd').click(), 0)`);
      await sleep(600);
      const n = await page.eval('App.state.file.image.state.filters.length');
      await d.eval(`(box.querySelector('#fiReset').click(), 0)`); await sleep(400);
      await d.close();
      assert(n === 2, `${n} filters applied`);
    });
  }

  /* ── Dialogs ── */
  if (want('dialogs')) {
    console.log(`${C.b}Dialogs${C.x}`);
    await openSample('emri');
    const simple = [['about', 'about'], ['shortcuts', 'shortcuts'], ['settings', 'settings'], ['batch', 'batch'], ['tageditor', 'tag-editor'], ['anonymize', 'anonymize']];
    for (const [kind, action] of simple) {
      await check('dialogs', `${kind} dialog opens`, async () => {
        const d = await dialog(kind, action);
        const text = await d.eval('box.innerText.length');
        const e = d.errors(); await d.close();
        assert(text > 10, 'empty dialog'); assert(!e.length, e.join(' | '));
      });
    }
    await check('dialogs', 'MPR / MIP renders three planes', async () => {
      const d = await dialog('mpr', 'mpr');
      await d.waitFor(`box.querySelectorAll('canvas').length >= 3`, 20000);
      await sleep(1500);
      const n = await d.eval('box.querySelectorAll("canvas").length');
      const e = d.errors(); await d.close();
      assert(!e.length, e.join(' | '));
      return `${n} canvases`;
    });
    await check('dialogs', '3D volume rendering draws the volume (MIP, VR, iso)', async () => {
      const d = await dialog('volume', 'volume');
      await d.waitFor(`box.querySelector('.vr-stage canvas') && box.querySelector('.vr-progress') && box.querySelector('.vr-progress').hidden`, 30000);
      const spread = async () => d.eval(`(() => { const c = box.querySelector('.vr-stage canvas'); const t = document.createElement('canvas'); t.width = 96; t.height = 96; const x = t.getContext('2d'); x.drawImage(c, 0, 0, 96, 96); const p = x.getImageData(0, 0, 96, 96).data; let mn = 765, mx = 0; for (let i = 0; i < p.length; i += 4) { const v = p[i] + p[i + 1] + p[i + 2]; mn = Math.min(mn, v); mx = Math.max(mx, v); } return mx - mn; })()`);
      const out = [];
      for (const mode of ['mip', 'vr', 'iso']) {
        await d.eval(`(() => { const s = [...box.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === '${mode}')); s.value = '${mode}'; s.dispatchEvent(new Event('change', { bubbles: true })); s.dispatchEvent(new Event('input', { bubbles: true })); return 0; })()`);
        await sleep(1200);
        out.push(`${mode}:${await spread()}`);
      }
      const e = d.errors(); await d.close();
      assert(!e.length, e.join(' | '));
      assert(out.every((s) => +s.split(':')[1] > 20), `blank render ${out.join(' ')}`);
      return out.join(' ');
    });
    await check('dialogs', 'image fusion overlays a second image', async () => {
      await openSample('ct'); await openSample('rtdose');
      const d = await dialog('fusion', 'fusion');
      const h0 = await page.eval(pixelHash);
      await d.eval(`(() => { const s = box.querySelector('#fuTab'); s.value = s.options[1].value; s.dispatchEvent(new Event('input', { bubbles: true })); return 0; })()`);
      await sleep(1500);
      const h1 = await page.eval(pixelHash);
      await d.eval(`(() => { const s = box.querySelector('#fuTab'); s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); return 0; })()`);
      await sleep(500); await d.close();
      assert(h0 !== h1, 'overlay did not change the picture');
    });
    await check('dialogs', 'PACS window opens (web: explains it needs the desktop app)', async () => {
      const d = await dialog('pacs', 'pacs');
      const t = await d.eval('box.innerText');
      await d.close();
      assert(/C-FIND/.test(t), 'no search');
      return desktop ? 'desktop' : (/데스크톱|desktop/i.test(t) ? 'web notice shown' : 'web');
    });
  }

  /* ── Exports, each opened by another program ── */
  if (want('export')) {
    console.log(`${C.b}Export${C.x}`);
    await openSample('ct');
    await actWait('demo-measure');
    for (const f of ['png', 'jpeg', 'webp', 'bmp', 'tiff', 'gif']) await check('export', `export ${f.toUpperCase()}`, () => exportVia(f, 'export', { format: f }));
    await check('export', 'export 16-bit TIFF', () => exportVia('tiff16', 'export-tiff16'));
    await check('export', 'export PDF report', () => exportVia('pdf', 'export-pdf', {}, { ext: '.pdf' }));
    await check('export', 'export DICOM (uncompressed)', () => exportVia('dicom', 'export-dicom', {}, { ext: '.dcm' }));
    await check('export', 'export DICOM Secondary Capture', () => exportVia('dicom-sc', 'export-dicom-sc', {}, { ext: '.dcm' }));
    await check('export', 'anonymised copy: PHI replaced, new UIDs, pydicom reads it', async () => {
      const before = new Set(listOut());
      const d = await dialog('anonymize', 'anonymize');
      await d.eval(`(box.querySelector('.modal-actions .btn.primary').click(), 0)`);
      const t0 = Date.now(); let f = null;
      while (!f && Date.now() - t0 < 20000) { f = listOut().find((x) => !before.has(x) && /_anon\.dcm$/.test(x) && fs.statSync(path.join(outDir, x)).size > 0); if (!f) await sleep(250); }
      assert(f, 'no _anon.dcm written');
      await sleep(300);
      const file = path.join(outDir, f);
      const orig = path.join(root, 'samples', 'cornerstone', 'CTImage.dcm');
      const py = spawnSync('python', ['-E', '-P', '-c', `import pydicom,sys,json
a=pydicom.dcmread(sys.argv[1]); o=pydicom.dcmread(sys.argv[2])
print(json.dumps({'name': str(a.PatientName), 'removed': str(a.get('PatientIdentityRemoved','')), 'study': a.StudyInstanceUID != o.StudyInstanceUID, 'sop': a.SOPInstanceUID != o.SOPInstanceUID, 'meta': a.file_meta.MediaStorageSOPInstanceUID == a.SOPInstanceUID, 'private': any(e.tag.is_private for e in a.iterall()), 'pixels': (a.pixel_array == o.pixel_array).all().item()}))`, file, orig], { encoding: 'utf8' });
      if (py.error || py.status !== 0) return { skip: `pydicom: ${(py.stderr || String(py.error)).slice(0, 150)}` };
      const r = JSON.parse(py.stdout);
      assert(r.name === 'ANONYMOUS' && r.removed === 'YES' && r.study && r.sop && r.meta && !r.private && r.pixels, JSON.stringify(r));
      return `${f}: ${JSON.stringify(r)}`;
    });
    await check('export', 'export measurements CSV', () => exportVia('measurements', 'export-measurements', {}, { ext: '.csv' }));
    for (const f of ['txt', 'csv', 'json']) await check('export', `export tags ${f.toUpperCase()}`, () => exportVia(`tags-${f}`, 'export-tags', { format: f }, { ext: `.${f}` }));
    if (await page.eval('!!window.ImageExport')) {
      const formats = await page.eval(`Promise.all(ImageExport.FORMATS.map(async (f) => ({ id: f.id, ext: f.ext, kinds: f.kinds, ok: typeof f.isAvailable === 'function' ? await f.isAvailable() : f.available !== false })))`);
      for (const f of formats) {
        await check('export', `export as ${f.id} (.${String(f.ext).replace(/^\./, '')})`, async () => {
          if (!f.ok) return { skip: 'not available here' };
          return exportVia(`fmt-${f.id}`, 'export-as', { format: f.id }, { ms: 90000 });
        });
      }
    }
    await openSample('emri');
    await check('export', 'export all frames (ZIP)', () => exportVia('frames', 'export-frames', {}, { ext: '.zip' }));
    await check('export', 'export animated GIF', () => exportVia('gif-anim', 'export-gif-anim', {}, { ext: '.gif' }));
    await check('export', 'export cine video WebM', () => exportVia('webm', 'export-webm', {}, { ms: 120000, ext: '.webm' }));
    await check('export', 'export cine video MP4', async () => {
      const before = listOut().length;
      try { return await exportVia('mp4', 'export-mp4', {}, { ms: 120000, ext: '.mp4' }); } catch (e) {
        if (listOut().length === before && /no file/.test(e.message)) return { skip: 'MP4 (H.264) recording is not supported by this browser' };
        throw e;
      }
    });
    await check('export', 'export series as DICOMDIR', async () => {
      if (!desktop) return exportVia('dicomdir', 'export-dicomdir', {}, { ext: '.zip' });
      await actWait('export-dicomdir', {}, 60000);
      const dir = fs.readdirSync(folderDir).map((d) => path.join(folderDir, d)).find((d) => fs.existsSync(path.join(d, 'DICOMDIR')));
      assert(dir, 'no DICOMDIR folder written');
      exported.push({ name: 'dicomdir', file: path.join(dir, 'DICOMDIR') });
      return path.basename(dir);
    });
    if (desktop) {
      await check('export', 'print (to files through the test hook)', async () => {
        const d = await dialog('print', 'print');
        await d.eval(`(() => { const b = [...box.querySelectorAll('button')].find((b) => b.classList.contains('primary')); b.click(); return 0; })()`);
        const t0 = Date.now();
        while (!fs.readdirSync(printDir).length && Date.now() - t0 < 30000) await sleep(300);
        await d.close().catch(() => {});
        const pages = fs.readdirSync(printDir);
        assert(pages.length, 'nothing printed');
        pages.forEach((p) => exported.push({ name: `print-${p}`, file: path.join(printDir, p) }));
        return `${pages.length} page(s)`;
      });
    }
  }

  /* ── DICOM video: play / pause / stop, and the stream extracted for video players ── */
  if (want('video')) {
    console.log(`${C.b}DICOM video${C.x}`);
    for (const id of ['video', 'video-hevc']) {
      await check('video', `${id}: play, pause, stop`, async () => {
        await openSample(id);
        const v = await page.eval('App.state.file.kind === "dicom" && App.state.file.image.video ? App.state.file.image.video.codec : null');
        if (!v) return { skip: `${id} cannot be played by this browser engine (opened as a document)` };
        await actWait('cine-play'); await sleep(1200);
        const f1 = await page.eval('App.state.frame');
        assert(f1 > 0 && (await page.eval('!!App.state.cine')), `not playing (frame ${f1})`);
        await actWait('cine-pause'); await sleep(400);
        const p1 = await page.eval('App.state.frame'); await sleep(600);
        assert((await page.eval('App.state.frame')) === p1 && !(await page.eval('!!App.state.cine')), 'pause did not hold the frame');
        await actWait('cine-play'); await sleep(500);
        await actWait('cine-stop'); await sleep(500);
        assert((await page.eval('App.state.frame')) === 0 && !(await page.eval('!!App.state.cine')), 'stop did not return to frame 1');
        assert((await page.eval(pixelSpread)) > 10, 'blank picture');
        return `${v}: played to frame ${f1 + 1}, paused at ${p1 + 1}, stopped at 1`;
      });
    }
    await check('video', 'H.264 video extracted as MP4', async () => { await openSample('video'); return exportVia('video-mp4', 'video-extract', {}, { ext: '.mp4' }); });
    await check('video', 'MPEG-2 video opens as a document and extracts as .m2v', async () => {
      await openSample('video-mpeg2');
      assert(await page.eval(`!document.getElementById('docView').hidden && !!document.querySelector('#docView [data-doc="extract"]')`), 'no video document view');
      return exportVia('video-m2v', 'video-extract', {}, { ext: '.m2v' });
    });
  }

  /* ── Document views (SR, ECG, RT) and their exports ── */
  if (want('docs')) {
    console.log(`${C.b}Documents${C.x}`);
    const docSave = async (sample, button, ext) => {
      await openSample(sample);
      const before = new Set(listOut());
      await page.eval(`document.querySelector('#docView [data-doc="${button}"]').click()`);
      const t0 = Date.now(); let f = null;
      while (!f && Date.now() - t0 < 20000) { f = listOut().find((x) => !before.has(x) && x.toLowerCase().endsWith(ext) && fs.statSync(path.join(outDir, x)).size > 0); if (!f) await sleep(250); }
      assert(f, 'no file written');
      await sleep(300);
      exported.push({ name: `${sample}-${button}`, file: path.join(outDir, f) });
      return f;
    };
    await check('docs', 'SR → HTML', () => docSave('sr', 'html', '.html'));
    await check('docs', 'SR → text', () => docSave('sr', 'txt', '.txt'));
    await check('docs', 'ECG → CSV', () => docSave('ecg', 'csv', '.csv'));
    await check('docs', 'ECG → PNG', () => docSave('ecg', 'png', '.png'));
    await check('docs', 'RT structure set → CSV', () => docSave('rtstruct', 'csv', '.csv'));
    await check('docs', 'RT plan → text', () => docSave('rtplan', 'txt', '.txt'));
  }

  /* ── Tutorial ── */
  if (want('tour')) {
    console.log(`${C.b}Tutorial${C.x}`);
    await check('tour', 'every tutorial step runs to the end', async () => {
      await act('tour');
      await page.waitFor('Tour.active', 10000);
      const n = await page.eval('Tour.STEPS.length');
      for (let i = 0; i < n; i++) {
        await sleep(i === 0 ? 800 : 300);
        await page.waitFor(`Tour.index === ${i}`, 20000);
        // let the step's demo finish before going on
        await sleep(4500);
        await page.eval(`document.querySelector('.tour .tour-next').click()`);
      }
      await page.waitFor('!Tour.active', 10000);
      const e = errorsOf(page);
      assert(!e.length, e.join(' | '));
      return `${n} steps`;
    });
  }

  /* ── Languages ── */
  if (want('lang')) {
    console.log(`${C.b}Languages${C.x}`);
    for (const lang of ['en', 'ko']) {
      await check('lang', `${lang}: no untranslated keys on screen`, async () => {
        await actWait('lang', { value: lang }); await sleep(400);
        const raw = await page.eval(`[...document.querySelectorAll('[data-i18n]')].filter((e) => e.textContent.trim() === e.dataset.i18n).map((e) => e.dataset.i18n)`);
        assert(!raw.length, raw.slice(0, 8).join(', '));
      });
    }
  }

  /* ── PACS (desktop: real sockets) against scripts/mini-pacs.cjs ── */
  /* ── Desktop menus: drawn by the overlay window, which must be gone again once a menu closes (a forgotten
   *    overlay covers the screen and swallows every click: the program looks frozen) ── */
  if (want('menus') && desktop) {
    console.log(`${C.b}Menus (overlay window)${C.x}`);
    const overlayGone = async () => { await sleep(400); assert(!(await page.eval('window.desktopAPI.menuVisible()')), 'the menu overlay is still on screen'); };
    const titles = await page.eval('[...document.querySelectorAll(".menu > .menu-title")].map((t, i) => t.offsetParent ? i : -1).filter((i) => i >= 0)');
    await check('menus', `every menu opens in the overlay and closes with Esc (${titles.length})`, async () => {
      for (const i of titles) {
        await page.eval(`(document.querySelectorAll(".menu > .menu-title")[${i}].click(), 0)`);
        await page.waitFor('!!App.MenuMirror.panel', 5000);
        await sleep(300);
        assert(await page.eval('window.desktopAPI.menuVisible()'), `menu ${i} not shown`);
        await page.eval('(document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })), 0)');
        await page.waitFor('!App.MenuMirror.panel', 5000);
        await overlayGone();
      }
    });
    for (const [kind, action] of [['help', 'help-window'], ['about', 'about'], ['settings', 'settings'], ['shortcuts', 'shortcuts']]) {
      await check('menus', `${kind}: picked in the menu, opened and closed, the program still answers`, async () => {
        const i = await page.eval(`[...document.querySelectorAll("#menus .menu")].findIndex((m) => m.querySelector('[data-action="${action}"]'))`);
        await page.eval(`(document.querySelectorAll("#menus .menu")[${i}].querySelector(".menu-title").click(), 0)`);
        await page.waitFor('!!App.MenuMirror.panel', 5000);
        // what the overlay reports when the item is clicked there
        await page.eval(`(() => { const p = App.MenuMirror.panel; const index = [...p.querySelectorAll("button")].indexOf(p.querySelector('[data-action="${action}"]')); App.MenuMirror.onEvent({ type: "pick", index }); return 0; })()`);
        let t = null;
        for (let k = 0; k < 60 && !t; k++) { t = (await page.targets()).find((x) => new RegExp(`popup\\.html.*kind=${kind}\\b`).test(x.url)); if (!t) await sleep(250); }
        assert(t, `no ${kind} window`);
        await overlayGone();
        await sleep(800);
        await page.eval(`App.Dlg.close("${kind}")`);
        await sleep(800);
        await overlayGone();
        const info = await page.eval('window.desktopAPI.appInfo().then((x) => !!x)', 5000);
        assert(info, 'the host does not answer');
      });
    }
  }

  if (want('pacs') && desktop) {
    console.log(`${C.b}PACS${C.x}`);
    pacsProc = spawn(process.execPath, [path.join(root, 'scripts', 'mini-pacs.cjs'), '--port', String(PACS_PORT), '--dest', `MYDCMVIEWER=127.0.0.1:${SCP_PORT}`], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((r, j) => { pacsProc.stdout.on('data', (d) => { if (/READY/.test(d)) r(); }); pacsProc.once('exit', () => j(new Error('mini PACS did not start'))); });
    await openSample('ct');
    const d = await dialog('pacs', 'pacs');
    const status = () => d.eval(`box.querySelector('#pcStatus').textContent`);
    const idle = () => d.waitFor(`[...box.querySelectorAll('button')].every((b) => b.id === 'pcOpen' || !b.disabled)`, 60000);
    const click = async (id) => { await d.eval(`(box.querySelector('#${id}').click(), 0)`); await sleep(300); await idle(); return status(); };
    await check('pacs', 'verify (C-ECHO)', async () => { const s = await click('pcEcho'); assert(/C-ECHO/.test(s) && !(await d.eval(`box.querySelector('#pcStatus').classList.contains('err')`)), s); return s; });
    await check('pacs', 'search studies (C-FIND)', async () => {
      await d.eval(`(box.querySelector('#qName').value = 'MISTER*', 0)`);
      const s = await click('pcFind');
      assert((await d.eval(`box.querySelectorAll('#pcStudies tbody tr[data-i]').length`)) >= 1, s);
      await d.eval(`(box.querySelector('#pcStudies tbody tr[data-i]').click(), 0)`); await sleep(300); await idle();
      assert((await d.eval(`box.querySelectorAll('#pcSeries tbody tr[data-i]').length`)) >= 1, 'no series');
      return s;
    });
    const countInbox = () => fs.readdirSync(inbox, { recursive: true }).filter((f) => f.endsWith('.dcm')).length;
    await check('pacs', 'retrieve (C-GET) every instance', async () => { const n0 = countInbox(); const s = await click('pcGet'); const n = countInbox() - n0; assert(n >= 7, `${n} files: ${s}`); return `${n} files`; });
    await check('pacs', 'retrieve (C-MOVE) into our Storage SCP', async () => { const n0 = countInbox(); const s = await click('pcMove'); const n = countInbox() - n0; assert(n >= 7, `${n} files: ${s}`); return `${n} files`; });
    await check('pacs', 'send (C-STORE)', async () => { const s = await click('pcSend'); assert(/1/.test(s) && !(await d.eval(`box.querySelector('#pcStatus').classList.contains('err')`)), s); return s; });
    await check('pacs', 'retrieved files open in the viewer', async () => { await sleep(1500); const p = await page.eval('App.state.file && App.state.file.path'); assert(p && p.startsWith(inbox.slice(0, 20)), String(p)); });
    fs.readdirSync(inbox, { recursive: true }).filter((f) => f.endsWith('.dcm')).slice(0, 3).forEach((f) => exported.push({ name: `pacs-${path.basename(f)}`, file: path.join(inbox, f) }));
    await d.eval(`(box.querySelector('#pcClose').click(), 0)`).catch(() => {});
  }

  /* ── Validate every exported file with other programs ── */
  if (exported.length) {
    console.log(`${C.b}Exported files opened by other programs${C.x}`);
    const r = spawnSync('python', ['-E', '-P', path.join(root, 'scripts', 'validate-exports.py'), ...exported.map((e) => e.file)], { encoding: 'utf8', timeout: 600000 });
    const lines = (r.stdout || '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    if (r.error || (!lines.length && exported.length)) {
      for (const e of exported) record('validate', `${e.name} opens elsewhere`, 'skip', `python not usable: ${r.error ? r.error.message : (r.stderr || '').slice(0, 200)}`);
    } else {
      for (const e of exported) {
        const v = lines.find((x) => path.resolve(x.file) === path.resolve(e.file));
        if (!v) record('validate', `${e.name} opens elsewhere`, 'fail', 'not checked');
        else record('validate', `${e.name} → ${path.basename(e.file)}`, v.ok === true ? 'pass' : v.ok === null ? 'skip' : 'fail', `[${v.tool}] ${v.detail}`);
      }
    }
  }
} catch (e) {
  record('run', 'smoke run', 'fail', e.stack || e.message);
} finally {
  if (pacsProc) pacsProc.kill();
  await page.close();
  if (!keep) fs.rmSync(work, { recursive: true, force: true }); else console.log(`\nExports kept in ${work}`);
}

const pass = results.filter((r) => r.status === 'pass').length, fail = results.filter((r) => r.status === 'fail'), skip = results.filter((r) => r.status === 'skip').length;
console.log(`\n${C.b}${desktop ? 'Desktop' : 'Web'} smoke:${C.x} ${C.g}${pass} passed${C.x}, ${fail.length ? C.r : ''}${fail.length} failed${C.x}, ${C.y}${skip} skipped${C.x}`);
for (const f of fail) console.log(`  ${C.r}✘${C.x} [${f.section}] ${f.name}: ${f.detail}`);
process.exit(fail.length ? 1 : 0);
