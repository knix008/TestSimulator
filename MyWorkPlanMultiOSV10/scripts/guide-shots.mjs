// npm run guide:images — the pictures of the user's guide, taken from the real
// program (the web build in headless Edge or Chrome, 1440 × 900) in Korean and
// English: docs/guide/images/ko/*.png and docs/guide/images/en/*.png. Then
// build:docs copies them next to the HTML pages.
//
// Needs `npm run build:web` (dist/) first; the script runs it when dist/ is older
// than src/.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '../test/e2e/cdp.mjs';
import { WebApp } from '../test/e2e/web.harness.mjs';
import { root } from '../test/e2e/harness.mjs';

const WIDTH = 1440;
const HEIGHT = 900;
const outRoot = path.join(root, 'docs', 'guide', 'images');

const newest = (dir) => fs.readdirSync(dir, { recursive: true }).map((name) => fs.statSync(path.join(dir, name)).mtimeMs).reduce((a, b) => Math.max(a, b), 0);
if (!fs.existsSync(path.join(root, 'dist', 'index.html')) || newest(path.join(root, 'src')) > fs.statSync(path.join(root, 'dist', 'index.html')).mtimeMs) {
  execFileSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: root, stdio: 'inherit' });
}

const app = new WebApp();
await app.start();
const page = app.main;
await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
await sleep(500);
const A = (expression) => page.eval(`(async () => { const w = window.__myworkplan; const a = w.actions; const api = w.api; ${expression}; return 1; })()`);
const closePopups = () => A('await w.popups.closeAll()').catch(() => {});
const settle = (ms = 700) => sleep(ms);

/** A plan of the start page's samples in a fresh state: no other tabs, no popups, the view chosen. */
async function sample(id, view = 'gantt') {
  await closePopups();
  await A(`for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); ${id === 'website-redesign' ? 'a.openSampleBuiltin()' : `a.openSample(${JSON.stringify(id)})`}; a.switchView(${JSON.stringify(view)})`);
  await settle(600);
}

const SHOTS = [
  ['start', async () => { await closePopups(); await A(`for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); a.updateSettings({ startLayout: null, animation: 'aurora', backgroundKind: 'animated', animationInterval: 0 }); a.showStartPage()`); await page.eval(`(document.querySelector('#start-page .start-scroll').scrollTop = 0, 1)`); }],
  ['start-samples', async () => { await page.eval(`(() => { const box = document.querySelector('#start-page .start-scroll'); const card = document.querySelector('.start-card-samples'); box.scrollTop += card.getBoundingClientRect().top - box.getBoundingClientRect().top - 12; return 1; })()`); }],
  ['start-background', async () => { await page.eval(`(() => { const box = document.querySelector('#start-page .start-scroll'); box.scrollTop = box.scrollHeight; return 1; })()`); }],
  ['gantt', () => sample('website-redesign')],
  ['task-info', async () => { await sample('website-redesign'); await A(`a.selectTask(api.project().tasks[2].id); w.run('taskInfo')`); await settle(900); }],
  ['critical-path', async () => { await sample('factory-build'); await A(`w.run('criticalPath')`); }],
  ['tracking', () => sample('mobile-app', 'tracking')],
  ['task-sheet', () => sample('erp-rollout', 'taskSheet')],
  ['task-usage', () => sample('erp-rollout', 'taskUsage')],
  ['network', () => sample('cloud-migration', 'network')],
  ['calendar', () => sample('wedding', 'calendar')],
  ['timeline', () => sample('product-campaign', 'timeline')],
  ['resource-sheet', () => sample('apartment-remodel', 'resourceSheet')],
  ['resource-usage', () => sample('website-redesign', 'resourceUsage')],
  ['resource-graph', () => sample('website-redesign', 'resourceGraph')],
  ['team-planner', () => sample('music-festival', 'teamPlanner')],
  ['reports', () => sample('brand-renewal', 'reports')],
  ['baseline', async () => { await sample('website-redesign'); await A(`w.run('setBaseline')`); await settle(900); }],
  ['leveling', async () => { await sample('website-redesign'); await A(`w.run('levelingOptions')`); await settle(900); }],
  ['print', async () => { await sample('speaker-development'); await A(`w.run('print')`); await settle(1800); }],
  ['settings-start', async () => { await closePopups(); await A(`a.showStartPage(); w.popups.open('settings', { tab: 'start' })`); await settle(900); }],
  ['tutorial', async () => { await closePopups(); await A(`a.startTutorial({ index: 9 })`); await settle(2500); }],
  // Document windows (their own windows in the app; drawn here as a frame over it, as during the tutorial).
  ['video', async () => { await A(`await w.tutorial?.()?.stop?.()`).catch(() => {}); await closePopups(); await A(`a.showStartPage(); w.popups.inline = true; a.openDocWindow('video')`); await settle(1800); await A(`w.popups.inline = false`); }],
  // Wages: the Costs tab of a salaried person, and the labor cost report.
  ['resource-wage', async () => {
    await sample('website-redesign', 'resourceSheet');
    await A(`a.setViewOptions({ resourceTable: 'labor' }); void a.openResourceInfo(api.project().resources.find((r) => r.wage?.basis === 'month').id)`);
    await settle(900);
    await page.eval(`(() => { const f = document.querySelector('.web-popup-resource iframe'); f?.contentDocument?.querySelector('.tabs [data-value="costs"]')?.click(); return 1; })()`);
    await settle(700);
  }],
  ['labor-report', async () => { await sample('website-redesign'); await A(`a.activeDoc().view.report = 'labor'; a.switchView('reports')`); }],
  // The bottom panel (schedule check): open on the overallocation tab, then folded with the side panels folded too.
  ['bottom-panel', async () => { await sample('website-redesign'); await A(`a.updateSettings({ showBottomPanel: true, bottomPanelCollapsed: false, bottomPanelTab: 'problems', bottomPanelHeight: 300 })`); }],
  ['panels-folded', async () => { await sample('website-redesign'); await A(`a.updateSettings({ showLeftPanel: false, showRightPanel: false, bottomPanelCollapsed: true })`); }],
  ['guide-window', async () => { await closePopups(); await A(`a.showStartPage(); w.popups.inline = true; a.openDocWindow('guide')`); await settle(2200); await A(`w.popups.inline = false`); }],
];

try {
  for (const language of ['ko', 'en']) {
    const dir = path.join(outRoot, language);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    await closePopups();
    await A(`a.updateSettings({ language: ${JSON.stringify(language)}, tutorialDone: true, tutorialOffered: true, showLeftPanel: true, showRightPanel: true, showBottomPanel: true, bottomPanelCollapsed: false, bottomPanelHeight: 200, bottomPanelTab: 'problems' })`);
    await settle(500);
    for (const [index, [name, prepare]] of SHOTS.entries()) {
      await prepare();
      await settle();
      const shot = await page.send('Page.captureScreenshot', { format: 'png' });
      const file = path.join(dir, `${String(index + 1).padStart(2, '0')}-${name}.png`);
      fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
      process.stdout.write(`\r${language} ${index + 1}/${SHOTS.length} ${name}                 `);
    }
    process.stdout.write('\n');
  }
  await A(`await w.tutorial?.()?.stop?.()`).catch(() => {});
} finally {
  await app.stop();
}
console.log(`docs/guide/images/{ko,en}: ${SHOTS.length} pictures each`);
