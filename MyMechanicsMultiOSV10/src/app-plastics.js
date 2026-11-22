// The main window's side of the injection moulding flow study (app-mfg.js chains it onto app-more.js's hooks):
// the PropertyManager (resin, process, gates picked on the part or suggested, mesh), running the fill, the part
// coloured by fill time / pressure / flow-front temperature / weld lines / air traps / sink, the summary and
// the report (saved through the app's export path). The flow model is cad/plastics.js (no DOM).
import * as THREE from 'three';
import { RESINS, RESIN_IDS, resinOf, partDomain, suggestGate, resultColours, plasticsReportHtml, runStudy } from './cad/plastics.js';
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';

const QUANTITIES = [['fillTime', 'plFillTime'], ['pressure', 'plPressure'], ['temperature', 'plTemperature'], ['frozenLayer', 'plCooling'], ['packPressure', 'plClamp'], ['shrinkage', 'plShrink'], ['sink', 'plSink'], ['weld', 'plWeld'], ['trap', 'plAirTraps']];

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
  const runtime = { key: null, domain: null, result: null, resultKey: null };

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
      process: { resin: s.resin, melt: s.melt || null, mould: s.mould || null, fillTime: s.fillTime || 0, maxPressure: s.maxPressure || 180, packPressure: s.packPressure || null, packTime: s.packTime || null },
    };
    const out = await ctx.withProgress('progress.plastics', p.name, (op, report, signal) => new Promise((resolve) => {
      const onMessage = (m) => {
        if (m.type === 'progress') report({ fraction: m.fraction, text: t(`pl.phase.${m.phase}`, null, m.phase) });
        else if (m.type === 'error') { notify('error', t('pl.failed', { reason: m.message })); resolve(null); }
      };
      if (typeof Worker === 'undefined' || inline) { setTimeout(() => resolve(runStudy(input, onMessage, signal)), 20); return; }
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
    if (!(s.gates ?? []).length && out.gates?.length) edit((st) => { st.gates = out.gates.map((g) => out.domain.nodes[g].c.map((v) => Math.round(v * 1000) / 1000)); });
    const sm = result.summary;
    notify(sm.shortShot ? 'warning' : 'success', sm.shortShot ? t('pl.shortShotNotice', { pct: fmt(sm.filledFraction * 100, 1) }) : t('pl.filledNotice', { time: fmt(sm.fillTime, 2), p: fmt(sm.gatePressure, 1) }));
    if (owns(editing())) editing().quantity ??= 'fillTime';
    ctx.syncView(); ctx.renderLeft();
    return result;
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
    const res = runtime.result && runtime.resultKey === runtime.key ? runtime.result : null;
    const shown = res ? runtime.domain : d;
    let results = `<div class="pm-row">${pmButton('pl.run', 'plRun', t('cmd.plRun'))}</div>`;
    if (res) {
      const sm = res.summary;
      const lo = resultColours({ vertices: new Float32Array(0) }, shown, res, e.quantity ?? 'fillTime');
      const unit = { fillTime: 's', pressure: 'MPa', temperature: '°C', sink: 'mm', shrinkage: '%', frozenLayer: '%', packPressure: 'MPa' }[e.quantity] ?? '';
      results += `${pmSeg('plQuantity', QUANTITIES.map(([q, glyph]) => [q, t(`pl.q.${q}`), glyph]), e.quantity ?? 'fillTime')}`;
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
      ].join('')}</ul><div class="pm-row">${pmButton('pl.report', 'plReport', t('cmd.plReport'))}</div>`;
    }
    return [
      pmHead('plasticsStudy', t('cmd.plasticsStudy'), t('pm.help.plastics')),
      pmGroup('material', t('pl.resinGroup'), resin),
      pmGroup('plTemperature', t('pl.processGroup'), process),
      pmGroup('plGate', t('pl.gatesGroup'), gateBody),
      pmGroup('plVoxel', t('pl.meshGroup'), mesh),
      pmGroup('plRun', t('pl.resultsGroup'), results),
    ].join('');
  }

  function field(key, raw) {
    const v = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(v)) { notify('error', t('notice.invalidValue', { text: raw })); return ctx.renderLeft(); }
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
    if (key === 'plMode') { edit((s) => { s.mode = value; }); runtime.result = null; return undefined; }
    return undefined;
  }

  function select(key, value) {
    if (key === 'plResin') { edit((s) => { s.resin = value; s.melt = null; s.mould = null; }); runtime.result = null; return true; }
    return false;
  }

  function pick(hit) {
    const e = editing();
    if (e?.pick !== 'gate' || !hit?.point) return undefined;
    edit((s) => { s.gates = [...(s.gates ?? []), hit.point.map((v) => Math.round(v * 1000) / 1000)]; });
    runtime.result = null;
    notify('success', t('pl.gateAdded'));
    return undefined;
  }

  const NAMES = new Set(['pl.pickGate', 'pl.suggest', 'pl.delGate', 'pl.run', 'pl.report']);
  const handles = (name) => NAMES.has(name);
  async function command(name, arg) {
    const e = editing();
    if (name === 'clear') return undefined;
    if (name === 'pl.pickGate') { e.pick = e.pick === 'gate' ? null : 'gate'; if (e.pick) notify('info', t('pl.pickGateNow')); return ctx.renderLeft(); }
    if (name === 'pl.suggest') return suggest();
    if (name === 'pl.delGate') { edit((s) => { s.gates = (s.gates ?? []).filter((_, i) => i !== Number(arg)); }); runtime.result = null; return undefined; }
    if (name === 'pl.run') return run();
    if (name === 'pl.report') return saveReport();
    return undefined;
  }

  /** The part coloured by the shown result while the study is open. */
  function colours(p, entry) {
    const e = editing();
    if (!owns(e) || !runtime.result || runtime.resultKey !== runtime.key || !entry?.mesh || part()?.id !== p.id) return undefined;
    const d = runtime.domain;
    const q = e.quantity ?? 'fillTime';
    const ck = `${runtime.key}|${q}|${entry.key}`;
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
  };
  const TAB = ['plasticsStudy', 'plGate', 'plSuggest', '|', 'plRun', '|', 'plFillTime', 'plPressure', 'plTemperature', 'plWeld', 'plAirTraps', 'plSink', '|', 'plReport'];
  const api = { begin, run, suggest, report, saveReport, domain: () => runtime.domain ?? domain(), result: () => runtime.result, study: () => studyOf(part()), setSaveHook(fn) { saveHook = fn; }, setInline(on) { inline = Boolean(on); } };
  return { commands, TAB, owns, pm, pick, field, set, select, toggle: () => undefined, accept: () => finish(), handles, command, subject: () => t('cmd.plasticsStudy'), colours, decorate, api };
}
