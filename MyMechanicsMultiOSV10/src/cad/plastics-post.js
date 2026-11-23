// The whole moulding study (no DOM; the worker runs it): the fill and pack of cad/plastics.js, then — as the study
// asks — the fiber orientation of a filled resin (plastics-fiber.js), the mould cooling with its channels
// (plastics-cooling.js) and the warpage of the ejected part (plastics-warp.js). The extra results go on the fill
// result as node fields the colouring reads (mouldTemp, coolTime, fiberAlign, fiberSkin, fiberCore) and as
// summaries (result.fibers, result.cooling, result.warp: per cause the vertex displacements of the part mesh).
import { runStudy, RESINS } from './plastics.js';
import { fiberOrientation } from './plastics-fiber.js';
import { coolingStudy, suggestChannels } from './plastics-cooling.js';
import { warpage, mouldingStrains, solidOf, CAUSES } from './plastics-warp.js';

/**
 * input: runStudy's input plus fiber { fraction, aspect }, cooling { channels | auto: { diameter, flow, inlet,
 * coolant, pitch, depth }, cycleTime, steel }, warp { on, size }.
 */
export function runMouldingStudy(input, post = () => {}, signal = null) {
  let message = null;
  const base = runStudy(input, (m) => { if (m.type === 'result') message = m; else post(m); }, signal);
  if (!base || !message) return null;
  try {
    const { result } = base; const domain = base.full;
    const resin = RESINS[input.process?.resin] ?? RESINS.abs;
    const family = resin.family ?? 'abs';
    const fiber = Math.max(0, Math.min(0.6, Number(input.fiber?.fraction) || 0));
    let fibers = null;
    if (fiber > 0) {
      post({ type: 'progress', fraction: 0.8, phase: 'fiber' });
      fibers = fiberOrientation(domain, result, { fraction: fiber, aspect: input.fiber?.aspect ?? 20, resinDensity: (resin.rhoSolid ?? 1140) / 1000, layers: 5, maxSteps: domain.nodes.length > 20000 ? 40 : 80 });
      result.fiberAlign = fibers.alignment; result.fiberSkin = fibers.skin; result.fiberCore = fibers.core;
      result.fibers = { phi: fibers.phi, CI: fibers.CI, layers: fibers.layers, tensor: fibers.tensor, direction: fibers.direction, mean: mean(fibers.alignment), skinMean: mean(fibers.skin), coreMean: mean(fibers.core) };
    }
    let cooling = null;
    const cin = input.cooling;
    if (cin && (cin.channels?.length || cin.auto)) {
      post({ type: 'progress', fraction: 0.86, phase: 'cooling' });
      const channels = cin.channels?.length ? cin.channels : suggestChannels(domain, cin.auto);
      const cycle = cin.cycleTime > 0 ? cin.cycleTime : result.summary.cycleTime;
      cooling = coolingStudy(domain, { ...resin, family }, channels, { cycleTime: cycle, melt: result.summary.melt, steel: cin.steel ?? 'p20' });
      if (cooling.ok) {
        let finiteMax = 0; for (const v of cooling.coolTime) if (Number.isFinite(v)) finiteMax = Math.max(finiteMax, v);
        result.mouldTemp = cooling.wall;
        result.coolTime = Float64Array.from(cooling.coolTime, (v) => (Number.isFinite(v) ? v : 2 * finiteMax || 1));
        // The cycle with the cooling the mould gives (the fill result's estimate assumed an even mould temperature).
        const sm = result.summary;
        const coolNeeded = Number.isFinite(cooling.summary.coolTimeMax) ? cooling.summary.coolTimeMax : null;
        result.cooling = { channels: channels.map((c) => ({ name: c.name, side: c.side, points: c.points, diameter: c.diameter })), circuits: cooling.channels, warnings: cooling.warnings, summary: { ...cooling.summary, cycleWithCooling: coolNeeded != null ? sm.fillTime + Math.max(sm.packTime ?? 0, 0) + Math.max(0, coolNeeded - (sm.packTime ?? 0)) + 4 : null }, Tinf: cooling.Tinf };
      } else result.cooling = { error: cooling.error };
    }
    if (input.warp?.on) {
      post({ type: 'progress', fraction: 0.9, phase: 'warp' });
      const solid = solidOf(family, fiber);
      const strains = mouldingStrains({ domain, fill: result, cooling: cooling?.ok ? cooling : null, fibers, family, fiber, shrinkFallback: resin.shrink ?? 0.5 });
      const w = warpage({ mesh: input.mesh, strains, solid, meshOptions: { size: input.warp.size > 0 ? input.warp.size : undefined, resolution: input.warp.resolution ?? 24, order: 1 }, onProgress: (f) => post({ type: 'progress', fraction: 0.9 + 0.1 * f, phase: 'warp' }) });
      if (w.ok) {
        const cases = {};
        for (const c of [...CAUSES, 'total']) {
          const k = w.cases[c];
          cases[c] = { max: k.max, warpMax: k.warpMax, warpAt: k.warpAt, scale: k.scale, vertexDisplacement: Float32Array.from(k.vertexDisplacement), vertexWarp: Float32Array.from(k.vertexWarp) };
        }
        result.warp = { cases, dominant: w.dominant, elements: w.elements, solid, held: w.held.length };
      } else result.warp = { error: w.error };
    }
    const out = { domain: base.domain, result, gates: base.gates };
    post({ type: 'result', ...out });
    return out;
  } catch (error) {
    post({ type: 'error', code: error.code ?? 'failed', message: error.message });
    return null;
  }
}

const mean = (a) => { let s = 0, n = 0; for (const v of a) if (Number.isFinite(v)) { s += v; n++; } return n ? s / n : 0; };

/** Colours (blue → red) for one value per vertex: the magnitude of a 3-vector field when `d` is 3. */
export function vertexColours(values, d, ramp) {
  const n = values.length / d; const mag = new Float32Array(n);
  let lo = Infinity, hi = -Infinity;
  for (let v = 0; v < n; v++) { const m = d === 3 ? Math.hypot(values[3 * v], values[3 * v + 1], values[3 * v + 2]) : values[v]; mag[v] = m; if (m < lo) lo = m; if (m > hi) hi = m; }
  const colors = new Float32Array(3 * n);
  for (let v = 0; v < n; v++) colors.set(ramp((mag[v] - lo) / (hi - lo || 1)), 3 * v);
  return { colors, min: lo, max: hi };
}
