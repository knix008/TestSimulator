// The quality gate tells the current state (whole code, issue states as they
// are now, conditions that can be turned off), check groups in the settings,
// and deleting a project's results to analyze again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createApi } = require('../core/api.js');
const { DEFAULT_GATE, NEW_CODE_CONDITIONS, evaluateGate, upgradeGates, currentMeasures } = require('../core/qualitygate.js');
const { groupOf, listChecks } = require('../core/checks.js');

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const DEMO = path.resolve('samples/demo');

test('an untouched old built-in gate becomes the current-state default; an edited one stays', () => {
  const old = { id: 'checker-way', name: 'Checker way', isDefault: true, conditions: NEW_CODE_CONDITIONS.map((c) => ({ ...c })) };
  const [up] = upgradeGates([old]);
  assert.deepEqual(up.conditions.map((c) => c.metric), DEFAULT_GATE.conditions.map((c) => c.metric));
  assert.ok(up.conditions.every((c) => c.on === 'overall'));
  const edited = { ...old, conditions: [{ ...old.conditions[0], threshold: 5 }, ...old.conditions.slice(1)] };
  assert.equal(upgradeGates([edited])[0], edited);
});

test('a condition that is off is shown as OFF and never fails the gate', () => {
  const gate = { conditions: [{ id: 'a', metric: 'bugs', op: 'GT', threshold: 0, enabled: false }, { id: 'b', metric: 'vulnerabilities', op: 'GT', threshold: 0 }] };
  const r = evaluateGate(gate, { bugs: 9, vulnerabilities: 0 });
  assert.equal(r.status, 'OK');
  assert.deepEqual(r.conditions.map((c) => c.status), ['OFF', 'OK']);
});

test('a re-analysis without changes still fails on the problems the code has now', async () => {
  const api = createApi({ configDir: tmp('mcc-gate-') });
  const first = await api.call('project.scan', { path: DEMO });
  const second = await api.call('project.scan', { path: DEMO });
  assert.equal(second.analysis.measures.new_bugs, 0, 'nothing changed');
  assert.ok(second.analysis.measures.bugs > 0);
  assert.equal(second.analysis.qualityGate.status, 'ERROR');
  assert.equal(second.analysis.qualityGate.conditions.find((c) => c.metric === 'bugs').status, 'ERROR');
  assert.equal(first.analysis.qualityGate.status, 'ERROR');
});

test('triage and gate changes are judged at once, without a new analysis', async () => {
  const api = createApi({ configDir: tmp('mcc-gate-now-') });
  const r = await api.call('project.scan', { path: DEMO });
  // Only the bugs condition stays on.
  let ws = await api.call('workspace.load', {});
  const gates = ws.gates.map((g) => ({ ...g, conditions: g.conditions.map((c) => ({ ...c, enabled: c.metric === 'bugs' })) }));
  ws = await api.call('workspace.save', { workspace: { gates } });
  let latest = ws.projects[0].branches.main.latest;
  assert.equal(latest.qualityGate.conditions.filter((c) => c.status === 'OFF').length, gates[0].conditions.length - 1);
  assert.equal(latest.qualityGate.status, 'ERROR');
  // Every bug marked a false positive: the gate passes now.
  const bugs = r.analysis.issues.filter((i) => i.type === 'BUG').map((i) => i.key);
  await api.call('issue.update', { projectId: r.project.id, keys: bugs, patch: { status: 'RESOLVED', resolution: 'FALSE-POSITIVE' } });
  ws = await api.call('workspace.load', {});
  latest = ws.projects[0].branches.main.latest;
  assert.equal(latest.measures.bugs, 0);
  assert.equal(latest.qualityGate.status, 'OK');
  assert.equal(currentMeasures(latest).bugs, 0);
});

test('check groups that are off are not reported', async () => {
  assert.ok(listChecks().some((g) => g.id === 'misraC2004'));
  assert.equal(groupOf({ engine: 'misra-legacy', rule: 'misra-c2004:8.1' }), 'misraC2004');
  assert.equal(groupOf({ engine: 'misra-legacy', rule: 'misra-cpp2008:5-0-1' }), 'misraCpp2008');
  assert.equal(groupOf({ rule: 'defect:NULL_RETURNS' }), 'defects');
  assert.equal(groupOf({ rule: 'js:eval' }), 'quality');
  const api = createApi({ configDir: tmp('mcc-checks-') });
  const all = await api.call('project.scan', { path: DEMO });
  const groups = new Set(all.analysis.issues.map(groupOf));
  assert.ok(groups.has('quality'));
  const ws = await api.call('workspace.load', {});
  await api.call('workspace.save', { workspace: { settings: { ...ws.settings, checks: { quality: false, semantic: false } } } });
  const some = await api.call('project.scan', { path: DEMO });
  assert.ok(some.analysis.issues.length < all.analysis.issues.length);
  assert.ok(some.analysis.issues.every((i) => !['quality', 'semantic'].includes(groupOf(i))));
});

test('project.resetAnalysis deletes the results; the next analysis treats all code as new', async () => {
  const api = createApi({ configDir: tmp('mcc-reset-') });
  const r = await api.call('project.scan', { path: DEMO });
  await api.call('project.scan', { path: DEMO });
  const key = r.analysis.issues[0].key;
  await api.call('issue.update', { projectId: r.project.id, keys: [key], patch: { status: 'CONFIRMED' } });
  let ws = await api.call('project.resetAnalysis', { projectId: r.project.id });
  assert.deepEqual(ws.projects[0].branches, {});
  assert.ok(ws.projects[0].issueState[key], 'issue states kept');
  assert.equal(ws.reset.branches, 1);
  const again = await api.call('project.scan', { path: DEMO });
  assert.equal(again.analysis.hasBaseline, false);
  assert.ok(again.analysis.issues.every((i) => i.isNew));
  assert.equal(again.analysis.issues.find((i) => i.key === key).status, 'CONFIRMED');
  ws = await api.call('project.resetAnalysis', { projectId: r.project.id, clearTriage: true });
  assert.deepEqual(ws.projects[0].issueState, {});
  await assert.rejects(api.call('project.resetAnalysis', { projectId: 'none' }), (e) => e.code === 'NOT_FOUND');
});
