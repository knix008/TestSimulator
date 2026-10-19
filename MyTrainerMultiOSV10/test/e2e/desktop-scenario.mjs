// Development helper: the desktop app trains a sample with the PyTorch engine.
//   MYTRAINER_PYTHON=<python with torch> SAMPLE=digitsCnn node test/e2e/desktop-scenario.mjs
import { App } from './desktop.harness.mjs';
import { sleep } from './cdp.mjs';

const sample = process.env.SAMPLE ?? 'spiral';
const app = await new App({ env: process.env.MYTRAINER_PYTHON ? { MYTRAINER_PYTHON: process.env.MYTRAINER_PYTHON } : {}, storage: { 'mytrainer.settings.v1': { language: 'ko', showStartPage: false, theme: 'light' } } }).start();
const page = app.main;
const shot = async (name) => { await sleep(700); await page.screenshot(`test-results/desktop-${sample}-${name}.png`); console.log('shot', name); };
try {
  await page.eval(`__mytrainer.openSampleNow('${sample}')`);
  await sleep(1000);
  await page.eval(`(() => { __mytrainer.state.project.train.epochs = Number(${process.env.EPOCHS ?? 8}); __mytrainer.setEngine('torch'); __mytrainer.switchTab('train'); })()`);
  await page.waitFor('__mytrainer.state.python && __mytrainer.api.pythonInfo()', { timeout: 120000, interval: 500, message: 'python detection' });
  console.log('python', await page.eval('JSON.stringify(__mytrainer.api.pythonInfo())'));
  await page.eval('__mytrainer.startTraining()');
  await page.waitFor(`__mytrainer.state.run.state === 'serving' || __mytrainer.state.console.some((e) => e.level === 'error')`, { timeout: 300000, interval: 500, message: 'torch training' });
  await sleep(1500);
  console.log('run', await page.eval('JSON.stringify({ state: __mytrainer.state.run.state, epochs: __mytrainer.state.run.history.length, last: __mytrainer.state.run.history.at(-1), snapshotNodes: Object.keys(__mytrainer.state.snapshot?.nodes ?? {}).length, report: __mytrainer.state.report && __mytrainer.state.report.accuracy })'));
  await shot('trained');
  await page.eval(`__mytrainer.switchTab('test')`);
  await sleep(3000);
  console.log('probe output', await page.eval('JSON.stringify(Array.from(__mytrainer.api.probeOutput() ?? []))'));
  await shot('test');
  await page.eval(`__mytrainer.switchTab('code')`);
  await sleep(800);
  await shot('code');
} finally {
  console.log('errors:', JSON.stringify(page.errors.slice(0, 10), null, 1));
  console.log('console:', await page.eval('JSON.stringify(__mytrainer.state.console.filter((e) => e.level !== "info").map((e) => `${e.level}: ${e.text}`).slice(-15))').catch(() => '[]'));
  await app.close();
}
