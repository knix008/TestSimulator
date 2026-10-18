// The Problems panel's rows: where each problem is (qualified path, type, the
// diagrams and views that show it, a drawn owner for columns), the sort order,
// the severity / current-diagram / text filters, groups, counts and badges.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as M from '../../src/domain/model.js';
import { buildSample } from '../../src/domain/templates.js';
import { validate } from '../../src/domain/validate.js';
import { countProblems, filterProblems, groupProblems, problemRows, problemsByView, sortProblems, viewsByModel } from '../../src/domain/problems.js';

/** The sample with three mistakes: a class renamed to a twin, an ERD key removed, a column twice. */
function brokenSample() {
  const project = buildSample('en');
  let index = M.buildIndex(project);
  const classes = M.elementsWhere(project, (e) => e._type === 'UMLClass' && M.viewsEverywhere(project, e._id).length);
  const [first, second] = classes.filter((c) => index.parent(c._id) === index.parent(classes[0]._id));
  second.name = first.name;
  const entity = M.elementsWhere(project, (e) => e._type === 'ERDEntity' && e.name === 'customer')[0];
  entity.columns.find((c) => c.primaryKey).primaryKey = false;
  M.insertElement(entity, M.createElement('ERDColumn', { name: 'name', type: 'VARCHAR' }));
  index = M.buildIndex(project);
  return { project, index, twin: second, entity };
}

test('rows say where to fix each problem', () => {
  const { project, index, twin, entity } = brokenSample();
  const rows = problemRows(project, validate(project), { index });
  const dup = rows.find((r) => r.rule === 'name-duplicate');
  assert.equal(dup.id, twin._id);
  assert.equal(dup.type, 'UMLClass');
  assert.equal(dup.path, M.qualifiedName(project, twin._id, index));
  assert.ok(dup.path.includes('::'), 'qualified with its packages');
  assert.ok(dup.diagrams.length >= 1 && dup.diagrams[0].viewId, 'a diagram and the view to select');
  assert.equal(dup.target, twin._id);
  assert.ok(!dup.detail.en.includes(twin.name), 'the detail leaves the element out (it has its own column)');
  const pk = rows.find((r) => r.rule === 'entity-no-primary-key');
  assert.equal(pk.id, entity._id);
  const column = rows.find((r) => r.rule === 'column-name-duplicate');
  assert.equal(column.type, 'ERDColumn');
  assert.equal(column.target, entity._id, 'a column is shown by its entity');
  assert.deepEqual(column.diagrams.map((d) => d.viewId), pk.diagrams.map((d) => d.viewId));
  assert.ok(column.path.endsWith('customer::name'));
});

test('a diagram problem points at the diagram; a problem on nothing has no place', () => {
  const project = M.createProject({ diagram: null });
  const d = M.addDiagram(project, project.ownedElements[0]._id, 'UMLClassDiagram', { name: 'Blank' });
  const index = M.buildIndex(project);
  const [row] = problemRows(project, validate(project), { index });
  assert.equal(row.rule, 'diagram-empty');
  assert.deepEqual(row.diagrams, [{ id: d._id, name: 'Blank', viewId: null }]);
  const [none] = problemRows(project, [{ rule: 'x', severity: 'warning', id: null, message: { ko: 'a', en: 'a' } }], { index });
  assert.deepEqual([none.target, none.diagrams, none.path], [null, [], '']);
});

const row = (key, severity, path, diagrams = [], extra = {}) => ({ key, rule: 'r', severity, id: key, type: 'UMLClass', name: path.split('::').at(-1), path, message: { ko: `${key} 메시지`, en: `${key} message` }, detail: { ko: key, en: key }, target: key, diagrams, ...extra });
const ROWS = [
  row('w1', 'warning', 'Model::B', [{ id: 'd1', name: 'Main', viewId: 'v1' }]),
  row('e1', 'error', 'Model::C', [{ id: 'd2', name: 'Other', viewId: 'v2' }]),
  row('w2', 'warning', 'Model::A', [{ id: 'd1', name: 'Main', viewId: 'v3' }, { id: 'd2', name: 'Other', viewId: 'v4' }]),
  row('e2', 'error', 'Model::A', [{ id: 'd1', name: 'Main', viewId: 'v3' }]),
  row('e3', 'error', '', []),
];

test('sort: errors first, then by path (no path last)', () => {
  assert.deepEqual(sortProblems(ROWS).map((r) => r.key), ['e2', 'e1', 'e3', 'w2', 'w1']);
});

test('filters: severity, current diagram, text', () => {
  const keys = (rows) => rows.map((r) => r.key).sort();
  assert.deepEqual(keys(filterProblems(ROWS)), ['e1', 'e2', 'e3', 'w1', 'w2']);
  assert.deepEqual(keys(filterProblems(ROWS, { severity: 'error' })), ['e1', 'e2', 'e3']);
  assert.deepEqual(keys(filterProblems(ROWS, { severity: 'warning' })), ['w1', 'w2']);
  assert.deepEqual(keys(filterProblems(ROWS, { diagramId: 'd1' })), ['e2', 'w1', 'w2']);
  assert.deepEqual(keys(filterProblems(ROWS, { diagramId: 'd2', severity: 'warning' })), ['w2']);
  assert.deepEqual(keys(filterProblems(ROWS, { query: 'model::a' })), ['e2', 'w2'], 'path, any case');
  assert.deepEqual(keys(filterProblems(ROWS, { query: 'other  e1' })), ['e1'], 'every word: a diagram name and the message');
  assert.deepEqual(keys(filterProblems(ROWS, { query: '메시지 w1' })), ['w1'], 'the Korean message too');
  assert.deepEqual(keys(filterProblems(ROWS, { query: 'class', language: 'en' })), ['e1', 'e2', 'e3', 'w1', 'w2'], 'the type label');
  assert.deepEqual(filterProblems(ROWS, { query: 'nothing-like-this' }), []);
});

test('groups, counts and badges', () => {
  const groups = groupProblems(ROWS);
  assert.deepEqual(groups.map((g) => [g.severity, g.rows.map((r) => r.key)]), [['error', ['e2', 'e1', 'e3']], ['warning', ['w2', 'w1']]]);
  assert.deepEqual(groupProblems(ROWS.filter((r) => r.severity === 'warning')).map((g) => g.severity), ['warning']);
  assert.deepEqual(countProblems(ROWS), { error: 3, warning: 2, total: 5 });
  const badges = problemsByView(ROWS, 'd1');
  assert.deepEqual([...badges.keys()].sort(), ['v1', 'v3']);
  assert.equal(badges.get('v3').severity, 'error', 'the worst severity of the view');
  assert.deepEqual(badges.get('v3').rows.map((r) => r.key).sort(), ['e2', 'w2']);
  assert.equal(badges.get('v1').severity, 'warning');
  assert.equal(problemsByView(ROWS, null).size, 0);
});

test('views by model: one pass over the diagrams', () => {
  const project = buildSample('en');
  const map = viewsByModel(project);
  const [some] = map.keys();
  assert.deepEqual(map.get(some).map((v) => v.viewId).sort(), M.viewsEverywhere(project, some).map((x) => x.view._id).sort());
});

test('keys stay the same between checks; a double-click goes to the field of the rule', async () => {
  const { problemField } = await import('../../src/domain/problems.js');
  const { project, index } = brokenSample();
  const a = problemRows(project, validate(project), { index }).map((r) => r.key);
  const b = problemRows(project, validate(project), { index }).map((r) => r.key);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length, 'unique');
  const twice = problemRows(project, [{ rule: 'r', severity: 'error', id: null, message: {} }, { rule: 'r', severity: 'error', id: null, message: {} }], { index });
  assert.deepEqual(twice.map((r) => r.key), ['r:-', 'r:-#1']);
  assert.equal(problemField('column-type-missing'), 'type');
  assert.equal(problemField('multiplicity-invalid'), 'multiplicity');
  assert.equal(problemField('name-duplicate'), 'name');
  assert.equal(problemField('anything-else'), 'name');
});
