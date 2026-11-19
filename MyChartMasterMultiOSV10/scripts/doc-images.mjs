// npm run doc:images — the pictures of the user's guide and the tutorial document (doc/images/{ko,en}/NN-name.png).
//
// Builds the web app into a temporary folder (never dist/), serves it, and drives it in a headless Edge / Chrome
// (test/e2e/browser.mjs) once per language: the start page, sample charts of many types, the panels, every popup.
// Every picture comes from the real app in that language; both folders get the same file names.
//
//   node scripts/doc-images.mjs                     both languages, every picture
//   node scripts/doc-images.mjs --lang en           one language
//   node scripts/doc-images.mjs --only 04,export    only pictures whose name contains one of the words
//   node scripts/doc-images.mjs --web <folder>      use an existing web build instead of building one
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, serve } from '../test/e2e/browser.mjs';

// Vite cannot glob node_modules from a lower-case drive path (d:/…) on Windows: use an upper-case drive letter.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..').replace(/^([a-z]):/, (_, d) => `${d.toUpperCase()}:`);
const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const languages = option('--lang') ? [option('--lang')] : ['ko', 'en'];
const only = option('--only')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let web = option('--web');
let temp = null;
if (!web) {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mychartmaster-docimg-'));
  web = path.join(temp, 'dist');
  execFileSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', web, '--emptyOutDir', '--logLevel', 'error'], { cwd: root, stdio: 'inherit' });
}

/** [file name, setup body (runs in the page with A = the app), what to capture: 'page' | popup kind]. */
const SHOTS = [
  ['01-start', `A.actions.showStartPage(true); A.actions.updateSettings({ animation: 'bars', backgroundKind: 'animated' }); await sleep(1200);`, 'page'],
  ['02-chart-view', `A.actions.openSample('monthly-sales'); await sleep(900);`, 'page'],
  ['03-gallery-line', `A.actions.openSample('temperature-line'); await sleep(900);`, 'page'],
  ['04-donut', `A.actions.openSample('budget-donut'); await sleep(900);`, 'page'],
  ['05-combo-axes', `A.actions.openSample('revenue-profit-combo'); A.api.setInspectorTab('axes'); await sleep(900);`, 'page'],
  ['06-style-tab', `A.actions.openSample('quarterly-stacked'); A.api.setInspectorTab('style'); await sleep(900);`, 'page'],
  ['07-series-tab', `A.actions.openSample('temperature-line'); A.api.setInspectorTab('series'); await sleep(900);`, 'page'],
  ['08-scatter', `A.actions.openSample('height-weight'); await sleep(900);`, 'page'],
  ['09-bubble', `A.actions.openSample('countries-bubble'); await sleep(900);`, 'page'],
  ['10-heatmap', `A.actions.openSample('weekly-heatmap'); A.api.setInspectorTab('more'); await sleep(900);`, 'page'],
  ['11-treemap', `A.actions.openSample('portfolio-treemap'); await sleep(900);`, 'page'],
  ['12-sankey', `A.actions.openSample('energy-sankey'); await sleep(900);`, 'page'],
  ['13-candles', `A.actions.openSample('stock-candles'); await sleep(900);`, 'page'],
  ['14-grid-edit', `A.actions.openSample('regional-bars'); await sleep(600); A.view().grid.setActive(1, 1); A.view().grid.edit('777'); await sleep(400);`, 'page'],
  ['15-grid-right', `A.actions.openSample('monthly-sales'); A.actions.updateSettings({ paneLayout: 'grid-right' }); await sleep(900);`, 'page'],
  ['16-dark', `A.actions.openSample('sales-funnel'); A.actions.updateSettings({ theme: 'dark', paneLayout: 'grid-bottom' }); await sleep(900);`, 'page'],
  ['20-export', `A.actions.updateSettings({ theme: 'light' }); A.actions.openSample('market-share'); await sleep(500); A.run('exportChart');`, 'export'],
  ['21-import', `A.actions.showStartPage(true); await sleep(300); A.api.importText(T.csv, 'sales.csv');`, 'import'],
  ['22-print', `A.actions.openSample('monthly-sales'); await sleep(500); A.run('print');`, 'print'],
  ['23-palette', `A.actions.openSample('monthly-sales'); await sleep(500); A.run('paletteMenu');`, 'palette'],
  ['24-datastats', `A.actions.openSample('salary-boxplot'); await sleep(500); A.run('dataStats');`, 'datastats'],
  ['25-settings', `A.popups.open('settings', { tab: 'charts' });`, 'settings'],
];

const CSV = { ko: '지역,1분기,2분기,3분기\n서울,120,135,128\n부산,80,92,88\n대구,64,70,75\n인천,71,77,82\n', en: 'Region,Q1,Q2,Q3\nNorth,120,135,128\nSouth,80,92,88\nEast,64,70,75\nWest,71,77,82\n' };

const server = await serve(web);
try {
  for (const language of languages) {
    const dir = path.join(root, 'doc', 'images', language);
    fs.mkdirSync(dir, { recursive: true });
    const page = await launch(`${server.url}?nowelcome`, { width: 1600, height: 1000, language });
    try {
      await page.waitFor('!!window.__mychartmaster && !!document.querySelector(".start-board")', 30000);
      await page.eval(`(() => { window.__mychartmaster.actions.updateSettings({ language: '${language}', animationRandom: false, animationInterval: 0, showWelcome: false }); window.__mychartmaster.popups.inline = true; return 1; })()`);
      for (const [name, body, what] of SHOTS) {
        if (only && !only.some((word) => name.includes(word))) continue;
        await page.eval(`(async () => { const A = window.__mychartmaster; const T = { csv: ${JSON.stringify(CSV[language])} }; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          await A.popups.closeAll(); for (const el of document.querySelectorAll('.web-popup, .web-popup-shield')) el.remove(); A.popups.frames.clear();
          for (const d of [...A.state.docs]) await A.actions.closeDoc(d, { force: true });
          A.actions.updateSettings({ paneLayout: 'grid-bottom', theme: '${name.includes('dark') ? 'dark' : 'light'}', textZoom: 0 });
          ${body} return 1; })()`);
        if (what !== 'page') await page.waitFor(`!!document.querySelector('.web-popup-${what} iframe')?.contentDocument?.querySelector('.popup-body')`, 15000);
        await sleep(what === 'page' ? 500 : 1100);
        await page.screenshot(path.join(dir, `${name}.png`));
        console.log(`${language}/${name}.png`);
      }
      if (page.errors.length) console.log('page errors:', page.errors.slice(0, 5).join('\n'));
    } finally {
      await page.close();
    }
  }
} finally {
  await server.close();
  if (temp) fs.rmSync(temp, { recursive: true, force: true });
}
