// A quick look at the running web app: opens samples, runs them and saves screenshots of every view
// into test-results/explore (not part of npm test).
//   node test/e2e/explore.mjs [sampleId …]
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startVite, launchBrowser, sleep, waitFor } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const shots = path.join(root, 'test-results', 'explore');
fs.mkdirSync(shots, { recursive: true });
const vite = await startVite(root);
const { cdp, errors, stop } = await launchBrowser(vite.url, { width: 1600, height: 960 });
const js = (e) => cdp.evaluate(e);
const shot = async (name) => { await sleep(350); await cdp.screenshot(path.join(shots, `${name}.png`)); console.log('shot', name, errors.length ? `errors: ${errors.join(' | ')}` : ''); };
try {
  await js('window.__mysim.api.patchSettings({ language: process?.env?.LANG === "ko" ? "ko" : "ko" })').catch(() => {});
  await shot('00-start');
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['signalCleanup'];
  for (const id of ids) {
    await js(`(async () => { const { sampleModel } = await import('/src/core/samples.js'); window.__mysim.api.openModel(sampleModel(${JSON.stringify(id)}, window.__mysim.state.settings.language), null); })()`);
    await sleep(400);
    await shot(`${id}-1-graph`);
    await js('window.__mysim.api.runPipeline()');
    await waitFor(async () => !(await js('window.__mysim.state.running')), 60000, 200);
    await shot(`${id}-2-ran`);
    const first = await js('window.__mysim.doc().model.nodes.find((n) => n.type !== "out.plot" && n.type !== "out.kpi")?.id');
    await js(`window.__mysim.api.select({ kind: 'node', ids: [${JSON.stringify(first)}] })`);
    await shot(`${id}-3-selected`);
    await js('window.__mysim.api.setView("dashboard")');
    await shot(`${id}-4-dashboard`);
    await js('window.__mysim.api.setView("data")');
    await shot(`${id}-5-data`);
    await js('window.__mysim.api.setView("graph")');
  }
  console.log('errors:', errors.length ? errors : 'none');
} finally {
  await stop();
  await vite.stop?.();
  process.exit(0);
}
