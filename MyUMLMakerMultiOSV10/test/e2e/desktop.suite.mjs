// Desktop end-to-end cases against the real MyUMLMaker app (see harness.mjs).
// Each case gets the started App and throws on failure. Cases run in order and
// share the app; each leaves it in a usable state. Popups are their own OS
// windows here (app.popup(kind)); files go to os.tmpdir() folders only.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Page, sleep, waitTarget } from './cdp.mjs';
import { root } from './harness.mjs';
import { ALIGN_CHECK } from './align-check.mjs';
import { CLIP_CHECK } from './clip-check.mjs';

const VERSION = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const TITLE = `MyUMLMaker v${VERSION}`;
const WS_THICKFRAME = 0x40000;
// Lists that page or scroll on purpose (result lists, the code preview, the code options column).
const POPUP_SCROLL_CHECK = `(() => [...document.querySelectorAll('*')].filter((e) => {
  const style = getComputedStyle(e);
  return ['auto', 'scroll'].includes(style.overflowY) && e.scrollHeight > e.clientHeight + 1 && !['SELECT', 'TEXTAREA', 'PRE'].includes(e.tagName) && !e.classList.contains('result-list') && !e.classList.contains('codegen-options');
}).map((e) => e.className || e.tagName))()`;
const MENUS = ['file', 'edit', 'model', 'view', 'format', 'arrange', 'tools', 'help'];

// windowsHide: a console window would take the focus away (and close an open menu).
const ps = (script) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }).toString().trim();
const getClipboard = () => ps('[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw');

const W = (app, expression) => app.main.eval(`(() => { const w = window.__myumlmaker; const a = w.actions; const api = w.api; const M = w.domain.M; return ${expression}; })()`);
const resize = (app, width, height) => app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: ${width}, height: ${height} } } }).then(() => 1)`);
const mainWindow = async (app) => (await app.windowInfo()).find((w) => w.owner === 0 && w.visible && w.title === TITLE);
const closeAllDocs = `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); return 1; })()`;
const now = (app) => app.main.eval('Date.now()');

async function closePopups(app) {
  await app.main.eval(`window.__myumlmaker.popups.closeAll().then(() => 1)`).catch(() => {});
  await sleep(200);
}

/** The built-in sample project (eleven diagrams), class diagram open, at 100 %. */
async function freshSample(app) {
  await closePopups(app);
  await W(app, `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); a.openSampleBuiltin(); a.setCanvasZoom(100); a.select([]); return 1; })()`);
  await sleep(500);
}

/** A new project from a template (blank: an empty class diagram) at 100 %. */
async function freshProject(app, template = 'blank') {
  await closePopups(app);
  await W(app, `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); a.newProject(${JSON.stringify(template)}); a.setCanvasZoom(100); return 1; })()`);
  await sleep(400);
}

/** The view of the element named `name` on the current diagram: { id, model, x, y, box } (client point near the top of its box). */
const viewAt = (app, name, fx = 0.5, dy = 12) => W(app, `(() => {
  const tab = a.activeDoc(); const v = api.view;
  const el = [...tab.index.byId.values()].find((e) => e.name === ${JSON.stringify(name)} && !/View$/.test(e._type));
  const view = api.diagram().ownedViews.find((x) => x.model?.$ref === el?._id);
  if (!view) return null;
  v.reveal(view._id);
  const b = v.boxOf(view._id); const r = v.stage.getBoundingClientRect(); const p = v.toStage({ x: b.x + b.w * ${fx}, y: b.y + ${dy} });
  return { id: view._id, model: el._id, x: r.left + p.x, y: r.top + p.y, box: b };
})()`);
/** A client point inside the visible canvas (fractions of the scroll area). */
/** A client point on the canvas with no view and no minimap under it. */
const emptyCanvasPoint = (app) => app.main.eval(`(() => { const r = window.__myumlmaker.api.view.scroll.getBoundingClientRect(); for (let fy = 0.95; fy > 0.1; fy -= 0.05) for (let fx = 0.1; fx < 0.9; fx += 0.05) { const x = r.left + r.width * fx; const y = r.top + r.height * fy; const e = document.elementFromPoint(x, y); if (e?.closest('.canvas-scroll') && !e.closest('[data-view], .minimap, .quick-bar, .canvas-overlay [data-resize]')) return { x, y }; } return null; })()`);
const canvasPoint = (app, fx, fy) => app.main.eval(`(() => { const r = window.__myumlmaker.api.view.scroll.getBoundingClientRect(); return { x: r.left + r.width * ${fx}, y: r.top + r.height * ${fy} }; })()`);
const elementNamed = (app, name) => W(app, `(() => { const e = [...a.activeDoc().index.byId.values()].find((x) => x.name === ${JSON.stringify(name)} && !/View$/.test(x._type)); return e ? JSON.parse(JSON.stringify(e)) : null; })()`);
const countOf = (app, type) => W(app, `M.elementsWhere(a.activeDoc().project, (e) => e._type === ${JSON.stringify(type)}).length`);
const noErrorPopup = async (app, where) => assert.equal(await app.hasPopup('error'), false, `${where}: no error popup`);
const treeRow = (app, name) => app.main.eval(`(() => { const r = [...document.querySelectorAll('#explorer .tree-row')].find((x) => x.querySelector('.tree-name')?.textContent === ${JSON.stringify(name)})?.getBoundingClientRect(); return r ? { x: r.left + 60, y: r.top + r.height / 2 } : null; })()`);

/**
 * The menu window (one prewarmed OS window reused by every menu) once it shows a
 * menu opened at or after `since` (main-page clock) — never the items of an older menu.
 */
async function menuWindow(app, since, timeout = 15000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    const target = await waitTarget(app.port, (item) => item.title === 'popup-menu', Math.max(1000, end - Date.now()));
    const page = await new Page(target).open().catch((error) => { last = error; return null; });
    if (!page) { await sleep(200); continue; }
    try {
      await page.waitFor(`(window.__myumlmakerPopup?.state.params.at ?? 0) >= ${since} && Boolean(document.querySelector('.popup-menu .menu-item'))`, { timeout: Math.max(1000, end - Date.now()) });
      await sleep(250);
      return page;
    } catch (error) {
      last = error;
      page.close();
      if (!/window closed/.test(error.message)) throw error;
    }
  }
  throw last ?? new Error('no menu');
}

/** OS window checks for a popup: its own window titled "<title> — MyUMLMaker vX", owned by the main window, fixed size, no scroll bars, icon + title. */
async function expectPopupWindow(app, page, kind, { resizable = false } = {}) {
  assert.equal(await page.eval('document.title'), `popup-${kind}`);
  const head = await page.eval(`(() => { if (${kind === 'menu'}) { const m = document.querySelector('.popup-menu'); return m ? { icon: true, text: m.getAttribute('aria-label') || '', drag: true } : null; } const h = document.querySelector('.popup-head h2'); return h ? { icon: Boolean(h.querySelector('svg')), text: h.textContent.trim(), drag: Boolean(document.querySelector('[data-window-drag]')) } : null; })()`);
  assert.ok(head?.icon && head.text, `${kind}: header has an icon and a title (${JSON.stringify(head)})`);
  assert.ok(head.drag, `${kind}: can be moved by its title bar`);
  assert.deepEqual(await page.eval(POPUP_SCROLL_CHECK), [], `${kind}: no scroll bars inside the popup`);
  let windows = [];
  let popup;
  for (let i = 0; i < 16 && !popup; i++) {
    if (i) await sleep(150);
    windows = (await app.windowInfo()).filter((w) => w.visible && w.title.endsWith(TITLE));
    popup = windows.find((w) => w.owner !== 0 && w.title === `${head.text} — ${TITLE}`);
  }
  const main = windows.find((w) => w.owner === 0);
  assert.ok(main, 'main window found');
  assert.ok(popup, `${kind}: its own OS window "${head.text} — ${TITLE}" (${JSON.stringify(windows.map((w) => w.title))})`);
  assert.equal(popup.owner, main.handle, `${kind}: owned by the main window (closes with it)`);
  if (!resizable) assert.equal(popup.style & WS_THICKFRAME, 0, `${kind}: fixed size`);
  return { main, popup };
}

/** Right-clicks a point and returns the context menu's title and item ids (the menu is closed again). */
async function contextMenuAt(app, point, where) {
  const since = await now(app);
  await app.main.realClick(point.x, point.y, { button: 'right' });
  const menu = await menuWindow(app, since);
  const info = await menu.eval(`({ head: document.querySelector('.popup-menu').getAttribute('aria-label'), ids: [...document.querySelectorAll('.menu-item')].map((i) => i.dataset.id), noIcon: [...document.querySelectorAll('.menu-item')].filter((i) => !i.querySelector('.menu-icon svg')).map((i) => i.dataset.id) })`);
  await menu.key('Escape');
  menu.close();
  await sleep(300);
  assert.deepEqual(info.noIcon, [], `${where}: every item has an icon`);
  assert.ok(info.head, `${where}: the menu has a title`);
  return { head: info.head, ids: info.ids.join(',') };
}

/** After a restart: a welcome popup (only if the first-run flag did not reach the disk) is dismissed. */
async function afterStart(app) {
  await app.popup('welcome', 2500).then((p) => p.close()).catch(() => {});
  await closePopups(app);
}

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `myuml-${name}-`));
}

async function waitFile(file, tries = 40) {
  for (let i = 0; i < tries && !fs.existsSync(file); i++) await sleep(150);
  await sleep(100);
  assert.ok(fs.existsSync(file), `${path.basename(file)} written`);
  return fs.readFileSync(file);
}

/** The text of a project file made from a template (for files written to the temp folder). */
const templateText = (app, template) => W(app, `(() => { const doc = a.newProject(${JSON.stringify(template)}); const text = doc.text(); a.closeDoc(doc, { force: true }); return text; })()`);

/**
 * A real click on the element `selector` of `page`: it is scrolled into view first (as a user scrolls a list
 * or a tab row), and the click fails when something else covers its centre.
 */
async function clickOn(page, selector, options = {}) {
  const p = await page.eval(`(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    if (!e) return null;
    e.scrollIntoView({ block: ${JSON.stringify(options.block ?? 'nearest')}, inline: 'nearest', behavior: 'instant' });
    const r = e.getBoundingClientRect(); const x = r.left + r.width / 2; const y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, ok: Boolean(hit && (hit === e || e.contains(hit))), hit: hit?.outerHTML.slice(0, 100) ?? null };
  })()`);
  if (!p) throw new Error(`${selector}: missing`);
  if (!p.ok) throw new Error(`${selector}: covered by ${p.hit}`);
  await page.realClick(p.x, p.y, options);
  return p;
}

/** OS mouse input (SetCursorPos + mouse_event) for what only the real mouse does: the window's drag area and edges. */
const OS_INPUT = `if (-not ('MI' -as [type])) { Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class MI{[DllImport("user32.dll")]public static extern IntPtr WindowFromPoint(P p);[DllImport("user32.dll")]public static extern IntPtr GetAncestor(IntPtr h,uint f);[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);[DllImport("user32.dll")]public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);[DllImport("user32.dll")]public static extern bool ClientToScreen(IntPtr h,ref P p);public struct P{public int X,Y;}}' }`;
/**
 * Runs OS mouse actions on the main window: { at: client CSS point } moves the cursor (in steps from the last
 * point when `steps` is given), { down } / { up } press and release the left button, { wait: ms } pauses.
 */
async function osMouse(app, actions) {
  const main = await mainWindow(app);
  const dpr = await app.main.eval('devicePixelRatio');
  // Brings the main window to the front first (other programs on the desktop can hold the foreground).
  let script = `${OS_INPUT};$h=[IntPtr]${main.handle};for($k=0;$k -lt 5 -and [MI]::GetForegroundWindow() -ne $h;$k++){[MI]::keybd_event(0x12,0,0,[UIntPtr]::Zero);[MI]::keybd_event(0x12,0,2,[UIntPtr]::Zero);[void][MI]::SetForegroundWindow($h);Start-Sleep -Milliseconds 120};$o=New-Object MI+P;$o.X=0;$o.Y=0;[void][MI]::ClientToScreen($h,[ref]$o)`;
  let last = null;
  for (const a of actions) {
    if (a.at) {
      const steps = a.steps && last ? a.steps : 1;
      for (let i = 1; i <= steps; i++) {
        const x = last && steps > 1 ? last.x + ((a.at.x - last.x) * i) / steps : a.at.x;
        const y = last && steps > 1 ? last.y + ((a.at.y - last.y) * i) / steps : a.at.y;
        // Screen points from where the page was when the gesture began (the window may move or grow meanwhile).
        script += `;$p=New-Object MI+P;$p.X=$o.X+${Math.round(x * dpr)};$p.Y=$o.Y+${Math.round(y * dpr)};[void][MI]::SetCursorPos($p.X,$p.Y);Start-Sleep -Milliseconds ${steps > 1 ? 25 : 120}`;
      }
      last = a.at;
    }
    if (a.probe) script += ';"under=$([int64][MI]::GetAncestor([MI]::WindowFromPoint($p),2)) fg=$([int64][MI]::GetForegroundWindow()) main=$([int64]$h)"';
    if (a.down) script += ';[MI]::mouse_event(2,0,0,0,[UIntPtr]::Zero)';
    if (a.up) script += ';[MI]::mouse_event(4,0,0,0,[UIntPtr]::Zero)';
    if (a.wait) script += `;Start-Sleep -Milliseconds ${a.wait}`;
  }
  const out = await app.shell(script);
  await sleep(300);
  return out;
}
// ───────────────────────── document windows (user's guide, tutorial document, tutorial video)

const WS_MAXIMIZEBOX = 0x10000;
const WS_CAPTION = 0xc00000;
const DOC_LABELS = ['doc-guide', 'doc-tutorial', 'doc-video'];

/** Closes every document window (no questions). */
async function closeDocWindows(app) {
  await app.main.eval(`Promise.all(${JSON.stringify(DOC_LABELS)}.map((label) => window.__TAURI_INTERNALS__.invoke('plugin:window|destroy', { label }).catch(() => 1))).then(() => 1)`).catch(() => {});
  await sleep(400);
}

/** The page of the document window of `kind` once it is drawn (a document: its chapters listed) and `ready` holds. */
async function docWindow(app, kind, ready = 'true', timeout = 20000) {
  const end = Date.now() + timeout;
  const drawn = kind === 'video' ? 'true' : `document.querySelectorAll('[data-viewer-chapter] option').length > 5 && Boolean(document.querySelector('.viewer-frame')?.contentDocument?.querySelector('h1'))`;
  let last;
  while (Date.now() < end) {
    const target = await waitTarget(app.port, (item) => item.title === `doc-${kind}`, Math.max(1000, end - Date.now()));
    const page = await new Page(target).open().catch((error) => { last = error; return null; });
    if (!page) { await sleep(200); continue; }
    try {
      await page.waitFor(`Boolean(window.__myumlmakerViewer) && ${drawn} && (${ready})`, { timeout: Math.max(1000, end - Date.now()), message: `doc-${kind} is drawn` });
      return page;
    } catch (error) {
      last = error;
      page.close();
      if (!/window closed/.test(error.message)) throw error;
      await sleep(200);
    }
  }
  throw last ?? new Error(`doc-${kind} did not open`);
}

/** The visible OS window "MyUMLMaker — <name>". */
async function docOsWindow(app, name) {
  const title = `MyUMLMaker — ${name}`;
  let found;
  for (let i = 0; i < 30 && !found; i++) {
    if (i) await sleep(200);
    found = (await app.windowInfo()).find((w) => w.visible && w.title === title);
  }
  assert.ok(found, `the OS window "${title}" (${JSON.stringify((await app.windowInfo()).filter((w) => w.visible).map((w) => w.title))})`);
  return found;
}

/** Evaluates inside the document shown in a document window (window and document are the page's). */
const frameEval = (page, expression) => page.eval(`(() => { const f = document.querySelector('.viewer-frame'); return ((window, document) => (${expression}))(f.contentWindow, f.contentDocument); })()`);

/** Closes a window with the close button of its system title bar (real mouse) and waits until it is gone. */
async function closeWithTitleBar(app, page, title) {
  const dpr = await page.eval('devicePixelRatio');
  let gone = false;
  const probes = [];
  for (let attempt = 0; attempt < 3 && !gone; attempt++) {
    const win = (await app.windowInfo()).find((w) => w.visible && w.title === title);
    if (!win) { gone = true; break; }
    // The window rectangle includes the invisible resize border (about 7 px at the sides): the close button
    // is the 46 px at the right end of the 30 px title bar.
    const x = win.right - Math.round(30 * dpr);
    const y = win.top + Math.round(14 * dpr);
    probes.push(await app.shell(`${OS_INPUT};$h=[IntPtr]${win.handle};for($k=0;$k -lt 5 -and [MI]::GetForegroundWindow() -ne $h;$k++){[MI]::keybd_event(0x12,0,0,[UIntPtr]::Zero);[MI]::keybd_event(0x12,0,2,[UIntPtr]::Zero);[void][MI]::SetForegroundWindow($h);Start-Sleep -Milliseconds 120};$p=New-Object MI+P;$p.X=${x - 20};$p.Y=${y};[void][MI]::SetCursorPos($p.X,$p.Y);Start-Sleep -Milliseconds 120;$p.X=${x};[void][MI]::SetCursorPos($p.X,$p.Y);Start-Sleep -Milliseconds 250;"under=$([int64][MI]::GetAncestor([MI]::WindowFromPoint($p),2)) win=${win.handle}";[MI]::mouse_event(2,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 60;[MI]::mouse_event(4,0,0,0,[UIntPtr]::Zero)`));
    for (let i = 0; i < 20 && !gone; i++) {
      await sleep(150);
      gone = !(await app.windowInfo()).some((w) => w.visible && w.title === title);
    }
  }
  page.close();
  assert.ok(gone, `"${title}" closed with its title bar's close button (${probes.join(' ')})`);
  await sleep(300);
}

const osDoubleClick = (app, at) => osMouse(app, [{ at: { x: at.x - 20, y: at.y } }, { at, steps: 3 }, { wait: 200 }, { probe: true }, { down: true }, { wait: 30 }, { up: true }, { wait: 90 }, { down: true }, { wait: 30 }, { up: true }]);
const setWindow = (app, x, y, width, height) => app.main.eval(`Promise.all([window.__TAURI_INTERNALS__.invoke('plugin:window|unmaximize', { label: 'main' }).catch(() => 1)]).then(() => window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: ${width}, height: ${height} } } })).then(() => window.__TAURI_INTERNALS__.invoke('plugin:window|set_position', { label: 'main', value: { Logical: { x: ${x}, y: ${y} } } })).then(() => 1)`);
/** A client point in the empty part of the menu bar (the drag area). */
const dragArea = (app) => app.main.eval(`(() => { const r = document.querySelector('#menubar .menubar-drag').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; })()`);

/** Picks an example in the text import's example dropdown (fills the text box). */
const pickSample = (page, kind) => page.eval(`(() => { const s = document.querySelector('select[data-text-sample]'); s.focus(); s.value = ${JSON.stringify(kind)}; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);

/** Opens a menubar menu and runs its items (submenu ids first, then the item) with real clicks. */
async function runMenu(app, menu, ...ids) {
  // A menu closes when it loses the focus: if one did not show (or closed early), the whole path is opened again.
  for (let attempt = 0; ; attempt++) {
    try {
      const since = await now(app);
      await clickOn(app.main, `[data-menu="${menu}"]`);
      const page = await menuWindow(app, since, 6000);
      try {
        for (const id of ids) {
          // A group row opens its items beside it in the same menu (on hover or a click); the leaf gets the real click.
          if (id.startsWith('submenu:')) {
            await page.click(`[data-id="${id}"]`);
            await page.waitFor(`Boolean(document.querySelector('.popup-menu[data-level="1"] .menu-item'))`, { timeout: 3000 });
            await sleep(150);
          } else await clickOn(page, `[data-id="${id}"]`);
        }
      } finally {
        page.close();
      }
      await sleep(300);
      return;
    } catch (error) {
      if (attempt >= 2) throw error;
      await closePopups(app);
      await sleep(400);
    }
  }
}

/** Adds a diagram with + of the tab bar and the new-diagram popup (real clicks): its group, its card, then Create. */
async function addDiagramWithPicker(app, type, { name = '', from = '#tabs .tab-add' } = {}) {
  const group = await app.main.eval(`import('/src/domain/toolbox.js').then((m) => m.diagramTabOf(${JSON.stringify(type)}))`);
  await clickOn(app.main, from);
  const page = await app.popup('diagram');
  try {
    await page.waitFor(`Boolean(document.querySelector('.dg-card'))`, { timeout: 5000 });
    await clickOn(page, `[data-action="picker-group"][data-value="${group}"]`);
    await sleep(150);
    await clickOn(page, `[data-action="picker-type"][data-value="${type}"]`);
    if (name) { await clickOn(page, '[data-draft="name"]'); await page.type(name); }
    await clickOn(page, '[data-action="picker-create"]');
  } finally {
    page.close();
  }
  await app.main.waitFor(`window.__myumlmaker.api.diagram()?._type === ${JSON.stringify(type)}`, { timeout: 5000, message: `${type} is added from the new-diagram popup` });
  await sleep(250);
}

/** Opens a diagram type like a user: its tab in the tab bar when the project has one, else + and the new-diagram popup. */
async function openTypeByTabs(app, type) {
  const id = await W(app, `M.elementsWhere(a.activeDoc().project, (e) => e._type === ${JSON.stringify(type)})[0]?._id ?? null`);
  if (!id) return addDiagramWithPicker(app, type);
  await clickOn(app.main, `#tabs [data-diagram-tab="${id}"]`);
  await app.main.waitFor(`window.__myumlmaker.api.diagram()?._id === ${JSON.stringify(id)}`, { timeout: 5000, message: `${type} opens from its tab` });
  await sleep(250);
  return undefined;
}

/** Node tools to draw per diagram type: [the tool drawn twice and connected, …tools drawn once]. Others: the first tools of the toolbox. */
const MAIN_TOOLS = {
  UMLSequenceDiagram: ['UMLLifeline', 'actorLifeline'],
  UMLCommunicationDiagram: ['UMLLifeline', 'actorLifeline'],
  UMLTimingDiagram: ['UMLTimingLifeline'],
  UMLInteractionOverviewDiagram: ['UMLInteractionUse', 'UMLInitialNode', 'UMLDecisionNode'],
  UMLStatechartDiagram: ['UMLState', 'pseudo:initial', 'UMLFinalState'],
  UMLActivityDiagram: ['UMLAction', 'UMLInitialNode', 'UMLActivityFinalNode'],
  BPMNDiagram: ['BPMNTask', 'BPMNStartEvent', 'BPMNExclusiveGateway'],
  SysMLInternalBlockDiagram: ['SysMLPart', 'UMLActor'],
  SysMLParametricDiagram: ['SysMLConstraintProperty', 'SysMLConstraintParameter'],
  NetworkDiagram: ['NWNode', 'NWNetwork'],
  GanttDiagram: ['GanttTask', 'GanttMilestone'],
  TimelineDiagram: ['TLEvent', 'TLPeriod'],
  UserStoryMapDiagram: ['USStory', 'USStep'],
  CustomerJourneyDiagram: ['CJEmotion', 'CJCard'],
};
/** Tools that only make sense inside another element (ports, pins, lanes …) are not drawn on the bare canvas. */
const INNER_TOOL = /Port$|Pin$|Lane$|Parameter$|Property$|TimeTick$|^UMLPart$|CollaborationUse$/;

/**
 * Draws on a diagram type like a user (real mouse and keyboard): opens it with the type tabs, draws the main
 * node tools (tool click + canvas click, naming each in the in-place editor), connects two nodes with the main
 * relationship tool by dragging, and renames one with a double click (quick edit). Checks the model and the views.
 */
async function drawDiagramType(app, type) {
  app.main.errors.length = 0;
  await openTypeByTabs(app, type);
  const plan = await W(app, `(() => {
    const groups = w.domain.toolboxFor(${JSON.stringify(type)}).filter(([id]) => id !== 'annotations');
    const all = groups.flatMap((g) => g[3]);
    const wanted = ${JSON.stringify(MAIN_TOOLS[type] ?? null)};
    const first = groups[0][3].filter((t) => t.kind === 'node' && !${INNER_TOOL}.test(t.type) && !${INNER_TOOL}.test(t.id));
    const cloud = first.length && first.every((t) => t.type === 'CloudGroup');
    const pool = cloud ? all.filter((t) => t.kind === 'node' && t.type === 'CloudService') : first;
    const ids = wanted ?? [...new Map(pool.map((t) => [t.type, t.id])).values()].slice(0, 3);
    return { nodes: ids, edge: all.find((t) => t.kind === 'edge')?.id ?? null, row: ${JSON.stringify(['UMLSequenceDiagram'].includes(type))} };
  })()`);
  assert.ok(plan.nodes.length, `${type}: node tools`);
  const spots = plan.row ? [[0.08, 0.1], [0.42, 0.1], [0.74, 0.1]] : [[0.05, 0.08], [0.05, 0.52], [0.55, 0.08], [0.55, 0.52]];
  const order = [plan.nodes[0], plan.nodes[0], ...plan.nodes.slice(1)].slice(0, spots.length);
  const viewIds = () => W(app, `api.diagram().ownedViews.map((v) => v._id)`);
  const created = [];
  const place = async (i, tool) => {
    const before = new Set(await viewIds());
    for (let attempt = 0; attempt < 3 && (await W(app, 'w.state.tool?.id ?? null')) !== tool; attempt++) {
      await clickOn(app.main, `#left-panel .tool-item[data-tool="${tool}"]`, { block: 'center' });
      await app.main.waitFor(`window.__myumlmaker.state.tool?.id === ${JSON.stringify(tool)}`, { timeout: 1200 }).catch(() => {});
    }
    assert.equal(await W(app, 'w.state.tool?.id ?? null'), tool, `${type}: the ${tool} tool is picked ${JSON.stringify(await W(app, 'w.debug()'))}`);
    // The second node goes just below the first one (the canvas can be short: bottom panel, small window).
    const at = i === 1 && !plan.row ? await W(app, `(() => { const v = api.view; const b = v.boxOf(${JSON.stringify(created[0])}); const r = v.stage.getBoundingClientRect(); const p = v.toStage({ x: b.x, y: b.y + b.h }); return { x: r.left + p.x + 4, y: r.top + p.y + 50 }; })()`) : await canvasPoint(app, ...spots[i]);
    await app.main.realClick(at.x, at.y);
    const editing = await app.main.waitFor(`Boolean(document.querySelector('.text-editor'))`, { timeout: 700 }).then(() => true, () => false);
    if (editing) {
      await app.main.type(`N${i + 1}`);
      await app.main.key('Enter', 2);
    }
    await sleep(200);
    const added = (await viewIds()).filter((id) => !before.has(id));
    assert.ok(added.length >= 1, `${type}: ${tool} drew a view (click at ${Math.round(at.x)},${Math.round(at.y)})`);
    const node = await W(app, `(() => { const ids = ${JSON.stringify(added)}; const tool = w.domain.toolboxFor(${JSON.stringify(type)}).flatMap((g) => g[3]).find((t) => t.id === ${JSON.stringify(tool)}); const nodes = ids.filter((id) => { const v = M.findView(api.diagram(), id); return v && !M.isEdgeView(v); }); return nodes.find((id) => { const v = M.findView(api.diagram(), id); return v.model && a.activeDoc().index.get(v.model.$ref)?._type === tool?.type; }) ?? nodes[0] ?? ids[0]; })()`);
    created.push(node);
    if (editing) assert.ok(await W(app, `(() => { const v = M.findView(api.diagram(), ${JSON.stringify(node)}); const e = v?.model && a.activeDoc().index.get(v.model.$ref); return !e || JSON.stringify(e).includes('N${i + 1}'); })()`), `${type}: ${tool} took the typed name`);
  };
  // The two nodes to connect first (others drawn later can be laid out over them, e.g. Gantt milestones by date).
  for (const [i, tool] of order.slice(0, 2).entries()) await place(i, tool);
  assert.equal(await W(app, 'w.state.tool'), null, `${type}: back to the pointer`);
  const [first, second] = created;
  const pointOf = (id) => W(app, `(() => { const v = api.view; const b = v.boxOf(${JSON.stringify(id)}); const r = v.stage.getBoundingClientRect(); const p = v.toStage({ x: b.x + b.w / 2, y: b.y + (${plan.row} ? Math.min(b.h / 2, 140) : b.h / 2) }); return { x: r.left + p.x, y: r.top + p.y }; })()`);
  if (plan.edge && first !== second) {
    const edgesBefore = await W(app, `api.diagram().ownedViews.filter((v) => M.isEdgeView(v)).length`);
    await clickOn(app.main, `#left-panel .tool-item[data-tool="${plan.edge}"]`, { block: 'center' });
    assert.equal(await W(app, 'w.state.tool?.id ?? null'), plan.edge, `${type}: the ${plan.edge} tool is picked`);
    await app.main.drag(await pointOf(first), await pointOf(second), 14);
    await sleep(300);
    const edge = await W(app, `(() => { const e = api.diagram().ownedViews.filter((v) => M.isEdgeView(v)).at(-1); const m = e?.model && a.activeDoc().index.get(e.model.$ref); return e ? { count: api.diagram().ownedViews.filter((v) => M.isEdgeView(v)).length, ends: [e.tail?.$ref, e.head?.$ref], type: m?._type ?? e._type } : null; })()`);
    assert.ok(edge && edge.count === edgesBefore + 1, `${type}: dragging with ${plan.edge} adds a line ${JSON.stringify(edge)}`);
    assert.deepEqual([...edge.ends].sort(), [first, second].sort(), `${type}: between the two ${order[0]} views ${JSON.stringify({ edge, first, second })}`);
  }
  // Quick edit: a double click on the first node edits it in place.
  const mode = await W(app, `(() => { const m = api.editModeOf(M.findView(api.diagram(), ${JSON.stringify(first)})); return m ? m.kind : null; })()`);
  if (mode) {
    await app.main.key('Escape');
    // Near the top of the view (its name), which is on screen also for big frames.
    const p = await W(app, `(() => { const v = api.view; v.reveal(${JSON.stringify(first)}); const b = v.boxOf(${JSON.stringify(first)}); const r = v.stage.getBoundingClientRect(); const q = v.toStage({ x: b.x + Math.min(b.w / 2, 70), y: b.y + Math.min(b.h / 2, 14) }); return { x: r.left + q.x, y: r.top + q.y }; })()`);
    await app.main.realClick(p.x, p.y, { clickCount: 2 });
    await app.main.waitFor(`Boolean(document.querySelector('.text-editor'))`, { timeout: 3000, message: `${type}: a double click opens the in-place editor (${mode})` });
    await app.main.eval(`(() => { const e = document.querySelector('.text-editor'); const end = e.value.indexOf('\\n'); e.setSelectionRange(0, end < 0 ? e.value.length : end); return 1; })()`);
    await app.main.type('Edited');
    await app.main.key('Enter', 2);
    await sleep(250);
    assert.ok(await W(app, `(() => { const v = M.findView(api.diagram(), ${JSON.stringify(first)}); const e = v?.model ? a.activeDoc().index.get(v.model.$ref) : v; return JSON.stringify(e).includes('Edited'); })()`), `${type}: the double-click edit reached the model (${mode})`);
  }
  for (const [i, tool] of order.entries()) if (i >= 2) await place(i, tool);
  assert.ok(await app.main.eval(`document.querySelectorAll('.canvas-svg [data-view]').length >= ${created.length}`), `${type}: drawn on the canvas`);
  assert.deepEqual(app.main.errors, [], `${type}: no exceptions`);
  await noErrorPopup(app, type);
  return { type, nodes: order, edge: plan.edge, mode };
}

/** One case per group of diagram types: a blank project, then each type drawn with the real mouse. */
const drawCase = (name, types) => ({ group: '다이어그램 종류', name: `${name}: 종류 탭으로 열고 도구로 그리고 끌어 연결·두 번 눌러 고침 (실제 마우스)`, async run(app) {
  await freshProject(app);
  await W(app, `(a.updateSettings({ showRulers: true, snapToGrid: true }), 1)`);
  for (const type of types) await drawDiagramType(app, type);
  assert.deepEqual(await W(app, `[...new Set(M.allDiagrams(a.activeDoc().project).map((d) => d._type))].filter((t) => ${JSON.stringify(types)}.includes(t)).sort()`), [...types].sort(), 'a diagram of every type');
} });

export const cases = [
  // ───────────────────────── first start
  { group: '처음 실행', name: '튜토리얼 안내 팝업 (독립 OS 창): "시작할 때 이 창 보이기" 끄고 나중에, 도움말 › 시작 안내 창으로 다시 열림 (실제 클릭)', async run(app) {
    const page = await app.popup('welcome');
    await expectPopupWindow(app, page, 'welcome');
    const text = await page.eval(`document.querySelector('.popup').innerText`);
    assert.match(text, /튜토리얼|tutorial/i);
    assert.deepEqual(await page.eval(`[...document.querySelectorAll('[data-action="choice"]')].map((b) => b.dataset.value)`), ['later', 'sample', 'tutorial']);
    assert.equal(await page.eval(`document.querySelector('[data-toggle="showWelcome"]')?.checked`), true, 'the box is on at first');
    await clickOn(page, '[data-toggle="showWelcome"]');
    await sleep(300);
    assert.equal(await page.eval(`document.querySelector('[data-toggle="showWelcome"]').checked`), false);
    await page.click('[data-value="later"]');
    page.close();
    await sleep(400);
    assert.equal(await W(app, 'w.state.settings.showWelcome'), false, 'no welcome at the next start');
    assert.equal(await W(app, 'w.state.settings.tutorialOffered'), true, 'offered once');
    assert.equal(await W(app, 'Boolean(w.tutorial()?.state().active)'), false, 'no tutorial started');
    // Help › Welcome window opens it again, with the box as it was left.
    await W(app, "(w.run('welcome'), 1)");
    const again = await app.popup('welcome');
    assert.equal(await again.eval(`document.querySelector('[data-toggle="showWelcome"]').checked`), false);
    await again.click('[data-value="later"]');
    again.close();
    await sleep(300);
  } },
  { group: '처음 실행', name: '시작 페이지: 템플릿 전부, 최근 파일·폴더, 예제, 튜토리얼·도움말, 패널 숨김', async run(app) {
    await W(app, '(a.showStartPage(true), 1)');
    await sleep(300);
    const templates = await W(app, 'w.domain.TEMPLATES.length');
    const info = await app.main.eval(`({ shown: !document.querySelector('#start-page').hidden, templates: document.querySelectorAll('.template-tile').length, tutorial: Boolean(document.querySelector('.start-hero [data-start="tutorial"]')), banner: Boolean(document.querySelector('.start-banner')), recent: Boolean(document.querySelector('.start-card.recent')), samples: [...document.querySelectorAll('[data-start="open-sample"], [data-start="builtin-sample"]')].map((b) => b.dataset.value), help: ['tutorial-doc', 'guide', 'shortcuts'].every((x) => document.querySelector('[data-start="' + x + '"]')), left: getComputedStyle(document.querySelector('#left-panel')).display, version: document.querySelector('.start-hero h1').textContent })`);
    assert.ok(info.shown, 'start page shown');
    assert.equal(templates, 23, 'MyUMLMaker has 23 templates');
    assert.equal(info.templates, templates, 'a tile per template');
    assert.ok(info.tutorial && info.banner && info.recent && info.help, JSON.stringify(info));
    assert.ok(info.samples.length >= 1 && info.samples.every((p) => !p || /\.ko\.(myuml|mdj)$/.test(p)), `sample projects in the UI language ${JSON.stringify(info.samples)}`);
    assert.match(info.version, new RegExp(VERSION.replace(/\./g, '\\.')));
    assert.equal(info.left, 'none', 'the side panels are hidden on the start page');
  } },
  { group: '처음 실행', name: '시작 페이지 배경이 움직이고, 섞기·애니메이션 선택으로 바뀜', async run(app) {
    await W(app, `(a.updateSettings({ backgroundKind: 'animated' }), a.showStartPage(true), 1)`);
    await sleep(400);
    const frames = async () => app.main.eval(`(() => { const c = document.querySelector('.start-bg'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let y = 0; y < c.height; y += 7) for (let x = 0; x < c.width; x += 7) { const i = (y * c.width + x) * 4; h = (h * 31 + d[i] * 3 + d[i + 1] * 5 + d[i + 2]) >>> 0; } return h; })()`);
    const first = await frames();
    await sleep(900);
    assert.notEqual(await frames(), first, 'the background pixels change over time (animated)');
    const before = await W(app, 'w.state.settings.animation');
    await app.main.click('[data-start="shuffle"]');
    await sleep(300);
    assert.notEqual(await W(app, 'w.state.settings.animation'), before, 'shuffle picks another animation');
    await app.main.click('[data-start="animation"][data-value="flowchart"]');
    await sleep(200);
    assert.equal(await W(app, 'w.state.settings.animation'), 'flowchart');
    assert.ok(await app.main.eval(`document.querySelector('[data-start="animation"][data-value="flowchart"]').classList.contains('active')`), 'the chip shows the choice');
  } },
  { group: '처음 실행', name: '템플릿 타일을 누르면 새 프로젝트 (시퀀스 다이어그램)', async run(app) {
    await W(app, closeAllDocs);
    await W(app, '(a.showStartPage(true), 1)');
    await sleep(200);
    await app.main.click('[data-start="template"][data-value="sequence"]');
    await sleep(600);
    assert.equal(await W(app, 'w.state.docs.length'), 1);
    assert.equal(await W(app, 'api.diagram()._type'), 'UMLSequenceDiagram');
    assert.ok(await W(app, 'api.diagram().ownedViews.length >= 4'), 'the template has views');
    assert.equal(await app.main.eval(`document.querySelector('#start-page').hidden`), true, 'the start page is gone');
    assert.ok(await app.main.eval(`document.querySelectorAll('.canvas-svg [data-view]').length >= 4`), 'drawn on the canvas');
    await noErrorPopup(app, 'template');
  } },

  // ───────────────────────── window
  { group: '창', name: '타이틀 바: 프로그램 이름과 버전', async run(app) {
    assert.equal((await mainWindow(app))?.title, TITLE);
    assert.equal(await app.main.eval('document.title'), TITLE);
  } },
  { group: '창', name: '메뉴바: 프로그램 이름 다음에 홈 버튼, 좌우 패널은 툴바 바로 아래·탭은 두 패널 사이', async run(app) {
    await freshSample(app);
    const layout = await app.main.eval(`(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const kids = [...document.querySelector('#menubar').children];
      const first = kids.find((e) => e.matches('[data-home]'));
      return { homeFirst: kids[0].matches('.app-brand') && kids[1] === first, homeIcon: Boolean(first?.querySelector('svg')), homeTitle: first?.title,
        toolbarBottom: Math.round(r('#toolbar').bottom), leftTop: Math.round(r('#left-panel').top), rightTop: Math.round(r('#right-panel').top),
        tabsLeft: Math.round(r('#tabs').left), tabsRight: Math.round(r('#tabs').right), leftRight: Math.round(r('#left-panel').right), rightLeft: Math.round(r('#right-panel').left) };
    })()`);
    assert.ok(layout.homeFirst && layout.homeIcon && layout.homeTitle, JSON.stringify(layout));
    assert.ok(Math.abs(layout.leftTop - layout.toolbarBottom) <= 1 && Math.abs(layout.rightTop - layout.toolbarBottom) <= 1, `panels start right under the toolbar ${JSON.stringify(layout)}`);
    assert.ok(layout.tabsLeft >= layout.leftRight && layout.tabsRight <= layout.rightLeft, `tabs sit between the panels ${JSON.stringify(layout)}`);
    await app.main.click('#menubar [data-home]');
    await sleep(300);
    assert.equal(await app.main.eval(`!document.querySelector('#start-page').hidden`), true, 'Home shows the start page');
    assert.deepEqual(await app.main.eval(`[getComputedStyle(document.querySelector('#left-panel')).display, getComputedStyle(document.querySelector('#right-panel')).display, document.querySelector('#start-page').getBoundingClientRect().height > 300]`), ['none', 'none', true], 'with a project open the start page fills the window (no panels over it)');
    assert.ok(await app.main.eval(`document.querySelector('#menubar [data-home]').classList.contains('current')`));
    await W(app, `(w.run('startPage'), 1)`);
    await sleep(300);
    assert.equal(await app.main.eval(`document.querySelector('#start-page').hidden`), true, 'File › Start page brings the diagram back');
    // One project at a time: its name is in the title bar; the bar has only a tab per diagram (model order), then +.
    const bar = await app.main.eval(`(() => {
      const tabs = document.querySelector('#tabs');
      const kids = [...tabs.children].map((e) => e.className.split(' ')[0]);
      const old = document.querySelector('.diagram-tabs');
      return { kids, project: document.querySelector('#menubar .app-brand-project-name')?.textContent, projectTab: Boolean(tabs.querySelector('.tab-project')), ids: [...tabs.querySelectorAll('.tab[data-diagram-tab]')].map((t) => t.dataset.diagramTab),
        active: tabs.querySelector('.tab.active')?.dataset.diagramTab, docTabs: tabs.querySelectorAll('[data-doc], [data-tab-new], [data-close-doc]').length, oldBar: Boolean(old && old.getClientRects().length) };
    })()`);
    const model = await W(app, `({ ids: M.elementsWhere(a.activeDoc().project, (e) => M.isDiagram(e)).map((d) => d._id), current: api.diagram()._id, name: a.activeDoc().project.name, docs: w.state.docs.length })`);
    assert.equal(bar.kids[0], 'tab-strip', `only the diagram tabs ${JSON.stringify(bar.kids)}`);
    assert.equal(bar.projectTab, false, 'no project tab');
    assert.ok(bar.kids.includes('tab-add'), '+ adds a diagram');
    assert.equal(model.docs, 1, 'one project');
    assert.equal(bar.project, model.name, 'the project name is in the title bar');
    assert.deepEqual(bar.ids, model.ids, 'a tab per diagram, in model order');
    assert.equal(bar.active, model.current, 'the open diagram is the active tab');
    assert.equal(bar.docTabs, 0, 'no project tabs, no new-tab / close-tab buttons');
    assert.equal(bar.oldBar, false, 'the bottom working-diagrams bar is gone');
  } },
  { group: '창', name: '두 번째 실행은 두 번째 창: 둘 다 보이고, 비켜 열리고, 시작 페이지(세션 복원 없음), 하나를 닫아도 다른 하나는 계속', async run() {
    // Two real copies without MYUMLMAKER_MULTI, sharing one lock folder and one WebView2 profile
    // (as two starts of the installed program do). Both pages are on the same debugging port.
    const lockDir = tempDir('lock');
    const profile = tempDir('profile2');
    const exe = path.join(root, 'src-tauri', 'target', 'debug', 'myumlmaker.exe');
    const port = 9700 + Math.floor(Math.random() * 200);
    const env = { ...process.env, MYUMLMAKER_LOCK_DIR: lockDir, MYUMLMAKER_CONFIG_DIR: profile, MYUMLMAKER_DATA_DIR: profile, WEBVIEW2_USER_DATA_FOLDER: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`, MYUMLMAKER_NO_OPEN: '1' };
    delete env.MYUMLMAKER_MULTI;
    delete env.ELECTRON_RUN_AS_NODE;
    const sample = path.join(root, 'samples', 'online-shop.en.myuml');
    const mains = async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json().catch(() => [])).filter((t) => t.type === 'page' && t.url.startsWith('http') && !String(t.title).startsWith('popup-'));
    const attach = async (skip) => {
      for (let i = 0; i < 250; i++) {
        const target = (await mains().catch(() => [])).find((t) => !skip.includes(t.id));
        if (target) {
          const page = await new Page(target).open();
          await page.waitFor(`Boolean(window.__myumlmaker && document.querySelector('#toolbar .tool-button') && document.querySelector('#statusbar .status-notice'))`, { timeout: 40000 });
          return page;
        }
        await sleep(150);
      }
      throw new Error('main page not found');
    };
    const visibleMain = (pid) => [].concat(JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'test', 'e2e', 'dialogs.ps1'), '-ProcessId', String(pid)], { windowsHide: true }).toString() || '[]')).filter((w) => w.title === TITLE);
    const facts = (page) => page.eval(`(async () => ({ instance: await window.__TAURI_INTERNALS__.invoke('instance_info'), docs: window.__myumlmaker.state.docs.length, start: !document.querySelector('#start-page').hidden, session: localStorage.getItem('myumlmaker.session.v1'), x: screenX, y: screenY }))()`);
    const kill = (child) => spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    const first = spawn(exe, [], { env, stdio: 'ignore' });
    let second;
    const pages = [];
    try {
      const one = await attach([]);
      pages.push(one);
      // What a later copy must not restore: session restore on, the sample "open".
      await one.eval(`(() => { const s = JSON.parse(localStorage.getItem('myumlmaker.settings.v1') || '{}'); Object.assign(s, { restoreSession: true, tutorialOffered: true, showWelcome: false }); localStorage.setItem('myumlmaker.settings.v1', JSON.stringify(s)); localStorage.setItem('myumlmaker.session.v1', JSON.stringify({ files: [${JSON.stringify(sample)}] })); return 1; })()`);
      const a = await facts(one);
      assert.deepEqual(a.instance, { first: true, others: 0 }, 'the first copy knows it is the first');
      second = spawn(exe, [], { env, stdio: 'ignore' });
      const two = await attach([one.target.id]);
      pages.push(two);
      await sleep(1200);
      const b = await facts(two);
      assert.deepEqual(b.instance, { first: false, others: 1 }, 'the second copy sees the first');
      assert.equal(first.exitCode, null, 'the first copy keeps running');
      assert.equal(second.exitCode, null, 'the second copy runs too (no "already running" message, no exit)');
      assert.equal(visibleMain(first.pid).length, 1, 'the first copy has its visible main window');
      assert.equal(visibleMain(second.pid).length, 1, 'the second copy has its own visible main window');
      assert.ok(b.x - a.x >= 24 && b.y - a.y >= 24, `the second window is offset, not over the first ${JSON.stringify([a.x, a.y, b.x, b.y])}`);
      assert.equal(b.docs, 0, 'the second copy does not restore the session');
      assert.equal(b.start, true, 'it shows the start page');
      assert.match(b.session, /online-shop/, 'and leaves the session of the first alone');
      // Closing the second (File › Exit) leaves the first running.
      await two.eval(`window.__TAURI_INTERNALS__.invoke('quit_app'), 1`).catch(() => {});
      for (let i = 0; i < 60 && second.exitCode == null; i++) await sleep(150);
      assert.notEqual(second.exitCode, null, 'the second copy ended');
      await sleep(500);
      assert.equal(first.exitCode, null, 'the first copy is still running');
      assert.equal((await facts(one)).instance.first, true, 'and still answers');
      assert.equal(visibleMain(first.pid).length, 1, 'with its window');
    } finally {
      for (const page of pages) page.close?.();
      kill(first);
      if (second) kill(second);
      await sleep(800);
    }
  } },
  { group: '창', name: '최소 창 폭: 툴바·메뉴·이름·창 단추가 가려지지 않고 툴바와 메뉴 막대는 한 줄', async run(app) {
    await freshSample(app);
    const min = await W(app, 'w.state.minWidth');
    assert.ok(min > 800, `minimum width ${min}`);
    await resize(app, 600, 500);
    await sleep(700);
    const result = await app.main.eval(`(() => {
      const items = [...document.querySelectorAll('#toolbar .tool-button, #toolbar .stepper-value, #menubar .menubar-item, #menubar .app-brand, #menubar [data-window]')];
      const bar = [...document.querySelectorAll('#menubar .menubar-item, #menubar .app-brand, #menubar [data-window]')];
      const toolbar = document.querySelector('#toolbar').getBoundingClientRect();
      const tools = [...document.querySelectorAll('#toolbar .tool-button')];
      return {
        width: innerWidth,
        hidden: items.filter((b) => { const r = b.getBoundingClientRect(); return r.right > innerWidth + 0.5 || r.left < -0.5 || r.width < 14; }).map((b) => b.dataset.command ?? b.dataset.menu ?? b.className),
        rows: new Set(tools.map((b) => Math.round(b.getBoundingClientRect().top + b.getBoundingClientRect().height / 2))).size,
        barRows: new Set(bar.map((b) => Math.round((b.getBoundingClientRect().top + b.getBoundingClientRect().bottom) / 2 / 4))).size,
        overlap: bar.some((b, i) => bar.some((c, j) => j > i && b.getBoundingClientRect().right > c.getBoundingClientRect().left + 1 && c.getBoundingClientRect().right > b.getBoundingClientRect().left + 1)),
        height: toolbar.height,
      };
    })()`);
    await resize(app, 1480, 900);
    await sleep(400);
    assert.ok(result.width >= min - 2, `window kept ${result.width}px ≥ ${min}px`);
    assert.equal(result.rows, 1, 'one toolbar row');
    assert.ok(result.barRows === 1 && !result.overlap, `the menu bar (brand, menus, window buttons) is one row without overlaps ${JSON.stringify(result)}`);
    assert.ok(result.height < 48, `${result.height}px high`);
    assert.deepEqual(result.hidden, []);
  } },
  { group: '창', name: '오른쪽 아래 모서리의 크기 조절 표시로 창 크기 바꾸기 (실제 마우스)', async run(app) {
    await resize(app, 1300, 820);
    await sleep(400);
    const grip = await app.main.eval(`(() => { const g = document.querySelector('[data-resize-grip]'); const r = g.getBoundingClientRect(); return { right: innerWidth - r.right, bottom: innerHeight - r.bottom, cursor: getComputedStyle(g).cursor, title: g.title, x: r.left + r.width / 2, y: r.top + r.height / 2, dpr: devicePixelRatio }; })()`);
    assert.ok(grip.right < 1 && grip.bottom < 1, `in the corner ${JSON.stringify(grip)}`);
    assert.equal(grip.cursor, 'nwse-resize');
    assert.ok(grip.title);
    const before = await app.main.eval('({ w: innerWidth, h: innerHeight })');
    const main = await mainWindow(app);
    // The OS resize loop (startResizeDragging) only follows the real mouse.
    const script = `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class M{[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);[DllImport("user32.dll")]public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);[DllImport("user32.dll")]public static extern bool ClientToScreen(IntPtr h,ref P p);[DllImport("user32.dll")]public static extern IntPtr WindowFromPoint(P p);[DllImport("user32.dll")]public static extern IntPtr GetAncestor(IntPtr h,uint f);public struct P{public int X,Y;}}';
$h=[IntPtr]${main.handle};[M]::keybd_event(0x12,0,0,[UIntPtr]::Zero);[M]::keybd_event(0x12,0,2,[UIntPtr]::Zero);[void][M]::SetForegroundWindow($h);Start-Sleep -Milliseconds 200;$p=New-Object M+P;$p.X=${Math.round(grip.x * grip.dpr)};$p.Y=${Math.round(grip.y * grip.dpr)};[void][M]::ClientToScreen($h,[ref]$p);
[void][M]::SetCursorPos($p.X,$p.Y);Start-Sleep -Milliseconds 150;$hit=[M]::GetAncestor([M]::WindowFromPoint($p),2);[M]::mouse_event(2,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 450;
for($i=1;$i -le 10;$i++){[void][M]::SetCursorPos($p.X+12*$i,$p.Y+8*$i);Start-Sleep -Milliseconds 40};Start-Sleep -Milliseconds 150;[M]::mouse_event(4,0,0,0,[UIntPtr]::Zero);"hit=$hit"`;
    // The press can miss when Windows keeps another window in front for a moment: try again.
    let after = before;
    const hits = [];
    void script;
    await app.main.eval(`window.__gripEvents = []; if (!window.__gripHooked) { window.__gripHooked = 1; for (const t of ['pointerdown', 'pointerup', 'mousedown']) window.addEventListener(t, (e) => window.__gripEvents.push(t + ':' + (e.target.dataset?.resizeGrip !== undefined ? 'grip' : e.target.className)), true); } 1`);
    for (let attempt = 0; attempt < 5 && !(after.w > before.w + 40); attempt++) {
      hits.push(await osMouse(app, [{ at: { x: grip.x - 20, y: grip.y - 20 } }, { at: { x: grip.x, y: grip.y }, steps: 3 }, { wait: 200 }, { probe: true }, { down: true }, { wait: 450 }, ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => ({ at: { x: grip.x + 12 * i, y: grip.y + 8 * i } })), { wait: 150 }, { up: true }]));
      await sleep(600);
      after = await app.main.eval('({ w: innerWidth, h: innerHeight })');
    }
    assert.ok(after.w > before.w + 40, `the window grew (${hits.join(' ')}; main ${main.handle}; page saw ${await app.main.eval('JSON.stringify(window.__gripEvents)')})`);
    await resize(app, 1480, 900);
    await sleep(300);
    assert.ok(after.w > before.w + 40 && after.h > before.h + 25, `window grew ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  } },
  { group: '창', name: '시스템 제목 표시줄 없음: 메뉴 막대 줄 왼쪽 끝에 아이콘·이름·버전, 오른쪽 끝에 최소화·최대화·닫기 (한 줄)', async run(app) {
    await freshSample(app);
    const row = await app.main.eval(`(() => {
      const bar = document.querySelector('#menubar'); const r = bar.getBoundingClientRect(); const box = (e) => e.getBoundingClientRect();
      const brand = bar.querySelector('.app-brand'); const controls = bar.querySelector('.window-controls');
      const buttons = [...controls.querySelectorAll('[data-window]')];
      const mid = (e) => Math.round(box(e).top + box(e).height / 2);
      return { first: bar.firstElementChild === brand, brandLeft: Math.round(box(brand).left - r.left), name: brand.querySelector('.app-brand-name')?.textContent, version: brand.querySelector('.app-brand-version')?.textContent, icon: Boolean(brand.querySelector('img.app-brand-icon')?.naturalWidth),
        drag: brand.hasAttribute('data-window-drag') && bar.querySelector('.menubar-drag').hasAttribute('data-window-drag'),
        ids: buttons.map((b) => b.dataset.window), right: Math.round(innerWidth - box(controls).right), rows: new Set([brand, ...bar.querySelectorAll('.menubar-item'), ...buttons].map(mid)).size,
        tips: buttons.every((b) => b.title && b.querySelector('svg')), top: Math.round(r.top) };
    })()`);
    assert.ok(row.first && row.brandLeft <= 12 && row.icon, `the brand starts the row ${JSON.stringify(row)}`);
    assert.equal(row.name, 'MyUMLMaker');
    assert.equal(row.version, `v${VERSION}`);
    assert.deepEqual(row.ids, ['minimize', 'maximize', 'close']);
    assert.ok(row.right <= 1 && row.tips, `window buttons flush right with icons and tooltips ${JSON.stringify(row)}`);
    assert.ok(row.rows <= 2 && row.top <= 1 && row.drag, `one row at the very top, a drag area ${JSON.stringify(row)}`);
    const main = await mainWindow(app);
    assert.equal(main.title, TITLE, 'the window title (taskbar, Alt+Tab) stays');
    const clientTop = Number(await app.shell(`${OS_INPUT};$p=New-Object MI+P;$p.X=0;$p.Y=0;[void][MI]::ClientToScreen([IntPtr]${main.handle},[ref]$p);$p.Y`));
    assert.ok(clientTop - main.top <= 10, `no system title bar above the page (client top ${clientTop}, window top ${main.top})`);
  } },
  { group: '창', name: '창 단추: 최소화 → 복원, 최대화 → (복원 단추) → 복원, 빈 메뉴 막대를 두 번 누르면 최대화 (실제 마우스)', async run(app) {
    await freshSample(app);
    await setWindow(app, 120, 80, 1300, 820);
    await sleep(500);
    const state = async () => { const w = await mainWindow(app) ?? (await app.windowInfo()).find((x) => x.owner === 0 && x.title === TITLE); return { iconic: w.iconic, zoomed: w.zoomed, button: await app.main.eval(`document.querySelector('[data-window="maximize"]').title`) }; };
    const titles = await W(app, `[w.t('window.maximize'), w.t('window.restore')]`);
    await clickOn(app.main, '[data-window="minimize"]');
    await sleep(700);
    assert.equal((await state()).iconic, true, 'minimized');
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|unminimize', { label: 'main' }).then(() => window.__TAURI_INTERNALS__.invoke('plugin:window|set_focus', { label: 'main' })).then(() => 1)`);
    await sleep(700);
    assert.equal((await state()).iconic, false, 'restored');
    await clickOn(app.main, '[data-window="maximize"]');
    await sleep(800);
    let s = await state();
    assert.ok(s.zoomed && s.button === titles[1], `maximized, the button says restore ${JSON.stringify(s)}`);
    await clickOn(app.main, '[data-window="maximize"]');
    await sleep(800);
    s = await state();
    assert.ok(!s.zoomed && s.button === titles[0], `restored ${JSON.stringify(s)}`);
    // A double click on the empty part of the menu bar (real OS mouse) maximizes, another restores.
    // (The press can miss while Windows keeps another window in front for a moment: up to three tries.)
    for (const want of [true, false]) {
      const probes = [];
      for (let attempt = 0; attempt < 5 && (await state()).zoomed !== want; attempt++) {
        probes.push(await osDoubleClick(app, await dragArea(app)));
        await sleep(900);
      }
      assert.equal((await state()).zoomed, want, `${want ? 'double click on the drag area maximizes' : 'and restores'} ${JSON.stringify(probes)}`);
    }
    await noErrorPopup(app, 'window buttons');
  } },
  { group: '창', name: '빈 메뉴 막대를 끌면 창이 움직이고, 창 가장자리·모서리를 끌면 크기가 바뀜 (제목 표시줄 없는 창, 실제 OS 마우스)', async run(app) {
    await freshSample(app);
    await setWindow(app, 120, 80, 1300, 820);
    await sleep(600);
    const before = await mainWindow(app);
    const from = await dragArea(app);
    // The press can miss while Windows keeps another window in front for a moment: try again (as the grip case does).
    let moved = before;
    for (let attempt = 0; attempt < 6 && !(moved.left - before.left >= 30 && moved.top - before.top >= 20); attempt++) {
      if (attempt) { await setWindow(app, 120, 80, 1300, 820); await sleep(500); }
      await osMouse(app, [{ at: from }, { down: true }, { wait: 250 }, ...[1, 2, 3, 4, 5, 6].map((i) => ({ at: { x: from.x + 15 * i, y: from.y + 10 * i } })), { wait: 150 }, { up: true }]);
      moved = await mainWindow(app);
    }
    // With the pointer (90, 60): a loaded machine can start the move loop a step late, but never jumps elsewhere.
    assert.ok(moved.left - before.left >= 30 && moved.left - before.left <= 105 && moved.top - before.top >= 20 && moved.top - before.top <= 75, `dragging the menu bar moves the window with the pointer (no jump) ${JSON.stringify([before.left, before.top, moved.left, moved.top])}`);
    assert.equal(moved.right - moved.left, before.right - before.left, 'same size');
    const size = () => app.main.eval('({ w: innerWidth, h: innerHeight })');
    const s0 = await size();
    // Right edge: the resize border (Windows 11 keeps it just outside the visible edge, in the shadow).
    const probes = [];
    const edgeDrag = async (from, to) => { const start = await size(); for (let attempt = 0; attempt < 6; attempt++) { probes.push(await osMouse(app, [{ at: { x: from.x - 30, y: from.y - 20 } }, { at: from, steps: 4 }, { wait: 200 }, { probe: true }, { down: true }, { wait: 400 }, ...[1, 2, 3, 4, 5, 6, 7].map((i) => ({ at: { x: from.x + ((to.x - from.x) * i) / 7, y: from.y + ((to.y - from.y) * i) / 7 } })), { wait: 250 }, { up: true }])); const now = await size(); if (now.w !== start.w || now.h !== start.h) return now; } return size(); };
    const s1 = await edgeDrag({ x: s0.w + 3, y: s0.h / 2 }, { x: s0.w + 73, y: s0.h / 2 });
    assert.ok(s1.w > s0.w + 20 && Math.abs(s1.h - s0.h) < 4, `the right edge resizes the width ${JSON.stringify([s0, s1, probes])}`);
    // Bottom-left corner.
    const s2 = await edgeDrag({ x: -3, y: s1.h + 3 }, { x: -63, y: s1.h + 53 });
    assert.ok(s2.w > s1.w + 15 && s2.h > s1.h + 15, `the corner resizes both ${JSON.stringify([s1, s2])}`);
    await setWindow(app, 120, 80, 1480, 900);
    await sleep(400);
    await noErrorPopup(app, 'move / resize');
  } },
  { group: '창', name: '닫기 단추: 저장 안 한 변경이 있으면 물어봄, 취소하면 그대로 (실제 마우스)', async run(app) {
    await freshSample(app);
    await W(app, `(a.change('op.edit', (p) => { p.name = '닫기 전'; }), 1)`);
    await clickOn(app.main, '[data-window="close"]');
    const page = await app.popup('confirm');
    assert.deepEqual(await page.eval(`[...document.querySelectorAll('[data-action="choice"]')].map((b) => b.dataset.value).sort()`), ['cancel', 'discard', 'save']);
    await clickOn(page, '[data-value="cancel"]');
    page.close();
    await sleep(600);
    assert.equal(app.process.exitCode, null, 'the app keeps running');
    assert.deepEqual(await W(app, '[w.state.docs.length, a.activeDoc().project.name, a.activeDoc().dirty]'), [1, '닫기 전', true], 'with the project and its change');
    await W(app, closeAllDocs);
  } },
  { group: '창', name: '상태 표시줄: 명령 결과·다이어그램·저장 상태·뷰 수·선택 크기·테마·언어·확대 비율', async run(app) {
    await freshSample(app);
    await W(app, `(w.run('selectAll'), w.run('copy'), a.select([]), 1)`);
    await app.main.waitFor(`document.querySelector('#statusbar .status-notice')?.textContent.trim().length > 3`, { timeout: 3000 });
    await sleep(200);
    const items = await app.main.eval(`[...document.querySelectorAll('#statusbar .status-item, #statusbar .status-notice')].map((e) => e.textContent.trim())`);
    const diagram = await W(app, 'api.diagram().name');
    assert.ok(items[0].length > 3, `the last command result is shown ${JSON.stringify(items)}`);
    assert.ok(items.includes(diagram), `the diagram name ${JSON.stringify(items)}`);
    assert.ok(items.some((text) => /수정됨|저장됨/.test(text)), 'saved state');
    assert.ok(items.some((text) => /뷰 \d+개/.test(text)), 'view count');
    assert.ok(items.some((text) => /^\d+%$/.test(text)), 'zoom percent');
    const v = await viewAt(app, 'Customer');
    await W(app, `(a.select([${JSON.stringify(v.id)}]), 1)`);
    await sleep(200);
    assert.match(await app.main.eval(`document.querySelector('#statusbar').textContent`), /\d+, \d+ · \d+ × \d+/, 'position and size of the selected view');
    await W(app, `(a.updateSettings({ showStatusBar: false }), 1)`);
    await sleep(200);
    assert.equal(await app.main.eval(`getComputedStyle(document.querySelector('#statusbar')).display`), 'none', 'the status bar can be hidden');
    await W(app, `(a.updateSettings({ showStatusBar: true }), 1)`);
  } },
  { group: '창', name: '좌우 패널: 접으면 아이콘+제목 레일, 구분자로 너비 조절, 최소 너비 (실제 마우스)', async run(app) {
    await freshSample(app);
    await app.main.click('#left-panel .panel-header [data-command="leftPanel"]');
    await sleep(300);
    const rail = await app.main.eval(`(() => { const p = document.querySelector('#left-panel'); const expand = p.querySelector('.rail-button.expand'); const title = p.querySelector('.rail-title'); const buttons = [...p.querySelectorAll('.rail-button')]; return { width: p.offsetWidth, expandFirst: buttons[0] === expand, title: title?.textContent.trim(), icons: buttons.every((b) => b.querySelector('svg')), tools: p.querySelectorAll('[data-tool]').length }; })()`);
    assert.ok(rail.width < 80 && rail.expandFirst && rail.title && rail.icons && rail.tools > 0, JSON.stringify(rail));
    await app.main.click('#left-panel .rail-button.expand');
    await app.main.click('#right-panel .panel-header [data-command="rightPanel"]');
    await sleep(300);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#right-panel .rail-title') && document.querySelector('#right-panel .rail-button.expand') === document.querySelector('#right-panel .rail-button'))`));
    await app.main.click('#right-panel .rail-button.expand');
    await sleep(300);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#explorer .tree-row'))`), 'the model explorer is back');
    const split = await app.main.center('[data-split="left"]');
    const before = await app.main.eval(`document.querySelector('#left-panel').offsetWidth`);
    await app.main.drag(split, { x: split.x + 80, y: split.y });
    await sleep(300);
    assert.ok(await app.main.eval(`document.querySelector('#left-panel').offsetWidth`) > before + 50, 'wider');
    await app.main.drag({ x: split.x + 80, y: split.y }, { x: split.x - 300, y: split.y });
    await sleep(300);
    const min = await app.main.eval(`document.querySelector('#left-panel').offsetWidth`);
    const floor = await app.main.eval(`import('/src/domain/settings.js').then((m) => m.PANEL_MIN.left)`);
    assert.ok(min >= floor - 1, `never narrower than its minimum (${min} ≥ ${floor})`);
    const clipped = await app.main.eval(`[...document.querySelectorAll('#left-panel .stencil-toggle span, #left-panel .panel-header span, #left-panel .tool-item span')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis').map((e) => e.textContent)`);
    assert.deepEqual(clipped, [], 'all labels fit at the minimum width');
    await W(app, `(a.updateSettings({ leftWidth: 240 }), 1)`);
  } },
  { group: '창', name: '다이어그램 탭이 넘치면 스크롤바 대신 오른쪽 끝에 ‹ › 버튼 (넘칠 때만, 실제 마우스)', async run(app) {
    await freshProject(app);
    const nav = () => app.main.eval(`(() => { const tabs = document.querySelector('#tabs'); const n = tabs.querySelector('.tab-nav'); const strip = tabs.querySelector('.tab-strip'); const r = n.getBoundingClientRect(); return { shown: getComputedStyle(n).display !== 'none' && r.width > 0, overflowClass: tabs.classList.contains('overflow'), overflow: strip.scrollWidth > strip.clientWidth + 1, navRight: tabs.getBoundingClientRect().right - r.right, scrollbar: strip.offsetHeight - strip.clientHeight, scroll: strip.scrollLeft, tabs: tabs.querySelectorAll('[data-diagram-tab]').length }; })()`);
    const idle = await nav();
    assert.deepEqual([idle.shown, idle.overflowClass, idle.overflow], [false, false, false], `no ‹ › while the tabs fit ${JSON.stringify(idle)}`);
    await W(app, `(() => { for (let i = 0; i < 30; i++) a.addDiagram(i % 2 ? 'UMLSequenceDiagram' : 'UMLClassDiagram'); return 1; })()`);
    await sleep(500);
    const full = await nav();
    assert.equal(full.tabs, 31, 'a tab per diagram');
    assert.ok(full.overflow && full.overflowClass && full.shown, `‹ › appear when the tabs overflow ${JSON.stringify(full)}`);
    assert.ok(full.navRight < 12 && full.scrollbar === 0, `at the right end, no scroll bar ${JSON.stringify(full)}`);
    assert.ok(full.scroll > 0, 'the new (active) tab was scrolled into view');
    const left = await app.main.center('#tabs [data-tab-scroll="-1"]');
    await app.main.realClick(left.x, left.y);
    await sleep(250);
    const back = await nav();
    assert.ok(back.scroll < full.scroll, `‹ scrolls the tabs back ${full.scroll} → ${back.scroll}`);
    const right = await app.main.center('#tabs [data-tab-scroll="1"]');
    await app.main.realClick(right.x, right.y);
    await sleep(250);
    assert.ok((await nav()).scroll > back.scroll, '› scrolls them on');
    await freshProject(app);
    assert.equal((await nav()).shown, false, 'gone again when the tabs fit');
  } },

  // ───────────────────────── one project: diagram tabs, type tabs, rulers, grid
  { group: '프로젝트·탭', name: '다이어그램 탭: 누르면 그 다이어그램, 두 번 누르면 이름 바꾸기, Ctrl+Tab·Ctrl+PageDown 으로 다음, Ctrl+W 로 프로젝트 닫기 (실제 마우스)', async run(app) {
    await freshSample(app);
    const ids = await W(app, `M.elementsWhere(a.activeDoc().project, (e) => M.isDiagram(e)).map((d) => d._id)`);
    assert.ok(ids.length >= 3, `${ids.length} diagrams`);
    const tabAt = async (id) => { await app.main.eval(`(document.querySelector('#tabs [data-diagram-tab="${id}"]').scrollIntoView({ inline: 'nearest' }), 1)`); return app.main.center(`#tabs [data-diagram-tab="${id}"]`); };
    let p = await tabAt(ids[2]);
    await app.main.realClick(p.x, p.y);
    await sleep(300);
    assert.equal(await W(app, 'api.diagram()._id'), ids[2], 'a click opens that diagram');
    assert.equal(await app.main.eval(`document.querySelector('#tabs .tab.active')?.dataset.diagramTab`), ids[2], 'and marks its tab');
    assert.ok(await app.main.eval(`document.querySelectorAll('.canvas-svg [data-view]').length > 0`), 'drawn on the canvas');
    p = await tabAt(ids[1]);
    await app.main.realClick(p.x, p.y, { clickCount: 2 });
    await app.main.waitFor(`(() => { const i = document.querySelector('#tabs .page-tab-input'); return Boolean(i && i.isConnected && i.getClientRects().length && document.activeElement === i); })()`, { timeout: 4000, message: 'a double click opens a visible name box on the tab' });
    await app.main.eval(`(document.querySelector('#tabs .page-tab-input').select(), 1)`);
    await app.main.type('바꾼 이름');
    await app.main.key('Enter');
    await sleep(300);
    assert.equal(await W(app, `a.activeDoc().index.get(${JSON.stringify(ids[1])}).name`), '바꾼 이름', 'renamed in the model');
    assert.equal(await app.main.eval(`document.querySelector('#tabs [data-diagram-tab="${ids[1]}"] .tab-name').textContent`), '바꾼 이름', 'and on the tab');
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.key('Tab', 2);
    await sleep(300);
    assert.equal(await W(app, 'api.diagram()._id'), ids[2], 'Ctrl+Tab: the next diagram tab');
    await app.main.key('Tab', 2 | 8);
    await sleep(300);
    assert.equal(await W(app, 'api.diagram()._id'), ids[1], 'Ctrl+Shift+Tab: the previous one');
    await app.main.key('PageDown', 2);
    await sleep(300);
    assert.equal(await W(app, 'api.diagram()._id'), ids[2], 'Ctrl+PageDown: the next one');
    await app.main.key('PageUp', 2);
    await sleep(300);
    assert.equal(await W(app, 'api.diagram()._id'), ids[1], 'Ctrl+PageUp: the previous one');
    assert.equal(await W(app, 'a.activeDoc().dirty'), true, 'the rename is a change');
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.key('w', 2);
    const asked = await app.popup('confirm');
    assert.equal(await asked.eval(`document.querySelector('.popup-head h2').textContent.trim()`), await W(app, `w.t('confirm.closeTitle')`), 'Ctrl+W asks about the change first');
    await asked.click('[data-value="discard"]');
    asked.close();
    await sleep(500);
    assert.equal(await W(app, 'w.state.docs.length'), 0, 'Ctrl+W closes the project');
    assert.equal(await app.main.eval(`!document.querySelector('#start-page').hidden`), true, 'and the start page shows');
    await noErrorPopup(app, 'diagram tabs');
  } },
  { group: '프로젝트·탭', name: '탭은 한 줄(다이어그램 탭 + "+", 프로젝트 이름은 제목 표시줄), + 는 새 다이어그램 창에서 고른 종류 하나만 추가 (실제 마우스·키보드)', async run(app) {
    await freshProject(app);
    const info = await app.main.eval(`(() => { const t = document.querySelector('#tabs'); const r = t.getBoundingClientRect(); const c = document.querySelector('.canvas-scroll').getBoundingClientRect(); const tops = new Set([...t.querySelectorAll('.tab')].map((e) => Math.round(e.getBoundingClientRect().top))); const add = t.querySelector('.tab-add').getBoundingClientRect(); return { rows: tops.size + (add.top >= r.top && add.bottom <= r.bottom ? 0 : 1), height: r.height, above: r.bottom <= c.top + 1, typeTabs: document.querySelectorAll('.type-tabs, .type-tab, .type-family').length }; })()`);
    assert.equal(info.typeTabs, 0, 'no diagram-type tab rows');
    assert.ok(info.rows === 1 && info.height < 44 && info.above, `one row of tabs above the canvas ${JSON.stringify(info)}`);
    const diagrams = () => W(app, `M.elementsWhere(a.activeDoc().project, (e) => M.isDiagram(e)).map((d) => d._type)`);
    const before = await diagrams();
    // Cancel: nothing is added.
    await clickOn(app.main, '#tabs .tab-add');
    let page = await app.popup('diagram');
    await expectPopupWindow(app, page, 'diagram');
    const shown = await page.eval(`({ groups: [...document.querySelectorAll('[data-action="picker-group"]')].map((b) => b.dataset.value), active: document.querySelector('.dg-card.active')?.dataset.value, cards: document.querySelectorAll('.dg-card').length, overflow: document.querySelector('.dg-grid').scrollHeight > document.querySelector('.dg-grid').clientHeight + 1 })`);
    assert.ok(shown.groups.includes('umlStructure') && shown.groups.includes('umlBehavior') && shown.groups.length >= 10, JSON.stringify(shown.groups));
    assert.equal(shown.active, 'UMLClassDiagram', 'the open diagram type is chosen at first');
    assert.ok(shown.cards >= 7 && !shown.overflow, `the group's cards fit without scrolling ${JSON.stringify(shown)}`);
    await clickOn(page, '[data-action="close"]');
    page.close();
    await sleep(400);
    assert.deepEqual(await diagrams(), before, 'Cancel adds nothing');
    // A sequence diagram: just that one is added and gets its tab; the toolbox shows its tools.
    await addDiagramWithPicker(app, 'UMLSequenceDiagram', { name: '주문 흐름' });
    assert.deepEqual(await diagrams(), [...before, 'UMLSequenceDiagram'], 'one diagram of the chosen type');
    assert.equal(await W(app, 'api.diagram().name'), '주문 흐름', 'with the typed name');
    const tools = await W(app, `w.domain.toolboxFor('UMLSequenceDiagram').flatMap(([, , , list]) => list).map((t) => t.id)`);
    const toolbox = await app.main.eval(`[...document.querySelectorAll('#left-panel .tool-item[data-tool]')].map((t) => t.dataset.tool)`);
    assert.ok(toolbox.length > 3 && toolbox.every((id) => tools.includes(id)) && toolbox.includes('UMLLifeline'), `the toolbox shows the sequence tools ${JSON.stringify(toolbox.slice(0, 8))}`);
    assert.ok(await app.main.eval(`document.querySelector('#tabs [data-diagram-tab].active')?.textContent.includes('주문 흐름')`), 'and the diagram has its tab');
    // Search and Enter: the ER diagram.
    await clickOn(app.main, '#tabs .tab-add');
    page = await app.popup('diagram');
    await page.waitFor(`document.activeElement?.dataset.draft === 'query'`, { timeout: 3000, message: 'the search box has the focus' });
    await page.type('ER');
    await page.waitFor(`[...document.querySelectorAll('.dg-card')].some((c) => c.dataset.value === 'ERDDiagram')`, { timeout: 3000, message: 'the search finds the ER diagram' });
    await clickOn(page, '[data-action="picker-type"][data-value="ERDDiagram"]');
    await clickOn(page, '[data-draft="query"]');
    await page.key('Enter');
    page.close();
    await app.main.waitFor(`window.__myumlmaker.api.diagram()?._type === 'ERDDiagram'`, { timeout: 5000, message: 'Enter creates the chosen diagram' });
    assert.deepEqual(await diagrams(), [...before, 'UMLSequenceDiagram', 'ERDDiagram']);
    // Double click on a card creates it at once.
    await clickOn(app.main, '#tabs .tab-add');
    page = await app.popup('diagram');
    await page.waitFor(`Boolean(document.querySelector('.dg-card'))`);
    await clickOn(page, '[data-action="picker-group"][data-value="mindmap"]');
    const card = await page.center('[data-action="picker-type"][data-value="MMMindmapDiagram"]');
    await page.realClick(card.x, card.y);
    await page.realClick(card.x, card.y, { clickCount: 2 });
    page.close();
    await app.main.waitFor(`window.__myumlmaker.api.diagram()?._type === 'MMMindmapDiagram'`, { timeout: 5000, message: 'a double click creates the diagram' });
    assert.equal((await diagrams()).length, before.length + 3);
    await noErrorPopup(app, 'new diagram popup');
  } },
  { group: '프로젝트·탭', name: '저장 안 한 프로젝트가 있을 때 다른 프로젝트를 열면 물어봄: 취소하면 그대로, 저장 안 함이면 바뀜 (실제 마우스)', async run(app) {
    await freshSample(app);
    await W(app, `(a.change('op.edit', (p) => { p.name = '고친 프로젝트'; }), 1)`);
    assert.equal(await W(app, 'a.activeDoc().dirty'), true);
    const id = await W(app, 'a.activeDoc().id');
    const newButton = await app.main.center('#toolbar [data-command="new"]');
    const askNew = async () => {
      await app.main.realClick(newButton.x, newButton.y);
      const page = await app.popup('confirm');
      await expectPopupWindow(app, page, 'confirm');
      const info = await page.eval(`({ title: document.querySelector('.popup-head h2').textContent.trim(), buttons: [...document.querySelectorAll('[data-action="choice"]')].map((b) => b.dataset.value).sort() })`);
      assert.equal(info.title, await W(app, `w.t('confirm.replaceTitle')`), 'asks about the unsaved changes');
      assert.deepEqual(info.buttons, ['cancel', 'discard', 'save']);
      return page;
    };
    let page = await askNew();
    await page.click('[data-value="cancel"]');
    page.close();
    await sleep(400);
    assert.deepEqual(await W(app, `[w.state.docs.length, a.activeDoc().id, a.activeDoc().project.name, a.activeDoc().dirty]`), [1, id, '고친 프로젝트', true], 'Cancel keeps the project and its changes');
    page = await askNew();
    await page.click('[data-value="discard"]');
    page.close();
    const picker = await app.popup('diagram');
    assert.equal(await picker.eval(`document.querySelector('.popup-head h2').textContent.trim()`), await W(app, `w.t('picker.projectTitle')`), 'then the first diagram of the new project is chosen');
    await clickOn(picker, '[data-action="picker-group"][data-value="umlBehavior"]');
    await clickOn(picker, '[data-action="picker-type"][data-value="UMLUseCaseDiagram"]');
    await clickOn(picker, '[data-action="picker-create"]');
    picker.close();
    await sleep(500);
    assert.deepEqual(await W(app, `M.elementsWhere(a.activeDoc().project, (e) => M.isDiagram(e)).map((d) => d._type)`), ['UMLUseCaseDiagram'], 'the new project holds just the chosen diagram');
    assert.equal(await W(app, 'w.state.docs.length'), 1, 'still one project');
    assert.notEqual(await W(app, 'a.activeDoc().id'), id, "Don't save: replaced by the new project");
    assert.equal(await W(app, 'a.activeDoc().dirty'), false);
    await noErrorPopup(app, 'replace');
  } },
  { group: '프로젝트·탭', name: '눈금자: 위·왼쪽에 보이고 보기 › 표시 › 눈금자로 숨김 (실제 클릭)', async run(app) {
    await freshSample(app);
    await W(app, `(a.updateSettings({ showRulers: true }), 1)`);
    await sleep(200);
    const rulers = () => app.main.eval(`(() => { const s = (q) => { const e = document.querySelector(q); const r = e?.getBoundingClientRect(); return e && r.width > 4 && r.height > 4 && getComputedStyle(e).display !== 'none' ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null; }; const c = document.querySelector('.canvas-scroll').getBoundingClientRect(); return { h: s('.ruler-h'), v: s('.ruler-v'), corner: s('.ruler-corner'), canvas: [Math.round(c.left), Math.round(c.top)] }; })()`);
    const on = await rulers();
    assert.ok(on.h && on.v && on.corner, `rulers shown ${JSON.stringify(on)}`);
    assert.ok(on.h[3] < 40 && on.v[2] < 40 && on.h[1] + on.h[3] <= on.canvas[1] + 1 && on.v[0] + on.v[2] <= on.canvas[0] + 1, `along the top and left of the canvas ${JSON.stringify(on)}`);
    assert.ok(await app.main.eval(`(() => { const c = document.querySelector('.ruler-h'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ink = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) ink++; return ink > 50; })()`), 'the horizontal ruler has ticks drawn');
    const toggle = async () => {
      const since = await now(app);
      await app.main.click('[data-menu="view"]');
      const menu = await menuWindow(app, since);
      let p = await menu.center('[data-id="submenu:show"]');
      await menu.realClick(p.x, p.y);
      await menu.waitFor(`Boolean(document.querySelector('.popup-menu[data-level="1"] [data-id="rulers"]'))`, { timeout: 3000 });
      await sleep(150);
      p = await menu.center('[data-id="rulers"]');
      await menu.realClick(p.x, p.y);
      menu.close();
      await sleep(500);
    };
    await toggle();
    assert.equal(await W(app, 'w.state.settings.showRulers'), false, 'View › Show › Rulers turns them off');
    const off = await rulers();
    assert.deepEqual([off.h, off.v, off.corner], [null, null, null], 'the rulers are gone');
    assert.ok(off.canvas[1] < on.canvas[1] && off.canvas[0] < on.canvas[0], 'the canvas takes their place');
    await toggle();
    assert.equal(await W(app, 'w.state.settings.showRulers'), true, 'and on again');
    await noErrorPopup(app, 'rulers');
  } },
  { group: '프로젝트·탭', name: '격자: 확대에 따라 커지다가 0.5×~2.5× 를 벗어나면 한 단계(×5) 촘촘하게/성기게, 5칸마다 진한 선, 맞춤도 따름 (실제 키보드·Ctrl+휠)', async run(app) {
    await freshSample(app);
    await W(app, `(a.updateSettings({ showGrid: true, snapToGrid: true, gridSize: 10 }), 1)`);
    const measure = () => app.main.eval(`(() => { const p = document.querySelector('#view-host pattern#grid-pattern'); const api = window.__myumlmaker.api; const zoom = window.__myumlmaker.actions.activeDoc().view.zoom[api.diagram()._id] ?? 100; const cell = api.view.gridStep(); const paths = [...p.querySelectorAll('path')]; return { zoom, cell, screen: Math.round(cell * zoom) / 100, width: Number(p.getAttribute('width')), snap: api.view.snap(13), darker: paths.length > 1 && paths[0].getAttribute('stroke') !== paths.at(-1).getAttribute('stroke') }; })()`);
    const at = {};
    for (const zoom of [40, 50, 60, 100, 200, 240, 260]) {
      // The zoom box in the toolbar, typed into like a user does.
      await clickOn(app.main, '#zoom-value');
      await app.main.eval(`(document.querySelector('#zoom-value').select(), 1)`);
      await app.main.type(String(zoom));
      await app.main.key('Enter');
      await sleep(350);
      at[zoom] = await measure();
      assert.equal(at[zoom].zoom, zoom, `zoom ${zoom} % from the zoom box`);
      assert.ok(at[zoom].width === at[zoom].cell * 5 && at[zoom].darker, `a darker line every 5 cells ${JSON.stringify(at[zoom])}`);
      assert.equal(at[zoom].snap, Math.round(13 / at[zoom].cell) * at[zoom].cell, `snapping follows the cell ${JSON.stringify(at[zoom])}`);
    }
    const cells = Object.fromEntries(Object.entries(at).map(([z, m]) => [z, m.cell]));
    assert.deepEqual(cells, { 40: 50, 50: 10, 60: 10, 100: 10, 200: 10, 240: 10, 260: 2 }, 'page cell: 10 from 50 % to 240 %, 50 below, 2 above');
    assert.ok(at[60].screen < at[100].screen && at[100].screen < at[200].screen, `the cell grows with the zoom on screen ${JSON.stringify(at)}`);
    for (const m of Object.values(at)) assert.ok(m.screen >= 5 - 0.01 && m.screen <= 25 + 0.01, `the screen cell stays between 0.5× and 2.5× ${JSON.stringify(m)}`);
    // Ctrl+wheel (real wheel) zooms in from 100 %: the grid grows with it.
    await W(app, `(a.setCanvasZoom(100), 1)`);
    await sleep(250);
    const p = await canvasPoint(app, 0.5, 0.5);
    await app.main.wheel(p.x, p.y, -120, 2);
    await sleep(350);
    const wheeled = await measure();
    assert.ok(wheeled.zoom > 100 && wheeled.screen > at[100].screen && wheeled.cell === 10, `Ctrl+wheel zooms in and the grid grows ${JSON.stringify(wheeled)}`);
    assert.ok(await app.main.eval(`(() => { const c = document.querySelector('.ruler-h'); return Boolean(c && c.width > 0); })()`) || !(await W(app, 'w.state.settings.showRulers')), 'the rulers follow the zoom');
    await W(app, `(a.setCanvasZoom(100), 1)`);
  } },

  { group: '프로젝트·탭', name: '미니맵: 보이는 영역 사각형은 100 %·25 %·오른쪽 아래 끝에서도 틀 안에 다 보이고, 끌면 포인터를 따라감 (실제 마우스)', async run(app) {
    await freshSample(app);
    await W(app, `(a.updateSettings({ showMinimap: true }), 1)`);
    const rect = () => app.main.eval(`(() => { const m = document.querySelector('.minimap'); const v = m.querySelector('.minimap-view'); const r = m.getBoundingClientRect(); const b = v.getBoundingClientRect(); const L = r.left + m.clientLeft; const T = r.top + m.clientTop; const sc = window.__myumlmaker.api.view.scroll; return { left: b.left - L, top: b.top - T, right: b.right - L, bottom: b.bottom - T, w: m.clientWidth, h: m.clientHeight, border: m.clientLeft, cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2, ratio: b.width / b.height, view: sc.clientWidth / sc.clientHeight, scroll: [sc.scrollLeft, sc.scrollTop] }; })()`);
    const inside = (r, where) => assert.ok(r.left >= -0.5 && r.top >= -0.5 && r.right <= r.w + 0.5 && r.bottom <= r.h + 0.5 && r.right - r.left >= 7.5 && r.bottom - r.top >= 7.5, `${where}: the view rectangle is inside the minimap ${JSON.stringify(r)}`);
    const place = async (zoom, where) => { await W(app, `(a.setCanvasZoom(${zoom}), 1)`); await sleep(250); await app.main.eval(`(() => { const sc = window.__myumlmaker.api.view.scroll; ${where === 'end' ? 'sc.scrollLeft = sc.scrollWidth; sc.scrollTop = sc.scrollHeight;' : 'sc.scrollLeft = 0; sc.scrollTop = 0;'} return 1; })()`); await sleep(300); return rect(); };
    const topLeft = await place(100, 'start');
    inside(topLeft, '100 % top-left');
    assert.ok(topLeft.border >= 1, 'the minimap has a visible frame');
    assert.ok(Math.abs(topLeft.ratio - topLeft.view) / topLeft.view < 0.15, `to scale ${JSON.stringify(topLeft)}`);
    inside(await place(25, 'start'), '25 %');
    inside(await place(100, 'end'), '100 % bottom-right');
    // A real drag inside the minimap (from where the sample opens): while dragging, the rectangle's centre follows the pointer.
    await freshSample(app);
    await sleep(300);
    const before = await rect();
    const from = { x: before.cx, y: before.cy };
    await app.main.mouse('mouseMoved', from.x, from.y, { button: 'none' });
    await app.main.mouse('mousePressed', from.x, from.y);
    let to = from;
    for (let i = 1; i <= 8; i++) { to = { x: from.x + 2.5 * i, y: from.y + 1.5 * i }; await app.main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: to.x, y: to.y, button: 'left', buttons: 1, pointerType: 'mouse' }); await sleep(30); }
    await sleep(200);
    const during = await rect();
    await app.main.mouse('mouseReleased', to.x, to.y);
    await sleep(300);
    inside(during, 'while dragging');
    inside(await rect(), 'after the drag');
    assert.ok(Math.abs(during.cx - to.x) < 3 && Math.abs(during.cy - to.y) < 3, `the rectangle follows the pointer ${JSON.stringify({ from, to, during })}`);
    assert.ok(during.scroll[0] > before.scroll[0] && during.scroll[1] > before.scroll[1], `the canvas scrolled ${JSON.stringify([before.scroll, during.scroll])}`);
    await W(app, `(a.setCanvasZoom(100), 1)`);
    await noErrorPopup(app, 'minimap');
  } },

  // ───────────────────────── diagram background
  { group: '다이어그램 배경', name: '서식 › 다이어그램 배경…: 무늬·무늬 칸·무늬 색을 골라 확인 → 캔버스에 무늬, 다른 다이어그램은 그대로, Ctrl+Z 로 되돌림, 팝업 검사 (한국어·영어, 실제 마우스)', async run(app) {
    await freshSample(app);
    const popupChecks = async (page, where) => {
      assert.deepEqual(await page.eval(POPUP_SCROLL_CHECK), [], `${where}: no scroll bars`);
      assert.equal(await page.eval(`(() => { const b = document.querySelector('.popup-body'); return Math.max(0, b.scrollHeight - b.clientHeight - 1); })()`), 0, `${where}: content fits`);
      assert.deepEqual(await page.eval(CLIP_CHECK), [], `${where}: nothing cut off`);
    };
    const diagram = await W(app, 'api.diagram()._id');
    const patterned = (id) => W(app, `(() => { const d = a.activeDoc().index.get(${JSON.stringify(id)}); return { kind: d.backgroundKind ?? '', pattern: d.backgroundPattern ?? '', color: d.backgroundPatternColor ?? '' }; })()`);
    const layer = () => app.main.eval(`(() => { const l = document.querySelector('#view-host .bg-layer'); return { pattern: Boolean(l?.querySelector('pattern')), html: (l?.innerHTML ?? '').length }; })()`);
    assert.equal((await layer()).pattern, false, 'no pattern at first');
    await runMenu(app, 'format', 'diagramBackground');
    let page = await app.popup('background');
    await expectPopupWindow(app, page, 'background');
    await popupChecks(page, 'background (default)');
    await clickOn(page, '[data-bg="backgroundKind"][data-value="pattern"]');
    await page.waitFor(`Boolean(document.querySelector('.bg-pattern'))`);
    await clickOn(page, '.bg-pattern[data-value="diagonal"]');
    await clickOn(page, '.bg-swatch[data-bg="backgroundPatternColor"][data-value="#90caf9"]');
    await sleep(200);
    await popupChecks(page, 'background (pattern)');
    assert.ok(await page.eval(`Boolean(document.querySelector('.bg-preview svg pattern'))`), 'the preview shows the pattern');
    await clickOn(page, '[data-action="background-apply"]');
    page.close();
    await sleep(500);
    assert.deepEqual(await patterned(diagram), { kind: 'pattern', pattern: 'diagonal', color: '#90caf9' }, 'the diagram has the pattern');
    assert.ok((await layer()).pattern, 'the canvas background layer draws the pattern');
    // Another diagram keeps its own (default) background.
    const other = await W(app, `M.elementsWhere(a.activeDoc().project, (e) => M.isDiagram(e)).map((d) => d._id).find((id) => id !== ${JSON.stringify(diagram)})`);
    await app.main.eval(`(document.querySelector('#tabs [data-diagram-tab="${other}"]').scrollIntoView({ inline: 'nearest' }), 1)`);
    await clickOn(app.main, `#tabs [data-diagram-tab="${other}"]`);
    await sleep(400);
    assert.equal(await W(app, 'api.diagram()._id'), other);
    assert.equal((await layer()).pattern, false, 'the other diagram has no pattern');
    assert.equal((await patterned(other)).kind, '', 'and keeps its background');
    await app.main.eval(`(document.querySelector('#tabs [data-diagram-tab="${diagram}"]').scrollIntoView({ inline: 'nearest' }), 1)`);
    await clickOn(app.main, `#tabs [data-diagram-tab="${diagram}"]`);
    await sleep(400);
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.key('z', 2);
    await sleep(400);
    assert.equal((await patterned(diagram)).kind, '', 'Ctrl+Z: one undo step back to the default');
    assert.equal((await layer()).pattern, false, 'and the canvas follows');
    // The popup in English too.
    await W(app, `a.updateSettings({ language: 'en' })`);
    await sleep(300);
    try {
      await runMenu(app, 'format', 'diagramBackground');
      page = await app.popup('background');
      await popupChecks(page, 'background (en, default)');
      for (const kind of ['color', 'pattern', 'image']) {
        await clickOn(page, `[data-bg="backgroundKind"][data-value="${kind}"]`);
        await sleep(200);
        await popupChecks(page, `background (en, ${kind})`);
      }
      await clickOn(page, '[data-action="close"]');
      page.close();
    } finally {
      await W(app, `a.updateSettings({ language: 'ko' })`);
    }
    assert.equal((await patterned(diagram)).kind, '', 'Cancel changes nothing');
    await noErrorPopup(app, 'diagram background');
  } },
  { group: '다이어그램 배경', name: '편집기 패널 › 배경 (선택 없음): 색 + 불투명도 50 % → PNG 로 내보내면 빈 곳의 알파 ≈ 128 (실제 마우스·키보드)', async run(app) {
    await freshSample(app);
    await W(app, `(a.select([]), w.state.explorer = [], 1)`);
    await sleep(300);
    const section = '#editors [data-bg-target]';
    if (!(await app.main.eval(`Boolean(document.querySelector('${section}'))`))) await clickOn(app.main, '#editors [data-editor-toggle="diagramBackground"]');
    await app.main.waitFor(`Boolean(document.querySelector('${section} [data-bg="backgroundKind"][data-value="color"]'))`, { message: 'the 배경 section of the diagram options' });
    await clickOn(app.main, `${section} [data-bg="backgroundKind"][data-value="color"]`);
    await sleep(300);
    await clickOn(app.main, `${section} .bg-swatch[data-bg="backgroundColor"][data-value="#e3f2fd"]`);
    await sleep(300);
    await clickOn(app.main, `${section} input[type="number"][data-bg-input="backgroundColorOpacity"]`);
    await app.main.eval(`(document.querySelector('${section} input[type="number"][data-bg-input="backgroundColorOpacity"]').select(), 1)`);
    await app.main.type('50');
    await app.main.key('Enter');
    await app.main.key('Tab');
    await sleep(400);
    const fields = await W(app, `(() => { const d = api.diagram(); return [d.backgroundKind, d.backgroundColor, d.backgroundColorOpacity]; })()`);
    assert.deepEqual(fields, ['color', '#e3f2fd', 50], 'colour at 50 %');
    const file = path.join(tempDir('bg-png'), 'half.png');
    // "With background" (not the transparent option, which leaves the background out): no white underlay any more.
    await W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(file)}], a.exportImage({ format: 'png', transparent: false, area: 'content', scale: 1, quality: 90 }).then(() => 1))`);
    const bytes = await waitFile(file);
    const pixel = await app.main.eval(`(async () => { const img = new Image(); img.src = 'data:image/png;base64,${bytes.toString('base64')}'; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return [...x.getImageData(2, 2, 1, 1).data]; })()`);
    assert.ok(Math.abs(pixel[3] - 128) <= 8, `an empty corner is half transparent ${JSON.stringify(pixel)}`);
    assert.ok(pixel[2] > pixel[0], `in the chosen blue ${JSON.stringify(pixel)}`);
    await W(app, '(a.undo(), a.undo(), a.undo(), 1)');
    await noErrorPopup(app, 'background export');
  } },

  // ───────────────────────── bottom panel: problems
  { group: '문제 패널', name: '아래 패널 켜고 끄기: 툴바 버튼·Ctrl+J·× 단추·상태 표시줄 개수 (실제 마우스·키보드)', async run(app) {
    await freshSample(app);
    await W(app, `(a.updateSettings({ showBottomPanel: true }), 1)`);
    await sleep(300);
    const shown = () => app.main.eval(`(() => { const p = document.querySelector('#bottom-panel'); const r = p.getBoundingClientRect(); return { on: getComputedStyle(p).display !== 'none' && r.height > 40, pressed: document.querySelector('#toolbar [data-command="bottomPanel"]').getAttribute('aria-pressed'), setting: window.__myumlmaker.state.settings.showBottomPanel }; })()`);
    const expect = async (on, how) => { await sleep(300); const s = await shown(); assert.deepEqual([s.on, s.setting, s.pressed], [on, on, String(on)], `${how}: ${JSON.stringify(s)}`); };
    await expect(true, 'shown by default');
    assert.ok(await app.main.eval(`(() => { const p = document.querySelector('#bottom-panel').getBoundingClientRect(); const c = document.querySelector('.canvas-scroll').getBoundingClientRect(); return p.top >= c.bottom - 1; })()`), 'under the canvas');
    await clickOn(app.main, '#toolbar [data-command="bottomPanel"]');
    await expect(false, 'the toolbar button hides it');
    await clickOn(app.main, '#toolbar [data-command="bottomPanel"]');
    await expect(true, 'and shows it');
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.key('j', 2);
    await expect(false, 'Ctrl+J hides it');
    await app.main.key('j', 2);
    await expect(true, 'Ctrl+J shows it');
    await clickOn(app.main, '#bottom-panel .problems-header [data-command="bottomPanel"]');
    await expect(false, 'the × closes it');
    await app.main.waitFor(`Boolean(document.querySelector('#statusbar [data-problems-open]'))`, { timeout: 4000, message: 'the status bar counts the problems' });
    await clickOn(app.main, '#statusbar [data-problems-open]');
    await expect(true, 'the status bar count opens it');
    await noErrorPopup(app, 'bottom panel toggle');
  } },
  { group: '문제 패널', name: '문제 패널: 중복 이름·중복 열·기본 키 없음이 1.5초 안에 나타나고, 누르면 그 다이어그램·뷰, 배지, 실행 취소하면 사라짐 (실제 마우스·키보드)', async run(app) {
    await freshSample(app);
    await W(app, `(a.updateSettings({ showBottomPanel: true }), 1)`);
    const rows = (rule) => app.main.eval(`[...document.querySelectorAll('#bottom-panel .problem-row[data-problem]')].filter((r) => r.querySelector('.cell.rule code')?.textContent === ${JSON.stringify(rule)}).map((r) => ({ key: r.dataset.problem, name: r.querySelector('.cell.el b')?.textContent, msg: r.querySelector('.cell.msg').textContent }))`);
    const waitRows = async (rule, test, message) => { const end = Date.now() + 1500 + 600; let got = []; while (Date.now() < end) { got = await rows(rule); if (test(got)) return got; await sleep(100); } throw new Error(`${message} ${JSON.stringify(got)}`); };
    const quickEdit = async (name, edit) => {
      const v = await viewAt(app, name);
      await app.main.realClick(v.x, v.y, { clickCount: 2 });
      await app.main.waitFor(`Boolean(document.querySelector('.text-editor'))`, { message: `the quick edit box opens on ${name}` });
      await edit();
      await app.main.key('Enter', 2);
      await sleep(200);
      return v;
    };
    // A class renamed to the name of another one.
    const dupBefore = (await rows('name-duplicate')).length;
    const customer = await quickEdit('Customer', async () => { await app.main.eval(`(() => { const e = document.querySelector('.text-editor'); const end = e.value.indexOf('\\n'); e.setSelectionRange(0, end < 0 ? e.value.length : end); return 1; })()`); await app.main.type('Order'); });
    const dup = await waitRows('name-duplicate', (r) => r.length > dupBefore && r.some((x) => x.name === 'Order'), 'a duplicate-name problem appears');
    assert.ok(dup.some((x) => /Order/.test(x.msg) || x.name === 'Order'), JSON.stringify(dup));
    await app.main.waitFor(`[...document.querySelectorAll('.problem-badge[data-problem-view]')].some((b) => { const v = window.__myumlmaker.domain.M.findView(window.__myumlmaker.api.diagram(), b.dataset.problemView); return v?.model && window.__myumlmaker.actions.activeDoc().index.get(v.model.$ref)?.name === 'Order'; })`, { timeout: 3000, message: 'a "!" badge on a view named Order' });
    // Clicking the row (from another diagram) opens the diagram with the view selected.
    const classDiagram = await W(app, 'api.diagram()._id');
    await openTypeByTabs(app, 'UMLUseCaseDiagram');
    const row = dup.find((x) => x.name === 'Order' && x.key.includes(customer.model)) ?? dup.at(-1);
    await clickOn(app.main, `#bottom-panel .problem-row[data-problem="${row.key}"]`);
    await sleep(500);
    assert.equal(await W(app, 'api.diagram()._id'), classDiagram, 'the row opens the diagram of the element');
    const picked = await W(app, `({ views: w.state.selection.ids.map((id) => M.findView(api.diagram(), id)).filter(Boolean).map((v) => a.activeDoc().index.get(v.model?.$ref)?.name), explorer: w.state.explorer.map((id) => a.activeDoc().index.get(id)?.name) })`);
    assert.ok(picked.views.includes('Order') && picked.explorer.includes('Order'), `and selects its view and element ${JSON.stringify(picked)}`);
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.key('z', 2);
    await waitRows('name-duplicate', (r) => r.length === dupBefore, 'Ctrl+Z: the problem goes away');
    // ERD: a duplicate column, then a missing primary key.
    await openTypeByTabs(app, 'ERDDiagram');
    const colBefore = (await rows('column-name-duplicate')).length;
    await quickEdit('customer', async () => {
      const line = await app.main.eval(`(() => { const e = document.querySelector('.text-editor'); const lines = e.value.split('\\n'); e.setSelectionRange(e.value.length, e.value.length); return lines.find((l) => /:/.test(l) && !/^PK /.test(l)) ?? lines.at(-1); })()`);
      await app.main.type(`\n${line}`);
    });
    await waitRows('column-name-duplicate', (r) => r.length > colBefore, 'a duplicate column appears');
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.key('z', 2);
    await waitRows('column-name-duplicate', (r) => r.length === colBefore, 'Ctrl+Z: the duplicate column problem goes away');
    const pkBefore = (await rows('entity-no-primary-key')).length;
    await quickEdit('customer', async () => {
      const at = await app.main.eval(`(() => { const e = document.querySelector('.text-editor'); const i = e.value.search(/(^|\\n)PK /); const at = i < 0 ? -1 : i + (e.value[i] === '\\n' ? 1 : 0); if (at >= 0) e.setSelectionRange(at, at + 3); return at; })()`);
      assert.ok(at >= 0, 'the entity has a PK column');
      await app.main.key('Delete');
    });
    await waitRows('entity-no-primary-key', (r) => r.length > pkBefore && r.some((x) => x.name === 'customer'), 'a missing primary key appears');
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.key('z', 2);
    await waitRows('entity-no-primary-key', (r) => r.length === pkBefore, 'Ctrl+Z: it goes away');
    await noErrorPopup(app, 'problems');
  } },
  { group: '문제 패널', name: '문제 패널 구분자를 끌면 높이가 바뀌고 다음 실행에도 그대로 (실제 마우스)', async run(app) {
    await freshSample(app);
    await W(app, `(a.updateSettings({ showBottomPanel: true, bottomHeight: 180 }), 1)`);
    await sleep(300);
    const height = () => app.main.eval(`Math.round(document.querySelector('#bottom-panel').getBoundingClientRect().height)`);
    const before = await height();
    const split = await app.main.center('[data-split="bottom"]');
    await app.main.drag(split, { x: split.x, y: split.y - 90 }, 12);
    await sleep(400);
    const after = await height();
    assert.ok(after > before + 60, `taller ${before} → ${after}`);
    const saved = await W(app, 'w.state.settings.bottomHeight');
    assert.ok(Math.abs(saved - after) <= 40, `the height is a setting (${saved})`);
    await sleep(300);
    await app.quit();
    await app.launch();
    await afterStart(app);
    await freshSample(app);
    assert.equal(await W(app, 'w.state.settings.bottomHeight'), saved, 'kept after a restart');
    assert.ok(Math.abs(await height() - after) <= 2, 'drawn at that height');
    await W(app, `(a.updateSettings({ bottomHeight: 180 }), 1)`);
  } },

  // ───────────────────────── toolbar
  { group: '툴바', name: '모든 버튼에 툴팁 · 한 줄 · 아이콘은 서로 다름', async run(app) {
    await freshSample(app);
    const missing = await app.main.eval(`[...document.querySelectorAll('#menubar button, #toolbar button, #toolbar input, #tabs button, #left-panel button, #right-panel .panel-header button, #right-panel .explorer-tools button, #editor-tabs button, #statusbar button, .diagram-tabs button')].filter((b) => !(b.title || '').trim()).map((b) => b.outerHTML.slice(0, 90))`);
    assert.deepEqual(missing, []);
    const rows = await app.main.eval(`new Set([...document.querySelectorAll('#toolbar .tool-button')].map((b) => { const r = b.getBoundingClientRect(); return Math.round(r.top + r.height / 2); })).size`);
    assert.equal(rows, 1, 'one row');
    const icons = await app.main.eval(`[...document.querySelectorAll('#toolbar [data-command]')].filter((b) => b.dataset.command !== 'language' && !b.matches('.split-arrow')).map((b) => b.dataset.command + '|' + (b.querySelector('svg')?.innerHTML ?? ''))`);
    const seen = new Map();
    const dupes = [];
    for (const entry of icons) {
      const [command, svg] = [entry.slice(0, entry.indexOf('|')), entry.slice(entry.indexOf('|') + 1)];
      if (seen.has(svg)) dupes.push(`${seen.get(svg)} = ${command}`);
      else seen.set(svg, command);
    }
    assert.deepEqual(dupes, [], 'no two toolbar buttons share an icon');
    assert.ok(icons.length >= 25, `${icons.length} toolbar buttons`);
  } },
  { group: '툴바', name: '프로그램 정보 버튼: 버전·빌드 정보·제작자', async run(app) {
    await closePopups(app);
    await app.main.click('#toolbar [data-command="about"]');
    const page = await app.popup('about');
    await expectPopupWindow(app, page, 'about');
    const text = await page.eval(`document.querySelector('.popup').innerText`);
    assert.match(text, /SHKWON\(knix008@naver\.com\)/);
    assert.doesNotMatch(text, /©|저작권|Copyright/, 'no copyright line');
    assert.match(text, new RegExp(VERSION.replace(/\./g, '\\.')));
    assert.match(text, /빌드|Build/);
    assert.match(text, /Tauri/);
    page.close();
    await closePopups(app);
  } },
  { group: '툴바', name: '테마 버튼은 매번 다른 테마를 무작위로', async run(app) {
    const seen = new Set();
    let previous = await W(app, 'w.state.settings.theme');
    for (let i = 0; i < 6; i++) {
      await app.main.click('#toolbar [data-command="theme"]');
      await sleep(150);
      const theme = await W(app, 'w.state.settings.theme');
      assert.notEqual(theme, previous);
      seen.add(theme);
      previous = theme;
    }
    assert.ok(seen.size >= 4, `${seen.size} different themes`);
    assert.match(await app.main.eval(`document.querySelector('#statusbar').textContent`), new RegExp(await app.main.eval(`(async () => (await import('/src/themes.js')).themeName(window.__myumlmaker.state.settings.theme, 'ko'))()`)), 'the status bar names the theme');
  } },
  { group: '툴바', name: '테마 드롭다운 (독립 창): 다크 | 라이트 두 줄, 사용자 정의, 고르면 적용', async run(app) {
    await closePopups(app);
    await app.main.click('#toolbar [data-command="themeMenu"]');
    const page = await app.popup('theme');
    await expectPopupWindow(app, page, 'theme');
    const info = await page.eval(`(() => { const cols = [...document.querySelectorAll('.picker-column')]; return { cols: cols.length, counts: cols.map((c) => c.querySelectorAll('[data-pick-theme]').length), lefts: cols.map((c) => Math.round(c.getBoundingClientRect().left)), custom: Boolean(document.querySelector('[data-pick-theme="custom"]')), second: cols[0].querySelectorAll('[data-pick-theme]')[1].dataset.pickTheme }; })()`);
    assert.equal(info.cols, 2);
    assert.deepEqual(info.counts, [20, 20]);
    assert.ok(info.lefts[0] < info.lefts[1], 'side by side');
    assert.ok(info.custom);
    await page.click(`[data-pick-theme="${info.second}"]`);
    page.close();
    await sleep(400);
    assert.equal(await W(app, 'w.state.settings.theme'), info.second);
    await W(app, `a.updateSettings({ theme: 'light' })`);
  } },
  { group: '툴바', name: '모든 테마에서 글자가 잘 보임 (실제 화면 색 대비)', async run(app) {
    await freshSample(app);
    const v = await viewAt(app, 'Customer');
    await W(app, `(a.select([${JSON.stringify(v.id)}]), 1)`);
    const ids = await app.main.eval(`(async () => { const m = await import('/src/themes.js'); return m.THEMES.map((t) => t.id); })()`);
    const problems = [];
    for (const id of ids) {
      await W(app, `a.updateSettings({ theme: '${id}' })`);
      await sleep(60);
      const bad = await app.main.eval(`(() => {
        // rgb()/rgba() are 0–255; color(srgb r g b / a) (what color-mix() computes to) is 0–1.
        const rgb = (c) => { const n = (c.match(/[\\d.]+/g) || []).map(Number); if (!c.startsWith('color(')) return n.slice(0, 4); const v = n.slice(0, 3).map((x) => x * 255); return n.length > 3 ? [...v, n[3]] : v; };
        const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
        const bg = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length === 3 || c[3] > 0.9) return c; } return rgb(getComputedStyle(document.body).backgroundColor); };
        const out = [];
        for (const el of document.querySelectorAll('.menubar-item span, .panel-header span, .tool-item span, .stencil-toggle span, .diagram-tabs .page-tab span, .status-item span, .tab-name, .tree-name, .editor-tab span, .prop-label span')) {
          if (!el.textContent.trim() || !el.getClientRects().length) continue;
          const fg = rgb(getComputedStyle(el).color);
          const a = lum(fg); const b = lum(bg(el));
          const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          if (ratio < 3) out.push((el.className || el.parentElement.className) + ' "' + el.textContent.trim().slice(0, 20) + '" ' + ratio.toFixed(2));
        }
        return out.slice(0, 3);
      })()`);
      if (bad.length) problems.push(`${id}: ${bad.join(', ')}`);
    }
    await W(app, `a.updateSettings({ theme: 'light' })`);
    assert.equal(problems.length, 0, `low contrast: ${problems.join(' | ')}`);
  } },
  { group: '툴바', name: '언어 버튼: 한국어일 때 영국 국기, 영어일 때 태극기 (같은 크기)', async run(app) {
    await W(app, `a.updateSettings({ language: 'ko' })`);
    await sleep(200);
    const flag = () => app.main.eval(`document.querySelector('[data-command="language"] svg').innerHTML.includes('012169') ? 'uk' : document.querySelector('[data-command="language"] svg').innerHTML.includes('cd2e3a') ? 'kr' : '?'`);
    const flagSize = () => app.main.eval(`(() => { const f = document.querySelector('[data-command="language"] .flag'); const box = f.getBoundingClientRect(); return [Math.round(box.width), Math.round(box.height)]; })()`);
    assert.equal(await flag(), 'uk');
    const ukSize = await flagSize();
    await app.main.click('#toolbar [data-command="language"]');
    await sleep(400);
    assert.equal(await W(app, 'w.state.settings.language'), 'en');
    assert.equal(await flag(), 'kr');
    assert.deepEqual(await flagSize(), ukSize, 'both flags are the same size');
    assert.match(await app.main.eval(`document.querySelector('[data-menu="file"]').textContent`), /File/);
    assert.match(await app.main.eval(`document.querySelector('#left-panel .panel-header').textContent`), /Toolbox/i);
    await app.main.click('#toolbar [data-command="language"]');
    await sleep(400);
    assert.match(await app.main.eval(`document.querySelector('[data-menu="file"]').textContent`), /파일/);
  } },
  { group: '툴바', name: '도구 상자 도구를 누르면 눌림 표시·상태 표시줄, Esc 로 포인터', async run(app) {
    await freshProject(app);
    await app.main.click('#left-panel [data-tool="UMLInterface"]');
    await sleep(150);
    assert.equal(await W(app, 'w.state.tool?.id'), 'UMLInterface');
    assert.equal(await app.main.eval(`document.querySelector('#left-panel [data-tool="UMLInterface"]').getAttribute('aria-pressed')`), 'true');
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#statusbar .status-item.warn'))`), 'the status bar names the tool');
    assert.equal(await app.main.eval(`document.querySelector('#toolbar [data-command="tool:pointer"]').getAttribute('aria-pressed')`), 'false');
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.key('Escape');
    await sleep(150);
    assert.equal(await W(app, 'w.state.tool'), null, 'Esc goes back to the pointer');
    assert.equal(await app.main.eval(`document.querySelector('#toolbar [data-command="tool:pointer"]').getAttribute('aria-pressed')`), 'true');
  } },
  { group: '툴바', name: '확대: −/+ 버튼·값 입력·Ctrl+마우스 휠, 상태 표시줄이 따라감', async run(app) {
    await freshSample(app);
    const z = () => W(app, `a.activeDoc().view.zoom[api.diagram()._id] ?? 100`);
    await app.main.click('#toolbar [data-command="zoomIn"]');
    await sleep(200);
    assert.equal(await z(), 125);
    assert.equal(await app.main.eval(`document.querySelector('#zoom-value').value`), '125%');
    await app.main.eval(`(() => { const i = document.querySelector('#zoom-value'); i.value = '200'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(200);
    assert.equal(await z(), 200);
    assert.match(await app.main.eval(`document.querySelector('#status-zoom').textContent`), /^200%/);
    const p = await canvasPoint(app, 0.5, 0.5);
    await app.main.wheel(p.x, p.y, 240, 2);
    await sleep(300);
    assert.ok(await z() < 200, 'Ctrl+wheel zooms out');
    await app.main.click('#toolbar [data-command="fitPage"]');
    await sleep(200);
    assert.ok(await z() <= 100, 'fit the diagram');
    await W(app, `(a.setCanvasZoom(100), 1)`);
  } },

  { group: '툴바', name: '격자·눈금자·미니맵 버튼: 누르면 꺼지고 다시 누르면 켜짐, 눌림 표시, 다음 실행에도 그대로 (실제 마우스)', async run(app) {
    await freshSample(app);
    await W(app, `(a.updateSettings({ showGrid: true, showRulers: true, showMinimap: true }), 1)`);
    await sleep(200);
    const state = () => app.main.eval(`({ grid: Boolean(document.querySelector('#view-host pattern#grid-pattern')), rulers: !document.querySelector('.canvas-view').classList.contains('no-rulers') && getComputedStyle(document.querySelector('.ruler-h')).display !== 'none', gridPressed: document.querySelector('#toolbar [data-command="grid"]').getAttribute('aria-pressed'), rulersPressed: document.querySelector('#toolbar [data-command="rulers"]').getAttribute('aria-pressed'), minimap: !document.querySelector('.minimap').hidden && getComputedStyle(document.querySelector('.minimap')).display !== 'none', minimapPressed: document.querySelector('#toolbar [data-command="minimap"]').getAttribute('aria-pressed'), tips: [document.querySelector('#toolbar [data-command="grid"]').title, document.querySelector('#toolbar [data-command="rulers"]').title, document.querySelector('#toolbar [data-command="minimap"]').title] })`);
    const on = await state();
    assert.deepEqual([on.grid, on.rulers, on.minimap, on.gridPressed, on.rulersPressed, on.minimapPressed], [true, true, true, 'true', 'true', 'true'], `both on ${JSON.stringify(on)}`);
    assert.deepEqual(on.tips, [await W(app, `w.t('action.grid')`), await W(app, `w.t('action.rulers')`), await W(app, `w.t('action.minimap')`)], 'tooltips');
    assert.ok(await app.main.eval(`(() => { const b = [...document.querySelectorAll('#toolbar [data-command]')]; const i = (c) => b.findIndex((x) => x.dataset.command === c); return i('grid') > i('fitPage') && i('rulers') === i('grid') + 1 && i('minimap') === i('rulers') + 1; })()`), 'after zoom / fit');
    await clickOn(app.main, '#toolbar [data-command="grid"]');
    await clickOn(app.main, '#toolbar [data-command="rulers"]');
    await clickOn(app.main, '#toolbar [data-command="minimap"]');
    await sleep(300);
    const off = await state();
    assert.deepEqual([off.grid, off.rulers, off.minimap, off.gridPressed, off.rulersPressed, off.minimapPressed], [false, false, false, 'false', 'false', 'false'], `both off ${JSON.stringify(off)}`);
    assert.deepEqual(await W(app, '[w.state.settings.showGrid, w.state.settings.showRulers, w.state.settings.showMinimap]'), [false, false, false]);
    await sleep(300);
    await app.quit();
    await app.launch();
    await afterStart(app);
    await freshSample(app);
    const restarted = await state();
    assert.deepEqual([restarted.grid, restarted.rulers, restarted.minimap, restarted.gridPressed, restarted.rulersPressed, restarted.minimapPressed], [false, false, false, 'false', 'false', 'false'], `still off after a restart ${JSON.stringify(restarted)}`);
    await clickOn(app.main, '#toolbar [data-command="grid"]');
    await clickOn(app.main, '#toolbar [data-command="rulers"]');
    await clickOn(app.main, '#toolbar [data-command="minimap"]');
    await sleep(300);
    const back = await state();
    assert.deepEqual([back.grid, back.rulers, back.minimap, back.gridPressed, back.rulersPressed, back.minimapPressed], [true, true, true, 'true', 'true', 'true'], `on again ${JSON.stringify(back)}`);
    await noErrorPopup(app, 'grid / rulers buttons');
  } },

  // ───────────────────────── menus
  ...MENUS.map((name) => ({ group: '메뉴', name: `메뉴 "${name}": 독립 창, 한 줄, 아이콘+이름, 모두 보임`, async run(app) {
    if (!(await W(app, 'Boolean(a.activeDoc()) && !w.state.showStart'))) await freshSample(app);
    const title = await app.main.eval(`document.querySelector('[data-menu="${name}"] span').textContent`);
    let menu;
    let info;
    // A menu closes when it loses focus (as menus do): if something took the focus meanwhile, open it once more.
    for (let attempt = 0; attempt < 2 && !info; attempt++) {
      const since = await now(app);
      await app.main.click(`[data-menu="${name}"]`);
      menu = await menuWindow(app, since);
      await menu.waitFor(`document.querySelector('.popup-menu')?.getAttribute('aria-label') === ${JSON.stringify(title)}`);
      info = await menu.eval(`(() => { const items = [...document.querySelectorAll('.menu-item')]; return { count: items.length, lefts: [...new Set(items.map((i) => Math.round(i.getBoundingClientRect().left)))], noIcon: items.filter((i) => !i.querySelector('.menu-icon svg')).length, noLabel: items.filter((i) => !i.querySelector('.menu-label').textContent.trim()).length, fits: document.documentElement.scrollHeight <= innerHeight + 2 && document.documentElement.scrollWidth <= innerWidth + 2 }; })()`);
      try {
        await expectPopupWindow(app, menu, 'menu');
        assert.ok(await W(app, `document.querySelector('[data-menu="${name}"]').classList.contains('open')`), 'the menubar shows the open menu');
      } catch (error) {
        if (attempt) throw error;
        info = null;
        menu.close();
        await sleep(400);
      }
    }
    assert.ok(info.count >= 4, `${info.count} items`);
    assert.equal(info.lefts.length, 1, 'single column');
    assert.equal(info.noIcon, 0, 'every item has an icon');
    assert.equal(info.noLabel, 0, 'every item has a label');
    assert.ok(info.fits, 'the menu window shows every item');
    await menu.key('Escape');
    await sleep(300);
    menu.close();
  } })),
  { group: '메뉴', name: '메뉴는 작은 주 창 밖으로 펼쳐짐', async run(app) {
    const min = await W(app, 'w.state.minWidth');
    await resize(app, min, 600);
    await sleep(500);
    let popup;
    let main;
    // (A menu closes when something takes the focus away for a moment: open it once more then.)
    for (let attempt = 0; attempt < 3 && !popup; attempt++) {
      const since = await now(app);
      await app.main.click('[data-menu="file"]');
      const menu = await menuWindow(app, since);
      await sleep(300);
      const windows = (await app.windowInfo()).filter((w) => w.visible);
      main = windows.find((w) => w.owner === 0 && w.title === TITLE);
      popup = windows.find((w) => w.owner === main?.handle && w.title.startsWith('파일'));
      await menu.key('Escape');
      menu.close();
      await sleep(300);
    }
    await resize(app, 1480, 900);
    await sleep(300);
    assert.ok(popup, 'menu window');
    assert.ok(popup.bottom > main.bottom || popup.top < main.top, `menu ${popup.top}..${popup.bottom} goes beyond the window ${main.top}..${main.bottom}`);
  } },
  { group: '메뉴', name: '하위 메뉴: 보기 › 다이어그램 색 구성 — 마우스를 올리면 행 옆에 열리고, 다른 행으로 가면 닫히고, 청사진 선택 (실제 마우스)', async run(app) {
    await freshSample(app);
    const since = await now(app);
    await app.main.click('[data-menu="view"]');
    const menu = await menuWindow(app, since);
    try {
      const groups = await menu.eval(`[...document.querySelectorAll('.menu-item.has-sub')].map((i) => ({ id: i.dataset.id, arrow: Boolean(i.querySelector('.menu-check svg')) }))`);
      assert.ok(groups.length >= 4 && groups.every((g) => g.arrow), JSON.stringify(groups));
      // The pointer only rests on the row: no click.
      const row = await menu.center('[data-id="submenu:diagramTheme"]');
      await menu.mouse('mouseMoved', row.x - 30, row.y, { button: 'none' });
      await menu.mouse('mouseMoved', row.x, row.y, { button: 'none' });
      await menu.waitFor(`Boolean(document.querySelector('.popup-menu[data-level="1"]'))`, { timeout: 3000 });
      await sleep(200);
      const place = await menu.eval(`(() => { const main = document.querySelector('.popup-menu[data-level="0"]').getBoundingClientRect(); const row = document.querySelector('[data-id="submenu:diagramTheme"]').getBoundingClientRect(); const sub = document.querySelector('.popup-menu[data-level="1"]'); const r = sub.getBoundingClientRect(); return { head: sub.getAttribute('aria-label'), ids: [...sub.querySelectorAll('.menu-item')].map((i) => i.dataset.id), gap: r.left - main.right, dy: r.top - row.top, open: document.querySelector('[data-id="submenu:diagramTheme"]').classList.contains('open'), win: { w: innerWidth, h: innerHeight }, right: r.right, bottom: r.bottom }; })()`);
      assert.equal(place.head, '다이어그램 색 구성');
      assert.deepEqual(place.ids, ['diagramTheme:classic', 'diagramTheme:pastel', 'diagramTheme:blueprint', 'diagramTheme:dark']);
      assert.ok(place.open && Math.abs(place.gap) < 8 && Math.abs(place.dy) < 14, `the submenu opens beside its row ${JSON.stringify(place)}`);
      assert.ok(place.right <= place.win.w && place.bottom <= place.win.h, `the menu window holds the submenu ${JSON.stringify(place)}`);
      // Resting on an ordinary row of the parent closes it again.
      const plain = await menu.center('.popup-menu[data-level="0"] .menu-item:not(.has-sub):not([disabled])');
      await menu.mouse('mouseMoved', plain.x, plain.y, { button: 'none' });
      await menu.waitFor(`!document.querySelector('.popup-menu[data-level="1"]')`, { timeout: 3000 });
      // Open again, move into it and pick 청사진.
      await menu.mouse('mouseMoved', row.x, row.y, { button: 'none' });
      await menu.waitFor(`Boolean(document.querySelector('.popup-menu[data-level="1"] [data-id="diagramTheme:blueprint"]'))`, { timeout: 3000 });
      await sleep(200);
      const leaf = await menu.center('[data-id="diagramTheme:blueprint"]');
      await menu.mouse('mouseMoved', leaf.x - 40, leaf.y, { button: 'none' });
      await menu.realClick(leaf.x, leaf.y);
    } finally {
      menu.close();
    }
    await sleep(500);
    assert.equal(await W(app, 'w.state.settings.diagramTheme'), 'blueprint');
    await W(app, `(a.updateSettings({ diagramTheme: 'classic' }), 1)`);
    await noErrorPopup(app, 'submenu');
  } },
  { group: '메뉴', name: 'BPMN 시뮬레이션: 도구 › BPMN 프로세스 시뮬레이션 (실제 클릭) → 재생해서 끝까지, 100회 분석, 닫기', async run(app) {
    await freshProject(app, 'bpmn');
    await sleep(400);
    // Opened once by hand: the command toggles, and runMenu's retry could switch it off again.
    const since = await now(app);
    await clickOn(app.main, '[data-menu="tools"]');
    const menu = await menuWindow(app, since);
    await clickOn(menu, '[data-id="bpmnSimulate"]');
    menu.close();
    await app.main.waitFor(`Boolean(document.querySelector('.sim-bar'))`, { timeout: 4000, message: 'the simulation bar' });
    await clickOn(app.main, '[data-sim="play"]');
    await app.main.waitFor(`/완료/.test(document.querySelector('[data-sim-status]')?.textContent ?? '')`, { timeout: 15000, message: 'the run completes' });
    await clickOn(app.main, '[data-sim="analyse"]');
    await sleep(400);
    assert.match(await app.main.eval(`document.querySelector('[data-sim-status]').textContent`), /완료 100 · 교착 0/);
    await clickOn(app.main, '[data-sim="close"]');
    await sleep(300);
    assert.equal(await app.main.eval(`Boolean(document.querySelector('.sim-bar'))`), false);
    await noErrorPopup(app, 'bpmn simulation');
  } },
  { group: '메뉴', name: '하위 메뉴: 마인드맵 노드의 컨텍스트 메뉴 › 관련 요소 추가 — 마우스를 올리면 열리고 하위 노드 추가 (실제 마우스)', async run(app) {
    await freshProject(app, 'mindmap');
    await sleep(400);
    const nodes = () => W(app, 'api.diagram().ownedViews.length');
    const before = await nodes();
    const point = await app.main.eval(`(() => { const g = [...document.querySelectorAll('#view-host [data-view]')].find((e) => e.getBoundingClientRect().width > 40); const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const since = await now(app);
    await app.main.realClick(point.x, point.y, { button: 'right' });
    const menu = await menuWindow(app, since);
    try {
      const row = await menu.center('[data-id^="submenu:related"]');
      await menu.mouse('mouseMoved', row.x, row.y, { button: 'none' });
      await menu.waitFor(`Boolean(document.querySelector('.popup-menu[data-level="1"] [data-id="custom:rel:childNode"]'))`, { timeout: 3000 });
      await sleep(200);
      const leaf = await menu.center('[data-id="custom:rel:childNode"]');
      await menu.realClick(leaf.x, leaf.y);
    } finally {
      menu.close();
    }
    await sleep(600);
    assert.ok(await nodes() > before, 'a child node was added');
    await noErrorPopup(app, 'mind map submenu');
  } },
  { group: '메뉴', name: '키보드: ↓ 로 항목 이동, Enter 로 실행 (편집 › 모두 선택), Esc 로 닫힘', async run(app) {
    await freshProject(app, 'classModel');
    await W(app, '(a.select([]), 1)');
    let since;
    let menu;
    // A menu closes when it loses the focus (another window popping up meanwhile): then it is opened once more.
    for (let attempt = 0; attempt < 3; attempt++) {
      since = await now(app);
      await app.main.click('[data-menu="edit"]');
      menu = await menuWindow(app, since);
      let focused = null;
      for (let i = 0; i < 20 && focused !== 'selectAll'; i++) {
        await menu.key('ArrowDown');
        focused = await menu.eval(`document.activeElement?.dataset.id ?? null`);
        assert.ok(focused && !(await menu.eval(`document.activeElement.disabled`)), 'only enabled items get the focus');
      }
      assert.equal(focused, 'selectAll');
      const open = await W(app, `w.state.openMenu === 'edit'`);
      if (open || attempt === 2) { await menu.key('Enter'); menu.close(); break; }
      menu.close();
      await closePopups(app);
    }
    await sleep(400);
    assert.equal(await W(app, 'w.state.selection.ids.length'), await W(app, 'api.diagram().ownedViews.length'), 'Enter ran "select all"');
    since = await now(app);
    await app.main.click('[data-menu="edit"]');
    menu = await menuWindow(app, since);
    await menu.key('Escape');
    menu.close();
    await sleep(400);
    const shown = (await app.windowInfo()).filter((w) => w.visible && w.title.startsWith('편집 —'));
    assert.deepEqual(shown, [], 'Esc closes the menu window');
    assert.equal(await W(app, 'w.state.openMenu'), null);
  } },
  { group: '메뉴', name: '메뉴 항목 실행: 모델 › 통계 → 확인 팝업 (실제 클릭)', async run(app) {
    await freshProject(app, 'classModel');
    const since = await now(app);
    await app.main.click('[data-menu="model"]');
    const menu = await menuWindow(app, since);
    await menu.click('[data-id="statistics"]');
    menu.close();
    const page = await app.popup('confirm');
    await expectPopupWindow(app, page, 'confirm');
    const text = await page.eval(`document.querySelector('.popup').innerText`);
    assert.match(text, /클래스: 3/, text);
    await page.click('[data-action="choice"][data-value="ok"]');
    page.close();
    await sleep(300);
    assert.equal(await app.hasPopup('confirm'), false, 'closed');
  } },

  // ───────────────────────── context menus
  { group: '컨텍스트 메뉴', name: '대상마다 다른 메뉴 (클래스·관계선·여러 개·빈 캔버스·탐색기·다이어그램 탭·도구 상자·상태 표시줄·시작 페이지), 모든 항목에 아이콘', async run(app) {
    await freshProject(app, 'classModel');
    await W(app, '(a.select([]), 1)');
    const person = await viewAt(app, '사람');
    const node = await contextMenuAt(app, person, 'class');
    const edgePoint = await W(app, `(() => { const v = api.view; const e = api.diagram().ownedViews.find((x) => x._type === 'UMLGeneralizationView'); const pts = v.ctx.routes.get(e._id).points; const i = Math.max(1, Math.floor(pts.length / 2)); const m = { x: (pts[i - 1].x + pts[i].x) / 2, y: (pts[i - 1].y + pts[i].y) / 2 }; const r = v.stage.getBoundingClientRect(); const s = v.toStage(m); return { x: r.left + s.x, y: r.top + s.y }; })()`);
    await sleep(600);
    const edge = await contextMenuAt(app, edgePoint, 'relationship');
    const student = await viewAt(app, '학생');
    await W(app, `(a.select([${JSON.stringify(person.id)}, ${JSON.stringify(student.id)}]), 1)`);
    await sleep(150);
    const multi = await contextMenuAt(app, student, 'several');
    await W(app, '(a.select([]), 1)');
    const canvas = await contextMenuAt(app, await emptyCanvasPoint(app), 'canvas');
    await W(app, `(api.explorer.expanded.add(a.activeDoc().project.ownedElements[0]._id), api.explorer.renderTree(), 1)`);
    await sleep(200);
    const element = await contextMenuAt(app, await treeRow(app, '과목'), 'explorer');
    const diagramTab = await contextMenuAt(app, await app.main.center('#tabs .tab[data-diagram-tab]'), 'diagram tab');
    const toolbox = await contextMenuAt(app, await app.main.center('#left-panel .panel-header'), 'toolbox');
    const status = await contextMenuAt(app, await app.main.center('#statusbar .status-notice'), 'status bar');
    await W(app, '(a.showStartPage(true), 1)');
    await sleep(300);
    const startPoint = await app.main.eval(`(() => { const r = document.querySelector('.start-hero p').getBoundingClientRect(); const x = r.left + 20; const y = r.top + r.height / 2; const e = document.elementFromPoint(x, y); return { x, y, at: e?.outerHTML.slice(0, 80) }; })()`);
    assert.ok(/start|<p/.test(startPoint.at), `the start page is under the pointer (${startPoint.at})`);
    const start = await contextMenuAt(app, startPoint, 'start page');
    await W(app, '(a.showStartPage(false), 1)');
    const all = [node, edge, multi, canvas, element, diagramTab, toolbox, status, start].map((m) => m.ids);
    assert.equal(new Set(all).size, all.length, `every target has its own menu:\n${all.join('\n')}`);
    assert.match(node.ids, /custom:edit.*submenu:related.*deleteFromModel/, 'class: edit, related elements, delete from model');
    assert.match(node.head, /사람/, 'the class menu is titled with the class');
    assert.match(edge.ids, /submenu:lineStyle/, 'relationship: line style');
    assert.match(multi.ids, /submenu:align/, 'several: align');
    assert.match(canvas.ids, /quickAddHere/, 'canvas: quick add');
    assert.match(element.ids, /custom:rename.*custom:codegen/, 'explorer: rename, generate code');
    assert.match(diagramTab.ids, /custom:rename.*custom:select.*prevDiagram.*nextDiagram/, 'diagram tab: rename, show in the explorer, previous / next');
    assert.doesNotMatch(diagramTab.ids, /closeDiagram|closeTab/, 'diagram tab: nothing to close (every diagram has a tab)');
    assert.match(start.ids, /shuffleBackground/, `start page: background (${start.head}: ${start.ids})`);
    await noErrorPopup(app, 'context menus');
  } },

  // ───────────────────────── popups
  ...[
    ['settings', `w.run('settings')`],
    ['about', `w.run('about')`],
    ['find', `w.run('find')`],
    ['validation', `w.popups.open('validation', { title: '검증', problems: [{ id: '', severity: 'warning', name: 'a', message: { ko: '경고', en: 'warning' } }] })`],
    ['codegen', `w.run('generateCode')`],
    ['textimport', `w.run('importText')`],
    ['image', `w.run('exportImage')`],
    ['print', `w.run('print')`],
    ['recent', `w.run('recent')`],
    ['confirm', `w.run('statistics')`],
    ['error', `a.showError('error.unexpected', new Error('테스트 오류'), 'e2e')`],
    ['requirements', `w.run('requirements')`],
    ['tracematrix', `w.run('traceMatrix')`],
    ['document', `w.run('generateDocument')`],
    ['baselines', `w.run('baselines')`],
    ['compare', `import('/src/domain/diff.js').then((d) => { const tab = a.activeDoc(); const old = JSON.parse(JSON.stringify(tab.project)); const classes = M.elementsWhere(old, (e) => e._type === 'UMLClass'); classes[0].name = 'Renamed'; classes[1].documentation = 'changed'; return w.popups.open('compare', { name: 'Baseline', subtitle: 'e2e', diff: d.compareModels(old, tab.project, { language: 'ko' }), canRestore: true }); })`],
  ].map(([kind, js]) => ({ group: '팝업', name: `"${kind}": 독립 OS 창 · 크기 고정 · 스크롤 없음 · 아이콘+제목 · 정렬 · 잘림 없음 · 이동 가능`, async run(app) {
    await freshSample(app);
    await W(app, `(${js}, 1)`);
    const page = await app.popup(kind);
    await sleep(kind === 'codegen' || kind === 'print' ? 900 : 350);
    const { popup } = await expectPopupWindow(app, page, kind);
    assert.deepEqual(await page.eval(ALIGN_CHECK), [], `${kind}: controls and buttons line up`);
    assert.deepEqual(await page.eval(CLIP_CHECK), [], `${kind}: nothing cut off`);
    const tabs = await page.eval(`[...document.querySelectorAll('.tabs .tab[data-value]')].map((t) => t.dataset.value)`);
    if (tabs.length) {
      const nav = await page.eval(`(() => { const n = document.querySelector('.tabs .tabs-nav'); if (!n) return null; const r = n.getBoundingClientRect(); return { right: document.querySelector('.tabs').getBoundingClientRect().right - r.right, buttons: n.querySelectorAll('.tabs-scroll').length, scrollbar: document.querySelector('.tabs-strip').offsetHeight - document.querySelector('.tabs-strip').clientHeight }; })()`);
      assert.ok(nav && nav.buttons === 2 && nav.right < 16 && nav.scrollbar === 0, `${kind}: < > at the right end of the tabs ${JSON.stringify(nav)}`);
    }
    for (const tab of tabs) {
      await page.eval(`document.querySelector('.tabs .tab[data-value="${tab}"]').click(); 1`);
      await sleep(tab === 'font' ? 600 : 150);
      assert.deepEqual(await page.eval(POPUP_SCROLL_CHECK), [], `${kind} › ${tab}: no scroll bars`);
      const over = await page.eval(`(() => { const b = document.querySelector('.popup-body'); return Math.max(0, b.scrollHeight - b.clientHeight - 1); })()`);
      assert.equal(over, 0, `${kind} › ${tab}: content fits (${over}px too tall)`);
      assert.deepEqual(await page.eval(ALIGN_CHECK), [], `${kind} › ${tab}: controls and buttons line up`);
      assert.deepEqual(await page.eval(CLIP_CHECK), [], `${kind} › ${tab}: nothing cut off`);
    }
    // Moved with its title bar (OS drag region) — here: the window can be placed anywhere.
    await page.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_position', { label: 'popup-${kind}', value: { Logical: { x: 20, y: 20 } } }).then(() => 1)`);
    await sleep(250);
    const moved = (await app.windowInfo()).find((w) => w.handle === popup.handle);
    assert.ok(Math.abs(moved.left - popup.left) > 5 || Math.abs(moved.top - popup.top) > 5, 'moved');
    page.close();
    await closePopups(app);
    await sleep(200);
    for (let i = 0; i < 25 && await app.hasPopup(kind); i++) await sleep(200);
    assert.equal(await app.hasPopup(kind), false, `${kind}: the window is gone after closing`);
  } })),

  // ───────────────────────── diagrams (real mouse)
  { group: '다이어그램', name: '도구 상자: 클래스를 눌러 그리고 이름 입력 → 일반화를 끌어 연결 (실제 마우스)', async run(app) {
    await freshProject(app);
    for (const [name, fy] of [['Animal', 0.25], ['Dog', 0.7]]) {
      await app.main.click('#left-panel [data-tool="UMLClass"]');
      const p = await canvasPoint(app, 0.2, fy);
      await app.main.realClick(p.x, p.y);
      await app.main.waitFor(`Boolean(document.querySelector('.text-editor'))`, { message: 'the name editor opens' });
      await app.main.type(name);
      await app.main.key('Enter', 2);
      await sleep(250);
    }
    assert.ok(await elementNamed(app, 'Animal') && await elementNamed(app, 'Dog'), 'both classes named');
    assert.ok(await app.main.eval(`document.querySelector('.canvas-svg').textContent.includes('Animal')`), 'drawn with its name');
    await app.main.click('#left-panel [data-tool="UMLGeneralization"]');
    const dog = await viewAt(app, 'Dog');
    const animal = await viewAt(app, 'Animal');
    await app.main.drag({ x: dog.x, y: dog.y }, { x: animal.x, y: animal.y }, 16);
    await sleep(300);
    const gen = await W(app, `M.elementsWhere(a.activeDoc().project, (e) => e._type === 'UMLGeneralization').map((g) => [g.source.$ref, g.target.$ref])`);
    assert.deepEqual(gen, [[dog.model, animal.model]]);
    assert.equal(await W(app, 'w.state.tool'), null, 'the tool goes back to the pointer');
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#explorer .tree-row .tree-name'))`) && await treeRow(app, 'Dog'), 'the model explorer lists the new class');
    await noErrorPopup(app, 'create');
  } },
  { group: '다이어그램', name: '도구 상자에서 캔버스로 끌어다 놓으면 그 자리에 하나 (실제 마우스)', async run(app) {
    await freshProject(app);
    const tile = await app.main.eval(`(() => { const t = document.querySelector('#left-panel .tool-item[data-tool="UMLEnumeration"]'); t.scrollIntoView({ block: 'nearest' }); const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, draggable: t.draggable }; })()`);
    assert.equal(tile.draggable, false, 'tools use the pointer, not HTML5 drag (which the desktop window takes for files)');
    const at = await canvasPoint(app, 0.5, 0.4);
    await app.main.drag(tile, at, 20);
    await sleep(400);
    const placed = await W(app, `(() => { const views = api.diagram().ownedViews; const v = views.at(-1); const b = api.view.boxOf(v._id); const p = api.view.toPage(${at.x}, ${at.y}); return { count: views.length, type: v._type, dx: Math.abs(b.x - p.x), dy: Math.abs(b.y - p.y), ghost: Boolean(document.querySelector('.stencil-ghost')) }; })()`);
    assert.equal(placed.count, 1, 'exactly one (the click after the drag adds none)');
    assert.equal(placed.type, 'UMLEnumerationView');
    assert.ok(placed.dx < 25 && placed.dy < 25, `placed where dropped ${JSON.stringify(placed)}`);
    assert.equal(placed.ghost, false, 'the drag picture is gone');
    await app.main.key('Escape');
    await noErrorPopup(app, 'drop tool');
  } },
  { group: '다이어그램', name: '끌어 옮기기는 실행 취소 한 단계 (Ctrl+Z / Ctrl+Y), 격자에 맞춤, 화살표 키로 이동 (실제 마우스)', async run(app) {
    await freshSample(app);
    const v = await viewAt(app, 'Payable');
    const steps = await W(app, 'a.activeDoc().history.undoStack.length');
    await app.main.drag({ x: v.x, y: v.y }, { x: v.x + 47, y: v.y + 31 });
    await sleep(300);
    const after = await W(app, `M.findView(api.diagram(), ${JSON.stringify(v.id)})`);
    assert.equal(after.left % 10, 0, 'snapped to the 10 px grid');
    assert.notEqual(after.left, v.box.x);
    assert.equal(await W(app, 'a.activeDoc().history.undoStack.length'), steps + 1, 'one undo step');
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.key('z', 2);
    await sleep(250);
    assert.equal(await W(app, `M.findView(api.diagram(), ${JSON.stringify(v.id)}).left`), v.box.x, 'Ctrl+Z');
    await app.main.key('y', 2);
    await sleep(250);
    assert.equal(await W(app, `M.findView(api.diagram(), ${JSON.stringify(v.id)}).left`), after.left, 'Ctrl+Y');
    await W(app, `(a.select([${JSON.stringify(v.id)}]), 1)`);
    await app.main.key('ArrowRight');
    await sleep(200);
    assert.equal(await W(app, `M.findView(api.diagram(), ${JSON.stringify(v.id)}).left`), after.left + 10, 'nudged by one grid step');
    await noErrorPopup(app, 'move');
  } },
  { group: '다이어그램', name: '빠른 편집: 두 번 눌러 이름·스테레오타입·속성·오퍼레이션을 글로 고침 (실제 더블클릭)', async run(app) {
    await freshProject(app, 'classModel');
    const v = await viewAt(app, '과목');
    await app.main.realClick(v.x, v.y, { clickCount: 2 });
    await app.main.waitFor(`Boolean(document.querySelector('.text-editor.multi'))`, { message: 'the quick edit box opens' });
    await app.main.eval(`(() => { const e = document.querySelector('.text-editor'); e.value = '«entity» Lecture\\n--\\n-title: String\\n+credits: int = 3\\n--\\n+enroll(student: 학생): boolean {query}'; return 1; })()`);
    await app.main.key('Enter', 2);
    await sleep(300);
    const lecture = await elementNamed(app, 'Lecture');
    assert.ok(lecture, 'renamed');
    assert.equal(lecture.stereotype, 'entity');
    assert.deepEqual(lecture.attributes.map((x) => [x.name, x.visibility, x.defaultValue ?? '']), [['title', 'private', ''], ['credits', 'public', '3']]);
    assert.equal(lecture.operations[0].name, 'enroll');
    assert.equal(lecture.operations[0].isQuery, true);
    assert.equal(lecture.operations[0].parameters[0].type.$ref, (await elementNamed(app, '학생'))._id, '학생 became a reference to the class');
    assert.match(await app.main.eval(`document.querySelector('.canvas-svg').textContent`), /Lecture.*title.*enroll/s, 'drawn');
    assert.equal(await app.main.eval(`document.querySelector('#editors [data-field="name"]').value`), 'Lecture', 'the property editor follows');
    await noErrorPopup(app, 'quick edit');
  } },
  { group: '다이어그램', name: '모델 탐색기: 누르면 선택·속성 표시, 다이어그램으로 끌어 놓으면 뷰와 관계 (실제 마우스)', async run(app) {
    await freshProject(app, 'classModel');
    await W(app, `(() => { const d = api.diagram(); d.ownedViews = []; a.activeDoc().touch(); api.view.update(); return 1; })()`);
    await W(app, `(api.explorer.expanded.add(a.activeDoc().project.ownedElements[0]._id), api.explorer.renderTree(), 1)`);
    await sleep(200);
    const row = await treeRow(app, '과목');
    await app.main.realClick(row.x, row.y);
    await sleep(300);
    assert.deepEqual(await W(app, 'w.state.explorer'), [(await elementNamed(app, '과목'))._id], 'selected in the explorer');
    assert.equal(await app.main.eval(`document.querySelector('#editors [data-field="name"]').value`), '과목', 'its properties are shown');
    for (const name of ['사람', '학생']) {
      const from = await treeRow(app, name);
      assert.ok(from, `${name} row`);
      const target = await canvasPoint(app, 0.3, name === '사람' ? 0.2 : 0.6);
      await app.main.drag(from, target, 14);
      await sleep(400);
    }
    const kinds = await W(app, `api.diagram().ownedViews.map((v) => v._type).sort()`);
    assert.deepEqual(kinds, ['UMLClassView', 'UMLClassView', 'UMLGeneralizationView']);
    await noErrorPopup(app, 'explorer drop');
  } },
  { group: '다이어그램', name: 'Delete 는 다이어그램에서만, Ctrl+Delete 는 확인 팝업 뒤 모델에서도 지움', async run(app) {
    await freshProject(app, 'classModel');
    await W(app, `(a.updateSettings({ confirmDelete: true }), 1)`);
    const v = await viewAt(app, '과목');
    await app.main.realClick(v.x, v.y);
    await sleep(300);
    await app.main.key('Delete');
    await sleep(300);
    assert.ok(await elementNamed(app, '과목'), 'still in the model');
    assert.equal(await W(app, `M.findView(api.diagram(), ${JSON.stringify(v.id)})`), null, 'gone from the diagram');
    await W(app, '(a.undo(), 1)');
    await W(app, `(a.select([${JSON.stringify(v.id)}]), document.querySelector('.canvas-scroll').focus(), 1)`);
    await app.main.key('Delete', 2);
    const page = await app.popup('confirm');
    await expectPopupWindow(app, page, 'confirm');
    assert.match(await page.eval(`document.querySelector('.confirm-items').textContent`), /과목/, 'names what will be deleted');
    await page.click('[data-action="choice"][data-value="delete"]');
    page.close();
    await sleep(400);
    assert.equal(await elementNamed(app, '과목'), null, 'gone from the model');
    assert.equal(await treeRow(app, '과목'), null, 'and from the explorer');
  } },
  { group: '다이어그램', name: '모든 다이어그램 종류: 도구 상자의 모든 도구로 그려도 오류 없음', async run(app) {
    await freshProject(app);
    app.main.errors.length = 0;
    const types = await W(app, 'Object.keys(w.domain.DIAGRAM_TYPES)');
    assert.ok(types.length >= 20, `${types.length} diagram types`);
    const report = [];
    for (const type of types) report.push(...await W(app, `(() => {
      const out = [];
      const type = ${JSON.stringify(type)};
      // A project per type: one project with every diagram would make each later drawing slower.
      for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true });
      a.newProject('blank');
      a.addDiagram(type);
      if (api.diagram()?._type !== type) return [type + ': not opened'];
      let i = 0;
      for (const [, , , tools] of w.domain.toolboxFor(type)) for (const tool of tools) {
        if (tool.kind !== 'node' || /Pin$/.test(tool.type)) continue;
        const r = a.createNodeAt(tool, { x: 40 + (i % 6) * 210, y: 40 + Math.floor(i / 6) * 180, w: 0, h: 0 });
        api.view?.finishEdit?.(true);
        i += 1;
        if (!r?.view) out.push(type + ':' + tool.id);
      }
      if (!document.querySelectorAll('.canvas-svg [data-view]').length) out.push(type + ': nothing drawn');
      return out;
    })()`));
    assert.deepEqual(report, []);
    assert.deepEqual(app.main.errors, [], 'no exceptions');
    await noErrorPopup(app, 'all tools');
  } },
  { group: '다이어그램', name: '시퀀스: 라이프라인 사이에 메시지를 그림 (실제 마우스)', async run(app) {
    await freshProject(app, 'sequence');
    const count = await W(app, `api.diagram().ownedViews.filter((v) => v._type === 'UMLMessageView').length`);
    await app.main.click('#left-panel [data-tool="message:asynchCall"]');
    const a1 = await viewAt(app, '클라이언트', 0.5, 190);
    const b1 = await viewAt(app, '서버', 0.5, 190);
    await app.main.drag({ x: a1.x, y: a1.y }, { x: b1.x, y: b1.y }, 12);
    await sleep(300);
    assert.equal(await W(app, `api.diagram().ownedViews.filter((v) => v._type === 'UMLMessageView').length`), count + 1, 'a new message');
    await noErrorPopup(app, 'message');
  } },

  // ───────────────────────── every diagram type, drawn with the real mouse
  drawCase('UML 구조 (클래스·패키지·객체·복합 구조·컴포넌트·배치·프로파일)', ['UMLClassDiagram', 'UMLPackageDiagram', 'UMLObjectDiagram', 'UMLCompositeStructureDiagram', 'UMLComponentDiagram', 'UMLDeploymentDiagram', 'UMLProfileDiagram']),
  drawCase('UML 행위 1 (유스케이스·활동·상태·시퀀스)', ['UMLUseCaseDiagram', 'UMLActivityDiagram', 'UMLStatechartDiagram', 'UMLSequenceDiagram']),
  drawCase('UML 행위 2 (커뮤니케이션·타이밍·상호작용 개요·정보 흐름)', ['UMLCommunicationDiagram', 'UMLTimingDiagram', 'UMLInteractionOverviewDiagram', 'UMLInformationFlowDiagram']),
  drawCase('ER·순서도·데이터 흐름·SysML 4종', ['ERDDiagram', 'FCFlowchartDiagram', 'DFDDiagram', 'SysMLRequirementDiagram', 'SysMLBlockDefinitionDiagram', 'SysMLInternalBlockDiagram', 'SysMLParametricDiagram']),
  drawCase('BPMN·C4·마인드맵·와이어프레임·AWS·Azure·GCP', ['BPMNDiagram', 'C4Diagram', 'MMMindmapDiagram', 'WFWireframeDiagram', 'AWSDiagram', 'AzureDiagram', 'GCPDiagram']),
  drawCase('새 종류 1 (네트워크·간트·WBS·타임라인·ArchiMate)', ['NetworkDiagram', 'GanttDiagram', 'WBSDiagram', 'TimelineDiagram', 'ArchiMateDiagram']),
  drawCase('새 종류 2 (JSON·YAML·EBNF·정규식)', ['JSONDiagram', 'YAMLDiagram', 'EBNFDiagram', 'RegexDiagram']),
  drawCase('새 종류 3 (사용자 스토리 맵·고객 여정 지도)', ['UserStoryMapDiagram', 'CustomerJourneyDiagram']),
  { group: '다이어그램 종류', name: '다이어그램이 많아도 탭은 한 줄이고 좁은 창에서는 ‹ › 로 옆으로 넘김; 새 다이어그램 창은 40종을 모두 고를 수 있음 (실제 마우스)', async run(app) {
    await freshSample(app);
    const count = await app.main.eval(`import('/src/domain/toolbox.js').then((m) => m.DIAGRAM_TABS.flatMap((g) => g[3]).length)`);
    assert.equal(count, 40, 'every diagram type is in a group of the popup');
    const min = await W(app, 'w.state.minWidth');
    await resize(app, min, 700);
    await sleep(700);
    try {
      const row = () => app.main.eval(`(() => { const t = document.querySelector('#tabs'); const s = t.querySelector('.tab-strip'); const tops = new Set([...t.querySelectorAll('.tab')].map((c) => Math.round(c.getBoundingClientRect().top))); return { overflow: t.classList.contains('overflow'), lines: tops.size, scroll: s.scrollLeft, height: t.getBoundingClientRect().height }; })()`);
      const before = await row();
      assert.ok(before.overflow && before.lines === 1 && before.height < 44, `the sample's tabs stay on one row at ${min}px and show ‹ › ${JSON.stringify(before)}`);
      await clickOn(app.main, '#tabs [data-tab-scroll="1"]');
      await sleep(250);
      const right = await row();
      assert.ok(right.scroll > before.scroll, `› scrolls the tabs ${before.scroll} → ${right.scroll}`);
      await clickOn(app.main, '#tabs [data-tab-scroll="-1"]');
      await sleep(250);
      assert.ok((await row()).scroll < right.scroll, '‹ scrolls them back');
      // The last group can still be reached in the popup and its diagram added.
      await addDiagramWithPicker(app, 'RegexDiagram');
      assert.equal((await row()).lines, 1, 'still one row');
    } finally {
      await resize(app, 1480, 900);
      await sleep(400);
    }
    await noErrorPopup(app, 'tab overflow');
  } },

  // ───────────────────────── requirements, traceability, baselines, documents, XMI, PlantUML
  { group: '새 기능', name: '요구사항 목록 (모델 › 요구사항): 목록에서 상태를 바꾸면 모델이 바뀜, 정렬·검색 (실제 마우스·키보드)', async run(app) {
    await freshSample(app);
    await runMenu(app, 'model', 'requirements');
    const page = await app.popup('requirements');
    await expectPopupWindow(app, page, 'requirements');
    const total = await W(app, `M.elementsWhere(a.activeDoc().project, (e) => e._type === 'SysMLRequirement').length`);
    assert.ok(total >= 3, `${total} requirements in the sample`);
    assert.equal(await page.eval(`document.querySelectorAll('.req-table tbody tr').length`), Math.min(total, 13), 'a row per requirement');
    const first = await page.eval(`(() => { const s = document.querySelector('.req-table tbody select[data-req-field="status"]'); return { id: s.dataset.id, value: s.value, last: s.selectedIndex === s.options.length - 1 }; })()`);
    // Keyboard on the focused list box (as Tab + ↓ does): the next status.
    await page.eval(`(document.querySelector('.req-table tbody select[data-req-field="status"][data-id="${first.id}"]').focus(), 1)`);
    await page.key(first.last ? 'ArrowUp' : 'ArrowDown');
    await sleep(400);
    const status = await W(app, `a.activeDoc().index.get(${JSON.stringify(first.id)}).status`);
    assert.notEqual(status, first.value, `the status changed in the model (${first.value} → ${status})`);
    assert.equal(await page.eval(`document.querySelector('select[data-req-field="status"][data-id="${first.id}"]').value`), status, 'the list shows it');
    await clickOn(page, '.req-table thead [data-action="req-sort"][data-value="name"]');
    await sleep(200);
    const names = await page.eval(`[...document.querySelectorAll('.req-table tbody .req-name')].map((c) => c.textContent)`);
    assert.deepEqual(names, [...names].sort((x, y) => x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' })), 'sorted by name');
    await clickOn(page, '.req-search input');
    await page.type(names[0]);
    await sleep(300);
    assert.ok(await page.eval(`document.querySelectorAll('.req-table tbody tr').length`) < Math.min(total, 13) || total === 1, 'the search narrows the list');
    // Undo in the main window: the list follows.
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.key('z', 2);
    await sleep(400);
    assert.equal(await W(app, `a.activeDoc().index.get(${JSON.stringify(first.id)}).status`), first.value, 'Ctrl+Z restores the status');
    const csv = path.join(tempDir('req'), 'requirements.csv');
    await W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(csv)}], 1)`);
    await clickOn(page, '[data-action="req-export"]');
    assert.match((await waitFile(csv)).toString('utf8'), /REQ|요구/, 'CSV export');
    await clickOn(page, '[data-action="close"]');
    page.close();
    await noErrorPopup(app, 'requirements');
  } },
  { group: '새 기능', name: '추적 매트릭스 (모델 › 추적 매트릭스): 칸을 누르면 관계가 생기고, Ctrl+Z 로 없어짐 (실제 마우스)', async run(app) {
    await freshSample(app);
    await runMenu(app, 'model', 'traceMatrix');
    const page = await app.popup('tracematrix');
    await expectPopupWindow(app, page, 'tracematrix');
    assert.ok(await page.eval(`document.querySelectorAll('.trace-table tbody tr').length > 1`), 'the matrix has rows');
    // A relationship kind is needed to edit: pick the first one with the keyboard.
    await page.eval(`(document.querySelector('select[data-trace="relationType"]').focus(), 1)`);
    await page.key('ArrowDown');
    await page.waitFor(`!document.querySelector('[data-action="trace-cell"][aria-disabled="true"]')`, { timeout: 5000, message: 'cells become editable' });
    const type = await page.eval(`document.querySelector('select[data-trace="relationType"]').value`);
    assert.ok(type, 'a relationship kind is chosen');
    const count = () => W(app, `M.elementsWhere(a.activeDoc().project, (e) => e._type === ${JSON.stringify(type)}).length`);
    const before = await count();
    const cell = await page.eval(`(() => { const b = [...document.querySelectorAll('.trace-table td.cell:not(.filled) [data-action="trace-cell"]')][0]; return b ? { row: b.dataset.row, col: b.dataset.col } : null; })()`);
    assert.ok(cell, 'an empty cell');
    const selector = `[data-action="trace-cell"][data-row="${cell.row}"][data-col="${cell.col}"]`;
    await clickOn(page, selector);
    await sleep(500);
    assert.equal(await count(), before + 1, `clicking the cell creates a ${type}`);
    await page.waitFor(`document.querySelector('${selector}').closest('td').classList.contains('filled')`, { timeout: 4000, message: 'the cell shows the new relationship' });
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.key('z', 2);
    await sleep(500);
    assert.equal(await count(), before, 'Ctrl+Z removes it again');
    await page.waitFor(`!document.querySelector('${selector}').closest('td').classList.contains('filled')`, { timeout: 4000, message: 'and the matrix follows' });
    await clickOn(page, selector);
    await sleep(400);
    await clickOn(page, selector);
    await sleep(400);
    assert.equal(await count(), before, 'clicking a filled cell deletes the relationship');
    await clickOn(page, '[data-action="close"]');
    page.close();
    await noErrorPopup(app, 'trace matrix');
  } },
  { group: '새 기능', name: '기준선 (모델 › 기준선): 만들기 → 클래스 이름 고침 → 비교에 "변경" → 되돌리기 (실제 마우스·키보드)', async run(app) {
    await freshSample(app);
    await runMenu(app, 'model', 'baselines');
    let page = await app.popup('baselines');
    await expectPopupWindow(app, page, 'baselines');
    await clickOn(page, '[data-bl-text="name"]');
    await page.type('기준선 E2E');
    await clickOn(page, '[data-bl-action="create"]');
    await page.waitFor(`document.querySelectorAll('.baseline-row').length === 1`, { timeout: 5000, message: 'the baseline is listed' });
    assert.match(await page.eval(`document.querySelector('.baseline-row b').textContent`), /기준선 E2E/);
    await clickOn(page, '[data-action="close"]');
    page.close();
    await sleep(300);
    // Rename a class with the quick edit (real double click, first line only).
    const v = await viewAt(app, 'Customer');
    await app.main.realClick(v.x, v.y, { clickCount: 2 });
    await app.main.waitFor(`Boolean(document.querySelector('.text-editor'))`, { message: 'the quick edit box opens' });
    await app.main.eval(`(() => { const e = document.querySelector('.text-editor'); const end = e.value.indexOf('\\n'); e.setSelectionRange(0, end < 0 ? e.value.length : end); return 1; })()`);
    await app.main.type('Client');
    await app.main.key('Enter', 2);
    await sleep(300);
    assert.equal((await elementNamed(app, 'Client'))?._id, v.model, 'renamed');
    await runMenu(app, 'model', 'baselines');
    page = await app.popup('baselines');
    await clickOn(page, '.baseline-row [data-bl-action="compare"]');
    page.close();
    page = await app.popup('compare');
    await expectPopupWindow(app, page, 'compare');
    const row = `.cmp-row[data-value="${v.model}"]`;
    await page.waitFor(`Boolean(document.querySelector('${row}.changed'))`, { timeout: 5000, message: 'the renamed class is listed as changed' });
    assert.match(await page.eval(`document.querySelector('.badge.warn').textContent`), /[1-9]/, 'the summary counts the change');
    await clickOn(page, row);
    await page.waitFor(`Boolean(document.querySelector('#cmp-detail [data-cmp-action="restore"]'))`);
    assert.match(await page.eval(`document.querySelector('#cmp-detail').textContent`), /Customer[\s\S]*Client/, 'before and after');
    await clickOn(page, '#cmp-detail [data-cmp-action="restore"]');
    await app.main.waitFor(`window.__myumlmaker.actions.activeDoc().index.get(${JSON.stringify(v.model)}).name === 'Customer'`, { timeout: 5000, message: 'restored from the baseline' });
    await page.waitFor(`!document.querySelector('${row}.changed')`, { timeout: 5000, message: 'the comparison is up to date' });
    await clickOn(page, '[data-action="close"]');
    page.close();
    await noErrorPopup(app, 'baselines');
  } },
  { group: '새 기능', name: '파일과 비교 (모델 › 파일과 비교): 저장한 뒤 바꾼 것이 "변경"으로', async run(app) {
    await freshSample(app);
    const file = path.join(tempDir('compare'), 'before.myuml');
    fs.writeFileSync(file, await W(app, 'a.activeDoc().text()'));
    await W(app, `(a.change('op.edit', (p) => { M.elementsWhere(p, (e) => e.name === 'Order')[0].name = 'Purchase'; }), 1)`);
    await W(app, `(window.__myumlmakerOpenPicks = [${JSON.stringify(file)}], 1)`);
    await runMenu(app, 'model', 'compareFile');
    const page = await app.popup('compare');
    const id = (await elementNamed(app, 'Purchase'))._id;
    await page.waitFor(`Boolean(document.querySelector('.cmp-row.changed[data-value="${id}"]'))`, { timeout: 8000, message: 'the renamed element is changed' });
    await clickOn(page, '[data-action="close"]');
    page.close();
    await noErrorPopup(app, 'compare file');
  } },
  { group: '새 기능', name: '문서 생성 (도구 › 문서 생성): Word(.docx) 를 임시 폴더에 → ZIP 안에 word/document.xml (실제 마우스)', async run(app) {
    await freshSample(app);
    const dir = tempDir('document');
    const docx = path.join(dir, 'report.docx');
    await W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(docx)}], 1)`);
    await runMenu(app, 'tools', 'generateDocument');
    // The first time, the document window is created from scratch (slow while the full suite runs);
    // if it is not up yet, choose the menu item once more (still through the real menu).
    let page = await app.popup('document', 20000).catch(async () => {
      await runMenu(app, 'tools', 'generateDocument');
      return app.popup('document', 30000);
    });
    await expectPopupWindow(app, page, 'document');
    await clickOn(page, '[data-doc-seg="format"][data-value="docx"]');
    await clickOn(page, '[data-doc-action="generate"]');
    page.close();
    const bytes = await waitFile(docx, 300);
    assert.equal(bytes.subarray(0, 2).toString('latin1'), 'PK', 'a ZIP');
    assert.ok(bytes.includes(Buffer.from('word/document.xml')) && bytes.includes(Buffer.from('[Content_Types].xml')), 'a Word document');
    // HTML too (the choice is remembered: HTML is picked again here).
    const html = path.join(dir, 'report.html');
    await W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(html)}], 1)`);
    await runMenu(app, 'tools', 'generateDocument');
    page = await app.popup('document');
    assert.equal(await page.eval(`document.querySelector('[data-doc-seg="format"].active').dataset.value`), 'docx', 'the last format is remembered');
    await clickOn(page, '[data-doc-seg="format"][data-value="html"]');
    await clickOn(page, '[data-doc-action="generate"]');
    page.close();
    assert.match((await waitFile(html, 200)).toString('utf8'), /<html[\s\S]*<svg/i, 'an HTML document with the diagrams');
    await noErrorPopup(app, 'document');
  } },
  { group: '새 기능', name: 'XMI (파일 › 내보내기 › XMI → 가져오기 › XMI): 같은 다이어그램 수·클래스', async run(app) {
    await freshProject(app, 'classModel');
    await W(app, `(a.addDiagram('UMLUseCaseDiagram'), a.addDiagram('UMLSequenceDiagram'), 1)`);
    const summary = () => W(app, `({ diagrams: M.allDiagrams(a.activeDoc().project).length, classes: M.elementsWhere(a.activeDoc().project, (e) => e._type === 'UMLClass').map((e) => e.name).sort() })`);
    const before = await summary();
    const file = path.join(tempDir('xmi'), 'model.xmi');
    await W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(file)}], 1)`);
    await runMenu(app, 'file', 'submenu:exportTo', 'exportXmi');
    const text = (await waitFile(file, 80)).toString('utf8');
    assert.match(text, /<xmi:XMI[\s\S]*uml:Model/, 'an XMI file');
    assert.match(text, /EAStub|Enterprise Architect|xmi:Extension/, 'with the Enterprise Architect extension (diagrams)');
    await W(app, `(window.__myumlmakerOpenPicks = [${JSON.stringify(file)}], 1)`);
    await runMenu(app, 'file', 'submenu:importFrom', 'importXmi');
    // The project was changed (diagrams added): replacing it asks first.
    const ask = await app.popup('confirm', 4000).catch(() => null);
    if (ask) { await clickOn(ask, '[data-value="discard"]'); ask.close(); }
    await app.main.waitFor(`window.__myumlmaker.actions.activeDoc()?.path === null && /model/.test(window.__myumlmaker.actions.activeDoc().project.name ?? '') || window.__myumlmaker.state.docs.length === 1 && window.__myumlmaker.actions.activeDoc().path === null`, { timeout: 10000 });
    await sleep(400);
    assert.deepEqual(await summary(), before, 'the same diagrams and classes after the round trip');
    await noErrorPopup(app, 'xmi');
  } },
  { group: '새 기능', name: 'PlantUML 붙여넣기 (Ctrl+V): @startgantt 텍스트 → 가져오기 창 → 간트 다이어그램 (실제 키보드)', async run(app) {
    await freshProject(app);
    const saved = await app.main.eval(`window.__TAURI_INTERNALS__.invoke('clipboard_read').catch(() => '')`);
    const gantt = '@startgantt\n[Design] lasts 5 days\n[Build] lasts 10 days\n[Build] starts at [Design]\'s end\n[Release] happens at [Build]\'s end\n@endgantt';
    try {
      // The system clipboard can be busy for a moment (another program reading it): try again.
      await app.main.eval(`(async () => { for (let i = 0; ; i++) { try { await window.__TAURI_INTERNALS__.invoke('clipboard_write', { text: ${JSON.stringify(gantt)} }); return 1; } catch (error) { if (i >= 9) throw error; await new Promise((r) => setTimeout(r, 200)); } } })()`);
      await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
      await app.main.key('v', 2);
      const page = await app.popup('textimport');
      await page.waitFor(`document.querySelector('[data-draft="text"]').value.includes('@startgantt')`, { message: 'the pasted text is in the import window' });
      assert.equal(await page.eval(`document.querySelector('[data-draft-segment="format"].active').dataset.value`), 'plantuml');
      await clickOn(page, '[data-action="text-apply"]');
      page.close();
      await app.main.waitFor(`window.__myumlmaker.api.diagram()?._type === 'GanttDiagram'`, { timeout: 8000, message: 'a Gantt diagram opens' });
      assert.ok(await countOf(app, 'GanttTask') >= 2, 'with its tasks');
      assert.ok(await app.main.eval(`document.querySelector('.canvas-svg').textContent.includes('Build')`), 'drawn');
    } finally {
      if (saved) await app.main.eval(`window.__TAURI_INTERNALS__.invoke('clipboard_write', { text: ${JSON.stringify(saved)} }).then(() => 1)`).catch(() => {});
    }
    await noErrorPopup(app, 'paste PlantUML');
  } },
  { group: '새 기능', name: 'PlantUML 가져오기 창: 예제 드롭다운의 21종 모두 (UML 11 + 간트·WBS·연대기·ArchiMate·nwdiag·JSON·YAML·EBNF·정규식·Salt) + 직접 입력, 경고는 팝업으로 (실제 마우스)', async run(app) {
    await freshProject(app);
    const importText = async (pick) => {
      await W(app, `(w.run('importText'), 1)`);
      const page = await app.popup('textimport');
      await clickOn(page, '[data-draft-segment="format"][data-value="plantuml"]');
      await sleep(150);
      await pick(page);
      await page.waitFor(`!document.querySelector('[data-action="text-apply"]').disabled`);
      const diagrams = await W(app, 'M.allDiagrams(a.activeDoc().project).length');
      await clickOn(page, '[data-action="text-apply"]');
      page.close();
      await app.main.waitFor(`window.__myumlmaker.domain.M.allDiagrams(window.__myumlmaker.actions.activeDoc().project).length > ${diagrams}`, { timeout: 8000, message: 'a diagram is added' });
      await sleep(250);
      return W(app, 'api.diagram()._type');
    };
    const kinds = await (async () => { await W(app, `(w.run('importText'), 1)`); const page = await app.popup('textimport'); await clickOn(page, '[data-draft-segment="format"][data-value="plantuml"]'); await sleep(200); const list = await page.eval(`[...document.querySelectorAll('select[data-text-sample] option')].map((o) => o.value).filter(Boolean)`); await clickOn(page, '[data-action="close"]'); page.close(); await sleep(300); return list; })();
    assert.ok(kinds.length >= 21, `21 PlantUML examples in the dropdown ${JSON.stringify(kinds)}`);
    const got = {};
    for (const kind of kinds) got[kind] = await importText((page) => pickSample(page, kind));
    const typed = {
      wbs2: '@startwbs\n* Shop\n** Design\n*** Pages\n** Build\n@endwbs',
      json2: '@startjson\n{ "id": 1, "tags": ["a", "b"] }\n@endjson',
      mindmap2: '@startmindmap\n* Root\n** Child\n@endmindmap',
    };
    for (const [kind, text] of Object.entries(typed)) got[kind] = await importText(async (page) => { await clickOn(page, '[data-draft="text"]'); await page.type(text); });
    const expect = { class: 'UMLClassDiagram', sequence: 'UMLSequenceDiagram', usecase: 'UMLUseCaseDiagram', activity: 'UMLActivityDiagram', state: 'UMLStatechartDiagram', component: 'UMLComponentDiagram', deployment: 'UMLDeploymentDiagram', timing: 'UMLTimingDiagram', er: 'ERDDiagram', mindmap: 'MMMindmapDiagram', object: 'UMLObjectDiagram', gantt: 'GanttDiagram', wbs: 'WBSDiagram', chronology: 'TimelineDiagram', archimate: 'ArchiMateDiagram', nwdiag: 'NetworkDiagram', json: 'JSONDiagram', yaml: 'YAMLDiagram', ebnf: 'EBNFDiagram', regex: 'RegexDiagram', salt: 'WFWireframeDiagram', wbs2: 'WBSDiagram', json2: 'JSONDiagram', mindmap2: 'MMMindmapDiagram' };
    for (const [kind, type] of Object.entries(expect)) if (got[kind]) assert.equal(got[kind], type, `${kind} → ${type} ${JSON.stringify(got)}`);
    // Something the importer does not read is listed in a warnings popup (not dropped silently).
    await W(app, `(w.run('importText'), 1)`);
    const page = await app.popup('textimport');
    await clickOn(page, '[data-draft-segment="format"][data-value="plantuml"]');
    await clickOn(page, '[data-draft="text"]');
    await page.type('@startuml\n!include common.puml\nclass Warned\n@enduml');
    await clickOn(page, '[data-action="text-apply"]');
    page.close();
    const warnings = await app.popup('validation');
    assert.match(await warnings.eval(`document.querySelector('.popup').innerText`), /include/i, 'the warnings popup names the skipped line');
    assert.ok(await elementNamed(app, 'Warned'), 'the rest was imported');
    await clickOn(warnings, '[data-action="close"]');
    warnings.close();
    await noErrorPopup(app, 'PlantUML import');
  } },
  { group: '새 기능', name: 'C++ 역공학: .h·.cpp 를 끌어다 놓으면 클래스·상속·멤버', async run(app) {
    await freshProject(app);
    const dir = tempDir('cpp');
    const header = path.join(dir, 'shape.h');
    const source = path.join(dir, 'shape.cpp');
    fs.writeFileSync(header, 'namespace geo {\nclass Shape {\npublic:\n  virtual double area() const = 0;\nprotected:\n  int id;\n};\nclass Circle : public Shape {\npublic:\n  double area() const override;\nprivate:\n  double radius;\n};\n}\n');
    fs.writeFileSync(source, '#include "shape.h"\nnamespace geo {\ndouble Circle::area() const { return 3.14 * radius * radius; }\n}\n');
    await W(app, `a.handleDroppedPaths([${JSON.stringify(header)}, ${JSON.stringify(source)}]).then(() => 1)`);
    await app.main.waitFor(`Boolean([...window.__myumlmaker.actions.activeDoc().index.byId.values()].find((e) => e.name === 'Circle'))`, { timeout: 10000, message: 'the C++ classes are read' });
    const circle = await elementNamed(app, 'Circle');
    const shape = await elementNamed(app, 'Shape');
    assert.ok(shape && circle, 'both classes');
    assert.ok(circle.attributes.some((x) => x.name === 'radius' && x.visibility === 'private'), 'a private member');
    assert.ok(shape.operations.some((o) => o.name === 'area'), 'an operation');
    assert.ok(await W(app, `M.elementsWhere(a.activeDoc().project, (e) => e._type === 'UMLGeneralization').some((g) => g.source.$ref === ${JSON.stringify(circle._id)} && g.target.$ref === ${JSON.stringify(shape._id)})`), 'Circle → Shape');
    await noErrorPopup(app, 'C++');
  } },

  // ───────────────────────── model tools
  { group: '모델 도구', name: '찾기 팝업: 이름을 찾아 결과를 누르면 그 요소로 감', async run(app) {
    await freshSample(app);
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.key('f', 2);
    const page = await app.popup('find');
    await page.eval(`(() => { const i = document.querySelector('[data-draft="text"]'); i.value = 'Order'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
    await page.click('[data-action="find-run"]');
    await page.waitFor(`document.querySelectorAll('.result-row').length > 0`);
    const first = await page.eval(`[...document.querySelectorAll('.result-row')].find((r) => r.querySelector('b').textContent === 'Order').dataset.value`);
    await page.eval(`([...document.querySelectorAll('.result-row')].find((r) => r.querySelector('b').textContent === 'Order').click(), 1)`);
    await sleep(500);
    assert.deepEqual(await W(app, 'w.state.explorer'), [first], 'the found element is selected');
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#explorer .tree-row.selected'))`), 'and shown in the explorer');
    page.close();
    await closePopups(app);
    // The toolbar's Find button (end of the edit group) opens the same popup (real click).
    const button = await app.main.eval(`(() => { const b = document.querySelector('#toolbar [data-command="find"]'); if (!b) return null; const prev = b.previousElementSibling; return { title: b.title, icon: Boolean(b.querySelector('svg')), afterDelete: Boolean(document.querySelector('#toolbar [data-command="deleteFromModel"]')) && (prev?.dataset.command === 'deleteFromModel' || b.parentElement.querySelector('[data-command="deleteFromModel"]') !== null) }; })()`);
    assert.ok(button?.icon && /Ctrl\+F/.test(button.title), `toolbar Find button with icon and tooltip ${JSON.stringify(button)}`);
    assert.ok(button.afterDelete, 'in the edit group, after Delete from model');
    await clickOn(app.main, '#toolbar [data-command="find"]');
    const viaToolbar = await app.popup('find');
    assert.ok(await viaToolbar.eval(`Boolean(document.querySelector('[data-draft="text"]'))`), 'the find popup opened from the toolbar');
    viaToolbar.close();
    await closePopups(app);
  } },
  { group: '모델 도구', name: '검증 (툴바 버튼): 문제를 팝업으로, 상태 표시줄에 개수, 누르면 그 요소', async run(app) {
    await freshProject(app, 'classModel');
    await W(app, `(a.change('op.edit', (p) => { M.elementsWhere(p, (e) => e.name === '과목')[0].name = ''; }), 1)`);
    await app.main.click('#toolbar [data-command="validate"]');
    const page = await app.popup('validation');
    await page.waitFor(`document.querySelectorAll('.result-row:not([disabled])').length > 0`);
    assert.match(await page.eval(`document.querySelector('.result-list').innerText`), /이름/);
    assert.ok(await W(app, 'w.state.validation.errors >= 1'));
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#statusbar [data-command="validate"].error-count'))`), 'the status bar counts the errors');
    await page.click('.result-row:not([disabled])');
    await sleep(400);
    assert.equal(await W(app, 'w.state.explorer.length'), 1, 'the problem element is selected');
    page.close();
    await closePopups(app);
  } },
  { group: '모델 도구', name: '코드 생성 팝업: Java 미리 보기 → Python → ZIP 으로 생성', async run(app) {
    await freshProject(app, 'classModel');
    await W(app, '(a.select([]), w.state.explorer = [], 1)');
    await app.main.click('#toolbar [data-command="generateCode"]');
    const page = await app.popup('codegen');
    await page.waitFor(`document.querySelector('.code-preview')?.textContent.includes('class ')`);
    assert.match(await page.eval(`document.querySelector('.code-preview').textContent`), /public (abstract )?class \S+/);
    await page.eval(`(() => { const s = document.querySelector('[data-draft-select="language"]'); s.value = 'python'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await page.waitFor(`/^class \\S+/m.test(document.querySelector('.code-preview')?.textContent ?? '')`);
    await page.click('[data-draft-segment="target"][data-value="zip"]');
    const file = path.join(tempDir('codegen'), 'code.zip');
    await W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(file)}], 1)`);
    await page.click('[data-action="codegen-apply"]');
    page.close();
    const bytes = await waitFile(file);
    assert.equal(bytes.subarray(0, 2).toString('latin1'), 'PK', 'a ZIP');
    assert.ok(bytes.includes(Buffer.from('.py')), 'with Python files');
    assert.equal(await W(app, 'w.state.settings.codegenLanguage'), 'python', 'the language is remembered');
    await W(app, `(a.updateSettings({ codegenLanguage: 'java' }), 1)`);
  } },
  { group: '모델 도구', name: '역공학 (툴바 › Java 파일): 클래스·상속·연관과 다이어그램', async run(app) {
    await freshProject(app);
    const dir = tempDir('reverse');
    const sources = {
      'Order.java': 'package shop; public class Order extends Base { private Customer customer; private int total; public int total() { return total; } }',
      'Customer.java': 'package shop; public class Customer {}',
      'Base.java': 'package shop; public abstract class Base {}',
    };
    for (const [name, text] of Object.entries(sources)) fs.writeFileSync(path.join(dir, name), text);
    await W(app, `(window.__myumlmakerOpenPicks = [${JSON.stringify(Object.keys(sources).map((n) => path.join(dir, n)))}], 1)`);
    const since = await now(app);
    await app.main.click('#toolbar [data-command="reverse"]');
    const menu = await menuWindow(app, since);
    assert.ok(await menu.eval(`Boolean(document.querySelector('[data-id="custom:folder"]'))`), 'the desktop app can also read a folder');
    await menu.click('[data-id="custom:java"]');
    menu.close();
    await app.main.waitFor(`window.__myumlmaker.api.diagram()?.ownedViews.filter((v) => v._type === 'UMLClassView').length === 3`, { timeout: 10000 });
    assert.ok(await elementNamed(app, 'Order') && await elementNamed(app, 'Customer'));
    assert.equal(await countOf(app, 'UMLGeneralization'), 1);
    assert.ok(await countOf(app, 'UMLAssociation') >= 1, 'the field became an association');
    assert.ok(await W(app, `w.state.recentDirs.some((d) => d.path.toLowerCase() === ${JSON.stringify(dir.toLowerCase())})`), 'the folder is remembered');
    await noErrorPopup(app, 'reverse');
  } },
  { group: '모델 도구', name: 'Mermaid 가져오기 팝업: 예제 → 가져오기 → 클래스 다이어그램', async run(app) {
    await freshProject(app);
    await W(app, `(w.run('importText'), 1)`);
    const page = await app.popup('textimport');
    await pickSample(page, 'class');
    await page.waitFor(`!document.querySelector('[data-action="text-apply"]').disabled`);
    await page.click('[data-action="text-apply"]');
    page.close();
    await app.main.waitFor(`Boolean([...window.__myumlmaker.actions.activeDoc().index.byId.values()].find((e) => e.name === 'Dog'))`);
    assert.equal(await W(app, 'api.diagram()._type'), 'UMLClassDiagram');
    assert.ok(await W(app, `api.diagram().ownedViews.filter((v) => v._type === 'UMLClassView').length >= 3`));
    await noErrorPopup(app, 'text import');
  } },

  // ───────────────────────── files
  { group: '파일', name: '저장(.myuml) → 다시 열기: 같은 프로젝트, 최근 파일·폴더에 기록, 탭은 저장됨', async run(app) {
    await freshSample(app);
    const dir = tempDir('files');
    const file = path.join(dir, 'saved.myuml');
    const before = JSON.parse(await W(app, 'a.activeDoc().text()')).project;
    await W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(file)}], a.saveDoc(a.activeDoc(), { saveAs: true }))`);
    await sleep(300);
    assert.ok(fs.existsSync(file));
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).project, before, 'the file holds the project');
    assert.equal(await W(app, 'a.activeDoc().dirty'), false);
    assert.equal(await app.main.eval(`document.querySelector('#menubar .app-brand-project-name').textContent`), 'saved.myuml', 'the project is named after the file');
    await W(app, closeAllDocs);
    await W(app, `a.openPath(${JSON.stringify(file)}).then(() => 1)`);
    await sleep(400);
    assert.deepEqual(JSON.parse(await W(app, 'a.activeDoc().text()')).project, before, 'same project after opening');
    assert.equal(await W(app, 'a.activeDoc().path.toLowerCase()'), file.toLowerCase());
    assert.ok(await W(app, `w.state.recent.some((r) => r.path.toLowerCase() === ${JSON.stringify(file.toLowerCase())})`), 'recent file');
    assert.ok(await W(app, `w.state.recentDirs.some((d) => d.path.toLowerCase() === ${JSON.stringify(dir.toLowerCase())})`), 'recent folder');
    // Ctrl+S on a known file: no dialog, written again.
    await W(app, `(a.change('op.edit', (p) => { p.name = '다시 저장'; }), document.querySelector('.canvas-scroll').focus(), 1)`);
    await app.main.key('s', 2);
    await sleep(600);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).project.name, '다시 저장', 'Ctrl+S saves to the same file');
    await noErrorPopup(app, 'save');
  } },
  { group: '파일', name: '열기 (Ctrl+O 대화 상자): 여러 개를 골라도 첫 파일만, 프로젝트는 하나', async run(app) {
    await W(app, closeAllDocs);
    const dir = tempDir('open');
    const files = ['one.myuml', 'two.myuml'].map((n) => path.join(dir, n));
    fs.writeFileSync(files[0], await templateText(app, 'classModel'));
    fs.writeFileSync(files[1], await templateText(app, 'useCase'));
    await W(app, `(window.__myumlmakerOpenPicks = [${JSON.stringify(files)}], 1)`);
    await app.main.key('o', 2);
    await app.main.waitFor(`window.__myumlmaker.actions.activeDoc()?.path?.endsWith('one.myuml')`, { timeout: 10000 });
    await sleep(400);
    assert.equal(await W(app, 'w.state.docs.length'), 1, 'one project');
    assert.equal(await app.main.eval(`document.querySelector('#menubar .app-brand-project-name').textContent`), 'one.myuml', 'the first file is opened');
    assert.equal(await W(app, 'api.diagram()._type'), 'UMLClassDiagram', 'its diagram is shown');
    assert.ok(!(await W(app, 'w.state.recent.some((r) => r.path.endsWith("two.myuml"))')), 'the second file was not opened');
  } },
  { group: '파일', name: '최근 파일 창: 최대 10개, 하나씩·전체 지우기, 주 창도 따라감', async run(app) {
    const dir = tempDir('recent');
    const text = await templateText(app, 'blank');
    for (let i = 0; i < 12; i++) {
      const file = path.join(dir, `p${i}.myuml`);
      fs.writeFileSync(file, text);
      await W(app, `a.openPath(${JSON.stringify(file)}, { quiet: true }).then(() => 1)`);
    }
    assert.equal(await W(app, 'w.state.recent.length'), 10);
    await W(app, `(w.run('recent'), 1)`);
    const page = await app.popup('recent');
    await expectPopupWindow(app, page, 'recent');
    assert.equal(await page.eval(`document.querySelectorAll('.recent-row').length`), 10);
    assert.match(await page.eval(`document.querySelector('.recent-row').textContent`), /p11/, 'newest first');
    await page.click('[data-action="remove-recent"]');
    await sleep(300);
    assert.equal(await page.eval(`document.querySelectorAll('.recent-row').length`), 9);
    await page.click('[data-action="clear-recent"]');
    await sleep(300);
    assert.equal(await page.eval(`document.querySelectorAll('.recent-row').length`), 0);
    page.close();
    await closePopups(app);
    await sleep(300);
    assert.equal(await W(app, 'w.state.recent.length'), 0, 'the main window follows');
    await W(app, closeAllDocs);
  } },
  { group: '파일', name: 'DB를 설정하면 저장은 파일과 DB 둘 다 (SQLite)', async run(app) {
    await freshSample(app);
    const dir = tempDir('both');
    const dbFile = path.join(dir, '프로젝트 DB.sqlite');
    const file = path.join(dir, 'both.myuml');
    await W(app, `a.updateSettings({ dbKind: 'sqlite', dbFile: ${JSON.stringify(dbFile)} })`);
    try {
      await sleep(200);
      const title = await W(app, 'a.activeDoc().project.name');
      assert.equal(await W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(file)}], a.saveDoc(a.activeDoc()))`), true);
      assert.ok(fs.existsSync(file), 'the local file');
      assert.ok(fs.existsSync(dbFile), 'the database file');
      const stored = await app.main.eval(`(async () => { const n = await import('/src/platform/native.js'); const s = await import('/src/domain/settings.js'); return (await n.dbList(s.dbConfig(window.__myumlmaker.state.settings, ''))).map((p) => p.title); })()`);
      assert.ok(stored.includes(title), `the database lists the project ${JSON.stringify(stored)}`);
      assert.equal(await W(app, 'a.activeDoc().dirty'), false);
      assert.match(await app.main.eval(`document.querySelector('#statusbar .status-notice').textContent`), /SQLite|DB/i, 'the notice names both places');
    } finally {
      await W(app, `a.updateSettings({ dbKind: 'none', dbFile: '' })`);
    }
  } },
  { group: '파일', name: '끌어다 놓기: .myuml·StarUML .mdj 는 지금 프로젝트를 바꿈, Mermaid .mmd 는 가져오기 창, .java 는 역공학, 모르는 파일은 알림', async run(app) {
    await freshProject(app);
    const dir = tempDir('drop');
    const myuml = path.join(dir, 'dropped.myuml');
    fs.writeFileSync(myuml, await templateText(app, 'classModel'));
    const mdj = path.join(root, 'samples', 'staruml-sample.mdj');
    await W(app, `a.handleDroppedPaths([${JSON.stringify(myuml)}]).then(() => 1)`);
    await sleep(600);
    assert.equal(await W(app, 'w.state.docs.length'), 1, 'still one project');
    assert.ok(await W(app, `a.activeDoc().path?.toLowerCase() === ${JSON.stringify(myuml.toLowerCase())}`), 'the dropped .myuml replaced the project');
    await W(app, `a.handleDroppedPaths([${JSON.stringify(mdj)}]).then(() => 1)`);
    await sleep(600);
    assert.equal(await W(app, 'w.state.docs.length'), 1, 'still one project');
    assert.equal(await W(app, 'a.activeDoc().path'), null, 'the StarUML file replaced it (an import, no path)');
    assert.ok(await W(app, 'M.allDiagrams(a.activeDoc().project).length >= 2'), 'the StarUML project with its diagrams');
    await noErrorPopup(app, 'drop project');
    const mmd = path.join(dir, 'flow.mmd');
    fs.writeFileSync(mmd, 'classDiagram\n  class Engine\n  class Car\n  Car *-- Engine');
    W(app, `a.handleDroppedPaths([${JSON.stringify(mmd)}]).then(() => 1)`).catch(() => {});
    const page = await app.popup('textimport');
    assert.match(await page.eval(`document.querySelector('[data-draft="text"]').value`), /class Engine/, 'the text is in the import window');
    await page.click('[data-action="text-apply"]');
    page.close();
    await app.main.waitFor(`Boolean([...window.__myumlmaker.actions.activeDoc().index.byId.values()].find((e) => e.name === 'Engine'))`);
    const java = path.join(dir, 'Wheel.java');
    fs.writeFileSync(java, 'public class Wheel { private int size; }');
    await W(app, `a.handleDroppedPaths([${JSON.stringify(java)}]).then(() => 1)`);
    await sleep(400);
    assert.ok(await elementNamed(app, 'Wheel'), 'a dropped source file is reverse engineered');
    const other = path.join(dir, 'notes.xyz');
    fs.writeFileSync(other, 'x');
    await W(app, `a.handleDroppedPaths([${JSON.stringify(other)}]).then(() => 1)`);
    await sleep(300);
    assert.match(await app.main.eval(`document.querySelector('#statusbar .status-notice').textContent`), /notes\.xyz/, 'unknown files are reported in the status bar');
    await noErrorPopup(app, 'drop');
  } },
  { group: '파일', name: '그림 내보내기: PNG·JPEG·WebP·BMP·TIFF·SVG, 투명/흰 배경', async run(app) {
    await freshSample(app);
    const dir = tempDir('images');
    const magic = { png: [1, 4, 'PNG'], jpeg: [0, 3, '\xff\xd8\xff'], webp: [8, 12, 'WEBP'], bmp: [0, 2, 'BM'], tiff: [0, 4, 'II*\0'], svg: [0, 4, '<svg'] };
    const ext = { jpeg: 'jpg' };
    for (const format of Object.keys(magic)) {
      for (const transparent of format === 'jpeg' ? [false] : [true, false]) {
        const file = path.join(dir, `diagram-${transparent ? 'clear' : 'white'}.${ext[format] ?? format}`);
        await W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(file)}], a.exportImage({ format: '${format}', transparent: ${transparent}, area: 'content', scale: 1, quality: 90 }).then(() => 1))`);
        const bytes = await waitFile(file);
        const [from, to, text] = magic[format];
        assert.equal(bytes.subarray(from, to).toString('latin1'), text, `${format} signature`);
        if (['png', 'webp', 'jpeg'].includes(format)) {
          const mime = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[format];
          const corner = await app.main.eval(`(async () => { const img = new Image(); img.src = 'data:${mime};base64,${bytes.toString('base64')}'; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return [...x.getImageData(1, 1, 1, 1).data]; })()`);
          if (transparent) assert.equal(corner[3], 0, `${format}: transparent corner ${corner}`);
          else assert.ok(corner[3] === 255 && corner[0] > 240, `${format}: white corner ${corner}`);
        }
      }
    }
    await noErrorPopup(app, 'images');
  } },
  { group: '파일', name: '그림 내보내기 팝업: 형식·배경·배율 → 선택이 내보내기에 쓰임', async run(app) {
    await freshSample(app);
    const file = path.join(tempDir('image-popup'), 'popup.webp');
    const done = W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(file)}], a.exportImage().then(() => 1))`);
    const page = await app.popup('image');
    assert.deepEqual(await page.eval(`[...document.querySelectorAll('[data-draft-segment="format"]')].map((b) => b.dataset.value)`), ['png', 'jpeg', 'webp', 'bmp', 'tiff', 'svg']);
    await page.click('[data-draft-segment="format"][data-value="jpeg"]');
    assert.ok(await page.eval(`document.querySelector('[data-draft-segment="transparent"]').closest('.row').classList.contains('disabled-row')`), 'JPEG cannot be transparent');
    await page.click('[data-draft-segment="format"][data-value="webp"]');
    await page.click('[data-draft-segment="transparent"][data-value="true"]');
    await page.click('[data-draft-segment="scale"][data-value="1"]');
    const size1 = await page.eval(`document.querySelector('[data-image-size]').textContent`);
    await page.click('[data-draft-segment="scale"][data-value="3"]');
    assert.notEqual(await page.eval(`document.querySelector('[data-image-size]').textContent`), size1, 'the size follows the scale');
    await page.click('[data-action="image-apply"]');
    page.close();
    await done;
    const bytes = await waitFile(file);
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
  } },
  { group: '파일', name: '내보내기: SVG·HTML 문서·Markdown(ZIP)·StarUML·Mermaid·PlantUML·템플릿·PDF·모든 그림(ZIP) (파일 머리 확인)', async run(app) {
    await freshSample(app);
    const dir = tempDir('export');
    const out = {};
    for (const [type, name] of [['svg', 'diagram.svg'], ['html', 'docs.html'], ['md', 'docs.zip'], ['mdj', 'project.mdj'], ['mmd', 'diagram.mmd'], ['puml', 'diagram.puml'], ['mumlt', 'project.mumlt']]) {
      const file = path.join(dir, name);
      await W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(file)}], a.exportAs('${type}').then(() => 1))`);
      out[type] = await waitFile(file);
    }
    assert.match(out.svg.toString('utf8'), /^(<\?xml[^>]*>\s*)?<svg[\s>]/);
    assert.match(out.html.toString('utf8'), /^<!doctype html>/i);
    assert.ok(out.html.toString('utf8').includes('<svg'), 'HTML has the diagrams');
    assert.equal(out.md.subarray(0, 2).toString('latin1'), 'PK', 'Markdown docs in a ZIP');
    assert.ok(out.md.includes(Buffer.from('images/')), 'with the pictures');
    assert.ok(JSON.parse(out.mdj.toString('utf8'))._type === 'Project', 'a StarUML project');
    assert.match(out.mmd.toString('utf8'), /^classDiagram/m);
    assert.match(out.puml.toString('utf8'), /@startuml[\s\S]*@enduml/);
    assert.equal(JSON.parse(out.mumlt.toString('utf8')).kind, 'template', 'a template file');
    const pdfFile = path.join(dir, 'project.pdf');
    await W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(pdfFile)}], a.exportPdf().then(() => 1))`);
    const pdf = await waitFile(pdfFile, 80);
    assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.match(pdf.subarray(-8).toString('latin1'), /%%EOF\s*$/);
    const count = Number(/\/Count (\d+)/.exec(pdf.toString('latin1'))?.[1] ?? 0);
    assert.ok(count >= 11, `a PDF page per diagram (${count})`);
    const zipFile = path.join(dir, 'all.zip');
    await W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(zipFile)}], a.exportAllImages().then(() => 1))`);
    const zip = await waitFile(zipFile, 80);
    assert.equal(zip.subarray(0, 2).toString('latin1'), 'PK');
    assert.equal(zip.toString('latin1').match(/\.png/g)?.length >= 11, true, 'a PNG per diagram');
    await noErrorPopup(app, 'export');
  } },
  { group: '파일', name: 'StarUML(.mdj)로 내보낸 파일을 다시 열면 같은 클래스·관계·다이어그램', async run(app) {
    await freshProject(app, 'classModel');
    const file = path.join(tempDir('mdj'), 'round.mdj');
    const summary = () => W(app, `({ classes: M.elementsWhere(a.activeDoc().project, (e) => e._type === 'UMLClass').map((e) => e.name).sort(), generalizations: M.elementsWhere(a.activeDoc().project, (e) => e._type === 'UMLGeneralization').length, diagrams: M.allDiagrams(a.activeDoc().project).map((d) => [d._type, d.ownedViews.length]) })`);
    const before = await summary();
    await W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(file)}], a.exportAs('mdj').then(() => 1))`);
    await waitFile(file);
    await W(app, closeAllDocs);
    await W(app, `a.openPath(${JSON.stringify(file)}).then(() => 1)`);
    await sleep(500);
    await noErrorPopup(app, 'open mdj');
    assert.equal(await W(app, 'w.state.docs.length'), 1, 'opened in a tab');
    assert.deepEqual(await summary(), before);
    assert.equal(await W(app, 'a.activeDoc().path'), null, 'an import: Save asks for a .myuml name');
  } },
  { group: '파일', name: '오래 걸리는 파일 작업은 진행 팝업 (진행률 막대)', async run(app) {
    const dir = tempDir('slow');
    const file = path.join(dir, 'big.myuml');
    const data = JSON.parse(await templateText(app, 'classModel'));
    data.project.documentation = 'x'.repeat(3_500_000);
    fs.writeFileSync(file, JSON.stringify(data));
    await app.restart([], { MYUMLMAKER_IO_DELAY_MS: '1200' });
    await afterStart(app);
    app.main.eval(`window.__myumlmaker.actions.openPath(${JSON.stringify(file)}).then(() => 1)`).catch(() => {});
    const page = await app.popup('progress', 20000);
    await expectPopupWindow(app, page, 'progress');
    await page.waitFor(`/\\d+%/.test(document.querySelector('#progress-percent')?.textContent ?? '')`, { timeout: 20000 });
    assert.ok(await page.eval(`Boolean(document.querySelector('.progress-bar i'))`), 'a progress bar');
    page.close();
    await app.main.waitFor(`window.__myumlmaker.state.docs.some((d) => d.path?.endsWith('big.myuml'))`, { timeout: 30000 });
    await app.restart();
    await afterStart(app);
  } },
  { group: '파일', name: '저장 안 한 변경이 있으면 끝낼 때 저장 여부를 물음 (취소하면 그대로)', async run(app) {
    await freshSample(app);
    await W(app, `(a.change('op.edit', (p) => { p.name = '바뀜'; }), 1)`);
    assert.equal(await W(app, 'a.activeDoc().dirty'), true);
    assert.ok(await app.main.eval(`(() => { const p = document.querySelector('#menubar .app-brand-project'); return p.classList.contains('dirty') && getComputedStyle(p.querySelector('.app-brand-dirty')).display !== 'none'; })()`), 'the project name shows ● for the change');
    const answer = W(app, 'a.confirmExit()');
    const page = await app.popup('confirm');
    await expectPopupWindow(app, page, 'confirm');
    const buttons = await page.eval(`[...document.querySelectorAll('[data-action="choice"]')].map((b) => b.dataset.value)`);
    assert.deepEqual(buttons.sort(), ['cancel', 'discard', 'save']);
    await page.click('[data-value="cancel"]');
    page.close();
    assert.equal(await answer, false, 'cancel keeps the app open');
    assert.equal(await W(app, 'w.state.docs.length'), 1, 'the project is still open');
    await W(app, closeAllDocs);
  } },

  // ───────────────────────── printing
  { group: '인쇄', name: '인쇄 미리 보기 (Ctrl+P): 전체/현재 다이어그램, 용지 방향, 바로 인쇄', async run(app) {
    await freshSample(app);
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.key('p', 2);
    const page = await app.popup('print');
    await sleep(500);
    const sheets = () => page.eval('window.__myumlmakerPopup.printLayout().count');
    const all = await sheets();
    assert.ok(all >= 11, `a sheet per diagram at least (${all})`);
    assert.ok(await page.eval(`Boolean(document.querySelector('#print-preview svg'))`), 'the preview shows the diagram');
    await page.eval(`(() => { const r = document.querySelector('[data-print-range="current"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(150);
    assert.ok(await sheets() < all, 'the current diagram only');
    await page.eval(`(() => { const r = document.querySelector('[data-print-range="all"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    assert.equal(await sheets(), all);
    await page.click('.tabs [data-value="page"]');
    const orientation = await page.eval(`document.querySelector('[data-print-segment="orientation"].active').dataset.value`);
    const svgBox = () => page.eval(`(() => { const s = document.querySelector('#print-preview svg'); const r = s.getBoundingClientRect(); return r.width > r.height ? 'wide' : 'tall'; })()`);
    const shapeBefore = await svgBox();
    await page.click(`[data-print-segment="orientation"][data-value="${orientation === 'portrait' ? 'landscape' : 'portrait'}"]`);
    await sleep(200);
    assert.notEqual(await svgBox(), shapeBefore, 'the orientation turns the sheet');
    await page.click(`[data-print-segment="orientation"][data-value="${orientation}"]`);
    await page.eval(`window.__myumlmakerPrintHook = (layout) => { window.__printed = layout.count; }; 1`);
    await page.click('[data-action="print"]');
    await sleep(300);
    assert.ok(await page.eval('window.__printed') >= 1, 'printed');
    page.close();
    await closePopups(app);
  } },

  // ───────────────────────── settings
  { group: '설정', name: '설정 창: 9개 탭, 테마(다크 20/라이트 20/사용자 정의), 글꼴(시스템 글꼴·굵기·기울임)이 주 창에 적용', async run(app) {
    await closePopups(app);
    await W(app, `(w.popups.open('settings', { tab: 'appearance' }), 1)`);
    const page = await app.popup('settings');
    const tabs = await page.eval(`[...document.querySelectorAll('.tabs [data-action="tab"]')].map((t) => t.dataset.value)`);
    assert.deepEqual(tabs, ['general', 'start', 'appearance', 'font', 'background', 'diagram', 'database', 'recent', 'shortcuts']);
    assert.equal(await page.eval(`document.querySelectorAll('.theme-list .theme-row').length`), 20);
    await page.click('[data-theme-group="dark"]');
    assert.equal(await page.eval(`document.querySelectorAll('.theme-list .theme-row').length`), 20);
    await page.click('[data-theme-group="custom"]');
    assert.ok(await page.eval(`document.querySelectorAll('[data-custom-color]').length >= 10`), 'custom colours');
    await page.click('.tabs [data-value="font"]');
    await page.waitFor(`document.querySelectorAll('#font-family option').length > 20`, { timeout: 20000 });
    const family = await page.eval(`[...document.querySelectorAll('#font-family option')].map((o) => o.value).find((f) => /Arial|Malgun|맑은|Segoe/.test(f))`);
    await page.eval(`(() => { const s = document.querySelector('#font-family'); s.value = ${JSON.stringify(family)}; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await page.click('[data-setting="fontStyle"][data-value="italic"]');
    await sleep(500);
    page.close();
    const applied = await app.main.eval(`getComputedStyle(document.documentElement).getPropertyValue('--font-family') + '|' + getComputedStyle(document.documentElement).getPropertyValue('--font-style')`);
    assert.ok(applied.includes(family) && applied.includes('italic'), applied);
    await W(app, `a.updateSettings({ fontFamily: '', fontStyle: 'normal' })`);
    await closePopups(app);
  } },
  { group: '설정', name: '설정 창 › 다이어그램: 격자를 끄면 캔버스에서 격자가 사라짐, 색 구성 적용', async run(app) {
    await freshProject(app, 'classModel');
    await W(app, `a.updateSettings({ showGrid: true, diagramTheme: 'classic' })`);
    await sleep(200);
    const grid = `Boolean(document.querySelector('#view-host pattern#grid-pattern'))`;
    assert.equal(await app.main.eval(grid), true, 'the grid is drawn');
    await W(app, `(w.popups.open('settings', { tab: 'diagram' }), 1)`);
    const page = await app.popup('settings');
    await page.waitFor(`document.querySelector('[data-toggle="showGrid"]')`);
    assert.equal(await page.eval(`document.querySelector('[data-toggle="showGrid"]').checked`), true);
    await page.eval(`(() => { const c = document.querySelector('[data-toggle="showGrid"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await page.click('[data-setting="diagramTheme"][data-value="dark"]');
    await sleep(500);
    page.close();
    await closePopups(app);
    assert.equal(await W(app, 'w.state.settings.showGrid'), false);
    assert.equal(await app.main.eval(grid), false, 'the grid is gone from the canvas');
    assert.equal(await W(app, 'w.state.settings.diagramTheme'), 'dark', 'the colour scheme reached the main window');
    await W(app, `a.updateSettings({ showGrid: true, diagramTheme: 'classic' })`);
  } },
  { group: '설정', name: '설정은 다음 실행 때 다시 읽힘', async run(app) {
    await W(app, `a.updateSettings({ theme: 'dracula', gridSize: 20, language: 'en', showRightPanel: false })`);
    const animationBefore = await W(app, 'w.state.settings.animation');
    await sleep(300);
    await app.quit();
    await app.launch();
    const s = await W(app, `({ theme: w.state.settings.theme, gridSize: w.state.settings.gridSize, language: w.state.settings.language, right: w.state.settings.showRightPanel, offered: w.state.settings.tutorialOffered })`);
    assert.deepEqual(s, { theme: 'dracula', gridSize: 20, language: 'en', right: false, offered: true });
    assert.match(await app.main.eval(`document.querySelector('[data-menu="file"]').textContent`), /File/);
    await sleep(1500);
    assert.equal(await app.hasPopup('welcome'), false, 'the welcome popup only comes once');
    assert.notEqual(await W(app, 'w.state.settings.animation'), animationBefore, 'every start picks another moving background');
    await W(app, `a.updateSettings({ theme: 'light', gridSize: 10, language: 'ko', showRightPanel: true })`);
  } },
  { group: '설정', name: '새로 설치한 뒤 첫 실행: 설정은 기본값으로, 최근 파일·DB 연결·배경 이미지는 그대로 (한 번만)', async run(app) {
    const marker = path.join(app.config, 'install-reset');
    const recent = JSON.stringify([{ path: 'D:\\projects\\kept.myuml', title: 'kept' }]);
    await W(app, closeAllDocs);
    await app.main.eval(`(localStorage.setItem('myumlmaker.recent.v1', ${JSON.stringify(recent)}), 1)`);
    await W(app, `(a.updateSettings({ theme: 'monokai', zoom: 140, showLeftPanel: false, dbKind: 'postgres', dbHost: 'db.example', backgroundName: 'kept.png' }), 1)`);
    const settings = async () => JSON.parse(await W(app, 'JSON.stringify(w.state.settings)'));
    // Quit the way a user does (File › Exit): taskkill would lose localStorage that has not reached the disk yet.
    const quitAndStart = async () => {
      await W(app, `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); w.run('exit'); return 1; })()`).catch(() => {});
      await Promise.race([app.exited, sleep(15000)]);
      app.main?.close();
      await app.kill();
      await app.launch();
    };
    await quitAndStart();
    const kept = await settings();
    assert.deepEqual([kept.theme, kept.zoom], ['monokai', 140], 'a normal restart keeps the settings');
    fs.writeFileSync(marker, '4242');
    await quitAndStart();
    const after = await settings();
    assert.deepEqual([after.theme, after.zoom, after.showLeftPanel], ['light', 100, true], 'preferences are back to the defaults');
    assert.deepEqual([after.dbKind, after.dbHost, after.backgroundName], ['postgres', 'db.example', 'kept.png'], 'database connection and background image stay');
    assert.equal(await app.main.eval(`localStorage.getItem('myumlmaker.recent.v1')`), recent, 'recent files stay');
    assert.equal(fs.existsSync(marker), false, 'the marker is used up');
    await W(app, `(a.updateSettings({ zoom: 120 }), 1)`);
    await quitAndStart();
    assert.equal((await settings()).zoom, 120, 'once only: later starts keep what the user sets');
    await W(app, `(a.updateSettings({ zoom: 100, dbKind: 'none', dbHost: 'localhost', backgroundName: '' }), 1)`);
    await app.main.eval(`(localStorage.removeItem('myumlmaker.recent.v1'), 1)`);
  } },

  // ───────────────────────── errors
  { group: '오류', name: '오류는 팝업으로 자세히, 내용 복사 가능 (깨진 파일 열기)', async run(app) {
    await closePopups(app);
    const file = path.join(tempDir('bad'), 'broken.myuml');
    fs.writeFileSync(file, '{ not json');
    await W(app, `a.openPath(${JSON.stringify(file)}).then(() => 1)`);
    const page = await app.popup('error');
    await expectPopupWindow(app, page, 'error');
    const report = await page.eval(`document.querySelector('#error-detail').value`);
    assert.match(report, /broken\.myuml/);
    await page.click('[data-action="copy-error"]');
    await sleep(400);
    assert.ok(getClipboard().includes('broken.myuml'), 'copied to the clipboard');
    assert.ok(await page.eval(`document.querySelector('#copy-state').textContent.trim().length > 0`), 'says it was copied');
    page.close();
    await closePopups(app);
  } },
  { group: '오류', name: '백엔드 심각한 오류(패닉)도 위치·백트레이스와 함께 팝업', async run(app) {
    await closePopups(app);
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('raise_test_panic').then(() => 1)`);
    const page = await app.popup('error');
    const report = await page.eval(`document.querySelector('#error-detail').value`);
    assert.match(report, /test panic/);
    assert.match(report, /lib\.rs/);
    page.close();
    await closePopups(app);
  } },

  // ───────────────────────── view & help
  { group: '보기', name: '프레젠테이션: F5 로 시작, 다이어그램 넘김, Esc 로 끝', async run(app) {
    await freshSample(app);
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'F5', code: 'F5', windowsVirtualKeyCode: 116, nativeVirtualKeyCode: 116 });
    await app.main.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F5', code: 'F5', windowsVirtualKeyCode: 116, nativeVirtualKeyCode: 116 });
    await app.main.waitFor(`!document.querySelector('#presentation').hidden`, { message: 'F5 starts the presentation' });
    const first = await app.main.eval(`document.querySelector('#presentation .present-bar span').textContent`);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#presentation svg'))`), 'the diagram is drawn');
    await app.main.key('ArrowRight');
    await sleep(300);
    assert.notEqual(await app.main.eval(`document.querySelector('#presentation .present-bar span').textContent`), first, 'the next diagram shows');
    await app.main.key('Escape');
    await app.main.waitFor(`document.querySelector('#presentation').hidden`, { message: 'Esc ends the presentation' });
    await sleep(400);
    assert.equal(await W(app, 'w.state.presenting ?? null'), null);
  } },
  { group: '도움말', name: '시작 페이지 머리: 사용 설명서·튜토리얼 문서·튜토리얼 동영상 단추 (아이콘·설명), 최소 창 폭에서도 잘리지 않음', async run(app) {
    await closePopups(app);
    await resize(app, 600, 500);
    await sleep(600);
    await W(app, '(a.showStartPage(true), 1)');
    await sleep(400);
    try {
      const hero = await app.main.eval(`(() => {
        const ids = ['guide', 'tutorial-doc', 'tutorial-video', 'help-menu', 'tutorial'];
        const buttons = ids.map((id) => document.querySelector('.start-hero [data-start="' + id + '"]'));
        if (buttons.some((b) => !b)) return null;
        const box = document.querySelector('.start-hero').getBoundingClientRect();
        return {
          width: innerWidth,
          rows: new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top / 8))).size,
          inside: buttons.every((b) => { const r = b.getBoundingClientRect(); return r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.right <= innerWidth + 0.5; }),
          icons: buttons.every((b) => Boolean(b.querySelector('svg'))),
          titles: buttons.map((b) => b.title),
          labels: buttons.slice(0, 3).map((b) => b.textContent.trim()),
        };
      })()`);
      assert.ok(hero, 'the three document buttons, Help and Start tutorial are in the start page header');
      assert.ok(hero.inside && hero.icons, `inside the header, with icons ${JSON.stringify(hero)}`);
      assert.ok(hero.rows <= 2, `one row (or wrapped neatly) at the minimum width ${JSON.stringify(hero)}`);
      assert.ok(hero.titles.every(Boolean), 'every button has a tooltip');
      assert.deepEqual(hero.labels, await W(app, `['action.userGuide', 'action.tutorialDoc', 'action.tutorialVideo'].map((k) => w.t(k))`));
      assert.deepEqual(await app.main.eval(`(${CLIP_CHECK}).filter((x) => x.includes('start-hero') || x.includes('doc-button') || x.includes('start-docs'))`), [], 'nothing in the header is cut off');
      // The help card lists them too.
      assert.ok(await app.main.eval(`['guide', 'tutorial-doc', 'tutorial-video', 'shortcuts'].every((x) => document.querySelector('.start-card.recent [data-start="' + x + '"]'))`));
    } finally {
      await resize(app, 1480, 900);
      await sleep(300);
    }
  } },
  { group: '도움말', name: '사용 설명서: 시작 페이지 단추 → 별도의 창 (제목, h1, 장 이동, 언어, 찾기, 다시 누르면 같은 창, 제목 표시줄 닫기 단추) (실제 마우스)', async run(app) {
    await closeDocWindows(app);
    await W(app, '(a.showStartPage(true), 1)');
    await sleep(300);
    await clickOn(app.main, '.start-hero [data-start="guide"]');
    const page = await docWindow(app, 'guide');
    const win = await docOsWindow(app, '사용 설명서');
    assert.equal(win.owner, 0, 'a window of its own (not a popup of the main window)');
    assert.ok(win.style & WS_THICKFRAME, 'resizable');
    assert.ok(win.style & WS_MAXIMIZEBOX, 'maximizable');
    assert.ok(win.style & WS_CAPTION, 'with the system title bar');
    assert.match(await frameEval(page, `document.querySelector('h1').textContent`), /MyUMLMaker 사용 설명서/);
    assert.equal(await frameEval(page, `getComputedStyle(document.querySelector('.topbar')).display`), 'none', 'the page\'s own bar gives way to the window\'s');
    // Chapters: h2 and h3 of the page; picking one scrolls there.
    const chapters = await page.eval(`[...document.querySelectorAll('[data-viewer-chapter] option')].slice(1).map((o) => o.textContent.trim())`);
    assert.ok(chapters.length > 20 && chapters.every((c) => c && !c.endsWith('#')), JSON.stringify(chapters.slice(0, 5)));
    await page.eval(`(() => { const s = document.querySelector('[data-viewer-chapter]'); s.value = s.options[12].value; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(300);
    assert.ok(await frameEval(page, 'window.scrollY > 200'), 'a chapter can be picked');
    // Find in page (Ctrl+F, typing, Enter): every match highlighted, the counter moves.
    await clickOn(page, '.viewer-title');
    await page.key('f', 2);
    assert.ok(await page.eval(`document.activeElement?.matches('[data-viewer-find]')`), 'Ctrl+F goes to the find box');
    await page.type('다이어그램');
    await sleep(200);
    await page.key('Enter');
    await sleep(200);
    const found = await page.eval(`document.querySelector('[data-find-count]').textContent`);
    assert.match(found, /^2\/\d+$/, `the second match after Enter (${found})`);
    assert.ok(Number(found.split('/')[1]) > 20, 'many matches');
    assert.ok(await frameEval(page, `window.CSS.highlights.has('mum-find') && window.CSS.highlights.has('mum-find-current')`), 'matches are highlighted');
    await clickOn(page, '[data-viewer="find-prev"]');
    assert.match(await page.eval(`document.querySelector('[data-find-count]').textContent`), /^1\//, 'previous match');
    // Language: the English page.
    await clickOn(page, '[data-viewer="lang"][data-value="en"]');
    await page.waitFor(`/User's Guide/i.test(document.querySelector('.viewer-frame').contentDocument?.querySelector('h1')?.textContent ?? '') && document.querySelectorAll('[data-viewer-chapter] option').length > 20`, { timeout: 15000, message: 'the English guide' });
    assert.ok(await page.eval(`document.querySelector('[data-viewer="lang"][data-value="en"]').classList.contains('active')`));
    for (const button of ['print', 'external']) assert.ok(await page.eval(`Boolean(document.querySelector('[data-viewer="${button}"]')?.title)`), `${button} button`);
    // Choosing it again brings the same window back, no second one.
    await clickOn(app.main, '.start-hero [data-start="guide"]');
    await sleep(800);
    assert.equal((await app.windowInfo()).filter((w) => w.visible && w.title === win.title).length, 1, 'one guide window');
    assert.equal((await app.targets()).filter((target) => target.title === 'doc-guide').length, 1, 'one guide page');
    assert.match(await frameEval(page, `document.querySelector('h1').textContent`), /User's Guide/i, 'the same window, as it was left');
    await noErrorPopup(app, 'guide window');
    // The close button of its title bar (real mouse).
    await closeWithTitleBar(app, page, win.title);
  } },
  { group: '도움말', name: '튜토리얼 문서: 시작 페이지 단추 → 별도의 창 (단계마다 그림, 장 이동, English, 닫기) (실제 마우스)', async run(app) {
    await closeDocWindows(app);
    await W(app, '(a.showStartPage(true), 1)');
    await sleep(300);
    await clickOn(app.main, '.start-hero [data-start="tutorial-doc"]');
    const page = await docWindow(app, 'tutorial');
    const win = await docOsWindow(app, '튜토리얼 문서');
    const doc = await frameEval(page, `({ h1: document.querySelector('h1').textContent, steps: document.querySelectorAll('h3').length, images: document.images.length, raw: document.body.innerText.includes('<a id=') })`);
    assert.match(doc.h1, /MyUMLMaker/);
    const steps = await W(app, 'w.domain.tutorialSteps()');
    assert.equal(doc.steps, steps, 'every tutorial step is in the document');
    assert.equal(doc.images, steps, 'with a picture each');
    assert.equal(doc.raw, false, 'no raw HTML shows as text');
    await page.eval(`(() => { const s = document.querySelector('[data-viewer-chapter]'); s.value = s.options[4].value; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(300);
    assert.ok(await frameEval(page, 'window.scrollY > 200'), 'a chapter can be picked');
    await clickOn(page, '[data-viewer="lang"][data-value="en"]');
    await page.waitFor(`/tutorial/i.test(document.querySelector('.viewer-frame').contentDocument?.querySelector('h1')?.textContent ?? '')`, { timeout: 10000, message: 'the English tutorial document' });
    await closeWithTitleBar(app, page, win.title);
    // Choosing it after closing opens it again.
    await clickOn(app.main, '.start-hero [data-start="tutorial-doc"]');
    const again = await docWindow(app, 'tutorial');
    await docOsWindow(app, '튜토리얼 문서');
    await closeWithTitleBar(app, again, win.title);
    await noErrorPopup(app, 'tutorial document window');
  } },
  { group: '도움말', name: '도움말 메뉴 (시작 페이지의 도움말 단추): 튜토리얼 문서 · 튜토리얼 동영상 · 사용 설명서가 각자의 창으로 (실제 클릭)', async run(app) {
    await closeDocWindows(app);
    const openHelp = async () => {
      await W(app, '(a.showStartPage(true), 1)');
      await sleep(300);
      const button = await app.main.eval(`(() => { const h = document.querySelector('[data-start="help-menu"]'); const t = document.querySelector('.start-hero [data-start="tutorial"]'); return h && t ? { before: h.getBoundingClientRect().right <= t.getBoundingClientRect().left + 1, title: h.title } : null; })()`);
      assert.ok(button?.before && button.title, `the Help button sits left of "start the tutorial" ${JSON.stringify(button)}`);
      const since = await now(app);
      await clickOn(app.main, '[data-start="help-menu"]');
      const menu = await menuWindow(app, since);
      const ids = await menu.eval(`[...document.querySelectorAll('.menu-item')].map((i) => i.dataset.id)`);
      const place = await menu.eval('({ x: window.screenX, y: window.screenY })');
      return { menu, ids, place };
    };
    let { menu, ids, place } = await openHelp();
    assert.deepEqual(ids, ['welcome', 'tutorial', 'tutorialDoc', 'tutorialVideo', 'userGuide', 'shortcuts', 'settings', 'about'], 'the Help menu items');
    const button = await app.main.eval(`(() => { const r = document.querySelector('[data-start="help-menu"]').getBoundingClientRect(); return { bottom: window.screenY + r.bottom }; })()`);
    assert.ok(place.y >= button.bottom - 40, `the menu opens below the button ${JSON.stringify({ place, button })}`);
    const opened = [];
    for (const [id, kind, title] of [['tutorialDoc', 'tutorial', '튜토리얼 문서'], ['tutorialVideo', 'video', '튜토리얼 동영상'], ['userGuide', 'guide', '사용 설명서']]) {
      if (opened.length) ({ menu } = await openHelp());
      await clickOn(menu, `[data-id="${id}"]`);
      menu.close();
      const page = await docWindow(app, kind);
      opened.push({ page, title: (await docOsWindow(app, title)).title });
    }
    await noErrorPopup(app, 'help menu');
    assert.doesNotMatch(await app.main.eval(`document.querySelector('#statusbar .status-notice')?.textContent ?? ''`), new RegExp(await W(app, `w.t('error.docWindow')`)), 'no "cannot open" notice');
    for (const { page, title } of opened) await closeWithTitleBar(app, page, title);
  } },
  { group: '도움말', name: '튜토리얼 동영상: 별도의 창에서 재생 (길이, 재생 시간 증가, 장 표시, 장으로 이동, 속도, 전체 화면 단추) (실제 마우스)', async run(app) {
    const video = path.join(root, 'docs', 'video', 'MyUMLMaker-Tutorial.mp4');
    if (!fs.existsSync(video)) return { skipped: 'docs/video/MyUMLMaker-Tutorial.mp4 없음 (npm run tutorial:video)' };
    await closeDocWindows(app);
    await W(app, '(a.showStartPage(true), 1)');
    await sleep(300);
    await clickOn(app.main, '.start-hero [data-start="tutorial-video"]');
    const page = await docWindow(app, 'video', `document.querySelector('video')?.readyState >= 1`);
    const win = await docOsWindow(app, '튜토리얼 동영상');
    assert.ok(win.style & WS_THICKFRAME && win.style & WS_MAXIMIZEBOX, 'resizable and maximizable');
    const info = await page.eval(`(() => { const v = document.querySelector('video'); return { duration: v.duration, controls: v.controls, src: v.currentSrc, message: !document.querySelector('[data-video-message]').hidden, marks: document.querySelectorAll('[data-video-marks] i').length, chapters: document.querySelectorAll('.video-chapter').length, steps: document.querySelectorAll('.video-step').length, options: document.querySelectorAll('[data-video-chapter] option').length - 1 }; })()`);
    assert.ok(info.duration > 60, `the video is longer than a minute (${info.duration} s)`);
    assert.ok(info.controls && !info.message, JSON.stringify(info));
    assert.ok(info.chapters >= 5 && info.marks === info.chapters && info.options === info.chapters, `chapter marks from the sidecar ${JSON.stringify(info)}`);
    assert.ok(info.steps >= 50, 'and every step');
    // A chapter in the list (real click) seeks there.
    const target = await page.eval(`Number(document.querySelectorAll('.video-chapter')[2].dataset.videoSeek)`);
    await clickOn(page, '.video-chapter-list section:nth-child(3) .video-chapter');
    await sleep(300);
    assert.ok(Math.abs(await page.eval(`document.querySelector('video').currentTime`) - target) < 1, 'the chapter starts playing from its mark');
    assert.ok(await page.eval(`document.querySelectorAll('.video-chapter')[2].classList.contains('active')`), 'and is shown as the current chapter');
    // Space plays; the time advances.
    await clickOn(page, '.viewer-title');
    await page.key(' ', 0, 'Space');
    await page.waitFor(`!document.querySelector('video').paused && document.querySelector('video').currentTime > ${target + 1}`, { timeout: 10000, message: 'the video plays' });
    // Speed 2×.
    await page.eval(`(() => { const s = document.querySelector('[data-video-speed]'); s.value = '2'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    assert.equal(await page.eval(`document.querySelector('video').playbackRate`), 2);
    assert.deepEqual(await page.eval(`[...document.querySelectorAll('[data-video-speed] option')].map((o) => Number(o.value))`), [0.5, 0.75, 1, 1.25, 1.5, 2]);
    await page.key(' ', 0, 'Space');
    await page.waitFor(`document.querySelector('video').paused`, { timeout: 5000, message: 'Space pauses' });
    assert.ok(await page.eval(`Boolean(document.querySelector('[data-viewer="fullscreen"]')?.title)`), 'full screen button');
    await noErrorPopup(app, 'video window');
    await closeWithTitleBar(app, page, win.title);
  } },
  { group: '도움말', name: '튜토리얼 동영상이 없으면 만드는 방법을 알려 줌 (오류 아님)', async run(app) {
    await app.restart([], { MYUMLMAKER_TUTORIAL_VIDEO: path.join(tempDir('novideo'), 'missing.mp4') });
    await afterStart(app);
    try {
      await W(app, '(a.showStartPage(true), 1)');
      await sleep(300);
      await clickOn(app.main, '.start-hero [data-start="tutorial-video"]');
      const page = await docWindow(app, 'video', `!document.querySelector('[data-video-message]').hidden && /tutorial:video/.test(document.querySelector('[data-video-message]').textContent)`);
      const shown = await page.eval(`({ text: document.querySelector('[data-video-message]').textContent, video: !document.querySelector('video').hidden, src: document.querySelector('video').getAttribute('src') })`);
      assert.match(shown.text, /튜토리얼 동영상이 아직 없습니다\. npm run tutorial:video 로 만들 수 있습니다\./);
      assert.equal(shown.video, false, 'no empty player');
      assert.equal(shown.src, null);
      await noErrorPopup(app, 'missing video');
    } finally {
      await app.restart();
      await afterStart(app);
    }
  } },
  { group: '도움말', name: '주 창을 닫으면 문서 창도 함께 닫히고 프로그램이 끝남', async run(app) {
    await closeDocWindows(app);
    await W(app, `(a.openDocWindow('guide'), 1)`);
    await docWindow(app, 'guide');
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|destroy', { label: 'main' }).catch(() => 1); 1`).catch(() => {});
    await Promise.race([app.exited, sleep(10000)]);
    const exited = app.process.exitCode != null;
    await app.restart();
    await afterStart(app);
    assert.ok(exited, 'the app ended with its main window (the guide window did not keep it running)');
  } },
  { group: '도움말', name: '튜토리얼: 시작·다음·Esc 로 끝내면 원래대로 (자기 탭은 닫힘)', async run(app) {
    await freshSample(app);
    const docs = await W(app, 'w.state.docs.length');
    await W(app, '(a.startTutorial(), 1)');
    await app.main.waitFor(`window.__myumlmaker.tutorial().state().active && !window.__myumlmaker.tutorial().state().busy`, { timeout: 30000 });
    await app.main.waitFor(`Boolean(document.querySelector('.tour-card') && document.querySelector('.tour-outline'))`, { timeout: 15000 });
    for (let i = 0; i < 6; i++) {
      await app.main.click('[data-tour="next"]');
      await app.main.waitFor(`window.__myumlmaker.tutorial().state().index === ${i + 1} && !window.__myumlmaker.tutorial().state().busy`, { timeout: 30000 });
    }
    assert.equal(await W(app, 'w.state.docs.length'), docs + 1, 'the tutorial works on its own tab');
    await app.main.key('Escape');
    await sleep(1000);
    assert.equal(await W(app, 'w.state.docs.length'), docs, 'its tab closed');
    assert.equal(await app.main.eval(`Boolean(document.querySelector('#tutorial-layer.active'))`), false);
    assert.equal(await W(app, 'w.popups.inline'), false, 'popups are OS windows again');
    await noErrorPopup(app, 'tutorial');
  } },
];
