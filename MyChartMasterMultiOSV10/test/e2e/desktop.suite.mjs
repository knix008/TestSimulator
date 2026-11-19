// The desktop E2E cases: the real program (debug build) over WebView2's DevTools port (test/e2e/desktop.harness.mjs),
// run by scripts/test.mjs (npm test, category "desktop"). What only the desktop program does: native file read and
// write (charts, data files, exports), AVIF encoding in Rust, popups as OS windows, the printer list (nothing is
// printed), document windows — and the user's requests in the real window: 108 chart types, chart themes,
// the background following the program theme, the start page layout.
import fs from 'node:fs';
import path from 'node:path';
import { connect, root } from './desktop.harness.mjs';
import { appVersion, buildStub, installerTestable, runStub } from './installer.mjs';
import { CHART_TYPES } from '../../src/domain/chart/types.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
let app = null;
const run = (body) => app.run(body);
const CASES = [];
const test = (id, name, fn) => CASES.push({ id, name, fn });

test('app.start', 'The program starts, shows the start page and reports its build', async () => {
  await run(`await until(() => A && document.querySelector('.start-board')); return true;`);
  const state = await run(`return { info: A.state.info, desktop: !!window.__TAURI_INTERNALS__, cards: document.querySelectorAll('.start-board > .start-card').length };`);
  assert(state.desktop, 'not running inside Tauri');
  assert(state.info?.version && state.info?.os, `app info: ${JSON.stringify(state.info)}`);
  assert(state.cards >= 6, `${state.cards} start cards`);
});

test('files.openSave', 'Open a .mychart from disk, save it elsewhere, reopen: same chart', async () => {
  const sample = path.join(root, 'samples', 'monthly-sales.mychart');
  const saved = path.join(app.temp, 'saved.mychart');
  const r = await run(`const d = await A.actions.openPath(${JSON.stringify(sample)}); const rows = d.table.rows.length;
    A.actions.setChartType('line'); window.__mychartmasterSavePicks = [${JSON.stringify(saved)}];
    await A.actions.saveDoc(d, { saveAs: true }); await A.actions.closeDoc(d, { force: true });
    const again = await A.actions.openPath(${JSON.stringify(saved)}); return { rows, again: again?.table.rows.length, type: again?.chart.type, dirty: again?.dirty };`);
  assert(fs.existsSync(saved), 'file not written');
  assert(JSON.parse(fs.readFileSync(saved, 'utf8')).format === 'mychart', 'not a .mychart file');
  assert(r.again === r.rows && r.type === 'line' && !r.dirty, JSON.stringify(r));
});

test('files.importData', 'Data files from disk: Excel, CSV, JSON, XML open as charts', async () => {
  const dir = path.join(root, 'samples', 'data').replace(/\\/g, '/');
  const r = await run(`const out = {}; for (const f of ['monthly-sales.xlsx', 'monthly-sales.csv', 'monthly-sales.json', 'monthly-sales.xml']) { const d = await A.actions.openPath(${JSON.stringify(dir)} + '/' + f, { quiet: true }); out[f] = d ? [d.table.rows.length, d.table.columns.length] : null; } return out;`);
  for (const [name, got] of Object.entries(r)) assert(got && got[0] === 12 && got[1] === 4, `${name}: ${JSON.stringify(got)}`);
});

test('export.files', 'Exports written by the program: PNG, AVIF (Rust encoder), SVG, PDF, Word, Excel data', async () => {
  const formats = ['png', 'avif', 'svg', 'pdf', 'docx'];
  const picks = formats.map((f) => path.join(app.temp, `chart.${f}`));
  const xlsx = path.join(app.temp, 'data.xlsx');
  await run(`await A.actions.openSample('market-share'); window.__mychartmasterSavePicks = ${JSON.stringify([...picks, xlsx])};
    for (const f of ${JSON.stringify(formats)}) await A.actions.exportChartAs({ format: f, scale: 1 }); await A.actions.exportDataAs('xlsx'); return true;`);
  const head = (name, n = 12) => fs.readFileSync(path.join(app.temp, name)).subarray(0, n);
  assert(head('chart.png').subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])), 'png');
  assert(head('chart.avif').subarray(4, 12).toString('latin1') === 'ftypavif', 'avif');
  assert(fs.readFileSync(path.join(app.temp, 'chart.svg'), 'utf8').includes('<svg'), 'svg');
  assert(head('chart.pdf').subarray(0, 5).toString('latin1') === '%PDF-', 'pdf');
  assert(head('chart.docx').subarray(0, 2).toString('latin1') === 'PK' && head('data.xlsx').subarray(0, 2).toString('latin1') === 'PK', 'docx / xlsx');
});

test('popups.windows', 'Popups are OS windows of their own (settings, export, print)', async () => {
  await run(`await A.actions.openSample('monthly-sales'); return true;`);
  for (const [open, label] of [[`A.popups.open('settings', { tab: 'charts' })`, 'popup=settings'], [`A.run('exportChart')`, 'popup=export'], [`A.run('print')`, 'popup=print']]) {
    await run(`${open}; return true;`);
    const deadline = Date.now() + 10000;
    let found = null;
    while (!found && Date.now() < deadline) { found = (await app.targets()).find((t) => t.url.includes(label) || t.title === label.replace('popup=', 'popup-')); if (!found) await sleep(200); }
    assert(found, `no OS window for ${label}`);
  }
});

test('print.printers', 'The print window lists the printers (no page is sent to a printer)', async () => {
  const deadline = Date.now() + 10000;
  let target = null;
  while (!target && Date.now() < deadline) { target = (await app.targets()).find((t) => t.title === 'popup-print' || t.url.includes('popup=print')); if (!target) await sleep(200); }
  assert(target, 'no print window');
  const win = await connect(target);
  // The test hook replaces the real printing: no job may reach a printer.
  await win.evaluate(`window.__mychartmasterPrintHook = (layout, job) => { window.__printed = { pages: layout.pages.length, job }; }; true`);
  const r = await win.evaluate(`(async () => { const end = Date.now() + 10000; while (Date.now() < end && !document.querySelector('.pp-stage svg')) await new Promise((r) => setTimeout(r, 100));
    const options = [...document.querySelectorAll('[data-print="printer"] option')].length; document.querySelector('[data-action="print-now"]').click(); await new Promise((r) => setTimeout(r, 300)); return { options, printed: window.__printed }; })()`);
  win.close();
  await run(`await A.popups.closeAll(); return true;`);
  assert(r.printed?.pages >= 1, 'print window did not lay out pages');
  assert(r.options >= 1 || r.printed.job.printer === '', 'no printer list and no fallback');
});

test('docs.window', "The user's guide opens in its own window", async () => {
  await run(`A.run('userGuide'); return true;`);
  const deadline = Date.now() + 15000;
  let found = null;
  while (!found && Date.now() < deadline) {
    for (const t of (await app.targets()).filter((x) => x.type === 'page')) {
      const win = await Promise.race([connect(t), sleep(3000).then(() => null)]).catch(() => null);
      if (!win) continue;
      const label = await Promise.race([win.evaluate('window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label ?? ""'), sleep(2000).then(() => '')]).catch(() => '');
      const ready = label === 'doc-guide' ? await win.evaluate(`(async () => { const end = Date.now() + 8000; while (Date.now() < end) { const f = document.querySelector('iframe'); if (f?.contentDocument?.querySelector('h1')?.textContent.includes('MyChartMaster')) return true; await new Promise((r) => setTimeout(r, 200)); } return false; })()`).catch(() => false) : false;
      win.close();
      if (label === 'doc-guide') { found = { ready }; break; }
    }
    if (!found) await sleep(300);
  }
  assert(found, 'no guide window');
  assert(found.ready, 'the guide window shows no MyChartMaster document');
});


test('chart.allTypes', 'Each of the 108 chart types draws its starter data in the program window', async () => {
  const r = await run(`const bad = []; for (const id of A.domain.CHART_IDS) { A.actions.newChart(id); await until(() => document.querySelector('.ch-canvas svg') && A.doc()?.chart.type === id, 8000);
      if (!document.querySelectorAll('.ch-canvas .mark').length) bad.push(id); await A.actions.closeDoc(A.doc(), { force: true }); } return { n: A.domain.CHART_IDS.length, bad };`);
  assert(r.n === CHART_TYPES.length && !r.bad.length, JSON.stringify(r));
});

test('chart.themes', 'Chart theme per chart; the background follows the program theme (light and dark)', async () => {
  const r = await run(`await A.actions.openSample('monthly-sales'); await sleep(200); const bg = () => document.querySelector('.ch-canvas .chart-bg')?.getAttribute('fill');
    const surface = () => getComputedStyle(document.documentElement).getPropertyValue('--surface').trim().toLowerCase();
    A.actions.updateSettings({ theme: 'light' }); await sleep(150); const light = [bg(), surface()];
    A.actions.updateSettings({ theme: 'dark' }); await sleep(150); const dark = [bg(), surface()];
    await A.run('chartTheme:forest'); const theme = A.doc().chart.options.chartTheme; A.actions.updateSettings({ theme: 'light' }); await sleep(100);
    await A.actions.closeDoc(A.doc(), { force: true }); return { light, dark, theme };`);
  assert(r.light[0]?.toLowerCase() === r.light[1] && r.dark[0]?.toLowerCase() === r.dark[1] && r.light[0] !== r.dark[0], JSON.stringify(r));
  assert(r.theme === 'forest', r.theme);
});

test('start.layout', 'Start page in the program window: New chart full width, Recent under it, one-line tiles', async () => {
  const r = await run(`A.actions.showStartPage(true); await sleep(300); document.querySelector('[data-start="arrange"]').click(); await sleep(400);
    const b = document.querySelector('.start-board').getBoundingClientRect(); const nc = document.querySelector('[data-card="newchart"]').getBoundingClientRect(); const rc = document.querySelector('[data-card="recent"]').getBoundingClientRect();
    const tall = [...document.querySelectorAll('.nc-tile')].filter((t) => t.getBoundingClientRect().height > 46).length;
    return { full: nc.width > b.width - 4, under: rc.top >= nc.bottom && rc.top - nc.bottom < 40, tall, tiles: document.querySelectorAll('.nc-tile').length };`);
  assert(r.full && r.under && !r.tall && r.tiles === CHART_TYPES.length, JSON.stringify(r));
});

// ───────────────────────── installer: the language window, and the program starting in that language

test('installer.languageWindow', 'Installer language window: title = name and version, the program icon in its title bar, choosing English', async () => {
  if (!installerTestable()) return 'skip';
  const stub = buildStub();
  try {
    const r = runStub(stub, 1033, path.join(root, 'test-results', 'desktop', 'installer-language.png'));
    assert(r.window, 'no language window');
    assert(r.title === `MyChartMaster ${appVersion()}`, `title "${r.title}"`);
    assert(r.small !== 0 && r.big !== 0, `title bar icon ${r.small} / ${r.big}`);
    assert(r.closed && r.chosen === '1033', `English chosen → ${r.chosen}`);
  } finally { fs.rmSync(stub.dir, { recursive: true, force: true }); }
});

test('installer.languageChoice', 'Installer language window: Korean installs in Korean, Cancel stops before anything happens', async () => {
  if (!installerTestable()) return 'skip';
  const stub = buildStub();
  try {
    const ko = runStub(stub, 1042);
    assert(ko.closed && ko.chosen === '1042', `Korean chosen → ${ko.chosen}`);
    const cancel = runStub(stub, 0);
    assert(cancel.closed && cancel.chosen === null, `Cancel went on (${cancel.chosen})`);
  } finally { fs.rmSync(stub.dir, { recursive: true, force: true }); }
});

test('installer.programLanguage', 'After installing, the program starts in the installation language (once; the marker is used up)', async () => {
  const r = await run(`return { language: A.state.settings.language, menu: document.querySelector('#menubar [data-menu="file"]')?.textContent.trim() };`);
  assert(r.language === app.installLanguage, `started in ${r.language}, installed in ${app.installLanguage}`);
  assert(/File/.test(r.menu ?? ''), `menu "${r.menu}"`);
  assert(!fs.existsSync(app.languageMarker), 'the installer marker was not used up');
});

const GROUPS = { installer: 'Installer', app: 'Launch', files: 'Files', export: 'Output', popups: 'Popups', print: 'Printing', docs: 'Help', chart: 'Charts', start: 'Start page' };
export const desktopCases = CASES.map((item) => ({
  group: GROUPS[item.id.split('.')[0]] ?? item.id.split('.')[0],
  name: `${item.id} — ${item.name}`,
  run: async (ctx) => {
    app = ctx;
    try { const outcome = await item.fn(); return outcome === 'skip' ? { skipped: 'not available here' } : undefined; }
    catch (error) { await ctx.screenshot(item.id); throw error; }
  },
}));
