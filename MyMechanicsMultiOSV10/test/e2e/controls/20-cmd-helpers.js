//@step {"name": "cmd: helpers (commands that would leave the page, print or open file dialogs are stubbed or skipped)", "expect": "^ok$"}
return (() => {
  const m = window.__mymechanics;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Document windows open with window.open in the web build: recorded instead.
  window.__opened = [];
  globalThis.open = (url, name) => { window.__opened.push(String(url)); return null; };
  /**
   * Commands not run here, and why. Everything else must change something that can be seen (see __snap).
   */
  window.__CMD_SKIP = {
    exit: 'closes the app window',
    open: 'opens the system file dialog', importStep: 'opens the system file dialog', importTable: 'opens the system file dialog', backgroundImage: 'opens the system file dialog',
    save: 'writes a file through the system save dialog', saveAs: 'writes a file through the system save dialog', designTable: 'writes a file through the system save dialog',
    exportStep: 'writes a file (download / save dialog)', exportStl: 'writes a file (download / save dialog)', exportImage: 'writes a file (download / save dialog)', exportDxf: 'writes a file (download / save dialog)', exportSvg: 'writes a file (download / save dialog)',
    print: 'would print — never run in tests (the print preview is covered by print.test.js)',
    closeProject: 'closes the document — checked on its own at the end of the part pass', exitProject: 'closes the document — checked on its own at the end of the part pass',
  };
  // Effects that only say something (a message) — fine for commands whose input is missing in this context;
  // the feature commands are checked with their inputs present in "cmd: feature commands …".
  const HINT_ONLY = new Set(['notice', 'log', 'panels']);
  const orig = (window.__snapBase ??= window.__snap);
  window.__snap = () => ({ ...orig(), opened: window.__opened.length });

  /** Puts the app back after a command: editing, popups, settings, model (undo), document, start page. */
  const restore = async (before, ref) => {
    if (m.state.editing) { try { m.actions.cancelEditing({ quiet: true }); } catch { /* fine */ } }
    try { m.popups.closeAll(); } catch { /* none */ }
    await sleep(20);
    if (m.state.showStart && !before.start) m.actions.showStartPage(false);
    const now = window.__snap();
    if (now.settings !== before.settings) m.actions.updateSettings(JSON.parse(before.settings), { quiet: true });
    for (let i = 0; i < 6 && m.state.doc?.history && window.__snap().history !== before.history && m.state.doc.history.canUndo && m.state.doc.history.index > Number(before.history.split('/')[0]); i++) { m.actions.undo(); await sleep(20); }
    if (ref && m.project?.active?.id !== ref.id && m.project) m.actions.switchDocument(ref);
    if (m.state.editing) m.actions.cancelEditing({ quiet: true });
    await sleep(30);
  };
  window.__cmdRestore = restore;

  /**
   * Runs every enabled command of the app in the current document — by clicking its button when one is on
   * screen (toolbar, CommandManager, menu bar), else as a menu runs it — and records what each changed.
   * `select` (optional): a function that sets up a selection before each command (selection-driven ones).
   */
  window.__cmdPass = async ({ only = null, select = null, skip = {} } = {}) => {
    const ref = m.project?.active ? { ...m.project.active } : null;
    const ids = only ?? Object.keys(m.commands);
    const res = { changed: {}, hint: {}, nothing: [], errors: [], skipped: [], disabled: [] };
    for (const id of ids) {
      if (window.__CMD_SKIP[id] || skip[id]) { res.skipped.push(id); continue; }
      if (select) await select(id);
      if (!m.menus.enabled(id)) { res.disabled.push(id); continue; }
      const pre = window.__CMD_PRE[id];
      if (pre) { await pre(); await sleep(80); }
      const btn = [...document.querySelectorAll('#toolbar [data-command], #palette-host [data-command], #menubar [data-command]')].find((b) => b.dataset.command === id && !b.disabled && b.offsetParent);
      const before = window.__snap();
      const r = await window.__effect(id, { ms: 900, run: btn ? () => btn.click() : undefined });
      if (r.errors.length) res.errors.push(`${id}: ${r.errors.join(' | ')}`);
      if (!r.changed.length) res.nothing.push(id);
      else if (r.changed.every((k) => HINT_ONLY.has(k))) res.hint[id] = r.changed.join('+');
      else res.changed[id] = r.changed.join('+');
      await restore(before, ref);
    }
    return res;
  };

  /** Puts the state in one where the command's effect shows (a view command needs another view first …). */
  const vp = () => m.viewport;
  const otherStyle = (s) => m.actions.updateSettings({ displayStyle: s === 'wireframe' ? 'shaded' : 'wireframe' }, { quiet: true });
  window.__CMD_PRE = {
    // (after any glide of the view that is still running, which would undo the zoom)
    zoomFit: async () => { await sleep(800); if (m.project?.active?.kind === 'drawing') m.state.drawingZoom = (m.state.drawingZoom || 1) * 2.5; else { vp().zoomBy?.(3); vp().panBy?.(80, 40); } },
    normalTo: () => m.run('view:iso'),
    'view:iso': () => m.run('view:front'),
    'style:shadedEdges': () => otherStyle('shadedEdges'), 'style:shaded': () => otherStyle('shaded'), 'style:hiddenRemoved': () => otherStyle('hiddenRemoved'),
    'style:hiddenVisible': () => otherStyle('hiddenVisible'), 'style:wireframe': () => otherStyle('wireframe'),
    'gridPlane:front': () => m.actions.updateSettings({ gridPlane: 'top' }, { quiet: true }),
    'gridPlane:top': () => m.actions.updateSettings({ gridPlane: 'front' }, { quiet: true }),
    'gridPlane:right': () => m.actions.updateSettings({ gridPlane: 'front' }, { quiet: true }),
  };
  for (const v of ['front', 'back', 'top', 'bottom', 'left', 'right', 'dimetric', 'trimetric']) window.__CMD_PRE[`view:${v}`] = () => m.run('view:iso');

  /** A short report; fails on commands with no effect or errors. `allowHint`: ids that may only give a message. */
  window.__cmdReport = (res, { allowHint = () => true, minRun = 1 } = {}) => {
    const bad = [];
    if (res.nothing.length) bad.push(`no effect: ${res.nothing.join(', ')}`);
    const hints = Object.keys(res.hint).filter((id) => !allowHint(id));
    if (hints.length) bad.push(`only a message: ${hints.join(', ')}`);
    if (res.errors.length) bad.push(`errors: ${res.errors.join(' ; ')}`);
    const run = Object.keys(res.changed).length + Object.keys(res.hint).length + res.nothing.length;
    if (run < minRun) bad.push(`only ${run} commands ran`);
    return bad.length ? bad.join(' || ') : `ok ${run} commands (${Object.keys(res.changed).length} changed state, ${Object.keys(res.hint).length} gave a message; ${res.disabled.length} disabled here, ${res.skipped.length} skipped)${Object.keys(res.hint).length ? ` — message only: ${Object.keys(res.hint).join(", ")}` : ""}`;
  };

  /** Opens the document a context runs in (again when an earlier command closed or replaced it). */
  const CONTEXTS = {
    part: { kind: 'part', open: async () => { await m.actions.openSampleAsk('flange'); } },
    assembly: { kind: 'assembly', open: async () => { await m.actions.openSampleAsk('shaftAssembly'); } },
    drawing: { kind: 'drawing', open: async () => { await m.actions.openSampleAsk('flange'); await sleep(300); await m.actions.newDrawing(); } },
  };
  window.__cmdContext = async (ctx, { fresh = false } = {}) => {
    const c = CONTEXTS[ctx];
    if (!fresh && window.__cmdCtx === ctx && m.project?.active?.kind === c.kind && !m.state.showStart && m.state.doc) return;
    if (m.state.editing) m.actions.cancelEditing({ quiet: true });
    try { m.popups.closeAll(); } catch { /* none */ }
    await m.actions.closeProject({ force: true });
    await c.open();
    await sleep(500);
    window.__cmdCtx = ctx;
  };
  /**
   * One command in one context: skipped (with the reason), not available there, or it must change something.
   * `select`: 'feature' (the last solid feature; the first for rollbackHere) or 'component' before it runs.
   */
  window.__cmdOne = async (ctx, id, { select = null } = {}) => {
    if (!m.commands[id]) return `ok — no command ${id} any more`;
    if (window.__CMD_SKIP[id]) return `ok — skipped: ${window.__CMD_SKIP[id]}`;
    await window.__cmdContext(ctx);
    let sel = null;
    if (select === 'feature') sel = async () => { const solid = m.active().features.filter((x) => x.type !== 'sketch' && x.type !== 'plane'); const f = id === 'rollbackHere' ? solid[0] : solid.at(-1); m.actions.select([{ kind: 'feat', id: f.id, key: `feat:${f.id}` }]); await sleep(30); };
    if (select === 'component') sel = async () => { const comp = m.active().components.find((x) => !x.fixed) ?? m.active().components[0]; m.actions.select([{ kind: 'comp', id: comp.id, key: `comp:${comp.id}` }]); await sleep(30); };
    const res = await window.__cmdPass({ only: [id], select: sel });
    try { if (m.state.selection.length) m.actions.select([]); } catch { /* none */ }
    if (res.errors.length) return `FAIL ${id}: ${res.errors.join(' | ')}`;
    if (res.disabled.length) return select ? `FAIL ${id}: disabled with a ${select} selected` : `n/a — ${id} is not available in a ${ctx}`;
    if (res.nothing.length) return `FAIL ${id}: no visible effect`;
    if (res.hint[id]) return select ? `FAIL ${id}: only a message (${res.hint[id]})` : `ok — a message (${res.hint[id]})`;
    return `ok — changed ${res.changed[id]}`;
  };
  /** Commands registered after this file was generated: the same check, in one step per context. */
  window.__cmdLater = async (ctx, known) => {
    const out = [];
    for (const id of Object.keys(m.commands).filter((x) => !known.includes(x))) out.push(`${id}: ${await window.__cmdOne(ctx, id)}`);
    const bad = out.filter((x) => /: FAIL/.test(x));
    return bad.length ? bad.join(' || ') : `ok ${out.length} more commands`;
  };
  return 'ok';
})()
