//@step {"name": "cmd: part — rollbackEnd brings back the features after the rollback bar", "expect": "^ok$"}
return (async () => {
  const m = window.__mymechanics;
  await window.__cmdContext("part", { fresh: true });
  m.actions.rollbackTo(2);
  await new Promise((r) => setTimeout(r, 100));
  if (m.active().rollback == null) return 'rollbackTo did not set the bar';
  await m.run('rollbackEnd');
  return m.active().rollback == null ? 'ok' : `rollback still ${m.active().rollback}`;
})()
//@step {"name": "cmd: part — Close project / Exit project close the document and show the start page", "expect": "^ok$"}
return (async () => {
  const m = window.__mymechanics;
  const out = [];
  for (const id of ['closeProject', 'exitProject']) {
    await m.actions.closeProject({ force: true }); await m.actions.openSampleAsk('flange'); await new Promise((r) => setTimeout(r, 300));
    // The sample is unchanged: no "save changes?" question.
    const r = m.run(id);
    await Promise.race([r, new Promise((res) => setTimeout(res, 1500))]);
    try { m.popups.closeAll(); } catch { /* none */ }
    await new Promise((res) => setTimeout(res, 200));
    if (m.state.doc && !m.state.showStart) out.push(`${id}: the document is still open`);
  }
  return out.length ? out.join('; ') : 'ok';
})()
//@step {"name": "cmd: sketch — every sketch tool becomes the active tool; selection tools change the selected entities", "expect": "^ok "}
return (async () => {
  const m = window.__mymechanics;
  await m.actions.closeProject({ force: true }); await m.actions.newDocument('part');
  await m.run('sketch'); document.querySelector('[data-pm="sketchOn:top"]').click(); await new Promise((r) => setTimeout(r, 400));
  const ed = () => m.state.editing?.editor;
  if (!ed()) return 'no sketch editor';
  // A rectangle and a circle to work on.
  const s = ed().sketch;
  const pts = [[0, 0], [40, 0], [40, 20], [0, 20]].map(([x, y], i) => ({ id: `q${i}`, type: 'point', x, y }));
  s.entities.push(...pts, ...pts.map((p, i) => ({ id: `l${i}`, type: 'line', p1: p.id, p2: pts[(i + 1) % 4].id })), { id: 'cc', type: 'point', x: 70, y: 10 }, { id: 'c1', type: 'circle', c: 'cc', r: 6 });
  ed().commit?.('op.test'); ed().render?.();
  const tools = Object.keys(m.commands).filter((k) => k.startsWith('sk:'));
  const fails = []; let n = 0;
  for (const id of tools) {
    if (!m.menus.enabled(id)) continue;
    m.run('sk:select'); await new Promise((r) => setTimeout(r, 30));
    const t0 = ed().tool;
    const r = await window.__effect(id, { ms: 500 });
    n++;
    if (m.state.editing?.mode !== 'sketch') { fails.push(`${id} left the sketch`); await m.run('sketch'); continue; }
    if (id !== 'sk:select' && ed().tool === t0 && !r.changed.length) fails.push(`${id}: nothing changed`);
    if (r.errors.length) fails.push(`${id}: ${r.errors.join(' | ')}`);
    try { m.popups.closeAll(); } catch { /* none */ }
  }
  // Selection tools: with the circle selected each one is enabled and changes the sketch (or asks for its value).
  const selTools = tools.filter((k) => !m.menus.enabled(k));
  const na = [];
  for (const id of selTools) {
    m.run('sk:select'); ed().selection = ['c1']; ed().render?.();
    if (!m.menus.enabled(id)) { ed().selection = ['l0']; }
    // Enabled by something other than a selection (a saved block …): not checked here, listed in the result.
    if (!m.menus.enabled(id)) { na.push(id); continue; }
    const before = JSON.stringify([ed().sketch.entities.length, ed().tool, ed().selection]);
    const r = await window.__effect(id, { ms: 700 });
    n++;
    const after = JSON.stringify([ed().sketch.entities.length, ed().tool, ed().selection]);
    if (before === after && !r.changed.length) fails.push(`${id}: nothing changed`);
    try { m.popups.closeAll(); } catch { /* none */ }
    await new Promise((res) => setTimeout(res, 60));
  }
  for (const id of ['construction', 'delete']) {
    ed().selection = ['l0']; ed().render?.();
    if (!m.menus.enabled(id)) { fails.push(`${id}: disabled with a line selected`); continue; }
    const before = JSON.stringify(ed().sketch.entities);
    await m.run(id); await new Promise((r) => setTimeout(r, 100));
    n++;
    if (JSON.stringify(ed().sketch.entities) === before) fails.push(`${id}: the sketch did not change`);
  }
  const exit = await window.__effect('exitSketch', { ms: 900 });
  if (m.state.editing) fails.push('exitSketch did not leave the sketch');
  if (!m.active().features.some((f) => f.type === 'sketch')) fails.push('exitSketch did not keep the sketch');
  void exit;
  return fails.length ? fails.join('; ') : `ok ${n + 1} sketch commands${na.length ? ` (not available with a selection alone: ${na.join(", ")})` : ""}`;
})()
//@step {"name": "cmd: feature command helper", "expect": "^ok$"}
return (() => {
  window.__featureCommands = async (k, parts) => {
    const m = window.__mymechanics;
    const fx = window.__fx;
    const ALIAS = { cutExtrude: ['extrude', 'cut'], cutRevolve: ['revolve', 'cut'], cutSweep: ['sweep', 'cut'], cutLoft: ['loft', 'cut'], refPlane: ['plane'], cavity: ['insertPart', 'cut'], shrink: ['scaleBody'] };
    const types = new Set(window.__featureTypes);
    const ids = Object.keys(m.commands).filter((id) => types.has(id) || ALIAS[id]).filter((id, i) => i % parts === k);
    const fails = []; let n = 0;
    for (const id of ids) {
      const [type, op] = ALIAS[id] ?? [id];
      if (type === 'sketch' || type === 'import') continue;
      await m.actions.closeProject({ force: true }); await m.actions.newDocument('part');
      const part = m.active();
      const fixture = fx.fixtureOf(type);
      const tmp = { ...fx.newPart(part.id), name: part.name };
      const extra = fixture.project ? fixture.project().parts : [];
      try { fixture.make(tmp, {}); } catch (e) { fails.push(`${id}: fixture base failed (${e.message})`); continue; }
      m.actions.change('op.addFeature', (p) => { for (const x of extra) if (!p.parts.some((y) => y.id === x.id)) p.parts.push({ ...x, name: x.name ?? x.id }); part.features = tmp.features; });
      await new Promise((r) => setTimeout(r, 40));
      const btn = [...document.querySelectorAll('#palette-host [data-command], #toolbar [data-command]')].find((b) => b.dataset.command === id && !b.disabled && b.offsetParent);
      if (btn) btn.click(); else await m.run(id);
      await new Promise((r) => setTimeout(r, 250));
      n++;
      const e = m.state.editing;
      if (e?.mode !== 'feature' || e.feature?.type !== type) fails.push(`${id}: ${e ? `${e.mode}/${e.feature?.type}` : `no PropertyManager (${m.state.notice?.text ?? 'no message'})`}`);
      else if (op && e.feature.op !== op) fails.push(`${id}: op ${e.feature.op}, wanted ${op}`);
      else if (!document.querySelector('#left-panel .pm-head')) fails.push(`${id}: the PropertyManager is not shown`);
      if (m.state.editing) m.actions.cancelEditing({ quiet: true });
    }
    return fails.length ? fails.join('; ') : `ok ${n} feature commands`;
  };
  return 'ok';
})()
//@step {"name": "cmd: feature commands 1/4 — each opens its own PropertyManager when its inputs exist", "expect": "^ok "}
window.__featureCommands(0, 4)
//@step {"name": "cmd: feature commands 2/4 — each opens its own PropertyManager when its inputs exist", "expect": "^ok "}
window.__featureCommands(1, 4)
//@step {"name": "cmd: feature commands 3/4 — each opens its own PropertyManager when its inputs exist", "expect": "^ok "}
window.__featureCommands(2, 4)
//@step {"name": "cmd: feature commands 4/4 — each opens its own PropertyManager when its inputs exist", "expect": "^ok "}
window.__featureCommands(3, 4)
//@step {"name": "cmd: CommandManager — every tab opens and shows its own buttons; every button runs a known command", "expect": "^ok "}
return (async () => {
  const m = window.__mymechanics;
  await m.actions.closeProject({ force: true }); await m.actions.openSampleAsk('flange'); await new Promise((r) => setTimeout(r, 400));
  const fails = []; const seen = new Map();
  const tabs = [...document.querySelectorAll('[data-cm-tab]')].map((x) => x.dataset.cmTab);
  for (const tab of tabs) {
    document.querySelector(`[data-cm-tab="${tab}"]`)?.click();
    await new Promise((r) => setTimeout(r, 80));
    if (m.state.cmTab !== tab || !document.querySelector(`[data-cm-tab="${tab}"]`)?.classList.contains('active')) fails.push(`tab ${tab} did not open`);
    const ids = [...document.querySelectorAll('#palette-host [data-command]')].map((b) => b.dataset.command);
    if (!ids.length) fails.push(`tab ${tab} has no buttons`);
    const key = ids.join(',');
    if ([...seen.values()].includes(key)) fails.push(`tab ${tab} shows the same buttons as another tab`);
    seen.set(tab, key);
    for (const id of ids) if (!m.commands[id]) fails.push(`tab ${tab}: button ${id} has no command`);
  }
  for (const b of document.querySelectorAll('#toolbar [data-command], #menubar [data-command]')) if (!m.commands[b.dataset.command]) fails.push(`toolbar button ${b.dataset.command} has no command`);
  // Every menu item is a command (or a submenu).
  const walk = (items, where) => { for (const it of items) { if (typeof it === 'string') { if (it !== '-' && !m.commands[it]) fails.push(`${where}: ${it} has no command`); } else if (it?.sub) { if (!m.menus.SUBMENUS[it.sub]) fails.push(`${where}: submenu ${it.sub} missing`); else walk(m.menus.SUBMENUS[it.sub].items, it.sub); } } };
  for (const [name, items] of Object.entries(m.menus.MENUS)) walk(items, name);
  return fails.length ? fails.join('; ') : `ok ${tabs.length} tabs`;
})()
//@step {"name": "cmd: menu bar — every menu opens its own list of commands", "expect": "^ok "}
return (async () => {
  const m = window.__mymechanics;
  const fails = []; let n = 0;
  for (const el of [...document.querySelectorAll('#menubar [data-menu]')]) {
    const name = el.dataset.menu;
    const before = m.popups.opened.length;
    document.querySelector(`#menubar [data-menu="${name}"]`)?.click();
    await new Promise((r) => setTimeout(r, 250));
    n++;
    const frame = m.popups.frames.get('menu');
    if (m.popups.opened.length === before || !frame) { fails.push(`${name}: no menu opened`); continue; }
    const win = frame.querySelector('iframe')?.contentWindow;
    for (let i = 0; i < 20 && !win?.document?.querySelector('.menu-item'); i++) await new Promise((r) => setTimeout(r, 100));
    const items = [...(win?.document?.querySelectorAll('.menu-item') ?? [])].map((x) => x.dataset.id);
    if (!items.length) fails.push(`${name}: the menu is empty`);
    if (m.state.openMenu !== name) fails.push(`${name}: not marked open (${m.state.openMenu})`);
    m.popups.closeAll(); await new Promise((r) => setTimeout(r, 80));
  }
  return fails.length ? fails.join('; ') : `ok ${n} menus`;
})()
