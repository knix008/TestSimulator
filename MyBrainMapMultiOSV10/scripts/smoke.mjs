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
