// The engine against results known from theory: M/M/1 and M/M/c queues
// (Little's law, utilization), exponential decay in system dynamics, and an
// SIR population that keeps its head count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createModel, makeBlock, addLink } from '../../src/sim/model.js';
import { runModel, resultValue, Simulation } from '../../src/sim/engine.js';

function line({ arrival = 1, service = 0.8, servers = 1, duration = 50000, queueCap = 0 } = {}) {
  const m = createModel('mm1');
  m.settings.duration = duration;
  m.settings.warmup = duration * 0.05;
  const src = makeBlock(m, 'source', 0, 0, { props: { interarrival: { type: 'exponential', mean: arrival } } }); m.blocks.push(src);
  const q = makeBlock(m, 'queue', 5, 0, { props: { capacity: queueCap } }); m.blocks.push(q);
  const p = makeBlock(m, 'process', 10, 0, { props: { capacity: servers, time: { type: 'exponential', mean: service } } }); m.blocks.push(p);
  const s = makeBlock(m, 'sink', 15, 0); m.blocks.push(s);
  addLink(m, { block: src.id, port: 0 }, { block: q.id, port: 0 });
  addLink(m, { block: q.id, port: 0 }, { block: p.id, port: 0 });
  addLink(m, { block: p.id, port: 0 }, { block: s.id, port: 0 });
  return { m, src, q, p, s };
}

test('M/M/1: utilization ρ = λ/μ and mean wait Wq = ρ/(μ−λ)', () => {
  const { m } = line({ arrival: 1, service: 0.8 });
  const { results } = runModel(m, { seed: 11 });
  const util = resultValue(results, 'Process1.utilization');
  const wq = resultValue(results, 'Queue1.waitTime');
  assert.ok(Math.abs(util - 0.8) < 0.03, `utilization ${util}`);
  assert.ok(Math.abs(wq - 3.2) < 0.6, `Wq ${wq}`);
  // Little's law: L = λW for the whole system.
  const k = results.kpi;
  assert.ok(Math.abs(k.wipMean - k.throughput * k.cycleMean) / k.wipMean < 0.08, `L ${k.wipMean} vs λW ${k.throughput * k.cycleMean}`);
});

test('M/M/2: two servers halve the load', () => {
  const { m } = line({ arrival: 1, service: 1.6, servers: 2 });
  const { results } = runModel(m, { seed: 3 });
  assert.ok(Math.abs(resultValue(results, 'Process1.utilization') - 0.8) < 0.04);
});

test('a full finite queue blocks the source (back-pressure) and nothing is lost when it waits', () => {
  const { m } = line({ arrival: 0.5, service: 1, duration: 2000, queueCap: 3 });
  const { results } = runModel(m, { seed: 5 });
  assert.ok(results.blocks.Source1.waiting > 0 || results.blocks.Queue1.lengthMax === 3);
  assert.equal(results.kpi.lost, 0);
  assert.ok(results.blocks.Queue1.lengthMax <= 3);
});

test('system dynamics: dS/dt = −kS matches S0·e^(−kt) (RK4)', () => {
  const m = createModel('decay');
  m.settings.duration = 10; m.settings.sdDt = 0.05; m.settings.sdMethod = 'rk4';
  const stock = makeBlock(m, 'stock', 0, 0, { name: 'S', props: { initial: '100' } }); m.blocks.push(stock);
  const flow = makeBlock(m, 'flow', 5, 0, { name: 'Out', props: { equation: 'k * S' } }); m.blocks.push(flow);
  const k = makeBlock(m, 'parameter', 5, 5, { name: 'k', props: { value: 0.3 } }); m.blocks.push(k);
  addLink(m, { block: stock.id, port: 0 }, { block: flow.id, port: 0 });
  const { results } = runModel(m, { seed: 1 });
  const expected = 100 * Math.exp(-0.3 * 10);
  assert.ok(Math.abs(results.sd.S.value - expected) < 0.01, `${results.sd.S.value} vs ${expected}`);
});

test('agents: an SIR epidemic keeps every agent and moves people from S to R', () => {
  const m = createModel('sir');
  m.settings.duration = 60; m.settings.agentDt = 0.25;
  const pop = makeBlock(m, 'population', 0, 0, { name: 'People', props: { count: 300 } }); m.blocks.push(pop);
  const sim = new Simulation(m, { seed: 2 });
  sim.runUntil(60);
  const r = sim.results().blocks.People.states;
  assert.equal(r.Susceptible.now + r.Infected.now + r.Recovered.now, 300);
  assert.ok(r.Recovered.now > 20, `recovered ${r.Recovered.now}`);
});

test('the same seed gives the same run', () => {
  const a = runModel(line({ duration: 500 }).m, { seed: 9 }).results;
  const b = runModel(line({ duration: 500 }).m, { seed: 9 }).results;
  assert.equal(a.kpi.completed, b.kpi.completed);
  assert.equal(a.kpi.cycleMean, b.kpi.cycleMean);
});
