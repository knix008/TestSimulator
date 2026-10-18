// PlantUML conformance: a checklist of the PlantUML language, one test per
// feature, each with a snippet in the form the official PlantUML documentation
// (plantuml.com) uses. Every snippet is imported with importPlantUml, the
// elements and relationships it should give are checked, its diagram renders
// without errors, and it goes back out with exportPlantUml and in again with
// the same elements and relationships on the diagram.
import assert from 'node:assert/strict';
import test from 'node:test';
import { exportPlantUml, importPlantUml, preprocessPlantUml } from '../../src/domain/interop/plantuml.js';
import * as M from '../../src/domain/model.js';
import { renderDiagramSvg } from '../../src/render/notation.js';
import { texts } from './canvas.js';

// ───────────────────────── helpers

/** Imports PlantUML text into a fresh project (as Import › Text does). */
function load(text) {
  const result = importPlantUml(text, { language: 'en' });
  const project = M.createProject({ name: 'P', language: 'en', diagram: null });
  const model = project.ownedElements[0];
  M.insertElement(M.canContain(model, result.owner._type) ? model : project, result.owner);
  const index = M.buildIndex(project);
  const all = (type) => M.elementsWhere(project, (e) => e._type === type);
  const named = (name, type = null) => M.elementsWhere(project, (e) => e.name === name && (!type || e._type === type))[0];
  const nameOf = (value) => index.get(M.refId(value))?.name;
  const ends = (rel) => M.relationshipEnds(rel).map((id) => index.get(id)?.name);
  const rels = (type) => all(type).map((r) => ends(r).join(' → '));
  return { result, project, index, diagram: result.diagram, all, named, nameOf, ends, rels };
}

/** What a diagram shows: its elements (type and name) and lines (type and end names), sorted. */
function shown(project, diagram) {
  const index = M.buildIndex(project);
  const byView = new Map(diagram.ownedViews.map((v) => [v._id, v]));
  const nameOfView = (id) => { const v = byView.get(M.refId(id)); const e = v && index.get(M.refId(v.model)); return e?.name ?? v?.text ?? v?._type ?? '?'; };
  const out = [];
  for (const v of diagram.ownedViews) {
    const e = v.model ? index.get(M.refId(v.model)) : null;
    if (!e) continue;
    out.push(M.isEdgeView(v) ? `${e._type} ${nameOfView(v.tail)} → ${nameOfView(v.head)}` : `${e._type} ${e.name ?? ''}`);
  }
  return out.sort();
}

/** Renders the imported diagram (no errors, no broken numbers), exports it, imports it again: the same diagram content. */
function roundTrip(loaded) {
  const { project, diagram } = loaded;
  assert.ok(diagram, 'the import made a diagram');
  const errors = [];
  const { svg } = renderDiagramSvg(project, diagram, { language: 'en', onError: (error, view) => errors.push(`${view._type}: ${error.message}`) });
  assert.deepEqual(errors, [], 'render errors');
  assert.ok(!/NaN|undefined/.test(svg), 'no broken numbers or text in the drawing');
  const text = exportPlantUml(project, diagram);
  assert.equal(typeof text, 'string', 'exported');
  assert.match(text, /^@start\w+/);
  const again = load(text);
  assert.equal(again.diagram._type, diagram._type, 'the same diagram kind after the round trip');
  assert.deepEqual(shown(again.project, again.diagram), shown(project, diagram), 'the same elements and lines after export → import');
  return { svg, text: texts(svg), exported: text, again };
}

/** One checklist item: imports `source` (kind and diagram type checked), runs `check`, then the round trip. */
function feature(name, source, { kind, type, check = () => {}, roundtrip = true }) {
  test(name, () => {
    const loaded = load(source);
    if (kind) assert.equal(loaded.result.kind, kind, 'diagram kind');
    if (type) assert.equal(loaded.diagram?._type, type, 'diagram type');
    check(loaded);
    if (roundtrip) roundTrip(loaded);
    else renderDiagramSvg(loaded.project, loaded.diagram);
  });
}

// ───────────────────────── common: preprocessor, styling, title

feature('common: title, header, footer, legend and caption (the title names the diagram)', `@startuml
title Simple <b>example</b>\\nof title
header Page Header
footer Page %page% of %lastpage%
caption figure 1
legend right
  Short legend
endlegend
Alice -> Bob : hello
@enduml`, {
  kind: 'sequence',
  check: ({ diagram, named }) => {
    assert.match(diagram.name, /Simple/);
    assert.ok(!/legend|Page Header/.test(diagram.name));
    assert.ok(named('Alice') && named('Bob'));
  },
});

feature('common: skinparam, <style> and !theme are tolerated (no elements, no errors)', `@startuml
!theme plain
skinparam monochrome true
skinparam class {
  BackgroundColor PaleGreen
  ArrowColor SeaGreen
  BorderColor SpringGreen
}
skinparam backgroundColor #EEEBDC
<style>
classDiagram {
  class { BackgroundColor lightblue }
}
</style>
hide empty members
class Car
class Driver
Driver - Car : drives >
@enduml`, {
  kind: 'class',
  check: ({ all, named, rels }) => {
    assert.deepEqual(all('UMLClass').map((c) => c.name).sort(), ['Car', 'Driver']);
    assert.equal(named('BackgroundColor'), undefined);
    assert.deepEqual(rels('UMLAssociation'), ['Driver → Car']);
  },
});

feature('preprocessor: comments, !define macros, variables, !if / !ifdef and !include warnings', `@startuml
' single-line comment
/' many lines
   comment '/
!define SHOW_ADMIN
!$entity = "Customer"
!function $upper($x)
!return $x
!endfunction
!ifdef SHOW_ADMIN
class Admin
!endif
!ifndef SHOW_ADMIN
class Hidden
!endif
!if ($entity == "Customer")
class $entity
!else
class Other
!endif
!include https://example.com/missing.puml
@enduml`, {
  kind: 'class',
  check: ({ result, named }) => {
    assert.ok(named('Admin') && named('Customer'));
    assert.equal(named('Hidden'), undefined);
    assert.equal(named('Other'), undefined);
    assert.ok(result.warnings.some((w) => w.code === 'plantuml.include'), 'an !include is reported, not fetched');
  },
});

test('preprocessor: every @start… block kind is recognised', () => {
  for (const kind of ['uml', 'mindmap', 'wbs', 'gantt', 'chronology', 'json', 'yaml', 'nwdiag', 'salt', 'ebnf', 'regex']) {
    assert.equal(preprocessPlantUml(`@start${kind}\nA\n@end${kind}`).kind, kind, kind);
  }
});

// ───────────────────────── class diagram

feature('class: element kinds (class, abstract, interface, enum, annotation, entity, protocol, struct …)', `@startuml
abstract class AbstractList
abstract AbstractCollection
interface List
interface Collection
class ArrayList
enum TimeUnit {
  DAYS
  HOURS
  MINUTES
}
annotation SuppressWarnings
entity Order
exception IOException
protocol Comparable
struct Point
circle Circ
diamond Dia
List <|-- AbstractList
Collection <|-- AbstractCollection
Collection <|- List
AbstractCollection <|- AbstractList
AbstractList <|-- ArrayList
@enduml`, {
  kind: 'class',
  check: ({ named, rels }) => {
    assert.equal(named('AbstractList').isAbstract, true);
    assert.equal(named('AbstractCollection').isAbstract, true);
    assert.equal(named('List')._type, 'UMLInterface');
    assert.equal(named('TimeUnit')._type, 'UMLEnumeration');
    assert.deepEqual(named('TimeUnit').literals.map((l) => l.name), ['DAYS', 'HOURS', 'MINUTES']);
    assert.equal(named('SuppressWarnings').stereotype, 'annotation');
    assert.equal(named('Order').stereotype, 'entity');
    assert.equal(named('IOException').stereotype, 'exception');
    assert.equal(named('Comparable')._type, 'UMLInterface', 'protocol');
    assert.equal(named('Point')._type, 'UMLDataType', 'struct');
    assert.ok(named('Circ') && named('Dia'), 'circle and diamond');
    const generalizations = [...rels('UMLGeneralization'), ...rels('UMLInterfaceRealization')];
    for (const pair of ['AbstractList → List', 'ArrayList → AbstractList', 'List → Collection']) assert.ok(generalizations.includes(pair), pair);
  },
});

feature('class: members with visibility, {static}, {abstract}, fields and methods', `@startuml
class Dummy {
  -field1
  #field2 : int
  ~method1()
  +method2(a : int, b : String) : boolean
  {static} String id
  {abstract} void methods()
}
@enduml`, {
  kind: 'class',
  check: ({ named }) => {
    const d = named('Dummy');
    const attr = (n) => d.attributes.find((a) => a.name === n);
    const op = (n) => d.operations.find((o) => o.name === n);
    assert.equal(attr('field1').visibility, 'private');
    assert.deepEqual([attr('field2').visibility, attr('field2').type], ['protected', 'int']);
    assert.equal(attr('id').isStatic, true);
    assert.equal(attr('id').type, 'String');
    assert.equal(op('method1').visibility, 'package');
    assert.deepEqual(op('method2').parameters.map((p) => [p.name, p.type, p.direction]), [['a', 'int', 'in'], ['b', 'String', 'in'], ['', 'boolean', 'return']]);
    assert.equal(op('methods').isAbstract, true);
    assert.equal(op('methods').parameters.find((p) => p.direction === 'return')?.type, 'void', 'Java-style return type before the name');
  },
});

feature('class: metaclass and stereotype elements make a profile diagram', `@startuml
metaclass Class
stereotype Entity
Entity --> Class
@enduml`, {
  kind: 'profile',
  type: 'UMLProfileDiagram',
  check: ({ named }) => {
    assert.equal(named('Class')._type, 'UMLMetaClass');
    assert.equal(named('Entity')._type, 'UMLStereotype');
  },
});

feature('class: every relation arrow (extension, composition, aggregation, association, dependency, realization)', `@startuml
Class01 <|-- Class02
Class03 *-- Class04
Class05 o-- Class06
Class07 .. Class08
Class09 -- Class10
Class11 <|.. Class12
Class13 --> Class14
Class15 ..> Class16
@enduml`, {
  kind: 'class',
  check: ({ rels, all, ends }) => {
    assert.deepEqual(rels('UMLGeneralization'), ['Class02 → Class01']);
    assert.ok([...rels('UMLRealization'), ...rels('UMLInterfaceRealization')].includes('Class12 → Class11'));
    assert.ok(rels('UMLDependency').includes('Class15 → Class16'));
    const assoc = all('UMLAssociation');
    const of = (a, b) => assoc.find((r) => ends(r).join() === [a, b].join() || ends(r).join() === [b, a].join());
    const comp = of('Class03', 'Class04');
    assert.ok([comp.end1.aggregation, comp.end2.aggregation].includes('composite'), 'composition');
    const agg = of('Class05', 'Class06');
    assert.ok([agg.end1.aggregation, agg.end2.aggregation].includes('shared'), 'aggregation');
    const directed = of('Class13', 'Class14');
    assert.ok([directed.end1.navigable, directed.end2.navigable].includes('navigable'), 'navigable association');
    assert.ok(of('Class09', 'Class10'), 'plain association');
  },
});

feature('class: multiplicities and labels on relations ("1" *-- "many" : contains >)', `@startuml
Class01 "1" *-- "many" Class02 : contains
Class03 o-- Class04 : aggregation >
Class05 --> "1" Class06
@enduml`, {
  kind: 'class',
  check: ({ all, ends }) => {
    const contains = all('UMLAssociation').find((r) => r.name === 'contains');
    assert.ok(contains, 'label is the name');
    const mult = Object.fromEntries([[ends(contains)[0], contains.end1.multiplicity], [ends(contains)[1], contains.end2.multiplicity]]);
    assert.equal(mult.Class01, '1');
    assert.match(mult.Class02, /many|\*/);
    const to6 = all('UMLAssociation').find((r) => ends(r).includes('Class06'));
    assert.equal(ends(to6)[1] === 'Class06' ? to6.end2.multiplicity : to6.end1.multiplicity, '1');
  },
});

feature('class: packages, nested namespaces and dotted names', `@startuml
package "Classic Collections" #DDDDDD {
  Object <|-- ArrayList
}
package net.sourceforge.plantuml {
  Object <|-- Demo1
  Demo1 *- Demo2
}
@enduml`, {
  kind: 'class',
  check: ({ project, named, index }) => {
    assert.ok(named('Classic Collections', 'UMLPackage'));
    const demo = named('Demo1');
    const path = M.ancestors(project, demo._id, index).map((e) => e.name);
    assert.ok(path.includes('plantuml') || path.includes('net.sourceforge.plantuml'), `Demo1 is in its package (${path})`);
  },
});

feature('class: generics and stereotypes (class Foo<? extends Element> <<Serializable>>)', `@startuml
class Foo<? extends Element> {
  int size()
}
class System << (S,#FF7700) Singleton >>
class Date << (D,orchid) >>
class Bar <<Serializable>> <<Cloneable>>
@enduml`, {
  kind: 'class',
  check: ({ named }) => {
    // The generic part stays with the name (as PlantUML shows it): Foo<? extends Element>.
    const foo = named('Foo<? extends Element>');
    assert.ok(foo, 'generic class');
    assert.deepEqual(foo.operations.map((o) => [o.name, o.parameters.find((p) => p.direction === 'return')?.type]), [['size', 'int']], 'Java-style "int size()"');
    assert.match(String(named('System').stereotype), /Singleton/);
    assert.match(String(named('Bar').stereotype), /Serializable/);
  },
});

feature('class: notes on classes and floating notes', `@startuml
class Object << general >>
Object <|--- ArrayList
note top of Object : In java, every class\\nextends this one.
note "This is a floating note" as N1
note "This note is connected\\nto several objects." as N2
Object .. N2
N2 .. ArrayList
@enduml`, {
  kind: 'class',
  roundtrip: true,
  check: ({ diagram }) => {
    const notes = diagram.ownedViews.filter((v) => v._type === 'UMLNoteView');
    assert.ok(notes.length >= 2, `notes (${notes.length})`);
    assert.ok(notes.some((n) => /every class/.test(n.text)));
    assert.ok(diagram.ownedViews.some((v) => v._type === 'UMLNoteLinkView'), 'note links');
  },
});

feature('class: association class ((Student, Course) .. Enrollment)', `@startuml
class Student {
  Name
}
Student "0..*" - "1..*" Course
(Student, Course) .. Enrollment
class Enrollment {
  drop()
  cancel()
}
@enduml`, {
  kind: 'class',
  check: ({ all, named }) => {
    assert.ok(named('Enrollment').operations.length === 2);
    assert.equal(all('UMLAssociationClassLink').length, 1, 'association class link');
  },
});

// ───────────────────────── object diagram

feature('object: objects with fields, links and a map', `@startuml
object London
object Washington
object Berlin
object NewYork
object user {
  name = "Dummy"
  id = 123
}
map CapitalCity {
  UK => London
  USA => Washington
  Germany => Berlin
}
NewYork --> CapitalCity::USA
user --> London
@enduml`, {
  kind: 'object',
  type: 'UMLObjectDiagram',
  check: ({ named, all }) => {
    const user = named('user');
    assert.equal(user._type, 'UMLObject');
    assert.deepEqual(user.slots.map((s) => [s.name, s.value]), [['name', '"Dummy"'], ['id', '123']]);
    assert.ok(named('CapitalCity'), 'map');
    assert.ok(all('UMLLink').length >= 2, 'links');
  },
});

// ───────────────────────── use case diagram

feature('use case: actor and use case forms, system boundary, include / extend / generalization', `@startuml
left to right direction
actor Guest as g
package Professional {
  actor Chef as c
  actor "Food Critic" as fc
}
:Admin: as Admin
rectangle Restaurant {
  usecase "Eat Food" as UC1
  usecase "Pay for Food" as UC2
  (Drink) as UC3
  usecase "Review" as UC4
}
fc --> UC4
g --> UC1
g --> UC2
g --> UC3
UC2 .> UC1 : <<include>>
(Tip) .> UC2 : <<extend>>
Admin --|> g
@enduml`, {
  kind: 'usecase',
  type: 'UMLUseCaseDiagram',
  check: ({ named, all, rels }) => {
    for (const a of ['Guest', 'Chef', 'Food Critic', 'Admin']) assert.equal(named(a)?._type, 'UMLActor', a);
    for (const u of ['Eat Food', 'Pay for Food', 'Drink', 'Review', 'Tip']) assert.equal(named(u)?._type, 'UMLUseCase', u);
    assert.ok(all('UMLUseCaseSubject').some((s) => s.name === 'Restaurant'), 'rectangle = subject');
    assert.deepEqual(rels('UMLInclude'), ['Pay for Food → Eat Food']);
    assert.deepEqual(rels('UMLExtend'), ['Tip → Pay for Food']);
    assert.deepEqual(rels('UMLGeneralization'), ['Admin → Guest']);
    assert.ok(all('UMLAssociation').length >= 4);
  },
});

// ───────────────────────── sequence diagram

feature('sequence: participant kinds (actor, boundary, control, entity, database, collections, queue)', `@startuml
participant Participant as Foo
actor Actor as Foo1
boundary Boundary as Foo2
control Control as Foo3
entity Entity as Foo4
database Database as Foo5
collections Collections as Foo6
queue Queue as Foo7
Foo -> Foo1 : To actor
Foo -> Foo2 : To boundary
Foo -> Foo3 : To control
Foo -> Foo4 : To entity
Foo -> Foo5 : To database
Foo -> Foo6 : To collections
Foo -> Foo7 : To queue
@enduml`, {
  kind: 'sequence',
  type: 'UMLSequenceDiagram',
  check: ({ all, index }) => {
    const lifelines = all('UMLLifeline');
    assert.equal(lifelines.length, 8);
    const kind = (name) => { const l = lifelines.find((x) => x.name === name); const role = index.get(M.refId(l.represent)); return index.get(M.refId(role?.type)); };
    assert.equal(kind('Actor')?._type, 'UMLActor', 'actor lifeline');
    for (const [name, st] of [['Boundary', 'boundary'], ['Control', 'control'], ['Entity', 'entity'], ['Database', 'database'], ['Collections', 'collections'], ['Queue', 'queue']]) {
      const l = lifelines.find((x) => x.name === name);
      const role = index.get(M.refId(l.represent));
      const stereo = [l.stereotype, role?.stereotype, index.get(M.refId(role?.type))?.stereotype].map((s) => (typeof s === 'string' ? s : index.get(M.refId(s))?.name)).join(' ');
      assert.match(stereo, new RegExp(st), `${name} keeps «${st}»`);
    }
    assert.equal(all('UMLMessage').length, 7);
  },
});

feature('sequence: message arrows (sync, async, reply, lost/found, self)', `@startuml
Alice -> Bob : synchronous
Alice ->> Bob : asynchronous
Bob --> Alice : reply
Alice -> Alice : self call
Bob ->x Alice : lost
[-> Alice : found
@enduml`, {
  kind: 'sequence',
  check: ({ all }) => {
    const sort = (name) => all('UMLMessage').find((m) => m.name === name)?.messageSort;
    assert.equal(sort('synchronous'), 'synchCall');
    assert.match(sort('asynchronous'), /^asynch/);
    assert.equal(sort('reply'), 'reply');
    const self = all('UMLMessage').find((m) => m.name === 'self call');
    assert.equal(M.refId(self.source), M.refId(self.target), 'self message');
    assert.ok(all('UMLEndpoint').length + all('UMLGate').length >= 1, 'lost / found ends');
  },
});

feature('sequence: create and destroy, activate / deactivate, return', `@startuml
participant User
User -> A: DoWork
activate A
create B
A -> B: << createRequest >>
activate B
B -> C: DoWork
activate C
C --> B: WorkDone
destroy C
B --> A: RequestCreated
deactivate B
A -> User: Done
return finished
deactivate A
@enduml`, {
  kind: 'sequence',
  check: ({ all }) => {
    const sorts = all('UMLMessage').map((m) => m.messageSort);
    assert.ok(sorts.includes('createMessage'), 'create');
    assert.ok(sorts.includes('deleteMessage'), 'destroy');
    assert.ok(sorts.filter((s) => s === 'reply').length >= 2, 'replies');
  },
});

feature('sequence: combined fragments alt / else / opt / loop / par / break / critical / group', `@startuml
Alice -> Bob: Authentication Request
alt successful case
  Bob -> Alice: Authentication Accepted
else some kind of failure
  Bob -> Alice: Authentication Failure
  group My own label [My own label 2]
    Alice -> Log : Log attack start
    loop 1000 times
      Alice -> Bob: DNS Attack
    end
    Alice -> Log : Log attack end
  end
else Another type of failure
  Bob -> Alice: Please repeat
end
opt cached
  Bob -> Cache : read
end
par
  Bob -> Log : a
else
  Bob -> Cache : b
end
break timeout
  Bob -> Alice : give up
end
critical
  Bob -> Log : write
end
@enduml`, {
  kind: 'sequence',
  check: ({ all }) => {
    const ops = all('UMLCombinedFragment').map((f) => f.interactionOperator);
    for (const op of ['alt', 'loop', 'opt', 'par', 'break', 'critical']) assert.ok(ops.includes(op), op);
    const alt = all('UMLCombinedFragment').find((f) => f.interactionOperator === 'alt');
    assert.deepEqual(alt.operands.map((o) => o.guard), ['successful case', 'some kind of failure', 'Another type of failure']);
    assert.equal(all('UMLCombinedFragment').find((f) => f.interactionOperator === 'loop').operands[0].guard, '1000 times');
  },
});

feature('sequence: ref over (interaction use), notes, dividers, delays and autonumber', `@startuml
autonumber
participant Alice
actor Bob
ref over Alice, Bob : init
Alice -> Bob : hello
note left: this is a first note
== Initialization ==
Bob -> Alice : ok
note over Alice, Bob : A note across
...5 minutes later...
Alice -> Bob : bye
@enduml`, {
  kind: 'sequence',
  check: ({ all, diagram }) => {
    assert.ok(all('UMLInteractionUse').some((u) => /init/.test(u.name)), 'ref over');
    assert.ok(diagram.ownedViews.filter((v) => v._type === 'UMLNoteView').length >= 2, 'notes');
    assert.equal(all('UMLMessage').length, 3);
    assert.notEqual(diagram.showSequenceNumber, false, 'autonumber shows numbers');
  },
});

// ───────────────────────── activity diagram (new syntax)

feature('activity (new): start, actions, stop / end, notes and arrow labels', `@startuml
start
:Hello world;
:This is defined on
several **lines**;
-> labelled arrow;
:Goodbye;
note right
  This note is on several lines
end note
stop
@enduml`, {
  kind: 'activity',
  type: 'UMLActivityDiagram',
  check: ({ all, diagram }) => {
    assert.equal(all('UMLInitialNode').length, 1);
    assert.ok(all('UMLActivityFinalNode').length >= 1);
    const names = all('UMLAction').map((a) => a.name);
    assert.ok(names.includes('Hello world') && names.includes('Goodbye'));
    assert.ok(names.some((n) => /several/.test(n)), 'multi-line action');
    assert.ok(all('UMLControlFlow').some((f) => f.name === 'labelled arrow' || f.guard === 'labelled arrow'), 'arrow label');
    assert.ok(diagram.ownedViews.some((v) => v._type === 'UMLNoteView'), 'note');
  },
});

feature('activity (new): if / elseif / else / endif with guards', `@startuml
start
if (condition A) then (yes)
  :Text 1;
elseif (condition B) then (yes)
  :Text 2;
  stop
elseif (condition C) then (yes)
  :Text 3;
else (nothing)
  :Text else;
endif
stop
@enduml`, {
  kind: 'activity',
  check: ({ all }) => {
    assert.ok(all('UMLDecisionNode').length >= 3, 'a decision per condition');
    assert.ok(all('UMLMergeNode').length >= 1, 'merge after endif');
    const guards = all('UMLControlFlow').map((f) => f.guard).filter(Boolean);
    assert.ok(guards.includes('yes') && guards.includes('nothing'), `guards ${guards}`);
    assert.equal(all('UMLAction').length, 4);
  },
});

feature('activity (new): while / endwhile and repeat / repeat while loops', `@startuml
start
while (data available?) is (yes)
  :read data;
endwhile (no)
repeat
  :read data;
  :generate diagrams;
repeat while (more data?) is (yes) not (no)
stop
@enduml`, {
  kind: 'activity',
  check: ({ all }) => {
    assert.ok(all('UMLDecisionNode').length >= 2, 'loop decisions');
    assert.ok(all('UMLAction').length >= 3);
    const guards = all('UMLControlFlow').map((f) => f.guard).filter(Boolean);
    assert.ok(guards.includes('yes') && guards.includes('no'), `guards ${guards}`);
  },
});

feature('activity (new): fork / fork again / end fork, split and switch / case', `@startuml
start
fork
  :action 1;
fork again
  :action 2;
end fork
split
  :A;
split again
  :B;
end split
switch (test?)
case ( condition A )
  :Text 1;
case ( condition B )
  :Text 2;
endswitch
stop
@enduml`, {
  kind: 'activity',
  check: ({ all }) => {
    assert.ok(all('UMLForkNode').length >= 1 && all('UMLJoinNode').length >= 1, 'fork and join bars');
    assert.ok(all('UMLDecisionNode').length >= 1, 'switch');
    const guards = all('UMLControlFlow').map((f) => f.guard).filter(Boolean).map((g) => g.trim());
    assert.ok(guards.includes('condition A') && guards.includes('condition B'), `case guards ${guards}`);
    assert.equal(all('UMLAction').length, 6);
  },
});

feature('activity (new): swimlanes, partitions, detach and kill', `@startuml
|Swimlane1|
start
:foo1;
|#AntiqueWhite|Swimlane2|
:foo2;
:foo3;
|Swimlane1|
partition Running {
  :foo4;
}
if (ok?) then
  :foo5;
  detach
endif
:foo6;
kill
@enduml`, {
  kind: 'activity',
  check: ({ all }) => {
    const partitions = all('UMLActivityPartition').map((p) => p.name);
    for (const p of ['Swimlane1', 'Swimlane2']) assert.ok(partitions.includes(p), p);
    assert.ok(partitions.includes('Running') || all('UMLStructuredActivityNode').some((s) => s.name === 'Running'), 'partition block');
    assert.ok(all('UMLFlowFinalNode').length >= 1 || all('UMLActivityFinalNode').length >= 1, 'detach / kill end the flow');
  },
});

// ───────────────────────── activity diagram (legacy syntax)

feature('activity (legacy): (*) start and end, quoted activities, guards, synchronisation bars', `@startuml
(*) --> "First Activity"
"First Activity" --> [You can put also labels] "Second Activity"
"Second Activity" --> ===B1===
===B1=== --> "Parallel Activity 1"
===B1=== --> "Parallel Activity 2"
"Parallel Activity 1" --> ===B2===
"Parallel Activity 2" --> ===B2===
===B2=== --> (*)
@enduml`, {
  kind: 'activity',
  type: 'UMLActivityDiagram',
  check: ({ all }) => {
    assert.equal(all('UMLInitialNode').length, 1);
    assert.equal(all('UMLActivityFinalNode').length, 1);
    assert.equal(all('UMLAction').length, 4);
    assert.ok(all('UMLForkNode').length + all('UMLJoinNode').length >= 2, 'bars');
    assert.ok(all('UMLControlFlow').some((f) => f.guard === 'You can put also labels'));
  },
});

feature('activity (legacy): if / then / else / endif', `@startuml
(*) --> "Initialization"
if "Some Test" then
  -->[true] "Some Activity"
  --> "Another activity"
  -right-> (*)
else
  ->[false] "Something else"
  -->[Ending process] (*)
endif
@enduml`, {
  kind: 'activity',
  check: ({ all }) => {
    assert.ok(all('UMLDecisionNode').length >= 1);
    const guards = all('UMLControlFlow').map((f) => f.guard).filter(Boolean);
    assert.ok(guards.includes('true') && guards.includes('false'), `guards ${guards}`);
  },
});

// ───────────────────────── state diagram

feature('state: [*] start / end, transitions with events, state descriptions', `@startuml
[*] --> State1
State1 --> [*]
State1 : this is a string
State1 : entry / start()
State1 -> State2 : evt [ok] / act
State2 --> [*]
@enduml`, {
  kind: 'state',
  type: 'UMLStatechartDiagram',
  check: ({ all, named }) => {
    assert.ok(all('UMLPseudostate').some((p) => p.kind === 'initial'));
    assert.ok(all('UMLFinalState').length >= 1);
    assert.equal(named('State1').entryActivity, 'start()');
    const t = all('UMLTransition').find((x) => x.triggers === 'evt');
    assert.ok(t, 'event');
    assert.equal(t.guard, 'ok');
    assert.equal(t.effect, 'act');
  },
});

feature('state: composite states and concurrent regions (--)', `@startuml
state NotShooting {
  [*] --> Idle
  Idle --> Configuring : EvConfig
  Configuring --> Idle : EvConfig
}
state Active {
  [*] -> NumLockOff
  NumLockOff --> NumLockOn : EvNumLockPressed
  --
  [*] -> CapsLockOff
  CapsLockOff --> CapsLockOn : EvCapsLockPressed
}
[*] --> NotShooting
@enduml`, {
  kind: 'state',
  check: ({ project, named, index }) => {
    const owner = (name) => { const s = named(name); return M.ancestors(project, s._id, index).find((a) => a._type === 'UMLState')?.name; };
    assert.equal(owner('Idle'), 'NotShooting');
    assert.equal(owner('Configuring'), 'NotShooting');
    const active = named('Active');
    assert.equal(active.regions.length, 2, 'two concurrent regions');
    assert.equal(owner('CapsLockOn'), 'Active');
  },
});

feature('state: pseudostates <<choice>>, <<fork>>, <<join>>, history [H] / [H*], <<entryPoint>> / <<exitPoint>>', `@startuml
state choice1 <<choice>>
state fork1 <<fork>>
state join2 <<join>>
state Somp {
  state entry1 <<entryPoint>>
  state exitA <<exitPoint>>
  state sub1
  entry1 --> sub1
  sub1 --> exitA
  sub1 --> [H]
  sub1 --> [H*]
}
[*] --> choice1 : from start\\nto choice
choice1 --> fork1 : [cond]
fork1 ---> State1
fork1 --> State2
State1 --> join2
State2 --> join2
join2 --> Somp
@enduml`, {
  kind: 'state',
  check: ({ all }) => {
    const kinds = all('UMLPseudostate').map((p) => p.kind);
    for (const k of ['choice', 'fork', 'join', 'entryPoint', 'exitPoint', 'shallowHistory', 'deepHistory']) assert.ok(kinds.includes(k), k);
  },
});

// ───────────────────────── component and deployment diagrams

feature('component: [Component] / component forms, interfaces () and lollipop / socket links', `@startuml
[First component]
[Another component] as Comp2
component Comp3
component [Last\\ncomponent] as Comp4
() "First Interface"
() "Another interface" as Interf2
interface Interf3
interface "Last\\ninterface" as Interf4
DataAccess - [First component]
[First component] ..> HTTP : use
[Another component] -( Interf3
@enduml`, {
  kind: 'component',
  type: 'UMLComponentDiagram',
  check: ({ all }) => {
    assert.deepEqual(all('UMLComponent').map((c) => c.name.replace(/\n/g, ' ')).sort(), ['Another component', 'Comp3', 'First component', 'Last component']);
    const interfaces = all('UMLInterface').map((i) => i.name.replace(/\n/g, ' '));
    for (const i of ['First Interface', 'Another interface', 'Interf3', 'Last interface']) assert.ok(interfaces.includes(i), i);
    assert.ok(all('UMLDependency').length + all('UMLUsage').length >= 2, 'use and socket');
  },
});

feature('component: packages, node, folder, frame, cloud and database groupings; ports', `@startuml
package "Some Group" {
  HTTP - [First Component]
  [Another component]
}
node "Other Groups" {
  FTP - [Second Component]
  [First Component] --> FTP
}
cloud {
  [Example 1]
}
database "MySql" {
  folder "This is my folder" {
    [Folder 3]
  }
  frame "Foo" {
    [Frame 4]
  }
}
component C {
  port p1
  portin p2
  portout p3
}
[Another component] --> [Example 1]
[Example 1] --> [Folder 3]
[Folder 3] --> [Frame 4]
@enduml`, {
  check: ({ project, named, index, all, result }) => {
    // PlantUML draws component and deployment diagrams with one syntax; a node grouping may make it a deployment diagram.
    assert.ok(['component', 'deployment'].includes(result.kind), result.kind);
    const inside = (name) => M.ancestors(project, named(name)._id, index).map((e) => e.name);
    assert.ok(inside('First Component').includes('Some Group'));
    assert.ok(inside('Folder 3').includes('This is my folder'));
    assert.ok(inside('Folder 3').includes('MySql'));
    assert.ok(inside('Frame 4').includes('Foo'));
    assert.equal(named('C').ports?.length, 3, 'port, portin, portout');
    assert.ok(all('UMLDependency').length + all('UMLAssociation').length >= 4);
  },
});

feature('deployment: node, artifact, database, cloud, actor and every node kind; links', `@startuml
actor actor
agent agent
artifact artifact
boundary boundary
card card
cloud cloud
component component
control control
database database
entity entity
file file
folder folder
frame frame
interface interface
node node
package package
queue queue
rectangle rectangle
stack stack
storage storage
usecase usecase
node "Web Server" as web {
  artifact "shop.war" as war
}
node db <<device>>
web -- db : JDBC
actor --> web : HTTPS
@enduml`, {
  kind: 'deployment',
  type: 'UMLDeploymentDiagram',
  check: ({ named, all, project, index }) => {
    assert.ok(all('UMLNode').length >= 2, 'nodes');
    assert.ok(all('UMLArtifact').length >= 2, 'artifacts');
    assert.ok(M.ancestors(project, named('shop.war')._id, index).some((e) => e.name === 'Web Server'), 'artifact deployed in its node');
    assert.ok(named('database'), 'database');
    assert.ok(named('cloud'), 'cloud');
    assert.ok(all('UMLCommunicationPath').length + all('UMLAssociation').length + all('UMLDependency').length >= 2, 'links');
  },
});

// ───────────────────────── timing diagram

feature('timing: robust, concise, binary and clock lines with @time blocks and messages', `@startuml
robust "Web Browser" as WB
concise "Web User" as WU
binary "Enable" as EN
clock "Clock" as C with period 50
@0
WU is Idle
WB is Idle
EN is low
@100
WU is Waiting
WB is Processing
EN is high
@300
WB is Waiting
@enduml`, {
  kind: 'timing',
  type: 'UMLTimingDiagram',
  check: ({ all }) => {
    const lines = all('UMLTimingLifeline');
    assert.deepEqual(lines.map((l) => l.name).sort(), ['Clock', 'Enable', 'Web Browser', 'Web User']);
    const wb = lines.find((l) => l.name === 'Web Browser');
    assert.deepEqual((wb.timeSegments ?? []).map((s) => s.state), ['Idle', 'Processing', 'Waiting']);
    assert.match(wb.states, /Processing/);
  },
});

feature('timing: @participant blocks, relative @+time and messages between lines', `@startuml
concise "Client" as Client
concise "Server" as Server
@Client
0 is idle
+100 is waiting
+200 is idle
@Server
0 is idle
100 is busy
300 is idle
@100
Client -> Server : request
@300
Server -> Client : response
@enduml`, {
  kind: 'timing',
  check: ({ all }) => {
    const client = all('UMLTimingLifeline').find((l) => l.name === 'Client');
    assert.deepEqual(client.timeSegments.map((s) => s.state), ['idle', 'waiting', 'idle']);
    assert.ok(all('UMLMessage').length >= 2, 'messages');
  },
});

// ───────────────────────── ER / Information Engineering

feature('ER (IE): entities with mandatory * attributes, keys and crow\'s-foot relations', `@startuml
entity Entity01 {
  * identifying_attribute : number <<generated>>
  --
  * mandatory_attribute : text
  optional_attribute : text
}
entity Entity02 {
  * e2_id : number <<PK>>
  --
  * e1_id : number <<FK>>
  other_details : text
}
Entity01 ||..o{ Entity02
Entity01 |o..|| Entity02
@enduml`, {
  kind: 'er',
  type: 'ERDDiagram',
  check: ({ named, all }) => {
    const e1 = named('Entity01');
    assert.equal(e1._type, 'ERDEntity');
    const col = (e, n) => e.columns.find((c) => c.name === n);
    assert.equal(col(e1, 'identifying_attribute').primaryKey, true, 'above -- is the key');
    assert.equal(col(e1, 'optional_attribute').nullable, true, 'no * = optional');
    assert.notEqual(col(e1, 'mandatory_attribute').nullable, true);
    const e2 = named('Entity02');
    assert.equal(col(e2, 'e1_id').foreignKey, true);
    const cards = all('ERDRelationship').map((r) => `${r.end1.cardinality}:${r.end2.cardinality}`).sort();
    assert.deepEqual(cards, ['0..1:1', '1:0..*'].sort());
  },
});

// ───────────────────────── mind map and WBS

feature('mind map: OrgMode stars, arithmetic +/- sides and multi-line nodes', `@startmindmap
* Debian
** Ubuntu
*** Linux Mint
*** Kubuntu
** LMDE
** SteamOS
-- Arch
--- Manjaro
*:Multi
line node;
@endmindmap`, {
  kind: 'mindmap',
  type: 'MMMindmapDiagram',
  check: ({ named, project, index }) => {
    assert.ok(named('Debian'));
    const parent = (n) => index.parent(named(n)._id)?.name;
    assert.equal(parent('Ubuntu'), 'Debian');
    assert.equal(parent('Kubuntu'), 'Ubuntu');
    assert.equal(named('Arch').direction, 'left', '-- goes to the left');
    void project;
  },
});

feature('WBS: levels, left / right sides (< and >)', `@startwbs
* Business Process Modelling WBS
** Launch the project
*** Complete Stakeholder Research
*** Initial Implementation Plan
** Design phase
*** Model of AsIs Processes Completed
****< Model of AsIs Processes Completed1
****> Model of AsIs Processes Completed2
**< Implementation phase
@endwbs`, {
  type: 'WBSDiagram',
  check: ({ named, index, all }) => {
    assert.ok(all('WBSNode').length >= 9);
    assert.equal(index.parent(named('Initial Implementation Plan')._id).name, 'Launch the project');
    assert.equal(named('Model of AsIs Processes Completed1').side, 'left');
    assert.equal(named('Model of AsIs Processes Completed2').side, 'right');
  },
});

// ───────────────────────── Gantt and chronology

feature('Gantt: tasks, durations, dependencies, milestones, closed days, completion and resources', `@startgantt
Project starts 2026-11-02
saturday are closed
sunday are closed
2026-11-11 is closed
[Prototype design] lasts 15 days
[Test prototype] lasts 10 days
[Test prototype] starts at [Prototype design]'s end
[Prototype design] is 40% completed
[Prototype design] on {Alice} {Bob:50%}
[Prototype completed] happens at [Test prototype]'s end
-- Phase 2 --
[Release] lasts 3 days
[Test prototype] -> [Release]
@endgantt`, {
  type: 'GanttDiagram',
  check: ({ named, all, rels }) => {
    const design = named('Prototype design');
    assert.deepEqual([design.duration, design.completion], [15, 40]);
    assert.match(design.resources, /Alice/);
    assert.equal(all('GanttMilestone').length, 1);
    assert.ok(all('GanttSeparator').some((s) => /Phase 2/.test(s.name)));
    assert.ok(rels('GanttDependency').includes('Prototype design → Test prototype'));
    assert.ok(rels('GanttDependency').includes('Test prototype → Release'));
    const cal = all('GanttCalendar')[0];
    assert.equal(cal.start, '2026-11-02');
    assert.match(cal.closedDays, /saturday/);
    assert.match(cal.closedDates, /2026-11-11/);
  },
});

feature('chronology: events and periods on a time line', `@startchronology
Project starts 2026-01-01
[Kick-off] happens on 2026-01-12
[Development] starts 2026-02-01 and ends 2026-05-20
[Release] happens on 2026-06-01
[Kick-off] -> [Release]
@endchronology`, {
  type: 'TimelineDiagram',
  check: ({ named, all }) => {
    assert.equal(named('Kick-off')._type, 'TLEvent');
    assert.equal(named('Kick-off').date, '2026-01-12');
    assert.deepEqual([named('Development').start, named('Development').end], ['2026-02-01', '2026-05-20']);
    assert.equal(all('TLLink').length, 1);
  },
});

// ───────────────────────── ArchiMate

feature('ArchiMate: archimate keyword with layer colours and stereotypes, macros, Rel_* relations, grouping', `@startuml
!include <archimate/Archimate>
archimate #Business "Customer" as customer <<business-actor>>
archimate #Application "CRM" as crm <<application-component>>
Business_Process(order, "Handle order")
Technology_Node(server, "Server")
Motivation_Goal(goal, "Happy customers")
Grouping(front, "Front office") {
  Business_Role(clerk, "Clerk")
}
Rel_Assignment(customer, order)
Rel_Serving(crm, order, "supports")
Rel_Realization(server, crm)
Rel_Influence(order, goal, "+")
Rel_Triggering(clerk, order)
Rel_Access(order, crm)
Rel_Flow(clerk, customer)
Rel_Composition(front, clerk)
Rel_Aggregation(crm, server)
Rel_Specialization(clerk, customer)
Rel_Association(goal, customer)
@enduml`, {
  type: 'ArchiMateDiagram',
  check: ({ named, all }) => {
    assert.equal(named('Customer').kind, 'business-actor');
    assert.equal(named('CRM').kind, 'application-component');
    assert.equal(named('Handle order').kind, 'business-process');
    assert.equal(named('Server').kind, 'technology-node');
    assert.equal(named('Happy customers').kind, 'motivation-goal');
    assert.equal(all('ArchiMateGrouping').length, 1);
    for (const t of ['Assignment', 'Serving', 'Realization', 'Influence', 'Triggering', 'Access', 'Flow', 'Composition', 'Aggregation', 'Specialization', 'Association']) {
      assert.equal(all(`ArchiMate${t}`).length, 1, t);
    }
  },
});

// ───────────────────────── nwdiag

feature('nwdiag: networks with addresses, nodes on several networks, shapes and groups', `@startnwdiag
nwdiag {
  network dmz {
    address = "210.x.x.x/24"
    web01 [address = "210.x.x.1"];
    web02 [address = "210.x.x.2"];
  }
  network internal {
    address = "172.x.x.x/24";
    web01 [address = "172.x.x.1"];
    web02 [address = "172.x.x.2"];
    db01 [shape = database];
    db02;
  }
  group web {
    web01;
    web02;
  }
}
@endnwdiag`, {
  type: 'NetworkDiagram',
  check: ({ all, named }) => {
    assert.deepEqual(all('NWNetwork').map((n) => [n.name, n.address]), [['dmz', '210.x.x.x/24'], ['internal', '172.x.x.x/24']]);
    assert.equal(all('NWNode').filter((n) => n.name === 'web01').length, 1, 'one node on two networks');
    assert.ok(all('NWConnection').some((c) => c.address === '172.x.x.1'));
    assert.equal(named('db01').device, 'database');
    assert.equal(all('NWGroup').length, 1);
  },
});

// ───────────────────────── JSON, YAML, EBNF, regex, Salt

feature('JSON: a document with objects, arrays, numbers, booleans and null', `@startjson
{
  "firstName": "John",
  "lastName": "Smith",
  "isAlive": true,
  "age": 27,
  "address": { "streetAddress": "21 2nd Street", "city": "New York" },
  "phoneNumbers": [ { "type": "home", "number": "212 555-1234" } ],
  "spouse": null
}
@endjson`, {
  type: 'JSONDiagram',
  check: ({ all }) => {
    const doc = all('DSDocument')[0];
    assert.equal(doc.format, 'json');
    const data = JSON.parse(doc.text);
    assert.equal(data.address.city, 'New York');
    assert.equal(data.spouse, null);
  },
});

feature('YAML: maps, lists and scalars', `@startyaml
fruit: Apple
size: Large
color:
  - Red
  - Green
@endyaml`, {
  type: 'YAMLDiagram',
  check: ({ all }) => {
    const doc = all('DSDocument')[0];
    assert.equal(doc.format, 'yaml');
    assert.match(doc.text, /fruit: Apple/);
    assert.match(doc.text, /- Green/);
  },
});

feature('EBNF: rules with alternation, repetition, optional parts and terminals', `@startebnf
title Expression
expr = term, { ("+" | "-"), term };
term = factor, { ("*" | "/"), factor };
factor = number | "(", expr, ")";
number = [ "-" ], digit, { digit };
@endebnf`, {
  type: 'EBNFDiagram',
  check: ({ all }) => {
    assert.deepEqual(all('EBNFRule').map((r) => r.name), ['expr', 'term', 'factor', 'number']);
    assert.match(all('EBNFRule')[0].expression, /\{/);
  },
});

feature('regex: a pattern drawn as a railroad diagram', `@startregex
title Phone
\\(?\\d{3}\\)?[ -]?\\d{3}-\\d{4}
@endregex`, {
  type: 'RegexDiagram',
  check: ({ all }) => {
    const p = all('RegexPattern')[0];
    assert.equal(p.pattern, '\\(?\\d{3}\\)?[ -]?\\d{3}-\\d{4}');
  },
});

feature('Salt: a wireframe with text fields, check boxes, radio buttons, drop-downs and buttons', `@startsalt
{
  Login    | "MyName   "
  Password | "****     "
  [X] Remember me | [] Stay signed in
  () Card | (X) Bank
  ^Language^
  [Cancel] | [  OK   ]
}
@endsalt`, {
  type: 'WFWireframeDiagram',
  check: ({ all }) => {
    const types = M.elementsWhere(all('WFWireframe')[0] ?? { ownedElements: [] }, () => true);
    void types;
    for (const t of ['WFText', 'WFInput', 'WFCheckbox', 'WFRadio', 'WFDropdown', 'WFButton']) assert.ok(all(t).length >= 1, t);
    assert.ok(all('WFCheckbox').some((c) => c.checked), '[X] is checked');
    assert.ok(all('WFButton').some((b) => b.name.trim() === 'OK'));
  },
});
