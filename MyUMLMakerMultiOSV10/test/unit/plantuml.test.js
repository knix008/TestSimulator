// PlantUML import/export for every UML diagram PlantUML has: real-world
// snippets with the tricky syntax of each kind, the preprocessor, garbage
// input (warnings, never a crash) and export → import round trips of the
// sample project.
import assert from 'node:assert/strict';
import test from 'node:test';
import { exportPlantUml, importPlantUml, preprocessPlantUml } from '../../src/domain/interop/plantuml.js';
import * as M from '../../src/domain/model.js';
import { buildSample } from '../../src/domain/templates.js';

/** Puts an import result into a fresh project (as the app does). */
function adopt(result) {
  const project = M.createProject({ diagram: null });
  const target = M.canContain(project.ownedElements[0], result.owner._type) ? project.ownedElements[0] : project;
  M.insertElement(target, result.owner);
  return project;
}
const load = (text) => { const result = importPlantUml(text, { language: 'en' }); const project = adopt(result); return { result, project, index: M.buildIndex(project) }; };
const all = (project, type) => M.elementsWhere(project, (e) => e._type === type);
const named = (project, name) => M.elementsWhere(project, (e) => e.name === name)[0];
const viewsOf = (diagram, type) => diagram.ownedViews.filter((v) => v._type === type);
const viewOf = (diagram, el) => diagram.ownedViews.find((v) => M.refId(v.model) === el._id && !v.tail);
const box = (v) => ({ x: v.left, y: v.top, w: v.width, h: v.height });
const within = (inner, outer) => inner.x >= outer.x && inner.y >= outer.y && inner.x <= outer.x + outer.w && inner.y <= outer.y + outer.h;
const ends = (index, rel) => M.relationshipEnds(rel).map((id) => index.get(id)?.name);
const relationsOf = (project, type) => all(project, type);

// ───────────────────────── preprocessor

test('preprocessor: comments, !define, !$var, conditionals, includes, decorations', () => {
  const { result, project } = load(`@startuml
' a line comment
/' a block
   comment '/
!define ENTITY class
!define TABLE(x) class x <<table>>
!$name = "Customer"
!$unset ?= "Fallback"
!$unset ?= "Ignored"
!include common.puml
!theme cerulean
!pragma layout smetana
!ifdef NOPE
class Hidden
!else
class Shown
!endif
!if $name == "Customer"
class IfTrue
!elseif 1
class ElseIf
!endif
!ifndef NOPE
class NotDefined
!endif
skinparam class {
  BackgroundColor pink
}
skinparam monochrome true
<style>
classDiagram { BackgroundColor red }
</style>
title My Classes
legend right
  some legend
endlegend
header page header
footer
  multi line
end footer
caption figure 1
scale 2
ENTITY $name {
  +id : int
}
TABLE(Orders)
class $unset /' inline comment '/
@enduml`);
  assert.equal(result.kind, 'class');
  assert.equal(result.diagram.name, 'My Classes');
  assert.equal(result.owner.name, 'My Classes');
  for (const n of ['Shown', 'Customer', 'IfTrue', 'NotDefined', 'Orders', 'Fallback']) assert.ok(named(project, n), n);
  for (const n of ['Hidden', 'ElseIf', 'Ignored', 'BackgroundColor']) assert.equal(named(project, n), undefined, n);
  assert.deepEqual(named(project, 'Customer').attributes.map((a) => [a.name, a.type]), [['id', 'int']]);
  assert.equal(named(project, 'Orders').stereotype, 'table');
  assert.ok(result.warnings.some((w) => w.code === 'plantuml.include'));
});

test('preprocessor: block kinds, multi-line notes and titles, only the first diagram', () => {
  for (const kind of ['gantt', 'wbs', 'mindmap', 'json', 'yaml', 'nwdiag', 'salt', 'ebnf', 'regex', 'chronology', 'uml']) {
    assert.equal(preprocessPlantUml(`@start${kind}\nx\n@end${kind}`).kind, kind);
  }
  const pre = preprocessPlantUml('class A\nnote left of A\n first\n second\nend note\ntitle\n Two\n lines\nend title\n@startuml\n');
  assert.equal(pre.kind, 'uml');
  const twice = preprocessPlantUml('@startuml\nclass A\nnote right of A\n  one\n  two\nend note\ntitle\n Long\n title\nend title\n@enduml\n@startuml\nclass B\n@enduml');
  assert.deepEqual(twice.lines, ['class A', 'note right of A : one\\ntwo']);
  assert.equal(twice.title, 'Long title');
  assert.ok(twice.warnings.some((w) => w.code === 'plantuml.moreDiagrams'));
});

// ───────────────────────── class

test('class diagram: packages, namespaces, kinds, generics, members, every arrow, notes, association class', () => {
  const { result, project, index } = load(`@startuml
package com.shop {
  abstract class Animal<T> <<entity>> {
    - name : String
    # age : int = 3
    ~ tags : String[0..*]
    {static} + count : int
    {abstract} + speak(times : int) : String
    + {static} create() : Animal
    --
    .. helpers ..
    __ private __
  }
  interface Pet
  enum Color {
    RED, GREEN
    BLUE("b")
  }
  annotation Audited
}
namespace net.dummy {
  class Person
}
class Dog extends com.shop.Animal implements Pet
class "Big Cat" as Cat <<pet>> #pink
struct Point
exception Oops
metaclass Meta
stereotype Fancy
class Thing <<dataType>>
Dog "1" *-- "many legs" Leg : has >
Owner o-- Dog
Dog ..> Color : <<use>>
Cat --|> Animal
Dog -[#red,dashed]-> Toy
Dog +-- Collar
Dog -x Bad
Person ..|> Pet
Dog -left-> Bowl : eats
Bowl <.. Food
Owner -- Address
(Dog, Owner) .. Ownership
note left of Dog : a dog\\nlikes bones
note "free floating" as N1
N1 .. Cat
note as N2
  long
  note
end note
together {
  class A1
  class A2
}
hide empty members
Dog : +bark() : void
Dog : -weight : double
@enduml`);
  assert.equal(result.kind, 'profile', 'metaclass and stereotype make it a profile diagram');
  const shop = named(project, 'shop');
  assert.equal(shop._type, 'UMLPackage');
  assert.equal(index.parent(shop._id).name, 'com');
  const animal = named(project, 'Animal<T>');
  assert.equal(index.parent(animal._id), shop);
  assert.deepEqual([animal.isAbstract, animal.stereotype], [true, 'entity']);
  assert.deepEqual(animal.attributes.map((a) => [a.name, a.type, a.visibility, a.isStatic, a.defaultValue, a.multiplicity ?? '']), [
    ['name', 'String', 'private', false, '', ''], ['age', 'int', 'protected', false, '3', ''], ['tags', 'String', 'package', false, '', '0..*'], ['count', 'int', 'public', true, '', ''],
  ]);
  assert.deepEqual(animal.operations.map((o) => [o.name, o.isAbstract, o.isStatic]), [['speak', true, false], ['create', false, true]]);
  assert.deepEqual(named(project, 'Color').literals.map((l) => l.name), ['RED', 'GREEN', 'BLUE']);
  assert.equal(named(project, 'Audited').stereotype, 'annotation');
  assert.equal(index.parent(named(project, 'Person')._id).name, 'dummy');
  assert.equal(named(project, 'Pet')._type, 'UMLInterface');
  assert.deepEqual([named(project, 'Big Cat').stereotype, named(project, 'Point')._type, named(project, 'Oops').stereotype, named(project, 'Meta')._type, named(project, 'Fancy')._type, named(project, 'Thing')._type], ['pet', 'UMLDataType', 'exception', 'UMLMetaClass', 'UMLStereotype', 'UMLDataType']);
  const dog = named(project, 'Dog');
  assert.deepEqual(dog.operations.map((o) => o.name), ['bark']);
  assert.deepEqual(dog.attributes.map((a) => a.name), ['weight']);
  const gens = relationsOf(project, 'UMLGeneralization').map((r) => ends(index, r));
  assert.deepEqual(gens.sort(), [['Big Cat', 'Animal<T>'], ['Dog', 'Animal<T>']]);
  assert.deepEqual(relationsOf(project, 'UMLInterfaceRealization').map((r) => ends(index, r)).sort(), [['Dog', 'Pet'], ['Person', 'Pet']]);
  const has = named(project, 'has');
  assert.deepEqual([has.end1.aggregation, has.end1.multiplicity, has.end2.multiplicity, has.end2.name], ['composite', '1', 'many', 'legs']);
  const owns = relationsOf(project, 'UMLAssociation').find((a) => ends(index, a).join() === 'Owner,Dog');
  assert.equal(owns.end1.aggregation, 'shared');
  assert.deepEqual(relationsOf(project, 'UMLUsage').map((r) => ends(index, r)), [['Dog', 'Color']]);
  assert.deepEqual(relationsOf(project, 'UMLDependency').map((r) => ends(index, r)).sort(), [['Dog', 'Toy'], ['Food', 'Bowl']]);
  assert.deepEqual(relationsOf(project, 'UMLContainment').map((r) => ends(index, r)), [['Dog', 'Collar']]);
  const bad = relationsOf(project, 'UMLAssociation').find((a) => ends(index, a).join() === 'Dog,Bad');
  assert.equal(bad.end2.navigable, 'notNavigable');
  assert.equal(named(project, 'eats').end2.navigable, 'navigable');
  const link = all(project, 'UMLAssociationClassLink')[0];
  assert.equal(index.get(link.classSide).name, 'Ownership');
  assert.equal(index.get(link.associationSide), owns, 'the existing association is reused');
  assert.equal(viewsOf(result.diagram, 'UMLAssociationClassLinkView').length, 1);
  const notes = viewsOf(result.diagram, 'UMLNoteView');
  assert.deepEqual(notes.map((n) => n.text).sort(), ['a dog\nlikes bones', 'free floating', 'long\nnote']);
  assert.equal(viewsOf(result.diagram, 'UMLNoteLinkView').length, 2);
  for (const n of ['A1', 'A2']) assert.ok(named(project, n));
  // Every element has a view; packages are drawn around their classes.
  assert.ok(within(box(viewOf(result.diagram, animal)), box(viewOf(result.diagram, shop))));
  assert.ok(within(box(viewOf(result.diagram, shop)), box(viewOf(result.diagram, named(project, 'com')))));
  assert.equal(result.diagram.ownedViews.filter((v) => v.tail && v.model).length, relationsOf(project, 'UMLAssociation').length + gens.length + 2 + 1 + 2 + 1 + 1);
});

test('class diagram: plain class diagram kind, package diagram kind, Korean names, unknown lines become warnings', () => {
  const plain = load('@startuml\nclass "주문" as Order {\n  +합계() : Money\n}\nclass Line\nOrder "1" *-- "1..*" Line\nthis is not plantuml\n@enduml');
  assert.equal(plain.result.kind, 'class');
  assert.equal(plain.result.diagram._type, 'UMLClassDiagram');
  assert.equal(named(plain.project, '주문').operations[0].name, '합계');
  assert.deepEqual(plain.result.warnings.map((w) => w.detail), ['this is not plantuml']);
  const pk = load('@startuml\npackage web {\n  class Controller\n}\npackage service\nweb ..> service : <<import>>\n@enduml');
  assert.equal(pk.result.kind, 'package');
  assert.equal(pk.result.diagram._type, 'UMLPackageDiagram');
  assert.equal(relationsOf(pk.project, 'UMLDependency')[0].stereotype, 'import');
});

test('object diagram: objects, fields, links, maps', () => {
  const { result, project, index } = load(`@startuml
object "kim : Customer" as kim
object order1 {
  id = 1001
  status = "NEW"
}
object item
item : quantity = 2
map Capitals {
  UK => London
  FR *-> paris
}
object paris
kim --> order1 : places
order1 *-- "lines" item
@enduml`);
  assert.equal(result.kind, 'object');
  assert.equal(result.diagram._type, 'UMLObjectDiagram');
  assert.deepEqual(all(project, 'UMLObject').map((o) => o.name), ['kim : Customer', 'order1', 'item', 'Capitals', 'paris']);
  assert.deepEqual(named(project, 'order1').slots.map((s) => [s.name, s.value]), [['id', '1001'], ['status', '"NEW"']]);
  assert.deepEqual(named(project, 'item').slots.map((s) => [s.name, s.value]), [['quantity', '2']]);
  assert.deepEqual(named(project, 'Capitals').slots.map((s) => [s.name, s.value]), [['UK', 'London'], ['FR', '']]);
  const links = all(project, 'UMLLink');
  assert.deepEqual(links.map((l) => ends(index, l)).sort(), [['Capitals', 'paris'], ['kim : Customer', 'order1'], ['order1', 'item']]);
  assert.equal(links.find((l) => l.name === 'places').end2.navigable, 'navigable');
  assert.equal(links.find((l) => ends(index, l)[1] === 'item').end2.name, 'lines');
  assert.equal(viewsOf(result.diagram, 'UMLLinkView').length, 3);
});

// ───────────────────────── use case

test('use case diagram: actor and use case forms, boundaries, include/extend, generalization, notes', () => {
  const { result, project, index } = load(`@startuml
left to right direction
actor Customer as C
actor :Bank Clerk: as Clerk <<Human>>
:Admin:
actor/ "Business" as Biz
rectangle "ATM System" {
  usecase "Withdraw Cash" as UC1
  (Check Balance) as UC2
  usecase (Print Receipt)
  (Authenticate)
}
package Settings {
  usecase Configure
}
C --> UC1
C -- (Check Balance)
Clerk <|-- :Admin:
UC1 ..> (Authenticate) : include
UC2 .> (Authenticate) : <<include>>
(Print Receipt) .> UC1 : <<extend>>
UC1 <.. (Print Receipt) : extends
Biz -up-> Configure
note right of C : the customer
@enduml`);
  assert.equal(result.kind, 'usecase');
  assert.equal(result.diagram._type, 'UMLUseCaseDiagram');
  assert.deepEqual(all(project, 'UMLActor').map((a) => a.name), ['Customer', 'Bank Clerk', 'Admin', 'Business']);
  assert.equal(named(project, 'Bank Clerk').stereotype, 'Human');
  assert.deepEqual(all(project, 'UMLUseCase').map((u) => u.name), ['Withdraw Cash', 'Check Balance', 'Print Receipt', 'Authenticate', 'Configure']);
  const subject = all(project, 'UMLUseCaseSubject')[0];
  assert.equal(subject.name, 'ATM System');
  for (const n of ['Withdraw Cash', 'Check Balance', 'Print Receipt', 'Authenticate']) assert.ok(within(box(viewOf(result.diagram, named(project, n))), box(viewOf(result.diagram, subject))), n);
  assert.ok(!within(box(viewOf(result.diagram, named(project, 'Customer'))), box(viewOf(result.diagram, subject))));
  assert.equal(index.parent(named(project, 'Configure')._id).name, 'Settings');
  assert.equal(relationsOf(project, 'UMLAssociation').length, 3);
  assert.deepEqual(relationsOf(project, 'UMLGeneralization').map((g) => ends(index, g)), [['Admin', 'Bank Clerk']]);
  assert.deepEqual(relationsOf(project, 'UMLInclude').map((r) => ends(index, r)).sort(), [['Check Balance', 'Authenticate'], ['Withdraw Cash', 'Authenticate']]);
  assert.deepEqual(relationsOf(project, 'UMLExtend').map((r) => ends(index, r)), [['Print Receipt', 'Withdraw Cash'], ['Print Receipt', 'Withdraw Cash']]);
  assert.equal(viewsOf(result.diagram, 'UMLNoteView')[0].text, 'the customer');
});

// ───────────────────────── component, deployment, composite structure, information flow

test('component diagram: shorthand forms, interfaces, ports, containers, lollipops and sockets', () => {
  const { result, project, index } = load(`@startuml
package "Front End" {
  [Web UI] as UI
  component "Mobile App" as App <<mobile>>
}
frame "Server" {
  component API {
    port p1
    portin in1
    portout out1
  }
}
database "Orders DB" as DB
cloud Internet
interface "REST" as REST
() "Events" as EV
UI --> API : calls
App ..> REST : use
API - REST
API -( EV
API --> DB
[Billing] <.. API
API -- Internet
p1 -- UI
@enduml`);
  assert.equal(result.kind, 'component');
  assert.equal(result.diagram._type, 'UMLComponentDiagram');
  assert.deepEqual(all(project, 'UMLComponent').map((c) => c.name), ['Web UI', 'Mobile App', 'API', 'Billing']);
  assert.equal(named(project, 'Mobile App').stereotype, 'mobile');
  const api = named(project, 'API');
  assert.deepEqual(api.ports.map((p) => p.name), ['p1', 'in1', 'out1']);
  assert.equal(index.parent(api._id).name, 'Server');
  assert.equal(named(project, 'Server').stereotype, 'frame');
  assert.deepEqual([named(project, 'Orders DB')._type, named(project, 'Orders DB').stereotype, named(project, 'Internet').stereotype], ['UMLNode', 'database', 'cloud']);
  assert.deepEqual(all(project, 'UMLInterface').map((i) => i.name), ['REST', 'Events']);
  assert.ok(viewsOf(result.diagram, 'UMLInterfaceView').every((v) => v.stereotypeDisplay === 'icon'));
  assert.deepEqual(relationsOf(project, 'UMLUsage').map((r) => ends(index, r)).sort(), [['API', 'Events'], ['Mobile App', 'REST']]);
  assert.deepEqual(relationsOf(project, 'UMLInterfaceRealization').map((r) => ends(index, r)), [['API', 'REST']]);
  assert.deepEqual(relationsOf(project, 'UMLDependency').map((r) => ends(index, r)).sort(), [['API', 'Billing'], ['API', 'Orders DB'], ['Web UI', 'API']]);
  assert.deepEqual(relationsOf(project, 'UMLConnector').map((r) => ends(index, r)).sort(), [['API', 'Internet'], ['p1', 'Web UI']]);
  assert.equal(viewsOf(result.diagram, 'UMLPortView').length, 3);
  assert.ok(within(box(viewOf(result.diagram, named(project, 'Web UI'))), box(viewOf(result.diagram, named(project, 'Front End')))));
});

test('deployment diagram: nodes, devices, execution environments, artifacts, shapes, links', () => {
  const { result, project, index } = load(`@startuml
node "Web Server" as web <<device>> {
  node "Apache" as apache <<executionEnvironment>> {
    artifact "site.war" as war
  }
}
node db as "DB Host"
database "PostgreSQL" as pg
cloud "CDN" as cdn
file "config.yml" as cfg
storage "Backups" as bk
web -- db : TCP
web --> cdn
war ..> apache : <<deploy>>
cfg ..> war : <<manifest>>
db -- pg
pg --> bk
@enduml`);
  assert.equal(result.kind, 'deployment');
  assert.equal(result.diagram._type, 'UMLDeploymentDiagram');
  assert.deepEqual([named(project, 'Web Server')._type, named(project, 'Apache')._type, named(project, 'DB Host')._type, named(project, 'PostgreSQL').stereotype, named(project, 'CDN').stereotype, named(project, 'Backups').stereotype], ['UMLDevice', 'UMLExecutionEnvironment', 'UMLNode', 'database', 'cloud', 'storage']);
  const war = named(project, 'site.war');
  assert.equal(index.parent(war._id).name, 'Apache');
  assert.deepEqual([named(project, 'config.yml')._type, named(project, 'config.yml').stereotype], ['UMLArtifact', 'file']);
  assert.equal(relationsOf(project, 'UMLCommunicationPath').length, 4);
  assert.equal(named(project, 'TCP')._type, 'UMLCommunicationPath');
  assert.deepEqual(relationsOf(project, 'UMLDeployment').map((r) => ends(index, r)), [['site.war', 'Apache']]);
  assert.deepEqual(relationsOf(project, 'UMLManifestation').map((r) => ends(index, r)), [['config.yml', 'site.war']]);
  assert.ok(within(box(viewOf(result.diagram, war)), box(viewOf(result.diagram, named(project, 'Apache')))));
  assert.ok(within(box(viewOf(result.diagram, named(project, 'Apache'))), box(viewOf(result.diagram, named(project, 'Web Server')))));
});

test('composite structure and information flow diagrams read from the description syntax', () => {
  const cs = load(`@startuml
rectangle "Processor" as P <<class>> {
  port http
  rectangle "ctl : Controller" as ctl <<part>>
  rectangle "repo : Repository" as repo <<part>>
}
interface API
http -- ctl
ctl -- repo
http ..|> API
@enduml`);
  assert.equal(cs.result.kind, 'composite');
  assert.equal(cs.result.diagram._type, 'UMLCompositeStructureDiagram');
  const processor = named(cs.project, 'Processor');
  assert.equal(processor._type, 'UMLClass');
  assert.deepEqual(processor.parts.map((p) => [p.name, p.type]), [['ctl', 'Controller'], ['repo', 'Repository']]);
  assert.deepEqual(processor.ports.map((p) => p.name), ['http']);
  assert.equal(relationsOf(cs.project, 'UMLConnector').length, 2);
  assert.equal(relationsOf(cs.project, 'UMLInterfaceRealization').length, 1);
  const flow = load('@startuml\nactor Customer\ncomponent Shop\nrectangle Order <<information>>\nCustomer ..> Shop : <<flow>> Order\n@enduml');
  assert.equal(flow.result.kind, 'infoflow');
  assert.equal(flow.result.diagram._type, 'UMLInformationFlowDiagram');
  assert.equal(named(flow.project, 'Order')._type, 'UMLInformationItem');
  assert.equal(relationsOf(flow.project, 'UMLInformationFlow')[0].conveyed, 'Order');
});

// ───────────────────────── sequence

test('sequence diagram: participant kinds, every arrow, gates, create/destroy, fragments, refs, notes, dividers', () => {
  const { result } = load(`@startuml
autonumber
actor User
boundary "Web UI" as UI
control Ctrl
entity Order
database DB
collections Logs
queue Bus
participant "Pay\\nService" as Pay order 30 #lightblue
box "Internal"
participant Mailer
end box
User -> UI ++ : click
UI ->> Ctrl : submit
Ctrl -\\ Bus : event
Ctrl --> UI -- : accepted
UI -> Order ** : new
Order -> DB : save
DB -->> Order
UI -> Order !! : drop
[-> UI : external
UI ->] : outgoing
[o-> Ctrl : found
Ctrl ->x] : lost
?-> Ctrl : short in
Ctrl ->? : short out
Ctrl -> Ctrl : self
Ctrl <- Bus : back
activate Ctrl
deactivate Ctrl
alt ok
  Ctrl -> Pay : charge
else failed
  Ctrl -> Mailer : notify
end
opt maybe
  Pay -> Logs : log
end
loop 3 times
  Ctrl -> DB : retry
end
par
  Ctrl -> Mailer : a
else
  Ctrl -> Logs : b
end
break fatal
  Ctrl -> User : sorry
end
critical
  Ctrl -> DB : commit
end
group My own label [secondary]
  Ctrl -> Bus : x
end
group neg never
  Ctrl -> Bus : never
end
ref over UI, Ctrl : Login
ref over Pay
  multi line
  ref
end ref
== Phase 2 ==
...
... 5 minutes later ...
|||
||45||
note left of User : a note
note over UI, Ctrl : spanning
hnote over DB : hex
rnote right of Bus
  multi
  line
end rnote
note across : everyone
Ctrl -> User : done
return bye
@enduml`);
  assert.equal(result.kind, 'sequence');
  assert.equal(result.diagram.showSequenceNumber, true);
  const interaction = result.owner.ownedElements.find((e) => e._type === 'UMLInteraction');
  assert.deepEqual(interaction.participants.map((p) => [p.name, p.stereotype ?? '']), [['User', ''], ['Web UI', 'boundary'], ['Ctrl', 'control'], ['Order', 'entity'], ['DB', 'database'], ['Logs', 'collections'], ['Bus', 'queue'], ['Pay\nService', ''], ['Mailer', '']]);
  const project = adopt(result);
  const index = M.buildIndex(project);
  assert.equal(index.get(index.get(interaction.participants[0].represent).type)._type, 'UMLActor');
  const name = (ref) => { const el = index.get(ref); return el._type === 'UMLLifeline' ? el.name : el._type; };
  const messages = interaction.messages.map((m) => [name(m.source), name(m.target), m.messageSort, m.name]);
  assert.deepEqual(messages.slice(0, 17), [
    ['User', 'Web UI', 'synchCall', 'click'], ['Web UI', 'Ctrl', 'asynchCall', 'submit'], ['Ctrl', 'Bus', 'asynchSignal', 'event'], ['Ctrl', 'Web UI', 'reply', 'accepted'],
    ['Web UI', 'Order', 'createMessage', 'new'], ['Order', 'DB', 'synchCall', 'save'], ['DB', 'Order', 'reply', ''], ['Web UI', 'Order', 'deleteMessage', 'drop'],
    ['UMLGate', 'Web UI', 'synchCall', 'external'], ['Web UI', 'UMLGate', 'synchCall', 'outgoing'], ['UMLEndpoint', 'Ctrl', 'synchCall', 'found'], ['Ctrl', 'UMLEndpoint', 'asynchSignal', 'lost'],
    ['UMLEndpoint', 'Ctrl', 'synchCall', 'short in'], ['Ctrl', 'UMLEndpoint', 'synchCall', 'short out'], ['Ctrl', 'Ctrl', 'synchCall', 'self'], ['Bus', 'Ctrl', 'synchCall', 'back'], ['Ctrl', 'Pay\nService', 'synchCall', 'charge'],
  ]);
  assert.deepEqual(messages[messages.length - 1], ['User', 'Ctrl', 'reply', 'bye']);
  const fragments = interaction.fragments.filter((f) => f._type === 'UMLCombinedFragment');
  assert.deepEqual(fragments.map((f) => [f.interactionOperator, f.operands.map((o) => o.guard)]), [
    ['alt', ['ok', 'failed']], ['opt', ['maybe']], ['loop', ['3 times']], ['par', ['', '']], ['break', ['fatal']], ['critical', ['']], ['seq', ['My own label']], ['neg', ['never']],
  ]);
  assert.deepEqual(interaction.fragments.filter((f) => f._type === 'UMLInteractionUse').map((u) => u.name), ['Login', 'multi line\nref']);
  assert.equal(interaction.fragments.filter((f) => f._type === 'UMLGate').length, 2);
  assert.equal(interaction.fragments.filter((f) => f._type === 'UMLEndpoint').length, 4);
  assert.deepEqual(viewsOf(result.diagram, 'UMLTextView').map((v) => v.text), ['Phase 2']);
  assert.deepEqual(viewsOf(result.diagram, 'UMLNoteView').map((v) => v.text), ['a note', 'spanning', 'hex', 'multi\nline', 'everyone']);
  // Messages go down the page in order; fragments are behind them.
  const ys = viewsOf(result.diagram, 'UMLMessageView').map((v) => v.y);
  assert.deepEqual(ys, [...ys].sort((a, b) => a - b));
  assert.ok(result.diagram.ownedViews.findIndex((v) => v._type === 'UMLCombinedFragmentView') < result.diagram.ownedViews.findIndex((v) => v._type === 'UMLMessageView'));
  assert.deepEqual(result.warnings, []);
});

// ───────────────────────── activity

test('activity diagram (new syntax): if/elseif/else, while, repeat, fork, split, switch, swimlanes, partitions, detach', () => {
  const { result, project, index } = load(`@startuml
title Order Process
|Customer|
start
:Browse catalogue;
:Put items
in cart;
|#AntiqueWhite|Shop|
if (in stock?) then (yes)
  :Reserve;
elseif (backorder?) then (yes)
  :Order from supplier;
else (no)
  :Apologise;
  stop
endif
-> paid;
fork
  :Pack;
fork again
  :Invoice;
end fork
while (more items?) is (yes)
  :Scan item;
endwhile (no)
repeat
  :Try payment;
  backward :Wait;
repeat while (failed?) is (yes) not (no)
switch (shipping)
case (express)
  :Courier;
case (normal)
  :Post;
endswitch
split
  :Email;
split again
  :SMS;
end split
#pink:Receive confirmation<
:Send receipt>
:Archive]
note right: archived
partition Billing {
  :Bill;
}
detach
:orphan;
end
@enduml`);
  assert.equal(result.kind, 'activity');
  assert.equal(result.diagram._type, 'UMLActivityDiagram');
  assert.equal(result.owner._type, 'UMLActivity');
  assert.equal(result.owner.name, 'Order Process');
  const count = (type) => all(project, type).length;
  assert.deepEqual([count('UMLActivityPartition'), count('UMLInitialNode'), count('UMLActivityFinalNode'), count('UMLFlowFinalNode'), count('UMLDecisionNode'), count('UMLMergeNode'), count('UMLForkNode'), count('UMLJoinNode'), count('UMLObjectNode')], [3, 1, 1, 1, 5, 3, 1, 1, 1]);
  assert.deepEqual(all(project, 'UMLAction').map((a) => a.name), ['Browse catalogue', 'Put items\nin cart', 'Reserve', 'Order from supplier', 'Apologise', 'Pack', 'Invoice', 'Scan item', 'Try payment', 'Wait', 'Courier', 'Post', 'Email', 'SMS', 'Receive confirmation', 'Send receipt', 'Bill', 'orphan']);
  assert.deepEqual([named(project, 'Receive confirmation').kind, named(project, 'Send receipt').kind], ['acceptSignal', 'sendSignal']);
  const flow = (a, b) => all(project, 'UMLControlFlow').concat(all(project, 'UMLObjectFlow')).find((f) => index.get(f.source)?.name === a && index.get(f.target)?.name === b);
  assert.equal(flow('in stock?', 'Reserve').guard, 'yes');
  assert.equal(flow('backorder?', 'Apologise').guard, 'no');
  assert.equal(flow('more items?', 'Scan item').guard, 'yes');
  assert.ok(flow('Scan item', 'more items?'), 'the loop goes back');
  assert.equal(flow('failed?', 'Wait').guard, 'yes');
  assert.equal(flow('shipping', 'Courier').guard, 'express');
  assert.ok(flow('Pack', '') || all(project, 'UMLControlFlow').some((f) => index.get(f.source)?.name === 'Pack' && index.get(f.target)._type === 'UMLJoinNode'));
  assert.equal(all(project, 'UMLControlFlow').find((f) => index.get(f.target)._type === 'UMLForkNode').guard, 'paid');
  assert.ok(!all(project, 'UMLControlFlow').some((f) => index.get(f.target)?.name === 'orphan'), 'detach ends the flow');
  assert.ok(flow('SMS', 'Receive confirmation') && flow('Email', 'Receive confirmation'), 'split branches join the next action');
  assert.equal(all(project, 'UMLObjectFlow').length, 2);
  const lane = (n) => all(project, 'UMLActivityPartition').find((p) => within(box(viewOf(result.diagram, named(project, n))), box(viewOf(result.diagram, p))))?.name;
  assert.deepEqual(['Browse catalogue', 'Reserve', 'Bill'].map(lane), ['Customer', 'Shop', 'Billing']);
  assert.equal(viewsOf(result.diagram, 'UMLNoteView')[0].text, 'archived');
  assert.deepEqual(result.warnings, []);
});

test('activity diagram (legacy syntax): (*), bars, guards, legacy if, partitions; interaction overview', () => {
  const { result, project, index } = load(`@startuml
(*) --> "First"
"First" --> [ok] "Second" as S2
-down-> ===B1===
===B1=== --> "Par A"
===B1=== --> "Par B"
"Par A" --> ===B2===
"Par B" --> ===B2===
===B2=== --> if "done?" then
  -->[yes] (*)
else
  -->[no] S2
endif
partition Extra {
  S2 --> "In Extra" as X <<sendSignal>>
}
@enduml`);
  assert.equal(result.kind, 'activity');
  const count = (type) => all(project, type).length;
  assert.deepEqual([count('UMLInitialNode'), count('UMLActivityFinalNode'), count('UMLForkNode'), count('UMLJoinNode'), count('UMLDecisionNode'), count('UMLActivityPartition')], [1, 1, 1, 1, 1, 1]);
  assert.deepEqual(all(project, 'UMLAction').map((a) => a.name), ['First', 'Second', 'Par A', 'Par B', 'In Extra']);
  assert.equal(named(project, 'In Extra').kind, 'sendSignal');
  const guard = (a, b) => all(project, 'UMLControlFlow').find((f) => index.get(f.source).name === a && index.get(f.target).name === b)?.guard;
  assert.equal(guard('First', 'Second'), 'ok');
  assert.equal(guard('done?', 'Second'), 'no');
  assert.equal(all(project, 'UMLControlFlow').length, 11);
  assert.ok(within(box(viewOf(result.diagram, named(project, 'In Extra'))), box(viewOf(result.diagram, named(project, 'Extra')))));
  const overview = load('@startuml\n(*) --> "Log In" as a <<ref>>\na --> "?" as d <<decision>>\nd --> [ok] "Order" as b <<ref>>\nd --> [no] (*)\nb --> (*)\n@enduml');
  assert.equal(overview.result.diagram._type, 'UMLInteractionOverviewDiagram');
  assert.deepEqual(all(overview.project, 'UMLInteractionUse').map((u) => u.name), ['Log In', 'Order']);
  assert.equal(all(overview.project, 'UMLDecisionNode')[0].name, '');
});

// ───────────────────────── state

test('state diagram: composite states, concurrent regions, pseudostates, history, entry/exit points, activities', () => {
  const { result, project, index } = load(`@startuml
[*] --> Idle
state Idle : waiting
state "Long Running" as Running {
  [*] --> Sub1
  Sub1 --> Sub2 : next
  Sub2 --> [*]
  ||
  [*] --> Watch
  Watch --> Watch : tick
}
Idle --> Running : start [ready] / init()
Running --> Idle : stop
state choice1 <<choice>>
state fork1 <<fork>>
state join1 <<join>>
state Comp {
  state entry1 <<entryPoint>>
  state exit1 <<exitPoint>>
  entry1 --> Inner
  Inner --> exit1
  Inner : entry / beginIt
  Inner : do / work
  Inner : exit / endIt
}
Idle --> choice1
choice1 --> fork1 : [go]
fork1 --> A
fork1 --> B
A --> join1
B --> join1
join1 --> Comp
Comp --> Running[H]
Running --> [H*]
Running -down-> Done
Done --> [*]
state end2 <<end>>
Done --> end2
Idle -[#red,dashed]-> Done
note right of Idle : idle note
@enduml`);
  assert.equal(result.kind, 'state');
  assert.equal(result.diagram._type, 'UMLStatechartDiagram');
  const running = named(project, 'Long Running');
  assert.equal(running.regions.length, 2);
  assert.deepEqual(running.regions.map((r) => r.vertices.map((v) => v.name || v.kind || v._type)), [['initial', 'Sub1', 'Sub2', 'UMLFinalState', 'shallowHistory'], ['initial', 'Watch']]);
  assert.equal(named(project, 'Idle').documentation, 'waiting');
  const start = all(project, 'UMLTransition').find((t) => index.get(t.source).name === 'Idle' && index.get(t.target) === running);
  assert.deepEqual([start.triggers, start.guard, start.effect], ['start', 'ready', 'init()']);
  const kinds = all(project, 'UMLPseudostate').map((p) => p.kind).sort();
  assert.deepEqual(kinds, ['choice', 'deepHistory', 'entryPoint', 'exitPoint', 'fork', 'initial', 'initial', 'initial', 'join', 'shallowHistory']);
  assert.equal(all(project, 'UMLFinalState').length, 3);
  const inner = named(project, 'Inner');
  assert.deepEqual([inner.entryActivity, inner.doActivity, inner.exitActivity], ['beginIt', 'work', 'endIt']);
  assert.equal(index.parent(index.parent(inner._id)._id).name, 'Comp');
  assert.equal(all(project, 'UMLTransition').length, 23);
  assert.equal(viewsOf(result.diagram, 'UMLTransitionView').length, 23);
  assert.ok(within(box(viewOf(result.diagram, named(project, 'Watch'))), box(viewOf(result.diagram, running))));
  assert.equal(viewsOf(result.diagram, 'UMLNoteView')[0].text, 'idle note');
  assert.deepEqual(result.warnings, []);
});

// ───────────────────────── timing

test('timing diagram: robust/concise/binary/clock, @time and @participant blocks, anchors, messages, constraints', () => {
  const { result, project } = load(`@startuml
robust "Web Browser" as WB
concise "Web User" as WU
binary "Enable" as EN
clock "Clock" as CLK with period 50
WB has Idle,Processing,Waiting
@0
WU is Idle
WB is Idle
EN is low
@100
WU is Waiting
WB is Processing
EN is high
@300 as :done
WB is Waiting
@:done+100
WU is {-}
@WB
500 is Idle
+100 is Processing
WB -> WU : URL
WB@100 <-> @300 : {200 ms}
highlight 300 to 450 #Gold : busy
highlight 500 to 500 : mark {t = 500}
note top of WU : first
@enduml`);
  assert.equal(result.kind, 'timing');
  assert.equal(result.diagram._type, 'UMLTimingDiagram');
  const lifelines = all(project, 'UMLTimingLifeline');
  assert.deepEqual(lifelines.map((l) => l.name), ['Web Browser', 'Web User', 'Enable', 'Clock']);
  const wb = lifelines[0];
  assert.equal(wb.states, 'Idle,Processing,Waiting');
  assert.deepEqual(wb.timeSegments.map((s) => [s.state, s.duration]), [['Idle', 100], ['Processing', 200], ['Waiting', 200], ['Idle', 100], ['Processing', 50]]);
  assert.deepEqual(lifelines[1].timeSegments.map((s) => [s.state, s.duration]), [['Idle', 100], ['Waiting', 300], ['', 250]]);
  assert.equal(lifelines[2].states, 'high,low');
  assert.deepEqual(lifelines[3].timeSegments.slice(0, 3).map((s) => [s.state, s.duration]), [['high', 25], ['low', 25], ['high', 25]]);
  const total = (l) => l.timeSegments.reduce((s, x) => s + x.duration, 0);
  assert.ok(lifelines.every((l) => total(l) === total(wb)), 'every waveform covers the same time span');
  assert.deepEqual(all(project, 'UMLMessage').map((m) => m.name), ['URL']);
  assert.deepEqual(all(project, 'UMLDurationConstraint').map((c) => [c.name, c.specification]), [['', '200 ms'], ['', 'busy']]);
  assert.deepEqual(all(project, 'UMLTimeConstraint').map((c) => [c.name, c.specification]), [['mark', 't = 500']]);
  assert.ok(all(project, 'UMLTimeTick').length >= 6);
  assert.equal(viewsOf(result.diagram, 'UMLNoteView')[0].text, 'first');
  const views = viewsOf(result.diagram, 'UMLTimingLifelineView');
  assert.ok(views.every((v, i) => i === 0 || v.top > views[i - 1].top));
});

// ───────────────────────── ER

test('ER diagram: IE entities, identifying attributes, keys, nullability, lengths, cardinalities', () => {
  const { result, project, index } = load(`@startuml
hide circle
skinparam linetype ortho
entity "Customer" as cust {
  *id : number <<generated>>
  --
  *name : varchar(80)
  email : text <<unique>>
}
entity Order {
  * order_id : int <<PK>>
  --
  * customer_id : int <<FK>>
  note : text
}
entity Line
cust ||..o{ Order : places
Order |o--|{ Line
@enduml`);
  assert.equal(result.kind, 'er');
  assert.equal(result.owner._type, 'ERDDataModel');
  const cust = named(project, 'Customer');
  assert.deepEqual(cust.columns.map((c) => [c.name, c.type, c.length, c.primaryKey, c.nullable, c.unique]), [['id', 'number', '', true, false, false], ['name', 'varchar', '80', false, false, false], ['email', 'text', '', false, true, true]]);
  const order = named(project, 'Order');
  assert.deepEqual(order.columns.map((c) => [c.name, c.primaryKey, c.foreignKey]), [['order_id', true, false], ['customer_id', false, true], ['note', false, false]]);
  assert.equal(index.get(order.columns[1].referenceTo).name, 'id');
  const rels = all(project, 'ERDRelationship');
  assert.deepEqual(rels.map((r) => [ends(index, r).join('-'), r.end1.cardinality, r.end2.cardinality, r.identifying, r.name]), [['Customer-Order', '1', '0..*', false, 'places'], ['Order-Line', '0..1', '1..*', true, '']]);
  assert.equal(viewsOf(result.diagram, 'ERDEntityView').length, 3);
});

// ───────────────────────── mind map

test('mind map: OrgMode, arithmetic and Markdown notations, sides, multi-line nodes', () => {
  const org = load('@startmindmap\ntitle Plan\n* Launch\n** Products\n*** Catalogue\n*** Pricing\n**:Multi\nline;\nleft side\n** Risks\n*** Outage\n@endmindmap');
  assert.equal(org.result.kind, 'mindmap');
  assert.equal(org.result.diagram._type, 'MMMindmapDiagram');
  assert.equal(org.result.diagram.name, 'Plan');
  const root = org.result.owner.ownedElements.find((e) => e._type === 'MMNode');
  assert.equal(root.name, 'Launch');
  assert.deepEqual(root.ownedElements.map((c) => [c.name, c.direction]), [['Products', 'auto'], ['Multi\nline', 'auto'], ['Risks', 'left']]);
  assert.deepEqual(root.ownedElements[0].ownedElements.map((c) => c.name), ['Catalogue', 'Pricing']);
  assert.equal(viewsOf(org.result.diagram, 'MMEdgeView').length, 6);
  const rootView = viewOf(org.result.diagram, root);
  assert.ok(viewOf(org.result.diagram, root.ownedElements[2]).left < rootView.left, 'left side is drawn left');
  assert.ok(viewOf(org.result.diagram, root.ownedElements[0]).left > rootView.left);
  const plus = load('@startmindmap\n+ Root\n++ Right A\n+++ Deep\n-- Left A\n-- Left B\n@endmindmap');
  const r2 = plus.result.owner.ownedElements.find((e) => e._type === 'MMNode');
  assert.deepEqual(r2.ownedElements.map((c) => [c.name, c.direction]), [['Right A', 'right'], ['Left A', 'left'], ['Left B', 'left']]);
  const md = load('@startmindmap\n* Root\n  * Child\n    * Grandchild\n  * Child 2\n@endmindmap');
  const r3 = md.result.owner.ownedElements.find((e) => e._type === 'MMNode');
  assert.deepEqual(r3.ownedElements.map((c) => c.name), ['Child', 'Child 2']);
  assert.equal(r3.ownedElements[0].ownedElements[0].name, 'Grandchild');
});

test('short examples in the style of the PlantUML documentation pick the right diagram kind', () => {
  const kind = (text) => importPlantUml(`@startuml\n${text}\n@enduml`).kind;
  assert.equal(kind('Alice -> Bob: Authentication Request\nBob --> Alice: Authentication Response\nAlice <-- Bob: Another response'), 'sequence');
  assert.equal(kind('User -> (Start)\nUser --> (Use the application) : A small label\n:Main Admin: ---> (Use the application) : This is\\nyet another\\nlabel'), 'usecase');
  assert.equal(kind('Class01 <|-- Class02\nClass03 *-- Class04\nClass05 o-- Class06\nClass07 .. Class08\nClass09 -- Class10'), 'class');
  assert.equal(kind('Object <|-- ArrayList\nObject : equals()\nArrayList : Object[] elementData\nArrayList : size()'), 'class');
  assert.equal(kind('start\n:Hello world;\n:This is defined on\nseveral **lines**;\nstop'), 'activity');
  assert.equal(kind('[*] --> State1\nState1 --> [*]\nState1 : this is a string\nState1 -> State2\nState2 --> [*]'), 'state');
  assert.equal(kind('object firstObject\nobject "My Second Object" as o2\nfirstObject --> o2'), 'object');
  assert.equal(kind('Entity01 }|..|| Entity02\nEntity03 }o..o| Entity04'), 'er');
  assert.equal(kind('robust "Web Browser" as WB\n@0\nWB is Idle'), 'timing');
  assert.equal(kind('node node1\nnode node2\nnode1 -- node2 : label1'), 'deployment');
  const comp = load('@startuml\nDataAccess - [First Component]\n[First Component] ..> HTTP : use\ncomponent [Last\\ncomponent] as Comp4\n@enduml');
  assert.equal(comp.result.kind, 'component');
  assert.deepEqual(all(comp.project, 'UMLInterface').map((i) => i.name), ['DataAccess', 'HTTP'], 'undeclared names are interfaces');
  assert.equal(relationsOf(comp.project, 'UMLInterfaceRealization').length, 1);
  assert.equal(relationsOf(comp.project, 'UMLUsage').length, 1);
  assert.ok(named(comp.project, 'Last\ncomponent'));
  const uc = load('@startuml\nUser -> (Start)\n:Main Admin: ---> (Start) : This is\\nlabel\n@enduml');
  assert.deepEqual(all(uc.project, 'UMLActor').map((a) => a.name), ['User', 'Main Admin']);
  assert.equal(relationsOf(uc.project, 'UMLAssociation')[1].name, 'This is\nlabel');
  const cls = load('@startuml\nObject <|-- ArrayList\nObject : equals()\nArrayList : Object[] elementData\nArrayList : size()\n@enduml');
  assert.deepEqual(named(cls.project, 'ArrayList').attributes.map((a) => [a.name, a.type]), [['elementData', 'Object[]']]);
  assert.deepEqual(named(cls.project, 'Object').operations.map((o) => o.name), ['equals']);
});

// ───────────────────────── robustness

test('garbage input gives warnings, not crashes; unknown text and markers are rejected', () => {
  const messy = load('@startuml\nclass A {\n  +ok : int\n}\n%%% garbage ###\nA -> \nA --> B --> C\n{{{\n@enduml');
  assert.equal(messy.result.kind, 'class');
  assert.ok(messy.result.warnings.length >= 2);
  assert.ok(named(messy.project, 'A'));
  assert.throws(() => importPlantUml('hello world'), { message: 'interop.unsupportedPlantUml' });
  assert.throws(() => importPlantUml('@startfoo\nbar\n@endfoo'), (e) => e.message === 'interop.unsupportedPlantUml' && e.detail === '@startfoo');
  assert.throws(() => importPlantUml('@startuml\n\' only a comment\n@enduml'), { message: 'interop.empty' });
  // Random token soup never throws anything but the two known errors.
  const tokens = ['class', 'A', 'B', '-->', '<|--', '..>', '{', '}', ':', 'state', '[*]', 'if', '(x)', 'then', 'endif', ':act;', 'note', 'end', 'note left of A', '"q"', 'as', 'robust', '@0', 'is', 'alt', 'else', '|L|', 'fork', '[C]', '()', '<<s>>', '#red', '!define', '$x', 'entity', '||--o{', '*', '**', 'participant', '->', 'start', 'repeat', 'while', '(', ')', '[', ']'];
  let seed = 7;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let round = 0; round < 300; round += 1) {
    const lines = Array.from({ length: 1 + rand(8) }, () => Array.from({ length: 1 + rand(5) }, () => tokens[rand(tokens.length)]).join(' '));
    const text = `@startuml\n${lines.join('\n')}\n@enduml`;
    try {
      const result = importPlantUml(text);
      assert.ok(result.owner && result.diagram, text);
      exportPlantUml(adopt(result), result.diagram);
    } catch (error) {
      assert.ok(['interop.empty', 'interop.unsupportedPlantUml'].includes(error.message), `${text}\n${error.stack}`);
    }
  }
});

// ───────────────────────── round trips

const UML_TYPES = new Set(['UMLClassDiagram', 'UMLPackageDiagram', 'UMLObjectDiagram', 'UMLProfileDiagram', 'UMLUseCaseDiagram', 'UMLSequenceDiagram', 'UMLCommunicationDiagram', 'UMLTimingDiagram', 'UMLInteractionOverviewDiagram', 'UMLActivityDiagram', 'UMLStatechartDiagram', 'UMLComponentDiagram', 'UMLDeploymentDiagram', 'UMLCompositeStructureDiagram', 'UMLInformationFlowDiagram', 'ERDDiagram', 'MMMindmapDiagram']);

/** Element types of the views on a diagram (nodes and lines), realization kinds folded together. */
function signature(project, diagram) {
  const index = M.buildIndex(project);
  const nodes = {};
  const lines = {};
  for (const v of diagram.ownedViews) {
    const el = v.model ? index.get(v.model) : null;
    const key = (el ? el._type : v._type).replace(/\w*Realization$/, 'Realization');
    const bucket = v.tail || v.head ? lines : nodes;
    bucket[key] = (bucket[key] ?? 0) + 1;
  }
  const sort = (o) => Object.fromEntries(Object.entries(o).sort());
  return { nodes: sort(nodes), lines: sort(lines) };
}

test('export → import keeps the elements and relationships of every sample diagram', () => {
  const project = buildSample('en');
  const diagrams = M.allDiagrams(project).filter((d) => UML_TYPES.has(d._type));
  assert.equal(diagrams.length, UML_TYPES.size);
  for (const diagram of diagrams) {
    const text = exportPlantUml(project, diagram);
    assert.match(text, diagram._type === 'MMMindmapDiagram' ? /^@startmindmap\n[\s\S]*@endmindmap\n$/ : /^@startuml\n[\s\S]*@enduml\n$/, diagram._type);
    const result = importPlantUml(text, { language: 'en' });
    assert.deepEqual(result.warnings, [], `${diagram._type}\n${text}`);
    assert.equal(result.diagram.name, diagram.name, diagram._type);
    const copy = adopt(result);
    const before = signature(project, diagram);
    const after = signature(copy, result.diagram);
    if (diagram._type === 'UMLCommunicationDiagram') {
      // Written as a sequence diagram: the lifelines and the messages come back.
      assert.equal(result.diagram._type, 'UMLSequenceDiagram');
      assert.equal(after.nodes.UMLLifeline, before.nodes.UMLLifeline);
      const interaction = M.buildIndex(project).parent(diagram._id);
      assert.equal(after.lines.UMLMessage, interaction.messages.length);
      continue;
    }
    assert.equal(result.diagram._type, diagram._type);
    assert.deepEqual(after, before, `${diagram._type}\n${text}`);
    // A second trip gives the same text (ids aside, the writer is stable).
    const again = exportPlantUml(copy, result.diagram);
    const third = importPlantUml(again, { language: 'en' });
    assert.deepEqual(signature(adopt(third), third.diagram), before, `${diagram._type} (second trip)\n${again}`);
  }
});

test('round trip details: members, multiplicities, guards, transition labels, timing waveforms, mind map tree', () => {
  const project = buildSample('en');
  const diagram = (type) => M.allDiagrams(project).find((d) => d._type === type);
  const trip = (type) => { const result = importPlantUml(exportPlantUml(project, diagram(type))); return { result, copy: adopt(result) }; };
  const cls = trip('UMLClassDiagram');
  assert.deepEqual(named(cls.copy, 'Order').attributes.map((a) => [a.name, a.type, a.visibility, a.defaultValue]), [['id', 'long', 'private', ''], ['orderedAt', 'DateTime', 'private', ''], ['status', 'OrderStatus', 'private', 'NEW']]);
  assert.deepEqual(named(cls.copy, 'OrderStatus').literals.map((l) => l.name), ['NEW', 'PAID', 'SHIPPED', 'CANCELLED']);
  assert.equal(named(cls.copy, 'Product').isAbstract, true);
  const composition = all(cls.copy, 'UMLAssociation').find((a) => a.end1.aggregation === 'composite');
  assert.deepEqual([composition.end1.multiplicity, composition.end2.multiplicity, composition.end2.name], ['1', '1..*', 'lines']);
  const st = trip('UMLStatechartDiagram');
  const pay = all(st.copy, 'UMLTransition').find((t) => t.triggers === 'pay');
  assert.equal(pay.guard, 'amount > 0');
  assert.equal(named(st.copy, 'NEW').entryActivity, 'notifyCustomer()');
  const act = trip('UMLActivityDiagram');
  assert.deepEqual(all(act.copy, 'UMLControlFlow').map((f) => f.guard).filter(Boolean).sort(), all(project, 'UMLControlFlow').filter((f) => M.buildIndex(project).parent(f._id) === M.buildIndex(project).parent(diagram('UMLActivityDiagram')._id)).map((f) => f.guard).filter(Boolean).sort());
  const timing = trip('UMLTimingDiagram');
  const original = all(project, 'UMLTimingLifeline').map((l) => l.timeSegments.map((s) => [s.state, s.duration]));
  assert.deepEqual(all(timing.copy, 'UMLTimingLifeline').map((l) => l.timeSegments.map((s) => [s.state, s.duration])), original);
  const mm = trip('MMMindmapDiagram');
  const tree = (n) => [n.name, (n.ownedElements ?? []).filter((c) => c._type === 'MMNode').map(tree)];
  const source = M.elementsWhere(project, (e) => e._type === 'MMNode' && M.buildIndex(project).parent(e._id)._type === 'MMMindmap' && e.name === 'Shop Launch')[0];
  assert.deepEqual(tree(mm.result.owner.ownedElements.find((e) => e._type === 'MMNode')), tree(source));
});

test('export: every UML diagram type writes PlantUML, others are refused', () => {
  const project = buildSample('en');
  const seq = exportPlantUml(project, M.allDiagrams(project).find((d) => d._type === 'UMLSequenceDiagram'));
  assert.match(seq, /^ref over Customer, ui : Log In$/m);
  assert.match(seq, /^alt payment ok$/m);
  assert.match(seq, /^create participant order$/m);
  const comm = exportPlantUml(project, M.allDiagrams(project).find((d) => d._type === 'UMLCommunicationDiagram'));
  assert.match(comm, /checkout\(cart\)/);
  const timing = exportPlantUml(project, M.allDiagrams(project).find((d) => d._type === 'UMLTimingDiagram'));
  assert.match(timing, /^robust "payment" as payment$/m);
  assert.match(timing, /^payment has Idle,Authorizing,Captured$/m);
  assert.match(timing, /^@5\npayment is Captured\norder is PAID\npayment -> order : paid\(\)$/m);
  const mm = exportPlantUml(project, M.allDiagrams(project).find((d) => d._type === 'MMMindmapDiagram'));
  assert.match(mm, /^\+ Shop Launch$/m);
  assert.match(mm, /^-- Marketing$/m);
  const iod = exportPlantUml(project, M.allDiagrams(project).find((d) => d._type === 'UMLInteractionOverviewDiagram'));
  assert.match(iod, /<<ref>>/);
  const profile = exportPlantUml(project, M.allDiagrams(project).find((d) => d._type === 'UMLProfileDiagram'));
  assert.match(profile, /^\s*metaclass /m);
  assert.match(profile, /<<extension>>/);
  const composite = exportPlantUml(project, M.allDiagrams(project).find((d) => d._type === 'UMLCompositeStructureDiagram'));
  assert.match(composite, /<<part>>/);
  assert.match(composite, /^\s+port http$/m);
  assert.throws(() => exportPlantUml(project, M.allDiagrams(project).find((d) => d._type === 'BPMNDiagram')), { message: 'interop.unsupportedDiagram' });
});
