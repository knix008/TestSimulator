//@step {"name": "panel: helpers (a generic exerciser for the controls of a pane)", "expect": "^ok$"}
return (() => {
  const m = window.__mymechanics;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const safe = (v) => {
    const seen = new WeakSet();
    try {
      return JSON.stringify(v, (k, x) => {
        if (x && typeof x === 'object') {
          if (seen.has(x)) return undefined;
          seen.add(x);
          if ('wrapped' in x || (typeof Node !== 'undefined' && x instanceof Node) || ArrayBuffer.isView(x)) return undefined;
          if (x instanceof Map) return [...x.entries()];
          if (x instanceof Set) return [...x];
          const proto = Object.getPrototypeOf(x);
          if (proto && proto !== Object.prototype && proto !== Array.prototype) return undefined;
        }
        return typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x;
      });
    } catch (e) { return String(e); }
  };
  /** Everything a pane control may change: the editor, the model, settings, results, selection, the view. */
  window.__state = () => {
    const s = window.__snap();
    return safe({ e: m.state.editing, sim: m.state.sim, da: m.state.draftAnalysis, player: m.state.player, s: m.state.settings, d: m.active(), sel: m.state.selection, ds: m.state.drawingSelected, look: { ...s, notice: undefined, log: undefined } });
  };
  const ANY = (el) => el.dataset.pmField ?? el.dataset.prop ?? el.dataset.pmSelect ?? el.getAttribute('aria-label') ?? el.name ?? '';
  /**
   * Presses, steps and types every control in `sel` and records which ones change nothing. Re-queries the
   * pane after each action (they re-render it). `skip`: data-pm commands not to press (file dialogs …).
   */
  window.__paneExercise = async (sel, { skip = [], skipSet = [], limitOptions = 3, wait = 120 } = {}) => {
    const pane = () => document.querySelector(sel);
    const fails = []; const seen = [];
    const e0 = window.__ctlErrors.length;
    const act = async (label, fn, { needChange = true } = {}) => {
      const before = window.__state();
      try { await fn(); } catch (err) { fails.push(`${label}: ${err.message}`); return false; }
      await sleep(wait);
      const changed = window.__state() !== before;
      seen.push(label);
      if (needChange && !changed) fails.push(`${label}: nothing changed`);
      return changed;
    };
    const find = (q, key, attr) => [...(pane()?.querySelectorAll(q) ?? [])].find((x) => (attr ? x.getAttribute(attr) : ANY(x)) === key);
    // Framed numbers (− value +).
    const nums = [...new Set([...(pane()?.querySelectorAll('.num-control input') ?? [])].map(ANY))];
    for (const key of nums) {
      const get = () => find('.num-control input', key);
      if (!get() || get().disabled) continue;
      const plus = () => get().closest('.num-control').querySelector('.slider-step[data-dir="1"]');
      const minus = () => get().closest('.num-control').querySelector('.slider-step[data-dir="-1"]');
      if (!plus() || !minus()) { fails.push(`${key}: no − / + buttons`); continue; }
      const up = await act(`${key} +`, () => plus().click(), { needChange: false });
      const down = await act(`${key} −`, () => minus().click(), { needChange: false });
      if (!up && !down) fails.push(`${key}: neither + nor − changed anything`);
      const cur = Number(String(get()?.value ?? '').replace(/[^0-9.eE+-]/g, ''));
      const target = Number.isFinite(cur) && cur !== 0 ? Math.round(cur * 1.5 * 1000) / 1000 : 2;
      await act(`${key} typed ${target}`, () => { const i = get(); i.value = String(target); i.dispatchEvent(new Event('change', { bubbles: true })); });
    }
    // Plain text / colour fields.
    for (const el of [...(pane()?.querySelectorAll('input[type="text"]:not([data-num]):not(.slider-value), input[type="color"]') ?? [])]) {
      const key = ANY(el); const type = el.type;
      if (!key || el.closest('.num-control') || el.disabled) continue;
      await act(`${type} ${key}`, () => { const i = find(`input[type="${type}"]`, key); i.value = type === 'color' ? (i.value === '#336699' ? '#993366' : '#336699') : `${i.value}2`; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); });
    }
    // Drop-downs.
    for (const el of [...(pane()?.querySelectorAll('select') ?? [])]) {
      const key = ANY(el);
      if (!key || el.disabled) continue;
      const start = el.value;
      for (const v of [...el.options].map((o) => o.value).filter((v) => v !== start).slice(0, limitOptions)) {
        await act(`${key}=${v}`, () => { const s = find('select', key); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); });
      }
    }
    // Check boxes.
    for (const key of [...new Set([...(pane()?.querySelectorAll('input[type="checkbox"][data-pm-toggle], input[type="checkbox"][data-prop]') ?? [])].map((x) => x.dataset.pmToggle ?? x.dataset.prop))]) {
      const get = () => pane()?.querySelector(`input[type="checkbox"][data-pm-toggle="${CSS.escape(key)}"], input[type="checkbox"][data-prop="${CSS.escape(key)}"]`);
      if (!get() || get().disabled) continue;
      await act(`toggle ${key}`, () => get().click());
      if (get()) { get().click(); await sleep(wait); }
    }
    // Segments.
    for (const key of [...new Set([...(pane()?.querySelectorAll('[data-pm-set]') ?? [])].map((x) => x.dataset.pmSet))].filter((k) => !skipSet.includes(k))) {
      const values = [...pane().querySelectorAll(`[data-pm-set="${CSS.escape(key)}"]`)].filter((b) => !b.classList.contains('active')).map((b) => b.dataset.value);
      for (const v of values) await act(`${key}=${v}`, () => pane().querySelector(`[data-pm-set="${CSS.escape(key)}"][data-value="${CSS.escape(v)}"]`)?.click());
    }
    // Sliders (framed: − slider value +).
    for (const r of [...(pane()?.querySelectorAll('input[type="range"]') ?? [])]) {
      const wrap = r.closest('.slider-control');
      if (!wrap) { fails.push(`slider ${ANY(r)}: no − / + frame`); continue; }
      const [minus, plus] = wrap.querySelectorAll('.slider-step');
      await act(`slider ${ANY(r) || 'range'} ${Number(r.value) >= Number(r.max) ? '−' : '+'}`, () => (Number(r.value) >= Number(r.max) ? minus : plus).click());
    }
    // Buttons (data-pm commands).
    for (const cmd of [...new Set([...(pane()?.querySelectorAll('[data-pm]') ?? [])].map((x) => x.dataset.pm))]) {
      if (['ok', 'cancel'].includes(cmd) || skip.some((s) => (s instanceof RegExp ? s.test(cmd) : s === cmd))) continue;
      const b = pane()?.querySelector(`[data-pm="${CSS.escape(cmd)}"]`);
      if (!b || b.disabled) continue;
      await act(`button ${cmd}`, () => b.click());
      try { m.popups.closeAll(); } catch { /* none */ }
    }
    const errors = window.__ctlErrors.slice(e0);
    if (errors.length) fails.push(...errors.map((x) => `error: ${x}`));
    return { fails, seen };
  };
  window.__paneReport = ({ fails, seen }, min = 1) => (fails.length ? `FAIL: ${fails.join(' ; ')}` : seen.length < min ? `only ${seen.length} controls: ${seen.join(', ')}` : `ok ${seen.length} controls: ${seen.join(', ')}`);
  return 'ok';
})()
//@step {"name": "panel: task pane properties of a part, a feature and a sketch — every number (− / + / typed), field and drop-down applies", "expect": "^ok "}
return (async () => {
  const m = window.__mymechanics;
  await m.actions.closeProject({ force: true }); await m.actions.openSampleAsk('flange'); await new Promise((r) => setTimeout(r, 500));
  if (!m.state.settings.showRightPanel) await m.run('rightPanel');
  const out = []; let fails = [];
  const tab = async (id) => { document.querySelector(`[data-right-tab="${id}"]`)?.click(); await new Promise((r) => setTimeout(r, 120)); };
  await tab('props');
  let r = await window.__paneExercise('#right-panel .panel-body'); out.push(...r.seen); fails.push(...r.fails.map((x) => `part: ${x}`));
  for (const type of ['extrude', 'sketch', 'fillet', 'hole']) {
    const f = m.active().features.find((x) => x.type === type);
    if (!f) continue;
    m.actions.select([{ kind: 'feat', id: f.id, key: `feat:${f.id}` }]); await new Promise((res) => setTimeout(res, 150));
    r = await window.__paneExercise('#right-panel .panel-body'); out.push(...r.seen.map((x) => `${type}.${x}`)); fails.push(...r.fails.map((x) => `${type}: ${x}`));
  }
  for (const t of ['materials', 'display']) { await tab(t); r = await window.__paneExercise('#right-panel .panel-body', { limitOptions: 2 }); out.push(...r.seen.map((x) => `${t}.${x}`)); fails.push(...r.fails.map((x) => `${t}: ${x}`)); }
  await tab('props');
  return window.__paneReport({ fails, seen: out }, 8);
})()
//@step {"name": "panel: material and display tabs — each material button / style button applies", "expect": "^ok "}
return (async () => {
  const m = window.__mymechanics;
  const fails = []; let n = 0;
  for (const t of ['materials', 'display']) {
    document.querySelector(`[data-right-tab="${t}"]`)?.click(); await new Promise((r) => setTimeout(r, 120));
    const buttons = [...document.querySelectorAll('#right-panel .panel-body button')].filter((b) => !b.disabled).map((b, i) => i);
    for (const i of buttons.slice(0, 40)) {
      const b = [...document.querySelectorAll('#right-panel .panel-body button')][i];
      if (!b || b.disabled || b.classList.contains('active')) continue;
      const before = window.__state();
      b.click(); await new Promise((r) => setTimeout(r, 150)); n++;
      if (window.__state() === before) fails.push(`${t} button ${b.dataset.command ?? b.dataset.material ?? b.title ?? i}: nothing changed`);
      try { m.popups.closeAll(); } catch { /* none */ }
    }
  }
  document.querySelector('[data-right-tab="props"]')?.click();
  return fails.length ? fails.join('; ') : `ok ${n} buttons`;
})()
//@step {"name": "panel: lights helper", "expect": "^ok$"}
return (() => {
  const m = window.__mymechanics;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__lightsOpen = async () => {
    if (m.state.editing?.mode === 'lights') return true;
    if (!m.state.doc || m.state.showStart || m.project?.active?.kind !== 'part') { await m.actions.closeProject({ force: true }); await m.actions.openSampleAsk('flange'); await sleep(400); }
    await m.run('lights'); await sleep(300);
    return m.state.editing?.mode === 'lights';
  };
  return 'ok';
})()
//@step {"name": "panel: lights · ambient and camera light — colours, intensities and the on/off box apply", "expect": "^ok "}
return (async () => {
  if (!(await window.__lightsOpen())) return 'the lights page did not open';
  const r = await window.__paneExercise('#left-panel', { skip: [/^addLight/, /^delLight/, /^selLight/] });
  return window.__paneReport(r, 4);
})()
//@step {"name": "panel: lights · add a directional light — it is listed, and its name, type, colour, intensity, position, target apply", "expect": "^ok "}
return (async () => {
  const m = window.__mymechanics;
  if (!(await window.__lightsOpen())) return 'the lights page did not open';
  const before = document.querySelectorAll('#left-panel [data-pm^="selLight:"]').length;
  const add = document.querySelector('#left-panel [data-pm="addLight:directional"]');
  if (!add) return 'no "add directional light" button';
  add.click(); await new Promise((r) => setTimeout(r, 200));
  const rows = [...document.querySelectorAll('#left-panel [data-pm^="selLight:"]')];
  if (rows.length !== before + 1) return `the light list has ${rows.length} rows (was ${before})`;
  rows.at(-1).click(); await new Promise((r) => setTimeout(r, 200));
  const r = await window.__paneExercise('#left-panel', { skip: [/^addLight/, /^delLight/, /^selLight/], skipSet: [] });
  return window.__paneReport(r, 5);
})()
//@step {"name": "panel: lights · add a point light — it is listed, and its name, type, colour, intensity, position apply", "expect": "^ok "}
return (async () => {
  const m = window.__mymechanics;
  if (!(await window.__lightsOpen())) return 'the lights page did not open';
  const before = document.querySelectorAll('#left-panel [data-pm^="selLight:"]').length;
  const add = document.querySelector('#left-panel [data-pm="addLight:point"]');
  if (!add) return 'no "add point light" button';
  add.click(); await new Promise((r) => setTimeout(r, 200));
  const rows = [...document.querySelectorAll('#left-panel [data-pm^="selLight:"]')];
  if (rows.length !== before + 1) return `the light list has ${rows.length} rows (was ${before})`;
  rows.at(-1).click(); await new Promise((r) => setTimeout(r, 200));
  const r = await window.__paneExercise('#left-panel', { skip: [/^addLight/, /^delLight/, /^selLight/], skipSet: [] });
  return window.__paneReport(r, 5);
})()
//@step {"name": "panel: lights · add a spot light — it is listed, and its name, type, colour, intensity, position, target, angle apply", "expect": "^ok "}
return (async () => {
  const m = window.__mymechanics;
  if (!(await window.__lightsOpen())) return 'the lights page did not open';
  const before = document.querySelectorAll('#left-panel [data-pm^="selLight:"]').length;
  const add = document.querySelector('#left-panel [data-pm="addLight:spot"]');
  if (!add) return 'no "add spot light" button';
  add.click(); await new Promise((r) => setTimeout(r, 200));
  const rows = [...document.querySelectorAll('#left-panel [data-pm^="selLight:"]')];
  if (rows.length !== before + 1) return `the light list has ${rows.length} rows (was ${before})`;
  rows.at(-1).click(); await new Promise((r) => setTimeout(r, 200));
  const r = await window.__paneExercise('#left-panel', { skip: [/^addLight/, /^delLight/, /^selLight/], skipSet: [] });
  return window.__paneReport(r, 5);
})()
//@step {"name": "panel: lights · deleting a light removes it", "expect": "^ok$"}
return (async () => {
  const m = window.__mymechanics;
  if (!(await window.__lightsOpen())) return 'the lights page did not open';
  const n = () => document.querySelectorAll('#left-panel [data-pm^="selLight:"]').length;
  if (!n()) document.querySelector('#left-panel [data-pm="addLight:point"]')?.click();
  await new Promise((r) => setTimeout(r, 150));
  const before = n();
  document.querySelector('#left-panel [data-pm^="delLight:"]')?.click(); await new Promise((r) => setTimeout(r, 200));
  const after = n();
  m.actions.cancelEditing({ quiet: true });
  return after === before - 1 ? 'ok' : `lights ${before} → ${after}`;
})()
//@step {"name": "panel: simulation helper", "expect": "^ok$"}
return (() => {
  const m = window.__mymechanics;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__simStudy = async (st) => {
    if (m.state.editing?.mode !== 'simulation') {
      await m.actions.closeProject({ force: true }); await m.actions.openSampleAsk('flange'); await sleep(400);
      await m.run('simulation'); await sleep(300);
    }
    if (m.state.editing?.mode !== 'simulation') return `the simulation page did not open (${m.state.editing?.mode})`;
    const btn = document.querySelector(`#left-panel [data-pm-set="study"][data-value="${st}"]`);
    if (!btn) return `n/a — no ${st} study`;
    btn.click(); await sleep(200);
    if (m.state.editing?.study !== st) return `study ${st}: not selected (${m.state.editing?.study})`;
    const r = await window.__paneExercise('#left-panel', { skip: ['runSim'], skipSet: ['study'], wait: 150 });
    return window.__paneReport(r, 2);
  };
  window.__simLater = async (known) => {
    const all = [...document.querySelectorAll('#left-panel [data-pm-set="study"]')].map((x) => x.dataset.value);
    const out = []; for (const st of all.filter((x) => !known.includes(x))) out.push(`${st}: ${await window.__simStudy(st)}`);
    const bad = out.filter((x) => !/: (ok|n\/a)/.test(x));
    return bad.length ? bad.join(' || ') : `ok ${out.length} more studies`;
  };
  return 'ok';
})()
//@step {"name": "panel: simulation · static study — its numbers (− / + / typed), choices and buttons apply", "expect": "^(ok|n/a)"}
window.__simStudy('static')
//@step {"name": "panel: simulation · thermal study — its numbers (− / + / typed), choices and buttons apply", "expect": "^(ok|n/a)"}
window.__simStudy('thermal')
//@step {"name": "panel: simulation · modal study — its numbers (− / + / typed), choices and buttons apply", "expect": "^(ok|n/a)"}
window.__simStudy('modal')
//@step {"name": "panel: simulation · buckling study — its numbers (− / + / typed), choices and buttons apply", "expect": "^(ok|n/a)"}
window.__simStudy('buckling')
//@step {"name": "panel: simulation · fatigue study — its numbers (− / + / typed), choices and buttons apply", "expect": "^(ok|n/a)"}
window.__simStudy('fatigue')
//@step {"name": "panel: simulation · studies added later — their controls apply", "expect": "^ok"}
window.__simLater(["static","thermal","modal","buckling","fatigue"])
//@step {"name": "panel: simulation — Run gives results on the flange (fixed and loaded faces picked), Clear removes them", "expect": "^ok "}
return (async () => {
  const m = window.__mymechanics;
  if (m.state.editing) m.actions.cancelEditing({ quiet: true });
  await m.run('simulation'); await new Promise((r) => setTimeout(r, 300));
  const e = m.state.editing;
  document.querySelector('#left-panel [data-pm-set="study"][data-value="static"]')?.click(); await new Promise((r) => setTimeout(r, 150));
  // Fixed and loaded faces as picking them would give: mesh face ids of the shown body (its first and last face).
  const groups = m.state.partEntry?.mesh?.faceGroups ?? [];
  if (groups.length < 2) return 'no faces on the body';
  const ed = m.state.editing;
  ed.fixtures = [{ faceId: groups[0].faceId, type: 'PLANE' }]; ed.loads = [{ faceId: groups.at(-1).faceId, type: 'PLANE' }];
  document.querySelector('#left-panel [data-pm="runSim"]')?.click();
  for (let i = 0; i < 300 && !m.state.editing?.result; i++) await new Promise((r) => setTimeout(r, 200));
  const r = m.state.editing?.result;
  if (!r) return `no result (${m.state.notice?.text ?? ''})`;
  const ok = Number.isFinite(r.maxStress) && r.maxStress > 0;
  document.querySelector('#left-panel [data-pm="clearSim"]')?.click(); await new Promise((res) => setTimeout(res, 200));
  const cleared = !m.state.editing?.result;
  m.actions.cancelEditing({ quiet: true });
  void e;
  return ok && cleared ? `ok max stress ${r.maxStress.toFixed(2)} MPa` : `stress ${r.maxStress}, cleared ${cleared}`;
})()
//@step {"name": "panel: equations and configurations — adding a variable / configuration and editing them applies", "expect": "^ok "}
return (async () => {
  const m = window.__mymechanics;
  const out = []; const fails = [];
  for (const id of ['equations', 'configurations']) {
    await m.run(id); await new Promise((r) => setTimeout(r, 250));
    if (!m.state.editing) { fails.push(`${id}: page did not open`); continue; }
    let r = await window.__paneExercise('#left-panel', { skip: ['exportTable', 'importTable', /^del/] });
    // Once more: the rows added by the buttons have their own fields.
    r = await window.__paneExercise('#left-panel', { skip: ['exportTable', 'importTable', /^add/] });
    out.push(...r.seen.map((x) => `${id}.${x}`)); fails.push(...r.fails.map((x) => `${id}: ${x}`));
    m.actions.cancelEditing({ quiet: true });
  }
  return window.__paneReport({ fails, seen: out }, 4);
})()
//@step {"name": "panel: motion helper (slider-crank sample with a motor)", "expect": "^ok"}
return (async () => {
  const m = window.__mymechanics;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Where the parts are drawn: the motion moves the shown bodies (the components keep their mated places).
  window.__pose = () => { let h = 0; m.viewport?.scene?.traverse((o) => { if (o.isMesh) for (const v of o.matrixWorld.elements) h = (h * 31 + Math.round(v * 1000)) | 0; }); return String(h); };
  window.__bar = () => document.querySelector('#motion-bar');
  window.__player = (k) => window.__bar()?.querySelector(`[data-player="${k}"]`);
  window.__motionOpen = async () => {
    if (m.state.editing) m.actions.cancelEditing({ quiet: true });
    if (m.active()?.motion?.motors?.length && window.__bar()) return true;
    await m.actions.closeProject({ force: true }); await m.actions.openSampleAsk('asmSliderCrank'); await sleep(900);
    return Boolean(m.active()?.motion?.motors?.length && window.__bar());
  };
  return (await window.__motionOpen()) ? 'ok' : 'no motion player for the sample';
})()
//@step {"name": "panel: motion player · Play runs the study and moves the parts", "expect": "^ok$"}
return (async () => {
  const m = window.__mymechanics; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!(await window.__motionOpen())) return 'no player';
  const p0 = window.__pose();
  window.__player('play')?.click(); await sleep(700);
  if (!m.state.player?.playing) return 'not playing';
  return window.__pose() !== p0 && m.state.player.time > 0 ? 'ok' : 'the parts did not move';
})()
//@step {"name": "panel: motion player · Pause holds the time", "expect": "^ok$"}
return (async () => {
  const m = window.__mymechanics; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!m.state.player?.playing) { window.__player('play')?.click(); await sleep(400); }
  window.__player('pause')?.click(); await sleep(150);
  const t = m.state.player?.time; await sleep(400);
  return !m.state.player?.playing && m.state.player?.time === t && t > 0 ? 'ok' : `playing ${m.state.player?.playing}, time ${t} → ${m.state.player?.time}`;
})()
//@step {"name": "panel: motion player · Stop goes back to time 0", "expect": "^ok$"}
return (async () => {
  const m = window.__mymechanics; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__player('stop')?.click(); await sleep(250);
  return !m.state.player?.playing && m.state.player?.time === 0 ? 'ok' : `time ${m.state.player?.time}`;
})()
//@step {"name": "panel: motion player · the time slider's + moves the parts", "expect": "^ok$"}
return (async () => {
  const m = window.__mymechanics; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wrap = window.__bar()?.querySelector('input[type="range"]')?.closest('.slider-control');
  if (!wrap) return 'the time slider has no − / + frame';
  const p0 = window.__pose(); const t0 = m.state.player?.time ?? 0;
  wrap.querySelectorAll('.slider-step')[1].click(); await sleep(250);
  return m.state.player?.time > t0 && window.__pose() !== p0 ? 'ok' : `time ${t0} → ${m.state.player?.time}`;
})()
//@step {"name": "panel: motion player · the time slider's − moves back", "expect": "^ok$"}
return (async () => {
  const m = window.__mymechanics; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wrap = window.__bar()?.querySelector('input[type="range"]')?.closest('.slider-control');
  const t0 = m.state.player?.time ?? 0;
  wrap.querySelectorAll('.slider-step')[0].click(); await sleep(250);
  return m.state.player?.time < t0 ? 'ok' : `time ${t0} → ${m.state.player?.time}`;
})()
//@step {"name": "panel: motion player · a typed time is applied", "expect": "^ok$"}
return (async () => {
  const m = window.__mymechanics; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const range = window.__bar()?.querySelector('input[type="range"]');
  const box = range?.closest('.slider-control')?.querySelector('.slider-value');
  if (!box) return 'no value box';
  const want = Number(range.max) / 2;
  box.value = String(want); box.dispatchEvent(new Event('change', { bubbles: true })); await sleep(250);
  return Math.abs((m.state.player?.time ?? 0) - want) < 0.02 ? 'ok' : `time ${m.state.player?.time}, wanted ${want}`;
})()
//@step {"name": "panel: motion study page · motor kind, speed, duration, time slider and buttons apply", "expect": "^ok"}
return (async () => {
  const m = window.__mymechanics; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await window.__motionOpen();
  await m.run('motion'); await sleep(300);
  if (m.state.editing?.mode !== 'motion') return `the motion page did not open (${m.state.editing?.mode})`;
  const r = await window.__paneExercise('#left-panel', { skip: [/^del/, /^clear:/], wait: 200 });
  if (m.state.editing?.playing) document.querySelector('#left-panel [data-pm="stopMotion"]')?.click();
  m.actions.cancelEditing({ quiet: true });
  return window.__paneReport(r, 3);
})()
//@step {"name": "panel: mate helper", "expect": "^ok$"}
return (() => {
  const m = window.__mymechanics;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__mateType = async (ty) => {
    if (m.state.editing?.mode !== 'mate') {
      await m.actions.closeProject({ force: true }); await m.actions.openSampleAsk('shaftAssembly'); await sleep(700);
      await m.run('mate'); await sleep(300);
    }
    if (m.state.editing?.mode !== 'mate') return `the mate page did not open (${m.state.editing?.mode})`;
    const btn = document.querySelector(`#left-panel [data-pm-set="type"][data-value="${ty}"]`);
    if (!btn) return `n/a — no ${ty} button on the mate page`;
    btn.click(); await sleep(150);
    if (m.state.editing?.mate?.type !== ty) return `${ty}: not selected (${m.state.editing?.mate?.type})`;
    const fails = []; const seen = [];
    for (const key of [...new Set([...document.querySelectorAll('#left-panel [data-pm-field]')].map((x) => x.dataset.pmField))]) {
      for (const d of [1, -1]) {
        const before = JSON.stringify(m.state.editing.mate);
        const el = document.querySelector(`#left-panel [data-pm-field="${key}"]`);
        const step = document.querySelector(`#left-panel [data-pm-step="${key}"][data-delta="${d}"]`) ?? el?.closest('.num-control')?.querySelector(`.slider-step[data-dir="${d}"]`);
        if (!step) { fails.push(`${key}: no ${d > 0 ? '+' : '−'} button`); continue; }
        step.click(); await sleep(120); seen.push(`${key}${d > 0 ? '+' : '−'}`);
        if (JSON.stringify(m.state.editing.mate) === before) fails.push(`${key} ${d > 0 ? '+' : '−'}: the mate did not change`);
      }
      const el = document.querySelector(`#left-panel [data-pm-field="${key}"]`);
      if (el) { const before = JSON.stringify(m.state.editing.mate); el.value = '7'; el.dispatchEvent(new Event('change', { bubbles: true })); await sleep(120); seen.push(`${key} typed`); if (JSON.stringify(m.state.editing.mate) === before) fails.push(`${key} typed 7: the mate did not change`); }
    }
    for (const key of [...new Set([...document.querySelectorAll('#left-panel input[type="checkbox"][data-pm-toggle]')].map((x) => x.dataset.pmToggle))]) {
      const before = JSON.stringify(m.state.editing.mate);
      document.querySelector(`#left-panel [data-pm-toggle="${key}"]`).click(); await sleep(120); seen.push(`toggle ${key}`);
      if (JSON.stringify(m.state.editing.mate) === before) fails.push(`toggle ${key}: the mate did not change`);
    }
    for (const key of [...new Set([...document.querySelectorAll('#left-panel [data-pm-set]')].map((x) => x.dataset.pmSet))].filter((k) => k !== 'type' && k !== 'mateGroup')) {
      for (const v of [...document.querySelectorAll(`#left-panel [data-pm-set="${key}"]:not(.active)`)].map((x) => x.dataset.value)) {
        const before = JSON.stringify([m.state.editing.mate, m.state.editing.mateGroup]);
        document.querySelector(`#left-panel [data-pm-set="${key}"][data-value="${v}"]`)?.click(); await sleep(120); seen.push(`${key}=${v}`);
        if (JSON.stringify([m.state.editing.mate, m.state.editing.mateGroup]) === before) fails.push(`${key}=${v}: nothing changed`);
      }
    }
    return fails.length ? `FAIL ${fails.join('; ')}` : `ok ${seen.length} controls: ${seen.join(', ')}`;
  };
  return 'ok';
})()
//@step {"name": "panel: mate · coincident — selectable, and its numbers (− / + / typed), check boxes and choices change the mate", "expect": "^(ok|n/a)"}
window.__mateType('coincident')
//@step {"name": "panel: mate · concentric — selectable, and its numbers (− / + / typed), check boxes and choices change the mate", "expect": "^(ok|n/a)"}
window.__mateType('concentric')
//@step {"name": "panel: mate · distance — selectable, and its numbers (− / + / typed), check boxes and choices change the mate", "expect": "^(ok|n/a)"}
window.__mateType('distance')
//@step {"name": "panel: mate · parallel — selectable, and its numbers (− / + / typed), check boxes and choices change the mate", "expect": "^(ok|n/a)"}
window.__mateType('parallel')
//@step {"name": "panel: mate · perpendicular — selectable, and its numbers (− / + / typed), check boxes and choices change the mate", "expect": "^(ok|n/a)"}
window.__mateType('perpendicular')
//@step {"name": "panel: mate · angle — selectable, and its numbers (− / + / typed), check boxes and choices change the mate", "expect": "^(ok|n/a)"}
window.__mateType('angle')
//@step {"name": "panel: mate · lock — selectable, and its numbers (− / + / typed), check boxes and choices change the mate", "expect": "^(ok|n/a)"}
window.__mateType('lock')
//@step {"name": "panel: mate · width — selectable, and its numbers (− / + / typed), check boxes and choices change the mate", "expect": "^(ok|n/a)"}
window.__mateType('width')
//@step {"name": "panel: mate · symmetric — selectable, and its numbers (− / + / typed), check boxes and choices change the mate", "expect": "^(ok|n/a)"}
window.__mateType('symmetric')
//@step {"name": "panel: mate · limitDistance — selectable, and its numbers (− / + / typed), check boxes and choices change the mate", "expect": "^(ok|n/a)"}
window.__mateType('limitDistance')
//@step {"name": "panel: mate · limitAngle — selectable, and its numbers (− / + / typed), check boxes and choices change the mate", "expect": "^(ok|n/a)"}
window.__mateType('limitAngle')
//@step {"name": "panel: mate · gear — selectable, and its numbers (− / + / typed), check boxes and choices change the mate", "expect": "^(ok|n/a)"}
window.__mateType('gear')
//@step {"name": "panel: mate · rackPinion — selectable, and its numbers (− / + / typed), check boxes and choices change the mate", "expect": "^(ok|n/a)"}
window.__mateType('rackPinion')
//@step {"name": "panel: mate · screw — selectable, and its numbers (− / + / typed), check boxes and choices change the mate", "expect": "^(ok|n/a)"}
window.__mateType('screw')
//@step {"name": "panel: mate · hinge — selectable, and its numbers (− / + / typed), check boxes and choices change the mate", "expect": "^(ok|n/a)"}
window.__mateType('hinge')
//@step {"name": "panel: mate · cam — selectable, and its numbers (− / + / typed), check boxes and choices change the mate", "expect": "^(ok|n/a)"}
window.__mateType('cam')
//@step {"name": "panel: mate · mate types added later", "expect": "^ok"}
return (async () => { const known = ["coincident","concentric","distance","parallel","perpendicular","angle","lock","width","symmetric","limitDistance","limitAngle","gear","rackPinion","screw","hinge","cam"]; const all = [...document.querySelectorAll('#left-panel [data-pm-set="type"]')].map((x) => x.dataset.value); const out = []; for (const t of all.filter((x) => !known.includes(x))) out.push(`${t}: ${await window.__mateType(t)}`); window.__mymechanics.actions.cancelEditing({ quiet: true }); const bad = out.filter((x) => !/: (ok|n\/a)/.test(x)); return bad.length ? bad.join(' || ') : `ok ${out.length} more`; })()
//@step {"name": "panel: drawing properties — sheet, scale and view settings in the task pane apply", "expect": "^ok "}
return (async () => {
  const m = window.__mymechanics;
  await m.actions.closeProject({ force: true }); await m.actions.openSampleAsk('flange'); await new Promise((r) => setTimeout(r, 400));
  await m.actions.newDrawing(); await new Promise((r) => setTimeout(r, 900));
  if (!m.state.settings.showRightPanel) await m.run('rightPanel');
  const out = []; const fails = [];
  let r = await window.__paneExercise('#right-panel .panel-body', { limitOptions: 2 });
  out.push(...r.seen); fails.push(...r.fails.map((x) => `sheet: ${x}`));
  const d = m.active();
  const view = (d.views ?? [])[0];
  if (view) {
    m.state.drawingSelected = { kind: 'view', id: view.id }; m.run('rebuild'); await new Promise((res) => setTimeout(res, 300));
    r = await window.__paneExercise('#right-panel .panel-body', { limitOptions: 2 });
    out.push(...r.seen.map((x) => `view.${x}`)); fails.push(...r.fails.map((x) => `view: ${x}`));
  }
  return window.__paneReport({ fails, seen: out }, 3);
})()
//@step {"name": "panel: motion player · dragging the time slider keeps the same slider under the pointer (the bar is not drawn again)", "expect": "^ok$"}
return (async () => {
  const m = window.__mymechanics; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!(await window.__motionOpen())) return 'no player';
  const range = window.__bar()?.querySelector('input[type="range"]');
  if (!range) return 'no slider';
  for (const v of [0.2, 0.4, 0.6]) { range.value = String(v); range.dispatchEvent(new Event('input', { bubbles: true })); await sleep(40); }
  const same = window.__bar()?.querySelector('input[type="range"]') === range;
  return same && Math.abs(m.state.player.time - 0.6) < 1e-9 ? 'ok' : `same slider ${same}, time ${m.state.player.time}`;
})()
//@step {"name": "panel: motion study page · the motors list's clear button removes the motors", "expect": "^ok$"}
return (async () => {
  const m = window.__mymechanics; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await window.__motionOpen();
  await m.run('motion'); await sleep(300);
  if (m.state.editing?.mode !== 'motion') return `the motion page did not open (${m.state.editing?.mode})`;
  const n0 = m.active().motion.motors.length;
  const clear = document.querySelector('#left-panel [data-pm="clear:motor"]');
  if (!clear) return 'no clear button on the motors list';
  clear.click(); await sleep(200);
  const n1 = m.active().motion?.motors?.length ?? 0;
  m.actions.cancelEditing({ quiet: true });
  return n0 > 0 && n1 === 0 ? 'ok' : `motors ${n0} → ${n1}`;
})()
//@step {"name": "panel: simulation · the fixtures list's clear button empties it", "expect": "^ok$"}
return (async () => {
  const m = window.__mymechanics; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (m.state.editing) m.actions.cancelEditing({ quiet: true });
  await m.actions.closeProject({ force: true }); await m.actions.openSampleAsk('flange'); await sleep(400);
  await m.run('simulation'); await sleep(300);
  const groups = m.state.partEntry?.mesh?.faceGroups ?? [];
  const e = m.state.editing;
  e.fixtures = [{ faceId: groups[0].faceId, type: 'PLANE' }];
  document.querySelector('#left-panel [data-pm-set="study"][data-value="static"]')?.click(); await sleep(200);
  const clear = document.querySelector('#left-panel [data-pm="clear:fixtures"]');
  if (!clear) return 'no clear button on the fixtures list';
  clear.click(); await sleep(200);
  const n = m.state.editing?.fixtures?.length;
  m.actions.cancelEditing({ quiet: true });
  return n === 0 ? 'ok' : `fixtures left: ${n}`;
})()
