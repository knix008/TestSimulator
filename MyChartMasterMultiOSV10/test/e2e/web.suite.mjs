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
  for (const id of ['newchart', 'recent', 'actions', 'samples', 'background']) assert(r.cards.includes(id), `card ${id} missing`);
  assert(!r.cards.includes('theme'), 'the start page has no theme card (the user asked for it to go)');
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

test('chrome.toolbar', 'Toolbar: coloured icons only (no text), nothing clipped at the minimum width, no sideways scroll', async () => {
  const r = await run(`const min = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--min-width'));
    const buttons = qa('#toolbar .tool-button'); const tones = qa('#toolbar .icon[data-tone]').length;
    const bar = q('#toolbar').getBoundingClientRect(); const clipped = buttons.filter((b) => b.getBoundingClientRect().right > bar.right + 1).length;
    return { min, count: buttons.length, tones, clipped, labelled: buttons.filter((b) => b.textContent.trim() || b.querySelector('span:not(.icon)')).map((b) => b.dataset.command + ':' + b.textContent.trim()), untitled: buttons.filter((b) => !b.title || !b.getAttribute('aria-label')).map((b) => b.dataset.command), scroll: document.documentElement.scrollWidth - innerWidth };`);
  assert(r.count >= 30 && r.tones >= 30, `${r.count} buttons, ${r.tones} coloured`);
  assert(r.min >= 900, `min width ${r.min}`);
  assert(!r.clipped && r.scroll <= 0, `clipped ${r.clipped}, scroll ${r.scroll}`);
  assert(!r.labelled.length, `toolbar buttons with text: ${r.labelled}`);
  assert(!r.untitled.length, `toolbar buttons without a tooltip or name: ${r.untitled}`);
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

test('chart.zoom', 'Zoom in, out, fit and Ctrl+wheel change the picture size; the chart bar shows icons only', async () => {
  const r = await run(`const w = () => svg().getBoundingClientRect().width; const fit = w();
    A.run('zoomIn'); await sleep(80); const inW = w(); A.run('zoomOut'); A.run('zoomOut'); await sleep(80); const outW = w();
    q('.ch-stage').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, ctrlKey: true })); await sleep(80); const wheel = A.state.settings.textZoom;
    A.run('zoomFit'); await sleep(80); return { fit, inW, outW, wheel, back: Math.abs(w() - fit) < 2, fitIcon: !!q('#toolbar [data-command="zoomFit"] svg') && !q('#toolbar [data-command="zoomFit"]').textContent.trim(), stageText: qa('.ch-stage-bar button').filter((b) => b.textContent.trim() || !b.title).map((b) => b.dataset.command), stageFit: !!q('.ch-stage-bar [data-command="zoomFit"] svg') };`);
  assert(r.inW > r.outW && r.wheel > 0 && r.back && r.fitIcon && r.stageFit && !r.stageText.length, JSON.stringify(r));
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
    const options = qa('.ins-theme-tile[data-ins-theme]').map((b) => b.dataset.insTheme).filter((id) => id !== 'custom');
    const before = q('.ch-canvas .mark.bar').getAttribute('fill'); const appTheme = A.state.settings.theme;
    q('[data-ins-theme="forest"]').click(); await until(() => doc().chart.options.chartTheme === 'forest');
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
      const rows = qa('.ins-body .ins-row:not(.block):not(.ins-row-stack)').filter((r) => r.offsetParent && !r.closest('.ins-picked'));
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
    for (const it of [...A.menus.TOOLBAR.flat(), ...A.menus.TOOLBAR_RIGHT.flat()]) if (it !== '-' && !A.commands[it] && it !== 'themeSplit') bad.push('toolbar: ' + it); // one widget: the theme split button
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

/** In-page helpers for the grid's right-click cases: real presses on cells, the real menu frame, a fresh sample. */
const GRID_CTX = `const cell = (r, c) => q('.dg-cell[data-row="' + r + '"][data-col="' + c + '"]');
  const press = (el, button = 0, shift = false) => { const b = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button, shiftKey: shift, clientX: b.left + 3, clientY: b.top + 3 })); window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); };
  const select = (r0, c0, r1, c1) => { press(cell(r0, c0)); press(cell(r1, c1), 0, true); };
  const rightClick = async (el) => { const b = el.getBoundingClientRect(); press(el, 2); el = document.elementFromPoint(b.left + 3, b.top + 3) ?? el; el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: b.left + 3, clientY: b.top + 3 })); await until(() => pop('menu')?.querySelector('.menu-item'), 5000).catch(() => { throw new Error('no menu at ' + window.__gs?.step + ' frame=' + !!q('.web-popup-menu') + ' vis=' + q('.web-popup-menu')?.style.visibility + ' items=' + JSON.stringify(pop('menu')?.body?.innerHTML?.slice(0, 200))); }); };
  const choose = async (...ids) => { for (const id of ids) { const item = await until(() => pop('menu')?.querySelector('.menu-item[data-id="' + id + '"]'), 3000).catch(() => null); if (!item) return 'missing ' + id; if (item.disabled) return 'disabled ' + id; item.click(); await sleep(40); } await until(() => !q('.web-popup-menu'), 3000).catch(() => null); await sleep(120); return q('.web-popup-menu') ? 'menu still open' : 'ok'; };
  const sel = () => { const s = A.view().grid.selection(); return [s.r0, s.c0, s.r1, s.c1].join(','); };
  const fresh = async () => { await A.popups.closeAll(); for (const d of [...A.state.docs]) await A.actions.closeDoc(d, { force: true }); A.actions.openSample('monthly-sales'); await until(() => svg()); await sleep(120); };
  const T = () => doc().table;`;

test('menus.gridSelection', 'Right-click inside a selected range, rows or columns keeps the selection for the menu', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await run(`${GRID_CTX}
    const out = {}; window.__gs = out;
    out.step = 'range'; select(1, 1, 3, 2); await rightClick(cell(2, 2)); out.range = sel(); out.painted = qa('.dg-cell.sel').length; out.title = pop('menu')?.title ?? ''; await A.popups.closeAll(); await sleep(60);
    out.step = 'rows'; press(q('[data-rownum="1"]')); press(q('[data-rownum="3"]'), 0, true); await rightClick(q('[data-rownum="2"]')); out.rows = sel(); await A.popups.closeAll(); await sleep(60);
    out.step = 'column'; press(q('.dg-hcell[data-col="1"]')); await rightClick(q('.dg-hcell[data-col="1"]')); out.column = sel(); await A.popups.closeAll(); await sleep(60);
    out.step = 'outside'; select(1, 1, 3, 2); await rightClick(cell(6, 0)); out.outside = sel(); await A.popups.closeAll(); await sleep(60);
    out.lastRow = T().rows.length - 1; out.lastCol = T().columns.length - 1;
    return out;`);
  assert(r.range === '1,1,3,2' && r.painted === 6, `range lost on right-click: ${JSON.stringify(r)}`);
  assert(r.rows === `1,0,3,${r.lastCol}`, `rows lost on right-click: ${JSON.stringify(r)}`);
  assert(r.column === `0,1,${r.lastRow},1`, `column lost on right-click: ${JSON.stringify(r)}`);
  assert(r.outside === '6,0,6,0', `a right-click outside the range must select that cell: ${JSON.stringify(r)}`);
});

test('menus.gridItems', 'Every item of the grid right-click menu does its work on the selected cells and closes the menu', async () => {
  await closeAll();
  const r = await run(`${GRID_CTX}
    const out = {};
    const step = async (name, prepare, ids, check) => { try { await fresh(); const before = await prepare(); const how = await choose(...ids); out[name] = how === 'ok' ? (await check(before)) || 'ok' : how; } catch (e) { out[name] = 'error ' + (e?.message ?? e); } };
    let clip = ''; navigator.clipboard.writeText = async (t) => { clip = t; }; navigator.clipboard.readText = async () => '71\\t72\\r\\n73\\t74';
    const popOpen = async (kind) => { const ok = await until(() => q('.web-popup-' + kind), 4000).then(() => true).catch(() => false); await A.popups.closeAll(); return ok ? '' : kind + ' popup did not open'; };
    await step('asCategory', async () => { await rightClick(cell(0, 2)); }, ['custom:asCategory'], () => doc().chart.mapping.category === 2 ? '' : 'category ' + doc().chart.mapping.category);
    await step('asSeries', async () => { await rightClick(cell(0, 1)); return doc().chart.mapping.values.includes(1); }, ['custom:asSeries'], (had) => doc().chart.mapping.values.includes(1) !== had ? '' : 'series not toggled');
    await step('chartFromSelection', async () => { select(0, 0, 3, 1); await rightClick(cell(1, 1)); }, ['chartFromSelection'], () => JSON.stringify(doc().chart.dataRange) === JSON.stringify({ r0: 0, r1: 3, c0: 0, c1: 1 }) ? '' : 'range ' + JSON.stringify(doc().chart.dataRange));
    await step('clearDataRange', async () => { select(0, 0, 3, 1); await A.run('chartFromSelection'); await sleep(50); await rightClick(cell(1, 1)); }, ['clearDataRange'], () => doc().chart.dataRange == null ? '' : 'range kept');
    await step('newChartFromSelection', async () => { select(0, 0, 3, 1); await rightClick(cell(2, 1)); return A.state.docs.length; }, ['newChartFromSelection'], (n) => A.state.docs.length === n + 1 && T().rows.length === 4 && T().columns.length === 2 ? '' : 'docs ' + A.state.docs.length + ' rows ' + T().rows.length);
    await step('copyCells', async () => { select(0, 1, 2, 2); await rightClick(cell(1, 1)); clip = ''; return A.view().grid.selectionText(); }, ['copyCells'], (want) => clip === want && clip.split('\\r\\n').length === 3 ? '' : 'copied ' + JSON.stringify(clip));
    await step('pasteCells', async () => { select(1, 1, 2, 2); await rightClick(cell(2, 2)); }, ['pasteCells'], () => '');
    out.pasteCells = out.pasteCells === 'ok' ? (await until(() => T().rows[1][1] === 71, 2000).then(() => [T().rows[1][1], T().rows[1][2], T().rows[2][1], T().rows[2][2]].join() === '71,72,73,74' ? 'ok' : 'pasted wrong').catch(() => 'not pasted ' + T().rows[1][1])) : out.pasteCells;
    await step('clearCells', async () => { select(1, 1, 2, 2); await rightClick(cell(1, 2)); }, ['clearCells'], () => [T().rows[1][1], T().rows[1][2], T().rows[2][1], T().rows[2][2]].every((v) => v == null) ? '' : 'not cleared');
    await step('addRow', async () => { select(1, 1, 2, 2); await rightClick(cell(2, 1)); return T().rows.length; }, ['addRow'], (n) => T().rows.length === n + 1 && T().rows[3].every((v) => v == null) ? '' : 'rows ' + T().rows.length);
    await step('addColumn', async () => { select(1, 1, 2, 2); await rightClick(cell(2, 1)); return T().columns.length; }, ['addColumn'], (n) => T().columns.length === n + 1 && T().rows[0][3] == null ? '' : 'cols ' + T().columns.length);
    await step('deleteRows', async () => { select(1, 1, 3, 1); await rightClick(cell(2, 1)); return { n: T().rows.length, next: JSON.stringify(T().rows[4]) }; }, ['deleteRows'], (b) => T().rows.length === b.n - 3 && JSON.stringify(T().rows[1]) === b.next ? '' : 'rows ' + T().rows.length);
    await step('deleteColumns', async () => { select(1, 1, 1, 2); await rightClick(cell(1, 2)); return { n: T().columns.length, next: T().columns[3].name }; }, ['deleteColumns'], (b) => T().columns.length === b.n - 2 && T().columns[1].name === b.next ? '' : 'cols ' + T().columns.map((c) => c.name));
    await step('renameColumn', async () => { await rightClick(q('.dg-hcell[data-col="2"]')); }, ['renameColumn'], async () => { const d = await until(() => pop('prompt')?.querySelector('input'), 4000).catch(() => null); if (!d) return 'prompt did not open'; const ok = d.value === T().columns[2].name; await A.popups.closeAll(); return ok ? '' : 'prompt shows ' + d.value; });
    await step('columnType', async () => { await rightClick(cell(1, 2)); }, ['submenu:columnType', 'colType:text'], () => T().columns[2].type === 'text' ? '' : 'type ' + T().columns[2].type);
    await step('sortAsc', async () => { await rightClick(cell(1, 2)); }, ['sortAsc'], () => T().rows.every((row, i, a) => i === 0 || row[2] >= a[i - 1][2]) ? '' : 'not ascending');
    await step('sortDesc', async () => { await rightClick(cell(1, 2)); }, ['sortDesc'], () => T().rows.every((row, i, a) => i === 0 || row[2] <= a[i - 1][2]) ? '' : 'not descending');
    await step('transpose', async () => { await rightClick(cell(1, 1)); return [T().rows.length, T().columns.length]; }, ['transpose'], ([rows, cols]) => T().columns.length === rows + 1 && T().rows.length === cols - 1 ? '' : 'size ' + T().rows.length + 'x' + T().columns.length);
    await step('dataStats', async () => { await rightClick(cell(1, 1)); }, ['dataStats'], () => popOpen('datastats'));
    await step('exportData', async () => { await rightClick(cell(1, 1)); window.__downloads.length = 0; }, ['submenu:exportData', 'exportData:csv'], async () => (await until(() => window.__downloads.length, 4000).catch(() => 0)) ? '' : 'nothing saved');
    await step('exportChart', async () => { await rightClick(cell(1, 1)); }, ['exportChart'], () => popOpen('export'));
    await step('print', async () => { await rightClick(cell(1, 1)); }, ['print'], () => popOpen('print'));
    return out;`);
  const bad = Object.entries(r).filter(([, v]) => v !== 'ok');
  assert(Object.keys(r).length === 21, `${Object.keys(r).length} items tried`);
  assert(!bad.length, bad.map(([k, v]) => `${k}: ${v}`).join(' | '));
});

// ───────────────────────── per-command cases

// ───────────────────────── the data window (src/sheet.js), detached from the grid panel
// window.open is recorded by the harness, so the window's page runs in a frame here; it talks to the main window
// over the same BroadcastChannel as a real browser window.

const SHEET = `const openSheet = async () => {
    // The harness keeps popups as frames (popups.inline): the editor then opens as a frame of the page (.web-sheet);
    // otherwise its window.open address is recorded and opened in a frame here.
    await A.run('detachData');
    let f = document.querySelector('.web-sheet iframe');
    if (!f) {
      const url = window.__opened.filter((u) => u.includes('viewer=sheet')).at(-1);
      document.querySelector('#sheet-frame')?.remove();
      f = document.createElement('iframe');
      f.id = 'sheet-frame';
      f.style.cssText = 'position:fixed;left:0;top:0;width:1400px;height:860px;z-index:9999;border:0;background:#fff';
      f.src = url;
      document.body.append(f);
    }
    const frame = f;
    return until(() => frame.contentWindow.__mychartmasterSheet?.S.docId && frame.contentWindow, 10000);
  };
  const sheetFrame = () => document.querySelector('.web-sheet iframe, #sheet-frame');
  const closeSheet = async () => { const f = sheetFrame(); if (f) { f.contentWindow.__mychartmasterSheet?.run('dock'); await sleep(150); (f.closest('.web-sheet') ?? f).remove(); } await sleep(150); };
  const edit = async (W, r, c, text) => { const X = W.__mychartmasterSheet; X.select(r, c); X.beginEdit('enter', ''); X.editText(text); X.commitEdit(); await sleep(120); };`;
const sheetRun = (body) => run(`${SHEET}\n${body}`);

test('sheet.detach', 'The data editor detaches into its own window and docks back', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await sheetRun(`const icons = { toolbar: !!q('#toolbar [data-command="detachData"]'), pane: !!q('.pane-grid .pane-detach[data-command="detachData"]') };
    const W = await openSheet();
    const X = W.__mychartmasterSheet;
    const placeholder = q('.ch-view').classList.contains('grid-detached') && !q('.ch-detached').hidden && q('.ch-grid-body').hidden;
    const paneAttach = !!q('.pane-grid .pane-detach[data-command="attachData"]');
    const names = X.S.cells[0].join(',') === doc().table.columns.map((c) => c.name).join(',');
    const rows = X.S.cells.length - 1 === doc().table.rows.length;
    const ui = { menus: W.document.querySelectorAll('[data-menu]').length, tools: W.document.querySelectorAll('.sx-toolbar [data-cmd]').length, make: !!W.document.querySelector('.sx-toolbar .sx-make-chart'), formula: !!W.document.querySelector('.sx-formula'), namebox: W.document.querySelector('.sx-namebox').value, tab: W.document.querySelectorAll('.sx-tab').length };
    // The toolbar shows every button (never clipped).
    const bar = W.document.querySelector('.sx-toolbar'); const last = [...bar.children].at(-1).getBoundingClientRect();
    const whole = last.right <= bar.getBoundingClientRect().right + 1;
    await closeSheet();
    const back = !q('.ch-view').classList.contains('grid-detached') && !q('.ch-grid-body').hidden && !A.sheetLink.open;
    return { icons, placeholder, paneAttach, names, rows, ui, whole, back };`);
  assert(r.icons.toolbar && r.icons.pane, `detach icons ${JSON.stringify(r.icons)}`);
  assert(r.placeholder && r.paneAttach, 'grid panel does not show the detached state');
  assert(r.names && r.rows, 'the window does not show the chart data');
  assert(r.ui.menus === 6 && r.ui.tools > 30 && r.ui.make && r.ui.formula && r.ui.namebox === 'A2' && r.ui.tab === 1, JSON.stringify(r.ui));
  assert(r.whole, 'toolbar clipped');
  assert(r.back, 'docking did not bring the grid back');
});

test('sheet.formulas', 'Formulas in the data window: calculated, moved by fill, recalculated, saved, undone', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await sheetRun(`const W = await openSheet(); const X = W.__mychartmasterSheet;
    await edit(W, 0, 4, '합계');
    await edit(W, 1, 4, '=SUM(B2:D2)');
    const first = doc().table.rows[0][4];
    X.selectBox({ r0: 1, r1: 12, c0: 4, c1: 4 }); await X.run('fillDown'); await sleep(150);
    const filled = doc().table.rows.map((r) => r[4]);
    const sums = doc().table.rows.map((r) => r[1] + r[2] + r[3]);
    const shifted = doc().sheet.formulas['12,4'];
    await edit(W, 13, 1, '=AVERAGE(B2:B13)');
    await edit(W, 13, 2, '=IF(C2>100,"high","low")');
    await edit(W, 13, 3, '=1/0');
    const avg = doc().table.rows[12][1]; const wantAvg = doc().table.rows.slice(0, 12).reduce((a, r) => a + r[1], 0) / 12; const iff = doc().table.rows[12][2]; const err = doc().table.rows[12][3];
    // An edit in the main grid recalculates the formulas that read it.
    A.view().grid.api.onEdit(0, 1, '1000'); await sleep(150);
    const recalculated = doc().table.rows[0][4] === 1000 + doc().table.rows[0][2] + doc().table.rows[0][3];
    const inWindow = X.S.cells[1][4] === doc().table.rows[0][4];
    // A formula typed in the main grid works too and shows as a formula when edited again.
    A.view().grid.api.onEdit(1, 5, '=B3*2'); await sleep(150);
    const gridFormula = doc().table.rows[1][5] === doc().table.rows[1][1] * 2 && A.view().grid.api.formulaAt(1, 5) === '=B3*2';
    const saved = JSON.parse(doc().serialize()).sheet?.formulas?.['1,4'];
    const back = A.actions && (await X.run('undo'), await sleep(200), true) && doc().sheet?.formulas?.['2,5'] == null;
    return { first, filled, sums, shifted, avg, wantAvg, iff, err, recalculated, inWindow, gridFormula, saved, back, header: doc().table.columns[4].name };`);
  assert(r.first === r.sums[0], `SUM gave ${r.first}`);
  assert(JSON.stringify(r.filled) === JSON.stringify(r.sums), `fill down ${JSON.stringify(r.filled)}`);
  assert(r.shifted === '=SUM(B13:D13)', `moved formula ${r.shifted}`);
  assert(Math.abs(r.avg - r.wantAvg) < 1e-9 && r.iff === 'high' && r.err === '#DIV/0!', `${r.avg} ${r.iff} ${r.err}`);
  assert(r.recalculated && r.inWindow, 'formulas not recalculated after a grid edit');
  assert(r.gridFormula, 'formula typed in the main grid');
  assert(r.saved === '=SUM(B2:D2)', 'formulas not saved in .mychart');
  assert(r.back, 'undo from the data window');
  assert(r.header === '합계', 'header typed in row 1 renames the column');
  await sheetRun('await closeSheet();');
});

test('sheet.editing', 'Data window editing: keys, rows and columns, copy and paste, sort, formats, find, filter', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await sheetRun(`const W = await openSheet(); const X = W.__mychartmasterSheet; const ed = X.el().editor;
    const k = (key, extra = {}) => ed.dispatchEvent(new W.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }));
    X.select(1, 1); k('ArrowDown'); k('ArrowRight'); const moved = X.S.active.r === 2 && X.S.active.c === 2;
    k('ArrowDown', { ctrlKey: true }); const jumped = X.S.active.r === 12;
    k('Home', { ctrlKey: true }); const home = X.S.active.r === 0 && X.S.active.c === 0;
    // Typing starts an entry; Enter moves down.
    X.select(1, 1); k('7'); ed.value = '777'; ed.dispatchEvent(new W.Event('input', { bubbles: true })); k('Enter'); await sleep(120);
    const typed = doc().table.rows[0][1] === 777 && X.S.active.r === 2;
    X.select(2, 1); k('Delete'); await sleep(120); const cleared = doc().table.rows[1][1] == null;
    // Rows and columns.
    const rows0 = doc().table.rows.length, cols0 = doc().table.columns.length;
    X.select(3, 1); await X.run('insertRows'); await sleep(120); const insertedRow = doc().table.rows.length === rows0 + 1 && doc().table.rows[2].every((v) => v == null);
    await X.run('deleteRows'); await sleep(120); const deletedRow = doc().table.rows.length === rows0;
    X.select(1, 2); await X.run('insertColumns'); await sleep(120); const insertedCol = doc().table.columns.length === cols0 + 1;
    await X.run('deleteColumns'); await sleep(120); const deletedCol = doc().table.columns.length === cols0;
    // Copy and paste (formulas move like a copy).
    await edit(W, 1, 4, '=B2+C2');
    X.selectBox({ r0: 1, r1: 1, c0: 4, c1: 4 }); await X.run('copy');
    X.select(3, 4); X.pasteText(X.S.clip.text); await sleep(150);
    const pasted = doc().sheet.formulas['3,4'] === '=B4+C4';
    X.select(4, 6); X.pasteText('x\\ty\\n1\\t2'); await sleep(150);
    const external = X.S.cells[4][6] === 'x' && X.S.cells[5][7] === 2;
    // Sort by a column (the header row stays).
    X.select(1, 3); await X.run('sortDesc'); await sleep(150);
    const col = doc().table.rows.map((r) => r[3]).filter((v) => typeof v === 'number');
    const sorted = col.every((v, i) => i === 0 || col[i - 1] >= v) && doc().table.columns[0].name === X.S.cells[0][0];
    // Formats.
    X.selectBox({ r0: 1, r1: 3, c0: 1, c1: 2 }); await X.run('bold'); await X.run('formatCurrency'); await sleep(150);
    const fmt = doc().sheet.formats['2,2']; const shown = X.display(2, 2);
    // Find and replace.
    const label = doc().table.rows[5][0]; X.S.find.query = label; X.S.find.with = 'Renamed'; await X.run('replace'); W.document.querySelector('[data-find-act="replaceAll"]').click(); await sleep(150);
    const replaced = doc().table.rows.some((r) => r[0] === 'Renamed') && !doc().table.rows.some((r) => r[0] === label);
    // Filter: only some rows show.
    W.document.querySelector('[data-cmd="zoomIn"]')?.click(); await sleep(150);
    // AutoSum under a column.
    X.selectBox({ r0: 1, r1: 12, c0: 2, c1: 2 }); await X.run('autoSum'); await sleep(150);
    const autosum = doc().sheet.formulas['13,2'] === '=SUM(C2:C13)';
    return { moved, jumped, home, typed, cleared, insertedRow, deletedRow, insertedCol, deletedCol, pasted, external, sorted, fmt, shown, replaced, autosum, zoom: X.S.zoom };`);
  for (const key of ['moved', 'jumped', 'home', 'typed', 'cleared', 'insertedRow', 'deletedRow', 'insertedCol', 'deletedCol', 'pasted', 'external', 'sorted', 'replaced', 'autosum']) assert(r[key], `${key}: ${JSON.stringify(r)}`);
  assert(r.fmt?.b && r.fmt?.fmt === 'currency' && /[₩$]/.test(r.shown), `formats ${JSON.stringify(r.fmt)} ${r.shown}`);
  assert(r.zoom > 1, 'zoom');
  await sheetRun('await closeSheet();');
});

test('sheet.filter', 'Data window filter hides rows by value; the grid shows what is left', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await sheetRun(`const W = await openSheet(); const X = W.__mychartmasterSheet;
    await X.run('filter'); await sleep(100);
    const button = W.document.querySelector('[data-filter-col="0"]'); button.click(); await sleep(150);
    const fp = W.document.querySelector('.sx-filter-pop'); const values = fp.querySelectorAll('[data-fp-value]').length;
    const keep = doc().table.rows.slice(0, 3).map((r) => String(r[0])); for (const box of fp.querySelectorAll('[data-fp-value]')) box.checked = keep.includes(box.dataset.fpValue);
    fp.querySelector('[data-fp="ok"]').click(); await sleep(150);
    const shown = X.S.vis.filter((r) => r > 0 && r < 13).length;
    const status = W.document.querySelector('.sx-filtered')?.textContent ?? '';
    await X.run('clearFilter'); await sleep(100);
    return { values, shown, status, after: X.S.vis };`);
  assert(r.values === 12, `${r.values} values in the filter`);
  assert(r.shown === 3 && /3/.test(r.status), `${r.shown} rows shown, ${r.status}`);
  assert(r.after === null, 'filter not cleared');
  await sheetRun('await closeSheet();');
});

test('sheet.files', 'Data window opens Excel / CSV files (sheet choice) and writes Excel with formulas', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const csv = b64(new TextEncoder().encode('Name,Score\nKim,90\nLee,85\n'));
  const book = b64(await toXlsx(createTable(['Item', 'Qty', 'Price', 'Total'], [['a', 2, 10, 20], ['b', 3, 5, 15]]), { sheet: { formulas: { '1,3': '=B2*C2', '2,3': '=B3*C3' }, formats: {}, widths: {} } }));
  const r = await sheetRun(`const W = await openSheet(); const X = W.__mychartmasterSheet;
    const bytes = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
    const before = A.state.docs.length;
    W.__mychartmasterWebFiles = [{ name: 'scores.csv', content: bytes('${csv}') }];
    await X.run('openFile'); await until(() => A.state.docs.length === before + 1);
    const opened = doc().table.columns.map((c) => c.name).join(',') + '|' + doc().table.rows.length;
    await until(() => X.S.docId === doc().id);
    W.__mychartmasterWebFiles = [{ name: 'book.xlsx', content: bytes('${book}') }];
    await X.run('importReplace'); await sleep(400);
    const formulas = JSON.stringify(doc().sheet?.formulas ?? {});
    const total = doc().table.rows[1][3];
    const xlsx = await X.contentFor('xlsx');
    return { opened, formulas, total, size: xlsx.length, zip: xlsx[0] === 0x50 && xlsx[1] === 0x4b, csv: (await X.contentFor('csv')).split('\\n')[0] };`);
  assert(r.opened === 'Name,Score|2', `opened ${r.opened}`);
  assert(r.formulas === '{"1,3":"=B2*C2","2,3":"=B3*C3"}' && r.total === 15, `formulas from xlsx ${r.formulas} ${r.total}`);
  assert(r.zip && r.size > 500, 'xlsx not written');
  assert(/Item,Qty,Price,Total/.test(r.csv), `csv ${r.csv}`);
  await sheetRun('await closeSheet();');
});

test('sheet.makeChart', 'The data window makes a new chart from the selection or the whole sheet, and prints', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await sheetRun(`const W = await openSheet(); const X = W.__mychartmasterSheet;
    const before = A.state.docs.length;
    X.selectBox({ r0: 0, r1: 6, c0: 0, c1: 2 });
    W.document.querySelector('.sx-make-chart').click();
    await until(() => A.state.docs.length === before + 1); await until(() => svg());
    const made = { cols: doc().table.columns.map((c) => c.name).length, rows: doc().table.rows.length, marks: marks() };
    await until(() => X.S.docId === doc().id);
    const follows = X.S.cells.length - 1 === 6 && W.document.querySelectorAll('.sx-tab').length === 2;
    // Tabs in the window switch the chart in the main window.
    W.document.querySelectorAll('.sx-tab')[0].click(); await until(() => doc().id === A.state.docs[0].id);
    X.select(1, 1); await X.run('makeChart'); await until(() => A.state.docs.length === before + 2);
    const whole = doc().table.rows.length === 12 && doc().table.columns.length === 4;
    // Print: the program's print window in sheet mode.
    await X.run('print'); await until(() => pop('print')?.querySelector('.print-sheet .pp-sheet .ps-table'));
    const p = pop('print'); const pages = p.querySelectorAll('.print-sheet .pp-sheet').length;
    const cells = p.querySelectorAll('.print-sheet .ps-table td').length;
    const options = !!p.querySelector('[data-print-toggle="sheetGrid"]') && !!p.querySelector('[data-print-toggle="sheetHeadings"]');
    return { made, follows, whole, pages, cells, options };`);
  assert(r.made.cols === 3 && r.made.rows === 6 && r.made.marks > 0, `made ${JSON.stringify(r.made)}`);
  assert(r.follows, 'the window does not follow the new chart');
  assert(r.whole, 'one cell selected: the whole sheet');
  assert(r.pages >= 1 && r.cells >= 48 && r.options, `print ${JSON.stringify(r)}`);
  await sheetRun('await closeSheet(); await A.popups.closeAll();');
});

test('sheet.continue', 'Opening the data editor carries on the work (chart, selection, a cell being typed); with no chart it makes one', async () => {
  await closeAll();
  // No chart open: the editor makes a new blank chart and opens on it.
  const none = await sheetRun(`A.actions.showStartPage(true); await sleep(100);
    const enabled = A.menus.enabled('detachData');
    const W = await openSheet(); const X = W.__mychartmasterSheet;
    return { enabled, docs: A.state.docs.length, start: A.state.showStart, linked: X.S.docId === doc().id };`);
  assert(none.enabled && none.docs === 1 && !none.start && none.linked, `no chart: ${JSON.stringify(none)}`);
  await sheetRun('await closeSheet();');
  await closeAll();
  await openSample('monthly-sales');
  const r = await sheetRun(`const grid = A.view().grid;
    // A cell being typed in the grid, and a range selected: the editor starts from there with the typed value kept.
    grid.setActive(2, 1); grid.edit('999'); await sleep(50);
    grid.anchor = { row: 2, col: 1 };
    const W = await openSheet(); const X = W.__mychartmasterSheet;
    await until(() => X.S.active.r === 3);
    const kept = doc().table.rows[2][1] === 999 && X.S.cells[3][1] === 999;
    const at = { r: X.S.active.r, c: X.S.active.c };
    // Back: the grid carries on from the editor's selection.
    X.select(7, 2);
    return { kept, at, sel: true };`);
  assert(r.kept, 'the value typed in the grid was lost');
  assert(r.at.r === 3 && r.at.c === 1, `editor started at ${JSON.stringify(r.at)}`);
  // Closing the editor (not docking) brings the data back into the main window's panel, even when it was folded.
  const back = await sheetRun(`A.actions.updateSettings({ showBottomPanel: false });
    const f = sheetFrame(); const X = f.contentWindow.__mychartmasterSheet;
    X.beginEdit('enter', ''); X.editText('4321');
    await X.run('closeWindow'); await sleep(250); (f.closest('.web-sheet') ?? f).remove();
    const grid = A.view().grid;
    return { open: A.sheetLink.open, shown: A.state.settings.showBottomPanel && !q('.ch-grid-body').hidden && !q('.ch-view').classList.contains('fold-bottom'),
      typed: doc().table.rows[6][2] === 4321, active: [grid.active.row, grid.active.col] };`);
  assert(!back.open && back.shown, `data not back in the panel: ${JSON.stringify(back)}`);
  assert(back.typed, 'the cell being typed in the editor was lost on close');
  assert(back.active[0] === 6 && back.active[1] === 2, `grid selection ${back.active}`);
});

test('sheet.tabs', 'Editor tabs sit at the top and close their chart', async () => {
  await closeAll();
  await openSample('monthly-sales');
  await openSample('monthly-sales');
  const r = await sheetRun(`const W = await openSheet(); const D = W.document;
    const tabs = D.querySelector('.sx-tabs'); const toolbar = D.querySelector('.sx-toolbar'); const fbar = D.querySelector('.sx-fbar');
    const top = tabs.getBoundingClientRect().top > toolbar.getBoundingClientRect().top && tabs.getBoundingClientRect().bottom <= fbar.getBoundingClientRect().top + 1 && !tabs.closest('footer');
    const before = A.state.docs.length; const count = D.querySelectorAll('.sx-tab').length;
    D.querySelectorAll('[data-tab-close]')[1].click(); await until(() => A.state.docs.length === before - 1);
    await until(() => D.querySelectorAll('.sx-tab').length === count - 1);
    // Closing the last tab leaves the editor with a new blank sheet.
    D.querySelector('[data-tab-close]').click(); await until(() => A.state.docs.length === 1 && doc().table.rows.length < 20 && W.__mychartmasterSheet.S.docId === doc().id);
    return { top, count, left: D.querySelectorAll('.sx-tab').length, closeButtons: D.querySelectorAll('[data-tab-close]').length };`);
  assert(r.top, 'tabs are not under the toolbar');
  assert(r.count === 2 && r.left === 1 && r.closeButtons === 1, JSON.stringify(r));
  await sheetRun('await closeSheet();');
});

// Every command of the data editor (menus, toolbar, shortcuts, right-click menus) with what it must do. A command
// added to sheet.js without a check here fails the case.
test('sheet.everyCommand', 'Every data editor command works: file, edit, view, insert, format, data, window', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const csv = b64(new TextEncoder().encode('Name,Score\nKim,90\nLee,85\n'));
  const r = await sheetRun(`let W = await openSheet(); let X = W.__mychartmasterSheet; let D = W.document;
    const bytes = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
    const baseId = doc().id;
    const downloads = [];
    const hook = () => { W.showSaveFilePicker = undefined; W.HTMLAnchorElement.prototype.click = function () { if (this.download) downloads.push(this.download); }; };
    hook();
    const base = async () => { if (X.S.docId === baseId && doc().id === baseId) return; D.querySelector('[data-tab="' + baseId + '"]').click(); await until(() => doc().id === baseId && X.S.docId === baseId); };
    const cell = (r, c) => X.S.cells[r]?.[c] ?? null;
    const fmt = (r, c) => X.S.sheet.formats?.[r + ',' + c] ?? {};
    const put = async (r, c, text) => { X.select(r, c); X.beginEdit('enter', ''); X.editText(text); X.commitEdit(); await sleep(60); };
    const go = async (id) => { await X.run(id); await sleep(80); };
    const okDialog = async () => { await until(() => D.querySelector('.sx-modal:not([hidden]) [data-dialog="ok"]')); D.querySelector('[data-dialog="ok"]').click(); await sleep(60); };
    const checks = {
      undo: async () => { await put(1, 1, '555'); await go('undo'); return cell(1, 1) !== 555 && doc().table.rows[0][1] !== 555; },
      redo: async () => { await go('redo'); return cell(1, 1) === 555; },
      copy: async () => { X.selectBox({ r0: 1, r1: 2, c0: 1, c1: 2 }); await go('copy'); return X.S.clip?.text.split('\\r\\n').length === 2 && !!X.S.clip.marquee; },
      paste: async () => { X.select(20, 1); await go('paste'); return cell(20, 1) === cell(1, 1) && cell(21, 2) === cell(2, 2); },
      cut: async () => { X.select(20, 1); await go('cut'); X.select(22, 5); await go('paste'); return cell(20, 1) == null && cell(22, 5) === cell(1, 1); },
      pasteValues: async () => { await put(1, 5, '=B2*2'); X.select(1, 5); await go('copy'); X.select(3, 5); await go('pasteValues'); return cell(3, 5) === cell(1, 1) * 2 && !X.S.sheet.formulas['3,5']; },
      pasteFormats: async () => { X.select(1, 1); await go('bold'); await go('copy'); X.select(2, 1); const v = cell(2, 1); await go('pasteFormats'); return fmt(2, 1).b === true && cell(2, 1) === v; },
      clearContents: async () => { X.select(22, 5); await go('clearContents'); return cell(22, 5) == null; },
      clearFormats: async () => { X.select(2, 1); await go('clearFormats'); return !fmt(2, 1).b; },
      clearAll: async () => { X.select(1, 1); await go('clearAll'); return cell(1, 1) == null && !fmt(1, 1).b; },
      selectAll: async () => { await go('selectAll'); const s = X.sel(); return s.r0 === 0 && s.c0 === 0 && s.r1 >= 12 && s.c1 >= 3; },
      find: async () => { await go('find'); const ok = !D.querySelector('.sx-find').hidden && !D.querySelector('[data-find="with"]'); D.querySelector('[data-find-act="close"]').click(); return ok; },
      replace: async () => { await go('replace'); const ok = !!D.querySelector('[data-find="with"]'); D.querySelector('[data-find-act="close"]').click(); return ok; },
      goTo: async () => { const p = X.run('goTo'); await until(() => D.querySelector('[data-dialog-input]')); D.querySelector('[data-dialog-input]').value = 'C5'; await okDialog(); await p; return X.S.active.r === 4 && X.S.active.c === 2; },
      fillDown: async () => { X.selectBox({ r0: 1, r1: 4, c0: 6, c1: 6 }); await put(1, 6, '7'); X.selectBox({ r0: 1, r1: 4, c0: 6, c1: 6 }); await go('fillDown'); return [1, 2, 3, 4].every((r) => cell(r, 6) === 7); },
      fillRight: async () => { X.selectBox({ r0: 1, r1: 1, c0: 6, c1: 8 }); await go('fillRight'); return cell(1, 7) === 7 && cell(1, 8) === 7; },
      zoomIn: async () => { await go('zoomIn'); return X.S.zoom > 1; },
      zoomOut: async () => { await go('zoomOut'); await go('zoomOut'); return X.S.zoom < 1; },
      zoom100: async () => { await go('zoom100'); return X.S.zoom === 1; },
      freezeTop: async () => { const was = X.S.frozen; await go('freezeTop'); const now = X.S.frozen; await go('freezeTop'); return now === !was && X.S.frozen === was; },
      gridlines: async () => { await go('gridlines'); const off = D.querySelector('.sx').classList.contains('no-grid'); await go('gridlines'); return off && !D.querySelector('.sx').classList.contains('no-grid'); },
      formulaBar: async () => { await go('formulaBar'); const hidden = getComputedStyle(D.querySelector('.sx-fbar')).display === 'none'; await go('formulaBar'); return hidden; },
      showFormulas: async () => { await go('showFormulas'); const shown = X.display(1, 5) === '=B2*2'; await go('showFormulas'); return shown && X.display(1, 5) !== '=B2*2'; },
      insertRows: async () => { const n = doc().table.rows.length; X.select(3, 0); await go('insertRows'); return doc().table.rows.length === n + 1 && cell(3, 0) == null; },
      insertRowsBelow: async () => { const n = doc().table.rows.length; X.select(3, 0); await go('insertRowsBelow'); return doc().table.rows.length === n + 1 && cell(4, 0) == null; },
      deleteRows: async () => { const n = doc().table.rows.length; X.selectBox({ r0: 3, r1: 4, c0: 0, c1: 0 }); await go('deleteRows'); return doc().table.rows.length === n - 2; },
      insertColumns: async () => { const n = doc().table.columns.length; X.select(1, 1); await go('insertColumns'); return doc().table.columns.length === n + 1 && cell(1, 1) == null; },
      insertColumnsRight: async () => { const n = doc().table.columns.length; X.select(1, 1); await go('insertColumnsRight'); return doc().table.columns.length === n + 1 && cell(1, 2) == null; },
      deleteColumns: async () => { const n = doc().table.columns.length; X.selectBox({ r0: 1, r1: 1, c0: 1, c1: 2 }); await go('deleteColumns'); return doc().table.columns.length === n - 2; },
      autoSum: async () => { X.select(13, 2); await go('autoSum'); const text = X.S.editing?.text; X.commitEdit(); await sleep(60); return text === '=SUM(C2:C13)' && typeof cell(13, 2) === 'number'; },
      insertFunction: async () => { const p = X.run('insertFunction'); await until(() => D.querySelector('.sx-fn-list')); D.querySelector('input[name="fn"][value="AVERAGE"]').checked = true; await okDialog(); await p; await sleep(60); const text = X.S.editing?.text; X.cancelEdit(); return text === '=AVERAGE('; },
      bold: async () => { X.select(2, 2); await go('bold'); return fmt(2, 2).b === true; },
      italic: async () => { await go('italic'); return fmt(2, 2).i === true; },
      underline: async () => { await go('underline'); return fmt(2, 2).u === true; },
      strike: async () => { await go('strike'); return fmt(2, 2).s === true && D.querySelector('.sx-cell[data-r="2"][data-c="2"]').classList.contains('s'); },
      alignLeft: async () => { await go('alignLeft'); return fmt(2, 2).align === 'left'; },
      alignCenter: async () => { await go('alignCenter'); return fmt(2, 2).align === 'center'; },
      alignRight: async () => { await go('alignRight'); return fmt(2, 2).align === 'right'; },
      formatCurrency: async () => { await go('formatCurrency'); return fmt(2, 2).fmt === 'currency' && /[₩$]/.test(X.display(2, 2)); },
      formatPercent: async () => { await go('formatPercent'); return /%$/.test(X.display(2, 2)); },
      formatThousands: async () => { await put(2, 2, '12345.678'); X.select(2, 2); await go('formatThousands'); return X.display(2, 2) === '12,345.68'; },
      decimalMore: async () => { await go('decimalMore'); return X.display(2, 2) === '12,345.678'; },
      decimalLess: async () => { await go('decimalLess'); await go('decimalLess'); return X.display(2, 2) === '12,345.7'; },
      formatCustom: async () => { await put(2, 2, '-1234.5'); X.select(2, 2); const p = X.run('formatCustom'); await until(() => D.querySelector('[data-format-code]')); const box = D.querySelector('[data-format-code]'); box.value = '#,##0.00;[Red]-#,##0.00'; box.dispatchEvent(new W.Event('input', { bubbles: true })); const preview = D.querySelector('[data-format-preview]').textContent; await okDialog(); await p; await sleep(60); const c = D.querySelector('.sx-cell[data-r="2"][data-c="2"]'); const ok = X.display(2, 2) === '-1,234.50' && /rgb(217, 45, 32)/.test(c.getAttribute('style') ?? '') === false && /#d92d20/i.test(c.getAttribute('style') ?? '') && /1,234/.test(preview); await put(2, 2, '12345.678'); X.select(2, 2); await go('formatGeneral'); return ok; },
      formatGeneral: async () => { await go('formatGeneral'); return X.display(2, 2) === '12345.678'; },
      autofit: async () => { X.select(1, 0); await go('autofit'); return X.S.sheet.widths?.['0'] > 0; },
      sortAsc: async () => { X.select(1, 3); await go('sortAsc'); const v = doc().table.rows.map((r) => r[3]).filter((x) => typeof x === 'number'); return v.every((x, i) => i === 0 || v[i - 1] <= x); },
      sortDesc: async () => { X.select(1, 3); await go('sortDesc'); const v = doc().table.rows.map((r) => r[3]).filter((x) => typeof x === 'number'); return v.every((x, i) => i === 0 || v[i - 1] >= x); },
      filter: async () => { await go('filter'); const on = X.S.filter.on && D.querySelectorAll('[data-filter-col]').length >= 3; X.S.filter.hidden = { 0: [X.display(2, 0)] }; await go('freezeTop'); await go('freezeTop'); return on; },
      clearFilter: async () => { X.S.filter.hidden = { 0: [X.display(2, 0)] }; await go('filter'); await go('filter'); X.S.filter.hidden = { 0: [X.display(2, 0)] }; await go('zoom100'); X.S.filter.on = true; X.S.filter.hidden = { 0: [X.display(2, 0)] };
        X.select(1, 0); X.openFilterMenu(0, D.querySelector('[data-filter-col="0"]') ?? D.body); D.querySelector('[data-fp="ok"]').click(); await sleep(60);
        const hidden = !!X.S.vis; await go('clearFilter'); const ok = hidden && !X.S.vis; await go('filter'); return ok; },
      chartRange: async () => { X.selectBox({ r0: 1, r1: 4, c0: 0, c1: 2 }); await go('chartRange'); await until(() => doc().chart.dataRange); const ok = doc().chart.dataRange.r0 === 0 && doc().chart.dataRange.r1 === 3; await A.run('clearDataRange'); return ok; },
      saveFile: async () => { const p = X.run('saveFile'); await okDialog(); await p; await sleep(150); return downloads.at(-1)?.endsWith('.xlsx'); },
      saveFileAs: async () => { const p = X.run('saveFileAs'); await until(() => D.querySelector('input[name="fmt"][value="csv"]')); D.querySelector('input[name="fmt"][value="csv"]').checked = true; await okDialog(); await p; await sleep(150); return downloads.at(-1)?.endsWith('.csv'); },
      saveChart: async () => { const n = window.__downloads.length; await go('saveChart'); await until(() => window.__downloads.length > n); return window.__downloads.at(-1).name.endsWith('.mychart'); },
      print: async () => { await go('print'); await until(() => pop('print')?.querySelector('.ps-table td')); const rows = pop('print').querySelectorAll('.print-sheet .ps-table tbody tr').length; await A.popups.close('print'); return rows >= 12; },
      printSelection: async () => { X.selectBox({ r0: 1, r1: 3, c0: 0, c1: 1 }); await go('printSelection'); await until(() => pop('print')?.querySelector('.ps-table td')); const rows = pop('print').querySelectorAll('.print-sheet .ps-table tbody tr').length; await A.popups.close('print'); return rows === 3; },
      makeChart: async () => { const n = A.state.docs.length; X.selectBox({ r0: 0, r1: 3, c0: 0, c1: 1 }); await go('makeChart'); await until(() => A.state.docs.length === n + 1); const ok = doc().table.rows.length === 3; await base(); return ok; },
      newSheet: async () => { const n = A.state.docs.length; await go('newSheet'); await until(() => A.state.docs.length === n + 1 && X.S.docId === doc().id); return true; },
      importReplace: async () => { await go('newSheet'); await until(() => doc().id !== baseId && X.S.docId === doc().id); W.__mychartmasterWebFiles = [{ name: 'scores.csv', content: bytes('${csv}') }]; await go('importReplace'); await until(() => doc().table.columns[0]?.name === 'Name'); const ok = doc().table.rows.length === 2; await base(); return ok; },
      openFile: async () => { const n = A.state.docs.length; W.__mychartmasterWebFiles = [{ name: 'more.csv', content: bytes('${csv}') }]; await go('openFile'); await until(() => A.state.docs.length === n + 1); const ok = doc().table.columns[1].name === 'Score'; await base(); return ok; },
      reconnect: async () => { await go('reconnect'); await until(() => X.S.connected && !X.S.waiting); return true; },
      cancelEdit: async () => { X.select(1, 0); const v = cell(1, 0); X.beginEdit('enter', ''); X.editText('zzz'); await go('cancelEdit'); return !X.S.editing && cell(1, 0) === v; },
      commitEdit: async () => { X.select(1, 0); X.beginEdit('enter', ''); X.editText('kept'); await go('commitEdit'); return !X.S.editing && doc().table.rows[0][0] === 'kept'; },
      dock: async () => { await go('dock'); await sleep(150); return !A.sheetLink.open && !q('.ch-view').classList.contains('grid-detached'); },
      closeWindow: async () => { W = await openSheet(); X = W.__mychartmasterSheet; D = W.document; hook(); await go('closeWindow'); await sleep(150); return !A.sheetLink.open; },
    };
    const ids = Object.keys(X.commands);
    const unchecked = ids.filter((id) => !checks[id]);
    const failed = [];
    const order = [...Object.keys(checks).filter((id) => !['dock', 'closeWindow'].includes(id)), 'dock', 'closeWindow'];
    for (const id of order) {
      try {
        if (id !== 'closeWindow') await base();
        if (!(await checks[id]())) failed.push(id);
      } catch (error) { failed.push(id + ': ' + (error?.message ?? error)); }
    }
    // Menus, toolbar and right-click menus name only existing commands; every menu opens.
    W = await openSheet(); X = W.__mychartmasterSheet; D = W.document;
    const missing = [...Object.values(X.menus).flat(), ...X.context, ...[...D.querySelectorAll('.sx-toolbar [data-cmd]')].map((b) => b.dataset.cmd)].filter((id) => id !== '-' && !X.commands[id]);
    const menusOpen = [];
    for (const m of Object.keys(X.menus)) { D.querySelector('[data-menu="' + m + '"]').click(); await sleep(30); menusOpen.push(D.querySelectorAll('.sx-pop .sx-mi').length === X.menus[m].filter((x) => x !== '-').length); D.body.click(); }
    D.querySelector('.sx-body').dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 })); await sleep(30);
    const context = D.querySelectorAll('.sx-pop .sx-mi').length === X.context.filter((x) => x !== '-').length;
    D.body.click();
    // Shortcuts reach their commands.
    const ed = X.el().editor;
    const kd = (k, code, extra = {}) => ed.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, code, bubbles: true, cancelable: true, ...extra }));
    X.select(2, 1); kd('b', 'KeyB', { ctrlKey: true }); await sleep(60); const kb = fmt(2, 1).b === true;
    kd('z', 'KeyZ', { ctrlKey: true }); await sleep(250); const kz = !X.S.sheet.formats?.['2,1']?.b;
    kd('\`', 'Backquote', { ctrlKey: true }); const kf = X.S.showFormulas; kd('\`', 'Backquote', { ctrlKey: true });
    kd('L', 'KeyL', { ctrlKey: true, shiftKey: true }); const kl = X.S.filter.on; kd('L', 'KeyL', { ctrlKey: true, shiftKey: true });
    kd('a', 'KeyA', { ctrlKey: true }); const ka = X.sel().r1 >= 12;
    await closeSheet();
    return { unchecked, failed, missing, menusOpen, context, keys: { kb, kz, kf, kl, ka } };`);
  assert(!r.unchecked.length, `commands without a check: ${r.unchecked.join(', ')}`);
  assert(!r.failed.length, `failed: ${r.failed.join(' | ')}`);
  assert(!r.missing.length, `menu or toolbar names unknown commands: ${r.missing.join(', ')}`);
  assert(r.menusOpen.every(Boolean) && r.context, `menus ${JSON.stringify(r.menusOpen)} context ${r.context}`);
  assert(Object.values(r.keys).every(Boolean), `shortcuts ${JSON.stringify(r.keys)}`);
});

test('sheet.noLimit', 'No limit on rows: a 150 001-row file is read whole, and the editor reaches and filters every row', async () => {
  await closeAll();
  const r = await sheetRun(`const lines = ['Id,Group,Value']; for (let i = 0; i < 150001; i++) lines.push(i + ',G' + (i % 1500) + ',' + (i % 97));
    await A.actions.openBytes('big.csv', new TextEncoder().encode(lines.join(String.fromCharCode(10))));
    await until(() => doc()?.table.rows.length > 0, 90000);
    const rows = doc().table.rows.length;
    const W = await openSheet(); const X = W.__mychartmasterSheet; const ed = X.el().editor;
    await until(() => X.S.cells.length === rows + 1, 90000);
    ed.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'End', code: 'End', ctrlKey: true, bubbles: true, cancelable: true })); await sleep(100);
    const end = X.S.active.r;
    await X.run('filter'); X.openFilterMenu(1, W.document.querySelector('[data-filter-col="1"]') ?? W.document.body);
    const values = W.document.querySelectorAll('.sx-filter-pop [data-fp-value]').length;
    W.document.querySelector('[data-fp="cancel"]').click();
    X.selectBox({ r0: 1, r1: rows, c0: 2, c1: 2 }); await sleep(100);
    const status = W.document.querySelector('.sx-stats')?.textContent ?? '';
    await closeSheet();
    return { rows, end, values, status };`);
  assert(r.rows === 150001, `${r.rows} rows read`);
  assert(r.end === 150001, `Ctrl+End went to row ${r.end + 1}`);
  assert(r.values === 1500, `${r.values} filter values`);
  assert(/150,?001/.test(r.status), `status ${r.status}`);
});

// ───────────────────────── picking chart elements, chart themes, panel width, dropdowns, print layout, tab rows

test('chart.pick', 'Every element of the chart can be picked and edited on its own, always with a colour', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await run(`A.actions.setOption('dataLabels', true); A.actions.setOption('xTitle', 'Month'); await sleep(200);
    const click = (el) => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); };
    const out = {};
    const parts = { title: '.chart-title', subtitle: '.chart-subtitle', legend: 'g.legend .legend-box', axisTitle: '.axis-title', axis: '.tick, .cat', grid: '.grid', labels: '.data-label', background: '.chart-bg' };
    for (const [kind, sel] of Object.entries(parts)) {
      const el = q('.ch-canvas ' + sel.split(', ').join(', .ch-canvas '));
      if (!el) { out[kind] = 'missing'; continue; }
      click(el); await sleep(80);
      const part = doc().selection.part;
      out[kind] = { kind: part?.kind, section: !!q('.ins-picked'), color: !!q('.ins-picked input[type="color"]'), outlined: qa('.ch-canvas .picked').length > 0 };
    }
    // One bar: its own colour, outline and opacity; the rest of the series keeps its colour.
    click(q('.ch-canvas .mark[data-s="0"][data-r="2"]')); await sleep(80);
    const fill = q('.ins-picked [data-point-opt="fill"]');
    fill.value = '#ff0000'; fill.dispatchEvent(new Event('input', { bubbles: true })); fill.dispatchEvent(new Event('change', { bubbles: true }));
    const width = q('.ins-picked [data-point-opt="strokeWidth"]'); width.value = '3'; width.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(120);
    const bar = q('.ch-canvas .mark[data-s="0"][data-r="2"]').getAttribute('style') ?? '';
    const other = q('.ch-canvas .mark[data-s="0"][data-r="3"]').getAttribute('style') ?? '';
    const saved = JSON.parse(doc().serialize()).chart.options.pointStyles;
    // Title colour from its section.
    click(q('.ch-canvas .chart-title')); await sleep(80);
    const tc = q('.ins-picked input[type="color"][data-opt="titleColor"]'); tc.value = '#00aa00'; tc.dispatchEvent(new Event('change', { bubbles: true })); await sleep(120);
    const titleFill = q('.ch-canvas .chart-title').getAttribute('fill');
    q('.ins-picked [data-ins-action="unpick"]').click(); await sleep(60);
    A.actions.undo(); A.actions.undo(); A.actions.undo();
    return { out, bar, other, saved, titleFill, cleared: !q('.ins-picked') && !doc().selection.part };`);
  for (const [kind, v] of Object.entries(r.out)) assert(v.kind === kind && v.section && v.color && v.outlined, `${kind}: ${JSON.stringify(v)}`);
  assert(/fill:#ff0000/.test(r.bar) && /stroke-width:3px/.test(r.bar) && !/ff0000/.test(r.other), `bar ${r.bar} / ${r.other}`);
  assert(r.saved?.['0:2']?.fill === '#ff0000', 'the bar\'s own style is not saved');
  assert(/#00aa00/i.test(r.titleFill ?? ''), `title ${r.titleFill}`);
  assert(r.cleared, 'unpick');
});

test('theme.tiles', 'Chart themes in the Style tab: light and dark grouped (same number), a click applies at once, a custom theme of your own', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await run(`A.api.setInspectorTab('style'); await sleep(100);
    const groups = qa('.ins-theme-group').map((g) => [g.dataset.themeKind, g.querySelectorAll('.ins-theme-tile').length]);
    const label = q('.ins-row-stack > .ins-label'); const grid = q('.ins-row-stack .ins-theme-grid');
    const above = label.getBoundingClientRect().bottom <= grid.getBoundingClientRect().top + 1;
    const rows = qa('.ins-theme-group[data-theme-kind] .ins-theme-grid').map((g) => { const tops = [...g.children].map((b) => Math.round(b.getBoundingClientRect().top)); const cols = tops.filter((y) => y === tops[0]).length; return { kind: g.parentElement.dataset.themeKind, n: tops.length, cols, lastRow: tops.filter((y) => y === tops[tops.length - 1]).length }; });
    q('[data-ins-theme="ember"]').click(); await sleep(150);
    const ember = doc().chart.options.chartTheme;
    q('[data-ins-theme="custom"]').click(); await sleep(150);
    const custom = doc().chart.options.chartTheme;
    const box = q('[data-custom-theme="bg"]'); box.value = '#123456'; box.dispatchEvent(new Event('change', { bubbles: true })); await sleep(120);
    A.actions.setOption('background', 'chart'); await sleep(120);
    const paper = q('.ch-canvas .chart-bg')?.getAttribute('fill');
    const saved = JSON.parse(doc().serialize()).chart.options.customTheme?.bg;
    return { groups, rows, above, ember, custom, paper, saved };`);
  const counts = Object.fromEntries(r.groups);
  assert(counts.light >= 30 && counts.light === counts.dark && counts.custom === 1, JSON.stringify(r.groups));
  assert(r.above, 'the label is not above the themes');
  for (const g of r.rows.filter((x) => x.kind !== 'custom')) assert(g.lastRow === g.cols, `${g.kind}: ${g.n} themes leave the last row of ${g.cols} with ${g.lastRow}`);
  assert(r.ember === 'ember' && r.custom === 'custom', `${r.ember} ${r.custom}`);
  assert(/#123456/i.test(r.paper ?? '') && r.saved === '#123456', `custom paper ${r.paper} ${r.saved}`);
});

test('inspector.minWidth', 'The right panel never gets narrower than its controls: no control wraps or is cut (labels end in …)', async () => {
  await closeAll();
  const bad = [];
  for (const lang of ['ko', 'en']) {
    for (const sample of ['monthly-sales', 'revenue-profit-combo']) {
      await run(`A.actions.updateSettings({ language: '${lang}' }); return 1;`);
      await openSample(sample);
      const r = await run(`A.actions.updateSettings({ rightWidth: 150 }); await sleep(120); const out = [];
        for (const tab of ['data', 'style', 'axes', 'series', 'more']) { A.api.setInspectorTab(tab); await sleep(80);
          for (const row of qa('.ch-inspector-body .ins-row')) { const c = row.querySelector(':scope > .ins-control'); if (!c || !row.offsetParent) continue;
            if (c.scrollWidth > c.clientWidth + 1) out.push(tab + ':' + row.title);
            for (const seg of c.querySelectorAll('.segmented')) if (new Set([...seg.children].map((k) => Math.round(k.getBoundingClientRect().top))).size > 1) out.push(tab + ' wraps:' + row.title); } }
        return { out, width: q('.ch-inspector').getBoundingClientRect().width, ellipsis: getComputedStyle(q('.ins-label')).textOverflow };`);
      assert(r.width >= 330 && r.ellipsis === 'ellipsis', `${lang} width ${r.width} ${r.ellipsis}`);
      bad.push(...r.out.map((x) => `${lang} ${sample} ${x}`));
    }
  }
  await run(`A.actions.updateSettings({ language: 'en', rightWidth: 330 }); return 1;`);
  assert(!bad.length, bad.slice(0, 6).join(' | '));
});

test('dropdown.fits', 'A dropdown list always shows whole inside the window, also in a small window near its edge', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await run(`A.api.setInspectorTab('style'); await sleep(100);
    const sel = qa('.ch-inspector-body select').at(-1); sel.scrollIntoView({ block: 'end' }); await sleep(80);
    sel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })); await sleep(150);
    const list = q('.dd-list'); if (!list) return { open: false };
    const rect = list.getBoundingClientRect();
    return { open: true, inside: rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth, scrolls: list.scrollHeight <= list.clientHeight + 1 || getComputedStyle(list).overflowY === 'auto' };`);
  await run(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); return 1;`);
  assert(r.open, 'the dropdown did not open');
  assert(r.inside && r.scrolls, JSON.stringify(r));
});

test('print.layout', 'The print window: every setting in one column, the preview right beside it', async () => {
  await closeAll();
  await openSample('monthly-sales');
  const r = await run(`A.run('print'); await until(() => pop('print')?.querySelector('.print-preview .pp-stage, .print-preview'));
    await sleep(300); const p = pop('print');
    const cols = [...p.querySelectorAll('.print-column')].map((c) => Math.round(c.getBoundingClientRect().left));
    const options = p.querySelector('.print-options').getBoundingClientRect(); const preview = p.querySelector('.print-preview').getBoundingClientRect();
    return { sameLeft: new Set(cols).size === 1, beside: Math.abs(preview.left - options.right) <= 2, scroll: p.querySelector('.print-options').scrollHeight <= p.querySelector('.print-options').clientHeight + 1 };`);
  await run('await A.popups.closeAll(); return 1;');
  assert(r.sameLeft && r.beside && r.scroll, JSON.stringify(r));
});

test('chrome.tabsNav', 'Any number of chart tabs: "<" ">" at the right end of the tab row scroll it', async () => {
  await closeAll();
  const r = await run(`for (let i = 0; i < 14; i++) A.actions.openSample(A.domain.SAMPLES[i].id); await sleep(400);
    const nav = qa('#tabs [data-tabs-scroll]'); const strip = q('#tabs .tab-strip');
    const right = nav[1].getBoundingClientRect().right; const row = q('#tabs').getBoundingClientRect().right;
    const before = strip.scrollLeft; nav[0].click(); await sleep(500); const moved = strip.scrollLeft < before;
    const activeVisible = (() => { const a = q('#tabs .tab.active').getBoundingClientRect(); const s = strip.getBoundingClientRect(); return a.left >= s.left - 1 && a.right <= s.right + 1; })();
    return { count: nav.length, atRight: row - right < 12, moved, overflow: strip.scrollWidth > strip.clientWidth };`);
  assert(r.count === 2 && r.atRight && r.overflow && r.moved, JSON.stringify(r));
});

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
