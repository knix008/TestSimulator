// Editing diagrams: every toolbox tool of every diagram type creates its
// element in the right owner, relationships between views, lifelines and
// messages, related elements, arranging views, reparenting by containment,
// automatic layout, and the label text (signatures, quick edit parsing).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as M from '../../src/domain/model.js';
import * as E from '../../src/domain/edit.js';
import * as Lb from '../../src/domain/labels.js';
import { layoutDiagram as autoLayout, LAYOUT_DIRECTIONS } from '../../src/domain/layout.js';
import { TOOLBOX, toolById, toolboxFor } from '../../src/domain/toolbox.js';
import { DIAGRAM_TYPES } from '../../src/domain/meta.js';
import { createRenderContext, layoutDiagram } from '../../src/render/notation.js';

const fresh = (type = 'UMLClassDiagram') => {
  const project = M.createProject({ name: 'P', language: 'en', diagram: null });
  const diagram = M.addDiagram(project, project.ownedElements[0]._id, type);
  return { project, diagram };
};
const boxes = (project, diagram) => layoutDiagram(createRenderContext({ project, diagram })).boxes;

test('every diagram type has a toolbox, and every node tool creates something', () => {
  for (const type of Object.keys(DIAGRAM_TYPES)) {
    assert.ok(TOOLBOX[type], `${type} has a toolbox`);
    const { project, diagram } = fresh(type);
    let i = 0;
    for (const [, , , tools] of toolboxFor(type)) {
      for (const tool of tools) {
        if (tool.kind !== 'node' || /Pin$/.test(tool.type)) continue;
        const result = E.createNode(project, diagram, tool, { x: (i % 6) * 220, y: Math.floor(i / 6) * 220, w: 0, h: 0 }, { boxes: boxes(project, diagram) });
        i += 1;
        assert.ok(result.view, `${type} › ${tool.id}`);
      }
    }
  }
});

test('elements dropped into a package or a state are created there', () => {
  const { project, diagram } = fresh();
  const pkg = E.createNode(project, diagram, toolById('UMLClassDiagram', 'UMLPackage'), { x: 0, y: 0, w: 400, h: 300 }).element;
  const cls = E.createNode(project, diagram, toolById('UMLClassDiagram', 'UMLClass'), { x: 50, y: 60, w: 0, h: 0 }, { boxes: boxes(project, diagram) }).element;
  assert.equal(M.ownerOf(project, cls._id), pkg);
  const sm = fresh('UMLStatechartDiagram');
  const composite = E.createNode(sm.project, sm.diagram, toolById('UMLStatechartDiagram', 'compositeState'), { x: 0, y: 0, w: 300, h: 200 }).element;
  const inner = E.createNode(sm.project, sm.diagram, toolById('UMLStatechartDiagram', 'UMLState'), { x: 40, y: 60, w: 0, h: 0 }, { boxes: boxes(sm.project, sm.diagram) }).element;
  assert.equal(M.ownerOf(sm.project, inner._id)._type, 'UMLRegion');
  assert.equal(M.ownerOf(sm.project, M.ownerOf(sm.project, inner._id)._id), composite);
});

test('relationships connect views and keep their ends in the model', () => {
  const { project, diagram } = fresh();
  const tool = (id) => toolById('UMLClassDiagram', id);
  const a = E.createNode(project, diagram, tool('UMLClass'), { x: 0, y: 0, w: 0, h: 0 });
  const b = E.createNode(project, diagram, tool('UMLClass'), { x: 300, y: 0, w: 0, h: 0 });
  const comp = E.createEdge(project, diagram, tool('composition'), a.view, b.view);
  assert.equal(comp.element.end1.aggregation, 'composite');
  assert.deepEqual(M.relationshipEnds(comp.element), [a.element._id, b.element._id]);
  const gen = E.createEdge(project, diagram, tool('UMLGeneralization'), b.view, a.view);
  assert.deepEqual([gen.element.source.$ref, gen.element.target.$ref], [b.element._id, a.element._id]);
  assert.equal(M.ownerOf(project, gen.element._id), b.element, 'kept in the source class');
  const note = E.createNode(project, diagram, tool('UMLNoteView'), { x: 0, y: 200, w: 0, h: 0 });
  assert.equal(E.canConnect(project, diagram, tool('UMLNoteLinkView'), note.view, a.view), true);
  assert.equal(E.canConnect(project, diagram, tool('UMLGeneralization'), note.view, a.view), false);
});

test('sequence diagrams: lifelines represent roles, messages sit in the interaction', () => {
  const { project, diagram } = fresh('UMLSequenceDiagram');
  const tool = (id) => toolById('UMLSequenceDiagram', id);
  const a = E.createNode(project, diagram, tool('UMLLifeline'), { x: 0, y: 0, w: 0, h: 0 });
  const b = E.createNode(project, diagram, tool('actorLifeline'), { x: 300, y: 0, w: 0, h: 0 });
  const interaction = M.ownerOf(project, diagram._id);
  assert.equal(interaction.participants.length, 2);
  assert.ok(M.findById(project, b.element.represent.$ref), 'the actor lifeline represents a role');
  const msg = E.createEdge(project, diagram, tool('message:synchCall'), a.view, b.view, { y: 120 });
  assert.equal(msg.view.y, 120);
  assert.equal(interaction.messages[0], msg.element);
  assert.equal(E.canConnect(project, diagram, tool('message:reply'), a.view, b.view), true);
  // A classifier dropped on a sequence diagram becomes a lifeline.
  const cls = M.addElement(project, project.ownedElements[0]._id, 'UMLClass', { name: 'Server' });
  const view = E.dropElement(project, diagram, cls._id, { x: 600, y: 0 });
  assert.equal(view._type, 'UMLLifelineView');
  assert.equal(Lb.lifelineText(M.findById(project, view.model.$ref), M.buildIndex(project)), ': Server');
});

test('related elements come with their relationship', () => {
  const { project, diagram } = fresh();
  const a = E.createNode(project, diagram, toolById('UMLClassDiagram', 'UMLClass'), { x: 0, y: 0, w: 0, h: 0 });
  for (const kind of E.relatedFor(a.element)) {
    const result = E.addRelated(project, diagram, a.view._id, kind, { boxes: boxes(project, diagram) });
    assert.ok(result?.view, kind);
  }
  assert.equal(diagram.ownedViews.filter(M.isEdgeView).length, E.relatedFor(a.element).length);
});

test('related elements added one after another do not land on each other', () => {
  const { project, diagram } = fresh();
  const a = E.createNode(project, diagram, toolById('UMLClassDiagram', 'UMLClass'), { x: 0, y: 200, w: 0, h: 0 });
  const added = [1, 2, 3].map(() => E.addRelated(project, diagram, a.view._id, 'subclass', { boxes: boxes(project, diagram) }).view);
  const b = boxes(project, diagram);
  const rects = [a.view, ...added].map((v) => b.get(v._id));
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const [p, q] = [rects[i], rects[j]];
      assert.ok(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, `views ${i} and ${j} overlap: ${JSON.stringify([p, q])}`);
    }
  }
});

test('align, distribute, same size, order and moves', () => {
  const { project, diagram } = fresh();
  const make = (x, y) => E.createNode(project, diagram, toolById('UMLClassDiagram', 'UMLClass'), { x, y, w: 0, h: 0 }).view;
  const views = [make(0, 0), make(200, 50), make(500, 120)];
  const ids = views.map((v) => v._id);
  E.alignViews(diagram, ids, 'top', boxes(project, diagram));
  assert.deepEqual(views.map((v) => v.top), [0, 0, 0]);
  views[1].left = 50;
  E.distributeViews(diagram, ids, 'h', boxes(project, diagram));
  const b = boxes(project, diagram);
  assert.ok(Math.abs((b.get(ids[1]).x - (b.get(ids[0]).x + b.get(ids[0]).w)) - (b.get(ids[2]).x - (b.get(ids[1]).x + b.get(ids[1]).w))) <= 1, 'even gaps');
  E.sameSizeViews(diagram, ids, 'both', boxes(project, diagram));
  E.reorderViews(diagram, [ids[0]], 'front');
  assert.equal(diagram.ownedViews.at(-1)._id, ids[0]);
  E.moveViews(diagram, [ids[2]], 10, 20);
  assert.equal(views[2].top, 20);
});

test('dropping a view into a package moves its element there', () => {
  const { project, diagram } = fresh();
  const pkg = E.createNode(project, diagram, toolById('UMLClassDiagram', 'UMLPackage'), { x: 400, y: 0, w: 300, h: 300 });
  const cls = E.createNode(project, diagram, toolById('UMLClassDiagram', 'UMLClass'), { x: 0, y: 0, w: 0, h: 0 }, { boxes: boxes(project, diagram) });
  cls.view.left = 450; cls.view.top = 60;
  assert.equal(E.reparentByContainment(project, diagram, cls.view._id, boxes(project, diagram)), true);
  assert.equal(M.ownerOf(project, cls.element._id), pkg.element);
  cls.view.left = 0; cls.view.top = 400;
  assert.equal(E.reparentByContainment(project, diagram, cls.view._id, boxes(project, diagram)), true, 'dragged out again');
  assert.notEqual(M.ownerOf(project, cls.element._id), pkg.element);
});

test('automatic layout puts parents above their subclasses, in four directions', () => {
  for (const direction of LAYOUT_DIRECTIONS) {
    const { project, diagram } = fresh();
    const make = (x) => E.createNode(project, diagram, toolById('UMLClassDiagram', 'UMLClass'), { x, y: 0, w: 0, h: 0 });
    const parent = make(0); const child1 = make(200); const child2 = make(400);
    E.createEdge(project, diagram, toolById('UMLClassDiagram', 'UMLGeneralization'), child1.view, parent.view);
    E.createEdge(project, diagram, toolById('UMLClassDiagram', 'UMLGeneralization'), child2.view, parent.view);
    autoLayout(diagram, boxes(project, diagram), M.buildIndex(project), { direction });
    if (direction === 'TB') assert.ok(parent.view.top < child1.view.top && child1.view.top === child2.view.top, 'parent above, children in a row');
    if (direction === 'BT') assert.ok(parent.view.top > child1.view.top);
    if (direction === 'LR') assert.ok(parent.view.left < child1.view.left);
    if (direction === 'RL') assert.ok(parent.view.left > child1.view.left);
  }
});

test('labels: attribute and operation signatures', () => {
  const index = M.buildIndex(M.createProject());
  assert.equal(Lb.attributeText({ name: 'items', type: 'Item', multiplicity: '0..*', visibility: 'private', isDerived: true, defaultValue: '[]', isReadOnly: true }, index), '-/items: Item[0..*] = [] {readOnly}');
  const op = { name: 'find', visibility: 'public', isQuery: true, parameters: [{ name: 'id', type: 'long', direction: 'in' }, { name: 'out', type: 'Log', direction: 'out' }, { type: 'Item', direction: 'return' }] };
  assert.equal(Lb.operationText(op, index), '+find(id: long, out out: Log): Item {query}');
  assert.equal(Lb.messageText({ name: 'save', arguments: 'x', assignmentTarget: 'ok' }, index, { number: 3 }), '3 : ok = save(x)');
  assert.equal(Lb.transitionText({ triggers: 'pay', guard: 'amount > 0', effect: 'ship()' }), 'pay [amount > 0] / ship()');
});

test('quick edit text is parsed back into fields', () => {
  assert.deepEqual(Lb.parseAttribute('- name: String [0..1] = "x" {readOnly}'), { name: 'name', visibility: 'private', type: 'String', multiplicity: '0..1', defaultValue: '"x"', isReadOnly: true });
  assert.deepEqual(Lb.parseAttribute('#count'), { name: 'count', visibility: 'protected' });
  const op = Lb.parseOperation('+ total(items: List<Item>, out rate: Map<K, V> = null): Money {query}');
  assert.equal(op.name, 'total');
  assert.deepEqual(op.parameters.map((p) => [p.name, p.type, p.direction]), [['items', 'List<Item>', 'in'], ['rate', 'Map<K, V>', 'out'], ['', 'Money', 'return']]);
  assert.equal(op.isQuery, true);
  assert.deepEqual(Lb.parseNameWithStereotype('«entity» Order'), { name: 'Order', stereotype: 'entity' });
  assert.deepEqual(Lb.parseNameWithStereotype('<<boundary>> Form'), { name: 'Form', stereotype: 'boundary' });
  for (const ok of ['', '1', '0..1', '*', '1..*', '2..5']) assert.ok(Lb.isMultiplicity(ok), ok);
  for (const bad of ['a', '1..', '..2', '1-3']) assert.ok(!Lb.isMultiplicity(bad), bad);
});
