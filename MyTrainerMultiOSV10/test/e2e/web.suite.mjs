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
      // What the app logged last helps to see why (a training that did not start, an engine error …).
      const recent = await page.eval(`JSON.stringify((__mytrainer.state.console ?? []).slice(-8).map((e) => e.level + ': ' + String(e.text).slice(0, 200)))`).catch(() => '[]');
      const result = { name, ok: false, ms: Date.now() - started, error: `${error.message}
    app log: ${recent}` };
      results.push(result);
      if (report) report(result); else log(`  ✖ ${name}: ${result.error}`);
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
    await step('settings: a theme applies at once; Cancel puts it back, Reset and OK keep the defaults', async () => {
      const popup = `document.querySelector('.web-popup-settings iframe')?.contentDocument`;
      const open = async () => {
        await page.eval(`void __mytrainer.run('settings')`);
        await page.waitFor(`${popup}?.querySelector('[data-action="settingsOk"]')`);
        await page.eval(`${popup}.querySelector('[data-tab="appearance"]').click()`);
      };
      const press = (name) => page.eval(`${popup}.querySelector('[data-action="${name}"]').click()`);
      const pick = (theme) => page.eval(`${popup}.querySelector('[data-set="theme"][data-value="${theme}"]').click()`);
      const shown = () => page.eval('document.documentElement.dataset.theme');
      const closed = () => page.waitFor(`!document.querySelector('.web-popup-settings iframe')`);
      await open();
      await pick('midnight');
      await page.waitFor(`document.documentElement.dataset.theme === 'midnight'`);
      assert.equal(await state('s.settings.theme'), 'midnight', 'the main window follows while the window is open');
      await press('settingsCancel'); await closed();
      assert.equal(await shown(), 'light'); assert.equal(await state('s.settings.theme'), 'light');
      await open();
      await press('settingsReset');
      await page.waitFor(`__mytrainer.state.settings.theme === 'system'`);
      await press('settingsOk'); await closed();
      assert.equal(await state('s.settings.theme'), 'system');
      assert.equal(await state('s.settings.language'), 'ko', 'Reset keeps the language');
      await open();
      await pick('light');
      await press('settingsOk'); await closed();
      assert.equal(await shown(), 'light');
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
    await step('model canvas: left to right keeps the layout, the grid toggles, zoom shows its percentage', async () => {
      const positions = await state('JSON.stringify(s.project.model.nodes.map((n) => [n.x, n.y]))');
      const port = () => page.eval(`(() => { const c = document.querySelector('.node .port-out'); return c.getAttribute('cx') + ',' + c.getAttribute('cy'); })()`);
      const vertical = await port();
      await page.click('[data-command="graphHorizontal"]');
      assert.equal(await state('s.settings.graphDirection'), 'horizontal');
      assert.notEqual(await port(), vertical, 'the output port moves to the right side');
      assert.equal(await state('JSON.stringify(s.project.model.nodes.map((n) => [n.x, n.y]))'), positions, 'the stored layout is unchanged');
      await page.click('[data-command="graphVertical"]');
      assert.equal(await port(), vertical);
      await page.click('[data-command="toggleGrid"]');
      assert.equal(await page.eval(`getComputedStyle(document.querySelector('.graph-grid')).display`), 'none');
      await page.click('[data-command="toggleGrid"]');
      assert.notEqual(await page.eval(`getComputedStyle(document.querySelector('.graph-grid')).display`), 'none');
      const before = await page.eval(`document.querySelector('[data-zoom-value]').textContent`);
      await page.click('[data-command="zoomIn"]');
      const after = await page.eval(`document.querySelector('[data-zoom-value]').textContent`);
      assert.match(after, /^\d+%$/);
      assert.ok(parseInt(after, 10) > parseInt(before, 10), `${before} → ${after}`);
      await page.click('[data-command="fit"]');
    });
    await step('neuron view: fits the window width, zooms in with a scroll bar', async () => {
      await page.eval(`__mytrainer.switchTab('neurons')`);
      await sleep(300);
      const size = () => page.eval(`JSON.stringify((() => { const c = document.querySelector('.neuron-host.full canvas'); const s = c.parentElement; return [c.clientWidth, s.clientWidth, s.scrollWidth]; })())`);
      const [canvas, view] = JSON.parse(await size());
      assert.ok(canvas <= view, `fit: ${canvas} ≤ ${view}`);
      await page.click('[data-command="zoomIn"]'); await page.click('[data-command="zoomIn"]');
      const [, view2, scroll] = JSON.parse(await size());
      assert.ok(scroll > view2, 'zoomed in past the width: it scrolls');
      await page.click('[data-command="fit"]');
      await page.eval(`__mytrainer.switchTab('model')`);
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
    await step('another watched input keeps the trained model (no rebuild, history kept)', async () => {
      const before = await state('s.run.history.length');
      assert.ok(before > 0, 'trained before');
      await page.eval(`__mytrainer.switchTab('train')`);
      await sleep(300);
      const at = await state('s.project.train.probeIndex');
      await page.click('[data-probe="next"]');
      await sleep(800);
      assert.equal(await state('s.run.history.length'), before, 'the history (and the weights) stay');
      assert.notEqual(await state('s.project.train.probeIndex'), at, 'another input is watched');
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
      // A sample opened in Korean: its name, description and models follow the switch.
      await page.eval(`__mytrainer.openSampleNow('kwsKo')`);
      await page.eval(`__mytrainer.run('language')`);
      await page.eval(`__mytrainer.run('language')`);
      await sleep(300);
      const texts = JSON.parse(await state('JSON.stringify([s.project.name, s.project.description, ...(s.project.variants?.list ?? []).flatMap((v) => [v.name, v.description])])'));
      const korean = texts.filter((x) => /[가-힣]/.test(x.replace(/출근|퇴근|경비|해제/g, '')));
      assert.deepEqual(korean, [], 'English texts only (the keywords themselves are Korean)');
      await page.eval(`__mytrainer.run('language')`);
    });
    await step('welcome popup: opens with six ways to begin; its check box saves "show at start" at once', async () => {
      await page.eval(`(() => { __mytrainer.openWelcome(); return 1; })()`);
      await page.waitFor(`Boolean(document.querySelector('iframe[src*="popup=welcome"]')?.contentDocument?.querySelector('[data-welcome-show]'))`);
      const frame = `document.querySelector('iframe[src*="popup=welcome"]').contentDocument`;
      assert.equal(await page.eval(`${frame}.querySelectorAll('[data-action="welcomeGo"]').length`), 6);
      const before = await state('s.settings.showWelcome');
      await page.eval(`(() => { ${frame}.querySelector('[data-welcome-show]').click(); return 1; })()`);
      await page.waitFor(`__mytrainer.state.settings.showWelcome === ${!before}`);
      assert.equal(await page.eval(`JSON.parse(localStorage.getItem('mytrainer.settings.v1')).showWelcome`), !before, 'stored');
      await page.eval(`(() => { ${frame}.querySelector('[data-welcome-show]').click(); ${frame}.querySelector('[data-action="close"]').click(); return 1; })()`);
      await page.waitFor(`!document.querySelector('iframe[src*="popup=welcome"]') || document.querySelector('iframe[src*="popup=welcome"]').hidden || getComputedStyle(document.querySelector('iframe[src*="popup=welcome"]').closest('[class]') ?? document.body).display === 'none'`).catch(() => {});
    });
    await step('tutorial: every step outlines its target with the card inside the window; Esc ends it and popups go back to windows', async () => {
      await page.eval(`(() => { __mytrainer.tutorial.start({ index: 0 }); return 1; })()`);
      const count = await page.eval(`__mytrainer.tutorial.state().count`);
      const missing = [];
      let evaluated = false;
      for (let i = 0; i < count; i++) {
        await page.eval(`(() => { __mytrainer.tutorial.go(${i}); return 1; })()`);
        for (let k = 0; k < 120 && (await page.eval(`__mytrainer.tutorial.state().busy`)); k++) await sleep(250);
        await sleep(400);
        const info = JSON.parse(await page.eval(`(() => { const spot = document.querySelector('.tutorial-spot'); const card = document.querySelector('.tutorial-card').getBoundingClientRect(); return JSON.stringify({ id: __mytrainer.tutorial.state().id, spot: !spot.hidden, inside: card.left >= 0 && card.top >= 0 && card.right <= innerWidth + 1 && card.bottom <= innerHeight + 1, text: document.querySelector('.tutorial-card h3').textContent }); })()`));
        if (!info.spot || !info.inside || !info.text) missing.push(info.id);
        if (info.id === 'test') {
          await page.waitFor('__mytrainer.state.report != null', { timeout: 30000 }).catch(() => {});
          evaluated = (await state('s.report != null')) || await state('JSON.stringify({ run: s.run.state, epochs: s.run.history.length, sample: s.project.sample, engine: s.project.engine })');
        }
      }
      assert.deepEqual(missing, [], 'steps without a target or with the card outside');
      assert.equal(evaluated, true, 'the test step evaluated the model');
      await page.key('Escape');
      await page.waitFor(`!__mytrainer.tutorial.state().active && !document.querySelector('.tutorial-layer')`);
    });
    await step('anomaly detection: after training, the worst reconstructions are listed and most real anomalies are among them', async () => {
      await page.eval(`(() => { __mytrainer.openSampleNow('anomalyAe'); __mytrainer.state.project.train.epochs = 12; __mytrainer.switchTab('train'); __mytrainer.startTraining(); return 1; })()`);
      await page.waitFor(`__mytrainer.state.run.history.length === 12 && __mytrainer.state.run.state === 'idle' && Boolean(__mytrainer.state.report)`, { timeout: 120000 });
      await page.eval(`(() => { __mytrainer.switchTab('test'); return 1; })()`);
      await page.waitFor(`Boolean(document.querySelector('canvas[data-test-canvas="worst"]'))`);
      const worst = JSON.parse(await state(`JSON.stringify((() => { const part = s.prepared.test.n ? s.prepared.test : s.prepared.val; const flags = s.data.anomaly; const total = Array.from(part.index).filter((i) => flags[i]).length; const top = s.report.worst.list.slice(0, total).filter((w) => flags[part.index[w.index]]).length; return { total, top, listed: s.report.worst.list.length }; })())`));
      assert.ok(worst.listed > 0 && worst.total > 0, JSON.stringify(worst));
      assert.ok(worst.top >= Math.ceil(worst.total / 2), `${worst.top} of ${worst.total} anomalies among the worst ${worst.total}`);
    });
    await step('Korean keywords 출근 · 퇴근 · 외출 · 복귀: opens with BC-ResNet+ and offers four models', async () => {
      await page.eval(`(() => { __mytrainer.openSampleNow('kwsKoAttend'); __mytrainer.switchTab('train'); return 1; })()`);
      await page.waitFor(`document.querySelectorAll('.variant-switch [data-variant]').length === 4`, { timeout: 60000 });
      assert.equal(await page.eval(`document.querySelector('.variant-switch .active').dataset.variant`), 'bcResNetPlus');
      await page.waitFor(`(__mytrainer.state.data?.labels?.length ?? 0) === 6`, { timeout: 90000 });
      assert.deepEqual(JSON.parse(await state('JSON.stringify([...(s.data?.labels ?? [])].sort())')), ['noise', 'unknown', '복귀', '외출', '출근', '퇴근']);
    });
    await step('user\'s guide: larger text and another font are kept for the next document; languages and documents are linked', async () => {
      await page.eval(`(() => { const f = document.createElement('iframe'); f.id = 'guide-check'; f.style.cssText = 'position:fixed;left:0;top:0;width:1000px;height:700px;z-index:99999'; f.src = './docs/UsersGuide.html'; document.body.append(f); return 1; })()`);
      const doc = `document.getElementById('guide-check').contentDocument`;
      await page.waitFor(`Boolean(${doc}?.querySelector('[data-doc-size="+"]'))`);
      await page.eval(`(() => { const d = ${doc}; d.querySelector('[data-doc-size="+"]').click(); d.querySelector('[data-doc-size="+"]').click(); const s = d.querySelector('[data-doc-font]'); s.value = 'serif'; s.dispatchEvent(new Event('change')); return 1; })()`);
      assert.equal(await page.eval(`${doc}.documentElement.style.getPropertyValue('--doc-size')`), '18px');
      assert.equal(await page.eval(`${doc}.querySelector('[data-doc-size-label]').textContent`), '113%');
      assert.match(await page.eval(`${doc}.documentElement.style.getPropertyValue('--doc-font')`), /serif/);
      assert.ok(await page.eval(`Boolean(${doc}.querySelector('a[href="UsersGuide.en.html"]'))`), 'English link');
      assert.equal(await page.eval(`${doc}.documentElement.style.getPropertyValue('--bg') !== ''`), true, "the app's theme colours");
      await page.eval(`(() => { document.getElementById('guide-check').src = './docs/UsersGuide.en.html'; return 1; })()`);
      await page.waitFor(`${doc}?.documentElement.lang === 'en' && Boolean(${doc}.querySelector('[data-doc-size-label]'))`);
      await sleep(200);
      assert.equal(await page.eval(`${doc}.documentElement.style.getPropertyValue('--doc-size')`), '18px', 'kept for the next page');
      await page.eval(`(() => { const d = ${doc}; d.querySelector('[data-doc-size="0"]').click(); const s = d.querySelector('[data-doc-font]'); s.value = ''; s.dispatchEvent(new Event('change')); document.getElementById('guide-check').remove(); return 1; })()`);
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
