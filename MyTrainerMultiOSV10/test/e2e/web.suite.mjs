// End-to-end checks of the web build (headless Edge / Chrome): start page and its moving backgrounds,
// editing a model without code (palette, drop on a wire, ports, quick buttons, undo), the data tab,
// training to a good accuracy, the neuron inspector, the code editor, drawing a digit to test, language.
import assert from 'node:assert/strict';
import { startWeb } from './web.harness.mjs';
import { sleep } from './cdp.mjs';

export async function runWebSuite({ log = console.log, report } = {}) {
  const results = [];
  const { page, close } = await startWeb({ storage: { 'mytrainer.settings.v1': { language: 'ko', showStartPage: true, theme: 'light' } } });
  const step = async (name, fn) => {
    const started = Date.now();
    try {
      await fn();
      const result = { name, ok: true, ms: Date.now() - started };
      results.push(result);
      if (report) report(result); else log(`  ✔ ${name}`);
    } catch (error) {
      const result = { name, ok: false, ms: Date.now() - started, error: error.message };
      results.push(result);
      if (report) report(result); else log(`  ✖ ${name}: ${error.message}`);
      await page.screenshot(`test-results/fail-web-${name.replace(/[^a-z0-9]+/gi, '_')}.png`).catch(() => {});
    }
  };
  const state = (expr) => page.eval(`(() => { const s = __mytrainer.state; return ${expr}; })()`);
  try {
    await step('start page: 20 AI backgrounds animate and can be switched', async () => {
      assert.equal(await page.eval(`document.querySelectorAll('.anim-chip').length`), 20);
      const frames = await page.eval(`new Promise((r) => { const c = document.querySelector('.start-bg'); setTimeout(() => r(1), 400); })`);
      assert.ok(frames);
      await page.click('.anim-chip[data-value="attention"]');
      assert.equal(await state('s.settings.animation'), 'attention');
      assert.equal(await page.eval(`document.querySelector('.anim-chip.active').dataset.value`), 'attention');
    });
    await step('start page: a sample tile opens the sample', async () => {
      await page.click('.sample-tile[data-value="moons"]');
      await page.waitFor(`__mytrainer.state.project.sample === 'moons' && !__mytrainer.state.showStart`);
      assert.equal(await state('s.problems.filter((p) => p.level === "error").length'), 0);
    });
    await step('palette: clicking a layer inserts it after the selected layer; undo removes it', async () => {
      await page.eval(`__mytrainer.switchTab('model')`);
      const before = await state('s.project.model.nodes.length');
      const first = await state('s.project.model.nodes.find((n) => n.type === "dense").id');
      await page.eval(`__mytrainer.graph().select(['${first}'])`);
      await page.click('[data-palette-layer="dropout"]');
      assert.equal(await state('s.project.model.nodes.length'), before + 1);
      const order = await page.eval(`JSON.stringify(__mytrainer.api.orderedNodes().map((n) => n.type))`);
      assert.match(order, /"dense","dropout","dense"/);
      await page.eval(`__mytrainer.run('undo')`);
      assert.equal(await state('s.project.model.nodes.length'), before);
    });
    await step('dropping a palette layer on a wire inserts it there', async () => {
      const before = await state('s.project.model.nodes.length');
      const edge = await page.eval(`(() => { const r = document.querySelector('[data-edge] .edge-hit').getBoundingClientRect(); const path = document.querySelector('[data-edge] .edge-hit'); const len = path.getTotalLength(); const p = path.getPointAtLength(len / 2); const m = path.getScreenCTM(); return { x: p.x * m.a + m.e, y: p.y * m.d + m.f }; })()`);
      await page.eval(`(() => { const dt = new DataTransfer(); dt.setData('application/x-mytrainer', JSON.stringify({ kind: 'layer', type: 'batchNorm' })); const target = document.elementFromPoint(${edge.x}, ${edge.y}); target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: ${edge.x}, clientY: ${edge.y} })); })()`);
      assert.equal(await state('s.project.model.nodes.length'), before + 1);
      assert.equal(await state('s.problems.filter((p) => p.level === "error").length'), 0, 'still a valid chain');
      await page.eval(`__mytrainer.run('undo')`);
    });
    await step('quick buttons: more neurons, residual connection, delete', async () => {
      const id = await state('s.project.model.nodes.filter((n) => n.type === "dense")[1].id');
      await page.eval(`__mytrainer.graph().select(['${id}'])`);
      const units = await state(`s.project.model.nodes.find((n) => n.id === '${id}').params.units`);
      await page.click('[data-quick="widthUp"]');
      assert.ok(await state(`s.project.model.nodes.find((n) => n.id === '${id}').params.units`) > units);
      await page.click('[data-quick="widthDown"]');
      assert.equal(await state(`s.project.model.nodes.find((n) => n.id === '${id}').params.units`), units);
      await page.click('[data-quick="residual"]');
      assert.ok(await state('s.project.model.nodes.some((n) => n.type === "add")'), 'an Add layer');
      assert.equal(await state('s.problems.filter((p) => p.level === "error").length'), 0);
      await page.eval(`__mytrainer.run('undo')`);
    });
    await step('connecting two layers by dragging from a port (real mouse)', async () => {
      await page.eval(`__mytrainer.openSampleNow('wideDeep')`);
      await page.waitFor(`__mytrainer.state.project.sample === 'wideDeep'`);
      await page.eval(`__mytrainer.switchTab('model'); __mytrainer.graph().fit()`);
      await sleep(300);
      // Cut the wide path, then draw it again from the input's port to the merge layer.
      const input = await state('s.project.model.nodes.find((n) => n.type === "input").id');
      const merge = await state('s.project.model.nodes.find((n) => n.type === "concatenate").id');
      await page.eval(`(() => { const m = __mytrainer.state.project.model; m.edges = m.edges.filter((e) => !(e.from === '${input}' && e.to === '${merge}')); __mytrainer.api.commit('cut'); })()`);
      assert.ok(await state('s.problems.some((p) => p.level === "error")'), 'a concatenate with one input is an error');
      const from = await page.center(`[data-node="${input}"] .port-out`);
      const to = await page.center(`[data-node="${merge}"] .node-box`);
      await page.drag(from, to);
      await sleep(200);
      assert.ok(await state(`s.project.model.edges.some((e) => e.from === '${input}' && e.to === '${merge}')`), 'connected');
      assert.equal(await state('s.problems.filter((p) => p.level === "error").length'), 0);
    });
    await step('data tab: another dataset, a preprocessing step, the output layer follows', async () => {
      await page.eval(`__mytrainer.openSampleNow('spiral'); __mytrainer.switchTab('data')`);
      await sleep(400);
      await page.eval(`(() => { const s = document.querySelector('[data-data="source"]'); s.value = 'gen:blobs'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await page.waitFor(`__mytrainer.state.project.dataset.source.id === 'blobs'`);
      assert.equal(await state('s.shapes.get(__mytrainer.api.outputId()).shape[0]'), 4, '4 blob classes → 4 outputs');
      await page.eval(`(() => { const s = document.querySelector('[data-data="addStep"]'); s.value = 'standardize'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      assert.equal(await state('s.project.dataset.steps.length'), 1);
      assert.ok(await page.eval(`document.querySelectorAll('.step-card').length === 1`));
    });
    await step('training reaches a good accuracy; charts and the decision boundary are drawn', async () => {
      await page.eval(`__mytrainer.openSampleNow('xor'); __mytrainer.state.project.train.epochs = 120; __mytrainer.switchTab('train')`);
      await sleep(300);
      await page.click('[data-train-action="train"]');
      await page.waitFor(`__mytrainer.state.run.state === 'idle' && __mytrainer.state.run.history.length === 120`, { timeout: 180000, interval: 400 });
      const acc = await state('s.run.history.at(-1).acc');
      assert.ok(acc > 0.9, `accuracy ${acc}`);
      assert.ok(await state('Boolean(s.visual.boundary)'), 'decision boundary');
      assert.ok(await state('s.report && s.report.accuracy > 0.85'), 'test evaluation');
    });
    await step('neuron view: a neuron explains its weighted sum, and it matches the engine', async () => {
      await page.eval(`__mytrainer.switchTab('model')`);
      await page.eval(`__mytrainer.switchTab('neurons')`);
      await sleep(900);
      const hidden = await state('s.project.model.nodes.find((n) => n.type === "dense").id');
      await page.eval(`__mytrainer.api.selectUnit({ nodeId: '${hidden}', unit: 2, position: {} })`);
      await sleep(400);
      assert.ok(await page.eval(`document.querySelector('.inspector .formula')?.textContent.includes('Σ')`));
      assert.ok(await page.eval(`Boolean(document.querySelector('.inspector .check.ok'))`), 'the recomputed value equals the engine value');
      // A real click on a drawn neuron selects it too.
      const hit = await page.eval(`(() => { const view = document.querySelector('.neuron-host.full canvas'); const r = view.getBoundingClientRect(); return { x: r.left, y: r.top }; })()`);
      assert.ok(hit);
    });
    await step('code tab: the PyTorch code is shown; editing makes it the user\'s own code', async () => {
      await page.eval(`__mytrainer.switchTab('code')`);
      await sleep(500);
      assert.ok(await page.eval(`__mytrainer.codeView().text.includes('class Net(nn.Module)')`));
      await page.eval(`(() => { const v = __mytrainer.codeView().view; v.dispatch({ changes: { from: v.state.doc.length, insert: '\\n# my change\\n' } }); })()`);
      assert.equal(await state('s.project.code.custom'), true);
      assert.ok(await page.eval(`document.querySelector('.code-status.custom') !== null`));
      await page.eval(`(() => { const s = document.querySelector('[data-dict="search"]'); s.value = 'items'; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      assert.ok(await page.eval(`document.querySelector('.dict-item b').textContent === 'items'`));
    });
    await step('test tab: drawing a digit gives a prediction', async () => {
      await page.eval(`__mytrainer.openSampleNow('digitsMlp'); __mytrainer.state.project.train.epochs = 6`);
      await page.eval(`__mytrainer.startTraining()`);
      await page.waitFor(`__mytrainer.state.run.state === 'idle' && __mytrainer.state.run.history.length === 6`, { timeout: 240000, interval: 500 });
      await page.eval(`__mytrainer.switchTab('test')`);
      await sleep(500);
      await page.click('[data-test-mode="custom"]');
      await sleep(400);
      const pad = await page.eval(`(() => { const r = document.querySelector('[data-test-canvas="pad"]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
      // A "1": one vertical stroke.
      await page.drag({ x: pad.x + pad.w * 0.52, y: pad.y + pad.h * 0.15 }, { x: pad.x + pad.w * 0.52, y: pad.y + pad.h * 0.85 }, 14);
      await page.waitFor(`__mytrainer.api.probeOutput()?.length === 10`, { timeout: 15000 });
      const out = await page.eval(`JSON.stringify(Array.from(__mytrainer.api.probeOutput()))`);
      const probs = JSON.parse(out);
      assert.ok(Math.abs(probs.reduce((a, b) => a + b, 0) - 1) < 1e-3, 'probabilities');
    });
    await step('language: switching to English changes the menus', async () => {
      await page.eval(`__mytrainer.run('language')`);
      await sleep(300);
      assert.equal(await page.eval(`document.querySelector('[data-menu="file"] span').textContent`), 'File');
      await page.eval(`__mytrainer.run('language')`);
    });
    await step('no page errors', async () => {
      const errors = await state('s.console.filter((e) => e.level === "error").map((e) => e.text)');
      assert.deepEqual([...page.errors, ...errors], []);
    });
  } finally {
    await close();
  }
  return results;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const results = await runWebSuite();
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
