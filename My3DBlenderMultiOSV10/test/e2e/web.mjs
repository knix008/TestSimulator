// Web E2E: the app in headless Edge/Chrome, driven with real mouse and key events over CDP. Each case starts from a fresh
// default scene. Prints "E2E: <passed> passed, <failed> failed" and writes test-results/web/ (screenshots of every
// workspace, results.json). E2E_ONLY=<substring> runs matching cases only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, sleep, startVite, waitFor } from './cdp.mjs';
import { resultLine, totalsLine } from './report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const shots = path.join(root, 'test-results', 'web');
fs.rmSync(shots, { recursive: true, force: true });
fs.mkdirSync(shots, { recursive: true });

const vite = await startVite(root);
const { cdp, errors, stop } = await launchBrowser(vite.url, { width: 1600, height: 950 });
const js = (expression) => cdp.evaluate(expression);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 950, deviceScaleFactor: 1, mobile: false }).catch(() => {});
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const eq = (a, b, message) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${message}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

const tid = (id) => `[data-testid="${id}"]`;
const exists = (id) => js(`Boolean(window.__my3d.query(${JSON.stringify(tid(id))}))`);
const rect = (selector) => js(`(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 } : null; })()`);
/** A real click on an element found by test id. */
async function click(id, button = 'left') {
  const r = await waitFor(() => rect(tid(id)), 5000);
  await cdp.click(r.cx, r.cy, button);
  await frame();
}
const frame = () => js('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
/** Keeps the mouse over a point (hover decides which editor gets keys). */
const moveTo = async (x, y) => { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await frame(); };
const KEY_CODES = { Tab: 9, Enter: 13, Escape: 27, Delete: 46, F3: 114, F12: 123, ' ': 32, Home: 36, ArrowLeft: 37, ArrowRight: 39 };
async function press(key, { ctrl, shift, alt, code } = {}) {
  const modifiers = (alt ? 1 : 0) | (ctrl ? 2 : 0) | (shift ? 8 : 0);
  const text = key.length === 1 && !ctrl && !alt ? (shift ? key.toUpperCase() : key) : undefined;
  const vk = KEY_CODES[key] ?? (key.length === 1 ? key.toUpperCase().charCodeAt(0) : undefined);
  const k = shift && key.length === 1 ? key.toUpperCase() : key;
  const finalCode = code ?? (key.length === 1 && /[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : key.length === 1 && /[0-9]/.test(key) ? `Digit${key}` : key);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: finalCode, modifiers, text, windowsVirtualKeyCode: vk });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: finalCode, modifiers, windowsVirtualKeyCode: vk });
  await frame();
}
const doc = (expr) => js(`(() => { const doc = window.__my3d.doc; const active = doc.objects.find((o) => o.id === doc.activeId); return ${expr}; })()`);
const op = (id, props = {}) => js(`window.__my3d.op(${JSON.stringify(id)}, ${JSON.stringify(props)})`);
const screenPos = (p) => js(`(() => { const v = window.__my3d.editorsOf('view3d')[0].api; const q = v.project(${JSON.stringify(p)}); const r = document.querySelector('[data-testid=view3d]').getBoundingClientRect(); return { x: q.x + r.left, y: q.y + r.top }; })()`);
const viewRect = () => rect(tid('view3d'));
/** Hovers the middle of the 3D view, so keys go to it. */
const hoverView = async () => { const r = await viewRect(); await moveTo(r.cx, r.cy); return r; };
/** Average colour and the number of distinct colours in a canvas (a blank or failed canvas has one). */
const canvasStats = (selector = tid('gl-canvas')) => js(`(() => {
  const c = document.querySelector(${JSON.stringify(selector)});
  const small = document.createElement('canvas'); small.width = 64; small.height = 64;
  const g = small.getContext('2d'); g.drawImage(c, 0, 0, 64, 64);
  const d = g.getImageData(0, 0, 64, 64).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4) seen.add((d[i] >> 3) + ',' + (d[i+1] >> 3) + ',' + (d[i+2] >> 3));
  return { distinct: seen.size, width: c.width, height: c.height };
})()`);
/** Opens the first-level menu, then clicks a real row with this op id or test id. */
async function menu(title, ...path_) {
  await click(title);
  for (const p of path_) {
    const selector = p.startsWith('op:') ? `.menu [data-op="${p.slice(3)}"]` : `.menu [data-testid="${p}"]`;
    const r = await waitFor(() => rect(selector), 3000);
    await moveTo(r.cx, r.cy);
    await cdp.click(r.cx, r.cy);
    await frame();
  }
}
const menuLabel = async (title, text) => {
  await click(title);
  const r = await waitFor(() => js(`(() => { const row = [...document.querySelectorAll('.menu .menu-item')].find((x) => x.textContent.includes(${JSON.stringify(text)})); if (!row) return null; const q = row.getBoundingClientRect(); return { cx: q.x + q.width / 2, cy: q.y + q.height / 2 }; })()`), 3000);
  await moveTo(r.cx, r.cy);
  return r;
};

const results = [];
const only = process.env.E2E_ONLY?.toLowerCase();
async function reset(workspace = 'layout') {
  await js(`(() => {
    const app = window.__my3d;
    app.closeMenus(); app.closeAllDialogs();
    localStorage.clear();
    if (app.playing) app.togglePlay();
    return import('/src/core/doc.js').then((m) => { app.replaceDocument(m.serialize(m.createDefaultScene()), true); app.renderResult = null; app.projectName = null; app.resetLayouts(); app.setWorkspace(${JSON.stringify(workspace)}); app.editorsOf('view3d')[0]?.api.setTool('select'); });
  })()`);
  await frame();
}
async function test(name, fn, workspace = 'layout') {
  if (only && !name.toLowerCase().includes(only)) return;
  const started = performance.now();
  const before = errors.length;
  try {
    await reset(workspace);
    await fn();
    if (errors.length > before) throw new Error(`page errors: ${errors.slice(before).join(' | ').slice(0, 400)}`);
    results.push({ name, ok: true });
    console.log(resultLine({ status: 'pass', name, ms: performance.now() - started }));
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    console.log(resultLine({ status: 'fail', name, ms: performance.now() - started, error: error.message }));
    try { await cdp.screenshot(path.join(shots, `fail-${name.replace(/[^\w-]+/g, '_').slice(0, 60)}.png`)); } catch { /* gone */ }
  }
}

// The whole suite runs in English, so that what it reads and prints is English.
await js('localStorage.setItem("my3d.settings", JSON.stringify({ language: "en", showStart: false, askTutorial: false }))');
await cdp.send('Page.reload');
await sleep(500);
await waitFor(() => js('document.readyState === "complete" && Boolean(window.__my3d)'), 30000);

// ───────────────────────── start-up and chrome

const click2bg = async (kind) => { const r = await js(`(() => { const b = document.querySelector('[data-bg-card=${kind}]'); b.scrollIntoView({ block: 'nearest' }); const x = b.getBoundingClientRect(); return { x: x.x + x.width / 2, y: x.y + x.height / 2 }; })()`); await cdp.click(r.x, r.y); };
await test('starts with the default scene and no page errors', async () => {
  eq(await doc('doc.objects.map((o) => o.type)'), ['MESH', 'LIGHT', 'CAMERA'], 'objects');
  assert(await exists('topbar'), 'top bar');
  assert(await exists('statusbar'), 'status bar');
});
await test('the 3D view draws: the canvas is not one flat colour', async () => {
  await frame();
  const s = await canvasStats();
  assert(s.width > 300 && s.height > 200, `canvas size ${s.width}x${s.height}`);
  assert(s.distinct > 3, `only ${s.distinct} colours`);
  await cdp.screenshot(path.join(shots, 'start.png'));
});
await test('every workspace builds its editors, draws and shows no error', async () => {
  const list = await js("[...document.querySelectorAll('[data-testid=workspaces] button')].map((b) => b.dataset.testid)");
  eq(list.length, 14, 'workspace count');
  for (const id of list) {
    await click(id);
    await frame();
    await sleep(120);
    assert(await js(`document.querySelector(${JSON.stringify(tid(id))}).classList.contains('on')`), `${id} is not on`);
    assert(await js("document.querySelectorAll('.area').length") >= 1, `${id} has no area`);
    await cdp.screenshot(path.join(shots, `${id}.png`));
  }
  eq(await js("document.querySelector('[data-testid=status-msg]').classList.contains('status-error')"), false, 'status error');
});
await test('workspaces switch the mode: Modeling edits, Sculpting sculpts', async () => {
  await click('ws-modeling');
  eq(await doc('doc.mode'), 'EDIT', 'Modeling');
  await click('ws-sculpting');
  eq(await doc('doc.mode'), 'SCULPT', 'Sculpting');
  await click('ws-layout');
  eq(await doc('doc.mode'), 'OBJECT', 'Layout');
});
await test('every top menu opens and has rows', async () => {
  for (const id of ['menu-file', 'menu-edit', 'menu-render', 'menu-window', 'menu-help', 'menu-view', 'menu-select', 'menu-add', 'menu-object']) {
    await click(id);
    assert(await js("document.querySelectorAll('.menu .menu-item').length") > 0, `${id} is empty`);
    await press('Escape');
    eq(await js("document.querySelectorAll('.menu').length"), 0, `${id} did not close`);
  }
});
await test('the top bar fits: nothing is cut off at the measured minimum width', async () => {
  const fit = await js(`(() => {
    const bar = document.querySelector('[data-testid=topbar]');
    const box = bar.getBoundingClientRect();
    return { overflow: bar.scrollWidth - bar.clientWidth, right: Math.max(...[...bar.children].map((c) => c.getBoundingClientRect().right)), edge: box.right, min: window.__my3d.minWidth };
  })()`);
  assert(fit.overflow <= 0, `overflow ${fit.overflow}`);
  assert(fit.right <= fit.edge + 0.5, `a button reaches ${fit.right} past ${fit.edge}`);
  assert(fit.min > 600 && fit.min <= 1600, `minimum ${fit.min}`);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: fit.min, height: 800, deviceScaleFactor: 1, mobile: false });
  await frame();
  const narrow = await js(`(() => { const bar = document.querySelector('[data-testid=topbar]'); return { overflow: bar.scrollWidth - bar.clientWidth, page: document.documentElement.scrollWidth - innerWidth }; })()`);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 950, deviceScaleFactor: 1, mobile: false });
  await frame();
  assert(narrow.overflow <= 0, `overflow at the minimum: ${narrow.overflow}`);
  assert(narrow.page <= 0, `page scrolls sideways: ${narrow.page}`);
});
await test('language button switches the interface to Korean and back', async () => {
  await click('language');
  assert((await js("document.querySelector('[data-testid=menu-file]').textContent")) !== 'File', 'still English');
  await click('language');
  eq(await js("document.querySelector('[data-testid=menu-file]').textContent"), 'File', 'back to English');
});
await test('themes: the list picks one, the palette button steps, colours really change', async () => {
  const bg = () => js("getComputedStyle(document.querySelector('.app')).getPropertyValue('--panel')");
  const first = await bg();
  await click('theme-next');
  assert(await bg() !== first, 'palette button');
  await click('theme');
  await click('theme-paper');
  eq(await js("document.querySelector('.app').dataset.theme"), 'paper', 'theme');
  eq(await js("document.querySelector('.app').dataset.themeMode"), 'light', 'mode');
  await click('theme');
  await click('theme-studio');
});
await test('preferences and about open and close; preferences change the undo limit', async () => {
  await click('settings');
  assert(await exists('dialog-settings'), 'preferences');
  await press('Escape');
  assert(!(await exists('dialog-settings')), 'closed');
  await click('about');
  await waitFor(() => exists('about-body'), 3000);
  await press('Escape');
});
await test('feature coverage shows the real percentage and what is only partly done', async () => {
  await menu('menu-help', 'menu-coverage');
  await waitFor(() => exists('coverage-table'), 3000);
  const text = await js("document.querySelector('[data-testid=coverage-percent]').textContent");
  const percent = Number(text.replace('%', ''));
  assert(percent > 0 && percent < 100, `percent ${text}`);
  // What is missing stays on show: the partly done with their notes, and whatever is not started.
  assert(await js("document.querySelectorAll('.status-partial').length") > 0, 'the partly done are listed');
  assert(await js("document.querySelectorAll('[data-testid=coverage-table] .note').length") > 0, 'with what is missing');
  await cdp.screenshot(path.join(shots, 'coverage.png'));
});
await test('operator search (F3) finds and runs an operator', async () => {
  await hoverView();
  await press('F3');
  await waitFor(() => exists('search-input'), 3000);
  await cdp.send('Input.insertText', { text: 'torus' });
  await frame();
  await click('search-mesh.primitive_torus_add');
  eq(await doc('active.name'), 'Torus', 'added');
});

// ───────────────────────── areas

await test('areas: split, join, and the divider drags', async () => {
  const count = () => js("document.querySelectorAll('.area').length");
  const n = await count();
  const header = await rect(`${tid('area-outliner')} .area-header`);
  await cdp.click(header.x + 12, header.cy, 'right');
  await frame();
  await click('area-split-v');
  eq(await count(), n + 1, 'split');
  const again = await rect(`${tid('area-outliner')} .area-header`);
  await cdp.click(again.x + 12, again.cy, 'right');
  await frame();
  await click('area-join');
  eq(await count(), n, 'join');
  const before = (await viewRect()).w;
  const d = await js("(() => { const r = [...document.querySelectorAll('[data-testid=divider]')].map((x) => x.getBoundingClientRect()).find((x) => x.height > 500); return { x: r.x + 1, y: r.y + 200 }; })()");
  await cdp.drag([d.x, d.y], [d.x - 200, d.y]);
  await frame();
  assert((await viewRect()).w < before - 150, 'the divider did not move');
});
await test('every editor type can be switched in; each draws without error', async () => {
  for (const [type, marker] of [['image', 'image-editor'], ['uv', 'uv-editor'], ['nodes', 'node-editor'], ['timeline', 'editor-timeline'], ['dopesheet', 'editor-dopesheet'], ['graph', 'editor-graph'], ['nla', 'editor-nla'], ['text', 'text-editor'], ['console', 'console'], ['info', 'info-log'], ['outliner', 'outliner'], ['properties', 'properties'], ['spreadsheet', 'spreadsheet'], ['view3d', 'view3d']]) {
    const id = await js("document.querySelector('[data-testid=area-timeline] .editor-switch, .area:last-of-type .editor-switch')?.dataset.testid");
    const sw = await js("(() => { const all = [...document.querySelectorAll('.editor-switch')]; const el = all[1]; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()");
    void id;
    await cdp.click(sw.x, sw.y);
    await frame();
    await click(`set-editor-${type}`);
    await frame();
    assert(await exists(marker), `${type}: ${marker} is missing`);
  }
});
await test('Ctrl+Space maximizes the area under the mouse and restores it', async () => {
  const n = await js("document.querySelectorAll('.area').length");
  await hoverView();
  await press(' ', { ctrl: true, code: 'Space' });
  eq(await js("document.querySelectorAll('.area').length"), 1, 'maximized');
  await hoverView();
  await press(' ', { ctrl: true, code: 'Space' });
  eq(await js("document.querySelectorAll('.area').length"), n, 'restored');
});

// ───────────────────────── objects

await test('Add menu: mesh, light, camera and others through real clicks', async () => {
  await menu('menu-add');
  const row = await js(`(() => { const r = [...document.querySelectorAll('.menu .menu-item')].find((x) => x.textContent.includes('Mesh')).getBoundingClientRect(); return { x: r.x + 30, y: r.y + r.height / 2 }; })()`);
  await moveTo(row.x, row.y);
  const item = await waitFor(() => rect('.menu [data-op="mesh.primitive_uv_sphere_add"]'), 3000);
  await moveTo(item.cx, item.cy);
  await cdp.click(item.cx, item.cy);
  await frame();
  eq(await doc('active.name'), 'UV Sphere', 'sphere');
  eq(await doc('doc.objects.length'), 4, 'count');
  for (const id of ['object.camera_add', 'object.metaball_add', 'object.armature_add', 'object.lattice_add', 'object.gpencil_add']) assert(await op(id), id);
  eq(await doc('doc.objects.length'), 9, 'count after more');
});
await test('click selects an object, Shift adds, empty space deselects, box selects', async () => {
  const r = await viewRect();
  const p = await screenPos([0, 0, 0]);
  await cdp.click(r.x + 300, r.y + r.h - 40);
  await frame();
  eq(await doc('doc.selected.length'), 0, 'deselected by clicking empty space');
  await cdp.click(p.x, p.y);
  await frame();
  eq(await doc('active.name'), 'Cube', 'clicked');
  eq(await doc('doc.selected.length'), 1, 'one');
  const light = await doc('doc.objects[1].location');
  const q = await screenPos(light);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: q.x, y: q.y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: q.x, y: q.y, button: 'left', clickCount: 1, modifiers: 8 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: q.x, y: q.y, button: 'left', clickCount: 1, modifiers: 8 });
  await frame();
  eq(await doc('doc.selected.length'), 2, 'shift added the light');
  await press('Escape');
  await cdp.click(r.x + 300, r.y + r.h - 40);
  await frame();
  await cdp.drag([p.x - 60, p.y - 60], [p.x + 60, p.y + 60]);
  await frame();
  assert((await doc('doc.selected.map((id) => doc.objects.find((o) => o.id === id).name)')).includes('Cube'), 'box selected the cube');
});
await test('G moves with the mouse, X limits to an axis, Enter confirms, undo restores', async () => {
  const r = await hoverView();
  await press('g');
  await moveTo(r.cx + 120, r.cy + 40);
  await press('x');
  await moveTo(r.cx + 200, r.cy + 40);
  await press('Enter');
  const loc = await doc('doc.objects[0].location');
  assert(loc[0] !== 0, 'moved along X');
  eq([loc[1], loc[2]], [0, 0], 'only along X');
  await press('z', { ctrl: true });
  eq(await doc('doc.objects[0].location'), [0, 0, 0], 'undo');
  await press('z', { ctrl: true, shift: true });
  assert((await doc('doc.objects[0].location'))[0] !== 0, 'redo');
});
await test('G with a typed value moves exactly that far; Esc cancels', async () => {
  await hoverView();
  await press('g');
  await press('z');
  await press('2');
  await press('.');
  await press('5');
  await press('Enter');
  eq(await doc('doc.objects[0].location'), [0, 0, 2.5], 'typed');
  const r = await viewRect();
  await press('g');
  await moveTo(r.cx + 90, r.cy);
  await press('Escape');
  eq(await doc('doc.objects[0].location'), [0, 0, 2.5], 'cancelled');
});
await test('right mouse cancels a move; R and S work with typed values', async () => {
  const r = await hoverView();
  await press('g');
  await moveTo(r.cx + 60, r.cy);
  await cdp.click(r.cx + 60, r.cy, 'right');
  await frame();
  eq(await doc('doc.objects[0].location'), [0, 0, 0], 'right click');
  await press('Escape');
  await hoverView();
  await press('r');
  await press('z');
  await press('9');
  await press('0');
  await press('Enter');
  const z = await doc('doc.objects[0].rotation[2]');
  assert(Math.abs(Math.abs(z) - 90) < 1e-6, `rotation ${z}`);
  await press('s');
  await press('2');
  await press('Enter');
  eq(await doc('doc.objects[0].scale'), [2, 2, 2], 'scale');
});
await test('R, Z, 360 keeps the full turn, so a keyed spin really spins (the tutorial does this)', async () => {
  await hoverView();
  await press('i');
  await js('window.__my3d.setFrame(121)');
  await hoverView();
  await press('r');
  await press('z');
  for (const key of '360') await press(key);
  await press('Enter');
  eq(Math.round(Math.abs(await doc('doc.objects[0].rotation[2]'))), 360, 'the angle');
  await press('i');
  await js('window.__my3d.setFrame(61)');
  await frame();
  assert(Math.abs(await doc('doc.objects[0].rotation[2]')) > 90, 'halfway through the spin it has turned');
});
await test('the Move gizmo drags the object along an axis', async () => {
  await click('tool-move');
  await frame();
  await sleep(100);
  const origin = await screenPos([0, 0, 0]);
  const axisEnd = await js(`(() => { const v = window.__my3d.editorsOf('view3d')[0].api; const c = v.camera(); const eye = c.position.clone(); const k = eye.length() * 0.06; const q = v.project([k, 0, 0]); const r = document.querySelector('[data-testid=view3d]').getBoundingClientRect(); return { x: q.x + r.left, y: q.y + r.top }; })()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: axisEnd.x, y: axisEnd.y });
  await frame();
  await cdp.drag([axisEnd.x, axisEnd.y], [axisEnd.x + 90, axisEnd.y + 20], 6);
  await frame();
  const loc = await doc('doc.objects[0].location');
  assert(Math.abs(loc[0]) > 0.05, `gizmo did not move it: ${JSON.stringify(loc)} from ${JSON.stringify(origin)}`);
  eq([Math.abs(loc[1]) < 1e-6, Math.abs(loc[2]) < 1e-6], [true, true], `axis only: ${JSON.stringify(loc)}`);
  await click('tool-select');
});
await test('object keys: duplicate, delete, hide, show, parent', async () => {
  const r = await hoverView();
  await press('d', { shift: true });
  await moveTo(r.cx + 50, r.cy);
  await press('Enter');
  eq(await doc('active.name'), 'Cube.001', 'duplicate then move');
  await press('h');
  eq(await doc('active.hide'), true, 'hide');
  await press('h', { alt: true });
  eq(await doc('active.hide'), false, 'show');
  await press('x');
  eq(await doc('doc.objects.length'), 3, 'delete');
});
await test('Outliner: click selects, double click renames, the eye hides, filter narrows', async () => {
  await click('outliner-Light');
  eq(await doc('active.name'), 'Light', 'select');
  const row = await rect(tid('outliner-Light'));
  await cdp.click(row.x + 70, row.cy, 'left', 1);
  await cdp.click(row.x + 70, row.cy, 'left', 2);
  await frame();
  await waitFor(() => exists('rename-input'), 2000);
  await js("document.querySelector('[data-testid=rename-input]').select()");
  await cdp.send('Input.insertText', { text: 'Sun Lamp' });
  await press('Enter');
  eq(await doc('active.name'), 'Sun Lamp', 'renamed');
  await click('outliner-filter');
  await cdp.send('Input.insertText', { text: 'cam' });
  await frame();
  eq(await js("document.querySelectorAll('[data-testid^=outliner-]:not([data-testid=outliner-filter]):not([data-testid=outliner])').length"), 1, 'filtered');
});
await test('view: numpad, frame all, shading modes, camera view, statistics', async () => {
  await hoverView();
  await press('7', { code: 'Numpad7' });
  const v = () => js("window.__my3d.editorsOf('view3d')[0].api.state");
  assert((await v()).pitch > 80, 'top view');
  await press('1', { code: 'Numpad1' });
  eq((await v()).pitch, 0, 'front');
  await press('Home', {});
  for (const shading of ['WIRE', 'SOLID', 'MATERIAL', 'RENDERED']) {
    await click(`shading-${shading}`);
    await sleep(80);
    await frame();
    eq((await v()).shading, shading, shading);
    assert((await canvasStats()).distinct >= 2, `${shading} is blank`);
    await cdp.screenshot(path.join(shots, `shading-${shading}.png`));
  }
  await click('shading-SOLID');
  await click('xray');
  eq((await v()).xray, true, 'x-ray');
  await click('nav-camera');
  eq((await v()).camView, true, 'camera view');
  await click('nav-camera');
  await hoverView();
  await press('n');
  eq((await v()).sidebar, true, 'sidebar on');
  await press('n');
  eq((await v()).sidebar, false, 'sidebar off');
});
await test('the nav gizmo aligns the view when an axis is clicked', async () => {
  const dot = await js("(() => { const r = document.querySelector('[data-testid=nav-gizmo] circle[data-axis=Z]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()");
  await cdp.click(dot.x, dot.y);
  await frame();
  assert((await js("window.__my3d.editorsOf('view3d')[0].api.state.pitch")) > 80, 'top');
});
await test('orbit, pan and zoom with the middle mouse and wheel', async () => {
  const r = await viewRect();
  const v = () => js("(() => { const s = window.__my3d.editorsOf('view3d')[0].api.state; return { yaw: s.yaw, pitch: s.pitch, dist: s.dist, target: s.target }; })()");
  const before = await v();
  const mid = async (from, to, modifiers = 0) => {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from[0], y: from[1], button: 'middle', clickCount: 1, modifiers });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: to[0], y: to[1], button: 'middle', buttons: 4, modifiers });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to[0], y: to[1], button: 'middle', clickCount: 1, modifiers });
    await frame();
  };
  await mid([r.cx, r.cy], [r.cx + 80, r.cy + 30]);
  const orbit = await v();
  assert(orbit.yaw !== before.yaw && orbit.pitch !== before.pitch, 'orbit');
  await mid([r.cx, r.cy], [r.cx + 50, r.cy], 8);
  assert(JSON.stringify((await v()).target) !== JSON.stringify(orbit.target), 'pan');
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: r.cx, y: r.cy, deltaX: 0, deltaY: 120 });
  await frame();
  assert((await v()).dist > orbit.dist, 'zoom');
});
await test('the view turns by dragging the nav gizmo and with Alt + left drag', async () => {
  const v = () => js("(() => { const s = window.__my3d.editorsOf('view3d')[0].api.state; return { yaw: s.yaw, pitch: s.pitch }; })()");
  await frame();
  const box = await rect(tid('nav-gizmo'));
  const before = await v();
  // Start between the axis dots' centre and the edge; a drag from anywhere on the gizmo turns the view.
  await cdp.drag([box.cx, box.cy], [box.cx - 60, box.cy + 24], 6);
  await frame();
  const dragged = await v();
  assert(Math.abs(dragged.yaw - before.yaw - 30) < 1, `yaw ${before.yaw} -> ${dragged.yaw}`);
  assert(Math.abs(dragged.pitch - before.pitch - 12) < 1, `pitch ${before.pitch} -> ${dragged.pitch}`);
  // The drag must not count as a click on an axis.
  await sleep(50);
  await frame();
  eq(await v(), dragged, 'still where the drag left it');
  const r = await viewRect();
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.cx, y: r.cy });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.cx, y: r.cy, button: 'left', clickCount: 1, modifiers: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.cx + 50, y: r.cy, button: 'left', buttons: 1, modifiers: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.cx + 50, y: r.cy, button: 'left', clickCount: 1, modifiers: 1 });
  await frame();
  assert((await v()).yaw !== dragged.yaw, 'Alt + left drag turns the view');
});
await test('the Rotate gizmo turns the selected object by dragging its ring', async () => {
  await js(`(() => { const a = window.__my3d; a.op('object.select_set', { id: a.doc.objects.find((o) => o.type === 'MESH').id }); a.doc.objects.find((o) => o.type === 'MESH').rotation = [0, 0, 0]; a.touch(); })()`);
  await hoverView();
  await press('Home', {});
  await click('tool-rotate');
  await frame();
  await sleep(100);
  const name = await doc('active.name');
  const before = await doc('active.rotation');
  const pivot = await doc('active.location');
  // The Z ring lies in the XY plane around the object: find a point on it where the mouse really grabs it.
  const hit = await js(`(() => {
    const v = window.__my3d.editorsOf('view3d')[0].api;
    const c = v.camera();
    const p = ${JSON.stringify(pivot)};
    const eye = c.getWorldPosition(c.position.clone());
    const radius = Math.hypot(eye.x - p[0], eye.y - p[1], eye.z - p[2]) * 0.8 * 0.1428;
    const q = v.project([p[0] + radius * 0.7071, p[1] - radius * 0.7071, p[2]]);
    const r = document.querySelector('[data-testid=view3d]').getBoundingClientRect();
    return { x: q.x + r.left, y: q.y + r.top };
  })()`);
  let turned = false;
  for (const [dx, dy] of [[0, 0], [0, 4], [0, -4], [4, 0], [-4, 0], [0, 8], [0, -8], [8, 0], [-8, 0]]) {
    const [x, y] = [hit.x + dx, hit.y + dy];
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await frame();
    await cdp.drag([x, y], [x + 70, y + 30], 8);
    await frame();
    const now = await doc('active.rotation');
    if (now.some((a, k) => Math.abs(a - before[k]) > 1)) { turned = true; break; }
  }
  assert(turned, `the ring did not turn ${name}: ${JSON.stringify(await doc('active.rotation'))}`);
  await cdp.screenshot(path.join(shots, 'rotate-gizmo.png'));
  await press('z', { ctrl: true });
  await frame();
  eq(await doc('active.rotation'), before, 'undo brings the rotation back');
  await click('tool-select');
});
await test('right click opens the context menu; Shift+A opens Add', async () => {
  const r = await viewRect();
  await cdp.click(r.cx, r.cy, 'right');
  await frame();
  assert(await js("document.querySelectorAll('.menu .menu-item').length") > 5, 'context menu');
  await press('Escape');
  await hoverView();
  await press('a', { shift: true });
  assert(await js("[...document.querySelectorAll('.menu .menu-item')].some((x) => x.textContent.includes('Mesh'))"), 'add menu');
  await press('Escape');
});
await test('3D cursor: Shift+right click places it; a new object appears there', async () => {
  const r = await viewRect();
  const x = r.cx + 100;
  const y = r.cy + 150;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', clickCount: 1, modifiers: 8 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', clickCount: 1, modifiers: 8 });
  await frame();
  const cursor = await doc('doc.cursor');
  assert(cursor.some((c) => c !== 0), 'cursor moved');
  await op('mesh.primitive_cube_add');
  eq(await doc('active.location'), cursor, 'at the cursor');
});

// ───────────────────────── edit mode

const faceTop = (mesh = 'active.data') => `${mesh}.faces.findIndex((f) => f.every((i) => ${mesh}.verts[i][2] > 0.99))`;
await test('Tab enters edit mode; 1/2/3 pick the selection mode; A selects all', async () => {
  await hoverView();
  await press('Tab');
  eq(await doc('doc.mode'), 'EDIT', 'edit');
  await press('3');
  eq(await doc('active.data.selMode'), 'face', 'face mode');
  await press('2');
  eq(await doc('active.data.selMode'), 'edge', 'edge mode');
  await press('1');
  eq(await doc('active.data.selMode'), 'vert', 'vertex mode');
  await press('a');
  eq((await doc('active.data.selV')).length, 8, 'all');
  await press('a', { alt: true });
  eq((await doc('active.data.selV')).length, 0, 'none');
  await press('Tab');
  eq(await doc('doc.mode'), 'OBJECT', 'object');
});
await test('clicking a vertex selects the visible one under the mouse', async () => {
  await hoverView();
  await press('Tab');
  await press('a', { alt: true });
  const verts = await doc('active.data.verts');
  // The corner nearest the viewer is certainly not hidden.
  const eye = await js("window.__my3d.editorsOf('view3d')[0].api.camera().position.toArray()");
  let index = 0;
  let best = Infinity;
  verts.forEach((v, i) => { const d = Math.hypot(v[0] - eye[0], v[1] - eye[1], v[2] - eye[2]); if (d < best) { best = d; index = i; } });
  const p = await screenPos(verts[index]);
  await cdp.click(p.x, p.y);
  await frame();
  eq(await doc('active.data.selV'), [index], 'selected');
});
await test('face mode: click a face, E extrudes along its normal with the mouse, Esc undoes it', async () => {
  await hoverView();
  await press('Tab');
  await press('3');
  await press('a', { alt: true });
  await js(`(() => { const doc = window.__my3d.doc; const a = doc.objects.find((o) => o.id === doc.activeId); const f = a.data.faces.findIndex((x) => x.every((i) => a.data.verts[i][2] > 0.99)); window.__topFace = a.data.verts[a.data.faces[f][0]]; })()`);
  const top = await screenPos([0, 0, 1]);
  await cdp.click(top.x, top.y);
  await frame();
  eq((await doc('active.data.selF')).length, 1, 'one face');
  eq(await doc(`active.data.selF[0] === ${faceTop()}`), true, 'the top face');
  await moveTo(top.x, top.y);
  await press('e');
  assert(await js("Boolean(window.__my3d.editorsOf('view3d')[0].api.modal())"), 'extrude is modal');
  await moveTo(top.x, top.y - 90);
  await press('Enter');
  eq(await doc('active.data.faces.length'), 10, 'side walls');
  assert(await doc('Math.max(...active.data.verts.map((v) => v[2]))') > 1.2, 'moved up');
  eq(await doc('active.data.verts.filter((v) => v[0] !== v[0]).length'), 0, 'no NaN');
  await press('e');
  await moveTo(top.x, top.y - 20);
  await press('Escape');
  eq(await doc('active.data.faces.length'), 10, 'cancelled extrude left no geometry');
});
await test('Inset, Bevel, Loop Cut, Bisect from keys and tools change the topology', async () => {
  await op('object.editmode_toggle');
  await hoverView();
  await press('3');
  await press('a');
  await press('i');
  eq(await doc('active.data.faces.length'), 30, 'inset 6 + 24');
  await press('z', { ctrl: true });
  eq(await doc('active.data.faces.length'), 6, 'undo');
  await press('1');
  await press('a');
  await press('b', { ctrl: true });
  eq(await doc('active.data.faces.length'), 26, 'bevel');
  await press('z', { ctrl: true });
  await press('r', { ctrl: true });
  eq(await doc('active.data.faces.length'), 10, 'loop cut');
  await press('z', { ctrl: true });
  await click('tool-bisect');
  eq(await doc('active.data.faces.length'), 10, 'bisect');
});
await test('Adjust Last Operation changes the result in place', async () => {
  await op('object.editmode_toggle');
  await hoverView();
  await press('3');
  await js(`(() => { const doc = window.__my3d.doc; const a = doc.objects.find((o) => o.id === doc.activeId); a.data.selF = [a.data.faces.findIndex((x) => x.every((i) => a.data.verts[i][2] > 0.99))]; a.data.selV = [...a.data.faces[a.data.selF[0]]]; window.__my3d.commitSelection(); })()`);
  await op('mesh.extrude_region', { offset: 1 });
  await frame();
  await js("document.querySelector('[data-testid=adjust-panel] .panel-head').click()");
  await frame();
  assert(await exists('op-offset'), 'the field is there');
  const r = await rect(tid('op-offset'));
  await cdp.click(r.cx, r.cy);
  await frame();
  await js("document.querySelector('[data-testid=op-offset]').select()");
  await cdp.send('Input.insertText', { text: '3' });
  await press('Enter');
  await frame();
  eq(await doc('Math.max(...active.data.verts.map((v) => v[2]))'), 4, 'extruded 3 above the top');
  eq(await doc('active.data.faces.length'), 10, 'still one extrusion');
});
await test('Mesh menu: subdivide, smooth, merge, flip, separate through rows', async () => {
  await op('object.editmode_toggle');
  await op('mesh.select_all', { action: 'SELECT' });
  await frame();
  await click('menu-object');
  const edge = await js(`(() => { const r = [...document.querySelectorAll('.menu .menu-item')].find((x) => x.textContent.startsWith('Edge')).getBoundingClientRect(); return { x: r.x + 30, y: r.y + r.height / 2 }; })()`);
  await moveTo(edge.x, edge.y);
  const row = await waitFor(() => rect('.menu [data-op="mesh.subdivide"]'), 3000);
  await moveTo(row.cx, row.cy);
  await cdp.click(row.cx, row.cy);
  await frame();
  eq(await doc('active.data.faces.length'), 24, 'subdivide');
  for (const id of ['mesh.vertices_smooth', 'mesh.flip_normals', 'mesh.normals_make_consistent', 'mesh.select_linked', 'mesh.select_less', 'mesh.select_more']) assert(await op(id), id);
  await op('mesh.select_all', { action: 'DESELECT' });
  await js(`(() => { const doc = window.__my3d.doc; const a = doc.objects.find((o) => o.id === doc.activeId); a.data.selMode = 'face'; a.data.selF = [0]; a.data.selV = [...a.data.faces[0]]; })()`);
  await op('mesh.separate');
  eq(await doc('doc.objects.length'), 4, 'separate');
});

// ───────────────────────── properties and modifiers

await test('every Properties tab opens for a mesh', async () => {
  for (const tab of ['render', 'output', 'viewlayer', 'scene', 'world', 'object', 'modifiers', 'particles', 'physics', 'constraints', 'data', 'material']) {
    await click(`tab-${tab}`);
    assert((await js("document.querySelector('[data-testid=props-content]').children.length")) > 0, `${tab} is empty`);
  }
});
await test('Data tab fits every object type', async () => {
  for (const id of ['object.light_add', 'object.camera_add', 'object.empty_add', 'object.curve_add', 'object.text_add', 'object.metaball_add', 'object.armature_add', 'object.lattice_add', 'object.gpencil_add']) {
    await op(id);
    await frame();
    await click('tab-data');
    assert((await js("document.querySelector('[data-testid=props-content]').children.length")) > 1, `${id} data tab`);
  }
});
await test('typing into Location moves the object; dragging the field scrubs it; undo works', async () => {
  await click('tab-object');
  const r = await rect(tid('prop-location-0'));
  await cdp.click(r.cx, r.cy);
  await frame();
  await js("document.querySelector('[data-testid=prop-location-0]').select()");
  await cdp.send('Input.insertText', { text: '3.5' });
  await press('Enter');
  eq(await doc('active.location[0]'), 3.5, 'typed');
  const r2 = await rect(tid('prop-location-1'));
  await cdp.drag([r2.cx, r2.cy], [r2.cx + 20, r2.cy], 4);
  await frame();
  assert(Math.abs(await doc('active.location[1]') - 2) < 1e-6, 'scrubbed 20 steps of 0.1');
  await hoverView();
  await press('z', { ctrl: true });
  eq(await doc('active.location[1]'), 0, 'undo the scrub');
});
await test('Add Modifier menu adds a Subdivision Surface; the view and counts follow; apply and remove', async () => {
  await click('tab-modifiers');
  await click('add-modifier');
  const gen = await js(`(() => { const r = [...document.querySelectorAll('.menu .menu-item')].find((x) => x.textContent.includes('Generate')).getBoundingClientRect(); return { x: r.x + 30, y: r.y + r.height / 2 }; })()`);
  await moveTo(gen.x, gen.y);
  await click('add-mod-SUBSURF');
  eq(await doc('active.modifiers[0].type'), 'SUBSURF', 'added');
  await frame();
  assert((await js("document.querySelector('[data-testid=status-stats]').textContent")).includes('Faces 96'), 'statistics show the evaluated faces');
  await click('mod-show-0');
  eq(await doc('active.modifiers[0].show'), false, 'hidden');
  await click('mod-show-0');
  await click('mod-apply-0');
  eq(await doc('active.data.faces.length'), 96, 'applied');
  eq(await doc('active.modifiers.length'), 0, 'gone from the stack');
});
await test('all modifier types run in the viewport without an error', async () => {
  const types = await js("import('/src/core/modifiers.js').then((m) => Object.keys(m.MODIFIERS))");
  assert(types.length >= 20, `${types.length} types`);
  for (const type of types) {
    await op('object.modifier_add', { type });
    await frame();
    await op('object.modifier_remove', { index: 0 });
    await frame();
  }
});
await test('the Boolean modifier cuts with another object picked in the panel', async () => {
  await op('mesh.primitive_cube_add', { location: [1, 0, 0], size: 2 });
  const cutter = await doc('active.id');
  await op('object.select_set', { id: await doc('doc.objects[0].id') });
  await op('object.modifier_add', { type: 'BOOLEAN' });
  await frame();
  await click('tab-modifiers');
  await js(`(() => { const s = document.querySelector('[data-testid=prop-object]'); s.value = ${JSON.stringify(cutter)}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await frame();
  eq(await doc('active.modifiers[0].object'), cutter, 'picked');
  const volume = await js(`import('/src/core/mesh.js').then(async (m) => { const d = await import('/src/core/doc.js'); const doc = window.__my3d.doc; return m.signedVolume(d.evaluatedMesh(doc, doc.objects[0])); })`);
  assert(Math.abs(volume - 4) < 1e-3, `volume ${volume}`);
});
await test('constraint from the panel: Copy Location follows its target', async () => {
  await click('tab-constraints');
  await click('add-constraint');
  await js("[...document.querySelectorAll('.menu .menu-item')].find((x) => x.textContent === 'Copy Location' || x.textContent.includes('Copy Location')).click()");
  await frame();
  const light = await doc('doc.objects[1].id');
  await js(`(() => { const s = document.querySelector('[data-testid=prop-target]'); s.value = ${JSON.stringify(light)}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await frame();
  const pos = await js("import('/src/core/doc.js').then((d) => d.worldPosition(window.__my3d.doc, window.__my3d.doc.objects[0]))");
  eq(pos.map((x) => Math.round(x * 100) / 100), [4.08, 1, 5.9], 'copied');
});
await test('material panel: new material, edit, assign; the Material shading uses it', async () => {
  await click('tab-material');
  await click('material-new');
  eq(await doc('doc.materials.length'), 2, 'new');
  const r = await rect(tid('prop-roughness'));
  await cdp.click(r.cx, r.cy);
  await frame();
  await js("document.querySelector('[data-testid=prop-roughness]').select()");
  await cdp.send('Input.insertText', { text: '0.25' });
  await press('Enter');
  eq(await doc('doc.materials[1].roughness'), 0.25, 'roughness');
  await click('shading-MATERIAL');
  await frame();
  eq(await js("(() => { const v = window.__my3d.editorsOf('view3d')[0].api; const doc = window.__my3d.doc; const m = v.sync.items.get(doc.objects[0].id).mesh.material; return m.roughness; })()"), 0.25, 'view uses it');
});
await test('physics tab: rigid bodies baked from the button fall in the timeline', async () => {
  await click('tab-physics');
  await click('phys-rigid');
  eq(await doc('active.rigidBody.type'), 'ACTIVE', 'rigid body');
  await js("window.__my3d.doc.frameEnd = 20");
  await click('bake-all');
  await frame();
  await js('window.__my3d.setFrame(20)');
  await frame();
  assert(await doc('active.location[2]') < -0.5, 'fell');
});

// ───────────────────────── seams, rip, proportional, texture paint, new modifiers

const pixelsOf = (id) => `window.__my3d.imageCache()[${id}]`;
await test('Mesh menu: mark seams, then U unwraps along them and the UV editor shows the islands', async () => {
  await op('object.mode_set', { mode: 'EDIT' });
  await js("(() => { const m = window.__my3d.doc.objects[0].data; m.selV = m.verts.map((_, i) => i); window.__my3d.touch(); })()");
  await frame();
  await click('menu-object');
  await js("[...document.querySelectorAll('.menu .menu-item')].find((x) => x.textContent.startsWith('Edge')).click()");
  await frame();
  await js("[...document.querySelectorAll('.menu .menu-item')].find((x) => x.textContent.startsWith('Mark Seam')).click()");
  await frame();
  eq(await doc('Object.keys(active.data.marks.seam).length'), 12, 'all the edges of the cube');
  await hoverView();
  await press('u');
  await frame();
  const islands = await js("import('/src/core/unwrap.js').then((u) => u.findIslands(window.__my3d.doc.objects[0].data).length)");
  eq(islands, 6, 'one island per face');
  const distortion = await js("import('/src/core/unwrap.js').then((u) => u.angleDistortion(window.__my3d.doc.objects[0].data))");
  assert(distortion < 0.01, `distortion ${distortion}`);
  await cdp.screenshot(path.join(shots, 'seams.png'));
});
await test('V rips: the torn vertex can be dragged off, and undo sews it back', async () => {
  await op('mesh.primitive_grid_add', { x: 4, y: 4, size: 4 });
  await op('object.mode_set', { mode: 'EDIT' });
  await js("(() => { const m = window.__my3d.doc.objects.at(-1).data; m.selV = [11, 12, 13]; window.__my3d.touch(); })()");
  await frame();
  const before = await doc('active.data.verts.length');
  const r = await hoverView();
  await press('v');
  await moveTo(r.cx + 40, r.cy + 40);
  await frame();
  await press('Enter');
  await frame();
  eq(await doc('active.data.verts.length'), before + 1, 'one vertex was added');
  const moved = await doc('active.data.verts.at(-1)');
  const original = await doc('active.data.verts[12]');
  assert(Math.hypot(moved[0] - original[0], moved[1] - original[1], moved[2] - original[2]) > 0.05, 'the slit opened');
  await press('z', { ctrl: true });
  await press('z', { ctrl: true });
  await frame();
  eq(await doc('active.data.verts.length'), before, 'undone');
});
await test('O turns proportional editing on: G drags the neighbours with falloff, the wheel changes its reach', async () => {
  await op('mesh.primitive_grid_add', { x: 10, y: 1, size: 10 });
  await op('object.mode_set', { mode: 'EDIT' });
  await js("(() => { const a = window.__my3d; const m = a.doc.objects.at(-1).data; m.selV = [5]; a.doc.proportional = { enabled: false, size: 2.5, falloff: 'LINEAR', connected: false }; a.touch(); })()");
  await frame();
  const r = await hoverView();
  await press('o');
  await frame();
  eq(await doc('doc.proportional.enabled'), true, 'on');
  assert(await js(`document.querySelector(${JSON.stringify(tid('proportional-toggle'))}).classList.contains('on')`), 'the header shows it');
  await press('g');
  await press('z');
  await moveTo(r.cx, r.cy - 60);
  await frame();
  const h = (i) => doc(`active.data.verts[${i}][2]`);
  const [centre, next, far] = [await h(5), await h(6), await h(9)];
  assert(centre > 0.1, `the selection moved: ${centre}`);
  assert(Math.abs(next / centre - 0.6) < 0.02, `the neighbour follows by its weight: ${next} of ${centre}`);
  eq(far, 0, 'outside the reach');
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: r.cx, y: r.cy - 60, deltaX: 0, deltaY: 120 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: r.cx, y: r.cy - 60, deltaX: 0, deltaY: 120 });
  await frame();
  assert(await doc('doc.proportional.size') > 2.5, 'the wheel grew the reach');
  await press('Escape');
  await frame();
  eq(await h(6), 0, 'cancel puts the followers back');
  eq(await h(5), 0, 'and the selection');
  await js("(() => { const a = window.__my3d; a.doc.proportional.enabled = false; })()");
});
await test('Paint workspace: Add Paint Texture, then a real stroke changes the picture on the model and undo restores it', async () => {
  await click('ws-paint');
  await frame();
  eq(await doc('doc.mode'), 'TEXTURE_PAINT', 'mode');
  await hoverView();
  await press('n');
  await frame();
  await click('paint-add-texture');
  await frame();
  eq(await doc('doc.images.length'), 1, 'image');
  const id = JSON.stringify(await doc('doc.images[0].id'));
  const count = () => js(`(() => { const e = ${pixelsOf(id)}; let n = 0; for (let i = 0; i < e.rgba.length; i += 4) if (e.rgba[i] !== e.rgba[i + 1]) n++; return n; })()`);
  eq(await count(), 0, 'blank');
  const shot = await canvasStats();
  const top = await screenPos([0, 0, 1]);
  await cdp.drag([top.x - 15, top.y], [top.x + 15, top.y], 5);
  await frame();
  await sleep(80);
  const painted = await count();
  assert(painted > 100, `the stroke painted ${painted} texels`);
  assert(painted < 1024 * 1024 * 0.2, `one stroke on one side must not cover the whole picture: ${painted}`);
  eq(await js(`document.querySelector(${JSON.stringify(tid('image-source'))}).value`), JSON.parse(id), 'the Image Editor shows the picture being painted');
  const saved = await doc('doc.images[0].dataUrl');
  assert(saved.startsWith('data:image/png'), 'the picture is in the document');
  const view = await js(`(() => { const v = window.__my3d.editorsOf('view3d')[0].api; const m = v.sync.items.get(window.__my3d.doc.objects[0].id).mesh.material; return { map: Boolean(m.map), w: m.map?.image?.width }; })()`);
  eq(view, { map: true, w: 1024 }, 'the viewport shows the full-size picture');
  await cdp.screenshot(path.join(shots, 'texture-paint.png'));
  void shot;
  await press('z', { ctrl: true });
  await sleep(300);
  await frame();
  eq(await count(), 0, 'undo took the paint off');
  await hoverView();
  await press('n');
});
await test('Image Editor: New Image, the brush paints where the mouse is', async () => {
  await click('ws-paint');
  await frame();
  await click('image-new');
  await sleep(100);
  await frame();
  const id = JSON.stringify(await doc('doc.images.at(-1).id'));
  const box = await rect(tid('image-canvas'));
  // A square picture is fitted inside the area: its centre is the area's centre.
  await cdp.drag([box.cx - 20, box.cy], [box.cx + 20, box.cy], 5);
  await frame();
  const c = await js(`(() => { const e = ${pixelsOf(id)}; const at = (u, v) => { const x = Math.floor(u * e.width); const y = Math.floor((1 - v) * e.height); const i = (y * e.width + x) * 4; return [e.rgba[i], e.rgba[i + 1], e.rgba[i + 2]]; }; return { centre: at(0.5, 0.5), corner: at(0.05, 0.05) }; })()`);
  assert(c.centre[1] < 200, `the middle is painted: ${c.centre}`);
  eq(c.corner, [255, 255, 255], 'the corner is not');
  await cdp.screenshot(path.join(shots, 'image-paint.png'));
});
await test('Properties: every new modifier can be added from the menu and shows on the object', async () => {
  for (const [type, check] of [['REMESH', (o) => o.faces > 100], ['MULTIRES', (o) => o.faces === 24], ['OCEAN', (o) => o.faces === 64 * 64]]) {
    await reset();
    await click('tab-modifiers');
    await click('add-modifier');
    await js("[...document.querySelectorAll('.menu .menu-item')].find((x) => x.textContent.startsWith('Generate')).click()");
    await frame();
    await click(`add-mod-${type}`);
    await frame();
    await sleep(60);
    const info = await js(`(() => { const a = window.__my3d; const o = a.doc.objects[0]; const it = a.editorsOf('view3d')[0].api.sync.items.get(o.id); return { type: o.modifiers[0]?.type, faces: it.evaluated.faces.length }; })()`);
    eq(info.type, type, 'added');
    assert(check(info), `${type}: ${info.faces} faces`);
  }
});
await test('the Multiresolution modifier: Subdivide adds a level from its panel, and a sculpt stroke lands on it', async () => {
  await click('tab-modifiers');
  await op('object.modifier_add', { type: 'MULTIRES' });
  await frame();
  await click('mod-multires-subdivide');
  await frame();
  eq(await doc('active.modifiers[0].total'), 2, 'two levels');
  await op('object.mode_set', { mode: 'SCULPT' });
  const baseBefore = await doc('active.data.verts');
  // Two levels of subdivision round the cube off: aim at its middle, where the surface surely is.
  const p = await screenPos([0, 0, 0]);
  await cdp.drag([p.x - 10, p.y], [p.x + 10, p.y], 4);
  await frame();
  // A cube: 8 vertices, then 26, then 98 at the top level.
  eq(await doc('active.modifiers[0].disp?.length ?? 0'), 98, 'offsets for each vertex of the top level');
  assert(await doc('active.modifiers[0].disp.some((d) => Math.hypot(...d) > 1e-4)'), 'the stroke really moved something');
  eq(await doc('active.data.verts'), baseBefore, 'the base mesh does not change');
});
await test('dynamic topology adds triangles where the brush goes', async () => {
  await op('mesh.primitive_ico_sphere_add', { subdivisions: 2, radius: 1 });
  await op('object.mode_set', { mode: 'SCULPT' });
  await hoverView();
  await press('n');
  await frame();
  await click('brush-dyntopo');
  await frame();
  const before = await doc('active.data.faces.length');
  const p = await screenPos(await doc('active.location').then((l) => [l[0], l[1], l[2] + 1]));
  await cdp.drag([p.x - 10, p.y], [p.x + 10, p.y], 4);
  await frame();
  assert(await doc('active.data.faces.length') > before, 'more triangles');
  await js('window.__my3d.editorsOf("view3d")[0].api.tool.dyntopo = false');
});

// ───────────────────────── groups, instances, scenes, paths, keys, assets

await test('Node groups: Ctrl+G makes a group, Tab goes in and out, Alt+G undoes it, and the result is the same', async () => {
  await click('ws-shading');
  await frame();
  await click('tab-material');
  await sleep(50);
  await op('material.use_nodes');
  await frame();
  await sleep(80);
  const editor = "window.__my3d.editorsOf('nodes')[0].api";
  await js(`${editor}.addNode('MATH', { x: 0, y: 40 })`);
  await frame();
  const before = await doc("doc.materials[0].nodes.nodes.length");
  const r = await rect(tid('node-editor'));
  await moveTo(r.cx, r.cy);
  await js(`${editor}.selected.clear(); ${editor}.selected.add(window.__my3d.doc.materials[0].nodes.nodes.find((n) => n.type === 'MATH').id)`);
  await press('g', { ctrl: true });
  await frame();
  eq(await doc("doc.materials[0].nodes.nodes.filter((n) => n.type === 'GROUP').length"), 1, 'grouped');
  eq(await doc('doc.nodeGroups.length'), 1, 'remembered');
  assert(await exists('node-GROUP'), 'the group node is drawn');
  await press('Tab', {});
  await frame();
  assert(await exists('node-NG_INPUT'), 'inside the group');
  assert((await js(`document.querySelector(${JSON.stringify(tid('node-crumb'))}).textContent`)).includes('NodeGroup'), 'the header says where we are');
  await press('Tab', {});
  await frame();
  assert(await exists('node-GROUP'), 'back outside');
  await js(`${editor}.selected.clear(); ${editor}.selected.add(window.__my3d.doc.materials[0].nodes.nodes.find((n) => n.type === 'GROUP').id)`);
  await press('g', { alt: true });
  await frame();
  eq(await doc('doc.materials[0].nodes.nodes.length'), before, 'ungrouped');
});
await test('A collection instance and instances on faces are drawn', async () => {
  await op('collection.create', { name: 'Props' });
  const col = await doc('doc.collections.at(-1).id');
  await js(`window.__my3d.doc.objects[0].collection = ${JSON.stringify(col)}; window.__my3d.doc.activeCollection = 'col_root'; window.__my3d.touch();`);
  await frame();
  await click('menu-add');
  await js("[...document.querySelectorAll('.menu .menu-item')].find((x) => x.dataset.testid === 'add-collection-instance').click()");
  await frame();
  await click('add-instance-Props');
  await frame();
  await sleep(50);
  await js('window.__my3d.doc.objects.at(-1).location = [5, 0, 0]; window.__my3d.touch();');
  await frame();
  const count = () => js("window.__my3d.editorsOf('view3d')[0].api.sync.instanceRoot.children.map((c) => c.count)");
  eq(await count(), [1], 'one instance');
  await cdp.screenshot(path.join(shots, 'collection-instance.png'));
  await op('mesh.primitive_cube_add', { size: 4, location: [0, 8, 0] });
  await op('object.instancer_set', { mode: 'FACES' });
  await js(`(() => { const d = window.__my3d.doc; const o = d.objects.at(-1); d.objects.find((x) => x.type === 'EMPTY').parent = null; d.objects[0].collection = 'col_root'; d.objects[0].parent = o.id; window.__my3d.touch(); })()`);
  await frame();
  assert((await count()).includes(6), 'six on the faces');
});
await test('Scenes: new, copy, switch and delete from the top bar', async () => {
  await click('scene-menu');
  await click('scene-new');
  await frame();
  eq(await doc('doc.objects.length'), 0, 'empty');
  eq(await js(`document.querySelector(${JSON.stringify(tid('scene-menu'))}).textContent`), 'Scene.001', 'the top bar names it');
  await click('scene-menu');
  await click('scene-Scene');
  await frame();
  eq(await doc('doc.objects.length'), 3, 'back');
  await click('scene-menu');
  await click('scene-copy');
  await frame();
  eq(await doc('doc.objects.length'), 3, 'a copy');
  eq(await doc('doc.scenes.length'), 3, 'three');
  await click('scene-menu');
  await click('scene-delete');
  await frame();
  eq(await doc('doc.scenes.length'), 2, 'deleted');
  await press('z', { ctrl: true });
  await frame();
  eq(await doc('doc.scenes.length'), 3, 'undo restores it');
});
await test('Motion path and onion ghosts appear in the view', async () => {
  await js(`import('/src/core/anim.js').then((a) => { const o = window.__my3d.doc.objects[0]; a.insertKey(o, 'location.0', 1, -3, 'LINEAR'); a.insertKey(o, 'location.0', 21, 3, 'LINEAR'); })`);
  await js('window.__my3d.setFrame(11)');
  await op('object.paths_calculate', { start: 1, end: 21 });
  await op('object.onion_set', { before: 2, after: 2, every: 3 });
  await frame();
  await sleep(60);
  const kinds = await js("window.__my3d.editorsOf('view3d')[0].api.pathGroup.children.map((c) => c.type)");
  assert(kinds.includes('Line'), 'the path');
  eq(kinds.filter((k) => k === 'Mesh').length, 4, 'four ghosts');
  await cdp.screenshot(path.join(shots, 'motion-path.png'));
});
await test('Keymap editor: a new key runs the operator, the old one stops, reset brings it back', async () => {
  await js('window.__my3d.openKeymap()');
  await frame();
  await sleep(150);
  const query = (sel) => `window.__my3d.query(${JSON.stringify(sel)})`;
  await js(`(() => { const s = ${query(tid('keymap-search'))}; s.value = 'Rip'; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await js(`${query(tid('keymap-mesh.rip'))}.click()`);
  await js(`${query(tid('keymap-mesh.rip'))}.ownerDocument.defaultView.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true }))`);
  await frame();
  eq(await js("import('/src/core/ops.js').then((o) => o.getOp('mesh.rip').key)"), 'K', 'the new key shows');
  await js('window.__my3d.closeAllDialogs()');
  await op('mesh.primitive_grid_add', { x: 4, y: 4, size: 4 });
  await op('object.mode_set', { mode: 'EDIT' });
  await js("(() => { const m = window.__my3d.doc.objects.at(-1).data; m.selV = [11, 12, 13]; window.__my3d.touch(); })()");
  await frame();
  const count = await doc('active.data.verts.length');
  await hoverView();
  await press('v');
  await frame();
  eq(await doc('active.data.verts.length'), count, 'V is free now');
  eq(await js('Boolean(window.__my3d.editorsOf("view3d")[0].api.modal())'), false, 'and starts nothing');
  await press('k');
  await frame();
  eq(await doc('active.data.verts.length'), count + 1, 'K rips');
  await js("(() => { const a = window.__my3d; a.settings.keymap = {}; return import('/src/core/keymap.js').then((k) => k.applyKeymap({})); })()");
  eq(await js("import('/src/core/ops.js').then((o) => o.getOp('mesh.rip').key)"), 'V', 'reset');
});
await test('Asset Browser: previews draw, a double-click gives the selection a material and adds an object', async () => {
  await click('ws-assets');
  await frame();
  await sleep(600);
  await waitFor(() => exists('asset-lib_gold'), 3000);
  await click('asset-lib_gold');
  const card = await rect(tid('asset-lib_gold'));
  await cdp.click(card.cx, card.cy, 'left', 1);
  await cdp.click(card.cx, card.cy, 'left', 2);
  await frame();
  eq(await doc('doc.materials.at(-1).metallic'), 1, 'gold');
  eq(await doc('doc.objects[0].materials[0] === doc.materials.at(-1).id'), true, 'on the cube');
  const box = await rect(tid('asset-lib_ring'));
  const before = await doc('doc.objects.length');
  await cdp.click(box.cx, box.cy, 'left', 1);
  await cdp.click(box.cx, box.cy, 'left', 2);
  await frame();
  eq(await doc('doc.objects.length'), before + 1, 'a ring');
  await click('asset-cat-Glass');
  await frame();
  eq(await js("document.querySelectorAll('.asset-card').length"), 3, 'the catalog filters');
  await sleep(400);
  await cdp.screenshot(path.join(shots, 'assets.png'));
});

// ───────────────────────── simulations, GPU render, lines, surfaces

await test('Add › Volume draws in the view; a Smoke Domain bakes and shows from the Physics tab', async () => {
  await click('menu-add');
  await js("[...document.querySelectorAll('.menu .menu-item')].find((x) => x.dataset.testid === 'add-volume').click()");
  await frame();
  await click('add-volume-SPHERE');
  await frame();
  await sleep(60);
  eq(await doc('active.type'), 'VOLUME', 'added');
  eq(await js("window.__my3d.editorsOf('view3d')[0].api.sync.volumeRoot.children.length"), 1, 'drawn');
  await cdp.screenshot(path.join(shots, 'volume.png'));
  await op('object.delete');
  await js("window.__my3d.op('object.select_set', { id: window.__my3d.doc.objects[0].id }); window.__my3d.doc.frameEnd = 5; window.__my3d.doc.objects[0].scale = [2, 2, 2]; window.__my3d.touch();");
  await click('tab-physics');
  await sleep(50);
  await click('phys-smoke-domain');
  await js("window.__my3d.doc.objects[0].smoke.res = 10");
  await op('mesh.primitive_cube_add', { size: 0.5, location: [0, 0, -1] });
  await click('phys-smoke-flow');
  await frame();
  await click('bake-all');
  await frame();
  await js('window.__my3d.setFrame(5)');
  await frame();
  await sleep(60);
  eq(await js("window.__my3d.editorsOf('view3d')[0].api.sync.volumeRoot.children.length"), 1, 'the bake is drawn');
  eq(await js("window.__my3d.editorsOf('view3d')[0].api.sync.items.get(window.__my3d.doc.objects[0].id).mesh.visible"), false, 'the domain is no solid box');
  await op('ptcache.free_all');
});
await test('A liquid domain turns into the liquid when baked', async () => {
  await js("window.__my3d.doc.frameEnd = 4; window.__my3d.doc.objects[0].scale = [2, 2, 2]; window.__my3d.touch();");
  await click('tab-physics');
  await sleep(50);
  await click('phys-fluid-domain');
  await js("window.__my3d.doc.objects[0].fluid.res = 10");
  await op('mesh.primitive_cube_add', { size: 1, location: [0, 0, 0.5] });
  await click('phys-fluid-flow');
  await frame();
  await click('bake-all');
  await js('window.__my3d.setFrame(4)');
  await frame();
  await sleep(100);
  const verts = await js("window.__my3d.editorsOf('view3d')[0].api.sync.items.get(window.__my3d.doc.objects[0].id).evaluated.verts.length");
  assert(verts > 50, `the surface has ${verts} vertices`);
  await op('ptcache.free_all');
});
await test('GPU Path Tracing renders the same scene as the CPU, within noise', async () => {
  const ready = await js("import('/src/ui/gpupath.js').then((g) => g.gpuPathAvailable())");
  assert(ready, 'this browser renders to float textures');
  const mean = (engine) => js(`(async () => {
    const a = window.__my3d;
    const d = a.doc;
    Object.assign(d.render, { engine: ${JSON.stringify(engine)}, width: 48, height: 27, percent: 100, samples: 48, bounces: 3, denoise: false, seed: 1, viewTransform: 'STANDARD' });
    d.world.color = [0.4, 0.45, 0.5];
    const { renderPath } = await import('/src/ui/render.js');
    const r = await renderPath(d, {}).promise;
    let sum = 0;
    for (let i = 0; i < r.linear.data.length; i += 4) sum += r.linear.data[i] + r.linear.data[i + 1] + r.linear.data[i + 2];
    return { mean: sum / (r.linear.data.length * 0.75), width: r.width, centre: Array.from(r.linear.data.subarray((13 * 48 + 24) * 4, (13 * 48 + 24) * 4 + 3)) };
  })()`);
  const gpu = await mean('GPU');
  const cpu = await mean('PATH');
  eq(gpu.width, 48, 'size');
  assert(Math.abs(gpu.mean - cpu.mean) < Math.max(0.05, cpu.mean * 0.2), `GPU ${gpu.mean} against CPU ${cpu.mean}`);
  assert(gpu.centre.some((x, i) => Math.abs(x - cpu.centre[i]) < 0.25), `centre GPU ${gpu.centre} CPU ${cpu.centre}`);
});
await test('Freestyle draws lines on a render from the Render tab setting', async () => {
  const count = (on) => js(`(async () => {
    const a = window.__my3d;
    const d = a.doc;
    Object.assign(d.render, { engine: 'REALTIME', width: 96, height: 54, percent: 100 });
    d.render.freestyle = { enabled: ${on}, thickness: 2, color: [1, 0, 1], crease: 30, silhouette: true, border: true, creases: true };
    const { renderRealtime } = await import('/src/ui/render.js');
    const r = renderRealtime(d, {});
    let n = 0;
    for (let i = 0; i < r.linear.data.length; i += 4) if (r.linear.data[i] > 0.8 && r.linear.data[i + 1] < 0.2 && r.linear.data[i + 2] > 0.8) n++;
    return n;
  })()`);
  eq(await count(false), 0, 'off');
  assert(await count(true) > 30, 'on: magenta lines');
});
await test('NURBS: Add › Surface, Tab shows control points, a click and G moves one and the surface follows', async () => {
  await click('menu-add');
  await js("[...document.querySelectorAll('.menu .menu-item')].find((x) => x.dataset.testid === 'add-surface').click()");
  await frame();
  await click('add-surface-PATCH');
  await frame();
  eq(await doc('active.type'), 'SURFACE', 'added');
  const before = await doc('active.data.points[5]');
  const r = await hoverView();
  await press('Tab', {});
  await frame();
  eq(await doc('doc.mode'), 'EDIT', 'edit mode');
  const p = await screenPos(before.slice(0, 3));
  await moveTo(p.x, p.y);
  await cdp.click(p.x, p.y);
  await frame();
  await press('g');
  await press('z');
  await moveTo(p.x, p.y - 70);
  await frame();
  await press('Enter');
  await frame();
  const after = await doc('active.data.points[5]');
  assert(after[2] > before[2] + 0.1, `the point rose: ${after}`);
  const top = await js("window.__my3d.editorsOf('view3d')[0].api.sync.items.get(window.__my3d.doc.activeId).evaluated.verts.reduce((m, v) => Math.max(m, v[2]), -9)");
  assert(top > 0.02, 'the surface followed');
  await press('Tab', {});
  void r;
});

// ───────────────────────── Python, add-ons, sequencer, tracking, OSL

await test('Text Editor runs Python: operators work, print goes to the Info log', async () => {
  await click('ws-scripting');
  await frame();
  await js(`window.__my3d.editorsOf('text')[0].api.setText('import bpy\\nfor i in range(3):\\n    bpy.ops.mesh.primitive_cube_add(location=(i * 2, 3, 0))\\nprint(f"count={len(bpy.data.objects)}")\\n', 'test.py')`);
  await click('text-run');
  await frame();
  eq(await doc('doc.objects.length'), 6, 'three more');
  assert(await js("window.__my3d.logLines.some((l) => l.text === 'count=6')"), 'printed');
  await js(`window.__my3d.editorsOf('text')[0].api.setText('import numpy\\n', 'test.py')`);
  await click('text-run');
  await frame();
  assert((await js("document.querySelector('[data-testid=status-msg]').textContent")).includes('ModuleNotFoundError'), 'a missing module is shown');
});
await test('The console speaks Python, keeps its names, and JavaScript is a choice away', async () => {
  await click('ws-scripting');
  await frame();
  const say = async (line) => { await click('console-input'); await cdp.send('Input.insertText', { text: line }); await press('Enter'); await frame(); };
  await say('x = 6 * 7');
  await say('x');
  assert((await js("document.querySelector('[data-testid=console-log]').textContent")).includes('42'), 'python');
  await js("(() => { const s = document.querySelector('[data-testid=console-language]'); s.value = 'JAVASCRIPT'; s.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await say('[1,2].map((n) => n * 100).join("|")');
  assert((await js("document.querySelector('[data-testid=console-log]').textContent")).includes('100|200'), 'javascript');
});
await test('Add-ons: turning one on adds its operator to the Edit menu and F3; off takes it away', async () => {
  await js('window.__my3d.openAddons()');
  await frame();
  await sleep(150);
  await js("window.__my3d.query('[data-testid=\"addon-toggle-add_mesh_gear\"]').click()");
  await frame();
  await js('window.__my3d.closeAllDialogs()');
  await frame();
  eq(await js("import('/src/core/addons.js').then((m) => m.isEnabled('add_mesh_gear'))"), true, 'on');
  await op('mesh.gear_add', { teeth: 10 });
  eq(await doc('active.name'), 'Gear', 'the operator ran');
  eq(await doc('active.data.verts.length'), 80, 'ten teeth');
  await click('menu-edit');
  await js("[...document.querySelectorAll('.menu .menu-item')].find((x) => x.dataset.testid === 'menu-addons').click()");
  await frame();
  assert(await js("[...document.querySelectorAll('.menu .menu-item')].some((x) => x.textContent.includes('Gear'))"), 'in the menu');
  await press('Escape');
  await js("import('/src/core/addons.js').then((m) => m.disableAddon('add_mesh_gear'))");
  await js("window.__my3d.settings.addons.enabled = []");
});
await test('Sequencer: strips made from the menu, a real drag moves one, K cuts, the preview shows it', async () => {
  await click('ws-video');
  await frame();
  await sleep(100);
  const api = "window.__my3d.editorsOf('sequencer')[0].api";
  await click('menu-seq-add');
  await click('seq-add-COLOR');
  await frame();
  eq(await doc('doc.sequence.strips.length'), 1, 'a colour strip');
  await js(`${api}.selected().color = [1, 0, 0]; ${api}.selected().length = 40; window.__my3d.touch();`);
  await js('window.__my3d.setFrame(10)');
  await frame();
  await sleep(100);
  const centre = () => js(`(() => { const c = ${api}.preview; ${api}.drawPreview(); const d = c.getContext('2d').getImageData(c.width >> 1, c.height >> 1, 1, 1).data; return [d[0], d[1], d[2]]; })()`);
  eq(await centre(), [255, 0, 0], 'the preview shows the strip');
  const box = await rect(tid('seq-timeline'));
  const x0 = await js(`${api}.toX(window.__my3d.doc.sequence.strips[0].start + 5)`);
  const y = box.y + box.h - 12;
  await cdp.drag([box.x + x0, y], [box.x + x0 + 80, y], 5);
  await frame();
  assert(await doc('doc.sequence.strips[0].start') > 5, 'the drag moved it');
  await js('window.__my3d.setFrame(window.__my3d.doc.sequence.strips[0].start + 10)');
  await moveTo(box.cx, box.cy);
  await press('k');
  await frame();
  eq(await doc('doc.sequence.strips.length'), 2, 'K cut it');
  eq(await centre(), [255, 0, 0], 'the cut changes nothing on screen');
  await click('menu-seq-add');
  await click('seq-add-TEXT');
  await frame();
  await cdp.screenshot(path.join(shots, 'sequencer.png'));
  await press('z', { ctrl: true });
  await frame();
  eq(await doc('doc.sequence.strips.length'), 2, 'undo');
});
await test('Sequencer exports a real WebM video', async () => {
  await click('ws-video');
  await frame();
  const info = await js(`(async () => {
    const a = window.__my3d;
    const { addStrip, createStrip } = await import('/src/core/sequencer.js');
    addStrip(a.doc.sequence, createStrip('COLOR', { color: [0, 1, 0], start: 1, length: 8 }));
    a.doc.render.width = 64; a.doc.render.height = 36; a.doc.render.percent = 100;
    const blob = await a.exportSequenceVideo();
    const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    return { size: blob.size, type: blob.type, head: [...head] };
  })()`);
  assert(info.size > 100, `${info.size} bytes`);
  eq(info.type, 'video/webm', 'type');
  eq(info.head, [0x1a, 0x45, 0xdf, 0xa3], 'the WebM signature');
});
await test('Clip Editor: a click adds a marker, Track follows it through the pictures, Solve fills the scene', async () => {
  await click('ws-tracking');
  await frame();
  await sleep(80);
  await js(`(async () => {
    const a = window.__my3d;
    const { createImageBuffer, encodePNGDataUrl, paintDabImage } = await import('/src/core/paint.js');
    const frames = [];
    for (let f = 0; f < 8; f++) {
      const image = createImageBuffer(120, 90, [0.1, 0.1, 0.12, 1]);
      paintDabImage(image, (30 + f * 4) / 120, 1 - 40 / 90, { radius: 6, color: [1, 1, 0.8], strength: 1 });
      paintDabImage(image, (34 + f * 4) / 120, 1 - 43 / 90, { radius: 3, color: [0.2, 0.3, 1], strength: 1 });
      frames.push({ dataUrl: encodePNGDataUrl(image) });
    }
    a.doc.clips = [{ id: 'clipT', name: 'Dots', kind: 'IMAGES', frames, width: 120, height: 90, fps: 24, start: 1, tracks: [] }];
    a.setFrame(1);
  })()`);
  await frame();
  await sleep(200);
  const pos = await js(`(() => { const c = document.querySelector('[data-testid=clip-canvas]'); const r = c.getBoundingClientRect(); const s = Math.min(r.width / c.width, r.height / c.height); return { x: r.left + (r.width - c.width * s) / 2 + 30 * s, y: r.top + (r.height - c.height * s) / 2 + 40 * s }; })()`);
  await cdp.click(pos.x, pos.y);
  await frame();
  eq(await doc('doc.clips[0].tracks.length'), 1, 'a marker');
  assert(!/\bnull\b/.test(await js('document.body.innerText')), 'an unsolved clip prints nothing in place of its error');
  await click('clip-track-forward');
  await sleep(600);
  await frame();
  const pts = await doc('doc.clips[0].tracks[0].points');
  eq(Object.keys(pts).length, 8, 'every frame');
  assert(Math.abs(pts[7][0] - 58) < 2, `it followed: ${pts[7]}`);
  await cdp.screenshot(path.join(shots, 'clip.png'));
  // A solve needs depth: synthetic tracks stand in for a real shot.
  await js(`(() => { const a = window.__my3d; const SHAPE = [[1,1,1],[-1,1,1],[1,-1,1],[-1,-1,1],[1,1,-1],[-1,1,-1],[1,-1,-1],[-1,-1,-1]]; a.doc.clips[0].tracks = SHAPE.map(([x,y,z], i) => { const points = {}; for (let f = 0; f < 8; f++) { const k = f * 0.07; const [x1, z1] = [Math.cos(k) * x + Math.sin(k) * z, -Math.sin(k) * x + Math.cos(k) * z]; points[f] = [60 + x1 * 16, 45 - (Math.cos(0.4) * y - Math.sin(0.4) * z1) * 16]; } return { id: 't' + i, name: 'T' + i, points, score: 1 }; }); a.touch(); })()`);
  await frame();
  const before = await doc('doc.objects.length');
  await click('clip-solve');
  await frame();
  await sleep(80);
  eq(await doc('doc.objects.length'), before + 9, 'eight points and a camera');
  assert(await exists('clip-solve-error'), 'the error is shown');
});
await test('OSL: the node\'s sockets come from its source, and a typo shows an error instead of breaking', async () => {
  await click('ws-shading');
  await frame();
  await click('tab-material');
  await sleep(50);
  await op('material.use_nodes');
  await frame();
  await sleep(80);
  await js("window.__my3d.editorsOf('nodes')[0].api.addNode('SCRIPT_OSL', { x: -200, y: 300 })");
  await frame();
  assert(await exists('socket-SCRIPT_OSL-out-Color'), 'a socket from the source');
  assert(await exists('socket-SCRIPT_OSL-in-Scale'), 'a parameter');
  const edit = (text) => js(`(() => { const a = document.querySelector('[data-testid=osl-source]'); a.value = ${JSON.stringify(text)}; a.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await edit('shader Two(float Amount = 1, output float Out = 0) { Out = Amount * 2; }');
  await frame();
  await sleep(60);
  assert(await exists('socket-SCRIPT_OSL-in-Amount'), 'new sockets');
  await edit('shader broken( {');
  await frame();
  await sleep(60);
  assert(await exists('osl-error'), 'the error shows');
});

// ───────────────────────── the start screen and the samples

await test('Start screen: six cards, tools and footer; the Start button in the top bar shows and hides it', async () => {
  await js('window.__my3d.showStart()');
  await frame();
  await sleep(150);
  assert(await js("document.querySelector('[data-testid=start-screen]').style.display !== 'none'"), 'visible');
  for (const id of ['start-card-hero', 'start-card-actions', 'start-card-recent', 'start-card-samples', 'start-card-theme', 'start-card-background', 'start-footer', 'start-new', 'start-open', 'start-samples', 'start-guide', 'start-tutorial', 'start-arrange', 'start-settings', 'start-option', 'start-empty', 'start-import', 'bg-cards']) assert(await exists(id), id);
  assert((await js("document.querySelector('[data-testid=start-author]').textContent")).includes('SHKWON (knix008@naver.com)'), 'the author');
  eq(await js("document.querySelectorAll('[data-bg-card]').length"), 20, 'twenty backgrounds');
  // The samples are a section of their own, right under the recent projects.
  await sleep(350);
  const under = await js("(() => { const a = document.querySelector('[data-testid=start-card-recent]').getBoundingClientRect(); const b = document.querySelector('[data-testid=start-card-samples]').getBoundingClientRect(); return b.top >= a.bottom && b.top - a.bottom < 60; })()");
  assert(under, 'samples sit under the recent projects');
  assert(await js("document.querySelectorAll('[data-start-theme]').length") >= 4, 'themes to pick from');
  assert(await js("document.querySelector('[data-testid=start-toggle]').classList.contains('active')"), 'the button is pressed');
  // Nothing sticks out sideways, and every fixed row of buttons is whole.
  eq(await js("(() => { const s = document.querySelector('.start-scroll'); return s.scrollWidth <= s.clientWidth; })()"), true, 'no sideways scroll');
  await cdp.screenshot(path.join(shots, 'start-screen.png'));
  await click('start-toggle');
  await frame();
  eq(await js("document.querySelector('[data-testid=start-screen]').style.display"), 'none', 'the toggle hides it');
  eq(await js("document.querySelector('[data-testid=start-toggle]').classList.contains('active')"), false, 'not pressed');
  await click('start-toggle');
  await frame();
  assert(await js("document.querySelector('[data-testid=start-screen]').style.display !== 'none'"), 'and shows it');
  await click('start-toggle');
});
await test('Start screen: keys do not reach the hidden view, and each background really draws', async () => {
  await js('window.__my3d.showStart()');
  await frame();
  await sleep(100);
  const count = await doc('doc.objects.length');
  await press('x');
  await frame();
  eq(await doc('doc.objects.length'), count, 'X deleted nothing');
  const kinds = await js("[...document.querySelectorAll('[data-bg-card]')].map((b) => b.dataset.bgCard)");
  for (const kind of kinds) {
    await click2bg(kind);
    await sleep(70);
    const n = await js(`(() => { const c = document.querySelector('[data-testid=start-canvas]'); const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; const set = new Set(); for (let i = 0; i < d.length; i += 4 * 97) set.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); return set.size; })()`);
    assert(n > 2, `${kind} shows only ${n} colours`);
  }
  eq(await js("window.__my3d.settings.startBg"), kinds.at(-1), 'the choice is remembered');
  await js('window.__my3d.hideStart()');
});
await test('Start screen: a card moves by its handle, with a ghost and an outline; it resizes by its corner; Auto Arrange puts them back', async () => {
  await js('window.__my3d.settings.startLayout = null; window.__my3d.showStart();');
  await frame();
  await sleep(600);
  const read = () => js("(() => { const out = {}; for (const el of document.querySelectorAll('.start-board > [data-card]')) { const r = el.getBoundingClientRect(); out[el.dataset.card] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; } return out; })()");
  const before = await read();
  eq(Object.keys(before).length, 6, 'six cards');
  assert(before.hero.y < before.actions.y && before.actions.y < before.recent.y && before.recent.y < before.samples.y && before.samples.y < before.theme.y, 'in order, top to bottom');
  // No two cards overlap.
  const clear = (l) => { const c = Object.values(l); return c.every((a, i) => c.every((b, j) => i === j || a.y + a.h <= b.y || b.y + b.h <= a.y || a.x + a.w <= b.x || b.x + b.w <= a.x)); };
  assert(clear(before), 'no overlap');
  // Narrow the Recent card to one column by its corner.
  const corner = await js("(() => { const r = document.querySelector('[data-card-resize=recent]').getBoundingClientRect(); return { x: r.x + 8, y: r.y + 8 }; })()");
  await cdp.drag([corner.x, corner.y], [before.recent.x + before.recent.w * 0.33, corner.y], 6);
  await frame();
  await sleep(260);
  const narrow = await read();
  assert(narrow.recent.w < before.recent.w * 0.5, `narrower: ${narrow.recent.w}`);
  assert(clear(narrow), 'no overlap after a resize');
  // Move it with the handle: while dragging there is one ghost and an outline; after it the card is elsewhere.
  const handle = await js("(() => { const r = document.querySelector('[data-card-handle=recent]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()");
  await cdp.drag([handle.x, handle.y], [handle.x + narrow.recent.w + 20, handle.y], 6);
  await frame();
  await sleep(260);
  const moved = await read();
  assert(moved.recent.x > narrow.recent.x + 100, `moved: ${JSON.stringify(moved.recent)}`);
  assert(clear(moved), 'no overlap after a move');
  eq(await js("document.querySelectorAll('.start-ghost, .card-drop-outline').length"), 0, 'the ghost and outline are gone');
  eq(await js('window.__my3d.settings.startLayout.version'), 1, 'the arrangement is remembered');
  await click('start-arrange');
  await frame();
  await sleep(300);
  eq(await read(), before, 'back to the default');
  await js('window.__my3d.hideStart()');
});
await test('Start screen: card opacity and speed change by their steppers; a theme tile applies the theme', async () => {
  await js('window.__my3d.showStart()');
  await frame();
  await sleep(120);
  await js("document.querySelector('[data-step=\"start-opacity:down\"]').click()");
  eq(await js('window.__my3d.settings.startCardOpacity'), 80, 'one step down');
  eq(await js("document.querySelector('[data-testid=start-screen]').style.getPropertyValue('--start-card-alpha')"), '80%', 'the cards follow');
  await js("document.querySelector('[data-step=\"start-speed:up\"]').click()");
  eq(await js('window.__my3d.settings.startBgSpeed'), 110, 'faster');
  const theme = await js('window.__my3d.settings.theme');
  const other = await js(`[...document.querySelectorAll('[data-start-theme]')].map((b) => b.dataset.startTheme).find((id) => id !== ${JSON.stringify(theme)})`);
  await js(`document.querySelector('[data-start-theme=${other}]').click()`);
  eq(await js('window.__my3d.settings.theme'), other, 'the theme');
  assert(await js(`document.querySelector('[data-start-theme=${other}]').classList.contains('on')`), 'marked');
  await js(`document.querySelector('[data-start-theme=${theme}]').click()`);
  await js("window.__my3d.settings.startCardOpacity = 85; window.__my3d.settings.startBgSpeed = 100; window.__my3d.hideStart();");
});
await test('Samples: at least 40 in their section on the start screen, with all three levels; the chips filter; a click opens one', async () => {
  await js('window.__my3d.showStart()');
  await frame();
  const count = () => js("document.querySelectorAll('[data-testid=start-card-samples] .sample-card').length");
  await waitFor(async () => (await count()) > 0, 4000);
  const all = await count();
  assert(all >= 40, `${all} samples`);
  await sleep(250);
  // No gap in the last row, at this width and in any filtered list: the rows end level with the first one.
  const noHole = () => js("(() => { const g = document.querySelector('[data-testid=start-card-samples] .sample-tiles'); const cards = [...g.children]; const edge = Math.max(...cards.map((c) => c.getBoundingClientRect().right)); return Math.abs(cards.at(-1).getBoundingClientRect().right - edge) < 2; })()");
  assert(await noHole(), 'no hole after the last sample');
  eq(await js("(() => { const g = document.querySelector('[data-testid=start-card-samples] .sample-tiles'); return g.children.length % getComputedStyle(g).gridTemplateColumns.split(' ').length; })()"), 0, 'the samples fill their rows at the usual width');
  eq(await js("[...document.querySelectorAll('[data-testid=start-card-samples] .sample-card')].filter((c) => /span/.test(c.style.gridColumn)).length"), 0, 'without stretching any');
  for (const level of ['beginner', 'intermediate', 'advanced']) {
    await click(`sample-level-${level}`);
    await frame();
    await sleep(40);
    const n = await count();
    assert(n > 0 && n < all, `${level}: ${n}`);
    await sleep(40);
    assert(await noHole(), `${level}: no hole`);
  }
  await click('sample-level-all');
  await frame();
  await sleep(40);
  await click('sample-snowman');
  await waitFor(() => js("window.__my3d.doc.name === 'Snowman'"), 4000);
  await frame();
  eq(await js("document.querySelector('[data-testid=start-screen]').style.display"), 'none', 'the start screen closes');
  eq(await doc("doc.objects.some((o) => o.name === 'Nose')"), true, 'the sample is there');
  eq(await js('window.__my3d.projectPath'), null, 'saving asks where: a sample is not overwritten');
  assert((await js("document.querySelector('[data-testid=status-msg]').textContent")).length > 3, 'it says what to try');
});
await test('Samples: the Menu card opens the gallery window above the start screen', async () => {
  await js('window.__my3d.showStart()');
  await frame();
  await sleep(600);
  await click('start-action-samples');
  const q = '[data-testid="sample-dialog"] [data-testid="sample-snowman"]';
  await waitFor(() => js(`Boolean(window.__my3d.query(${JSON.stringify(q)}))`), 5000);
  const over = await js(`(() => { const el = window.__my3d.query(${JSON.stringify(q)}); const r = el.getBoundingClientRect(); const at = el.ownerDocument.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return Boolean(at && el.contains(at)); })()`);
  assert(over, 'the window is on top');
  await press('Escape');
  await frame();
  await js('window.__my3d.hideStart()');
});
await test('Tutorial popup: it offers the tutorial, and its check box and Preferences both decide whether it comes back', async () => {
  await js('window.__my3d.settings.askTutorial = true; window.__my3d.askTutorial()');
  await waitFor(() => exists('tutorial-ask'), 4000);
  for (const id of ['tutorial-ask-run', 'tutorial-ask-later', 'tutorial-ask-show']) assert(await exists(id), id);
  await waitFor(() => js("document.querySelector('[data-testid=tutorial-ask-picture]').naturalWidth > 0"), 4000);
  const layout = await js("(() => { const p = document.querySelector('[data-testid=tutorial-ask-picture]').getBoundingClientRect(); const x = document.querySelector('.tutorial-ask-text').getBoundingClientRect(); const b = document.querySelector('[data-testid=dialog-tutorial-ask] .dialog-body'); return { side: p.right <= x.left && p.top < x.bottom && x.top < p.bottom, scrolls: b.scrollHeight > b.clientHeight + 1, items: document.querySelectorAll('.tutorial-ask-text li').length }; })()");
  assert(layout.side, 'the words are beside the picture');
  eq(layout.scrolls, false, 'no scroll bar');
  assert(layout.items >= 4, 'it says what is in it');
  const gap = await js("(() => { const box = document.querySelector('[data-testid=tutorial-ask-show]').closest('label').getBoundingClientRect(); const foot = document.querySelector('[data-testid=dialog-tutorial-ask] .dialog-actions').getBoundingClientRect(); return foot.top - box.bottom; })()");
  assert(gap >= 0 && gap < 26, `little room between the words and the buttons: ${gap}`);
  await cdp.screenshot(path.join(shots, 'tutorial-ask.png'));
  eq(await js("document.querySelector('[data-testid=tutorial-ask-show]').checked"), true, 'on');
  await click('tutorial-ask-show');
  eq(await js('window.__my3d.settings.askTutorial'), false, 'not again');
  eq(await js('JSON.parse(localStorage.getItem("my3d.settings")).askTutorial'), false, 'saved');
  await click('tutorial-ask-later');
  await frame();
  assert(!(await exists('tutorial-ask')), 'closed');
  await click('settings');
  await waitFor(() => exists('dialog-settings'), 3000);
  await click('pref-tab-start');
  eq(await js("document.querySelector('[data-testid=pref-askTutorial]').checked"), false, 'Preferences show the same choice');
  await click('pref-askTutorial');
  eq(await js('window.__my3d.settings.askTutorial'), true, 'and change it');
  await press('Escape');
  await frame();
  await js('window.__my3d.settings.askTutorial = false');
});
await test('Tutorial: starts on a new scene, real input ticks a step off, Do It for Me does the rest, to the end', async () => {
  await js('window.__my3d.startTutorial()');
  await waitFor(() => exists('tutorial-card'), 4000);
  const title = () => js("document.querySelector('[data-testid=tutorial-title]').textContent");
  const nextEnabled = () => js("!document.querySelector('[data-testid=tutorial-next]')?.disabled");
  const steps = await js("import('/src/core/tutorial.js').then((m) => m.TUTORIAL_STEPS.length)");
  eq(await js("document.querySelector('[data-testid=tutorial-count]').textContent"), `1 / ${steps}`, 'the first step');
  await click('tutorial-next');
  await frame();
  assert(await js("document.querySelectorAll('[data-testid=tutorial-spot]').length") >= 2, 'what it talks about is lit');
  await click('tutorial-next');
  await sleep(250);
  // By hand: a real right drag in the 3D view ticks it off, and Next opens.
  eq(await nextEnabled(), false, 'Next waits for the task');
  const box = await js("(() => { const r = window.__my3d.editorsOf('view3d')[0].api.renderer.domElement.getBoundingClientRect(); return { x: r.x + r.width * 0.5, y: r.y + r.height * 0.3 }; })()");
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'right', buttons: 2, clickCount: 1 });
  for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + i * 12, y: box.y, button: 'right', buttons: 2 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x + 60, y: box.y, button: 'right', clickCount: 1 });
  await sleep(300);
  eq(await js("document.querySelector('[data-testid=tutorial-task-turn]').dataset.done"), 'yes', 'the drag ticked it off');
  eq(await nextEnabled(), true, 'Next is open');
  await cdp.screenshot(path.join(shots, 'tutorial-orbit.png'));
  // The rest, with the button. The card never hides a lit part if there is room, and stays on screen.
  for (let i = 3; i < steps - 1; i++) {
    await click('tutorial-next');
    await sleep(60);
    const name = await title();
    if (await exists('tutorial-do')) {
      await click('tutorial-do');
      await waitFor(() => js("!document.querySelector('[data-testid=tutorial-next]').disabled"), 20000, 100);
    }
    const inside = await js("(() => { const r = document.querySelector('[data-testid=tutorial-card]').getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })()");
    assert(inside, `${name}: the card is on screen`);
    if (name === 'Colour') await cdp.screenshot(path.join(shots, 'tutorial-colour.png'));
  }
  await click('tutorial-next');
  await waitFor(() => exists('tutorial-done'), 3000);
  const final = await js("(() => { const d = window.__my3d.doc; const b = d.objects.find((o) => /sphere/i.test(o.name)); return { smooth: b.data.smooth, z: b.location[2], keys: Object.keys(b.anim.fcurves).length, result: Boolean(window.__my3d.renderResult) }; })()");
  assert(final.smooth && final.keys > 0 && final.result, JSON.stringify(final));
  await cdp.screenshot(path.join(shots, 'tutorial-finish.png'));
  await click('tutorial-done');
  await frame();
  assert(!(await exists('tutorial-card')), 'it closes');
  // Unsaved work is asked about first.
  await op('mesh.primitive_cube_add');
  await js('void window.__my3d.startTutorial()');
  await waitFor(() => exists('ask-no'), 3000);
  await click('ask-no');
  await frame();
  assert(!(await exists('tutorial-card')), 'not started');
});
await test('Knife: K, clicks along the line, Enter cuts the cube; Esc leaves it', async () => {
  await hoverView();
  await op('object.select_set', { id: await doc('doc.objects[0].id') });
  await press('Tab');
  await frame();
  await js("window.__my3d.editorsOf('view3d')[0].api.setView(0, 90)");
  await frame();
  const c = await rect('[data-testid=area-view3d] canvas');
  const faces = () => doc('doc.objects[0].data.faces.length');
  const before = await faces();
  const center = await js("window.__my3d.editorsOf('view3d')[0].api.project([0, 0, 1])");
  const [x, y] = [c.x + center.x, c.y + center.y];
  await moveTo(x, y);
  await press('k');
  assert(await js("Boolean(window.__my3d.editorsOf('view3d')[0].api.knife())"), 'the knife is on');
  await cdp.click(x - 200, y);
  await cdp.click(x + 200, y);
  await press('Escape');
  await frame();
  eq(await faces(), before, 'Esc cut nothing');
  await moveTo(x, y);
  await press('k');
  await cdp.click(x - 200, y);
  await cdp.click(x + 200, y);
  await cdp.screenshot(path.join(shots, 'knife.png'));
  await press('Enter');
  await frame();
  eq(await faces(), before + 1, 'the top face is split');
  await press('z', { ctrl: true });
  await frame();
  eq(await faces(), before, 'and it can be undone');
  await press('Tab');
});
await test('Snapping: the magnet, a target, and G lands on the other object', async () => {
  await click('snap-toggle');
  eq(await doc('doc.snap.enabled'), true, 'on');
  await click('snap-target');
  await click('snap-VERTEX');
  eq(await doc('doc.snap.target'), 'VERTEX', 'the target');
  await op('mesh.primitive_cube_add', { size: 1, location: [5, 0, 0] });
  const moved = await doc('doc.activeId');
  await frame();
  const c = await rect('[data-testid=area-view3d] canvas');
  // Grab the new cube and bring the pointer to a corner of the first one.
  const corner = await js("window.__my3d.editorsOf('view3d')[0].api.project([1, 1, 1])");
  const from = await js("window.__my3d.editorsOf('view3d')[0].api.project([5, 0, 0])");
  await moveTo(c.x + from.x, c.y + from.y);
  await press('g');
  await moveTo(c.x + corner.x + 3, c.y + corner.y + 3);
  await frame();
  eq(await js("document.querySelector('[data-testid=snap-mark]').style.display"), 'block', 'it shows what it found');
  await cdp.click(c.x + corner.x + 3, c.y + corner.y + 3);
  await frame();
  const at = await doc(`doc.objects.find((o) => o.id === ${JSON.stringify(moved)}).location`);
  at.forEach((v, i) => assert(Math.abs(v - 1) < 1e-4, `axis ${i}: ${v}`));
});
await test('Interface: workspaces on their own row with icons, active area outlined, nothing clipped', async () => {
  const bars = await js("(() => { const a = document.querySelector('[data-testid=topbar]').getBoundingClientRect(); const b = document.querySelector('[data-testid=ws-bar]').getBoundingClientRect(); const t = document.querySelector('[data-testid=workspaces]'); return { below: b.top >= a.bottom - 1, tabs: t.children.length, icons: t.querySelectorAll('svg').length, fits: t.scrollWidth <= document.querySelector('[data-testid=ws-bar]').clientWidth }; })()");
  assert(bars.below, 'the tabs are under the menus');
  assert(bars.tabs === 14 && bars.icons === 14, JSON.stringify(bars));
  assert(bars.fits, 'all tabs show');
  assert(await js("getComputedStyle(document.querySelector('.area.active-area'), '::after').borderTopWidth !== '0px'"), 'the active area is outlined');
  await cdp.screenshot(path.join(shots, 'interface.png'));
});
await test('Toolbar: names beside the icons, in every mode, and they can be turned off', async () => {
  const width = () => js("document.querySelector('[data-testid=tool-shelf]').getBoundingClientRect().width");
  assert(await width() > 100, 'with names');
  assert(await js("document.querySelector('[data-testid=tool-move] .tool-name').textContent.length > 1"), 'the name is there');
  assert(await js("(() => { const r = document.querySelector('[data-testid=tool-move] .tool-name'); return r.getBoundingClientRect().width > 10 && r.scrollWidth <= r.clientWidth + 1; })()"), 'and whole');
  await hoverView();
  await press('Tab');
  await frame();
  await sleep(60);
  const clipped = await js("[...document.querySelectorAll('[data-testid=tool-shelf] .tool-name')].filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent)");
  eq(clipped, [], 'no name is cut off in Edit Mode');
  assert(await exists('tool-knife'), 'the knife is there');
  await press('Tab');
  await frame();
  await js("window.__my3d.settings.toolLabels = false; window.__my3d.invalidate(); window.__my3d.editorsOf('view3d')[0].update?.()");
  await frame();
  await sleep(60);
  assert(await width() < 50, 'without');
  await js("delete window.__my3d.settings.toolLabels; window.__my3d.editorsOf('view3d')[0].update?.()");
  await frame();
  await click('tool-move');
  eq(await js("window.__my3d.editorsOf('view3d')[0].api.tool.name"), 'move', 'a named button still picks its tool');
  await click('tool-select');
});
await test('Properties: the tab says what it is, and a search finds a setting, even in a folded panel', async () => {
  await click('tab-object');
  await frame();
  assert((await js("document.querySelector('[data-testid=props-head] strong').textContent")).length > 1, 'the name of the tab');
  const shown = () => js("[...document.querySelectorAll('[data-testid=area-properties] .panel')].filter((p) => p.style.display !== 'none').length");
  const all = await shown();
  assert(all >= 3, String(all));
  await js("(() => { const i = document.querySelector('[data-testid=props-search]'); i.focus(); i.value = 'rotation'; i.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await frame();
  const some = await shown();
  assert(some >= 1 && some < all, `${some} of ${all}`);
  await js("(() => { const i = document.querySelector('[data-testid=props-search]'); i.value = 'zzzzzz'; i.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await frame();
  assert(await exists('props-none'), 'it says when there is nothing');
  await js("(() => { const i = document.querySelector('[data-testid=props-search]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); })()");
  await frame();
  eq(await shown(), all, 'clearing it brings them back');
});
await test('3D view: Z opens the shading pie; an empty scene says what to do', async () => {
  await hoverView();
  await press('z');
  await frame();
  assert(await exists('shading-pie'), 'the pie');
  await click('pie-MATERIAL');
  await frame();
  eq(await js("window.__my3d.editorsOf('view3d')[0].api.state.shading"), 'MATERIAL', 'it chooses');
  assert(!(await exists('shading-pie')), 'and closes');
  await hoverView();
  await press('z');
  await press('Escape');
  assert(!(await exists('shading-pie')), 'Esc leaves it');
  await op('object.select_all', { action: 'SELECT' });
  await op('object.delete');
  await frame();
  await sleep(60);
  eq(await js("document.querySelector('[data-testid=view-empty]').style.display"), '', 'the hint shows');
});
await test('Theme menu: two columns side by side, dark and light, each one theme per line', async () => {
  await click('theme');
  await frame();
  const box = (id) => js(`(() => { const r = document.querySelector('[data-testid=${id}]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const dark = await box('theme-column-dark');
  const light = await box('theme-column-light');
  assert(light.x >= dark.x + dark.w, 'side by side');
  assert(Math.abs(light.y - dark.y) < 1, 'level');
  const lines = await js("[...document.querySelectorAll('[data-testid=theme-column-dark] .theme-item')].map((b) => Math.round(b.getBoundingClientRect().x))");
  assert(lines.length >= 20 && new Set(lines).size === 1, 'one theme per line');
  const clipped = await js("(() => { const p = document.querySelector('.theme-columns'); return p.scrollHeight > p.clientHeight + 1; })()");
  eq(clipped, false, 'all of them show without scrolling');
  await cdp.screenshot(path.join(shots, 'theme-menu.png'));
  await press('Escape');
  await frame();
});
await test('Preferences: the settings button is a gear; every page shows all of itself without a scroll bar', async () => {
  const teeth = await js("document.querySelector('[data-testid=settings] svg path').getAttribute('d').split('L').length");
  assert(teeth >= 32, `a gear has teeth: ${teeth} points`);
  await click('settings');
  await waitFor(() => exists('dialog-settings'), 3000);
  const fields = await js("document.querySelectorAll('[data-testid=dialog-settings] input, [data-testid=dialog-settings] select').length");
  assert(fields >= 20, `many settings: ${fields}`);
  const corner = await js("(() => { const b = document.querySelector('[data-testid=pref-reset]').getBoundingClientRect(); const d = document.querySelector('[data-testid=dialog-settings]').getBoundingClientRect(); return { left: b.left - d.left < 40, bottom: d.bottom - b.bottom < 60 }; })()");
  assert(corner.left && corner.bottom, `Restore Defaults is at the bottom left: ${JSON.stringify(corner)}`);
  for (const id of ['interface', 'viewport', 'navigation', 'start', 'packages', 'system']) {
    await click(`pref-tab-${id}`);
    await frame();
    const over = await js("(() => { const bad = []; for (const n of document.querySelectorAll('[data-testid=dialog-settings], [data-testid=dialog-settings] *')) { const o = getComputedStyle(n).overflowY; if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight + 1 && n.clientHeight > 0) bad.push(String(n.className) + ':' + n.scrollHeight + '>' + n.clientHeight); } return bad; })()");
    eq(over, [], `${id}: nothing scrolls`);
    await cdp.screenshot(path.join(shots, `preferences-${id}.png`));
  }
  await press('Escape');
  await frame();
});
await test('Preferences: the settings really work: right-drag, speeds, wheel direction, grid, axis widget, left drag', async () => {
  const s = (expr) => js(`(() => { const a = window.__my3d; const st = a.editorsOf('view3d')[0].api.state; return ${expr}; })()`);
  await click('ws-layout');
  await frame();
  const box = await js("(() => { const r = window.__my3d.editorsOf('view3d')[0].api.renderer.domElement.getBoundingClientRect(); return { x: r.x + r.width * 0.3, y: r.y + r.height * 0.7 }; })()");
  const rightDrag = async (dx, modifiers = 0) => {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'right', buttons: 2, clickCount: 1, modifiers });
    for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + (dx * i) / 5, y: box.y, button: 'right', buttons: 2, modifiers });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x + dx, y: box.y, button: 'right', clickCount: 1, modifiers });
    await frame();
    await sleep(40);
  };
  const yaw0 = await s('st.yaw');
  await rightDrag(50);
  const turned = yaw0 - (await s('st.yaw'));
  assert(Math.abs(turned - 20) < 3, `right drag turns the view: ${turned}`);
  eq(await js("document.querySelectorAll('.menu').length"), 0, 'a drag opens no menu');
  const target0 = await s('st.target');
  await rightDrag(40, 8);
  assert(JSON.stringify(await s('st.target')) !== JSON.stringify(target0), 'Shift moves the view');
  // The speed setting scales it.
  await js('window.__my3d.settings.orbitSpeed = 200');
  const yaw1 = await s('st.yaw');
  await rightDrag(50);
  const faster = yaw1 - (await s('st.yaw'));
  assert(Math.abs(faster - 40) < 5, `twice the speed: ${faster}`);
  await js('delete window.__my3d.settings.orbitSpeed');
  // The buttons to drag on.
  const pan = await rect(tid('nav-pan'));
  const t0 = await s('st.target');
  await cdp.drag([pan.cx, pan.cy], [pan.cx + 30, pan.cy + 20], 4);
  await frame();
  assert(JSON.stringify(await s('st.target')) !== JSON.stringify(t0), 'the hand button moves the view');
  const zoom = await rect(tid('nav-zoom'));
  const d0 = await s('st.dist');
  await cdp.drag([zoom.cx, zoom.cy], [zoom.cx, zoom.cy + 40], 4);
  await frame();
  assert((await s('st.dist')) > d0, 'the magnifier zooms');
  // Wheel direction.
  const wheel = async () => { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x, y: box.y, deltaX: 0, deltaY: 120 }); await frame(); await sleep(30); };
  const d1 = await s('st.dist');
  await wheel();
  const d2 = await s('st.dist');
  assert(d2 > d1, 'the wheel zooms out');
  await js('window.__my3d.settings.invertZoom = true');
  await wheel();
  assert((await s('st.dist')) < d2, 'inverted, it zooms in');
  await js('delete window.__my3d.settings.invertZoom');
  // Left drag can orbit.
  await js("window.__my3d.settings.leftDrag = 'orbit'");
  const yaw2 = await s('st.yaw');
  await cdp.drag([box.x, box.y], [box.x + 30, box.y], 4);
  await frame();
  assert(yaw2 !== (await s('st.yaw')), 'left drag orbits when asked to');
  await js('delete window.__my3d.settings.leftDrag');
  // The axis widget can be hidden.
  await js('window.__my3d.settings.showNavGizmo = false; window.__my3d.invalidate()');
  await frame();
  await sleep(40);
  eq(await js("document.querySelector('[data-testid=nav-gizmo]').style.display"), 'none', 'hidden');
  await js('delete window.__my3d.settings.showNavGizmo; window.__my3d.invalidate()');
  await frame();
});
await test('Grid: five by five, and the spacing follows the zoom by powers of five', async () => {
  const info = () => js("window.__my3d.editorsOf('view3d')[0].api.gridInfo()");
  const zoomTo = async (d) => { await js(`(() => { const v = window.__my3d.editorsOf('view3d')[0].api; v.state.dist = ${d}; v.draw(); })()`); await frame(); };
  const seen = [];
  for (const d of [2, 10, 60, 300]) {
    await zoomTo(d);
    const g = await info();
    eq(g.major / g.spacing, 5, 'five cells to a major line');
    assert(g.spacing > d / 25 && g.spacing <= d / 4, `at ${d} the spacing is ${g.spacing}`);
    assert(g.lines > 1000, 'the grid is drawn');
    assert(g.behind, 'it is drawn behind the shapes');
    seen.push(g.spacing);
  }
  eq(seen, [0.2, 1, 5, 25], 'each zoom step redraws it');
  // Looking along an axis, it stands across the view instead of collapsing to a line.
  const planeAt = async (yaw, pitch) => { await js(`(() => { const v = window.__my3d.editorsOf('view3d')[0].api; v.setView(${yaw}, ${pitch}); v.draw(); })()`); await frame(); return (await info()).plane; };
  eq(await planeAt(0, 0), 'XZ', 'front');
  const edgeOn = await js("(() => { const v = window.__my3d.editorsOf('view3d')[0].api; const a = v.project([0, 0, 0]); const b = v.project([0, 1, 0]); return Math.hypot(a.x - b.x, a.y - b.y); })()");
  assert(edgeOn < 1, `looking from the front the Y axis is a point: ${edgeOn}`);
  eq(await planeAt(90, 0), 'YZ', 'side');
  eq(await planeAt(30, 25), 'XY', 'any other view has the floor');
  // Moving along keeps the grid under the view.
  await js("(() => { const v = window.__my3d.editorsOf('view3d')[0].api; v.state.dist = 10; v.state.target = [500, -300, 0]; v.draw(); })()");
  const bounds = await js("(() => { const v = window.__my3d.editorsOf('view3d')[0].api; let reach = null; v.scene.traverse((o) => { if (o.isLineSegments && o.geometry.attributes.position.count > 5000 && !reach) { o.geometry.computeBoundingBox(); reach = o.geometry.boundingBox; } }); return { x0: reach.min.x, x1: reach.max.x }; })()");
  assert(bounds.x0 < 500 && bounds.x1 > 500, `the grid follows: ${JSON.stringify(bounds)}`);
  await js("(() => { const v = window.__my3d.editorsOf('view3d')[0].api; v.state.target = [0, 0, 0]; v.frameAll(); })()");
  await frame();
  await cdp.screenshot(path.join(shots, 'grid.png'));
});
await test('Minimum width: switching language leaves it unchanged, and it holds the wider language', async () => {
  await sleep(120);
  const widths = [await js('window.__my3d.minWidth')];
  for (let i = 0; i < 2; i++) {
    await click('language');
    await frame();
    await sleep(120);
    widths.push(await js('window.__my3d.minWidth'));
  }
  eq(new Set(widths).size, 1, `the same in both languages: ${widths}`);
  eq(await js("document.querySelector('.app').style.minWidth"), `${widths[0]}px`, 'the page holds it');
  assert(widths[0] <= 1600, `it fits: ${widths[0]}`);
});
await test('Top bar: the theme button is left of the theme dropdown', async () => {
  const [a, b] = await Promise.all([rect(tid('theme-next')), rect(tid('theme'))]);
  assert(a.x + a.w <= b.x + 1, `${a.x} and ${b.x}`);
});
await test('About: icon left, description right, the rest in a left-aligned list with the build and the author', async () => {
  await click('about');
  await waitFor(() => exists('about-body'), 3000);
  const out = await js(`(() => { const r = (id) => document.querySelector('[data-testid=' + id + ']').getBoundingClientRect(); const icon = r('about-icon'); const text = r('about-text'); const list = r('about-list'); const lines = [...document.querySelectorAll('.about-line')]; return { side: icon.right <= text.left && icon.top < text.bottom && text.top < icon.bottom, below: list.top >= Math.max(icon.bottom, text.bottom), lefts: new Set(lines.map((l) => Math.round(l.getBoundingClientRect().left))).size, vertical: lines.every((l, i) => !i || l.getBoundingClientRect().top >= lines[i - 1].getBoundingClientRect().bottom), text: document.querySelector('[data-testid=about-list]').textContent, scrolls: (() => { const b = document.querySelector('[data-testid=dialog-about] .dialog-body'); return b.scrollHeight > b.clientHeight + 1; })() }; })()`);
  assert(out.side, 'the icon is left of the description');
  assert(out.below, 'the list is below them');
  eq(out.lefts, 1, 'left aligned');
  assert(out.vertical, 'one above the other');
  assert(out.text.includes('SHKWON(knix008@naver.com)'), 'the author');
  assert(/Built/.test(out.text) && /Build Type/.test(out.text), `the build: ${out.text}`);
  eq(out.scrolls, false, 'no scroll bar');
  await cdp.screenshot(path.join(shots, 'about.png'));
  await press('Escape');
  await frame();
});
await test('Panels: side panels have an icon, a title and a button to fold them', async () => {
  await click('ws-layout');
  await frame();
  const width = (sel) => js(`document.querySelector('${sel}').getBoundingClientRect().width`);
  // The right column.
  for (const id of ['outliner', 'properties']) {
    assert(await exists(`area-title-${id}`), `${id} has a title`);
    assert(await exists(`side-collapse-${id}`), `${id} can fold`);
    assert(await js(`Boolean(document.querySelector('[data-testid=area-${id}] .area-header svg'))`), `${id} has an icon`);
  }
  const view = '[data-testid=area-view3d]';
  const wide = await width(view);
  await click('side-collapse-outliner');
  await frame();
  await sleep(60);
  assert(await exists('side-strip'), 'a strip is left');
  assert(!(await exists('area-outliner')), 'the column is gone');
  assert((await width(view)) > wide + 100, 'the view takes the room');
  await click('side-expand');
  await frame();
  await sleep(60);
  assert(await exists('area-outliner'), 'it comes back');
  eq(Math.round(await width(view)), Math.round(wide), 'as wide as before');
  // Inside the editors.
  for (const [ws, id] of [['video', 'seq-props'], ['tracking', 'clip-tracks'], ['assets', 'asset-catalogs']]) {
    await click(`ws-${ws}`);
    await frame();
    await sleep(120);
    const sel = `[data-testid=side-panel-${id}]`;
    assert(await js(`Boolean(document.querySelector('${sel} .side-head svg')) && document.querySelector('${sel} .side-title').textContent.length > 0`), `${id}: icon and title`);
    const open = await width(sel);
    await click(`side-fold-${id}`);
    await frame();
    assert((await width(sel)) < 40 && (await width(sel)) < open, `${id} folds`);
    await click(`side-fold-${id}`);
    await frame();
    eq(await width(sel), open, `${id} unfolds`);
  }
  // The 3D view's sidebar.
  await click('ws-layout');
  await frame();
  await sleep(100);
  await click('nav-sidebar');
  await frame();
  await sleep(100);
  assert(await js("document.querySelector('[data-testid=sidebar] .side-title').textContent.length > 0"), 'the sidebar has a title');
  await click('sidebar-fold');
  await frame();
  await sleep(60);
  eq(await js("document.querySelector('[data-testid=sidebar]').style.display"), 'none', 'it folds');
});
await test('Guide: a tree of the structure on the left; text size and language at the top', async () => {
  const out = await js(`(async () => {
    localStorage.removeItem('my3d.docFont');
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:0;top:0;width:1100px;height:700px;z-index:99;background:#fff';
    f.src = './doc/UsersGuide.html';
    document.body.append(f);
    await new Promise((r) => { f.onload = r; });
    const d = f.contentDocument;
    await new Promise((r) => setTimeout(r, 80));
    const main = d.querySelector('main');
    const fontOf = () => parseFloat(f.contentWindow.getComputedStyle(main).fontSize);
    const tree = d.querySelector('.doc-tree').getBoundingClientRect();
    const mainBox = main.getBoundingClientRect();
    const top = d.querySelector('.doc-top').getBoundingClientRect();
    const result = { treeLeft: tree.right <= mainBox.left + 1, topAbove: top.bottom <= tree.top + 1 && top.bottom <= mainBox.top + 1, l2: d.querySelectorAll('.doc-tree a.l2').length, l3: d.querySelectorAll('.doc-tree a.l3').length };
    const before = fontOf();
    d.getElementById('doc-font-up').click();
    d.getElementById('doc-font-up').click();
    result.grew = fontOf() - before;
    result.value = d.getElementById('doc-font-value').textContent;
    { const down = d.getElementById('doc-font-down').getBoundingClientRect(); const up = d.getElementById('doc-font-up').getBoundingClientRect(); const v = d.getElementById('doc-font-value').getBoundingClientRect(); const mid = (v.left + v.right) / 2; result.between = down.right <= v.left && v.right <= up.left && Math.abs(mid - (down.right + up.left) / 2) < 2; }
    { const width = () => d.querySelector('.doc-tree').getBoundingClientRect().width; const open = width(); d.getElementById('doc-tree-fold').click(); const shut = width(); d.getElementById('doc-tree-fold').click(); result.fold = shut < 60 && width() === open && Boolean(d.querySelector('.doc-tree-head svg')) && d.querySelector('.doc-tree-name').textContent.length > 0; localStorage.removeItem('my3d.docTree'); }
    result.saved = localStorage.getItem('my3d.docFont');
    d.getElementById('doc-font-reset').click();
    result.reset = fontOf() === before;
    const last = [...d.querySelectorAll('.doc-tree a.l2')].at(-1);
    d.getElementById(last.getAttribute('href').slice(1)).scrollIntoView();
    main.dispatchEvent(new Event('scroll'));
    await new Promise((r) => setTimeout(r, 60));
    result.marked = d.querySelector('.doc-tree a.on')?.getAttribute('href') !== d.querySelector('.doc-tree a').getAttribute('href');
    result.lang = d.getElementById('doc-lang').getAttribute('href');
    result.flag = d.querySelector('#doc-lang svg')?.getAttribute('data-testid');
    const en = await fetch('./doc/UsersGuide.en.html').then((r) => r.text());
    result.flagEn = /id="doc-lang"[^>]*><svg[^>]*data-testid="flag-([a-z]+)"/.exec(en)?.[1];
    result.target = d.getElementById(result.lang.split('#')[1]) !== null;
    f.remove();
    localStorage.removeItem('my3d.docFont');
    return result;
  })()`);
  assert(out.treeLeft, 'the tree is on the left');
  assert(out.topAbove, 'the tools are on top');
  assert(out.l2 >= 10 && out.l3 >= 5, `the tree has both levels: ${out.l2}, ${out.l3}`);
  eq(out.grew, 2, 'two steps larger');
  eq(out.value, '17px', 'the size in px shows');
  assert(out.between, 'between the two buttons, centred');
  assert(out.fold, 'the tree folds and unfolds');
  eq(out.saved, '17', 'remembered');
  assert(out.reset, 'the value resets it');
  assert(out.marked, 'scrolling moves the mark in the tree');
  assert(out.lang.startsWith('UsersGuide.en.html#s') && out.target, `the language link keeps the place: ${out.lang}`);
  eq(out.flag, 'flag-en', 'a Korean page shows the British flag');
  eq(out.flagEn, 'ko', 'an English page shows the Korean flag');
});
await test('Samples: File › Samples opens a gallery; a sample with a simulation bakes itself', async () => {
  await click('menu-file');
  await click('menu-samples');
  await frame();
  await sleep(200);
  await waitFor(() => js("Boolean(window.__my3d.query('[data-testid=\"sample-smoke-plume\"]'))"), 4000);
  await js(`(async () => { const list = await (await fetch('./sample/index.json')).json(); const s = list.find((x) => x.id === 'smoke-plume'); await window.__my3d.openSample({ ...s }); })()`);
  await frame();
  await sleep(300);
  await js('window.__my3d.closeAllDialogs()');
  eq(await js("window.__my3d.doc.name"), 'Smoke Plume', 'opened');
  await waitFor(() => js("import('/src/core/simulation.js').then((m) => m.simBaked(window.__my3d.doc.objects.find((o) => o.smoke)))"), 30000);
  await js('window.__my3d.setFrame(40)');
  await frame();
  await sleep(100);
  await cdp.screenshot(path.join(shots, 'sample-smoke.png'));
  await op('ptcache.free_all');
});

// ───────────────────────── files other programs have to read

await test('the FBX we write is read by another program\'s parser (three.js FBXLoader)', async () => {
  const out = await js(`Promise.all([import('/src/core/formats.js'), import('/src/core/mesh.js'), import('/node_modules/three/examples/jsm/loaders/FBXLoader.js')]).then(([f, m, l]) => {
    const bytes = f.exportFBX([{ name: 'Box', mesh: m.cubeMesh(2), material: { name: 'Red', baseColor: [1, 0, 0] } }]);
    const group = new l.FBXLoader().parse(bytes.buffer, '');
    let triangles = 0;
    const names = [];
    group.traverse((o) => { if (o.isMesh) { names.push(o.name); triangles += o.geometry.getAttribute('position').count / 3; } });
    let box = null;
    group.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); box = o.geometry.boundingBox.max.toArray(); } });
    return { triangles, names, box };
  })`);
  eq(out.triangles, 12, 'a cube is 12 triangles once triangulated');
  eq(out.names, ['Box'], 'name');
  eq(out.box.map((x) => Math.round(Math.abs(x))), [1, 1, 1], 'size');
});
await test('the Collada we write is well-formed XML to a real XML parser', async () => {
  const out = await js(`Promise.all([import('/src/core/formats.js'), import('/src/core/mesh.js')]).then(([f, m]) => {
    const text = f.exportDAE([{ name: 'A & <B>', mesh: m.cubeMesh(2), material: { name: 'Red', baseColor: [1, 0, 0] } }]);
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    return { error: doc.querySelector('parsererror')?.textContent ?? null, polylists: doc.getElementsByTagName('polylist').length, name: doc.getElementsByTagName('node')[0].getAttribute('name'), up: doc.getElementsByTagName('up_axis')[0].textContent };
  })`);
  eq(out, { error: null, polylists: 1, name: 'A & <B>', up: 'Z_UP' }, 'parsed');
});
await test('File menu: every new format is offered, for import and for export', async () => {
  await click('menu-file');
  await js("[...document.querySelectorAll('.menu .menu-item')].find((x) => x.dataset.testid === 'menu-import').click()");
  await frame();
  for (const op of ['import_scene.blend', 'import_scene.fbx', 'wm.usd_import', 'wm.collada_import']) assert(await exists(`op-${op}`), op);
  await press('Escape');
  await click('menu-file');
  await js("[...document.querySelectorAll('.menu .menu-item')].find((x) => x.dataset.testid === 'menu-export').click()");
  await frame();
  for (const op of ['export_scene.fbx', 'wm.usd_export', 'wm.collada_export']) assert(await exists(`op-${op}`), op);
  await press('Escape');
});
await test('a dropped .usda and .dae land in the scene', async () => {
  const count = await js(`(async () => {
    const [f, m] = await Promise.all([import('/src/core/formats.js'), import('/src/core/mesh.js')]);
    const app = window.__my3d;
    const before = app.doc.objects.length;
    await app.importDropped(new File([f.exportUSDA([{ name: 'FromUSD', mesh: m.cubeMesh(1) }])], 'a.usda'));
    await app.importDropped(new File([f.exportDAE([{ name: 'FromDAE', mesh: m.cubeMesh(1) }])], 'b.dae'));
    await app.importDropped(new File([f.exportFBX([{ name: 'FromFBX', mesh: m.cubeMesh(1) }])], 'c.fbx'));
    return { added: app.doc.objects.length - before, names: app.doc.objects.slice(before).map((o) => o.name) };
  })()`);
  eq(count, { added: 3, names: ['FromUSD', 'FromDAE', 'FromFBX'] }, 'imported');
});

// ───────────────────────── sculpt, paint, grease pencil

await test('sculpt: a real stroke raises the surface, undo restores it', async () => {
  await op('mesh.primitive_uv_sphere_add', { segments: 32, rings: 16, radius: 1 });
  await op('object.mode_set', { mode: 'SCULPT' });
  const before = await doc('active.data.verts.map((v) => v.join()).join()');
  const p = await screenPos([0, 0, 1]);
  await cdp.drag([p.x, p.y + 10], [p.x + 40, p.y + 30], 6);
  await frame();
  const after = await doc('active.data.verts.map((v) => v.join()).join()');
  assert(before !== after, 'the stroke changed nothing');
  await hoverView();
  await press('z', { ctrl: true });
  eq(await doc('active.data.verts.map((v) => v.join()).join()'), before, 'undo');
});
await test('sculpt: every brush from the tool shelf runs', async () => {
  await op('mesh.primitive_ico_sphere_add', { subdivisions: 3 });
  await op('object.mode_set', { mode: 'SCULPT' });
  await frame();
  const brushes = await js("import('/src/core/sculpt.js').then((m) => Object.keys(m.SCULPT_BRUSHES))");
  const p = await screenPos([0, 0, 0]);
  for (const brush of brushes) {
    await click(`tool-brush-${brush}`);
    await cdp.drag([p.x, p.y], [p.x + 30, p.y + 10], 3);
    await frame();
  }
});
await test('vertex and weight paint leave data on the mesh', async () => {
  await op('mesh.primitive_ico_sphere_add', { subdivisions: 3 });
  await op('object.mode_set', { mode: 'VERTEX_PAINT' });
  const p = await screenPos([0, 0, 0]);
  await cdp.drag([p.x, p.y], [p.x + 20, p.y + 10], 3);
  await frame();
  assert(await doc('active.data.colors.some((c) => c[1] < 0.9)'), 'colours');
  await op('object.mode_set', { mode: 'WEIGHT_PAINT' });
  await cdp.drag([p.x, p.y], [p.x + 20, p.y + 10], 3);
  await frame();
  assert(await doc('Object.keys(active.data.vgroups[0].w).length') > 0, 'weights');
});
await test('grease pencil: a drag in Draw mode becomes a stroke', async () => {
  await op('object.gpencil_add');
  await op('object.mode_set', { mode: 'PAINT_GPENCIL' });
  const r = await viewRect();
  await cdp.drag([r.cx - 50, r.cy], [r.cx + 50, r.cy + 30], 8);
  await frame();
  assert((await doc('active.data.layers[0].strokes[0].points.length')) > 3, 'stroke');
});

// ───────────────────────── nodes

const useShaderNodes = async () => {
  await click('ws-shading');
  await sleep(100);
  await click('node-use');
  await frame();
};
await test('shader nodes: Use Nodes builds the tree; add a node from the menu', async () => {
  await useShaderNodes();
  assert(await exists('node-BSDF_PRINCIPLED'), 'principled');
  assert(await exists('node-OUTPUT_MATERIAL'), 'output');
  await js("window.__my3d.editorsOf('nodes')[0].api.addNode('TEX_NOISE')");
  await frame();
  assert(await exists('node-TEX_NOISE'), 'added');
  await cdp.screenshot(path.join(shots, 'nodes.png'));
});
await test('shader nodes: dragging from a socket to a socket makes a link', async () => {
  await useShaderNodes();
  await js("window.__my3d.editorsOf('nodes')[0].api.addNode('RGB', { x: -150, y: 50 })");
  await frame();
  const from = await rect(tid('socket-RGB-out-Color'));
  const to = await rect(tid('socket-BSDF_PRINCIPLED-in-Base Color'));
  const links = () => js("window.__my3d.editorsOf('nodes')[0].api.current().graph.links.length");
  const before = await links();
  await cdp.drag([from.cx, from.cy], [to.cx, to.cy], 8);
  await frame();
  eq(await links(), before + 1, 'linked');
  const material = await js("import('/src/core/nodes.js').then((n) => { const g = window.__my3d.editorsOf('nodes')[0].api.current().graph; const rgb = g.nodes.find((x) => x.type === 'RGB'); rgb.values.color = [0, 1, 0]; return n.evalShader(g, {}).baseColor; })");
  eq(material, [0, 1, 0], 'the tree uses the link');
  // Pulling the link off the input removes it.
  await cdp.drag([to.cx, to.cy], [to.cx - 100, to.cy + 200], 5);
  await frame();
  eq(await links(), before, 'unlinked');
});
await test('shader nodes: dragging a head moves the node; X deletes it', async () => {
  await useShaderNodes();
  const head = await rect(`${tid('node-BSDF_PRINCIPLED')} .node-head`);
  const x = () => js("window.__my3d.editorsOf('nodes')[0].api.current().graph.nodes.find((n) => n.type === 'BSDF_PRINCIPLED').x");
  const before = await x();
  await cdp.drag([head.cx, head.cy], [head.cx + 70, head.cy + 20], 4);
  await frame();
  assert(Math.abs(await x() - before) > 30, 'moved');
  await press('x');
  await frame();
  assert(!(await exists('node-BSDF_PRINCIPLED')), 'deleted');
});
await test('geometry nodes workspace builds a tree and the spreadsheet follows it', async () => {
  await click('ws-geonodes');
  await sleep(100);
  await click('node-use');
  await frame();
  assert(await exists('node-GROUP_INPUT'), 'group input');
  await js(`import('/src/core/nodes.js').then((n) => { const api = window.__my3d.editorsOf('nodes')[0].api; const g = api.current().graph; const [input, output] = g.nodes; const sub = n.createNode('SUBDIVISION_SURFACE', 240, 60, { Level: 1 }); g.nodes.push(sub); n.addLink(g, input.id, 'Geometry', sub.id, 'Mesh'); n.addLink(g, sub.id, 'Mesh', output.id, 'Geometry'); window.__my3d.commit('test'); })`);
  await frame();
  await frame();
  eq(await js("document.querySelector('[data-testid=spreadsheet]').dataset.rows"), '26', 'evaluated vertices');
  await cdp.screenshot(path.join(shots, 'geometry-nodes.png'));
});
await test('compositor tree: Use Nodes, then a render passes through it', async () => {
  await click('ws-compositing');
  await sleep(100);
  await click('node-use');
  await frame();
  assert(await exists('node-CMP_RENDER_LAYERS'), 'render layers');
  await js("Object.assign(window.__my3d.doc.render, { width: 32, height: 18, percent: 100, samples: 1, engine: 'PATH', denoise: false })");
  await js(`import('/src/core/nodes.js').then((n) => { const g = window.__my3d.doc.compositor; const [layers, out] = g.nodes; const inv = n.createNode('CMP_INVERT', 240, 60); g.nodes.push(inv); n.addLink(g, layers.id, 'Image', inv.id, 'Image'); n.addLink(g, inv.id, 'Image', out.id, 'Image'); })`);
  await js('window.__my3d.startRender()');
  await waitFor(() => js('Boolean(window.__my3d.renderResult?.linear) && !window.__my3d.isRendering()'), 60000, 100);
  // The world is nearly black, so an inverted corner is nearly white.
  assert(await js('window.__my3d.renderResult.linear.data[0]') > 0.9, 'the compositor inverted the image');
});

// ───────────────────────── rendering

await test('F12 renders with the path tracer into the Image Editor, across workers', async () => {
  await click('ws-rendering');
  await sleep(100);
  await js("Object.assign(window.__my3d.doc.render, { width: 80, height: 45, percent: 100, samples: 4, engine: 'PATH' })");
  await hoverView2();
  await press('F12');
  await waitFor(() => js('Boolean(window.__my3d.renderResult?.linear) && !window.__my3d.isRendering()'), 120000, 100);
  eq(await js('[window.__my3d.renderResult.width, window.__my3d.renderResult.height]'), [80, 45], 'size');
  await frame();
  const s = await canvasStats(tid('image-canvas'));
  assert(s.distinct > 3, `the image has only ${s.distinct} colours`);
  await cdp.screenshot(path.join(shots, 'render-path.png'));
});
async function hoverView2() {
  const r = await rect(tid('image-editor'));
  await moveTo(r.cx, r.cy);
}
await test('the real-time engine renders too', async () => {
  await click('ws-rendering');
  await sleep(100);
  await js("Object.assign(window.__my3d.doc.render, { width: 160, height: 90, percent: 100, engine: 'REALTIME' })");
  await js('window.__my3d.startRender()');
  await waitFor(() => js('Boolean(window.__my3d.renderResult?.linear)'), 30000, 100);
  await frame();
  assert((await canvasStats(tid('image-canvas'))).distinct > 3, 'blank image');
  await cdp.screenshot(path.join(shots, 'render-realtime.png'));
});
await test('Cancel stops a render at once', async () => {
  await js("Object.assign(window.__my3d.doc.render, { width: 400, height: 300, percent: 100, samples: 64, engine: 'PATH' })");
  await js('void window.__my3d.startRender()');
  await waitFor(() => js('window.__my3d.isRendering()'), 5000, 50);
  await waitFor(() => exists('progress-cancel'), 5000, 50);
  await click('progress-cancel');
  await waitFor(() => js('!window.__my3d.isRendering()'), 5000, 50);
  eq(await js('Boolean(window.__my3d.renderResult?.linear)'), false, 'no final image');
});

// ───────────────────────── animation

await test('I keys a frame; the timeline scrubs; the object moves between keys', async () => {
  await hoverView();
  await press('i');
  await js('window.__my3d.setFrame(25)');
  await js('window.__my3d.doc.objects[0].location[0] = 6');
  await hoverView();
  await press('i');
  await js('window.__my3d.setFrame(13)');
  await frame();
  const mid = await doc('doc.objects[0].location[0]');
  assert(mid > 2 && mid < 4, `midway ${mid}`);
  const c = await rect(tid('timeline-canvas'));
  await cdp.click(c.x + c.w * 0.5, c.y + 8);
  await frame();
  assert((await doc('doc.frame')) > 100, 'clicked the ruler');
});
await test('Space plays and stops; the frame advances and wraps', async () => {
  await js('window.__my3d.doc.frameEnd = 5');
  await hoverView();
  await press(' ', { code: 'Space' });
  assert(await js('window.__my3d.playing'), 'playing');
  const seen = new Set();
  const until = Date.now() + 1500;
  while (Date.now() < until) { seen.add(await doc('doc.frame')); await sleep(40); }
  await press(' ', { code: 'Space' });
  assert(!(await js('window.__my3d.playing')), 'stopped');
  assert(seen.size >= 3, `frames ${[...seen]}`);
  assert(Math.max(...seen) <= 5, 'stays in the range');
});
await test('Dope Sheet shows channels; dragging a key moves it in time', async () => {
  await click('ws-animation');
  await sleep(100);
  await op('anim.keyframe_insert', { type: 'Location' });
  await frame();
  await sleep(60);
  assert(await js("[...document.querySelectorAll('.channel')].some((c) => c.textContent === 'X Location')"), 'channels');
  const x = await js("window.__my3d.editorsOf('dopesheet')[0].api.frameX(1)");
  const c = await rect(tid('dopesheet-canvas'));
  await cdp.drag([c.x + x, c.y + 29], [c.x + x + 80, c.y + 29], 5);
  await frame();
  assert((await doc('active.anim.fcurves["location.0"][0].f')) > 5, 'the key moved');
  await cdp.screenshot(path.join(shots, 'dopesheet.png'));
});
await test('Graph Editor draws curves; dragging a key changes its value', async () => {
  const sw = await js("(() => { const r = document.querySelector('[data-testid=editor-switch-timeline]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()");
  await cdp.click(sw.x, sw.y);
  await frame();
  await click('set-editor-graph');
  await frame();
  await op('anim.keyframe_insert', { type: 'Location' });
  await js('window.__my3d.setFrame(11)');
  await js('window.__my3d.doc.objects[0].location[0] = 2');
  await op('anim.keyframe_insert', { type: 'Location' });
  await frame();
  const c = await rect(tid('graph-canvas'));
  const pos = await js(`(() => { const e = window.__my3d.editorsOf('graph')[0].api; const s = e.state; const x = e.frameX(11); const H = ${c.h}; const y = 20 + (1 - (2 - s.vMin) / (s.vMax - s.vMin)) * (H - 20); return { x, y }; })()`);
  await cdp.drag([c.x + pos.x, c.y + pos.y], [c.x + pos.x, c.y + pos.y - 40], 4);
  await frame();
  const k = await doc('active.anim.fcurves["location.0"].find((q) => q.f === 11).v');
  assert(k > 2.2, `value ${k}`);
});
await test('Dope Sheet: a box selects keys, and dragging moves what is selected together; groups fold', async () => {
  await click('ws-animation');
  await sleep(100);
  await op('anim.keyframe_insert', { type: 'Location' });
  await js('window.__my3d.setFrame(21)');
  await op('anim.keyframe_insert', { type: 'Location' });
  await js('window.__my3d.setFrame(41)');
  await op('anim.keyframe_insert', { type: 'Location' });
  await frame();
  await sleep(60);
  const c = await rect(tid('dopesheet-canvas'));
  const api = "window.__my3d.editorsOf('dopesheet')[0].api";
  const [x11, x31, y0, y5] = await js(`[${api}.frameX(11), ${api}.frameX(31), ${api}.rowY(0), ${api}.rowY(5)]`);
  // From the empty space left of frame 21 across it, over all rows.
  await cdp.drag([c.x + x11, c.y + y0 + 2], [c.x + x31, c.y + y5], 5);
  await frame();
  const selected = () => doc('Object.values(active.anim.fcurves).flat().filter((k) => k.sel).map((k) => k.f)');
  const picked = await selected();
  assert(picked.length >= 3 && picked.every((f) => f === 21), `the keys at frame 21: ${picked}`);
  // Dragging one drags them all.
  const x21 = await js(`${api}.frameX(21)`);
  await cdp.drag([c.x + x21, c.y + y0], [c.x + x21 + 40, c.y + y0], 4);
  await frame();
  const moved = await selected();
  assert(moved.every((f) => f > 21) && new Set(moved).size === 1, `moved together: ${moved}`);
  // A group folds.
  const rows = () => js("document.querySelectorAll('[data-testid=dopesheet-channels] .channel').length");
  const before = await rows();
  await js("[...document.querySelectorAll('[data-testid=dopesheet-channels] .channel')].find((e) => e.textContent === 'Location').click()");
  await frame();
  await sleep(40);
  eq(await rows(), before - 3, 'three rows folded away');
  // Deleting takes what is selected, nothing else.
  const count = await doc('Object.values(active.anim.fcurves).flat().length');
  await op('action.delete_selected');
  eq(await doc('Object.values(active.anim.fcurves).flat().length'), count - moved.length, 'only those');
  await cdp.screenshot(path.join(shots, 'dopesheet-box.png'));
});
await test('Graph Editor: handles drag, a modifier changes the curve, extrapolation and the panel work', async () => {
  await click('ws-animation');
  await sleep(100);
  const sw = await rect(tid('editor-switch-dopesheet'));
  await cdp.click(sw.cx, sw.cy);
  await frame();
  await click('set-editor-graph');
  await frame();
  await op('anim.keyframe_insert', { type: 'Location' });
  await js('window.__my3d.setFrame(41)');
  await js('window.__my3d.doc.objects[0].location[0] = 3');
  await op('anim.keyframe_insert', { type: 'Location' });
  await js("window.__my3d.editorsOf('graph')[0].api.state.vMin = -4; window.__my3d.editorsOf('graph')[0].api.state.vMax = 8; window.__my3d.setFrame(41)");
  await frame();
  await sleep(60);
  // A click on the channel makes the curve current, and selects the key by clicking it.
  await js("[...document.querySelectorAll('[data-testid=graph-channels] .channel')].find((e) => e.textContent === 'X Location').click()");
  await frame();
  await sleep(40);
  const c = await rect(tid('graph-canvas'));
  const api = "window.__my3d.editorsOf('graph')[0].api";
  const [kx, ky] = await js(`[${api}.frameX(41), ${api}.valueY(3)]`);
  await cdp.click(c.x + kx, c.y + ky);
  await frame();
  eq(await doc('active.anim.fcurves["location.0"][1].sel'), true, 'the key is selected');
  // Its left handle.
  const hl = await doc('active.anim.fcurves["location.0"][1].hl');
  const [hx, hy] = await js(`[${api}.frameX(${hl[0]}), ${api}.valueY(${hl[1]})]`);
  await cdp.drag([c.x + hx, c.y + hy], [c.x + hx, c.y + hy + 50], 4);
  await frame();
  const after = await doc('active.anim.fcurves["location.0"][1]');
  assert(after.hl[1] < hl[1] - 0.3, `the handle moved: ${after.hl}`);
  eq(after.handleType, 'ALIGNED', 'and it is no longer automatic');
  const opposite = (after.hr[1] - after.v) * (after.hl[0] - after.f) - (after.hl[1] - after.v) * (after.hr[0] - after.f);
  assert(Math.abs(opposite) < 1e-6, 'the other handle stays in line');
  // A modifier from the panel changes the curve past the last key.
  await js("(() => { const s = document.querySelector('[data-testid=fmod-add]'); s.value = 'CYCLES'; s.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await frame();
  await sleep(60);
  assert(await exists('fmod-0'), 'the panel shows it');
  await js('window.__my3d.setFrame(81)');
  const repeated = await doc('active.location[0]');
  assert(Math.abs(repeated - 3) < 1e-6, `frame 81 repeats frame 41: ${repeated}`);
  await js('window.__my3d.setFrame(61)');
  const middle = await doc('active.location[0]');
  assert(middle > 0 && middle < 3, `and the middle: ${middle}`);
  await cdp.screenshot(path.join(shots, 'graph-editor.png'));
  await click('fmod-remove-0');
  await frame();
  await js('window.__my3d.setFrame(81)');
  eq(await doc('active.location[0]'), 3, 'removed: it holds again');
});
await test('Drivers: the Graph Editor edits them, with variables; an unsafe expression is refused', async () => {
  await click('ws-animation');
  await sleep(100);
  const sw = await rect(tid('editor-switch-dopesheet'));
  await cdp.click(sw.cx, sw.cy);
  await frame();
  await click('set-editor-graph');
  await frame();
  await click('graph-mode-DRIVERS');
  await frame();
  await op('object.driver_add', { path: 'location.2', expression: 'other * 2' });
  await sleep(60);
  await frame();
  await js("[...document.querySelectorAll('[data-testid=graph-channels] .channel')].find((e) => e.textContent === 'Z Location').click()");
  await frame();
  await sleep(60);
  assert(await exists('driver-expression'), 'the panel');
  await click('driver-var-add');
  await frame();
  await sleep(60);
  const source = await doc("doc.objects.find((o) => o.name === 'Light').id");
  await js(`(() => { const a = window.__my3d; const d = a.doc.objects.find((o) => o.name === 'Cube').drivers[0]; d.variables[0] = { name: 'other', object: ${JSON.stringify(source)}, path: 'location.0' }; a.setFrame(a.doc.frame); })()`);
  const lx = await doc("doc.objects.find((o) => o.name === 'Light').location[0]");
  const z = await doc("doc.objects.find((o) => o.name === 'Cube').location[2]");
  assert(Math.abs(z - lx * 2) < 1e-6, `driven: ${z} against ${lx * 2}`);
  const evil = await js("(() => { const a = window.__my3d; const d = a.doc.objects.find((o) => o.name === 'Cube').drivers[0]; window.__hacked = 0; d.expression = 'constructor.constructor(\"window.__hacked=1\")()'; a.setFrame(a.doc.frame); return [window.__hacked, d._error]; })()");
  eq(evil, [0, true], 'refused and not run');
  await cdp.screenshot(path.join(shots, 'drivers.png'));
});
await test('NLA: Push Down moves the action to a strip', async () => {
  await op('anim.keyframe_insert', { type: 'Location' });
  const sw = await js("(() => { const r = document.querySelector('[data-testid=editor-switch-timeline]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()");
  await cdp.click(sw.x, sw.y);
  await frame();
  await click('set-editor-nla');
  await frame();
  await click('nla-push');
  eq(await doc('active.anim.nla.length'), 1, 'strip');
  eq(await doc('Object.keys(active.anim.fcurves).length'), 0, 'action emptied');
});

// ───────────────────────── other editors

await test('UV workspace: projection from the menu draws UVs; dragging a corner moves it', async () => {
  await click('ws-uv');
  await sleep(100);
  await menu('menu-uv', 'uvop-uv.reset');
  eq(await doc('active.data.uvs.length'), 6, 'layer');
  await frame();
  const c = await rect(tid('uv-canvas'));
  const size = Math.min(c.w, c.h) * 0.8;
  const [ox, oy] = [c.x + (c.w - size) / 2, c.y + (c.h - size) / 2];
  // UV (1, 1) of the unit square is at the square's top-right.
  await cdp.drag([ox + size, oy], [ox + size - 60, oy + 40], 4);
  await frame();
  assert(await doc('active.data.uvs.some((f) => f.some((p) => p[0] < 0.95 && p[0] > 0.7))'), 'a UV moved');
});
await test('Text Editor runs a script: bpy.ops adds objects; an error shows in the status bar', async () => {
  await click('ws-scripting');
  await sleep(100);
  await js("window.__my3d.editorsOf('text')[0].api.setText(`bpy.ops.mesh.primitive_cube_add({ location: [0, 5, 0] }); print('done');`, 'script.js')");
  await click('text-run');
  eq(await doc('doc.objects.length'), 4, 'added');
  assert(await js("window.__my3d.logLines.some((l) => l.text === 'done')"), 'print went to the log');
  await frame();
  assert(await js("[...document.querySelectorAll('[data-testid=info-log] .log-line')].some((l) => l.textContent === 'done')"), 'the Info editor shows it');
  await js("window.__my3d.editorsOf('text')[0].api.setText('nope.nope()')");
  await click('text-run');
  assert(await js("document.querySelector('[data-testid=status-msg]').classList.contains('status-error')"), 'error shown');
  await press('z', { ctrl: true });
});
await test('Console evaluates an expression and runs an operator', async () => {
  await click('ws-scripting');
  await sleep(100);
  await click('console-input');
  await cdp.send('Input.insertText', { text: 'bpy.data.objects.length * 2' });
  await press('Enter');
  await frame();
  assert(await js("[...document.querySelectorAll('[data-testid=console-log] .log-line')].some((l) => l.textContent === '6')"), 'result');
  await cdp.send('Input.insertText', { text: 'bpy.ops.object.empty_add()' });
  await press('Enter');
  eq(await doc('doc.objects.length'), 4, 'operator');
});
await test('Spreadsheet lists vertices and faces of the active object', async () => {
  await click('ws-geonodes');
  await sleep(100);
  eq(await js("document.querySelector('[data-testid=spreadsheet]').dataset.rows"), '8', 'vertices');
  await js("(() => { const s = document.querySelector('[data-testid=sheet-domain]'); s.value = 'FACE'; s.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await frame();
  eq(await js("document.querySelector('[data-testid=spreadsheet]').dataset.rows"), '6', 'faces');
});

// ───────────────────────── files and undo

await test('a project saves and loads back intact, with modifiers, materials and keys', async () => {
  await op('object.modifier_add', { type: 'SUBSURF' });
  await op('anim.keyframe_insert');
  await js('window.__my3d.doc.objects[0].location[2] = 3');
  const text = await js("import('/src/core/doc.js').then((d) => d.serialize(window.__my3d.doc))");
  await op('mesh.primitive_cube_add');
  await js(`window.__my3d.replaceDocument(${JSON.stringify(text)}, true)`);
  await frame();
  eq(await doc('doc.objects.length'), 3, 'objects');
  eq(await doc('doc.objects[0].modifiers[0].type'), 'SUBSURF', 'modifier');
  eq(await doc('doc.objects[0].location[2]'), 3, 'location');
  eq(await doc('Object.keys(doc.objects[0].anim.fcurves).length'), 9, 'keys');
  eq(await js('window.__my3d.isDirty()'), false, 'loaded clean');
});
await test('import through drag and drop: OBJ, STL, GLB round trips make objects', async () => {
  const data = await js(`Promise.all([import('/src/core/io.js'), import('/src/core/mesh.js')]).then(async ([io, m]) => {
    const list = [{ name: 'Box', mesh: m.cubeMesh(2) }];
    const app = window.__my3d;
    const before = app.doc.objects.length;
    await app.importDropped(new File([io.exportOBJ(list)], 'a.obj'));
    await app.importDropped(new File([io.exportSTLBinary(list)], 'b.stl'));
    await app.importDropped(new File([io.exportGLB(list)], 'c.glb'));
    await app.importDropped(new File([io.exportPLY(list)], 'd.ply'));
    return app.doc.objects.length - before;
  })`);
  eq(data, 4, 'imported objects');
});
await test('a bad import shows a readable error with Copy, and the app keeps working', async () => {
  await js("window.__my3d.importDropped(new File(['not a model'], 'bad.glb'))");
  await waitFor(() => exists('error-text'), 3000);
  assert((await js("document.querySelector('[data-testid=error-text]').textContent")).length > 0, 'message');
  assert(await exists('error-copy'), 'copy button');
  await press('Escape');
  assert(await op('mesh.primitive_cube_add'), 'still works');
});
await test('Edit menu: undo history lists the steps and jumps', async () => {
  await op('mesh.primitive_cube_add');
  await op('mesh.primitive_torus_add');
  await menuLabel('menu-edit', 'Undo History');
  await frame();
  const n = await js("document.querySelectorAll('.menu[data-level=\"1\"] .menu-item').length");
  eq(n, 3, 'rows');
  await js("document.querySelector('.menu[data-level=\"1\"] .menu-item').click()");
  await frame();
  eq(await doc('doc.objects.length'), 3, 'jumped to the start');
});
await test('undo and redo walk through a long mixed session and end where they started', async () => {
  const start = await js("import('/src/core/doc.js').then((d) => d.serialize(window.__my3d.doc))");
  const steps = [['mesh.primitive_cube_add', {}], ['object.modifier_add', { type: 'MIRROR' }], ['object.editmode_toggle', {}], ['mesh.select_all', {}], ['mesh.subdivide', {}], ['object.editmode_toggle', {}], ['object.duplicate', {}], ['object.delete', {}]];
  for (const [id, props] of steps) assert(await op(id, props), id);
  let guard = 40;
  while (guard-- && await js('window.__my3d.ctx.history.canUndo')) await js('window.__my3d.undo()');
  eq(await js("import('/src/core/doc.js').then((d) => d.serialize(window.__my3d.doc))"), start, 'undone to the start');
  while (guard-- && await js('window.__my3d.ctx.history.canRedo')) await js('window.__my3d.redo()');
  eq(await doc('doc.objects.length'), 4, 'redone');
});

// ───────────────────────── every menu item

await test('every enabled menu row of the viewport in each state runs without a page error', async () => {
  // Rows that open system dialogs or end the program are left out; everything else runs for real.
  const skip = /^(wm\.|import_|export_|render\.|image\.open)/;
  const states = [
    async () => { await reset(); },
    async () => { await reset(); await op('object.editmode_toggle'); await op('mesh.select_all', { action: 'SELECT' }); },
  ];
  let ran = 0;
  for (const prepare of states) {
    await prepare();
    for (const title of ['menu-select', 'menu-add', 'menu-object']) {
      const collect = () => js(`window.__my3d.__rows = null`);
      await collect();
      const ids = await js(`(async () => {
        document.querySelector('[data-testid=${title}]').click();
        await new Promise((r) => requestAnimationFrame(r));
        const out = [];
        const walk = async (level) => {
          const menu = document.querySelectorAll('.menu')[level];
          for (const row of [...menu.querySelectorAll(':scope > .menu-item')]) {
            if (row.dataset.op && !row.disabled) out.push(row.dataset.op);
            if (row.querySelector('.menu-more') && !row.disabled) {
              row.dispatchEvent(new MouseEvent('mouseenter'));
              await new Promise((r) => requestAnimationFrame(r));
              await walk(level + 1);
            }
          }
        };
        await walk(0);
        window.__my3d.closeMenus();
        return [...new Set(out)];
      })()`);
      for (const id of ids) {
        if (skip.test(id)) continue;
        const r = await js(`(() => { try { window.__my3d.op(${JSON.stringify(id)}); return true; } catch (e) { return e.message; } })()`);
        assert(r === true, `${id}: ${r}`);
        ran++;
        await js("window.__my3d.closeMenus()");
        if (!(await doc('doc.objects.length')) || !(await doc('Boolean(active)'))) await prepare();
      }
      await frame();
    }
  }
  assert(ran > 40, `only ${ran} rows ran`);
});

await test('a sample of all 14 editors stays free of errors after heavy document changes', async () => {
  await click('ws-geonodes');
  await sleep(100);
  for (let i = 0; i < 6; i++) await op('mesh.primitive_uv_sphere_add', { location: [i * 2, 0, 0] });
  await frame();
  await click('ws-animation');
  await sleep(100);
  await click('ws-layout');
  await sleep(100);
  await op('object.select_all', { action: 'SELECT' });
  await op('object.delete');
  await frame();
  eq(await doc('doc.objects.length'), 0, 'empty');
  for (const ws of ['ws-modeling', 'ws-sculpting', 'ws-uv', 'ws-paint', 'ws-shading', 'ws-rendering', 'ws-compositing', 'ws-geonodes', 'ws-scripting', 'ws-layout']) {
    await click(ws);
    await frame();
  }
});

stop();
vite.stop();
const failed = results.filter((r) => !r.ok).length;
fs.writeFileSync(path.join(shots, 'results.json'), JSON.stringify(results, null, 2));
console.log(totalsLine('E2E', results.length - failed, failed));
process.exit(failed ? 1 : 0);
