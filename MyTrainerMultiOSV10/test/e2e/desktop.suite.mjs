// End-to-end checks of the desktop program: importing a CSV file, saving and reopening a project
// (with its trained weights), the Python / PyTorch environment window, and training with the
// PyTorch engine — the generated code and code the user edited — using a Python that already has
// PyTorch (found automatically, or MYTRAINER_PYTHON).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { App, root } from './desktop.harness.mjs';
import { sleep } from './cdp.mjs';

export async function runDesktopSuite({ log = console.log } = {}) {
  const results = [];
  const env = process.env.MYTRAINER_PYTHON ? { MYTRAINER_PYTHON: process.env.MYTRAINER_PYTHON } : {};
  const app = await new App({ env, storage: { 'mytrainer.settings.v1': { language: 'ko', showStartPage: false, theme: 'light', confirmExit: false } } }).start();
  const page = app.main;
  const step = async (name, fn) => {
    try {
      await fn();
      results.push({ name, ok: true });
      log(`  ✔ ${name}`);
    } catch (error) {
      results.push({ name, ok: false, error: error.message });
      log(`  ✖ ${name}: ${error.message}`);
      await page.screenshot(`test-results/fail-desktop-${name.replace(/[^a-z0-9]+/gi, '_')}.png`).catch(() => {});
    }
  };
  const state = (expr) => page.eval(`(() => { const s = __mytrainer.state; return ${expr}; })()`);
  const files = path.join(app.work, 'files');
  try {
    await step('importing a CSV file builds a table dataset and adapts the output layer', async () => {
      await page.eval(`__mytrainer.openSampleNow('spiral')`);
      await page.eval(`window.__mytrainerOpenPicks = [${JSON.stringify(path.join(root, 'samples', 'student-pass.csv'))}]; __mytrainer.run('importCsv')`);
      await page.waitFor(`__mytrainer.state.project.dataset.source.kind === 'table'`, { timeout: 20000 });
      assert.equal(await state('s.data.task.kind'), 'classification');
      assert.equal(await state('s.data.task.classes'), 2);
      assert.equal(await state('s.data.inputShape[0]'), 8, '4 numbers + 4 one-hot club columns');
      assert.equal(await state('s.problems.filter((p) => p.level === "error").length'), 0);
    });
    await step('training the CSV model with TensorFlow.js', async () => {
      await page.eval(`__mytrainer.state.project.train.epochs = 25; __mytrainer.startTraining()`);
      await page.waitFor(`__mytrainer.state.run.state === 'idle' && __mytrainer.state.run.history.length === 25`, { timeout: 180000, interval: 400 });
      assert.ok(await state('s.run.history.at(-1).acc') > 0.75);
    });
    await step('saving and reopening a project keeps the model, the data recipe and the trained weights', async () => {
      const file = path.join(files, 'students.mytrain');
      await page.eval(`window.__mytrainerSavePicks = [${JSON.stringify(file)}]; __mytrainer.run('saveAs')`);
      await page.waitFor(`!__mytrainer.state.dirty && __mytrainer.state.path`, { timeout: 20000 });
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.equal(saved.format, 'mytrainer');
      assert.ok(saved.weights?.data, 'weights stored');
      const nodes = await state('s.project.model.nodes.length');
      await page.eval(`__mytrainer.openSampleNow('xor')`);
      await page.eval(`window.__mytrainerOpenPicks = [${JSON.stringify(file)}]; __mytrainer.run('open')`);
      await page.waitFor(`__mytrainer.state.path && __mytrainer.state.path.endsWith('students.mytrain')`, { timeout: 20000 });
      assert.equal(await state('s.project.model.nodes.length'), nodes);
      assert.equal(await state('s.project.dataset.source.kind'), 'table');
      assert.equal(await state('s.recent[0].path.endsWith("students.mytrain")'), true);
    });
    await step('the Python / PyTorch window lists the Pythons found', async () => {
      await page.eval(`__mytrainer.run('pyenv')`);
      const popup = await app.popup('pyenv', 20000);
      await popup.waitFor(`document.querySelectorAll('.py-table tbody tr').length > 0 && !document.querySelector('.py-status.busy')`, { timeout: 180000, interval: 500 });
      const status = await popup.eval(`document.querySelector('.py-status').className`);
      log(`    ${await popup.eval(`document.querySelector('.py-status').textContent.trim().slice(0, 120)`)}`);
      assert.match(status, /ok|warn/);
      await popup.eval(`document.querySelector('[data-action="close"]').click()`);
      popup.close();
    });
    const hasTorch = await page.waitFor(`__mytrainer.state.python`, { timeout: 180000, interval: 500 }).then(() => state('Boolean(__mytrainer.api.pythonInfo()?.torch)'));
    if (!hasTorch) {
      log('  - PyTorch is not installed on this computer: the PyTorch engine checks are not run');
    } else {
      await step('training with the PyTorch engine (generated code), then testing while the run serves', async () => {
        await page.eval(`__mytrainer.openSampleNow('gruPatterns'); __mytrainer.state.project.train.epochs = 3; __mytrainer.setEngine('torch')`);
        await page.eval(`__mytrainer.startTraining()`);
        await page.waitFor(`__mytrainer.state.run.state === 'serving'`, { timeout: 240000, interval: 500 });
        assert.equal(await state('s.run.history.length'), 3);
        assert.ok(await state('Object.keys(s.snapshot.nodes).length === s.project.model.nodes.length'), 'every node traced');
        await page.eval(`__mytrainer.switchTab('test')`);
        await page.waitFor(`__mytrainer.state.snapshot?.reason === 'probe' && __mytrainer.api.probeOutput()?.length === 4`, { timeout: 30000 });
        await page.eval(`__mytrainer.run('stop')`);
        await page.waitFor(`__mytrainer.state.run.state === 'idle'`, { timeout: 20000 });
      });
      await step('running code the user edited', async () => {
        await page.eval(`(() => { const p = __mytrainer.state.project; p.code = { text: p.code.text.replace('def main():', 'def main():\\n    print("hello from my code")'), custom: true }; p.train.epochs = 1; })()`);
        await page.eval(`__mytrainer.startTraining()`);
        await page.waitFor(`__mytrainer.state.console.some((e) => e.text.includes('hello from my code'))`, { timeout: 120000, interval: 500 });
        await page.waitFor(`__mytrainer.state.run.state === 'serving'`, { timeout: 120000, interval: 500 });
        await page.eval(`__mytrainer.run('stop')`);
      });
      await step('a Python error in edited code is reported in the console', async () => {
        await page.eval(`(() => { const p = __mytrainer.state.project; p.code = { text: p.code.text.replace('def main():', 'def main():\\n    raise ValueError("broken on purpose")'), custom: true }; })()`);
        await page.eval(`__mytrainer.startTraining()`);
        await page.waitFor(`__mytrainer.state.console.some((e) => e.level === 'error' && e.text.includes('broken on purpose'))`, { timeout: 120000, interval: 500 });
        await page.waitFor(`__mytrainer.state.run.state === 'idle'`, { timeout: 30000 });
      });
    }
  } finally {
    await app.close();
  }
  return results;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const results = await runDesktopSuite();
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
