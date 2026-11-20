// The web E2E cases: the web build in headless Edge (test/e2e/web.harness.mjs), run by scripts/test.mjs (npm test,
// category "web"). Every user-visible feature has a case (test/e2e/features.mjs lists the features and the cases
// that prove them; the last case checks that every feature is covered and passed). commandCases() adds one case per
// chart command (each chart type, chart theme, palette, background and legend command) with what it must change.
//
//   npm test -- --only web                     every case
//   MYCHARTMASTER_E2E_ONLY=<regex> npm test -- --only web    only the cases whose "group name" matches
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURES } from './features.mjs';
import { createTable } from '../../src/domain/data/table.js';
import { exportData, toXlsx } from '../../src/domain/data/exporters.js';
import { writeZip } from '../../src/domain/data/zip.js';
import { CHART_GROUPS, CHART_TYPES } from '../../src/domain/chart/types.js';
import { CHART_THEMES, contrastRatio } from '../../src/domain/chart/palettes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..').replace(/^([a-z]):/, (_, d) => `${d.toUpperCase()}:`);
const out = path.join(root, 'test-results', 'web');
const CHART_COUNT = CHART_TYPES.length;

/** The app of the running case (scripts/test.mjs passes the WebApp to each case). */
let app = null;
const E = (expr) => app.eval(expr);
const run = (body) => app.run(body);
const page = { get errors() { return app.page.errors; }, get console() { return app.page.console; }, screenshot: (file) => app.page.screenshot(file) };
const assert = (ok, message) => { if (!ok) throw new Error(message); };

const CASES = [];
const test = (id, name, fn) => CASES.push({ id, name, fn });
const closeAll = () => run(`await A.popups.closeAll(); for (const el of qa('.web-popup, .web-popup-shield')) el.remove(); A.popups.frames.clear(); for (const d of [...A.state.docs]) await A.actions.closeDoc(d, { force: true }); return true;`);
const openSample = (id) => run(`A.actions.openSample('${id}'); await until(() => svg()); await sleep(150); return marks();`);
const b64 = (bytes) => Buffer.from(bytes).toString('base64');

// ───────────────────────── start page and window chrome

test('start.cards', 'Start page shows every card; the program card is fixed', async () => {
  const r = await run(`A.actions.showStartPage(true); await sleep(300);
    return { cards: qa('.start-board > .start-card').map((x) => x.dataset.card), hero: !!q('.fixed-hero'), heroHandle: !!q('.fixed-hero .card-handle, .fixed-hero .card-resize'), heroInBoard: !!q('.start-board .start-hero'), samples: qa('[data-start="sample"]').length, types: qa('[data-start="new-chart"]').length };`);
  for (const id of ['newchart', 'recent', 'actions', 'samples', 'theme', 'background']) assert(r.cards.includes(id), `card ${id} missing`);
  assert(r.hero && !r.heroHandle && !r.heroInBoard, 'program card must be fixed (no handle / resize, outside the board)');
  assert(r.samples === 31, `${r.samples} sample tiles`);
  assert(r.types === CHART_COUNT, `${r.types} new-chart tiles`);
});

test('start.arrange', 'Start page cards move and Arrange puts them back', async () => {
  const r = await run(`q('[data-start="arrange"]').click(); await sleep(300); return !!q('.start-card[data-card="recent"]').style.gridColumn;`);
  assert(r, 'cards have no grid place');
});

test('start.background', 'Twenty moving chart backgrounds; choosing one draws it', async () => {
  const r = await run(`const chips = qa('[data-start="animation"]'); const kinds = chips.map((x) => x.dataset.value);
    chips.find((x) => x.dataset.value === 'sankey').click(); await sleep(500);
    return { kinds, current: A.state.settings.animation, canvas: !!q('#start-page .start-bg') };`);
  assert(r.kinds.length === 20, `${r.kinds.length} backgrounds`);
  for (const k of ['bars', 'lines', 'pies', 'candles', 'heatmap', 'sankey', 'dashboard']) assert(r.kinds.includes(k), `background ${k}`);
  assert(r.current === 'sankey' && r.canvas, 'background not chosen');
});

test('start.newChart', 'A new-chart tile opens a chart of that type with data', async () => {
  const r = await run(`q('[data-start="new-chart"][data-value="radar"]').click(); await until(() => svg()); await sleep(200); return { type: doc().chart.type, rows: doc().table.rows.length, marks: marks(), tab: qa('.tab').length };`);
  assert(r.type === 'radar' && r.rows > 2 && r.marks > 0 && r.tab === 1, JSON.stringify(r));
  await closeAll();
});

test('chrome.menus', 'Title row: brand, Home and 6 menus; every menu opens with labelled items', async () => {
  await openSample('monthly-sales');
  const r = await run(`const names = qa('#menubar [data-menu]').map((b) => b.dataset.menu); const bad = [];
    for (const name of names) { A.actions.openMenubarMenu(name); const d = await until(() => pop('menu')?.querySelector('.menu-item')); for (const it of d.querySelectorAll('.menu-item')) if (/^[a-z]+\\.[a-zA-Z.:-]+$/.test(it.textContent.trim())) bad.push(it.textContent.trim()); await A.popups.closeAll(); }
    return { names, bad, home: !!q('#menubar [data-home]'), brand: q('.app-brand-name')?.textContent };`);
  assert(r.names.join(',') === 'file,edit,view,data,chart,help', r.names.join(','));
  assert(r.home && r.brand === 'MyChartMaster', 'brand / home');
  assert(!r.bad.length, `raw keys in menus: ${r.bad.slice(0, 5)}`);
});

test('chrome.toolbar', 'Toolbar: coloured icons, nothing clipped at the minimum width, no sideways scroll', async () => {
  const r = await run(`const min = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--min-width'));
    const buttons = qa('#toolbar .tool-button'); const tones = qa('#toolbar .icon[data-tone]').length;
    const bar = q('#toolbar').getBoundingClientRect(); const clipped = buttons.filter((b) => b.getBoundingClientRect().right > bar.right + 1).length;
    return { min, count: buttons.length, tones, clipped, labelled: qa('#toolbar .tool-labeled').map((b) => b.textContent.trim()), scroll: document.documentElement.scrollWidth - innerWidth };`);
  assert(r.count >= 30 && r.tones >= 30, `${r.count} buttons, ${r.tones} coloured`);
  assert(r.min >= 900, `min width ${r.min}`);
  assert(!r.clipped && r.scroll <= 0, `clipped ${r.clipped}, scroll ${r.scroll}`);
  assert(r.labelled.length === 2, `labelled: ${r.labelled}`);
});

test('chrome.panels', 'Panel buttons fold the gallery, grid and inspector; splitters resize', async () => {
  const r = await run(`const fold = (cmd) => { q('#menubar [data-command="' + cmd + '"]').click(); };
    fold('leftPanel'); fold('rightPanel'); fold('bottomPanel'); await sleep(200);
    const folded = ['fold-left', 'fold-right', 'fold-bottom'].every((c) => q('.ch-view').classList.contains(c));
    q('.rail-left [data-fold]').click(); q('.rail-right [data-fold]').click(); q('.pane-grid [data-fold]').click(); await sleep(200);
    const open = !['fold-left', 'fold-right', 'fold-bottom'].some((c) => q('.ch-view').classList.contains(c));
    const split = q('[data-split="left"]').getBoundingClientRect(); const before = A.state.settings.leftWidth;
    split.dispatchEvent?.call; const s = q('[data-split="left"]');
    s.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: split.x + 2, clientY: split.y + 50, button: 0 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: split.x + 62, clientY: split.y + 50 }));
    window.dispatchEvent(new MouseEvent('mouseup', {}));
    return { folded, open, grew: A.state.settings.leftWidth - before };`);
  assert(r.folded, 'panels did not fold');
  assert(r.open, 'panels did not unfold from their rails');
  assert(r.grew >= 50, `splitter moved ${r.grew}`);
  await run(`A.actions.updateSettings({ leftWidth: 220 }); return 1;`);
});

test('popups.all', 'Every popup opens in the shared frame with a title and buttons', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await run(`const out = {};
    for (const [cmd, kind] of [['exportChart', 'export'], ['print', 'print'], ['paletteMenu', 'palette'], ['dataStats', 'datastats'], ['settings', 'settings'], ['about', 'about'], ['recent', 'recent']]) {
      A.run(cmd); const d = await until(() => pop(kind)?.querySelector('.popup-body') && pop(kind)).catch(() => { throw new Error('popup ' + kind + ' did not open'); }); await sleep(200);
      out[kind] = { title: !!d.querySelector('#popup-title'), close: !!d.querySelector('[data-action="close"]'), icons: d.querySelectorAll('.icon').length };
      await A.popups.closeAll();
    }
    A.popups.open('settings', { tab: 'charts' }); await until(() => pop('settings')?.querySelector('.stepper')); let d = pop('settings'); out.settingsTabs = d.querySelectorAll('[data-action="tab"]').length; out.steppers = d.querySelectorAll('.stepper').length; await A.popups.closeAll();
    return out;`);
  for (const kind of ['export', 'print', 'palette', 'datastats', 'settings', 'about', 'recent']) assert(r[kind]?.title && r[kind]?.close && r[kind]?.icons > 2, `${kind}: ${JSON.stringify(r[kind])}`);
  assert(r.settingsTabs >= 10 && r.steppers >= 3, `settings tabs ${r.settingsTabs}, steppers ${r.steppers}`);
});

// ───────────────────────── charts

test('chart.types', 'Every one of the 108 types draws from the gallery', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await run(`const types = qa('.ch-gallery [data-chart-type]').map((b) => b.dataset.chartType); const bad = [];
    for (const id of types) { q('.ch-gallery [data-chart-type="' + id + '"]').click(); await sleep(30); if (doc().chart.type !== id || !svg()) bad.push(id + ':none'); }
    return { count: types.length, bad, groups: qa('.ch-group').length };`);
  assert(r.count === CHART_COUNT && r.groups === 9, `${r.count} types in ${r.groups} groups`);
  assert(!r.bad.length, r.bad.join(' '));
  await closeAll();
  // Each type on the data it is made for (its sample) draws marks and no message.
  const s = await run(`const bad = []; for (const id of A.domain.SAMPLES.map((x) => x.id)) { A.actions.openSample(id); await until(() => svg()); if (!marks()) bad.push(id); await A.actions.closeDoc(doc(), { force: true }); } return bad;`);
  assert(!s.length, `no marks: ${s.join(' ')}`);
});

test('chart.tips', 'Pointing at a mark shows its value', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await run(`const m = q('.ch-canvas .mark.bar'); const box = m.getBoundingClientRect();
    m.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 })); await sleep(50);
    return { shown: !q('.ch-tip').hidden, text: q('.ch-tip').textContent, hover: m.classList.contains('hover') };`);
  assert(r.shown && /:\s*\d/.test(r.text) && r.hover, JSON.stringify(r));
});

test('chart.legend', 'A legend click hides a series and a second click shows it', async () => {
  const r = await run(`const before = marks(); q('.ch-canvas [data-legend="1"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(100);
    const hidden = marks(); const off = doc().chart.options.hidden.includes(1);
    q('.ch-canvas [data-legend="1"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(100);
    return { before, hidden, off, after: marks() };`);
  assert(r.off && r.hidden < r.before && r.after === r.before, JSON.stringify(r));
});

test('chart.select', 'Clicking a bar selects its series and goes to its row in the grid', async () => {
  const r = await run(`const m = qa('.ch-canvas .mark.bar').find((x) => x.dataset.s === '2' && x.dataset.r === '4');
    m.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(100);
    return { series: doc().selection.series, row: A.view().grid.active.row, selected: qa('.ch-canvas .mark.selected').length };`);
  assert(r.series === 2 && r.row === 4 && r.selected === 12, JSON.stringify(r));
});

test('chart.titleEdit', 'Double-clicking the title edits it', async () => {
  const r = await run(`q('.ch-canvas .chart-title').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => pop('prompt')?.querySelector('input, textarea')); const d = pop('prompt'); const input = d.querySelector('input, textarea');
    input.value = 'Our sales'; input.dispatchEvent(new Event('input', { bubbles: true })); d.querySelector('[data-action="prompt-apply"]').click();
    await until(() => doc().chart.title === 'Our sales'); await sleep(100); return q('.ch-canvas .chart-title').textContent;`);
  assert(r === 'Our sales', r);
});

test('chart.zoom', 'Zoom in, out, fit and Ctrl+wheel change the picture size', async () => {
  const r = await run(`const w = () => svg().getBoundingClientRect().width; const fit = w();
    A.run('zoomIn'); await sleep(80); const inW = w(); A.run('zoomOut'); A.run('zoomOut'); await sleep(80); const outW = w();
    q('.ch-stage').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, ctrlKey: true })); await sleep(80); const wheel = A.state.settings.textZoom;
    A.run('zoomFit'); await sleep(80); return { fit, inW, outW, wheel, back: Math.abs(w() - fit) < 2, label: q('[data-zoom-value]').textContent };`);
  assert(r.inW > r.outW && r.wheel > 0 && r.back, JSON.stringify(r));
});

// ───────────────────────── data grid

test('grid.edit', 'Typing into a cell changes the table and the chart', async () => {
  const r = await run(`const g = A.view().grid; g.setActive(0, 1); const wrap = q('.dg-wrap'); wrap.focus();
    key(wrap, '2'); const ed = q('.dg-editor'); ed.value = '250'; key(ed, 'Enter'); await sleep(100);
    return { value: doc().table.rows[0][1], active: g.active.row, cell: q('.dg-cell[data-row="0"][data-col="1"]').textContent, dirty: doc().dirty };`);
  assert(r.value === 250 && r.active === 1 && r.cell === '250' && r.dirty, JSON.stringify(r));
});

test('grid.keys', 'Arrows and Tab move, Delete clears, Escape cancels an edit', async () => {
  const r = await run(`const g = A.view().grid; const wrap = q('.dg-wrap'); g.setActive(2, 1); wrap.focus();
    key(wrap, 'ArrowDown'); key(wrap, 'ArrowRight'); const moved = [g.active.row, g.active.col]; key(wrap, 'Tab', {}); const tab = g.active.col;
    g.setActive(3, 2); key(wrap, 'Delete'); await sleep(50); const cleared = doc().table.rows[3][2];
    g.setActive(4, 1); key(wrap, 'F2'); q('.dg-editor').value = '999'; key(q('.dg-editor'), 'Escape'); await sleep(50);
    return { moved, tab, cleared, kept: doc().table.rows[4][1] !== 999 };`);
  assert(r.moved[0] === 3 && r.moved[1] === 2 && r.tab === 3 && r.cleared === null && r.kept, JSON.stringify(r));
});

test('grid.paste', 'A pasted spreadsheet range fills cells and grows the table', async () => {
  const r = await run(`const rows = doc().table.rows.length; const cols = doc().table.columns.length; A.view().grid.setActive(rows - 1, cols - 1);
    const dt = new DataTransfer(); dt.setData('text/plain', '1\\t2\\n3\\t4\\n5\\t6'); q('.dg-wrap').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); await sleep(100);
    return { rows: doc().table.rows.length - rows, cols: doc().table.columns.length - cols, last: doc().table.rows.at(-1).slice(-2) };`);
  assert(r.rows === 2 && r.cols === 1 && r.last[0] === 5 && r.last[1] === 6, JSON.stringify(r));
});

test('grid.rowsCols', 'Add, delete, sort, transpose and column type commands', async () => {
  await closeAll();
  await openSample('regional-bars');
  const r = await run(`const t = () => doc().table; const g = A.view().grid; const n = t().rows.length;
    g.setActive(0, 0); await A.run('addRow'); const added = t().rows.length - n;
    g.setActive(1, 0); await A.run('deleteRows'); const deleted = t().rows.length;
    await A.run('addColumn'); const cols = t().columns.length; g.setActive(0, 1); await A.run('deleteColumns'); const cols2 = t().columns.length;
    g.setActive(0, 1); await A.run('sortAsc'); const asc = t().rows.map((r) => r[1]); const sorted = asc.every((v, i) => i === 0 || v >= asc[i - 1]);
    await A.run('sortDesc'); const desc = t().rows[0][1] >= t().rows[1][1];
    await A.run('transpose'); const tr = [t().rows.length, t().columns.length]; await A.run('transpose');
    g.setActive(0, 1); await A.run('colType:text'); const type = t().columns[1].type; await A.run('colType:number');
    return { added, deleted, n, cols, cols2, sorted, desc, tr, type, back: t().columns[1].type };`);
  assert(r.added === 1 && r.deleted === r.n, `rows ${JSON.stringify(r)}`);
  assert(r.cols === 3 && r.cols2 === 2, `cols ${r.cols} ${r.cols2}`);
  assert(r.sorted && r.desc, 'sort');
  assert(r.tr[0] === 1 && r.tr[1] === r.n + 1, `transpose ${r.tr}`);
  assert(r.type === 'text' && r.back === 'number', 'type');
});

test('grid.rename', 'Double-clicking a header renames the column (and the series)', async () => {
  const r = await run(`q('.dg-hcell[data-col="1"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); const ed = q('.dg-editor'); ed.value = 'Revenue'; key(ed, 'Enter'); await sleep(100);
    return { name: doc().table.columns[1].name, legend: A.actions.renderChart ? true : true, header: q('.dg-hcell[data-col="1"] .dg-name').textContent };`);
  assert(r.name === 'Revenue' && r.header === 'Revenue', JSON.stringify(r));
});

test('grid.filter', 'Find rows shows only matching rows; the chart keeps every row', async () => {
  const r = await run(`const input = q('[data-grid-filter]'); const before = marks(); input.value = 'Se'; input.dispatchEvent(new Event('input', { bubbles: true })); await sleep(100);
    const shown = qa('.dg-row:not(.ghost)').length; const m = marks(); input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); await sleep(50);
    return { shown, same: m === before, all: qa('.dg-row:not(.ghost)').length };`);
  assert(r.shown === 2 && r.same && r.all === 10, JSON.stringify(r));
});

test('grid.undo', 'Undo and redo every kind of change', async () => {
  const r = await run(`const t0 = JSON.stringify(doc().table); const title0 = doc().chart.title;
    A.actions.setChartType('line'); A.actions.setOption('palette', 'neon'); A.view().grid.setActive(0, 1); await A.run('addRow');
    for (let i = 0; i < 3; i++) A.actions.undo(); const back = JSON.stringify(doc().table) === t0 && doc().chart.type === 'bar' && doc().chart.options.palette !== 'neon';
    for (let i = 0; i < 3; i++) A.actions.redo(); const again = doc().chart.type === 'line' && doc().chart.options.palette === 'neon';
    const enabled = A.menus.enabled('undo'); return { back, again, enabled, title: doc().chart.title === title0 };`);
  assert(r.back && r.again && r.enabled && r.title, JSON.stringify(r));
});

test('data.stats', 'Data statistics per column', async () => {
  await closeAll();
  await openSample('salary-boxplot');
  const r = await run(`A.run('dataStats'); await until(() => pop('datastats')?.querySelector('.net-table tbody tr')); const d = pop('datastats');
    const rows = [...d.querySelectorAll('.net-table tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent.trim()));
    d.querySelector('[data-stats-sort="mean"]').click(); await sleep(100);
    return { rows, sorted: [...pop('datastats').querySelectorAll('.net-table th')].some((th) => th.classList.contains('asc')) };`);
  assert(r.rows.length === 4 && r.rows[0][2] === '40' && r.sorted, JSON.stringify(r.rows[0]));
});

// ───────────────────────── inspector

test('inspector.data', 'Column roles: untick a series, change the category, change the type', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await run(`A.api.setInspectorTab('data'); await sleep(50);
    const box = q('[data-value-col="2"]'); box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true })); await sleep(80);
    const legend = qa('.ch-canvas .legend-item').length;
    const sel = q('select[data-type]'); sel.value = 'stackedColumn'; sel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(80);
    return { values: doc().chart.mapping.values, legend, type: doc().chart.type, roles: qa('.dg-role').length };`);
  assert(r.legend === 2 && r.values.join() === '1,3' && r.type === 'stackedColumn' && r.roles === 3, JSON.stringify(r));
});

test('inspector.style', 'Titles, legend position, palette window and background', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await run(`A.api.setInspectorTab('style'); await sleep(50);
    const title = q('[data-chart="title"]'); title.value = 'Styled'; title.dispatchEvent(new Event('input', { bubbles: true })); title.dispatchEvent(new Event('change', { bubbles: true })); await sleep(60);
    const legend = q('select[data-opt="legend"]'); legend.value = 'right'; legend.dispatchEvent(new Event('change', { bubbles: true })); await sleep(60);
    q('[data-ins-action="palette"]').click(); await until(() => pop('palette')?.querySelector('[data-pick-palette="forest"]')); const d = pop('palette'); const tiles = d.querySelectorAll('.pal-tile').length; d.querySelector('[data-pick-palette="forest"]').click();
    await until(() => doc().chart.options.palette === 'forest');
    const bg = q('select[data-opt="background"]'); bg.value = 'custom'; bg.dispatchEvent(new Event('change', { bubbles: true })); await sleep(60);
    return { title: q('.ch-canvas .chart-title').textContent, legend: doc().chart.options.legend, tiles, fill: q('.ch-canvas .mark.bar').getAttribute('fill'), bg: doc().chart.options.background };`);
  assert(r.title === 'Styled' && r.legend === 'right' && r.tiles === 20 && r.fill === '#1b4332' && /^#/.test(r.bg), JSON.stringify(r));
});

test('inspector.axes', 'Axis title, maximum, log scale and number format', async () => {
  const r = await run(`A.api.setInspectorTab('axes'); await sleep(50);
    const set = (sel, v, ev = 'change') => { const el = q(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event(ev, { bubbles: true })); };
    set('[data-opt="yTitle"]', 'Sales'); set('.stepper[data-stepper="opt:yMax"] .stepper-value', '1000'); set('[data-opt="suffix"]', 'M'); await sleep(80);
    const ticks = qa('.ch-canvas .tick').map((x) => x.textContent);
    return { title: qa('.ch-canvas .axis-title').map((x) => x.textContent), top: ticks.some((x) => /1,?000M/.test(x)) };`);
  assert(r.title.includes('Sales') && r.top, JSON.stringify(r));
  const log = await run(`A.actions.setOption('yMax', ''); A.actions.setOption('yScale', 'log'); await sleep(50); return qa('.ch-canvas .tick').map((x) => x.textContent);`);
  assert(log.length >= 2, 'log ticks');
  await run(`A.actions.setOption('yScale', 'linear'); A.actions.setOption('suffix', ''); return 1;`);
});

test('inspector.series', 'Series colour, hide, data labels, trend line', async () => {
  const r = await run(`A.actions.setChartType('line'); A.api.setInspectorTab('series'); await sleep(50);
    const color = q('[data-series-color="0"]'); color.value = '#ff0000'; color.dispatchEvent(new Event('input', { bubbles: true })); color.dispatchEvent(new Event('change', { bubbles: true })); await sleep(60);
    const stroke = q('.ch-canvas .mark.line').getAttribute('stroke');
    q('[data-series-toggle="1"]').click(); await sleep(60); const hidden = doc().chart.options.hidden;
    const labels = q('[data-opt="dataLabels"]'); labels.checked = true; labels.dispatchEvent(new Event('change', { bubbles: true })); await sleep(60);
    const trend = q('[data-opt="trendline"]'); trend.checked = true; trend.dispatchEvent(new Event('change', { bubbles: true })); await sleep(60);
    return { stroke, hidden, labels: qa('.ch-canvas .data-label').length, trend: qa('.ch-canvas .trend').length };`);
  assert(r.stroke === '#ff0000' && r.hidden.includes(1) && r.labels > 10 && r.trend >= 1, JSON.stringify(r));
});

test('inspector.more', 'Type settings (donut hole, heat map ramp) and chart size', async () => {
  const r = await run(`A.actions.setChartType('donut'); A.api.setInspectorTab('more'); await sleep(50);
    const hole = q('.stepper[data-stepper="opt:innerRadius"] .stepper-value'); hole.value = '0.8'; hole.dispatchEvent(new Event('input', { bubbles: true })); hole.dispatchEvent(new Event('change', { bubbles: true }));
    q('[data-ins-size="1080x1080"]').click(); await sleep(80);
    return { hole: doc().chart.options.innerRadius, size: [doc().chart.options.width, doc().chart.options.height], svg: [svg().getAttribute('width'), svg().getAttribute('height')], label: q('.ch-size').textContent };`);
  assert(r.hole === 0.8 && r.size.join() === '1080,1080' && r.svg.join() === '1080,1080' && /1080/.test(r.label), JSON.stringify(r));
});

// ───────────────────────── input files

test('import.preview', 'CSV import window: preview, delimiter, header and decimal choices', async () => {
  await closeAll();
  const r = await run(`A.api.importText('Item;Price;Count\\nA;1,5;3\\nB;2,25;4\\nC;3;5\\n', 'semi.csv'); const d = await until(() => pop('import')?.querySelector('.im-table'));
    const heads = () => [...pop('import').querySelectorAll('.im-table thead th')].map((th) => th.textContent.trim());
    const first = heads(); pop('import').querySelector('[data-im-seg="header"][data-value="no"]').click(); await until(() => heads()[1] === 'A'); const none = heads();
    pop('import').querySelector('[data-im-seg="header"][data-value="auto"]').click(); await until(() => heads()[1] === 'Item');
    pop('import').querySelector('[data-action="import-ok"]').click(); await until(() => svg());
    return { first, none, rows: doc().table.rows, type: doc().chart.type, name: doc().name };`);
  assert(r.first.join('|') === '#|Item|Price|Count', r.first.join('|'));
  assert(r.none[1] === 'A', r.none.join('|'));
  assert(JSON.stringify(r.rows[1]) === '["B",2.25,4]', JSON.stringify(r.rows));
  assert(r.name === 'semi.mychart', r.name);
});

test('import.formats', 'Open Excel, OpenDocument, JSON, XML, HTML, Markdown and TSV files', async () => {
  await closeAll();
  const table = createTable(['Region', 'Q1', 'Q2'], [['North', 120, 135], ['South', 80, 92], ['East', 64, 70]]);
  const ods = await writeZip([{ name: 'content.xml', data: '<office:document-content xmlns:office="o" xmlns:table="t" xmlns:text="x"><office:body><office:spreadsheet><table:table table:name="S"><table:table-row><table:table-cell office:value-type="string"><text:p>Region</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Q1</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Q2</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell office:value-type="string"><text:p>North</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="120"/><table:table-cell office:value-type="float" office:value="135"/></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>' }]);
  const files = {
    'a.xlsx': await toXlsx(table), 'b.ods': ods, 'c.json': new TextEncoder().encode(exportData(table, 'json')), 'd.html': new TextEncoder().encode(exportData(table, 'html', { title: 'T' })),
    'e.md': new TextEncoder().encode(exportData(table, 'markdown')), 'f.tsv': new TextEncoder().encode(exportData(table, 'tsv')),
    'g.xml': new TextEncoder().encode('<rows><r region="North"><q1>120</q1><q2>135</q2></r><r region="South"><q1>80</q1><q2>92</q2></r></rows>'),
  };
  const payload = JSON.stringify(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, b64(v)])));
  const r = await run(`const files = ${payload}; const out = {};
    for (const [name, data] of Object.entries(files)) { const bytes = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0)); const d = await A.actions.openBytes(name, bytes, { quiet: true }); out[name] = d ? [d.table.rows.length, d.table.columns.length, d.table.rows[0][1], !!svg()] : null; }
    return out;`);
  for (const [name, got] of Object.entries(r)) {
    assert(got, `${name} did not open`);
    assert(got[2] === 120 && got[3], `${name}: ${JSON.stringify(got)}`);
  }
  assert(r['a.xlsx'][0] === 3 && r['g.xml'][0] === 2, JSON.stringify(r));
});

test('import.paste', 'Paste as new chart reads the clipboard table', async () => {
  const r = await run(`window.__clipboardText = 'Fruit\\tSold\\nApple\\t120\\nPear\\t80\\nGrape\\t150'; await A.run('pasteData'); await sleep(100);
    return { rows: doc().table.rows.length, type: doc().chart.type, first: doc().table.rows[0] };`);
  assert(r.rows === 3 && r.type === 'pie' && r.first[1] === 120, JSON.stringify(r));
});

test('import.replace', "Import into this chart replaces its data and keeps its settings", async () => {
  const r = await run(`A.actions.setChartType('bar'); A.actions.setOption('palette', 'berry'); const id = doc().id; const tabs = A.state.docs.length;
    A.api.importText('k,v\\nx,1\\ny,2\\n', 'r.csv'); await until(() => pop('import')?.querySelector('.im-table')); const d = pop('import');
    d.querySelector('[data-im-seg="mode"][data-value="replace"]').click(); await sleep(50); d.querySelector('[data-action="import-ok"]').click();
    await until(() => doc().table.rows.length === 2);
    return { same: doc().id === id, tabs: A.state.docs.length === tabs, palette: doc().chart.options.palette, type: doc().chart.type };`);
  assert(r.same && r.tabs && r.palette === 'berry' && r.type === 'bar', JSON.stringify(r));
});

test('import.drop', 'Files dropped on the window open as charts', async () => {
  const r = await run(`const tabs = A.state.docs.length; const dt = new DataTransfer(); dt.items.add(new File(['a,b\\n1,2\\n3,4\\n'], 'drop.csv', { type: 'text/csv' }));
    window.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true })); const overlay = q('.drop-overlay').classList.contains('visible');
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); await until(() => A.state.docs.length === tabs + 1);
    return { overlay, name: doc().name, gone: !q('.drop-overlay').classList.contains('visible') };`);
  assert(r.overlay && r.gone && r.name === 'drop.mychart', JSON.stringify(r));
});

// ───────────────────────── output

const downloads = () => E('JSON.parse(JSON.stringify(window.__downloads))');

test('export.pictures', 'PNG, JPEG, WebP, GIF and SVG pictures are written (AVIF says it needs the desktop where unsupported)', async () => {
  await closeAll();
  await openSample('monthly-sales');
  await run(`window.__downloads.length = 0; for (const f of ['png', 'jpg', 'webp', 'gif', 'svg']) await A.actions.exportChartAs({ format: f, scale: 1 }); await sleep(500); return 1;`);
  const d = await downloads();
  const by = Object.fromEntries(d.map((x) => [x.name.split('.').pop(), x]));
  assert(by.png?.head?.slice(0, 4).join() === '137,80,78,71', `png ${JSON.stringify(by.png)}`);
  assert(by.jpg?.head?.slice(0, 3).join() === '255,216,255', 'jpeg');
  assert(by.webp?.head?.slice(0, 4).join() === '82,73,70,70', 'webp');
  assert(by.gif?.head?.slice(0, 3).join() === '71,73,70', 'gif');
  assert(by.svg?.text?.includes('<svg') && by.svg.text.includes('<title>'), 'svg');
  assert(d.every((x) => x.name.includes('2025')), d.map((x) => x.name).join(','));
});

test('export.documents', 'PDF, HTML, Word and Markdown documents with the picture and the data', async () => {
  await run(`window.__downloads.length = 0; for (const f of ['pdf', 'html', 'docx', 'markdown']) await A.actions.exportChartAs({ format: f, scale: 1 }); await sleep(500); return 1;`);
  const d = await downloads();
  const by = Object.fromEntries(d.map((x) => [x.name.split('.').pop(), x]));
  assert(String.fromCharCode(...(by.pdf?.head ?? [])).startsWith('%PDF'), 'pdf');
  assert(by.pdf.size > 20000, `pdf size ${by.pdf.size}`);
  assert(by.html?.text?.includes('<svg') && by.html.text.includes('<table>'), 'html');
  assert(by.docx?.head?.slice(0, 2).join() === '80,75', 'docx is a zip');
  assert(by.md?.text?.includes('![') && by.md.text.includes('| '), 'markdown');
});

test('export.data', 'Data as CSV, TSV, JSON, Markdown, HTML and Excel', async () => {
  await run(`window.__downloads.length = 0; for (const f of ['csv', 'tsv', 'json', 'markdown', 'html', 'xlsx']) await A.actions.exportDataAs(f); await sleep(500); return 1;`);
  const d = await downloads();
  const by = Object.fromEntries(d.map((x) => [x.name.split('.').pop(), x]));
  assert(by.csv?.text?.includes('1월') || by.csv?.text?.includes('Jan'), 'csv');
  assert(by.tsv?.text?.includes('\t'), 'tsv');
  assert(Array.isArray(JSON.parse(by.json?.text ?? 'null')), 'json');
  assert(by.md?.text?.includes('---:'), 'markdown');
  assert(by.html?.text?.includes('<table>'), 'html');
  assert(by.xlsx?.head?.slice(0, 2).join() === '80,75', 'xlsx');
});

test('export.window', 'Export window: formats, preview, size, scale and save', async () => {
  const r = await run(`window.__downloads.length = 0; A.run('exportChart'); await until(() => pop('export')?.querySelector('.ex-preview svg')); const d = pop('export');
    const formats = d.querySelectorAll('[data-ex-format]').length; d.querySelector('[data-ex-format="svg"]').click(); await sleep(50);
    pop('export').querySelector('[data-ex-size="800x500"]').click(); await until(() => pop('export').querySelector('.ex-preview svg')?.getAttribute('width') === '800');
    pop('export').querySelector('[data-ex-format="png"]').click(); await sleep(50); pop('export').querySelector('[data-ex-seg="scale"][data-value="3"]').click(); await sleep(50);
    const pixels = pop('export').querySelector('.ex-view').textContent.includes('2400 × 1500');
    pop('export').querySelector('[data-action="export-ok"]').click(); await until(() => window.__downloads.length); await sleep(200);
    return { formats, pixels, file: window.__downloads[0].name };`);
  assert(r.formats === 10 && r.pixels && r.file.endsWith('.png'), JSON.stringify(r));
});

test('export.copy', 'Copy the chart picture to the clipboard', async () => {
  const r = await run(`window.__images.length = 0; await A.run('copyImage'); await sleep(100); await A.run('copySvg'); return { images: window.__images, svg: window.__copied.at(-1)?.startsWith('<svg') };`);
  assert(r.images.includes('image/png') && r.svg, JSON.stringify(r));
});

test('print.everywhere', 'Every Print in the main window (toolbar, Ctrl+P, File menu, chart / grid / tab menus) opens the separate print window', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await run(`const out = {};
    const opened = async (name, go) => { await A.popups.closeAll(); for (const el of qa('.web-popup')) el.remove(); A.popups.frames.clear(); await go(); out[name] = await until(() => pop('print')?.querySelector('[data-action="print-now"]'), 6000).then(() => true, () => false); };
    await opened('toolbar', () => q('#toolbar [data-command="print"]').click());
    await opened('ctrlP', () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true })));
    await opened('fileMenu', async () => { A.actions.openMenubarMenu('file'); const d = await until(() => pop('menu')?.querySelector('.menu-item[data-id="print"], [data-item="print"]')); d.click(); });
    for (const [name, sel] of [['chartMenu', '.ch-canvas .chart-bg'], ['gridMenu', '.dg-cell'], ['tabMenu', '[data-tab]']]) {
      await opened(name, async () => { const el = q(sel); const b = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.left + 3, clientY: b.top + 3 }));
        const item = await until(() => pop('menu')?.querySelector('.menu-item[data-id="print"], [data-item="print"]')); item.click(); });
    }
    await A.popups.closeAll(); return out;`);
  const missing = Object.entries(r).filter(([, ok]) => !ok).map(([k]) => k);
  assert(!missing.length, `no print window from: ${missing.join(', ')}`);
});

test('print.documents', "User's guide and tutorial document: Print and Ctrl+P open the separate print window with the document on pages", async () => {
  await closeAll();
  const r = await run(`const out = {};
    for (const [docKind, lang] of [['guide', 'ko'], ['tutorial', 'en']]) {
      await A.popups.closeAll(); for (const el of qa('.web-popup, .doc-test-frame')) el.remove(); A.popups.frames.clear();
      // The document window as the program shows it in a frame (tutorial mode): viewer.js in an iframe of the main window.
      const frame = document.createElement('iframe'); frame.className = 'doc-test-frame'; frame.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:700px;z-index:1;opacity:0.01';
      frame.src = location.pathname + '?viewer=' + docKind + '&lang=' + lang; document.body.append(frame);
      const viewer = await until(() => frame.contentDocument?.querySelector('[data-viewer="print"]') && frame.contentDocument, 15000);
      viewer.querySelector('[data-viewer="print"]').click();
      const d = await until(() => pop('print')?.querySelector('.pp-stage .doc-sheet') && pop('print'), 20000);
      const count = () => Number((pop('print').querySelector('#page-number')?.textContent.match(/(\\d+)\\D*$/) ?? [])[1] ?? 0); // the last number: '1 / 49', 'Page 1 of 49'
      const first = { pages: count(), title: d.querySelector('.popup-title, .frame-title, h1, header')?.textContent ?? '', h1: d.querySelector('.pp-stage .docp h1')?.textContent ?? '', chartOnly: !!d.querySelector('[data-print-toggle="includeData"]'), img: d.querySelectorAll('.print-sheet .docp img').length };
      // Smaller paper: more pages. Printing prints every page.
      const paper = d.querySelector('select[data-print="paper"]'); paper.value = 'A5'; paper.dispatchEvent(new Event('change', { bubbles: true }));
      await until(() => count() > first.pages, 20000).catch(() => null);
      const a5 = count();
      window.__printed = null; pop('print').querySelector('[data-action="print-now"]').click(); await until(() => window.__printed, 5000).catch(() => null);
      const printed = window.__printed?.pages ?? 0;
      const back = pop('print').querySelector('select[data-print="paper"]'); back.value = 'A4'; back.dispatchEvent(new Event('change', { bubbles: true })); await sleep(100);
      await A.popups.closeAll(); for (const el of qa('.web-popup')) el.remove(); A.popups.frames.clear();
      // Ctrl+P inside the document does the same.
      frame.contentDocument.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true }));
      const ctrlP = await until(() => pop('print')?.querySelector('.pp-stage .doc-sheet'), 20000).then(() => true, () => false);
      await A.popups.closeAll(); frame.remove();
      out[docKind] = { ...first, a5, printed, ctrlP };
    }
    for (const el of qa('.web-popup')) el.remove(); A.popups.frames.clear(); return out;`);
  for (const [docKind, x] of Object.entries(r)) {
    assert(x.pages >= 3, `${docKind}: ${x.pages} pages ${JSON.stringify(x)}`);
    assert(/MyChartMaster/.test(x.h1), `${docKind}: first page shows "${x.h1}"`);
    assert(!x.chartOnly, `${docKind}: chart-only options shown`);
    assert(x.img > 0, `${docKind}: no pictures on the pages`);
    assert(x.a5 > x.pages, `${docKind}: A5 gave ${x.a5} pages, A4 ${x.pages}`);
    assert(x.printed === x.a5, `${docKind}: printed ${x.printed} of ${x.a5} pages`);
    assert(x.ctrlP, `${docKind}: Ctrl+P did not open the print window`);
  }
});

test('print.window', 'Print window: paper, orientation, preview pages, data pages, prints at once', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await run(`A.run('print'); await until(() => pop('print')?.querySelector('.pp-stage svg')); const d = pop('print');
    const one = d.querySelectorAll('.print-sheet .print-page').length;
    const t = d.querySelector('[data-print-toggle="includeData"]'); t.checked = true; t.dispatchEvent(new Event('change', { bubbles: true })); await sleep(150);
    const two = pop('print').querySelectorAll('.print-sheet .print-page').length;
    const portrait = pop('print').querySelector('[data-print-seg="orientation"][data-value="portrait"]'); portrait.click(); await sleep(100);
    window.parent.__mychartmasterPrintHook = window.__mychartmasterPrintHook; pop('print').querySelector('[data-action="print-now"]').click(); await until(() => window.__printed);
    const off = pop('print').querySelector('[data-print-toggle="includeData"]'); off.checked = false; off.dispatchEvent(new Event('change', { bubbles: true }));
    return { one, two, printed: window.__printed.pages, w: window.__printed.job.widthMm };`);
  assert(r.one === 1 && r.two >= 2 && r.printed === r.two, JSON.stringify(r));
});

test('files.saveOpen', 'Save a .mychart and open it again with the same chart', async () => {
  const r = await run(`window.__downloads.length = 0; A.actions.setChartType('area'); await A.actions.saveDoc(doc()); await until(() => window.__downloads[0]?.text);
    const file = window.__downloads[0]; const saved = JSON.parse(file.text); const dirty = doc().dirty;
    await A.actions.closeDoc(doc(), { force: true }); const d = await A.actions.openBytes(file.name, new TextEncoder().encode(file.text));
    return { name: file.name, format: saved.format, type: d.chart.type, rows: d.table.rows.length, dirty, reopenedDirty: d.dirty };`);
  assert(r.name.endsWith('.mychart') && r.format === 'mychart' && r.type === 'area' && r.rows === 12 && !r.dirty && !r.reopenedDirty, JSON.stringify(r));
});

test('files.tabs', 'Several charts in tabs; closing a changed chart asks first', async () => {
  const r = await run(`A.actions.newChart('pie'); A.actions.newChart('line'); await sleep(100); const tabs = qa('.tab').length;
    const icons = qa('.tab .icon[data-icon^="chart"]').length;
    A.actions.setOption('legend', 'top'); const closing = A.actions.closeDoc(doc()); await until(() => pop('confirm')?.querySelector('[data-value="cancel"]')); const d = pop('confirm');
    d.querySelector('[data-value="cancel"]').click(); const kept = (await closing) === false;
    qa('.tab')[0].click(); await sleep(50); const first = A.state.active === A.state.docs[0].id;
    return { tabs, icons, kept, first };`);
  assert(r.tabs >= 3 && r.icons >= 3 && r.kept && r.first, JSON.stringify(r));
});

// ───────────────────────── look and help

test('look.theme', 'Dark theme and layouts (grid right, chart only)', async () => {
  const r = await run(`A.actions.updateSettings({ theme: 'dark' }); await sleep(80); const dark = document.documentElement.dataset.mode;
    A.actions.updateSettings({ paneLayout: 'grid-right' }); await sleep(80); const right = getComputedStyle(q('.ch-center')).flexDirection;
    A.actions.updateSettings({ paneLayout: 'chart-only' }); await sleep(80); const only = getComputedStyle(q('.pane-grid')).display;
    A.actions.setOption('background', 'theme'); await sleep(50); const bg = q('.ch-canvas .chart-bg').getAttribute('fill');
    A.actions.updateSettings({ theme: 'light', paneLayout: 'grid-bottom' }); return { dark, right, only, bg };`);
  assert(r.dark === 'dark' && r.right === 'row' && r.only === 'none' && r.bg !== '#ffffff', JSON.stringify(r));
});

test('look.language', 'Korean and English: no raw keys anywhere in the window, menus or popups', async () => {
  const r = await run(`const found = []; const raw = /^(?:[a-z]+\\.)+[a-zA-Z0-9:-]+$/;
    const scan = (root, where) => { const walk = document.createTreeWalker(root.body ?? root, NodeFilter.SHOW_TEXT); let n; while ((n = walk.nextNode())) { const s = n.textContent.trim(); if (raw.test(s) && !/\\.(mychart|csv|json|xlsx|png|svg|pdf|md|html)$/.test(s)) found.push(where + ': ' + s); }
      for (const el of (root.body ?? root).querySelectorAll('[title]')) if (raw.test(el.title.trim())) found.push(where + ' title: ' + el.title); };
    for (const language of ['ko', 'en']) {
      A.actions.updateSettings({ language }); await sleep(150); A.actions.showStartPage(true); await sleep(150); scan(document, language + ' start');
      A.actions.openSample('weekly-heatmap'); await until(() => svg()); for (const tab of ['data', 'style', 'axes', 'series', 'more']) { A.api.setInspectorTab(tab); scan(document, language + ' ' + tab); }
      for (const [cmd, kind] of [['exportChart', 'export'], ['print', 'print'], ['paletteMenu', 'palette'], ['dataStats', 'datastats'], ['settings', 'settings']]) { A.run(cmd); await until(() => pop(kind)?.querySelector('.popup-body')); await sleep(300); scan(pop(kind), language + ' ' + kind); await A.popups.closeAll(); }
    }
    A.actions.updateSettings({ language: 'en' }); return found;`);
  assert(!r.length, `raw keys: ${r.slice(0, 6).join(' | ')}`);
});

test('help.tutorialStop', 'Stopping the tutorial at any step (settled or mid-step) shows the chart that was open — never an empty window', async () => {
  const total = await run(`return A.domain.tutorialSteps();`);
  const bad = [];
  for (const mode of ['settled', 'busy']) {
    for (let i = 0; i < total; i++) {
      const r = await run(`await A.popups.closeAll(); for (const d of [...A.state.docs]) await A.actions.closeDoc(d, { force: true });
        A.actions.openSample('market-share'); await until(() => svg()); const own = doc().id;
        await A.actions.startTutorial(); const t = A.tutorial(); await until(() => t.state().active);
        if (${i} > 0) t.go(${i});
        ${mode === 'settled' ? `await until(() => t.state().index === ${i} && !t.state().busy, 20000);` : 'await sleep(30);'}
        await t.stop(); await sleep(300);
        const start = q('#start-page'); const startShown = Boolean(start && !start.hidden && getComputedStyle(start).display !== 'none');
        return { id: t.state().id, chart: Boolean(svg()), startShown, sameDoc: A.state.active === own, docs: A.state.docs.length, popups: document.querySelectorAll('.web-popup').length, tour: document.querySelector('#tutorial-layer.active') ? 1 : 0 };`);
      if (!r.chart || r.startShown || !r.sameDoc || r.docs !== 1 || r.popups || r.tour) bad.push(`${mode} ${i} ${r.id}: ${JSON.stringify(r)}`);
    }
  }
  assert(!bad.length, `${bad.length} stops left the window wrong:\n${bad.slice(0, 6).join('\n')}`);
});

test('help.docs', "User's guide and tutorial document open in their own windows", async () => {
  const r = await run(`window.__opened.length = 0; await A.run('userGuide'); await A.run('tutorialDoc'); return window.__opened;`);
  assert(r.some((u) => u.includes('viewer=guide')) && r.some((u) => u.includes('viewer=tutorial')), r.join(' '));
  const doc = await run(`const res = await fetch('docs/UserGuide.html'); return { ok: res.ok, text: (await res.text()).includes('MyChartMaster') };`);
  assert(doc.ok && doc.text, 'docs/UserGuide.html is not in the build (npm run build:docs)');
});


// ───────────────────────── start page layout (user's requests)

test('start.layout', 'New chart spans the whole row, Recent items sit right under it', async () => {
  await closeAll();
  const r = await run(`A.actions.updateSettings({ startLayout: null }); A.actions.showStartPage(true); await sleep(400); q('[data-start="arrange"]').click(); await sleep(400);
    const board = q('.start-board').getBoundingClientRect(); const nc = q('.start-card[data-card="newchart"]').getBoundingClientRect(); const rc = q('.start-card[data-card="recent"]').getBoundingClientRect();
    const others = qa('.start-board > .start-card').filter((c) => !['newchart', 'recent'].includes(c.dataset.card)).map((c) => c.getBoundingClientRect().top);
    return { board: [board.left, board.width], nc: [nc.left, nc.width, nc.top, nc.bottom], rc: [rc.left, rc.top], firstOther: Math.min(...others) };`);
  const [bl, bw] = r.board;
  const [nl, nw, , nb] = r.nc;
  assert(Math.abs(nl - bl) < 2 && nw > bw - 4, `New chart is ${Math.round(nw)} of ${Math.round(bw)} px wide`);
  assert(r.rc[1] >= nb && r.rc[1] - nb < 40 && Math.abs(r.rc[0] - bl) < 2, `Recent at ${JSON.stringify(r.rc)} not right under New chart (bottom ${nb})`);
  assert(r.firstOther > r.rc[1], 'another card sits above Recent');
});

test('start.tilesOneLine', 'Every start page button has its icon and label on one line, left-aligned', async () => {
  const r = await run(`A.actions.showStartPage(true); await sleep(200); const bad = [];
    for (const tile of qa('.nc-tile, .start-tile')) {
      const t = tile.getBoundingClientRect(); const ic = tile.querySelector('.icon, .flag-slot')?.getBoundingClientRect(); const lb = tile.querySelector(':scope > b, :scope > span:not(.flag-slot)')?.getBoundingClientRect();
      if (!ic || !lb || !t.width) { bad.push((tile.dataset.value || tile.dataset.start) + ': parts'); continue; }
      const sameLine = Math.abs((ic.top + ic.bottom) / 2 - (lb.top + lb.bottom) / 2) < 6; const leftAligned = ic.left - t.left < 16 && lb.left > ic.right - 1;
      if (!sameLine || !leftAligned || t.height > 46) bad.push((tile.dataset.value || tile.dataset.start) + ': ' + Math.round(t.height) + 'px ' + JSON.stringify({ sameLine, leftAligned, ic: [ic.left - t.left, ic.top, ic.bottom], lb: [lb.left - t.left, lb.top, lb.bottom] }));
    }
    return { n: qa('.nc-tile, .start-tile').length, bad };`);
  assert(r.n > CHART_COUNT, `${r.n} tiles`);
  assert(!r.bad.length, `not one line: ${r.bad.slice(0, 8).join(' · ')}`);
});

test('start.distinctIcons', 'Every chart type has its own icon on the start page and in the gallery', async () => {
  const r = await run(`A.actions.showStartPage(true); await sleep(100); const icons = qa('.nc-tile .icon').map((x) => x.dataset.icon); const dots = icons.filter((x) => x === 'dot');
    const bodies = qa('.nc-tile .icon').map((x) => x.innerHTML); return { n: icons.length, unique: new Set(icons).size, bodies: new Set(bodies).size, dots: dots.length };`);
  assert(r.n === CHART_COUNT && r.unique === CHART_COUNT && r.bodies === CHART_COUNT && !r.dots, JSON.stringify(r));
});

test('start.typesDraw', 'A new chart of each of the 108 types (start page) draws its own starter data', async () => {
  const r = await run(`const bad = []; let n = 0;
    for (const id of qa('.nc-tile').map((b) => b.dataset.value)) {
      A.actions.showStartPage(true); await sleep(10); q('.nc-tile[data-value="' + id + '"]').click(); await until(() => svg() && doc()?.chart.type === id, 6000);
      n++; const text = svg().textContent; if (!marks()) bad.push(id + ':no marks'); else if (/Choose |No positive values|No numbers|고르세요|양수 값이 없습니다|숫자가 없습니다/.test(text)) bad.push(id + ':note');
      await A.actions.closeDoc(doc(), { force: true });
    }
    return { n, bad };`);
  assert(r.n === CHART_COUNT, `${r.n} types tried`);
  assert(!r.bad.length, r.bad.join(' '));
});

// ───────────────────────── chart themes and the chart background (user's requests)

test('theme.chartTheme', 'Each chart has its own chart theme (inspector, Chart menu), apart from the program theme', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await run(`A.api.setInspectorTab('style'); await sleep(60);
    const sel = q('select[data-opt="chartTheme"]'); const options = [...sel.options].map((o) => o.value);
    const before = q('.ch-canvas .mark.bar').getAttribute('fill'); const appTheme = A.state.settings.theme;
    sel.value = 'forest'; sel.dispatchEvent(new Event('change', { bubbles: true })); await until(() => doc().chart.options.chartTheme === 'forest');
    const after = q('.ch-canvas .mark.bar').getAttribute('fill');
    const first = doc(); A.actions.newChart('column'); await until(() => doc() !== first); const other = doc().chart.options.chartTheme; await A.actions.closeDoc(doc(), { force: true });
    await A.run('chartTheme:midnight'); const menu = A.menus.SUBMENUS.chartThemes.items.length; const viaMenu = doc().chart.options.chartTheme;
    return { options, before, after, palette: null, appTheme, appAfter: A.state.settings.theme, other, menu, viaMenu, inChartMenu: A.menus.MENUS.chart.some((x) => typeof x === 'object' && x.sub === 'chartThemes') };`);
  assert(r.options.length === CHART_THEMES.length, `${r.options.length} chart themes in the inspector`);
  assert(r.before !== r.after, 'the bars kept their colour');
  assert(r.appAfter === r.appTheme, 'the program theme changed with the chart theme');
  assert(r.other === 'classic', `a new chart took ${r.other}`);
  assert(r.menu === CHART_THEMES.length && r.viaMenu === 'midnight' && r.inChartMenu, JSON.stringify(r));
});

test('theme.background', 'The chart background follows the program theme; its text and colours stay readable', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await run(`const read = () => ({ bg: q('.ch-canvas .chart-bg')?.getAttribute('fill'), title: q('.ch-canvas .chart-title')?.getAttribute('fill'), bars: qa('.ch-canvas .mark.bar').map((b) => b.getAttribute('fill')), surface: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() });
    const option = doc().chart.options.background;
    A.actions.updateSettings({ theme: 'light' }); await sleep(120); const light = read();
    A.actions.updateSettings({ theme: 'dark' }); await sleep(120); const dark = read();
    A.actions.setOption('palette', 'corporate'); await sleep(80); const darkCorporate = read();
    A.actions.setOption('background', 'chart'); await sleep(80); const paper = read();
    A.actions.setOption('background', 'theme'); A.actions.updateSettings({ theme: 'light' }); await sleep(80);
    return { option, light, dark, darkCorporate, paper, chartTheme: doc().chart.options.chartTheme };`);
  assert(r.option === 'theme', `a new chart's background is ${r.option}`);
  assert(r.light.bg?.toLowerCase() === r.light.surface.toLowerCase(), `light: ${r.light.bg} vs ${r.light.surface}`);
  assert(r.dark.bg?.toLowerCase() === r.dark.surface.toLowerCase() && r.dark.bg !== r.light.bg, `dark: ${r.dark.bg} vs ${r.dark.surface}`);
  assert(contrastRatio(r.dark.title, r.dark.bg) >= 4.5, `title ${r.dark.title} on ${r.dark.bg}`);
  for (const fill of new Set(r.darkCorporate.bars)) assert(contrastRatio(fill, r.darkCorporate.bg) >= 2.99, `bar ${fill} on ${r.darkCorporate.bg}`);
  assert(r.paper.bg === '#ffffff', `chart theme paper ${r.paper.bg}`);
});

test('theme.settings', 'Settings › Charts: the default chart theme of new charts', async () => {
  await closeAll();
  const r = await run(`A.actions.updateSettings({ chartTheme: 'ocean' }); A.actions.newChart('line'); await until(() => svg()); const t = doc().chart.options.chartTheme; const bg = doc().chart.options.background;
    A.actions.updateSettings({ chartTheme: 'classic' }); return { t, bg };`);
  assert(r.t === 'ocean' && r.bg === 'theme', JSON.stringify(r));
});

test('start.rowsFull', 'New chart: every group has 12 types and every row is full at any card width', async () => {
  const r = await run(`A.actions.showStartPage(true); await sleep(200); const groups = q('.nc-groups'); const out = [];
    for (const width of [1400, 1100, 900, 700, 560, 420]) {
      groups.style.width = width + 'px'; await sleep(60);
      for (const g of qa('.nc-group')) {
        const grid = g.querySelector('.nc-tiles'); const tiles = [...grid.children]; const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
        const tops = [...new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().top)))];
        const perRow = tops.map((top) => tiles.filter((t) => Math.round(t.getBoundingClientRect().top) === top).length);
        out.push({ width, group: g.querySelector('.start-sub span')?.textContent, count: tiles.length, columns, perRow });
      }
    }
    groups.style.width = ''; return out;`);
  const bad = r.filter((x) => x.count !== 12 || x.perRow.some((n) => n !== x.columns));
  assert(!bad.length, bad.slice(0, 4).map((x) => `${x.width}px ${x.group}: ${x.count} types, ${x.columns} columns, rows ${x.perRow.join('/')}`).join(' · '));
  assert(new Set(r.map((x) => x.columns)).size >= 3, `columns used: ${[...new Set(r.map((x) => x.columns))].join(', ')}`);
});

test('export.transparency', 'Export window: transparent background offered for PNG, WebP, GIF, AVIF, SVG, HTML only; files keep it', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const ui = await run(`A.run('exportChart'); await until(() => pop('export')?.querySelector('[data-ex-format]')); const out = {};
    for (const id of ['png', 'jpg', 'webp', 'gif', 'avif', 'svg', 'pdf', 'html', 'docx', 'markdown']) {
      pop('export').querySelector('[data-ex-format="' + id + '"]').click(); await sleep(60); const d = pop('export');
      out[id] = { offers: [...d.querySelectorAll('select[data-ex="background"] option')].some((o) => o.value === 'transparent'), note: d.querySelector('[data-ex-alpha]')?.dataset.exAlpha, mark: !!d.querySelector('[data-ex-format="' + id + '"] .ex-alpha') };
    }
    // Transparent on PNG, then JPEG (white), then back to PNG (transparent again).
    let d = pop('export'); d.querySelector('[data-ex-format="png"]').click(); await sleep(60); d = pop('export');
    const sel = d.querySelector('select[data-ex="background"]'); sel.value = 'transparent'; sel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(80);
    pop('export').querySelector('[data-ex-format="jpg"]').click(); await sleep(60); const onJpeg = pop('export').querySelector('select[data-ex="background"]').value;
    pop('export').querySelector('[data-ex-format="png"]').click(); await sleep(60); const backOnPng = pop('export').querySelector('select[data-ex="background"]').value;
    const checker = pop('export').querySelector('.ex-preview')?.classList.contains('checker');
    await A.popups.closeAll(); return { out, onJpeg, backOnPng, checker };`);
  for (const [id, x] of Object.entries(ui.out)) {
    const yes = ['png', 'webp', 'gif', 'avif', 'svg', 'html'].includes(id);
    assert(x.offers === yes && x.note === (yes ? 'yes' : 'no') && x.mark === yes, `${id}: ${JSON.stringify(x)}`);
  }
  assert(ui.onJpeg === 'white' && ui.backOnPng === 'transparent' && ui.checker, JSON.stringify(ui));
  // The files: PNG and WebP have see-through corners, GIF a transparency block, JPEG a white corner.
  const files = await run(`window.__downloads.length = 0; window.__blobs = {};
    for (const f of ['png', 'webp', 'gif', 'jpg']) await A.actions.exportChartAs({ format: f, scale: 1, background: 'transparent' }); await sleep(300);
    const corner = async (name) => { const bmp = await createImageBitmap(window.__blobs[name]); const c = new OffscreenCanvas(bmp.width, bmp.height); const g = c.getContext('2d'); g.drawImage(bmp, 0, 0); return [...g.getImageData(2, 2, 1, 1).data]; };
    const out = {}; for (const name of Object.keys(window.__blobs)) { const ext = name.split('.').pop(); out[ext] = await corner(name);
      if (ext === 'gif') { const b = new Uint8Array(await window.__blobs[name].arrayBuffer()); let flag = -1; for (let i = 13; i < b.length - 7; i++) if (b[i] === 0x21 && b[i + 1] === 0xf9) { flag = b[i + 3] & 1; break; } out.gifFlag = flag; } }
    return out;`);
  assert(files.png?.[3] === 0, `png corner ${files.png}`);
  assert(files.webp?.[3] === 0, `webp corner ${files.webp}`);
  assert(files.gifFlag === 1 && files.gif?.[3] === 0, `gif ${files.gif} flag ${files.gifFlag}`);
  assert(files.jpg?.[3] === 255 && files.jpg[0] > 240 && files.jpg[1] > 240 && files.jpg[2] > 240, `jpeg corner ${files.jpg}`);
});

// ───────────────────────── right panel: steppers, alignment, fine settings

test('panel.steppers', 'Every number in the right panel is a − value unit + stepper; steps change the chart at once', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await run(`const out = { raw: 0, steppers: 0 };
    for (const tab of ['data', 'style', 'axes', 'series', 'more']) { A.api.setInspectorTab(tab); await sleep(80); out.raw += qa('.ins-body input[type=number], .ins-body input[type=range]').length; out.steppers += qa('.ins-body .stepper').length;
      for (const st of qa('.ins-body .stepper')) { const kids = [...st.children].map((c) => c.className.split(' ')[0]); if (kids[0] !== 'stepper-button' || kids[1] !== 'stepper-value' || kids.at(-1) !== 'stepper-button') out.order = kids.join(','); } }
    A.api.setInspectorTab('style'); await sleep(80);
    const size = () => Number(q('.ch-canvas .chart-title').getAttribute('font-size'));
    const before = size(); const plus = q('.stepper[data-stepper="opt:titleSize"] [data-step-dir="1"]');
    plus.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); await sleep(120);
    const after = size(); const stored = doc().chart.options.titleSize;
    await sleep(700); const settled = doc().chart.options.titleSize; // released outside the panel: no more steps
    A.api.setInspectorTab('axes'); await sleep(80);
    const field = q('.stepper[data-stepper="opt:yMax"] .stepper-value'); field.value = '300'; field.dispatchEvent(new Event('change', { bubbles: true })); await sleep(80); const yMax = doc().chart.options.yMax;
    const top = Math.max(...qa('.ch-canvas .tick').map((t) => Number(t.textContent.replace(/[^0-9.-]/g, '')) || 0));
    field.value = ''; field.dispatchEvent(new Event('change', { bubbles: true })); await sleep(80);
    return { ...out, before, after, stored, settled, yMax, top, auto: doc().chart.options.yMax };`);
  assert(r.raw === 0 && r.steppers >= 15 && !r.order, `${r.raw} plain number inputs, ${r.steppers} steppers ${r.order ?? ''}`);
  assert(r.stored === 21 && r.after > r.before, `title size ${r.before} → ${r.after} (stored ${r.stored})`);
  assert(r.settled === 21, `the stepper kept stepping after the button was let go: ${r.settled}`);
  assert(r.yMax === 300 && r.top === 300 && r.auto === '', JSON.stringify(r));
});

test('panel.aligned', 'Right panel and Settings: every label and every control start on one vertical line', async () => {
  const panel = await run(`const out = {}; for (const tab of ['data', 'style', 'axes', 'series', 'more']) { A.api.setInspectorTab(tab); await sleep(80);
      const rows = qa('.ins-body .ins-row:not(.block)').filter((r) => r.offsetParent);
      out[tab] = { labels: [...new Set(rows.map((r) => Math.round(r.querySelector('.ins-label').getBoundingClientRect().left)))], controls: [...new Set(rows.map((r) => Math.round((r.querySelector('.ins-control > *') ?? r.querySelector('.ins-control')).getBoundingClientRect().left)))] }; }
    return out;`);
  for (const [tab, x] of Object.entries(panel)) assert(x.labels.length === 1 && x.controls.length === 1, `${tab}: labels at ${x.labels}, controls at ${x.controls}`);
  const settings = await run(`A.popups.open('settings', { tab: 'charts' }); await until(() => pop('settings')?.querySelector('[data-action="tab"]')); const out = {};
    for (const b of [...pop('settings').querySelectorAll('[data-action="tab"]')]) { b.click(); await sleep(150); const d = pop('settings'); const tab = b.dataset.value ?? b.dataset.tab;
      const rows = [...d.querySelectorAll('.row')].filter((r) => r.querySelector('.row-control > *') && r.offsetParent);
      const lefts = [...new Set(rows.map((r) => Math.round(r.querySelector('.row-control > *').getBoundingClientRect().left)))];
      const widths = [...new Set(rows.map((r) => r.querySelector('.row-control > *')).filter((el) => el.matches('.stepper, select')).map((el) => Math.round(el.getBoundingClientRect().width)))];
      out[tab] = { lefts, widths, raw: d.querySelectorAll('input[type=number], input[type=range]').length }; }
    await A.popups.closeAll(); return out;`);
  for (const [tab, x] of Object.entries(settings)) {
    if (!x.lefts.length) continue;
    assert(x.lefts.length === 1 && x.widths.length <= 1 && !x.raw, `Settings ${tab}: controls at ${x.lefts}, widths ${x.widths}, ${x.raw} plain number inputs`);
  }
});

test('panel.fine', 'Fine settings reach the picture: titles, legend, axes, ticks, grid, plot area, marks, text', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await run(`const set = (o) => { doc().setChart({ options: o }); A.api.refresh?.(); };
    const draw = async (o) => { for (const [k, v] of Object.entries(o)) A.actions.setOption(k, v); await sleep(80); return svg(); };
    let s = await draw({ titleColor: '#7c3aed', titleSize: 30, titleBold: false, subtitleColor: '#0d9488' });
    const title = q('.ch-canvas .chart-title'); const sub = q('.ch-canvas .chart-subtitle');
    const titles = [title.getAttribute('fill'), title.getAttribute('font-weight'), sub.getAttribute('fill')];
    s = await draw({ axisColor: '#dc2626', axisWidth: 3, tickColor: '#2563eb', tickSize: 16, gridColor: '#f59e0b', gridWidth: 2, gridStyle: 'dashed' });
    const axis = q('.ch-canvas line.axis'); const tick = q('.ch-canvas .tick'); const grid = q('.ch-canvas line.grid');
    const axes = [axis.getAttribute('stroke'), axis.getAttribute('stroke-width'), tick.getAttribute('fill'), tick.getAttribute('font-size') > 14, grid.getAttribute('stroke'), grid.getAttribute('stroke-width'), grid.getAttribute('stroke-dasharray')];
    s = await draw({ yStep: 25 }); const ticks = qa('.ch-canvas .tick').map((t) => Number(t.textContent.replace(/[^0-9.-]/g, ''))).filter(Number.isFinite);
    s = await draw({ showYLabels: false, showXLabels: false }); const hidden = [qa('.ch-canvas .tick').length, qa('.ch-canvas .cat').length];
    s = await draw({ showYLabels: true, showXLabels: true, yTitle: 'Sales', axisTitleColor: '#be123c', axisTitleSize: 18 }); const at = q('.ch-canvas .axis-title[data-axis="y"]');
    const axisTitle = [at?.textContent, at?.getAttribute('fill'), Number(at?.getAttribute('font-size')) > 16];
    s = await draw({ showAxisTitles: false }); const noTitles = qa('.ch-canvas .axis-title').length;
    s = await draw({ plotBackground: '#f1f5f9', plotBorder: true, padding: 40, markOpacity: 0.5, markStroke: 2, markStrokeColor: '#111827' });
    const bar = q('.ch-canvas .mark.bar'); const plot = [!!q('.ch-canvas .plot-bg'), !!q('.ch-canvas .plot-border'), bar.getAttribute('opacity'), bar.getAttribute('stroke')];
    s = await draw({ legend: 'custom', legendX: 10, legendY: 20, legendBox: true, legendFontSize: 18, legendColor: '#047857', legendSwatch: 'circle' });
    const lg = q('.ch-canvas g.legend'); const box = lg.querySelector('.legend-box'); const vb = svg().viewBox.baseVal;
    const legend = [lg.dataset.legendPlace, Math.round((Number(box.getAttribute('x')) / vb.width) * 100), Math.round((Number(box.getAttribute('y')) / vb.height) * 100), box.getAttribute('fill') !== 'transparent', !!lg.querySelector('circle'), lg.querySelector('text').getAttribute('fill')];
    s = await draw({ dataLabels: true, textScale: 1.5, textColor: '#9a3412' }); const dl = q('.ch-canvas .data-label');
    const text = [dl.getAttribute('fill'), Number(dl.getAttribute('font-size')) > 14];
    return { titles, axes, ticks, hidden, axisTitle, noTitles, plot, legend, text };`);
  assert(r.titles.join() === '#7c3aed,500,#0d9488', `titles ${r.titles}`);
  assert(r.axes[0] === '#dc2626' && r.axes[1] === '3' && r.axes[2] === '#2563eb' && r.axes[3] && r.axes[4] === '#f59e0b' && r.axes[5] === '2' && r.axes[6] === '5 4', `axes ${r.axes}`);
  assert(r.ticks.length > 3 && r.ticks.every((v) => v % 25 === 0), `ticks ${r.ticks}`);
  assert(r.hidden[0] === 0 && r.hidden[1] === 0, `hidden tick labels ${r.hidden}`);
  assert(r.axisTitle[0] === 'Sales' && r.axisTitle[1] === '#be123c' && r.axisTitle[2] && r.noTitles === 0, `axis title ${r.axisTitle} / ${r.noTitles}`);
  assert(r.plot.join() === 'true,true,0.5,#111827', `plot ${r.plot}`);
  assert(r.legend[0] === 'custom' && Math.abs(r.legend[1] - 10) <= 1 && Math.abs(r.legend[2] - 20) <= 1 && r.legend[3] && r.legend[4] && r.legend[5] === '#047857', `legend ${r.legend}`);
  assert(r.text[0] === '#9a3412' && r.text[1], `text ${r.text}`);
});

test('chart.legendDrag', 'The legend is dragged with the mouse to any spot (its click does not hide a series)', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await run(`const lg = q('.ch-canvas g.legend'); const item = lg.querySelector('[data-legend]'); const b = item.getBoundingClientRect();
    const x = b.left + 5; const y = b.top + 5;
    item.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: x, clientY: y }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: x - 200, clientY: y - 250 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: x - 200, clientY: y - 250 }));
    item.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x - 200, clientY: y - 250 })); await sleep(120);
    const o = doc().chart.options; return { legend: o.legend, x: o.legendX, y: o.legendY, hidden: o.hidden.length, place: q('.ch-canvas g.legend')?.dataset.legendPlace, panel: (A.api.setInspectorTab('style'), await sleep(80), !!q('.stepper[data-stepper="opt:legendX"]')) };`);
  assert(r.legend === 'custom' && r.place === 'custom' && r.x > 0 && r.y > 0 && r.y < 80, JSON.stringify(r));
  assert(r.hidden === 0, 'the drag also hid a series');
  assert(r.panel, 'the Style tab shows no legend X / Y for the free spot');
  const undo = await run(`A.actions.undo(); await sleep(80); return doc().chart.options.legend;`);
  assert(undo === 'bottom', `undo → ${undo}`);
});

test('chart.axisTitleEdit', 'Double-clicking an axis title edits it (empty brings back the automatic title)', async () => {
  await closeAll();
  await openSample('height-weight');
  const r = await run(`const t = q('.ch-canvas .axis-title[data-axis="x"]'); const before = t?.textContent;
    t.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await until(() => pop('prompt')?.querySelector('input'));
    const d = pop('prompt'); const input = d.querySelector('[data-draft="value"]') ?? d.querySelector('input'); const shown = input.value; input.value = 'Height in cm'; input.dispatchEvent(new Event('input', { bubbles: true }));
    d.querySelector('[data-action="prompt-apply"]').click(); await until(() => doc().chart.options.xTitle === 'Height in cm'); await sleep(80);
    return { before, shown, after: q('.ch-canvas .axis-title[data-axis="x"]')?.textContent };`).catch((e) => ({ error: e.message }));
  assert(!r.error, r.error);
  assert(r.before && r.shown === r.before && r.after === 'Height in cm', JSON.stringify(r));
});

test('menus.chartParts', 'Right-click menus fit the part clicked (legend, axis title, axis, title, mark, plot) and always offer Export and Print', async () => {
  await closeAll();
  await openSample('monthly-sales');
  await run(`A.actions.setOption('yTitle', 'Sales'); await sleep(80); return 1;`);
  const r = await run(`const out = {};
    const open = async (el, name) => { const b = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.left + 2, clientY: b.top + 2 }));
      await until(() => pop('menu')?.querySelector('.menu-item'), 5000).catch(() => null); const d = pop('menu');
      out[name] = d ? [...d.querySelectorAll('.menu-item')].map((x) => x.dataset.id ?? x.dataset.item ?? x.textContent.trim()) : []; await A.popups.closeAll(); await sleep(60); };
    await open(q('.ch-canvas g.legend [data-legend]'), 'legend'); await open(q('.ch-canvas .axis-title[data-axis="y"]'), 'axisTitle'); await open(q('.ch-canvas .tick'), 'axis');
    await open(q('.ch-canvas .chart-title'), 'title'); await open(q('.ch-canvas .mark.bar'), 'mark'); await open(q('.ch-canvas .chart-bg'), 'plot');
    await open(q('.dg-cell'), 'cell'); await open(q('[data-tab]'), 'tab'); return out;`);
  const has = (list, text) => list.some((x) => String(x).includes(text));
  for (const [part, list] of Object.entries(r)) {
    assert(list.length >= 3, `${part}: ${list.length} items`);
    assert(has(list, 'print') || has(list, '인쇄') || has(list, 'Print'), `${part} menu has no Print: ${list.join(' | ')}`);
    assert(has(list, 'export') || has(list, '내보내기') || has(list, 'Export'), `${part} menu has no Export: ${list.join(' | ')}`);
  }
  assert(has(r.legend, 'legendBox') || has(r.legend, 'Legend box') || has(r.legend, '범례 상자'), `legend menu ${r.legend}`);
  assert(has(r.axisTitle, 'editAxis') || has(r.axisTitle, 'Edit axis') || has(r.axisTitle, '축 제목 고치기'), `axis title menu ${r.axisTitle}`);
  assert(has(r.mark, 'hide') || has(r.mark, 'Hide') || has(r.mark, '숨기기'), `mark menu ${r.mark}`);
});

test('chart.mixed', 'Two or more ways of drawing together (columns + line + area, right axis); impossible mixes say so in a popup', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await run(`A.api.setInspectorTab('series'); await sleep(80);
    const pick = (sel, v) => { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); };
    pick(q('select[data-series-kind="1"]'), 'line'); await sleep(80); pick(q('select[data-series-kind="2"]'), 'area'); await sleep(80); pick(q('select[data-series-axis="2"]'), 'right'); await sleep(120);
    const shape = { bars: qa('.ch-canvas .mark.bar').length, lines: qa('.ch-canvas path.mark.line').length, areas: qa('.ch-canvas .mark.area').length, rightTicks: qa('.ch-canvas .tick[text-anchor="start"]').length };
    const o = doc().chart.options; const stored = [o.seriesTypes[1], o.seriesTypes[2], o.seriesAxis[2]];
    // A stacked chart cannot mix: the popup says so and nothing changes.
    A.actions.setChartType('stackedColumn'); await sleep(120); A.api.setInspectorTab('series'); await sleep(80); const beforeRefused = JSON.stringify(doc().chart.options.seriesTypes);
    pick(q('select[data-series-kind="0"]'), 'line'); const popup = await until(() => pop('confirm')?.querySelector('.confirm-message'), 4000).then((m) => m.textContent, () => '');
    await A.popups.closeAll(); return { shape, stored, popup, before: beforeRefused, after: JSON.stringify(doc().chart.options.seriesTypes) };`);
  assert(r.shape.bars === 12 && r.shape.lines >= 1 && r.shape.areas >= 1 && r.shape.rightTicks >= 3, `mixed picture ${JSON.stringify(r.shape)}`);
  assert(r.stored.join() === 'line,area,right', `stored ${r.stored}`);
  assert(r.popup.length > 10, 'no popup for an impossible mix');
  assert(r.after === r.before, `the refused mix changed the chart: ${r.before} → ${r.after}`);
});

test('data.range', 'Chart the cells selected with the mouse; the rest fade; whole table again; a new chart from the selection', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await run(`const grid = A.view().grid; grid.setActive(2, 0); grid.setActive(6, 2, { extend: true }); await sleep(60);
    await A.run('chartFromSelection'); await sleep(150);
    const range = doc().chart.dataRange; const cats = qa('.ch-canvas .cat').map((c) => c.textContent);
    const bars = qa('.ch-canvas .mark.bar').length; const faded = qa('.dg-cell.out-chart').length; const lit = qa('.dg-cell.in-chart').length;
    A.api.setInspectorTab('data'); await sleep(60); const label = q('.ins-range-name')?.textContent;
    await A.run('clearDataRange'); await sleep(100); const whole = [doc().chart.dataRange, qa('.ch-canvas .mark.bar').length];
    grid.setActive(0, 0); grid.setActive(3, 1, { extend: true }); const n = A.state.docs.length; await A.run('newChartFromSelection'); await sleep(150);
    const made = [A.state.docs.length - n, doc().table.rows.length, doc().table.columns.length, qa('.ch-canvas .mark').length > 0];
    return { range, cats, bars, faded, lit, label, whole, made };`);
  assert(JSON.stringify(r.range) === '{"r0":2,"r1":6,"c0":0,"c1":2}', `range ${JSON.stringify(r.range)}`);
  assert(r.cats.length === 5 && r.bars === 10, `chart of the selection: ${r.cats.length} categories, ${r.bars} bars`);
  assert(r.faded > 0 && r.lit === 15, `grid shading: ${r.lit} in, ${r.faded} out`);
  assert(r.label === 'A4:C8', `range name ${r.label}`);
  assert(r.whole[0] == null && r.whole[1] === 36, `whole table ${r.whole}`);
  assert(r.made.join() === '1,4,2,true', `new chart from selection ${r.made}`);
});

test('data.orientation', 'Data typed across (series in rows) and down (series in columns) both draw', async () => {
  await closeAll();
  // A table typed across: the first column names the series, the months run along the header.
  const across = await run(`for (const d of [...A.state.docs]) await A.actions.closeDoc(d, { force: true });
    A.api.importText('Region,Jan,Feb,Mar,Apr\\nNorth,10,12,15,14\\nSouth,8,9,11,13\\nEast,5,7,6,9\\n', 'across.csv'); await until(() => pop('import')?.querySelector('[data-action="import-ok"]'));
    pop('import').querySelector('[data-action="import-ok"]').click(); await until(() => svg()); await sleep(100);
    const down = { cats: qa('.ch-canvas .cat').map((c) => c.textContent), legend: qa('.ch-canvas .legend-item').length };
    await A.run('seriesInRows'); await sleep(150);
    const rows = { cats: qa('.ch-canvas .cat').map((c) => c.textContent), legend: [...qa('.ch-canvas .legend-item text')].map((t) => t.textContent), bars: qa('.ch-canvas .mark.bar').length, seriesIn: doc().chart.seriesIn };
    await A.run('seriesInColumns'); await sleep(100); return { down, rows, back: doc().chart.seriesIn };`);
  assert(across.down.cats.join() === 'North,South,East' && across.down.legend === 4, `series in columns ${JSON.stringify(across.down)}`);
  assert(across.rows.cats.join() === 'Jan,Feb,Mar,Apr' && across.rows.legend.join() === 'North,South,East' && across.rows.bars === 12 && across.rows.seriesIn === 'rows', `series in rows ${JSON.stringify(across.rows)}`);
  assert(across.back === 'columns', 'back to columns');
});

// ───────────────────────── menus, shortcuts, context menus

test('menus.chartGroups', 'Chart menu: one submenu per group, 108 types in all, every item named and enabled', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await run(`const groups = A.menus.MENUS.chart.filter((x) => typeof x === 'object' && x.sub.startsWith('types:')).map((x) => x.sub);
    const items = groups.flatMap((g) => A.menus.SUBMENUS[g].items); const raw = items.filter((id) => !A.commands[id] || A.t(A.commands[id].label) === A.commands[id].label);
    const names = groups.map((g) => A.t('submenu.' + g)).filter((n) => n.startsWith('submenu.'));
    return { groups: groups.length, items: items.length, unique: new Set(items).size, raw, names, disabled: items.filter((id) => !A.menus.enabled(id)) };`);
  assert(r.groups === CHART_GROUPS.length && r.items === CHART_COUNT && r.unique === CHART_COUNT, JSON.stringify(r));
  assert(!r.raw.length && !r.names.length && !r.disabled.length, JSON.stringify(r));
});

test('menus.everyItem', 'Every menu and submenu item is a command with a label and an icon (no raw keys)', async () => {
  const r = await run(`const bad = []; const all = [];
    const walk = (items, where) => { for (const it of items) { if (it === '-') continue; if (typeof it === 'object') { if (it.sub !== 'sampleList' && !A.menus.SUBMENUS[it.sub]) bad.push(where + ': no submenu ' + it.sub); else if (A.menus.SUBMENUS[it.sub]) walk(A.menus.SUBMENUS[it.sub].items, where + '›' + it.sub); continue; }
      all.push(it); const c = A.commands[it]; if (!c) { bad.push(where + ': ' + it); continue; } if (!c.icon) bad.push(it + ': no icon'); const text = A.t(c.label); if (!text || text === c.label) bad.push(it + ': ' + c.label); } };
    for (const [m, items] of Object.entries(A.menus.MENUS)) walk(items, m);
    for (const it of [...A.menus.TOOLBAR.flat(), ...A.menus.TOOLBAR_RIGHT.flat()]) if (it !== '-' && !A.commands[it] && !['zoomValue', 'themeSplit'].includes(it)) bad.push('toolbar: ' + it); // two widgets: the zoom box and the theme split button
    return { n: all.length, bad };`);
  assert(r.n > 150, `${r.n} items`);
  assert(!r.bad.length, r.bad.slice(0, 10).join(' | '));
});

test('menus.shortcuts', 'Every keyboard shortcut runs its command', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await run(`const ran = []; const saved = {};
    for (const [, , , id] of A.menus.SHORTCUTS) if (!saved[id]) { saved[id] = A.commands[id].run; A.commands[id].run = () => { ran.push(id); }; A.commands[id].__spy = true; }
    const missed = [];
    try {
      for (const [k, shift, alt, id] of A.menus.SHORTCUTS) {
        if (!A.menus.enabled(id)) continue; const before = ran.length; const key = k === 'enter' ? 'Enter' : k;
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: shift && k.length === 1 && /[a-z]/.test(k) ? key.toUpperCase() : key, ctrlKey: true, shiftKey: shift, altKey: alt, bubbles: true, cancelable: true }));
        await sleep(5); if (ran.length === before || ran.at(-1) !== id) missed.push((shift ? 'Shift+' : '') + 'Ctrl+' + k + ' → ' + id);
      }
    } finally { for (const [id, fn] of Object.entries(saved)) { A.commands[id].run = fn; delete A.commands[id].__spy; } }
    return { n: A.menus.SHORTCUTS.length, missed };`);
  assert(!r.missed.length, `${r.missed.length}/${r.n} shortcuts did nothing: ${r.missed.join(', ')}`);
});

test('menus.context', 'Right-click menus: chart, grid cell, column header and tab offer their commands', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await run(`const out = {};
    const open = async (el, name) => { el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 })); await until(() => pop('menu')?.querySelector('.menu-item'), 5000).catch(() => null);
      const d = pop('menu'); out[name] = d ? d.querySelectorAll('.menu-item').length : 0; await A.popups.closeAll(); await sleep(60); };
    await open(q('.ch-canvas svg'), 'chart'); await open(q('.dg-cell'), 'cell'); await open(q('.dg-hcell'), 'header'); await open(q('[data-tab]'), 'tab');
    return out;`);
  for (const [name, n] of Object.entries(r)) assert(n >= 3, `${name} menu has ${n} items (${JSON.stringify(r)})`);
});

// ───────────────────────── per-command cases

/** One case per chart command: what it must change on the open chart. */
export async function commandCases(ctx) {
  app = ctx;
  const ids = await run(`return Object.keys(A.commands).filter((id) => /^(type|chartTheme|palette|bg|legend):/.test(id));`);
  const ensure = `if (!doc()) { A.actions.openSample('monthly-sales'); await until(() => svg()); }`;
  return ids.map((id) => {
    const [kind, value] = id.split(':');
    const group = { type: 'Command · chart type', chartTheme: 'Command · chart theme', palette: 'Command · palette', bg: 'Command · background', legend: 'Command · legend' }[kind];
    return {
      group,
      name: id,
      run: async (c) => {
        app = c;
        const r = await run(`${ensure} const before = svg().outerHTML; await A.run(${JSON.stringify(id)}); await sleep(30);
          const o = doc().chart.options; const checked = A.commands[${JSON.stringify(id)}].checked?.() ?? null;
          return { type: doc().chart.type, o: { chartTheme: o.chartTheme, palette: o.palette, background: o.background, legend: o.legend }, checked, marks: marks(), changed: svg().outerHTML !== before, note: /Choose |고르세요/.test(svg().textContent) };`);
        const field = { type: r.type, chartTheme: r.o.chartTheme, palette: r.o.palette, bg: r.o.background, legend: r.o.legend }[kind];
        assert(field === value, `${id}: the chart has ${field}`);
        assert(r.checked !== false, `${id}: not ticked in its menu`);
        assert(r.marks > 0 || r.note, `${id}: no marks and no note`);
      },
    };
  });
}

/**
 * One case per sample: open it, then choose every chart type in the right panel's type list (Data tab) as a user
 * does, one after another on the same chart. Each type must draw marks and no "choose a column" note.
 */
export async function panelTypeCases(ctx) {
  app = ctx;
  const samples = await run(`return A.domain.SAMPLES.map((s) => s.id);`);
  return samples.map((id) => ({
    group: 'Right panel · chart type',
    name: `${id}: every type from the panel's list draws`,
    run: async (c) => {
      app = c;
      const r = await run(`for (const d of [...A.state.docs]) await A.actions.closeDoc(d, { force: true });
        A.actions.openSample(${JSON.stringify(id)}); await until(() => svg()); A.api.setInspectorTab('data'); await until(() => q('select[data-type]'));
        const types = [...q('select[data-type]').options].map((o) => o.value); const bad = [];
        for (const type of types) {
          const sel = q('select[data-type]'); sel.value = type; sel.dispatchEvent(new Event('change', { bubbles: true }));
          await until(() => doc().chart.type === type && svg(), 4000).catch(() => null);
          const text = svg()?.textContent ?? '';
          if (doc().chart.type !== type) bad.push(type + ': not chosen');
          else if (!marks()) bad.push(type + ': blank');
          else if (/Choose |고르세요|No positive values|양수 값이 없습니다|No numbers|숫자가 없습니다|No data yet|데이터가 없습니다/.test(text)) bad.push(type + ': note');
        }
        await A.actions.closeDoc(doc(), { force: true });
        return { n: types.length, bad };`);
      assert(r.n === CHART_COUNT, `${r.n} types in the panel's list`);
      assert(!r.bad.length, `${r.bad.length} types show nothing: ${r.bad.slice(0, 10).join(', ')}`);
    },
  }));
}

// ───────────────────────── export

const GROUP_NAMES = { panel: 'Right panel', start: 'Start page', chrome: 'Window', popups: 'Popups', chart: 'Charts', grid: 'Data grid', data: 'Data', inspector: 'Inspector', import: 'Input files', export: 'Output', print: 'Printing', files: 'Files', look: 'Look', help: 'Help', menus: 'Menus', theme: 'Chart themes' };
const passedIds = new Set();
const ranIds = new Set();
const wrap = (item) => ({
  group: GROUP_NAMES[item.id.split('.')[0]] ?? item.id.split('.')[0],
  name: `${item.id} — ${item.name}`,
  run: async (ctx) => {
    app = ctx;
    ranIds.add(item.id);
    try {
      await item.fn();
      passedIds.add(item.id);
    } catch (error) {
      await ctx.screenshot(item.id);
      throw error;
    } finally {
      await run(`await A.popups.closeAll(); for (const el of qa('.web-popup, .web-popup-shield')) el.remove(); A.popups.frames.clear(); return 1;`).catch(() => {});
    }
  },
});

/** Every feature must be proven by at least one passing case (features proven elsewhere are marked `by`). */
const featuresCase = {
  group: 'Coverage',
  name: 'every feature of features.mjs has passing cases',
  run: async () => {
    if (process.env.MYCHARTMASTER_E2E_ONLY) return { skipped: 'MYCHARTMASTER_E2E_ONLY runs a part of the cases' };
    const ids = new Set(CASES.map((x) => x.id));
    const mine = FEATURES.filter((f) => !f.by);
    const uncovered = mine.filter((f) => !f.cases.some((id) => ids.has(id)));
    const unproven = mine.filter((f) => f.cases.some((id) => ids.has(id)) && !f.cases.every((id) => passedIds.has(id) || !ids.has(id)));
    if (uncovered.length || unproven.length) throw new Error([...uncovered.map((f) => `no case: ${f.name}`), ...unproven.map((f) => `failing: ${f.name}`)].join('\n'));
    return undefined;
  },
};

export const cases = [...CASES.map(wrap), featuresCase];
