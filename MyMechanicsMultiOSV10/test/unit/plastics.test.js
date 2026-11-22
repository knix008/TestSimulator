// Injection moulding flow: the Hele-Shaw fill against analytic radial and channel flow, the Cross-WLF
// viscosity, short shots, weld lines, air traps, cooling time, clamp force, and the cavity of a kernel part.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import {
  RESINS, RESIN_IDS, viscosity, plateDomain, partDomain, nearestNode, suggestGate, fillSimulation, resultColours, plasticsReportHtml, resinOf, nodeAt,
  taitVolume, taitDensity, compressibility, runStudy,
} from '../../src/cad/plastics.js';
import { conductLayers, layerScratch, frozenFraction } from '../../src/cad/plastics-pvt.js';

const NEWTONIAN = { newtonian: true, eta: 1000, rho: 1000, rhoSolid: 1000, cp: 2000, k: 0.2, melt: 230, mould: 50, eject: 90, noFlow: -Infinity, shrink: 1 };
const within = (v, e, rel, what) => assert.ok(Math.abs(v - e) <= rel * Math.abs(e), `${what}: ${v} vs ${e} (±${rel * 100}%)`);

// A 100 × 100 × 2 mm plate gated in the middle, filled in 1 s with a Newtonian melt.
const N = 51; const cell = 100 / N; const h = 2;
const plate = plateDomain(N, N, cell, () => h);
const centre = nearestNode(plate, [50, 50, 0]);
const radial = fillSimulation(plate, { gates: [centre], resin: NEWTONIAN, fillTime: 1 });
const Q = (plate.volume * 1e-9) / 1;

test('radial flow from a centre gate: fill time at radius r is π r² h / Q', () => {
  assert.equal(radial.summary.shortShot, false);
  within(radial.summary.fillTime, 1, 0.03, 'end of fill');
  for (const r of [20, 30, 40, 45]) {
    let sum = 0; let n = 0;
    plate.nodes.forEach((nd, i) => { if (Math.abs(Math.hypot(nd.c[0] - 50, nd.c[1] - 50) - r) < cell * 0.6) { sum += radial.fillTime[i]; n++; } });
    within(sum / n, (Math.PI * (r * 1e-3) ** 2 * (h * 1e-3)) / Q, 0.05, `fill time at r = ${r}`);
  }
});

test('radial flow: the gate pressure grows as 6ηQ/(πh³) · ln(R2/R1)', () => {
  const at = (r) => { const t = (Math.PI * (r * 1e-3) ** 2 * (h * 1e-3)) / Q; let best = radial.history[0]; for (const x of radial.history) if (Math.abs(x.t - t) < Math.abs(best.t - t)) best = x; return best.pGate; };
  const analytic = ((6 * NEWTONIAN.eta * Q) / (Math.PI * (h * 1e-3) ** 3)) * Math.log(40 / 15) / 1e6;
  within(at(40) - at(15), analytic, 0.1, 'pressure rise from r 15 to 40');
});

// Channel flow from a line gate along one end: Δp = 12 η Q L / (W h³).
function channel(L, hh, W = 20, c = 2) {
  const d = plateDomain(L / c, W / c, c, () => hh);
  const gates = d.nodes.map((x, i) => [x, i]).filter(([x]) => x.ij[0] === 0).map(([, i]) => i);
  const r = fillSimulation(d, { gates, resin: NEWTONIAN, fillTime: 1 });
  const q = (d.volume * 1e-9) / 1;
  return { r, analytic: (12 * NEWTONIAN.eta * q * ((L - c) * 1e-3)) / ((W * 1e-3) * (hh * 1e-3) ** 3) / 1e6 };
}

test('channel flow: pressure at the end of fill matches 12ηQL/(Wh³) and scales with length and 1/h³', () => {
  const a = channel(100, 2); const b = channel(200, 2); const c = channel(100, 1);
  within(a.r.summary.gatePressure, a.analytic, 0.05, 'L 100, h 2');
  within(b.r.summary.gatePressure, b.analytic, 0.05, 'L 200, h 2');
  // At the same fill time the flow rate doubles with the length too: ×4; half the gap at half the flow rate: ×4.
  within(b.r.summary.gatePressure / a.r.summary.gatePressure, 4, 0.05, 'pressure ratio, twice the length');
  within(c.r.summary.gatePressure / a.r.summary.gatePressure, 4, 0.06, 'pressure ratio, half the gap (Q/2 · 8)');
  // The same flow rate through half the gap: eight times the pressure.
  const d = plateDomain(50, 10, 2, () => 1);
  const gates = d.nodes.map((x, i) => [x, i]).filter(([x]) => x.ij[0] === 0).map(([, i]) => i);
  const half = fillSimulation(d, { gates, resin: NEWTONIAN, fillTime: 0.5, maxPressure: 1000 });
  within(half.summary.gatePressure / a.r.summary.gatePressure, 8, 0.06, 'same Q, half the gap');
});

test('Resin grades: published coefficients are cited, family values are labelled fallbacks, published Tait sets match the papers', () => {
  const grades = RESIN_IDS.filter((id) => !RESINS[id].fallback);
  assert.ok(grades.length >= 10, `${grades.length} named grades`);
  for (const id of RESIN_IDS) {
    const r = RESINS[id];
    assert.ok(typeof r.source === 'string' && r.source.length > 10, `${id} has a source`);
    if (r.fallback) assert.match(r.source, /fallback/);
    else { assert.match(r.source, /doi:10\./, `${id} cites a DOI`); assert.ok(RESINS[r.family]?.fallback, `${id} family ${r.family}`); }
  }
  // Krebelj et al. 2021 (HDPE M80064): v at 25 °C, 0 Pa on the solid branch = b1s + b2s (T − b5) + b7 e^(b8 (T − b5)).
  const t = RESINS.hdpe_m80064.tait; const dT = 298.15 - t.b5;
  within(taitVolume(t, 25, 0), t.b1s + t.b2s * dT + t.b7 * Math.exp(t.b8 * dT), 1e-9, 'HDPE solid volume');
  within(RESINS.hdpe_m80064.rhoSolid, 950, 0.02, 'HDPE M80064 solid density from its Tait set');
  // Cross-Arrhenius (PMMA RV825, Liu et al. 2019): η0 = B e^(Tb/T) at zero shear.
  const pm = RESINS.pmma_rv825;
  within(viscosity(pm, 250, 0), pm.B * Math.exp(pm.Tb / 523.15), 1e-9, 'Cross-Arrhenius zero-shear viscosity');
  assert.ok(viscosity(pm, 230, 1000) > viscosity(pm, 270, 1000));
  // Makrolon 2405 has only a published Tait set: viscosity is the PC family's.
  assert.equal(viscosity(RESINS.pc_makrolon2405, 300, 1000), viscosity(RESINS.pc, 300, 1000));
});

test('Cross-WLF: shear thinning, hotter melt flows easier, every resin gives a moulding viscosity', () => {
  const abs = RESINS.abs;
  assert.ok(viscosity(abs, 240, 10) > viscosity(abs, 240, 1000));
  assert.ok(viscosity(abs, 220, 1000) > viscosity(abs, 260, 1000));
  for (const id of RESIN_IDS) {
    const r = RESINS[id]; const eta = viscosity(r, r.melt, 1000);
    assert.ok(eta > 10 && eta < 2000, `${id}: ${eta} Pa·s at its melt temperature and 1000 1/s`);
  }
  assert.equal(viscosity(NEWTONIAN, 0, 1e5), 1000);
  assert.equal(resinOf('abs'), 'abs'); assert.equal(resinOf('steel-1020'), null);
});

test('short shot: a machine pressure limit far below the need stops the front', () => {
  const r = fillSimulation(plateDomain(60, 10, 2, () => 0.6), { gates: [0], resin: 'pc', fillTime: 0.3, maxPressure: 20 });
  assert.equal(r.summary.shortShot, true);
  assert.ok(r.summary.filledFraction < 1);
  assert.ok([...r.fillTime].some((t) => !Number.isFinite(t)));
});

test('a thin wall freezes the front before the end: short shot by temperature', () => {
  const r = fillSimulation(plateDomain(150, 6, 2, () => 0.4), { gates: [0], resin: 'pp', fillTime: 8, maxPressure: 400 });
  assert.equal(r.summary.shortShot, true);
  assert.equal(r.summary.reason, 'frozen');
});

test('two gates: a weld line where the fronts meet, no air trap on the vented edge; an enclosed last-filled spot is an air trap', () => {
  const d = plateDomain(40, 10, 2.5, () => 2);
  const left = d.nodes.findIndex((x) => x.ij[0] === 0 && x.ij[1] === 5);
  const right = d.nodes.findIndex((x) => x.ij[0] === 39 && x.ij[1] === 5);
  const r = fillSimulation(d, { gates: [left, right], resin: NEWTONIAN, fillTime: 1 });
  const weldX = d.nodes.filter((_, i) => r.weld[i]).map((x) => x.c[0]);
  assert.ok(weldX.length > 0);
  assert.ok(weldX.every((x) => Math.abs(x - 50) < 6), `weld nodes at ${weldX}`);
  // A ring of gates around a square: the middle fills last and has no vent.
  const sq = plateDomain(21, 21, 2, () => 2);
  const ring = sq.nodes.map((x, i) => [x, i]).filter(([x]) => x.boundary).map(([, i]) => i);
  const rr = fillSimulation(sq, { gates: ring, resin: NEWTONIAN, fillTime: 1 });
  assert.ok(rr.summary.airTraps >= 1);
  const trap = sq.nodes.find((_, i) => rr.trap[i]);
  assert.ok(Math.hypot(trap.c[0] - 21, trap.c[1] - 21) < 4, `trap at ${trap.c}`);
});

test('cooling time, clamp force, sink and the report', () => {
  const r = fillSimulation(plateDomain(40, 40, 2.5, (x) => (x > 45 && x < 55 ? 4 : 2)), { gates: [820], resin: 'abs', fillTime: 1 });
  const s = r.summary;
  const abs = RESINS.abs; const a = abs.k / (abs.rho * abs.cp); const hm = s.maxWall * 1e-3;
  // The layered (gapwise) model against the one-term analytic mid-plane solution.
  within(s.coolingTime, ((hm * hm) / (Math.PI ** 2 * a)) * Math.log((4 / Math.PI) * (240 - 60) / (95 - 60)), 0.02, 'cooling time');
  assert.equal(s.maxWall, 4); assert.equal(s.nominalWall, 2);
  // Gated in the thick strip itself: packing reaches it until it is frozen through, so it barely sinks.
  assert.ok(s.sinkMax < 0.02, `${s.sinkMax}`);
  // Sink from the packed state: only the thick strip, none on the nominal wall.
  // Gated in the thin wall: its gate seals while the thick strip's core is still molten — that core sinks.
  const d = plateDomain(40, 40, 2.5, (x) => (x > 45 && x < 55 ? 4 : 2));
  const rs = fillSimulation(d, { gates: [d.nodes.findIndex((nd) => nd.ij[0] === 0 && nd.ij[1] === 20)], resin: 'abs', fillTime: 1 });
  assert.ok(rs.summary.sinkMax > 0.01, `${rs.summary.sinkMax}`);
  const thick = d.nodes.map((nd, i) => [nd, i]).filter(([nd]) => nd.h === 4).map(([, i]) => i);
  const thin = d.nodes.map((nd, i) => [nd, i]).filter(([nd]) => nd.h === 2 && Math.abs(nd.c[0] - 20) < 3).map(([, i]) => i);
  const avg = (ids) => ids.reduce((a2, i) => a2 + rs.sink[i], 0) / ids.length;
  assert.ok(avg(thick) > 2 * avg(thin), `sink thick ${avg(thick)} vs thin ${avg(thin)}`);
  // Clamp force: Σ p A over the projected area, below the gate pressure times the area.
  assert.ok(s.clampForce > 0 && s.clampForce <= Math.max(s.gatePressure, s.packPressure) * 100 * 100 / 1000 + 1e-9);
  const html = plasticsReportHtml({ name: 'Plate', resinId: 'abs', result: r, gates: [820] });
  assert.match(html, /<table/); assert.match(html, /MPa/);
  const colours = resultColours({ vertices: Float32Array.from([10, 10, 1, 90, 90, 1]) }, plateDomain(40, 40, 2.5, () => 2), r, 'fillTime');
  assert.equal(colours.colors.length, 6);
});

test('Tait PVT: solid and melt densities, compressibility, the crystallisation step of a semi-crystalline resin', () => {
  for (const id of RESIN_IDS) {
    const r = RESINS[id];
    within(taitDensity(r.tait, 25, 0), r.rhoSolid, 0.005, `${id} solid density`);
    within(taitDensity(r.tait, r.melt, 0), r.rho, 0.005, `${id} melt density`);
    const beta = compressibility(r.tait, r.melt, 50e6);
    assert.ok(beta > 1e-10 && beta < 2e-9, `${id} compressibility ${beta}`);
    assert.ok(taitVolume(r.tait, r.melt, 100e6) < taitVolume(r.tait, r.melt, 0), `${id}: pressure packs the melt`);
  }
  const pp = RESINS.pp.tait;
  // Below the transition the volume falls steeply as the resin crystallises (much more than the melt's own
  // expansion over the same 20 K); under 100 MPa the transition is 20 K higher, so at 130 °C the slope is steep.
  const melt20 = RESINS.pp.tait.b2m * 20;
  assert.ok(taitVolume(pp, 120, 0) - taitVolume(pp, 100, 0) > 3 * melt20);
  const slope = (T, p) => (taitVolume(pp, T + 1, p) - taitVolume(pp, T - 1, p)) / 2;
  assert.ok(slope(130, 100e6) > 3 * slope(130, 0), `${slope(130, 100e6)} vs ${slope(130, 0)}`);
});

test('gapwise conduction: the mid-plane of a quenched wall follows the series solution; the frozen skin grows as √t', () => {
  const L = 40; const h = 2e-3; const a = 1e-7; const T0 = 240; const Tw = 40;
  const T = new Float64Array(L).fill(T0); const sc = layerScratch(L);
  const tau = (h * h) / (Math.PI ** 2 * a);
  let t = 0; const dt = tau / 400;
  const series = (time) => { let s = 0; for (let k = 0; k < 50; k++) { const m = 2 * k + 1; s += ((4 / Math.PI) * ((-1) ** k) / m) * Math.exp((-m * m * time) / tau); } return Tw + (T0 - Tw) * s; };
  const skins = [];
  while (t < 1.5 * tau) {
    conductLayers(T, L, h, a, Tw, dt, sc); t += dt;
    if (Math.abs(t - 0.02 * tau) < dt / 2 || Math.abs(t - 0.08 * tau) < dt / 2) skins.push(frozenFraction(T, L, 150));
  }
  within(T[0], series(t), 0.01, 'mid-plane temperature');
  // Early on the wall behaves as a half space: the skin at four times the time is twice as thick.
  within(skins[1] / skins[0], 2, 0.2, 'skin growth ratio');
});

test('packing: the held pressure adds mass and lowers the volumetric shrinkage; no packing, more shrinkage', () => {
  const d = plateDomain(30, 10, 2.5, () => 2);
  const gates = d.nodes.map((x, i) => [x, i]).filter(([x]) => x.ij[0] === 0).map(([, i]) => i);
  const low = fillSimulation(d, { gates, resin: 'abs', fillTime: 1, packPressure: 1 });
  const high = fillSimulation(d, { gates, resin: 'abs', fillTime: 1, packPressure: 60 });
  assert.ok(high.summary.mass > low.summary.mass, `${high.summary.mass} vs ${low.summary.mass}`);
  assert.ok(high.summary.shrinkageAvg < low.summary.shrinkageAvg, `${high.summary.shrinkageAvg} vs ${low.summary.shrinkageAvg}`);
  assert.ok(high.summary.gateFreezeTime > 0);
  // Shrinkage of an unpacked ABS part: between the solid and melt specific volumes' gap, a few per cent.
  assert.ok(low.summary.shrinkageAvg > 0.5 && low.summary.shrinkageAvg < 12, `${low.summary.shrinkageAvg}`);
});

await loadKernel();
const R = rep();

test('a kernel plate becomes a midplane cavity; a cup becomes voxels; the suggested gate balances the flow', () => {
  const plateBody = R.makeBox([0, 0, 0], [80, 60, 2]);
  const d = partDomain(plateBody.mesh({ tolerance: 0.05, angularTolerance: 0.3 }), { cells: 40 });
  assert.equal(d.kind, 'midplane');
  within(d.volume, 80 * 60 * 2, 0.01, 'cavity volume');
  const g = suggestGate(d);
  assert.ok(Math.hypot(d.nodes[g].c[0] - 40, d.nodes[g].c[1] - 30) < 6, `gate at ${d.nodes[g].c}`);
  const cup = R.makeBox([0, 0, 0], [40, 40, 30]).cut(R.makeBox([2, 2, 2], [38, 38, 31]));
  const v = partDomain(cup.mesh({ tolerance: 0.05, angularTolerance: 0.3 }), { cells: 20 });
  assert.equal(v.kind, '3d');
  within(v.volume, 40 * 40 * 30 - 36 * 36 * 28, 0.25, 'voxel volume');
  const r = fillSimulation(v, { gates: [nearestNode(v, [20, 20, 0])], resin: 'abs', fillTime: 1 });
  assert.equal(r.summary.shortShot, false);
  assert.ok(nodeAt(v, [20, 20, 1]) >= 0);
  // The walls fill after the bottom they rise from.
  const bottom = r.fillTime[nearestNode(v, [20, 20, 1])]; const rim = r.fillTime[nearestNode(v, [1, 20, 29])];
  assert.ok(rim > bottom);
});

test('3D voxels, uniform and adaptively merged: a thick channel gives the gap-integrated Hele-Shaw pressure', () => {
  const mesh = R.makeBox([0, 0, 0], [60, 20, 12]).mesh({ tolerance: 0.05, angularTolerance: 0.3 });
  const Q = (60 * 20 * 12e-9) / 1; const analytic = (12 * NEWTONIAN.eta * Q * 58e-3) / (20e-3 * (12e-3) ** 3) / 1e6;
  const runs = [false, true].map((adaptive) => {
    const d = partDomain(mesh, { cells: 30, mode: '3d', adaptive });
    const gates = d.nodes.map((nd, i) => [nd, i]).filter(([nd]) => nd.c[0] < 2.1).map(([, i]) => i);
    return { d, r: fillSimulation(d, { gates, resin: NEWTONIAN, fillTime: 1 }) };
  });
  // At the 99 % switch-over the front has 99 % of the length to go: Δp = 0.99 × 12ηQL/(Wh³) (± the first column).
  for (const { r } of runs) within(r.summary.gatePressure, analytic * 0.99, 0.05, 'gate pressure');
  assert.ok(runs[1].d.nodes.length < runs[0].d.nodes.length / 4, `adaptive ${runs[1].d.nodes.length} nodes against ${runs[0].d.nodes.length}`);
  within(runs[1].r.summary.fillTime, runs[0].r.summary.fillTime, 0.07, 'fill time, merged against fine');
});

test('the study runs from plain data (the worker protocol): progress messages, then the result; a cancel stops it', () => {
  const mesh = R.makeBox([0, 0, 0], [40, 30, 2]).mesh({ tolerance: 0.05, angularTolerance: 0.3 });
  const input = { mesh: { vertices: Float32Array.from(mesh.vertices), triangles: Uint32Array.from(mesh.triangles) }, gates: [[20, 15, 1]], domain: { cells: 30 }, process: { resin: 'abs', fillTime: 0.5 } };
  const messages = [];
  const out = runStudy(input, (m) => messages.push(m));
  assert.ok(out && messages.at(-1).type === 'result');
  assert.ok(messages.filter((m) => m.type === 'progress').length >= 3);
  assert.ok(messages.some((m) => m.phase === 'pack'), 'the packing phase reports too');
  assert.equal(out.domain.kind, 'midplane');
  const cancelled = [];
  const none = runStudy(input, (m) => cancelled.push(m), { cancelled: true });
  assert.equal(none, null); assert.equal(cancelled.at(-1).code, 'cancelled');
});
