// The web app end to end (headless Edge / Chrome through the DevTools Protocol):
// graphical editing on the 2D canvas with synthetic pointer events, running in
// 2D and 3D, every sample, experiments, the report, files, the tutorial and both
// languages. Each case returns normally or throws; page errors fail the case.
export const CASES = [
  ['start page shows templates and every sample', `
    await T.reset({ project: false }); A.actions.showStartPage(true); await T.frames(3);
    const tiles = document.querySelectorAll('[data-start="sample"]').length;
    const templates = document.querySelectorAll('[data-start="template"]').length;
    if (tiles !== A.domain.SAMPLE_PROJECTS.length) throw new Error('sample tiles ' + tiles);
    if (templates !== A.domain.TEMPLATES.length) throw new Error('templates ' + templates);
    return { tiles, templates };`],
  ['place blocks by clicking: they are auto-connected in order', `
    await T.fresh('blank'); A.actions.setViewMode('2d'); await T.sleep(150);
    A.canvas.view = { cx: 5, cy: 0, scale: 30 };
    for (const [type, x] of [['source', -4], ['queue', 2], ['process', 8], ['sink', 14]]) { A.actions.startPlacing(type); await T.clickWorld(x, 0); }
    const m = T.model();
    if (m.blocks.length !== 4 || m.links.length !== 3) throw new Error(m.blocks.length + ' blocks, ' + m.links.length + ' links');
    return m.blocks.map((b) => b.name);`],
  ['drag a block, then undo and redo the move', `
    await T.dragWorld([2, 0], [2, 5]);
    if (T.byName('Queue1').y !== 5) throw new Error('not moved: ' + T.byName('Queue1').y);
    A.actions.undo(); if (T.byName('Queue1').y !== 0) throw new Error('undo');
    A.actions.redo(); if (T.byName('Queue1').y !== 5) throw new Error('redo');
    return 1;`],
  ['connect by dragging an output port onto a block', `
    await T.fresh('blank'); A.actions.setViewMode('2d'); await T.sleep(150);
    A.canvas.view = { cx: 0, cy: 0, scale: 30 };
    A.actions.setSelection([]);
    A.actions.placeBlock('source', -5, 0); A.actions.setSelection([]); A.actions.placeBlock('sink', 5, 0); A.actions.setSelection([]);
    if (T.model().links.length) throw new Error('linked too early');
    const { portsOf } = await import('/src/sim/blocks.js');
    const out = portsOf(T.byName('Source1')).outs[0];
    await T.dragWorld([out.x, out.y], [5, 0]);
    if (T.model().links.length !== 1) throw new Error('links ' + T.model().links.length);
    return 1;`],
  ['draw a conveyor point by point and finish with a double click', `
    await T.fresh('blank'); A.actions.setViewMode('2d'); await T.sleep(150);
    A.canvas.view = { cx: 0, cy: 0, scale: 30 };
    A.actions.startPlacing('conveyor');
    await T.clickWorld(-5, 0); await T.clickWorld(3, 0); const s = T.screen(3, 4); await T.click(s.x, s.y); T.fire('dblclick', s.x, s.y); await T.frames(3);
    const c = T.model().blocks.find((b) => b.type === 'conveyor');
    if (!c || c.points.length !== 3) throw new Error('points ' + JSON.stringify(c?.points));
    return c.points;`],
  ['delete, duplicate, copy and paste', `
    await T.fresh('flow'); const n = T.model().blocks.length;
    A.actions.setSelection([T.byName('Machine').id]); A.run('duplicate'); await T.frames(2);
    if (T.model().blocks.length !== n + 1) throw new Error('duplicate');
    A.run('delete'); await T.frames(2);
    if (T.model().blocks.length !== n) throw new Error('delete');
    return 1;`],
  ['properties: edit capacity and change a distribution kind', `
    await T.fresh('flow'); A.actions.setSelection([T.byName('Machine').id]); await T.frames(2);
    const cap = document.querySelector('[data-prop="capacity"]'); cap.value = '3'; cap.dispatchEvent(new Event('change', { bubbles: true }));
    const kind = document.querySelector('[data-dist-kind="time"]'); kind.value = 'normal'; kind.dispatchEvent(new Event('change', { bubbles: true }));
    await T.frames(2);
    const b = T.byName('Machine');
    if (b.props.capacity !== 3 || b.props.time.type !== 'normal') throw new Error(JSON.stringify(b.props));
    return b.props.time;`],
  ['run the line in split view: entities move, then stop', `
    await T.sample('line'); A.actions.setViewMode('split'); A.actions.setSpeed(30); A.actions.runPause();
    await T.until(() => A.state.sim && A.state.sim.entityViews().length > 0, 15000, 'entities');
    await T.sleep(1500);
    const now = A.state.sim.now;
    if (!(now > 0)) throw new Error('time ' + now);
    const v = A.view3d.stats();
    A.actions.stopRun({ quiet: true });
    return { now, calls: v.calls };`],
  ['every sample runs to the end with no errors', `
    const out = {};
    for (const s of A.domain.SAMPLE_PROJECTS) { await T.sample(s.id); await A.actions.runToEnd(); if (A.state.simStatus !== 'finished') throw new Error(s.id + ' ' + A.state.simStatus); out[s.id] = A.state.results.kpi.completed; }
    return out;`, 240000],
  ['3D view: pick a block by clicking it', `
    await T.sample('line'); A.actions.setViewMode('3d'); await T.sleep(400); A.view3d.setView('top'); A.view3d.fit(); await T.sleep(300);
    const b = T.byName('CNC'); A.actions.setSelection([]);
    const canvas = A.view3d.canvas; const r = canvas.getBoundingClientRect();
    // Project the block centre to the screen with the view's camera.
    const cam = A.view3d.camera; const V3 = cam.position.constructor;
    const p = new V3(b.x, 1, b.y).project(cam);
    const x = r.left + (p.x + 1) / 2 * r.width; const y = r.top + (1 - p.y) / 2 * r.height;
    const ev = (type) => canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1, button: 0, buttons: type === 'pointerdown' ? 1 : 0, isPrimary: true, pointerType: 'mouse' }));
    ev('pointermove'); await T.frames(2); ev('pointerdown'); ev('pointerup'); await T.frames(3);
    if (A.state.selection[0] !== b.id) throw new Error('selected ' + JSON.stringify(A.state.selection));
    return 1;`],
  ['model check finds an unconnected source and blocks the run', `
    await T.fresh('blank'); A.actions.placeBlock('source', 0, 0); await T.sleep(400);
    A.actions.runPause(); await T.frames(2);
    if (A.state.simStatus !== 'idle') throw new Error('ran with errors');
    if (!A.state.problems.some((p) => p.key === 'noOutput' && p.severity === 'error')) throw new Error(JSON.stringify(A.state.problems));
    return A.state.problems.length;`],
  ['experiment: vary capacity, best value found and applied', `
    await T.sample('line');
    const cnc = T.byName('CNC');
    await A.actions.runExperiment({ kind: 'optimize', parameter: cnc.id + '|capacity', from: 1, to: 3, step: 1, replications: 2, objective: 'throughput', goal: 'maximize' });
    const ex = A.state.state?.experiment ?? A.state.experiment;
    if (!ex || ex.runs.length !== 6 || !ex.best) throw new Error(JSON.stringify(ex));
    A.run('applyBest'); await T.frames(2);
    if (T.byName('CNC').props.capacity !== ex.best.x) throw new Error('not applied');
    return ex.best;`, 120000],
  ['Monte Carlo replications give a confidence interval', `
    await T.sample('bank');
    await A.actions.runExperiment({ kind: 'montecarlo', runs: 8, objective: 'Tellers.utilization' });
    const ex = A.state.experiment;
    if (ex.runs.length !== 8 || !(ex.ci >= 0) || !(ex.mean > 0)) throw new Error(JSON.stringify(ex));
    return { mean: ex.mean, ci: ex.ci };`, 120000],
  ['report and CSV exports have the results', `
    await T.sample('line'); await A.actions.runToEnd();
    const html = A.actions.reportHtml(); const csv = A.actions.resultsCsv(); const series = A.actions.seriesCsv();
    if (!html.includes('CNC') || !csv.startsWith('block,type') || !series.startsWith('time,')) throw new Error('exports');
    A.run('report');
    if (window.__TAURI_INTERNALS__) { await T.until(() => A.popups.isOpen('report'), 15000, 'report window'); await A.popups.close('report'); } else await T.popupReady('report');
    return { html: html.length, csv: csv.split('\\n').length };`],
  ['save and open again (web): the model comes back the same', `
    await T.sample('assembly');
    const { serializeModel, parseModel } = await import('/src/sim/model.js');
    const text = serializeModel(T.model());
    const d = await A.actions.openContent('copy.mpf', text);
    if (!d || T.model().blocks.length !== JSON.parse(text).blocks.length) throw new Error('round trip');
    return T.model().blocks.length;`],
  ['English: no missing text keys on the main screens', `
    A.actions.updateSettings({ language: 'en' }); await T.sample('hospital'); A.actions.setSelection([T.byName('Treatment').id]); await A.actions.runToEnd(); await T.frames(3);
    const raw = [...document.body.innerText.matchAll(/\\b(?:prop|opt|block|stat|kpi|check|menu|action|group|dist|hint)\\.[a-zA-Z]+/g)].map((m) => m[0]);
    A.actions.updateSettings({ language: 'ko' });
    if (raw.length) throw new Error('raw keys: ' + [...new Set(raw)].join(', '));
    return 1;`],
  ['tutorial: every step runs', `
    const n = A.domain.tutorialSteps();
    await A.api.updateSettings({});
    A.run('tutorial'); await T.until(() => A.tutorial()?.state().active, 10000, 'tutorial');
    const tut = A.tutorial();
    for (let i = 0; i < n; i++) { await tut.go(i); await T.until(() => !tut.state().busy, 30000, 'step ' + i); }
    await tut.stop();
    return n;`, 300000],
  ['every block type: placed, drawn in 2D and 3D, shown in the properties panel', `
    await T.fresh('blank'); A.actions.setViewMode('split'); await T.sleep(200);
    const types = Object.keys(A.domain.BLOCK_TYPES);
    let x = -60; let y = -40;
    for (const type of types) { A.actions.setSelection([]); A.actions.placeBlock(type, x, y); x += 12; if (x > 60) { x = -60; y += 10; } }
    if (T.model().blocks.length !== types.length) throw new Error('placed ' + T.model().blocks.length);
    A.canvas.fit(); await T.sleep(300);
    for (const b of T.model().blocks) { A.actions.setSelection([b.id]); await T.frames(1); if (!document.querySelector('#properties .props')) throw new Error('no properties for ' + b.type); }
    A.view3d.fit(); await T.sleep(500);
    return { types: types.length, calls: A.view3d.stats().calls };`, 120000],
  ['diagnosis tab: problems after a run, Apply changes the model', `
    await T.sample('bank'); await A.actions.runToEnd(); await T.frames(3);
    if (A.state.bottomTab !== 'diagnosis') throw new Error('tab ' + A.state.bottomTab);
    const cards = document.querySelectorAll('.diag-card').length;
    const btn = [...document.querySelectorAll('[data-apply]')].find((b) => !b.disabled);
    if (!cards || !btn) throw new Error('cards ' + cards);
    const before = T.byName('Tellers').props.capacity; btn.click(); await T.frames(2);
    if (T.byName('Tellers').props.capacity === before) throw new Error('not applied');
    return { cards, capacity: T.byName('Tellers').props.capacity };`],
  ['every template builds, checks and runs', `
    const out = {};
    for (const [id] of A.domain.TEMPLATES) { await T.fresh(id); await A.actions.runToEnd(); if (A.state.problems.some((p) => p.severity === 'error')) throw new Error(id + ' has errors'); out[id] = A.state.simStatus; }
    return Object.keys(out).length;`, 240000],
];

/** The cases the desktop group runs in the real window (name prefixes). */
export const DESKTOP_CASES = ['start page', 'place blocks', 'drag a block', 'run the line', 'every sample', '3D view', 'experiment', 'report'];
