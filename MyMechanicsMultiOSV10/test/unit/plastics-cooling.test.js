// Mould cooling (src/cad/plastics-cooling.js): the coolant side against textbook values (Reynolds number,
// Hagen–Poiseuille pressure drop, Gnielinski film), the line-sink integral against quadrature, the heat balance of
// the superposition solve, the coolant temperature rise = heat / (ṁ cp), and the wall temperature behaving as it
// must: cooler over a channel, warmer with less flow, a hot spot where no channel reaches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { coolantFlow, channelPressureDrop, segmentIntegral, coolingStudy, suggestChannels, COOLANTS } from '../../src/cad/plastics-cooling.js';
import { plateDomain, RESINS } from '../../src/cad/plastics.js';

const near = (v, e, rel, what) => assert.ok(Math.abs(v - e) <= rel * Math.abs(e), `${what}: ${v} vs ${e}`);

test('coolant: water 10 mm, 10 L/min at 25 °C is turbulent (Re ≈ 2.4e4); a trickle is laminar with Nu 3.66', () => {
  const f = coolantFlow({ diameter: 10, flow: 10, temperature: 25 });
  near(f.v, 10 / 60000 / (Math.PI * 0.01 ** 2 / 4), 1e-12, 'velocity');
  const mu = COOLANTS.water.mu(25);
  near(mu, 0.00089, 0.03, 'water viscosity at 25 °C');
  near(f.Re, (998 * f.v * 0.01) / mu, 1e-12, 'Re');
  assert.equal(f.regime, 'turbulent');
  assert.ok(f.h > 5000 && f.h < 20000, `film coefficient ${f.h} W/m²K`);
  const slow = coolantFlow({ diameter: 10, flow: 0.1, temperature: 25 });
  assert.equal(slow.regime, 'laminar'); assert.equal(slow.Nu, 3.66);
  near(slow.h, (3.66 * 0.6) / 0.01, 1e-12, 'laminar film');
});

test('pressure drop: laminar matches Hagen–Poiseuille 128 μ L Q / (π d⁴); a 90° bend adds 1.2 velocity heads', () => {
  const f = coolantFlow({ diameter: 10, flow: 0.1, temperature: 25 });
  const straight = channelPressureDrop([[0, 0, 0], [1000, 0, 0]], f, 10);
  const Q = 0.1 / 60000;
  near(straight.dp * 1000, (128 * f.mu * 1 * Q) / (Math.PI * 0.01 ** 4), 1e-9, 'Hagen–Poiseuille');
  const bent = channelPressureDrop([[0, 0, 0], [500, 0, 0], [500, 500, 0]], f, 10);
  near((bent.dp - straight.dp) * 1000, 1.2 * 0.5 * 998 * f.v ** 2, 1e-9, 'one 90° bend');
  assert.equal(bent.bends, 1.2);
});

test('the line-sink integral equals the quadrature of 1/r along the segment', () => {
  const a = [0, 0, 0], b = [40, 10, -5];
  for (const x of [[10, 20, 5], [50, 0, 0], [-5, -5, 3], [20, 5, -1.5]]) {
    let q = 0; const n = 20000;
    for (let i = 0; i < n; i++) { const s = (i + 0.5) / n; const y = a.map((v, j) => v + s * (b[j] - v)); q += 1 / Math.max(1e-9, Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])); }
    q *= Math.hypot(40, 10, -5) / n;
    near(segmentIntegral(x, a, b), q, 2e-3, `at ${x}`);
  }
});

const plate = () => plateDomain(30, 20, 4, () => 2.5);                 // 120 × 80 × 2.5 mm

test('a plate cooled by suggested serpentines: heat balance, coolant rise = heat/(ṁ cp), sensible temperatures', () => {
  const d = plate(); const resin = RESINS.abs;
  const ch = suggestChannels(d, { diameter: 8, flow: 6 });
  assert.equal(ch.length, 2);
  assert.ok(ch.every((c) => c.points.length >= 4), 'several passes each');
  const r = coolingStudy(d, resin, ch, { cycleTime: 25 });
  assert.equal(r.ok, true, r.error);
  near(r.heatChannels, r.heatPart, 1e-9, 'all the heat goes to the coolant');
  const mass = d.nodes.reduce((s, n) => s + n.V, 0) * resin.rhoSolid * 1e-9;
  near(r.heatPart, (mass * resin.cp * (resin.melt - resin.eject)) / 25, 1e-9, 'part heat per cycle');
  for (const c of r.channels) {
    const f = coolantFlow({ diameter: 8, flow: 6, temperature: 25 });
    near(c.rise, c.heat / (f.mdot * f.cp), 1e-9, 'coolant rise');
    assert.ok(c.heat > 0);
  }
  near(r.channels[0].heat, r.channels[1].heat, 0.02, 'the two halves take the same heat (symmetric layout)');
  assert.ok(r.summary.wallMin > 25 && r.summary.wallMax < resin.eject, `wall ${r.summary.wallMin}–${r.summary.wallMax} °C`);
  assert.ok(r.summary.coolTimeMax > 2 && r.summary.coolTimeMax < 60, `cooling ${r.summary.coolTimeMax} s`);
});

test('less coolant flow gives a warmer mould; a part far from its only channel gets a hot spot', () => {
  const d = plate(); const resin = RESINS.abs;
  const fast = coolingStudy(d, resin, suggestChannels(d, { diameter: 8, flow: 10 }), { cycleTime: 25 });
  const slow = coolingStudy(d, resin, suggestChannels(d, { diameter: 8, flow: 0.4 }), { cycleTime: 25 });
  assert.ok(slow.summary.wallMean > fast.summary.wallMean + 1, `${slow.summary.wallMean} vs ${fast.summary.wallMean}`);
  assert.ok(slow.warnings.some((w) => w.kind === 'not-turbulent'));
  const far = coolingStudy(d, resin, [{ points: [[-200, 40, 60], [-200, 40, -60]], diameter: 6, flow: 2, inlet: 25 }], { cycleTime: 10 });
  assert.equal(far.ok, true);
  assert.ok(far.summary.hotSpots > 0 && far.warnings.some((w) => w.kind === 'hot-spot'), 'heat cannot get out: wall above ejection');
});

test('one straight channel under the middle of the plate: the wall is coolest over it and symmetric about it', () => {
  const d = plate(); const resin = RESINS.abs;
  const r = coolingStudy(d, resin, [{ points: [[-20, 40, -17], [140, 40, -17]], diameter: 10, flow: 12, inlet: 20 }, { points: [[-20, 40, 19.5], [140, 40, 19.5]], diameter: 10, flow: 12, inlet: 20 }], { cycleTime: 40 });
  assert.equal(r.ok, true);
  const at = (x, y) => { let best = 0, bd = Infinity; d.nodes.forEach((n, i) => { const e = Math.hypot(n.c[0] - x, n.c[1] - y); if (e < bd) { bd = e; best = i; } }); return r.wall[best]; };
  assert.ok(at(60, 42) < at(60, 6) - 0.5, `over the channel ${at(60, 42)} vs the edge ${at(60, 6)}`);
  near(at(60, 6), at(60, 74), 0.01, 'mirror about the channel');
  assert.ok(r.warnings.every((w) => w.kind !== 'too-close'), 'axes 18.25 mm from the wall centre leave 12 mm of steel, more than one diameter');
  const close = coolingStudy(d, resin, [{ points: [[-20, 40, -4], [140, 40, -4]], diameter: 8, flow: 12, inlet: 20 }], { cycleTime: 40 });
  assert.ok(close.warnings.some((w) => w.kind === 'too-close'));
});

test('no channel or no part is an error, not a number', () => {
  assert.equal(coolingStudy(plate(), RESINS.abs, []).error, 'cooling-no-channel');
  assert.equal(coolingStudy({ nodes: [] }, RESINS.abs, [{ points: [[0, 0, 0], [1, 0, 0]], diameter: 8, flow: 1 }]).error, 'cooling-no-part');
});
