// Baselines and model comparison: snapshots kept in the .myuml file, the
// diff between a baseline (or another file) and the current model, restoring
// elements from a baseline, and StarUML export without baselines.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { addBaseline, baselineAsProject, baselineRoot, compareWithBaseline, createBaseline, exportBaselineText, findBaseline, listBaselines, removeBaseline, restoreElement } from '../../src/domain/baseline.js';
import { compareModels, diffTree } from '../../src/domain/diff.js';
import { parseProject, serialize } from '../../src/domain/format.js';
import { exportMdj, importMdj } from '../../src/domain/interop/staruml.js';
import * as M from '../../src/domain/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sample = () => parseProject(fs.readFileSync(path.join(root, 'samples', 'online-shop.en.myuml'), 'utf8')).project;
const find = (project, test) => { let found = null; M.walk(project, (e) => { if (!found && test(e)) found = e; }); return found; };
const byName = (project, type, name) => find(project, (e) => e._type === type && e.name === name);

test('create, list, save / load and delete baselines', () => {
  const project = sample();
  const baseline = addBaseline(project, createBaseline(project, { name: 'Release 1', note: 'before review', date: new Date('2026-10-01T09:00:00Z') }));
  assert.equal(baseline.name, 'Release 1');
  assert.equal(baseline.date, '2026-10-01T09:00:00.000Z');
  assert.equal(baseline.scopeId, '');
  assert.equal(baselineRoot(baseline)._id, project._id);
  assert.equal(baselineRoot(baseline).baselines, undefined, 'a baseline never holds baselines');
  // A package baseline.
  const pkg = find(project, (e) => e._type === 'UMLModel' || e._type === 'UMLPackage');
  addBaseline(project, createBaseline(project, { name: 'Package', scopeId: pkg._id }));
  assert.deepEqual(listBaselines(project).map((b) => [b.name, b.scopeName]), [['Release 1', project.name], ['Package', pkg.name]]);
  assert.ok(!('snapshot' in listBaselines(project)[0]));
  // The snapshot is not part of the live model: no element is found twice.
  const ids = [];
  M.walk(project, (e) => ids.push(e._id), { views: true });
  assert.equal(new Set(ids).size, ids.length);
  // Round trip through the .myuml text.
  const loaded = parseProject(serialize(project)).project;
  assert.equal(loaded.baselines.length, 2);
  assert.equal(findBaseline(loaded, baseline._id).note, 'before review');
  assert.deepEqual(compareWithBaseline(loaded, findBaseline(loaded, baseline._id)).summary, { added: 0, removed: 0, changed: 0, total: 0 });
  // Old files (no baselines) and broken entries load.
  const plain = sample();
  assert.equal(parseProject(serialize(plain)).project.baselines, undefined);
  plain.baselines = [{ name: 'broken' }, 'x'];
  assert.equal(parseProject(serialize(plain)).project.baselines, undefined);
  assert.ok(removeBaseline(loaded, baseline._id));
  assert.deepEqual(listBaselines(loaded).map((b) => b.name), ['Package']);
  // Exported as its own project file.
  const exported = parseProject(exportBaselineText(findBaseline(loaded, listBaselines(loaded)[0]._id))).project;
  assert.equal(exported.ownedElements[0]._id, pkg._id);
  assert.equal(baselineAsProject(baseline)._type, 'Project');
});

test('compareModels: added, removed, renamed, changed attributes, relations and diagrams', () => {
  const before = sample();
  const after = sample();
  const customer = byName(after, 'UMLClass', 'Customer');
  const order = byName(after, 'UMLClass', 'Order');
  // Rename a class, change an attribute's type, remove an attribute, add one.
  customer.name = 'Client';
  customer.documentation = 'Buys things.';
  const [first, second] = customer.attributes;
  first.multiplicity = '0..1';
  first.type = M.ref(order);
  const removedAttr = second;
  customer.attributes.splice(1, 1);
  const added = M.createElement('UMLAttribute', { name: 'loyaltyPoints', type: 'Integer' });
  M.insertElement(customer, added);
  // Remove a class (with its relationships and views).
  const victim = find(after, (e) => e._type === 'UMLClass' && e !== customer && e !== order && M.relationshipsOf(after, e._id).length);
  const victimRelations = M.relationshipsOf(after, victim._id).map((r) => r._id);
  M.removeElements(after, [victim._id]);
  // Change an association end.
  const association = find(after, (e) => e._type === 'UMLAssociation');
  association.end2.multiplicity = '42';
  // Move a view on a diagram.
  const diagram = M.allDiagrams(after).find((d) => d._type === 'UMLClassDiagram');
  const view = diagram.ownedViews.find((v) => v.left !== undefined && M.refId(v.model));
  view.left += 50;

  const diff = compareModels(before, after, { language: 'en' });
  const item = (id) => diff.items.find((x) => x.id === id);
  const c = item(customer._id);
  assert.equal(c.status, 'changed');
  assert.equal(c.category, 'element');
  assert.ok(c.renamed);
  assert.equal(c.oldName, 'Customer');
  assert.deepEqual(c.changes.find((x) => x.field === 'name'), { field: 'name', before: 'Customer', after: 'Client' });
  assert.ok(c.changes.some((x) => x.field === 'documentation' && x.after === 'Buys things.'));
  const a1 = item(first._id);
  assert.equal(a1.category, 'feature');
  assert.ok(a1.changes.some((x) => x.field === 'multiplicity' && x.after === '0..1'));
  assert.ok(a1.changes.some((x) => x.field === 'type' && x.after === 'Order'));
  assert.equal(item(removedAttr._id).status, 'removed');
  assert.equal(item(added._id).status, 'added');
  assert.equal(item(victim._id).status, 'removed');
  // Relationships go with it: listed on their own unless the removed class owned them.
  const ownedByVictim = new Set((victim.ownedElements ?? []).map((e) => e._id));
  for (const id of victimRelations) if (!ownedByVictim.has(id)) assert.deepEqual([item(id)?.status, item(id)?.category], ['removed', 'relationship']);
  assert.ok(victimRelations.some((id) => !ownedByVictim.has(id)), 'a relationship owned elsewhere');
  const assoc = item(association._id);
  assert.ok(assoc.changes.some((x) => x.field === 'end2.multiplicity' && x.after === '42'));
  const dg = item(diagram._id);
  assert.equal(dg.category, 'diagram');
  assert.ok(dg.changes.some((x) => x.field === 'views.moved'));
  assert.ok(dg.changes.some((x) => x.field === 'views.removed' && x.before.includes(victim.name)));
  assert.equal(diff.summary.total, diff.items.length);
  assert.ok(diff.summary.added >= 1 && diff.summary.removed >= 2 && diff.summary.changed >= 3);
  // Children of a removed element are not listed again.
  for (const attr of victim.attributes ?? []) assert.equal(item(attr._id), undefined);

  // Tree rows: the changed attribute sits under its class; filters work.
  const rows = diffTree(diff);
  const classRow = rows.findIndex((r) => r.id === customer._id);
  const attrRow = rows.findIndex((r) => r.id === first._id);
  assert.ok(classRow >= 0 && attrRow > classRow && rows[attrRow].depth === rows[classRow].depth + 1);
  assert.ok(rows.some((r) => r.status === null), 'unchanged owners as context');
  const onlyAdded = diffTree(diff, { statuses: ['added'] }).filter((r) => r.status);
  assert.deepEqual(onlyAdded.map((r) => r.id), [added._id]);
  assert.ok(diffTree(diff, { categories: ['diagram'] }).filter((r) => r.status).every((r) => r.category === 'diagram'));
  assert.deepEqual(diffTree(diff, { text: 'loyalty' }).filter((r) => r.status).map((r) => r.id), [added._id]);
});

test('restore from a baseline: changed and removed elements, undoable as a plain change', () => {
  const project = sample();
  const baseline = addBaseline(project, createBaseline(project, { name: 'B1' }));
  const customer = byName(project, 'UMLClass', 'Customer');
  const victim = find(project, (e) => e._type === 'UMLClass' && e !== customer && (e.attributes ?? []).length);
  const victimAttrs = victim.attributes.map((a) => a._id);
  customer.name = 'Client';
  customer.attributes[0].name = 'renamed';
  M.removeElements(project, [victim._id]);
  let diff = compareWithBaseline(project, baseline);
  assert.ok(diff.items.some((x) => x.id === victim._id && x.status === 'removed'));
  // Changed → old fields and features back, owned elements kept.
  const owned = (customer.ownedElements ?? []).length;
  const restored = restoreElement(project, baselineRoot(baseline), customer._id);
  assert.equal(restored, M.findById(project, customer._id));
  assert.equal(restored.name, 'Customer');
  assert.notEqual(restored.attributes[0].name, 'renamed');
  assert.equal((restored.ownedElements ?? []).length, owned);
  assert.equal(M.buildIndex(project).get(restored.attributes[0]._id), restored.attributes[0]);
  assert.equal(restored.attributes[0]._parent.$ref, restored._id);
  // Removed → back in its old owner with what it owned.
  const back = restoreElement(project, baselineRoot(baseline), victim._id);
  assert.equal(back.name, victim.name);
  assert.deepEqual(back.attributes.map((a) => a._id), victimAttrs);
  assert.equal(M.findById(project, back._parent.$ref)._id, victim._parent.$ref);
  assert.equal(project.baselines.length, 1, 'baselines untouched');
  diff = compareWithBaseline(project, baseline);
  assert.ok(!diff.items.some((x) => x.id === victim._id || x.id === customer._id), JSON.stringify(diff.items.filter((x) => x.id === victim._id || x.id === customer._id)));
  // No duplicate ids anywhere.
  const ids = [];
  M.walk(project, (e) => ids.push(e._id), { views: true });
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(restoreElement(project, baselineRoot(baseline), 'nope'), null);
});

test('compare with another file and a package baseline', () => {
  const current = sample();
  const other = sample();
  byName(other, 'UMLClass', 'Customer').name = 'Buyer';
  const diff = compareModels(other, current);
  assert.equal(diff.summary.changed, 1);
  const pkg = find(current, (e) => e._type === 'ERDDataModel');
  const baseline = createBaseline(current, { scopeId: pkg._id, name: 'Data' });
  const entity = pkg.ownedElements.find((e) => e._type === 'ERDEntity');
  entity.columns[0].name = 'changed_col';
  const result = compareWithBaseline(current, baseline, { language: 'en' });
  assert.deepEqual(result.items.map((x) => [x.id, x.status]), [[entity.columns[0]._id, 'changed']]);
});

test('StarUML export leaves baselines out', () => {
  const project = sample();
  addBaseline(project, createBaseline(project, { name: 'B' }));
  const text = exportMdj(project);
  assert.doesNotMatch(text, /baselines|"snapshot"/);
  assert.equal(importMdj(text).baselines, undefined);
  assert.equal(project.baselines.length, 1, 'the project keeps them');
});
