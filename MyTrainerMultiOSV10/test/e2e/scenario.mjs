// Development helper: trains a sample in the web build and screenshots the result.
//   SAMPLE=spiral EPOCHS=40 node test/e2e/scenario.mjs
import { startWeb } from './web.harness.mjs';
import { sleep } from './cdp.mjs';

const sample = process.env.SAMPLE ?? 'spiral';
const epochs = Number(process.env.EPOCHS ?? 40);
const { page, close } = await startWeb({ storage: { 'mytrainer.settings.v1': { language: process.env.LANG_UI ?? 'ko', showStartPage: false, theme: process.env.THEME ?? 'light' } } });
const shot = async (name) => { await sleep(600); await page.screenshot(`test-results/${sample}-${name}.png`); console.log('shot', name); };
try {
  await page.eval(`__mytrainer.openSampleNow('${sample}')`);
  await sleep(800);
  await page.eval(`(() => { const s = __mytrainer.state; s.project.train.epochs = ${epochs}; __mytrainer.switchTab('train'); })()`);
  await sleep(500);
  await page.eval(`__mytrainer.startTraining()`);
  await page.waitFor(`__mytrainer.state.run.state === 'training'`, { timeout: 30000 });
  await sleep(2500);
  await shot('training');
  await page.waitFor(`__mytrainer.state.run.state === 'idle' && __mytrainer.state.run.history.length >= ${epochs}`, { timeout: 600000, interval: 500 });
  await sleep(1200);
  const summary = await page.eval(`JSON.stringify({ last: __mytrainer.state.run.history.at(-1), report: __mytrainer.state.report && { acc: __mytrainer.state.report.accuracy, mae: __mytrainer.state.report.mae } })`);
  console.log('result', summary);
  await shot('trained');
  await page.eval(`__mytrainer.switchTab('model')`);
  await sleep(300);
  await page.eval(`__mytrainer.switchTab('neurons')`);
  await sleep(1500);
  // Select a unit of the second layer.
  await page.eval(`(() => { const order = __mytrainer.api.orderedNodes(); const node = order[Math.min(2, order.length - 1)]; __mytrainer.api.selectUnit({ nodeId: node.id, unit: 1, position: {} }); })()`);
  await sleep(1200);
  await shot('neuron');
  await page.eval(`__mytrainer.switchTab('test')`);
  await sleep(2000);
  await shot('test');
} finally {
  console.log('errors:', JSON.stringify(page.errors.slice(0, 10), null, 1));
  console.log('console errors:', await page.eval('JSON.stringify(__mytrainer.state.console.filter(e => e.level === "error").map(e => e.text).slice(0, 10))').catch(() => '[]'));
  await close();
}
