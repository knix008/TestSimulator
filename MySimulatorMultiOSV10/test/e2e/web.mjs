// Web E2E: starts Vite and headless Edge/Chrome, then drives the real UI over
// CDP — menus, toolbar, the node graph with the mouse (add, move, link, select,
// context menus, drag from the palette), the property panel, dialogs, the
// dashboard, data and 3D views, the tutorial, and every sample run by the
// WebAssembly engine. Prints "E2E: <passed> passed, <failed> failed".
//
//   node test/e2e/web.mjs                    everything
//   E2E_ONLY=samples node test/e2e/web.mjs   steps whose name contains "samples"
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startVite, launchBrowser, sleep, waitFor } from './cdp.mjs';
import { resultLine, totalsLine } from './report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const shots = path.join(root, 'test-results', 'web');
const only = process.env.E2E_ONLY ?? '';

if (!fs.existsSync(path.join(root, 'public', 'sim.wasm')) && !process.env.E2E_ALLOW_NO_WASM) {
  console.error('public/sim.wasm is missing — run npm run build:wasm first');
  process.exit(1);
}

const vite = await startVite(root);
const { cdp, errors, stop } = await launchBrowser(vite.url, { width: 1600, height: 960 });
const results = [];

const js = (expression) => cdp.evaluate(expression);
const q = (selector) => js(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
const center = (selector) => js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
const clickSel = async (selector) => {
  const box = await center(selector);
  if (!box) throw new Error(`no element ${selector}`);
  await cdp.click(box[0], box[1]);
  await sleep(120);
};
const state = () => js('(() => { const s = window.__mysim.state; const d = window.__mysim.doc(); return { view: s.view, running: s.running, status: s.status, nodes: d.model.nodes.length, links: d.model.links.length, selection: d.selection, results: d.results ? d.results.size : 0, stale: d.stale.size, language: s.settings.language, theme: s.settings.theme, docs: s.docs.length, past: d.past.length, dirty: d.dirty }; })()');
const closeDialogs = () => js('document.querySelectorAll(".popup-backdrop").forEach((b) => b.remove())');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
/** Screen points of a node: header, output port, input port k (page coordinates). */
const nodePoints = (id, k = 0) => js(`(() => {
  const g = window.__mysim.graph; const n = window.__mysim.doc().model.nodes.find((x) => x.id === ${JSON.stringify(id)});
  if (!n) return null;
  const r = g.canvas.getBoundingClientRect();
  const at = (p) => { const s = g.toScreen(p.x, p.y); return [r.left + s.x, r.top + s.y]; };
  return { head: at({ x: n.x + 100, y: n.y + 15 }), out: at(g.outPort(n)), in: at(g.inPort(n, ${k})) };
})()`);
const runAndWait = async (timeout = 120000) => {
  await js('window.__mysim.api.runPipeline()');
  await waitFor(async () => !(await js('window.__mysim.state.running')), timeout, 150);
};
const openSample = (id) => js(`(async () => { const { sampleModel } = await import('/src/core/samples.js'); window.__mysim.api.openModel(sampleModel(${JSON.stringify(id)}, window.__mysim.state.settings.language), null); })()`);

async function step(name, fn) {
  if (only && !name.includes(only)) return;
  const started = performance.now();
  const before = errors.length;
  try {
    await fn();
    if (errors.length > before) throw new Error(`page errors: ${errors.slice(before).join(' | ')}`);
    results.push({ name, ok: true, ms: performance.now() - started });
    console.log(resultLine({ status: 'pass', name, ms: performance.now() - started }));
  } catch (error) {
    results.push({ name, ok: false, ms: performance.now() - started, error: error.message });
    console.log(resultLine({ status: 'fail', name, ms: performance.now() - started, error: error.message }));
    try { await cdp.screenshot(path.join(shots, `fail-${name.replace(/[^\w-]+/g, '_')}.png`)); } catch { /* browser gone */ }
    await closeDialogs().catch(() => {});
  }
}

// The program starts in Korean; the tests run it in English so that everything they print is English.
await js('window.__mysim.state.settings.language === "en" || window.__mysim.api.patchSettings({ language: "en" })');

try {
  await step('shell: menu bar, toolbar, panels, view switch, status bar', async () => {
    for (const sel of ['[data-testid=menubar]', '[data-testid=toolbar]', '[data-testid=left-panel]', '[data-testid=right-panel]', '[data-testid=statusbar]', '[data-testid=chart-strip]', '[data-testid=workbench]', '[data-testid=tb-language]', '[data-testid=tb-theme]', '[data-testid=tb-settings]', '[data-testid=tb-about]', '[data-testid=view-switch]', '[data-testid=status-engine]']) {
      assert(await q(sel), `missing ${sel}`);
    }
    const clipped = await js('[...document.querySelectorAll(".toolbar > *")].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).length');
    assert(clipped === 0, `${clipped} toolbar items past the edge`);
    assert((await js('document.querySelector("[data-testid=status-engine]").textContent')).includes('WebAssembly'), 'engine is not WebAssembly');
    await cdp.screenshot(path.join(shots, '01-start.png'));
  });

  await step('start page: templates, samples, backgrounds, home button', async () => {
    assert(await js('!document.querySelector("[data-testid=start-page]").hidden'), 'start page not shown at start');
    for (const sel of ['.start-hero', '[data-testid=start-templates]', '[data-testid=start-recent]', '[data-testid=start-side]', '[data-testid=start-tutorial]', '[data-testid=start-tpl-blank]', '[data-testid=start-tpl-pid]', '[data-testid=start-sample-lorenz]', '[data-testid=anim-lorenz]']) assert(await q(sel), `missing ${sel}`);
    await clickSel('[data-testid=anim-montecarlo]');
    assert((await state()).language === 'en' && (await js('window.__mysim.state.settings.animation')) === 'montecarlo', 'background not chosen');
    const frames = await js('new Promise((r) => { const a = document.querySelector(".start-bg"); setTimeout(() => r(true), 300); void a; })');
    assert(frames, 'no frames');
    await clickSel('[data-testid=start-tpl-filter]');
    let s = await state();
    assert(s.nodes === 8 && s.links === 7, `template did not open the sample (${s.nodes} nodes)`);
    assert(await js('document.querySelector("[data-testid=start-page]").hidden'), 'start page still shown');
    await clickSel('[data-testid=tb-home]');
    assert(await js('!document.querySelector("[data-testid=start-page]").hidden'), 'home did not show the start page');
    await clickSel('[data-testid=tb-home]');
    s = await state();
    assert(s.docs >= 1, 'no document');
  });

  await step('menus: every menu opens with items; a menu command runs', async () => {
    for (const id of ['file', 'edit', 'view', 'node', 'analysis', 'run', 'tools', 'help']) {
      await clickSel(`[data-testid=menu-${id}]`);
      const count = await js('document.querySelectorAll("[data-testid=menu-popup] .menu-item").length');
      assert(count >= 4, `menu ${id} has ${count} items`);
      await js('window.__mysim.closeMenu()');
    }
    await clickSel('[data-testid=menu-analysis]');
    assert(await q('[data-testid="menuitem-add:ml.mlp"]'), 'the analysis menu lists the MLP');
    await js('window.__mysim.closeMenu()');
  });

  await step('graph: build a pipeline with the palette, auto-linking, and run it', async () => {
    await js('window.__mysim.run("new")');
    let s = await state();
    assert(s.nodes === 0, 'new pipeline not empty');
    await js('window.__mysim.api.patchSettings({ workbench: "signal" })');
    await clickSel('[data-testid="tool-add:source.signal"]');
    await clickSel('[data-testid="tool-add:signal.fft"]');
    s = await state();
    assert(s.nodes === 2 && s.links === 1, `palette add + auto link failed (${s.nodes} nodes, ${s.links} links)`);
    // Change the frequency in the property panel (the source node).
    const src = await js('window.__mysim.doc().model.nodes.find((n) => n.type === "source.signal").id');
    await js(`window.__mysim.api.select({ kind: 'node', ids: [${JSON.stringify(src)}] })`);
    await js('(() => { const el = document.querySelector("[data-testid=param-frequency] input, input[data-testid=param-frequency]"); el.value = "33"; el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); })()');
    assert((await js(`window.__mysim.doc().model.nodes.find((n) => n.id === ${JSON.stringify(src)}).params.frequency`)) === 33, 'frequency not set');
    await runAndWait();
    const f0 = await js('(() => { const d = window.__mysim.doc(); const fft = d.model.nodes.find((n) => n.type === "signal.fft"); return d.results.get(fft.id).scalars.find((x) => x.name === "dominant frequency").value; })()');
    assert(Math.abs(f0 - 33) < 0.2, `dominant frequency ${f0}`);
    assert((await state()).status.includes('Run complete') || (await state()).status.includes('complete'), 'status not done');
  });

  await step('graph: drag a node, draw a link with the mouse, box select, right-click menus', async () => {
    await js('window.__mysim.api.addNode("out.plot", { x: 700, y: 300, link: false })');
    const ids = await js('window.__mysim.doc().model.nodes.map((n) => n.id)');
    const [src, , plot] = ids;
    await js('window.__mysim.graph.fit()');
    await sleep(200);
    // Move the source node by dragging its header.
    const before = await js(`window.__mysim.doc().model.nodes.find((n) => n.id === ${JSON.stringify(src)}).x`);
    let p = await nodePoints(src);
    await cdp.drag(p.head, [p.head[0] + 60, p.head[1] + 30]);
    const after = await js(`window.__mysim.doc().model.nodes.find((n) => n.id === ${JSON.stringify(src)}).x`);
    assert(after > before + 20, `node did not move (${before} → ${after})`);
    // Link source → chart by dragging from the output port to the input port.
    p = await nodePoints(src);
    const target = await nodePoints(plot);
    const linksBefore = (await state()).links;
    await cdp.drag(p.out, target.in, 12);
    assert((await state()).links === linksBefore + 1, 'drag did not link');
    // Dragging empty space pans the canvas, with the hand cursor.
    const box = await js('(() => { const r = window.__mysim.graph.canvas.getBoundingClientRect(); return [r.left + 26, r.top + 26, r.right - 6, r.bottom - 6]; })()');
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box[0], y: box[1] });
    assert(await js('window.__mysim.graph.canvas.style.cursor') === 'grab', 'no hand cursor over empty space');
    const view0 = await js('({ ...window.__mysim.graph.view })');
    await cdp.drag([box[0], box[1]], [box[0] + 80, box[1] + 50]);
    const view1 = await js('({ ...window.__mysim.graph.view })');
    assert(Math.abs(view1.ox - view0.ox - 80) < 2 && Math.abs(view1.oy - view0.oy - 50) < 2, `empty-space drag did not pan (${JSON.stringify(view0)} → ${JSON.stringify(view1)})`);
    await js('window.__mysim.graph.fit()');
    await sleep(150);
    // Shift+drag on empty space box-selects everything.
    await cdp.drag([box[0] - 20, box[1] - 20], [box[2], box[3]], 8, 8);
    assert((await state()).selection?.ids.length === 3, 'box selection did not take all nodes');
    // Right click a node: the node context menu.
    p = await nodePoints(src);
    await cdp.click(p.head[0], p.head[1], 'right');
    await sleep(150);
    assert(await q('[data-testid="menuitem-runSelected"]'), 'no node context menu');
    await js('window.__mysim.closeMenu()');
    // Double click a node opens its data.
    await cdp.click(p.head[0], p.head[1]);
    await cdp.click(p.head[0], p.head[1], 'left', 2);
    await sleep(200);
    assert((await state()).view === 'data', 'double click did not open the data view');
    await js('window.__mysim.api.setView("graph")');
  });

  await step('graph: drag a node from the palette onto the canvas', async () => {
    await cdp.send('Input.setInterceptDrags', { enabled: true });
    const intercepted = new Promise((resolve) => cdp.on('Input.dragIntercepted', (event) => resolve(event.data)));
    const from = await center('[data-testid="tool-add:signal.psd"]');
    const to = await js('(() => { const r = window.__mysim.graph.canvas.getBoundingClientRect(); return [r.left + r.width * 0.3, r.top + r.height * 0.8]; })()');
    const count = (await state()).nodes;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from[0], y: from[1] });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from[0], y: from[1], button: 'left', clickCount: 1, buttons: 1 });
    // The move must carry the pressed button, or Chromium never starts the HTML5 drag.
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from[0] + (to[0] - from[0]) * i / 6, y: from[1] + (to[1] - from[1]) * i / 6, button: 'left', buttons: 1 });
    const data = await Promise.race([intercepted, sleep(3000).then(() => null)]);
    assert(data, 'the palette button did not start a drag');
    await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: to[0], y: to[1], data });
    await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x: to[0], y: to[1], data });
    await cdp.send('Input.dispatchDragEvent', { type: 'drop', x: to[0], y: to[1], data });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to[0], y: to[1], button: 'left', clickCount: 1 });
    await cdp.send('Input.setInterceptDrags', { enabled: false });
    await sleep(200);
    assert((await state()).nodes === count + 1, 'drop did not add a node');
    assert(await js('window.__mysim.doc().model.nodes.some((n) => n.type === "signal.psd")'), 'not a PSD node');
  });

  await step('edit: undo, redo, copy, paste, duplicate, disable, delete, auto layout', async () => {
    // Its own pipeline, so the step does not depend on the ones before it.
    await openSample('signalCleanup');
    await js('window.__mysim.api.addNode("signal.psd", { x: 900, y: 640, link: false })');
    let s = await state();
    const n0 = s.nodes;
    await js('window.__mysim.run("undo")');
    assert((await state()).nodes === n0 - 1, 'undo did not remove the dropped node');
    await js('window.__mysim.run("redo")');
    assert((await state()).nodes === n0, 'redo did not bring it back');
    await js('window.__mysim.run("selectAll")');
    await js('window.__mysim.run("copy")');
    await js('window.__mysim.run("paste")');
    s = await state();
    assert(s.nodes === n0 * 2, `paste: ${s.nodes}`);
    assert(s.links === 14, `links among copied nodes not kept (${s.links})`);
    await js('window.__mysim.run("delete")');
    assert((await state()).nodes === n0, 'delete');
    const id = await js('window.__mysim.doc().model.nodes[0].id');
    await js(`window.__mysim.api.select({ kind: 'node', ids: [${JSON.stringify(id)}] })`);
    await js('window.__mysim.run("toggleDisable")');
    assert(await js(`window.__mysim.doc().model.nodes.find((n) => n.id === ${JSON.stringify(id)}).disabled`), 'not disabled');
    await js('window.__mysim.run("toggleDisable")');
    await js('window.__mysim.run("duplicate")');
    assert((await state()).nodes === n0 + 1, 'duplicate');
    await js('window.__mysim.run("autoLayout")');
    assert(await js('new Set(window.__mysim.doc().model.nodes.map((n) => `${n.x},${n.y}`)).size === window.__mysim.doc().model.nodes.length'), 'auto layout stacked nodes');
  });

  await step('property panel: presets, help, column pickers, results and errors', async () => {
    await openSample('vibration');
    await runAndWait();
    await js('window.__mysim.api.select({ kind: "node", ids: ["msd"] })');
    assert(await q('[data-testid=node-preset]'), 'no preset list');
    await js('(() => { const el = document.querySelector("[data-testid=node-preset]"); el.value = "lorenz"; el.dispatchEvent(new Event("change", { bubbles: true })); })()');
    assert((await js('window.__mysim.doc().model.nodes.find((n) => n.id === "msd").params.equations')).includes("z' ="), 'preset not applied');
    assert((await state()).stale > 0, 'nodes after a change are not stale');
    await js('window.__mysim.run("undo")');
    // Column picker of the peaks node offers the ODE's columns.
    await js('window.__mysim.api.select({ kind: "node", ids: ["pk"] })');
    const options = await js('[...document.querySelectorAll("[data-testid=row-column] datalist option")].map((o) => o.value)');
    assert(options.includes('x') && options.includes('v'), `column options: ${options}`);
    // A bad expression: the node fails with a readable error, the next nodes are skipped.
    await js('window.__mysim.api.patchNode("msd", { params: { equations: "x\' = nope" } })');
    await runAndWait();
    await js('window.__mysim.api.select({ kind: "node", ids: ["msd"] })');
    const err = await js('document.querySelector("[data-testid=prop-error]")?.textContent ?? ""');
    assert(err.includes('unknown name nope'), `error: ${err}`);
    assert(await js('window.__mysim.doc().results.get("pk").skipped'), 'downstream not skipped');
    await js('window.__mysim.run("undo")');
  });

  await step('result strip: chart, table, values, log tabs; data view; exports enabled', async () => {
    await openSample('vibration');
    await runAndWait();
    await js('window.__mysim.api.select({ kind: "node", ids: ["msd"] })');
    for (const tab of ['chart', 'table', 'values', 'log']) {
      await clickSel(`[data-testid=chart-tab-${tab}]`);
      assert(await js(`window.__mysim.state.chartTab === ${JSON.stringify(tab)}`), `tab ${tab}`);
    }
    assert(await q('[data-testid=run-log]'), 'no run log');
    await clickSel('[data-testid=chart-tab-table]');
    assert(await q('[data-testid=result-table]'), 'no table');
    await clickSel('[data-testid=chart-tab-chart]');
    await clickSel('[data-testid=view-data]');
    assert(await q('[data-testid=data-canvas]'), 'no data chart');
    assert(await js('window.__mysim.api.isEnabled("exportCsv") && window.__mysim.api.isEnabled("exportJson")'), 'exports disabled');
    await cdp.screenshot(path.join(shots, '02-data-view.png'));
    await clickSel('[data-testid=view-graph]');
  });

  await step('dashboard: KPI tiles and chart tiles drawn', async () => {
    await openSample('vibration');
    await runAndWait();
    await clickSel('[data-testid=view-dashboard]');
    await sleep(300);
    const tiles = await js('document.querySelectorAll(".dash-tile").length');
    const kpis = await js('document.querySelectorAll(".kpi-tile").length');
    assert(tiles >= 2 && kpis >= 2, `tiles ${tiles}, kpis ${kpis}`);
    const drawn = await js('[...document.querySelectorAll(".dash-canvas")].filter((c) => c.chartMap).length');
    assert(drawn >= 2, `charts drawn: ${drawn}`);
    const zeta = await js('document.querySelector("[data-testid=kpi-kz] .kpi-value").textContent');
    assert(/^0\.0\d/.test(zeta), `damping ratio tile: ${zeta}`);
    await cdp.screenshot(path.join(shots, '03-dashboard.png'));
    await clickSel('[data-testid=view-graph]');
  });

  await step('3D view: the Lorenz attractor in WebGL', async () => {
    await openSample('lorenz');
    await runAndWait();
    await js('window.__mysim.api.select({ kind: "node", ids: ["lor"] })');
    await clickSel('[data-testid=view-3d]');
    await waitFor(() => js('Boolean(window.__mysim.plot3d)'), 10000);
    await sleep(400);
    assert(await q('[data-testid=view3d] canvas'), 'no WebGL canvas');
    assert(await q('[data-testid=plot3d-z]'), 'no column chooser');
    const points = await js('window.__mysim.plot3d.group.children[0].geometry.attributes.position.count');
    assert(points > 5000, `curve has ${points} points`);
    await cdp.screenshot(path.join(shots, '04-3d.png'));
    await clickSel('[data-testid=view-graph]');
  });

  await step('simulators: circuit, logic, FEM, robot and CAD dashboards; the CAD part in 3D', async () => {
    for (const [id, minTiles] of [['circuits', 6], ['mycircuit', 2], ['logic', 3], ['fem', 3], ['solid', 2], ['physics', 4], ['robots', 4], ['cad', 2], ['heatStudy', 2], ['audio', 3]]) {
      await openSample(id);
      await runAndWait(120000);
      await clickSel('[data-testid=view-dashboard]');
      await sleep(400);
      const drawn = await js('[...document.querySelectorAll(".dash-canvas")].filter((c) => c.chartMap).length');
      assert(drawn >= minTiles, `${id}: ${drawn} charts drawn`);
      await cdp.screenshot(path.join(shots, `05-${id}.png`));
    }
    // The flange as a point cloud at true proportions.
    await openSample('cad');
    await runAndWait();
    await js('window.__mysim.api.select({ kind: "node", ids: ["flange"] })');
    await clickSel('[data-testid=view-3d]');
    await waitFor(() => js('Boolean(window.__mysim.plot3d?.group.children.length)'), 10000);
    await sleep(300);
    const kind = await js('window.__mysim.plot3d.group.children[0].type');
    const points = await js('window.__mysim.plot3d.group.children[0].geometry.attributes.position.count');
    assert(kind === 'Points' && points > 5000, `CAD cloud: ${kind} with ${points} points`);
    await cdp.screenshot(path.join(shots, '05-cad-3d.png'));
    await clickSel('[data-testid=view-graph]');
  });

  await step('physics: the 3D scene plays back; a 3D FEM part is drawn coloured by its field', async () => {
    await openSample('physics');
    await runAndWait(120000);
    await js('window.__mysim.api.select({ kind: "node", ids: ["car"] })');
    await clickSel('[data-testid=view-3d]');
    await waitFor(() => js('Boolean(window.__mysim.plot3d?.anim)'), 10000);
    await waitFor(() => q('[data-testid=scene-play]'), 5000);
    const start = await js('window.__mysim.plot3d.anim.bodies.find((b) => b.name === "chassis").mesh.position.x');
    await clickSel('[data-testid=scene-play]');
    await sleep(1500);
    const later = await js('window.__mysim.plot3d.anim.bodies.find((b) => b.name === "chassis").mesh.position.x');
    assert(later > start + 0.3, `the vehicle did not move in the playback (${start} → ${later})`);
    const clock = await js('document.querySelector("[data-testid=scene-clock]").textContent');
    assert(/^[1-9]/.test(clock), `clock ${clock}`);
    await cdp.screenshot(path.join(shots, '06-physics.png'));
    await clickSel('[data-testid=scene-play]');
    await openSample('solid');
    await runAndWait(120000);
    await js('window.__mysim.api.select({ kind: "node", ids: ["sink"] })');
    await clickSel('[data-testid=view-3d]');
    await waitFor(() => js('Boolean(window.__mysim.plot3d?.group.children.length)'), 10000);
    const colour = await js('document.querySelector("[data-testid=plot3d-color]").value');
    assert(colour === 'T', `the heat sink is coloured by "${colour}"`);
    await clickSel('[data-testid=view-graph]');
  });

  await step('block editor: blocks from the diagram, a wire drawn with the mouse, applied back as text', async () => {
    await openSample('blockDiagram');
    await js('window.__mysim.api.select({ kind: "node", ids: ["car"] })');
    await sleep(200);
    await clickSel('[data-testid=open-block-editor]');
    await waitFor(() => q('[data-testid=block-canvas]'), 5000);
    for (const name of ['v_ref', 'acc', 'force', 'v']) assert(await q(`[data-testid=block-${name}]`), `no block ${name}`);
    // Add a gain block, then wire hill's output into its input port.
    await clickSel('[data-testid=block-add-gain]');
    const from = await center('[data-testid=out-hill]');
    const to = await center('[data-testid=port-gain1-a]');
    await cdp.drag(from, to, 10);
    await sleep(150);
    assert(await q('[data-testid=wire-hill-gain1]'), 'the wire was not drawn');
    await clickSel('[data-testid=block-apply]');
    await sleep(200);
    const diagram = await js('window.__mysim.doc().model.nodes.find((n) => n.id === "car").params.diagram');
    assert(/gain1 = 2\*hill/.test(diagram) && /# layout:/.test(diagram), `diagram after the editor: ${diagram.slice(-200)}`);
    await runAndWait();
    const ok = await js('window.__mysim.doc().results.get("car").ok');
    assert(ok, 'the edited diagram does not run');
  });

  await step('file data: WAV, Excel, STL, MAT and PNG files read in the browser; a netlist opens as a circuit', async () => {
    const fixtures = path.join(root, 'engine', 'sim-core', 'tests', 'fixtures');
    await js('window.__mysim.api.newModel()');
    for (const name of ['tone16.wav', 'book.xlsx', 'cube.stl', 'vars.mat', 'gradient.png']) {
      const b64 = fs.readFileSync(path.join(fixtures, name)).toString('base64');
      await js(`window.__mysim.api.importBinary(${JSON.stringify(name)}, ${JSON.stringify(b64)})`);
    }
    await js('window.__mysim.api.importNetlist("divider.cir", "* divider\\nV1 in 0 10\\nR1 in out 3k\\nR2 out 0 1k\\n.op")');
    // A MyCircuit project through MyCircuit's own exporter (vendored).
    const mycircuit = fs.readFileSync(path.join(fixtures, '05-npn-switch.mycircuit'), 'utf8');
    await js(`window.__mysim.api.importNetlist("05-npn-switch.mycircuit", ${JSON.stringify(mycircuit)})`);
    await waitFor(() => js('window.__mysim.doc().model.nodes.some((n) => n.name === "05-npn-switch")'), 5000);
    await runAndWait();
    const out = await js(`(() => { const d = window.__mysim.doc(); return d.model.nodes.map((n) => { const r = d.results.get(n.id); return { type: n.type, name: n.name, ok: r?.ok, error: r?.error, scalars: Object.fromEntries((r?.scalars ?? []).map((s) => [s.name, s.value])) }; }); })()`);
    const by = (name) => out.find((n) => n.name === name);
    for (const n of out) assert(n.ok, `${n.name}: ${n.error}`);
    assert(by('tone16').scalars['sample rate'] === 8000, 'WAV sample rate');
    assert(by('book').scalars.sheets === 2, 'Excel sheets');
    assert(by('cube').scalars.triangles === 12, 'STL triangles');
    assert(by('vars').scalars.gain === 3.5, 'MAT scalar');
    assert(by('gradient').scalars.width === 40, 'PNG width');
    assert(by('divider').type === 'circuit.spice' && Math.abs(by('divider').scalars['V(out)'] - 2.5) < 1e-6, 'netlist circuit');
    // MyCircuit's own simulator gives 4.499996 V and 0.7298 V here.
    const npn = by('05-npn-switch');
    assert(Math.abs(npn.scalars['V(sw_out)'] - 4.499996) < 2e-3 && Math.abs(npn.scalars['V(base)'] - 0.72978) < 2e-3, `MyCircuit project: ${JSON.stringify(npn.scalars)}`);
    // The property panel names the kept file.
    const wav = await js('window.__mysim.doc().model.nodes.find((n) => n.name === "tone16").id');
    await js(`window.__mysim.api.select({ kind: "node", ids: [${JSON.stringify(wav)}] })`);
    await sleep(200);
    const label = await js('document.querySelector("[data-testid=param-blob-name]")?.textContent ?? ""');
    assert(label.startsWith('tone16.wav'), `file label: ${label}`);
  });

  await step('samples: every sample runs in the browser engine', async () => {
    const ids = await js('import("/src/core/samples.js").then((m) => m.SAMPLE_IDS)');
    for (const id of ids) {
      await openSample(id);
      await runAndWait(180000);
      const bad = await js(`(async () => { const { nodeSpec } = await import('/src/core/catalog.js'); const d = window.__mysim.doc();
        return d.model.nodes.filter((n) => !nodeSpec(n.type).desktopOnly && !d.model.links.some((l) => l.to === n.id && nodeSpec(d.model.nodes.find((x) => x.id === l.from).type).desktopOnly))
          .filter((n) => !d.results.get(n.id)?.ok).map((n) => n.name + ': ' + (d.results.get(n.id)?.error ?? 'no result')); })()`);
      assert(!bad.length, `${id}: ${bad.join(' | ')}`);
      if (id === 'python') {
        const err = await js('window.__mysim.doc().results.get("py").error');
        assert(err.includes('desktop app'), `python on the web: ${err}`);
      }
    }
    await js('window.__mysim.run("closeOthers")');
  });

  await step('sweep sample: the overshoot falls as Kd grows', async () => {
    await openSample('pidSweep');
    await runAndWait();
    const values = await js('Array.from(window.__mysim.doc().results.get("sw").tables[0].columns[1].values)');
    assert(values.length === 13 && values[0] > values[values.length - 1], `overshoot ${values.slice(0, 3)}`);
  });

  await step('dialogs: settings, about, shortcuts, library, expression help, python, batch, samples, check, report, pipeline settings, print', async () => {
    for (const [command, id] of [['settings', 'settings'], ['about', 'about'], ['shortcuts', 'shortcuts'], ['nodeLibrary', 'library'], ['expressionHelp', 'exprhelp'], ['pythonInfo', 'python'], ['batchHelp', 'batch'], ['newFromSample', 'samples'], ['validate', 'validate'], ['exportReport', 'report'], ['pipelineSettings', 'pipeline'], ['print', 'print']]) {
      await js(`void window.__mysim.run(${JSON.stringify(command)})`);
      await waitFor(() => q(`[data-testid=dialog-${id}]`), 4000).catch(() => {});
      assert(await q(`[data-testid=dialog-${id}]`), `dialog ${id} did not open`);
      await closeDialogs();
    }
    // The report has a chart picture and the result values.
    await js('void window.__mysim.run("exportReport")');
    await waitFor(() => q('[data-testid=report-html] img'), 4000);
    assert((await js('document.querySelector("[data-testid=report-html]").textContent')).includes('overshoot'), 'report has no values');
    await closeDialogs();
  });

  await step('node library: search, pick and add a node', async () => {
    await js('window.__mysim.run("new")');
    await js('void window.__mysim.run("nodeLibrary")');
    await waitFor(() => q('[data-testid=library-search]'), 3000);
    await js('(() => { const el = document.querySelector("[data-testid=library-search]"); el.value = "kmeans"; el.dispatchEvent(new Event("input", { bubbles: true })); })()');
    let items = await js('document.querySelectorAll("[data-testid=library-list] .library-item").length');
    assert(items >= 1, 'search found nothing');
    await js('(() => { const el = document.querySelector("[data-testid=library-search]"); el.value = "spectrum"; el.dispatchEvent(new Event("input", { bubbles: true })); })()');
    items = await js('[...document.querySelectorAll("[data-testid=library-list] .library-item")].map((b) => b.dataset.testid)');
    assert(items.includes('library-signal.fft'), `search: ${items}`);
    await clickSel('[data-testid="library-signal.fft"]');
    await clickSel('[data-testid=library-add]');
    assert(await js('window.__mysim.doc().model.nodes.some((n) => n.type === "signal.fft")'), 'library did not add');
  });

  await step('files: open a pipeline and CSV data, save (download), import JSON data', async () => {
    const text = await js('import("/src/core/samples.js").then(async (m) => { const { serializeModel } = await import("/src/core/model.js"); return serializeModel(m.sampleModel("regression", "en")); })');
    await js(`window.__mysim.api.openText("reg.mysim", ${JSON.stringify(text)})`);
    assert(await js('window.__mysim.doc().model.nodes.length === 8'), 'pipeline not opened');
    await js('window.__mysim.api.openText("data.csv", "x,y\\n1,2\\n2,4\\n3,6\\n")');
    const table = await js('window.__mysim.doc().model.nodes.find((n) => n.type === "source.table" && n.params.data.startsWith("x,y"))');
    assert(table, 'CSV did not become a table node');
    await js('window.__mysim.api.openText("rows.json", JSON.stringify([{ a: 1, b: 2 }, { a: 3, b: 4 }]))');
    assert(await js('window.__mysim.doc().model.nodes.some((n) => n.type === "source.table" && n.params.data.startsWith("a,b"))'), 'JSON did not become a table');
    await js('window.__mysim.run("save")');
    await sleep(200);
    assert(!(await state()).dirty, 'save (download) did not clear the modified mark');
  });

  await step('auto run: a parameter change runs the pipeline again', async () => {
    await openSample('signalCleanup');
    await runAndWait();
    await js('window.__mysim.api.patchSettings({ autoRun: true })');
    await js('window.__mysim.api.patchNode("sig", { params: { frequency: 40 } })');
    await waitFor(async () => (await js('window.__mysim.doc().results.get("kpiF")?.scalars[0]?.value')) < 45, 8000, 150);
    await js('window.__mysim.api.patchSettings({ autoRun: false })');
    assert((await state()).stale === 0, 'stale after auto run');
  });

  await step('language, theme and workbenches', async () => {
    await clickSel('[data-testid=tb-language]');
    assert((await state()).language === 'ko', 'language not switched');
    assert((await js('document.querySelector("[data-testid=menu-file]").textContent')).includes('파일'), 'menus not Korean');
    await clickSel('[data-testid=tb-language]');
    assert((await state()).language === 'en', 'not back to English');
    const theme = (await state()).theme;
    await clickSel('[data-testid=tb-theme]');
    assert((await state()).theme !== theme, 'theme did not change');
    for (const wb of ['pipeline', 'signal', 'dynamics', 'analysis', 'montecarlo', 'integration', 'all']) {
      await js(`window.__mysim.api.patchSettings({ workbench: ${JSON.stringify(wb)} })`);
      assert(await js('document.querySelectorAll("[data-testid=tool-grid] .tool").length') > 3, `workbench ${wb} is empty`);
    }
    await js(`window.__mysim.api.patchSettings({ theme: ${JSON.stringify(theme)}, workbench: "pipeline" })`);
  });

  await step('panels: fold, unfold, hide, resize the result panel', async () => {
    await clickSel('[data-testid=collapse-left]');
    assert(await q('[data-testid=expand-left]'), 'left not folded');
    await clickSel('[data-testid=expand-left]');
    await clickSel('[data-testid=collapse-bottom]');
    assert(await js('window.__mysim.state.settings.bottomCollapsed'), 'bottom not folded');
    await clickSel('[data-testid=unfold-bottom]');
    const h0 = await js('document.querySelector("[data-testid=chart-strip]").getBoundingClientRect().height');
    const bar = await center('.chart-splitter');
    await cdp.drag(bar, [bar[0], bar[1] - 80]);
    const h1 = await js('document.querySelector("[data-testid=chart-strip]").getBoundingClientRect().height');
    assert(h1 > h0 + 50, `result panel ${h0} → ${h1}`);
  });

  await step('tutorial: start, step through chapters, stop restores', async () => {
    const docs = (await state()).docs;
    await js('window.__mysim.api.startTutorial()');
    await waitFor(() => q('[data-testid=tour-card]'), 4000);
    for (let i = 0; i < 6; i++) {
      await clickSel('[data-testid=tour-next]');
      await waitFor(async () => !(await js('window.__mysim.tutorial.busy')), 15000, 100);
    }
    const id = await js('window.__mysim.tutorial.state().id');
    assert(id === 'menubar', `at step ${id}`);
    await js('window.__mysim.tutorial.go(21)');
    await waitFor(async () => !(await js('window.__mysim.tutorial.busy')), 30000, 100);
    assert((await state()).view === 'dashboard', 'the dashboard step did not show the dashboard');
    await clickSel('[data-testid=tour-stop]');
    await sleep(300);
    assert((await state()).docs === docs, 'tutorial tabs not closed');
    assert(!(await q('[data-testid=tour-card]')), 'card still shown');
  });
} finally {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(totalsLine('E2E', passed, failed));
  console.log(`E2E: ${passed} passed, ${failed} failed`);
  await stop();
  vite.stop();
  process.exit(failed ? 1 : 0);
}
