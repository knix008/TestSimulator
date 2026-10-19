// GUI smoke test: the web build in headless Edge / Chrome, driven with real
// mouse and keyboard input through CDP (src/App.jsx exposes window.__mtm to
// read the state). Every step must pass and the page must log no error.
//
//   npm run build && npm run smoke        (SMOKE_SHOTS=dir keeps screenshots)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, root } from './cdp.mjs';

const shots = process.env.SMOKE_SHOTS || '';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mtm-smoke-files-'));
const results = [];
let page;

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
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push({ name, ok: false, err: err.message });
    console.log(`  ✗ ${name} — ${err.message}`);
    if (shots) await page.shot(path.join(shots, `fail-${results.length}.png`)).catch(() => {});
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };

async function main() {
  if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) { console.error('dist/ is missing — run npm run build first'); process.exit(1); }
  page = await launch({ lang: 'ko' });
  await page.waitFor('!!window.__mtm && !!document.querySelector(".start-page")');
  console.log('My ThinkMap smoke test');

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

  await step('drag to empty space makes a floating topic', async () => {
    const a = await page.eval(centerOf('기차'));
    await page.drag(a.x, a.y, a.x + 40, a.y + 200);
    await page.sleep(200);
    const n = await page.eval('window.__mtm.doc().map.floating.length');
    eq(n, 1, 'floating topics');
  });

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
    eq(data.format, 'mythinkmap', 'format');
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

  if (shots) await page.shot(path.join(shots, 'final.png'));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  if (page.errors.length) console.log('page errors:', page.errors);
  await page.close();
  fs.rmSync(work, { recursive: true, force: true });
  process.exit(failed.length || page.errors.length ? 1 : 0);
}

main().catch(async (err) => { console.error(err); if (page) await page.close(); process.exit(1); });
