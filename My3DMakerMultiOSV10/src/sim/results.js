// What a solved system shows: its result items (outline › Solution), the values and deformation of
// each on the mesh, slices / streamlines / surfaces, the summary table and the charts.
import { RESULTS, SYSTEMS } from './catalog.js';
import { UNIT } from './project.js';

/** Result items of a solved system: [{ key, quantity, index?, labelKey, params }]. */
export function resultItems(sys, result) {
  if (!result) return [];
  const def = SYSTEMS[sys.type];
  const items = [];
  for (const q of def.results) {
    const spec = RESULTS[q];
    if (!spec) continue;
    if (spec.source === 'mode' || spec.source === 'buckling') {
      (result.modes ?? []).forEach((m, i) => items.push({ key: `${q}:${i}`, quantity: q, index: i, mode: m }));
      continue;
    }
    if (!available(spec, result)) continue;
    items.push({ key: q, quantity: q });
  }
  return items;
}

function available(spec, r) {
  switch (spec.source) {
    case 'result': return Boolean(r.result?.fields?.[spec.field]);
    case 'fatigue': return Boolean(r.fatigue?.fields?.[spec.field]);
    case 'thermal': return Boolean(r.thermal?.fields?.[spec.field]);
    case 'harmonic': return Boolean(r.harmonic);
    case 'frames': return Boolean(r.transient?.frames?.length);
    case 'transientMax': return Boolean(r.transient?.maxVonMises);
    case 'explicitFrames': return Boolean(r.explicit?.frames?.length);
    case 'thermalFrames': return Boolean(r.transient?.frames?.length);
    case 'topology': return Boolean(r.topology);
    case 'fluid': return Boolean(r.fluid?.fields?.[spec.field]);
    case 'streamlines': return Boolean(r.fluid?.streamlines);
    case 'slice': return Boolean((r.electric?.slices ?? r.magnetic?.slices)?.[0]?.fields?.[spec.field]);
    default: return false;
  }
}

/** Largest vector length in xyz triples. */
function maxLen(v) { let m = 0; for (let i = 0; i + 2 < v.length; i += 3) m = Math.max(m, Math.hypot(v[i], v[i + 1], v[i + 2])); return m; }
const toModel = (v) => { const out = new Float32Array(v.length); for (let i = 0; i < v.length; i++) out[i] = v[i] / UNIT; return out; };

/**
 * The display of an item: { values, kind, vector (model units), autoScale, frames, slices, streamlines,
 * surface, signed, log, reverse, range }.
 */
export function displayOf(item, result, modelSize) {
  const spec = RESULTS[item.quantity];
  const r = result;
  const out = { kind: spec.kind, signed: Boolean(spec.signed), log: Boolean(spec.log), reverse: Boolean(spec.reverse), values: null, vector: null, frames: null };
  const deformVec = spec.deform && r.result?.fields?.vector ? toModel(r.result.fields.vector) : null;
  const autoScale = (vec) => { const m = maxLen(vec ?? []); return m > 0 ? (0.06 * modelSize) / m : 1; };
  switch (spec.source) {
    case 'result': out.values = r.result.fields[spec.field]; out.vector = deformVec; break;
    case 'fatigue': out.values = r.fatigue.fields[spec.field]; break;
    case 'thermal': out.values = r.thermal.fields[spec.field]; break;
    case 'transientMax': out.values = r.transient.maxVonMises; out.vector = deformVec; break;
    case 'mode':
    case 'buckling': {
      const m = item.mode;
      out.values = m.field;
      out.vector = m.vector ?? null;
      out.animate = Boolean(m.vector);
      out.trueScale = false;
      break;
    }
    case 'harmonic': {
      const h = r.harmonic;
      out.values = h.total;
      // Animate Re(U e^{iωt}): frames from the real and imaginary parts.
      const re = toModel(h.re); const im = toModel(h.im);
      out.vector = re;
      out.frames = Array.from({ length: 24 }, (_, k) => { const ph = (2 * Math.PI * k) / 24; const v = new Float32Array(re.length); for (let i = 0; i < re.length; i++) v[i] = re[i] * Math.cos(ph) - im[i] * Math.sin(ph); return { vector: v }; });
      out.scaleFrom = h.total ? maxLen(re) : 0;
      break;
    }
    case 'frames':
    case 'explicitFrames': {
      const frames = spec.source === 'frames' ? r.transient.frames : r.explicit.frames;
      out.frames = frames.map((f) => ({ vector: toModel(f.vector), values: f.vonMises, time: f.time }));
      out.values = frames.at(-1).vonMises;
      out.vector = out.frames.at(-1).vector;
      // A common range over all frames.
      let mx = 0; for (const f of frames) for (const v of f.vonMises) mx = Math.max(mx, v);
      out.range = [0, mx];
      out.frameScale = Math.max(...out.frames.map((f) => maxLen(f.vector)));
      if (spec.source === 'explicitFrames') out.trueScale = true;
      break;
    }
    case 'thermalFrames': {
      const frames = r.transient.frames;
      out.frames = frames.map((f) => ({ values: f.temperature, time: f.time }));
      out.values = frames.at(-1).temperature;
      let lo = Infinity; let hi = -Infinity; for (const f of frames) for (const v of f.temperature) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      out.range = [lo, hi];
      break;
    }
    case 'topology': {
      out.surface = r.topology.surface;
      out.values = null;
      break;
    }
    case 'fluid': {
      out.fluidField = spec.field;
      out.slices = fluidSlices(r.fluid, spec.field);
      out.values = spec.field === 'pressure' && r.result?.fields?.pressure ? r.result.fields.pressure : null;
      out.streamlines = r.fluid.streamlines;
      break;
    }
    case 'streamlines': out.streamlines = r.fluid.streamlines; out.slices = null; out.values = r.result?.fields?.pressure ?? null; out.kind = 'velocity'; break;
    case 'slice': {
      const planes = r.electric?.slices ?? r.magnetic?.slices;
      out.slices = planes.map((p) => ({ ...p, values: p.fields[spec.field] }));
      break;
    }
    default: break;
  }
  if (out.vector && !out.autoScale) out.autoScale = out.trueScale ? 1 : autoScale(out.frames?.length ? out.frames.map((f) => f.vector).reduce((a, b) => (maxLen(b) > maxLen(a) ? b : a)) : out.vector);
  return out;
}

/** Cell values of a fluid grid field on two mid-planes (through the bodies): like the solver's slices. */
export function fluidSlices(fluid, field, axes = [2, 1], offset = null) {
  const [nx, ny, nz] = fluid.dims;
  const n = [nx, ny, nz];
  const h = fluid.cellSize;
  const lo = fluid.origin;
  const values = fluid.fields[field];
  if (!values) return null;
  const cells = fluid.cells;
  // Through the centre of the bodies (the solid cells), or the domain centre.
  const centre = [0, 0, 0];
  let count = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const c = (k * ny + j) * nx + i; if (cells[c] !== 0 && cells[c] !== 0xffff) { centre[0] += i; centre[1] += j; centre[2] += k; count++; } }
  const mid = count ? centre.map((v) => Math.round(v / count)) : [nx >> 1, ny >> 1, nz >> 1];
  return axes.map((axis) => {
    const [u, v] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
    // A given offset (0-1 across the grid) or through the bodies.
    const at = Math.min(n[axis] - 1, Math.max(0, offset === null ? mid[axis] : Math.floor(offset * n[axis])));
    const vals = new Float32Array(n[u] * n[v]);
    for (let b = 0; b < n[v]; b++) for (let a = 0; a < n[u]; a++) {
      const idx = [0, 0, 0]; idx[axis] = at; idx[u] = a; idx[v] = b;
      const c = (idx[2] * ny + idx[1]) * nx + idx[0];
      vals[b * n[u] + a] = cells[c] === 0 ? values[c] : NaN;
    }
    return { axis, u, v, at: lo[axis] + (at + 0.5) * h, uRange: [lo[u], lo[u] + n[u] * h], vRange: [lo[v], lo[v] + n[v] * h], size: [n[u], n[v]], values: vals };
  });
}

export function rangeOf(values) {
  let lo = Infinity; let hi = -Infinity;
  if (!values) return [0, 1];
  for (const v of values) { if (!Number.isFinite(v)) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
  return lo <= hi ? [lo, hi] : [0, 1];
}

export function argExtremes(values) {
  let imin = -1; let imax = -1;
  if (!values) return { imin, imax };
  for (let i = 0; i < values.length; i++) { const v = values[i]; if (!Number.isFinite(v)) continue; if (imax < 0 || v > values[imax]) imax = i; if (imin < 0 || v < values[imin]) imin = i; }
  return { imin, imax };
}

/** Chart series of a result: [{ id, title, x: {label, kind}, y: {label, kind}, series: [{name, x[], y[]}], logX, logY }]. */
export function chartsOf(sys, r) {
  const charts = [];
  if (!r) return charts;
  if (r.harmonic?.amplitude) {
    const h = r.harmonic;
    charts.push({ id: 'frf', titleKey: 'chart.frf', x: 'frequency', y: 'displacement', logY: true, series: ['x', 'y', 'z'].map((c, i) => ({ name: `U${c}`, x: h.frequencies, y: h.amplitude[i] })) });
    charts.push({ id: 'phase', titleKey: 'chart.phase', x: 'frequency', y: 'angle', series: ['x', 'y', 'z'].map((c, i) => ({ name: `φ${c}`, x: h.frequencies, y: h.phase[i] })) });
  }
  const names = (list) => list.map((q, i) => sys?.probes?.[i]?.name || `P${i + 1}`);
  const mag3 = (h) => h[0].map((_, k) => Math.hypot(h[0][k], h[1][k], h[2][k]));
  if (r.harmonic?.amplitude && r.harmonic.probes?.length > 1) {
    const n = names(r.harmonic.probes);
    charts.push({ id: 'frfProbes', titleKey: 'chart.frfProbes', x: 'frequency', y: 'displacement', logY: true, series: r.harmonic.probes.map((q, i) => ({ name: n[i], x: r.harmonic.frequencies, y: mag3(q.amplitude) })) });
  }
  if (r.harmonic?.spl && r.harmonic.probes?.length > 1) {
    const n = names(r.harmonic.probes);
    charts.push({ id: 'splProbes', titleKey: 'chart.splProbes', x: 'frequency', y: 'spl', logX: true, series: r.harmonic.probes.map((q, i) => ({ name: n[i], x: r.harmonic.frequencies, y: q.spl })) });
  }
  if (r.harmonic?.spl) charts.push({ id: 'spl', titleKey: 'chart.spl', x: 'frequency', y: 'spl', logX: true, series: [{ name: 'SPL', x: r.harmonic.frequencies, y: r.harmonic.spl }] });
  if (r.transient?.history && Array.isArray(r.transient.history[0])) {
    const t = r.transient;
    charts.push({ id: 'history', titleKey: 'chart.history', x: 'time', y: 'displacement', series: ['x', 'y', 'z'].map((c, i) => ({ name: `U${c}`, x: t.times, y: t.history[i] })) });
  } else if (r.transient?.history) {
    charts.push({ id: 'thermalHistory', titleKey: 'chart.temperatureHistory', x: 'time', y: 'temperature', series: [{ name: 'probe', x: r.transient.times, y: r.transient.history }, { name: 'max', x: r.transient.times, y: r.transient.maxHistory }] });
  }
  if (r.transient?.probes?.length > 1) {
    const n = names(r.transient.probes);
    const structural = Array.isArray(r.transient.probes[0].history[0]);
    charts.push({ id: 'historyProbes', titleKey: 'chart.historyProbes', x: 'time', y: structural ? 'displacement' : 'temperature', series: r.transient.probes.map((q, i) => ({ name: n[i], x: r.transient.times, y: structural ? mag3(q.history) : q.history })) });
  }
  if (r.nonlinear?.curve) {
    const c = r.nonlinear.curve;
    const loads = c.map((p) => p.load);
    const series = r.nonlinear.probes?.length > 1 ? r.nonlinear.probes.map((q, i) => ({ name: names(r.nonlinear.probes)[i], x: q.displacement, y: loads })) : [{ name: 'load', x: c.map((p) => p.displacement), y: loads }];
    charts.push({ id: 'curve', titleKey: 'chart.loadDisplacement', x: 'displacement', y: 'percent', series });
  }
  if (r.creep?.history?.length) {
    const h = r.creep.history;
    charts.push({ id: 'creep', titleKey: 'chart.creep', x: 'time', y: 'displacement', series: (r.creep.probes ?? [{}]).map((q, i) => ({ name: sys?.probes?.[i]?.name || `P${i + 1}`, x: h.map((p) => p.time), y: h.map((p) => p.displacement[i] ?? 0) })) });
    charts.push({ id: 'creepStrain', titleKey: 'chart.creepStrain', x: 'time', y: 'strain', series: [{ name: 'εcr', x: h.map((p) => p.time), y: h.map((p) => p.creepStrain) }] });
  }
  if (r.fatigue?.cycles?.length > 1) {
    const c = r.fatigue.cycles;
    charts.push({ id: 'rainflow', titleKey: 'chart.rainflow', bar: true, x: 'ratio', y: 'count', series: [{ name: 'n', x: c.map((p) => p.range), y: c.map((p) => p.count) }] });
  }
  if (r.random?.responsePsd) {
    const q = r.random.responsePsd;
    charts.push({ id: 'responsePsd', titleKey: 'chart.responsePsd', x: 'frequency', y: 'psdResponse', logX: true, logY: true, series: [{ name: 'PSD', x: q.frequencies, y: q.values.map((v) => Math.max(v, 1e-30)) }] });
  }
  if (r.explicit?.energy) {
    const e = r.explicit.energy;
    charts.push({ id: 'energy', titleKey: 'chart.energy', x: 'time', y: 'energy', series: [{ name: 'kinetic', x: e.map((p) => p.time), y: e.map((p) => p.kinetic) }, { name: 'internal', x: e.map((p) => p.time), y: e.map((p) => p.internal) }] });
    const w = r.explicit.wallForce;
    if (w?.length && w.some((p) => p.force > 0)) charts.push({ id: 'wall', titleKey: 'chart.wallForce', x: 'time', y: 'force', series: [{ name: 'F', x: w.map((p) => p.time), y: w.map((p) => p.force) }] });
    const cf = r.explicit.contactForce;
    if (r.explicit.bodyContact && cf?.length) charts.push({ id: 'contactForce', titleKey: 'chart.contactForce', x: 'time', y: 'force', series: [{ name: 'F', x: cf.map((p) => p.time), y: cf.map((p) => p.force) }] });
    if (r.explicit.probes?.length) {
      const n = names(r.explicit.probes);
      charts.push({ id: 'explicitProbes', titleKey: 'chart.historyProbes', x: 'time', y: 'displacement', series: r.explicit.probes.map((q, i) => ({ name: n[i], x: r.explicit.probeTimes, y: mag3(q.history) })) });
    }
  }
  if (r.topology?.history) {
    const h = r.topology.history;
    charts.push({ id: 'compliance', titleKey: 'chart.compliance', x: 'count', y: 'energy', series: [{ name: 'C', x: h.map((p) => p.iteration), y: h.map((p) => p.compliance) }] });
  }
  if (r.fluid?.history) {
    const h = r.fluid.history;
    charts.push({ id: 'residual', titleKey: 'chart.residual', x: 'count', y: 'ratio', logY: true, series: [{ name: 'Δu/U', x: h.map((p) => p.step), y: h.map((p) => Math.max(1e-12, p.residual)) }] });
  }
  if (r.modes?.length && r.modes[0].frequency !== undefined) {
    charts.push({ id: 'freqs', titleKey: 'chart.frequencies', bar: true, x: 'count', y: 'frequency', series: [{ name: 'f', x: r.modes.map((m) => m.mode), y: r.modes.map((m) => m.frequency) }] });
  }
  return charts;
}
