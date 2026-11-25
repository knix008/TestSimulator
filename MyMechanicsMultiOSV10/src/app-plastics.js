// The main window's side of the injection moulding flow study (app-mfg.js chains it onto app-more.js's hooks):
// the PropertyManager (resin, process, gates picked on the part or suggested, mesh), running the fill, the part
// coloured by fill time / pressure / flow-front temperature / weld lines / air traps / sink, the summary and
// the report (saved through the app's export path). The flow model is cad/plastics.js (no DOM).
import * as THREE from 'three';
import { RESINS, RESIN_IDS, resinOf, partDomain, suggestGate, resultColours, plasticsReportHtml, rampColour } from './cad/plastics.js';
import { runMouldingStudy, vertexColours } from './cad/plastics-post.js';
import { multiCavityStudy, balanceRunners, layoutCavities } from './cad/plastics-runner.js';
import { gasAssistStudy } from './cad/plastics-gas.js';
import { COOLANTS, MOULD_STEELS } from './cad/plastics-cooling.js';
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';

const QUANTITIES = [['fillTime', 'plFillTime'], ['pressure', 'plPressure'], ['temperature', 'plTemperature'], ['frozenLayer', 'plCooling'], ['packPressure', 'plClamp'], ['shrinkage', 'plShrink'], ['sink', 'plSink'], ['weld', 'plWeld'], ['trap', 'plAirTraps']];

/** The quantities a result can show: the fill's, then those of the fiber, cooling and warpage steps it ran. */
const quantitiesOf = (res) => [
  ...QUANTITIES,
  ...(res?.mouldTemp ? [['mouldTemp', 'plCooling'], ['coolTime', 'timer']] : []),
  ...(res?.fiberAlign ? [['fiberAlign', 'plFiber'], ['fiberSkin', 'plFiber'], ['fiberCore', 'plFiber']] : []),
  ...(res?.warp?.cases ? [['warp', 'plWarp']] : []),
];
const CAUSE_IDS = ['total', 'shrinkage', 'cooling', 'orientation'];

export function createPlasticsTools(ctx) {
  const { state, t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const part = () => ctx.activePart();
  const editing = () => state.editing;
  const owns = (e) => e?.mode === 'plastics';
  const fmt = (v, d = 2) => ctx.fmt(v, d);
  const sel = (key, options, current, label, glyph = null) => `<label class="pm-field" title="${escapeHtml(label)}">${glyph ? icon(glyph) : ''}<span class="pm-label">${escapeHtml(label)}</span><select data-pm-select="${escapeHtml(key)}" aria-label="${escapeHtml(label)}">${options.map(([v, text]) => `<option value="${escapeHtml(v)}" ${String(v) === String(current ?? '') ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select></label>`;
  let saveHook = null;
  let inline = false; // tests: run on this thread
  const runtime = { key: null, domain: null, result: null, resultKey: null, runner: null, gas: null };

  function studyOf(p, { create = false } = {}) {
    if (!p) return null;
    if (!p.plastics && create) p.plastics = { resin: resinOf(p.material) ?? 'abs', melt: null, mould: null, fillTime: 0, maxPressure: 180, gates: [], mode: 'auto', cells: 50 };
    return p.plastics ?? null;
  }
  const edit = (mutate) => ctx.change('op.plastics', () => mutate(studyOf(part(), { create: true })));

  /** The key of the part as built with the study's mesh settings (a result belongs to one key). */
  function studyKey() {
    const p = part(); if (!p) return null;
    const entry = ctx.buildPart(p);
    if (!entry?.mesh) return null;
    const s = studyOf(p);
    const key = `${p.id}|${entry.key}|${s?.mode}|${s?.cells}`;
    if (runtime.key !== key) { runtime.key = key; runtime.result = null; runtime.domain = null; runtime.preview = null; }
    return { key, entry };
  }

  /** A quick coarse cavity on this thread (gate suggestion, the mesh line in the PropertyManager). */
  function domain() {
    const k = studyKey(); if (!k) return null;
    if (runtime.domain?.adj) return runtime.domain;
    if (!runtime.preview) {
      const s = studyOf(part());
      try { runtime.preview = partDomain(k.entry.mesh, { cells: Math.min(30, Math.round(s?.cells ?? 50)), mode: s?.mode ?? 'auto', budget: 15000 }); } catch (error) { console.warn('plastics domain', error); runtime.preview = null; }
    }
    return runtime.preview;
  }

  function begin(extra = {}) {
    const p = part();
    if (!p) { notify('info', t('cam.needPart')); return; }
    if (!studyOf(p)) ctx.change('op.plastics', () => { studyOf(p, { create: true }); });
    if (editing() && !owns(editing())) ctx.cancelEditing({ quiet: true });
    state.editing = { mode: 'plastics', quantity: 'fillTime', pick: null, ...extra };
    state.leftTab = 'pm';
    ctx.syncView(); ctx.renderAll();
  }
  const finish = () => ctx.cancelEditing({ quiet: true });

  /**
   * Runs the study in a Web Worker (cad/plastics.js runStudy): the full-resolution cavity, filling and packing off
   * this thread, with progress and Cancel (the worker is ended). Without workers (tests) it runs here.
   */
  async function run() {
    const p = part(); const s = studyOf(p, { create: true });
    const k = studyKey();
    if (!k) { notify('info', t('notice.noBody')); return null; }
    const input = {
      mesh: { vertices: Float32Array.from(k.entry.mesh.vertices), triangles: Uint32Array.from(k.entry.mesh.triangles) },
      gates: s.gates ?? [],
      domain: { cells: Math.max(10, Math.min(160, Math.round(s.cells ?? 50))), mode: s.mode ?? 'auto', budget: s.budget ?? 60000 },
      process: { resin: s.resin, melt: s.melt || null, mould: s.mould || null, fillTime: s.fillTime || 0, maxPressure: s.maxPressure || 180, packPressure: s.packPressure || null, packTime: s.packTime || null, inserts: (s.inserts ?? []).map((x) => ({ points: x.points, temperature: x.temperature })) },
      fiber: s.fiber > 0 ? { fraction: s.fiber, aspect: s.aspect || 20 } : null,
      cooling: s.cooling?.on ? { auto: { diameter: s.cooling.diameter || 8, flow: s.cooling.flow || 6, inlet: s.cooling.inlet ?? 25, coolant: s.cooling.coolant || 'water', pitch: s.cooling.pitch || null, depth: s.cooling.depth || null }, cycleTime: s.cooling.cycle || 0, steel: s.cooling.steel || 'p20' } : null,
      warp: s.warp?.on ? { on: true, size: s.warp.size || 0 } : null,
    };
    const out = await ctx.withProgress('progress.plastics', p.name, (op, report, signal) => new Promise((resolve) => {
      const onMessage = (m) => {
        if (m.type === 'progress') report({ fraction: m.fraction, text: t(`pl.phase.${m.phase}`, null, m.phase) });
        else if (m.type === 'error') { notify('error', t('pl.failed', { reason: m.message })); resolve(null); }
      };
      if (typeof Worker === 'undefined' || inline) { setTimeout(() => resolve(runMouldingStudy(input, onMessage, signal)), 20); return; }
      const worker = new Worker(new URL('./workers/plastics-worker.js', import.meta.url), { type: 'module' });
      const stop = (value) => { clearInterval(timer); worker.terminate(); resolve(value); };
      const timer = setInterval(() => { if (signal?.cancelled) { notify('info', t('pl.cancelled')); stop(null); } }, 100);
      worker.onmessage = (event) => { const m = event.data; if (m.type === 'result') stop(m); else { onMessage(m); if (m.type === 'error') stop(null); } };
      worker.onerror = (event) => { notify('error', t('pl.failed', { reason: event.message ?? 'worker' })); stop(null); };
      worker.postMessage(input);
    }), { delay: 150, cancellable: true });
    if (!out) return null;
    // The run took a while: another document may be open now — the result belongs to the part it started on.
    if (part() !== p) return null;
    const result = out.result;
    runtime.domain = out.domain; runtime.result = result; runtime.resultKey = runtime.key; runtime.colourKey = null;
    for (const [what, r] of [['pl.coolGroup', result.cooling], ['pl.warpGroup', result.warp]]) if (r?.error) notify('warning', t('pl.extraFailed', { what: t(what), reason: t(`pl.err.${r.error}`, null, r.error) }));
    if (!(s.gates ?? []).length && out.gates?.length) edit((st) => { st.gates = out.gates.map((g) => out.domain.nodes[g].c.map((v) => Math.round(v * 1000) / 1000)); });
    const sm = result.summary;
    notify(sm.shortShot ? 'warning' : 'success', sm.shortShot ? t('pl.shortShotNotice', { pct: fmt(sm.filledFraction * 100, 1) }) : t('pl.filledNotice', { time: fmt(sm.fillTime, 2), p: fmt(sm.gatePressure, 1) }));
    if (owns(editing())) editing().quantity ??= 'fillTime';
    ctx.syncView(); ctx.renderLeft();
    return result;
  }

  // ───────────────────────── runners, multi-cavity and family moulds

  const runnerOf = (s) => ({ cavities: 1, family: [], diameter: 6, gateDiameter: 0, gap: 10, ...(s?.runner ?? {}) });
  /** Other parts of the project that have a body (family mould candidates). */
  function familyCandidates() {
    const p = part();
    return (ctx.state.doc?.project?.parts ?? []).filter((q) => q !== p && q.features?.length);
  }
  /** The cavities: this part × the count, then each family part picked; meshes from their builds, gates from their studies. */
  function cavitiesOf(s) {
    const R = runnerOf(s), p = part(), entry = ctx.buildPart(p);
    if (!entry?.mesh) return [];
    const own = { mesh: { vertices: Float32Array.from(entry.mesh.vertices), triangles: Uint32Array.from(entry.mesh.triangles) }, gate: s.gates?.[0] ?? null };
    const out = Array.from({ length: Math.max(1, Math.min(8, Math.round(R.cavities))) }, (_, i) => ({ ...own, name: `${p.name} ${i + 1}`, partId: p.id }));
    for (const id of R.family) {
      const q = familyCandidates().find((x) => x.id === id);
      const qe = q ? ctx.buildPart(q) : null;
      if (!qe?.mesh) continue;
      out.push({ mesh: { vertices: Float32Array.from(qe.mesh.vertices), triangles: Uint32Array.from(qe.mesh.triangles) }, gate: q.plastics?.gates?.[0] ?? null, name: q.name, partId: q.id });
    }
    return out;
  }
  /** Runs the mould (balanced: the branches resized until the cavities fill together). */
  async function runRunner({ balance = false } = {}) {
    const p = part(); const s = studyOf(p, { create: true }); const R = runnerOf(s);
    const cavities = cavitiesOf(s);
    if (!cavities.length) { notify('info', t('notice.noBody')); return null; }
    const input = {
      cavities, gap: R.gap,
      runner: { diameter: R.diameter, gateDiameter: R.gateDiameter > 0 ? R.gateDiameter : undefined, branches: !balance && R.branches?.length === cavities.length ? R.branches : undefined },
      process: { resin: s.resin, melt: s.melt || null, mould: s.mould || null, fillTime: s.fillTime || 0, maxPressure: s.maxPressure || 180 },
      domain: { cells: Math.max(10, Math.min(30, Math.round(s.cells ?? 50))), mode: s.mode ?? 'auto', budget: 20000 },
    };
    const out = await ctx.withProgress('progress.plastics', p.name, () => new Promise((resolve) => {
      setTimeout(() => { try { resolve(balance ? balanceRunners(input, { target: 0.03, maxIterations: 10 }) : multiCavityStudy(input)); } catch (error) { notify('error', t('pl.failed', { reason: error.message })); resolve(null); } }, 20);
    }), { delay: 150 });
    if (!out?.ok) return null;
    if (balance) edit((st) => { st.runner = { ...runnerOf(st), branches: out.branches.map((v) => Math.round(v * 100) / 100) }; });
    // Keep what the panel and the view need (not the whole graph).
    const md = out.mould;
    runtime.runner = {
      key: runtime.key, cavities: out.cavities.map((c, i) => ({ ...c, offset: out.offsets[i] })), imbalance: out.imbalance, runnerVolume: out.runnerVolume, runnerShare: out.runnerShare, spruePressure: out.spruePressure,
      shortShot: out.shortShot, balanced: balance, history: out.history ?? null, diameter: R.diameter,
      boxes: cavities.map((c, i) => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (let v = 0; v < c.mesh.vertices.length; v += 3) for (let k = 0; k < 3; k++) { const x = c.mesh.vertices[v + k] + out.offsets[i][k]; lo[k] = Math.min(lo[k], x); hi[k] = Math.max(hi[k], x); } return [lo, hi]; }),
      runnerPoints: (() => { const pts = []; for (let n = md.runner.start; n < md.runner.end; n++) pts.push(...md.domain.nodes[n].c); return pts; })(),
      gates: out.cavities.map((c) => md.domain.nodes[c.gateNode].c),
    };
    notify(out.shortShot ? 'warning' : 'success', t(out.shortShot ? 'pl.runnerShort' : 'pl.runnerDone', { imb: fmt(out.imbalance * 100, 1), p: fmt(out.spruePressure ?? 0, 1) }));
    ctx.syncView(); ctx.renderLeft();
    return runtime.runner;
  }
  function runnerGroup(s) {
    const { pmNum, pmButton } = ctx.pm;
    const R = runnerOf(s);
    const check = (key, on, label, glyph) => `<label class="pm-check" title="${escapeHtml(label)}"><input type="checkbox" data-pm-toggle="${key}" ${on ? 'checked' : ''}/>${icon(glyph)}<span>${escapeHtml(label)}</span></label>`;
    const fam = familyCandidates();
    const famBody = fam.length ? `<p class="pm-label">${escapeHtml(t('pl.family'))}</p>${fam.map((q) => check(`plFamily.${q.id}`, R.family.includes(q.id), q.name, 'part')).join('')}` : `<p class="pm-note">${escapeHtml(t('pl.familyNone'))}</p>`;
    const rr = runtime.runner && runtime.runner.key === runtime.key ? runtime.runner : null;
    let res = '';
    if (rr) {
      res = `<table class="sim2-table pl-cavity-table"><tr><th>${escapeHtml(t('pl.cavity'))}</th><th>${escapeHtml(t('pl.r.fillTime'))}</th><th>${escapeHtml(t('pl.filledShare'))}</th><th>${escapeHtml(t('pl.branchD'))}</th></tr>${rr.cavities.map((c) => `<tr class="${c.complete ? '' : 'warn'}"><td>${escapeHtml(c.name)}</td><td>${escapeHtml(`${fmt(c.fillTime, 3)} s`)}</td><td>${escapeHtml(`${fmt(c.filled * 100, 1)} %`)}</td><td>${escapeHtml(`${fmt(c.branchDiameter, 2)} mm`)}</td></tr>`).join('')}</table>
      <ul class="mfg-results"><li class="${rr.imbalance > 0.05 ? 'warn' : ''}">${icon('plFillTime', 'icon tiny')}<span>${escapeHtml(`${t('pl.imbalance')}: ${fmt(rr.imbalance * 100, 1)} %`)}</span></li><li>${icon('plPressure', 'icon tiny')}<span>${escapeHtml(`${t('pl.spruePressure')}: ${fmt(rr.spruePressure ?? 0, 1)} MPa`)}</span></li><li>${icon('material', 'icon tiny')}<span>${escapeHtml(`${t('pl.runnerVolume')}: ${fmt(rr.runnerVolume / 1000, 2)} cm³ (${fmt(rr.runnerShare * 100, 1)} %)`)}</span></li>${rr.history ? `<li>${icon('plRunner', 'icon tiny')}<span>${escapeHtml(t('pl.balanceSteps', { steps: rr.history.map((v) => `${fmt(v * 100, 1)}%`).join(' → ') }))}</span></li>` : ''}</ul>`;
    }
    return `${pmNum('plCavities', R.cavities, t('pl.cavities'), 'plRunner', '')}${famBody}${pmNum('plRunnerD', R.diameter, t('pl.runnerD'), 'plRunner', 'mm')}${pmNum('plGateD', R.gateDiameter, t('pl.gateD'), 'plGate', 'mm')}${pmNum('plRunnerGap', R.gap, t('pl.runnerGap'), 'plVoxel', 'mm')}${R.branches?.length ? `<p class="pm-note">${escapeHtml(t('pl.branchesSet', { list: R.branches.map((v) => fmt(v, 2)).join(' / ') }))}</p>` : ''}<p class="pm-note">${escapeHtml(t('pl.runnerNote'))}</p><div class="pm-row">${pmButton('pl.runRunner', 'plRun', t('pl.runRunner'))}${pmButton('pl.balance', 'plRunner', t('pl.balance'))}</div>${res}`;
  }

  // ───────────────────────── gas-assisted injection and insert moulding

  const gasOf = (s) => ({ shot: 85, minThick: 1.3, skin: 0.2, pin: null, ...(s?.gas ?? {}) });
  /** Points of a part face (its mesh vertices, thinned to 200) for an insert. */
  function facePoints(faceIndex) {
    const entry = ctx.buildPart(part()); const face = entry?.faces?.[faceIndex];
    if (!face || !entry.mesh?.faceGroups) return null;
    const g = entry.mesh.faceGroups.find((x) => x.faceId === face.hashCode);
    if (!g) return null;
    const ids = [...new Set(Array.from(entry.mesh.triangles.slice(g.start, g.start + g.count)))];
    const step = Math.max(1, Math.ceil(ids.length / 200));
    return ids.filter((_, i) => i % step === 0).map((v) => [0, 1, 2].map((k) => Math.round(entry.mesh.vertices[3 * v + k] * 1000) / 1000));
  }
  function runGas() {
    const s = studyOf(part(), { create: true }); const G = gasOf(s);
    const d = domain();
    if (!d?.nodes.length) { notify('info', t('notice.noBody')); return null; }
    const gates = (s.gates?.length ? s.gates : [d.nodes[suggestGate(d)].c]).map((g) => nearestNodeOf(d, g));
    const pin = G.pin ? nearestNodeOf(d, G.pin) : gates[0];
    let r;
    try { r = gasAssistStudy(d, { gates, process: { resin: s.resin, melt: s.melt || null, mould: s.mould || null, fillTime: s.fillTime || 0, maxPressure: s.maxPressure || 180 }, gas: { node: pin, shot: G.shot / 100, minThick: G.minThick, skin: G.skin } }); }
    catch (error) { notify('error', t('pl.failed', { reason: error.message })); return null; }
    runtime.gas = { key: runtime.key, summary: r.summary, points: d.nodes.flatMap((nd, i) => (r.gas[i] ? nd.c : [])), pin: d.nodes[pin].c };
    const sm = r.summary;
    notify(sm.complete ? 'success' : 'warning', t(sm.blowThrough ? 'pl.gasBlow' : sm.shortShot ? 'pl.gasShort' : 'pl.gasDone', { gas: fmt(sm.gasVolume * 100, 1), reach: fmt(sm.penetration, 1) }));
    ctx.syncView(); ctx.renderLeft();
    return runtime.gas;
  }
  const nearestNodeOf = (d, p) => { let b = 0, bd = Infinity; d.nodes.forEach((n, i) => { const q = Math.hypot(n.c[0] - p[0], n.c[1] - p[1], d.kind === 'midplane' ? 0 : n.c[2] - p[2]); if (q < bd) { bd = q; b = i; } }); return b; };
  function gasGroup(s, e) {
    const { pmNum, pmButton } = ctx.pm;
    const G = gasOf(s);
    const check = (key, on, label, glyph) => `<label class="pm-check" title="${escapeHtml(label)}"><input type="checkbox" data-pm-toggle="${key}" ${on ? 'checked' : ''}/>${icon(glyph)}<span>${escapeHtml(label)}</span></label>`;
    const inserts = (s.inserts ?? []).map((x, i) => `<li>${icon('plInsert', 'icon tiny')}<span class="grow">${escapeHtml(t('pl.insertN', { n: i + 1, temp: fmt(x.temperature, 0) }))}</span><button type="button" class="icon-button" data-pm="pl.delInsert:${i}" title="${escapeHtml(t('pm.clear'))}">${icon('trash', 'icon tiny')}</button></li>`).join('');
    const ins = `<p class="pm-label">${escapeHtml(t('pl.inserts'))}</p><ul class="pm-pick-list">${inserts || `<li class="muted">${escapeHtml(t(e.pick === 'insert' ? 'pl.pickInsertNow' : 'pl.noInserts'))}</li>`}</ul>${pmNum('plInsertT', s.insertTemp ?? 25, t('pl.insertTemp'), 'plTemperature', '°C')}<div class="pm-row">${pmButton('pl.pickInsert', 'plInsert', t(e.pick === 'insert' ? 'pl.picking' : 'pl.pickInsert'))}</div><p class="pm-note">${escapeHtml(t('pl.insertNote'))}</p>`;
    const g = runtime.gas && runtime.gas.key === runtime.key ? runtime.gas.summary : null;
    const res = g ? `<ul class="mfg-results pl-gas-results"><li class="${g.complete ? '' : 'warn'}">${icon(g.complete ? 'check' : 'warning', 'icon tiny')}<span>${escapeHtml(t(g.blowThrough ? 'pl.gasBlowShort' : g.shortShot ? 'pl.gasShortShort' : 'pl.gasFilled'))}</span></li><li>${icon('plGas', 'icon tiny')}<span>${escapeHtml(`${t('pl.gasVolume')}: ${fmt(g.gasVolume * 100, 1)} %`)}</span></li><li>${icon('plGas', 'icon tiny')}<span>${escapeHtml(`${t('pl.gasReach')}: ${fmt(g.penetration, 1)} mm`)}</span></li><li>${icon('plVoxel', 'icon tiny')}<span>${escapeHtml(`${t('pl.gasNodes')}: ${g.gasNodes} · ${t('pl.nominalWall')} ${fmt(g.nominalWall, 2)} mm`)}</span></li></ul>` : '';
    const gas = `${pmNum('plGasShot', G.shot, t('pl.gasShot'), 'plGas', '%')}${pmNum('plGasThick', G.minThick, t('pl.gasThick'), 'plVoxel', '×')}${pmNum('plGasSkin', G.skin * 100, t('pl.gasSkin'), 'plCooling', '%')}<p class="pm-note">${escapeHtml(G.pin ? t('pl.gasPinAt', { p: G.pin.map((v) => fmt(v, 1)).join(', ') }) : t('pl.gasPinGate'))}</p><div class="pm-row">${pmButton('pl.pickGasPin', 'plGate', t(e.pick === 'gasPin' ? 'pl.picking' : 'pl.pickGasPin'))}${pmButton('pl.runGas', 'plGas', t('pl.runGas'))}</div><p class="pm-note">${escapeHtml(t('pl.gasNote'))}</p>${res}`;
    void check;
    return `${ins}<hr class="pm-sep"/>${gas}`;
  }

  function suggest() {
    const d = domain();
    if (!d?.nodes.length) { notify('info', t('notice.noBody')); return; }
    const g = suggestGate(d);
    edit((s) => { s.gates = [d.nodes[g].c.map((v) => Math.round(v * 1000) / 1000)]; });
    runtime.result = null;
    notify('success', t('pl.gateSuggested'));
  }

  const labels = () => {
    const L = {};
    for (const k of ['report', 'shortShot', 'filled', 'inputs', 'resin', 'melt', 'mould', 'gates', 'model', 'nodes', 'results', 'fillTime', 'gatePressure', 'frontTemp', 'weld', 'traps', 'coolingTime', 'cycleTime', 'sink', 'clamp', 'wall', 'mass', 'pack', 'shrinkage']) L[`pl.${k}`] = t(`pl.r.${k}`);
    for (const k of ['fiberGroup', 'coolGroup', 'warpGroup', 'fiberMean', 'fiberSkin', 'fiberCI', 'wallTemp', 'coolNeeded', 'cycleCooled', 'heat', 'circuit', 'heatW', 'inOut', 'warpTotal', 'warpDominantRow', 'cause.shrinkage', 'cause.cooling', 'cause.orientation']) L[`pl.${k}`] = t(`pl.${k}`);
    for (const id of RESIN_IDS) L[`pl.resin.${id}`] = t(`pl.resin.${id}`);
    L['pl.kind.midplane'] = t('pl.kind.midplane'); L['pl.kind.3d'] = t('pl.kind.3d');
    return L;
  };

  function report() {
    const p = part(); const s = studyOf(p);
    if (!runtime.result || !s) return null;
    return plasticsReportHtml({ name: p.name, resinId: s.resin, result: runtime.result, gates: s.gates ?? [], labels: labels(), date: new Date().toLocaleString(), lang: ctx.lang() });
  }

  async function saveReport() {
    if (!runtime.result) await run();
    const html = report();
    if (!html) return false;
    const name = `${(part()?.name ?? 'part').replace(/[\\/:*?"<>|]+/g, '_')}-flow.html`;
    if (saveHook) { await saveHook(html, name, 'html'); notify('success', t('notice.exported', { name })); return true; }
    return ctx.saveExport(name, 'html', html, 'text/html');
  }

  // ───────────────────────── PropertyManager

  function pm(e) {
    const { pmHead, pmGroup, pmNum, pmButton, pmSeg } = ctx.pm;
    const p = part(); const s = p ? studyOf(p) : null;
    if (!p || !s) return pmHead('plasticsStudy', t('cmd.plasticsStudy'), t('cam.needPart'));
    const r = RESINS[s.resin] ?? RESINS.abs;
    const resin = `${sel('plResin', RESIN_IDS.map((id) => [id, t(`pl.resin.${id}`)]), s.resin, t('pl.resin'), 'material')}<p class="pm-note">${escapeHtml(t('pl.resinData', { melt: r.melt, mould: r.mould, eject: r.eject, n: r.n, tau: fmt(r.tau / 1000, 0), shrink: r.shrink }))}</p><p class="pm-note">${escapeHtml(r.fallback ? t('pl.resinFallback') : t('pl.resinSource', { src: r.source }))}</p>`;
    const process = [
      pmNum('plMelt', s.melt || r.melt, t('pl.melt'), 'plTemperature', '°C'),
      pmNum('plMould', s.mould || r.mould, t('pl.mould'), 'plTemperature', '°C'),
      pmNum('plFillTimeIn', s.fillTime || 0, t('pl.injectionTime'), 'timer', 's'),
      pmNum('plMaxPressure', s.maxPressure || 180, t('pl.maxPressure'), 'plPressure', 'MPa'),
      pmNum('plPackPressure', s.packPressure || 0, t('pl.packPressure'), 'plClamp', 'MPa'),
      pmNum('plPackTime', s.packTime || 0, t('pl.packTime'), 'timer', 's'),
      `<p class="pm-note">${escapeHtml(t('pl.zeroAuto'))}</p>`,
    ].join('');
    const d = domain();
    const mesh = `${pmSeg('plMode', [['auto', t('pl.kind.auto'), 'plasticsStudy'], ['midplane', t('pl.kind.midplane'), 'plMidplane'], ['3d', t('pl.kind.3d'), 'plVoxel']], s.mode ?? 'auto')}${pmNum('plCells', s.cells ?? 50, t('pl.cells'), 'plVoxel', '')}<p class="pm-note">${escapeHtml(d ? t('pl.domainInfo', { kind: t(`pl.kind.${d.kind}`), nodes: d.nodes.length, volume: fmt(d.volume / 1000, 2) }) : t('notice.noBody'))}</p>`;
    const gates = (s.gates ?? []).map((g, i) => `<li>${icon('plGate', 'icon tiny')}<span class="grow">${escapeHtml(t('pl.gateN', { n: i + 1 }))} (${g.map((v) => fmt(v, 1)).join(', ')})</span><button type="button" class="icon-button" data-pm="pl.delGate:${i}" title="${escapeHtml(t('action.delete'))}">${icon('trash', 'icon tiny')}</button></li>`).join('');
    const gateBody = `<ul class="pm-pick-list">${gates || `<li class="muted">${escapeHtml(t(e.pick === 'gate' ? 'pl.pickGateNow' : 'pl.noGates'))}</li>`}</ul><div class="pm-row">${pmButton('pl.pickGate', 'plGate', t(e.pick === 'gate' ? 'pl.picking' : 'pl.pickGate'), e.pick === 'gate' ? 'active' : '')}${pmButton('pl.suggest', 'plSuggest', t('pl.suggest'))}</div>`;
    const C = s.cooling ?? {}; const Wp = s.warp ?? {};
    const check = (key, on, label, glyph) => `<label class="pm-check" title="${escapeHtml(label)}"><input type="checkbox" data-pm-toggle="${key}" ${on ? 'checked' : ''}/>${icon(glyph)}<span>${escapeHtml(label)}</span></label>`;
    const fiberBody = `${pmNum('plFiber', Math.round((s.fiber ?? 0) * 1000) / 10, t('pl.fiber'), 'plFiber', '%')}${(s.fiber ?? 0) > 0 ? pmNum('plAspect', s.aspect || 20, t('pl.aspect'), 'plFiber', '') : ''}<p class="pm-note">${escapeHtml(t('pl.fiberNote'))}</p>`;
    const coolBody = `${check('plCoolOn', C.on, t('pl.coolOn'), 'plCooling')}${C.on ? [
      pmNum('plChDiameter', C.diameter || 8, t('pl.chDiameter'), 'plCooling', 'mm'),
      pmNum('plChFlow', C.flow || 6, t('pl.chFlow'), 'plCooling', 'L/min'),
      pmNum('plChInlet', C.inlet ?? 25, t('pl.chInlet'), 'plTemperature', '°C'),
      pmNum('plChPitch', C.pitch || 0, t('pl.chPitch'), 'plCooling', 'mm'),
      pmNum('plChDepth', C.depth || 0, t('pl.chDepth'), 'plCooling', 'mm'),
      sel('plCoolant', Object.keys(COOLANTS).map((k) => [k, t(`pl.coolant.${k}`)]), C.coolant || 'water', t('pl.coolant'), 'plCooling'),
      sel('plSteel', Object.keys(MOULD_STEELS).filter((k) => k !== 'cube').map((k) => [k, t(`pl.steel.${k}`)]), C.steel || 'p20', t('pl.steel'), 'material'),
      pmNum('plCycle', C.cycle || 0, t('pl.cycle'), 'timer', 's'),
      `<p class="pm-note">${escapeHtml(t('pl.coolNote'))}</p>`,
    ].join('') : ''}`;
    const warpBody = `${check('plWarpOn', Wp.on, t('pl.warpOn'), 'plWarp')}${Wp.on ? `${pmNum('plWarpSize', Wp.size || 0, t('pl.warpSize'), 'plVoxel', 'mm')}<p class="pm-note">${escapeHtml(t('pl.warpNote'))}</p>` : ''}`;
    const res = runtime.result && runtime.resultKey === runtime.key ? runtime.result : null;
    const shown = res ? runtime.domain : d;
    let results = `<div class="pm-row">${pmButton('pl.run', 'plRun', t('cmd.plRun'))}</div>`;
    if (res) {
      const sm = res.summary;
      const lo = e.quantity === 'warp' ? warpColours(e) : resultColours({ vertices: new Float32Array(0) }, shown, res, e.quantity ?? 'fillTime');
      const unit = { fillTime: 's', pressure: 'MPa', temperature: '°C', sink: 'mm', shrinkage: '%', frozenLayer: '%', packPressure: 'MPa', mouldTemp: '°C', coolTime: 's', warp: 'mm' }[e.quantity] ?? '';
      results += `${pmSeg('plQuantity', quantitiesOf(res).map(([q, glyph]) => [q, t(`pl.q.${q}`), glyph]), e.quantity ?? 'fillTime')}`;
      if (e.quantity === 'warp') results += `${pmSeg('plWarpCause', CAUSE_IDS.map((c) => [c, t(`pl.cause.${c}`)]), e.cause ?? 'total')}${check('plDeformed', e.deformed, t('pl.deformed'), 'plWarp')}${e.deformed ? pmNum('plWarpScale', e.warpScale ?? autoScale(), t('pl.warpScale'), 'plWarp', '×') : ''}`;
      if (unit) results += `<div class="pl-legend"><span>${escapeHtml(fmt(lo.min, 2))} ${unit}</span><i class="pl-ramp"></i><span>${escapeHtml(fmt(lo.max, 2))} ${unit}</span></div>`;
      const li = (glyph, text, cls = '') => `<li class="${cls}">${icon(glyph, 'icon tiny')}<span>${escapeHtml(text)}</span></li>`;
      results += `<ul class="mfg-results">${[
        li(sm.shortShot ? 'error' : 'check', sm.shortShot ? t('pl.shortShotNotice', { pct: fmt(sm.filledFraction * 100, 1) }) : t('pl.r.filled'), sm.shortShot ? 'error' : ''),
        li('plFillTime', `${t('pl.r.fillTime')}: ${fmt(sm.fillTime, 3)} s`),
        li('plPressure', `${t('pl.r.gatePressure')}: ${fmt(sm.gatePressure, 1)} MPa${sm.pressureLimited ? ` (${t('pl.limited')})` : ''}`, sm.pressureLimited ? 'error' : ''),
        li('plTemperature', `${t('pl.r.frontTemp')}: ${fmt(sm.frontTempMin, 0)} – ${fmt(sm.frontTempMax, 0)} °C`),
        li('plWeld', `${t('pl.r.weld')}: ${sm.weldNodes}`),
        li('plAirTraps', `${t('pl.r.traps')}: ${sm.airTraps}`, sm.airTraps ? 'warn' : ''),
        li('plCooling', `${t('pl.r.coolingTime')}: ${fmt(sm.coolingTime, 1)} s · ${t('pl.r.cycleTime')}: ${fmt(sm.cycleTime, 1)} s`),
        sm.packPressure != null ? li('plClamp', t('pl.packLine', { p: fmt(sm.packPressure, 1), t: fmt(sm.gateFreezeTime ?? sm.packTime, 1) })) : '',
        sm.shrinkageAvg != null ? li('plShrink', t('pl.shrinkLine', { avg: fmt(sm.shrinkageAvg, 2), max: fmt(sm.shrinkageMax, 2) })) : '',
        li('plSink', `${t('pl.r.sink')}: ${fmt(sm.sinkMax, 3)} mm`),
        li('plClamp', `${t('pl.r.clamp')}: ${fmt(sm.clampForce, 1)} kN (${fmt(sm.clampTonnes, 1)} t)`),
        li('material', `${t('pl.r.mass')}: ${fmt(sm.mass, 1)} g · ${t('pl.r.wall')}: ${fmt(sm.nominalWall, 2)} / ${fmt(sm.maxWall, 2)} mm`),
        ...extraLines(res, li),
      ].join('')}</ul><div class="pm-row">${pmButton('pl.report', 'plReport', t('cmd.plReport'))}</div>`;
    }
    return [
      pmHead('plasticsStudy', t('cmd.plasticsStudy'), t('pm.help.plastics')),
      pmGroup('material', t('pl.resinGroup'), resin),
      pmGroup('plTemperature', t('pl.processGroup'), process),
      pmGroup('plGate', t('pl.gatesGroup'), gateBody),
      pmGroup('plVoxel', t('pl.meshGroup'), mesh),
      pmGroup('plFiber', t('pl.fiberGroup'), fiberBody),
      pmGroup('plCooling', t('pl.coolGroup'), coolBody),
      pmGroup('plWarp', t('pl.warpGroup'), warpBody),
      pmGroup('plRun', t('pl.resultsGroup'), results),
      pmGroup('plRunner', t('pl.runnerGroup'), runnerGroup(s)),
      pmGroup('plGas', t('pl.gasGroup'), gasGroup(s, e)),
    ].join('');
  }

  function field(key, raw) {
    const v = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(v)) { notify('error', t('notice.invalidValue', { text: raw })); return ctx.renderLeft(); }
    const extra = {
      plFiber: [(st) => { st.fiber = Math.max(0, Math.min(60, v)) / 100; }, v >= 0],
      plAspect: [(st) => { st.aspect = v; }, v >= 1],
      plChDiameter: [(st) => { st.cooling.diameter = v; }, v > 0], plChFlow: [(st) => { st.cooling.flow = v; }, v > 0],
      plChInlet: [(st) => { st.cooling.inlet = v; }, v > -40 && v < 200], plChPitch: [(st) => { st.cooling.pitch = v; }, v >= 0],
      plChDepth: [(st) => { st.cooling.depth = v; }, v >= 0], plCycle: [(st) => { st.cooling.cycle = v; }, v >= 0],
      plWarpSize: [(st) => { st.warp.size = v; }, v >= 0],
      plInsertT: [(st) => { st.insertTemp = v; }, v > -50 && v < 500],
      plGasShot: [(st) => { st.gas = { ...gasOf(st), shot: v }; }, v >= 30 && v <= 99],
      plGasThick: [(st) => { st.gas = { ...gasOf(st), minThick: v }; }, v >= 1 && v <= 5],
      plGasSkin: [(st) => { st.gas = { ...gasOf(st), skin: v / 100 }; }, v > 0 && v < 50],
      plCavities: [(st) => { st.runner = { ...runnerOf(st), cavities: Math.round(v), branches: null }; }, v >= 1 && v <= 8],
      plRunnerD: [(st) => { st.runner = { ...runnerOf(st), diameter: v, branches: null }; }, v > 0],
      plGateD: [(st) => { st.runner = { ...runnerOf(st), gateDiameter: v }; }, v >= 0],
      plRunnerGap: [(st) => { st.runner = { ...runnerOf(st), gap: v }; }, v >= 0],
    }[key];
    if (extra) {
      if (!extra[1]) { notify('error', t('notice.invalidValue', { text: raw })); return ctx.renderLeft(); }
      edit((st) => { st.cooling ??= {}; st.warp ??= {}; extra[0](st); });
      runtime.result = null; runtime.runner = null;
      return undefined;
    }
    if (key === 'plWarpScale') { if (v > 0) { editing().warpScale = v; runtime.colourKey = null; ctx.syncView(); } return ctx.renderLeft(); }
    const map = { plMelt: 'melt', plMould: 'mould', plFillTimeIn: 'fillTime', plMaxPressure: 'maxPressure', plCells: 'cells', plPackPressure: 'packPressure', plPackTime: 'packTime' };
    const k = map[key];
    if (!k) return undefined;
    if (!['fillTime', 'packPressure', 'packTime'].includes(k) && !(v > 0)) { notify('error', t('notice.invalidValue', { text: raw })); return ctx.renderLeft(); }
    edit((s) => { s[k] = k === 'cells' ? Math.round(v) : v; });
    runtime.result = null;
    return undefined;
  }

  function set(key, value) {
    const e = editing();
    if (key === 'plQuantity') { e.quantity = value; ctx.syncView(); return ctx.renderLeft(); }
    if (key === 'plWarpCause') { e.cause = value; runtime.colourKey = null; ctx.syncView(); return ctx.renderLeft(); }
    if (key === 'plMode') { edit((s) => { s.mode = value; }); runtime.result = null; return undefined; }
    return undefined;
  }

  function select(key, value) {
    if (key === 'plResin') { edit((s) => { s.resin = value; s.melt = null; s.mould = null; }); runtime.result = null; return true; }
    if (key === 'plCoolant' || key === 'plSteel') { edit((s) => { s.cooling ??= {}; s.cooling[key === 'plCoolant' ? 'coolant' : 'steel'] = value; }); runtime.result = null; return true; }
    return false;
  }

  function pick(hit) {
    const e = editing();
    if (e?.pick === 'insert') {
      if (hit?.kind !== 'face') return undefined;
      const pts = facePoints(hit.index);
      if (!pts) return undefined;
      edit((s) => { s.inserts = [...(s.inserts ?? []), { points: pts, temperature: s.insertTemp ?? 25 }]; });
      runtime.result = null; notify('success', t('pl.insertAdded'));
      return undefined;
    }
    if (e?.pick === 'gasPin') { if (!hit?.point) return undefined; edit((s) => { s.gas = { ...gasOf(s), pin: hit.point.map((v) => Math.round(v * 1000) / 1000) }; }); e.pick = null; runtime.gas = null; return ctx.renderLeft(); }
    if (e?.pick !== 'gate' || !hit?.point) return undefined;
    edit((s) => { s.gates = [...(s.gates ?? []), hit.point.map((v) => Math.round(v * 1000) / 1000)]; });
    runtime.result = null;
    notify('success', t('pl.gateAdded'));
    return undefined;
  }

  const NAMES = new Set(['pl.pickGate', 'pl.suggest', 'pl.delGate', 'pl.run', 'pl.report', 'pl.runRunner', 'pl.balance', 'pl.pickInsert', 'pl.delInsert', 'pl.pickGasPin', 'pl.runGas']);
  const handles = (name) => NAMES.has(name);
  async function command(name, arg) {
    const e = editing();
    if (name === 'clear') return undefined;
    if (name === 'pl.pickGate') { e.pick = e.pick === 'gate' ? null : 'gate'; if (e.pick) notify('info', t('pl.pickGateNow')); return ctx.renderLeft(); }
    if (name === 'pl.suggest') return suggest();
    if (name === 'pl.delGate') { edit((s) => { s.gates = (s.gates ?? []).filter((_, i) => i !== Number(arg)); }); runtime.result = null; return undefined; }
    if (name === 'pl.run') return run();
    if (name === 'pl.runRunner') return runRunner();
    if (name === 'pl.pickInsert') { e.pick = e.pick === 'insert' ? null : 'insert'; return ctx.renderLeft(); }
    if (name === 'pl.delInsert') { edit((s) => { s.inserts = (s.inserts ?? []).filter((_, i) => i !== Number(arg)); }); runtime.result = null; return undefined; }
    if (name === 'pl.pickGasPin') { e.pick = e.pick === 'gasPin' ? null : 'gasPin'; return ctx.renderLeft(); }
    if (name === 'pl.runGas') return runGas();
    if (name === 'pl.balance') return runRunner({ balance: true });
    if (name === 'pl.report') return saveReport();
    return undefined;
  }

  function toggle(key, checked) {
    const e = editing();
    if (key === 'plCoolOn') { edit((s) => { s.cooling = { ...(s.cooling ?? {}), on: checked }; }); runtime.result = null; return ctx.renderLeft(); }
    if (key === 'plWarpOn') { edit((s) => { s.warp = { ...(s.warp ?? {}), on: checked }; }); runtime.result = null; return ctx.renderLeft(); }
    const fm = /^plFamily\.(.+)$/.exec(key);
    if (fm) { edit((s) => { const R = runnerOf(s); R.family = checked ? [...new Set([...R.family, fm[1]])] : R.family.filter((x) => x !== fm[1]); s.runner = { ...R, branches: null }; }); runtime.runner = null; return ctx.renderLeft(); }
    if (key === 'plDeformed') { e.deformed = checked; runtime.colourKey = null; ctx.syncView(); return ctx.renderLeft(); }
    return undefined;
  }

  /** The result lines of the fiber, cooling and warpage steps. */
  function extraLines(res, li) {
    const out = [];
    if (res.fibers) out.push(li('plFiber', t('pl.fiberLine', { mean: fmt(res.fibers.mean, 2), skin: fmt(res.fibers.skinMean, 2), core: fmt(res.fibers.coreMean, 2), ci: fmt(res.fibers.CI, 4) })));
    const c = res.cooling;
    if (c?.summary) {
      out.push(li('plCooling', t('pl.coolLine', { min: fmt(c.summary.wallMin, 1), max: fmt(c.summary.wallMax, 1), mean: fmt(c.summary.wallMean, 1), time: Number.isFinite(c.summary.coolTimeMax) ? fmt(c.summary.coolTimeMax, 1) : '∞', cycle: c.summary.cycleWithCooling != null ? fmt(c.summary.cycleWithCooling, 1) : '—' }), c.summary.hotSpots ? 'error' : ''));
      for (const k of c.circuits) out.push(li('plCooling', t('pl.circuitLine', { name: k.name, re: fmt(k.Re, 0), regime: t(`pl.regime.${k.regime}`), heat: fmt(k.heat, 1), tin: fmt(k.inlet, 1), tout: fmt(k.outlet, 2), dp: fmt(k.pressureDrop, 2) }), 'pl-circuit'));
      for (const w of c.warnings) out.push(li('warning', t(`pl.cw.${w.kind}`, { ...w, re: fmt(w.Re ?? 0, 0), rise: fmt(w.rise ?? 0, 1), gap: fmt(w.gap ?? 0, 1) }), 'warn'));
    }
    const w = res.warp;
    if (w?.cases) {
      out.push(li('plWarp', t('pl.warpLine', { warp: fmt(w.cases.total.warpMax, 3), max: fmt(w.cases.total.max, 3), cause: t(`pl.cause.${w.dominant}`) })));
      out.push(li('plWarp', t('pl.warpCauses', { s: fmt(w.cases.shrinkage.warpMax, 3), c: fmt(w.cases.cooling.warpMax, 3), o: fmt(w.cases.orientation.warpMax, 3) })));
    }
    return out;
  }
  /** The warpage of the chosen cause: colours by its size (min / max for the legend). */
  function warpColours(e) {
    const w = runtime.result?.warp?.cases?.[e.cause ?? 'total'];
    return w ? vertexColours(w.vertexWarp, 3, rampColour) : { colors: new Float32Array(0), min: 0, max: 0 };
  }
  /** A deformation scale that makes the largest warpage about 8 % of the part. */
  function autoScale() {
    const w = runtime.result?.warp?.cases?.[editing()?.cause ?? 'total'];
    const size = ctx.buildPart(part())?.size ?? 100;
    return w?.warpMax > 0 ? Math.round(((size * 0.08) / w.warpMax) * 10) / 10 : 1;
  }

  /** The part coloured by the shown result while the study is open. */
  function colours(p, entry) {
    const e = editing();
    if (!owns(e) || !runtime.result || runtime.resultKey !== runtime.key || !entry?.mesh || part()?.id !== p.id) return undefined;
    const d = runtime.domain;
    const q = e.quantity ?? 'fillTime';
    const ck = `${runtime.key}|${q}|${entry.key}`;
    if (q === 'warp') {
      const ck2 = `${ck}|${e.cause ?? 'total'}|${e.deformed ? e.warpScale ?? 'auto' : 0}`;
      if (runtime.colourKey !== ck2) {
        runtime.colourKey = ck2;
        const w = runtime.result.warp?.cases?.[e.cause ?? 'total'];
        runtime.colours = warpColours(e).colors;
        runtime.deformedMesh = null;
        if (w && e.deformed && w.vertexWarp.length === entry.mesh.vertices.length) {
          const k = e.warpScale ?? autoScale(); const v = entry.mesh.vertices;
          runtime.deformedMesh = { ...entry.mesh, vertices: Float32Array.from(v, (x, i) => x + w.vertexWarp[i] * k) };
        }
      }
      return runtime.colours.length === entry.mesh.vertices.length ? { colors: runtime.colours, ...(runtime.deformedMesh ? { mesh: runtime.deformedMesh } : {}) } : undefined;
    }
    if (runtime.colourKey !== ck) { runtime.colourKey = ck; runtime.colours = resultColours(entry.mesh, d, runtime.result, q).colors; }
    return { colors: runtime.colours };
  }

  function decorate(kind) {
    const vp = ctx.viewport();
    if (!vp) return;
    if (!vp.groups.mfgPl) { vp.groups.mfgPl = new THREE.Group(); vp.groups.mfgPl.name = 'mfgPl'; vp.scene.add(vp.groups.mfgPl); }
    const e = editing();
    if (kind !== 'part' || !owns(e)) { vp.setLines('mfgPl', []); return; }
    const s = studyOf(part());
    const list = [];
    const gates = (s?.gates ?? []).flat();
    if (gates.length) list.push({ points: gates, color: '#ff6d00', size: 12 });
    const res = runtime.result && runtime.resultKey === runtime.key ? runtime.result : null;
    if (res && runtime.domain) {
      const pts = (flags) => { const out = []; runtime.domain.nodes.forEach((n, i) => { if (flags[i]) out.push(...n.c); }); return out; };
      if (e.quantity === 'weld') list.push({ points: pts(res.weld), color: '#d500f9', size: 6 });
      if (e.quantity === 'trap') list.push({ points: pts(res.trap), color: '#ff3d00', size: 10 });
      // The cooling channels (each polyline as segments), drawn while a cooling quantity is shown.
      if (res.cooling?.channels && ['mouldTemp', 'coolTime'].includes(e.quantity)) for (const ch of res.cooling.channels) { const seg = []; for (let i = 1; i < ch.points.length; i++) seg.push(...ch.points[i - 1], ...ch.points[i]); list.push({ segments: seg, color: ch.side === 'core' ? '#1e88e5' : '#00acc1', width: 3 }); }
    }
    // Gas-assisted filling: the cored nodes and the gas pin.
    const gs = runtime.gas && runtime.gas.key === runtime.key ? runtime.gas : null;
    if (gs) { list.push({ points: gs.points, color: '#7c4dff', size: 7 }); list.push({ points: gs.pin, color: '#00b8d4', size: 12 }); }
    // The mould layout of the last runner run: cavity boxes, the runner's centre line, the gates.
    const rr = runtime.runner && runtime.runner.key === runtime.key ? runtime.runner : null;
    if (rr) {
      for (const [lo, hi] of rr.boxes) {
        const c = (i) => [(i & 1) ? hi[0] : lo[0], (i & 2) ? hi[1] : lo[1], (i & 4) ? hi[2] : lo[2]];
        const seg = [];
        for (const [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) seg.push(...c(a), ...c(b));
        list.push({ segments: seg, color: '#78909c', width: 1.5, dashed: true });
      }
      list.push({ points: rr.runnerPoints, color: '#ff9100', size: Math.max(4, Math.min(12, rr.diameter * 1.5)) });
      list.push({ points: rr.gates.flat(), color: '#ff3d00', size: 10 });
    }
    vp.setLines('mfgPl', list);
  }

  const docPart = () => Boolean(part()) && editing()?.mode !== 'sketch';
  const showQ = (q) => () => { if (!owns(editing())) begin({ quantity: q }); else { editing().quantity = q; ctx.syncView(); ctx.renderLeft(); } if (!runtime.result) return run(); return undefined; };
  const commands = {
    plasticsStudy: { icon: 'plasticsStudy', label: 'cmd.plasticsStudy', enabled: docPart, checked: () => owns(editing()), run: () => (owns(editing()) ? finish() : begin()) },
    plGate: { icon: 'plGate', label: 'cmd.plGate', enabled: docPart, run: () => { if (!owns(editing())) begin({ pick: 'gate' }); else { editing().pick = 'gate'; ctx.renderLeft(); } notify('info', t('pl.pickGateNow')); } },
    plSuggest: { icon: 'plSuggest', label: 'cmd.plSuggest', enabled: docPart, run: () => { if (!owns(editing())) begin(); suggest(); } },
    plRun: { icon: 'plRun', label: 'cmd.plRun', enabled: docPart, run: () => { if (!owns(editing())) begin(); return run(); } },
    plFillTime: { icon: 'plFillTime', label: 'cmd.plFillTime', enabled: docPart, checked: () => owns(editing()) && editing().quantity === 'fillTime' && Boolean(runtime.result), run: showQ('fillTime') },
    plPressure: { icon: 'plPressure', label: 'cmd.plPressure', enabled: docPart, checked: () => owns(editing()) && editing().quantity === 'pressure' && Boolean(runtime.result), run: showQ('pressure') },
    plTemperature: { icon: 'plTemperature', label: 'cmd.plTemperature', enabled: docPart, checked: () => owns(editing()) && editing().quantity === 'temperature' && Boolean(runtime.result), run: showQ('temperature') },
    plWeld: { icon: 'plWeld', label: 'cmd.plWeld', enabled: docPart, checked: () => owns(editing()) && editing().quantity === 'weld' && Boolean(runtime.result), run: showQ('weld') },
    plAirTraps: { icon: 'plAirTraps', label: 'cmd.plAirTraps', enabled: docPart, checked: () => owns(editing()) && editing().quantity === 'trap' && Boolean(runtime.result), run: showQ('trap') },
    plSink: { icon: 'plSink', label: 'cmd.plSink', enabled: docPart, checked: () => owns(editing()) && editing().quantity === 'sink' && Boolean(runtime.result), run: showQ('sink') },
    plReport: { icon: 'plReport', label: 'cmd.plReport', enabled: docPart, run: () => saveReport() },
    plFiber: { icon: 'plFiber', label: 'cmd.plFiber', enabled: docPart, checked: () => owns(editing()) && editing().quantity === 'fiberAlign' && Boolean(runtime.result?.fiberAlign), run: () => enableAndShow('fiber', 'fiberAlign') },
    plCooling: { icon: 'plCooling', label: 'cmd.plCooling', enabled: docPart, checked: () => owns(editing()) && editing().quantity === 'mouldTemp' && Boolean(runtime.result?.mouldTemp), run: () => enableAndShow('cooling', 'mouldTemp') },
    plWarp: { icon: 'plWarp', label: 'cmd.plWarp', enabled: docPart, checked: () => owns(editing()) && editing().quantity === 'warp' && Boolean(runtime.result?.warp?.cases), run: () => enableAndShow('warp', 'warp') },
  };
  /** Turns a step on in the study (fibers: 30 % glass when there were none) and shows its result, running when needed. */
  function enableAndShow(step, q) {
    if (!owns(editing())) begin({ quantity: q });
    const s = studyOf(part(), { create: true });
    const on = step === 'fiber' ? s.fiber > 0 : Boolean(s[step]?.on);
    if (!on) { edit((st) => { if (step === 'fiber') st.fiber = 0.3; else st[step] = { ...(st[step] ?? {}), on: true }; }); runtime.result = null; }
    editing().quantity = q;
    if (!runtime.result) return run();
    ctx.syncView(); return ctx.renderLeft();
  }
  const TAB = ['plasticsStudy', 'plGate', 'plSuggest', '|', 'plRun', '|', 'plFillTime', 'plPressure', 'plTemperature', 'plWeld', 'plAirTraps', 'plSink', '|', 'plFiber', 'plCooling', 'plWarp', '|', 'plReport'];
  const api = { begin, run, runRunner, runner: () => runtime.runner, runGas, gas: () => runtime.gas, suggest, report, saveReport, domain: () => runtime.domain ?? domain(), result: () => runtime.result, study: () => studyOf(part()), setSaveHook(fn) { saveHook = fn; }, setInline(on) { inline = Boolean(on); } };
  return { commands, TAB, owns, pm, pick, field, set, select, toggle, accept: () => finish(), handles, command, subject: () => t('cmd.plasticsStudy'), colours, decorate, api };
}
