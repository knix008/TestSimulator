// The project model: creating elements in the right collections, owners of
// new diagrams, removing elements with their views and dependent
// relationships, moving and reordering, copying with new ids, finding,
// statistics, and the metamodel tables behind it.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as M from '../../src/domain/model.js';
import { CHILD_COLLECTIONS, collectionFor, DIAGRAM_TYPES, TYPES, typeLabel, viewDef } from '../../src/domain/meta.js';

const fresh = () => {
  const project = M.createProject({ name: 'P', language: 'en' });
  return { project, model: project.ownedElements[0], diagram: M.allDiagrams(project)[0] };
};

test('a new project has a model with a default class diagram', () => {
  const { project, model, diagram } = fresh();
  assert.equal(project._type, 'Project');
  assert.equal(model._type, 'UMLModel');
  assert.equal(diagram._type, 'UMLClassDiagram');
  assert.equal(diagram.defaultDiagram, true);
  assert.deepEqual(diagram._parent, { $ref: model._id });
  assert.equal(M.createProject({ language: 'ko' }).ownedElements[0].name, '모델');
});

test('ids are unique and StarUML-like', () => {
  const ids = new Set(Array.from({ length: 2000 }, () => M.newId()));
  assert.equal(ids.size, 2000);
  for (const id of [...ids].slice(0, 20)) assert.match(id, /^[A-Za-z0-9+/]{24}$/);
});

test('children go into their StarUML collections', () => {
  const { project, model } = fresh();
  const cls = M.addElement(project, model._id, 'UMLClass');
  const attr = M.addElement(project, cls._id, 'UMLAttribute', { type: 'int' });
  const op = M.addElement(project, cls._id, 'UMLOperation');
  M.addElement(project, op._id, 'UMLParameter', { type: 'String', direction: 'return' });
  const en = M.addElement(project, model._id, 'UMLEnumeration');
  M.addElement(project, en._id, 'UMLEnumerationLiteral');
  assert.deepEqual([cls.attributes.length, cls.operations.length, op.parameters.length, en.literals.length], [1, 1, 1, 1]);
  assert.deepEqual(attr._parent, { $ref: cls._id });
  assert.equal(cls.name, 'Class1');
  assert.equal(M.addElement(project, model._id, 'UMLClass').name, 'Class2', 'unique names');
  assert.equal(collectionFor('UMLInteraction', 'UMLLifeline'), 'participants');
  assert.equal(collectionFor('UMLActivity', 'UMLAction'), 'nodes');
  assert.equal(collectionFor('ERDEntity', 'ERDColumn'), 'columns');
});

test('states go into a region the state machine gets on demand', () => {
  const { project, model } = fresh();
  const sm = M.addElement(project, model._id, 'UMLStateMachine');
  const state = M.addElement(project, sm._id, 'UMLState');
  assert.equal(sm.regions.length, 1);
  assert.equal(sm.regions[0].vertices[0], state);
  const pseudo = M.addElement(project, sm._id, 'UMLPseudostate', { kind: 'initial' });
  assert.equal(pseudo.name, '', 'pseudostates are unnamed');
  assert.equal(sm.regions.length, 1, 'the same region is reused');
});

test('diagrams that need a behaviour get one', () => {
  const { project, model } = fresh();
  const seq = M.addDiagram(project, model._id, 'UMLSequenceDiagram');
  const interaction = M.ownerOf(project, seq._id);
  assert.equal(interaction._type, 'UMLInteraction');
  assert.equal(M.ownerOf(project, interaction._id)._type, 'UMLCollaboration');
  assert.equal(M.ownerOf(project, M.addDiagram(project, model._id, 'UMLStatechartDiagram')._id)._type, 'UMLStateMachine');
  assert.equal(M.ownerOf(project, M.addDiagram(project, model._id, 'UMLActivityDiagram')._id)._type, 'UMLActivity');
  assert.equal(M.ownerOf(project, M.addDiagram(project, model._id, 'ERDDiagram')._id)._type, 'ERDDataModel');
  for (const type of Object.keys(DIAGRAM_TYPES)) assert.ok(M.addDiagram(project, model._id, type), type);
});

test('removing an element removes its views everywhere and the relationships that need it', () => {
  const { project, model, diagram } = fresh();
  const a = M.addElement(project, model._id, 'UMLClass');
  const b = M.addElement(project, model._id, 'UMLClass');
  const gen = M.addElement(project, a._id, 'UMLGeneralization', { source: M.ref(a), target: M.ref(b) });
  const assoc = M.addElement(project, a._id, 'UMLAssociation', { end1: { reference: M.ref(a) }, end2: { reference: M.ref(b) } });
  M.setRelationshipEnds(assoc, a._id, b._id);
  const other = M.addDiagram(project, model._id, 'UMLClassDiagram');
  for (const d of [diagram, other]) { M.showElement(project, d, a._id, { x: 0, y: 0 }); M.showElement(project, d, b._id, { x: 300, y: 0 }); M.addMissingEdgeViews(project, d); }
  assert.equal(diagram.ownedViews.length, 4);
  M.removeElements(project, [b._id]);
  assert.equal(M.findById(project, gen._id), null);
  assert.equal(M.findById(project, assoc._id), null);
  for (const d of [diagram, other]) assert.equal(d.ownedViews.length, 1, 'only the view of a is left');
});

test('references to removed elements are cleared', () => {
  const { project, model } = fresh();
  const type = M.addElement(project, model._id, 'UMLClass');
  const user = M.addElement(project, model._id, 'UMLClass');
  const attr = M.addElement(project, user._id, 'UMLAttribute', { type: M.ref(type) });
  M.removeElements(project, [type._id]);
  assert.equal(attr.type, undefined);
});

test('moving elements respects what may contain what', () => {
  const { project, model } = fresh();
  const pkg = M.addElement(project, model._id, 'UMLPackage');
  const cls = M.addElement(project, model._id, 'UMLClass');
  const attr = M.addElement(project, cls._id, 'UMLAttribute');
  assert.equal(M.moveElement(project, cls._id, pkg._id), true);
  assert.equal(pkg.ownedElements[0], cls);
  assert.equal(M.moveElement(project, pkg._id, cls._id), false, 'a package does not go into a class');
  assert.equal(M.moveElement(project, pkg._id, pkg._id), false, 'not into itself');
  assert.equal(M.moveElement(project, attr._id, pkg._id), false, 'an attribute needs a classifier');
  const c2 = M.addElement(project, pkg._id, 'UMLClass');
  assert.equal(M.reorderElement(project, c2._id, -1), true);
  assert.equal(pkg.ownedElements[0], c2);
});

test('copies get new ids and keep their links', () => {
  const { project, model } = fresh();
  const a = M.addElement(project, model._id, 'UMLClass');
  const b = M.addElement(project, model._id, 'UMLClass');
  M.addElement(project, a._id, 'UMLAttribute', { type: M.ref(b) });
  const { items, map } = M.cloneWithNewIds([a, b]);
  assert.notEqual(items[0]._id, a._id);
  assert.equal(items[0].attributes[0].type.$ref, items[1]._id, 'the copy points at the copied class');
  assert.equal(map.get(a._id), items[0]._id);
});

test('qualified names, find and statistics', () => {
  const { project, model } = fresh();
  const pkg = M.addElement(project, model._id, 'UMLPackage', { name: 'shop' });
  const cls = M.addElement(project, pkg._id, 'UMLClass', { name: 'Order', documentation: 'An order placed by a customer' });
  assert.equal(M.qualifiedName(project, cls._id), 'Model::shop::Order');
  assert.deepEqual(M.findElements(project, 'order').map((e) => e._id), [cls._id]);
  assert.deepEqual(M.findElements(project, 'customer').map((e) => e._id), [cls._id], 'documentation is searched');
  assert.equal(M.findElements(project, 'customer', { documentation: false }).length, 0);
  assert.equal(M.findElements(project, 'Ord', { whole: true }).length, 0);
  const stats = M.statistics(project);
  assert.equal(stats.byType.UMLClass, 1);
  assert.equal(stats.diagrams, 1);
  assert.deepEqual(M.elementsWithoutViews(project).map((e) => e._id), [cls._id]);
});

test('the metamodel tables are consistent', () => {
  for (const [type, def] of Object.entries(TYPES)) {
    assert.ok(def.ko && def.en, `${type} has labels`);
    for (const field of def.fields) {
      assert.ok(field.key && field.type, `${type}.${field.key}`);
      if (field.type === 'enum') assert.ok(Array.isArray(field.options) && field.options.length, `${type}.${field.key} options`);
    }
    if (!def.edge && !def.diagram && !def.feature && type !== 'Project' && def.shape) assert.ok(viewDef(`${type}View`).shape, `${type} draws`);
  }
  assert.ok(Object.keys(DIAGRAM_TYPES).length >= 29);
  assert.ok(CHILD_COLLECTIONS.includes('ownedViews'));
  assert.equal(typeLabel('UMLClass', 'ko'), '클래스');
  assert.equal(typeLabel('UMLClass', 'en'), 'Class');
});
