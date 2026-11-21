// Injection moulding flow: the Hele-Shaw fill against analytic radial and channel flow, the Cross-WLF
// viscosity, short shots, weld lines, air traps, cooling time, clamp force, and the cavity of a kernel part.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import {
  RESINS, RESIN_IDS, viscosity, plateDomain, partDomain, nearestNode, suggestGate, fillSimulation, resultColours, plasticsReportHtml, resinOf, nodeAt,
} from '../../src/cad/plastics.js';

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
  within(s.coolingTime, ((hm * hm) / (Math.PI ** 2 * a)) * Math.log((4 / Math.PI) * (240 - 60) / (95 - 60)), 1e-9, 'cooling time');
  assert.equal(s.maxWall, 4); assert.equal(s.nominalWall, 2);
  assert.ok(s.sinkMax > 0 && s.sinkNodes > 0, 'the thick rib sinks');
  // Clamp force: Σ p A over the projected area, below the gate pressure times the area.
  assert.ok(s.clampForce > 0 && s.clampForce < s.gatePressure * 100 * 100 / 1000 + 1e-9);
  const html = plasticsReportHtml({ name: 'Plate', resinId: 'abs', result: r, gates: [820] });
  assert.match(html, /<table/); assert.match(html, /MPa/);
  const colours = resultColours({ vertices: Float32Array.from([10, 10, 1, 90, 90, 1]) }, plateDomain(40, 40, 2.5, () => 2), r, 'fillTime');
  assert.equal(colours.colors.length, 6);
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
