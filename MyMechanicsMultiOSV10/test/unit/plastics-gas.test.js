// Gas-assisted injection and insert moulding (cad/plastics-gas.js): the gas runs down the thick rib only, hollows
// it to the skins and lets an 85 % shot fill the part; a cold insert freezes the melt by it (higher pressure) where
// a preheated one does not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { plateDomain, fillSimulation } from '../../src/cad/plastics.js';
import { gasAssistStudy, insertWallTemp } from '../../src/cad/plastics-gas.js';

// A 100 × 40 plate, 2 mm thick, with a 6 mm thick channel 6 mm wide along its middle (y 17…23), cells of 2 mm.
const ribbed = () => plateDomain(50, 20, 2, (x, y) => (y > 17 && y < 23 ? 6 : 2));
const gateAt = (d, x, y) => d.nodes.reduce((b, n, i) => (Math.hypot(n.c[0] - x, n.c[1] - y) < Math.hypot(d.nodes[b].c[0] - x, d.nodes[b].c[1] - y) ? i : b), 0);

test('gas assist: the gas follows the thick channel only, hollows it to the skins, and an 85 % shot fills the part', () => {
  const d = ribbed();
  const gate = gateAt(d, 1, 20);
  const r = gasAssistStudy(d, { gates: [gate], process: { resin: 'abs', fillTime: 1, maxPressure: 400 }, gas: { node: gate, shot: 0.85, skin: 0.2 } });
  assert.ok(r.ok);
  const s = r.summary;
  assert.ok(s.complete && !s.shortShot && !s.blowThrough, JSON.stringify(s));
  assert.ok(Math.abs(s.gasVolume - 0.15) < 0.02, `gas ${s.gasVolume}`);
  for (let i = 0; i < d.nodes.length; i++) if (r.gas[i]) {
    assert.equal(d.nodes[i].h, 6, 'only the channel');
    assert.ok(Math.abs(r.residualWall[i] - 1.2) < 0.6, `wall ${r.residualWall[i]}`);
  }
  assert.ok(s.penetration > 20 && s.penetration < 100, `reach ${s.penetration}`);
  // A smaller shot needs more gas than the channel can give: a short shot.
  const small = gasAssistStudy(d, { gates: [gate], process: { resin: 'abs', fillTime: 1, maxPressure: 400 }, gas: { node: gate, shot: 0.6 } });
  assert.ok(small.summary.shortShot || small.summary.blowThrough, JSON.stringify(small.summary));
});

test('insert moulding: a cold insert by the flow path needs more pressure than a preheated one', () => {
  const d = plateDomain(50, 20, 2, () => 2);
  const gate = gateAt(d, 1, 20);
  // The insert: a 20 × 20 block's face in the middle of the plate.
  const pts = []; for (let x = 40; x <= 60; x += 2) for (let y = 10; y <= 30; y += 2) pts.push([x, y, 1]);
  const cold = insertWallTemp(d, [{ points: pts, temperature: 20 }], { mould: 50 });
  const hot = insertWallTemp(d, [{ points: pts, temperature: 200 }], { mould: 50 });
  assert.ok(cold.nodes > 50 && cold.nodes === hot.nodes);
  const P = (w) => fillSimulation(d, { gates: [gate], resin: 'abs', fillTime: 1.5, maxPressure: 400, wallTemp: w.wallTemp }).summary.gatePressure;
  const pc = P(cold), ph = P(hot);
  assert.ok(pc > ph * 1.02, `cold ${pc} MPa, hot ${ph} MPa`);
});
