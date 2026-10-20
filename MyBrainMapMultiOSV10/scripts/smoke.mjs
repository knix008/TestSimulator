// GUI smoke test: the web build in headless Edge / Chrome, driven with real
// mouse and keyboard input through CDP (src/App.jsx exposes window.__mtm to
// read the state). Every step must pass and the page must log no error.
//
//   npm run build && npm run smoke        (SMOKE_SHOTS=dir keeps screenshots)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, root } from './cdp.mjs';
import { createReport } from './gui-report.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
sharp.cache(false);   // no open file handles: the work folder is removed at the end
const { writeZip } = require('../core/zip.js');
const zipOf = (files) => writeZip(files);

const shots = process.env.SMOKE_SHOTS || '';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mtm-smoke-files-'));
const results = [];
let page;
let report;

const tree = `(() => { const d = window.__mtm.doc(); const walk = (t, dd) => [dd + ':' + t.text, ...(t.children || []).flatMap((c) => walk(c, dd + 1))]; return walk(d.map.root, 0); })()`;
// screen centre of a topic (by text), from the layout and the camera
const centerOf = (text) => `(() => { const L = window.__mtm.layout(); const v = window.__mtm.canvas().getView(); const r = document.querySelector('.map-canvas').getBoundingClientRect(); for (const n of L.nodes.values()) if (n.topic.text === ${JSON.stringify(text)}) return { x: r.left + v.x + (n.x + n.w / 2) * v.k, y: r.top + v.y + (n.y + n.h / 2) * v.k, w: n.w * v.k, h: n.h * v.k, id: n.id }; return null; })()`;

// screen centre of the first element matching a selector
const rectOfJs = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`;

async function step(name, fn) {
  const before = page.errors.length;
  try {
    await fn();
    if (page.errors.length > before) throw new Error(`page error: ${page.errors.slice(before).join(' | ')}`);
    results.push({ name, ok: true });
    report.pass(name);
  } catch (err) {
    results.push({ name, ok: false, err: err.message });
    report.fail(name, err.message);
    if (shots) await page.shot(path.join(shots, `fail-${results.length}.png`)).catch(() => {});
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };

async function main() {
  if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) { console.error('dist/ is missing — run npm run build first'); process.exit(1); }
  page = await launch({ lang: 'ko' });
  await page.waitFor('!!window.__mtm && !!document.querySelector(".start-page")');
  report = createReport('MyBrainMap — GUI smoke test');
  report.section('Start page');

  await step('start page shows the templates', async () => {
    const n = await page.eval('document.querySelectorAll(".task-card[data-template]").length');
    assert(n >= 9, `templates: ${n}`);
  });

  await step('start page shows no side panes', async () => {
    assert(!(await page.eval('!!document.querySelector(".sidebar") || !!document.querySelector(".task-pane")')), 'side panes visible');
  });

  await step('sample gallery opens a sample map', async () => {
    await page.clickSel('#start-samples');
    await page.waitFor('document.querySelectorAll(".tpl-card").length >= 15');
    await page.clickSel('.tpl-card[data-template="software-arch"]');
    await page.clickSel('.template-dialog .btn.primary');
    await page.waitFor('window.__mtm.doc() && window.__mtm.doc().map.relationships.length === 3');
    await page.eval("window.__mtm.run('close')");
    await page.sleep(200);
    await page.eval("window.__mtm.run('showStart')");
    await page.waitFor('!!document.querySelector("#start-new")');
  });

  report.section('Making and editing topics');
  await step('new map: type the central topic, Enter / Tab make topics', async () => {
    await page.clickSel('#start-new');
    await page.waitFor('!!window.__mtm.editing()');
    await page.type('여름 휴가');
    await page.key('Enter');
    await page.key('Tab');
    await page.waitFor('!!window.__mtm.editing()');
    await page.type('숙소');
    await page.key('Enter');
    await page.key('Enter');
    await page.waitFor('!!window.__mtm.editing()');
    await page.type('교통');
    await page.key('Tab');
    await page.waitFor('window.__mtm.editing() && window.__mtm.editing().isNew');
    await page.type('기차');
    await page.key('Enter');
    eq(await page.eval(tree), ['0:여름 휴가', '1:숙소', '1:교통', '2:기차'], 'tree');
  });

  await step('Korean IME composition types into a selected topic', async () => {
    const c = await page.eval(centerOf('숙소'));
    await page.click(c.x, c.y);
    await page.sleep(150);
    await page.send('Input.imeSetComposition', { text: 'ㅎ', selectionStart: 1, selectionEnd: 1 });
    await page.send('Input.imeSetComposition', { text: '호', selectionStart: 1, selectionEnd: 1 });
    await page.send('Input.imeSetComposition', { text: '호텔', selectionStart: 2, selectionEnd: 2 });
    await page.send('Input.insertText', { text: '호텔' });
    await page.sleep(150);
    await page.key('Enter');
    eq((await page.eval(tree))[1], '1:호텔', 'composed text');
  });

  await step('double-click edits; Escape cancels', async () => {
    const c = await page.eval(centerOf('호텔'));
    await page.click(c.x, c.y);
    await page.click(c.x, c.y);
    await page.waitFor('!!window.__mtm.editing()');
    await page.type('XXX');
    await page.key('Escape');
    eq((await page.eval(tree))[1], '1:호텔', 'text after cancel');
  });

  await step('arrow keys move the selection', async () => {
    await page.key('Home');
    await page.key('ArrowRight');
    const sel = await page.eval('(() => { const d = window.__mtm.doc(); const t = d.sel[0]; const find = (x) => x.id === t ? x : (x.children || []).map(find).find(Boolean); return find(d.map.root).text; })()');
    assert(['호텔', '교통'].includes(sel), `selected ${sel}`);
  });

  await step('drag a topic onto another makes it a child', async () => {
    const a = await page.eval(centerOf('기차'));
    const b = await page.eval(centerOf('호텔'));
    await page.drag(a.x, a.y, b.x, b.y);
    await page.sleep(200);
    eq(await page.eval(tree), ['0:여름 휴가', '1:호텔', '2:기차', '1:교통'], 'tree after drag');
  });

  await step('undo / redo', async () => {
    await page.key('z', { code: 'KeyZ', modifiers: 2 });
    await page.sleep(100);
    eq((await page.eval(tree))[3], '2:기차', 'undone');
    await page.key('y', { code: 'KeyY', modifiers: 2 });
    await page.sleep(100);
    eq((await page.eval(tree))[2], '2:기차', 'redone');
  });

  await step('drag to empty space moves the topic and keeps it connected', async () => {
    const a = await page.eval(centerOf('기차'));
    await page.drag(a.x, a.y, a.x + 40, a.y + 200);
    await page.sleep(200);
    const r = await page.eval(`(() => { const d = window.__mtm.doc(); const L = window.__mtm.layout(); for (const n of L.nodes.values()) if (n.topic.text === '기차') return { kind: n.kind, offset: n.topic.offset || null, line: L.lines.some((l) => l.id === n.id), floating: d.map.floating.length }; return null; })()`);
    eq(r.kind, 'child', 'still a subtopic');
    assert(r.offset && r.offset.y > 100, `moved by hand: ${JSON.stringify(r.offset)}`);
    assert(r.line, 'its line is drawn');
    eq(r.floating, 0, 'floating topics');
  });

  await step('Alt + drag to empty space makes a floating topic', async () => {
    const a = await page.eval(centerOf('기차'));
    await page.mouse('mouseMoved', a.x, a.y);
    await page.mouse('mousePressed', a.x, a.y);
    for (let i = 1; i <= 12; i++) await page.mouse('mouseMoved', a.x + i * 4, a.y + i * 6, { modifiers: 1 });
    await page.mouse('mouseReleased', a.x + 48, a.y + 72, { modifiers: 1 });
    await page.sleep(200);
    const n = await page.eval('window.__mtm.doc().map.floating.length');
    eq(n, 1, 'floating topics');
  });

  report.section('Structure');
  await step('relationship: toolbar, then click the target', async () => {
    const a = await page.eval(centerOf('호텔'));
    await page.click(a.x, a.y);
    await page.clickSel('[data-cmd="relationship"]');
    await page.sleep(100);
    const b = await page.eval(centerOf('교통'));
    await page.click(b.x, b.y);
    await page.sleep(150);
    eq(await page.eval('window.__mtm.doc().map.relationships.length'), 1, 'relationships');
  });

  await step('fold handle collapses a branch', async () => {
    const c = await page.eval(centerOf('여름 휴가'));
    await page.click(c.x, c.y);
    await page.eval("window.__mtm.run('template:project')");
    await page.sleep(600);
    const pos = await page.eval(`(() => { const L = window.__mtm.layout(); const v = window.__mtm.canvas().getView(); const r = document.querySelector('.map-canvas').getBoundingClientRect(); for (const n of L.nodes.values()) if (n.fold) return { x: r.left + v.x + (n.x + n.fold.x) * v.k, y: r.top + v.y + (n.y + n.fold.y) * v.k, id: n.id }; return null; })()`);
    await page.mouse('mouseMoved', pos.x, pos.y);
    await page.sleep(80);
    await page.click(pos.x, pos.y);
    await page.sleep(150);
    assert(await page.eval(`(() => { const find = (x) => x.id === ${JSON.stringify(pos.id)} ? x : (x.children || []).map(find).find(Boolean); return !!find(window.__mtm.doc().map.root).collapsed; })()`), 'collapsed');
  });

  await step('copy / paste a branch, delete keeping children', async () => {
    await page.eval("window.__mtm.run('new')");
    await page.sleep(300);
    await page.type('R');
    await page.key('Tab');
    await page.type('A');
    await page.key('Tab');
    await page.type('A1');
    await page.key('Enter');
    await page.eval(`window.__mtm.select([window.__mtm.doc().map.root.children[0].id])`);
    await page.key('c', { code: 'KeyC', modifiers: 2 });
    await page.key('Home');
    await page.key('v', { code: 'KeyV', modifiers: 2, commands: ['paste'] });
    await page.sleep(200);
    eq(await page.eval(tree), ['0:R', '1:A', '2:A1', '1:A', '2:A1'], 'pasted');
    await page.eval(`window.__mtm.select([window.__mtm.doc().map.root.children[1].id])`);
    await page.key('Delete', { modifiers: 2 });
    await page.sleep(150);
    eq(await page.eval(tree), ['0:R', '1:A', '2:A1', '1:A1'], 'kept children');
  });

  await step('callout and boundary from the keyboard', async () => {
    await page.eval(`window.__mtm.select([window.__mtm.doc().map.root.children[0].id])`);
    await page.key('Enter', { modifiers: 10 });   // Ctrl+Shift+Enter
    await page.waitFor('!!window.__mtm.editing()');
    await page.type('note');
    await page.key('Enter');
    await page.eval(`window.__mtm.select([window.__mtm.doc().map.root.children[0].id])`);
    await page.key('b', { code: 'KeyB', modifiers: 10 });
    await page.sleep(150);
    const a = await page.eval('window.__mtm.doc().map.root.children[0]');
    eq(a.callouts && a.callouts[0].text, 'note', 'callout');
    assert(a.boundary, 'boundary');
    assert(await page.eval('!!document.querySelector(".tm-boundary")'), 'boundary drawn');
  });

  await step('branch focus (F4) and back', async () => {
    await page.key('F4');
    await page.sleep(250);
    const n = await page.eval('window.__mtm.layout().nodes.size');
    await page.key('Escape');
    await page.sleep(250);
    const all = await page.eval('window.__mtm.layout().nodes.size');
    assert(n < all, `focus ${n} < ${all}`);
  });

  await step('context menu adds a subtopic', async () => {
    const c = await page.eval(centerOf('A1'));
    await page.mouse('mouseMoved', c.x, c.y);
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'right', clickCount: 1, buttons: 2 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'right', clickCount: 1 });
    await page.waitFor('!!document.querySelector(".ctx-menu")');
    await page.clickSel('.ctx-menu .ctx-item');
    await page.waitFor('!!window.__mtm.editing()');
    await page.type('A1a');
    await page.key('Enter');
    assert((await page.eval(tree)).includes('3:A1a') || (await page.eval(tree)).includes('2:A1a'), 'added from the menu');
  });

  report.section('Views and layouts');
  await step('outline view: Enter / Tab type a new subtopic', async () => {
    await page.clickSel('[data-cmd="view:outline"]');
    await page.sleep(300);
    try {
      await page.clickSel('.ov-row.root .ov-text');
      await page.key('End');
      await page.key('Enter');   // on the central topic: a first main topic
      await page.sleep(150);
      await page.type('outline topic');
      await page.key('Enter');
      await page.sleep(150);
      await page.type('sub');
      await page.key('Tab');
      await page.sleep(150);
      const t = await page.eval(tree);
      assert(t[1] === '1:outline topic' && t[2] === '2:sub', `tree ${t.join(',')}`);
    } finally {
      await page.clickSel('[data-cmd="view:map"]');
      await page.sleep(200);
    }
  });

  await step('relationship handle bends the curve', async () => {
    const ids = await page.eval('window.__mtm.doc().map.root.children.map((c) => c.id)');
    await page.eval(`window.__mtm.select(${JSON.stringify(ids.slice(0, 2))})`);
    await page.key('r', { code: 'KeyR', modifiers: 10 });
    await page.sleep(200);
    const relId = await page.eval('window.__mtm.doc().map.relationships[0].id');
    const hit = await page.eval(`(() => { const el = document.querySelector('[data-rel="${relId}"] .tm-rel-hit'); const len = el.getTotalLength(); const p = el.getPointAtLength(len / 2); const m = el.getScreenCTM(); return { x: p.x * m.a + m.e, y: p.y * m.d + m.f }; })()`);
    await page.click(hit.x, hit.y);
    await page.waitFor('!!document.querySelector(".tm-handle")');
    const h = await page.eval(rectOfJs('.tm-handle'));
    await page.drag(h.x, h.y, h.x + 60, h.y + 80);
    await page.sleep(150);
    assert(await page.eval('!!window.__mtm.doc().map.relationships[0].c1'), 'control point moved');
  });

  await step('Gantt: dragging a bar moves its dates', async () => {
    await page.eval("window.__mtm.run('template:project')");
    await page.sleep(500);
    await page.clickSel('[data-cmd="view:gantt"]');
    await page.sleep(300);
    try {
      const before = await page.eval('window.__mtm.doc().map.root.children[0].children[1].task.start');
      // rows: the project, phase 1, market research, requirements …
      const r = await page.eval('(() => { const el = document.querySelectorAll(".gantt-row")[3].querySelector(".gantt-task"); const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()');
      await page.drag(r.x, r.y, r.x + 28 * 3, r.y);
      await page.sleep(200);
      const after = await page.eval('window.__mtm.doc().map.root.children[0].children[1].task.start');
      assert(after > before, `${before} → ${after}`);
    } finally {
      await page.clickSel('[data-cmd="view:map"]');
      await page.sleep(200);
    }
  });

  for (const layout of ['map', 'right', 'orgDown', 'treeRight', 'timeline', 'fishbone']) {
    await step(`layout ${layout} draws`, async () => {
      await page.eval(`window.__mtm.run('layout:${layout}')`);
      await page.sleep(250);
      const n = await page.eval('document.querySelectorAll(".tm-layer .tm-topic").length');
      assert(n >= 5, `topics drawn: ${n}`);
      if (shots) await page.shot(path.join(shots, `layout-${layout}.png`));
    });
  }

  for (const v of ['outline', 'gantt', 'map']) {
    await step(`view ${v}`, async () => {
      await page.clickSel(`[data-cmd="view:${v}"]`);
      await page.sleep(300);
      const sel = { outline: '.outline-view .ov-row', gantt: '.gantt-view .gantt-task', map: '.map-canvas' }[v];
      assert(await page.eval(`!!document.querySelector(${JSON.stringify(sel)})`), `${sel} missing`);
    });
  }

  report.section('Task pane, find and filter');
  await step('task pane tabs render', async () => {
    for (const tab of ['format', 'markers', 'notes', 'task', 'links', 'map']) {
      await page.clickSel(`.pane-tab[data-pane="${tab}"]`);
      await page.sleep(120);
    }
  });

  await step('markers: priority from the pane', async () => {
    await page.key('Home');
    await page.clickSel('.pane-tab[data-pane="markers"]');
    await page.sleep(100);
    await page.clickSel('.marker-btn');
    await page.sleep(100);
    eq(await page.eval('window.__mtm.doc().map.root.task && window.__mtm.doc().map.root.task.priority'), 1, 'priority');
  });

  await step('filter by priority dims the rest', async () => {
    await page.eval("window.__mtm.run('side:filter')");
    await page.sleep(200);
    await page.clickSel('.index-item');
    await page.sleep(200);
    const dim = await page.eval('document.querySelectorAll(".tm-layer .tm-dim").length');
    assert(dim > 3, `dimmed: ${dim}`);
    await page.eval("window.__mtm.run('filterClear')");
  });

  await step('find selects matches', async () => {
    await page.key('f', { code: 'KeyF', modifiers: 2 });
    await page.sleep(150);
    await page.type('테스트');
    await page.sleep(200);
    const n = await page.eval('document.querySelectorAll(".sr-hit").length');
    assert(n >= 1, `hits ${n}`);
  });

  report.section('Presentation and files');
  await step('presentation opens and closes', async () => {
    await page.eval("window.__mtm.run('presentation')");
    await page.waitFor('!!document.querySelector(".presentation")');
    await page.key('ArrowRight');
    await page.sleep(300);
    if (shots) await page.shot(path.join(shots, 'presentation.png'));
    await page.key('Escape');
    await page.waitFor('!document.querySelector(".presentation")');
  });

  await step('save as .tmap and open it again', async () => {
    const file = path.join(work, 'project.tmap').replace(/\\/g, '/');
    const p = page.eval("window.__mtm.run('saveAs')");
    await page.waitFor('!!document.querySelector(".file-dialog")');
    await page.eval(`(() => { const i = document.querySelector('.fd-name input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(file)}); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    // the folder listing loads after the dialog opens and may move the dialog: wait, then click (again if needed)
    await page.waitFor('!!document.querySelector(".fd-path") && !!document.querySelector(".fd-path").value');
    await page.sleep(150);
    for (let i = 0; i < 3 && (await page.eval('!!document.querySelector(".file-dialog")')); i++) {
      await page.clickSel('.file-dialog .btn.primary');
      await page.sleep(300);
    }
    await p;
    // the save runs after the dialog closes: wait for the file and for the tab to take its name
    for (let i = 0; i < 50 && !fs.existsSync(file); i++) await page.sleep(100);
    if (!fs.existsSync(file)) {
      const why = await page.eval('JSON.stringify({ dialog: window.__mtm.dialog(), path: window.__mtm.doc().path, kind: window.__mtm.doc().kind, fd: !!document.querySelector(".file-dialog"), input: (document.querySelector(".fd-name input") || {}).value, msg: (document.querySelector(".status-text") || {}).textContent })');
      throw new Error(`file not written: ${why}`);
    }
    await page.waitFor('window.__mtm.doc().kind === "tmap"');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    eq(data.format, 'mybrainmap', 'format');
    const before = await page.eval('window.__mtm.docs().length');
    await page.eval(`(async () => { await window.__mtm.run('close'); })()`);
    await page.sleep(300);
    await page.eval(`window.__mtm.run('recent:${file}')`);
    await page.sleep(600);
    eq(await page.eval('window.__mtm.docs().length'), before, 'reopened');
    eq(await page.eval('window.__mtm.doc().name'), 'project.tmap', 'name');
  });

  for (const id of ['png', 'svg', 'pdf', 'docx', 'xmind', 'mm', 'md', 'opml', 'html', 'csv']) {
    await step(`export ${id}`, async () => {
      const file = path.join(work, `out.${id === 'jpeg' ? 'jpg' : id}`).replace(/\\/g, '/');
      await page.eval(`window.__mtm.export(${JSON.stringify(id)}, ${JSON.stringify(file)})`);
      assert(fs.existsSync(file) && fs.statSync(file).size > 100, `${file} written`);
    });
  }

  // ── picture exports: every format, the smallest size, the transparent background ──
  const out = (name) => path.join(work, name).replace(/\\/g, '/');
  const exportPic = (id, file, opts) => page.eval(`window.__mtm.export(${JSON.stringify(id)}, ${JSON.stringify(out(file))}, ${JSON.stringify(opts)})`);
  // the rows / columns at the picture's edges that have something drawn on them
  const edges = async (file) => {
    const { data, info } = await sharp(path.join(work, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const a = (x, y) => data[(y * info.width + x) * info.channels + 3];
    const rowHas = (y) => { for (let x = 0; x < info.width; x++) if (a(x, y)) return true; return false; };
    const colHas = (x) => { for (let y = 0; y < info.height; y++) if (a(x, y)) return true; return false; };
    let first = 0; while (first < info.height && !rowHas(first)) first++;
    let minA = 255; for (let i = 3; i < data.length; i += info.channels) if (data[i] < minA) minA = data[i];
    return { w: info.width, h: info.height, top: rowHas(0), bottom: rowHas(info.height - 1), left: colHas(0), right: colHas(info.width - 1), firstRow: first, minA, channels: info.channels };
  };
  await step('picture exports: PNG, JPEG, WebP, BMP, TIFF and SVG files, all the same size', async () => {
    await page.eval("window.__mtm.run('sample:churn-fishbone')");
    await page.sleep(500);
    const webp = await page.eval("document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp')");
    for (const [id, file] of [['png', 'pic.png'], ['jpeg', 'pic.jpg'], ['bmp', 'pic.bmp'], ['tiff', 'pic.tif'], ['svg', 'pic.svg'], ...(webp ? [['webp', 'pic.webp']] : [])]) {
      await exportPic(id, file, { padding: 0 });
      assert(fs.existsSync(path.join(work, file)) && fs.statSync(path.join(work, file)).size > 100, `${file} written`);
    }
    const png = await edges('pic.png');
    const magic = (f, n) => fs.readFileSync(path.join(work, f)).subarray(0, n);
    eq([...magic('pic.png', 4)], [0x89, 0x50, 0x4e, 0x47], 'PNG signature');
    eq([...magic('pic.jpg', 2)], [0xff, 0xd8], 'JPEG signature');
    eq(magic('pic.bmp', 2).toString('latin1'), 'BM', 'BMP signature');
    eq(magic('pic.tif', 4).toString('latin1'), 'II*\0', 'TIFF signature');
    const bmp = fs.readFileSync(path.join(work, 'pic.bmp'));
    eq([bmp.readInt32LE(18), bmp.readInt32LE(22)], [png.w, png.h], 'BMP size = PNG size');
    for (const f of ['pic.jpg', 'pic.tif', ...(webp ? ['pic.webp'] : [])]) { const m = await sharp(path.join(work, f)).metadata(); eq([m.width, m.height], [png.w, png.h], `${f} size = PNG size`); }
    const svg = fs.readFileSync(path.join(work, 'pic.svg'), 'utf8');
    const [, sw, sh] = /<svg[^>]* width="(\d+)" height="(\d+)"/.exec(svg);
    eq([+sw, +sh], [png.w, png.h], 'SVG size = PNG size (scale 1)');
  });
  await step('a picture is framed to its shapes: flush at margin 0 (drawn pixels on all four edges), the margin added outside them, 20 px by default', async () => {
    await exportPic('png', 'tight.png', { padding: 0, transparent: true });
    const t = await edges('tight.png');
    eq([t.top, t.bottom, t.left, t.right], [true, true, true, true], 'something drawn on every edge');
    await exportPic('png', 'margin.png', { padding: 20, transparent: true });
    const m = await edges('margin.png');
    eq([m.w - t.w, m.h - t.h], [40, 40], '20 px all round');
    eq(m.firstRow, 20, 'the first 20 rows are empty');
    eq([m.top, m.bottom, m.left, m.right], [false, false, false, false], 'nothing on the edges');
    // by default (no margin asked): every shape with 20 px of room all round, not cut flush
    await page.eval(`window.__mtm.applySettings({ exportMargin: 20 })`);
    await exportPic('png', 'default.png', { transparent: true });
    const d = await edges('default.png');
    eq([d.w - t.w, d.h - t.h, d.firstRow], [40, 40, 20], 'default: 20 px of room');
  });
  await step('a transparent background only when asked, in the formats that have one (PNG, WebP, TIFF, SVG)', async () => {
    eq((await edges('pic.png')).minA, 255, 'PNG on its background: no see-through pixel');
    eq((await edges('tight.png')).minA, 0, 'PNG transparent: see-through pixels');
    await exportPic('tiff', 'clear.tif', { padding: 0, transparent: true });
    eq((await sharp(path.join(work, 'clear.tif')).metadata()).channels, 4, 'TIFF transparent: RGBA');
    eq((await sharp(path.join(work, 'pic.tif')).metadata()).channels, 3, 'TIFF on its background: RGB');
    if (await page.eval("document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp')")) {
      await exportPic('webp', 'clear.webp', { padding: 0, transparent: true });
      eq((await edges('clear.webp')).minA, 0, 'WebP transparent');
      eq((await edges('pic.webp')).minA, 255, 'WebP on its background');
    }
    await exportPic('svg', 'clear.svg', { padding: 0, transparent: true });
    const opaque = fs.readFileSync(path.join(work, 'pic.svg'), 'utf8'), clear = fs.readFileSync(path.join(work, 'clear.svg'), 'utf8');
    const bgRect = (s) => { const [, x, y, w, h] = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(s); return s.includes(`<rect x="${x}" y="${y}" width="${w}" height="${h}"`); };
    eq([bgRect(opaque), bgRect(clear)], [true, false], 'SVG background rectangle only when not transparent');
    // JPEG and BMP cannot be transparent: asking changes nothing
    await exportPic('jpeg', 'ask.jpg', { padding: 0, transparent: true });
    eq((await sharp(path.join(work, 'ask.jpg')).metadata()).hasAlpha, false, 'JPEG has no alpha');
  });
  await step('the export dialog asks about a transparent background only for the formats that have one, and says the size', async () => {
    await page.eval("window.__mtm.run('export')");
    await page.waitFor('!!document.querySelector(".export-dialog")');
    const seen = {};
    for (const id of await page.eval('[...document.querySelectorAll(".export-item")].map((b) => b.dataset.export)')) {
      await page.clickSel(`.export-item[data-export="${id}"]`);
      await page.sleep(80);
      seen[id] = await page.eval('!!document.querySelector(".export-opts input[name=transparent]")');
    }
    eq(Object.keys(seen).filter((k) => seen[k]).sort(), ['png', 'svg', 'tiff', ...(seen.webp !== undefined ? ['webp'] : [])].sort(), 'formats with the transparent option');
    for (const id of ['png', 'jpeg', 'bmp', 'tiff', 'svg', 'pdf']) assert(id in seen, `${id} offered`);
    await page.clickSel('.export-item[data-export="png"]');
    await page.sleep(80);
    assert(/20px 여백|20px of room/.test(await page.eval('document.querySelector("[data-note=size]").textContent')), 'the size note');
    await page.key('Escape');
    await page.sleep(150);
  });

  // ── map files dropped on the page (the browser): every format the app opens ──
  await step('map files dragged onto the page open — XMind, MindManager, FreeMind, OPML, Markdown', async () => {
    const files = [['app.xmind', fs.readFileSync(path.join(work, 'out.xmind'))], ['app.mm', fs.readFileSync(path.join(work, 'out.mm'))], ['app.opml', fs.readFileSync(path.join(work, 'out.opml'))], ['app.md', fs.readFileSync(path.join(work, 'out.md'))],
      ['plan.mmap', zipOf([{ name: 'Document.xml', data: '<?xml version="1.0"?><ap:Map xmlns:ap="http://schemas.mindjet.com/MindManager/Application/2003"><ap:OneTopic><ap:Topic><ap:SubTopics><ap:Topic><ap:Text PlainText="A"/></ap:Topic><ap:Topic><ap:Text PlainText="B"/></ap:Topic></ap:SubTopics><ap:Text PlainText="Plan"/></ap:Topic></ap:OneTopic></ap:Map>' }])]];
    const before = await page.eval('window.__mtm.docs().length');
    const list = JSON.stringify(files.map(([n, b]) => [n, b.toString('base64')]));
    await page.eval(`(() => { const dt = new DataTransfer(); for (const [n, b] of ${list}) { const bin = atob(b); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); dt.items.add(new File([u], n)); } const at = document.querySelector('.map-canvas').getBoundingClientRect(); const o = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: at.left + 200, clientY: at.top + 200 }; const el = document.elementFromPoint(o.clientX, o.clientY); el.dispatchEvent(new DragEvent('dragover', o)); el.dispatchEvent(new DragEvent('drop', o)); })()`);
    await page.waitFor(`window.__mtm.docs().length >= ${before + files.length}`, 8000).catch(() => {});
    const docs = await page.eval(`window.__mtm.docs().slice(${before}).map((d) => [d.name, d.map.root.children.length])`);
    eq(docs.map((d) => d[0]), files.map((f) => f[0]), 'every file opened, in order');
    for (const [name, n] of docs) assert(n >= 2, `${name}: ${n} main topics`);
  });

  // ── the window's top: app controls on the menu bar, one-row toolbar with even margins ──
  await step('theme, language, settings and info sit right-aligned on the menu bar; the toolbar is one row with equal margins', async () => {
    const r = await page.eval(`(() => { const mb = document.querySelector('.menubar').getBoundingClientRect(); const ac = document.querySelector('.menubar .app-controls'); const it = document.querySelector('.icon-toolbar'); const tr = it.getBoundingClientRect(); const gs = [...it.querySelectorAll('.tb-group')]; const a = gs[0].getBoundingClientRect(), b = gs[gs.length - 1].getBoundingClientRect(); const next = ac.nextElementSibling; return { inToolbar: !!it.querySelector('.app-controls'), right: Math.round(mb.right - ac.getBoundingClientRect().right), after: next ? next.className : '', buttons: ac.querySelectorAll('button').length, rows: new Set(gs.map((g) => { const b = g.getBoundingClientRect(); return Math.round((b.top + b.bottom) / 20); })).size, left: Math.round(a.left - tr.left), rightGap: Math.round(tr.right - b.right) }; })()`);
    eq(r.inToolbar, false, 'no app controls on the toolbar');
    assert(r.right <= 12, `right-aligned on the menu bar (${r.right} px from the end)`);
    assert(r.after === '' || /win-buttons/.test(r.after), `followed only by the window buttons (${r.after})`);
    eq(r.buttons, 5, 'theme, theme list, language, settings, info');
    eq(r.rows, 1, 'toolbar rows');
    assert(Math.abs(r.left - r.rightGap) <= 1, `toolbar margins ${r.left} / ${r.rightGap}`);
  });
  await step('toolbar: one group per kind of command, a visible separator between groups', async () => {
    const groups = await page.eval(`[...document.querySelectorAll('.icon-toolbar .tb-group')].map((g) => [...g.querySelectorAll('[data-cmd]')].map((b) => b.dataset.cmd))`);
    eq(groups, [
      ['new', 'open', 'save'], ['export', 'print'], ['undo', 'redo'],
      ['addChild', 'addSibling', 'addParent', 'addCallout', 'addFloating'], ['relationship', 'boundary', 'summary'],
      ['pane:markers', 'pane:notes', 'pane:links', 'pane:task'], ['layoutMenu', 'styleMenu'],
      ['redraw:orgDown', 'redraw:right', 'redraw:left', 'redraw:map', 'arrange'], ['expandAll', 'collapseAll', 'focusBranch'],
      ['zoomOut', 'zoomIn', 'fit', 'centerMap'], ['view:map', 'view:outline', 'view:gantt', 'view:kanban', 'presentation'],
      ['toggle:showGrid', 'toggle:showRulers', 'toggle:overviewVisible'], ['toggle:sidebarVisible', 'toggle:panelVisible'],
    ], 'groups');
    const seps = await page.eval(`[...document.querySelectorAll('.icon-toolbar .tb-sep')].map((s) => { const r = s.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), getComputedStyle(s).backgroundColor]; })`);
    eq(seps.length, groups.length - 1, 'a separator between every two groups');
    assert(seps.every(([w, h, c]) => w >= 1 && h >= 16 && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)), `separators visible: ${JSON.stringify(seps[0])}`);
  });
  await step('theme drop-down hangs straight down from its button', async () => {
    await page.clickSel('.menubar .tb-split-caret');
    await page.sleep(300);
    const r = await page.eval(`(() => { const s = document.querySelector('.menubar .tb-split').getBoundingClientRect(); const m = document.querySelector('.theme-menu').getBoundingClientRect(); return { sl: s.left, sr: s.right, sb: s.bottom, ml: m.left, mr: m.right, mt: m.top, vw: innerWidth }; })()`);
    await page.key('Escape');
    // starts under the button's left edge, or — no room to the right — ends under its right edge
    const left = Math.abs(r.ml - r.sl) <= 1, right = Math.abs(r.mr - r.sr) <= 1 && r.sl + (r.mr - r.ml) > r.vw - 8;
    assert(left || right, `menu ${Math.round(r.ml)}–${Math.round(r.mr)}, button ${Math.round(r.sl)}–${Math.round(r.sr)}`);
    assert(r.mt >= r.sb && r.mt - r.sb <= 4, 'right under the button');
  });
  await step('tabs: "<" / ">" are enabled exactly while tabs are hidden on their side, and bring them into view', async () => {
    for (let i = 0; i < 14; i++) await page.eval("window.__mtm.run('new')");
    await page.sleep(400);
    const st = () => page.eval(`(() => { const s = document.querySelector('.tab-strip'); const a = s.querySelector('.tab.active'); const sr = s.getBoundingClientRect(), ar = a.getBoundingClientRect(); return { prev: !document.querySelector('[data-cmd=tab-prev]').disabled, next: !document.querySelector('[data-cmd=tab-next]').disabled, hiddenL: s.scrollLeft > 0, hiddenR: s.scrollLeft + s.clientWidth < s.scrollWidth - 1, activeShown: ar.left >= sr.left - 1 && ar.right <= sr.right + 1 }; })()`);
    let s = await st();
    assert(s.hiddenL, 'tabs overflow to the left (the newest is active, at the end)');
    eq([s.prev, s.next, s.activeShown], [true, false, true], 'at the end: < on, > off');
    for (let k = 0; k < 30 && (await st()).prev; k++) { await page.clickSel('[data-cmd=tab-prev]'); await page.sleep(60); }
    s = await st();
    eq([s.hiddenL, s.prev, s.next], [false, false, true], 'scrolled to the start: < off, > on');
    await page.clickSel('[data-cmd=tab-next]'); await page.sleep(80);
    eq((await st()).prev, true, 'one step right: < on again');
    // a narrower window: the active tab stays in view and the arrows follow
    await page.eval("window.__mtm.applySettings({ sidebarWidth: 520, panelWidth: 520 })");
    await page.sleep(400);
    s = await st();
    eq(s.activeShown, true, 'active tab still shown after narrowing');
    eq([s.prev, s.next], [s.hiddenL, s.hiddenR], 'arrows match what is hidden');
    await page.eval("window.__mtm.applySettings({ sidebarWidth: 250, panelWidth: 300 })");
    for (let i = 0; i < 14; i++) await page.eval("(async () => { await window.__mtm.run('close'); })()");
    await page.sleep(300);
  });
  await step('Format pane: copy / paste / clear format buttons line up with the subtopic layout buttons', async () => {
    await page.eval("window.__mtm.run('tour:pane:format')");
    await page.eval('window.__mtm.select([window.__mtm.doc().map.root.children[0].id])');
    await page.sleep(250);
    const r = await page.eval(`(() => { const g = document.querySelector('.task-pane .layout-grid.small').getBoundingClientRect(); const bs = [...document.querySelectorAll('.task-pane .fmt-actions button')].map((b) => b.getBoundingClientRect()); return { n: bs.length, rows: new Set(bs.map((b) => Math.round(b.top))).size, left: Math.round(bs[0].left - g.left), right: Math.round(g.right - bs[bs.length - 1].right), widths: bs.map((b) => Math.round(b.width)) }; })()`);
    eq([r.n, r.rows], [3, 1], 'three buttons on one row');
    eq([r.left, r.right], [0, 0], 'same edges as the layout buttons');
    assert(Math.max(...r.widths) - Math.min(...r.widths) <= 1, `even widths ${r.widths}`);
  });

  await step('import: the exported files open again', async () => {
    for (const ext of ['mm', 'xmind', 'opml', 'md']) {
      await page.eval(`window.__mtm.run('recent:${path.join(work, `out.${ext}`).replace(/\\/g, '/')}')`);
      await page.sleep(400);
      const n = await page.eval('window.__mtm.doc().map.root.children.length');
      assert(n >= 3, `${ext}: ${n} main topics`);
    }
  });

  report.section('Settings');
  await step('settings dialog switches theme and language', async () => {
    await page.eval("window.__mtm.run('settings')");
    await page.waitFor('!!document.querySelector(".dlg.settings")');
    await page.clickSel('.settings-tab[data-tab="theme"]');
    await page.sleep(100);
    await page.clickSel('.theme-card:nth-child(2)');
    await page.sleep(100);
    await page.key('Escape');
    await page.eval("window.__mtm.run('toggleLanguage')");
    await page.sleep(150);
    eq(await page.eval('document.querySelector(".menu-btn:not(.start-nav) .widest span").textContent'), 'File', 'english menu');
    await page.eval("window.__mtm.run('toggleLanguage')");
  });

  // ── grid, rulers, overview, panes, layout direction, auto arrange ──
  report.section('Canvas tools, arranging, new features');
  await step('toolbar toggles the grid, rulers and overview', async () => {
    await page.eval("window.__mtm.run('sample:software-arch')");
    await page.waitFor('!!document.querySelector(".map-canvas")');
    await page.sleep(400);
    const state = () => page.eval('[document.querySelector(".map-canvas").classList.contains("grid"), !!document.querySelector(".ruler-x"), !!document.querySelector(".overview")]');
    const before = await state();
    for (const id of ['toggle:showGrid', 'toggle:showRulers', 'toggle:overviewVisible']) await page.clickSel(`[data-cmd="${id}"]`);
    await page.sleep(150);
    eq(await state(), before.map((v) => !v), 'all three flipped');
    for (const id of ['toggle:showGrid', 'toggle:showRulers', 'toggle:overviewVisible']) await page.clickSel(`[data-cmd="${id}"]`);
    await page.sleep(150);
    eq(await state(), before, 'and back');
  });

  await step('redraw buttons change the direction; auto arrange puts moved topics back', async () => {
    for (const [cmd, layout] of [['redraw:orgDown', 'orgDown'], ['redraw:right', 'right'], ['redraw:left', 'left'], ['redraw:map', 'map']]) {
      await page.clickSel(`[data-cmd="${cmd}"]`);
      await page.sleep(120);
      eq(await page.eval('window.__mtm.doc().map.layout'), layout, cmd);
    }
    const a = await page.eval(centerOf('운영'));
    await page.drag(a.x, a.y, a.x + 20, a.y + 160);
    await page.sleep(150);
    assert(await page.eval("!!window.__mtm.doc().map.root.children.find((c) => c.text === '운영').offset"), 'moved');
    await page.clickSel('[data-cmd="arrange"]');
    await page.sleep(150);
    assert(await page.eval("!window.__mtm.doc().map.root.children.find((c) => c.text === '운영').offset"), 'arranged');
  });

  await step('Ctrl+Alt keys: grid, rulers, panes, redraw', async () => {
    await page.eval('window.__mtm.canvas().focus()');
    const g = await page.eval('window.__mtm.settings().showGrid');
    await page.key('g', { code: 'KeyG', modifiers: 3 });
    await page.sleep(100);
    eq(await page.eval('window.__mtm.settings().showGrid'), !g, 'Ctrl+Alt+G');
    await page.key('g', { code: 'KeyG', modifiers: 3 });
    await page.key('ArrowDown', { modifiers: 3 });
    await page.sleep(150);
    eq(await page.eval('window.__mtm.doc().map.layout'), 'orgDown', 'Ctrl+Alt+Down');
    await page.key('m', { code: 'KeyM', modifiers: 3 });
    await page.sleep(150);
    eq(await page.eval('window.__mtm.doc().map.layout'), 'map', 'Ctrl+Alt+M');
  });

  await step('side panes fold and unfold', async () => {
    await page.clickSel('[data-cmd="collapse-left"]');
    await page.clickSel('[data-cmd="collapse-right"]');
    await page.sleep(150);
    eq(await page.eval('[!!document.querySelector(".sidebar"), !!document.querySelector(".task-pane")]'), [false, false], 'folded');
    await page.clickSel('[data-cmd="expand-left"]');
    await page.clickSel('[data-cmd="expand-right"]');
    await page.sleep(150);
    eq(await page.eval('[!!document.querySelector(".sidebar"), !!document.querySelector(".task-pane")]'), [true, true], 'unfolded');
  });

  await step('right-click in the left pane shows the topic menu, every item with an icon', async () => {
    await page.clickSel('[data-side="outline"]');
    await page.sleep(150);
    const p = await page.eval('(() => { const b = document.querySelectorAll(".outline-tree .tree-row")[1].getBoundingClientRect(); return { x: b.x + 40, y: b.y + b.height / 2 }; })()');
    await page.mouse('mouseMoved', p.x, p.y);
    await page.mouse('mousePressed', p.x, p.y, { button: 'right' });
    await page.mouse('mouseReleased', p.x, p.y, { button: 'right' });
    await page.sleep(200);
    const r = await page.eval('[document.querySelectorAll(".ctx-menu .ctx-item").length, [...document.querySelectorAll(".ctx-menu .ctx-item")].filter((b) => !b.querySelector(".ctx-icon svg, .ctx-icon .ctx-marker")).length]');
    assert(r[0] > 10, `items: ${r[0]}`);
    eq(r[1], 0, 'items without an icon');
    await page.key('Escape');
  });

  await step('summary, comments, custom properties and the Kanban board', async () => {
    await page.eval("(() => { const d = window.__mtm.doc(); window.__mtm.select([d.map.root.children.find((c) => c.text === '데이터').id]); })()");
    await page.eval("void window.__mtm.run('summary')");
    await page.waitFor('!!document.querySelector(".dlg input")');
    await page.clickSel('.dlg .btn.primary');
    await page.sleep(200);
    eq(await page.eval('document.querySelectorAll(".tm-summary").length'), 1, 'summary drawn');
    await page.eval("window.__mtm.run('pane:notes', true)");
    await page.waitFor('!!document.querySelector(".comment-new textarea")');
    await page.eval("document.querySelector('.comment-new textarea').focus()");
    await page.type('확인 필요');
    await page.clickSel('.comment-new .btn');
    await page.sleep(150);
    eq(await page.eval("window.__mtm.doc().map.root.children.find((c) => c.text === '데이터').comments.length"), 1, 'comment added');
    await page.eval("window.__mtm.run('view:kanban')");
    await page.waitFor('!!document.querySelector(".kanban-card")');
    eq(await page.eval('document.querySelectorAll(".kanban-col[data-col]").length'), 5, 'columns');
    await page.eval("window.__mtm.run('view:map')");
  });

  await step('dragging a topic carries its line along in the map, org chart and fishbone layouts', async () => {
    for (const layout of ['map', 'orgDown', 'fishbone']) {
      await page.eval(`window.__mtm.run('redraw:${layout}')`);
      await page.sleep(300);
      await page.eval("window.__mtm.run('fit')");
      await page.sleep(350);
      const t = await page.eval("(() => { const d = window.__mtm.doc(); return d.map.root.children[1].text; })()");
      const a = await page.eval(centerOf(t));
      // an empty spot near the topic (dropping on another topic would make it that topic's child)
      const to = await page.eval(`(() => { const L = window.__mtm.layout(); const v = window.__mtm.canvas().getView(); const r = document.querySelector('.map-canvas').getBoundingClientRect(); const free = (sx, sy) => { const x = (sx - r.left - v.x) / v.k, y = (sy - r.top - v.y) / v.k; for (const n of L.nodes.values()) if (x >= n.x - 30 && x <= n.x + n.w + 30 && y >= n.y - 30 && y <= n.y + n.h + 30) return false; return sx > r.left + 40 && sx < r.right - 240 && sy > r.top + 40 && sy < r.bottom - 160; }; for (let d = 60; d < 400; d += 20) for (const [ux, uy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [0, 1], [0, -1], [1, 0], [-1, 0]]) { const x = ${a.x} + ux * d, y = ${a.y} + uy * d; if (free(x, y)) return { x, y }; } return null; })()`);
      assert(to, `${layout}: an empty spot to drop on`);
      await page.drag(a.x, a.y, to.x, to.y, 16);
      await page.sleep(250);
      const r = await page.eval(`(() => { const L = window.__mtm.layout(); const d = window.__mtm.doc(); const id = d.map.root.children[1].id; const n = L.nodes.get(id); const el = document.querySelector('.tm-layer [data-line="' + CSS.escape(id) + '"]'); if (!el) return { line: false }; const len = el.getTotalLength(); const ends = Array.from({ length: 41 }, (_, i) => el.getPointAtLength((len * i) / 40)); const on = ends.some((q) => q.x >= n.x - 4 && q.x <= n.x + n.w + 4 && q.y >= n.y - 4 && q.y <= n.y + n.h + 4); return { line: true, moved: !!d.map.root.children[1].offset, on }; })()`);
      assert(r.line, `${layout}: the line is drawn`);
      assert(r.moved, `${layout}: the topic was moved`);
      assert(r.on, `${layout}: the drawn line reaches the moved topic`);
      await page.eval("window.__mtm.run('undo')");
      await page.sleep(150);
    }
    await page.eval("window.__mtm.run('redraw:map')");
  });

  await step('on the fishbone sample every line stays straight when a cause, a sub-cause or a deeper topic is dragged', async () => {
    await page.eval("window.__mtm.run('sample:churn-fishbone')");
    await page.sleep(500);
    // the drawn path of every line: only M / L, and one segment
    const BENT = `[...document.querySelectorAll('.tm-layer [data-line]')].map((el) => el.getAttribute('d')).filter((d) => /[CQHVAZ]/i.test(d.slice(1)) || (d.match(/[ML]/g) || []).length !== 2)`;
    eq(await page.eval(BENT), [], 'bent lines on the sample');
    const pick = [
      'window.__mtm.doc().map.root.children[2].text',
      'window.__mtm.doc().map.root.children[1].children[0].text',
      'window.__mtm.doc().map.root.children[0].children[0].children[0].text',
    ];
    for (const [i, expr] of pick.entries()) {
      await page.eval("window.__mtm.run('fit')");
      await page.sleep(350);
      const t = await page.eval(expr);
      const a = await page.eval(centerOf(t));
      const to = await page.eval(`(() => { const L = window.__mtm.layout(); const v = window.__mtm.canvas().getView(); const r = document.querySelector('.map-canvas').getBoundingClientRect(); const free = (sx, sy) => { const x = (sx - r.left - v.x) / v.k, y = (sy - r.top - v.y) / v.k; for (const n of L.nodes.values()) if (x >= n.x - 20 && x <= n.x + n.w + 20 && y >= n.y - 20 && y <= n.y + n.h + 20) return false; return sx > r.left + 40 && sx < r.right - 240 && sy > r.top + 40 && sy < r.bottom - 160; }; for (let d = 40; d < 400; d += 15) for (const [ux, uy] of [[-1, -1], [1, 1], [-1, 1], [1, -1], [0, 1], [0, -1], [1, 0], [-1, 0]]) { const x = ${a.x} + ux * d, y = ${a.y} + uy * d; if (free(x, y)) return { x, y }; } return null; })()`);
      assert(to, `${t}: an empty spot to drop on`);
      await page.drag(a.x, a.y, to.x, to.y, 16);
      await page.sleep(250);
      assert(await page.eval(`(() => { const f = (t) => t.id === ${JSON.stringify(a.id)} ? t : (t.children || []).map(f).find(Boolean); return !!f(window.__mtm.doc().map.root).offset; })()`), `${t}: moved by hand`);
      eq(await page.eval(BENT), [], `bent lines after dragging "${t}"`);
      if (shots) await page.shot(path.join(shots, `fishbone-drag-${i}.png`));
    }
  });

  await step('every menu-bar menu and every drop-down list shows an icon on each entry', async () => {
    const NOICON = "[...document.querySelectorAll('.ctx-menu .ctx-item')].filter((b) => !b.querySelector('.ctx-icon svg, .ctx-icon .ctx-marker, .ctx-icon span, .theme-swatch')).map((b) => b.querySelector('.ctx-label').textContent)";
    const menus = await page.eval("[...document.querySelectorAll('.menus .menu-btn[data-menu]')].map((b) => b.dataset.menu)");
    const missing = [];
    for (const m of menus) {
      await page.clickSel(`.menu-btn[data-menu="${m}"]`); await page.sleep(200);
      missing.push(...(await page.eval(NOICON)).map((l) => `${m}: ${l}`));
      await page.key('Escape'); await page.sleep(120);
    }
    eq(missing, [], 'menu items without an icon');
    eq(await page.eval('document.querySelectorAll("select").length'), 0, 'plain <select> elements (no icons possible)');
    await page.eval("void window.__mtm.run('pane:format', true)");
    await page.eval('window.__mtm.select([window.__mtm.doc().map.root.children[0].id])');
    await page.sleep(250);
    const names = await page.eval('[...document.querySelectorAll(".icon-select")].filter((b) => b.offsetParent && !b.disabled).map((b) => b.dataset.name)');
    assert(names.length >= 3, `drop-downs: ${names.join(', ')}`);
    for (const n of names) {
      await page.eval(`document.querySelector('.icon-select[data-name="${n}"]').scrollIntoView({ block: 'center' })`);
      await page.clickSel(`.icon-select[data-name="${n}"]`); await page.sleep(200);
      const r = await page.eval(`[document.querySelectorAll('.select-menu .ctx-item').length, ${NOICON}]`);
      assert(r[0] > 1, `${n}: ${r[0]} entries`);
      eq(r[1], [], `${n}: entries without an icon`);
      await page.key('Escape'); await page.sleep(120);
    }
  });

  await step('Format › Subtopic layout: on the central topic it changes the map layout, on a branch that branch', async () => {
    const before = await page.eval('window.__mtm.doc().map.layout || "map"');
    await page.eval("void window.__mtm.run('pane:format', true)");
    await page.eval('window.__mtm.select([window.__mtm.doc().map.root.id])');
    await page.sleep(250);
    await page.eval('document.querySelector(".layout-btn[data-sublayout=\\"down\\"]").scrollIntoView({ block: "center" })');
    await page.sleep(100);
    await page.clickSel('.layout-btn[data-sublayout="down"]');
    await page.sleep(300);
    eq(await page.eval('[window.__mtm.doc().map.layout, document.querySelector(".layout-btn[data-sublayout=\\"down\\"]").classList.contains("on")]'), ['orgDown', true], 'central topic → org chart');
    const branch = await page.eval('window.__mtm.doc().map.root.children[0].id');
    await page.eval(`window.__mtm.select([${JSON.stringify(branch)}])`);
    await page.sleep(250);
    await page.eval('document.querySelector(".layout-btn[data-sublayout=\\"treeRight\\"]").scrollIntoView({ block: "center" })');
    await page.sleep(100);
    await page.clickSel('.layout-btn[data-sublayout="treeRight"]');
    await page.sleep(300);
    eq(await page.eval(`window.__mtm.layout().nodes.get(${JSON.stringify(branch)}).dir`), 'treeRight', 'the branch as a list');
    await page.eval("void window.__mtm.run('undo')"); await page.sleep(150);
    await page.eval("void window.__mtm.run('undo')"); await page.sleep(250);
    eq(await page.eval('window.__mtm.doc().map.layout || "map"'), before, 'undone');
  });

  await step('the theme drop-down ends with the custom themes; a new one opens Settings › Theme', async () => {
    const before = await page.eval('({ theme: window.__mtm.settings().theme, custom: window.__mtm.settings().customThemes || [] })');
    const open = async () => { await page.clickSel('.tb-split-caret'); await page.sleep(250); };
    await open();
    // the last rows run under both columns: the header, then the two commands
    const rows = await page.eval('(() => { const m = document.querySelector(".ctx-menu.theme-menu"); const w = m.getBoundingClientRect().width; const items = [...m.querySelectorAll(".ctx-item")]; return { wide: items.slice(-2).map((b) => b.getBoundingClientRect().width > w * 0.8), icons: items.slice(-2).filter((b) => b.querySelector(".ctx-icon svg")).length, header: [...m.querySelectorAll(".ctx-header")].pop().textContent }; })()');
    eq(rows.wide, [true, true], 'full-width rows');
    eq(rows.icons, 2, 'icons on the commands');
    assert(/사용자 정의|custom/i.test(rows.header), rows.header);
    await page.eval('document.querySelectorAll(".ctx-menu.theme-menu .ctx-item")[document.querySelectorAll(".ctx-menu.theme-menu .ctx-item").length - 2].click()');
    await page.sleep(500);
    const after = await page.eval('({ theme: window.__mtm.settings().theme, custom: (window.__mtm.settings().customThemes || []).length, tab: (document.querySelector(".settings-tab.active") || {}).dataset?.tab || "" })');
    eq(after.custom, before.custom.length + 1, 'custom themes');
    assert(after.theme.startsWith('custom-'), after.theme);
    eq(after.tab, 'theme', 'Settings tab');
    await page.eval('document.querySelector(".dlg .btn.primary").click()');
    await page.sleep(200);
    await open();
    const listed = await page.eval('[...document.querySelectorAll(".ctx-menu.theme-menu .ctx-item")].some((b) => b.dataset && b.classList.contains("checked") && b.textContent.includes("★"))');
    assert(listed, 'the new custom theme is listed and checked');
    await page.key('Escape');
    await page.eval(`window.__mtm.applySettings({ theme: ${JSON.stringify(before.theme)}, customThemes: ${JSON.stringify(before.custom)} })`);
    await page.sleep(200);
  });

  await step('closing a changed map asks to save; cancel keeps it', async () => {
    const n = await page.eval('window.__mtm.docs().length');
    await page.eval("void window.__mtm.run('close')");
    await page.waitFor('window.__mtm.dialog() === "confirm"');
    eq(await page.eval('document.querySelectorAll(".dlg .btn").length'), 3, 'save / don\'t save / cancel');
    await page.key('Escape');
    await page.sleep(200);
    eq(await page.eval('window.__mtm.docs().length'), n, 'still open');
  });

  if (shots) await page.shot(path.join(shots, 'final.png'));
  const code = report.finish(page.errors);
  await page.close();
  fs.rmSync(work, { recursive: true, force: true });
  process.exit(code);
}

main().catch(async (err) => { console.error(err); if (page) await page.close(); process.exit(1); });
