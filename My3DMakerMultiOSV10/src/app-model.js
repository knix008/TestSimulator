// The Model tab's 3D view: the meshed geometry for setting up (faces picked for boundary
// conditions, coloured by what is on them) and the results of a solved system (contours, deformed
// shape, animation, slices, streamlines, the optimised shape).
import { SimView } from './view/simview.js';
import { BCS, RESULTS, SYSTEMS } from './sim/catalog.js';
import { buildJob, UNIT } from './sim/project.js';
import { displayOf, rangeOf, argExtremes } from './sim/results.js';
import { materialById } from './sim/materials.js';
import { fmt, toDisplay, unitLabel } from './sim/units.js';
import { runJob } from './sim/engine.js';

export function createModel(ctx) {
  const { state, t } = ctx;
  let view = null;
  let shown = null; // { kind: 'setup' | 'result', meshInfo, sysId, item }
  let meshJob = null;

  function ensureView(host) {
    if (view && view.host === host) return view;
    view?.dispose();
    view = new SimView(host, { onPick, onHover });
    applyTheme();
    view.setStyle(state.settings.displayStyle === 'shadedEdges' ? 'shadedEdges' : state.settings.displayStyle);
    view.setPerspective(Boolean(state.settings.perspectiveView));
    return view;
  }

  function applyTheme() {
    if (!view) return;
    const css = getComputedStyle(document.documentElement);
    const bg = css.getPropertyValue('--surface').trim() || '#eef1f5';
    const dark = document.documentElement.classList.contains('dark');
    view.setTheme({ bg: dark ? '#1b1f26' : '#e9edf2', bg2: dark ? '#2b313b' : '#fdfdfe', text: css.getPropertyValue('--text').trim() || '#222' });
    void bg;
  }

  const bodiesForView = () => (state.project?.bodies ?? []).map((b) => ({ id: b.id, color: materialById(b.material, state.project.materials).color ?? '#9aa4b1' }));

  /** Key of what the setup mesh depends on (geometry and the active system's mesh controls). */
  function setupKey() {
    const p = state.project;
    if (!p) return '';
    return JSON.stringify(p.bodies.map((b) => [b.template, b.params, b.position, b.rotation, b.suppressed, b.stl?.length ?? 0]));
  }

  /** Meshes the geometry (coarse, for display and picking) if it changed. */
  async function refreshSetupMesh({ force = false } = {}) {
    const p = state.project;
    if (!p || !p.bodies.some((b) => !b.suppressed)) { state.setupMesh = null; if (view && !shownResult()) view.setMesh(null); return; }
    const key = setupKey();
    if (!force && state.setupMesh?.key === key) return;
    const sys = ctx.activeSystem() ?? { type: 'static', settings: {}, bcs: [], mesh: { size: 0, order: 1 }, enclosure: {} };
    const job = buildJob(p, sys, { analysis: 'mesh', preview: true });
    const mine = (meshJob = Symbol('mesh'));
    try {
      const r = await runJob(job);
      if (mine !== meshJob) return;
      state.setupMesh = { key, info: r.mesh };
      if (!shownResult()) showSetup();
      ctx.renderSome(['outline', 'status', 'bottom']);
    } catch (error) {
      if (mine === meshJob) ctx.showError('error.mesh', error);
    }
  }

  function shownResult() { return shown?.kind === 'result'; }

  function showSetup() {
    if (!view) return;
    view.stopAnimation();
    const info = state.setupMesh?.info ?? null;
    if (shown?.meshInfo !== info) { view.setMesh(info, bodiesForView()); if (!shown) view.setView('iso', false); }
    shown = { kind: 'setup', meshInfo: info };
    view.setContour(null);
    view.setDeformation(null);
    view.showUndeformed(false);
    view.setSlices(null);
    view.setStreamlines(null);
    view.setSurface(null);
    view.setLabels([]);
    paintSetup();
  }

  /** Mesh face of a picked-face signature (the same scoring as the solver's find_face). */
  function faceOf(sig, info) {
    if (!info || !sig) return -1;
    let best = [Infinity, -1];
    const size = info.positions ? meshSize(info) : 1;
    const n = norm(sig.n);
    const outside = (o) => o === null || o === undefined || o === 'air';
    info.faces.forEach((f, i) => {
      if (f.body !== sig.body) return;
      if (!(f.other === sig.other || (outside(f.other) && outside(sig.other)))) return;
      const dc = Math.hypot(f.c[0] - sig.c[0], f.c[1] - sig.c[1], f.c[2] - sig.c[2]) / size;
      const dn = 1 - (f.n[0] * n[0] + f.n[1] * n[1] + f.n[2] * n[2]);
      const da = Math.abs(f.a - sig.a) / Math.max(f.a, sig.a, 1e-300);
      const score = dc + 0.5 * dn + 0.3 * da;
      if (score < best[0]) best = [score, i];
    });
    return best[1];
  }

  function meshSize(info) {
    if (info._size) return info._size;
    const p = info.positions;
    const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[i + k]); hi[k] = Math.max(hi[k], p[i + k]); }
    info._size = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
    return info._size;
  }

  const norm = (v) => { const l = Math.hypot(...(v ?? [0, 0, 0])); return l > 0 ? v.map((x) => x / l) : [0, 0, 0]; };

  function sigOf(faceId, info) {
    const f = info?.faces?.[faceId];
    if (!f) return null;
    return { body: f.body, other: f.other === 'air' ? null : f.other, c: f.c.map((v) => Number(v.toFixed(4))), n: f.n.map((v) => Number(v.toFixed(5))), a: Number(f.a.toPrecision(6)) };
  }

  /** Face colours: each condition of the active system on its faces; the selected one stronger. */
  function paintSetup() {
    if (!view || shownResult()) return;
    const info = shown?.meshInfo;
    const sys = ctx.activeSystem();
    const colors = new Map();
    if (info && sys) {
      const sel = ctx.selected();
      for (const bc of sys.bcs) {
        if (bc.suppressed) continue;
        const cat = BCS[bc.type]?.cat ?? 'load';
        const isSel = sel?.kind === 'bc' && sel.id === bc.id;
        if (!isSel && state.settings.showAllBcs === false) continue;
        for (const sig of bc.faces ?? []) { const f = faceOf(sig, info); if (f >= 0) colors.set(f, isSel ? 'pick' : cat); }
        if (bc.bodies?.length) {
          info.faces.forEach((f, i) => { if (bc.bodies.includes(f.body) && (f.other === null || f.other === 'air')) colors.set(i, isSel ? 'pick' : cat); });
        }
      }
      const c = sel?.kind === 'contact' ? sys.contacts.find((x) => x.id === sel.id) : null;
      if (c) info.faces.forEach((f, i) => { if ((f.body === c.a && f.other === c.b) || (f.body === c.b && f.other === c.a)) colors.set(i, 'pick'); });
    }
    view.setFaceColors(colors);
    const hidden = (state.project?.bodies ?? []).filter((b) => b.hidden).map((b) => b.id);
    view.setHiddenBodies(hidden);
  }

  function onPick(hit, event) {
    if (shownResult()) {
      if (hit?.value !== null && hit?.value !== undefined) {
        const r = shown.display;
        const kind = r?.kind ?? 'ratio';
        state.probe = { point: hit.point, value: hit.value, kind };
        view.setLabels([...extremeLabels(), { p: hit.point, text: `${fmt(toDisplay(kind, hit.value, unitSystem()))} ${unitLabel(kind, unitSystem())}`, cls: 'probe' }]);
        ctx.renderSome(['status']);
      }
      return;
    }
    ctx.facePicked(hit ? { face: hit.face, body: hit.body, sig: sigOf(hit.face, shown?.meshInfo), point: hit.point } : null, event);
  }

  function onHover(hit) {
    state.hoverPoint = hit?.point ?? null;
    ctx.hovered?.(hit);
  }

  const unitSystem = () => state.settings.unitSystem ?? 'mm';

  // ───────────────────────── results

  function extremeLabels() {
    const d = shown?.display;
    if (!d?.values || !state.settings.showMaxMin || !shown.meshInfo) return [];
    const { imin, imax } = argExtremes(d.values);
    const p = shown.meshInfo.positions;
    const at = (i) => { const base = [p[3 * i], p[3 * i + 1], p[3 * i + 2]]; const v = d.vector && shown.scale ? [d.vector[3 * i], d.vector[3 * i + 1], d.vector[3 * i + 2]] : [0, 0, 0]; return base.map((b, k) => b + v[k] * (shown.scale ?? 0)); };
    const lab = (i, tag) => ({ p: at(i), text: `${tag} ${fmt(toDisplay(d.kind, d.values[i], unitSystem()))}`, cls: tag === 'Max' ? 'max' : 'min' });
    return [imax >= 0 ? lab(imax, 'Max') : null, imin >= 0 && imin !== imax ? lab(imin, 'Min') : null].filter(Boolean);
  }

  function deformScale(d) {
    const s = state.settings.deformScale ?? 'auto';
    if (!d.vector) return 0;
    if (s === 'undeformed') return 0;
    if (s === 'true') return 1;
    if (s === 'auto') return d.autoScale ?? 1;
    const n = Number(s);
    return Number.isFinite(n) ? n : d.autoScale ?? 1;
  }

  function showResult(sys, item) {
    if (!view || !sys?.result) return;
    const r = sys.result;
    view.stopAnimation();
    const info = r.mesh;
    if (shown?.meshInfo !== info) view.setMesh(info, bodiesForView());
    const d = displayOf(item, r, meshSize(info));
    shown = { kind: 'result', meshInfo: info, sysId: sys.id, item, display: d, scale: 0 };
    view.setFaceColors(new Map());
    view.setHiddenBodies((state.project?.bodies ?? []).filter((b) => b.hidden).map((b) => b.id));
    const us = unitSystem();
    const spec = RESULTS[item.quantity];
    const title = ctx.resultTitle(sys, item);
    const unit = unitLabel(d.kind, us);
    const format = (v) => fmt(toDisplay(d.kind, v, us));
    const cm = d.signed && state.settings.colormap === 'rainbow' ? 'rainbow' : state.settings.colormap ?? 'rainbow';
    const bands = Number(state.settings.contourBands) || 0;
    if (d.values) {
      const [lo, hi] = d.range ?? rangeOf(d.values);
      view.setContour(d.values, { min: lo, max: hi, colormap: cm, bands, log: d.log, reverse: d.reverse, title, unit, format, note: noteOf(sys, item) });
    } else view.setContour(null);
    // Slices (air, flow): their own range.
    if (d.slices) {
      let lo = Infinity; let hi = -Infinity;
      for (const s of d.slices) for (const v of s.values) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      view.setSlices(d.slices, { min: lo, max: hi, colormap: cm, bands, opacity: (state.settings.sliceOpacity ?? 85) / 100 });
      if (!d.values) view.setContour(new Float32Array(info.positions.length / 3).fill(NaN), { min: lo, max: hi, colormap: cm, bands, title, unit, format });
      if (!d.values) view.setContour(null);
      legendOnly(lo, hi, cm, bands, title, unit, format);
    } else view.setSlices(null);
    if (d.streamlines && (item.quantity === 'streamlines' || state.settings.showStreamlines !== false)) {
      const [lo, hi] = rangeOf(d.streamlines.speed);
      view.setStreamlines(d.streamlines, { min: lo, max: hi, colormap: cm });
      if (item.quantity === 'streamlines') legendOnly(lo, hi, cm, 0, title, unitLabel('velocity', us), (v) => fmt(v));
    } else view.setStreamlines(null);
    if (d.surface) {
      view.setSurface(d.surface, { color: '#3d8bd9' });
      view.setStyle('translucent');
    } else { view.setSurface(null); view.setStyle(state.settings.displayStyle ?? 'shadedEdges'); }
    const scale = deformScale(d);
    shown.scale = scale;
    view.setDeformation(d.vector, scale);
    view.showUndeformed(Boolean(d.vector && scale && state.settings.showUndeformed));
    view.setLabels(extremeLabels());
    if (state.animate && (d.frames || d.animate)) startAnimation();
    ctx.renderSome(['status']);
  }

  function legendOnly(lo, hi, colormap, bands, title, unit, format) {
    view.contour = { nodeValues: null, min: lo, max: hi, norm: (v) => (v - lo) / (hi - lo || 1), colormap, bands, log: false };
    view.drawLegend({ title, unit, format });
  }

  function noteOf(sys, item) {
    const r = sys.result;
    if (item.mode) {
      if (item.mode.frequency !== undefined) return `${t('res.frequency')}: ${fmt(item.mode.frequency)} Hz`;
      if (item.mode.factor !== undefined && item.mode.factor !== null) return `${t('res.loadFactor')}: ${fmt(item.mode.factor)}`;
    }
    if (item.quantity === 'harmonicAnimation') return `${fmt(r.harmonic.frequency)} Hz`;
    return '';
  }

  function startAnimation() {
    const d = shown?.display;
    if (!view || !d) return;
    state.animate = true;
    const fps = state.settings.animFps ?? 18;
    if (d.frames) {
      const frames = d.frames.map((f) => ({ vector: f.vector ?? null, values: f.values ?? null }));
      view.animate({ frames, fps, onFrame: (i) => { state.frameIndex = i; ctx.renderSome(['status']); } });
    } else if (d.vector) {
      view.animate({});
    }
    ctx.renderSome(['toolbar']);
  }

  function stopAnimation() {
    state.animate = false;
    view?.stopAnimation();
    if (shown?.kind === 'result') view.setDeformation(shown.display.vector, shown.scale);
    ctx.renderSome(['toolbar']);
  }

  return {
    ensureView, applyTheme, refreshSetupMesh, showSetup, showResult, paintSetup, startAnimation, stopAnimation, faceOf, sigOf,
    get view() { return view; }, get shown() { return shown; }, setupKey,
    resetSetup() { state.setupMesh = null; shown = null; },
    rescale() { if (shown?.kind === 'result') { const sys = ctx.systemById(shown.sysId); if (sys) showResult(sys, shown.item); } },
  };
}

export { UNIT, SYSTEMS };
