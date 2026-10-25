// Web E2E: starts Vite and headless Edge/Chrome, then drives the real UI over
// CDP — menus, toolbar, dialogs, drawing with the mouse, and every sample
// solved by the WebAssembly engine. Prints "E2E: <passed> passed, <failed> failed".
//
//   node test/e2e/web.mjs                 everything
//   E2E_ONLY=samples node test/e2e/web.mjs   steps whose name contains "samples"
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startVite, launchBrowser, sleep, waitFor } from './cdp.mjs';
import { resultLine, totalsLine } from './report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const shots = path.join(root, 'test-results', 'web');
const only = process.env.E2E_ONLY ?? '';

if (!fs.existsSync(path.join(root, 'public', 'heat.wasm')) && !process.env.E2E_ALLOW_NO_WASM) {
  console.error('public/heat.wasm is missing — run npm run build:wasm first');
  process.exit(1);
}

const vite = await startVite(root);
const { cdp, errors, stop } = await launchBrowser(vite.url);
const results = [];

const js = (expression) => cdp.evaluate(expression);
const q = (selector) => js(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
const clickSel = async (selector) => {
  const box = await js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  if (!box) throw new Error(`no element ${selector}`);
  await cdp.click(box[0], box[1]);
  await sleep(120);
};
const state = () => js('(() => { const s = window.__myheat.state; const d = window.__myheat.doc(); return { tool: s.tool, view: s.view, solving: s.solving, status: s.status, bodies: d.model.bodies.length, boundaries: d.model.boundaries.length, probes: d.model.probes.length, selection: d.selection, hasResult: Boolean(d.result), field: s.fieldKind, showResult: s.showResult, language: s.settings.language, theme: s.settings.theme, docs: s.docs.length, past: d.past.length }; })()');
const closeDialogs = () => js('document.querySelectorAll(".popup-backdrop").forEach((b) => b.remove())');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function step(name, fn) {
  if (only && !name.includes(only)) return;
  const started = performance.now();
  const before = errors.length;
  try {
    await fn();
    if (errors.length > before) throw new Error(`page errors: ${errors.slice(before).join(' | ')}`);
    results.push({ name, ok: true, ms: performance.now() - started });
    console.log(resultLine({ status: 'pass', name, ms: performance.now() - started }));
  } catch (error) {
    results.push({ name, ok: false, ms: performance.now() - started, error: error.message });
    console.log(resultLine({ status: 'fail', name, ms: performance.now() - started, error: error.message }));
    try { await cdp.screenshot(path.join(shots, `fail-${name.replace(/[^\w-]+/g, '_')}.png`)); } catch { /* browser gone */ }
    await closeDialogs().catch(() => {});
  }
}

async function solveCurrent(timeout = 240000) {
  await js('void window.__myheat.run("run")');
  await waitFor(async () => (await state()).solving, 5000).catch(() => {});
  await waitFor(async () => !(await state()).solving, timeout, 250);
  const s = await state();
  if (!s.hasResult) throw new Error(`no result (${s.status})`);
  return js('(() => { const h = window.__myheat.doc().result.header; return { ok: h.ok, stats: h.stats, warnings: h.warnings, fields: Object.keys(h.fields), balance: h.balance, times: h.times.length, probes: h.probes, bodies: h.bodies }; })()');
}

// The program starts in Korean; the tests run it in English so that everything they print is English.
await js('window.__myheat.state.settings.language === "en" || window.__myheat.api.patchSettings({ language: "en" })');

try {
  await step('shell: menu bar, toolbar, panels, status bar', async () => {
    for (const sel of ['[data-testid=menubar]', '[data-testid=toolbar]', '[data-testid=left-panel]', '[data-testid=right-panel]', '[data-testid=statusbar]', '[data-testid=view2d]', '[data-testid=chart-strip]', '[data-testid=workbench]', '[data-testid=tb-language]', '[data-testid=tb-theme]', '[data-testid=tb-settings]', '[data-testid=tb-about]']) {
      assert(await q(sel), `missing ${sel}`);
    }
    // Toolbar: every button inside the window, none clipped.
    const clipped = await js('[...document.querySelectorAll(".toolbar > *")].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).length');
    assert(clipped === 0, `${clipped} toolbar items past the edge`);
    await cdp.screenshot(path.join(shots, '01-shell.png'));
  });

await step('start page: shown at start, templates, samples, backgrounds, home button', async () => {
    assert(await js('!document.querySelector("[data-testid=start-page]").hidden'), 'start page not shown at start');
    for (const sel of ['.start-hero', '[data-testid=start-templates]', '[data-testid=start-recent]', '[data-testid=start-side]', '[data-testid=start-tutorial]', '[data-testid=start-tpl-blank3d]', '[data-testid=start-sample-tutorial]', '[data-testid=anim-convection]']) assert(await q(sel), `missing ${sel}`);
    const frames = await js('window.__myheat.api.startVisible() && document.querySelector(".start-bg").width');
    assert(frames > 0, 'no background canvas');
    await clickSel('[data-testid=anim-convection]');
    assert((await js('window.__myheat.state.settings.animation')) === 'convection', 'background not chosen');
    await cdp.screenshot(path.join(shots, '00-start.png'));
    await clickSel('[data-testid=start-tpl-blank3d]');
    assert(!(await js('window.__myheat.api.startVisible()')), 'start page still shown after a template');
    assert((await js('window.__myheat.doc().model.domain.dim')) === 3, 'not a 3D model');
    await clickSel('[data-testid=tb-home]');
    assert(await js('window.__myheat.api.startVisible()'), 'home did not show the start page');
    await clickSel('[data-testid=start-sample-tutorial]');
    assert((await js('window.__myheat.doc().model.bodies.length')) > 5, 'tutorial sample not opened');
    await clickSel('[data-testid=tb-home]');
    await clickSel('[data-testid=tb-home]');
    assert(!(await js('window.__myheat.api.startVisible()')), 'home did not toggle back');
  });

  await step('menus: every menu opens and lists its items', async () => {
    for (const id of ['file', 'edit', 'view', 'model', 'simulate', 'results', 'tools', 'help']) {
      await clickSel(`[data-testid=menu-${id}]`);
      const items = await js('document.querySelectorAll("[data-testid=menu-popup] .menu-item").length');
      assert(items > 2, `${id}: ${items} items`);
      const offscreen = await js('(() => { const r = document.querySelector("[data-testid=menu-popup]").getBoundingClientRect(); return r.bottom > innerHeight || r.right > innerWidth; })()');
      assert(!offscreen, `${id} menu off screen`);
      await cdp.key('Escape');
    }
    assert(!(await q('[data-testid=menu-popup]')), 'menu still open');
  });

  await step('language: the flag switches English ↔ Korean', async () => {
    await clickSel('[data-testid=tb-language]');
    assert((await state()).language === 'ko', 'not Korean');
    assert(!(await js('document.querySelector("[data-testid=menu-file]").textContent')).includes('File'), 'menu not translated to Korean');
    await clickSel('[data-testid=tb-language]');
    assert((await state()).language === 'en', 'not English');
    assert((await js('document.querySelector("[data-testid=menu-file]").textContent')).includes('File'), 'menu not translated to English');
  });

  await step('theme: cycle button and gallery', async () => {
    const first = (await state()).theme;
    await clickSel('[data-testid=tb-theme]');
    assert((await state()).theme !== first, 'theme did not change');
    await clickSel('[data-testid=tb-theme-menu]');
    assert(await q('[data-testid=theme-menu]'), 'gallery not open');
    await clickSel('[data-testid=theme-pick-light]');
    assert((await state()).theme === 'light', 'light theme not applied');
    assert((await js('document.querySelector(".app").dataset.themeMode')) === 'light', 'mode attribute');
    await cdp.screenshot(path.join(shots, '02-light.png'));
    await clickSel('[data-testid=tb-theme-menu]');
    // Two columns running down (dark | light), the custom theme and its settings at the bottom.
    const columns = await js("getComputedStyle(document.querySelector('.theme-menu-columns')).gridTemplateColumns.split(' ').length");
    assert(columns === 2, `theme menu columns: ${columns}`);
    assert(await q('[data-testid=theme-pick-custom]'), 'no custom theme in the menu');
    await cdp.screenshot(path.join(shots, '02-theme-menu.png'));
    await clickSel('[data-testid=theme-custom-settings]');
    await waitFor(() => q('[data-testid=settings-custom-colors]'), 3000);
    await clickSel('[data-testid=settings-cancel]');
    await clickSel('[data-testid=tb-theme-menu]');
    await clickSel('[data-testid=theme-pick-dark]');
  });

  await step('workbenches: each one fills the tool panel', async () => {
    for (const wb of ['geometry', 'materials', 'loads', 'study', 'results', 'reliability', 'heatmap']) {
      await js(`(() => { const s = document.querySelector('[data-testid=workbench]'); s.value = '${wb}'; s.dispatchEvent(new Event('change')); })()`);
      await sleep(60);
      const tools = await js('document.querySelectorAll("[data-testid=tool-grid] .tool").length');
      assert(tools > 0, `${wb}: no tools`);
    }
    await js("(() => { const s = document.querySelector('[data-testid=workbench]'); s.value = 'geometry'; s.dispatchEvent(new Event('change')); })()");
  });

  await step('drawing: rectangle, circle, polygon and probe with the mouse', async () => {
    await js('window.__myheat.run("new")');
    await sleep(200);
    const box = await js('(() => { const r = document.querySelector("[data-testid=view2d]").getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()');
    const at = (fx, fy) => [box[0] + box[2] * fx, box[1] + box[3] * fy];
    await clickSel('[data-testid=tb-rect]');
    await cdp.drag(at(0.3, 0.6), at(0.5, 0.45));
    let s = await state();
    assert(s.bodies === 1, `rect: ${s.bodies} bodies`);
    await clickSel('[data-testid=tb-circle]');
    await cdp.drag(at(0.62, 0.5), at(0.66, 0.5));
    s = await state();
    assert(s.bodies === 2, `circle: ${s.bodies} bodies`);
    await clickSel('[data-testid=tb-polygon]');
    await cdp.click(...at(0.3, 0.3));
    await cdp.click(...at(0.4, 0.3));
    await cdp.click(...at(0.35, 0.22));
    await cdp.key('Enter');
    s = await state();
    assert(s.bodies === 3, `polygon: ${s.bodies} bodies`);
    await clickSel('[data-testid=tb-probe]');
    await cdp.click(...at(0.4, 0.52));
    s = await state();
    assert(s.probes === 1, `probe: ${s.probes}`);
    await cdp.screenshot(path.join(shots, '03-drawn.png'));
  });

  await step('editing: select, move by dragging, undo / redo, delete', async () => {
    const box = await js('(() => { const r = document.querySelector("[data-testid=view2d]").getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()');
    const at = (fx, fy) => [box[0] + box[2] * fx, box[1] + box[3] * fy];
    await clickSel('[data-testid=tb-select]');
    const x0 = await js('window.__myheat.doc().model.bodies[0].x');
    await cdp.drag(at(0.42, 0.55), at(0.47, 0.55));
    const x1 = await js('window.__myheat.doc().model.bodies[0].x');
    assert(x1 > x0, `body did not move (${x0} → ${x1})`);
    await js('window.__myheat.run("undo")');
    assert(Math.abs((await js('window.__myheat.doc().model.bodies[0].x')) - x0) < 1e-9, 'undo did not restore');
    await js('window.__myheat.run("redo")');
    assert(Math.abs((await js('window.__myheat.doc().model.bodies[0].x')) - x1) < 1e-9, 'redo did not reapply');
    await js('window.__myheat.run("duplicate")');
    assert((await state()).bodies === 4, 'duplicate');
    await cdp.key('Delete', 'Delete');
    assert((await state()).bodies === 3, 'delete');
  });

  await step('properties: edit position, material, power through the panel', async () => {
    await js('(() => { const d = window.__myheat.doc(); d.selection = { kind: "body", ids: [d.model.bodies[0].id] }; window.__myheat.run("fit"); })()');
    await js('window.__myheat.api.updateModel((m) => m, false)');
    await js('window.__myheat.run("select")');
    await sleep(100);
    await js('document.querySelector(".tree-node[data-testid^=tree-body-]").click()');
    await sleep(100);
    const input = 'input[data-testid=prop-power]';
    assert(await q(input), 'no power field');
    await js(`(() => { const el = document.querySelector('${input}'); el.focus(); el.value = '7.5'; el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
    await sleep(100);
    assert((await js('window.__myheat.doc().model.bodies[0].power')) === 7.5, 'power not set');
    await js(`(() => { const el = document.querySelector('[data-testid=prop-material]'); el.value = 'air'; el.dispatchEvent(new Event('change')); })()`);
    assert((await js('window.__myheat.doc().model.bodies[0].material')) === 'air', 'material not set');
  });

  await step('boundaries: convection on a body, edge temperature, target change', async () => {
    await js('window.__myheat.run("bcConvection")');
    let s = await state();
    assert(s.boundaries === 1 && s.selection.kind === 'boundary', 'convection not added');
    await js('(() => { const d = window.__myheat.doc(); d.selection = null; })()');
    await js('window.__myheat.run("bcTemperature")');
    s = await state();
    assert(s.boundaries === 2, 'temperature not added');
    await js(`(() => { const el = document.querySelector('[data-testid=prop-bc-target]'); el.value = 'left'; el.dispatchEvent(new Event('change')); })()`);
    assert((await js('window.__myheat.doc().model.boundaries[1].target')) === 'left', 'target not changed');
  });

  await step('view: grid, mesh and ruler buttons switch on and off', async () => {
    await js('window.__myheat.api.showStart(false)');
    for (const [button, key] of [['tb-showGrid', 'showGrid'], ['tb-showMesh', 'showMesh'], ['tb-showRulers', 'showRulers']]) {
      const before = await js(`window.__myheat.state.settings.${key}`);
      await clickSel(`[data-testid=${button}]`);
      assert((await js(`window.__myheat.state.settings.${key}`)) === !before, `${key} did not switch`);
      assert((await js(`document.querySelector('[data-testid=${button}]').classList.contains('on')`)) === !before, `${button} does not show its state`);
      await clickSel(`[data-testid=${button}]`);
      assert((await js(`window.__myheat.state.settings.${key}`)) === before, `${key} did not switch back`);
    }
  });

  await step('panels: fold to a strip with icon and title, unfold again', async () => {
    await js('window.__myheat.api.showStart(false)');
    for (const side of ['left', 'right']) {
      assert(await q(`[data-testid=panel-head-${side}] .menu-icon`), `${side} title bar has no icon`);
      await clickSel(`[data-testid=collapse-${side}]`);
      const strip = await js(`(() => { const el = document.querySelector('[data-testid=expand-${side}]'); if (!el) return null; const r = el.getBoundingClientRect(); return { w: r.width, text: el.textContent }; })()`);
      assert(strip && strip.w <= 32 && strip.w > 20, `${side} strip ${JSON.stringify(strip)}`);
      assert(/🛠|📝/.test(strip.text) && strip.text.length > 3, `${side} strip lacks icon/title`);
    }
    await cdp.screenshot(path.join(shots, '02b-folded.png'));
    for (const side of ['left', 'right']) {
      await clickSel(`[data-testid=expand-${side}]`);
      assert(await q(`[data-testid=panel-head-${side}]`), `${side} did not unfold`);
    }
  });

  await step('context menus: every right click opens an app menu whose items all have icons', async () => {
    await js("(async () => { const m = await import('/src/core/samples.js'); window.__myheat.api.openModel(m.sampleModel('tutorial', 'ko'), null); })()");
    await sleep(300);
    const center = async (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return [r.left + Math.min(r.width / 2, 40), r.top + r.height / 2]; })()`);
    const places = [
      ['[data-testid=view2d]', 'canvas'], ['.tree-node[data-testid^=tree-body-]', 'body'], ['[data-testid=tree-study]', 'study'], ['[data-testid=tree-materials]', 'materials'],
      ['.tab', 'tab'], ['[data-testid=chart-strip] .chart-body', 'chart'], ['[data-testid=prop-model-name]', 'text'], ['[data-testid=statusbar]', 'general'], ['[data-testid=toolbar]', 'general'],
    ];
    for (const [sel, kind] of places) {
      if (kind === 'text') { await js('window.__myheat.api.select(null)'); await sleep(100); }
      const [x, y] = await center(sel);
      await cdp.click(x, y, 'right');
      await waitFor(() => q('[data-testid=menu-popup]'), 2000).catch(() => {});
      const menu = await js(`(() => { const m = document.querySelector('[data-testid=menu-popup]'); if (!m) return null; const items = [...m.querySelectorAll('.menu-item')]; return { title: m.querySelector('[data-testid=context-title] .menu-icon')?.textContent, n: items.length, noIcon: items.filter((i) => !(i.querySelector('.menu-icon')?.textContent.trim() || i.querySelector('.menu-icon svg'))).map((i) => i.textContent) }; })()`);
      assert(menu, `${kind}: no app menu at ${sel}`);
      assert(menu.title, `${kind}: menu title has no icon`);
      assert(menu.n >= 2, `${kind}: ${menu.n} items`);
      assert(!menu.noIcon.length, `${kind}: items without icons: ${menu.noIcon.join(', ')}`);
      if (kind === 'body') await cdp.screenshot(path.join(shots, '02c-context-body.png'));
      await cdp.key('Escape');
    }
  });

  await step('start page: background transparency on the page and in Settings', async () => {
    await js('window.__myheat.api.showStart(true)');
    await js(`(() => { const el = document.querySelector('[data-testid=start-transparency]'); el.value = '40'; el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
    assert((await js('window.__myheat.state.settings.startBgTransparency')) === 40, 'setting not stored');
    assert(Math.abs(Number(await js('getComputedStyle(document.querySelector(".start-bg")).opacity')) - 0.6) < 0.01, 'canvas opacity not applied');
    await js('window.__myheat.run("settings")');
    await clickSel('[data-testid=settings-tabStartPage]');
    assert((await js('document.querySelector("[data-testid=settings-transparency]").value')) === '40', 'settings slider out of step');
    await js(`(() => { const el = document.querySelector('[data-testid=settings-transparency]'); el.value = '0'; el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
    assert((await js('window.__myheat.state.settings.startBgTransparency')) === 0, 'settings did not apply');
    assert(Math.abs(Number(await js('getComputedStyle(document.querySelector(".start-bg")).opacity')) - 1) < 0.01, 'start page did not follow Settings');
    await clickSel('[data-testid=dialog-close-settings]');
    assert((await js('document.querySelector("[data-testid=tb-home]").textContent')).includes('Home'), 'home button has no label');
    await js('window.__myheat.api.showStart(false)');
  });

  await step('tabs: < and > always on the right, stepping through tabs that overflow', async () => {
    await js('window.__myheat.api.showStart(false)');
    for (let i = 0; i < 12; i++) await js('window.__myheat.run("new")');
    await sleep(300);
    const info = () => js('(() => { const r = document.querySelector("[data-testid=tabs-row]"); const p = document.querySelector("[data-testid=tab-prev]"); const n = document.querySelector("[data-testid=tab-next]"); return { left: r.scrollLeft, max: r.scrollWidth - r.clientWidth, prevShown: !p.hidden, nextShown: !n.hidden, prevOff: p.disabled, nextOff: n.disabled }; })()');
    let t = await info();
    assert(t.prevShown && t.nextShown, `buttons not shown: ${JSON.stringify(t)}`);
    assert(t.nextOff && t.left > 0, 'the newest (active) tab should be scrolled into view at the end');
    await clickSel('[data-testid=tab-prev]');
    await sleep(500);
    const after = await info();
    assert(after.left < t.left && !after.nextOff, `< did not scroll back: ${JSON.stringify(after)}`);
    await clickSel('[data-testid=tab-next]');
    await sleep(500);
    assert((await info()).left > after.left, '> did not scroll on');
    const docs = await js('window.__myheat.state.docs.map((d) => d.id)');
    for (const id of docs.slice(1)) await js(`window.__myheat.api.closeDocForce('${id}')`);
    await sleep(200);
    t = await info();
    assert(t.prevShown && t.nextShown && t.prevOff && t.nextOff, `with one tab the buttons stay, greyed: ${JSON.stringify(t)}`);
    const order = await js('[...document.querySelector("[data-testid=tabstrip]").children].map((el) => el.dataset.testid ?? el.className)');
    assert(order.indexOf('tab-prev') > order.indexOf('tabs-row') && order.indexOf('tab-next') === order.indexOf('tab-prev') + 1, `buttons not on the right: ${order.join(',')}`);
  });

  await step('dialogs: every dialog opens and closes', async () => {
    for (const [command, id] of [['settings', 'settings'], ['about', 'about'], ['materials', 'materials'], ['domain', 'domain'], ['solverSettings', 'study'], ['validate', 'validate'], ['exportReport', 'report'], ['newFromSample', 'samples'], ['shortcuts', 'shortcuts'], ['batchHelp', 'batch'], ['heatmapView', 'heatmap'], ['reliability', 'reliability'], ['uFactor', 'ufactor']]) {
      await js(`window.__myheat.run(${JSON.stringify(command)})`);
      await waitFor(() => q(`[data-testid=dialog-${id}]`), 3000);
      const fits = await js(`(() => { const r = document.querySelector('[data-testid=dialog-${id}]').getBoundingClientRect(); return r.right <= innerWidth && r.bottom <= innerHeight && r.left >= 0 && r.top >= 0; })()`);
      assert(fits, `${id} dialog does not fit the window`);
      await clickSel(`[data-testid=dialog-close-${id}]`);
      assert(!(await q(`[data-testid=dialog-${id}]`)), `${id} did not close`);
    }
  });

  await step('settings: tabs and options apply', async () => {
    await js('window.__myheat.run("settings")');
    for (const tab of ['tabGeneral', 'tabTheme', 'tabCustomTheme', 'tabFont', 'tabStartPage', 'tabResults', 'tabEditor', 'tabPanels', 'tabFiles']) await clickSel(`[data-testid=settings-${tab}]`);
    await clickSel('[data-testid=settings-tabResults]');
    await js(`(() => { const el = document.querySelector('[data-testid=settings-colormap]'); el.value = 'inferno'; el.dispatchEvent(new Event('change')); })()`);
    assert((await js('window.__myheat.state.settings.colormap')) === 'inferno', 'colour map not applied');
    await js(`(() => { const el = document.querySelector('[data-testid=settings-colormap]'); el.value = 'turbo'; el.dispatchEvent(new Event('change')); })()`);
    await clickSel('[data-testid=dialog-close-settings]');
  });

  await step('settings: live preview, Cancel reverts, Apply keeps, Reset restores defaults', async () => {
    const setColormap = (v) => js(`(() => { const el = document.querySelector('[data-testid=settings-colormap]'); el.value = '${v}'; el.dispatchEvent(new Event('change')); })()`);
    await js('window.__myheat.run("settings")');
    await clickSel('[data-testid=settings-tabResults]');
    await setColormap('viridis');
    assert((await js('window.__myheat.state.settings.colormap')) === 'viridis', 'not applied live');
    await clickSel('[data-testid=settings-cancel]');
    assert((await js('window.__myheat.state.settings.colormap')) === 'turbo', 'Cancel did not revert');
    await js('window.__myheat.run("settings")');
    await clickSel('[data-testid=settings-tabResults]');
    await setColormap('inferno');
    await clickSel('[data-testid=settings-apply]');
    assert((await js('window.__myheat.state.settings.colormap')) === 'inferno', 'Apply did not keep');
    await js('window.__myheat.run("settings")');
    await clickSel('[data-testid=settings-reset]');
    assert((await js('window.__myheat.state.settings.colormap')) === 'turbo', 'Reset did not restore');
    // Reset also puts the language back to Korean (and redraws the window): the tests run in English.
    await closeDialogs();
    await js('window.__myheat.api.patchSettings({ language: "en" })');
    await js('window.__myheat.run("settings")');
    await waitFor(() => q('[data-testid=settings-tabCustomTheme]'), 3000);
    await clickSel('[data-testid=settings-tabCustomTheme]');
    await js("(() => { const el = document.querySelector('[data-testid=settings-custom-colors] input[type=color]'); el.value = '#204060'; el.dispatchEvent(new Event('input')); })()");
    assert((await js('window.__myheat.state.settings.theme')) === 'custom', 'custom theme not in use');
    await clickSel('[data-testid=settings-cancel]');
    assert((await js('window.__myheat.state.settings.theme')) !== 'custom', 'Cancel kept the custom theme');
  });

  await step('print: toolbar button after Save, page settings left, live preview right', async () => {
    const order = await js("[...document.querySelectorAll('[data-testid=toolbar] [data-testid^=tb-]')].map((b) => b.dataset.testid).slice(0, 4).join(',')");
    assert(order === 'tb-new,tb-open,tb-save,tb-print', `toolbar order ${order}`);
    await clickSel('[data-testid=tb-print]');
    await waitFor(() => q('[data-testid=print-settings]'), 3000);
    const pages = () => js("document.querySelector('[data-testid=print-pages]').textContent");
    await waitFor(async () => /[0-9]/.test(await pages()), 5000).catch(async () => { throw new Error('no page count: ' + await js("(() => { const s = document.querySelector('[data-testid=print-preview]'); return s.clientWidth + ' ' + s.innerHTML.slice(0, 300); })()")); });
    const box = () => js("(() => { const p = document.querySelector('.print-page'); const r = p.getBoundingClientRect(); return { w: r.width, h: r.height, n: document.querySelectorAll('.print-page').length }; })()");
    const portrait = await box();
    assert(portrait.h > portrait.w, `portrait page ${JSON.stringify(portrait)}`);
    await clickSel('[data-testid=print-landscape]');
    await sleep(400);
    const landscape = await box();
    assert(landscape.w > landscape.h, `landscape page ${JSON.stringify(landscape)}`);
    await js("(() => { const el = document.querySelector('[data-testid=print-paper]'); el.value = 'A3'; el.dispatchEvent(new Event('change')); })()");
    await js("(() => { const el = document.querySelector('[data-testid=print-model]'); el.click(); })()");
    await sleep(400);
    await waitFor(() => js("(() => { const f = document.querySelector('.print-clip iframe'); return Boolean(f && f.contentDocument && f.contentDocument.querySelector('img')); })()"), 4000).catch(() => {});
    const img = await js("(() => { const f = document.querySelector('.print-clip iframe'); return Boolean(f && f.contentDocument.querySelector('img') && f.getBoundingClientRect().height > 100); })()");
    assert(img, 'no viewport picture in the preview');
    await cdp.screenshot(path.join(shots, '05-print.png'));
    await clickSel('[data-testid=print-cancel]');
    assert(!(await q('[data-testid=dialog-print]')), 'print window still open');
  });

  await step('dialogs: picking an item redraws in place (the list keeps its scroll)', async () => {
    // [command, dialog id, scrolled list selector, item selector picked near the bottom]
    const cases = [
      ['materials', 'materials', '.material-list', '.material-list .material-item'],
      ['newFromSample', 'samples', '[data-testid=dialog-samples] .scroll, [data-testid=dialog-samples] .sample-grid, [data-testid=dialog-samples] .popup-body', '[data-testid=dialog-samples] [data-testid^=sample-]'],
      ['settings', 'settings', '.settings-panel', '.settings-panel .theme-swatch'],
    ];
    for (const [command, id, listSel, itemSel] of cases) {
      await js(`window.__myheat.run("${command}")`);
      await waitFor(() => q(`[data-testid=dialog-${id}]`), 3000);
      if (id === 'settings') await clickSel('[data-testid=settings-tabTheme]');
      const result = await js(`(async () => {
        const lists = [...document.querySelectorAll(${JSON.stringify(listSel)})].filter((el) => el.scrollHeight > el.clientHeight + 20);
        const list = lists[0];
        if (!list) return { skip: true };
        list.scrollTop = list.scrollHeight;
        await new Promise((r) => setTimeout(r, 50));
        const before = list.scrollTop;
        const items = [...list.querySelectorAll(${JSON.stringify(itemSel)}), ...document.querySelectorAll(${JSON.stringify(itemSel)})].filter((el) => list.contains(el));
        const r = list.getBoundingClientRect();
        const item = items.reverse().find((el) => { const b = el.getBoundingClientRect(); return b.top > r.top && b.bottom < r.bottom; });
        if (!item) return { skip: true, before };
        item.click();
        await new Promise((r) => setTimeout(r, 120));
        const now = [...document.querySelectorAll(${JSON.stringify(listSel)})].find((el) => el.scrollHeight > el.clientHeight + 20);
        return { before, after: now ? now.scrollTop : -1 };
      })()`);
      if (id === 'settings') await clickSel('[data-testid=settings-cancel]');
      else await js(`document.querySelector('[data-testid=dialog-close-${id}]')?.click()`);
      if (result.skip || result.after === -1) continue; // -1: the pick closed the window (a sample opens)
      assert(result.before > 0 && Math.abs(result.after - result.before) < 4, `${id}: scroll ${result.before} → ${result.after}`);
    }
  });

  await step('file formats: every example in samples/formats opens in the app, solves, saves and reopens', async () => {
    await closeDialogs();
    const opened = await js(`(async () => {
      const out = [];
      for (const name of ['heatsink-2d.myheat', 'window-frame.thmx', 'heatsink-2d.msh', 'pcb-3d.msh', 'heatsink-2d.dxf', 'window-frame.dxf']) {
        const text = await (await fetch('/samples/formats/' + name)).text();
        const before = window.__myheat.state.docs.length;
        window.__myheat.api.openText(name, text);
        const d = window.__myheat.doc();
        out.push({ name, newTab: window.__myheat.state.docs.length === before + 1, bodies: d.model.bodies.length, dim: d.model.domain.dim });
      }
      return out;
    })()`);
    // A .myheat may take over an untouched "untitled" tab instead of adding one.
    for (const o of opened) assert((o.newTab || o.name.endsWith('.myheat')) && o.bodies > 0, `${o.name}: ${JSON.stringify(o)}`);
    assert(opened.find((o) => o.name === 'pcb-3d.msh').dim === 3, 'the 3D mesh did not open as a 3D model');
    // The THERM section solves as it came in.
    await js(`(async () => { const text = await (await fetch('/samples/formats/window-frame.thmx')).text(); window.__myheat.api.openText('window-frame.thmx', text); })()`);
    const r = await solveCurrent();
    assert(r.ok && Number.isFinite(r.stats.Tmax), `THERM model did not solve: ${JSON.stringify(r.stats)}`);
    // Save in every format and open the saved text again (the downloads themselves are the browser's business).
    const saved = await js(`(async () => {
      const f = await import('/src/core/formats.js');
      const i = await import('/src/core/interop.js');
      const m = window.__myheat.doc().model;
      const result = window.__myheat.doc().result;
      const out = {
        thmx: f.modelToTherm(m).length, msh: f.gmshMsh(m).length, dxf: f.dxfFromModel(m).length, bdf: f.nastranBdf(m).length,
        cdb: f.ansysCdb(m).length, mphtxt: f.comsolMphtxt(m).length, stl: f.modelStl(m).length, inp: i.calculixDeck(m).length, vtu: f.resultVtu(result, m.name).length,
      };
      const before = window.__myheat.state.docs.length;
      window.__myheat.api.openText('again.thmx', f.modelToTherm(m));
      window.__myheat.api.openText('again.msh', f.gmshMsh(m));
      window.__myheat.api.openText('again.dxf', f.dxfFromModel(m));
      out.reopened = window.__myheat.state.docs.length - before;
      return out;
    })()`);
    for (const [ext, length] of Object.entries(saved)) if (ext !== 'reopened') assert(length > 100, `.${ext} empty`);
    assert(saved.reopened === 3, `reopened ${saved.reopened} of 3`);
    // The list of formats.
    await js('window.__myheat.run("fileFormats")');
    await waitFor(() => q('[data-testid=formats-list]'), 3000);
    const rows = await js("document.querySelectorAll('[data-testid=formats-list] tbody tr').length");
    assert(rows >= 20, `formats table rows ${rows}`);
    await cdp.screenshot(path.join(shots, '07-formats.png'));
    await closeDialogs();
  });

  await step('imports: Nastran, Ansys, CalculiX and COMSOL decks and an IDF board open as new models', async () => {
    await closeDialogs();
    const opened = await js(`(async () => {
      const get = async (name) => (await fetch('/samples/formats/' + name)).text();
      const out = [];
      for (const name of ['heatsink-2d.bdf', 'heatsink-2d.cdb', 'heatsink-2d.inp', 'heatsink-2d.mphtxt', 'pcb-3d.bdf', 'pcb-3d.cdb']) {
        const before = window.__myheat.state.docs.length;
        window.__myheat.api.openText(name, await get(name));
        const d = window.__myheat.doc();
        out.push({ name, newTab: window.__myheat.state.docs.length === before + 1, bodies: d.model.bodies.length, dim: d.model.domain.dim, power: d.model.bodies.reduce((s, b) => s + (b.power || 0), 0), bcs: d.model.boundaries.length });
      }
      const before = window.__myheat.state.docs.length;
      window.__myheat.api.openText('controller-board.emn', await get('controller-board.emn'), { library: await get('controller-board.emp') });
      const d = window.__myheat.doc();
      out.push({ name: 'controller-board.emn', newTab: window.__myheat.state.docs.length === before + 1, bodies: d.model.bodies.length, dim: d.model.domain.dim, power: d.model.bodies.reduce((s, b) => s + (b.power || 0), 0), bcs: d.model.boundaries.length });
      return out;
    })()`);
    for (const o of opened) assert(o.newTab && o.bodies > 0 && o.bcs > 0, `${o.name}: ${JSON.stringify(o)}`);
    assert(opened.filter((o) => o.name.startsWith('pcb-3d')).every((o) => o.dim === 3 && Math.abs(o.power - 3.2) < 1e-6), `3D decks: ${JSON.stringify(opened)}`);
    const idf = opened.at(-1);
    assert(idf.dim === 3 && idf.bodies === 5 && Math.abs(idf.power - 4.55) < 1e-6, `IDF board: ${JSON.stringify(idf)}`);
    const r = await solveCurrent();
    assert(r.ok && r.stats.Tmax > 25, `the IDF board did not solve: ${JSON.stringify(r.stats)}`);
  });

  await step('3D post-processing: slice, isosurface, 3D line cut, probe and line CSV, body integrals', async () => {
    await closeDialogs();
    await js('window.__myheat.run("newFromSample")');
    await clickSel('[data-testid=sample-pcb3d]');
    const r = await solveCurrent();
    assert(r.ok, 'pcb3d did not solve');
    await js('window.__myheat.run("view3d")');
    await waitFor(() => q('[data-testid=view3d] canvas'), 10000);
    await js("(() => { const el = document.querySelector('[data-testid=slice-axis]'); el.value = 'y'; el.dispatchEvent(new Event('change')); })()");
    await sleep(300);
    assert(await q('[data-testid=slice-index]'), 'no slice position field');
    await clickSel('[data-testid=iso-toggle]');
    await sleep(500);
    const tris = await js('window.__myheat.view3d?.isoTriangles ?? 0');
    assert(tris > 0, `isosurface has ${tris} triangles`);
    await cdp.screenshot(path.join(shots, '06d-slice-iso.png'));
    await clickSel('[data-testid=iso-toggle]');
    await js("(() => { const el = document.querySelector('[data-testid=slice-axis]'); el.value = ''; el.dispatchEvent(new Event('change')); })()");
    // A line through the volume, typed as two points.
    await js('window.__myheat.run("lineCut3d")');
    await waitFor(() => q('[data-testid=line3d-apply]'), 3000).catch(() => { throw new Error('the 3D line window did not open'); });
    await clickSel('[data-testid=line3d-apply]');
    await sleep(300);
    assert(await js('Boolean(window.__myheat.state.lastLine?.samples?.length > 10)'), 'no samples along the 3D line');
    const csv = await js(`(async () => { const r = await import('/src/core/result.js'); const d = window.__myheat.doc(); return { probes: r.probesCsv(d.result.header, d.model, '°C').split('\\n').length, line: r.lineCsv(window.__myheat.state.lastLine.samples, 'T', '°C').split('\\n').length }; })()`);
    assert(csv.probes >= 2 && csv.line > 10, `csv ${JSON.stringify(csv)}`);
    // The report lists integrals per body.
    await js('window.__myheat.run("exportReport")');
    await waitFor(() => q('[data-testid=dialog-report]'), 3000).catch(() => { throw new Error('no report window'); });
    assert(/∫T dV/.test(await js("document.querySelector('[data-testid=dialog-report]').textContent")), 'no body integrals in the report');
    await closeDialogs();
    await js('window.__myheat.run("view2d")');
  });

  await step('comfort inputs and THERM extras: met / clo change PMV, tags give U per tag, cavity k', async () => {
    await closeDialogs();
    await js('window.__myheat.run("newFromSample")');
    await clickSel('[data-testid=sample-officeComfort]');
    await solveCurrent(600000);
    await js('window.__myheat.run("fieldComfort")');
    const mean = () => js("(() => { const v = window.__myheat.doc().result.derived.pmv; let s = 0, n = 0; for (const x of v) if (Number.isFinite(x)) { s += x; n++; } return s / n; })()");
    const before = await mean();
    await js("window.__myheat.api.updateModel((m) => ({ ...m, study: { ...m.study, comfort: { ...m.study.comfort, clo: 1.5 } } }))");
    await js('window.__myheat.run("fieldComfort")');
    const after = await mean();
    assert(after > before + 0.2, `PMV did not rise with clothing: ${before} → ${after}`);
    await js('window.__myheat.run("fieldPPD")');
    assert((await js('window.__myheat.state.fieldKind')) === 'ppd', 'PPD field not shown');
    // THERM: tag the warm and cold sides of the window frame and read U per tag.
    await js('window.__myheat.run("newFromSample")');
    await clickSel('[data-testid=sample-windowFrame]');
    await solveCurrent();
    await js("window.__myheat.api.updateModel((m) => ({ ...m, boundaries: m.boundaries.map((b) => (b.type === 'convection' ? { ...b, tag: 'Frame' } : b)) }))");
    await solveCurrent();
    await js('window.__myheat.run("uFactor")');
    await waitFor(() => q('[data-testid=dialog-ufactor]'), 3000);
    assert(await q('[data-testid=u-tags]'), 'no U-factor-by-tag table');
    assert(Number.isFinite(parseFloat(await js("document.querySelector('[data-testid=cavity-k]').textContent"))), 'no cavity k');
    await closeDialogs();
  });

  await step('engineering tools: every dialog opens from its command and adds to the model', async () => {
    await closeDialogs();
    await js('window.__myheat.run("newFromSample")');
    await clickSel('[data-testid=sample-tutorial]');
    const bodies = () => js('window.__myheat.doc().model.bodies.length');
    for (const [command, id] of [['compactModel', 'compact'], ['heatSink', 'heatsink'], ['pcbStackup', 'stackup'], ['powerMap', 'powermap'], ['solderFatigue', 'fatigue'], ['harmonic', 'harmonic'], ['heatmapCompare', 'hmcompare']]) {
      await js(`window.__myheat.run("${command}")`);
      await waitFor(() => q(`[data-testid=dialog-${id}]`), 3000).catch(() => { throw new Error(`${command}: no window`); });
      await closeDialogs();
    }
    const before = await bodies();
    await js('window.__myheat.run("compactModel")');
    await waitFor(() => q('[data-testid=compact-add]'), 3000);
    await clickSel('[data-testid=compact-add]');
    await sleep(200);
    assert((await bodies()) === before + 3, 'the package did not add three bodies');
    await closeDialogs();
    await js('window.__myheat.run("heatSink")');
    await waitFor(() => q('[data-testid=heatsink-add]'), 3000);
    await clickSel('[data-testid=heatsink-add]');
    await sleep(200);
    assert((await bodies()) > before + 3, 'the heat sink added nothing');
    await closeDialogs();
  });

  await step('new tools: calculator and histogram, PSD table, half-sine shock, cavity k to a material', async () => {
    await closeDialogs();
    await js('window.__myheat.run("newFromSample")');
    await clickSel('[data-testid=sample-tutorial]');
    await solveCurrent();
    await js('window.__myheat.run("calculator")');
    await waitFor(() => q('[data-testid=calc-result]'), 3000);
    const setExpr = (value) => js(`(() => { const el = document.querySelector('[data-testid=calc-expr]'); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await setExpr('T + 273.15');
    const tmax = await js('window.__myheat.doc().result.header.stats.Tmax');
    const kmax = parseFloat(await js("document.querySelector('[data-testid=calc-max]').textContent"));
    assert(Math.abs(kmax - (tmax + 273.15)) < 0.01, `calculator max ${kmax} vs ${tmax + 273.15}`);
    await setExpr('T +* 2');
    assert(await q('[data-testid=calc-error]'), 'a broken expression shows no error');
    await setExpr('T - Tamb');
    await clickSel('[data-testid=calc-show]');
    assert((await js('window.__myheat.state.fieldKind')) === 'calc', 'the calculated field is not shown');
    assert(await js('Boolean(window.__myheat.doc().result.derived?.calc?.values?.length)'), 'no derived field');
    await closeDialogs();
    // Fatigue window: a PSD table and the half-sine shock tab.
    await js('window.__myheat.run("solderFatigue")');
    await waitFor(() => q('[data-testid=fatigue-tab-vibration]'), 3000);
    await clickSel('[data-testid=fatigue-tab-vibration]');
    await js(`(() => { const el = document.querySelector('[data-testid=fatigue-vib-input]'); el.value = 'table'; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await waitFor(() => q('[data-testid=fatigue-vib-table]'), 2000);
    const gin = parseFloat(await js("document.querySelector('[data-testid=fatigue-vib-grms-in]').textContent"));
    assert(Math.abs(gin - 6.06) < 0.05, `PSD table input Grms ${gin}`);
    assert(parseFloat(await js("document.querySelector('[data-testid=fatigue-vib-grms]').textContent")) > gin, 'no resonance amplification');
    await clickSel('[data-testid=fatigue-tab-shock]');
    await waitFor(() => q('[data-testid=fatigue-shock-srs]'), 2000);
    const srs = parseFloat(await js("document.querySelector('[data-testid=fatigue-shock-srs]').textContent"));
    assert(srs > 0.1 && srs < 2, `shock response ${srs}`);
    assert(Number.isFinite(parseFloat(await js("document.querySelector('[data-testid=fatigue-shock-margin]').textContent"))), 'no shock margin');
    await closeDialogs();
    // THERM: the cavity conductivity goes into a material.
    await js('window.__myheat.run("newFromSample")');
    await clickSel('[data-testid=sample-windowFrame]');
    await solveCurrent();
    await js('window.__myheat.run("uFactor")');
    await waitFor(() => q('[data-testid=cavity-apply]'), 3000);
    const target = await js("document.querySelector('[data-testid=cavity-material]').value");
    const k = parseFloat(await js("document.querySelector('[data-testid=cavity-k]').textContent"));
    await clickSel('[data-testid=cavity-apply]');
    const applied = await js(`window.__myheat.doc().model.materials.find((m) => m.id === ${JSON.stringify(target)}).k`);
    assert(Math.abs(applied - k) < 1e-3 * Math.max(1, k), `cavity k ${k} not applied (${applied})`);
    await closeDialogs();
  });

  await step('internal fan and solar load: an internal fan from the Model menu, flow in 3D, the sun in the study settings', async () => {
    await closeDialogs();
    await js('window.__myheat.run("newFromSample")');
    await clickSel('[data-testid=sample-pcb3d]');
    await js('window.__myheat.run("toggleFlow")');
    assert(await js('window.__myheat.doc().model.study.flow'), 'flow did not switch on for a 3D model');
    await js('window.__myheat.run("toggleFlow")');
    await js('window.__myheat.run("bcInternalFan")');
    const fan = await js('window.__myheat.doc().model.boundaries.at(-1)');
    assert(fan.type === 'internalFan' && fan.target === 'interior' && fan.region?.length === 6 && fan.direction === '+x' && fan.curve?.length >= 2, `internal fan: ${JSON.stringify(fan)}`);
    await waitFor(() => q('[data-testid=prop-fan-direction]'), 2000);
    assert(await js("[...document.querySelector('[data-testid=prop-fan-direction]').options].some((o) => o.value === '-z')"), 'no z directions in 3D');
    assert(await q('[data-testid=prop-fan-curve]'), 'no fan curve field');
    // Solar load in the study settings.
    await js('window.__myheat.api.select({ kind: "study", ids: [] })');
    await waitFor(() => q('[data-testid=study-solar]'), 2000);
    await clickSel('[data-testid=study-solar]');
    assert(await js('window.__myheat.doc().model.study.solar.enabled'), 'solar load did not switch on');
    await waitFor(() => q('[data-testid=study-solar-el]'), 2000);
    assert(await q('[data-testid=study-solar-g]') && await q('[data-testid=study-solar-az]'), 'no irradiance / azimuth fields');
  });

  await step('new views: 3D node heat map, a probe placed by clicking the 3D view, transmissibility at a probe', async () => {
    await closeDialogs();
    await js('window.__myheat.run("heatmapView")');
    await waitFor(() => q('[data-testid=heatmap-sample-3d]'), 3000);
    await clickSel('[data-testid=heatmap-sample-3d]');
    await sleep(300);
    assert((await js("document.querySelector('[data-testid=heatmap-view]').value")) === '3d', '3D view not chosen');
    assert(await q('[data-testid=heatmap-z0]'), 'no z range');
    await js(`(() => { const el = document.querySelector('[data-testid=heatmap-view]'); el.value = '2d'; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await sleep(200);
    assert(await js('Boolean(window.__myheat.state.heatmap.raster?.raster?.length)'), 'no plan map for the 3D data');
    await closeDialogs();
    // Leave the heat map window empty, as the later heat-map step expects.
    await js('Object.assign(window.__myheat.state.heatmap, { data: null, raster: null, zRange: null, view: "2d" })');
    // Probe by clicking the 3D view of a 3D model.
    await js('window.__myheat.run("newFromSample")');
    await clickSel('[data-testid=sample-pcb3d]');
    await js('window.__myheat.api.setView("3d")');
    await waitFor(() => q('[data-testid=view3d] canvas'), 5000);
    await sleep(600);
    await js('window.__myheat.run("probe")');
    const probes = () => js('window.__myheat.doc().model.probes.length');
    const before = await probes();
    const box = await js('(() => { const r = document.querySelector("[data-testid=view3d] canvas").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()');
    await cdp.click(box[0], box[1]);
    await sleep(300);
    assert((await probes()) === before + 1, 'clicking the 3D view did not place a probe');
    const p = await js('window.__myheat.doc().model.probes.at(-1)');
    const dom = await js('window.__myheat.doc().model.domain');
    assert(p.z >= 0 && p.z <= dom.depth && p.x >= 0 && p.x <= dom.width, `probe outside the domain: ${JSON.stringify(p)}`);
    await js('window.__myheat.run("select")');
    await js('window.__myheat.api.setView("2d")');
    // Transmissibility at a probe of a modal result.
    await js('window.__myheat.run("newFromSample")');
    await clickSel('[data-testid=sample-bracketModal]');
    // The free end of the L-bracket (fixed on the left edge) is at x 100–110, y 80–90.
    await js("window.__myheat.api.updateModel((m) => ({ ...m, probes: [...m.probes, { id: 'tip', name: 'tip', x: 105, y: 85, z: 2.5 }] }))");
    const r = await solveCurrent();
    assert(r.ok, 'modal study failed');
    assert(await js('window.__myheat.doc().result.header.modes.every((m) => Array.isArray(m.factor))'), 'the engine wrote no participation factors');
    await js('window.__myheat.run("harmonic")');
    await waitFor(() => q('[data-testid=harmonic-kind]'), 3000);
    assert(await js("[...document.querySelector('[data-testid=harmonic-kind]').options].some((o) => o.value === 'probe:tip')"), 'no probe response option');
    await js(`(() => { const el = document.querySelector('[data-testid=harmonic-kind]'); el.value = 'probe:tip'; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await sleep(300);
    const peak = parseFloat(await js("document.querySelector('[data-testid=harmonic-peak-table] tbody tr td:nth-child(2)')?.textContent ?? 'NaN'"));
    assert(peak > 3, `no resonance in the transmissibility (peak ${peak})`);
    await closeDialogs();
  });

  await step('view: reset view centres at 100 %, bottom panel folds, hides and comes back', async () => {
    await clickSel('[data-testid=tb-zoomIn]').catch(() => {});
    await clickSel('[data-testid=tb-zoomReset]');
    await sleep(200);
    assert((await js("document.querySelector('[data-testid=zoom-value]').textContent")) === '100%', 'not 100 %');
    if (!(await js('window.__myheat.state.settings.showChartPanel'))) await clickSel('[data-testid=tb-chartPanel]');
    await clickSel('[data-testid=collapse-bottom]');
    assert(await js('window.__myheat.state.settings.bottomCollapsed'), 'not folded');
    assert(await q('[data-testid=unfold-bottom]'), 'no unfold bar');
    await clickSel('[data-testid=unfold-bottom]');
    assert(!(await js('window.__myheat.state.settings.bottomCollapsed')), 'not unfolded');
    await clickSel('[data-testid=hide-bottom]');
    assert(!(await js('window.__myheat.state.settings.showChartPanel')), 'not hidden');
    await clickSel('[data-testid=tb-chartPanel]');
    assert(await js('window.__myheat.state.settings.showChartPanel'), 'toolbar did not bring it back');
  });

  await step('materials: add from the library to the model', async () => {
    await js('window.__myheat.run("materials")');
    await clickSel('[data-testid=mat-library-copper]');
    await clickSel('[data-testid=mat-add]');
    assert(await js('window.__myheat.doc().model.materials.some((m) => m.id === "copper")'), 'copper not added');
    await clickSel('[data-testid=dialog-close-materials]');
  });

  await step('heat map: sample node data, statistics, raster', async () => {
    await js('window.__myheat.run("heatmapView")');
    await clickSel('[data-testid=heatmap-sample]');
    await sleep(300);
    assert(await js('Boolean(window.__myheat.state.heatmap.raster?.raster?.length)'), 'no raster');
    assert((await js('document.querySelector("[data-testid=dialog-heatmap]").textContent')).includes('P5'), 'no statistics');
    await cdp.screenshot(path.join(shots, '04-heatmap.png'));
    await clickSel('[data-testid=dialog-close-heatmap]');
  });

  await step('thermal analysis: Tg, kinetics, TGA steps, sapphire cp', async () => {
    const text = (sel) => js(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? ''`);
    const pick = (sel, value) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    const num = (s, re) => Number((re.exec(s) ?? [])[1]);
    await js('window.__myheat.run("thermalAnalysis")');
    await waitFor(() => q('[data-testid=dialog-thermal]'), 3000);
    assert(await js('(() => { const r = document.querySelector("[data-testid=dialog-thermal]").getBoundingClientRect(); return r.right <= innerWidth && r.bottom <= innerHeight && r.left >= 0 && r.top >= 0; })()'), 'thermal dialog does not fit');
    // DSC: sample peak, linear vs sigmoid baseline, a second peak, derivative, conversion view, multi-point calibration.
    await clickSel('[data-testid=thermal-dsc]');
    await clickSel('[data-testid=thermal-sample]');
    const h1 = num(await text('[data-testid=thermal-dsc-result]'), /([\d.]+) J\/g/);
    assert(h1 > 120 && h1 < 240, `DSC enthalpy ${h1}`);
    await pick('[data-testid=thermal-baseline]', 'sigmoid');
    const h2 = num(await text('[data-testid=thermal-dsc-result]'), /([\d.]+) J\/g/);
    assert(h2 > 120 && h2 < 240, `sigmoid enthalpy ${h2}`);
    await clickSel('[data-testid=thermal-peak-add]');
    assert(await js('document.querySelectorAll("[data-testid=thermal-peaks-table] tbody tr").length') === 2, 'no row per peak');
    await clickSel('[data-testid=thermal-peak-remove-2]');
    assert(!(await q('[data-testid=thermal-peaks-table]')), 'peak not removed');
    await clickSel('[data-testid=thermal-deriv]');
    await clickSel('[data-testid=thermal-view-alpha]');
    await clickSel('[data-testid=thermal-view-curve]');
    await pick('[data-testid=thermal-cal-mode]', 'multi');
    await clickSel('[data-testid=thermal-cal-add]');
    assert(await q('[data-testid=thermal-cal-measured-2]'), 'third standard missing');
    await clickSel('[data-testid=thermal-cal-fit]');
    assert((await text('[data-testid=thermal-cal-result]')).includes('R²'), 'multi-point calibration result missing');
    await clickSel('[data-testid=thermal-cal-reset]');
    // Tg
    await clickSel('[data-testid=thermal-tg-sample]');
    const tg = num(await text('[data-testid=thermal-tg-result]'), /\(Tg\)\s*([\d.]+)/);
    assert(Math.abs(tg - 105) < 3, `Tg midpoint ${tg}`);
    // Kinetics (sample runs: Ea = 80 kJ/mol)
    await clickSel('[data-testid=thermal-kinetics]');
    await clickSel('[data-testid=thermal-kin-sample]');
    const kin = await text('[data-testid=thermal-kin-result]');
    const ea = num(kin, /Ea([\d.]+) kJ/);
    assert(Math.abs(ea - 80) < 6, `Kissinger Ea ${ea} (${kin})`);
    assert(/Ozawa/.test(kin) && /Friedman/.test(kin), `OFW / Friedman missing: ${kin}`);
    const friedmanEa = num(kin.slice(kin.indexOf('Friedman')), /Ea([\d.]+) kJ/);
    assert(Math.abs(friedmanEa - 80) < 6, `Friedman Ea ${friedmanEa}`);
    assert(await js('document.querySelectorAll("[data-testid=thermal-kin-profile] tbody tr").length') === 9, 'no Ea(α) profile');
    await clickSel('[data-testid=thermal-view-ea]');
    await clickSel('[data-testid=thermal-view-curves]');
    await clickSel('[data-testid=thermal-view-kissinger]');
    // TGA steps
    await clickSel('[data-testid=thermal-tga]');
    await clickSel('[data-testid=thermal-sample]');
    assert(await js('document.querySelectorAll("[data-testid=thermal-tga-steps] tbody tr").length') >= 2, 'TGA steps missing');
    await clickSel('[data-testid=thermal-dtg]');
    // cp (sapphire)
    await clickSel('[data-testid=thermal-cp]');
    await clickSel('[data-testid=thermal-cp-sample]');
    const cp = await text('[data-testid=thermal-cp-result]');
    const lo = num(cp, /([\d.]+) –/);
    assert(Math.abs(lo - 1.29) < 0.05, `cp ${cp}`);
    const cpBefore = await js('window.__myheat.doc().model.materials.filter((m) => m.cpT).length');
    await clickSel('[data-testid=thermal-cp-use]');
    assert(await js(`(() => { const m = window.__myheat.doc().model.materials.filter((m) => m.cpT); return m.length === ${cpBefore} + 1 && m.at(-1).cpT.length > 10 && m.at(-1).cpT[0].length === 2; })()`), 'cp(T) material not added');
    await cdp.screenshot(path.join(shots, '05-thermal.png'));
    await clickSel('[data-testid=dialog-close-thermal]');
  });

  // Every sample, solved by heat.wasm; the expected numbers are physical sanity ranges.
  const SAMPLES = {
    windowFrame: (r) => r.stats.Tmin > -18 && r.stats.Tmax < 21,
    wallStud: (r) => r.stats.Tmin > -10 && r.stats.Tmax < 20,
    satellitePanel: (r) => r.stats.Tmax > -100 && r.stats.Tmax < 120,
    pcb3d: (r) => r.stats.Tmax > 30 && r.stats.Tmax < 200,
    icPackage: (r) => r.stats.Tmax > 25 && r.fields.includes('vonMises'),
    ledStress: (r) => r.stats.Tmax > 25 && r.fields.includes('vonMises'),
    pcmSink: (r) => r.times > 10 && r.fields.includes('liquid'),
    battery: (r) => r.times > 10 && r.stats.Tmax > 25,
    brakeDisc: (r) => r.times > 10 && r.stats.Tmax > 60,
    cpuHeatsink: (r) => r.fields.includes('u') && r.stats.Tmax > 25,
    microchannel: (r) => r.fields.includes('u') && r.stats.Tmax > 20,
    porous: (r) => r.fields.includes('u') && r.stats.Tmax > 20,
    naturalConvection: (r) => r.fields.includes('u') && r.stats.Tmax > 20,
    busbar: (r) => r.fields.includes('V') && r.stats.Tmax > 40 && r.stats.Tmax < 120,
    tumorAblation: (r) => r.times > 10 && r.stats.Tmax > 50 && r.stats.Tmax < 60,
    vacuumOven: (r) => r.fields.includes('qrad') && r.stats.Tmax > 150 && r.stats.Tmax < 400,
    sunWallDay: (r) => r.times > 10 && r.stats.Tmax > 10 && r.stats.Tmax < 40,
    coatedTurbine: (r) => r.stats.Tmax > 1000 && r.stats.Tmax < 1200,
    naturalFins: (r) => r.stats.Tmax > 35 && r.stats.Tmax < 80,
    heatSink3d: (r) => r.stats.Tmax > 45 && r.stats.Tmax < 75 && r.fields.includes('w'),
    fanChassis3d: (r) => r.stats.Tmax > 50 && r.stats.Tmax < 95 && r.fields.includes('w'),
    sunCabinet3d: (r) => r.stats.Tmax > 38 && r.stats.Tmax < 55,
  };
  await step('3D guides: grid and tick numbers stay behind the bodies, numbers over the grid, unit on the numbers', async () => {
    await closeDialogs();
    await js('window.__myheat.run("newFromSample")');
    await clickSel('[data-testid=sample-pcb3d]');
    await js('window.__myheat.run("view3d")');
    await waitFor(() => q('[data-testid=view3d] canvas'), 10000);
    await sleep(500);
    for (let i = 0; i < 3; i++) await js('window.__myheat.run("zoomOut")');
    await sleep(400);
    await cdp.screenshot(path.join(shots, '06b-guides3d.png'));
    await js('window.__myheat.run("zoomReset")');
    await sleep(300);
    await cdp.screenshot(path.join(shots, '06c-guides3d-reset.png'));
    await js('window.__myheat.run("view2d")');
  });

  for (const [id, check] of Object.entries(SAMPLES)) {
    await step(`samples: ${id} solves (WASM)`, async () => {
      await closeDialogs();
      await js('window.__myheat.run("newFromSample")');
      await clickSel(`[data-testid=sample-${id}]`);
      const r = await solveCurrent();
      assert(r.ok, 'not ok');
      assert(Number.isFinite(r.stats.Tmin) && Number.isFinite(r.stats.Tmax), `stats ${JSON.stringify(r.stats)}`);
      assert(check(r), `out of range: ${JSON.stringify({ stats: r.stats, fields: r.fields, times: r.times })}`);
      if (r.balance && r.times <= 1 && !r.fields.includes('u')) assert(Math.abs(r.balance.error) < 0.02, `energy balance ${JSON.stringify(r.balance)}`);
      assert(await q('[data-testid=legend]'), 'no colour bar');
      await cdp.screenshot(path.join(shots, `sample-${id}.png`));
    });
  }

  await step('results: fields, isotherms, vectors, animation frames, 3D view, line cut', async () => {
    await js('window.__myheat.run("newFromSample")');
    await clickSel('[data-testid=sample-pcmSink]');
    await solveCurrent();
    for (const cmd of ['fieldFlux', 'fieldLiquid', 'fieldT']) {
      await js(`window.__myheat.run(${JSON.stringify(cmd)})`);
      assert((await state()).showResult, cmd);
    }
    await js('window.__myheat.run("isotherms")');
    await js('window.__myheat.run("vectors")');
    assert(await q('[data-testid=frame-bar]'), 'no frame slider');
    await js(`(() => { const el = document.querySelector('[data-testid=frame-slider]'); el.value = '5'; el.dispatchEvent(new Event('input')); })()`);
    assert((await js('window.__myheat.doc().frame')) === 5, 'frame not set');
    await cdp.screenshot(path.join(shots, '05-results.png'));
    await js('window.__myheat.run("view3d")');
    await waitFor(() => q('[data-testid=view3d] canvas'), 10000);
    await sleep(600);
    await cdp.screenshot(path.join(shots, '06-view3d.png'));
    await js('window.__myheat.run("view2d")');
    const box = await js('(() => { const r = document.querySelector("[data-testid=view2d]").getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()');
    await js('window.__myheat.run("lineCut")');
    await cdp.click(box[0] + box[2] * 0.3, box[1] + box[3] * 0.5);
    await cdp.click(box[0] + box[2] * 0.7, box[1] + box[3] * 0.5);
    assert(await js('Boolean(window.__myheat.doc().lineCut?.b)'), 'line cut not set');
    assert((await js('window.__myheat.state.chartTab')) === 'line', 'chart not on the line cut');
    await js('window.__myheat.run("isotherms")');
    await js('window.__myheat.run("vectors")');
  });

  await step('reliability and U-factor read the result', async () => {
    await js('window.__myheat.run("newFromSample")');
    await clickSel('[data-testid=sample-windowFrame]');
    await solveCurrent();
    await js('window.__myheat.run("uFactor")');
    const u = await js('Number(document.querySelector("[data-testid=u-value]").textContent)');
    assert(u > 0.5 && u < 10, `U = ${u}`);
    await clickSel('[data-testid=dialog-close-ufactor]');
    await js('window.__myheat.run("newFromSample")');
    await clickSel('[data-testid=sample-pcb3d]');
    await solveCurrent();
    await js('window.__myheat.run("reliability")');
    const rows = await js('document.querySelectorAll("[data-testid=dialog-reliability] tbody tr").length');
    assert(rows === 3, `${rows} components`);
    await clickSel('[data-testid=dialog-close-reliability]');
  });

  await step('stop: a running study can be cancelled', async () => {
    await js('window.__myheat.run("newFromSample")');
    await clickSel('[data-testid=sample-naturalConvection]');
    await js('void window.__myheat.run("run")');
    await waitFor(async () => (await state()).solving, 5000);
    await sleep(500);
    await clickSel('[data-testid=solve-stop]');
    await waitFor(async () => !(await state()).solving, 10000);
    assert((await state()).status === 'statusCancelled', `status ${(await state()).status}`);
  });

  await step('tutorial: every step runs, outlines its target, and the end restores everything', async () => {
    await closeDialogs();
    const before = await js('({ docs: window.__myheat.state.docs.length, theme: window.__myheat.state.settings.theme, active: window.__myheat.state.activeId })');
    await js('window.__myheat.api.startTutorial(0)');
    await waitFor(() => q('[data-testid=tour-card]'), 3000);
    const total = await js('window.__myheat.tutorial.state().total');
    assert(total >= 40, `${total} steps`);
    const missing = [];
    for (let i = 0; i < total; i++) {
      await js(`window.__myheat.tutorial.go(${i})`);
      const info = await js(`(async () => { const m = await import('/src/ui/tutorial.js'); const st = m.STEPS[${i}]; return { id: st.id, found: Boolean(document.querySelector(st.target)), title: document.querySelector('[data-testid=tour-title]')?.textContent }; })()`);
      if (!info.found) missing.push(info.id);
      assert(info.title, `step ${i} has no title`);
    }
    assert(!missing.length, `targets missing: ${missing.join(', ')}`);
    await clickSel('[data-testid=tour-next]'); // the last step's button ends the tour
    await waitFor(async () => !(await js('window.__myheat.tutorial.state().active')), 5000);
    const after = await js('({ docs: window.__myheat.state.docs.length, theme: window.__myheat.state.settings.theme, active: window.__myheat.state.activeId, done: window.__myheat.state.settings.tutorialDone })');
    assert(after.docs === before.docs, `tutorial tabs left open: ${before.docs} → ${after.docs}`);
    assert(after.theme === before.theme, `theme not restored: ${after.theme}`);
    assert(after.active === before.active, 'active tab not restored');
    assert(after.done, 'tutorialDone not set');
    assert(!(await q('[data-testid=tour-card]')), 'card still shown');
  });

  await step('context menu: right click on the canvas', async () => {
    await js('window.__myheat.api.showStart(false)');
    const box = await js('(() => { const r = document.querySelector("[data-testid=view2d]").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()');
    await cdp.click(box[0], box[1], 'right');
    await waitFor(() => q('[data-testid=menu-popup]'), 2000);
    await cdp.key('Escape');
  });
} finally {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  fs.mkdirSync(shots, { recursive: true });
  fs.writeFileSync(path.join(shots, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`\n${totalsLine('E2E', passed, failed)}`);
  stop();
  vite.stop();
  process.exitCode = failed ? 1 : 0;
}
