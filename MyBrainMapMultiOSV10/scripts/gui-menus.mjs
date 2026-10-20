// GUI test of every command the window offers: each menu-bar item, each toolbar
// button and drop-down item, the app controls, the status-bar pickers and every
// item of the context menus (topic, empty canvas, relationship, tab, left pane).
// Each one is clicked with real mouse input in the web build (headless Edge /
// Chrome) and must make something happen — the map, the selection, the settings,
// a dialog, a mode, the camera or a status message changes — without a page
// error. After each command the state is put back (undo, close what opened,
// switch toggles back) so the next one starts from the same map.
//
//   npm run build && npm run test:gui        (GUI_ONLY=menus,toolbar,context to run a part)
import { launch } from './cdp.mjs';
import { createReport } from './gui-report.mjs';

// the app runs in English so every label in the report is English

const ONLY = (process.env.GUI_ONLY || '').split(',').filter(Boolean);
const results = [];
let p;
let report;
let lastGroup = '';
// one result line, under a section heading per group
function record(group, label, state, why) {
  results.push({ group, label, state, why });
  if (group !== lastGroup) { report.section(group); lastGroup = group; }
  report.add(label, state === 'pass' ? 'ok' : state === 'fail' ? 'fail' : 'skip', why);
}
const MENU_NAMES = { file: 'File', edit: 'Edit', insert: 'Insert', format: 'Format', view: 'View', tools: 'Tools', help: 'Help' };

// what can be seen of the app's state, as one comparable object
const SNAP = `(() => {
  const m = window.__mtm, d = m.doc(), s = m.settings();
  const sig = (o) => { const j = JSON.stringify(o, (k, v) => (k === 'modified' ? undefined : v)); let h = 0; for (let i = 0; i < j.length; i++) h = (h * 31 + j.charCodeAt(i)) | 0; return j.length + ':' + h; };
  const v = m.canvas() && m.canvas().getView();
  const keys = ['view', 'sidebarVisible', 'panelVisible', 'panelTab', 'sidebarTab', 'showGrid', 'showRulers', 'overviewVisible', 'toolbarVisible', 'statusBarVisible', 'theme', 'language', 'wheelZoom'];
  return {
    map: d ? sig(d.map) : null, past: d ? d.past.length : 0, sel: d ? (d.sel || []).join(',') : '', selRel: d ? d.selRel || '' : '',
    docs: m.docs().map((x) => x.id).join(','), active: d ? d.id : '', focus: d ? d.focusId || '' : '', filter: d && d.filter ? JSON.stringify(d.filter) : '',
    settings: JSON.stringify(Object.fromEntries(keys.map((k) => [k, s[k]]))),
    dialogs: [...document.querySelectorAll('.dlg .dlg-title-text')].map((e) => e.textContent).join('|'),
    menus: document.querySelectorAll('.ctx-menu').length,
    tour: !!document.querySelector('.tour'), present: !!document.querySelector('.presentation'),
    linking: !!document.querySelector('.map-canvas.linking'), editing: !!document.querySelector('.tm-editor.editing'),
    start: !!document.querySelector('.start-page'),
    view: v ? [Math.round(v.k * 100), Math.round(v.x), Math.round(v.y)].join(',') : '',
    status: (document.querySelector('.status-text') || {}).textContent || '',
    opened: (window.__opened || []).length, closed: window.__closed || 0, fs: window.__fs || 0,
    clip: window.__clip || '', print: window.__lastPrint ? 1 : 0, focused: document.activeElement ? document.activeElement.className + '|' + (document.activeElement.placeholder || '') : '',
  };
})()`;

const HOOKS = `(() => {
  window.__MTM_SMOKE__ = true;
  window.open = (url) => { (window.__opened = window.__opened || []).push(String(url)); return null; };
  window.close = () => { window.__closed = (window.__closed || 0) + 1; };
  Element.prototype.requestFullscreen = function () { window.__fs = (window.__fs || 0) + 1; return Promise.resolve(); };
  if (navigator.clipboard) {
    const w = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = (t) => { window.__clip = String(t).slice(0, 40) + '#' + Date.now(); return w(t).catch(() => {}); };
    navigator.clipboard.write = () => { window.__clip = 'image#' + Date.now(); return Promise.resolve(); };
  }
})()`;

const diff = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const center = (expr) => p.eval(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
const run = (id) => p.eval(`void window.__mtm.run(${JSON.stringify(id)})`);

let base = null;          // { docId, snap }
const SAMPLE = 'app-launch';

async function openBase() {
  await run(`sample:${SAMPLE}`);
  await p.waitFor("window.__mtm.doc() && window.__mtm.doc().map.root.children.length > 3");
  await sleep(500);
  await run('view:map');
  await sleep(150);
  await selectBase();
}
// the selected topic: the second main topic (it has siblings on both sides and several subtopics)
async function selectBase() {
  await p.eval("(() => { const d = window.__mtm.doc(); window.__mtm.select([d.map.root.children[1].id]); })()");
  await sleep(120);
}

// back to the base state after a command
async function restore(item) {
  for (let i = 0; i < 4; i++) {
    const s = await p.eval(SNAP);
    if (!s.dialogs && !s.tour && !s.present && !s.linking && !s.editing && !s.menus) break;
    await p.key('Escape');
    await sleep(200);
    // a dialog that ignores Escape (the tutorial) — its × closes it
    if (i === 2) await p.eval("(() => { const x = document.querySelector('.dlg .dlg-x, .tour .icon-btn'); if (x) x.click(); })()");
  }
  // a "save changes?" question left from closing: don't save
  await p.eval("(() => { const b = [...document.querySelectorAll('.dlg .btn')].find((x) => /저장 안 함|Don.t save/.test(x.textContent)); if (b) b.click(); })()");
  await sleep(150);
  let s = await p.eval(SNAP);
  if (s.start && !base.snap.start) { await run('showStart'); await sleep(200); }
  if (s.focus) { await run('focusOff'); await sleep(150); }
  if (s.filter) { await run('filterClear'); await sleep(150); }
  // tabs opened by the command: close them without saving
  const extra = (await p.eval('window.__mtm.docs().map((x) => x.id)')).filter((id) => !base.docIds.includes(id));
  for (const id of extra) {
    await p.eval(`void window.__mtm.run('close', ${JSON.stringify(id)})`);
    await sleep(250);
    await p.eval("(() => { const b = [...document.querySelectorAll('.dlg .btn')].find((x) => /저장 안 함|Don.t save/.test(x.textContent)); if (b) b.click(); })()");
    await sleep(200);
  }
  // the base map was closed: open it again
  const ids = await p.eval('window.__mtm.docs().map((x) => x.id)');
  if (!ids.includes(base.docId)) {
    await openBase();
    base.docId = await p.eval('window.__mtm.doc().id');
    base.docIds = await p.eval('window.__mtm.docs().map((x) => x.id)');
  } else if ((await p.eval('window.__mtm.doc() && window.__mtm.doc().id')) !== base.docId) {
    await p.eval(`(() => { const tab = [...document.querySelectorAll('.tab')].find((t) => t.dataset.tab === ${JSON.stringify(base.docId)}); if (tab) tab.click(); })()`);
    await sleep(200);
  }
  // the map: undo back to the base map (or start over from a fresh copy)
  for (let i = 0; i < 10; i++) {
    s = await p.eval(SNAP);
    if (s.map === base.snap.map || !s.past) break;
    await run('undo');
    await sleep(100);
  }
  s = await p.eval(SNAP);
  if (s.map !== base.snap.map) {
    await p.eval(`void window.__mtm.run('close', ${JSON.stringify(base.docId)})`);
    await sleep(250);
    await p.eval("(() => { const b = [...document.querySelectorAll('.dlg .btn')].find((x) => /저장 안 함|Don.t save/.test(x.textContent)); if (b) b.click(); })()");
    await sleep(250);
    await openBase();
    base.docId = await p.eval('window.__mtm.doc().id');
    base.docIds = await p.eval('window.__mtm.docs().map((x) => x.id)');
    base.snap = await p.eval(SNAP);
  }
  // settings switched by the command
  s = await p.eval(SNAP);
  const now = JSON.parse(s.settings), was = JSON.parse(base.snap.settings);
  for (const k of ['sidebarVisible', 'panelVisible', 'showGrid', 'showRulers', 'overviewVisible', 'toolbarVisible', 'statusBarVisible', 'wheelZoom']) if (now[k] !== was[k]) { await run(`toggle:${k}`); await sleep(80); }
  if (now.view !== was.view) await run(`view:${was.view}`);
  if (now.sidebarTab !== was.sidebarTab && now.sidebarVisible) await run(`side:${was.sidebarTab}`);
  if (now.panelTab !== was.panelTab) await p.eval(`void window.__mtm.run('pane:${was.panelTab}', true)`);
  if (now.theme !== was.theme) await run(`theme:${was.theme}`);
  if (now.language !== was.language) await run('toggleLanguage');
  await sleep(120);
  await selectBase();
  void item;
}

// clicks one item and checks that something happened
async function check(group, label, click, { pre = [], expect = null } = {}) {
  for (const a of pre) { if (a.startsWith('js:')) await p.eval(a.slice(3)); else await run(a); await sleep(200); }
  if (pre.length) { await selectBase(); }
  const before = await p.eval(SNAP);
  const errs = p.errors.length;
  let ok = false, why = '';
  try {
    const clicked = await click();
    if (clicked === false) { record(group, label, 'skip', 'not present in this state'); await restore(label); return; }
    await sleep(450);
    const after = await p.eval(SNAP);
    const changed = diff(before, after);
    if (p.errors.length > errs) why = `page error: ${p.errors.slice(errs).join(' | ').slice(0, 160)}`;
    else if (expect && !changed.includes(expect)) why = `expected ${expect} to change, changed: ${changed.join(', ') || 'nothing'}`;
    else if (!changed.length) why = 'nothing happened';
    else { ok = true; why = changed.join(', '); }
  } catch (err) { why = err.message.slice(0, 160); }
  record(group, label, ok ? 'pass' : 'fail', why);
  await restore(label);
}

// ── the menu bar ──
// a filter on the map (the first entry of the map index)
const FILTER = "js:(() => { window.__mtm.run('side:filter'); return new Promise((r) => setTimeout(() => { const b = document.querySelector('.index-item'); if (b) b.click(); r(!!b); }, 250)); })()";
// the view panned away from the middle, so centering moves it back
const PAN = 'js:(() => { const c = window.__mtm.canvas(), v = c.getView(); c.setView({ ...v, x: v.x + 160, y: v.y + 90 }); return true; })()';
const PRE = {
  centerMap: [PAN],
  undo: ['bold'], redo: ['bold', 'undo'], saveAll: ['bold'], filterClear: [FILTER], findNext: [FILTER], balance: ['redraw:map'], expandAll: ['collapseAll'],
  'view:map': ['view:outline'], 'level:3': ['collapseAll'], comment: ['pane:format'], props: ['pane:format'],
};
async function menus() {
  const ids = await p.eval("[...document.querySelectorAll('.menus .menu-btn[data-menu]')].map((b) => b.dataset.menu)");
  for (const menu of ids) {
    const openMenu = async () => { const c = await center(`document.querySelector('.menu-btn[data-menu="${menu}"]')`); await p.click(c.x, c.y); await sleep(250); };
    await openMenu();
    const items = await p.eval("[...document.querySelectorAll('.ctx-menu .ctx-item')].map((b) => ({ label: b.querySelector('.ctx-label').textContent, disabled: b.disabled }))");
    await p.key('Escape');
    await sleep(150);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const key = await idOf(menu, i);
      const pre = PRE[key] || [];
      await check(`Menu bar: ${MENU_NAMES[menu] || menu}`, it.label, async () => {
        await openMenu();
        const r = await p.eval(`(() => { const b = document.querySelectorAll('.ctx-menu .ctx-item')[${i}]; if (!b || b.disabled) return null; const q = b.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; })()`);
        if (!r) { await p.key('Escape'); return false; }
        await p.click(r.x, r.y);
        return true;
      }, { pre });
    }
  }
}
// the command id behind the i-th item of a menu (for the preconditions)
async function idOf(menu, i) {
  return p.eval(`(() => { const m = window.__menuIds && window.__menuIds[${JSON.stringify(menu)}]; return m ? m[${i}] : ''; })()`);
}

// ── the toolbar ──
async function toolbar() {
  const cmds = await p.eval("[...document.querySelectorAll('.icon-toolbar button[data-cmd]')].map((b) => b.dataset.cmd)");
  for (const cmd of cmds) {
    if (cmd === 'layoutMenu' || cmd === 'styleMenu') {
      const open = await center(`document.querySelector('[data-cmd="${cmd}"]')`);
      await p.click(open.x, open.y);
      await sleep(300);
      const n = await p.eval("document.querySelectorAll('.ctx-menu .ctx-item').length");
      if (!n) record('Toolbar', cmd, 'fail', 'the drop-down did not open');
      await p.key('Escape'); await sleep(150);
      for (let i = 0; i < n; i++) {
        const itemLabel = await p.eval(`(async () => { document.querySelector('[data-cmd="${cmd}"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 200)); const b = document.querySelectorAll('.ctx-menu .ctx-item')[${i}]; const t = b ? b.querySelector('.ctx-label').textContent : ''; document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return t; })()`);
        await sleep(150);
        await check(`Toolbar: ${cmd === 'layoutMenu' ? 'layout list' : 'map style list'}`, itemLabel || `item ${i + 1}`, async () => {
          const c = await center(`document.querySelector('[data-cmd="${cmd}"]')`); await p.click(c.x, c.y); await sleep(250);
          const r = await p.eval(`(() => { const b = document.querySelectorAll('.ctx-menu .ctx-item')[${i}]; const q = b.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2, label: b.textContent, checked: b.classList.contains('checked') }; })()`);
          if (r.checked) {
            // the current one: pick another first, so choosing this one changes something
            await p.key('Escape'); await sleep(100);
            await p.eval(`void window.__mtm.run(${JSON.stringify(cmd === 'layoutMenu' ? 'layout:orgUp' : 'style:neon')})`);
            await sleep(200);
            await p.click(c.x, c.y); await sleep(250);
            const r2 = await p.eval(`(() => { const b = document.querySelectorAll('.ctx-menu .ctx-item')[${i}]; const q = b.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; })()`);
            await p.click(r2.x, r2.y);
          } else await p.click(r.x, r.y);
          return true;
        });
      }
      continue;
    }
    const pre = { undo: ['bold'], redo: ['bold', 'undo'], save: ['bold'], expandAll: ['collapseAll'], 'view:map': ['view:outline'], zoomOut: [], fit: ['zoom100'], centerMap: [PAN] }[cmd] || [];
    await check('Toolbar', cmd, async () => {
      const c = await center(`document.querySelector('.icon-toolbar [data-cmd="${cmd}"]')`);
      if (!c || await p.eval(`document.querySelector('.icon-toolbar [data-cmd="${cmd}"]').disabled`)) return false;
      await p.click(c.x, c.y);
      return true;
    }, { pre });
  }
  // the zoom label (resets to 100%) and the app controls at the right end
  await check('Toolbar', 'zoom ratio (back to 100%)', async () => { const c = await center("document.querySelector('.tb-zoom')"); await p.click(c.x, c.y); return true; }, { pre: ['zoomIn'] });
  const ctl = await p.eval("[...document.querySelectorAll('.icon-toolbar .app-controls button')].map((b, i) => ({ i, title: b.title || b.getAttribute('aria-label') || b.textContent }))");
  for (const c of ctl) {
    await check('App controls', c.title, async () => { const q = await center(`document.querySelectorAll('.icon-toolbar .app-controls button')[${c.i}]`); await p.click(q.x, q.y); return true; });
  }
  // the theme list: the first dark and the first light theme
  for (const k of [0, 20]) {
    await check('App controls', `theme list: ${k ? 'first light theme' : 'first dark theme'}`, async () => {
      const q = await center("document.querySelector('.icon-toolbar .tb-split-caret')"); await p.click(q.x, q.y); await sleep(250);
      const r = await p.eval(`(() => { const b = [...document.querySelectorAll('.ctx-menu .ctx-item')].filter((x) => !x.classList.contains('checked'))[${k}]; const q = b.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; })()`);
      await p.click(r.x, r.y);
      return true;
    });
  }
  // the status bar pickers
  for (const kind of ['layout', 'style']) {
    await check('Status bar', `${kind} picker`, async () => {
      const btn = await p.eval(`(() => { const b = [...document.querySelectorAll('.statusbar button')].filter((x) => x.offsetParent); return b.length; })()`);
      if (!btn) return false;
      const q = await center(`[...document.querySelectorAll('.statusbar button')].filter((x) => x.offsetParent)[${kind === 'layout' ? 0 : 1}]`);
      await p.click(q.x, q.y); await sleep(250);
      const r = await p.eval("(() => { const b = [...document.querySelectorAll('.ctx-menu .ctx-item')].find((x) => !x.classList.contains('checked')); const q = b.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; })()");
      await p.click(r.x, r.y);
      return true;
    });
  }
}

// ── context menus ──
async function rightClick(x, y) {
  await p.mouse('mousePressed', x, y, { button: 'right' });
  await p.mouse('mouseReleased', x, y, { button: 'right' });
  await sleep(250);
}
async function contextMenu(group, where, setup = async () => {}) {
  await setup();
  const at = await where();
  if (!at) { record(group, '(menu)', 'fail', 'no place to right-click'); return; }
  await rightClick(at.x, at.y);
  const items = await p.eval("[...document.querySelectorAll('.ctx-menu .ctx-item')].map((b) => ({ label: b.querySelector('.ctx-label').textContent, icon: !!b.querySelector('.ctx-icon svg, .ctx-icon .ctx-marker') || !!b.querySelector('.theme-swatch'), disabled: b.disabled }))");
  await p.key('Escape'); await sleep(150);
  const noIcon = items.filter((x) => !x.icon).map((x) => x.label);
  record(group, 'every item has an icon', noIcon.length ? 'fail' : 'pass', noIcon.length ? `no icon: ${noIcon.join(', ')}` : `${items.length} items`);
  for (let i = 0; i < items.length; i++) {
    if (items[i].disabled) continue;
    const pre = /모두 펼치기|Expand all/.test(items[i].label) ? ['collapseAll'] : /맵 전체|Fit/.test(items[i].label) ? ['zoom100'] : [];
    await check(group, items[i].label, async () => {
      await setup();
      const q = await where();
      if (!q) return false;
      await rightClick(q.x, q.y);
      const r = await p.eval(`(() => { const b = document.querySelectorAll('.ctx-menu .ctx-item')[${i}]; if (!b) return null; const q = b.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; })()`);
      if (!r) return false;
      await p.click(r.x, r.y);
      return true;
    }, { pre });
  }
}
const topicCenter = (pick) => () => p.eval(`(() => { const d = window.__mtm.doc(); const t = ${pick}; const n = window.__mtm.layout().nodes.get(t.id); const v = window.__mtm.canvas().getView(); const r = document.querySelector('.map-canvas').getBoundingClientRect(); return { x: r.left + v.x + (n.x + n.w / 2) * v.k, y: r.top + v.y + (n.y + n.h / 2) * v.k }; })()`);

async function contexts() {
  await contextMenu('Context menu: topic', topicCenter('d.map.root.children[1]'), async () => { await run('fit'); await sleep(250); });
  await contextMenu('Context menu: topic with a boundary', topicCenter('d.map.root.children[1]'), async () => {
    await run('fit'); await sleep(200);
    await p.eval("(() => { const d = window.__mtm.doc(); if (!d.map.root.children[1].boundary) window.__mtm.run('boundary'); })()");
    await sleep(200);
  });
  await contextMenu('Context menu: empty canvas', async () => p.eval("(() => { const r = document.querySelector('.map-canvas').getBoundingClientRect(); for (let y = r.top + 40; y < r.bottom - 40; y += 20) for (let x = r.left + 40; x < r.right - 220; x += 20) { const el = document.elementFromPoint(x, y); if (el && el.closest('.map-canvas') && !el.closest('[data-id],[data-rel],.overview,.ruler,.pane-expander,[data-summary]')) return { x, y }; } return null; })()"), async () => { await run('zoom100'); await sleep(300); });
  await contextMenu('Context menu: relationship', async () => p.eval("(() => { const el = document.querySelector('.tm-rel path:not(.tm-rel-hit)'); if (!el) return null; const len = el.getTotalLength(); const pt = el.getPointAtLength(len / 2); const m = el.getScreenCTM(); return { x: pt.x * m.a + m.e, y: pt.y * m.d + m.f }; })()"), async () => {
    await run('fit'); await sleep(200);
    const has = await p.eval('(window.__mtm.doc().map.relationships || []).length');
    if (!has) { await p.eval("(() => { const d = window.__mtm.doc(); window.__mtm.select([d.map.root.children[0].children[0].id, d.map.root.children[2].children[0].id]); })()"); await run('relationship'); await sleep(250); }
  });
  await contextMenu('Context menu: tab', async () => center(`document.querySelector('.tab.active, .tab[aria-selected="true"]') || document.querySelectorAll('.tab')[0]`));
  await contextMenu('Context menu: left pane item', async () => center("document.querySelectorAll('.outline-tree .tree-row')[2]"), async () => { await run('side:outline'); await sleep(200); });
}

// ── the first launch: the tutorial and its guided tour start by themselves ──
async function firstLaunch() {
  const t = await launch({ width: 1320, height: 840, lang: 'en', session: { tutorialDone: false, showStartOnLaunch: true } });
  const add = (label, ok, why) => record('First launch: tutorial', label, ok ? 'pass' : 'fail', why);
  try {
    await t.waitFor('!!window.__mtm');
    const started = await t.waitFor('!!document.querySelector(".tour")', 8000).then(() => true, () => false);
    add('the tutorial starts by itself on the first launch', started, started ? await t.eval('window.__mtm.doc().name') : 'no tour');
    let n = 0;
    while (started && await t.eval('!!document.querySelector(".tour")')) {
      // like a person: wait until the card has stopped moving
      let last = '';
      for (let k = 0; k < 20; k++) { const at = await t.eval('JSON.stringify(document.querySelector(".tour-card").getBoundingClientRect())'); if (at === last) break; last = at; await t.sleep(150); }
      const s = await t.eval('(() => { const tour = document.querySelector(".tour"); const c = document.querySelector(".tour-card").getBoundingClientRect(); return { id: tour.dataset.step, ring: !!document.querySelector(".tour-ring"), centred: !tour.querySelector(".tour-ring"), demo: !!document.querySelector("[data-tour=demo]"), inside: c.left >= 0 && c.top >= 0 && c.right <= innerWidth && c.bottom <= innerHeight }; })()');
      n += 1;
      let why = s.ring ? 'spotlight' : 'centred card';
      if (s.demo) {
        const before = await t.eval(SNAP);
        await t.clickSel('[data-tour=demo]');
        await t.sleep(600);
        const changed = diff(before, await t.eval(SNAP));
        why += changed.length ? ` · Show me: ${changed.join(', ')}` : ' · Show me: nothing happened';
        add(`step ${n}: ${s.id}`, s.inside && changed.length > 0, why);
      } else add(`step ${n}: ${s.id}`, s.inside, why + (s.inside ? '' : ' · the card is outside the window'));
      await t.clickSel('[data-tour=next]');
      await t.sleep(400);
    }
    add('it ends after the last step and does not start by itself again', await t.eval('window.__mtm.settings().tutorialDone === true'), `${n} steps`);
    await t.eval("void window.__mtm.run('tour')");
    await t.sleep(700);
    const again = await t.eval('!!document.querySelector(".tour")');
    await t.key('Escape');
    await t.sleep(300);
    add('Help › Tutorial opens it again; Esc closes it', again && !(await t.eval('!!document.querySelector(".tour")')), again ? 'reopened, closed' : 'did not reopen');
    if (t.errors.length) add('no page errors', false, t.errors.join(' | ').slice(0, 200));
  } finally { await t.close(); }
}

async function main() {
  p = await launch({ width: 1440, height: 900, lang: 'en' });
  await p.waitFor('!!window.__mtm');
  await p.eval(HOOKS);
  // the ids behind the menu items, to set up the commands that need a state first (undo needs an edit …)
  await p.eval('window.__menuIds = {}');
  await openBase();
  base = { docId: await p.eval('window.__mtm.doc().id') };
  base.docIds = await p.eval('window.__mtm.docs().map((x) => x.id)');
  base.snap = await p.eval(SNAP);
  await p.eval(`(() => { const all = window.__mtm.menus ? window.__mtm.menus() : null; if (all) for (const m of all) window.__menuIds[m.id] = m.items().filter((x) => !x.sep && !x.header && !x.spacer).map((x) => x.id); })()`);
  report = createReport('My BrainMap — every menu, toolbar and context-menu command');
  if (!ONLY.length || ONLY.includes('menus')) await menus();
  if (!ONLY.length || ONLY.includes('toolbar')) await toolbar();
  if (!ONLY.length || ONLY.includes('context')) await contexts();
  await p.close();
  if (!ONLY.length || ONLY.includes('tour')) await firstLaunch();
  process.exit(report.finish());
}

main().catch(async (err) => { console.error(err); if (p) await p.close(); process.exit(1); });
