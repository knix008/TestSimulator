// Runners and multi-cavity / family moulds (cad/plastics-runner.js): the layout, the runner's volume, a balanced
// two-cavity mould filling both cavities together, a thinner runner needing more pressure, a family mould (a large
// and a small plate) out of balance until the branches are resized.
import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutCavities, mouldDomain, multiCavityStudy, balanceRunners } from '../../src/cad/plastics-runner.js';
import { boxMesh } from './fem-shapes.js';

const plate = (L, W, H) => boxMesh(L, W, H, 2);
const PROCESS = { resin: 'abs', fillTime: 1, maxPressure: 400 };

test('layout: cavities alternate on both sides of the runner line, clear of it, tops at the parting plane', () => {
  const cav = [{ mesh: plate(40, 20, 2) }, { mesh: plate(40, 20, 2) }, { mesh: plate(30, 10, 2) }, { mesh: plate(30, 10, 2) }];
  const off = layoutCavities(cav, { gap: 8 });
  assert.equal(off[0][1], 8); assert.equal(off[1][1], -8 - 20);
  assert.ok(off.every((o) => o[2] === -2));
  // Columns side by side without overlap, centred on the sprue.
  const x0 = [off[0][0], off[0][0] + 40], x1 = [off[2][0], off[2][0] + 30];
  assert.ok(x1[0] >= x0[1] + 8 - 1e-9);
  assert.ok(Math.abs((x0[0] + x1[1]) / 2) < 1e-9);
});

test('mould graph: each cavity joins the runner at its gate; runner volume π r² × length', () => {
  const cav = [{ mesh: plate(40, 20, 2), gate: [20, 0, 1] }, { mesh: plate(40, 20, 2), gate: [20, 20, 1] }];
  const off = layoutCavities(cav, { gap: 10 });
  const md = mouldDomain(cav.map((c, i) => ({ ...c, offset: off[i] })), { diameter: 6 }, { cells: 20 });
  assert.equal(md.cavities.length, 2);
  // Two branches of 10 mm (gates on the cavities' edges next to the runner), no primary length (both at x = 0).
  near(md.runner.length, 20, 0.15, 'runner length');
  near(md.runner.volume, Math.PI * 9 * md.runner.length, 0.25, 'runner volume');
  // Connected: every node reachable from the sprue.
  const seen = new Uint8Array(md.domain.nodes.length), q = [md.sprue]; seen[md.sprue] = 1;
  for (let k = 0; k < q.length; k++) for (const e of md.domain.adj[q[k]]) { const [a, b] = md.domain.edges[e]; const j = a === q[k] ? b : a; if (!seen[j]) { seen[j] = 1; q.push(j); } }
  assert.equal(q.length, md.domain.nodes.length);
});

function near(a, b, rel, what) { assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${what}: ${a} vs ${b}`); }

test('two identical cavities, symmetric runner: both fill, together', () => {
  const cav = [{ mesh: plate(40, 20, 2), gate: [20, 0, 1], name: 'A' }, { mesh: plate(40, 20, 2), gate: [20, 20, 1], name: 'B' }];
  const s = multiCavityStudy({ cavities: cav, runner: { diameter: 5 }, process: PROCESS, domain: { cells: 20 } });
  assert.ok(s.ok && !s.shortShot, JSON.stringify(s.cavities));
  assert.ok(s.imbalance < 0.03, `imbalance ${s.imbalance}`);
  assert.ok(s.runnerShare > 0 && s.runnerShare < 0.5);
  // A thinner runner needs more pressure for the same fill.
  const thin = multiCavityStudy({ cavities: cav, runner: { diameter: 2.5 }, process: PROCESS, domain: { cells: 20 } });
  assert.ok(thin.spruePressure > 1.5 * s.spruePressure, `${thin.spruePressure} vs ${s.spruePressure}`);
});

test('a family mould (a large and a small plate) fills out of balance; balancing widens the large one’s branch', () => {
  const cav = [{ mesh: plate(60, 30, 2), gate: [30, 0, 1], name: 'large' }, { mesh: plate(20, 10, 2), gate: [10, 10, 1], name: 'small' }];
  const input = { cavities: cav, runner: { diameter: 4 }, process: PROCESS, domain: { cells: 20 } };
  const raw = multiCavityStudy(input);
  assert.ok(raw.ok);
  assert.ok(raw.imbalance > 0.15, `raw imbalance ${raw.imbalance}`);
  // The small cavity fills first.
  assert.ok(raw.cavities[1].fillTime < raw.cavities[0].fillTime);
  const bal = balanceRunners(input, { target: 0.05, maxIterations: 10 });
  assert.ok(bal.imbalance < 0.05 || bal.imbalance < 0.5 * raw.imbalance, `balanced ${bal.history.map((v) => v.toFixed(3)).join(' ')}`);
  assert.ok(bal.branches[0] > bal.branches[1], `branches ${bal.branches}`);
  assert.ok(bal.history.length >= 2 && bal.history.at(-1) < bal.history[0]);
});
