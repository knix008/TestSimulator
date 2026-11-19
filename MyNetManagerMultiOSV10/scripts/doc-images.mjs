// npm run doc:images — the pictures of the user's guide and the tutorial document (doc/images/{ko,en}/NN-name.png).
//
// Builds the web app into a temporary folder (never dist/), serves it, and drives it in a headless Edge / Chrome
// (test/e2e/browser.mjs) once per language: sample captures, popups, menus, panels and the in-app tutorial's
// steps. Every picture comes from the real app in that language; both folders get the same file names.
//
//   node scripts/doc-images.mjs                     both languages, every picture
//   node scripts/doc-images.mjs --lang en           one language
//   node scripts/doc-images.mjs --only 04,map       only pictures whose name contains one of the words
//   node scripts/doc-images.mjs --web <folder>      use an existing web build instead of building one
//
// Pictures larger than about 400 KB are captured again at a smaller scale.
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
const WIDTH = 1600;
const HEIGHT = 1000;
const MAX_BYTES = 400 * 1024;
const P = 'window.__mynetmanager';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ───────────────────────── web build

let webDir = option('--web');
let tempBuild = null;
if (!webDir) {
  tempBuild = fs.mkdtempSync(path.join(os.tmpdir(), 'mynetmanager-docimages-'));
  webDir = path.join(tempBuild, 'web');
  console.log('Building the web app…');
  execFileSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', webDir, '--emptyOutDir', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
}

// ───────────────────────── page helpers

let page;
const js = (code) => page.eval(code);
/** Runs `code` without waiting for the promise it may return (menus and popups settle only when closed). */
const fire = (code) => js(`(() => { Promise.resolve((() => { ${code} })()).catch(() => {}); return 1; })()`);

async function rectOf(selector) {
  return js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return r.width && r.height ? { x: r.left, y: r.top, width: r.width, height: r.height } : null; })()`);
}

function union(...rects) {
  const list = rects.filter(Boolean);
  const x = Math.min(...list.map((r) => r.x));
  const y = Math.min(...list.map((r) => r.y));
  return { x, y, width: Math.max(...list.map((r) => r.x + r.width)) - x, height: Math.max(...list.map((r) => r.y + r.height)) - y };
}

function pad(rect, by = 8) {
  const x = Math.max(0, Math.floor(rect.x - by));
  const y = Math.max(0, Math.floor(rect.y - by));
  return { x, y, width: Math.min(WIDTH - x, Math.ceil(rect.width + by * 2)), height: Math.min(HEIGHT - y, Math.ceil(rect.height + by * 2)) };
}

let outDir = '';
const written = [];
const wanted = (name) => !only || only.some((word) => name.includes(word));

/** A PNG of the window (clip = null) or a part of it; smaller scale while it is over MAX_BYTES. */
async function shot(name, clip = null) {
  const area = clip ?? { x: 0, y: 0, width: WIDTH, height: HEIGHT };
  // Tooltips left by the pointer (menus are hovered to open submenus) are not part of the pictures.
  await js(`(() => { for (const doc of [document, ...[...document.querySelectorAll('iframe')].map((f) => f.contentDocument).filter(Boolean)]) { if (!doc.getElementById('doc-images-no-tips')) { const style = doc.createElement('style'); style.id = 'doc-images-no-tips'; style.textContent = '.app-tooltip { display: none !important; }'; doc.head.append(style); } } return 1; })()`).catch(() => {});
  let data = null;
  for (const scale of [1, 0.85, 0.72, 0.6, 0.5]) {
    for (let attempt = 0; attempt < 4 && !data; attempt++) {
      const r = await page.send('Page.captureScreenshot', { format: 'png', clip: { ...area, scale } }).catch(() => null);
      if (r?.data) data = Buffer.from(r.data, 'base64');
      else await sleep(500);
    }
    if (!data) throw new Error(`${name}: no screenshot`);
    if (data.length <= MAX_BYTES) break;
    if (scale !== 0.5) data = null;
  }
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, data);
  written.push(`${name}.png (${Math.round(data.length / 1024)} KB)`);
}

async function shotOf(name, selectors, by = 8) {
  const rects = [];
  for (const selector of [selectors].flat()) rects.push(await rectOf(selector));
  if (!rects.some(Boolean)) throw new Error(`${name}: nothing found for ${selectors}`);
  await shot(name, pad(union(...rects), by));
}

async function closePopups() {
  await js(`(async () => { try { await ${P}.popups.closeAll(); } catch {} for (const el of document.querySelectorAll('.web-popup, .web-popup-shield')) el.remove(); ${P}.popups.frames?.clear?.(); ${P}.state.openMenu = null; return 1; })()`);
  await sleep(150);
}

async function closeDocs() {
  await closePopups();
  await js(`(async () => { const a = ${P}.actions; for (const doc of [...${P}.state.docs]) { if (doc.capture) await a.stopLiveCapture(doc); await a.closeDoc(doc, { force: true }); } return 1; })()`);
  await sleep(200);
}

async function sample(id, { select = null, filter = '' } = {}) {
  await closeDocs();
  await js(`${P}.actions.openSample(${JSON.stringify(id)}).then(() => 1)`);
  await page.waitFor(`Boolean(${P}.view() && ${P}.doc() && ${P}.doc().passed > 0 && document.querySelector('.pane-list .pl-row, .pane-list [data-row]'))`, 30000).catch(() => {});
  await sleep(600);
  if (filter) await applyFilter(filter);
  if (select != null) await selectNo(select);
  await sleep(300);
}

async function applyFilter(text) {
  await js(`(async () => { ${P}.view().setFilterText(${JSON.stringify(text)}); await ${P}.actions.applyDisplayFilter(${JSON.stringify(text)}); return 1; })()`);
  await sleep(500);
}

async function selectNo(no) {
  await js(`(() => { const d = ${P}.doc(); ${P}.actions.selectFrame(d, ${no - 1}, { reveal: true }); return 1; })()`);
  await sleep(300);
}

/** Selects the first displayed packet that has `field`. */
async function selectWhere(field) {
  await js(`(() => { const d = ${P}.doc(); for (let i = 0; i < d.passed; i++) if (d.dissection(i).fields?.has(${JSON.stringify(field)})) { ${P}.actions.selectFrame(d, i, { reveal: true }); return i; } return -1; })()`);
  await sleep(300);
}

async function revealField(abbrev) {
  await js(`(() => { const v = ${P}.view(); const node = v.details.find((n) => n.abbrev === ${JSON.stringify(abbrev)}); if (node) { v.details.reveal(node); v.bytes.highlight(node); } return 1; })()`);
  await sleep(300);
}

async function settings(patch) {
  await js(`(${P}.actions.updateSettings(${JSON.stringify(patch)}), 1)`);
  await sleep(500);
}

async function popup(kind, open, wait = 1500) {
  await fire(open);
  await page.waitFor(`(() => { const el = document.querySelector('.web-popup-${kind}'); return el && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 40; })()`, 15000);
  await sleep(wait);
}

const inPopup = (kind, code) => js(`(() => { const doc = document.querySelector('.web-popup-${kind} iframe')?.contentDocument; if (!doc) return null; ${code} })()`);

async function popupShot(name, kind, open, { wait = 1500, before = null } = {}) {
  await popup(kind, open, wait);
  if (before) { await before(); await sleep(600); }
  await shotOf(name, `.web-popup-${kind}`, 10);
  await closePopups();
}

async function menuShot(name, menu, { hover = null } = {}) {
  await closePopups();
  await fire(`${P}.actions.openMenubarMenu(${JSON.stringify(menu)})`);
  await page.waitFor(`Boolean(document.querySelector('.web-popup-menu'))`, 10000);
  await sleep(900);
  if (hover) {
    // A submenu opens when its line is hovered: move the mouse there (the page forwards it to the frame).
    const point = await inPopup('menu', `const items = [...doc.querySelectorAll('[data-id], button, .menu-item')]; const el = items.find((x) => (x.dataset.id ?? '') === ${JSON.stringify(hover)}) ?? items.find((x) => x.textContent.includes(${JSON.stringify(hover)})); if (!el) return null; const r = el.getBoundingClientRect(); const f = document.querySelector('.web-popup-menu iframe').getBoundingClientRect(); el.scrollIntoView?.({ block: 'nearest' }); return { x: f.left + r.left + r.width / 2, y: f.top + r.top + r.height / 2 };`);
    if (point) {
      await page.mouse('mouseMoved', point.x, point.y, { button: 'none' });
      await sleep(900);
      // Into the submenu (so no tooltip covers it).
      const sub = await js(`(() => { const list = [...document.querySelectorAll('.web-popup-menu')]; const r = list[list.length - 1].getBoundingClientRect(); return { x: r.left + r.width - 30, y: r.top + 24 }; })()`);
      await page.mouse('mouseMoved', sub.x, sub.y, { button: 'none' });
      await sleep(250);
    }
  }
  const frames = await js(`[...document.querySelectorAll('.web-popup-menu')].map((el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })`);
  await shot(name, pad(union(await rectOf(`#menubar [data-menu="${menu}"]`), ...frames, { x: 0, y: 0, width: 10, height: 10 }), 10));
  await page.mouse('mouseMoved', 5, HEIGHT - 5, { button: 'none' });
  await closePopups();
}

// ───────────────────────── the pictures (the order of the user's guide)

const GUIDE = [
  ['01-start-page', async () => { await closeDocs(); await js(`(${P}.actions.showStartPage(true), 1)`); await sleep(1500); await shot('01-start-page'); }],
  ['02-capture-card', async () => { await shotOf('02-capture-card', '.start-card.capture'); }],
  ['03-samples-card', async () => { await js(`document.querySelector('.start-card.samples')?.scrollIntoView({ block: 'center' }), 1`); await sleep(500); await shotOf('03-samples-card', '.start-card.samples'); await js(`document.querySelector('.start-scroll')?.scrollTo(0, 0), 1`); }],
  ['04-main-window', async () => { await sample('mixed-office-lan', { select: 5 }); await revealField('dns.qry.name'); await shot('04-main-window'); }],
  ['05-title-row-toolbar', async () => { await shotOf('05-title-row-toolbar', ['#menubar', '#toolbar'], 0); }],
  ['06-menu-file', async () => { await menuShot('06-menu-file', 'file'); }],
  ['07-menu-view-panes', async () => { await menuShot('07-menu-view-panes', 'view', { hover: 'submenu:panes' }); }],
  ['08-menu-statistics', async () => { await menuShot('08-menu-statistics', 'statistics'); }],
  ['09-packet-list', async () => {
    await sample('mixed-office-lan');
    await js(`(() => { const d = ${P}.doc(); d.toggleMark([5, 6]); d.toggleIgnore([9]); d.toggleTimeRef(11); d.setComment(2, 'Checked by the doc script'); ${P}.actions.selectFrame(d, 6, { reveal: true }); ${P}.view().list.render(); ${P}.view().refresh(); return 1; })()`);
    await sleep(500);
    await shotOf('09-packet-list', '.pane-list', 0);
  }],
  ['10-details-bytes', async () => {
    // Without the bottom panel the details and bytes panes get the room to show a whole packet.
    await settings({ showBottomPanel: false });
    await sample('http-page-load'); await selectWhere('http.request'); await revealField('http.request.method');
    await shotOf('10-details-bytes', '.cap-lower', 0);
    await settings({ showBottomPanel: true });
  }],
  ['11-filter-suggestions', async () => {
    await sample('mixed-office-lan');
    await js(`(() => { const input = document.querySelector('.cap-filterbar input'); input.focus(); input.value = 'dns.qry'; input.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
    await sleep(800);
    await shot('11-filter-suggestions', { x: 0, y: 0, width: WIDTH, height: 420 });
  }],
  ['12-filter-invalid', async () => {
    await js(`(() => { const input = document.querySelector('.cap-filterbar input'); input.focus(); input.value = 'tcp.port == '; input.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
    await sleep(800);
    await shotOf('12-filter-invalid', '.cap-filterbar', 4);
    await js(`document.activeElement?.blur?.(), 1`);
  }],
  ['13-filter-applied', async () => { await sample('mixed-office-lan', { filter: 'dns' }); await shot('13-filter-applied'); }],
  ['14-filter-expression', async () => {
    await sample('mixed-office-lan', { select: 5 });
    const click = (action, value) => async () => { await inPopup('filterexpr', `const el = doc.querySelector('[data-action="${action}"][data-value="${value}"]'); el?.scrollIntoView({ block: 'center' }); el?.click(); return Boolean(el);`); await sleep(500); };
    await popupShot('14-filter-expression', 'filterexpr', `return ${P}.run('filterExpression')`, { before: async () => { await click('expr-proto', 'dns')(); await click('expr-field', 'dns.qry.name')(); await click('expr-rel', 'contains')(); await inPopup('filterexpr', `const input = doc.querySelector('[data-net="exprValue"]'); input.value = 'wikipedia'; input.dispatchEvent(new Event('input', { bubbles: true })); return 1;`); } });
  }],
  ['15-details-context-menu', async () => {
    await sample('mixed-office-lan', { select: 5 });
    await revealField('ip.dst');
    const r = await rectOf('.pane-details .selected, .pane-details [aria-selected="true"]');
    const x = (r?.x ?? 200) + 80; const y = (r?.y ?? 700) + 8;
    await fire(`const v = ${P}.view(); return ${P}.actions.contextMenu({ clientX: ${x}, clientY: ${y} }, 'details', { node: v.details.selected })`);
    await page.waitFor(`Boolean(document.querySelector('.web-popup-menu'))`, 10000);
    await sleep(900);
    const point = await inPopup('menu', `const el = [...doc.querySelectorAll('[data-id]')].find((x) => x.dataset.id === 'submenu:applyFilter'); if (!el) return null; const r = el.getBoundingClientRect(); const f = document.querySelector('.web-popup-menu iframe').getBoundingClientRect(); return { x: f.left + r.left + r.width / 2, y: f.top + r.top + r.height / 2 };`);
    if (point) {
      await page.mouse('mouseMoved', point.x, point.y, { button: 'none' });
      await sleep(900);
      const sub = await js(`(() => { const list = [...document.querySelectorAll('.web-popup-menu')]; const r = list[list.length - 1].getBoundingClientRect(); return { x: r.left + r.width - 30, y: r.top + 24 }; })()`);
      await page.mouse('mouseMoved', sub.x, sub.y, { button: 'none' });
      await sleep(250);
    }
    const frames = await js(`[...document.querySelectorAll('.web-popup-menu')].map((el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })`);
    await shot('15-details-context-menu', pad(union(...frames, { x: x - 200, y: y - 40, width: 200, height: 40 }), 12));
    await page.mouse('mouseMoved', 5, HEIGHT - 5, { button: 'none' });
    await closePopups();
  }],
  ['16-coloring-rules', async () => { await sample('tcp-retransmissions'); await popupShot('16-coloring-rules', 'coloring', `return ${P}.run('coloringRules')`); }],
  ['17-follow-tcp', async () => { await sample('http-page-load'); await selectWhere('http.request'); await popupShot('17-follow-tcp', 'follow', `return ${P}.run('followTcp')`, { wait: 2000 }); }],
  ['18-conversation-filter', async () => { await sample('http-page-load'); await selectWhere('tcp'); await js(`${P}.run('conversation:tcp').then(() => 1)`); await sleep(800); await shot('18-conversation-filter'); }],
  ['19-capture-properties', async () => { await sample('mixed-office-lan'); await popupShot('19-capture-properties', 'stats', `return ${P}.run('captureProperties')`); }],
  ['20-protocol-hierarchy', async () => { await popupShot('20-protocol-hierarchy', 'stats', `return ${P}.run('protocolHierarchy')`); }],
  ['21-conversations', async () => { await popupShot('21-conversations', 'stats', `return ${P}.run('conversations')`); }],
  ['22-endpoints', async () => { await popupShot('22-endpoints', 'stats', `return ${P}.run('endpoints')`); }],
  ['23-packet-lengths', async () => { await popupShot('23-packet-lengths', 'stats', `return ${P}.run('packetLengths')`); }],
  ['24-io-graph', async () => { await popupShot('24-io-graph', 'chart', `return ${P}.run('ioGraph')`, { wait: 2200 }); }],
  ['25-flow-graph', async () => { await sample('http-page-load'); await popupShot('25-flow-graph', 'flowgraph', `return ${P}.run('flowGraph')`, { wait: 2200 }); }],
  ['26-tcp-stream-graph', async () => { await sample('tcp-retransmissions'); await selectWhere('tcp.analysis.retransmission'); await popupShot('26-tcp-stream-graph', 'chart', `return ${P}.run('tcpGraph')`, { wait: 2200 }); }],
  ['27-http-requests', async () => { await sample('http-page-load'); await popupShot('27-http-requests', 'stats', `return ${P}.run('httpRequests')`); }],
  ['28-dns-stats', async () => { await sample('dns-queries'); await popupShot('28-dns-stats', 'stats', `return ${P}.run('dnsStats')`); }],
  ['29-ip-stats', async () => { await sample('mixed-office-lan'); await popupShot('29-ip-stats', 'stats', `return ${P}.run('ipv4Stats')`); }],
  ['30-expert-info', async () => { await sample('tcp-retransmissions'); await popupShot('30-expert-info', 'stats', `return ${P}.run('expertInfo')`); }],
  ['31-panels', async () => { await sample('tcp-retransmissions', { select: 5 }); await settings({ showLeftPanel: true, showBottomPanel: true, bottomTab: 'analysis' }); await sleep(600); await shot('31-panels'); }],
  ['32-navigator', async () => { await shotOf('32-navigator', '.pane-left', 0); }],
  ['33-bottom-problems', async () => { await settings({ bottomTab: 'problems' }); await js(`${P}.view().refresh(), 1`); await sleep(500); await shotOf('33-bottom-problems', '.pane-bottom', 0); await settings({ bottomTab: 'analysis' }); }],
  ['34-report', async () => { await popupShot('34-report', 'report', `return ${P}.actions.openReport()`); }],
  ['35-network-map', async () => { await sample('mixed-office-lan'); await settings({ showNetMap: true }); await sleep(1500); await shot('35-network-map'); }],
  ['36-network-map-node', async () => {
    await js(`(() => { const map = ${P}.view().map; const node = map.topology?.nodes.find((n) => n.kind === 'router') ?? map.topology?.nodes[0]; if (node) map.choose({ type: 'node', id: node.id }); return 1; })()`);
    await sleep(1200);
    await shot('36-network-map-node');
    await js(`(() => { ${P}.view().map.clearSelection(); return 1; })()`);
    await applyFilter('');
    await settings({ showNetMap: false });
  }],
  ['37-capture-options', async () => { await closeDocs(); await js(`(${P}.actions.showStartPage(true), 1)`); await sleep(500); await popupShot('37-capture-options', 'capopts', `return ${P}.run('captureOptions')`); }],
  ['38-live-capture', async () => {
    await closeDocs();
    await js(`${P}.actions.startLiveCapture('demo').then(() => 1)`);
    await sleep(4000);
    await shot('38-live-capture');
    await js(`(async () => { const d = ${P}.doc(); if (d?.capture) await ${P}.actions.stopLiveCapture(d); return 1; })()`);
    await sleep(500);
  }],
  ['39-decode-as', async () => { await sample('mixed-office-lan', { select: 3 }); await popupShot('39-decode-as', 'decodeas', `return ${P}.run('decodeAs')`); }],
  ['40-enabled-protocols', async () => { await popupShot('40-enabled-protocols', 'protocols', `return ${P}.run('enabledProtocols')`); }],
  ['41-export-dissections', async () => { await popupShot('41-export-dissections', 'export', `return ${P}.run('exportText')`); }],
  ['42-export-objects', async () => { await sample('http-page-load'); await popupShot('42-export-objects', 'stats', `return ${P}.run('exportObjectsHttp')`); }],
  ['43-print', async () => { await sample('mixed-office-lan', { select: 4 }); await popupShot('43-print', 'print', `return ${P}.run('print')`, { wait: 2500 }); }],
  ['44-find-packet', async () => { await popupShot('44-find-packet', 'find', `return ${P}.run('findPacket')`); }],
  ['45-go-to-packet', async () => { await popupShot('45-go-to-packet', 'goto', `return ${P}.run('goPacket')`); }],
  ['46-settings-general', async () => { await popupShot('46-settings-general', 'settings', `return ${P}.popups.open('settings', { tab: 'general' })`); }],
  ['47-settings-layout', async () => { await popupShot('47-settings-layout', 'settings', `return ${P}.popups.open('settings', { tab: 'layout' })`); }],
  ['48-settings-capture', async () => { await popupShot('48-settings-capture', 'settings', `return ${P}.popups.open('settings', { tab: 'capture' })`); }],
  ['49-settings-shortcuts', async () => { await popupShot('49-settings-shortcuts', 'settings', `return ${P}.popups.open('settings', { tab: 'shortcuts' })`); }],
  ['50-dark-theme', async () => { await sample('mixed-office-lan', { select: 4 }); await settings({ theme: 'dark', paneLayout: 'details-right' }); await sleep(1000); await shot('50-dark-theme'); await settings({ theme: 'light', paneLayout: 'stack' }); }],
  ['51-theme-picker', async () => {
    await popup('theme', `return ${P}.run('themeMenu', { anchor: ${P}.actions.toScreen(1200, 70) })`, 1200);
    await shotOf('51-theme-picker', '.web-popup-theme', 10);
    await closePopups();
  }],
];

// ───────────────────────── the tutorial's steps (doc/Tutorial*.md): one picture per step

async function tutorialShots() {
  const total = await js(`${P}.domain.tutorialSteps()`);
  const stepIds = [];
  await closeDocs();
  await js(`(${P}.actions.startTutorial(), 1)`);
  const tour = `${P}.tutorial()`;
  for (let i = 0; i < total; i++) {
    if (i > 0) await js(`(${tour}.next(), 1)`);
    await page.waitFor(`Boolean(${tour}?.state().active && ${tour}.state().index === ${i} && !${tour}.state().busy)`, 60000);
    await sleep(1300);
    const id = await js(`${tour}.state().id`);
    stepIds.push(id);
    const name = `${60 + i}-tutorial-${id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
    if (!only || only.includes('tutorial') || wanted(name)) await shot(name);
    process.stdout.write(`\r  tutorial ${i + 1}/${total} ${id}            `);
  }
  process.stdout.write('\n');
  await js(`${tour}.stop().then(() => 1)`);
  return stepIds;
}

// ───────────────────────── run

const server = await serve(webDir);
const problems = [];
try {
  for (const language of languages) {
    outDir = path.join(root, 'doc', 'images', language);
    fs.mkdirSync(outDir, { recursive: true });
    console.log(`\n[${language}] ${outDir}`);
    page = await launch(`${server.url}?nowelcome`, { width: WIDTH, height: HEIGHT, language });
    try {
      await page.waitFor(`Boolean(${P}?.actions && document.querySelector('#toolbar .tool-button'))`, 30000);
      await settings({ language, showWelcome: false, theme: 'light', showNetMap: false, paneLayout: 'stack' });
      await sleep(800);
      for (const [name, run] of GUIDE) {
        if (!wanted(name)) continue;
        try {
          await run();
          console.log(`  ${name}`);
        } catch (error) {
          problems.push(`[${language}] ${name}: ${error.message}`);
          console.log(`  ${name}: FAILED ${error.message}`);
          await closePopups().catch(() => {});
        }
      }
      if (!only || only.some((w) => w === 'tutorial' || /^[6-9]\d$/.test(w))) await tutorialShots();
      if (page.errors.length) problems.push(...page.errors.map((e) => `[${language}] page error: ${e.split('\n')[0]}`));
    } finally {
      await page.close();
    }
  }
} finally {
  await server.close();
  if (tempBuild) fs.rmSync(tempBuild, { recursive: true, force: true });
}

console.log(`\n${written.length} pictures written.`);
if (problems.length) {
  console.log('Problems:');
  for (const p of problems) console.log(`  ${p}`);
  process.exitCode = 1;
}
