// BPMN simulation (src/domain/bpmnsim.js): tokens along sequence flows, gateways, joins, analysis.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as M from '../../src/domain/model.js';
import * as E from '../../src/domain/edit.js';
import { toolById } from '../../src/domain/toolbox.js';
import { buildTemplate } from '../../src/domain/templates.js';
import * as S from '../../src/domain/bpmnsim.js';

/** A BPMN diagram from a list of nodes [key, toolId] and flows [from, to, attrs]. */
function process(nodes, flows) {
  const project = M.createProject({ name: 'P', language: 'en', diagram: null });
  const diagram = M.addDiagram(project, project.ownedElements[0]._id, 'BPMNDiagram', { language: 'en' });
  const views = {};
  nodes.forEach(([key, toolId], i) => {
    const tool = toolById('BPMNDiagram', toolId);
    assert.ok(tool, toolId);
    views[key] = E.createNode(project, diagram, { ...tool, attrs: { ...tool.attrs, name: key } }, { x: i * 140, y: 100, w: 0, h: 0 }, { language: 'en' }).view;
  });
  const edges = {};
  for (const [a, b, attrs = {}] of flows) {
    const tool = toolById('BPMNDiagram', 'BPMNSequenceFlow');
    edges[`${a}>${b}`] = E.createEdge(project, diagram, { ...tool, attrs: { ...tool.attrs, ...attrs } }, views[a], views[b], { language: 'en' }).view;
  }
  return { graph: S.simulationGraph(project, diagram), views, edges };
}

test('a straight process completes; every element and flow is used', () => {
  const { graph, views } = process([['s', 'BPMNStartEvent'], ['a', 'BPMNTask'], ['e', 'BPMNEndEvent']], [['s', 'a'], ['a', 'e']]);
  assert.equal(graph.nodes.size, 3);
  const sim = S.createSimulation(graph);
  assert.equal(sim.tokens.length, 1);
  const first = S.stepSimulation(sim);
  assert.deepEqual(first.map((m) => [m.from, m.to]), [[views.s._id, views.a._id]]);
  const done = S.runSimulation(graph);
  assert.equal(done.status, 'completed');
  assert.equal(done.completed, 1);
  const report = S.analyseSimulation(graph, { runs: 10 });
  assert.equal(report.completed, 10);
  assert.deepEqual(report.unreached, []);
  assert.deepEqual(report.unusedFlows, []);
});

test('exclusive gateway: one path per run, both paths over many runs; the same seed repeats a run', () => {
  const { graph, views } = process(
    [['s', 'BPMNStartEvent'], ['g', 'BPMNExclusiveGateway'], ['a', 'BPMNTask'], ['b', 'BPMNTask'], ['e', 'BPMNEndEvent']],
    [['s', 'g'], ['g', 'a'], ['g', 'b'], ['a', 'e'], ['b', 'e']],
  );
  for (let seed = 1; seed <= 20; seed++) {
    const sim = S.runSimulation(graph, { seed });
    assert.equal(sim.status, 'completed');
    assert.equal((sim.visits.get(views.a._id) ?? 0) + (sim.visits.get(views.b._id) ?? 0), 1, 'exactly one branch');
  }
  const report = S.analyseSimulation(graph, { runs: 50 });
  assert.ok(report.nodeRuns.get(views.a._id) > 5 && report.nodeRuns.get(views.b._id) > 5, 'both branches are taken');
  const once = (seed) => [...S.runSimulation(graph, { seed }).visits.keys()].join();
  assert.equal(once(7), once(7));
});

test('parallel split and join: both branches run and the join fires once', () => {
  const { graph, views } = process(
    [['s', 'BPMNStartEvent'], ['fork', 'BPMNParallelGateway'], ['a', 'BPMNTask'], ['b', 'BPMNTask'], ['b2', 'BPMNTask'], ['join', 'BPMNParallelGateway'], ['e', 'BPMNEndEvent']],
    [['s', 'fork'], ['fork', 'a'], ['fork', 'b'], ['b', 'b2'], ['a', 'join'], ['b2', 'join'], ['join', 'e']],
  );
  const sim = S.runSimulation(graph);
  assert.equal(sim.status, 'completed');
  assert.equal(sim.visits.get(views.a._id), 1);
  assert.equal(sim.visits.get(views.b2._id), 1);
  assert.equal(sim.completed, 1, 'one token reaches the end after the join');
});

test('a parallel join after an exclusive split never fires: deadlock, and where', () => {
  const { graph, views } = process(
    [['s', 'BPMNStartEvent'], ['g', 'BPMNExclusiveGateway'], ['a', 'BPMNTask'], ['b', 'BPMNTask'], ['join', 'BPMNParallelGateway'], ['e', 'BPMNEndEvent']],
    [['s', 'g'], ['g', 'a'], ['g', 'b'], ['a', 'join'], ['b', 'join'], ['join', 'e']],
  );
  const sim = S.runSimulation(graph);
  assert.equal(sim.status, 'deadlock');
  assert.deepEqual(sim.stuckAt, [views.join._id]);
  const report = S.analyseSimulation(graph, { runs: 20 });
  assert.equal(report.deadlock, 20);
  assert.deepEqual(report.unreached, [views.e._id], 'the end is never reached');
});

test('inclusive split and join; a loop without an exit stops at the step limit; no start event', () => {
  const inc = process(
    [['s', 'BPMNStartEvent'], ['fork', 'BPMNInclusiveGateway'], ['a', 'BPMNTask'], ['b', 'BPMNTask'], ['join', 'BPMNInclusiveGateway'], ['e', 'BPMNEndEvent']],
    [['s', 'fork'], ['fork', 'a'], ['fork', 'b'], ['a', 'join'], ['b', 'join'], ['join', 'e']],
  );
  const report = S.analyseSimulation(inc.graph, { runs: 40 });
  assert.equal(report.completed, 40, 'the inclusive join always fires');
  for (let seed = 1; seed <= 10; seed++) assert.equal(S.runSimulation(inc.graph, { seed }).completed, 1, 'one token at the end');
  const loop = process([['s', 'BPMNStartEvent'], ['a', 'BPMNTask'], ['b', 'BPMNTask']], [['s', 'a'], ['a', 'b'], ['b', 'a']]);
  assert.equal(S.runSimulation(loop.graph, { maxSteps: 30 }).status, 'limit');
  const none = process([['a', 'BPMNTask']], []);
  assert.equal(S.createSimulation(none.graph).status, 'noStart');
});

test('the BPMN template simulates to the end', () => {
  const project = buildTemplate('bpmn', { language: 'en' });
  const diagram = M.allDiagrams(project).find((d) => d._type === 'BPMNDiagram');
  const report = S.analyseSimulation(S.simulationGraph(project, diagram), { runs: 30 });
  assert.equal(report.completed, 30);
  assert.deepEqual(report.unreached, []);
});
