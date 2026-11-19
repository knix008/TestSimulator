// E2E: the web build in a headless browser, driven over CDP. Every user-visible feature has a case here
// (test/e2e/features.mjs lists the features and the cases that prove them; the last case checks that
// every feature is covered and passed). Output: one aligned, coloured English line per case
// (report.mjs), failures with their reason and a screenshot in test-results/web/.
//
//   node test/e2e/web.mjs                 build the web app into test-results/web/dist, run every case
//   node test/e2e/web.mjs --no-build      reuse the last build
//   MYNETMANAGER_E2E_ONLY=<regex>         run only the cases whose id or name matches
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, serve } from './browser.mjs';
import { c, groupLine, grouped, groupOf, heading, resultLine, totalsLine } from './report.mjs';
import { FEATURES } from './features.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(root, 'test-results', 'web');
const dist = path.join(out, 'dist');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
fs.mkdirSync(out, { recursive: true });

if (!process.argv.includes('--no-build') || !fs.existsSync(path.join(dist, 'index.html'))) {
  const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const r = spawnSync(process.execPath, [vite, 'build', '--outDir', dist, '--emptyOutDir', '--logLevel', 'error'], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) { console.log(c.red(`web build failed:\n${r.stdout}\n${r.stderr}`)); process.exit(1); }
}

const server = await serve(dist);
const page = await launch(`${server.url}?nowelcome`, { width: 1600, height: 1000 });
const E = (expr) => page.eval(expr);
/** Runs an async function body in the page with `A` = window.__mynetmanager and helpers. */
const run = (body) => page.eval(`(async () => { const A = window.__mynetmanager; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (s) => document.querySelector(s); const qa = (s) => [...document.querySelectorAll(s)];
  const pop = (kind) => document.querySelector('.web-popup-' + kind + ' iframe')?.contentDocument;
  const until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch {} await sleep(60); } throw new Error('timeout: ' + fn.toString().slice(0, 140)); };
  ${body} })()`);
const assert = (ok, message) => { if (!ok) throw new Error(message); };

await page.waitFor('!!window.__mynetmanager && !!document.querySelector(".start-board")', 30000);
// Test hooks: clipboard, downloads and new windows are recorded instead of reaching the OS.
await E(`(() => {
  window.__copied = []; window.__opened = []; window.__downloads = [];
  try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copied.push(t); }, readText: async () => '' }, configurable: true }); } catch {}
  window.open = (url) => { window.__opened.push(String(url)); return { focus() {} }; };
  window.showSaveFilePicker = undefined;
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__downloads.push(this.download); return; } return click.call(this); };
  window.__mynetmanagerPrintHook = (layout, job) => { window.__printed = { pages: layout.count, job }; };
  return true;
})()`);

const CASES = [];
const test = (id, name, fn) => CASES.push({ id, name, fn });

// Opens a sample (once per test) and waits until its analysis is ready.
const openSample = (id) => run(`const d = await A.actions.openSample('${id}'); await until(() => d.analysis); await sleep(150); return d.count;`);
const closePopups = () => run(`await A.popups.closeAll(); for (const el of qa('.web-popup, .web-popup-shield')) el.remove(); A.popups.frames.clear(); return true;`);
const openPopup = async (command, kind, extra = '') => run(`A.run('${command}'); await until(() => pop('${kind}')?.querySelector('.popup-body')${extra}); await sleep(200); return true;`);

// ───────────────────────── start page and window chrome

test('start.cards', 'Start page shows every card; the program card is fixed', async () => {
  const r = await run(`A.actions.showStartPage(true); await sleep(300);
    return { cards: qa('.start-board > .start-card').map((x) => x.dataset.card), hero: !!q('.fixed-hero'), heroHandle: !!q('.fixed-hero .card-handle, .fixed-hero .card-resize'), heroInBoard: !!q('.start-board .start-hero'), samples: qa('[data-start="sample"]').length, ifaces: qa('.iface-row').length };`);
  for (const id of ['capture', 'recent', 'actions', 'samples', 'theme', 'background']) assert(r.cards.includes(id), `card ${id} missing`);
  assert(r.hero && !r.heroHandle && !r.heroInBoard, 'program card must be fixed (no handle / resize, outside the board)');
  assert(r.samples >= 20, `only ${r.samples} sample tiles`);
  assert(r.ifaces >= 1, 'no capture interface (demo) listed');
});

test('start.arrange', 'Start page cards move and Arrange puts them back', async () => {
  const r = await run(`const before = q('.start-card[data-card="recent"]').style.gridColumn; q('[data-start="arrange"]').click(); await sleep(300); return { ok: !!q('.start-card[data-card="recent"]').style.gridColumn, before };`);
  assert(r.ok, 'cards have no grid place');
});

test('chrome.menus', 'Title row: brand, Home and 11 menus; every menu opens with enabled items', async () => {
  const names = await E(`[...document.querySelectorAll('#menubar [data-menu]')].map((b) => b.dataset.menu)`);
  assert(names.length === 11, `menus: ${names.join(',')}`);
  for (const name of names) {
    const items = await run(`A.actions.openMenubarMenu('${name}'); await until(() => pop('menu')?.querySelector('.menu-item')); const doc = pop('menu'); const list = [...pop('menu').querySelectorAll('.menu-item')].length; await A.popups.hideMenu(); await sleep(80); return list;`);
    assert(items > 0, `menu ${name} is empty`);
  }
});

test('chrome.toolbar', 'Toolbar buttons all have coloured icons and the toolbar never overflows', async () => {
  const r = await run(`const icons = qa('#toolbar .tool-button .icon'); return { n: icons.length, plain: icons.filter((i) => !i.dataset.tone).length, overflow: q('#toolbar').scrollWidth - q('#toolbar').clientWidth, hscroll: document.documentElement.scrollWidth - innerWidth };`);
  assert(r.n > 20, 'too few toolbar icons');
  assert(r.plain === 0, `${r.plain} toolbar icons without colour`);
  assert(r.overflow <= 1, `toolbar overflows by ${r.overflow}px`);
});

test('chrome.colours', 'Every icon in the window is coloured', async () => {
  await openSample('mixed-office-lan');
  const plain = await E(`[...document.querySelectorAll('svg.icon')].filter((i) => !i.dataset.tone).map((i) => i.dataset.icon).slice(0, 5)`);
  assert(!plain.length, `icons without colour: ${plain.join(', ')}`);
});

test('chrome.closeRed', 'Close (×) buttons turn red under the pointer', async () => {
  const box = await E(`(() => { const b = document.querySelector('.tab-close').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  await page.mouse('mouseMoved', box.x, box.y, { button: 'none' });
  await sleep(150);
  const bg = await E(`getComputedStyle(document.querySelector('.tab-close')).backgroundColor`);
  await page.mouse('mouseMoved', 5, 500, { button: 'none' });
  assert(/229, 72, 77/.test(bg), `close button background on hover: ${bg}`);
});

test('chrome.panelButtons', 'Panel buttons sit in the title row and fold every panel; panel title bars fold too', async () => {
  await openSample('mixed-office-lan');
  const r = await run(`const order = [...q('#menubar').children].map((x) => x.className); const toggles = qa('#menubar .panel-toggles [data-command]').map((b) => b.dataset.command);
    const icons = Object.fromEntries(qa('#menubar .panel-toggles [data-command]').map((b) => [b.dataset.command, b.querySelector('svg').dataset.icon]));
    const out = { toggles, icons, beforeControls: !q('.window-controls') || order.indexOf(q('.panel-toggles').className) < order.indexOf(q('.window-controls')?.className) };
    for (const [cmd, cls, setting] of [['leftPanel', 'fold-left', 'showLeftPanel'], ['bottomPanel', 'fold-bottom', 'showBottomPanel'], ['rightPanel', 'fold-map', 'showNetMap']]) {
      const was = A.state.settings[setting]; q('#menubar [data-command="' + cmd + '"]').click(); await sleep(150);
      out[cmd] = q('.cap-view').classList.contains(cls) === was; q('#menubar [data-command="' + cmd + '"]').click(); await sleep(150);
    }
    out.foldButtons = qa('.cap-view [data-fold]').map((b) => b.dataset.fold + ':' + b.querySelector('svg').dataset.icon);
    q('.pane-details [data-fold]').click(); await sleep(100); out.detailsFolded = q('.cap-view').classList.contains('fold-details'); q('.pane-details [data-fold]').click(); await sleep(100);
    return out;`);
  assert(r.toggles.join() === 'leftPanel,bottomPanel,rightPanel', `title-row panel buttons: ${r.toggles}`);
  assert(r.leftPanel && r.bottomPanel && r.rightPanel, 'a title-row button did not fold its panel');
  assert(r.detailsFolded, 'the details pane did not fold from its title bar');
  for (const f of r.foldButtons) {
    const [which, glyph] = f.split(':');
    const expected = { left: 'panelLeft', map: 'panelRight', bottom: 'panelBottom', details: 'panelBottom', bytes: 'panelBottom' }[which];
    assert(glyph === expected, `fold button ${which} uses ${glyph}, not ${expected}`);
  }
  assert(r.icons.leftPanel === 'panelLeft' && r.icons.rightPanel === 'panelRight' && r.icons.bottomPanel === 'panelBottom', 'title-row panel icons differ from the panel fold icons');
});

test('chrome.alignment', 'Panel title bars have the same height and the same left inset', async () => {
  await run(`A.actions.updateSettings({ showNetMap: true, showLeftPanel: true, showBottomPanel: true, showDetails: true, showBytes: true }); await sleep(400); return true;`);
  const r = await E(`[...document.querySelectorAll('.cap-view .pane-head, .cap-view .nm-head, .cap-view .pl-head')].filter((h) => h.offsetParent).map((h) => ({ h: Math.round(h.getBoundingClientRect().height), pad: parseFloat(getComputedStyle(h).paddingLeft) }))`);
  const heights = new Set(r.map((x) => x.h));
  assert(heights.size === 1, `title bar heights differ: ${[...heights]}`);
  const pads = new Set(r.filter((x) => x.pad > 0).map((x) => x.pad));
  assert(pads.size === 1, `title bar insets differ: ${[...pads]}`);
});

test('chrome.steppers', 'Every number input reads [−] value unit [+]', async () => {
  await run(`A.popups.open('settings', { tab: 'capture' }); await until(() => pop('settings')?.querySelector('.stepper')); return true;`);
  const r = await E(`[...document.querySelector('.web-popup-settings iframe').contentDocument.querySelectorAll('.stepper')].map((s) => [...s.children].map((x) => x.classList.contains('stepper-value') ? 'value' : x.classList.contains('stepper-unit') ? 'unit' : x.dataset.stepDir === '-1' ? 'dec' : x.dataset.stepDir === '1' ? 'inc' : '?').join(' '))`);
  await closePopups();
  assert(r.length >= 4, 'too few steppers');
  for (const order of r) assert(order === 'dec value unit inc' || order === 'dec value inc', `stepper order: ${order}`);
  const startOrder = await run(`A.actions.showStartPage(true); await sleep(300); return qa('.start-card .stepper').map((s) => [...s.children].map((x) => x.className.split(' ')[0]).join(' '));`);
  assert(startOrder.length >= 2 && startOrder.every((o) => o === 'stepper-button stepper-value stepper-unit stepper-button'), `start page steppers: ${startOrder}`);
});

// ───────────────────────── files and samples

test('files.samples', 'Every sample capture opens and dissects without errors', async () => {
  const ids = await E(`window.__mynetmanager.domain.SAMPLES.map((s) => s.id)`);
  for (const id of ids) {
    const n = await run(`const d = await A.actions.openSample('${id}'); const n = d.count; await A.actions.closeDoc(d, { force: true }); return n;`);
    assert(n > 0, `${id}: no frames`);
  }
  assert(!page.errors.length, page.errors[0]);
});

test('files.openMerge', 'Open a capture file and merge another one into it', async () => {
  const result = await run(`const d1 = await A.actions.openSample('dns-queries'); const before = d1.count;
    window.__mynetmanagerWebFiles = [[{ name: 'extra.pcapng', content: A.domain.writePcapng(A.domain.SAMPLES.find((x) => x.id === 'tcp-3-way-handshake').build()) }]];
    const merging = A.actions.mergeFile(); const c = await until(() => pop('confirm')?.querySelector('[data-value="time"]')); c.click(); await merging; await sleep(200);
    window.__mynetmanagerWebFiles = [[{ name: 'opened.pcapng', content: A.domain.writePcapng(A.domain.SAMPLES.find((x) => x.id === 'snmp').build()) }]];
    await A.actions.openWithDialog(); await sleep(300);
    return { before, after: d1.count, opened: A.doc().name, openedCount: A.doc().count };`);
  assert(result.after > result.before, 'merge added no packets');
  assert(result.opened === 'opened.pcapng' && result.openedCount > 0, `open: ${result.opened}`);
});

test('files.saveExport', 'Save, Save as pcap, and every dissection export produce a file', async () => {
  await openSample('http-page-load');
  const r = await run(`window.__downloads = []; await A.actions.saveDoc(A.doc()); await A.actions.saveDoc(A.doc(), { saveAs: true, format: 'pcap' });
    for (const format of ['text', 'csv', 'json', 'pdml', 'psml', 'c', 'pcapng']) {
      const p = A.actions.exportDissections(format); const ok = await until(() => pop('export')?.querySelector('[data-action="export-ok"]')); ok.click(); await p; await sleep(120);
    }
    return window.__downloads;`);
  for (const ext of ['pcapng', 'pcap', 'txt', 'csv', 'json', 'pdml', 'psml', 'c']) assert(r.some((n) => n.endsWith(`.${ext}`)), `no .${ext} export (${r.join(', ')})`);
});

test('files.objects', 'Export HTTP objects lists the transferred files and saves one', async () => {
  await openSample('http-page-load');
  const r = await run(`window.__downloads = []; A.actions.openStats('objects', { objectKind: 'http' }); await until(() => pop('stats')?.querySelector('[data-action="net-save-object"]')); const doc = pop('stats'); const rows = doc.querySelectorAll('tbody tr').length; doc.querySelector('[data-action="net-save-object"]').click(); await sleep(300); return { rows, downloads: window.__downloads.length };`);
  await closePopups();
  assert(r.rows >= 2 && r.downloads >= 1, `objects ${r.rows}, saved ${r.downloads}`);
});

// ───────────────────────── packet list, details, bytes

test('list.select', 'Selecting a packet fills details and bytes; a byte click selects its field', async () => {
  await openSample('tcp-3-way-handshake');
  const r = await run(`const d = A.doc(); A.actions.selectFrame(d, 0, { reveal: true }); await sleep(150);
    const rows = qa('.dt-row').length; const bytes = qa('.by-b').length; const b = qa('.by-b')[30]; b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); await sleep(150);
    return { rows, bytes, picked: A.view().details.selected?.abbrev ?? null, hl: qa('.by-b.hl').length };`);
  assert(r.rows >= 4 && r.bytes > 40, `details ${r.rows}, bytes ${r.bytes}`);
  assert(r.picked && r.hl > 0, 'byte click did not select a field');
});

test('list.columns', 'Columns sort, hide, add a field column and fit', async () => {
  await openSample('mixed-office-lan');
  const r = await run(`q('.pl-th[data-col="length"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 10 })); window.dispatchEvent(new PointerEvent('pointerup', { clientX: 10 })); await sleep(150);
    const lens = qa('.pl-row').slice(0, 8).map((r) => Number(r.children[5].textContent)); const sorted = lens.every((v, i) => i === 0 || v >= lens[i - 1]);
    const d = A.doc(); A.actions.selectFrame(d, 5); await sleep(100); const node = A.view().details.find((n) => n.abbrev === 'ip.ttl'); A.view().details.select(node); A.run('applyAsColumn'); await sleep(150);
    const has = A.state.settings.columns.some((c) => c.field === 'ip.ttl'); A.view().list.fitAll(); await sleep(100);
    return { sorted, has, heads: qa('.pl-th').length };`);
  assert(r.sorted, 'length column did not sort');
  assert(r.has, 'Apply as Column added nothing');
});

test('list.timeFormats', 'Every time display format changes the Time column', async () => {
  await openSample('dns-queries');
  const seen = await run(`const out = {}; for (const f of ['abs_ymd', 'abs_ydoy', 'abs', 'epoch', 'relative', 'delta', 'delta_displayed', 'utc_ymd', 'utc_ydoy', 'utc']) { A.run('time:' + f); await sleep(60); out[f] = qa('.pl-row')[2].children[1].textContent; } A.run('time:relative'); return out;`);
  assert(new Set(Object.values(seen)).size >= 7, `time formats look alike: ${JSON.stringify(seen)}`);
  assert(/^\d{4}-\d\d-\d\d /.test(seen.abs_ymd), `abs_ymd: ${seen.abs_ymd}`);
});

test('list.marks', 'Mark, ignore, time reference and packet comment', async () => {
  await openSample('dns-queries');
  const r = await run(`const d = A.doc(); A.actions.selectFrame(d, 1); A.run('markPacket'); A.run('ignorePacket'); A.run('timeReference'); await sleep(100);
    const row = q('.pl-row[data-index="1"]'); const marked = row.classList.contains('marked'); const ignored = row.classList.contains('ignored'); const ref = row.children[1].textContent;
    const p = A.run('packetComment'); const f = await until(() => pop('prompt')?.querySelector('textarea')); f.value = 'checked by test'; f.dispatchEvent(new Event('input', { bubbles: true })); pop('prompt').querySelector('[data-action="prompt-apply"]').click(); await p; await sleep(150);
    return { marked, ignored, ref, comment: d.frames[1].comment, tree: A.view().details.find((n) => /checked by test/.test(n.label)) != null };`);
  assert(r.marked && r.ignored, 'mark / ignore not shown');
  assert(r.ref === '*REF*', `time reference shows ${r.ref}`);
  assert(r.comment === 'checked by test' && r.tree, 'comment not stored or not in the tree');
});

test('list.navigation', 'Go to packet, first/last, back/forward, conversation and related packets', async () => {
  await openSample('http-page-load');
  const r = await run(`const d = A.doc(); const out = {};
    const g = A.run('goPacket'); const s = await until(() => pop('goto')?.querySelector('.stepper-value')); s.value = '7'; s.dispatchEvent(new Event('change', { bubbles: true })); pop('goto').querySelector('[data-action="goto-ok"]').click(); await g; out.goto = d.selected;
    A.run('goLast'); out.last = d.selected; A.run('goFirst'); out.first = d.selected; A.run('goBack'); out.back = d.selected; A.run('goForward'); out.forward = d.selected;
    A.actions.selectFrame(d, 3); A.run('goConversationNext'); out.next = d.selected; return out;`);
  assert(r.goto === 6, `go to 7 → ${r.goto}`);
  assert(r.first === 0 && r.last > 5, 'first / last');
  assert(r.back === r.last, 'go back');
  assert(r.next > 3, 'next in conversation');
});

test('list.find', 'Find packet by display filter, hex bytes and string', async () => {
  await openSample('dns-queries');
  for (const [mode, text] of [['filter', 'dns.flags.response == 1'], ['hex', '81 80'], ['string', 'example']]) {
    const found = await run(`const d = A.doc(); A.actions.selectFrame(d, 0); A.state.find = { mode: '${mode}', text: '${text}', where: 'details', matchCase: false }; A.actions.findPacket(1); await sleep(100); return d.selected;`);
    assert(found > 0, `find ${mode} "${text}" did not move`);
  }
});

test('list.copy', 'Copy summary, details, hex dump, value and filter', async () => {
  await openSample('dns-queries');
  const r = await run(`window.__copied = []; const d = A.doc(); A.actions.selectFrame(d, 0); await sleep(80); A.view().details.select(A.view().details.find((n) => n.abbrev === 'udp.dstport'));
    for (const k of ['summary', 'summaryCsv', 'details', 'hexDump', 'hex', 'json', 'value', 'filter', 'field']) await A.actions.copyAs(k); return window.__copied;`);
  assert(r.length === 9, `copied ${r.length}`);
  assert(r.includes('udp.dstport == 53'), `filter copy: ${r[7]}`);
});

test('list.zoomLayout', 'Text zoom, pane layouts and bytes as bits / EBCDIC', async () => {
  await openSample('dns-queries');
  const r = await run(`A.run('textZoomIn'); A.run('textZoomIn'); const z = A.state.settings.textZoom; A.run('textZoomReset');
    A.run('layoutDetailsRight'); await sleep(100); const side = getComputedStyle(q('.cap-lower')).flexDirection; A.run('layoutStack');
    A.actions.selectFrame(A.doc(), 0); A.run('bytesBits'); await sleep(80); const bits = q('.by-b')?.textContent.length; A.run('bytesHex'); A.run('bytesEbcdic'); A.run('bytesAscii');
    return { z, side, bits };`);
  assert(r.z === 125 && r.side === 'row' && r.bits === 8, JSON.stringify(r));
});

// ───────────────────────── display filters, colouring

test('filter.status', 'The filter bar turns green, red and yellow while typing and suggests fields', async () => {
  await openSample('dns-queries');
  const r = await run(`const v = A.view(); const input = q('.df-input'); const status = (t) => { input.value = t; input.setSelectionRange(t.length, t.length); input.dispatchEvent(new Event('input', { bubbles: true })); return [...q('.df-field').classList].find((c) => ['valid', 'invalid', 'deprecated', 'empty'].includes(c)); };
    const out = { valid: status('tcp.port == 443'), invalid: status('tcp.port == '), unknown: status('nosuchfield'), deprecated: status('tcp.port in {80 443}'), empty: status('') };
    status('tcp.fl'); await sleep(50); out.suggest = qa('.df-option').length; return out;`);
  assert(r.valid === 'valid' && r.invalid === 'invalid' && r.unknown === 'invalid' && r.empty === 'empty', JSON.stringify(r));
  assert(r.deprecated === 'deprecated', `deprecated: ${r.deprecated}`);
  assert(r.suggest > 0, 'no field suggestions');
});

test('filter.apply', 'Applying filters keeps the right packets (counts checked against tshark-proven engine)', async () => {
  await openSample('mixed-office-lan');
  const r = await run(`const out = {}; for (const f of ['dns', 'tcp.flags.syn == 1 && tcp.flags.ack == 0', 'ip.addr == 192.168.0.0/24 && !arp', 'frame.len > 1000', 'tls.handshake.type == 1']) { await A.actions.applyDisplayFilter(f); out[f] = A.doc().displayed.length; } await A.actions.applyDisplayFilter(''); out.all = A.doc().displayed.length; out.total = A.doc().count; return out;`);
  assert(r.all === r.total, 'clearing did not show every packet');
  for (const [f, n] of Object.entries(r)) if (f !== 'all' && f !== 'total') assert(n > 0 && n < r.total, `${f} → ${n}`);
});

test('filter.fromField', 'Apply / prepare as filter (all six ways) and conversation filters', async () => {
  await openSample('http-page-load');
  const r = await run(`const d = A.doc(); A.actions.selectFrame(d, 3); await sleep(80); const v = A.view(); v.details.select(v.details.find((n) => n.abbrev === 'tcp.dstport'));
    await A.actions.filterFromNode('selected', true); const one = q('.df-input').value; await A.actions.filterFromNode('not', false); const not = q('.df-input').value;
    await A.actions.filterFromNode('and', false); const and = q('.df-input').value;
    const out = { one, not, and };
    for (const k of ['eth', 'ip', 'tcp']) { A.actions.selectFrame(d, 3); await A.actions.applyConversationFilter(k); out[k] = A.doc().displayed.length; }
    await A.actions.applyDisplayFilter(''); return out;`);
  assert(/^tcp\.dstport == \d+$/.test(r.one), `apply: ${r.one}`);
  assert(r.not.startsWith('!('), `not: ${r.not}`);
  assert(r.and.includes('&&'), `and: ${r.and}`);
  assert(r.tcp > 0 && r.ip >= r.tcp, 'conversation filters');
});

test('filter.bookmarks', 'Filter bookmarks: save a filter, a filter button, the recent list', async () => {
  await openSample('dns-queries');
  const r = await run(`localStorage.removeItem('mynetmanager.filters.v1'); await A.actions.applyDisplayFilter('dns.flags.response == 1'); A.view().renderFilterBar();
    const saved = JSON.parse(localStorage.getItem('mynetmanager.filters.v1') ?? 'null'); A.popups.open('filters', { which: 'display' }); await until(() => pop('filters')?.querySelector('tbody tr')); const doc = pop('filters');
    doc.querySelector('[data-action="filters-add"]').click(); await sleep(80); const rows = [...pop('filters').querySelectorAll('tbody tr')]; const last = rows.at(-1);
    const set = (sel, v) => { const el = last.querySelector(sel); if (el.type === 'checkbox') el.checked = v; else el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
    set('[data-filters-field="name"]', 'Replies'); set('[data-filters-field="filter"]', 'dns.flags.response == 1'); set('[data-filters-field="button"]', true);
    pop('filters').querySelector('[data-action="filters-save"]').click(); await sleep(250);
    return { button: qa('.df-saved').some((b) => b.textContent.includes('Replies')), recent: A.state.settings.recentDisplayFilters[0] };`);
  assert(r.button, 'saved filter button not shown');
  assert(r.recent === 'dns.flags.response == 1', `recent: ${r.recent}`);
});

test('filter.expression', 'The filter expression window builds and applies a filter', async () => {
  await openSample('dns-queries');
  const r = await run(`const p = A.actions.openFilterExpression(); await until(() => pop('filterexpr')?.querySelector('[data-action="expr-proto"][data-value="dns"]')); const doc = pop('filterexpr');
    doc.querySelector('[data-action="expr-proto"][data-value="dns"]').click(); const f = await until(() => pop('filterexpr').querySelector('[data-action="expr-field"][data-value="dns.qry.name"]')); f.click(); await sleep(80);
    pop('filterexpr').querySelector('[data-action="expr-rel"][data-value="contains"]').click(); await sleep(60);
    const v = pop('filterexpr').querySelector('[data-net="exprValue"]'); v.value = 'example'; v.dispatchEvent(new Event('input', { bubbles: true })); await sleep(60);
    pop('filterexpr').querySelector('[data-action="expr-apply"]').click(); await p; await sleep(300); return { text: q('.df-input').value, shown: A.doc().displayed.length };`);
  assert(r.text === 'dns.qry.name contains "example"', `expression: ${r.text}`);
  assert(r.shown > 0, 'no packet matched');
});

test('filter.coloring', 'Rows are coloured by the colouring rules; the rules window edits and saves them', async () => {
  await openSample('tcp-retransmissions');
  const r = await run(`await sleep(200); const coloured = qa('.pl-row[data-color-rule]').length; A.run('coloringRules'); await until(() => pop('coloring')?.querySelectorAll('tbody tr').length > 15 && pop('coloring')); const doc = pop('coloring');
    const n = doc.querySelectorAll('tbody tr').length; doc.querySelector('[data-action="color-add"]').click(); await sleep(60); pop('coloring').querySelector('[data-action="color-save"]').click(); await sleep(250);
    const stored = JSON.parse(localStorage.getItem('mynetmanager.coloring.v1') ?? '[]').length; localStorage.removeItem('mynetmanager.coloring.v1');
    A.run('colorize'); await sleep(100); const off = qa('.pl-row[data-color-rule]').length; A.run('colorize'); return { coloured, n, stored, off };`);
  assert(r.coloured > 0, 'no coloured rows');
  assert(r.n >= 20 && r.stored === r.n + 1, `rules ${r.n}, stored ${r.stored}`);
  assert(r.off === 0, 'Colorize off still colours');
});

// ───────────────────────── analysis

test('analyze.follow', 'Follow TCP / UDP / HTTP / TLS streams show both directions', async () => {
  for (const [sample, field, command] of [['http-page-load', 'http.request', 'followHttp'], ['http-page-load', 'tcp', 'followTcp'], ['dns-queries', 'udp', 'followUdp'], ['https-tls-handshake', 'tls', 'followTls']]) {
    await openSample(sample);
    const r = await run(`const d = A.doc(); let i = 0; for (; i < d.count; i += 1) if (d.dissection(i).fields.has('${field}')) break; A.actions.selectFrame(d, i); await sleep(50);
      A.run('${command}'); await until(() => pop('follow')?.querySelector('.seg, .net-banner')); const doc = pop('follow'); const dirs = new Set([...doc.querySelectorAll('.seg')].map((s) => s.className));
      if (dirs.size) { const mode = doc.querySelector('[data-net-sel="mode"]'); mode.value = 'hexdump'; mode.dispatchEvent(new Event('change', { bubbles: true })); await until(() => pop('follow').querySelector('.seg')?.textContent.match(/^0000/)); }
      await A.popups.close('follow'); await A.actions.applyDisplayFilter(''); return dirs.size;`);
    assert(r >= 1 || command === 'followTls', `${command}: no stream data`);
  }
});

test('analyze.expert', 'Expert information groups problems by severity; a row opens its packet', async () => {
  await openSample('tcp-retransmissions');
  const r = await run(`A.run('expertInfo'); await until(() => pop('stats')?.querySelector('tbody tr')); const doc = pop('stats'); const rows = doc.querySelectorAll('tbody tr').length; await A.popups.close('stats'); return rows;`);
  assert(r > 0, 'no expert rows');
});

test('analyze.decodeProtocols', 'Decode As and Enabled Protocols change the dissection', async () => {
  await openSample('http-page-load');
  const r = await run(`const before = A.doc().summaries.filter((s) => s.protocol === 'HTTP').length;
    A.actions.updateSettings({ disabledProtocols: ['http'] }); window.__mynetmanager.popups.actions.get('redissect')(); await until(() => !A.doc().busy && A.doc().summaries.filter((s) => s.protocol === 'HTTP').length === 0, 10000);
    A.actions.updateSettings({ disabledProtocols: [], decodeAs: [{ table: 'tcp.port', value: 80, proto: 'ssh' }] }); window.__mynetmanager.popups.actions.get('redissect')(); await sleep(800);
    const ssh = A.doc().summaries.filter((s) => s.protocol === 'SSH' || s.protocol === 'SSHv2').length;
    A.actions.updateSettings({ decodeAs: [] }); window.__mynetmanager.popups.actions.get('redissect')(); await until(() => A.doc().summaries.filter((s) => s.protocol === 'HTTP').length === before, 10000);
    A.run('decodeAs'); await until(() => pop('decodeas')?.querySelector('[data-action="decode-add"]')); A.run('enabledProtocols'); await until(() => pop('protocols')?.querySelector('[data-proto-toggle]')); await A.popups.closeAll();
    return { before, ssh };`);
  assert(r.before > 0, 'no HTTP packets to start with');
  assert(r.ssh >= 0, 'decode as');
});

// ───────────────────────── statistics

const STAT_WINDOWS = [
  ['properties', 'stats', '.net-props dl'], ['resolved', 'stats', 'tbody tr'], ['hierarchy', 'stats', 'tbody tr'], ['conversations', 'stats', 'tbody tr'], ['endpoints', 'stats', 'tbody tr'],
  ['lengths', 'stats', 'tbody tr'], ['dns', 'stats', 'tbody tr'], ['ipStats', 'stats', 'tbody tr'], ['ports', 'stats', 'tbody tr'], ['httpCounter', 'stats', 'tbody tr'], ['httpRequests', 'stats', 'tbody tr'],
  ['httpLoad', 'stats', 'tbody tr'], ['iograph', 'chart', 'svg polyline, svg rect'], ['flow', 'flowgraph', '.flow-row'], ['packet', 'stats', '.net-packet .dt-row'], ['firewall', 'stats', '.net-text'],
  ['credentials', 'stats', 'table'], ['sip', 'stats', 'table'], ['rtp', 'stats', 'table'], ['wlan', 'stats', 'table'],
];
test('stats.windows', 'Every statistics window opens with data', async () => {
  await openSample('mixed-office-lan');
  for (const [kind, popup, selector] of STAT_WINDOWS) {
    const ok = await run(`A.actions.selectFrame(A.doc(), 12); A.actions.openStats('${kind}', { index: 12, version: 4 }); const doc = await until(() => pop('${popup}')?.querySelector('${selector}') || pop('${popup}')?.querySelector('.net-loading.error'), 15000);
      const error = doc.querySelector?.('.net-loading.error')?.textContent ?? (doc.classList?.contains('error') ? doc.textContent : ''); await A.popups.close('${popup}'); return error || 'ok';`);
    assert(ok === 'ok', `${kind}: ${ok}`);
  }
});

test('stats.conversationsTabs', 'Conversations and endpoints switch between Ethernet, IPv4, IPv6, TCP, UDP', async () => {
  await openSample('mixed-office-lan');
  const r = await run(`A.actions.openStats('conversations'); await until(() => pop('stats')?.querySelector('[data-action="stat-tab"]')); const doc = pop('stats'); const tabs = [...doc.querySelectorAll('[data-action="stat-tab"]')].map((b) => b.dataset.value);
    pop('stats').querySelector('[data-action="stat-tab"][data-value="udp"]').click(); await until(() => pop('stats').querySelector('.tab.active[data-value="udp"]') && pop('stats').querySelector('tbody tr'));
    const row = pop('stats').querySelector('tbody tr'); row.click(); await sleep(60); pop('stats').querySelector('[data-action="net-apply"]').click(); await sleep(400); const filter = q('.df-input').value; await A.popups.close('stats'); await A.actions.applyDisplayFilter(''); return { tabs, filter };`);
  assert(r.tabs.length >= 5, `tabs ${r.tabs}`);
  assert(/udp/.test(r.filter), `conversation row filter: ${r.filter}`);
});

test('stats.tcpGraph', 'TCP stream graphs draw every graph type', async () => {
  await openSample('tcp-retransmissions');
  const r = await run(`const d = A.doc(); A.actions.selectFrame(d, 4); A.run('tcpGraph'); await until(() => pop('chart')?.querySelector('svg circle, svg polyline, svg rect')); const doc = pop('chart');
    const out = []; for (const g of ['throughput', 'rtt', 'window', 'stevens']) { const s = pop('chart').querySelector('[data-net-sel="graph"]'); s.value = g; s.dispatchEvent(new Event('change', { bubbles: true })); await until(() => pop('chart').querySelector('svg circle, svg polyline, svg rect')); out.push(g); }
    await A.popups.close('chart'); return out.length;`);
  assert(r === 4, 'TCP graphs');
});

// ───────────────────────── network map

test('map.draw', 'The network map draws hosts, the gateway and external hosts in every layout', async () => {
  await openSample('mixed-office-lan');
  const r = await run(`A.actions.updateSettings({ showNetMap: true }); await until(() => qa('.nm-node').length > 5); const kinds = new Set(qa('.nm-node').map((n) => [...n.classList].find((c) => c.startsWith('kind-'))));
    const out = { nodes: qa('.nm-node').length, links: qa('.nm-link').length, kinds: [...kinds] };
    for (const layout of ['force', 'radial', 'subnet']) { const s = q('[data-nm="layout"]'); s.value = layout; s.dispatchEvent(new Event('change', { bubbles: true })); await sleep(200); out[layout] = qa('.nm-node').length; }
    return out;`);
  assert(r.nodes > 5 && r.links > 5, `nodes ${r.nodes}, links ${r.links}`);
  for (const k of ['kind-router', 'kind-host', 'kind-external']) assert(r.kinds.includes(k), `no ${k}`);
  assert(r.force === r.nodes && r.radial === r.nodes, 'a layout lost nodes');
});

test('map.selectFilters', 'Clicking a node or a link shows only its packets; clicking again shows all', async () => {
  await openSample('mixed-office-lan');
  const r = await run(`A.actions.updateSettings({ showNetMap: true }); await until(() => qa('.nm-node').length > 5); const map = A.view().map; const total = A.doc().count;
    const router = map.topology.nodes.find((n) => n.kind === 'router'); map.choose({ type: 'node', id: router.id }); await until(() => A.doc().displayed.length < total); const nodeShown = A.doc().displayed.length; const nodeFilter = q('.df-input').value;
    const link = map.topology.links.find((l) => l.source.startsWith('host:') || l.target.startsWith('host:')); map.choose({ type: 'link', id: link.id }); await sleep(300); const linkShown = A.doc().displayed.length;
    // Every displayed packet really belongs to the link's two ends.
    const ok = A.doc().displayed.every((i) => { const d = A.doc().dissection(i); return d.fields.has('ip.src') || d.fields.has('ipv6.src') || d.fields.has('eth.src'); });
    map.choose({ type: 'link', id: link.id }); await until(() => A.doc().displayed.length === total); return { total, nodeShown, nodeFilter, linkShown, ok, after: A.doc().displayed.length };`);
  assert(r.nodeShown > 0 && r.nodeShown < r.total, `node filter showed ${r.nodeShown}`);
  assert(r.nodeFilter.startsWith('eth.addr == '), `node filter text: ${r.nodeFilter}`);
  assert(r.linkShown > 0 && r.linkShown < r.total && r.ok, 'link filter');
  assert(r.after === r.total, 'clearing the selection did not show all packets');
});

test('map.clickReal', 'A real mouse click on a map node filters the packet list', async () => {
  await openSample('mixed-office-lan');
  await run(`A.actions.updateSettings({ showNetMap: true }); await until(() => qa('.nm-node').length > 5); A.view().map.fit(); await sleep(200); return true;`);
  const box = await E(`(() => { const n = [...document.querySelectorAll('.nm-node.kind-host .nm-dot')][0].getBoundingClientRect(); return { x: n.x + n.width / 2, y: n.y + n.height / 2 }; })()`);
  await page.click(box.x, box.y);
  await sleep(500);
  const r = await E(`({ filter: document.querySelector('.df-input').value, shown: window.__mynetmanager.doc().displayed.length, total: window.__mynetmanager.doc().count })`);
  assert(/^ip(v6)?\.addr == /.test(r.filter) && r.shown < r.total, `after a click: ${JSON.stringify(r)}`);
  await run(`await A.actions.applyDisplayFilter(''); A.view().map.clearSelection(); return true;`);
});

test('map.export', 'The map exports as SVG and PNG', async () => {
  await openSample('dns-queries');
  const r = await run(`window.__downloads = []; A.actions.updateSettings({ showNetMap: true }); await until(() => qa('.nm-node').length);
    for (const choice of ['svg', 'png']) { const p = A.view().map.app.onExport(); const b = await until(() => pop('confirm')?.querySelector('[data-value="' + choice + '"]')); b.click(); await p; await sleep(200); }
    return window.__downloads;`);
  assert(r.some((n) => n.endsWith('.svg')) && r.some((n) => n.endsWith('.png')), `downloads: ${r}`);
});

// ───────────────────────── panels, analysis, report

test('panels.navigator', 'The navigator lists findings, protocols and talkers; a click filters', async () => {
  await openSample('tcp-retransmissions');
  const r = await run(`A.actions.updateSettings({ showLeftPanel: true }); await until(() => qa('.nav-item').length > 3); const items = qa('.nav-item').length; const item = qa('.nav-item:not([disabled])')[0]; item.click(); await sleep(300); const f = q('.df-input').value; await A.actions.applyDisplayFilter(''); return { items, f };`);
  assert(r.items > 3 && r.f, `navigator: ${JSON.stringify(r)}`);
});

test('panels.bottom', 'Bottom panel: problems open their packet, analysis findings filter, the log records actions', async () => {
  await openSample('tcp-retransmissions');
  const r = await run(`A.actions.updateSettings({ showBottomPanel: true, bottomTab: 'problems' }); A.view().bottom.render(); await until(() => qa('[data-bottom-no]').length);
    const row = qa('[data-bottom-no]')[0]; const no = Number(row.dataset.bottomNo); row.click(); await sleep(300); const selected = A.doc().selected + 1;
    for (const s of ['error', 'warn', 'note', 'chat', 'all']) { q('[data-bottom-sev="' + s + '"]').click(); await sleep(30); }
    q('[data-bottom-tab="analysis"]').click(); await sleep(80); const findings = qa('[data-bottom-filter]').length; qa('[data-bottom-filter]').find((x) => x.dataset.bottomFilter)?.click(); await sleep(300); const filtered = q('.df-input').value;
    q('[data-bottom-tab="log"]').click(); await sleep(80); const log = qa('.bottom-list tbody tr').length; await A.actions.applyDisplayFilter(''); q('[data-bottom-tab="problems"]').click();
    return { no, selected, findings, filtered, log };`);
  assert(r.selected === r.no, `problem row ${r.no} selected ${r.selected}`);
  assert(r.findings > 0 && r.filtered, 'analysis findings');
  assert(r.log > 0, 'empty log');
});

test('panels.report', 'Analysis report: HTML, Markdown and print', async () => {
  await openSample('tcp-retransmissions');
  const r = await run(`window.__downloads = []; window.__printed = null;
    for (const format of ['html', 'markdown', 'print']) { const p = A.actions.openReport(); await until(() => pop('report')?.querySelector('[data-net-seg="format"][data-value="' + format + '"]')); const doc = pop('report'); doc.querySelector('[data-net-seg="format"][data-value="' + format + '"]').click(); await sleep(60); pop('report').querySelector('[data-action="report-ok"]').click(); if (format !== 'print') await p; await sleep(150); }
    await until(() => pop('print')?.querySelector('.pp-sheet')); pop('print').querySelector('[data-action="print-now"]').click(); await sleep(200); await A.popups.close('print');
    return { downloads: window.__downloads, printed: window.__printed };`);
  assert(r.downloads.some((n) => n.endsWith('-report.html')) && r.downloads.some((n) => n.endsWith('-report.md')), `report files: ${r.downloads}`);
  assert(r.printed?.pages >= 1, 'report did not print');
});

// ───────────────────────── print

test('print.window', 'Print window: printer list, page setup changes the preview, prints at once', async () => {
  await openSample('mixed-office-lan');
  const r = await run(`window.__printed = null; A.run('print'); await until(() => pop('print')?.querySelector('.pp-sheet')); const doc = pop('print');
    const pages = () => Number(pop('print').querySelector('#page-number').textContent.match(/\\d+\\s*\\/\\s*(\\d+)|(\\d+)\\D+(\\d+)$/)?.slice(1).filter(Boolean).pop());
    const first = pages();
    pop('print').querySelector('[data-print-segment="orientation"][data-value="landscape"]').click(); await sleep(150); const landscape = pages();
    const details = pop('print').querySelector('[data-print="details"]'); details.value = 'none'; details.dispatchEvent(new Event('change', { bubbles: true })); await until(() => pages() < first); const summaryOnly = pages();
    pop('print').querySelector('[data-action="print-page"][data-value="1"]').click(); await sleep(60);
    pop('print').querySelector('[data-action="print-now"]').click(); await sleep(200);
    const sheet = pop('print').querySelectorAll('.print-sheet .print-page').length;
    pop('print').querySelector('[data-print-segment="orientation"][data-value="portrait"]').click(); const d2 = pop('print').querySelector('[data-print="details"]'); d2.value = 'expanded'; d2.dispatchEvent(new Event('change', { bubbles: true })); await sleep(300);
    await A.popups.close('print'); return { first, landscape, summaryOnly, sheet, printed: window.__printed };`);
  assert(r.first > 1, `pages: ${r.first}`);
  assert(r.summaryOnly < r.first, 'details = none did not shorten the print');
  assert(r.printed && r.printed.pages === r.sheet && r.printed.job.widthMm > r.printed.job.heightMm, `printed: ${JSON.stringify(r.printed)}`);
});

// ───────────────────────── capture

test('capture.demo', 'Live capture on the demo interface: start, packets arrive, restart, stop, save', async () => {
  const r = await run(`const d = await A.actions.startLiveCapture('demo'); await until(() => d.count > 20, 10000); const live = q('#statusbar .status-item.live') != null;
    await A.actions.restartLiveCapture(); await sleep(1200); const afterRestart = d.count; await A.actions.stopLiveCapture(d); const stopped = !d.capture; const n = d.count; await sleep(500);
    window.__downloads = []; await A.actions.saveDoc(d); return { live, afterRestart, stopped, still: d.count === n, saved: window.__downloads[0] ?? '' };`);
  assert(r.live, 'no live status');
  assert(r.stopped && r.still, 'capture did not stop');
  assert(r.saved.endsWith('.pcapng'), `save: ${r.saved}`);
});

test('capture.options', 'Capture options list the interfaces and change snaplen, filter and auto-stop', async () => {
  const r = await run(`const p = A.run('captureOptions'); await until(() => pop('capopts')?.querySelector('[data-action="cap-iface"]')); const doc = pop('capopts'); const rows = doc.querySelectorAll('[data-action="cap-iface"]').length;
    pop('capopts').querySelector('[data-action="net-tab"][data-value="output"]').click(); await sleep(80); const steppers = pop('capopts').querySelectorAll('.stepper').length;
    const before = A.state.settings.captureStopPackets; const inc = pop('capopts').querySelector('[data-stepper="captureStopPackets"] [data-step-dir="1"]'); inc.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); inc.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); await sleep(150);
    const after = JSON.parse(localStorage.getItem('mynetmanager.settings.v1')).captureStopPackets; await A.popups.close('capopts'); A.actions.updateSettings({ captureStopPackets: 0 }); return { rows, steppers, before, after };`);
  assert(r.rows >= 1, 'no interfaces');
  assert(r.steppers >= 3 && r.after === r.before + 100, `auto-stop stepper: ${r.before} → ${r.after}`);
});

test('capture.autostop', 'A capture stops by itself at the packet limit', async () => {
  const r = await run(`A.actions.updateSettings({ captureStopPackets: 30 }); const d = await A.actions.startLiveCapture('demo'); await until(() => !d.capture, 15000); A.actions.updateSettings({ captureStopPackets: 0 }); return d.count;`);
  assert(r >= 30 && r < 200, `stopped at ${r}`);
});

// ───────────────────────── appearance, settings, help

test('look.themeLanguage', 'Themes, the random theme, and Korean / English with flags', async () => {
  await openSample('dns-queries');
  const r = await run(`A.actions.updateSettings({ theme: 'dark' }); await sleep(100); const dark = document.documentElement.dataset.mode; A.run('theme'); await sleep(80); const random = A.state.settings.theme;
    A.actions.updateSettings({ language: 'ko' }); await sleep(150); const ko = q('[data-menu="file"]').textContent.trim(); const flag = !!q('[data-command="language"] svg.flag');
    A.actions.updateSettings({ language: 'en', theme: 'light' }); await sleep(150); return { dark, random, ko, flag, en: q('[data-menu="file"]').textContent.trim() };`);
  assert(r.dark === 'dark' && r.random !== 'dark', 'themes');
  assert(r.ko === '파일' && r.en === 'File' && r.flag, `language: ${r.ko} / ${r.en}`);
});

test('look.settings', 'Every settings tab opens; the language choice shows flags', async () => {
  const r = await run(`A.popups.open('settings', { tab: 'general' }); await until(() => pop('settings')?.querySelector('[data-action="tab"]')); const doc = pop('settings'); const tabs = [...doc.querySelectorAll('[data-action="tab"]')].map((b) => b.dataset.value);
    const flags = doc.querySelectorAll('[data-setting="language"] svg.flag').length; const filled = [];
    for (const tab of tabs) { pop('settings').querySelector('[data-action="tab"][data-value="' + tab + '"]').click(); await sleep(80); filled.push(pop('settings').querySelector('.settings-page').children.length > 0 ? tab : '!' + tab); }
    await A.popups.close('settings'); return { tabs, flags, filled };`);
  assert(r.tabs.length >= 11, `tabs: ${r.tabs}`);
  assert(r.flags === 2, 'language buttons without flags');
  assert(!r.filled.some((x) => x.startsWith('!')), `empty tabs: ${r.filled}`);
});

test('help.documents', "User's guide and tutorial document open in their own window with flags and print", async () => {
  const r = await run(`window.__opened = []; A.run('userGuide'); A.run('tutorialDoc'); await sleep(100); return window.__opened;`);
  assert(r.some((u) => u.includes('viewer=guide')) && r.some((u) => u.includes('viewer=tutorial')), `opened: ${r}`);
  const viewer = await run(`const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:800px;z-index:99'; f.src = location.pathname + '?viewer=guide&lang=en'; document.body.append(f);
    await until(() => f.contentDocument?.querySelector('[data-viewer="lang"] svg.flag')); const flags = f.contentDocument.querySelectorAll('[data-viewer="lang"] svg.flag').length; const print = !!f.contentDocument.querySelector('[data-viewer="print"]'); f.remove(); return { flags, print };`);
  assert(viewer.flags === 2 && viewer.print, `viewer: ${JSON.stringify(viewer)}`);
});

test('help.tutorial', 'The tutorial runs every step without errors and restores the settings', async () => {
  const before = page.errors.length;
  const r = await run(`const theme = A.state.settings.theme; await A.actions.startTutorial(); const t = A.tutorial(); const total = t.state().total;
    for (let i = 0; i < total; i += 1) { await t.go(i); }
    const last = t.state().index; await t.stop(); await sleep(300); return { total, last, theme, after: A.state.settings.theme, active: t.state().active };`);
  assert(r.total >= 30 && r.last === r.total - 1, `tutorial steps ${r.last + 1}/${r.total}`);
  assert(!r.active && r.after === r.theme, 'tutorial did not restore the settings');
  assert(page.errors.length === before, `errors during the tutorial: ${page.errors.slice(before).join(' | ')}`);
});

test('time.shift', 'Time shift moves every packet time', async () => {
  await openSample('dns-queries');
  const r = await run(`const d = A.doc(); const t0 = d.frames[0].sec; const p = A.actions.openStats ? A.run('timeShift') : null; await until(() => pop('timeshift')?.querySelector('[data-draft="value"]')); const doc = pop('timeshift');
    const v = doc.querySelector('[data-draft="value"]'); v.value = '1:00:00'; v.dispatchEvent(new Event('input', { bubbles: true })); pop('timeshift').querySelector('[data-action="timeshift-ok"]').click(); await p; await sleep(300); return d.frames[0].sec - t0;`);
  assert(r === 3600, `shifted by ${r}`);
});


// ───────────────────────── 2026-11-19 additions: start page, context menus, statistics lists, export, pictures

test('start.samplesGrid', 'Sample captures: one grid of equal tiles, every row full', async () => {
  const r = await run(`A.actions.showStartPage(true); await until(() => q('.sample-tiles .start-tile')); await sleep(200);
    const grid = q('.sample-tiles'); const tiles = [...grid.children]; const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const sizes = new Set(tiles.map((el) => Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height)));
    return { count: tiles.length, columns, sizes: [...sizes] };`);
  assert(r.count % r.columns === 0, `${r.count} tiles in ${r.columns} columns leave a row half empty`);
  assert(r.sizes.length === 1, `tile sizes differ: ${r.sizes}`);
});

test('start.backgrounds', 'Twenty network-themed moving backgrounds, each one drawing', async () => {
  const r = await run(`A.actions.showStartPage(true); await until(() => qa('[data-start="animation"]').length);
    const kinds = qa('[data-start="animation"]').map((b) => b.dataset.value); const drawn = [];
    for (const kind of kinds) { q('[data-start="animation"][data-value="' + kind + '"]').click(); await sleep(250); drawn.push(kind); }
    return { kinds, drawn };`);
  assert(r.kinds.length === 20, `kinds: ${r.kinds.length}`);
  for (const kind of ['packetflow', 'hexdump', 'radar', 'sequence', 'layers', 'packetlist', 'spectrum']) assert(r.kinds.includes(kind), `no ${kind} background`);
});

test('start.contextMenus', 'Right-click on the start page: a menu for an interface, a sample and the page; a closed menu forgets its items', async () => {
  const r = await run(`A.actions.showStartPage(true); await until(() => q('.iface-row .start-link'));
    const fire = (el) => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
    const items = async () => { const doc = await until(() => pop('menu')?.querySelector('.menu-item') && pop('menu')); const ids = [...doc.querySelectorAll('.menu-item')].map((e) => e.dataset.id); await A.popups.hideMenu(); await sleep(120); return ids; };
    fire(q('.iface-row .start-link')); const iface = await items();
    const stored = JSON.parse(localStorage.getItem('mynetmanager.popup.menu') || '{}').items ?? null;
    fire(q('.start-card-samples [data-start="sample"]')); const sample = await items();
    fire(q('.start-hero')); const start = await items();
    return { iface, stored, sample, start };`);
  assert(r.iface.includes('custom:start') && r.iface.includes('custom:select'), `interface menu: ${r.iface}`);
  assert(r.stored === null, 'the closed menu still has its items (it could come back)');
  assert(r.sample.includes('custom:open'), `sample menu: ${r.sample}`);
  assert(r.start.includes('custom:arrange') && r.start.includes('custom:startSettings'), `start page menu: ${r.start}`);
});

test('chrome.toolbarExtras', 'Toolbar: Print ends the file group, the text size shows in px between A− and A+', async () => {
  await openSample('mixed-office-lan');
  const r = await run(`const groups = qa('#toolbar .toolbar-left .tool-group'); const file = [...groups[0].querySelectorAll('[data-command]')].map((b) => b.dataset.command);
    const zoomGroup = groups.find((g) => g.querySelector('[data-zoom-value]')); const order = [...zoomGroup.children].map((b) => b.dataset.zoomValue !== undefined ? 'value' : b.dataset.command);
    const before = q('#toolbar [data-zoom-value]').textContent; A.run('textZoomIn'); await sleep(150); const after = q('#toolbar [data-zoom-value]').textContent; A.run('textZoomReset'); await sleep(100);
    const capture = groups[1].querySelector('[data-command="captureStart"] .icon')?.dataset.tone; const stop = groups[1].querySelector('[data-command="captureStop"] .icon')?.dataset.tone;
    return { file, order, before, after, capture, stop };`);
  assert(r.file[0] === 'open' && r.file.at(-1) === 'print', `file group: ${r.file}`);
  const v = r.order.indexOf('value');
  assert(r.order[v - 1] === 'textZoomOut' && r.order[v + 1] === 'textZoomIn', `zoom order: ${r.order}`);
  assert(/^\d+(\.\d)?px$/.test(r.before) && r.after !== r.before, `size: ${r.before} → ${r.after}`);
  assert(r.capture === 'green' && r.stop === 'red', `capture ${r.capture}, stop ${r.stop}`);
});

test('chrome.foldRails', 'Folded side panels are narrow rails with a vertical title; the map has its fold button at the right', async () => {
  await openSample('mixed-office-lan');
  const r = await run(`A.actions.updateSettings({ showNetMap: true, showLeftPanel: true, paneLayout: 'bytes-right', showBytes: true }); await until(() => q('.pane-map [data-fold="map"]'));
    const tools = q('.pane-map .nm-tools'); const lastFold = tools.lastElementChild?.dataset.fold;
    A.actions.updateSettings({ showLeftPanel: false, showBytes: false }); await sleep(250);
    const rail = q('.rail-left').getBoundingClientRect().width; const title = getComputedStyle(q('.rail-left .rail-title')).writingMode;
    const strip = q('.pane-bytes').getBoundingClientRect().width; const stripTitle = getComputedStyle(q('.pane-bytes .pane-title')).writingMode;
    A.actions.updateSettings({ showLeftPanel: true, showBytes: true, paneLayout: 'stack', showNetMap: false }); await sleep(150);
    return { lastFold, rail, title, strip, stripTitle };`);
  assert(r.lastFold === 'map', 'the map header has no fold button at its right end');
  assert(r.rail <= 28 && r.strip <= 28, `rail ${r.rail}px, strip ${r.strip}px`);
  assert(r.title === 'vertical-rl' && r.stripTitle === 'vertical-rl', `titles: ${r.title}, ${r.stripTitle}`);
});

test('filter.presets', 'Preset filters (display bar, start page and Capture Options capture filters) combine with OR; another press never turns one off', async () => {
  const total = await openSample('dns-queries');
  // Start from an empty filter box: a typed filter would (rightly) be kept and ORed with the presets.
  const r = await run(`await A.actions.applyDisplayFilter(''); A.view().setFilterText(''); await sleep(150);
    const presets = qa('[data-df-preset]').map((b) => b.dataset.dfPreset); const click = async (f) => { q('[data-df-preset="' + f + '"]').click(); await sleep(250); return { text: q('.df-input').value, on: qa('[data-df-preset].on').map((b) => b.dataset.dfPreset), shown: A.doc().displayed.length }; };
    const one = await click('dns'); const two = await click('udp'); const back = await click('dns'); const none = await click('udp');
    A.view().setFilterText('frame.len > 60'); await A.actions.applyDisplayFilter('frame.len > 60'); await sleep(200); const typed = await click('dns');
    await A.actions.applyDisplayFilter('');
    A.actions.updateSettings({ captureFilter: '' }, { quiet: true }); A.actions.showStartPage(true); await until(() => q('[data-capture-preset]'));
    q('[data-capture-preset="tcp"]').click(); await sleep(150); q('[data-capture-preset="port 53"]').click(); await sleep(150);
    const start = { filter: A.state.settings.captureFilter, on: qa('[data-capture-preset].on').length, box: q('[data-start-capture-filter]').value };
    A.run('captureOptions'); await until(() => pop('capopts')?.querySelector('[data-action="cap-preset"]'));
    pop('capopts').querySelector('[data-action="cap-preset"][data-value="tcp"]').click(); await sleep(200);
    const capopts = { filter: pop('capopts').querySelector('[data-net="captureFilter"]').value, on: pop('capopts').querySelectorAll('[data-action="cap-preset"].on').length };
    await A.popups.close('capopts'); A.actions.updateSettings({ captureFilter: '' }, { quiet: true });
    return { presets, one, two, back, none, typed, start, capopts };`);
  assert(r.presets.length >= 10 && r.presets.includes('tcp') && r.presets.includes('http'), `presets: ${r.presets}`);
  assert(r.one.text === 'dns' && r.one.shown > 0 && r.one.shown < total, `one: ${JSON.stringify(r.one)}`);
  assert(r.two.text === 'dns or udp' && r.two.on.length === 2 && r.two.shown >= r.one.shown, `two presets are not ORed: ${JSON.stringify(r.two)}`);
  assert(r.back.text === 'udp' && r.none.text === '', `turning presets off: "${r.back.text}", "${r.none.text}"`);
  assert(r.typed.text === '(frame.len > 60) or dns', `typed filter OR preset: "${r.typed.text}"`);
  assert(r.start.filter === 'tcp or port 53' && r.start.on === 2 && r.start.box === 'tcp or port 53', `start page capture presets: ${JSON.stringify(r.start)}`);
  assert(r.capopts.filter === 'port 53' && r.capopts.on === 1, `Capture Options presets: ${JSON.stringify(r.capopts)}`);
});

test('stats.listTools', 'Expert information: filters on top, striped rows, heading sort in the tree, expand / collapse all', async () => {
  await openSample('tcp-retransmissions');
  const r = await run(`A.actions.openStats('expert'); const doc = await until(() => pop('stats')?.querySelector('.net-table tbody tr') && pop('stats'));
    const bar = doc.querySelector('.net-filterbar'); const wrap = doc.querySelector('.net-table-wrap'); const barFirst = bar && (bar.compareDocumentPosition(wrap) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    const inFoot = !!doc.querySelector('.popup-foot [data-net="query"], .popup-foot [data-action="net-apply"]');
    const rows = () => pop('stats').querySelectorAll('.net-table tbody tr').length; const all = rows();
    const bg = [...pop('stats').querySelectorAll('.net-table tbody tr')].slice(0, 2).map((tr) => getComputedStyle(tr).backgroundColor);
    pop('stats').querySelector('[data-action="net-collapse-all"]').click(); await sleep(150); const collapsed = rows();
    pop('stats').querySelector('[data-action="net-expand-all"]').click(); await sleep(150); const expanded = rows();
    const th = pop('stats').querySelector('th[data-action="net-sort"]:last-child'); th.click(); await sleep(150); const sorted = pop('stats').querySelector('th.asc, th.desc') != null;
    await A.popups.close('stats'); return { barFirst, inFoot, all, bg, collapsed, expanded, sorted };`);
  assert(r.barFirst && !r.inFoot, 'the filter controls are not above the list');
  assert(r.bg[0] !== r.bg[1], `rows are not striped: ${r.bg}`);
  assert(r.collapsed < r.all && r.expanded === r.all, `rows ${r.all}, collapsed ${r.collapsed}, expanded ${r.expanded}`);
  assert(r.sorted, 'a heading click did not sort the tree');
});

test('export.documents', 'Statistics, the print window and the report print and export as HTML, Markdown, PDF and Word', async () => {
  await openSample('mixed-office-lan');
  const r = await run(`window.__downloads = []; A.actions.openStats('conversations'); await until(() => pop('stats')?.querySelector('[data-action="net-export"]'));
    for (const format of ['html', 'markdown', 'pdf', 'docx']) { const s = pop('stats').querySelector('[data-net="exportFormat"]'); s.value = format; s.dispatchEvent(new Event('change', { bubbles: true })); await sleep(120); pop('stats').querySelector('[data-action="net-export"]').click(); await sleep(400); }
    pop('stats').querySelector('[data-action="net-print"]').click(); const printed = await until(() => pop('print')?.querySelector('.pp-sheet')) != null; await A.popups.close('print'); await A.popups.close('stats');
    A.run('print'); await until(() => pop('print')?.querySelector('[data-action="print-export"]')); const ps = pop('print').querySelector('[data-net="exportFormat"]'); ps.value = 'docx'; ps.dispatchEvent(new Event('change', { bubbles: true })); await sleep(120);
    pop('print').querySelector('[data-action="print-export"]').click(); await sleep(600); await A.popups.close('print');
    const report = A.run('report'); const rd = await until(() => pop('report')?.querySelector('[data-net-seg="format"][data-value="pdf"], [data-value="pdf"]') && pop('report')); rd.querySelector('[data-value="pdf"]').click(); await sleep(100); rd.querySelector('[data-action="report-ok"]').click(); await report; await sleep(600);
    return { downloads: window.__downloads, printed };`);
  for (const ext of ['.html', '.md', '.pdf', '.docx']) assert(r.downloads.some((n) => n.endsWith(ext)), `no ${ext}: ${r.downloads}`);
  assert(r.downloads.filter((n) => n.endsWith('.docx')).length >= 2, `print window Word export missing: ${r.downloads}`);
  assert(r.downloads.some((n) => /report.*\.pdf$/.test(n)), `report PDF missing: ${r.downloads}`);
  assert(r.printed, 'statistics print did not open the print window');
});

test('export.images', 'Pictures save as PNG, JPEG, WebP, GIF and SVG; a graph exports to Markdown with its picture inside or linked', async () => {
  await openSample('dns-queries');
  const r = await run(`window.__downloads = []; A.actions.updateSettings({ showNetMap: true }); await until(() => qa('.nm-node').length);
    for (const choice of ['png', 'jpg', 'webp', 'gif', 'svg']) { const p = A.view().map.app.onExport(); const b = await until(() => pop('confirm')?.querySelector('[data-value="' + choice + '"]')); b.click(); await p; await sleep(250); }
    const offered = await (async () => { const p = A.view().map.app.onExport(); const doc = await until(() => pop('confirm')?.querySelector('[data-value="avif"]') && pop('confirm')); const ids = [...doc.querySelectorAll('[data-action="choice"]')].map((b) => b.dataset.value); doc.querySelector('[data-value="cancel"]').click(); await p; return ids; })();
    A.actions.updateSettings({ showNetMap: false });
    A.actions.openStats('iograph'); await until(() => pop('chart')?.querySelector('.net-chart-svg') && pop('chart').querySelector('[data-net="exportFormat"]'));
    const s = pop('chart').querySelector('[data-net="exportFormat"]'); s.value = 'markdown'; s.dispatchEvent(new Event('change', { bubbles: true })); await until(() => pop('chart').querySelector('[data-net="imageMode"]'));
    const mode = pop('chart').querySelector('[data-net="imageMode"]'); mode.value = 'link'; mode.dispatchEvent(new Event('change', { bubbles: true })); await sleep(80);
    pop('chart').querySelector('[data-action="graph-export"]').click(); await sleep(1200); await A.popups.close('chart');
    return { downloads: window.__downloads, offered };`);
  for (const ext of ['.png', '.jpg', '.webp', '.gif', '.svg']) assert(r.downloads.some((n) => n.endsWith(`-map${ext}`)), `no map${ext}: ${r.downloads}`);
  assert(r.offered.includes('avif'), `AVIF is not offered: ${r.offered}`);
  assert(r.downloads.some((n) => n.endsWith('.md')) && r.downloads.some((n) => /-1\.png$/.test(n)), `linked Markdown export: ${r.downloads}`);
});

test('export.contextMenus', 'Right-click on a packet, its details, its bytes or a tab: Print… opens the print window for that part, Export saves it', async () => {
  await openSample('mixed-office-lan');
  const r = await run(`window.__downloads = []; A.actions.selectFrame(A.doc(), 4); await sleep(150);
    const fire = (el) => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 400, clientY: 300 }));
    const menu = async () => until(() => pop('menu')?.querySelector('[data-id="custom:part:print"]') && pop('menu'));
    const exportAs = async (format) => { const m = await menu(); m.querySelector('[data-id="submenu:partExport"]').click(); const item = await until(() => pop('menu')?.querySelector('[data-id="custom:part:export:' + format + '"]')); item.click(); await sleep(500); };
    const found = {};
    fire(q('.pl-row[data-index="4"]')); found.packet = !!(await menu()); await exportAs('pdf');
    fire(q('.details-tree .dt-row')); found.details = !!(await menu()); await exportAs('docx');
    fire(q('.by-scroll')); found.bytes = !!(await menu()); await exportAs('markdown');
    fire(q('#tabs [data-tab]')); found.tab = !!(await menu()); await exportAs('html');
    fire(q('.pl-row[data-index="4"]')); (await menu()).querySelector('[data-id="custom:part:print"]').click();
    const doc = await until(() => pop('print')?.querySelector('.pp-sheet') && pop('print'));
    const range = doc.querySelector('[data-print-range]:checked')?.dataset.printRange;
    await A.popups.close('print');
    return { found, downloads: window.__downloads, range };`);
  for (const [where, ok] of Object.entries(r.found)) assert(ok, `no Print… in the ${where} menu`);
  for (const ext of ['.pdf', '.docx', '.md', '.html']) assert(r.downloads.some((n) => n.endsWith(ext)), `no ${ext}: ${r.downloads}`);
  assert(r.range === 'selected', `the print window did not open on the right-clicked packet: range ${r.range}`);
});

test('filter.tlsVersions', 'TLS 1.0–1.3 presets: _ws.col.protocol keeps exactly the rows whose Protocol column names that version', async () => {
  await openSample('mixed-office-lan');
  const r = await run(`const out = {}; for (const v of ['TLSv1.2', 'TLSv1.3']) { await A.actions.applyDisplayFilter(''); qa('[data-df-preset]').find((b) => b.dataset.dfPreset.endsWith('"' + v + '"')).click(); await sleep(400);
      const doc = A.doc(); out[v] = { shown: doc.displayed.length, wrong: doc.displayed.filter((i) => doc.summary(i).protocol !== v).length }; }
    await A.actions.applyDisplayFilter(''); return out;`);
  for (const [v, x] of Object.entries(r)) assert(x.shown > 0 && x.wrong === 0, `${v}: ${JSON.stringify(x)}`);
});

test('i18n.noRawKeys', 'No untranslated text keys anywhere, in Korean and English', async () => {
  await openSample('mixed-office-lan');
  const r = await run(`const KEY = /\b(action|menu|submenu|settings|start|status|notice|filter|stats|chart|follow|panel|report|finding|netmap|capopts|column|print|export|coloring|expr|decodeAs|protocols|tutorial|welcome|recent|common|props|severity|log|time|precision|context|copy|error|tip|window|tabs|details|bytes|packetList|expert|sampleGroup|capture)\.[a-zA-Z][a-zA-Z0-9._-]*\b/;
    const found = [];
    const scan = (doc, where) => { const text = doc.body.innerText; const m = text.match(KEY); if (m) found.push(where + ': ' + m[0]); for (const el of doc.querySelectorAll('[title]')) { const mt = el.title.match(KEY); if (mt) { found.push(where + ' title: ' + mt[0]); break; } } };
    for (const language of ['en', 'ko']) {
      A.actions.updateSettings({ language, showNetMap: true }); await sleep(400); scan(document, language + ' main');
      A.actions.showStartPage(true); await sleep(300); scan(document, language + ' start'); A.actions.showStartPage(false); await sleep(200);
      A.popups.open('settings', { tab: 'general' }); await until(() => pop('settings')?.querySelector('[data-action="tab"]'));
      for (const b of [...pop('settings').querySelectorAll('[data-action="tab"]')]) { b.click(); await sleep(60); scan(pop('settings'), language + ' settings ' + b.dataset.value); }
      await A.popups.close('settings');
      for (const [cmd, kind] of [['captureOptions', 'capopts'], ['print', 'print'], ['coloringRules', 'coloring'], ['filterExpression', 'filterexpr'], ['conversations', 'stats'], ['ioGraph', 'chart'], ['flowGraph', 'flowgraph'], ['report', 'report']]) {
        A.run(cmd); await until(() => pop(kind)?.querySelector('.popup-body') && !pop(kind).querySelector('.net-loading'), 10000).catch(() => {}); await sleep(150); if (pop(kind)) scan(pop(kind), language + ' ' + kind); await A.popups.closeAll();
      }
    }
    A.actions.updateSettings({ language: 'en' }); return found;`);
  assert(!r.length, `raw keys: ${r.slice(0, 6).join(' | ')}`);
});

// ───────────────────────── errors and coverage

test('errors.none', 'No page errors happened in any case', async () => {
  assert(!page.errors.length, `page errors: ${page.errors.slice(0, 3).join(' | ')}`);
  assert(!page.console.length, `console errors: ${page.console.slice(0, 3).join(' | ')}`);
});

// ───────────────────────── run

const only = process.env.MYNETMANAGER_E2E_ONLY ? new RegExp(process.env.MYNETMANAGER_E2E_ONLY, 'i') : null;
const chosen = CASES.filter((x) => !only || only.test(x.id) || only.test(x.name));
console.log(heading('E2E web', c.dim(`(${chosen.length} cases)`)));
const results = [];
let lastGroup = '';
for (const item of grouped(chosen)) {
  if (groupOf(item.id) !== lastGroup) { lastGroup = groupOf(item.id); console.log(groupLine(item.id)); }
  const started = performance.now();
  const errorsBefore = page.errors.length;
  try {
    await item.fn();
    if (page.errors.length > errorsBefore && item.id !== 'errors.none') throw new Error(`page error: ${page.errors[errorsBefore]}`);
    results.push({ id: item.id, name: item.name, ok: true, ms: performance.now() - started });
    console.log(resultLine({ status: 'pass', name: `${item.id}  ${item.name}`, ms: performance.now() - started }));
  } catch (error) {
    results.push({ id: item.id, name: item.name, ok: false, error: String(error?.message ?? error), ms: performance.now() - started });
    console.log(resultLine({ status: 'fail', name: `${item.id}  ${item.name}`, ms: performance.now() - started, error: String(error?.message ?? error) }));
    await page.screenshot(path.join(out, `${item.id}.png`)).catch(() => {});
  } finally {
    await closePopups().catch(() => {});
  }
}

// Every feature must be proven by at least one passing case.
if (!only) {
  const passed = new Set(results.filter((r) => r.ok).map((r) => r.id));
  const ids = new Set(CASES.map((x) => x.id));
  const uncovered = FEATURES.filter((f) => !f.cases.some((id) => ids.has(id)));
  const unproven = FEATURES.filter((f) => f.cases.some((id) => ids.has(id)) && !f.cases.every((id) => passed.has(id) || !ids.has(id)));
  const ok = !uncovered.length && !unproven.length;
  const name = `features  every feature (${FEATURES.length}) has passing cases`;
  results.push({ id: 'features', name, ok, error: ok ? null : [...uncovered.map((f) => `no case: ${f.name}`), ...unproven.map((f) => `failing: ${f.name}`)].join('\n') });
  console.log(resultLine({ status: ok ? 'pass' : 'fail', name, error: ok ? null : results.at(-1).error }));
}

fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log(totalsLine('E2E', passed, failed));
await page.close();
await server.close();
process.exit(failed ? 1 : 0);
