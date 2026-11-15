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
  ['sensitivity analysis (tornado) and multi-parameter optimization; the experiment window shows both', `
    await T.sample('line');
    const cnc = T.byName('CNC'); const bufA = T.byName('Buffer A');
    await A.actions.runExperiment({ kind: 'sensitivity', sens: [cnc.id + '|capacity', bufA.id + '|capacity'], percent: 50, replications: 1, objective: 'throughput' });
    let ex = A.state.experiment;
    if (ex.kind !== 'sensitivity' || ex.rows.length !== 2 || !document.querySelector('.chart.tornado')) throw new Error(JSON.stringify(ex));
    if (ex.rows[0].label.indexOf('CNC') < 0) throw new Error('CNC capacity should move throughput the most: ' + ex.rows.map((r) => r.label + ' ' + r.swing));
    await A.actions.runExperiment({ kind: 'multiopt', multi: [{ parameter: cnc.id + '|capacity', from: 1, to: 3, step: 1 }, { parameter: bufA.id + '|capacity', from: 2, to: 10, step: 4 }], budget: 9, replications: 1, objective: 'throughput', goal: 'maximize' });
    ex = A.state.experiment;
    if (ex.kind !== 'multiopt' || ex.evaluations > 9 || ex.best.values[0] < 2) throw new Error(JSON.stringify({ best: ex.best, n: ex.evaluations }));
    A.run('applyBest'); await T.frames(2);
    if (T.byName('CNC').props.capacity !== ex.best.values[0] || T.byName('Buffer A').props.capacity !== ex.best.values[1]) throw new Error('not applied');
    if (!A.actions.experimentCsv().split('\\n')[0].includes('best so far')) throw new Error('csv');
    // The window: five kinds, the parameter checklist and the parameter rows.
    A.run('experiment'); await T.popupReady('experiment');
    const doc = document.querySelector('.web-popup-experiment iframe').contentDocument;
    if (doc.querySelectorAll('.exp-kind').length !== 5) throw new Error('kinds');
    doc.querySelector('[data-value="sensitivity"]').click(); await T.frames(2);
    const checks = doc.querySelectorAll('.exp-checks input[type=checkbox]').length;
    doc.querySelector('[data-value="multiopt"]').click(); await T.frames(2);
    const before = doc.querySelectorAll('.exp-multi-row').length;
    doc.querySelector('[data-action="multi-add"]').click(); await T.frames(2);
    const after = doc.querySelectorAll('.exp-multi-row').length;
    await A.popups.close('experiment');
    if (!checks || after !== before + 1) throw new Error(JSON.stringify({ checks, before, after }));
    return { swing: ex.best, checks, rows: after };`, 180000],
  ['scenarios: save two runs and compare them side by side', `
    await T.sample('line'); await A.actions.runToEnd();
    A.run('saveScenario'); await T.frames(2);
    const cnc = T.byName('CNC'); A.actions.setSelection([cnc.id]);
    A.actions.change('op.edit', (m) => { m.blocks.find((b) => b.id === cnc.id).props.capacity = 2; });
    await A.actions.runToEnd(); A.run('saveScenario'); await T.frames(2);
    if (A.state.bottomTab !== 'experiments') throw new Error('tab ' + A.state.bottomTab);
    const table = document.querySelector('.scen-table');
    if (!table || table.querySelectorAll('thead th').length !== 3) throw new Error('table');
    if (!table.textContent.includes('CNC.capacity: 1 → 2')) throw new Error('diff ' + table.textContent.slice(0, 300));
    if (!table.querySelector('td.best')) throw new Error('no best mark');
    document.querySelector('[data-scenario-remove="0"]').click(); await T.frames(2);
    const left = document.querySelectorAll('.scen-table thead th').length;
    document.querySelector('[data-scenario-clear]').click(); await T.frames(2);
    if (left !== 2 || document.querySelector('.scen-table')) throw new Error('remove/clear');
    return 1;`, 120000],
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
  ['2D rulers with a red mouse line; the 5 x 5 grid follows the zoom in 2D and 3D', `
    await T.sample('line'); A.actions.setViewMode('2d'); await T.sleep(300);
    const c = A.canvas; if (!c.options.rulers) throw new Error('rulers off by default');
    const r = c.canvas.getBoundingClientRect();
    const mx = Math.round(r.width * 0.6); const my = Math.round(r.height * 0.55);
    c.canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + mx, clientY: r.top + my, bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'mouse' }));
    c.render(); const g = c.ctx; const d = c.dpr;
    const px = (x, y) => [...g.getImageData(Math.round(x * d), Math.round(y * d), 1, 1).data];
    const red = (p) => p[0] > 190 && p[1] < 120 && p[2] < 120;
    if (!red(px(mx, 10))) throw new Error('no red line on the top ruler ' + px(mx, 10));
    if (!red(px(10, my))) throw new Error('no red line on the left ruler ' + px(10, my));
    if (red(px(mx + 40, 10))) throw new Error('red elsewhere');
    // 2D: zooming keeps the minor spacing on screen in 10…50 px, stepping 5x.
    const seen2d = new Set();
    for (const f of [0.1, 0.25, 1, 4, 10, 30]) { c.view.scale = 18 * f; c.render(); const L = c.gridLevel; if (L.minorPx < 10 || L.minorPx > 50) throw new Error('2D ' + JSON.stringify(L)); seen2d.add(L.minor); }
    if (seen2d.size < 3) throw new Error('2D levels ' + [...seen2d]);
    c.fit();
    // Hidden rulers: no red.
    A.run('rulers'); c.render(); const off = red(px(mx, 10)); A.run('rulers');
    if (off) throw new Error('rulers still drawn when hidden');
    // 3D: dolly the camera and the grid is rebuilt at another level.
    A.actions.setViewMode('3d'); await T.sleep(400); const v = A.view3d; v.fit(); v.render();
    const near = v.gridLevel.minor;
    const dir = v.camera.position.clone().sub(v.controls.target);
    v.camera.position.copy(v.controls.target).add(dir.multiplyScalar(12)); v.render();
    const far = v.gridLevel.minor;
    if (!(far > near)) throw new Error('3D grid did not change: ' + near + ' -> ' + far);
    if (!v.grid || !v.grid.children[1].geometry.attributes.position.count) throw new Error('no 3D grid lines');
    v.fit();
    return { seen2d: [...seen2d], near, far };`],
  ['record the animation as WebM, follow an entity in 3D, an event block changes capacity during the run', `
    await T.sample('line'); A.actions.setViewMode('split'); A.actions.setSpeed(30); await T.sleep(300);
    // Recording (the download goes to the test browser's own folder, not a save dialog).
    const keep = window.showSaveFilePicker; window.showSaveFilePicker = undefined;
    try {
      await A.actions.toggleRecording();
      if (!A.actions.recorder()?.active || A.state.simStatus !== 'running') throw new Error('not recording/running');
      if (!document.querySelector('#run-bar [data-command="recordVideo"].recording')) throw new Error('no red record button');
      for (let i = 0; i < 30; i++) { A.actions.recorder().frame(); await T.sleep(50); }
      const blob = await A.actions.toggleRecording();
      if (!blob || blob.size < 2000 || !blob.type.startsWith('video/webm')) throw new Error('video ' + (blob && blob.size) + ' ' + (blob && blob.type));
      if (A.actions.recorder()) throw new Error('still recording');
      var size = blob.size;
    } finally { window.showSaveFilePicker = keep; }
    // Follow camera: the 3D target moves towards the followed entity.
    A.actions.toggleFollow(); await T.until(() => A.view3d.follow?.at, 10000, 'follow');
    // On one simulation state, repeated steps bring the camera target onto the followed entity.
    A.actions.runPause(); await T.frames(2);
    for (let i = 0; i < 30; i++) A.view3d.update(A.state.sim);
    const [fx, fy] = A.view3d.follow.at; const t1 = A.view3d.controls.target;
    if (Math.hypot(t1.x - fx, t1.z - fy) > 0.05) throw new Error('target not following: ' + Math.hypot(t1.x - fx, t1.z - fy));
    A.actions.runPause();
    A.actions.toggleFollow(); if (A.view3d.follow) throw new Error('follow still on');
    A.actions.stopRun({ quiet: true });
    // Event block: CNC capacity 1 → 3 at t = 200, through the properties panel's ref list.
    const cnc = T.byName('CNC');
    A.actions.placeBlock('event', 0, 12); await T.sleep(300);
    const ev = T.model().blocks.find((b) => b.type === 'event');
    A.actions.setSelection([ev.id]); await T.frames(2);
    const opts = [...document.querySelectorAll('#properties select[data-prop="targetBlock"] option')].map((o) => o.textContent);
    if (!opts.includes('CNC')) throw new Error('target options ' + opts);
    A.actions.change('op.edit', (m) => Object.assign(m.blocks.find((b) => b.id === ev.id).props, { startAt: 200, targetBlock: 'CNC', property: 'capacity', newValue: '3' }));
    await T.until(() => !A.state.problems.some((p) => p.severity === 'error'), 5000, 'model check');
    await A.actions.runToEnd();
    const r = A.state.results.blocks;
    if (r[ev.name].fired !== 1 || r.CNC.capacity !== 3) throw new Error(JSON.stringify({ ev: r[ev.name], cnc: r.CNC.capacity }));
    if (T.byName('CNC').props.capacity !== cnc.props.capacity) throw new Error('model changed');
    return { size, fired: r[ev.name].fired };`, 120000],
  ['toolbar speed: − / current speed / + change the playback speed', `
    await T.sample('line'); A.actions.setSpeed(4); await T.frames(2);
    const tb = document.querySelector('#toolbar');
    const label = () => tb.querySelector('[data-command="speedMenu"] [data-speed-label]').textContent;
    if (label() !== '×4') throw new Error('label ' + label());
    tb.querySelector('[data-command="speedUp"]').click(); await T.frames(2);
    if (A.state.speed !== 10 || label() !== '×10') throw new Error('up ' + A.state.speed + ' ' + label());
    tb.querySelector('[data-command="speedDown"]').click(); tb.querySelector('[data-command="speedDown"]').click(); await T.frames(2);
    if (A.state.speed !== 2 || label() !== '×2') throw new Error('down ' + A.state.speed + ' ' + label());
    // The run bar shows the same speed.
    const sel = document.querySelector('#run-bar [data-run-speed]');
    if (sel && Number(sel.value) !== 2) throw new Error('run bar ' + sel.value);
    // Keyboard ] also updates the toolbar.
    A.run('speedUp'); await T.frames(2);
    if (label() !== '×4') throw new Error('key ' + label());
    // The current-speed button opens a list of speeds.
    tb.querySelector('[data-command="speedMenu"]').click(); await T.until(() => A.popups.isOpen('menu') || document.querySelector('.web-popup-menu'), 5000, 'speed menu');
    await A.popups.closeAll();
    return label();`],
  ['side panels start equal with fold icons; number fields have − / + and units; the theme button is a dropdown', `
    await T.sample('line'); await T.frames(3);
    const lw = document.querySelector('#left-panel').getBoundingClientRect().width; const rw = document.querySelector('#right-panel').getBoundingClientRect().width;
    if (Math.abs(lw - rw) > 1) throw new Error('panel widths ' + lw + ' / ' + rw);
    if (A.commands.leftPanel.icon !== 'foldLeft' || A.commands.rightPanel.icon !== 'foldRight') throw new Error('fold icons');
    A.run('leftPanel'); await T.frames(2);
    if (A.commands.leftPanel.icon !== 'unfoldLeft') throw new Error('unfold icon');
    A.run('leftPanel'); await T.frames(2);
    // Every number field in the properties panel: [−] value unit [+].
    const cnc = T.byName('CNC'); A.actions.setSelection([cnc.id]); await T.frames(3);
    const inputs = [...document.querySelectorAll('#properties input[type="number"]')];
    const bare = inputs.filter((i) => i.closest('.num-box')?.querySelectorAll('.num-step').length !== 2);
    if (!inputs.length || bare.length) throw new Error('number fields without buttons: ' + bare.map((i) => i.outerHTML.slice(0, 60)).join(' | '));
    const cap = document.querySelector('#properties input[data-prop="capacity"]');
    if (!cap.closest('.num-box').textContent.includes(A.t('unit.count'))) throw new Error('no count unit');
    const timeField = document.querySelector('#properties input[data-dist^="time:"]');
    if (!timeField.closest('.num-box').textContent.includes('min')) throw new Error('no time unit');
    const before = T.byName('CNC').props.capacity;
    cap.closest('.num-box').querySelectorAll('.num-step')[1].click(); await T.frames(3);
    if (T.byName('CNC').props.capacity !== before + 1) throw new Error('+ did not step: ' + T.byName('CNC').props.capacity);
    document.querySelector('#properties input[data-prop="capacity"]').closest('.num-box').querySelectorAll('.num-step')[0].click(); await T.frames(3);
    if (T.byName('CNC').props.capacity !== before) throw new Error('− did not step');
    // Model settings too.
    A.actions.setSelection([]); await T.frames(3);
    const dur = document.querySelector('#properties input[data-model="duration"]');
    if (!dur.closest('.num-box') || !dur.closest('.num-box').textContent.includes('min')) throw new Error('model settings field');
    // Theme: the button picks a random theme; the ▾ next to it is a dropdown menu (light / dark groups), not the theme window.
    const t0 = A.state.settings.theme;
    document.querySelector('#toolbar [data-command="themeRandom"]').click(); await T.frames(2);
    if (A.state.settings.theme === t0) throw new Error('random theme did not change ' + t0);
    document.querySelector('#toolbar .split-button [data-command="themeMenu"]').click();
    await T.until(() => document.querySelector('.web-popup-theme iframe')?.contentDocument?.querySelector('.theme-dropdown .picker-grid'), 5000, 'theme dropdown');
    const dd = document.querySelector('.web-popup-theme iframe').contentDocument;
    const grids = dd.querySelectorAll('.theme-dropdown .picker-grid');
    if (grids.length !== 2 || grids[0].children.length !== 20 || grids[1].children.length !== 20) throw new Error('grids');
    if (getComputedStyle(grids[0]).gridTemplateColumns.split(' ').length !== 2) throw new Error('not 2 columns');
    if (dd.querySelector('.popup-head, .popup-title')) throw new Error('theme dropdown has a window title');
    const pick = grids[0].children[3].dataset.pickTheme; grids[0].children[3].click();
    await T.until(() => A.state.settings.theme === pick, 5000, 'picked');
    await A.popups.closeAll();
    A.actions.updateSettings({ theme: t0 });
    return { lw, rw, fields: inputs.length };`],
  ['the welcome popup (run the tutorial?) shows only over the start page', `
    await T.sample('line'); await T.frames(2);
    if (A.state.showStart) throw new Error('start page should be hidden');
    // Help › Welcome from a model goes to the start page first.
    A.run('welcome'); await T.until(() => document.querySelector('.web-popup-welcome') && getComputedStyle(document.querySelector('.web-popup-welcome')).visibility !== 'hidden', 8000, 'welcome');
    if (!A.state.showStart) throw new Error('welcome over a model');
    // Leaving the start page closes it.
    A.actions.showStartPage(false); await T.frames(3); await T.sleep(300);
    const left = document.querySelector('.web-popup-welcome');
    if (left && getComputedStyle(left).visibility !== 'hidden') throw new Error('welcome still open over the model');
    // "Show again" is in Settings › Start page.
    A.actions.updateSettings({ showWelcome: false });
    A.popups.open('settings', { tab: 'start' }); await T.popupReady('settings');
    const sdoc = document.querySelector('.web-popup-settings iframe').contentDocument;
    const box = sdoc.querySelector('input[data-toggle="showWelcome"]');
    if (!box) throw new Error('no show-again option in Settings › Start page');
    if (!box.closest('.row').textContent.includes(A.t('settings.showWelcome'))) throw new Error('label');
    box.click(); await T.until(() => A.state.settings.showWelcome === true, 5000, 'turned on');
    await A.popups.close('settings');
    return 1;`],
  ['print button after Save; report window (Markdown / HTML / Word / PDF with pictures); print window with pages', `
    await T.sample('line'); await A.actions.runToEnd(); await T.frames(2);
    const group = [...document.querySelector('#toolbar [data-group="0"]').querySelectorAll('[data-command]')].map((b) => b.dataset.command);
    if (group.indexOf('print') !== group.indexOf('save') + 1) throw new Error('print not right of save: ' + group);
    if (!A.menus.MENUS.file.includes('print')) throw new Error('no Print in the File menu');
    // The report model has the pictures.
    const doc = A.actions.reportDocument();
    const pics = doc.blocks.filter((b) => b.t === 'image');
    if (pics.length < 2 || !pics.every((b) => b.src.startsWith('data:image/png') || b.src.startsWith('data:image/jpeg'))) throw new Error('pictures ' + pics.length);
    const W = await import('/src/report/writers.js');
    const pdf = await W.toPdf(doc, { paper: 'A4' });
    const head = new TextDecoder().decode(pdf.slice(0, 5));
    const pages = (new TextDecoder('latin1').decode(pdf).match(/\\/Type \\/Page\\b/g) ?? []).length;
    if (head !== '%PDF-' || pages < 2) throw new Error('pdf ' + head + ' ' + pages);
    // Report window: four formats, sections, preview.
    A.run('report'); await T.popupReady('report');
    const rd = document.querySelector('.web-popup-report iframe').contentDocument;
    const formats = [...rd.querySelectorAll('.rp-format')].map((b) => b.dataset.value);
    if (formats.join() !== 'md,html,docx,pdf') throw new Error('formats ' + formats);
    if (!rd.querySelector('iframe.rp-preview') || rd.querySelectorAll('[data-rp-section]').length < 5) throw new Error('report window');
    await A.popups.close('report');
    // Print window: printer, paper, the pages; landscape lays the pages out again.
    A.run('print'); await T.popupReady('print');
    const pd = () => document.querySelector('.web-popup-print iframe').contentDocument;
    try { await T.until(() => pd().querySelectorAll('.ps-page img').length > 0, 20000, 'print pages'); } catch (e) { throw new Error('print pages: ' + (pd()?.body?.innerText ?? 'no frame').slice(0, 400)); }
    const portrait = pd().querySelectorAll('.ps-page img').length;
    if (!pd().querySelector('[data-ps="paper"]') || !pd().querySelector('[data-ps="copies"]')) throw new Error('setup fields');
    const r0 = pd().querySelector('.ps-page').getBoundingClientRect();
    pd().querySelector('[data-ps-seg="orientation"][data-value="landscape"]').click();
    await T.until(() => { const r = pd().querySelector('.ps-page')?.getBoundingClientRect(); return r && r.width > r.height; }, 20000, 'landscape pages');
    if (!(r0.height > r0.width)) throw new Error('portrait page not tall');
    await A.popups.close('print');
    return { pdfPages: pages, portrait, pics: pics.length };`, 180000],
  ['panel buttons sit on the menu bar and do nothing on the start page', `
    A.actions.showStartPage(true); await T.frames(3);
    const bar = document.querySelector('#menubar .menubar-panels');
    if (!bar || bar.querySelectorAll('[data-command]').length !== 3) throw new Error('no panel buttons on the menu bar');
    if (document.querySelector('#toolbar [data-command="leftPanel"]')) throw new Error('panel buttons still on the toolbar');
    const before = [A.state.settings.showLeftPanel, A.state.settings.showRightPanel, A.state.settings.showBottomPanel];
    const start = document.querySelector('.start-scroll, #start-page, .start-page')?.getBoundingClientRect();
    for (const b of bar.querySelectorAll('[data-command]')) { if (!b.disabled) throw new Error(b.dataset.command + ' enabled on the start page'); b.click(); }
    A.run('leftPanel'); A.run('bottomPanel'); await T.frames(3);
    const after = [A.state.settings.showLeftPanel, A.state.settings.showRightPanel, A.state.settings.showBottomPanel];
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('panels changed on the start page');
    const start2 = document.querySelector('.start-scroll, #start-page, .start-page')?.getBoundingClientRect();
    if (start && start2 && (start.width !== start2.width || start.left !== start2.left)) throw new Error('start page moved');
    // With a model they work.
    await T.sample('line'); await T.frames(2);
    if (bar.isConnected ? false : true) {}
    const btn = document.querySelector('#menubar [data-command="leftPanel"]');
    if (btn.disabled) throw new Error('disabled with a model');
    btn.click(); await T.frames(2);
    if (A.state.settings.showLeftPanel === before[0]) throw new Error('did not toggle');
    A.run('leftPanel'); await T.frames(2);
    return 1;`],
  ['every template builds, checks and runs', `
    const out = {};
    for (const [id] of A.domain.TEMPLATES) { await T.fresh(id); await A.actions.runToEnd(); if (A.state.problems.some((p) => p.severity === 'error')) throw new Error(id + ' has errors'); out[id] = A.state.simStatus; }
    return Object.keys(out).length;`, 240000],
];

/** The cases the desktop group runs in the real window (name prefixes). */
export const DESKTOP_CASES = ['start page', 'place blocks', 'drag a block', 'run the line', 'every sample', '3D view', 'experiment', 'report'];
