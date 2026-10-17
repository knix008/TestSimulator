// Exchange with other UML tools: StarUML .mdj/.mfj (both ways), Mermaid
// (class, sequence, flowchart, ER, state — both ways) and PlantUML (writing
// eight diagram kinds, reading class and sequence diagrams).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { exportFragment, exportMdj, importFragment, importMdj, parseFont, parsePoints } from '../../src/domain/interop/staruml.js';
import { exportMermaid, importMermaid, layered, parseMember } from '../../src/domain/interop/mermaid.js';
import { exportPlantUml, importPlantUml } from '../../src/domain/interop/plantuml.js';
import * as M from '../../src/domain/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SAMPLE = path.join(root, 'samples', 'staruml-sample.mdj');

// ───────────────────────── a hand-written StarUML project

const r = (id) => ({ $ref: id });
const label = (id, parent, text, extra = {}) => ({ _type: 'LabelView', _id: id, _parent: r(parent), font: 'Arial;13;0', left: 0, top: 0, width: 50, height: 13, text, ...extra });
const edgeLabel = (id, parent, text, position) => ({ _type: 'EdgeLabelView', _id: id, _parent: r(parent), font: 'Arial;13;0', hostEdge: r(parent), edgePosition: position, alpha: 1.5, distance: 15, text });

/** Class diagram (two classes, an association with labels, a generalization) and a sequence diagram. */
function handWritten() {
  return {
    _type: 'Project', _id: 'P', name: 'Hand',
    ownedElements: [{
      _type: 'UMLModel', _id: 'M', _parent: r('P'), name: 'Model',
      ownedElements: [
        {
          _type: 'UMLClassDiagram', _id: 'CD', _parent: r('M'), name: 'Classes', defaultDiagram: true,
          ownedViews: [
            {
              _type: 'UMLClassView', _id: 'vA', _parent: r('CD'), model: r('A'), font: 'Arial;13;1', left: 20, top: 20, width: 120, height: 60, fillColor: '#ffffff', lineColor: '#336699', suppressAttributes: true,
              subViews: [
                { _type: 'UMLNameCompartmentView', _id: 'vAn', _parent: r('vA'), model: r('A'), subViews: [label('vAnl', 'vAn', 'Account')], nameLabel: r('vAnl') },
                { _type: 'UMLAttributeCompartmentView', _id: 'vAa', _parent: r('vA'), model: r('A'), subViews: [{ _type: 'UMLAttributeView', _id: 'vAa1', _parent: r('vAa'), model: r('A1'), text: '+id: int' }] },
              ],
              nameCompartment: r('vAn'), attributeCompartment: r('vAa'),
              containedViews: [{ _type: 'UMLNoteView', _id: 'vN', _parent: r('CD'), left: 30, top: 30, width: 60, height: 30, text: 'inner note', font: 'Verdana;11;3' }],
            },
            { _type: 'UMLClassView', _id: 'vB', _parent: r('CD'), model: r('B'), left: 300, top: 20, width: 120, height: 60, subViews: [] },
            { _type: 'UMLClassView', _id: 'vC', _parent: r('CD'), model: r('C'), left: 300, top: 200, width: 120, height: 60, subViews: [] },
            {
              _type: 'UMLAssociationView', _id: 'vAB', _parent: r('CD'), model: r('AB'), head: r('vB'), tail: r('vA'), lineStyle: 2, points: '140:50;200:50;200:40;300:40',
              subViews: [edgeLabel('vABn', 'vAB', 'owns', 1), edgeLabel('vABm', 'vAB', '0..*', 2)], nameLabel: r('vABn'), headMultiplicityLabel: r('vABm'),
            },
            { _type: 'UMLGeneralizationView', _id: 'vG', _parent: r('CD'), model: r('G'), head: r('vB'), tail: r('vC'), lineStyle: 3, points: '360:200;360:80', subViews: [] },
            { _type: 'UMLMysteryView', _id: 'vX', _parent: r('CD'), left: 1, top: 1, width: 1, height: 1 },
          ],
        },
        { _type: 'UMLClass', _id: 'A', _parent: r('M'), name: 'Account', attributes: [{ _type: 'UMLAttribute', _id: 'A1', _parent: r('A'), name: 'id', type: 'int' }],
          ownedElements: [{ _type: 'UMLAssociation', _id: 'AB', _parent: r('A'), name: 'owns', end1: { _type: 'UMLAssociationEnd', _id: 'AB1', reference: r('A') }, end2: { _type: 'UMLAssociationEnd', _id: 'AB2', reference: r('B'), multiplicity: '0..*', navigable: true } }] },
        { _type: 'UMLClass', _id: 'B', _parent: r('M'), name: 'Bank' },
        { _type: 'UMLClass', name: 'Branch', _id: 'C', ownedElements: [{ _type: 'UMLGeneralization', _id: 'G', source: r('C'), target: r('B') }] },
        {
          _type: 'UMLCollaboration', _id: 'CO', _parent: r('M'), name: 'Collab',
          ownedElements: [{
            _type: 'UMLInteraction', _id: 'I', _parent: r('CO'), name: 'Pay',
            ownedElements: [{
              _type: 'UMLSequenceDiagram', _id: 'SD', _parent: r('I'), name: 'Pay',
              ownedViews: [
                { _type: 'UMLSeqLifelineView', _id: 'vL1', _parent: r('SD'), model: r('L1'), left: 50, top: 40, width: 100, height: 300, subViews: [{ _type: 'UMLLinePartView', _id: 'vL1p', _parent: r('vL1'), model: r('L1') }], linePart: r('vL1p') },
                { _type: 'UMLSeqLifelineView', _id: 'vL2', _parent: r('SD'), model: r('L2'), left: 250, top: 40, width: 100, height: 300, subViews: [{ _type: 'UMLLinePartView', _id: 'vL2p', _parent: r('vL2'), model: r('L2') }], linePart: r('vL2p') },
                { _type: 'UMLSeqMessageView', _id: 'vM1', _parent: r('SD'), model: r('M1'), tail: r('vL1p'), head: r('vL2p'), lineStyle: 0, points: '100:120;300:120', subViews: [edgeLabel('vM1n', 'vM1', 'pay()', 1)] },
                { _type: 'UMLSeqMessageView', _id: 'vM2', _parent: r('SD'), model: r('M2'), tail: r('vL2p'), head: r('vL1p'), lineStyle: 0, points: '300:170;100:170', subViews: [] },
              ],
            }],
            participants: [
              { _type: 'UMLLifeline', _id: 'L1', _parent: r('I'), name: 'client' },
              { _type: 'UMLLifeline', _id: 'L2', _parent: r('I'), name: 'bank' },
            ],
            messages: [
              { _type: 'UMLMessage', _id: 'M1', _parent: r('I'), name: 'pay', source: r('L1'), target: r('L2'), messageSort: 'synchCall' },
              { _type: 'UMLMessage', _id: 'M2', _parent: r('I'), name: 'ok', source: r('L2'), target: r('L1'), messageSort: 'reply' },
            ],
          }],
        },
      ],
    }],
  };
}

const allRefs = (value, out = []) => {
  if (Array.isArray(value)) value.forEach((v) => allRefs(v, out));
  else if (value && typeof value === 'object') { if (typeof value.$ref === 'string') out.push(value.$ref); else Object.values(value).forEach((v) => allRefs(v, out)); }
  return out;
};
const allIds = (value, out = new Set()) => {
  if (Array.isArray(value)) value.forEach((v) => allIds(v, out));
  else if (value && typeof value === 'object') { if (value._id) out.add(value._id); for (const [k, v] of Object.entries(value)) if (k !== '_parent') allIds(v, out); }
  return out;
};
const find = (project, id) => M.findById(project, id);
const diagramOf = (result) => result.diagram;
const viewsOf = (diagram, type) => diagram.ownedViews.filter((v) => v._type === type);
/** Puts an import result into a fresh project (as the app does). */
function adopt(result) {
  const project = M.createProject({ diagram: null });
  const target = M.canContain(project.ownedElements[0], result.owner._type) ? project.ownedElements[0] : project;
  M.insertElement(target, result.owner);
  return project;
}

// ───────────────────────── StarUML

test('font, points and line style converters', () => {
  assert.deepEqual(parseFont('Arial;13;0'), { fontFace: '', fontSize: 0, bold: false, italic: false });
  assert.deepEqual(parseFont('Verdana;11;3'), { fontFace: 'Verdana', fontSize: 11, bold: true, italic: true });
  assert.deepEqual(parsePoints('1:2;3.5:4'), [{ x: 1, y: 2 }, { x: 3.5, y: 4 }]);
  assert.deepEqual(parsePoints(''), []);
});

test('importMdj flattens a hand-written StarUML project', () => {
  const project = importMdj(JSON.stringify(handWritten()));
  const cd = find(project, 'CD');
  assert.deepEqual(cd.ownedViews.map((v) => v._id), ['vA', 'vN', 'vB', 'vC', 'vAB', 'vG'], 'compartments, labels and unknown views go; containedViews come up');
  const a = cd.ownedViews[0];
  assert.equal(a._type, 'UMLClassView');
  assert.deepEqual([a.left, a.top, a.width, a.height], [20, 20, 120, 60]);
  assert.equal(a.suppressAttributes, true);
  assert.equal(a.fillColor, '', 'StarUML default white → theme colour');
  assert.equal(a.lineColor, '#336699');
  assert.equal(a.bold, true);
  assert.equal(a.subViews, undefined);
  assert.equal(a.nameCompartment, undefined);
  const note = cd.ownedViews[1];
  assert.deepEqual([note._type, note.text, note.fontFace, note.fontSize, note.italic], ['UMLNoteView', 'inner note', 'Verdana', 11, true]);
  assert.equal(note.model, undefined);
  const assoc = cd.ownedViews.find((v) => v._id === 'vAB');
  assert.deepEqual(assoc.points, [{ x: 200, y: 50 }, { x: 200, y: 40 }], 'only inner bend points');
  assert.equal(assoc.lineStyle, 'roundRect');
  assert.deepEqual([assoc.tail.$ref, assoc.head.$ref], ['vA', 'vB']);
  const gen = cd.ownedViews.find((v) => v._id === 'vG');
  assert.deepEqual([gen.lineStyle, gen.points.length], ['curve', 0]);
  // Model: ids and parents fixed, navigable flag normalised.
  const branch = find(project, 'C');
  assert.equal(branch._parent.$ref, 'M');
  assert.equal(find(project, 'G')._parent.$ref, 'C');
  assert.equal(find(project, 'AB').end1._parent.$ref, 'AB');
  assert.equal(find(project, 'AB').end2.navigable, 'navigable');
  // Sequence: lifeline/message view types, ends moved from the line part to the lifeline view, y from the points.
  const sd = find(project, 'SD');
  assert.deepEqual(sd.ownedViews.map((v) => v._type), ['UMLLifelineView', 'UMLLifelineView', 'UMLMessageView', 'UMLMessageView']);
  const [m1, m2] = viewsOf(sd, 'UMLMessageView');
  assert.deepEqual([m1.tail.$ref, m1.head.$ref, m1.y], ['vL1', 'vL2', 120]);
  assert.deepEqual([m2.tail.$ref, m2.head.$ref, m2.y], ['vL2', 'vL1', 170]);
  // Every reference resolves.
  const ids = allIds(project);
  for (const id of allRefs(project)) assert.ok(ids.has(id), `dangling ${id}`);
});

test('the saved sample (samples/staruml-sample.mdj) imports the same way', () => {
  const project = importMdj(fs.readFileSync(SAMPLE, 'utf8'));
  const [cd, customer, order, vip, collab] = project.ownedElements[0].ownedElements;
  assert.deepEqual([cd._type, customer.name, order.name, vip.name, collab._type], ['UMLClassDiagram', 'Customer', 'Order', 'VipCustomer', 'UMLCollaboration']);
  assert.deepEqual(cd.ownedViews.map((v) => v._type), ['UMLClassView', 'UMLClassView', 'UMLClassView', 'UMLAssociationView', 'UMLGeneralizationView', 'UMLNoteView', 'UMLNoteLinkView']);
  assert.equal(cd.ownedViews[0].fillColor, '#fff3c4');
  assert.equal(cd.ownedViews[2].italic, true);
  assert.deepEqual(cd.ownedViews[3].points, [{ x: 300, y: 131 }, { x: 300, y: 140 }]);
  const sd = collab.ownedElements[0].ownedElements[0];
  assert.deepEqual(sd.ownedViews.map((v) => v._type), ['UMLFrameView', 'UMLLifelineView', 'UMLLifelineView', 'UMLMessageView', 'UMLMessageView']);
  assert.equal(sd.ownedViews[0].text, 'Checkout');
  assert.deepEqual(viewsOf(sd, 'UMLMessageView').map((v) => v.y), [140, 200]);
  assert.equal(viewsOf(sd, 'UMLMessageView')[0].tail.$ref, sd.ownedViews[1]._id);
});

test('importMdj rejects text that is not a StarUML project', () => {
  assert.throws(() => importMdj('not json'), (e) => e.message === 'interop.notMdj' && typeof e.detail === 'string');
  assert.throws(() => importMdj('{"_type":"UMLModel"}'), { message: 'interop.notMdj' });
});

test('exportMdj writes StarUML-shaped views with resolvable references', () => {
  const text = exportMdj(importMdj(JSON.stringify(handWritten())));
  const data = JSON.parse(text);
  const ids = allIds(data);
  for (const id of allRefs(data)) assert.ok(ids.has(id), `dangling ${id}`);
  const cd = data.ownedElements[0].ownedElements[0];
  const classView = cd.ownedViews.find((v) => v._id === 'vA');
  const kinds = classView.subViews.map((s) => s._type);
  for (const kind of ['UMLNameCompartmentView', 'UMLAttributeCompartmentView', 'UMLOperationCompartmentView', 'UMLReceptionCompartmentView', 'UMLTemplateParameterCompartmentView']) assert.ok(kinds.includes(kind), kind);
  const nameCompartment = classView.subViews.find((s) => s._id === classView.nameCompartment.$ref);
  assert.equal(nameCompartment.subViews.find((s) => s._id === nameCompartment.nameLabel.$ref).text, 'Account');
  assert.equal(classView.font, 'Arial;13;1');
  assert.equal(classView.fillColor, '#ffffff');
  const assoc = cd.ownedViews.find((v) => v._id === 'vAB');
  assert.equal(typeof assoc.points, 'string');
  const pts = parsePoints(assoc.points);
  assert.equal(pts.length, 4, 'end points added around the bend points');
  assert.deepEqual(pts.slice(1, 3), [{ x: 200, y: 50 }, { x: 200, y: 40 }]);
  assert.equal(assoc.lineStyle, 2);
  assert.ok(assoc.tailMultiplicityLabel && assoc.headRoleNameLabel && assoc.tailQualifiersCompartment);
  const sd = data.ownedElements[0].ownedElements[4].ownedElements[0].ownedElements[0];
  const lifeline = sd.ownedViews.find((v) => v._id === 'vL1');
  assert.equal(lifeline._type, 'UMLSeqLifelineView');
  const message = sd.ownedViews.find((v) => v._id === 'vM1');
  assert.equal(message._type, 'UMLSeqMessageView');
  assert.equal(message.tail.$ref, lifeline.linePart.$ref, 'messages end on the line part');
  assert.deepEqual(parsePoints(message.points).map((p) => p.y), [120, 120]);
});

test('exportMdj → importMdj keeps views, geometry and message positions', () => {
  const first = importMdj(fs.readFileSync(SAMPLE, 'utf8'));
  const again = importMdj(exportMdj(first));
  const strip = (v) => ({ type: v._type, id: v._id, model: v.model?.$ref, box: [v.left, v.top, v.width, v.height], tail: v.tail?.$ref, head: v.head?.$ref, y: v.y, points: v.points, text: v.text });
  for (const diagram of M.allDiagrams(first)) {
    const other = find(again, diagram._id);
    assert.deepEqual(other.ownedViews.map(strip), diagram.ownedViews.map(strip), diagram.name);
  }
});

test('exportMdj gives auto-sized views (0 × 0) a StarUML size', () => {
  const project = M.createProject({ language: 'en' });
  const diagram = M.allDiagrams(project)[0];
  const cls = M.addElement(project, project.ownedElements[0]._id, 'UMLClass', { name: 'Auto' });
  M.addElement(project, cls._id, 'UMLAttribute', { name: 'x' });
  M.showElement(project, diagram, cls._id, { x: 10, y: 10 });
  const view = JSON.parse(exportMdj(project)).ownedElements[0].ownedElements[0].ownedViews[0];
  assert.ok(view.width > 0 && view.height > 0);
  assert.throws(() => exportMdj({ _type: 'UMLModel' }), { message: 'interop.notProject' });
});

test('fragments: export one element, import it with new ids', () => {
  const project = importMdj(JSON.stringify(handWritten()));
  const text = exportFragment(find(project, 'A'));
  assert.equal(JSON.parse(text)._id, 'A');
  const copy = importFragment(text);
  assert.notEqual(copy._id, 'A');
  assert.equal(copy._parent, undefined);
  assert.equal(copy.name, 'Account');
  assert.equal(copy.attributes[0]._parent.$ref, copy._id);
  const assoc = copy.ownedElements[0];
  assert.equal(assoc.end1.reference.$ref, copy._id, 'references inside the fragment follow the new ids');
  assert.equal(assoc.end2.reference.$ref, 'B', 'references outside stay');
  M.insertElement(project.ownedElements[0], copy);
  assert.equal(copy._parent.$ref, 'M');
  assert.throws(() => importFragment('{"_type":"Project"}'), { message: 'interop.notFragment' });
  assert.throws(() => importFragment('{'), { message: 'interop.notFragment' });
});

// ───────────────────────── Mermaid

test('member lines: visibility, static, abstract, parameters and types', () => {
  assert.deepEqual(parseMember('-String name'), { kind: 'attribute', name: 'name', type: 'String', defaultValue: '', visibility: 'private', explicitVisibility: true, isStatic: false });
  const op = parseMember('+eat(Food f, int qty)$ bool');
  assert.deepEqual([op.kind, op.name, op.returnType, op.isStatic, op.params], ['operation', 'eat', 'bool', true, [{ name: 'f', type: 'Food' }, { name: 'qty', type: 'int' }]]);
  assert.equal(parseMember('#speak()* void').isAbstract, true);
  assert.equal(parseMember('{static} +count : int').isStatic, true);
  assert.deepEqual([parseMember('items : List~Item~ = []').type, parseMember('items : List~Item~ = []').defaultValue], ['List<Item>', '[]']);
});

test('layered layout puts targets below sources and wraps long rows', () => {
  const placed = layered([{ id: 'a', w: 100, h: 40 }, { id: 'b', w: 100, h: 40 }, { id: 'c', w: 100, h: 40 }], [['a', 'b'], ['b', 'c'], ['c', 'a']]);
  assert.ok(placed.get('a').y < placed.get('b').y && placed.get('b').y < placed.get('c').y, 'cycle broken');
  const many = layered(Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, w: 50, h: 20 })), [], { wrap: 3 });
  assert.equal(new Set([...many.values()].map((p) => p.y)).size, 3);
  const lr = layered([{ id: 'a', w: 100, h: 40 }, { id: 'b', w: 100, h: 40 }], [['a', 'b']], { direction: 'LR' });
  assert.ok(lr.get('a').x < lr.get('b').x);
});

const CLASS_MERMAID = `classDiagram
  class Animal {
    <<abstract>>
    +String name
    +int age$
    +makeSound()* void
  }
  class Duck
  <<interface>> Swimmer
  class Color {
    <<enumeration>>
    RED
    GREEN
  }
  Animal <|-- Duck
  Duck ..|> Swimmer
  Zoo "1" *-- "0..*" Animal : houses
  Duck --> Pond
  Duck ..> Food
  note for Duck "quacks"`;

test('importMermaid: class diagram', () => {
  const result = importMermaid(CLASS_MERMAID, { language: 'en' });
  assert.equal(result.kind, 'class');
  assert.equal(result.owner._type, 'UMLPackage');
  const project = adopt(result);
  const byName = (name) => M.elementsWhere(project, (e) => e.name === name)[0];
  const animal = byName('Animal');
  assert.equal(animal.isAbstract, true);
  assert.deepEqual(animal.attributes.map((a) => [a.name, a.type, a.isStatic]), [['name', 'String', false], ['age', 'int', true]]);
  assert.equal(animal.operations[0].isAbstract, true);
  assert.equal(animal.operations[0].parameters[0].direction, 'return');
  assert.equal(byName('Swimmer')._type, 'UMLInterface');
  assert.deepEqual(byName('Color').literals.map((l) => l.name), ['RED', 'GREEN']);
  const gen = M.elementsWhere(project, (e) => e._type === 'UMLGeneralization')[0];
  assert.deepEqual(M.relationshipEnds(gen), [byName('Duck')._id, animal._id], 'Duck specialises Animal');
  assert.equal(M.elementsWhere(project, (e) => e._type === 'UMLInterfaceRealization').length, 1);
  const houses = byName('houses');
  assert.deepEqual([houses.end1.aggregation, houses.end1.multiplicity, houses.end2.multiplicity], ['composite', '1', '0..*']);
  assert.equal(M.elementsWhere(project, (e) => e._type === 'UMLAssociation' && e.end2.navigable === 'navigable').length, 1);
  assert.equal(M.elementsWhere(project, (e) => e._type === 'UMLDependency').length, 1);
  const diagram = diagramOf(result);
  assert.equal(diagram._type, 'UMLClassDiagram');
  assert.equal(viewsOf(diagram, 'UMLClassView').length + viewsOf(diagram, 'UMLInterfaceView').length + viewsOf(diagram, 'UMLEnumerationView').length, 7);
  assert.equal(viewsOf(diagram, 'UMLNoteView').length, 1);
  assert.equal(viewsOf(diagram, 'UMLNoteLinkView').length, 1);
  // Parents above children; no two views on the same spot.
  const viewOf = (el) => diagram.ownedViews.find((v) => v.model?.$ref === el._id);
  assert.ok(viewOf(animal).top < viewOf(byName('Duck')).top);
  const spots = diagram.ownedViews.filter((v) => v.model && !v.tail).map((v) => `${v.left},${v.top}`);
  assert.equal(new Set(spots).size, spots.length);
});

test('importMermaid: sequence diagram with fragments', () => {
  const result = importMermaid(`sequenceDiagram
    actor U as User
    participant S as Server
    U->>+S: login(user)
    alt ok
      S-->>U: token
    else fail
      S-xU: error
    end
    loop every minute
      U-)S: ping
    end
    create participant DB
    S->>DB: open
    Note over U,S: done`);
  assert.equal(result.kind, 'sequence');
  assert.equal(result.owner._type, 'UMLCollaboration');
  const interaction = result.owner.ownedElements.find((e) => e._type === 'UMLInteraction');
  assert.deepEqual(interaction.participants.map((l) => l.name), ['User', 'Server', 'DB']);
  assert.ok(interaction.participants.every((l) => l.represent?.$ref));
  assert.deepEqual(interaction.messages.map((m) => [m.name, m.messageSort]), [['login(user)', 'synchCall'], ['token', 'reply'], ['error', 'asynchSignal'], ['ping', 'asynchCall'], ['open', 'createMessage']]);
  const [alt, loop] = interaction.fragments;
  assert.deepEqual([alt.interactionOperator, alt.operands.map((o) => o.guard)], ['alt', ['ok', 'fail']]);
  assert.equal(loop.interactionOperator, 'loop');
  const diagram = result.diagram;
  const messages = viewsOf(diagram, 'UMLMessageView');
  assert.deepEqual(messages.map((m) => m.y), [...messages.map((m) => m.y)].sort((a, b) => a - b));
  const altView = diagram.ownedViews.find((v) => v.model?.$ref === alt._id);
  for (const m of messages.slice(1, 3)) assert.ok(m.y > altView.top && m.y < altView.top + altView.height, 'fragment holds its messages');
  assert.ok(viewsOf(diagram, 'UMLLifelineView').every((v) => v.height > messages[messages.length - 1].y - v.top));
  assert.equal(viewsOf(diagram, 'UMLNoteView').length, 1);
});

test('importMermaid: flowchart shapes, labels, chains', () => {
  const result = importMermaid(`flowchart LR
    A([Start]) --> B{Is it?}
    B -->|Yes| C[Process]
    B -- No --> D[(DB)]
    C & D --> E((end))
    E -.-> F[[Sub]] ==> G>flag]`);
  assert.equal(result.owner._type, 'FCFlowchart');
  const types = Object.fromEntries(result.owner.ownedElements.filter((e) => /^FC(?!Flow)/.test(e._type) && e._type !== 'FCFlowchartDiagram').map((e) => [e.name, e._type]));
  assert.deepEqual(types, { Start: 'FCTerminator', 'Is it?': 'FCDecision', Process: 'FCProcess', DB: 'FCDatabase', end: 'FCConnector', Sub: 'FCPredefinedProcess', flag: 'FCOffPageConnector' });
  const flows = result.owner.ownedElements.filter((e) => e._type === 'FCFlow');
  assert.equal(flows.length, 7);
  assert.deepEqual(flows.filter((f) => f.name).map((f) => f.name), ['Yes', 'No']);
  const views = result.diagram.ownedViews;
  assert.equal(views.filter((v) => v.tail).length, 7);
  const start = views.find((v) => v._type === 'FCTerminatorView');
  const decision = views.find((v) => v._type === 'FCDecisionView');
  assert.ok(start.left < decision.left, 'LR: left to right');
});

test('importMermaid: ER diagram with keys and cardinalities', () => {
  const result = importMermaid(`erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER }|..|{ LINE-ITEM : contains
    CUSTOMER {
      int id PK
      string name UK "full name"
    }
    ORDER {
      int id PK
      int customer_id FK
    }`);
  assert.equal(result.owner._type, 'ERDDataModel');
  const entity = (name) => result.owner.ownedElements.find((e) => e.name === name);
  assert.deepEqual(entity('CUSTOMER').columns.map((c) => [c.name, c.type, c.primaryKey, c.unique]), [['id', 'int', true, false], ['name', 'string', false, true]]);
  assert.equal(entity('CUSTOMER').columns[1].documentation, 'full name');
  assert.equal(entity('ORDER').columns[1].referenceTo.$ref, entity('CUSTOMER').columns[0]._id, 'FK resolved to the related primary key');
  const [places, contains] = result.owner.ownedElements.filter((e) => e._type === 'ERDRelationship');
  assert.deepEqual([places.name, places.end1.cardinality, places.end2.cardinality, places.identifying], ['places', '1', '0..*', true]);
  assert.deepEqual([contains.end1.cardinality, contains.end2.cardinality, contains.identifying], ['1..*', '1..*', false]);
  assert.equal(viewsOf(result.diagram, 'ERDEntityView').length, 3);
  assert.equal(viewsOf(result.diagram, 'ERDRelationshipView').length, 2);
});

test('importMermaid: state diagram with pseudostates and a composite state', () => {
  const result = importMermaid(`stateDiagram-v2
    [*] --> Idle
    Idle --> Busy : start [ready] / beep
    state Busy {
      [*] --> Working
      Working --> [*]
    }
    state "Waiting for input" as Wait
    Busy --> Wait
    state pick <<choice>>
    Wait --> pick
    pick --> [*]`);
  assert.equal(result.owner._type, 'UMLStateMachine');
  const region = result.owner.regions[0];
  const kinds = region.vertices.map((v) => (v._type === 'UMLPseudostate' ? v.kind : v._type));
  assert.deepEqual(kinds, ['initial', 'UMLState', 'UMLState', 'UMLState', 'choice', 'UMLFinalState']);
  const busy = region.vertices.find((v) => v.name === 'Busy');
  assert.deepEqual(busy.regions[0].vertices.map((v) => v._type), ['UMLPseudostate', 'UMLState', 'UMLFinalState']);
  assert.ok(region.vertices.some((v) => v.name === 'Waiting for input'));
  const start = region.transitions.find((t) => t.triggers === 'start');
  assert.deepEqual([start.guard, start.effect], ['ready', 'beep']);
  const views = result.diagram.ownedViews;
  const busyView = views.find((v) => v.model?.$ref === busy._id);
  const working = busy.regions[0].vertices[1];
  const workingView = views.find((v) => v.model?.$ref === working._id);
  assert.ok(workingView.left > busyView.left && workingView.top > busyView.top && workingView.top < busyView.top + busyView.height, 'inner state drawn inside the composite');
  assert.ok(views.indexOf(busyView) < views.indexOf(workingView), 'composite behind its contents');
  assert.equal(views.filter((v) => v._type === 'UMLTransitionView').length, 7);
});

test('importMermaid rejects unknown or empty text', () => {
  assert.throws(() => importMermaid('pie title Pets\n "Dogs" : 3'), (e) => e.message === 'interop.unsupportedMermaid' && e.detail.startsWith('pie'));
  assert.throws(() => importMermaid('  \n%% only a comment\n'), { message: 'interop.empty' });
});

test('exportMermaid → importMermaid round trips', () => {
  const cases = [
    [CLASS_MERMAID, (r) => [r.owner.ownedElements.filter((e) => /Class|Interface|Enumeration/.test(e._type)).length, r.diagram.ownedViews.filter((v) => v.tail && v.model).length]],
    ['sequenceDiagram\n A->>B: hi\n alt x\n B-->>A: yo\n else y\n B-)A: no\n end', (r) => [r.owner.ownedElements[r.owner.ownedElements.length - 1].messages?.length ?? r.owner.ownedElements.find((e) => e._type === 'UMLInteraction').messages.length, r.owner.ownedElements.find((e) => e._type === 'UMLInteraction').fragments[0].operands.length]],
    ['flowchart TD\n a[One] -->|go| b{Two}\n b --> c[(Three)]', (r) => [r.owner.ownedElements.length, r.owner.ownedElements.filter((e) => e._type === 'FCDatabase').length]],
    ['erDiagram\n A ||--o{ B : has\n A {\n int id PK\n }', (r) => [r.owner.ownedElements.length, r.owner.ownedElements[0].columns.length]],
    ['stateDiagram-v2\n [*] --> A\n A --> B : go\n state B {\n [*] --> C\n }\n B --> [*]', (r) => [r.owner.regions[0].vertices.length, r.owner.regions[0].transitions.length, r.owner.regions[0].vertices.find((v) => v.name === 'B').regions[0].vertices.length]],
  ];
  for (const [source, measure] of cases) {
    const first = importMermaid(source);
    const text = exportMermaid(adopt(first), first.diagram);
    const second = importMermaid(text);
    assert.deepEqual(measure(second), measure(first), text);
  }
});

test('exportMermaid writes the expected syntax', () => {
  const cls = importMermaid(CLASS_MERMAID);
  const text = exportMermaid(adopt(cls), cls.diagram);
  assert.match(text, /^classDiagram\n/);
  assert.match(text, /Animal <\|-- Duck/);
  assert.match(text, /Swimmer <\|\.\. Duck/);
  assert.match(text, /Zoo "1" \*-- "0\.\.\*" Animal : houses/);
  assert.match(text, /<<interface>>/);
  assert.match(text, /\+int age\$/);
  assert.throws(() => exportMermaid(adopt(cls), { _type: 'UMLTimingDiagram', ownedViews: [] }), { message: 'interop.unsupportedDiagram' });
  // Use case diagram as a flowchart; reserved word "end" is not used as an id.
  const project = M.createProject({ diagram: null });
  const model = project.ownedElements[0];
  const diagram = M.addDiagram(project, model._id, 'UMLUseCaseDiagram');
  const actor = M.addElement(project, model._id, 'UMLActor', { name: 'end' });
  const uc = M.addElement(project, model._id, 'UMLUseCase', { name: 'Pay bill' });
  const assoc = M.insertElement(model, M.createElement('UMLAssociation', { end1: { reference: M.ref(actor) }, end2: { reference: M.ref(uc) } }));
  const va = M.showElement(project, diagram, actor._id, { x: 10, y: 10 });
  const vu = M.showElement(project, diagram, uc._id, { x: 200, y: 10 });
  M.addView(diagram, M.createEdgeView('UMLAssociationView', assoc._id, va._id, vu._id));
  const flow = exportMermaid(project, diagram);
  assert.match(flow, /^flowchart (LR|TD)/);
  assert.match(flow, /end_2\(\("end"\)\)/);
  assert.match(flow, /Pay_bill\(\["Pay bill"\]\)/);
  assert.match(flow, /end_2 --- Pay_bill/);
});

// ───────────────────────── PlantUML

/** A small project with one diagram of the given type and the given elements (views in a row). */
function build(diagramType, make) {
  const project = M.createProject({ diagram: null });
  const model = project.ownedElements[0];
  const diagram = M.addDiagram(project, model._id, diagramType);
  const owner = M.findById(project, diagram._parent.$ref);
  let x = 20;
  const show = (el, size = {}) => { const v = M.showElement(project, diagram, el._id, { x, y: 20 }, size); x += 200; return v; };
  const add = (type, attrs, where = owner) => M.insertElement(where, M.createElement(type, attrs, { siblings: M.siblingsIn(where, type) }));
  const line = (rel, a, b) => M.addView(diagram, M.createEdgeView(`${rel._type}View`, rel._id, a._id, b._id));
  make({ project, diagram, owner, model, add, show, line });
  return { project, diagram };
}

test('exportPlantUml: class diagram', () => {
  const { project, diagram } = build('UMLClassDiagram', ({ add, show, line, owner }) => {
    const shape = add('UMLClass', { name: 'Shape', isAbstract: true });
    add('UMLAttribute', { name: 'id', type: 'int', visibility: 'private', isStatic: true }, shape);
    const area = add('UMLOperation', { name: 'area', isAbstract: true }, shape);
    add('UMLParameter', { name: '', type: 'double', direction: 'return' }, area);
    const circle = add('UMLClass', { name: 'Circle' });
    const drawable = add('UMLInterface', { name: 'Drawable' });
    const g = M.insertElement(circle, M.createElement('UMLGeneralization', { source: M.ref(circle), target: M.ref(shape) }));
    const rz = M.insertElement(circle, M.createElement('UMLInterfaceRealization', { source: M.ref(circle), target: M.ref(drawable) }));
    const as = M.insertElement(owner, M.createElement('UMLAssociation', { name: 'has', end1: { reference: M.ref(shape), aggregation: 'composite', multiplicity: '1' }, end2: { reference: M.ref(circle), multiplicity: '0..*' } }));
    const [vs, vc, vd] = [show(shape), show(circle), show(drawable)];
    line(g, vc, vs); line(rz, vc, vd); line(as, vs, vc);
  });
  const text = exportPlantUml(project, diagram);
  assert.match(text, /^@startuml\n[\s\S]*@enduml\n$/);
  assert.match(text, /abstract class Shape \{/);
  assert.match(text, /\{static\} -id : int/);
  assert.match(text, /\{abstract\} \+area\(\) : double/);
  assert.match(text, /interface Drawable/);
  assert.match(text, /Shape <\|-- Circle/);
  assert.match(text, /Drawable <\|\.\. Circle/);
  assert.match(text, /Shape "1" \*-- "0\.\.\*" Circle : has/);
});

test('exportPlantUml: use case, sequence, activity, state, component, deployment, ER', () => {
  const uc = build('UMLUseCaseDiagram', ({ add, show, line, model, project, diagram }) => {
    const subject = add('UMLUseCaseSubject', { name: 'ATM' });
    const actor = add('UMLActor', { name: 'Customer' });
    const a = add('UMLUseCase', { name: 'Withdraw' });
    const b = add('UMLUseCase', { name: 'Check PIN' });
    const sv = M.showElement(project, diagram, subject._id, { x: 300, y: 0 }, { w: 300, h: 300 });
    const va = show(actor);
    const vw = M.showElement(project, diagram, a._id, { x: 350, y: 40 }, { w: 120, h: 50 });
    const vp = M.showElement(project, diagram, b._id, { x: 350, y: 160 }, { w: 120, h: 50 });
    void sv;
    line(M.insertElement(model, M.createElement('UMLAssociation', { end1: { reference: M.ref(actor) }, end2: { reference: M.ref(a) } })), va, vw);
    line(M.insertElement(a, M.createElement('UMLInclude', { source: M.ref(a), target: M.ref(b) })), vw, vp);
  });
  const ucText = exportPlantUml(uc.project, uc.diagram);
  assert.match(ucText, /actor "Customer" as Customer/);
  assert.match(ucText, /rectangle "ATM" \{\n {2}usecase "Withdraw" as Withdraw\n {2}usecase "Check PIN" as Check_PIN\n\}/);
  assert.match(ucText, /Withdraw \.\.> Check_PIN : <<include>>/);

  const seq = importMermaid('sequenceDiagram\n actor A\n A->>B: call\n loop 3 times\n B-->>A: back\n end');
  const seqText = exportPlantUml(adopt(seq), seq.diagram);
  assert.match(seqText, /actor A\nparticipant B/);
  assert.match(seqText, /A -> B : call\nloop 3 times\n {2}B --> A : back\nend/);

  const act = build('UMLActivityDiagram', ({ add, show, line }) => {
    const start = add('UMLInitialNode', {});
    const work = add('UMLAction', { name: 'Work' });
    const decide = add('UMLDecisionNode', {});
    const stop = add('UMLActivityFinalNode', {});
    const [v1, v2, v3, v4] = [show(start), show(work), show(decide), show(stop)];
    line(add('UMLControlFlow', { source: M.ref(start), target: M.ref(work) }), v1, v2);
    line(add('UMLControlFlow', { source: M.ref(work), target: M.ref(decide) }), v2, v3);
    line(add('UMLControlFlow', { source: M.ref(decide), target: M.ref(stop), guard: 'done' }), v3, v4);
    line(add('UMLControlFlow', { source: M.ref(decide), target: M.ref(work), guard: 'again' }), v3, v2);
  });
  const actText = exportPlantUml(act.project, act.diagram);
  assert.match(actText, /\(\*\) --> "Work" as Work/);
  assert.match(actText, /--> \[done\] \(\*\)/);
  assert.match(actText, /--> \[again\] Work/);

  const st = importMermaid('stateDiagram-v2\n [*] --> A\n A --> B : go [ok]\n state B {\n [*] --> C\n }\n B --> [*]');
  const stText = exportPlantUml(adopt(st), st.diagram);
  assert.match(stText, /\[\*\] --> A/);
  assert.match(stText, /A --> B : go \[ok\]/);
  assert.match(stText, /state B \{\n {2}state C\n {2}\[\*\] --> C\n\}/);

  const comp = build('UMLComponentDiagram', ({ add, show, line, project, diagram }) => {
    const web = add('UMLComponent', { name: 'Web' });
    const api = add('UMLInterface', { name: 'IOrders' });
    const orders = add('UMLComponent', { name: 'Orders' });
    const vw = show(web); const vi = show(api);
    const vo = M.showElement(project, diagram, orders._id, { x: 600, y: 20 }, { w: 200, h: 120 });
    line(M.insertElement(web, M.createElement('UMLUsage', { source: M.ref(web), target: M.ref(api) })), vw, vi);
    line(M.insertElement(orders, M.createElement('UMLInterfaceRealization', { source: M.ref(orders), target: M.ref(api) })), vo, vi);
  });
  const compText = exportPlantUml(comp.project, comp.diagram);
  assert.match(compText, /component "Web" as Web/);
  assert.match(compText, /interface "IOrders" as IOrders/);
  assert.match(compText, /Web \.\.> IOrders : use/);
  assert.match(compText, /Orders -- IOrders/);

  const dep = build('UMLDeploymentDiagram', ({ add, project, diagram, line }) => {
    const server = add('UMLNode', { name: 'Server' });
    const app = add('UMLArtifact', { name: 'app.jar' });
    const db = add('UMLDevice', { name: 'DB Box' });
    const vs = M.showElement(project, diagram, server._id, { x: 0, y: 0 }, { w: 300, h: 200 });
    M.showElement(project, diagram, app._id, { x: 40, y: 60 }, { w: 100, h: 50 });
    const vd = M.showElement(project, diagram, db._id, { x: 400, y: 0 }, { w: 120, h: 80 });
    line(M.insertElement(server, M.createElement('UMLCommunicationPath', { end1: { reference: M.ref(server) }, end2: { reference: M.ref(db) } })), vs, vd);
  });
  const depText = exportPlantUml(dep.project, dep.diagram);
  assert.match(depText, /node "Server" as Server \{\n {2}artifact "app\.jar" as app_jar\n\}/);
  assert.match(depText, /node "DB Box" as DB_Box <<device>>/);
  assert.match(depText, /Server -- DB_Box/);

  const er = importMermaid('erDiagram\n A ||--o{ B : has\n A {\n int id PK\n }\n B {\n int id PK\n string note\n }');
  const erText = exportPlantUml(adopt(er), er.diagram);
  assert.match(erText, /entity "A" as A \{\n {2}\*id : int <<PK>>\n\}/);
  assert.match(erText, /\*id : int <<PK>>\n {2}--\n {2}\*note : string/);
  assert.match(erText, /A \|\|--o\{ B : has/);

  assert.throws(() => exportPlantUml(uc.project, { _type: 'MMMindmapDiagram', ownedViews: [] }), { message: 'interop.unsupportedDiagram' });
});

test('importPlantUml: class diagram', () => {
  const result = importPlantUml(`@startuml
title Zoo
' a comment
abstract class Animal <<entity>> {
  - name : String
  {static} + count : int
  + {abstract} speak(times : int) : String
}
interface Pet
enum Color {
  RED
  GREEN
}
class "Big Dog" as Dog
Animal <|-- Dog
Dog ..|> Pet
Owner "1" *-- "0..*" Dog : owns >
Dog -up-> Color
@enduml`, { language: 'en' });
  assert.equal(result.kind, 'class');
  const project = adopt(result);
  const byName = (name) => M.elementsWhere(project, (e) => e.name === name)[0];
  const animal = byName('Animal');
  assert.deepEqual([animal.isAbstract, animal.stereotype], [true, 'entity']);
  assert.deepEqual(animal.attributes.map((a) => [a.name, a.type, a.visibility, a.isStatic]), [['name', 'String', 'private', false], ['count', 'int', 'public', true]]);
  assert.deepEqual([animal.operations[0].name, animal.operations[0].isAbstract, animal.operations[0].parameters.map((p) => p.type)], ['speak', true, ['int', 'String']]);
  assert.equal(byName('Pet')._type, 'UMLInterface');
  assert.deepEqual(byName('Color').literals.map((l) => l.name), ['RED', 'GREEN']);
  const dog = byName('Big Dog');
  assert.ok(dog, 'quoted name with alias');
  assert.equal(M.relationshipsOf(project, dog._id).length, 4);
  assert.equal(byName('owns').end1.aggregation, 'composite');
  assert.equal(M.elementsWhere(project, (e) => e._type === 'UMLInterfaceRealization').length, 1);
});

test('importPlantUml: sequence diagram', () => {
  const result = importPlantUml(`@startuml
actor User
participant "Web Server" as WS
database DB
User -> WS : login(name)
activate WS
WS ->> DB : query
alt found
  DB --> WS : row
else missing
  DB ->x WS
end
WS <-- DB : late
WS -> Cache ** : new
return done
note over User, WS : hello
note left of User
 multi line
end note
@enduml`);
  assert.equal(result.kind, 'sequence');
  const interaction = result.owner.ownedElements.find((e) => e._type === 'UMLInteraction');
  assert.deepEqual(interaction.participants.map((p) => p.name), ['User', 'Web Server', 'DB', 'Cache']);
  const names = (id) => interaction.participants.find((p) => p._id === id).name;
  assert.deepEqual(interaction.messages.map((m) => [names(m.source.$ref), names(m.target.$ref), m.messageSort, m.name]), [
    ['User', 'Web Server', 'synchCall', 'login(name)'],
    ['Web Server', 'DB', 'asynchCall', 'query'],
    ['DB', 'Web Server', 'reply', 'row'],
    ['DB', 'Web Server', 'asynchSignal', ''],
    ['DB', 'Web Server', 'reply', 'late'],
    ['Web Server', 'Cache', 'createMessage', 'new'],
    ['Web Server', 'User', 'reply', 'done'],
  ]);
  assert.deepEqual(interaction.fragments[0].operands.map((o) => o.guard), ['found', 'missing']);
  assert.throws(() => importPlantUml('@startuml\n@enduml'), { message: 'interop.empty' });
  assert.throws(() => importPlantUml('@startuml\n(*) --> "x"\n@enduml'), { message: 'interop.unsupportedPlantUml' });
});
